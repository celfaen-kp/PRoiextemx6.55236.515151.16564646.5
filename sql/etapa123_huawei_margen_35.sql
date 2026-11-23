-- =============================================================================
-- Etapa 123 · Huawei al 35 % de margen en el catálogo (Enzo, 23-11-2026)
--
-- Enzo: «todo lo que cargaste de Huawei lo quiero en un 35 % de beneficios».
--
-- Los 81 productos de la etapa 122 (referencia FV-HUAWEI-…) pasan de recargo
-- 1,30 (el de por defecto de fotovoltaica, un 23,1 % de margen) a 1,538462,
-- que es 1/(1 − 0,35): en la app el margen es sobre la venta (1 − coste/venta),
-- igual que se hizo con Enphase al 30 % (recargo 1,428571).
--
-- Cada cambio queda apuntado en precios_cambios, así que se puede deshacer uno
-- a uno desde Ajustes → Precios.
--
-- NO CAMBIA el presupuesto llave en mano del motor fotovoltaico: ahí el
-- inversor y el medidor entran como coste y todo va al margen del modelo.
-- Se puede ejecutar más de una vez: solo toca los que no estén ya al 35 %.
-- =============================================================================
with cambiados as (
  update public.productos p
     set recargo = 1.538462
    from (select id, recargo as antes from public.productos
           where referencia like 'FV-HUAWEI-%' and recargo is distinct from 1.538462) a
   where p.id = a.id
  returning p.id, p.referencia, p.nombre, a.antes
)
insert into public.precios_cambios (nombre, origen, clave, descripcion, antes, despues, desde)
select 'Enzo (lo aplicó Claude)', 'producto', referencia, nombre || ' · margen al 35 %',
       jsonb_build_object('id', id, 'recargo', antes),
       jsonb_build_object('id', id, 'recargo', 1.538462), 'configuracion'
  from cambiados;

select familia, recargo, count(*) as productos
  from public.productos where referencia like 'FV-HUAWEI-%'
 group by 1, 2 order by 1;
