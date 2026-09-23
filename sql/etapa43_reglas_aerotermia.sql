-- =============================================================================
-- Sysefen · Etapa 43 · Las reglas de aerotermia
--
-- QUÉ SE MONTA:
--   Lo medido en los 20 presupuestos de aerotermia (MOTOR-PRESUPUESTOS.md §3),
--   puesto como filas. La potencia la pone la persona: calcularla desde la casa
--   no está calibrado y no se inventa aquí.
--
--     Total = máquina (por kW, de la tarifa Vaillant)
--           + KIT BASE 7.365 €            (ya sembrado en la etapa 38)
--           + grupo de bombeo × circuitos
--           + colector si hay 2 o 3 circuitos
--           + extras: sustituir caldera, acumulador de ACS, apoyo eléctrico,
--                     limpieza del circuito existente
--
--   Las partidas de precio cerrado van con `precio_fijo` porque no tienen
--   referencia de catálogo: son partidas de Sysefen, no material de fábrica.
--   La máquina sí sale de la tarifa, con su referencia y su precio.
--
-- LO QUE NO ESTÁ CALIBRADO, Y SE DEJA DICHO:
--   · Temperaturas mixtas (suelo 35 °C + radiadores 50 °C) necesitan grupo CON
--     mezcladora. No hay ningún presupuesto cerrado con ese caso, así que no
--     hay regla: sale el grupo sin mezcladora y se corrige a mano.
--   · «Se mantiene» cuenta como circuito, igual que los demás emisores. Si en
--     la práctica no debe contar, se cambia la fórmula de `circuitos`.
--   · Los acumuladores UniSTOR no están en la tarifa cargada: van a precio
--     cerrado (2.035 y 2.265 €), como salían en los presupuestos.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

-- 1 · El conjunto de reglas vigente -------------------------------------------
insert into public.conjuntos_reglas (categoria, version, vigente_desde, notas)
values ('aerotermia', '2026.1', current_date,
        'Medido sobre 20 presupuestos cerrados. La potencia la pone la persona.')
on conflict (categoria, version) do nothing;

-- 2 · Lo que las reglas consultan ---------------------------------------------
insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion)
values
  ('aerotermia', 'potencia_diseno_kw', 'Potencia de diseño', 'kW',
   'si(carga_termica_kw > 0, carga_termica_kw, potencia_kw)', 1,
   'La de la ficha si está; si no, la que se escribe en la pantalla. SIN CALCULAR desde el inmueble: falta calibrarlo.'),

  ('aerotermia', 'circuitos', 'Circuitos', 'ud',
   'max(1, cuenta(emisores_previstos))', 2,
   'Cada temperatura distinta es un circuito. Manda el grupo de bombeo y el colector.'),

  ('aerotermia', 'acs_litros', 'Acumulador de ACS', 'l',
   'max(acs_acumulador_litros, acs_litros_manual)', 3,
   'Litros del acumulador. 0 = no lleva.'),

  ('aerotermia', 'sustituye_caldera', 'Sustituye caldera', '',
   'si(sistema_actual = ''ninguno'', 0, si(sistema_actual = '''', 0, 1))', 4,
   'Si había algo antes, hay que retirarlo y empalmar: es el A103.')
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden,
      etiqueta = excluded.etiqueta, descripcion = excluded.descripcion;

-- 3 · Las partidas de precio cerrado ------------------------------------------
insert into public.partidas (categoria, codigo, nombre) values
  ('aerotermia', 'A106',     'Grupo de bombeo sin mezcladora'),
  ('aerotermia', 'COLECTOR_2', 'Colector de 2 grupos'),
  ('aerotermia', 'COLECTOR_3', 'Colector de 3 grupos'),
  ('aerotermia', 'A103',     'Sustitución de caldera'),
  ('aerotermia', 'ACS_200',  'Acumulador de ACS 200 l'),
  ('aerotermia', 'ACS_250',  'Acumulador de ACS 250 l'),
  ('aerotermia', 'APOYO',    'Resistencia eléctrica de apoyo'),
  ('aerotermia', 'A111',     'Limpieza del circuito existente')
on conflict (categoria, codigo) do nothing;

insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, detalle_tecnico, formula_cantidad, orden)
select p.id, v.concepto, v.precio, v.detalle, '1', 1
  from public.partidas p
  join (values
    ('A106',       'A106: Grupo de bombeo sin mezcladora 1", DN25', 825.00,
     'Grupo de bombeo con bomba de alta eficiencia, llaves de corte y termómetros'),
    ('COLECTOR_2', 'Colector para 2 grupos de bombeo', 335.00, 'Colector de impulsión y retorno con aislamiento'),
    ('COLECTOR_3', 'Colector para 3 grupos de bombeo', 525.00, 'Colector de impulsión y retorno con aislamiento'),
    ('A103',       'A103: Sustitución de caldera por bomba de calor', 850.00,
     'Retirada de la caldera existente, adaptación hidráulica y gestión del residuo'),
    ('ACS_200',    'UniSTOR plus VIH RW 200/2 B', 2035.00,
     'Acumulador de ACS de 200 l para bomba de calor, con serpentín de gran superficie'),
    ('ACS_250',    'UniSTOR plus VIH RW 250/2 B', 2265.00,
     'Acumulador de ACS de 250 l para bomba de calor, con serpentín de gran superficie'),
    ('APOYO',      'Resistencia eléctrica de apoyo', 250.00,
     'Resistencia de apoyo para los días de más frío y para el ciclo antilegionela'),
    ('A111',       'A111: Limpieza del circuito existente', 500.00,
     'Limpieza química del circuito de emisores antes de conectar la bomba de calor')
  ) as v(codigo, concepto, precio, detalle) on v.codigo = p.codigo
 where p.categoria = 'aerotermia'
   and not exists (select 1 from public.partidas_items pi where pi.partida_id = p.id);

-- 4 · Las reglas ---------------------------------------------------------------
-- 4a · El kit base, siempre.
insert into public.reglas (conjunto_id, tipo, partida_id, formula_cantidad, seccion, prioridad, notas)
select c.id, 'condicional', p.id, '1', 'Instalación', 100,
       'Kit base: 7.365 € idénticos en seis presupuestos.'
  from public.conjuntos_reglas c
  join public.partidas p on p.categoria = 'aerotermia' and p.codigo = 'KIT_BASE'
 where c.categoria = 'aerotermia' and c.version = '2026.1'
   and not exists (select 1 from public.reglas r where r.conjunto_id = c.id and r.partida_id = p.id);

-- 4b · La máquina, por tramo de potencia. Referencias de la tarifa Vaillant
--      2025 (packs básicos sensoCOMFORT inalámbrico). Para Midea o Saunier se
--      añaden las mismas filas con `condicion` {"marca": "..."} y más prioridad.
insert into public.reglas (conjunto_id, tipo, variable, minimo, maximo, producto_ref, formula_cantidad, seccion, prioridad, notas)
select c.id, 'seleccion', 'potencia_diseno_kw', v.minimo, v.maximo, v.ref, '1', 'Equipos', 50, v.nota
  from public.conjuntos_reglas c
  join (values
    (0.01, 5.0,   '0020306791', 'aroTHERM plus 4 kW'),
    (5.01, 7.0,   '0020306793', 'aroTHERM plus 6 kW'),
    (7.01, 10.0,  '0020306795', 'aroTHERM plus 8 kW'),
    (10.01, 13.5, '0020306797', 'aroTHERM plus 12 kW'),
    (13.51, 99.0, '0020306801', 'aroTHERM plus 15 kW')
  ) as v(minimo, maximo, ref, nota) on true
 where c.categoria = 'aerotermia' and c.version = '2026.1'
   and not exists (select 1 from public.reglas r where r.conjunto_id = c.id and r.producto_ref = v.ref);

-- 4c · Grupo de bombeo por circuito, colector según cuántos, y los extras.
insert into public.reglas (conjunto_id, tipo, partida_id, condicion, formula_cantidad, seccion, prioridad, notas)
select c.id, v.tipo, p.id, v.condicion::jsonb, v.formula, v.seccion, v.prioridad, v.nota
  from public.conjuntos_reglas c
  join (values
    ('A106',       'cantidad',    null,                          'circuitos', 'Instalación', 40,
     'Uno por circuito. Observado ×1, ×2 y ×3 en presupuestos reales.'),
    ('COLECTOR_2', 'condicional', '{"circuitos": 2}',            '1', 'Instalación', 40, 'Solo con 2 circuitos.'),
    ('COLECTOR_3', 'condicional', '{"circuitos": [3,4,5,6]}',    '1', 'Instalación', 40, 'Con 3 o más circuitos.'),
    ('A103',       'condicional', '{"sustituye_caldera": 1}',    '1', 'Instalación', 30, 'Había caldera u otro sistema.'),
    ('ACS_200',    'condicional', '{"acs_200": 1}',              '1', 'Equipos', 30, 'Acumulador de 200 l.'),
    ('ACS_250',    'condicional', '{"acs_250": 1}',              '1', 'Equipos', 30, 'Acumulador de 250 l.'),
    ('APOYO',      'condicional', '{"apoyo_electrico": true}',   '1', 'Equipos', 20, 'Resistencia de apoyo.'),
    ('A111',       'condicional', '{"limpieza_circuito": true}', '1', 'Instalación', 20,
     'Se reaprovecha el circuito de emisores: hay que limpiarlo.')
  ) as v(codigo, tipo, condicion, formula, seccion, prioridad, nota) on true
  join public.partidas p on p.categoria = 'aerotermia' and p.codigo = v.codigo
 where c.categoria = 'aerotermia' and c.version = '2026.1'
   and not exists (select 1 from public.reglas r where r.conjunto_id = c.id and r.partida_id = p.id);

-- Los dos acumuladores se eligen por litros, y eso es una variable más.
insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion)
values
  ('aerotermia', 'acs_200', 'Acumulador de 200 l', '',
   'si(acs_litros > 0 y acs_litros <= 220, 1, 0)', 5, 'Hasta 220 l se pone el de 200.'),
  ('aerotermia', 'acs_250', 'Acumulador de 250 l', '',
   'si(acs_litros > 220, 1, 0)', 6, 'Por encima de 220 l, el de 250.')
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden, descripcion = excluded.descripcion;

commit;

-- =============================================================================
-- COMPROBACIONES
--   select codigo, orden, formula from public.variables_derivadas
--    where categoria = 'aerotermia' order by orden;
--
--   select r.tipo, r.variable, r.minimo, r.maximo, coalesce(p.codigo, r.producto_ref) as que,
--          r.condicion, r.formula_cantidad
--     from public.reglas r
--     join public.conjuntos_reglas c on c.id = r.conjunto_id
--     left join public.partidas p on p.id = r.partida_id
--    where c.categoria = 'aerotermia' order by r.prioridad desc;
--
--   El kit base sigue sumando 7.365 €:
--   select sum(precio_fijo) from public.partidas_items pi
--     join public.partidas p on p.id = pi.partida_id
--    where p.categoria = 'aerotermia' and p.codigo = 'KIT_BASE';
-- =============================================================================
