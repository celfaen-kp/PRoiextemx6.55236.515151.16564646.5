#!/usr/bin/env python3
"""
Sysefen · Tarifa Rebacas (distribuidor Deye / WECO) → fotovoltaica-2026.csv

QUÉ SACA (lo que pidió Enzo el 15-10-2026, nada más):
  · Inversores híbridos Deye monofásicos y trifásicos (págs. 4 y 5).
  · Meters de MEDIDA INDIRECTA (Eastron SDM 230 1PH y SDM 630 3PH) y el meter
    WiFi Deye SUN-SMART-CT01 (pág. 9). Los de medida directa, no.
  · Baterías WECO (5K0 LT, 5K3 EVO, 16K0 LV) y Deye (SE-F5 PRO, SE-F 16-C,
    BOS-G alto voltaje) con sus accesorios (págs. 11-13, 15-16). La gama
    comercial A-KOOL de 100-240 kWh queda fuera.

QUÉ NO HACE: no decide compatibilidades. La tarifa dice qué baterías van con
cada Deye «entre otras»; hay que revisar las fichas técnicas (y los terminales)
antes de hacer reglas con esto. Por eso los productos entran en el catálogo
(se pueden añadir a mano a un presupuesto) pero NO hay regla que los ponga sola.

PRECIOS: son precio de distribuidor sin IVA (la tarifa lo dice en cada tabla).
Van al CSV como precio_tarifa = coste, igual que BayWa. Los portes «se cotizan
según el envío»: no van aquí (el modelo FV v2 los estima en 1,47 %).

USO:
  python3 herramientas/extrae-tarifa-rebacas.py <tarifa.pdf | tarifa.txt>
  Lee el PDF con pypdf (pip install pypdf) o un .txt ya extraído, y hace un
  upsert por referencia en la carpeta de tarifas del Drive:
    $SYSEFEN_TARIFAS/fotovoltaica-2026.csv
  Después: python3 herramientas/reglas-fotovoltaica.py y pegar etapa72.
"""
import csv, json, os, re, sys

CARPETA = os.environ.get('SYSEFEN_TARIFAS') or os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app')
CSV = os.path.join(CARPETA, 'fotovoltaica-2026.csv')

if len(sys.argv) < 2:
    sys.exit(__doc__)
ruta = sys.argv[1]
if ruta.lower().endswith('.pdf'):
    try:
        import pypdf
    except ImportError:
        sys.exit('Hace falta pypdf (pip install pypdf) o pasar un .txt ya extraído.')
    r = pypdf.PdfReader(ruta)
    texto = '\n'.join((p.extract_text(extraction_mode='layout') or '') for p in r.pages)
else:
    texto = open(ruta, encoding='utf-8').read()
lineas = [re.sub(r'\s+', ' ', l).strip() for l in texto.splitlines()]
m = re.search(r'TARIFA ESPECIAL (T\d \d{4})', texto)
TARIFA = m.group(1) if m else 'Rebacas'
NOTA = 'Tarifa Rebacas ' + TARIFA + ' (distribuidor, precio sin IVA, portes aparte)'

# ---------------------------------------------------------------------------
# Las tablas «MODELO … PRECIO SIN IVA» bajo cada cabecera de sección.
# ---------------------------------------------------------------------------
SECCIONES = ['HÍBRIDOS MONOFÁSICOS', 'HÍBRIDOS TRIFÁSICOS', 'ON GRID MONOFÁSICOS', 'ON GRID TRIFÁSICOS', 'CARGADORES COCHE',
             'ACCESORIOS DEYE', 'CUADROS ELÉCTRICOS PREMONTADOS', 'WECO 5K0 LT', 'WECO 5K3 EVO', 'WECO 16K0 LV',
             'GAMA WECO A-KOOL', 'DEYE BAJO VOLTAJE', 'DEYE ALTO VOLTAJE', 'VOLTGO', 'DEYE ESS BALCONY', 'PANELES SOLARES']
PRECIO = re.compile(r'^(.+?)\s+([\d.]+)$')
filas = {}   # seccion -> [(modelo, precio)]
seccion = None
en_tabla = False
for l in lineas:
    # Cabecera de sección: corta y sin precio al final (la primera fila de la
    # tabla de la WECO 5K3 EVO empieza igual que su cabecera, pero lleva precio).
    cab = next((s for s in SECCIONES if l.upper().startswith(s)), None)
    if cab and len(l) < 60 and not PRECIO.match(l):
        seccion, en_tabla = cab, False
        continue
    if l.upper().startswith('MODELO') and 'PRECIO' in l.upper():
        en_tabla = True
        continue
    if l.upper().startswith('TARIFA ESPECIAL'):
        en_tabla = False
        continue
    if seccion and en_tabla:
        mm = PRECIO.match(l)
        if mm:
            precio = float(mm.group(2).replace('.', ''))
            filas.setdefault(seccion, []).append((mm.group(1).strip(), precio))

def ref(s):
    s = s.upper()
    for a, b in (('Á', 'A'), ('É', 'E'), ('Í', 'I'), ('Ó', 'O'), ('Ú', 'U'), ('Ñ', 'N')): s = s.replace(a, b)
    return re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-')

productos = []  # dicts con las columnas del CSV
def mete(referencia, nombre, familia, precio, atributos, notas=''):
    productos.append(dict(referencia=referencia, nombre=nombre, familia=familia, unidad='ud',
                          precio_tarifa='%.2f' % precio, iva='21', atributos=json.dumps(atributos, ensure_ascii=False),
                          notas=(notas + '; ' if notas else '') + NOTA))

# 1 · Inversores híbridos Deye
COMPAT_LV = 'Según la tarifa, compatibles (48 V): WeCo 5K3 EVO, 5K0 LT, 16K0, Deye SE-G5.1 Pro, Pylontech «entre otras». REVISAR fichas técnicas y terminales antes de hacer reglas'
COMPAT_HV = 'Según la tarifa, compatibles (alto voltaje): WeCo 5K3 EVO + HV-Box, Pylontech Force, BYD HVS. REVISAR fichas técnicas'
for sec, fases in (('HÍBRIDOS MONOFÁSICOS', 1), ('HÍBRIDOS TRIFÁSICOS', 3)):
    for modelo, precio in filas.get(sec, []):
        mk = re.search(r'(SUN-(\d+)K-[A-Z0-9-]+)', modelo)
        if not mk: continue
        kw = float(mk.group(2))
        hv = 'HP3' in mk.group(1)
        mete('FV-DEYE-' + ref(mk.group(1)), 'Deye híbrido ' + mk.group(1), 'inversor', precio,
             {'marca': 'deye', 'potencia_kw': kw, 'fases': fases, 'tipo': 'hibrido', 'bateria_v': 'alto' if hv else '48'},
             ('Alto voltaje. ' + COMPAT_HV) if hv else ('WiFi Stick incluido. ' + COMPAT_LV))

# 2 · Meters: solo medida indirecta, y el WiFi de Deye
for modelo, precio in filas.get('ACCESORIOS DEYE', []):
    u = modelo.upper()
    if 'METER' in u and 'INDIRECTA' in u:
        fases = 3 if '3PH' in u else 1
        mete('FV-DEYE-METER-' + ('SDM630' if fases == 3 else 'SDM230') + '-INDIRECTA', modelo.title().replace('Sdm', 'SDM').replace('Ph', 'PH'),
             'contador', precio, {'marca': 'eastron', 'fases': fases, 'medida': 'indirecta'}, 'Medidor para Deye, medida indirecta (con transformadores)')
    elif 'METER WIFI' in u:
        mete('FV-DEYE-METER-WIFI-SUN-SMART-CT01', 'Deye Meter WiFi SUN-SMART-CT01', 'contador', precio,
             {'marca': 'deye', 'medida': 'wifi'}, 'Medidor WiFi Deye')

# 3 · Baterías WECO y Deye (con sus accesorios)
def bateria(sec, marca, modelo, precio):
    u = modelo.upper()
    cap = re.search(r'(\d+[,.]\d+)\s*KWH', u)
    kwh = float(cap.group(1).replace(',', '.')) if cap else None
    if kwh is None and 'SE-F5' in u: kwh = 5.12
    if kwh is None and 'BOS-GM5.1' in u: kwh = 5.12
    if kwh is None and 'GB-W-PACK12' in u: kwh = None
    # Batería = trae kWh y no es un accesorio (la 5K3 EVO lleva «WIFI+BLUETOOTH» en el nombre: no es el dongle).
    es_bat = kwh is not None and not any(k in u for k in ('CABLE', 'HUB', 'BUS BAR', 'PUENTE', 'KIT', 'DONGLE', 'STICK', 'RACK', 'BOX', 'HVB', 'RUEDAS'))
    familia = 'bateria' if es_bat else 'accesorio'
    atr = {'marca': marca}
    if es_bat: atr['capacidad_kwh'] = kwh
    if 'ALTO VOLTAJE' in sec or 'HV' in u: atr['bateria_v'] = 'alto'
    nombre = (marca.upper() if marca == 'weco' else 'Deye') + ' ' + re.sub(r'^(WECO|DEYE)\s+', '', modelo, flags=re.I)
    mete('FV-' + marca.upper() + '-' + ref(re.sub(r'^(WECO|DEYE)\s+', '', modelo, flags=re.I)), nombre, familia, precio, atr,
         ('Batería ' + sec.title() if es_bat else 'Accesorio de ' + sec.title()) + '. Compatibilidad con cada inversor: REVISAR fichas técnicas y terminales')
for sec in ('WECO 5K0 LT', 'WECO 5K3 EVO', 'WECO 16K0 LV'):
    for modelo, precio in filas.get(sec, []): bateria(sec, 'weco', modelo, precio)
for sec in ('DEYE BAJO VOLTAJE', 'DEYE ALTO VOLTAJE'):
    for modelo, precio in filas.get(sec, []): bateria(sec, 'deye', modelo, precio)

if not productos:
    sys.exit('No se ha encontrado ninguna tabla: ¿es la tarifa de Rebacas?')

# ---------------------------------------------------------------------------
# Upsert en el CSV (por referencia): lo que ya está se pisa, lo demás se queda.
# ---------------------------------------------------------------------------
COLUMNAS = ['referencia', 'nombre', 'familia', 'unidad', 'precio_tarifa', 'iva', 'atributos', 'notas']
existentes = list(csv.DictReader(open(CSV, encoding='utf-8'))) if os.path.exists(CSV) else []
por_ref = {x['referencia']: x for x in existentes}
nuevos = cambiados = 0
for p in productos:
    if p['referencia'] in por_ref:
        if por_ref[p['referencia']]['precio_tarifa'] != p['precio_tarifa']: cambiados += 1
        por_ref[p['referencia']].update(p)
    else:
        por_ref[p['referencia']] = p; nuevos += 1
with open(CSV, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, COLUMNAS); w.writeheader()
    for x in por_ref.values(): w.writerow({c: x.get(c, '') for c in COLUMNAS})
print(TARIFA, '·', len(productos), 'productos de Rebacas (', nuevos, 'nuevos,', cambiados, 'con precio distinto ) →', CSV)
for p in productos:
    print('  %-44s %9s €  %s' % (p['referencia'], p['precio_tarifa'], p['familia']))
