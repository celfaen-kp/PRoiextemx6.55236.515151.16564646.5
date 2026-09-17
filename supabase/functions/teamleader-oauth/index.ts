// =============================================================================
// Sysefen · Edge Function `teamleader-oauth`
//
// Conecta la app con Teamleader una sola vez. Hace de las dos puntas del baile
// de OAuth 2:
//
//   POST { "accion": "iniciar" }   (con sesión de Administración o presupuestos)
//        Devuelve la dirección a la que hay que mandar al usuario para que
//        autorice la integración. Guarda un `state` de un solo uso.
//
//   GET  ?code=...&state=...
//        Es la vuelta de Teamleader. Cambia el código por el permiso, lo guarda
//        en `tl_oauth` y enseña una página de "ya está".
//
//   POST { "accion": "estado" }    (con sesión)
//        Dice si está conectado y hasta cuándo vale el permiso de ahora.
//
//   POST { "accion": "desconectar" } (solo Administración)
//        Borra el permiso guardado.
//
// SECRETOS (Supabase → Edge Functions → Secrets). Nunca en el código ni en Git:
//   TEAMLEADER_CLIENT_ID, TEAMLEADER_CLIENT_SECRET   de la integración que se
//   crea en https://marketplace.focus.teamleader.eu/build
//
// EN TEAMLEADER hay que apuntar como "redirect URI" exactamente la dirección de
// esta función:
//   https://<tu-proyecto>.supabase.co/functions/v1/teamleader-oauth
//
// DESPLIEGUE: "Verify JWT" DESACTIVADO. Tiene que estarlo: la vuelta de
// Teamleader es un GET del navegador, sin sesión. Las acciones que sí tocan
// datos comprueban la sesión aquí dentro.
//
// OJO CON EL PERMISO: Teamleader lo cambia en cada uso (el refresh token es de
// un solo uso), así que vive en la tabla `tl_oauth` y no como secreto fijo.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const AUTORIZAR = 'https://focus.teamleader.eu/oauth2/authorize';
const TOKEN = 'https://focus.teamleader.eu/oauth2/access_token';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function pagina(titulo: string, texto: string, bien: boolean) {
  const color = bien ? '#206028' : '#a8402a';
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sysefen · Teamleader</title></head>
<body style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f4ef;color:#14170f;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;">
  <div style="max-width:420px;text-align:center;background:#fff;border-radius:16px;padding:34px 28px;">
    <div style="font-size:42px;line-height:1;color:${color};">${bien ? '✓' : '!'}</div>
    <h1 style="font-size:22px;line-height:28px;margin:14px 0 8px;">${titulo}</h1>
    <p style="font-size:15px;line-height:23px;color:#6b6d66;margin:0;">${texto}</p>
  </div>
</body></html>`, { status: bien ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } });

// Quién llama, por su sesión de la app.
async function quien(req: Request) {
  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return null;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await admin().from('empleados').select('id, rol, nombre').eq('user_id', user.id).maybeSingle();
  return data || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const CLIENT_ID = Deno.env.get('TEAMLEADER_CLIENT_ID') || '';
  const CLIENT_SECRET = Deno.env.get('TEAMLEADER_CLIENT_SECRET') || '';
  const REDIRECCION = (Deno.env.get('SUPABASE_URL') || '') + '/functions/v1/teamleader-oauth';

  // --- la vuelta de Teamleader ------------------------------------------------
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const error = url.searchParams.get('error');
    if (error) return pagina('No se ha conectado', 'Teamleader dice: ' + error + '. Puedes volver a intentarlo desde la app.', false);
    const codigo = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || '';
    if (!codigo || !state) return pagina('Falta algo', 'Esta dirección solo se abre al volver de Teamleader.', false);
    if (!CLIENT_ID || !CLIENT_SECRET) return pagina('Falta configurarlo', 'No están los secretos TEAMLEADER_CLIENT_ID y TEAMLEADER_CLIENT_SECRET en Supabase.', false);

    const sb = admin();
    const { data: guardado } = await sb.from('ajustes').select('valor, updated_at').eq('clave', 'tl_oauth_state').maybeSingle();
    if (!guardado?.valor || guardado.valor !== state) {
      return pagina('No cuadra', 'Esta autorización no se corresponde con la que empezó la app. Vuelve a darle a "Conectar" desde Ajustes.', false);
    }
    if (Date.now() - new Date(guardado.updated_at as string).getTime() > 10 * 60 * 1000) {
      return pagina('Ha caducado', 'Han pasado más de diez minutos desde que empezaste. Vuelve a darle a "Conectar" desde Ajustes.', false);
    }

    const r = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        code: codigo, grant_type: 'authorization_code', redirect_uri: REDIRECCION,
      }),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok || !res.access_token || !res.refresh_token) {
      return pagina('No se ha podido conectar', 'Teamleader no aceptó la petición: ' + (res.error_description || res.error || r.status), false);
    }

    const expira = new Date(Date.now() + (Number(res.expires_in) || 3600) * 1000).toISOString();
    const { error: errGuardar } = await sb.from('tl_oauth').upsert({
      id: 1, access_token: res.access_token, refresh_token: res.refresh_token,
      expira_at: expira, actualizado_at: new Date().toISOString(),
    });
    await sb.from('ajustes').delete().eq('clave', 'tl_oauth_state');
    if (errGuardar) return pagina('Casi', 'Teamleader autorizó, pero no se pudo guardar el permiso: ' + errGuardar.message, false);

    return pagina('Teamleader conectado', 'Ya puedes cerrar esta pestaña y volver a la app. Los clientes nuevos se crearán también en el CRM.', true);
  }

  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* sin cuerpo */ }
  const accion = String(b.accion || 'estado');

  const yo = await quien(req);
  if (!yo) return json({ error: 'Falta la sesión.' }, 401);
  if (!['admin', 'jefe', 'presupuestos'].includes(String(yo.rol))) {
    return json({ error: 'Solo Administración, jefes y presupuestos.' }, 403);
  }

  const sb = admin();

  if (accion === 'estado') {
    const { data } = await sb.from('tl_oauth').select('expira_at, actualizado_at').eq('id', 1).maybeSingle();
    return json({ conectado: !!data, expira_at: data?.expira_at || null, actualizado_at: data?.actualizado_at || null });
  }

  if (accion === 'iniciar') {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json({ error: 'Faltan los secretos TEAMLEADER_CLIENT_ID y TEAMLEADER_CLIENT_SECRET en Supabase.' }, 500);
    }
    const state = crypto.randomUUID() + '-' + crypto.randomUUID();
    const { error } = await sb.from('ajustes').upsert({
      clave: 'tl_oauth_state', valor: state, updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: 'No se pudo preparar la conexión: ' + error.message }, 500);
    const url = `${AUTORIZAR}?client_id=${encodeURIComponent(CLIENT_ID)}&response_type=code` +
      `&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(REDIRECCION)}`;
    return json({ ok: true, url, redireccion: REDIRECCION });
  }

  if (accion === 'desconectar') {
    if (yo.rol !== 'admin') return json({ error: 'Solo Administración puede desconectar el CRM.' }, 403);
    const { error } = await sb.from('tl_oauth').delete().eq('id', 1);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, conectado: false });
  }

  return json({ error: 'Acción desconocida.' }, 400);
});
