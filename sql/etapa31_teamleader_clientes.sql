-- =============================================================================
-- Sysefen · Etapa 31 · Los clientes de presupuestos van a Teamleader
--
-- QUÉ SE MONTA:
--   Cuando Ramón da de alta un cliente en la agenda, se crea también en
--   Teamleader: como CONTACTO si es un particular, o como EMPRESA si es una
--   empresa o una comunidad. El id que devuelve el CRM se guarda en
--   `clientes_cache.tl_id`, así que el cliente queda enlazado y no se duplica.
--
--   Antes de crearlo se busca en el CRM por email y por nombre: si ya está, se
--   engancha al que hay en vez de crear otro.
--
-- QUÉ SE AÑADE:
--   clientes_cache.tl_error   por qué no pudo subir la última vez
--   clientes_cache.tl_at      cuándo se enlazó con el CRM
--   (tl_id, tl_tipo, pendiente_alta y sincronizado_at ya venían de la etapa 20)
--
-- LOS PERMISOS DEL CRM viven en `tl_oauth` (etapa 20), que tiene RLS y ninguna
-- política: solo el backend llega ahí. Nadie los ve desde la app ni desde el
-- navegador. Teamleader además rota el permiso en cada uso, por eso se guarda
-- en la base y no como secreto fijo.
--
-- SECRETOS NUEVOS en Supabase → Edge Functions → Secrets:
--   TEAMLEADER_CLIENT_ID       de la integración del Marketplace de Teamleader
--   TEAMLEADER_CLIENT_SECRET   idem. No lo pegues en ningún chat.
--
-- No toca ningún dato existente. Idempotente.
-- =============================================================================

begin;

alter table public.clientes_cache add column if not exists tl_error text;
alter table public.clientes_cache add column if not exists tl_at    timestamptz;

comment on column public.clientes_cache.tl_id is
  'Id del contacto o la empresa en Teamleader. Null = todavía no está en el CRM.';
comment on column public.clientes_cache.tl_error is
  'Por qué falló el último intento de subirlo al CRM. Null = sin problemas.';

-- Por si la etapa 29 no llegó a ejecutarse: aquí también se guarda un dato
-- suelto, el `state` de la conexión con Teamleader mientras dura el permiso.
create table if not exists public.ajustes (
  clave      text primary key,
  valor      text,
  updated_at timestamptz not null default now()
);
alter table public.ajustes enable row level security;
drop policy if exists ajustes_select on public.ajustes;
create policy ajustes_select on public.ajustes
  for select to authenticated using (true);

-- El `state` de la conexión no lo puede leer nadie desde la app: con él se
-- podría intentar colar una autorización ajena.
drop policy if exists ajustes_select on public.ajustes;
create policy ajustes_select on public.ajustes
  for select to authenticated using (clave <> 'tl_oauth_state');

commit;

-- Comprobación rápida (opcional):
--   select nombre, tipo, tl_tipo, tl_id, tl_at, tl_error from public.clientes_cache order by nombre;
--   select id, expira_at, actualizado_at from public.tl_oauth;   -- solo como postgres
--
-- Para que un cliente se vuelva a crear en el CRM (si lo borraste allí):
--   update public.clientes_cache set tl_id = null, tl_at = null where nombre = 'Fulano';
--
-- Para desconectar Teamleader del todo:
--   delete from public.tl_oauth;
