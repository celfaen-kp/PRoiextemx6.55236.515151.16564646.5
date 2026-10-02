/* El proyecto de la obra (sql/etapa63): avance global, agrupación de fases y
 * lo que se guarda con el parte. */

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
comprueba('dice cuántas van hechas', html.indexOf('2 de 6 fases hechas') !== -1);
igual('obra sin fases: el parte no enseña el bloque', avanceParteHTML({ obraId: 'o9' }), '');

resultado();
