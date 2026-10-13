-- =============================================================================
-- Sysefen · Etapa 75 · «Enviado al cliente» solo cuando lo apunta una persona
--
-- POR QUÉ (Enzo, 13 oct 2026):
--   Al subir un presupuesto a Teamleader, la función teamleader-presupuesto
--   creaba la oferta (quotations.create, nunca quotations.send) y dejaba el
--   presupuesto en estado 'enviado'. La app pintaba ese estado como «Enviado
--   al cliente» y los presupuestos recientes salían como enviados sin haberlo
--   estado: la oferta se queda en Teamleader sin mandar hasta que alguien la
--   revisa y la envía desde allí.
--
-- QUÉ HACE:
--   Devuelve a su estado real los presupuestos marcados 'enviado' por la
--   sincronización, es decir, los que no tienen enviado_cliente_at (la fecha
--   que apunta una persona con «Ya se lo envié al cliente»):
--     · con revisado_at → 'aprobado' (revisado, pendiente de enviar)
--     · sin revisado_at → 'generado'
--   Los que sí tienen enviado_cliente_at no se tocan.
--   La función y la app ya no ponen ni miran ese estado para esto.
--
-- Idempotente. No borra nada. Requiere las etapas 64 y 65.
-- =============================================================================

begin;

update public.presupuestos
   set estado = case when revisado_at is not null then 'aprobado' else 'generado' end,
       updated_at = now()
 where estado = 'enviado'
   and enviado_cliente_at is null;

commit;

-- COMPROBACIÓN
--   Qué queda como enviado de verdad (con fecha apuntada por una persona):
--   select id, titulo, categoria, estado, revisado_at, enviado_cliente_at, tl_quotation_id, sync_estado, created_at
--     from public.presupuestos order by created_at desc limit 20;
