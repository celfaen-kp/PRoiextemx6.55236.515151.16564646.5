/* La sección Presupuestos: la lista, el alta sin visita y la ficha de uno
 * guardado. Lo que importa aquí es qué datos se le mandan al motor cuando no
 * hay visita, y que solo entre quien debe. */
setTimeout(function () {
  var app = nodo();
  document.querySelector = function (q) { return q === '#app' ? app : nodo(); };
  S.users = [
    { id: 'u9', nombre: 'Ramon', rol: 'presupuestos', activo: true },
    { id: 'u1', nombre: 'Bayron', rol: 'jefe', activo: true },
    { id: 'u0', nombre: 'Admin', rol: 'admin', activo: true },
  ];
  V.user = { id: 'u9' };

  titulo('quién entra');
  comprueba('presupuestos sí', verMotor());
  V.user = { id: 'u0' }; comprueba('Administración sí', verMotor());
  V.user = { id: 'u1' }; comprueba('un jefe de obra no', !verMotor());
  V.user = { id: 'u9' };

  titulo('la lista');
  V.presuLista = { cargado: true, cargando: false, error: null, filas: [
    { id: 'p1', categoria: 'aire_acondicionado', titulo: 'Aire acondicionado · Casa de Ana',
      total_venta: 4321.5, estado: 'generado', created_at: new Date().toISOString(), cliente: { nombre: 'Ana' }, visita: null },
    { id: 'p2', categoria: 'aire_acondicionado', titulo: null, total_venta: 998,
      estado: 'revisar', created_at: new Date().toISOString(), cliente: { nombre: 'Gil' }, visita: { codigo: 'V-12' } },
  ] };
  var h = vPresupuestos();
  comprueba('sale el suelto y el de la visita', h.indexOf('Casa de Ana') > -1 && h.indexOf('Visita V-12') > -1);
  comprueba('el que hay que revisar va marcado', h.indexOf('Pendiente de revisar') > -1);
  comprueba('sin visita lo dice', h.indexOf('Sin visita') > -1);
  comprueba('botón de nuevo', h.indexOf('data-a="presuNuevo"') > -1);
  V.presuLista.filas = [];
  comprueba('si no hay ninguno, lo explica', vPresupuestos().indexOf('Todavía no hay presupuestos') > -1);

  titulo('el alta sin visita');
  V.agenda.clientes = [{ id: 'c1', nombre: 'Ana Ferrer' }];
  V.agenda.cargado = true;
  A.presuNuevo();
  igual('empieza en aire acondicionado', V.suelto.cat, 'aire_acondicionado');
  h = vPresuNuevo();
  comprueba('pregunta equipos, y m² y metros por equipo', h.indexOf('Equipos interiores') > -1 && h.indexOf('data-f="presuEstancia"') > -1);
  comprueba('los tipos de sistema', h.indexOf('Multisplit') > -1 && h.indexOf('Splits 1×1') > -1);
  V.suelto.cliente = 'ana';
  comprueba('busca el cliente en el CRM', vPresuNuevo().indexOf('Ana Ferrer') > -1);
  A.presuSueltoCliente('c1');
  igual('y se engancha', V.suelto.clienteId, 'c1');
  A.presuSueltoChip('cat', 'aerotermia');
  var ha = vPresuNuevo();
  comprueba('aerotermia pregunta potencia y circuitos', ha.indexOf('Potencia') > -1 && ha.indexOf('Circuitos') > -1);
  comprueba('y el agua caliente', ha.indexOf('200 l') > -1 && ha.indexOf('250 l') > -1);
  V.suelto.kw = '8'; V.suelto.circuitos = 2; V.suelto.acs = 200; V.suelto.sustituye = true;
  var da = datosDelSuelto(V.suelto);
  igual('manda la potencia', da.potencia_kw, 8);
  igual('un emisor por circuito', da.emisores_previstos.length, 2);
  igual('los litros de ACS', da.acs_litros_manual, 200);
  igual('y que había caldera', da.sistema_actual, 'caldera_gas');
  titulo('fotovoltaica sin visita');
  A.presuSueltoChip('cat', 'solar');
  var hs = vPresuNuevo();
  comprueba('pregunta inversor y suministro', hs.indexOf('Fronius') > -1 && hs.indexOf('Enphase (micros)') > -1 && hs.indexOf('Trifásico') > -1);
  comprueba('Fronius ofrece BYD, Reserva y Tesla', hs.indexOf('BYD') > -1 && hs.indexOf('Fronius Reserva') > -1 && hs.indexOf('>Tesla<') > -1);
  comprueba('y pregunta el backup', hs.indexOf('Con backup') > -1);
  V.suelto.paneles = '10';
  var ds = datosDelSuelto(V.suelto);
  igual('sin kWh no lleva batería', ds.baterias, 'no');
  igual('ni backup', ds.backup, false);
  igual('Fronius por defecto', ds.inversor_marca, 'fronius');
  igual('monofásico por defecto', ds.suministro, 'monofasico');
  V.suelto.bateria = '10';
  A.presuSueltoChip('bateria_marca', 'tesla');
  A.presuSueltoChip('backup', '1');
  A.presuSueltoChip('fases', 'trifasico');
  ds = datosDelSuelto(V.suelto);
  igual('con kWh sí', ds.baterias, 'si');
  igual('los kWh', ds.baterias_kwh, 10);
  igual('la marca', ds.bateria_marca, 'tesla');
  igual('el backup', ds.backup, true);
  igual('trifásico', ds.suministro, 'trifasico');
  A.presuSueltoChip('inversor', 'enphase');
  igual('Tesla también va con Enphase: se queda', V.suelto.bateria_marca, 'tesla');
  A.presuSueltoChip('inversor', 'fronius');
  A.presuSueltoChip('bateria_marca', 'byd');
  A.presuSueltoChip('inversor', 'enphase');
  igual('BYD no va con Enphase: se quita', V.suelto.bateria_marca, '');
  hs = vPresuNuevo();
  comprueba('Enphase ofrece Enphase y Tesla, no BYD', hs.indexOf('>Enphase<') > -1 && hs.indexOf('>BYD<') < 0);
  A.presuSueltoChip('backup', '');
  igual('el backup se quita', V.suelto.backup, false);

  titulo('arranque por kWp (V22.1)');
  V.suelto.paneles = ''; V.suelto.kwp = '5'; V.suelto.wp = 540;
  hs = vPresuNuevo();
  comprueba('pregunta los kWp', hs.indexOf('data-k="kwp"') > -1);
  comprueba('y dice cuántos paneles salen: ⌈5000 / 540⌉ = 10', hs.indexOf('10 paneles') > -1);
  ds = datosDelSuelto(V.suelto);
  igual('sin paneles a mano', ds.paneles_manual, 0);
  igual('los kWp pedidos van al motor', ds.kwp_objetivo, 5);
  igual('con sus vatios', ds.wp_manual, 540);
  V.suelto.paneles = '12';
  comprueba('con paneles, mandan los paneles', vPresuNuevo().indexOf('Los paneles mandan') > -1 && datosDelSuelto(V.suelto).paneles_manual === 12);
  V.suelto.paneles = ''; V.suelto.kwp = '';

  A.presuSueltoChip('cat', 'electricidad');
  comprueba('electricidad avisa de que no tiene reglas', vPresuNuevo().indexOf('Todavía no hay reglas') > -1);
  comprueba('y solo se puede montar libre', V.suelto.libre === true && vPresuNuevo().indexOf('Con el motor') < 0);
  A.presuSueltoChip('cat', 'aire_acondicionado');
  comprueba('al volver a aire, vuelve el motor', V.suelto.libre === false && vPresuNuevo().indexOf('Con el motor') > -1);

  titulo('presupuesto libre (6-11-2026)');
  A.presuSueltoChip('libre', '1');
  var hl = vPresuNuevo();
  comprueba('libre: sin los datos del motor', hl.indexOf('Equipos interiores') < 0 && hl.indexOf('data-f="presuEstancia"') < 0);
  comprueba('con título y botón de empezar de cero', hl.indexOf('data-k="titulo"') > -1 && hl.indexOf('Empezar de cero') > -1);
  A.presuSueltoChip('libre', '');
  comprueba('y al volver al motor, los datos de nuevo', vPresuNuevo().indexOf('Equipos interiores') > -1);
  A.presuSueltoChip('cat', 'aire_acondicionado');

  titulo('qué se le manda al motor');
  V.suelto.equipos = 3; V.suelto.metros = '12,5'; V.suelto.tipo_sistema = 'multisplit';
  var d = datosDelSuelto(V.suelto);
  igual('una estancia por equipo', d.estancias.length, 3);
  igual('sin metros por equipo, va el total antiguo', d.distancias_lineas[0].metros, 12.5);
  igual('el tipo de sistema', d.tipo_sistema, 'multisplit');
  igual('sin metros, lista vacía', datosDelSuelto({ equipos: 1, metros: '' }).distancias_lineas.length, 0);
  comprueba('la pantalla pide m² y metros por equipo', vPresuNuevo().split('data-f="presuEstancia"').length - 1 === 6);
  V.suelto.estancias = [{ m2: '25', metros: '4' }, { m2: '12,5', metros: '8' }, { m2: '', metros: '' }];
  d = datosDelSuelto(V.suelto);
  igual('los m² de cada estancia', d.estancias[0].m2, 25);
  igual('con coma también', d.estancias[1].m2, 12.5);
  igual('y sus metros de línea', d.estancias[1].metros, 8);
  igual('con metros por equipo, el total antiguo ya no se manda', d.distancias_lineas.length, 0);
  igual('sin equipos viejos, nada que retirar', d.equipos_a_retirar_n, 0);
  V.suelto.retirar = '2'; V.suelto.retirar_ext = ''; A.presuSueltoChip('recuperar', '1');
  d = datosDelSuelto(V.suelto);
  igual('dos interiores viejas', d.equipos_a_retirar_n, 2);
  igual('exteriores sin poner: 0 (el motor cuenta una)', d.exteriores_a_retirar_n, 0);
  igual('recuperando la tubería', d.preinstalacion_existente, 'si_aprovechable');
  A.presuSueltoChip('recuperar', '');
  igual('sin recuperar', datosDelSuelto(V.suelto).preinstalacion_existente, 'no');
  V.suelto.retirar = ''; V.suelto.estancias = null;
  igual('el título, para reconocerlo', tituloDelSuelto(), 'Aire acondicionado · Ana Ferrer');

  var pedido = null;
  // En el arnés, visitasDB es un objeto falso que devuelve promesas vacías y no
  // deja cambiarle una función: se sustituye entero.
  visitasDB = { presupuestarSuelto: function (cat, datos, o) {
    pedido = { cat: cat, datos: datos, o: o };
    return Promise.resolve({ ok: true, categoria: cat, conjunto_version: '2026.1', incidencias: [],
      dto_global_pct: 0, totales: { bruto: 100, dto_linea: 0, subtotal: 100, dto_global: 0, total: 100 },
      lineas: [{ descripcion: 'C100: Tubería frigorífica', cantidad: 3, unidad: 'ud', precio_tarifa: 245,
        importe: 735, seccion: 'Instalación', origen: 'partida' }] });
  } };
  A.presuCalcular('aire_acondicionado').then(function () {
    comprueba('llama al motor sin visita', !!pedido && pedido.cat === 'aire_acondicionado');
    igual('con el cliente enganchado', pedido.o.clienteId, 'c1');
    igual('y sin guardar todavía', pedido.o.guardar, false);
    comprueba('enseña las líneas calculadas', vPresuNuevo().indexOf('C100') > -1);

    titulo('la ficha de uno guardado');
    V.presuVer = { id: 'p1', cargando: false, error: null, datos: {
      id: 'p1', categoria: 'aire_acondicionado', titulo: 'Aire · Casa de Ana', created_at: new Date().toISOString(),
      total_venta: 735, dto_global_pct: 10, motor_version: '1.0', incidencias: [],
      lineas: [{ orden: 1, descripcion: 'C100: Tubería frigorífica', cantidad: 3, unidad: 'ud',
        precio_tarifa: 245, precio_venta: 661.5, dto_linea_pct: 0 }] } };
    var f = vPresupuestoVer();
    comprueba('la línea con su precio', f.indexOf('C100') > -1 && f.indexOf('661,50') > -1);
    comprueba('el total', f.indexOf('735,00') > -1);
    comprueba('dice el descuento al pie', f.indexOf('−10 %') > -1);
    resultado();
  }).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
}, 10);

/* Administración no tiene pestaña de Presupuestos (ya lleva siete): entra por
 * una tarjeta de su pantalla de Hoy. Que esa puerta exista. */
setTimeout(function () {
  V.user = { id: 'u0' };   // Administración
  S.fichajes = []; S.obras = []; S.partes = []; S.imputaciones = [];
  var h = vHoyAdmin(yo());
  titulo('la puerta de Administración');
  comprueba('tarjeta de Presupuestos en Hoy', h.indexOf('data-v="presupuestos"') > -1);
  resultado();
}, 400);

/* Modificar un presupuesto ya guardado: cantidades, precios, quitar líneas,
 * añadir otras y cambiar el descuento al pie. Y que lo que se cambia de una
 * línea propuesta por el motor quede apuntado en motor_correcciones. */
setTimeout(function () {
  titulo('modificar uno guardado');
  V.user = { id: 'u9' };
  V.presuVer = { id: 'p9', cargando: false, error: null, datos: {
    id: 'p9', categoria: 'aire_acondicionado', titulo: 'Aire · Casa de Ana',
    created_at: new Date().toISOString(), total_venta: 1400, dto_global_pct: 0, incidencias: [],
    lineas: [
      { id: 'l1', orden: 1, descripcion: 'C100: Tubería frigorífica', cantidad: 3, unidad: 'ud',
        precio_tarifa: 245, precio_venta: 735, dto_linea_pct: 0, origen: 'partida', origen_regla_id: 'r7' },
      { id: 'l2', orden: 2, descripcion: 'C102: Soportes', cantidad: 1, unidad: 'ud',
        precio_tarifa: 45, precio_venta: 45, dto_linea_pct: 0, origen: 'partida', origen_regla_id: 'r7' },
    ] } };

  A.presuEditar();
  comprueba('se abre el modo edición', !!V.presuEdit);
  var h = vPresupuestoVer();
  comprueba('las líneas salen editables', h.indexOf('data-f="presuLinea"') > -1);
  comprueba('avisa de las que propuso el motor', h.indexOf('queda apuntado') > -1);

  var hechos = { cambios: [], borradas: [], nuevas: [], correcciones: [], recalculo: null };
  visitasDB = {
    guardarLineaPresupuesto: function (id, c) { hechos.cambios.push([id, c]); return Promise.resolve({}); },
    borrarLineaPresupuesto: function (id) { hechos.borradas.push(id); return Promise.resolve({}); },
    apuntarCorreccion: function (f) { hechos.correcciones.push(f); return Promise.resolve({}); },
    // Las líneas nuevas van al servidor con el recálculo (6-11-2026): él les
    // pone el recargo del catálogo y las suma con las demás.
    recalcularPresupuesto: function (id, dto, nuevas) { hechos.recalculo = [id, dto]; hechos.nuevas = nuevas || []; return Promise.resolve({ ok: true }); },
    buscarProductos: function (q) { return Promise.resolve(q === 'bomba' ? [{ referencia: 'BC-01', nombre: 'Bomba de condensados Mini', familia: 'material', unidad: 'ud', precio_tarifa: 60, iva: 21 }] : []); },
    listarPresupuestos: function () { return Promise.resolve([]); },
    verPresupuesto: function () { return Promise.resolve(V.presuVer.datos); },
  };

  A.presuLineaCampo('l1', 'cantidad', '4');
  A.presuLineaCampo('l1', 'precio_tarifa', '250');
  A.presuQuitarLinea('l2');
  // una línea a mano…
  A.presuLineaNueva();
  A.presuNuevaCampo(0, 'descripcion', 'Bomba de condensados');
  A.presuNuevaCampo(0, 'cantidad', '2');
  A.presuNuevaCampo(0, 'precio_tarifa', '95,50');
  // …y otra del catálogo, buscándola
  var he = vPresupuestoVer();
  comprueba('en la edición hay buscador del catálogo', he.indexOf('data-f="presuEditTexto"') > -1);
  comprueba('y el botón de línea a mano', he.indexOf('data-a="presuLineaNueva"') > -1);
  V.presuEdit.buscar = 'bomba';
  A.presuEditBuscar().then(function () {
    igual('la búsqueda trae el producto', V.presuEdit.resultados.length, 1);
    A.presuEditAnadir('BC-01');
    igual('y al tocarlo entra como línea nueva', V.presuEdit.nuevas.length, 2);
    var h2 = vPresupuestoVer();
    comprueba('se ve con su referencia', h2.indexOf('BC-01') > -1);
    A.presuNuevaCampo(1, 'cantidad', '3');
    A.presuEditDto('10');
    return A.presuGuardarCambios();
  }).then(function () {
    igual('cambia la línea tocada', hechos.cambios.length, 1);
    igual('con la cantidad nueva', hechos.cambios[0][1].cantidad, 4);
    igual('y el precio nuevo', hechos.cambios[0][1].precio_tarifa, 250);
    igual('quita la que se marcó', hechos.borradas.join(), 'l2');
    igual('manda las dos nuevas al servidor', hechos.nuevas.length, 2);
    igual('la de a mano con su precio en coma', hechos.nuevas[0].precio_tarifa, 95.5);
    igual('sin referencia', hechos.nuevas[0].producto_ref, null);
    igual('la del catálogo con su referencia', hechos.nuevas[1].producto_ref, 'BC-01');
    igual('su cantidad', hechos.nuevas[1].cantidad, 3);
    igual('y el precio del catálogo, para que el servidor sepa que no se tocó', hechos.nuevas[1].precio_catalogo, 60);
    igual('apunta la corrección del motor', hechos.correcciones.length, 1);
    comprueba('diciendo qué cambió', /cantidad 3 → 4/.test(hechos.correcciones[0].motivo));
    igual('y pide al servidor que vuelva a sumar', hechos.recalculo[0], 'p9');
    igual('con el descuento al pie', hechos.recalculo[1], 10);
    comprueba('al acabar se sale del modo edición', !V.presuEdit);
    resultado();
  }).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
}, 900);

/* El PDF del presupuesto y la subida a Teamleader. */
setTimeout(function () {
  titulo('PDF y Teamleader');
  V.user = { id: 'u9' }; V.presuEdit = null;
  var guardado = { id: 'p9', categoria: 'aire_acondicionado', titulo: 'Aire · Casa de Ana',
    created_at: new Date().toISOString(), total_venta: 780, dto_global_pct: 10, motor_version: '1.0',
    incidencias: [], cliente: { nombre: 'Ana Ferrer' }, tl_quotation_id: null,
    lineas: [{ orden: 1, descripcion: 'C100: Tubería frigorífica', detalle_tecnico: 'Tubería de cobre aislada',
      cantidad: 3, unidad: 'ud', precio_tarifa: 245, precio_venta: 661.5, dto_linea_pct: 0, iva: 21,
      // lo interno viaja en la línea; el PDF no debe imprimirlo
      precio_coste: 180, beneficio_ud: 65, margen_pct: 0.2653, origen_inputs: { desglose: [{ nombre: 'Tubo de cobre' }] } }] };
  V.presuVer = { id: 'p9', cargando: false, error: null, datos: guardado };

  // El PDF se dibuja en #print: hay que quedarse con ese nodo, como con #app.
  var impreso = nodo();
  var antes = document.querySelector;
  document.querySelector = function (q) { return q === '#print' ? impreso : antes(q); };

  var h = vPresupuestoVer();
  comprueba('botón de PDF del presupuesto', h.indexOf('data-a="presuPdf"') > -1);
  comprueba('botón de mandar a Teamleader', h.indexOf('data-a="presuATeamleader"') > -1);

  imprimirPresupuestoHTML(guardado);
  var pdf = impreso.innerHTML;
  comprueba('el PDF dice PRESUPUESTO, no toma de datos', pdf.indexOf('PRESUPUESTO') > -1 && pdf.indexOf('TOMA DE DATOS') === -1);
  // Las condiciones generales del final hablan de «costes de licencia»: se miran aparte.
  var pdfSinCond = pdf.split('data-salto')[0];
  comprueba('el PDF no lleva nada interno: ni coste, ni beneficio, ni margen, ni desglose', !/coste|beneficio|margen|origen_inputs|resumen|precio_coste|Interno/i.test(pdfSinCond));
  comprueba('lleva las condiciones generales, el pago y el bloque de aceptación (V29.4)', pdf.indexOf('Condiciones generales y exclusiones') > -1 && pdf.indexOf('ES26 0182') > -1 && pdf.indexOf('14) Ley aplicable') > -1 && pdf.indexOf('Aceptación del presupuesto') > -1);
  comprueba('lleva el cliente', pdf.indexOf('Ana Ferrer') > -1);
  comprueba('la línea con su detalle técnico', pdf.indexOf('C100') > -1 && pdf.indexOf('cobre aislada') > -1);
  comprueba('el total sin IVA', pdf.indexOf('780,00') > -1);
  comprueba('y el total con IVA (943,80)', pdf.indexOf('943,80') > -1);

  // Desde el 28-10-2026 el archivo se llama como el presupuesto (título o cliente · categoría).
  igual('el PDF se llama como el presupuesto', nombrePdfPresu(guardado), 'Presupuesto Aire · Casa de Ana.pdf');
  igual('y en inglés lleva Quotation delante', nombrePdfPresu(guardado, 'en'), 'Quotation · Aire · Casa de Ana.pdf');

  titulo('el PDF en otro idioma (6-11-2026)');
  comprueba('la ficha ofrece el idioma del PDF, español marcado', h.indexOf('data-a="presuIdioma" data-k="en"') > -1 && /chip on" data-a="presuIdioma" data-k="es"/.test(h));
  comprueba('los textos fijos están en los cuatro idiomas', ['es', 'en', 'ca', 'de'].every(function (k) { return idiomas.PDF[k] && idiomas.PDF[k].condiciones.length === 14 && idiomas.PDF[k].pago.length === 3; }));
  var trad = { 'Instalación de aire acondicionado': 'Air conditioning installation', 'Equipos': 'Equipment' };
  var tr = function (x) { return trad[String(x || '').trim()] || x; };
  imprimirPresupuestoHTML(guardado, 'en', tr);
  var pdfEn = impreso.innerHTML;
  comprueba('dice QUOTATION y no PRESUPUESTO', pdfEn.indexOf('QUOTATION') > -1 && pdfEn.indexOf('PRESUPUESTO') === -1);
  comprueba('la categoría en inglés', pdfEn.indexOf('Air conditioning') > -1);
  comprueba('totales y condiciones en inglés', pdfEn.indexOf('Total excl. VAT') > -1 && pdfEn.indexOf('General terms and exclusions') > -1 && pdfEn.indexOf('14) Governing law') > -1 && pdfEn.indexOf('Total sin IVA') === -1);
  comprueba('los importes con punto decimal (780.00)', pdfEn.indexOf('780.00 €') > -1 && pdfEn.indexOf('943.80 €') > -1);
  comprueba('el cliente y el detalle técnico siguen', pdfEn.indexOf('Ana Ferrer') > -1 && pdfEn.indexOf('C100') > -1);
  comprueba('los textos a traducir salen de las líneas, sin repetir ni vacíos', (function () { var t = textosDelPresu(guardado); return t.length > 0 && t.indexOf('') === -1 && t.length === new Set(t).size; })());
  imprimirPresupuestoHTML(guardado, 'de');
  var pdfDe = impreso.innerHTML;
  comprueba('en alemán: ANGEBOT y Summe ohne MwSt.', pdfDe.indexOf('ANGEBOT') > -1 && pdfDe.indexOf('Summe ohne MwSt.') > -1 && pdfDe.indexOf('Klimaanlage') > -1);
  imprimirPresupuestoHTML(guardado, 'ca');
  comprueba('en catalán: PRESSUPOST', impreso.innerHTML.indexOf('PRESSUPOST') > -1 && impreso.innerHTML.indexOf('Aire condicionat') > -1);
  imprimirPresupuestoHTML(guardado, 'xx');
  comprueba('un idioma desconocido cae al español', impreso.innerHTML.indexOf('PRESUPUESTO') > -1);
  igual('la unidad en inglés', idiomas.unidadIdioma('ud', 'en'), 'pcs');
  igual('y la que no se conoce se queda', idiomas.unidadIdioma('rollo', 'de'), 'rollo');

  // Aquí no se pueden bajar las librerías del PDF: que fallen en vez de
  // quedarse esperando, como pasaría sin conexión.
  libsPdf = Promise.reject(new Error('sin librerías en las pruebas'));
  libsPdf.catch(function () {});
  var pedido = null, conPdf = 'sin llamar';
  visitasDB = { presupuestoATeamleader: function (id, soloVer, pdf) { pedido = id; conPdf = pdf; return Promise.resolve({ ok: true, tl_quotation_id: 'q1' }); },
    verPresupuesto: function () { return Promise.resolve(Object.assign({}, guardado, { tl_quotation_id: 'q1' })); },
    listarPresupuestos: function () { return Promise.resolve([]); } };
  A.presuATeamleader().then(function () {
    igual('sube el presupuesto que toca', pedido, 'p9');
    // Aquí no hay html2canvas: el PDF no se puede hacer y la oferta sube igual.
    igual('sin PDF posible, sube la oferta sola', conPdf, null);
    comprueba('y luego dice que ya está en el CRM', vPresupuestoVer().indexOf('Está en Teamleader') > -1);

    titulo('los interruptores del FV suelto (V22.0)');
    V.suelto = presuNuevoVacio(); V.suelto.cat = 'solar';
    A.presuSueltoChip('subvencion', '1');
    comprueba('un toque enciende la subvención', V.suelto.subvencion === true);
    A.presuSueltoChip('subvencion', '1');
    comprueba('otro la apaga', V.suelto.subvencion === false);
    A.presuSueltoChip('cargador', '1');
    comprueba('el cargador igual', V.suelto.cargador === true);
    comprueba('y se pinta marcado', camposSolarHTML(V.suelto).indexOf('chip sel" data-a="presuSueltoChip" data-k="cargador"') >= 0);
    resultado();
  }).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
}, 1600);

/* Presupuesto libre (6-11-2026): sin datos ni motor, empieza vacío y se monta
 * con líneas del catálogo o conceptos nuevos. */
setTimeout(function () {
  titulo('presupuesto libre: empezar de cero');
  V.user = { id: 'u9' }; V.sheet = null; V.presuEdit = null;
  V.agenda.clientes = [{ id: 'c1', nombre: 'Ana Ferrer' }]; V.agenda.cargado = true;
  A.presuNuevo();
  A.presuSueltoChip('libre', '1');
  var llamadas = [];
  visitasDB = {
    presupuestarSuelto: function (cat, datos, o) { llamadas.push([cat, datos, o]); return Promise.resolve({ ok: true, categoria: cat, lineas: [], incidencias: [], totales: { bruto: 0, dto_linea: 0, subtotal: 0, dto_global: 0, total: 0, coste: 0, lineas_sin_coste: 0 }, dto_global_pct: 0 }); },
    buscarProductos: function () { return Promise.resolve([]); },
  };
  A.presuCalcular('aire_acondicionado').then(function () {
    igual('pide al servidor el libre', llamadas[0][2].libre, true);
    igual('sin datos', Object.keys(llamadas[0][1]).length, 0);
    var hv = vPresuNuevo();
    comprueba('el panel vacío invita a buscar en el catálogo', hv.indexOf('Presupuesto vacío') > -1 && hv.indexOf('Añadir del catálogo') > -1);
    comprueba('y a crear un concepto nuevo sin escribir nada', hv.indexOf('Crear un concepto nuevo') > -1);
    comprueba('ya no sale el botón de empezar', hv.indexOf('Empezar de cero') < 0);
    A.presuSueltoChip('libre', '');
    comprueba('al volver al motor se olvida lo calculado', !V.presu.datos && vPresuNuevo().indexOf('Equipos interiores') > -1);
    resultado();
  }).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
}, 2300);
