-- =============================================================================
-- Sysefen · Etapa 41 · Las reglas de aire acondicionado
--
-- POR QUÉ ESTE OFICIO PRIMERO (MOTOR-PRESUPUESTOS.md §7):
--   Aerotermia y fotovoltaica necesitan calcular la potencia desde el inmueble,
--   y eso no está calibrado: los presupuestos del histórico empiezan con la
--   máquina ya elegida, así que no dicen qué m² llevaron a qué kW.
--
--   Aire acondicionado no tiene ese problema. Su magnitud es discreta —cuántas
--   unidades— y la visita la cuenta directamente. Es el único de los tres que
--   se puede automatizar entero hoy.
--
-- QUÉ SE SIEMBRA:
--   · El conjunto de reglas 2026.1 (vigente).
--   · Las variables derivadas: de las estancias de la ficha salen las unidades.
--   · El coeficiente de metros incluidos, que es lo único a ojo y por eso vive
--     en tablas_lookup, para poder calibrarlo sin tocar código.
--   · La regla que aplica la partida KIT_BASE (C100–C104), ya sembrada en la 38.
--
-- LO QUE NO ESTÁ Y ES A PROPÓSITO:
--   La elección de la máquina. El motor no la inventa: la pone la persona desde
--   el catálogo en la pantalla del presupuesto. Cuando haya tarifas de aire
--   cargadas y se sepa qué modelo va con cuántos kW, se añaden aquí reglas de
--   tipo 'seleccion' y deja de ser manual.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

-- 1 · El conjunto vigente ------------------------------------------------------
insert into public.conjuntos_reglas (categoria, version, vigente_desde, notas)
values ('aire_acondicionado', '2026.1', current_date,
        'Cantidades por unidad verificadas en los 3 presupuestos con códigos C100-C104.')
on conflict (categoria, version) do nothing;

-- 2 · Las variables derivadas ---------------------------------------------------
-- Se evalúan en orden: cada una puede usar las anteriores.
insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion)
values
  ('aire_acondicionado', 'unidades_interiores', 'Unidades interiores', 'ud',
   'cuenta(estancias)', 1,
   'Una por estancia a climatizar. Es lo que manda en C100, C101 y C104.'),

  ('aire_acondicionado', 'unidades_exteriores', 'Unidades exteriores', 'ud',
   'si(tipo_sistema = ''split_1x1'', unidades_interiores, 1)', 2,
   'Un multisplit lleva una exterior; los 1x1, una por estancia. Si el sistema '
   'mezcla (un 2x1 más un mural aparte), la persona lo corrige en la pantalla.'),

  ('aire_acondicionado', 'metros_totales', 'Metros de línea', 'm',
   'suma(distancias_lineas, ''metros'')', 3,
   'La suma de lo que se midió en la visita, equipo por equipo.'),

  ('aire_acondicionado', 'metros_exceso', 'Metros de exceso', 'm',
   'max(0, metros_totales - lookup(''metros_incluidos'', ''defecto'') * unidades_interiores)', 4,
   'Lo que pasa de los metros que van incluidos por equipo. Es el C103.')
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden,
      etiqueta = excluded.etiqueta, descripcion = excluded.descripcion;

-- 3 · El coeficiente a calibrar --------------------------------------------------
-- Los 3 presupuestos con códigos no traen los metros medidos, así que este 3 es
-- el estándar del oficio, no un dato observado. Está aquí, y no en el código,
-- justo para poder cambiarlo cuando haya diez visitas con sus metros.
insert into public.tablas_lookup (categoria, clave, entrada, valor, notas)
values ('aire_acondicionado', 'metros_incluidos', 'defecto', 3,
        'Metros de línea incluidos por equipo. SIN CALIBRAR: estándar del oficio.')
on conflict (categoria, clave, entrada) do nothing;

-- 4 · La regla: aplicar el kit de instalación ------------------------------------
insert into public.reglas (conjunto_id, tipo, partida_id, formula_cantidad, seccion, prioridad, notas)
select c.id, 'condicional', p.id, '1', 'Instalación', 100,
       'C100-C104. Las cantidades salen de las variables, una por unidad.'
  from public.conjuntos_reglas c
  join public.partidas p on p.categoria = 'aire_acondicionado' and p.codigo = 'KIT_BASE'
 where c.categoria = 'aire_acondicionado' and c.version = '2026.1'
   and not exists (
     select 1 from public.reglas r where r.conjunto_id = c.id and r.partida_id = p.id);

commit;

-- Comprobación rápida (opcional):
--   select codigo, orden, formula from public.variables_derivadas
--    where categoria = 'aire_acondicionado' order by orden;
--   select r.tipo, r.seccion, p.codigo from public.reglas r
--     join public.conjuntos_reglas c on c.id = r.conjunto_id
--     left join public.partidas p on p.id = r.partida_id
--    where c.categoria = 'aire_acondicionado';
--
-- Para calibrar los metros incluidos cuando haya datos:
--   update public.tablas_lookup set valor = 4
--    where categoria = 'aire_acondicionado' and clave = 'metros_incluidos';
