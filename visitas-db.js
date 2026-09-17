/* =============================================================================
 * Sysefen · Toma de datos · Acceso a Supabase
 *
 * Mismo estilo que supabase-db.js: funciones sueltas, sin clases, que
 * devuelven datos ya limpios o lanzan el error de Supabase tal cual.
 *
 * Regla de la casa: aquí NO se pinta nada y NO se toca V ni S.
 * ============================================================================= */

import { supabase } from './supabase-client.js';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/* ---------------------------------------------------------------------------
 * Clientes (caché de Teamleader)
 * ------------------------------------------------------------------------- */
export async function listarClientes() {
  return unwrap(
    await supabase.from('clientes_cache').select('*').order('nombre')
  ) || [];
}

export async function buscarClientes(texto) {
  const q = String(texto || '').trim();
  if (q.length < 2) return [];
  return unwrap(
    await supabase
      .from('clientes_cache')
      .select('*')
      .or(`nombre.ilike.%${q}%,nif.ilike.%${q}%,telefono.ilike.%${q}%`)
      .limit(20)
  ) || [];
}

/**
 * Alta rápida en la visita. Se crea SIN tl_id y con pendiente_alta, porque el
 * maestro es Teamleader: el cliente de verdad lo crea la cola al sincronizar,
 * después de buscar por NIF y teléfono para no duplicar.
 */
export async function crearClienteLocal(datos) {
  const fila = {
    nombre: datos.nombre,
    nif: datos.nif || null,
    telefono: datos.telefono || null,
    email: datos.email || null,
    direccion_fiscal: datos.direccion_fiscal || null,
    tl_tipo: datos.tl_tipo || 'contact',
    pendiente_alta: true,
  };
  return unwrap(
    await supabase.from('clientes_cache').insert(fila).select().single()
  );
}

/* ---------------------------------------------------------------------------
 * Visitas
 * ------------------------------------------------------------------------- */
const CAMPOS_VISITA = `
  id, codigo, cliente_id, tecnico_id, fecha_visita, hora_inicio, hora_fin,
  direccion, poblacion, cp, lat, lng, tipo_inmueble, superficie_m2,
  plantas, habitaciones, banos, anio_construccion, ocupantes,
  acceso, acceso_notas, necesita_grua, necesita_andamio,
  origen, plazo_deseado, interesa_financiacion, interesa_subvencion,
  estado, observaciones, tl_deal_id, tl_deal_fase,
  sync_estado, sync_error, sync_at, drive_id, drive_at, drive_carpeta_id,
  created_at, updated_at
`;

export async function listarVisitas() {
  return unwrap(
    await supabase
      .from('visitas')
      .select(`${CAMPOS_VISITA}, cliente:clientes_cache(id, nombre, telefono), fichas:visita_fichas(categoria, completada)`)
      .order('fecha_visita', { ascending: false })
      .order('created_at', { ascending: false })
  ) || [];
}

export async function verVisita(id) {
  const visita = unwrap(
    await supabase
      .from('visitas')
      .select(`${CAMPOS_VISITA}, cliente:clientes_cache(*)`)
      .eq('id', id)
      .single()
  );
  const fichas = unwrap(
    await supabase.from('visita_fichas').select('*').eq('visita_id', id)
  ) || [];
  const adjuntos = unwrap(
    await supabase.from('visita_adjuntos').select('*').eq('visita_id', id)
      .order('created_at')
  ) || [];
  return { visita, fichas, adjuntos };
}

/**
 * El id lo genera el cliente, no la base. Así la misma visita tiene el mismo
 * id se haya creado con cobertura o sin ella, y al subir no se duplica.
 */
export async function crearVisita(datos) {
  return unwrap(
    await supabase.from('visitas').insert(datos).select(CAMPOS_VISITA).single()
  );
}

/**
 * Guardar sin saber si la visita ya existe (primera vez o reintento).
 * No se usa upsert: el trigger del código gastaría un número en cada
 * guardado y lo pisaría.
 */
export async function guardarOCrearVisita(fila) {
  const { id, ...cambios } = fila;
  const upd = await supabase.from('visitas').update(cambios).eq('id', id)
    .select(CAMPOS_VISITA).maybeSingle();
  if (upd.error) throw upd.error;
  if (upd.data) return upd.data;
  return crearVisita(fila);
}

export async function guardarVisita(id, cambios) {
  return unwrap(
    await supabase.from('visitas').update(cambios).eq('id', id)
      .select(CAMPOS_VISITA).single()
  );
}

export async function borrarVisita(id) {
  // Solo borradores. Las sincronizadas ya viven en el CRM.
  return unwrap(
    await supabase.from('visitas').delete().eq('id', id).eq('estado', 'borrador')
  );
}

/* ---------------------------------------------------------------------------
 * Fichas por categoría
 * ------------------------------------------------------------------------- */
export async function guardarFicha(visitaId, categoria, datos, schemaVersion, completada = false) {
  const fila = {
    visita_id: visitaId,
    categoria,
    datos,
    schema_version: schemaVersion,
    completada,
  };
  return unwrap(
    await supabase
      .from('visita_fichas')
      .upsert(fila, { onConflict: 'visita_id,categoria' })
      .select()
      .single()
  );
}

export async function quitarFicha(visitaId, categoria) {
  return unwrap(
    await supabase.from('visita_fichas').delete()
      .eq('visita_id', visitaId).eq('categoria', categoria)
  );
}

/* ---------------------------------------------------------------------------
 * Fotos y adjuntos (bucket privado 'visitas')
 * ------------------------------------------------------------------------- */
function blobDeDataURL(dataURL) {
  const [cab, b64] = String(dataURL).split(',');
  const mime = (cab.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

/** Encoge la foto antes de subirla: lado largo 1600 px y JPEG 0.7. */
export function encogerFoto(dataURL, ladoMax = 1600, calidad = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

export async function subirFoto(visitaId, { dataURL, categoria, campoRef, descripcion, tipo }) {
  const chica = await encogerFoto(dataURL);
  const blob = blobDeDataURL(chica);
  const nombre = `${crypto.randomUUID()}.jpg`;
  const ruta = `visitas/${visitaId}/${categoria || 'general'}/${nombre}`;

  const sub = await supabase.storage.from('visitas')
    .upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
  if (sub.error) throw sub.error;

  return unwrap(
    await supabase.from('visita_adjuntos').insert({
      visita_id: visitaId,
      tipo: tipo || 'foto',
      storage_path: ruta,
      campo_ref: campoRef || null,
      descripcion: descripcion || null,
    }).select().single()
  );
}

export async function urlsFotos(rutas, segundos = 3600) {
  if (!rutas || !rutas.length) return {};
  const { data, error } = await supabase.storage.from('visitas')
    .createSignedUrls(rutas, segundos);
  if (error) throw error;
  const mapa = {};
  (data || []).forEach((d) => { if (d.signedUrl) mapa[d.path] = d.signedUrl; });
  return mapa;
}

export async function borrarFoto(id, ruta) {
  await supabase.storage.from('visitas').remove([ruta]);
  return unwrap(await supabase.from('visita_adjuntos').delete().eq('id', id));
}

/* ---------------------------------------------------------------------------
 * Google Drive (sql/etapa29)
 *
 * Igual que con las planillas y los partes: la app no habla con Google, se lo
 * pide a su backend. Las credenciales viven solo en la edge function.
 * ------------------------------------------------------------------------- */

/** Saca el error de dentro de la respuesta de la función, que si no llega como "non-2xx". */
async function invocar(nombre, cuerpo) {
  const { data, error } = await supabase.functions.invoke(nombre, { body: cuerpo });
  if (error) {
    let msg = error.message || 'error';
    const clase = error.name || '';
    if (clase === 'FunctionsFetchError' || clase === 'FunctionsRelayError' || /failed to (send|fetch)/i.test(msg)) {
      msg = 'la función ' + nombre + ' no está subida todavía';
    } else {
      try {
        const ctx = error.context;
        if (ctx && typeof ctx.clone === 'function') {
          const c = await ctx.clone().json();
          if (c && c.error) msg = c.error;
        }
      } catch (_) { /* no era JSON */ }
    }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

/** Le crea (o le repasa) su carpeta en Drive y su fila en la hoja de clientes. */
export async function clienteADrive(clienteId) {
  return invocar('cliente-drive', { cliente_id: clienteId });
}

/** Sube el PDF de la visita y sus fotos a la carpeta del cliente. */
export async function subirVisitaADrive(visitaId, pdfBlob) {
  const buf = new Uint8Array(await pdfBlob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return invocar('visita-drive', { visita_id: visitaId, pdf_base64: btoa(bin) });
}

/* ---------------------------------------------------------------------------
 * Envío a Teamleader
 * ------------------------------------------------------------------------- */
/**
 * La app NO habla con Teamleader. Solo pide a su propio backend que lo haga.
 * Los tokens del CRM viven en la edge function, nunca en el navegador.
 */
export async function enviarATeamleader(visitaId) {
  const { data, error } = await supabase.functions.invoke('teamleader-visita', {
    body: { visita_id: visitaId },
  });
  if (error) throw error;
  return data;
}

export async function estadoSync(visitaId) {
  return unwrap(
    await supabase.from('sync_cola')
      .select('id, operacion, estado, intentos, ultimo_error, proximo_intento')
      .eq('visita_id', visitaId)
      .order('id')
  ) || [];
}

export async function pendientesDeEnviar() {
  return unwrap(
    await supabase.from('visitas')
      .select('id, codigo, direccion, poblacion, sync_estado, sync_error')
      .in('sync_estado', ['pendiente', 'error'])
      .eq('estado', 'completada')
  ) || [];
}

/* ---------------------------------------------------------------------------
 * Agenda: clientes y citas (sql/etapa23_agenda_citas.sql)
 * Crear y cambiar citas: solo presupuestos (RLS). Ver: también jefe y admin.
 * ------------------------------------------------------------------------- */
const CAMPOS_CITA = `
  id, cliente_id, inicio, duracion_min, empleado_id, categorias, direccion,
  poblacion, nota, estado, visita_id, aviso_enviado_at, cambio_desde, confirmacion_enviada_at, created_at, updated_at
`;

/** Citas sin fecha y las de los últimos `diasAtras` días en adelante. */
export async function listarCitas(diasAtras = 120) {
  const desde = new Date(Date.now() - diasAtras * 86400000).toISOString();
  return unwrap(
    await supabase
      .from('citas')
      .select(`${CAMPOS_CITA}, cliente:clientes_cache(id, nombre, telefono, email, tipo, tl_id, tl_tipo, direccion, poblacion)`)
      .or(`inicio.is.null,inicio.gte."${desde}"`)
      .order('inicio', { ascending: true, nullsFirst: false })
  ) || [];
}

/** Clientes con lo justo de sus citas y visitas para saber en qué punto están. */
export async function listarClientesAgenda() {
  return unwrap(
    await supabase
      .from('clientes_cache')
      .select('*, citas(id, inicio, estado), visitas(id, codigo, estado, sync_estado, fecha_visita)')
      .order('nombre')
  ) || [];
}

export async function guardarCliente(cliente) {
  const { id, ...campos } = cliente;
  if (id) {
    return unwrap(
      await supabase.from('clientes_cache')
        .update({ ...campos, actualizado_at: new Date().toISOString() })
        .eq('id', id).select().single()
    );
  }
  // Nace en la app, sin tl_id: queda pendiente de dar de alta en Teamleader.
  return unwrap(
    await supabase.from('clientes_cache').insert({ ...campos, pendiente_alta: true }).select().single()
  );
}

/* ---------------------------------------------------------------------------
 * Teamleader (sql/etapa31)
 *
 * La app no habla nunca con el CRM: se lo pide a su backend, que es quien
 * guarda el permiso. Aquí no hay ni client_id ni tokens.
 * ------------------------------------------------------------------------- */

/** Crea el cliente en el CRM (contacto o empresa) y guarda su id. */
export async function clienteATeamleader(clienteId) {
  return invocar('teamleader-cliente', { cliente_id: clienteId });
}

/** ¿Está conectado el CRM? Devuelve { conectado, expira_at }. */
export async function teamleaderEstado() {
  return invocar('teamleader-oauth', { accion: 'estado' });
}

/** Devuelve la dirección a la que hay que ir para autorizar la integración. */
export async function teamleaderIniciar() {
  return invocar('teamleader-oauth', { accion: 'iniciar' });
}

/** Borra el permiso guardado. Solo Administración. */
export async function teamleaderDesconectar() {
  return invocar('teamleader-oauth', { accion: 'desconectar' });
}

/**
 * Avisa por correo de UNA cita: nueva, cambiada o anulada (sql/etapa30).
 * La función decide sola qué toca contar y a quién, y marca la cita para no
 * repetirlo. Va con la sesión de quien usa la app; la clave del cron no sale
 * nunca del servidor.
 */
export async function avisarCita(citaId) {
  return invocar('recordatorio-citas', { cita_id: citaId });
}

/** Borra una cita. Si tenía visita hecha, la visita se queda (sin cita). */
export async function borrarCita(id) {
  const { error } = await supabase.from('citas').delete().eq('id', id);
  if (error) throw error;
  return true;
}

/** Borra un cliente y, en cascada, sus citas. Falla si tiene visitas. */
export async function borrarCliente(id) {
  const { error } = await supabase.from('clientes_cache').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function guardarCita(cita) {
  const { id, ...campos } = cita;
  if (id) {
    return unwrap(await supabase.from('citas').update(campos).eq('id', id).select(CAMPOS_CITA).single());
  }
  return unwrap(await supabase.from('citas').insert(campos).select(CAMPOS_CITA).single());
}
