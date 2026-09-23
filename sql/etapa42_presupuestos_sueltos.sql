-- =============================================================================
-- Sysefen · Etapa 42 · Presupuestos sin visita
--
-- POR QUÉ:
--   La etapa 38 colgó cada presupuesto de una visita (`visita_id not null`).
--   En la práctica hace falta al revés: muchas veces se presupuesta sin haber
--   ido a ver nada (una llamada, un cliente de siempre, una reforma que ya se
--   conoce), y la visita, cuando la hay, es antes y el presupuesto después.
--
--   Así que la visita pasa a ser opcional. Cuando la hay, el presupuesto sigue
--   colgando de ella igual que hasta ahora.
--
-- QUÉ SE AÑADE:
--   presupuestos.visita_id   ahora puede ser null
--   presupuestos.cliente_id  el cliente del CRM, si se sabe (opcional)
--   presupuestos.titulo      para reconocerlo en la lista ("Aire · Casa Ana")
--
-- No toca ningún dato. Idempotente.
-- =============================================================================

begin;

alter table public.presupuestos alter column visita_id drop not null;

alter table public.presupuestos
  add column if not exists cliente_id uuid references public.clientes_cache(id) on delete set null,
  add column if not exists titulo text;

comment on column public.presupuestos.visita_id is
  'La visita de la que salió, si salió de una. Null = presupuesto suelto.';

create index if not exists presupuestos_fecha_idx on public.presupuestos (created_at desc);
create index if not exists presupuestos_cliente_idx on public.presupuestos (cliente_id) where cliente_id is not null;

commit;

-- Comprobación: que la visita ya no es obligatoria
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'presupuestos' and column_name in ('visita_id','cliente_id','titulo');
