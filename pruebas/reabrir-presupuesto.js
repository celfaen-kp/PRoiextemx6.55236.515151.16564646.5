/* Reabrir un presupuesto rechazado o caducado (Enzo, 26-11-2026): «a los
 * rechazados no puedo regresarlos a presupuesto por revisar… no me deja».
 * Tres cosas lo impedían: el tablero no tenía salida de «Rechazados» a «por
 * revisar», la ficha solo dejaba cambiar la respuesta si el presupuesto se había
 * enviado, y la sincronización con Teamleader lo volvía a marcar rechazado. */
setTimeout(function () {
  var app = nodo();
  document.querySelector = function (q) { return q === '#app' ? app : nodo(); };
  S.users = [{ id: 'u9', nombre: 'Fabrizio', rol: 'presupuestos', activo: true, empId: 'e9' }];
  V.user = { id: 'u9' }; V.sheet = null; empIdPorNombre['Fabrizio'] = 'e9';
  var guardados = [];
  visitasDB = {
    seguimientoPresupuesto: function (id, cambios) { guardados.push({ id: id, cambios: cambios }); return Promise.resolve(Object.assign({ id: id }, cambios)); },
    guardarCliente: function (c) { return Promise.resolve(c); },
  };
  anotar = function () {}; A.cargarAgenda = function () {};
  var P = function (extra) { return Object.assign({ id: 'p1', categoria: 'solar', estado: 'enviado', created_at: '2026-11-01T10:00:00Z', total_venta: 5000, tl_numero: '880', tl_quotation_id: 'q1',
    revisado_at: '2026-11-02T10:00:00Z', enviado_cliente_at: '2026-11-03T10:00:00Z', enviado_cliente_por: 'e9', respuesta_cliente: 'rechazado', respondido_at: '2026-11-10T10:00:00Z', motivo_rechazo: 'Precio', prorroga_dias: 15, aviso_vencimiento_at: '2026-11-15T10:00:00Z' }, extra || {}); };
  var cliente = { id: 'c1', nombre: 'Marta Pons', citas: [], visitas: [], presupuestos: [P()] };
  V.agenda.clientes = [cliente]; V.agenda.citas = []; V.agenda.cargado = true;

  titulo('qué cambia al reabrir');
  comprueba('uno rechazado o caducado se puede reabrir; uno pendiente o aceptado, no', presuCerradoSinAceptar(P()) && presuCerradoSinAceptar(P({ respuesta_cliente: 'caducado' })) && !presuCerradoSinAceptar(P({ respuesta_cliente: 'pendiente' })) && !presuCerradoSinAceptar(P({ respuesta_cliente: 'aceptado' })) && !presuCerradoSinAceptar(null));
  var c1 = cambiosReabrir(P(), false);
  igual('a «por revisar»: fuera el rechazo, la revisión y el envío', c1.respuesta_cliente + '|' + c1.respondido_at + '|' + c1.motivo_rechazo + '|' + c1.estado + '|' + c1.revisado_at + '|' + c1.enviado_cliente_at + '|' + c1.prorroga_dias + '|' + c1.aviso_vencimiento_at, 'pendiente|null|null|generado|null|null|0|null');
  comprueba('y queda apuntado cuándo y quién lo reabrió', !!c1.reabierto_at && c1.reabierto_por === 'e9');
  var c2 = cambiosReabrir(P(), true);
  comprueba('a «enviado · esperando»: solo se quita el rechazo; el envío sigue', c2.respuesta_cliente === 'pendiente' && !!c2.reabierto_at && !('enviado_cliente_at' in c2) && !('revisado_at' in c2) && !('estado' in c2));
  comprueba('el comentario con el que lo rechazó desde su página queda visto', !!cambiosReabrir(P({ comentario_cliente_at: '2026-11-10T10:00:00Z', comentario_visto_at: null }), false).comentario_visto_at && !('comentario_visto_at' in c1));
  var s0 = seguimientoPresu(P()), s1 = seguimientoPresu(Object.assign(P(), c1)), s2 = seguimientoPresu(Object.assign(P(), c2));
  igual('la fase: de rechazado a por revisar, o a esperando', s0.k + ' → ' + s1.k + ' / ' + s2.k, 'rechazado → presupuestado / esperando');

  titulo('en el tablero: de Rechazados a «por revisar»');
  igual('el cliente está en Rechazados', agEstadoCliente(cliente).k, 'rechazado');
  A.tbMoverAbrir('c1');
  var hs = sheet();
  comprueba('«Mover a otra fase» ofrece reabrir su presupuesto', hs.indexOf('data-k="presupuestado"') > -1 && hs.indexOf('Reabre su presupuesto rechazado') > -1);
  A.tbMover('c1', 'presupuestado').then(function () {
    var g = guardados[guardados.length - 1];
    comprueba('se reabre el presupuesto que manda, hacia «por revisar»', g.id === 'p1' && g.cambios.respuesta_cliente === 'pendiente' && g.cambios.enviado_cliente_at === null && !!g.cambios.reabierto_at);
    igual('y el cliente pasa a «Presupuesto por revisar o enviar»', agEstadoCliente(cliente).k, 'presupuestado');
    A.tbMoverAbrir('c1');
    comprueba('ya no es un rechazado: la hoja no ofrece reabrir', sheet().indexOf('Reabre su presupuesto') < 0);
    V.sheet = null;

    titulo('en el tablero: de Rechazados a «enviado · esperando»');
    cliente.presupuestos = [P({ respuesta_cliente: 'caducado' })];
    return A.tbMover('c1', 'esperando');
  }).then(function () {
    var g = guardados[guardados.length - 1];
    comprueba('se quita el caducado y sigue enviado', g.cambios.respuesta_cliente === 'pendiente' && !('enviado_cliente_at' in g.cambios) && agEstadoCliente(cliente).k === 'esperando');
    cliente.presupuestos = [P({ enviado_cliente_at: null, revisado_at: null, estado: 'generado' })];
    var n = guardados.length;
    return A.tbMover('c1', 'esperando').then(function () {
      comprueba('uno que no llegó a enviarse no puede ir a «esperando»: no se toca', guardados.length === n && agEstadoCliente(cliente).k === 'rechazado');
    });
  }).then(function () {
    titulo('en la ficha del presupuesto');
    var d = P({ enviado_cliente_at: null, revisado_at: null, estado: 'generado', cliente: { id: 'c1', nombre: 'Marta Pons' }, lineas: [] });
    V.presuVer = { datos: d }; V.presuSegBusy = false;
    var hf = seguimientoHTML(d);
    comprueba('rechazado sin haberse enviado: sale el botón de reabrir (antes no había salida)', hf.indexOf('data-a="presuReabrir"') > -1 && hf.indexOf('Rechazado por el cliente') > -1 && hf.indexOf('Precio') > -1);
    comprueba('y avisa de que en Teamleader la oportunidad sigue como esté', hf.indexOf('reábrela allí') > -1);
    comprueba('uno pendiente no lo enseña', seguimientoHTML(P({ respuesta_cliente: 'pendiente', cliente: { id: 'c1' }, lineas: [] })).indexOf('presuReabrir') < 0);
    return A.presuReabrir().then(function () {
      var g = guardados[guardados.length - 1];
      comprueba('reabre hacia «por revisar» y la ficha deja de enseñarlo', g.cambios.respuesta_cliente === 'pendiente' && g.cambios.estado === 'generado' && d.respuesta_cliente === 'pendiente' && seguimientoHTML(d).indexOf('presuReabrir') < 0);
      var e = P({ cliente: { id: 'c1', nombre: 'Marta Pons' }, lineas: [] });
      V.presuVer = { datos: e };
      return A.presuRespuesta('pendiente').then(function () {
        var g2 = guardados[guardados.length - 1];
        comprueba('el chip «Esperando» sobre uno rechazado también deja apuntado que se reabrió, sin tocar el envío', g2.cambios.respuesta_cliente === 'pendiente' && !!g2.cambios.reabierto_at && !('enviado_cliente_at' in g2.cambios));
        return A.presuRespuesta('rechazado');
      }).then(function () {
        var g3 = guardados[guardados.length - 1];
        comprueba('marcarlo rechazado sigue como siempre', g3.cambios.respuesta_cliente === 'rechazado' && !!g3.cambios.respondido_at && !('reabierto_at' in g3.cambios));
      });
    });
  }).then(function () { resultado(); }).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); print('Exception: ' + e); });
}, 2300);
