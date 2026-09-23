-- =============================================================================
-- Sysefen · Etapa 45 · La carga adicional de refrigerante (aire acondicionado)
--
-- POR QUÉ:
--   El equipo viene de fábrica con gas para una longitud base de tubería. Lo
--   que pase de ahí hay que cargarlo, y eso no estaba en el presupuesto: solo
--   estaba el C103, que cobra el metro de más (tubería, aislamiento y mano de
--   obra) pero no el gas.
--
--   Son dos cuentas distintas y con longitudes distintas:
--     C103        metros de más     3 m incluidos por equipo (etapa 41)
--     Gas extra   kilos de más      5 m en equipos básicos, 7,5 en multisplit
--
-- DE DÓNDE SALEN LOS NÚMEROS:
--   · Longitud base: la carga de fábrica cubre unos 5 m en equipos básicos y
--     7,5 m en muchos inverter y multisplit (10 m en alguna marca).
--   · Gramos por metro: del orden de 20 g/m con línea de líquido de 1/4" y
--     24 g/m con diámetros mayores. El manual de multisplit de Midea da
--     12 g/m con 1/4" y 24 g/m con diámetro mayor, a partir de 7,5 m.
--   · EL VALOR BUENO ES SIEMPRE EL DEL MANUAL DEL EQUIPO. Por eso esto vive en
--     `tablas_lookup` y no en el código: se corrige por marca sin tocar la app.
--
-- ⚠ EL PRECIO DEL KILO LO PONES TÚ: está abajo, en una sola línea marcada.
--   Mientras esté a 0, la línea sale a cero y se ve que falta ponerlo.
--   Se puede ejecutar otra vez para cambiarlo: la partida se rehace.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- EL PRECIO DEL KILO DE R32, PUESTO. ← CAMBIA ESTE NÚMERO Y EJECUTA
-- ---------------------------------------------------------------------------
create temporary table precio_gas on commit drop as select 0.00::numeric as eur_kg;


-- 1 · Cuántos metros van incluidos de gas, según el sistema -------------------
insert into public.tablas_lookup (categoria, clave, entrada, valor, notas)
values
  ('aire_acondicionado', 'metros_gas_incluidos', 'defecto',    5,
   'Longitud que cubre la carga de fábrica. 5 m en equipos básicos.'),
  ('aire_acondicionado', 'metros_gas_incluidos', 'split_1x1',  5,   'Split 1x1: 5 m.'),
  ('aire_acondicionado', 'metros_gas_incluidos', 'multisplit', 7.5, 'Multisplit: 7,5 m (manual Midea).'),
  ('aire_acondicionado', 'metros_gas_incluidos', 'conductos',  7.5, 'Conductos: 7,5 m.'),
  ('aire_acondicionado', 'metros_gas_incluidos', 'cassette',   7.5, 'Cassette: 7,5 m.'),
  ('aire_acondicionado', 'metros_gas_incluidos', 'suelo_techo', 5,  'Suelo/techo: 5 m.'),
  ('aire_acondicionado', 'gramos_por_metro', 'defecto', 20,
   'Gramos de R32 por metro de más con línea de líquido de 1/4". Con diámetro mayor son unos 24.')
on conflict (categoria, clave, entrada) do nothing;

-- 2 · Los metros que pasan de la carga de fábrica, y los kilos que son --------
insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion)
values
  ('aire_acondicionado', 'metros_gas_exceso', 'Metros sin carga de fábrica', 'm',
   'max(0, metros_totales - lookup(''metros_gas_incluidos'', tipo_sistema) * unidades_exteriores)', 5,
   'La carga de fábrica cubre unos metros por unidad exterior; lo que pasa de ahí hay que cargarlo.'),

  ('aire_acondicionado', 'kg_gas_extra', 'Refrigerante adicional', 'kg',
   'redondea(metros_gas_exceso * lookup(''gramos_por_metro'', ''defecto'') / 1000, 2)', 6,
   'Kilos de R32 a añadir. El gramaje exacto es el del manual del equipo.')
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden,
      etiqueta = excluded.etiqueta, unidad = excluded.unidad, descripcion = excluded.descripcion;

-- 3 · La partida y su regla ---------------------------------------------------
insert into public.partidas (categoria, codigo, nombre)
values ('aire_acondicionado', 'GAS_EXTRA', 'Carga adicional de refrigerante')
on conflict (categoria, codigo) do nothing;

-- Se rehace entera para poder cambiar el precio ejecutando esto otra vez.
delete from public.partidas_items pi
 using public.partidas p
 where pi.partida_id = p.id and p.categoria = 'aire_acondicionado' and p.codigo = 'GAS_EXTRA';

insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, detalle_tecnico, formula_cantidad, orden)
select p.id,
       'Carga adicional de refrigerante R32 (kg)',
       (select eur_kg from precio_gas),
       'Kilos de refrigerante que hay que añadir por la tubería que pasa de la carga de fábrica del equipo',
       'kg_gas_extra', 1
  from public.partidas p
 where p.categoria = 'aire_acondicionado' and p.codigo = 'GAS_EXTRA';

insert into public.reglas (conjunto_id, tipo, partida_id, formula_cantidad, seccion, prioridad, notas)
select c.id, 'cantidad', p.id, '1', 'Instalación', 35,
       'Los kilos salen de los metros que pasan de la carga de fábrica. El C103 cobra el metro; esto, el gas.'
  from public.conjuntos_reglas c
  join public.partidas p on p.categoria = 'aire_acondicionado' and p.codigo = 'GAS_EXTRA'
 where c.categoria = 'aire_acondicionado' and c.vigente_hasta is null
   and not exists (select 1 from public.reglas r where r.conjunto_id = c.id and r.partida_id = p.id);

commit;

-- =============================================================================
-- COMPROBACIONES
--   El precio que ha quedado puesto:
--   select pi.concepto_libre, pi.precio_fijo, pi.formula_cantidad
--     from public.partidas_items pi join public.partidas p on p.id = pi.partida_id
--    where p.codigo = 'GAS_EXTRA';
--
--   Los metros incluidos por sistema:
--   select entrada, valor from public.tablas_lookup
--    where categoria = 'aire_acondicionado' and clave = 'metros_gas_incluidos' order by entrada;
-- =============================================================================
