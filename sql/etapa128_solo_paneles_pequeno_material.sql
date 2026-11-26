-- Sysefen · Etapa 128 · Añadir paneles a una instalación existente (Enzo, 26 nov 2026)
--   «Hacer un presupuesto para solo agregar paneles… solo montaje y paneles, y los cables no
--   hacen falta, ya que se conecta al string que haya al lado… solo algo de pequeño material de
--   conexión, unos 30 € por panel.»
--   El motor (presupuestar · hibrido.js · presupuestarSoloPaneles) pone los paneles, su
--   estructura y el montaje; el pequeño material es este producto del catálogo propio, uno por
--   panel. Venta fija (sin recargo): el precio se cambia en Ajustes → Precios. Idempotente.

insert into public.productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, iva, detalle_tecnico, atributos, activo)
select t.id, 'SY-PEQUENO-MATERIAL-ELECTRICO-AMPLIACION-PANELES', 'Pequeño material eléctrico de conexión (por panel)', 'consumible', 'ud', 30, 0, 21,
       'Conectores, bridas, terminales y pequeño material para conectar los paneles nuevos al string existente',
       '{"propio": true, "sin_recargo": true, "motor": "solo_paneles"}'::jsonb, true
from public.tarifas t
where t.nombre = 'Catálogo propio'
  and not exists (select 1 from public.productos p where p.referencia = 'SY-PEQUENO-MATERIAL-ELECTRICO-AMPLIACION-PANELES');

select referencia, nombre, familia, unidad, precio_tarifa, recargo, atributos, activo
from public.productos where referencia = 'SY-PEQUENO-MATERIAL-ELECTRICO-AMPLIACION-PANELES';
