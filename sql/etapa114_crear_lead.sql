-- =============================================================================
-- Sysefen · etapa 114 · «crear lead» para los agentes (Enzo, 18-11-2026)
--
-- Enzo: «Estoy montando agentes que automatizan la entrada de leads (Meta,
-- Vaillant y Saunier Duval)… lo ideal sería una función tipo "crear lead" en la
-- app que ya compruebe duplicados, y que los agentes solo la llamen. Así las
-- reglas quedan en la app y no repartidas.»
--
-- QUÉ HACE crear_lead(p, p_prueba):
--   1. Si esa misma entrada ya llegó (misma fuente y misma ref), no hace nada y
--      devuelve lo de la primera vez: «repetido». Un reintento no duplica.
--   2. Si ya hay una ficha con el mismo teléfono (las nueve últimas cifras, con
--      o sin +34) o el mismo correo, es el mismo cliente: «duplicado». No se
--      crea otra ficha; en la que hay se apunta que ha vuelto a entrar y, si no
--      tenía nada pendiente, se le pone «Llamar» para hoy.
--   3. Si no, se crea la ficha: «nuevo». Entra como los de la web (lead_at), así
--      que sale arriba en Clientes hasta que se le cita o se resuelve.
--   Un nombre igual con otro teléfono y otro correo NO impide crearla (puede ser
--   otra persona): se devuelve como aviso en «posibles_duplicados», y la ficha
--   ya avisa sola de «Puede estar dos veces».
--
-- Es la MISMA regla que usa la app en la ficha (posiblesDuplicados en
-- index.html): teléfono, correo o nombre.
--
-- QUIÉN LA LLAMA: solo la Edge Function `crear-lead` (service_role). Ni la app
-- ni nadie con sesión puede ejecutarla.
--
-- lead_entradas guarda cada entrada tal como llegó: de qué fuente, con qué
-- referencia, en qué ficha acabó y si era nueva o repetida.
--
-- Requiere etapa20 (clientes_cache, es_comercial), etapa32 (lead_at), etapa64
-- (motivo_web) y etapa71 (cliente_bitacora, proxima_accion).
-- =============================================================================

begin;

-- Las nueve últimas cifras del teléfono: «+34 600 11 22 33» y «600112233» son el mismo.
create or replace function public.tel_clave(t text)
returns text language sql immutable as $$
  select right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 9)
$$;

-- El nombre sin tildes, en minúsculas y con los signos como espacios.
create or replace function public.nombre_clave(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    lower(regexp_replace(normalize(coalesce(t, ''), NFD), '[̀-ͯ]', '', 'g')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

create table if not exists public.lead_entradas (
  id          uuid primary key default gen_random_uuid(),
  fuente      text not null,
  ref         text,
  cliente_id  uuid references public.clientes_cache(id) on delete set null,
  resultado   text not null check (resultado in ('nuevo', 'duplicado')),
  coincide    text[],
  datos       jsonb not null,
  at          timestamptz not null default now()
);
comment on table public.lead_entradas is 'Cada lead que mandan los agentes por la función crear-lead, tal como llegó.';
comment on column public.lead_entradas.ref is 'Id del lead en su fuente (p. ej. el de Meta). Con él, un reintento no cuenta dos veces.';
comment on column public.lead_entradas.coincide is 'Si era duplicado, por qué: telefono, email.';
create unique index if not exists lead_entradas_ref on public.lead_entradas (fuente, ref) where ref is not null;
create index if not exists lead_entradas_cliente_idx on public.lead_entradas (cliente_id);
create index if not exists lead_entradas_at_idx on public.lead_entradas (at desc);

alter table public.lead_entradas enable row level security;
drop policy if exists lead_entradas_ver on public.lead_entradas;
create policy lead_entradas_ver on public.lead_entradas
  for select to authenticated using (public.es_comercial());

create or replace function public.crear_lead(p jsonb, p_prueba boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_fuente   text := lower(btrim(coalesce(p->>'fuente', '')));
  v_fuente_n text := coalesce(nullif(btrim(coalesce(p->>'fuente_nombre', '')), ''), v_fuente);
  v_ref      text := nullif(btrim(coalesce(p->>'ref', '')), '');
  v_nombre   text := btrim(coalesce(p->>'nombre', ''));
  v_tel      text := nullif(btrim(coalesce(p->>'telefono', '')), '');
  v_mail     text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_tipo     text := coalesce(nullif(btrim(coalesce(p->>'tipo', '')), ''), 'particular');
  v_motivo   text := nullif(btrim(coalesce(p->>'motivo', '')), '');
  v_at       timestamptz := coalesce(nullif(p->>'recibido_at', '')::timestamptz, now());
  v_telc     text := public.tel_clave(v_tel);
  v_nomc     text := public.nombre_clave(v_nombre);
  e          record;
  c          record;
  v_coincide text[] := '{}';
  v_posibles jsonb;
  v_id       uuid;
  v_accion   boolean := false;
begin
  if v_fuente = '' then raise exception 'Falta la fuente.'; end if;
  if v_nombre = '' then raise exception 'Falta el nombre.'; end if;
  if v_tel is null and v_mail is null then raise exception 'Hace falta un teléfono o un correo.'; end if;
  if v_tipo not in ('particular', 'empresa', 'comunidad') then raise exception 'Tipo no válido.'; end if;

  -- De una en una: si el mismo lead llega dos veces a la vez, la segunda espera
  -- a que acabe la primera y ya lo encuentra.
  perform pg_advisory_xact_lock(hashtext('sysefen.crear_lead'));

  -- 1) La misma entrada otra vez.
  if v_ref is not null then
    select * into e from public.lead_entradas where fuente = v_fuente and ref = v_ref;
    if found then
      return jsonb_build_object('ok', true, 'resultado', 'repetido', 'prueba', p_prueba,
        'cliente_id', e.cliente_id, 'primera_vez', e.resultado, 'recibido', e.at);
    end if;
  end if;

  -- 2) El mismo cliente: mismo teléfono o mismo correo. Si hay varias fichas,
  --    la que coincide en las dos cosas; luego la que ya está en el CRM; luego
  --    la más antigua.
  select cc.id, cc.nombre, cc.origen, cc.proxima_accion, coalesce(cc.lead_at, cc.created_at) as ingreso,
         (length(v_telc) = 9 and public.tel_clave(cc.telefono) = v_telc) as por_tel,
         (v_mail is not null and lower(btrim(cc.email)) = v_mail) as por_mail
    into c
    from public.clientes_cache cc
   where (length(v_telc) = 9 and public.tel_clave(cc.telefono) = v_telc)
      or (v_mail is not null and lower(btrim(cc.email)) = v_mail)
   order by ((length(v_telc) = 9 and public.tel_clave(cc.telefono) = v_telc)::int
             + (v_mail is not null and lower(btrim(cc.email)) = v_mail)::int) desc,
            (cc.tl_id is not null) desc, cc.created_at
   limit 1;

  if found then
    if c.por_tel then v_coincide := array_append(v_coincide, 'telefono'); end if;
    if c.por_mail then v_coincide := array_append(v_coincide, 'email'); end if;
    if not p_prueba then
      insert into public.cliente_bitacora (cliente_id, tipo, texto, por)
      values (c.id, 'sistema', 'Ha vuelto a entrar por ' || v_fuente_n
        || case when v_motivo is not null then ': ' || left(v_motivo, 600) else '' end, null);
      -- Que alguien lo vea hoy, sin pisar lo que ya tuviera apuntado.
      if c.proxima_accion is null then
        update public.clientes_cache
           set proxima_accion = 'Llamar: ha vuelto a entrar por ' || v_fuente_n,
               proxima_accion_at = (now() at time zone 'Europe/Madrid')::date,
               proxima_accion_por = null
         where id = c.id;
        v_accion := true;
      end if;
      insert into public.lead_entradas (fuente, ref, cliente_id, resultado, coincide, datos)
      values (v_fuente, v_ref, c.id, 'duplicado', v_coincide, p);
    end if;
    return jsonb_build_object('ok', true, 'resultado', 'duplicado', 'prueba', p_prueba,
      'cliente_id', c.id, 'coincide', to_jsonb(v_coincide),
      -- Sin el nombre: con la clave de los agentes no se puede preguntar de quién es un teléfono.
      'cliente', jsonb_build_object('origen', c.origen, 'ingreso', c.ingreso),
      'apuntado', case when p_prueba then null
        else to_jsonb('nota en su seguimiento' || case when v_accion then ' y «Llamar» para hoy' else '' end) end);
  end if;

  -- 3) Nuevo. Los que se llaman igual van de aviso, no lo impiden.
  select coalesce(jsonb_agg(jsonb_build_object('cliente_id', x.id, 'nombre', x.nombre)), '[]'::jsonb)
    into v_posibles
    from (select cc.id, cc.nombre from public.clientes_cache cc
           where v_nomc <> '' and public.nombre_clave(cc.nombre) = v_nomc
           order by cc.created_at limit 5) x;

  if p_prueba then
    return jsonb_build_object('ok', true, 'resultado', 'nuevo', 'prueba', true,
      'cliente_id', null, 'posibles_duplicados', v_posibles);
  end if;

  insert into public.clientes_cache
    (nombre, tipo, telefono, email, nif, direccion, poblacion, origen, motivo_web,
     lead_at, lead_visto, pendiente_alta, creado_por)
  values
    (v_nombre, v_tipo, v_tel, v_mail,
     nullif(btrim(coalesce(p->>'nif', '')), ''),
     nullif(btrim(coalesce(p->>'direccion', '')), ''),
     nullif(btrim(coalesce(p->>'poblacion', '')), ''),
     v_fuente, v_motivo, v_at, false, true, null)
  returning id into v_id;

  insert into public.lead_entradas (fuente, ref, cliente_id, resultado, datos)
  values (v_fuente, v_ref, v_id, 'nuevo', p);

  return jsonb_build_object('ok', true, 'resultado', 'nuevo', 'prueba', false,
    'cliente_id', v_id, 'posibles_duplicados', v_posibles);
end;
$$;

revoke all on function public.crear_lead(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.crear_lead(jsonb, boolean) to service_role;

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select public.crear_lead('{"fuente":"vaillant","nombre":"Prueba","telefono":"600000000"}'::jsonb, true);
--   select at, fuente, ref, resultado, coincide, cliente_id from public.lead_entradas order by at desc limit 20;
-- =============================================================================
