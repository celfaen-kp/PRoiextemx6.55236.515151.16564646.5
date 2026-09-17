// =============================================================================
// Sysefen · Edge Function `correo-bienvenida`
//
// Manda a una persona su correo de bienvenida: quién es en la app, su PIN de
// acceso, el enlace para entrar y cómo instalarla en el móvil o en el
// ordenador. Lo llama la app cuando Administración le crea el acceso, y también
// sirve para reenviarlo o para avisar de un PIN nuevo.
//
// A QUÉ DIRECCIÓN: al correo personal (`empleados.email_avisos`) si lo tiene,
// y si no al de acceso (`empleados.email`). Se puede forzar otra con `correo_a`.
//
// EL PIN no se guarda en claro en ningún sitio: lo manda quien llama, que
// acaba de ponerlo. Esta función no lo guarda, solo lo escribe en el correo.
//
// SECRETOS (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   la misma que usan `enviar-parte` y `recordatorio-citas`
//
// DESPLIEGUE: "Verify JWT" ACTIVADO.
//
// QUIÉN PUEDE: solo Administración.
//
// USO (POST con JSON):
//   { "empleado_id": "uuid", "pin": "1234" }                 bienvenida
//   { "empleado_id": "uuid", "pin": "1234", "tipo": "pin" }  PIN nuevo
//   { ..., "correo_a": "otra@direccion.com" }                a otra dirección
//   { ..., "solo_ver": true }                                dice a quién, sin enviar
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const REMITENTE = 'Sysefen <noreply@sysefen.com>';
const APP_URL = 'https://celfaen-kp.github.io/PRoiextemx6.55236.515151.16564646.5/';
const LOGO_URL = APP_URL + 'logo-email.png';
const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const ROLES: Record<string, string> = {
  operario: 'Operario',
  jefe: 'Jefe de obra',
  admin: 'Administración',
  presupuestos: 'Presupuestos',
};

// --- Plantilla del correo ----------------------------------------------------
// Mismo marco que los avisos de cita: tablas, estilos en línea y fuentes del
// sistema, que es lo único que respetan Gmail y Outlook.
const COLOR = {
  tinta: '#14170f', verde: '#206028', papel: '#f5f4ef',
  suave: '#6b6d66', linea: '#e6e4dc', blanco: '#ffffff',
};
const FUENTE = "'Helvetica Neue',Helvetica,Arial,sans-serif";

function escHtml(s: unknown) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function paso(n: number, titulo: string, texto: string) {
  return `<tr>
    <td style="padding:0 12px 14px 0;width:30px;vertical-align:top;">
      <div style="width:26px;height:26px;border-radius:99px;background:${COLOR.verde};color:${COLOR.blanco};font-size:13px;line-height:26px;font-weight:700;text-align:center;">${n}</div>
    </td>
    <td style="padding:0 0 14px;vertical-align:top;">
      <div style="font-size:15px;line-height:22px;font-weight:700;color:${COLOR.tinta};">${escHtml(titulo)}</div>
      <div style="font-size:14px;line-height:21px;color:${COLOR.suave};padding-top:2px;">${texto}</div>
    </td>
  </tr>`;
}

// deno-lint-ignore no-explicit-any
function correoHTML(d: any) {
  const nuevo = d.tipo !== 'pin';
  const cuerpo = `
    <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${COLOR.verde};">${nuevo ? 'Bienvenido' : 'PIN nuevo'}</div>
    <h1 style="margin:8px 0 10px;font-size:24px;line-height:30px;font-weight:700;color:${COLOR.tinta};">Hola, ${escHtml(d.nombre)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:23px;color:${COLOR.tinta};">${nuevo
      ? `Ya tienes acceso a la app de ${escHtml(d.empresa)}${d.rol ? `, como <strong>${escHtml(d.rol)}</strong>` : ''}. Con ella fichas la jornada, ves tus obras y firmas los partes, desde el móvil y sin papeles.`
      : 'Te hemos puesto un PIN nuevo para entrar en la app. El anterior ya no vale.'}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.papel};border-radius:12px;">
      <tr>
        <td style="padding:20px;text-align:center;">
          <div style="font-size:11px;line-height:16px;color:${COLOR.suave};letter-spacing:1.5px;text-transform:uppercase;">Tu PIN de acceso</div>
          <div style="font-size:40px;line-height:48px;font-weight:700;color:${COLOR.tinta};letter-spacing:10px;padding-top:4px;">${escHtml(d.pin)}</div>
          <div style="font-size:13px;line-height:19px;color:${COLOR.suave};padding-top:4px;">Cuatro números. No se lo des a nadie.</div>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
      <tr><td style="background:${COLOR.verde};border-radius:99px;">
        <a href="${escHtml(d.appUrl)}" style="display:inline-block;padding:14px 28px;font-family:${FUENTE};font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COLOR.blanco};text-decoration:none;">Abrir la app</a>
      </td></tr>
    </table>
    <p style="margin:0 0 22px;font-size:12px;line-height:18px;color:${COLOR.suave};word-break:break-all;">Si el botón no va, copia esta dirección en el navegador:<br>${escHtml(d.appUrl)}</p>

    <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COLOR.verde};padding-top:6px;">Cómo entrar</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
      ${paso(1, 'Abre el enlace', 'En el móvil, mejor con Safari (iPhone) o Chrome (Android).')}
      ${paso(2, 'Busca tu nombre', `Sale la lista de la gente de ${escHtml(d.empresa)}. Toca <strong>${escHtml(d.nombre)}</strong>.`)}
      ${paso(3, 'Escribe tu PIN', 'Los cuatro números de arriba. Ya estás dentro.')}
    </table>

    <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COLOR.verde};padding-top:14px;">Déjala como una app más</div>
    <p style="margin:10px 0 0;font-size:14px;line-height:21px;color:${COLOR.tinta};">No hace falta bajar nada de ninguna tienda. Se instala desde el propio navegador y queda con su icono en la pantalla, como cualquier otra:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-size:14px;line-height:21px;color:${COLOR.tinta};">
        <strong>iPhone</strong> · abre el enlace en Safari, toca el botón de compartir (el cuadrado con la flecha) y elige <em>Añadir a pantalla de inicio</em>.
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-size:14px;line-height:21px;color:${COLOR.tinta};">
        <strong>Android</strong> · abre el enlace en Chrome, toca los tres puntos de arriba y elige <em>Instalar aplicación</em>.
      </td></tr>
      <tr><td style="padding:10px 0;font-size:14px;line-height:21px;color:${COLOR.tinta};">
        <strong>Ordenador</strong> · abre el enlace en Chrome o Edge y pulsa el icono de instalar que sale a la derecha de la barra de direcciones.
      </td></tr>
    </table>

    <p style="margin:22px 0 0;font-size:14px;line-height:22px;color:${COLOR.suave};">Si algo no te funciona, díselo a ${escHtml(d.contacto)}.</p>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Sysefen</title></head>
<body style="margin:0;padding:0;background:${COLOR.papel};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${nuevo ? 'Tu acceso a la app de Sysefen, con tu PIN' : 'Tu PIN nuevo de la app de Sysefen'}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.papel};">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${COLOR.blanco};border-radius:16px;overflow:hidden;">
      <tr><td style="height:5px;background:${COLOR.verde};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:26px 32px 18px;border-bottom:1px solid ${COLOR.linea};">
        <img src="${LOGO_URL}" width="150" alt="Sysefen" style="display:block;width:150px;max-width:60%;height:auto;border:0;">
      </td></tr>
      <tr><td style="padding:28px 32px 8px;font-family:${FUENTE};color:${COLOR.tinta};">${cuerpo}</td></tr>
      <tr><td style="padding:22px 32px 28px;font-family:${FUENTE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLOR.linea};">
          <tr><td style="padding-top:18px;font-size:13px;line-height:20px;color:${COLOR.tinta};"><strong>Sysefen</strong> · Eficiencia Energética</td></tr>
          <tr><td style="padding-top:6px;font-size:12px;line-height:18px;color:${COLOR.suave};">Este correo se envía automáticamente. Por favor, no responda a esta dirección.</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// deno-lint-ignore no-explicit-any
function correoTexto(d: any) {
  const nuevo = d.tipo !== 'pin';
  return [
    `Hola ${d.nombre}:`, '',
    nuevo
      ? `Ya tienes acceso a la app de ${d.empresa}${d.rol ? `, como ${d.rol}` : ''}.`
      : 'Te hemos puesto un PIN nuevo para entrar en la app. El anterior ya no vale.',
    '',
    `Tu PIN de acceso: ${d.pin}`,
    'Son cuatro números. No se lo des a nadie.', '',
    `La app: ${d.appUrl}`, '',
    'Cómo entrar:',
    '  1. Abre el enlace (Safari en iPhone, Chrome en Android).',
    `  2. Toca tu nombre en la lista: ${d.nombre}.`,
    '  3. Escribe tu PIN.', '',
    'Para dejarla instalada, como una app más:',
    '  · iPhone: en Safari, botón de compartir y "Añadir a pantalla de inicio".',
    '  · Android: en Chrome, los tres puntos y "Instalar aplicación".',
    '  · Ordenador: en Chrome o Edge, el icono de instalar de la barra de direcciones.', '',
    `Si algo no te funciona, díselo a ${d.contacto}.`, '',
    'Un saludo,', 'Sysefen · Eficiencia Energética', '',
    '(Este correo se envía automáticamente. Por favor, no responda a esta dirección.)',
  ].join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const RESEND = Deno.env.get('RESEND_API_KEY') || '';

  // --- quién llama ------------------------------------------------------------
  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
  const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: 'Sesión no válida.' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: yo } = await admin.from('empleados').select('id, rol, nombre')
    .eq('user_id', user.id).maybeSingle();
  if (!yo || yo.rol !== 'admin') return json({ error: 'Solo Administración puede mandar este correo.' }, 403);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const empleadoId = String(b.empleado_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(empleadoId)) return json({ error: 'Falta el empleado.' }, 400);
  const pin = String(b.pin || '').trim();
  if (!/^\d{4}$/.test(pin)) return json({ error: 'El PIN son 4 números.' }, 400);
  const tipo = b.tipo === 'pin' ? 'pin' : 'bienvenida';
  const soloVer = b.solo_ver === true;

  const { data: emp, error: errEmp } = await admin.from('empleados')
    .select('id, nombre, nombre_completo, rol, email, email_avisos, user_id')
    .eq('id', empleadoId).maybeSingle();
  if (errEmp) return json({ error: 'No se pudo leer el empleado: ' + errEmp.message }, 500);
  if (!emp) return json({ error: 'Ese empleado no existe.' }, 404);

  // El correo personal manda sobre el de acceso: el de acceso puede ser un
  // apaño interno que esa persona no lee.
  const forzado = typeof b.correo_a === 'string' ? b.correo_a.trim() : '';
  const para = [forzado, emp.email_avisos, emp.email].find((e) => esEmail(e));
  if (!para) {
    return json({ error: 'Esa persona no tiene ningún correo donde escribirle. Ponle uno en su ficha.' }, 400);
  }

  const datos = {
    nombre: String(emp.nombre || '').split(' ')[0] || emp.nombre,
    rol: ROLES[String(emp.rol)] || '',
    pin, tipo,
    empresa: 'Sysefen',
    appUrl: APP_URL,
    contacto: yo.nombre || 'Administración',
  };
  const asunto = tipo === 'pin'
    ? 'Tu PIN nuevo de la app de Sysefen'
    : `Bienvenido a Sysefen, ${datos.nombre}: tu acceso a la app`;

  if (soloVer) return json({ ok: true, para: String(para).trim(), asunto, enviado: false });
  if (!RESEND) return json({ error: 'Falta el secreto RESEND_API_KEY en Supabase.' }, 500);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REMITENTE,
      to: [String(para).trim()],
      subject: asunto,
      text: correoTexto(datos),
      html: correoHTML(datos),
    }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) {
    return json({ error: 'Resend: ' + ((res as { message?: string }).message || r.status) }, 502);
  }
  return json({ ok: true, para: String(para).trim(), asunto, enviado: true, id: (res as { id?: string }).id });
});
