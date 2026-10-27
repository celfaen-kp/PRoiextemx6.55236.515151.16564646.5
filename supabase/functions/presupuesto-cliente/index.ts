// Sysefen · presupuesto-cliente · El presupuesto al cliente y su firma (Enzo, 27-10-2026)
//
// Tres cosas en una función (sql/etapa93):
//   1 · POST {accion:'enviar', ids, para, cc, asunto, mensaje, pdfs:[{id, base64, nombre}]}
//       con la sesión de la app: manda el correo al cliente con las opciones
//       elegidas (una o varias), un mensaje libre, los PDF adjuntos y un enlace
//       «Ver y aceptar» por presupuesto. Marca enviado al cliente.
//   2 · GET ?t=TOKEN                la página pública: el presupuesto y la firma.
//       GET ?t=TOKEN&pdf=1          el PDF (el enviado, o el firmado si ya lo está).
//   3 · POST {accion:'firmar', t, nombre, dni, firma}  desde esa página: guarda la
//       firma, genera el PDF firmado (el enviado + una página de aceptación),
//       marca el presupuesto aceptado, lo manda por correo a la oficina y al
//       cliente y lo deja en el Drive.
// Se despliega SIN verify_jwt (la página del cliente no tiene sesión).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const html = (cuerpo: string, status = 200) => {
  const h = new Headers(CORS);
  h.set('content-type', 'text/html; charset=utf-8');
  h.set('cache-control', 'no-store');
  return new Response(new TextEncoder().encode(cuerpo), { status, headers: h });
};

const ZONA = 'Europe/Madrid';
const APP_URL = 'https://celfaen-kp.github.io/PRoiextemx6.55236.515151.16564646.5/';
const LOGO_URL = APP_URL + 'logo-email.png';
const REMITENTE = 'Sysefen <noreply@sysefen.com>';
const BUCKET = 'presupuestos-cliente';
const CATS: Record<string, string> = { solar: 'Fotovoltaica', aerotermia: 'Aerotermia', aire_acondicionado: 'Aire acondicionado', electricidad: 'Electricidad' };

const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const eur = (n: unknown) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fecha = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' }) : '';
const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const limpio = (v: unknown) => String(v == null ? '' : v).trim();
const b64aBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/^data:[^,]*,/, '')), (c) => c.charCodeAt(0));
const bytesAb64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000))); return btoa(s); };
const token = () => crypto.randomUUID().replace(/-/g, '') + Math.random().toString(36).slice(2, 10);
const vence = (p: { enviado_cliente_at?: string | null; validez_dias?: number; prorroga_dias?: number }) => {
  if (!p.enviado_cliente_at) return null;
  const t = new Date(p.enviado_cliente_at); t.setDate(t.getDate() + (Number(p.validez_dias) || 15) + (Number(p.prorroga_dias) || 0)); return t.toISOString();
};

// ---------- correo (Resend) ----------
async function mandar(RESEND: string, msg: { to: string[]; cc?: string[]; reply_to?: string; subject: string; text: string; html: string; attachments?: { filename: string; content: string }[] }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ from: REMITENTE }, msg)),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { message?: string }).message || String(r.status)); }
}
const marco = (titulo: string, cuerpo: string) => `<div style="background:#f5f4ef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#14170f">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:18px;padding:28px 26px">
    <img src="${LOGO_URL}" alt="Sysefen" style="height:42px;margin-bottom:18px">
    <div style="font:700 24px/1.15 Arial,Helvetica,sans-serif;margin-bottom:12px">${titulo}</div>
    ${cuerpo}
    <div style="margin-top:26px;padding-top:14px;border-top:1px solid #e6e5df;font-size:12px;color:#777">Sysefen · Eficiencia Energética · Mallorca</div>
  </div></div>`;

// ---------- Google Drive ----------
async function tokenDeGoogle(id: string, secreto: string, refresh: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secreto, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('Google no dio token: ' + (d.error_description || d.error || r.status));
  return d.access_token as string;
}
async function carpetaDentro(tok: string, padre: string, nombre: string) {
  const cab = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  const q = encodeURIComponent(`'${padre}' in parents and name = '${nombre.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const busca = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: cab });
  if (busca.ok) { const d = await busca.json().catch(() => ({})); if (d.files?.length) return d.files[0].id as string; }
  const crea = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', { method: 'POST', headers: cab, body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padre] }) });
  const d = await crea.json().catch(() => ({}));
  if (!crea.ok || !d.id) throw new Error('no se pudo crear la carpeta: ' + (d.error?.message || crea.status));
  return d.id as string;
}
async function subirADrive(tok: string, carpetaId: string, nombre: string, bytes: Uint8Array) {
  const limite = '----sysefen' + Date.now();
  const cabecera = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [carpetaId] })}\r\n--${limite}\r\nContent-Type: application/pdf\r\n\r\n`;
  const pie = `\r\n--${limite}--`;
  const cuerpo = new Uint8Array([...new TextEncoder().encode(cabecera), ...bytes, ...new TextEncoder().encode(pie)]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink', {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + limite }, body: cuerpo,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new Error('Drive no aceptó el archivo: ' + (d.error?.message || r.status));
  return { id: d.id as string, url: (d.webViewLink as string) || ('https://drive.google.com/file/d/' + d.id + '/view') };
}

// ---------- el PDF firmado: el enviado + una página de aceptación ----------
// deno-lint-ignore no-explicit-any
async function pdfFirmado(original: Uint8Array | null, p: any, cli: any, nombre: string, dni: string, ip: string, firmaPng: Uint8Array, cuando: Date) {
  const doc = original ? await PDFDocument.load(original, { ignoreEncryption: true }) : await PDFDocument.create();
  const pagina = doc.addPage([595.28, 841.89]);
  const fuente = await doc.embedFont(StandardFonts.Helvetica), negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = (s: string) => s.replace(/[^\x00-\xff]/g, '?');
  let y = 790;
  const linea = (txt: string, size = 11, bold = false, color = rgb(0.08, 0.09, 0.06)) => { pagina.drawText(w(txt), { x: 56, y, size, font: bold ? negrita : fuente, color }); y -= size + 7; };
  linea('ACEPTACIÓN DEL PRESUPUESTO', 16, true);
  y -= 6;
  linea('Presupuesto: ' + (p.titulo || CATS[p.categoria] || ''), 11, true);
  if (p.tl_numero) linea('Número: ' + p.tl_numero);
  linea('Cliente: ' + (cli?.nombre || ''));
  linea('Base imponible: ' + eur(p.total_venta) + ' · IVA 21 %: ' + eur(Math.round(Number(p.total_venta) * 21) / 100) + ' · Total: ' + eur(Math.round(Number(p.total_venta) * 121) / 100));
  y -= 10;
  linea('El cliente declara haber leído el presupuesto adjunto y aceptar su contenido y condiciones.', 11);
  y -= 6;
  linea('Firmado por: ' + nombre + (dni ? ' · ' + dni : ''), 12, true);
  linea('Fecha y hora: ' + cuando.toLocaleString('es-ES', { timeZone: ZONA }) + ' (hora de Madrid)');
  linea('Firma electrónica recogida en la página de aceptación de Sysefen · IP ' + (ip || 'desconocida'), 9, false, rgb(0.4, 0.4, 0.4));
  y -= 14;
  try {
    const img = await doc.embedPng(firmaPng);
    const ancho = 260, alto = ancho * (img.height / img.width);
    pagina.drawRectangle({ x: 56, y: y - alto - 10, width: ancho + 20, height: alto + 20, borderColor: rgb(0.75, 0.75, 0.72), borderWidth: 1 });
    pagina.drawImage(img, { x: 66, y: y - alto, width: ancho, height: alto });
    y -= alto + 24;
  } catch (_) { linea('(firma no legible)', 10); }
  linea('Sysefen · Eficiencia Energética', 9, false, rgb(0.4, 0.4, 0.4));
  return await doc.save();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const RESEND = Deno.env.get('RESEND_API_KEY') || '';
  const url = new URL(req.url);

  // --- la página del cliente y su PDF (sin sesión, por el token) ----------------
  if (req.method === 'GET') {
    const t = limpio(url.searchParams.get('t'));
    if (!/^[a-z0-9]{36,60}$/i.test(t)) return html('<p style="font-family:Arial;padding:40px">Enlace no válido.</p>', 404);
    const { data: p } = await sb.from('presupuestos').select('*, cliente:clientes_cache(id, nombre, email)').eq('token_cliente', t).maybeSingle();
    if (!p) return html('<p style="font-family:Arial;padding:40px">Este enlace ya no está disponible.</p>', 404);
    if (url.searchParams.get('pdf') === '1') {
      const ruta = p.pdf_firmado_ruta || p.pdf_enviado_ruta;
      if (!ruta) return html('<p style="font-family:Arial;padding:40px">No hay PDF.</p>', 404);
      const { data: f, error } = await sb.storage.from(BUCKET).download(ruta);
      if (error || !f) return html('<p style="font-family:Arial;padding:40px">No se pudo leer el PDF.</p>', 500);
      return new Response(f, { headers: { ...CORS, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="presupuesto-sysefen.pdf"' } });
    }
    const { data: lineas } = await sb.from('presupuesto_lineas').select('*').eq('presupuesto_id', p.id).order('orden');
    if (url.searchParams.get('json') !== '1') {
      return new Response(null, { status: 302, headers: { ...CORS, Location: APP_URL + 'firmar.html?t=' + encodeURIComponent(t) } });
    }
    // Lo que ve el cliente: nada interno (costes, desgloses, reglas).
    const ls = (lineas || []).map((l) => ({ descripcion: l.descripcion, detalle_tecnico: l.detalle_tecnico, cantidad: l.cantidad, unidad: l.unidad, precio_tarifa: l.precio_tarifa, dto_linea_pct: l.dto_linea_pct, precio_venta: l.precio_venta, seccion: l.seccion }));
    const fv2 = (lineas || []).map((l) => l.origen_inputs).find((o) => o && o.fv2);
    const condiciones = fv2 ? [fv2.nota, fv2.condiciones].filter(Boolean).join(' ') : 'Presupuesto orientativo, válido ' + (p.validez_dias || 15) + ' días. No incluye obra civil ni permisos que no se nombren arriba.';
    const bruto = ls.reduce((a, l) => a + (Number(l.precio_venta) || 0), 0);
    const dtoG = Number(p.dto_global_pct) || 0;
    const base = Number(p.total_venta) || Math.round(bruto * (1 - dtoG / 100) * 100) / 100;
    const iva = Math.round(base * 21) / 100;
    let pdf_url: string | null = null;
    const rutaPdf = p.pdf_firmado_ruta || p.pdf_enviado_ruta;
    if (rutaPdf) { const { data: su } = await sb.storage.from(BUCKET).createSignedUrl(rutaPdf, 3600); pdf_url = su?.signedUrl || null; }
    return json({
      presupuesto: { titulo: p.titulo || CATS[p.categoria] || 'Presupuesto', categoria: CATS[p.categoria] || p.categoria, tl_numero: p.tl_numero, enviado_correo_at: p.enviado_correo_at, firmado_at: p.firmado_at, firma_nombre: p.firma_nombre, validez_dias: p.validez_dias },
      cliente: p.cliente?.nombre || '', lineas: ls, condiciones, vence: vence(p),
      totales: { bruto: Math.round(bruto * 100) / 100, dto_global_pct: dtoG, base, iva, total: Math.round((base + iva) * 100) / 100 }, pdf_url,
    });
  }
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }

  // --- 3 · la firma del cliente (sin sesión, por el token) ------------------------
  if (b.accion === 'firmar') {
    const t = limpio(b.t);
    if (!/^[a-z0-9]{36,60}$/i.test(t)) return json({ error: 'Enlace no válido.' }, 404);
    const { data: p } = await sb.from('presupuestos').select('*, cliente:clientes_cache(id, nombre, email, direccion, poblacion, tl_id, tl_tipo)').eq('token_cliente', t).maybeSingle();
    if (!p) return json({ error: 'Este enlace ya no está disponible.' }, 404);
    if (p.firmado_at) return json({ ok: true, ya: true });
    const nombre = limpio(b.nombre).slice(0, 120), dni = limpio(b.dni).toUpperCase().replace(/[\s.-]/g, '').slice(0, 20);
    if (nombre.length < 3) return json({ error: 'Falta el nombre.' }, 400);
    if (!/^([XYZ]?\d{7,8}[A-Z])$/.test(dni) && !/^[A-Z]\d{7}[A-Z0-9]$/.test(dni)) return json({ error: 'Falta un DNI, NIE o CIF válido.' }, 400);
    if (typeof b.firma !== 'string' || !/^data:image\/png;base64,/.test(b.firma) || b.firma.length > 600_000) return json({ error: 'Falta la firma.' }, 400);
    const ip = limpio(req.headers.get('x-forwarded-for') || '').split(',')[0] || limpio(req.headers.get('cf-connecting-ip'));
    const cuando = new Date();
    const firmaPng = b64aBytes(b.firma);
    const base = `${p.id}/firma-${cuando.getTime()}`;
    const s1 = await sb.storage.from(BUCKET).upload(base + '.png', firmaPng, { contentType: 'image/png', upsert: false });
    if (s1.error) return json({ error: 'No se pudo guardar la firma: ' + s1.error.message }, 500);
    let original: Uint8Array | null = null;
    if (p.pdf_enviado_ruta) { const { data: f } = await sb.storage.from(BUCKET).download(p.pdf_enviado_ruta); if (f) original = new Uint8Array(await f.arrayBuffer()); }
    let pdf: Uint8Array;
    try { pdf = await pdfFirmado(original, p, p.cliente, nombre, dni, ip, firmaPng, cuando); }
    catch (e) { return json({ error: 'No se pudo componer el PDF firmado: ' + (e as Error).message }, 500); }
    const rutaPdf = base + '.pdf';
    const s2 = await sb.storage.from(BUCKET).upload(rutaPdf, pdf, { contentType: 'application/pdf', upsert: false });
    if (s2.error) return json({ error: 'No se pudo guardar el PDF firmado: ' + s2.error.message }, 500);
    const avisos: string[] = [];
    // Drive: Presupuestos firmados / cliente / archivo
    let driveUrl: string | null = null;
    try {
      const CID = Deno.env.get('GOOGLE_CLIENT_ID') || '', CSEC = Deno.env.get('GOOGLE_CLIENT_SECRET') || '', REF = Deno.env.get('GOOGLE_REFRESH_TOKEN') || '';
      const RAIZ = Deno.env.get('DRIVE_CARPETA_PRESUPUESTOS') || Deno.env.get('DRIVE_CARPETA_VISITAS') || '';
      if (CID && CSEC && REF && RAIZ) {
        const tok = await tokenDeGoogle(CID, CSEC, REF);
        const carpeta = await carpetaDentro(tok, await carpetaDentro(tok, RAIZ, 'Presupuestos firmados'), (p.cliente?.nombre || 'Cliente').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80));
        const nombrePdf = ('Presupuesto firmado · ' + (p.titulo || CATS[p.categoria] || '') + ' · ' + cuando.toISOString().slice(0, 10) + '.pdf').replace(/[\\/:*?"<>|]/g, ' ');
        driveUrl = (await subirADrive(tok, carpeta, nombrePdf, pdf)).url;
      } else avisos.push('Drive: faltan los secretos de Google.');
    } catch (e) { avisos.push('Drive: ' + (e as Error).message); }
    await sb.from('presupuestos').update({
      respuesta_cliente: 'aceptado', respondido_at: cuando.toISOString(), estado: 'enviado',
      firmado_at: cuando.toISOString(), firma_nombre: nombre, firma_dni: dni || null, firma_ip: ip || null, firma_ruta: base + '.png', pdf_firmado_ruta: rutaPdf, drive_firmado_url: driveUrl,
      updated_at: cuando.toISOString(),
    }).eq('id', p.id);
    // Si el cliente estaba colocado a mano en Otros, Rechazados o No responden, sale de ahí.
    if (p.cliente_id) { try { await sb.from('clientes_cache').update({ tablero_col: null, tablero_motivo: null }).eq('id', p.cliente_id).in('tablero_col', ['otros', 'rechazado', 'no_responde']); } catch (_) { /* da igual */ } }
    // La obra se crea sola con el presupuesto aceptado (Enzo, 27-10-2026), como
    // «Crear la obra con este presupuesto» en la app. Las fases las pone la base.
    let obraTxt = '';
    if (!p.obra_id) {
      try {
        const CAT_A_OBRA: Record<string, string> = { aerotermia: 'AE', solar: 'FV', aire_acondicionado: 'AC', electricidad: 'EL' };
        const c = p.cliente || {};
        const cat = CAT_A_OBRA[String(p.categoria)] || null;
        // Si el cliente ya tiene una obra abierta, es la misma obra: el presupuesto
        // se enlaza a ella y el proyecto crece con su categoría (Enzo, 27-10-2026).
        const { data: abierta } = p.cliente_id ? await sb.from('obras').select('id, numero, categorias').eq('cliente_id', p.cliente_id).in('estado', ['planificada', 'en_curso']).order('creado_en', { ascending: false }).limit(1).maybeSingle() : { data: null };
        if (abierta) {
          const cats: string[] = Array.isArray(abierta.categorias) ? abierta.categorias.slice() : [];
          if (cat && !cats.includes(cat)) { cats.push(cat); await sb.from('obras').update({ categorias: cats }).eq('id', abierta.id); try { await sb.rpc('generar_fases_obra', { p_obra: abierta.id }); } catch (_) { /* sin fases */ } }
          await sb.from('presupuestos').update({ obra_id: abierta.id }).eq('id', p.id);
          obraTxt = (abierta.numero != null ? 'OB-' + String(abierta.numero).padStart(3, '0') : 'existente') + ' (ya existía: se le añade este presupuesto)';
          try { await sb.from('cliente_bitacora').insert({ cliente_id: p.cliente_id, tipo: 'sistema', texto: 'Presupuesto aceptado añadido a la obra ' + obraTxt, por: null }); } catch (_) { /* sin bitácora */ }
          throw { salta: true };
        }
        const { data: obra, error: errO } = await sb.from('obras').insert({
          nombre: c.nombre || p.titulo || 'Obra', cliente: c.nombre || null, direccion: c.direccion || null, poblacion: c.poblacion || null, email_cliente: c.email || null,
          categorias: CAT_A_OBRA[String(p.categoria)] ? [CAT_A_OBRA[String(p.categoria)]] : [], estado: 'planificada',
          cliente_id: p.cliente_id || null, tl_id: c.tl_id || null, tl_tipo: c.tl_id ? (c.tl_tipo || 'contact') : null,
        }).select('id, numero').single();
        if (errO) throw new Error(errO.message);
        await sb.from('presupuestos').update({ obra_id: obra.id }).eq('id', p.id);
        obraTxt = obra.numero != null ? 'OB-' + String(obra.numero).padStart(3, '0') : 'creada';
        try { await sb.from('cliente_bitacora').insert({ cliente_id: p.cliente_id, tipo: 'sistema', texto: 'Obra creada ' + obraTxt + ' al aceptar el presupuesto.', por: null }); } catch (_) { /* sin bitácora */ }
      } catch (e) { if (!(e as { salta?: boolean }).salta) avisos.push('Obra: ' + (e as Error).message); }
    }
    // Teamleader: la oferta pasa a aceptada allí también (Enzo, 27-10-2026).
    if (p.tl_quotation_id) {
      try {
        const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
        const r = await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/teamleader-presupuesto', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-clave': CLAVE }, body: JSON.stringify({ accion: 'aceptar', presupuesto_id: p.id }) });
        if (!r.ok) avisos.push('Teamleader: ' + ((await r.json().catch(() => ({}))) as { error?: string }).error);
      } catch (e) { avisos.push('Teamleader: ' + (e as Error).message); }
    }
    try { await sb.from('cliente_bitacora').insert({ cliente_id: p.cliente_id, tipo: 'presupuesto', texto: 'Presupuesto ACEPTADO y firmado en línea por ' + nombre + (dni ? ' (' + dni + ')' : '') + ': ' + (p.titulo || '') + ' · ' + eur(p.total_venta) + (driveUrl ? ' · PDF firmado en Drive' : ''), por: null }); } catch (_) { /* sin bitácora */ }
    // Correos: oficina (presupuestos y Administración) y copia al cliente.
    if (RESEND) {
      const adjunto = [{ filename: 'presupuesto-firmado.pdf', content: bytesAb64(pdf) }];
      try {
        const { data: gente } = await sb.from('empleados').select('nombre, email_avisos').in('rol', ['presupuestos', 'admin']).eq('activo', true);
        const paraOf = [...new Set(((gente || []) as { email_avisos?: string }[]).map((g) => limpio(g.email_avisos)).filter(esEmail))];
        if (paraOf.length) await mandar(RESEND, { to: paraOf, subject: '✓ Presupuesto aceptado y firmado: ' + (p.cliente?.nombre || '') + ' · ' + eur(p.total_venta),
          text: `${p.cliente?.nombre || 'El cliente'} ha aceptado y firmado el presupuesto «${p.titulo || ''}» (${eur(p.total_venta)} sin IVA) el ${cuando.toLocaleString('es-ES', { timeZone: ZONA })}.\nFirmado por ${nombre}${dni ? ' · ' + dni : ''}.\n${driveUrl ? 'PDF firmado en Drive: ' + driveUrl + '\n' : ''}En la app ya figura como aceptado${obraTxt ? ' y la obra ' + obraTxt + ' está creada' : ''}: ${APP_URL}`,
          html: marco('Presupuesto aceptado y firmado', `<p><b>${esc(p.cliente?.nombre || 'El cliente')}</b> ha aceptado y firmado el presupuesto <b>${esc(p.titulo || '')}</b> (${eur(p.total_venta)} sin IVA) el ${esc(cuando.toLocaleString('es-ES', { timeZone: ZONA }))}.</p><p>Firmado por ${esc(nombre)}${dni ? ' · ' + esc(dni) : ''}. El PDF firmado va adjunto${driveUrl ? ` y está en <a href="${esc(driveUrl)}">Drive</a>` : ''}.</p><p>En la app ya figura como aceptado${obraTxt ? ' y la obra <b>' + esc(obraTxt) + '</b> está creada' : ''}.</p>`), attachments: adjunto });
      } catch (e) { avisos.push('correo oficina: ' + (e as Error).message); }
      try {
        const emailCli = esEmail(p.enviado_correo_a) ? limpio(p.enviado_correo_a) : (esEmail(p.cliente?.email) ? limpio(p.cliente.email) : '');
        let replyTo = ''; try { const { data: aj } = await sb.from('ajustes').select('valor').eq('clave', 'correo_oficina').maybeSingle(); replyTo = limpio(aj?.valor); } catch (_) { /* sin ajuste */ }
        if (emailCli) await mandar(RESEND, Object.assign({ to: [emailCli], subject: 'Copia de su presupuesto aceptado · Sysefen',
          text: `Hola ${p.cliente?.nombre || ''},\n\ngracias por aceptar el presupuesto «${p.titulo || ''}». Le adjuntamos la copia firmada. Nos pondremos en contacto para organizar los trabajos.\n\nUn saludo,\nSysefen`,
          html: marco('Gracias por su confianza', `<p>Hola ${esc(p.cliente?.nombre || '')},</p><p>gracias por aceptar el presupuesto <b>${esc(p.titulo || '')}</b>. Le adjuntamos la copia firmada. Nos pondremos en contacto con usted para organizar los trabajos.</p><p>Un saludo,<br><b>Sysefen</b></p>`), attachments: adjunto }, replyTo ? { reply_to: replyTo } : {}));
      } catch (e) { avisos.push('correo cliente: ' + (e as Error).message); }
    }
    return json({ ok: true, avisos });
  }

  // --- 1 · enviar al cliente (con la sesión de la app) ----------------------------
  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
  const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: autorizacion } } });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: 'Sesión no válida.' }, 401);
  const { data: yo } = await sb.from('empleados').select('id, nombre, rol, email_avisos').eq('user_id', user.id).maybeSingle();
  if (!yo || !['presupuestos', 'admin', 'colaborador'].includes(String(yo.rol))) return json({ error: 'Mandar presupuestos es de presupuestos, colaboradores y Administración.' }, 403);
  if (b.accion !== 'enviar') return json({ error: 'Acción desconocida.' }, 400);
  if (!RESEND) return json({ error: 'Falta el secreto RESEND_API_KEY.' }, 500);
  const ids: string[] = (Array.isArray(b.ids) ? b.ids : []).map((x: unknown) => String(x)).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x));
  if (!ids.length) return json({ error: 'Falta el presupuesto.' }, 400);
  const { data: ps } = await sb.from('presupuestos').select('*, cliente:clientes_cache(id, nombre, email)').in('id', ids);
  if (!ps || ps.length !== ids.length) return json({ error: 'Algún presupuesto no existe.' }, 404);
  const clienteId = ps[0].cliente_id;
  if (ps.some((p) => p.cliente_id !== clienteId)) return json({ error: 'Todos los presupuestos tienen que ser del mismo cliente.' }, 400);
  if (yo.rol === 'colaborador') {
    const { data: c } = await sb.from('clientes_cache').select('colaborador_id').eq('id', clienteId).maybeSingle();
    if (!c || c.colaborador_id !== yo.id) return json({ error: 'Como colaborador solo puedes trabajar con los clientes que te han asignado.' }, 403);
  }
  const cli = ps[0].cliente;
  const para = limpio(b.para) || limpio(cli?.email);
  if (!esEmail(para)) return json({ error: 'Falta un correo válido del cliente.' }, 400);
  const cc = String(b.cc || '').split(/[,;\s]+/).map(limpio).filter(esEmail);
  const mensaje = limpio(b.mensaje).slice(0, 4000);
  const asunto = limpio(b.asunto).slice(0, 150) || ((ps.length === 1 ? 'Su presupuesto' : 'Sus presupuestos') + ' de Sysefen' + (cli?.nombre ? ' · ' + cli.nombre : ''));
  // deno-lint-ignore no-explicit-any
  const pdfs: any[] = Array.isArray(b.pdfs) ? b.pdfs : [];
  const ahora = new Date().toISOString();
  const tarjetas: string[] = [], textos: string[] = [], adjuntos: { filename: string; content: string }[] = [];
  const ordenados = ids.map((id) => ps.find((p) => p.id === id)!);
  for (const p of ordenados) {
    const t = p.token_cliente || token();
    const cambios: Record<string, unknown> = { token_cliente: t, enviado_correo_at: ahora, enviado_correo_a: para, updated_at: ahora };
    if (!p.enviado_cliente_at) { cambios.enviado_cliente_at = ahora; cambios.enviado_cliente_por = yo.id; cambios.estado = 'enviado'; if (!p.revisado_at) { cambios.revisado_at = ahora; cambios.revisado_por = yo.id; } }
    const pdf = pdfs.find((x) => String(x.id) === p.id);
    if (pdf && typeof pdf.base64 === 'string' && pdf.base64.length > 100 && pdf.base64.length < 14_000_000) {
      const ruta = `${p.id}/enviado-${Date.now()}.pdf`;
      const bytes = b64aBytes(pdf.base64);
      const s = await sb.storage.from(BUCKET).upload(ruta, bytes, { contentType: 'application/pdf', upsert: false });
      if (!s.error) cambios.pdf_enviado_ruta = ruta;
      adjuntos.push({ filename: (limpio(pdf.nombre) || 'presupuesto-sysefen.pdf').replace(/[^\w.\- ()·áéíóúñÁÉÍÓÚÑ]+/g, '_').slice(0, 100), content: pdf.base64.replace(/^data:[^,]*,/, '') });
    }
    await sb.from('presupuestos').update(cambios).eq('id', p.id);
    const enlace = APP_URL + 'firmar.html?t=' + t;
    const venceTxt = fecha(vence(Object.assign({}, p, { enviado_cliente_at: p.enviado_cliente_at || ahora })));
    const totalIva = Math.round(Number(p.total_venta) * 121) / 100;
    tarjetas.push(`<div style="border:1.5px solid #e6e5df;border-radius:14px;padding:16px 18px;margin:14px 0">
      <div style="font:700 17px/1.2 Arial,Helvetica,sans-serif">${esc(p.titulo || CATS[p.categoria] || 'Presupuesto')}</div>
      <div style="font-size:14px;color:#555;margin-top:6px">${esc(CATS[p.categoria] || '')}${p.tl_numero ? ' · nº ' + esc(p.tl_numero) : ''}</div>
      <div style="font-size:15px;margin-top:10px">Base imponible <b>${eur(p.total_venta)}</b> · IVA 21 % · Total <b>${eur(totalIva)}</b></div>
      ${venceTxt ? `<div style="font-size:13px;color:#777;margin-top:4px">Válido hasta el ${esc(venceTxt)}</div>` : ''}
      <a href="${esc(enlace)}" style="display:inline-block;margin-top:14px;background:#206028;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px">Ver y aceptar este presupuesto</a>
    </div>`);
    textos.push(`· ${p.titulo || CATS[p.categoria] || 'Presupuesto'} — ${eur(p.total_venta)} sin IVA (${eur(totalIva)} con IVA)${venceTxt ? ' — válido hasta el ' + venceTxt : ''}\n  Ver y aceptar: ${enlace}`);
  }
  let replyTo = ''; try { const { data: aj } = await sb.from('ajustes').select('valor').eq('clave', 'correo_oficina').maybeSingle(); replyTo = limpio(aj?.valor); } catch (_) { /* sin ajuste */ }
  if (!replyTo && esEmail(yo.email_avisos)) replyTo = limpio(yo.email_avisos);
  const saludo = 'Hola ' + (cli?.nombre || '') + ',';
  const intro = ps.length === 1 ? 'le enviamos el presupuesto que hemos preparado para usted.' : 'le enviamos los ' + ps.length + ' presupuestos que hemos preparado para usted, para que elija la opción que mejor le encaje.';
  const cuerpoHtml = `<p>${esc(saludo)}</p><p>${esc(intro)}</p>${mensaje ? `<div style="background:#f5f4ef;border-radius:12px;padding:14px 16px;white-space:pre-wrap;font-size:15px;line-height:1.5">${esc(mensaje)}</div>` : ''}
    ${tarjetas.join('')}
    <p style="font-size:14px;color:#555">Puede ver cada presupuesto en el enlace, descargarlo en PDF (también va adjunto) y, si está conforme, aceptarlo y firmarlo ahí mismo. Para cualquier duda, responda a este correo.</p>
    <p>Un saludo,<br><b>${esc(yo.nombre || 'Sysefen')}</b><br>Sysefen</p>`;
  const cuerpoTxt = `${saludo}\n\n${intro}\n\n${mensaje ? mensaje + '\n\n' : ''}${textos.join('\n\n')}\n\nPuede ver cada presupuesto en el enlace, descargarlo en PDF (también va adjunto) y, si está conforme, aceptarlo y firmarlo ahí mismo. Para cualquier duda, responda a este correo.\n\nUn saludo,\n${yo.nombre || 'Sysefen'}\nSysefen`;
  try {
    await mandar(RESEND, Object.assign({ to: [para], subject: asunto, text: cuerpoTxt, html: marco(ps.length === 1 ? 'Su presupuesto' : 'Sus presupuestos', cuerpoHtml), attachments: adjuntos.length ? adjuntos : undefined }, cc.length ? { cc } : {}, replyTo ? { reply_to: replyTo } : {}));
  } catch (e) { return json({ error: 'No se pudo mandar el correo: ' + (e as Error).message }, 502); }
  try { await sb.from('cliente_bitacora').insert({ cliente_id: clienteId, tipo: 'email', texto: (ps.length === 1 ? 'Presupuesto enviado' : ps.length + ' presupuestos enviados') + ' por correo a ' + para + ': ' + ordenados.map((p) => p.titulo || CATS[p.categoria] || '').join(' · ') + (mensaje ? ' · Mensaje: ' + mensaje.slice(0, 200) : ''), por: yo.id }); } catch (_) { /* sin bitácora */ }
  return json({ ok: true, enviados: ids.length, para, cc, enlaces: ordenados.map((p) => APP_URL + 'firmar.html?t=' + (p.token_cliente || '')) });
});
