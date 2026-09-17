// =============================================================================
// Sysefen · Edge Function `teamleader-cliente`
//
// Crea en Teamleader el cliente que se acaba de dar de alta en la agenda de
// presupuestos, y guarda el id que devuelve el CRM en `clientes_cache.tl_id`.
//
//   particular            -> contacto (contacts.add)
//   empresa o comunidad   -> empresa  (companies.add)
//
// ANTES DE CREAR NADA lo busca en el CRM: primero por email, si lo tiene, y si
// no por nombre. Si ya está, se engancha al que hay. Así no se llena el CRM de
// duplicados por dar de alta dos veces al mismo.
//
// EL PERMISO sale de la tabla `tl_oauth`, que llena `teamleader-oauth`. Si el
// permiso de ahora está caducado, se renueva aquí y se guarda el nuevo: ojo,
// que Teamleader cambia también el refresh token en cada renovación.
//
// SECRETOS (Supabase → Edge Functions → Secrets):
//   TEAMLEADER_CLIENT_ID, TEAMLEADER_CLIENT_SECRET
//
// DESPLIEGUE: "Verify JWT" ACTIVADO.
//
// QUIÉN PUEDE: presupuestos, jefes y Administración.
//
// USO (POST con JSON):
//   { "cliente_id": "uuid" }
//   { "cliente_id": "uuid", "solo_ver": true }   dice qué haría, sin tocar el CRM
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const TOKEN = 'https://focus.teamleader.eu/oauth2/access_token';
const API = 'https://api.focus.teamleader.eu/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const limpio = (s: unknown) => String(s ?? '').trim();

class SinPermiso extends Error {}

// deno-lint-ignore no-explicit-any
async function tokenValido(sb: any) {
  const { data: fila, error } = await sb.from('tl_oauth').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error('No se pudo leer el permiso del CRM: ' + error.message);
  if (!fila) throw new SinPermiso('Teamleader todavía no está conectado. Hazlo desde Ajustes → Teamleader.');

  // Un minuto de margen: si va a caducar mientras hablamos, se renueva ya.
  if (new Date(fila.expira_at).getTime() - Date.now() > 60_000) return fila.access_token as string;

  const CLIENT_ID = Deno.env.get('TEAMLEADER_CLIENT_ID') || '';
  const CLIENT_SECRET = Deno.env.get('TEAMLEADER_CLIENT_SECRET') || '';
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Faltan los secretos de Teamleader en Supabase.');

  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: fila.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.access_token) {
    // Si el permiso ya no vale (lo revocaron, o se gastó el refresh), hay que
    // volver a conectar a mano: no se puede arreglar solo.
    throw new SinPermiso('El permiso de Teamleader ya no vale (' +
      (res.error_description || res.error || r.status) + '). Vuelve a conectarlo desde Ajustes.');
  }
  await sb.from('tl_oauth').upsert({
    id: 1,
    access_token: res.access_token,
    // Teamleader devuelve un refresh nuevo en cada renovación; si no viniera,
    // se conserva el que había.
    refresh_token: res.refresh_token || fila.refresh_token,
    expira_at: new Date(Date.now() + (Number(res.expires_in) || 3600) * 1000).toISOString(),
    actualizado_at: new Date().toISOString(),
  });
  return res.access_token as string;
}

async function crm(token: string, metodo: string, cuerpo: unknown) {
  const r = await fetch(API + metodo, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(cuerpo ?? {}),
  });
  const texto = await r.text();
  // Algunos endpoints responden 204 sin cuerpo.
  const res = texto ? (() => { try { return JSON.parse(texto); } catch { return { texto }; } })() : {};
  if (!r.ok) {
    const msg = res?.errors?.[0]?.title || res?.message || res?.error || ('error ' + r.status);
    throw new Error(`${metodo}: ${msg}`);
  }
  return res;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  // --- quién llama ------------------------------------------------------------
  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
  const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: 'Sesión no válida.' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: yo } = await sb.from('empleados').select('id, rol').eq('user_id', user.id).maybeSingle();
  if (!yo) return json({ error: 'No se encuentra tu ficha de empleado.' }, 403);
  if (!['presupuestos', 'jefe', 'admin'].includes(String(yo.rol))) {
    return json({ error: 'Solo presupuestos, jefes y Administración.' }, 403);
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const clienteId = limpio(b.cliente_id);
  if (!/^[0-9a-f-]{36}$/i.test(clienteId)) return json({ error: 'Falta el id del cliente.' }, 400);
  const soloVer = b.solo_ver === true;

  const { data: cli, error: errCli } = await sb.from('clientes_cache')
    .select('id, nombre, tipo, tl_tipo, tl_id, nif, telefono, email, direccion, poblacion, nota')
    .eq('id', clienteId).maybeSingle();
  if (errCli) return json({ error: 'No se pudo leer el cliente: ' + errCli.message }, 500);
  if (!cli) return json({ error: 'Ese cliente no existe.' }, 404);
  if (cli.tl_id) {
    return json({ ok: true, ya_estaba: true, tl_id: cli.tl_id, tl_tipo: cli.tl_tipo, nombre: cli.nombre });
  }

  // Un particular es un contacto; una empresa o una comunidad de vecinos, una
  // empresa. La comunidad no es una persona: tiene su CIF y su presidente.
  const esEmpresa = cli.tipo === 'empresa' || cli.tipo === 'comunidad' || cli.tl_tipo === 'company';
  const nombre = limpio(cli.nombre);
  if (!nombre) return json({ error: 'Ese cliente no tiene nombre.' }, 400);
  const email = esEmail(cli.email) ? limpio(cli.email).toLowerCase() : '';
  const tel = limpio(cli.telefono);

  if (soloVer) {
    return json({ ok: true, haria: esEmpresa ? 'companies.add' : 'contacts.add', nombre, email, telefono: tel });
  }

  let token: string;
  try { token = await tokenValido(sb); }
  catch (e) {
    const msg = (e as Error).message;
    await sb.from('clientes_cache').update({ tl_error: msg }).eq('id', cli.id);
    return json({ error: msg, sin_permiso: e instanceof SinPermiso }, e instanceof SinPermiso ? 409 : 502);
  }

  try {
    const lista = esEmpresa ? 'companies.list' : 'contacts.list';

    // --- ¿ya está en el CRM? --------------------------------------------------
    let encontrado = '';
    if (email) {
      const r = await crm(token, lista, { filter: { email: { type: 'primary', email } }, page: { size: 5, number: 1 } });
      encontrado = r?.data?.[0]?.id || '';
    }
    if (!encontrado) {
      const r = await crm(token, lista, { filter: { term: nombre }, page: { size: 10, number: 1 } });
      // Por nombre solo vale si coincide entero: "Juan" no puede engancharse a
      // "Juan Carlos Pérez" por ser lo primero que sale.
      // deno-lint-ignore no-explicit-any
      const igual = (r?.data || []).find((x: any) => {
        const suyo = esEmpresa ? limpio(x.name) : [limpio(x.first_name), limpio(x.last_name)].filter(Boolean).join(' ');
        return suyo.toLowerCase() === nombre.toLowerCase();
      });
      encontrado = igual?.id || '';
    }

    let tlId = encontrado;
    let creado = false;

    // --- crearlo --------------------------------------------------------------
    if (!tlId) {
      const direccion = limpio(cli.direccion);
      const poblacion = limpio(cli.poblacion);
      const señas = direccion || poblacion
        ? [{ type: 'primary', address: { line_1: direccion || poblacion, postal_code: null, city: poblacion || null, country: 'ES' } }]
        : undefined;
      const comun: Record<string, unknown> = {
        emails: email ? [{ type: 'primary', email }] : undefined,
        telephones: tel ? [{ type: esEmpresa ? 'phone' : 'mobile', number: tel }] : undefined,
        addresses: señas,
        language: 'es',
        remarks: limpio(cli.nota) || undefined,
        tags: ['sysefen-app'],
      };
      if (esEmpresa) {
        const r = await crm(token, 'companies.add', {
          name: nombre,
          vat_number: limpio(cli.nif) || undefined,
          ...comun,
        });
        tlId = r?.data?.id || '';
      } else {
        // Teamleader pide apellido; el nombre de pila es opcional. Lo que se
        // escribe en la app es "Nombre Apellidos" de corrido.
        const trozos = nombre.split(/\s+/);
        const primero = trozos.length > 1 ? trozos[0] : '';
        const resto = trozos.length > 1 ? trozos.slice(1).join(' ') : nombre;
        const r = await crm(token, 'contacts.add', {
          first_name: primero || undefined,
          last_name: resto,
          national_identification_number: limpio(cli.nif) || undefined,
          ...comun,
        });
        tlId = r?.data?.id || '';
      }
      if (!tlId) throw new Error('El CRM no devolvió el id del cliente creado.');
      creado = true;
    }

    const { error: errGuardar } = await sb.from('clientes_cache').update({
      tl_id: tlId,
      tl_tipo: esEmpresa ? 'company' : 'contact',
      tl_error: null,
      tl_at: new Date().toISOString(),
      pendiente_alta: false,
      sincronizado_at: new Date().toISOString(),
    }).eq('id', cli.id);
    if (errGuardar) {
      return json({ error: 'Se creó en el CRM pero no se pudo guardar el enlace: ' + errGuardar.message }, 500);
    }

    return json({
      ok: true, creado, enganchado: !creado, tl_id: tlId,
      tl_tipo: esEmpresa ? 'company' : 'contact', nombre,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from('clientes_cache').update({ tl_error: msg }).eq('id', cli.id);
    return json({ error: msg }, 502);
  }
});
