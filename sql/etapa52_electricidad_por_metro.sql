-- =============================================================================
-- Sysefen · Etapa 52 · Aire: la electricidad por metro, según el cable
--
-- POR QUÉ:
--   El C101 «Electricidad» iba a 72 € por unidad interior, un tanto alzado de
--   los presupuestos antiguos. La instalación eléctrica de un aire son dos
--   tiradas de cable distintas, y cada una vale por metro:
--
--     · De cada INTERIOR a la EXTERIOR: manguera 5G 1,5 mm² (maniobra y
--       alimentación de la interior), en tubo rígido de PVC de 20 mm con dos
--       abrazaderas por metro. Los mismos metros que la tubería frigorífica.
--         cable 1,90 + tubo 0,70 + abrazaderas 0,86 = 3,46 €/m
--     · De la EXTERIOR al CUADRO eléctrico: manguera 3G 2,5 mm², mismo tubo y
--       fijaciones. La distancia al cuadro se toma en la visita; si hay varias
--       exteriores (1x1), cada una lleva la suya.
--         cable 2,10 + tubo 0,70 + abrazaderas 0,86 = 3,66 €/m
--
--   Son precios de MATERIAL con un 10 % de recargo (3,46 → 3,81; 3,66 → 4,03);
--   el trabajo de tirarlos va en la mano de obra. Los metros salen SIEMPRE de
--   la visita: los de cada estancia hasta la exterior y la distancia al cuadro.
--
-- ⚠ LOS PRECIOS Y EL RECARGO ESTÁN AQUÍ ARRIBA, EN UNA SOLA TABLA. Cámbialos y ejecuta.
--
-- Idempotente. Requiere la etapa 51 (unidad en las partidas).
-- =============================================================================

begin;

create temporary table precios_elec on commit drop as
select round(3.46 * 1.10, 2)::numeric as interior_m,   -- 5G 1,5 mm² + tubo PVC 20 + abrazaderas, +10 % → 3,81
       round(3.66 * 1.10, 2)::numeric as cuadro_m;     -- 3G 2,5 mm² + tubo PVC 20 + abrazaderas, +10 % → 4,03

-- 1 · Los metros hasta el cuadro -----------------------------------------------
insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion)
values
  ('aire_acondicionado', 'metros_cuadro', 'Cable al cuadro', 'm',
   'max(0, distancia_cuadro_m) * unidades_exteriores', 7,
   'De cada unidad exterior al cuadro eléctrico. La distancia la da la ficha; en 1x1 cada exterior lleva la suya.')
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden,
      etiqueta = excluded.etiqueta, unidad = excluded.unidad, descripcion = excluded.descripcion;

-- 2 · Fuera el C101 a tanto alzado; dos cables por metro ------------------------
delete from public.partidas_items pi
 using public.partidas p
 where pi.partida_id = p.id and p.categoria = 'aire_acondicionado' and p.codigo = 'KIT_BASE'
   and (pi.concepto_libre like 'C101:%' or pi.concepto_libre like 'E101:%' or pi.concepto_libre like 'E102:%');

insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, detalle_tecnico, formula_cantidad, unidad, orden)
select p.id, v.concepto, v.precio, v.detalle, v.formula, 'm', v.orden
  from public.partidas p
  join (values
    ('E101: Cable de interior a exterior 5G 1,5 mm²', (select interior_m from precios_elec),
     'Manguera 5G 1,5 mm² en tubo rígido de PVC de 20 mm con dos abrazaderas por metro, de cada unidad interior a la exterior',
     'metros_totales', 2),
    ('E102: Cable de exterior a cuadro 3G 2,5 mm²', (select cuadro_m from precios_elec),
     'Manguera 3G 2,5 mm² en tubo rígido de PVC de 20 mm con dos abrazaderas por metro, de la unidad exterior al cuadro eléctrico',
     'metros_cuadro', 3)
  ) as v(concepto, precio, detalle, formula, orden) on true
 where p.categoria = 'aire_acondicionado' and p.codigo = 'KIT_BASE';

commit;

-- =============================================================================
-- COMPROBACIONES
--   select pi.concepto_libre, pi.precio_fijo, pi.unidad, pi.formula_cantidad
--     from public.partidas p join public.partidas_items pi on pi.partida_id = p.id
--    where p.categoria = 'aire_acondicionado' and p.codigo = 'KIT_BASE' order by pi.orden;
--
--   Dos interiores a 4 y 6 m, exterior a 8 m del cuadro, multisplit:
--   E101 10 m × 3,81 = 38,10 · E102 8 m × 4,03 = 32,24.
-- =============================================================================
