-- =============================================================================
-- Sysefen · Etapa 82 · Obras: comentarios, horas apuntadas a mano y albaranes para presupuestos
--
-- POR QUÉ (Enzo, 20 oct 2026):
--   · En la obra no se podía adjuntar un albarán desde una cuenta de
--     presupuestos: el botón salía (ve los costes) pero la tabla y el almacén
--     solo dejaban a jefes y Administración.
--   · Se quiere apuntar horas en una obra directamente, sin parte, para el
--     control propio. Las apunta jefe/Administración para cualquiera y la
--     persona de presupuestos para sí misma.
--   · Una casilla de comentarios libres en la ficha de la obra.
--
-- QUÉ HACE:
--   · obras.comentarios: texto libre de la obra.
--   · obra_documentos y el bucket obra-docs: también presupuestos (ver, subir, borrar).
--   · imputaciones: presupuestos puede insertar y cambiar sus propias líneas.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.obras add column if not exists comentarios text;
comment on column public.obras.comentarios is 'Comentarios libres de la obra (ficha de la obra).';

-- Albaranes y recibos: también presupuestos.
drop policy if exists obra_documentos_jefe on public.obra_documentos;
drop policy if exists obra_documentos_equipo on public.obra_documentos;
create policy obra_documentos_equipo on public.obra_documentos
  for all to authenticated
  using (public.es_jefe() or public.es_presupuestos())
  with check (public.es_jefe() or public.es_presupuestos());

drop policy if exists obra_docs_select on storage.objects;
drop policy if exists obra_docs_insert on storage.objects;
drop policy if exists obra_docs_delete on storage.objects;
create policy obra_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'obra-docs' and (public.es_jefe() or public.es_presupuestos()));
create policy obra_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'obra-docs' and (public.es_jefe() or public.es_presupuestos()));
create policy obra_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'obra-docs' and (public.es_jefe() or public.es_presupuestos()));

-- Horas apuntadas a mano por la persona de presupuestos, solo las suyas.
drop policy if exists imputaciones_insert_propias on public.imputaciones;
create policy imputaciones_insert_propias on public.imputaciones
  for insert to authenticated
  with check (
    public.es_presupuestos() and bloqueado = false
    and empleado_id = (select e.id from public.empleados e where e.user_id = auth.uid() limit 1)
  );
drop policy if exists imputaciones_update_propias on public.imputaciones;
create policy imputaciones_update_propias on public.imputaciones
  for update to authenticated
  using (public.es_presupuestos() and empleado_id = (select e.id from public.empleados e where e.user_id = auth.uid() limit 1))
  with check (public.es_presupuestos() and empleado_id = (select e.id from public.empleados e where e.user_id = auth.uid() limit 1));

commit;

-- COMPROBACIÓN
--   select policyname, cmd from pg_policies where tablename in ('obra_documentos', 'imputaciones') order by 1;
--   select policyname from pg_policies where schemaname = 'storage' and policyname like 'obra_docs%';
