-- =============================================================================
-- Sysefen · Etapa 32 · Los clientes que entran por la web
--
-- QUÉ SE MONTA:
--   La web (sysefen.com) genera un presupuesto orientativo y manda el cliente a
--   Teamleader. Como esa web la lleva otro, la app no espera a que le avisen:
--   cada cuarto de hora mira el CRM y se trae los contactos y empresas que han
--   entrado y que no ha creado ella misma.
--
--   Esos clientes salen en la agenda en un grupo aparte, "De la web", para que
--   se les ponga cita. No se mezclan con los de siempre.
--
-- CÓMO SE DISTINGUEN: lo que crea la app se marca en el CRM con la etiqueta
--   `sysefen-app`. Lo que aparece sin ella y después de la última pasada, viene
--   de fuera: de la web o de alguien escribiéndolo a mano en Teamleader. En los
--   dos casos interesa lo mismo, que es llamarle y ponerle cita.
--
-- QUÉ SE AÑADE:
--   clientes_cache.lead_at     cuándo entró por la web (null = no viene de ahí)
--   clientes_cache.lead_visto  si ya se ha mirado, para no tenerlo siempre rojo
--   ajustes.tl_leads_desde     hasta dónde se miró la última vez
--
-- LA TAREA PROGRAMADA va abajo, al final, y usa la misma clave que los avisos
-- de citas (AVISOS_CLAVE): es el mismo cron y la misma confianza.
--
-- No toca ningún dato existente. Idempotente.
-- =============================================================================

begin;

alter table public.clientes_cache add column if not exists lead_at    timestamptz;
alter table public.clientes_cache add column if not exists lead_visto boolean not null default false;

comment on column public.clientes_cache.lead_at is
  'Cuándo entró este cliente desde el CRM (web). Null = se dio de alta en la app.';
comment on column public.clientes_cache.lead_visto is
  'Ya se ha abierto su ficha. Sirve para no tenerlo marcado como nuevo para siempre.';

create index if not exists clientes_cache_lead_idx
  on public.clientes_cache (lead_at desc nulls last);

commit;

-- =============================================================================
-- TAREA PROGRAMADA · cada 15 minutos, traerse lo nuevo del CRM
--
-- ANTES DE EJECUTAR ESTO:
--   1. Sube la función `teamleader-leads` (Verify JWT DESACTIVADO).
--   2. Cambia PON_AQUI_TU_CLAVE por la misma AVISOS_CLAVE que ya usas en la
--      tarea de los avisos de citas.
--   3. Cambia la url si tu proyecto de Supabase es otro.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('sysefen-leads-web')
where exists (select 1 from cron.job where jobname = 'sysefen-leads-web');

select cron.schedule(
  'sysefen-leads-web',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/teamleader-leads',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', 'PON_AQUI_TU_CLAVE'),
    body := '{}'::jsonb
  );
  $$
);

-- Comprobación rápida (opcional):
--   select jobname, schedule, active from cron.job where jobname = 'sysefen-leads-web';
--   select nombre, origen, lead_at, lead_visto from public.clientes_cache
--     where lead_at is not null order by lead_at desc;
--   select * from public.ajustes where clave = 'tl_leads_desde';
--
-- Para volver a mirar desde una fecha concreta (p. ej. traerse los de esta semana):
--   update public.ajustes set valor = '2026-09-14T00:00:00Z' where clave = 'tl_leads_desde';
