-- =============================================================================
-- Sysefen · Etapa 90 · Documentos del cliente (la factura de la luz y lo que haga falta)
--
-- POR QUÉ (Enzo, 26 oct 2026):
--   El formulario de la web adjunta la factura de la luz, pero la guarda en el
--   servidor de la web (/private/facturas, cerrado) y la manda por correo: la
--   app solo veía el nombre. Hasta que la web la mande a la app, se sube desde
--   el correo a la ficha del cliente y queda ahí para presupuestar.
--
-- QUÉ HACE:
--   · Bucket privado `cliente-docs` y tabla public.cliente_documentos.
--   · Lo ven y suben presupuestos, jefes y Administración.
-- Idempotente.
-- =============================================================================

begin;

insert into storage.buckets (id, name, public) values ('cliente-docs', 'cliente-docs', false) on conflict (id) do nothing;

create table if not exists public.cliente_documentos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes_cache(id) on delete cascade,
  tipo        text not null default 'factura' check (tipo in ('factura', 'dni', 'escritura', 'plano', 'foto', 'otro')),
  nota        text,
  ruta        text not null unique,
  nombre      text,
  mime        text,
  bytes       integer,
  es_imagen   boolean not null default false,
  subido_por  uuid default public.empleado_id_actual(),
  creado_en   timestamptz not null default now()
);
create index if not exists cliente_documentos_cliente_idx on public.cliente_documentos (cliente_id, creado_en desc);
alter table public.cliente_documentos enable row level security;
drop policy if exists cliente_documentos_equipo on public.cliente_documentos;
create policy cliente_documentos_equipo on public.cliente_documentos
  for all to authenticated using (public.es_jefe() or public.es_presupuestos()) with check (public.es_jefe() or public.es_presupuestos());

drop policy if exists cliente_docs_select on storage.objects;
drop policy if exists cliente_docs_insert on storage.objects;
drop policy if exists cliente_docs_delete on storage.objects;
create policy cliente_docs_select on storage.objects for select to authenticated using (bucket_id = 'cliente-docs' and (public.es_jefe() or public.es_presupuestos()));
create policy cliente_docs_insert on storage.objects for insert to authenticated with check (bucket_id = 'cliente-docs' and (public.es_jefe() or public.es_presupuestos()));
create policy cliente_docs_delete on storage.objects for delete to authenticated using (bucket_id = 'cliente-docs' and (public.es_jefe() or public.es_presupuestos()));

commit;

-- COMPROBACIÓN
select id, public from storage.buckets where id = 'cliente-docs';
