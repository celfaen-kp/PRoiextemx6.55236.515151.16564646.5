-- =============================================================================
-- Sysefen · Etapa 35 · El cuaderno de fallos
--
-- POR QUÉ:
--   La app tiene una docena de sitios donde, si algo falla, se calla y sigue con
--   lo que tenía. Eso está bien cuando es falta de cobertura: en un sótano, dar
--   la lata con un error de red cada diez segundos sería peor que callarse.
--
--   Pero ese mismo silencio se traga los fallos de verdad. Si un día cambia algo
--   y una consulta empieza a fallar, la app no se rompe: enseña datos viejos y
--   nadie se entera. Un parte que no sube, una imputación que no se guarda.
--
--   Esta tabla es donde se apunta lo que hoy se traga, para que Administración
--   pueda mirarlo. El empleado no ve nada distinto: se le sigue sin dar la lata.
--
-- QUIÉN PUEDE QUÉ:
--   Apuntar: cualquiera con sesión. Si no, no serviría de nada: el fallo que
--            interesa es justo el del móvil de otro.
--   Leer y borrar: solo Administración.
--
--   Nadie puede LEER lo que apunta otro, así que esto no abre ninguna puerta:
--   solo deja escribir en un cuaderno que únicamente Administración lee.
--
-- SE LIMPIA SOLO: lo de hace más de 90 días se borra cada noche. Un cuaderno de
--   fallos que crece para siempre acaba siendo otro problema.
--
-- No toca ningún dato existente. Idempotente.
-- =============================================================================

begin;

create table if not exists public.errores (
  id          bigserial primary key,
  creado_en   timestamptz not null default now(),
  empleado_id uuid references public.empleados(id) on delete set null,
  nombre      text,
  rol         text,
  vista       text,
  donde       text not null,
  mensaje     text not null,
  version     text,
  agente      text
);

create index if not exists errores_fecha_idx on public.errores (creado_en desc);

alter table public.errores enable row level security;

drop policy if exists errores_apuntar on public.errores;
create policy errores_apuntar on public.errores
  for insert to authenticated
  with check (true);

drop policy if exists errores_ver on public.errores;
create policy errores_ver on public.errores
  for select to authenticated
  using (public.es_admin());

drop policy if exists errores_borrar on public.errores;
create policy errores_borrar on public.errores
  for delete to authenticated
  using (public.es_admin());

commit;

-- =============================================================================
-- LIMPIEZA AUTOMÁTICA · cada noche, lo de hace más de 90 días
-- =============================================================================
create extension if not exists pg_cron;

select cron.unschedule('sysefen-limpiar-errores')
where exists (select 1 from cron.job where jobname = 'sysefen-limpiar-errores');

select cron.schedule(
  'sysefen-limpiar-errores',
  '20 3 * * *',
  $$ delete from public.errores where creado_en < now() - interval '90 days' $$
);

-- Comprobación rápida (opcional):
--   select creado_en, nombre, vista, donde, mensaje from public.errores
--     order by creado_en desc limit 20;
--   select jobname, schedule from cron.job where jobname = 'sysefen-limpiar-errores';
