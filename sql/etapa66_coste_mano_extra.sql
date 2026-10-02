-- =============================================================================
-- Sysefen · Etapa 66 · El coste de la mano extra (peón, oficial) entra en la obra
--
-- POR QUÉ:
--   En los partes puede ir ayuda externa sin ficha (peón, oficial; etapa 54).
--   Sus horas no costaban nada en la economía de la obra porque no había
--   dónde ponerles tarifa. Ahora «Costes de personal» admite también la
--   tarifa por hora del peón y del oficial externos, y la economía de la obra
--   suma sus horas (partes.horas_externas) a ese precio.
--
-- Requiere las etapas 59 y 54. Idempotente.
-- =============================================================================

begin;

-- 1 · La tarifa puede ser de un empleado o de un rol externo -----------------------
alter table public.empleado_costes alter column empleado_id drop not null;
alter table public.empleado_costes add column if not exists externo text check (externo in ('peon', 'oficial'));
alter table public.empleado_costes drop constraint if exists empleado_costes_quien;
alter table public.empleado_costes add constraint empleado_costes_quien
  check ((empleado_id is not null and externo is null) or (empleado_id is null and externo is not null));
create index if not exists empleado_costes_externo_idx on public.empleado_costes (externo, desde desc) where externo is not null;

-- El cierre de la tarifa anterior también para los externos.
create or replace function public.cerrar_coste_anterior()
returns trigger
language plpgsql
as $$
begin
  update public.empleado_costes
     set hasta = new.desde - 1
   where id <> new.id and hasta is null and desde < new.desde
     and ((new.empleado_id is not null and empleado_id = new.empleado_id)
       or (new.externo is not null and externo = new.externo));
  return new;
end;
$$;

create or replace function public.coste_hora_externo(p_rol text, p_fecha date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coste_hora from public.empleado_costes
   where public.ve_costes()
     and externo = p_rol and desde <= p_fecha and (hasta is null or hasta >= p_fecha)
   order by desde desc limit 1
$$;
grant execute on function public.coste_hora_externo(text, date) to authenticated;

-- 2 · La economía de la obra suma la mano extra ----------------------------------------
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
-- La mano extra de los partes: {"peon": 8, "oficial": 4, "peon2": 2, "oficial2": 0}.
-- Peón y Peón 2 van a la tarifa de peón; Oficial y Oficial 2 a la de oficial.
extra as (
  select p.obra_id,
         sum(x.h) as horas_extra,
         sum(x.h * coalesce(public.coste_hora_externo(x.rol, p.fecha), 0)) as coste_extra,
         count(*) filter (where public.coste_hora_externo(x.rol, p.fecha) is null) as sin_tarifa
    from public.partes p
   cross join lateral (
     select case when e.key like 'peon%' then 'peon' else 'oficial' end as rol,
            nullif(e.value, '')::numeric as h
       from jsonb_each_text(coalesce(p.horas_externas, '{}'::jsonb)) e
   ) x
   where coalesce(p.estado, '') <> 'anulado' and x.h > 0
   group by p.obra_id
),
mat as (
  select obra_id, sum(coste_total) as coste_material_real from public.obra_costes group by obra_id
)
select o.id as obra_id, o.numero, public.codigo_obra(o.numero) as codigo, o.estado,
       pres.venta_presupuestada,
       pres.coste_previsto,
       horas_prev.horas_previstas,
       round(coalesce(reales.horas_reales, 0) + coalesce(extra.horas_extra, 0), 2)            as horas_reales,
       round(coalesce(reales.coste_mano_obra_real, 0) + coalesce(extra.coste_extra, 0), 2)    as coste_mano_obra_real,
       round(coalesce(extra.horas_extra, 0), 2)                                                as horas_extra,
       round(coalesce(extra.coste_extra, 0), 2)                                                as coste_extra,
       round(coalesce(mat.coste_material_real, 0), 2)        as coste_material_real,
       round(coalesce(reales.coste_mano_obra_real, 0) + coalesce(extra.coste_extra, 0) + coalesce(mat.coste_material_real, 0), 2) as coste_real,
       round(pres.venta_presupuestada - pres.coste_previsto, 2) as margen_previsto,
       round(pres.venta_presupuestada - coalesce(reales.coste_mano_obra_real, 0) - coalesce(extra.coste_extra, 0) - coalesce(mat.coste_material_real, 0), 2) as margen_real,
       case when coalesce(horas_prev.horas_previstas, 0) > 0
            then round(100 * (coalesce(reales.horas_reales, 0) + coalesce(extra.horas_extra, 0)) / horas_prev.horas_previstas, 1) end as pct_horas,
       coalesce(reales.dias_sin_coste, 0) + coalesce(extra.sin_tarifa, 0) as dias_sin_coste
  from public.obras o
  left join pres on pres.obra_id = o.id
  left join horas_prev on horas_prev.obra_id = o.id
  left join reales on reales.obra_id = o.id
  left join extra on extra.obra_id = o.id
  left join mat on mat.obra_id = o.id
 where public.ve_costes();

grant select on public.v_obra_economia to authenticated;

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select externo, coste_hora, desde from public.empleado_costes where externo is not null;
--   select codigo, horas_extra, coste_extra, coste_mano_obra_real from public.v_obra_economia where horas_extra > 0;
-- =============================================================================
