-- =============================================================================
-- Sysefen · Etapa 54 · Ayuda externa en el parte de trabajo (peón, oficial)
--
-- POR QUÉ:
--   A veces en una obra ayuda gente que no es de plantilla (un peón o un
--   oficial de albañilería). Hasta ahora se escribían en «Trabajos realizados»
--   sin poder decir cuántas horas echaron, porque el parte solo admitía
--   empleados. Y crear un empleado para eso es un disparate.
--
-- QUÉ CAMBIA:
--   El parte lleva, además de las horas por empleado (parte_horas), las horas
--   de hasta cuatro ayudantes externos sin ficha: Peón, Oficial, Peón 2 y
--   Oficial 2. Van en el propio parte, en JSON, con el rol y las horas:
--     {"peon": 8, "oficial": 4}
--   Salen en el PDF y suman en el total del parte. NO son fichajes ni
--   imputaciones: no entran en las horas de nadie ni en las planillas.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.partes add column if not exists horas_externas jsonb not null default '{}'::jsonb;

comment on column public.partes.horas_externas is
  'Horas de ayuda externa sin ficha de empleado, por rol: {"peon": 8, "oficial": 4, "peon2": 0, "oficial2": 0}. Solo informativo en el parte.';

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select fecha, horas_externas from public.partes where horas_externas <> '{}' order by fecha desc limit 10;
-- =============================================================================
