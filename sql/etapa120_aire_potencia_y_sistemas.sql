-- =============================================================================
-- Sysefen · etapa 120 · aire acondicionado: la potencia a mano (Enzo, 19-11-2026)
--
-- Enzo: «a veces sabemos qué aire llevaría, si un 25 un 35… se podría poner en
-- el motor el elegir… no necesariamente por m² sino también elegir la potencia».
--
-- Cada estancia puede traer su potencia ('25', '35', '50' o '70'). La función
-- `presupuestar` (aire.js) le pone a cada estancia `potencia_kw`: los kW de esa
-- máquina, o 0 si no se eligió. Aquí la variable kw_estancia la usa: si hay
-- potencia, manda; si no, salen de los m² como siempre (100 W/m², w_m2).
--   25 → 2,6 kW → tamaño 9 · 35 → 3,5 → 12 · 50 → 5,3 → 18 · 70 → 7,0 → 24
--
-- Lo de varios sistemas en un presupuesto (un 2x1 y un 1x1) no necesita nada de
-- la base: la función calcula cada sistema con estas mismas reglas y junta las
-- líneas.
--
-- Requiere la función `presupuestar` con aire.js. Con la función vieja la
-- variable vale lo de antes (potencia_kw no viene y cuenta como 0), aunque
-- avisaría de que falta ese dato: por eso se despliega la función primero.
-- Idempotente.
-- =============================================================================

update public.variables_derivadas
   set formula = 'si(potencia_kw > 0, potencia_kw, redondea(m2 * lookup(''w_m2'', ''defecto'') / 1000, 2))',
       descripcion = 'kW que pide la estancia: los de la potencia elegida a mano (25, 35, 50, 70) o, si no hay, los de sus m².'
 where categoria = 'aire_acondicionado' and codigo = 'kw_estancia';

update public.reglas r
   set notas = 'Una estancia no tiene m² ni potencia elegida: sin una de las dos cosas no se puede elegir su máquina. Ponla en la ficha (Estancias) y vuelve a calcular.'
  from public.conjuntos_reglas c
 where c.id = r.conjunto_id and c.categoria = 'aire_acondicionado'
   and r.tipo = 'aviso' and r.por_cada = 'estancias' and r.variable = 'tamano' and r.minimo = 0 and r.maximo = 0;

-- =============================================================================
-- COMPROBACIÓN
--   select codigo, formula from public.variables_derivadas where categoria = 'aire_acondicionado' and codigo = 'kw_estancia';
-- =============================================================================
