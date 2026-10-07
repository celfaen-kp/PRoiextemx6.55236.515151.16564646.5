/* El proyecto de la obra (sql/etapa63): avance global, agrupación de fases y
 * lo que se guarda con el parte. */

// Como Administración: ve también las fases comunes.
S.users = [{ id: 'u0', nombre: 'Enzo', rol: 'admin', activo: true }]; V.user = { id: 'u0' };
S.fases = [
  { id: 'f1', obra_id: 'o1', categoria: null, orden: 10, nombre: 'Pedido de material', pct: 100, no_aplica: false },
  { id: 'f2', obra_id: 'o1', categoria: null, orden: 20, nombre: 'Recepción de material', pct: 80, no_aplica: false },
  { id: 'f3', obra_id: 'o1', categoria: 'FV', orden: 110, nombre: 'Fijaciones y estructura', pct: 100, no_aplica: false },
  { id: 'f4', obra_id: 'o1', categoria: 'FV', orden: 120, nombre: 'Montaje de paneles', pct: 75, no_aplica: false },
  { id: 'f5', obra_id: 'o1', categoria: 'FV', orden: 140, nombre: 'Inversor y baterías', pct: 0, no_aplica: false },
  { id: 'f6', obra_id: 'o1', categoria: 'FV', orden: 170, nombre: 'Legalización', pct: 0, no_aplica: true },
  { id: 'f7', obra_id: 'o1', categoria: null, orden: 900, nombre: 'Cobro final', pct: 0, no_aplica: false },
  { id: 'f8', obra_id: 'o2', categoria: 'AE', orden: 210, nombre: 'Ubicación unidad exterior', pct: 100, no_aplica: false },
];
var a = avanceObra('o1');
igual('media de las que aplican: (100+80+100+75+0+0)/6 = 59', a.pct, 59);
igual('hechas: 2 de 6 (la que no aplica no cuenta)', a.hechas + ' de ' + a.total, '2 de 6');
igual('obra con todo hecho', avanceObra('o2').pct, 100);
igual('obra sin fases: null', avanceObra('o9'), null);

var g = fasesAgrupadas('o1');
igual('grupos: preparación, fotovoltaica, cierre', g.map((x) => x.titulo).join(','), 'Preparación,Fotovoltaica,Cierre');
igual('la fotovoltaica lleva sus cuatro fases en orden', g[1].fases.map((f) => f.nombre).join(' / '), 'Fijaciones y estructura / Montaje de paneles / Inversor y baterías / Legalización');

// El parte solo guarda lo que cambia.
var d = { obraId: 'o1', avance: { f4: 100, f5: 25, f2: 80 } };
var filas = avanceFilasDe(d);
igual('dos cambios (la que se dejó igual no cuenta)', filas.map((f) => f.fase_id + ':' + f.pct_antes + '>' + f.pct_despues).join(','), 'f4:75>100,f5:0>25');
igual('sin avance: nada', avanceFilasDe({ obraId: 'o1' }).length, 0);

// El bloque del parte enseña solo las pendientes.
V.fasesCargadas = true;
var html = avanceParteHTML({ obraId: 'o1', avance: {} });
comprueba('enseña las pendientes', html.indexOf('Montaje de paneles') !== -1 && html.indexOf('Inversor') !== -1);
comprueba('no enseña las hechas ni las que no aplican', html.indexOf('Fijaciones') === -1 && html.indexOf('Legalización') === -1);
comprueba('dice cuántas van hechas', html.indexOf('2 de 6 subfases hechas') !== -1);
igual('obra sin fases: el parte no enseña el bloque', avanceParteHTML({ obraId: 'o9' }), '');

// Un jefe de obra solo ve las fases de la categoría: ni material, ni cobro.
S.users = [{ id: 'u1', nombre: 'Xavi', rol: 'jefe', activo: true }]; V.user = { id: 'u1' };
igual('jefe: solo el grupo de la categoría', fasesAgrupadas('o1').map((x) => x.titulo).join(','), 'Fotovoltaica');
igual('jefe: el avance se calcula con esas', avanceObra('o1').pct, Math.round((100 + 75 + 0) / 3));
comprueba('jefe: en el parte no sale el material', avanceParteHTML({ obraId: 'o1', avance: {} }).indexOf('Recepción de material') === -1);

titulo('fases propias con subfases (V20.7)');
S.users = [{ id: 'u0', nombre: 'Enzo', rol: 'admin', activo: true }]; V.user = { id: 'u0' };
S.obras = (S.obras || []).concat([{ id: 'o3', numero: 3, titulo: 'Casa Roca', cliente: 'Roca', categorias: ['FV'] }]);
S.fases = [
  { id: 'p1', obra_id: 'o3', categoria: null, orden: 10, nombre: 'Pedido de material', pct: 0 },
  { id: 'p9', obra_id: 'o3', categoria: null, orden: 540, nombre: 'Cobro final', pct: 0 },
  { id: 'v1', obra_id: 'o3', categoria: 'FV', orden: 110, nombre: 'Estructura', pct: 50 },
  { id: 'w1', obra_id: 'o3', categoria: null, grupo: 'Piscina', orden: 701, nombre: 'Vaso', pct: 100 },
  { id: 'w2', obra_id: 'o3', categoria: null, grupo: 'Piscina', orden: 702, nombre: 'Depuradora', pct: 0 },
  { id: 'x1', obra_id: 'o3', categoria: null, grupo: 'Fontanería', orden: 700, nombre: 'Tuberías', pct: 0 },
];
var g3 = fasesAgrupadas('o3');
igual('bloques: preparación, FV, propias en orden de creación, cierre', g3.map((x) => x.titulo).join(','), 'Preparación,Fotovoltaica,Fontanería,Piscina,Cierre');
igual('la piscina lleva sus dos subfases', g3[3].fases.map((f) => f.nombre).join('/'), 'Vaso/Depuradora');
igual('las claves para una subfase nueva', gruposParaSubfase('o3').map((x) => x[0]).join(','), 'ini,FV,g:Fontanería,g:Piscina,fin');
igual('el avance cuenta las propias', avanceObra('o3').total, 6);
S.users = [{ id: 'u1', nombre: 'Xavi', rol: 'jefe', activo: true }]; V.user = { id: 'u1' };
igual('el jefe ve FV y las propias, no las comunes', fasesAgrupadas('o3').map((x) => x.titulo).join(','), 'Fotovoltaica,Fontanería,Piscina');
comprueba('en el parte la subfase propia lleva su fase de etiqueta', avanceParteHTML({ obraId: 'o3', avance: {} }).indexOf('>Piscina<') !== -1);

titulo('al desmarcar una categoría se van sus fases (V20.5)');
S.users = [{ id: 'u0', nombre: 'Enzo', rol: 'admin', activo: true }]; V.user = { id: 'u0' };
S.fases = [
  { id: 'c1', obra_id: 'o2', categoria: null, orden: 10, nombre: 'Pedido de material', pct: 0 },
  { id: 'a1', obra_id: 'o2', categoria: 'AE', orden: 210, nombre: 'Unidad exterior', pct: 0 },
  { id: 'a2', obra_id: 'o2', categoria: 'AE', orden: 220, nombre: 'Sala de máquinas', pct: 40 },
  { id: 'v1', obra_id: 'o2', categoria: 'FV', orden: 110, nombre: 'Estructura', pct: 0 },
];
var borradas = [], generada = null, avisos = [];
var dbAntes = window.Sysefen.db;
window.Sysefen.db = Object.assign({}, dbAntes, {
  borrarFase: function (id) { borradas.push(id); return Promise.resolve(); },
  generarFasesObra: function (id) { generada = id; return Promise.resolve(1); },
  listarFases: function () { return Promise.resolve(S.fases.filter(function (f) { return borradas.indexOf(f.id) < 0; })); },
});
var avisarAntes = avisar; avisar = function (t) { avisos.push(t); };
ajustarFasesAlCambiarCategorias('o2', ['FV']).then(function () {
  igual('se quita la de aerotermia sin avance', borradas.join(','), 'a1');
  comprueba('la que tenía avance se deja', S.fases.some(function (f) { return f.id === 'a2'; }));
  comprueba('y se avisa de ello', avisos.length === 1 && avisos[0].indexOf('1 fase tenía') >= 0);
  comprueba('las comunes y las de FV no se tocan', S.fases.some(function (f) { return f.id === 'c1'; }) && S.fases.some(function (f) { return f.id === 'v1'; }));
  igual('y se generan las que falten de las categorías nuevas', generada, 'o2');
  window.Sysefen.db = dbAntes; avisar = avisarAntes;
  resultado();
});
