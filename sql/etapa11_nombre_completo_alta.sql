-- =============================================================================
-- Sysefen · Etapa 11 · Nombre completo y fecha de alta real
--
-- POR QUÉ:
--   En la app cada uno entra como "Jaime", "David", "Ale": nombres cortos, que
--   es lo cómodo en el móvil. Pero la planilla de horas es un documento que
--   puede acabar delante de una inspección, y ahí tiene que constar el nombre
--   completo del trabajador.
--   Igual con el alta: `creado_en` es cuándo se creó la ficha en la app, no
--   cuándo entró a trabajar la persona. Para el registro de jornada importa la
--   segunda.
--
-- QUÉ HACE:
--   - Añade `nombre_completo` (texto) y `fecha_alta` (fecha) a empleados.
--   - Rellena los tres que ya se conocen.
--   Las dos columnas admiten NULL: si están vacías, la app usa el nombre corto
--   y `creado_en`, así que nada se rompe si se deja a medias.
--
-- Idempotente y no destructivo.
-- =============================================================================

begin;

alter table public.empleados add column if not exists nombre_completo text;
alter table public.empleados add column if not exists fecha_alta      date;

comment on column public.empleados.nombre_completo is
  'Nombre y apellidos para documentos (planilla, PDF). El login usa `nombre`.';
comment on column public.empleados.fecha_alta is
  'Alta real como trabajador. Distinta de creado_en (alta de la ficha en la app).';

-- Datos conocidos a 08/09/2026. Bayron es autónomo: sin alta como trabajador.
update public.empleados set nombre_completo = 'Jaime Mora',         fecha_alta = date '2025-07-16' where nombre = 'Jaime';
update public.empleados set nombre_completo = 'David Londoño',      fecha_alta = date '2026-06-01' where nombre = 'David';
update public.empleados set nombre_completo = 'Alejandro Guerrero', fecha_alta = date '2026-09-01' where nombre = 'Ale';

commit;

-- Comprobación rápida (opcional):
--   select nombre, nombre_completo, fecha_alta from public.empleados order by creado_en;
