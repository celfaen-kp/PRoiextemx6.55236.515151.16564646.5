-- =============================================================================
-- Etapa 97 (3-11-2026): el cron «sync-teamleader» cortaba la llamada a los 5 s
-- (tope por defecto de pg_net) y la sincronización tarda más (89 ofertas y
-- 134 oportunidades). Se vuelve a programar igual, con 2 minutos de margen.
-- La clave x-clave se copia del propio trabajo: no hay que pegarla.
-- =============================================================================
do $$
declare
  clave text;
begin
  select substring(command from $re$x-clave', '([^']+)'$re$) into clave from cron.job where jobname = 'sync-teamleader';
  if clave is null then raise exception 'No encuentro la clave en el cron sync-teamleader'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'sync-teamleader';
  perform cron.schedule('sync-teamleader', '*/5 * * * *', format($j$
  select net.http_post(
    url     := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/teamleader-presupuesto',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', %L),
    body    := '{"accion":"sincronizar"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $j$, clave));
end $$;
select jobname, schedule, active, command ~ 'timeout_milliseconds := 120000' as con_margen from cron.job where jobname = 'sync-teamleader';
