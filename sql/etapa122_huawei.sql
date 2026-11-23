-- =============================================================================
-- Sysefen · etapa 122 · Huawei: inversores, baterías LUNA y accesorios
--                       (Enzo, 23-11-2026)
--
-- Enzo: «esto es para agregar otra marca de inversores y baterías… ¿podrías
-- agregarlo al motor con su funcionalidad y tal como corresponde?»
--
-- ESTE ARCHIVO NO LLEVA PRECIOS (el repo es público). Los productos los pone
-- herramientas/sql-tarifa-huawei.py leyendo huawei-baywa-2026.csv de la carpeta
-- de tarifas del Drive, y deja el SQL completo en subir-a-supabase/:
--   python3 herramientas/sql-tarifa-huawei.py
--   herramientas/supabase-sql.sh subir-a-supabase/etapa122_huawei_completo.sql
--
-- DE DÓNDE SALEN: catálogo Huawei de BayWa r.e. Solar Shop España, consultado el
-- 23-11-2026 con la sesión de Sysefen: precio unitario de cliente, que se toma
-- como coste sin IVA (la tienda es para profesionales; no confirmado). No se usa
-- el precio por volumen ni el «nivel de precio 142», que no se sabe qué es.
--
-- QUÉ ENTRA (81 de las 162 referencias):
--   · 24 inversores, familia «inversor»: son los que el presupuestador puede
--     elegir. Monofásicos: SUN2000-3K a 6K-LB0 y 8K/10K-LC0. Trifásicos: 5K a
--     12K-MAP0, 3/8/10KTL-M1 (fin de existencias: solo a mano), 12K a 25K-MB0 y
--     30K a 50K-MC0. Todos admiten batería LUNA2000 menos los MC0, que no se ha
--     comprobado (atributo hibrido). Fases y baterías, de las fichas de Huawei.
--   · 6 inversores de 100 kW o más, familia «equipo»: están en el catálogo pero
--     el presupuestador no los elige solo (varios son de 800 V, para plantas).
--   · 2 baterías, familia «bateria»: los módulos LUNA2000-5-S1 (5 kWh) y
--     LUNA2000-7-S1 (6,9 kWh). Llevan apuntado su «Base y módulo de control»:
--     hace falta uno por cada tres módulos, y el presupuesto lo pone solo.
--   · 4 medidores, familia «contador»; 2 SmartGuard, familia «backup».
--   · 41 accesorios (base de control y soportes de la batería, optimizadores,
--     Smart Dongle, SmartLogger, paquetes de accesorios…) y 2 cargadores de coche.
-- QUÉ NO ENTRA: los 17 kits (la tienda no da su precio), las 57 extensiones de
--   garantía y las 7 referencias genéricas de proyecto (LUNA C&I y Utility,
--   Smart Transformer Station, Ultra Fast), cuyo precio no vale para presupuestar.
--
-- VENTA: entraron con recargo 1,30, el que fotovoltaica aplica por defecto; el
--   mismo día Enzo pidió el 35 % de margen (recargo 1,538462, sql/etapa123) y
--   así entra lo nuevo. Se cambia en Ajustes → Precios. En el presupuesto
--   llave en mano el inversor y el medidor van, como todo, al margen del modelo.
--
-- EL MEDIDOR, en el modelo fotovoltaico (precios.huawei_medidor): Smart Power
--   Sensor monofásico (SmartPS-100A-S0) o trifásico (SmartPS-250A-T0), a su
--   precio de BayWa. Se cambia en Ajustes → Precios.
--
-- Idempotente: los productos se rehacen con el precio del CSV (los que alguien
-- haya cambiado a mano en la app vuelven al de la tarifa: mirar precios_cambios).
-- =============================================================================

begin;

-- <<PRODUCTOS: los pone herramientas/sql-tarifa-huawei.py>>

-- <<MEDIDOR: lo pone herramientas/sql-tarifa-huawei.py>>

commit;

-- =============================================================================
-- COMPROBACIÓN
--   select familia, count(*), min(precio_tarifa), max(precio_tarifa) from public.productos
--    where atributos ->> 'marca' = 'huawei' group by familia order by familia;
--   select datos #> '{precios,huawei_medidor}' from public.motor_modelos where categoria = 'solar' and vigente_hasta is null;
-- =============================================================================
