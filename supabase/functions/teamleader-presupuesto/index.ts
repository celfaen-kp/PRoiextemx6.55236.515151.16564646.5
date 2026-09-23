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
// A QUÉ OPORTUNIDAD SE CUELGA: a la de la visita, si el presupuesto salió de
// una y esa visita ya está en el CRM. Un presupuesto suelto se sube sin
// oportunidad; Teamleader la crea o se enlaza después a mano.
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
 * El IVA que toca, buscado por su porcentaje. Los ids de los tipos de IVA son
 * de cada cuenta de Teamleader, así que no se pueden escribir aquí.
 */
async function idDelIva(token: string, pct: number) {
  try {
    const r = await crm(token, 'taxRates.list', {});
    const lista = (r?.data || []) as { id: string; rate: number; description?: string }[];
    const exacto = lista.find((t) => Math.round(Number(t.rate) * 100) === Math.round(pct)
      || Math.round(Number(t.rate)) === Math.round(pct));
    return (exacto || lista[0])?.id || null;
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

  // La oportunidad de su visita, si la tiene.
  let dealId = '';
  if (p.visita_id) {
    const { data: v } = await sb.from('visitas').select('tl_deal_id').eq('id', p.visita_id).maybeSingle();
    dealId = limpio(v?.tl_deal_id);
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

  const iva = Number(lineas[0].iva == null ? 21 : lineas[0].iva);

  if (soloVer) {
    return json({ ok: true, cliente: cli.nombre, deal_id: dealId || null, iva,
      lineas: lineas.length, secciones: grupos.map((g) => g.titulo), total: p.total_venta });
  }

  await sb.from('presupuestos').update({ sync_estado: 'enviando', sync_error: null }).eq('id', id);

  try {
    const token = await tokenValido(sb);
    const ivaId = await idDelIva(token, iva);

    const departamentos = await crm(token, 'departments.list', {});
    const departamentoId = departamentos?.data?.[0]?.id;
    if (!departamentoId) throw new Error('Teamleader no devolvió ningún departamento.');

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
        unit_price: { amount: cuadra ? unitario : dosDec(venta), currency: 'EUR' },
        tax_rate_id: ivaId || undefined,
        product_id: undefined,
      };
    });

    const cuerpo: Record<string, unknown> = {
      customer: { type: cli.tl_tipo === 'company' ? 'company' : 'contact', id: cli.tl_id },
      department_id: departamentoId,
      currency: 'EUR',
      grouped_lines: grupos.map((g) => ({ section: { title: g.titulo }, line_items: items(g) })),
    };
    if (dealId) cuerpo.deal_id = dealId;

    const r = await crm(token, 'quotations.create', cuerpo);
    const quotationId = r?.data?.id || '';
    if (!quotationId) throw new Error('El CRM no devolvió el id del presupuesto.');

    await sb.from('presupuestos').update({
      tl_quotation_id: quotationId, sync_estado: 'sincronizado', sync_error: null,
      sync_at: new Date().toISOString(), estado: 'enviado',
    }).eq('id', id);

    return json({ ok: true, tl_quotation_id: quotationId, deal_id: dealId || null,
      lineas: lineas.length, total: p.total_venta });
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from('presupuestos').update({ sync_estado: 'error', sync_error: msg }).eq('id', id);
    return json({ error: msg, sin_permiso: e instanceof SinPermiso },
      e instanceof SinPermiso ? 409 : 502);
  }
});
