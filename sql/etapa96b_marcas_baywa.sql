-- Etapa 96b (2-11-2026, Enzo): Tesla, BYD, Weco y Deye se compran a BayWa.
insert into public.proveedor_marcas (marca, proveedor_codigo) values ('Tesla', 'baywa'), ('BYD', 'baywa'), ('Weco', 'baywa'), ('Deye', 'baywa')
on conflict (marca) do update set proveedor_codigo = excluded.proveedor_codigo;
update public.proveedor_articulos set proveedor_codigo = 'baywa' where proveedor_codigo = 'rebacas';
select m.marca, m.proveedor_codigo from public.proveedor_marcas m order by m.proveedor_codigo, m.marca;
