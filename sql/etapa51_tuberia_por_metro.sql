-- =============================================================================
-- Sysefen · Etapa 51 · Aire: la tubería por metro y el gas según la máquina
--
-- POR QUÉ:
--   Las partidas C100/C103 venían de los presupuestos hechos a mano: C100
--   «Tubería frigorífica y aislamiento» a 245 € por interior INCLUÍA 3 m de
--   tubo más la conexión, y C103 «Exceso metro» a 52 €/m cobraba lo que
--   pasaba de esos 3 m. Dos líneas para una misma cosa, y con unidades que no
--   son las del oficio. Y el gas iba a 20 g/m fijos, sin mirar la máquina.
--
-- QUÉ CAMBIA (mismo total que antes cuando cada línea pasa de 3 m):
--   · C100 pasa a ser «Conexión frigorífica por equipo», 89 €/ud
--     (245 − 3 × 52): vacío, pruebas y puesta en marcha de cada interior.
--   · C103 pasa a ser «Tubería frigorífica y aislamiento», 52 €/m, por los
--     metros de cada interior hasta la exterior. Una sola línea, en metros.
--   · El gas se calcula POR ESTANCIA con los datos de su máquina: los metros
--     que pasan de la carga de fábrica × los g/m de esa máquina (Midea:
--     12 g/m hasta el tamaño 18, 24 g/m en el 24). Sale en kilos con tres
--     decimales (0,240 kg = 240 g), a precio por kilo.
--
-- ⚠ LOS PRECIOS ESTÁN AQUÍ ARRIBA, EN UNA SOLA TABLA. Cámbialos y ejecuta.
--
-- Idempotente. Requiere la etapa 48 (por_cada) y la función presupuestar 1.1.
-- =============================================================================

begin;

create temporary table precios_aire on commit drop as
select 89.00::numeric as conexion_ud,      -- C100 por unidad interior
       52.00::numeric as tuberia_m,        -- C103 por metro lineal (tubo + aislamiento)
       49.00::numeric as gas_kg;           -- R32, por kilo (se compra a 49,64 con descuento)

-- 1 · Las partidas dicen en qué unidad van ----------------------------------------
alter table public.partidas_items add column if not exists unidad text not null default 'ud';

-- 2 · C100 y C103, rehechas -----------------------------------------------------------
update public.partidas_items pi
   set concepto_libre  = 'C100: Conexión frigorífica por equipo',
       precio_fijo     = (select conexion_ud from precios_aire),
       detalle_tecnico = 'Conexión de la línea frigorífica a cada unidad interior: vacío, comprobación de estanqueidad y puesta en marcha',
       formula_cantidad = 'unidades_interiores',
       unidad          = 'ud'
  from public.partidas p
 where pi.partida_id = p.id and p.categoria = 'aire_acondicionado' and p.codigo = 'KIT_BASE'
   and pi.concepto_libre like 'C100:%';

update public.partidas_items pi
   set concepto_libre  = 'C103: Tubería frigorífica y aislamiento',
       precio_fijo     = (select tuberia_m from precios_aire),
       detalle_tecnico = 'Línea frigorífica de cobre con aislamiento, de cada unidad interior a la exterior, por metro lineal',
       formula_cantidad = 'metros_totales',
       unidad          = 'm'
  from public.partidas p
 where pi.partida_id = p.id and p.categoria = 'aire_acondicionado' and p.codigo = 'KIT_BASE'
   and pi.concepto_libre like 'C103:%';

-- 3 · El gas, por estancia y según su máquina -------------------------------------------
insert into public.tablas_lookup (categoria, clave, entrada, valor, notas) values
  ('aire_acondicionado', 'gramos_por_metro_tamano', 'defecto', 12, 'g de R32 por metro de más. Midea: 12 g/m con línea de líquido de 1/4".'),
  ('aire_acondicionado', 'gramos_por_metro_tamano', '7',  12, 'Tamaño 7.'),
  ('aire_acondicionado', 'gramos_por_metro_tamano', '9',  12, 'Tamaño 9.'),
  ('aire_acondicionado', 'gramos_por_metro_tamano', '12', 12, 'Tamaño 12.'),
  ('aire_acondicionado', 'gramos_por_metro_tamano', '18', 12, 'Tamaño 18.'),
  ('aire_acondicionado', 'gramos_por_metro_tamano', '24', 24, 'Tamaño 24: línea de líquido de 3/8", 24 g/m (manual Midea).'),
  ('aire_acondicionado', 'gramos_por_metro_tamano', '0',  0,  'Sin máquina: sin gas.'),
  ('aire_acondicionado', 'gramos_por_metro_tamano', '99', 0,  'Sin máquina: sin gas.')
on conflict (categoria, clave, entrada) do nothing;

insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion, por_cada)
values
  ('aire_acondicionado', 'gas_g_estancia', 'Gas de más de la estancia', 'g',
   'redondea(max(0, metros - lookup(''metros_gas_incluidos'', tipo_sistema)) * lookup(''gramos_por_metro_tamano'', tamano), 0)', 19,
   'Por estancia: los metros que pasan de la carga de fábrica × los g/m de su máquina.', 'estancias'),

  ('aire_acondicionado', 'kg_gas_extra', 'Refrigerante adicional', 'kg',
   'redondea(si(suma(estancias, ''metros'') > 0, suma(estancias, ''gas_g_estancia''), metros_gas_exceso * lookup(''gramos_por_metro'', ''defecto'')) / 1000, 3)', 20,
   'La suma de todas las estancias, en kilos con tres decimales (0,240 kg = 240 g). Fichas viejas sin metros por estancia: el cálculo antiguo.', null)
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden, por_cada = excluded.por_cada,
      etiqueta = excluded.etiqueta, unidad = excluded.unidad, descripcion = excluded.descripcion;

update public.partidas_items pi
   set concepto_libre  = 'Carga adicional de refrigerante R32',
       precio_fijo     = (select gas_kg from precios_aire),
       detalle_tecnico = 'Gramos que faltan por la tubería que pasa de la carga de fábrica de cada máquina (Midea: 12 g/m hasta el tamaño 18, 24 g/m en el 24). Precio por kilo.',
       formula_cantidad = 'kg_gas_extra',
       unidad          = 'kg'
  from public.partidas p
 where pi.partida_id = p.id and p.categoria = 'aire_acondicionado' and p.codigo = 'GAS_EXTRA';

commit;

-- =============================================================================
-- COMPROBACIONES
--   select p.codigo, pi.concepto_libre, pi.precio_fijo, pi.unidad, pi.formula_cantidad
--     from public.partidas p join public.partidas_items pi on pi.partida_id = p.id
--    where p.categoria = 'aire_acondicionado' order by p.codigo, pi.orden;
--
--   Dos interiores a 4 y 6 m (1x1, tamaños 12 y 9): C100 2 ud, C103 10 m,
--   gas (4−5→0) + (6−5)×12 = 12 g = 0,012 kg.
-- =============================================================================
