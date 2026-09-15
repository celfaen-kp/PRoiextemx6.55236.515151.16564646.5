-- =============================================================================
-- Sysefen · Etapa 23b · Aviso automático del día antes (tarea programada)
--
-- EJECUTAR SOLO DESPUÉS DE:
--   1. Subir la función `recordatorio-citas` con "Verify JWT" DESACTIVADO
--      (la llama Supabase, no una persona con sesión).
--   2. Crear el secreto AVISOS_CLAVE en Supabase → Edge Functions → Secrets:
--      una contraseña larga inventada (24 caracteres o más).
--
-- ANTES DE DARLE A RUN: sustituye CAMBIA_ESTA_CLAVE por esa MISMA contraseña.
-- No la guardes en este archivo ni en Git: pégala solo en el SQL Editor.
--
-- CUÁNDO: cada 10 minutos. En cada pasada avisa de las citas que empiezan en
-- las próximas 24 horas y aún no se han avisado: el correo sale 24 h antes, o
-- en pocos minutos si la cita se crea con menos margen.
--
-- ¿YA TENÍAS LA TAREA CREADA A LAS 16:00? No hace falta volver a poner la
-- clave: basta con cambiarle el horario con esta línea sola:
--   select cron.alter_job((select jobid from cron.job where jobname = 'recordatorio-citas'),
--                         schedule := '*/10 * * * *');
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Si ya existía, se quita para no duplicarla.
select cron.unschedule(jobid) from cron.job where jobname = 'recordatorio-citas';

select cron.schedule(
  'recordatorio-citas',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/recordatorio-citas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', 'CAMBIA_ESTA_CLAVE'),
    body    := '{}'::jsonb
  );
  $$
);

-- Comprobaciones (opcional):
--   select jobname, schedule, active from cron.job where jobname = 'recordatorio-citas';
--   select status, return_message, start_time from cron.job_run_details
--    order by start_time desc limit 5;
