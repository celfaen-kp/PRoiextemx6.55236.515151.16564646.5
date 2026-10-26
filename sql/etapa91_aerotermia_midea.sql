-- =============================================================================
-- Sysefen · Etapa 91 · Aerotermia: elegir marca, Vaillant o Midea (Enzo, 26 oct 2026)
--
-- QUÉ HACE:
--   · Las reglas de la máquina Vaillant (aroTHERM plus) pasan a valer solo con
--     marca_aerotermia = 'vaillant' o sin marca (fichas antiguas).
--   · Se añaden las de Midea (monobloc MHC-V…/D2N8B2E30 de la tarifa Midea
--     2026) por los mismos tramos de potencia, con marca_aerotermia = 'midea'.
--     SUPUESTO: la serie D2N8B2E30 y los cortes de potencia; se cambian aquí.
--   · El ACS (uniSTOR) y el resto del kit no cambian de marca: si con Midea hace
--     falta otro acumulador, se cambia desde el catálogo.
-- Idempotente.
-- =============================================================================

begin;

update public.reglas r set condicion = '{"marca_aerotermia": ["vaillant", ""]}'::jsonb
  from public.conjuntos_reglas c
 where c.id = r.conjunto_id and c.categoria = 'aerotermia' and c.vigente_hasta is null
   and r.tipo = 'seleccion' and r.producto_ref in ('0020306791', '0020306793', '0020306795', '0020306797', '0020306801');

insert into public.reglas (conjunto_id, tipo, variable, minimo, maximo, condicion, producto_ref, formula_cantidad, seccion, prioridad, notas)
select c.id, 'seleccion', 'potencia_diseno_kw', v.minimo, v.maximo, '{"marca_aerotermia": "midea"}'::jsonb, v.ref, '1', 'Equipos', 50, v.nota
  from public.conjuntos_reglas c
  join (values
    (0.01, 5.0,   '14082171', 'Midea MHC-V4W/D2N8B2E30 · 4 kW'),
    (5.01, 7.0,   '14082172', 'Midea MHC-V6W/D2N8B2E30 · 6 kW'),
    (7.01, 10.0,  '14082173', 'Midea MHC-V8W/D2N8B2E30 · 8 kW'),
    (10.01, 11.0, '14082174', 'Midea MHC-V10W/D2N8B2E30 · 10 kW'),
    (11.01, 13.5, '14082175', 'Midea MHC-V12W/D2N8-B2E30 · 12 kW'),
    (13.51, 99.0, '14082176', 'Midea MHC-V16W/D2N8-B2E30 · 16 kW')
  ) as v(minimo, maximo, ref, nota) on true
 where c.categoria = 'aerotermia' and c.vigente_hasta is null
   and not exists (select 1 from public.reglas r where r.conjunto_id = c.id and r.producto_ref = v.ref);

commit;

-- COMPROBACIÓN
select r.producto_ref, p.nombre, r.minimo, r.maximo, r.condicion::text from public.reglas r
  join public.conjuntos_reglas c on c.id = r.conjunto_id left join public.productos p on p.referencia = r.producto_ref
 where c.categoria = 'aerotermia' and c.vigente_hasta is null and r.tipo = 'seleccion' order by r.condicion::text, r.minimo;
