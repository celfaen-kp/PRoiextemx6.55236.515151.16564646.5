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
// repetidor, Cat6, tejadillo, proyecto técnico y bonificación IBI. Con batería
// (o «dejar preparado») y Fronius, el inversor Plus y el Smart Meter los pone
// también el antiguo; con Tesla, ninguno.
// Decisión de Enzo (13-10-2026): «mantenemos lo nuevo y lo que no haya usamos
// lo antiguo».
//
// Está en un módulo aparte para que la Edge Function y las pruebas / informes
// (herramientas/informe-fv.js) usen EXACTAMENTE el mismo cálculo.
// =============================================================================

import { calcular, MOTOR_VERSION } from './motor.js';
import { calcularFV, entradaDesdeDatos, lineasPresupuesto } from './fv.js';

const FV_COMPLEMENTO = /^(04|09|10|14) · /;
const FV_SUELTAS = new Set(['FV-07-010', 'FV-07-011', 'FV-05-005', 'FV-05-006', 'FV-03-008', 'FV-13-002', 'FV-13-007']);

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

export function presupuestarFV(datos, mod, cfg) {
  const modelo = mod.datos;
  const m = entradaDesdeDatos(datos, modelo);
  const conBateria = String(datos.baterias || '') === 'si' || Number(datos.baterias_kwh) > 0;
  const fronius = m.entrada.sis === 'Fronius';
  const estructuraNueva = m.entrada.cubierta === 'Teja' || m.entrada.cubierta === 'Plana';
  // Con batería, o «dejar preparado» para ella, Fronius va en Plus (híbrido),
  // que el modelo v2 no trae: lo elige el motor por capítulos (Ramón, 13-10-2026).
  const preparado = String(datos.baterias || '') === 'dejar_preparado';
  const inversorFuera = (conBateria || preparado) && fronius;
  const r = calcularFV(m.entrada, modelo, { chapaAMedida: false, inversorFuera });
  const avisosEntrada = m.avisos.slice();
  if (!estructuraNueva) avisosEntrada.push('Cubierta «' + m.cubierta_app + '»: el modelo v2 no la cubre; la estructura sale del motor por capítulos con sus precios (pendientes de confirmar). Revisar.');
  if (inversorFuera && conBateria) avisosEntrada.push('Con batería, el inversor Fronius Plus (o ninguno con Tesla), el Smart Meter y la batería salen del motor por capítulos con su margen; el modelo v2 aún no lleva baterías.');
  if (inversorFuera && !conBateria) avisosEntrada.push('Preparado para baterías: el inversor Fronius Plus (híbrido) y el Smart Meter salen del motor por capítulos con su margen.');
  if (conBateria && m.entrada.sis === 'Deye') avisosEntrada.push('Batería con Deye: el presupuestador no la pone sola. Añádela desde «Añadir del catálogo» (WECO 5K0 LT, 5K3 EVO, 16K0 o Deye SE-F5 PRO, SE-F 16-C, con sus accesorios) y comprueba la compatibilidad en la ficha técnica.');
  if (conBateria && m.entrada.sis === 'Enphase') avisosEntrada.push('Batería con Enphase: la batería sale del motor por capítulos con su margen; el modelo v2 aún no lleva baterías.');
  const lineas = lineasPresupuesto(r, modelo, { modelo_version: mod.version, avisos: avisosEntrada });
  const incidencias = [];
  r.avisos.forEach((a) => incidencias.push({ nivel: /A MEDIDA/.test(a) ? 'error' : 'aviso', codigo: 'fv2', mensaje: a, campo: null }));
  avisosEntrada.forEach((a) => incidencias.push({ nivel: 'aviso', codigo: 'fv2_entrada', mensaje: a, campo: null }));

  const reglas = (cfg.reglas || []).filter((rg) => {
    const sec = String(rg.seccion || ''), ref = String(rg.producto_ref || '');
    if (rg.tipo === 'aviso') return true;
    if (ref === 'FV-10-003') return false;   // el elevador ya va en el v2 (65 €/h): nada de duplicarlo
    if (FV_COMPLEMENTO.test(sec) && !(sec.startsWith('04 · ') && m.entrada.sis === 'Deye')) return true;
    if (FV_SUELTAS.has(ref)) return true;
    if (!estructuraNueva && sec.startsWith('02 · ')) return true;
    if (inversorFuera && sec.startsWith('03 · ') && ref.startsWith('FV-FRONIUS-')) return true;
    if (inversorFuera && sec.startsWith('05 · ') && ref.startsWith('FV-FRONIUS-SMART-METER')) return true;
    return false;
  });
  const viejo = calcular('solar', datos, Object.assign({}, cfg, { reglas }));
  const deViejo = viejo.incidencias.filter((i) => i.codigo !== 'sin_lineas' && !/^Faltan los metros/.test(String(i.mensaje || '')));
  // El cargador de coche va en UNA partida (equipo + cuadro + instalación) con
  // su desglose por dentro, como la línea principal (Enzo, 20-10-2026).
  const lineasViejo = agruparCargador(viejo.lineas);
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
