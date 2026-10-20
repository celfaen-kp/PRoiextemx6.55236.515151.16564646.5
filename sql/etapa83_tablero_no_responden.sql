-- =============================================================================
-- Sysefen · Etapa 83 · Columna «No responden» en el tablero de clientes
--
-- POR QUÉ (Enzo, 20 oct 2026):
--   Hay clientes que no contestan ni a las llamadas ni a los correos. Estaban
--   mezclados en «Nuevos · sin cita» (en rojo, «no cogió el teléfono»). Se
--   quiere una columna propia para tenerlos aparte.
--
-- QUÉ HACE:
--   Amplía el check de clientes_cache.tablero_col (etapa81) con 'no_responde',
--   para poder colocar un cliente ahí a mano. Además la app los pone sola en
--   esa columna cuando se marcó «No cogió» y no tienen cita pendiente.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.clientes_cache drop constraint if exists clientes_cache_tablero_col_check;
alter table public.clientes_cache add constraint clientes_cache_tablero_col_check
  check (tablero_col is null or tablero_col in ('rechazado', 'finalizado', 'otros', 'no_responde'));
comment on column public.clientes_cache.tablero_col is 'Columna del tablero puesta a mano: rechazado (sin presupuesto), finalizado, otros o no_responde. Null = la que salga de citas, visitas y presupuestos.';

commit;

-- COMPROBACIÓN
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'clientes_cache_tablero_col_check';
