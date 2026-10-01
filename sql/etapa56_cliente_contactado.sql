-- =============================================================================
-- Sysefen · Etapa 56 · «Contactado» / «No cogió el teléfono»: quién llamó a
--                      cada cliente, cuándo y qué pasó
--
-- POR QUÉ:
--   Los clientes que entran por la web (y los que se dan de alta sin cita) se
--   quedaban en la lista sin que nadie supiera si alguien ya había hablado con
--   ellos. Ahora cada cliente puede marcarse como «Contactado» o como «No cogió
--   el teléfono»: queda la fecha, quién fue y cuántas veces se ha intentado.
--   En la lista, los que no tienen cita y nadie ha llamado salen en rojo; los
--   contactados dicen «Contactado · 1 oct · Ramón»; los que no contestan,
--   «No cogió el teléfono · 1 oct · Ramón · 2 intentos».
--
-- Idempotente. No toca ningún dato.
-- =============================================================================

begin;

alter table public.clientes_cache add column if not exists contacto_estado   text check (contacto_estado in ('contactado', 'no_contesta'));
alter table public.clientes_cache add column if not exists contacto_at       timestamptz;
alter table public.clientes_cache add column if not exists contacto_por      uuid references public.empleados(id) on delete set null;
alter table public.clientes_cache add column if not exists contacto_intentos int not null default 0;

comment on column public.clientes_cache.contacto_estado   is 'Null = nadie lo ha llamado. contactado = se habló con él. no_contesta = se le llamó y no cogió.';
comment on column public.clientes_cache.contacto_at       is 'Última vez que se le llamó desde la app.';
comment on column public.clientes_cache.contacto_por      is 'Quién llamó la última vez (empleados.id).';
comment on column public.clientes_cache.contacto_intentos is 'Cuántas llamadas se han apuntado (contestadas o no).';

commit;

-- =============================================================================
-- COMPROBACIÓN · los que nadie ha contactado y no tienen cita:
--   select c.nombre, c.origen, c.contacto_estado, c.contacto_intentos, c.created_at from public.clientes_cache c
--    where c.contacto_estado is distinct from 'contactado'
--      and not exists (select 1 from public.citas x where x.cliente_id = c.id and x.estado = 'pendiente')
--    order by c.created_at desc;
-- =============================================================================
