-- =============================================================================
-- Sysefen · Etapa 77 · Orden a mano de los clientes dentro de una columna del tablero
--
-- POR QUÉ (Enzo, 16 oct 2026):
--   En el tablero de clientes se quiere subir un cliente dentro de su columna
--   (arrastrándolo sobre otro, o «subir al principio» desde su menú), para
--   tener arriba lo que toca ahora. Hasta ahora el orden era fijo: por fecha
--   de la próxima acción y nombre.
--
-- QUÉ HACE:
--   · clientes_cache.tablero_orden: posición dentro de su columna (1 = arriba).
--     Null = sin orden propio: va detrás de los ordenados, con el orden de
--     siempre. La app renumera la columna entera al mover.
--   Lo cambian quienes ya pueden cambiar clientes (presupuestos, Administración
--   y el colaborador con los suyos): no hay política nueva.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.clientes_cache add column if not exists tablero_orden integer;
comment on column public.clientes_cache.tablero_orden is 'Posición a mano dentro de su columna del tablero (1 = arriba). Null = sin orden propio.';

commit;

-- COMPROBACIÓN
--   select nombre, tablero_orden from public.clientes_cache where tablero_orden is not null order by tablero_orden;
