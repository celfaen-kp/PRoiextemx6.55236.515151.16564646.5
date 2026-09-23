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
  gracias_at,
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
  try {
    return await crearVisita(fila);
  } catch (e) {
    // No se pudo cambiar (0 filas) y tampoco crear porque ya existe: la visita
    // es de otra persona y Supabase no deja tocarla. Antes salía un "duplicate
    // key" que no se entendía.
    if (e && (e.code === '23505' || /duplicate key/i.test(e.message || ''))) {
      throw new Error('Esta visita la empezó otra persona y todavía no tienes permiso para cambiarla. Hay que ejecutar sql/etapa37_visitas_equipo.sql en Supabase.');
    }
    throw e;
  }
}

export async function guardarVisita(id, cambios) {
  return unwrap(
    await supabase.from('visitas').update(cambios).eq('id', id)
      .select(CAMPOS_VISITA).single()
  );
}

export async function borrarVisita(id, forzar) {
  // Por defecto solo borradores: una visita cerrada es trabajo hecho. `forzar`
  // es para cuando se borra el cliente entero, que se lo lleva todo por delante.
  let q = supabase.from('visitas').delete().eq('id', id);
  if (!forzar) q = q.eq('estado', 'borrador');
  return unwrap(await q);
}

/** Las fotos de una visita, para poder quitarlas del almacén al borrarla. */
export async function rutasFotos(visitaId) {
  const filas = unwrap(
    await supabase.from('visita_adjuntos').select('storage_path').eq('visita_id', visitaId)
  ) || [];
  return filas.map((f) => f.storage_path).filter(Boolean);
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

/**
 * Apunta en la hoja a todos los clientes que aún no estén: los que entran por
 * la web y los traídos del CRM. Devuelve { apuntados, fallos }.
 */
export async function clientesPendientesADrive() {
  return invocar('cliente-drive', { pendientes: true });
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
 *
 * `texto` es la ficha en texto plano, que la monta la app: las preguntas y su
 * orden están en visitas-schemas.js y no tiene sentido duplicarlos en el
 * servidor para que se queden viejos.
 */
export async function enviarATeamleader(visitaId, texto) {
  return invocar('teamleader-visita', { visita_id: visitaId, texto: texto || '' });
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

/**
 * Le da las gracias al cliente por la visita y le dice que en unos días tendrá
 * su presupuesto (sql/etapa34). No lleva ninguno de los datos que se tomaron.
 */
export async function correoGraciasVisita(visitaId, otraVez) {
  return invocar('correo-visita', { visita_id: visitaId, otra_vez: !!otraVez });
}

/* ---------------------------------------------------------------------------
 * Motor de presupuestos (sql/etapa38 y 41)
 *
 * La app no calcula nada: le pasa la visita a la función `presupuestar` y
 * recibe las líneas ya con su precio. Las reglas y la tarifa viven en Supabase,
 * así que cambiar un precio no es tocar la app.
 * ------------------------------------------------------------------------- */

/** Calcula el presupuesto de una visita. Con `guardar: false` no escribe nada. */
export async function presupuestarVisita(visitaId, categoria, opciones) {
  const o = opciones || {};
  return invocar('presupuestar', {
    visita_id: visitaId,
    categoria,
    guardar: o.guardar === true,
    dto_global_pct: o.dtoGlobalPct == null ? undefined : o.dtoGlobalPct,
    lineas_extra: o.lineasExtra && o.lineasExtra.length ? o.lineasExtra : undefined,
  });
}

/**
 * Calcula un presupuesto SIN visita: se le pasan los datos a mano. Es lo normal
 * cuando se presupuesta por teléfono o para un cliente de siempre.
 */
export async function presupuestarSuelto(categoria, datos, opciones) {
  const o = opciones || {};
  return invocar('presupuestar', {
    categoria,
    datos,
    cliente_id: o.clienteId || undefined,
    titulo: o.titulo || undefined,
    guardar: o.guardar === true,
    dto_global_pct: o.dtoGlobalPct == null ? undefined : o.dtoGlobalPct,
    lineas_extra: o.lineasExtra && o.lineasExtra.length ? o.lineasExtra : undefined,
  });
}

/** Todos los presupuestos guardados, los de visita y los sueltos. */
export async function listarPresupuestos(limite = 100) {
  return unwrap(
    await supabase.from('presupuestos')
      .select('*, cliente:clientes_cache(id, nombre), visita:visitas(id, codigo)')
      .order('created_at', { ascending: false })
      .limit(limite)
  ) || [];
}

/** Un presupuesto guardado, con sus líneas y sus incidencias. */
export async function verPresupuesto(id) {
  return unwrap(
    await supabase.from('presupuestos')
      .select('*, cliente:clientes_cache(id, nombre), visita:visitas(id, codigo), lineas:presupuesto_lineas(*), incidencias:presupuesto_incidencias(*)')
      .eq('id', id).single()
  );
}

/** Los presupuestos ya guardados de una visita, con sus líneas. */
export async function presupuestosDeVisita(visitaId) {
  return unwrap(
    await supabase.from('presupuestos')
      .select('*, lineas:presupuesto_lineas(*), incidencias:presupuesto_incidencias(*)')
      .eq('visita_id', visitaId)
      .order('created_at', { ascending: false })
  ) || [];
}

/** Busca en el catálogo para añadir la máquina a mano. */
export async function buscarProductos(texto, familia) {
  const q = String(texto || '').trim();
  if (q.length < 2) return [];
  let consulta = supabase.from('productos')
    .select('referencia, nombre, familia, unidad, precio_tarifa, detalle_tecnico, especificaciones, iva')
    .eq('activo', true)
    .or(`nombre.ilike.%${q}%,referencia.ilike.%${q}%`)
    .order('nombre')
    .limit(25);
  if (familia) consulta = consulta.eq('familia', familia);
  return unwrap(await consulta) || [];
}

/** Busca en el CRM por nombre, email, teléfono o NIF. */
export async function buscarEnCRM(texto) {
  return invocar('teamleader-cliente', { accion: 'buscar', texto });
}

/** Se trae a la app un cliente que ya estaba en el CRM. */
export async function importarDelCRM(tlId, tipo) {
  return invocar('teamleader-cliente', { accion: 'importar', tl_id: tlId, tipo });
}

/** Mira si han entrado clientes nuevos por la web (sql/etapa32). */
export async function buscarLeadsWeb(dias) {
  return invocar('teamleader-leads', dias ? { dias } : {});
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

/** Borra una visita con sus fotos. Las fichas y los adjuntos van en cascada. */
export async function borrarVisitaConFotos(id) {
  const rutas = await rutasFotos(id);
  if (rutas.length) {
    try { await supabase.storage.from('visitas').remove(rutas); } catch (_) { /* huérfana */ }
  }
  await borrarVisita(id, true);
  const queda = unwrap(await supabase.from('visitas').select('id').eq('id', id)) || [];
  if (queda.length) {
    throw new Error('No se ha podido borrar: esa visita la hizo otra persona. Pídeselo a Administración.');
  }
  return true;
}

/** Lo que cuelga de un cliente AHORA MISMO, preguntado a la base. */
export async function loQueCuelgaDe(id) {
  const visitas = unwrap(await supabase.from('visitas').select('id, codigo, estado').eq('cliente_id', id)) || [];
  const citas = unwrap(await supabase.from('citas').select('id').eq('cliente_id', id)) || [];
  return { visitas: visitas.length, citas: citas.length, listaVisitas: visitas };
}

/**
 * Borra un cliente con todo lo suyo: sus visitas (con fichas y fotos) y sus
 * citas, que sí van en cascada.
 *
 * Las visitas hay que quitarlas a mano y ANTES: la base no las borra en cascada
 * a propósito, para que nadie se lleve por delante el trabajo de una visita sin
 * enterarse. Se preguntan a la base en este momento, no se fía de lo que
 * tuviera la pantalla cargado, que puede ser de hace rato.
 */
export async function borrarCliente(id) {
  const visitas = unwrap(await supabase.from('visitas').select('id').eq('cliente_id', id)) || [];
  for (const v of visitas) {
    const rutas = await rutasFotos(v.id);
    if (rutas.length) {
      // Si alguna foto no se deja borrar, se sigue: peor es dejar el cliente a
      // medio borrar que dejarse una foto suelta en el almacén.
      try { await supabase.storage.from('visitas').remove(rutas); } catch (_) { /* huérfana */ }
    }
    await borrarVisita(v.id, true);
  }

  // Comprobación: si alguna visita no se dejó borrar (por permisos), el borrado
  // del cliente fallaría con un error de la base que no dice nada. Mejor
  // contarlo aquí, que aquí se sabe por qué.
  const quedan = unwrap(await supabase.from('visitas').select('id').eq('cliente_id', id)) || [];
  if (quedan.length) {
    throw new Error('No se han podido borrar ' +
      (quedan.length === 1 ? 'una visita suya' : quedan.length + ' visitas suyas') +
      '. Suele ser porque las hizo otra persona: pídeselo a Administración.');
  }

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
