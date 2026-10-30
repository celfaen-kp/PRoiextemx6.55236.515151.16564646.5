-- 30-10-2026: lo hecho en Teamleader (ofertas nuevas, enviadas, aceptadas) tardaba
-- hasta un cuarto de hora en entrar en la app. Ahora la pasada va cada cinco minutos.
select cron.alter_job(jobid, schedule := '*/5 * * * *') from cron.job where jobname = 'sync-teamleader';
select jobname, schedule from cron.job where jobname = 'sync-teamleader';
