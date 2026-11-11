-- =============================================================================
-- Sysefen · Etapa 107 · Las facturas de Teamleader entran solas (Enzo, 11 nov 2026)
--
-- La función `teamleader-factura` trae a `facturas` (etapa 106) lo nuevo o
-- cambiado en Teamleader: facturas hechas allí, cobros apuntados allí, abonos…
-- Aquí se la llama cada media hora (minutos 7 y 37, para no coincidir con la
-- sincronización de presupuestos, que va cada cuarto de hora y comparte el cupo
-- de 200 peticiones por minuto de Teamleader). Entra con la misma clave de los
-- avisos (cabecera x-clave), por tandas de 40: si hay más, sigue en la siguiente.
-- En cada pasada guarda además la copia del PDF de hasta 15 facturas que no la
-- tengan o la tengan vieja (sql/etapa108).
--
-- ANTES DE EJECUTAR: cambiar CAMBIA_ESTA_CLAVE por la AVISOS_CLAVE real (igual
-- que en la etapa 78). Requiere pg_cron y pg_net. Idempotente.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'sync-facturas';

select cron.schedule(
  'sync-facturas',
  '7,37 * * * *',
  $$
  select net.http_post(
    url     := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/teamleader-factura',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', 'CAMBIA_ESTA_CLAVE'),
    body    := '{"accion":"sincronizar","max":40,"pdfs":15}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select jobname, schedule, active from cron.job where jobname = 'sync-facturas';
