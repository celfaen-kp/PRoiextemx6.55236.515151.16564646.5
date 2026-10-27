-- =============================================================================
-- Sysefen · Etapa 93 · El presupuesto se manda al cliente desde la app y se firma en línea
--
-- POR QUÉ (Enzo, 27 oct 2026):
--   Mandar el presupuesto por correo desde la app (con mensaje, varias opciones
--   juntas o una sola), que el cliente lo acepte y firme desde un enlace, y que
--   el PDF firmado llegue a la oficina por correo y al Drive, con el presupuesto
--   marcado como aceptado.
--
-- QUÉ HACE:
--   · presupuestos: token_cliente (enlace de firma), lo enviado (cuándo, a quién,
--     PDF) y la firma (cuándo, quién, DNI, IP, imagen, PDF firmado, enlace Drive).
--   · Bucket privado `presupuestos-cliente` (PDF enviado, firma y PDF firmado).
--     Lo escribe la función; lo leen presupuestos, jefes y Administración.
-- Idempotente.
-- =============================================================================
begin;
alter table public.presupuestos add column if not exists token_cliente text unique;
alter table public.presupuestos add column if not exists enviado_correo_at timestamptz;
alter table public.presupuestos add column if not exists enviado_correo_a text;
alter table public.presupuestos add column if not exists pdf_enviado_ruta text;
alter table public.presupuestos add column if not exists firmado_at timestamptz;
alter table public.presupuestos add column if not exists firma_nombre text;
alter table public.presupuestos add column if not exists firma_dni text;
alter table public.presupuestos add column if not exists firma_ip text;
alter table public.presupuestos add column if not exists firma_ruta text;
alter table public.presupuestos add column if not exists pdf_firmado_ruta text;
alter table public.presupuestos add column if not exists drive_firmado_url text;
comment on column public.presupuestos.token_cliente is 'Clave del enlace público «ver y aceptar» del cliente.';
insert into storage.buckets (id, name, public) values ('presupuestos-cliente', 'presupuestos-cliente', false) on conflict (id) do nothing;
drop policy if exists presu_cliente_select on storage.objects;
create policy presu_cliente_select on storage.objects for select to authenticated using (bucket_id = 'presupuestos-cliente' and (public.es_jefe() or public.es_presupuestos()));
commit;
select id, public from storage.buckets where id = 'presupuestos-cliente';
