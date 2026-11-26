-- Sysefen · Etapa 129 · Los datos con los que se calculó cada presupuesto (Enzo, 26 nov 2026)
--   «Cuando quiera modificar un presupuesto, que pueda hacerlo modificando datos del mismo y
--   recalculando, manteniendo los datos que se usaron en el motor.»
--   Hasta ahora un presupuesto sin visita no guardaba lo que se le preguntó (paneles, cubierta,
--   kW, estancias…): solo sus líneas. Desde aquí la función `presupuestar` lo deja en
--   `datos_motor` al guardar: { v, origen: 'suelto' | 'visita', libre, datos (lo que recibió el
--   motor), app (el formulario y los retoques de la pantalla, para volver a abrirla igual), at, por }.
--   Los presupuestos anteriores se quedan sin él. Idempotente.

alter table public.presupuestos add column if not exists datos_motor jsonb;
comment on column public.presupuestos.datos_motor is 'Con qué datos se calculó (función presupuestar): { v, origen, libre, datos, app, at, por }. Para «Cambiar los datos y recalcular».';

select count(*) as columna from information_schema.columns where table_schema = 'public' and table_name = 'presupuestos' and column_name = 'datos_motor';
