begin;

-- Permitir varias líneas de la misma categoría el mismo día, por ejemplo el
-- desplazamiento de IDA y el de VUELTA por separado.
--
-- Antes había una regla de "una línea por persona, día, categoría y obra". Se
-- quita. No abre ningún agujero: el trigger imputaciones_no_superar_presencia
-- suma TODAS las líneas del día y sigue impidiendo imputar más que la jornada
-- fichada. proponer_imputaciones (versión de la etapa 6) no depende de la regla.
alter table public.imputaciones drop constraint if exists imputaciones_unica;

commit;
