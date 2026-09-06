-- =============================================================================
-- Sysefen · Etapa · Imputación de horas
-- =============================================================================
-- Ejecutar en: Supabase -> SQL Editor
--   (después de etapa2_seguridad.sql y etapa4_obras_fichaje.sql)
--
-- Capa NUEVA e independiente. NO altera tablas ni políticas existentes.
--
-- REGLA INNEGOCIABLE:
--   Nada de este script hace UPDATE ni DELETE sobre public.fichajes.
--   fichajes      = presencia real e histórica (intocable desde esta capa)
--   imputaciones  = distribución / corrección administrativa de la jornada
--   partes        = resultado posterior (otra etapa)
--   Cualquier diferencia entre presencia e imputado se muestra como
--   "sin imputar" (calculado) y jamás se resuelve tocando el fichaje.
--
-- Reutiliza los helpers SECURITY DEFINER ya existentes de la Etapa 2:
--   public.es_jefe(), public.empleado_id_actual(), public.pertenece_a_obra(uuid)
--
-- Idempotente y no destructivo.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Tabla public.imputaciones
-- ---------------------------------------------------------------------------
create table if not exists public.imputaciones (
  id              uuid primary key default gen_random_uuid(),
  empleado_id     uuid not null references public.empleados(id) on delete restrict,
  fecha           date not null,
  categoria       text not null,
  obra_id         uuid references public.obras(id) on delete restrict,
  minutos         integer not null default 0,
  origen          text not null default 'auto',
  nota            text,
  bloqueado       boolean not null default false,
  creado_por      uuid references public.empleados(id) on delete restrict,
  actualizado_por uuid references public.empleados(id) on delete restrict,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint imputaciones_categoria_chk
    check (categoria in ('obra','despacho','preparacion','desplazamiento','otros')),
  constraint imputaciones_origen_chk
    check (origen in ('auto','manual')),
  constraint imputaciones_minutos_chk
    check (minutos >= 0 and minutos <= 1440),
  constraint imputaciones_obra_coherente_chk
    check (
      (categoria = 'obra' and obra_id is not null)
      or (categoria <> 'obra' and obra_id is null)
    )
);

-- Una línea por (empleado, fecha, categoría, obra). NULLS NOT DISTINCT para que
-- 'despacho' (obra_id NULL) sea único de verdad.  (PostgreSQL 15+, ya en Supabase)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'imputaciones_unica') then
    alter table public.imputaciones
      add constraint imputaciones_unica
      unique nulls not distinct (empleado_id, fecha, categoria, obra_id);
  end if;
end $$;

create index if not exists imputaciones_fecha_idx
  on public.imputaciones (fecha);
create index if not exists imputaciones_empleado_fecha_idx
  on public.imputaciones (empleado_id, fecha);
create index if not exists imputaciones_obra_idx
  on public.imputaciones (obra_id) where obra_id is not null;

-- ---------------------------------------------------------------------------
-- 2 · Trigger: sello de actualizado_en + protección de campos inmutables
-- ---------------------------------------------------------------------------
create or replace function public.imputaciones_before_update()
returns trigger
language plpgsql
as $$
begin
  -- inmutables: no se pueden reescribir en un UPDATE
  new.creado_en   := old.creado_en;
  new.creado_por  := old.creado_por;
  new.empleado_id := old.empleado_id;   -- una línea pertenece a un empleado/día;
  new.fecha       := old.fecha;         -- para "moverla" se borra y se crea otra
  -- sello de modificación (actualizado_por lo fija la app)
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists trg_imputaciones_before_update on public.imputaciones;
create trigger trg_imputaciones_before_update
  before update on public.imputaciones
  for each row execute function public.imputaciones_before_update();

-- ---------------------------------------------------------------------------
-- 3 · Vista v_presencia_diaria (SOLO LECTURA de fichajes)
-- ---------------------------------------------------------------------------
-- security_invoker => respeta la RLS de public.fichajes del usuario que consulta.
-- El día se calcula en hora local (Palma de Mallorca).
create or replace view public.v_presencia_diaria
with (security_invoker = true) as
select
  f.empleado_id,
  (f.entrada at time zone 'Europe/Madrid')::date as fecha,
  round(sum(extract(epoch from (coalesce(f.salida, now()) - f.entrada)) / 60.0))::int
    as minutos_presencia,
  count(*) filter (where f.salida is null) as fichajes_abiertos
from public.fichajes f
group by f.empleado_id, (f.entrada at time zone 'Europe/Madrid')::date;

-- ---------------------------------------------------------------------------
-- 4 · Función proponer_imputaciones(empleado, fecha)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: valida es_jefe() por dentro. SOLO LEE de fichajes.
--   * borra únicamente las líneas 'auto' NO bloqueadas de ese empleado/fecha
--   * reconstruye desde fichajes: tiempo por obra -> 'obra'; sin obra -> 'otros'
--   * NUNCA pisa líneas 'manual' ni 'bloqueado'
create or replace function public.proponer_imputaciones(p_empleado uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_jefe() then
    raise exception 'No autorizado: solo jefe/admin puede proponer imputaciones';
  end if;

  delete from public.imputaciones
   where empleado_id = p_empleado
     and fecha = p_fecha
     and origen = 'auto'
     and bloqueado = false;

  insert into public.imputaciones
    (empleado_id, fecha, categoria, obra_id, minutos, origen, creado_por, actualizado_por)
  select
    p_empleado,
    p_fecha,
    case when f.obra_id is not null then 'obra' else 'otros' end,
    f.obra_id,
    round(sum(extract(epoch from (coalesce(f.salida, now()) - f.entrada)) / 60.0))::int,
    'auto',
    null,
    null
  from public.fichajes f
  where f.empleado_id = p_empleado
    and (f.entrada at time zone 'Europe/Madrid')::date = p_fecha
  group by (case when f.obra_id is not null then 'obra' else 'otros' end), f.obra_id
  having round(sum(extract(epoch from (coalesce(f.salida, now()) - f.entrada)) / 60.0))::int > 0
  on conflict on constraint imputaciones_unica do update
     set minutos = excluded.minutos
   where public.imputaciones.origen = 'auto'
     and public.imputaciones.bloqueado = false;
end $$;

-- ---------------------------------------------------------------------------
-- 5 · RLS  (EXCLUSIVAMENTE sobre public.imputaciones)
-- ---------------------------------------------------------------------------
alter table public.imputaciones enable row level security;

grant select, insert, update, delete on public.imputaciones to authenticated;
grant select on public.v_presencia_diaria to authenticated;
grant execute on function public.proponer_imputaciones(uuid, date) to authenticated;

drop policy if exists imputaciones_select on public.imputaciones;
drop policy if exists imputaciones_insert on public.imputaciones;
drop policy if exists imputaciones_update on public.imputaciones;
drop policy if exists imputaciones_delete on public.imputaciones;

-- el empleado ve las suyas; jefe/admin ven todas
create policy imputaciones_select on public.imputaciones
  for select to authenticated
  using (public.es_jefe() or empleado_id = public.empleado_id_actual());

-- solo jefe/admin escriben; obra (si la hay) debe ser una obra suya; no bloqueada
create policy imputaciones_insert on public.imputaciones
  for insert to authenticated
  with check (
    public.es_jefe()
    and bloqueado = false
    and (obra_id is null or public.pertenece_a_obra(obra_id))
  );

create policy imputaciones_update on public.imputaciones
  for update to authenticated
  using (public.es_jefe() and bloqueado = false)
  with check (
    public.es_jefe()
    and (obra_id is null or public.pertenece_a_obra(obra_id))
  );

create policy imputaciones_delete on public.imputaciones
  for delete to authenticated
  using (public.es_jefe() and bloqueado = false);

commit;

-- Opcional (no imprescindible): Realtime para el control horario en vivo.
-- do $$
-- begin
--   if not exists (select 1 from pg_publication_tables
--                   where pubname='supabase_realtime' and schemaname='public'
--                     and tablename='imputaciones') then
--     alter publication supabase_realtime add table public.imputaciones;
--   end if;
-- end $$;

-- Comprobación rápida:
--   select * from public.v_presencia_diaria order by fecha desc limit 20;
--   select polname, cmd from pg_policies
--     where schemaname='public' and tablename='imputaciones';
