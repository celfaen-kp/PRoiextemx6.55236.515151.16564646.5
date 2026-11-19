-- =============================================================================
-- Sysefen · etapa 119 · Victron MultiPlus-II 48/15000 (Enzo, 19-11-2026)
--
-- Enzo: «Inversor Victron Multiplus II 48/15000 · PVP sin IVA 2.585,00 €/ud ·
-- descuento −35 % · precio neto 1.680,25 €/ud». Como el resto del material de
-- aislada (sql/etapa118): tarifa «Fotovoltaica 2026», coste neto, recargo 1,30
-- (el de por defecto de fotovoltaica) y familia «equipo», no «inversor», para
-- que el presupuestador de red no lo elija solo. No venía la referencia del
-- fabricante: lleva una propia.
-- =============================================================================

insert into public.productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, iva, especificaciones, atributos, activo, recargo, aplica_cdc)
select (select id from public.tarifas where nombre = 'Fotovoltaica 2026'), 'FV-VICTRON-MULTIPLUS-II-48-15000', 'VICTRON MultiPlus-II 48/15000', 'equipo', 'ud', 1680.25, 0, 21, '[]'::jsonb,
       '{"marca": "victron", "aislada": true, "pvp_proveedor": 2585.0, "dto_proveedor_pct": 35, "oferta": "19-11-2026 (Enzo)"}'::jsonb, true, 1.3, false
on conflict (tarifa_id, referencia) do nothing;
