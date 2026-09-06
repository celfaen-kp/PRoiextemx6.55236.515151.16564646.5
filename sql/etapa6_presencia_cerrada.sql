-- =============================================================================
-- Sysefen · Etapa 6 · Presencia = solo fichajes CERRADOS · Imputación acotada
-- =============================================================================
-- Ejecutar en: Supabase -> SQL Editor
--   (después de etapa2, etapa4, etapa_imputaciones y etapa5)
--
-- Reglas DEFINITIVAS que implementa este script:
--   * El fichaje NO tiene obra. La presencia se calcula SOLO de fichajes con
--     entrada y salida (jornada terminada). Un fichaje abierto no cuenta.
--   * No se puede imputar más tiempo que la presencia real de ese empleado/día.
--   * No se puede imputar si la presencia de ese empleado/día es 0.
--   * La imputación NO deriva automáticamente a ninguna obra: la decide el jefe.
--
-- Idempotente y NO destructivo. No borra tablas ni datos. No toca obra_empleados.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · v_presencia_diaria  ->  SOLO fichajes cerrados
-- ---------------------------------------------------------------------------
create or replace view public.v_presencia_diaria
with (security_invoker = true) as
select
  f.empleado_id,
  (f.entrada at time zone 'Europe/Madrid')::date as fecha,
  round(sum(extract(epoch from (f.salida - f.entrada)) / 60.0))::int as minutos_presencia,
  count(*) filter (where f.salida is null) as fichajes_abiertos
from public.fichajes f
where f.salida is not null                         -- <<< solo jornadas terminadas
group by f.empleado_id, (f.entrada at time zone 'Europe/Madrid')::date;

grant select on public.v_presencia_diaria to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Helper: minutos de presencia CERRADA de un empleado en un día
--     SECURITY DEFINER -> lo puede usar el trigger aunque el que guarda sea
--     un jefe imputando la jornada de OTRO empleado.
-- ---------------------------------------------------------------------------
create or replace function public.presencia_minutos_dia(p_empleado uuid, p_fecha date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round(sum(extract(epoch from (f.salida - f.entrada)) / 60.0))::int, 0)
    from public.fichajes f
   where f.empleado_id = p_empleado
     and f.salida is not null
     and (f.entrada at time zone 'Europe/Madrid')::date = p_fecha
$$;

grant execute on function public.presencia_minutos_dia(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · Trigger: una imputación nunca puede superar la presencia del día
-- ---------------------------------------------------------------------------
create or replace function public.imputaciones_no_superar_presencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_presencia int;
  v_total     int;
begin
  v_presencia := public.presencia_minutos_dia(new.empleado_id, new.fecha);

  if v_presencia <= 0 then
    raise exception 'No hay jornada fichada y cerrada para ese empleado el %; no se puede imputar.', new.fecha;
  end if;

  select coalesce(sum(minutos), 0) into v_total
    from public.imputaciones
   where empleado_id = new.empleado_id
     and fecha = new.fecha
     and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_total := v_total + coalesce(new.minutos, 0);

  if v_total > v_presencia then
    raise exception 'La imputación total (% min) supera la presencia del día (% min).', v_total, v_presencia;
  end if;

  return new;
end $$;

drop trigger if exists trg_imputaciones_no_superar_presencia on public.imputaciones;
create trigger trg_imputaciones_no_superar_presencia
  before insert or update on public.imputaciones
  for each row execute function public.imputaciones_no_superar_presencia();

-- ---------------------------------------------------------------------------
-- 4 · proponer_imputaciones -> ya NO deriva a obra automáticamente
--     Deja UNA sola línea 'otros' = presencia cerrada, para que el jefe
--     la reparta. Sigue respetando líneas 'manual'/'bloqueado'.
-- ---------------------------------------------------------------------------
create or replace function public.proponer_imputaciones(p_empleado uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_presencia int;
begin
  if not public.es_jefe() then
    raise exception 'No autorizado: solo jefe/admin puede proponer imputaciones';
  end if;

  delete from public.imputaciones
   where empleado_id = p_empleado and fecha = p_fecha
     and origen = 'auto' and bloqueado = false;

  v_presencia := public.presencia_minutos_dia(p_empleado, p_fecha);
  if v_presencia <= 0 then
    return;
  end if;

  -- solo si el empleado no tiene ninguna línea ya
  if not exists (select 1 from public.imputaciones
                  where empleado_id = p_empleado and fecha = p_fecha) then
    insert into public.imputaciones
      (empleado_id, fecha, categoria, obra_id, minutos, origen, creado_por, actualizado_por)
    values (p_empleado, p_fecha, 'otros', null, v_presencia, 'auto', null, null);
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- 5 · DIAGNÓSTICO de imputaciones incoherentes ya existentes
--     (NO borra nada. Ejecuta este SELECT para revisarlas a mano.)
-- ---------------------------------------------------------------------------
-- Imputaciones cuyo total del día supera (o no tiene) presencia cerrada:
--
-- select i.empleado_id, e.nombre, i.fecha,
--        sum(i.minutos)                                   as imputado_min,
--        public.presencia_minutos_dia(i.empleado_id, i.fecha) as presencia_min
--   from public.imputaciones i
--   join public.empleados e on e.id = i.empleado_id
--  group by i.empleado_id, e.nombre, i.fecha
-- having sum(i.minutos) > public.presencia_minutos_dia(i.empleado_id, i.fecha)
--     or public.presencia_minutos_dia(i.empleado_id, i.fecha) = 0
--  order by i.fecha desc;
--
-- Para borrar UNA fila concreta tras revisarla:
--   delete from public.imputaciones where id = '<id>';
-- ---------------------------------------------------------------------------
