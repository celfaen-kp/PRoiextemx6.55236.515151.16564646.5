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
    { id: 'u6', nombre: 'Sara', rol: 'colaborador', activo: true, pin: '6666', empId: 'e6' },
    { id: 'u0', nombre: 'Administración', rol: 'admin', activo: true, pin: '9999' },
  ];
  const EMP = [
    { id: 'e1', nombre: 'Marta', rol: 'jefe', activo: true, nombre_completo: 'Marta Vidal Soler', email_avisos: 'marta@sysefen.app' },
    { id: 'e2', nombre: 'Toni', rol: 'jefe', activo: true, nombre_completo: 'Toni Ferrer Mas' },
    { id: 'e3', nombre: 'Pau', rol: 'operario', activo: true, nombre_completo: 'Pau Serra Riera', vacaciones_anuales: 30 },
    { id: 'e4', nombre: 'Lucía', rol: 'operario', activo: true, nombre_completo: 'Lucía Gómez Pons' },
    { id: 'e5', nombre: 'Ramón', rol: 'presupuestos', activo: true, nombre_completo: 'Ramón Bauzá Coll', email_avisos: 'ramon@sysefen.app' },
    { id: 'e6', nombre: 'Sara', rol: 'colaborador', activo: true, nombre_completo: 'Sara Llull Bosch' },
  ];
  const OBRAS = [
    { id: 'o1', numero: 137, categorias: ['AE', 'FV'], nombre: 'Casa Can Roca', cliente: 'Familia Roca', titulo: 'Casa Can Roca', dir: 'Camí de Son Vich 12', poblacion: 'Esporles', estado: 'en_curso', creado_en: iso(40, 9) },
    { id: 'o2', numero: 138, categorias: ['FV'], nombre: 'Nave Polígono Son Castelló', cliente: 'Talleres Pons', titulo: 'Nave Polígono Son Castelló', dir: 'Gremi Fusters 8', poblacion: 'Palma', estado: 'en_curso', creado_en: iso(25, 9) },
    { id: 'o3', numero: 140, categorias: ['AC'], nombre: 'Piso Blanquerna', cliente: 'Ana Ferrer', titulo: 'Piso Blanquerna', dir: 'Blanquerna 41', poblacion: 'Palma', estado: 'planificada', creado_en: iso(10, 9) },
    { id: 'o4', numero: 1000, categorias: ['AE'], nombre: 'Villa Sa Coma', cliente: 'Catalina Mir', titulo: 'Villa Sa Coma', dir: 'Sol 21', poblacion: 'Sa Coma', estado: 'cerrada', creado_en: iso(90, 9) },
    { id: 'o5', numero: 141, categorias: ['AC'], nombre: '', cliente: 'Familia Gil', titulo: 'Familia Gil', dir: 'Arxiduc 18', poblacion: 'Palma', estado: 'planificada', creado_en: iso(0, 9) },
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
    { id: 'c4', nombre: 'Pep Vidal', telefono: '600 777 888', email: 'pep@correo.es', direccion: 'Major 3', poblacion: 'Inca', visitas: [], citas: [], contacto_estado: 'no_contesta', contacto_at: iso(-1, 11), contacto_por: 'e5', contacto_intentos: 2 },
    { id: 'c5', nombre: 'Marina Coll', telefono: '600 999 000', email: 'marina@correo.es', direccion: 'Sol 9', poblacion: 'Sóller', tl_id: 'tl-5', created_at: iso(9, 10), contacto_estado: 'contactado', contacto_at: iso(8, 10), contacto_por: 'e5',
      visitas: [{ id: 'v2', codigo: 'V-0009', estado: 'completada', sync_estado: 'sincronizada', fecha_visita: fecha(6) }], citas: [],
      presupuestos: [{ id: 'q1', categoria: 'aerotermia', total_venta: 14860.5, created_at: iso(5, 17), tl_quotation_id: 'tlq1', revisado_at: iso(4, 10), revisado_por: 'e5', enviado_cliente_at: iso(4, 11), enviado_cliente_por: 'e5', respuesta_cliente: 'pendiente' }],
      proxima_accion: 'Llamar: ¿lo ha mirado?', proxima_accion_at: fecha(-2), proxima_accion_por: 'e5' },
    { id: 'c6', nombre: 'Familia Roca', telefono: '600 123 456', email: 'miquel@correo.es', direccion: 'Camí de Son Vich 12', poblacion: 'Esporles', tl_id: 'tl-6', created_at: iso(60, 9), contacto_estado: 'contactado',
      visitas: [{ id: 'v6', codigo: 'V-0005', estado: 'completada', sync_estado: 'sincronizada', fecha_visita: fecha(50) }], citas: [],
      presupuestos: [{ id: 'q6a', categoria: 'aerotermia', total_venta: 11000, created_at: iso(48, 10), tl_quotation_id: 'tlq6a', revisado_at: iso(47, 10), enviado_cliente_at: iso(46, 10), respuesta_cliente: 'aceptado', respondido_at: iso(42, 10), obra_id: 'o1' },
        { id: 'q6b', categoria: 'solar', total_venta: 7400, created_at: iso(48, 11), tl_quotation_id: 'tlq6b', revisado_at: iso(47, 10), enviado_cliente_at: iso(46, 10), respuesta_cliente: 'aceptado', respondido_at: iso(42, 10), obra_id: 'o1' }] },
    { id: 'c7', nombre: 'Talleres Pons', tipo: 'empresa', telefono: '971 000 111', email: 'oficina@tallerespons.es', direccion: 'Gremi Fusters 8', poblacion: 'Palma', tl_id: 'tl-7', created_at: iso(40, 9), contacto_estado: 'contactado',
      visitas: [{ id: 'v7', codigo: 'V-0007', estado: 'completada', sync_estado: 'sincronizada', fecha_visita: fecha(34) }], citas: [],
      presupuestos: [{ id: 'q7', categoria: 'solar', total_venta: 23800, created_at: iso(32, 10), tl_quotation_id: 'tlq7', revisado_at: iso(31, 10), enviado_cliente_at: iso(31, 12), respuesta_cliente: 'aceptado', respondido_at: iso(27, 10), obra_id: 'o2' }] },
    { id: 'c8', nombre: 'Carme Bonet', telefono: '600 246 810', email: 'carme@correo.es', poblacion: 'Alaró', origen: 'web', lead_at: iso(0, 8), created_at: iso(0, 8), visitas: [], citas: [],
      motivo_web: 'Quiero poner placas en casa, tejado a dos aguas. Pago unos 140 € al mes de luz.' },
    { id: 'c9', nombre: 'Lluís Amengual', telefono: '600 135 791', email: 'lluis@correo.es', direccion: 'Pau 4', poblacion: 'Binissalem', tl_id: 'tl-9', created_at: iso(12, 9), contacto_estado: 'contactado',
      visitas: [{ id: 'v9', codigo: 'V-0010', estado: 'completada', sync_estado: 'sincronizada', fecha_visita: fecha(3) }], citas: [],
      presupuestos: [{ id: 'q9', categoria: 'solar', total_venta: 9980, created_at: iso(2, 11), estado: 'revisar', respuesta_cliente: 'pendiente' }] },
    { id: 'c10', nombre: 'Hotel Es Port', tipo: 'empresa', telefono: '971 222 333', email: 'direccion@hotelesport.es', poblacion: 'Port de Sóller', created_at: iso(20, 9), contacto_estado: 'contactado', visitas: [], citas: [],
      aplazado_hasta: fecha(-60), aplazado_motivo: 'Lo retoman al cerrar temporada' },
    { id: 'c11', nombre: 'Joan Riera', telefono: '600 864 200', email: 'joan@correo.es', poblacion: 'Manacor', tl_id: 'tl-11', created_at: iso(35, 9), contacto_estado: 'contactado',
      visitas: [{ id: 'v11', codigo: 'V-0006', estado: 'completada', sync_estado: 'sincronizada', fecha_visita: fecha(30) }], citas: [],
      presupuestos: [{ id: 'q11', categoria: 'aire_acondicionado', total_venta: 6200, created_at: iso(28, 10), tl_quotation_id: 'tlq11', revisado_at: iso(27, 10), enviado_cliente_at: iso(27, 12), respuesta_cliente: 'rechazado', respondido_at: iso(20, 10) }] },
    { id: 'c12', nombre: 'Catalina Mir', telefono: '600 975 310', email: 'cati@correo.es', direccion: 'Sol 21', poblacion: 'Sa Coma', tl_id: 'tl-12', created_at: iso(120, 9), contacto_estado: 'contactado', visitas: [], citas: [],
      presupuestos: [{ id: 'q12', categoria: 'aerotermia', total_venta: 12400, created_at: iso(110, 10), tl_quotation_id: 'tlq12', enviado_cliente_at: iso(108, 10), respuesta_cliente: 'aceptado', respondido_at: iso(104, 10), obra_id: 'o4' }] },
  ];
  // Lo que se ha hablado con cada cliente (la bitácora de su ficha).
  const BITACORA = {
    c5: [
      { id: 'b1', tipo: 'llamada', texto: 'Lo está mirando con su marido. Le interesa el depósito de 250 l; llamar el viernes.', at: iso(2, 12), por: 'e5' },
      { id: 'b2', tipo: 'presupuesto', texto: 'Presupuesto de Aerotermia enviado al cliente · 14.860,50 €', at: iso(4, 11), por: 'e5' },
      { id: 'b3', tipo: 'visita', texto: 'Visita V-0009 cerrada y enviada a Teamleader', at: iso(6, 12), por: 'e5' },
      { id: 'b4', tipo: 'llamada', texto: 'Contactada: quiere quitar la caldera de gasóleo antes del invierno.', at: iso(8, 10), por: 'e5' },
    ],
    c4: [{ id: 'b5', tipo: 'llamada', texto: 'No coge. Le dejo un WhatsApp.', at: iso(1, 11), por: 'e5' }],
    c10: [{ id: 'b6', tipo: 'nota', texto: 'Quieren fotovoltaica para la cubierta del comedor. Volver a llamar en enero.', at: iso(15, 10), por: 'e5' }],
  };
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
    { id: 'q1', categoria: 'aerotermia', titulo: null, total_venta: 14860.5, estado: 'enviado', sync_estado: 'sincronizado', tl_quotation_id: 'tlq1', tl_numero: '2026/641', created_at: iso(5, 17), cliente_id: 'c5', revisado_at: iso(4, 10), enviado_cliente_at: iso(4, 11), respuesta_cliente: 'pendiente', cliente: { nombre: 'Marina Coll' }, visita: { codigo: 'V-0009' } },
    { id: 'q7', categoria: 'solar', titulo: 'Talleres Pons · Fronius · 20 kWp', total_venta: 23800, estado: 'enviado', sync_estado: 'sincronizado', tl_quotation_id: 'tlq7', tl_numero: '2026/633', created_at: iso(32, 10), cliente_id: 'c7', revisado_at: iso(31, 10), enviado_cliente_at: iso(31, 12), respuesta_cliente: 'aceptado', respondido_at: iso(27, 10), obra_id: 'o2', cliente: { nombre: 'Talleres Pons' }, visita: { codigo: 'V-0007' } },
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

  // El presupuesto de la familia Gil, ya revisado (toca enviarlo) y después aceptado y firmado.
  const PRESU_REVISADO = Object.assign({}, PRESU_VER, { estado: 'aprobado', sync_estado: 'sincronizado', tl_quotation_id: 'tlq2', tl_numero: '2026/640', cliente_id: 'c13', cliente: { id: 'c13', nombre: 'Familia Gil' }, revisado_at: iso(0, 9), revisado_por: 'e5', respuesta_cliente: 'pendiente', validez_dias: 15 });
  const PRESU_ACEPTADO = Object.assign({}, PRESU_REVISADO, { estado: 'enviado', created_at: iso(6, 12), revisado_at: iso(5, 9), enviado_cliente_at: iso(5, 10), enviado_cliente_por: 'e5', enviado_correo_at: iso(5, 10), enviado_correo_a: 'familia.gil@correo.es',
    respuesta_cliente: 'aceptado', respondido_at: iso(1, 19), firmado_at: iso(1, 19), firma_nombre: 'Marta Gil Pons', firma_dni: '00000000T', pdf_firmado_ruta: 'x', obra_id: 'o5' });
  const EMPRESA = 'SYSEFEN GROUP 2024 SL';
  const fac = (o) => Object.assign({ tipo: 'factura', entidad: EMPRESA, cobros: [], origen: 'app' }, o);
  const FACTURAS = [
    fac({ id: 'fa6', tl_id: 't-fa6', numero: null, estado: 'borrador', pagada: false, fecha: fecha(0), vence: null, cliente_nombre: 'Familia Gil', base: 1710.9, iva: 359.29, total: 2070.19, pendiente: 2070.19, impuestos: [{ pct: 21, base: 1710.9, cuota: 359.29 }], lineas: [{ seccion: null, descripcion: 'Anticipo', cantidad: 1, precio: 1710.9, importe: 1710.9, iva_pct: 21 }], hito: { modo: 'porcentaje', pct: 50 }, presupuesto_id: 'q2' }),
    fac({ id: 'fa5', tl_id: 't-fa5', numero: '2026 / 214', estado: 'pendiente', pagada: false, fecha: fecha(8), vence: fecha(-22), cliente_nombre: 'Talleres Pons', cliente_email: 'oficina@tallerespons.es', base: 9520, iva: 1999.2, total: 11519.2, pendiente: 11519.2, impuestos: [{ pct: 21, base: 9520, cuota: 1999.2 }],
      lineas: [{ seccion: null, descripcion: 'Anticipo', descripcion_larga: 'Anticipo del 40 % del presupuesto 2026/633 · Instalación fotovoltaica de 20 kWp', cantidad: 1, precio: 9520, importe: 9520, iva_pct: 21 }], hito: { modo: 'porcentaje', pct: 40 }, presupuesto_id: 'q7', forma_pago: 'after_invoice_date:30' }),
    fac({ id: 'fa4', tl_id: 't-fa4', numero: '2026 / 209', estado: 'pendiente', pagada: false, fecha: fecha(40), vence: fecha(10), cliente_nombre: 'Catalina Mir', base: 6200, iva: 1302, total: 7502, pendiente: 7502, impuestos: [{ pct: 21, base: 6200, cuota: 1302 }], lineas: [{ descripcion: 'Resto de la instalación de aerotermia', cantidad: 1, precio: 6200, importe: 6200, iva_pct: 21 }], origen: 'teamleader' }),
    fac({ id: 'fa3', tl_id: 't-fa3', numero: '2026 / 205', estado: 'pagada', pagada: true, fecha: fecha(42), vence: fecha(42), cliente_nombre: 'Familia Roca', base: 5500, iva: 1155, total: 6655, pendiente: 0, impuestos: [{ pct: 21, base: 5500, cuota: 1155 }], lineas: [{ descripcion: 'Anticipo', cantidad: 1, precio: 5500, importe: 5500, iva_pct: 21 }], cobros: [{ importe: 6655, fecha: fecha(40) }], hito: { modo: 'porcentaje', pct: 50 }, presupuesto_id: 'q6a' }),
    fac({ id: 'fa2', tipo: 'abono', tl_id: 't-fa2', numero: 'R2026 / 12', estado: 'emitido', fecha: fecha(55), cliente_nombre: 'Joan Riera', base: 300, iva: 63, total: 363, tl_factura_abonada_id: 't-fa1', impuestos: [{ pct: 21, base: 300, cuota: 63 }], lineas: [{ descripcion: 'Abono de la visita técnica', cantidad: 1, precio: 300, importe: 300, iva_pct: 21 }], origen: 'teamleader' }),
    fac({ id: 'fa1', tl_id: 't-fa1', numero: '2026 / 198', estado: 'pagada', pagada: true, fecha: fecha(60), vence: fecha(60), cliente_nombre: 'Joan Riera', base: 300, iva: 63, total: 363, pendiente: 0, impuestos: [{ pct: 21, base: 300, cuota: 63 }], lineas: [{ descripcion: 'Visita técnica', cantidad: 1, precio: 300, importe: 300, iva_pct: 21 }], cobros: [{ importe: 363, fecha: fecha(58) }], origen: 'teamleader' }),
  ];
  const FAC_OPCIONES = { entidades: [{ id: 'en1', nombre: EMPRESA }], entidad_id: 'en1',
    ivas: { en1: [{ id: 'i0', nombre: 'Ventas 0% IVA', pct: 0 }, { id: 'i10', nombre: 'Ventas 10% IVA', pct: 10 }, { id: 'i21', nombre: 'Ventas 21% IVA', pct: 21 }] },
    formas_pago: [{ type: 'cash', days: 0 }, { type: 'after_invoice_date', days: 30 }],
    cliente: { id: 'c13', nombre: 'Familia Gil', nif: '00000000T', en_teamleader: true },
    presupuesto: { id: 'q2', titulo: 'Aire acondicionado · Gil', numero: '2026/640', total: 3421.8, aceptado: true, en_teamleader: true },
    lineas: PRESU_VER.lineas.map((l, i) => ({ id: 'l' + (i + 1), seccion: l.seccion, descripcion: l.descripcion, cantidad: l.cantidad, precio_venta: l.precio_venta })),
    facturas: [] };
  // Unos pocos precios del modelo fotovoltaico, para la pantalla de Precios.
  const PRECIOS_FV = [
    { grupo: 'Precios de venta y margen', ruta: ['parametros', 'margen_obj'], nombre: 'Margen objetivo sobre la venta (0,5 = 50 %)', valor: 0.5, ud: '', nota: '' },
    { grupo: 'Precios de venta y margen', ruta: ['parametros', 'venta_jornada'], nombre: 'Mano de obra: venta de la jornada de la pareja', valor: 880, ud: '€', nota: '' },
    { grupo: 'Precios de venta y margen', ruta: ['parametros', 'venta_documentacion'], nombre: 'Documentación y legalización: precio de venta', valor: 400, ud: '€', nota: '' },
    { grupo: 'Precios de venta y margen', ruta: ['parametros', 'horas_documentacion'], nombre: 'Documentación y legalización: horas de Xavi', valor: 5, ud: 'h', nota: '' },
    { grupo: 'Costes de personal y desplazamiento', ruta: ['parametros', 'eur_h'], nombre: 'Coste de la hora de técnico y oficina', valor: 40, ud: '€/h', nota: '' },
    { grupo: 'Costes de personal y desplazamiento', ruta: ['parametros', 'horas_jornada'], nombre: 'Horas de una jornada', valor: 8, ud: 'h', nota: '' },
  ];

  const EMPRESA_LEG = { email_legalizaciones: 'xavi@sysefen.app', instalador_razon_social: 'Sysefen Eficiencia Energética SL', instalador_numero: 'IB-01234', instalador_nombre: 'Xavier Pons Mas', instalador_nif: '43111222K', instalador_direccion: 'Gremi Fusters 8', instalador_cp_localidad: '07009 Palma', instalador_telefono: '696 284 058', aparato_verificador: 'Fluke 1736 · nº 4521008' };
  const LEGS = [
    { id: 'L1', obra_id: 'o1', cliente_id: 'c2', estado: 'borrador', created_at: iso(1, 10), updated_at: iso(0, 9), obra: { id: 'o1', nombre: 'Casa Can Roca', cliente: 'Familia Roca' },
      datos: { cliente_nombre: 'Miquel Roca Vidal', cliente_dni: '43222333L', cliente_direccion: 'Camí de Son Vich 12', cliente_cp_localidad: '07190 Esporles', cliente_telefono: '600 123 456', cliente_email: 'miquel@correo.es',
        inst_direccion: 'Camí de Son Vich 12', inst_cp_localidad: '07190 Esporles', inst_poblacion: 'Esporles', inst_ref_catastral: '07020A00500123', inst_cups: 'ES0031408123456789JK', inst_cau: 'ES0031408123456789JKA000',
        inst_tipo_terreno: 'rustico', inst_uso: 'domestico', inst_modalidad: 'con_exc_con_comp', inst_potencia_kw: 5.1, inst_tension: '230', inst_edm_alquiler: 'si', inst_serv_aux: 'no', inst_colectivo: 'no', inst_proxima_red: 'no', inst_acumulacion: 'no', inst_no_vertido: 'no', inst_limitacion_parcial: 'no', inst_venta_100: 'no', inst_edm_gen_neta: 'no',
        rec_potencia_contratada: 5.75, rec_distribuidora: 'e-distribución', fv_inv_cantidad: 1, fv_inv_modelo: 'Fronius Primo GEN24 4.6', fv_inv_potencia_kw: 4.6, fv_pan_cantidad: 10, fv_pan_modelo: 'Trina Vertex S 510', fv_pan_potencia_w: 510, fv_ubicacion: 'cubierta', fv_orientacion: 'Sur', fv_inclinacion: 30, fv_frecuencia: 50,
        prev_generada: 7800, prev_autoconsumida: 4200, prev_vertida: 3600, verif_fecha: hoy } },
    { id: 'L2', obra_id: 'o2', estado: 'enviada', enviada_a: 'xavi@sysefen.app', enviada_at: iso(6, 12), created_at: iso(8, 10), updated_at: iso(6, 12), obra: { id: 'o2', nombre: 'Nave Polígono Son Castelló', cliente: 'Talleres Pons' },
      datos: { cliente_nombre: 'Talleres Pons SL', cliente_dni: 'B07123456', inst_direccion: 'Gremi Fusters 8', inst_potencia_kw: 20, verif_hecha: true } },
  ];

  // --- lo común a todas las escenas ------------------------------------------
  const FASES = [
    { id: 'f1', obra_id: 'o1', categoria: null, orden: 10, nombre: 'Pedido de material', pct: 100, no_aplica: false, hecha_en: iso(30, 9), hecha_por: 'e1' },
    { id: 'f2', obra_id: 'o1', categoria: null, orden: 20, nombre: 'Recepción de material', pct: 80, no_aplica: false },
    { id: 'f3', obra_id: 'o1', categoria: null, orden: 30, nombre: 'Replanteo', pct: 100, no_aplica: false },
    { id: 'f4', obra_id: 'o1', categoria: 'AE', orden: 210, nombre: 'Ubicación unidad exterior', pct: 100, no_aplica: false },
    { id: 'f5', obra_id: 'o1', categoria: 'AE', orden: 220, nombre: 'Sala de máquinas', pct: 50, no_aplica: false },
    { id: 'f5b', obra_id: 'o1', categoria: 'AE', orden: 225, nombre: 'Emisores', pct: 0, no_aplica: false, opciones_posibles: ['Suelo radiante', 'Fancoils', 'Radiadores'], opciones: ['Suelo radiante'] },
    { id: 'f6', obra_id: 'o1', categoria: 'AE', orden: 230, nombre: 'Hidráulica', pct: 0, no_aplica: false },
    { id: 'f7', obra_id: 'o1', categoria: 'AE', orden: 240, nombre: 'Eléctrica', pct: 0, no_aplica: false },
    { id: 'f8', obra_id: 'o1', categoria: 'AE', orden: 250, nombre: 'Puesta en marcha', pct: 0, no_aplica: false },
    { id: 'f9', obra_id: 'o1', categoria: 'AE', orden: 260, nombre: 'Legalización', pct: 0, no_aplica: false },
    { id: 'f10', obra_id: 'o1', categoria: 'FV', orden: 110, nombre: 'Fijaciones y estructura', pct: 100, no_aplica: false },
    { id: 'f11', obra_id: 'o1', categoria: 'FV', orden: 120, nombre: 'Montaje de paneles', pct: 75, no_aplica: false },
    { id: 'f12', obra_id: 'o1', categoria: 'FV', orden: 130, nombre: 'Cableado de continua', pct: 25, no_aplica: false },
    { id: 'f13', obra_id: 'o1', categoria: 'FV', orden: 140, nombre: 'Inversor y baterías', pct: 0, no_aplica: false },
    { id: 'f14', obra_id: 'o1', categoria: 'FV', orden: 150, nombre: 'Cableado de alterna y protecciones', pct: 0, no_aplica: false },
    { id: 'f15', obra_id: 'o1', categoria: 'FV', orden: 160, nombre: 'Puesta en marcha', pct: 0, no_aplica: false },
    { id: 'f16', obra_id: 'o1', categoria: 'FV', orden: 170, nombre: 'Legalización', pct: 0, no_aplica: false },
    { id: 'f17', obra_id: 'o1', categoria: null, orden: 900, nombre: 'Cobro final', pct: 0, no_aplica: false },
    { id: 'f20', obra_id: 'o2', categoria: 'FV', orden: 110, nombre: 'Fijaciones y estructura', pct: 100, no_aplica: false },
    { id: 'f21', obra_id: 'o2', categoria: 'FV', orden: 120, nombre: 'Montaje de paneles', pct: 100, no_aplica: false },
    { id: 'f22', obra_id: 'o2', categoria: 'FV', orden: 160, nombre: 'Puesta en marcha', pct: 50, no_aplica: false },
  ];
  function base(userId) {
    S.users = USERS.map((u) => Object.assign({}, u));
    S.obras = OBRAS.map((o) => Object.assign({}, o));
    S.fichajes = FICHAJES.map((f) => Object.assign({}, f));
    S.imputaciones = IMPUT.map((i) => Object.assign({}, i));
    S.partes = PARTES.map((p) => Object.assign({}, p));
    S.fases = FASES.map((f) => Object.assign({}, f)); V.fasesCargadas = true;
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
    V.bitacora = BITACORA; V.agenda.vista = 'tablero'; V.agenda.tbOrden = {}; V.agenda.ultimoCliente = null; V.agenda.visitasCliente = {};
    V.fac = { lista: FACTURAS.map((f) => Object.assign({}, f)), cargando: false, error: null, buscar: '', filtro: 'todas', sync: null };
    V.presuVer = null; V.presuEdit = null; V.precios = null;
    V.copias = { cargado: true, busy: false, enCurso: null, error: null, lista: [{ estado: 'ok', terminada_en: iso(3, 4), tablas: 53, filas: 48210, archivos: 1930, bytes: 812 * 1048576, nombre: 'copia-' + fecha(3) }] };
    V.listaCompra = { busy: null, correos: ['ramon@sysefen.app', 'oficina@sysefen.app'], correosTxt: null, correosBusy: false, error: null };
    V.crm = Object.assign(V.crm || {}, { cargado: true, conectado: true, busy: false, error: null });
    try { m.limpiarBorradorVisita(); } catch (e) {}
  }

  const ESCENAS = {
    // --- entrar -----------------------------------------------------------------
    'login': () => { base(null); V.view = 'login'; },
    'pin': () => { base(null); V.view = 'pin'; V.pinUser = 'u3'; V.pin = '12'; },
    // --- operario ---------------------------------------------------------------
    'op-hoy-fuera': () => { base('u4'); V.view = 'hoy'; },
    'op-hoy-dentro': () => { base('u3'); V.view = 'hoy'; },
    'op-hoy-plan': () => { base('u3'); V.view = 'hoy'; const hoy = new Date().toISOString().slice(0, 10); V.planCargado = true; V.planMio = [{ id: 'plx', fecha: hoy, empleado_id: 'e3', obra_id: 'o1', codigo: 'OB-137', cliente: 'Familia Roca', obra: 'Casa Can Roca', direccion: 'Camí de Son Vich 12', poblacion: 'Esporles', categorias: ['AE', 'FV'], hora_prevista: '08:00:00', nota: 'Llevar escalera grande', planificador: 'Ramón' }]; },
    'op-hoy-sinplan': () => { base('u3'); V.view = 'hoy'; V.planCargado = true; V.planMio = []; },
    'op-obras': () => { base('u3'); V.view = 'obras'; },
    'op-horas': () => { base('u3'); V.view = 'horas'; },
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
    'admin-planificacion': () => { base('u0'); const hoy = new Date(); const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7)); const f = (n) => { const d = new Date(lunes); d.setDate(lunes.getDate() + n); return d.toISOString().slice(0, 10); };
      V.plan = { lunes: f(0), dia: f(2), finde: false, cargado: true, cargando: false, error: null, filas: [
        { id: 'pl1', fecha: f(0), empleado_id: 'e3', obra_id: 'o1', empleado: 'Pau', codigo: 'OB-137', cliente: 'Familia Roca', obra: 'Casa Can Roca', direccion: 'Camí de Son Vich 12', poblacion: 'Esporles', categorias: ['AE', 'FV'], obra_estado: 'en_curso', hora_prevista: '08:00:00', nota: null },
        { id: 'pl2', fecha: f(0), empleado_id: 'e4', obra_id: 'o1', empleado: 'Marta', codigo: 'OB-137', cliente: 'Familia Roca', obra: 'Casa Can Roca', direccion: 'Camí de Son Vich 12', poblacion: 'Esporles', categorias: ['AE', 'FV'], obra_estado: 'en_curso', hora_prevista: '08:00:00', nota: null },
        { id: 'pl3', fecha: f(1), empleado_id: 'e3', obra_id: 'o1', empleado: 'Pau', codigo: 'OB-137', cliente: 'Familia Roca', obra: 'Casa Can Roca', direccion: 'Camí de Son Vich 12', poblacion: 'Esporles', categorias: ['AE', 'FV'], obra_estado: 'en_curso', hora_prevista: null, nota: 'Llevar escalera grande' },
        { id: 'pl4', fecha: f(1), empleado_id: 'e1', obra_id: 'o2', empleado: 'Toni', codigo: 'OB-138', cliente: 'Talleres Pons', obra: 'Nave', direccion: 'Gremi Fusters 8', poblacion: 'Palma', categorias: ['FV'], obra_estado: 'en_curso', hora_prevista: '07:30:00', nota: null },
        { id: 'pl5', fecha: f(2), empleado_id: 'e4', obra_id: 'o3', empleado: 'Marta', codigo: 'OB-140', cliente: 'Ana Ferrer', obra: 'Piso Blanquerna', direccion: 'Blanquerna 41', poblacion: 'Palma', categorias: ['AC'], obra_estado: 'planificada', hora_prevista: '09:00:00', nota: null },
      ] }; V.view = 'planificacion'; },
    // --- presupuestos (Ramón) -------------------------------------------------------
    'pres-agenda': () => { base('u5'); V.view = 'agenda'; },
    'pres-agenda-mes': () => { base('u5'); V.view = 'agenda'; V.agenda.verMes = true; },
    'pres-cita': () => { base('u5'); V.view = 'citaVer'; V.citaVerId = 'x1'; },
    'pres-clientes': () => { base('u5'); V.view = 'clientes'; },
    'pres-tablero': () => { base('u5'); V.view = 'clientes'; },   // el mismo tablero, a lo ancho (ordenador)
    'pres-tablero-2': () => { base('u5'); V.view = 'clientes'; window.__scrollX = 1560; },   // y sus columnas de la derecha
    'pres-clientes-lista': () => { base('u5'); V.agenda.vista = 'lista'; V.agenda.filtroCli = 'esperando'; V.view = 'clientes'; },
    'pres-cliente': () => { base('u5'); V.view = 'clienteVer'; V.clienteVerId = 'c5'; },
    'pres-cliente-seguimiento': () => { ESCENAS['pres-cliente'](); window.__scrollTxt = 'Llamada'; },
    'pres-cliente-obra': () => { base('u5'); V.view = 'clienteVer'; V.clienteVerId = 'c6'; },
    'pres-visitas': () => { base('u5'); V.view = 'visitas'; },
    'pres-presupuestos': () => { base('u5'); V.view = 'presupuestos'; },
    'pres-presu-ver': () => { base('u5'); V.view = 'presupuestoVer'; V.presuVer = { id: 'q2', cargando: false, datos: PRESU_VER, error: null }; V.presuEdit = null; },
    'pres-presu-enviar-btn': () => { base('u5'); V.view = 'presupuestoVer'; V.presuVer = { id: 'q2', cargando: false, datos: PRESU_REVISADO, error: null, facturas: [] }; window.__scrollTxt = 'Revisado · por enviar'; },
    'pres-presu-enviar': () => { ESCENAS['pres-presu-enviar-btn'](); window.__scrollA = 0;
      V.sheet = { tipo: 'presuEnviar', id: 'q2', ids: ['q2'], otros: [], v: { para: 'familia.gil@correo.es', cc: '', asunto: '', mensaje: 'Hola Marta: te mando el presupuesto del aire del salón y el dormitorio, como hablamos. Cualquier duda, me llamas.', idioma: 'es' }, confirmar: false, busy: false, paso: '', trad: null }; },
    'pres-presu-aceptado': () => { base('u5'); V.view = 'presupuestoVer'; V.presuVer = { id: 'q2', cargando: false, datos: PRESU_ACEPTADO, error: null, facturas: [FACTURAS[0]] }; window.__scrollTxt = '✓ Aceptado y firmado'; },
    'pres-facturas': () => { base('u5'); V.view = 'facturas'; },
    'pres-factura': () => { base('u5'); V.view = 'facturas'; const f = V.fac.lista.find((x) => x.id === 'fa5'); V.sheet = { tipo: 'facVer', id: f.id, f, busy: false, confirmar: '', v: { fecha: hoy, importe: '', concepto: '' }, abonadas: {} }; },
    'pres-facturar': () => { base('u5'); V.view = 'presupuestoVer'; V.presuVer = { id: 'q2', cargando: false, datos: PRESU_ACEPTADO, error: null, facturas: [] };
      V.sheet = { tipo: 'facNueva', presupuestoId: 'q2', cargando: false, op: FAC_OPCIONES, err: null, busy: false,
        v: { entidad: 'en1', modo: 'porcentaje', pct: '50', importe: '', concepto: '', iva: 'i21', fecha: hoy, pago: 'cash:0', nota: '', partidas: {}, descontar: {}, lineas: [{ descripcion: '', cantidad: '1', precio: '' }] } }; },
    'pres-gestoria': () => { base('u5'); V.view = 'facturas'; V.sheet = { tipo: 'facGestoria', anio: hoy.slice(0, 4), k: 'T' + Math.ceil(Number(hoy.slice(5, 7)) / 3), entidad: EMPRESA, empresas: [EMPRESA], busy: false, txt: '' }; },
    'pres-precios': () => { base('u5'); V.precios = { tab: 'fv', filtro: '', fv: PRECIOS_FV, fvVersion: 'v2.1', fvErr: null, fvEd: {}, buscar: '', prods: null, prodErr: null, buscando: false, conceptos: null, conErr: null, conEd: {}, coef: [], historial: null, hisErr: null, busy: false }; V.view = 'precios'; },
    'colab-clientes': () => { base('u6'); V.agenda.clientes = V.agenda.clientes.filter((c) => ['c5', 'c9'].includes(c.id)); V.agenda.vista = 'lista'; V.agenda.filtroCli = 'todos'; V.view = 'clientes'; },
    'admin-ajustes-copias': () => { base('u0'); V.view = 'ajustes'; window.__scrollA = 99999; },
    'jefe-apuntar-horas': () => { base('u1'); V.view = 'obra'; V.obraId = 'o1'; V.obraRango = 'total'; A.horasObraAbrir('o1'); if (V.sheet) { V.sheet.horas = '2'; V.sheet.nota = 'Recoger material en el almacén'; } },
    'pres-presu-nuevo': () => { base('u5'); A.presuNuevo(); V.suelto.cat = 'aire_acondicionado'; V.suelto.cliente = 'Familia Gil'; V.suelto.equipos = 2; V.suelto.estancias = [{ m2: '30', metros: '4' }, { m2: '12', metros: '6' }]; },
    // --- flujos paso a paso ------------------------------------------------------
    'jefe-parte-avance': () => { base('u1'); A.nuevoParte('o1'); V.draft.desc = 'Montaje de los últimos paneles y tirada del cableado de continua.'; V.draft.avance = { f11: 100, f12: 75 }; },
    'admin-fases-plantillas': () => { base('u0'); V.view = 'fasesPlantillas'; V.plantillas = [{ id: 't1', categoria: null, orden: 10, nombre: 'Pedido de material', activa: true }, { id: 't2', categoria: null, orden: 20, nombre: 'Recepción de material', activa: true }, { id: 't3', categoria: null, orden: 30, nombre: 'Replanteo', activa: true }, { id: 't4', categoria: 'FV', orden: 110, nombre: 'Fijaciones y estructura', descripcion: 'Anclajes, pies y perfilería en cubierta', activa: true }, { id: 't5', categoria: 'FV', orden: 120, nombre: 'Montaje de paneles', activa: true }, { id: 't6', categoria: 'FV', orden: 140, nombre: 'Inversor y baterías', activa: true }, { id: 't7', categoria: 'AE', orden: 210, nombre: 'Ubicación unidad exterior', activa: true }, { id: 't8', categoria: 'AC', orden: 310, nombre: 'Unidades interiores', activa: false }, { id: 't9', categoria: null, orden: 900, nombre: 'Cobro final', al_final: true, activa: true }]; },
    'jefe-obra-nueva': () => { base('u1'); A.nuevaObra(); V.draft.cliente = 'Familia Roca'; V.draft.dir = 'Camí de Son Vich 12, Esporles'; },
    'jefe-parte-p1': () => { base('u1'); A.nuevoParte('o1'); V.draft.desc = 'Montaje de la unidad exterior de aerotermia y conexión hidráulica al acumulador.'; V.draft.mats = [{ id: 'mm1', nombre: 'Tubo multicapa 20 mm', cant: '12 m', importe: '', compra: true }]; },
    'jefe-parte-p2': () => { base('u1'); A.nuevoParte('o1'); V.draft.desc = 'Montaje de la unidad exterior.'; V.draft.horas = { u1: 7, u3: 7.5 }; V.draft.firmante = 'Miquel Roca'; V.view = 'p2'; },
    'jefe-parte-p3': () => { base('u1'); A.nuevoParte('o1'); V.draft.desc = 'Montaje de la unidad exterior.'; V.draft.horas = { u1: 7, u3: 7.5 }; V.draft.firmante = 'Miquel Roca'; V.draft.firma = 'data:image/png;base64,iVBORw0KGgo='; V.view = 'p3'; },
    'jefe-imputar-grupo': () => { base('u1'); A.abrirImputGrupo(); },
    'admin-empleado-nuevo': () => { base('u0'); A.empNuevo(); V.empDraft.nombre = 'Joan'; V.empDraft.nombreCompleto = 'Joan Amengual Riera'; },
    'pres-cliente-nuevo': () => { base('u5'); m.agNuevoCliente(); V.clienteDraft.nombre = 'Marga Salom'; V.clienteDraft.telefono = '600 123 456'; V.clienteDraft.poblacion = 'Manacor'; },
    'pres-cita-nueva': () => { base('u5'); m.agNuevaCita('c4', false); V.citaDraft.dia = new Date().toISOString().slice(0, 10); V.citaDraft.empleadoId = 'e5'; },
    'pres-obras': () => { base('u5'); V.view = 'obras'; },
    'admin-obra': () => { base('u0'); V.obraId = 'o1'; V.view = 'obra'; V.eco.o1 = { eco: { venta_presupuestada: 18400, coste_previsto: 12900, coste_real: 11250, coste_mano_obra_real: 6800, coste_material_real: 4450, margen_previsto: 5500, margen_real: 7150, horas_reales: 116, horas_previstas: 128, pct_horas: 90.6, dias_sin_coste: 0 }, categorias: [{ categoria: 'aerotermia', venta_presupuestada: 11000, coste_mano_obra_real: 4200, coste_material_real: 3000, horas_reales: 72, horas_previstas: 80 }, { categoria: 'solar', venta_presupuestada: 7400, coste_mano_obra_real: 2600, coste_material_real: 1450, horas_reales: 44, horas_previstas: 48 }], presupuestos: [{ id: 'p1', categoria: 'aerotermia', total_venta: 11000, visita: { codigo: 'V-2026-0012' } }, { id: 'p2', categoria: 'solar', total_venta: 7400, visita: { codigo: 'V-2026-0012' } }] }; },
    'jefe-obra-proyecto': () => { ESCENAS['jefe-obra'](); window.__scrollTxt = 'Proyecto'; },
    'admin-obra-economia': () => { ESCENAS['admin-obra'](); window.__scrollTxt = 'Economía'; },
    'admin-costes': () => { base('u0'); V.view = 'costesPersonal'; V.costesEmp = [{ empleado_id: 'e1', coste_hora: 24.5, desde: '2026-01-01', hasta: null }, { empleado_id: 'e1', coste_hora: 22, desde: '2025-01-01', hasta: '2025-12-31' }, { empleado_id: 'e3', coste_hora: 19, desde: '2026-03-01', hasta: null }, { empleado_id: 'e2', coste_hora: 26, desde: '2026-01-01', hasta: null }]; },
    'pres-visita-nueva-1': () => { base('u5'); A.nuevaVisita(); },
    'pres-visita-nueva-3': () => { base('u5'); A.nuevaVisita(); V.visitaDraft._cliente = { id: 'c4', nombre: 'Pep Vidal', telefono: '600 777 888', nuevo: false }; V.visitaDraft.direccion = 'Major 3'; V.visitaDraft.poblacion = 'Inca'; V.visitaDraft.categorias = ['aire_acondicionado']; V.visitaPaso = 3; },
    'pres-visita-nueva-4': () => { base('u5'); A.nuevaVisita(); V.visitaDraft._cliente = { id: 'c4', nombre: 'Pep Vidal', telefono: '600 777 888', nuevo: false }; V.visitaDraft.direccion = 'Major 3'; V.visitaDraft.poblacion = 'Inca'; V.visitaDraft.categorias = ['aire_acondicionado']; V.visitaPaso = 4; V.visitaCat = 'aire_acondicionado'; V.visitaFichas = { aire_acondicionado: { tipo_sistema: 'multisplit', uso: 'frio_calor', estancias: [{ nombre: 'Salón', m2: 30, metros: 4 }, { nombre: 'Dormitorio', m2: 12, metros: 6 }] } }; },
    'pres-visita-ver': () => { base('u5'); V.view = 'visita'; V.visitaVer = { visita: Object.assign({}, VISITAS[1], { observaciones: 'Cuadro eléctrico en el garaje. Cubierta de teja en buen estado.' }), fichas: [{ id: 'fi1', categoria: 'aerotermia', datos: { sistema_actual: 'caldera_gasoleo', potencia_kw: 8 } }], adjuntos: [] }; },
    // Legalizaciones apagadas (V32.0, legalizacion/LEEME.md): al volver a encenderlas, quitar las dos barras de estas cinco escenas.
    // 'pres-legalizaciones': () => { base('u5'); V.view = 'legalizaciones'; V.legLista = { cargado: true, cargando: false, error: null, filas: LEGS }; S.leg = EMPRESA_LEG; },
    'pres-cliente-sincita': () => { base('u5'); V.view = 'clienteVer'; V.clienteVerId = 'c8'; },
    // 'jefe-legalizaciones': () => { base('u1'); V.view = 'legalizaciones'; V.legLista = { cargado: true, cargando: false, error: null, filas: LEGS }; S.leg = EMPRESA_LEG; },
    // 'jefe-legalizacion': () => { base('u1'); S.leg = EMPRESA_LEG; V.legLista = { cargado: true, cargando: false, error: null, filas: LEGS }; V.legVer = Object.assign({}, LEGS[0], { datos: Object.assign({}, LEGS[0].datos) }); V.legPaso = 'produccion'; V.legErr = null; V.legOk = null; V.view = 'legalizacion'; },
    // 'jefe-legalizacion-verif': () => { base('u1'); S.leg = EMPRESA_LEG; V.legVer = Object.assign({}, LEGS[0], { datos: Object.assign({}, LEGS[0].datos, { verif_hecha: true, verif_retorno: 'si', verif_ucon: 231, verif_udes: 236, verif_dv: 1.2, verif_cosp: 0.99, verif_thd_l1: 2.1, verif_h3_l1: 1.4 }) }); V.legPaso = 'verificacion'; V.view = 'legalizacion'; },
    // 'admin-ajustes-legalizacion': () => { base('u0'); S.leg = EMPRESA_LEG; V.view = 'ajustes'; },
    'pres-perfil': () => { base('u5'); V.view = 'ajustes'; },
  };

  window.__manual = {
    lista: Object.keys(ESCENAS),
    escena(nombre) {
      const f = ESCENAS[nombre];
      if (!f) throw new Error('No hay escena ' + nombre);
      f();
      const hoja = V.sheet;
      m.render();
      // La app cierra en silencio una hoja que revienta al pintarse: aquí tiene que saberse.
      if (hoja && !V.sheet) { V.sheet = hoja; try { m.hojaHTML(); } catch (e) { throw new Error('La hoja «' + hoja.tipo + '» no se pinta: ' + (e && e.message)); } }
      // Una escena puede pedir salir desplazada (window.__scrollA) para fotografiar lo de abajo.
      const sc = document.querySelector('.scroll,.hoja'); if (sc) sc.scrollTop = window.__scrollA || 0; window.__scrollA = 0;
      // O hasta un texto (window.__scrollTxt): el primer rótulo que empiece así queda arriba.
      if (sc && window.__scrollTxt) {
        const t = String(window.__scrollTxt).toLowerCase();
        const el = [...sc.querySelectorAll('div,span')].find((x) => x.childElementCount === 0 && x.textContent.trim().toLowerCase().startsWith(t));
        if (el) sc.scrollTop = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 16;
      }
      window.__scrollTxt = '';
      // Y de lado (window.__scrollX): el tablero de clientes, para enseñar las columnas de la derecha.
      const tb = document.querySelector('.tb-wrap'); if (tb) tb.scrollLeft = window.__scrollX || 0; window.__scrollX = 0;
      return true;
    },
  };
})();
