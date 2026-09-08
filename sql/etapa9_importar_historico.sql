-- =============================================================================
-- Sysefen · Etapa 9 · Alta administrativa de fichajes con hora real
--
-- POR QUÉ:
--   Hasta ahora el trigger ponía SIEMPRE `entrada = now()` al insertar, así que
--   un fichaje pasado había que crearlo y corregirlo en dos pasos. Para importar
--   el histórico (meses de registro de jornada anteriores a la app) eso son dos
--   peticiones por fila y ninguna garantía de que la segunda llegue.
--
-- QUÉ CAMBIA:
--   En INSERT, si quien escribe es jefe/admin Y manda `entrada`, se respetan
--   entrada y salida tal cual. Cualquier otro caso sigue igual que antes:
--   la entrada la pone el servidor y el fichaje nace abierto.
--
-- POR QUÉ NO ABRE UN AGUJERO:
--   jefe/admin YA podían fijar cualquier entrada/salida corrigiendo el fichaje
--   justo después (rama UPDATE de este mismo trigger, Etapa 5). Esto no les da
--   un permiso nuevo: les ahorra el segundo paso. El operario no puede.
--
-- ADEMÁS:
--   - Se rechaza salida <= entrada (producía días con horas negativas).
--   - Índice único (empleado_id, entrada): impide duplicar el histórico si la
--     importación se lanza dos veces con el mismo CSV.
--
-- Idempotente y no destructivo. No borra ni modifica ningún fichaje existente.
-- =============================================================================

begin;

create or replace function public.fichajes_hora_servidor()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    if public.es_jefe() and new.entrada is not null then
      -- Alta administrativa: importación del histórico o fichaje olvidado.
      -- Se confían los valores recibidos, igual que en la corrección.
      if new.salida is not null and new.salida <= new.entrada then
        raise exception 'La salida tiene que ser posterior a la entrada.';
      end if;
    else
      -- Fichaje normal: lo marca el reloj del servidor y nace abierto.
      new.entrada := now();
      new.salida  := null;
    end if;

  elsif (tg_op = 'UPDATE') then
    if public.es_jefe() then
      -- corrección por jefe/admin: se confían los valores recibidos
      if new.entrada is null then
        new.entrada := old.entrada;
      end if;
      if new.salida is not null and new.salida <= new.entrada then
        raise exception 'La salida tiene que ser posterior a la entrada.';
      end if;
      -- new.salida puede ser NULL (reabrir) o una fecha (corregir/cerrar)
    else
      -- operario
      new.entrada     := old.entrada;
      new.empleado_id := old.empleado_id;
      new.obra_id     := old.obra_id;
      if (old.salida is null and new.salida is not null) then
        new.salida := now();          -- cierre normal: hora del servidor
      else
        new.salida := old.salida;     -- no puede reabrir ni reescribir
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_fichajes_hora_servidor on public.fichajes;
create trigger trg_fichajes_hora_servidor
  before insert or update on public.fichajes
  for each row execute function public.fichajes_hora_servidor();

-- ---------------------------------------------------------------------------
-- Red de seguridad contra importar dos veces el mismo CSV.
-- Si ya hubiera duplicados de antes, el índice no se puede crear: en ese caso
-- avisa por consola y sigue, en vez de tumbar toda la migración.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    create unique index if not exists fichajes_empleado_entrada_uk
      on public.fichajes (empleado_id, entrada);
  exception when others then
    raise notice 'No se pudo crear fichajes_empleado_entrada_uk (%). Revisa duplicados con: select empleado_id, entrada, count(*) from public.fichajes group by 1,2 having count(*) > 1;', sqlerrm;
  end;
end $$;

commit;

-- Comprobación rápida (opcional):
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='fichajes';
