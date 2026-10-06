-- =============================================================================
-- Sysefen · Etapa 70 · «Sala de máquinas», y fases con opciones a elegir
--
-- QUÉ CAMBIA:
--   · En aerotermia, la fase «Unidad interior y depósito» pasa a llamarse
--     «Sala de máquinas» (en la plantilla y en las obras que ya la tienen).
--   · Una fase puede llevar OPCIONES a elegir en cada obra: «Emisores» con
--     suelo radiante, fancoils o radiadores (se pueden marcar varias). La
--     plantilla define las posibles; la obra guarda las elegidas y el nombre
--     de la fase las enseña: «Emisores · Suelo radiante».
--   · Las obras de aerotermia en marcha reciben la fase «Emisores».
--
-- Requiere la etapa 63. Idempotente.
-- =============================================================================

begin;

-- 1 · Sala de máquinas ---------------------------------------------------------------
update public.fase_plantillas set nombre = 'Sala de máquinas', descripcion = 'Unidad interior, acumulador, vaso de expansión y conexiones'
 where categoria = 'AE' and nombre = 'Unidad interior y depósito';
update public.obra_fases set nombre = 'Sala de máquinas'
 where categoria = 'AE' and nombre = 'Unidad interior y depósito';

-- 2 · Opciones en las fases -----------------------------------------------------------
alter table public.fase_plantillas add column if not exists opciones text[];       -- las posibles
alter table public.obra_fases add column if not exists opciones_posibles text[];  -- copiadas de la plantilla
alter table public.obra_fases add column if not exists opciones text[];           -- las elegidas en esta obra

comment on column public.fase_plantillas.opciones is 'Si la fase se concreta en cada obra («Emisores»: suelo radiante, fancoils, radiadores), aquí las posibles.';
comment on column public.obra_fases.opciones is 'Las elegidas en esta obra (pueden ser varias). El nombre de la fase las enseña.';

insert into public.fase_plantillas (categoria, orden, nombre, descripcion, al_final, opciones) values
  ('AE', 225, 'Emisores', 'Qué reparte el calor en la casa', false, array['Suelo radiante', 'Fancoils', 'Radiadores'])
on conflict do nothing;

-- Al generar las fases de una obra, se copian también las opciones posibles.
create or replace function public.generar_fases_obra(p_obra uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_cats text[]; v_n int;
begin
  select categorias into v_cats from public.obras where id = p_obra;
  insert into public.obra_fases (obra_id, plantilla_id, categoria, orden, nombre, opciones_posibles)
  select p_obra, t.id, t.categoria, t.orden, t.nombre, t.opciones
    from public.fase_plantillas t
   where t.activa
     and (t.categoria is null or t.categoria = any(coalesce(v_cats, '{}'::text[])))
  on conflict (obra_id, coalesce(categoria, ''), nombre) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Las obras en marcha: la fase nueva y las opciones de las que ya existían.
select public.generar_fases_obra(id) from public.obras where estado in ('planificada', 'en_curso');
update public.obra_fases f set opciones_posibles = t.opciones
  from public.fase_plantillas t
 where f.plantilla_id = t.id and t.opciones is not null and f.opciones_posibles is null;

commit;

-- =============================================================================
-- 3 · ARREGLO PUNTUAL (pedido por Enzo, 6 oct 2026): los partes que se hicieron
--     en OB-004 (Inca, calle Santo Domingo, obra que aún no ha empezado) eran en
--     realidad de OB-011 (Eranovum e-mobility). Se mueven. Antes de darle a Run,
--     comprueba con el primer select que son esos; si no cuadra, no ejecutes
--     el update (la app también permite moverlos uno a uno o todos desde la
--     ficha de la obra, botón «Mover todos los partes a otra obra»).
-- =============================================================================
-- select public.codigo_obra(o.numero) as obra, o.cliente, count(p.*) as partes, min(p.fecha), max(p.fecha)
--   from public.partes p join public.obras o on o.id = p.obra_id
--  where o.numero in (4, 11) group by 1, 2;
--
-- update public.partes
--    set obra_id = (select id from public.obras where numero = 11)
--  where obra_id = (select id from public.obras where numero = 4)
--    and coalesce(estado, '') <> 'anulado';
