-- =============================================================================
-- Sysefen · etapa 115 · lectura para los agentes de la oficina virtual
--                       (Ramón y Enzo, 19-11-2026)
--
-- Ramón: «Funciones de LECTURA, con la misma idea que crear-lead (clave propia,
-- JSON, solo lectura)… para que los agentes de seguimiento, obras y costes
-- dejen de depender de la exportación de Teamleader.» Pedía siete; las seis de
-- lectura van aquí como una sola función con un parámetro `que` (él mismo lo
-- daba por bueno), y la de escritura, aparte.
--
-- agentes_leer(que, p):
--   'leads-pendientes'         los que entraron y siguen sin cita ni visita
--   'visitas-sin-presupuesto'  visitas hechas sin presupuesto enviado
--   'presupuestos'             con filtro de estado y de respuesta
--   'obras-estado'             obras abiertas con fases, plan y material pedido
--   'partes'                   partes de un rango y días planificados sin parte
--   'costes-obra'              coste real frente a presupuesto
--
-- agentes_apuntar_seguimiento(p, prueba): la única que escribe. Una nota en el
--   seguimiento del cliente (tipo «agente») y, si se dice, su próxima acción.
--
-- LO QUE NO SALE NUNCA: teléfonos, correos, direcciones, NIF. De las personas
-- sale el nombre y la inicial del apellido (de empresas y comunidades, el
-- nombre entero). Del texto que escribió el cliente se tachan los correos y los
-- teléfonos. De la mano de obra sale el total en euros, no lo que cuesta la
-- hora de cada uno.
--
-- QUIÉN LAS LLAMA: solo las Edge Functions `agentes-leer` y
-- `apuntar-seguimiento` (service_role). Nadie con sesión puede ejecutarlas.
--
-- Requiere las etapas 59 y 66 (costes), 63 (fases), 71 (seguimiento) y 114.
-- =============================================================================

begin;

-- «Marta Riera Pons» → «Marta R.». Empresas y comunidades, el nombre entero.
create or replace function public.nombre_corto(p_nombre text, p_tipo text)
returns text language sql immutable as $$
  select case
    when coalesce(p_tipo, 'particular') <> 'particular' then btrim(coalesce(p_nombre, ''))
    else (select case when array_length(a, 1) >= 2 then a[1] || ' ' || upper(left(a[2], 1)) || '.' else coalesce(a[1], '') end
            from (select regexp_split_to_array(btrim(coalesce(p_nombre, '')), '\s+') as a) x)
  end
$$;

-- Tacha los correos y los teléfonos (nueve cifras o más) de un texto libre.
create or replace function public.sin_contactos(t text)
returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(coalesce(t, ''), '[^\s@:;,<>()]+@[^\s@:;,<>()]+\.[a-zA-Z]{2,}', '[correo]', 'g'),
           '\+?(?:\d[ .\-]?){8,}\d', '[teléfono]', 'g')
$$;

-- Una lista que puede venir como ["a","b"] o como "a,b".
create or replace function public.lista_de(v jsonb)
returns text[] language sql immutable as $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then null
    when jsonb_typeof(v) = 'array' then (select array_agg(lower(btrim(x))) from jsonb_array_elements_text(v) x where btrim(x) <> '')
    else (select array_agg(lower(btrim(x))) from unnest(string_to_array(v #>> '{}', ',')) x where btrim(x) <> '')
  end
$$;

-- El tipo «agente» en el seguimiento del cliente.
alter table public.cliente_bitacora drop constraint if exists cliente_bitacora_tipo_check;
alter table public.cliente_bitacora add constraint cliente_bitacora_tipo_check
  check (tipo in ('llamada', 'whatsapp', 'email', 'nota', 'cita', 'visita', 'presupuesto', 'aplazado', 'accion', 'sistema', 'agente'));

create or replace function public.agentes_leer(p_que text, p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_hoy     date := (now() at time zone 'Europe/Madrid')::date;
  v_lim     int  := least(greatest(coalesce(nullif(p->>'limite', '')::int, 200), 1), 500);
  v_desde   date := nullif(p->>'desde', '')::date;
  v_hasta   date := nullif(p->>'hasta', '')::date;
  v_dias    int  := greatest(coalesce(nullif(p->>'dias_min', '')::int, 0), 0);
  v_estados text[] := public.lista_de(p->'estado');
  v_resp    text[] := public.lista_de(p->'respuesta');
  v_obra    uuid := nullif(p->>'obra_id', '')::uuid;
  r         jsonb;
  r2        jsonb;
  r3        jsonb;
  eco       record;
begin
  -- ---------------------------------------------------------------------------
  if p_que = 'leads-pendientes' then
    -- La misma cuenta que «Entradas nuevas» en Clientes: entró (lead_at), no se
    -- ha resuelto sin cita y no tiene ni cita ni visita.
    select coalesce(jsonb_agg(to_jsonb(x) order by x.lead_at desc), '[]'::jsonb) into r from (
      select c.id as cliente_id, public.nombre_corto(c.nombre, c.tipo) as nombre, c.tipo, c.poblacion, c.origen,
             nullif(public.sin_contactos(c.motivo_web), '') as motivo,
             c.lead_at, (v_hoy - (c.lead_at at time zone 'Europe/Madrid')::date) as dias,
             c.lead_visto, c.contacto_estado, c.contacto_at, c.contacto_intentos,
             c.proxima_accion, c.proxima_accion_at, c.aplazado_hasta, c.sin_cita_motivo, c.tablero_col
        from public.clientes_cache c
       where c.lead_at is not null and c.sin_cita_motivo is null
         and not exists (select 1 from public.citas ci where ci.cliente_id = c.id)
         and not exists (select 1 from public.visitas v where v.cliente_id = c.id)
         and (v_desde is null or (c.lead_at at time zone 'Europe/Madrid')::date >= v_desde)
       order by c.lead_at desc limit v_lim) x;
    return jsonb_build_object('ok', true, 'que', p_que, 'hoy', v_hoy, 'n', jsonb_array_length(r), 'leads', r);

  -- ---------------------------------------------------------------------------
  elsif p_que = 'visitas-sin-presupuesto' then
    -- Visita completada que no tiene ningún presupuesto ENVIADO al cliente. Los
    -- que tenga sin enviar (generado, revisar, aprobado) van dentro, para saber
    -- en qué punto se quedó. Ojo: un presupuesto se puede hacer suelto, sin
    -- enlazarlo a la visita; por eso se cuentan aparte los del mismo cliente
    -- hechos desde el día de la visita.
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha_visita), '[]'::jsonb) into r from (
      select v.id as visita_id, v.codigo, v.cliente_id, public.nombre_corto(c.nombre, c.tipo) as cliente,
             v.fecha_visita, (v_hoy - v.fecha_visita) as dias,
             e.id as tecnico_id, e.nombre as tecnico, coalesce(v.poblacion, c.poblacion) as poblacion,
             v.interesa_subvencion, v.plazo_deseado,
             (select coalesce(jsonb_agg(jsonb_build_object('presupuesto_id', pr.id, 'estado', pr.estado,
                       'categoria', pr.categoria, 'updated_at', pr.updated_at) order by pr.updated_at desc), '[]'::jsonb)
                from public.presupuestos pr where pr.visita_id = v.id) as presupuestos,
             (select count(*) from public.presupuestos p2
               where p2.cliente_id = v.cliente_id and p2.visita_id is distinct from v.id
                 and (p2.created_at at time zone 'Europe/Madrid')::date >= v.fecha_visita) as otros_presupuestos_del_cliente
        from public.visitas v
        left join public.clientes_cache c on c.id = v.cliente_id
        left join public.empleados e on e.user_id = v.tecnico_id
       where v.estado = 'completada'
         and not exists (select 1 from public.presupuestos pr where pr.visita_id = v.id and pr.estado = 'enviado')
         and (v_desde is null or v.fecha_visita >= v_desde)
         and (v_hoy - v.fecha_visita) >= v_dias
       order by v.fecha_visita limit v_lim) x;
    return jsonb_build_object('ok', true, 'que', p_que, 'hoy', v_hoy, 'n', jsonb_array_length(r), 'visitas', r);

  -- ---------------------------------------------------------------------------
  elsif p_que = 'presupuestos' then
    -- estado: generado → aprobado (revisado) → enviado (al cliente; lleva enviado_cliente_at).
    -- respuesta: pendiente, aceptado, rechazado, caducado.
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into r from (
      select pr.id as presupuesto_id, coalesce(pr.cliente_id, v.cliente_id) as cliente_id,
             public.nombre_corto(c.nombre, c.tipo) as cliente, c.poblacion,
             pr.titulo, pr.categoria, pr.estado, pr.total_venta,
             pr.enviado_cliente_at, pr.enviado_correo_at,
             case when pr.enviado_cliente_at is not null then v_hoy - (pr.enviado_cliente_at at time zone 'Europe/Madrid')::date end as dias_desde_envio,
             pr.valido_hasta, pr.aviso_vencimiento_at, pr.respuesta_cliente, pr.respondido_at, pr.motivo_rechazo,
             pr.created_at, pr.updated_at, pr.tl_numero, pr.visita_id, pr.obra_id,
             c.proxima_accion, c.proxima_accion_at
        from public.presupuestos pr
        left join public.visitas v on v.id = pr.visita_id
        left join public.clientes_cache c on c.id = coalesce(pr.cliente_id, v.cliente_id)
       where (v_estados is null or pr.estado = any (v_estados))
         and (v_resp is null or pr.respuesta_cliente = any (v_resp))
         and (v_desde is null or (pr.created_at at time zone 'Europe/Madrid')::date >= v_desde)
       order by pr.created_at desc limit v_lim) x;
    return jsonb_build_object('ok', true, 'que', p_que, 'hoy', v_hoy, 'n', jsonb_array_length(r), 'presupuestos', r);

  -- ---------------------------------------------------------------------------
  elsif p_que = 'obras-estado' then
    -- Por defecto las abiertas (planificada y en curso). Con "estado" se piden otras.
    select coalesce(jsonb_agg(to_jsonb(x) order by x.numero), '[]'::jsonb) into r from (
      select o.id as obra_id, o.numero, public.codigo_obra(o.numero) as codigo, o.nombre, o.cliente_id,
             o.poblacion, o.categorias, o.estado, o.creado_en,
             (select a.pct from public.v_obra_avance a where a.obra_id = o.id) as avance_pct,
             (select coalesce(jsonb_agg(jsonb_build_object('orden', f.orden, 'categoria', f.categoria, 'grupo', f.grupo,
                       'nombre', f.nombre, 'pct', f.pct, 'no_aplica', f.no_aplica,
                       'fecha_prevista', f.fecha_prevista, 'hecha_en', f.hecha_en) order by f.orden, f.nombre), '[]'::jsonb)
                from public.obra_fases f where f.obra_id = o.id) as fases,
             (select coalesce(jsonb_agg(jsonb_build_object('fecha', pl.fecha, 'turno', pl.turno,
                       'empleado_id', pl.empleado_id, 'empleado', em.nombre) order by pl.fecha, em.nombre), '[]'::jsonb)
                from public.planificacion pl left join public.empleados em on em.id = pl.empleado_id
               where pl.obra_id = o.id and pl.fecha >= v_hoy) as planificacion,
             (select coalesce(jsonb_agg(jsonb_build_object('texto', m.texto, 'tipo', m.tipo, 'urgente', m.urgente,
                       'creado_en', m.creado_en) order by m.creado_en), '[]'::jsonb)
                from public.material_pedidos m where m.obra_id = o.id and m.hecho_en is null) as material_pendiente,
             (select max(pa.fecha) from public.partes pa where pa.obra_id = o.id and coalesce(pa.estado, '') <> 'anulado') as ultimo_parte
        from public.obras o
       where o.estado = any (coalesce(v_estados, array['planificada', 'en_curso']))
       order by o.numero limit v_lim) x;
    return jsonb_build_object('ok', true, 'que', p_que, 'hoy', v_hoy, 'n', jsonb_array_length(r), 'obras', r);

  -- ---------------------------------------------------------------------------
  elsif p_que = 'partes' then
    -- Sin fechas, los últimos 14 días. El rango no puede pasar de 92 días.
    v_hasta := coalesce(v_hasta, v_hoy);
    v_desde := coalesce(v_desde, v_hasta - 14);
    if v_hasta - v_desde > 92 then raise exception 'El rango no puede pasar de 92 días.'; end if;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.codigo_obra), '[]'::jsonb) into r from (
      select pa.id as parte_id, pa.obra_id, public.codigo_obra(o.numero) as codigo_obra, pa.fecha,
             pa.autor_id, au.nombre as autor, pa.estado, pa.categoria, pa.nivel_incidencia,
             pa.fuera_de_plan, pa.planificacion_id,
             (select coalesce(jsonb_agg(jsonb_build_object('empleado_id', ph.empleado_id, 'empleado', em.nombre, 'horas', ph.horas)
                       order by em.nombre), '[]'::jsonb)
                from public.parte_horas ph left join public.empleados em on em.id = ph.empleado_id
               where ph.parte_id = pa.id) as horas,
             coalesce(pa.horas_externas, '{}'::jsonb) as horas_externas,
             (select coalesce(jsonb_agg(jsonb_build_object('nombre', pm.nombre, 'cantidad', pm.cantidad,
                       'importe', pm.importe, 'compra', pm.compra) order by pm.creado_en), '[]'::jsonb)
                from public.parte_materiales pm where pm.parte_id = pa.id) as materiales
        from public.partes pa
        left join public.obras o on o.id = pa.obra_id
        left join public.empleados au on au.id = pa.autor_id
       where pa.fecha between v_desde and v_hasta
       order by pa.fecha, o.numero limit v_lim) x;

    -- Lo planificado en el mismo rango, y si ese día esa obra tiene parte.
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.codigo_obra, x.empleado), '[]'::jsonb) into r2 from (
      select pl.id as planificacion_id, pl.obra_id, public.codigo_obra(o.numero) as codigo_obra, pl.fecha, pl.turno,
             pl.empleado_id, em.nombre as empleado,
             exists (select 1 from public.partes pa where pa.obra_id = pl.obra_id and pa.fecha = pl.fecha
                       and coalesce(pa.estado, '') <> 'anulado') as tiene_parte
        from public.planificacion pl
        left join public.obras o on o.id = pl.obra_id
        left join public.empleados em on em.id = pl.empleado_id
       where pl.fecha between v_desde and v_hasta and pl.obra_id is not null) x;

    -- Lo que busca el agente: días ya pasados con trabajo planificado y sin parte.
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.codigo_obra), '[]'::jsonb) into r3 from (
      select pl.obra_id, public.codigo_obra(o.numero) as codigo_obra, pl.fecha,
             jsonb_agg(em.nombre order by em.nombre) as planificados
        from public.planificacion pl
        left join public.obras o on o.id = pl.obra_id
        left join public.empleados em on em.id = pl.empleado_id
       where pl.fecha between v_desde and least(v_hasta, v_hoy) and pl.obra_id is not null
         and not exists (select 1 from public.partes pa where pa.obra_id = pl.obra_id and pa.fecha = pl.fecha
                           and coalesce(pa.estado, '') <> 'anulado')
       group by pl.obra_id, o.numero, pl.fecha) x;

    return jsonb_build_object('ok', true, 'que', p_que, 'hoy', v_hoy, 'desde', v_desde, 'hasta', v_hasta,
      'n', jsonb_array_length(r), 'partes', r, 'planificacion', r2, 'dias_sin_parte', r3);

  -- ---------------------------------------------------------------------------
  elsif p_que = 'costes-obra' then
    -- Las mismas cuentas que la vista v_obra_economia de la app (etapa66), sin
    -- su filtro de rol: horas reales = imputaciones + partes sin repetir;
    -- mano extra de los partes a tarifa de peón u oficial; material de obra_costes.
    -- La mano de obra sale en total: no se da lo que cuesta la hora de nadie.
    if v_obra is null then raise exception 'Falta obra_id.'; end if;
    if not exists (select 1 from public.obras where id = v_obra) then raise exception 'No hay ninguna obra con ese id.'; end if;

    with pres as (
      select sum(total_venta) filter (where respuesta_cliente = 'aceptado') as venta,
             sum(total_coste) filter (where respuesta_cliente = 'aceptado') as coste,
             count(*) filter (where respuesta_cliente = 'aceptado') as n
        from public.presupuestos where obra_id = v_obra
    ),
    horas_prev as (
      select sum(l.cantidad) as horas
        from public.presupuesto_lineas l join public.presupuestos pr on pr.id = l.presupuesto_id
       where pr.obra_id = v_obra and pr.respuesta_cliente = 'aceptado'
         and l.origen = 'mano_obra' and lower(l.unidad) in ('h', 'hora', 'horas')
    ),
    hr as (
      select h.empleado_id, h.fecha, h.minutos,
             (select ec.coste_hora from public.empleado_costes ec
               where ec.empleado_id = h.empleado_id and ec.desde <= h.fecha and (ec.hasta is null or ec.hasta >= h.fecha)
               order by ec.desde desc limit 1) as ch
        from public.v_obra_horas_reales h where h.obra_id = v_obra
    ),
    reales as (
      select sum(minutos) / 60.0 as horas, sum(minutos / 60.0 * coalesce(ch, 0)) as coste,
             count(*) filter (where ch is null) as sin_coste
        from hr
    ),
    ex as (
      select x.h,
             (select ec.coste_hora from public.empleado_costes ec
               where ec.externo = x.rol and ec.desde <= pa.fecha and (ec.hasta is null or ec.hasta >= pa.fecha)
               order by ec.desde desc limit 1) as ch
        from public.partes pa
       cross join lateral (
         select case when e.key like 'peon%' then 'peon' else 'oficial' end as rol, nullif(e.value, '')::numeric as h
           from jsonb_each_text(coalesce(pa.horas_externas, '{}'::jsonb)) e) x
       where pa.obra_id = v_obra and coalesce(pa.estado, '') <> 'anulado' and x.h > 0
    ),
    extra as (
      select sum(h) as horas, sum(h * coalesce(ch, 0)) as coste, count(*) filter (where ch is null) as sin_tarifa from ex
    ),
    mat as (
      select sum(coste_total) as coste from public.obra_costes where obra_id = v_obra
    )
    select pres.n as presupuestos_aceptados, pres.venta as venta_presupuestada, pres.coste as coste_previsto,
           horas_prev.horas as horas_previstas,
           round(coalesce(reales.horas, 0) + coalesce(extra.horas, 0), 2) as horas_reales,
           round(coalesce(extra.horas, 0), 2) as horas_extra,
           round(coalesce(reales.coste, 0) + coalesce(extra.coste, 0), 2) as coste_mano_obra_real,
           round(coalesce(mat.coste, 0), 2) as coste_material_real,
           round(coalesce(reales.coste, 0) + coalesce(extra.coste, 0) + coalesce(mat.coste, 0), 2) as coste_real,
           round(pres.venta - pres.coste, 2) as margen_previsto,
           round(pres.venta - coalesce(reales.coste, 0) - coalesce(extra.coste, 0) - coalesce(mat.coste, 0), 2) as margen_real,
           case when coalesce(horas_prev.horas, 0) > 0
                then round(100 * (coalesce(reales.horas, 0) + coalesce(extra.horas, 0)) / horas_prev.horas, 1) end as pct_horas,
           coalesce(reales.sin_coste, 0) + coalesce(extra.sin_tarifa, 0) as dias_sin_coste
      into eco
      from pres, horas_prev, reales, extra, mat;

    -- Los gastos apuntados, uno a uno.
    select coalesce(jsonb_agg(jsonb_build_object('fecha', oc.fecha, 'concepto', oc.concepto, 'categoria', oc.categoria,
             'tipo', oc.tipo, 'cantidad', oc.cantidad, 'coste_unitario', oc.coste_unitario, 'coste_total', oc.coste_total)
             order by oc.fecha, oc.created_at), '[]'::jsonb) into r
      from public.obra_costes oc where oc.obra_id = v_obra;

    -- Las horas de cada uno (horas, no euros).
    select coalesce(jsonb_agg(jsonb_build_object('empleado_id', x.empleado_id, 'empleado', x.nombre, 'horas', x.horas)
             order by x.nombre), '[]'::jsonb) into r2
      from (select h.empleado_id, em.nombre, round(sum(h.minutos) / 60.0, 2) as horas
              from public.v_obra_horas_reales h left join public.empleados em on em.id = h.empleado_id
             where h.obra_id = v_obra group by h.empleado_id, em.nombre) x;

    select jsonb_build_object('obra_id', o.id, 'numero', o.numero, 'codigo', public.codigo_obra(o.numero),
             'nombre', o.nombre, 'estado', o.estado, 'categorias', o.categorias) into r3
      from public.obras o where o.id = v_obra;

    return jsonb_build_object('ok', true, 'que', p_que, 'hoy', v_hoy, 'obra', r3,
      'resumen', to_jsonb(eco), 'gastos', r, 'horas_por_empleado', r2);

  else
    raise exception 'No sé leer «%». Valen: leads-pendientes, visitas-sin-presupuesto, presupuestos, obras-estado, partes, costes-obra.', coalesce(p_que, '');
  end if;
end;
$$;

revoke all on function public.agentes_leer(text, jsonb) from public, anon, authenticated;
grant execute on function public.agentes_leer(text, jsonb) to service_role;

-- La única que escribe: una nota en el seguimiento del cliente y, si se dice,
-- su próxima acción. Si la misma nota llega dos veces en diez minutos (un
-- reintento), la segunda no se apunta.
create or replace function public.agentes_apuntar_seguimiento(p jsonb, p_prueba boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id     uuid := nullif(p->>'cliente_id', '')::uuid;
  v_texto  text := btrim(coalesce(p->>'texto', ''));
  v_accion text := nullif(btrim(coalesce(p->>'proxima_accion', '')), '');
  v_fecha  date := nullif(p->>'proxima_accion_at', '')::date;
  c        record;
  v_nota   uuid;
begin
  if v_id is null then raise exception 'Falta cliente_id.'; end if;
  if v_texto = '' then raise exception 'Falta el texto.'; end if;
  if v_fecha is not null and v_accion is null then raise exception 'Hay fecha de próxima acción pero no dice cuál es.'; end if;

  select id, proxima_accion, proxima_accion_at into c from public.clientes_cache where id = v_id;
  if not found then raise exception 'No hay ningún cliente con ese id.'; end if;

  if exists (select 1 from public.cliente_bitacora b
              where b.cliente_id = v_id and b.tipo = 'agente' and b.texto = v_texto and b.at > now() - interval '10 minutes') then
    return jsonb_build_object('ok', true, 'resultado', 'repetido', 'prueba', p_prueba, 'cliente_id', v_id);
  end if;

  if not p_prueba then
    insert into public.cliente_bitacora (cliente_id, tipo, texto, por)
    values (v_id, 'agente', left(v_texto, 2000), null) returning id into v_nota;
    if v_accion is not null then
      update public.clientes_cache
         set proxima_accion = left(v_accion, 200), proxima_accion_at = v_fecha, proxima_accion_por = null
       where id = v_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'resultado', 'apuntado', 'prueba', p_prueba, 'cliente_id', v_id,
    'nota_id', v_nota,
    'proxima_accion', case when v_accion is not null then jsonb_build_object('texto', left(v_accion, 200), 'fecha', v_fecha,
      'antes', case when c.proxima_accion is not null then jsonb_build_object('texto', c.proxima_accion, 'fecha', c.proxima_accion_at) end) end);
end;
$$;

revoke all on function public.agentes_apuntar_seguimiento(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.agentes_apuntar_seguimiento(jsonb, boolean) to service_role;

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select public.agentes_leer('presupuestos', '{"estado":"enviado","respuesta":"pendiente","limite":3}'::jsonb);
--   select public.agentes_leer('partes', '{}'::jsonb) -> 'dias_sin_parte';
-- =============================================================================
