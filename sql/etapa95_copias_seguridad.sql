-- =============================================================================
-- Etapa 95 · Copias de seguridad automáticas a Google Drive (2-11-2026)
--
-- El plan gratuito de Supabase no hace copias. La Edge Function
-- `copia-seguridad` vuelca cada semana TODAS las tablas de `public` (JSON fiel
-- + CSV legible) y todos los archivos de Storage a una carpeta de Drive
-- («Copias de seguridad», junto a la de planillas). Guarda las 8 últimas
-- semanales y la primera de cada mes para siempre.
--
-- Aquí va lo que necesita en la base de datos:
--   1. `copias_seguridad`: una fila por copia, con su progreso (la copia se
--      hace en varias pasadas del cron para no agotar el tiempo de la función).
--   2. Tres funciones que solo puede usar la llave del servidor:
--        copia_tablas()          qué tablas hay, en orden de dependencia
--        copia_tabla_json(...)   un trozo de una tabla como JSON
--        copia_archivos()        qué archivos hay en Storage
--   3. La tarea cron cada 10 minutos: los domingos a las 03 UTC arranca una
--      copia; el resto del tiempo solo continúa la que esté a medias.
-- =============================================================================

-- 1. Registro de copias ---------------------------------------------------------
create table if not exists public.copias_seguridad (
  id uuid primary key default gen_random_uuid(),
  creada_en timestamptz not null default now(),
  terminada_en timestamptz,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'ok', 'error')),
  paso text not null default 'preparar',            -- preparar · tablas · archivos · retencion · fin
  origen text not null default 'cron',              -- cron · manual
  es_mensual boolean not null default false,        -- primera copia del mes: no se borra nunca
  nombre text,                                      -- nombre de la carpeta en Drive
  carpeta_id text,                                  -- id de la carpeta de esta copia
  carpetas jsonb not null default '{}'::jsonb,      -- ruta → id de subcarpeta ya creada
  tablas_total int not null default 0,
  tablas_hechas text[] not null default '{}',
  filas bigint not null default 0,
  archivos_total int not null default 0,
  archivos_hechos int not null default 0,
  archivos_pendientes jsonb not null default '[]'::jsonb,  -- [{b: bucket, n: ruta, t: bytes}]
  bytes bigint not null default 0,
  pasadas int not null default 0,                   -- llamadas que ha necesitado
  error text,
  avisado boolean not null default false,           -- ya se mandó el correo de fallo
  borradas text[] not null default '{}'             -- copias antiguas retiradas en esta pasada
);
create index if not exists copias_seguridad_creada_idx on public.copias_seguridad (creada_en desc);

alter table public.copias_seguridad enable row level security;
drop policy if exists copias_ver_admin on public.copias_seguridad;
create policy copias_ver_admin on public.copias_seguridad for select to authenticated using (public.es_admin());
-- Escribe solo la función (llave del servidor, que no pasa por RLS).

-- 2. Funciones de volcado ----------------------------------------------------------
-- Tablas de `public` ordenadas de forma que los padres vayan antes que los hijos
-- (así la restauración puede insertar en ese mismo orden sin romper claves ajenas).
drop function if exists public.copia_tablas();
create or replace function public.copia_tablas()
returns table (tabla text, filas bigint, pk text, generadas text[])
language plpgsql security definer set search_path = public
as $$
declare
  pendientes text[];
  colocadas text[] := '{}';
  t text;
  cnt bigint;
  pkcols text;
  gen text[];
  avance boolean;
begin
  select array_agg(c.relname::text order by c.relname) into pendientes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'copias_seguridad';

  while coalesce(array_length(pendientes, 1), 0) > 0 loop
    avance := false;
    foreach t in array pendientes loop
      -- ¿Todas las tablas a las que apunta (salvo ella misma) están ya colocadas?
      if not exists (
        select 1 from pg_constraint k
        join pg_class src on src.oid = k.conrelid
        join pg_class dst on dst.oid = k.confrelid
        join pg_namespace nd on nd.oid = dst.relnamespace
        where k.contype = 'f' and src.relname = t and nd.nspname = 'public'
          and dst.relname <> t and not (dst.relname::text = any (colocadas))
          and dst.relname::text = any (pendientes)
      ) then
        colocadas := colocadas || t;
        pendientes := array_remove(pendientes, t);
        avance := true;
      end if;
    end loop;
    -- Ciclo entre tablas: se colocan tal cual y la restauración lo hará sin comprobar claves.
    if not avance then colocadas := colocadas || pendientes; pendientes := '{}'; end if;
  end loop;

  foreach t in array colocadas loop
    execute format('select count(*) from public.%I', t) into cnt;
    select string_agg(quote_ident(a.attname), ', ' order by array_position(i.indkey, a.attnum)) into pkcols
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = ('public.' || quote_ident(t))::regclass and i.indisprimary;
    -- Columnas calculadas (generated always): no se pueden insertar al restaurar.
    select coalesce(array_agg(a.attname::text order by a.attnum), '{}') into gen
    from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated <> '';
    tabla := t; filas := cnt; pk := pkcols; generadas := gen;
    return next;
  end loop;
end $$;

-- Un trozo de una tabla, como JSON, ordenado por su clave primaria para que la
-- paginación no repita ni salte filas.
create or replace function public.copia_tabla_json(p_tabla text, p_desde int, p_cuantos int)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  res jsonb;
  orden text;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind = 'r' and c.relname = p_tabla) then
    raise exception 'tabla desconocida: %', p_tabla;
  end if;
  select string_agg(quote_ident(a.attname), ', ' order by array_position(i.indkey, a.attnum)) into orden
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
  where i.indrelid = ('public.' || quote_ident(p_tabla))::regclass and i.indisprimary;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.%I order by %s offset %s limit %s) t',
                 p_tabla, coalesce(orden, '1'), greatest(p_desde, 0), least(greatest(p_cuantos, 1), 2000))
    into res;
  return res;
end $$;

-- Todos los archivos de Storage (bucket, ruta, tamaño), sin los marcadores de carpeta vacía.
create or replace function public.copia_archivos()
returns table (bucket text, ruta text, bytes bigint)
language sql security definer set search_path = public
as $$
  select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.name not like '%/.emptyFolderPlaceholder' and o.name <> '.emptyFolderPlaceholder'
  order by o.bucket_id, o.name
$$;

-- Solo la llave del servidor: nadie desde la app.
revoke all on function public.copia_tablas() from public, anon, authenticated;
revoke all on function public.copia_tabla_json(text, int, int) from public, anon, authenticated;
revoke all on function public.copia_archivos() from public, anon, authenticated;
grant execute on function public.copia_tablas() to service_role;
grant execute on function public.copia_tabla_json(text, int, int) to service_role;
grant execute on function public.copia_archivos() to service_role;

-- 3. Cron: cada 10 minutos. La función decide: domingo 03 UTC arranca; si hay una
-- a medias, la continúa; si no, no hace nada. La clave x-clave se copia de la
-- tarea `resumen-citas-manana`, que ya la tiene.
do $$
declare
  clave text;
begin
  select substring(command from $re$x-clave', '([^']+)'$re$) into clave
  from cron.job where jobname = 'resumen-citas-manana';
  if clave is null then raise exception 'No se encontró la clave en el cron resumen-citas-manana'; end if;
  perform cron.unschedule('copia-seguridad') where exists (select 1 from cron.job where jobname = 'copia-seguridad');
  perform cron.schedule('copia-seguridad', '*/10 * * * *',
    format($c$select net.http_post(url := 'https://pcftuxqgzeacladtmaqx.supabase.co/functions/v1/copia-seguridad', headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', %L), body := '{"cron": true}'::jsonb, timeout_milliseconds := 120000);$c$, clave));
end $$;

select tabla, filas, pk, generadas from public.copia_tablas();
