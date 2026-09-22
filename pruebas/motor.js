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
  ],
  lookup: [{ clave: 'metros_incluidos', entrada: 'defecto', valor: 3 }],
  partidas: {
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
  reglas: [{ id: 'r1', tipo: 'condicional', partida_id: 'p-aire', formula_cantidad: '1', prioridad: 10, seccion: 'Instalación' }],
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
resultado();
