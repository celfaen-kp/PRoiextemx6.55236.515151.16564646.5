#!/usr/bin/env python3
"""Extrae el Catálogo General Vaillant 2026 (PDF -> CSV) para la tarifa «Vaillant 2026».

  python3 herramientas/extrae-tarifa-vaillant-2026.py catalogo.pdf            (necesita pypdf)
  python3 herramientas/extrae-tarifa-vaillant-2026.py catalogo.txt            (texto ya sacado)
  ... [--anterior vaillant-2025.csv] [--saunier saunier-2026.csv] [--salida carpeta]

Sale en la carpeta de tarifas del Drive (SYSEFEN DATA/07-Tarifas para app):
  vaillant-2026.csv            referencia, nombre, familia, unidad, precio_tarifa, iva, atributos
  vaillant-2026-revisar.txt    lo que no se ha cargado o hay que mirar a mano

El texto se saca con pypdf en modo «layout» (columnas separadas por espacios),
porque en este Mac no hay pdftotext. Cada fila del catálogo es
    descripción [columnas de la tabla]   referencia (10 dígitos)   precio   [página]
y el precio es SIEMPRE el primer número detrás de la referencia (en suelo
radiante detrás van el precio del rollo o del paquete y la página).

Criterios (Enzo, 10-11-2026: «revisa bien que sea esta guía la que usas… y eso es PVP»):
  · Son PVP sin IVA. El 43 % de descuento de distribuidor no va aquí: es
    productos.descuento_proveedor (sql/etapa84 y etapa105).
  · Una referencia que ya estaba en la tarifa 2025 conserva su nombre, familia y
    atributos (así se la encuentra igual que antes); solo cambia el precio.
  · «Consultar», filas con varias referencias y ejemplos de instalación (la
    referencia va delante) no son precios de tarifa: fuera.
  · Dos erratas del PDF, corregidas con la tarifa Saunier Duval 2026 (mismo
    grupo, misma referencia) y con la de 2025: ver ERRATAS.
"""
import collections, csv, json, os, re, sys

CARPETA = os.environ.get('SYSEFEN_TARIFAS') or os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app')

REF = re.compile(r'^(?:00|80)\d{8}$')
NUM = re.compile(r'^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$')
ETIQUETAS = re.compile(r'\s*\b(NOVEDAD|HASTA FIN DE EXISTENCIAS|PRÓXIMAMENTE|NUEVO)\b\s*', re.I)

# El PDF de 2026 trae intercambiados estos dos precios (págs. 109 y 126):
# actuador con final de carrera 2,45 € y adaptador 56 €. En 2025 eran 50 € y
# 2 €, y la tarifa Saunier Duval 2026 (misma referencia) dice 56 € y 2,45 €.
ERRATAS = {'0020254616': 56.0, '0020254573': 2.45}

FAMILIAS = [
    ('cascada',          r'Ampliaci[óo]n cascada'),
    # Lo que acompaña a una máquina no es la máquina, aunque la nombre.
    ('accesorio',        r'^(Kit|Vaso|Set de|Interfaz|Armario|Embellecedor|M[óo]dulo|Soportes?|Adaptador|Res\.|Resistencia|V[áa]lvula|Prolongaci[óo]n|Codo|Manguito|Juego|Conexi[óo]n|Aislamiento|Forro|Bandeja|Consola|Pies|Sif[óo]n|Tapas?)\b'),
    ('bomba_calor',      r'aroTHERM|flexoTHERM|geoTHERM|flexoCOMPACT|geoCOMPACT|Set (b[áa]sico|aut[óo]nomo|uniTOWER)|recoVAIR.*calor'),
    ('deposito_inercia', r'^VPS\b|^VP \d|^VP RW|^VI \d|inercia|allSTOR'),
    ('acumulador',       r'uniSTOR|actoSTOR|auroSTOR|^VIH\b'),
    ('caldera',          r'ecoTEC|atmoTEC|turboTEC|ecoCOMPACT|ecoVIT|^VKK\b'),
    ('termo',            r'aroSTOR|eloSTOR|^VEH\b|turboMAG|atmoMAG'),
    ('regulacion',       r'sensoCOMFORT|sensoHOME|sensoROOM|sensoDIRECT|^VRC|^VR\s?\d|multiMATIC|calorMATIC|^VRT|sensoNET|myVAILLANT|Gateway|termostato'),
    ('accesorio',        r'\bkit\b|soporte|v[áa]lvula|sonda|\bbomba\b|vaso|purgador|filtro|manguito|racor|adaptador|prolongaci[óo]n|codo|embellecedor|resistencia|^Res\.'),
]


def familia_de(nombre):
    for fam, pat in FAMILIAS:
        if re.search(pat, nombre, re.I):
            return fam
    return 'otros'


def atributos_de(nombre, fam):
    atr = {}
    if fam in ('bomba_calor', 'cascada'):
        m = (re.search(r'(?:exclusive ES|plus ES|perform|pure|Split plus|Split|aroTHERM plus|flexoTHERM|geoTHERM|flexoCOMPACT|geoCOMPACT)(?: con acumulaci[óo]n)?\s+(\d{1,2})\b', nombre, re.I))
        if m and 3 <= int(m.group(1)) <= 80:
            atr['potencia_kw'] = int(m.group(1))
    if re.search(r'\b400\s?V\b|trif[áa]sic', nombre, re.I):   # ojo: «Vitrificado» lleva «trif»
        atr['trifasica'] = True
    if re.search(r'cableado', nombre, re.I):
        atr['control'] = 'cableado'
    elif re.search(r'inal[áa]mbrico|radio', nombre, re.I) and fam in ('bomba_calor', 'regulacion'):
        atr['control'] = 'inalambrico'
    m = re.search(r'\((\d{2,4})\s*l\)', nombre)
    if m and fam == 'bomba_calor':
        atr['litros'] = int(m.group(1))
    return atr


def num(s):
    return float(s.replace('.', '').replace(',', '.'))


def texto_de(ruta):
    if ruta.lower().endswith('.txt'):
        return open(ruta, encoding='utf-8').read()
    try:
        import pypdf
    except ImportError:
        sys.exit('Hace falta pypdf para leer el PDF (python3 -m venv v && v/bin/pip install pypdf), o pásale el .txt ya sacado.')
    lector = pypdf.PdfReader(ruta)
    trozos = []
    for i, p in enumerate(lector.pages):
        trozos.append('\n\f=== PAGINA %d ===\n' % (i + 1) + (p.extract_text(extraction_mode='layout') or ''))
    return ''.join(trozos)


def limpia(nombre):
    n = ETIQUETAS.sub(' ', nombre)
    n = re.sub(r'\s+', ' ', n.replace('•', ' ')).strip(' ·-*')
    return n


def nombre_de(apariciones):
    """De todas las veces que sale una referencia, el mejor nombre: una fila de
    lista (un solo texto delante de la referencia) antes que una de tabla."""
    de_lista = [limpia(t[0]) for t in apariciones if len(t) == 1]
    de_lista = [n for n in de_lista if len(n) >= 8 and n[:1].isupper() or re.match(r'^(aro|flexo|geo|uni|senso|eco|turbo|atmo|clima|auro|allSTOR|elo|reco|my|mini)', n)]
    if de_lista:
        return max(de_lista, key=len)[:200], True
    # Fila de tabla: fuera las viñetas del margen (y la frase que arrastran).
    toks = list(apariciones[0])
    if toks and toks[0] == '·':
        toks = toks[2:]
    elif toks and toks[0].startswith('·'):
        toks = toks[1:]
    toks = [t for t in toks if not ETIQUETAS.fullmatch(' ' + t + ' ') and t.upper() not in ('NOVEDAD', 'PRÓXIMAMENTE')]
    n = limpia(' '.join(toks))
    return n[:200], False


def leer_csv(ruta):
    if not ruta or not os.path.exists(ruta):
        return {}
    with open(ruta, encoding='utf-8', newline='') as f:
        return {r['referencia']: r for r in csv.DictReader(f)}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    opc = {sys.argv[i][2:]: sys.argv[i + 1] for i in range(1, len(sys.argv) - 1) if sys.argv[i].startswith('--')}
    args = [a for a in args if a not in opc.values()]
    salida = opc.get('salida', CARPETA)
    anterior = leer_csv(opc.get('anterior', os.path.join(CARPETA, 'vaillant-2025.csv')))
    saunier = leer_csv(opc.get('saunier', os.path.join(CARPETA, 'saunier-2026.csv')))
    texto = texto_de(args[0])

    ap = collections.defaultdict(list)       # ref -> [tokens delante de la referencia]
    precios = collections.defaultdict(list)  # ref -> [(precio, página)]
    consultar, sin_precio, varias = set(), collections.defaultdict(list), 0
    pag = 0
    for ln in texto.splitlines():
        m = re.match(r'=== PAGINA (\d+) ===', ln)
        if m:
            pag = int(m.group(1)); continue
        toks = [x.strip() for x in re.split(r'\s{2,}', ln.strip()) if x.strip()]
        idx = [i for i, x in enumerate(toks) if REF.match(x)]
        if not idx:
            continue
        if len(idx) > 1:
            varias += 1; continue                 # tablas de combinaciones: no son precios
        i = idx[0]; ref = toks[i]
        if i == 0:
            continue                              # ejemplos de instalación: cantidad × precio = total
        sig = toks[i + 1] if i + 1 < len(toks) else ''
        if re.match(r'(?i)consultar', sig):
            consultar.add(ref); continue
        if not NUM.match(sig):
            sin_precio[ref].append('pág. %d: %s' % (pag, ' | '.join(toks)[:140])); continue
        ap[ref].append(tuple(toks[:i]))
        precios[ref].append((num(sig), pag))

    filas, revisar = [], []
    for ref in sorted(ap):
        vistos = sorted({p for p, _ in precios[ref]})
        precio = precios[ref][0][0]               # manda la primera vez que sale (la guía del capítulo)
        if len(vistos) > 1:
            revisar.append('%s: sale con varios precios %s; se toma %s (pág. %d)' % (ref, vistos, precio, precios[ref][0][1]))
        if ref in ERRATAS:
            revisar.append('%s: el PDF dice %s €; se carga %s € (errata del catálogo: ver ERRATAS)' % (ref, precio, ERRATAS[ref]))
            precio = ERRATAS[ref]
        if precio <= 0:
            continue
        viejo = anterior.get(ref)
        if viejo:
            nombre, fam, unidad = viejo['nombre'], viejo['familia'], viejo.get('unidad') or 'ud'
            try:
                atr = json.loads(viejo.get('atributos') or '{}')
            except ValueError:
                atr = {}
            pv = float(viejo['precio_tarifa'])
            if pv > 0 and not 0.9 <= precio / pv <= 1.35:
                revisar.append('%s %s: %s € en 2025 → %s € en 2026 (pág. %d)' % (ref, nombre[:60], pv, precio, precios[ref][0][1]))
        else:
            nombre, limpio = nombre_de(ap[ref])
            if len(nombre) < 6 or ' ' not in nombre or nombre.lower() in ('opcional', 'referencia') or nombre[:1].islower() and not re.match(r'^(aro|flexo|geo|uni|senso|eco|turbo|atmo|clima|auro|allSTOR|elo|reco|my|mini)', nombre):
                revisar.append('%s: nombre cortado en el PDF («%s», %s €, pág. %d): NO se carga' % (ref, nombre, precio, precios[ref][0][1]))
                continue
            fam = familia_de(nombre); atr = atributos_de(nombre, fam); unidad = 'ud'
            if not limpio:
                atr['nombre_de_tabla'] = True
        sd = saunier.get(ref)
        if sd and abs(float(sd['precio_tarifa']) - precio) > 0.005:
            revisar.append('%s %s: Vaillant %s € y Saunier Duval %s € para la misma referencia' % (ref, nombre[:60], precio, sd['precio_tarifa']))
        filas.append({'referencia': ref, 'nombre': nombre, 'familia': fam, 'unidad': unidad,
                      'precio_tarifa': '%.2f' % precio, 'iva': '21', 'atributos': json.dumps(atr, ensure_ascii=False, sort_keys=True)})

    os.makedirs(salida, exist_ok=True)
    with open(os.path.join(salida, 'vaillant-2026.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['referencia', 'nombre', 'familia', 'unidad', 'precio_tarifa', 'iva', 'atributos'])
        w.writeheader(); w.writerows(filas)

    en26 = {r['referencia'] for r in filas}
    bajas = [r for r in anterior if r not in en26]
    with open(os.path.join(salida, 'vaillant-2026-revisar.txt'), 'w', encoding='utf-8') as f:
        f.write('Catálogo General Vaillant 2026 → vaillant-2026.csv\n')
        f.write('%d productos con precio · %d ya estaban en 2025 · %d nuevos · %d de 2025 que ya no están\n' % (len(filas), sum(1 for r in filas if r['referencia'] in anterior), sum(1 for r in filas if r['referencia'] not in anterior), len(bajas)))
        f.write('%d referencias «Consultar» (sin precio) · %d líneas de tablas con varias referencias (no son precios)\n\n' % (len(consultar), varias))
        f.write('A MIRAR\n' + '\n'.join('  · ' + x for x in revisar) + '\n\n')
        f.write('CON REFERENCIA PERO SIN PRECIO EN LA MISMA LÍNEA (no cargadas)\n' + '\n'.join('  · %s: %s' % (r, v[0]) for r, v in sorted(sin_precio.items()) if r not in en26) + '\n\n')
        f.write('ESTABAN EN 2025 Y YA NO ESTÁN EN EL CATÁLOGO 2026\n' + '\n'.join('  · %s %s (%s €)' % (r, anterior[r]['nombre'][:80], anterior[r]['precio_tarifa']) for r in sorted(bajas)) + '\n')

    print('%d productos → %s' % (len(filas), os.path.join(salida, 'vaillant-2026.csv')))
    print('  ya estaban en 2025: %d · nuevos: %d · de 2025 que ya no están: %d' % (sum(1 for r in filas if r['referencia'] in anterior), sum(1 for r in filas if r['referencia'] not in anterior), len(bajas)))
    print('  a mirar: %d · consultar: %d · sin precio en la línea: %d' % (len(revisar), len(consultar), len([r for r in sin_precio if r not in en26])))
    for fam, n in collections.Counter(r['familia'] for r in filas).most_common():
        print('    %-17s %4d' % (fam, n))


if __name__ == '__main__':
    main()
