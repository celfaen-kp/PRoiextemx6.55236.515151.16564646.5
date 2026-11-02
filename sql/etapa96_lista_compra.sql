-- =============================================================================
-- Etapa 96 · Lista de compra de la obra (2-11-2026)
--
-- Cuando el cliente acepta un presupuesto (respuesta_cliente = 'aceptado', por la
-- firma en la web, a mano en la app o desde Teamleader), la Edge Function
-- `lista-compra` genera un PDF interno con TODO el material a pedir de la obra
-- (todos sus presupuestos aceptados, sumados), agrupado por proveedor, lo guarda
-- en Storage (obra-docs/lista-compra/…) y lo manda por correo a los destinatarios
-- de `ajustes.lista_compra_correos` (Ramón y Fabrizio). Al cliente y a los
-- operarios no les llega nada.
--
-- Aquí va lo que necesita en la base de datos:
--   1. Proveedores reales a los que se compra (los del motor FV v2 de Ramón) y
--      sus datos de contacto (columnas nuevas, se rellenan desde Ajustes o aquí).
--   2. `proveedor_articulos`: a quién se pide cada artículo del motor FV (copia
--      de PROVEEDOR_FV de supabase/functions/presupuestar/fv.js; sirve cuando el
--      motor no dejó `pedido`, p. ej. inversor A MEDIDA).
--      `proveedor_marcas`: marca → proveedor para las líneas del catálogo
--      (FRONIUS Batería… → BayWa) y descripciones libres.
--   3. `listas_compra`: una fila por versión generada (obra, presupuestos que
--      incluye, PDF, a quién se mandó).
--   4. Disparador en `presupuestos`: al pasar a aceptado avisa a la función por
--      pg_net (como el cron, con la clave x-clave). Si después cambia la obra del
--      presupuesto aceptado, la lista se regenera sin correo.
-- =============================================================================

-- 1. Proveedores -------------------------------------------------------------------
alter table public.proveedores
  add column if not exists contacto text,
  add column if not exists email text,
  add column if not exists telefono text,
  add column if not exists web text,
  add column if not exists forma_pedido text,     -- «por web», «WhatsApp al comercial», «se recoge en tienda»…
  add column if not exists notas text,
  add column if not exists compra boolean not null default true;   -- false: no es a quien se pide (p. ej. «Sysefen (partidas propias)»)

insert into public.proveedores (codigo, nombre) values
  ('electromat', 'Electromat'),
  ('baywa', 'BayWa r.e.'),
  ('rebacas', 'Rebacas'),
  ('massanella', 'Massanella'),
  ('wurth', 'Würth'),
  ('saltoki', 'Saltoki')
on conflict (codigo) do nothing;
update public.proveedores set compra = false where codigo = 'sysefen';

-- Quién puede ver y editar proveedores desde la app (antes solo el motor).
drop policy if exists proveedores_ver on public.proveedores;
create policy proveedores_ver on public.proveedores for select to authenticated using (true);
drop policy if exists proveedores_editar on public.proveedores;
create policy proveedores_editar on public.proveedores for update to authenticated using (public.es_admin() or public.es_presupuestos()) with check (public.es_admin() or public.es_presupuestos());

-- 2. Artículo → proveedor y marca → proveedor -------------------------------------------
create table if not exists public.proveedor_articulos (
  articulo text primary key,                       -- nombre exacto del artículo en el desglose del motor FV
  proveedor_codigo text not null references public.proveedores(codigo) on update cascade on delete cascade
);
create table if not exists public.proveedor_marcas (
  marca text primary key,                          -- se busca como palabra en la descripción (sin distinguir mayúsculas)
  proveedor_codigo text not null references public.proveedores(codigo) on update cascade on delete cascade
);
alter table public.proveedor_articulos enable row level security;
alter table public.proveedor_marcas enable row level security;
drop policy if exists proveedor_articulos_ver on public.proveedor_articulos;
create policy proveedor_articulos_ver on public.proveedor_articulos for select to authenticated using (true);
drop policy if exists proveedor_articulos_editar on public.proveedor_articulos;
create policy proveedor_articulos_editar on public.proveedor_articulos for all to authenticated using (public.es_admin() or public.es_presupuestos()) with check (public.es_admin() or public.es_presupuestos());
drop policy if exists proveedor_marcas_ver on public.proveedor_marcas;
create policy proveedor_marcas_ver on public.proveedor_marcas for select to authenticated using (true);
drop policy if exists proveedor_marcas_editar on public.proveedor_marcas;
create policy proveedor_marcas_editar on public.proveedor_marcas for all to authenticated using (public.es_admin() or public.es_presupuestos()) with check (public.es_admin() or public.es_presupuestos());

-- Los 42 artículos del motor FV v2 (PROVEEDOR_FV en fv.js, 2-11-2026).
insert into public.proveedor_articulos (articulo, proveedor_codigo) values
  ('Panel Trina Vertex S+ 510 Wp', 'electromat'),
  ('Microinversor Enphase IQ8P', 'baywa'),
  ('Enphase Q Cable 2,5 mm 1,7 m', 'baywa'),
  ('Enphase tapón final', 'baywa'),
  ('Enphase conectores de campo (2 machos + 2 hembras)', 'baywa'),
  ('Medidor Fronius Smart Meter', 'baywa'),
  ('Enphase IQ Gateway Metered (Envoy)', 'baywa'),
  ('Enphase CT', 'baywa'),
  ('Enphase Q-Relay', 'baywa'),
  ('Medidor para Deye (antivertido)', 'rebacas'),
  ('Cable de datos UTP Cat5e + 2 RJ45', 'massanella'),
  ('Conectores RJ45', 'massanella'),
  ('Perfil G1 4,8 m', 'electromat'),
  ('Unión de perfiles UG1', 'electromat'),
  ('Presor final', 'electromat'),
  ('Presor intermedio', 'electromat'),
  ('Pincho VR para teja 250 mm', 'electromat'),
  ('Taco químico Würth 300 ml', 'wurth'),
  ('Malla metálica Würth', 'wurth'),
  ('Conectores MC4 (macho + hembra)', 'wurth'),
  ('Conector de tierra Sunfer', 'massanella'),
  ('Tejas de reposición', 'massanella'),
  ('Tubo corrugado M25 en cubierta', 'massanella'),
  ('Racores M25', 'massanella'),
  ('Cable solar H1Z2Z2-K 6 mm² (rojo + negro)', 'electromat'),
  ('Tubo rígido M25 (tira 3 m) CC', 'electromat'),
  ('Grapas', 'electromat'),
  ('Cable AC H07Z1-K 1×6', 'electromat'),
  ('Tubo rígido M25 (tira 3 m) AC', 'electromat'),
  ('Magnetotérmico de conexión en el cuadro general', 'electromat'),
  ('Caja de superficie Famatel 2 filas 22 módulos (Enphase)', 'saltoki'),
  ('Magnetotérmicos Enphase', 'electromat'),
  ('Diferencial tipo F (Enphase)', 'electromat'),
  ('Cable de tierra 6 mm²', 'electromat'),
  ('Terminales de cobre', 'electromat'),
  ('Lastre Sun Ballast 10° LONG 70 kg', 'electromat'),
  ('Kit presor central Sun Ballast (bolsa 10)', 'electromat'),
  ('Kit presor final Sun Ballast (bolsa 10)', 'electromat'),
  ('Lámina protectora de goma Sun Ballast 15×25 cm (2 piezas)', 'electromat'),
  ('Cuadro CC Solver 1 string', 'saltoki'),
  ('Cuadro CC Solver 2 strings', 'saltoki'),
  ('Cuadro AC Solver', 'saltoki')
on conflict (articulo) do nothing;

-- Marcas: lo que dice el motor (Fronius y Enphase a BayWa, Deye a Rebacas) y las
-- marcas de la estructura. Tesla y BYD quedan sin proveedor hasta que se diga.
insert into public.proveedor_marcas (marca, proveedor_codigo) values
  ('Fronius', 'baywa'), ('Enphase', 'baywa'), ('Deye', 'rebacas'),
  ('Trina', 'electromat'), ('Sun Ballast', 'electromat'), ('Sunfer', 'massanella'),
  ('Würth', 'wurth'), ('Wurth', 'wurth'), ('Solver', 'saltoki'), ('Sölver', 'saltoki'), ('Famatel', 'saltoki')
on conflict (marca) do nothing;

-- Destinatarios del correo (editable desde Ajustes → Lista de compra, solo Administración).
insert into public.ajustes (clave, valor) values ('lista_compra_correos', 'ramon@sysefen.com, enfacel@sysefen.com')
on conflict (clave) do nothing;

-- 3. Versiones generadas ---------------------------------------------------------------
create table if not exists public.listas_compra (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references public.obras(id) on delete cascade,
  cliente_id uuid,                                 -- cuando los presupuestos aceptados no tienen obra todavía
  version int not null default 1,
  generada_en timestamptz not null default now(),
  origen text not null default 'manual',           -- aceptacion · cambio · manual · simulacion
  presupuesto_id uuid,                             -- el que provocó esta versión (aceptación) o el simulado
  presupuestos uuid[] not null default '{}',       -- los incluidos
  huella text,                                     -- ids + updated_at de los incluidos: si no cambia, se reutiliza el PDF
  datos jsonb not null default '{}'::jsonb,        -- la lista calculada (proveedores, pendiente, no se compra, totales)
  pdf_ruta text,                                   -- en el bucket obra-docs
  enviada_a text[] not null default '{}',
  enviada_en timestamptz,
  error text
);
create index if not exists listas_compra_obra_idx on public.listas_compra (obra_id, version desc);
create index if not exists listas_compra_cliente_idx on public.listas_compra (cliente_id, version desc);
alter table public.listas_compra enable row level security;
drop policy if exists listas_compra_ver on public.listas_compra;
create policy listas_compra_ver on public.listas_compra for select to authenticated using (public.es_comercial());
-- Escribe solo la función (llave del servidor).

-- 4. Disparador: aceptación → función -----------------------------------------------------
create or replace function public.avisar_lista_compra()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  clave text;
  accion text;
begin
  if new.respuesta_cliente = 'aceptado' and coalesce(old.respuesta_cliente, 'pendiente') <> 'aceptado' then
    accion := 'aceptacion';
  elsif new.respuesta_cliente = 'aceptado' and new.obra_id is distinct from old.obra_id then
    accion := 'cambio';
  else
    return new;
  end if;
  begin
    select substring(command from $re$x-clave', '([^']+)'$re$) into clave from cron.job where jobname = 'resumen-citas-manana';
    if clave is null then raise notice 'lista-compra: no hay clave en el cron'; return new; end if;
    perform net.http_post(
      url := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/lista-compra',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', clave),
      body := jsonb_build_object('accion', accion, 'presupuesto_id', new.id),
      timeout_milliseconds := 120000);
  exception when others then
    -- Avisar a la función NUNCA puede impedir guardar la aceptación.
    raise notice 'lista-compra: no se pudo avisar: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists presupuestos_lista_compra on public.presupuestos;
create trigger presupuestos_lista_compra
  after update of respuesta_cliente, obra_id on public.presupuestos
  for each row execute function public.avisar_lista_compra();

select p.codigo, p.nombre, p.compra, (select count(*) from public.proveedor_articulos a where a.proveedor_codigo = p.codigo) articulos,
       (select count(*) from public.proveedor_marcas m where m.proveedor_codigo = p.codigo) marcas
from public.proveedores p order by p.compra desc, p.nombre;
