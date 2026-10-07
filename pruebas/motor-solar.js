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
var config = { variables: fv.variables, lookup: fv.lookup, reglas: fv.reglas, productos: fv.productos, partidas: {}, manoObra: [], dtoLinea: [] };

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
comprueba('lo que no tiene precio (clips de cable) sale sin confirmar', linea(r, 'FV-02-014').confirmada === false);
comprueba('y con su aviso de pendiente', r.incidencias.some(function (i) { return i.codigo === 'precio_pendiente' && i.mensaje.indexOf('FV-02-014') > -1; }));
comprueba('510 Wp no es el JA de 540: módulo genérico', !!linea(r, 'FV-01-001') && !linea(r, 'FV-01-001-JA540'));
comprueba('Primo GEN24 4.6 (4,25 kW), sin Plus', tiene(r, 'Fronius Primo GEN24 SC 4.6') && !tiene(r, 'Plus'));
igual('el inversor en el capítulo 03', porNombre(r, 'GEN24 SC 4.6').seccion, '03 · Inversor y microinversores');
igual('el Smart Meter en el 05', porNombre(r, 'Smart Meter TS 100A-1').seccion, '05 · Monitorización, medida y control');
comprueba('el primer capítulo que sale es el 01', r.lineas[0].seccion === '01 · Generador fotovoltaico');

titulo('estructura (una fila de 10, reparto por defecto)');
igual('una fila', r.variables.n_filas, 1);
igual('largo de fila: 10 × 1,134 + 0,05 × 9 + 0,10', eur2(r.variables.l_filas), '11.89');
igual('11 barras de 2,35 m para dos raíles de 11,89', r.variables.n_barras, 11);
igual('raíl: 25,85 m', eur2(cant(r, 'FV-02-001')), '25.85');
igual('uniones: 11 barras − 2 raíles', cant(r, 'FV-02-002'), 9);
igual('ganchos: 2 raíles × (⌈11,89⌉ + 1)', cant(r, 'FV-02-003'), 26);
igual('grapas intermedias 2 × (10 − 1)', cant(r, 'FV-02-005'), 18);
igual('grapas finales 4 por fila', cant(r, 'FV-02-006'), 4);
igual('una fijación por gancho', cant(r, 'FV-02-010'), 26);
igual('puentes de tierra: filas + uniones', cant(r, 'FV-02-013'), 10);
igual('una bolsa de clips', cant(r, 'FV-02-014'), 1);
comprueba('en teja no hay triángulos, lastre, anclajes ni soportes de chapa', !linea(r, 'FV-02-007') && !linea(r, 'FV-02-008') && !linea(r, 'FV-02-009') && !linea(r, 'FV-02-004'));
comprueba('ni sellador (los ganchos no perforan)', !linea(r, 'FV-02-011'));

titulo('cableado y canalizaciones');
igual('un string', r.variables.n_strings, 1);
igual('cable DC: 2 × 15 × 1 × 1,10', cant(r, 'FV-06-001'), 33);
igual('MC4: 2 × 1 + 2', cant(r, 'FV-06-002'), 4);
igual('AC: 10 × 1,10', cant(r, 'FV-06-003'), 11);
igual('manguera del medidor: 5 × 1,10', cant(r, 'FV-06-005'), 6);
igual('tierra: 15 + 10', cant(r, 'FV-06-006'), 25);
igual('tubo: 25 × 1,10', cant(r, 'FV-06-007'), 28);
comprueba('sin bandeja ni tubo enterrado', !linea(r, 'FV-06-008') && !linea(r, 'FV-06-009'));
igual('cajas: ⌈25 / 15⌉ + 1', cant(r, 'FV-06-010'), 3);
igual('abrazaderas: ⌈28 / 10⌉', cant(r, 'FV-06-011'), 3);
igual('prensaestopas: 0 pasos + 2', cant(r, 'FV-06-012'), 2);

titulo('protecciones');
igual('caja DC', cant(r, 'FV-07-001'), 1);
comprueba('sin fusibles con un solo string', !linea(r, 'FV-07-002'));
igual('un protector DC por MPPT', cant(r, 'FV-07-004'), 2);
comprueba('cuadro, magnetotérmico, diferencial, protector AC y etiquetado', [5, 6, 7, 8, 12].every(function (n) { return cant(r, 'FV-07-0' + (n < 10 ? '0' + n : n)) === 1; }));
comprueba('sin adecuación de cuadro ni pica', !linea(r, 'FV-07-010') && !linea(r, 'FV-07-011'));

titulo('mano de obra, transporte y trámites');
igual('2 días de pareja hasta 10 paneles', r.variables.dias_obra, 2);
igual('la jornada en días', cant(r, 'FV-11-001'), 2);
igual('coste de la jornada 330', linea(r, 'FV-11-001').precio_coste, 330);
igual('venta 330 × 1,30', linea(r, 'FV-11-001').precio_tarifa, 429);
igual('puesta en marcha', cant(r, 'FV-11-003'), 1);
comprueba('portes y residuos', cant(r, 'FV-12-001') === 1 && cant(r, 'FV-12-004') === 1);
comprueba('memoria técnica, no proyecto', cant(r, 'FV-13-001') === 1 && !linea(r, 'FV-13-002'));
comprueba('legalización y permiso', cant(r, 'FV-13-003') === 1 && cant(r, 'FV-13-004') === 1);
igual('legalización: precio de venta declarado, sin recargo', linea(r, 'FV-13-003').precio_tarifa, 300);
igual('y su coste es el mismo', linea(r, 'FV-13-003').precio_coste, 300);
igual('gestión de excedentes', cant(r, 'FV-13-008'), 1);
comprueba('sin subvención ni IBI', !linea(r, 'FV-13-006') && !linea(r, 'FV-13-007') && !linea(r, 'FV-13-010'));
comprueba('avisa de las tasas municipales', aviso(r, 'tasas e ICIO'));
igual('pequeño material: un lote', cant(r, 'FV-08-001'), 1);

titulo('el modelo de precios: venta = coste × 1,30 una vez por línea');
var inv = porNombre(r, 'GEN24 SC 4.6');
igual('coste del inversor = tarifa del distribuidor', inv.precio_coste, P('Fronius Primo GEN24 SC 4.6'));
igual('venta = coste × 1,30 al céntimo', inv.precio_tarifa, Math.round(P('Fronius Primo GEN24 SC 4.6') * 130 + 1e-7) / 100);
comprueba('todas las líneas con precio cumplen venta = coste × 1,30 (salvo trámites)', r.lineas.every(function (l) {
  if (!l.precio_coste) return true;
  if (/^FV-13-/.test(l.producto_ref)) return l.precio_tarifa === l.precio_coste;
  return Math.abs(l.precio_tarifa - Math.round(l.precio_coste * 130 + 1e-7) / 100) < 0.005;
}));
var conPrecio = r.lineas.filter(function (l) { return l.precio_coste > 0 && !/^FV-13-/.test(l.producto_ref); });
var tc = totalCoste(conPrecio), tv = cadenaPrecios(conPrecio, 0);
comprueba('el margen sobre venta de lo recargado ronda el 23 %', Math.abs((tv.total - tc.total) / tv.total - 0.2308) < 0.002);
igual('totalCoste no cuenta líneas sin coste', totalCoste([{ cantidad: 2, precio_coste: 10 }, { cantidad: 1, precio_coste: null }]).lineas_sin_coste, 1);
igual('y suma las que lo tienen', totalCoste([{ cantidad: 2, precio_coste: 10.5 }, { cantidad: 1, precio_coste: null }]).total, 21);

titulo('filas apuntadas: 6 y 4');
r = calcular('solar', con({ filas_paneles: [{ paneles: 6 }, { paneles: 4 }] }), config);
igual('dos filas', r.variables.n_filas, 2);
igual('largo total 7,154 + 4,786', eur2(r.variables.l_filas), '11.94');
igual('ganchos exactos por fila: 18 + 12', cant(r, 'FV-02-003'), 30);
igual('grapas intermedias 2 × (6 − 1) + 2 × (4 − 1)', cant(r, 'FV-02-005'), 16);
igual('grapas finales 4 × 2', cant(r, 'FV-02-006'), 8);

titulo('cubierta plana con lastre, 12 paneles');
r = calcular('solar', con({ paneles_manual: 12, tipo_cubierta: 'plana_transitable', plana_anclaje: 'lastre' }), config);
igual('dos filas (12 / 10)', r.variables.n_filas, 2);
igual('triángulos: paneles + filas', cant(r, 'FV-02-007'), 14);
igual('un lastre por triángulo (orientativo)', cant(r, 'FV-02-008'), 14);
comprueba('sin ganchos ni anclajes', !linea(r, 'FV-02-003') && !linea(r, 'FV-02-009'));
comprueba('avisa de que el lastre lo manda el fabricante', aviso(r, 'cálculo de viento'));
igual('3 días base + 0,5 por lastre', r.variables.dias_obra, 3.5);
comprueba('sin línea de vida en plana', !linea(r, 'FV-10-004'));

titulo('cubierta plana con anclaje químico');
r = calcular('solar', con({ paneles_manual: 12, tipo_cubierta: 'suelo', plana_anclaje: 'anclaje_quimico' }), config);
igual('anclajes: 2 por triángulo', cant(r, 'FV-02-009'), 28);
igual('sellador: ⌈28 / 10⌉ cartuchos', cant(r, 'FV-02-011'), 3);
comprueba('sin lastre', !linea(r, 'FV-02-008'));
igual('3 días, sin extra de lastre', r.variables.dias_obra, 3);

titulo('chapa sándwich, 8 paneles');
r = calcular('solar', con({ paneles_manual: 8, tipo_cubierta: 'chapa_sandwich' }), config);
igual('4 soportes por panel', cant(r, 'FV-02-004'), 32);
igual('sellador para los 32 soportes', cant(r, 'FV-02-011'), 4);
comprueba('sin ganchos ni triángulos', !linea(r, 'FV-02-003') && !linea(r, 'FV-02-007'));
igual('línea de vida en inclinada', cant(r, 'FV-10-004'), 1);

titulo('Enphase: 12 paneles monofásico');
r = calcular('solar', con({ paneles_manual: 12, inversor_marca: 'enphase' }), config);
igual('un IQ8HC por panel', porNombre(r, 'IQ 8HC').cantidad, 12);
igual('en el capítulo 03', porNombre(r, 'IQ 8HC').seccion, '03 · Inversor y microinversores');
igual('un Q Cable por micro', porNombre(r, 'Q Cable 2.5mm | 1.3m (monofásico)').cantidad, 12);
igual('dos ramas: dos tapones', porNombre(r, 'Tapón de terminación para cable 1-phase').cantidad, 2);
comprueba('Gateway y dos toroidales en el 05', porNombre(r, 'IQ Gateway Metered').seccion === '05 · Monitorización, medida y control' && porNombre(r, 'CT Transformador de núcleo partido 200A').cantidad === 2);
igual('sin strings', r.variables.n_strings, 0);
comprueba('sin cable DC, MC4 ni caja DC', !linea(r, 'FV-06-001') && !linea(r, 'FV-06-002') && !linea(r, 'FV-07-001'));
igual('bus de micros: 15 × 1,10', cant(r, 'FV-06-004'), 17);
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
igual('tubo: (25 − 8) × 1,10', cant(r, 'FV-06-007'), 19);
igual('tubo enterrado 8 m', cant(r, 'FV-06-009'), 8);
igual('zanja 8 m en obra civil', cant(r, 'FV-09-001'), 8);
igual('un día más', r.variables.dias_obra, 3);

titulo('recorrido interior: bandeja');
r = calcular('solar', con({ recorrido_cableado: 'interior' }), config);
igual('bandeja 25 × 1,10', cant(r, 'FV-06-008'), 28);
comprueba('sin tubo', !linea(r, 'FV-06-007'));

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
igual('prensaestopas 3 + 2', cant(r, 'FV-06-012'), 5);

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

titulo('sin paneles no hay presupuesto');
r = calcular('solar', {}, config);
igual('ninguna línea', r.lineas.length, 0);
comprueba('y lo dice', r.incidencias.some(function (i) { return i.codigo === 'sin_lineas'; }));

resultado();
