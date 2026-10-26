-- =============================================================================
-- Sysefen · Etapa 85b · Los costes de los conceptos de precio fijo (Enzo, 26 oct 2026)
--
--   · Lo que es Vaillant (ACS uniSTOR, depósito de inercia, grupo de bombeo):
--     coste = venta × 0,57 (43 % de descuento de distribuidor).
--   · A102 Mano de obra de aerotermia: 5 días × 2 personas; el día se vende a
--     450 € y cuesta 300 € (estudio de costes con nóminas) → coste 1.500 €.
--   · El resto: 15 % de beneficio sobre la venta → coste = venta × 0,85.
--   Los conceptos antiguos de solar no se tocan (el FV va por el modelo v2).
-- Idempotente.
-- =============================================================================

begin;

-- Vaillant al 43 %
update public.partidas_items i set coste_fijo = round(i.precio_fijo * 0.57, 2)
  from public.partidas p where p.id = i.partida_id and p.categoria = 'aerotermia'
  and (p.codigo in ('ACS_200', 'ACS_250', 'A106') or i.concepto_libre = 'Depósito de inercia');

-- Mano de obra de aerotermia: 5 días a 300 € de coste
update public.partidas_items i set coste_fijo = 1500.00
  from public.partidas p where p.id = i.partida_id and p.categoria = 'aerotermia' and i.concepto_libre like 'A102:%';

-- El resto de aerotermia y aire: 15 % de beneficio sobre la venta
update public.partidas_items i set coste_fijo = round(i.precio_fijo * 0.85, 2)
  from public.partidas p where p.id = i.partida_id and p.categoria in ('aerotermia', 'aire_acondicionado')
  and i.precio_fijo is not null and i.coste_fijo is null;

commit;

-- COMPROBACIÓN
select p.categoria, p.codigo, i.concepto_libre, i.precio_fijo, i.coste_fijo,
       round((i.precio_fijo - i.coste_fijo) / i.precio_fijo * 100, 1) as margen_pct
from public.partidas_items i join public.partidas p on p.id = i.partida_id
where i.precio_fijo is not null and p.categoria <> 'solar' order by 1, 2, i.orden;
