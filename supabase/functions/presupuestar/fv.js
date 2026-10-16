// =============================================================================
// Sysefen · Motor de presupuestos · Fotovoltaica v2 (el presupuestador de Ramón)
//
// Traducción fiel de calculo_fv.py (Ramón, 12-10-2026): dimensionado, las 55
// partidas de coste, el precio con margen objetivo (50 % sobre la venta,
// redondeado hacia arriba a 10 €), el elevador aparte, el IVA y el margen real.
// Los datos (precios, proveedores, parámetros) NO están aquí: llegan en el
// `modelo` (el modelo_fv.json cargado en public.motor_modelos). Si cambia un
// precio, cambia el modelo; este archivo solo lleva las reglas.
//
// El redondeo es el de Excel: las mitades hacia arriba (no el bancario). Se
// comprueba con los 23 casos del Excel en pruebas/motor-fv.js: si no dan igual
// al céntimo, el motor está mal, no el Excel.
//
// Aparte del cálculo, aquí están las piezas que lo enganchan con la app:
//   · entradaDesdeDatos(): de la ficha de la visita / el suelto a los 20 campos
//     del modelo.
//   · lineasPresupuesto(): el resultado como líneas de presupuesto de la app
//     (UNA línea «llave en mano» con el desglose por dentro, y el elevador).
//   · lineasCliente(): lo que ve el cliente, por bloques y sin precios.
//   · pedidoMaterial(): el pedido por proveedor al aceptar.
//
// Sin nada de Supabase ni de la app: entra un objeto, sale otro.
// =============================================================================

const FV_VERSION = 'fv2';

/** ROUND de Excel (mitades hacia arriba, lejos de cero), sobre el valor
 *  escrito con 10 decimales para quitar el ruido binario (7 × 1,515 = 10,605 → 10,61). */
export function rnd(x, n) {
  n = n || 0;
  const v = Number(x) || 0;
  const s = Math.abs(v).toFixed(10);
  const [ent, dec] = s.split('.');
  const digitos = ent + dec.slice(0, n);           // entero escalado por 10^n
  const siguiente = dec.charCodeAt(n) - 48;
  let r = Number(digitos);
  if (siguiente >= 5) r += 1;
  r = r / Math.pow(10, n);
  return v < 0 ? -r : r;
}
/** ROUNDUP(x;0) de Excel, protegido contra el ruido de coma flotante. */
export function roundup(x) {
  return Math.ceil(Number((Number(x) || 0).toFixed(9)));
}
/** FIXED(x;n) de Excel en español: coma decimal y punto de miles. */
export function fixed(x, n) {
  const v = Number(x) || 0;
  const s = Math.abs(v).toFixed(n);
  const [e, d] = s.split('.');
  const ent = e.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-' : '') + ent + (n ? ',' + d : '');
}
/** El %g de Python para lo que sale en los textos: 50 → «50», 62.5 → «62.5». */
const g = (x) => String(Number(x) || 0);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const ENTRADA_POR_DEFECTO = {
  cli: '', muni: '', origen: 'Meta',
  factura_rango: 'Entre 100 € y 200 €', factura_exacta: null, consumo_real: null, paneles_forzado: null,
  sis: 'Fronius',            // Fronius | Deye | Enphase
  sumi: 'Monofásico',        // Monofásico | Trifásico
  cubierta: 'Teja',          // Teja | Plana (lastres Sun Ballast) | Chapa (= A MEDIDA)
  orient: 'Vertical',        // Vertical | Horizontal
  filas: 2, dist_cc: 20, dist_ac: 20, km: 20,
  subv: 'Sí', cee: 'No', cee_desplaz_h: 0,
  horas_elev: 0,
  dto: 0,                    // solo lo decide Ramón
};
export const BLOQUES_MATERIAL = ['MÓDULOS FOTOVOLTAICOS', 'INVERSOR', 'MEDICIÓN Y MONITORIZACIÓN', 'ESTRUCTURA', 'MATERIAL ELÉCTRICO'];

/**
 * El cálculo. `entrada` lleva los campos de ENTRADA_POR_DEFECTO (los que
 * falten toman el valor por defecto); `modelo` es el modelo_fv.json.
 * `opciones` (solo las usa la app, nunca las pruebas del Excel):
 *   · chapaAMedida: false → una cubierta que no es teja ni plana no bloquea el
 *     precio: sale sin estructura y la estructura la pone el motor antiguo.
 *   · inversorFuera: true → el inversor y el medidor no se cuentan aquí (los
 *     pone el motor antiguo: Fronius Plus con batería, o nada con Tesla).
 */
export function calcularFV(entrada, modelo, opciones) {
  const op = opciones || {};
  const e = Object.assign({}, ENTRADA_POR_DEFECTO, entrada || {});
  const P = {};
  Object.keys(modelo.parametros || {}).forEach((k) => { P[k] = modelo.parametros[k].valor; });
  const PR = modelo.precios || {};
  const mono = e.sumi === 'Monofásico' ? 1 : 0;
  const fv = e.sis === 'Enphase' ? 0 : 1;
  const enp = 1 - fv;
  const mt = (clave) => (mono ? PR[clave].mono : PR[clave].tri);
  const baywa = (c) => rnd(c * (1 + P.portes_baywa), 2);
  const rebacas = (c) => rnd(c * (1 - P.dto_rebacas) * (1 + P.portes_rebacas), 2);

  // ---------- dimensionado
  const factura = num(e.factura_exacta) > 0 ? num(e.factura_exacta) : modelo.tramos_factura[e.factura_rango];
  const consumo = num(e.consumo_real) > 0 ? num(e.consumo_real) : rnd(factura * 12 / P.precio_kwh, 0);
  let n_pan;
  if (num(e.paneles_forzado) > 0) n_pan = num(e.paneles_forzado);
  else n_pan = Math.max(P.min_pan, roundup(consumo * P.cobertura / P.prod_kwp * 1000 / P.wp));
  const kwp = rnd(n_pan * P.wp / 1000, 2);
  const prod = rnd(kwp * P.prod_kwp, 0);
  const n_str = n_pan <= 10 ? 1 : 2;
  let inv = null;
  if (fv) {
    const candidatos = (modelo.inversores || []).filter((i) => i.sistema === e.sis && i.suministro === e.sumi && i.usar && i.kw >= kwp / P.ratio);
    candidatos.forEach((i) => { if (!inv || i.kw < inv.kw) inv = i; });
  }
  const kw_inv = enp ? 0 : (inv ? inv.kw : null);          // null = A MEDIDA
  const mod_inv = enp ? 'Microinversores Enphase IQ8P (uno por panel)' : (inv ? inv.modelo : 'A MEDIDA');
  let coste_inv = 0;
  if (inv) coste_inv = inv.proveedor === 'BayWa' ? baywa(inv.coste_base) : rebacas(inv.coste_base);
  const filas = Math.max(1, num(e.filas) || 1);
  const pan_fila = roundup(n_pan / filas);
  const largo_fila = pan_fila * (e.orient === 'Horizontal' ? P.largo_pan : P.ancho_pan) + 0.1;
  const m_perfil = filas * 2 * largo_fila;
  const anclajes = filas * 2 * (roundup(largo_fila / P.sep_anclaje) + 1);
  const jornadas = n_pan <= 12 ? 2 : (n_pan <= 22 ? 3 : 4);
  const jornada = P.horas_jornada * (P.eur_h_oficial + P.eur_h_peon);
  const teja = e.cubierta === 'Teja' ? 1 : 0;
  const plana = e.cubierta === 'Plana' ? 1 : 0;
  const lastres = plana * filas * (pan_fila + 1);           // Ramón: (paneles por fila + 1) × filas
  const cubiertaRara = e.cubierta !== 'Teja' && e.cubierta !== 'Plana';
  const bloqueo = ((fv && kw_inv === null) || (cubiertaRara && op.chapaAMedida !== false)) ? 1 : 0;
  const av_est = e.cubierta === 'Chapa' ? 'Estructura A MEDIDA: cubierta de chapa'
    : (plana ? 'Cubierta plana: comprobar sobrecarga (' + lastres + ' lastres × 70 kg = ' + (lastres * 70) + ' kg) y medios para subir los lastres' : '');
  const subv = e.subv === 'Sí', cee = e.cee === 'Sí';
  const eur_h = P.eur_h, eur_km = P.eur_km;
  const dc = num(e.dist_cc), da = num(e.dist_ac), km = num(e.km);
  let cuadro_ac = null;   // el cuadro AC Sölver más pequeño del suministro que cubre la potencia del inversor
  if (fv && kw_inv !== null) {
    (modelo.cuadros_ac || []).filter((c) => c.suministro === e.sumi && c.kw_max >= kw_inv)
      .forEach((c) => { if (!cuadro_ac || c.kw_max < cuadro_ac.kw_max) cuadro_ac = c; });
  }
  const c_ac = cuadro_ac ? rnd(cuadro_ac.pvp * (1 - P.dto_saltoki), 2) : 0;
  const av_ac = (fv && kw_inv !== null && !cuadro_ac) ? 'Falta precio del cuadro AC Solver para ' + g(kw_inv) + ' kW' : '';
  const caja = PR.caja_famatel_22m;
  // Con el inversor fuera (lo pone el motor antiguo) no se cuentan ni él ni su medidor.
  const invAqui = op.inversorFuera ? 0 : 1;
  // Cable de continua: sección por caída de tensión (v2.1, Enzo 16-10-2026). Con el
  // modelo v2 original (sin estos parámetros) sigue el 6 mm² fijo de Ramón.
  const cc = seccionCableCC(n_pan, n_str, dc + 5, P, PR);
  const cableCC = PR.cable_solar_6mm_m ? Object.assign({}, cc) : cc;

  // ---------- partidas: [bloque, partida, ud, cantidad, coste_ud, texto para el cliente, aviso]
  const L = [
    ['MÓDULOS FOTOVOLTAICOS', 'Panel Trina Vertex S+ 510 Wp', 'ud', n_pan, P.coste_panel, n_pan + ' módulos Trina Vertex S+ 510 Wp (' + fixed(kwp, 2) + ' kWp)', ''],
    ['INVERSOR', 'Inversor', 'ud', fv * invAqui, coste_inv, mod_inv, (fv && kw_inv === null) ? 'Inversor A MEDIDA: no hay modelo tipo para esta potencia' : ''],
    ['INVERSOR', 'Microinversor Enphase IQ8P', 'ud', enp * n_pan, baywa(PR.enphase_iq8p.coste), 'Microinversores Enphase IQ8P, uno por panel (' + n_pan + ')', ''],
    ['INVERSOR', 'Enphase Q Cable 2,5 mm 1,7 m', 'ud', enp * n_pan, baywa(mt('enphase_qcable')), 'Cableado de bus Enphase Q Cable', ''],
    ['INVERSOR', 'Enphase tapón final', 'ud', enp, baywa(mt('enphase_tapon')), '', ''],
    ['INVERSOR', 'Enphase conectores de campo (2 machos + 2 hembras)', 'ud', enp * 4, baywa(mt('enphase_conector')), '', ''],
    ['MEDICIÓN Y MONITORIZACIÓN', 'Medidor Fronius Smart Meter', 'ud', (e.sis === 'Fronius' ? 1 : 0) * invAqui, baywa(mt('fronius_smart_meter')),
      'Medidor Fronius Smart Meter ' + (mono ? 'TS 100A-1' : 'TS 65A-3') + ' para gestión de la energía', ''],
    ['MEDICIÓN Y MONITORIZACIÓN', 'Medidor para Deye (antivertido)', 'ud', e.sis === 'Deye' ? 1 : 0, rebacas(mt('deye_medidor')), 'Medidor de energía para el control de la inyección', ''],
    ['MEDICIÓN Y MONITORIZACIÓN', 'Cable de datos UTP Cat5e + 2 RJ45', 'm', fv * da, PR.utp_cat5e_m.coste, '', ''],
    ['MEDICIÓN Y MONITORIZACIÓN', 'Conectores RJ45', 'ud', fv * 2, PR.rj45.coste, '', ''],
    ['MEDICIÓN Y MONITORIZACIÓN', 'Enphase IQ Gateway Metered (Envoy)', 'ud', enp, baywa(PR.enphase_envoy.coste), 'Pasarela Enphase IQ Gateway (Envoy) con monitorización y app', ''],
    ['MEDICIÓN Y MONITORIZACIÓN', 'Enphase CT', 'ud', enp * (mono ? 1 : 3), baywa(PR.enphase_ct.coste), 'Transformadores de medida', ''],
    ['MEDICIÓN Y MONITORIZACIÓN', 'Enphase Q-Relay', 'ud', enp * (n_pan <= 11 ? 1 : 2), baywa(mt('enphase_qrelay')), 'Relé de protección de red Enphase Q-Relay', ''],
    ['ESTRUCTURA', 'Perfil G1 4,8 m', 'ud', teja * roundup(m_perfil / 4.8), PR.perfil_g1_4m8.coste,
      'Estructura coplanar de aluminio para teja (' + filas + ' filas, montaje ' + String(e.orient).toLowerCase() + '): perfiles, presores y anclajes químicos', av_est],
    ['ESTRUCTURA', 'Unión de perfiles UG1', 'ud', teja * filas * 2 * (roundup(largo_fila / 4.8) - 1), PR.union_ug1.coste, '', ''],
    ['ESTRUCTURA', 'Presor final', 'ud', teja * filas * 4, PR.presor_final.coste, '', ''],
    ['ESTRUCTURA', 'Presor intermedio', 'ud', teja * filas * 2 * (pan_fila - 1), PR.presor_intermedio.coste, '', ''],
    ['ESTRUCTURA', 'Pincho VR para teja 250 mm', 'ud', teja * anclajes, PR.pincho_vr_teja.coste, '', ''],
    ['ESTRUCTURA', 'Taco químico Würth 300 ml', 'ud', teja * roundup(anclajes / P.anc_cartucho), PR.taco_quimico_300ml.coste, '', ''],
    ['ESTRUCTURA', 'Malla metálica Würth', 'ud', teja * roundup(anclajes / P.anc_malla), PR.malla_wurth.coste, '', ''],
    ['ESTRUCTURA', 'Conector de tierra Sunfer', 'ud', n_pan, PR.conector_tierra_sunfer.coste, '', ''],
    ['ESTRUCTURA', 'Tejas de reposición', 'ud', teja * 3, PR.teja_reposicion.coste, '', ''],
    ['ESTRUCTURA', 'Lastre Sun Ballast 10° LONG 70 kg', 'ud', lastres, PR.lastre_sunballast_10.coste,
      plana ? 'Estructura para cubierta plana con lastres de hormigón Sun Ballast a 10° (sin perforar la cubierta) y presores de aluminio' : '', ''],
    ['ESTRUCTURA', 'Kit presor central Sun Ballast (bolsa 10)', 'bolsa', plana * roundup(filas * 2 * (pan_fila - 1) / 10), PR.kit_presor_central_sb.coste, '', ''],
    ['ESTRUCTURA', 'Kit presor final Sun Ballast (bolsa 10)', 'bolsa', plana * roundup(filas * 4 / 10), PR.kit_presor_final_sb.coste, '', ''],
    ['ESTRUCTURA', 'Lámina protectora de goma Sun Ballast 15×25 cm (2 piezas)', 'bolsa', lastres, PR.lamina_goma_sb.coste, '', ''],
    ['MATERIAL ELÉCTRICO', 'Cable solar H1Z2Z2-K ' + g(cableCC.seccion) + ' mm² (rojo + negro)', 'm', fv * (dc + 5) * n_str * 2, cableCC.coste_m,
      fv ? 'Cable solar ' + g(cableCC.seccion) + ' mm² 1500 V (' + g((dc + 5) * n_str * 2) + ' m) con conectores MC4' : '', fv ? cableCC.aviso : ''],
    ['MATERIAL ELÉCTRICO', 'Conectores MC4 (macho + hembra)', 'ud', fv * (n_str * 2 + 2) * 2, PR.mc4_par.coste, '', ''],
    ['MATERIAL ELÉCTRICO', 'Tubo corrugado M25 en cubierta', 'm', 5, PR.tubo_corrugado_m25_m.coste, 'Canalización en tubo de PVC por cubierta y fachada', ''],
    ['MATERIAL ELÉCTRICO', 'Tubo rígido M25 (tira 3 m) CC', 'ud', roundup(dc / 3), PR.tubo_rigido_m25_3m.coste, '', ''],
    ['MATERIAL ELÉCTRICO', 'Grapas', 'ud', dc * 2, PR.grapa.coste, '', ''],
    ['MATERIAL ELÉCTRICO', 'Racores M25', 'ud', 4, PR.racor_m25.coste, '', ''],
    ['MATERIAL ELÉCTRICO', 'Cuadro CC Solver 1 string', 'ud', fv * (n_str === 1 ? 1 : 0), PR.cuadro_cc_1string.coste,
      fv ? 'Cuadro de protecciones de continua (fusibles y sobretensiones)' : '', ''],
    ['MATERIAL ELÉCTRICO', 'Cuadro CC Solver 2 strings', 'ud', fv * (n_str === 2 ? 1 : 0), PR.cuadro_cc_2strings.coste,
      fv ? 'Cuadro de protecciones de continua (fusibles y sobretensiones)' : '', ''],
    ['MATERIAL ELÉCTRICO', 'Cuadro AC Solver', 'ud', fv, c_ac,
      fv ? 'Cuadro de protecciones de alterna (magnetotérmico, diferencial y sobretensiones)' : '', av_ac],
    ['MATERIAL ELÉCTRICO', 'Cable AC H07Z1-K 1×6', 'm', da * (mono ? 3 : 5), PR.cable_h07z1k_6mm_m.coste, 'Línea de alterna hasta el cuadro general (' + g(da) + ' m)', ''],
    ['MATERIAL ELÉCTRICO', 'Tubo rígido M25 (tira 3 m) AC', 'ud', roundup(da / 3), PR.tubo_rigido_m25_3m.coste, '', ''],
    ['MATERIAL ELÉCTRICO', 'Magnetotérmico de conexión en el cuadro general', 'ud', 1, mt('magnetotermico'), '', ''],
    ['MATERIAL ELÉCTRICO', 'Caja de superficie Famatel 2 filas 22 módulos (Enphase)', 'ud', enp, rnd(caja.pvp * (1 - caja.dto), 2),
      enp ? 'Cuadro de protecciones de alterna en caja de superficie' : '', ''],
    ['MATERIAL ELÉCTRICO', 'Magnetotérmicos Enphase', 'ud', enp * 2, mt('magnetotermico'), '', ''],
    ['MATERIAL ELÉCTRICO', 'Diferencial tipo F (Enphase)', 'ud', enp, PR.diferencial_tipo_f.coste || 0, '', enp ? 'Falta precio del diferencial tipo F' : ''],
    ['MATERIAL ELÉCTRICO', 'Cable de tierra 6 mm²', 'm', dc + 5, PR.cable_h07z1k_6mm_m.coste, 'Toma de tierra de la estructura', ''],
    ['MATERIAL ELÉCTRICO', 'Terminales de cobre', 'ud', 10, PR.terminal_cobre.coste, '', ''],
    ['MANO DE OBRA', 'Montaje (oficial + peón)', 'jornada', jornadas, jornada,
      'Montaje completo por personal propio: estructura, módulos, inversor, cuadros, cableado, pruebas y puesta en marcha', ''],
    ['TRÁMITES', 'Legalización (Xavi 1 h)', 'h', 1, eur_h, 'Legalización: certificado de baja tensión, registro de autoconsumo y comunicación a la distribuidora', ''],
    ['TRÁMITES', 'Tasa de legalización', 'ud', 1, PR.tasa_legalizacion.coste, '', ''],
    ['TRÁMITES', 'Documentación final (Xavi 1 h)', 'h', 1, eur_h, 'Documentación final, esquema y manual de uso', ''],
    ['TRÁMITES', 'Permiso de obra (Xavi 0,5 h)', 'h', 0.5, eur_h, 'Comunicación previa / permiso de obra (tasas municipales no incluidas)', ''],
    ['TRÁMITES', 'Gestión de subvención (Xavi 1 h)', 'h', subv ? 1 : 0, eur_h,
      subv ? 'Gestión y presentación de la subvención (sin garantizar su concesión ni importe)' : '', ''],
    ['TRÁMITES', 'Certificado energético', 'h', cee ? (1 + num(e.cee_desplaz_h)) : 0, eur_h, cee ? 'Certificado de eficiencia energética' : '', ''],
    ['TRÁMITES', 'Tasa del certificado', 'ud', cee ? 1 : 0, PR.tasa_certificado.coste, '', ''],
    ['PUESTA EN MARCHA', 'Puesta en marcha y app', '—', 0, 0, 'Puesta en marcha, configuración y acceso del titular a la monitorización', ''],
    ['INTERNO', 'Visita técnica (45 min + trayecto)', 'h', 0.75 + km * 2 / P.vel_media, eur_h, '', ''],
    ['INTERNO', 'Revisión del presupuesto', 'h', 0.5, eur_h, '', ''],
    ['INTERNO', 'Desplazamientos furgoneta', 'km', km * 2 * (1 + jornadas), eur_km, '', ''],
    ['INTERNO', 'Recogida por faltas (previsión)', 'ud', 0.5, P.eur_h_peon + 20 * eur_km, '', ''],
    ['INTERNO', 'Garantía (media jornada + km)', 'ud', 1, jornada / 2 + km * 2 * eur_km, '', ''],
    ['INTERNO', 'Llamada de satisfacción (0,5 h)', 'h', 0.5, eur_h, '', ''],
  ];
  const partidas = L.map(([b, p, u, q, cu, t, a]) => ({ bloque: b, partida: p, ud: u, cantidad: q, coste_ud: cu, coste: rnd(q * cu, 2), texto: t, aviso: a }));
  const base_peq = partidas.filter((x) => BLOQUES_MATERIAL.includes(x.bloque)).reduce((s, x) => s + x.coste, 0);
  const peq = rnd(P.pct_peq * base_peq, 2);
  partidas.push({ bloque: 'PEQUEÑO MATERIAL', partida: 'Pequeño material (3 % del material principal)', ud: '€', cantidad: 1,
    coste_ud: peq, coste: peq, texto: 'Pequeño material de fijación, conexión y protección del cableado', aviso: '' });
  const coste_total = partidas.reduce((s, x) => s + x.coste, 0);

  // ---------- precio
  const precio_obj = bloqueo ? 0 : Math.ceil(Number((coste_total / (1 - P.margen_obj) / P.redondeo).toFixed(9))) * P.redondeo;
  const horas_elev = Math.max(num(e.horas_elev), plana * P.horas_elev_plana);   // en cubierta plana, siempre elevador
  const elev = horas_elev * P.pvp_elev;
  const pvp_antes = precio_obj + elev;
  const dto_eur = -rnd(pvp_antes * num(e.dto), 2);
  const pvp_final = pvp_antes + dto_eur;
  const iva_eur = rnd(pvp_final * P.iva, 2);
  const pvp_iva = pvp_final + iva_eur;
  const margen_real = pvp_final === 0 ? 0 : (pvp_final - coste_total) / pvp_final;

  let avisos = [];
  if (bloqueo) avisos.push('CASO A MEDIDA: el presupuestador no da precio. Pasar a Ramón');
  if (n_pan > P.max_pan) avisos.push('Más de ' + P.max_pan + ' paneles: revisar jornadas y estructura');
  if (!num(e.factura_exacta) && !num(e.consumo_real) && !num(e.paneles_forzado) && e.factura_rango === 'No lo sé') {
    avisos.push('Factura desconocida: dimensionado poco fiable');
  }
  if (num(e.dto) > 0) avisos.push('Descuento aplicado: margen real ' + fixed(margen_real * 100, 1) + ' %');
  avisos = avisos.concat(partidas.filter((x) => x.aviso).map((x) => x.aviso));
  avisos = avisos.filter((a, i) => avisos.indexOf(a) === i);

  return {
    entrada: e, factura, consumo, n_pan, kwp, prod, n_str, kw_inv, mod_inv, coste_inv, cuadro_ac, jornadas, jornada, bloqueo,
    partidas, coste_total: rnd(coste_total, 2), precio_objetivo: precio_obj, elevador: elev, horas_elev, pvp_antes, dto_eur,
    pvp_final: rnd(pvp_final, 2), iva_eur, pvp_iva: rnd(pvp_iva, 2), margen_real, avisos,
    pvp_elev: P.pvp_elev,
    cable_cc: cableCC,
  };
}

/* --- Sección del cable de continua por caída de tensión (v2.1) ---------------
 * S = 2 · L · I / (γ · ΔV), con L la tirada de un string (ida; el 2 es ida y
 * vuelta), I la corriente del string (Imp del panel), γ la conductividad del
 * cobre y ΔV la caída admitida = cdt_max · tensión del string (paneles por
 * string × Vmp). Se elige la sección comercial que cumple, mínimo 6 mm².
 * Sin los parámetros en el modelo (v2 original) devuelve el 6 mm² de siempre.
 * Devuelve también la tabla de secciones con su caída, para enseñarla. */
export const SECCIONES_CC = [6, 10, 16, 25, 35];
export function seccionCableCC(n_pan, n_str, L, P, PR) {
  const base = { seccion: 6, coste_m: PR.cable_solar_6mm_m ? PR.cable_solar_6mm_m.coste : 0, aviso: '', tabla: [], calculo: null };
  const vmp = num(P.panel_vmp), imp = num(P.panel_imp), cdt = num(P.cdt_max_cc), gamma = num(P.conductividad_cu);
  if (!(vmp > 0 && imp > 0 && cdt > 0 && gamma > 0) || !(n_pan > 0) || !(L > 0)) return base;
  const porString = Math.ceil(n_pan / Math.max(1, n_str));
  const vString = porString * vmp;
  const dV = cdt * vString;
  const sCalc = 2 * L * imp / (gamma * dV);
  const porSec = (PR.cable_solar_por_seccion && PR.cable_solar_por_seccion.coste_m) || {};
  const precio6 = base.coste_m;
  const tabla = SECCIONES_CC.map((S) => {
    const caida = 2 * L * imp / (gamma * S);
    const real = porSec[String(S)];
    const coste = real != null ? num(real) : (S === 6 ? precio6 : rnd(precio6 * S / 6, 3));
    return { seccion: S, caida_v: rnd(caida, 2), caida_pct: rnd(caida / vString * 100, 2), cumple: caida <= dV + 1e-9, coste_m: coste, precio_estimado: real == null && S !== 6 };
  });
  const elegida = tabla.find((t) => t.cumple) || tabla[tabla.length - 1];
  let aviso = '';
  if (elegida.seccion > 6) {
    aviso = 'Cable CC de ' + elegida.seccion + ' mm² por caída de tensión (' + g(L) + ' m por string, ' + porString + ' paneles × ' + g(vmp) + ' V = ' + g(rnd(vString, 0)) + ' V, '
      + g(imp) + ' A, máx. ' + g(cdt * 100) + ' %): caída ' + g(elegida.caida_pct) + ' %.'
      + (elegida.precio_estimado ? ' Precio del ' + elegida.seccion + ' mm² PENDIENTE de Electromat: estimado proporcional a la sección.' : '')
      + (elegida.seccion >= 16 ? ' Revisar el diámetro del tubo (los MC4 se mantienen: se adapta el terminal, Enzo 16-10-2026).' : '');
  }
  if (!tabla.some((t) => t.cumple)) aviso = 'Ni con ' + elegida.seccion + ' mm² se cumple el ' + g(cdt * 100) + ' % de caída (' + g(elegida.caida_pct) + ' %): repartir en más strings o acercar el inversor. ' + aviso;
  return { seccion: elegida.seccion, coste_m: elegida.coste_m, aviso, tabla,
    calculo: { L, por_string: porString, v_string: rnd(vString, 1), imp, gamma, cdt_max_pct: cdt * 100, s_calc: rnd(sCalc, 2), caida_pct: elegida.caida_pct } };
}

// Proveedor al que se pide cada partida de material (según las compras reales de Sysefen).
export const PROVEEDOR_FV = {
  'Panel Trina Vertex S+ 510 Wp': 'Electromat',
  'Microinversor Enphase IQ8P': 'BayWa', 'Enphase Q Cable 2,5 mm 1,7 m': 'BayWa', 'Enphase tapón final': 'BayWa',
  'Enphase conectores de campo (2 machos + 2 hembras)': 'BayWa', 'Medidor Fronius Smart Meter': 'BayWa',
  'Enphase IQ Gateway Metered (Envoy)': 'BayWa', 'Enphase CT': 'BayWa', 'Enphase Q-Relay': 'BayWa',
  'Medidor para Deye (antivertido)': 'Rebacas',
  'Cable de datos UTP Cat5e + 2 RJ45': 'Massanella', 'Conectores RJ45': 'Massanella',
  'Perfil G1 4,8 m': 'Electromat', 'Unión de perfiles UG1': 'Electromat', 'Presor final': 'Electromat',
  'Presor intermedio': 'Electromat', 'Pincho VR para teja 250 mm': 'Electromat',
  'Taco químico Würth 300 ml': 'Würth', 'Malla metálica Würth': 'Würth', 'Conectores MC4 (macho + hembra)': 'Würth',
  'Conector de tierra Sunfer': 'Massanella', 'Tejas de reposición': 'Massanella', 'Tubo corrugado M25 en cubierta': 'Massanella',
  'Racores M25': 'Massanella',
  'Cable solar H1Z2Z2-K 6 mm² (rojo + negro)': 'Electromat', 'Tubo rígido M25 (tira 3 m) CC': 'Electromat', 'Grapas': 'Electromat',
  'Cable AC H07Z1-K 1×6': 'Electromat', 'Tubo rígido M25 (tira 3 m) AC': 'Electromat',
  'Magnetotérmico de conexión en el cuadro general': 'Electromat', 'Caja de superficie Famatel 2 filas 22 módulos (Enphase)': 'Saltoki',
  'Magnetotérmicos Enphase': 'Electromat', 'Diferencial tipo F (Enphase)': 'Electromat', 'Cable de tierra 6 mm²': 'Electromat',
  'Terminales de cobre': 'Electromat', 'Lastre Sun Ballast 10° LONG 70 kg': 'Electromat',
  'Kit presor central Sun Ballast (bolsa 10)': 'Electromat', 'Kit presor final Sun Ballast (bolsa 10)': 'Electromat',
  'Lámina protectora de goma Sun Ballast 15×25 cm (2 piezas)': 'Electromat',
  'Cuadro CC Solver 1 string': 'Saltoki', 'Cuadro CC Solver 2 strings': 'Saltoki', 'Cuadro AC Solver': 'Saltoki',
};

/** Listado de material para pedir cuando el cliente ACEPTA, agrupado por
 *  proveedor. Solo material (no mano de obra, trámites ni internos); cantidades
 *  redondeadas hacia arriba. El pequeño material (3 %) no se pide: sale de almacén. */
export function pedidoMaterial(r, modelo) {
  if (r.bloqueo) return null;   // A MEDIDA: el listado lo prepara Ramón a mano
  const caja = (modelo && modelo.precios && modelo.precios.caja_famatel_22m) || {};
  const prov = {};
  r.partidas.forEach((x) => {
    if (!BLOQUES_MATERIAL.includes(x.bloque) || x.cantidad <= 0) return;
    let nombre, quien;
    if (x.partida === 'Inversor') { nombre = r.mod_inv; quien = r.entrada.sis === 'Fronius' ? 'BayWa' : 'Rebacas'; }
    else if (x.partida === 'Cuadro AC Solver' && r.cuadro_ac) { nombre = r.cuadro_ac.descripcion + ' · ref. Saltoki ' + r.cuadro_ac.codigo; quien = 'Saltoki'; }
    else if (x.partida.indexOf('Caja de superficie Famatel') === 0) { nombre = (caja.descripcion || x.partida) + (caja.codigo ? ' · ref. Saltoki ' + caja.codigo : ''); quien = 'Saltoki'; }
    else if (x.partida.indexOf('Cable solar H1Z2Z2-K') === 0) { nombre = x.partida; quien = 'Electromat'; }
    else { nombre = x.partida; quien = PROVEEDOR_FV[x.partida] || 'PENDIENTE'; }
    const cant = roundup(x.cantidad);
    const aviso = x.aviso || (x.coste_ud === 0 ? 'Sin precio de coste: pedir precio' : '');
    (prov[quien] = prov[quien] || []).push({ articulo: nombre, ud: x.ud, cantidad: cant, coste_ud: x.coste_ud, importe: rnd(cant * x.coste_ud, 2), aviso });
  });
  const salida = {};
  Object.keys(prov).sort().forEach((q) => { salida[q] = { lineas: prov[q], total: rnd(prov[q].reduce((s, i) => s + i.importe, 0), 2) }; });
  return salida;
}

/** Lo que sale en el PDF del cliente: bloques con textos, sin precios
 *  (partidas con cantidad > 0, sin INTERNO). */
export function lineasCliente(r) {
  const out = {};
  const nombreBloque = { 'PEQUEÑO MATERIAL': 'MATERIAL ELÉCTRICO', 'PUESTA EN MARCHA': 'PUESTA EN MARCHA Y MONITORIZACIÓN', 'TRÁMITES': 'TRÁMITES Y GESTIONES' };
  r.partidas.forEach((x) => {
    if (x.bloque === 'INTERNO' || !x.texto) return;
    if (x.cantidad > 0 || x.bloque === 'PUESTA EN MARCHA') {
      const b = nombreBloque[x.bloque] || x.bloque;
      out[b] = out[b] || [];
      if (!out[b].includes(x.texto)) out[b].push(x.texto);
    }
  });
  if (r.elevador > 0) (out['MEDIOS AUXILIARES'] = out['MEDIOS AUXILIARES'] || []).push('Elevador de carga (' + g(r.horas_elev) + ' h)');
  return out;
}
export const ORDEN_BLOQUES = ['MÓDULOS FOTOVOLTAICOS', 'INVERSOR', 'MEDICIÓN Y MONITORIZACIÓN', 'ESTRUCTURA', 'MATERIAL ELÉCTRICO', 'MANO DE OBRA',
  'PUESTA EN MARCHA Y MONITORIZACIÓN', 'TRÁMITES Y GESTIONES', 'MEDIOS AUXILIARES'];
export const NOTA_CLIENTE = 'Excluida cualquier obra a realizar, se valorará en el momento. Tasas municipales no incluidas. Presupuesto orientativo, pendiente de visita técnica.';
export const CONDICIONES_CLIENTE = 'Forma de pago: 50 % a la aceptación, 30 % al inicio de los trabajos y 20 % a la puesta en marcha, por transferencia. '
  + 'Validez: 15 días naturales. Subvención: se gestiona sin garantizar su concesión, importe ni plazos. Garantía de mano de obra: 2 años.';

/* --- De la ficha de la app a la entrada del modelo ------------------------
 * La ficha de la visita y el presupuesto suelto usan los mismos nombres
 * (datosDelSuelto los traduce), así que esto vale para los dos. Lo que no
 * viene toma el valor por defecto del modelo y se avisa. */
const TRAMOS = { menos_100: 'Menos de 100 €', '100_200': 'Entre 100 € y 200 €', '200_350': 'Entre 200 € y 350 €',
  '350_600': 'Entre 350 € y 600 €', mas_600: 'Más de 600 €', no_lo_se: 'No lo sé' };
export function entradaDesdeDatos(d, modelo) {
  d = d || {};
  const avisos = [];
  const n = (k) => num(d[k]);
  const wp = (modelo.parametros && modelo.parametros.wp && modelo.parametros.wp.valor) || 510;
  const marca = String(d.inversor_marca || 'fronius').toLowerCase();
  const sis = marca === 'enphase' ? 'Enphase' : marca === 'deye' ? 'Deye' : 'Fronius';
  const cub = String(d.tipo_cubierta || 'teja_arabe');
  const cubierta = cub === 'teja_arabe' || cub === 'pizarra' ? 'Teja'
    : (cub === 'plana_transitable' || cub === 'plana_no_transitable' || cub === 'suelo') ? 'Plana'
    : cub === 'chapa_sandwich' ? 'Chapa' : 'Otra';
  if (cub === 'pizarra') avisos.push('Cubierta de pizarra: se ha contado como teja (pinchos y taco químico). Revisar la fijación.');
  // Paneles: los de la ficha (los que caben, o a mano); si no, los kWp pedidos; si no, el consumo o la factura.
  let paneles = Math.max(n('modulos_estimados'), n('paneles_manual'));
  if (!paneles && n('kwp_objetivo') > 0) paneles = Math.ceil(n('kwp_objetivo') * 1000 / wp);
  if (n('wp_manual') > 0 && Math.round(n('wp_manual')) !== wp) {
    avisos.push('El modelo presupuesta el panel de ' + wp + ' Wp (Trina Vertex S+); los ' + g(n('wp_manual')) + ' Wp de la ficha no se usan.');
  }
  const filasLista = Array.isArray(d.filas_paneles) ? d.filas_paneles.filter((f) => f && num(f.paneles) > 0) : [];
  const filas = filasLista.length ? filasLista.length : (ENTRADA_POR_DEFECTO.filas);
  if (!filasLista.length) avisos.push('Sin filas apuntadas: se cuentan ' + filas + ' filas de paneles.');
  const dc = n('distancia_cubierta_inversor_m'), da = n('distancia_inversor_cuadro_m'), km = n('km_obra');
  if (!(dc > 0)) avisos.push('Faltan los metros de paneles → inversor: se cuentan ' + ENTRADA_POR_DEFECTO.dist_cc + ' m.');
  if (!(da > 0)) avisos.push('Faltan los metros de inversor → cuadro: se cuentan ' + ENTRADA_POR_DEFECTO.dist_ac + ' m.');
  if (!(km > 0)) avisos.push('Faltan los km a la obra: se cuentan ' + ENTRADA_POR_DEFECTO.km + ' km (solo ida).');
  const rango = TRAMOS[String(d.factura_rango || '')] || ENTRADA_POR_DEFECTO.factura_rango;
  const entrada = {
    factura_rango: rango,
    factura_exacta: n('factura_mensual_eur') > 0 ? n('factura_mensual_eur') : null,
    consumo_real: n('consumo_anual_kwh') > 0 ? n('consumo_anual_kwh') : null,
    paneles_forzado: paneles > 0 ? paneles : null,
    sis,
    sumi: String(d.suministro || '') === 'trifasico' ? 'Trifásico' : 'Monofásico',
    cubierta,
    orient: String(d.orientacion_panel || '') === 'horizontal' ? 'Horizontal' : 'Vertical',
    filas,
    dist_cc: dc > 0 ? dc : ENTRADA_POR_DEFECTO.dist_cc,
    dist_ac: da > 0 ? da : ENTRADA_POR_DEFECTO.dist_ac,
    km: km > 0 ? km : ENTRADA_POR_DEFECTO.km,
    subv: d.subvencion === true || d.subvencion === 'true' || d.subvencion === 1 ? 'Sí' : 'No',
    cee: d.certificado_energetico === true || d.certificado_energetico === 'true' || d.certificado_energetico === 1 ? 'Sí' : 'No',
    cee_desplaz_h: n('cee_desplaz_h'),
    horas_elev: n('horas_elevador'),
    dto: 0,   // el descuento al pie lo aplica la cadena de precios de la app, línea a línea
  };
  return { entrada, avisos, cubierta_app: cub };
}

/* --- El resultado como líneas de presupuesto de la app ---------------------
 * UNA línea «Instalación fotovoltaica llave en mano» (cantidad 1, venta = precio
 * con margen objetivo, coste = coste total) con el desglose de las 55 partidas
 * por dentro (origen_inputs), y el elevador aparte si lo hay. El cliente ve
 * la línea y lo que incluye, sin precios por partida (criterio de Ramón). */
export function lineasPresupuesto(r, modelo, extra) {
  const ex = extra || {};
  const bloques = lineasCliente(r);
  const detalle = ORDEN_BLOQUES.filter((b) => bloques[b]).map((b) => b + ': ' + bloques[b].join('; ')).join(' · ');
  const desglose = r.partidas.map((x) => ({
    bloque: x.bloque, nombre: x.partida, cantidad: Math.round(x.cantidad * 1000) / 1000, unidad: x.ud,
    coste_ud: x.coste_ud, coste: x.coste, aviso: x.aviso || null,
  }));
  const lineas = [{
    producto_ref: null,
    descripcion: 'Instalación fotovoltaica llave en mano (' + r.n_pan + ' paneles, ' + fixed(r.kwp, 2) + ' kWp, ' + String(r.entrada.sumi).toLowerCase() + ')',
    detalle_tecnico: detalle,
    especificaciones: [],
    cantidad: 1, unidad: 'ud',
    precio_tarifa: r.precio_objetivo,
    precio_coste: r.coste_total,
    dto_linea_pct: 0, iva: 21,
    seccion: 'Instalación fotovoltaica',
    origen: 'partida', origen_regla_id: null,
    origen_inputs: {
      fv2: true, modelo: ex.modelo_version || null,
      entrada: r.entrada,
      dimensionado: { factura: r.factura, consumo: r.consumo, n_pan: r.n_pan, kwp: r.kwp, prod: r.prod, n_str: r.n_str, kw_inv: r.kw_inv, mod_inv: r.mod_inv,
        cuadro_ac: r.cuadro_ac ? r.cuadro_ac.descripcion : null, jornadas: r.jornadas,
        cable_cc: r.cable_cc ? { seccion: r.cable_cc.seccion, calculo: r.cable_cc.calculo, tabla: r.cable_cc.tabla } : null },
      desglose,
      precio: { coste_total: r.coste_total, precio_objetivo: r.precio_objetivo, margen_objetivo: (modelo.parametros.margen_obj || {}).valor,
        horas_elev: r.horas_elev, elevador: r.elevador, pvp_antes: r.pvp_antes, margen_real_sin_dto: Math.round(r.margen_real * 10000) / 10000 },
      pedido: pedidoMaterial(r, modelo),
      avisos: r.avisos.concat(ex.avisos || []),
      bloques,
      nota: NOTA_CLIENTE, condiciones: CONDICIONES_CLIENTE,
    },
    confirmada: !r.bloqueo,
  }];
  if (r.elevador > 0) {
    lineas.push({
      producto_ref: null,
      descripcion: 'Elevador de carga (' + g(r.horas_elev) + ' h)',
      detalle_tecnico: 'Elevador propio para subir el material a la cubierta; se cobra aparte por horas.',
      especificaciones: [],
      cantidad: r.horas_elev, unidad: 'h',
      precio_tarifa: r.pvp_elev, precio_coste: 0,
      dto_linea_pct: 0, iva: 21,
      seccion: 'Medios auxiliares',
      origen: 'partida', origen_regla_id: null,
      origen_inputs: { fv2: true, elevador: true },
      confirmada: true,
    });
  }
  return lineas;
}

export { FV_VERSION };
