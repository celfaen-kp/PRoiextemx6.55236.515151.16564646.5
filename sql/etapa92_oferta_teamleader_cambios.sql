-- Sysefen · Etapa 92 · Los cambios de la oferta van y vienen con Teamleader (Enzo, 27 oct 2026)
--   presupuestos.tl_updated_at: la última modificación de la oferta en Teamleader que la app ya tiene.
--   Si Teamleader la cambia después, la sincronización trae las líneas; si se edita en la app, se actualiza allí.
-- Idempotente.
alter table public.presupuestos add column if not exists tl_updated_at timestamptz;
comment on column public.presupuestos.tl_updated_at is 'updated_at de la oferta en Teamleader que la app ya tiene aplicado. Null = nunca comparado.';
