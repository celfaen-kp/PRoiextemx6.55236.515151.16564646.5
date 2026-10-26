-- =============================================================================
-- Sysefen · Etapa 84 · Descuento de distribuidor en las tarifas de PVP
--
-- POR QUÉ (Enzo, 26 oct 2026):
--   Las tarifas de Vaillant, Saunier Duval y Midea son listas de PVP, no de
--   coste. Con descuento_proveedor a 0 la app tomaba coste = venta y el
--   beneficio salía 0 en aerotermia y aire (y en Teamleader, el precio de
--   compra igual al de venta).
--
-- QUÉ HACE:
--   Pone el descuento que hace cada marca sobre su tarifa: Vaillant 43 %,
--   Saunier Duval 43 %, Midea 50 %. Coste = PVP × (1 − descuento). La venta
--   sigue siendo el PVP. Las tarifas de fotovoltaica (BayWa, Rebacas) no se
--   tocan: son de coste y llevan recargo.
--
-- Idempotente.
-- =============================================================================

begin;

update public.productos p set descuento_proveedor = 43
  from public.tarifas t where t.id = p.tarifa_id and t.nombre in ('Vaillant 2025', 'Saunier Duval 2026');
update public.productos p set descuento_proveedor = 50
  from public.tarifas t where t.id = p.tarifa_id and t.nombre = 'Midea 2026';

commit;

-- COMPROBACIÓN
select t.nombre as tarifa, count(*) as productos, min(p.descuento_proveedor) as dto_min, max(p.descuento_proveedor) as dto_max
from public.productos p join public.tarifas t on t.id = p.tarifa_id where p.activo group by t.nombre order by 1;
