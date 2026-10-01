-- =============================================================================
-- Sysefen · Etapa 59 · Obras visibles para presupuestos; los costes, aparte
--                      (Etapa B del plan PLAN-OBRAS-PLANIFICACION.md)
--
-- QUÉ RESUELVE:
--   · El equipo de presupuestos no veía ninguna obra ni ningún parte. Ahora ve
--     todas, con sus horas y materiales (en unidades), y puede crear y editar
--     obras. El operario sigue viendo solo las suyas.
--   · Los COSTES (lo que cuesta la hora de cada persona, lo que se ha gastado
--     en cada obra, el margen frente al presupuesto) solo los ven
--     Administración y presupuestos: ve_costes(). El jefe de obra queda fuera
--     (decidido con Enzo el 1 de octubre de 2026): él pone los albaranes, los
--     recibos y los gastos, pero no ve el coste del personal ni la economía
--     de la obra.
--   · Los costes viven en tablas propias con su RLS. Nunca como columnas en
--     tablas que ve todo el mundo: RLS filtra filas, no columnas.
--
-- QUÉ SE AÑADE:
--   · ve_costes()
--   · empleado_costes: lo que cuesta la hora de cada empleado, con histórico.
--   · obra_costes: cada gasto de una obra. Se alimenta solo: cuando el jefe
--     pone un albarán o recibo con importe (obra_documentos) o un material
--     con importe en un parte (parte_materiales), aparece aquí. También se
--     puede apuntar a mano (subcontrata, alquiler, dieta…).
--   · presupuestos.obra_id y respuesta_cliente: el presupuesto que el cliente
--     aceptó se enlaza a la obra, y de ahí sale lo presupuestado.
--   · v_obra_economia y v_obra_economia_categoria: presupuestado frente a
--     real, horas previstas frente a reales, margen. Devuelven filas solo a
--     quien tiene ve_costes().
--
-- Requiere la etapa 58. Idempotente. No toca ningún dato.
-- =============================================================================

begin;

-- 1 · Quién ve costes ----------------------------------------------------------------
create or replace function public.ve_costes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() in ('presupuestos', 'admin'), false)
$$;
grant execute on function public.ve_costes() to authenticated;

-- 2 · Obras: las ve todo comercial; las crea y edita todo comercial ----------------
drop policy if exists obras_select on public.obras;
create policy obras_select on public.obras
  for select to authenticated
  using (public.es_comercial() or public.pertenece_a_obra(id));

drop policy if exists obras_insert on public.obras;
create policy obras_insert on public.obras
  for insert to authenticated
  with check (public.es_comercial());

drop policy if exists obras_update on public.obras;
create policy obras_update on public.obras
  for update to authenticated
  using (public.es_comercial())
  with check (public.es_comercial());
-- obras_delete se queda como en la etapa 57 (es_jefe).

-- 3 · Partes y sus líneas: los lee todo comercial; los escribe todo comercial ------
drop policy if exists partes_select on public.partes;
create policy partes_select on public.partes
  for select to authenticated
  using (public.es_comercial() or public.pertenece_a_obra(obra_id));

drop policy if exists partes_insert on public.partes;
create policy partes_insert on public.partes
  for insert to authenticated
  with check (public.es_comercial());

drop policy if exists partes_update on public.partes;
create policy partes_update on public.partes
  for update to authenticated
  using (public.es_comercial())
  with check (public.es_comercial());

drop policy if exists partes_delete on public.partes;
create policy partes_delete on public.partes
  for delete to authenticated
  using (public.es_comercial());

drop policy if exists parte_horas_select on public.parte_horas;
create policy parte_horas_select on public.parte_horas
  for select to authenticated
  using (exists (select 1 from public.partes p where p.id = parte_horas.parte_id
                    and (public.es_comercial() or public.pertenece_a_obra(p.obra_id))));
drop policy if exists parte_horas_insert on public.parte_horas;
create policy parte_horas_insert on public.parte_horas
  for insert to authenticated with check (public.es_comercial());
drop policy if exists parte_horas_update on public.parte_horas;
create policy parte_horas_update on public.parte_horas
  for update to authenticated using (public.es_comercial()) with check (public.es_comercial());
drop policy if exists parte_horas_delete on public.parte_horas;
create policy parte_horas_delete on public.parte_horas
  for delete to authenticated using (public.es_comercial());

drop policy if exists parte_materiales_select on public.parte_materiales;
create policy parte_materiales_select on public.parte_materiales
  for select to authenticated
  using (exists (select 1 from public.partes p where p.id = parte_materiales.parte_id
                    and (public.es_comercial() or public.pertenece_a_obra(p.obra_id))));
drop policy if exists parte_materiales_insert on public.parte_materiales;
create policy parte_materiales_insert on public.parte_materiales
  for insert to authenticated with check (public.es_comercial());
drop policy if exists parte_materiales_update on public.parte_materiales;
create policy parte_materiales_update on public.parte_materiales
  for update to authenticated using (public.es_comercial()) with check (public.es_comercial());
drop policy if exists parte_materiales_delete on public.parte_materiales;
create policy parte_materiales_delete on public.parte_materiales
  for delete to authenticated using (public.es_comercial());

-- Adjuntos: la lectura ya sigue al parte (etapa 12). Borrar: todo comercial.
drop policy if exists parte_adjuntos_insert on public.parte_adjuntos;
create policy parte_adjuntos_insert on public.parte_adjuntos
  for insert to authenticated
  with check (exists (select 1 from public.partes p where p.id = parte_id
                         and (public.es_comercial() or p.autor_id = public.empleado_id_actual())));
drop policy if exists parte_adjuntos_delete on public.parte_adjuntos;
create policy parte_adjuntos_delete on public.parte_adjuntos
  for delete to authenticated using (public.es_comercial());

-- 4 · Albaranes y recibos: los pone el jefe; los ve el jefe y quien ve costes ------
drop policy if exists obra_documentos_jefe on public.obra_documentos;
create policy obra_documentos_jefe on public.obra_documentos
  for all to authenticated
  using (public.es_jefe() or public.ve_costes())
  with check (public.es_jefe() or public.ve_costes());

drop policy if exists obra_docs_select on storage.objects;
create policy obra_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'obra-docs' and (public.es_jefe() or public.ve_costes()));
drop policy if exists obra_docs_insert on storage.objects;
create policy obra_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'obra-docs' and (public.es_jefe() or public.ve_costes()));
drop policy if exists obra_docs_delete on storage.objects;
create policy obra_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'obra-docs' and (public.es_jefe() or public.ve_costes()));

-- 5 · Coste de la hora de cada empleado, con histórico ------------------------------
create table if not exists public.empleado_costes (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  coste_hora   numeric(8,2) not null check (coste_hora >= 0),
  desde        date not null default current_date,
  hasta        date,                       -- null = vigente
  nota         text,
  creado_por   uuid default public.empleado_id_actual() references public.empleados(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists empleado_costes_emp_idx on public.empleado_costes (empleado_id, desde desc);

alter table public.empleado_costes enable row level security;
drop policy if exists empleado_costes_costes on public.empleado_costes;
create policy empleado_costes_costes on public.empleado_costes
  for all to authenticated
  using (public.ve_costes()) with check (public.ve_costes());

-- Al dar de alta una tarifa nueva, la anterior vigente se cierra el día antes.
create or replace function public.cerrar_coste_anterior()
returns trigger
language plpgsql
as $$
begin
  update public.empleado_costes
     set hasta = new.desde - 1
   where empleado_id = new.empleado_id and id <> new.id
     and hasta is null and desde < new.desde;
  return new;
end;
$$;
drop trigger if exists empleado_costes_cerrar on public.empleado_costes;
create trigger empleado_costes_cerrar
  after insert on public.empleado_costes
  for each row execute function public.cerrar_coste_anterior();

-- El coste vigente de un empleado en una fecha (null si no hay).
create or replace function public.coste_hora_de(p_empleado uuid, p_fecha date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coste_hora from public.empleado_costes
   where public.ve_costes()      -- a quien no ve costes le devuelve null, también por RPC
     and empleado_id = p_empleado and desde <= p_fecha and (hasta is null or hasta >= p_fecha)
   order by desde desc limit 1
$$;
grant execute on function public.coste_hora_de(uuid, date) to authenticated;

-- 6 · Los gastos de cada obra -------------------------------------------------------
create table if not exists public.obra_costes (
  id                 uuid primary key default gen_random_uuid(),
  obra_id            uuid not null references public.obras(id) on delete cascade,
  fecha              date not null default current_date,
  concepto           text not null,
  categoria          text check (categoria is null or categoria in ('AE', 'FV', 'AC')),
  tipo               text not null default 'otro'
                     check (tipo in ('material_tarifa', 'material_suelto', 'subcontrata', 'alquiler', 'dieta', 'otro')),
  cantidad           numeric(12,3) not null default 1,
  coste_unitario     numeric(12,2) not null default 0,
  coste_total        numeric(12,2) generated always as (round(cantidad * coste_unitario, 2)) stored,
  producto_id        uuid references public.productos(id) on delete set null,
  parte_material_id  uuid references public.parte_materiales(id) on delete cascade,
  documento_id       uuid references public.obra_documentos(id) on delete cascade,
  creado_por         uuid default public.empleado_id_actual() references public.empleados(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists obra_costes_obra_idx on public.obra_costes (obra_id, fecha desc);
create unique index if not exists obra_costes_parte_material_unico on public.obra_costes (parte_material_id) where parte_material_id is not null;
create unique index if not exists obra_costes_documento_unico on public.obra_costes (documento_id) where documento_id is not null;

alter table public.obra_costes enable row level security;
-- Los ve quien ve costes; además, cada uno ve lo que apuntó él.
drop policy if exists obra_costes_select on public.obra_costes;
create policy obra_costes_select on public.obra_costes
  for select to authenticated
  using (public.ve_costes() or creado_por = public.empleado_id_actual());
-- Apuntar un gasto a mano: todo comercial (el jefe pone gastos).
drop policy if exists obra_costes_insert on public.obra_costes;
create policy obra_costes_insert on public.obra_costes
  for insert to authenticated
  with check (public.es_comercial());
drop policy if exists obra_costes_update on public.obra_costes;
create policy obra_costes_update on public.obra_costes
  for update to authenticated
  using (public.ve_costes() or creado_por = public.empleado_id_actual())
  with check (public.ve_costes() or creado_por = public.empleado_id_actual());
drop policy if exists obra_costes_delete on public.obra_costes;
create policy obra_costes_delete on public.obra_costes
  for delete to authenticated
  using (public.ve_costes() or creado_por = public.empleado_id_actual());

-- 6a · Un albarán, recibo o factura con importe es un gasto de la obra.
create or replace function public.coste_desde_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.importe is null or new.importe = 0 then
    delete from public.obra_costes where documento_id = new.id;
    return new;
  end if;
  insert into public.obra_costes (obra_id, fecha, concepto, tipo, cantidad, coste_unitario, documento_id, creado_por)
  values (new.obra_id, new.fecha,
          coalesce(nullif(new.proveedor, ''), '') || case when nullif(new.proveedor, '') is not null and nullif(new.nota, '') is not null then ' · ' else '' end || coalesce(nullif(new.nota, ''), '')
            || case when nullif(new.proveedor, '') is null and nullif(new.nota, '') is null then initcap(new.tipo) else '' end,
          case when new.tipo in ('albaran', 'factura') then 'material_suelto' else 'otro' end,
          1, new.importe, new.id, new.subido_por)
  on conflict (documento_id) where documento_id is not null
  do update set fecha = excluded.fecha, concepto = excluded.concepto, tipo = excluded.tipo, coste_unitario = excluded.coste_unitario;
  return new;
end;
$$;
drop trigger if exists obra_documentos_coste on public.obra_documentos;
create trigger obra_documentos_coste
  after insert or update of importe, proveedor, nota, fecha, tipo on public.obra_documentos
  for each row execute function public.coste_desde_documento();

-- 6b · Un material con importe en un parte es un gasto de la obra.
create or replace function public.coste_desde_parte_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obra uuid; v_fecha date; v_autor uuid;
begin
  if new.importe is null or new.importe = 0 then
    delete from public.obra_costes where parte_material_id = new.id;
    return new;
  end if;
  select p.obra_id, p.fecha, p.autor_id into v_obra, v_fecha, v_autor from public.partes p where p.id = new.parte_id;
  if v_obra is null then return new; end if;
  insert into public.obra_costes (obra_id, fecha, concepto, tipo, cantidad, coste_unitario, parte_material_id, creado_por)
  values (v_obra, coalesce(v_fecha, current_date), coalesce(nullif(new.nombre, ''), 'Material del parte'),
          'material_suelto', 1, new.importe, new.id, v_autor)
  on conflict (parte_material_id) where parte_material_id is not null
  do update set fecha = excluded.fecha, concepto = excluded.concepto, coste_unitario = excluded.coste_unitario;
  return new;
end;
$$;
drop trigger if exists parte_materiales_coste on public.parte_materiales;
create trigger parte_materiales_coste
  after insert or update of importe, nombre on public.parte_materiales
  for each row execute function public.coste_desde_parte_material();

-- Lo que ya había apuntado con importe, también cuenta.
update public.obra_documentos set importe = importe where importe is not null and importe <> 0
   and not exists (select 1 from public.obra_costes c where c.documento_id = obra_documentos.id);
update public.parte_materiales set importe = importe where importe is not null and importe <> 0
   and not exists (select 1 from public.obra_costes c where c.parte_material_id = parte_materiales.id);

-- 7 · El presupuesto aceptado, enlazado a su obra ----------------------------------
alter table public.presupuestos add column if not exists obra_id uuid references public.obras(id) on delete set null;
alter table public.presupuestos add column if not exists respuesta_cliente text not null default 'pendiente'
  check (respuesta_cliente in ('pendiente', 'aceptado', 'rechazado', 'caducado'));
alter table public.presupuestos add column if not exists respondido_at timestamptz;
alter table public.presupuestos add column if not exists valido_hasta date;
create index if not exists presupuestos_obra_idx on public.presupuestos (obra_id) where obra_id is not null;

-- 8 · La economía de la obra ----------------------------------------------------------
-- Horas reales por obra y persona, sin contar dos veces el mismo día (misma
-- regla que integracion.v_obra_dia: si hay imputación manda la imputación).
create or replace view public.v_obra_horas_reales
with (security_invoker = true) as
with imp as (
  select obra_id, fecha, empleado_id, sum(minutos)::int as minutos
    from public.imputaciones
   where categoria = 'obra' and obra_id is not null
   group by obra_id, fecha, empleado_id
),
par as (
  select p.obra_id, p.fecha, ph.empleado_id, round(sum(ph.horas) * 60)::int as minutos
    from public.parte_horas ph
    join public.partes p on p.id = ph.parte_id
   where p.obra_id is not null and coalesce(p.estado, '') <> 'anulado'
   group by p.obra_id, p.fecha, ph.empleado_id
)
select obra_id, fecha, empleado_id, minutos from imp
union all
select par.obra_id, par.fecha, par.empleado_id, par.minutos
  from par
  left join imp on imp.obra_id = par.obra_id and imp.fecha = par.fecha and imp.empleado_id = par.empleado_id
 where imp.obra_id is null;

create or replace view public.v_obra_economia
with (security_invoker = true) as
with pres as (
  select obra_id,
         sum(total_venta) filter (where respuesta_cliente = 'aceptado') as venta_presupuestada,
         sum(total_coste) filter (where respuesta_cliente = 'aceptado') as coste_previsto
    from public.presupuestos where obra_id is not null group by obra_id
),
horas_prev as (
  select p.obra_id, sum(l.cantidad) as horas_previstas
    from public.presupuesto_lineas l
    join public.presupuestos p on p.id = l.presupuesto_id
   where p.obra_id is not null and p.respuesta_cliente = 'aceptado'
     and l.origen = 'mano_obra' and lower(l.unidad) in ('h', 'hora', 'horas')
   group by p.obra_id
),
reales as (
  select h.obra_id,
         sum(h.minutos) / 60.0 as horas_reales,
         sum(h.minutos / 60.0 * coalesce(public.coste_hora_de(h.empleado_id, h.fecha), 0)) as coste_mano_obra_real,
         count(*) filter (where public.coste_hora_de(h.empleado_id, h.fecha) is null) as dias_sin_coste
    from public.v_obra_horas_reales h group by h.obra_id
),
mat as (
  select obra_id, sum(coste_total) as coste_material_real from public.obra_costes group by obra_id
)
select o.id as obra_id, o.numero, public.codigo_obra(o.numero) as codigo, o.estado,
       pres.venta_presupuestada,
       pres.coste_previsto,
       horas_prev.horas_previstas,
       round(coalesce(reales.horas_reales, 0), 2)            as horas_reales,
       round(coalesce(reales.coste_mano_obra_real, 0), 2)    as coste_mano_obra_real,
       round(coalesce(mat.coste_material_real, 0), 2)        as coste_material_real,
       round(coalesce(reales.coste_mano_obra_real, 0) + coalesce(mat.coste_material_real, 0), 2) as coste_real,
       round(pres.venta_presupuestada - pres.coste_previsto, 2) as margen_previsto,
       round(pres.venta_presupuestada - coalesce(reales.coste_mano_obra_real, 0) - coalesce(mat.coste_material_real, 0), 2) as margen_real,
       case when coalesce(horas_prev.horas_previstas, 0) > 0
            then round(100 * coalesce(reales.horas_reales, 0) / horas_prev.horas_previstas, 1) end as pct_horas,
       coalesce(reales.dias_sin_coste, 0) as dias_sin_coste
  from public.obras o
  left join pres on pres.obra_id = o.id
  left join horas_prev on horas_prev.obra_id = o.id
  left join reales on reales.obra_id = o.id
  left join mat on mat.obra_id = o.id
 where public.ve_costes();

-- Por categoría: lo presupuestado y el material exacto de cada una; las horas
-- reales repartidas en proporción a las horas previstas de cada categoría.
create or replace view public.v_obra_economia_categoria
with (security_invoker = true) as
with pres as (
  select p.obra_id, p.categoria,
         sum(p.total_venta) as venta_presupuestada, sum(p.total_coste) as coste_previsto,
         sum(l.cantidad) filter (where l.origen = 'mano_obra' and lower(l.unidad) in ('h', 'hora', 'horas')) as horas_previstas
    from public.presupuestos p
    left join public.presupuesto_lineas l on l.presupuesto_id = p.id
   where p.obra_id is not null and p.respuesta_cliente = 'aceptado'
   group by p.obra_id, p.categoria
),
tot as (select obra_id, sum(horas_previstas) as horas_tot from pres group by obra_id),
reales as (
  select obra_id, sum(minutos) / 60.0 as horas_reales,
         sum(minutos / 60.0 * coalesce(public.coste_hora_de(empleado_id, fecha), 0)) as coste_mo
    from public.v_obra_horas_reales group by obra_id
),
mat as (select obra_id, coalesce(categoria, '') as categoria, sum(coste_total) as material from public.obra_costes group by obra_id, coalesce(categoria, ''))
select pres.obra_id, pres.categoria,
       pres.venta_presupuestada, pres.coste_previsto, pres.horas_previstas,
       round(coalesce(reales.horas_reales, 0) * case when coalesce(tot.horas_tot, 0) > 0 then pres.horas_previstas / tot.horas_tot else 0 end, 2) as horas_reales,
       round(coalesce(reales.coste_mo, 0) * case when coalesce(tot.horas_tot, 0) > 0 then pres.horas_previstas / tot.horas_tot else 0 end, 2) as coste_mano_obra_real,
       round(coalesce(mat.material, 0), 2) as coste_material_real
  from pres
  left join tot on tot.obra_id = pres.obra_id
  left join reales on reales.obra_id = pres.obra_id
  left join mat on mat.obra_id = pres.obra_id and mat.categoria = pres.categoria
 where public.ve_costes();

grant select on public.v_obra_horas_reales, public.v_obra_economia, public.v_obra_economia_categoria to authenticated;

commit;

-- =============================================================================
-- COMPROBACIÓN (con la API REST o el SQL Editor «como» cada usuario):
--   · presupuestos: select count(*) from public.obras;                     → todas
--   · operario:     select count(*) from public.obras;                     → solo las suyas
--   · jefe:         select * from public.empleado_costes;                  → 0 filas
--                   select * from public.v_obra_economia;                  → 0 filas
--   · admin:        select codigo, venta_presupuestada, coste_real, margen_real, pct_horas from public.v_obra_economia;
-- =============================================================================
