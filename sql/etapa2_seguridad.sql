-- =============================================================================
-- Sysefen · Etapa 2 · Seguridad (RLS, funciones, vínculo Auth <-> empleados)
-- =============================================================================
-- Ejecutar en:  Supabase -> SQL Editor  (proyecto pcftuxqgzeacladtmaqx)
--
-- Este script es IDEMPOTENTE y NO DESTRUCTIVO:
--   * No borra ni recrea tablas.
--   * No borra datos.
--   * Solo añade columnas/índices/funciones/políticas SI NO EXISTEN.
--   * Se puede volver a ejecutar sin romper nada.
--
-- NO guarda PIN en ningún sitio. El PIN vive solo en el cliente durante el login.
-- Las contraseñas internas de Supabase Auth (….sysefen) se crean aparte
-- (ver SECCIÓN 7) y nunca se guardan en tablas.
--
-- Supuestos de nomenclatura (snake_case). Si en tu proyecto difieren, ajusta
-- los nombres marcados con  --<< AJUSTAR  y vuelve a ejecutar.
-- =============================================================================


-- =============================================================================
-- SECCIÓN 0 · DIAGNÓSTICO  (opcional: ejecuta SOLO estas líneas y revisa)
-- -----------------------------------------------------------------------------
-- Descomenta y ejecuta para ver el esquema real antes de aplicar el resto.
--
-- select table_name, column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name in ('empleados','obras','obra_empleados','fichajes',
--                       'partes','parte_horas','parte_materiales','incidencias')
--  order by table_name, ordinal_position;
--
-- select relname as tabla, relrowsecurity as rls_activo
--   from pg_class where relnamespace = 'public'::regnamespace
--    and relname in ('empleados','obras','obra_empleados','fichajes',
--                    'partes','parte_horas','parte_materiales','incidencias');
-- =============================================================================


begin;

-- =============================================================================
-- SECCIÓN 1 · COLUMNAS MÍNIMAS (solo si no existen)
-- =============================================================================

-- 1.1 empleados.user_id -> vínculo con auth.users
--     Preferencia pedida: reutilizar el UUID de auth.users como empleados.id.
--     No se hace porque las filas de empleados YA existen y otras tablas
--     (obra_empleados, fichajes, partes...) referencian esos id. Cambiar la PK
--     rompería esas FK. En su lugar se añade user_id (1:1 con auth.users).
alter table public.empleados
  add column if not exists user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'empleados_user_id_key'
  ) then
    alter table public.empleados
      add constraint empleados_user_id_key unique (user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'empleados_user_id_fkey'
  ) then
    alter table public.empleados
      add constraint empleados_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- 1.2 empleados.email -> email interno (….sysefen). Útil para el vínculo y el
--     panel de admin. NO es el PIN.
alter table public.empleados
  add column if not exists email text;

-- 1.3 empleados.id con default uuid si fuese uuid sin default
--     (para poder crear empleados nuevos desde el trigger de Auth).
do $$
declare
  tipo text;
  tiene_default boolean;
begin
  select data_type, column_default is not null
    into tipo, tiene_default
    from information_schema.columns
   where table_schema='public' and table_name='empleados' and column_name='id';

  if tipo = 'uuid' and not tiene_default then
    alter table public.empleados alter column id set default gen_random_uuid();
  end if;
end $$;

-- 1.4 fichajes: columnas de hora del servidor (solo si faltan)
--     --<< AJUSTAR si tus columnas se llaman distinto a entrada/salida
alter table public.fichajes
  add column if not exists entrada timestamptz;
alter table public.fichajes
  add column if not exists salida  timestamptz;

alter table public.fichajes
  alter column entrada set default now();


-- =============================================================================
-- SECCIÓN 2 · HORA DEL SERVIDOR EN FICHAJES (trigger)
-- =============================================================================
-- Fuerza que la hora de entrada/salida la ponga PostgreSQL, ignorando la que
-- mande el cliente. Evita fichajes con hora manipulada o con reloj del móvil mal.

create or replace function public.fichajes_hora_servidor()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    new.entrada := now();
    -- una entrada nueva siempre nace abierta
    new.salida := null;

  elsif (tg_op = 'UPDATE') then
    -- la entrada no se puede reescribir nunca
    new.entrada := old.entrada;

    -- un operario no puede reasignar el fichaje a otro empleado ni a otra obra
    -- (evita saltarse fichajes_insert / la pertenencia a obra). Jefe/admin sí.
    if not public.es_jefe() then
      new.empleado_id := old.empleado_id;
      new.obra_id     := old.obra_id;
    end if;

    -- al cerrar (salida pasa de null a algo) se sella con la hora del servidor
    if (old.salida is null and new.salida is not null) then
      new.salida := now();
    -- no se permite reabrir ni reescribir un fichaje ya cerrado
    elsif (old.salida is not null) then
      new.salida := old.salida;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_fichajes_hora_servidor on public.fichajes;
create trigger trg_fichajes_hora_servidor
  before insert or update on public.fichajes
  for each row execute function public.fichajes_hora_servidor();


-- =============================================================================
-- SECCIÓN 3 · UN SOLO FICHAJE ABIERTO POR EMPLEADO
-- =============================================================================
-- Aviso claro si ya hubiera datos que impiden crear el índice (no borra nada).
do $$
declare n int;
begin
  select count(*) into n from (
    select empleado_id
      from public.fichajes
     where salida is null
     group by empleado_id
    having count(*) > 1
  ) d;
  if n > 0 then
    raise exception
      'Hay % empleado(s) con más de un fichaje abierto. Ciérralos primero: %',
      n, 'select empleado_id, count(*) from fichajes where salida is null group by 1 having count(*)>1';
  end if;
end $$;

-- Índice único parcial: como mucho una fila con salida NULL por empleado.
--   --<< AJUSTAR  'empleado_id' si tu columna se llama distinto
create unique index if not exists fichajes_un_abierto_por_empleado
  on public.fichajes (empleado_id)
  where (salida is null);


-- =============================================================================
-- SECCIÓN 4 · FUNCIONES SECURITY DEFINER (sin recursión RLS)
-- =============================================================================
-- Se ejecutan como owner y con search_path fijo => leen empleados/obra_empleados
-- SALTÁNDOSE RLS. Así las políticas pueden llamarlas sin recursión infinita.

create or replace function public.empleado_id_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
    from public.empleados e
   where e.user_id = auth.uid()
   limit 1
$$;

create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select e.rol
    from public.empleados e
   where e.user_id = auth.uid()
   limit 1
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() = 'admin', false)
$$;

create or replace function public.es_jefe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rol_actual() in ('jefe','admin'), false)
$$;

-- ¿el empleado actual pertenece a esa obra? (jefe/admin siempre true)
--   --<< AJUSTAR  obra_empleados(obra_id, empleado_id) si difieren
create or replace function public.pertenece_a_obra(p_obra uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_jefe()
      or exists (
        select 1
          from public.obra_empleados oe
         where oe.obra_id = p_obra
           and oe.empleado_id = public.empleado_id_actual()
      )
$$;

-- Permisos de ejecución para usuarios autenticados
grant execute on function
  public.empleado_id_actual(),
  public.rol_actual(),
  public.es_admin(),
  public.es_jefe(),
  public.pertenece_a_obra(uuid)
to authenticated;


-- =============================================================================
-- SECCIÓN 4b · BLINDAJE ANTI-ESCALADA EN `empleados` (trigger)
-- =============================================================================
-- Segunda barrera además de la política empleados_update (que es admin-only).
-- Aunque en el futuro se relaje esa política para permitir, p. ej., que alguien
-- edite su propio nombre, NADIE que no sea admin podrá tocar los campos de
-- autorización: rol, activo, user_id, email.
--   auth.uid() nulo = contexto de confianza (GoTrue al crear el usuario,
--   trigger de sincronización, migraciones) -> no se restringe.

create or replace function public.empleados_bloquea_escalada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.es_admin() then
    return new;
  end if;

  if new.rol     is distinct from old.rol
  or new.activo  is distinct from old.activo
  or new.user_id is distinct from old.user_id
  or new.email   is distinct from old.email then
    raise exception 'No autorizado: rol/activo/user_id/email solo los cambia un admin';
  end if;

  return new;
end $$;

drop trigger if exists trg_empleados_bloquea_escalada on public.empleados;
create trigger trg_empleados_bloquea_escalada
  before update on public.empleados
  for each row execute function public.empleados_bloquea_escalada();


-- =============================================================================
-- SECCIÓN 5 · POLÍTICAS RLS EXPLÍCITAS POR OPERACIÓN
-- =============================================================================
-- RLS ya está activado en estas tablas. Aquí solo se (re)crean políticas.
-- Se hace DROP + CREATE para que el script sea repetible.

-- Asegura RLS activado (no-op si ya lo está)
alter table public.empleados        enable row level security;
alter table public.obras            enable row level security;
alter table public.obra_empleados   enable row level security;
alter table public.fichajes         enable row level security;
alter table public.partes           enable row level security;
alter table public.parte_horas      enable row level security;
alter table public.parte_materiales enable row level security;
alter table public.incidencias      enable row level security;

-- ---------- empleados ----------
drop policy if exists empleados_select    on public.empleados;
drop policy if exists empleados_insert    on public.empleados;
drop policy if exists empleados_update    on public.empleados;
drop policy if exists empleados_delete    on public.empleados;

-- todo el equipo autenticado puede ver la lista de empleados (nombres, rol)
create policy empleados_select on public.empleados
  for select to authenticated
  using (true);

-- solo admin da de alta empleados
create policy empleados_insert on public.empleados
  for insert to authenticated
  with check (public.es_admin());

-- SOLO admin modifica empleados. Un operario/jefe NO puede editar su fila
-- (ni su rol, ni activo, ni user_id). Si en el futuro hace falta permitir una
-- edición concreta (p. ej. el nombre), se ampliará esta política y la
-- SECCIÓN 4b seguirá impidiendo tocar los campos de autorización.
create policy empleados_update on public.empleados
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- solo admin borra
create policy empleados_delete on public.empleados
  for delete to authenticated
  using (public.es_admin());

-- ---------- obras ----------
drop policy if exists obras_select on public.obras;
drop policy if exists obras_insert on public.obras;
drop policy if exists obras_update on public.obras;
drop policy if exists obras_delete on public.obras;

create policy obras_select on public.obras
  for select to authenticated
  using (public.es_jefe() or public.pertenece_a_obra(id));

create policy obras_insert on public.obras
  for insert to authenticated
  with check (public.es_jefe());

create policy obras_update on public.obras
  for update to authenticated
  using (public.es_jefe())
  with check (public.es_jefe());

create policy obras_delete on public.obras
  for delete to authenticated
  using (public.es_admin());

-- ---------- obra_empleados ----------
drop policy if exists obra_empleados_select on public.obra_empleados;
drop policy if exists obra_empleados_insert on public.obra_empleados;
drop policy if exists obra_empleados_update on public.obra_empleados;
drop policy if exists obra_empleados_delete on public.obra_empleados;

-- el operario ve su propia asignación y la de sus compañeros en obras suyas
create policy obra_empleados_select on public.obra_empleados
  for select to authenticated
  using (
    public.es_jefe()
    or empleado_id = public.empleado_id_actual()
    or public.pertenece_a_obra(obra_id)
  );

create policy obra_empleados_insert on public.obra_empleados
  for insert to authenticated
  with check (public.es_jefe());

create policy obra_empleados_update on public.obra_empleados
  for update to authenticated
  using (public.es_jefe())
  with check (public.es_jefe());

create policy obra_empleados_delete on public.obra_empleados
  for delete to authenticated
  using (public.es_jefe());

-- ---------- fichajes ----------
drop policy if exists fichajes_select on public.fichajes;
drop policy if exists fichajes_insert on public.fichajes;
drop policy if exists fichajes_update on public.fichajes;
drop policy if exists fichajes_delete on public.fichajes;

-- jefe/admin ven todo; el operario ve los suyos
create policy fichajes_select on public.fichajes
  for select to authenticated
  using (public.es_jefe() or empleado_id = public.empleado_id_actual());

-- INSERT:
--   jefe/admin: pueden fichar por cualquiera y en cualquier obra
--   operario:   solo por sí mismo Y en una obra a la que pertenece (obra_empleados)
create policy fichajes_insert on public.fichajes
  for insert to authenticated
  with check (
    public.es_jefe()
    or (
      empleado_id = public.empleado_id_actual()
      and public.pertenece_a_obra(obra_id)
    )
  );

-- UPDATE:
--   operario: solo su propio fichaje (cerrarlo). El trigger de la SECCIÓN 2
--   impide que cambie empleado_id/obra_id y sella la hora en el servidor.
create policy fichajes_update on public.fichajes
  for update to authenticated
  using (public.es_jefe() or empleado_id = public.empleado_id_actual())
  with check (public.es_jefe() or empleado_id = public.empleado_id_actual());

-- solo jefe/admin borran fichajes
create policy fichajes_delete on public.fichajes
  for delete to authenticated
  using (public.es_jefe());

-- ---------- partes ----------
--   --<< AJUSTAR  partes.obra_id si difiere
drop policy if exists partes_select on public.partes;
drop policy if exists partes_insert on public.partes;
drop policy if exists partes_update on public.partes;
drop policy if exists partes_delete on public.partes;

-- El operario de la obra solo LEE los partes. Crear/editar/anular partes es
-- exclusivo de jefe/admin (igual que en la app actual: los partes los firma
-- el jefe de obra).
create policy partes_select on public.partes
  for select to authenticated
  using (public.es_jefe() or public.pertenece_a_obra(obra_id));

create policy partes_insert on public.partes
  for insert to authenticated
  with check (public.es_jefe());

create policy partes_update on public.partes
  for update to authenticated
  using (public.es_jefe())
  with check (public.es_jefe());

create policy partes_delete on public.partes
  for delete to authenticated
  using (public.es_jefe());

-- ---------- parte_horas ----------
--   --<< AJUSTAR  parte_horas.parte_id si difiere
drop policy if exists parte_horas_select on public.parte_horas;
drop policy if exists parte_horas_insert on public.parte_horas;
drop policy if exists parte_horas_update on public.parte_horas;
drop policy if exists parte_horas_delete on public.parte_horas;

create policy parte_horas_select on public.parte_horas
  for select to authenticated
  using (exists (
    select 1 from public.partes p
     where p.id = parte_horas.parte_id
       and (public.es_jefe() or public.pertenece_a_obra(p.obra_id))
  ));

-- escritura de líneas de parte: solo jefe/admin
create policy parte_horas_insert on public.parte_horas
  for insert to authenticated
  with check (public.es_jefe());

create policy parte_horas_update on public.parte_horas
  for update to authenticated
  using (public.es_jefe())
  with check (public.es_jefe());

create policy parte_horas_delete on public.parte_horas
  for delete to authenticated
  using (public.es_jefe());

-- ---------- parte_materiales ----------
--   --<< AJUSTAR  parte_materiales.parte_id si difiere
drop policy if exists parte_materiales_select on public.parte_materiales;
drop policy if exists parte_materiales_insert on public.parte_materiales;
drop policy if exists parte_materiales_update on public.parte_materiales;
drop policy if exists parte_materiales_delete on public.parte_materiales;

create policy parte_materiales_select on public.parte_materiales
  for select to authenticated
  using (exists (
    select 1 from public.partes p
     where p.id = parte_materiales.parte_id
       and (public.es_jefe() or public.pertenece_a_obra(p.obra_id))
  ));

-- escritura de líneas de parte: solo jefe/admin
create policy parte_materiales_insert on public.parte_materiales
  for insert to authenticated
  with check (public.es_jefe());

create policy parte_materiales_update on public.parte_materiales
  for update to authenticated
  using (public.es_jefe())
  with check (public.es_jefe());

create policy parte_materiales_delete on public.parte_materiales
  for delete to authenticated
  using (public.es_jefe());

-- ---------- incidencias ----------
--   --<< AJUSTAR: se asume incidencias.obra_id. Si tu tabla usa parte_id,
--   cambia las 4 políticas para resolver la obra a través de partes.
drop policy if exists incidencias_select on public.incidencias;
drop policy if exists incidencias_insert on public.incidencias;
drop policy if exists incidencias_update on public.incidencias;
drop policy if exists incidencias_delete on public.incidencias;

create policy incidencias_select on public.incidencias
  for select to authenticated
  using (public.es_jefe() or public.pertenece_a_obra(obra_id));

-- un operario puede REPORTAR una incidencia en su obra; editarla/borrarla es
-- solo de jefe/admin
create policy incidencias_insert on public.incidencias
  for insert to authenticated
  with check (public.es_jefe() or public.pertenece_a_obra(obra_id));

create policy incidencias_update on public.incidencias
  for update to authenticated
  using (public.es_jefe())
  with check (public.es_jefe());

create policy incidencias_delete on public.incidencias
  for delete to authenticated
  using (public.es_jefe());


-- =============================================================================
-- SECCIÓN 6 · REALTIME PARA FICHAJES
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'fichajes'
  ) then
    alter publication supabase_realtime add table public.fichajes;
  end if;
end $$;

-- Para que los UPDATE (cierre de fichaje) lleguen completos por Realtime:
alter table public.fichajes replica identity full;


-- =============================================================================
-- SECCIÓN 7 · VÍNCULO auth.users <-> empleados
-- =============================================================================
-- Trigger: cuando se crea un usuario en Auth con un email @sysefen.app conocido,
-- se vincula (o se crea) su fila en empleados. Idempotente.

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
  v_nombre := case lower(new.email)
                when 'bayron@sysefen.app'         then 'Bayron'
                when 'jaime@sysefen.app'          then 'Jaime'
                when 'david@sysefen.app'          then 'David'
                when 'ale@sysefen.app'            then 'Ale'
                when 'administracion@sysefen.app' then 'Administración'
                else null
              end;

  if v_nombre is null then
    return new;  -- email no reconocido: no se toca nada
  end if;

  v_rol := case v_nombre
             when 'Bayron' then 'jefe'
             when 'Jaime'  then 'jefe'
             when 'Administración' then 'admin'
             else 'operario'
           end;

  -- 1) intenta vincular una fila existente por nombre
  update public.empleados
     set user_id = new.id,
         email   = lower(new.email)
   where lower(nombre) = lower(v_nombre)
     and (user_id is null or user_id = new.id);

  -- 2) si no existía, la crea
  if not found then
    insert into public.empleados (nombre, rol, activo, user_id, email)
    values (v_nombre, v_rol, true, new.id, lower(new.email))
    on conflict (user_id) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists trg_sync_empleado_desde_auth on auth.users;
create trigger trg_sync_empleado_desde_auth
  after insert on auth.users
  for each row execute function public.sync_empleado_desde_auth();

-- -----------------------------------------------------------------------------
-- 7.1 · Re-vínculo manual (por si los usuarios de Auth YA existían antes de
--       este trigger). Seguro de ejecutar: no crea nada, solo enlaza.
-- -----------------------------------------------------------------------------
update public.empleados e
   set user_id = u.id,
       email   = lower(u.email)
  from auth.users u
 where e.user_id is null
   and lower(u.email) = case lower(e.nombre)
         when 'bayron'         then 'bayron@sysefen.app'
         when 'jaime'          then 'jaime@sysefen.app'
         when 'david'          then 'david@sysefen.app'
         when 'ale'            then 'ale@sysefen.app'
         when 'administración' then 'administracion@sysefen.app'
         else null
       end;

commit;

-- =============================================================================
-- SECCIÓN 8 · CREAR LOS USUARIOS DE AUTH  (hacerlo UNA VEZ, fuera de este SQL)
-- =============================================================================
-- Opción recomendada: Supabase -> Authentication -> Users -> "Add user"
-- (Add user -> Create new user, marcar "Auto Confirm User").
--
--   bayron@sysefen.app          contraseña: 1111sysefen
--   jaime@sysefen.app           contraseña: 2222sysefen
--   david@sysefen.app           contraseña: 3333sysefen
--   ale@sysefen.app             contraseña: 4444sysefen
--   administracion@sysefen.app  contraseña: 9999sysefen
--
-- Al crearlos, el trigger de la SECCIÓN 7 los vincula solo con `empleados`.
-- Si ya los habías creado antes, la SECCIÓN 7.1 los vincula al ejecutar este
-- script. Comprueba con:
--
--   select nombre, rol, activo, user_id, email from public.empleados order by nombre;
-- =============================================================================
