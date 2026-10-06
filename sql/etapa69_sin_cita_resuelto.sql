-- =============================================================================
-- Sysefen · Etapa 69 · «No hace falta cita»: cerrar un cliente sin citarlo
--
-- POR QUÉ:
--   Un cliente que entra desde Teamleader (creado a mano en el CRM, con su
--   presupuesto y su obra ya hechos fuera de la app) aparecía en la lista como
--   «sin cita», en rojo, y lo único que se podía hacer era citarlo. Ahora se
--   puede dar por resuelto sin cita, diciendo por qué: ya tiene obra,
--   presupuesto hecho fuera, solo era una consulta, no interesa…
--   Además `teamleader-leads` distingue los que de verdad vienen de la web
--   (origen 'web') de los creados a mano en el CRM (origen 'crm').
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.clientes_cache add column if not exists sin_cita_motivo text;
alter table public.clientes_cache add column if not exists sin_cita_at     timestamptz;
alter table public.clientes_cache add column if not exists sin_cita_por    uuid references public.empleados(id) on delete set null;

comment on column public.clientes_cache.sin_cita_motivo is 'Si está, el cliente se dio por resuelto sin cita, y esto es el porqué («ya tiene obra», «solo consulta»…). Null = sigue pendiente.';

commit;
