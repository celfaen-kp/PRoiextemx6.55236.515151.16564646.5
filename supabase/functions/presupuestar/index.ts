// =============================================================================
// Sysefen · Edge Function `presupuestar`
//
// Recibe la ficha de una visita y devuelve el presupuesto: las líneas con su
// precio, los totales y lo que no cuadró. El cálculo está en `motor.js` y la
// aritmética de precios en `cadena.js`; aquí solo se trae la configuración
// vigente de Supabase, se llama a esas dos piezas y se guarda el resultado.
//
// LO QUE SE CONGELA: cada presupuesto guarda con qué versión de reglas y con
// qué tarifa se calculó. Reabierto dentro de un año enseña los números con los
// que se mandó, no los de la tarifa de entonces.
//
// EL MOTOR PROPONE, LA PERSONA CONFIRMA: las líneas se guardan tal cual salen,
// con su origen (qué regla, con qué valores). Lo que el motor no sabe no se lo
// inventa: sale como incidencia.
//
// DESPLIEGUE: "Verify JWT" ACTIVADO.
// QUIÉN PUEDE: presupuestos y Administración (sql/etapa40).
//
// USO (POST con JSON):
//   { "visita_id": "uuid", "categoria": "aire_acondicionado" }
//   { "categoria": "...", "datos": {...} }   sin visita: se presupuesta a secas
//   { ..., "cliente_id": "uuid", "titulo": "Aire · Casa de Ana" }
//   { ..., "ficha_id": "uuid" }        de qué ficha salen los datos
//   { ..., "datos": { ... } }          para probar sin tocar la visita
//   { ..., "dto_global_pct": 10 }      descuento al pie, lo elige la persona
//   { ..., "guardar": false }          calcula y devuelve, sin escribir nada
//   { ..., "lineas_extra": [ ... ] }   lo que pone la persona: la máquina, o
//                                      cualquier línea suelta. Van al final,
//                                      marcadas como 'manual'.
//
//   { "presupuesto_id": "uuid", "recalcular": true, "dto_global_pct": 10 }
//     Vuelve a sumar un presupuesto YA GUARDADO a partir de sus líneas, después
//     de que alguien las haya cambiado en la app. No vuelve a aplicar reglas:
//     respeta lo que haya puesto la persona, que para eso lo ha puesto. Así los
//     totales se calculan siempre en el mismo sitio y con la misma aritmética.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { calcular, MOTOR_VERSION } from './motor.js';
import { cadenaPrecios } from './cadena.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
  if (!yo || !['presupuestos', 'admin'].includes(String(yo.rol))) {
    return json({ error: 'El motor de presupuestos es de presupuestos y Administración.' }, 403);
  }

  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }

  // --- volver a sumar uno ya guardado ------------------------------------------
  if (b.recalcular === true) {
    const id = String(b.presupuesto_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Falta el presupuesto.' }, 400);
    const { data: pre } = await sb.from('presupuestos').select('id, dto_global_pct').eq('id', id).maybeSingle();
    if (!pre) return json({ error: 'Ese presupuesto no existe.' }, 404);
    const { data: ls } = await sb.from('presupuesto_lineas')
      .select('id, cantidad, precio_tarifa, dto_linea_pct').eq('presupuesto_id', id).order('orden');
    const dto = b.dto_global_pct != null ? Number(b.dto_global_pct) : Number(pre.dto_global_pct || 0);
    const t = cadenaPrecios(ls || [], dto);
    // El precio de venta de cada línea se guarda ya con el descuento al pie
    // repartido, que es como se imprime y como lo hace Teamleader.
    await Promise.all((ls || []).map((l, i) =>
      sb.from('presupuesto_lineas').update({ precio_venta: t.lineas[i].total }).eq('id', l.id)));
    await sb.from('presupuestos').update({
      total_bruto: t.total_bruto, total_dto_linea: t.total_dto_linea,
      dto_global_pct: dto, total_venta: t.total, updated_at: new Date().toISOString(),
    }).eq('id', id);
    return json({ ok: true, presupuesto_id: id, dto_global_pct: dto, totales: {
      bruto: t.total_bruto, dto_linea: t.total_dto_linea, subtotal: t.subtotal,
      dto_global: t.total_dto_global, total: t.total } });
  }
  const uuid = (v: unknown) => (/^[0-9a-f-]{36}$/i.test(String(v || '')) ? String(v) : null);
  const visitaId = uuid(b.visita_id);
  const categoria = String(b.categoria || '');
  if (!categoria) return json({ error: 'Falta la categoría.' }, 400);
  const guardar = b.guardar !== false;

  // --- los datos ---------------------------------------------------------------
  // De la ficha de una visita, o a secas: se presupuesta muchas veces sin haber
  // ido a ver nada, y la visita, cuando la hay, es antes y esto es después.
  let datos = b.datos && typeof b.datos === 'object' ? b.datos : null;
  let fichaId: string | null = uuid(b.ficha_id);
  let clienteId = uuid(b.cliente_id);
  if (visitaId) {
    const { data: visita } = await sb.from('visitas').select('id, cliente_id').eq('id', visitaId).maybeSingle();
    if (!visita) return json({ error: 'Esa visita no existe.' }, 404);
    clienteId = clienteId || visita.cliente_id || null;
    if (!datos) {
      const { data: ficha } = await sb.from('visita_fichas')
        .select('id, datos').eq('visita_id', visitaId).eq('categoria', categoria).maybeSingle();
      if (!ficha) return json({ error: 'Esa visita no tiene ficha de ' + categoria + '.' }, 400);
      datos = ficha.datos || {};
      fichaId = ficha.id;
    }
  } else if (!datos) {
    return json({ error: 'Sin visita hay que mandar los datos.' }, 400);
  }

  // --- la configuración vigente ------------------------------------------------
  const { data: conjunto } = await sb.from('conjuntos_reglas')
    .select('id, version').eq('categoria', categoria).is('vigente_hasta', null)
    .order('vigente_desde', { ascending: false }).limit(1).maybeSingle();
  if (!conjunto) {
    return json({ error: 'Todavía no hay reglas publicadas para ' + categoria + '.' }, 409);
  }

  const [variables, lookup, reglasR, manoObra, dtos] = await Promise.all([
    // por_cada (etapa 48): la variable se calcula por estancia. Sin pedirla
    // aquí, el motor la calculaba fuera y no encontraba los m².
    sb.from('variables_derivadas').select('codigo, formula, orden, por_cada').eq('categoria', categoria).order('orden'),
    sb.from('tablas_lookup').select('clave, entrada, valor').eq('categoria', categoria),
    sb.from('reglas').select('*').eq('conjunto_id', conjunto.id).eq('activa', true),
    sb.from('mano_obra').select('*').eq('conjunto_id', conjunto.id),
    sb.from('politica_descuentos').select('ambito, familia, descuento_pct').eq('activa', true),
  ]);

  // Las partidas a las que apunten esas reglas, con sus renglones.
  const partidaIds = [...new Set((reglasR.data || []).map((r) => r.partida_id).filter(Boolean))];
  // deno-lint-ignore no-explicit-any
  const partidas: Record<string, any> = {};
  if (partidaIds.length) {
    const { data: ps } = await sb.from('partidas').select('id, codigo, nombre').in('id', partidaIds);
    const { data: items } = await sb.from('partidas_items').select('*').in('partida_id', partidaIds).order('orden');
    (ps || []).forEach((p) => { partidas[p.id] = { codigo: p.codigo, nombre: p.nombre, items: [] }; });
    (items || []).forEach((it) => { if (partidas[it.partida_id]) partidas[it.partida_id].items.push(it); });
  }

  // El catálogo: solo las referencias que se pueden llegar a usar.
  // deno-lint-ignore no-explicit-any
  const refDeItem = (i: any) => i.producto_ref;
  const refs = [
    ...(reglasR.data || []).map((r) => r.producto_ref),
    ...Object.values(partidas).flatMap((p) => (p.items || []).map(refDeItem)),
  ].filter(Boolean);
  // deno-lint-ignore no-explicit-any
  const productos: Record<string, any> = {};
  let tarifaId: string | null = null;
  if (refs.length) {
    const { data: prods } = await sb.from('productos')
      .select('referencia, nombre, familia, unidad, precio_tarifa, detalle_tecnico, especificaciones, iva, tarifa_id, activo')
      .in('referencia', [...new Set(refs)]).eq('activo', true);
    (prods || []).forEach((p) => {
      // Si una referencia está en dos tarifas, manda la primera que llegue: el
      // catálogo las tiene separadas por proveedor y no se mezclan.
      if (!productos[p.referencia]) { productos[p.referencia] = p; tarifaId = tarifaId || p.tarifa_id; }
    });
  }

  // --- calcular -----------------------------------------------------------------
  const res = calcular(categoria, datos, {
    variables: variables.data || [],
    lookup: lookup.data || [],
    reglas: reglasR.data || [],
    partidas,
    manoObra: manoObra.data || [],
    productos,
    dtoLinea: (dtos.data || []).filter((d) => d.ambito === 'linea'),
  });

  const dtoGlobal = b.dto_global_pct != null
    ? Number(b.dto_global_pct)
    : Number(((dtos.data || []).find((d) => d.ambito === 'global') || {}).descuento_pct || 0);
  // Lo que ha puesto la persona va detrás de lo que propuso el motor, y marcado
  // como suyo: así se distingue de un vistazo qué salió de las reglas.
  // deno-lint-ignore no-explicit-any
  const extra = (Array.isArray(b.lineas_extra) ? b.lineas_extra : []).map((l: any) => ({
    producto_ref: l.producto_ref || null,
    descripcion: String(l.descripcion || '').slice(0, 300) || 'Línea añadida',
    detalle_tecnico: l.detalle_tecnico || null,
    especificaciones: Array.isArray(l.especificaciones) ? l.especificaciones : [],
    cantidad: Number(l.cantidad) || 1,
    unidad: l.unidad || 'ud',
    precio_tarifa: Number(l.precio_tarifa) || 0,
    dto_linea_pct: Number(l.dto_linea_pct) || 0,
    iva: l.iva == null ? 21 : Number(l.iva),
    seccion: l.seccion || 'Equipos',
    origen: 'manual',
    origen_regla_id: null,
    origen_inputs: null,
    confirmada: true,
  }));
  res.lineas = res.lineas.concat(extra);
  res.lineas.forEach((l, i) => { l.orden = i + 1; });

  const totales = cadenaPrecios(res.lineas, dtoGlobal);

  const incidenciasUtiles = extra.length
    ? res.incidencias.filter((i) => i.codigo !== 'sin_lineas')
    : res.incidencias;
  res.incidencias = incidenciasUtiles;

  const salida = {
    ok: true,
    categoria,
    visita_id: visitaId,
    motor_version: MOTOR_VERSION,
    conjunto_version: conjunto.version,
    variables: res.variables,
    incidencias: res.incidencias,
    dto_global_pct: dtoGlobal,
    totales: {
      bruto: totales.total_bruto,
      dto_linea: totales.total_dto_linea,
      subtotal: totales.subtotal,
      dto_global: totales.total_dto_global,
      total: totales.total,
    },
    lineas: res.lineas.map((l, i) => Object.assign({}, l, {
      importe: totales.lineas[i].total,
      importe_bruto: totales.lineas[i].bruto,
    })),
  };

  if (!guardar) return json(salida);

  // --- guardar --------------------------------------------------------------------
  const { data: creado, error: errP } = await sb.from('presupuestos').insert({
    visita_id: visitaId,
    ficha_id: fichaId,
    cliente_id: clienteId,
    titulo: String(b.titulo || '').trim().slice(0, 200) || null,
    categoria,
    conjunto_reglas_id: conjunto.id,
    tarifa_id: tarifaId,
    motor_version: MOTOR_VERSION,
    total_bruto: totales.total_bruto,
    total_dto_linea: totales.total_dto_linea,
    dto_global_pct: dtoGlobal,
    total_venta: totales.total,
    estado: res.incidencias.some((i) => i.nivel === 'error') ? 'revisar' : 'generado',
    confianza: res.incidencias.length ? (res.incidencias.some((i) => i.nivel === 'error') ? 'baja' : 'media') : 'alta',
  }).select().single();
  if (errP) return json({ error: 'No se pudo guardar el presupuesto: ' + errP.message }, 500);

  if (res.lineas.length) {
    const filas = res.lineas.map((l, i) => ({
      presupuesto_id: creado.id,
      orden: l.orden || i + 1,
      seccion: l.seccion || null,
      producto_ref: l.producto_ref || null,
      descripcion: l.descripcion,
      detalle_tecnico: l.detalle_tecnico || null,
      especificaciones: l.especificaciones || [],
      cantidad: l.cantidad,
      unidad: l.unidad || 'ud',
      precio_tarifa: l.precio_tarifa,
      dto_linea_pct: l.dto_linea_pct || 0,
      precio_venta: totales.lineas[i].total,
      iva: l.iva == null ? 21 : l.iva,
      origen: l.origen || 'regla',
      origen_regla_id: l.origen_regla_id || null,
      origen_inputs: l.origen_inputs || null,
      confirmada: l.confirmada !== false,
    }));
    const { error: errL } = await sb.from('presupuesto_lineas').insert(filas);
    if (errL) return json({ error: 'El presupuesto se guardó pero sus líneas no: ' + errL.message }, 500);
  }

  if (res.incidencias.length) {
    await sb.from('presupuesto_incidencias').insert(res.incidencias.map((i) => ({
      presupuesto_id: creado.id, nivel: i.nivel, codigo: i.codigo,
      mensaje: i.mensaje, campo: i.campo || null,
    })));
  }

  return json(Object.assign({ presupuesto_id: creado.id, estado: creado.estado }, salida));
});
