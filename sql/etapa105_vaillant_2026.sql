-- =============================================================================
-- Sysefen · Etapa 105 · Tarifa Vaillant 2026 (Enzo, 10 nov 2026)
--
-- POR QUÉ: «De Vaillant revisa bien que sea esta guía la que usas… y eso es PVP,
--   tenemos el 43 de beneficio.» La app tenía cargado el catálogo Vaillant 2025
--   (360 productos). Contra el Catálogo General 2026: solo 5 precios coincidían,
--   264 habían subido (mediana +6,4 %) y 91 productos ya no están, entre ellos
--   las aroTHERM plus 4/6/8/12/15 básico que elegía el motor de aerotermia.
--
-- QUÉ HACE (todo o nada):
--   1 · Tarifa nueva «Vaillant 2026» (vigente desde 01-01-2026) con los 906
--       productos con precio del catálogo, PVP sin IVA, con el 43 % de descuento
--       de distribuidor (coste = PVP × 0,57; la venta es el PVP). Las filas NO
--       van en este archivo (el repo es público): las genera
--         herramientas/extrae-tarifa-vaillant-2026.py  → vaillant-2026.csv (Drive)
--         herramientas/sql-tarifa-vaillant-2026.py     → subir-a-supabase/etapa105_vaillant_2026_completo.sql
--       que pone los productos donde está la marca de abajo. Las referencias que
--       ya estaban en 2025 conservan nombre, familia y atributos.
--   2 · Cierra «Vaillant 2025» (vigente hasta 31-12-2025) y desactiva sus
--       productos: una tarifa no se edita, se publica la siguiente. Los
--       presupuestos guardados no cambian (guardan su tarifa y sus líneas).
--   3 · Motor de aerotermia: la máquina Vaillant pasa a la gama que sustituye a
--       la aroTHERM plus, la aroTHERM plus ES (set básico, sensoCOMFORT
--       inalámbrico, 230 V), que va en 5, 8, 12 y 15 kW:
--         hasta 5 kW      → plus ES 5   (8000046550,  9.565 €; antes plus 4,  8.755 €)
--         5,01 a 10 kW    → plus ES 8   (8000046555, 10.235 €; antes plus 6,  9.385 € y plus 8, 9.710 €)
--         10,01 a 13,5 kW → plus ES 12  (8000046561, 13.470 €; antes plus 12, 12.780 €)
--         más de 13,5 kW  → plus ES 15  (8000046571, 14.115 €; antes plus 15, 13.395 €)
--       Ya no hay máquina de 6 kW en esa gama: su tramo va a la de 8. (La gama
--       exclusive ES sí tiene 4, 6, 8, 12 y 15 kW, entre un 12 y un 18 % más cara:
--       está en el catálogo para ponerla a mano.)
--   4 · El acumulador de 250 l del kit (uniSTOR plus VIH RW 250/2 B) pasa de
--       2.265 € a los 2.410 € del catálogo 2026 (coste al 43 %: 1.373,70 €). El
--       de 200 l sigue en 2.035 €, que es su precio de 2026.
--   5 · Equivalencias con Saunier Duval (informativas): a las referencias nuevas.
--
-- Idempotente: los productos no pisan lo que ya esté (ni precios cambiados a mano
-- desde Ajustes → Precios).
-- =============================================================================

begin;

insert into public.tarifas (proveedor_id, nombre, vigente_desde)
select id, 'Vaillant 2026', date '2026-01-01' from public.proveedores where codigo = 'vaillant'
on conflict (proveedor_id, nombre) do nothing;

-- <<PRODUCTOS: los pone herramientas/sql-tarifa-vaillant-2026.py>>

-- Sin la tarifa cargada no se cierra la anterior ni se tocan las reglas.
do $$
declare n int;
begin
  select count(*) into n from public.productos p join public.tarifas t on t.id = p.tarifa_id where t.nombre = 'Vaillant 2026' and p.activo;
  if n < 850 then raise exception 'La tarifa Vaillant 2026 no está cargada (% productos): ejecuta el archivo completo de subir-a-supabase.', n; end if;
  if (select count(*) from public.productos p join public.tarifas t on t.id = p.tarifa_id
       where t.nombre = 'Vaillant 2026' and p.activo and p.referencia in ('8000046550', '8000046555', '8000046561', '8000046571')) <> 4 then
    raise exception 'Faltan los sets básicos aroTHERM plus ES en la tarifa Vaillant 2026.';
  end if;
end $$;

-- 2 · se cierra la de 2025
update public.tarifas set vigente_hasta = date '2025-12-31' where nombre = 'Vaillant 2025' and vigente_hasta is null;
update public.productos p set activo = false from public.tarifas t where t.id = p.tarifa_id and t.nombre = 'Vaillant 2025' and p.activo;

-- 3 · la máquina Vaillant del motor de aerotermia
update public.reglas r set producto_ref = v.nueva, minimo = v.minimo, maximo = v.maximo, notas = v.notas
  from public.conjuntos_reglas c,
       (values ('0020306791', '8000046550', 0.01, 5.0,  'aroTHERM plus ES 5 kW (catálogo 2026; antes aroTHERM plus 4)'),
               ('0020306795', '8000046555', 5.01, 10.0, 'aroTHERM plus ES 8 kW (catálogo 2026; cubre también el tramo de la antigua de 6 kW)'),
               ('0020306797', '8000046561', 10.01, 13.5, 'aroTHERM plus ES 12 kW 230 V (catálogo 2026)'),
               ('0020306801', '8000046571', 13.51, 99.0, 'aroTHERM plus ES 15 kW 230 V (catálogo 2026)')) as v(vieja, nueva, minimo, maximo, notas)
 where c.id = r.conjunto_id and c.categoria = 'aerotermia' and c.vigente_hasta is null
   and r.tipo = 'seleccion' and r.producto_ref = v.vieja;
update public.reglas r set activa = false, notas = 'aroTHERM plus 6 kW: ya no está en el catálogo 2026 (la plus ES va en 5, 8, 12 y 15 kW). Su tramo lo cubre la de 8 kW.'
  from public.conjuntos_reglas c
 where c.id = r.conjunto_id and c.categoria = 'aerotermia' and c.vigente_hasta is null
   and r.tipo = 'seleccion' and r.producto_ref = '0020306793';

-- 4 · el acumulador de 250 l del kit
update public.partidas_items i set precio_fijo = 2410, coste_fijo = 1373.70
  from public.partidas pa
 where pa.id = i.partida_id and pa.categoria = 'aerotermia' and pa.codigo = 'ACS_250'
   and i.producto_ref is null and i.precio_fijo = 2265;

-- 5 · equivalencias con Saunier Duval (informativas)
update public.producto_equivalencias set ref_a = '8000046555', notas = 'aroTHERM plus ES 8 ↔ Genia Air Max 8 (2026: 10.235 € las dos)' where ref_a = '0020306795';
update public.producto_equivalencias set ref_a = '8000046561', notas = 'aroTHERM plus ES 12 230V ↔ Genia Air Max 12 (230V)' where ref_a = '0020306797';
update public.producto_equivalencias set ref_a = '8000046571', notas = 'aroTHERM plus ES 15 230V ↔ Genia Air Max 15 (230V) (2026: 14.115 € las dos)' where ref_a = '0020306801';
update public.producto_equivalencias set notas = 'aroTHERM plus 4 ↔ Genia Air Max 4. SIN EQUIVALENTE EN 2026: la aroTHERM plus 4 ya no está en el catálogo Vaillant (la plus ES empieza en 5 kW).' where ref_a = '0020306791';

commit;

-- COMPROBACIÓN
select json_build_object(
  'tarifas', (select json_agg(x) from (select t.nombre, t.vigente_desde, t.vigente_hasta, count(p.*) filter (where p.activo) as activos, count(p.*) as productos,
                 min(p.descuento_proveedor) filter (where p.activo) as dto_min, max(p.descuento_proveedor) filter (where p.activo) as dto_max
                from public.tarifas t left join public.productos p on p.tarifa_id = t.id where t.nombre like 'Vaillant%' group by 1, 2, 3 order by 1) x),
  'reglas', (select json_agg(x) from (select r.minimo, r.maximo, r.producto_ref, r.activa, p.nombre, p.precio_tarifa, p.activo as producto_activo
                from public.reglas r join public.conjuntos_reglas c on c.id = r.conjunto_id
                left join public.productos p on p.referencia = r.producto_ref and p.activo
               where c.categoria = 'aerotermia' and c.vigente_hasta is null and r.tipo = 'seleccion' and r.condicion::text like '%vaillant%' order by r.minimo) x),
  'acs_250', (select json_agg(x) from (select i.concepto_libre, i.precio_fijo, i.coste_fijo from public.partidas_items i join public.partidas pa on pa.id = i.partida_id where pa.categoria = 'aerotermia' and pa.codigo in ('ACS_200', 'ACS_250')) x)
) as comprobacion;
