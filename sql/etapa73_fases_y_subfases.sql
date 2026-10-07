-- =============================================================================
-- Sysefen · Etapa 73 · Fases propias en el proyecto de la obra
--
-- POR QUÉ (Enzo, 7 oct 2026):
--   En el proyecto de una obra, los bloques (Preparación, Aerotermia,
--   Fotovoltaica, Cierre) son las FASES y lo que hay dentro son SUBFASES.
--   Hasta ahora los bloques salían solo de las categorías de la obra. Hace
--   falta poder crear bloques propios («Fontanería», «Piscina») y meterles
--   sus subfases.
--
-- QUÉ CAMBIA:
--   · obra_fases.grupo: el nombre del bloque propio. Una subfase con grupo y
--     sin categoría se agrupa bajo ese nombre. Las de categoría siguen igual.
--   · Jefes y operarios ven también estos bloques propios (son trabajo que
--     ejecutan ellos); las comunes de oficina siguen siendo solo de oficina.
--     Eso lo decide la app; aquí no cambian permisos.
--
-- Requiere la etapa 63. Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.obra_fases add column if not exists grupo text;
comment on column public.obra_fases.grupo is 'Bloque propio de la obra («Fontanería», «Piscina») al que pertenece esta subfase. Null = se agrupa por categoría o es común.';

commit;

-- COMPROBACIÓN
--   select o.numero, f.grupo, f.categoria, f.orden, f.nombre from public.obra_fases f join public.obras o on o.id = f.obra_id
--    where f.grupo is not null order by 1, 2, 4;
