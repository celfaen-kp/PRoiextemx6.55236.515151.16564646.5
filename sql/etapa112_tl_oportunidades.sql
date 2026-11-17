-- =============================================================================
-- Sysefen · etapa 112 · Las oportunidades de Teamleader, para las estadísticas
-- (17-11-2026)
--
-- Enzo: «no solo informe, sea como todo lo de estadísticas… donde estén todas
-- las gráficas». Su informe guardado en Teamleader es el de ventas: las
-- oportunidades ganadas por mes. La app no tenía esas oportunidades: aquí se
-- copian (función teamleader-ventas, que solo lee de Teamleader).
--
-- Se puede ejecutar varias veces.
-- =============================================================================
create table if not exists public.tl_oportunidades (
  tl_id               text primary key,
  titulo              text,
  referencia          text,
  estado              text not null default 'open',     -- open | won | lost
  importe             numeric,                          -- valor estimado, sin IVA
  importe_ponderado   numeric,
  probabilidad        numeric,
  cliente_tl_id       text,
  cliente_tipo        text,                             -- contact | company
  cliente_id          uuid references public.clientes_cache(id) on delete set null,
  cliente_nombre      text,
  fase_id             text,
  fase                text,
  fase_orden          int,
  embudo_id           text,
  embudo              text,
  responsable_id      text,
  responsable         text,
  entidad_id          text,
  entidad             text,
  motivo_perdida      text,
  motivo_perdida_nota text,
  creado_at           timestamptz,
  cerrado_at          timestamptz,                      -- cuándo se ganó o se perdió
  cierre_previsto     date,
  actualizado_at      timestamptz,
  web_url             text,
  datos               jsonb,                            -- tal cual llegó de Teamleader
  sincronizado_at     timestamptz not null default now()
);
create index if not exists tl_oportunidades_cierre on public.tl_oportunidades (estado, cerrado_at);
create index if not exists tl_oportunidades_cliente on public.tl_oportunidades (cliente_id) where cliente_id is not null;
comment on table public.tl_oportunidades is 'Copia de las oportunidades (deals) de Teamleader para las estadísticas. La escribe la función teamleader-ventas.';

alter table public.tl_oportunidades enable row level security;
drop policy if exists tl_oportunidades_ver on public.tl_oportunidades;
create policy tl_oportunidades_ver on public.tl_oportunidades for select to authenticated using (public.es_motor());

-- Cada hora (al minuto 12) se trae lo que haya cambiado en Teamleader. La
-- clave del cron no se escribe aquí: se copia de la tarea de las facturas.
do $$
declare orden text;
begin
  select replace(replace(command, 'teamleader-factura', 'teamleader-ventas'), '{"accion":"sincronizar","max":40,"pdfs":15}', '{}')
    into orden from cron.job where jobname = 'sync-facturas';
  if orden is null or position('teamleader-ventas' in orden) = 0 then raise notice 'sin la tarea sync-facturas: no se programa'; return; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'sync-ventas';
  perform cron.schedule('sync-ventas', '12 * * * *', orden);
end $$;
