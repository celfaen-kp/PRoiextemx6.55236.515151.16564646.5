-- =============================================================================
-- Sysefen · Etapa 22 · Categoría de imputación "Trabajos Sysefen"
--
-- QUÉ RESUELVE:
--   "Despacho" mezclaba dos cosas: el tiempo de oficina y el trabajo que se
--   hace en la base para la propia empresa (taller, mantenimiento, montajes
--   propios). Se añade la categoría 'sysefen' para separarlo. Igual que
--   despacho, no lleva obra.
--
-- QUÉ TOCA:
--   Solo la regla de valores permitidos de imputaciones.categoria. No cambia
--   ninguna imputación existente. La regla "solo Obra lleva obra"
--   (imputaciones_obra_coherente_chk) ya cubre la categoría nueva.
--
-- Idempotente: se puede ejecutar dos veces. Si falla, al ir dentro del begin
-- la regla anterior se queda como estaba.
-- =============================================================================

begin;

alter table public.imputaciones drop constraint if exists imputaciones_categoria_chk;
alter table public.imputaciones add constraint imputaciones_categoria_chk
  check (categoria in ('obra', 'despacho', 'sysefen', 'preparacion', 'desplazamiento', 'otros'));

commit;

-- Comprobación rápida (opcional):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'imputaciones_categoria_chk';
