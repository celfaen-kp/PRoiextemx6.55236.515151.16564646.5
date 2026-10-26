-- =============================================================================
-- Sysefen · Etapa 85 · Coste propio de los conceptos de precio fijo
--
-- POR QUÉ (Enzo, 26 oct 2026):
--   En aerotermia y aire, el depósito de inercia, los soportes, el material
--   hidráulico y eléctrico, la mano de obra… son conceptos con precio fijo de
--   VENTA (partidas_items.precio_fijo). Sin coste, la app los daba a coste =
--   venta y el beneficio salía 0.
--
-- QUÉ HACE:
--   partidas_items.coste_fijo: lo que le cuesta a Sysefen ese concepto por
--   unidad (null = desconocido: la línea sale «sin coste» y no inventa margen).
--   Los costes se rellenan con la etapa 85b cuando Enzo los dé.
--
-- Idempotente.
-- =============================================================================

begin;
alter table public.partidas_items add column if not exists coste_fijo numeric(12,2);
comment on column public.partidas_items.coste_fijo is 'Coste para Sysefen por unidad del concepto de precio fijo. Null = desconocido (la línea va sin coste).';
commit;
