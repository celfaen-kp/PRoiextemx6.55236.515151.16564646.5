/* Conjuntos del catálogo (Enzo, 13-11-2026: «el MTJU-71(24)N8Q-1 es 1x1 de la
 * interior MTJU-24NX y la exterior MO-24N8-Q-1; están, pero a mano toca
 * buscarlas una por una»). El buscador del presupuesto trae el conjunto y al
 * tocarlo entran sus unidades, cada una en su línea. */
S.users = [{ id: 'u0', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }];
V.user = { id: 'u0' };

var UI = { referencia: '13930199', nombre: 'MTJU-24NX', familia: 'aire_interior_conductos', unidad: 'ud', precio_tarifa: 100, iva: 21, detalle_tecnico: 'Interior de conductos' };
var UE = { referencia: '13930176', nombre: 'MO-24N8-Q-1', familia: 'otros', unidad: 'ud', precio_tarifa: 250, iva: 21 };
var CONJ = { id: 'c1', modelo: 'MTJU-71(24)N8Q-1', referencia: null, nombre: 'Midea Expert Conductos A7', gama: 'Conductos A7',
  unidades: [Object.assign({ cantidad: 1 }, UI), Object.assign({ cantidad: 1 }, UE)] };
var PACK = { id: 'c2', modelo: 'Dos interiores', unidades: [Object.assign({ cantidad: 2 }, UI), Object.assign({ cantidad: 1 }, UE)] };

titulo('conjuntos: al generar un presupuesto');
var recalculos = 0, calcularDeVerdad = A.presuCalcular;
A.presuCalcular = function () { recalculos++; return Promise.resolve(); };
visitasDB = {
  buscarProductos: function (q) { return Promise.resolve(/mtju-24/i.test(q) ? [UI] : []); },
  buscarConjuntos: function (q) { return Promise.resolve(/mtju/i.test(q) ? [CONJ, PACK] : []); },
};
V.presu = { cat: 'aire_acondicionado', cargando: false, error: null, datos: null, dto: 0, extra: [], fusion: {}, quitadas: [], ajustes: {}, guardando: false, buscar: 'MTJU-71(24)N8Q-1', buscando: false, resultados: [], guardado: null, opcion: null };
igual('el total del conjunto es la suma de sus unidades', conjuntoTotal(CONJ), 350);
igual('contando las cantidades', conjuntoTotal(PACK), 450);

A.presuBuscar().then(function () {
  igual('por el modelo del conjunto no hay producto', V.presu.resultados.length, 0);
  igual('pero sí el conjunto', V.presu.conjuntos.length, 2);
  var h = presuResultadosHTML();
  comprueba('sale con su rótulo y sus dos unidades', h.indexOf('CONJUNTO · 2 LÍNEAS') > -1 && h.indexOf('MTJU-24NX + MO-24N8-Q-1') > -1);
  comprueba('y la cantidad cuando no es una', h.indexOf('2 × MTJU-24NX') > -1);
  comprueba('ya no dice que no hay nada', h.indexOf('Nada con ese nombre') < 0);
  A.presuAnadirConjunto('c1');
  igual('al tocarlo entran las dos líneas', V.presu.extra.length, 2);
  igual('la interior con su referencia', V.presu.extra[0].producto_ref, '13930199');
  igual('la exterior con la suya', V.presu.extra[1].producto_ref, '13930176');
  igual('cada una con su precio del catálogo', V.presu.extra[1].precio_tarifa, 250);
  igual('y precio_catalogo, para que el servidor sepa que no se tocó', V.presu.extra[1].precio_catalogo, 250);
  igual('la búsqueda se limpia', V.presu.buscar + '|' + V.presu.conjuntos.length, '|0');
  igual('y se recalcula una vez', recalculos, 1);

  titulo('conjuntos: por una de sus unidades');
  V.presu.buscar = 'mtju-24';
  return A.presuBuscar();
}).then(function () {
  var h = presuResultadosHTML();
  comprueba('salen el conjunto y el producto', V.presu.conjuntos.length === 2 && V.presu.resultados.length === 1);
  comprueba('el conjunto, antes', h.indexOf('presuAnadirConjunto') > -1 && h.indexOf('presuAnadirConjunto') < h.indexOf('data-a="presuAnadir"'));
  A.presuAnadirConjunto('c2');
  igual('las cantidades del conjunto pasan a las líneas', V.presu.extra[2].cantidad, 2);

  titulo('conjuntos: si su búsqueda falla, el catálogo sigue');
  visitasDB.buscarConjuntos = function () { return Promise.reject(new Error('relation "conjuntos" does not exist')); };
  V.presu.buscar = 'mtju-24';
  return A.presuBuscar();
}).then(function () {
  igual('el producto sale igual', V.presu.resultados.length, 1);
  igual('sin conjuntos', V.presu.conjuntos.length, 0);
  delete visitasDB.buscarConjuntos;
  V.presu.buscar = 'mtju-24';
  return A.presuBuscar();
}).then(function () {
  igual('y sin la función (módulo viejo en caché) tampoco se rompe', V.presu.resultados.length, 1);
  A.presuTexto('m');
  igual('con menos de dos letras se vacía', (V.presu.conjuntos || []).length, 0);

  titulo('conjuntos: al modificar un presupuesto guardado');
  visitasDB.buscarConjuntos = function () { return Promise.resolve([CONJ]); };
  V.presuEdit = { dto: 0, cambios: {}, quitadas: [], nuevas: [], buscar: 'conductos 71', buscando: false, resultados: [], guardando: false };
  visitasDB.buscarProductos = function () { return Promise.resolve([]); };
  return A.presuEditBuscar();
}).then(function () {
  var h = presuEditResultadosHTML();
  comprueba('el conjunto sale en la edición', h.indexOf('presuEditAnadirConjunto') > -1 && h.indexOf('MTJU-71(24)N8Q-1') > -1);
  A.presuEditAnadirConjunto('c1');
  igual('entran dos líneas nuevas', V.presuEdit.nuevas.length, 2);
  igual('del catálogo, no libres', V.presuEdit.nuevas[0].libre, false);
  igual('en Equipos', V.presuEdit.nuevas[1].seccion, 'Equipos');
  igual('con su referencia', V.presuEdit.nuevas[1].producto_ref, '13930176');
  igual('y la cantidad en texto, como las demás', V.presuEdit.nuevas[0].cantidad, '1');
  A.presuCalcular = calcularDeVerdad; V.presuEdit = null; V.user = null;
  resultado();
}).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
