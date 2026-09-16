-- =============================================================================
-- Sysefen · Etapa 25 · Correo de confirmación al crear la cita
--
-- QUÉ RESUELVE:
--   El cliente recibe ahora tres correos según el momento:
--     1. Confirmación, en cuanto se le pone día y hora.
--     2. Recordatorio, 24 horas antes.
--     3. Cambio de cita, si se mueve una ya avisada (etapa24).
--
-- QUÉ SE AÑADE:
--   `citas.confirmacion_enviada_at`: cuándo salió la confirmación. Lo rellena
--   la función `recordatorio-citas`. Si la cita nace con menos de 24 horas de
--   margen, se marca sin enviar nada: en ese caso basta el recordatorio, que
--   sale enseguida y dice lo mismo.
--
-- No toca ningún dato existente. Idempotente. Requiere etapa23.
-- =============================================================================

begin;

alter table public.citas add column if not exists confirmacion_enviada_at timestamptz;

comment on column public.citas.confirmacion_enviada_at is
  'Cuándo se envió al cliente la confirmación de la cita. Null = pendiente de enviar.';

create index if not exists citas_confirmacion_idx on public.citas (inicio)
  where estado = 'pendiente' and confirmacion_enviada_at is null;

commit;

-- Comprobación rápida (opcional):
--   select inicio, confirmacion_enviada_at, aviso_enviado_at, cambio_desde
--     from public.citas order by created_at desc limit 5;
