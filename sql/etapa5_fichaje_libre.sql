-- =============================================================================
-- Sysefen · Etapa 5 · Fichaje libre de obra + corrección de fichajes
-- =============================================================================
-- Ejecutar en: Supabase -> SQL Editor
--   (después de etapa2_seguridad.sql, etapa4_obras_fichaje.sql y etapa_imputaciones.sql)
--
-- Cambia SOLO lo necesario para el nuevo funcionamiento real:
--   * Una obra NO tiene "empleados autorizados". Cualquier empleado activo
--     puede fichar en cualquier obra (o sin obra). obra_empleados deja de
--     usarse para AUTORIZAR fichajes (la tabla NO se toca ni se borra).
--   * Jefe y admin pueden CORREGIR fichajes existentes (entrada y salida).
--     El operario sigue sin poder tocar fichajes ajenos ni reescribir su hora.
--   * Las imputaciones de categoría 'obra' pueden usar cualquier obra.
--
-- NO se debilita la seguridad del operario:
--   - solo puede fichar por SÍ MISMO
--   - no puede modificar fichajes de otros
--   - no puede borrar fichajes
--   - no puede tocar datos administrativos
--
-- Idempotente y no destructivo. No borra tablas ni datos.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · OBRAS: cualquier usuario autenticado puede LEER las obras
--     (necesario para elegir obra al fichar; escribir sigue siendo jefe/admin)
-- ---------------------------------------------------------------------------
drop policy if exists obras_select on public.obras;
create policy obras_select on public.obras
  for select to authenticated
  using (true);
-- (obras_insert / obras_update / obras_delete NO se tocan: siguen jefe/admin)

-- ---------------------------------------------------------------------------
-- 2 · FICHAJES · INSERT sin depender de obra_empleados
--     jefe/admin: por cualquier empleado, cualquier obra (o sin obra)
--     operario:   SOLO por sí mismo; cualquier obra abierta o sin obra
-- ---------------------------------------------------------------------------
drop policy if exists fichajes_insert on public.fichajes;
create policy fichajes_insert on public.fichajes
  for insert to authenticated
  with check (
    public.es_jefe()
    or empleado_id = public.empleado_id_actual()
  );

-- fichajes_select / fichajes_update / fichajes_delete NO cambian de forma:
--   select : es_jefe() OR empleado_id = empleado_id_actual()
--   update : es_jefe() OR empleado_id = empleado_id_actual()
--   delete : es_jefe()
-- Lo que cambia es el TRIGGER (abajo), que ahora deja corregir a jefe/admin.

-- ---------------------------------------------------------------------------
-- 3 · TRIGGER de hora de servidor / corrección de fichajes
--     - INSERT: la entrada la pone el servidor; nace abierto.
--     - UPDATE por operario: NO puede reescribir entrada, NI reasignar
--       empleado/obra; solo cerrar su fichaje (salida = hora del servidor);
--       no puede reabrir ni reescribir un fichaje ya cerrado.
--     - UPDATE por jefe/admin: corrección administrativa -> se respetan los
--       valores de entrada/salida que llegan (entrada nunca puede quedar NULL).
-- ---------------------------------------------------------------------------
create or replace function public.fichajes_hora_servidor()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    new.entrada := now();
    new.salida  := null;

  elsif (tg_op = 'UPDATE') then
    if public.es_jefe() then
      -- corrección por jefe/admin: se confían los valores recibidos
      if new.entrada is null then
        new.entrada := old.entrada;
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
-- 4 · IMPUTACIONES · categoría 'obra' con cualquier obra
--     (siguen escribiendo SOLO jefe/admin; se quita el filtro pertenece_a_obra)
--     REQUIERE haber ejecutado antes sql/etapa_imputaciones.sql.
-- ---------------------------------------------------------------------------
drop policy if exists imputaciones_insert on public.imputaciones;
create policy imputaciones_insert on public.imputaciones
  for insert to authenticated
  with check (public.es_jefe() and bloqueado = false);

drop policy if exists imputaciones_update on public.imputaciones;
create policy imputaciones_update on public.imputaciones
  for update to authenticated
  using (public.es_jefe() and bloqueado = false)
  with check (public.es_jefe());

-- imputaciones_select / imputaciones_delete NO se tocan.

commit;

-- ---------------------------------------------------------------------------
-- Comprobación rápida (opcional):
--   select polname, cmd, qual, with_check
--     from pg_policies
--    where schemaname='public' and tablename in ('obras','fichajes','imputaciones')
--    order by tablename, polname;
-- ---------------------------------------------------------------------------
