-- =============================================================================
-- Sysefen · Etapa 61 · El parte nace de la obra planificada; partes fuera de plan
--                      (Etapa D del plan PLAN-OBRAS-PLANIFICACION.md)
--
-- QUÉ RESUELVE:
--   · El operario planificado en una obra puede hacer el parte de ese día él
--     mismo, desde la tarjeta «Hoy vas a»: la obra, la fecha y sus horas ya
--     vienen puestas; él escribe los trabajos y los materiales. Hasta ahora
--     solo jefes y Administración podían crear partes.
--   · Cada parte recuerda de qué asignación nació (planificacion_id). Si se
--     guarda un parte en una obra en la que esa persona NO estaba planificada
--     ese día, queda marcado fuera_de_plan y sale en el tablero para que el
--     planificador lo revise: «era correcto, mover la planificación» o
--     «ignorar».
--   · Al guardar el primer parte de una obra «planificada», la obra pasa sola
--     a «en curso».
--
-- Requiere la etapa 60. Idempotente. No toca ningún dato.
-- =============================================================================

begin;

-- 1 · Columnas nuevas del parte --------------------------------------------------
alter table public.partes add column if not exists planificacion_id uuid references public.planificacion(id) on delete set null;
alter table public.partes add column if not exists fuera_de_plan boolean not null default false;
alter table public.partes add column if not exists fuera_de_plan_revisado_at timestamptz;
alter table public.partes add column if not exists categoria text;
alter table public.partes drop constraint if exists partes_categoria_valida;
alter table public.partes add constraint partes_categoria_valida check (categoria is null or categoria in ('AE', 'FV', 'AC'));

comment on column public.partes.planificacion_id is 'La asignación del tablero de la que nació el parte (null si se hizo por libre).';
comment on column public.partes.fuera_de_plan   is 'El autor no estaba planificado en esa obra ese día. Lo revisa el planificador en el tablero.';
comment on column public.partes.categoria       is 'A qué categoría de la obra corresponde el parte (AE/FV/AC). Null = toda la obra.';

-- 2 · Al crear el parte: enlazarlo con su asignación y marcar si está fuera de plan
create or replace function public.parte_desde_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  if new.autor_id is null then return new; end if;
  if new.planificacion_id is null then
    select p.id into new.planificacion_id from public.planificacion p
     where p.empleado_id = new.autor_id and p.obra_id = new.obra_id and p.fecha = new.fecha
     order by p.created_at limit 1;
  end if;
  -- Fuera de plan: sin asignación en esa obra ese día, y además la persona es
  -- operario o estaba planificada en OTRA obra ese día. Un jefe que hace un
  -- parte de una obra sin tener nada planificado no es un caso raro: no se marca.
  if new.planificacion_id is null then
    select rol into v_rol from public.empleados where id = new.autor_id;
    new.fuera_de_plan := (v_rol = 'operario')
      or exists (select 1 from public.planificacion p where p.empleado_id = new.autor_id and p.fecha = new.fecha);
  else
    new.fuera_de_plan := false;
  end if;
  return new;
end;
$$;
drop trigger if exists partes_desde_plan on public.partes;
create trigger partes_desde_plan
  before insert on public.partes
  for each row execute function public.parte_desde_plan();

-- 3 · El primer parte arranca la obra -------------------------------------------------
create or replace function public.obra_arranca_con_parte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.obras set estado = 'en_curso' where id = new.obra_id and estado = 'planificada';
  return new;
end;
$$;
drop trigger if exists partes_arrancan_obra on public.partes;
create trigger partes_arrancan_obra
  after insert on public.partes
  for each row execute function public.obra_arranca_con_parte();

-- 4 · Permisos: el planificado (o asignado fijo) crea el parte de SU obra ------------
drop policy if exists partes_insert on public.partes;
create policy partes_insert on public.partes
  for insert to authenticated
  with check (
    public.es_comercial()
    or (autor_id = public.empleado_id_actual()
        and (public.pertenece_a_obra(obra_id) or public.planificado_en_obra(obra_id, fecha)))
  );

-- El autor puede corregir su parte mientras no se haya enviado ni anulado.
drop policy if exists partes_update on public.partes;
create policy partes_update on public.partes
  for update to authenticated
  using (public.es_comercial() or (autor_id = public.empleado_id_actual() and coalesce(estado, '') not in ('enviado', 'anulado')))
  with check (public.es_comercial() or autor_id = public.empleado_id_actual());

-- Las líneas del parte: quien puede con el parte, puede con sus líneas.
create or replace function public.parte_es_mio(p_parte uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.partes p where p.id = p_parte and p.autor_id = public.empleado_id_actual()
                    and coalesce(p.estado, '') not in ('enviado', 'anulado'))
$$;
grant execute on function public.parte_es_mio(uuid) to authenticated;

drop policy if exists parte_horas_insert on public.parte_horas;
create policy parte_horas_insert on public.parte_horas
  for insert to authenticated with check (public.es_comercial() or public.parte_es_mio(parte_id));
drop policy if exists parte_horas_update on public.parte_horas;
create policy parte_horas_update on public.parte_horas
  for update to authenticated using (public.es_comercial() or public.parte_es_mio(parte_id)) with check (public.es_comercial() or public.parte_es_mio(parte_id));
drop policy if exists parte_horas_delete on public.parte_horas;
create policy parte_horas_delete on public.parte_horas
  for delete to authenticated using (public.es_comercial() or public.parte_es_mio(parte_id));

drop policy if exists parte_materiales_insert on public.parte_materiales;
create policy parte_materiales_insert on public.parte_materiales
  for insert to authenticated with check (public.es_comercial() or public.parte_es_mio(parte_id));
drop policy if exists parte_materiales_update on public.parte_materiales;
create policy parte_materiales_update on public.parte_materiales
  for update to authenticated using (public.es_comercial() or public.parte_es_mio(parte_id)) with check (public.es_comercial() or public.parte_es_mio(parte_id));
drop policy if exists parte_materiales_delete on public.parte_materiales;
create policy parte_materiales_delete on public.parte_materiales
  for delete to authenticated using (public.es_comercial() or public.parte_es_mio(parte_id));

-- Adjuntos: la de insertar ya admite al autor (etapa 12); borrar, también.
drop policy if exists parte_adjuntos_delete on public.parte_adjuntos;
create policy parte_adjuntos_delete on public.parte_adjuntos
  for delete to authenticated using (public.es_comercial() or public.parte_es_mio(parte_id));

-- 5 · Lo que el planificador tiene que revisar -----------------------------------------
create or replace view public.v_partes_fuera_de_plan
with (security_invoker = true) as
select p.id, p.fecha, p.obra_id, p.autor_id, p.creado_en,
       e.nombre as autor, public.codigo_obra(o.numero) as codigo, o.cliente, o.nombre as obra, o.poblacion,
       (select string_agg(public.codigo_obra(o2.numero), ', ')
          from public.planificacion pl join public.obras o2 on o2.id = pl.obra_id
         where pl.empleado_id = p.autor_id and pl.fecha = p.fecha) as planificado_en
  from public.partes p
  join public.obras o on o.id = p.obra_id
  left join public.empleados e on e.id = p.autor_id
 where p.fuera_de_plan and p.fuera_de_plan_revisado_at is null
   and coalesce(p.estado, '') <> 'anulado'
   and p.fecha >= current_date - 14
   and public.es_comercial();
grant select on public.v_partes_fuera_de_plan to authenticated;

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select codigo, autor, fecha, planificado_en from public.v_partes_fuera_de_plan;
--   select public.codigo_obra(numero), estado from public.obras where estado = 'planificada';
-- =============================================================================
