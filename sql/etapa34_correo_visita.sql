-- =============================================================================
-- Sysefen · Etapa 34 · El correo de agradecimiento después de la visita
--
-- QUÉ SE MONTA:
--   Al cerrar una visita, al cliente le llega un correo dándole las gracias por
--   recibirnos y diciéndole que en unos días tendrá su presupuesto.
--
--   NO lleva ni una sola medida de las que se tomaron. Esos datos son el trabajo
--   de la visita: si viajan en un correo, el cliente puede pasárselos a otro
--   instalador y ahorrarse la visita que nosotros hemos pagado. En el correo va
--   lo que el cliente ya sabe: que estuvimos, qué se vino a ver y cuándo tendrá
--   la propuesta.
--
-- QUÉ SE AÑADE:
--   visitas.gracias_at   cuándo se le dio las gracias. Null = todavía no.
--                        Sirve para no mandarlo dos veces al reabrir la visita.
--
-- No hace falta ningún secreto nuevo: usa la RESEND_API_KEY de siempre.
--
-- No toca ningún dato existente. Idempotente.
-- =============================================================================

begin;

alter table public.visitas add column if not exists gracias_at timestamptz;

comment on column public.visitas.gracias_at is
  'Cuándo se le mandó al cliente el correo de agradecimiento por la visita.';

commit;

-- Comprobación rápida (opcional):
--   select codigo, fecha_visita, estado, gracias_at from public.visitas
--     order by created_at desc limit 10;
--
-- Para que se le pueda volver a mandar a un cliente:
--   update public.visitas set gracias_at = null where codigo = 'V-2026-0007';
