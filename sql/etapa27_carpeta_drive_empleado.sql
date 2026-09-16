-- =============================================================================
-- Sysefen · Etapa 27 · Una carpeta de Drive por empleado
--
-- QUÉ RESUELVE:
--   Las planillas iban todas a la misma carpeta. Ahora cada empleado tiene la
--   suya dentro de esa carpeta, y sus planillas se guardan como 2026-09.pdf,
--   2026-10.pdf…
--
-- QUÉ SE AÑADE:
--   `empleados.drive_carpeta_id`: el identificador de su carpeta en Drive. Lo
--   rellena la función `planilla-drive` la primera vez que esa persona firma,
--   para no tener que buscarla en cada subida ni crear duplicados. Si alguien
--   borra la carpeta en Drive, la función crea otra y actualiza este dato.
--
-- No toca ningún dato existente. Idempotente. Requiere etapa13.
-- =============================================================================

begin;

alter table public.empleados add column if not exists drive_carpeta_id text;

comment on column public.empleados.drive_carpeta_id is
  'Carpeta de Google Drive de esa persona, dentro de la carpeta de planillas. La crea y mantiene la función planilla-drive.';

commit;

-- Comprobación rápida (opcional):
--   select nombre, drive_carpeta_id from public.empleados order by nombre;
--
-- Para forzar que se cree de nuevo la carpeta de alguien (por ejemplo, si la
-- moviste de sitio en Drive):
--   update public.empleados set drive_carpeta_id = null where nombre = 'Ale';
