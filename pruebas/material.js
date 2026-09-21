/* Material pendiente y notas (sql/etapa36): que se pinte el recuadro de Hoy,
 * la lista, las notas y el material extra de la obra, y que al tachar con
 * importe cuente en el total de la obra. Sin base de verdad: datos de mentira.
 *
 * Con PINTAR=1 saca el HTML de cada pantalla entre marcas, para verlo. */
var app = nodo();
document.querySelector = function (q) { return q === '#app' ? app : nodo(); };

S.users = [
  { id: 'u1', nombre: 'Xavi', rol: 'jefe', activo: true },
  { id: 'u2', nombre: 'Bayron', rol: 'jefe', activo: true },
  { id: 'u3', nombre: 'David', rol: 'operario', activo: true },
];
empRows = [{ id: 'e1', nombre: 'Xavi' }, { id: 'e2', nombre: 'Bayron' }, { id: 'e3', nombre: 'David' }];
empIdPorNombre = { Xavi: 'e1', Bayron: 'e2', David: 'e3' };
S.obras = [
  { id: 'o1', titulo: 'Obra Ana · Sóller', estado: 'En curso' },
  { id: 'o2', titulo: 'Nave Portol 21', estado: 'En curso' },
];
S.partes = []; S.fichajes = []; S.imputaciones = [];
V.user = { id: 'u1' };
var ahora = new Date().toISOString();
V.mat.cargado = true;
V.mat.items = [
  { id: 'm1', texto: '3 sacos de cemento cola', tipo: 'comprar', obra_id: 'o1', urgente: true, voz: true, pedido_por: 'e2', creado_en: ahora, lleva_id: null, hecho_en: null, importe: null },
  { id: 'm2', texto: 'Taladro percutor grande', tipo: 'despacho', obra_id: 'o2', urgente: false, pedido_por: 'e3', creado_en: ahora, lleva_id: 'e1', hecho_en: null, importe: null },
  { id: 'm3', texto: 'Silicona neutra (2)', tipo: 'comprar', obra_id: 'o1', urgente: false, pedido_por: 'e3', creado_en: ahora, lleva_id: 'e3', hecho_en: ahora, hecho_por: 'e3', importe: 12.4 },
];
V.mat.notas = [{ id: 'n1', texto: 'El cuadro de la obra de Ana está en el garaje.', voz: true, autor_id: 'e2', creado_en: ahora }];

function pinta(nombre) {
  V.user = { id: 'u1' };  // el arranque de la app, sin sesión de verdad, lo deja en null
  try { render(); } catch (e) { print('render: ' + e + ' ' + e.stack); }
  if (globalThis.PINTAR) { print('<<<' + nombre + '>>>'); print(app.innerHTML); print('<<<fin>>>'); }
  return app.innerHTML;
}

titulo('Hoy'); V.view = 'hoy';
var h = pinta('hoy');
comprueba('recuadro amarillo', h.indexOf('m-aviso') > -1);
comprueba('cuenta 2 pendientes y 1 urgente', /2 cosas por comprar o traer/.test(h) && /1 urgente/.test(h));
comprueba('pestaña Material abajo', h.indexOf('data-v="material"') > -1);

titulo('Material');
V.view = 'material';
h = pinta('material');
comprueba('lista con las dos pendientes', h.indexOf('3 sacos de cemento cola') > -1 && h.indexOf('Taladro percutor') > -1);
comprueba('lo tachado no sale en pendiente', h.indexOf('Silicona neutra') === -1);
comprueba('el taladro lo llevo yo', /Taladro[\s\S]*lo lleva <\/?b?[^>]*>?tú|lo lleva tú/.test(h));
comprueba('urgente primero', h.indexOf('3 sacos') < h.indexOf('Taladro'));
V.mat.filtro = 'despacho'; h = pinta('x');
comprueba('filtro "del despacho"', h.indexOf('Taladro') > -1 && h.indexOf('3 sacos') === -1);
V.mat.filtro = 'todo';
V.mat.tab = 'notas'; h = pinta('notas');
comprueba('notas', h.indexOf('está en el garaje') > -1 && h.indexOf('Dictar') > -1);
V.mat.tab = 'hecho'; h = pinta('x');
comprueba('hecho, con importe', h.indexOf('Silicona neutra') > -1 && h.indexOf('12,40') > -1);
V.mat.tab = 'pend';

titulo('Obra');
V.view = 'obra'; V.obraId = 'o1';
h = pinta('obra');
comprueba('sección material extra', h.indexOf('Material extra') > -1);
comprueba('total de lo tachado', h.indexOf('1 · 12,40') > -1);

titulo('Tachar con importe');
var llamadas = [];
Sysefen.db = {};
Sysefen.db.actualizarMaterial = function (id, c) { llamadas.push(c); var i = V.mat.items.find(function (x) { return x.id === id; }); return Promise.resolve(Object.assign({}, i, c)); };
A.matAbrir('m1');
comprueba('se abre la hoja', V.sheet && V.sheet.tipo === 'matItem' && V.sheet.obraId === 'o1');
h = pinta('hojaItem');
V.sheet.importe = '8,50';
A.matGuardarItem(true).then(function () {
  var c = llamadas[0] || {};
  comprueba('guarda hecho, obra e importe', !!c.hecho_en && c.obra_id === 'o1' && c.importe === 8.5 && c.hecho_por === 'e1');
  V.view = 'obra'; h = pinta('x');
  comprueba('el total de la obra sube', h.indexOf('2 · 20,90') > -1);
  V.view = 'hoy'; h = pinta('x');
  comprueba('Hoy ya no cuenta el urgente', !/urgente/.test(h.split('m-aviso')[1].split('</div></div>')[0]));

  titulo('Aviso al entrar (urgente sin nadie)');
  V.mat.items[0].hecho_en = null; V.mat.items[0].lleva_id = null; V.sheet = null; V.mat.avisado = false;
  Sysefen.db.listarMaterial = function () { return Promise.resolve(V.mat.items); };
  Sysefen.db.listarNotas = function () { return Promise.resolve(V.mat.notas); };
  V.user = { id: 'u1' }; V.view = 'hoy';
  return A.cargarMaterial();
}).then(function () {
  comprueba('sale la ventana', V.sheet && V.sheet.tipo === 'matAviso');
  pinta('aviso');
  V.sheet = null; V.user = { id: 'u1' };
  return A.cargarMaterial();
}).then(function () {
  comprueba('solo una vez por sesión', !V.sheet);
  resultado();
}).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
