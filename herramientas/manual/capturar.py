#!/usr/bin/env python3
"""
Sysefen · Las capturas del manual de usuario

QUÉ HACE:
  Fotografía cada pantalla de la app, por tipo de usuario, con datos de
  mentira (escenas.js), y deja los PNG en manual/img/. De ahí los coge
  manual/index.html.

CÓMO:
  1. Copia index.html a una página de prueba que expone lo de dentro
     (`window.__m`) y carga escenas.js. Se borra al acabar.
  2. Levanta un servidor local y, con WebKit (el motor de Safari, viene con
     macOS), carga la página a tamaño de móvil, llama a la escena y saca la
     captura. No hace falta instalar nada.

USO:
  python3 herramientas/manual/capturar.py            todas
  python3 herramientas/manual/capturar.py jefe-hoy   solo esa (o varias)
"""
import os, re, subprocess, sys, json, time, socket

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AQUI = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(RAIZ, 'manual', 'img')
PUERTO = 8766
ANCHO, ALTO, ESCALA = 390, 844, 2

SNAP = r'''
import WebKit
let a = CommandLine.arguments
let url = URL(string: a[1])!, out = a[2], escena = a[3]
let W = CGFloat(Double(a[4])!), H = CGFloat(Double(a[5])!), K = CGFloat(Double(a[6])!)
let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: W, height: H), configuration: WKWebViewConfiguration())
var done = false
class D: NSObject, WKNavigationDelegate {
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
      w.evaluateJavaScript("window.__manual.escena('" + escena + "')") { _, e in
        if let e = e { print("fallo js:", e); done = true; return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
          let c = WKSnapshotConfiguration(); c.rect = w.bounds; c.snapshotWidth = NSNumber(value: Double(W * K))
          w.takeSnapshot(with: c) { img, err in
            if let img = img, let t = img.tiffRepresentation, let b = NSBitmapImageRep(data: t), let png = b.representation(using: .png, properties: [:]) {
              try? png.write(to: URL(fileURLWithPath: out)); print("ok")
            } else { print("fallo", err ?? "") }
            done = true
          }
        }
      }
    }
  }
}
let d = D(); wv.navigationDelegate = d
wv.load(URLRequest(url: url))
let limite = Date(timeIntervalSinceNow: 25)
while !done && Date() < limite { RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1)) }
if !done { print("fallo: tiempo") }
'''


def pagina_prueba():
    s = open(os.path.join(RAIZ, 'index.html'), encoding='utf-8').read()
    i = s.rfind('</script>')
    gancho = """
window.__m = { S, V, A, render, agNuevoCliente, agNuevaCita, limpiarBorradorVisita,
  empRows: (x) => { empRows = x; }, empIdPorNombre: (x) => { empIdPorNombre = x; }, nombrePorEmpId: (x) => { nombrePorEmpId = x; } };
"""
    s = s[:i] + gancho + s[i:]
    # sin service worker ni Turnstile ni sesión de Supabase: es una foto
    s = s.replace("if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {", "if (false) {")
    s = s.replace('restaurarSesion();', '/* sin sesión: manual */')
    # Como módulo: los módulos corren en orden y después de la app, que también
    # es un módulo. Como script normal corría antes y no encontraba window.__m.
    s = s + '\n<script type="module" src="herramientas/manual/escenas.js"></script>\n'
    return s


def puerto_libre(p):
    with socket.socket() as s:
        return s.connect_ex(('127.0.0.1', p)) != 0


def main():
    pedidas = [a for a in sys.argv[1:] if not a.startswith('--')]
    os.makedirs(IMG, exist_ok=True)
    prueba = os.path.join(RAIZ, 'zz-manual.html')
    open(prueba, 'w', encoding='utf-8').write(pagina_prueba())
    swift = os.path.join(AQUI, 'snap.swift')
    open(swift, 'w').write(SNAP)
    # compilar una vez: correr `swift archivo.swift` 40 veces tarda minutos
    bin_ = os.path.join(AQUI, '.snap')
    r = subprocess.run(['swiftc', '-O', '-o', bin_, swift], capture_output=True, text=True)
    if r.returncode:
        sys.exit('No compila el capturador:\n' + r.stderr)
    servidor = None
    if puerto_libre(PUERTO):
        servidor = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO)], cwd=RAIZ,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.8)
    try:
        escenas = re.findall(r"^\s+'([a-z0-9-]+)': \(\) =>", open(os.path.join(AQUI, 'escenas.js'), encoding='utf-8').read(), flags=re.M)
        if pedidas:
            escenas = [e for e in escenas if e in pedidas]
        mal = []
        for e in escenas:
            out = os.path.join(IMG, e + '.png')
            r = subprocess.run([bin_, f'http://localhost:{PUERTO}/zz-manual.html', out, e, str(ANCHO), str(ALTO), str(ESCALA)],
                               capture_output=True, text=True, timeout=40)
            ok = 'ok' in r.stdout and 'fallo' not in r.stdout and os.path.exists(out)
            print(('  ✓ ' if ok else '  ✗ ') + e + ('' if ok else '  ' + (r.stdout + r.stderr).strip()[:200]))
            if not ok:
                mal.append(e)
        print(f'\n{len(escenas) - len(mal)} capturas en manual/img/' + (f' · {len(mal)} fallaron: {", ".join(mal)}' if mal else ''))
    finally:
        if servidor:
            servidor.terminate()
        for f in (prueba, swift, bin_):
            try:
                os.remove(f)
            except OSError:
                pass


if __name__ == '__main__':
    main()
