// =============================================================================
// Sysefen · Edge Function `visita-drive`
//
// Sube a Google Drive una visita de presupuestos: el PDF con toda la ficha y,
// aparte, las fotos que se hicieron en la casa. Dentro de la carpeta de
// VISITAS se crea una carpeta por CLIENTE, y dentro otra por visita:
//
//   Visitas / Fulano de Tal / 2026-09-16 · V-2026-0007 /
//        2026-09-16 · V-2026-0007.pdf
//        1 · Aerotermia · Cuadro eléctrico.jpg
//        2 · Aerotermia · Salida de humos.jpg
//
// El PDF llega en base64 desde la app (se dibuja en el móvil). Las fotos ya
// están en Supabase Storage y las baja esta función.
//
// SECRETOS (Supabase → Edge Functions → Secrets). Nunca en el código ni en Git:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN   los mismos
//   que usan `planilla-drive` y `parte-drive`
//   DRIVE_CARPETA_VISITAS   id de la carpeta de Drive donde van las visitas
//
// DESPLIEGUE: "Verify JWT" ACTIVADO.
//
// QUIÉN PUEDE: presupuestos, jefe y Administración.
//
// SI LA MISMA VISITA SE SUBE DOS VECES: el PDF nuevo se numera, "(1)", "(2)";
// las fotos que ya estaban arriba no se repiten.
//
// USO (POST con JSON):
//   { "visita_id": "uuid", "pdf_base64": "JVBERi0..." }
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

// Carpeta dentro de otra: se reutiliza la guardada, si no la que tenga ese
// nombre, y si tampoco, se crea. Una carpeta en la papelera no cuenta.
async function carpetaDentro(token: string, padre: string, nombre: string, guardada: string | null) {
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
    `'${padre}' in parents and name = '${nombre.replace(/'/g, "\\'")}' ` +
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
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padre] }),
  });
  const d = await crea.json().catch(() => ({}));
  if (!crea.ok || !d.id) throw new Error('no se pudo crear la carpeta: ' + (d.error?.message || crea.status));
  return d.id as string;
}

// Si ya hay un archivo con ese nombre en la carpeta, el nuevo se numera.
async function nombreLibre(token: string, carpetaId: string, nombre: string) {
  const punto = nombre.lastIndexOf('.');
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const ext = punto > 0 ? nombre.slice(punto) : '';
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
    const intento = `${base} (${i})${ext}`;
    if (!usados.has(intento)) return intento;
  }
  return `${base} (${Date.now()})${ext}`;
}

async function subirArchivo(token: string, carpetaId: string, nombre: string, tipo: string, bytes: Uint8Array) {
  const limite = '-----sysefen' + crypto.randomUUID();
  const cabecera = new TextEncoder().encode(
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name: nombre, parents: [carpetaId] })}\r\n` +
    `--${limite}\r\nContent-Type: ${tipo}\r\n\r\n`);
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
  if (!r.ok || !res.id) throw new Error('Drive rechazó la subida: ' + (res.error?.message || r.status));
  return res as { id: string; name: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  const REFRESH = Deno.env.get('GOOGLE_REFRESH_TOKEN') || '';
  const CARPETA = Deno.env.get('DRIVE_CARPETA_VISITAS') || '';
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH || !CARPETA) {
    return json({ error: 'Faltan secretos de Google en Supabase (revisa DRIVE_CARPETA_VISITAS).' }, 500);
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
  const visitaId = String(b.visita_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(visitaId)) return json({ error: 'Falta el id de la visita.' }, 400);
  const pdf = typeof b.pdf_base64 === 'string' ? b.pdf_base64 : '';
  if (!pdf) return json({ error: 'Falta el PDF.' }, 400);
  if (pdf.length > 14_000_000) return json({ error: 'El PDF es demasiado grande (más de 10 MB).' }, 413);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: visita, error: errV } = await admin.from('visitas')
    .select('id, codigo, fecha_visita, cliente_id, direccion, poblacion, drive_carpeta_id')
    .eq('id', visitaId).maybeSingle();
  if (errV) return json({ error: 'No se pudo leer la visita: ' + errV.message }, 500);
  if (!visita) return json({ error: 'Esa visita no existe.' }, 404);

  const { data: cli } = await admin.from('clientes_cache')
    .select('id, nombre, drive_visitas_id').eq('id', visita.cliente_id).maybeSingle();
  const nombreCliente = limpiar(cli?.nombre || visita.direccion || 'Sin cliente') || 'Sin cliente';

  let token: string;
  try { token = await tokenDeGoogle(CLIENT_ID, CLIENT_SECRET, REFRESH); }
  catch (e) { return json({ error: (e as Error).message }, 502); }

  // --- carpeta del cliente y carpeta de esta visita ------------------------------
  const fecha = String(visita.fecha_visita || '').slice(0, 10);
  const codigo = limpiar(String(visita.codigo || '')) || String(visita.id).slice(0, 8).toUpperCase();
  let carpetaCliente: string, carpetaVisita: string;
  try {
    carpetaCliente = await carpetaDentro(token, CARPETA, nombreCliente, (cli?.drive_visitas_id as string) || null);
    carpetaVisita = await carpetaDentro(token, carpetaCliente, `${fecha} · ${codigo}`,
      (visita.drive_carpeta_id as string) || null);
  } catch (e) { return json({ error: 'Drive: ' + (e as Error).message }, 502); }

  if (cli && carpetaCliente !== cli.drive_visitas_id) {
    await admin.from('clientes_cache').update({ drive_visitas_id: carpetaCliente }).eq('id', cli.id);
  }

  // --- el PDF -------------------------------------------------------------------
  const bin = atob(pdf);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  let subido: { id: string; name: string };
  try {
    const nombre = await nombreLibre(token, carpetaVisita, `${fecha} · ${codigo}.pdf`);
    subido = await subirArchivo(token, carpetaVisita, nombre, 'application/pdf', bytes);
  } catch (e) { return json({ error: (e as Error).message }, 502); }

  // --- las fotos ----------------------------------------------------------------
  // Van sueltas además de dentro del PDF: así se pueden mirar a tamaño grande
  // y mandarlas a un proveedor sin abrir nada.
  let fotosSubidas = 0, fotosFallidas = 0;
  const { data: adj } = await admin.from('visita_adjuntos')
    .select('id, storage_path, campo_ref, descripcion, drive_id, created_at')
    .eq('visita_id', visita.id).order('created_at');

  let n = 0;
  for (const a of adj || []) {
    n++;
    if (a.drive_id) continue;                    // ya estaba en Drive
    try {
      const bajada = await admin.storage.from('visitas').download(a.storage_path as string);
      if (bajada.error || !bajada.data) throw new Error(bajada.error?.message || 'no se pudo bajar');
      const buf = new Uint8Array(await bajada.data.arrayBuffer());
      const etiquetas = [String(a.campo_ref || '').split('.')[0], a.descripcion]
        .map((x) => limpiar(String(x || ''))).filter(Boolean);
      const nombreFoto = await nombreLibre(token, carpetaVisita,
        [n, ...etiquetas].join(' · ') + '.jpg');
      const f = await subirArchivo(token, carpetaVisita, nombreFoto, 'image/jpeg', buf);
      await admin.from('visita_adjuntos').update({ drive_id: f.id }).eq('id', a.id);
      fotosSubidas++;
    } catch (_) { fotosFallidas++; }
  }

  await admin.from('visitas')
    .update({ drive_id: subido.id, drive_at: new Date().toISOString(), drive_carpeta_id: carpetaVisita })
    .eq('id', visita.id);

  return json({
    ok: true,
    archivo: `${nombreCliente}/${fecha} · ${codigo}/${subido.name}`,
    carpeta_url: 'https://drive.google.com/drive/folders/' + carpetaVisita,
    fotos: fotosSubidas,
    fotos_fallidas: fotosFallidas,
  });
});
