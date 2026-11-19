-- =============================================================================
-- Sysefen · etapa 118 · material de fotovoltaica aislada (Enzo, 19-11-2026)
--
-- Enzo: «agrega estas cosas, servirán para hacer presupuesto de fotovoltaica
-- aisladas». Son dos ofertas de proveedor que Ramón pasó por WhatsApp el
-- 19-11-2026: Victron (Cerbo, GX Touch, MultiPlus-II, MPPT, cables, fusibles,
-- interruptor de batería) y el BMU de BYD.
--
-- DÓNDE: tarifa «Fotovoltaica 2026», como el resto del material fotovoltaico.
-- PRECIO: como en esa tarifa, precio_tarifa = coste neto (PVP del proveedor
--   menos su descuento) y descuento 0. El PVP y el descuento de la oferta quedan
--   en atributos (pvp_proveedor, dto_proveedor_pct).
-- VENTA: recargo 1,30, que es el recargo por defecto de fotovoltaica para lo que
--   no trae el suyo (tablas_lookup.recargo_sobre_coste). No se ha decidido un
--   margen propio para Victron: se cambia en Ajustes → Precios.
-- FAMILIA: el MultiPlus-II y el MPPT van como «equipo», NO como «inversor»: el
--   presupuestador fotovoltaico elige solo entre todo lo que sea familia
--   «inversor», y un inversor-cargador de aislada no vale para una instalación
--   conectada a red.
-- TRES REFERENCIAS VENÍAN EN LAS DOS OFERTAS con distinto precio (cable VE.Can,
--   portafusibles y MEGA-fuse 400 A): se toma la del primer mensaje (40 % de
--   descuento), que lleva el PVP más alto del cable (15 € frente a 13 €) y
--   parece la tarifa más nueva. No confirmado.
-- NO SE AÑADE el módulo BYD LVL 15.4 kWh [BYD-1001-02]: ya está en el catálogo
--   como «BYD Premium LVL 15.4» (FV-BYD-PREMIUM-LVL-15.4) a 3.935,52 € de coste.
--   La oferta de Ramón lo da a 4.026,00 € (6.600 € − 39 %). No se ha tocado.
--
-- Idempotente: lo que ya esté (misma tarifa y referencia) no se toca.
-- =============================================================================

insert into public.productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, iva, especificaciones, atributos, activo, recargo, aplica_cdc)
select (select id from public.tarifas where nombre = 'Fotovoltaica 2026'), v.referencia, v.nombre, v.familia, 'ud', v.coste, 0, 21, '[]'::jsonb, v.atributos, true, 1.3, false
from (values
  ('BPP900451100', 'VICTRON Cerbo GX MK2', 'controlador', 159.00, '{"marca": "victron", "aislada": true, "pvp_proveedor": 265.0, "dto_proveedor_pct": 40, "oferta": "19-11-2026 (Ramón), mensaje 1"}'::jsonb),
  ('BPP900450110', 'VICTRON Cerbo GX', 'controlador', 172.25, '{"marca": "victron", "aislada": true, "pvp_proveedor": 265.0, "dto_proveedor_pct": 35, "oferta": "19-11-2026 (Ramón), mensaje 2"}'::jsonb),
  ('BPP900455070', 'VICTRON GX Touch 70', 'accesorio', 207.60, '{"marca": "victron", "aislada": true, "pvp_proveedor": 346.0, "dto_proveedor_pct": 40, "oferta": "19-11-2026 (Ramón), mensaje 1"}'::jsonb),
  ('BPP900455050', 'VICTRON GX Touch 50', 'accesorio', 152.75, '{"marca": "victron", "aislada": true, "pvp_proveedor": 235.0, "dto_proveedor_pct": 35, "oferta": "19-11-2026 (Ramón), mensaje 2"}'::jsonb),
  ('PMP483105000', 'VICTRON MultiPlus-II 48/10000/140-100', 'equipo', 1204.45, '{"marca": "victron", "aislada": true, "pvp_proveedor": 1853.0, "dto_proveedor_pct": 35, "oferta": "19-11-2026 (Ramón), mensaje 2"}'::jsonb),
  ('SCC125110412', 'VICTRON SmartSolar MPPT 250/100-Tr VE.Can', 'equipo', 425.10, '{"marca": "victron", "aislada": true, "pvp_proveedor": 654.0, "dto_proveedor_pct": 35, "oferta": "19-11-2026 (Ramón), mensaje 2"}'::jsonb),
  ('ASS030710150', 'VICTRON Cable VE.Can a CAN-bus BMS tipo A 5 m', 'accesorio', 9.00, '{"marca": "victron", "aislada": true, "pvp_proveedor": 15.0, "dto_proveedor_pct": 40, "oferta": "19-11-2026 (Ramón), mensaje 1"}'::jsonb),
  ('ASS030065001', 'VICTRON Cable RJ45 UTP 5 m', 'accesorio', 10.20, '{"marca": "victron", "aislada": true, "pvp_proveedor": 17.0, "dto_proveedor_pct": 40, "oferta": "19-11-2026 (Ramón), mensaje 1"}'::jsonb),
  ('ASS030064981', 'VICTRON Cable RJ45 UTP 3 m', 'accesorio', 8.45, '{"marca": "victron", "aislada": true, "pvp_proveedor": 13.0, "dto_proveedor_pct": 35, "oferta": "19-11-2026 (Ramón), mensaje 2"}'::jsonb),
  ('ASS030530230', 'VICTRON Cable VE.Direct 3 m', 'accesorio', 10.40, '{"marca": "victron", "aislada": true, "pvp_proveedor": 16.0, "dto_proveedor_pct": 35, "oferta": "19-11-2026 (Ramón), mensaje 2"}'::jsonb),
  ('CIP000100001', 'VICTRON Portafusibles para MEGA-fuse', 'accesorio', 7.20, '{"marca": "victron", "aislada": true, "pvp_proveedor": 12.0, "dto_proveedor_pct": 40, "oferta": "19-11-2026 (Ramón), mensaje 1"}'::jsonb),
  ('CIP138400020', 'VICTRON MEGA-fuse 400 A / 80 V', 'accesorio', 4.56, '{"marca": "victron", "aislada": true, "pvp_proveedor": 7.6, "dto_proveedor_pct": 40, "oferta": "19-11-2026 (Ramón), mensaje 1"}'::jsonb),
  ('CIP138125020', 'VICTRON MEGA-fuse 125 A / 80 V', 'accesorio', 4.94, '{"marca": "victron", "aislada": true, "pvp_proveedor": 7.6, "dto_proveedor_pct": 35, "oferta": "19-11-2026 (Ramón), mensaje 2"}'::jsonb),
  ('VBS127010010', 'VICTRON Interruptor de batería ON/OFF 275 A', 'accesorio', 22.20, '{"marca": "victron", "aislada": true, "pvp_proveedor": 37.0, "dto_proveedor_pct": 40, "oferta": "19-11-2026 (Ramón), mensaje 1"}'::jsonb),
  ('BYD-1003-02', 'BYD BMU Battery Box para LVS-LVL IP55', 'accesorio', 107.36, '{"marca": "byd", "aislada": true, "pvp_proveedor": 176.0, "dto_proveedor_pct": 39, "oferta": "19-11-2026 (Ramón), mensaje 1"}'::jsonb)
) as v (referencia, nombre, familia, coste, atributos)
on conflict (tarifa_id, referencia) do nothing;

-- =============================================================================
-- COMPROBACIÓN
--   select referencia, nombre, familia, precio_tarifa, recargo, round(precio_tarifa * recargo, 2) as venta
--     from public.productos where atributos ->> 'aislada' = 'true' order by nombre;
-- =============================================================================
