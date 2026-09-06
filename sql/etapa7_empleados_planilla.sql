-- =============================================================================
-- Sysefen · Etapa 7 · Empleados (perfil) + disponibilidad de imputación
-- =============================================================================
-- Ejecutar en: Supabase -> SQL Editor
--   (después de etapa2, etapa4, etapa_imputaciones, etapa5, etapa6)
--
-- Qué hace:
--   1. Añade a `empleados` las columnas de perfil que faltan (teléfono, fecha_baja).
--   2. Nueva función `disponible_imputar_minutos(empleado, fecha)` =
--      presencia CERRADA del día redondeada HACIA ABAJO a bloques de 15 min.
--      Es la "disponibilidad para imputar" (tolerancia). NO toca el fichaje real.
--   3. El trigger que impide sobre-imputar pasa a comparar contra esa
--      disponibilidad (antes usaba los minutos exactos).
--   4. Generaliza el vínculo auth.users <-> empleados: un usuario de Auth nuevo
--      se enlaza a su fila de `empleados` por email (para altas hechas desde la
--      propia app). Se mantiene el caso especial de los 5 iniciales.
--
-- Idempotente y NO destructivo. No borra tablas ni datos. No toca obra_empleados.
-- La RLS de `empleados` (insert/update solo admin) ya está en etapa2: no cambia.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Columnas de perfil en `empleados`  (solo si no existen)
-- ---------------------------------------------------------------------------
alter table public.empleados add column if not exists telefono   text;
alter table public.empleados add column if not exists fecha_baja  date;
-- `creado_en` (ya existe) se usa como fecha de alta.
-- `activo` (ya existe, boolean) marca empleado activo/inactivo.

-- ---------------------------------------------------------------------------
-- 2 · Disponibilidad para imputar = presencia cerrada redondeada a 15 min ↓
-- ---------------------------------------------------------------------------
create or replace function public.disponible_imputar_minutos(p_empleado uuid, p_fecha date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  -- floor a 15 min de la presencia cerrada real
  select (public.presencia_minutos_dia(p_empleado, p_fecha) / 15) * 15
$$;

grant execute on function public.disponible_imputar_minutos(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · Trigger: no imputar más que la DISPONIBILIDAD (no los minutos exactos)
-- ---------------------------------------------------------------------------
create or replace function public.imputaciones_no_superar_presencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disp  int;
  v_total int;
begin
  v_disp := public.disponible_imputar_minutos(new.empleado_id, new.fecha);

  if v_disp <= 0 then
    raise exception 'No hay jornada fichada y cerrada para ese empleado el %; no se puede imputar.', new.fecha;
  end if;

  select coalesce(sum(minutos), 0) into v_total
    from public.imputaciones
   where empleado_id = new.empleado_id
     and fecha = new.fecha
     and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_total := v_total + coalesce(new.minutos, 0);

  if v_total > v_disp then
    raise exception 'La imputación total (% min) supera la disponibilidad del día (% min).', v_total, v_disp;
  end if;

  return new;
end $$;

drop trigger if exists trg_imputaciones_no_superar_presencia on public.imputaciones;
create trigger trg_imputaciones_no_superar_presencia
  before insert or update on public.imputaciones
  for each row execute function public.imputaciones_no_superar_presencia();

-- ---------------------------------------------------------------------------
-- 4 · Vínculo auth.users <-> empleados: generalizado por email
-- ---------------------------------------------------------------------------
create or replace function public.sync_empleado_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_rol    text;
begin
  -- (a) casos iniciales por email conocido (rol fijo)
  v_nombre := case lower(new.email)
                when 'bayron@sysefen.app'         then 'Bayron'
                when 'jaime@sysefen.app'          then 'Jaime'
                when 'david@sysefen.app'          then 'David'
                when 'ale@sysefen.app'            then 'Ale'
                when 'administracion@sysefen.app' then 'Administración'
                else null
              end;

  if v_nombre is not null then
    v_rol := case v_nombre
               when 'Bayron' then 'jefe'
               when 'Jaime'  then 'jefe'
               when 'Administración' then 'admin'
               else 'operario'
             end;
    update public.empleados
       set user_id = new.id, email = lower(new.email)
     where lower(nombre) = lower(v_nombre)
       and (user_id is null or user_id = new.id);
    if not found then
      insert into public.empleados (nombre, rol, activo, user_id, email)
      values (v_nombre, v_rol, true, new.id, lower(new.email))
      on conflict (user_id) do nothing;
    end if;
    return new;
  end if;

  -- (b) alta desde la app: ya existe una fila de empleados con ese email
  --     (creada por Administración). Solo se vincula el user_id.
  update public.empleados
     set user_id = new.id
   where lower(email) = lower(new.email)
     and user_id is null;

  return new;
end $$;

drop trigger if exists trg_sync_empleado_desde_auth on auth.users;
create trigger trg_sync_empleado_desde_auth
  after insert on auth.users
  for each row execute function public.sync_empleado_desde_auth();

commit;

-- =============================================================================
-- NOTA · ALTA DE ACCESO PARA UN EMPLEADO NUEVO  (acción administrativa segura)
-- =============================================================================
-- La app crea el PERFIL del empleado (fila en public.empleados) con su email.
-- Para darle ACCESO (poder iniciar sesión) hay que crear su usuario de Auth.
-- Eso NO se puede hacer de forma segura desde el frontend (requiere service_role).
--
-- Opción A (manual, ahora): Supabase -> Authentication -> Users -> Add user
--   email:    <el mismo email del perfil, p. ej. carlos@sysefen.app>
--   password: <PIN de 4 cifras>sysefen     (p. ej. 5678sysefen)
--   Marca "Auto Confirm User".
--   El trigger de la SECCIÓN 4 vincula automáticamente user_id <-> empleados.
--
-- Opción B (futuro, automatizable): una Supabase Edge Function con service_role
--   que reciba {email, pin, rol} de un admin autenticado, valide el rol admin,
--   llame a supabase.auth.admin.createUser(...) y devuelva el resultado.
--   El frontend NUNCA ve la service_role key. (No incluida en esta etapa.)
-- =============================================================================
