// =============================================================================
// Sysefen · Edge Function `parte-drive`
//
// Sube a Google Drive el PDF de un parte de trabajo (con firma y fotos) que la
// app acaba de generar. Dentro de la carpeta de partes se crea una carpeta por
// OBRA y ahí va el parte, como "2026-09-16 · P-0007.pdf".
//
// El PDF llega en base64 desde la app, igual que en `enviar-parte`: el parte se
// dibuja en el móvil, no está guardado en Supabase.
//
// SECRETOS (Supabase → Edge Functions → Secrets). Nunca en el código ni en Git:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN   los mismos
//   que usa `planilla-drive`
//   DRIVE_CARPETA_PARTES   id de la carpeta de Drive donde van los partes
//
// DESPLIEGUE: "Verify JWT" ACTIVADO. La llama la app con la sesión de quien
// guarda el parte.
//
// QUIÉN PUEDE: jefe y Administración, y el autor del parte.
//
// SI EL MISMO PARTE SE SUBE DOS VECES: se crea otro archivo numerado,
// "2026-09-16 · P-0007 (1).pdf". No se pisa nada; se decide después.
//
// USO (POST con JSON):
//   { "parte_id": "uuid", "pdf_base64": "JVBERi0..." }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const limpiar = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

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

// Carpeta de la obra dentro de la carpeta de partes. Se crea la primera vez y
// su id se guarda en `obras.drive_carpeta_id`, para no buscarla cada vez.
async function carpetaDeObra(token: string, raiz: string, nombre: string, guardada: string | null) {
  const cabeceras = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  if (guardada) {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${guardada}?fields=id,trashed&supportsAllDrives=true`,
      { headers: cabeceras });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      if (d.id && !d.trashed) return d.id as string;
    }
  }

  const q = encodeURIComponent(
    `'${raiz}' in parents and name = '${nombre.replace(/'/g, "\\'")}' ` +
    `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const busca = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true`,
    { headers: cabeceras });
  if (busca.ok) {
    const d = await busca.json().catch(() => ({}));
    if (d.files?.length) return d.files[0].id as string;
  }

  const crea = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [raiz] }),
  });
  const d = await crea.json().catch(() => ({}));
  if (!crea.ok || !d.id) throw new Error('no se pudo crear la carpeta de la obra: ' + (d.error?.message || crea.status));
  return d.id as string;
}

// Si ya hay un archivo con ese nombre, el nuevo se numera.
async function nombreLibre(token: string, carpetaId: string, nombre: string) {
  const base = nombre.replace(/\.pdf$/i, '');
  const q = encodeURIComponent(
    `'${carpetaId}' in parents and trashed = false and name contains '${base.replace(/'/g, "\\'")}'`);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(name)&pageSize=100&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return nombre;
  const d = await r.json().catch(() => ({}));
  const usados = new Set<string>((d.files || []).map((f: { name: string }) => f.name));
  if (!usados.has(nombre)) return nombre;
  for (let i = 1; i < 100; i++) {
    const intento = `${base} (${i}).pdf`;
    if (!usados.has(intento)) return intento;
  }
  return `${base} (${Date.now()}).pdf`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  const REFRESH = Deno.env.get('GOOGLE_REFRESH_TOKEN') || '';
  const CARPETA = Deno.env.get('DRIVE_CARPETA_PARTES') || '';
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH || !CARPETA) {
    return json({ error: 'Faltan secretos de Google en Supabase (revisa DRIVE_CARPETA_PARTES).' }, 500);
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

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const parteId = String(b.parte_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(parteId)) return json({ error: 'Falta el id del parte.' }, 400);
  const pdf = typeof b.pdf_base64 === 'string' ? b.pdf_base64 : '';
  if (!pdf) return json({ error: 'Falta el PDF.' }, 400);
  if (pdf.length > 14_000_000) return json({ error: 'El PDF es demasiado grande (más de 10 MB).' }, 413);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: parte } = await admin.from('partes')
    .select('id, ref, fecha, autor_id, obra_id').eq('id', parteId).maybeSingle();
  if (!parte) return json({ error: 'Ese parte no existe.' }, 404);
  if (!['jefe', 'admin'].includes(yo.rol) && parte.autor_id !== yo.id) {
    return json({ error: 'Solo el autor del parte, un jefe o Administración pueden subirlo.' }, 403);
  }

  const { data: obra } = await admin.from('obras')
    .select('id, nombre, cliente, drive_carpeta_id').eq('id', parte.obra_id).maybeSingle();
  const nombreObra = limpiar(obra?.nombre || obra?.cliente || 'Sin obra') || 'Sin obra';

  // --- a Drive ------------------------------------------------------------------
  let token: string;
  try { token = await tokenDeGoogle(CLIENT_ID, CLIENT_SECRET, REFRESH); }
  catch (e) { return json({ error: (e as Error).message }, 502); }

  let carpetaObra: string;
  try { carpetaObra = await carpetaDeObra(token, CARPETA, nombreObra, (obra?.drive_carpeta_id as string) || null); }
  catch (e) { return json({ error: 'Drive: ' + (e as Error).message }, 502); }
  if (obra && carpetaObra !== obra.drive_carpeta_id) {
    await admin.from('obras').update({ drive_carpeta_id: carpetaObra }).eq('id', obra.id);
  }

  const fecha = String(parte.fecha || '').slice(0, 10);
  const nombre = await nombreLibre(token, carpetaObra, `${fecha} · ${limpiar(parte.ref || 'parte')}.pdf`);

  // base64 -> bytes
  const bin = atob(pdf);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const limite = '-----sysefen' + crypto.randomUUID();
  const cabecera = new TextEncoder().encode(
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name: nombre, parents: [carpetaObra] })}\r\n` +
    `--${limite}\r\nContent-Type: application/pdf\r\n\r\n`);
  const cierre = new TextEncoder().encode(`\r\n--${limite}--`);
  const cuerpo = new Uint8Array(cabecera.length + bytes.length + cierre.length);
  cuerpo.set(cabecera, 0); cuerpo.set(bytes, cabecera.length); cuerpo.set(cierre, cabecera.length + bytes.length);

  const r = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${limite}` },
      body: cuerpo,
    });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.id) {
    return json({ error: 'Drive rechazó la subida: ' + (res.error?.message || r.status) }, 502);
  }

  await admin.from('partes')
    .update({ drive_id: res.id, drive_at: new Date().toISOString() })
    .eq('id', parte.id);

  return json({ ok: true, archivo: `${nombreObra}/${res.name || nombre}`, drive_id: res.id, carpeta: carpetaObra });
});
