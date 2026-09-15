-- =============================================================================
-- Sysefen · Etapa 23 · Agenda de presupuestos: clientes y citas (fase A)
--
-- QUÉ SE MONTA:
--   - Tabla `citas`: el cliente, cuándo (o "sin fecha aún"), cuánto dura, quién
--     va, qué quiere presupuestar, dónde y en qué quedó.
--   - Columnas nuevas en `clientes_cache`: tipo, dirección, población, origen
--     y nota. El cliente se da de alta en la app antes de ir.
--   - `visitas.cita_id`: la visita sabe de qué cita salió.
--   - `empleados.email_avisos`: el correo real donde le llega a cada técnico
--     el aviso del día antes (los de acceso @sysefen.app no reciben correo).
--
-- PERMISOS:
--   - Ver citas: presupuestos, jefes y Administración (es_comercial()).
--   - Crear, cambiar y borrar citas: solo presupuestos (es_presupuestos()).
--
-- No toca fichajes, obras, imputaciones ni partes. Idempotente.
-- Requiere etapa20 (clientes_cache, visitas, es_comercial, es_presupuestos).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Clientes: lo que hace falta para citar
-- ---------------------------------------------------------------------------
alter table public.clientes_cache add column if not exists tipo text
  check (tipo in ('particular', 'empresa', 'comunidad'));
alter table public.clientes_cache add column if not exists direccion      text;
alter table public.clientes_cache add column if not exists poblacion      text;
alter table public.clientes_cache add column if not exists origen         text;
alter table public.clientes_cache add column if not exists nota           text;
alter table public.clientes_cache add column if not exists actualizado_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2 · Citas
-- ---------------------------------------------------------------------------
create table if not exists public.citas (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes_cache(id) on delete cascade,
  inicio           timestamptz,                         -- null = sin fecha aún
  duracion_min     int not null default 60 check (duracion_min between 15 and 480),
  empleado_id      uuid references public.empleados(id) on delete set null,  -- quién va
  categorias       text[] not null default '{}',
  direccion        text,
  poblacion        text,
  nota             text,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'visitada', 'no_estaba', 'anulada')),
  visita_id        uuid references public.visitas(id) on delete set null,
  aviso_enviado_at timestamptz,                         -- aviso del día antes ya mandado
  tl_event_id      text,                                -- fase C: evento en Teamleader
  creado_por       uuid default public.empleado_id_actual()
                   references public.empleados(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists citas_inicio_idx   on public.citas (inicio);
create index if not exists citas_cliente_idx  on public.citas (cliente_id);
create index if not exists citas_empleado_idx on public.citas (empleado_id, inicio);
create index if not exists citas_aviso_idx    on public.citas (inicio)
  where estado = 'pendiente' and aviso_enviado_at is null;

drop trigger if exists citas_updated_at on public.citas;
create trigger citas_updated_at
  before update on public.citas
  for each row execute function public.tocar_updated_at();

alter table public.citas enable row level security;

drop policy if exists citas_ver on public.citas;
create policy citas_ver on public.citas
  for select to authenticated
  using (public.es_comercial());

drop policy if exists citas_crear on public.citas;
create policy citas_crear on public.citas
  for insert to authenticated
  with check (public.es_presupuestos());

drop policy if exists citas_cambiar on public.citas;
create policy citas_cambiar on public.citas
  for update to authenticated
  using (public.es_presupuestos())
  with check (public.es_presupuestos());

drop policy if exists citas_borrar on public.citas;
create policy citas_borrar on public.citas
  for delete to authenticated
  using (public.es_presupuestos());

-- ---------------------------------------------------------------------------
-- 3 · La visita sabe de qué cita salió
-- ---------------------------------------------------------------------------
alter table public.visitas add column if not exists cita_id uuid
  references public.citas(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4 · Email real para los avisos de cada empleado
-- ---------------------------------------------------------------------------
-- Lo edita Administración desde Empleados (la política de update ya es solo
-- admin). No es el email de acceso: cambiarlo no afecta a la entrada con PIN.
alter table public.empleados add column if not exists email_avisos text;

commit;

-- Comprobación rápida (opcional):
--   select count(*) from public.citas;
--   select column_name from information_schema.columns
--    where table_name = 'clientes_cache' and column_name in ('tipo','direccion','poblacion');
