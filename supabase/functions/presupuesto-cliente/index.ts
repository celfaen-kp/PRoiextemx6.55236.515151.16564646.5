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
// Dónde vive la página de «ver y aceptar» (Enzo, 27-10-2026): en el dominio
// propio si está el secreto FIRMA_URL (p. ej. https://firma.sysefengroup.com/);
// si no, la página firmar.html de la app.
const FIRMA_URL = (Deno.env.get('FIRMA_URL') || (APP_URL + 'firmar.html')).replace(/\/$/, '');
const enlaceFirma = (t: string) => (FIRMA_URL.endsWith('.html') ? FIRMA_URL : FIRMA_URL + '/') + '?t=' + encodeURIComponent(t);
const REMITENTE = 'Sysefen <noreply@sysefen.com>';
const BUCKET = 'presupuestos-cliente';
const CATS: Record<string, string> = { solar: 'Fotovoltaica', aerotermia: 'Aerotermia', aire_acondicionado: 'Aire acondicionado', electricidad: 'Electricidad' };

// ---------- el correo y el PDF firmado en el idioma del cliente (Enzo, 6-11-2026) ----------
// El idioma lo elige quien manda el presupuesto desde la app (es, en, ca, de) y se
// guarda en presupuestos.idioma_cliente para el PDF firmado y el correo de después.
const LOCALES: Record<string, string> = { es: 'es-ES', en: 'en-GB', ca: 'ca-ES', de: 'de-DE' };
const idiomaValido = (x: unknown) => (typeof x === 'string' && LOCALES[x] ? x : 'es');
type Textos = Record<string, string>;
const TXT: Record<string, Textos> = {
  es: {
    cat_solar: 'Fotovoltaica', cat_aerotermia: 'Aerotermia', cat_aire_acondicionado: 'Aire acondicionado', cat_electricidad: 'Electricidad',
    asunto1: 'Su presupuesto de Sysefen', asuntoN: 'Sus presupuestos de Sysefen', titulo1: 'Su presupuesto', tituloN: 'Sus presupuestos',
    hola: 'Hola {n},', intro1: 'le enviamos el presupuesto que hemos preparado para usted.', introN: 'le enviamos los {k} presupuestos que hemos preparado para usted, para que elija la opción que mejor le encaje.',
    base: 'Base imponible', iva: 'IVA 21 %', total: 'Total', valido: 'Válido hasta el {f}', ver: 'Ver y aceptar este presupuesto', ver_txt: 'Ver y aceptar', sin_iva: 'sin IVA', con_iva: 'con IVA', num: 'nº',
    pie: 'Puede ver cada presupuesto en el enlace y descargarlo en PDF (también va adjunto). Si está conforme, acéptelo y fírmelo ahí mismo. Si tiene dudas, prefiere cambiar algo o ha decidido no seguir adelante, díganoslo respondiendo a este correo: así sabremos su respuesta.',
    saludo: 'Un saludo,', presupuesto: 'Presupuesto',
    orientativo: 'Presupuesto orientativo, válido {n} días. No incluye obra civil ni permisos que no se nombren arriba.',
    acep_titulo: 'ACEPTACIÓN DEL PRESUPUESTO', acep_presu: 'Presupuesto: ', acep_num: 'Número: ', acep_cliente: 'Cliente: ', acep_importes: 'Base imponible: {b} · IVA 21 %: {i} · Total: {t}',
    acep_declara: 'El cliente declara haber leído el presupuesto adjunto y aceptar su contenido y condiciones.', acep_firmado: 'Firmado por: ', acep_fecha: 'Fecha y hora: {f} (hora de Madrid)',
    acep_ip: 'Firma electrónica recogida en la página de aceptación de Sysefen · IP {ip}', acep_ip_desc: 'desconocida', acep_ilegible: '(firma no legible)',
    copia_asunto: 'Copia de su presupuesto aceptado · Sysefen', copia_titulo: 'Gracias por su confianza',
    copia_txt: 'Hola {n},\n\ngracias por aceptar el presupuesto «{t}». Le adjuntamos la copia firmada. Nos pondremos en contacto para organizar los trabajos.\n\nUn saludo,\nSysefen',
    copia_html: '<p>Hola {n},</p><p>gracias por aceptar el presupuesto <b>{t}</b>. Le adjuntamos la copia firmada. Nos pondremos en contacto con usted para organizar los trabajos.</p><p>Un saludo,<br><b>Sysefen</b></p>',
    pdf_firmado: 'presupuesto-firmado.pdf',
  },
  en: {
    cat_solar: 'Solar PV', cat_aerotermia: 'Aerothermal heat pump', cat_aire_acondicionado: 'Air conditioning', cat_electricidad: 'Electrical installation',
    asunto1: 'Your quotation from Sysefen', asuntoN: 'Your quotations from Sysefen', titulo1: 'Your quotation', tituloN: 'Your quotations',
    hola: 'Dear {n},', intro1: 'please find the quotation we have prepared for you.', introN: 'please find the {k} quotations we have prepared for you, so you can choose the option that suits you best.',
    base: 'Net amount', iva: 'VAT 21 %', total: 'Total', valido: 'Valid until {f}', ver: 'View and accept this quotation', ver_txt: 'View and accept', sin_iva: 'excl. VAT', con_iva: 'incl. VAT', num: 'no.',
    pie: 'You can view each quotation at the link and download it as a PDF (it is also attached). If you agree, you can accept and sign it right there. If you have any questions, would prefer to change something or have decided not to go ahead, just let us know by replying to this email.',
    saludo: 'Kind regards,', presupuesto: 'Quotation',
    orientativo: 'Indicative quotation, valid for {n} days. It does not include civil works or permits not listed above.',
    acep_titulo: 'ACCEPTANCE OF THE QUOTATION', acep_presu: 'Quotation: ', acep_num: 'Number: ', acep_cliente: 'Customer: ', acep_importes: 'Net amount: {b} · VAT 21 %: {i} · Total: {t}',
    acep_declara: 'The customer declares that they have read the attached quotation and accept its contents and conditions.', acep_firmado: 'Signed by: ', acep_fecha: 'Date and time: {f} (Madrid time)',
    acep_ip: 'Electronic signature collected on the Sysefen acceptance page · IP {ip}', acep_ip_desc: 'unknown', acep_ilegible: '(signature not legible)',
    copia_asunto: 'Copy of your accepted quotation · Sysefen', copia_titulo: 'Thank you for your trust',
    copia_txt: 'Dear {n},\n\nthank you for accepting the quotation “{t}”. Please find the signed copy attached. We will contact you to organise the works.\n\nKind regards,\nSysefen',
    copia_html: '<p>Dear {n},</p><p>thank you for accepting the quotation <b>{t}</b>. Please find the signed copy attached. We will contact you to organise the works.</p><p>Kind regards,<br><b>Sysefen</b></p>',
    pdf_firmado: 'signed-quotation.pdf',
  },
  ca: {
    cat_solar: 'Plaques solars', cat_aerotermia: 'Aerotèrmia', cat_aire_acondicionado: 'Aire condicionat', cat_electricidad: 'Electricitat',
    asunto1: 'El seu pressupost de Sysefen', asuntoN: 'Els seus pressupostos de Sysefen', titulo1: 'El seu pressupost', tituloN: 'Els seus pressupostos',
    hola: 'Hola {n},', intro1: 'li enviem el pressupost que hem preparat per a vostè.', introN: 'li enviem els {k} pressupostos que hem preparat per a vostè, perquè triï l’opció que més li convingui.',
    base: 'Base imposable', iva: 'IVA 21 %', total: 'Total', valido: 'Vàlid fins al {f}', ver: 'Veure i acceptar aquest pressupost', ver_txt: 'Veure i acceptar', sin_iva: 'sense IVA', con_iva: 'amb IVA', num: 'núm.',
    pie: 'Pot veure cada pressupost a l’enllaç i descarregar-lo en PDF (també va adjunt). Si hi està conforme, accepti’l i signi’l allà mateix. Si té dubtes, prefereix canviar alguna cosa o ha decidit no tirar endavant, digui’ns-ho responent a aquest correu: així sabrem la seva resposta.',
    saludo: 'Salutacions cordials,', presupuesto: 'Pressupost',
    orientativo: 'Pressupost orientatiu, vàlid {n} dies. No inclou obra civil ni permisos que no s’esmentin més amunt.',
    acep_titulo: 'ACCEPTACIÓ DEL PRESSUPOST', acep_presu: 'Pressupost: ', acep_num: 'Número: ', acep_cliente: 'Client: ', acep_importes: 'Base imposable: {b} · IVA 21 %: {i} · Total: {t}',
    acep_declara: 'El client declara haver llegit el pressupost adjunt i acceptar-ne el contingut i les condicions.', acep_firmado: 'Signat per: ', acep_fecha: 'Data i hora: {f} (hora de Madrid)',
    acep_ip: 'Signatura electrònica recollida a la pàgina d’acceptació de Sysefen · IP {ip}', acep_ip_desc: 'desconeguda', acep_ilegible: '(signatura no llegible)',
    copia_asunto: 'Còpia del seu pressupost acceptat · Sysefen', copia_titulo: 'Gràcies per la seva confiança',
    copia_txt: 'Hola {n},\n\ngràcies per acceptar el pressupost «{t}». Li adjuntem la còpia signada. Ens posarem en contacte amb vostè per organitzar els treballs.\n\nSalutacions cordials,\nSysefen',
    copia_html: '<p>Hola {n},</p><p>gràcies per acceptar el pressupost <b>{t}</b>. Li adjuntem la còpia signada. Ens posarem en contacte amb vostè per organitzar els treballs.</p><p>Salutacions cordials,<br><b>Sysefen</b></p>',
    pdf_firmado: 'pressupost-signat.pdf',
  },
  de: {
    cat_solar: 'Photovoltaik', cat_aerotermia: 'Luft-Wasser-Wärmepumpe', cat_aire_acondicionado: 'Klimaanlage', cat_electricidad: 'Elektroinstallation',
    asunto1: 'Ihr Angebot von Sysefen', asuntoN: 'Ihre Angebote von Sysefen', titulo1: 'Ihr Angebot', tituloN: 'Ihre Angebote',
    hola: 'Guten Tag {n},', intro1: 'anbei erhalten Sie das Angebot, das wir für Sie erstellt haben.', introN: 'anbei erhalten Sie die {k} Angebote, die wir für Sie erstellt haben, damit Sie die passende Option wählen können.',
    base: 'Nettobetrag', iva: 'MwSt. 21 %', total: 'Gesamt', valido: 'Gültig bis {f}', ver: 'Dieses Angebot ansehen und annehmen', ver_txt: 'Ansehen und annehmen', sin_iva: 'ohne MwSt.', con_iva: 'inkl. MwSt.', num: 'Nr.',
    pie: 'Über den Link können Sie jedes Angebot ansehen und als PDF herunterladen (es ist auch angehängt). Wenn Sie einverstanden sind, können Sie es dort direkt annehmen und unterschreiben. Bei Fragen, Änderungswünschen oder falls Sie sich dagegen entschieden haben, antworten Sie einfach auf diese E-Mail.',
    saludo: 'Mit freundlichen Grüßen,', presupuesto: 'Angebot',
    orientativo: 'Unverbindliches Angebot, {n} Tage gültig. Bauarbeiten und Genehmigungen, die oben nicht aufgeführt sind, sind nicht enthalten.',
    acep_titulo: 'ANNAHME DES ANGEBOTS', acep_presu: 'Angebot: ', acep_num: 'Nummer: ', acep_cliente: 'Kunde: ', acep_importes: 'Nettobetrag: {b} · MwSt. 21 %: {i} · Gesamt: {t}',
    acep_declara: 'Der Kunde erklärt, das beigefügte Angebot gelesen zu haben und dessen Inhalt und Bedingungen zu akzeptieren.', acep_firmado: 'Unterschrieben von: ', acep_fecha: 'Datum und Uhrzeit: {f} (Madrider Zeit)',
    acep_ip: 'Elektronische Unterschrift, erfasst auf der Annahmeseite von Sysefen · IP {ip}', acep_ip_desc: 'unbekannt', acep_ilegible: '(Unterschrift nicht lesbar)',
    copia_asunto: 'Kopie Ihres angenommenen Angebots · Sysefen', copia_titulo: 'Vielen Dank für Ihr Vertrauen',
    copia_txt: 'Guten Tag {n},\n\nvielen Dank für die Annahme des Angebots „{t}“. Anbei erhalten Sie die unterschriebene Kopie. Wir melden uns bei Ihnen, um die Arbeiten zu organisieren.\n\nMit freundlichen Grüßen\nSysefen',
    copia_html: '<p>Guten Tag {n},</p><p>vielen Dank für die Annahme des Angebots <b>{t}</b>. Anbei erhalten Sie die unterschriebene Kopie. Wir melden uns bei Ihnen, um die Arbeiten zu organisieren.</p><p>Mit freundlichen Grüßen<br><b>Sysefen</b></p>',
    pdf_firmado: 'angebot-unterschrieben.pdf',
  },
};
const txt = (idioma: string) => TXT[idiomaValido(idioma)];
const rellena = (t: string, v: Record<string, unknown>) => String(t).replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? '' : String(v[k])));
const eurI = (n: unknown, idioma: string) => (Number(n) || 0).toLocaleString(LOCALES[idiomaValido(idioma)], { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fechaI = (iso: string | null | undefined, idioma: string) => iso ? new Date(iso).toLocaleDateString(LOCALES[idiomaValido(idioma)], { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' }) : '';

const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const eur = (n: unknown) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fecha = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' }) : '';
const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const limpio = (v: unknown) => String(v == null ? '' : v).trim();
// El título tal y como lo ve el cliente: sin la coletilla «Hecho en Teamleader» (V28.6).
// deno-lint-ignore no-explicit-any
const tituloCliente = (p: any) => limpio(String(p?.titulo || '').replace(/\s*[·\-–—(]?\s*Hecho en Teamleader\s*[)]?\s*/gi, ' ').replace(/\s{2,}/g, ' ').replace(/\s*[·\-–—]\s*$/, '').replace(/^\s*[·\-–—]\s*/, '')) || 'Presupuesto';
// Las líneas, secciones y el título en el idioma del cliente (9-11-2026): se piden a la
// función traducir (con la clave interna), que casi siempre las tiene ya en caché del PDF
// enviado. Si algo falla, los textos se quedan en español: la página sigue funcionando.
const UNIDADES: Record<string, Record<string, string>> = {
  en: { ud: 'pcs', uds: 'pcs', h: 'h', m: 'm', 'm²': 'm²', ml: 'lm', pa: 'lot', jornada: 'day', jornadas: 'days' },
  ca: { ud: 'u.', uds: 'u.', h: 'h', m: 'm', 'm²': 'm²', ml: 'ml', pa: 'pa', jornada: 'jornada', jornadas: 'jornades' },
  de: { ud: 'Stk.', uds: 'Stk.', h: 'Std.', m: 'm', 'm²': 'm²', ml: 'lfm', pa: 'psch.', jornada: 'Tag', jornadas: 'Tage' },
};
const unidadIdioma = (u: unknown, idioma: string) => { const k = String(u || 'ud').trim().toLowerCase(); const t = UNIDADES[idioma]; return (t && t[k]) || String(u || 'ud'); };
const partesSeccion = (nombre: unknown): [string, string] => { const m = /^(\d\d) · (.+)$/.exec(String(nombre || '')); return m ? [m[1] + ' · ', m[2]] : ['', String(nombre || '')]; };
async function traducirTextos(idioma: string, textos: unknown[]): Promise<(x: unknown) => string> {
  const identidad = (x: unknown) => String(x == null ? '' : x);
  const lista = [...new Set(textos.map(identidad).map((t) => t.trim()).filter(Boolean))];
  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  if (idioma === 'es' || !lista.length || !CLAVE) return identidad;
  try {
    const r = await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/traducir', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-clave': CLAVE }, body: JSON.stringify({ idioma, textos: lista.slice(0, 300) }) });
    if (!r.ok) return identidad;
    const d = await r.json();
    const mapa: Record<string, string> = d && d.textos ? d.textos : {};
    return (x: unknown) => { const t = identidad(x); const k = t.trim(); return (k && mapa[k]) || t; };
  } catch (_) { return identidad; }
}
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
async function pdfFirmado(original: Uint8Array | null, p: any, cli: any, nombre: string, dni: string, ip: string, firmaPng: Uint8Array, cuando: Date, idioma = 'es') {
  const T = txt(idioma);
  const doc = original ? await PDFDocument.load(original, { ignoreEncryption: true }) : await PDFDocument.create();
  const pagina = doc.addPage([595.28, 841.89]);
  const fuente = await doc.embedFont(StandardFonts.Helvetica), negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  // Las fuentes estándar solo saben Latin-1: el € y las comillas tipográficas se cambian antes.
  const w = (s: string) => s.replace(/€/g, 'EUR').replace(/[“”„«»]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xff]/g, '?');
  let y = 790;
  const linea = (txt: string, size = 11, bold = false, color = rgb(0.08, 0.09, 0.06)) => { pagina.drawText(w(txt), { x: 56, y, size, font: bold ? negrita : fuente, color }); y -= size + 7; };
  linea(T.acep_titulo, 16, true);
  y -= 6;
  linea(T.acep_presu + (tituloCliente(p)), 11, true);
  if (p.tl_numero) linea(T.acep_num + p.tl_numero);
  linea(T.acep_cliente + (cli?.nombre || ''));
  linea(rellena(T.acep_importes, { b: eurI(p.total_venta, idioma), i: eurI(Math.round(Number(p.total_venta) * 21) / 100, idioma), t: eurI(Math.round(Number(p.total_venta) * 121) / 100, idioma) }));
  y -= 10;
  linea(T.acep_declara, 11);
  y -= 6;
  linea(T.acep_firmado + nombre + (dni ? ' · ' + dni : ''), 12, true);
  linea(rellena(T.acep_fecha, { f: cuando.toLocaleString(LOCALES[idiomaValido(idioma)], { timeZone: ZONA }) }));
  linea(rellena(T.acep_ip, { ip: ip || T.acep_ip_desc }), 9, false, rgb(0.4, 0.4, 0.4));
  y -= 14;
  try {
    const img = await doc.embedPng(firmaPng);
    const ancho = 260, alto = ancho * (img.height / img.width);
    pagina.drawRectangle({ x: 56, y: y - alto - 10, width: ancho + 20, height: alto + 20, borderColor: rgb(0.75, 0.75, 0.72), borderWidth: 1 });
    pagina.drawImage(img, { x: 66, y: y - alto, width: ancho, height: alto });
    y -= alto + 24;
  } catch (_) { linea(T.acep_ilegible, 10); }
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
      return new Response(null, { status: 302, headers: { ...CORS, Location: enlaceFirma(t) } });
    }
    // Lo que ve el cliente: nada interno (costes, desgloses, reglas).
    const ls = (lineas || []).map((l) => ({ descripcion: l.descripcion, detalle_tecnico: l.detalle_tecnico, cantidad: l.cantidad, unidad: l.unidad, precio_tarifa: l.precio_tarifa, dto_linea_pct: l.dto_linea_pct, precio_venta: l.precio_venta, seccion: l.seccion }));
    const fv2 = (lineas || []).map((l) => l.origen_inputs).find((o) => o && o.fv2);
    const idiomaP = idiomaValido(p.idioma_cliente);
    const tr = await traducirTextos(idiomaP, [tituloCliente(p), ...ls.flatMap((l) => [l.descripcion, l.detalle_tecnico, partesSeccion(l.seccion)[1]]), fv2?.nota, fv2?.condiciones]);
    if (idiomaP !== 'es') ls.forEach((l) => { l.descripcion = tr(l.descripcion); if (l.detalle_tecnico) l.detalle_tecnico = tr(l.detalle_tecnico); const [pre, nom] = partesSeccion(l.seccion); if (nom) l.seccion = pre + tr(nom); l.unidad = unidadIdioma(l.unidad, idiomaP); });
    const condiciones = fv2 ? [fv2.nota, fv2.condiciones].filter(Boolean).map(tr).join(' ') : rellena(txt(idiomaP).orientativo, { n: p.validez_dias || 15 });
    const bruto = ls.reduce((a, l) => a + (Number(l.precio_venta) || 0), 0);
    const dtoG = Number(p.dto_global_pct) || 0;
    const base = Number(p.total_venta) || Math.round(bruto * (1 - dtoG / 100) * 100) / 100;
    const iva = Math.round(base * 21) / 100;
    let pdf_url: string | null = null;
    const rutaPdf = p.pdf_firmado_ruta || p.pdf_enviado_ruta;
    if (rutaPdf) { const { data: su } = await sb.storage.from(BUCKET).createSignedUrl(rutaPdf, 3600); pdf_url = su?.signedUrl || null; }
    return json({
      idioma: idiomaP,
      presupuesto: { titulo: tr(tituloCliente(p)), categoria: txt(idiomaP)['cat_' + p.categoria] || CATS[p.categoria] || p.categoria, tl_numero: p.tl_numero, enviado_correo_at: p.enviado_correo_at, firmado_at: p.firmado_at, firma_nombre: p.firma_nombre, validez_dias: p.validez_dias },
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
    // Con el presupuesto en otro idioma vale también un pasaporte o documento extranjero (6-11-2026).
    const extranjero = idiomaValido(p.idioma_cliente) !== 'es' && /^[A-Z0-9]{5,20}$/.test(dni);
    if (!/^([XYZ]?\d{7,8}[A-Z])$/.test(dni) && !/^[A-Z]\d{7}[A-Z0-9]$/.test(dni) && !extranjero) return json({ error: 'Falta un DNI, NIE o CIF válido.' }, 400);
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
    const idiomaF = idiomaValido(p.idioma_cliente);
    const trF = await traducirTextos(idiomaF, [tituloCliente(p)]);
    const pI = { ...p, titulo: trF(tituloCliente(p)) }; // el título en el idioma del cliente (PDF firmado y copia)
    try { pdf = await pdfFirmado(original, pI, p.cliente, nombre, dni, ip, firmaPng, cuando, idiomaF); }
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
        const nombrePdf = ('Presupuesto firmado · ' + (tituloCliente(p)) + ' · ' + cuando.toISOString().slice(0, 10) + '.pdf').replace(/[\\/:*?"<>|]/g, ' ');
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
        // También por el contacto de Teamleader (1-11-2026): las obras antiguas tienen
        // tl_id pero no cliente_id, y se creaba una segunda obra (Heim: OB-020 y OB-026).
        const filtros = [p.cliente_id ? 'cliente_id.eq.' + p.cliente_id : '', c.tl_id ? 'tl_id.eq.' + c.tl_id : ''].filter(Boolean);
        const { data: abierta } = filtros.length ? await sb.from('obras').select('id, numero, categorias, cliente_id, email_cliente').or(filtros.join(',')).in('estado', ['planificada', 'en_curso']).order('creado_en', { ascending: false }).limit(1).maybeSingle() : { data: null };
        if (abierta) {
          const arreglo: Record<string, unknown> = {};
          if (!abierta.cliente_id && p.cliente_id) arreglo.cliente_id = p.cliente_id;
          if (!abierta.email_cliente && c.email) arreglo.email_cliente = c.email;
          if (Object.keys(arreglo).length) await sb.from('obras').update(arreglo).eq('id', abierta.id);
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
    try { await sb.from('cliente_bitacora').insert({ cliente_id: p.cliente_id, tipo: 'presupuesto', texto: 'Presupuesto ACEPTADO y firmado en línea por ' + nombre + (dni ? ' (' + dni + ')' : '') + ': ' + tituloCliente(p) + ' · ' + eur(p.total_venta) + (driveUrl ? ' · PDF firmado en Drive' : ''), por: null }); } catch (_) { /* sin bitácora */ }
    // Correos: oficina (presupuestos y Administración) y copia al cliente.
    if (RESEND) {
      const adjunto = [{ filename: 'presupuesto-firmado.pdf', content: bytesAb64(pdf) }];
      const TF = txt(idiomaF);
      const adjuntoCli = [{ filename: TF.pdf_firmado, content: adjunto[0].content }];
      try {
        const { data: gente } = await sb.from('empleados').select('nombre, email_avisos').in('rol', ['presupuestos', 'admin']).eq('activo', true);
        const paraOf = [...new Set(((gente || []) as { email_avisos?: string }[]).map((g) => limpio(g.email_avisos)).filter(esEmail))];
        if (paraOf.length) await mandar(RESEND, { to: paraOf, subject: '✓ Presupuesto aceptado y firmado: ' + (p.cliente?.nombre || '') + ' · ' + eur(p.total_venta),
          text: `${p.cliente?.nombre || 'El cliente'} ha aceptado y firmado el presupuesto «${tituloCliente(p)}» (${eur(p.total_venta)} sin IVA) el ${cuando.toLocaleString('es-ES', { timeZone: ZONA })}.\nFirmado por ${nombre}${dni ? ' · ' + dni : ''}.\n${driveUrl ? 'PDF firmado en Drive: ' + driveUrl + '\n' : ''}En la app ya figura como aceptado${obraTxt ? ' y la obra ' + obraTxt + ' está creada' : ''}: ${APP_URL}`,
          html: marco('Presupuesto aceptado y firmado', `<p><b>${esc(p.cliente?.nombre || 'El cliente')}</b> ha aceptado y firmado el presupuesto <b>${esc(tituloCliente(p))}</b> (${eur(p.total_venta)} sin IVA) el ${esc(cuando.toLocaleString('es-ES', { timeZone: ZONA }))}.</p><p>Firmado por ${esc(nombre)}${dni ? ' · ' + esc(dni) : ''}. El PDF firmado va adjunto${driveUrl ? ` y está en <a href="${esc(driveUrl)}">Drive</a>` : ''}.</p><p>En la app ya figura como aceptado${obraTxt ? ' y la obra <b>' + esc(obraTxt) + '</b> está creada' : ''}.</p>`), attachments: adjunto });
      } catch (e) { avisos.push('correo oficina: ' + (e as Error).message); }
      try {
        const emailCli = esEmail(p.enviado_correo_a) ? limpio(p.enviado_correo_a) : (esEmail(p.cliente?.email) ? limpio(p.cliente.email) : '');
        let replyTo = ''; try { const { data: aj } = await sb.from('ajustes').select('valor').eq('clave', 'correo_oficina').maybeSingle(); replyTo = limpio(aj?.valor); } catch (_) { /* sin ajuste */ }
        if (emailCli) await mandar(RESEND, Object.assign({ to: [emailCli], subject: TF.copia_asunto,
          text: rellena(TF.copia_txt, { n: p.cliente?.nombre || '', t: tituloCliente(pI) }),
          html: marco(TF.copia_titulo, rellena(TF.copia_html, { n: esc(p.cliente?.nombre || ''), t: esc(tituloCliente(pI)) })), attachments: adjuntoCli }, replyTo ? { reply_to: replyTo } : {}));
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
  // El idioma del correo y del PDF (Enzo, 6-11-2026): lo eligió quien lo manda; los
  // títulos traducidos vienen de la app (titulos: {id: título}).
  const idioma = idiomaValido(b.idioma);
  const T = txt(idioma);
  const titulosTrad: Record<string, string> = (b.titulos && typeof b.titulos === 'object') ? b.titulos : {};
  // deno-lint-ignore no-explicit-any
  const tituloEnIdioma = (p: any) => (idioma !== 'es' && limpio(titulosTrad[p.id]).slice(0, 200)) || tituloCliente(p);
  const asunto = limpio(b.asunto).slice(0, 150) || ((ps.length === 1 ? T.asunto1 : T.asuntoN) + (cli?.nombre ? ' · ' + cli.nombre : ''));
  // deno-lint-ignore no-explicit-any
  const pdfs: any[] = Array.isArray(b.pdfs) ? b.pdfs : [];
  const ahora = new Date().toISOString();
  const tarjetas: string[] = [], textos: string[] = [], adjuntos: { filename: string; content: string }[] = [];
  const ordenados = ids.map((id) => ps.find((p) => p.id === id)!);
  for (const p of ordenados) {
    const t = p.token_cliente || token();
    const cambios: Record<string, unknown> = { token_cliente: t, enviado_correo_at: ahora, enviado_correo_a: para, updated_at: ahora, idioma_cliente: idioma };
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
    const enlace = enlaceFirma(t);
    const venceTxt = fechaI(vence(Object.assign({}, p, { enviado_cliente_at: p.enviado_cliente_at || ahora })), idioma);
    const totalIva = Math.round(Number(p.total_venta) * 121) / 100;
    const tit = tituloEnIdioma(p);
    tarjetas.push(`<div style="border:1.5px solid #e6e5df;border-radius:14px;padding:16px 18px;margin:14px 0">
      <div style="font:700 17px/1.2 Arial,Helvetica,sans-serif">${esc(tit)}</div>
      <div style="font-size:14px;color:#555;margin-top:6px">${esc(T['cat_' + p.categoria] || CATS[p.categoria] || '')}${p.tl_numero ? ' · ' + T.num + ' ' + esc(p.tl_numero) : ''}</div>
      <div style="font-size:15px;margin-top:10px">${T.base} <b>${eurI(p.total_venta, idioma)}</b> · ${T.iva} · ${T.total} <b>${eurI(totalIva, idioma)}</b></div>
      ${venceTxt ? `<div style="font-size:13px;color:#777;margin-top:4px">${esc(rellena(T.valido, { f: venceTxt }))}</div>` : ''}
      <a href="${esc(enlace)}" style="display:inline-block;margin-top:14px;background:#206028;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px">${T.ver}</a>
    </div>`);
    textos.push(`· ${tit} — ${eurI(p.total_venta, idioma)} ${T.sin_iva} (${eurI(totalIva, idioma)} ${T.con_iva})${venceTxt ? ' — ' + rellena(T.valido, { f: venceTxt }) : ''}\n  ${T.ver_txt}: ${enlace}`);
  }
  let replyTo = ''; try { const { data: aj } = await sb.from('ajustes').select('valor').eq('clave', 'correo_oficina').maybeSingle(); replyTo = limpio(aj?.valor); } catch (_) { /* sin ajuste */ }
  if (!replyTo && esEmail(yo.email_avisos)) replyTo = limpio(yo.email_avisos);
  const saludo = rellena(T.hola, { n: cli?.nombre || '' }).replace(/\s+,/, ',');
  const intro = ps.length === 1 ? T.intro1 : rellena(T.introN, { k: ps.length });
  const cuerpoHtml = `<p>${esc(saludo)}</p><p>${esc(intro)}</p>${mensaje ? `<div style="background:#f5f4ef;border-radius:12px;padding:14px 16px;white-space:pre-wrap;font-size:15px;line-height:1.5">${esc(mensaje)}</div>` : ''}
    ${tarjetas.join('')}
    <p style="font-size:14px;color:#555">${esc(T.pie)}</p>
    <p>${esc(T.saludo)}<br><b>${esc(yo.nombre || 'Sysefen')}</b><br>Sysefen</p>`;
  const cuerpoTxt = `${saludo}\n\n${intro}\n\n${mensaje ? mensaje + '\n\n' : ''}${textos.join('\n\n')}\n\n${T.pie}\n\n${T.saludo}\n${yo.nombre || 'Sysefen'}\nSysefen`;
  try {
    await mandar(RESEND, Object.assign({ to: [para], subject: asunto, text: cuerpoTxt, html: marco(ps.length === 1 ? T.titulo1 : T.tituloN, cuerpoHtml), attachments: adjuntos.length ? adjuntos : undefined }, cc.length ? { cc } : {}, replyTo ? { reply_to: replyTo } : {}));
  } catch (e) { return json({ error: 'No se pudo mandar el correo: ' + (e as Error).message }, 502); }
  const NOMBRE_IDIOMA: Record<string, string> = { en: 'en inglés', ca: 'en catalán', de: 'en alemán' };
  try { await sb.from('cliente_bitacora').insert({ cliente_id: clienteId, tipo: 'email', texto: (ps.length === 1 ? 'Presupuesto enviado' : ps.length + ' presupuestos enviados') + ' por correo a ' + para + (NOMBRE_IDIOMA[idioma] ? ' ' + NOMBRE_IDIOMA[idioma] : '') + ': ' + ordenados.map((p) => tituloCliente(p)).join(' · ') + (mensaje ? ' · Mensaje: ' + mensaje.slice(0, 200) : ''), por: yo.id }); } catch (_) { /* sin bitácora */ }
  return json({ ok: true, enviados: ids.length, para, cc, enlaces: ordenados.map((p) => enlaceFirma(p.token_cliente || '')) });
});
