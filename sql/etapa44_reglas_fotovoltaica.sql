-- =============================================================================
-- Sysefen · Etapa 44 · Las reglas de fotovoltaica
--
-- QUÉ SE MONTA:
--   Lo medido en los 21 presupuestos de fotovoltaica (MOTOR-PRESUPUESTOS.md §3):
--
--     Total = kit fijo (por tramo de kWp)
--           + 110 € × nº de paneles      ← en los 21, sin una sola excepción
--           + inversor (por tramo de kWp)
--           + batería, si la hay
--
--   El kit de 5–6 kWp ya lo sembró la etapa 38: material eléctrico, estructura,
--   mano de obra, trámites en Industria, gestiones, puesta en marcha y medidor.
--
--   AVISO: esos siete renglones suman 3.742 €, pero el análisis daba un kit de
--   5.445 € «idéntico en seis presupuestos». Faltan 1.703 € que no están
--   desglosados en ningún sitio. Aquí NO se añaden a ojo: el motor saca por
--   ahora 3.742 € de kit y, en cuanto se sepa qué falta, se arregla añadiendo
--   los renglones que sean a la partida KIT_BASE de solar. Está en
--   pruebas/motor-solar.js para que no se olvide.
--
--   Los kWp no se preguntan: salen de los paneles y de sus vatios, que es como
--   se cuenta en la visita (`modulos_estimados`).
--
-- LO QUE NO ESTÁ CALIBRADO, Y POR ESO NO TIENE REGLA:
--   · LA BATERÍA. Es una magnitud propia, no un extra: sin batería el precio
--     por kWp es estable (1.373–1.675 €), y con batería se va a 2.835–4.140 €
--     porque la batería manda y no escala con los kWp. Con los presupuestos que
--     hay no se puede sacar un precio por kWh, así que se añade a mano desde el
--     catálogo y la pantalla lo dice.
--   · POR ENCIMA DE 12 kWp. Solo hay un caso (145 kWp con marquesinas, kit de
--     56.450 €), que es otra liga. Hasta que haya más, el motor pone los
--     paneles y avisa de que el kit y el inversor van a mano.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

insert into public.conjuntos_reglas (categoria, version, vigente_desde, notas)
values ('solar', '2026.1', current_date,
        'Medido sobre 21 presupuestos cerrados. El panel a 110 €/ud en todos.')
on conflict (categoria, version) do nothing;

-- 1 · De los paneles salen los kWp ---------------------------------------------
insert into public.tablas_lookup (categoria, clave, entrada, valor, notas)
values ('solar', 'wp_panel', 'defecto', 510,
        'Vatios por panel cuando no se dice. Los presupuestos van de 450 a 510 Wp.')
on conflict (categoria, clave, entrada) do nothing;

insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion)
values
  ('solar', 'n_paneles', 'Paneles', 'ud',
   'max(modulos_estimados, paneles_manual)', 1,
   'Los de la ficha de la visita, o los que se escriben en la pantalla.'),

  ('solar', 'wp_panel', 'Vatios por panel', 'Wp',
   'si(wp_manual > 0, wp_manual, lookup(''wp_panel'', ''defecto''))', 2,
   'Cambia el número de paneles que hacen falta para los mismos kWp.'),

  ('solar', 'kwp', 'Potencia pico', 'kWp',
   'redondea(n_paneles * wp_panel / 1000, 2)', 3,
   'No se pregunta: sale de los paneles. 10 paneles de 510 Wp son 5,1 kWp.')
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden,
      etiqueta = excluded.etiqueta, descripcion = excluded.descripcion;

-- 2 · Las partidas --------------------------------------------------------------
insert into public.partidas (categoria, codigo, nombre) values
  ('solar', 'PANEL',    'Paneles fotovoltaicos'),
  ('solar', 'KIT_10',   'Kit base instalación fotovoltaica 10 kWp'),
  ('solar', 'INV_6',    'Inversor hasta 6 kWp'),
  ('solar', 'INV_10',   'Inversor 10 kWp')
on conflict (categoria, codigo) do nothing;

insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, detalle_tecnico, formula_cantidad, orden)
select p.id, v.concepto, v.precio, v.detalle, v.formula, 1
  from public.partidas p
  join (values
    ('PANEL',  'Panel fotovoltaico', 110.00,
     'Módulo monocristalino de alta eficiencia con 25 años de garantía de producción', 'n_paneles'),
    -- 1.606–1.612 € en los presupuestos de 5–6 kWp: se toma 1.610.
    ('INV_6',  'Inversor y monitorización', 1610.00,
     'Inversor con monitorización de producción y consumo, y protecciones de corriente continua', '1'),
    ('INV_10', 'Inversor y monitorización', 2100.00,
     'Inversor con monitorización de producción y consumo, y protecciones de corriente continua', '1')
  ) as v(codigo, concepto, precio, detalle, formula) on v.codigo = p.codigo
 where p.categoria = 'solar'
   and not exists (select 1 from public.partidas_items pi where pi.partida_id = p.id);

-- El kit de 10 kWp: 8.560 €. Del análisis sale el TOTAL, no el reparto: el
-- desglose del de 5–6 kWp está medido y este no, así que va en una sola línea
-- en vez de inventarle partidas. Cuando haya más presupuestos de 10 kWp se
-- abre igual que el otro.
insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, detalle_tecnico, formula_cantidad, orden)
select p.id, 'Instalación fotovoltaica 10 kWp', 8560.00,
       'Material eléctrico, estructura de soportación, mano de obra, trámites en Industria, gestiones, puesta en marcha y medidor de energía',
       '1', 1
  from public.partidas p
 where p.categoria = 'solar' and p.codigo = 'KIT_10'
   and not exists (select 1 from public.partidas_items pi where pi.partida_id = p.id);

-- 3 · Las reglas -----------------------------------------------------------------
-- Los paneles: 110 € por unidad, siempre.
insert into public.reglas (conjunto_id, tipo, partida_id, formula_cantidad, seccion, prioridad, notas)
select c.id, 'cantidad', p.id, '1', 'Equipos', 60, '110 €/ud en los 21 presupuestos, sin excepción.'
  from public.conjuntos_reglas c
  join public.partidas p on p.categoria = 'solar' and p.codigo = 'PANEL'
 where c.categoria = 'solar' and c.version = '2026.1'
   and not exists (select 1 from public.reglas r where r.conjunto_id = c.id and r.partida_id = p.id);

-- El kit y el inversor, por tramo de kWp.
insert into public.reglas (conjunto_id, tipo, variable, minimo, maximo, partida_id, formula_cantidad, seccion, prioridad, notas)
select c.id, 'seleccion', 'kwp', v.minimo, v.maximo, p.id, '1', v.seccion, 50, v.nota
  from public.conjuntos_reglas c
  join (values
    ('KIT_BASE', 0.01, 6.50,  'Instalación', 'Kit de 5–6 kWp: 5.445 €, idéntico en seis presupuestos.'),
    ('KIT_10',   6.51, 12.00, 'Instalación', 'Kit de 10 kWp: 8.560 €.'),
    ('INV_6',    0.01, 6.50,  'Equipos',     'Inversor de 5–6 kWp.'),
    ('INV_10',   6.51, 12.00, 'Equipos',     'Inversor de 10 kWp.')
  ) as v(codigo, minimo, maximo, seccion, nota) on true
  join public.partidas p on p.categoria = 'solar' and p.codigo = v.codigo
 where c.categoria = 'solar' and c.version = '2026.1'
   and not exists (select 1 from public.reglas r where r.conjunto_id = c.id and r.partida_id = p.id);

commit;

-- =============================================================================
-- COMPROBACIONES
--   Los dos kits y su importe:
--   select p.codigo, sum(pi.precio_fijo) from public.partidas p
--     join public.partidas_items pi on pi.partida_id = p.id
--    where p.categoria = 'solar' group by p.codigo order by 1;
--   (KIT_BASE 5.445 · KIT_10 8.560 · INV_6 1.610 · INV_10 2.100 · PANEL 110)
--
--   Las reglas:
--   select r.tipo, r.variable, r.minimo, r.maximo, p.codigo, r.formula_cantidad
--     from public.reglas r
--     join public.conjuntos_reglas c on c.id = r.conjunto_id
--     join public.partidas p on p.id = r.partida_id
--    where c.categoria = 'solar' order by r.prioridad desc, p.codigo;
-- =============================================================================
