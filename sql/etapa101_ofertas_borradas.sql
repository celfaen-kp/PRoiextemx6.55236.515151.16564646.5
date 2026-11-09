-- Etapa 101 (Enzo, 9-11-2026): al borrar un presupuesto desde la app se borra
-- también la oferta en Teamleader, y aunque eso falle la oferta no vuelve a
-- importarse en la siguiente sincronización. Esta tabla es la lista de las
-- ofertas borradas; solo la toca la función teamleader-presupuesto (service role).
create table if not exists public.ofertas_borradas (
  tl_quotation_id text primary key,
  presupuesto_id  uuid,
  titulo          text,
  borrado_por     uuid,
  borrado_en      timestamptz not null default now(),
  borrado_en_tl   boolean not null default false,
  error_tl        text
);
alter table public.ofertas_borradas enable row level security;
