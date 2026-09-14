// =============================================================================
// Sysefen · Edge Function `enviar-parte`
//
// Envía el PDF de un parte por correo con Resend, desde noreply@sysefen.com,
// con copia oculta (BCC) siempre a partes@sysefen.com.
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
