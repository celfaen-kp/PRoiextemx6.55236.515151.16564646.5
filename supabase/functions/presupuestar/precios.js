/* =============================================================================
 * Sysefen · precios.js · Cambiar a mano los precios de la base (Enzo, 10-11-2026)
 *
 * «Necesito poder cambiar los precios de la base de datos manualmente, así no te
 * pido cada vez que veo un error.» Los precios viven en tres sitios y aquí está
 * la aritmética para tocar cada uno sin romper lo que el motor calcula después:
 *
 *   · el MODELO fotovoltaico de Ramón (motor_modelos.datos): parámetros, costes
 *     de material, inversores y cuadros. Cada valor se nombra con una RUTA:
 *       ['parametros', 'venta_jornada']
 *       ['precios', 'perfil_g1_4m8', 'coste']        (o 'mono', 'tri', 'pvp', 'dto')
 *       ['precios', 'cable_solar_por_seccion', 'coste_m', '10']
 *       ['inversores', 'Fronius Primo GEN24 SC 3.0']  → su coste_base
 *       ['cuadros_ac', '6427040001']                  → su pvp
 *   · el CATÁLOGO (productos): precio de tarifa, descuento de proveedor y
 *     recargo propio. De la venta y el coste que alguien corrige en una línea
 *     se saca qué hay que guardar para que el motor vuelva a dar esos dos
 *     números (la inversa de preciosProducto de motor.js).
 *   · los CONCEPTOS de precio fijo de las partidas (partidas_items).
 *
 * Todo puro: lo usan la función `presupuestar` y las pruebas.
 * ========================================================================== */
import { preciosProducto } from './motor.js';

const numP = (v) => { const x = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
const redP = (v, d) => { const f = Math.pow(10, d); return Math.round(v * f + 1e-9) / f; };
const esNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* --- el modelo fotovoltaico ------------------------------------------------- */
const CAMPOS_PRECIO = ['coste', 'pvp', 'dto', 'mono', 'tri'];

/** El hueco del modelo que nombra una ruta: { obj, clave } o null. */
function huecoFV(datos, ruta) {
  if (!datos || !Array.isArray(ruta) || !ruta.length) return null;
  const [donde, a, b, c] = ruta.map((x) => String(x));
  if (donde === 'parametros' && ruta.length === 2) {
    const p = datos.parametros && datos.parametros[a];
    return p && typeof p === 'object' ? { obj: p, clave: 'valor' } : null;
  }
  if (donde === 'precios') {
    const p = datos.precios && datos.precios[a];
    if (!p || typeof p !== 'object' || a.charAt(0) === '_') return null;
    if (ruta.length === 3 && CAMPOS_PRECIO.includes(b) && b in p) return { obj: p, clave: b };
    if (ruta.length === 4 && b === 'coste_m' && p.coste_m && typeof p.coste_m === 'object' && c in p.coste_m) return { obj: p.coste_m, clave: c };
    return null;
  }
  if (donde === 'inversores' && ruta.length === 2) {
    const i = (datos.inversores || []).find((x) => x && x.modelo === a);
    return i ? { obj: i, clave: 'coste_base' } : null;
  }
  if (donde === 'cuadros_ac' && ruta.length === 2) {
    const q = (datos.cuadros_ac || []).find((x) => x && String(x.codigo) === a);
    return q ? { obj: q, clave: 'pvp' } : null;
  }
  return null;
}

/** El valor de una ruta del modelo: número, null (precio pendiente) o undefined si no existe. */
export function leerRutaFV(datos, ruta) {
  const h = huecoFV(datos, ruta);
  if (!h) return undefined;
  const v = h.obj[h.clave];
  return v == null ? null : (esNum(v) ? v : undefined);
}

/** Lo que no puede valer cada cosa. Devuelve el texto del error o ''. */
function reparoFV(ruta, valor) {
  if (!esNum(valor) || valor < 0) return 'Tiene que ser un número mayor o igual que cero.';
  const k = String(ruta[1]);
  if (ruta[0] === 'parametros') {
    if (k === 'margen_obj' && !(valor > 0 && valor < 0.95)) return 'El margen va en tanto por uno, entre 0 y 0,95 (0,5 = 50 %).';
    if (['redondeo', 'horas_jornada', 'wp', 'prod_kwp', 'precio_kwh', 'ratio', 'vel_media', 'horas_documentacion', 'paneles_por_jornada_extra', 'sep_anclaje', 'anc_cartucho', 'anc_malla', 'ancho_pan', 'largo_pan', 'conductividad_cu', 'panel_vmp', 'panel_imp', 'cdt_max_cc', 'cobertura'].includes(k) && !(valor > 0)) return 'Tiene que ser mayor que cero.';
    if (['iva', 'pct_peq', 'portes_baywa', 'portes_rebacas', 'dto_rebacas', 'dto_saltoki'].includes(k) && !(valor < 1)) return 'Va en tanto por uno (0,21 = 21 %): tiene que ser menor que 1.';
  }
  if (ruta[0] === 'precios' && ruta[2] === 'dto' && !(valor < 1)) return 'El descuento va en tanto por uno (0,42 = 42 %).';
  return '';
}

/**
 * Pone un valor en una copia del modelo. → { datos, antes, despues } o { error }.
 * El modelo que entra no se toca.
 */
export function ponerRutaFV(datos, ruta, valor, opciones) {
  const copia = JSON.parse(JSON.stringify(datos || {}));
  const h = huecoFV(copia, ruta);
  if (!h) return { error: 'Ese precio no está en el modelo fotovoltaico.' };
  const antes = h.obj[h.clave];
  if (antes != null && !esNum(antes)) return { error: 'Ese valor del modelo no es un número: no se cambia desde aquí.' };
  // Al deshacer un cambio, un precio puede volver a «pendiente» (sin valor).
  if (valor == null && opciones && opciones.vacio && ruta[0] !== 'parametros') { h.obj[h.clave] = null; return { datos: copia, antes: antes == null ? null : antes, despues: null }; }
  const v = redP(numP(valor), 6);
  const reparo = reparoFV(ruta, v);
  if (reparo) return { error: reparo };
  h.obj[h.clave] = v;
  return { datos: copia, antes: antes == null ? null : antes, despues: v };
}

const NOMBRES_PARAM = {
  margen_obj: 'Margen objetivo sobre la venta (0,5 = 50 %)', redondeo: 'Redondeo del precio (múltiplos de)',
  venta_jornada: 'Mano de obra: venta de la jornada de la pareja', venta_documentacion: 'Documentación y legalización: precio de venta',
  horas_documentacion: 'Documentación y legalización: horas de Xavi', venta_jornada_bateria: 'Jornada de batería (solo si no hay venta por jornada)',
  pvp_elev: 'Elevador: precio de venta por hora', horas_elev_plana: 'Elevador en cubierta plana: horas',
  eur_h: 'Coste de la hora de técnico y oficina', eur_h_oficial: 'Coste de la hora del oficial', eur_h_peon: 'Coste de la hora del peón',
  horas_jornada: 'Horas de una jornada', eur_km: 'Coste del kilómetro', vel_media: 'Velocidad media para los trayectos',
  coste_panel: 'Coste del panel', portes_baywa: 'Portes de BayWa (tanto por uno)', portes_rebacas: 'Portes de Rebacas (tanto por uno)',
  dto_rebacas: 'Descuento de compra en Rebacas (tanto por uno)', dto_saltoki: 'Descuento de compra en Saltoki (tanto por uno)',
  pct_peq: 'Pequeño material sobre el material principal (tanto por uno)', iva: 'IVA (tanto por uno)',
  precio_kwh: 'Precio del kWh para pasar de factura a consumo', prod_kwp: 'Producción anual por kWp', cobertura: 'Parte del consumo que se cubre',
  wp: 'Potencia del panel', min_pan: 'Mínimo de paneles', max_pan: 'Paneles hasta los que no hay jornadas extra', ratio: 'kWp de paneles por kW de inversor',
  paneles_por_jornada_extra: 'Paneles por cada jornada extra', ancho_pan: 'Ancho del panel', largo_pan: 'Largo del panel',
  sep_anclaje: 'Separación entre anclajes', anc_cartucho: 'Anclajes por cartucho de taco químico', anc_malla: 'Anclajes por malla',
  panel_vmp: 'Tensión Vmp del panel', panel_imp: 'Corriente Imp del panel', cdt_max_cc: 'Caída de tensión máxima en continua', conductividad_cu: 'Conductividad del cobre',
};
const GRUPOS_PARAM = [
  ['Precios de venta y margen', ['margen_obj', 'redondeo', 'venta_jornada', 'venta_documentacion', 'horas_documentacion', 'venta_jornada_bateria', 'pvp_elev', 'horas_elev_plana', 'iva']],
  ['Costes de personal y desplazamiento', ['eur_h', 'eur_h_oficial', 'eur_h_peon', 'horas_jornada', 'eur_km', 'vel_media']],
  ['Compras', ['coste_panel', 'portes_baywa', 'portes_rebacas', 'dto_rebacas', 'dto_saltoki', 'pct_peq']],
];
const bonito = (k) => { const s = String(k).replace(/_/g, ' ').replace(/\bm\b$/, '(por metro)'); return s.charAt(0).toUpperCase() + s.slice(1); };
const NOMBRE_CAMPO = { mono: ' · monofásico', tri: ' · trifásico', pvp: ' · PVP', dto: ' · descuento (tanto por uno)', coste: '' };

/**
 * El modelo en una lista plana para la pantalla de precios:
 * [{ grupo, ruta, nombre, valor, ud, nota }]. Solo lo que es un número suelto
 * (las tablas, como los tramos €/W, no se editan desde ahí).
 * `nombres` (opcional): { 'precios/clave/campo': 'nombre de la partida' }.
 */
export function listaModeloFV(datos, nombres) {
  const d = datos || {}, out = [], N = nombres || {};
  const P = d.parametros || {};
  const puestos = {};
  const param = (grupo, k) => {
    const p = P[k]; if (!p || typeof p !== 'object' || !(p.valor == null || esNum(p.valor)) || puestos[k]) return;
    if (p.valor == null) return;
    puestos[k] = true;
    out.push({ grupo, ruta: ['parametros', k], nombre: NOMBRES_PARAM[k] || bonito(k), valor: p.valor, ud: p.ud || '', nota: p.origen || '' });
  };
  GRUPOS_PARAM.forEach(([g, claves]) => claves.forEach((k) => param(g, k)));
  const PR = d.precios || {};
  Object.keys(PR).forEach((k) => {
    const p = PR[k]; if (k.charAt(0) === '_' || !p || typeof p !== 'object') return;
    const nota = [p.proveedor, p.descripcion, p.nota].filter(Boolean).join(' · ');
    CAMPOS_PRECIO.forEach((c) => {
      if (!(c in p) || !(p[c] == null || esNum(p[c]))) return;
      const clave = 'precios/' + k + '/' + c;
      out.push({ grupo: 'Costes de material', ruta: ['precios', k, c], nombre: (N[clave] || bonito(k)) + NOMBRE_CAMPO[c], valor: p[c] == null ? null : p[c], ud: c === 'dto' ? '' : '€', nota });
    });
    if (p.coste_m && typeof p.coste_m === 'object') {
      Object.keys(p.coste_m).forEach((s) => {
        if (!(p.coste_m[s] == null || esNum(p.coste_m[s]))) return;
        out.push({ grupo: 'Costes de material', ruta: ['precios', k, 'coste_m', s], nombre: 'Cable solar ' + s + ' mm²', valor: p.coste_m[s] == null ? null : p.coste_m[s], ud: '€/m', nota: p.proveedor || '' });
      });
    }
  });
  (d.inversores || []).forEach((i) => {
    if (!i || !i.modelo || !(i.coste_base == null || esNum(i.coste_base))) return;
    out.push({ grupo: 'Inversores (coste antes de portes y descuentos)', ruta: ['inversores', i.modelo], nombre: i.modelo, valor: i.coste_base == null ? null : i.coste_base, ud: '€', nota: [i.proveedor, i.suministro, i.usar === false ? 'no se usa' : ''].filter(Boolean).join(' · ') });
  });
  (d.cuadros_ac || []).forEach((q) => {
    if (!q || !q.codigo || !(q.pvp == null || esNum(q.pvp))) return;
    out.push({ grupo: 'Cuadros AC Sölver (PVP de Saltoki, antes del descuento)', ruta: ['cuadros_ac', String(q.codigo)], nombre: q.descripcion || String(q.codigo), valor: q.pvp == null ? null : q.pvp, ud: '€', nota: 'ref. Saltoki ' + q.codigo });
  });
  Object.keys(P).forEach((k) => param('Dimensionado y datos técnicos', k));
  return out;
}

/**
 * Del coste por unidad que alguien corrige en una partida del desglose al
 * valor del modelo: la partida trae `ref` = { ruta, factor } con
 * coste_ud = valor × factor (portes de BayWa, descuento de Saltoki…).
 */
export function valorDesdeCosteUd(ref, costeUd) {
  const f = ref && numP(ref.factor) > 0 ? numP(ref.factor) : 1;
  return redP(numP(costeUd) / f, 4);
}

/* --- el catálogo -------------------------------------------------------------- */
/** El recargo que el motor aplica a un producto en una categoría (1 = el precio es PVP). */
function recargoDe(p, lookup) {
  const fila = (clave) => (lookup || []).find((x) => x.clave === clave && x.entrada === 'defecto');
  const rf = fila('recargo_sobre_coste');
  const deCat = rf && numP(rf.valor) > 0 ? numP(rf.valor) : 1;
  const atr = p && p.atributos && typeof p.atributos === 'object' ? p.atributos : {};
  const sin = atr.sin_recargo === true || atr.sin_recargo === 'true' || atr.sin_recargo === 1;
  const propio = p && p.recargo != null && p.recargo !== '' && numP(p.recargo) > 0 ? numP(p.recargo) : null;
  return sin ? 1 : (propio != null ? propio : deCat);
}

/**
 * Qué guardar en un producto para que, en una categoría (su lookup), el motor
 * dé esta venta y este coste por unidad. → { cambios, queda: {venta, coste} }
 * o { error }.
 *   · Si el producto va «a coste con recargo» (fotovoltaica, o trae recargo
 *     propio): precio de tarifa = el coste antes de descuento y costes
 *     complementarios; recargo propio = venta ÷ coste.
 *   · Si su precio de tarifa es PVP (aerotermia, aire, o sin_recargo): precio
 *     de tarifa = la venta; descuento de proveedor = 1 − coste ÷ venta.
 * Sin coste (en blanco) solo se cambia la venta.
 */
export function productoPara(p, lookup, venta, coste) {
  const V = redP(numP(venta), 2);
  const K = coste == null || String(coste).trim() === '' ? null : redP(numP(coste), 2);
  if (!(V > 0)) return { error: 'Pon el precio de venta.' };
  if (K != null && K < 0) return { error: 'El coste no puede ser negativo.' };
  const prod = Object.assign({}, p || {});
  const actual = preciosProducto(prod.precio_tarifa, prod, lookup);
  const rec = recargoDe(prod, lookup);
  let d = numP(prod.descuento_proveedor) / 100; if (!(d >= 0 && d < 1)) d = 0;
  const cambios = {};
  if (rec !== 1) {
    // Los costes complementarios que el motor le suma (material, salvo aplica_cdc = false).
    const conCdc = preciosProducto(1000, Object.assign({}, prod, { descuento_proveedor: 0 }), lookup).coste / 1000;
    if (K == null) {
      if (!(actual.coste > 0)) return { error: 'Este producto no tiene coste guardado: pon también el coste.' };
      cambios.recargo = redP(V / actual.coste, 6);
    } else {
      if (!(K > 0)) return { error: 'Pon un coste mayor que cero (o déjalo en blanco para cambiar solo la venta).' };
      cambios.precio_tarifa = redP(K / ((1 - d) * conCdc), 2);
      const kReal = preciosProducto(cambios.precio_tarifa, Object.assign({}, prod, { recargo: 1.5 }), lookup).coste;
      if (!(kReal > 0)) return { error: 'Con ese coste el precio de tarifa quedaría a cero.' };
      cambios.recargo = redP(V / kReal, 6);
    }
  } else {
    cambios.precio_tarifa = V;
    if (K != null) {
      if (K > V) return { error: 'El coste no puede ser mayor que la venta.' };
      cambios.descuento_proveedor = redP((1 - K / V) * 100, 2);
    }
  }
  const nuevo = Object.assign({}, prod, cambios);
  const q = preciosProducto(nuevo.precio_tarifa, nuevo, lookup);
  return { cambios, queda: { venta: q.venta, coste: Math.abs(q.coste - q.venta) < 0.005 && rec === 1 && !(numP(nuevo.descuento_proveedor) > 0) ? null : q.coste } };
}

/**
 * Lo mismo para un concepto de precio fijo de una partida (partidas_items):
 * el motor lo trata como material sin producto; el coste propio va en
 * coste_fijo. → { cambios, queda } o { error }.
 */
export function conceptoPara(item, lookup, venta, coste) {
  const V = redP(numP(venta), 2);
  const K = coste == null || String(coste).trim() === '' ? null : redP(numP(coste), 2);
  if (!(V > 0)) return { error: 'Pon el precio de venta.' };
  if (K != null && K < 0) return { error: 'El coste no puede ser negativo.' };
  if (K != null && K > V) return { error: 'El coste no puede ser mayor que la venta.' };
  // Cuánto multiplica el motor el precio fijo hasta la venta en esta categoría.
  const f = preciosProducto(1000, { familia: 'material' }, lookup).venta_exacta / 1000;
  const cambios = { precio_fijo: redP(V / (f > 0 ? f : 1), 2) };
  if (K != null) cambios.coste_fijo = K;
  const q = preciosProducto(cambios.precio_fijo, { familia: 'material' }, lookup);
  const costeQueda = K != null ? K : (item && item.coste_fijo != null && item.coste_fijo !== '' ? redP(numP(item.coste_fijo), 2) : (Math.abs(q.coste - q.venta) < 0.005 ? null : q.coste));
  return { cambios, queda: { venta: q.venta, coste: costeQueda } };
}
