#!/usr/bin/env python3
"""Junta la Edge Function `presupuestar` en UN archivo para pegarlo en el editor
de Supabase, que no admite los import de ./formulas.js, ./cadena.js y ./motor.js.

  python3 herramientas/empaquetar-presupuestar.py
  → subir-a-supabase/presupuestar/index.ts  (todo dentro, mismo código)

El código fuente sigue siendo el de supabase/functions/presupuestar/; esto
solo quita los import/export entre módulos y los pega en orden."""
import os, re
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = os.path.join(RAIZ, 'supabase', 'functions', 'presupuestar')
def modulo(nombre):
    s = open(os.path.join(F, nombre), encoding='utf-8').read()
    s = re.sub(r'^import .*$', '', s, flags=re.M)
    s = re.sub(r'^export \{[^}]*\};?\s*$', '', s, flags=re.M)
    s = re.sub(r'^export ', '', s, flags=re.M)
    return f"\n// ===== {nombre} (empaquetado) =====\n" + s
idx = open(os.path.join(F, 'index.ts'), encoding='utf-8').read()
idx = re.sub(r"^import \{[^}]*\} from '\./[a-z]+\.js';\s*$", '', idx, flags=re.M)
cab = "// EMPAQUETADO por herramientas/empaquetar-presupuestar.py: no editar aquí,\n// editar supabase/functions/presupuestar/ y volver a empaquetar.\n"
out = os.path.join(RAIZ, 'subir-a-supabase', 'presupuestar')
os.makedirs(out, exist_ok=True)
for f in ('motor.js', 'cadena.js', 'formulas.js'):
    p = os.path.join(out, f)
    if os.path.exists(p): os.remove(p)
open(os.path.join(out, 'index.ts'), 'w', encoding='utf-8').write(cab + modulo('formulas.js') + modulo('cadena.js') + modulo('motor.js') + '\n' + idx)
print('subir-a-supabase/presupuestar/index.ts listo')
