-- =============================================================================
-- Sysefen · Etapa 78 · Cada cuarto de hora, lo que pasa en Teamleader vuelve a la app
--
-- POR QUÉ (Enzo, 16 oct 2026):
--   Las ofertas se mandan al cliente desde Teamleader, y la oportunidad cambia
--   de fase allí; la app no se enteraba y el cliente se quedaba en «presupuesto
--   por revisar o enviar». Y las ofertas hechas directamente en el CRM no
--   existían en la app.
--
-- QUÉ HACE:
--   Llama a la función teamleader-presupuesto con la clave del cron (la misma
--   AVISOS_CLAVE de los avisos de citas) cada 15 minutos. La función mira las
--   ofertas y oportunidades de la app en Teamleader y:
--     · si la oportunidad pasó a una fase de «presupuesto enviado», marca el
--       presupuesto como enviado al cliente con esa fecha;
--     · oferta aceptada u oportunidad ganada → aceptado; rechazada o perdida →
--       rechazado; caducada → caducado;
--     · las ofertas de la oportunidad de una visita que la app no conocía se
--       importan como presupuestos «hechos en Teamleader».
--   Desde la app también se puede lanzar a mano («Actualizar desde Teamleader»).
--
-- QUÉ FASE CUENTA COMO ENVIADO: por defecto, cualquier fase cuyo nombre lleve
--   «enviad», «presupuest», «oferta» o «propuest» (y no sea la inicial). Si en
--   vuestro embudo se llama de otra forma, se fija aquí sin tocar código:
--     insert into public.ajustes (clave, valor) values ('tl_fase_enviado', 'enviad|presupuest')
--       on conflict (clave) do update set valor = excluded.valor;
--
-- ANTES DE EJECUTAR: cambiar CAMBIA_ESTA_CLAVE por la AVISOS_CLAVE real (igual
-- que en las etapas 23b y 24b). Requiere pg_cron y pg_net (ya puestos en 23b).
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'sync-teamleader';

select cron.schedule(
  'sync-teamleader',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/teamleader-presupuesto',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', 'CAMBIA_ESTA_CLAVE'),
    body    := '{"accion":"sincronizar"}'::jsonb
  );
  $$
);

-- Comprobaciones:
--   select jobname, schedule, active from cron.job where jobname = 'sync-teamleader';
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'sync-teamleader') order by start_time desc limit 5;
