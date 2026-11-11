-- =============================================================================
-- Sysefen · Etapa 108 · Copia del PDF de cada factura, y el correo al cliente (Enzo, 11 nov 2026)
--
--   · «Al ver el PDF se descarga directamente; estaría bueno verlo en otra pestaña
--     antes de descargarlo.» El enlace de Teamleader fuerza la descarga. Ahora la
--     función `teamleader-factura` guarda una copia de cada PDF en el almacén
--     privado «facturas» y lo abre desde ahí, que lo enseña en el navegador.
--   · Esa copia es también la que va en el paquete de la gestoría (listado en
--     Excel y los PDF del mes o del trimestre, en un ZIP) y la que se adjunta al
--     enviar la factura al cliente por correo desde la app.
--   · Y es parte de la mudanza: el día que se deje Teamleader, los PDF ya están aquí.
--
-- Nadie lee el almacén directamente: la función da enlaces firmados de una hora.
-- Idempotente.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict (id) do nothing;

alter table public.facturas add column if not exists pdf_ruta        text;         -- dónde está la copia del PDF en el almacén
alter table public.facturas add column if not exists pdf_at          timestamptz;  -- cuándo se guardó (si la factura cambia después, se vuelve a bajar)
alter table public.facturas add column if not exists cliente_email   text;         -- el correo del cliente que tiene Teamleader en la factura
alter table public.facturas add column if not exists enviada_app_at  timestamptz;  -- enviada por correo desde la app
alter table public.facturas add column if not exists enviada_app_a   text;
alter table public.facturas add column if not exists enviada_app_por uuid;

select count(*) filter (where pdf_ruta is not null) as con_pdf, count(*) as facturas from public.facturas;
