begin;

-- Sysefen · Etapa 13 · Archivo de planillas firmadas (PDF)
-- Ruta de cada archivo:  planillas/<id del empleado>/<año>/<AAAA-MM>.pdf
-- Va por id y no por nombre: así los permisos pueden comprobar que la carpeta es
-- de quien la pide, y no se puede adivinar la ruta de otro. Los nombres legibles
-- los pone Make al copiarlas a Drive.

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create table if not exists public.documentos (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('planilla', 'parte')),
  empleado_id  uuid references public.empleados(id) on delete set null,
  periodo      text,
  ruta         text not null unique,
  nombre       text,
  bytes        integer,
  creado_por   uuid references public.empleados(id) on delete set null,
  creado_en    timestamptz not null default now(),
  exportado_en timestamptz,
  ref_externa  text
);

-- Una planilla por persona y mes: volver a firmar sustituye la anterior.
create unique index if not exists documentos_planilla_uk
  on public.documentos (empleado_id, periodo) where tipo = 'planilla';
create index if not exists documentos_pendientes_idx
  on public.documentos (creado_en) where exportado_en is null;

alter table public.documentos enable row level security;

drop policy if exists documentos_select on public.documentos;
create policy documentos_select on public.documentos for select to authenticated
  using (public.es_jefe() or empleado_id = public.empleado_id_actual());

drop policy if exists documentos_insert on public.documentos;
create policy documentos_insert on public.documentos for insert to authenticated
  with check (public.es_jefe() or empleado_id = public.empleado_id_actual());

drop policy if exists documentos_update on public.documentos;
create policy documentos_update on public.documentos for update to authenticated
  using (public.es_jefe() or empleado_id = public.empleado_id_actual())
  with check (public.es_jefe() or empleado_id = public.empleado_id_actual());

drop policy if exists documentos_delete on public.documentos;
create policy documentos_delete on public.documentos for delete to authenticated
  using (public.es_admin());

-- Archivos: jefe/admin, o el propio trabajador en SU carpeta.
drop policy if exists documentos_archivos_select on storage.objects;
create policy documentos_archivos_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (public.es_jefe()
    or (storage.foldername(name))[2] = public.empleado_id_actual()::text));

drop policy if exists documentos_archivos_insert on storage.objects;
create policy documentos_archivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (public.es_jefe()
    or (storage.foldername(name))[2] = public.empleado_id_actual()::text));

drop policy if exists documentos_archivos_update on storage.objects;
create policy documentos_archivos_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and (public.es_jefe()
    or (storage.foldername(name))[2] = public.empleado_id_actual()::text));

drop policy if exists documentos_archivos_delete on storage.objects;
create policy documentos_archivos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.es_admin());

commit;
