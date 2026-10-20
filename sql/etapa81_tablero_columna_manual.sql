-- =============================================================================
-- Sysefen · Etapa 81 · Colocar un cliente a mano en «Rechazados», «Finalizados» u «Otros»
--
-- POR QUÉ (Enzo, 20 oct 2026):
--   En el tablero solo se podía pasar a «Rechazados» un cliente con presupuesto
--   (se marcaba el presupuesto rechazado). Hay clientes que dicen que no antes
--   de llegar a presupuesto, y otros que no encajan en ninguna fase: se quiere
--   una columna «Otros» al final. Y una de «Finalizados» (obra terminada):
--   sale sola cuando todas las obras del cliente están finalizadas o cerradas,
--   o a mano.
--
-- QUÉ HACE:
--   · clientes_cache.tablero_col: 'rechazado', 'finalizado' u 'otros' si se colocó a mano.
--     Mientras está puesto, manda sobre citas, visitas y presupuestos. Al
--     mover el cliente a cualquier otra columna la app lo vacía.
--   · clientes_cache.tablero_motivo: el porqué, opcional («no le interesa»…).
--   Lo cambian quienes ya pueden cambiar clientes: no hay política nueva.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.clientes_cache add column if not exists tablero_col text
  check (tablero_col is null or tablero_col in ('rechazado', 'finalizado', 'otros'));
alter table public.clientes_cache add column if not exists tablero_motivo text;
comment on column public.clientes_cache.tablero_col is 'Columna del tablero puesta a mano: rechazado (sin presupuesto), finalizado u otros. Null = la que salga de citas, visitas y presupuestos.';

commit;

-- COMPROBACIÓN
--   select nombre, tablero_col, tablero_motivo from public.clientes_cache where tablero_col is not null order by nombre;
