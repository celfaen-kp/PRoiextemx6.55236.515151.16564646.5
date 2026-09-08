-- =============================================================================
-- Sysefen · Etapa 12 · Las fotos de los partes se guardan de verdad
--
-- QUÉ ESTABA PASANDO:
--   Las fotos que se adjuntaban a un parte no se guardaban en NINGÚN sitio.
--   No hay columna para ellas en `partes`; `save()` excluye los partes del
--   almacenamiento del móvil; y al recargar, cada parte se reconstruía con
--   `adjuntos: []`. Vivían solo en la memoria de esa sesión: si el operario
--   imprimía el PDF en ese momento salían, y si cerraba la app se perdían para
--   siempre, sin avisar a nadie.
--
-- QUÉ SE MONTA:
--   - Un bucket PRIVADO `partes` en Supabase Storage para los archivos.
--     Privado a propósito: son fotos de obras de clientes. Se ven con enlaces
--     firmados que caducan, no con una URL pública que valga para cualquiera.
--   - Una tabla `parte_adjuntos` que guarda la ruta del archivo y sus datos.
--
-- PERMISOS (mismo criterio que el resto de la app):
--   - Ver: cualquiera que pueda ver el parte (RLS de `partes` manda).
--   - Subir: quien puede crear partes (jefe/admin o el autor del parte).
--   - Borrar: jefe/admin.
--
-- Idempotente y no destructivo.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Bucket de archivos (privado)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('partes', 'partes', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · Tabla de adjuntos
-- ---------------------------------------------------------------------------
create table if not exists public.parte_adjuntos (
  id         uuid primary key default gen_random_uuid(),
  parte_id   uuid not null references public.partes(id) on delete cascade,
  ruta       text not null unique,          -- ruta dentro del bucket `partes`
  nombre     text,                          -- nombre original del archivo
  tipo       text,                          -- image/jpeg, application/pdf…
  bytes      integer,
  es_imagen  boolean not null default true,
  creado_en  timestamptz not null default now()
);

create index if not exists parte_adjuntos_parte_idx on public.parte_adjuntos (parte_id);

alter table public.parte_adjuntos enable row level security;

-- Se ven los adjuntos de los partes que ya se pueden ver: en vez de repetir
-- aquí la regla de visibilidad, se pregunta por el parte y manda su RLS.
drop policy if exists parte_adjuntos_select on public.parte_adjuntos;
create policy parte_adjuntos_select on public.parte_adjuntos
  for select to authenticated
  using (exists (select 1 from public.partes p where p.id = parte_id));

drop policy if exists parte_adjuntos_insert on public.parte_adjuntos;
create policy parte_adjuntos_insert on public.parte_adjuntos
  for insert to authenticated
  with check (exists (
    select 1 from public.partes p
     where p.id = parte_id
       and (public.es_jefe() or p.autor_id = public.empleado_id_actual())
  ));

drop policy if exists parte_adjuntos_delete on public.parte_adjuntos;
create policy parte_adjuntos_delete on public.parte_adjuntos
  for delete to authenticated
  using (public.es_jefe());

-- ---------------------------------------------------------------------------
-- 3 · Permisos sobre los archivos del bucket
--     (storage.objects ya tiene RLS activado por Supabase)
-- ---------------------------------------------------------------------------
drop policy if exists partes_archivos_select on storage.objects;
create policy partes_archivos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'partes');

drop policy if exists partes_archivos_insert on storage.objects;
create policy partes_archivos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'partes');

drop policy if exists partes_archivos_delete on storage.objects;
create policy partes_archivos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'partes' and public.es_jefe());

commit;

-- Comprobación rápida (opcional):
--   select id, public from storage.buckets where id = 'partes';
--   select polname, cmd from pg_policies
--    where tablename in ('parte_adjuntos','objects') and schemaname in ('public','storage');
