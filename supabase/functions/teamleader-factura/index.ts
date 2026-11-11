// =============================================================================
// Sysefen · Edge Function `teamleader-factura` (Enzo, 11-11-2026)
//
// «Quiero poder generar facturas desde presupuestos, o incluso una factura
// parcial por ítem o porcentaje… y tener todas las de Teamleader en la app para
// mudarnos de Teamleader poco a poco.» Sin Verifactu: las facturas se mandan
// luego a la gestoría.
//
// CÓMO ESTÁ PENSADO: mientras exista Teamleader, la factura se EMITE allí. El
// número lo pone Teamleader al contabilizar y la app no inventa ninguno. La app
// es la puerta: compone las líneas, crea el borrador, lo contabiliza, baja el
// PDF, apunta el cobro y abona. Y guarda en `facturas` (sql/etapa106) el espejo
// de TODAS las facturas y abonos de Teamleader, las hechas desde aquí y las
// hechas allí, para que el día que se deje Teamleader el historial ya esté.
//
// ACCIONES (POST con JSON):
//   { accion: 'sincronizar', max? }      trae lo nuevo o cambiado de Teamleader
//                                        (por tandas; `quedan` dice si hay más).
//                                        También la llama el cron, con x-clave.
//   { accion: 'opciones', presupuesto_id | cliente_id }
//                                        lo que hace falta para facturar: las
//                                        empresas, sus tipos de IVA, las formas
//                                        de pago, el cliente y lo ya facturado.
//   { accion: 'borrador', … }            crea el borrador en Teamleader:
//       presupuesto_id, modo: 'porcentaje' (pct) | 'importe' (importe) |
//         'partidas' (partidas: [{id, cantidad}]) | 'resto', concepto,
//         descontar: [id de facturas anticipadas que se restan]
//       cliente_id, modo: 'libre', lineas: [{descripcion, detalle, cantidad, precio}]
//       entidad_id, iva_id, fecha, forma_pago: {type, days}, nota
//   { accion: 'contabilizar', id, fecha? }   le pone número. NO SE DESHACE.
//   { accion: 'borrar', id }             solo borradores.
//   { accion: 'pdf', id }                enlace temporal al PDF de Teamleader.
//   { accion: 'cobro', id, importe?, fecha? }
//   { accion: 'abonar', id, fecha?, importe?, concepto? }   total, o parcial si hay importe.
//   { accion: 'refrescar', id }          vuelve a traer una.
//
// QUIÉN PUEDE: presupuestos y Administración.
// SECRETOS: TEAMLEADER_CLIENT_ID, TEAMLEADER_CLIENT_SECRET, AVISOS_CLAVE.
// DESPLIEGUE: «Verify JWT» DESACTIVADO (el cron entra con x-clave; la sesión se
// comprueba aquí).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const TOKEN = 'https://focus.teamleader.eu/oauth2/access_token';
const API = 'https://api.focus.teamleader.eu/';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
class SinPermiso extends Error {}
class Aviso extends Error {}   // algo que tiene que arreglar la persona (400)

const limpio = (s: unknown) => String(s ?? '').trim();
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100 + 1e-7) / 100;
const esUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v || ''));
const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const esFecha = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

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
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: fila.refresh_token, grant_type: 'refresh_token' }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.access_token) {
    throw new SinPermiso('El permiso de Teamleader ya no vale (' + (res.error_description || res.error || r.status) + '). Vuelve a conectarlo desde Ajustes.');
  }
  await sb.from('tl_oauth').upsert({
    id: 1, access_token: res.access_token, refresh_token: res.refresh_token || fila.refresh_token,
    expira_at: new Date(Date.now() + (Number(res.expires_in) || 3600) * 1000).toISOString(), actualizado_at: new Date().toISOString(),
  });
  return res.access_token as string;
}

// Teamleader admite 200 peticiones por minuto para toda la integración: ante un
// 429 se espera a x-ratelimit-reset (como mucho 8 s) y se reintenta dos veces.
async function crm(token: string, metodo: string, cuerpo: unknown) {
  const pedir = () => fetch(API + metodo, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
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
    const msg = r.status === 429 ? 'Teamleader está limitando las peticiones ahora mismo (200 por minuto para toda la app): espera unos segundos y vuelve a intentarlo'
      : (res?.errors?.[0]?.title || res?.message || res?.error || ('HTTP ' + r.status));
    const e = new Error(`${metodo}: ${msg}`);
    // deno-lint-ignore no-explicit-any
    (e as any).status = r.status;
    throw e;
  }
  return res;
}
function mismaClave(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

/* --- lo que hay en Teamleader alrededor de una factura ------------------------ */
type Iva = { id: string; nombre: string; pct: number };
type Ctx = {
  entidades: { id: string; nombre: string }[];
  ivaPct: Record<string, number>;           // id del tipo de IVA → %
  ivas: Record<string, Iva[]>;              // empresa → sus tipos
  clientes: Record<string, string>;         // tl_id → id en la app
  // deno-lint-ignore no-explicit-any
  ofertas: Record<string, any>;             // tl_quotation_id → presupuesto
  deals: Record<string, string | null>;     // oportunidad → presupuesto (caché de la pasada)
  desde: string;                            // antes de esta fecha no había presupuestos en la app: no se busca
};
// deno-lint-ignore no-explicit-any
async function contexto(sb: any, token: string, conClientes = true): Promise<Ctx> {
  const [deps, tax] = await Promise.all([crm(token, 'departments.list', {}), crm(token, 'taxRates.list', { page: { size: 100 } })]);
  // deno-lint-ignore no-explicit-any
  const entidades = ((deps?.data || []) as any[]).filter((d) => d.status !== 'archived').map((d) => ({ id: String(d.id), nombre: limpio(d.name) }));
  const ivaPct: Record<string, number> = {}, ivas: Record<string, Iva[]> = {};
  // deno-lint-ignore no-explicit-any
  ((tax?.data || []) as any[]).forEach((t) => {
    const pct = Math.round(Number(t.rate) * 10000) / 100;
    ivaPct[t.id] = pct;
    const dep = t.department?.id || '';
    (ivas[dep] = ivas[dep] || []).push({ id: t.id, nombre: limpio(t.description).replace(/\s+/g, ' '), pct });
  });
  const clientes: Record<string, string> = {};
  // deno-lint-ignore no-explicit-any
  const ofertas: Record<string, any> = {};
  if (conClientes) {
    const [{ data: cl }, { data: pr }] = await Promise.all([
      sb.from('clientes_cache').select('id, tl_id').not('tl_id', 'is', null).range(0, 9999),
      sb.from('presupuestos').select('id, tl_quotation_id, respuesta_cliente, created_at').not('tl_quotation_id', 'is', null).range(0, 9999),
    ]);
    // deno-lint-ignore no-explicit-any
    (cl || []).forEach((c: any) => { clientes[String(c.tl_id)] = c.id; });
    // deno-lint-ignore no-explicit-any
    (pr || []).forEach((p: any) => { ofertas[String(p.tl_quotation_id)] = p; });
  }
  // Las facturas de antes de que la app hiciera presupuestos no tienen ninguno que
  // buscar: se ahorra una llamada a Teamleader por cada una (el cupo es de 200 por minuto).
  // deno-lint-ignore no-explicit-any
  const primero = Object.values(ofertas).map((p: any) => String(p.created_at || '')).filter(Boolean).sort()[0] || '';
  const desde = primero ? new Date(new Date(primero).getTime() - 90 * 864e5).toISOString().slice(0, 10) : '9999-12-31';
  return { entidades, ivaPct, ivas, clientes, ofertas, deals: {}, desde };
}
/** El presupuesto de la app que va con una oportunidad de Teamleader: el aceptado, o el más reciente. */
async function presupuestoDeDeal(token: string, ctx: Ctx, dealId: string): Promise<string | null> {
  if (dealId in ctx.deals) return ctx.deals[dealId];
  let id: string | null = null;
  try {
    const d = await crm(token, 'deals.info', { id: dealId });
    // deno-lint-ignore no-explicit-any
    const cand = ((d?.data?.quotations || []) as any[]).map((q) => ctx.ofertas[String(q.id)]).filter(Boolean);
    cand.sort((a, b) => (Number(b.respuesta_cliente === 'aceptado') - Number(a.respuesta_cliente === 'aceptado')) || String(b.created_at).localeCompare(String(a.created_at)));
    id = cand.length ? cand[0].id : null;
  } catch (_) { /* sin oportunidad legible: sin presupuesto */ }
  ctx.deals[dealId] = id;
  return id;
}

const ESTADO: Record<string, string> = { draft: 'borrador', outstanding: 'pendiente', matched: 'pagada', booked: 'emitido' };
/** De la factura (o el abono) de Teamleader a la fila de `facturas`. */
// deno-lint-ignore no-explicit-any
function filaDe(d: any, tipo: 'factura' | 'abono', ctx: Ctx) {
  // deno-lint-ignore no-explicit-any
  const lineas: any[] = [];
  // deno-lint-ignore no-explicit-any
  ((d.grouped_lines || []) as any[]).forEach((g) => ((g.line_items || []) as any[]).forEach((l) => {
    lineas.push({
      seccion: limpio(g.section?.title) || null,
      descripcion: limpio(l.description),
      detalle: limpio(l.extended_description) || null,
      cantidad: Number(l.quantity) || 0,
      unidad: limpio(l.unit?.name) || null,
      precio: r2(l.unit_price?.amount),
      dto_pct: l.discount && l.discount.type === 'percentage' ? Number(l.discount.value) || 0 : null,
      iva_pct: l.tax?.id && l.tax.id in ctx.ivaPct ? ctx.ivaPct[l.tax.id] : null,
      importe: r2(l.total?.tax_exclusive?.amount),
    });
  }));
  // deno-lint-ignore no-explicit-any
  const impuestos = ((d.total?.taxes || []) as any[]).map((t) => ({ pct: Math.round(Number(t.rate) * 10000) / 100, base: r2(t.taxable?.amount), cuota: r2(t.tax?.amount) }));
  const base = r2(d.total?.tax_exclusive?.amount), total = r2(d.total?.tax_inclusive?.amount);
  const tlCliente = d.invoicee?.customer?.id ? String(d.invoicee.customer.id) : null;
  const ent = d.department?.id ? String(d.department.id) : null;
  return {
    tipo,
    tl_id: String(d.id),
    entidad_tl_id: ent,
    entidad: (ctx.entidades.find((e) => e.id === ent) || { nombre: null }).nombre,
    numero: limpio(tipo === 'abono' ? d.credit_note_number : d.invoice_number) || null,
    estado: ESTADO[String(d.status)] || String(d.status || 'borrador'),
    fecha: (tipo === 'abono' ? d.credit_note_date : d.invoice_date) || null,
    vence: d.due_on || null,
    pagada: d.paid === true,
    pagada_at: d.paid_at || null,
    enviada: d.sent === true,
    cliente_id: tlCliente && ctx.clientes[tlCliente] ? ctx.clientes[tlCliente] : null,
    tl_cliente_id: tlCliente,
    tl_cliente_tipo: d.invoicee?.customer?.type || null,
    cliente_nombre: limpio(d.invoicee?.name) || null,
    cliente_nif: limpio(d.invoicee?.vat_number) || limpio(d.invoicee?.national_identification_number) || null,
    tl_deal_id: d.deal?.id ? String(d.deal.id) : null,
    tl_factura_abonada_id: tipo === 'abono' && d.invoice?.id ? String(d.invoice.id) : null,
    base, iva: r2(total - base), total,
    pendiente: d.total?.due ? r2(d.total.due.amount) : null,
    impuestos, lineas,
    // deno-lint-ignore no-explicit-any
    cobros: ((d.payments || []) as any[]).map((p) => ({ importe: r2(p.payment?.amount), fecha: p.paid_at || null })),
    nota: limpio(d.note) || null,
    forma_pago: d.payment_term ? String(d.payment_term.type) + ':' + String(d.payment_term.days ?? 0) : null,
    referencia_pago: limpio(d.payment_reference) || null,
    tl_updated_at: d.updated_at || null,
    sincronizado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Trae una factura o un abono de Teamleader y lo deja en `facturas`. Devuelve la fila. */
// deno-lint-ignore no-explicit-any
async function traer(sb: any, token: string, ctx: Ctx, tipo: 'factura' | 'abono', tlId: string, alCrear?: Record<string, unknown>, webUrl?: string | null) {
  const d = (await crm(token, tipo === 'abono' ? 'creditNotes.info' : 'invoices.info', { id: tlId }))?.data;
  if (!d) throw new Error('Teamleader no devolvió la ' + (tipo === 'abono' ? 'nota de abono' : 'factura') + '.');
  // deno-lint-ignore no-explicit-any
  const fila: Record<string, any> = filaDe(d, tipo, ctx);
  if (webUrl) fila.tl_web_url = webUrl;
  const { data: ya } = await sb.from('facturas').select('id, presupuesto_id, cliente_id').eq('tl_id', tlId).maybeSingle();
  // El presupuesto: el que puso la app al crearla; si no, el de la oportunidad; en un abono, el de su factura.
  let presupuesto: string | null = (alCrear?.presupuesto_id as string) || (ya && ya.presupuesto_id) || null;
  if (!presupuesto && tipo === 'abono' && fila.tl_factura_abonada_id) {
    const { data: f } = await sb.from('facturas').select('presupuesto_id').eq('tl_id', fila.tl_factura_abonada_id).maybeSingle();
    presupuesto = (f && f.presupuesto_id) || null;
  }
  if (!presupuesto && fila.tl_deal_id && String(fila.fecha || '9999') >= ctx.desde) presupuesto = await presupuestoDeDeal(token, ctx, fila.tl_deal_id);
  fila.presupuesto_id = presupuesto;
  if (!fila.cliente_id && ya && ya.cliente_id) fila.cliente_id = ya.cliente_id;
  if (ya) {
    const { data, error } = await sb.from('facturas').update(fila).eq('id', ya.id).select('*').single();
    if (error) throw new Error('No se pudo guardar la factura en la app: ' + error.message);
    return data;
  }
  const { data, error } = await sb.from('facturas').insert(Object.assign({ origen: 'teamleader' }, fila, alCrear || {})).select('*').single();
  if (error) throw new Error('No se pudo guardar la factura en la app: ' + error.message);
  return data;
}

/* --- el espejo: todo lo de Teamleader, por tandas -------------------------------- */
// deno-lint-ignore no-explicit-any
async function sincronizar(sb: any, max: number) {
  const t0 = Date.now();
  const token = await tokenValido(sb);
  const ctx = await contexto(sb, token);
  // deno-lint-ignore no-explicit-any
  const lista: { tipo: 'factura' | 'abono'; d: any }[] = [];
  for (const [tipo, metodo] of [['factura', 'invoices.list'], ['abono', 'creditNotes.list']] as const) {
    for (let p = 1; p <= 60; p++) {
      // deno-lint-ignore no-explicit-any
      const datos = ((await crm(token, metodo, { page: { size: 100, number: p } }))?.data || []) as any[];
      datos.forEach((d) => lista.push({ tipo, d }));
      if (datos.length < 100) break;
    }
  }
  const { data: hay } = await sb.from('facturas').select('id, tl_id, tl_updated_at, estado, pagada').not('tl_id', 'is', null).range(0, 19999);
  // deno-lint-ignore no-explicit-any
  const porTl: Record<string, any> = {};
  // deno-lint-ignore no-explicit-any
  (hay || []).forEach((f: any) => { porTl[String(f.tl_id)] = f; });
  const ms = (v: unknown) => (v ? new Date(String(v)).getTime() : 0);
  const pendientes = lista.filter(({ d }) => {
    const f = porTl[String(d.id)];
    return !f || ms(f.tl_updated_at) !== ms(d.updated_at) || f.estado !== (ESTADO[String(d.status)] || String(d.status)) || f.pagada !== (d.paid === true);
  });
  // Lo que ya no está en Teamleader (un borrador borrado allí) se quita del espejo.
  const vivos = new Set(lista.map(({ d }) => String(d.id)));
  // deno-lint-ignore no-explicit-any
  const sobran = (hay || []).filter((f: any) => !vivos.has(String(f.tl_id))).map((f: any) => f.id);
  if (sobran.length && lista.length) await sb.from('facturas').delete().in('id', sobran);
  let actualizadas = 0, limitado = false;
  const errores: string[] = [];
  for (const { tipo, d } of pendientes) {
    if (actualizadas >= max || Date.now() - t0 > 100_000) break;
    try { await traer(sb, token, ctx, tipo, String(d.id), undefined, d.web_url || null); actualizadas++; }
    catch (e) {
      // Teamleader ha cortado por el cupo: se deja aquí y la siguiente pasada sigue.
      // deno-lint-ignore no-explicit-any
      if ((e as any).status === 429) { limitado = true; break; }
      errores.push((e as Error).message); if (errores.length >= 5) break;
    }
  }
  return {
    ok: true, facturas: lista.filter((x) => x.tipo === 'factura').length, abonos: lista.filter((x) => x.tipo === 'abono').length,
    actualizadas, quedan: Math.max(0, pendientes.length - actualizadas), quitadas: sobran.length, limitado: limitado || undefined, errores: errores.length ? errores : undefined,
  };
}

/* --- componer las líneas de la factura --------------------------------------------- */
type Linea = { seccion: string | null; descripcion: string; detalle?: string | null; cantidad: number; precio: number; iva_id?: string | null };
const COLS_LINEAS = 'id, orden, seccion, descripcion, detalle_tecnico, cantidad, unidad, precio_venta, iva';
/**
 * Las partidas del presupuesto como líneas de factura, con la cantidad que se
 * factura de cada una (por defecto, toda). `precio_venta` es el total de la
 * línea ya con sus descuentos: el unitario tiene que cuadrar al céntimo, y si
 * no cuadra (3 uds de algo acabado en un tercio) va como una unidad con su importe.
 */
// deno-lint-ignore no-explicit-any
function lineasDePartidas(lineas: any[], eleccion: Record<string, number> | null): Linea[] {
  const out: Linea[] = [];
  lineas.forEach((l) => {
    const total = Number(l.cantidad) || 1;
    const q = eleccion ? Number(eleccion[l.id]) : total;
    if (!(q > 0)) return;
    const cant = Math.min(q, total);
    const venta = Number(l.precio_venta) || 0;
    const unitario = r2(venta / total);
    const cuadra = Math.round(unitario * total * 100) === Math.round(venta * 100);
    const parcial = cant < total;
    out.push({
      seccion: limpio(l.seccion) || null,
      descripcion: (limpio(l.descripcion) + (!cuadra && parcial ? ' (' + String(cant).replace('.', ',') + ' de ' + String(total).replace('.', ',') + ')' : '')).slice(0, 255),
      detalle: limpio(l.detalle_tecnico) || null,
      cantidad: cuadra ? cant : 1,
      precio: cuadra ? unitario : r2(venta * cant / total),
    });
  });
  return out;
}
function agrupar(lineas: Linea[], ivaId: string) {
  // deno-lint-ignore no-explicit-any
  const grupos: { titulo: string; items: any[] }[] = [];
  lineas.forEach((l) => {
    const t = l.seccion || '';
    let g = grupos[grupos.length - 1];
    if (!g || g.titulo !== t) { g = { titulo: t, items: [] }; grupos.push(g); }
    g.items.push({
      quantity: l.cantidad,
      description: limpio(l.descripcion).slice(0, 255) || 'Concepto',
      extended_description: limpio(l.detalle) || undefined,
      unit_price: { amount: r2(l.precio), tax: 'excluding' },
      tax_rate_id: l.iva_id || ivaId,
    });
  });
  // Teamleader no admite una sección con el título vacío: sin título, sin sección.
  return grupos.map((g) => (g.titulo ? { section: { title: g.titulo.slice(0, 250) }, line_items: g.items } : { line_items: g.items }));
}

/* --- las acciones de la app ----------------------------------------------------------- */
// deno-lint-ignore no-explicit-any
async function filaApp(sb: any, id: string) {
  const { data } = await sb.from('facturas').select('*').eq('id', id).maybeSingle();
  if (!data) throw new Aviso('Esa factura no está en la app.');
  if (!data.tl_id) throw new Aviso('Esa factura no está en Teamleader.');
  return data;
}

// deno-lint-ignore no-explicit-any
async function opciones(sb: any, b: any) {
  const token = await tokenValido(sb);
  const ctx = await contexto(sb, token, false);
  const pagos = await crm(token, 'paymentTerms.list', {});
  // deno-lint-ignore no-explicit-any
  let pre: any = null, lineas: any[] = [], cliente: any = null, entidad: string | null = null, deal: string | null = null;
  if (esUuid(b.presupuesto_id)) {
    pre = (await sb.from('presupuestos').select('id, titulo, categoria, cliente_id, visita_id, tl_quotation_id, tl_numero, total_venta, respuesta_cliente').eq('id', b.presupuesto_id).maybeSingle()).data;
    if (!pre) throw new Aviso('Ese presupuesto no existe.');
    lineas = (await sb.from('presupuesto_lineas').select(COLS_LINEAS).eq('presupuesto_id', pre.id).order('orden')).data || [];
    if (pre.tl_quotation_id) {
      try {
        const q = await crm(token, 'quotations.info', { id: pre.tl_quotation_id });
        deal = q?.data?.deal?.id || null;
        if (deal) entidad = (await crm(token, 'deals.info', { id: deal }))?.data?.department?.id || null;
      } catch (_) { /* la oferta ya no está: se factura sin enlazarla */ }
    }
  }
  let clienteId = pre ? pre.cliente_id : (esUuid(b.cliente_id) ? b.cliente_id : null);
  if (!clienteId && pre && pre.visita_id) clienteId = (await sb.from('visitas').select('cliente_id').eq('id', pre.visita_id).maybeSingle()).data?.cliente_id || null;
  if (clienteId) cliente = (await sb.from('clientes_cache').select('id, nombre, nif, tl_id, tl_tipo, direccion_fiscal, email').eq('id', clienteId).maybeSingle()).data;
  if (!entidad || !ctx.entidades.some((e) => e.id === entidad)) entidad = (ctx.entidades.find((e) => /sysefen group/i.test(e.nombre)) || ctx.entidades[0] || { id: null }).id;
  // deno-lint-ignore no-explicit-any
  let facturas: any[] = [];
  if (pre) facturas = (await sb.from('facturas').select('id, tipo, numero, estado, fecha, base, iva, total, pendiente, pagada, impuestos, hito, tl_id, tl_factura_abonada_id, lineas').eq('presupuesto_id', pre.id).order('fecha')).data || [];
  return {
    ok: true, entidades: ctx.entidades, entidad_id: entidad, ivas: ctx.ivas,
    // deno-lint-ignore no-explicit-any
    formas_pago: ((pagos?.data || []) as any[]).map((p) => ({ type: p.type, days: Number(p.days) || 0 })),
    cliente: cliente ? { id: cliente.id, nombre: cliente.nombre, nif: cliente.nif, direccion_fiscal: cliente.direccion_fiscal, en_teamleader: !!cliente.tl_id } : null,
    presupuesto: pre ? { id: pre.id, titulo: pre.titulo, numero: pre.tl_numero, total: r2(pre.total_venta), aceptado: pre.respuesta_cliente === 'aceptado', en_teamleader: !!pre.tl_quotation_id } : null,
    lineas, facturas,
  };
}

// deno-lint-ignore no-explicit-any
async function crearBorrador(sb: any, yo: any, b: any) {
  const token = await tokenValido(sb);
  const ctx = await contexto(sb, token);
  const modo = String(b.modo || '');
  // deno-lint-ignore no-explicit-any
  let pre: any = null;
  if (modo !== 'libre') {
    if (!esUuid(b.presupuesto_id)) throw new Aviso('Falta el presupuesto.');
    pre = (await sb.from('presupuestos').select('id, titulo, cliente_id, visita_id, tl_quotation_id, tl_numero, total_venta, respuesta_cliente').eq('id', b.presupuesto_id).maybeSingle()).data;
    if (!pre) throw new Aviso('Ese presupuesto no existe.');
    if (pre.respuesta_cliente !== 'aceptado') throw new Aviso('El presupuesto todavía no está aceptado: márcalo como aceptado antes de facturarlo.');
  }
  let clienteId = pre ? pre.cliente_id : (esUuid(b.cliente_id) ? b.cliente_id : null);
  if (!clienteId && pre && pre.visita_id) clienteId = (await sb.from('visitas').select('cliente_id').eq('id', pre.visita_id).maybeSingle()).data?.cliente_id || null;
  const cliente = clienteId ? (await sb.from('clientes_cache').select('id, nombre, tl_id, tl_tipo').eq('id', clienteId).maybeSingle()).data : null;
  if (!cliente) throw new Aviso('Falta el cliente de la factura.');
  if (!cliente.tl_id) throw new Aviso('«' + cliente.nombre + '» todavía no está en Teamleader: súbelo desde su ficha antes de facturar.');

  const entidad = String(b.entidad_id || '');
  if (!ctx.entidades.some((e) => e.id === entidad)) throw new Aviso('Elige la empresa que factura.');
  const ivasEnt = ctx.ivas[entidad] || [];
  const ivaId = String(b.iva_id || '');
  if (!ivasEnt.some((i) => i.id === ivaId)) throw new Aviso('Elige el tipo de IVA.');
  const fecha = esFecha(b.fecha) ? String(b.fecha) : hoyMadrid();
  const TIPOS_PAGO = ['cash', 'end_of_month', 'after_invoice_date'];
  const pago = b.forma_pago && TIPOS_PAGO.includes(String(b.forma_pago.type)) ? { type: String(b.forma_pago.type), days: Math.max(0, Math.round(Number(b.forma_pago.days) || 0)) } : { type: 'cash', days: 0 };

  let lineas: Linea[] = [];
  // deno-lint-ignore no-explicit-any
  const hito: Record<string, any> = { modo };
  const refPre = pre ? ('Presupuesto ' + (limpio(pre.tl_numero) ? limpio(pre.tl_numero) + ' · ' : '') + limpio(pre.titulo)).slice(0, 250) : '';
  if (modo === 'porcentaje' || modo === 'importe') {
    const baseP = r2(pre.total_venta);
    let importe = 0;
    if (modo === 'porcentaje') {
      const pct = Number(b.pct);
      if (!(pct > 0 && pct <= 100)) throw new Aviso('El porcentaje va de 0 a 100.');
      if (!(baseP > 0)) throw new Aviso('El presupuesto no tiene importe.');
      importe = r2(baseP * pct / 100); hito.pct = pct;
    } else {
      importe = r2(b.importe);
      if (!(importe > 0)) throw new Aviso('Pon el importe a facturar, sin IVA.');
    }
    hito.importe = importe;
    lineas = [{ seccion: null, descripcion: limpio(b.concepto) || (modo === 'porcentaje' ? 'Anticipo ' + String(hito.pct).replace('.', ',') + ' %' : 'Anticipo'), detalle: refPre || null, cantidad: 1, precio: importe }];
  } else if (modo === 'partidas' || modo === 'resto') {
    const { data: lp } = await sb.from('presupuesto_lineas').select(COLS_LINEAS).eq('presupuesto_id', pre.id).order('orden');
    let eleccion: Record<string, number> | null = null;
    if (modo === 'partidas') {
      eleccion = {};
      // deno-lint-ignore no-explicit-any
      ((Array.isArray(b.partidas) ? b.partidas : []) as any[]).forEach((x) => { if (x && esUuid(x.id) && Number(x.cantidad) > 0) eleccion![x.id] = Number(x.cantidad); });
      hito.partidas = Object.keys(eleccion).length;
    }
    lineas = lineasDePartidas(lp || [], eleccion);
    if (!lineas.length) throw new Aviso(modo === 'partidas' ? 'Marca al menos una partida.' : 'El presupuesto no tiene líneas.');
    // Los anticipos ya facturados se restan, como hace Teamleader: una sección
    // «Factura anticipada Nº» con una línea «Anticipo» en negativo.
    const restar = (Array.isArray(b.descontar) ? b.descontar : []).filter(esUuid).slice(0, 30);
    if (restar.length) {
      const { data: ant } = await sb.from('facturas').select('id, tipo, numero, base, impuestos, presupuesto_id, cliente_id, estado').in('id', restar);
      hito.descontadas = [];
      // deno-lint-ignore no-explicit-any
      for (const a of ((ant || []) as any[])) {
        if (a.tipo !== 'factura' || !a.numero) throw new Aviso('Solo se restan facturas ya contabilizadas.');
        if (a.presupuesto_id !== pre.id && a.cliente_id !== cliente.id) throw new Aviso('La factura ' + a.numero + ' no es de este cliente.');
        const pctAnt = Array.isArray(a.impuestos) && a.impuestos.length === 1 ? Number(a.impuestos[0].pct) : null;
        const ivaAnt = pctAnt == null ? null : ivasEnt.find((i) => i.pct === pctAnt && (i.id === ivaId || /^ventas\s+\d+\s*% iva$/i.test(i.nombre))) || ivasEnt.find((i) => i.pct === pctAnt);
        lineas.push({ seccion: 'Factura anticipada ' + a.numero, descripcion: 'Anticipo', cantidad: 1, precio: -r2(a.base), iva_id: ivaAnt ? ivaAnt.id : null });
        hito.descontadas.push(a.numero);
      }
    }
  } else if (modo === 'libre') {
    // deno-lint-ignore no-explicit-any
    lineas = ((Array.isArray(b.lineas) ? b.lineas : []) as any[]).slice(0, 200).map((l) => ({
      seccion: limpio(l.seccion) || null, descripcion: limpio(l.descripcion), detalle: limpio(l.detalle) || null,
      cantidad: Number(String(l.cantidad ?? 1).replace(',', '.')) || 0, precio: r2(String(l.precio ?? 0).replace(',', '.')),
    })).filter((l) => l.descripcion && l.cantidad !== 0);
    if (!lineas.length) throw new Aviso('Añade al menos una línea con concepto y cantidad.');
  } else throw new Aviso('No sé qué factura hacer.');

  const cuerpo: Record<string, unknown> = {
    invoicee: { customer: { type: cliente.tl_tipo === 'company' ? 'company' : 'contact', id: cliente.tl_id } },
    department_id: entidad,
    payment_term: pago,
    grouped_lines: agrupar(lineas, ivaId),
    invoice_date: fecha,
  };
  // Al enlazar la oferta, Teamleader añade él solo «Nuestra referencia: Nº» detrás de lo que se ponga.
  const nota = limpio(b.nota);
  if (nota) cuerpo.note = nota.slice(0, 2000) + '\n';
  if (pre && pre.tl_quotation_id) cuerpo.quotation_id = pre.tl_quotation_id;
  let creada;
  try { creada = await crm(token, 'invoices.draft', cuerpo); }
  catch (e) {
    // La oferta ya no está en Teamleader: la factura se hace igual, sin enlazarla.
    if (cuerpo.quotation_id && /quotation/i.test((e as Error).message)) { delete cuerpo.quotation_id; creada = await crm(token, 'invoices.draft', cuerpo); }
    else throw e;
  }
  const tlId = creada?.data?.id;
  if (!tlId) throw new Error('Teamleader no devolvió la factura creada.');
  const fila = await traer(sb, token, ctx, 'factura', String(tlId), { origen: 'app', presupuesto_id: pre ? pre.id : null, hito, creado_por: yo.id });
  return { ok: true, factura: fila };
}

// deno-lint-ignore no-explicit-any
async function accion(sb: any, yo: any, b: any) {
  const a = String(b.accion || '');
  if (a === 'sincronizar') return await sincronizar(sb, Math.min(Math.max(Number(b.max) || 45, 1), 80));
  if (a === 'opciones') return await opciones(sb, b);
  if (a === 'borrador') return await crearBorrador(sb, yo, b);

  if (!esUuid(b.id)) throw new Aviso('Falta la factura.');
  const f = await filaApp(sb, String(b.id));
  const token = await tokenValido(sb);
  const ctx = await contexto(sb, token);
  const otraVez = async () => await traer(sb, token, ctx, f.tipo, f.tl_id);

  if (a === 'refrescar') return { ok: true, factura: await otraVez() };
  if (a === 'pdf') {
    const r = await crm(token, f.tipo === 'abono' ? 'creditNotes.download' : 'invoices.download', { id: f.tl_id, format: 'pdf' });
    if (!r?.data?.location) throw new Error('Teamleader no devolvió el PDF.');
    return { ok: true, url: r.data.location, caduca: r.data.expires || null };
  }
  if (f.tipo !== 'factura') throw new Aviso('Eso solo se hace con una factura, no con un abono.');
  if (a === 'contabilizar') {
    if (f.estado !== 'borrador') throw new Aviso('Esa factura ya está contabilizada: ' + (f.numero || '') + '.');
    await crm(token, 'invoices.book', { id: f.tl_id, on: esFecha(b.fecha) ? String(b.fecha) : (f.fecha || hoyMadrid()) });
    return { ok: true, factura: await otraVez() };
  }
  if (a === 'borrar') {
    if (f.estado !== 'borrador') throw new Aviso('Solo se borran los borradores. Una factura contabilizada se rectifica con un abono.');
    await crm(token, 'invoices.delete', { id: f.tl_id });
    await sb.from('facturas').delete().eq('id', f.id);
    return { ok: true, borrada: true };
  }
  if (a === 'cobro') {
    if (f.estado === 'borrador') throw new Aviso('Contabiliza la factura antes de apuntar el cobro.');
    const importe = b.importe == null || b.importe === '' ? r2(f.pendiente != null ? f.pendiente : f.total) : r2(String(b.importe).replace(',', '.'));
    if (!(importe > 0)) throw new Aviso('Pon el importe cobrado.');
    const dia = esFecha(b.fecha) ? String(b.fecha) : hoyMadrid();
    await crm(token, 'invoices.registerPayment', { id: f.tl_id, payment: { amount: importe, currency: 'EUR' }, paid_at: dia + 'T12:00:00+00:00' });
    return { ok: true, factura: await otraVez() };
  }
  if (a === 'abonar') {
    if (f.estado === 'borrador') throw new Aviso('Un borrador no se abona: se borra.');
    const dia = esFecha(b.fecha) ? String(b.fecha) : hoyMadrid();
    let r;
    if (b.importe == null || b.importe === '') r = await crm(token, 'invoices.credit', { id: f.tl_id, credit_note_date: dia });
    else {
      const importe = r2(String(b.importe).replace(',', '.'));
      if (!(importe > 0) || importe > r2(f.base)) throw new Aviso('El abono parcial va sin IVA y no puede pasar de la base de la factura (' + eur(r2(f.base)) + ').');
      const pct = Array.isArray(f.impuestos) && f.impuestos.length ? Number(f.impuestos[0].pct) : 21;
      const iva = (ctx.ivas[f.entidad_tl_id] || []).find((i) => i.pct === pct);
      if (!iva) throw new Aviso('No encuentro en Teamleader el IVA del ' + pct + ' % para abonar.');
      r = await crm(token, 'invoices.creditPartially', { id: f.tl_id, credit_note_date: dia,
        grouped_lines: [{ line_items: [{ quantity: 1, description: (limpio(b.concepto) || 'Abono parcial de la factura ' + (f.numero || '')).slice(0, 255), unit_price: { amount: importe, tax: 'excluding' }, tax_rate_id: iva.id }] }] });
    }
    const abonoId = r?.data?.id;
    const abono = abonoId ? await traer(sb, token, ctx, 'abono', String(abonoId), { origen: 'app', creado_por: yo.id }) : null;
    return { ok: true, factura: await otraVez(), abono };
  }
  throw new Aviso('No sé qué hacer con eso.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { /* sin cuerpo */ }
  const fallo = (e: unknown) => {
    const err = e as Error;
    if (err instanceof SinPermiso) return json({ error: err.message, sin_permiso: true }, 409);
    if (err instanceof Aviso) return json({ error: err.message }, 400);
    return json({ error: err.message || String(e) }, 502);
  };

  // --- el cron: solo sincroniza, con su clave ---------------------------------------
  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  if (CLAVE.length >= 24 && mismaClave(req.headers.get('x-clave') || '', CLAVE)) {
    try {
      return json(Object.assign({ cron: true }, await sincronizar(sb, Math.min(Math.max(Number(b.max) || 60, 1), 80))));
    } catch (e) { return fallo(e); }
  }

  // --- quién llama ---------------------------------------------------------------------
  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
  const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: autorizacion } } });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: 'Sesión no válida.' }, 401);
  const { data: yo } = await sb.from('empleados').select('id, rol').eq('user_id', user.id).maybeSingle();
  if (!yo || !['presupuestos', 'admin'].includes(String(yo.rol))) return json({ error: 'Facturar es de presupuestos y Administración.' }, 403);
  try { return json(await accion(sb, yo, b)); } catch (e) { return fallo(e); }
});
