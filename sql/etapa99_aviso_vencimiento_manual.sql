-- =============================================================================
-- Etapa 99 (6-11-2026, Enzo): el aviso de vencimiento al cliente deja de salir
-- solo. El cron de las 07:30 avisa a presupuestos y Administración el día que
-- toca (dos laborables antes de vencer) y el correo al cliente se manda a mano
-- desde el presupuesto en la app. aviso_oficina_at evita repetir el aviso
-- interno; aviso_vencimiento_at sigue siendo «cliente avisado».
-- =============================================================================
alter table public.presupuestos add column if not exists aviso_oficina_at timestamptz;
comment on column public.presupuestos.aviso_oficina_at is 'Cuándo se avisó a la oficina de que vence (null = aún no). El aviso al cliente va a mano.';
-- Los que ya tenían al cliente avisado por el automático no vuelven a avisarse a la oficina.
update public.presupuestos set aviso_oficina_at = aviso_vencimiento_at where aviso_oficina_at is null and aviso_vencimiento_at is not null;
select count(*) filter (where aviso_oficina_at is not null) as con_aviso_oficina, count(*) as total from public.presupuestos;
