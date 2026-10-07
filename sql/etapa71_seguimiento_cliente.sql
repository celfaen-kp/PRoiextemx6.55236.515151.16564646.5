-- =============================================================================
-- Sysefen · Etapa 71 · Seguimiento completo por cliente: bitácora, próxima
--                      acción y aplazamientos
--
-- POR QUÉ (Enzo, 7 oct 2026):
--   El seguimiento solo existía a partir del presupuesto. Antes de eso nadie
--   sabía si a un cliente se le había llamado, qué se le dijo, si Ramón ya
--   habló con él o si Xavi tenía que volver a llamar. Y los que esperan a la
--   subvención de enero o febrero se perdían. Ahora cada cliente lleva:
--   · una BITÁCORA: cada llamada, nota, cita, presupuesto y cambio queda
--     apuntado con quién y cuándo (lo apunta la app sola, y a mano se añaden
--     notas);
--   · una PRÓXIMA ACCIÓN con fecha y responsable («llamar el jueves», «mandar
--     presupuesto»), que sale en la agenda cuando toca;
--   · un APLAZAMIENTO con fecha y motivo («subvención enero»), que lo saca de
--     los pendientes y lo devuelve a la agenda una semana antes.
--   Con eso, un tablero por fases como el de Teamleader, dentro de la app.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.clientes_cache add column if not exists proxima_accion     text;
alter table public.clientes_cache add column if not exists proxima_accion_at  date;
alter table public.clientes_cache add column if not exists proxima_accion_por uuid references public.empleados(id) on delete set null;
alter table public.clientes_cache add column if not exists aplazado_hasta     date;
alter table public.clientes_cache add column if not exists aplazado_motivo    text;

comment on column public.clientes_cache.proxima_accion is 'Qué hay que hacer con este cliente a continuación («llamar», «mandar presupuesto»…). Null = nada pendiente.';
comment on column public.clientes_cache.aplazado_hasta is 'Hasta cuándo se deja aparcado (p. ej. subvención de enero). Vuelve a la agenda una semana antes.';

create table if not exists public.cliente_bitacora (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes_cache(id) on delete cascade,
  tipo        text not null default 'nota'
              check (tipo in ('llamada', 'whatsapp', 'email', 'nota', 'cita', 'visita', 'presupuesto', 'aplazado', 'accion', 'sistema')),
  texto       text not null,
  por         uuid default public.empleado_id_actual() references public.empleados(id) on delete set null,
  at          timestamptz not null default now()
);
create index if not exists cliente_bitacora_cliente_idx on public.cliente_bitacora (cliente_id, at desc);

alter table public.cliente_bitacora enable row level security;
drop policy if exists cliente_bitacora_comercial on public.cliente_bitacora;
create policy cliente_bitacora_comercial on public.cliente_bitacora
  for all to authenticated
  using (public.es_comercial()) with check (public.es_comercial());

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select c.nombre, c.proxima_accion, c.proxima_accion_at, c.aplazado_hasta, c.aplazado_motivo
--     from public.clientes_cache c where c.proxima_accion is not null or c.aplazado_hasta is not null;
--   select b.at, c.nombre, b.tipo, b.texto from public.cliente_bitacora b join public.clientes_cache c on c.id = b.cliente_id order by b.at desc limit 30;
-- =============================================================================
