-- =============================================================================
-- Sysefen · Etapa 53 · Cada línea del presupuesto con su leyenda
--
-- POR QUÉ:
--   Debajo de cada línea la app enseñaba la unidad y de dónde había salido
--   («regla», «partida»), que es cosa del motor y al cliente no le dice nada.
--   Ahora enseña el DETALLE de la línea, el mismo que va al PDF. Las máquinas
--   ya lo traen de la tarifa; a las partidas de Sysefen que no lo tenían se
--   les pone aquí.
--
-- Idempotente: solo rellena los detalles vacíos; el que ya esté escrito, se
-- respeta.
-- =============================================================================

begin;

update public.partidas_items pi
   set detalle_tecnico = v.detalle
  from public.partidas p,
       (values
         -- aire acondicionado
         ('aire_acondicionado', 'KIT_BASE', 'C102:%', 'Soportes murales o de suelo para la unidad exterior, con tacos y antivibratorios'),
         ('aire_acondicionado', 'KIT_BASE', 'C104:%', 'Montaje de las unidades, conexión frigorífica y eléctrica, vacío, prueba de estanqueidad y puesta en marcha'),
         -- fotovoltaica: el kit de 5–6 kWp
         ('solar', 'KIT_BASE', 'Material eléctrico', 'Cableado de continua y alterna, protecciones, cuadro fotovoltaico y pequeño material'),
         ('solar', 'KIT_BASE', 'Estructura de soportación', 'Estructura de aluminio para los módulos, adaptada a la cubierta'),
         ('solar', 'KIT_BASE', 'Trámites en D.G. Industria', 'Memoria técnica, registro de la instalación y certificado de instalación eléctrica'),
         ('solar', 'KIT_BASE', 'Gestiones documentales', 'Legalización, comunicación a la distribuidora y alta del autoconsumo'),
         ('solar', 'KIT_BASE', 'Puesta en marcha y monitorización', 'Puesta en marcha de la instalación y alta en la aplicación de monitorización del fabricante'),
         -- aerotermia
         ('aerotermia', 'KIT_BASE', 'A100:%', 'Tuberías, valvulería, vaso de expansión, aislamiento y pequeño material hidráulico de la instalación'),
         ('aerotermia', 'KIT_BASE', 'A101:%', 'Línea de alimentación, protecciones y cableado de comunicación entre unidades'),
         ('aerotermia', 'KIT_BASE', 'A102:%', 'Montaje de las unidades, conexión hidráulica y eléctrica, llenado, purga y puesta en marcha'),
         ('aerotermia', 'KIT_BASE', 'A104:%', 'Memoria técnica, registro en Industria y certificados de la instalación'),
         ('aerotermia', 'KIT_BASE', 'A105:%', 'Tramitación de la subvención o de la comunicación a la distribuidora')
       ) as v(categoria, codigo, patron, detalle)
 where pi.partida_id = p.id
   and p.categoria = v.categoria and p.codigo = v.codigo
   and pi.concepto_libre like v.patron
   and (pi.detalle_tecnico is null or pi.detalle_tecnico = '');

commit;

-- =============================================================================
-- COMPROBACIÓN · lo que sigue sin detalle:
--   select p.categoria, p.codigo, pi.concepto_libre from public.partidas p
--     join public.partidas_items pi on pi.partida_id = p.id
--    where pi.concepto_libre is not null and (pi.detalle_tecnico is null or pi.detalle_tecnico = '')
--    order by 1, 2;
-- =============================================================================
