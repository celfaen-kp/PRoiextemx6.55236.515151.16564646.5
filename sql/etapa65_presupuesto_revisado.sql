-- =============================================================================
-- Sysefen · Etapa 65 · El presupuesto, «pendiente de revisar» antes de enviarlo
--
-- POR QUÉ:
--   Entre crear el presupuesto y mandárselo al cliente hay un paso que faltaba
--   en el seguimiento: revisarlo (en Teamleader, antes de que salga). Ahora
--   queda apuntado quién lo revisó y cuándo, y mientras tanto el presupuesto
--   sale como «pendiente de revisar».
--
-- Requiere la etapa 64. Idempotente.
-- =============================================================================

begin;

alter table public.presupuestos add column if not exists revisado_at  timestamptz;
alter table public.presupuestos add column if not exists revisado_por uuid references public.empleados(id) on delete set null;

-- Los que ya se enviaron al cliente, por fuerza se revisaron antes.
update public.presupuestos set revisado_at = coalesce(enviado_cliente_at, now()), revisado_por = enviado_cliente_por
 where revisado_at is null and (enviado_cliente_at is not null or estado = 'enviado');

commit;
