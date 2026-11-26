-- Sysefen · Etapa 130 · La jornada de «solo paneles», a 450 € (Enzo, 26 nov 2026)
--   «La mano de obra que se calcula automáticamente al colocar solo paneles, que sea 450, no 880.»
--   El modelo fotovoltaico vigente gana un parámetro propio, venta_jornada_ampliacion, que usa
--   presupuestar · hibrido.js · presupuestarSoloPaneles. La jornada de una instalación completa
--   (venta_jornada) no cambia. Se ve y se cambia en Ajustes → Precios → Fotovoltaica. Idempotente.

update public.motor_modelos
set datos = jsonb_set(datos, '{parametros,venta_jornada_ampliacion}',
  '{"valor": 450, "ud": "€", "origen": "Enzo, 26-11-2026: al añadir solo paneles a una instalación existente, la jornada de la pareja se vende a 450 €, no a la de una instalación completa."}'::jsonb, true)
where categoria = 'solar' and vigente_hasta is null
  and not (datos -> 'parametros' ? 'venta_jornada_ampliacion');

select version, datos -> 'parametros' -> 'venta_jornada_ampliacion' ->> 'valor' as jornada_solo_paneles, datos -> 'parametros' -> 'venta_jornada' ->> 'valor' as jornada_instalacion
from public.motor_modelos where categoria = 'solar' and vigente_hasta is null;
