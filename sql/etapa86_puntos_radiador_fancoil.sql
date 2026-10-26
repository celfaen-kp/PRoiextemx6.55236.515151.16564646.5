-- =============================================================================
-- Sysefen · Etapa 86 · Puntos de radiador y unidades interiores (Enzo, 26 oct 2026)
--
--   · Aerotermia: cada punto de radiador de baja temperatura con su montaje,
--     280 € (por radiador de la ficha, cuando se ponen radiadores BT).
--   · Aerotermia: cada unidad interior (fancoil) con montaje y vacío, 350 €
--     (una por fancoil apuntado en la ficha).
--   · Aire: la mano de obra por unidad interior (C104) pasa de 450 a 350 €,
--     que lleva el vacío igual.
--   Coste: 15 % de beneficio sobre la venta mientras no haya otro dato.
-- Idempotente.
-- =============================================================================

begin;

insert into public.partidas (categoria, codigo, nombre) values
  ('aerotermia', 'PUNTO_RADIADOR', 'Punto de radiador y montaje'),
  ('aerotermia', 'PUNTO_FANCOIL',  'Unidad interior (fancoil) y montaje')
on conflict (categoria, codigo) do nothing;

insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, coste_fijo, detalle_tecnico, formula_cantidad, orden)
select p.id, v.concepto, v.precio, v.coste, v.detalle, v.formula, 1
  from public.partidas p
  join (values
    ('PUNTO_RADIADOR', 'Punto de radiador de baja temperatura y montaje', 280.00, 238.00,
     'Conexión, válvulas, purga y montaje de cada radiador', 'radiadores_n'),
    ('PUNTO_FANCOIL',  'Unidad interior (fancoil): montaje, conexión y vacío', 350.00, 297.50,
     'Soporte, conexión hidráulica y eléctrica, desagüe y vacío de cada unidad interior', 'cuenta(fancoils)')
  ) as v(codigo, concepto, precio, coste, detalle, formula) on v.codigo = p.codigo
 where p.categoria = 'aerotermia'
   and not exists (select 1 from public.partidas_items i where i.partida_id = p.id);

insert into public.reglas (conjunto_id, tipo, partida_id, condicion, formula_cantidad, seccion, prioridad, notas)
select c.id, 'condicional', p.id, v.condicion::jsonb, '1', 'Instalación', 30, v.nota
  from public.conjuntos_reglas c
  join (values
    ('PUNTO_RADIADOR', '{"emisores_previstos": "radiadores_bt"}', 'Un punto por radiador de la ficha cuando se ponen radiadores de baja temperatura (280 €, Enzo 26-10-2026).'),
    ('PUNTO_FANCOIL',  '{"emisores_previstos": "fancoils"}',      'Una unidad interior por fancoil apuntado, con vacío (350 €, Enzo 26-10-2026).')
  ) as v(codigo, condicion, nota) on true
  join public.partidas p on p.categoria = 'aerotermia' and p.codigo = v.codigo
 where c.categoria = 'aerotermia' and c.vigente_hasta is null
   and not exists (select 1 from public.reglas r where r.conjunto_id = c.id and r.partida_id = p.id);

-- Aire: mano de obra por unidad interior a 350 €
update public.partidas_items i set precio_fijo = 350.00, coste_fijo = 297.50
  from public.partidas p where p.id = i.partida_id and p.categoria = 'aire_acondicionado' and i.concepto_libre like 'C104:%';

commit;

-- COMPROBACIÓN
select p.categoria, p.codigo, i.concepto_libre, i.precio_fijo, i.coste_fijo, i.formula_cantidad,
       (select count(*) from public.reglas r join public.conjuntos_reglas c on c.id = r.conjunto_id where r.partida_id = p.id and c.vigente_hasta is null) as reglas
from public.partidas_items i join public.partidas p on p.id = i.partida_id
where p.codigo in ('PUNTO_RADIADOR', 'PUNTO_FANCOIL') or i.concepto_libre like 'C104:%' order by 1, 2;
