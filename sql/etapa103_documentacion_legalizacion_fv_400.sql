-- Sysefen · Etapa 103 · Documentación y legalización FV en una partida a 400 € (Enzo, 10 nov 2026)
--   parametros.venta_documentacion: 400 €. La legalización con su tasa, la documentación final y el
--   permiso de obra (antes cuatro partidas: 2,5 h de Xavi + 40 € de tasa = 140 € de coste, 280 € de
--   venta al 50 %) pasan a una sola, «Documentación y legalización (Xavi 5 h)», que se vende a ese
--   precio fijo, fuera del margen objetivo.
--   parametros.horas_documentacion: 5 h de Xavi (coste a eur_h, 40 €/h = 200 €; venta 80 €/h).
--   La gestión de subvención y el certificado energético siguen como estaban. Mismo contenido que
--   modelo_fv.json del Drive. Idempotente.
update public.motor_modelos
   set datos = jsonb_set(jsonb_set(datos, '{parametros,venta_documentacion}',
       '{"valor": 400, "ud": "€", "origen": "Enzo, 10-11-2026: la legalización con su tasa, la documentación final y el permiso de obra van en una sola partida y se venden a 400 € (5 h de Xavi a 80 €/h), fuera del margen objetivo."}'::jsonb, true),
       '{parametros,horas_documentacion}',
       '{"valor": 5, "ud": "h", "origen": "Enzo, 10-11-2026: horas de Xavi de la partida única de documentación y legalización (coste a eur_h)."}'::jsonb, true)
 where categoria = 'solar' and vigente_hasta is null;
select version, datos->'parametros'->'venta_documentacion'->'valor' as venta_documentacion, datos->'parametros'->'horas_documentacion'->'valor' as horas_documentacion from public.motor_modelos where categoria = 'solar' and vigente_hasta is null;
