-- =============================================================================
-- Sysefen · Etapa 39 · El motor no pone descuentos solo
--
-- DECISIÓN (22-09-2026):
--   Los presupuestos del motor salen a PVP de tarifa, SIN descuentos puestos
--   de oficio: ni el −15 % de línea en material de marca ni el −10 % global
--   que sembró la etapa 38. Al final del presupuesto hay una opción para poner
--   un porcentaje de descuento si se quiere, y ese lo elige la persona.
--
--   En el histórico los descuentos de línea variaban (10, 15, 18, 20, 25 %) sin
--   una regla clara detrás, así que ponerlos solos era inventarse una.
--
-- QUÉ HACE: desactiva las filas de politica_descuentos. No las borra: quedan
-- como registro de lo que se observó, y se pueden volver a activar.
--
-- Idempotente.
-- =============================================================================

begin;

update public.politica_descuentos set activa = false where activa;

comment on table public.politica_descuentos is
  'Descuentos que el motor aplicaría solo. Desactivados desde la etapa 39: el descuento lo elige la persona al final del presupuesto.';

commit;

-- Comprobación: todas en false
--   select ambito, familia, descuento_pct, activa from public.politica_descuentos;
