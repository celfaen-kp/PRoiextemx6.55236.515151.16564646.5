-- =============================================================================
-- Sysefen · Etapa 36 · Material pendiente y notas del equipo
--
-- QUÉ SE MONTA:
--   Una lista común de lo que hace falta: comprar en la tienda o traer del
--   despacho. Cualquiera apunta ("3 sacos de cemento cola"), dice si es para
--   una obra y si es urgente. Otro se apunta a llevarlo ("lo llevo yo") para
--   que no lo compren dos. Cuando está, se tacha, y si era para una obra se le
--   puede poner lo que costó.
--
--   Lo tachado con obra queda como MATERIAL EXTRA de esa obra, aparte del
--   material de los partes: así lo que se va comprando sobre la marcha no se
--   escapa al contar lo que ha costado la obra.
--
--   Y notas sueltas para todos (escritas o dictadas).
--
-- QUIÉN PUEDE QUÉ:
--   Ver, apuntar, apuntarse a llevar y tachar: cualquiera con sesión. Es una
--   lista de equipo; si solo pudieran unos pocos, no serviría.
--   Borrar: quien lo apuntó, jefes y Administración.
--
-- No toca ningún dato existente. Idempotente.
-- =============================================================================

begin;

create table if not exists public.material_pedidos (
  id          uuid primary key default gen_random_uuid(),
  texto       text not null check (length(trim(texto)) > 0),
  tipo        text not null default 'comprar' check (tipo in ('comprar', 'despacho')),
  obra_id     uuid references public.obras(id) on delete set null,
  urgente     boolean not null default false,
  voz         boolean not null default false,
  pedido_por  uuid default public.empleado_id_actual() references public.empleados(id) on delete set null,
  creado_en   timestamptz not null default now(),
  lleva_id    uuid references public.empleados(id) on delete set null,
  hecho_en    timestamptz,
  hecho_por   uuid references public.empleados(id) on delete set null,
  importe     numeric(10,2) check (importe is null or importe >= 0)
);

create index if not exists material_pendiente_idx on public.material_pedidos (hecho_en nulls first, creado_en desc);
create index if not exists material_obra_idx on public.material_pedidos (obra_id) where obra_id is not null;

comment on table public.material_pedidos is
  'Lista común de material por comprar o traer del despacho. Lo tachado con obra cuenta como material extra de esa obra.';

create table if not exists public.notas_equipo (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null check (length(trim(texto)) > 0),
  obra_id    uuid references public.obras(id) on delete set null,
  voz        boolean not null default false,
  autor_id   uuid default public.empleado_id_actual() references public.empleados(id) on delete set null,
  creado_en  timestamptz not null default now()
);

create index if not exists notas_equipo_fecha_idx on public.notas_equipo (creado_en desc);

alter table public.material_pedidos enable row level security;
alter table public.notas_equipo     enable row level security;

-- ---------- material_pedidos ----------
drop policy if exists material_ver on public.material_pedidos;
create policy material_ver on public.material_pedidos
  for select to authenticated using (public.empleado_id_actual() is not null);

drop policy if exists material_apuntar on public.material_pedidos;
create policy material_apuntar on public.material_pedidos
  for insert to authenticated with check (public.empleado_id_actual() is not null);

drop policy if exists material_cambiar on public.material_pedidos;
create policy material_cambiar on public.material_pedidos
  for update to authenticated
  using (public.empleado_id_actual() is not null)
  with check (public.empleado_id_actual() is not null);

drop policy if exists material_borrar on public.material_pedidos;
create policy material_borrar on public.material_pedidos
  for delete to authenticated
  using (pedido_por = public.empleado_id_actual() or public.es_jefe());

-- ---------- notas_equipo ----------
drop policy if exists notas_ver on public.notas_equipo;
create policy notas_ver on public.notas_equipo
  for select to authenticated using (public.empleado_id_actual() is not null);

drop policy if exists notas_apuntar on public.notas_equipo;
create policy notas_apuntar on public.notas_equipo
  for insert to authenticated with check (public.empleado_id_actual() is not null);

drop policy if exists notas_borrar on public.notas_equipo;
create policy notas_borrar on public.notas_equipo
  for delete to authenticated
  using (autor_id = public.empleado_id_actual() or public.es_jefe());

commit;

-- Comprobación rápida (opcional):
--   select texto, tipo, urgente, hecho_en, importe from public.material_pedidos order by creado_en desc;
--   select texto, creado_en from public.notas_equipo order by creado_en desc;
