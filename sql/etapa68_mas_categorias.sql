-- =============================================================================
-- Sysefen · Etapa 68 · Más cosas que puede llevar una obra
--
-- POR QUÉ:
--   Una obra solo podía ser aerotermia (AE), fotovoltaica (FV) o aire (AC).
--   Faltaban instalación eléctrica, baterías, cargador de coche y un «otro»
--   para lo que surja, con su nombre escrito al momento (obras.categoria_otra).
--
-- QUÉ CAMBIA:
--   · categorias_validas() admite EL, BAT, CC y OT.
--   · Los checks de categoría de fase_plantillas, obra_fases, obra_costes y
--     partes admiten las nuevas.
--   · Fases de plantilla para EL, BAT y CC (OT no lleva fases propias: se le
--     añaden a mano en la obra).
--
-- Requiere las etapas 58, 59, 61 y 63. Idempotente.
-- =============================================================================

begin;

create or replace function public.categorias_validas(c text[])
returns boolean
language sql
immutable
as $$ select c is not null and c <@ array['AE', 'FV', 'AC', 'EL', 'BAT', 'CC', 'OT']::text[] $$;

alter table public.obras add column if not exists categoria_otra text;
comment on column public.obras.categoria_otra is 'Qué es el «otro» (OT) de esta obra, escrito al crearla: «domótica», «pérgola»…';

alter table public.fase_plantillas drop constraint if exists fase_plantillas_categoria_check;
alter table public.fase_plantillas add constraint fase_plantillas_categoria_check
  check (categoria is null or categoria in ('AE', 'FV', 'AC', 'EL', 'BAT', 'CC', 'OT'));
alter table public.obra_fases drop constraint if exists obra_fases_categoria_check;
alter table public.obra_fases add constraint obra_fases_categoria_check
  check (categoria is null or categoria in ('AE', 'FV', 'AC', 'EL', 'BAT', 'CC', 'OT'));
alter table public.obra_costes drop constraint if exists obra_costes_categoria_check;
alter table public.obra_costes add constraint obra_costes_categoria_check
  check (categoria is null or categoria in ('AE', 'FV', 'AC', 'EL', 'BAT', 'CC', 'OT'));
alter table public.partes drop constraint if exists partes_categoria_valida;
alter table public.partes add constraint partes_categoria_valida
  check (categoria is null or categoria in ('AE', 'FV', 'AC', 'EL', 'BAT', 'CC', 'OT'));

-- Fases de las categorías nuevas (se pueden retocar en Ajustes → Fases por categoría).
insert into public.fase_plantillas (categoria, orden, nombre, descripcion, al_final) values
  ('EL', 410, 'Canalizaciones y cajas',      'Tubos, bandejas y cajas de registro', false),
  ('EL', 420, 'Cableado',                    'Tirada de líneas y conexionado', false),
  ('EL', 430, 'Cuadro y protecciones',       'Cuadro eléctrico, diferenciales y magnetotérmicos', false),
  ('EL', 440, 'Mecanismos y luminarias',     'Enchufes, interruptores y puntos de luz', false),
  ('EL', 450, 'Pruebas y puesta en servicio','Comprobaciones y puesta en servicio', false),
  ('EL', 460, 'Boletín',                     'Certificado de instalación eléctrica', false),
  ('BAT', 510, 'Ubicación y soporte',        'Sitio, bancada o pared para las baterías', false),
  ('BAT', 520, 'Montaje de baterías',        'Módulos de batería y cableado entre ellos', false),
  ('BAT', 530, 'Conexión al inversor',       'Cableado de continua y protecciones', false),
  ('BAT', 540, 'Configuración y puesta en marcha', 'Parámetros, modo de respaldo y pruebas', false),
  ('CC', 610, 'Línea y protecciones',        'Línea desde el cuadro, diferencial y magnetotérmico', false),
  ('CC', 620, 'Montaje del cargador',        'Cargador fijado y conectado', false),
  ('CC', 630, 'Puesta en marcha',            'Configuración, app del fabricante y prueba de carga', false),
  ('CC', 640, 'Legalización',                'Memoria técnica y boletín', false)
on conflict do nothing;

commit;

-- COMPROBACIÓN
--   select categoria, orden, nombre from public.fase_plantillas where categoria in ('EL','BAT','CC') order by orden;
