// =============================================================================
// Sysefen · Edge Function `enviar-parte`
//
// Envía el PDF de un parte por correo con Resend, desde noreply@sysefen.com,
// con copia oculta (BCC) siempre a partes@sysefen.com.
//
// El correo va con el mismo diseño que los avisos de cita: logo, franja verde,
// los datos del parte en una ficha y el aviso de que no se responda. Si la app
// no manda `datos` (una versión vieja), sale el texto de siempre dentro del
// mismo marco, así que nunca se queda sin enviar.
//
// SECRETOS (Supabase → Edge Functions → Secrets). Nunca en el código ni en Git:
//   RESEND_API_KEY   la clave de Resend (empieza por re_...)
//
// SEGURIDAD:
//   - Solo la ejecuta alguien con sesión (verify_jwt de Supabase).
//   - Además se comprueba que es jefe o administración: un operario con sesión
//     válida no puede usarla para mandar correos en nombre de la empresa.
//   - La comprobación del rol va con la sesión del propio usuario y las
//     políticas de siempre: esta función NO necesita la clave service_role.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// --- Plantilla HTML del correo ---------------------------------------------
// Pensada para programas de correo: tablas, estilos en línea y fuentes del
// sistema (Gmail y Outlook ignoran las hojas de estilo y las fuentes web).
// El logo se carga por URL: incrustado no se ve en Gmail.
const APP_URL = 'https://celfaen-kp.github.io/PRoiextemx6.55236.515151.16564646.5/';
const LOGO_URL = APP_URL + 'logo-email.png';
const COLOR = {
  tinta: '#14170f', verde: '#206028', papel: '#f5f4ef',
  suave: '#6b6d66', linea: '#e6e4dc', blanco: '#ffffff', rojo: '#a8402a',
};
const FUENTE = "'Helvetica Neue',Helvetica,Arial,sans-serif";

function escHtml(s: unknown) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function filaDato(etiqueta: string, valor: string | null | undefined) {
  if (!valor) return '';
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:${COLOR.suave};width:36%;vertical-align:top;">${escHtml(etiqueta)}</td>
    <td style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-size:15px;line-height:21px;color:${COLOR.tinta};vertical-align:top;">${escHtml(valor)}</td>
  </tr>`;
}

/**
 * d = { ref, fecha, obra, cliente, direccion, tecnico, firmante, firmado,
 *       nivel, incidencia, texto }
 */
// deno-lint-ignore no-explicit-any
function correoParteHTML(d: any) {
  const conFirma = d.firmado === true;
  const incidencia = d.nivel && d.nivel !== 'Sin incidencias';
  const cuerpo = `
    <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${COLOR.verde};">Parte de trabajo</div>
    <h1 style="margin:8px 0 10px;font-size:24px;line-height:30px;font-weight:700;color:${COLOR.tinta};">${escHtml(d.obra || 'Trabajos realizados')}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:23px;color:${COLOR.tinta};">
      Adjuntamos el parte de los trabajos realizados${d.fecha ? ' el <strong>' + escHtml(d.fecha) + '</strong>' : ''}${d.obra ? ' en ' + escHtml(d.obra) : ''}.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.papel};border-radius:12px;">
      <tr>
        <td style="padding:18px 20px;vertical-align:middle;border-right:1px solid ${COLOR.linea};width:45%;">
          <div style="font-size:11px;line-height:16px;color:${COLOR.suave};letter-spacing:1px;text-transform:uppercase;">Referencia</div>
          <div style="font-size:22px;line-height:28px;font-weight:700;color:${COLOR.tinta};letter-spacing:-0.5px;">${escHtml(d.ref || '')}</div>
        </td>
        <td style="padding:18px 20px;vertical-align:middle;">
          <div style="font-size:11px;line-height:16px;color:${COLOR.suave};letter-spacing:1px;text-transform:uppercase;">Fecha de los trabajos</div>
          <div style="font-size:16px;line-height:22px;font-weight:600;color:${COLOR.tinta};">${escHtml(d.fecha || '')}</div>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
      ${filaDato('Obra', d.obra)}
      ${filaDato('Cliente', d.cliente)}
      ${filaDato('Dirección', d.direccion)}
      ${filaDato('Responsable', d.tecnico)}
      ${filaDato('Conformidad', conFirma ? 'Firmado' + (d.firmante ? ' por ' + d.firmante : '') : 'Sin firma del cliente')}
    </table>
    ${!conFirma ? `<p style="margin:18px 0 0;font-size:13px;line-height:20px;color:${COLOR.suave};">El cliente no estaba presente al finalizar los trabajos, por lo que el parte se emite sin su firma.</p>` : ''}
    ${incidencia ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border:1px solid ${COLOR.rojo};border-radius:12px;">
      <tr><td style="padding:14px 18px;">
        <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COLOR.rojo};">Incidencia · ${escHtml(d.nivel)}</div>
        ${d.incidencia ? `<div style="font-size:14px;line-height:21px;color:${COLOR.tinta};padding-top:5px;">${escHtml(d.incidencia)}</div>` : ''}
      </td></tr></table>` : ''}
    <p style="margin:22px 0 0;font-size:14px;line-height:22px;color:${COLOR.suave};">El parte completo, con las fotos y la firma, va adjunto en PDF.</p>`;
  return marcoCorreo({
    preheader: `${d.ref || 'Parte de trabajo'}${d.fecha ? ' · ' + d.fecha : ''}${d.obra ? ' · ' + d.obra : ''}`,
    cuerpo,
  });
}

// Cuando la app no manda los datos sueltos, el texto de siempre dentro del marco.
function correoSimpleHTML(texto: string) {
  const parrafos = texto.split(/\n{2,}/).map((t) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:23px;color:${COLOR.tinta};">${escHtml(t).replace(/\n/g, '<br>')}</p>`).join('');
  return marcoCorreo({ preheader: texto.slice(0, 120), cuerpo: parrafos });
}

function marcoCorreo({ preheader, cuerpo }: { preheader: string; cuerpo: string }) {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLAVE = Deno.env.get('RESEND_API_KEY');
  if (!CLAVE) return json({ error: 'Falta el secreto RESEND_API_KEY en Supabase.' }, 500);
  const REMITENTE = 'Sysefen <noreply@sysefen.com>';
  const COPIA_OCULTA = 'partes@sysefen.com';

  // --- quién llama y con qué rol --------------------------------------------
  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: 'Sesión no válida.' }, 401);
  const { data: yo } = await sb.from('empleados').select('rol, nombre').eq('user_id', user.id).maybeSingle();
  if (!yo || !['jefe', 'admin'].includes(yo.rol)) {
    return json({ error: 'Solo jefes y administración pueden enviar partes.' }, 403);
  }

  // --- qué se envía ----------------------------------------------------------
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }

  const para = (Array.isArray(b.para) ? b.para : [b.para]).filter(esEmail).map((s) => String(s).trim());
  const copia = (Array.isArray(b.copia) ? b.copia : [b.copia]).filter(esEmail).map((s) => String(s).trim());
  if (!para.length) return json({ error: 'Falta un correo de destino válido.' }, 400);
  const pdf = typeof b.pdf_base64 === 'string' ? b.pdf_base64 : '';
  if (!pdf) return json({ error: 'Falta el PDF.' }, 400);
  if (pdf.length > 14_000_000) return json({ error: 'El PDF es demasiado grande para enviarlo por correo.' }, 413);

  const asunto = String(b.asunto || 'Parte de trabajo').slice(0, 200);
  const texto = String(b.texto || 'Adjuntamos el parte de trabajo firmado.').slice(0, 5000);
  const archivo = String(b.nombre_archivo || 'parte.pdf').replace(/[^\w.\-]/g, '_').slice(0, 120);
  // deno-lint-ignore no-explicit-any
  const datos = b.datos && typeof b.datos === 'object' ? (b.datos as any) : null;
  const html = datos ? correoParteHTML(datos) : correoSimpleHTML(texto);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + CLAVE, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REMITENTE,
      to: para,
      cc: copia.length ? copia : undefined,
      bcc: [COPIA_OCULTA],
      subject: asunto,
      text: texto,
      html,
      attachments: [{ filename: archivo, content: pdf }],
    }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Resend explica bien los fallos (dominio sin verificar, clave mala...):
    // se devuelve su mensaje tal cual para poder arreglarlo.
    return json({ error: 'Resend: ' + ((res as { message?: string }).message || r.status) }, 502);
  }
  return json({ ok: true, id: (res as { id?: string }).id, enviado_por: yo.nombre });
});
