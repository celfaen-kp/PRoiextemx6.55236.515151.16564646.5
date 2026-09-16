-- =============================================================================
-- Sysefen · Etapa 26 · Supabase avisa a Make cuando se firma una planilla
--
-- QUÉ RESUELVE:
--   Tener a Make preguntando "¿hay planillas nuevas?" cada hora gasta
--   operaciones de Make todo el mes para nada: las planillas se firman una vez
--   al mes. Con esto, Make no pregunta nunca: Supabase le avisa en cuanto se
--   guarda una planilla firmada, y el escenario se ejecuta solo entonces.
--
-- ANTES DE EJECUTAR:
--   1. En Make, crea el escenario con el módulo "Webhooks > Custom webhook".
--   2. Copia la dirección que te da Make (empieza por https://hook...).
--   3. Sustituye PON_AQUI_LA_URL_DEL_WEBHOOK por esa dirección, abajo.
--   La dirección del webhook es como una llave: no la publiques.
--
-- CÓMO FUNCIONA:
--   Un disparador en `documentos` llama a esa dirección cada vez que se inserta
--   una planilla. El aviso va por pg_net, que envía en segundo plano: si Make
--   está caído o la dirección cambió, la app NO se entera ni se rompe; la
--   planilla queda igualmente pendiente y se puede recoger a mano con
--   {"accion":"pendientes"} o con "Run once" en Make.
--
-- Idempotente. Requiere etapa13 (tabla documentos).
-- =============================================================================

create extension if not exists pg_net;

create or replace function public.avisar_make_documento()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := 'PON_AQUI_LA_URL_DEL_WEBHOOK';
begin
  -- Solo planillas nuevas todavía sin copiar.
  if new.tipo <> 'planilla' or new.exportado_en is not null then
    return new;
  end if;
  if v_url is null or v_url = '' or v_url like 'PON_AQUI%' then
    return new;                      -- sin dirección configurada: no se avisa
  end if;

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('id', new.id, 'tipo', new.tipo, 'periodo', new.periodo)
    );
  exception when others then
    -- Avisar a Make NUNCA puede impedir guardar la planilla.
    raise notice 'No se pudo avisar a Make: %', sqlerrm;
  end;

  return new;
end $$;

drop trigger if exists documentos_avisar_make on public.documentos;
create trigger documentos_avisar_make
  after insert on public.documentos
  for each row execute function public.avisar_make_documento();

-- =============================================================================
-- COMPROBAR (ejecutar suelto, después)
-- =============================================================================
-- 1. En Make, pon el escenario a la escucha ("Run once").
-- 2. Firma una planilla desde la app, o lanza el aviso a mano:
--      select net.http_post(
--        url     := 'PON_AQUI_LA_URL_DEL_WEBHOOK',
--        headers := jsonb_build_object('Content-Type', 'application/json'),
--        body    := '{"prueba": true}'::jsonb);
-- 3. La respuesta de Make se ve aquí:
--      select status_code, content from net._http_response order by created desc limit 3;
--
-- Para cambiar la dirección más adelante, vuelve a ejecutar este archivo con la
-- nueva. Para desactivar el aviso:
--      drop trigger if exists documentos_avisar_make on public.documentos;
