-- =============================================================================
-- Etapa 110 · Nota al final del presupuesto y tipo «Otro» (Enzo, 13-11-2026)
--
-- «Debería haber una sección al final del presupuesto donde sea capaz de agregar
-- una nota u observación o lo que sea.» → presupuestos.observaciones: texto
-- libre que escribe quien presupuesta y que ve el cliente (PDF y página de
-- «ver y aceptar»), debajo de las líneas.
--
-- «Debería haber otro tipo de presupuesto… uno que diga otro o escribir un
-- tipo.» → la categoría 'otro' (la columna categoria es texto libre, no hay
-- restricción que tocar) y presupuestos.categoria_texto: el tipo escrito a mano
-- («Cargador de coche», «Reforma»…), solo cuando la categoría es 'otro'.
--
-- Se puede ejecutar dos veces.
-- =============================================================================
alter table public.presupuestos add column if not exists observaciones   text;
alter table public.presupuestos add column if not exists categoria_texto text;
