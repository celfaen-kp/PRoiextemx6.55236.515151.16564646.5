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
      { descripcion: 'C103: Tubería frigorífica y aislamiento', detalle_tecnico: 'Línea frigorífica de cobre con aislamiento, por metro lineal', cantidad: 10, unidad: 'm', precio_tarifa: 52, importe: 520, seccion: 'Instalación', origen: 'partida', dto_linea_pct: 0 },
      { descripcion: 'Midea multisplit 2x1', cantidad: 1, unidad: 'ud', precio_tarifa: 1890, importe: 1701, seccion: 'Equipos', origen: 'manual', dto_linea_pct: 0 },
    ],
  };
  var h = presupuestoHTML(visita, fichasAire);
  comprueba('agrupa por secciones', h.indexOf('Instalación') >= 0 && h.indexOf('Equipos') >= 0);
  comprueba('cada línea lleva su leyenda debajo', h.indexOf('cobre con aislamiento') >= 0);
  comprueba('con su unidad de verdad (m)', h.indexOf('10 m ×') >= 0);
  comprueba('sin la jerga del motor («partida», «regla»)', h.indexOf('· partida') < 0 && h.indexOf('· regla') < 0);
  comprueba('lo añadido a mano sí se marca', h.indexOf('añadida a mano') >= 0);
  comprueba('enseña el aviso de lo que falta', h.indexOf('no trae') >= 0);
  comprueba('el total, en euros', /1\.?421,10 €/.test(h));
  comprueba('el descuento al pie se puede tocar', h.indexOf('data-f="presuDto"') >= 0);
  comprueba('deja añadir del catálogo', h.indexOf('data-f="presuTexto"') >= 0);
  comprueba('y guardar', h.indexOf('data-a="presuGuardar"') >= 0);
  comprueba('sin guardar, todavía no deja mandarlo a Teamleader', h.indexOf('presuGuardadoATL') < 0);

  titulo('recién guardado, se manda a Teamleader desde aquí');
  V.presu.guardado = 'p-123';
  h = presupuestoHTML(visita, fichasAire);
  comprueba('dice que aún no está en Teamleader', h.indexOf('Todavía no está en Teamleader') >= 0);
  comprueba('botón para mandarlo', h.indexOf('data-a="presuGuardadoATL"') >= 0);
  comprueba('a la oportunidad de la visita', h.indexOf('oportunidad de esta visita') >= 0);
  V.presu.enTL = true;
  h = presupuestoHTML(visita, fichasAire);
  comprueba('ya mandado: lo dice y no se repite', h.indexOf('✓ Está en Teamleader') >= 0 && h.indexOf('data-a="presuGuardadoATL"') < 0);
  V.presu.guardado = null; V.presu.enTL = false;

  titulo('el buscador del catálogo');
  V.presu.buscar = 'midea'; V.presu.resultados = [{ referencia: 'MSAGBU-12HRFN8', nombre: 'Midea mural 3,5 kW', familia: 'aire_interior', precio_tarifa: 612 }];
  var b = presuResultadosHTML();
  comprueba('sale el producto con su precio', b.indexOf('Midea mural') >= 0 && b.indexOf('612,00 €') >= 0);
  V.presu.resultados = [];
  comprueba('si no hay nada, lo explica', presuResultadosHTML().indexOf('tarifa de esa marca') >= 0);
  resultado();
}, 10);
