-- =============================================================================
-- Sysefen · Etapa 14 · Capa de salida de horas (para Make → Teamleader u otros)
--
-- PARA QUÉ:
--   Que un automatismo externo pueda leer las horas sin conocer el esquema por
--   dentro, sin la clave maestra, y sin volver a mandar lo que ya mandó.
--
-- QUÉ AÑADE:
--   1. Referencias externas: `ref_externa` en empleados, obras e imputaciones,
--      para guardar el id que esos registros tienen en el otro sistema. Sin
--      esto, Make no sabe a qué proyecto ni a qué usuario de Teamleader
--      corresponde cada línea, y hay que adivinarlo por el nombre.
--   2. `exportado_en` en imputaciones: cuándo se envió por última vez. Es lo que
--      evita duplicar horas si un escenario se reintenta.
--   3. Dos vistas de salida, ya masticadas:
--        v_horas_export      -> una fila por imputación (horas POR OBRA)
--        v_jornadas_export   -> una fila por empleado y día (horas REALES)
--   4. Un rol de solo lectura para el automatismo, sin acceso a nada más.
--
-- DECISIÓN IMPORTANTE:
--   Las vistas NO llevan security_invoker: se ejecutan con los permisos de su
--   dueño, así que ven todo. Por eso NO se conceden a `authenticated` — un
--   operario podría leer las horas de todos y saltarse las políticas. Solo las
--   ve el rol de integración, que no puede hacer nada más.
--
-- Idempotente y no destructivo.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Referencias al sistema externo
-- ---------------------------------------------------------------------------
-- Las vistas de abajo usan `nombre_completo`, que llega con la Etapa 11. Se
-- añade aquí también para que este archivo se pueda ejecutar suelto y en
-- cualquier orden: si la Etapa 11 ya pasó, esta línea no hace nada.
alter table public.empleados    add column if not exists nombre_completo text;
alter table public.empleados    add column if not exists fecha_alta      date;

alter table public.empleados    add column if not exists ref_externa text;
alter table public.obras        add column if not exists ref_externa text;
alter table public.imputaciones add column if not exists ref_externa text;
alter table public.imputaciones add column if not exists exportado_en timestamptz;

comment on column public.empleados.ref_externa is
  'Id de esta persona en el sistema externo (p. ej. usuario de Teamleader).';
comment on column public.obras.ref_externa is
  'Id de esta obra en el sistema externo (p. ej. proyecto de Teamleader).';
comment on column public.imputaciones.ref_externa is
  'Id de la línea de tiempo creada en el sistema externo. Lo escribe el automatismo.';
comment on column public.imputaciones.exportado_en is
  'Última vez que esta línea se envió fuera. NULL = pendiente de enviar.';

-- Para que Make pida solo lo cambiado desde la última vez.
create index if not exists imputaciones_actualizado_idx
  on public.imputaciones (actualizado_en);
create index if not exists imputaciones_pendientes_idx
  on public.imputaciones (exportado_en) where exportado_en is null;

-- ---------------------------------------------------------------------------
-- 2 · Horas POR OBRA / categoría (lo que se manda como tiempo de proyecto)
-- ---------------------------------------------------------------------------
create or replace view public.v_horas_export as
select
  i.id                                   as imputacion_id,
  i.fecha,
  i.categoria,
  i.minutos,
  round(i.minutos / 60.0, 2)             as horas,
  i.nota,
  i.origen,
  i.bloqueado,

  e.id                                   as empleado_id,
  e.nombre                               as empleado,
  e.nombre_completo                      as empleado_completo,
  e.email                                as empleado_email,
  e.ref_externa                          as empleado_ref,

  o.id                                   as obra_id,
  coalesce(o.cliente, o.nombre)          as obra_cliente,
  o.nombre                               as obra_nombre,
  o.direccion                            as obra_direccion,
  o.ref_externa                          as obra_ref,

  i.creado_en,
  i.actualizado_en,
  i.exportado_en,
  i.ref_externa,
  (i.exportado_en is null or i.exportado_en < i.actualizado_en) as pendiente
from public.imputaciones i
join public.empleados e on e.id = i.empleado_id
left join public.obras o on o.id = i.obra_id;

comment on view public.v_horas_export is
  'Horas repartidas por obra/categoría, listas para enviar fuera. `pendiente` = aún no enviada o cambiada después del último envío.';

-- ---------------------------------------------------------------------------
-- 3 · Jornadas REALES por empleado y día (el registro legal)
--     Incluye cuánto de esa jornada está repartido y cuánto queda suelto: es
--     lo que dice si el dato de proyecto está completo o a medias.
-- ---------------------------------------------------------------------------
create or replace view public.v_jornadas_export as
select
  p.fecha,
  e.id                                   as empleado_id,
  e.nombre                               as empleado,
  e.nombre_completo                      as empleado_completo,
  e.email                                as empleado_email,
  e.ref_externa                          as empleado_ref,
  p.minutos_presencia                    as minutos_reales,
  round(p.minutos_presencia / 60.0, 2)   as horas_reales,
  coalesce(im.minutos_imputados, 0)      as minutos_imputados,
  round(coalesce(im.minutos_imputados, 0) / 60.0, 2) as horas_imputadas,
  p.minutos_presencia - coalesce(im.minutos_imputados, 0) as minutos_sin_repartir
from public.v_presencia_diaria p
join public.empleados e on e.id = p.empleado_id
left join (
  select empleado_id, fecha, sum(minutos) as minutos_imputados
    from public.imputaciones
   group by empleado_id, fecha
) im on im.empleado_id = p.empleado_id and im.fecha = p.fecha;

comment on view public.v_jornadas_export is
  'Una fila por empleado y día trabajado: horas reales de fichaje y cuánto de eso está repartido por obra.';

-- ---------------------------------------------------------------------------
-- 4 · Rol de solo lectura para el automatismo
--
--     >>> CAMBIA 'PON_AQUI_UNA_CLAVE_LARGA' POR UNA CLAVE TUYA ANTES DE
--     >>> EJECUTAR. No la guardes en el repositorio: va solo en Make.
--
--     Este rol NO puede escribir, NO ve las tablas, y solo alcanza las dos
--     vistas de arriba. Si algún día se filtra, lo peor que se puede hacer con
--     él es leer horas.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sysefen_integracion') then
    create role sysefen_integracion login password 'PON_AQUI_UNA_CLAVE_LARGA';
  end if;
end $$;

grant usage on schema public to sysefen_integracion;
grant select on public.v_horas_export    to sysefen_integracion;
grant select on public.v_jornadas_export to sysefen_integracion;

-- Para que pueda marcar lo ya enviado y guardar el id externo (y NADA más).
-- `select (id)` hace falta porque sin poder leer el id no puede ni localizar la
-- fila que va a marcar. No se le da lectura del resto de columnas.
grant select (id) on public.imputaciones to sysefen_integracion;
grant update (exportado_en, ref_externa) on public.imputaciones to sysefen_integracion;

-- Nada de `force row level security` aquí: forzaría RLS también al dueño de la
-- tabla y dejaría fuera a los triggers y funciones SECURITY DEFINER que validan
-- las imputaciones. RLS ya está activo y se aplica a este rol de todos modos.
drop policy if exists imputaciones_marcar_export on public.imputaciones;
create policy imputaciones_marcar_export on public.imputaciones
  for update to sysefen_integracion
  using (true) with check (true);

commit;

-- Comprobación rápida (opcional):
--   select count(*) filter (where pendiente) as pendientes, count(*) as total
--     from public.v_horas_export;
--   select * from public.v_jornadas_export order by fecha desc limit 10;

-- =============================================================================
-- CÓMO SE CONECTA MAKE (a decidir cuando llegue el momento)
--
-- Opción A · módulo PostgreSQL de Make, con el rol de arriba.
--   Host/puerto salen de Supabase → Settings → Database. Ojo: la conexión
--   directa del plan gratuito puede ser solo IPv6; si Make no llega, hay que
--   usar el "pooler" (Supavisor), donde el usuario se escribe
--   sysefen_integracion.<ref-del-proyecto>. Conviene probarlo antes de montar
--   el escenario entero.
--
-- Opción B · módulo HTTP contra la API REST, entrando con una cuenta de la app.
--   No necesita rol nuevo ni conexión directa, pero Make guardaría un PIN.
--   Para esta vía haría falta además una función SECURITY DEFINER que
--   devolviera las filas, porque las vistas de arriba no se conceden a
--   `authenticated` a propósito.
--
-- EL CICLO, EN CUALQUIERA DE LAS DOS:
--   1. leer   -> select * from v_horas_export where pendiente
--   2. enviar -> crear la línea de tiempo en Teamleader
--   3. marcar -> update imputaciones
--                   set exportado_en = now(), ref_externa = '<id de Teamleader>'
--                 where id = '<imputacion_id>'
--   El paso 3 es el que impide mandar dos veces las mismas horas. Si se salta,
--   cada ejecución vuelve a subirlo todo.
-- =============================================================================
