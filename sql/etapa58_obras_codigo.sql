-- =============================================================================
-- Sysefen · Etapa 58 · Código de obra (OB-001), categorías y estado en la base
--                      (Etapa A del plan PLAN-OBRAS-PLANIFICACION.md)
--
-- QUÉ RESUELVE:
--   Las obras no tenían un identificador que se pudiera decir por teléfono o
--   escribir en un albarán: se las llamaba por el nombre y había dos iguales.
--   Ahora cada obra recibe un NÚMERO correlativo, único y global, que no se
--   reinicia nunca y que pone la base al crearla (nadie lo elige). En pantalla
--   se enseña como OB-001, OB-002 … OB-999, OB-1000, OB-1001 (mínimo tres
--   cifras; a partir de mil crece sin más). Se ordena por el número, no por el
--   texto.
--
--   Además:
--   · categorias: qué lleva la obra (AE aerotermia, FV fotovoltaica, AC aire).
--     Una casa con aerotermia y placas es UNA obra con {AE,FV}; la categoría no
--     va en el código.
--   · estado con valores fijos: planificada, en_curso, finalizada, cerrada.
--     Lo que la app guardaba como 'Cerrada' pasa a 'cerrada'; el resto, a
--     'en_curso'.
--   · poblacion y cliente_id (enlace opcional con clientes_cache). La columna
--     cliente (texto) se queda tal cual.
--
-- NUMERACIÓN DE LAS OBRAS EXISTENTES:
--   Se numeran por fecha de creación: la más antigua es OB-001. Decidido con
--   Enzo el 1 de octubre de 2026. Si algún día se quisiera arrancar en otro
--   número (p. ej. el de contabilidad), ver el setval al final.
--
-- Idempotente. No borra ni renumera nada que ya tenga número.
-- =============================================================================

begin;

-- 1 · El número y su secuencia -----------------------------------------------
alter table public.obras add column if not exists numero integer;
create sequence if not exists public.obras_numero_seq;

create or replace function public.poner_numero_obra()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null then
    new.numero := nextval('public.obras_numero_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists obras_numero on public.obras;
create trigger obras_numero
  before insert on public.obras
  for each row execute function public.poner_numero_obra();

-- El texto que se enseña: OB-007, OB-137, OB-1000.
create or replace function public.codigo_obra(n integer)
returns text
language sql
immutable
as $$ select case when n is null then null else 'OB-' || lpad(n::text, 3, '0') end $$;

-- Las obras que ya existen, por orden de creación (la más antigua, la 1).
update public.obras o
   set numero = sub.rn + coalesce((select max(numero) from public.obras where numero is not null), 0)
  from (select id, row_number() over (order by creado_en, id) as rn
          from public.obras where numero is null) sub
 where o.id = sub.id;

-- Que las nuevas sigan desde la última. Para arrancar en otro número (p. ej.
-- que la siguiente obra sea la 500): select setval('public.obras_numero_seq', 499);
select setval('public.obras_numero_seq', greatest(coalesce((select max(numero) from public.obras), 0), 1), (select count(*) > 0 from public.obras));

alter table public.obras alter column numero set not null;
create unique index if not exists obras_numero_unico on public.obras (numero);

-- 2 · Categorías ---------------------------------------------------------------
create or replace function public.categorias_validas(c text[])
returns boolean
language sql
immutable
as $$ select c is not null and c <@ array['AE', 'FV', 'AC']::text[] $$;

alter table public.obras add column if not exists categorias text[] not null default '{}'::text[];
alter table public.obras drop constraint if exists obras_categorias_validas;
alter table public.obras add constraint obras_categorias_validas check (public.categorias_validas(categorias));

-- 3 · Estado -----------------------------------------------------------------------
alter table public.obras add column if not exists estado text;
update public.obras set estado = 'cerrada'  where estado = 'Cerrada';
update public.obras set estado = 'en_curso' where estado is null or estado not in ('planificada', 'en_curso', 'finalizada', 'cerrada');
alter table public.obras alter column estado set default 'planificada';
alter table public.obras alter column estado set not null;
alter table public.obras drop constraint if exists obras_estado_valido;
alter table public.obras add constraint obras_estado_valido check (estado in ('planificada', 'en_curso', 'finalizada', 'cerrada'));

-- 4 · Población y enlace con el cliente -------------------------------------------
alter table public.obras add column if not exists poblacion text;
alter table public.obras add column if not exists cliente_id uuid references public.clientes_cache(id) on delete set null;

comment on column public.obras.numero     is 'Correlativo único y global. Lo pone la base al crear. Se enseña como codigo_obra(numero) = OB-001.';
comment on column public.obras.categorias is 'Qué lleva la obra: AE aerotermia, FV fotovoltaica, AC aire acondicionado. Puede llevar varias.';
comment on column public.obras.estado     is 'planificada (aún sin empezar) · en_curso · finalizada (todo hecho) · cerrada (cobrada y archivada).';

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select public.codigo_obra(numero) as codigo, nombre, cliente, estado, categorias, creado_en
--     from public.obras order by numero;
--   select last_value from public.obras_numero_seq;
-- =============================================================================
