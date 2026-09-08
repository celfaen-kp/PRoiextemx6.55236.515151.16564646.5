-- =============================================================================
-- Sysefen · Etapa 13 · Archivo de documentos firmados, por empleado
--
-- PARA QUÉ:
--   Que cada planilla de horas firmada (y más adelante cada parte) quede
--   guardada sola, en la carpeta de su persona, sin depender de que alguien se
--   acuerde de exportar el PDF. Es el archivo que la ley obliga a conservar
--   cuatro años.
--
-- CÓMO SE ORGANIZA (dentro del bucket `documentos`):
--   planillas/jaime-mora/2026/planilla-jaime-mora-2026-08.pdf
--   partes/2026/PT-0908-BE3D.pdf
--   Rutas legibles a propósito: si algún día se replican a Drive o alguien las
--   mira desde el panel, se entienden sin abrir nada. El vínculo de verdad con
--   la persona lo guarda `empleado_id`, que no cambia aunque cambie el nombre.
--
-- QUIÉN VE QUÉ:
--   - Jefe y administración: todo.
--   - Cada trabajador: solo sus documentos.
--   - Borrar: solo administración (es un archivo legal, no un cajón).
--
-- OJO: esto prepara el sitio. Falta que la app genere el PDF; hoy lo fabrica el
-- móvil al imprimir y ese archivo no pasa por aquí.
--
-- Idempotente y no destructivo.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Almacén de documentos (privado)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · Índice de lo archivado
-- ---------------------------------------------------------------------------
create table if not exists public.documentos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('planilla', 'parte')),
  empleado_id uuid references public.empleados(id) on delete set null,
  parte_id    uuid references public.partes(id)    on delete set null,
  periodo     text,                       -- '2026-08' para planillas
  ruta        text not null unique,       -- ruta dentro del bucket `documentos`
  nombre      text,                       -- nombre legible para descargar
  bytes       integer,
  firmado     boolean not null default false,
  creado_por  uuid references public.empleados(id) on delete set null,
  creado_en   timestamptz not null default now()
);

-- Una planilla por persona y mes: si se vuelve a firmar, se reemplaza esa fila
-- en vez de acumular diez versiones del mismo mes.
create unique index if not exists documentos_planilla_uk
  on public.documentos (empleado_id, periodo)
  where tipo = 'planilla';

create index if not exists documentos_empleado_idx on public.documentos (empleado_id, creado_en desc);

alter table public.documentos enable row level security;

drop policy if exists documentos_select on public.documentos;
create policy documentos_select on public.documentos
  for select to authenticated
  using (public.es_jefe() or empleado_id = public.empleado_id_actual());

drop policy if exists documentos_insert on public.documentos;
create policy documentos_insert on public.documentos
  for insert to authenticated
  with check (public.es_jefe() or empleado_id = public.empleado_id_actual());

drop policy if exists documentos_update on public.documentos;
create policy documentos_update on public.documentos
  for update to authenticated
  using (public.es_jefe() or empleado_id = public.empleado_id_actual());

drop policy if exists documentos_delete on public.documentos;
create policy documentos_delete on public.documentos
  for delete to authenticated
  using (public.es_admin());

-- ---------------------------------------------------------------------------
-- 3 · Permisos sobre los archivos del almacén
-- ---------------------------------------------------------------------------
drop policy if exists documentos_archivos_select on storage.objects;
create policy documentos_archivos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos');

drop policy if exists documentos_archivos_insert on storage.objects;
create policy documentos_archivos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos');

drop policy if exists documentos_archivos_update on storage.objects;
create policy documentos_archivos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos');

drop policy if exists documentos_archivos_delete on storage.objects;
create policy documentos_archivos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and public.es_admin());

commit;

-- Comprobación rápida (opcional):
--   select id, public from storage.buckets where id in ('partes','documentos');
