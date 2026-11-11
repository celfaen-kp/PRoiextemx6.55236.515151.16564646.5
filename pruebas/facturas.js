/* Facturas (Enzo, 11-11-2026): lo que la app compone y enseña. La emisión es de
 * Teamleader (función teamleader-factura); aquí se prueba la parte de la app:
 * estados, lo ya facturado, la base de cada modo y que las pantallas pintan. */
S.users = [{ id: 'u0', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }, { id: 'u1', nombre: 'Colabora', rol: 'colaborador', activo: true }, { id: 'u2', nombre: 'Admin', rol: 'admin', activo: true }];
var HOY = hoyISO();
var dia = function (n) { var d = new Date(HOY + 'T12:00'); d.setDate(d.getDate() + n); return fechaLocal(d); };
var F1 = { id: 'f1', tipo: 'factura', tl_id: 't1', numero: '2026 / 113', estado: 'pagada', pagada: true, fecha: dia(-30), vence: dia(-30), cliente_nombre: 'Ana Pons', entidad: 'SYSEFEN GROUP 2024 SL', base: 5634, iva: 1183.14, total: 6817.14, pendiente: 0, impuestos: [{ pct: 21, base: 5634, cuota: 1183.14 }], lineas: [{ seccion: null, descripcion: 'Anticipo', cantidad: 1, precio: 5634, importe: 5634, iva_pct: 21 }], cobros: [{ importe: 6817.14, fecha: dia(-28) }], hito: { modo: 'porcentaje', pct: 50 }, origen: 'app', presupuesto_id: 'p1' };
var F2 = { id: 'f2', tipo: 'factura', tl_id: 't2', numero: '2026 / 129', estado: 'pendiente', pagada: false, fecha: dia(-10), vence: dia(-5), cliente_nombre: 'Yuri B.', entidad: 'SYSEFEN GROUP 2024 SL', base: 300, iva: 63, total: 363, pendiente: 363, impuestos: [{ pct: 21, base: 300, cuota: 63 }], lineas: [{ descripcion: 'Adelanto', cantidad: 1, precio: 300, importe: 300, iva_pct: 21 }], cobros: [], origen: 'teamleader' };
var F3 = { id: 'f3', tipo: 'factura', tl_id: 't3', numero: null, estado: 'borrador', pagada: false, fecha: HOY, vence: null, cliente_nombre: 'Ana Pons', entidad: 'SYSEFEN GROUP 2024 SL', base: 1000, iva: 210, total: 1210, pendiente: 1210, impuestos: [{ pct: 21, base: 1000, cuota: 210 }], lineas: [{ seccion: 'Equipos', descripcion: 'Bomba', cantidad: 1, precio: 1000, importe: 1000, iva_pct: 21 }], cobros: [], origen: 'app', presupuesto_id: 'p1' };
var F4 = { id: 'f4', tipo: 'factura', tl_id: 't4', numero: '2026 / 90', estado: 'pagada', pagada: true, fecha: dia(-60), vence: dia(-60), cliente_nombre: 'Marc', entidad: 'de San Miguel Sistemas de Eficiencia Energética SLU', base: 2000, iva: 420, total: 2420, pendiente: 0, impuestos: [{ pct: 21, base: 2000, cuota: 420 }], lineas: [{ descripcion: 'Trabajos', cantidad: 1, precio: 2000, importe: 2000, iva_pct: 21 }], cobros: [], origen: 'teamleader' };
var A4 = { id: 'a4', tipo: 'abono', tl_id: 'ta4', numero: 'R2026 / 9', estado: 'emitido', fecha: dia(-50), cliente_nombre: 'Marc', entidad: 'de San Miguel Sistemas de Eficiencia Energética SLU', base: 2000, iva: 420, total: 2420, tl_factura_abonada_id: 't4', impuestos: [{ pct: 21, base: 2000, cuota: 420 }], lineas: [{ descripcion: 'ABONO', cantidad: 1, precio: 2000, importe: 2000, iva_pct: 21 }], cobros: [], origen: 'teamleader' };
var F5 = { id: 'f5', tipo: 'factura', tl_id: 't5', numero: '2026 / 131', estado: 'pendiente', pagada: false, fecha: HOY, vence: dia(20), cliente_nombre: 'Luz', entidad: 'SYSEFEN GROUP 2024 SL', base: 100, iva: 10, total: 110, pendiente: 110, impuestos: [{ pct: 10, base: 100, cuota: 10 }], lineas: [], cobros: [], origen: 'app' };
var TODAS = [F3, F5, F2, F1, A4, F4];

titulo('quién factura');
V.user = { id: 'u1' };
comprueba('un colaborador no', !puedeFacturar() && vAjustes().indexOf('data-a="fac_abrir"') < 0);
V.user = { id: 'u2' };
comprueba('Administración sí', puedeFacturar() && vAjustes().indexOf('data-a="fac_abrir"') > 0);
V.user = { id: 'u0' };
comprueba('presupuestos sí, y lo tiene en Presupuestos y en su perfil', puedeFacturar() && vAjustes().indexOf('data-a="fac_abrir"') > 0 && vPresupuestos().indexOf('data-a="fac_abrir"') > 0);

titulo('los estados, como en Teamleader');
var ab = facAbonadas(TODAS);
igual('las abonadas, por su id de Teamleader', JSON.stringify(ab), '{"t4":2000}');
igual('borrador', facEstado(F3, ab).k, 'borrador');
igual('pagada', facEstado(F1, ab).txt, 'Pagado');
igual('con el vencimiento pasado, vencida con sus días', facEstado(F2, ab).txt, 'Vencido (5 d)');
igual('sin vencer, por cobrar', facEstado(F5, ab).k, 'pendiente');
igual('la que tiene un abono por todo, abonada', facEstado(F4, ab).k, 'abonada');
igual('un abono parcial no la da por abonada', facEstado(F4, { t4: 500 }).k, 'pagada');
igual('el abono', facEstado(A4, ab).k, 'abono');

titulo('la lista');
V.fac = null; var FF = facEstadoBase(); FF.lista = TODAS; V.view = 'facturas';
var hl = vFacturas();
comprueba('salen todas con su número, y el borrador como tal', hl.indexOf('2026 / 113') > 0 && hl.indexOf('>Borrador<') > 0 && hl.indexOf('R2026 / 9') > 0);
comprueba('dice lo que queda por cobrar', hl.indexOf('por cobrar 473,00') > 0);
comprueba('la otra empresa se nombra; SYSEFEN GROUP no hace falta', hl.indexOf('de San Miguel') > 0 && hl.indexOf('SYSEFEN GROUP 2024 SL</div>') < 0);
FF.filtro = 'pendiente';
igual('«por cobrar» incluye las vencidas', facFiltradas().map(function (f) { return f.id; }).join(','), 'f5,f2');
FF.filtro = 'vencida'; igual('vencidas', facFiltradas().map(function (f) { return f.id; }).join(','), 'f2');
FF.filtro = 'abono'; igual('abonos', facFiltradas().map(function (f) { return f.id; }).join(','), 'a4');
FF.filtro = 'todas'; FF.buscar = 'pons';
igual('el buscador mira el cliente', facFiltradas().map(function (f) { return f.id; }).join(','), 'f3,f1');
FF.buscar = '129'; igual('y el número', facFiltradas().map(function (f) { return f.id; }).join(','), 'f2');
FF.buscar = '';

titulo('lo ya facturado de un presupuesto');
igual('cuentan las que tienen número, no los borradores', facFacturado([F1, F3]), 5634);
igual('y se restan los abonos', facFacturado([F4, A4]), 0);
V.presuVer = { id: 'p1', facturas: [F1, F3] };
var card = facPresuHTML({ id: 'p1', respuesta_cliente: 'aceptado', total_venta: 11268 });
comprueba('la tarjeta del presupuesto: facturado, lo que queda y el borrador pendiente', card.indexOf('Facturado 5634,00 € de 11.268,00 €') > 0 && card.indexOf('(50 %)') > 0 && card.indexOf('quedan 5634,00') > 0 && card.indexOf('1 borrador sin contabilizar') > 0 && card.indexOf('data-a="fac_nueva" data-pid="p1"') > 0);
comprueba('sin aceptar y sin facturas, no sale', facPresuHTML({ id: 'p1', respuesta_cliente: 'pendiente', total_venta: 100 }) === '' || (V.presuVer.facturas = []) && facPresuHTML({ id: 'p1', respuesta_cliente: 'pendiente', total_venta: 100 }) === '');
V.presuVer.facturas = [F1, F3];
V.user = { id: 'u1' };
comprueba('un colaborador no ve la tarjeta', facPresuHTML({ id: 'p1', respuesta_cliente: 'aceptado', total_venta: 11268 }) === '');
V.user = { id: 'u0' };

titulo('hacer una factura desde un presupuesto');
var OP = { entidades: [{ id: 'e1', nombre: 'SYSEFEN GROUP 2024 SL' }, { id: 'e2', nombre: 'San Miguel' }], entidad_id: 'e1',
  ivas: { e1: [{ id: 'i0', nombre: 'Ventas 0% IVA', pct: 0 }, { id: 'iue', nombre: 'Ventas dentro de la UE', pct: 0 }, { id: 'i10', nombre: 'Ventas 10% IVA', pct: 10 }, { id: 'i21', nombre: 'Ventas 21% IVA', pct: 21 }], e2: [{ id: 'j21', nombre: 'Ventas 21% IVA', pct: 21 }] },
  formas_pago: [{ type: 'cash', days: 0 }, { type: 'after_invoice_date', days: 30 }],
  cliente: { id: 'c1', nombre: 'Ana Pons', nif: '43000000A', en_teamleader: true },
  presupuesto: { id: 'p1', titulo: 'Batería Tesla', numero: '2026/712', total: 11268, aceptado: true, en_teamleader: true },
  lineas: [{ id: 'l1', seccion: 'Equipos', descripcion: 'BATERIA TESLA POWERWALL 3', cantidad: 1, precio_venta: 9405 }, { id: 'l2', seccion: 'Equipos', descripcion: 'Accesorios', cantidad: 3, precio_venta: 900 }, { id: 'l3', seccion: 'Instalación', descripcion: 'Mano de obra', cantidad: 1, precio_venta: 963 }],
  facturas: [F1, F3] };
var nueva = function (v) { var s = { tipo: 'facNueva', presupuestoId: 'p1', cargando: false, op: OP, err: null, busy: false,
  v: Object.assign({ entidad: 'e1', modo: 'porcentaje', pct: '50', importe: '', concepto: '', iva: '', fecha: HOY, pago: 'cash:0', nota: '', partidas: { l1: { on: true, cant: '1' }, l2: { on: true, cant: '3' }, l3: { on: true, cant: '1' } }, descontar: {}, lineas: [{ descripcion: '', cantidad: '1', precio: '' }] }, v || {}) };
  if (!s.v.iva) s.v.iva = facIvaPorDefecto(s); return s; };
var s1 = nueva();
igual('el IVA por defecto es el 21 %', s1.v.iva, 'i21');
igual('los tipos, del mayor al menor', facIvasDe(s1).map(function (i) { return i.pct; }).join(','), '21,10,0,0');
igual('50 % del presupuesto', JSON.stringify(facBase(s1)), '{"bruto":5634,"resta":0,"base":5634}');
igual('un importe', facBase(nueva({ modo: 'importe', importe: '1.234,5'.replace('.', '') })).base, 1234.5);
igual('partidas: solo lo marcado y la cantidad puesta', facBase(nueva({ modo: 'partidas', partidas: { l1: { on: false, cant: '1' }, l2: { on: true, cant: '2' }, l3: { on: true, cant: '1' } } })).base, 1563);
igual('no deja facturar más cantidad de la que hay', facBase(nueva({ modo: 'partidas', partidas: { l1: { on: false, cant: '1' }, l2: { on: true, cant: '9' }, l3: { on: false, cant: '1' } } })).base, 900);
igual('los anticipos que se pueden restar: con número y de una línea', facAnticipos(s1).map(function (f) { return f.numero; }).join(','), '2026 / 113');
var sR = nueva({ modo: 'resto', descontar: { f1: true } });
igual('lo que queda: todo menos el anticipo', JSON.stringify(facBase(sR)), '{"bruto":11268,"resta":5634,"base":5634}');
igual('sin restar, todo', facBase(nueva({ modo: 'resto' })).base, 11268);
var hn = facNuevaSheetHTML(sR);
comprueba('la hoja: modos, anticipo a restar, IVA y previa', hn.indexOf('Todo / lo que queda') > 0 && hn.indexOf('Restar anticipos ya facturados') > 0 && hn.indexOf('2026 / 113') > 0 && hn.indexOf('>21 %<') > 0 && hn.indexOf('dentro de la UE (0 %)') > 0 && hn.indexOf('Crear borrador') > 0);
comprueba('la previa: base, IVA, total y lo que lleva facturado', facPreviaHTML(sR).indexOf('5634,00') > 0 && facPreviaHTML(sR).indexOf('1183,14') > 0 && facPreviaHTML(sR).indexOf('6817,14') > 0 && facPreviaHTML(sR).indexOf('(100 %)') > 0);
comprueba('avisa si se pasa del presupuesto', facPreviaHTML(nueva({ modo: 'resto' })).indexOf('pasa del presupuesto') > 0);
comprueba('al 10 % cambia la cuota', facPreviaHTML(nueva({ iva: 'i10' })).indexOf('563,40') > 0);
comprueba('por partidas enseña cada línea con su casilla', facNuevaSheetHTML(nueva({ modo: 'partidas' })).indexOf('data-f="fac:p:l2:cant"') > 0);
var sNo = nueva(); sNo.op = Object.assign({}, OP, { presupuesto: Object.assign({}, OP.presupuesto, { aceptado: false }), cliente: Object.assign({}, OP.cliente, { en_teamleader: false, nif: '' }) });
var hno = facNuevaSheetHTML(sNo);
comprueba('avisa si no está aceptado, si el cliente no está en Teamleader o no tiene NIF', hno.indexOf('todavía no está aceptado') > 0 && hno.indexOf('no está en Teamleader') > 0 && hno.indexOf('no tiene NIF') > 0);
var sL = nueva({ modo: 'libre', lineas: [{ descripcion: 'Legalización', cantidad: '2', precio: '250' }, { descripcion: 'Visita', cantidad: '1', precio: '75,5' }] }); sL.op = Object.assign({}, OP, { presupuesto: null, lineas: [], facturas: [] });
igual('factura libre: suma de sus líneas', facBase(sL).base, 575.5);
comprueba('y su hoja con las líneas editables', facNuevaSheetHTML(sL).indexOf('data-f="fac:l:1:precio"') > 0 && facNuevaSheetHTML(sL).indexOf('Qué se factura') < 0);

titulo('ver una factura');
var ver = function (f, extra) { return facVerSheetHTML(Object.assign({ tipo: 'facVer', id: f.id, f: f, busy: false, confirmar: '', v: { fecha: HOY, importe: '', concepto: '' }, abonadas: {} }, extra || {})); };
var hb = ver(F3);
comprueba('un borrador: contabilizar, PDF y borrar; ni cobro ni abono', hb.indexOf('data-k="contabilizar"') > 0 && hb.indexOf('data-a="fac_pdf"') > 0 && hb.indexOf('data-k="borrar"') > 0 && hb.indexOf('data-k="cobro"') < 0 && hb.indexOf('data-k="abonar"') < 0);
comprueba('con la plantilla de la factura: banda verde, contenidos y totales', hb.indexOf('background:#76923c') > 0 && hb.indexOf('Descripción') > 0);
comprueba('con sus contenidos y totales', hb.indexOf('Equipos') > 0 && /Total IVA excl\.<\/span><span>1000,00/.test(hb) && /IVA 21%<\/span><span>210,00/.test(hb) && /Cantidad total<\/span><span>1210,00/.test(hb));
var hc = ver(F3, { confirmar: 'contabilizar' });
comprueba('contabilizar pide confirmación y avisa de que no se deshace', hc.indexOf('ya no se puede cambiar ni borrar') > 0 && hc.indexOf('data-a="fac_contabilizar"') > 0);
var hp = ver(F2);
comprueba('una por cobrar: apuntar cobro y abonar, no borrar', hp.indexOf('data-k="cobro"') > 0 && hp.indexOf('data-k="abonar"') > 0 && hp.indexOf('data-k="borrar"') < 0 && hp.indexOf('Por cobrar: 363,00') > 0);
var hpg = ver(F1);
comprueba('una pagada enseña el cobro y deja abonar', hpg.indexOf('Cobrado 6817,14') > 0 && hpg.indexOf('data-k="abonar"') > 0 && hpg.indexOf('data-k="cobro"') < 0);
comprueba('una ya abonada no se abona otra vez', ver(F4, { abonadas: { t4: 2000 } }).indexOf('data-k="abonar"') < 0);
comprueba('un abono solo tiene PDF', ver(A4).indexOf('data-a="fac_pdf"') > 0 && ver(A4).indexOf('data-k="abonar"') < 0 && ver(A4).indexOf('Abono R2026 / 9') > 0);
V.user = null; V.fac = null; V.presuVer = null; V.view = 'login';

resultado();
