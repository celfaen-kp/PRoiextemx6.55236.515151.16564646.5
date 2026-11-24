-- =============================================================================
-- Sysefen · Etapa 127 · El cliente pide cambios o rechaza desde su página, y
--                       un presupuesto nuevo a partir de otro (Enzo, 24-11-2026)
--
-- QUÉ RESUELVE:
--   · En la página donde el cliente ve el presupuesto solo se podía aceptar y
--     firmar. Ahora puede «Solicitar modificaciones» (con un comentario) o
--     «Rechazar el presupuesto» (con el motivo, si quiere). Lo que escribe se
--     guarda en el presupuesto y queda pendiente hasta que alguien lo ve:
--       comentario_cliente       lo que escribió la última vez
--       comentario_cliente_tipo  modificacion · rechazo
--       comentario_cliente_at    cuándo
--       comentario_visto_at/por  cuándo y quién lo dio por visto (null = pendiente)
--     El rechazo, además, pone respuesta_cliente = 'rechazado' y motivo_rechazo,
--     como cuando se marca a mano. Pedir cambios NO cambia respuesta_cliente:
--     el presupuesto sigue esperando respuesta.
--     El historial queda en la ficha del cliente (cliente_bitacora).
--   · «Guardar como presupuesto nuevo» al modificar uno: el nuevo apunta al
--     presupuesto del que sale (copia_de) y el original no se toca.
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.presupuestos add column if not exists comentario_cliente text;
alter table public.presupuestos add column if not exists comentario_cliente_tipo text;
alter table public.presupuestos add column if not exists comentario_cliente_at timestamptz;
alter table public.presupuestos add column if not exists comentario_visto_at timestamptz;
alter table public.presupuestos add column if not exists comentario_visto_por uuid references public.empleados(id) on delete set null;
alter table public.presupuestos add column if not exists copia_de uuid references public.presupuestos(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuestos_comentario_tipo_chk') then
    alter table public.presupuestos add constraint presupuestos_comentario_tipo_chk
      check (comentario_cliente_tipo is null or comentario_cliente_tipo in ('modificacion', 'rechazo'));
  end if;
end $$;

comment on column public.presupuestos.comentario_cliente is 'Lo último que escribió el cliente en la página del presupuesto al pedir cambios o rechazarlo.';
comment on column public.presupuestos.comentario_cliente_tipo is 'modificacion · rechazo.';
comment on column public.presupuestos.comentario_visto_at is 'Cuándo se dio por visto el comentario del cliente. Null con comentario_cliente_at = pendiente de atender (sale en la pantalla principal).';
comment on column public.presupuestos.copia_de is 'El presupuesto del que salió este al «Guardar como presupuesto nuevo». El original no se toca.';

-- Los pendientes se buscan a menudo y son pocos.
create index if not exists presupuestos_comentario_pendiente_idx on public.presupuestos (comentario_cliente_at)
  where comentario_cliente_at is not null and comentario_visto_at is null;

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select tl_numero, titulo, comentario_cliente_tipo, comentario_cliente_at, comentario_visto_at, left(comentario_cliente, 80)
--     from public.presupuestos where comentario_cliente_at is not null order by comentario_cliente_at desc;
-- =============================================================================
