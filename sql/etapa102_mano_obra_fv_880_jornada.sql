-- Sysefen · Etapa 102 · Mano de obra FV vendida a 880 € la jornada (Enzo, 10 nov 2026)
--   parametros.venta_jornada: 880 € la jornada de la pareja (oficial + ayudante). Se cobran así TODAS
--   las jornadas: las de montaje (2 hasta 12 paneles, 3 hasta 22), la de la batería y las extra de
--   más de 22 paneles. Manda sobre la tabla €/W de la etapa 89 (que se queda en el modelo, sin uso)
--   y sobre los 450 € de la jornada de batería. El coste sigue siendo el real de nóminas y el resto
--   del coste va al margen objetivo (50 %). Mismo contenido que modelo_fv.json del Drive. Idempotente.
update public.motor_modelos
   set datos = jsonb_set(datos, '{parametros,venta_jornada}',
       '{"valor": 880, "ud": "€", "origen": "Enzo, 10-11-2026: la mano de obra se vende a 880 € la jornada de la pareja (oficial + ayudante), todas las jornadas: montaje, batería y extra. Manda sobre la tabla €/W."}'::jsonb, true)
 where categoria = 'solar' and vigente_hasta is null;
select version, datos->'parametros'->'venta_jornada'->'valor' as venta_jornada from public.motor_modelos where categoria = 'solar' and vigente_hasta is null;
