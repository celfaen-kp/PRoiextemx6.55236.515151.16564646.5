-- =============================================================================
-- Sysefen · Etapa 29 · Presupuestos en Google Drive + hoja única de clientes
--
-- QUÉ SE MONTA:
--   1. Cada CLIENTE que se da de alta en la agenda tiene su carpeta en Drive,
--      dentro de la carpeta de clientes. Se crea sola al guardarlo.
--   2. Cada CLIENTE se escribe también en una hoja de cálculo única
--      ("Clientes Sysefen"), una fila por cliente. Si luego se corrige un dato,
--      se corrige su fila: no se añade otra.
--   3. Cada VISITA (toma de datos) sube su PDF y sus fotos a Drive, dentro de
--      la carpeta de visitas, en una carpeta por cliente.
--
-- QUÉ SE AÑADE:
--   clientes_cache.drive_carpeta_id    su carpeta en la carpeta de CLIENTES
--   clientes_cache.drive_visitas_id    su carpeta en la carpeta de VISITAS
--   clientes_cache.hoja_fila           en qué fila está en la hoja de cálculo
--   clientes_cache.drive_at            cuándo se sincronizó por última vez
--   visitas.drive_id / drive_at        el PDF subido y cuándo
--   visitas.drive_carpeta_id           la carpeta de esa visita
--   visita_adjuntos.drive_id           cada foto, ya subida o no
--   public.ajustes                     dos datos sueltos del sistema, como el
--                                      id de la hoja de clientes
--
-- SECRETOS NUEVOS en Supabase → Edge Functions → Secrets:
--   DRIVE_CARPETA_CLIENTES = 19lKArVVEkTGDRKM61OBuJeTTNTNexWWI
--   DRIVE_CARPETA_VISITAS  = 1Km1pTbDe8OU7o_uwNIe1K-_0qCia-IB5
--
-- En Google Cloud hay que activar además la API de Google Sheets.
--
-- No toca ningún dato existente. Idempotente.
-- =============================================================================

begin;

alter table public.clientes_cache add column if not exists drive_carpeta_id text;
alter table public.clientes_cache add column if not exists drive_visitas_id text;
alter table public.clientes_cache add column if not exists hoja_fila        int;
alter table public.clientes_cache add column if not exists drive_at         timestamptz;

alter table public.visitas add column if not exists drive_id         text;
alter table public.visitas add column if not exists drive_at         timestamptz;
alter table public.visitas add column if not exists drive_carpeta_id text;

-- Cada foto recuerda si ya está en Drive, para no subirla dos veces si la
-- visita se vuelve a copiar.
alter table public.visita_adjuntos add column if not exists drive_id text;

comment on column public.clientes_cache.drive_carpeta_id is
  'Carpeta del cliente en la carpeta de CLIENTES de Drive. La crea cliente-drive.';
comment on column public.clientes_cache.drive_visitas_id is
  'Carpeta del cliente en la carpeta de VISITAS de Drive. La crea visita-drive.';
comment on column public.clientes_cache.hoja_fila is
  'Fila de ese cliente en la hoja única de clientes. Null = todavía no está.';
comment on column public.visitas.drive_id is
  'Id del PDF de la visita en Google Drive. Null = todavía no se ha subido.';

-- ---------------------------------------------------------------------------
-- Ajustes: pares clave/valor del sistema. Hoy solo guarda el id de la hoja de
-- clientes, para no crear una hoja nueva cada vez.
-- ---------------------------------------------------------------------------
create table if not exists public.ajustes (
  clave      text primary key,
  valor      text,
  updated_at timestamptz not null default now()
);

alter table public.ajustes enable row level security;

-- Leer: cualquiera con sesión. Escribir: solo el backend (service role), que
-- se salta RLS. Así nadie puede cambiar a mano a qué hoja se escribe.
drop policy if exists ajustes_select on public.ajustes;
create policy ajustes_select on public.ajustes
  for select to authenticated using (true);

commit;

-- Comprobación rápida (opcional):
--   select nombre, drive_carpeta_id, hoja_fila from public.clientes_cache order by nombre;
--   select codigo, drive_id, drive_at from public.visitas order by created_at desc limit 5;
--   select * from public.ajustes;
--
-- Para que un cliente se vuelva a crear su carpeta (si la moviste en Drive):
--   update public.clientes_cache set drive_carpeta_id = null where nombre = 'Fulano';
--
-- Para rehacer la hoja de clientes desde cero (crea otra y reescribe filas):
--   delete from public.ajustes where clave = 'drive_hoja_clientes';
--   update public.clientes_cache set hoja_fila = null;
