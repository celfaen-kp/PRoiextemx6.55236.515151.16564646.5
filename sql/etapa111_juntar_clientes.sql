-- =============================================================================
-- Sysefen · etapa 111 · Juntar dos fichas del mismo cliente (17-11-2026)
--
-- Enzo: «el cliente de arriba está duplicado, pero ahí creé la obra y todo;
-- cuando facturaron hicieron otra con todos los datos. Quiero transferir
-- presupuesto, obra y todo de uno al que ya tiene la factura.»
--
-- QUÉ HACE
--   · fusionar_clientes(origen, destino): todo lo que cuelga de «origen»
--     (citas, visitas, presupuestos, obras, facturas, legalizaciones, notas de
--     la bitácora, documentos y listas de compra) pasa a «destino». Los datos
--     que a «destino» le faltan (teléfono, correo, NIF, dirección, nota…) se
--     rellenan con los de «origen»; los que ya tiene no se tocan. La ficha
--     «origen» se quita.
--   · clientes_fusionados: una fila por ficha quitada, con la ficha entera y
--     los ids de lo que se movió, para poder deshacerlo a mano. Guarda además
--     el id que esa ficha tenía en Teamleader: las funciones que casan lo que
--     viene del CRM con un cliente de la app (facturas, ofertas, altas) miran
--     también aquí, para que no vuelva a nacer el duplicado.
--
-- En Teamleader NO se toca nada: allí siguen siendo dos (aquí, una empresa y
-- un contacto). Lo que se hizo a nombre de cada uno se queda donde estaba.
--
-- QUIÉN PUEDE: presupuestos y Administración (los que ven las facturas).
-- Se puede ejecutar varias veces.
-- =============================================================================

create table if not exists public.clientes_fusionados (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes_cache(id) on delete cascade,  -- la ficha que se queda
  origen_id     uuid not null,          -- el id que tenía la ficha quitada
  nombre        text,
  tl_id         text,                   -- su id en Teamleader, si lo tenía y la que se queda ya tenía otro
  tl_tipo       text,
  datos         jsonb not null,         -- la ficha quitada, entera
  movido        jsonb not null default '{}'::jsonb,   -- { tabla: [ids que pasaron] }
  fusionado_at  timestamptz not null default now(),
  fusionado_por uuid
);
create index if not exists clientes_fusionados_tl on public.clientes_fusionados (tl_id) where tl_id is not null;
create index if not exists clientes_fusionados_cliente on public.clientes_fusionados (cliente_id);
comment on table public.clientes_fusionados is 'Fichas de cliente duplicadas que se juntaron con otra (fusionar_clientes). Guarda la ficha quitada y su id de Teamleader.';

alter table public.clientes_fusionados enable row level security;
drop policy if exists clientes_fusionados_ver on public.clientes_fusionados;
create policy clientes_fusionados_ver on public.clientes_fusionados for select to authenticated using (public.es_comercial());

create or replace function public.fusionar_clientes(p_origen uuid, p_destino uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.clientes_cache;
  d public.clientes_cache;
  t text;
  n jsonb;
  movido jsonb := '{}'::jsonb;
  hereda_tl boolean;
  partes text[] := '{}';
  cuantos int;
  vacio constant text := '';
begin
  -- Con sesión de la app, solo presupuestos y Administración. Sin sesión (el
  -- editor de SQL o la clave del servidor) se deja pasar.
  if auth.uid() is not null and not public.es_motor() then
    raise exception 'Solo Presupuestos o Administración pueden juntar clientes.';
  end if;
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'Hay que elegir dos clientes distintos.';
  end if;
  -- Siempre en el mismo orden, para que dos a la vez no se bloqueen entre sí.
  perform 1 from public.clientes_cache where id in (p_origen, p_destino) order by id for update;
  select * into o from public.clientes_cache where id = p_origen;
  select * into d from public.clientes_cache where id = p_destino;
  if o.id is null or d.id is null then
    raise exception 'Uno de los dos clientes ya no existe. Recarga y vuelve a probar.';
  end if;

  -- 1) Todo lo que cuelga de la ficha que se quita pasa a la que se queda.
  foreach t in array array['citas', 'visitas', 'presupuestos', 'obras', 'facturas', 'legalizaciones', 'cliente_bitacora', 'cliente_documentos', 'listas_compra'] loop
    execute format(
      'with m as (update public.%I set cliente_id = $1 where cliente_id = $2 returning id) select coalesce(jsonb_agg(id), ''[]''::jsonb) from m', t)
      into n using p_destino, p_origen;
    movido := movido || jsonb_build_object(t, n);
  end loop;

  -- 2) Se guarda la ficha quitada (y su id de Teamleader si la que se queda ya tiene el suyo).
  hereda_tl := d.tl_id is null and o.tl_id is not null;
  insert into public.clientes_fusionados (cliente_id, origen_id, nombre, tl_id, tl_tipo, datos, movido, fusionado_por)
  values (p_destino, p_origen, o.nombre,
          case when hereda_tl then null else o.tl_id end,
          case when hereda_tl then null else o.tl_tipo end,
          to_jsonb(o), movido, public.empleado_id_actual());
  -- Lo que antes se juntó con la ficha quitada pasa a apuntar a la que se queda.
  update public.clientes_fusionados set cliente_id = p_destino where cliente_id = p_origen;

  -- 3) Se quita la ficha duplicada (antes de copiar su id de Teamleader: es único).
  delete from public.clientes_cache where id = p_origen;

  -- 4) A la que se queda se le rellena lo que le falte.
  update public.clientes_cache set
    -- «particular» es lo que se pone por defecto: si la otra decía otra cosa, vale la otra.
    tipo = case when coalesce(d.tipo, 'particular') = 'particular' and coalesce(o.tipo, 'particular') <> 'particular' then o.tipo else d.tipo end,
    telefono = coalesce(nullif(btrim(d.telefono), vacio), o.telefono),
    email = coalesce(nullif(btrim(d.email), vacio), o.email),
    nif = coalesce(nullif(btrim(d.nif), vacio), o.nif),
    direccion = coalesce(nullif(btrim(d.direccion), vacio), o.direccion),
    poblacion = coalesce(nullif(btrim(d.poblacion), vacio), o.poblacion),
    direccion_fiscal = coalesce(nullif(btrim(d.direccion_fiscal), vacio), o.direccion_fiscal),
    nota = case
      when nullif(btrim(d.nota), vacio) is null then o.nota
      when nullif(btrim(o.nota), vacio) is null or btrim(o.nota) = btrim(d.nota) then d.nota
      else d.nota || E'\n' || o.nota end,
    motivo_web = coalesce(nullif(btrim(d.motivo_web), vacio), o.motivo_web),
    -- La fecha de ingreso y el origen, los de la ficha más antigua.
    lead_at = least(d.lead_at, o.lead_at),
    created_at = least(d.created_at, o.created_at),
    origen = case when o.created_at < d.created_at and o.origen is not null then o.origen else d.origen end,
    contacto_estado = coalesce(d.contacto_estado, o.contacto_estado),
    contacto_at = case when d.contacto_estado is null then o.contacto_at else d.contacto_at end,
    contacto_por = case when d.contacto_estado is null then o.contacto_por else d.contacto_por end,
    contacto_intentos = case when d.contacto_estado is null then o.contacto_intentos else d.contacto_intentos end,
    sin_cita_motivo = coalesce(d.sin_cita_motivo, o.sin_cita_motivo),
    sin_cita_at = case when d.sin_cita_motivo is null then o.sin_cita_at else d.sin_cita_at end,
    sin_cita_por = case when d.sin_cita_motivo is null then o.sin_cita_por else d.sin_cita_por end,
    proxima_accion = coalesce(d.proxima_accion, o.proxima_accion),
    proxima_accion_at = case when d.proxima_accion is null then o.proxima_accion_at else d.proxima_accion_at end,
    proxima_accion_por = case when d.proxima_accion is null then o.proxima_accion_por else d.proxima_accion_por end,
    aplazado_hasta = coalesce(d.aplazado_hasta, o.aplazado_hasta),
    aplazado_motivo = case when d.aplazado_hasta is null then o.aplazado_motivo else d.aplazado_motivo end,
    colaborador_id = coalesce(d.colaborador_id, o.colaborador_id),
    drive_carpeta_id = coalesce(d.drive_carpeta_id, o.drive_carpeta_id),
    drive_visitas_id = coalesce(d.drive_visitas_id, o.drive_visitas_id),
    tablero_col = coalesce(d.tablero_col, o.tablero_col),
    tablero_motivo = case when d.tablero_col is null then o.tablero_motivo else d.tablero_motivo end,
    tl_id = case when hereda_tl then o.tl_id else d.tl_id end,
    tl_tipo = case when hereda_tl then o.tl_tipo else d.tl_tipo end,
    tl_at = case when hereda_tl then o.tl_at else d.tl_at end,
    pendiente_alta = case when hereda_tl then false else d.pendiente_alta end,
    actualizado_at = now(),
    drive_at = null          -- que la hoja de clientes de Drive recoja los datos nuevos
  where id = p_destino;

  -- 5) Y queda apuntado en su historial.
  foreach t in array array['citas', 'visitas', 'presupuestos', 'obras', 'facturas', 'legalizaciones', 'cliente_documentos'] loop
    cuantos := jsonb_array_length(movido -> t);
    if cuantos > 0 then
      partes := partes || (cuantos || ' ' || case t
        when 'citas' then case when cuantos = 1 then 'cita' else 'citas' end
        when 'visitas' then case when cuantos = 1 then 'visita' else 'visitas' end
        when 'presupuestos' then case when cuantos = 1 then 'presupuesto' else 'presupuestos' end
        when 'obras' then case when cuantos = 1 then 'obra' else 'obras' end
        when 'facturas' then case when cuantos = 1 then 'factura' else 'facturas' end
        when 'legalizaciones' then case when cuantos = 1 then 'legalización' else 'legalizaciones' end
        else case when cuantos = 1 then 'documento' else 'documentos' end end);
    end if;
  end loop;
  insert into public.cliente_bitacora (cliente_id, tipo, texto, por)
  values (p_destino, 'sistema',
          'Juntado con la ficha duplicada «' || coalesce(o.nombre, '') || '»'
            || case when array_length(partes, 1) is null then ' (no tenía nada colgado)' else ': pasan aquí ' || array_to_string(partes, ', ') end,
          public.empleado_id_actual());

  return jsonb_build_object('ok', true, 'cliente_id', p_destino, 'quitado', p_origen, 'movido', movido);
end;
$$;

revoke all on function public.fusionar_clientes(uuid, uuid) from public, anon;
grant execute on function public.fusionar_clientes(uuid, uuid) to authenticated, service_role;
