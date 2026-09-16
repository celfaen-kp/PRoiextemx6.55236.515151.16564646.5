#!/usr/bin/env python3
"""Pide a Google el permiso permanente (refresh token) para subir planillas a Drive.

Se ejecuta EN ESTE MAC. Abre el navegador, tú pulsas "Permitir" y el permiso
queda guardado en un archivo de esta misma carpeta. Ni el secreto ni el permiso
salen de aquí.

ANTES: pega el ID y el secreto del cliente de OAuth en google-credenciales.json
(el cliente de tipo Escritorio que creaste en Google Cloud).

USO:  python3 herramientas/permiso-google.py
"""

import http.server
import json
import pathlib
import socketserver
import subprocess
import threading
import urllib.parse
import urllib.request

AQUI = pathlib.Path(__file__).parent
CRED = AQUI / 'google-credenciales.json'
SALIDA = AQUI / 'google-refresh-token.txt'
PUERTO = 53682
REDIRECCION = f'http://localhost:{PUERTO}'
ALCANCE = 'https://www.googleapis.com/auth/drive.file'

PAGINA_OK = """<!doctype html><meta charset="utf-8">
<body style="font-family:system-ui;margin:0;display:flex;height:100vh;align-items:center;justify-content:center;background:#f5f4ef;color:#14170f">
<div style="text-align:center;max-width:420px">
<div style="font-size:44px">✓</div>
<h1 style="font-size:22px;margin:12px 0 6px">Permiso concedido</h1>
<p style="color:#6b6d66;line-height:1.5">Ya puedes cerrar esta pestaña y volver a la conversación.</p>
</div></body>"""

codigo = {}


class Manejador(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        datos = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        codigo['code'] = (datos.get('code') or [''])[0]
        codigo['error'] = (datos.get('error') or [''])[0]
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(PAGINA_OK.encode())
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def log_message(self, *_):
        pass


def main():
    if not CRED.exists():
        print('Falta el archivo', CRED)
        return 1
    cred = json.loads(CRED.read_text())
    cid, secreto = cred.get('client_id', ''), cred.get('client_secret', '')
    if not cid or not secreto or 'PEGA_AQUI' in cid or 'PEGA_AQUI' in secreto:
        print('Pega el ID y el secreto del cliente en', CRED)
        return 1

    url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode({
        'client_id': cid,
        'redirect_uri': REDIRECCION,
        'response_type': 'code',
        'scope': ALCANCE,
        'access_type': 'offline',
        'prompt': 'consent',
    })

    print('Abriendo el navegador. Entra con la cuenta dueña de la carpeta de Drive y pulsa Permitir.')
    print('Si no se abre solo, copia y pega esta dirección en el navegador:\n')
    print(url, '\n')
    try:
        subprocess.run(['open', url], check=False)
    except Exception:
        pass

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', PUERTO), Manejador) as servidor:
        print('Esperando tu permiso…')
        servidor.serve_forever()

    if codigo.get('error'):
        print('Google devolvió un error:', codigo['error'])
        return 1
    if not codigo.get('code'):
        print('No llegó ningún permiso.')
        return 1

    peticion = urllib.request.Request(
        'https://oauth2.googleapis.com/token',
        data=urllib.parse.urlencode({
            'code': codigo['code'],
            'client_id': cid,
            'client_secret': secreto,
            'redirect_uri': REDIRECCION,
            'grant_type': 'authorization_code',
        }).encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        with urllib.request.urlopen(peticion) as r:
            res = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print('Google rechazó el intercambio:', e.read().decode()[:400])
        return 1

    refresh = res.get('refresh_token')
    if not refresh:
        print('Google no devolvió permiso permanente. Vuelve a ejecutarlo: si ya lo habías dado antes,')
        print('quita el acceso en https://myaccount.google.com/permissions y repite.')
        return 1

    SALIDA.write_text(refresh + '\n')
    try:
        SALIDA.chmod(0o600)
    except Exception:
        pass
    print('\nListo. El permiso está guardado en:')
    print(' ', SALIDA)
    print('\nÁbrelo, copia esa línea y pégala en Supabase como el secreto GOOGLE_REFRESH_TOKEN.')
    print('Cuando lo hayas pegado, borra ese archivo.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
