-- =============================================================================
-- Sysefen · Etapa 80 · El orden de las personas en la planificación
--
-- POR QUÉ (Enzo, 18 oct 2026):
--   En la planificación semanal las filas salían por rol y nombre (jefes
--   primero, luego alfabético). Se quiere un orden propio: Bayron, Ale, Jaime
--   y David al final.
--
-- QUÉ HACE:
--   · empleados.orden_plan: posición en la planificación (1 = arriba). Null =
--     detrás de los que tienen orden, con el orden de siempre. Se cambia desde
--     Empleados → la persona → «Orden en la planificación».
--   · Deja puesto el orden pedido hoy. Si algún nombre no coincide, no pasa
--     nada: se ajusta desde la app.
--
-- Idempotente.
-- =============================================================================

begin;

alter table public.empleados add column if not exists orden_plan integer;
comment on column public.empleados.orden_plan is 'Posición en la planificación semanal (1 = arriba). Null = detrás, por rol y nombre.';

update public.empleados set orden_plan = 1 where nombre = 'Bayron';
update public.empleados set orden_plan = 2 where nombre = 'Ale';
update public.empleados set orden_plan = 3 where nombre = 'Jaime';
update public.empleados set orden_plan = 4 where nombre = 'David';

commit;

-- COMPROBACIÓN
--   select nombre, rol, orden_plan from public.empleados where activo order by orden_plan nulls last, nombre;
