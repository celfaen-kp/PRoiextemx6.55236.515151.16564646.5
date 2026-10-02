-- =============================================================================
-- Sysefen · Etapa 63 · El proyecto de la obra: fases con porcentaje de avance
--                      (Etapa E del plan PLAN-OBRAS-PLANIFICACION.md)
--
-- QUÉ RESUELVE:
--   Saber dónde está parada cada obra sin preguntar. Cada obra tiene sus
--   FASES (pedido de material, fijaciones, montaje de paneles, inversor…) y
--   cada fase un porcentaje de avance. El avance se actualiza desde el parte:
--   al hacerlo, el jefe (o quien haga el parte) dice hasta dónde queda cada
--   fase («fijaciones al 100 %, paneles al 75 %»). La obra enseña su avance
--   global y, cuando todas las fases están al 100 % o no aplican, pasa sola a
--   «finalizada».
--
-- QUÉ SE AÑADE:
--   · fase_plantillas: la lista de fases por categoría (y las comunes a todas),
--     con su orden. Administración la puede retocar desde la app.
--   · obra_fases: las fases de cada obra, copiadas de las plantillas al crear
--     la obra (o al añadirle una categoría), con su porcentaje.
--   · parte_fases: el historial: en qué parte se dijo que una fase pasaba del
--     40 al 75 %. Así cada parte deja constancia de lo que avanzó.
--   · generar_fases_obra(obra): crea las fases que falten (idempotente).
--   · v_obra_avance: avance global por obra (media de las fases que aplican).
--
-- Requiere la etapa 58. Idempotente. No toca los datos que ya existan.
-- =============================================================================

begin;

-- 1 · Plantillas -----------------------------------------------------------------------
create table if not exists public.fase_plantillas (
  id          uuid primary key default gen_random_uuid(),
  categoria   text check (categoria is null or categoria in ('AE', 'FV', 'AC')),  -- null = común a todas
  orden       int not null default 0,
  nombre      text not null,
  descripcion text,
  al_final    boolean not null default false,   -- las comunes de cierre (cobro) van después de las de categoría
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists fase_plantillas_unica on public.fase_plantillas (coalesce(categoria, ''), nombre);

alter table public.fase_plantillas enable row level security;
drop policy if exists fase_plantillas_select on public.fase_plantillas;
create policy fase_plantillas_select on public.fase_plantillas for select to authenticated using (true);
drop policy if exists fase_plantillas_admin on public.fase_plantillas;
create policy fase_plantillas_admin on public.fase_plantillas
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Semilla (solo las que no existan; se pueden retocar en Ajustes).
insert into public.fase_plantillas (categoria, orden, nombre, descripcion, al_final) values
  (null, 10, 'Pedido de material',    'Material pedido al proveedor', false),
  (null, 20, 'Recepción de material', 'Material recibido y revisado', false),
  (null, 30, 'Replanteo',             'Visita de replanteo y marcado en obra', false),
  ('FV', 110, 'Fijaciones y estructura', 'Anclajes, pies y perfilería en cubierta', false),
  ('FV', 120, 'Montaje de paneles',      'Módulos colocados y fijados', false),
  ('FV', 130, 'Cableado de continua',    'Strings, conectores y canalización CC', false),
  ('FV', 140, 'Inversor y baterías',     'Inversor, baterías y contador instalados', false),
  ('FV', 150, 'Cableado de alterna y protecciones', 'Línea AC, protecciones y conexión al cuadro', false),
  ('FV', 160, 'Puesta en marcha',        'Arranque, pruebas y monitorización', false),
  ('FV', 170, 'Legalización',            'Modelo 034, certificado y boletín', false),
  ('AE', 210, 'Ubicación unidad exterior', 'Bancada, soportes y unidad exterior colocada', false),
  ('AE', 220, 'Unidad interior y depósito', 'Unidad interior, acumulador y vaso de expansión', false),
  ('AE', 230, 'Hidráulica',              'Tuberías, valvulería, llenado y purga', false),
  ('AE', 240, 'Eléctrica',               'Alimentación, protecciones y comunicación', false),
  ('AE', 250, 'Puesta en marcha',        'Arranque, configuración y pruebas', false),
  ('AE', 260, 'Legalización',            'Memoria técnica y registro en Industria', false),
  ('AC', 310, 'Unidades interiores',     'Splits o conductos colocados', false),
  ('AC', 320, 'Unidad exterior',         'Soportes y unidad exterior colocada', false),
  ('AC', 330, 'Líneas frigoríficas y desagües', 'Tubería, aislamiento y desagües', false),
  ('AC', 340, 'Eléctrica',               'Alimentación y protecciones', false),
  ('AC', 350, 'Vacío y carga',           'Vacío, prueba de estanqueidad y carga de gas', false),
  ('AC', 360, 'Puesta en marcha',        'Arranque y pruebas', false),
  (null, 900, 'Cobro final',             'Factura final cobrada', true)
on conflict do nothing;

-- 2 · Las fases de cada obra ----------------------------------------------------------
create table if not exists public.obra_fases (
  id             uuid primary key default gen_random_uuid(),
  obra_id        uuid not null references public.obras(id) on delete cascade,
  plantilla_id   uuid references public.fase_plantillas(id) on delete set null,
  categoria      text check (categoria is null or categoria in ('AE', 'FV', 'AC')),
  orden          int not null default 0,
  nombre         text not null,
  pct            int not null default 0 check (pct between 0 and 100),
  no_aplica      boolean not null default false,
  fecha_prevista date,
  hecha_en       timestamptz,
  hecha_por      uuid references public.empleados(id) on delete set null,
  nota           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists obra_fases_obra_idx on public.obra_fases (obra_id, orden);
create unique index if not exists obra_fases_unica on public.obra_fases (obra_id, coalesce(categoria, ''), nombre);

drop trigger if exists obra_fases_updated_at on public.obra_fases;
create trigger obra_fases_updated_at before update on public.obra_fases
  for each row execute function public.tocar_updated_at();

alter table public.obra_fases enable row level security;
-- Las ve quien ve la obra (la RLS de obras manda). Las cambia todo comercial y
-- quien está en la obra (planificado o asignado): el operario marca avance.
drop policy if exists obra_fases_select on public.obra_fases;
create policy obra_fases_select on public.obra_fases
  for select to authenticated
  using (exists (select 1 from public.obras o where o.id = obra_fases.obra_id));
drop policy if exists obra_fases_update on public.obra_fases;
create policy obra_fases_update on public.obra_fases
  for update to authenticated
  using (public.es_comercial() or public.pertenece_a_obra(obra_id) or public.planificado_en_obra(obra_id))
  with check (public.es_comercial() or public.pertenece_a_obra(obra_id) or public.planificado_en_obra(obra_id));
drop policy if exists obra_fases_insert on public.obra_fases;
create policy obra_fases_insert on public.obra_fases
  for insert to authenticated with check (public.es_comercial());
drop policy if exists obra_fases_delete on public.obra_fases;
create policy obra_fases_delete on public.obra_fases
  for delete to authenticated using (public.es_comercial());

-- 3 · El historial: qué avanzó cada parte -----------------------------------------------
create table if not exists public.parte_fases (
  id           uuid primary key default gen_random_uuid(),
  parte_id     uuid not null references public.partes(id) on delete cascade,
  fase_id      uuid not null references public.obra_fases(id) on delete cascade,
  pct_antes    int not null default 0,
  pct_despues  int not null check (pct_despues between 0 and 100),
  created_at   timestamptz not null default now(),
  unique (parte_id, fase_id)
);
alter table public.parte_fases enable row level security;
drop policy if exists parte_fases_select on public.parte_fases;
create policy parte_fases_select on public.parte_fases
  for select to authenticated
  using (exists (select 1 from public.partes p where p.id = parte_fases.parte_id));
drop policy if exists parte_fases_insert on public.parte_fases;
create policy parte_fases_insert on public.parte_fases
  for insert to authenticated
  with check (public.es_comercial() or public.parte_es_mio(parte_id));

-- Al apuntar el avance desde un parte, la fase se actualiza sola.
create or replace function public.aplicar_avance_parte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_autor uuid;
begin
  select autor_id into v_autor from public.partes where id = new.parte_id;
  update public.obra_fases
     set pct = new.pct_despues,
         hecha_en = case when new.pct_despues = 100 then coalesce(hecha_en, now()) else null end,
         hecha_por = case when new.pct_despues = 100 then coalesce(hecha_por, v_autor) else null end
   where id = new.fase_id;
  return new;
end;
$$;
drop trigger if exists parte_fases_aplicar on public.parte_fases;
create trigger parte_fases_aplicar
  after insert on public.parte_fases
  for each row execute function public.aplicar_avance_parte();

-- 4 · Generar las fases de una obra (las que falten) -------------------------------------
create or replace function public.generar_fases_obra(p_obra uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_cats text[]; v_n int;
begin
  select categorias into v_cats from public.obras where id = p_obra;
  insert into public.obra_fases (obra_id, plantilla_id, categoria, orden, nombre)
  select p_obra, t.id, t.categoria, t.orden, t.nombre
    from public.fase_plantillas t
   where t.activa
     and (t.categoria is null or t.categoria = any(coalesce(v_cats, '{}'::text[])))
  on conflict (obra_id, coalesce(categoria, ''), nombre) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
grant execute on function public.generar_fases_obra(uuid) to authenticated;

-- Al crear una obra o cambiarle las categorías, sus fases.
create or replace function public.obra_genera_fases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.generar_fases_obra(new.id);
  return new;
end;
$$;
drop trigger if exists obras_generan_fases on public.obras;
create trigger obras_generan_fases
  after insert or update of categorias on public.obras
  for each row execute function public.obra_genera_fases();

-- Las obras en marcha que ya existen, también.
select public.generar_fases_obra(id) from public.obras where estado in ('planificada', 'en_curso');

-- 5 · Avance global y cierre automático -------------------------------------------------------
create or replace view public.v_obra_avance
with (security_invoker = true) as
select obra_id,
       count(*) filter (where not no_aplica)                 as total,
       count(*) filter (where not no_aplica and pct = 100)   as hechas,
       coalesce(round(avg(pct) filter (where not no_aplica)), 0)::int as pct
  from public.obra_fases
 group by obra_id;
grant select on public.v_obra_avance to authenticated;

-- Cuando todas las fases que aplican están al 100 %, la obra queda finalizada
-- (y si se reabre una fase, vuelve a en curso).
create or replace function public.obra_cierra_por_fases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_total int; v_hechas int;
begin
  select count(*) filter (where not no_aplica), count(*) filter (where not no_aplica and pct = 100)
    into v_total, v_hechas from public.obra_fases where obra_id = new.obra_id;
  if v_total > 0 and v_hechas = v_total then
    update public.obras set estado = 'finalizada' where id = new.obra_id and estado in ('planificada', 'en_curso');
  else
    update public.obras set estado = 'en_curso' where id = new.obra_id and estado = 'finalizada';
  end if;
  return new;
end;
$$;
drop trigger if exists obra_fases_cierran_obra on public.obra_fases;
create trigger obra_fases_cierran_obra
  after update of pct, no_aplica on public.obra_fases
  for each row execute function public.obra_cierra_por_fases();

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select public.codigo_obra(o.numero), a.pct, a.hechas, a.total
--     from public.v_obra_avance a join public.obras o on o.id = a.obra_id order by o.numero desc;
--   select categoria, orden, nombre from public.fase_plantillas where activa order by al_final, orden;
-- =============================================================================
