/* El cliente pide cambios o rechaza desde la página del presupuesto, y «Guardar
 * como presupuesto nuevo» (Enzo, 24-11-2026: «ahora solo se puede aceptar…
 * debería haber un botón de rechazar y otro de solicitar modificaciones y pueda
 * escribir un comentario, que nos llegue el aviso… y que salte una notificación
 * en la pantalla principal»; y «a veces quiero modificar un presupuesto pero no
 * sobre el otro sino crear nuevo… me tocó hacerlo en uno ya enviado y no quería
 * modificarlo para perder el anterior»). */
S.users = [{ id: 'u5', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }]; V.user = { id: 'u5' };
var enviado = { id: 'p1', categoria: 'solar', estado: 'enviado', enviado_cliente_at: '2026-11-20T10:00:00Z', respuesta_cliente: 'pendiente', total_venta: 7603.42, tl_numero: '895', created_at: '2026-11-19' };
var conCambios = Object.assign({}, enviado, { comentario_cliente: 'Quiero la batería de 10 kWh\ny quitar el cargador <b>', comentario_cliente_tipo: 'modificacion', comentario_cliente_at: '2026-11-24T09:30:00Z' });

titulo('el estado del presupuesto');
igual('enviado, sin comentario: esperando', seguimientoPresu(enviado).txt, 'Enviado al cliente · esperando');
igual('pide cambios', seguimientoPresu(conCambios).txt, 'El cliente pide cambios');
igual('sigue contando como esperando respuesta', seguimientoPresu(conCambios).k, 'esperando');
igual('y en rojo: nos toca a nosotros', seguimientoPresu(conCambios).color, 'var(--rojo)');
igual('una vez visto, vuelve a esperando', seguimientoPresu(Object.assign({}, conCambios, { comentario_visto_at: '2026-11-24T10:00:00Z' })).txt, 'Enviado al cliente · esperando');
igual('si después aceptó, manda el aceptado', seguimientoPresu(Object.assign({}, conCambios, { respuesta_cliente: 'aceptado' })).k, 'aceptado');
var rechazado = Object.assign({}, enviado, { id: 'p2', tl_numero: '896', respuesta_cliente: 'rechazado', comentario_cliente: '', comentario_cliente_tipo: 'rechazo', comentario_cliente_at: '2026-11-24T11:00:00Z' });
igual('rechazado desde la página: rechazado', seguimientoPresu(rechazado).txt, 'Rechazado');
comprueba('el rechazo también queda pendiente de ver', comentarioPendiente(rechazado) && !pideCambios(rechazado));
igual('el cliente, en la lista', agEstadoCliente({ citas: [], visitas: [], presupuestos: [conCambios] }).txt, 'Presupuesto · el cliente pide cambios');

titulo('la pantalla principal');
V.agenda.clientes = [
  { id: 'c1', nombre: 'Ana Riera', citas: [], visitas: [{ id: 'v1', presupuestos: [conCambios] }], presupuestos: [conCambios] },
  { id: 'c2', nombre: 'Biel Mas', citas: [], visitas: [], presupuestos: [rechazado] },
  { id: 'c3', nombre: 'Sin nada', citas: [], visitas: [], presupuestos: [enviado] },
];
V.agenda.cargado = true; V.agenda.citas = []; V.agenda.dia = null;
var pend = comentariosPendientes();
igual('dos comentarios sin ver, sin repetir el que llega por la visita y por el cliente', pend.length, 2);
igual('el más nuevo arriba', pend.map(function (x) { return x.c.nombre; }).join(','), 'Biel Mas,Ana Riera');
var h = comentariosClientesHTML();
comprueba('con su título', h.indexOf('Comentarios de presupuestos') >= 0);
comprueba('quién, qué presupuesto y cuánto', h.indexOf('Ana Riera') >= 0 && h.indexOf('Presupuesto nº 895') >= 0 && h.indexOf(eur(7603.42)) >= 0);
comprueba('lo que escribió, sin que su texto se cuele como HTML', h.indexOf('«Quiero la batería de 10 kWh') >= 0 && h.indexOf('&lt;b&gt;') >= 0 && h.indexOf('cargador <b>') < 0);
comprueba('el rechazo, distinto', h.indexOf('Ha rechazado el presupuesto') >= 0 && h.indexOf('No ha escrito ningún comentario.') >= 0);
comprueba('cada uno abre su presupuesto', h.indexOf('data-a="presuAbrir" data-id="p1"') >= 0 && h.indexOf('data-a="presuAbrir" data-id="p2"') >= 0);
V.view = 'agenda';
var ag = vAgenda();
comprueba('sale en la agenda, antes de la próxima cita', ag.indexOf('Comentarios de presupuestos') >= 0 && ag.indexOf('Comentarios de presupuestos') < ag.indexOf('Sin citas próximas'));
comprueba('y cuenta en los pendientes de la cabecera', ag.indexOf('2 pendientes') >= 0);
var avisos = [], toastDeVerdad = toast; toast = function (m) { avisos.push(m); };
localStorage.removeItem(KEY_COMENTARIOS);
avisarComentariosNuevos();
igual('al cargar, un aviso', avisos.join('|'), '2 comentarios nuevos de clientes en sus presupuestos.');
avisarComentariosNuevos();
igual('que no se repite en este aparato', avisos.length, 1);
V.agenda.clientes[1].presupuestos[0] = Object.assign({}, rechazado, { comentario_cliente_at: '2026-11-25T08:00:00Z' });
avisarComentariosNuevos();
igual('otro comentario del mismo presupuesto sí avisa', avisos[1], 'Biel Mas ha rechazado su presupuesto.');
agPresuActualizar('p1', { comentario_visto_at: '2026-11-24T12:00:00Z' });
igual('al darlo por visto, sale de la lista', comentariosPendientes().map(function (x) { return x.p.id; }).join(','), 'p2');
comprueba('también en la copia que viene por la visita', !!V.agenda.clientes[0].visitas[0].presupuestos[0].comentario_visto_at);
V.agenda.clientes.forEach(function (c) { c.presupuestos.forEach(function (p) { p.comentario_visto_at = '2026-11-25T09:00:00Z'; }); });
igual('sin comentarios, no hay bloque', comentariosClientesHTML(), '');
toast = toastDeVerdad;

titulo('la ficha del presupuesto');
V.presuLista.filas = []; V.presuSegBusy = false;
var f = seguimientoHTML(Object.assign({ lineas: [] }, conCambios, { comentario_visto_at: null }));
comprueba('enseña lo que pide', f.indexOf('✎ El cliente pide cambios') >= 0 && f.indexOf('Quiero la batería de 10 kWh') >= 0);
comprueba('con «Modificar el presupuesto» y «Ya está visto»', f.indexOf('data-a="presuEditar"') >= 0 && f.indexOf('data-a="presuComentarioVisto"') >= 0);
comprueba('y en los pasos, la respuesta', f.indexOf('pide cambios · ') >= 0);
var fv = seguimientoHTML(Object.assign({ lineas: [] }, conCambios, { comentario_visto_at: '2026-11-24T12:00:00Z', comentario_visto_por: 'u5' }));
comprueba('visto: se queda el comentario, sin botones', fv.indexOf('Quiero la batería de 10 kWh') >= 0 && fv.indexOf('presuComentarioVisto') < 0 && fv.indexOf(' · visto') >= 0);
var fr = seguimientoHTML(Object.assign({ lineas: [] }, rechazado, { comentario_cliente: 'Lo hago con otra empresa', comentario_visto_at: null }));
comprueba('rechazo: el motivo y solo «Ya está visto»', fr.indexOf('✗ El cliente lo rechazó desde su página') >= 0 && fr.indexOf('Lo hago con otra empresa') >= 0 && fr.indexOf('data-a="presuEditar"') < 0 && fr.indexOf('presuComentarioVisto') >= 0);
igual('sin comentario, nada', comentarioClienteHTML(enviado), '');

titulo('guardar como presupuesto nuevo');
var src = read(RUTA_TMP + '/visitas-db.js');
eval(/function mapaLineasCopia[\s\S]*?\n}\n/.exec(src)[0]);
var orig = [{ id: 'a', orden: 1, descripcion: 'Batería', producto_ref: 'B1' }, { id: 'b', orden: 2, descripcion: 'Instalación', producto_ref: null }, { id: 'c', orden: 2, descripcion: 'Instalación', producto_ref: null }];
var hechas = [{ id: 'A', orden: 1, descripcion: 'Batería', producto_ref: 'B1' }, { id: 'B', orden: 2, descripcion: 'Instalación', producto_ref: null }, { id: 'C', orden: 2, descripcion: 'Instalación', producto_ref: null }];
igual('cada línea con la suya, también dos iguales', JSON.stringify(mapaLineasCopia(orig, hechas)), '{"a":"A","b":"B","c":"C"}');
igual('aunque la base las devuelva en otro orden', JSON.stringify(mapaLineasCopia(orig, [hechas[2], hechas[0], hechas[1]])), '{"a":"A","b":"C","c":"B"}');
igual('una que no aparece no se inventa', JSON.stringify(mapaLineasCopia(orig, [hechas[0]])), '{"a":"A"}');
var e = edicionALaCopia({ quitadas: ['b', 'zz'], cambios: { a: { cantidad: '3' }, c: { precio_tarifa: '10' }, zz: { cantidad: '1' } }, nuevas: [{ descripcion: 'Nueva' }], dto: 5 }, { a: 'A', b: 'B', c: 'C' });
igual('lo quitado pasa a la copia', e.quitadas.join(','), 'B');
igual('lo cambiado, también', JSON.stringify(e.cambios), '{"A":{"cantidad":"3"},"C":{"precio_tarifa":"10"}}');
comprueba('las líneas nuevas y el descuento siguen', e.nuevas.length === 1 && e.dto === 5);
comprueba('la copia apunta al original y no lleva visita ni oferta', src.indexOf('if (copia_de) fila.copia_de = copia_de;') > 0 && src.indexOf("visita_id: null, ficha_id: null, estado: 'generado', sync_estado: 'pendiente'") > 0);
comprueba('no copia el número, el envío ni la respuesta del cliente', !/copia\(d, \[[^\]]*(tl_numero|token_cliente|enviado_|respuesta_cliente|firma|comentario_)/.test(src));
V.presuVer = { datos: Object.assign({ lineas: [{ id: 'a', orden: 1, descripcion: 'Batería', cantidad: 1, unidad: 'ud', precio_tarifa: 100, precio_venta: 100 }] }, enviado) };
A.presuEditar();
var ed = presuLineasEditHTML(V.presuVer.datos);
comprueba('al modificar, los dos botones', ed.indexOf('data-a="presuGuardarCambios"') >= 0 && ed.indexOf('data-a="presuGuardarNuevo"') >= 0 && ed.indexOf('Guardar como presupuesto nuevo') >= 0);
comprueba('y avisa de que ya se le envió al cliente', ed.indexOf('Este presupuesto ya se le envió al cliente.') >= 0);
V.presuVer.datos.enviado_cliente_at = null;
comprueba('en uno sin enviar no avisa', presuLineasEditHTML(V.presuVer.datos).indexOf('ya se le envió al cliente') < 0);
V.presuEdit = null;
V.presuLista.filas = [{ id: 'p1', tl_numero: '895' }, { id: 'p9', tl_numero: null, copia_de: 'p1' }];
comprueba('el nuevo dice de cuál sale', copiaDeHTML({ id: 'p9', copia_de: 'p1' }).indexOf('Sale de otro presupuesto (nº 895)') >= 0);
comprueba('y el original, cuál salió de él', copiaDeHTML({ id: 'p1' }).indexOf('De este salió otro presupuesto') >= 0 && copiaDeHTML({ id: 'p1' }).indexOf('data-id="p9"') >= 0);
igual('sin copias, nada', copiaDeHTML({ id: 'p7' }), '');
var app = read(RUTA_TMP + '/app.js');
comprueba('«Guardar como presupuesto nuevo» copia antes de tocar nada', app.indexOf("if (a === 'presuGuardarNuevo') return A.presuGuardarCambios(true);") > 0 && app.indexOf('await visitasDB.duplicarPresupuesto(orig.id, { cliente_id: clienteId, titulo: orig.titulo, copia_de: orig.id })') < app.indexOf('// 1 · las que se quitan'));

titulo('la página del cliente y su función');
var pag = read(RUTA_TMP + '/firmar.html'), sitio = read(RUTA_TMP + '/sitio-firma.html'), fn = read(RUTA_TMP + '/presupuesto-cliente.ts');
comprueba('firmar.html y la copia de firma.sysefen.es son la misma página', pag === sitio);
comprueba('los dos botones', pag.indexOf('id="b-mod"') > 0 && pag.indexOf('id="b-rech"') > 0);
var claves = function (idioma) { var m = new RegExp("\\n    " + idioma + ": \\{([^\\n]*)\\},\\n").exec(pag); return m[1].split(/', (?=[a-z_0-9]+: ')/).map(function (x) { return x.trim().split(':')[0]; }).sort().join(','); };
comprueba('los cuatro idiomas llevan los mismos textos', claves('es') === claves('en') && claves('es') === claves('ca') && claves('es') === claves('de') && claves('es').indexOf('mod_btn') >= 0 && claves('es').indexOf('rech_ya') >= 0);
comprueba('manda «responder» con el tipo y el comentario', pag.indexOf("accion: 'responder', t: t, tipo: tipo, comentario: texto") > 0);
comprueba('para pedir cambios hay que escribir algo; para rechazar, no', pag.indexOf('if (mod && texto.length < 5)') > 0);
comprueba('rechazado o firmado: ya no se ofrecen los botones', pag.indexOf("if (!firmado && !rechazado) h += '<div class=\"c\" id=\"aceptar\">") > 0 && pag.indexOf('if (firmado || rechazado) return;') > 0);
comprueba('la función atiende «responder»', fn.indexOf("if (b.accion === 'responder')") > 0);
comprueba('no deja sobre uno ya aceptado', fn.indexOf("if (p.firmado_at || p.respuesta_cliente === 'aceptado') return json({ error: 'Este presupuesto ya está aceptado.', codigo: 'ya_aceptado' }, 409);") > 0);
comprueba('el rechazo cambia la respuesta; pedir cambios, no', fn.indexOf("if (tipo === 'rechazo') { cambios.respuesta_cliente = 'rechazado';") > 0 && (fn.match(/respuesta_cliente = 'rechazado'/g) || []).length === 1);
comprueba('queda en la ficha del cliente', fn.indexOf("'El cliente PIDE CAMBIOS en el presupuesto'") > 0 && fn.indexOf("'El cliente RECHAZÓ el presupuesto'") > 0);
comprueba('avisa a quien se lo mandó y, si no se sabe, a presupuestos y Administración', fn.indexOf("if (p.enviado_cliente_por)") > 0 && fn.indexOf(".in('rol', ['presupuestos', 'admin']).eq('activo', true);\n          para =") > 0);
comprueba('al reenviárselo, el comentario queda visto', fn.indexOf("cambios.comentario_visto_at = ahora; cambios.comentario_visto_por = yo.id;") > 0);
comprueba('y la página deja de enseñar los cambios pedidos', fn.indexOf('String(p.enviado_correo_at) > String(p.comentario_cliente_at)') > 0);

resultado();
