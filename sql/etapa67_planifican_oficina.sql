-- =============================================================================
-- Sysefen · Etapa 67 · Planifican presupuestos y Administración; jefes y
--                      operarios van día a día
--
-- POR QUÉ (decidido con Enzo, 2 oct 2026):
--   La planificación la hace la oficina (presupuestos y Administración). Los
--   jefes de obra y los operarios no planifican: ven a dónde van hoy y, a
--   partir de las 14:00, a dónde van mañana, para salir de la obra sabiéndolo.
--
-- QUÉ CAMBIA:
--   · planificacion: la escriben solo presupuestos y Administración
--     (ve_costes()); cada uno lee lo suyo; la oficina lo lee todo.
--   · v_obras_sin_planificar: solo para la oficina.
--   · La tarea de correo pasa de las 19:00 a las 14:00 (hora de Mallorca).
--
-- Requiere la etapa 60. Idempotente.
-- =============================================================================

begin;

drop policy if exists planificacion_select on public.planificacion;
create policy planificacion_select on public.planificacion
  for select to authenticated
  using (public.ve_costes() or empleado_id = public.empleado_id_actual());

drop policy if exists planificacion_insert on public.planificacion;
create policy planificacion_insert on public.planificacion
  for insert to authenticated with check (public.ve_costes());
drop policy if exists planificacion_update on public.planificacion;
create policy planificacion_update on public.planificacion
  for update to authenticated using (public.ve_costes()) with check (public.ve_costes());
drop policy if exists planificacion_delete on public.planificacion;
create policy planificacion_delete on public.planificacion
  for delete to authenticated using (public.ve_costes());

create or replace view public.v_obras_sin_planificar
with (security_invoker = true) as
select d.fecha, o.id as obra_id, o.numero, public.codigo_obra(o.numero) as codigo, o.nombre as obra,
       o.cliente, o.direccion, o.poblacion, o.categorias, o.estado
  from public.obras o
 cross join (select (current_date + g)::date as fecha from generate_series(0, 14) g) d
 where o.estado in ('planificada', 'en_curso')
   and public.ve_costes()
   and not exists (select 1 from public.planificacion p where p.obra_id = o.id and p.fecha = d.fecha);

commit;

-- La tarea de correo, a las 14:00 de Mallorca (12:00 UTC en verano; en
-- invierno saldrá a las 13:00). Se copia la clave de la tarea que ya existe.
select cron.unschedule(jobid) from cron.job where jobname = 'planificacion-manana';
select cron.schedule(
  'planificacion-manana',
  '0 12 * * *',
  replace(
    (select command from cron.job where jobname = 'resumen-citas-manana'),
    '{"resumen_dia": true}', '{"planificacion_manana": true}')
);

-- COMPROBACIÓN
--   select jobname, schedule from cron.job where jobname = 'planificacion-manana';
