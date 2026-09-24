/* =============================================================================
 * Sysefen · Las escenas del manual de usuario
 *
 * Datos de mentira, con nombres inventados, para fotografiar cada pantalla de
 * la app tal como la ve cada tipo de usuario. Lo carga capturar.py en una copia
 * de index.html que expone `window.__m` (S, V, A, render…) y llama a
 * escena('nombre') antes de cada captura.
 *
 * Ninguna escena habla con Supabase: se marcan las cargas como hechas.
 * ============================================================================= */
(function () {
  const m = window.__m;
  const { S, V, A } = m;
  const iso = (diasAtras, h, min) => { const d = new Date(); d.setDate(d.getDate() - diasAtras); d.setHours(h, min || 0, 0, 0); return d.toISOString(); };
  const fecha = (diasAtras) => { const d = new Date(); d.setDate(d.getDate() - diasAtras); return d.toISOString().slice(0, 10); };
  const hoy = fecha(0);

  // --- la empresa de ejemplo -------------------------------------------------
  const USERS = [
    { id: 'u1', nombre: 'Marta', rol: 'jefe', activo: true, pin: '1111' },
    { id: 'u2', nombre: 'Toni', rol: 'jefe', activo: true, pin: '2222' },
    { id: 'u3', nombre: 'Pau', rol: 'operario', activo: true, pin: '3333' },
    { id: 'u4', nombre: 'Lucía', rol: 'operario', activo: true, pin: '4444' },
    { id: 'u5', nombre: 'Ramón', rol: 'presupuestos', activo: true, pin: '5555', empId: 'e5' },
    { id: 'u0', nombre: 'Administración', rol: 'admin', activo: true, pin: '9999' },
  ];
  const EMP = [
    { id: 'e1', nombre: 'Marta', rol: 'jefe', activo: true, nombre_completo: 'Marta Vidal Soler', email_avisos: 'marta@sysefen.app' },
    { id: 'e2', nombre: 'Toni', rol: 'jefe', activo: true, nombre_completo: 'Toni Ferrer Mas' },
    { id: 'e3', nombre: 'Pau', rol: 'operario', activo: true, nombre_completo: 'Pau Serra Riera', vacaciones_anuales: 30 },
    { id: 'e4', nombre: 'Lucía', rol: 'operario', activo: true, nombre_completo: 'Lucía Gómez Pons' },
    { id: 'e5', nombre: 'Ramón', rol: 'presupuestos', activo: true, nombre_completo: 'Ramón Bauzá Coll', email_avisos: 'ramon@sysefen.app' },
  ];
  const OBRAS = [
    { id: 'o1', nombre: 'Casa Can Roca', cliente: 'Familia Roca', titulo: 'Casa Can Roca', dir: 'Camí de Son Vich 12, Esporles', estado: 'En curso', creado_en: iso(40, 9) },
    { id: 'o2', nombre: 'Nave Polígono Son Castelló', cliente: 'Talleres Pons', titulo: 'Nave Polígono Son Castelló', dir: 'Gremi Fusters 8, Palma', estado: 'En curso', creado_en: iso(25, 9) },
    { id: 'o3', nombre: 'Piso Blanquerna', cliente: 'Ana Ferrer', titulo: 'Piso Blanquerna', dir: 'Blanquerna 41, Palma', estado: 'En curso', creado_en: iso(10, 9) },
    { id: 'o4', nombre: 'Villa Sa Coma', cliente: 'J. Romero', titulo: 'Villa Sa Coma', dir: 'Rosas 34, Sa Coma', estado: 'Cerrada', creado_en: iso(90, 9) },
  ];
  const FICHAJES = [];
  let fid = 1;
  const ficha = (userId, dias, h1, m1, h2, m2, obraId) => FICHAJES.push({ id: 'f' + fid++, userId, obraId: obraId || null, entrada: iso(dias, h1, m1), salida: h2 == null ? null : iso(dias, h2, m2) });
  for (let d = 12; d >= 1; d--) {
    if ([0, 6].includes(new Date(iso(d, 12)).getDay())) continue;
    ficha('u1', d, 7, 58, 15, 32, 'o1'); ficha('u2', d, 8, 3, 15, 40, 'o2');
    ficha('u3', d, 8, 1, 15, 35, 'o1'); ficha('u4', d, 8, 10, 15, 30, 'o2');
  }
  ficha('u1', 0, 7, 55, null, null, 'o1'); ficha('u3', 0, 8, 2, null, null, 'o1'); ficha('u2', 0, 8, 5, null, null, 'o2');
  const IMPUT = [];
  let iid = 1;
  for (let d = 12; d >= 1; d--) {
    if ([0, 6].includes(new Date(iso(d, 12)).getDay())) continue;
    [['u1', 'o1', 420, 'o3', 30], ['u2', 'o2', 450], ['u3', 'o1', 450], ['u4', 'o2', 300, 'o3', 140]].forEach(([u, o, mi, o2, mi2]) => {
      IMPUT.push({ id: 'i' + iid++, userId: u, fecha: fecha(d), categoria: 'obra', obraId: o, minutos: mi, nota: '', origen: 'app' });
      if (o2) IMPUT.push({ id: 'i' + iid++, userId: u, fecha: fecha(d), categoria: 'obra', obraId: o2, minutos: mi2, nota: '', origen: 'app' });
    });
  }
  const PARTES = [
    { id: 'p1', ref: 'P-2026-041', obraId: 'o1', fecha: fecha(1), autorId: 'u1', desc: 'Montaje de la unidad exterior de aerotermia y conexión hidráulica al acumulador.', horas: { u1: 7, u3: 7.5 }, mats: [{ id: 'm1', nombre: 'Tubo multicapa 20 mm', cant: '12 m', importe: '', compra: true }], nivel: 'Sin incidencias', inc: '', adjuntos: [], importe: '', obs: '', firmante: 'Miquel Roca', firma: 'data:image/png;base64,iVBORw0KGgo=', estado: 'enviado', creado: iso(1, 16) },
    { id: 'p2', ref: 'P-2026-040', obraId: 'o2', fecha: fecha(2), autorId: 'u2', desc: 'Tirada de bandeja y cableado del cuadro secundario.', horas: { u2: 7.5, u4: 7.5 }, mats: [], nivel: 'Leve', inc: 'Falta un magnetotérmico de 40 A; se pide para mañana.', adjuntos: [{ id: 'a1', nombre: 'cuadro.jpg', ext: 'JPG', peso: '640 KB', img: true, data: null, ruta: 'x' }], importe: '', obs: '', firmante: '', firma: null, estado: 'firmado', creado: iso(2, 17) },
    { id: 'p3', ref: 'P-2026-039', obraId: 'o3', fecha: fecha(4), autorId: 'u1', desc: 'Visita de replanteo con el cliente.', horas: { u1: 1.5 }, mats: [], nivel: 'Sin incidencias', inc: '', adjuntos: [], importe: '', obs: '', firmante: 'Ana Ferrer', firma: 'data:image/png;base64,iVBORw0KGgo=', estado: 'firmado', creado: iso(4, 12) },
  ];
  const MAT = {
    items: [
      { id: 'm1', texto: '3 sacos de cemento cola', tipo: 'comprar', obra_id: 'o1', urgente: true, voz: true, pedido_por: 'e1', creado_en: iso(0, 9), lleva_id: null, hecho_en: null, importe: null },
      { id: 'm2', texto: 'Taladro percutor grande', tipo: 'despacho', obra_id: 'o2', urgente: false, pedido_por: 'e3', creado_en: iso(1, 10), lleva_id: 'e2', hecho_en: null, importe: null },
      { id: 'm3', texto: 'Silicona neutra (2)', tipo: 'comprar', obra_id: 'o1', urgente: false, pedido_por: 'e3', creado_en: iso(2, 10), lleva_id: 'e3', hecho_en: iso(1, 18), hecho_por: 'e3', importe: 12.4 },
    ],
    notas: [{ id: 'n1', texto: 'El cuadro de Can Roca está en el garaje; la llave la tiene el cliente.', voz: true, autor_id: 'e1', creado_en: iso(0, 8) }],
  };
  const CLIENTES = [
    { id: 'c1', nombre: 'Juan Romero', telefono: '600 111 222', email: 'juan.romero@correo.es', direccion: 'Rosas 34', poblacion: 'Sa Coma', tl_id: 'tl-1', visitas: [], citas: [{ id: 'x1', inicio: iso(0, 13), estado: 'pendiente' }] },
    { id: 'c2', nombre: 'Ana Ferrer', telefono: '600 333 444', email: 'ana@correo.es', direccion: 'Blanquerna 41', poblacion: 'Palma', tl_id: 'tl-2', visitas: [{ id: 'v1', codigo: 'V-0012', estado: 'borrador', sync_estado: 'pendiente', fecha_visita: fecha(1) }], citas: [] },
    { id: 'c3', nombre: 'Javier Mendoza', telefono: '600 555 666', email: '', direccion: 'Carrer Llum 13', poblacion: 'Esporles', visitas: [], citas: [{ id: 'x2', inicio: iso(-5, 12), estado: 'pendiente' }] },
    { id: 'c4', nombre: 'Pep Vidal', telefono: '600 777 888', email: 'pep@correo.es', direccion: 'Major 3', poblacion: 'Inca', visitas: [], citas: [] },
    { id: 'c5', nombre: 'Marina Coll', telefono: '600 999 000', email: 'marina@correo.es', direccion: 'Sol 9', poblacion: 'Sóller', tl_id: 'tl-5', visitas: [{ id: 'v2', codigo: 'V-0009', estado: 'completada', sync_estado: 'sincronizada', fecha_visita: fecha(6) }], citas: [] },
  ];
  const CITAS = [
    { id: 'x1', cliente_id: 'c1', estado: 'pendiente', inicio: iso(0, 13), duracion_min: 60, empleado_id: 'e5', categorias: ['aire_acondicionado'], direccion: 'Rosas 34', poblacion: 'Sa Coma', nota: 'Llamar antes de llegar', confirmacion_enviada_at: iso(2, 10), cliente: CLIENTES[0] },
    { id: 'x2', cliente_id: 'c3', estado: 'pendiente', inicio: iso(-5, 12), duracion_min: 90, empleado_id: 'e5', categorias: ['solar', 'aerotermia'], direccion: 'Carrer Llum 13', poblacion: 'Esporles', cliente: CLIENTES[2] },
    { id: 'x3', cliente_id: 'c5', estado: 'visitada', inicio: iso(6, 10), duracion_min: 60, empleado_id: 'e5', categorias: ['aerotermia'], visita_id: 'v2', cliente: CLIENTES[4] },
  ];
  const VISITAS = [
    { id: 'v1', codigo: 'V-0012', estado: 'borrador', sync_estado: 'pendiente', fecha_visita: fecha(1), direccion: 'Blanquerna 41', poblacion: 'Palma', cliente: CLIENTES[1], fichas: [{ categoria: 'aire_acondicionado' }] },
    { id: 'v2', codigo: 'V-0009', estado: 'completada', sync_estado: 'sincronizada', sync_at: iso(5, 18), fecha_visita: fecha(6), direccion: 'Sol 9', poblacion: 'Sóller', cliente: CLIENTES[4], fichas: [{ categoria: 'aerotermia' }] },
    { id: 'v3', codigo: 'V-0011', estado: 'completada', sync_estado: 'pendiente', fecha_visita: fecha(2), direccion: 'Major 3', poblacion: 'Inca', cliente: CLIENTES[3], fichas: [{ categoria: 'solar' }] },
  ];
  const PRESUS = [
    { id: 'q1', categoria: 'aerotermia', titulo: null, total_venta: 14860.5, estado: 'enviado', sync_estado: 'sincronizado', tl_quotation_id: 'tlq1', created_at: iso(5, 17), cliente: { nombre: 'Marina Coll' }, visita: { codigo: 'V-0009' } },
    { id: 'q2', categoria: 'aire_acondicionado', titulo: 'Aire acondicionado · Gil', total_venta: 3421.8, estado: 'generado', sync_estado: 'pendiente', tl_quotation_id: null, created_at: iso(1, 12), cliente: { nombre: 'Familia Gil' }, visita: null },
    { id: 'q3', categoria: 'solar', titulo: null, total_venta: 9980, estado: 'revisar', sync_estado: 'pendiente', tl_quotation_id: null, created_at: iso(2, 11), cliente: { nombre: 'Pep Vidal' }, visita: { codigo: 'V-0011' } },
  ];
  const PRESU_VER = {
    id: 'q2', categoria: 'aire_acondicionado', titulo: 'Aire acondicionado · Gil', created_at: iso(1, 12), total_venta: 3421.8, dto_global_pct: 0, motor_version: '1.1',
    estado: 'generado', sync_estado: 'pendiente', tl_quotation_id: null, cliente: { id: 'c9', nombre: 'Familia Gil' }, visita: null,
    incidencias: [],
    lineas: [
      { orden: 1, seccion: 'Equipos', descripcion: 'EZ-12RD6-I — Salón', detalle_tecnico: 'Midea Solstice · unidad interior mural · 3,5 kW frío · 3,8 kW calor · R-32', cantidad: 1, unidad: 'ud', precio_tarifa: 260, precio_venta: 260, dto_linea_pct: 0, iva: 21, origen: 'regla', origen_regla_id: 'r1' },
      { orden: 2, seccion: 'Equipos', descripcion: 'EZ-09RD6-I — Dormitorio', detalle_tecnico: 'Midea Solstice · unidad interior mural · 2,6 kW frío · 2,9 kW calor · R-32', cantidad: 1, unidad: 'ud', precio_tarifa: 230, precio_venta: 230, dto_linea_pct: 0, iva: 21, origen: 'regla', origen_regla_id: 'r1' },
      { orden: 3, seccion: 'Equipos', descripcion: 'M2O-14N8', detalle_tecnico: 'Midea Multisistema · unidad exterior multisistema para hasta 2 interiores · 4,1 kW frío', cantidad: 1, unidad: 'ud', precio_tarifa: 1350, precio_venta: 1350, dto_linea_pct: 0, iva: 21, origen: 'regla', origen_regla_id: 'r2' },
      { orden: 4, seccion: 'Instalación', descripcion: 'C100: Tubería frigorífica y aislamiento', cantidad: 2, unidad: 'ud', precio_tarifa: 245, precio_venta: 490, dto_linea_pct: 0, iva: 21, origen: 'partida' },
      { orden: 5, seccion: 'Instalación', descripcion: 'C101: Electricidad', cantidad: 2, unidad: 'ud', precio_tarifa: 72, precio_venta: 144, dto_linea_pct: 0, iva: 21, origen: 'partida' },
      { orden: 6, seccion: 'Instalación', descripcion: 'C102: Soportes unidad exterior', cantidad: 1, unidad: 'ud', precio_tarifa: 45, precio_venta: 45, dto_linea_pct: 0, iva: 21, origen: 'partida' },
      { orden: 7, seccion: 'Instalación', descripcion: 'C104: Mano de obra', cantidad: 2, unidad: 'ud', precio_tarifa: 450, precio_venta: 900, dto_linea_pct: 0, iva: 21, origen: 'partida' },
      { orden: 8, seccion: 'Instalación', descripcion: 'C103: Exceso metro', cantidad: 0.05, unidad: 'ud', precio_tarifa: 52, precio_venta: 2.8, dto_linea_pct: 0, iva: 21, origen: 'partida' },
    ],
  };

  // --- lo común a todas las escenas ------------------------------------------
  function base(userId) {
    S.users = USERS.map((u) => Object.assign({}, u));
    S.obras = OBRAS.map((o) => Object.assign({}, o));
    S.fichajes = FICHAJES.map((f) => Object.assign({}, f));
    S.imputaciones = IMPUT.map((i) => Object.assign({}, i));
    S.partes = PARTES.map((p) => Object.assign({}, p));
    S.ausencias = []; S.festivos = []; S.empresa = 'Sysefen'; S.opts = { gps: true, recordatorio: true, importesOperario: false };
    m.empRows(EMP.map((e) => Object.assign({}, e)));
    const mapa = {}; EMP.forEach((e) => { mapa[e.nombre] = e.id; }); m.empIdPorNombre(mapa);
    const inv = {}; EMP.forEach((e) => { inv[e.id] = e.nombre; }); m.nombrePorEmpId(inv);
    V.user = userId ? { id: userId } : null;
    V.sheet = null; V.err = false; V.obraId = null; V.tabHoras = 'empleado'; V.firmaPendiente = null;
    V.mat = { items: MAT.items.map((x) => Object.assign({}, x)), notas: MAT.notas.slice(), cargado: true, cargando: false, error: null, tab: 'pend', filtro: 'todo', avisado: true };
    V.matNuevo = { texto: '', tipo: 'comprar', obraId: null, urgente: false, voz: false }; V.notaNueva = { texto: '' };
    V.agenda = Object.assign(V.agenda || {}, { cargado: true, cargando: false, error: null, citas: CITAS.map((c) => Object.assign({}, c)), clientes: CLIENTES.map((c) => Object.assign({}, c)), filtro: 'todas', filtroCli: 'todos', dia: null, verMes: false, buscar: '' });
    V.visitas = VISITAS.map((v) => Object.assign({}, v)); V.visitasCargadas = true;
    V.presuLista = { cargado: true, cargando: false, error: null, filas: PRESUS.map((p) => Object.assign({}, p)) };
    try { m.limpiarBorradorVisita(); } catch (e) {}
  }

  const ESCENAS = {
    // --- entrar -----------------------------------------------------------------
    'login': () => { base(null); V.view = 'login'; },
    'pin': () => { base(null); V.view = 'pin'; V.pinUser = 'u3'; V.pin = '12'; },
    // --- operario ---------------------------------------------------------------
    'op-hoy-fuera': () => { base('u4'); V.view = 'hoy'; },
    'op-hoy-dentro': () => { base('u3'); V.view = 'hoy'; },
    'op-obras': () => { base('u3'); V.view = 'obras'; },
    'op-horas': () => { base('u3'); V.view = 'horas'; },
    'op-material': () => { base('u3'); V.view = 'material'; },
    'op-perfil': () => { base('u3'); V.view = 'ajustes'; },
    'op-menu': () => { base('u3'); V.view = 'hoy'; V.sheet = { tipo: 'menuUsuario' }; },
    // --- jefe de obra ------------------------------------------------------------
    'jefe-hoy': () => { base('u1'); V.view = 'hoy'; },
    'jefe-obras': () => { base('u1'); V.view = 'obras'; },
    'jefe-obra': () => { base('u1'); V.view = 'obra'; V.obraId = 'o1'; V.obraRango = 'total'; },
    'jefe-partes': () => { base('u1'); V.view = 'partes'; },
    'jefe-parte-obra': () => { base('u1'); V.view = 'partes'; V.sheet = { tipo: 'nuevoParteObra', buscar: '' }; },
    'jefe-horas': () => { base('u1'); V.view = 'horas'; V.tabHoras = 'empleado'; },
    'jefe-horas-obra': () => { base('u1'); V.view = 'horas'; V.tabHoras = 'obra'; },
    'jefe-imputar': () => { base('u1'); V.view = 'imputar'; V.impFecha = fecha(1); },
    'jefe-material': () => { base('u1'); V.view = 'material'; },
    'jefe-ajustes': () => { base('u1'); V.view = 'ajustes'; },
    // --- administración ----------------------------------------------------------
    'admin-hoy': () => { base('u0'); V.view = 'hoy'; },
    'admin-empleados': () => { base('u0'); V.view = 'empleados'; },
    'admin-empleado': () => { base('u0'); A.abrirEmpleado && A.abrirEmpleado('u3'); V.view = 'empleado'; },
    'admin-planilla': () => { base('u0'); V.view = 'planilla'; V.planEmp = 'u3'; V.planMes = hoy.slice(0, 7); },
    'admin-obras': () => { base('u0'); V.view = 'obras'; },
    'admin-partes': () => { base('u0'); V.view = 'partes'; },
    'admin-horas': () => { base('u0'); V.view = 'horas'; },
    'admin-citas': () => { base('u0'); V.view = 'agenda'; },
    'admin-presupuestos': () => { base('u0'); V.view = 'presupuestos'; },
    'admin-ajustes': () => { base('u0'); V.view = 'ajustes'; },
    // --- presupuestos (Ramón) -------------------------------------------------------
    'pres-agenda': () => { base('u5'); V.view = 'agenda'; },
    'pres-agenda-mes': () => { base('u5'); V.view = 'agenda'; V.agenda.verMes = true; },
    'pres-cita': () => { base('u5'); V.view = 'citaVer'; V.citaVerId = 'x1'; },
    'pres-clientes': () => { base('u5'); V.view = 'clientes'; },
    'pres-cliente': () => { base('u5'); V.view = 'clienteVer'; V.clienteVerId = 'c1'; },
    'pres-visitas': () => { base('u5'); V.view = 'visitas'; },
    'pres-presupuestos': () => { base('u5'); V.view = 'presupuestos'; },
    'pres-presu-ver': () => { base('u5'); V.view = 'presupuestoVer'; V.presuVer = { id: 'q2', cargando: false, datos: PRESU_VER, error: null }; V.presuEdit = null; },
    'pres-presu-nuevo': () => { base('u5'); A.presuNuevo(); V.suelto.cat = 'aire_acondicionado'; V.suelto.cliente = 'Familia Gil'; V.suelto.equipos = 2; V.suelto.estancias = [{ m2: '30', metros: '4' }, { m2: '12', metros: '6' }]; },
    // --- flujos paso a paso ------------------------------------------------------
    'jefe-obra-nueva': () => { base('u1'); A.nuevaObra(); V.draft.cliente = 'Familia Roca'; V.draft.dir = 'Camí de Son Vich 12, Esporles'; },
    'jefe-parte-p1': () => { base('u1'); A.nuevoParte('o1'); V.draft.desc = 'Montaje de la unidad exterior de aerotermia y conexión hidráulica al acumulador.'; V.draft.mats = [{ id: 'mm1', nombre: 'Tubo multicapa 20 mm', cant: '12 m', importe: '', compra: true }]; },
    'jefe-parte-p2': () => { base('u1'); A.nuevoParte('o1'); V.draft.desc = 'Montaje de la unidad exterior.'; V.draft.firmante = 'Miquel Roca'; V.view = 'p2'; },
    'jefe-parte-p3': () => { base('u1'); A.nuevoParte('o1'); V.draft.desc = 'Montaje de la unidad exterior.'; V.draft.firmante = 'Miquel Roca'; V.draft.firma = 'data:image/png;base64,iVBORw0KGgo='; V.view = 'p3'; },
    'jefe-imputar-grupo': () => { base('u1'); A.abrirImputGrupo(); },
    'admin-empleado-nuevo': () => { base('u0'); A.empNuevo(); V.empDraft.nombre = 'Joan'; V.empDraft.nombreCompleto = 'Joan Amengual Riera'; },
    'pres-cliente-nuevo': () => { base('u5'); m.agNuevoCliente(); V.clienteDraft.nombre = 'Marga Salom'; V.clienteDraft.telefono = '600 123 456'; V.clienteDraft.poblacion = 'Manacor'; },
    'pres-cita-nueva': () => { base('u5'); m.agNuevaCita('c4', false); },
    'pres-visita-nueva-1': () => { base('u5'); A.nuevaVisita(); },
    'pres-visita-nueva-3': () => { base('u5'); A.nuevaVisita(); V.visitaDraft._cliente = { id: 'c4', nombre: 'Pep Vidal', telefono: '600 777 888', nuevo: false }; V.visitaDraft.direccion = 'Major 3'; V.visitaDraft.poblacion = 'Inca'; V.visitaDraft.categorias = ['aire_acondicionado']; V.visitaPaso = 3; },
    'pres-visita-nueva-4': () => { base('u5'); A.nuevaVisita(); V.visitaDraft._cliente = { id: 'c4', nombre: 'Pep Vidal', telefono: '600 777 888', nuevo: false }; V.visitaDraft.direccion = 'Major 3'; V.visitaDraft.poblacion = 'Inca'; V.visitaDraft.categorias = ['aire_acondicionado']; V.visitaPaso = 4; V.visitaCat = 'aire_acondicionado'; V.visitaFichas = { aire_acondicionado: { tipo_sistema: 'multisplit', uso: 'frio_calor', estancias: [{ nombre: 'Salón', m2: 30, metros: 4 }, { nombre: 'Dormitorio', m2: 12, metros: 6 }] } }; },
    'pres-visita-ver': () => { base('u5'); V.view = 'visita'; V.visitaVer = { visita: Object.assign({}, VISITAS[1], { observaciones: 'Cuadro eléctrico en el garaje. Cubierta de teja en buen estado.' }), fichas: [{ id: 'fi1', categoria: 'aerotermia', datos: { sistema_actual: 'caldera_gasoleo', potencia_kw: 8 } }], adjuntos: [] }; },
    'pres-material': () => { base('u5'); V.view = 'material'; },
    'pres-perfil': () => { base('u5'); V.view = 'ajustes'; },
  };

  window.__manual = {
    lista: Object.keys(ESCENAS),
    escena(nombre) {
      const f = ESCENAS[nombre];
      if (!f) throw new Error('No hay escena ' + nombre);
      f();
      m.render();
      const sc = document.querySelector('.scroll,.hoja'); if (sc) sc.scrollTop = 0;
      return true;
    },
  };
})();
