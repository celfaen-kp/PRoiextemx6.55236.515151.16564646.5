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
  aviso((esSoloPaneles(d) ? 'Batería en una instalación que ya existe: sin inversor.' : 'Solo batería: sin paneles, inversor ni estructura.') + ' Comprueba que el inversor que ya tiene el cliente admite esta batería; si no, añade el inversor del catálogo.');
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

// =============================================================================
// SOLO PANELES (Enzo, 26-11-2026): «hacer un presupuesto para solo agregar
// paneles, donde preguntaría el tipo de lugar para saber si va en teja o con
// lastre o perfiles, y las unidades a agregar… solo montaje y paneles como ya
// sabes hacerlo, y los cables no hacen falta, ya que se conecta al string que
// haya al lado… nada de trámites ni materiales, solo algo de pequeño material
// de conexión, unos 30 € por panel… así, si hago un presu de baterías y quiero
// agregar paneles a una instalación existente, ya lo pueda hacer».
//
// El cliente ya tiene instalación: no hay inversor, cableado, protecciones,
// trámites ni costes internos. Lo que sale, cada cosa en su línea:
//   · los paneles: el del modelo de Ramón (fv.js), a su coste con el margen
//     objetivo del modelo;
//   · la estructura de esos paneles, con las mismas cuentas del modelo: en teja,
//     perfiles, presores y anclajes químicos; en plana o suelo, lastres Sun
//     Ballast. En una sola línea, con su desglose por dentro. Chapa y pérgola no
//     están en el modelo: salen de las reglas del capítulo 02, como en una
//     instalación completa, con sus precios pendientes de confirmar;
//   · el montaje: jornadas de la pareja a 450 € (parametros.venta_jornada_ampliacion;
//     no los 880 € de venta_jornada, que son los de una instalación completa).
//     Una jornada por cada 8 paneles
//     (parametros.paneles_por_jornada_extra, lo mismo que el modelo cuenta por
//     cada 8 paneles de más en una instalación grande), o las que se pongan a mano;
//   · el elevador, si hay horas apuntadas (en plana, las mínimas del modelo,
//     para subir los lastres);
//   · el pequeño material eléctrico de conexión: un producto del catálogo
//     propio, por panel (lo añade la función con extrasSoloPaneles()).
// Se puede juntar con «solo batería»: presupuestarAmpliacion() hace los dos.
// =============================================================================
export const SOLO_PANELES = { pequeno_material: 'SY-PEQUENO-MATERIAL-ELECTRICO-AMPLIACION-PANELES' };
const SEC_PANELES = 'Ampliación de paneles';
export const VENTA_JORNADA_AMPLIACION = 450;
/** ¿Se añaden paneles a una instalación que ya existe? (la casilla de la ficha o del presupuesto sin visita) */
export function esSoloPaneles(datos) { return !!datos && siHib(datos.solo_paneles); }
/** Cuántos paneles se añaden: los puestos a mano o, en la visita, los que caben. */
export function panelesAmpliacion(datos) {
  const d = datos || {};
  const n = numHib(d.paneles_manual) > 0 ? numHib(d.paneles_manual) : numHib(d.modulos_estimados);
  return Math.max(0, Math.round(n));
}
/** Jornadas de la pareja para montar n paneles: las puestas a mano o una por cada 8. */
export function jornadasAmpliacion(n, modelo, aMano) {
  const m = numHib(aMano);
  if (m > 0) return Math.round(m * 2) / 2;   // de media en media jornada
  const par = modelo && modelo.parametros && modelo.parametros.paneles_por_jornada_extra;
  const por = numHib(par && par.valor) || 8;
  return Math.max(1, Math.ceil(numHib(n) / por - 1e-9));
}

export function presupuestarSoloPaneles(datos, mod, cfg) {
  const modelo = mod.datos;
  const P = {};
  Object.keys(modelo.parametros || {}).forEach((k) => { P[k] = modelo.parametros[k].valor; });
  const n = panelesAmpliacion(datos);
  const incidencias = [];
  const aviso = (mensaje, campo, nivel) => incidencias.push({ nivel: nivel || 'aviso', codigo: 'solo_paneles', mensaje, campo: campo || null });
  const fuera = { lineas: [], incidencias, variables: { solo_paneles: 1 }, recargo_sobre_coste: null, motor_version: MOTOR_VERSION + ' · solo paneles · FV v2 ' + String(mod.version), modelo_id: mod.id, resumen: null };
  if (!n) { aviso('Faltan los paneles que se añaden.', 'paneles_manual', 'error'); return fuera; }

  // Sin filas apuntadas, una sola fila (lo normal al alargar un string); el modelo cuenta dos.
  const filasDadas = Array.isArray(datos.filas_paneles) && datos.filas_paneles.some((f) => f && numHib(f.paneles) > 0);
  const d = Object.assign({}, datos, { paneles_manual: n, filas_paneles: filasDadas ? datos.filas_paneles : [{ paneles: n }] });
  const m = entradaDesdeDatos(d, modelo);
  const entrada = Object.assign({}, m.entrada, { paneles_forzado: n, sis: 'Fronius', inv_modelo: null, subv: 'No', cee: 'No' });
  const r = calcularFV(entrada, modelo, { chapaAMedida: false, inversorFuera: true });
  const margen = numHib(P.margen_obj);
  const conMargen = (coste) => (margen > 0 && margen < 1 ? coste / (1 - margen) : coste);
  const linea = (o) => Object.assign({ producto_ref: null, detalle_tecnico: null, especificaciones: [], dto_linea_pct: 0, iva: 21, seccion: SEC_PANELES,
    origen: 'partida', origen_regla_id: null, confirmada: true }, o);
  const renglon = (x) => ({ nombre: x.partida, cantidad: Math.round(x.cantidad * 1000) / 1000, unidad: x.ud, coste_ud: x.coste_ud, coste: x.coste,
    venta_ud: r2(conMargen(x.coste_ud)), venta: r2(conMargen(x.coste)) });
  const lineas = [];

  // --- los paneles
  const pan = r.partidas.find((x) => x.bloque === 'MÓDULOS FOTOVOLTAICOS' && x.cantidad > 0);
  if (pan) {
    const nombre = String(pan.partida).replace(/^Panel /, '');
    lineas.push(linea({
      descripcion: 'Módulo fotovoltaico ' + nombre,
      detalle_tecnico: n + (n === 1 ? ' módulo ' : ' módulos ') + nombre + ' (' + String(r.kwp).replace('.', ',') + ' kWp) que se añaden a la instalación existente',
      cantidad: n, unidad: 'ud', precio_tarifa: r2(conMargen(pan.coste_ud)), precio_coste: pan.coste_ud,
      origen_inputs: { auto: 'solo_paneles', grupo: 'Paneles', desglose: [renglon(pan)] },
    }));
  }

  // --- la estructura
  const cubiertaModelo = entrada.cubierta === 'Teja' || entrada.cubierta === 'Plana';
  let variablesViejo = {};
  if (cubiertaModelo) {
    const est = r.partidas.filter((x) => x.bloque === 'ESTRUCTURA' && x.cantidad > 0);
    const coste = r2(est.reduce((s, x) => s + x.coste, 0));
    const texto = (est.find((x) => x.texto) || {}).texto || 'Estructura de los paneles';
    if (est.length) lineas.push(linea({
      descripcion: (entrada.cubierta === 'Teja' ? 'Estructura coplanar de aluminio para teja' : 'Estructura con lastres de hormigón para cubierta plana') + ' (' + n + (n === 1 ? ' panel)' : ' paneles)'),
      detalle_tecnico: texto,
      cantidad: 1, unidad: 'ud', precio_tarifa: r2(conMargen(coste)), precio_coste: coste,
      origen_inputs: { auto: 'solo_paneles', grupo: 'Estructura', desglose: est.map(renglon) },
    }));
    const avEst = est.map((x) => x.aviso).filter(Boolean);
    avEst.filter((a, i) => avEst.indexOf(a) === i).forEach((a) => aviso(a, 'tipo_cubierta'));
  } else {
    // Chapa, pérgola…: el capítulo 02 del motor por capítulos, como en una instalación completa.
    const reglas = (cfg.reglas || []).filter((rg) => rg.tipo !== 'aviso' && String(rg.seccion || '').startsWith('02 · '));
    const viejo = calcular('solar', Object.assign({}, d, { inversor_kw: 0 }), Object.assign({}, cfg, { reglas }));
    variablesViejo = viejo.variables || {};
    (viejo.lineas || []).forEach((l) => lineas.push(Object.assign({}, l, { seccion: SEC_PANELES })));
    const refs = (viejo.lineas || []).map((l) => String(l.producto_ref || '')).filter(Boolean);
    (viejo.incidencias || []).filter((i) => i.codigo === 'precio_pendiente' && refs.some((x) => String(i.mensaje || '').indexOf(x) >= 0)).forEach((i) => incidencias.push(i));
    aviso('Cubierta «' + m.cubierta_app + '»: no está en el presupuestador nuevo; la estructura sale de las reglas antiguas, con sus precios pendientes de confirmar. Revisar.'
      + ((viejo.lineas || []).length ? '' : ' No ha salido ninguna línea de estructura: añádela a mano.'), 'tipo_cubierta');
  }

  // --- el montaje
  const jornadas = jornadasAmpliacion(n, modelo, datos.jornadas_montaje);
  const aMano = numHib(datos.jornadas_montaje) > 0;
  // La jornada de solo paneles se vende a 450 € (Enzo, 26-11-2026: «la mano de obra al
  // colocar solo paneles, que sea 450, no 880»), no a la de una instalación completa
  // (venta_jornada). Va en el modelo, parametros.venta_jornada_ampliacion, y se cambia en
  // Precios → Fotovoltaica; si el modelo no lo trae, 450.
  const ventaJornada = numHib(P.venta_jornada_ampliacion) > 0 ? numHib(P.venta_jornada_ampliacion) : VENTA_JORNADA_AMPLIACION;
  lineas.push(linea({
    descripcion: 'Montaje de los paneles y conexión a la instalación existente',
    detalle_tecnico: 'Montaje por personal propio (oficial y ayudante): estructura, módulos, conexión al string existente y pruebas',
    cantidad: jornadas, unidad: 'jornada', precio_tarifa: ventaJornada, precio_coste: r2(r.jornada),
    origen_inputs: { auto: 'solo_paneles', montaje: true, jornadas, a_mano: aMano },
  }));

  // --- el elevador, como en una instalación completa
  if (r.horas_elev > 0) lineas.push(linea({
    descripcion: 'Elevador de carga (' + String(r.horas_elev).replace('.', ',') + ' h)',
    detalle_tecnico: 'Elevador propio para subir el material a la cubierta; se cobra aparte por horas.',
    cantidad: r.horas_elev, unidad: 'h', precio_tarifa: r.pvp_elev, precio_coste: 0, seccion: 'Medios auxiliares',
    origen_inputs: { auto: 'solo_paneles', elevador: true },
  }));

  // --- los avisos
  aviso('Añadir paneles: sin inversor, cableado ni protecciones. Comprueba que el inversor y el string que ya hay admiten ' + n + (n === 1 ? ' panel' : ' paneles')
    + ' más (tensión, intensidad y potencia) y que este panel es compatible con los instalados.'
    + (String(datos.inversor_marca || '').toLowerCase() === 'enphase' ? ' Con microinversores Enphase hace falta uno por panel, con su cable: añádelos del catálogo.' : ' Si la instalación es de microinversores, añade uno por panel del catálogo.'));
  aviso('Montaje: ' + String(jornadas).replace('.', ',') + (jornadas === 1 ? ' jornada' : ' jornadas') + ' de la pareja' + (aMano ? ', puestas a mano.' : ' (una por cada ' + (numHib(P.paneles_por_jornada_extra) || 8) + ' paneles). Cámbialas si no son esas.'), 'jornadas_montaje');
  if (!filasDadas && n > 1) aviso('Sin «paneles por fila»: la estructura se cuenta en una sola fila de ' + n + ' paneles.', 'filas_paneles');
  m.avisos.filter((a) => /pizarra/i.test(a) || /Wp de la ficha/.test(a)).forEach((a) => aviso(a));
  if (r.horas_elev > 0 && !(numHib(entrada.horas_elev) > 0)) aviso('Cubierta plana: entran ' + String(r.horas_elev).replace('.', ',') + ' h de elevador para subir los lastres, como en una instalación completa. Quítalo si no hace falta.', 'horas_elevador');
  if (!esSoloBateria(datos)) aviso('Sin trámites: si la ampliación cambia la potencia legalizada de la instalación, mira si hay que actualizar la legalización y añádela del catálogo.');

  return {
    lineas, incidencias,
    variables: Object.assign({}, variablesViejo, { solo_paneles: 1, amp_n_pan: n, amp_kwp: r.kwp, amp_jornadas: jornadas }),
    recargo_sobre_coste: null,
    motor_version: fuera.motor_version,
    modelo_id: mod.id,
    resumen: null,
  };
}

/** Lo que se añade del catálogo al añadir paneles: el pequeño material de conexión, uno por panel. */
export function extrasSoloPaneles(datos) {
  const n = panelesAmpliacion(datos);
  return n ? [{ producto_ref: SOLO_PANELES.pequeno_material, cantidad: n, seccion: SEC_PANELES, _auto: 'solo_paneles' }] : [];
}

/**
 * Trabajos en una instalación que ya existe: solo batería, solo paneles o los
 * dos a la vez. Primero la batería, después los paneles.
 */
export function presupuestarAmpliacion(datos, mod, cfg) {
  const bat = esSoloBateria(datos), pan = esSoloPaneles(datos);
  if (bat && !pan) return presupuestarSoloBateria(datos, cfg);
  if (pan && !bat) return presupuestarSoloPaneles(datos, mod, cfg);
  const rb = presupuestarSoloBateria(datos, cfg), rp = presupuestarSoloPaneles(datos, mod, cfg);
  return {
    lineas: rb.lineas.concat(rp.lineas),
    incidencias: rb.incidencias.concat(rp.incidencias),
    variables: Object.assign({}, rb.variables, rp.variables),
    recargo_sobre_coste: rb.recargo_sobre_coste,
    motor_version: MOTOR_VERSION + ' · batería y paneles · FV v2 ' + String(mod.version),
    modelo_id: mod.id,
    resumen: null,
  };
}

/** Lo del catálogo en un trabajo sobre una instalación existente, en su orden:
 *  accesorios de la batería, pequeño material de los paneles y, al final, instalación y legalización de la batería. */
export function extrasAmpliacion(datos) {
  const bat = esSoloBateria(datos) ? extrasSoloBateria(datos) : [];
  const pan = esSoloPaneles(datos) ? extrasSoloPaneles(datos) : [];
  const finales = bat.filter((x) => x.seccion === SEC_INSTALACION);
  return bat.filter((x) => x.seccion !== SEC_INSTALACION).concat(pan, finales);
}
