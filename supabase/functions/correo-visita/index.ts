// =============================================================================
// Sysefen · Edge Function `correo-visita`
//
// Al cerrar una visita, le da las gracias al cliente por recibirnos y le dice
// que en unos días tendrá su presupuesto.
//
// LO QUE NO LLEVA, Y ES LO IMPORTANTE: ni una sola medida de las que se tomaron
// en la visita. Esos datos son el trabajo por el que hemos ido hasta allí; si
// viajan en un correo, el cliente puede pasárselos a otro instalador y ahorrarse
// la visita que nosotros hemos pagado. Aquí va solo lo que el cliente ya sabe:
// que estuvimos, qué se vino a mirar, quién fue y cuándo tendrá la propuesta.
//
// SOLO SE MANDA UNA VEZ: se marca `visitas.gracias_at` (sql/etapa34). Reabrir y
// volver a cerrar una visita no le escribe otra vez al cliente.
//
// SECRETOS (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   la misma que usan `enviar-parte` y `recordatorio-citas`
//
// DESPLIEGUE: "Verify JWT" ACTIVADO.
//
// QUIÉN PUEDE: presupuestos, jefes y Administración.
//
// USO (POST con JSON):
//   { "visita_id": "uuid" }
//   { "visita_id": "uuid", "solo_ver": true }   dice a quién escribiría
//   { "visita_id": "uuid", "otra_vez": true }   lo manda aunque ya se mandara
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ZONA = 'Europe/Madrid';
const REMITENTE = 'Sysefen <noreply@sysefen.com>';
const APP_URL = 'https://celfaen-kp.github.io/PRoiextemx6.55236.515151.16564646.5/';
const LOGO_URL = APP_URL + 'logo-email.png';
const TEL = '+34 696 284 058';
const TEL_LINK = 'tel:+34696284058';
const WEB = 'https://www.sysefen.com';

const CATEGORIAS: Record<string, string> = {
  aerotermia: 'aerotermia',
  solar: 'paneles solares',
  electricidad: 'electricidad',
  aire_acondicionado: 'aire acondicionado',
};

const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const limpio = (s: unknown) => String(s ?? '').trim();

const lista = (n: string[]) =>
  n.length <= 1 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];

const diaLargo = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
const mayus = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// --- Plantilla, el mismo marco que los avisos de cita ------------------------
const COLOR = {
  tinta: '#14170f', verde: '#206028', papel: '#f5f4ef',
  suave: '#6b6d66', linea: '#e6e4dc', blanco: '#ffffff',
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

// deno-lint-ignore no-explicit-any
function correoHTML(d: any) {
  const cuerpo = `
    <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${COLOR.verde};">Visita realizada</div>
    <h1 style="margin:8px 0 10px;font-size:24px;line-height:30px;font-weight:700;color:${COLOR.tinta};">Gracias por su tiempo, ${escHtml(d.nombre)}</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:23px;color:${COLOR.tinta};">
      Hemos estado hoy en su ${escHtml(d.donde ? 'domicilio' : 'propiedad')} para ver de cerca ${d.motivo ? 'la instalación de ' + escHtml(d.motivo) : 'lo que necesita'}, y ya tenemos todo lo necesario para preparar su presupuesto.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:23px;color:${COLOR.tinta};">
      Ahora nos toca a nosotros: estudiamos la mejor solución para su caso y le hacemos llegar la propuesta <strong>en los próximos días</strong>, con el detalle de la instalación y su importe.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.papel};border-radius:12px;">
      <tr><td style="padding:18px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${filaDato('Visita', d.dia)}
          ${filaDato('Dirección', d.donde)}
          ${filaDato('Le atendió', d.tecnico)}
          ${filaDato('Estudiamos', d.motivo ? mayus(d.motivo) : '')}
        </table>
      </td></tr>
    </table>

    <p style="margin:22px 0 0;font-size:14px;line-height:22px;color:${COLOR.suave};">
      Si mientras tanto le surge cualquier duda, o recuerda algo que quiera que tengamos en cuenta, llámenos al
      <a href="${TEL_LINK}" style="color:${COLOR.verde};text-decoration:none;font-weight:700;">${escHtml(TEL)}</a>.
    </p>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Sysefen</title></head>
<body style="margin:0;padding:0;background:${COLOR.papel};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Gracias por recibirnos. En unos días tendrá su presupuesto.</div>
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
          <tr><td style="padding-top:4px;font-size:12px;line-height:18px;color:${COLOR.suave};">${escHtml(TEL)} · <a href="${WEB}" style="color:${COLOR.suave};">sysefen.com</a></td></tr>
          <tr><td style="padding-top:6px;font-size:12px;line-height:18px;color:${COLOR.suave};">Este correo se envía automáticamente. Por favor, no responda a esta dirección.</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// deno-lint-ignore no-explicit-any
const correoTexto = (d: any) => [
  `Hola ${d.nombre}:`, '',
  `Gracias por recibirnos${d.dia ? ' el ' + d.dia : ''}. Ya tenemos todo lo necesario para preparar su presupuesto${d.motivo ? ' de la instalación de ' + d.motivo : ''}.`,
  '',
  'Ahora nos toca a nosotros: estudiamos la mejor solución para su caso y le hacemos llegar la propuesta en los próximos días, con el detalle de la instalación y su importe.',
  '',
  d.tecnico ? `Le atendió ${d.tecnico}.` : '',
  `Si le surge cualquier duda, llámenos al ${TEL}.`, '',
  'Un saludo,', 'Sysefen · Eficiencia Energética', '',
  '(Este correo se envía automáticamente. Por favor, no responda a esta dirección.)',
].filter((l) => l !== '').join('\n');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
  const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: 'Sesión no válida.' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: yo } = await sb.from('empleados').select('id, rol').eq('user_id', user.id).maybeSingle();
  if (!yo) return json({ error: 'No se encuentra tu ficha de empleado.' }, 403);
  if (!['presupuestos', 'jefe', 'admin'].includes(String(yo.rol))) {
    return json({ error: 'Solo presupuestos, jefes y Administración.' }, 403);
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const visitaId = limpio(b.visita_id);
  if (!/^[0-9a-f-]{36}$/i.test(visitaId)) return json({ error: 'Falta el id de la visita.' }, 400);
  const soloVer = b.solo_ver === true;
  const otraVez = b.otra_vez === true;

  const { data: v, error: errV } = await sb.from('visitas')
    .select('id, codigo, fecha_visita, cliente_id, tecnico_id, direccion, poblacion, gracias_at')
    .eq('id', visitaId).maybeSingle();
  if (errV) return json({ error: 'No se pudo leer la visita: ' + errV.message }, 500);
  if (!v) return json({ error: 'Esa visita no existe.' }, 404);
  if (v.gracias_at && !otraVez) {
    return json({ ok: true, ya_enviado: true, gracias_at: v.gracias_at });
  }

  const { data: cli } = await sb.from('clientes_cache')
    .select('nombre, email').eq('id', v.cliente_id).maybeSingle();
  if (!cli) return json({ ok: true, nada: 'la visita no tiene cliente' });
  if (!esEmail(cli.email)) {
    // Sin email no hay a quién escribir; se marca para no reintentarlo cada vez.
    if (!soloVer) await sb.from('visitas').update({ gracias_at: new Date().toISOString() }).eq('id', v.id);
    return json({ ok: true, nada: 'ese cliente no tiene email' });
  }

  const { data: tec } = await sb.from('empleados')
    .select('nombre').eq('user_id', v.tecnico_id).maybeSingle();
  const { data: fichas } = await sb.from('visita_fichas').select('categoria').eq('visita_id', v.id);
  const motivo = lista((fichas || []).map((f) => CATEGORIAS[String(f.categoria)] || String(f.categoria)));

  const datos = {
    // Solo el nombre de pila: "Gracias por su tiempo, María" se lee mejor.
    nombre: limpio(cli.nombre).split(' ')[0] || limpio(cli.nombre),
    dia: v.fecha_visita ? mayus(diaLargo(v.fecha_visita + 'T12:00:00')) : '',
    donde: [limpio(v.direccion), limpio(v.poblacion)].filter(Boolean).join(', '),
    tecnico: limpio(tec?.nombre),
    motivo,
  };
  const asunto = `Gracias por su tiempo${datos.motivo ? ' · su presupuesto de ' + datos.motivo : ''}`;

  if (soloVer) return json({ ok: true, para: limpio(cli.email), asunto, enviado: false });

  const RESEND = Deno.env.get('RESEND_API_KEY') || '';
  if (!RESEND) return json({ error: 'Falta el secreto RESEND_API_KEY en Supabase.' }, 500);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REMITENTE, to: [limpio(cli.email)], subject: asunto,
      text: correoTexto(datos), html: correoHTML(datos),
    }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: 'Resend: ' + ((res as { message?: string }).message || r.status) }, 502);

  await sb.from('visitas').update({ gracias_at: new Date().toISOString() }).eq('id', v.id);
  return json({ ok: true, enviado: true, para: limpio(cli.email), asunto });
});
