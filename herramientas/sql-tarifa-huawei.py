#!/usr/bin/env python3
"""Junta sql/etapa122_huawei.sql con los productos de huawei-baywa-2026.csv (Drive)
en subir-a-supabase/etapa122_huawei_completo.sql, que es el que se ejecuta:

  python3 herramientas/sql-tarifa-huawei.py
  herramientas/supabase-sql.sh subir-a-supabase/etapa122_huawei_completo.sql

El repo es público y las listas de precios no van en él: por eso las filas se
ponen aquí, fuera de Git (subir-a-supabase/ está en .gitignore).

El CSV sale del Excel «Precios Huawei BayWa» (catálogo Huawei de la tienda de
BayWa r.e. España, 23-11-2026): categoria, ref_baywa, mpn, descripcion, precio…

AQUÍ SE DECIDE QUÉ ES CADA PRODUCTO (familia y atributos), que es lo que el
presupuestador mira. Las fases y la batería compatible de cada serie de
inversores salen de las fichas técnicas de Huawei (solar.huawei.com):
  LB0 (3K-6K) y LC0 (8K, 10K): monofásicos, con LUNA2000 S0 y S1.
  MAP0 (5K-12K), M1 (3-10KTL) y MB0 (12K-25K): trifásicos, con LUNA2000 S0 y S1.
  MC0 (30K-50K): trifásicos; su batería no se ha comprobado (hibrido = false).
  LUNA2000-S1: módulos de 5 y 6,9 kWh, hasta tres por base."""
import csv, json, os, re, sys, unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.environ.get('SYSEFEN_TARIFAS') or os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app')
M_PROD = '-- <<PRODUCTOS: los pone herramientas/sql-tarifa-huawei.py>>'
M_MED = '-- <<MEDIDOR: lo pone herramientas/sql-tarifa-huawei.py>>'
RECARGO = 1.538462   # 35 % de margen sobre la venta, 1/(1-0,35) (Enzo, 23-11-2026; sql/etapa123)
TARIFA = 'Fotovoltaica 2026'

SERIES = {   # serie → (suministro, admite batería LUNA2000)
    'lb0': ('monofasico', True), 'lc0': ('monofasico', True),
    'map0': ('trifasico', True), 'm1': ('trifasico', True), 'mb0': ('trifasico', True),
    'mc0': ('trifasico', False),
}
MODULOS = {'LUNA2000-5-S1': 5.0, 'LUNA2000-7-S1': 6.9}   # kWh útiles por módulo (ficha LUNA2000-S1)
BASE_S1 = 'LUNA2000-S1 Base y módulo de control'
MEDIDOR = {'mono': 'SmartPS-100A-S0', 'tri': 'SmartPS-250A-T0'}


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def slug(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'[^A-Z0-9.]+', '-', s).strip('-')


def nombre_de(d):
    n = re.sub(r'\s+', ' ', d).strip()
    n = re.sub(r'^huawei\b', 'Huawei', n, flags=re.I)
    return n if n.lower().startswith('huawei') else 'Huawei ' + n


def clasifica(f):
    """→ (familia, atributos) o None si no entra en el catálogo."""
    cat, d = f['categoria'], f['descripcion']
    obs = (f['estado'] + ' ' + f['observaciones']).lower()
    if cat in ('Kits', 'Extensiones de garantía') or 'gen' in obs and 'rica' in obs:
        return None
    atr = {'marca': 'huawei', 'ref_baywa': f['ref_baywa'], 'mpn': f['mpn'], 'tarifa': 'BayWa 23-11-2026'}
    if f['estado']:
        atr['estado'] = f['estado']
    if cat == 'Inversores':
        m = re.search(r'SUN2000-(\d+(?:\.\d+)?)K(?:TL)?-(LB0|LC0|MAP0|M1|MB0|MC0)\b', d, flags=re.I)
        if not m:
            return 'equipo', dict(atr, nota='Inversor de planta: el presupuestador no lo elige solo')
        sumi, hib = SERIES[m.group(2).lower()]
        atr.update(kw=float(m.group(1)), fases=1 if sumi == 'monofasico' else 3, serie=m.group(2).upper(), hibrido=hib)
        if 'fin de existencias' in f['estado'].lower():
            atr['fin_existencias'] = True
        return 'inversor', atr
    if cat.startswith('Baterías'):
        for k, kwh in MODULOS.items():
            if k in d:
                return 'bateria', dict(atr, capacidad_kwh=kwh, modulos_por_base=3, base_nombre=BASE_S1)
        return 'accesorio', atr
    if re.search(r'SmartPS|Smart Power Sensor', d, flags=re.I):
        return 'contador', dict(atr, fases=1 if '1-Ph' in d else 3)
    if 'SmartGuard' in d and 'Cable' not in d:
        return 'backup', dict(atr, backup=True)
    if 'Smart Charger' in d:
        return 'equipo', atr
    return 'accesorio', atr


def main():
    plantilla = open(os.path.join(RAIZ, 'sql', 'etapa122_huawei.sql'), encoding='utf-8').read()
    for m in (M_PROD, M_MED):
        if plantilla.count(m) != 1:
            sys.exit('No encuentro la marca ' + m)
    with open(os.path.join(CARPETA, 'huawei-baywa-2026.csv'), encoding='utf-8', newline='') as fh:
        filas = list(csv.DictReader(fh))
    if len(filas) < 150:
        sys.exit('huawei-baywa-2026.csv trae solo %d productos' % len(filas))

    prods, vistos, cuenta = [], set(), {}
    for f in filas:
        c = clasifica(f)
        if not c:
            continue
        precio = round(float(f['precio']) + 1e-9, 2)
        if not precio > 0:
            sys.exit('Sin precio: ' + f['descripcion'])
        familia, atr = c
        nombre = nombre_de(f['descripcion'])
        ref = 'FV-' + slug(nombre)[:70]
        if ref in vistos:                      # dos «Accessory Package» con el mismo nombre
            ref = (ref[:60] + '-' + slug(f['mpn']))[:80]
        if ref in vistos:
            sys.exit('Referencia repetida: ' + ref)
        vistos.add(ref)
        prods.append(dict(ref=ref, nombre=nombre, familia=familia, precio=precio, atr=atr))
        cuenta[familia] = cuenta.get(familia, 0) + 1

    # La base de las baterías S1: su referencia, apuntada en cada módulo.
    base = [p for p in prods if BASE_S1 in p['nombre']]
    if len(base) != 1:
        sys.exit('No encuentro (una sola vez) la base de la LUNA2000-S1')
    for p in prods:
        if p['familia'] == 'bateria':
            p['atr']['base_ref'] = base[0]['ref']
            del p['atr']['base_nombre']
    med = {}
    for k, patron in MEDIDOR.items():
        x = [p for p in prods if patron in p['nombre']]
        if len(x) != 1:
            sys.exit('No encuentro (una sola vez) el medidor ' + patron)
        med[k] = x[0]

    valores = ',\n'.join('  (%s, %s, %s, %.2f, %s::jsonb)' % (lit(p['ref']), lit(p['nombre']), lit(p['familia']), p['precio'],
                                                           lit(json.dumps(p['atr'], ensure_ascii=False, sort_keys=True))) for p in prods)
    sql_prod = ("insert into public.productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, iva, especificaciones, atributos, activo, recargo, aplica_cdc)\n"
                "select (select id from public.tarifas where nombre = %s), v.referencia, v.nombre, v.familia, 'ud', v.coste, 0, 21, '[]'::jsonb, v.atributos, true, %s, false\n"
                "from (values\n%s\n) as v (referencia, nombre, familia, coste, atributos)\n"
                "on conflict (tarifa_id, referencia) do update set nombre = excluded.nombre, familia = excluded.familia,\n"
                "  precio_tarifa = excluded.precio_tarifa, atributos = excluded.atributos, activo = true;") % (lit(TARIFA), RECARGO, valores)
    medidor = {'mono': med['mono']['precio'], 'tri': med['tri']['precio'], 'baywa': True, 'proveedor': 'BayWa',
               'modelo_mono': MEDIDOR['mono'], 'modelo_tri': MEDIDOR['tri']}
    sql_med = ("update public.motor_modelos\n   set datos = jsonb_set(datos, '{precios,huawei_medidor}', %s::jsonb)\n"
               " where categoria = 'solar' and vigente_hasta is null\n   and datos #> '{precios,huawei_medidor}' is null;") % lit(json.dumps(medidor, ensure_ascii=False))

    salida = plantilla.replace(M_PROD, sql_prod).replace(M_MED, sql_med)
    destino = os.path.join(RAIZ, 'subir-a-supabase')
    os.makedirs(destino, exist_ok=True)
    with open(os.path.join(destino, 'etapa122_huawei_completo.sql'), 'w', encoding='utf-8') as fh:
        fh.write(salida)
    print('subir-a-supabase/etapa122_huawei_completo.sql · %d productos · %s' % (len(prods), ', '.join('%s %d' % kv for kv in sorted(cuenta.items()))))
    for p in prods:
        if p['familia'] in ('inversor', 'bateria', 'contador', 'backup'):
            a = p['atr']
            print('  %-9s %-52s %s' % (p['familia'], p['nombre'][:52], ' · '.join(str(x) for x in [a.get('kw'), {1: 'mono', 3: 'tri'}.get(a.get('fases')), 'híbrido' if a.get('hibrido') else None, a.get('capacidad_kwh'), 'fin' if a.get('fin_existencias') else None] if x is not None)))


if __name__ == '__main__':
    main()
