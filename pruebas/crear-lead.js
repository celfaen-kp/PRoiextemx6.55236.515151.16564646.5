/* La puerta de los agentes (crear-lead, sql/etapa114): lo que se revisa antes
 * de llegar a la base, y que la app llame a cada origen por su nombre. La regla
 * de duplicados vive en la base (crear_lead) y se prueba allí. */
load(RUTA_TMP + '/crear-lead.js');
var preparar = LEAD.preparar, FUENTES = LEAD.FUENTES;
var AHORA = Date.parse('2026-11-18T10:00:00Z');
var bien = function (extra) { return Object.assign({ fuente: 'vaillant', nombre: 'Marta Riera', telefono: '+34 600 11 22 33' }, extra || {}); };

titulo('lo que no pasa');
igual('sin cuerpo', !!preparar(null, AHORA).error, true);
igual('una lista no vale', !!preparar([], AHORA).error, true);
igual('fuente que no existe', preparar(bien({ fuente: 'tiktok' }), AHORA).campo, 'fuente');
igual('sin fuente', preparar(bien({ fuente: '' }), AHORA).campo, 'fuente');
igual('sin nombre', preparar(bien({ nombre: ' ' }), AHORA).campo, 'nombre');
igual('sin teléfono ni correo', preparar({ fuente: 'meta', nombre: 'Ana' }, AHORA).campo, 'telefono');
igual('teléfono corto', preparar(bien({ telefono: '12345' }), AHORA).campo, 'telefono');
igual('teléfono con letras', preparar(bien({ telefono: '600112233 ext' }), AHORA).campo, 'telefono');
igual('correo roto', preparar(bien({ email: 'marta@' }), AHORA).campo, 'email');
igual('tipo raro', preparar(bien({ tipo: 'autonomo' }), AHORA).campo, 'tipo');
igual('fecha que no es fecha', preparar(bien({ recibido_at: 'ayer' }), AHORA).campo, 'recibido_at');

titulo('lo que pasa, limpio');
var r = preparar(bien({ fuente: ' Vaillant ', nombre: '  Marta   Riera ', email: ' Marta@Ejemplo.ES ', ref: ' V-1 ', nif: '43000000x', poblacion: ' Palma ' }), AHORA).p;
igual('fuente en minúsculas', r.fuente, 'vaillant');
igual('con su nombre para la app', r.fuente_nombre, 'Vaillant');
igual('nombre sin espacios de más', r.nombre, 'Marta Riera');
igual('correo en minúsculas', r.email, 'marta@ejemplo.es');
igual('teléfono como llegó', r.telefono, '+34 600 11 22 33');
igual('ref', r.ref, 'V-1');
igual('NIF en mayúsculas', r.nif, '43000000X');
igual('población', r.poblacion, 'Palma');
igual('particular si no se dice', r.tipo, 'particular');
igual('sin fecha, la pone la base', r.recibido_at, null);
igual('solo con correo vale', preparar({ fuente: 'meta', nombre: 'Ana Pons', email: 'ana@ejemplo.es' }, AHORA).p.telefono, null);
igual('saunier se llama Saunier Duval', preparar(bien({ fuente: 'saunier' }), AHORA).p.fuente_nombre, 'Saunier Duval');
igual('empresa', preparar(bien({ tipo: 'Empresa' }), AHORA).p.tipo, 'empresa');
igual('fecha pasada se respeta', preparar(bien({ recibido_at: '2026-11-17T08:30:00Z' }), AHORA).p.recibido_at, '2026-11-17T08:30:00.000Z');
igual('fecha futura se queda en ahora', preparar(bien({ recibido_at: '2027-01-01T00:00:00Z' }), AHORA).p.recibido_at, '2026-11-18T10:00:00.000Z');

titulo('qué pidió');
igual('nada', preparar(bien(), AHORA).p.motivo, null);
igual('interés, mensaje y formulario',
  preparar(bien({ interes: 'Aerotermia', mensaje: 'Quiere cambiar\n\n\nla caldera  de gasoil', respuestas: { '¿Vivienda habitual?': 'Sí', 'Vacía': '' } }), AHORA).p.motivo,
  'Interés: Aerotermia\nQuiere cambiar\n\nla caldera de gasoil\n¿Vivienda habitual?: Sí');
igual('respuestas en lista', preparar(bien({ respuestas: [{ pregunta: 'Tejado', respuesta: 'Plano' }, { name: 'Potencia', value: ['3 kW', '5 kW'] }] }), AHORA).p.motivo, 'Tejado: Plano\nPotencia: 3 kW, 5 kW');
comprueba('no pasa de largo', preparar(bien({ mensaje: new Array(900).join('palabra ') }), AHORA).p.motivo.length <= 3000);

titulo('la app llama a cada origen por su nombre');
igual('meta', origenNombre({ origen: 'meta' }), 'Meta');
igual('saunier', origenNombre({ origen: 'saunier' }), 'Saunier Duval');
igual('vaillant', origenNombre({ origen: 'vaillant' }), 'Vaillant');
igual('web', origenNombre({ origen: 'web' }), 'Web');
igual('uno que no está en la lista sale tal cual', origenNombre({ origen: 'feria' }), 'feria');
igual('sin origen', origenNombre({}), '');
comprueba('web y Teamleader son «de la web»', origenEsWeb({ origen: 'web' }) && origenEsWeb({ origen: 'crm' }) && origenEsWeb({}));
comprueba('los de los agentes no', !origenEsWeb({ origen: 'vaillant' }) && !origenEsWeb({ origen: 'meta' }));
comprueba('las fuentes de la función están en la lista de la app', Object.keys(FUENTES).every(function (k) { return AG_ORIGENES.some(function (o) { return o[0] === k; }); }));
resultado();
