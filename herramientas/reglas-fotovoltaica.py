#!/usr/bin/env python3
"""
Sysefen · Las reglas de fotovoltaica (sql/etapa47) a partir de la tarifa

QUÉ HACE:
  Lee la tarifa de fotovoltaica (fotovoltaica-2026.csv, en la carpeta de
  tarifas del Drive) y escribe:
    · etapa47_tarifa_fotovoltaica.sql   en la carpeta APPS del Drive: los
                                        productos y las reglas, para pegar en
                                        el SQL Editor de Supabase
    · fotovoltaica-reglas.json          en la carpeta de tarifas: lo mismo,
                                        para pruebas/motor-solar.js

  NINGUNO DE LOS DOS VA AL REPO: llevan los precios del distribuidor y el
  repo es público. Aquí solo están las reglas, sin un precio.

  Las reglas están aquí abajo, escritas una vez: el SQL y las pruebas salen de
  lo mismo y no se pueden desincronizar.

POR QUÉ UN SQL Y NO cargar-tarifa.py:
  Así se sube todo de una vez desde el SQL Editor, sin tener que ejecutar nada
  con la clave secreta.

CÓMO SE USA:
  python3 herramientas/reglas-fotovoltaica.py
  (y después pegar APPS/etapa47_tarifa_fotovoltaica.sql en el SQL Editor)

PARA CAMBIAR UN PRECIO: se cambia en el CSV y se vuelve a ejecutar esto.
"""
import csv, json, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.environ.get('SYSEFEN_TARIFAS') or os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app')

APPS = os.path.dirname(RAIZ)

filas = list(csv.DictReader(open(os.path.join(CARPETA, 'fotovoltaica-2026.csv'), encoding='utf-8')))

CABECERA = r'''-- =============================================================================
-- Sysefen · Etapa 47 · La tarifa de fotovoltaica y sus reglas
--
-- QUÉ SE MONTA:
--   · La tarifa «Fotovoltaica 2026»: 124 productos de Fronius, Enphase, BYD y
--     Tesla, sacados de las capturas de la tienda del distribuidor. Los precios
--     van TAL CUAL, sin IVA y como precio de venta (sin margen encima).
--     Las capturas no traen referencias: la referencia es un código propio
--     (FV-…) sacado del nombre. Donde ponía «Desde», es el precio más bajo de
--     las variantes.
--   · Las reglas que eligen el equipo:
--
--     FRONIUS (por defecto)
--       inversor GEN24 según los kW que hacen falta (kWp / 1,2), mono o tri,
--       y Plus solo si la batería va en continua (BYD o Reserva) o se deja
--       preparado. Sin batería, el GEN24 normal.
--       + Smart Meter siempre (TS 100A-1 mono, TS 65A-3 tri).
--       Baterías: BYD (por defecto), Fronius Reserva o Tesla.
--       Backup, si lleva batería y se pide: Backup Switch (Tesla: Gateway 2).
--
--     ENPHASE
--       un microinversor por panel (IQ8HC hasta 540 Wp, IQ8P por encima),
--       + un Q Cable por micro, un tapón y un conector de campo por rama
--         (11 micros por rama), IQ Gateway Metered y sus toroidales.
--       Baterías: Enphase IQ Battery 5P (por defecto) o Tesla.
--       Backup, si lleva batería y se pide: IQ System Controller
--       (Tesla: Backup Gateway 2).
--
--     Combinaciones que no van (Enphase con BYD, backup sin batería…) no ponen
--     línea: dejan un aviso en el presupuesto. Para eso hay un tipo de regla
--     nuevo, 'aviso'.
--
--   · Salen los inversores a precio cerrado (1.610 y 2.100 €) y el medidor
--     de 110 € del kit pequeño, que ahora es el Smart Meter o el Gateway.
--
-- LO QUE SIGUE SIN ESTAR:
--   · Paneles Trina: siguen a 110 €/ud, no venían en estas capturas.
--   · El kit de 10 kWp sigue en una línea de 8.560 € y lleva su medidor
--     dentro: con Fronius o Enphase se cobra el medidor dos veces (unos
--     70–290 €) hasta que se desglose.
--   · Más de 10 kW mono / 12 kW tri de inversor: Verto a mano (sale aviso).
--
-- REQUIERE: la función `presupuestar` nueva (entiende las reglas 'aviso').
-- Idempotente: se puede volver a ejecutar; las reglas FV se rehacen.
-- =============================================================================

'''

PIE = r'''
-- =============================================================================
-- COMPROBACIONES
--   Los productos cargados (124):
--   select count(*) from public.productos p join public.tarifas t on t.id = p.tarifa_id
--    where t.nombre = 'Fotovoltaica 2026';
--
--   Las reglas de fotovoltaica activas:
--   select r.tipo, r.variable, r.minimo, r.maximo, r.condicion, r.producto_ref, r.formula_cantidad
--     from public.reglas r join public.conjuntos_reglas c on c.id = r.conjunto_id
--    where c.categoria = 'solar' and r.activa order by r.prioridad desc, r.producto_ref;
--
--   Para cambiar la relación paneles/inversor, los micros por rama o los kWh de
--   batería por defecto: tablas_lookup (categoria 'solar').
-- =============================================================================
'''

R={x['nombre']:x['referencia'] for x in filas}
P={x['referencia']:x for x in filas}
def ref(nombre):
    return R[nombre]
q=lambda s: "'"+str(s).replace("'","''")+"'"

reglas=[]  # (tipo, variable, min, max, condicion, producto, formula, seccion, prioridad, notas)
def regla(prod, cond, formula='1', seccion='Equipos', prio=55, notas=None, tipo='cantidad', var=None, mn=None, mx=None):
    if prod: assert prod in P, prod
    reglas.append((tipo,var,mn,mx,cond,prod,formula,seccion,prio,notas))

# El medidor y el controlador van con la instalación de paneles. Una batería
# sola (para una instalación que ya existe) no los pide.
HAY_PANELES = 'si(n_paneles > 0, 1, 0)'

# --- Fronius: inversor por potencia AC mínima, fases y si lleva batería en continua
fr = {
 (1,0): [(3.0,'Fronius Primo GEN24 SC 3.0'),(3.6,'Fronius Primo GEN24 SC 3.6'),(4.0,'Fronius Primo GEN24 SC 4.0'),
         (4.6,'Fronius Primo GEN24 SC 4.6'),(5.0,'Fronius Primo GEN24 SC 5.0'),(6.0,'Fronius Primo GEN24 SC 6.0'),
         (8.0,'Fronius Primo GEN24 8.0KW'),(10.0,'Fronius Primo GEN24 10.0KW')],
 (1,1): [(3.0,'Fronius Primo GEN24 SC 3.0 Plus'),(3.6,'Fronius Primo GEN24 SC 3.6 Plus'),(4.0,'Fronius Primo GEN24 SC 4.0 Plus'),
         (4.6,'Fronius Primo GEN24 SC 4.6 Plus'),(5.0,'Fronius Primo GEN24 SC 5.0 Plus'),(6.0,'Fronius Primo GEN24 SC 6.0 Plus'),
         (8.0,'Fronius Primo GEN24 8.0 Plus'),(10.0,'Fronius Primo GEN24 10.0 Plus')],
 (3,0): [(3.0,'FRONIUS Symo GEN24 SC 3.0'),(4.0,'FRONIUS Symo GEN24 SC 4.0'),(5.0,'FRONIUS Symo GEN24 SC 5.0'),
         (6.0,'FRONIUS Symo GEN24 SC 6.0'),(8.0,'FRONIUS Symo GEN24 SC 8.0'),(10.0,'FRONIUS Symo GEN24 SC 10.0'),
         (12.0,'FRONIUS Symo GEN24 SC 12.0')],
 (3,1): [(3.0,'FRONIUS Symo GEN24 SC 3.0 Plus'),(4.0,'FRONIUS Symo GEN24 SC 4.0 Plus'),(5.0,'Fronius Symo GEN24 SC 5.0 Plus'),
         (6.0,'FRONIUS Symo GEN24 SC 6.0 Plus'),(8.0,'FRONIUS Symo GEN24 SC 8.0 Plus'),(10.0,'FRONIUS Symo GEN24 SC 10.0 Plus'),
         (12.0,'Fronius Symo GEN24 SC 12.0 Plus')],
}
for (fases,dc),lista in fr.items():
    prev=0
    for kw,nombre in lista:
        regla(ref(nombre),{'marca_inversor':'fronius','fases':fases,'bateria_dc':dc},tipo='seleccion',var='kw_inversor',
              mn=round(prev+0.001,3) if prev else 0.001, mx=kw, prio=58,
              notas=f"Fronius {'trifásico' if fases==3 else 'monofásico'}{' con batería en continua (Plus)' if dc else ''}: hasta {kw} kW de alterna.")
        prev=kw
    regla(None,{'marca_inversor':'fronius','fases':fases,'bateria_dc':dc},tipo='aviso',var='kw_inversor',mn=round(prev+0.001,3),mx=None,prio=58,
          notas=f"Hace falta un inversor de más de {prev} kW: por encima de eso el inversor Fronius (Verto) se elige a mano.")
# Fronius siempre lleva su Smart Meter
regla(ref('FRONIUS Smart Meter TS 100A-1'),{'marca_inversor':'fronius','fases':1},formula=HAY_PANELES,seccion='Monitorización',prio=57,notas='Fronius necesita su Smart Meter (monofásico).')
regla(ref('FRONIUS Smart Meter TS 65A-3'),{'marca_inversor':'fronius','fases':3},formula=HAY_PANELES,seccion='Monitorización',prio=57,notas='Fronius necesita su Smart Meter (trifásico).')

# --- Enphase: un microinversor por panel, con su cableado, controlador y medida
regla(ref('ENPHASE IQ 8HC microinversor con conectores MC4 integrados'),{'marca_inversor':'enphase'},tipo='seleccion',var='wp_panel',mn=0.001,mx=540,
      formula='n_paneles',prio=58,notas='Un IQ8HC por panel, para paneles de hasta 540 Wp.')
regla(ref('ENPHASE IQ 8P microinversor con conectores MC4'),{'marca_inversor':'enphase'},tipo='seleccion',var='wp_panel',mn=540.001,mx=None,
      formula='n_paneles',prio=58,notas='Un IQ8P por panel, para paneles de más de 540 Wp.')
for fases,cable,term,con in [(1,'ENPHASE Q Cable 2.5mm | 1.3m (monofásico)','ENPHASE Tapón de terminación para cable 1-phase','ENPHASE Conector estanco 1-phase - Macho'),
                             (3,'ENPHASE Q Cable 2.5mm | 1.3m (trifásico)','ENPHASE Tapón de terminación para cable 3-phase','ENPHASE Conector de campo 3-phase - M')]:
    c={'marca_inversor':'enphase','fases':fases}
    regla(ref(cable),c,formula='n_paneles',seccion='Material Enphase',prio=56,notas='Un tramo de Q Cable por microinversor.')
    regla(ref(term),c,formula='ramas_enphase',seccion='Material Enphase',prio=56,notas='Un tapón al final de cada rama.')
    regla(ref(con),c,formula='ramas_enphase',seccion='Material Enphase',prio=56,notas='Un conector de campo por rama, para empalmar con la línea de alterna.')
regla(ref('ENPHASE IQ Gateway Metered NUEVA VERSION'),{'marca_inversor':'enphase'},formula=HAY_PANELES,seccion='Monitorización',prio=57,notas='El controlador de Enphase, con medida.')
regla(ref('ENPHASE CT Transformador de núcleo partido 200A/80mA'),{'marca_inversor':'enphase'},formula='si(n_paneles > 0, 2 * fases, 0)',seccion='Monitorización',prio=57,
      notas='Toroidales del Gateway: uno de producción y uno de consumo por fase.')

# --- Baterías
B='Baterías'
regla(ref('ENPHASE IQ Battery 5P'),{'con_bateria':1,'marca_bateria':'enphase','marca_inversor':'enphase'},formula='max(1, techo(bat_kwh / 5))',seccion=B,prio=54,
      notas='IQ Battery 5P de 5 kWh: las que hagan falta para los kWh pedidos.')
regla(ref('TESLA Powerwall 3 | 13.5 kWh/11 kW'),{'con_bateria':1,'marca_bateria':'tesla','fases':1},seccion=B,prio=54,notas='Powerwall 3 (13,5 kWh), monofásico.')
regla(ref('TESLA Powerwall 3P | 13.5 kWh/15.4 kW'),{'con_bateria':1,'marca_bateria':'tesla','fases':3},seccion=B,prio=54,notas='Powerwall 3P (13,5 kWh), trifásico.')
regla(ref('TESLA Expansión Powerwall 3 13.5 kWh'),{'con_bateria':1,'marca_bateria':'tesla'},formula='max(0, techo(bat_kwh / 13.5) - 1)',seccion=B,prio=54,
      notas='Una expansión por cada 13,5 kWh más.')
regla(ref('BYD Premium HVS 2.56'),{'con_bateria':1,'marca_bateria':'byd','marca_inversor':'fronius'},tipo='seleccion',var='bat_kwh',mn=0.001,mx=12.8,
      formula='max(2, techo(bat_kwh / 2.56))',seccion=B,prio=54,notas='BYD HVS: módulos de 2,56 kWh, de 2 a 5 (hasta 12,8 kWh).')
regla(ref('BYD Premium HVM 2.76'),{'con_bateria':1,'marca_bateria':'byd','marca_inversor':'fronius'},tipo='seleccion',var='bat_kwh',mn=12.801,mx=None,
      formula='max(3, techo(bat_kwh / 2.76))',seccion=B,prio=54,notas='BYD HVM: módulos de 2,76 kWh, por encima de 12,8 kWh.')
regla(ref('BYD Battery Box Premium HVS /HVM (BCU+Base)'),{'con_bateria':1,'marca_bateria':'byd','marca_inversor':'fronius'},seccion=B,prio=54,notas='La torre BYD necesita su BCU y base.')
regla(ref('FRONIUS Batería Reserva Modulo 3,15 kWh'),{'con_bateria':1,'marca_bateria':'fronius','marca_inversor':'fronius'},formula='max(2, techo(bat_kwh / 3.15))',
      seccion=B,prio=54,notas='Fronius Reserva: módulos de 3,15 kWh, mínimo 2.')
regla(ref('FRONIUS Batería Reserva BMS y Base'),{'con_bateria':1,'marca_bateria':'fronius','marca_inversor':'fronius'},seccion=B,prio=54,notas='La Reserva necesita su BMS y base.')

# --- Backup: solo con batería, y se pregunta
regla(ref('TESLA Backup Gateway 2'),{'con_bateria':1,'con_backup':1,'marca_bateria':'tesla'},seccion=B,prio=53,notas='Backup con Powerwall: Backup Gateway 2.')
regla(ref('FRONIUS Backup Switch 1PN/3PN-63A'),{'con_bateria':1,'con_backup':1,'marca_inversor':'fronius','marca_bateria':['byd','fronius']},seccion=B,prio=53,
      notas='Backup con Fronius: Backup Switch (vale para mono y trifásico).')
regla(ref('Enphase IQ System Controller'),{'con_bateria':1,'con_backup':1,'marca_inversor':'enphase','marca_bateria':'enphase'},seccion=B,prio=53,
      notas='Backup con Enphase: IQ System Controller.')

# --- Avisos
regla(None,{'con_bateria':1,'marca_inversor':'enphase','marca_bateria':['byd','fronius']},tipo='aviso',prio=90,
      notas='Enphase solo va con baterías Enphase o Tesla: la batería elegida no se ha puesto.')
regla(None,{'con_bateria':1,'marca_inversor':'fronius','marca_bateria':'enphase'},tipo='aviso',prio=90,
      notas='Fronius va con baterías BYD, Tesla o Fronius Reserva: la Enphase no se ha puesto.')
regla(None,{'con_bateria':0,'con_backup':1},tipo='aviso',prio=90,notas='El backup necesita batería: no se ha puesto.')

# ---- escribir
out=[]
w=out.append
w(CABECERA)
w("begin;\n")
w("""-- 1 · Un tipo de regla nuevo: 'aviso' ---------------------------------------
-- No pone ninguna línea: si se cumple, el motor deja un aviso en el
-- presupuesto (una batería que no va con ese inversor, un backup sin batería…).
alter table public.reglas drop constraint if exists reglas_tipo_check;
alter table public.reglas add constraint reglas_tipo_check
  check (tipo in ('seleccion','cantidad','condicional','aviso'));
alter table public.reglas drop constraint if exists reglas_algo_que_poner;
alter table public.reglas add constraint reglas_algo_que_poner
  check (tipo = 'aviso' or producto_ref is not null or partida_id is not null);
""")
w("""-- 2 · La tarifa ------------------------------------------------------------
insert into public.proveedores (codigo, nombre) values
  ('fotovoltaica', 'Distribuidor fotovoltaica (Fronius, Enphase, BYD, Tesla)')
on conflict (codigo) do nothing;

insert into public.tarifas (proveedor_id, nombre, vigente_desde)
select id, 'Fotovoltaica 2026', date '2026-09-23' from public.proveedores where codigo = 'fotovoltaica'
on conflict (proveedor_id, nombre) do nothing;

-- Los precios son los de las capturas de la tienda, tal cual: SIN IVA y como
-- precio de venta, sin margen encima (así lo ha pedido Sysefen).
insert into public.productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, iva, atributos)
select t.id, v.referencia, v.nombre, v.familia, 'ud', v.precio, 21, v.atributos::jsonb
  from public.tarifas t
  join (values
""")
vals=[]
for x in filas:
    vals.append(f"    ({q(x['referencia'])}, {q(x['nombre'])}, {q(x['familia'])}, {x['precio_tarifa']}, {q(x['atributos'])})")
w(",\n".join(vals)+"\n  ) as v(referencia, nombre, familia, precio, atributos) on true\n where t.nombre = 'Fotovoltaica 2026'\non conflict (tarifa_id, referencia) do update\n  set nombre = excluded.nombre, familia = excluded.familia,\n      precio_tarifa = excluded.precio_tarifa, atributos = excluded.atributos;\n\n")
w("""-- 3 · Lo que consultan las reglas ------------------------------------------
insert into public.tablas_lookup (categoria, clave, entrada, valor, notas) values
  ('solar', 'ratio_dc_ac', 'defecto', 1.2,
   'kWp de paneles por cada kW de inversor. 1,2: 6 kWp de paneles van con un inversor de 5 kW.'),
  ('solar', 'micros_por_rama', 'defecto', 11,
   'Microinversores Enphase por rama de Q Cable. Manda los tapones y conectores de campo.'),
  ('solar', 'bateria_kwh', 'defecto', 5,
   'kWh de batería cuando se dice que lleva pero no cuántos.')
on conflict (categoria, clave, entrada) do nothing;

insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion) values
  ('solar', 'marca_inversor', 'Inversor', '',
   'si(inversor_marca = ''enphase'', ''enphase'', ''fronius'')', 10,
   'Fronius salvo que se diga Enphase.'),
  ('solar', 'fases', 'Fases', '',
   'si(suministro = ''trifasico'', 3, 1)', 11,
   'Monofásico salvo que se diga trifásico.'),
  ('solar', 'con_bateria', 'Lleva batería', '',
   'si(baterias = ''si'', 1, 0)', 12, ''),
  ('solar', 'bat_kwh', 'Batería', 'kWh',
   'si(baterias_kwh > 0, baterias_kwh, lookup(''bateria_kwh'', ''defecto''))', 13,
   'Los kWh pedidos; si no se dicen, los de por defecto.'),
  ('solar', 'marca_bateria', 'Batería de', '',
   'si(bateria_marca != '''', bateria_marca, si(marca_inversor = ''enphase'', ''enphase'', ''byd''))', 14,
   'La elegida; si no se dice, Enphase con Enphase y BYD con Fronius.'),
  ('solar', 'con_backup', 'Backup', '',
   'si(backup, 1, 0)', 15, 'Solo cuenta si lleva batería.'),
  -- Fronius Plus (entrada de batería) cuando la batería va en continua (BYD o
  -- Reserva), o cuando se deja preparado. Con Tesla no: el Powerwall lleva su
  -- propio inversor y se conecta en alterna.
  ('solar', 'bateria_dc', 'Batería en continua', '',
   'si((con_bateria = 1 y marca_bateria != ''tesla'') o baterias = ''dejar_preparado'', 1, 0)', 16, ''),
  ('solar', 'kw_inversor', 'Inversor mínimo', 'kW',
   'redondea(kwp / lookup(''ratio_dc_ac'', ''defecto''), 2)', 17,
   'La potencia de alterna que hace falta: kWp entre 1,2.'),
  ('solar', 'ramas_enphase', 'Ramas Enphase', 'ud',
   'techo(n_paneles / lookup(''micros_por_rama'', ''defecto''))', 18, '')
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden,
      etiqueta = excluded.etiqueta, descripcion = excluded.descripcion;

-- 4 · Fuera los inversores a precio cerrado y el medidor del kit -------------
-- El inversor sale ahora de la tarifa, y el medidor también (Smart Meter de
-- Fronius o Gateway de Enphase): se quita del kit para no cobrarlo dos veces.
update public.reglas r set activa = false
  from public.partidas p, public.conjuntos_reglas c
 where r.partida_id = p.id and r.conjunto_id = c.id
   and c.categoria = 'solar' and p.categoria = 'solar' and p.codigo in ('INV_6', 'INV_10');

delete from public.partidas_items pi
 using public.partidas p
 where pi.partida_id = p.id and p.categoria = 'solar' and p.codigo = 'KIT_BASE'
   and pi.concepto_libre = 'Medidor de energía e interfaz';

-- 5 · Las reglas ------------------------------------------------------------
-- Se rehacen enteras cada vez que se ejecuta: son las de producto_ref de esta
-- tarifa y los avisos de fotovoltaica.
delete from public.reglas r using public.conjuntos_reglas c
 where r.conjunto_id = c.id and c.categoria = 'solar'
   and (r.producto_ref like 'FV-%' or r.tipo = 'aviso');

insert into public.reglas (conjunto_id, tipo, variable, minimo, maximo, condicion, producto_ref, formula_cantidad, seccion, prioridad, notas)
select c.id, v.tipo, v.variable, v.minimo, v.maximo, v.condicion::jsonb, v.producto_ref, v.formula, v.seccion, v.prioridad, v.notas
  from public.conjuntos_reglas c
  join (values
""")
def lit(v, cast=None):
    if v is None: return 'null' + (('::'+cast) if cast else '')
    if isinstance(v,(int,float)): return str(v) + (('::'+cast) if cast else '')
    return q(v)
vals=[]
for (tipo,var,mn,mx,cond,prod,formula,seccion,prio,notas) in reglas:
    vals.append(f"    ({q(tipo)}, {lit(var,'text')}, {lit(mn,'numeric')}, {lit(mx,'numeric')}, {q(json.dumps(cond,ensure_ascii=False))}, {lit(prod,'text')}, {q(formula)}, {lit(seccion,'text') if tipo!='aviso' else 'null::text'}, {prio}, {lit(notas,'text')})")
w(",\n".join(vals)+"\n  ) as v(tipo, variable, minimo, maximo, condicion, producto_ref, formula, seccion, prioridad, notas) on true\n where c.categoria = 'solar' and c.vigente_hasta is null;\n\ncommit;\n")
w(PIE)
open(os.path.join(APPS, 'etapa47_tarifa_fotovoltaica.sql'), 'w', encoding='utf-8').write(''.join(out))
# config para las pruebas
json.dump({'productos':{x['referencia']:dict(referencia=x['referencia'],nombre=x['nombre'],familia=x['familia'],unidad='ud',precio_tarifa=float(x['precio_tarifa']),iva=21) for x in filas},
           'reglas':[dict(id='fv%d'%i,tipo=t,variable=v,minimo=a,maximo=b,condicion=c,producto_ref=p,formula_cantidad=f,seccion=s,prioridad=pr,notas=n)
                     for i,(t,v,a,b,c,p,f,s,pr,n) in enumerate(reglas)]},
          open(os.path.join(CARPETA, 'fotovoltaica-reglas.json'), 'w', encoding='utf-8'),ensure_ascii=False)
print(len(filas),'productos',len(reglas),'reglas')
