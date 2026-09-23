// =============================================================================
// Sysefen · Edge Function `teamleader-presupuesto`
//
// Sube a Teamleader un presupuesto calculado por el motor: crea la oferta
// (quotation) con sus líneas, agrupadas por sección, con el detalle técnico
// debajo de cada artículo.
//
// LO QUE NO HACE: no la manda al cliente. En Teamleader crear y enviar son dos
// llamadas distintas; aquí solo se crea, y quien la manda es una persona desde
// el CRM, que es donde se ve cómo queda.
//
// A QUÉ OPORTUNIDAD SE CUELGA: en Teamleader una oferta SIEMPRE va dentro de
// una oportunidad (deal_id es obligatorio). Si el presupuesto salió de una
// visita, a la de esa visita, que tiene que estar subida antes. Si es suelto,
// se le crea una aquí, en el embudo de su oficio.
//
// EL IVA: cada línea lleva el id de un tipo de IVA, y esos tipos son de cada
// departamento. Se usa el departamento de la oportunidad y, dentro de él, el
// tipo cuyo porcentaje coincide con el de la línea. Si no hay ninguno que
// coincida se para con un mensaje claro: mejor eso que un IVA equivocado.
//
// LOS PRECIOS NO SE RECALCULAN AQUÍ. Se manda el precio de venta de cada línea,
// que es el que ya tiene el descuento al pie repartido. Así lo que se ve en la
// app y lo que se ve en el CRM es el mismo número, al céntimo.
//
// SECRETOS: TEAMLEADER_CLIENT_ID y TEAMLEADER_CLIENT_SECRET (los mismos que
// usan las otras funciones de Teamleader).
//
// DESPLIEGUE: "Verify JWT" ACTIVADO.
// QUIÉN PUEDE: presupuestos y Administración (sql/etapa40).
//
// USO (POST con JSON):
//   { "presupuesto_id": "uuid" }
//   { "presupuesto_id": "uuid", "solo_ver": true }   dice qué mandaría
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

const limpio = (s: unknown) => String(s ?? '').trim();
const dosDec = (n: number) => Math.round(n * 100) / 100;

class SinPermiso extends Error {}

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
    const e = new Error(`${metodo}: ${msg}`);
    // deno-lint-ignore no-explicit-any
    (e as any).status = r.status;
    throw e;
  }
  return res;
}

/**
 * Los tipos de IVA del departamento, por porcentaje: { 21: 'id', 10: 'id' }.
 * Los ids son de cada cuenta de Teamleader, así que no se pueden escribir aquí.
 * Teamleader da el tipo como fracción (0.21).
 */
async function ivasDelDepartamento(token: string, departamentoId: string) {
  const r = await crm(token, 'taxRates.list',
    departamentoId ? { filter: { department_id: departamentoId }, page: { size: 100 } } : { page: { size: 100 } });
  // deno-lint-ignore no-explicit-any
  const lista = (r?.data || []) as any[];
  const porPct: Record<number, string> = {};
  lista.forEach((t) => {
    if (departamentoId && t.department?.id && t.department.id !== departamentoId) return;
    const pct = Math.round(Number(t.rate) * 10000) / 100;      // 0.21 -> 21
    if (!(pct in porPct)) porPct[pct] = t.id;
  });
  return porPct;
}

// Embudo de cada oficio, por el NOMBRE (igual que en teamleader-visita; se
// repite a propósito, cada función se pega en un solo archivo). Solo se usa
// para los presupuestos sueltos, que no tienen oportunidad de visita.
const EMBUDOS: [string, RegExp][] = [
  ['aerotermia', /aerot/i],
  ['aire_acondicionado', /aire|clima/i],
  ['electricidad', /electri/i],
  ['solar', /fotovolt|solar|placas|paneles/i],
];
const EMBUDO_RESTO = /otros|varios|general/i;

// La primera fase del embudo del oficio, solo si se puede saber sin riesgo de
// equivocarse de embudo. Si no, null y la oportunidad cae en el de por defecto.
async function faseDeEmbudo(token: string, categoria: string) {
  try {
    const embudos = ((await crm(token, 'dealPipelines.list', {}))?.data || []) as { id: string; name: string }[];
    const patron = EMBUDOS.find(([c]) => c === categoria)?.[1];
    const elegido = (patron && embudos.find((x) => patron.test(String(x.name || ''))))
      || embudos.find((x) => EMBUDO_RESTO.test(String(x.name || '')));
    if (!elegido) return null;
    // deno-lint-ignore no-explicit-any
    const todas = ((await crm(token, 'dealPhases.list', {}))?.data || []) as any[];
    // deno-lint-ignore no-explicit-any
    const suya = todas.find((f: any) => (f.deal_pipeline || f.pipeline)?.id === elegido.id);
    return suya ? String(suya.id) : null;
  } catch (_) { return null; }
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
  const { data: yo } = await sb.from('empleados').select('rol').eq('user_id', user.id).maybeSingle();
  if (!yo || !['presupuestos', 'admin'].includes(String(yo.rol))) {
    return json({ error: 'Mandar presupuestos al CRM es de presupuestos y Administración.' }, 403);
  }

  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const id = limpio(b.presupuesto_id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Falta el presupuesto.' }, 400);
  const soloVer = b.solo_ver === true;

  // --- el presupuesto ---------------------------------------------------------
  const { data: p } = await sb.from('presupuestos')
    .select('id, categoria, titulo, cliente_id, visita_id, total_venta, dto_global_pct, tl_quotation_id')
    .eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Ese presupuesto no existe.' }, 404);
  if (p.tl_quotation_id) {
    return json({ error: 'Ese presupuesto ya está en Teamleader.', tl_quotation_id: p.tl_quotation_id }, 409);
  }

  const { data: lineas } = await sb.from('presupuesto_lineas')
    .select('orden, seccion, descripcion, detalle_tecnico, cantidad, unidad, precio_tarifa, precio_venta, iva, producto_ref')
    .eq('presupuesto_id', id).order('orden');
  if (!lineas || !lineas.length) return json({ error: 'Ese presupuesto no tiene líneas.' }, 400);

  // El cliente tiene que estar ya en el CRM: allí es donde vive de verdad.
  // deno-lint-ignore no-explicit-any
  let cli: any = null;
  if (p.cliente_id) {
    const { data } = await sb.from('clientes_cache').select('nombre, tl_id, tl_tipo').eq('id', p.cliente_id).maybeSingle();
    cli = data;
  }
  if (!cli?.tl_id) {
    return json({ error: 'El cliente de este presupuesto todavía no está en Teamleader. Ábrelo en la agenda y súbelo primero.' }, 409);
  }

  // La oportunidad de su visita. Si la visita existe pero aún no está en el
  // CRM, se para: crear aquí otra oportunidad dejaría dos cuando se suba.
  let dealId = '';
  if (p.visita_id) {
    const { data: v } = await sb.from('visitas').select('tl_deal_id').eq('id', p.visita_id).maybeSingle();
    dealId = limpio(v?.tl_deal_id);
    if (!dealId) {
      return json({ error: 'La visita de este presupuesto todavía no está en Teamleader. Súbela primero y vuelve a mandarlo.' }, 409);
    }
  }

  // --- las líneas, agrupadas por sección ---------------------------------------
  // deno-lint-ignore no-explicit-any
  const grupos: any[] = [];
  lineas.forEach((l) => {
    const t = limpio(l.seccion) || 'Presupuesto';
    let g = grupos.find((x) => x.titulo === t);
    if (!g) { g = { titulo: t, lineas: [] }; grupos.push(g); }
    g.lineas.push(l);
  });

  // deno-lint-ignore no-explicit-any
  const ivaDe = (l: any) => Math.round(Number(l.iva == null ? 21 : l.iva) * 100) / 100;
  const iva = ivaDe(lineas[0]);

  if (soloVer) {
    return json({ ok: true, cliente: cli.nombre, deal_id: dealId || null, iva,
      lineas: lineas.length, secciones: grupos.map((g) => g.titulo), total: p.total_venta });
  }

  await sb.from('presupuestos').update({ sync_estado: 'enviando', sync_error: null }).eq('id', id);

  try {
    const token = await tokenValido(sb);

    // Presupuesto suelto: se le crea su oportunidad.
    let dealCreado = false;
    if (!dealId) {
      const fase = await faseDeEmbudo(token, limpio(p.categoria));
      const r = await crm(token, 'deals.create', {
        lead: { customer: { type: cli.tl_tipo === 'company' ? 'company' : 'contact', id: cli.tl_id } },
        title: (limpio(p.titulo) || 'Presupuesto').slice(0, 255),
        ...(fase ? { phase_id: fase } : {}),
      });
      dealId = r?.data?.id || '';
      if (!dealId) throw new Error('El CRM no devolvió el id de la oportunidad.');
      dealCreado = true;
    }

    // El IVA, del departamento de la oportunidad.
    const deal = await crm(token, 'deals.info', { id: dealId });
    const departamentoId = limpio(deal?.data?.department?.id);
    const ivas = await ivasDelDepartamento(token, departamentoId);
    const faltan = [...new Set(lineas.map(ivaDe))].filter((x) => !ivas[x]);
    if (faltan.length) {
      const hay = Object.keys(ivas).map((x) => x + ' %').join(', ') || 'ninguno';
      throw new Error(`En Teamleader no hay un IVA del ${faltan.join(' % ni del ')} % en el departamento de la oportunidad (hay: ${hay}).`);
    }

    // deno-lint-ignore no-explicit-any
    const items = (g: any) => g.lineas.map((l: any) => {
      const cantidad = Number(l.cantidad) || 1;
      const venta = Number(l.precio_venta) || 0;
      // El precio unitario tiene que cuadrar con el total de la línea al
      // céntimo. Si al repartirlo entre las unidades no cuadra (3 uds de algo
      // acabado en un tercio), se manda como una sola unidad con su importe.
      const unitario = dosDec(venta / cantidad);
      const cuadra = Math.round(unitario * cantidad * 100) === Math.round(venta * 100);
      return {
        quantity: cuadra ? cantidad : 1,
        description: limpio(l.descripcion).slice(0, 255),
        extended_description: limpio(l.detalle_tecnico) || undefined,
        // `tax: excluding` es obligatorio: el precio va sin IVA y Teamleader
        // lo suma con el tipo de tax_rate_id.
        unit_price: { amount: cuadra ? unitario : dosDec(venta), tax: 'excluding' },
        tax_rate_id: ivas[ivaDe(l)],
      };
    });

    const r = await crm(token, 'quotations.create', {
      deal_id: dealId,
      currency: { code: 'EUR' },
      grouped_lines: grupos.map((g) => ({ section: { title: g.titulo }, line_items: items(g) })),
    });
    const quotationId = r?.data?.id || '';
    if (!quotationId) throw new Error('El CRM no devolvió el id del presupuesto.');

    // Que la oportunidad lleve el importe (sin IVA). Si falla, la oferta ya
    // está hecha: no se da por error.
    try {
      await crm(token, 'deals.update', {
        id: dealId, estimated_value: { amount: dosDec(Number(p.total_venta) || 0), currency: 'EUR' },
      });
    } catch (_) { /* no es grave */ }

    await sb.from('presupuestos').update({
      tl_quotation_id: quotationId, sync_estado: 'sincronizado', sync_error: null,
      sync_at: new Date().toISOString(), estado: 'enviado',
    }).eq('id', id);

    return json({ ok: true, tl_quotation_id: quotationId, deal_id: dealId, deal_creado: dealCreado,
      lineas: lineas.length, total: p.total_venta });
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from('presupuestos').update({ sync_estado: 'error', sync_error: msg }).eq('id', id);
    return json({ error: msg, sin_permiso: e instanceof SinPermiso },
      e instanceof SinPermiso ? 409 : 502);
  }
});
