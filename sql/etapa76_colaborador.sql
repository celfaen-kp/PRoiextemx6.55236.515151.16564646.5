-- =============================================================================
-- Sysefen · Etapa 76 · El rol «colaborador»: presupuestos, pero solo con los
--                      clientes que le asignen
--
-- POR QUÉ (Enzo, 15 oct 2026):
--   Entra una persona externa (Pedro) que hará citas, visitas y presupuestos
--   como el rol presupuestos, pero NO debe ver obras, horas ni la cartera de
--   clientes entera: solo los clientes que presupuestos o Administración le
--   asignen como «colaborador» desde la ficha del cliente. Ni los que entran
--   por la web, ni los del CRM, ni ninguno sin asignar.
--
-- QUÉ HACE:
--   · empleados.rol admite 'colaborador'.
--   · clientes_cache.colaborador_id: a quién está asignado el cliente (null =
--     nadie). Lo ponen presupuestos y Administración (su política de siempre).
--   · es_colaborador(), cliente_asignado(cliente), visita_asignada(visita):
--     helpers para las políticas, con el mismo patrón que es_comercial().
--   · Políticas nuevas *_colaborador en clientes_cache (ver y cambiar los
--     suyos, nunca crear ni borrar), cliente_bitacora, citas (crear, cambiar y
--     borrar las de sus clientes), visitas y sus fichas, fotos y cola de
--     sincronización, presupuestos con sus líneas, incidencias y correcciones,
--     y el bucket de fotos de visitas. Todo condicionado a que el cliente esté
--     asignado a quien mira.
--   · NO se toca ninguna política existente: el colaborador no es es_comercial()
--     ni es_presupuestos(), así que lo de obras, horas, legalizaciones, leads de
--     la web y planificación le sigue cerrado como a un operario.
--
-- Las funciones de servidor que usan la clave maestra (presupuestar,
-- teamleader-*, correo-visita, visita-drive, cliente-drive, recordatorio-citas)
-- hacen la misma comprobación por su cuenta: están actualizadas a la vez.
--
-- Idempotente. No toca ningún dato. Requiere las etapas 20, 23, 31, 37, 38, 71.
-- =============================================================================

begin;

-- 1 · El rol --------------------------------------------------------------------
alter table public.empleados drop constraint if exists empleados_rol_check;
alter table public.empleados add constraint empleados_rol_check
  check (rol in ('operario', 'jefe', 'admin', 'presupuestos', 'colaborador'));

-- 2 · A quién está asignado cada cliente --------------------------------------------
alter table public.clientes_cache add column if not exists colaborador_id uuid references public.empleados(id) on delete set null;
comment on column public.clientes_cache.colaborador_id is 'Colaborador (empleados.rol = colaborador) que lleva este cliente. Solo él lo ve entre los colaboradores; null = ninguno.';
create index if not exists clientes_cache_colaborador on public.clientes_cache (colaborador_id) where colaborador_id is not null;

-- 3 · Helpers ---------------------------------------------------------------------------
create or replace function public.es_colaborador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() = 'colaborador', false)
$$;

create or replace function public.cliente_asignado(p_cliente uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_cliente is not null and exists (
    select 1 from public.clientes_cache c
     where c.id = p_cliente and c.colaborador_id = public.empleado_id_actual()
  )
$$;

create or replace function public.visita_asignada(p_visita uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_visita is not null and exists (
    select 1 from public.visitas v
      join public.clientes_cache c on c.id = v.cliente_id
     where v.id = p_visita and c.colaborador_id = public.empleado_id_actual()
  )
$$;

grant execute on function public.es_colaborador(), public.cliente_asignado(uuid), public.visita_asignada(uuid) to authenticated;

-- 4 · Políticas (todas nuevas, nombre *_colaborador; las existentes no se tocan) ------

-- Clientes: ver y cambiar los suyos. No puede crear (tendría que asignárselo
-- alguien) ni borrar. El with check impide que se lo quite o se lo pase a otro.
drop policy if exists clientes_cache_colaborador_ver on public.clientes_cache;
create policy clientes_cache_colaborador_ver on public.clientes_cache
  for select to authenticated
  using (public.es_colaborador() and colaborador_id = public.empleado_id_actual());
drop policy if exists clientes_cache_colaborador_cambiar on public.clientes_cache;
create policy clientes_cache_colaborador_cambiar on public.clientes_cache
  for update to authenticated
  using (public.es_colaborador() and colaborador_id = public.empleado_id_actual())
  with check (public.es_colaborador() and colaborador_id = public.empleado_id_actual());

-- Bitácora del cliente (llamadas, próxima acción): la de sus clientes.
drop policy if exists cliente_bitacora_colaborador on public.cliente_bitacora;
create policy cliente_bitacora_colaborador on public.cliente_bitacora
  for all to authenticated
  using (public.es_colaborador() and public.cliente_asignado(cliente_id))
  with check (public.es_colaborador() and public.cliente_asignado(cliente_id));

-- Citas: las de sus clientes, con todo (crear, cambiar, borrar).
drop policy if exists citas_colaborador on public.citas;
create policy citas_colaborador on public.citas
  for all to authenticated
  using (public.es_colaborador() and public.cliente_asignado(cliente_id))
  with check (public.es_colaborador() and public.cliente_asignado(cliente_id));

-- Visitas: las de sus clientes. Crea y borra solo las suyas (tecnico_id).
drop policy if exists visitas_colaborador_ver on public.visitas;
create policy visitas_colaborador_ver on public.visitas
  for select to authenticated
  using (public.es_colaborador() and public.cliente_asignado(cliente_id));
drop policy if exists visitas_colaborador_crear on public.visitas;
create policy visitas_colaborador_crear on public.visitas
  for insert to authenticated
  with check (public.es_colaborador() and public.cliente_asignado(cliente_id) and tecnico_id = auth.uid());
drop policy if exists visitas_colaborador_cambiar on public.visitas;
create policy visitas_colaborador_cambiar on public.visitas
  for update to authenticated
  using (public.es_colaborador() and public.cliente_asignado(cliente_id))
  with check (public.es_colaborador() and public.cliente_asignado(cliente_id));
drop policy if exists visitas_colaborador_borrar on public.visitas;
create policy visitas_colaborador_borrar on public.visitas
  for delete to authenticated
  using (public.es_colaborador() and public.cliente_asignado(cliente_id) and tecnico_id = auth.uid());

-- Fichas, fotos y cola de sincronización: por la visita.
drop policy if exists visita_fichas_colaborador on public.visita_fichas;
create policy visita_fichas_colaborador on public.visita_fichas
  for all to authenticated
  using (public.es_colaborador() and public.visita_asignada(visita_id))
  with check (public.es_colaborador() and public.visita_asignada(visita_id));
drop policy if exists visita_adjuntos_colaborador on public.visita_adjuntos;
create policy visita_adjuntos_colaborador on public.visita_adjuntos
  for all to authenticated
  using (public.es_colaborador() and public.visita_asignada(visita_id))
  with check (public.es_colaborador() and public.visita_asignada(visita_id));
drop policy if exists sync_cola_colaborador on public.sync_cola;
create policy sync_cola_colaborador on public.sync_cola
  for select to authenticated
  using (public.es_colaborador() and public.visita_asignada(visita_id));

-- Las fotos en el bucket: ver y subir (las rutas llevan el id de la visita; la
-- tabla visita_adjuntos ya filtra qué fotos se listan). Borrar, no.
drop policy if exists visitas_storage_colaborador_ver on storage.objects;
create policy visitas_storage_colaborador_ver on storage.objects
  for select to authenticated
  using (bucket_id = 'visitas' and public.es_colaborador());
drop policy if exists visitas_storage_colaborador_subir on storage.objects;
create policy visitas_storage_colaborador_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'visitas' and public.es_colaborador());

-- Presupuestos: los de sus clientes (por el cliente o por la visita).
drop policy if exists presupuestos_colaborador on public.presupuestos;
create policy presupuestos_colaborador on public.presupuestos
  for all to authenticated
  using (public.es_colaborador() and (public.cliente_asignado(cliente_id) or public.visita_asignada(visita_id)))
  with check (public.es_colaborador() and (public.cliente_asignado(cliente_id) or public.visita_asignada(visita_id)));

-- Líneas, incidencias y correcciones: por el presupuesto (el exists ya pasa por
-- la política de presupuestos, así que solo cuentan los que puede ver).
do $$
declare t text;
begin
  foreach t in array array['presupuesto_lineas', 'presupuesto_incidencias', 'motor_correcciones'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_colaborador', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.es_colaborador() and exists (select 1 from public.presupuestos p where p.id = %I.presupuesto_id))
         with check (public.es_colaborador() and exists (select 1 from public.presupuestos p where p.id = %I.presupuesto_id))',
      t || '_colaborador', t, t, t);
  end loop;
end $$;

commit;

-- COMPROBACIONES
--   Las políticas del colaborador:
--   select tablename, policyname from pg_policies where policyname like '%colaborador%' order by 1, 2;
--
--   Qué clientes tiene asignados cada colaborador:
--   select e.nombre as colaborador, count(c.id) as clientes
--     from public.empleados e left join public.clientes_cache c on c.colaborador_id = e.id
--    where e.rol = 'colaborador' group by 1 order by 1;
--
--   Asignar un cliente a mano (lo normal es desde la ficha del cliente en la app):
--   update public.clientes_cache set colaborador_id = (select id from public.empleados where nombre = 'Pedro')
--    where id = '<id del cliente>';
