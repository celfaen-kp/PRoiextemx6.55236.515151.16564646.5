/* El motor con las reglas de fotovoltaica de sql/etapa44.
 *
 * Los números son los del análisis de los 21 presupuestos
 * (MOTOR-PRESUPUESTOS.md §3): panel a 110 €/ud en todos, kit de 5–6 kWp
 * 5.445 €, kit de 10 kWp 8.560 €, inversor 1.610 € y 2.100 €.
 * La configuración es la misma que siembra el SQL. */
load(RUTA_TMP + '/formulas.js');
load(RUTA_TMP + '/motor.js');
load(RUTA_TMP + '/cadena.js');

var partidas = {
  KIT_BASE: { codigo: 'KIT_BASE', nombre: 'Kit base instalación fotovoltaica', items: [
    { concepto_libre: 'Material eléctrico', precio_fijo: 1905, formula_cantidad: '1', orden: 1 },
    { concepto_libre: 'Estructura de soportación', precio_fijo: 252, formula_cantidad: '1', orden: 2 },
    { concepto_libre: 'Trámites en D.G. Industria', precio_fijo: 300, formula_cantidad: '1', orden: 4 },
    { concepto_libre: 'Gestiones documentales', precio_fijo: 300, formula_cantidad: '1', orden: 5 },
    { concepto_libre: 'Puesta en marcha y monitorización', precio_fijo: 150, formula_cantidad: '1', orden: 6 },
    { concepto_libre: 'Medidor de energía e interfaz', precio_fijo: 110, formula_cantidad: '1', orden: 7 },
  ] },
  MANO_OBRA: { codigo: 'MANO_OBRA', nombre: 'Mano de obra fotovoltaica', items: [
    { concepto_libre: 'Mano de obra de instalación (por vatio instalado)', precio_fijo: 0.40,
      formula_cantidad: 'n_paneles * wp_panel', orden: 1 }] },
  KIT_10: { codigo: 'KIT_10', nombre: 'Kit 10 kWp', items: [
    { concepto_libre: 'Instalación fotovoltaica 10 kWp', precio_fijo: 8560, formula_cantidad: '1', orden: 1 }] },
  PANEL: { codigo: 'PANEL', nombre: 'Paneles', items: [
    { concepto_libre: 'Panel fotovoltaico', precio_fijo: 110, formula_cantidad: 'n_paneles', orden: 1 }] },
  INV_6: { codigo: 'INV_6', nombre: 'Inversor hasta 6 kWp', items: [
    { concepto_libre: 'Inversor y monitorización', precio_fijo: 1610, formula_cantidad: '1', orden: 1 }] },
  INV_10: { codigo: 'INV_10', nombre: 'Inversor 10 kWp', items: [
    { concepto_libre: 'Inversor y monitorización', precio_fijo: 2100, formula_cantidad: '1', orden: 1 }] },
};

var config = {
  variables: [
    { codigo: 'n_paneles', formula: 'max(modulos_estimados, paneles_manual)', orden: 1 },
    { codigo: 'wp_panel', formula: "si(wp_manual > 0, wp_manual, lookup('wp_panel','defecto'))", orden: 2 },
    { codigo: 'kwp', formula: 'redondea(n_paneles * wp_panel / 1000, 2)', orden: 3 },
  ],
  lookup: [{ clave: 'wp_panel', entrada: 'defecto', valor: 510 }],
  partidas: partidas,
  reglas: [
    { id: 'mo', tipo: 'cantidad', partida_id: 'MANO_OBRA', formula_cantidad: '1', seccion: 'Mano de obra', prioridad: 45 },
    { id: 'pan', tipo: 'cantidad', partida_id: 'PANEL', formula_cantidad: '1', seccion: 'Equipos', prioridad: 60 },
    { id: 'k6', tipo: 'seleccion', variable: 'kwp', minimo: 0.01, maximo: 6.5, partida_id: 'KIT_BASE', formula_cantidad: '1', seccion: 'Instalación', prioridad: 50 },
    { id: 'k10', tipo: 'seleccion', variable: 'kwp', minimo: 6.51, maximo: 12, partida_id: 'KIT_10', formula_cantidad: '1', seccion: 'Instalación', prioridad: 50 },
    { id: 'i6', tipo: 'seleccion', variable: 'kwp', minimo: 0.01, maximo: 6.5, partida_id: 'INV_6', formula_cantidad: '1', seccion: 'Equipos', prioridad: 50 },
    { id: 'i10', tipo: 'seleccion', variable: 'kwp', minimo: 6.51, maximo: 12, partida_id: 'INV_10', formula_cantidad: '1', seccion: 'Equipos', prioridad: 50 },
  ],
  productos: {}, manoObra: [], dtoLinea: [],
};

var total = function (r) { return cadenaPrecios(r.lineas, 0).total; };
var tiene = function (r, t) { return r.lineas.some(function (l) { return l.descripcion.indexOf(t) > -1; }); };
var eur2 = function (n) { return n.toFixed(2); };
var linea = function (r, t) { return r.lineas.filter(function (l) { return l.descripcion.indexOf(t) > -1; })[0]; };

titulo('10 paneles de 510 Wp · 5,1 kWp');
var r = calcular('solar', { paneles_manual: 10 }, config);
igual('los kWp salen de los paneles', r.variables.kwp, 5.1);
igual('diez paneles', linea(r, 'Panel fotovoltaico').cantidad, 10);
comprueba('kit de 5–6 kWp', tiene(r, 'Material eléctrico') && tiene(r, 'Trámites'));
comprueba('y no el de 10', !tiene(r, '10 kWp'));
// El kit ya no lleva mano de obra (etapa 46): 3.742 − 725 = 3.017 € de material
// y gestiones. La mano de obra va aparte, a 0,40 € por vatio.
igual('mano de obra por vatio (5.100 W × 0,40)', eur2(linea(r, 'Mano de obra de instalación').cantidad * 0.4), '2040.00');
igual('total', eur2(total(r)), eur2(3017 + 1610 + 110 * 10 + 5100 * 0.4));
print('  info  el kit de 5.445 € del análisis era 3.017 de material + 2.428 de mano de obra = 6,07 kWp a 0,40 €/W.');

titulo('20 paneles de 510 Wp · 10,2 kWp');
r = calcular('solar', { paneles_manual: 20 }, config);
igual('los kWp', r.variables.kwp, 10.2);
comprueba('kit de 10 kWp', tiene(r, 'Instalación fotovoltaica 10 kWp'));
comprueba('inversor de 10', linea(r, 'Inversor').precio_tarifa === 2100);
comprueba('sin el kit pequeño', !tiene(r, 'Trámites'));
igual('total', eur2(total(r)), eur2(8560 + 2100 + 110 * 20 + 10200 * 0.4));

titulo('paneles de otros vatios');
r = calcular('solar', { paneles_manual: 12, wp_manual: 450 }, config);
igual('12 × 450 Wp = 5,4 kWp', r.variables.kwp, 5.4);
igual('sigue en el kit pequeño', eur2(total(r)), eur2(3017 + 1610 + 110 * 12 + 5400 * 0.4));

titulo('la ficha de una visita');
r = calcular('solar', { modulos_estimados: 14 }, config);
igual('coge los módulos de la ficha', linea(r, 'Panel fotovoltaico').cantidad, 14);
igual('7,14 kWp → kit de 10', eur2(total(r)), eur2(8560 + 2100 + 110 * 14 + 7140 * 0.4));

titulo('por encima de 12 kWp no se inventa el kit');
r = calcular('solar', { paneles_manual: 40 }, config);
igual('los paneles sí', linea(r, 'Panel fotovoltaico').cantidad, 40);
comprueba('pero sin kit ni inversor', !tiene(r, 'Instalación fotovoltaica') && !tiene(r, 'Inversor'));
comprueba('la mano de obra sí, que es por vatio', tiene(r, 'Mano de obra de instalación'));
igual('total: paneles y mano de obra, sin kit ni inversor', eur2(total(r)), eur2(110 * 40 + 20400 * 0.4));

titulo('sin paneles no hay presupuesto');
r = calcular('solar', {}, config);
igual('ninguna línea', r.lineas.length, 0);
comprueba('y lo dice', r.incidencias.some(function (i) { return i.codigo === 'sin_lineas'; }));

resultado();
