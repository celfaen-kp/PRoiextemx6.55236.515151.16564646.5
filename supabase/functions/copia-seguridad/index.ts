// =============================================================================
// Sysefen · Edge Function `copia-seguridad`
//
// Copia de seguridad semanal de TODO a Google Drive: cada tabla de `public`
// (un .json fiel y un .csv legible) y cada archivo de Storage (partes,
// documentos, visitas, presupuestos firmados…), en una carpeta por copia dentro
// de «Copias de seguridad», que vive junto a la carpeta de planillas.
//
// POR QUÉ ASÍ: el plan gratuito de Supabase no hace copias. Los datos ocupan
// unos 7 MB y los archivos unos 35 MB (2-11-2026), así que una copia semanal
// cuesta nada. Se guardan las 8 últimas semanales y la primera de cada mes
// para siempre.
//
// EN VARIAS PASADAS: una función tiene poco tiempo por llamada, así que la copia
// avanza por pasos y apunta su progreso en `copias_seguridad`. El cron la llama
// cada 10 minutos: el domingo a las 03 UTC arranca una copia nueva; el resto de
// llamadas continúan la que esté a medias (o no hacen nada). Cada llamada
// trabaja hasta ~70 s y devuelve el estado.
//
// SECRETOS: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
// DRIVE_CARPETA_DATA (id de la carpeta SYSEFEN DATA, donde se crea
// «09-Copias de seguridad»), AVISOS_CLAVE (el cron), RESEND_API_KEY (aviso si falla).
// El id de la carpeta de copias se guarda en `ajustes` (clave
// drive_carpeta_copias) la primera vez, para no buscarla cada semana.
//
// DESPLIEGUE: "Verify JWT" DESACTIVADO (entra el cron con x-clave). Desde la
// app solo Administración, con su sesión.
//
// USO (POST JSON):
//   { "cron": true }                 cron: arrancar si toca, continuar si hay
//   { "accion": "iniciar" }          admin: copia manual ahora (y avanza)
//   { "accion": "continuar" }        admin: seguir con la que está a medias
//   { "accion": "estado" }           admin: últimas copias, sin tocar nada
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PRESUPUESTO_MS = 70_000;       // trabajo por llamada antes de devolver el estado
const FILAS_POR_TROZO = 1000;
const SEMANALES_QUE_SE_GUARDAN = 8;
const MAX_PASADAS = 80;              // ~13 h de cron: si no ha acabado, algo va mal
const REMITENTE = 'Sysefen <noreply@sysefen.com>';
const MIME_CARPETA = 'application/vnd.google-apps.folder';

// ---------------------------------------------------------------- Google Drive
async function tokenDeGoogle() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '', client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
      refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN') || '', grant_type: 'refresh_token',
    }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.access_token) throw new Error('Google no aceptó las credenciales: ' + (res.error_description || res.error || r.status));
  return res.access_token as string;
}

async function drive(token: string, ruta: string, init: RequestInit = {}) {
  const r = await fetch('https://www.googleapis.com/drive/v3/' + ruta + (ruta.includes('?') ? '&' : '?') + 'supportsAllDrives=true', {
    ...init, headers: { Authorization: 'Bearer ' + token, ...(init.headers || {}) },
  });
  if (r.status === 204) return {};
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Drive: ' + (res.error?.message || r.status) + ' (' + ruta.split('?')[0] + ')');
  return res;
}

const escQ = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function buscarCarpeta(token: string, madre: string, nombre: string) {
  const q = encodeURIComponent(`'${madre}' in parents and name = '${escQ(nombre)}' and mimeType = '${MIME_CARPETA}' and trashed = false`);
  const res = await drive(token, `files?q=${q}&fields=files(id,name)&pageSize=1&includeItemsFromAllDrives=true`);
  return (res.files && res.files[0] && res.files[0].id as string) || null;
}

async function crearCarpeta(token: string, madre: string, nombre: string) {
  const res = await drive(token, 'files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: MIME_CARPETA, parents: [madre] }),
  });
  return res.id as string;
}

async function carpetaOCrear(token: string, madre: string, nombre: string) {
  return (await buscarCarpeta(token, madre, nombre)) || (await crearCarpeta(token, madre, nombre));
}

async function subir(token: string, carpeta: string, nombre: string, bytes: Uint8Array, mime: string) {
  const limite = '-----sysefen' + crypto.randomUUID();
  const cab = new TextEncoder().encode(
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [carpeta] })}\r\n` +
    `--${limite}\r\nContent-Type: ${mime}\r\n\r\n`);
  const fin = new TextEncoder().encode(`\r\n--${limite}--`);
  const cuerpo = new Uint8Array(cab.length + bytes.length + fin.length);
  cuerpo.set(cab, 0); cuerpo.set(bytes, cab.length); cuerpo.set(fin, cab.length + bytes.length);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${limite}` }, body: cuerpo,
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.id) throw new Error('Drive rechazó la subida de ' + nombre + ': ' + (res.error?.message || r.status));
  return res.id as string;
}

// ------------------------------------------------------------------- utilidades
const dosDig = (n: number) => String(n).padStart(2, '0');
function nombreDeCopia(d: Date) {
  // Hora de Madrid, que es la que lee quien abre la carpeta.
  const p = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).reduce((o: Record<string, string>, x) => { o[x.type] = x.value; return o; }, {});
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}.${p.minute}`;
}

function aCSV(filas: Record<string, unknown>[]) {
  const cols: string[] = [];
  for (const f of filas) for (const k of Object.keys(f)) if (!cols.includes(k)) cols.push(k);
  const celda = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // Con BOM y punto y coma, que es lo que abre bien el Excel en español.
  return '﻿' + [cols.join(';'), ...filas.map((f) => cols.map((c) => celda(f[c])).join(';'))].join('\r\n');
}

const mimeDe = (ruta: string) => {
  const ext = (ruta.split('.').pop() || '').toLowerCase();
  return ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', json: 'application/json', csv: 'text/csv', txt: 'text/plain' } as Record<string, string>)[ext] || 'application/octet-stream';
};

// ------------------------------------------------------------------ la copia
type Copia = Record<string, any>;

async function guardar(sb: any, id: string, cambios: Record<string, unknown>) {
  const { error } = await sb.from('copias_seguridad').update(cambios).eq('id', id);
  if (error) throw new Error('No se pudo apuntar el progreso: ' + error.message);
}

// Carpeta raíz «09-Copias de seguridad», dentro de SYSEFEN DATA. Su id se guarda en ajustes.
async function carpetaRaiz(sb: any, token: string) {
  const { data: aj } = await sb.from('ajustes').select('valor').eq('clave', 'drive_carpeta_copias').maybeSingle();
  if (aj?.valor) {
    const v = await drive(token, `files/${aj.valor}?fields=id,trashed`).catch(() => null);
    if (v && v.id && !v.trashed) return aj.valor as string;
  }
  // El permiso de Google es «solo archivos creados por la app» (drive.file): no puede
  // mirar carpetas ajenas, pero sí crear dentro de una cuyo id conoce. SYSEFEN DATA
  // es la carpeta madre de 02-Partes, 03-Visitas, 06-Planillas… y la copia va al lado.
  const madre = Deno.env.get('DRIVE_CARPETA_DATA') || '';
  if (!madre) throw new Error('Falta el secreto DRIVE_CARPETA_DATA (id de la carpeta SYSEFEN DATA).');
  const id = await carpetaOCrear(token, madre, '09-Copias de seguridad');
  await sb.from('ajustes').upsert({ clave: 'drive_carpeta_copias', valor: id, updated_at: new Date().toISOString() });
  return id;
}

// Subcarpeta por ruta ("archivos/partes/OB-020") dentro de la copia, con caché en la fila.
async function carpetaDeRuta(sb: any, token: string, c: Copia, ruta: string) {
  if (!ruta) return c.carpeta_id as string;
  if (c.carpetas[ruta]) return c.carpetas[ruta] as string;
  const partes = ruta.split('/');
  const madre = await carpetaDeRuta(sb, token, c, partes.slice(0, -1).join('/'));
  const id = await carpetaOCrear(token, madre, partes[partes.length - 1]);
  c.carpetas[ruta] = id;
  await guardar(sb, c.id, { carpetas: c.carpetas });
  return id;
}

async function avanzar(sb: any, c: Copia, inicio: number) {
  const token = await tokenDeGoogle();
  const quedaTiempo = () => performance.now() - inicio < PRESUPUESTO_MS;
  if (c.pasadas > MAX_PASADAS) throw new Error(`La copia lleva ${c.pasadas} pasadas sin terminar.`);

  // --- preparar: carpeta de la copia y lista de trabajo -------------------------
  if (c.paso === 'preparar') {
    const raiz = await carpetaRaiz(sb, token);
    const nombre = c.nombre || nombreDeCopia(new Date(c.creada_en));
    const carpeta = await carpetaOCrear(token, raiz, nombre);
    const { data: tablas, error: e1 } = await sb.rpc('copia_tablas');
    if (e1) throw new Error('copia_tablas: ' + e1.message);
    const { data: archivos, error: e2 } = await sb.rpc('copia_archivos');
    if (e2) throw new Error('copia_archivos: ' + e2.message);
    // ¿Es la primera copia del mes? Entonces no se borra nunca.
    const mes = String(c.creada_en).slice(0, 7);
    const { count } = await sb.from('copias_seguridad').select('id', { count: 'exact', head: true })
      .eq('estado', 'ok').gte('creada_en', mes + '-01').lt('creada_en', c.creada_en);
    Object.assign(c, {
      nombre, carpeta_id: carpeta, carpetas: {}, paso: 'tablas',
      tablas_total: tablas.length, tablas_hechas: [], filas: 0,
      archivos_total: archivos.length, archivos_hechos: 0,
      archivos_pendientes: archivos.map((a: any) => ({ b: a.bucket, n: a.ruta, t: a.bytes })),
      bytes: 0, es_mensual: (count || 0) === 0,
    });
    c._tablas = tablas;
    await guardar(sb, c.id, {
      nombre, carpeta_id: carpeta, carpetas: {}, paso: 'tablas', tablas_total: c.tablas_total, tablas_hechas: [], filas: 0,
      archivos_total: c.archivos_total, archivos_hechos: 0, archivos_pendientes: c.archivos_pendientes, bytes: 0, es_mensual: c.es_mensual,
    });
  }

  // --- tablas: un .json y un .csv por tabla, en «datos» ----------------------------
  if (c.paso === 'tablas') {
    const tablas = c._tablas || (await sb.rpc('copia_tablas')).data || [];
    const datos = await carpetaDeRuta(sb, token, c, 'datos');
    for (let i = 0; i < tablas.length; i++) {
      const t = tablas[i];
      if (c.tablas_hechas.includes(t.tabla)) continue;
      if (!quedaTiempo()) return;
      const filas: Record<string, unknown>[] = [];
      for (let desde = 0; ; desde += FILAS_POR_TROZO) {
        const { data, error } = await sb.rpc('copia_tabla_json', { p_tabla: t.tabla, p_desde: desde, p_cuantos: FILAS_POR_TROZO });
        if (error) throw new Error(`copia_tabla_json(${t.tabla}): ` + error.message);
        filas.push(...(data || []));
        if (!data || data.length < FILAS_POR_TROZO) break;
      }
      const num = dosDig(i + 1);  // el número delante conserva el orden de restauración al listar la carpeta
      const js = new TextEncoder().encode(JSON.stringify({ tabla: t.tabla, pk: t.pk, generadas: t.generadas || [], orden: i + 1, filas: filas.length, copia: c.nombre, datos: filas }));
      await Promise.all([
        subir(token, datos, `${num}-${t.tabla}.json`, js, 'application/json'),
        filas.length ? subir(token, datos, `${num}-${t.tabla}.csv`, new TextEncoder().encode(aCSV(filas)), 'text/csv') : Promise.resolve(''),
      ]);
      c.tablas_hechas = [...c.tablas_hechas, t.tabla]; c.filas += filas.length; c.bytes += js.length;
      await guardar(sb, c.id, { tablas_hechas: c.tablas_hechas, filas: c.filas, bytes: c.bytes });
    }
    // Índice con el orden de restauración y lo que hay.
    const indice = { copia: c.nombre, creada_en: c.creada_en, tablas: tablas.map((t: any, i: number) => ({ orden: i + 1, tabla: t.tabla, filas: t.filas, pk: t.pk, generadas: t.generadas || [] })), archivos: c.archivos_total, nota: 'Restaurar con herramientas/restaurar-copia.py, en este orden de tablas.' };
    await subir(token, c.carpeta_id, 'indice.json', new TextEncoder().encode(JSON.stringify(indice, null, 1)), 'application/json');
    c.paso = 'archivos';
    await guardar(sb, c.id, { paso: 'archivos' });
  }

  // --- archivos de Storage: espejo de bucket/ruta dentro de «archivos» -----------------
  if (c.paso === 'archivos') {
    while (c.archivos_pendientes.length) {
      if (!quedaTiempo()) return;
      const lote = c.archivos_pendientes.slice(0, 8);
      const destinos: string[] = [];
      for (const a of lote) {
        const trozos = a.n.split('/');
        destinos.push(await carpetaDeRuta(sb, token, c, ['archivos', a.b, ...trozos.slice(0, -1)].join('/')));
      }
      const tam = await Promise.all(lote.map(async (a: any, i: number) => {
        const { data, error } = await sb.storage.from(a.b).download(a.n);
        if (error || !data) throw new Error(`No se pudo bajar ${a.b}/${a.n}: ` + (error?.message || 'sin datos'));
        const bytes = new Uint8Array(await data.arrayBuffer());
        await subir(token, destinos[i], a.n.split('/').pop() as string, bytes, mimeDe(a.n));
        return bytes.length;
      }));
      c.bytes += tam.reduce((x, y) => x + y, 0);
      c.archivos_pendientes = c.archivos_pendientes.slice(lote.length);
      c.archivos_hechos += lote.length;
      await guardar(sb, c.id, { archivos_pendientes: c.archivos_pendientes, archivos_hechos: c.archivos_hechos, bytes: c.bytes });
    }
    c.paso = 'retencion';
    await guardar(sb, c.id, { paso: 'retencion' });
  }

  // --- retención: 8 semanales + la primera de cada mes --------------------------------
  if (c.paso === 'retencion') {
    const raiz = await carpetaRaiz(sb, token);
    const q = encodeURIComponent(`'${raiz}' in parents and mimeType = '${MIME_CARPETA}' and trashed = false`);
    const res = await drive(token, `files?q=${q}&fields=files(id,name)&pageSize=200&includeItemsFromAllDrives=true`);
    const copias = ((res.files || []) as { id: string; name: string }[])
      .filter((f) => /^\d{4}-\d{2}-\d{2} \d{2}\.\d{2}$/.test(f.name) && f.id !== c.carpeta_id)
      .sort((a, b) => b.name.localeCompare(a.name));  // más reciente primero
    const { data: mensuales } = await sb.from('copias_seguridad').select('carpeta_id').eq('es_mensual', true).eq('estado', 'ok');
    const protegidas = new Set<string>([...(mensuales || []).map((m: any) => m.carpeta_id), c.carpeta_id]);
    // La primera copia de cada mes se protege también por nombre, por si falta en la tabla.
    const primeraDelMes = new Map<string, string>();
    for (const f of [...copias].sort((a, b) => a.name.localeCompare(b.name))) {
      const mes = f.name.slice(0, 7);
      if (!primeraDelMes.has(mes)) primeraDelMes.set(mes, f.id);
    }
    for (const id of primeraDelMes.values()) protegidas.add(id);
    const borrar = copias.slice(SEMANALES_QUE_SE_GUARDAN - 1).filter((f) => !protegidas.has(f.id));
    const borradas: string[] = [];
    for (const f of borrar) {
      await drive(token, `files/${f.id}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });  // a la papelera de Drive (30 días), nunca borrado directo
      borradas.push(f.name);
    }
    c.paso = 'fin'; c.estado = 'ok'; c.terminada_en = new Date().toISOString();
    await guardar(sb, c.id, { paso: 'fin', estado: 'ok', terminada_en: c.terminada_en, borradas });
  }
}

async function avisarFallo(sb: any, c: Copia, msg: string) {
  const RESEND = Deno.env.get('RESEND_API_KEY') || '';
  if (!RESEND || c.avisado) return;
  const { data: emps } = await sb.from('empleados').select('nombre, rol, email, email_avisos').eq('activo', true).in('rol', ['admin', 'presupuestos']);
  const para = [...new Set((emps || []).map((e: any) => String(e.email_avisos || e.email || '').trim()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))] as string[];
  if (!para.length) return;
  const texto = `La copia de seguridad ${c.nombre || ''} (${c.origen}) ha fallado en el paso «${c.paso}» tras ${c.pasadas} pasadas.\n\nError: ${msg}\n\nTablas copiadas: ${(c.tablas_hechas || []).length}/${c.tablas_total}. Archivos: ${c.archivos_hechos}/${c.archivos_total}.\n\nEn la app, Ajustes → Copias de seguridad, se puede lanzar otra a mano. Si vuelve a fallar, mirar los logs de la función copia-seguridad en Supabase.`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMITENTE, to: para, subject: 'Sysefen · la copia de seguridad ha fallado', text: texto }),
  }).catch(() => {});
  await guardar(sb, c.id, { avisado: true }).catch(() => {});
}

const resumen = (c: Copia | null) => c && {
  id: c.id, nombre: c.nombre, estado: c.estado, paso: c.paso, origen: c.origen, es_mensual: c.es_mensual,
  creada_en: c.creada_en, terminada_en: c.terminada_en, tablas: (c.tablas_hechas || []).length, tablas_total: c.tablas_total,
  filas: c.filas, archivos: c.archivos_hechos, archivos_total: c.archivos_total, bytes: c.bytes, pasadas: c.pasadas, error: c.error, borradas: c.borradas,
};

// ------------------------------------------------------------------------ servidor
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  const inicio = performance.now();

  let b: Record<string, any>;
  try { b = await req.json(); } catch { b = {}; }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // --- quién llama: el cron con x-clave, o Administración con su sesión -------------
  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  const esCron = !!CLAVE && req.headers.get('x-clave') === CLAVE;
  if (!esCron) {
    const autorizacion = req.headers.get('Authorization') || '';
    if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
    const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: autorizacion } } });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return json({ error: 'Sesión no válida.' }, 401);
    const { data: emp } = await sb.from('empleados').select('rol').eq('user_id', user.id).maybeSingle();
    if (!emp || emp.rol !== 'admin') return json({ error: 'Solo Administración puede manejar las copias de seguridad.' }, 403);
  }

  const { data: ultimas } = await sb.from('copias_seguridad').select('*').order('creada_en', { ascending: false }).limit(6);
  let enCurso: Copia | null = (ultimas || []).find((c: Copia) => c.estado === 'en_curso') || null;
  const accion = esCron ? (b.cron ? 'cron' : String(b.accion || 'cron')) : String(b.accion || 'estado');

  if (accion === 'estado') return json({ ok: true, en_curso: resumen(enCurso), copias: (ultimas || []).map(resumen) });

  // ¿Llega la cuenta de Google a cada carpeta de los secretos? (solo el cron; no saca los ids enteros)
  if (accion === 'diagnostico' && esCron) {
    const token = await tokenDeGoogle();
    const salida: Record<string, unknown> = {};
    for (const k of ['DRIVE_CARPETA_DATA', 'DRIVE_CARPETA_ID', 'DRIVE_CARPETA_PARTES', 'DRIVE_CARPETA_VISITAS', 'DRIVE_CARPETA_CLIENTES', 'DRIVE_CARPETA_LEGALIZACIONES']) {
      const id = Deno.env.get(k) || '';
      if (!id) { salida[k] = 'sin valor'; continue; }
      try {
        const f = await drive(token, `files/${id}?fields=id,name,parents,driveId,trashed`);
        salida[k] = { fin: id.slice(-4), nombre: f.name, madres: (f.parents || []).length, unidad_compartida: !!f.driveId, papelera: !!f.trashed };
      } catch (e) { salida[k] = { fin: id.slice(-4), error: e instanceof Error ? e.message : String(e) }; }
    }
    const { data: aj } = await sb.from('ajustes').select('valor').eq('clave', 'drive_carpeta_copias').maybeSingle();
    salida.ajuste_copias = aj?.valor ? aj.valor.slice(-4) : null;
    return json({ ok: true, carpetas: salida });
  }

  // ¿Hay que arrancar una nueva?
  let arrancar = accion === 'iniciar';
  if (accion === 'cron' && !enCurso) {
    const ahora = new Date();
    const hoy = ahora.toISOString().slice(0, 10);
    const toca = ahora.getUTCDay() === 0 && ahora.getUTCHours() === 3;
    const yaHoy = (ultimas || []).some((c: Copia) => String(c.creada_en).slice(0, 10) === hoy);
    arrancar = toca && !yaHoy;
    if (!arrancar) return json({ ok: true, nada: true, ultima: resumen((ultimas || [])[0] || null) });
  }
  if (arrancar) {
    if (enCurso) return json({ error: 'Ya hay una copia en marcha (' + (enCurso.nombre || enCurso.paso) + '). Espera a que termine.', en_curso: resumen(enCurso) }, 409);
    const { data: nueva, error } = await sb.from('copias_seguridad').insert({ origen: esCron ? 'cron' : 'manual' }).select('*').single();
    if (error) return json({ error: 'No se pudo abrir la copia: ' + error.message }, 500);
    enCurso = nueva;
  }
  if (!enCurso) return json({ ok: true, nada: true, ultima: resumen((ultimas || [])[0] || null) });

  // Dos llamadas a la vez (cron + app) no deben trabajar sobre la misma copia: marca de pasada.
  const { data: tomada } = await sb.from('copias_seguridad').update({ pasadas: (enCurso.pasadas || 0) + 1 })
    .eq('id', enCurso.id).eq('pasadas', enCurso.pasadas || 0).select('id').maybeSingle();
  if (!tomada) return json({ ok: true, ocupada: true, en_curso: resumen(enCurso) });
  enCurso.pasadas = (enCurso.pasadas || 0) + 1;

  try {
    await avanzar(sb, enCurso, inicio);
    if (enCurso.error) { enCurso.error = null; await guardar(sb, enCurso.id, { error: null }).catch(() => {}); }
    return json({ ok: true, terminada: enCurso.estado === 'ok', en_curso: enCurso.estado === 'ok' ? null : resumen(enCurso), copia: resumen(enCurso) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('copia-seguridad', enCurso.id, enCurso.paso, msg);
    // Un tropiezo de red no tira la copia: se reintenta en la siguiente pasada (hasta MAX_PASADAS).
    const definitivo = enCurso.pasadas > MAX_PASADAS || /credenciales|DRIVE_CARPETA_ID|tabla desconocida|copia_tablas|copia_archivos/.test(msg);
    if (definitivo) {
      enCurso.estado = 'error'; enCurso.error = msg; enCurso.terminada_en = new Date().toISOString();
      await guardar(sb, enCurso.id, { estado: 'error', error: msg, terminada_en: enCurso.terminada_en }).catch(() => {});
      await avisarFallo(sb, enCurso, msg);
    } else {
      await guardar(sb, enCurso.id, { error: msg }).catch(() => {});
      if (enCurso.pasadas >= 6 && !enCurso.avisado) await avisarFallo(sb, enCurso, msg + ' (se seguirá intentando)');
    }
    return json({ ok: false, error: msg, definitivo, copia: resumen(enCurso) }, 500);
  }
});
