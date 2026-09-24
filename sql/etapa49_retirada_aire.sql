-- =============================================================================
-- Sysefen · Etapa 49 · Retirar los equipos de aire viejos
--
-- QUÉ RESUELVE:
--   La ficha ya preguntaba «equipos a retirar» y si la preinstalación era
--   aprovechable, pero el presupuesto no lo cobraba. Es trabajo con precio:
--
--     · Retirar una interior vieja ............................. 80 € por máquina
--       Descolgar, recuperar el gas y llevarla al punto verde.
--     · Retirar una interior y RECUPERAR su tubería ........... 150 € por máquina
--       Además de lo anterior: limpiar la tubería y dejarla con nitrógeno un
--       tiempo para comprobar que no pierde. Solo si la preinstalación se va
--       a aprovechar (preinstalacion_existente = si_aprovechable). Cada
--       interior tiene su tubería hasta la exterior, por eso es por máquina.
--     · Retirar una exterior vieja .............................. 80 € por máquina
--       Sacarla y llevarla al punto verde. Siempre que hay equipos viejos.
--
--   Cuántas exteriores viejas hay lo dice la ficha (campo nuevo
--   exteriores_a_retirar_n). Si no se dice y hay interiores que retirar, se
--   cuenta una.
--
-- Idempotente. Las partidas se rehacen para poder cambiar el precio aquí.
-- =============================================================================

begin;

-- 1 · Lo que consultan las reglas -------------------------------------------
insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion)
values
  ('aire_acondicionado', 'n_retirar', 'Interiores viejas a retirar', 'ud',
   'max(0, equipos_a_retirar_n)', 20,
   'Las máquinas interiores antiguas que hay que quitar.'),

  ('aire_acondicionado', 'recupera_tuberia', 'Se recupera la tubería', '',
   'si(preinstalacion_existente = ''si_aprovechable'', 1, 0)', 21,
   'Si la preinstalación se aprovecha, la retirada lleva limpieza y prueba con nitrógeno.'),

  ('aire_acondicionado', 'n_retirar_ext', 'Exteriores viejas a retirar', 'ud',
   'si(exteriores_a_retirar_n > 0, exteriores_a_retirar_n, si(n_retirar > 0, 1, 0))', 22,
   'Las que diga la ficha; si no lo dice y hay interiores viejas, una.')
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden,
      etiqueta = excluded.etiqueta, unidad = excluded.unidad, descripcion = excluded.descripcion;

-- 2 · Las partidas, a precio de Sysefen ---------------------------------------
insert into public.partidas (categoria, codigo, nombre) values
  ('aire_acondicionado', 'RETIRAR_INT',     'Retirada de unidad interior antigua'),
  ('aire_acondicionado', 'RETIRAR_INT_TUB', 'Retirada de unidad interior antigua con recuperación de tubería'),
  ('aire_acondicionado', 'RETIRAR_EXT',     'Retirada de unidad exterior antigua')
on conflict (categoria, codigo) do nothing;

delete from public.partidas_items pi
 using public.partidas p
 where pi.partida_id = p.id and p.categoria = 'aire_acondicionado'
   and p.codigo in ('RETIRAR_INT', 'RETIRAR_INT_TUB', 'RETIRAR_EXT');

insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, detalle_tecnico, formula_cantidad, orden)
select p.id, v.concepto, v.precio, v.detalle, v.formula, 1
  from public.partidas p
  join (values
    ('RETIRAR_INT', 'Retirada de unidad interior antigua', 80.00,
     'Descolgado del equipo, recuperación del refrigerante y traslado a punto limpio', 'n_retirar'),
    ('RETIRAR_INT_TUB', 'Retirada de unidad interior antigua con recuperación de la tubería', 150.00,
     'Descolgado del equipo, recuperación del refrigerante, limpieza de la línea frigorífica existente y prueba de estanqueidad con nitrógeno', 'n_retirar'),
    ('RETIRAR_EXT', 'Retirada de unidad exterior antigua', 80.00,
     'Desmontaje de la unidad exterior y traslado a punto limpio', 'n_retirar_ext')
  ) as v(codigo, concepto, precio, detalle, formula) on v.codigo = p.codigo
 where p.categoria = 'aire_acondicionado';

-- 3 · Las reglas ---------------------------------------------------------------
delete from public.reglas r
 using public.partidas p, public.conjuntos_reglas c
 where r.partida_id = p.id and r.conjunto_id = c.id
   and c.categoria = 'aire_acondicionado'
   and p.codigo in ('RETIRAR_INT', 'RETIRAR_INT_TUB', 'RETIRAR_EXT');

insert into public.reglas (conjunto_id, tipo, condicion, partida_id, formula_cantidad, seccion, prioridad, notas)
select c.id, 'cantidad', v.condicion::jsonb, p.id, '1', 'Retirada', 30, v.nota
  from public.conjuntos_reglas c
  join (values
    ('RETIRAR_INT',     '{"recupera_tuberia": 0}', 'Interior vieja sin aprovechar la tubería: 80 € por máquina.'),
    ('RETIRAR_INT_TUB', '{"recupera_tuberia": 1}', 'Interior vieja recuperando la tubería: 150 € por máquina.'),
    ('RETIRAR_EXT',     '{}',                      'Exterior vieja: 80 € por máquina, siempre.')
  ) as v(codigo, condicion, nota) on true
  join public.partidas p on p.categoria = 'aire_acondicionado' and p.codigo = v.codigo
 where c.categoria = 'aire_acondicionado' and c.vigente_hasta is null;

commit;

-- =============================================================================
-- COMPROBACIONES
--   select p.codigo, pi.concepto_libre, pi.precio_fijo, pi.formula_cantidad
--     from public.partidas p join public.partidas_items pi on pi.partida_id = p.id
--    where p.codigo like 'RETIRAR%' order by 1;
--
--   Para cambiar un precio: edítalo arriba y vuelve a ejecutar este archivo.
-- =============================================================================
