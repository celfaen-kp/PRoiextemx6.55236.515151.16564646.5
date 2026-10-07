/* Seguimiento del presupuesto (sql/etapa64): en qué punto está cada uno y
 * cuál manda para el estado del cliente. */

igual('recién creado', seguimientoPresu({ estado: 'generado' }).txt, 'Hecho · pendiente de revisar');
igual('con incidencias', seguimientoPresu({ estado: 'revisar' }).txt, 'Pendiente de revisar · sin subir');
igual('subido, sin revisar', seguimientoPresu({ estado: 'generado', tl_quotation_id: 'q1' }).txt, 'En Teamleader · pendiente de revisar');
igual('revisado, por enviar', seguimientoPresu({ estado: 'aprobado', tl_quotation_id: 'q1', revisado_at: '2026-10-01' }).txt, 'Revisado · por enviar al cliente');
igual('enviado al cliente', seguimientoPresu({ estado: 'enviado', tl_quotation_id: 'q1', enviado_cliente_at: '2026-10-01' }).k, 'esperando');
igual('aceptado manda sobre todo', seguimientoPresu({ estado: 'generado', respuesta_cliente: 'aceptado' }).k, 'aceptado');
igual('rechazado', seguimientoPresu({ respuesta_cliente: 'rechazado' }).color, 'var(--rojo)');
igual('caducado cuenta como rechazado', seguimientoPresu({ respuesta_cliente: 'caducado' }).k, 'rechazado');

var c = {
  presupuestos: [{ id: 'a', created_at: '2026-09-01', estado: 'generado', respuesta_cliente: 'rechazado' }],
  visitas: [{ id: 'v1', presupuestos: [{ id: 'b', created_at: '2026-09-10', estado: 'enviado', enviado_cliente_at: '2026-09-11', respuesta_cliente: 'pendiente' }] }],
};
igual('junta los directos y los de las visitas', presupuestosDeCliente(c).map((p) => p.id).join(','), 'b,a');
igual('manda el vivo más avanzado, no el rechazado', presuQueManda(c).id, 'b');
igual('estado del cliente: esperando', agEstadoCliente(Object.assign({ citas: [] }, c)).k, 'esperando');
c.visitas[0].presupuestos[0].respuesta_cliente = 'aceptado';
igual('aceptado manda', agEstadoCliente(Object.assign({ citas: [] }, c)).txt, 'Presupuesto · aceptado');
igual('sin presupuestos: visitado, aunque esté en Teamleader', agEstadoCliente({ citas: [], visitas: [{ id: 'v', sync_estado: 'sincronizada' }] }).txt, 'Visitado · por presupuestar');
igual('duplicados por id no se repiten', presupuestosDeCliente({ presupuestos: [{ id: 'x', created_at: '1' }], visitas: [{ presupuestos: [{ id: 'x', created_at: '1' }] }] }).length, 1);

resultado();
