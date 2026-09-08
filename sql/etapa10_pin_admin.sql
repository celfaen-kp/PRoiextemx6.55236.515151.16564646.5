-- =============================================================================
-- Sysefen · Etapa 10 · Administración cambia el PIN de otra persona
--
-- QUÉ RESUELVE:
--   Cada uno puede cambiarse su PIN desde la app, pero eso exige saber el
--   anterior. Cuando alguien lo olvida hace falta que Administración se lo
--   ponga de nuevo SIN conocer el viejo. Con la clave pública Supabase no deja
--   tocar la contraseña de otro, así que hace falta algo del lado del servidor.
--
-- HAY DOS CAMINOS Y LOS DOS VALEN:
--   A) La Edge Function `admin-usuarios` (supabase/functions/...). Es la vía
--      oficial y además crea accesos nuevos, pero hay que desplegarla.
--   B) Esto: una función SQL. Se pega aquí y funciona al instante, sin
--      desplegar nada. Solo cambia PINes de gente que YA tiene acceso.
--   La app prueba B y, si no está, prueba A; si no hay ninguna, enseña los
--   pasos para hacerlo a mano en el panel.
--
-- POR QUÉ ES SEGURA:
--   - `security definer`: se ejecuta con permisos del dueño, pero lo primero
--     que hace es comprobar `es_admin()`. Un operario que la llame se lleva un
--     error, aunque tenga sesión válida.
--   - `search_path` fijo: no se le puede colar otra tabla `empleados`.
--   - EXECUTE revocado a todo el mundo menos a `authenticated`.
--   - No devuelve ni acepta la contraseña actual: solo escribe la nueva.
--
-- LETRA PEQUEÑA:
--   Escribe en `auth.users`, que es esquema interno de Supabase. Es un patrón
--   conocido y estable (GoTrue guarda un bcrypt normal ahí), pero si algún día
--   Supabase cambiara el cifrado esto dejaría de servir. Se notaría al momento:
--   la persona no podría entrar con el PIN nuevo. La salida entonces es
--   desplegar la Edge Function, que usa la API oficial.
--
-- Idempotente. No toca ningún dato existente.
-- =============================================================================

begin;

-- pgcrypto da crypt()/gen_salt(). En Supabase suele vivir en el esquema
-- `extensions`, pero se llaman sin cualificar y se resuelven por el
-- search_path fijo de la función, así que da igual dónde esté instalado.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_cambiar_pin(p_empleado uuid, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user   uuid;
  v_nombre text;
  v_hash   text;
begin
  if not public.es_admin() then
    raise exception 'Solo Administración puede cambiar el PIN de otra persona.';
  end if;

  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'El PIN son 4 números.';
  end if;

  select e.user_id, e.nombre into v_user, v_nombre
    from public.empleados e
   where e.id = p_empleado;

  if not found then
    raise exception 'Ese empleado no existe.';
  end if;
  if v_user is null then
    raise exception 'Esa persona todavía no tiene acceso creado. Créaselo primero.';
  end if;

  -- La contraseña real es <PIN>sysefen, igual que en supabase-auth.js.
  v_hash := crypt(p_pin || 'sysefen', gen_salt('bf'));

  -- Comprobación de seguridad antes de escribir: si el hash no se validara a
  -- sí mismo, dejaríamos a la persona sin poder entrar.
  if crypt(p_pin || 'sysefen', v_hash) <> v_hash then
    raise exception 'No se pudo cifrar el PIN. No se ha cambiado nada.';
  end if;

  update auth.users
     set encrypted_password = v_hash,
         updated_at         = now()
   where id = v_user;

  return v_nombre;
end $$;

-- Que no la pueda llamar cualquiera desde fuera.
revoke all on function public.admin_cambiar_pin(uuid, text) from public;
revoke all on function public.admin_cambiar_pin(uuid, text) from anon;
grant execute on function public.admin_cambiar_pin(uuid, text) to authenticated;

commit;

-- Comprobación rápida (opcional), desde el SQL Editor:
--   select proname, prosecdef from pg_proc where proname = 'admin_cambiar_pin';
-- Y la de verdad: cambia un PIN desde la app y entra con él.
