-- =============================================================================
-- Sysefen · Etapa 4 · Obras + asignaciones + elección de obra al fichar
-- =============================================================================
-- Ejecutar en: Supabase -> SQL Editor  (después de etapa2_seguridad.sql)
--
-- ÚNICO cambio de RLS que necesita esta etapa: permitir que un operario fiche
--   * sin obra  (obra_id IS NULL  ->  "Trabajo libre / Sin obra")
--   * o en una obra a la que ESTÁ asignado (obra_empleados)
-- y nunca en una obra ajena.
--
-- El resto de políticas de la Etapa 2 ya son correctas para obras y
-- obra_empleados (jefe/admin escriben; el operario solo ve lo asignado; nadie
-- se autoasigna). El trigger de fichajes de la Etapa 2 ya impide manipular
-- empleado_id / obra_id / horas en UPDATE desde el cliente. No se tocan.
--
-- Idempotente y no destructivo.
-- =============================================================================

begin;

drop policy if exists fichajes_insert on public.fichajes;

-- INSERT de fichajes:
--   jefe/admin: por cualquier empleado y en cualquier obra (o sin obra)
--   operario:   solo por sí mismo Y (sin obra  O  en obra asignada)
create policy fichajes_insert on public.fichajes
  for insert to authenticated
  with check (
    public.es_jefe()
    or (
      empleado_id = public.empleado_id_actual()
      and (
        obra_id is null
        or public.pertenece_a_obra(obra_id)
      )
    )
  );

commit;

-- Comprobación rápida (opcional):
--   select polname, cmd, qual, with_check
--     from pg_policies where schemaname='public' and tablename='fichajes';
