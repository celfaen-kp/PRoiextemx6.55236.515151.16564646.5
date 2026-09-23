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
  comprueba('el que hay que revisar va marcado', h.indexOf('Por revisar') > -1);
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
  comprueba('pregunta equipos y metros', h.indexOf('Equipos interiores') > -1 && h.indexOf('Metros de línea') > -1);
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

  A.presuSueltoChip('cat', 'electricidad');
  comprueba('electricidad avisa de que no tiene reglas', vPresuNuevo().indexOf('Todavía no hay reglas') > -1);
  A.presuSueltoChip('cat', 'aire_acondicionado');

  titulo('qué se le manda al motor');
  V.suelto.equipos = 3; V.suelto.metros = '12,5'; V.suelto.tipo_sistema = 'multisplit';
  var d = datosDelSuelto(V.suelto);
  igual('una estancia por equipo', d.estancias.length, 3);
  igual('los metros, con coma', d.distancias_lineas[0].metros, 12.5);
  igual('el tipo de sistema', d.tipo_sistema, 'multisplit');
  igual('sin metros, lista vacía', datosDelSuelto({ equipos: 1, metros: '' }).distancias_lineas.length, 0);
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
    anadirLineaPresupuesto: function (f) { hechos.nuevas.push(f); return Promise.resolve({}); },
    apuntarCorreccion: function (f) { hechos.correcciones.push(f); return Promise.resolve({}); },
    recalcularPresupuesto: function (id, dto) { hechos.recalculo = [id, dto]; return Promise.resolve({ ok: true }); },
    listarPresupuestos: function () { return Promise.resolve([]); },
    verPresupuesto: function () { return Promise.resolve(V.presuVer.datos); },
  };

  A.presuLineaCampo('l1', 'cantidad', '4');
  A.presuLineaCampo('l1', 'precio_tarifa', '250');
  A.presuQuitarLinea('l2');
  A.presuLineaNueva();
  A.presuNuevaCampo('descripcion', 'Bomba de condensados');
  A.presuNuevaCampo('cantidad', '2');
  A.presuNuevaCampo('precio_tarifa', '95,50');
  A.presuEditDto('10');

  A.presuGuardarCambios().then(function () {
    igual('cambia la línea tocada', hechos.cambios.length, 1);
    igual('con la cantidad nueva', hechos.cambios[0][1].cantidad, 4);
    igual('y el precio nuevo', hechos.cambios[0][1].precio_tarifa, 250);
    igual('quita la que se marcó', hechos.borradas.join(), 'l2');
    igual('añade la nueva', hechos.nuevas.length, 1);
    igual('con su precio en coma', hechos.nuevas[0].precio_tarifa, 95.5);
    igual('marcada como puesta a mano', hechos.nuevas[0].origen, 'manual');
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
      cantidad: 3, unidad: 'ud', precio_tarifa: 245, precio_venta: 661.5, dto_linea_pct: 0, iva: 21 }] };
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
  comprueba('lleva el cliente', pdf.indexOf('Ana Ferrer') > -1);
  comprueba('la línea con su detalle técnico', pdf.indexOf('C100') > -1 && pdf.indexOf('cobre aislada') > -1);
  comprueba('el total sin IVA', pdf.indexOf('780,00') > -1);
  comprueba('y el total con IVA (943,80)', pdf.indexOf('943,80') > -1);

  igual('el PDF se llama por oficio y cliente, sin tildes', nombrePdfPresu(guardado), 'presupuesto-aire-acondicionado-ana-ferrer.pdf');

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
    resultado();
  }).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
}, 1600);
