-- =============================================================================
-- Sysefen · Etapa 30 · Aviso al momento y anulación de citas
--
-- QUÉ CAMBIA:
--   Hasta ahora el aviso de una cita salía en la siguiente pasada de la tarea
--   programada (hasta 10 minutos después). Desde ahora la app avisa en cuanto
--   se crea, se cambia o se anula la cita, y el cron queda de red de seguridad.
--
--   Los correos de cita son cuatro:
--     · cita nueva      — al crearla, al cliente Y al instalador
--     · recordatorio    — 24 h antes
--     · cambio de cita  — al mover el día o la hora
--     · cita anulada    — al anularla (solo si antes se le había avisado)
--
-- QUÉ SE AÑADE:
--   citas.anulacion_enviada_at   para no avisar dos veces de la misma anulación
--
-- NO hace falta ningún secreto nuevo. La app llama a la función con la sesión
-- de quien usa la app (solo presupuestos, jefes y Administración); la clave del
-- cron sigue siendo solo del cron.
--
-- No toca ningún dato existente. Idempotente.
-- =============================================================================

begin;

alter table public.citas add column if not exists anulacion_enviada_at timestamptz;

comment on column public.citas.anulacion_enviada_at is
  'Cuándo se comunicó la anulación de esta cita. Null = todavía no se ha dicho.';

commit;

-- Comprobación rápida (opcional):
--   select inicio, estado, confirmacion_enviada_at, aviso_enviado_at, anulacion_enviada_at
--   from public.citas order by inicio desc limit 10;
--
-- Para que se vuelva a avisar de una cita (pruebas):
--   update public.citas set confirmacion_enviada_at = null, aviso_enviado_at = null,
--          anulacion_enviada_at = null where id = 'PON_AQUI_EL_ID';
