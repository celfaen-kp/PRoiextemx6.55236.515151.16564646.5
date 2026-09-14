-- =============================================================================
-- Sysefen · Etapa 20 · Toma de datos para presupuestos
--
-- QUÉ SE MONTA:
--   Un módulo nuevo para que Ramón vaya a casa del cliente, rellene una ficha
--   por categoría (aerotermia, solar, electricidad, aire acondicionado) y esa
--   ficha acabe en Teamleader, que es donde se hace el presupuesto.
--
--   La app NO calcula precios. Guarda datos y los manda al CRM.
--
-- DECISIONES QUE EXPLICAN LAS TABLAS:
--   - El cuestionario de cada categoría cambia mucho y no se parece al de las
--     otras. Va en `datos jsonb` con `schema_version`, no en columnas. Así
--     añadir un campo es tocar visitas-schemas.js, no migrar la base.
--   - Lo que haga falta filtrar u ordenar (superficie, población, estado) sí
--     va en columnas de verdad.
--   - Los clientes NO son nuestros: mandan en Teamleader. `clientes_cache` es
--     una copia para poder buscar dentro de una casa sin cobertura.
--   - `sync_cola` existe para que un fallo del CRM nunca pierda una visita.
--
-- ROL NUEVO: 'presupuestos'. No ficha, no imputa horas, no ve obras.
--
-- Idempotente y no destructivo. Se puede ejecutar dos veces.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · El rol nuevo
-- ---------------------------------------------------------------------------
-- `empleados.rol` es text libre en esta base, así que no hay enum que tocar.
-- Se añade el helper que usan las políticas, al lado de es_admin() y es_jefe().

create or replace function public.es_presupuestos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() = 'presupuestos', false)
$$;

-- Quien toma datos o manda: el rol comercial del módulo.
create or replace function public.es_comercial()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() in ('presupuestos', 'jefe', 'admin'), false)
$$;

grant execute on function public.es_presupuestos(), public.es_comercial() to authenticated;


-- ---------------------------------------------------------------------------
-- 2 · Caché de clientes (el maestro es Teamleader)
-- ---------------------------------------------------------------------------
create table if not exists public.clientes_cache (
  id               uuid primary key default gen_random_uuid(),
  tl_id            text unique,      -- null = creado sin conexión, aún no está en TL
  tl_tipo          text check (tl_tipo in ('contact', 'company')),
  nombre           text not null,
  nif              text,
  telefono         text,
  email            text,
  direccion_fiscal text,
  pendiente_alta   boolean not null default false,
  sincronizado_at  timestamptz,
  creado_por       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now()
);

comment on table public.clientes_cache is
  'Copia local de contactos de Teamleader. No guardar aquí datos que solo vivan en la app: si un dato del cliente importa, su sitio es el CRM.';


-- ---------------------------------------------------------------------------
-- 3 · Visitas (la cabecera: una dirección, un día, un técnico)
-- ---------------------------------------------------------------------------
create table if not exists public.visitas (
  id              uuid primary key default gen_random_uuid(),
  codigo          text unique,
  cliente_id      uuid references public.clientes_cache(id),
  tecnico_id      uuid not null references auth.users(id) default auth.uid(),
  fecha_visita    date not null default current_date,
  hora_inicio     time,
  hora_fin        time,

  -- emplazamiento
  direccion       text,
  poblacion       text,
  cp              text,
  lat             numeric,
  lng             numeric,
  tipo_inmueble   text check (tipo_inmueble in
                  ('unifamiliar','adosado','piso','atico','local','nave','comunidad')),
  superficie_m2   numeric,
  plantas         int,
  habitaciones    int,
  banos           int,
  anio_construccion int,
  ocupantes       int,

  -- acceso y logística
  acceso          text check (acceso in ('facil','medio','dificil')),
  acceso_notas    text,
  necesita_grua   boolean not null default false,
  necesita_andamio boolean not null default false,

  -- comercial
  origen          text,
  plazo_deseado   text,
  interesa_financiacion boolean not null default false,
  interesa_subvencion   boolean not null default false,

  estado          text not null default 'borrador'
                  check (estado in ('borrador','completada','archivada')),
  observaciones   text,

  -- enlace con Teamleader
  tl_deal_id      text,
  tl_deal_fase    text,             -- espejo de solo lectura, nunca se edita aquí
  sync_estado     text not null default 'pendiente'
                  check (sync_estado in ('pendiente','enviando','sincronizada','error')),
  sync_error      text,
  sync_at         timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 4 · Fichas por categoría (el cuestionario)
-- ---------------------------------------------------------------------------
create table if not exists public.visita_fichas (
  id             uuid primary key default gen_random_uuid(),
  visita_id      uuid not null references public.visitas(id) on delete cascade,
  categoria      text not null check (categoria in
                 ('aerotermia','solar','electricidad','aire_acondicionado')),
  schema_version int not null default 1,
  datos          jsonb not null default '{}'::jsonb,
  completada     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (visita_id, categoria)
);

comment on column public.visita_fichas.schema_version is
  'Con qué versión de visitas-schemas.js se tomó el dato. No borrar versiones viejas: las fichas antiguas se leen con la suya.';


-- ---------------------------------------------------------------------------
-- 5 · Adjuntos (bucket privado, como los partes)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('visitas', 'visitas', false)
on conflict (id) do nothing;

create table if not exists public.visita_adjuntos (
  id           uuid primary key default gen_random_uuid(),
  visita_id    uuid not null references public.visitas(id) on delete cascade,
  ficha_id     uuid references public.visita_fichas(id) on delete cascade,
  tipo         text check (tipo in ('foto','audio','documento','factura')),
  storage_path text not null,
  campo_ref    text,              -- a qué campo acompaña: 'cuadro_electrico'
  descripcion  text,
  tl_file_id   text,              -- id del fichero ya subido al deal
  created_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 6 · Cola de sincronización con Teamleader
-- ---------------------------------------------------------------------------
-- Una fila por llamada a la API. Es lo que hace que la integración sea
-- reintentable y que se pueda ver POR QUÉ falló algo, en vez de perderlo.
create table if not exists public.sync_cola (
  id              bigserial primary key,
  visita_id       uuid references public.visitas(id) on delete cascade,
  operacion       text not null check (operacion in
                  ('crear_contacto','crear_empresa','crear_deal',
                   'subir_fichero','crear_nota','actualizar_campos')),
  payload         jsonb not null,
  idempotency_key text unique not null,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','procesando','ok','error','descartada')),
  intentos        int not null default 0,
  ultimo_error    text,
  proximo_intento timestamptz not null default now(),
  respuesta       jsonb,
  created_at      timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 7 · Credenciales de Teamleader
-- ---------------------------------------------------------------------------
-- Fila única. RLS activada y SIN NINGUNA POLICY a propósito: así nadie con la
-- anon key la toca. Solo la llave service_role, desde la edge function.
--
-- Los tokens de Teamleader NO pueden pisar el navegador nunca. La PWA es
-- código público: cualquier credencial que llegue al cliente está regalada.
create table if not exists public.tl_oauth (
  id             int primary key default 1 check (id = 1),
  access_token   text not null,
  refresh_token  text not null,
  expira_at      timestamptz not null,
  actualizado_at timestamptz not null default now()
);

alter table public.tl_oauth enable row level security;


-- ---------------------------------------------------------------------------
-- 8 · updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists visitas_updated_at on public.visitas;
create trigger visitas_updated_at
  before update on public.visitas
  for each row execute function public.tocar_updated_at();

drop trigger if exists visita_fichas_updated_at on public.visita_fichas;
create trigger visita_fichas_updated_at
  before update on public.visita_fichas
  for each row execute function public.tocar_updated_at();


-- ---------------------------------------------------------------------------
-- 9 · Código de visita: V-2026-0001
-- ---------------------------------------------------------------------------
create sequence if not exists public.visitas_codigo_seq;

create or replace function public.poner_codigo_visita()
returns trigger
language plpgsql
as $$
begin
  if new.codigo is null then
    new.codigo := 'V-' || to_char(now(), 'YYYY') || '-' ||
                  lpad(nextval('public.visitas_codigo_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists visitas_codigo on public.visitas;
create trigger visitas_codigo
  before insert on public.visitas
  for each row execute function public.poner_codigo_visita();


-- ---------------------------------------------------------------------------
-- 10 · Índices
-- ---------------------------------------------------------------------------
create index if not exists visitas_tecnico_estado_idx on public.visitas (tecnico_id, estado);
create index if not exists visitas_cliente_idx        on public.visitas (cliente_id);
create index if not exists visitas_fecha_idx          on public.visitas (fecha_visita desc);
create index if not exists visitas_sync_idx           on public.visitas (sync_estado)
  where sync_estado in ('pendiente', 'error');
create index if not exists sync_cola_pendientes_idx   on public.sync_cola (estado, proximo_intento);
create index if not exists clientes_cache_nif_idx     on public.clientes_cache (nif);
create index if not exists clientes_cache_tel_idx     on public.clientes_cache (telefono);
create index if not exists visita_fichas_datos_idx    on public.visita_fichas using gin (datos);


-- ---------------------------------------------------------------------------
-- 11 · Permisos (RLS)
-- ---------------------------------------------------------------------------
-- Criterio: el rol 'presupuestos' ve LO SUYO y nada más. Jefe y admin, todo.
-- Al rol 'presupuestos' no se le da ninguna policy en fichajes, obras,
-- imputaciones ni partes: con no dársela, ya no ve nada de eso.

alter table public.clientes_cache enable row level security;
alter table public.visitas        enable row level security;
alter table public.visita_fichas  enable row level security;
alter table public.visita_adjuntos enable row level security;
alter table public.sync_cola      enable row level security;

-- Clientes: los comparten los tres roles comerciales.
drop policy if exists clientes_cache_comercial on public.clientes_cache;
create policy clientes_cache_comercial on public.clientes_cache
  for all to authenticated
  using (public.es_comercial())
  with check (public.es_comercial());

-- Visitas: las suyas, o todas si es jefe/admin.
drop policy if exists visitas_propias on public.visitas;
create policy visitas_propias on public.visitas
  for all to authenticated
  using (tecnico_id = auth.uid() or public.es_jefe())
  with check (tecnico_id = auth.uid() or public.es_jefe());

-- Fichas y adjuntos: cuelgan del permiso de su visita.
drop policy if exists visita_fichas_por_visita on public.visita_fichas;
create policy visita_fichas_por_visita on public.visita_fichas
  for all to authenticated
  using (exists (select 1 from public.visitas v
                  where v.id = visita_fichas.visita_id
                    and (v.tecnico_id = auth.uid() or public.es_jefe())))
  with check (exists (select 1 from public.visitas v
                       where v.id = visita_fichas.visita_id
                         and (v.tecnico_id = auth.uid() or public.es_jefe())));

drop policy if exists visita_adjuntos_por_visita on public.visita_adjuntos;
create policy visita_adjuntos_por_visita on public.visita_adjuntos
  for all to authenticated
  using (exists (select 1 from public.visitas v
                  where v.id = visita_adjuntos.visita_id
                    and (v.tecnico_id = auth.uid() or public.es_jefe())))
  with check (exists (select 1 from public.visitas v
                       where v.id = visita_adjuntos.visita_id
                         and (v.tecnico_id = auth.uid() or public.es_jefe())));

-- La cola la escribe el backend. El usuario solo mira la suya, para saber
-- qué está pendiente y qué falló.
drop policy if exists sync_cola_lectura on public.sync_cola;
create policy sync_cola_lectura on public.sync_cola
  for select to authenticated
  using (exists (select 1 from public.visitas v
                  where v.id = sync_cola.visita_id
                    and (v.tecnico_id = auth.uid() or public.es_jefe())));


-- ---------------------------------------------------------------------------
-- 12 · Storage: quién toca el bucket 'visitas'
-- ---------------------------------------------------------------------------
drop policy if exists visitas_storage_ver on storage.objects;
create policy visitas_storage_ver on storage.objects
  for select to authenticated
  using (bucket_id = 'visitas' and public.es_comercial());

drop policy if exists visitas_storage_subir on storage.objects;
create policy visitas_storage_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'visitas' and public.es_comercial());

drop policy if exists visitas_storage_borrar on storage.objects;
create policy visitas_storage_borrar on storage.objects
  for delete to authenticated
  using (bucket_id = 'visitas' and public.es_jefe());

commit;


-- =============================================================================
-- COMPROBACIONES (ejecutar sueltas después, no van dentro del begin/commit)
-- =============================================================================
-- ¿Están las tablas?
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('clientes_cache','visitas','visita_fichas',
--                         'visita_adjuntos','sync_cola','tl_oauth');
--
-- ¿El bucket es privado?
--   select id, public from storage.buckets where id = 'visitas';
--
-- Dar el rol a Ramón (cambia el email):
--   update public.empleados set rol = 'presupuestos'
--    where email = 'ramon@sysefen.app';
--
-- Probar que una visita coge código sola:
--   insert into public.visitas (direccion, poblacion) values ('Prueba', 'Palma')
--   returning codigo;
-- =============================================================================
