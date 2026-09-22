#!/usr/bin/env python3
"""Quita las anotaciones de TypeScript para poder comprobar la sintaxis con jsc.

Las Edge Functions se escriben en TypeScript y se despliegan pegándolas en el
panel de Supabase, así que no hay compilador que avise de un paréntesis mal
puesto: el fallo aparece cuando alguien la usa. Esto no compila ni comprueba
tipos; solo deja el archivo en JavaScript plano para que jsc diga si la
sintaxis se sostiene.

USO:  python3 pruebas/ts-a-js.py entrada.ts salida.js
"""
import re, sys

s = open(sys.argv[1]).read()

# Las expresiones regulares del código confunden a los limpiadores de abajo:
# se apartan y se devuelven al final.
guardadas = []
def guarda(m):
    guardadas.append(m.group(0))
    return '__RE%d__' % (len(guardadas) - 1)
s = re.sub(r"/(?:[^/\\\n\[]|\\.|\[(?:[^\]\\]|\\.)*\])+/[gimsuy]*(?=[.,;)\s])", guarda, s)

s = re.sub(r"^import .*?;\n", "", s, flags=re.S | re.M)
s = s.replace("Deno.serve", "globalThis.__serve")
s = re.sub(r"new (Map|Set|Array)<[^()]*?>\(", r"new \1(", s)
s = s.replace("(f: { name: string })", "(f)")
# type Cosa = { ... };
s = re.sub(r"^[ \t]*type\s+\w+\s*=\s*\{.*?\n[ \t]*\};\n", "", s, flags=re.S | re.M)
s = re.sub(r"^[ \t]*type\s+\w+\s*=[^;\n]*;\n", "", s, flags=re.M)
# as Tipo / as { ... } / as any[]
s = re.sub(r"\s+as\s+\{[^}]*\}(\[\])?", "", s)
s = re.sub(r"\s+as\s+[A-Za-z_][\w.]*(<[^<>]*>)?(\[\])?(\s*\|\s*null)?", "", s)
s = re.sub(r"!(?=[.,;)\]\s])", "", s)
# const x: Tipo = ... / let a, b;
s = re.sub(r"\b(const|let|var) (\w+)\s*:\s*\{[^{}]*\}(\[\])?\s*=", r"\1 \2 =", s)
s = re.sub(r"\b(const|let) (\w+): Record<[^>]*> =", r"\1 \2 =", s)
# Tipos con genéricos o tuplas: `const X: [string, RegExp][] = [...]`
s = re.sub(r"\b(const|let|var) (\w+)\s*:\s*\[[^\]]*\](\[\])?\s*=(?!=)", r"\1 \2 =", s)
s = re.sub(r"\b(const|let|var) (\w+)\s*:\s*[A-Za-z_][\w.]*<[^<>]*>(\[\])?\s*=(?!=)", r"\1 \2 =", s)
# Admite uniones: `let x: string | null = ...`
s = re.sub(r"\b(const|let|var) (\w+)\s*:\s*[A-Za-z_][\w.]*(\[\])?(\s*\|\s*(?:[A-Za-z_][\w.]*|null|undefined)(\[\])?)*\s*=(?!=)",
           r"\1 \2 =", s)
s = re.sub(r"\blet ([\w]+): [\w<>,\s|]+;", r"let \1;", s)
s = re.sub(r"\blet ([\w]+): \{[^}]*\};", r"let \1;", s)
s = re.sub(r"\b(let|var)\s+((?:\w+\s*:\s*[\w.\[\]]+\s*,\s*)+\w+\s*:\s*[\w.\[\]]+)\s*;",
           lambda m: m.group(1) + " " + ", ".join(t.split(":")[0].strip() for t in m.group(2).split(",")) + ";", s)
# ({ a, b }: { a: string }) -> ({ a, b })
s = re.sub(r"(\{[^{}:]*\})\s*:\s*\{[^{}]*\}", r"\1", s)
# (a: T, b?: T) => ...
s = re.sub(r"\((\s*\w+\??\s*:\s*[\w.\[\]]+(?:\s*,\s*\w+\??\s*:\s*[\w.\[\]]+)*\s*)\)\s*=>",
           lambda m: "(" + ", ".join(t.split(":")[0].strip().rstrip("?") for t in m.group(1).split(",")) + ") =>", s)
# Firmas de función: `function f(a: T)` y `const f = (a: T)`. Nunca detrás de
# `=>`, porque ahí lo que suele venir es un objeto literal —`=> ({ a: 1 })`— y
# quitarle los dos puntos lo rompe.
s = re.sub(r"(function \w+|\bconst \w+ = )\(([^(){}]*)\)",
           lambda m: m.group(1) + "(" + re.sub(r"(\w+)\s*:\s*[\w.\[\]|\s]+?(?=,|$)", r"\1", m.group(2)) + ")", s)

for i, g in enumerate(guardadas):
    s = s.replace('__RE%d__' % i, g)
open(sys.argv[2], 'w').write(s)
