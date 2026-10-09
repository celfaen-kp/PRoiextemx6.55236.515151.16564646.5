/* El motor con las reglas de fotovoltaica por capítulos (sql/etapa72).
 *
 * La configuración entera (coeficientes, variables, reglas y las dos tarifas)
 * la genera herramientas/reglas-fotovoltaica.py en fotovoltaica-reglas.json,
 * en la carpeta de tarifas del Drive (fuera del repo: lleva precios). Aquí se
 * comprueba lo que dice el «Desglose de costes y estructura de presupuesto FV
 * particulares» (5 oct 2026): las cantidades de la sección 3, las fórmulas de
 * la 4 y el modelo de precios (venta = coste × 1,30, una vez por línea). */
load(RUTA_TMP + '/formulas.js');
load(RUTA_TMP + '/motor.js');
load(RUTA_TMP + '/cadena.js');

var fv = JSON.parse(read(RUTA_TARIFAS + '/fotovoltaica-reglas.json'));
var config = { variables: fv.variables, lookup: fv.lookup, reglas: fv.reglas, productos: fv.productos, partidas: fv.partidas, manoObra: [], dtoLinea: [] };
var desgDe = function (r, partida, ref) { var l = linea(r, partida); var d = l && l.origen_inputs.desglose.filter(function (x) { return x.ref === ref; })[0]; return d ? d.cantidad : 0; };
var desg = function (r, ref) { return desgDe(r, 'ESTR_TEJA', ref); };
// Ninguna pieza de estructura suelta: todas van dentro de su partida agrupada (09-10-2026).
// Tarea 2 (09-10-2026): lo que va dentro de CUADRO_PROT y PEQ_MAT, y lo que salió del presupuesto, no sale suelto.
var AGRUPADOS_T2 = ['FV-07-001', 'FV-07-002', 'FV-07-004', 'FV-07-005', 'FV-07-006', 'FV-07-007', 'FV-07-008', 'FV-06-007', 'FV-06-010', 'FV-06-011', 'FV-06-012', 'FV-07-012', 'FV-08-001'];
var FUERA_T2 = ['FV-13-008', 'FV-13-004', 'FV-13-001', 'FV-12-001', 'FV-12-004', 'FV-10-004'];
var sueltasT2 = function (r) { return r.lineas.filter(function (l) { return AGRUPADOS_T2.indexOf(l.producto_ref) > -1 || FUERA_T2.indexOf(l.producto_ref) > -1; }).map(function (l) { return l.producto_ref; }); };
var sueltasEstr = function (r) { return r.lineas.filter(function (l) { return /^FV-02-0(0[1-9]|1[0134])$/.test(String(l.producto_ref)); }).map(function (l) { return l.producto_ref; }); };

var linea = function (r, ref) { return r.lineas.filter(function (l) { return l.producto_ref === ref; })[0]; };
var cant = function (r, ref) { var l = linea(r, ref); return l ? l.cantidad : 0; };
var porNombre = function (r, t) { return r.lineas.filter(function (l) { return l.descripcion.indexOf(t) > -1; })[0]; };
var tiene = function (r, t) { return !!porNombre(r, t); };
var refDe = function (nombre) {
  for (var k in fv.productos) if (fv.productos[k].nombre === nombre) return k;
  throw new Error('no está en la tarifa: ' + nombre);
};
var P = function (nombre) { return fv.productos[refDe(nombre)].precio_tarifa; };
var eur2 = function (n) { return n.toFixed(2); };
var aviso = function (r, t) { return r.incidencias.some(function (i) { return i.codigo === 'regla_aviso' && i.mensaje.indexOf(t) > -1; }); };
var seccionDe = function (r, ref) { var l = linea(r, ref); return l ? l.seccion : null; };

// Una instalación corriente: teja, Fronius monofásico, 15 m de continua, 10 de
// alterna y 5 hasta el contador, por fachada.
var BASE = { paneles_manual: 10, tipo_cubierta: 'teja_arabe', distancia_cubierta_inversor_m: 15, distancia_inversor_cuadro_m: 10,
  distancia_cuadro_contador_m: 5, recorrido_cableado: 'fachada', excedentes: 'con_excedentes' };
var con = function (extra) { var d = {}; for (var k in BASE) d[k] = BASE[k]; for (var j in extra) d[j] = extra[j]; return d; };

titulo('10 paneles de 510 Wp en teja · Fronius monofásico');
var r = calcular('solar', BASE, config);
igual('5,1 kWp', r.variables.kwp, 5.1);
igual('el recargo de la categoría es 1,30', r.recargo_sobre_coste, 1.3);
igual('un módulo por panel', cant(r, 'FV-01-001'), 10);
igual('los paneles en el capítulo 01', seccionDe(r, 'FV-01-001'), '01 · Generador fotovoltaico');
comprueba('todo lo de la estructura en teja tiene precio (los clips desde el 09-10-2026): la partida sale confirmada', linea(r, 'ESTR_TEJA').confirmada === true);
comprueba('y sin aviso de pendiente por los clips', !r.incidencias.some(function (i) { return i.codigo === 'precio_pendiente' && i.mensaje.indexOf('FV-02-014') > -1; }));
comprueba('510 Wp no es el JA de 540: módulo genérico', !!linea(r, 'FV-01-001') && !linea(r, 'FV-01-001-JA540'));
comprueba('Primo GEN24 4.6 (4,25 kW), sin Plus', tiene(r, 'Fronius Primo GEN24 SC 4.6') && !tiene(r, 'Plus'));
igual('el inversor en el capítulo 03', porNombre(r, 'GEN24 SC 4.6').seccion, '03 · Inversor y microinversores');
igual('el Smart Meter en el 05', porNombre(r, 'Smart Meter TS 100A-1').seccion, '05 · Monitorización, medida y control');
comprueba('el primer capítulo que sale es el 01', r.lineas[0].seccion === '01 · Generador fotovoltaico');

titulo('estructura en teja: UNA partida por panel (una fila de 10, reparto por defecto)');
var est = linea(r, 'ESTR_TEJA');
comprueba('una sola línea de estructura, por panel', !!est && est.cantidad === 10 && est.unidad === 'ud');
igual('en el capítulo 02', est.seccion, '02 · Estructura y fijaciones');
comprueba('el cliente no ve el desglose en líneas sueltas', !linea(r, 'FV-02-001') && !linea(r, 'FV-02-003') && !linea(r, 'FV-02-005'));
igual('una fila', r.variables.n_filas, 1);
igual('largo de fila: 10 × 1,134 + 0,05 × 9 + 0,10', eur2(r.variables.l_filas), '11.89');
igual('5 barras de 4,8 m para dos raíles de 11,89', r.variables.n_barras, 5);
igual('desglose: raíl 24 m', desg(r, 'FV-02-001'), 24);
igual('desglose: uniones 5 − 2', desg(r, 'FV-02-002'), 3);
igual('desglose: clips de teja 2 × (⌈11,89⌉ + 1)', desg(r, 'FV-02-003'), 26);
igual('desglose: una fijación S01L por clip', desg(r, 'FV-02-010'), 26);
igual('desglose: presores centrales 2 × (10 − 1)', desg(r, 'FV-02-005'), 18);
igual('desglose: presores laterales 4 por fila', desg(r, 'FV-02-006'), 4);
igual('desglose: puentes de tierra filas + uniones', desg(r, 'FV-02-013'), 4);
igual('desglose: una bolsa de clips de cable', desg(r, 'FV-02-014'), 1);
var costeDesglose = est.origen_inputs.desglose.reduce(function (t, x) { return t + x.coste; }, 0);
comprueba('el coste por panel es la suma del desglose entre los paneles', Math.abs(est.precio_coste - costeDesglose / 10) < 0.011);
comprueba('con el 10 % de costes complementarios sobre el perfil (8,708 × 1,10)', Math.abs(est.origen_inputs.desglose[0].coste_ud - 9.58) < 0.006);
var ventaDesglose = est.origen_inputs.desglose.reduce(function (t, x) { return t + x.venta; }, 0);
comprueba('y la venta por panel es la suma de las ventas del desglose (cada renglón × 1,30) entre los paneles', Math.abs(est.precio_tarifa - ventaDesglose / 10) < 0.011);
comprueba('que viene a ser coste × 1,30', Math.abs(est.precio_tarifa - est.precio_coste * 1.3) < 0.02);
comprueba('en teja no hay triángulos, lastre, anclajes ni soportes de chapa', !linea(r, 'FV-02-007') && !linea(r, 'FV-02-008') && !linea(r, 'FV-02-009') && !linea(r, 'FV-02-004'));
comprueba('ni sellador (los clips no perforan)', !linea(r, 'FV-02-011'));

titulo('cableado y canalizaciones');
igual('un string', r.variables.n_strings, 1);
igual('cable DC: 2 × 15 × 1 × 1,10', cant(r, 'FV-06-001'), 33);
igual('MC4: 2 × 1 + 2', cant(r, 'FV-06-002'), 4);
igual('AC: 10 × 1,10', cant(r, 'FV-06-003'), 11);
igual('manguera del medidor: 5 × 1,10', cant(r, 'FV-06-005'), 6);
igual('tierra: 15 + 10', cant(r, 'FV-06-006'), 25);
comprueba('sin bandeja ni tubo enterrado', !linea(r, 'FV-06-008') && !linea(r, 'FV-06-009'));
var pm = linea(r, 'PEQ_MAT');
comprueba('tubo, cajas, abrazaderas y prensas van en UNA línea de pequeño material (capítulo 08)', !!pm && pm.cantidad === 1 && pm.seccion === '08 · Pequeño material y consumibles');
igual('desglose: tubo 25 × 1,10', desgDe(r, 'PEQ_MAT', 'FV-06-007'), 28);
igual('desglose: cajas ⌈25 / 15⌉ + 1', desgDe(r, 'PEQ_MAT', 'FV-06-010'), 3);
igual('desglose: abrazaderas ⌈28 / 10⌉', desgDe(r, 'PEQ_MAT', 'FV-06-011'), 3);
igual('desglose: prensaestopas 0 pasos + 2', desgDe(r, 'PEQ_MAT', 'FV-06-012'), 2);
igual('desglose: etiquetado y un lote de consumibles', desgDe(r, 'PEQ_MAT', 'FV-07-012') + desgDe(r, 'PEQ_MAT', 'FV-08-001'), 2);
comprueba('todo con precio: confirmada', pm.confirmada === true);
igual('nada de eso suelto', sueltasT2(r).join(','), '');

titulo('protecciones');
var cp = linea(r, 'CUADRO_PROT');
comprueba('cuadro y protecciones en UNA línea (capítulo 07)', !!cp && cp.cantidad === 1 && cp.seccion === '07 · Protecciones, cuadros y puesta a tierra');
igual('desglose: caja DC', desgDe(r, 'CUADRO_PROT', 'FV-07-001'), 1);
comprueba('sin fusibles con un solo string', !desgDe(r, 'CUADRO_PROT', 'FV-07-002'));
igual('desglose: un protector DC por MPPT', desgDe(r, 'CUADRO_PROT', 'FV-07-004'), 2);
comprueba('desglose: cuadro, magnetotérmico, diferencial y protector AC', [5, 6, 7, 8].every(function (n) { return desgDe(r, 'CUADRO_PROT', 'FV-07-00' + n) === 1; }));
comprueba('todo con precio: confirmada', cp.confirmada === true);
comprueba('sin adecuación de cuadro ni pica', !linea(r, 'FV-07-010') && !linea(r, 'FV-07-011'));

titulo('mano de obra, transporte y trámites');
igual('2 días de pareja hasta 10 paneles', r.variables.dias_obra, 2);
igual('la jornada en días', cant(r, 'FV-11-001'), 2);
igual('coste de la jornada 330', linea(r, 'FV-11-001').precio_coste, 330);
igual('venta 330 × 1,30', linea(r, 'FV-11-001').precio_tarifa, 429);
igual('puesta en marcha', cant(r, 'FV-11-003'), 1);
comprueba('portes y residuos ya no salen: dentro de la mano de obra (09-10-2026)', !linea(r, 'FV-12-001') && !linea(r, 'FV-12-004'));
comprueba('ni memoria técnica ni permiso: dentro de la legalización', !linea(r, 'FV-13-001') && !linea(r, 'FV-13-004') && !linea(r, 'FV-13-002'));
igual('legalización, sí', cant(r, 'FV-13-003'), 1);
igual('legalización: precio de venta declarado, sin recargo', linea(r, 'FV-13-003').precio_tarifa, 300);
igual('y su coste es el mismo', linea(r, 'FV-13-003').precio_coste, 300);
comprueba('gestión de excedentes tampoco sale', !linea(r, 'FV-13-008'));
comprueba('sin subvención ni IBI', !linea(r, 'FV-13-006') && !linea(r, 'FV-13-007') && !linea(r, 'FV-13-010'));
comprueba('avisa de las tasas municipales', aviso(r, 'tasas e ICIO'));
comprueba('el lote de pequeño material va dentro de PEQ_MAT, no suelto', !linea(r, 'FV-08-001') && desgDe(r, 'PEQ_MAT', 'FV-08-001') === 1);

titulo('el modelo de precios (motor 1.4): un margen por familia, una vez por línea');
igual('motor 1.4', r.motor_version, '1.4');
var inv = porNombre(r, 'GEN24 SC 4.6');
igual('equipo del distribuidor: coste = la factura, sin complementarios', inv.precio_coste, P('Fronius Primo GEN24 SC 4.6'));
igual('y venta = coste × 1,20 al céntimo', inv.precio_tarifa, Math.round(inv.precio_coste * 120 + 1e-7) / 100);
igual('el panel genérico a 80 de coste', linea(r, 'FV-01-001').precio_coste, 80);
igual('y 115 de venta (× 1,4375, sin complementarios)', linea(r, 'FV-01-001').precio_tarifa, 115);
igual('la mano de obra no lleva complementarios: 330 de coste', linea(r, 'FV-11-001').precio_coste, 330);
igual('y sigue al 30 %', linea(r, 'FV-11-001').precio_tarifa, 429);
var malMargen = r.lineas.filter(function (l) {
  if (!l.precio_coste) return false;
  var ref = String(l.producto_ref);
  if (/^FV-13-/.test(ref)) return l.precio_tarifa !== l.precio_coste;
  var f = /^FV-01-/.test(ref) ? 1.4375 : /^FV-(FRONIUS|ENPHASE|BYD|TESLA)-/.test(ref) ? 1.2 : 1.3;
  // una partida agrupada suma renglones con el coste ya al céntimo: un céntimo de holgura
  if (l.origen === 'partida') return Math.abs(l.precio_tarifa - l.precio_coste * f) >= 0.011;
  return l.precio_tarifa !== Math.round(l.precio_coste * f * 100 + 1e-7) / 100;
}).map(function (l) { return l.producto_ref + ' ' + l.precio_coste + '→' + l.precio_tarifa; });
igual('todas las líneas con precio cumplen su margen: trámites igual, panel × 1,4375, equipos × 1,20, el resto × 1,30', malMargen.join(', '), '');
comprueba('cada línea trae su beneficio y su margen sobre venta', r.lineas.every(function (l) {
  if (l.precio_coste == null) return l.beneficio_ud === null;
  return Math.abs(l.beneficio_ud - (l.precio_tarifa - l.precio_coste)) < 0.005 && (l.precio_tarifa ? Math.abs(l.margen_pct - l.beneficio_ud / l.precio_tarifa) < 0.0001 : true);
}));
igual('el panel: 35 de beneficio por unidad', linea(r, 'FV-01-001').beneficio_ud, 35);
comprueba('el resumen interno: coste, venta, beneficio', r.resumen && Math.abs(r.resumen.venta - r.resumen.coste - r.resumen.beneficio) < 0.011 && r.resumen.lineas_sin_coste === 0);
var conPrecio = r.lineas.filter(function (l) { return l.precio_coste > 0; });
var tc = totalCoste(conPrecio), tv = cadenaPrecios(conPrecio, 0);
comprueba('y cuadra con la cadena de precios', Math.abs(r.resumen.coste - tc.total) < 0.011 && Math.abs(r.resumen.venta - tv.total) < 0.011);
comprueba('margen ponderado entre el 20 y el 30 % (salió ' + r.resumen.margen_pct + ')', r.resumen.margen_pct > 0.2 && r.resumen.margen_pct < 0.3);
var dm = r.resumen.descuento_max_pct_para_margen;
comprueba('descuento máximo decreciente con el margen pedido: 10 % > 15 % > 20 %', dm['10'] > dm['15'] && dm['15'] > dm['20'] && dm['20'] >= 0);
comprueba('y es 1 − coste / (venta × (1 − m))', Math.abs(dm['15'] - (1 - r.resumen.coste / (r.resumen.venta * 0.85))) < 0.0001);
igual('una línea a mano sin coste no cuenta y se dice', resumenDe([{ cantidad: 1, precio_tarifa: 100, precio_coste: null }, { cantidad: 2, precio_tarifa: 50, precio_coste: 30 }]).lineas_sin_coste, 1);
igual('si el margen no da, el descuento máximo es 0, no negativo', resumenDe([{ cantidad: 1, precio_tarifa: 100, precio_coste: 95 }]).descuento_max_pct_para_margen['20'], 0);
igual('totalCoste no cuenta líneas sin coste', totalCoste([{ cantidad: 2, precio_coste: 10 }, { cantidad: 1, precio_coste: null }]).lineas_sin_coste, 1);
igual('y suma las que lo tienen', totalCoste([{ cantidad: 2, precio_coste: 10.5 }, { cantidad: 1, precio_coste: null }]).total, 21);

titulo('filas apuntadas: 6 y 4');
r = calcular('solar', con({ filas_paneles: [{ paneles: 6 }, { paneles: 4 }] }), config);
igual('dos filas', r.variables.n_filas, 2);
igual('largo total 7,154 + 4,786', eur2(r.variables.l_filas), '11.94');
igual('clips exactos por fila: 18 + 12', desg(r, 'FV-02-003'), 30);
igual('presores centrales 2 × (6 − 1) + 2 × (4 − 1)', desg(r, 'FV-02-005'), 16);
igual('presores laterales 4 × 2', desg(r, 'FV-02-006'), 8);

titulo('cubierta plana con lastre, 12 paneles');
r = calcular('solar', con({ paneles_manual: 12, tipo_cubierta: 'plana_transitable', plana_anclaje: 'lastre' }), config);
igual('dos filas (12 / 10)', r.variables.n_filas, 2);
var ep = linea(r, 'ESTR_PLANA');
comprueba('UNA partida ESTR_PLANA por panel', !!ep && ep.cantidad === 12 && ep.seccion === '02 · Estructura y fijaciones');
comprueba('sin confirmar: triángulo y lastre sin precio', ep.confirmada === false);
igual('desglose: triángulos = paneles + filas', desgDe(r, 'ESTR_PLANA', 'FV-02-007'), 14);
igual('desglose: tres lastres por triángulo (orientativo)', desgDe(r, 'ESTR_PLANA', 'FV-02-008'), 42);
igual('desglose: raíl', desgDe(r, 'ESTR_PLANA', 'FV-02-001'), r.variables.m_rail);
comprueba('sin ganchos, anclajes ni sellador', !desgDe(r, 'ESTR_PLANA', 'FV-02-003') && !desgDe(r, 'ESTR_PLANA', 'FV-02-009') && !desgDe(r, 'ESTR_PLANA', 'FV-02-011'));
igual('ninguna pieza de estructura suelta', sueltasEstr(r).join(','), '');
comprueba('avisa de que el lastre lo manda el fabricante', aviso(r, 'cálculo de viento'));
igual('3 días base + 0,5 por lastre', r.variables.dias_obra, 3.5);
comprueba('sin línea de vida en plana', !linea(r, 'FV-10-004'));

titulo('cubierta plana con anclaje químico');
r = calcular('solar', con({ paneles_manual: 12, tipo_cubierta: 'suelo', plana_anclaje: 'anclaje_quimico' }), config);
igual('anclajes: 2 por triángulo', desgDe(r, 'ESTR_PLANA', 'FV-02-009'), 28);
igual('una fijación por anclaje', desgDe(r, 'ESTR_PLANA', 'FV-02-010'), 28);
comprueba('también en una partida: raíl, uniones y presores por dentro', desgDe(r, 'ESTR_PLANA', 'FV-02-001') > 0 && desgDe(r, 'ESTR_PLANA', 'FV-02-005') === 20 && !linea(r, 'ESTR_TEJA') && !linea(r, 'FV-02-001'));
igual('sellador: ⌈28 / 10⌉ cartuchos', desgDe(r, 'ESTR_PLANA', 'FV-02-011'), 3);
comprueba('sin lastre', !desgDe(r, 'ESTR_PLANA', 'FV-02-008'));
igual('3 días, sin extra de lastre', r.variables.dias_obra, 3);

titulo('chapa sándwich, 8 paneles');
r = calcular('solar', con({ paneles_manual: 8, tipo_cubierta: 'chapa_sandwich' }), config);
var ec = linea(r, 'ESTR_CHAPA');
comprueba('UNA partida ESTR_CHAPA por panel, sin confirmar (soporte de chapa sin precio)', !!ec && ec.cantidad === 8 && ec.confirmada === false);
igual('desglose: 4 soportes por panel', desgDe(r, 'ESTR_CHAPA', 'FV-02-004'), 32);
igual('desglose: una fijación por soporte', desgDe(r, 'ESTR_CHAPA', 'FV-02-010'), 32);
igual('desglose: sellador para los 32 soportes', desgDe(r, 'ESTR_CHAPA', 'FV-02-011'), 4);
comprueba('sin ganchos ni triángulos', !desgDe(r, 'ESTR_CHAPA', 'FV-02-003') && !desgDe(r, 'ESTR_CHAPA', 'FV-02-007') && !linea(r, 'FV-02-003'));
igual('ninguna pieza de estructura suelta', sueltasEstr(r).join(','), '');
comprueba('la línea de vida ya no sale (dentro de la mano de obra)', !linea(r, 'FV-10-004'));

titulo('Enphase: 12 paneles monofásico');
r = calcular('solar', con({ paneles_manual: 12, inversor_marca: 'enphase' }), config);
igual('un IQ8HC por panel', porNombre(r, 'IQ 8HC').cantidad, 12);
igual('en el capítulo 03', porNombre(r, 'IQ 8HC').seccion, '03 · Inversor y microinversores');
igual('un Q Cable por micro', porNombre(r, 'Q Cable 2.5mm | 1.3m (monofásico)').cantidad, 12);
igual('dos ramas: dos tapones', porNombre(r, 'Tapón de terminación para cable 1-phase').cantidad, 2);
comprueba('Gateway y dos toroidales en el 05', porNombre(r, 'IQ Gateway Metered').seccion === '05 · Monitorización, medida y control' && porNombre(r, 'CT Transformador de núcleo partido 200A').cantidad === 2);
igual('sin strings', r.variables.n_strings, 0);
comprueba('sin cable DC ni MC4', !linea(r, 'FV-06-001') && !linea(r, 'FV-06-002'));
comprueba('el cuadro sale, pero sin caja DC, SPD DC ni fusibles', !!linea(r, 'CUADRO_PROT') && !desgDe(r, 'CUADRO_PROT', 'FV-07-001') && !desgDe(r, 'CUADRO_PROT', 'FV-07-004') && !desgDe(r, 'CUADRO_PROT', 'FV-07-002'));
igual('solo las cuatro de AC', linea(r, 'CUADRO_PROT').origen_inputs.desglose.length, 4);
comprueba('sin cable bus aparte (FV-06-004 retirada)', !linea(r, 'FV-06-004'));
igual('la manguera AC cubre cubierta → cuadro: ⌈(15 + 10) × 1,10⌉', cant(r, 'FV-06-003'), 28);
comprueba('ni rastro de Fronius', !tiene(r, 'Fronius') && !tiene(r, 'FRONIUS'));

titulo('trifásico con BYD de 10 kWh y backup parcial');
r = calcular('solar', con({ suministro: 'trifasico', baterias: 'si', baterias_kwh: 10, backup: true, backup_tipo: 'parcial' }), config);
comprueba('Symo Plus', tiene(r, 'Fronius Symo GEN24 SC 5.0 Plus'));
igual('4 módulos HVS en el 04', porNombre(r, 'BYD Premium HVS 2.56').cantidad, 4);
igual('capítulo 04', porNombre(r, 'BYD Premium HVS 2.56').seccion, '04 · Almacenamiento');
comprueba('BCU, Backup Switch, soporte y cuadro de cargas críticas', tiene(r, 'BCU+Base') && tiene(r, 'Backup Switch') && cant(r, 'FV-04-004') === 1 && cant(r, 'FV-04-006') === 1);
comprueba('sin ampliación a toda la vivienda', !linea(r, 'FV-14-004'));
igual('2 días + 0,5 batería + 0,5 backup', r.variables.dias_obra, 3);

titulo('backup total');
r = calcular('solar', con({ baterias: 'si', baterias_kwh: 10, backup: true, backup_tipo: 'total' }), config);
comprueba('ampliación en opcionales y sin cuadro de cargas críticas', seccionDe(r, 'FV-14-004') === '14 · Opcionales' && !linea(r, 'FV-04-006'));

titulo('sin paneles a mano: salen del consumo');
r = calcular('solar', con({ paneles_manual: 0, consumo_anual_kwh: 6000 }), config);
igual('⌈6000 / 1500 × 1000 / 510⌉ = 8 paneles', r.variables.n_paneles, 8);

titulo('batería sin kWh: del consumo nocturno');
r = calcular('solar', con({ baterias: 'si', consumo_anual_kwh: 6000, perfil_consumo: 'nocturno' }), config);
igual('6000 × 0,6 / (365 × 0,9) ≈ 11 kWh', r.variables.bat_kwh, 11);
igual('5 módulos HVS', porNombre(r, 'BYD Premium HVS 2.56').cantidad, 5);
comprueba('sin avisos de coeficiente por defecto', !r.incidencias.some(function (i) { return i.codigo === 'coeficiente_por_defecto'; }));

titulo('recorrido enterrado con 8 m de zanja');
r = calcular('solar', con({ recorrido_cableado: 'tubo_enterrado', zanja_m: 8 }), config);
igual('tubo: (25 − 8) × 1,10', desgDe(r, 'PEQ_MAT', 'FV-06-007'), 19);
igual('tubo enterrado 8 m', cant(r, 'FV-06-009'), 8);
igual('zanja 8 m en obra civil', cant(r, 'FV-09-001'), 8);
igual('un día más', r.variables.dias_obra, 3);

titulo('recorrido interior: bandeja');
r = calcular('solar', con({ recorrido_cableado: 'interior' }), config);
igual('bandeja 25 × 1,10', cant(r, 'FV-06-008'), 28);
comprueba('sin tubo ni abrazaderas en el pequeño material', !desgDe(r, 'PEQ_MAT', 'FV-06-007') && !desgDe(r, 'PEQ_MAT', 'FV-06-011'));

titulo('medios auxiliares');
r = calcular('solar', con({ medio_elevacion: 'andamio', via_publica: true }), config);
igual('andamio: días de obra + 1', cant(r, 'FV-10-001'), 3);
igual('vía pública', cant(r, 'FV-10-005'), 1);
r = calcular('solar', con({ medio_elevacion: 'escalera', plantas: 2 }), config);
igual('dos plantas con escalera: elevador los días de obra', cant(r, 'FV-10-003'), 2.5);
igual('y medio día más', r.variables.dias_obra, 2.5);
r = calcular('solar', con({ medio_elevacion: 'grua' }), config);
igual('grúa los días de obra', cant(r, 'FV-10-002'), 2);

titulo('cuadro antiguo, sin tierra, WiFi mala, inversor fuera, instalación vieja');
r = calcular('solar', con({ estado_cuadro: 'antiguo', toma_tierra: 'no_existe', wifi_inversor: 'mala', inversor_exterior: true, instalacion_existente: true, perforaciones: 3 }), config);
comprueba('adecuación de cuadro y pica', cant(r, 'FV-07-010') === 1 && cant(r, 'FV-07-011') === 1);
comprueba('repetidor y tejadillo', cant(r, 'FV-05-005') === 1 && cant(r, 'FV-03-008') === 1);
comprueba('desmontaje y 3 perforaciones', cant(r, 'FV-09-005') === 1 && cant(r, 'FV-09-002') === 3);
igual('prensaestopas 3 + 2', desgDe(r, 'PEQ_MAT', 'FV-06-012'), 5);

titulo('trámites: 20 paneles, subvención, sin excedentes');
r = calcular('solar', con({ paneles_manual: 20, subvencion: true, bonificacion_ibi: true, excedentes: 'sin_excedentes' }), config);
comprueba('10,2 kWp: proyecto y no memoria', cant(r, 'FV-13-002') === 1 && !linea(r, 'FV-13-001'));
igual('proyecto a precio declarado', linea(r, 'FV-13-002').precio_tarifa, 1800);
comprueba('subvención, certificado energético e IBI', cant(r, 'FV-13-006') === 1 && cant(r, 'FV-13-010') === 1 && cant(r, 'FV-13-007') === 1);
comprueba('sin gestión de excedentes', !linea(r, 'FV-13-008'));
comprueba('avisa del antivertido', aviso(r, 'límite de inyección'));
igual('3 días base para 20 paneles', r.variables.dias_obra, 3);
r = calcular('solar', con({ paneles_manual: 30 }), config);
igual('30 paneles: 3 + 1 día', r.variables.dias_obra, 4);
comprueba('y avisa del oficial adicional', aviso(r, 'oficial adicional'));

titulo('opcionales y avisos');
r = calcular('solar', con({ cargas_previstas: ['vehiculo_electrico'] }), config);
comprueba('prevé coche y no pide cargador: aviso', aviso(r, 'ofrecerlo como opcional'));
r = calcular('solar', con({ cargador_ve: true, excedentes_gestion: 'termo' }), config);
comprueba('cargador y derivador en opcionales', seccionDe(r, 'FV-14-001') === '14 · Opcionales' && cant(r, 'FV-14-002') === 1);
comprueba('y ya no avisa', !aviso(r, 'ofrecerlo como opcional'));
r = calcular('solar', con({ tipo_cubierta: 'pergola' }), config);
comprueba('pérgola: estructura especial a 0 y aviso', cant(r, 'FV-02-015') === 1 && aviso(r, 'presupuesto aparte') && !linea(r, 'FV-02-001'));
r = calcular('solar', { paneles_manual: 10, tipo_cubierta: 'teja_arabe' }, config);
comprueba('sin metros: avisa de continua y alterna', aviso(r, 'paneles → inversor') && aviso(r, 'inversor → cuadro'));
comprueba('y no pone cable', !linea(r, 'FV-06-001') && !linea(r, 'FV-06-003'));
r = calcular('solar', con({ estado_cubierta: 'malo', fibrocemento: true, sombras: 'parcial' }), config);
comprueba('cubierta mala: reparación a 0 y aviso', cant(r, 'FV-09-004') === 1 && aviso(r, 'mal estado'));
comprueba('fibrocemento: aviso', aviso(r, 'fibrocemento'));
comprueba('sombras: aviso de optimizadores', aviso(r, 'optimizadores'));

titulo('combinaciones que no van');
r = calcular('solar', con({ inversor_marca: 'enphase', baterias: 'si', bateria_marca: 'byd' }), config);
comprueba('Enphase con BYD: no pone batería y avisa', !tiene(r, 'BYD') && aviso(r, 'Enphase solo va con'));
r = calcular('solar', con({ baterias: 'no', backup: true }), config);
comprueba('backup sin batería: no lo pone y avisa', !tiene(r, 'Backup') && aviso(r, 'El backup necesita batería'));

titulo('10 × JA 540, trifásico, sin batería · arranque por kWp (TAREA 09-10-2026)');
var KWP = { kwp_objetivo: 5, wp_manual: 540, suministro: 'trifasico', inversor_marca: 'fronius', baterias: 'no',
  distancia_cubierta_inversor_m: 15, distancia_inversor_cuadro_m: 5, distancia_cuadro_contador_m: 3, recorrido_cableado: 'fachada',
  medio_elevacion: 'escalera', plantas: 1, estado_cuadro: 'bien', toma_tierra: 'existe', wifi_inversor: 'buena', excedentes: 'sin_excedentes' };
var conKwp = function (extra) { var d = {}; for (var k in KWP) d[k] = KWP[k]; for (var j in extra) d[j] = extra[j]; return d; };
r = calcular('solar', conKwp({ tipo_cubierta: 'teja' }), config);
igual('n_paneles = ⌈5 × 1000 / 540⌉', r.variables.n_paneles, 10);
igual('kwp 5,40', r.variables.kwp, 5.4);
igual('kw_inversor 4,5', r.variables.kw_inversor, 4.5);
igual('n_filas', r.variables.n_filas, 1);
igual('l_filas', eur2(r.variables.l_filas), '11.89');
igual('n_barras', r.variables.n_barras, 5);
igual('m_rail', r.variables.m_rail, 24);
igual('n_uniones', r.variables.n_uniones, 3);
igual('n_ganchos', r.variables.n_ganchos, 26);
igual('n_triangulos', r.variables.n_triangulos, 11);
igual('n_strings', r.variables.n_strings, 1);
igual('dias_obra', r.variables.dias_obra, 2);
comprueba('el JA de 540 Wp, no el genérico', cant(r, 'FV-01-001-JA540') === 10 && !linea(r, 'FV-01-001'));
comprueba('Symo GEN24 SC 5.0, sin Plus', !!linea(r, 'FV-FRONIUS-SYMO-GEN24-SC-5.0') && !tiene(r, 'Plus'));
comprueba('Smart Meter TS 65A-3', tiene(r, 'Smart Meter TS 65A-3'));
var et = linea(r, 'ESTR_TEJA');
comprueba('TEJA: una línea ESTR_TEJA × 10, confirmada', !!et && et.cantidad === 10 && et.unidad === 'ud' && et.confirmada === true);
comprueba('coste ≈ 39,7 €/ud (salió ' + et.precio_coste + ')', Math.abs(et.precio_coste - 39.7) <= 0.06);
comprueba('venta ≈ 51,7 €/ud (salió ' + et.precio_tarifa + ')', Math.abs(et.precio_tarifa - 51.7) <= 0.06);
comprueba('con su desglose', et.origen_inputs.desglose.length === 8);
igual('ninguna FV-02 suelta', sueltasEstr(r).join(','), '');
var ja = linea(r, 'FV-01-001-JA540');
comprueba('TAREA 4 · paneles: 10 × 80 coste, 10 × 115 venta, 350 de beneficio', ja.precio_coste === 80 && ja.precio_tarifa === 115 && ja.beneficio_ud * ja.cantidad === 350);
var symo = linea(r, 'FV-FRONIUS-SYMO-GEN24-SC-5.0');
comprueba('Symo 5.0: 1.256,49 → 1.507,79, beneficio 251,30', symo.precio_coste === 1256.49 && symo.precio_tarifa === 1507.79 && symo.beneficio_ud === 251.3);
var sm = porNombre(r, 'Smart Meter TS 65A-3');
comprueba('Smart Meter TS 65A-3: tarifa × 1,20 (salió ' + sm.precio_coste + ' → ' + sm.precio_tarifa + ')', sm.precio_coste === P('FRONIUS Smart Meter TS 65A-3') && sm.precio_tarifa === Math.round(sm.precio_coste * 120 + 1e-7) / 100);
comprueba('resumen.margen_pct entre 0,20 y 0,30 (salió ' + r.resumen.margen_pct + ')', r.resumen.margen_pct >= 0.2 && r.resumen.margen_pct <= 0.3);
comprueba('descuento máximo para mantener el 15 % > 0 (salió ' + r.resumen.descuento_max_pct_para_margen['15'] + ')', r.resumen.descuento_max_pct_para_margen['15'] > 0);
comprueba('06 suelto: DC 33 · MC4 4 · AC 6 · comunicación 4 · tierra 20', cant(r, 'FV-06-001') === 33 && cant(r, 'FV-06-002') === 4 && cant(r, 'FV-06-003') === 6 && cant(r, 'FV-06-005') === 4 && cant(r, 'FV-06-006') === 20);
cp = linea(r, 'CUADRO_PROT');
comprueba('07: Cuadro de protecciones × 1, confirmada', !!cp && cp.cantidad === 1 && cp.confirmada === true);
igual('dentro: cuadro AC, magneto, diferencial, SPD AC, caja DC y 2 SPD DC (6 renglones)', cp.origen_inputs.desglose.length, 6);
comprueba('coste ≈ 227,6 (salió ' + cp.precio_coste + ')', Math.abs(cp.precio_coste - 227.6) <= 0.5);
comprueba('venta ≈ 295,9 (salió ' + cp.precio_tarifa + ')', Math.abs(cp.precio_tarifa - 295.9) <= 0.5);
pm = linea(r, 'PEQ_MAT');
comprueba('08: Pequeño material × 1, confirmada', !!pm && pm.cantidad === 1 && pm.confirmada === true);
comprueba('dentro: 22 m tubo, 3 cajas, 3 bolsas, 2 prensas, etiquetado, consumibles', desgDe(r, 'PEQ_MAT', 'FV-06-007') === 22 && desgDe(r, 'PEQ_MAT', 'FV-06-010') === 3 && desgDe(r, 'PEQ_MAT', 'FV-06-011') === 3 && desgDe(r, 'PEQ_MAT', 'FV-06-012') === 2 && pm.origen_inputs.desglose.length === 6);
comprueba('coste ≈ 76,4 (salió ' + pm.precio_coste + ')', Math.abs(pm.precio_coste - 76.4) <= 0.5);
comprueba('venta ≈ 99,3 (salió ' + pm.precio_tarifa + ')', Math.abs(pm.precio_tarifa - 99.3) <= 0.5);
comprueba('ninguna de las dos agrupadas a 0 €', cp.precio_coste > 0 && pm.precio_coste > 0);
comprueba('10 y 12: nada (escalera, una planta)', !r.lineas.some(function (l) { return /^FV-1[02]-/.test(String(l.producto_ref)); }));
comprueba('13: solo legalización (sin excedentes, sin subvención, ≤ 10 kWp)', r.lineas.filter(function (l) { return /^FV-13-/.test(String(l.producto_ref)); }).map(function (l) { return l.producto_ref; }).join(',') === 'FV-13-003');
igual('ninguna línea de las siete que salen ni de las trece agrupadas', sueltasT2(r).join(','), '');
r = calcular('solar', conKwp({ tipo_cubierta: 'chapa_sandwich' }), config);
ec = linea(r, 'ESTR_CHAPA');
comprueba('CHAPA: una línea ESTR_CHAPA × 10, sin confirmar', !!ec && ec.cantidad === 10 && ec.confirmada === false);
comprueba('por el soporte de chapa a 0', r.incidencias.some(function (i) { return i.codigo === 'precio_pendiente' && i.mensaje.indexOf('FV-02-004') > -1; }));
igual('40 soportes y 40 fijaciones', desgDe(r, 'ESTR_CHAPA', 'FV-02-004') + desgDe(r, 'ESTR_CHAPA', 'FV-02-010'), 80);
igual('4 cartuchos de sellador', desgDe(r, 'ESTR_CHAPA', 'FV-02-011'), 4);
igual('dias_obra', r.variables.dias_obra, 2);
igual('ninguna FV-02 suelta', sueltasEstr(r).join(','), '');
r = calcular('solar', conKwp({ tipo_cubierta: 'plana_transitable' }), config);
ep = linea(r, 'ESTR_PLANA');
comprueba('PLANA: una línea ESTR_PLANA × 10, sin confirmar', !!ep && ep.cantidad === 10 && ep.confirmada === false);
igual('11 triángulos', desgDe(r, 'ESTR_PLANA', 'FV-02-007'), 11);
igual('33 lastres', desgDe(r, 'ESTR_PLANA', 'FV-02-008'), 33);
comprueba('aviso de lastre', aviso(r, 'cálculo de viento'));
comprueba('sin anclajes', !desgDe(r, 'ESTR_PLANA', 'FV-02-009'));
igual('dias_obra: 2 + 0,5 de lastre', r.variables.dias_obra, 2.5);
igual('ninguna FV-02 suelta', sueltasEstr(r).join(','), '');
r = calcular('solar', conKwp({ tipo_cubierta: 'teja', inversor_marca: 'enphase' }), config);
comprueba('ENPHASE: no sale FV-06-004', !linea(r, 'FV-06-004'));
comprueba('ENPHASE: el cuadro sin caja DC ni SPD DC', !!linea(r, 'CUADRO_PROT') && !desgDe(r, 'CUADRO_PROT', 'FV-07-001') && !desgDe(r, 'CUADRO_PROT', 'FV-07-004'));
igual('ENPHASE: nada suelto ni fuera', sueltasT2(r).join(','), '');
igual('FV-06-003 = ⌈(15 + 5) × 1,10⌉', cant(r, 'FV-06-003'), 22);
comprueba('los paneles mandan sobre los kWp', calcular('solar', conKwp({ tipo_cubierta: 'teja', paneles_manual: 12 }), config).variables.n_paneles === 12);
comprueba('y los kWp sobre el consumo', calcular('solar', conKwp({ tipo_cubierta: 'teja', consumo_anual_kwh: 9000 }), config).variables.n_paneles === 10);

titulo('sin paneles no hay presupuesto');
r = calcular('solar', {}, config);
igual('ninguna línea', r.lineas.length, 0);
comprueba('y lo dice', r.incidencias.some(function (i) { return i.codigo === 'sin_lineas'; }));

resultado();
