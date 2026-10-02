-- =============================================================================
-- Sysefen · Etapa 62 · El operario hace el parte de cualquier obra
--
-- POR QUÉ:
--   La etapa 61 solo dejaba al operario crear el parte de la obra en la que
--   estaba planificado. Enzo no lo quiere así (2 oct 2026): la obra
--   planificada le sale ya puesta, pero si de imprevisto van a otra, el parte
--   de esa otra lo hacen con total libertad. La app le avisa de que no era su
--   obra del día y le pregunta si está seguro; nada más. El parte queda
--   marcado fuera_de_plan y el planificador lo ve en el tablero (eso sigue).
--
-- Requiere la etapa 61. Idempotente.
-- =============================================================================

begin;

drop policy if exists partes_insert on public.partes;
create policy partes_insert on public.partes
  for insert to authenticated
  with check (public.es_comercial() or autor_id = public.empleado_id_actual());

-- Para poder hacer el parte tiene que ver la obra: todas las abiertas.
drop policy if exists obras_select on public.obras;
create policy obras_select on public.obras
  for select to authenticated
  using (public.es_comercial() or public.pertenece_a_obra(id) or public.planificado_en_obra(id)
         or coalesce(estado, '') in ('planificada', 'en_curso'));

commit;
