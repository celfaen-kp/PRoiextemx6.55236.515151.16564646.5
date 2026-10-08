/* Seguimiento por cliente (sql/etapa71): aplazados, próxima acción y el
 * tablero por fases. */

var hoy = hoyISO();
function dias(n) { var d = new Date(); d.setDate(d.getDate() + n); return fechaLocal(d); }
igual('aplazado manda sobre todo lo pendiente', agEstadoCliente({ citas: [], visitas: [], aplazado_hasta: dias(60), aplazado_motivo: 'Subvención de enero' }).k, 'aplazado');
igual('…pero no sobre un presupuesto aceptado', agEstadoCliente({ citas: [], visitas: [], aplazado_hasta: dias(60), presupuestos: [{ id: 'p', created_at: '1', respuesta_cliente: 'aceptado' }] }).k, 'aceptado');
igual('un aplazamiento ya vencido no cuenta', agEstadoCliente({ citas: [], visitas: [], aplazado_hasta: dias(-1) }).k, 'sin_cita');
comprueba('el texto lleva el motivo', agEstadoCliente({ citas: [], visitas: [], aplazado_hasta: dias(10), aplazado_motivo: 'Subvención de enero' }).txt.indexOf('Subvención de enero') > -1);

var cols = tableroColumnas([
  { id: 'a', nombre: 'Ana', citas: [], visitas: [] },
  { id: 'b', nombre: 'Bea', citas: [{ estado: 'pendiente', inicio: new Date(Date.now() + 86400000).toISOString() }], visitas: [] },
  { id: 'c', nombre: 'Cai', citas: [], visitas: [], aplazado_hasta: dias(30) },
  { id: 'd', nombre: 'Dani', citas: [], visitas: [], presupuestos: [{ id: 'p1', created_at: '1', estado: 'enviado', enviado_cliente_at: '2026-10-01' }] },
  { id: 'e', nombre: 'Eva', citas: [], visitas: [], sin_cita_motivo: 'Ya tiene obra' },
]);
var por = {}; cols.forEach(function (c) { por[c.k] = c.clientes.map(function (x) { return x.c.nombre; }).join(','); });
igual('nuevos sin cita', por.sin_cita, 'Ana');
igual('citados', por.citado, 'Bea');
igual('aplazados', por.aplazado, 'Cai');
igual('esperando respuesta', por.esperando, 'Dani');
igual('resueltos sin cita', por.sin_cita_ok, 'Eva');
igual('nueve columnas siempre', cols.length, 9);
comprueba('ya no hay columna «En Teamleader»', !cols.some(function (c) { return c.k === 'teamleader'; }));
igual('«se presupuesta sin visita» va con los visitados', agEstadoCliente({ citas: [], visitas: [], sin_cita_motivo: SIN_VISITA }).k, 'visitado');
igual('y lo dice', agEstadoCliente({ citas: [], visitas: [], sin_cita_motivo: SIN_VISITA }).txt, 'Por presupuestar · sin visita');
igual('visitado manda sobre una cita posterior', agEstadoCliente({ citas: [{ estado: 'pendiente', inicio: new Date(Date.now() + 86400000).toISOString() }], visitas: [{ id: 'v', estado: 'completada' }] }).k, 'visitado');
comprueba('las tarjetas del tablero se pueden arrastrar y tienen «⋯»', (function () { V.agenda.clientes = [{ id: 'a', nombre: 'Ana', citas: [], visitas: [] }]; V.agenda.buscar = ''; var h = tableroHTML(); return h.indexOf('draggable="true"') >= 0 && h.indexOf('data-a="tbMoverAbrir"') >= 0 && h.indexOf('data-col="sin_cita"') >= 0; })());

titulo('el buscador de clientes (V21.6)');
var rous = { nombre: 'Rostislava Rousová', telefono: '+34 641 85 00 25', poblacion: 'Sant Llorenç', email: 'r@post.cz' };
comprueba('sin tildes', clienteCasa(rous, 'rousova'));
comprueba('mayúsculas y población con ç', clienteCasa(rous, 'LLORENC'));
comprueba('palabras en cualquier orden', clienteCasa(rous, 'llorenc rostislava'));
comprueba('teléfono sin espacios', clienteCasa(rous, '6418500'));
comprueba('teléfono con espacios tal cual', clienteCasa(rous, '641 85'));
comprueba('lo que no está, no', !clienteCasa(rous, 'manacor'));

titulo('el camino del cliente (V20.9)');
var camino = function (c) { return caminoCliente(c).map(function (x) { return x.k + ':' + x.estado; }).join(' '); };
var sinTocar = { id: 'k1', nombre: 'Nuevo', citas: [], visitas: [] };
igual('recién llegado: toca el contacto', camino(sinTocar), 'contacto:ahora cita:pendiente visita:pendiente presupuesto:pendiente enviado:pendiente respuesta:pendiente obra:pendiente');
igual('contactado: toca la cita', caminoCliente({ id: 'k2', nombre: 'B', contacto_estado: 'contactado', citas: [], visitas: [] })[1].estado, 'ahora');
var conPresu = { id: 'k3', nombre: 'C', citas: [], visitas: [], presupuestos: [{ id: 'q', created_at: '2026-10-01', respuesta_cliente: 'pendiente' }] };
igual('con presupuesto sin visita: contacto, cita y visita quedan cubiertos (saltados), toca enviarlo',
  camino(conPresu), 'contacto:saltado cita:saltado visita:saltado presupuesto:hecho enviado:ahora respuesta:pendiente obra:pendiente');
var enviado = { id: 'k4', nombre: 'D', citas: [{ id: 'x' }], visitas: [{ id: 'v' }], presupuestos: [{ id: 'q', created_at: '2026-10-01', enviado_cliente_at: '2026-10-02', respuesta_cliente: 'pendiente' }] };
comprueba('enviado: espera respuesta', caminoCliente(enviado)[4].estado === 'hecho' && caminoCliente(enviado)[5].estado === 'ahora');
var aceptado = { id: 'k5', nombre: 'E', citas: [], visitas: [], presupuestos: [{ id: 'q', created_at: '2026-10-01', enviado_cliente_at: '2026-10-02', respuesta_cliente: 'aceptado', obra_id: 'o1' }] };
comprueba('aceptado con obra: todo hecho', caminoCliente(aceptado).every(function (x) { return x.estado === 'hecho' || x.estado === 'saltado'; }));
var rechazado = { id: 'k6', nombre: 'F', citas: [], visitas: [], presupuestos: [{ id: 'q', created_at: '2026-10-01', enviado_cliente_at: '2026-10-02', respuesta_cliente: 'rechazado' }] };
comprueba('rechazado: se para en la respuesta y la obra no queda pendiente', caminoCliente(rechazado)[5].estado === 'parado' && caminoCliente(rechazado)[6].estado === 'pendiente' && !caminoCliente(rechazado).some(function (x) { return x.estado === 'ahora'; }));
var aplazado = { id: 'k7', nombre: 'G', contacto_estado: 'contactado', aplazado_hasta: '2099-01-15', citas: [], visitas: [] };
comprueba('aplazado: el paso que tocaba se marca parado y dice Aplazado', caminoCliente(aplazado)[1].estado === 'parado' && caminoCliente(aplazado)[1].titulo === 'Aplazado');
comprueba('sin cita resuelto cuenta la cita como hecha', caminoCliente({ id: 'k8', nombre: 'H', sin_cita_motivo: 'ya tiene obra', citas: [], visitas: [] })[1].estado === 'hecho');
var html = caminoHTML(conPresu);
comprueba('se pinta con los siete pasos', (html.match(/class="p /g) || []).length === 7 && html.indexOf('Presup.') >= 0);
V.bitacora['k2'] = [{ tipo: 'llamada', texto: 'Pide que le llamemos mañana', at: '2026-10-07T10:00:00Z', por: null }];
var res = seguimientoResumenHTML({ id: 'k2', nombre: 'B', proxima_accion: 'Llamar', proxima_accion_at: '2026-10-08', citas: [], visitas: [] });
comprueba('el resumen lleva la próxima acción y lo último que se habló', res.indexOf('→ Llamar') >= 0 && res.indexOf('Pide que le llamemos') >= 0);
igual('sin nada que contar, nada', seguimientoResumenHTML({ id: 'k9', citas: [], visitas: [] }), '');
V.bitacora['k10'] = [{ tipo: 'nota', texto: 'Sysefen: Lead Meta Ads – Formulario FV_BATERIA: ¿Eres propietario? Sí…', at: '2026-10-07T12:00:00Z' }, { tipo: 'llamada', texto: 'Llamar el jueves', at: '2026-10-07T10:00:00Z' }];
igual('el formulario de la web no cuenta como última nota', ultimaNota({ id: 'k10', motivo_web: 'Sysefen: Lead Meta Ads – Formulario FV_BATERIA: ¿Eres propietario? Sí…' }).texto, 'Llamar el jueves');

resultado();
