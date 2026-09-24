/* El motor, contra el caso de aire acondicionado que sí está verificado.
 *
 * De MOTOR-PRESUPUESTOS.md §3: en los tres presupuestos que usan los códigos
 * C100–C104, las cantidades siguen EXACTAMENTE el número de unidades. El caso
 * "AIRE MIDEA 1" es un multisplit 2×1: 2 interiores, 1 exterior. */
load(RUTA_TMP + '/formulas.js');
load(RUTA_TMP + '/motor.js');
load(RUTA_TMP + '/cadena.js');

var config = {
  variables: [
    { codigo: 'unidades_interiores', formula: 'cuenta(estancias)', orden: 1 },
    { codigo: 'unidades_exteriores', formula: "si(tipo_sistema = 'split_1x1', unidades_interiores, 1)", orden: 2 },
    { codigo: 'metros_totales', formula: "suma(distancias_lineas, 'metros')", orden: 3 },
    { codigo: 'metros_exceso', formula: "max(0, metros_totales - lookup('metros_incluidos','defecto') * unidades_interiores)", orden: 4 },
    { codigo: 'metros_gas_exceso', formula: "max(0, metros_totales - lookup('metros_gas_incluidos', tipo_sistema) * unidades_exteriores)", orden: 5 },
    { codigo: 'kg_gas_extra', formula: "redondea(metros_gas_exceso * lookup('gramos_por_metro','defecto') / 1000, 2)", orden: 6 },
  ],
  lookup: [
    { clave: 'metros_incluidos', entrada: 'defecto', valor: 3 },
    // etapa 45: la carga de fábrica del equipo y los gramos por metro de más
    { clave: 'metros_gas_incluidos', entrada: 'defecto', valor: 5 },
    { clave: 'metros_gas_incluidos', entrada: 'multisplit', valor: 7.5 },
    { clave: 'metros_gas_incluidos', entrada: 'split_1x1', valor: 5 },
    { clave: 'gramos_por_metro', entrada: 'defecto', valor: 20 },
  ],
  partidas: {
    // 49 €/kg, que es como se compra con descuento.
    'p-gas': { codigo: 'GAS_EXTRA', nombre: 'Carga adicional de refrigerante', items: [
      { concepto_libre: 'Carga adicional de refrigerante R32 (kg)', precio_fijo: 49, formula_cantidad: 'kg_gas_extra', orden: 1 }] },
    'p-aire': {
      codigo: 'KIT_BASE', nombre: 'Instalación por unidad de aire',
      items: [
        { concepto_libre: 'C100: Tubería frigorífica y aislamiento', precio_fijo: 245, formula_cantidad: 'unidades_interiores', orden: 1 },
        { concepto_libre: 'C101: Electricidad', precio_fijo: 72, formula_cantidad: 'unidades_interiores', orden: 2 },
        { concepto_libre: 'C102: Soportes unidad exterior', precio_fijo: 45, formula_cantidad: 'unidades_exteriores', orden: 3 },
        { concepto_libre: 'C103: Exceso metro', precio_fijo: 52, formula_cantidad: 'metros_exceso', orden: 4 },
        { concepto_libre: 'C104: Mano de obra', precio_fijo: 450, formula_cantidad: 'unidades_interiores', orden: 5 },
      ],
    },
  },
  reglas: [
    { id: 'r1', tipo: 'condicional', partida_id: 'p-aire', formula_cantidad: '1', prioridad: 10, seccion: 'Instalación' },
    { id: 'r2', tipo: 'cantidad', partida_id: 'p-gas', formula_cantidad: '1', prioridad: 35, seccion: 'Instalación' },
  ],
  productos: {},
  manoObra: [],
  dtoLinea: [],
};

titulo('AIRE MIDEA 1 · multisplit 2×1, sin exceso de metros');
var r = calcular('aire_acondicionado', {
  tipo_sistema: 'multisplit',
  estancias: [{ nombre: 'Salón' }, { nombre: 'Dormitorio' }],
  distancias_lineas: [{ metros: 3 }, { metros: 3 }],
}, config);
function linea(cod) { for (var i = 0; i < r.lineas.length; i++) if (r.lineas[i].descripcion.indexOf(cod) === 0) return r.lineas[i]; return null; }
igual('interiores', r.variables.unidades_interiores, 2);
igual('exteriores', r.variables.unidades_exteriores, 1);
igual('metros de exceso', r.variables.metros_exceso, 0);
igual('C100 ×2', linea('C100').cantidad, 2);
igual('C101 ×2', linea('C101').cantidad, 2);
igual('C102 ×1', linea('C102').cantidad, 1);
comprueba('C103 no sale si no hay exceso', linea('C103') === null);
igual('C104 ×2', linea('C104').cantidad, 2);
igual('cada línea sabe de dónde viene', r.lineas[0].origen, 'partida');

titulo('AIRE MIDEA · 2×1 + módulo: 3 interiores, 2 exteriores');
var r2 = calcular('aire_acondicionado', {
  tipo_sistema: 'multisplit',
  estancias: [{}, {}, {}],
  unidades_exteriores: 2,        // la persona lo corrige en la visita
  distancias_lineas: [{ metros: 12 }, { metros: 9 }, { metros: 8 }],
}, Object.assign({}, config, {
  variables: config.variables.filter(function (v) { return v.codigo !== 'unidades_exteriores'; }),
}));
function linea2(cod) { for (var i = 0; i < r2.lineas.length; i++) if (r2.lineas[i].descripcion.indexOf(cod) === 0) return r2.lineas[i]; return null; }
igual('C100 ×3', linea2('C100').cantidad, 3);
igual('C102 ×2 (el que corrigió la persona)', linea2('C102').cantidad, 2);
igual('C104 ×3', linea2('C104').cantidad, 3);
igual('exceso: 29 m − 3×3', linea2('C103').cantidad, 20);

titulo('los totales, con la cadena de precios');
var t = cadenaPrecios(r.lineas, 0);
// 245×2 + 72×2 + 45×1 + 450×2 = 490 + 144 + 45 + 900
igual('total sin descuento', t.total, 1579);
var t10 = cadenaPrecios(r.lineas, 10);
igual('con −10 % global', t10.total, 1421.1);

titulo('lo que el motor no sabe, lo dice');
var r3 = calcular('aire_acondicionado', { tipo_sistema: 'multisplit', estancias: [{}] }, config);
var codigos = r3.incidencias.map(function (i) { return i.codigo; });
comprueba('avisa del dato que falta (' + codigos.join(', ') + ')', codigos.indexOf('campo_faltante') >= 0);
var vacio = calcular('aire_acondicionado', {}, Object.assign({}, config, { reglas: [] }));
comprueba('sin reglas, lo dice en vez de callar', vacio.incidencias.some(function (i) { return i.codigo === 'sin_lineas'; }));
/* --- etapa 45: el gas que hay que añadir por la tubería de más -------------
 * La carga de fábrica cubre 7,5 m en multisplit y 5 m en los 1x1, por unidad
 * EXTERIOR. Lo que pasa de ahí son 20 g por metro. */
titulo('el gas adicional');
var g = calcular('aire_acondicionado', {
  tipo_sistema: 'multisplit',
  estancias: [{ nombre: 'Salón' }, { nombre: 'Dormitorio' }],
  distancias_lineas: [{ metros: 10 }, { metros: 7.5 }],
}, config);
igual('17,5 m con 7,5 incluidos → 10 m de gas', g.variables.metros_gas_exceso, 10);
igual('y 0,2 kg de R32', g.variables.kg_gas_extra, 0.2);
var lg = g.lineas.filter(function (l) { return l.descripcion.indexOf('refrigerante') > -1; })[0];
comprueba('sale su línea', !!lg);
igual('con los kilos como cantidad', lg.cantidad, 0.2);
igual('y su importe', cadenaPrecios([lg], 0).total.toFixed(2), '9.80');

var h = calcular('aire_acondicionado', {
  tipo_sistema: 'split_1x1',
  estancias: [{ nombre: 'Salón' }, { nombre: 'Dormitorio' }],
  distancias_lineas: [{ metros: 4 }, { metros: 4 }],
}, config);
igual('dos 1x1 de 4 m: la carga de fábrica llega (2 × 5 m)', h.variables.metros_gas_exceso, 0);
comprueba('así que no hay línea de gas', !h.lineas.some(function (l) { return l.descripcion.indexOf('refrigerante') > -1; }));
comprueba('pero el C103 tampoco se pierde', h.variables.metros_exceso === 2);

titulo('retirar los equipos viejos (etapa 49)');
var cfgRet = {
  variables: config.variables.concat([
    { codigo: 'n_retirar', formula: 'max(0, equipos_a_retirar_n)', orden: 20 },
    { codigo: 'recupera_tuberia', formula: "si(preinstalacion_existente = 'si_aprovechable', 1, 0)", orden: 21 },
    { codigo: 'n_retirar_ext', formula: 'si(exteriores_a_retirar_n > 0, exteriores_a_retirar_n, si(n_retirar > 0, 1, 0))', orden: 22 },
  ]),
  lookup: config.lookup,
  partidas: {
    'r-int': { codigo: 'RETIRAR_INT', nombre: 'Retirada interior', items: [{ concepto_libre: 'Retirada de unidad interior antigua', precio_fijo: 80, formula_cantidad: 'n_retirar', orden: 1 }] },
    'r-tub': { codigo: 'RETIRAR_INT_TUB', nombre: 'Retirada interior con tubería', items: [{ concepto_libre: 'Retirada de unidad interior antigua con recuperación de la tubería', precio_fijo: 150, formula_cantidad: 'n_retirar', orden: 1 }] },
    'r-ext': { codigo: 'RETIRAR_EXT', nombre: 'Retirada exterior', items: [{ concepto_libre: 'Retirada de unidad exterior antigua', precio_fijo: 80, formula_cantidad: 'n_retirar_ext', orden: 1 }] },
  },
  reglas: [
    { id: 'ri', tipo: 'cantidad', condicion: { recupera_tuberia: 0 }, partida_id: 'r-int', formula_cantidad: '1', seccion: 'Retirada', prioridad: 30 },
    { id: 'rt', tipo: 'cantidad', condicion: { recupera_tuberia: 1 }, partida_id: 'r-tub', formula_cantidad: '1', seccion: 'Retirada', prioridad: 30 },
    { id: 're', tipo: 'cantidad', condicion: {}, partida_id: 'r-ext', formula_cantidad: '1', seccion: 'Retirada', prioridad: 30 },
  ],
  productos: {}, manoObra: [], dtoLinea: [],
};
var ret = function (d) { return calcular('aire_acondicionado', Object.assign({ tipo_sistema: 'multisplit', estancias: [{ nombre: 'Salón' }, { nombre: 'Cuarto' }] }, d), cfgRet); };
var sinViejos = ret({ equipos_a_retirar_n: 0 });
comprueba('sin equipos viejos no sale nada de retirada', !sinViejos.lineas.some(function (l) { return l.seccion === 'Retirada'; }));
var dosViejos = ret({ equipos_a_retirar_n: 2 });
var li = dosViejos.lineas.filter(function (l) { return l.seccion === 'Retirada'; });
igual('dos interiores viejas sin recuperar tubería: 80 × 2', li.filter(function (l) { return /interior antigua$/.test(l.descripcion); })[0].cantidad, 2);
comprueba('y no la de 150', !li.some(function (l) { return /tubería/.test(l.descripcion); }));
igual('una exterior por defecto, a 80', li.filter(function (l) { return /exterior/.test(l.descripcion); })[0].cantidad, 1);
igual('total de retirada: 240', cadenaPrecios(li, 0).total, 240);
var conTub = ret({ equipos_a_retirar_n: 2, exteriores_a_retirar_n: 2, preinstalacion_existente: 'si_aprovechable' });
li = conTub.lineas.filter(function (l) { return l.seccion === 'Retirada'; });
igual('recuperando la tubería: 150 × 2', li.filter(function (l) { return /tubería/.test(l.descripcion); })[0].cantidad, 2);
comprueba('y no la de 80 por interior', !li.some(function (l) { return /interior antigua$/.test(l.descripcion); }));
igual('dos exteriores dichas: 80 × 2', li.filter(function (l) { return /exterior/.test(l.descripcion); })[0].cantidad, 2);
igual('total: 300 + 160', cadenaPrecios(li, 0).total, 460);

titulo('una regla por cada estancia (por_cada)');
// Máquinas de mentira: el catálogo de verdad lo siembra la etapa 48.
var cfgCada = {
  variables: config.variables,
  lookup: config.lookup.concat([{ clave: 'w_m2', entrada: 'defecto', valor: 100 }]),
  partidas: {},
  productos: {
    'IN-09': { referencia: 'IN-09', nombre: 'Mural 2,6 kW', familia: 'aire_interior', unidad: 'ud', precio_tarifa: 300, iva: 21 },
    'IN-12': { referencia: 'IN-12', nombre: 'Mural 3,5 kW', familia: 'aire_interior', unidad: 'ud', precio_tarifa: 350, iva: 21 },
  },
  reglas: [
    // La potencia de cada estancia sale de sus m²: 100 W/m². Hasta 2,6 kW la
    // pequeña, hasta 3,5 la mediana.
    { id: 'e9', tipo: 'seleccion', por_cada: 'estancias', variable: "m2 * lookup('w_m2', 'defecto') / 1000",
      minimo: 0.001, maximo: 2.6, producto_ref: 'IN-09', formula_cantidad: '1', seccion: 'Equipos', prioridad: 60 },
    { id: 'e12', tipo: 'seleccion', por_cada: 'estancias', variable: "m2 * lookup('w_m2', 'defecto') / 1000",
      minimo: 2.601, maximo: 3.5, producto_ref: 'IN-12', formula_cantidad: '1', seccion: 'Equipos', prioridad: 60 },
    { id: 'grande', tipo: 'aviso', por_cada: 'estancias', variable: "m2 * lookup('w_m2', 'defecto') / 1000",
      minimo: 3.501, notas: 'Una estancia pide más de 3,5 kW: la máquina va a mano.', prioridad: 60 },
  ],
  manoObra: [], dtoLinea: [],
};
var pc = calcular('aire_acondicionado', {
  tipo_sistema: 'multisplit',
  estancias: [{ nombre: 'Salón', m2: 30 }, { nombre: 'Dormitorio', m2: 12 }, { nombre: 'Estudio', m2: 20 }],
  distancias_lineas: [],
}, cfgCada);
var maq = pc.lineas.filter(function (l) { return l.producto_ref; });
igual('una máquina por estancia', maq.length, 3);
igual('el salón (30 m² = 3 kW) lleva la mediana', maq[0].producto_ref, 'IN-12');
comprueba('y lo dice en el concepto', maq[0].descripcion === 'Mural 3,5 kW — Salón');
igual('el dormitorio (1,2 kW), la pequeña', maq[1].producto_ref, 'IN-09');
igual('el estudio (2 kW), la pequeña', maq[2].producto_ref, 'IN-09');
comprueba('cada línea recuerda su estancia', maq[1].origen_inputs.elemento === 'Dormitorio');
comprueba('sin aviso: ninguna pasa de 3,5', !pc.incidencias.some(function (i) { return i.codigo === 'regla_aviso'; }));

var pg = calcular('aire_acondicionado', {
  tipo_sistema: 'split_1x1',
  estancias: [{ nombre: 'Nave', m2: 80 }],
  distancias_lineas: [],
}, cfgCada);
comprueba('80 m² (8 kW): ninguna máquina del catálogo', !pg.lineas.some(function (l) { return l.producto_ref; }));
comprueba('y el aviso lo dice', pg.incidencias.some(function (i) { return i.codigo === 'regla_aviso' && /a mano/.test(i.mensaje); }));

resultado();
