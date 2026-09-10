begin;

create table if not exists public.ausencias (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  fecha       date not null,
  tipo        text not null default 'vacaciones',
  nota        text,
  creado_por  uuid references public.empleados(id) on delete set null,
  creado_en   timestamptz not null default now(),
  constraint ausencias_tipo_chk check (tipo in ('vacaciones','festivo','baja','permiso')),
  constraint ausencias_uk unique (empleado_id, fecha)
);

create index if not exists ausencias_emp_fecha_idx on public.ausencias (empleado_id, fecha);

alter table public.ausencias enable row level security;

-- Se ven las propias; jefe y administración las ven todas.
drop policy if exists ausencias_select on public.ausencias;
create policy ausencias_select on public.ausencias
  for select to authenticated
  using (public.es_jefe() or empleado_id = public.empleado_id_actual());

-- Marcar vacaciones es decisión de la empresa, no del trabajador.
drop policy if exists ausencias_insert on public.ausencias;
create policy ausencias_insert on public.ausencias
  for insert to authenticated with check (public.es_jefe());

drop policy if exists ausencias_update on public.ausencias;
create policy ausencias_update on public.ausencias
  for update to authenticated using (public.es_jefe()) with check (public.es_jefe());

drop policy if exists ausencias_delete on public.ausencias;
create policy ausencias_delete on public.ausencias
  for delete to authenticated using (public.es_jefe());

-- ---------------------------------------------------------------------------
-- Calendario de festivos: común a TODO el equipo, no persona a persona.
-- ---------------------------------------------------------------------------
create table if not exists public.festivos (
  fecha   date primary key,
  nombre  text not null,
  ambito  text not null default 'nacional',
  constraint festivos_ambito_chk check (ambito in ('nacional','autonomico','local'))
);

alter table public.festivos enable row level security;

drop policy if exists festivos_select on public.festivos;
create policy festivos_select on public.festivos for select to authenticated using (true);

drop policy if exists festivos_write on public.festivos;
create policy festivos_write on public.festivos for all to authenticated
  using (public.es_jefe()) with check (public.es_jefe());

-- Festivos NACIONALES de fecha fija (los mismos todos los años).
-- Los de fecha variable y los autonómicos/locales van aparte, abajo.
insert into public.festivos (fecha, nombre, ambito) values
  ('2025-01-01','Año Nuevo','nacional'),          ('2026-01-01','Año Nuevo','nacional'),
  ('2025-01-06','Epifanía del Señor','nacional'), ('2026-01-06','Epifanía del Señor','nacional'),
  ('2025-05-01','Fiesta del Trabajo','nacional'), ('2026-05-01','Fiesta del Trabajo','nacional'),
  ('2025-08-15','Asunción de la Virgen','nacional'), ('2026-08-15','Asunción de la Virgen','nacional'),
  ('2025-10-12','Fiesta Nacional de España','nacional'), ('2026-10-12','Fiesta Nacional de España','nacional'),
  ('2025-11-01','Todos los Santos','nacional'),   ('2026-11-01','Todos los Santos','nacional'),
  ('2025-12-06','Día de la Constitución','nacional'), ('2026-12-06','Día de la Constitución','nacional'),
  ('2025-12-08','Inmaculada Concepción','nacional'), ('2026-12-08','Inmaculada Concepción','nacional'),
  ('2025-12-25','Natividad del Señor','nacional'), ('2026-12-25','Natividad del Señor','nacional'),
  -- Viernes Santo: cambia cada año (Semana Santa).
  ('2025-04-18','Viernes Santo','nacional'),      ('2026-04-03','Viernes Santo','nacional'),
  -- Illes Balears
  ('2025-03-01','Dia de les Illes Balears','autonomico'), ('2026-03-01','Dia de les Illes Balears','autonomico'),
  ('2025-04-21','Dilluns de Pasqua','autonomico'), ('2026-04-06','Dilluns de Pasqua','autonomico')
on conflict (fecha) do nothing;

-- FALTAN los DOS festivos LOCALES de tu municipio, que cambian cada año y no
-- los puedo saber. Se añaden desde la app, o aquí:
--   insert into public.festivos (fecha, nombre, ambito)
--   values ('2026-07-25','Sant Jaume','local') on conflict (fecha) do nothing;

commit;
