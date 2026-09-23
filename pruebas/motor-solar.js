/* El motor con las reglas de fotovoltaica de sql/etapa44, 46 y 47.
 *
 * Los números son los del análisis de los 21 presupuestos
 * (MOTOR-PRESUPUESTOS.md §3): panel a 110 €/ud en todos, kit de 5–6 kWp
 * 5.445 €, kit de 10 kWp 8.560 €. Desde la etapa 47 el inversor, el medidor,
 * las baterías y el backup salen de la tarifa de fotovoltaica: sus reglas y
 * productos los genera herramientas/reglas-fotovoltaica.py en la carpeta de
 * tarifas (no están en el repo porque llevan precios). */
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

var fv = JSON.parse(read(RUTA_TARIFAS + '/fotovoltaica-reglas.json'));

var config = {
  variables: [
    { codigo: 'n_paneles', formula: 'max(modulos_estimados, paneles_manual)', orden: 1 },
    { codigo: 'wp_panel', formula: "si(wp_manual > 0, wp_manual, lookup('wp_panel','defecto'))", orden: 2 },
    { codigo: 'kwp', formula: 'redondea(n_paneles * wp_panel / 1000, 2)', orden: 3 },
    // etapa 47 (las mismas fórmulas que el SQL)
    { codigo: 'marca_inversor', formula: "si(inversor_marca = 'enphase', 'enphase', 'fronius')", orden: 10 },
    { codigo: 'fases', formula: "si(suministro = 'trifasico', 3, 1)", orden: 11 },
    { codigo: 'con_bateria', formula: "si(baterias = 'si', 1, 0)", orden: 12 },
    { codigo: 'bat_kwh', formula: "si(baterias_kwh > 0, baterias_kwh, lookup('bateria_kwh', 'defecto'))", orden: 13 },
    { codigo: 'marca_bateria', formula: "si(bateria_marca != '', bateria_marca, si(marca_inversor = 'enphase', 'enphase', 'byd'))", orden: 14 },
    { codigo: 'con_backup', formula: 'si(backup, 1, 0)', orden: 15 },
    { codigo: 'bateria_dc', formula: "si((con_bateria = 1 y marca_bateria != 'tesla') o baterias = 'dejar_preparado', 1, 0)", orden: 16 },
    { codigo: 'kw_inversor', formula: "redondea(kwp / lookup('ratio_dc_ac', 'defecto'), 2)", orden: 17 },
    { codigo: 'ramas_enphase', formula: "techo(n_paneles / lookup('micros_por_rama', 'defecto'))", orden: 18 },
  ],
  lookup: [
    { clave: 'wp_panel', entrada: 'defecto', valor: 510 },
    { clave: 'ratio_dc_ac', entrada: 'defecto', valor: 1.2 },
    { clave: 'micros_por_rama', entrada: 'defecto', valor: 11 },
    { clave: 'bateria_kwh', entrada: 'defecto', valor: 5 },
  ],
  partidas: partidas,
  reglas: [
    { id: 'mo', tipo: 'cantidad', partida_id: 'MANO_OBRA', formula_cantidad: '1', seccion: 'Mano de obra', prioridad: 45 },
    { id: 'pan', tipo: 'cantidad', partida_id: 'PANEL', formula_cantidad: '1', seccion: 'Equipos', prioridad: 60 },
    { id: 'k6', tipo: 'seleccion', variable: 'kwp', minimo: 0.01, maximo: 6.5, partida_id: 'KIT_BASE', formula_cantidad: '1', seccion: 'Instalación', prioridad: 50 },
    { id: 'k10', tipo: 'seleccion', variable: 'kwp', minimo: 6.51, maximo: 12, partida_id: 'KIT_10', formula_cantidad: '1', seccion: 'Instalación', prioridad: 50 },
  ].concat(fv.reglas),
  productos: fv.productos, manoObra: [], dtoLinea: [],
};

var total = function (r) { return cadenaPrecios(r.lineas, 0).total; };
var tiene = function (r, t) { return r.lineas.some(function (l) { return l.descripcion.indexOf(t) > -1; }); };
var eur2 = function (n) { return n.toFixed(2); };
var linea = function (r, t) { return r.lineas.filter(function (l) { return l.descripcion.indexOf(t) > -1; })[0]; };

var P = function (nombre) {
  for (var k in fv.productos) if (fv.productos[k].nombre === nombre) return fv.productos[k].precio_tarifa;
  throw new Error('no está en la tarifa: ' + nombre);
};
var aviso = function (r, t) { return r.incidencias.some(function (i) { return i.codigo === 'regla_aviso' && i.mensaje.indexOf(t) > -1; }); };
var KIT = 3017 - 110;   // el medidor sale del kit: ahora es el Smart Meter o el Gateway

titulo('10 paneles de 510 Wp · 5,1 kWp · Fronius monofásico sin batería');
var r = calcular('solar', { paneles_manual: 10 }, config);
igual('los kWp salen de los paneles', r.variables.kwp, 5.1);
igual('diez paneles', linea(r, 'Panel fotovoltaico').cantidad, 10);
comprueba('kit de 5–6 kWp', tiene(r, 'Material eléctrico') && tiene(r, 'Trámites'));
comprueba('y no el de 10', !tiene(r, '10 kWp'));
comprueba('el kit ya no lleva medidor', !tiene(r, 'Medidor de energía'));
igual('hace falta un inversor de 4,25 kW (5,1 / 1,2)', r.variables.kw_inversor, 4.25);
comprueba('Primo GEN24 4.6, sin Plus', tiene(r, 'Fronius Primo GEN24 SC 4.6') && !tiene(r, 'Plus'));
comprueba('con su Smart Meter monofásico', tiene(r, 'Smart Meter TS 100A-1'));
comprueba('ni rastro de Enphase', !tiene(r, 'ENPHASE'));
igual('mano de obra por vatio (5.100 W × 0,40)', eur2(linea(r, 'Mano de obra de instalación').cantidad * 0.4), '2040.00');
igual('total', eur2(total(r)), eur2(KIT + P('Fronius Primo GEN24 SC 4.6') + P('FRONIUS Smart Meter TS 100A-1') + 110 * 10 + 5100 * 0.4));

titulo('20 paneles de 510 Wp · 10,2 kWp');
r = calcular('solar', { paneles_manual: 20 }, config);
igual('los kWp', r.variables.kwp, 10.2);
comprueba('kit de 10 kWp', tiene(r, 'Instalación fotovoltaica 10 kWp'));
comprueba('8,5 kW → Primo GEN24 10.0', tiene(r, 'Fronius Primo GEN24 10.0KW'));
comprueba('sin el kit pequeño', !tiene(r, 'Trámites'));
igual('total', eur2(total(r)), eur2(8560 + P('Fronius Primo GEN24 10.0KW') + P('FRONIUS Smart Meter TS 100A-1') + 110 * 20 + 10200 * 0.4));

titulo('paneles de otros vatios');
r = calcular('solar', { paneles_manual: 12, wp_manual: 450 }, config);
igual('12 × 450 Wp = 5,4 kWp', r.variables.kwp, 5.4);
comprueba('4,5 kW → Primo 4.6', tiene(r, 'Fronius Primo GEN24 SC 4.6'));

titulo('trifásico con batería BYD de 10 kWh y backup');
r = calcular('solar', { paneles_manual: 10, suministro: 'trifasico', baterias: 'si', baterias_kwh: 10, backup: true }, config);
comprueba('Symo Plus, que admite batería', tiene(r, 'Fronius Symo GEN24 SC 5.0 Plus'));
comprueba('Smart Meter trifásico', tiene(r, 'Smart Meter TS 65A-3'));
igual('4 módulos HVS de 2,56 (10,24 kWh)', linea(r, 'BYD Premium HVS 2.56').cantidad, 4);
comprueba('con su BCU y base', tiene(r, 'HVS /HVM (BCU+Base)'));
comprueba('y el Backup Switch', tiene(r, 'Backup Switch'));
igual('en la sección Baterías', linea(r, 'BYD Premium HVS 2.56').seccion, 'Baterías');

titulo('batería grande: BYD HVM');
r = calcular('solar', { paneles_manual: 10, baterias: 'si', baterias_kwh: 15 }, config);
igual('6 módulos HVM de 2,76', linea(r, 'BYD Premium HVM 2.76').cantidad, 6);
comprueba('y no HVS', !tiene(r, 'HVS 2.56'));
comprueba('sin backup, que no se ha pedido', !tiene(r, 'Backup'));

titulo('batería sin decir cuántos kWh');
r = calcular('solar', { paneles_manual: 10, baterias: 'si' }, config);
igual('5 kWh por defecto → 2 módulos HVS', linea(r, 'BYD Premium HVS 2.56').cantidad, 2);

titulo('Fronius con batería Fronius Reserva');
r = calcular('solar', { paneles_manual: 10, baterias: 'si', baterias_kwh: 9, bateria_marca: 'fronius' }, config);
igual('3 módulos Reserva de 3,15', linea(r, 'Reserva Modulo 3,15').cantidad, 3);
comprueba('con su BMS y base', tiene(r, 'Reserva BMS y Base'));
comprueba('inversor Plus', tiene(r, 'SC 4.6 Plus'));

titulo('Fronius con Tesla y backup');
r = calcular('solar', { paneles_manual: 10, baterias: 'si', baterias_kwh: 20, bateria_marca: 'tesla', backup: true }, config);
comprueba('el Powerwall lleva su inversor: el Fronius va sin Plus', tiene(r, 'Fronius Primo GEN24 SC 4.6') && !tiene(r, 'SC 4.6 Plus'));
comprueba('Powerwall 3 monofásico', tiene(r, 'Powerwall 3 | 13.5'));
igual('20 kWh: una expansión', linea(r, 'Expansión Powerwall').cantidad, 1);
comprueba('backup de Tesla: Gateway 2', tiene(r, 'Backup Gateway 2') && !tiene(r, 'Backup Switch'));

titulo('dejar preparado para batería');
r = calcular('solar', { paneles_manual: 10, baterias: 'dejar_preparado' }, config);
comprueba('inversor Plus', tiene(r, 'SC 4.6 Plus'));
comprueba('pero sin batería', !r.lineas.some(function (l) { return l.seccion === 'Baterías'; }));

titulo('Enphase: 12 paneles monofásico');
r = calcular('solar', { paneles_manual: 12, inversor_marca: 'enphase' }, config);
igual('un IQ8HC por panel', linea(r, 'IQ 8HC').cantidad, 12);
igual('un Q Cable por micro', linea(r, 'Q Cable 2.5mm | 1.3m (monofásico)').cantidad, 12);
igual('dos ramas: dos tapones', linea(r, 'Tapón de terminación para cable 1-phase').cantidad, 2);
igual('y dos conectores de campo', linea(r, 'Conector estanco 1-phase - Macho').cantidad, 2);
comprueba('con su controlador y medida', tiene(r, 'IQ Gateway Metered'));
igual('dos toroidales', linea(r, 'CT Transformador de núcleo partido 200A').cantidad, 2);
comprueba('sin inversor ni meter Fronius', !tiene(r, 'Fronius') && !tiene(r, 'Smart Meter'));

titulo('Enphase con paneles de 600 Wp, trifásico');
r = calcular('solar', { paneles_manual: 10, wp_manual: 600, inversor_marca: 'enphase', suministro: 'trifasico' }, config);
igual('IQ8P', linea(r, 'IQ 8P').cantidad, 10);
comprueba('Q Cable trifásico', tiene(r, '1.3m (trifásico)') && !tiene(r, '(monofásico)'));
igual('seis toroidales', linea(r, 'CT Transformador de núcleo partido 200A').cantidad, 6);

titulo('Enphase con su batería y backup');
r = calcular('solar', { paneles_manual: 12, inversor_marca: 'enphase', baterias: 'si', baterias_kwh: 10, backup: true }, config);
igual('dos IQ Battery 5P', linea(r, 'IQ Battery 5P').cantidad, 2);
comprueba('IQ System Controller', tiene(r, 'IQ System Controller'));

titulo('Enphase con Tesla, trifásico');
r = calcular('solar', { paneles_manual: 12, inversor_marca: 'enphase', suministro: 'trifasico', baterias: 'si', bateria_marca: 'tesla', backup: true }, config);
comprueba('Powerwall 3P', tiene(r, 'Powerwall 3P'));
comprueba('Gateway 2, no el System Controller', tiene(r, 'Backup Gateway 2') && !tiene(r, 'IQ System Controller'));
comprueba('sin expansión', !tiene(r, 'Expansión'));

titulo('combinaciones que no van');
r = calcular('solar', { paneles_manual: 12, inversor_marca: 'enphase', baterias: 'si', bateria_marca: 'byd' }, config);
comprueba('Enphase con BYD: no pone batería', !tiene(r, 'BYD'));
comprueba('y lo avisa', aviso(r, 'Enphase solo va con'));
r = calcular('solar', { paneles_manual: 10, baterias: 'si', bateria_marca: 'enphase' }, config);
comprueba('Fronius con Enphase: no la pone', !tiene(r, 'IQ Battery'));
comprueba('y lo avisa', aviso(r, 'Fronius va con'));
r = calcular('solar', { paneles_manual: 10, baterias: 'no', backup: true }, config);
comprueba('backup sin batería: no lo pone', !tiene(r, 'Backup'));
comprueba('y lo avisa', aviso(r, 'El backup necesita batería'));

titulo('la ficha de una visita');
r = calcular('solar', { modulos_estimados: 14 }, config);
igual('coge los módulos de la ficha', linea(r, 'Panel fotovoltaico').cantidad, 14);
comprueba('7,14 kWp → kit de 10 y Primo 6.0', tiene(r, 'Instalación fotovoltaica 10 kWp') && tiene(r, 'Fronius Primo GEN24 SC 6.0'));

titulo('por encima de 12 kWp no se inventa el kit');
r = calcular('solar', { paneles_manual: 40 }, config);
igual('los paneles sí', linea(r, 'Panel fotovoltaico').cantidad, 40);
comprueba('sin kit', !tiene(r, 'Instalación fotovoltaica'));
comprueba('ni inversor', !r.lineas.some(function (l) { return /GEN24/.test(l.descripcion); }));
comprueba('y avisa de que el inversor va a mano', aviso(r, 'se elige a mano'));
comprueba('la mano de obra sí, que es por vatio', tiene(r, 'Mano de obra de instalación'));

titulo('sin paneles no hay presupuesto');
r = calcular('solar', {}, config);
igual('ninguna línea', r.lineas.length, 0);
comprueba('y lo dice', r.incidencias.some(function (i) { return i.codigo === 'sin_lineas'; }));

resultado();
