/* El calendario de la agenda: puntos en los días con citas, tocar un día
 * filtra la lista, y se ven las de todos (no solo las mías). */
var app = nodo();
document.querySelector = function (q) { return q === '#app' ? app : nodo(); };
S.users = [{ id: 'u1', nombre: 'Xavi', rol: 'presupuestos', activo: true, empId: 'e1' }, { id: 'u2', nombre: 'Ramon', rol: 'presupuestos', activo: true, empId: 'e2' }];
empRows = [{ id: 'e1', nombre: 'Xavi' }, { id: 'e2', nombre: 'Ramon' }];
empIdPorNombre = { Xavi: 'e1', Ramon: 'e2' };
function dia(n, h) { var d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); }
V.agenda.cargado = true; V.agenda.clientes = [];
V.agenda.citas = [
  { id: 'c1', estado: 'pendiente', inicio: dia(1, 10), duracion_min: 60, empleado_id: 'e1', cliente: { nombre: 'Ana' } },
  { id: 'c2', estado: 'pendiente', inicio: dia(1, 12), duracion_min: 60, empleado_id: 'e2', cliente: { nombre: 'José Gil' } },
  { id: 'c3', estado: 'pendiente', inicio: dia(3, 9), duracion_min: 60, empleado_id: 'e2', cliente: { nombre: 'David Portol' } },
];
function pinta() { V.user = { id: 'u1' }; V.view = 'agenda'; render(); return app.innerHTML; }

titulo('Calendario');
var h = pinta();
comprueba('sale el mes', h.indexOf('ag-cal') > -1);
comprueba('las de todos (también las de Ramon)', h.indexOf('José Gil') > -1 && h.indexOf('David Portol') > -1);
comprueba('mañana con dos puntos', /data-dia="[^"]+">\d+<em><u><\/u><u><\/u><\/em>/.test(h));
var manana = fechaLocal(dia(1, 10));
A.ag('ag_dia', { dia: manana });
h = pinta();
comprueba('al tocar mañana, solo las de mañana', h.indexOf('José Gil') > -1 && h.indexOf('David Portol') === -1);
comprueba('botón "Ver todas"', h.indexOf('Ver todas') > -1);
A.ag('ag_dia', { dia: manana });
h = pinta();
comprueba('al volver a tocar, todas otra vez', h.indexOf('David Portol') > -1);
A.ag('ag_mes', { m: '1' });
comprueba('pasa al mes siguiente', V.agenda.mes > hoyISO().slice(0, 7));
resultado();
