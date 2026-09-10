begin;

-- Días de vacaciones al año que le corresponden a cada persona.
-- 30 días naturales es el mínimo legal (art. 38 ET); si vuestro convenio da
-- más, se cambia desde la app en la ficha de cada empleado.
alter table public.empleados
  add column if not exists vacaciones_anuales integer not null default 30;

comment on column public.empleados.vacaciones_anuales is
  'Días naturales de vacaciones al año según convenio. Se prorratean por la fecha de alta.';

commit;
