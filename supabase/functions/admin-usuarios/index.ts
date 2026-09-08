// =============================================================================
// Sysefen · Edge Function `admin-usuarios`
//
// Deja que la cuenta de Administración cambie el PIN de cualquier persona y dé
// de alta el acceso de un empleado nuevo, SIN que la clave maestra
// (service_role) salga nunca de Supabase.
//
// Cómo funciona la seguridad, de fuera hacia dentro:
//   1. Supabase solo ejecuta la función si llega un JWT válido (verify_jwt).
//   2. Aquí se comprueba QUIÉN es ese JWT y que su fila en `empleados` tiene
//      rol = 'admin'. Un operario con sesión válida se queda en el paso 2.
//   3. Solo entonces se usa la clave service_role, que Supabase inyecta como
//      variable de entorno. No hay que copiarla ni pegarla en ningún sitio, y
//      no está dentro de la app: aunque alguien descargue el código del móvil,
//      no encuentra nada con lo que saltarse los permisos.
//
// El PIN visible son 4 cifras; la contraseña real es <PIN>sysefen, igual que en
// supabase-auth.js. Si cambias esa regla, cámbiala en los dos sitios.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const claveInterna = (pin: string) => String(pin).trim() + 'sysefen';
const pinValido = (pin: unknown) => typeof pin === 'string' && /^\d{4}$/.test(pin.trim());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const URL_SB = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);

  // --- 1 · quién llama -------------------------------------------------------
  const comoUsuario = createClient(URL_SB, ANON, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user }, error: errUser } = await comoUsuario.auth.getUser();
  if (errUser || !user) return json({ error: 'Sesión no válida.' }, 401);

  // --- 2 · ¿es Administración? ----------------------------------------------
  const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
  const { data: perfil } = await admin
    .from('empleados').select('id, rol, nombre')
    .eq('user_id', user.id).maybeSingle();
  if (!perfil || perfil.rol !== 'admin') {
    return json({ error: 'Solo Administración puede hacer esto.' }, 403);
  }

  // --- 3 · qué hay que hacer -------------------------------------------------
  let cuerpo: Record<string, unknown>;
  try { cuerpo = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const accion = String(cuerpo.accion || '');
  const pin = cuerpo.pin;

  if (!pinValido(pin)) return json({ error: 'El PIN son 4 números.' }, 400);

  // Cambiar el PIN de una persona que ya tiene acceso.
  if (accion === 'cambiar_pin') {
    const empleadoId = String(cuerpo.empleado_id || '');
    if (!empleadoId) return json({ error: 'Falta el empleado.' }, 400);

    const { data: emp } = await admin
      .from('empleados').select('id, nombre, user_id, email')
      .eq('id', empleadoId).maybeSingle();
    if (!emp) return json({ error: 'Ese empleado no existe.' }, 404);
    if (!emp.user_id) {
      return json({ error: 'Esa persona todavía no tiene acceso creado. Créaselo primero.' }, 409);
    }

    const { error } = await admin.auth.admin.updateUserById(emp.user_id, {
      password: claveInterna(pin as string),
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, nombre: emp.nombre });
  }

  // Crear el acceso de un empleado que ya tiene perfil pero no puede entrar.
  if (accion === 'crear_acceso') {
    const empleadoId = String(cuerpo.empleado_id || '');
    if (!empleadoId) return json({ error: 'Falta el empleado.' }, 400);

    const { data: emp } = await admin
      .from('empleados').select('id, nombre, user_id, email')
      .eq('id', empleadoId).maybeSingle();
    if (!emp) return json({ error: 'Ese empleado no existe.' }, 404);
    if (emp.user_id) {
      return json({ error: 'Esa persona ya tiene acceso. Usa "cambiar PIN".' }, 409);
    }
    const email = String(cuerpo.email || emp.email || '').trim().toLowerCase();
    if (!email) return json({ error: 'Falta el email de acceso.' }, 400);

    const { data: creado, error } = await admin.auth.admin.createUser({
      email,
      password: claveInterna(pin as string),
      email_confirm: true,
    });
    if (error || !creado?.user) return json({ error: error?.message || 'No se pudo crear el acceso.' }, 400);

    // Vincular el usuario de Auth con el perfil, y guardar el email si faltaba.
    const { error: errLink } = await admin
      .from('empleados')
      .update({ user_id: creado.user.id, email })
      .eq('id', emp.id);
    if (errLink) {
      // El usuario existe pero no quedó vinculado: se deshace para no dejar un
      // acceso huérfano que nadie ve desde la app.
      await admin.auth.admin.deleteUser(creado.user.id);
      return json({ error: 'Acceso creado pero no se pudo vincular: ' + errLink.message }, 400);
    }
    return json({ ok: true, nombre: emp.nombre, email });
  }

  return json({ error: 'Acción desconocida.' }, 400);
});
