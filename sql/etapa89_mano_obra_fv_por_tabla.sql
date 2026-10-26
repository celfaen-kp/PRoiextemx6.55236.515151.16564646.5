-- Sysefen · Etapa 89 · Mano de obra FV vendida por tabla €/W y día extra con batería (Enzo, 26 oct 2026)
--   parametros.mo_venta_tramos: hasta 3 kWp 0,40 €/W · 3-5 kWp 0,30 €/W · más de 5 kWp 0,25 €/W.
--   parametros.venta_jornada_bateria: 450 € (un día más de las dos personas con inversor híbrido y batería).
--   El resto del coste sigue al margen objetivo (50 %). Mismo contenido que modelo_fv.json del Drive. Idempotente.
update public.motor_modelos
   set datos = jsonb_set(jsonb_set(datos, '{parametros,mo_venta_tramos}',
       '{"valor": [{"hasta_kwp": 3, "eur_w": 0.40}, {"hasta_kwp": 5, "eur_w": 0.30}, {"hasta_kwp": null, "eur_w": 0.25}], "ud": "€/W", "origen": "Enzo, 26-10-2026: la mano de obra se cobra por vatio según los kWp y el resto del coste va al 50 %."}'::jsonb, true),
       '{parametros,venta_jornada_bateria}',
       '{"valor": 450, "ud": "€", "origen": "Enzo, 26-10-2026: con batería, un día más de las dos personas, cobrado a 450 €."}'::jsonb, true)
 where categoria = 'solar' and vigente_hasta is null;
select version, datos->'parametros'->'mo_venta_tramos'->'valor' as tramos, datos->'parametros'->'venta_jornada_bateria'->'valor' as jornada_bat from public.motor_modelos where categoria = 'solar' and vigente_hasta is null;
