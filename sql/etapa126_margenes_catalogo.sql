-- Sysefen · Etapa 126 · Márgenes del catálogo por proveedor, marca y tipo (Enzo, 24 nov 2026)
--   «Dame la posibilidad de modificar los márgenes por proveedor en nuestro banco de precios…
--   ver en cuánto beneficio está cada proveedor, filtrar por marca o por tipo y modificar el
--   beneficio de solo lo que filtre.» Ajustes → Precios → Márgenes: la función `presupuestar`
--   (acción precios_margen) cambia el recargo propio de los productos filtrados y deja UN apunte
--   en el historial, con lo que tenía cada producto en `detalle` para deshacerlo de una vez.
--   Idempotente.

-- 1 · El apunte de un cambio en bloque: [[id del producto, recargo que tenía o null], …].
--     Va aparte de `antes` para que la lista del historial no cargue con ello.
alter table public.precios_cambios add column if not exists detalle jsonb;
comment on column public.precios_cambios.detalle is 'Cambios en bloque (origen = margen): [[id del producto, recargo que tenía o null], …], para deshacer.';
comment on column public.precios_cambios.origen is 'modelo_fv | producto | concepto | margen (un margen puesto a un grupo de productos)';

-- 2 · Huawei se compra en BayWa (su catálogo se cargó de la tienda de BayWa, etapa122):
--     así sale con ese proveedor en los márgenes y en la lista de compra.
insert into public.proveedor_marcas (marca, proveedor_codigo)
select 'Huawei', 'baywa'
where exists (select 1 from public.proveedores where codigo = 'baywa')
  and not exists (select 1 from public.proveedor_marcas where lower(marca) = 'huawei');

select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'precios_cambios' and column_name = 'detalle') as columna_detalle,
       (select proveedor_codigo from public.proveedor_marcas where lower(marca) = 'huawei') as huawei_en;
