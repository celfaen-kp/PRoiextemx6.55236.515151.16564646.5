-- =============================================================================
-- Sysefen · Etapa 74 · El presupuestador de fotovoltaica v2 (modelo de Ramón)
--
-- POR QUÉ (Enzo, 13 oct 2026):
--   Ramón entregó el 12-10-2026 el presupuestador FV v2: 59 partidas de coste,
--   dimensionado por consumo o factura, Fronius / Deye / Enphase, teja o plana
--   (Sun Ballast), margen del 50 % sobre la venta y precio redondeado a 10 €.
--   Sus precios y parámetros viven en un JSON (modelo_fv.json). La función
--   `presupuestar` (fv.js) los lee de aquí, no del código: cuando Ramón mande
--   un JSON nuevo se inserta otra versión y la anterior se cierra. Cada
--   presupuesto guarda con qué versión se calculó.
--
-- QUÉ CREA:
--   · public.motor_modelos: una fila por versión del modelo (categoria, version,
--     vigente_desde / vigente_hasta, datos jsonb). Solo Administración lo ve
--     desde la app (lleva costes y márgenes); la función usa la clave maestra.
--   · presupuestos.modelo_id: con qué modelo se calculó.
--
-- LOS DATOS NO VAN AQUÍ (el repo es público): los carga
--   herramientas/cargar-modelo-fv.py → subir-a-supabase/etapa74b_modelo_fv_datos.sql
-- que se pega DESPUÉS de este archivo.
--
-- Idempotente. Requiere la etapa 38 (presupuestos) y la etapa 2 (es_admin()).
-- =============================================================================

begin;

create table if not exists public.motor_modelos (
  id             uuid primary key default gen_random_uuid(),
  categoria      text not null,
  version        text not null,
  vigente_desde  date not null default current_date,
  vigente_hasta  date,
  datos          jsonb not null,
  notas          text,
  created_at     timestamptz not null default now(),
  unique (categoria, version)
);
comment on table public.motor_modelos is 'Modelos de cálculo cerrados (p. ej. el presupuestador FV v2 de Ramón): precios y parámetros en datos (jsonb), versionados. El vigente es el que no tiene vigente_hasta.';
comment on column public.motor_modelos.datos is 'El modelo entero (modelo_fv.json): parametros, tramos_factura, inversores, precios, cuadros_ac.';

create index if not exists motor_modelos_vigente on public.motor_modelos (categoria, vigente_desde desc) where vigente_hasta is null;

alter table public.motor_modelos enable row level security;
drop policy if exists motor_modelos_admin on public.motor_modelos;
create policy motor_modelos_admin on public.motor_modelos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

alter table public.presupuestos add column if not exists modelo_id uuid references public.motor_modelos(id);
comment on column public.presupuestos.modelo_id is 'Con qué modelo cerrado (motor_modelos) se calculó; null = solo reglas.';

commit;

-- COMPROBACIÓN (después de pegar también etapa74b):
--   select categoria, version, vigente_desde, vigente_hasta, jsonb_array_length(datos->'inversores') as inversores,
--          (select count(*) from jsonb_object_keys(datos->'precios')) as precios
--     from public.motor_modelos order by categoria, vigente_desde desc;
