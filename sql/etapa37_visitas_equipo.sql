-- =============================================================================
-- Sysefen · Etapa 37 · Las visitas son del equipo de presupuestos
--
-- POR QUÉ:
--   Hasta ahora cada visita solo la podía ver y cambiar quien la empezó (o un
--   jefe / Administración). Si otro de presupuestos quería terminar una visita
--   a medias, Supabase no le dejaba cambiarla sin decir nada; la app creía que
--   la visita no existía, intentaba crearla otra vez con el mismo número y
--   saltaba un error de "duplicado". Había que entrar con el usuario que la
--   empezó solo para darle a guardar.
--
--   Las citas ya eran de todo el equipo (etapa 23). Esto hace lo mismo con las
--   visitas, sus fichas y sus fotos.
--
-- QUIÉN PUEDE QUÉ (presupuestos, jefes y Administración = es_comercial()):
--   Ver y cambiar cualquier visita: todo el equipo.
--   Crear: cada uno a su nombre (no se puede crear una visita "de otro").
--   Borrar una visita: quien la empezó, jefes y Administración (como antes).
--   El autor de la visita (tecnico_id) no cambia al guardarla otro.
--
-- No toca ningún dato. Idempotente.
-- =============================================================================

begin;

drop policy if exists visitas_propias on public.visitas;
drop policy if exists visitas_ver     on public.visitas;
drop policy if exists visitas_crear   on public.visitas;
drop policy if exists visitas_cambiar on public.visitas;
drop policy if exists visitas_borrar  on public.visitas;

create policy visitas_ver on public.visitas
  for select to authenticated
  using (public.es_comercial());

create policy visitas_crear on public.visitas
  for insert to authenticated
  with check (public.es_comercial() and (tecnico_id = auth.uid() or public.es_jefe()));

create policy visitas_cambiar on public.visitas
  for update to authenticated
  using (public.es_comercial())
  with check (public.es_comercial());

create policy visitas_borrar on public.visitas
  for delete to authenticated
  using (tecnico_id = auth.uid() or public.es_jefe());

-- Fichas y fotos: cuelgan de su visita, y la visita ya es del equipo.
drop policy if exists visita_fichas_por_visita on public.visita_fichas;
create policy visita_fichas_por_visita on public.visita_fichas
  for all to authenticated
  using (public.es_comercial() and exists (select 1 from public.visitas v where v.id = visita_fichas.visita_id))
  with check (public.es_comercial() and exists (select 1 from public.visitas v where v.id = visita_fichas.visita_id));

drop policy if exists visita_adjuntos_por_visita on public.visita_adjuntos;
create policy visita_adjuntos_por_visita on public.visita_adjuntos
  for all to authenticated
  using (public.es_comercial() and exists (select 1 from public.visitas v where v.id = visita_adjuntos.visita_id))
  with check (public.es_comercial() and exists (select 1 from public.visitas v where v.id = visita_adjuntos.visita_id));

-- Y el estado del envío a Teamleader de cualquier visita del equipo.
drop policy if exists sync_cola_lectura on public.sync_cola;
create policy sync_cola_lectura on public.sync_cola
  for select to authenticated
  using (public.es_comercial() and exists (select 1 from public.visitas v where v.id = sync_cola.visita_id));

commit;

-- Comprobación rápida (opcional):
--   select polname, polcmd from pg_policy where polrelid = 'public.visitas'::regclass;
