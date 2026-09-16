// =============================================================================
// Sysefen · Edge Function `cliente-drive`
//
// Cuando se da de alta (o se corrige) un cliente en la agenda de presupuestos,
// lo escribe en la hoja de cálculo única "Clientes Sysefen": una fila por
// cliente. Si el cliente ya tenía fila, se corrige esa fila; no se añade otra.
// La hoja se crea sola la primera vez, dentro de la carpeta de clientes.
//
// NO se crea una carpeta por cliente aquí: las fotos y los PDF de cada uno van
// a su carpeta dentro de la de VISITAS, que crea `visita-drive` el día que se
// sube la primera visita. La hoja enlaza a esa carpeta en cuanto existe.
//
// SECRETOS (Supabase → Edge Functions → Secrets). Nunca en el código ni en Git:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN   los mismos
//   que usan `planilla-drive` y `parte-drive`
//   DRIVE_CARPETA_CLIENTES   carpeta de Drive donde vive la hoja de clientes
//
// En Google Cloud tiene que estar activada la API de Google Sheets, además de
// la de Drive. El permiso `drive.file` basta: la hoja la crea esta función, y
// a lo que crea la app sí llega.
//
// DESPLIEGUE: "Verify JWT" ACTIVADO. La llama la app con la sesión de quien
// guarda el cliente.
//
// QUIÉN PUEDE: presupuestos, jefe y Administración.
//
// USO (POST con JSON):  { "cliente_id": "uuid" }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const CABECERA = ['Alta', 'Nombre', 'Tipo', 'NIF', 'Teléfono', 'Email',
  'Dirección', 'Población', 'Origen', 'Nota', 'Carpeta de visitas'];

async function tokenDeGoogle(id: string, secreto: string, refresh: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id, client_secret: secreto, refresh_token: refresh, grant_type: 'refresh_token',
    }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.access_token) {
    throw new Error('Google no aceptó las credenciales: ' + (res.error_description || res.error || r.status));
  }
  return res.access_token as string;
}

// La hoja única de clientes. Se busca por el id guardado en `ajustes`; si no
// está o la borraron, se crea otra con su cabecera y se guarda el id nuevo.
async function hojaDeClientes(token: string, carpeta: string, guardada: string | null) {
  const cabeceras = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  if (guardada) {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${guardada}?fields=id,trashed&supportsAllDrives=true`,
      { headers: cabeceras });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      if (d.id && !d.trashed) return { id: d.id as string, nueva: false };
    }
  }

  const crea = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({
      name: 'Clientes Sysefen',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [carpeta],
    }),
  });
  const d = await crea.json().catch(() => ({}));
  if (!crea.ok || !d.id) throw new Error('no se pudo crear la hoja: ' + (d.error?.message || crea.status));

  const cab = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${d.id}/values/A1:K1?valueInputOption=USER_ENTERED`,
    { method: 'PUT', headers: cabeceras, body: JSON.stringify({ values: [CABECERA] }) });
  if (!cab.ok) {
    const e = await cab.json().catch(() => ({}));
    throw new Error('la hoja se creó pero no se pudo escribir la cabecera: ' +
      (e.error?.message || cab.status) + ' (¿está activada la API de Google Sheets?)');
  }
  return { id: d.id as string, nueva: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  const REFRESH = Deno.env.get('GOOGLE_REFRESH_TOKEN') || '';
  const CARPETA = Deno.env.get('DRIVE_CARPETA_CLIENTES') || '';
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH || !CARPETA) {
    return json({ error: 'Faltan secretos de Google en Supabase (revisa DRIVE_CARPETA_CLIENTES).' }, 500);
  }

  // --- quién llama ------------------------------------------------------------
  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
  const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: 'Sesión no válida.' }, 401);
  const { data: yo } = await comoUsuario.from('empleados').select('id, rol').eq('user_id', user.id).maybeSingle();
  if (!yo) return json({ error: 'No se encuentra tu ficha de empleado.' }, 403);
  if (!['presupuestos', 'jefe', 'admin'].includes(yo.rol)) {
    return json({ error: 'Solo presupuestos, jefes y Administración.' }, 403);
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const clienteId = String(b.cliente_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(clienteId)) return json({ error: 'Falta el id del cliente.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: cli, error: errCli } = await admin.from('clientes_cache')
    .select('id, nombre, tipo, tl_tipo, nif, telefono, email, direccion, poblacion, origen, nota, drive_visitas_id, hoja_fila, created_at')
    .eq('id', clienteId).maybeSingle();
  if (errCli) return json({ error: 'No se pudo leer el cliente: ' + errCli.message }, 500);
  if (!cli) return json({ error: 'Ese cliente no existe.' }, 404);

  let token: string;
  try { token = await tokenDeGoogle(CLIENT_ID, CLIENT_SECRET, REFRESH); }
  catch (e) { return json({ error: (e as Error).message }, 502); }

  const cambios: Record<string, unknown> = { drive_at: new Date().toISOString() };

  // --- su fila en la hoja -------------------------------------------------------
  let hojaId = '';
  let fila = (cli.hoja_fila as number | null) || null;
  let avisoHoja = '';
  try {
    const { data: aj } = await admin.from('ajustes').select('valor').eq('clave', 'drive_hoja_clientes').maybeSingle();
    const h = await hojaDeClientes(token, CARPETA, (aj?.valor as string) || null);
    hojaId = h.id;
    if (h.nueva) {
      await admin.from('ajustes').upsert({ clave: 'drive_hoja_clientes', valor: hojaId, updated_at: new Date().toISOString() });
      fila = null;   // hoja nueva: las filas viejas ya no valen
    }

    const valores = [[
      String(cli.created_at || '').slice(0, 10),
      cli.nombre || '',
      cli.tipo || (cli.tl_tipo === 'company' ? 'empresa' : 'particular'),
      cli.nif || '', cli.telefono || '', cli.email || '',
      cli.direccion || '', cli.poblacion || '', cli.origen || '', cli.nota || '',
      // La carpeta de sus visitas, si ya se subió alguna. Si no, en blanco:
      // se rellena sola la próxima vez que se repase esta fila.
      cli.drive_visitas_id ? 'https://drive.google.com/drive/folders/' + cli.drive_visitas_id : '',
    ]];
    const cabeceras = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

    if (fila && fila > 1) {
      const r = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${hojaId}/values/A${fila}:K${fila}?valueInputOption=USER_ENTERED`,
        { method: 'PUT', headers: cabeceras, body: JSON.stringify({ values: valores }) });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error?.message || 'error ' + r.status);
      }
    } else {
      const r = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${hojaId}/values/A1:append` +
        '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
        { method: 'POST', headers: cabeceras, body: JSON.stringify({ values: valores }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error?.message || 'error ' + r.status);
      // updatedRange viene como "Hoja 1!A7:K7"; de ahí sale el número de fila.
      const m = String(d.updates?.updatedRange || '').match(/![A-Z]+(\d+)/);
      if (m) { fila = Number(m[1]); cambios.hoja_fila = fila; }
    }
  } catch (e) {
    avisoHoja = (e as Error).message;
  }

  await admin.from('clientes_cache').update(cambios).eq('id', cli.id);

  return json({
    ok: true,
    hoja_id: hojaId || null,
    hoja_url: hojaId ? 'https://docs.google.com/spreadsheets/d/' + hojaId : null,
    fila: fila || null,
    aviso: avisoHoja || null,
  });
});
