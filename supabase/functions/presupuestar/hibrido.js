// =============================================================================
// Sysefen · Motor de presupuestos · Fotovoltaica híbrida (v2 + capítulos)
//
// El presupuestador de Ramón (fv.js, modelo vigente en public.motor_modelos)
// manda. Lo que ese modelo cubre (paneles, inversor, estructura de teja o
// plana, cableado, protecciones, mano de obra, trámites e internos) sale en
// UNA línea «llave en mano» con el 50 % de margen; lo que no cubre lo sigue
// poniendo el motor por capítulos (etapa 72, motor.js) con sus precios y su
// margen: baterías y backup (04), obra civil (09), medios (10), opcionales
// (14), estructura de chapa o pérgola (02), adecuación del cuadro, pica,
// repetidor, Cat6, tejadillo y proyecto técnico. Con batería
// (o «dejar preparado») y Fronius, el inversor Plus y el Smart Meter los pone
// también el antiguo; con Tesla, ninguno.
// Decisión de Enzo (13-10-2026): «mantenemos lo nuevo y lo que no haya usamos
// lo antiguo».
//
// Está en un módulo aparte para que la Edge Function y las pruebas / informes
// (herramientas/informe-fv.js) usen EXACTAMENTE el mismo cálculo.
// =============================================================================

import { calcular, preciosProducto, MOTOR_VERSION } from './motor.js';
import { calcularFV, entradaDesdeDatos, lineasPresupuesto } from './fv.js';

const FV_COMPLEMENTO = /^(04|09|10|14) · /;
const FV_SUELTAS = new Set(['FV-07-010', 'FV-07-011', 'FV-05-005', 'FV-05-006', 'FV-03-008', 'FV-13-002']);

/**
 * datos: la ficha (visita o suelto). mod: la fila de motor_modelos {id, version,
 * datos}. cfg: la configuración del motor por capítulos (variables, lookup,
 * reglas, partidas, productos…). Devuelve lo mismo que calcular(): líneas,
 * incidencias, variables, y además motor_version y modelo_id.
 */
const REFS_CARGADOR = /^FV-14-00[156]$/;
const r2 = (n) => Math.round(n * 100) / 100;
/** Las líneas del cargador (equipo FV-14-001, cuadro FV-14-005, jornada FV-14-006) → una sola, con desglose. */
export function agruparCargador(lineas) {
  const del = lineas.filter((l) => REFS_CARGADOR.test(String(l.producto_ref || '')));
  if (del.length < 2) return lineas;
  const resto = lineas.filter((l) => !del.includes(l));
  const tarifa = r2(del.reduce((t, l) => t + (Number(l.cantidad) || 0) * (Number(l.precio_tarifa) || 0), 0));
  const conCoste = del.every((l) => l.precio_coste != null && l.precio_coste !== '');
  const coste = conCoste ? r2(del.reduce((t, l) => t + (Number(l.cantidad) || 0) * Number(l.precio_coste), 0)) : null;
  const base = del.find((l) => String(l.producto_ref) === 'FV-14-001') || del[0];
  const desglose = del.map((l) => ({
    nombre: l.descripcion, cantidad: Number(l.cantidad) || 0, unidad: l.unidad || 'ud',
    coste_ud: l.precio_coste == null ? null : Number(l.precio_coste), coste: l.precio_coste == null ? null : r2((Number(l.cantidad) || 0) * Number(l.precio_coste)),
    venta_ud: Number(l.precio_tarifa) || 0, venta: r2((Number(l.cantidad) || 0) * (Number(l.precio_tarifa) || 0)),
  }));
  const linea = Object.assign({}, base, {
    producto_ref: 'FV-14-001',
    descripcion: 'Cargador de coche eléctrico instalado (Wallbox Pulsar Plus 7,4 kW, cuadro de protecciones y montaje)',
    detalle_tecnico: del.map((l) => l.descripcion).join(' · '),
    cantidad: 1, unidad: 'ud', precio_tarifa: tarifa, precio_coste: coste, dto_linea_pct: 0,
    origen: 'partida', origen_regla_id: null,
    origen_inputs: { grupo: 'Cargador de coche', desglose },
    confirmada: del.every((l) => l.confirmada !== false),
  });
  if ('precio_venta' in base) linea.precio_venta = tarifa;
  if ('importe' in base) linea.importe = tarifa;
  resto.push(linea);
  return resto;
}

/** Con batería o «dejar preparado», el inversor lo pone el motor por capítulos
 *  (Fronius Plus por kW). Si se eligió uno a mano en el presupuesto (26-10-2026),
 *  sustituye al automático por la versión Plus de ese modelo, si está en el catálogo. */
const normTxt = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function inversorAMano(lineas, datos, cfg, inversorFuera, incidencias) {
  const modelo = String(datos.inversor_modelo || '').trim();
  if (!modelo || !inversorFuera) return lineas;
  const auto = lineas.find((l) => /^FV-FRONIUS-(PRIMO|SYMO)-GEN24.*PLUS/.test(String(l.producto_ref || '')));
  if (!auto) { incidencias.push({ nivel: 'aviso', codigo: 'inversor_mano', mensaje: 'Inversor elegido a mano (' + modelo + '): con esta batería no hay inversor Fronius aparte (el Powerwall lo lleva dentro), así que no aplica.', campo: null }); return lineas; }
  const buscado = normTxt(modelo) + ' plus';
  const p = Object.values(cfg.productos || {}).find((x) => normTxt(x.nombre) === buscado)
    || Object.values(cfg.productos || {}).find((x) => normTxt(x.nombre).replace(' sc ', ' ') === buscado.replace(' sc ', ' '));
  if (!p) { incidencias.push({ nivel: 'aviso', codigo: 'inversor_mano', mensaje: 'Inversor elegido a mano (' + modelo + '): no está su versión Plus en el catálogo; se deja el automático (' + auto.descripcion + ').', campo: null }); return lineas; }
  if (p.referencia === auto.producto_ref) return lineas;
  const pr = preciosProducto(p.precio_tarifa, p, cfg.lookup);
  const nueva = Object.assign({}, auto, {
    producto_ref: p.referencia, descripcion: p.nombre, detalle_tecnico: p.detalle_tecnico || null, especificaciones: p.especificaciones || [],
    precio_tarifa: pr.venta, precio_coste: pr.coste, confirmada: numHib(p.precio_tarifa) > 0,
    origen_inputs: Object.assign({}, auto.origen_inputs || {}, { inversor_a_mano: modelo, sustituye_a: auto.descripcion }),
  });
  if ('precio_venta' in auto) nueva.precio_venta = r2(pr.venta * (Number(auto.cantidad) || 1));
  if ('importe' in auto) nueva.importe = r2(pr.venta * (Number(auto.cantidad) || 1));
  incidencias.push({ nivel: 'aviso', codigo: 'inversor_mano', mensaje: 'Inversor elegido a mano: ' + p.nombre + ' en vez del automático (' + auto.descripcion + ').', campo: null });
  return lineas.map((l) => (l === auto ? nueva : l));
}
const numHib = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Una batería del catálogo para los kWh pedidos: cuántos módulos y, si lleva base
 *  (Huawei LUNA2000-S1: una «Base y módulo de control» por cada tres módulos,
 *  atributos base_ref y modulos_por_base, sql/etapa122), cuántas bases. */
export function bateriaDeCatalogo(prod, kwh) {
  const atr = prod && prod.atributos && typeof prod.atributos === 'object' ? prod.atributos : {};
  const cap = numHib(atr.capacidad_kwh), k = numHib(kwh);
  const modulos = cap > 0 && k > 0 ? Math.max(1, Math.ceil(k / cap - 0.001)) : 1;
  const base_ref = typeof atr.base_ref === 'string' && atr.base_ref ? atr.base_ref : null;
  const por = numHib(atr.modulos_por_base);
  return { modulos, base_ref, bases: base_ref ? (por > 0 ? Math.ceil(modulos / por) : 1) : 0 };
}

export function presupuestarFV(datos, mod, cfg) {
  const modelo = mod.datos;
  const m = entradaDesdeDatos(datos, modelo);
  const conBateria = String(datos.baterias || '') === 'si' || Number(datos.baterias_kwh) > 0;
  const fronius = m.entrada.sis === 'Fronius';
  const huawei = m.entrada.sis === 'Huawei';
  const estructuraNueva = m.entrada.cubierta === 'Teja' || m.entrada.cubierta === 'Plana';
  // Con batería, o «dejar preparado» para ella, Fronius va en Plus (híbrido),
  // que el modelo v2 no trae: lo elige el motor por capítulos (Ramón, 13-10-2026).
  const preparado = String(datos.baterias || '') === 'dejar_preparado';
  const tesla = conBateria && String(datos.bateria_marca || '').toLowerCase() === 'tesla';
  let inversorFuera = (conBateria || preparado) && fronius;
  let r = null;
  // Si el modelo lleva inversores Plus (los del catálogo, 4-11-2026), el v2
  // elige el híbrido él mismo y solo la batería sale del motor por capítulos.
  // Con Tesla no hay inversor aparte (el Powerwall lo lleva dentro): como antes.
  if (inversorFuera && !tesla) {
    const r2 = calcularFV(m.entrada, modelo, { chapaAMedida: false, inversorFuera: false, hibrido: true, jornadaBateria: conBateria, pasarATrifasico: true });
    if (r2.kw_inv !== null) { r = r2; inversorFuera = false; }
  }
  // Huawei (23-11-2026): el inversor lo elige siempre el v2, del catálogo. Con
  // batería, o preparado para ella, solo entre los que admiten LUNA2000.
  if (!r) r = calcularFV(m.entrada, modelo, { chapaAMedida: false, inversorFuera, hibrido: huawei && (conBateria || preparado), jornadaBateria: conBateria, pasarATrifasico: true });
  // Si el v2 ha pasado el presupuesto a trifásico (monofásico que se queda corto,
  // 11-11-2026), el resto del motor (reglas por capítulos, cargador) va también en trifásico.
  if (r.sumi_cambiado) datos = Object.assign({}, datos, { suministro: 'trifasico' });
  const avisosEntrada = m.avisos.slice();
  if (!estructuraNueva) avisosEntrada.push('Cubierta «' + m.cubierta_app + '»: el modelo v2 no la cubre; la estructura sale del motor por capítulos con sus precios (pendientes de confirmar). Revisar.');
  if (fronius && (conBateria || preparado) && !inversorFuera) avisosEntrada.push((conBateria ? 'Con batería: ' : 'Preparado para baterías: ') + 'inversor híbrido ' + r.txt_inv + ' (Plus, del catálogo) elegido por el presupuestador' + (conBateria ? '; la batería sale del motor por capítulos con su margen.' : '.'));
  if (inversorFuera && conBateria) avisosEntrada.push('Con batería, el inversor Fronius Plus (o ninguno con Tesla), el Smart Meter y la batería salen del motor por capítulos con su margen; el modelo v2 aún no lleva baterías.');
  if (inversorFuera && !conBateria) avisosEntrada.push('Preparado para baterías: el inversor Fronius Plus (híbrido) y el Smart Meter salen del motor por capítulos con su margen.');
  if (conBateria && m.entrada.sis === 'Deye' && !datos.bateria_ref) avisosEntrada.push('Batería con Deye: el presupuestador no la pone sola. Añádela desde «Añadir del catálogo» (WECO 5K0 LT, 5K3 EVO, 16K0 o Deye SE-F5 PRO, SE-F 16-C, con sus accesorios) y comprueba la compatibilidad en la ficha técnica.');
  if (conBateria && huawei && !datos.bateria_ref) avisosEntrada.push('Batería con Huawei: el presupuestador no la pone sola. Elige el modelo en «Batería» (LUNA2000 S1, módulos de 5 o 6,9 kWh): entran los módulos que hagan falta para los kWh y una base de control por cada tres.');
  if (conBateria && m.entrada.sis === 'Enphase') avisosEntrada.push('Batería con Enphase: la batería sale del motor por capítulos con su margen; el modelo v2 aún no lleva baterías.');
  const lineas = lineasPresupuesto(r, modelo, { modelo_version: mod.version, avisos: avisosEntrada });
  const incidencias = [];
  r.avisos.forEach((a) => incidencias.push({ nivel: /A MEDIDA/.test(a) ? 'error' : 'aviso', codigo: 'fv2', mensaje: a, campo: null }));
  avisosEntrada.forEach((a) => incidencias.push({ nivel: 'aviso', codigo: 'fv2_entrada', mensaje: a, campo: null }));

  const reglas = (cfg.reglas || []).filter((rg) => {
    const sec = String(rg.seccion || ''), ref = String(rg.producto_ref || '');
    if (rg.tipo === 'aviso') return true;
    if (ref === 'FV-10-003') return false;   // el elevador ya va en el v2 (65 €/h): nada de duplicarlo
    if (FV_COMPLEMENTO.test(sec) && !(sec.startsWith('04 · ') && (m.entrada.sis === 'Deye' || huawei))) return true;
    if (FV_SUELTAS.has(ref)) return true;
    if (!estructuraNueva && sec.startsWith('02 · ')) return true;
    if (inversorFuera && sec.startsWith('03 · ') && ref.startsWith('FV-FRONIUS-')) return true;
    if (inversorFuera && sec.startsWith('05 · ') && ref.startsWith('FV-FRONIUS-SMART-METER')) return true;
    return false;
  });
  // El proyecto técnico va por la potencia del inversor (Enzo, 6-11-2026): a
  // partir de 10 kW (la variable derivada `proyecto` mira `inversor_kw`); así
  // cambia al elegir otro inversor en el desplegable. Con microinversores o
  // A MEDIDA se mira la potencia pico.
  const inversorKw = r.kw_inv === null || r.kw_inv === 0 ? r.kwp : r.kw_inv;
  const viejo = calcular('solar', Object.assign({}, datos, { inversor_kw: inversorKw }), Object.assign({}, cfg, { reglas }));
  const deViejo = viejo.incidencias.filter((i) => i.codigo !== 'sin_lineas' && !/^Faltan los metros/.test(String(i.mensaje || '')));
  // El cargador de coche va en UNA partida (equipo + cuadro + instalación) con
  // su desglose por dentro, como la línea principal (Enzo, 20-10-2026).
  const lineasViejo = inversorAMano(agruparCargador(viejo.lineas), datos, cfg, inversorFuera, deViejo);
  // Cargador de coche en trifásico (Enzo, 4-11-2026): debería ir el Wallbox
  // Pulsar Plus de 22 kW. Mientras no esté su precio en el catálogo se deja el
  // de 7,4 kW y se avisa.
  if (datos.cargador_ve && /^trif/i.test(String(datos.suministro || '')) && lineasViejo.some((l) => String(l.producto_ref || '') === 'FV-14-001')) {
    deViejo.push({ nivel: 'aviso', codigo: 'cargador_22kw', mensaje: 'Suministro trifásico: el cargador debería ser el Wallbox Pulsar Plus de 22 kW. Falta su precio en el catálogo, así que va el de 7,4 kW: cámbialo a mano.', campo: null });
  }
  return {
    lineas: lineas.concat(lineasViejo),
    incidencias: incidencias.concat(deViejo),
    variables: Object.assign({}, viejo.variables, { fv2_n_pan: r.n_pan, fv2_kwp: r.kwp, fv2_prod: r.prod, fv2_mod_inv: r.mod_inv, fv2_jornadas: r.jornadas }),
    recargo_sobre_coste: viejo.recargo_sobre_coste,
    motor_version: MOTOR_VERSION + ' · FV v2 ' + String(mod.version),
    modelo_id: mod.id,
    resumen: null,
    // Para informes: el resultado crudo del v2 (dimensionado, partidas, precio).
    fv2: r,
  };
}

// =============================================================================
// SOLO BATERÍA (Enzo, 24-11-2026): «quiero que en fotovoltaica me dé opción de
// presupuestar solo batería; esto es lo que iría en el presu» (su presupuesto
// 894, hecho a mano: 2 módulos LUNA2000-5-S1, base de control, Smart Dongle,
// SmartGuard con su cable, instalación de la batería con pequeño material y
// legalización).
//
// El cliente ya tiene placas: no hay paneles, inversor, estructura, cableado ni
// trámites de instalación nueva; el presupuestador de Ramón (fv.js) no entra.
// Lo que sale:
//   · la batería y su backup. BYD, Fronius Reserva, Tesla y Enphase, por las
//     reglas del capítulo 04, como en una instalación completa. WECO, Deye y
//     Huawei, del catálogo: el modelo se elige en «Batería» y entran los
//     módulos que hagan falta (y la base de la LUNA2000), igual que siempre
//     (lo hace la función con bateriaDeCatalogo);
//   · con Huawei, además: con backup, el SmartGuard del suministro (S0
//     monofásico, T0 trifásico) con su cable de comunicación; sin backup, el
//     Smart Dongle. Los dos a la vez no: el SmartGuard lleva dentro el
//     SmartAssistant y el manual de Huawei dice que en una planta solo se
//     instala uno de los dos, o la comunicación falla («Residential Smart PV
//     Solution User Manual (SmartAssistant Networking and SmartGuard
//     Networking)», apartado PV+ESS, support.huawei.com, doc EDOC1100323733,
//     leído el 24-11-2026). Las fases de cada SmartGuard y el cable como pieza
//     aparte (04072551), de los manuales del SmartGuard-63A-S0 y -T0;
//   · «Instalación batería y pequeño material» y «Legalización»: los dos
//     productos del catálogo propio que Enzo usó en el 894, a su precio del
//     catálogo (se cambian en Ajustes → Precios).
// El soporte o bancada del capítulo 04 (FV-04-004) no entra: va en el pequeño
// material de la instalación.
// =============================================================================
export const SOLO_BATERIA = {
  instalacion: 'SY-INSTALACION-BATERIA-Y-PEQUEN-6C01',
  legalizacion: 'SY-LEGALIZACION-8837',
  huawei_dongle: 'FV-HUAWEI-SMART-DONGLE-WLAN-FE-SUPPORTING-WLAN-HOTSPOT',
  huawei_cable: 'FV-HUAWEI-ACCESORIO-SMARTGUARD-CABLE-DE-COMUNICACION',
  huawei_backup_mono: 'FV-HUAWEI-SMARTGUARD-63A-S0',
  huawei_backup_tri: 'FV-HUAWEI-SMARTGUARD-63A-T0',
};
const SEC_BATERIA = 'Almacenamiento', SEC_INSTALACION = 'Instalación y legalización';
const siHib = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'si' || v === 'sí';
/** ¿Es un presupuesto de solo batería? (la casilla de la ficha o del presupuesto sin visita) */
export function esSoloBateria(datos) { return !!datos && siHib(datos.solo_bateria); }
/** Las marcas de batería que se eligen del catálogo (sin regla por kWh). */
const BAT_DE_CATALOGO = ['weco', 'deye', 'huawei'];

/**
 * La parte que calcula el motor: batería y backup de las marcas con regla. El
 * resto (lo del catálogo) lo añade la función con extrasSoloBateria().
 * Devuelve lo mismo que calcular(), con su motor_version.
 */
export function presupuestarSoloBateria(datos, cfg) {
  const d = Object.assign({}, datos, { baterias: 'si' });
  const marcaInv = String(d.inversor_marca || 'fronius').toLowerCase();
  const marcaBat = String(d.bateria_marca || '').toLowerCase();
  const deCatalogo = marcaInv === 'deye' || marcaInv === 'huawei' || BAT_DE_CATALOGO.includes(marcaBat);
  const reglas = deCatalogo ? [] : (cfg.reglas || []).filter((rg) => rg.tipo !== 'aviso' && String(rg.seccion || '').startsWith('04 · ') && String(rg.producto_ref || '') !== 'FV-04-004');
  const viejo = calcular('solar', d, Object.assign({}, cfg, { reglas }));
  const lineas = (viejo.lineas || []).map((l) => Object.assign({}, l, { seccion: SEC_BATERIA }));
  // De lo que avisa el motor por capítulos solo vale lo que habla de estas líneas:
  // lo demás son datos de una instalación que aquí no se hace (paneles, metros…).
  const refs = lineas.map((l) => String(l.producto_ref || '')).filter(Boolean);
  const incidencias = (viejo.incidencias || []).filter((i) => i.nivel === 'error' && i.codigo !== 'sin_lineas' ? refs.some((r) => String(i.mensaje || '').indexOf(r) >= 0) || i.codigo === 'precio_pendiente'
    : i.codigo === 'precio_pendiente' && refs.some((r) => String(i.mensaje || '').indexOf(r) >= 0));
  const aviso = (mensaje, campo) => incidencias.push({ nivel: 'aviso', codigo: 'solo_bateria', mensaje, campo: campo || null });
  aviso('Solo batería: sin paneles, inversor ni estructura. Comprueba que el inversor que ya tiene el cliente admite esta batería; si no, añade el inversor del catálogo.');
  if (!(Number(d.baterias_kwh) > 0)) aviso('Faltan los kWh de la batería: se ha puesto la capacidad por defecto. Ponlos en «Batería».', 'baterias_kwh');
  if (BAT_DE_CATALOGO.includes(marcaBat) && !d.bateria_ref) {
    aviso(marcaBat === 'huawei' ? 'Batería Huawei: elige el modelo en «Batería» (LUNA2000 S1, módulos de 5 o 6,9 kWh). Entran los módulos que hagan falta para los kWh y una base de control por cada tres.'
      : 'Batería ' + marcaBat.toUpperCase() + ': elige el modelo en «Batería». Entran las unidades que hagan falta para los kWh.', 'bateria_ref');
  } else if (deCatalogo && !BAT_DE_CATALOGO.includes(marcaBat)) {
    aviso('Con inversor ' + marcaInv.toUpperCase() + ' la batería se elige del catálogo, en «Batería».', 'bateria_ref');
  }
  if (marcaBat === 'huawei') {
    aviso(siHib(d.backup) ? 'Huawei con backup: entra el SmartGuard ' + (/^trif/i.test(String(d.suministro || '')) ? '63A-T0 (trifásico)' : '63A-S0 (monofásico)') + ' con su cable, y no el Smart Dongle: el SmartGuard ya lleva la comunicación y Huawei indica instalar solo uno de los dos. Comprueba que el inversor que tiene es de las series que admite ese SmartGuard.'
      : 'Huawei sin backup: entra el Smart Dongle. Quítalo si el inversor ya tiene el suyo.', 'backup');
  }
  if (siHib(d.backup) && (marcaBat === 'weco' || marcaBat === 'deye')) aviso('Backup con ' + marcaBat.toUpperCase() + ': no entra solo. Añádelo del catálogo si hace falta.', 'backup');
  return {
    lineas, incidencias,
    variables: Object.assign({}, viejo.variables, { solo_bateria: 1 }),
    recargo_sobre_coste: viejo.recargo_sobre_coste,
    motor_version: MOTOR_VERSION + ' · solo batería',
    resumen: null,
  };
}

/**
 * Lo que se añade del catálogo en un presupuesto de solo batería, en su orden:
 * [{ producto_ref, cantidad, seccion, _auto: 'solo_bateria' }]. Los precios los
 * pone la función con lineaManual (coste × recargo del producto).
 */
export function extrasSoloBateria(datos) {
  const d = datos || {};
  const marcaBat = String(d.bateria_marca || '').toLowerCase();
  const pon = (ref, seccion) => ({ producto_ref: ref, cantidad: 1, seccion, _auto: 'solo_bateria' });
  const out = [];
  if (marcaBat === 'huawei') {
    // SmartGuard o Smart Dongle, nunca los dos (manual de Huawei, arriba).
    if (siHib(d.backup)) {
      out.push(pon(SOLO_BATERIA.huawei_cable, SEC_BATERIA));
      out.push(pon(/^trif/i.test(String(d.suministro || '')) ? SOLO_BATERIA.huawei_backup_tri : SOLO_BATERIA.huawei_backup_mono, SEC_BATERIA));
    } else out.push(pon(SOLO_BATERIA.huawei_dongle, SEC_BATERIA));
  }
  out.push(pon(SOLO_BATERIA.instalacion, SEC_INSTALACION));
  out.push(pon(SOLO_BATERIA.legalizacion, SEC_INSTALACION));
  return out;
}
