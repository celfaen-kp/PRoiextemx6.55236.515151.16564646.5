-- Sysefen · Etapa 131 · Reabrir un presupuesto rechazado o caducado (Enzo, 26 nov 2026)
--   «A los rechazados no puedo regresarlos a presupuesto por revisar… no me deja.»
--   La app lo devuelve a «pendiente» y apunta aquí cuándo y quién. La sincronización con
--   Teamleader (teamleader-presupuesto) lo mira: si la oportunidad sigue perdida allí, o en una
--   fase de «enviado», de ANTES de reabrirlo, ya no vuelve a marcarlo rechazado ni enviado.
--   Idempotente.

alter table public.presupuestos add column if not exists reabierto_at timestamptz;
alter table public.presupuestos add column if not exists reabierto_por uuid references public.empleados(id) on delete set null;
comment on column public.presupuestos.reabierto_at is 'Cuándo se reabrió a mano tras un rechazo o caducidad. La sync de Teamleader ignora rechazos y envíos anteriores a esta fecha.';

select count(*) as columnas from information_schema.columns where table_schema = 'public' and table_name = 'presupuestos' and column_name in ('reabierto_at', 'reabierto_por');
