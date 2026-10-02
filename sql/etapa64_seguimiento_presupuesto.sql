-- =============================================================================
-- Sysefen · Etapa 64 · Seguimiento del presupuesto y qué pidió el cliente web
--
-- QUÉ RESUELVE:
--   · Después de la visita no se sabía en qué punto estaba cada cliente: si el
--     presupuesto se hizo, si ya está en Teamleader, si se revisó y se le mandó
--     al cliente, y si el cliente contestó. Ahora cada presupuesto lleva su
--     seguimiento: enviado al cliente (cuándo y quién) y la respuesta
--     (pendiente, aceptado, rechazado, caducado; esa columna ya venía de la
--     etapa 59). El cliente lo enseña en la lista y en su ficha.
--   · Los clientes que entran por la web llegaban a la app solo con sus datos:
--     no se sabía por qué habían escrito. Ahora `teamleader-leads` se trae lo
--     que escribieron (observaciones del contacto, resumen de la oportunidad)
--     y lo guarda en motivo_web. Requiere la versión de esa función del 2 de
--     octubre de 2026 o posterior.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.presupuestos add column if not exists enviado_cliente_at timestamptz;
alter table public.presupuestos add column if not exists enviado_cliente_por uuid references public.empleados(id) on delete set null;
alter table public.presupuestos add column if not exists motivo_rechazo text;

comment on column public.presupuestos.enviado_cliente_at is 'Cuándo se le mandó el presupuesto al cliente (tras revisarlo en Teamleader). Null = aún no.';
comment on column public.presupuestos.respuesta_cliente is 'pendiente · aceptado · rechazado · caducado. Lo marca presupuestos a mano cuando el cliente contesta.';

alter table public.clientes_cache add column if not exists motivo_web text;
comment on column public.clientes_cache.motivo_web is 'Lo que el cliente escribió al pedir presupuesto por la web (lo trae teamleader-leads del CRM).';

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select c.nombre, p.categoria, p.estado, p.tl_quotation_id is not null as en_tl,
--          p.enviado_cliente_at, p.respuesta_cliente
--     from public.presupuestos p left join public.clientes_cache c on c.id = p.cliente_id
--    order by p.created_at desc limit 20;
--   select nombre, motivo_web from public.clientes_cache where motivo_web is not null order by lead_at desc;
-- =============================================================================
