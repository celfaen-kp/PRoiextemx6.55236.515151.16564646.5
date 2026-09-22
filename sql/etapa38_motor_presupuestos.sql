-- =============================================================================
-- Sysefen · Etapa 38 · Motor de presupuestos
--
-- QUÉ SE MONTA:
--   Lo que hace falta para que una ficha de visita se convierta sola en un
--   presupuesto con líneas, precios y descuentos, en vez de que alguien lo
--   monte a mano en Teamleader.
--
-- ESTO CAMBIA UNA DECISIÓN DE LA ETAPA 20.
--   Allí se dejó escrito: "La app NO calcula precios. Guarda datos y los manda
--   al CRM." Era lo correcto entonces. Ahora sí calcula, porque analizando 59
--   presupuestos cerrados se vio que el cálculo ya era determinista:
--
--     suma de líneas a PVP de tarifa
--       − descuentos de línea (−15 % en material de marca)
--       − descuento global (−10 %)
--       = total sin IVA
--
--   Con esa cadena se reconstruyeron 57 de 59 presupuestos al céntimo. Los dos
--   que fallan tienen erratas en el PDF, no en la regla. Teamleader sigue
--   siendo el maestro: lo que sale de aquí se le empuja, no lo sustituye.
--
-- DECISIONES QUE EXPLICAN LAS TABLAS:
--   - Las reglas son DATOS, no código. Cambiar qué máquina se pone a 8 kW es
--     editar una fila, no tocar index.html ni desplegar.
--   - Todo lo que cambia con el tiempo va versionado (`tarifas`,
--     `conjuntos_reglas`). Nunca se edita lo vigente: se publica lo siguiente
--     y se cierra lo anterior. Sin esto, un presupuesto reabierto dentro de un
--     año muestra otros números y no se sabe cuál se mandó.
--   - Las reglas NO miran los m² crudos. Miran `variables_derivadas`, que es
--     donde vive la ingeniería (carga térmica, circuitos, nº de paneles). Así
--     cambiar el criterio de dimensionado se hace en un sitio y no en cuarenta
--     reglas.
--   - Los coeficientes de cálculo (W/m² por aislamiento, factores de
--     exposición) van en `tablas_lookup` y no en el código, porque son
--     exactamente lo que se va a estar calibrando durante meses.
--   - Cada línea generada guarda QUÉ REGLA la produjo y con qué valores. Sin
--     eso, cuando un presupuesto salga raro toca ingeniería inversa a mano.
--   - El detalle técnico que se imprime debajo de cada artículo se escribe una
--     vez POR PRODUCTO, no por presupuesto. Así sale igual en todos y no cuesta
--     nada generarlo. Va a Teamleader en `extra_information` de la línea.
--
-- LO QUE NO SE MONTA AQUÍ, PORQUE YA EXISTE:
--   - El cuestionario de la visita vive en visitas-schemas.js, con su flag
--     `motor: true`. No se duplica en base de datos.
--   - Las categorías son las CATEGORIAS de ese mismo fichero.
--   - Los roles y sus helpers (es_comercial, es_jefe, es_admin) son de la 20.
--
-- Idempotente y no destructivo. Se puede ejecutar dos veces.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Catálogo de fabricante
--
-- Las tarifas de Vaillant, Midea y Saunier Duval son públicas del fabricante.
-- Se cargan enteras desde el PDF con los extractores de herramientas/.
-- El precio que se guarda es el PVP de tarifa TAL CUAL: el margen de Sysefen
-- está en el descuento de proveedor, no en un recargo sobre tarifa.
-- ---------------------------------------------------------------------------

create table if not exists public.proveedores (
  id          uuid primary key default gen_random_uuid(),
  codigo      text unique not null,          -- 'vaillant','saunier','frigicoll'
  nombre      text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.tarifas (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references public.proveedores(id),
  nombre        text not null,               -- 'Vaillant 2025'
  vigente_desde date not null,
  vigente_hasta date,                        -- null = la vigente
  created_at    timestamptz not null default now(),
  unique (proveedor_id, nombre)
);

create table if not exists public.productos (
  id              uuid primary key default gen_random_uuid(),
  tarifa_id       uuid not null references public.tarifas(id) on delete cascade,

  referencia      text not null,             -- la del fabricante = id en Teamleader
  nombre          text not null,
  familia         text not null,             -- 'bomba_calor','acumulador','panel'…
  unidad          text not null default 'ud',

  precio_tarifa   numeric(12,2) not null,    -- PVP de catálogo
  descuento_proveedor numeric(5,2) not null default 0,
  iva             numeric(5,2) not null default 21,

  -- Lo que se imprime DEBAJO del concepto en el presupuesto
  detalle_tecnico text,                      -- 'Interfaz VWZ AI MB5 · sensoCOMFORT…'
  especificaciones jsonb not null default '[]'::jsonb,   -- ["Etiquetado A+++", …]

  -- Sobre esto consultan las reglas. Cada familia tiene sus atributos:
  --   bomba_calor -> {"potencia_kw": 8}
  --   panel       -> {"wp": 510}
  atributos       jsonb not null default '{}'::jsonb,

  tl_producto_id  text,                      -- id en Teamleader, si está subido
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (tarifa_id, referencia)
);

create index if not exists productos_familia_idx   on public.productos (familia);
create index if not exists productos_atributos_idx on public.productos using gin (atributos);

-- ---------------------------------------------------------------------------
-- 1b · Equivalencias entre marcas
--
-- Vaillant y Saunier Duval son del mismo grupo y comparten sistema de
-- referencias: los packs Genia Air Max llevan referencia 00203xxxxx, formato
-- Vaillant. Comparando los equivalentes reales, Saunier sale un 5,4 % por
-- encima de forma consistente:
--
--    4 kW   8.755 -> 9.230   (×1,0543)
--    8 kW   9.710 -> 10.235  (×1,0541)
--   12 kW  12.780 -> 13.465  (×1,0536)
--   15 kW  13.395 -> 14.115  (×1,0538)
--
-- Aun así se emparejan por referencia y no por fórmula: el precio que se pone
-- en un presupuesto tiene que ser el de tarifa, no uno calculado. El ratio
-- sirve para detectar que una equivalencia está mal puesta, no para fijar
-- precios.
--
-- OJO al comparar marcas: hay que enfrentar producto equivalente contra
-- producto equivalente. Un GeniaSet Iso (pack completo con acumulador inox)
-- contra un aroTHERM plus básico (solo la unidad exterior) da una diferencia
-- del 50 % que no es real.
--
-- Las gamas no casan una a una: Vaillant va 4/6/8/12/15 y la Max de Saunier
-- va 5/8/12/15. Donde no hay equivalente, no se pone fila.
-- ---------------------------------------------------------------------------

create table if not exists public.producto_equivalencias (
  id          uuid primary key default gen_random_uuid(),
  familia     text not null,
  gama        text not null,                 -- 'basico_r290','pack_acs',…
  atributos   jsonb not null default '{}'::jsonb,   -- {"potencia_kw": 8}
  ref_a       text not null,                 -- referencia de una marca
  ref_b       text not null,                 -- la equivalente de la otra
  notas       text,
  unique (ref_a, ref_b)
);

create index if not exists producto_equivalencias_fam_idx
  on public.producto_equivalencias (familia, gama);

-- Coste real de compra
create or replace function public.coste_producto(p_producto_id uuid)
returns numeric
language sql
stable
as $$
  select round(precio_tarifa * (1 - coalesce(descuento_proveedor, 0) / 100), 2)
    from public.productos where id = p_producto_id
$$;


-- ---------------------------------------------------------------------------
-- 2 · Ingeniería
--
-- La capa que convierte lo que Ramón mide en lo que las reglas consultan.
-- `formula` se evalúa en el motor con un evaluador acotado, nunca con eval().
-- ---------------------------------------------------------------------------

create table if not exists public.variables_derivadas (
  id          uuid primary key default gen_random_uuid(),
  categoria   text not null,                 -- 'aerotermia','solar','aire_acondicionado'
  codigo      text not null,                 -- 'potencia_diseno_kw'
  etiqueta    text not null,
  unidad      text,
  formula     text not null,
  orden       int not null,                  -- orden de evaluación
  descripcion text,
  unique (categoria, codigo)
);

create table if not exists public.tablas_lookup (
  id        uuid primary key default gen_random_uuid(),
  categoria text not null,
  clave     text not null,                   -- 'coef_calefaccion'
  entrada   text not null,                   -- 'sin_aislar'
  valor     numeric not null,
  notas     text,
  unique (categoria, clave, entrada)
);


-- ---------------------------------------------------------------------------
-- 3 · Partidas
--
-- Una partida es lo que siempre va junto. Los códigos A100–A106 (aerotermia) y
-- C100–C104 (aire) ya existen en el catálogo de Teamleader: esto los formaliza.
-- Muchas van a precio cerrado, sin referencia de catálogo, y por eso
-- `precio_fijo` convive con `producto_ref`.
-- ---------------------------------------------------------------------------

create table if not exists public.partidas (
  id         uuid primary key default gen_random_uuid(),
  categoria  text not null,
  codigo     text not null,                  -- 'KIT_BASE','A100','C100'
  nombre     text not null,
  created_at timestamptz not null default now(),
  unique (categoria, codigo)
);

create table if not exists public.partidas_items (
  id               uuid primary key default gen_random_uuid(),
  partida_id       uuid not null references public.partidas(id) on delete cascade,
  producto_ref     text,
  concepto_libre   text,
  detalle_tecnico  text,
  precio_fijo      numeric(12,2),
  formula_cantidad text not null default '1',
  orden            int not null default 0,
  constraint partidas_items_algo_que_poner
    check (producto_ref is not null or concepto_libre is not null)
);


-- ---------------------------------------------------------------------------
-- 4 · Reglas
--
-- Tres tipos, y hacen falta los tres:
--   seleccion   elige un producto por rango de una variable (8 kW -> tal máquina)
--   cantidad    calcula cuántas unidades (245 € × nº de unidades interiores)
--   condicional si se cumple algo, añade producto o partida entera
--
-- `condicion` existe porque el rango no basta: el mismo kW con suelo radiante o
-- con radiadores puede ser otra máquina.
-- `prioridad` existe porque sin ella, el día que se añada una excepción, rompe
-- la regla general. Gana la más específica.
-- ---------------------------------------------------------------------------

create table if not exists public.conjuntos_reglas (
  id            uuid primary key default gen_random_uuid(),
  categoria     text not null,
  version       text not null,               -- '2026.1'
  vigente_desde date not null,
  vigente_hasta date,
  notas         text,
  created_at    timestamptz not null default now(),
  unique (categoria, version)
);

create table if not exists public.reglas (
  id               uuid primary key default gen_random_uuid(),
  conjunto_id      uuid not null references public.conjuntos_reglas(id) on delete cascade,

  tipo             text not null check (tipo in ('seleccion','cantidad','condicional')),
  variable         text,                     -- 'potencia_diseno_kw'
  minimo           numeric,
  maximo           numeric,
  condicion        jsonb,                    -- {"emisores_previstos": "suelo_radiante"}

  producto_ref     text,
  partida_id       uuid references public.partidas(id),

  formula_cantidad text not null default '1',
  seccion          text,                     -- cómo se agrupa en el presupuesto
  prioridad        int not null default 0,
  activa           boolean not null default true,
  notas            text,
  constraint reglas_algo_que_poner
    check (producto_ref is not null or partida_id is not null)
);

create index if not exists reglas_conjunto_idx on public.reglas (conjunto_id, tipo, variable);

create table if not exists public.mano_obra (
  id            uuid primary key default gen_random_uuid(),
  conjunto_id   uuid not null references public.conjuntos_reglas(id) on delete cascade,
  concepto      text not null,
  formula_horas text,                        -- null si va a precio cerrado
  precio_fijo   numeric(12,2),               -- el A102 de aerotermia: 2.250 € planos
  precio_hora   numeric(10,2),
  condicion     jsonb
);


-- ---------------------------------------------------------------------------
-- 5 · Política de precios
--
-- Los descuentos observados en los 59 presupuestos: −15 % en las líneas de
-- material de marca (máquina, acumulador, depósito de inercia) y −10 % global
-- al pie. El global varía por presupuesto, así que el que hay aquí es el
-- habitual y el motor lo deja cambiar.
-- ---------------------------------------------------------------------------

create table if not exists public.politica_descuentos (
  id            uuid primary key default gen_random_uuid(),
  ambito        text not null check (ambito in ('linea','global')),
  familia       text,                        -- solo para ambito 'linea'
  descuento_pct numeric(5,2) not null,
  condicion     jsonb,
  activa        boolean not null default true
);

-- Estimativo rápido para dar un rango en la propia visita, y control de
-- sanidad del motor: si lo calculado se desvía mucho del ratio, algo va mal.
create table if not exists public.ratios (
  id             uuid primary key default gen_random_uuid(),
  categoria      text not null,
  magnitud       text not null,              -- 'potencia_diseno_kw','kwp'
  unidad         text not null,
  condicion      jsonb,
  eur_min        numeric(10,2) not null,
  eur_max        numeric(10,2) not null,
  muestras       int,
  actualizado_en date not null default current_date
);


-- ---------------------------------------------------------------------------
-- 6 · Presupuestos generados
-- ---------------------------------------------------------------------------

create table if not exists public.presupuestos (
  id            uuid primary key default gen_random_uuid(),
  visita_id     uuid not null references public.visitas(id) on delete cascade,
  ficha_id      uuid references public.visita_fichas(id) on delete set null,
  categoria     text not null,

  -- Congelar la versión con la que se calculó
  conjunto_reglas_id uuid references public.conjuntos_reglas(id),
  tarifa_id          uuid references public.tarifas(id),
  motor_version      text,

  -- Nivel 1: el rango que se le dice al cliente en la visita
  estimativo_min numeric(12,2),
  estimativo_max numeric(12,2),
  ratio_aplicado numeric(12,2),

  -- Nivel 2: el presupuesto de verdad
  total_bruto     numeric(12,2),             -- suma a PVP de tarifa
  total_dto_linea numeric(12,2),             -- descuentos línea a línea
  dto_global_pct  numeric(5,2),
  total_coste     numeric(12,2),
  total_venta     numeric(12,2),             -- bruto + dto_linea + dto_global

  estado     text not null default 'generado'
             check (estado in ('generado','revisar','aprobado','enviado')),
  confianza  text check (confianza in ('alta','media','baja')),

  tl_quotation_id text,
  sync_estado  text not null default 'pendiente'
               check (sync_estado in ('pendiente','enviando','sincronizado','error')),
  sync_error   text,
  sync_at      timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists presupuestos_visita_idx on public.presupuestos (visita_id);

create table if not exists public.presupuesto_lineas (
  id             uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,

  orden    int not null default 0,
  seccion  text,

  producto_ref text,
  descripcion  text not null,
  -- Copiados del producto al generar, para que el presupuesto quede congelado
  -- aunque el catálogo cambie después.
  detalle_tecnico  text,
  especificaciones jsonb not null default '[]'::jsonb,

  cantidad numeric(12,3) not null,
  unidad   text not null default 'ud',

  precio_tarifa numeric(12,2) not null,
  dto_linea_pct numeric(5,2) not null default 0,
  precio_coste  numeric(12,2),
  precio_venta  numeric(12,2) not null,
  iva           numeric(5,2) not null default 21,

  -- Trazabilidad
  origen         text not null default 'regla'
                 check (origen in ('regla','partida','mano_obra','ia','manual')),
  origen_regla_id uuid references public.reglas(id),
  origen_inputs   jsonb,                     -- con qué valores se disparó
  confirmada      boolean not null default true   -- false = sugerencia sin validar
);

create index if not exists presupuesto_lineas_idx on public.presupuesto_lineas (presupuesto_id);

-- Lo que el motor no supo resolver. Alimenta el semáforo de revisión: si hay
-- un 'error', el presupuesto nace en estado 'revisar' y no se envía solo.
create table if not exists public.presupuesto_incidencias (
  id             uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  nivel   text not null check (nivel in ('info','aviso','error')),
  codigo  text not null,                     -- 'campo_faltante','fuera_de_rango'
  campo   text,
  mensaje text not null
);

-- Cuando alguien cambia la línea que propuso el motor, se anota. Con cincuenta
-- de estas ya se sabe qué reglas están mal calibradas. Es el único modo de que
-- el motor mejore en vez de quedarse como se dejó.
create table if not exists public.motor_correcciones (
  id             uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  regla_id       uuid references public.reglas(id),
  propuesto_ref  text,
  elegido_ref    text,
  motivo         text,
  usuario_id     uuid not null references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 7 · Seguridad
--
-- El catálogo y las reglas los lee cualquiera que esté dentro; los toca solo
-- admin. Los presupuestos son del rol comercial, igual que las visitas.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'proveedores','tarifas','productos','variables_derivadas','tablas_lookup',
    'producto_equivalencias','partidas','partidas_items','conjuntos_reglas',
    'reglas','mano_obra','politica_descuentos','ratios']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_lectura', t);

    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.es_admin()) with check (public.es_admin())',
      t || '_admin', t);
  end loop;
end $$;

alter table public.presupuestos enable row level security;
drop policy if exists presupuestos_comercial on public.presupuestos;
create policy presupuestos_comercial on public.presupuestos
  for all to authenticated
  using (public.es_comercial())
  with check (public.es_comercial());

do $$
declare t text;
begin
  foreach t in array array['presupuesto_lineas','presupuesto_incidencias','motor_correcciones']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_por_presupuesto', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (exists (select 1 from public.presupuestos p
                         where p.id = %I.presupuesto_id and public.es_comercial()))',
      t || '_por_presupuesto', t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 8 · Semilla
--
-- Los valores salen de los 59 presupuestos analizados. El kit base de
-- aerotermia aparece idéntico en seis presupuestos distintos: no es una
-- mediana estadística, es una partida que ya se aplica cerrada.
-- ---------------------------------------------------------------------------

insert into public.proveedores (codigo, nombre) values
  ('vaillant',  'Vaillant'),
  ('saunier',   'Saunier Duval'),
  ('frigicoll', 'Frigicoll (Midea)')
on conflict (codigo) do nothing;

insert into public.tarifas (proveedor_id, nombre, vigente_desde)
select p.id, t.nombre, t.desde
  from public.proveedores p
  join (values ('vaillant',  'Vaillant 2025',      date '2025-01-01'),
               ('frigicoll', 'Midea 2026',         date '2026-01-01'),
               ('saunier',   'Saunier Duval 2026', date '2026-05-01')
       ) as t(prov, nombre, desde) on t.prov = p.codigo
on conflict (proveedor_id, nombre) do nothing;

insert into public.politica_descuentos (ambito, familia, descuento_pct)
select * from (values
  ('linea',  'bomba_calor',      15.0),
  ('linea',  'acumulador',       15.0),
  ('linea',  'deposito_inercia', 15.0),
  ('global', null::text,         10.0)
) as v(ambito, familia, pct)
where not exists (select 1 from public.politica_descuentos);

-- Equivalencias aroTHERM plus (Vaillant) ↔ Genia Air Max (Saunier Duval),
-- gama básica R290, control inalámbrico. Sin fila para 6 kW: la gama Max de
-- Saunier no tiene ese escalón.
insert into public.producto_equivalencias (familia, gama, atributos, ref_a, ref_b, notas)
select 'bomba_calor', 'basico_r290', jsonb_build_object('potencia_kw', v.kw),
       v.vaillant, v.saunier, v.nota
  from (values
    ( 4::numeric, '0020306791', '0020307741', 'aroTHERM plus 4 ↔ Genia Air Max 4'),
    ( 8,          '0020306795', '0020307745', 'aroTHERM plus 8 ↔ Genia Air Max 8'),
    (12,          '0020306797', '0020307747', 'aroTHERM plus 12 ↔ Genia Air Max 12 (230V)'),
    (15,          '0020306801', '0020307751', 'aroTHERM plus 15 ↔ Genia Air Max 15 (230V)')
  ) as v(kw, vaillant, saunier, nota)
on conflict (ref_a, ref_b) do nothing;

insert into public.partidas (categoria, codigo, nombre) values
  ('aerotermia',         'KIT_BASE', 'Kit base instalación aerotermia'),
  ('solar',              'KIT_BASE', 'Kit base instalación fotovoltaica'),
  ('aire_acondicionado', 'KIT_BASE', 'Instalación por unidad de aire')
on conflict (categoria, codigo) do nothing;

-- Aerotermia: 7.365 € en los casos estándar
insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, detalle_tecnico, orden)
select p.id, v.concepto, v.precio, v.detalle, v.orden
  from public.partidas p
  join (values
    ('Depósito de inercia', 1100.00,
     'Depósito de inercia para el volumen mínimo de agua del circuito', 1),
    ('Soportes de caucho antivibración', 115.00,
     'Apoyos antivibración para la unidad exterior', 2),
    ('A100: Material hidráulico para aerotermia', 2100.00,
     'Tubería multicapa, aislamiento, válvulas, vaso de expansión, desfangador y purgadores', 3),
    ('A101: Material eléctrico para aerotermia', 750.00,
     'Diferencial superinmunizado, magnetotérmico, relés y cableado de interconexión', 4),
    ('A102: Mano de obra instalación aerotermia', 2250.00,
     'Montaje de unidad exterior, sala de máquinas, conexionado y puesta en marcha', 5),
    ('RITE, documentación y subvención', 450.00,
     'Certificado de instalación y registro en industria', 6),
    ('Gestiones administrativas', 600.00,
     'Presentación de subvención y certificados energéticos', 7)
  ) as v(concepto, precio, detalle, orden) on true
 where p.categoria = 'aerotermia' and p.codigo = 'KIT_BASE'
   and not exists (select 1 from public.partidas_items pi where pi.partida_id = p.id);

-- Fotovoltaica: 5.445 € en el tramo 5–6 kWp
insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, orden)
select p.id, v.concepto, v.precio, v.orden
  from public.partidas p
  join (values
    ('Material eléctrico',                1905.00, 1),
    ('Estructura de soportación',          252.00, 2),
    ('Mano de obra',                       725.00, 3),
    ('Trámites en D.G. Industria',         300.00, 4),
    ('Gestiones documentales',             300.00, 5),
    ('Puesta en marcha y monitorización',  150.00, 6),
    ('Medidor de energía e interfaz',      110.00, 7)
  ) as v(concepto, precio, orden) on true
 where p.categoria = 'solar' and p.codigo = 'KIT_BASE'
   and not exists (select 1 from public.partidas_items pi where pi.partida_id = p.id);

-- Aire: todo por unidad. C100/C101/C104 por unidad interior, C102 por exterior.
insert into public.partidas_items (partida_id, concepto_libre, precio_fijo, formula_cantidad, orden)
select p.id, v.concepto, v.precio, v.formula, v.orden
  from public.partidas p
  join (values
    ('C100: Tubería frigorífica y aislamiento', 245.00, 'unidades_interiores', 1),
    ('C101: Electricidad',                       72.00, 'unidades_interiores', 2),
    ('C102: Soportes unidad exterior',           45.00, 'unidades_exteriores', 3),
    ('C103: Exceso metro',                       52.00, 'metros_exceso',       4),
    ('C104: Mano de obra',                      450.00, 'unidades_interiores', 5)
  ) as v(concepto, precio, formula, orden) on true
 where p.categoria = 'aire_acondicionado' and p.codigo = 'KIT_BASE'
   and not exists (select 1 from public.partidas_items pi where pi.partida_id = p.id);

commit;

-- =============================================================================
-- COMPROBACIONES
--
-- Que el kit base de aerotermia suma lo que debe (7.365 €):
--   select sum(precio_fijo) from public.partidas_items pi
--     join public.partidas p on p.id = pi.partida_id
--    where p.categoria = 'aerotermia' and p.codigo = 'KIT_BASE';
--
-- Que las políticas de descuento están puestas:
--   select ambito, familia, descuento_pct from public.politica_descuentos;
--
-- Cargar el catálogo (desde herramientas/, con la service key):
--   python3 herramientas/cargar-tarifa.py catalogo-vaillant-2025.csv 'Vaillant 2025'
--   python3 herramientas/cargar-tarifa.py catalogo-midea-2026.csv    'Midea 2026'
-- =============================================================================
