-- =============================================================================
-- Sysefen · Etapa 40 · El motor de presupuestos, solo para presupuestos
--
-- POR QUÉ:
--   La etapa 38 dejó el catálogo y las reglas a la vista de cualquier empleado
--   (operarios incluidos) y los presupuestos del motor también a los jefes de
--   obra. Decisión (22-09-2026): todo el motor es cosa del equipo de
--   presupuestos, que es quien lleva la parte comercial. Administración entra
--   también, como en el resto de la app.
--
-- QUIÉN PUEDE QUÉ (presupuestos + Administración, y nadie más):
--   Ver y cambiar el catálogo, las tarifas, las reglas y las partidas.
--   Ver, crear y cambiar los presupuestos del motor, sus líneas, incidencias y
--   correcciones.
--
--   Operarios y jefes de obra: nada. No ven ni los precios de tarifa.
--
--   (Cargar tarifas con herramientas/cargar-tarifa.py usa la clave secreta,
--   que no pasa por estas políticas; no le afecta.)
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

create or replace function public.es_motor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() in ('presupuestos', 'admin'), false)
$$;

grant execute on function public.es_motor() to authenticated;

-- Catálogo, reglas y política: quitar las de la 38 y dejar una sola.
do $$
declare t text;
begin
  foreach t in array array[
    'proveedores','tarifas','productos','variables_derivadas','tablas_lookup',
    'producto_equivalencias','partidas','partidas_items','conjuntos_reglas',
    'reglas','mano_obra','politica_descuentos','ratios']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_motor', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.es_motor()) with check (public.es_motor())',
      t || '_motor', t);
  end loop;
end $$;

-- Presupuestos del motor y lo que cuelga de ellos.
drop policy if exists presupuestos_comercial on public.presupuestos;
drop policy if exists presupuestos_motor on public.presupuestos;
create policy presupuestos_motor on public.presupuestos
  for all to authenticated
  using (public.es_motor())
  with check (public.es_motor());

do $$
declare t text;
begin
  foreach t in array array['presupuesto_lineas','presupuesto_incidencias','motor_correcciones']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_por_presupuesto', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.es_motor() and exists (select 1 from public.presupuestos p where p.id = %I.presupuesto_id))
         with check (public.es_motor() and exists (select 1 from public.presupuestos p where p.id = %I.presupuesto_id))',
      t || '_por_presupuesto', t, t, t);
  end loop;
end $$;

commit;

-- Comprobación: cada tabla del motor con una sola política, *_motor o *_por_presupuesto
--   select tablename, policyname from pg_policies
--    where tablename in ('productos','reglas','presupuestos','presupuesto_lineas') order by 1;
