// =============================================================================
// Sysefen · Edge Function `teamleader-ventas`
//
// Copia en la app las OPORTUNIDADES de Teamleader (tabla tl_oportunidades,
// sql/etapa112) para las estadísticas: lo ganado por meses, por embudo y por
// responsable, lo perdido y por qué, y lo que sigue abierto en cada fase.
// Enzo, 17-11-2026: «todo lo de estadísticas, donde estén todas las gráficas».
// Su informe guardado en Teamleader es el «Informe mensual de ventas»:
// oportunidades ganadas por mes de aceptación, importe sin IVA y número.
//
// Solo LEE de Teamleader. No cambia nada allí.
//
// SECRETOS: TEAMLEADER_CLIENT_ID, TEAMLEADER_CLIENT_SECRET, AVISOS_CLAVE.
// DESPLIEGUE: "Verify JWT" DESACTIVADO (el cron entra con x-clave; la sesión
// de la app se comprueba aquí dentro).
// QUIÉN PUEDE: presupuestos y Administración (o el cron).
//
// USO (POST con JSON):
//   {}                      trae lo cambiado desde la última pasada
//   { "todo": true }        vuelve a traerlas todas (por tandas: mira `quedan`)
//   { "accion": "probar" }  enseña dos oportunidades tal cual llegan, sin guardar
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const TOKEN = 'https://focus.teamleader.eu/oauth2/access_token';
const API = 'https://api.focus.teamleader.eu/';

// CORS: la llama también la app desde el navegador («Mirar ahora» los clientes
// de la web), no solo la tarea programada. Sin esto el navegador cortaba la
// llamada en el preflight.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const limpio = (s: unknown) => String(s ?? '').trim();

function mismaClave(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

class SinPermiso extends Error {}

// deno-lint-ignore no-explicit-any
async function tokenValido(sb: any) {
  const { data: fila, error } = await sb.from('tl_oauth').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error('No se pudo leer el permiso del CRM: ' + error.message);
  if (!fila) throw new SinPermiso('Teamleader todavía no está conectado.');
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
  // Teamleader admite 200 peticiones por minuto (ventana deslizante) para toda la
  // integración: la app y los crons de sincronización comparten el cupo. Si contesta
  // 429 se espera hasta x-ratelimit-reset (como mucho 8 s) y se reintenta, dos veces
  // (Xavi, 9-11-2026: le salió el aviso al buscar un cliente en el CRM).
  const pedir = () => fetch(API + metodo, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(cuerpo ?? {}),
  });
  let r = await pedir();
  for (let intento = 0; r.status === 429 && intento < 2; intento++) {
    const reset = Date.parse(r.headers.get('x-ratelimit-reset') || '');
    const espera = Math.min(Math.max((Number.isNaN(reset) ? 0 : reset - Date.now()) + 250, 1000), 8000);
    await r.text().catch(() => {});
    await new Promise((f) => setTimeout(f, espera));
    r = await pedir();
  }
  const texto = await r.text();
  const res = texto ? (() => { try { return JSON.parse(texto); } catch { return { texto }; } })() : {};
  if (!r.ok) {
    const msg = r.status === 429 ? 'Teamleader está limitando las peticiones ahora mismo (200 por minuto para toda la app): espera unos segundos y vuelve a intentarlo' : (res?.errors?.[0]?.title || res?.message || res?.error || ('error ' + r.status));
    throw new Error(`${metodo}: ${msg}`);
  }
  return res;
}


const MAX_PAGINAS = 25;          // por llamada: 2.500 oportunidades
const TOPE_MS = 100_000;

// deno-lint-ignore no-explicit-any
async function lista(token: string, metodo: string, cuerpo: any = {}, max = 10): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const fuera: any[] = [];
  for (let p = 1; p <= max; p++) {
    const r = await crm(token, metodo, Object.assign({}, cuerpo, { page: { size: 100, number: p } }));
    // deno-lint-ignore no-explicit-any
    const d = (r?.data || []) as any[];
    fuera.push(...d);
    if (d.length < 100) break;
  }
  return fuera;
}
/** Una lista que puede no existir en esta cuenta o no estar permitida: vacía y se sigue. */
// deno-lint-ignore no-explicit-any
async function listaSuave(token: string, metodo: string, cuerpo: any = {}): Promise<any[]> {
  try { return await lista(token, metodo, cuerpo); } catch (_) { return []; }
}
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  const t0 = Date.now();

  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  if (CLAVE.length < 24) return json({ error: 'Falta el secreto AVISOS_CLAVE.' }, 500);
  const esElCron = mismaClave(req.headers.get('x-clave') || '', CLAVE);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* sin cuerpo */ }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  if (!esElCron) {
    const autorizacion = req.headers.get('Authorization') || '';
    if (!autorizacion) return json({ error: 'No autorizado.' }, 401);
    const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: autorizacion } },
    });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return json({ error: 'Sesión no válida.' }, 401);
    const { data: yo } = await sb.from('empleados').select('rol').eq('user_id', user.id).maybeSingle();
    if (!yo || !['presupuestos', 'admin'].includes(String(yo.rol))) {
      return json({ error: 'Solo presupuestos y Administración.' }, 403);
    }
  }

  let token: string;
  try { token = await tokenValido(sb); }
  catch (e) {
    return json({ error: (e as Error).message, sin_permiso: e instanceof SinPermiso },
      e instanceof SinPermiso ? 409 : 502);
  }

  try {
    if (b.accion === 'probar') {
      const r = await crm(token, 'deals.list', { page: { size: 2, number: 1 }, sort: [{ field: 'created_at', order: 'desc' }] });
      // deno-lint-ignore no-explicit-any
      const ganada = await crm(token, 'deals.list', { filter: { status: ['won'] }, page: { size: 1, number: 1 } }).catch((e: any) => ({ error: String(e?.message || e) }));
      // deno-lint-ignore no-explicit-any
      const info = r?.data?.[0]?.id ? await crm(token, 'deals.info', { id: r.data[0].id }).catch((e: any) => ({ error: String(e?.message || e) })) : null;
      return json({ ok: true, lista: r, ganada, info,
        embudos: await listaSuave(token, 'dealPipelines.list'), fases: (await listaSuave(token, 'dealPhases.list')).slice(0, 40),
        motivos: await listaSuave(token, 'lostReasons.list'), entidades: await listaSuave(token, 'departments.list'),
        usuarios: (await listaSuave(token, 'users.list')).map((u) => ({ id: u.id, first_name: u.first_name, last_name: u.last_name, status: u.status })) });
    }

    // --- las tablas pequeñas: embudos, fases, motivos, empresas y usuarios ---------
    const [embudos, motivos, entidades, usuarios] = await Promise.all([
      listaSuave(token, 'dealPipelines.list'), listaSuave(token, 'lostReasons.list'),
      listaSuave(token, 'departments.list'), listaSuave(token, 'users.list'),
    ]);
    const nombreEmbudo: Record<string, string> = {}; embudos.forEach((e) => { nombreEmbudo[e.id] = limpio(e.name); });
    // Las fases, embudo a embudo: así se sabe de qué embudo es cada una.
    // deno-lint-ignore no-explicit-any
    const fase: Record<string, any> = {};
    for (const e of embudos) {
      const fs = await listaSuave(token, 'dealPhases.list', { filter: { deal_pipeline_id: e.id } });
      fs.forEach((f, i) => { fase[f.id] = { nombre: limpio(f.name), embudo_id: e.id, orden: i, prob: num(f.probability) }; });
    }
    if (!Object.keys(fase).length) (await listaSuave(token, 'dealPhases.list')).forEach((f, i) => { fase[f.id] = { nombre: limpio(f.name), embudo_id: null, orden: i, prob: num(f.probability) }; });
    const nombreMotivo: Record<string, string> = {}; motivos.forEach((m) => { nombreMotivo[m.id] = limpio(m.name); });
    const nombreEntidad: Record<string, string> = {}; entidades.forEach((d) => { nombreEntidad[d.id] = limpio(d.name); });
    const nombreUsuario: Record<string, string> = {}; usuarios.forEach((u) => { nombreUsuario[u.id] = [limpio(u.first_name), limpio(u.last_name)].filter(Boolean).join(' '); });

    // --- los nombres de los clientes que ya están en la app --------------------------
    const nombreCliente: Record<string, string> = {}, clienteApp: Record<string, string> = {};
    const { data: cl } = await sb.from('clientes_cache').select('id, tl_id, nombre').not('tl_id', 'is', null).range(0, 9999);
    // deno-lint-ignore no-explicit-any
    (cl || []).forEach((c: any) => { nombreCliente[String(c.tl_id)] = c.nombre; clienteApp[String(c.tl_id)] = c.id; });
    try {
      const { data: fus } = await sb.from('clientes_fusionados').select('tl_id, cliente_id, nombre').not('tl_id', 'is', null);
      // deno-lint-ignore no-explicit-any
      (fus || []).forEach((f: any) => { if (!clienteApp[String(f.tl_id)]) { clienteApp[String(f.tl_id)] = f.cliente_id; nombreCliente[String(f.tl_id)] = f.nombre; } });
    } catch (_) { /* sin la etapa 111: se sigue */ }

    // --- las oportunidades -----------------------------------------------------------
    const todo = b.todo === true;
    const { data: aj } = await sb.from('ajustes').select('valor').eq('clave', 'tl_ventas_desde').maybeSingle();
    const desde = todo ? null : (limpio(aj?.valor) || null);
    const pagIni = Math.max(1, Number(b.pagina) || 1);
    const ahora = new Date().toISOString();
    let guardadas = 0, pag = pagIni, quedan = false, masNuevo = desde || '';
    for (; pag < pagIni + MAX_PAGINAS; pag++) {
      if (Date.now() - t0 > TOPE_MS) { quedan = true; break; }
      // deno-lint-ignore no-explicit-any
      const cuerpo: any = { page: { size: 100, number: pag }, sort: [{ field: 'created_at', order: 'asc' }] };
      if (desde) cuerpo.filter = { updated_since: desde };
      const r = await crm(token, 'deals.list', cuerpo);
      // deno-lint-ignore no-explicit-any
      const ds = (r?.data || []) as any[];
      if (!ds.length) break;
      const filas = ds.map((d) => {
        const f = fase[d.current_phase?.id || ''] || null;
        const embudoId = d.pipeline?.id || (f && f.embudo_id) || null;
        const cli = d.lead?.customer || null;
        if (d.updated_at && String(d.updated_at) > masNuevo) masNuevo = String(d.updated_at);
        return {
          tl_id: d.id, titulo: limpio(d.title), referencia: limpio(d.reference) || null,
          estado: limpio(d.status) || 'open',
          importe: num(d.estimated_value?.amount), importe_ponderado: num(d.weighted_value?.amount), probabilidad: num(d.estimated_probability),
          cliente_tl_id: cli?.id || null, cliente_tipo: cli?.type || null,
          cliente_id: (cli?.id && clienteApp[cli.id]) || null, cliente_nombre: (cli?.id && nombreCliente[cli.id]) || null,
          fase_id: d.current_phase?.id || null, fase: f ? f.nombre : null, fase_orden: f ? f.orden : null,
          embudo_id: embudoId, embudo: embudoId ? (nombreEmbudo[embudoId] || null) : null,
          responsable_id: d.responsible_user?.id || null, responsable: d.responsible_user?.id ? (nombreUsuario[d.responsible_user.id] || null) : null,
          entidad_id: d.department?.id || null, entidad: d.department?.id ? (nombreEntidad[d.department.id] || null) : null,
          motivo_perdida: d.lost_reason?.reason?.id ? (nombreMotivo[d.lost_reason.reason.id] || null) : null,
          motivo_perdida_nota: limpio(d.lost_reason?.remark) || null,
          creado_at: d.created_at || null, cerrado_at: d.closed_at || null, cierre_previsto: d.estimated_closing_date || null,
          actualizado_at: d.updated_at || null, web_url: d.web_url || null, datos: d, sincronizado_at: ahora,
        };
      });
      const { error } = await sb.from('tl_oportunidades').upsert(filas, { onConflict: 'tl_id' });
      if (error) return json({ error: 'No se pudieron guardar: ' + error.message }, 500);
      guardadas += filas.length;
      if (ds.length < 100) { pag++; break; }
      if (pag === pagIni + MAX_PAGINAS - 1) quedan = true;
    }

    // --- los nombres que faltan: clientes de Teamleader que no están en la app -------
    let nombrados = 0;
    if (!quedan) {
      const { data: sin } = await sb.from('tl_oportunidades').select('cliente_tl_id, cliente_tipo').is('cliente_nombre', null).not('cliente_tl_id', 'is', null).limit(1000);
      const vistos = new Set<string>();
      // deno-lint-ignore no-explicit-any
      for (const x of (sin || []) as any[]) {
        if (vistos.has(x.cliente_tl_id)) continue; vistos.add(x.cliente_tl_id);
        if (Date.now() - t0 > TOPE_MS || vistos.size > 90) { quedan = true; break; }
        let nombre = '';
        try {
          const esEmpresa = x.cliente_tipo === 'company';
          const info = (await crm(token, esEmpresa ? 'companies.info' : 'contacts.info', { id: x.cliente_tl_id }))?.data;
          nombre = esEmpresa ? limpio(info?.name) : [limpio(info?.first_name), limpio(info?.last_name)].filter(Boolean).join(' ');
        } catch (_) { nombre = ''; }
        // Si ya no existe en Teamleader, se deja dicho para no preguntarlo en cada pasada.
        await sb.from('tl_oportunidades').update({ cliente_nombre: nombre || '(sin nombre en Teamleader)' }).eq('cliente_tl_id', x.cliente_tl_id).is('cliente_nombre', null);
        nombrados++;
      }
    }

    // La marca de agua solo avanza cuando la tanda ha terminado entera.
    const paginasQuedan = guardadas > 0 && pag >= pagIni + MAX_PAGINAS;
    if (!paginasQuedan && masNuevo) await sb.from('ajustes').upsert({ clave: 'tl_ventas_desde', valor: masNuevo, updated_at: ahora });
    const { count } = await sb.from('tl_oportunidades').select('tl_id', { count: 'exact', head: true });
    return json({ ok: true, guardadas, nombrados, total: count ?? null, desde, quedan: quedan || paginasQuedan, pagina_siguiente: paginasQuedan ? pag : null });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
