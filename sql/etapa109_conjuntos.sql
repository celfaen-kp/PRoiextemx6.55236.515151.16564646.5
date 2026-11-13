-- =============================================================================
-- Etapa 109 · Conjuntos del catálogo (Enzo, 13-11-2026)
--
-- «En el catálogo de Midea hay cosas que se pueden poner por conjunto, como el
-- MTJU-71(24)N8Q-1, que es 1x1 de la interior MTJU-24NX y la exterior
-- MO-24N8-Q-1; están las dos, pero a mano toca buscarlas una por una.»
--
-- Un conjunto es un modelo de la tarifa que se vende como varias unidades
-- (interior + exterior, cassette + panel). No es un producto: no tiene precio
-- propio. En el buscador del presupuesto sale el primero y, al tocarlo, entran
-- sus unidades como líneas, cada una con su precio del catálogo (así un precio
-- cambiado a mano en Ajustes → Precios vale también para el conjunto).
--
-- Aquí no hay precios (el repo es público): solo modelos y códigos.
--
-- De dónde sale cada uno (columna `fuente`):
--   · doméstico 1x1 (Zenith, Solstice, Breezeless E, consola) y cassette con su
--     panel: Tarifa Midea 2026, páginas 41 a 61; el precio de conjunto que
--     imprime la tarifa es la suma de las unidades (cotejado el 13-11-2026; solo
--     el Breezeless E 35(12) imprime 10 EUR más, porque esa página da otro
--     precio a la exterior EZ-12RD6-O).
--   · conductos A7 de 2,6 a 7,1 kW: la composición es la de la declaración UE de
--     conformidad de Frigicoll (30-10-2026). El código de conjunto de la tarifa
--     no se tiene (referencia vacía).
--   · QUEDAN FUERA los conductos A7 de 9 a 16 kW (MTJ-90…160) y el resto de la
--     gama Expert (cassette 1x1, suelo-techo, columna): sus interiores no están
--     en `productos` con nombre. Hace falta el PDF de la tarifa.
--
-- Se puede ejecutar dos veces.
-- =============================================================================

create table if not exists public.conjuntos (
  id          uuid primary key default gen_random_uuid(),
  modelo      text not null unique,          -- como lo llama la tarifa: «MTJU-71(24)N8Q-1»
  referencia  text,                          -- código del conjunto en la tarifa, si lo tiene
  nombre      text not null,
  marca       text,
  gama        text,
  componentes jsonb not null,                -- [{"referencia":"13930199","cantidad":1}, …] en el orden en que entran
  buscar      text not null default '',      -- modelo, nombre y unidades en minúsculas: por aquí se busca
  fuente      text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.conjuntos enable row level security;
drop policy if exists conjuntos_lectura on public.conjuntos;
create policy conjuntos_lectura on public.conjuntos for select to authenticated using (true);
drop policy if exists conjuntos_admin on public.conjuntos;
create policy conjuntos_admin on public.conjuntos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

insert into public.conjuntos (modelo, referencia, nombre, marca, gama, componentes, fuente) values
  ('Zenith 26(09)N7', '13950486', 'Midea Zenith 26(09)N7 · conjunto 1x1', 'midea', 'Zenith R-290', '[{"referencia": "13902270", "cantidad": 1}, {"referencia": "13902272", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 41'),
  ('Zenith 35(12)N7', '13950487', 'Midea Zenith 35(12)N7 · conjunto 1x1', 'midea', 'Zenith R-290', '[{"referencia": "13902273", "cantidad": 1}, {"referencia": "13902274", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 41'),
  ('Solstice 26(09)N8', '13950478', 'Midea Solstice 26(09)N8 · conjunto 1x1', 'midea', 'Solstice', '[{"referencia": "13900091", "cantidad": 1}, {"referencia": "13900092", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 43'),
  ('Solstice 35(12)N8', '13950479', 'Midea Solstice 35(12)N8 · conjunto 1x1', 'midea', 'Solstice', '[{"referencia": "13900093", "cantidad": 1}, {"referencia": "13900094", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 43'),
  ('Solstice 52(18)N8', '13950480', 'Midea Solstice 52(18)N8 · conjunto 1x1', 'midea', 'Solstice', '[{"referencia": "13900095", "cantidad": 1}, {"referencia": "13900096", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 43'),
  ('Solstice 71(24)N8', '13950481', 'Midea Solstice 71(24)N8 · conjunto 1x1', 'midea', 'Solstice', '[{"referencia": "13900097", "cantidad": 1}, {"referencia": "13900098", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 43'),
  ('Solstice 26(09)N8-N', '13950482', 'Midea Solstice 26(09)N8-N · conjunto 1x1', 'midea', 'Solstice Negra', '[{"referencia": "13900099", "cantidad": 1}, {"referencia": "13900092", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 45'),
  ('Solstice 35(12)N8-N', '13950483', 'Midea Solstice 35(12)N8-N · conjunto 1x1', 'midea', 'Solstice Negra', '[{"referencia": "13900102", "cantidad": 1}, {"referencia": "13900094", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 45'),
  ('Solstice 52(18)N8-N', '13950484', 'Midea Solstice 52(18)N8-N · conjunto 1x1', 'midea', 'Solstice Negra', '[{"referencia": "13900103", "cantidad": 1}, {"referencia": "13900096", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 45'),
  ('Solstice 71(24)N8-N', '13950485', 'Midea Solstice 71(24)N8-N · conjunto 1x1', 'midea', 'Solstice Negra', '[{"referencia": "13900104", "cantidad": 1}, {"referencia": "13900098", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 45'),
  ('Breezeless E 20(07)N8-1', '13950523', 'Midea Breezeless E 20(07)N8-1 · conjunto 1x1', 'midea', 'Breezeless E', '[{"referencia": "13915209", "cantidad": 1}, {"referencia": "13915205", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 47'),
  ('Breezeless E 26(09)N8-1', '13950524', 'Midea Breezeless E 26(09)N8-1 · conjunto 1x1', 'midea', 'Breezeless E', '[{"referencia": "13915221", "cantidad": 1}, {"referencia": "13900092", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 47'),
  ('Breezeless E 35(12)N8-1', '13950525', 'Midea Breezeless E 35(12)N8-1 · conjunto 1x1', 'midea', 'Breezeless E', '[{"referencia": "13915208", "cantidad": 1}, {"referencia": "13900094", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 47'),
  ('Breezeless E 52(18)N8-1', '13950526', 'Midea Breezeless E 52(18)N8-1 · conjunto 1x1', 'midea', 'Breezeless E', '[{"referencia": "13900089", "cantidad": 1}, {"referencia": "13900088", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 47'),
  ('Breezeless E 71(24)N8-1', '13950527', 'Midea Breezeless E 71(24)N8-1 · conjunto 1x1', 'midea', 'Breezeless E', '[{"referencia": "13960451", "cantidad": 1}, {"referencia": "13950452", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 47'),
  ('MFAU-26(09)N8Q-1', '13950446', 'Midea Consola doble flujo · MFAU-26(09)N8Q-1 · conjunto 1x1', 'midea', 'Consola doble flujo', '[{"referencia": "13902179", "cantidad": 1}, {"referencia": "13930178", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 49'),
  ('MFAU-35(12)N8Q-2', '13950447', 'Midea Consola doble flujo · MFAU-35(12)N8Q-2 · conjunto 1x1', 'midea', 'Consola doble flujo', '[{"referencia": "13930283", "cantidad": 1}, {"referencia": "13930074", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 49'),
  ('MFAU-52(18)N8Q-2', '13950448', 'Midea Consola doble flujo · MFAU-52(18)N8Q-2 · conjunto 1x1', 'midea', 'Consola doble flujo', '[{"referencia": "13930284", "cantidad": 1}, {"referencia": "13930075", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 49'),
  ('MCA4U-07NX + MCP-600B', null, 'Midea Cassette 600x600 MCA4U-07NX con su panel MCP-600B', 'midea', 'Cassette 600x600', '[{"referencia": "13930107", "cantidad": 1}, {"referencia": "13930186", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 61'),
  ('MCA4U-09NX + MCP-600B', null, 'Midea Cassette 600x600 MCA4U-09NX con su panel MCP-600B', 'midea', 'Cassette 600x600', '[{"referencia": "13950454", "cantidad": 1}, {"referencia": "13930186", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 61'),
  ('MCA4U-12NX + MCP-600B', null, 'Midea Cassette 600x600 MCA4U-12NX con su panel MCP-600B', 'midea', 'Cassette 600x600', '[{"referencia": "13930184", "cantidad": 1}, {"referencia": "13930186", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 61'),
  ('MCA4U-18NX + MCP-600B', null, 'Midea Cassette 600x600 MCA4U-18NX con su panel MCP-600B', 'midea', 'Cassette 600x600', '[{"referencia": "13930185", "cantidad": 1}, {"referencia": "13930186", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 61'),
  ('MCD-24NX + MCP-840B', null, 'Midea Cassette 840x840 MCD-24NX con su panel MCP-840B', 'midea', 'Cassette 840x840', '[{"referencia": "13930088", "cantidad": 1}, {"referencia": "13930096", "cantidad": 1}]'::jsonb, 'Tarifa Midea 2026, pág. 61'),
  ('MTJU-26(09)N8Q-1', null, 'Midea Expert Conductos A7 · MTJU-26(09)N8Q-1 · conjunto 1x1 axial', 'midea', 'Conductos A7', '[{"referencia": "13912553", "cantidad": 1}, {"referencia": "13930178", "cantidad": 1}]'::jsonb, 'Declaración UE de conformidad de Frigicoll, 30-10-2026 (midea.es)'),
  ('MTJU-35(12)N8Q-1', null, 'Midea Expert Conductos A7 · MTJU-35(12)N8Q-1 · conjunto 1x1 axial', 'midea', 'Conductos A7', '[{"referencia": "13930197", "cantidad": 1}, {"referencia": "13930074", "cantidad": 1}]'::jsonb, 'Declaración UE de conformidad de Frigicoll, 30-10-2026 (midea.es)'),
  ('MTJU-52(18)N8Q-1', null, 'Midea Expert Conductos A7 · MTJU-52(18)N8Q-1 · conjunto 1x1 axial', 'midea', 'Conductos A7', '[{"referencia": "13930198", "cantidad": 1}, {"referencia": "13930075", "cantidad": 1}]'::jsonb, 'Declaración UE de conformidad de Frigicoll, 30-10-2026 (midea.es)'),
  ('MTJU-71(24)N8Q-1', null, 'Midea Expert Conductos A7 · MTJU-71(24)N8Q-1 · conjunto 1x1 axial', 'midea', 'Conductos A7', '[{"referencia": "13930199", "cantidad": 1}, {"referencia": "13930176", "cantidad": 1}]'::jsonb, 'Declaración UE de conformidad de Frigicoll, 30-10-2026 (midea.es)')
on conflict (modelo) do update set referencia = excluded.referencia, nombre = excluded.nombre, marca = excluded.marca,
  gama = excluded.gama, componentes = excluded.componentes, fuente = excluded.fuente;

-- El texto por el que se busca: el conjunto y los nombres y códigos de sus unidades.
update public.conjuntos c set buscar = lower(concat_ws(' ', 'conjunto', c.modelo, c.referencia, c.nombre, c.gama,
  (select string_agg(p.nombre || ' ' || p.referencia, ' ')
     from jsonb_array_elements(c.componentes) e
     join public.productos p on p.referencia = e->>'referencia' and p.activo)));

-- Comprobación: ningún conjunto con una unidad que no esté en el catálogo.
select c.modelo, e->>'referencia' as falta
  from public.conjuntos c, jsonb_array_elements(c.componentes) e
 where not exists (select 1 from public.productos p where p.referencia = e->>'referencia' and p.activo);
