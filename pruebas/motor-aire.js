/* El motor con las máquinas de aire de la etapa 48: interior por estancia
 * según sus m², exterior pareja en 1x1 y una exterior multi por número de
 * interiores y kW. Las reglas y los productos los genera
 * herramientas/reglas-aire.py en la carpeta de tarifas (llevan precios, no
 * van en el repo). Las variables son las mismas que siembra el SQL. */
load(RUTA_TMP + '/formulas.js');
load(RUTA_TMP + '/motor.js');
load(RUTA_TMP + '/cadena.js');
load(RUTA_TMP + '/aire.js');

var ai = JSON.parse(read(RUTA_TARIFAS + '/aire-reglas.json'));

var config = {
  variables: [
    { codigo: 'unidades_interiores', formula: 'cuenta(estancias)', orden: 1 },
    { codigo: 'unidades_exteriores', formula: "si(tipo_sistema = 'split_1x1', unidades_interiores, 1)", orden: 2 },
    { codigo: 'metros_totales', formula: "si(suma(estancias, 'metros') > 0, suma(estancias, 'metros'), suma(distancias_lineas, 'metros'))", orden: 3 },
    { codigo: 'metros_exceso', formula: "max(0, metros_totales - lookup('metros_incluidos','defecto') * unidades_interiores)", orden: 4 },
    { codigo: 'metros_gas_exceso', formula: "max(0, metros_totales - lookup('metros_gas_incluidos', tipo_sistema) * unidades_exteriores)", orden: 5 },
    // etapa 51: el gas por estancia, según su máquina
    { codigo: 'gas_g_estancia', por_cada: 'estancias', formula: "redondea(max(0, metros - lookup('metros_gas_incluidos', tipo_sistema)) * lookup('gramos_por_metro_tamano', tamano), 0)", orden: 19 },
    { codigo: 'kg_gas_extra', formula: "redondea(si(suma(estancias, 'metros') > 0, suma(estancias, 'gas_g_estancia'), metros_gas_exceso * lookup('gramos_por_metro', 'defecto')) / 1000, 3)", orden: 20 },
    // etapa 52: el cable al cuadro
    { codigo: 'metros_cuadro', formula: 'max(0, distancia_cuadro_m) * unidades_exteriores', orden: 7 },
    // etapa 48: por cada estancia
    { codigo: 'marca_aire', formula: "si(marca_preferida = 'vaillant', 'vaillant', 'midea')", orden: 9 },
    // etapa 120: la potencia elegida a mano manda sobre los m²
    { codigo: 'kw_estancia', por_cada: 'estancias', formula: "si(potencia_kw > 0, potencia_kw, redondea(m2 * lookup('w_m2', 'defecto') / 1000, 2))", orden: 10 },
    { codigo: 'tamano', por_cada: 'estancias', formula: 'si(kw_estancia <= 0, 0, si(kw_estancia <= 2.05, 7, si(kw_estancia <= 2.6, 9, si(kw_estancia <= 3.5, 12, si(kw_estancia <= 5.3, 18, si(kw_estancia <= 7.1, 24, 99))))))', orden: 11 },
    { codigo: 'kw_nominal', por_cada: 'estancias', formula: "lookup('kw_tamano', tamano)", orden: 12 },
    { codigo: 'kw_total', formula: "redondea(suma(estancias, 'kw_nominal'), 2)", orden: 13 },
  ],
  lookup: [
    { clave: 'metros_incluidos', entrada: 'defecto', valor: 3 },
    { clave: 'metros_gas_incluidos', entrada: 'defecto', valor: 5 },
    { clave: 'metros_gas_incluidos', entrada: 'multisplit', valor: 7.5 },
    { clave: 'metros_gas_incluidos', entrada: 'split_1x1', valor: 5 },
    { clave: 'metros_gas_incluidos', entrada: 'cassette', valor: 7.5 },
    { clave: 'metros_gas_incluidos', entrada: 'conductos', valor: 7.5 },
    { clave: 'gramos_por_metro', entrada: 'defecto', valor: 20 },
    { clave: 'gramos_por_metro_tamano', entrada: 'defecto', valor: 12 }, { clave: 'gramos_por_metro_tamano', entrada: '7', valor: 12 },
    { clave: 'gramos_por_metro_tamano', entrada: '9', valor: 12 }, { clave: 'gramos_por_metro_tamano', entrada: '12', valor: 12 },
    { clave: 'gramos_por_metro_tamano', entrada: '18', valor: 12 }, { clave: 'gramos_por_metro_tamano', entrada: '24', valor: 24 },
    { clave: 'gramos_por_metro_tamano', entrada: '0', valor: 0 }, { clave: 'gramos_por_metro_tamano', entrada: '99', valor: 0 },
    { clave: 'w_m2', entrada: 'defecto', valor: 100 },
    { clave: 'kw_tamano', entrada: '7', valor: 2.05 }, { clave: 'kw_tamano', entrada: '9', valor: 2.6 },
    { clave: 'kw_tamano', entrada: '12', valor: 3.5 }, { clave: 'kw_tamano', entrada: '18', valor: 5.3 },
    { clave: 'kw_tamano', entrada: '24', valor: 7.0 }, { clave: 'kw_tamano', entrada: '99', valor: 0 },
    { clave: 'kw_tamano', entrada: '0', valor: 0 },
  ],
  partidas: {
    'p-aire': { codigo: 'KIT_BASE', nombre: 'Instalación por unidad de aire', items: [
      // etapa 51: sin C100 (la conexión va en la mano de obra); tubería por metro
      // etapa 52: la electricidad por metro, según el cable (+10 % de material)
      { concepto_libre: 'E101: Cable de interior a exterior 5G 1,5 mm²', precio_fijo: 3.81, formula_cantidad: 'metros_totales', unidad: 'm', orden: 2 },
      { concepto_libre: 'E102: Cable de exterior a cuadro 3G 2,5 mm²', precio_fijo: 4.03, formula_cantidad: 'metros_cuadro', unidad: 'm', orden: 3 },
      { concepto_libre: 'C102: Soportes unidad exterior', precio_fijo: 45, formula_cantidad: 'unidades_exteriores', orden: 3 },
      { concepto_libre: 'C103: Tubería frigorífica y aislamiento', precio_fijo: 52, formula_cantidad: 'metros_totales', unidad: 'm', orden: 4 },
      { concepto_libre: 'C104: Mano de obra', precio_fijo: 450, formula_cantidad: 'unidades_interiores', orden: 5 },
    ] },
    'p-gas': { codigo: 'GAS_EXTRA', nombre: 'Carga adicional de refrigerante', items: [
      // etapa 121: una base de 15 € cuando hay algo que cargar, más los kilos
      { concepto_libre: 'Carga adicional de refrigerante: base', precio_fijo: 15, formula_cantidad: 'si(kg_gas_extra > 0, 1, 0)', unidad: 'ud', orden: 0 },
      { concepto_libre: 'Carga adicional de refrigerante R32', precio_fijo: 49, formula_cantidad: 'kg_gas_extra', unidad: 'kg', orden: 1 }] },
  },
  reglas: [
    { id: 'kit', tipo: 'condicional', partida_id: 'p-aire', formula_cantidad: '1', seccion: 'Instalación', prioridad: 100 },
    { id: 'gas', tipo: 'cantidad', partida_id: 'p-gas', formula_cantidad: '1', seccion: 'Instalación', prioridad: 35 },
  ].concat(ai.reglas),
  productos: ai.productos, manoObra: [], dtoLinea: [],
};

var maquinas = function (r) { return r.lineas.filter(function (l) { return l.producto_ref; }); };
var nombres = function (r) { return maquinas(r).map(function (l) { return l.descripcion; }); };
var P = function (nombre) {
  for (var k in ai.productos) if (ai.productos[k].nombre === nombre) return ai.productos[k].precio_tarifa;
  throw new Error('no está en la tarifa: ' + nombre);
};
var aviso = function (r, t) { return r.incidencias.some(function (i) { return i.codigo === 'regla_aviso' && i.mensaje.indexOf(t) > -1; }); };
var linea = function (r, t) { return r.lineas.filter(function (l) { return l.descripcion.indexOf(t) > -1; })[0]; };

titulo('1x1: dos estancias, cada una con su interior y su exterior');
var r = calcular('aire_acondicionado', {
  tipo_sistema: 'split_1x1',
  estancias: [{ nombre: 'Salón', m2: 30, metros: 4 }, { nombre: 'Dormitorio', m2: 12, metros: 6 }],
  distancia_cuadro_m: 8,
}, config);
igual('el salón pide 3 kW', r.variables.kw_estancia[0], 3);
igual('y le toca el tamaño 12', r.variables.tamano[0], 12);
igual('el dormitorio (1,2 kW), el 7', r.variables.tamano[1], 7);
igual('que en murales Solstice se cubre con la de 9', r.variables.kw_nominal[1], 2.05);
igual('cuatro máquinas: dos interiores y dos exteriores', maquinas(r).length, 4);
igual('las del salón van juntas', nombres(r).slice(0, 2).join(' | '), 'EZ-12RD6-I — Salón | EZ-12RD6-O — Salón');
igual('y luego las del dormitorio', nombres(r).slice(2).join(' | '), 'EZ-09RD6-I — Dormitorio | EZ-09RD6-O — Dormitorio');
igual('los metros salen de las estancias (4 + 6)', r.variables.metros_totales, 10);
igual('la tubería va por metro: 10 m', linea(r, 'C103').cantidad, 10);
igual('en metros', linea(r, 'C103').unidad, 'm');
comprueba('sin línea de conexión por equipo: va en la mano de obra', !linea(r, 'C100'));
igual('gas por estancia: 4 m no pasa de 5, 6 m sí → 1 m × 12 g', r.variables.gas_g_estancia.join(','), '0,12');
igual('12 g = 0,012 kg', r.variables.kg_gas_extra, 0.012);
igual('la línea de gas va en kg', linea(r, 'refrigerante R32').unidad, 'kg');
igual('y delante, la base de la carga: una vez, 15 €', linea(r, 'refrigerante: base').cantidad + ' × ' + linea(r, 'refrigerante: base').precio_tarifa, '1 × 15');
igual('dos exteriores → dos soportes', linea(r, 'C102').cantidad, 2);
igual('cable 5G 1,5 por los metros de línea: 10 m', linea(r, 'E101').cantidad, 10);
igual('cable 3G 2,5 al cuadro: 8 m por cada exterior (1x1) = 16 m', linea(r, 'E102').cantidad, 16);
igual('en metros', linea(r, 'E102').unidad, 'm');
comprueba('sin avisos de máquina', !r.incidencias.some(function (i) { return i.codigo === 'regla_aviso'; }));
var esperado = P('EZ-12RD6-I') + P('EZ-12RD6-O') + P('EZ-09RD6-I') + P('EZ-09RD6-O') + 2 * 45 + 10 * 52 + 2 * 450 + 15 + 0.012 * 49 + 10 * 3.81 + 16 * 4.03;
igual('el total cuadra', cadenaPrecios(r.lineas, 0).total.toFixed(2), esperado.toFixed(2));

titulo('multisplit 3×1: tres interiores y una exterior');
r = calcular('aire_acondicionado', {
  tipo_sistema: 'multisplit',
  estancias: [{ nombre: 'Salón', m2: 32, metros: 5 }, { nombre: 'Dormitorio 1', m2: 14, metros: 8 }, { nombre: 'Dormitorio 2', m2: 11, metros: 9 }],
}, config);
igual('tamaños 12, 7 y 7', r.variables.tamano.join(','), '12,7,7');
igual('suman 7,6 kW nominales', r.variables.kw_total, 7.6);
igual('tres interiores', maquinas(r).filter(function (l) { return /RD6-I/.test(l.descripcion); }).length, 3);
comprueba('y la exterior M3O-18N8, que lleva hasta 12+12+12', !!linea(r, 'M3O-18N8'));
igual('una sola exterior', maquinas(r).filter(function (l) { return /^M\dO/.test(l.descripcion); }).length, 1);
igual('un soporte', linea(r, 'C102').cantidad, 1);
igual('22 m de tubería', linea(r, 'C103').cantidad, 22);
igual('gas por estancia con 7,5 m de fábrica en multi: 0, 0,5×12, 1,5×12', r.variables.gas_g_estancia.join(','), '0,6,18');
igual('24 g → 0,024 kg', r.variables.kg_gas_extra, 0.024);

titulo('multisplit 2×1 grande: sube de exterior');
r = calcular('aire_acondicionado', {
  tipo_sistema: 'multisplit',
  estancias: [{ nombre: 'Salón', m2: 45 }, { nombre: 'Comedor', m2: 36 }],
}, config);
igual('tamaños 18 y 18', r.variables.tamano.join(','), '18,18');
comprueba('10,6 kW en dos: M3O-27N8', !!linea(r, 'M3O-27N8'));

titulo('cassette: interior, panel y exterior sin combinaciones vetadas');
r = calcular('aire_acondicionado', {
  tipo_sistema: 'cassette',
  estancias: [{ nombre: 'Oficina', m2: 24, metros: 6 }, { nombre: 'Sala', m2: 24, metros: 6 }],
}, config);
igual('dos cassettes de 9', maquinas(r).filter(function (l) { return /MCA4U-09NX/.test(l.descripcion); }).length, 2);
igual('con sus dos paneles', maquinas(r).filter(function (l) { return /MCP-600B/.test(l.descripcion); }).length, 2);
comprueba('9+9 en cassette cabe en la M2O-14N8', !!linea(r, 'M2O-14N8'));

titulo('conductos: una sola interior también lleva exterior multi');
r = calcular('aire_acondicionado', { tipo_sistema: 'conductos', estancias: [{ nombre: 'Planta', m2: 50 }] }, config);
comprueba('conductos de 18', !!linea(r, 'MTJU-18NX'));
comprueba('y la M2O-18N8 (1 unidad de 18)', !!linea(r, 'M2O-18N8'));

titulo('lo que no tiene máquina, lo avisa');
r = calcular('aire_acondicionado', { tipo_sistema: 'split_1x1', estancias: [{ nombre: 'Nave', m2: 90 }] }, config);
igual('90 m² = 9 kW: sin tamaño', r.variables.tamano[0], 99);
comprueba('no pone máquina', maquinas(r).length === 0);
comprueba('y lo dice', aviso(r, 'más de 7 kW'));
r = calcular('aire_acondicionado', { tipo_sistema: 'suelo_techo', estancias: [{ nombre: 'Tienda', m2: 40 }] }, config);
comprueba('suelo-techo: aviso', aviso(r, 'Suelo-techo'));
comprueba('y sin máquina', maquinas(r).length === 0);
r = calcular('aire_acondicionado', {
  tipo_sistema: 'multisplit',
  estancias: [{ m2: 40 }, { m2: 40 }, { m2: 40 }, { m2: 40 }, { m2: 40 }],
}, config);
comprueba('cinco de 18 (26,5 kW): ninguna exterior las lleva', !linea(r, 'M5O-42N8') && aviso(r, 'no hay exterior multi'));

titulo('la marca: Midea por defecto, Vaillant avisa');
r = calcular('aire_acondicionado', { tipo_sistema: 'split_1x1', marca_preferida: 'midea', estancias: [{ nombre: 'Salón', m2: 30 }] }, config);
comprueba('Midea: máquinas Midea', maquinas(r).length === 2 && /EZ-12RD6/.test(maquinas(r)[0].descripcion));
r = calcular('aire_acondicionado', { tipo_sistema: 'split_1x1', marca_preferida: 'vaillant', estancias: [{ nombre: 'Salón', m2: 30 }] }, config);
comprueba('Vaillant: ninguna máquina Midea', maquinas(r).length === 0);
comprueba('y avisa de que su tarifa no está', aviso(r, 'Vaillant'));
comprueba('pero el kit de instalación sí', !!linea(r, 'C104'));

titulo('una ficha vieja, con los metros aparte');
r = calcular('aire_acondicionado', {
  tipo_sistema: 'multisplit',
  estancias: [{ nombre: 'Salón', m2: 20 }, { nombre: 'Dormitorio', m2: 12 }],
  distancias_lineas: [{ metros: 10 }, { metros: 7.5 }],
}, config);
igual('coge los metros de la lista antigua', r.variables.metros_totales, 17.5);
igual('y el gas con el cálculo antiguo (17,5 − 7,5 = 10 m × 20 g)', r.variables.kg_gas_extra, 0.2);
comprueba('y elige máquinas igual', maquinas(r).length === 3);

titulo('sin m² no se inventa la máquina');
r = calcular('aire_acondicionado', { tipo_sistema: 'multisplit', estancias: [{ nombre: 'Salón' }, { nombre: 'Cuarto' }] }, config);
igual('tamaño 0 en las dos', r.variables.tamano.join(','), '0,0');
comprueba('sin interiores ni exterior', maquinas(r).length === 0);
comprueba('y avisa de que faltan los m²', aviso(r, 'no tiene m²'));
comprueba('pero el kit de instalación sí', !!linea(r, 'C104'));


// ---------------------------------------------------------------------------
// Etapa 120 (Enzo, 19-11-2026): la potencia a mano y varios sistemas juntos.
var aire = function (d) { return calcularAire(d, config, calcular, resumenDe); };
var total = function (r) { return cadenaPrecios(r.lineas, 0).total; };
var cant = function (r, t) { var l = linea(r, t); return l ? l.cantidad : 0; };

titulo('la potencia elegida a mano manda sobre los m²');
r = aire({ tipo_sistema: 'split_1x1', estancias: [{ nombre: 'Salón', potencia: '35', metros: 4 }] });
igual('un 35 es la máquina de 3,5 kW', r.variables.kw_estancia[0], 3.5);
igual('tamaño 12', r.variables.tamano[0], 12);
igual('su interior y su exterior', nombres(r).join(' | '), 'EZ-12RD6-I — Salón | EZ-12RD6-O — Salón');
comprueba('sin avisos de máquina ni de que falten los m²', !r.incidencias.some(function (i) { return i.codigo === 'regla_aviso' || (i.codigo === 'campo_faltante' && /m2|potencia/.test(i.campo || i.mensaje)); }));
igual('25 → tamaño 9, 50 → 18, 70 → 24', aire({ tipo_sistema: 'split_1x1', estancias: [{ potencia: '25' }, { potencia: '50' }, { potencia: '70' }] }).variables.tamano.join(','), '9,18,24');
igual('con m² de más y potencia puesta, vale la potencia', aire({ tipo_sistema: 'split_1x1', estancias: [{ m2: 60, potencia: '25' }] }).variables.tamano[0], 9);
igual('una potencia que no existe no cuenta: se va a los m²', aire({ tipo_sistema: 'split_1x1', estancias: [{ m2: 30, potencia: '40' }] }).variables.tamano[0], 12);
igual('sin potencia, por m² como siempre', aire({ tipo_sistema: 'split_1x1', estancias: [{ nombre: 'Salón', m2: 30, metros: 4 }, { nombre: 'Dormitorio', m2: 12, metros: 6 }], distancia_cuadro_m: 8 }).lineas.length,
  calcular('aire_acondicionado', { tipo_sistema: 'split_1x1', estancias: [{ nombre: 'Salón', m2: 30, metros: 4, potencia_kw: 0 }, { nombre: 'Dormitorio', m2: 12, metros: 6, potencia_kw: 0 }], distancia_cuadro_m: 8 }, config).lineas.length);
comprueba('sin m² ni potencia sigue avisando', aviso(aire({ tipo_sistema: 'multisplit', estancias: [{ nombre: 'Salón' }] }), 'no tiene m²'));

titulo('un 2x1 con dos de 25 y un 1x1 de 35, en el mismo presupuesto');
var mixto = { tipo_sistema: 'multisplit', distancia_cuadro_m: 8, equipos_a_retirar_n: 2,
  estancias: [{ nombre: 'Dormitorio 1', potencia: '25', metros: 6, exterior: 1 }, { nombre: 'Dormitorio 2', potencia: '25', metros: 9, exterior: 1 },
              { nombre: 'Salón', potencia: '35', metros: 4, exterior: 2 }] };
r = aire(mixto);
igual('dos sistemas: un multi de dos y un 1x1', r.variables.sistemas.map(function (s) { return s.exterior + ':' + s.tipo_sistema + ':' + s.interiores; }).join(' '), '1:multisplit:2 2:split_1x1:1');
igual('tres interiores', maquinas(r).filter(function (l) { return /RD6-I/.test(l.descripcion); }).length, 3);
comprueba('la exterior del 2x1 (9+9 → M2O-14N8)', !!linea(r, 'M2O-14N8'));
comprueba('y la exterior pareja del 1x1 de 35', !!linea(r, 'EZ-12RD6-O'));
igual('dos exteriores en total', maquinas(r).filter(function (l) { return /^M\dO|RD6-O/.test(l.descripcion); }).length, 2);
igual('mano de obra de las tres', cant(r, 'C104'), 3);
igual('dos soportes de exterior', cant(r, 'C102'), 2);
igual('tubería: 6 + 9 + 4 = 19 m', cant(r, 'C103'), 19);
igual('cable de interior a exterior: 19 m', cant(r, 'E101'), 19);
igual('cable al cuadro: 8 m por cada exterior = 16 m', cant(r, 'E102'), 16);
igual('una sola línea por partida, no una por sistema', r.lineas.filter(function (l) { return l.descripcion.indexOf('C104') > -1; }).length, 1);
igual('el gas de cada sistema con su carga de fábrica: multi 1,5 m × 12 g; el 1x1 no pasa de 5 m', r.variables.kg_gas_extra, 0.018);
igual('las variables suman los tres equipos', r.variables.unidades_interiores + '/' + r.variables.unidades_exteriores + '/' + r.variables.metros_totales, '3/2/19');
// Lo mismo que hacer los dos presupuestos por separado y sumarlos.
var solo2x1 = aire({ tipo_sistema: 'multisplit', distancia_cuadro_m: 8, equipos_a_retirar_n: 2, estancias: mixto.estancias.slice(0, 2).map(function (e) { return Object.assign({}, e, { exterior: 0 }); }) });
var solo1x1 = aire({ tipo_sistema: 'split_1x1', distancia_cuadro_m: 8, estancias: [Object.assign({}, mixto.estancias[2], { exterior: 0 })] });
igual('cuesta lo mismo que los dos presupuestos por separado', total(r).toFixed(2), (total(solo2x1) + total(solo1x1)).toFixed(2));
igual('y el coste también', r.resumen.coste.toFixed(2), (solo2x1.resumen.coste + solo1x1.resumen.coste).toFixed(2));
igual('las líneas van numeradas seguidas', r.lineas.map(function (l) { return l.orden; }).join(','), r.lineas.map(function (_, i) { return i + 1; }).join(','));
igual('cada sección va seguida, sin trocearse por sistema', r.lineas.map(function (l) { return l.seccion; }).filter(function (s, i, a) { return i === 0 || a[i - 1] !== s; }).length, r.lineas.map(function (l) { return l.seccion; }).filter(function (s, i, a) { return a.indexOf(s) === i; }).length);

titulo('los grupos deciden el tipo, no el botón de arriba');
r = aire({ tipo_sistema: 'split_1x1', estancias: [{ potencia: '25', exterior: 1 }, { potencia: '25', exterior: 1 }] });
comprueba('dos en la misma exterior son un multi aunque arriba ponga 1x1', !!linea(r, 'M2O-14N8') && !linea(r, 'RD6-O'));
r = aire({ tipo_sistema: 'multisplit', estancias: [{ potencia: '35', exterior: 1 }, { potencia: '35', exterior: 2 }] });
igual('una en cada exterior son dos 1x1 aunque arriba ponga multi', maquinas(r).filter(function (l) { return /RD6-O/.test(l.descripcion); }).reduce(function (s, l) { return s + l.cantidad; }, 0), 2);
r = aire({ tipo_sistema: 'conductos', estancias: [{ potencia: '50', exterior: 1 }, { potencia: '25', exterior: 2 }] });
comprueba('conductos: cada grupo con su exterior multi', !!linea(r, 'M2O-18N8') && !!linea(r, 'M2O-14N8'));
igual('sin número en ninguna, un solo sistema como siempre', sistemasDeAire({ tipo_sistema: 'multisplit', estancias: [{ m2: 20 }, { m2: 12 }] }), null);
igual('las que no dicen exterior van juntas al final, con el tipo de la ficha', sistemasDeAire({ tipo_sistema: 'multisplit', estancias: [{ m2: 20 }, { m2: 12, exterior: 3 }, { m2: 15 }] }).map(function (s) { return s.exterior + ':' + s.tipo_sistema + ':' + s.estancias.length; }).join(' '), '3:split_1x1:1 0:multisplit:2');
r = aire({ tipo_sistema: 'multisplit', equipos_a_retirar_n: 2, exteriores_a_retirar_n: 1, estancias: [{ potencia: '25', exterior: 1 }, { potencia: '35', exterior: 2 }] });
igual('lo de retirar solo cuenta una vez', r.variables.n_retirar === undefined ? 'sin variable' : r.variables.n_retirar, config.variables.some(function (v) { return v.codigo === 'n_retirar'; }) ? 2 : 'sin variable');


titulo('la base de la carga de gas: 15 € cuando hay algo que cargar (Enzo, 19-11-2026)');
r = aire({ tipo_sistema: 'split_1x1', estancias: [{ potencia: '35', metros: 4 }] });
comprueba('sin gas de más (4 m no pasa de 5), ni base ni kilos', !linea(r, 'refrigerante'));
r = aire({ tipo_sistema: 'split_1x1', estancias: [{ potencia: '35', metros: 9 }] });
igual('con gas de más: la base y los kilos (4 m × 12 g)', r.lineas.filter(function (l) { return /refrigerante/.test(l.descripcion); }).map(function (l) { return l.descripcion + ' ' + l.cantidad + ' ' + l.unidad; }).join(' | '),
  'Carga adicional de refrigerante: base 1 ud | Carga adicional de refrigerante R32 0.048 kg');
igual('15 € + 0,048 kg × 49 €', (15 + 0.048 * 49).toFixed(2), r.lineas.filter(function (l) { return /refrigerante/.test(l.descripcion); }).reduce(function (s, l) { return s + l.cantidad * l.precio_tarifa; }, 0).toFixed(2));
r = aire({ tipo_sistema: 'multisplit', estancias: [{ potencia: '25', metros: 12, exterior: 1 }, { potencia: '25', metros: 10, exterior: 1 }, { potencia: '35', metros: 9, exterior: 2 }] });
igual('dos sistemas con gas: una sola base', cant(r, 'refrigerante: base'), 1);
igual('y los kilos de los dos sumados (4,5 + 2,5 m del multi y 4 m del 1x1, a 12 g)', cant(r, 'refrigerante R32'), 0.132);

resultado();
