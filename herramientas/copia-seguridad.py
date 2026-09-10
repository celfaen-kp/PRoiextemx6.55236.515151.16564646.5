#!/usr/bin/env python3
"""
Sysefen · Copia de seguridad de los datos

POR QUÉ EXISTE:
  El plan gratuito de Supabase no hace copias automáticas. Si alguien borra algo
  o una migración sale mal, no hay "restaurar a ayer". Esto se ejecuta desde
  cualquier ordenador, sin instalar nada, y deja una carpeta con TODO en JSON y
  en CSV: fichajes, imputaciones, partes, horas, materiales, empleados y obras.

  El JSON es la copia fiel (para reconstruir). El CSV es para abrirlo en Excel y
  mirarlo sin herramientas.

CÓMO SE USA:
  python3 herramientas/copia-seguridad.py Administración 9999
  python3 herramientas/copia-seguridad.py Administración 9999 ~/Desktop/copias

  El PIN se pasa al ejecutar y NO se guarda en ningún sitio. Entra con los
  mismos permisos que esa persona en la app: para una copia completa, hazla con
  la cuenta de Administración.

QUÉ NO ES:
  Esto copia los DATOS, no la estructura (tablas, políticas, triggers). Eso vive
  en los .sql de la carpeta sql/, que están en Git. Con las dos cosas se puede
  levantar el proyecto entero desde cero.
"""

import sys, os, json, csv, re, urllib.request, urllib.error
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Tablas a copiar, en orden de dependencia (padres antes que hijos), que es el
# orden en que habría que reinsertarlas si algún día hay que restaurar.
TABLAS = [
    'empleados',
    'obras',
    'obra_empleados',
    'fichajes',
    'imputaciones',
    'partes',
    'parte_horas',
    'parte_materiales',
    'parte_adjuntos',   # puede no existir todavía (etapa12)
    'documentos',       # puede no existir todavía (etapa13)
    'incidencias',
]


def config():
    """Lee la URL y la clave pública del propio cliente de la app."""
    txt = open(os.path.join(RAIZ, 'supabase-client.js'), encoding='utf-8').read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", txt)
    key = re.search(r"SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'", txt)
    if not url or not key:
        sys.exit('No encuentro la URL o la clave en supabase-client.js')
    return url.group(1), key.group(1)


def pedir(url, key, token=None, datos=None):
    cab = {'apikey': key, 'Content-Type': 'application/json'}
    if token:
        cab['Authorization'] = 'Bearer ' + token
    cuerpo = json.dumps(datos).encode() if datos is not None else None
    req = urllib.request.Request(url, data=cuerpo, headers=cab)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode() or 'null')
    except urllib.error.HTTPError as e:
        detalle = e.read().decode()[:300]
        raise RuntimeError(f'HTTP {e.code} en {url}\n{detalle}')


def entrar(base, key, nombre, pin):
    """El PIN visual se convierte en la contraseña real igual que en la app."""
    emails = {
        'Bayron': 'bayron@sysefen.app', 'Jaime': 'jaime@sysefen.app',
        'David': 'david@sysefen.app', 'Ale': 'ale@sysefen.app',
        'Administración': 'administracion@sysefen.app',
    }
    email = emails.get(nombre, nombre if '@' in nombre else None)
    if not email:
        sys.exit(f'No sé el email de "{nombre}". Pásame el email completo.')
    res = pedir(f'{base}/auth/v1/token?grant_type=password', key,
                datos={'email': email, 'password': str(pin).strip() + 'sysefen'})
    if not res or not res.get('access_token'):
        sys.exit('No he podido entrar. ¿Seguro que el PIN es ese?')
    return res['access_token']


def traer_todo(base, key, token, tabla):
    """Pagina de 1000 en 1000: PostgREST no devuelve más de golpe."""
    filas, desde, PASO = [], 0, 1000
    while True:
        url = f'{base}/rest/v1/{tabla}?select=*&limit={PASO}&offset={desde}'
        trozo = pedir(url, key, token)
        if not trozo:
            break
        filas.extend(trozo)
        if len(trozo) < PASO:
            break
        desde += PASO
    return filas


def guardar_csv(ruta, filas):
    if not filas:
        return
    columnas = list({c: None for f in filas for c in f}.keys())
    with open(ruta, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=columnas, delimiter=';', extrasaction='ignore')
        w.writeheader()
        for fila in filas:
            w.writerow({c: ('' if fila.get(c) is None else fila.get(c)) for c in columnas})


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__.strip().split('CÓMO SE USA:')[1].split('QUÉ NO ES:')[0].strip())
    nombre, pin = sys.argv[1], sys.argv[2]
    destino = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.expanduser('~'), 'Desktop', 'copias-sysefen')

    base, key = config()
    token = entrar(base, key, nombre, pin)

    sello = datetime.now().strftime('%Y-%m-%d_%H%M')
    carpeta = os.path.join(destino, 'sysefen-' + sello)
    os.makedirs(carpeta, exist_ok=True)

    resumen, total = {}, 0
    for tabla in TABLAS:
        try:
            filas = traer_todo(base, key, token, tabla)
        except RuntimeError as e:
            # Una tabla que aún no existe no debe tumbar la copia entera.
            resumen[tabla] = 'no existe' if '404' in str(e) or 'PGRST205' in str(e) else 'ERROR'
            continue
        with open(os.path.join(carpeta, tabla + '.json'), 'w', encoding='utf-8') as f:
            json.dump(filas, f, ensure_ascii=False, indent=1)
        guardar_csv(os.path.join(carpeta, tabla + '.csv'), filas)
        resumen[tabla] = len(filas)
        total += len(filas)

    with open(os.path.join(carpeta, '_resumen.json'), 'w', encoding='utf-8') as f:
        json.dump({'fecha': sello, 'hecha_por': nombre, 'filas': resumen}, f, ensure_ascii=False, indent=1)

    ancho = max(len(t) for t in TABLAS)
    print(f'\nCopia en: {carpeta}\n')
    for t in TABLAS:
        print(f'  {t.ljust(ancho)}  {resumen.get(t, "-")}')
    print(f'\n  {"TOTAL".ljust(ancho)}  {total} filas\n')
    if total == 0:
        sys.exit('Aviso: no se ha copiado ninguna fila. Revisa el usuario y el PIN.')


if __name__ == '__main__':
    main()
