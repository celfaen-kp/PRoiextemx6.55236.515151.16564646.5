// =============================================================================
// Sysefen · Edge Function `legalizacion-enviar`
//
// Recibe los dos PDF de una legalización fotovoltaica, ya dibujados en el
// móvil (el certificado CAIB rellenado y la hoja de datos del Modelo 034), los
// sube a Drive y se los manda por correo a quien lleva las legalizaciones.
//
// EN DRIVE: dentro de la carpeta «08-Legalizaciones» se crea una carpeta por
// obra («Casa Can Roca · Familia Roca») y ahí van los dos PDF. Si se vuelve a
// enviar, los archivos nuevos se numeran; no se pisa nada.
//
// EL CORREO va al correo de legalizaciones de la tabla `empresa` (Ajustes →
// Administración), con los dos PDF adjuntos y copia a quien lo envía.
//
// SECRETOS (Supabase → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN  (los de Drive)
//   DRIVE_CARPETA_LEGALIZACIONES   id de la carpeta 08-Legalizaciones
//   RESEND_API_KEY                 el mismo que enviar-parte
//
// DESPLIEGUE: "Verify JWT" ACTIVADO.
// QUIÉN PUEDE: presupuestos, jefes y Administración.
//
// USO (POST con JSON):
//   { "legalizacion_id": "uuid", "cert_base64": "JVBERi0...", "datos_base64": "JVBERi0..." }
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
const limpiar = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

async function tokenDeGoogle(id: string, secreto: string, refresh: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secreto, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.access_token) {
    throw new Error('Google no aceptó las credenciales: ' + (res.error_description || res.error || r.status));
  }
  return res.access_token as string;
}

// Carpeta dentro de otra: la guardada si sigue existiendo, si no la que tenga
// ese nombre, y si tampoco, se crea. (Igual que en visita-drive; se repite
// porque cada función se despliega sola.)
async function carpetaDentro(token: string, padre: string, nombre: string, guardada: string | null) {
  const cab = { Authorization: 'Bearer ' + token };
  if (guardada) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${guardada}?fields=id,trashed&supportsAllDrives=true`, { headers: cab });
    if (r.ok) { const d = await r.json(); if (!d.trashed) return guardada; }
  }
  const q = encodeURIComponent(
    `'${padre}' in parents and name = '${nombre.replace(/'/g, "\\'")}' ` +
    `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const busca = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: cab });
  const hallado = (await busca.json().catch(() => ({})))?.files?.[0]?.id;
  if (hallado) return hallado as string;
  const crea = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { ...cab, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padre] }),
  });
  const d = await crea.json().catch(() => ({}));
  if (!crea.ok || !d.id) throw new Error('no se pudo crear la carpeta: ' + (d.error?.message || crea.status));
  return d.id as string;
}

// Si ya hay un archivo con ese nombre en la carpeta, el nuevo se numera.
async function nombreLibre(token: string, carpetaId: string, nombre: string) {
  const base = nombre.replace(/\.pdf$/i, '');
  const q = encodeURIComponent(`'${carpetaId}' in parents and trashed = false and name contains '${base.replace(/'/g, "\\'")}'`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } });
  const nombres = new Set(((await r.json().catch(() => ({})))?.files || []).map((f: { name: string }) => f.name));
  if (!nombres.has(nombre)) return nombre;
  for (let n = 2; n < 100; n++) { const c = `${base} (${n}).pdf`; if (!nombres.has(c)) return c; }
  return `${base} (${Date.now()}).pdf`;
}

async function subirArchivo(token: string, carpetaId: string, nombre: string, bytes: Uint8Array) {
  const limite = '-----sysefen' + crypto.randomUUID();
  const cabecera = new TextEncoder().encode(
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name: nombre, parents: [carpetaId] })}\r\n` +
    `--${limite}\r\nContent-Type: application/pdf\r\n\r\n`);
  const cierre = new TextEncoder().encode(`\r\n--${limite}--`);
  const cuerpo = new Uint8Array(cabecera.length + bytes.length + cierre.length);
  cuerpo.set(cabecera, 0); cuerpo.set(bytes, cabecera.length); cuerpo.set(cierre, cabecera.length + bytes.length);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${limite}` },
    body: cuerpo,
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.id) throw new Error('Drive rechazó la subida: ' + (res.error?.message || r.status));
  return res as { id: string; name: string; webViewLink?: string };
}

const aBytes = (b64: string) => {
  const bin = atob(b64.replace(/^data:[^,]*,/, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  const REFRESH = Deno.env.get('GOOGLE_REFRESH_TOKEN') || '';
  const CARPETA = Deno.env.get('DRIVE_CARPETA_LEGALIZACIONES') || '';
  const RESEND = Deno.env.get('RESEND_API_KEY') || '';
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH) return json({ error: 'Faltan los secretos de Google en Supabase.' }, 500);
  if (!CARPETA) return json({ error: 'Falta el secreto DRIVE_CARPETA_LEGALIZACIONES (el id de la carpeta 08-Legalizaciones).' }, 500);
  if (!RESEND) return json({ error: 'Falta el secreto RESEND_API_KEY.' }, 500);

  // --- quién llama --------------------------------------------------------------
  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
  const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: 'Sesión no válida.' }, 401);
  const { data: yo } = await comoUsuario.from('empleados').select('id, nombre, rol, email_avisos').eq('user_id', user.id).maybeSingle();
  if (!yo || !['presupuestos', 'jefe', 'admin'].includes(yo.rol)) {
    return json({ error: 'Solo presupuestos, jefes y Administración.' }, 403);
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const id = String(b.legalizacion_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Falta el id de la legalización.' }, 400);
  const cert = typeof b.cert_base64 === 'string' ? b.cert_base64 : '';
  const datosPdf = typeof b.datos_base64 === 'string' ? b.datos_base64 : '';
  if (!cert || !datosPdf) return json({ error: 'Faltan los PDF (certificado y hoja de datos).' }, 400);
  if (cert.length + datosPdf.length > 20_000_000) return json({ error: 'Los PDF son demasiado grandes.' }, 413);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: leg, error: errL } = await admin.from('legalizaciones')
    .select('id, obra_id, cliente_id, datos, drive_carpeta_id').eq('id', id).maybeSingle();
  if (errL) return json({ error: 'No se pudo leer la legalización: ' + errL.message }, 500);
  if (!leg) return json({ error: 'Esa legalización no existe.' }, 404);

  const { data: emp } = await admin.from('empresa').select('email_legalizaciones, empresa').eq('id', 1).maybeSingle();
  const para = String(emp?.email_legalizaciones || '').trim();
  if (!esEmail(para)) {
    return json({ error: 'Falta el correo de legalizaciones. Administración lo pone en Ajustes → Legalizaciones.' }, 409);
  }

  // deno-lint-ignore no-explicit-any
  const d = (leg.datos || {}) as Record<string, any>;
  let nombreObra = '';
  if (leg.obra_id) {
    const { data: o } = await admin.from('obras').select('nombre, cliente').eq('id', leg.obra_id).maybeSingle();
    nombreObra = limpiar([o?.nombre, o?.cliente].filter(Boolean).join(' · '));
  }
  const nombreCliente = limpiar(String(d.cliente_nombre || ''));
  const carpetaNombre = nombreObra || nombreCliente || ('Legalización ' + id.slice(0, 8));
  const hoy = new Date().toISOString().slice(0, 10);

  let token: string;
  try { token = await tokenDeGoogle(CLIENT_ID, CLIENT_SECRET, REFRESH); }
  catch (e) { return json({ error: (e as Error).message }, 502); }

  let carpeta: string;
  let certSubido: { id: string; name: string; webViewLink?: string };
  let datosSubido: { id: string; name: string; webViewLink?: string };
  try {
    carpeta = await carpetaDentro(token, CARPETA, carpetaNombre, (leg.drive_carpeta_id as string) || null);
    const n1 = await nombreLibre(token, carpeta, `${hoy} · Certificat verificació · ${nombreCliente || carpetaNombre}.pdf`);
    certSubido = await subirArchivo(token, carpeta, n1, aBytes(cert));
    const n2 = await nombreLibre(token, carpeta, `${hoy} · Modelo 034 datos · ${nombreCliente || carpetaNombre}.pdf`);
    datosSubido = await subirArchivo(token, carpeta, n2, aBytes(datosPdf));
  } catch (e) { return json({ error: 'Drive: ' + (e as Error).message }, 502); }

  // --- el correo a quien legaliza ------------------------------------------------
  const asunto = `Legalización fotovoltaica · ${carpetaNombre}`;
  const lineas = [
    `Hola:`, ``,
    `${yo.nombre} ha cerrado la legalización fotovoltaica de ${carpetaNombre}. Van adjuntos:`,
    `· el Annex de proves de verificació (CAIB) rellenado${d.verif_hecha ? ', con las medidas de la puesta en marcha' : ' (sin las medidas: faltan por tomar)'};`,
    `· la hoja con todos los datos para el Modelo 034.`, ``,
    `Cliente: ${d.cliente_nombre || '—'} · ${d.cliente_dni || '—'}`,
    `Emplazamiento: ${[d.inst_direccion, d.inst_cp_localidad].filter(Boolean).join(', ') || '—'}`,
    `CUPS: ${d.inst_cups || '—'} · CAU: ${d.inst_cau || '—'}`,
    `Potencia instalada: ${d.inst_potencia_kw || '—'} kW · Inversores: ${d.fv_inv_cantidad || '—'} × ${d.fv_inv_modelo || '—'} · Paneles: ${d.fv_pan_cantidad || '—'} × ${d.fv_pan_potencia_w || '—'} W`,
    ``,
    `Los dos PDF están también en Drive, en 08-Legalizaciones / ${carpetaNombre}.`,
    ``, `Un saludo,`, `La app de Sysefen`,
  ];
  const cc = esEmail(yo.email_avisos) && yo.email_avisos !== para ? [String(yo.email_avisos)] : [];
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REMITENTE, to: [para], cc, subject: asunto, text: lineas.join('\n'),
      attachments: [
        { filename: certSubido.name, content: cert.replace(/^data:[^,]*,/, '') },
        { filename: datosSubido.name, content: datosPdf.replace(/^data:[^,]*,/, '') },
      ],
    }),
  });
  if (!r.ok) {
    const res = await r.json().catch(() => ({}));
    // Drive ya está hecho: se guarda eso y se dice que el correo falló.
    await admin.from('legalizaciones').update({ drive_carpeta_id: carpeta, drive_cert_id: certSubido.id, drive_datos_id: datosSubido.id }).eq('id', id);
    return json({ error: 'Los PDF están en Drive, pero el correo no salió: ' + ((res as { message?: string }).message || r.status) }, 502);
  }

  await admin.from('legalizaciones').update({
    estado: 'enviada', drive_carpeta_id: carpeta, drive_cert_id: certSubido.id, drive_datos_id: datosSubido.id,
    enviada_a: para, enviada_at: new Date().toISOString(),
  }).eq('id', id);

  return json({ ok: true, carpeta: carpetaNombre, para, cc, cert: certSubido.webViewLink || null, datos: datosSubido.webViewLink || null });
});
