-- =============================================================================
-- Etapa 98 (6-11-2026, Enzo): cambios en los motores de presupuestos.
--   1 · La subvención no va en los presupuestos: fuera la regla FV-13-006, fuera
--       del catálogo lo que la nombra y sin la palabra en los conceptos del kit
--       base de aerotermia (los importes no cambian).
--   2 · Fotovoltaica: el proyecto técnico va por la potencia del inversor
--       (10 kW o más), que la función manda como `inversor_kw`; sin inversor
--       conocido (sin modelo v2) se sigue mirando kWp. Así cambia al elegir
--       otro inversor en el desplegable.
-- =============================================================================
update public.reglas set activa = false where producto_ref = 'FV-13-006';
update public.productos set activo = false where referencia in ('FV-13-006', 'SY-TRAMITES-DE-SUBVENCION-F1A6');
update public.productos set nombre = 'RITE y documentación' where referencia = 'SY-RITE-DOCUMENTACION-Y-SUBVENC-805E';
update public.partidas_items set concepto_libre = 'RITE y documentación' where concepto_libre = 'RITE, documentación y subvención';
update public.partidas_items set detalle_tecnico = 'Certificados energéticos y gestiones administrativas' where concepto_libre = 'Gestiones administrativas' and detalle_tecnico ilike '%subvenci%';
update public.variables_derivadas set formula = 'si(zona_protegida o si(inversor_kw > 0, inversor_kw >= 10, kwp > 10), 1, 0)' where categoria = 'solar' and codigo = 'proyecto';
select (select count(*) from public.reglas where producto_ref = 'FV-13-006' and activa) as reglas_subv_activas,
       (select count(*) from public.partidas_items where concepto_libre ilike '%subvenci%' or detalle_tecnico ilike '%subvenci%') as items_con_subvencion,
       (select formula from public.variables_derivadas where categoria = 'solar' and codigo = 'proyecto') as formula_proyecto;
