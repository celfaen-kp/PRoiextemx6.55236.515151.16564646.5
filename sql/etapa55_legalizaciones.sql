-- =============================================================================
-- Sysefen · Etapa 55 · Legalización fotovoltaica (Modelo 034 + certificado CAIB)
--
-- QUÉ RESUELVE:
--   Al acabar una instalación fotovoltaica hay que legalizarla en Industria
--   (Modelo 034 de la CAIB) y adjuntar el «Annex de proves de verificació»
--   (RD 1699/2011 · UNE 50160). Hasta ahora esos datos se pasaban en un Excel
--   y el certificado se rellenaba a mano. Ahora:
--     · la app tiene una pantalla de legalización por obra, con todos los
--       datos del Modelo 034 y, opcionalmente, las medidas de la verificación;
--     · genera el certificado oficial rellenado y una hoja de datos del 034,
--       los dos en PDF, los sube a Drive (08-Legalizaciones / <obra>) y se los
--       manda por correo a quien lleva las legalizaciones en la oficina.
--
-- QUÉ SE AÑADE:
--   · empresa: los datos fijos de la empresa instaladora (razón social, nº de
--     instalador autorizado, nombre y NIF del instalador, aparato verificador)
--     y el correo de legalizaciones. Los pone Administración en Ajustes.
--   · legalizaciones: una fila por legalización, con sus datos en JSON (el
--     formulario cambia; no hace falta una columna por casilla), su estado y
--     dónde quedaron los PDF.
--
-- Requiere la etapa 50 (tabla empresa). Idempotente.
-- =============================================================================

begin;

-- 1 · Los datos fijos del instalador y el correo de legalizaciones ----------------
alter table public.empresa add column if not exists instalador_razon_social text not null default '';
alter table public.empresa add column if not exists instalador_numero       text not null default '';   -- nº de instalador autorizado
alter table public.empresa add column if not exists instalador_nombre       text not null default '';
alter table public.empresa add column if not exists instalador_nif          text not null default '';
alter table public.empresa add column if not exists instalador_direccion    text not null default '';
alter table public.empresa add column if not exists instalador_cp_localidad text not null default '';
alter table public.empresa add column if not exists instalador_telefono     text not null default '';
alter table public.empresa add column if not exists aparato_verificador     text not null default '';   -- marca, modelo y nº de serie
alter table public.empresa add column if not exists email_legalizaciones    text not null default '';

-- 2 · Las legalizaciones -----------------------------------------------------------
create table if not exists public.legalizaciones (
  id             uuid primary key default gen_random_uuid(),
  obra_id        uuid references public.obras(id) on delete set null,
  cliente_id     uuid references public.clientes_cache(id) on delete set null,
  autor_id       uuid references public.empleados(id) on delete set null,
  estado         text not null default 'borrador' check (estado in ('borrador', 'enviada')),
  -- Todo el formulario: cliente, instalación de producción, receptora, FV,
  -- previsión anual y las medidas de la verificación. Claves en
  -- index.html (LEGAL_CAMPOS).
  datos          jsonb not null default '{}'::jsonb,
  drive_carpeta_id    text,
  drive_cert_id       text,
  drive_datos_id      text,
  enviada_a      text,
  enviada_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists legalizaciones_obra_idx on public.legalizaciones (obra_id);

alter table public.legalizaciones enable row level security;
drop policy if exists legalizaciones_comercial on public.legalizaciones;
-- Jefes, presupuestos y Administración: todas. Los operarios no las ven.
create policy legalizaciones_comercial on public.legalizaciones
  for all to authenticated
  using (public.es_comercial()) with check (public.es_comercial());

drop trigger if exists legalizaciones_updated_at on public.legalizaciones;
create trigger legalizaciones_updated_at before update on public.legalizaciones
  for each row execute function public.tocar_updated_at();

commit;

-- =============================================================================
-- DESPUÉS, EN SUPABASE → Edge Functions → Secrets:
--   DRIVE_CARPETA_LEGALIZACIONES   el id de la carpeta «08-Legalizaciones» de
--                                  Drive (lo que va detrás de /folders/ en su URL).
-- Y en la app, Ajustes (Administración): los datos del instalador y el correo
-- de legalizaciones.
--
-- COMPROBACIONES
--   select instalador_razon_social, instalador_numero, email_legalizaciones from public.empresa;
--   select estado, datos->>'cliente_nombre', enviada_at from public.legalizaciones order by created_at desc;
-- =============================================================================
