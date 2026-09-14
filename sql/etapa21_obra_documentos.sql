-- =============================================================================
-- Sysefen · Etapa 21 · Albaranes y recibos de cada obra (control interno)
--
-- QUÉ SE MONTA:
--   - Un bucket PRIVADO `obra-docs` para las fotos y PDF de albaranes,
--     recibos y facturas de proveedor. Privado: son gastos de la empresa.
--   - Una tabla `obra_documentos` con el tipo, proveedor, importe y fecha de
--     cada documento, colgada de su obra.
--
-- PERMISOS:
--   Solo jefe y Administración (es_jefe() incluye admin) ven, suben y borran.
--   Los operarios no ven nada de esto.
--
-- No toca ninguna tabla existente. Idempotente: se puede ejecutar dos veces.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Bucket de archivos (privado)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('obra-docs', 'obra-docs', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · Tabla
-- ---------------------------------------------------------------------------
create table if not exists public.obra_documentos (
  id          uuid primary key default gen_random_uuid(),
  obra_id     uuid not null references public.obras(id) on delete cascade,
  tipo        text not null default 'albaran'
              check (tipo in ('albaran', 'recibo', 'factura', 'otro')),
  proveedor   text,
  importe     numeric(12, 2),
  fecha       date not null default current_date,
  nota        text,
  ruta        text not null unique,         -- ruta dentro del bucket `obra-docs`
  nombre      text,                         -- nombre original del archivo
  mime        text,
  bytes       integer,
  es_imagen   boolean not null default true,
  subido_por  uuid default public.empleado_id_actual(),
  creado_en   timestamptz not null default now()
);

create index if not exists obra_documentos_obra_idx on public.obra_documentos (obra_id, fecha desc);

alter table public.obra_documentos enable row level security;

drop policy if exists obra_documentos_jefe on public.obra_documentos;
create policy obra_documentos_jefe on public.obra_documentos
  for all to authenticated
  using (public.es_jefe())
  with check (public.es_jefe());

-- ---------------------------------------------------------------------------
-- 3 · Permisos sobre los archivos del bucket
-- ---------------------------------------------------------------------------
drop policy if exists obra_docs_select on storage.objects;
create policy obra_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'obra-docs' and public.es_jefe());

drop policy if exists obra_docs_insert on storage.objects;
create policy obra_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'obra-docs' and public.es_jefe());

drop policy if exists obra_docs_delete on storage.objects;
create policy obra_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'obra-docs' and public.es_jefe());

commit;

-- Comprobación rápida (opcional):
--   select id, public from storage.buckets where id = 'obra-docs';
--   select count(*) from public.obra_documentos;
