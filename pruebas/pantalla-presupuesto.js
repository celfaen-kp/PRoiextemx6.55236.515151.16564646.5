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

  titulo('versión interna: coste y margen (etapa 72)');
  V.user = { id: 'u0' };
  var interno = costeMargenHTML(2260.4, 2848.52, 0);
  comprueba('Administración ve el coste', interno.indexOf('coste') >= 0 && interno.indexOf('2260,40') >= 0);
  V.user = { id: 'u9' };
  igual('presupuestos no (solo Enzo lo ve)', costeMargenHTML(2260.4, 2848.52, 0), '');
  V.user = { id: 'u0' };
  var ml = margenLineaHTML({ cantidad: 10, precio_coste: 20, importe: 260, origen_inputs: { desglose: [{ nombre: 'Perfil G1', cantidad: 24, unidad: 'm', coste: 229.92 }] } });
  comprueba('margen por línea para Administración, con el desglose de la partida', ml.indexOf('margen 60,00') >= 0 && ml.indexOf('Perfil G1 24 m') >= 0);
  V.user = { id: 'u9' };
  igual('y nadie más', margenLineaHTML({ cantidad: 10, precio_coste: 20, importe: 260 }), '');
  V.user = { id: 'u0' };
  comprueba('el PDF no lleva nada interno', (function () { var secciones = [{ nombre: '02 · Estructura y fijaciones', lineas: [{ descripcion: 'Estructura', precio_venta: 260, precio_coste: 20, origen_inputs: { desglose: [{ nombre: 'Perfil G1' }] } }] }]; var b = bloquesImpresion('solar', secciones); return JSON.stringify(b).indexOf('Perfil G1') < 0 && JSON.stringify(b).indexOf('precio_coste') < 0; })());
  V.user = { id: 'u9' };
  comprueba('y el margen sobre venta (20,6 %)', interno.indexOf('588,12') >= 0 && interno.indexOf('20,6 %') >= 0);
  V.user = { id: 'u0' };
  comprueba('dice cuántas líneas van sin coste', costeMargenHTML(100, 200, 2).indexOf('2 líneas sin coste') >= 0);
  V.user = { id: 'u1' };
  igual('un jefe de obra no lo ve', costeMargenHTML(2260.4, 2848.52, 0), '');
  V.user = { id: 'u0' };
  igual('sin coste calculado no sale nada', costeMargenHTML(null, 2848.52, 0), '');
  V.user = { id: 'u9' };

  titulo('pendiente de confirmar y por capítulos');
  V.presu.datos = { incidencias: [], totales: { bruto: 0, total: 0 }, lineas: [
    { descripcion: 'Módulo fotovoltaico', seccion: '01 · Generador fotovoltaico', cantidad: 10, unidad: 'ud', precio_tarifa: 0, importe: 0, confirmada: false },
    { descripcion: 'Raíl', seccion: '02 · Estructura y fijaciones', cantidad: 25.2, unidad: 'm', precio_tarifa: 10, importe: 252 },
  ] };
  var panel = presuPanelHTML();
  comprueba('la línea sin precio sale como pendiente, no a 0 €', panel.indexOf('Pendiente de confirmar') >= 0);
  comprueba('los capítulos con su número', panel.indexOf('01 · Generador fotovoltaico') >= 0 && panel.indexOf('02 · Estructura') >= 0);

  titulo('la impresión para el cliente, por capítulos (desglose FV §2)');
  var secciones = [
    { nombre: '01 · Generador fotovoltaico', lineas: [{ descripcion: 'Módulo 510 Wp', cantidad: 10, precio_venta: 1100 }] },
    { nombre: '02 · Estructura y fijaciones', lineas: [{ descripcion: 'Raíl', precio_venta: 200 }, { descripcion: 'Gancho de teja', precio_venta: 100.5 }] },
    { nombre: '06 · Cableado y canalizaciones', lineas: [{ descripcion: 'Cable DC', precio_venta: 50 }] },
    { nombre: '07 · Protecciones, cuadros y puesta a tierra', lineas: [{ descripcion: 'Magnetotérmico', precio_venta: 30 }] },
    { nombre: '08 · Pequeño material y consumibles', lineas: [{ descripcion: 'Pequeño material', precio_venta: 20 }] },
    { nombre: '11 · Mano de obra de instalación', lineas: [{ descripcion: 'Jornada de pareja', precio_venta: 858 }] },
    { nombre: '12 · Transporte, desplazamiento y residuos', lineas: [{ descripcion: 'Residuos', precio_venta: 42 }] },
    { nombre: '13 · Ingeniería, legalización y trámites', lineas: [{ descripcion: 'Legalización', precio_venta: 300 }] },
    { nombre: '14 · Opcionales', lineas: [{ descripcion: 'Cargador de coche', precio_venta: 900 }] },
    { nombre: 'Otros', lineas: [{ descripcion: 'Añadido a mano', precio_venta: 10 }] },
  ];
  var b = bloquesImpresion('solar', secciones);
  igual('01 detallado', b[0].lineas.length, 1);
  igual('02 en una línea', b[1].lineas.length, 1);
  comprueba('con la suma y lo que lleva dentro en pequeño', b[1].lineas[0].precio_venta === 300.5 && b[1].lineas[0].resumen && b[1].lineas[0].detalle_tecnico.indexOf('Gancho de teja') >= 0);
  comprueba('06 + 07 + 08 agrupados en uno', b[2].nombre.indexOf('Cableado, canalizaciones, protecciones y pequeño material') >= 0 && b[2].lineas[0].precio_venta === 100);
  comprueba('11 + 12 agrupados', b[3].nombre.indexOf('Mano de obra') >= 0 && b[3].lineas[0].precio_venta === 900);
  igual('13 detallado', b[4].lineas[0].descripcion, 'Legalización');
  igual('lo añadido a mano, tal cual', b[5].nombre, 'Otros');
  comprueba('los opcionales al final, en su bloque', b[b.length - 1].nombre.indexOf('Opcionales') >= 0 && b[b.length - 1].lineas[0].descripcion === 'Cargador de coche');
  igual('las otras categorías no se tocan', bloquesImpresion('aerotermia', secciones), secciones);

  titulo('el formulario FV suelto manda el montaje al motor');
  var d = datosDelSuelto({ cat: 'solar', paneles: '12', wp: '510', bateria: '', inversor: 'fronius', fases: 'monofasico', cubierta: 'plana_transitable',
    anclaje: 'anclaje_quimico', por_fila: '5', dist_dc: '15', dist_ac: '10,5', dist_meter: '', recorrido: 'tubo_enterrado', zanja: '8', plantas: '2',
    medio: 'andamio', wifi: 'mala', cuadro_estado: 'antiguo', tierra: 'no_existe', excedentes: 'sin_excedentes', subvencion: true, cargador: true });
  igual('filas de 5: 5 + 5 + 2', JSON.stringify(d.filas_paneles), '[{"paneles":5},{"paneles":5},{"paneles":2}]');
  igual('cubierta', d.tipo_cubierta, 'plana_transitable');
  igual('anclaje', d.plana_anclaje, 'anclaje_quimico');
  igual('metros con coma', d.distancia_inversor_cuadro_m, 10.5);
  igual('zanja solo si va enterrado', d.zanja_m, 8);
  igual('plantas', d.plantas, 2);
  comprueba('lo demás', d.medio_elevacion === 'andamio' && d.wifi_inversor === 'mala' && d.estado_cuadro === 'antiguo' && d.toma_tierra === 'no_existe' && d.excedentes === 'sin_excedentes' && d.subvencion === true && d.cargador_ve === true);
  var d2 = datosDelSuelto({ cat: 'solar', paneles: '10', wp: '510', bateria: '', inversor: 'fronius', fases: 'monofasico', recorrido: 'fachada', zanja: '8' });
  igual('sin «por fila» no se mandan filas', d2.filas_paneles.length, 0);
  igual('zanja a 0 si no va enterrado', d2.zanja_m, 0);
  resultado();
}, 10);
