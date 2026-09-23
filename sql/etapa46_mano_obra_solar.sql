-- =============================================================================
-- Sysefen · Etapa 46 · La mano de obra de fotovoltaica, por vatio
--
-- POR QUÉ:
--   El kit de la etapa 38 llevaba la mano de obra dentro, a 725 € fijos. No es
--   fija: va a 0,40 € por vatio instalado, así que una instalación del doble de
--   potencia lleva el doble de trabajo.
--
-- Y DE PASO EXPLICA UN DESCUADRE:
--   Los siete renglones del kit de 5–6 kWp suman 3.742 €, pero el análisis de
--   los presupuestos daba un kit de 5.445 €. Quitando la mano de obra fija
--   quedan 3.017 €, y la diferencia hasta 5.445 son 2.428 €, que a 0,40 €/W son
--   6,07 kWp. Es decir: aquel "kit fijo" llevaba dentro la mano de obra de una
--   instalación de unos 6 kWp. No faltaba nada; estaba mal repartido.
--
-- QUÉ CAMBIA:
--   · La mano de obra sale del kit y pasa a ser su propia línea, calculada.
--   · El kit de 5–6 kWp queda en 3.017 € de material y gestiones.
--   · El de 10 kWp (8.560 €, una sola línea) se deja como está: es un total
--     observado y no se sabe cuánto de él era mano de obra. Cuando lleguen las
--     tarifas de Fronius y Enphase se abre igual que el otro.
--
-- PENDIENTE, cuando lleguen las listas de precios:
--   · Inversores Fronius y Enphase: hoy van a precio cerrado (1.610 y 2.100 €).
--   · Paneles Trina Solar: hoy van a 110 €/ud, que es lo observado en los 21
--     presupuestos. Con la tarifa cargada saldrán con su referencia y su precio.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

-- 1 · El precio del vatio, editable sin tocar la app --------------------------
insert into public.tablas_lookup (categoria, clave, entrada, valor, notas)
values ('solar', 'eur_por_vatio_mano_obra', 'defecto', 0.40,
        'Mano de obra de fotovoltaica por vatio instalado.')
on conflict (categoria, clave, entrada) do update set valor = excluded.valor, notas = excluded.notas;

-- 2 · Fuera del kit ------------------------------------------------------------
delete from public.partidas_items pi
 using public.partidas p
 where pi.partida_id = p.id
   and p.categoria = 'solar' and p.codigo = 'KIT_BASE'
   and pi.concepto_libre = 'Mano de obra';

-- 3 · Su propia partida, calculada por vatio -----------------------------------
insert into public.partidas (categoria, codigo, nombre)
values ('solar', 'MANO_OBRA', 'Mano de obra fotovoltaica')
on conflict (categoria, codigo) do nothing;

delete from public.partidas_items pi
 using public.partidas p
 where pi.partida_id = p.id and p.categoria = 'solar' and p.codigo = 'MANO_OBRA';

insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, detalle_tecnico, formula_cantidad, orden)
select p.id,
       'Mano de obra de instalación (por vatio instalado)',
       (select valor from public.tablas_lookup
         where categoria = 'solar' and clave = 'eur_por_vatio_mano_obra' and entrada = 'defecto'),
       'Montaje de estructura y módulos, cableado de continua y alterna, conexionado del inversor y puesta en marcha',
       'n_paneles * wp_panel', 1
  from public.partidas p
 where p.categoria = 'solar' and p.codigo = 'MANO_OBRA';

insert into public.reglas (conjunto_id, tipo, partida_id, formula_cantidad, seccion, prioridad, notas)
select c.id, 'cantidad', p.id, '1', 'Mano de obra', 45,
       'A 0,40 €/W: el doble de potencia es el doble de trabajo, no el mismo importe.'
  from public.conjuntos_reglas c
  join public.partidas p on p.categoria = 'solar' and p.codigo = 'MANO_OBRA'
 where c.categoria = 'solar' and c.vigente_hasta is null
   and not exists (select 1 from public.reglas r where r.conjunto_id = c.id and r.partida_id = p.id);

commit;

-- =============================================================================
-- COMPROBACIONES
--   El kit ya sin mano de obra (3.017 €) y la mano de obra aparte (0,40):
--   select p.codigo, pi.concepto_libre, pi.precio_fijo, pi.formula_cantidad
--     from public.partidas p join public.partidas_items pi on pi.partida_id = p.id
--    where p.categoria = 'solar' order by p.codigo, pi.orden;
--
--   Para cambiar el precio del vatio: cambia el valor en tablas_lookup y vuelve
--   a ejecutar este archivo (la partida se rehace con el valor nuevo).
-- =============================================================================
