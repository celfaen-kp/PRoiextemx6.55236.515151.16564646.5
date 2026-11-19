-- =============================================================================
-- Sysefen · etapa 117 · las plantillas de fases para los agentes (Ramón, 19-11-2026)
--
-- Ramón: «Añade que: "fases-plantillas" a agentes-leer… para que "Control de
-- obras" sepa cuál es la fase normal de cada tipo de obra y avise cuando una
-- obra se sale de lo habitual.»
--
-- Devuelve fase_plantillas tal cual: de cada categoría (FV, AE, AC, EL, BAT,
-- CC) y las comunes a todas, su orden, nombre, descripción, si va al final, si
-- está activa y sus opciones. Las plantillas NO tienen porcentaje ni grupo: el
-- porcentaje es de cada obra (obra_fases.pct) y el grupo no se usa.
--
-- Al crear una obra se le copian las activas de sus categorías más las comunes
-- (generar_fases_obra). Las comunes con al_final van detrás de las de categoría.
--
-- Solo la llama la Edge Function `agentes-leer` (service_role). No lleva datos
-- de clientes. Requiere la etapa 63.
-- =============================================================================

create or replace function public.agentes_fases_plantillas()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'que', 'fases-plantillas',
    'hoy', (now() at time zone 'Europe/Madrid')::date,
    'n', count(*),
    'plantillas', coalesce(jsonb_agg(jsonb_build_object(
        'plantilla_id', t.id,
        'categoria', coalesce(t.categoria, 'comunes'),
        'orden', t.orden, 'nombre', t.nombre, 'descripcion', t.descripcion,
        'al_final', t.al_final, 'activa', t.activa,
        'opciones', coalesce(to_jsonb(t.opciones), '[]'::jsonb))
      order by (t.categoria is null), t.categoria, t.al_final, t.orden, t.nombre), '[]'::jsonb))
    from public.fase_plantillas t
$$;

revoke all on function public.agentes_fases_plantillas() from public, anon, authenticated;
grant execute on function public.agentes_fases_plantillas() to service_role;
