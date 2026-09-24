#!/usr/bin/env python3
"""
Sysefen · Las máquinas de aire acondicionado en el motor (sql/etapa48)

QUÉ HACE:
  Lee la tarifa de aire de Midea (midea-aire-2026.csv, en la carpeta de
  tarifas del Drive: unidades interiores, exteriores 1x1 y exteriores multi,
  con su tamaño y sus kW) y escribe:
    · etapa48_aire_midea.sql       en la carpeta subir-a-supabase/ del repo: los productos
                                   con su nombre de verdad y las reglas que
                                   eligen la máquina de cada estancia, para
                                   pegar en el SQL Editor de Supabase
    · aire-reglas.json             en la carpeta de tarifas, para
                                   pruebas/motor-aire.js

  NINGUNO DE LOS DOS VA AL REPO: llevan precios y el repo es público. Aquí
  solo están las reglas.

CÓMO ELIGE:
  · Cada estancia pide kW según sus m²: 100 W/m² (tablas_lookup w_m2, se
    calibra sin tocar código). De los kW sale el TAMAÑO Midea:
      hasta 2,05 kW → 7 · 2,6 → 9 · 3,5 → 12 · 5,3 → 18 · 7,1 → 24 · más → a mano
  · Murales (1x1 y multisplit): la gama Solstice (EZ). No tiene tamaño 7: a esas
    estancias les toca la de 9.
  · 1x1: cada estancia lleva su interior y su exterior pareja.
  · Multisplit, conductos y cassette: interior por estancia, y UNA exterior
    M2O/M3O/M4O/M5O según cuántas interiores hay y cuántos kW suman (tabla de
    combinaciones de Midea, págs. 64-65 de la tarifa). Conductos y cassette
    tienen combinaciones vetadas (*), por eso sus tramos son más cortos.
  · Suelo-techo no tiene máquina en esta tarifa: sale aviso.

CÓMO SE USA:
  python3 herramientas/reglas-aire.py
  (y después pegar subir-a-supabase/etapa48_aire_midea.sql en el SQL Editor)
"""
import csv, json, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.environ.get('SYSEFEN_TARIFAS') or os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app')

filas = list(csv.DictReader(open(os.path.join(CARPETA, 'midea-aire-2026.csv'), encoding='utf-8')))
# El catálogo imprime dos códigos para la CB1-09HRFN8-I; se queda el de la
# hoja 1x1 (13915221) hasta que Midea diga cuál es el bueno.
filas = [f for f in filas if f['referencia'] != '13915207']
# Los paneles de los cassettes no vienen como fila en la hoja: van dentro del
# cassette. Aquí sí son producto, que se cobran.
filas += [
    dict(referencia='13930186', nombre='MCP-600B', familia='accesorio_aire', unidad='ud', precio_tarifa='80.00', iva='21',
         atributos='{"marca": "midea", "panel_de": "cassette 600x600"}', notas='Panel del cassette MCA4U'),
    dict(referencia='13930096', nombre='MCP-840B', familia='accesorio_aire', unidad='ud', precio_tarifa='150.00', iva='21',
         atributos='{"marca": "midea", "panel_de": "cassette 840x840"}', notas='Panel del cassette MCD-24'),
]
P = {f['nombre']: f for f in filas}
A = {f['nombre']: json.loads(f['atributos'] or '{}') for f in filas}
def ref(nombre):
    assert nombre in P, nombre
    return P[nombre]['referencia']
q = lambda s: "'" + str(s).replace("'", "''") + "'"

TAMANOS = [7, 9, 12, 18, 24]
KW = {7: 2.05, 9: 2.6, 12: 3.5, 18: 5.3, 24: 7.0}

reglas = []   # (tipo, por_cada, variable, min, max, condicion, producto, formula, seccion, prioridad, notas)
def regla(prod, cond, tipo='cantidad', por_cada=None, var=None, mn=None, mx=None, formula='1',
          seccion='Equipos', prio=60, notas=None):
    if prod: assert prod in {f['referencia'] for f in filas}, prod
    reglas.append((tipo, por_cada, var, mn, mx, cond, prod, formula, seccion, prio, notas))

MURAL = ['split_1x1', 'multisplit']
MULTI = ['multisplit', 'conductos', 'cassette']

# --- la interior de cada estancia ----------------------------------------------
# Murales Solstice: el 7 se cubre con la de 9.
mural = {7: 'EZ-09RD6-I', 9: 'EZ-09RD6-I', 12: 'EZ-12RD6-I', 18: 'EZ-18RD6-I', 24: 'EZ-24RD6-I'}
for t in TAMANOS:
    regla(ref(mural[t]), {'tipo_sistema': MURAL}, tipo='seleccion', por_cada='estancias', var='tamano', mn=t, mx=t,
          notas=f'Mural Solstice para una estancia de tamaño {t} ({KW[t]} kW).')
conductos = {7: 'MTJU-07HNX', 9: 'MTJU-09HNX', 12: 'MTJU-12HNX', 18: 'MTJU-18NX', 24: 'MTJU-24NX'}
for t in TAMANOS:
    regla(ref(conductos[t]), {'tipo_sistema': 'conductos'}, tipo='seleccion', por_cada='estancias', var='tamano', mn=t, mx=t,
          notas=f'Conductos A7 de tamaño {t} ({KW[t]} kW).')
cassette = {7: 'MCA4U-07NX', 9: 'MCA4U-09NX', 12: 'MCA4U-12NX', 18: 'MCA4U-18NX', 24: 'MCD-24NX'}
for t in TAMANOS:
    regla(ref(cassette[t]), {'tipo_sistema': 'cassette'}, tipo='seleccion', por_cada='estancias', var='tamano', mn=t, mx=t,
          notas=f'Cassette de tamaño {t} ({KW[t]} kW).')
    regla(ref('MCP-600B' if t < 24 else 'MCP-840B'), {'tipo_sistema': 'cassette'}, tipo='seleccion', por_cada='estancias',
          var='tamano', mn=t, mx=t, prio=59, notas='Su panel.')

# --- la exterior --------------------------------------------------------------------
# 1x1: la pareja de cada interior.
ext1x1 = {7: 'EZ-09RD6-O', 9: 'EZ-09RD6-O', 12: 'EZ-12RD6-O', 18: 'EZ-18RD6-O', 24: 'EZ-24RD6-O'}
for t in TAMANOS:
    regla(ref(ext1x1[t]), {'tipo_sistema': 'split_1x1'}, tipo='seleccion', por_cada='estancias', var='tamano', mn=t, mx=t,
          prio=58, notas=f'La exterior pareja del mural de tamaño {t}.')

# Multi: una exterior según cuántas interiores y cuántos kW nominales suman.
# Los tramos son la SUMA de kW nominales de las combinaciones que admite cada
# exterior (tabla de Midea). Murales admiten las combinaciones con asterisco;
# conductos y cassette no, por eso sus tramos son más cortos.
tramos_mural = {
    1: [(3.5, 'M2O-14N8'), (5.3, 'M2O-18N8'), (7.1, 'M3O-21N8')],
    2: [(7.0, 'M2O-14N8'), (8.8, 'M2O-18N8'), (10.6, 'M3O-27N8'), (12.3, 'M4O-28N8')],
    3: [(10.5, 'M3O-18N8'), (12.3, 'M3O-27N8'), (14.1, 'M4O-28N8'), (15.8, 'M5O-42N8')],
    4: [(14.0, 'M4O-28N8'), (15.8, 'M4O-36N8'), (17.6, 'M5O-42N8')],
    5: [(20.6, 'M5O-42N8')],
}
tramos_conducto = {
    1: [(3.5, 'M2O-14N8'), (5.3, 'M2O-18N8'), (7.1, 'M3O-21N8')],
    2: [(5.2, 'M2O-14N8'), (8.8, 'M2O-18N8')],
    3: [(7.2, 'M3O-18N8'), (8.1, 'M3O-21N8'), (10.5, 'M3O-27N8'), (12.3, 'M4O-28N8'), (15.8, 'M5O-42N8')],
    4: [(11.6, 'M4O-28N8'), (14.0, 'M4O-36N8'), (17.6, 'M5O-42N8')],
    5: [(20.6, 'M5O-42N8')],
}
for sistemas, tramos, nombre in [(['multisplit'], tramos_mural, 'murales'), (['conductos', 'cassette'], tramos_conducto, 'conductos y cassette')]:
    for n, lista in tramos.items():
        prev = 0
        for mx, modelo in lista:
            regla(ref(modelo), {'tipo_sistema': sistemas, 'unidades_interiores': n}, tipo='seleccion', var='kw_total',
                  mn=round(prev + 0.001, 3), mx=mx, prio=58,
                  notas=f'Exterior multi para {n} interior{"es" if n > 1 else ""} ({nombre}) que suman hasta {mx} kW.')
            prev = mx
        regla(None, {'tipo_sistema': sistemas, 'unidades_interiores': n}, tipo='aviso', var='kw_total', mn=round(prev + 0.001, 3), prio=58,
              notas=f'{n} interior{"es" if n > 1 else ""} que suman más de {prev} kW: no hay exterior multi en la tarifa que las admita. La exterior va a mano.')

# --- avisos ---------------------------------------------------------------------------
regla(None, {}, tipo='aviso', por_cada='estancias', var='tamano', mn=99, prio=90,
      notas='Una estancia pide más de 7 kW: no hay máquina doméstica para ella, va a mano.')
regla(None, {'tipo_sistema': MURAL + ['conductos', 'cassette']}, tipo='aviso', por_cada='estancias', var='tamano', mn=0, mx=0, prio=90,
      notas='Una estancia no tiene m²: sin los m² no se puede elegir su máquina. Ponlos en la ficha (Estancias → m²) y vuelve a calcular.')
regla(None, {'tipo_sistema': 'suelo_techo'}, tipo='aviso', prio=90,
      notas='Suelo-techo no está en la tarifa doméstica de Midea: la máquina va a mano.')
regla(None, {'tipo_sistema': MULTI}, tipo='aviso', var='unidades_interiores', mn=6, prio=90,
      notas='Más de 5 interiores: no hay una sola exterior que las lleve. Repártelas en dos sistemas.')

CABECERA = r'''-- =============================================================================
-- Sysefen · Etapa 48 · Las máquinas de aire acondicionado, elegidas por el motor
--
-- QUÉ ARREGLA:
--   El presupuesto de aire salía sin máquinas: el motor ponía el kit de
--   instalación (C100-C104) y la interior y la exterior había que buscarlas a
--   mano en el catálogo, donde además estaban sin nombre («Midea 13900092»).
--
-- QUÉ SE MONTA:
--   · Los productos de aire de la tarifa Midea 2026 con su nombre, familia
--     (aire_interior, aire_exterior_1x1, aire_exterior_multi, conductos,
--     cassette), tamaño y kW. Los códigos son los de Midea.
--   · Dos columnas nuevas, `por_cada`, en reglas y en variables_derivadas: la
--     regla o la variable se aplica una vez POR ESTANCIA.
--   · Cada estancia lleva sus m² y sus METROS DE LÍNEA hasta la exterior (campo
--     nuevo en la ficha). Con los m² se elige la máquina; con los metros, el
--     tubo de más (C103) y el gas (etapa 45).
--   · Las reglas: interior por estancia (mural Solstice, conductos A7 o
--     cassette según el sistema), exterior pareja en 1x1, y una exterior multi
--     por número de interiores y kW en multisplit, conductos y cassette.
--
-- LO QUE HAY QUE SABER:
--   · 100 W/m² es un estándar del oficio, no un dato medido. Se calibra en
--     tablas_lookup (w_m2) sin tocar código.
--   · Los tramos de la exterior multi resumen la tabla de combinaciones de
--     Midea. Antes de dar por bueno un multi de 3 o más, mirar la tabla.
--   · Suelo-techo y estancias de más de 7 kW no tienen máquina: sale aviso.
--
-- REQUIERE: la función `presupuestar` nueva (motor 1.1: por_cada).
-- Idempotente: las reglas de aire con producto y los avisos se rehacen.
-- =============================================================================

'''

PIE = r'''
-- =============================================================================
-- COMPROBACIONES
--   Las máquinas con nombre:
--   select referencia, nombre, familia, precio_tarifa, atributos->>'tamano' tamano
--     from public.productos where familia like 'aire_%' order by familia, nombre;
--
--   Las reglas de aire activas:
--   select r.tipo, r.por_cada, r.variable, r.minimo, r.maximo, r.condicion, r.producto_ref
--     from public.reglas r join public.conjuntos_reglas c on c.id = r.conjunto_id
--    where c.categoria = 'aire_acondicionado' and r.activa order by r.prioridad desc, r.producto_ref;
--
--   Para cambiar los W/m²: update public.tablas_lookup set valor = 90
--     where categoria = 'aire_acondicionado' and clave = 'w_m2';
-- =============================================================================
'''

def lit(v, cast=None):
    if v is None: return 'null' + (('::' + cast) if cast else '')
    if isinstance(v, (int, float)): return str(v) + (('::' + cast) if cast else '')
    return q(v)

out = []
w = out.append
w(CABECERA)
w("begin;\n\n")
w("""-- 1 · Reglas y variables «por cada estancia» ----------------------------------
alter table public.reglas add column if not exists por_cada text;
comment on column public.reglas.por_cada is
  'Nombre de una lista de la ficha (estancias). La regla se aplica una vez por elemento, viendo sus campos.';
alter table public.variables_derivadas add column if not exists por_cada text;
comment on column public.variables_derivadas.por_cada is
  'Si se pone, la variable se calcula por elemento de esa lista y se guarda en él (estancia.tamano).';

-- 2 · Los productos, con su nombre --------------------------------------------
-- Los mismos códigos que ya estaban en la tarifa Midea 2026 (cargados sin
-- nombre): se les pone nombre, familia y atributos. Los que no estaban, entran.
insert into public.productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, iva, atributos, detalle_tecnico)
select t.id, v.referencia, v.nombre, v.familia, 'ud', v.precio, 21, v.atributos::jsonb, v.detalle
  from public.tarifas t
  join (values
""")
def detalle(f):
    a = A.get(f['nombre'], {})
    partes = []
    if a.get('gama'): partes.append('Midea ' + a['gama'])
    fam = f['familia']
    if fam == 'aire_interior': partes.append('unidad interior mural')
    elif fam == 'aire_interior_conductos': partes.append('unidad interior de conductos')
    elif fam == 'aire_interior_cassette': partes.append('unidad interior de cassette')
    elif fam == 'aire_exterior_1x1': partes.append('unidad exterior')
    elif fam == 'aire_exterior_multi': partes.append('unidad exterior multisistema' + (f" para hasta {a['unidades_max']} interiores" if a.get('unidades_max') else ''))
    kf, kc = a.get('kw_frio'), a.get('kw_calor')
    if kf: partes.append(f"{str(kf).replace('.', ',')} kW frío" + (f" · {str(kc).replace('.', ',')} kW calor" if kc else ''))
    if a.get('refrigerante'): partes.append(a['refrigerante'])
    return ' · '.join(partes)
vals = []
for f in filas:
    at = json.loads(f['atributos'] or '{}'); at['marca'] = 'midea'
    vals.append(f"    ({q(f['referencia'])}, {q(f['nombre'])}, {q(f['familia'])}, {float(f['precio_tarifa']):.2f}, {q(json.dumps(at, ensure_ascii=False))}, {q(detalle(f))})")
w(",\n".join(vals) + "\n  ) as v(referencia, nombre, familia, precio, atributos, detalle) on true\n where t.nombre = 'Midea 2026'\n"
  "on conflict (tarifa_id, referencia) do update\n  set nombre = excluded.nombre, familia = excluded.familia, precio_tarifa = excluded.precio_tarifa,\n"
  "      atributos = excluded.atributos, detalle_tecnico = coalesce(public.productos.detalle_tecnico, excluded.detalle_tecnico);\n\n")
w("""-- 3 · Lo que consultan las reglas ------------------------------------------
insert into public.tablas_lookup (categoria, clave, entrada, valor, notas) values
  ('aire_acondicionado', 'w_m2', 'defecto', 100,
   'Vatios de frío por m² de estancia. Estándar del oficio; SIN CALIBRAR con visitas.'),
  ('aire_acondicionado', 'kw_tamano', '7',  2.05, 'kW nominales del tamaño 7 de Midea.'),
  ('aire_acondicionado', 'kw_tamano', '9',  2.6,  'kW nominales del tamaño 9.'),
  ('aire_acondicionado', 'kw_tamano', '12', 3.5,  'kW nominales del tamaño 12.'),
  ('aire_acondicionado', 'kw_tamano', '18', 5.3,  'kW nominales del tamaño 18.'),
  ('aire_acondicionado', 'kw_tamano', '24', 7.0,  'kW nominales del tamaño 24.'),
  ('aire_acondicionado', 'kw_tamano', '99', 0,    'Sin tamaño: la estancia pide más de 7 kW.'),
  ('aire_acondicionado', 'kw_tamano', '0',  0,    'Sin m²: no se sabe qué máquina.')
on conflict (categoria, clave, entrada) do nothing;

-- Los metros ahora van en cada estancia; las fichas viejas los tenían aparte.
insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion, por_cada)
values
  ('aire_acondicionado', 'metros_totales', 'Metros de línea', 'm',
   'si(suma(estancias, ''metros'') > 0, suma(estancias, ''metros''), suma(distancias_lineas, ''metros''))', 3,
   'Los metros de cada estancia hasta la exterior; si no los hay, los de la lista antigua.', null),

  ('aire_acondicionado', 'kw_estancia', 'kW que pide la estancia', 'kW',
   'redondea(m2 * lookup(''w_m2'', ''defecto'') / 1000, 2)', 10,
   'Por estancia: sus m² a 100 W/m².', 'estancias'),

  ('aire_acondicionado', 'tamano', 'Tamaño Midea', '',
   'si(kw_estancia <= 0, 0, si(kw_estancia <= 2.05, 7, si(kw_estancia <= 2.6, 9, si(kw_estancia <= 3.5, 12, si(kw_estancia <= 5.3, 18, si(kw_estancia <= 7.1, 24, 99))))))', 11,
   'Por estancia: el tamaño de máquina (7, 9, 12, 18, 24). 99 = ninguno le llega; 0 = sin m².', 'estancias'),

  ('aire_acondicionado', 'kw_nominal', 'kW nominales de la máquina', 'kW',
   'lookup(''kw_tamano'', tamano)', 12,
   'Por estancia: los kW de la máquina que le toca, para sumar y elegir la exterior.', 'estancias'),

  ('aire_acondicionado', 'kw_total', 'kW nominales en total', 'kW',
   'redondea(suma(estancias, ''kw_nominal''), 2)', 13,
   'Lo que suman las interiores: manda en la exterior multi.', null)
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden, por_cada = excluded.por_cada,
      etiqueta = excluded.etiqueta, descripcion = excluded.descripcion;

-- 4 · Las reglas -------------------------------------------------------------
-- Se rehacen enteras cada vez: las de producto de aire y los avisos.
delete from public.reglas r using public.conjuntos_reglas c
 where r.conjunto_id = c.id and c.categoria = 'aire_acondicionado'
   and (r.producto_ref is not null or r.tipo = 'aviso');

insert into public.reglas (conjunto_id, tipo, por_cada, variable, minimo, maximo, condicion, producto_ref, formula_cantidad, seccion, prioridad, notas)
select c.id, v.tipo, v.por_cada, v.variable, v.minimo, v.maximo, v.condicion::jsonb, v.producto_ref, v.formula, v.seccion, v.prioridad, v.notas
  from public.conjuntos_reglas c
  join (values
""")
vals = []
for (tipo, por_cada, var, mn, mx, cond, prod, formula, seccion, prio, notas) in reglas:
    vals.append(f"    ({q(tipo)}, {lit(por_cada, 'text')}, {lit(var, 'text')}, {lit(mn, 'numeric')}, {lit(mx, 'numeric')}, "
                f"{q(json.dumps(cond, ensure_ascii=False))}, {lit(prod, 'text')}, {q(formula)}, "
                f"{lit(seccion, 'text') if tipo != 'aviso' else 'null::text'}, {prio}, {lit(notas, 'text')})")
w(",\n".join(vals) + "\n  ) as v(tipo, por_cada, variable, minimo, maximo, condicion, producto_ref, formula, seccion, prioridad, notas) on true\n"
  " where c.categoria = 'aire_acondicionado' and c.vigente_hasta is null;\n\ncommit;\n")
w(PIE)
open(os.path.join(RAIZ, 'subir-a-supabase', 'etapa48_aire_midea.sql'), 'w', encoding='utf-8').write(''.join(out))

json.dump({
    'productos': {f['referencia']: dict(referencia=f['referencia'], nombre=f['nombre'], familia=f['familia'], unidad='ud',
                                        precio_tarifa=float(f['precio_tarifa']), iva=21, atributos=json.loads(f['atributos'] or '{}'))
                  for f in filas},
    'reglas': [dict(id='ai%d' % i, tipo=t, por_cada=pc, variable=v, minimo=a, maximo=b, condicion=c, producto_ref=p,
                    formula_cantidad=f, seccion=s, prioridad=pr, notas=n)
               for i, (t, pc, v, a, b, c, p, f, s, pr, n) in enumerate(reglas)],
}, open(os.path.join(CARPETA, 'aire-reglas.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(len(filas), 'productos', len(reglas), 'reglas')
