// =============================================================================
// Sysefen · Edge Function `recordatorio-citas`
//
// La llama una tarea programada cada 10 minutos (sql/etapa23b_aviso_citas_cron.sql).
// En cada pasada busca las citas pendientes que empiezan en las PRÓXIMAS 24 HORAS
// y todavía no se han avisado, y manda por correo, desde noreply@sysefen.com:
//   - a cada CLIENTE con email, un recordatorio de su cita;
//   - a cada TÉCNICO con "email para avisos", la lista de sus próximas citas.
// Así el aviso sale 24 h antes, y si la cita se crea con menos de 24 h de
// margen, sale en la siguiente pasada (en pocos minutos).
// Cada cita se marca con aviso_enviado_at para no avisar dos veces. Si en la
// app se cambia la hora de la cita, se borra esa marca y vuelve a avisarse.
//
// SECRETOS (Supabase → Edge Functions → Secrets). Nunca en el código ni en Git:
//   RESEND_API_KEY   la misma que usa enviar-parte
//   AVISOS_CLAVE     contraseña larga inventada; la misma va en la tarea cron
//
// DESPLIEGUE: "Verify JWT" DESACTIVADO. La protege la cabecera `x-clave`.
//
// USO (POST con JSON):
//   {}                            avisa de las citas de las próximas 24 horas
//   { "solo_ver": true }          dice a quién escribiría, sin enviar nada
//   { "fecha": "2026-09-20" }     en vez de las próximas 24 h, ese día entero (pruebas)
//   { "resumen_dia": true }       resumen de MAÑANA a cada persona de presupuestos
//   { "cita_id": "uuid" }         avisa de ESA cita (nueva, cambiada o anulada)
//   { "cita_id": "uuid", "otra_vez": true }   la vuelve a avisar aunque ya se hiciera
// Además, en cada pasada normal confirma por correo las citas nuevas (las que
// empiezan dentro de más de 24 h y aún no tienen confirmacion_enviada_at).
//   { "resumen_dia": true, "fecha": "2026-09-20" }   resumen de ese día (pruebas)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ZONA = 'Europe/Madrid';
const REMITENTE = 'Sysefen <noreply@sysefen.com>';
const APP_URL = 'https://celfaen-kp.github.io/PRoiextemx6.55236.515151.16564646.5/';
const LOGO_URL = APP_URL + 'logo-email.png';
const TEL = '+34 696 284 058';
const TEL_LINK = 'tel:+34696284058';
const CATEGORIAS: Record<string, string> = {
  aerotermia: 'aerotermia',
  solar: 'paneles solares',
  electricidad: 'electricidad',
  aire_acondicionado: 'aire acondicionado',
};

// CORS: la llama también la app desde el navegador (avisar de UNA cita al
// crearla, cambiarla o anularla). Sin esto el navegador cortaba la llamada
// en el preflight y la app creía que la función no estaba subida; el aviso
// acababa saliendo, pero minutos después, por la tarea programada.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function mismaClave(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

// Fecha YYYY-MM-DD en hora de Mallorca.
const fechaEnZona = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);

// Desfase de Mallorca ese día ("+02:00" en verano, "+01:00" en invierno).
function desfase(fecha: string) {
  const d = new Date(fecha + 'T12:00:00Z');
  const txt = d.toLocaleString('en-US', { timeZone: ZONA, timeZoneName: 'longOffset' });
  const m = txt.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+01:00';
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
const diaLargo = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });

// "hoy", "mañana, miércoles 16 de septiembre" o "miércoles 16 de septiembre".
function cuando(iso: string, ahora: Date) {
  const dia = fechaEnZona(new Date(iso));
  if (dia === fechaEnZona(ahora)) return 'hoy';
  if (dia === fechaEnZona(new Date(ahora.getTime() + 24 * 3600 * 1000))) return 'mañana, ' + diaLargo(iso);
  return diaLargo(iso);
}
// Para el asunto: "hoy", "mañana" o "miércoles 16 de septiembre".
function cuandoCorto(iso: string, ahora: Date) {
  const c = cuando(iso, ahora);
  return c.startsWith('mañana') ? 'mañana' : c;
}

const listaCategorias = (cats: string[]) => {
  const n = (cats || []).map((c) => CATEGORIAS[c] || c);
  return n.length <= 1 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
};

// --- Plantillas HTML de los correos de aviso -------------------------------------
// Pensadas para programas de correo: tablas, estilos en línea y fuentes del
// sistema (Gmail y Outlook ignoran las hojas de estilo y las fuentes web).
// El logo se carga por URL: los correos con la imagen incrustada no se ven en Gmail.
const COLOR = {
  tinta: '#14170f', verde: '#206028', verdeClaro: '#3d8f4a', papel: '#f5f4ef',
  suave: '#6b6d66', linea: '#e6e4dc', blanco: '#ffffff',
};
const FUENTE = "'Helvetica Neue',Helvetica,Arial,sans-serif";

function escHtml(s: unknown) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function marcoCorreo({ logoUrl, preheader, cuerpo, pie }: { logoUrl: string; preheader: string; cuerpo: string; pie: string }) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Sysefen</title></head>
<body style="margin:0;padding:0;background:${COLOR.papel};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.papel};">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${COLOR.blanco};border-radius:16px;overflow:hidden;">
      <tr><td style="height:5px;background:${COLOR.verde};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:26px 32px 18px;border-bottom:1px solid ${COLOR.linea};">
        <img src="${escHtml(logoUrl)}" width="150" alt="Sysefen" style="display:block;width:150px;max-width:60%;height:auto;border:0;">
      </td></tr>
      <tr><td style="padding:28px 32px 8px;font-family:${FUENTE};color:${COLOR.tinta};">${cuerpo}</td></tr>
      <tr><td style="padding:22px 32px 28px;font-family:${FUENTE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLOR.linea};">
          <tr><td style="padding-top:18px;font-size:13px;line-height:20px;color:${COLOR.tinta};"><strong>Sysefen</strong> · Eficiencia Energética</td></tr>
          <tr><td style="padding-top:6px;font-size:12px;line-height:18px;color:${COLOR.suave};">${pie}</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Fila etiqueta/valor. Si no hay valor, no se pinta.
function filaDato(etiqueta: string, valor: string | null | undefined) {
  if (!valor) return '';
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:${COLOR.suave};width:36%;vertical-align:top;">${escHtml(etiqueta)}</td>
    <td style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-size:15px;line-height:21px;color:${COLOR.tinta};vertical-align:top;">${escHtml(valor)}</td>
  </tr>`;
}

// Bloque destacado de día y hora.
function bloqueCuando({ etiqueta, dia, hora, apagado }: { etiqueta: string; dia: string; hora: string; apagado?: boolean }) {
  const acento = apagado ? COLOR.suave : COLOR.verde;
  const tachado = apagado ? 'text-decoration:line-through;' : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.papel};border-radius:12px;">
    <tr>
      <td style="padding:18px 20px;width:112px;vertical-align:middle;border-right:1px solid ${COLOR.linea};">
        <div style="font-size:34px;line-height:36px;font-weight:700;color:${COLOR.tinta};letter-spacing:-1px;${tachado}">${escHtml(hora)}</div>
        <div style="font-size:11px;line-height:16px;color:${COLOR.suave};letter-spacing:1px;text-transform:uppercase;">horas</div>
      </td>
      <td style="padding:18px 20px;vertical-align:middle;">
        <div style="font-size:11px;line-height:16px;font-weight:700;color:${acento};letter-spacing:1.5px;text-transform:uppercase;">${escHtml(etiqueta)}</div>
        <div style="font-size:18px;line-height:24px;font-weight:600;color:${COLOR.tinta};padding-top:2px;${tachado}">${escHtml(dia)}</div>
      </td>
    </tr>
  </table>`;
}

const eyebrow = (txt: string) => `<div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${COLOR.verde};">${escHtml(txt)}</div>`;
const titular = (txt: string) => `<h1 style="margin:8px 0 10px;font-size:24px;line-height:30px;font-weight:700;color:${COLOR.tinta};">${escHtml(txt)}</h1>`;
const parrafo = (txt: string) => `<p style="margin:0 0 20px;font-size:15px;line-height:23px;color:${COLOR.tinta};">${escHtml(txt)}</p>`;

/**
 * Correo al cliente.
 * d = { logoUrl, nombre, etiqueta: 'Mañana', dia: 'Miércoles, 16 de septiembre', hora: '10:00',
 *       direccion, motivo, tecnico, duracion }
 */
// deno-lint-ignore no-explicit-any
function correoClienteHTML(d: any) {
  const cuerpo = `
    ${eyebrow(d.anulada ? 'Cita anulada' : d.confirmacion ? 'Cita confirmada' : d.antes ? 'Cambio de cita' : 'Recordatorio de cita')}
    ${titular('Hola, ' + d.nombre)}
    ${parrafo(d.anulada
      ? 'Le informamos de que su cita' + (d.motivo ? ' para la ' + d.motivo : ' con Sysefen') + ' ha quedado anulada. Disculpe las molestias.'
      : d.confirmacion
        ? 'Hemos agendado su cita' + (d.motivo ? ' para la ' + d.motivo : ' con Sysefen') + '. Le enviaremos un recordatorio el día antes.'
        : d.antes
          ? 'Le informamos de que su cita' + (d.motivo ? ' para la ' + d.motivo : ' con Sysefen') + ' ha cambiado de día y hora. Queda así:'
          : 'Le recordamos su cita' + (d.motivo ? ' para la ' + d.motivo : ' con Sysefen') + '.')}
    ${bloqueCuando({ etiqueta: d.anulada ? 'Estaba prevista' : d.antes ? 'Nueva fecha · ' + d.etiqueta : d.etiqueta, dia: d.dia, hora: d.hora, apagado: d.anulada })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
      ${filaDato('Antes era', d.antes)}
      ${filaDato('Dirección', d.direccion)}
      ${filaDato('Motivo', d.motivo ? d.motivo.charAt(0).toUpperCase() + d.motivo.slice(1) : '')}
      ${filaDato('Le atenderá', d.tecnico)}
      ${filaDato('Duración aprox.', d.duracion)}
    </table>
    ${d.calendario ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
      <tr><td style="border:1.5px solid ${COLOR.verde};border-radius:99px;">
        <a href="${escHtml(d.calendario)}" style="display:inline-block;padding:12px 24px;font-family:${FUENTE};font-size:13px;font-weight:700;letter-spacing:.5px;color:${COLOR.verde};text-decoration:none;">${d.calendarioQuitar ? 'Quitarla de mi calendario' : 'Añadir a mi calendario'}</a>
      </td></tr>
    </table>` : ''}
    <p style="margin:22px 0 0;font-size:14px;line-height:22px;color:${COLOR.suave};">${d.anulada
      ? 'Si desea concertar una nueva cita, puede llamarnos al'
      : 'Si usted lo desea, puede cambiar su cita contactando con nosotros en el'} <a href="${TEL_LINK}" style="color:${COLOR.verde};text-decoration:none;font-weight:700;">${escHtml(TEL)}</a>.</p>`;
  return marcoCorreo({
    logoUrl: d.logoUrl,
    preheader: d.anulada
      ? `Cita anulada · ${d.dia} a las ${d.hora}`
      : `${d.etiqueta} a las ${d.hora}${d.direccion ? ' · ' + d.direccion : ''}`,
    cuerpo,
    pie: 'Este correo se envía automáticamente. Por favor, no responda a esta dirección.',
  });
}

/**
 * Correo a quien va.
 * d = { logoUrl, appUrl, nombre, citas: [{ etiqueta, dia, hora, duracion, cliente, direccion, motivo }] }
 */
// deno-lint-ignore no-explicit-any
function correoTecnicoHTML(d: any) {
  const n = d.citas.length;
  // deno-lint-ignore no-explicit-any
  const bloques = d.citas.map((c: any, i: number) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${i ? 12 : 0}px;border:1px solid ${COLOR.linea};border-radius:12px;">
      <tr>
        <td style="padding:16px 18px;width:84px;vertical-align:top;">
          <div style="font-size:24px;line-height:28px;font-weight:700;color:${COLOR.tinta};">${escHtml(c.hora)}</div>
          <div style="font-size:11px;line-height:16px;color:${COLOR.suave};">${escHtml(c.duracion || '')}</div>
        </td>
        <td style="padding:16px 18px 16px 0;vertical-align:top;">
          <div style="font-size:11px;line-height:16px;font-weight:700;color:${COLOR.verde};letter-spacing:1.5px;text-transform:uppercase;">${escHtml(c.etiqueta)} · ${escHtml(c.dia)}</div>
          <div style="font-size:16px;line-height:22px;font-weight:700;color:${COLOR.tinta};padding-top:4px;">${escHtml(c.cliente)}</div>
          ${c.direccion ? `<div style="font-size:14px;line-height:20px;color:${COLOR.tinta};padding-top:2px;">${escHtml(c.direccion)}</div>` : ''}
          ${c.motivo ? `<div style="font-size:13px;line-height:19px;color:${COLOR.suave};padding-top:2px;">${escHtml(c.motivo)}</div>` : ''}
        </td>
      </tr>
    </table>`).join('');
  const rotulo = d.aviso === 'nueva' ? 'Cita nueva'
    : d.aviso === 'cambio' ? 'Cita cambiada'
    : d.aviso === 'anulada' ? 'Cita anulada'
    : d.resumen ? 'Citas de mañana'
    : (n === 1 ? 'Próxima cita' : 'Tus próximas citas');
  const entradilla = d.aviso === 'nueva' ? 'Se te ha asignado una cita nueva.'
    : d.aviso === 'cambio' ? 'Una de tus citas ha cambiado de día y hora. Queda así:'
    : d.aviso === 'anulada' ? 'Esta cita se ha anulado. Ya no tienes que ir.'
    : d.resumen
      ? (n === 1 ? 'Mañana tienes una cita.' : `Mañana tienes ${n} citas.`)
      : (n === 1 ? 'Tienes esta cita en las próximas horas.' : `Tienes ${n} citas en las próximas horas.`);
  const cuerpo = `
    ${eyebrow(rotulo)}
    ${titular('Hola, ' + d.nombre)}
    ${parrafo(entradilla)}
    ${bloques}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
      <tr><td style="background:${COLOR.verde};border-radius:99px;">
        <a href="${escHtml(d.appUrl)}" style="display:inline-block;padding:13px 26px;font-family:${FUENTE};font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COLOR.blanco};text-decoration:none;">Abrir la agenda</a>
      </td></tr>
    </table>
    ${d.calendario ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
      <tr><td style="border:1.5px solid ${COLOR.verde};border-radius:99px;">
        <a href="${escHtml(d.calendario)}" style="display:inline-block;padding:12px 24px;font-family:${FUENTE};font-size:13px;font-weight:700;letter-spacing:.5px;color:${COLOR.verde};text-decoration:none;">${d.calendarioQuitar ? 'Quitarla de mi calendario' : 'Añadir a mi calendario'}</a>
      </td></tr>
    </table>` : ''}`;
  return marcoCorreo({
    logoUrl: d.logoUrl,
    preheader: n === 1 ? `${d.citas[0].etiqueta} a las ${d.citas[0].hora} · ${d.citas[0].cliente}` : `${n} citas en las próximas horas`,
    cuerpo,
    pie: 'Aviso automático de la agenda de Sysefen.',
  });
}

// Enlace al calendario DEL MÓVIL. Apunta a la función `cita-ics`, que sirve la
// cita como archivo: el iPhone abre Calendario y Android ofrece guardarla, cada
// uno en el suyo. Nada de cuentas de Google.
//
// El enlace va firmado con AVISOS_CLAVE para que no se pueda adivinar cambiando
// el id en la dirección. La firma se calcula igual en las dos funciones.
async function firmaDe(clave: string, dato: string) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dato));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function urlCalendario(clave: string, citaId: string, quien: string) {
  const base = (Deno.env.get('SUPABASE_URL') || '') + '/functions/v1/cita-ics';
  const k = await firmaDe(clave, citaId + '.' + quien);
  return `${base}?c=${encodeURIComponent(citaId)}&q=${quien}&k=${k}`;
}

const mayus = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const diaCorto = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
const duracionTxt = (m: number) => (m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : (m === 60 ? '1 hora' : `${m / 60} horas`)) : `${m} minutos`);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  if (CLAVE.length < 24) return json({ error: 'Falta el secreto AVISOS_CLAVE (mínimo 24 caracteres).' }, 500);
  const esElCron = mismaClave(req.headers.get('x-clave') || '', CLAVE);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* cuerpo vacío: valores por defecto */ }
  const soloVer = b.solo_ver === true;
  // Reenviar a mano desde la app: se manda aunque ya estuviera marcado.
  const otraVez = b.otra_vez === true;
  const citaSuelta = typeof b.cita_id === 'string' ? b.cita_id : '';

  // Dos maneras de entrar: la tarea programada, con su clave, que puede hacerlo
  // todo; o alguien de la app con sesión, que solo puede avisar de UNA cita, la
  // que acaba de crear o cambiar. Así el aviso sale al momento sin que la clave
  // del cron ande por el navegador.
  if (!esElCron) {
    if (!citaSuelta) return json({ error: 'No autorizado.' }, 401);
    const autorizacion = req.headers.get('Authorization') || '';
    if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
    const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: autorizacion } },
    });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return json({ error: 'Sesión no válida.' }, 401);
    const { data: yo } = await comoUsuario.from('empleados').select('rol').eq('user_id', user.id).maybeSingle();
    if (!yo || !['presupuestos', 'jefe', 'admin'].includes(yo.rol)) {
      return json({ error: 'Solo presupuestos, jefes y Administración.' }, 403);
    }
  }

  const RESEND = Deno.env.get('RESEND_API_KEY') || '';
  if (!soloVer && !RESEND) return json({ error: 'Falta el secreto RESEND_API_KEY.' }, 500);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const mandar = async (para: string, asunto: string, texto: string, html: string) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMITENTE, to: [para], subject: asunto, text: texto, html }),
    });
    if (!r.ok) {
      const res = await r.json().catch(() => ({}));
      throw new Error((res as { message?: string }).message || String(r.status));
    }
  };

  // --- avisar de UNA cita: nueva, cambiada o anulada ---------------------------------
  // La llama la app en cuanto se crea, se cambia o se anula una cita, para que el
  // aviso no espere a la pasada del cron; y la llama también el propio cron, como
  // red de seguridad, por si la app no pudo (sin cobertura, por ejemplo).
  const avisarDeUnaCita = async (citaSuelta: string) => {
    const { data: c, error: errU } = await sb.from('citas')
      .select(`*, cliente:clientes_cache(nombre, email, direccion, poblacion),
        empleado:empleados!citas_empleado_id_fkey(nombre, email_avisos)`)
      .eq('id', citaSuelta).maybeSingle();
    if (errU) return { error: errU.message };
    if (!c) return { error: 'Esa cita no existe.' };
    if (!c.inicio) return { ok: true, nada: 'la cita todavía no tiene día y hora' };

    // Qué toca contar.
    let tipo = '';
    if (c.estado === 'anulada') {
      if (c.anulacion_enviada_at && !otraVez) return { ok: true, tipo: 'anulada', nada: 'ya avisada' };
      // Si nunca se le dijo nada al cliente, tampoco hay que anunciarle una anulación.
      if (!c.confirmacion_enviada_at && !c.aviso_enviado_at && !otraVez) {
        if (!soloVer) await sb.from('citas').update({ anulacion_enviada_at: new Date().toISOString() }).eq('id', c.id);
        return { ok: true, tipo: 'anulada', nada: 'nunca se avisó de esta cita' };
      }
      tipo = 'anulada';
    } else if (c.estado !== 'pendiente') {
      return { ok: true, nada: 'la cita ya no está pendiente' };
    } else if (c.cambio_desde) {
      tipo = 'cambio';
    } else if (!c.confirmacion_enviada_at || otraVez) {
      tipo = 'nueva';
    } else {
      return { ok: true, nada: 'ya avisada' };
    }

    const ahoraU = new Date();
    const dondeU = [c.direccion || c.cliente?.direccion, c.poblacion || c.cliente?.poblacion].filter(Boolean).join(', ');
    const motivoU = c.categorias?.length ? 'instalación de ' + listaCategorias(c.categorias) : '';
    const diaU = mayus(diaLargo(c.inicio));
    const horaU = hora(c.inicio);
    const rotuloU = tipo === 'anulada' ? 'Cita anulada' : tipo === 'cambio' ? 'Cambio de cita' : 'Cita confirmada';

    const correos: { para: string; asunto: string; texto: string; html: string; quien: string }[] = [];

    if (esEmail(c.cliente?.email)) {
      const asunto = `${rotuloU}${motivoU && tipo !== 'anulada' ? ` para la ${motivoU}` : ''} · ${diaU} a las ${horaU}`;
      const texto =
        `Hola ${c.cliente.nombre}:\n\n` +
        (tipo === 'anulada'
          ? `Le informamos de que su cita${motivoU ? ` para la ${motivoU}` : ' con Sysefen'} del ${diaU} a las ${horaU} ha quedado anulada. Disculpe las molestias.\n\n` +
            `Si desea concertar una nueva cita, puede llamarnos al ${TEL}.`
          : tipo === 'cambio'
            ? `Le informamos de que su cita${motivoU ? ` para la ${motivoU}` : ' con Sysefen'} ha cambiado de día y hora.\n` +
              (c.cambio_desde ? `Antes era: ${mayus(diaLargo(c.cambio_desde))}, a las ${hora(c.cambio_desde)}.\n` : '') +
              `Queda así: ${diaU}, a las ${horaU}${dondeU ? `, en ${dondeU}` : ''}.` +
              `${c.empleado?.nombre ? `\nLe atenderá ${c.empleado.nombre}.` : ''}\n\n` +
              `Si usted lo desea, puede cambiar su cita contactando con nosotros en el ${TEL}.`
            : `Hemos agendado su cita${motivoU ? ` para la ${motivoU}` : ' con Sysefen'}: ` +
              `${diaU}, a las ${horaU}${dondeU ? `, en ${dondeU}` : ''}.` +
              `${c.empleado?.nombre ? `\nLe atenderá ${c.empleado.nombre}.` : ''}\n\n` +
              `Le enviaremos un recordatorio el día antes.\n` +
              `Si usted lo desea, puede cambiar su cita contactando con nosotros en el ${TEL}.`) +
        `\n\nUn saludo,\nSysefen · Eficiencia Energética\n\n` +
        `(Este correo se envía automáticamente. Por favor, no responda a esta dirección.)`;
      // También en la anulación: el mismo enlace devuelve entonces una cancelación,
      // que le quita la cita del calendario de un toque.
      const enlaceCliente = await urlCalendario(CLAVE, c.id, 'c');
      correos.push({
        quien: 'cliente', para: String(c.cliente.email).trim(), asunto, texto,
        html: correoClienteHTML({
          calendario: enlaceCliente, calendarioQuitar: tipo === 'anulada',
          logoUrl: LOGO_URL, nombre: c.cliente.nombre,
          etiqueta: tipo === 'nueva' ? 'Su cita' : mayus(cuandoCorto(c.inicio, ahoraU)),
          dia: diaU, hora: horaU, direccion: dondeU, motivo: motivoU,
          tecnico: c.empleado?.nombre || '', duracion: duracionTxt(c.duracion_min || 60),
          confirmacion: tipo === 'nueva', anulada: tipo === 'anulada',
          antes: tipo === 'cambio' && c.cambio_desde ? `${mayus(diaLargo(c.cambio_desde))}, ${hora(c.cambio_desde)}` : '',
        }),
      });
    }

    if (esEmail(c.empleado?.email_avisos)) {
      const quienCli = c.cliente?.nombre || 'Cliente';
      const asunto = `${tipo === 'anulada' ? 'Cita anulada' : tipo === 'cambio' ? 'Cita cambiada' : 'Cita nueva'} · ${diaCorto(c.inicio)} a las ${horaU} · ${quienCli}`;
      const texto =
        `Hola ${c.empleado.nombre}:\n\n` +
        (tipo === 'anulada' ? 'Se ha anulado esta cita. Ya no tienes que ir.\n\n'
          : tipo === 'cambio' ? 'Una de tus citas ha cambiado de día y hora. Queda así:\n\n'
            : 'Se te ha asignado una cita nueva:\n\n') +
        `· ${diaU}, ${horaU} (${duracionTxt(c.duracion_min || 60)}) — ${quienCli}\n` +
        `  ${dondeU || 'Sin dirección'}` +
        `${motivoU ? `\n  ${mayus(motivoU)}` : ''}` +
        `${tipo === 'cambio' && c.cambio_desde ? `\n  Antes era: ${mayus(diaLargo(c.cambio_desde))}, ${hora(c.cambio_desde)}` : ''}` +
        `${c.nota ? `\n  Nota: ${c.nota}` : ''}` +
        `\n\nLo tienes todo en la Agenda de la app: ${APP_URL}`;
      const enlaceTecnico = await urlCalendario(CLAVE, c.id, 't');
      correos.push({
        quien: 'instalador', para: String(c.empleado.email_avisos).trim(), asunto, texto,
        html: correoTecnicoHTML({
          logoUrl: LOGO_URL, appUrl: APP_URL, nombre: c.empleado.nombre, aviso: tipo,
          calendario: enlaceTecnico, calendarioQuitar: tipo === 'anulada',
          citas: [{
            etiqueta: tipo === 'anulada' ? 'Anulada' : mayus(cuandoCorto(c.inicio, ahoraU)),
            dia: diaCorto(c.inicio), hora: horaU, duracion: duracionTxt(c.duracion_min || 60),
            cliente: quienCli, direccion: dondeU, motivo: mayus(motivoU),
          }],
        }),
      });
    }

    if (soloVer) return { modo: 'cita', tipo, correos: correos.map((m) => ({ a: m.quien, para: m.para, asunto: m.asunto })) };
    // Que la app pueda decir POR QUÉ no ha salido nada: sin correo del cliente
    // ni correo de avisos de quien va, no hay a quién escribir.
    const sinCorreo = !correos.length;

    const falloU: string[] = [];
    let okU = 0;
    for (const m of correos) {
      try { await mandar(m.para, m.asunto, m.texto, m.html); okU++; }
      catch (e) { falloU.push(`${m.quien} ${m.para}: ${(e as Error).message}`); }
    }

    // Se marca aunque no hubiera a quién escribir: repetirlo no cambiaría nada.
    const ahoraTxt = new Date().toISOString();
    const dentro24U = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const marca: Record<string, unknown> = tipo === 'anulada'
      ? { anulacion_enviada_at: ahoraTxt }
      : { confirmacion_enviada_at: ahoraTxt, cambio_desde: null };
    // Si la cita es para dentro de menos de 24 h, este correo ya hace de
    // recordatorio: así el cron no manda otro casi igual diez minutos después.
    if (tipo !== 'anulada' && c.inicio <= dentro24U) marca.aviso_enviado_at = ahoraTxt;
    const { error: errM } = await sb.from('citas').update(marca).eq('id', c.id);

    return {
      modo: 'cita', tipo, enviados: okU, sin_correo: sinCorreo,
      cliente_sin_email: !esEmail(c.cliente?.email),
      a: correos.map((m) => m.quien),
      errores: falloU.concat(errM ? ['marcar: ' + errM.message] : []),
    };
  };

  if (citaSuelta) {
    const r = await avisarDeUnaCita(citaSuelta);
    return json(r, (r as { error?: string }).error ? 400 : 200);
  }


  // --- resumen de las citas de mañana, para quien va ---------------------------------
  // Tarea aparte (sql/etapa24b): no toca aviso_enviado_at, así que convive con el
  // aviso de cada cita.
  if (b.resumen_dia === true) {
    const dia = typeof b.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha)
      ? b.fecha
      : fechaEnZona(new Date(Date.now() + 24 * 3600 * 1000));
    const off2 = desfase(dia);
    const { data: filas, error: errR } = await sb.from('citas')
      .select(`id, inicio, duracion_min, categorias, direccion, poblacion,
        cliente:clientes_cache(nombre, direccion, poblacion),
        empleado:empleados!citas_empleado_id_fkey(nombre, email_avisos)`)
      .eq('estado', 'pendiente')
      .gte('inicio', new Date(`${dia}T00:00:00${off2}`).toISOString())
      .lte('inicio', new Date(`${dia}T23:59:59${off2}`).toISOString())
      .order('inicio');
    if (errR) return json({ error: errR.message }, 500);
    // deno-lint-ignore no-explicit-any
    const citasR = (filas || []) as any[];
    const porPersona = new Map<string, { nombre: string; citas: any[] }>();
    for (const c of citasR) {
      const email = c.empleado?.email_avisos;
      if (!esEmail(email)) continue;
      const k = String(email).trim().toLowerCase();
      if (!porPersona.has(k)) porPersona.set(k, { nombre: c.empleado.nombre, citas: [] });
      porPersona.get(k)!.citas.push(c);
    }
    const dondeR = (c: any) =>
      [c.direccion || c.cliente?.direccion, c.poblacion || c.cliente?.poblacion].filter(Boolean).join(', ');
    const motivoR = (c: any) => (c.categorias?.length ? 'instalación de ' + listaCategorias(c.categorias) : '');
    const correos = [...porPersona.entries()].map(([para, t]) => ({
      para,
      asunto: `Mañana: ${t.citas.length === 1 ? '1 cita' : t.citas.length + ' citas'} · ${diaLargo(t.citas[0].inicio)}`,
      texto:
        `Hola ${t.nombre}, mañana ${t.citas.length === 1 ? 'tienes 1 cita' : 'tienes ' + t.citas.length + ' citas'}:\n\n` +
        t.citas.map((c) =>
          `· ${hora(c.inicio)} (${duracionTxt(c.duracion_min || 60)}) — ${c.cliente?.nombre || 'Cliente'}\n` +
          `  ${dondeR(c) || 'Sin dirección'}${motivoR(c) ? `\n  ${mayus(motivoR(c))}` : ''}`).join('\n\n') +
        `\n\nLo tienes todo en la Agenda de la app: ${APP_URL}`,
      html: correoTecnicoHTML({
        logoUrl: LOGO_URL, appUrl: APP_URL, nombre: t.nombre, resumen: true,
        citas: t.citas.map((c) => ({
          etiqueta: 'Mañana', dia: diaCorto(c.inicio), hora: hora(c.inicio),
          duracion: duracionTxt(c.duracion_min || 60), cliente: c.cliente?.nombre || 'Cliente',
          direccion: dondeR(c), motivo: mayus(motivoR(c)),
        })),
      }),
    }));
    if (soloVer) return json({ modo: 'resumen', dia, citas: citasR.length, correos: correos.map((m) => ({ para: m.para, asunto: m.asunto })) });
    const fallos: string[] = [];
    let enviados = 0;
    for (const m of correos) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: REMITENTE, to: [m.para], subject: m.asunto, text: m.texto, html: m.html }),
        });
        if (!r.ok) throw new Error(String(r.status));
        enviados++;
      } catch (e) { fallos.push(`${m.para}: ${(e as Error).message}`); }
    }
    return json({ modo: 'resumen', dia, citas: citasR.length, enviados, errores: fallos });
  }

  // --- qué ventana de tiempo --------------------------------------------------------
  const ahora = new Date();
  let desde: string, hasta: string, ventana: string;
  if (typeof b.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) {
    const off = desfase(b.fecha);
    desde = new Date(`${b.fecha}T00:00:00${off}`).toISOString();
    hasta = new Date(`${b.fecha}T23:59:59${off}`).toISOString();
    ventana = 'día ' + b.fecha;
  } else {
    desde = ahora.toISOString();
    hasta = new Date(ahora.getTime() + 24 * 3600 * 1000).toISOString();
    ventana = 'próximas 24 horas';
  }

  const enviarCorreo = async (para: string, asunto: string, texto: string, html: string) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMITENTE, to: [para], subject: asunto, text: texto, html }),
    });
    if (!r.ok) {
      const res = await r.json().catch(() => ({}));
      throw new Error((res as { message?: string }).message || String(r.status));
    }
  };

  // --- red de seguridad: citas que la app no llegó a avisar --------------------------
  // Lo normal es que el aviso salga al crear, cambiar o anular la cita desde la app.
  // Si aquello falló (sin cobertura, la función caída...), aquí se recupera.
  let confirmadas = 0;
  const erroresConf: string[] = [];
  if (ventana === 'próximas 24 horas') {
    const { data: nuevas, error: errC } = await sb.from('citas')
      .select('id')
      .eq('estado', 'pendiente')
      .is('confirmacion_enviada_at', null)
      .gt('inicio', ahora.toISOString())
      .order('inicio')
      .limit(50);
    if (errC && !/column .* does not exist|confirmacion_enviada_at/i.test(errC.message)) {
      return json({ error: errC.message }, 500);
    }
    // Anuladas de las que sí se había avisado y aún no se ha dicho nada.
    const { data: anuladas } = await sb.from('citas')
      .select('id')
      .eq('estado', 'anulada')
      .is('anulacion_enviada_at', null)
      .not('confirmacion_enviada_at', 'is', null)
      .limit(20);

    for (const c of [...(nuevas || []), ...(anuladas || [])]) {
      const r = await avisarDeUnaCita(String(c.id)) as Record<string, unknown>;
      if (r.error) erroresConf.push(String(r.error));
      else if (r.enviados) confirmadas++;
      if (Array.isArray(r.errores) && r.errores.length) erroresConf.push(...r.errores.map(String));
    }
  }

  const { data, error } = await sb.from('citas')
    .select(`id, inicio, duracion_min, categorias, direccion, poblacion, cambio_desde,
      cliente:clientes_cache(nombre, email, direccion, poblacion),
      empleado:empleados!citas_empleado_id_fkey(nombre, email_avisos)`)
    .eq('estado', 'pendiente')
    .is('aviso_enviado_at', null)
    .gte('inicio', desde)
    .lte('inicio', hasta)
    .order('inicio');
  if (error) return json({ error: error.message }, 500);

  type Cita = {
    id: string; inicio: string; duracion_min: number; categorias: string[];
    direccion: string | null; poblacion: string | null; cambio_desde: string | null;
    cliente: { nombre: string; email: string | null; direccion: string | null; poblacion: string | null } | null;
    empleado: { nombre: string; email_avisos: string | null } | null;
  };
  const citas = (data || []) as unknown as Cita[];
  if (!citas.length) return json({ ventana, citas: 0, confirmadas, errores: erroresConf });

  const dondeDe = (c: Cita) =>
    [c.direccion || c.cliente?.direccion, c.poblacion || c.cliente?.poblacion].filter(Boolean).join(', ');

  // --- correos a clientes --------------------------------------------------------
  const motivoDe = (c: Cita) => (c.categorias?.length ? 'instalación de ' + listaCategorias(c.categorias) : '');
  // La cita para el calendario, como la ve el cliente.
  // Los enlaces del calendario se firman de uno en uno; se preparan antes de
  // montar los correos, que ahí ya no se puede esperar a nada.
  const enlaces = new Map<string, { c: string; t: string }>();
  for (const c of citas) {
    enlaces.set(c.id, { c: await urlCalendario(CLAVE, c.id, 'c'), t: await urlCalendario(CLAVE, c.id, 't') });
  }

  const aClientes = citas.filter((c) => esEmail(c.cliente?.email)).map((c) => ({
    para: String(c.cliente!.email).trim(),
    asunto: c.cambio_desde
      ? `Cambio de cita${motivoDe(c) ? ` para la ${motivoDe(c)}` : ''} · ${cuandoCorto(c.inicio, ahora)} a las ${hora(c.inicio)}`
      : motivoDe(c)
        ? `Su cita para la ${motivoDe(c)} · ${cuandoCorto(c.inicio, ahora)} a las ${hora(c.inicio)}`
        : `Recordatorio de su cita con Sysefen · ${cuandoCorto(c.inicio, ahora)} a las ${hora(c.inicio)}`,
    texto:
      `Hola ${c.cliente!.nombre}:\n\n` +
      (c.cambio_desde
        ? `Le informamos de que su cita${motivoDe(c) ? ` para la ${motivoDe(c)}` : ' con Sysefen'} ha cambiado de día y hora.\n` +
          `Antes era: ${mayus(diaLargo(c.cambio_desde))}, a las ${hora(c.cambio_desde)}.\n` +
          `Queda así: ${cuando(c.inicio, ahora)}, a las ${hora(c.inicio)}${dondeDe(c) ? `, en ${dondeDe(c)}` : ''}.`
        : `Le recordamos su cita${motivoDe(c) ? ` para la ${motivoDe(c)}` : ' con Sysefen'}: ` +
          `${cuando(c.inicio, ahora)}, a las ${hora(c.inicio)}${dondeDe(c) ? `, en ${dondeDe(c)}` : ''}.`) +
      `${c.empleado?.nombre ? `\nLe atenderá ${c.empleado.nombre}.` : ''}\n\n` +
      `Si usted lo desea, puede cambiar su cita contactando con nosotros en el ${TEL}.\n\n` +
      `Un saludo,\nSysefen · Eficiencia Energética\n\n` +
      `(Este correo se envía automáticamente. Por favor, no responda a esta dirección.)`,
    html: correoClienteHTML({
      calendario: (enlaces.get(c.id) || {}).c || '',
      logoUrl: LOGO_URL, nombre: c.cliente!.nombre, etiqueta: mayus(cuandoCorto(c.inicio, ahora)),
      dia: mayus(diaLargo(c.inicio)), hora: hora(c.inicio), direccion: dondeDe(c), motivo: motivoDe(c),
      tecnico: c.empleado?.nombre || '', duracion: duracionTxt(c.duracion_min || 60),
      antes: c.cambio_desde ? `${mayus(diaLargo(c.cambio_desde))}, ${hora(c.cambio_desde)}` : '',
    }),
  }));

  // --- correos a técnicos: una lista por persona ----------------------------------
  const porTecnico = new Map<string, { nombre: string; citas: Cita[] }>();
  for (const c of citas) {
    const email = c.empleado?.email_avisos;
    if (!esEmail(email)) continue;
    const k = String(email).trim().toLowerCase();
    if (!porTecnico.has(k)) porTecnico.set(k, { nombre: c.empleado!.nombre, citas: [] });
    porTecnico.get(k)!.citas.push(c);
  }
  const aTecnicos = [...porTecnico.entries()].map(([para, t]) => ({
    para,
    asunto: t.citas.length === 1
      ? `Cita ${cuandoCorto(t.citas[0].inicio, ahora)} a las ${hora(t.citas[0].inicio)} · ${t.citas[0].cliente?.nombre || 'Cliente'}`
      : `Tus próximas citas (${t.citas.length})`,
    texto:
      `Hola ${t.nombre}, ${t.citas.length === 1 ? 'tienes esta cita' : 'tienes estas citas'} en las próximas horas:\n\n` +
      t.citas.map((c) =>
        `· ${cuando(c.inicio, ahora)}, ${hora(c.inicio)} (${c.duracion_min} min) — ${c.cliente?.nombre || 'Cliente'}\n` +
        `  ${dondeDe(c) || 'Sin dirección'}` +
        `${c.categorias?.length ? `\n  ${listaCategorias(c.categorias)}` : ''}`,
      ).join('\n\n') +
      `\n\nLo tienes todo en la Agenda de la app: ${APP_URL}`,
    html: correoTecnicoHTML({
      logoUrl: LOGO_URL, appUrl: APP_URL, nombre: t.nombre,
      calendario: t.citas.length === 1 ? ((enlaces.get(t.citas[0].id) || {}).t || '') : '',
      citas: t.citas.map((c) => ({
        etiqueta: mayus(cuandoCorto(c.inicio, ahora)), dia: diaCorto(c.inicio), hora: hora(c.inicio),
        duracion: duracionTxt(c.duracion_min || 60), cliente: c.cliente?.nombre || 'Cliente',
        direccion: dondeDe(c), motivo: mayus(motivoDe(c)),
      })),
    }),
  }));

  if (soloVer) {
    return json({
      ventana, citas: citas.length,
      confirmaciones: confirmadas,
      clientes: aClientes.map((m) => ({ para: m.para, asunto: m.asunto })),
      tecnicos: aTecnicos.map((m) => ({ para: m.para, asunto: m.asunto })),
      sin_email_cliente: citas.filter((c) => !esEmail(c.cliente?.email)).map((c) => c.cliente?.nombre || c.id),
    });
  }

  // --- enviar ----------------------------------------------------------------------
  const errores: string[] = [];
  let clientesOk = 0, tecnicosOk = 0;
  for (const m of aClientes) {
    try { await enviarCorreo(m.para, m.asunto, m.texto, m.html); clientesOk++; }
    catch (e) { errores.push(`${m.para}: ${(e as Error).message}`); }
  }
  for (const m of aTecnicos) {
    try { await enviarCorreo(m.para, m.asunto, m.texto, m.html); tecnicosOk++; }
    catch (e) { errores.push(`${m.para}: ${(e as Error).message}`); }
  }

  // Se marcan todas las citas revisadas: si una no tenía email, no hay a quién
  // avisar, y repetirla cada 10 minutos no cambiaría nada.
  const { error: e2 } = await sb.from('citas')
    .update({ aviso_enviado_at: new Date().toISOString(), cambio_desde: null })
    .in('id', citas.map((c) => c.id));
  if (e2) errores.push('marcar avisadas: ' + e2.message);

  return json({ ventana, citas: citas.length, confirmadas, clientes_avisados: clientesOk, tecnicos_avisados: tecnicosOk, errores: errores.concat(erroresConf) });
});
