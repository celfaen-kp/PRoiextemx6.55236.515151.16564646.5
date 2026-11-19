-- =============================================================================
-- Sysefen · etapa 121 · aire: base de 15 € en la carga de gas (Enzo, 19-11-2026)
--
-- Enzo: «en aire acondicionado, cuando vaya carga de gas, le pondremos una base
-- de 15 € y luego que suba por kg como pusimos».
--
-- La partida GAS_EXTRA tenía un solo renglón: los kilos de R32 de más, a 49 €/kg.
-- Se le añade otro delante: una base fija de 15 € que entra solo cuando hay algo
-- que cargar (kg_gas_extra > 0). Los kilos siguen igual.
--
-- COSTE: 12,75 €. No es un dato de Enzo: es el 85 % de la venta, la misma
-- proporción que llevan todos los conceptos de aire (el gas 41,65 de 49, la mano
-- de obra 297,50 de 350…). Se cambia en Ajustes → Precios.
--
-- Con varios sistemas en un presupuesto (un 2x1 y un 1x1), la base va una sola
-- vez: lo cuida la función `presupuestar` (aire.js).
-- Idempotente.
-- =============================================================================

insert into public.partidas_items (partida_id, concepto_libre, detalle_tecnico, precio_fijo, coste_fijo, formula_cantidad, orden, unidad)
select p.id, 'Carga adicional de refrigerante: base',
       'Importe fijo por hacer la carga. El refrigerante va aparte, por kilo.',
       15.00, 12.75, 'si(kg_gas_extra > 0, 1, 0)', 0, 'ud'
  from public.partidas p
 where p.categoria = 'aire_acondicionado' and p.codigo = 'GAS_EXTRA'
   and not exists (select 1 from public.partidas_items i where i.partida_id = p.id and i.concepto_libre = 'Carga adicional de refrigerante: base');

-- =============================================================================
-- COMPROBACIÓN
--   select i.orden, i.concepto_libre, i.precio_fijo, i.coste_fijo, i.formula_cantidad from public.partidas_items i
--     join public.partidas p on p.id = i.partida_id where p.categoria = 'aire_acondicionado' and p.codigo = 'GAS_EXTRA' order by i.orden;
-- =============================================================================
