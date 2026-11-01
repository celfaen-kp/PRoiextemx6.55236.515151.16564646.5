-- =============================================================================
-- Sysefen · Etapa 94 · Una obra abierta por cliente (Enzo, 1-11-2026)
--
--   Al aceptar un segundo presupuesto de Heim se creó una obra nueva (OB-026)
--   en vez de añadirlo a la que ya tenía (OB-020 «Cala Nova»): la obra antigua
--   tenía el contacto de Teamleader (tl_id) pero no cliente_id, y la app solo
--   buscaba por cliente_id. La app y la función presupuesto-cliente ya buscan
--   también por tl_id (V30.6). Aquí se arreglan los datos:
--     1 · Las obras con contacto de Teamleader y sin cliente reciben su cliente_id.
--     2 · El presupuesto de OB-026 pasa a OB-020, que se queda con el correo del
--         cliente, y OB-026 (sin partes, fichajes ni horas) se borra. Sus fases
--         se van en cascada. Lo presupuestado de OB-020 pasa a sumar ese importe.
-- =============================================================================

-- 1 · cliente_id a partir del contacto de Teamleader.
update public.obras o
   set cliente_id = c.id
  from public.clientes_cache c
 where o.cliente_id is null and o.tl_id is not null and c.tl_id = o.tl_id;

-- 2 · Heim: una sola obra.
update public.presupuestos
   set obra_id = '6e0f177c-87f9-4f22-b8cb-a3bfd9016b21'
 where obra_id = '1e8a5505-5410-4be8-94fd-06ed2bf8be72';

update public.obras
   set email_cliente = coalesce(email_cliente, 'heim.reformas@gmail.com')
 where id = '6e0f177c-87f9-4f22-b8cb-a3bfd9016b21';

delete from public.obra_empleados where obra_id = '1e8a5505-5410-4be8-94fd-06ed2bf8be72';
delete from public.obras
 where id = '1e8a5505-5410-4be8-94fd-06ed2bf8be72'
   and not exists (select 1 from public.partes where obra_id = '1e8a5505-5410-4be8-94fd-06ed2bf8be72')
   and not exists (select 1 from public.fichajes where obra_id = '1e8a5505-5410-4be8-94fd-06ed2bf8be72')
   and not exists (select 1 from public.imputaciones where obra_id = '1e8a5505-5410-4be8-94fd-06ed2bf8be72');

insert into public.cliente_bitacora (cliente_id, tipo, texto, por)
values ('c2cf66ca-bbf4-4af2-afb6-45a3353ab580', 'sistema',
        'Obra duplicada OB-026 eliminada: su presupuesto de electricidad pasa a la obra OB-020 (Cala Nova).', null);

-- Comprobación: la obra de Heim, sus presupuestos y lo presupuestado.
select json_build_object(
  'obras_heim', (select json_agg(json_build_object('numero', numero, 'nombre', nombre, 'estado', estado, 'cliente_id', cliente_id, 'cats', categorias)) from public.obras where tl_id = '28fd8932-2cde-0965-827a-931273b44184'),
  'presus_ob020', (select json_agg(json_build_object('cat', categoria, 'resp', respuesta_cliente, 'venta', total_venta)) from public.presupuestos where obra_id = '6e0f177c-87f9-4f22-b8cb-a3bfd9016b21'),
  'presupuestado_ob020', (select venta_presupuestada from public.v_obra_economia where obra_id = '6e0f177c-87f9-4f22-b8cb-a3bfd9016b21'),
  'abiertas_sin_cliente_con_tl', (select count(*) from public.obras where cliente_id is null and tl_id is not null and estado in ('planificada', 'en_curso'))
) as resultado;
