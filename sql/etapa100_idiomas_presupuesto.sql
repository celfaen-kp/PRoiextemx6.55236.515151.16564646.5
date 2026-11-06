-- Etapa 100 · El presupuesto en otro idioma (Enzo, 6-11-2026)
-- Las traducciones de las líneas del catálogo, para no pedirlas dos veces, y
-- el idioma en que se le mandó el presupuesto al cliente (para el PDF firmado
-- y los correos de después).
create table if not exists traducciones (
  idioma text not null,
  hash text not null,
  origen text not null,
  texto text not null,
  created_at timestamptz not null default now(),
  primary key (idioma, hash)
);
alter table traducciones enable row level security;
-- Solo las funciones (service role) la leen y escriben.

alter table presupuestos add column if not exists idioma_cliente text not null default 'es';
