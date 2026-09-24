/* La agenda «hoy primero»: la tira de la semana con puntos en los días con
 * citas, la próxima cita en grande, las tareas pendientes, tocar un día filtra
 * la lista, el mes entero se abre aparte, y se ven las de todos. */
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

titulo('Hoy primero');
var h = pinta();
comprueba('la tira de la semana, no el mes entero', h.indexOf('ag-semana') > -1 && h.indexOf('ag-cal-cab') === -1);
comprueba('saluda por el nombre', h.indexOf('Hola, Xavi') > -1);
comprueba('la próxima cita en grande, con Empezar visita', h.indexOf('ag-prox') > -1 && h.indexOf('Próxima cita') > -1);
comprueba('la próxima es la de Ana (mañana 10:00) y no se repite abajo', h.split('>Ana<').length - 1 === 1);
comprueba('las de todos (también las de Ramon)', h.indexOf('José Gil') > -1 && h.indexOf('David Portol') > -1);
comprueba('mañana con dos puntos en la tira', /data-dia="[^"]+"><i>[LMXJVSD]<\/i>\d+<em><u><\/u><u><\/u><\/em>/.test(h));
comprueba('sin el botón «+ Cliente» en la cabecera', h.indexOf('ag_nuevoCliente') === -1);
A.ag('ag_mesToggle', {});
h = pinta();
comprueba('el mes entero se abre aparte', h.indexOf('ag-cal-cab') > -1);
A.ag('ag_mesToggle', {});
var manana = fechaLocal(dia(1, 10));
A.ag('ag_dia', { dia: manana });
h = pinta();
comprueba('al tocar mañana, solo las de mañana', h.indexOf('José Gil') > -1 && h.indexOf('David Portol') === -1);
comprueba('botón "Ver todas"', h.indexOf('Ver todas') > -1);
comprueba('con un día elegido, la próxima cita grande se aparta', h.indexOf('ag-prox') === -1);
A.ag('ag_dia', { dia: manana });
h = pinta();
comprueba('al volver a tocar, todas otra vez', h.indexOf('David Portol') > -1);
A.ag('ag_mes', { m: '1' });
comprueba('pasa al mes siguiente', V.agenda.mes > hoyISO().slice(0, 7));
resultado();
