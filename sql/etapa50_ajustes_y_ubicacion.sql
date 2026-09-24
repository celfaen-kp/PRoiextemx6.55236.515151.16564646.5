-- =============================================================================
-- Sysefen · Etapa 50 · Los ajustes de la empresa en Supabase, y fichar con ubicación
--
-- QUÉ RESUELVE (auditoría de septiembre de 2026):
--
--   1. LOS AJUSTES VIVÍAN EN CADA MÓVIL. Nombre de empresa, CIF, email de copia
--      a la gestoría y las opciones estaban en el localStorage del dispositivo
--      de quien los escribía. Un parte enviado desde el móvil de un jefe salía
--      SIN CIF y SIN copia a la gestoría. Ahora hay una sola fila `empresa`
--      que Administración escribe y todos leen al arrancar. (Se llama
--      `empresa` porque `ajustes` ya existe desde la etapa 29: son pares
--      clave/valor del servidor, como el id de la hoja de clientes.)
--
--   2. «REGISTRAR UBICACIÓN AL FICHAR» NO HACÍA NADA. La pantalla decía
--      «Ubicación registrada al fichar» y no se guardaba ninguna posición.
--      Ahora sí: el fichaje lleva dónde estaba el móvil, con qué precisión, a
--      cuántos metros del lugar de fichaje más cercano y cuál era. Y si está
--      lejos de todos los lugares, NO PUEDE FICHAR: tiene que pedírselo a
--      Administración, que ficha por él desde su móvil (queda apuntado quién).
--
--      Los lugares de fichaje (el despacho, y los que hagan falta) los pone
--      Administración en Ajustes, con su radio en metros.
--
--   3. «AVISO DE FICHAJE» TAMPOCO EXISTÍA. Ahora hay una hora (aviso_hora) a
--      partir de la cual, si alguien sigue dentro, la app le avisa.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

-- 1 · Una sola fila con los datos de la empresa -------------------------------------------------
create table if not exists public.empresa (
  id                 int primary key default 1 check (id = 1),
  empresa            text not null default 'Sysefen',
  cif                text not null default '',
  email_copia        text not null default '',
  gps                boolean not null default true,     -- fichar con ubicación y solo desde los lugares
  aviso_fichaje      boolean not null default true,     -- avisar si sigue dentro pasada la hora
  aviso_hora         time not null default '18:30',
  importes_operario  boolean not null default false,
  -- [{"nombre": "Despacho", "lat": 39.57, "lng": 2.65, "radio_m": 300}]
  lugares            jsonb not null default '[]'::jsonb,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

insert into public.empresa (id) values (1) on conflict (id) do nothing;

alter table public.empresa enable row level security;
drop policy if exists empresa_select on public.empresa;
drop policy if exists empresa_update on public.empresa;
drop policy if exists empresa_insert on public.empresa;
-- Todo el equipo los lee (el CIF va en los PDF de cualquiera; los lugares
-- hacen falta para fichar). Solo Administración los cambia.
create policy empresa_select on public.empresa for select to authenticated using (true);
create policy empresa_update on public.empresa for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy empresa_insert on public.empresa for insert to authenticated
  with check (public.es_admin());

create or replace function public.empresa_tocar()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists empresa_tocar on public.empresa;
create trigger empresa_tocar before update on public.empresa
  for each row execute function public.empresa_tocar();

-- 2 · Dónde se fichó ----------------------------------------------------------------
alter table public.fichajes add column if not exists lat               double precision;
alter table public.fichajes add column if not exists lng               double precision;
alter table public.fichajes add column if not exists precision_m       int;
alter table public.fichajes add column if not exists distancia_m       int;      -- al lugar más cercano
alter table public.fichajes add column if not exists lugar             text;     -- su nombre, o 'administracion'
alter table public.fichajes add column if not exists salida_lat        double precision;
alter table public.fichajes add column if not exists salida_lng        double precision;
alter table public.fichajes add column if not exists salida_distancia_m int;
alter table public.fichajes add column if not exists salida_lugar      text;
-- Quién lo fichó, si no fue él mismo (Administración desde su móvil).
alter table public.fichajes add column if not exists fichado_por       uuid;

comment on column public.fichajes.distancia_m is 'Metros al lugar de fichaje más cercano en el momento de fichar la entrada. Null = sin ubicación (fichaje antiguo o por Administración).';
comment on column public.fichajes.lugar is 'Nombre del lugar de fichaje (Despacho…) o ''administracion'' si lo fichó Administración por él.';

-- El trigger de la etapa 2/5 conserva las columnas que no debe tocar un
-- operario (empleado_id, obra_id, horas). Las de ubicación las escribe la app
-- al fichar: en el insert (entrada) y en el update de cierre (salida). No se
-- pisan aquí porque el propio fichaje ya no admite reabrirse ni cambiar de
-- hora desde un operario.

commit;

-- =============================================================================
-- COMPROBACIONES
--   select * from public.empresa;
--   select entrada, lugar, distancia_m, precision_m, fichado_por from public.fichajes
--    order by entrada desc limit 10;
--
-- Para poner el despacho a mano (Administración lo hace mejor desde la app,
-- estando allí, con «Usar mi ubicación»):
--   update public.empresa set lugares = '[{"nombre":"Despacho","lat":39.5696,"lng":2.6502,"radio_m":300}]';
-- =============================================================================
