/* Cuatro cosas del 13-11-2026 (Enzo):
 *  · una nota para el cliente al final del presupuesto;
 *  · el tipo «Otro», con lo que se escriba;
 *  · el coste de un producto del catálogo desde que se añade, sin guardar antes;
 *  · al borrar un presupuesto se vuelve a donde se estaba (cliente o lista). */
S.users = [{ id: 'u0', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }];
V.user = { id: 'u0' };
V.agenda.cargado = true;   // sin base de datos detrás: que nada intente cargar la agenda
var PRESU = function (mas) { return Object.assign({ id: 'p1', categoria: 'aire_acondicionado', titulo: 'Ana · Aire', created_at: new Date().toISOString(),
  total_venta: 1000, total_coste: 600, total_bruto: 1000, total_dto_linea: 0, dto_global_pct: 0, motor_version: '1.0', incidencias: [], cliente: { id: 'c1', nombre: 'Ana Ferrer' },
  lineas: [{ id: 'l1', orden: 1, descripcion: 'Split', cantidad: 1, unidad: 'ud', precio_tarifa: 1000, precio_venta: 1000, precio_coste: 600, dto_linea_pct: 0, iva: 21 }] }, mas || {}); };

V.user = { id: 'u0' }; titulo('el tipo «Otro»');
igual('se llama Otro', nombreCat('otro'), 'Otro');
igual('con tipo escrito, manda lo escrito', nombreCatDe({ categoria: 'otro', categoria_texto: 'Cargador de coche' }), 'Cargador de coche');
igual('sin él, Otro', nombreCatDe({ categoria: 'otro', categoria_texto: '  ' }), 'Otro');
igual('en las demás, la categoría (aunque haya texto viejo)', nombreCatDe({ categoria: 'solar', categoria_texto: 'x' }), 'Paneles solares');
igual('las visitas siguen con sus cuatro fichas', vSchemas.CATEGORIAS.length, 4);
igual('la obra de un «otro» es OT', CAT_A_OBRA.otro, 'OT');
A.presuNuevo();
comprueba('el presupuesto nuevo ofrece Otro', vPresuNuevo().indexOf('data-k="cat" data-v="otro"') > -1);
A.presuSueltoChip('cat', 'otro');
comprueba('al elegirlo es libre (no hay motor)', V.suelto.libre === true && enLibre());
var hn = vPresuNuevo();
comprueba('y deja escribir de qué es', hn.indexOf('data-k="cat_texto"') > -1);
comprueba('sin hablar de reglas que faltan', hn.indexOf('Todavía no hay reglas') < 0 && hn.indexOf('Se monta línea a línea') > -1);
igual('sin tipo ni cliente, el título es Presupuesto', tituloDelSuelto(), 'Presupuesto');
A.presuSueltoCampo('cat_texto', 'Cargador de coche'); V.suelto.cliente = 'Ana';
igual('con tipo y cliente', tituloDelSuelto(), 'Cargador de coche · Ana');
A.presuSueltoChip('cat', 'solar');
comprueba('al volver a una con motor, vuelve el motor', V.suelto.libre === false);
A.presuSueltoChip('cat', 'otro');

var llamadas = [], cambios = null, catLlamada = null;
var RESP = { ok: true, categoria: 'otro', lineas: [], incidencias: [], totales: { bruto: 0, dto_linea: 0, subtotal: 0, dto_global: 0, total: 0, coste: 0, lineas_sin_coste: 0 }, dto_global_pct: 0 };
visitasDB = {
  presupuestarSuelto: function (cat, datos, o) { llamadas.push([cat, datos, o]); return Promise.resolve(Object.assign({}, RESP, o.guardar ? { presupuesto_id: 'pn' } : {})); },
  listarPresupuestos: function () { return Promise.resolve([]); },
  verPresupuesto: function () { return Promise.resolve(PRESU()); },
  enviarPresupuestoATeamleader: function () { return Promise.resolve({}); },
  coeficientesPrecios: function () { return Promise.resolve([{ categoria: 'solar', clave: 'recargo_sobre_coste', entrada: 'defecto', valor: 1.3 }, { categoria: 'solar', clave: 'costes_complementarios_pct', entrada: 'defecto', valor: 10 }]); },
};
var guardadoATL = A.presuGuardadoATL; A.presuGuardadoATL = function () {};
A.presuCalcular('otro').then(function () {
  igual('se calcula como libre de la categoría otro', llamadas[0][0] + '|' + llamadas[0][2].libre, 'otro|true');

  V.user = { id: 'u0' }; titulo('la nota para el cliente, al generar');
  var hp = vPresuNuevo();
  comprueba('hay donde escribirla antes de guardar', hp.indexOf('data-f="presuObs"') > -1 && hp.indexOf('Nota para el cliente') > -1);
  V.presu.observaciones = 'No incluye obra civil.\nPlazo: 3 semanas.'; V.presu.obsDe = presuObsContexto();
  comprueba('lo escrito se queda en la caja al repintar', vPresuNuevo().indexOf('Plazo: 3 semanas.') > -1);
  return A.presuGuardar();
}).then(function () {
  var o = llamadas[llamadas.length - 1][2];
  igual('al guardar viaja la nota', o.observaciones, 'No incluye obra civil.\nPlazo: 3 semanas.');
  igual('y el tipo escrito', o.categoriaTexto, 'Cargador de coche');
  V.presu.obsDe = 'otra-visita';
  igual('la nota de otra visita no se cuela', presuObsActual(), '');
  A.presuGuardadoATL = guardadoATL;

  V.user = { id: 'u0' }; titulo('la nota en el presupuesto guardado');
  V.presuVer = { id: 'p1', cargando: false, error: null, datos: PRESU(), idioma: 'es' }; V.presuEdit = null; V.view = 'presupuestoVer';
  var h = vPresupuestoVer();
  comprueba('sin nota, invita a añadirla', h.indexOf('+ Añadir una nota') > -1 && h.indexOf('data-a="presuObsAbrir"') > -1);
  A.presuObsAbrir();
  igual('se abre la hoja', V.sheet && V.sheet.tipo, 'presuObs');
  comprueba('con su caja de texto', sheet().indexOf('data-f="presuObsTxt"') > -1);
  visitasDB.seguimientoPresupuesto = function (id, c) { cambios = [id, c]; return Promise.resolve(Object.assign({ id: id }, c)); };
  V.sheet.texto = '  Incluye puesta en marcha.  ';
  return A.presuObsGuardar();
}).then(function () {
  igual('se guarda recortada', JSON.stringify(cambios), JSON.stringify(['p1', { observaciones: 'Incluye puesta en marcha.' }]));
  igual('la hoja se cierra', V.sheet, null);
  var h = vPresupuestoVer();
  comprueba('y la ficha la enseña, con «Cambiar»', h.indexOf('Incluye puesta en marcha.') > -1 && h.indexOf('>Cambiar<') > -1);
  A.presuObsAbrir(); V.sheet.texto = '';
  return A.presuObsGuardar();
}).then(function () {
  igual('vacía, se quita (null)', cambios[1].observaciones, null);
  V.presuVer.datos.enviado_correo_at = new Date().toISOString(); A.presuObsAbrir();
  comprueba('si ya se envió, avisa de que el PDF enviado no cambia', sheet().indexOf('Ya se envió por correo') > -1);
  V.sheet = null;

  V.user = { id: 'u0' }; titulo('la nota y el tipo en el PDF');
  var impreso = nodo(), antes = document.querySelector;
  document.querySelector = function (q) { return q === '#print' ? impreso : antes(q); };
  imprimirPresupuestoHTML(PRESU({ observaciones: 'No incluye <obra> civil.' }));
  var pdf = impreso.innerHTML, sinCond = pdf.split('data-salto')[0];
  comprueba('sale con su rótulo', sinCond.indexOf('Observaciones') > -1 && sinCond.indexOf('No incluye &lt;obra&gt; civil.') > -1);
  comprueba('debajo del total y antes de las condiciones', sinCond.indexOf('Observaciones') > sinCond.indexOf('Total con IVA'));
  imprimirPresupuestoHTML(PRESU());
  comprueba('sin nota no hay rótulo', impreso.innerHTML.split('data-salto')[0].indexOf('Observaciones') < 0);
  imprimirPresupuestoHTML(PRESU({ categoria: 'otro', categoria_texto: 'Cargador de coche' }));
  comprueba('la cabecera de un «otro» es lo escrito', impreso.innerHTML.indexOf('Cargador de coche') > -1);
  imprimirPresupuestoHTML(PRESU({ categoria: 'otro', categoria_texto: null }));
  comprueba('y sin escribir nada no pone «Otro» ni «otro»', !/>Otro<|>otro</.test(impreso.innerHTML.split('data-salto')[0]));
  imprimirPresupuestoHTML(PRESU({ observaciones: 'Nota' }), 'en', function (x) { return x === 'Nota' ? 'Note (EN)' : x; });
  comprueba('en inglés, rótulo y texto traducidos', impreso.innerHTML.indexOf('Notes') > -1);
  comprueba('la nota entra en lo que se traduce', textosDelPresu(PRESU({ observaciones: ' Nota ', categoria: 'otro', categoria_texto: 'Cargador' })).indexOf('Nota') > -1 && textosDelPresu(PRESU({ categoria: 'otro', categoria_texto: 'Cargador' })).indexOf('Cargador') > -1);
  igual('y sale traducida', presuTraducido(PRESU({ observaciones: 'Nota' }), function (x) { return x === 'Nota' ? 'Note' : x; }).observaciones, 'Note');
  document.querySelector = antes;

  V.user = { id: 'u0' }; titulo('cambiar un guardado a «Otro»');
  V.presuVer = { id: 'p1', cargando: false, error: null, datos: PRESU(), idioma: 'es' };
  A.presuCatAbrir();
  var hs = sheet();
  comprueba('la hoja ofrece Otro', hs.indexOf('data-a="presuCatOtro"') > -1);
  A.presuCatOtro();
  comprueba('y al tocarlo, la caja para escribir el tipo', sheet().indexOf('data-f="presuCatTexto"') > -1);
  visitasDB.cambiarCategoriaPresupuesto = function (id, cat, texto) { catLlamada = [id, cat, texto]; return Promise.resolve({ ok: true }); };
  V.sheet.texto = 'Reforma';
  return A.presuCatDe('otro');
}).then(function () {
  igual('se manda con su texto', JSON.stringify(catLlamada), JSON.stringify(['p1', 'otro', 'Reforma']));
  igual('y la ficha lo enseña', nombreCatDe(V.presuVer.datos), 'Reforma');
  comprueba('en la cabecera', vPresupuestoVer().indexOf('>Reforma</span>') > -1);

  V.user = { id: 'u0' }; titulo('el coste al añadir del catálogo');
  return cargarCoefPrecios();
}).then(function () {
  var PROD = { referencia: 'R1', nombre: 'Split 3,5 kW', familia: 'aire_interior', unidad: 'ud', precio_tarifa: 1000, iva: 21, descuento_proveedor: 50, recargo: null, aplica_cdc: null, atributos: {} };
  var hc = costeCatalogoHTML(PROD, 'aire_acondicionado');
  comprueba('la búsqueda enseña coste y margen (tarifa 1.000 con 50 % de proveedor)', hc.indexOf('coste 500,00') > -1 && hc.indexOf('margen 50 %') > -1);
  var hs2 = costeCatalogoHTML(PROD, 'solar');
  comprueba('en fotovoltaica, con su recargo: coste 550 y venta 715', hs2.indexOf('coste 550,00') > -1 && hs2.indexOf('venta 715,00') > -1);
  igual('sin los datos del coste no se inventa nada', costeCatalogoHTML({ referencia: 'X', nombre: 'x', precio_tarifa: 10 }, 'solar'), '');
  V.user = { id: 'u0' }; S.users[0].rol = 'colaborador';
  igual('quien no ve costes no lo ve', costeCatalogoHTML(PROD, 'solar'), '');
  S.users[0].rol = 'presupuestos';

  V.presuVer = { id: 'p1', cargando: false, error: null, datos: PRESU(), idioma: 'es' };
  A.presuEditar();
  V.presuEdit.resultados = [PROD];
  comprueba('también en la búsqueda al modificar', presuEditResultadosHTML().indexOf('coste 500,00') > -1);
  A.presuEditAnadir('R1');
  var n = V.presuEdit.nuevas[0];
  var np = nuevaPrecios(n, 'aire_acondicionado');
  igual('recién añadida: venta la del catálogo', np.venta, 1000);
  igual('coste el del catálogo', np.coste, 500);
  igual('margen 50 %', np.margen, 50);
  var he = presuLineasEditHTML(V.presuVer.datos);
  comprueba('la tarjeta enseña coste y margen sin guardar', he.indexOf('data-k="precio_coste" value="500"') > -1 && he.indexOf('data-k="margen_pct" value="50"') > -1 && he.indexOf('beneficio 500,00') > -1);
  A.presuNuevaCampo(0, 'precio_tarifa', '800');
  igual('si se escribe otro precio, ese es la venta', nuevaPrecios(n, 'aire_acondicionado').venta, 800);
  igual('y el margen baja', nuevaPrecios(n, 'aire_acondicionado').margen, 37.5);
  A.presuNuevaCampo(0, 'margen_pct', '25');
  igual('escribir un margen cambia el coste', n.precio_coste, 600);
  A.presuNuevaCampo(0, 'precio_coste', '');
  igual('con el coste vacío vuelve el del catálogo', nuevaPrecios(n, 'aire_acondicionado').coste, 500);
  A.presuNuevaCampo(0, 'precio_coste', '450'); A.presuNuevaCampo(0, 'precio_tarifa', '1000'); A.presuNuevaCampo(0, 'cantidad', '2');
  var prev = previaEditHTML(V.presuVer.datos);
  comprueba('la vista previa cuenta su venta (1.000 + 2 × 1.000)', /3\.?000,00/.test(prev));
  igual('en fotovoltaica la venta sin tocar lleva el recargo', nuevaPrecios({ precio_catalogo: 1000, precio_tarifa: 1000, prod: PROD }, 'solar').venta, 715);
  var enviado = null;
  visitasDB.recalcularPresupuesto = function (id, dto, nuevas) { enviado = nuevas; return Promise.resolve({ ok: true }); };
  visitasDB.borrarLineaPresupuesto = function () { return Promise.resolve({}); };
  return A.presuGuardarCambios().then(function () { return enviado; });
}).then(function (enviado) {
  igual('al guardar viaja el coste escrito', enviado[0].precio_coste, 450);
  igual('con su referencia y su cantidad', enviado[0].producto_ref + '|' + enviado[0].cantidad, 'R1|2');
  comprueba('y nada de lo de dentro (prod)', enviado[0].prod === undefined);

  V.user = { id: 'u0' }; titulo('al borrar, se vuelve a donde se estaba');
  var borrados = [];
  visitasDB.borrarPresupuesto = function (id) { borrados.push(id); return Promise.resolve({ ok: true }); };
  visitasDB.visitasDeCliente = function () { return Promise.resolve([]); };
  V.agenda.clientes = [{ id: 'c1', nombre: 'Ana Ferrer', presupuestos: [{ id: 'p1' }, { id: 'p2' }], visitas: [{ id: 'v1', presupuestos: [{ id: 'p1' }] }] }]; V.agenda.cargado = true;
  // desde la ficha del cliente
  V.view = 'clienteVer'; V.clienteVerId = 'c1'; V.volverPila = []; V.volverA = null;
  recordarOrigen();
  V.presuVer = { id: 'p1', cargando: false, error: null, datos: PRESU(), idioma: 'es' }; V.presuEdit = null; V.view = 'presupuestoVer';
  V.presuLista.filas = [{ id: 'p1' }, { id: 'p2' }];
  A.presuBorrar('p1');
  return A.confirmarBorrarPresu().then(function () { return borrados; });
}).then(function (borrados) {
  igual('se borra', borrados.join(), 'p1');
  igual('y se vuelve al cliente', V.view + '|' + V.clienteVerId, 'clienteVer|c1');
  igual('ya no está en su ficha', V.agenda.clientes[0].presupuestos.map(function (x) { return x.id; }).join(), 'p2');
  igual('ni colgado de su visita', V.agenda.clientes[0].visitas[0].presupuestos.length, 0);
  igual('la pila de volver queda vacía', V.volverPila.length, 0);
  // desde la lista de presupuestos
  V.view = 'presupuestos'; recordarOrigen();
  V.presuVer = { id: 'p2', cargando: false, error: null, datos: PRESU({ id: 'p2' }), idioma: 'es' }; V.view = 'presupuestoVer';
  A.presuBorrar('p2');
  return A.confirmarBorrarPresu();
}).then(function () {
  igual('desde la lista, se queda en la lista', V.view, 'presupuestos');
  // cliente → presupuesto A → (copia) presupuesto B: al borrar B se vuelve a A
  V.view = 'clienteVer'; V.clienteVerId = 'c1'; V.volverPila = []; recordarOrigen();
  V.presuVer = { id: 'pA', cargando: false, error: null, datos: PRESU({ id: 'pA' }), idioma: 'es' }; V.view = 'presupuestoVer';
  recordarOrigen();
  V.presuVer = { id: 'pB', cargando: false, error: null, datos: PRESU({ id: 'pB' }), idioma: 'es' };
  visitasDB.verPresupuesto = function (id) { return Promise.resolve(PRESU({ id: id })); };
  A.presuBorrar('pB');
  return A.confirmarBorrarPresu();
}).then(function () {
  igual('desde otro presupuesto, se vuelve a ese', V.view + '|' + (V.presuVer && V.presuVer.id), 'presupuestoVer|pA');
  V.user = null; V.view = 'login'; V.presuVer = null; V.presuEdit = null; V.sheet = null;
  resultado();
}).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
