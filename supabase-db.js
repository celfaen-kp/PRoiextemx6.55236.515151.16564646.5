// Sysefen · Etapa 2
// Capa de acceso a datos sobre Supabase. Envoltorios finos alrededor de las
// tablas que YA existen. No cambia el esquema ni borra nada.
//
// Todavía NO reemplaza a localStorage en index.html (eso es Etapa 3).
// Se expone en window.Sysefen.db para integrarlo y probarlo por partes.
//
// NOTA DE ESQUEMA: se asume nomenclatura snake_case habitual de Supabase:
//   empleados(id, nombre, rol, activo, creado_en, user_id, email)
//   obras(id, ...)
//   obra_empleados(obra_id, empleado_id)
//   fichajes(id, empleado_id, obra_id, entrada, salida, ...)
//   partes(id, obra_id, ...)
//   parte_horas(id, parte_id, empleado_id, horas)
//   parte_materiales(id, parte_id, ...)
//   incidencias(id, obra_id | parte_id, ..., creada_en)   <- fecha: creada_en
// Fechas por confirmar en obras/partes (se asume `creado_en`); si difieren,
// ajusta los .order(...) de abajo.
// Si en tu proyecto alguna columna se llama distinto, ajústalo aquí y en
// sql/etapa2_seguridad.sql (mismo criterio en los dos sitios).

import { supabase } from './supabase-client.js';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/* ---------------- empleados ---------------- */

export async function listarEmpleados() {
  return unwrap(await supabase.from('empleados').select('*').order('creado_en', { ascending: true }));
}

// Alta de PERFIL de empleado (solo admin, por RLS). NO crea el usuario de Auth:
// eso es una acción administrativa segura aparte (ver sql/etapa7_...).
export async function crearEmpleado(datos) {
  return unwrap(await supabase.from('empleados').insert(datos).select().single());
}

export async function actualizarEmpleado(id, cambios) {
  return unwrap(await supabase.from('empleados').update(cambios).eq('id', id).select().single());
}

/* ---------------- obras ---------------- */

export async function listarObras() {
  return unwrap(await supabase.from('obras').select('*').order('creado_en', { ascending: false }));
}

export async function crearObra(obra) {
  return unwrap(await supabase.from('obras').insert(obra).select().single());
}

export async function actualizarObra(id, cambios) {
  return unwrap(await supabase.from('obras').update(cambios).eq('id', id).select().single());
}

export async function empleadosDeObra(obraId) {
  return unwrap(await supabase.from('obra_empleados').select('empleado_id').eq('obra_id', obraId));
}

// Todas las asignaciones visibles para el usuario (RLS las acota).
export async function listarAsignaciones() {
  return unwrap(await supabase.from('obra_empleados').select('obra_id, empleado_id'));
}

export async function asignarEmpleadoAObra(obraId, empleadoId) {
  return unwrap(await supabase.from('obra_empleados').insert({ obra_id: obraId, empleado_id: empleadoId }).select());
}

export async function quitarEmpleadoDeObra(obraId, empleadoId) {
  return unwrap(await supabase.from('obra_empleados').delete().eq('obra_id', obraId).eq('empleado_id', empleadoId).select());
}

/* ---------------- fichajes ---------------- */
// La hora de entrada/salida la pone PostgreSQL (trigger del SQL de Etapa 2).
// No hace falta enviar `entrada` ni `salida` desde el cliente.

export async function fichajeAbierto(empleadoId) {
  return unwrap(await supabase
    .from('fichajes').select('*')
    .eq('empleado_id', empleadoId).is('salida', null)
    .maybeSingle());
}

export async function ficharEntrada(empleadoId, obraId) {
  return unwrap(await supabase
    .from('fichajes')
    .insert({ empleado_id: empleadoId, obra_id: obraId })
    .select().single());
}

export async function ficharSalida(fichajeId) {
  return unwrap(await supabase
    .from('fichajes')
    .update({ salida: new Date().toISOString() }) // el trigger reescribe con now() del servidor
    .eq('id', fichajeId)
    .select().single());
}

// Corrección administrativa (solo jefe/admin, aplicado por RLS + trigger del
// servidor): a diferencia de ficharSalida, aquí SÍ se respetan los valores
// exactos de entrada/salida que se envían — es la vía para arreglar un
// fichaje mal cerrado o una salida olvidada con la hora real, no con "ahora".
export async function corregirFichaje(fichajeId, { entrada, salida }) {
  return unwrap(await supabase
    .from('fichajes')
    .update({ entrada, salida })
    .eq('id', fichajeId)
    .select().single());
}

export async function fichajesDelDia(dia) {
  const desde = dia + 'T00:00:00';
  const hasta = dia + 'T23:59:59.999';
  return unwrap(await supabase
    .from('fichajes').select('*')
    .gte('entrada', desde).lte('entrada', hasta)
    .order('entrada', { ascending: true }));
}

// Todos los fichajes visibles para el usuario (RLS los acota). `desde` opcional
// (ISO) para limitar el rango.
export async function listarFichajes(desde) {
  let q = supabase.from('fichajes').select('*').order('entrada', { ascending: true });
  if (desde) q = q.gte('entrada', desde);
  return unwrap(await q);
}

// Realtime: escucha altas/cambios en fichajes. cb(payload).
// Devuelve función para cancelar la suscripción.
export function escucharFichajes(cb) {
  const canal = supabase
    .channel('fichajes-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fichajes' }, cb)
    .subscribe();
  return () => supabase.removeChannel(canal);
}

/* ---------------- partes ---------------- */

export async function listarPartes(obraId) {
  let q = supabase.from('partes').select('*').order('creado_en', { ascending: false });
  if (obraId) q = q.eq('obra_id', obraId);
  return unwrap(await q);
}

export async function crearParte(parte) {
  return unwrap(await supabase.from('partes').insert(parte).select().single());
}

export async function actualizarParte(id, cambios) {
  return unwrap(await supabase.from('partes').update(cambios).eq('id', id).select().single());
}

export async function guardarHorasParte(parteId, filas) {
  const rows = filas.map((f) => ({ ...f, parte_id: parteId }));
  return unwrap(await supabase.from('parte_horas').insert(rows).select());
}

export async function guardarMaterialesParte(parteId, filas) {
  const rows = filas.map((f) => ({ ...f, parte_id: parteId }));
  return unwrap(await supabase.from('parte_materiales').insert(rows).select());
}

// Lectura de líneas de horas/materiales. Sin parteId, todas las visibles (RLS).
export async function listarHorasPartes(parteId) {
  let q = supabase.from('parte_horas').select('*');
  if (parteId) q = q.eq('parte_id', parteId);
  return unwrap(await q);
}

export async function listarMaterialesPartes(parteId) {
  let q = supabase.from('parte_materiales').select('*');
  if (parteId) q = q.eq('parte_id', parteId);
  return unwrap(await q);
}

/* ---------------- incidencias ---------------- */

export async function listarIncidencias() {
  // OJO: en `incidencias` la columna de fecha es `creada_en` (no `creado_en`).
  return unwrap(await supabase.from('incidencias').select('*').order('creada_en', { ascending: false }));
}

export async function crearIncidencia(inc) {
  return unwrap(await supabase.from('incidencias').insert(inc).select().single());
}

/* ---------------- imputaciones (capa de distribución/corrección de horas) ---------------- */
// Los fichajes NO se tocan aquí. La presencia sale de la vista v_presencia_diaria.

// Presencia (minutos) por empleado para una fecha (YYYY-MM-DD).
export async function presenciaDiaria(fecha) {
  return unwrap(await supabase
    .from('v_presencia_diaria')
    .select('empleado_id, minutos_presencia, fichajes_abiertos')
    .eq('fecha', fecha));
}

// Líneas de imputación. RLS acota: jefe/admin ven todas; el empleado, las suyas.
export async function listarImputaciones({ fecha, empleadoId } = {}) {
  let q = supabase.from('imputaciones').select('*')
    .order('empleado_id', { ascending: true })
    .order('categoria', { ascending: true });
  if (fecha) q = q.eq('fecha', fecha);
  if (empleadoId) q = q.eq('empleado_id', empleadoId);
  return unwrap(await q);
}

// Propuesta automática desde los fichajes (solo jefe/admin; valida en el servidor).
export async function proponerImputaciones(empleadoId, fecha) {
  const { error } = await supabase.rpc('proponer_imputaciones', { p_empleado: empleadoId, p_fecha: fecha });
  if (error) throw new Error(error.message);
}

// Guarda líneas: las que traen `id` se actualizan; las que no, se insertan.
export async function guardarImputaciones(filas) {
  const res = [];
  const nuevas = (filas || []).filter((f) => !f.id).map(({ id, ...r }) => r);
  if (nuevas.length) {
    res.push(...unwrap(await supabase.from('imputaciones').insert(nuevas).select()));
  }
  for (const f of (filas || []).filter((x) => x.id)) {
    const { id, empleado_id, fecha, creado_por, creado_en, ...campos } = f; // inmutables fuera
    res.push(unwrap(await supabase.from('imputaciones').update(campos).eq('id', id).select().single()));
  }
  return res;
}

export async function borrarImputacion(id) {
  return unwrap(await supabase.from('imputaciones').delete().eq('id', id).select());
}

export default {
  listarEmpleados, crearEmpleado, actualizarEmpleado,
  listarObras, crearObra, actualizarObra,
  empleadosDeObra, listarAsignaciones, asignarEmpleadoAObra, quitarEmpleadoDeObra,
  fichajeAbierto, ficharEntrada, ficharSalida, corregirFichaje, fichajesDelDia, listarFichajes, escucharFichajes,
  listarPartes, crearParte, actualizarParte, guardarHorasParte, guardarMaterialesParte,
  listarHorasPartes, listarMaterialesPartes,
  listarIncidencias, crearIncidencia,
  presenciaDiaria, listarImputaciones, proponerImputaciones, guardarImputaciones, borrarImputacion,
};
