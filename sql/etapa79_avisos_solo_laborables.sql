-- =============================================================================
-- Sysefen · Etapa 79 · Los correos automáticos solo de lunes a viernes
--
-- POR QUÉ (Enzo, 17 oct 2026):
--   Seguían llegando los resúmenes de «mañana» el sábado y el domingo, sin
--   ninguna cita. No se trabaja los fines de semana: nada de correos.
--
-- QUÉ HACE:
--   Vuelve a programar las tres tareas de recordatorio-citas para que solo se
--   ejecuten de lunes a viernes (campo del día de la semana «1-5»). La función
--   además se protege sola (no manda nada en fin de semana ni en festivo del
--   calendario de la app), pero así ni una versión antigua desplegada podría
--   enviar. El viernes el resumen y los avisos son para el lunes.
--
-- ANTES DE EJECUTAR: cambiar CAMBIA_ESTA_CLAVE por la AVISOS_CLAVE real, igual
-- que en las etapas 23b, 24b y 60. Idempotente.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('recordatorio-citas', 'resumen-citas-manana', 'planificacion-manana');

-- Aviso de cada cita (24 h antes; el viernes, hasta el lunes): cada 10 minutos, L-V.
select cron.schedule(
  'recordatorio-citas',
  '*/10 * * * 1-5',
  $$
  select net.http_post(
    url     := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/recordatorio-citas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', 'CAMBIA_ESTA_CLAVE'),
    body    := '{}'::jsonb
  );
  $$
);

-- Resumen de las citas del siguiente día laborable: a las 16:00 UTC (18:00 en verano, 17:00 en invierno), L-V.
select cron.schedule(
  'resumen-citas-manana',
  '0 16 * * 1-5',
  $$
  select net.http_post(
    url     := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/recordatorio-citas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', 'CAMBIA_ESTA_CLAVE'),
    body    := '{"resumen_dia": true}'::jsonb
  );
  $$
);

-- Planificación del siguiente día laborable: a las 17:00 UTC, L-V.
select cron.schedule(
  'planificacion-manana',
  '0 17 * * 1-5',
  $$
  select net.http_post(
    url     := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/recordatorio-citas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', 'CAMBIA_ESTA_CLAVE'),
    body    := '{"planificacion_manana": true}'::jsonb
  );
  $$
);

-- COMPROBACIÓN
--   select jobname, schedule, active from cron.job where jobname in ('recordatorio-citas', 'resumen-citas-manana', 'planificacion-manana');
