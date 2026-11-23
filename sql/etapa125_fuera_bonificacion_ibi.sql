-- =============================================================================
-- Etapa 125 · fuera del motor la «Solicitud de bonificación IBI / ICIO»
-- (Enzo, 23-11-2026)
--
-- Enzo: «Solicitud de bonificación IBI / ICIO: quítalo en general del motor».
--
-- La partida FV-13-007 entraba en los trámites de fotovoltaica cuando en la
-- ficha de la visita se marcaba «Pide bonificación IBI / ICIO», y salía a 0 €
-- (nunca tuvo precio). Ahora:
--   · su regla queda inactiva (no se borra, como las demás que se sacaron);
--   · el producto queda inactivo en el catálogo (sigue en la tabla para los
--     presupuestos que ya lo llevan, que no cambian);
--   · la casilla sale de la ficha de la visita (visitas-schemas.js, V33.5) y el
--     motor híbrido deja de dejarla pasar (hibrido.js).
-- Una visita antigua que tenga la casilla marcada ya no saca la línea.
-- Se puede ejecutar más de una vez.
-- =============================================================================
update public.reglas
   set activa = false,
       notas = 'Fuera del motor por decisión de Enzo (23-11-2026). ' || coalesce(notas, '')
 where producto_ref = 'FV-13-007' and activa;

update public.productos p set activo = false
  from public.tarifas t
 where p.tarifa_id = t.id and t.nombre = 'Fotovoltaica partidas 2026' and p.referencia = 'FV-13-007' and p.activo;

select (select count(*) from public.reglas where producto_ref = 'FV-13-007' and activa) as reglas_activas,
       (select count(*) from public.productos where referencia = 'FV-13-007' and activo) as productos_activos,
       (select count(*) from public.variables_derivadas v where to_jsonb(v)::text like '%bonificacion_ibi%') as variables_que_la_usan,
       (select count(*) from public.reglas r where to_jsonb(r)::text like '%bonificacion_ibi%' and activa) as otras_reglas_activas;
