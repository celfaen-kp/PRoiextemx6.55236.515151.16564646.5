-- =============================================================================
-- Sysefen · Etapa 60 · Planificación diaria: quién va mañana a qué obra
--                      (Etapa C del plan PLAN-OBRAS-PLANIFICACION.md)
--
-- QUÉ RESUELVE:
--   Hasta ahora «quién va mañana a dónde» se decía de palabra o por WhatsApp.
--   Ahora hay un tablero semanal: filas = personas (operarios y jefes),
--   columnas = días; en cada casilla, las obras a las que va esa persona ese
--   día. Lo escribe todo comercial (presupuestos, jefes, Administración).
--   Cada operario ve solo lo suyo. A las 19:00 cada uno recibe por correo su
--   planificación de mañana, y los comerciales un repaso: quién no tiene obra
--   y qué obras en curso no tienen a nadie.
--
--   Decidido con Enzo el 2 de octubre de 2026: se planifica por PERSONAS
--   sueltas (no por equipos fijos) y en el tablero salen operarios y jefes.
--
-- QUÉ SE AÑADE:
--   · planificacion: una fila por persona, obra y día (turno, hora, nota).
--     Distinta de obra_empleados, que sigue siendo la asignación permanente.
--   · planificado_en_obra(obra): ¿estoy planificado ahí hoy o en la última
--     semana? Con eso el operario ve la obra y sus partes aunque no esté en
--     obra_empleados (obras_select y partes_select se amplían).
--   · v_planificacion_dia: las filas con código de obra, cliente, dirección,
--     categorías y nombre, para pintar el tablero de una consulta.
--   · v_obras_sin_planificar(fecha): obras en marcha sin nadie ese día.
--   · Tarea programada «planificacion-manana» (19:00 Madrid en verano, 18:00
--     en invierno) que llama a recordatorio-citas con
--     {"planificacion_manana": true}. Requiere la versión de esa función del
--     2 de octubre de 2026 o posterior.
--
-- ANTES DE DARLE A RUN: sustituye CAMBIA_ESTA_CLAVE (abajo del todo) por el
-- mismo AVISOS_CLAVE de las otras tareas. No lo guardes en Git.
--
-- Requiere las etapas 58 y 59. Idempotente.
-- =============================================================================

begin;

-- 1 · La tabla ----------------------------------------------------------------------
create table if not exists public.planificacion (
  id            uuid primary key default gen_random_uuid(),
  obra_id       uuid not null references public.obras(id) on delete cascade,
  empleado_id   uuid not null references public.empleados(id) on delete cascade,
  fecha         date not null,
  turno         text not null default 'dia' check (turno in ('dia', 'manana', 'tarde')),
  hora_prevista time,
  nota          text,
  creado_por    uuid default public.empleado_id_actual() references public.empleados(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (empleado_id, fecha, obra_id)
);
create index if not exists planificacion_fecha_emp_idx on public.planificacion (fecha, empleado_id);
create index if not exists planificacion_obra_fecha_idx on public.planificacion (obra_id, fecha);

drop trigger if exists planificacion_updated_at on public.planificacion;
create trigger planificacion_updated_at before update on public.planificacion
  for each row execute function public.tocar_updated_at();

-- 2 · ¿Estoy planificado en esa obra? (hoy o en los últimos 7 días) ------------------
create or replace function public.planificado_en_obra(p_obra uuid, p_dia date default current_date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.planificacion p
     where p.obra_id = p_obra
       and p.empleado_id = public.empleado_id_actual()
       and p.fecha between p_dia - 7 and p_dia + 1
  )
$$;
grant execute on function public.planificado_en_obra(uuid, date) to authenticated;

-- 3 · Permisos ------------------------------------------------------------------------
alter table public.planificacion enable row level security;

drop policy if exists planificacion_select on public.planificacion;
create policy planificacion_select on public.planificacion
  for select to authenticated
  using (public.es_comercial() or empleado_id = public.empleado_id_actual());

drop policy if exists planificacion_insert on public.planificacion;
create policy planificacion_insert on public.planificacion
  for insert to authenticated with check (public.es_comercial());
drop policy if exists planificacion_update on public.planificacion;
create policy planificacion_update on public.planificacion
  for update to authenticated using (public.es_comercial()) with check (public.es_comercial());
drop policy if exists planificacion_delete on public.planificacion;
create policy planificacion_delete on public.planificacion
  for delete to authenticated using (public.es_comercial());

-- El planificado ve la obra y sus partes aunque no esté en obra_empleados.
drop policy if exists obras_select on public.obras;
create policy obras_select on public.obras
  for select to authenticated
  using (public.es_comercial() or public.pertenece_a_obra(id) or public.planificado_en_obra(id));

drop policy if exists partes_select on public.partes;
create policy partes_select on public.partes
  for select to authenticated
  using (public.es_comercial() or public.pertenece_a_obra(obra_id) or public.planificado_en_obra(obra_id));

-- 4 · Las vistas para pintar el tablero --------------------------------------------------
create or replace view public.v_planificacion_dia
with (security_invoker = true) as
select p.id, p.fecha, p.turno, p.hora_prevista, p.nota, p.empleado_id, p.obra_id, p.creado_por, p.created_at,
       e.nombre                      as empleado,
       e.rol                         as empleado_rol,
       o.numero,
       public.codigo_obra(o.numero)  as codigo,
       o.nombre                      as obra,
       o.cliente,
       o.direccion,
       o.poblacion,
       o.categorias,
       o.estado                      as obra_estado,
       c.nombre                      as planificador
  from public.planificacion p
  join public.empleados e on e.id = p.empleado_id
  join public.obras o on o.id = p.obra_id
  left join public.empleados c on c.id = p.creado_por;

-- Obras en marcha sin nadie en una fecha. Se consulta con:
--   select * from v_obras_sin_planificar where fecha = '2026-10-03'
-- (la vista enumera los próximos 14 días para no necesitar una función).
create or replace view public.v_obras_sin_planificar
with (security_invoker = true) as
select d.fecha, o.id as obra_id, o.numero, public.codigo_obra(o.numero) as codigo, o.nombre as obra,
       o.cliente, o.direccion, o.poblacion, o.categorias, o.estado
  from public.obras o
 cross join (select (current_date + g)::date as fecha from generate_series(0, 14) g) d
 where o.estado in ('planificada', 'en_curso')
   and public.es_comercial()
   and not exists (select 1 from public.planificacion p where p.obra_id = o.id and p.fecha = d.fecha);

grant select on public.v_planificacion_dia, public.v_obras_sin_planificar to authenticated;

commit;

-- =============================================================================
-- 5 · Tarea programada: la planificación de mañana, por correo
--     17:00 UTC = 19:00 en Mallorca en verano, 18:00 en invierno.
-- =============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'planificacion-manana';

select cron.schedule(
  'planificacion-manana',
  '0 17 * * *',
  $$
  select net.http_post(
    url     := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/recordatorio-citas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', 'CAMBIA_ESTA_CLAVE'),
    body    := '{"planificacion_manana": true}'::jsonb
  );
  $$
);

-- =============================================================================
-- COMPROBACIÓN
--   select * from public.v_planificacion_dia where fecha >= current_date order by fecha, empleado;
--   select codigo, cliente from public.v_obras_sin_planificar where fecha = current_date + 1;
--   select jobname, schedule, active from cron.job where jobname = 'planificacion-manana';
-- =============================================================================
