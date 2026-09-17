// =============================================================================
// Sysefen · Edge Function `teamleader-visita`
//
// Lleva una visita de toma de datos a Teamleader:
//   1. Se asegura de que el cliente esté en el CRM (si no, lo crea igual que
//      `teamleader-cliente`: contacto si es particular, empresa si no).
//   2. Abre una OPORTUNIDAD (deal) para ese cliente, con la ficha entera de la
//      visita escrita en el resumen del deal.
//   3. Añade esa misma ficha a las OBSERVACIONES del cliente, detrás de lo que
//      ya hubiera, con su fecha y su código.
//
// EL TEXTO DE LA FICHA lo manda la app ya montado: las preguntas y el orden
// viven en visitas-schemas.js, y no tiene sentido tener una copia aquí que se
// quede vieja. Quien llama es alguien de presupuestos con sesión, así que el
// texto es de fiar; aun así se recorta por si acaso.
//
// SI LA VISITA YA TIENE DEAL no se crea otro: se actualiza el que hay. Así
// reenviar una visita corregida no llena el embudo de duplicados.
//
// SECRETOS (Supabase → Edge Functions → Secrets):
//   TEAMLEADER_CLIENT_ID, TEAMLEADER_CLIENT_SECRET
//
// DESPLIEGUE: "Verify JWT" ACTIVADO.
//
// QUIÉN PUEDE: presupuestos, jefes y Administración.
//
// USO (POST con JSON):
//   { "visita_id": "uuid", "texto": "la ficha en texto plano" }
//   { "visita_id": "uuid", "texto": "...", "solo_ver": true }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const TOKEN = 'https://focus.teamleader.eu/oauth2/access_token';
const API = 'https://api.focus.teamleader.eu/';
const TOPE_TEXTO = 12000;      // lo que se manda de una visita
const TOPE_OBSERVACIONES = 30000;  // lo que se deja acumular en el cliente

const CATEGORIAS: Record<string, string> = {
  aerotermia: 'Aerotermia',
  solar: 'Paneles solares',
  electricidad: 'Electricidad',
  aire_acondicionado: 'Aire acondicionado',
};

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

// --- permiso del CRM (igual que en teamleader-cliente) -----------------------
// Se repite a propósito: cada función se despliega pegando un solo archivo, así
// que tiene que valerse por sí misma.
// deno-lint-ignore no-explicit-any
async function tokenValido(sb: any) {
  const { data: fila, error } = await sb.from('tl_oauth').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error('No se pudo leer el permiso del CRM: ' + error.message);
  if (!fila) throw new SinPermiso('Teamleader todavía no está conectado. Hazlo desde Ajustes → Teamleader.');
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
    throw new SinPermiso('El permiso de Teamleader ya no vale (' +
      (res.error_description || res.error || r.status) + '). Vuelve a conectarlo desde Ajustes.');
  }
  await sb.from('tl_oauth').upsert({
    id: 1, access_token: res.access_token,
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
  const res = texto ? (() => { try { return JSON.parse(texto); } catch { return { texto }; } })() : {};
  if (!r.ok) {
    const msg = res?.errors?.[0]?.title || res?.message || res?.error || ('error ' + r.status);
    throw new Error(`${metodo}: ${msg}`);
  }
  return res;
}

// --- el cliente en el CRM, creándolo si hiciera falta -------------------------
// deno-lint-ignore no-explicit-any
async function clienteEnCRM(sb: any, token: string, cli: any) {
  const esEmpresa = cli.tipo === 'empresa' || cli.tipo === 'comunidad' || cli.tl_tipo === 'company';
  if (cli.tl_id) return { id: cli.tl_id as string, tipo: esEmpresa ? 'company' : 'contact', creado: false };

  const nombre = limpio(cli.nombre);
  if (!nombre) throw new Error('Ese cliente no tiene nombre.');
  const email = esEmail(cli.email) ? limpio(cli.email).toLowerCase() : '';
  const tel = limpio(cli.telefono);
  const lista = esEmpresa ? 'companies.list' : 'contacts.list';

  let encontrado = '';
  if (email) {
    const r = await crm(token, lista, { filter: { email: { type: 'primary', email } }, page: { size: 5, number: 1 } });
    encontrado = r?.data?.[0]?.id || '';
  }
  if (!encontrado) {
    const r = await crm(token, lista, { filter: { term: nombre }, page: { size: 10, number: 1 } });
    // deno-lint-ignore no-explicit-any
    const igual = (r?.data || []).find((x: any) => {
      const suyo = esEmpresa ? limpio(x.name) : [limpio(x.first_name), limpio(x.last_name)].filter(Boolean).join(' ');
      return suyo.toLowerCase() === nombre.toLowerCase();
    });
    encontrado = igual?.id || '';
  }

  let id = encontrado;
  let creado = false;
  if (!id) {
    const direccion = limpio(cli.direccion), poblacion = limpio(cli.poblacion);
    const comun: Record<string, unknown> = {
      emails: email ? [{ type: 'primary', email }] : undefined,
      telephones: tel ? [{ type: esEmpresa ? 'phone' : 'mobile', number: tel }] : undefined,
      addresses: (direccion || poblacion)
        ? [{ type: 'primary', address: { line_1: direccion || poblacion, postal_code: null, city: poblacion || null, country: 'ES' } }]
        : undefined,
      language: 'es',
      tags: ['sysefen-app'],
    };
    if (esEmpresa) {
      const r = await crm(token, 'companies.add', { name: nombre, vat_number: limpio(cli.nif) || undefined, ...comun });
      id = r?.data?.id || '';
    } else {
      const trozos = nombre.split(/\s+/);
      const r = await crm(token, 'contacts.add', {
        first_name: trozos.length > 1 ? trozos[0] : undefined,
        last_name: trozos.length > 1 ? trozos.slice(1).join(' ') : nombre,
        national_identification_number: limpio(cli.nif) || undefined,
        ...comun,
      });
      id = r?.data?.id || '';
    }
    if (!id) throw new Error('El CRM no devolvió el id del cliente creado.');
    creado = true;
  }

  await sb.from('clientes_cache').update({
    tl_id: id, tl_tipo: esEmpresa ? 'company' : 'contact', tl_error: null,
    tl_at: new Date().toISOString(), pendiente_alta: false, sincronizado_at: new Date().toISOString(),
  }).eq('id', cli.id);

  return { id, tipo: esEmpresa ? 'company' : 'contact', creado };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

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
  const visitaId = limpio(b.visita_id);
  if (!/^[0-9a-f-]{36}$/i.test(visitaId)) return json({ error: 'Falta el id de la visita.' }, 400);
  const soloVer = b.solo_ver === true;
  const texto = limpio(b.texto).slice(0, TOPE_TEXTO);

  const { data: v, error: errV } = await sb.from('visitas')
    .select('id, codigo, fecha_visita, cliente_id, direccion, poblacion, observaciones, tl_deal_id')
    .eq('id', visitaId).maybeSingle();
  if (errV) return json({ error: 'No se pudo leer la visita: ' + errV.message }, 500);
  if (!v) return json({ error: 'Esa visita no existe.' }, 404);
  if (!v.cliente_id) return json({ error: 'Esa visita no tiene cliente. Ponle uno antes de enviarla.' }, 400);

  const { data: cli } = await sb.from('clientes_cache')
    .select('id, nombre, tipo, tl_tipo, tl_id, nif, telefono, email, direccion, poblacion')
    .eq('id', v.cliente_id).maybeSingle();
  if (!cli) return json({ error: 'No se encuentra el cliente de esa visita.' }, 404);

  const { data: fichas } = await sb.from('visita_fichas').select('categoria').eq('visita_id', v.id);
  const cats = (fichas || []).map((f) => CATEGORIAS[String(f.categoria)] || String(f.categoria));
  const donde = [limpio(v.direccion), limpio(v.poblacion)].filter(Boolean).join(', ');
  const titulo = [cats.join(' + ') || 'Presupuesto', limpio(v.poblacion) || limpio(cli.nombre)]
    .filter(Boolean).join(' · ');
  const fecha = String(v.fecha_visita || '').slice(0, 10);
  const cabecera = `Visita ${limpio(v.codigo) || ''} · ${fecha}${donde ? ' · ' + donde : ''}`.trim();
  const resumen = [cabecera, '', texto, limpio(v.observaciones) ? '\nObservaciones: ' + limpio(v.observaciones) : '']
    .join('\n').trim().slice(0, TOPE_TEXTO);

  if (soloVer) {
    return json({ ok: true, titulo, cliente: cli.nombre, ya_tenia_deal: !!v.tl_deal_id, caracteres: resumen.length });
  }

  let token: string;
  try { token = await tokenValido(sb); }
  catch (e) {
    const msg = (e as Error).message;
    await sb.from('visitas').update({ sync_estado: 'error', sync_error: msg }).eq('id', v.id);
    return json({ error: msg, sin_permiso: e instanceof SinPermiso }, e instanceof SinPermiso ? 409 : 502);
  }

  await sb.from('visitas').update({ sync_estado: 'enviando', sync_error: null }).eq('id', v.id);

  try {
    // --- 1 · el cliente ---------------------------------------------------------
    const quien = await clienteEnCRM(sb, token, cli);

    // --- 2 · la oportunidad -----------------------------------------------------
    let dealId = limpio(v.tl_deal_id);
    let dealCreado = false;
    if (dealId) {
      await crm(token, 'deals.update', { id: dealId, title: titulo, summary: resumen });
    } else {
      const r = await crm(token, 'deals.create', {
        lead: { customer: { type: quien.tipo, id: quien.id } },
        title: titulo,
        summary: resumen,
      });
      dealId = r?.data?.id || '';
      if (!dealId) throw new Error('El CRM no devolvió el id de la oportunidad.');
      dealCreado = true;
    }

    // --- 3 · las observaciones del cliente --------------------------------------
    // Se lee lo que hay y se añade detrás: `update` pisa el campo entero, así que
    // sin leer antes se borraría lo que hubiese escrito alguien a mano.
    let observaciones = '';
    try {
      const info = await crm(token, quien.tipo === 'company' ? 'companies.info' : 'contacts.info', { id: quien.id });
      observaciones = limpio(info?.data?.remarks);
    } catch (_) { /* si no se puede leer, se escribe solo lo nuevo */ }

    const bloque = `--- ${cabecera} (app Sysefen) ---\n${texto}`;
    const yaEstaba = observaciones.includes(cabecera);
    if (!yaEstaba) {
      let nuevas = observaciones ? observaciones + '\n\n' + bloque : bloque;
      // Si se va de largo, se recorta por delante: lo viejo pesa menos que lo
      // de ahora, y la ficha entera sigue estando en el deal y en la app.
      if (nuevas.length > TOPE_OBSERVACIONES) nuevas = '[…]\n' + nuevas.slice(nuevas.length - TOPE_OBSERVACIONES);
      await crm(token, quien.tipo === 'company' ? 'companies.update' : 'contacts.update',
        { id: quien.id, remarks: nuevas });
    }

    await sb.from('visitas').update({
      tl_deal_id: dealId,
      sync_estado: 'sincronizada',
      sync_error: null,
      sync_at: new Date().toISOString(),
    }).eq('id', v.id);

    return json({
      ok: true, deal_id: dealId, deal_creado: dealCreado, titulo,
      cliente_creado: quien.creado, observaciones_actualizadas: !yaEstaba,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from('visitas').update({ sync_estado: 'error', sync_error: msg }).eq('id', v.id);
    return json({ error: msg }, 502);
  }
});
