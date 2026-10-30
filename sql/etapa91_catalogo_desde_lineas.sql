-- 30-10-2026 (Enzo): lo que se añadió a mano a los presupuestos y lo que vino en
-- las ofertas de Teamleader pasa al «Catálogo propio» para reutilizarlo. Una vez
-- por nombre (sin mayúsculas ni tildes); si ya hay un producto activo con ese
-- nombre, se usa ese. Cada línea apunta en origen_inputs.producto_catalogo la
-- referencia que le corresponde. Desde hoy lo hacen solas las funciones
-- presupuestar (recalcular) y teamleader-presupuesto (volcar oferta).
create or replace function pg_temp.clave_nombre(t text) returns text language sql immutable as $$
  select lower(translate(trim(regexp_replace(t, '\s+', ' ', 'g')), 'áéíóúÁÉÍÓÚñÑüÜàèìòùÀÈÌÒÙçÇ', 'aeiouAEIOUnNuUaeiouAEIOUcC'))
$$;
create or replace function pg_temp.familia_de(t text) returns text language sql immutable as $$
  select case
    when t ~* 'mano de obra|montaje|instalaci[oó]n el[eé]ctrica|desplazamiento|puesta en marcha|\mhoras?\M|retirada|desmontaje|conexionado|limpieza' then 'mano_obra'
    when t ~* 'legalizaci|tr[aá]mite|certificad|bolet[ií]n|registro|industria|licencia|gesti[oó]n|subvenci|memoria t|proyecto|ingenier|documentaci' then 'tramite'
    when t ~* 'inversor|bater[ií]a|bomba de calor|aerotermia|panel|m[oó]dulo|cargador|split|acumulador|dep[oó]sito|unidad (interior|exterior)|termo|caldera|optimizador|microinversor|powerwall|sonnen|enphase|deye|huawei|fronius|midea|daikin|vaillant|wallbox|unistor|arotherm' then 'equipo'
    else 'material' end
$$;
create temp table lineas_base on commit drop as
  select l.id, trim(regexp_replace(l.descripcion, '\s+', ' ', 'g')) nombre, pg_temp.clave_nombre(l.descripcion) k,
         l.detalle_tecnico, l.unidad, l.precio_tarifa, l.precio_venta, l.precio_coste, l.iva, l.origen_inputs, coalesce(pr.created_at, now()) created_at
  from presupuesto_lineas l left join presupuestos pr on pr.id = l.presupuesto_id
  where l.origen = 'manual' and l.producto_ref is null and length(trim(l.descripcion)) >= 3
    and coalesce(l.origen_inputs->>'producto_catalogo', '') = '' and l.descripcion !~* '^l[ií]nea de la oferta$';
create temp table nuevos_creados (referencia text, k text) on commit drop;
with ultimas as (
  select distinct on (k) * from lineas_base order by k, created_at desc
), candidatas as (
  select u.*, round(coalesce(nullif(u.precio_tarifa, 0), u.precio_venta, 0)::numeric, 2) venta,
         case when u.precio_coste > 0 and u.precio_coste <= coalesce(nullif(u.precio_tarifa, 0), u.precio_venta, 0) then round(u.precio_coste::numeric, 2) end coste
  from ultimas u
  where not exists (select 1 from productos p where p.activo and pg_temp.clave_nombre(p.nombre) = u.k)
    and coalesce(nullif(u.precio_tarifa, 0), u.precio_venta, 0) > 0
), metidos as (
  insert into productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, iva, detalle_tecnico, especificaciones, atributos, recargo, aplica_cdc, activo, tl_producto_id)
  select (select id from tarifas where nombre = 'Catálogo propio' limit 1),
         'SY-' || trim(both '-' from left(regexp_replace(upper(translate(c.nombre, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')), '[^A-Z0-9]+', '-', 'g'), 28)) || '-' || upper(substr(md5(random()::text || c.k), 1, 4)),
         left(c.nombre, 200), pg_temp.familia_de(c.nombre), coalesce(nullif(left(c.unidad, 12), ''), 'ud'),
         coalesce(c.coste, c.venta), 0, case when c.iva > 0 then c.iva else 21 end, left(c.detalle_tecnico, 1000), '[]'::jsonb,
         jsonb_build_object('propio', true, 'origen', case when (c.origen_inputs->>'teamleader') = 'true' then 'teamleader' else 'presupuesto' end) || case when c.coste is null then '{"sin_recargo": true}'::jsonb else '{}'::jsonb end,
         case when c.coste is not null then round(c.venta / c.coste, 6) end, false, true, c.origen_inputs->>'producto_tl'
  from candidatas c
  returning referencia, nombre
)
insert into nuevos_creados select referencia, pg_temp.clave_nombre(nombre) from metidos;
-- cada línea apunta a su referencia (la nueva o la que ya había)
update presupuesto_lineas l set origen_inputs = coalesce(l.origen_inputs, '{}'::jsonb) || jsonb_build_object('producto_catalogo', x.referencia)
from (
  select b.id, coalesce(n.referencia, (select p.referencia from productos p where p.activo and pg_temp.clave_nombre(p.nombre) = b.k order by (p.atributos->>'propio') is null limit 1)) referencia
  from lineas_base b left join nuevos_creados n on n.k = b.k
) x where x.id = l.id and x.referencia is not null;
select (select count(*) from nuevos_creados) creados,
       (select count(*) from presupuesto_lineas where origen_inputs->>'producto_catalogo' is not null) lineas_apuntadas,
       (select count(*) from productos where activo and atributos->>'propio' = 'true') propios_activos;
