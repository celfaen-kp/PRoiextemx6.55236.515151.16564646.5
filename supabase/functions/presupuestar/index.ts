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
import { calcular, resumenDe, lineaManual, preciosProducto, MOTOR_VERSION } from './motor.js';
import { cadenaPrecios, totalCoste } from './cadena.js';
// El cálculo híbrido de fotovoltaica (v2 de Ramón + capítulos) vive en
// hibrido.js, compartido con las pruebas y los informes.
import { presupuestarFV } from './hibrido.js';
import { conInversoresDelCatalogo, calcularFV } from './fv.js';
import { leerRutaFV, ponerRutaFV, listaModeloFV, valorDesdeCosteUd, productoPara, conceptoPara } from './precios.js';
import { opcionesAero, sustituirEquiposAero, esInercia, esAcumuladorAcs } from './aero.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// El rol colaborador (sql/etapa76) trabaja solo con los clientes que tiene
// asignados (clientes_cache.colaborador_id). Esta función usa la clave maestra,
// así que la comprobación que en la app hace la base (RLS) aquí se hace a mano.
// deno-lint-ignore no-explicit-any
async function clienteDeColaborador(sb: any, yo: any, clienteId: string | null, visitaId?: string | null): Promise<boolean> {
  if (String(yo.rol) !== 'colaborador') return true;
  let cid = clienteId || null;
  if (!cid && visitaId) {
    const { data: v } = await sb.from('visitas').select('cliente_id').eq('id', visitaId).maybeSingle();
    cid = v?.cliente_id || null;
  }
  if (!cid) return false;
  const { data: c } = await sb.from('clientes_cache').select('colaborador_id').eq('id', cid).maybeSingle();
  return !!c && c.colaborador_id === yo.id;
}
const SOLO_SUS_CLIENTES = 'Como colaborador solo puedes trabajar con los clientes que te han asignado.';


/* =============================================================================
 * Catálogo propio desde las líneas (Enzo, 30-10-2026). Lo que se añade a mano a
 * un presupuesto, y lo que viene en las ofertas hechas en Teamleader, se da de
 * alta como producto en la tarifa «Catálogo propio» para encontrarlo la próxima
 * vez desde «Añadir del catálogo». Sin duplicar: si ya hay un producto activo
 * con ese nombre (o con ese id de producto de Teamleader) se usa ese. La línea
 * no cambia de precio ni de texto: solo se apunta en origen_inputs qué
 * referencia le corresponde, para no volver a mirarla.
 * ========================================================================== */
const FAMILIA_DE_TEXTO = (t: string) => {
  const s = String(t || '').toLowerCase();
  if (/mano de obra|montaje|instalaci[oó]n el[eé]ctrica|desplazamiento|puesta en marcha|\bhoras?\b|retirada|desmontaje|conexionado|limpieza/.test(s)) return 'mano_obra';
  if (/legalizaci|tr[aá]mite|certificad|bolet[ií]n|registro|industria|licencia|gesti[oó]n|subvenci|memoria t|proyecto|ingenier|documentaci/.test(s)) return 'tramite';
  if (/inversor|bater[ií]a|bomba de calor|aerotermia|panel|m[oó]dulo|cargador|split|acumulador|dep[oó]sito|unidad (interior|exterior)|termo|caldera|optimizador|microinversor|powerwall|sonnen|enphase|deye|huawei|fronius|midea|daikin|vaillant|wallbox|unistor|arotherm/.test(s)) return 'equipo';
  return 'material';
};
// deno-lint-ignore no-explicit-any
async function tarifaCatalogoPropio(sb: any): Promise<string | null> {
  const { data: prov } = await sb.from('proveedores').select('id').ilike('nombre', 'Sysefen%').limit(1).maybeSingle();
  if (!prov) return null;
  const { data: tarifa } = await sb.from('tarifas').select('id').eq('proveedor_id', prov.id).eq('nombre', 'Catálogo propio').maybeSingle();
  if (tarifa) return tarifa.id;
  const r = await sb.from('tarifas').insert({ proveedor_id: prov.id, nombre: 'Catálogo propio', vigente_desde: new Date().toISOString().slice(0, 10) }).select('id').single();
  return r.data?.id || null;
}
// deno-lint-ignore no-explicit-any
async function catalogarLineas(sb: any, lineas: any[], origen: 'presupuesto' | 'teamleader'): Promise<number> {
  let tarifaId: string | null | undefined;
  let creados = 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const l of lineas || []) {
    try {
      const nombre = String(l.descripcion || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (nombre.length < 3 || /^l[ií]nea de la oferta$/i.test(nombre)) continue;
      const oi = l.origen_inputs && typeof l.origen_inputs === 'object' && !Array.isArray(l.origen_inputs) ? l.origen_inputs : {};
      if (oi.producto_catalogo) continue;
      const tlId = oi.producto_tl ? String(oi.producto_tl) : null;
      let ref: string | null = null;
      if (tlId) {
        const { data } = await sb.from('productos').select('referencia').eq('tl_producto_id', tlId).eq('activo', true).limit(1).maybeSingle();
        if (data) ref = data.referencia;
      }
      if (!ref) {
        const patron = nombre.replace(/[\\%_]/g, (c) => '\\' + c);
        const { data } = await sb.from('productos').select('referencia').ilike('nombre', patron).eq('activo', true).limit(1).maybeSingle();
        if (data) ref = data.referencia;
      }
      if (!ref) {
        if (tarifaId === undefined) tarifaId = await tarifaCatalogoPropio(sb);
        if (!tarifaId) return creados;
        const venta = r2(Number(l.precio_tarifa) || Number(l.precio_venta) || 0);
        if (!(venta > 0)) continue;
        const costeBruto = l.precio_coste != null && Number(l.precio_coste) > 0 ? r2(Number(l.precio_coste)) : null;
        const coste = costeBruto != null && costeBruto <= venta ? costeBruto : null;
        const slug = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
        const referencia = 'SY-' + slug + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
        const fila = {
          tarifa_id: tarifaId, referencia, nombre, familia: FAMILIA_DE_TEXTO(nombre), unidad: String(l.unidad || 'ud').slice(0, 12) || 'ud',
          precio_tarifa: coste != null ? coste : venta, descuento_proveedor: 0, iva: Number(l.iva) > 0 ? Number(l.iva) : 21,
          detalle_tecnico: l.detalle_tecnico ? String(l.detalle_tecnico).slice(0, 1000) : null, especificaciones: [],
          atributos: Object.assign({ propio: true, origen }, coste != null ? {} : { sin_recargo: true }),
          recargo: coste != null ? Math.round(venta / coste * 1e6) / 1e6 : null, aplica_cdc: false, activo: true,
          tl_producto_id: tlId,
        };
        const { error } = await sb.from('productos').insert(fila);
        if (error) continue;
        ref = referencia; creados++;
      }
      if (l.id) await sb.from('presupuesto_lineas').update({ origen_inputs: Object.assign({}, oi, { producto_catalogo: ref }) }).eq('id', l.id);
    } catch (_) { /* una línea que no se puede catalogar no para el resto */ }
  }
  return creados;
}
/* =============================================================================
 * Precios cambiados a mano desde la app (Enzo, 10-11-2026): «necesito poder
 * cambiar los precios de la base de datos manualmente». Tres sitios: el modelo
 * fotovoltaico (motor_modelos), el catálogo (productos) y los conceptos de
 * precio fijo de las partidas (partidas_items). La aritmética está en
 * precios.js; aquí se lee, se escribe y se apunta cada cambio en
 * precios_cambios (sql/etapa104) para poder deshacerlo.
 *   { accion: 'precios_modelo_fv' }                       → la lista del modelo
 *   { accion: 'precios_guardar', cambios: [...], desde, presupuesto_id }
 *       { tipo: 'modelo_fv', ruta, valor }                 un valor del modelo
 *       { tipo: 'modelo_fv', ruta, coste_ud, factor }      el coste de una partida del desglose
 *       { tipo: 'producto', id | referencia, campos }      precio_tarifa, descuento_proveedor, recargo
 *       { tipo: 'producto', referencia, coste_ud, factor } un inversor del catálogo, desde el desglose
 *       { tipo: 'concepto', id, campos }                   precio_fijo, coste_fijo
 *       { tipo: 'linea', categoria, producto_ref, partida, descripcion, venta, coste }
 *                                                          lo corregido en una línea del presupuesto
 *   { accion: 'precios_deshacer', id }                    vuelve a lo de antes
 * ========================================================================== */
const COLS_PRECIO_PROD = 'id, referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, recargo, aplica_cdc, atributos, activo';
// deno-lint-ignore no-explicit-any
async function modeloFVVigente(sb: any) {
  const { data } = await sb.from('motor_modelos').select('id, version, datos').eq('categoria', 'solar').is('vigente_hasta', null)
    .order('vigente_desde', { ascending: false }).limit(1).maybeSingle();
  return data && data.datos ? data : null;
}
// deno-lint-ignore no-explicit-any
async function accionPrecios(sb: any, yo: any, b: any): Promise<Response> {
  const nOk = (v: unknown) => { if (v == null || String(v).trim() === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const r2 = (n: number) => Math.round(n * 100 + 1e-7) / 100;
  const { data: emp } = await sb.from('empleados').select('nombre').eq('id', yo.id).maybeSingle();
  const quien = { empleado_id: yo.id, nombre: (emp && emp.nombre) || null };

  if (b.accion === 'precios_modelo_fv') {
    const mod = await modeloFVVigente(sb);
    if (!mod) return json({ error: 'No hay modelo fotovoltaico vigente.' }, 404);
    // El nombre de cada coste de material: el de la partida que lo usa.
    const nombres: Record<string, string> = {};
    try {
      for (const sis of ['Fronius', 'Deye', 'Enphase']) for (const sumi of ['Monofásico', 'Trifásico']) for (const cubierta of ['Teja', 'Plana']) {
        // deno-lint-ignore no-explicit-any
        (calcularFV({ sis, sumi, cubierta, paneles_forzado: 12, cee: 'Sí' }, mod.datos) as any).partidas.forEach((x: any) => {
          if (x.ref && Array.isArray(x.ref.ruta) && x.ref.ruta[0] === 'precios' && x.ref.ruta.length === 3) { const k = x.ref.ruta.join('/'); if (!nombres[k]) nombres[k] = x.partida; }
        });
      }
    } catch (_) { /* sin nombres salen las claves */ }
    return json({ ok: true, version: mod.version, lista: listaModeloFV(mod.datos, nombres) });
  }

  if (b.accion === 'precios_guardar') {
    // deno-lint-ignore no-explicit-any
    const cambios: any[] = Array.isArray(b.cambios) ? b.cambios.slice(0, 200) : [];
    if (!cambios.length) return json({ error: 'No hay nada que guardar.' }, 400);
    const desde = b.desde === 'presupuesto' ? 'presupuesto' : 'configuracion';
    const presupuesto_id = /^[0-9a-f-]{36}$/i.test(String(b.presupuesto_id || '')) ? String(b.presupuesto_id) : null;
    // deno-lint-ignore no-explicit-any
    const hechos: any[] = [], errores: any[] = [], apuntes: any[] = [];
    // deno-lint-ignore no-explicit-any
    let mod: any = null, datos: any = null, modeloTocado = false;
    const lookups: Record<string, unknown[]> = {};
    const lookupDe = async (cat: string) => {
      if (!lookups[cat]) lookups[cat] = (await sb.from('tablas_lookup').select('clave, entrada, valor').eq('categoria', cat)).data || [];
      return lookups[cat];
    };
    const apunta = (origen: string, clave: string, descripcion: string, antes: unknown, despues: unknown) => {
      apuntes.push(Object.assign({ origen, clave, descripcion: String(descripcion || clave).slice(0, 300), antes, despues, desde, presupuesto_id }, quien));
    };
    // deno-lint-ignore no-explicit-any
    const ponProducto = async (p: any, campos: Record<string, unknown>, descripcion: string, queda?: unknown) => {
      // deno-lint-ignore no-explicit-any
      const antes: Record<string, any> = {}, despues: Record<string, any> = {};
      Object.keys(campos).forEach((k) => { const a = p[k] == null ? null : p[k], d = campos[k] == null ? null : campos[k]; if (String(a) !== String(d)) { antes[k] = a; despues[k] = d; } });
      if (!Object.keys(despues).length) return;
      const { error } = await sb.from('productos').update(despues).eq('id', p.id);
      if (error) { errores.push({ nombre: descripcion, error: error.message }); return; }
      apunta('producto', p.referencia, descripcion, Object.assign({ id: p.id }, antes), Object.assign({ id: p.id }, despues));
      hechos.push({ origen: 'producto', nombre: descripcion, antes, despues, queda: queda || null });
    };
    // deno-lint-ignore no-explicit-any
    const camposProducto = (c: any): Record<string, unknown> | string => {
      const f = c && typeof c === 'object' ? c : {};
      const out: Record<string, unknown> = {};
      if ('precio_tarifa' in f) { const n = nOk(f.precio_tarifa); if (n == null || Number.isNaN(n) || n < 0) return 'El precio de tarifa tiene que ser un número.'; out.precio_tarifa = r2(n); }
      if ('descuento_proveedor' in f) { const n = nOk(f.descuento_proveedor) ?? 0; if (Number.isNaN(n) || n < 0 || n >= 100) return 'El descuento de proveedor va de 0 a 99,99 %.'; out.descuento_proveedor = r2(n); }
      if ('recargo' in f) { const n = nOk(f.recargo); if (n != null && (Number.isNaN(n) || !(n > 0) || n > 50)) return 'El recargo propio es un multiplicador mayor que cero (1,30 = coste × 1,30), o en blanco para usar el de la categoría.'; out.recargo = n == null ? null : Math.round(n * 1e6) / 1e6; }
      if ('nombre' in f) { const t = String(f.nombre || '').trim().slice(0, 200); if (t.length < 3) return 'El nombre es demasiado corto.'; out.nombre = t; }
      if ('unidad' in f) out.unidad = String(f.unidad || 'ud').trim().slice(0, 12) || 'ud';
      if ('activo' in f) out.activo = f.activo !== false;
      return out;
    };

    for (const c of cambios) {
      const nombre = String((c && c.nombre) || '').slice(0, 200);
      try {
        if (c.tipo === 'modelo_fv') {
          if (!mod) { mod = await modeloFVVigente(sb); if (!mod) { errores.push({ nombre, error: 'No hay modelo fotovoltaico vigente.' }); continue; } datos = mod.datos; }
          const ruta = Array.isArray(c.ruta) ? c.ruta.map((x: unknown) => String(x)) : [];
          const valor = c.coste_ud != null ? valorDesdeCosteUd({ factor: c.factor }, c.coste_ud) : nOk(c.valor);
          if (valor == null || Number.isNaN(valor)) { errores.push({ nombre, error: 'Pon un número.' }); continue; }
          const r = ponerRutaFV(datos, ruta, valor);
          if (r.error) { errores.push({ nombre: nombre || ruta.join(' › '), error: r.error }); continue; }
          if (r.antes === r.despues) continue;
          datos = r.datos; modeloTocado = true;
          apunta('modelo_fv', ruta.join('/'), nombre || ruta.join(' › '), { ruta, valor: r.antes }, { ruta, valor: r.despues });
          hechos.push({ origen: 'modelo_fv', nombre: nombre || ruta.join(' › '), antes: { valor: r.antes }, despues: { valor: r.despues } });
        } else if (c.tipo === 'producto') {
          let q = sb.from('productos').select(COLS_PRECIO_PROD);
          q = /^[0-9a-f-]{36}$/i.test(String(c.id || '')) ? q.eq('id', String(c.id)) : q.eq('referencia', String(c.referencia || '')).eq('activo', true);
          const { data: prods } = await q.limit(5);
          if (!prods || !prods.length) { errores.push({ nombre, error: 'Ese producto no está en el catálogo.' }); continue; }
          for (const p of prods) {
            if (c.coste_ud != null) {   // el inversor del catálogo, corregido en el desglose FV
              const base = valorDesdeCosteUd({ factor: c.factor }, c.coste_ud);
              if (!(base > 0)) { errores.push({ nombre: nombre || p.nombre, error: 'Pon un coste mayor que cero.' }); continue; }
              await ponProducto(p, { precio_tarifa: r2(base) }, nombre || p.nombre);
              continue;
            }
            const campos = camposProducto(c.campos);
            if (typeof campos === 'string') { errores.push({ nombre: nombre || p.nombre, error: campos }); continue; }
            await ponProducto(p, campos, nombre || (campos.nombre as string) || p.nombre);
          }
        } else if (c.tipo === 'concepto') {
          const { data: it } = await sb.from('partidas_items').select('id, concepto_libre, precio_fijo, coste_fijo, producto_ref').eq('id', String(c.id || '')).maybeSingle();
          if (!it || it.producto_ref) { errores.push({ nombre, error: 'Ese concepto no existe o sale de un producto del catálogo.' }); continue; }
          const f = c.campos && typeof c.campos === 'object' ? c.campos : {};
          const pf = nOk(f.precio_fijo), cf = 'coste_fijo' in f ? nOk(f.coste_fijo) : undefined;
          if (pf == null || Number.isNaN(pf) || pf < 0) { errores.push({ nombre: nombre || it.concepto_libre, error: 'El precio tiene que ser un número.' }); continue; }
          if (cf !== undefined && cf != null && (Number.isNaN(cf) || cf < 0)) { errores.push({ nombre: nombre || it.concepto_libre, error: 'El coste tiene que ser un número.' }); continue; }
          // deno-lint-ignore no-explicit-any
          const antes: Record<string, any> = {}, despues: Record<string, any> = {};
          if (Number(it.precio_fijo) !== r2(pf)) { antes.precio_fijo = it.precio_fijo; despues.precio_fijo = r2(pf); }
          if (cf !== undefined && String(it.coste_fijo == null ? null : Number(it.coste_fijo)) !== String(cf == null ? null : r2(cf))) { antes.coste_fijo = it.coste_fijo; despues.coste_fijo = cf == null ? null : r2(cf); }
          if (!Object.keys(despues).length) continue;
          const { error } = await sb.from('partidas_items').update(despues).eq('id', it.id);
          if (error) { errores.push({ nombre: nombre || it.concepto_libre, error: error.message }); continue; }
          apunta('concepto', it.id, nombre || it.concepto_libre, Object.assign({ id: it.id }, antes), Object.assign({ id: it.id }, despues));
          hechos.push({ origen: 'concepto', nombre: nombre || it.concepto_libre, antes, despues });
        } else if (c.tipo === 'linea') {
          // Lo corregido en una línea del presupuesto: se busca de dónde sale su precio.
          const cat = String(c.categoria || '');
          const lookup = await lookupDe(cat);
          const titulo = nombre || String(c.descripcion || '').slice(0, 200);
          const ref = String(c.producto_ref || '').trim();
          let hecho = false;
          if (ref) {
            const { data: prods } = await sb.from('productos').select(COLS_PRECIO_PROD).eq('referencia', ref).eq('activo', true).limit(5);
            for (const p of prods || []) {
              const r = productoPara(p, lookup, c.venta, c.coste);
              if (r.error) { errores.push({ nombre: titulo, error: r.error }); hecho = true; continue; }
              await ponProducto(p, r.cambios, p.nombre, r.queda);
              hecho = true;
            }
          }
          if (!hecho && c.partida) {
            const { data: part } = await sb.from('partidas').select('id, agrupada').eq('categoria', cat).eq('codigo', String(c.partida)).maybeSingle();
            if (part && part.agrupada) { errores.push({ nombre: titulo, error: 'Es una partida agrupada: su precio es la suma de varios productos. Cambia esos productos en Ajustes → Precios.' }); continue; }
            if (part) {
              const { data: items } = await sb.from('partidas_items').select('id, concepto_libre, precio_fijo, coste_fijo, producto_ref').eq('partida_id', part.id);
              const limpio = (t: unknown) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
              // deno-lint-ignore no-explicit-any
              const sinProducto = (items || []).filter((x: any) => !x.producto_ref);
              // deno-lint-ignore no-explicit-any
              const it = sinProducto.find((x: any) => limpio(x.concepto_libre) === limpio(c.descripcion)) || (sinProducto.length === 1 ? sinProducto[0] : null);
              if (it) {
                const r = conceptoPara(it, lookup, c.venta, c.coste);
                if (r.error) { errores.push({ nombre: titulo, error: r.error }); continue; }
                // deno-lint-ignore no-explicit-any
                const antes: Record<string, any> = {}, despues: Record<string, any> = {};
                // deno-lint-ignore no-explicit-any
                Object.keys(r.cambios).forEach((k) => { const a = (it as any)[k] == null ? null : Number((it as any)[k]), d = (r.cambios as any)[k]; if (a !== d) { antes[k] = a; despues[k] = d; } });
                if (Object.keys(despues).length) {
                  const { error } = await sb.from('partidas_items').update(despues).eq('id', it.id);
                  if (error) { errores.push({ nombre: titulo, error: error.message }); continue; }
                  apunta('concepto', it.id, it.concepto_libre, Object.assign({ id: it.id }, antes), Object.assign({ id: it.id }, despues));
                  hechos.push({ origen: 'concepto', nombre: it.concepto_libre, antes, despues, queda: r.queda });
                }
                hecho = true;
              }
            }
          }
          if (!hecho) errores.push({ nombre: titulo, error: 'Esta línea no sale de un precio guardado (la calcula el motor o se escribió a mano): no hay nada que cambiar en la base.' });
        } else errores.push({ nombre, error: 'Cambio desconocido.' });
      } catch (e) { errores.push({ nombre, error: String((e as Error)?.message || e) }); }
    }
    if (modeloTocado && mod) {
      const { error } = await sb.from('motor_modelos').update({ datos }).eq('id', mod.id);
      if (error) return json({ error: 'No se pudo guardar el modelo fotovoltaico: ' + error.message, errores }, 500);
    }
    if (apuntes.length) { try { await sb.from('precios_cambios').insert(apuntes); } catch (_) { /* sin historial el cambio vale igual */ } }
    return json({ ok: true, hechos, errores });
  }

  if (b.accion === 'precios_deshacer') {
    const id = String(b.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Falta el cambio.' }, 400);
    const { data: c } = await sb.from('precios_cambios').select('*').eq('id', id).maybeSingle();
    if (!c) return json({ error: 'Ese cambio no está en el historial.' }, 404);
    if (c.deshecho_en) return json({ error: 'Ese cambio ya se deshizo.' }, 409);
    // deno-lint-ignore no-explicit-any
    const antes = (c.antes || {}) as Record<string, any>;
    if (c.origen === 'modelo_fv') {
      const mod = await modeloFVVigente(sb);
      if (!mod) return json({ error: 'No hay modelo fotovoltaico vigente.' }, 404);
      const ahora = leerRutaFV(mod.datos, antes.ruta);
      if (ahora === undefined) return json({ error: 'Ese precio ya no está en el modelo.' }, 409);
      const r = ponerRutaFV(mod.datos, antes.ruta, antes.valor, { vacio: true });
      if (r.error) return json({ error: r.error }, 400);
      const { error } = await sb.from('motor_modelos').update({ datos: r.datos }).eq('id', mod.id);
      if (error) return json({ error: 'No se pudo guardar el modelo: ' + error.message }, 500);
    } else if (c.origen === 'producto' || c.origen === 'concepto') {
      const campos = Object.assign({}, antes); delete campos.id;
      if (!antes.id || !Object.keys(campos).length) return json({ error: 'Ese cambio no guarda lo que había: no se puede deshacer.' }, 409);
      const { error } = await sb.from(c.origen === 'producto' ? 'productos' : 'partidas_items').update(campos).eq('id', antes.id);
      if (error) return json({ error: 'No se pudo deshacer: ' + error.message }, 500);
    } else return json({ error: 'Ese cambio no se puede deshacer.' }, 400);
    await sb.from('precios_cambios').update({ deshecho_en: new Date().toISOString(), deshecho_por: quien.nombre }).eq('id', id);
    return json({ ok: true });
  }
  return json({ error: 'Acción de precios desconocida.' }, 400);
}

const COLS_CATALOGAR = 'id, descripcion, detalle_tecnico, unidad, precio_tarifa, precio_venta, precio_coste, iva, origen_inputs';

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
  if (!yo || !['presupuestos', 'admin', 'colaborador'].includes(String(yo.rol))) {
    return json({ error: 'El motor de presupuestos es de presupuestos, colaboradores y Administración.' }, 403);
  }

  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }

  // --- precios cambiados a mano (Enzo, 10-11-2026) -------------------------------
  if (typeof b.accion === 'string' && b.accion.startsWith('precios_')) {
    if (!['presupuestos', 'admin'].includes(String(yo.rol))) return json({ error: 'Cambiar precios es de presupuestos y Administración.' }, 403);
    return await accionPrecios(sb, yo, b);
  }

  // --- un producto nuevo en el catálogo propio (Enzo, 27-10-2026) ---------------
  // Lo que no está en ninguna tarifa se crea aquí al añadirlo a un presupuesto y
  // queda para el futuro: precio_tarifa = coste y recargo = venta ÷ coste (si no
  // hay coste, precio_tarifa = venta sin recargo).
  if (b.accion === 'crear_producto') {
    if (yo.rol === 'colaborador') return json({ error: 'Crear productos es de presupuestos y Administración.' }, 403);
    const nombre = String(b.nombre || '').trim().slice(0, 200);
    const venta = Math.round((Number(b.venta) || 0) * 100) / 100;
    const coste = b.coste == null || b.coste === '' ? null : Math.round((Number(b.coste) || 0) * 100) / 100;
    const unidad = String(b.unidad || 'ud').trim().slice(0, 12) || 'ud';
    const FAMILIAS = ['equipo', 'material', 'mano_obra', 'servicio', 'tramite', 'otro'];
    const familia = FAMILIAS.includes(String(b.familia)) ? String(b.familia) : 'material';
    const detalle = String(b.detalle_tecnico || '').trim().slice(0, 1000) || null;
    if (nombre.length < 3) return json({ error: 'Pon un nombre de al menos 3 letras.' }, 400);
    if (!(venta > 0)) return json({ error: 'Pon el precio de venta.' }, 400);
    if (coste != null && coste > venta) return json({ error: 'El coste no puede ser mayor que la venta.' }, 400);
    const { data: prov } = await sb.from('proveedores').select('id').ilike('nombre', 'Sysefen%').limit(1).maybeSingle();
    if (!prov) return json({ error: 'No existe el proveedor Sysefen en el catálogo.' }, 500);
    let { data: tarifa } = await sb.from('tarifas').select('id').eq('proveedor_id', prov.id).eq('nombre', 'Catálogo propio').maybeSingle();
    if (!tarifa) {
      const r = await sb.from('tarifas').insert({ proveedor_id: prov.id, nombre: 'Catálogo propio', vigente_desde: new Date().toISOString().slice(0, 10) }).select('id').single();
      if (r.error) return json({ error: 'No se pudo crear la tarifa propia: ' + r.error.message }, 500);
      tarifa = r.data;
    }
    const slug = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
    const referencia = 'SY-' + slug + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const fila = {
      tarifa_id: tarifa.id, referencia, nombre, familia, unidad,
      precio_tarifa: coste != null && coste > 0 ? coste : venta, descuento_proveedor: 0, iva: 21,
      detalle_tecnico: detalle, especificaciones: [],
      atributos: coste != null && coste > 0 ? { propio: true } : { propio: true, sin_recargo: true },
      recargo: coste != null && coste > 0 ? Math.round(venta / coste * 1e6) / 1e6 : null, aplica_cdc: false, activo: true,
    };
    const { data: prod, error: errProd } = await sb.from('productos').insert(fila).select('referencia, nombre, familia, unidad, precio_tarifa, detalle_tecnico, especificaciones, iva, recargo').single();
    if (errProd) return json({ error: 'No se pudo crear el producto: ' + errProd.message }, 500);
    return json({ ok: true, producto: Object.assign({}, prod, { venta, coste }) });
  }

  // --- volver a sumar uno ya guardado ------------------------------------------
  if (b.recalcular === true) {
    const id = String(b.presupuesto_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Falta el presupuesto.' }, 400);
    const { data: pre } = await sb.from('presupuestos').select('id, dto_global_pct, cliente_id, visita_id, categoria').eq('id', id).maybeSingle();
    if (!pre) return json({ error: 'Ese presupuesto no existe.' }, 404);
    if (!(await clienteDeColaborador(sb, yo, pre.cliente_id, pre.visita_id))) return json({ error: SOLO_SUS_CLIENTES }, 403);
    // Líneas nuevas al modificar un presupuesto guardado (Enzo, 6-11-2026): del
    // catálogo (con el recargo de la categoría, como las añadidas al generar) o
    // libres (lo escrito es la venta). Se insertan detrás de las que hay.
    // deno-lint-ignore no-explicit-any
    const nuevas: any[] = Array.isArray(b.lineas_nuevas) ? b.lineas_nuevas.slice(0, 100) : [];
    if (nuevas.length) {
      const { data: lookupRec } = await sb.from('tablas_lookup').select('clave, entrada, valor').eq('categoria', String(pre.categoria || ''));
      const refsNuevas = [...new Set(nuevas.map((l) => String(l.producto_ref || '')).filter(Boolean))];
      // deno-lint-ignore no-explicit-any
      const prodsNuevas: Record<string, any> = {};
      if (refsNuevas.length) {
        const cols = 'referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, detalle_tecnico, especificaciones, iva, atributos, activo';
        let prods = (await sb.from('productos').select(cols + ', recargo, aplica_cdc').in('referencia', refsNuevas)).data;
        if (!prods) prods = (await sb.from('productos').select(cols).in('referencia', refsNuevas)).data;
        (prods || []).forEach((p) => { if (!prodsNuevas[p.referencia]) prodsNuevas[p.referencia] = p; });
      }
      const { data: ultima } = await sb.from('presupuesto_lineas').select('orden').eq('presupuesto_id', id).order('orden', { ascending: false }).limit(1).maybeSingle();
      let orden = Number(ultima?.orden || 0);
      const filas = nuevas.map((l) => {
        const prod = prodsNuevas[String(l.producto_ref || '')] || null;
        const m = lineaManual(l, prod, lookupRec || []);
        if (!prod && !String(l.descripcion || '').trim()) return null;
        // El coste del catálogo se puede corregir al añadir la línea (13-11-2026):
        // si viene escrito, manda sobre el que sale del producto.
        if (prod && l.precio_coste != null && l.precio_coste !== '' && Number.isFinite(Number(l.precio_coste)) && Number(l.precio_coste) >= 0) {
          m.precio_coste = Math.round(Number(l.precio_coste) * 100) / 100;
          m.origen_inputs = Object.assign({}, m.origen_inputs || {}, { coste_escrito: m.precio_coste });
        }
        orden += 1;
        return {
          presupuesto_id: id, orden, seccion: m.seccion || 'Otros', producto_ref: m.producto_ref, descripcion: m.descripcion,
          detalle_tecnico: m.detalle_tecnico, especificaciones: m.especificaciones || [], cantidad: m.cantidad, unidad: m.unidad,
          precio_tarifa: m.precio_tarifa, precio_coste: m.precio_coste, dto_linea_pct: m.dto_linea_pct || 0, precio_venta: 0,
          iva: m.iva == null ? 21 : m.iva, origen: 'manual', origen_regla_id: null, origen_inputs: m.origen_inputs, confirmada: true,
        };
      }).filter(Boolean);
      if (filas.length) {
        const { error: errN } = await sb.from('presupuesto_lineas').insert(filas);
        if (errN) return json({ error: 'No se pudieron añadir las líneas nuevas: ' + errN.message }, 500);
      }
    }
    const { data: ls } = await sb.from('presupuesto_lineas')
      .select('id, cantidad, precio_tarifa, precio_coste, dto_linea_pct').eq('presupuesto_id', id).order('orden');
    const dto = b.dto_global_pct != null ? Number(b.dto_global_pct) : Number(pre.dto_global_pct || 0);
    const t = cadenaPrecios(ls || [], dto);
    const coste = totalCoste(ls || []);
    // El precio de venta de cada línea se guarda ya con el descuento al pie
    // repartido, que es como se imprime y como lo hace Teamleader.
    await Promise.all((ls || []).map((l, i) =>
      sb.from('presupuesto_lineas').update({ precio_venta: t.lineas[i].total }).eq('id', l.id)));
    await sb.from('presupuestos').update({
      total_bruto: t.total_bruto, total_dto_linea: t.total_dto_linea,
      dto_global_pct: dto, total_venta: t.total, total_coste: coste.total, updated_at: new Date().toISOString(),
    }).eq('id', id);
    // Las líneas añadidas a mano pasan al catálogo propio (30-10-2026).
    let catalogados = 0;
    try {
      const { data: sueltas } = await sb.from('presupuesto_lineas').select(COLS_CATALOGAR).eq('presupuesto_id', id).eq('origen', 'manual').is('producto_ref', null);
      catalogados = await catalogarLineas(sb, sueltas || [], 'presupuesto');
    } catch (_) { /* el catálogo no para el recálculo */ }
    return json({ ok: true, presupuesto_id: id, dto_global_pct: dto, catalogados, totales: {
      bruto: t.total_bruto, dto_linea: t.total_dto_linea, subtotal: t.subtotal,
      dto_global: t.total_dto_global, total: t.total, coste: coste.total, lineas_sin_coste: coste.lineas_sin_coste },
      // Interno (1.4): lo que gana Sysefen y el descuento que aguanta. Nunca al cliente.
      resumen: resumenDe(ls || []) });
  }
  const uuid = (v: unknown) => (/^[0-9a-f-]{36}$/i.test(String(v || '')) ? String(v) : null);
  const visitaId = uuid(b.visita_id);
  const categoria = String(b.categoria || '');
  if (!categoria) return json({ error: 'Falta la categoría.' }, 400);
  const guardar = b.guardar !== false;
  // Presupuesto libre (Enzo, 6-11-2026): sin datos que rellenar ni reglas; se
  // monta de cero con líneas del catálogo o libres. También sirve para las
  // categorías que aún no tienen reglas publicadas (electricidad).
  const libre = b.libre === true;

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
    if (!libre) return json({ error: 'Sin visita hay que mandar los datos.' }, 400);
    datos = {};
  }
  // Colaborador: solo con una visita o un cliente suyos (sin cliente, nada).
  if (!(await clienteDeColaborador(sb, yo, clienteId, visitaId))) return json({ error: SOLO_SUS_CLIENTES }, 403);

  // --- la configuración vigente ------------------------------------------------
  const { data: conjunto } = await sb.from('conjuntos_reglas')
    .select('id, version').eq('categoria', categoria).is('vigente_hasta', null)
    .order('vigente_desde', { ascending: false }).limit(1).maybeSingle();
  if (!conjunto && !libre) {
    return json({ error: 'Todavía no hay reglas publicadas para ' + categoria + '.' }, 409);
  }
  const conjuntoId: string | null = conjunto ? conjunto.id : null;

  const [variables, lookup, reglasR, manoObra, dtos] = await Promise.all([
    // por_cada (etapa 48): la variable se calcula por estancia. Sin pedirla
    // aquí, el motor la calculaba fuera y no encontraba los m².
    sb.from('variables_derivadas').select('codigo, formula, orden, por_cada').eq('categoria', categoria).order('orden'),
    sb.from('tablas_lookup').select('clave, entrada, valor').eq('categoria', categoria),
    conjuntoId ? sb.from('reglas').select('*').eq('conjunto_id', conjuntoId).eq('activa', true) : Promise.resolve({ data: [] }),
    conjuntoId ? sb.from('mano_obra').select('*').eq('conjunto_id', conjuntoId) : Promise.resolve({ data: [] }),
    sb.from('politica_descuentos').select('ambito, familia, descuento_pct').eq('activa', true),
  ]);

  // Las partidas a las que apunten esas reglas, con sus renglones.
  const partidaIds = [...new Set((reglasR.data || []).map((r) => r.partida_id).filter(Boolean))];
  // deno-lint-ignore no-explicit-any
  const partidas: Record<string, any> = {};
  if (partidaIds.length) {
    // agrupada y detalle_tecnico (etapa 72b); si la base aún no los tiene, se piden sin ellos.
    let ps = (await sb.from('partidas').select('id, codigo, nombre, agrupada, detalle_tecnico').in('id', partidaIds)).data;
    if (!ps) ps = (await sb.from('partidas').select('id, codigo, nombre').in('id', partidaIds)).data;
    const { data: items } = await sb.from('partidas_items').select('*').in('partida_id', partidaIds).order('orden');
    (ps || []).forEach((p) => { partidas[p.id] = { codigo: p.codigo, nombre: p.nombre, agrupada: !!p.agrupada, detalle_tecnico: p.detalle_tecnico || null, items: [] }; });
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
    // recargo y aplica_cdc (1.4, etapa 72 del 09-10-2026): el margen propio del
    // producto. Si la base aún no tiene las columnas, se piden sin ellas.
    const columnas = 'referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, detalle_tecnico, especificaciones, iva, atributos, tarifa_id, activo';
    let prods = (await sb.from('productos').select(columnas + ', recargo, aplica_cdc').in('referencia', [...new Set(refs)]).eq('activo', true)).data;
    if (!prods) prods = (await sb.from('productos').select(columnas).in('referencia', [...new Set(refs)]).eq('activo', true)).data;
    (prods || []).forEach((p) => {
      // Si una referencia está en dos tarifas, manda la primera que llegue: el
      // catálogo las tiene separadas por proveedor y no se mezclan.
      if (!productos[p.referencia]) { productos[p.referencia] = p; tarifaId = tarifaId || p.tarifa_id; }
    });
  }

  // --- calcular -----------------------------------------------------------------
  const cfg = {
    variables: variables.data || [],
    lookup: lookup.data || [],
    reglas: reglasR.data || [],
    partidas,
    manoObra: manoObra.data || [],
    productos,
    dtoLinea: (dtos.data || []).filter((d) => d.ambito === 'linea'),
  };
  // Fotovoltaica: si hay un modelo v2 vigente (sql/etapa74), manda él. Sin
  // modelo (todavía no se ha pegado el SQL), todo sigue como antes.
  // deno-lint-ignore no-explicit-any
  let modeloFV: any = null;
  if (categoria === 'solar' && !libre) {
    const { data: mod } = await sb.from('motor_modelos').select('id, version, datos')
      .eq('categoria', 'solar').is('vigente_hasta', null)
      .order('vigente_desde', { ascending: false }).limit(1).maybeSingle();
    if (mod && mod.datos) modeloFV = mod;
    // Los inversores del catálogo se suman a los del modelo (Enzo, 4-11-2026):
    // así salen todos en el desplegable y el automático elige también entre
    // ellos (Verto 20 Plus para 40 paneles con batería, Deye grandes…).
    if (modeloFV) {
      const { data: invs } = await sb.from('productos').select('referencia, nombre, familia, precio_tarifa, descuento_proveedor')
        .eq('familia', 'inversor').eq('activo', true);
      if (invs && invs.length) modeloFV = Object.assign({}, modeloFV, { datos: conInversoresDelCatalogo(modeloFV.datos, invs) });
    }
  }
  // Batería compatible con el inversor (Enzo, 26-10-2026): Deye solo con WECO o
  // Deye, Enphase con Enphase o Tesla, Fronius con BYD, Fronius Reserva o Tesla.
  // Si la ficha o la opción traen otra, se cambia a la primera compatible y se avisa.
  let avisoBateria: string | null = null;
  if (modeloFV && datos) {
    const COMPAT: Record<string, string[]> = { deye: ['weco', 'deye'], enphase: ['enphase', 'tesla'], fronius: ['byd', 'fronius', 'tesla'] };
    const marcaInv = String(datos.inversor_marca || 'fronius').toLowerCase();
    const conBat = String(datos.baterias || '') === 'si' || Number(datos.baterias_kwh) > 0;
    const ok = COMPAT[marcaInv] || COMPAT.fronius;
    const marcaBat = String(datos.bateria_marca || '').toLowerCase();
    if (conBat && marcaBat && !ok.includes(marcaBat)) {
      datos = Object.assign({}, datos, { bateria_marca: ok[0], bateria_ref: null });
      avisoBateria = 'Batería ' + marcaBat.toUpperCase() + ' no va con inversor ' + marcaInv.toUpperCase() + ': se presupuesta con ' + ok[0].toUpperCase() + '. Las compatibles son ' + ok.map((x) => x.toUpperCase()).join(', ') + '.';
    }
  }
  // El inversor elegido a mano puede no estar entre los productos de las reglas
  // (Primo 4.6 Plus…): se trae del catálogo por su nombre (26-10-2026).
  if (modeloFV && datos && typeof datos.inversor_modelo === 'string' && datos.inversor_modelo.trim()) {
    const base = datos.inversor_modelo.replace(/^fronius\s+/i, '').trim();
    const colsInv = 'referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, detalle_tecnico, especificaciones, iva, atributos, tarifa_id, activo';
    let inv = (await sb.from('productos').select(colsInv + ', recargo, aplica_cdc').ilike('nombre', '%' + base + '%').eq('activo', true)).data;
    if (!inv) inv = (await sb.from('productos').select(colsInv).ilike('nombre', '%' + base + '%').eq('activo', true)).data;
    (inv || []).forEach((p) => { if (!cfg.productos[p.referencia]) cfg.productos[p.referencia] = p; });
  }
  // Sin el modelo v2 no hay inversor conocido: el proyecto técnico se decide
  // por kWp (la fórmula de `proyecto` mira inversor_kw y, si es 0, kwp).
  if (categoria === 'solar' && datos && datos.inversor_kw == null) datos = Object.assign({}, datos, { inversor_kw: 0 });
  // deno-lint-ignore no-explicit-any
  const res: any = libre
    ? { lineas: [], incidencias: [], variables: {}, resumen: null, recargo_sobre_coste: null }
    : modeloFV ? presupuestarFV(datos, modeloFV, cfg) : calcular(categoria, datos, cfg);
  // Aerotermia: depósito de inercia y acumulador de ACS elegidos a mano (6-11-2026).
  // deno-lint-ignore no-explicit-any
  let opcionesAerotermia: any = null;
  if (categoria === 'aerotermia' && !libre) {
    const colsAero = 'referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, detalle_tecnico, iva, atributos, activo, recargo, aplica_cdc';
    const { data: equipos } = await sb.from('productos').select(colsAero).eq('activo', true)
      .or("familia.eq.deposito_inercia,nombre.ilike.%inercia%,nombre.ilike.%unistor%,nombre.ilike.%acumulador de acs%,nombre.ilike.%deposito de acs%,nombre.ilike.%depósito de acs%");
    const lista = (equipos || []).filter((p) => esInercia(p) || esAcumuladorAcs(p));
    opcionesAerotermia = opcionesAero(lista, cfg.lookup);
    if (datos && (datos.inercia_ref || datos.acs_ref)) {
      // deno-lint-ignore no-explicit-any
      const porRef: Record<string, any> = {};
      lista.forEach((p) => { porRef[p.referencia] = p; });
      res.lineas = sustituirEquiposAero(res.lineas, datos, porRef, cfg.lookup, res.incidencias);
    }
  }
  if (avisoBateria) res.incidencias.unshift({ nivel: 'aviso', codigo: 'bateria_incompatible', mensaje: avisoBateria, campo: 'bateria_marca' });
  const motorVersion = libre ? 'libre' : modeloFV ? res.motor_version : MOTOR_VERSION;

  const dtoGlobal = b.dto_global_pct != null
    ? Number(b.dto_global_pct)
    : Number(((dtos.data || []).find((d) => d.ambito === 'global') || {}).descuento_pct || 0);
  // Lo que ha puesto la persona va detrás de lo que propuso el motor, y marcado
  // como suyo. Si viene del catálogo, su precio pasa por el mismo recargo que
  // aplica el motor (en fotovoltaica el catálogo es coste): ver lineaManual().
  // deno-lint-ignore no-explicit-any
  const extrasBrutos: any[] = Array.isArray(b.lineas_extra) ? b.lineas_extra : [];
  // La batería elegida en el desplegable del presupuesto (21-10-2026). Las de
  // WECO y Deye no tienen regla: entran como línea del catálogo con su recargo,
  // tantas como hagan falta para los kWh pedidos. Las demás marcas las pone el
  // motor por capítulos con marca y kWh.
  const bateriaRef = datos && typeof datos.bateria_ref === 'string' ? datos.bateria_ref : '';
  const bateriaAuto = !!bateriaRef && String(datos.baterias || '') === 'si' && ['weco', 'deye'].includes(String(datos.bateria_marca || '').toLowerCase());
  if (bateriaAuto) extrasBrutos.push({ producto_ref: bateriaRef, cantidad: 1, _auto: 'bateria' });
  // deno-lint-ignore no-explicit-any
  const productosExtra: Record<string, any> = {};
  const refsExtra = [...new Set(extrasBrutos.map((l) => String(l.producto_ref || '')).filter(Boolean))];
  if (refsExtra.length) {
    const cols = 'referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, detalle_tecnico, iva, atributos, activo';
    let prods = (await sb.from('productos').select(cols + ', recargo, aplica_cdc').in('referencia', refsExtra)).data;
    if (!prods) prods = (await sb.from('productos').select(cols).in('referencia', refsExtra)).data;
    (prods || []).forEach((p) => { if (!productosExtra[p.referencia]) productosExtra[p.referencia] = p; });
  }
  const extra = extrasBrutos.map((l) => {
    const prod = productosExtra[String(l.producto_ref || '')] || null;
    if (l._auto === 'bateria' && prod) {
      const cap = Number((prod.atributos || {}).capacidad_kwh) || 0;
      const kwh = Number(datos.baterias_kwh) || 0;
      l.descripcion = prod.nombre; l.unidad = prod.unidad || 'ud'; l.seccion = 'Almacenamiento';
      l.cantidad = cap > 0 && kwh > 0 ? Math.max(1, Math.ceil(kwh / cap - 0.001)) : 1;
    }
    const linea = lineaManual(l, prod, cfg.lookup);
    if (l._auto === 'bateria') linea.origen_inputs = { auto: 'bateria', ref: String(l.producto_ref || '') };
    return linea;
  });
  res.lineas = res.lineas.concat(extra);
  // Líneas quitadas desde la pantalla mientras se genera (Enzo, 21-10-2026): se
  // identifican por descripción (y referencia), así siguen fuera al recalcular.
  const quitar = new Set((Array.isArray(b.lineas_quitar) ? b.lineas_quitar : []).map((x) => String(x || '')).filter(Boolean));
  const claveLinea = (l: { producto_ref?: string | null; descripcion?: string }) => String(l.producto_ref || '') + '|' + String(l.descripcion || '');
  if (quitar.size) res.lineas = res.lineas.filter((l) => !quitar.has(claveLinea(l)));
  // Líneas retocadas desde la pantalla antes de guardar (Enzo, 27-10-2026): por
  // clave, y lo que se cambia se aplica encima de lo que calcula el motor.
  // deno-lint-ignore no-explicit-any
  const ajustes: any[] = Array.isArray(b.lineas_ajustar) ? b.lineas_ajustar : [];
  if (ajustes.length) {
    const numOk = (v: unknown) => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
    res.lineas.forEach((l) => {
      const a = ajustes.find((x) => String(x.clave || '') === claveLinea(l));
      if (!a) return;
      const nuevo: Record<string, unknown> = {};
      if (typeof a.descripcion === 'string' && a.descripcion.trim()) nuevo.descripcion = a.descripcion.trim().slice(0, 300);
      if (a.detalle_tecnico != null) nuevo.detalle_tecnico = String(a.detalle_tecnico).trim().slice(0, 2000) || null;
      if (numOk(a.cantidad) != null && numOk(a.cantidad)! > 0) nuevo.cantidad = numOk(a.cantidad);
      if (numOk(a.precio_tarifa) != null && numOk(a.precio_tarifa)! >= 0) nuevo.precio_tarifa = Math.round(numOk(a.precio_tarifa)! * 100) / 100;
      if (numOk(a.dto_linea_pct) != null) nuevo.dto_linea_pct = Math.max(0, Math.min(100, numOk(a.dto_linea_pct)!));
      if (a.precio_coste === '' || a.precio_coste === null) nuevo.precio_coste = null;
      else if (numOk(a.precio_coste) != null) nuevo.precio_coste = Math.round(numOk(a.precio_coste)! * 100) / 100;
      Object.assign(l, nuevo);
      l.origen_inputs = Object.assign({}, l.origen_inputs || {}, { ajustada: Object.keys(nuevo) });
      // Desglose FV v2 editado a mano en la app (28-10-2026): partidas cambiadas,
      // quitadas o añadidas. La app ya ha repreciado (coste y PVP vienen arriba);
      // aquí se guarda el desglose nuevo para que la ficha lo enseñe tal cual.
      const oi = l.origen_inputs as Record<string, unknown>;
      if (oi.fv2 && a.fv2 && typeof a.fv2 === 'object' && Array.isArray(a.fv2.desglose)) {
        const txt = (v: unknown, n: number) => String(v == null ? '' : v).trim().slice(0, n);
        const desglose = (a.fv2.desglose as unknown[]).slice(0, 300).filter((x) => x && typeof x === 'object').map((x) => { const d = x as Record<string, unknown>; return {
          bloque: txt(d.bloque, 60) || 'OTROS', nombre: txt(d.nombre, 200), cantidad: numOk(d.cantidad) ?? 0, unidad: txt(d.unidad, 20) || 'ud',
          coste_ud: numOk(d.coste_ud) ?? 0, coste: numOk(d.coste) ?? 0, aviso: txt(d.aviso, 200) || null, texto: txt(d.texto, 300), manual: d.manual === true,
          ref: d.ref && typeof d.ref === 'object' && !Array.isArray(d.ref) ? d.ref : null,
        }; });
        const precioAnt = (oi.precio && typeof oi.precio === 'object' ? oi.precio : {}) as Record<string, unknown>;
        const precioNuevo = (a.fv2.precio && typeof a.fv2.precio === 'object' ? a.fv2.precio : {}) as Record<string, unknown>;
        l.origen_inputs = Object.assign({}, oi, { desglose, desglose_editado: true,
          precio: Object.assign({}, precioAnt, { coste_total: numOk(precioNuevo.coste_total) ?? precioAnt.coste_total, precio_objetivo: numOk(precioNuevo.precio_objetivo) ?? precioAnt.precio_objetivo, margen_real_sin_dto: numOk(precioNuevo.margen_real_sin_dto) ?? precioAnt.margen_real_sin_dto },
            // Mano de obra vendida por jornada (10-11-2026): si se cambian las jornadas del desglose, la venta las sigue.
            (() => { const ant = precioAnt.mo_tabla as Record<string, unknown> | null, nue = precioNuevo.mo_tabla as Record<string, unknown> | null;
              if (!ant || typeof ant !== 'object' || !(Number(ant.venta_jornada) > 0) || !nue || typeof nue !== 'object') return {};
              return { mo_tabla: Object.assign({}, ant, { jornadas: numOk(nue.jornadas) ?? ant.jornadas, venta_mo: numOk(nue.venta_mo) ?? ant.venta_mo, coste_mo: numOk(nue.coste_mo) ?? ant.coste_mo }) }; })(),
            // Documentación y legalización a precio fijo (10-11-2026): si se cambian sus horas o se quita, la venta las sigue.
            (() => { const ant = precioAnt.doc_tabla as Record<string, unknown> | null, nue = precioNuevo.doc_tabla as Record<string, unknown> | null;
              if (!ant || typeof ant !== 'object' || !nue || typeof nue !== 'object') return {};
              return { doc_tabla: Object.assign({}, ant, { horas: numOk(nue.horas) ?? ant.horas, venta: numOk(nue.venta) ?? ant.venta, coste: numOk(nue.coste) ?? ant.coste }) }; })()),
          bloques: a.fv2.bloques && typeof a.fv2.bloques === 'object' ? a.fv2.bloques : oi.bloques });
      }
    });
  }
  res.lineas.forEach((l, i) => { l.orden = i + 1; });
  // El resumen interno cuenta también lo añadido a mano (sin coste conocido).
  res.resumen = resumenDe(res.lineas);

  const totales = cadenaPrecios(res.lineas, dtoGlobal);
  const coste = totalCoste(res.lineas);

  const incidenciasUtiles = extra.length
    ? res.incidencias.filter((i) => i.codigo !== 'sin_lineas')
    : res.incidencias;
  res.incidencias = incidenciasUtiles;

  // Las baterías del catálogo, para el desplegable del presupuesto (solo FV).
  // deno-lint-ignore no-explicit-any
  let bateriasCatalogo: any[] | null = null;
  if (modeloFV) {
    const { data: bats } = await sb.from('productos').select('referencia, nombre, familia, unidad, precio_tarifa, atributos, recargo, aplica_cdc, activo')
      .eq('familia', 'bateria').eq('activo', true).order('nombre');
    bateriasCatalogo = (bats || []).map((p) => ({
      ref: p.referencia, nombre: p.nombre, marca: String((p.atributos || {}).marca || '').toLowerCase(),
      kwh: Number((p.atributos || {}).capacidad_kwh) || null, venta: preciosProducto(p.precio_tarifa, p, cfg.lookup).venta,
    })).filter((x) => x.marca);
  }

  const salida = {
    ok: true,
    categoria,
    opciones_fv: bateriasCatalogo ? { baterias: bateriasCatalogo } : null,
    opciones_aero: opcionesAerotermia,
    visita_id: visitaId,
    motor_version: motorVersion,
    conjunto_version: conjunto ? conjunto.version : null,
    variables: res.variables,
    incidencias: res.incidencias,
    dto_global_pct: dtoGlobal,
    totales: {
      bruto: totales.total_bruto,
      dto_linea: totales.total_dto_linea,
      subtotal: totales.subtotal,
      dto_global: totales.total_dto_global,
      total: totales.total,
      // Versión interna: lo que cuesta y cuántas líneas van sin coste conocido.
      coste: coste.total,
      lineas_sin_coste: coste.lineas_sin_coste,
    },
    recargo_sobre_coste: res.recargo_sobre_coste,
    // Interno: coste, venta, beneficio, margen y descuento máximo por margen.
    // La app lo enseña solo por dentro; el PDF y Teamleader no lo reciben.
    resumen: res.resumen,
    lineas: res.lineas.map((l, i) => Object.assign({}, l, {
      importe: totales.lineas[i].total,
      importe_bruto: totales.lineas[i].bruto,
    })),
  };

  if (!guardar) return json(salida);

  // --- guardar --------------------------------------------------------------------
  // El título lleva lo que distingue un presupuesto FV de otro (Enzo, 16-10-2026):
  // marca del inversor, kWp y batería si la hay. Delante, lo que mande la app
  // (el nombre del suelto) o el nombre del cliente.
  let titulo = String(b.titulo || '').trim().slice(0, 200) || null;
  if (modeloFV && res.fv2) {
    const r = res.fv2;
    const MARCAS_BAT: Record<string, string> = { byd: 'BYD', fronius: 'Fronius Reserva', tesla: 'Tesla Powerwall', enphase: 'Enphase IQ Battery', weco: 'WECO', deye: 'Deye' };
    const conBat = String(datos.baterias || '') === 'si' || Number(datos.baterias_kwh) > 0;
    // Con Tesla y Fronius no hay inversor aparte: el Powerwall 3 lo lleva dentro.
    const teslaSinInversor = conBat && String(datos.bateria_marca || '').toLowerCase() === 'tesla' && String(r.entrada.sis) === 'Fronius';
    const partes = [teslaSinInversor ? 'Tesla Powerwall 3 (inversor integrado)' : String(r.entrada.sis), String(r.kwp).replace('.', ',') + ' kWp'];
    if (conBat) partes.push('batería ' + (MARCAS_BAT[String(datos.bateria_marca || '')] || String(datos.bateria_marca || '')).trim() + (Number(datos.baterias_kwh) > 0 ? ' ' + String(Number(datos.baterias_kwh)).replace('.', ',') + ' kWh' : ''));
    else if (String(datos.baterias || '') === 'dejar_preparado') partes.push('preparado para baterías');
    const detalle = partes.filter(Boolean).join(' · ');
    let cabecera = titulo;
    if (!cabecera && clienteId) {
      const { data: cli } = await sb.from('clientes_cache').select('nombre').eq('id', clienteId).maybeSingle();
      cabecera = cli?.nombre || null;
    }
    titulo = ((cabecera ? cabecera + ' · ' : '') + detalle).slice(0, 200);
  }
  // Presupuesto conjunto (21-10-2026): «+ Aerotermia + Aire acondicionado» al final del título.
  const sufijo = String(b.titulo_sufijo || '').trim().slice(0, 80);
  if (sufijo) titulo = ((titulo || '') + ' + ' + sufijo).replace(/^ \+ /, '').slice(0, 200);
  const { data: creado, error: errP } = await sb.from('presupuestos').insert({
    visita_id: visitaId,
    ficha_id: fichaId,
    cliente_id: clienteId,
    titulo,
    categoria,
    // Etapa 110 (13-11-2026): el tipo escrito a mano cuando la categoría es «otro»
    // y la nota para el cliente al final del presupuesto.
    ...(categoria === 'otro' && String(b.categoria_texto || '').trim() ? { categoria_texto: String(b.categoria_texto).trim().slice(0, 80) } : {}),
    ...(String(b.observaciones || '').trim() ? { observaciones: String(b.observaciones).trim().slice(0, 4000) } : {}),
    conjunto_reglas_id: conjuntoId,
    tarifa_id: tarifaId,
    motor_version: motorVersion,
    // Con qué modelo FV v2 se calculó (columna de la etapa 74; solo cuando lo hay).
    ...(modeloFV ? { modelo_id: modeloFV.id } : {}),
    total_bruto: totales.total_bruto,
    total_dto_linea: totales.total_dto_linea,
    dto_global_pct: dtoGlobal,
    total_venta: totales.total,
    total_coste: coste.total,
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
      precio_coste: l.precio_coste == null ? null : l.precio_coste,
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
