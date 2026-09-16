// =============================================================================
// Sysefen · Edge Function `planilla-drive`
//
// Sube a Google Drive el PDF de una planilla firmada que ya está guardado en
// Supabase Storage. Sin Make por el medio: la app llama a esta función y la
// función habla directamente con Drive.
//
// SECRETOS (Supabase → Edge Functions → Secrets). Nunca en el código ni en Git:
//   GOOGLE_CLIENT_ID       del cliente OAuth creado en Google Cloud
//   GOOGLE_CLIENT_SECRET   su clave
//   GOOGLE_REFRESH_TOKEN   el permiso permanente de la cuenta dueña de la carpeta
//   DRIVE_CARPETA_ID       id de la carpeta de Drive donde se guardan las planillas
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.)
//
// DESPLIEGUE: "Verify JWT" ACTIVADO (lo normal). La llama la app con la sesión
// de quien firma.
//
// QUIÉN PUEDE: cada persona puede subir SU planilla; jefe y Administración,
// cualquiera. Se comprueba con las políticas de siempre, leyendo el documento
// con la sesión de quien llama.
//
// USO (POST con JSON):
//   { "documento_id": "uuid" }
//
// SI LA MISMA PLANILLA SE VUELVE A FIRMAR: se sustituye el archivo en Drive en
// vez de dejar dos. Se busca por el id que quedó guardado en `ref_externa`.
//
// CADA PERSONA TIENE SU CARPETA dentro de DRIVE_CARPETA_ID, con su nombre. Se
// crea la primera vez que firma (sql/etapa27 guarda su id en empleados).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Permiso de Google de larga duración -> permiso de una hora para esta llamada.
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


// Carpeta de la persona dentro de la carpeta de planillas. Se crea la primera
// vez que firma y se guarda su id en `empleados.drive_carpeta_id`, para no
// buscarla en cada subida. Con el permiso `drive.file` solo vemos lo que crea
// esta app, así que la carpeta la crea y la mantiene ella.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// "2026-09" -> "Septiembre 2026.pdf" · "2026" -> "Anual 2026.pdf" · "historial" -> "Historial.pdf"
function nombreDePlanilla(periodo: string | null) {
  const p = String(periodo || '').trim();
  const mes = p.match(/^(\d{4})-(\d{2})$/);
  if (mes) {
    const n = MESES[Number(mes[2]) - 1];
    if (n) return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${mes[1]}.pdf`;
  }
  if (/^\d{4}$/.test(p)) return `Anual ${p}.pdf`;
  if (p.toLowerCase() === 'historial') return 'Historial.pdf';
  return (p || 'planilla') + '.pdf';
}

async function carpetaDelEmpleado(token: string, raiz: string, nombre: string, guardada: string | null) {
  const cabeceras = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  if (guardada) {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${guardada}?fields=id,trashed&supportsAllDrives=true`,
      { headers: cabeceras });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      if (d.id && !d.trashed) return { id: d.id as string, nueva: false };
    }
    // Si ya no está (la borraron o la sacaron de aquí), se crea otra.
  }

  // ¿La creamos nosotros antes y se perdió el id? Se busca por nombre.
  const q = encodeURIComponent(
    `'${raiz}' in parents and name = '${nombre.replace(/'/g, "\\'")}' ` +
    `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const busca = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1&supportsAllDrives=true`,
    { headers: cabeceras });
  if (busca.ok) {
    const d = await busca.json().catch(() => ({}));
    if (d.files?.length) return { id: d.files[0].id as string, nueva: false };
  }

  const crea = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [raiz] }),
  });
  const d = await crea.json().catch(() => ({}));
  if (!crea.ok || !d.id) throw new Error('no se pudo crear su carpeta: ' + (d.error?.message || crea.status));
  return { id: d.id as string, nueva: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  const REFRESH = Deno.env.get('GOOGLE_REFRESH_TOKEN') || '';
  const CARPETA = Deno.env.get('DRIVE_CARPETA_ID') || '';
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH || !CARPETA) {
    return json({ error: 'Faltan secretos de Google en Supabase (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, DRIVE_CARPETA_ID).' }, 500);
  }

  // --- quién llama ------------------------------------------------------------
  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
  const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: 'Sesión no válida.' }, 401);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const documentoId = String(b.documento_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(documentoId)) return json({ error: 'Falta el id del documento.' }, 400);

  // La política de `documentos` ya decide quién ve qué: si no lo ve, no lo sube.
  const { data: doc } = await comoUsuario
    .from('documentos')
    .select('id, tipo, periodo, ruta, nombre, ref_externa, empleado_id')
    .eq('id', documentoId)
    .maybeSingle();
  if (!doc) return json({ error: 'Esa planilla no existe o no es tuya.' }, 403);
  if (doc.tipo !== 'planilla') return json({ error: 'Solo se suben planillas.' }, 400);

  // --- el archivo, con la llave del servidor -----------------------------------
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: archivo, error: errBaja } = await admin.storage.from('documentos').download(doc.ruta);
  if (errBaja || !archivo) return json({ error: 'No se pudo leer el PDF: ' + (errBaja?.message || 'sin archivo') }, 500);
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  const { data: emp } = await admin.from('empleados')
    .select('nombre, nombre_completo, drive_carpeta_id').eq('id', doc.empleado_id).maybeSingle();
  const quien = (emp?.nombre_completo || emp?.nombre || 'Sin nombre').replace(/[\\/:*?"<>|]/g, '-').trim();
  // Dentro de su carpeta, el nombre dice el periodo: "Septiembre 2026.pdf".
  const nombre = nombreDePlanilla(doc.periodo);

  // --- a Drive ------------------------------------------------------------------
  let token: string;
  try { token = await tokenDeGoogle(CLIENT_ID, CLIENT_SECRET, REFRESH); }
  catch (e) { return json({ error: (e as Error).message }, 502); }

  let carpeta: { id: string; nueva: boolean };
  try { carpeta = await carpetaDelEmpleado(token, CARPETA, quien, (emp?.drive_carpeta_id as string) || null); }
  catch (e) { return json({ error: 'Drive: ' + (e as Error).message }, 502); }
  if (carpeta.id !== emp?.drive_carpeta_id) {
    await admin.from('empleados').update({ drive_carpeta_id: carpeta.id }).eq('id', doc.empleado_id);
  }

  const limite = '-----sysefen' + crypto.randomUUID();
  const cuerpoMultipart = (metadatos: unknown) => {
    const cabecera = new TextEncoder().encode(
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadatos)}\r\n` +
      `--${limite}\r\nContent-Type: application/pdf\r\n\r\n`);
    const cierre = new TextEncoder().encode(`\r\n--${limite}--`);
    const todo = new Uint8Array(cabecera.length + bytes.length + cierre.length);
    todo.set(cabecera, 0); todo.set(bytes, cabecera.length); todo.set(cierre, cabecera.length + bytes.length);
    return todo;
  };

  // Si ya se subió antes, se sustituye ese mismo archivo: así no se acumulan
  // copias cuando alguien vuelve a firmar el mismo mes.
  const anterior = typeof doc.ref_externa === 'string' && /^[\w-]{10,}$/.test(doc.ref_externa) ? doc.ref_externa : '';

  const url = anterior
    ? `https://www.googleapis.com/upload/drive/v3/files/${anterior}?uploadType=multipart&supportsAllDrives=true&fields=id,name`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name';
  const metadatos = anterior ? { name: nombre } : { name: nombre, parents: [carpeta.id] };

  let r = await fetch(url, {
    method: anterior ? 'PATCH' : 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${limite}` },
    body: cuerpoMultipart(metadatos),
  });
  // Si el archivo anterior ya no está en Drive (lo borraron), se sube de nuevo.
  if (!r.ok && anterior && (r.status === 404 || r.status === 403)) {
    r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${limite}` },
      body: cuerpoMultipart({ name: nombre, parents: [carpeta.id] }),
    });
  }
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.id) {
    return json({ error: 'Drive rechazó la subida: ' + (res.error?.message || r.status) }, 502);
  }

  // --- que quede dentro de su carpeta ---------------------------------------------
  // Se hace en un paso aparte, después de subir el contenido: mover y subir a la
  // vez no siempre se aplica, y el archivo se quedaba donde estaba.
  let ubicacion = 'sin comprobar';
  try {
    const info = await fetch(
      `https://www.googleapis.com/drive/v3/files/${res.id}?fields=parents&supportsAllDrives=true`,
      { headers: { Authorization: 'Bearer ' + token } });
    const d = info.ok ? await info.json().catch(() => ({})) : {};
    const padres: string[] = d.parents || [];
    if (!padres.includes(carpeta.id)) {
      const quitar = padres.length ? `&removeParents=${padres.join(',')}` : '';
      const mueve = await fetch(
        `https://www.googleapis.com/drive/v3/files/${res.id}?addParents=${carpeta.id}${quitar}&fields=id,parents&supportsAllDrives=true`,
        { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
      const m = await mueve.json().catch(() => ({}));
      ubicacion = mueve.ok && (m.parents || []).includes(carpeta.id) ? 'movida' : 'no se pudo mover: ' + (m.error?.message || mueve.status);
    } else {
      ubicacion = 'ya estaba';
    }
  } catch (e) {
    ubicacion = 'no se pudo comprobar: ' + (e as Error).message;
  }

  // --- queda constancia ----------------------------------------------------------
  await admin.from('documentos')
    .update({ exportado_en: new Date().toISOString(), ref_externa: res.id })
    .eq('id', doc.id);

  return json({ ok: true, archivo: `${quien}/${res.name || nombre}`, drive_id: res.id, carpeta: carpeta.id, ubicacion });
});
