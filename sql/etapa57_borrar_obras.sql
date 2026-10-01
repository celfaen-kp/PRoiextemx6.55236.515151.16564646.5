-- =============================================================================
-- Sysefen · Etapa 57 · Borrar una obra (los jefes también)
--
-- POR QUÉ:
--   A veces se crea una obra dos veces. Hasta ahora solo se podía «cerrar», y
--   borrar estaba reservado a Administración. Como las obras las crean los
--   jefes, también pueden borrarlas.
--
-- QUÉ PROTEGE:
--   La app solo deja borrar una obra que no tenga partes, fichajes ni horas
--   imputadas: si tiene actividad, hay que cerrarla. Aquí, además, la base
--   se niega a borrar una obra con partes o fichajes aunque alguien se lo
--   pidiera por otro camino (antes esas filas quedaban colgando o se perdían).
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

drop policy if exists obras_delete on public.obras;
create policy obras_delete on public.obras
  for delete to authenticated
  using (public.es_jefe());

-- Partes y fichajes: una obra con actividad no se borra.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'partes' and column_name = 'obra_id') then
    alter table public.partes drop constraint if exists partes_obra_id_fkey;
    alter table public.partes add constraint partes_obra_id_fkey
      foreign key (obra_id) references public.obras(id) on delete restrict;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fichajes' and column_name = 'obra_id') then
    alter table public.fichajes drop constraint if exists fichajes_obra_id_fkey;
    alter table public.fichajes add constraint fichajes_obra_id_fkey
      foreign key (obra_id) references public.obras(id) on delete restrict;
  end if;
end $$;

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select conname, confdeltype from pg_constraint
--    where conrelid in ('public.partes'::regclass, 'public.fichajes'::regclass) and contype = 'f';
--   (confdeltype 'r' = restrict)
-- =============================================================================
