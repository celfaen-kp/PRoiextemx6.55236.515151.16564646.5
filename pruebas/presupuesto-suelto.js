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
  comprueba('avisa de que aerotermia no tiene reglas', vPresuNuevo().indexOf('Todavía no hay reglas') > -1);
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
