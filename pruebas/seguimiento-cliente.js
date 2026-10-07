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
igual('diez columnas siempre', cols.length, 10);

resultado();
