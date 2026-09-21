// =============================================================================
// Sysefen · Edge Function `teamleader-leads`
//
// Se trae del CRM los clientes que han entrado por la web. La web de Sysefen
// genera un presupuesto orientativo y manda el cliente a Teamleader; como esa
// web la lleva otro, aquí no se espera a que avise: se mira el CRM cada cuarto
// de hora (sql/etapa32) y se copian a la app los que falten.
//
// QUÉ SE TRAE: contactos y empresas añadidos DESPUÉS de la última pasada que no
// lleven la etiqueta `sysefen-app` (ésa se la pone la propia app a lo que crea
// ella). O sea: lo que ha entrado por la web, o lo que alguien haya escrito a
// mano en Teamleader. En los dos casos hace falta lo mismo: llamar y citar.
//
// LOS APUNTA EN LA HOJA DE CLIENTES: al acabar llama a `cliente-drive` con
// { pendientes: true }, que escribe en "Clientes Sysefen" a todo el que aún no
// esté. Para eso `cliente-drive` tiene que ir con "Verify JWT" desactivado.
//
// NO PISA NADA: si ese cliente ya está en la app (mismo tl_id), se deja como
// está. Y la primera pasada solo mira los últimos 7 días, para no arrastrar
// todo el histórico del CRM de golpe.
//
// SECRETOS (Supabase → Edge Functions → Secrets):
//   TEAMLEADER_CLIENT_ID, TEAMLEADER_CLIENT_SECRET
//   AVISOS_CLAVE   la misma que la tarea de los avisos de citas
//
// DESPLIEGUE: "Verify JWT" DESACTIVADO. La protege la cabecera `x-clave`; y
// desde la app se entra con la sesión, que se comprueba aquí dentro.
//
// USO (POST con JSON):
//   {}                          trae lo nuevo desde la última pasada
//   { "solo_ver": true }        dice qué traería, sin guardar nada
//   { "dias": 30 }              mira 30 días atrás en vez de desde la última vez
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const TOKEN = 'https://focus.teamleader.eu/oauth2/access_token';
const API = 'https://api.focus.teamleader.eu/';
const ETIQUETA_APP = 'sysefen-app';
const DIAS_PRIMERA_VEZ = 7;
const MAX_PAGINAS = 10;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

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

// Los añadidos después de `desde`, del más nuevo al más viejo. Se para en cuanto
// aparece uno más viejo: la lista viene ordenada, así que lo de detrás ya se vio.
async function novedades(token: string, metodo: string, desde: string) {
  // deno-lint-ignore no-explicit-any
  const fuera: any[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const r = await crm(token, metodo, {
      page: { size: 50, number: pagina },
      sort: [{ field: 'added_at', order: 'desc' }],
    });
    // deno-lint-ignore no-explicit-any
    const filas: any[] = r?.data || [];
    if (!filas.length) break;
    let viejo = false;
    for (const f of filas) {
      if (f.added_at && new Date(f.added_at).getTime() <= new Date(desde).getTime()) { viejo = true; break; }
      fuera.push(f);
    }
    if (viejo || filas.length < 50) break;
  }
  return fuera;
}

// deno-lint-ignore no-explicit-any
const primerEmail = (x: any) => limpio((x?.emails || []).find((e: any) => e?.email)?.email);
// deno-lint-ignore no-explicit-any
const primerTel = (x: any) => limpio((x?.telephones || []).find((t: any) => t?.number)?.number);
// deno-lint-ignore no-explicit-any
function señas(x: any) {
  const a = (x?.addresses || [])[0]?.address || {};
  return { direccion: limpio(a.line_1), poblacion: limpio(a.city) };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  if (CLAVE.length < 24) return json({ error: 'Falta el secreto AVISOS_CLAVE.' }, 500);
  const esElCron = mismaClave(req.headers.get('x-clave') || '', CLAVE);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* sin cuerpo */ }
  const soloVer = b.solo_ver === true;

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Desde la app también se puede pedir a mano ("buscar ahora").
  if (!esElCron) {
    const autorizacion = req.headers.get('Authorization') || '';
    if (!autorizacion) return json({ error: 'No autorizado.' }, 401);
    const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: autorizacion } },
    });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return json({ error: 'Sesión no válida.' }, 401);
    const { data: yo } = await sb.from('empleados').select('rol').eq('user_id', user.id).maybeSingle();
    if (!yo || !['presupuestos', 'jefe', 'admin'].includes(String(yo.rol))) {
      return json({ error: 'Solo presupuestos, jefes y Administración.' }, 403);
    }
  }

  // --- ¿desde cuándo miramos? ---------------------------------------------------
  const dias = Number(b.dias);
  let desde: string;
  if (Number.isFinite(dias) && dias > 0) {
    desde = new Date(Date.now() - dias * 86400000).toISOString();
  } else {
    const { data: aj } = await sb.from('ajustes').select('valor').eq('clave', 'tl_leads_desde').maybeSingle();
    desde = limpio(aj?.valor) || new Date(Date.now() - DIAS_PRIMERA_VEZ * 86400000).toISOString();
  }

  let token: string;
  try { token = await tokenValido(sb); }
  catch (e) {
    return json({ error: (e as Error).message, sin_permiso: e instanceof SinPermiso },
      e instanceof SinPermiso ? 409 : 502);
  }

  try {
    const contactos = await novedades(token, 'contacts.list', desde);
    const empresas = await novedades(token, 'companies.list', desde);

    // Lo que ya está en la app no se toca.
    const ids = [...contactos, ...empresas].map((x) => x.id).filter(Boolean);
    const yaEstan = new Set<string>();
    if (ids.length) {
      const { data: hay } = await sb.from('clientes_cache').select('tl_id').in('tl_id', ids);
      (hay || []).forEach((f) => yaEstan.add(String(f.tl_id)));
    }

    const ahora = new Date().toISOString();
    // deno-lint-ignore no-explicit-any
    const nuevas: any[] = [];
    // deno-lint-ignore no-explicit-any
    const preparar = (x: any, esEmpresa: boolean) => {
      if (!x.id || yaEstan.has(String(x.id))) return;
      if ((x.tags || []).some((t: string) => String(t).toLowerCase() === ETIQUETA_APP)) return;
      const nombre = esEmpresa
        ? limpio(x.name)
        : [limpio(x.first_name), limpio(x.last_name)].filter(Boolean).join(' ');
      if (!nombre) return;
      const { direccion, poblacion } = señas(x);
      nuevas.push({
        nombre,
        tipo: esEmpresa ? 'empresa' : 'particular',
        tl_tipo: esEmpresa ? 'company' : 'contact',
        tl_id: x.id,
        tl_at: ahora,
        email: primerEmail(x) || null,
        telefono: primerTel(x) || null,
        direccion: direccion || null,
        poblacion: poblacion || null,
        origen: 'web',
        lead_at: x.added_at || ahora,
        lead_visto: false,
        pendiente_alta: false,
        sincronizado_at: ahora,
      });
    };
    contactos.forEach((x) => preparar(x, false));
    empresas.forEach((x) => preparar(x, true));

    // La marca de agua se mueve al más nuevo que hemos visto, no a "ahora": si
    // entra uno mientras corremos, la próxima pasada lo pilla igual.
    const masNuevo = [...contactos, ...empresas]
      .map((x) => x.added_at).filter(Boolean).sort().pop() || desde;

    if (soloVer) {
      return json({ ok: true, desde, mirados: contactos.length + empresas.length, traeria: nuevas.length,
        nombres: nuevas.map((n) => n.nombre) });
    }

    let guardados = 0;
    if (nuevas.length) {
      const { error } = await sb.from('clientes_cache').insert(nuevas);
      if (error) return json({ error: 'No se pudieron guardar: ' + error.message }, 500);
      guardados = nuevas.length;
    }
    await sb.from('ajustes').upsert({ clave: 'tl_leads_desde', valor: masNuevo, updated_at: ahora });

    // Y a la hoja de clientes de Drive, sin que nadie tenga que darle a nada.
    // Se le pide a `cliente-drive` que apunte a todos los que falten (no solo a
    // los de ahora: si una pasada anterior falló con Google, se recuperan aquí).
    // Si Google falla, los clientes ya están en la app igual; no se rompe nada.
    let hoja: unknown = null;
    try {
      const r = await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/cliente-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-clave': CLAVE },
        body: JSON.stringify({ pendientes: true }),
      });
      hoja = await r.json().catch(() => ({ error: 'respuesta rara: ' + r.status }));
    } catch (e) {
      hoja = { error: (e as Error).message };
    }

    return json({ ok: true, desde, mirados: contactos.length + empresas.length, nuevos: guardados,
      nombres: nuevas.map((n) => n.nombre), hoja });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
