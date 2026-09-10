-- =============================================================================
-- Sysefen · Etapa 15 · Horas por OBRA y DÍA (lo que se manda a Teamleader)
--
-- Una fila por obra y día con el TOTAL de horas de todo el personal junto, sin
-- desglosar personas: en Teamleader entra como un único usuario. Quién hizo
-- cada hora se queda dentro, para el control interno y la planilla.
--
-- De dónde salen las horas, sin contar nada dos veces:
--   1. IMPUTACIONES de categoría 'obra'. Fuente principal: el servidor no deja
--      imputar más minutos de los fichados ese día, así que cuadran con la
--      jornada real.
--   2. PARTES de trabajo, solo para (persona, día, obra) SIN imputación. Sus
--      horas se escriben sin tope de presencia, por eso van detrás; pero si
--      alguien hizo parte y no imputó, no se pierden.
--
-- Vive en el esquema `integracion`, que la API no publica. Y aun así la tabla
-- lleva RLS: dar algo por seguro solo porque "nadie tiene permiso" es lo que
-- dejó las vistas de la etapa 14 abiertas a internet.
--
-- SIN bloques `do $$`: al pegarlo en el editor se cortaba y dejaba el bloque a
-- medias con un error que no señalaba la causa. Requiere que el rol
-- sysefen_integracion ya exista (etapa14b).
-- =============================================================================

begin;

create schema if not exists integracion;
revoke all on schema integracion from anon, authenticated, public;

create table if not exists integracion.export_obra_dia (
  obra_id             uuid not null references public.obras(id) on delete cascade,
  fecha               date not null,
  minutos_exportados  integer not null,
  ref_externa         text,
  exportado_en        timestamptz not null default now(),
  primary key (obra_id, fecha)
);

alter table integracion.export_obra_dia enable row level security;

create or replace view integracion.v_obra_dia as
with imp as (
  select obra_id, fecha, empleado_id, sum(minutos)::int as minutos
    from public.imputaciones
   where categoria = 'obra' and obra_id is not null
   group by obra_id, fecha, empleado_id
),
par as (
  select p.obra_id, p.fecha, ph.empleado_id, round(sum(ph.horas) * 60)::int as minutos
    from public.parte_horas ph
    join public.partes p on p.id = ph.parte_id
   where p.obra_id is not null and coalesce(p.estado, '') <> 'anulado'
   group by p.obra_id, p.fecha, ph.empleado_id
),
todo as (
  select obra_id, fecha, empleado_id, minutos, 'imputacion' as fuente from imp
  union all
  select par.obra_id, par.fecha, par.empleado_id, par.minutos, 'parte'
    from par
    left join imp on imp.obra_id = par.obra_id and imp.fecha = par.fecha
                 and imp.empleado_id = par.empleado_id
   where imp.obra_id is null
)
select
  t.obra_id,
  t.fecha,
  o.nombre                            as obra,
  o.direccion                         as obra_direccion,
  o.estado                            as obra_estado,
  o.ref_externa                       as obra_ref,
  sum(t.minutos)::int                 as minutos,
  round(sum(t.minutos) / 60.0, 2)     as horas,
  count(distinct t.empleado_id)::int  as personas,
  string_agg(distinct t.fuente, '+' order by t.fuente) as fuente,
  e.ref_externa,
  e.exportado_en,
  (e.minutos_exportados is null or e.minutos_exportados <> sum(t.minutos)::int) as pendiente
from todo t
join public.obras o on o.id = t.obra_id
left join integracion.export_obra_dia e on e.obra_id = t.obra_id and e.fecha = t.fecha
group by t.obra_id, t.fecha, o.nombre, o.direccion, o.estado, o.ref_externa,
         e.ref_externa, e.exportado_en, e.minutos_exportados;

grant usage on schema integracion to sysefen_integracion;
grant select on integracion.v_obra_dia to sysefen_integracion;
grant select, insert, update, delete on integracion.export_obra_dia to sysefen_integracion;

drop policy if exists export_obra_dia_integracion on integracion.export_obra_dia;
create policy export_obra_dia_integracion on integracion.export_obra_dia
  for all to sysefen_integracion using (true) with check (true);

commit;
