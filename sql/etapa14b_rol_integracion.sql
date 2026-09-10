-- =============================================================================
-- Sysefen · Etapa 14b · Crear el usuario que usará Make
--
-- ES UNA SOLA LÍNEA DE VERDAD. Cambia únicamente lo que va entre comillas.
--
--   1. Sustituye  CAMBIA_ESTA_CLAVE  por una clave larga tuya.
--   2. NO toques las comillas ' ' ni el punto y coma del final.
--   3. Ejecuta este archivo.
--   4. Vuelve a ejecutar etapa14_horas_export.sql para que le dé los permisos.
--
-- Para generar una clave buena, en el Terminal:  openssl rand -base64 24
-- Sin comillas simples dentro de la clave: romperían la sentencia.
--
-- Esta clave NO se guarda en el repositorio. Va solo aquí, en el momento de
-- ejecutarla, y luego en Make.
-- =============================================================================

create role sysefen_integracion login password 'CAMBIA_ESTA_CLAVE';


-- ¿Ya lo habías creado antes y quieres cambiarle la clave? Usa esta otra en su
-- lugar (borra la línea de arriba y descomenta esta):
--
-- alter role sysefen_integracion password 'CAMBIA_ESTA_CLAVE';
