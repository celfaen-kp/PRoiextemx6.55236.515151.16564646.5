-- =============================================================================
-- Sysefen · Etapa 88 · Validez de 15 días, aviso de vencimiento y nº de Teamleader
--
-- POR QUÉ (Enzo, 26 oct 2026):
--   Los presupuestos tienen 15 días de validez. Dos días antes de vencer se
--   avisa al cliente por correo (si quiere una prórroga, que lo diga) y a la
--   oficina. Y se quiere apuntar el número de oferta de Teamleader en la app
--   para seguir el mismo orden (la API no lo da: se apunta a mano).
--
-- QUÉ HACE:
--   · presupuestos.validez_dias (15), prorroga_dias (0), aviso_vencimiento_at,
--     tl_numero. Vence = enviado_cliente_at + validez + prórroga.
--   · Cron «vencimientos-presupuestos» a las 07:30 UTC de lunes a viernes:
--     llama a recordatorio-citas con {"vencimientos": true}. Toma la clave del
--     cron del resumen, que ya la tiene.
-- Idempotente.
-- =============================================================================

begin;
alter table public.presupuestos add column if not exists validez_dias integer not null default 15;
alter table public.presupuestos add column if not exists prorroga_dias integer not null default 0;
alter table public.presupuestos add column if not exists aviso_vencimiento_at timestamptz;
alter table public.presupuestos add column if not exists tl_numero text;
comment on column public.presupuestos.validez_dias is 'Días de validez desde que se envía al cliente (15).';
comment on column public.presupuestos.prorroga_dias is 'Días de prórroga concedidos encima de la validez.';
comment on column public.presupuestos.aviso_vencimiento_at is 'Cuándo se mandó el aviso de vencimiento (null = aún no).';
comment on column public.presupuestos.tl_numero is 'Número de la oferta en Teamleader (2026/634), apuntado a mano.';
commit;

select cron.unschedule(jobid) from cron.job where jobname = 'vencimientos-presupuestos';
select cron.schedule('vencimientos-presupuestos', '30 7 * * 1-5', format(
  $f$select net.http_post(url := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/recordatorio-citas', headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', %L), body := '{"vencimientos": true}'::jsonb);$f$,
  (select substring(command from $re$x-clave', '([^']+)'$re$) from cron.job where jobname = 'resumen-citas-manana')));

-- COMPROBACIÓN
select jobname, schedule, command like '%CAMBIA_ESTA_CLAVE%' as clave_sin_cambiar from cron.job where jobname = 'vencimientos-presupuestos';
