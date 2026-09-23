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
// EL PDF: la app manda también su PDF del presupuesto, y se sube a los
// archivos de la oportunidad (carpeta «Presupuestos»). Si la oferta de
// Teamleader no se puede crear, el PDF queda allí igual, que es lo que importa.
//
// USO (POST con JSON):
//   { "presupuesto_id": "uuid", "pdf_base64": "…", "pdf_nombre": "x.pdf" }
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

// La primera fase del embudo que toca (copiada de teamleader-visita: cada
// función se pega en un solo archivo, así que se repite a propósito). Si algo falla o no hay
// embudo con ese nombre, null: la oportunidad se crea igual, en el de siempre.
async function faseDeEmbudo(token: string, categorias: string[]) {
  try {
    const embudos = ((await crm(token, 'dealPipelines.list', {}))?.data || []) as { id: string; name: string }[];
    // deno-lint-ignore no-explicit-any
    let elegido: any = null;
    for (const [cat, patron] of EMBUDOS) {
      if (!categorias.includes(cat)) continue;
      elegido = embudos.find((x) => patron.test(String(x.name || ''))) || null;
      if (elegido) break;
    }
    // Ningún embudo para lo que se ha visitado: a OTROS, no al de por defecto.
    if (!elegido && categorias.length) {
      elegido = embudos.find((x) => EMBUDO_RESTO.test(String(x.name || ''))) || null;
    }
    if (!elegido) return null;

    // OJO: la primera versión pedía las fases con filter.pipeline_ids y se fiaba
    // de lo que volviera. Teamleader ignora ese filtro y devuelve las fases de
    // TODOS los embudos, así que la primera era la de otro embudo cualquiera y
    // la oportunidad acababa en "Otros". Ahora:
    //   1. se prueban los dos nombres de filtro que usa la API,
    //   2. se compara con la lista sin filtrar para ver si el filtro ha servido,
    //   3. y si cada fase dice a qué embudo pertenece, se comprueba una a una.
    // Si después de todo eso no hay una fase SEGURA de ese embudo, no se manda
    // ninguna: vale más que caiga en el embudo por defecto, donde ya se buscaba
    // antes, que mandarla a uno equivocado.
    const todas = ((await crm(token, 'dealPhases.list', {}))?.data || []) as any[];
    // Cada fase trae (o no) a qué embudo pertenece; los nombres del campo cambian
    // según la versión de la API.
    // deno-lint-ignore no-explicit-any
    const deEste = (f: any) => {
      const p = (f.deal_pipeline || f.pipeline) as { id?: string } | undefined;
      return p && p.id ? p.id === elegido!.id : null;   // null = no lo dice
    };

    // deno-lint-ignore no-explicit-any
    const marcadas = todas.filter((f: any) => deEste(f) === true);
    if (marcadas.length) return { fase: marcadas[0].id, embudo: elegido.name };

    for (const clave of ['deal_pipeline_id', 'pipeline_id', 'deal_pipeline_ids', 'pipeline_ids']) {
      const valor = clave.endsWith('_ids') ? [elegido.id] : elegido.id;
      // deno-lint-ignore no-explicit-any
      let fases: any[] = [];
      try {
        fases = ((await crm(token, 'dealPhases.list', { filter: { [clave]: valor } }))?.data || []) as any[];
      } catch (_) { continue; }                       // ese filtro no existe
      if (!fases.length || fases.length === todas.length) continue;   // no ha filtrado
      if (fases.some((f: any) => deEste(f) === false)) continue;           // filtró mal
      return { fase: fases[0].id, embudo: elegido.name };
    }
    // Se sabe el embudo pero no se puede señalar su fase sin riesgo.
    return { fase: null, embudo: elegido.name };
  } catch (_) { /* sin embudo: se queda en el de por defecto */ }
  return null;
}

/**
 * Sube un archivo a Teamleader, colgado de una oportunidad (u otra cosa).
 * Son dos pasos: `files.upload` da una dirección temporal, y a esa dirección
 * se manda el archivo. La documentación no dice en qué forma; se prueba
 * primero como formulario (campo `file`) y, si no lo acepta, en crudo.
 */
async function subirArchivo(token: string, tipo: string, idCosa: string, nombre: string, b64: string) {
  const r = await crm(token, 'files.upload', { name: nombre, subject: { type: tipo, id: idCosa }, folder: 'Presupuestos' });
  const destino = r?.data?.location;
  if (!destino) throw new Error('Teamleader no dio dónde subir el archivo.');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const archivo = new Blob([bytes], { type: 'application/pdf' });

  const form = new FormData();
  form.append('file', archivo, nombre);
  let res = await fetch(destino, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  if (res.ok) return;
  const primero = res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200);

  res = await fetch(destino, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/pdf' },
    body: archivo,
  });
  if (res.ok) return;
  const segundo = res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200);
  throw new Error('Teamleader no aceptó el archivo (' + primero + ' / ' + segundo + ')');
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
  // El PDF de la app, en base64. Se sube a los archivos de la oportunidad:
  // así queda allí aunque la oferta de Teamleader no se pueda crear.
  const pdfB64 = typeof b.pdf_base64 === 'string' ? b.pdf_base64.replace(/^data:[^,]*,/, '') : '';
  const pdfNombre = (limpio(b.pdf_nombre) || 'presupuesto.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  if (pdfB64.length > 14_000_000) return json({ error: 'El PDF es demasiado grande para subirlo.' }, 413);

  // --- el presupuesto ---------------------------------------------------------
  const { data: p } = await sb.from('presupuestos')
    .select('id, categoria, titulo, cliente_id, visita_id, total_venta, dto_global_pct, tl_quotation_id')
    .eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Ese presupuesto no existe.' }, 404);
  const yaOferta = limpio(p.tl_quotation_id);
  if (yaOferta && !pdfB64) {
    return json({ error: 'Ese presupuesto ya está en Teamleader.', tl_quotation_id: yaOferta }, 409);
  }

  const { data: lineas } = await sb.from('presupuesto_lineas')
    .select('orden, seccion, descripcion, detalle_tecnico, cantidad, unidad, precio_tarifa, precio_venta, iva, producto_ref')
    .eq('presupuesto_id', id).order('orden');
  if (!lineas || !lineas.length) return json({ error: 'Ese presupuesto no tiene líneas.' }, 400);

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

  // El cliente solo hace falta en un suelto, para crearle su oportunidad. En
  // uno de visita el cliente va en la oportunidad (antes se exigía aquí también
  // y los de visita, que no lo llevan en el presupuesto, no se subían nunca).
  // deno-lint-ignore no-explicit-any
  let cli: any = null;
  if (!dealId && !yaOferta) {
    if (p.cliente_id) {
      const { data } = await sb.from('clientes_cache').select('nombre, tl_id, tl_tipo').eq('id', p.cliente_id).maybeSingle();
      cli = data;
    }
    if (!cli?.tl_id) {
      return json({ error: 'El cliente de este presupuesto todavía no está en Teamleader. Ábrelo en la agenda y súbelo primero.' }, 409);
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
    return json({ ok: true, cliente: cli?.nombre || null, deal_id: dealId || null, iva,
      lineas: lineas.length, secciones: grupos.map((g) => g.titulo), total: p.total_venta });
  }

  await sb.from('presupuestos').update({ sync_estado: 'enviando', sync_error: null }).eq('id', id);

  let token = '';
  try { token = await tokenValido(sb); } catch (e) {
    const msg = (e as Error).message;
    await sb.from('presupuestos').update({ sync_estado: 'error', sync_error: msg }).eq('id', id);
    return json({ error: msg, sin_permiso: e instanceof SinPermiso }, e instanceof SinPermiso ? 409 : 502);
  }

  const fallos: string[] = [];
  let dealCreado = false;
  let embudo: string | null = null;
  let quotationId = yaOferta;
  // deno-lint-ignore no-explicit-any
  let deal: any = null;

  try {
    // Ya tenía oferta y solo se sube el PDF: su oportunidad es la de la oferta.
    if (!dealId && yaOferta) {
      const q = await crm(token, 'quotations.info', { id: yaOferta });
      dealId = limpio(q?.data?.deal?.id);
      if (!dealId) throw new Error('No se encuentra la oportunidad de la oferta que ya estaba en Teamleader.');
    }

    // Presupuesto suelto: se le crea su oportunidad.
    if (!dealId) {
      const f = await faseDeEmbudo(token, [limpio(p.categoria)]);
      embudo = f ? f.embudo : null;
      const fase = f ? f.fase : null;
      const r = await crm(token, 'deals.create', {
        lead: { customer: { type: cli.tl_tipo === 'company' ? 'company' : 'contact', id: cli.tl_id } },
        title: (limpio(p.titulo) || 'Presupuesto').slice(0, 255),
        ...(fase ? { phase_id: fase } : {}),
      });
      dealId = r?.data?.id || '';
      if (!dealId) throw new Error('El CRM no devolvió el id de la oportunidad.');
      dealCreado = true;
    }
    deal = await crm(token, 'deals.info', { id: dealId });
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from('presupuestos').update({ sync_estado: 'error', sync_error: msg }).eq('id', id);
    return json({ error: msg }, 502);
  }

  // --- 1 · la oferta de Teamleader, con sus líneas ------------------------------
  if (!quotationId) {
    try {
      // El IVA, del departamento de la oportunidad.
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
        // exchange_rate es obligatorio aunque sea euro («exchange_rate must be present»).
        currency: { code: 'EUR', exchange_rate: 1 },
        grouped_lines: grupos.map((g) => ({ section: { title: g.titulo }, line_items: items(g) })),
      });
      quotationId = r?.data?.id || '';
      if (!quotationId) throw new Error('El CRM no devolvió el id de la oferta.');
    } catch (e) {
      fallos.push('Oferta: ' + (e as Error).message);
    }
  }

  // --- 2 · el PDF de la app, a los archivos de la oportunidad -------------------
  let pdfSubido = false;
  if (pdfB64) {
    try {
      await subirArchivo(token, 'deal', dealId, pdfNombre, pdfB64);
      pdfSubido = true;
    } catch (e) {
      fallos.push('PDF: ' + (e as Error).message);
    }
  }

  // --- 3 · el importe en la oportunidad ----------------------------------------
  if (quotationId || pdfSubido) {
    try {
      await crm(token, 'deals.update', {
        id: dealId, estimated_value: { amount: dosDec(Number(p.total_venta) || 0), currency: 'EUR' },
      });
    } catch (e) { fallos.push('Importe: ' + (e as Error).message); }
  }

  const bien = !!(quotationId || pdfSubido);
  await sb.from('presupuestos').update({
    tl_quotation_id: quotationId || null,
    sync_estado: bien ? 'sincronizado' : 'error',
    sync_error: fallos.length ? fallos.join(' · ') : null,
    sync_at: new Date().toISOString(),
    ...(bien ? { estado: 'enviado' } : {}),
  }).eq('id', id);

  if (!bien) return json({ error: fallos.join(' · ') || 'No se pudo subir nada.' }, 502);

  // Dónde ha quedado, para que se pueda abrir desde la app y comprobarlo.
  return json({
    ok: true, tl_quotation_id: quotationId || null, pdf_subido: pdfSubido,
    deal_id: dealId, deal_creado: dealCreado,
    deal_url: limpio(deal?.data?.web_url) || null,
    deal_titulo: limpio(deal?.data?.title) || null,
    embudo: limpio(deal?.data?.current_phase?.deal_pipeline?.name || deal?.data?.deal_pipeline?.name) || embudo,
    aviso: fallos.length ? fallos.join(' · ') : null,
    lineas: lineas.length, total: p.total_venta,
  });
});
