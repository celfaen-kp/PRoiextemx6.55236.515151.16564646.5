-- =============================================================================
-- Sysefen · Etapa 28 · Los partes firmados suben a Google Drive
--
-- QUÉ SE MONTA:
--   Igual que las planillas, pero por OBRA: dentro de la carpeta de partes de
--   Drive se crea una carpeta con el nombre de la obra, y ahí van sus partes
--   en PDF, con fotos y firma, como "2026-09-16 · P-0007.pdf".
--
-- QUÉ SE AÑADE:
--   `obras.drive_carpeta_id`   la carpeta de esa obra en Drive. La crea y la
--                              recuerda la función `parte-drive`.
--   `partes.drive_id`          el archivo subido, para saber que ya está.
--   `partes.drive_at`          cuándo se subió.
--
-- SECRETO NUEVO en Supabase → Edge Functions → Secrets:
--   DRIVE_CARPETA_PARTES = id de la carpeta de Drive donde van los partes
--
-- No toca ningún dato existente. Idempotente.
-- =============================================================================

begin;

alter table public.obras  add column if not exists drive_carpeta_id text;
alter table public.partes add column if not exists drive_id         text;
alter table public.partes add column if not exists drive_at         timestamptz;

comment on column public.obras.drive_carpeta_id is
  'Carpeta de Google Drive de esa obra, dentro de la carpeta de partes. La crea y mantiene la función parte-drive.';
comment on column public.partes.drive_id is
  'Id del PDF del parte en Google Drive. Null = todavía no se ha subido.';

commit;

-- Comprobación rápida (opcional):
--   select nombre, drive_carpeta_id from public.obras order by nombre;
--   select ref, drive_id, drive_at from public.partes order by creado_en desc limit 5;
--
-- Para que una obra se vuelva a crear su carpeta (si la moviste en Drive):
--   update public.obras set drive_carpeta_id = null where nombre = 'Selva';
