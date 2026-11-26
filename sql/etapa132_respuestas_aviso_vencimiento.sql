-- Sysefen · Etapa 132 · Respuestas del cliente al aviso de vencimiento (Enzo, 26 nov 2026)
--   «A los avisos de vencimiento quiero que se pregunte si es necesaria una segunda visita para
--   solventar dudas y si sigue considerando seguir adelante con la instalación.»
--   El cliente contesta desde su página con un toque: además de pedir cambios o rechazar
--   (etapa127), puede pedir una segunda visita ('visita') o decir que sigue interesado y
--   necesita más tiempo ('tiempo'). Se guarda en las mismas columnas comentario_cliente_*.
--   Idempotente.

alter table public.presupuestos drop constraint if exists presupuestos_comentario_tipo_chk;
alter table public.presupuestos add constraint presupuestos_comentario_tipo_chk
  check (comentario_cliente_tipo is null or comentario_cliente_tipo in ('modificacion', 'rechazo', 'visita', 'tiempo'));

select pg_get_constraintdef(oid) as tipos from pg_constraint where conname = 'presupuestos_comentario_tipo_chk';
