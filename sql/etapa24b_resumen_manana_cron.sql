-- =============================================================================
-- Sysefen · Etapa 24b · Resumen de las citas de mañana (tarea programada)
--
-- QUÉ HACE:
--   Cada tarde manda a cada persona de presupuestos, a su "email para avisos",
--   un correo con TODAS sus citas del día siguiente. Es aparte del aviso de
--   cada cita: ese sale 24 h antes; este es el repaso del día.
--
-- EJECUTAR DESPUÉS DE subir la versión de `recordatorio-citas` que entiende
-- {"resumen_dia": true} (la del 16/09/2026 o posterior).
--
-- ANTES DE DARLE A RUN: sustituye CAMBIA_ESTA_CLAVE por el mismo AVISOS_CLAVE
-- que ya usa la tarea `recordatorio-citas`. No lo guardes en Git.
--
-- CUÁNDO: 16:00 UTC = 18:00 en Mallorca en verano y 17:00 en invierno.
-- Para cambiar la hora más adelante, sin volver a escribir la clave:
--   select cron.alter_job((select jobid from cron.job where jobname = 'resumen-citas-manana'),
--                         schedule := '0 17 * * *');
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Si ya existía, se quita para no duplicarla.
select cron.unschedule(jobid) from cron.job where jobname = 'resumen-citas-manana';

select cron.schedule(
  'resumen-citas-manana',
  '0 16 * * *',
  $$
  select net.http_post(
    url     := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/recordatorio-citas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', 'CAMBIA_ESTA_CLAVE'),
    body    := '{"resumen_dia": true}'::jsonb
  );
  $$
);

-- Comprobaciones (opcional):
--   select jobname, schedule, active from cron.job order by jobname;
--   select status, return_message, start_time from cron.job_run_details
--    order by start_time desc limit 5;
