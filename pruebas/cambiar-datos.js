/* Cambiar los datos de un presupuesto guardado y recalcular (Enzo, 26-11-2026):
 * «cuando quiera modificar un presupuesto, que pueda hacerlo modificando datos
 * del mismo y recalculando, manteniendo los datos que se usaron en el motor».
 * Al guardar viaja el estado de la pantalla (lo guarda la función en
 * presupuestos.datos_motor, sql/etapa129); desde «Modificar» se vuelve a abrir
 * con él y, al guardar, se cambia ese presupuesto o se crea uno nuevo. */
setTimeout(function () {
  var app = nodo();
  document.querySelector = function (q) { return q === '#app' ? app : nodo(); };
  S.users = [{ id: 'u9', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }, { id: 'u1', nombre: 'Bayron', rol: 'jefe', activo: true }];
  V.user = { id: 'u9' }; V.sheet = null; V.presuEdit = null;
  V.agenda.clientes = [{ id: 'c1', nombre: 'Familia Gil' }, { id: 'c2', nombre: 'Marta Pons' }]; V.agenda.cargado = true;
  var llamadas = [], tl = [], sube = 0;
  var RESP = function (id) { return { ok: true, presupuesto_id: id, categoria: 'solar', lineas: [{ descripcion: 'Módulo fotovoltaico', cantidad: 6, unidad: 'ud', precio_tarifa: 144, importe: 864, seccion: 'Ampliación de paneles' }], incidencias: [],
    totales: { bruto: 864, dto_linea: 0, subtotal: 864, dto_global: 0, total: 864, coste: 432, lineas_sin_coste: 0 }, dto_global_pct: 0 }; };
  var idQueDevuelve = 'p-nuevo';
  visitasDB = {
    presupuestarSuelto: function (cat, datos, o) { llamadas.push({ cat: cat, datos: datos, o: o }); return Promise.resolve(RESP(o.guardar ? (o.reemplazarId || idQueDevuelve) : undefined)); },
    actualizarPresupuestoEnTeamleader: function (id) { tl.push(id); return Promise.resolve({ ok: true }); },
    buscarProductos: function () { return Promise.resolve([]); },
    verPresupuesto: function () { return Promise.resolve({ lineas: [] }); },
  };
  A.cargarPresupuestos = function () {};
  A.presuGuardadoATL = function () { sube++; return Promise.resolve(); };
  anotar = function () {};

  titulo('al guardar viaja el estado de la pantalla');
  A.presuNuevo();
  A.presuSueltoChip('cat', 'solar'); A.presuSueltoChip('alcance', 'paneles');
  V.suelto.paneles = '4'; V.suelto.cubierta = 'plana_transitable'; V.suelto.clienteId = 'c1'; V.suelto.cliente = 'Familia Gil';
  V.presu.extra = [{ producto_ref: 'X-1', descripcion: 'Optimizador', cantidad: 2, unidad: 'ud', precio_tarifa: 50, precio_catalogo: 50 }];
  V.presu.quitadas = ['|Elevador de carga (4 h)']; V.presu.dto = 5;
  var ea = presuEstadoApp(V.presu);
  igual('el formulario, lo añadido, lo quitado y el descuento', ea.suelto.paneles + '|' + ea.suelto.cubierta + '|' + ea.suelto.solo_paneles + '|' + ea.extra.length + '|' + ea.quitadas.length + '|' + ea.dto, '4|plana_transitable|true|1|1|5');
  comprueba('es una copia: no cambia si después se toca la pantalla', (function () { V.suelto.paneles = '9'; var igualQue = ea.suelto.paneles === '4'; V.suelto.paneles = '4'; return igualQue; })());
  comprueba('sin recalcular nada, no hay presupuesto que reemplazar', presuReemplaza() === null && presuReemplazaHTML() === '');

  A.presuCalcular('solar').then(function () {
    comprueba('el botón de guardar es el de siempre', vPresuNuevo().indexOf('Guardar este presupuesto') > -1 && vPresuNuevo().indexOf('Guardar cambios en') < 0);
    return A.presuGuardar();
  }).then(function () {
    var g = llamadas[llamadas.length - 1].o;
    comprueba('guarda con el estado de la pantalla y sin reemplazar ni copiar nada', g.guardar === true && !!g.estadoApp && g.estadoApp.suelto.paneles === '4' && g.reemplazarId === undefined && g.copiaDe === undefined && sube === 1);

    titulo('qué presupuestos se pueden recalcular');
    var GUARDADO = { id: 'p-895', categoria: 'solar', titulo: 'Familia Gil · Ampliación 4 paneles (2,04 kWp)', tl_numero: '895', tl_quotation_id: 'q-895', visita_id: null, dto_global_pct: 5, observaciones: 'Plazo: 3 semanas.',
      motor_version: '1.5 · solo paneles · FV v2', cliente: { id: 'c2', nombre: 'Marta Pons' }, lineas: [], datos_motor: { v: 1, origen: 'suelto', libre: false, datos: { solo_paneles: true, paneles_manual: 4 }, app: g.estadoApp } };
    comprueba('uno sin visita que guardó sus datos, sí', presuRecalculable(GUARDADO).ok === true);
    var viejo = presuRecalculable(Object.assign({}, GUARDADO, { datos_motor: null }));
    comprueba('uno sin visita de antes, no, y dice por qué', viejo.ok === false && viejo.por.indexOf('línea a línea') > 0);
    comprueba('uno hecho desde una visita, sí: sus datos están en la ficha', presuRecalculable({ id: 'p2', categoria: 'solar', visita_id: 'v1', motor_version: '1.5' }).ok === true);
    comprueba('uno hecho en Teamleader, no', presuRecalculable(Object.assign({}, GUARDADO, { motor_version: 'teamleader' })).ok === false);
    V.user = { id: 'u1' }; comprueba('y solo presupuestos y Administración', presuRecalculable(GUARDADO).ok === false); V.user = { id: 'u9' };
    comprueba('al modificar sale la puerta, con su botón', presuCambiarDatosHTML(GUARDADO).indexOf('data-a="presuCambiarDatos"') > 0 && presuCambiarDatosHTML(GUARDADO).indexOf('Cambiar los datos y recalcular') > 0);
    comprueba('en uno de antes sale la explicación, sin botón', presuCambiarDatosHTML(Object.assign({}, GUARDADO, { datos_motor: null })).indexOf('data-a="presuCambiarDatos"') < 0 && presuCambiarDatosHTML(Object.assign({}, GUARDADO, { datos_motor: null })).indexOf('línea a línea') > 0);
    comprueba('en uno de Teamleader, nada', presuCambiarDatosHTML(Object.assign({}, GUARDADO, { motor_version: 'teamleader' })) === '');

    titulo('se vuelve a abrir con los datos que tenía');
    V.suelto = null; V.view = 'presuVer'; V.presuVer = { datos: GUARDADO }; V.presuEdit = { cambios: {} };
    return A.presuCambiarDatos().then(function () { return GUARDADO; });
  }).then(function (GUARDADO) {
    igual('la pantalla del presupuesto sin visita, con su formulario', V.view + '|' + V.suelto.cat + '|' + V.suelto.solo_paneles + '|' + V.suelto.paneles + '|' + V.suelto.cubierta, 'presuNuevo|solar|true|4|plana_transitable');
    igual('con lo añadido, lo quitado y el descuento de entonces', V.presu.extra.length + '|' + V.presu.extra[0].producto_ref + '|' + V.presu.quitadas[0] + '|' + V.presu.dto, '1|X-1||Elevador de carga (4 h)|5');
    comprueba('el cliente es el que tiene hoy el presupuesto', V.suelto.clienteId === 'c2' && V.suelto.cliente === 'Marta Pons');
    comprueba('la nota para el cliente sigue', presuObsActual() === 'Plazo: 3 semanas.');
    comprueba('se sale del modo de retocar líneas', V.presuEdit === null);
    var r = presuReemplaza();
    comprueba('sabe qué presupuesto se está cambiando', !!r && r.id === 'p-895' && r.numero === '895' && r.tl === true && r.aceptado === false);
    var hv = vPresuNuevo();
    comprueba('la pantalla lo dice arriba', hv.indexOf('Cambiar los datos') > -1 && hv.indexOf('presupuesto nº 895') > -1 && hv.indexOf('Presupuesto nuevo</div>') < 0);
    comprueba('todavía sin calcular, no hay botones de guardar', hv.indexOf('presuGuardarReemplazo') < 0);
    V.suelto.paneles = '6';
    return A.presuCalcular('solar').then(function () { return GUARDADO; });
  }).then(function (GUARDADO) {
    var c = llamadas[llamadas.length - 1];
    comprueba('calcula con el dato cambiado y con lo que tenía', c.datos.paneles_manual === 6 && c.datos.solo_paneles === true && c.datos.tipo_cubierta === 'plana_transitable' && c.o.guardar === false && c.o.lineasExtra.length === 1 && c.o.lineasQuitar.length === 1 && c.o.dtoGlobalPct === 5);
    var hv = vPresuNuevo();
    comprueba('al guardar, las dos salidas', hv.indexOf('data-a="presuGuardarReemplazo"') > -1 && hv.indexOf('Guardar cambios en el nº 895') > -1 && hv.indexOf('data-a="presuGuardarNuevoDatos"') > -1 && hv.indexOf('Guardar este presupuesto') < 0);
    comprueba('y explica qué hace cada una', hv.indexOf('su oferta de Teamleader (se actualiza)') > -1 && hv.indexOf('lo deja como estaba') > -1);

    titulo('fuera de su pantalla no se reemplaza nada');
    V.view = 'visita'; V.visitaVer = { visita: { id: 'v-otra' }, fichas: [] };
    comprueba('en la visita de otro cliente, un guardado es uno nuevo', presuReemplaza() === null);
    V.view = 'presuNuevo'; V.visitaVer = null;
    comprueba('de vuelta en la suya, sí', !!presuReemplaza());

    titulo('guardar cambios en el mismo');
    sube = 0; tl = [];
    return A.presuGuardar('reemplazo').then(function () { return GUARDADO; });
  }).then(function (GUARDADO) {
    var g = llamadas[llamadas.length - 1].o;
    comprueba('va con el presupuesto que sustituye, y no como copia', g.guardar === true && g.reemplazarId === 'p-895' && g.copiaDe === undefined && g.estadoApp.suelto.paneles === '6');
    comprueba('la nota viaja', g.observaciones === 'Plazo: 3 semanas.');
    comprueba('la oferta de Teamleader se actualiza, no se sube otra', tl.length === 1 && tl[0] === 'p-895' && sube === 0 && V.presu.enTL === true);
    comprueba('y ya no queda nada por reemplazar', presuReemplaza() === null && V.presu.guardado === 'p-895');

    titulo('guardar como presupuesto nuevo');
    V.suelto = null; V.view = 'presuVer'; V.presuVer = { datos: GUARDADO };
    return A.presuCambiarDatos().then(function () { return A.presuCalcular('solar'); }).then(function () { sube = 0; tl = []; return A.presuGuardar('nuevo'); }).then(function () { return GUARDADO; });
  }).then(function (GUARDADO) {
    var g = llamadas[llamadas.length - 1].o;
    comprueba('se guarda aparte, apuntando al que le dio origen', g.guardar === true && g.reemplazarId === undefined && g.copiaDe === 'p-895');
    comprueba('se sube a Teamleader como uno más y el anterior no se toca', sube === 1 && tl.length === 0 && V.presu.guardado === 'p-nuevo');

    titulo('uno que el cliente ya aceptó no se cambia');
    var ACEPTADO = Object.assign({}, GUARDADO, { respuesta_cliente: 'aceptado', firmado_at: '2026-11-20T10:00:00Z' });
    V.suelto = null; V.view = 'presuVer'; V.presuVer = { datos: ACEPTADO };
    return A.presuCambiarDatos().then(function () { return A.presuCalcular('solar'); }).then(function () {
      var hv = vPresuNuevo();
      comprueba('solo se ofrece guardarlo como nuevo, y dice por qué', hv.indexOf('data-a="presuGuardarReemplazo"') < 0 && hv.indexOf('data-a="presuGuardarNuevoDatos"') > -1 && hv.indexOf('ya aceptó') > -1);
      return A.presuGuardar('reemplazo');
    }).then(function () {
      var g2 = llamadas[llamadas.length - 1].o;
      comprueba('aunque se pidiera, no se reemplaza: va como nuevo', g2.reemplazarId === undefined && g2.copiaDe === 'p-895');
    });
  }).then(function () {
    resultado();
  }).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); print('Exception: ' + e); });
}, 2300);
