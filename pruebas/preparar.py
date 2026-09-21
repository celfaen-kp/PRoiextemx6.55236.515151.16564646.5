#!/usr/bin/env python3
"""Saca el módulo de la app y sus dependencias en una forma que jsc pueda cargar.

El navegador usa módulos ES (import/export). jsc, tal como lo trae macOS, no.
Aquí se quitan los import/export y se dejan las piezas como variables sueltas.
"""
import re, pathlib, sys

BASE = pathlib.Path(__file__).resolve().parent.parent
FUERA = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/sysefen-pruebas')
FUERA.mkdir(parents=True, exist_ok=True)

def sin_modulos(ruta):
    s = (BASE / ruta).read_text()
    s = re.sub(r"^export default [\s\S]*?\n};\n", "", s, flags=re.M)
    s = re.sub(r"^export ", "", s, flags=re.M)
    s = re.sub(r"^import .*$", "", s, flags=re.M)
    return s

# La app: los import se cambian por las piezas ya preparadas.
html = (BASE / 'index.html').read_text()
app = re.search(r'<script type="module">(.*?)</script>', html, re.S).group(1)
app = re.sub(r"^import \{ supabase \}.*$", "var supabase = {};", app, flags=re.M)
app = re.sub(r"^import \* as (\w+) from '\./([\w.-]+)';$", r"var \1 = MODULOS['\2'];", app, flags=re.M)
(FUERA / 'app.js').write_text(app)

# Los esquemas y el formulario se cargan de verdad; del resto basta un hueco.
piezas = [
    "var nada = function () { return Promise.resolve(); };\n"
    "var falso = new Proxy({}, { get: function () { return nada; } });\n"
    "globalThis.MODULOS = {\n"
    "  'supabase-auth.js': new Proxy({ CUENTAS: {} }, { get: function (t, k) { return k in t ? t[k] : nada; } }),\n"
    "  'supabase-db.js': falso,\n"
    "  'visitas-db.js': falso,\n"
    "};\n",
    "(function(){\n" + sin_modulos('visitas-schemas.js') +
    "\nMODULOS['visitas-schemas.js'] = { VERSION: VERSION, CATEGORIAS: CATEGORIAS, COMUN: COMUN,"
    " ESQUEMAS: ESQUEMAS, etiqueta: etiqueta, proponer: proponer, loQueFalta: loQueFalta };\n})();\n",
    "(function(){\n" + sin_modulos('visitas-schemas.js') + "\n" + sin_modulos('visitas-form.js') +
    "\nMODULOS['visitas-form.js'] = { resumenHTML: resumenHTML, resumenTexto: resumenTexto,"
    " resumenFilas: resumenFilas, fichaHTML: fichaHTML, seccionHTML: seccionHTML, manejar: manejar };\n})();\n",
]
(FUERA / 'modulos.js').write_text(''.join(piezas))

# Y las piezas sueltas, por si una prueba quiere mirarlas sin la app entera.
for f in ('supabase-db.js', 'supabase-auth.js', 'visitas-db.js'):
    (FUERA / f).write_text(sin_modulos(f))

print('preparado en', FUERA)
