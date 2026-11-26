/* El aviso de vencimiento al cliente, con preguntas (Enzo, 26-11-2026): «quiero
 * que se pregunte si es necesaria una segunda visita para solventar dudas y si
 * sigue considerando seguir adelante con la instalación, sea de lo que sea, y
 * siempre tener en cuenta los idiomas». Y: «en el primer cuadrante verde, en vez
 * de ver y aceptar, que solo sea ver presu». El correo va en el idioma del
 * presupuesto con cuatro respuestas de un toque; la respuesta se confirma en la
 * página del cliente y llega a la Agenda. */
var fnA = read(RUTA_TMP + '/recordatorio-citas.ts');
var bloque = fnA.slice(fnA.indexOf('  const AVISO_TXT'), fnA.indexOf('  // deno-lint-ignore no-explicit-any\n  const avisarClienteVencimiento'));
// Se le quitan los tipos a mano: es JavaScript plano con cuatro anotaciones.
bloque = bloque.replace(/: Record<string, Record<string, string>>/, '').replace(/\(s: unknown\)/, '(s)').replace(/ as string\)\);/, '));').replace(/\(p: any, nombre: string, sePuedeResponder: boolean\)/, '(p, nombre, sePuedeResponder)')
  .replace(/\(s: string, v: Record<string, string>\)/, '(s, v)').replace(/const botones: \[string, string, string\]\[\] =/, 'const botones =').replace(/\/\/ deno-lint-ignore no-explicit-any\n/g, '');
var hacer = new Function('ZONA', 'TEL', 'LOGO_URL', 'enlaceFirma', 'correoOficina', bloque + '\n return { AVISO_TXT: AVISO_TXT, correo: correoAvisoVencimiento };');
var enlaceF = function (t) { return 'https://firma.sysefen.es/?t=' + t; };
var AV = hacer('Europe/Madrid', '+34 600 000 000', 'https://x/logo.png', enlaceF, '');
var AVof = hacer('Europe/Madrid', '+34 600 000 000', 'https://x/logo.png', enlaceF, 'oficina@ejemplo.es');
var PV = function (extra) { var p = { id: 'p1', titulo: 'Paneles solares · Fronius · 5,1 kWp', categoria: 'solar', tl_numero: '912', token_cliente: 'tok123', vence: '2026-12-03', idioma_cliente: 'es' }; for (var k in extra) p[k] = extra[k]; return p; };

titulo('el correo en español');
var m = AV.correo(PV(), 'Marta');
igual('el asunto, con el número y la fecha', m.asunto, 'Su presupuesto de Sysefen nº 912: validez hasta el 3 de diciembre de 2026');
comprueba('recuerda la validez', m.texto.indexOf('le recordamos que el presupuesto «Paneles solares · Fronius · 5,1 kWp» (nº 912) tiene validez hasta el 3 de diciembre de 2026.') > -1);
comprueba('pregunta si sigue adelante, con el tipo de instalación', m.texto.indexOf('1. ¿Sigue pensando en seguir adelante con la instalación de paneles solares?') > -1);
comprueba('y si le vendría bien una segunda visita', m.texto.indexOf('2. ¿Le vendría bien una segunda visita para resolver dudas?') > -1);
var botones = m.html.split('<a href="').slice(1).map(function (x) { return x.slice(0, x.indexOf('"')) + ' | ' + x.slice(x.indexOf('>') + 1, x.indexOf('</a>')); });
igual('cuatro botones, y el verde dice solo «Ver el presupuesto»', botones.join(' ## '),
  'https://firma.sysefen.es/?t=tok123 | Ver el presupuesto ## https://firma.sysefen.es/?t=tok123&amp;r=visita | Quiero una segunda visita ## https://firma.sysefen.es/?t=tok123&amp;r=tiempo | Sigo interesado, necesito más tiempo ## https://firma.sysefen.es/?t=tok123&amp;r=no | No voy a seguir adelante');
comprueba('ya no dice «aceptar» en ningún botón', m.html.indexOf('Ver y aceptar') < 0);
comprueba('en texto plano van también los cuatro enlaces', m.texto.indexOf('· Ver el presupuesto: https://firma.sysefen.es/?t=tok123\n') > -1 && m.texto.indexOf('&r=visita') > -1 && m.texto.indexOf('&r=tiempo') > -1 && m.texto.indexOf('&r=no') > -1);
comprueba('si no hay a quién responder (sale de noreply) no invita a contestar al correo: da el teléfono', m.texto.indexOf('responder a este correo') < 0 && m.texto.indexOf('llámenos al +34 600 000 000') > -1);
comprueba('si hay a quién responder, sí invita', AV.correo(PV(), 'Marta', true).texto.indexOf('También puede responder a este correo') > -1 && AV.correo(PV(), 'Marta', true).texto.indexOf('llámenos') < 0);
comprueba('la respuesta al correo va a la oficina y, si no está puesta, a quien envió el presupuesto', fnA.indexOf('let responderA = correoOficina;') > 0 && fnA.indexOf("if (!responderA && p.enviado_cliente_por)") > 0 && fnA.indexOf("responderA ? { reply_to: responderA } : {}") > 0 && fnA.indexOf('idioma_cliente, enviado_cliente_por, cliente:clientes_cache') > 0);
comprueba('avisa de que pasada la fecha pueden cambiar los precios', m.texto.indexOf('los precios pueden cambiar') > -1);

titulo('sea de lo que sea');
var q1 = function (cat, idi) { var x = AV.correo(PV({ categoria: cat, idioma_cliente: idi || 'es' }), 'Marta').texto; var i = x.indexOf('1. '); return x.slice(i + 3, x.indexOf('\n', i)); };
igual('aerotermia', q1('aerotermia'), '¿Sigue pensando en seguir adelante con la instalación de aerotermia?');
igual('aire acondicionado', q1('aire_acondicionado'), '¿Sigue pensando en seguir adelante con la instalación de aire acondicionado?');
igual('electricidad', q1('electricidad'), '¿Sigue pensando en seguir adelante con la instalación eléctrica?');
igual('otro, o una categoría que no esté', q1('otro') + ' / ' + q1('lo_que_sea'), '¿Sigue pensando en seguir adelante con el trabajo presupuestado? / ¿Sigue pensando en seguir adelante con el trabajo presupuestado?');

titulo('en el idioma en que se envió el presupuesto');
var claves = Object.keys(AV.AVISO_TXT.es);
comprueba('los cuatro idiomas tienen todos los textos', ['en', 'ca', 'de'].every(function (i) { return claves.every(function (k) { return typeof AV.AVISO_TXT[i][k] === 'string' && AV.AVISO_TXT[i][k].length > 0; }) && Object.keys(AV.AVISO_TXT[i]).length === claves.length; }));
var en = AV.correo(PV({ idioma_cliente: 'en' }), 'Marta'), ca = AV.correo(PV({ idioma_cliente: 'ca' }), 'Marta'), de = AV.correo(PV({ idioma_cliente: 'de' }), 'Marta');
igual('inglés: asunto', en.asunto, 'Your Sysefen quote no. 912: valid until 3 December 2026');
comprueba('inglés: las dos preguntas y el botón de ver', en.texto.indexOf('Are you still considering going ahead with the solar panel installation?') > -1 && en.texto.indexOf('Would a second visit help to clear up any questions?') > -1 && en.html.indexOf('>View the quote</a>') > -1);
comprueba('catalán: las dos preguntas y el botón de ver', ca.asunto.indexOf('El seu pressupost de Sysefen núm. 912: validesa fins al 3 de desembre') === 0 && ca.texto.indexOf('Encara té previst tirar endavant amb la instal·lació de plaques solars?') > -1 && ca.texto.indexOf('Li aniria bé una segona visita per resoldre dubtes?') > -1 && ca.html.indexOf('>Veure el pressupost</a>') > -1);
comprueba('alemán: las dos preguntas y el botón de ver', de.asunto === 'Ihr Angebot von Sysefen Nr. 912: gültig bis 3. Dezember 2026' && de.texto.indexOf('Möchten Sie die Installation der Photovoltaikanlage weiterhin umsetzen?') > -1 && de.texto.indexOf('Würde Ihnen ein zweiter Besuch helfen, offene Fragen zu klären?') > -1 && de.html.indexOf('>Angebot ansehen</a>') > -1);
comprueba('un idioma que no esté, o ninguno: en español', AV.correo(PV({ idioma_cliente: 'fr' }), 'Marta').idioma === 'es' && AV.correo(PV({ idioma_cliente: null }), 'Marta').idioma === 'es');
comprueba('los enlaces son los mismos en todos los idiomas', [en, ca, de].every(function (x) { return x.html.indexOf('?t=tok123&amp;r=visita') > -1 && x.html.indexOf('&amp;r=tiempo') > -1 && x.html.indexOf('&amp;r=no') > -1; }));

titulo('sin enlace (enviado por otro lado) y con caracteres raros');
var sin = AV.correo(PV({ token_cliente: null }), 'Marta');
comprueba('sin enlace no hay botones, pero sí las preguntas y cómo contactar', sin.html.indexOf('<a href') < 0 && sin.texto.indexOf('1. ¿Sigue') > -1 && sin.texto.indexOf('llámenos') > -1 && sin.texto.indexOf('con un toque') < 0);
comprueba('el título y el nombre van escapados en el HTML', AV.correo(PV({ titulo: 'Aire <b>x</b> & más' }), 'Ana <script>').html.indexOf('<script>') < 0 && AV.correo(PV({ titulo: 'Aire <b>x</b> & más' }), 'Ana').html.indexOf('Aire &lt;b&gt;x&lt;/b&gt; &amp; más') > -1);
comprueba('la función lee el idioma del presupuesto y manda un correo por presupuesto', fnA.indexOf("token_cliente, idioma_cliente, enviado_cliente_por, cliente:clientes_cache") > 0 && fnA.indexOf('const m = correoAvisoVencimiento(p, nombre, !!responderA);') > 0);

titulo('la página del cliente contesta');
var pagA = read(RUTA_TMP + '/firmar.html'), fnP = read(RUTA_TMP + '/presupuesto-cliente.ts');
comprueba('las dos copias de la página son iguales', pagA === read(RUTA_TMP + '/sitio-firma.html'));
var CLAVES_PAG = ['vis_btn', 'vis_tit', 'vis_como', 'vis_ph', 'vis_enviar', 'vis_hecho', 'tmp_btn', 'tmp_tit', 'tmp_como', 'tmp_ph', 'tmp_enviar', 'tmp_hecho'];
comprueba('los textos nuevos están en los cuatro idiomas', CLAVES_PAG.every(function (k) { return pagA.split(' ' + k + ": '").length - 1 === 4; }));
comprueba('la página ofrece las cuatro respuestas', ['b-vis', 'b-tmp', 'b-mod', 'b-rech'].every(function (id) { return pagA.indexOf('id="' + id + '"') > 0 && pagA.indexOf("getElementById('" + id + "').addEventListener") > 0; }));
comprueba('viniendo del correo abre ya la respuesta, sin enviarla', pagA.indexOf("get('r')") > 0 && pagA.indexOf("if (rq === 'visita' || rq === 'tiempo') abrirResp(rq); else if (rq === 'no') abrirResp('rechazo');") > 0);
comprueba('solo se envía al pulsar el botón de confirmar', pagA.split("accion: 'responder'").length - 1 === 1 && pagA.indexOf("getElementById('r-ok').addEventListener('click'") < pagA.indexOf("accion: 'responder'"));
comprueba('tras pedir visita o tiempo puede seguir aceptando', pagA.indexOf("if (!rech) {") > 0);
comprueba('la función admite las cuatro respuestas', fnP.indexOf("['rechazo', 'modificacion', 'visita', 'tiempo'].includes(String(b.tipo))") > 0);
comprueba('visita y tiempo no cambian la respuesta del presupuesto: solo el rechazo', fnP.indexOf("if (tipo === 'rechazo') { cambios.respuesta_cliente = 'rechazado';") > 0);
comprueba('la misma petición repetida sin ver no manda otro aviso', fnP.indexOf("(tipo === 'visita' || tipo === 'tiempo') && p.comentario_cliente_tipo === tipo && p.comentario_cliente_at && !p.comentario_visto_at") > 0);
comprueba('se apunta en la ficha del cliente con su texto', fnP.indexOf('PIDE UNA SEGUNDA VISITA') > 0 && fnP.indexOf('SIGUE INTERESADO y pide más tiempo') > 0);

titulo('el correo con el que se envía el presupuesto: sin texto predeterminado (Enzo, 26-11-2026)');
var cuerpo = fnP.slice(fnP.indexOf('const cuerpoHtml = `'), fnP.indexOf('await mandar(RESEND, Object.assign({ to: [para], subject: asunto'));
comprueba('el cuerpo ya no lleva el saludo ni «le enviamos el presupuesto»', cuerpo.indexOf('esc(saludo)') < 0 && cuerpo.indexOf('${saludo}') < 0 && cuerpo.indexOf('intro') < 0 && cuerpo.indexOf('T.hola') < 0 && fnP.indexOf('const saludo = rellena(T.hola') < 0);
comprueba('empieza por el mensaje que escribe la persona, tal cual', cuerpo.indexOf('const cuerpoHtml = `${mensaje ? `<div style="white-space:pre-wrap') === 0 && cuerpo.indexOf("const cuerpoTxt = `${mensaje ? mensaje + '\\n\\n' : ''}${textos.join(") > 0);
comprueba('y siguen el presupuesto con su botón, el pie y la firma', cuerpo.indexOf('${tarjetas.join(\'\')}') > 0 && cuerpo.indexOf('T.pie') > 0 && cuerpo.indexOf('T.saludo') > 0);

titulo('en la app');
setTimeout(function () {
  var app = nodo();
  document.querySelector = function (q) { return q === '#app' ? app : nodo(); };
  S.users = [{ id: 'u9', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }]; V.user = { id: 'u9' };
  var B = { id: 'p1', categoria: 'solar', estado: 'enviado', created_at: '2026-11-01T10:00:00Z', total_venta: 5000, tl_numero: '912', revisado_at: '2026-11-02T10:00:00Z', enviado_cliente_at: '2026-11-03T10:00:00Z', respuesta_cliente: 'pendiente',
    comentario_cliente: 'Los martes por la tarde', comentario_cliente_at: '2026-11-25T10:00:00Z', comentario_visto_at: null, cliente_id: 'c1', cliente: { id: 'c1', nombre: 'Marta Pons' }, lineas: [] };
  var con = function (extra) { return Object.assign({}, B, extra); };
  igual('pide una segunda visita: sigue esperando, pero nos toca', seguimientoPresu(con({ comentario_cliente_tipo: 'visita' })).k + '|' + seguimientoPresu(con({ comentario_cliente_tipo: 'visita' })).txt, 'esperando|El cliente pide una segunda visita');
  igual('pide más tiempo', seguimientoPresu(con({ comentario_cliente_tipo: 'tiempo' })).txt, 'El cliente pide más tiempo');
  igual('pedir cambios, como antes', seguimientoPresu(con({ comentario_cliente_tipo: 'modificacion' })).txt, 'El cliente pide cambios');
  comprueba('ya visto, vuelve a «enviado · esperando»', seguimientoPresu(con({ comentario_cliente_tipo: 'visita', comentario_visto_at: '2026-11-26T10:00:00Z' })).txt.indexOf('Enviado al cliente') === 0);
  V.agenda.clientes = [{ id: 'c1', nombre: 'Marta Pons', citas: [], visitas: [], presupuestos: [con({ comentario_cliente_tipo: 'visita' })] }]; V.agenda.cargado = true;
  var hA = comentariosClientesHTML();
  comprueba('en la Agenda sale con lo que pide y lo que escribió', hA.indexOf('Pide una segunda visita') > -1 && hA.indexOf('Los martes por la tarde') > -1 && hA.indexOf('Marta Pons') > -1);
  V.agenda.clientes[0].presupuestos = [con({ comentario_cliente_tipo: 'tiempo', comentario_cliente: '' })];
  comprueba('y el de más tiempo, aunque no escriba nada', comentariosClientesHTML().indexOf('Sigue interesado · pide más tiempo') > -1 && comentariosClientesHTML().indexOf('No ha escrito ningún comentario') > -1);
  var hV = comentarioClienteHTML(con({ comentario_cliente_tipo: 'visita' })), hT = comentarioClienteHTML(con({ comentario_cliente_tipo: 'tiempo' })), hM = comentarioClienteHTML(con({ comentario_cliente_tipo: 'modificacion' }));
  comprueba('ficha · segunda visita: botón de agendar con su cliente, y «Ya está visto»', hV.indexOf('El cliente pide una segunda visita') > -1 && hV.indexOf('data-a="ag_nuevaCita" data-id="c1"') > -1 && hV.indexOf('presuComentarioVisto') > -1 && hV.indexOf('presuEditar') < 0);
  comprueba('ficha · más tiempo: botón de prorrogar', hT.indexOf('sigue interesado y pide más tiempo') > -1 && hT.indexOf('data-a="presuProrrogar"') > -1 && hT.indexOf('presuEditar') < 0);
  comprueba('ficha · cambios: como antes, modificar', hM.indexOf('data-a="presuEditar"') > -1 && hM.indexOf('ag_nuevaCita') < 0 && hM.indexOf('presuProrrogar') < 0);
  var guardadoA = null;
  visitasDB = { seguimientoPresupuesto: function (id, c) { guardadoA = c; return Promise.resolve(Object.assign({ id: id }, c)); } };
  anotar = function () {};
  V.presuVer = { datos: con({ comentario_cliente_tipo: 'tiempo', validez_dias: 15, prorroga_dias: 0 }) }; V.presuSegBusy = false;
  A.presuProrrogar().then(function () {
    comprueba('al dar la prórroga, el «necesito más tiempo» queda visto', guardadoA.prorroga_dias === 15 && !!guardadoA.comentario_visto_at);
    V.presuVer = { datos: con({ comentario_cliente_tipo: 'visita', validez_dias: 15, prorroga_dias: 0 }) };
    return A.presuProrrogar();
  }).then(function () {
    comprueba('una prórroga no da por vista una petición de visita', guardadoA.prorroga_dias === 15 && !('comentario_visto_at' in guardadoA));
    V.sheet = { tipo: 'presuAvisoVenc', id: 'p1', nombre: 'Marta Pons', vence: '2026-12-03', otraVez: false, busy: false };
    comprueba('antes de enviarlo, la app cuenta lo que pregunta el correo', sheet().indexOf('si sigue pensando en seguir adelante') > -1 && sheet().indexOf('segunda visita') > -1);
    // Enviar el presupuesto: sin mensaje no se sigue, porque el correo ya no trae texto fijo.
    V.presuVer = { datos: con({}) };
    V.sheet = { tipo: 'presuEnviar', id: 'p1', ids: ['p1'], otros: [], v: { para: 'marta@ejemplo.es', cc: '', asunto: '', mensaje: '   ', idioma: 'es' }, confirmar: false, busy: false, paso: '', trad: null };
    comprueba('la hoja de envío dice que el correo empieza por lo que se escriba', sheet().indexOf('ya no lleva «Hola') > -1 && sheet().indexOf('empezando por el saludo') > -1);
    var avisos = []; avisar = function (m) { avisos.push(m); };
    return A.presuEnviarRevisar().then(function () {
      comprueba('sin mensaje no pasa a confirmar y dice por qué', V.sheet.confirmar === false && avisos.length === 1 && avisos[0].indexOf('Escribe el mensaje') === 0);
      V.sheet.v.mensaje = 'Hola Marta, te paso el presupuesto de las placas.';
      return A.presuEnviarRevisar();
    }).then(function () {
      comprueba('con mensaje, sigue a la confirmación', V.sheet.confirmar === true && avisos.length === 1);
      V.sheet = null;
      resultado();
    });
  }).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); print('Exception: ' + e); });
}, 2300);
