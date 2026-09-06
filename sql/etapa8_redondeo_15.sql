-- =============================================================================
-- Sysefen · Etapa 8 · Disponibilidad de imputación: redondeo al 15 MÁS CERCANO
-- =============================================================================
-- Ejecutar en: Supabase -> SQL Editor  (después de etapa7)
--
-- Cambia UNA sola función: `disponible_imputar_minutos`. Antes redondeaba la
-- presencia cerrada HACIA ABAJO a 15 min; ahora al múltiplo de 15 MÁS CERCANO,
-- igual que la interfaz:
--     0-7 min   -> 0
--     8-22 min  -> 15
--     23-37 min -> 30
--     38-52 min -> 45
--     53-67 min -> 60   ...
--
-- Por qué: el cliente ya muestra/permite imputar hasta ese valor redondeado.
-- Sin este cambio, el trigger del servidor (que usa esta función) rechazaría
-- imputar esos 15 min "de más" cerca de un límite (p.ej. presencia real 0:39 ->
-- cliente permite 0:45, servidor bloqueaba a 0:30).
--
-- NO toca fichajes, ni la presencia real, ni la planilla, ni ninguna tabla.
-- Solo reemplaza el cuerpo de una función. Idempotente y no destructivo.
-- =============================================================================

create or replace function public.disponible_imputar_minutos(p_empleado uuid, p_fecha date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  -- redondeo al múltiplo de 15 más cercano de la presencia cerrada real
  select (round(public.presencia_minutos_dia(p_empleado, p_fecha)::numeric / 15) * 15)::int
$$;

grant execute on function public.disponible_imputar_minutos(uuid, date) to authenticated;

-- El trigger `imputaciones_no_superar_presencia` (etapa7) ya llama a esta
-- función, así que queda alineado automáticamente. No hace falta tocarlo.
