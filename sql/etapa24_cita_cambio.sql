-- =============================================================================
-- Sysefen · Etapa 24 · Avisar de un CAMBIO de cita
--
-- QUÉ RESUELVE:
--   Si se mueve una cita de la que el cliente YA había recibido el aviso, el
--   correo nuevo tiene que decir que es un cambio y desde cuándo, no repetir
--   el mismo texto de recordatorio.
--
-- QUÉ SE AÑADE:
--   `citas.cambio_desde`: la fecha y hora que tenía antes. La pone la app al
--   guardar el cambio (solo si el aviso anterior ya se había enviado) y la
--   borra la función `recordatorio-citas` cuando manda el correo de cambio.
--
-- No toca ningún dato existente. Idempotente. Requiere etapa23.
-- =============================================================================

begin;

alter table public.citas add column if not exists cambio_desde timestamptz;

comment on column public.citas.cambio_desde is
  'Fecha y hora anterior de una cita ya avisada. Mientras no sea null, el próximo correo se envía como cambio de cita.';

commit;

-- Comprobación rápida (opcional):
--   select id, inicio, cambio_desde, aviso_enviado_at from public.citas
--    order by created_at desc limit 5;
