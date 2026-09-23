/* La tarjeta del presupuesto dentro de la ficha de la visita: que solo la vea
 * quien debe, que solo salga en los oficios con reglas, y que enseñe las líneas
 * con su origen y sus totales. */
setTimeout(function () {
  var fichasAire = [{ categoria: 'aire_acondicionado', datos: {} }];
  var fichasAero = [{ categoria: 'aerotermia', datos: {} }];
  var visita = { id: 'v1', direccion: 'Carrer Nou 3' };

  titulo('quién la ve');
  S.users = [
    { id: 'u9', nombre: 'Ramon', rol: 'presupuestos', activo: true },
    { id: 'u1', nombre: 'Bayron', rol: 'jefe', activo: true },
    { id: 'u0', nombre: 'Admin', rol: 'admin', activo: true },
  ];
  V.presu = { cat: null, cargando: false, error: null, datos: null, dto: 0, extra: [], guardando: false, buscar: '', buscando: false, resultados: [], guardado: null };
  V.user = { id: 'u9' };
  comprueba('presupuestos sí', presupuestoHTML(visita, fichasAire).indexOf('Presupuesto') >= 0);
  V.user = { id: 'u0' };
  comprueba('Administración sí', presupuestoHTML(visita, fichasAire).indexOf('Presupuesto') >= 0);
  V.user = { id: 'u1' };
  igual('un jefe de obra no', presupuestoHTML(visita, fichasAire), '');

  titulo('solo en los oficios con reglas');
  V.user = { id: 'u9' };
  comprueba('aerotermia también, desde la etapa 43', presupuestoHTML(visita, fichasAero).indexOf('Calcular') >= 0);
  igual('electricidad todavía no', presupuestoHTML(visita, [{ categoria: 'electricidad', datos: {} }]), '');
  comprueba('aire acondicionado sí', presupuestoHTML(visita, fichasAire).indexOf('Calcular') >= 0);

  titulo('con un presupuesto calculado');
  V.presu.cat = 'aire_acondicionado';
  V.presu.dto = 10;
  V.presu.datos = {
    conjunto_version: '2026.1',
    totales: { bruto: 1579, dto_linea: 0, subtotal: 1579, dto_global: -157.9, total: 1421.1 },
    incidencias: [{ nivel: 'aviso', codigo: 'campo_faltante', mensaje: 'La visita no trae «distancias_lineas».' }],
    lineas: [
      { descripcion: 'C100: Tubería frigorífica', cantidad: 2, unidad: 'ud', precio_tarifa: 245, importe: 441, seccion: 'Instalación', origen: 'partida', dto_linea_pct: 0 },
      { descripcion: 'Midea multisplit 2x1', cantidad: 1, unidad: 'ud', precio_tarifa: 1890, importe: 1701, seccion: 'Equipos', origen: 'manual', dto_linea_pct: 0 },
    ],
  };
  var h = presupuestoHTML(visita, fichasAire);
  comprueba('agrupa por secciones', h.indexOf('Instalación') >= 0 && h.indexOf('Equipos') >= 0);
  comprueba('dice de dónde sale cada línea', h.indexOf('partida') >= 0 && h.indexOf('a mano') >= 0);
  comprueba('enseña el aviso de lo que falta', h.indexOf('no trae') >= 0);
  comprueba('el total, en euros', /1\.?421,10 €/.test(h));
  comprueba('el descuento al pie se puede tocar', h.indexOf('data-f="presuDto"') >= 0);
  comprueba('deja añadir del catálogo', h.indexOf('data-f="presuTexto"') >= 0);
  comprueba('y guardar', h.indexOf('data-a="presuGuardar"') >= 0);

  titulo('el buscador del catálogo');
  V.presu.buscar = 'midea'; V.presu.resultados = [{ referencia: 'MSAGBU-12HRFN8', nombre: 'Midea mural 3,5 kW', familia: 'aire_interior', precio_tarifa: 612 }];
  var b = presuResultadosHTML();
  comprueba('sale el producto con su precio', b.indexOf('Midea mural') >= 0 && b.indexOf('612,00 €') >= 0);
  V.presu.resultados = [];
  comprueba('si no hay nada, lo explica', presuResultadosHTML().indexOf('tarifa de esa marca') >= 0);
  resultado();
}, 10);
