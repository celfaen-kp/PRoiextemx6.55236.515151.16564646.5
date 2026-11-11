-- =============================================================================
-- Sysefen · Etapa 106 · Facturas (Enzo, 11 nov 2026)
--
-- POR QUÉ: «Quiero poder generar facturas desde presupuestos, o incluso una
--   factura parcial por ítem o porcentaje… y tener todas las de Teamleader en la
--   app para mudarnos de Teamleader poco a poco.» Sin Verifactu: las facturas se
--   mandan luego a la gestoría.
--
-- CÓMO: mientras exista Teamleader, la factura se EMITE allí (el número lo pone
--   Teamleader al contabilizar) y la app es la puerta: crea el borrador, lo
--   contabiliza, descarga el PDF, apunta el cobro y abona, todo por la función
--   `teamleader-factura`. Esta tabla es el ESPEJO: una fila por cada factura y
--   por cada abono de Teamleader (las hechas desde la app y las hechas allí),
--   con sus líneas, impuestos y cobros, para verlas sin salir de la app y para
--   que el historial ya esté aquí el día que se deje Teamleader.
--
-- QUIÉN: la ven presupuestos y Administración (es_motor()). Escribir, solo la
--   función con la clave maestra. Idempotente.
-- =============================================================================

create table if not exists public.facturas (
  id               uuid primary key default gen_random_uuid(),
  tipo             text not null default 'factura' check (tipo in ('factura', 'abono')),
  tl_id            text unique,                 -- id en Teamleader
  entidad_tl_id    text,                        -- la empresa que factura (departamento de Teamleader)
  entidad          text,                        -- su nombre: SYSEFEN GROUP 2024 SL…
  numero           text,                        -- '2026 / 130' · 'R2026 / 9' en abonos · null = borrador
  estado           text not null default 'borrador',  -- borrador · pendiente · pagada · emitido (abonos)
  fecha            date,
  vence            date,
  pagada           boolean not null default false,
  pagada_at        timestamptz,
  enviada          boolean not null default false,
  cliente_id       uuid references public.clientes_cache(id) on delete set null,
  tl_cliente_id    text,
  tl_cliente_tipo  text,                        -- contact · company
  cliente_nombre   text,
  cliente_nif      text,
  presupuesto_id   uuid references public.presupuestos(id) on delete set null,
  tl_deal_id       text,                        -- la oportunidad de Teamleader
  tl_factura_abonada_id text,                   -- en un abono: la factura que rectifica
  base             numeric(12,2) not null default 0,   -- sin IVA
  iva              numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,   -- con IVA
  pendiente        numeric(12,2),                      -- lo que falta por cobrar
  impuestos        jsonb not null default '[]'::jsonb, -- [{pct, base, cuota}]
  lineas           jsonb not null default '[]'::jsonb, -- [{seccion, descripcion, detalle, cantidad, precio, dto_pct, iva_pct, importe}]
  cobros           jsonb not null default '[]'::jsonb, -- [{importe, fecha}]
  nota             text,
  forma_pago       text,                        -- 'cash:0' · 'after_invoice_date:30'…
  referencia_pago  text,
  hito             jsonb,                       -- cómo se hizo desde la app: {modo: 'porcentaje', pct: 50…}
  origen           text not null default 'teamleader' check (origen in ('app', 'teamleader')),
  creado_por       uuid,
  tl_web_url       text,
  tl_updated_at    timestamptz,
  sincronizado_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.facturas is 'Espejo de las facturas y abonos de Teamleader (las hechas desde la app y las hechas allí). La emisión y el número son de Teamleader; escribe la función teamleader-factura.';

create index if not exists facturas_fecha on public.facturas (fecha desc nulls first);
create index if not exists facturas_presupuesto on public.facturas (presupuesto_id) where presupuesto_id is not null;
create index if not exists facturas_cliente on public.facturas (cliente_id) where cliente_id is not null;
create index if not exists facturas_abonada on public.facturas (tl_factura_abonada_id) where tl_factura_abonada_id is not null;

alter table public.facturas enable row level security;
drop policy if exists facturas_ver on public.facturas;
create policy facturas_ver on public.facturas
  for select to authenticated using (public.es_motor());
-- Sin política de escritura: solo la función, con la clave maestra.

select count(*) as facturas from public.facturas;
