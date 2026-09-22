#!/usr/bin/env python3
"""
Sysefen · Cargar una tarifa de fabricante en `productos` (sql/etapa38)

QUÉ HACE:
  Lee un CSV de la carpeta de tarifas (SYSEFEN DATA/07-Tarifas para app, en
  el Drive; el que sacan los extractores) y lo mete
  en la tabla `productos`, colgado de su fila de `tarifas`. Es idempotente por
  (tarifa_id, referencia): se puede ejecutar dos veces y la segunda no hace
  nada.

  Solo toca las columnas que vienen en el CSV (nombre, familia, unidad,
  precio_tarifa, iva, atributos). Lo que se escribe a mano en Supabase
  (detalle_tecnico, especificaciones, descuento_proveedor, tl_producto_id) no
  se pisa nunca.

UNA TARIFA NO SE EDITA:
  Si al volver a cargar una tarifa ya cargada cambia algún PRECIO, se para y lo
  enseña. La regla del motor es que la tarifa vigente no se toca: se publica la
  siguiente (otra fila en `tarifas`, otro CSV) y se cierra la anterior. Si de
  verdad era una errata del extractor, --forzar lo deja pasar.

CÓMO SE USA:
  python3 herramientas/cargar-tarifa.py vaillant-2025 --prueba
  SUPABASE_SERVICE_ROLE_KEY=... python3 herramientas/cargar-tarifa.py vaillant-2025
  SUPABASE_SERVICE_ROLE_KEY=... python3 herramientas/cargar-tarifa.py midea-2026
  SUPABASE_SERVICE_ROLE_KEY=... python3 herramientas/cargar-tarifa.py saunier-2026

  El primer argumento es el nombre del CSV (con o sin .csv, con o sin ruta).
  El nombre de la tarifa se deduce del fichero (TARIFAS, abajo); si es una
  tarifa nueva, se pasa detrás: ... carrier-2027 'Carrier 2027'

  --prueba   lee y valida el CSV, no se conecta a nada
  --forzar   deja cambiar precios de una tarifa ya cargada

LA CLAVE:
  Escribir en `productos` es cosa de Administración (política *_admin de la
  etapa 38). Esto usa la service role key de Supabase (Settings → API Keys →
  secret), que se pasa en la variable SUPABASE_SERVICE_ROLE_KEY al ejecutar y
  no se guarda en ningún sitio. Nunca en el código ni en Git.

  (No entra con el PIN como copia-seguridad.py porque la entrada con PIN lleva
  ahora la comprobación antirrobots, y un script no la pasa.)
"""

import csv, json, os, re, sys, urllib.error, urllib.parse, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Las tarifas viven fuera del repo, en el Drive de la empresa (el repo es
# público y el histórico de presupuestos no debe estar en él). Si algún día se
# mueven, se pasa la carpeta en SYSEFEN_TARIFAS sin tocar esto.
CARPETA = os.environ.get('SYSEFEN_TARIFAS') or os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app')

# Fichero -> nombre de la fila en `tarifas` (la semilla de la etapa 38)
TARIFAS = {
    'vaillant-2025': 'Vaillant 2025',
    'midea-2026': 'Midea 2026',
    'saunier-2026': 'Saunier Duval 2026',
}

COLUMNAS = ('referencia', 'nombre', 'familia', 'unidad', 'precio_tarifa', 'iva', 'atributos')
LOTE = 200


def leer_csv(ruta):
    """Devuelve las filas listas para `productos`, o se para si algo no cuadra."""
    with open(ruta, encoding='utf-8', newline='') as f:
        lector = csv.DictReader(f)
        falta = [c for c in COLUMNAS if c not in (lector.fieldnames or [])]
        if falta:
            sys.exit(f'Al CSV le faltan columnas: {", ".join(falta)}')
        filas, errores, vistas = [], [], set()
        for n, r in enumerate(lector, start=2):
            ref = (r['referencia'] or '').strip()
            if not ref:
                errores.append(f'línea {n}: sin referencia'); continue
            if ref in vistas:
                errores.append(f'línea {n}: referencia {ref} repetida'); continue
            vistas.add(ref)
            try:
                precio = round(float(r['precio_tarifa']), 2)
                iva = round(float(r['iva'] or 21), 2)
            except ValueError:
                errores.append(f'línea {n} ({ref}): precio o IVA no es un número'); continue
            if precio <= 0:
                errores.append(f'línea {n} ({ref}): precio {precio}'); continue
            try:
                atributos = json.loads(r['atributos'] or '{}')
                if not isinstance(atributos, dict):
                    raise ValueError
            except ValueError:
                errores.append(f'línea {n} ({ref}): atributos no es un JSON de objeto'); continue
            filas.append({
                'referencia': ref,
                'nombre': (r['nombre'] or '').strip() or ref,
                'familia': (r['familia'] or '').strip() or 'otros',
                'unidad': (r['unidad'] or '').strip() or 'ud',
                'precio_tarifa': precio,
                'iva': iva,
                'atributos': atributos,
            })
    if errores:
        print('El CSV tiene fallos, no se carga nada:')
        for e in errores[:30]:
            print('  ·', e)
        if len(errores) > 30:
            print(f'  … y {len(errores) - 30} más')
        sys.exit(1)
    return filas


def config():
    """La URL sale del cliente de la app; la clave secreta, del entorno."""
    txt = open(os.path.join(RAIZ, 'supabase-client.js'), encoding='utf-8').read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", txt)
    if not url:
        sys.exit('No encuentro SUPABASE_URL en supabase-client.js')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
    if not key:
        sys.exit('Falta la clave: ejecútalo con SUPABASE_SERVICE_ROLE_KEY=... delante '
                 '(Supabase → Settings → API Keys → secret). O usa --prueba.')
    return url.group(1).rstrip('/'), key


def pedir(base, key, ruta, datos=None, metodo=None, prefer=None):
    cab = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
    if prefer:
        cab['Prefer'] = prefer
    cuerpo = json.dumps(datos).encode() if datos is not None else None
    req = urllib.request.Request(base + ruta, data=cuerpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code} en {ruta}\n{e.read().decode()[:400]}')


def id_tarifa(base, key, nombre):
    q = urllib.parse.quote(nombre)
    res = pedir(base, key, f'/rest/v1/tarifas?nombre=eq.{q}&select=id,vigente_hasta')
    if not res:
        sys.exit(f'No hay ninguna tarifa "{nombre}" en Supabase. '
                 '¿Se ejecutó sql/etapa38_motor_presupuestos.sql? Si es nueva, créala primero en `tarifas`.')
    if res[0].get('vigente_hasta'):
        print(f'Aviso: la tarifa "{nombre}" está cerrada (vigente hasta {res[0]["vigente_hasta"]}).')
    return res[0]['id']


def existentes(base, key, tarifa_id):
    """Lo que ya hay de esa tarifa, por referencia. Se pide por páginas."""
    hay, desde = {}, 0
    while True:
        pag = pedir(base, key,
                    f'/rest/v1/productos?tarifa_id=eq.{tarifa_id}'
                    f'&select=referencia,nombre,familia,unidad,precio_tarifa,iva,atributos'
                    f'&order=referencia&limit=1000&offset={desde}')
        for p in pag or []:
            hay[p['referencia']] = p
        if not pag or len(pag) < 1000:
            return hay
        desde += 1000


def igual(fila, p):
    return (fila['nombre'] == p['nombre'] and fila['familia'] == p['familia']
            and fila['unidad'] == p['unidad']
            and float(fila['precio_tarifa']) == float(p['precio_tarifa'])
            and float(fila['iva']) == float(p['iva'])
            and fila['atributos'] == (p['atributos'] or {}))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    prueba, forzar = '--prueba' in sys.argv, '--forzar' in sys.argv
    if not args:
        sys.exit(__doc__)
    nombre_csv = os.path.basename(args[0])[:-4] if args[0].endswith('.csv') else os.path.basename(args[0])
    ruta = args[0] if os.path.sep in args[0] and os.path.exists(args[0]) else os.path.join(CARPETA, nombre_csv + '.csv')
    if not os.path.exists(ruta):
        sys.exit(f'No encuentro {ruta}')
    tarifa = args[1] if len(args) > 1 else TARIFAS.get(nombre_csv)
    if not tarifa:
        sys.exit(f'No sé a qué tarifa va "{nombre_csv}". Pásalo detrás: ... {nombre_csv} "Nombre de la tarifa"')

    filas = leer_csv(ruta)
    familias = {}
    for f in filas:
        familias[f['familia']] = familias.get(f['familia'], 0) + 1
    print(f'{os.path.basename(ruta)} → "{tarifa}": {len(filas)} productos')
    print('  familias: ' + ', '.join(f'{k} {v}' for k, v in sorted(familias.items(), key=lambda x: -x[1])))
    if prueba:
        print('Prueba: el CSV está bien. No se ha conectado a nada.')
        return

    base, key = config()
    tarifa_id = id_tarifa(base, key, tarifa)
    hay = existentes(base, key, tarifa_id)

    nuevas = [f for f in filas if f['referencia'] not in hay]
    cambian = [f for f in filas if f['referencia'] in hay and not igual(f, hay[f['referencia']])]
    precio = [f for f in cambian if float(f['precio_tarifa']) != float(hay[f['referencia']]['precio_tarifa'])]
    sobran = sorted(set(hay) - {f['referencia'] for f in filas})

    if precio and not forzar:
        print(f'\nPARADO: {len(precio)} precios cambiarían en una tarifa ya cargada.')
        for f in precio[:15]:
            print(f'  {f["referencia"]}  {hay[f["referencia"]]["precio_tarifa"]} → {f["precio_tarifa"]}  {f["nombre"][:50]}')
        print('Una tarifa vigente no se edita: publica la siguiente como tarifa nueva. '
              'Si es una errata del extractor, vuelve a ejecutar con --forzar.')
        sys.exit(2)

    subir = nuevas + cambian
    for i in range(0, len(subir), LOTE):
        lote = [dict(f, tarifa_id=tarifa_id) for f in subir[i:i + LOTE]]
        pedir(base, key, '/rest/v1/productos?on_conflict=tarifa_id,referencia', lote,
              metodo='POST', prefer='resolution=merge-duplicates,return=minimal')

    print(f'\nHecho: {len(nuevas)} nuevos, {len(cambian)} corregidos, '
          f'{len(filas) - len(subir)} ya estaban igual.')
    if sobran:
        print(f'Aviso: {len(sobran)} productos de "{tarifa}" en Supabase no vienen en el CSV '
              f'(no se borran): {", ".join(sobran[:8])}{"…" if len(sobran) > 8 else ""}')


if __name__ == '__main__':
    main()
