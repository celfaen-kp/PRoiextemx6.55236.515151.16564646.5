-- Sysefen · Etapa 104 · Historial de precios cambiados a mano desde la app (Enzo, 10 nov 2026)
--   «Necesito poder cambiar los precios de la base de datos manualmente.» Desde Ajustes → Precios
--   y desde el propio presupuesto («Guardar en la base de datos») presupuestos y Administración
--   cambian los precios del modelo fotovoltaico (motor_modelos), del catálogo (productos) y de los
--   conceptos de precio fijo de las partidas (partidas_items). Los cambios los escribe la función
--   `presupuestar` (acciones precios_*) con la clave maestra y deja aquí qué había y qué queda,
--   quién y cuándo, para poder deshacerlos. Idempotente.
create table if not exists public.precios_cambios (
  id             uuid primary key default gen_random_uuid(),
  creado_en      timestamptz not null default now(),
  empleado_id    uuid,
  nombre         text,                 -- quién lo cambió
  origen         text not null,        -- 'modelo_fv' | 'producto' | 'concepto'
  clave          text not null,        -- la ruta del modelo, la referencia del producto o el id del concepto
  descripcion    text,                 -- lo que se enseña en el historial
  antes          jsonb,                -- lo que había (lo justo para deshacer)
  despues        jsonb,                -- lo que queda
  desde          text,                 -- 'configuracion' | 'presupuesto'
  presupuesto_id uuid,
  deshecho_en    timestamptz,
  deshecho_por   text
);
comment on table public.precios_cambios is 'Historial de precios cambiados a mano desde la app (modelo FV, catálogo, conceptos de partida). Lo escribe la función presupuestar; se lee para enseñar y deshacer.';
create index if not exists precios_cambios_fecha on public.precios_cambios (creado_en desc);

alter table public.precios_cambios enable row level security;
drop policy if exists precios_cambios_ver on public.precios_cambios;
create policy precios_cambios_ver on public.precios_cambios
  for select to authenticated using (public.es_motor());
-- Sin política de escritura: solo la función, con la clave maestra.

select count(*) as cambios from public.precios_cambios;
