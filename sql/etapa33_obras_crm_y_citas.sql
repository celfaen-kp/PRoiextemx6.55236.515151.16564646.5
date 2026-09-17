-- =============================================================================
-- Sysefen · Etapa 33 · Dos cosas sueltas
--
-- 1 · LAS CITAS DEJAN DE VERLAS LOS JEFES
--     Hasta ahora las veían presupuestos, jefes y Administración. La agenda de
--     Ramón es cosa suya y de Administración: los jefes de obra tienen lo suyo
--     y esto solo les distraía. Se quita también de la base, no solo de la
--     pantalla: aunque alguien llame a la API por su cuenta, no las ve.
--
-- 2 · LA OBRA SE ENLAZA CON EL CLIENTE DE TEAMLEADER
--     Al crear una obra se puede buscar el cliente en el CRM y engancharlo, en
--     vez de escribir el nombre a mano y que no cuadre con el del CRM.
--
--     obras.tl_id     el contacto o la empresa en Teamleader
--     obras.tl_tipo   'contact' o 'company'
--
-- No toca ningún dato existente. Idempotente.
-- =============================================================================

begin;

-- 1 · las citas, solo presupuestos y Administración -------------------------
-- Helper propio, al lado de es_comercial() y es_presupuestos(), y con el mismo
-- patrón: security definer y permiso explícito, para no depender de quién pueda
-- ejecutar rol_actual() directamente.
create or replace function public.es_agenda()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() in ('presupuestos', 'admin'), false)
$$;

grant execute on function public.es_agenda() to authenticated;

drop policy if exists citas_ver on public.citas;
create policy citas_ver on public.citas
  for select to authenticated
  using (public.es_agenda());

-- 2 · la obra y su cliente del CRM ------------------------------------------
alter table public.obras add column if not exists tl_id   text;
alter table public.obras add column if not exists tl_tipo text
  check (tl_tipo is null or tl_tipo in ('contact', 'company'));

comment on column public.obras.tl_id is
  'Contacto o empresa de Teamleader con el que está enlazada esta obra.';

create index if not exists obras_tl_idx on public.obras (tl_id) where tl_id is not null;

commit;

-- Comprobación rápida (opcional):
--   select nombre, cliente, tl_tipo, tl_id from public.obras order by nombre;
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy
--     where polrelid = 'public.citas'::regclass and polname = 'citas_ver';
--
-- Si algún día quieres que los jefes vuelvan a ver las citas:
--   drop policy if exists citas_ver on public.citas;
--   create policy citas_ver on public.citas
--     for select to authenticated using (public.es_comercial());
