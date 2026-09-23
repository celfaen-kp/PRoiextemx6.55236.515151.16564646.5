/* El motor con las reglas de aerotermia de sql/etapa43.
 *
 * La configuración de aquí es la MISMA que siembra ese SQL: si allí se cambia
 * una fórmula o un precio, esta prueba lo canta. Los importes salen del
 * análisis de los 20 presupuestos cerrados (MOTOR-PRESUPUESTOS.md §3):
 * kit base 7.365 €, grupo de bombeo 825 €, colector 335/525 €, A103 850 €,
 * ACS 2.035/2.265 €, apoyo 250 €, limpieza 500 €. */
load(RUTA_TMP + '/formulas.js');
load(RUTA_TMP + '/motor.js');
load(RUTA_TMP + '/cadena.js');

function partida(codigo, nombre, concepto, precio) {
  var o = {}; o[codigo] = { codigo: codigo, nombre: nombre,
    items: [{ concepto_libre: concepto, precio_fijo: precio, formula_cantidad: '1', orden: 1 }] };
  return o;
}
var partidas = {
  KIT_BASE: { codigo: 'KIT_BASE', nombre: 'Kit base instalación aerotermia', items: [
    { concepto_libre: 'Depósito de inercia', precio_fijo: 1100, formula_cantidad: '1', orden: 1 },
    { concepto_libre: 'Soportes de caucho antivibración', precio_fijo: 115, formula_cantidad: '1', orden: 2 },
    { concepto_libre: 'A100: Material hidráulico para aerotermia', precio_fijo: 2100, formula_cantidad: '1', orden: 3 },
    { concepto_libre: 'A101: Material eléctrico para aerotermia', precio_fijo: 750, formula_cantidad: '1', orden: 4 },
    { concepto_libre: 'A102: Mano de obra instalación aerotermia', precio_fijo: 2250, formula_cantidad: '1', orden: 5 },
    { concepto_libre: 'RITE, documentación y subvención', precio_fijo: 450, formula_cantidad: '1', orden: 6 },
    { concepto_libre: 'Gestiones administrativas', precio_fijo: 600, formula_cantidad: '1', orden: 7 },
  ] },
};
[['A106', 'Grupo de bombeo', 'A106: Grupo de bombeo sin mezcladora 1", DN25', 825],
 ['COLECTOR_2', 'Colector 2', 'Colector para 2 grupos de bombeo', 335],
 ['COLECTOR_3', 'Colector 3', 'Colector para 3 grupos de bombeo', 525],
 ['A103', 'Sustitución', 'A103: Sustitución de caldera por bomba de calor', 850],
 ['ACS_200', 'ACS 200', 'UniSTOR plus VIH RW 200/2 B', 2035],
 ['ACS_250', 'ACS 250', 'UniSTOR plus VIH RW 250/2 B', 2265],
 ['APOYO', 'Apoyo', 'Resistencia eléctrica de apoyo', 250],
 ['A111', 'Limpieza', 'A111: Limpieza del circuito existente', 500]].forEach(function (p) {
  var o = partida(p[0], p[1], p[2], p[3]); partidas[p[0]] = o[p[0]];
});

var config = {
  variables: [
    { codigo: 'potencia_diseno_kw', formula: 'si(carga_termica_kw > 0, carga_termica_kw, potencia_kw)', orden: 1 },
    { codigo: 'circuitos', formula: 'max(1, cuenta(emisores_previstos))', orden: 2 },
    { codigo: 'acs_litros', formula: 'max(acs_acumulador_litros, acs_litros_manual)', orden: 3 },
    { codigo: 'sustituye_caldera', formula: "si(sistema_actual = 'ninguno', 0, si(sistema_actual = '', 0, 1))", orden: 4 },
    { codigo: 'acs_200', formula: 'si(acs_litros > 0 y acs_litros <= 220, 1, 0)', orden: 5 },
    { codigo: 'acs_250', formula: 'si(acs_litros > 220, 1, 0)', orden: 6 },
  ],
  lookup: [],
  partidas: partidas,
  reglas: [
    { id: 'kit', tipo: 'condicional', partida_id: 'KIT_BASE', formula_cantidad: '1', seccion: 'Instalación', prioridad: 100 },
    { id: 'm4', tipo: 'seleccion', variable: 'potencia_diseno_kw', minimo: 0.01, maximo: 5, producto_ref: '0020306791', formula_cantidad: '1', seccion: 'Equipos', prioridad: 50 },
    { id: 'm6', tipo: 'seleccion', variable: 'potencia_diseno_kw', minimo: 5.01, maximo: 7, producto_ref: '0020306793', formula_cantidad: '1', seccion: 'Equipos', prioridad: 50 },
    { id: 'm8', tipo: 'seleccion', variable: 'potencia_diseno_kw', minimo: 7.01, maximo: 10, producto_ref: '0020306795', formula_cantidad: '1', seccion: 'Equipos', prioridad: 50 },
    { id: 'm12', tipo: 'seleccion', variable: 'potencia_diseno_kw', minimo: 10.01, maximo: 13.5, producto_ref: '0020306797', formula_cantidad: '1', seccion: 'Equipos', prioridad: 50 },
    { id: 'm15', tipo: 'seleccion', variable: 'potencia_diseno_kw', minimo: 13.51, maximo: 99, producto_ref: '0020306801', formula_cantidad: '1', seccion: 'Equipos', prioridad: 50 },
    { id: 'gb', tipo: 'cantidad', partida_id: 'A106', formula_cantidad: 'circuitos', seccion: 'Instalación', prioridad: 40 },
    { id: 'c2', tipo: 'condicional', partida_id: 'COLECTOR_2', condicion: { circuitos: 2 }, formula_cantidad: '1', seccion: 'Instalación', prioridad: 40 },
    { id: 'c3', tipo: 'condicional', partida_id: 'COLECTOR_3', condicion: { circuitos: [3, 4, 5, 6] }, formula_cantidad: '1', seccion: 'Instalación', prioridad: 40 },
    { id: 'a103', tipo: 'condicional', partida_id: 'A103', condicion: { sustituye_caldera: 1 }, formula_cantidad: '1', seccion: 'Instalación', prioridad: 30 },
    { id: 'acs2', tipo: 'condicional', partida_id: 'ACS_200', condicion: { acs_200: 1 }, formula_cantidad: '1', seccion: 'Equipos', prioridad: 30 },
    { id: 'acs25', tipo: 'condicional', partida_id: 'ACS_250', condicion: { acs_250: 1 }, formula_cantidad: '1', seccion: 'Equipos', prioridad: 30 },
    { id: 'apo', tipo: 'condicional', partida_id: 'APOYO', condicion: { apoyo_electrico: true }, formula_cantidad: '1', seccion: 'Equipos', prioridad: 20 },
    { id: 'lim', tipo: 'condicional', partida_id: 'A111', condicion: { limpieza_circuito: true }, formula_cantidad: '1', seccion: 'Instalación', prioridad: 20 },
  ],
  productos: {
    '0020306791': { referencia: '0020306791', nombre: 'aroTHERM plus 4 básico', familia: 'bomba_calor', unidad: 'ud', precio_tarifa: 8755, iva: 21 },
    '0020306793': { referencia: '0020306793', nombre: 'aroTHERM plus 6 básico', familia: 'bomba_calor', unidad: 'ud', precio_tarifa: 9385, iva: 21 },
    '0020306795': { referencia: '0020306795', nombre: 'aroTHERM plus 8 básico', familia: 'bomba_calor', unidad: 'ud', precio_tarifa: 9710, iva: 21 },
    '0020306797': { referencia: '0020306797', nombre: 'aroTHERM plus 12 básico', familia: 'bomba_calor', unidad: 'ud', precio_tarifa: 12780, iva: 21 },
    '0020306801': { referencia: '0020306801', nombre: 'aroTHERM plus 15 básico', familia: 'bomba_calor', unidad: 'ud', precio_tarifa: 13395, iva: 21 },
  },
  manoObra: [], dtoLinea: [],
};

var total = function (r) { return cadenaPrecios(r.lineas, 0).total; };
var tiene = function (r, txt) { return r.lineas.some(function (l) { return l.descripcion.indexOf(txt) > -1; }); };
var eur2 = function (n) { return n.toFixed(2); };

titulo('8 kW, un circuito, sin nada más');
var r = calcular('aerotermia', { potencia_kw: 8, emisores_previstos: ['suelo_radiante'], sistema_actual: 'ninguno' }, config);
igual('la máquina de 8 kW', r.lineas.filter(function (l) { return l.producto_ref === '0020306795'; }).length, 1);
comprueba('el kit base entero', tiene(r, 'A100') && tiene(r, 'A102') && tiene(r, 'Gestiones administrativas'));
igual('un grupo de bombeo', r.lineas.filter(function (l) { return l.descripcion.indexOf('A106') > -1; })[0].cantidad, 1);
comprueba('sin colector', !tiene(r, 'Colector'));
comprueba('sin sustitución de caldera', !tiene(r, 'A103'));
igual('total', eur2(total(r)), eur2(9710 + 7365 + 825));

titulo('8 kW sustituyendo caldera de gas, con ACS de 200 l');
r = calcular('aerotermia', { potencia_kw: 8, emisores_previstos: ['radiadores_bt'],
  sistema_actual: 'caldera_gas', acs_acumulador_litros: 200 }, config);
comprueba('sale el A103', tiene(r, 'A103'));
comprueba('sale el acumulador de 200', tiene(r, 'VIH RW 200/2'));
comprueba('y no el de 250', !tiene(r, 'VIH RW 250/2'));
igual('total', eur2(total(r)), eur2(9710 + 7365 + 825 + 850 + 2035));

titulo('12 kW, tres circuitos, con apoyo y limpieza');
r = calcular('aerotermia', { potencia_kw: 12, sistema_actual: 'caldera_gasoleo',
  emisores_previstos: ['suelo_radiante', 'fancoils', 'radiadores_bt'],
  apoyo_electrico: true, limpieza_circuito: true, acs_litros_manual: 250 }, config);
igual('la máquina de 12 kW', r.lineas.filter(function (l) { return l.producto_ref === '0020306797'; }).length, 1);
igual('tres grupos de bombeo', r.lineas.filter(function (l) { return l.descripcion.indexOf('A106') > -1; })[0].cantidad, 3);
comprueba('colector de 3', tiene(r, 'Colector para 3'));
comprueba('resistencia de apoyo', tiene(r, 'Resistencia eléctrica'));
comprueba('limpieza del circuito', tiene(r, 'A111'));
comprueba('acumulador de 250', tiene(r, 'VIH RW 250/2'));
igual('total', eur2(total(r)), eur2(12780 + 7365 + 825 * 3 + 525 + 850 + 2265 + 250 + 500));

titulo('los tramos de potencia');
[[4, '0020306791'], [5, '0020306791'], [6, '0020306793'], [8, '0020306795'],
 [11, '0020306797'], [14, '0020306801'], [20, '0020306801']].forEach(function (c) {
  var x = calcular('aerotermia', { potencia_kw: c[0], emisores_previstos: ['suelo_radiante'], sistema_actual: 'ninguno' }, config);
  var maquinas = x.lineas.filter(function (l) { return l.producto_ref; });
  igual(c[0] + ' kW → una sola máquina', maquinas.length, 1);
  igual(c[0] + ' kW → la que toca', maquinas[0].producto_ref, c[1]);
});

titulo('la ficha de una visita, con su carga térmica');
r = calcular('aerotermia', { carga_termica_kw: 6.4, potencia_kw: 0,
  emisores_previstos: ['suelo_radiante'], sistema_actual: 'caldera_gas' }, config);
igual('manda la carga térmica de la ficha', r.variables.potencia_diseno_kw, 6.4);
igual('y elige la de 6 kW', r.lineas.filter(function (l) { return l.producto_ref; })[0].producto_ref, '0020306793');

titulo('una visita no echa de menos los datos del presupuesto suelto');
// Como llega de verdad: la ficha trae carga térmica y acumulador, y nada de
// potencia_kw ni acs_litros_manual, que solo existen en la pantalla suelta.
r = calcular('aerotermia', { carga_termica_kw: 6.4, acs_acumulador_litros: 200,
  emisores_previstos: ['suelo_radiante'], sistema_actual: 'caldera_gas' }, config);
var faltan = r.incidencias.filter(function (i) { return i.codigo === 'campo_faltante'; }).map(function (i) { return i.campo; });
comprueba('no avisa de potencia_kw', faltan.indexOf('potencia_kw') < 0);
comprueba('ni de acs_litros_manual', faltan.indexOf('acs_litros_manual') < 0);
igual('y usa los litros de la ficha', r.variables.acs_litros, 200);

titulo('pero si no hay potencia por ningún lado, sí avisa');
r = calcular('aerotermia', { emisores_previstos: ['suelo_radiante'], sistema_actual: 'ninguno' }, config);
faltan = r.incidencias.filter(function (i) { return i.codigo === 'campo_faltante'; }).map(function (i) { return i.campo; });
comprueba('avisa de los dos', faltan.indexOf('carga_termica_kw') > -1 && faltan.indexOf('potencia_kw') > -1);

titulo('sin potencia no se inventa la máquina');
r = calcular('aerotermia', { emisores_previstos: ['suelo_radiante'], sistema_actual: 'ninguno' }, config);
comprueba('no sale ninguna máquina', !r.lineas.some(function (l) { return l.producto_ref; }));
comprueba('pero el kit y el grupo sí', tiene(r, 'A100') && tiene(r, 'A106'));

resultado();
