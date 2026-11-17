-- =============================================================================
-- Sysefen · etapa 113 · El tema (claro u oscuro) de cada usuario (17-11-2026)
--
-- Enzo: «en ajustes de cada usuario que permita cambiar el tema oscuro a claro,
-- que es lo predeterminado ahora».
--
-- QUÉ HACE
--   · empleados.tema: 'claro', 'oscuro' o 'auto' (como tenga puesto el aparato).
--     Vacío = claro, que es como estaba la app.
--   · guardar_mi_tema(p_tema): cada uno cambia SOLO el suyo. Va por función, como
--     el avatar (etapa 16), para no abrir el update de la tabla de empleados.
--
-- Se puede ejecutar varias veces.
-- =============================================================================

alter table public.empleados add column if not exists tema text;
alter table public.empleados drop constraint if exists empleados_tema_vale;
alter table public.empleados add constraint empleados_tema_vale check (tema is null or tema in ('claro', 'oscuro', 'auto'));
comment on column public.empleados.tema is 'Aspecto de la app que eligió la persona: claro, oscuro o auto. Vacío = claro.';

create or replace function public.guardar_mi_tema(p_tema text)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  if public.empleado_id_actual() is null then
    raise exception 'No hay sesión.';
  end if;
  if p_tema is null or p_tema not in ('claro', 'oscuro', 'auto') then
    raise exception 'Ese tema no vale.';
  end if;
  update public.empleados set tema = p_tema where id = public.empleado_id_actual();
end $func$;

revoke all on function public.guardar_mi_tema(text) from public, anon;
grant execute on function public.guardar_mi_tema(text) to authenticated;
