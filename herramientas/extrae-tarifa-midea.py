#!/usr/bin/env python3
"""Extrae la tarifa Midea 2026 (Frigicoll).

Los precios NO están en lista sino en matriz: una fila 'Código' con los
códigos de producto y, más abajo, una fila 'P.V.R.' con los precios, cada
uno bajo su columna. Se emparejan por posición de carácter.
"""
import re, csv, subprocess, collections

PDF = "/root/.claude/uploads/abb6d09b-ec7d-518e-99f9-c7f222317da3/8bb38158-Tarifa-Midea-2026-ES.pdf"
OUT = "/tmp/claude-0/-home-claude/abb6d09b-ec7d-518e-99f9-c7f222317da3/scratchpad"

txt = subprocess.run(["pdftotext", "-layout", PDF, "-"], capture_output=True, text=True).stdout
lineas = txt.splitlines()

COD    = re.compile(r"\b(\d{8})\b")
PRECIO = re.compile(r"([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€")
MODELO = re.compile(r"\b(M[HS]C-[A-Z0-9/\-]+|MO[A-Z0-9\-]+|MU[A-Z0-9\-]+)\b")

def centros(rx, s, grupo=1):
    """[(centro_columna, valor)] de cada coincidencia."""
    return [((m.start(grupo) + m.end(grupo)) // 2, m.group(grupo)) for m in rx.finditer(s)]

def num(s):
    return float(s.replace(".", "").replace(",", "."))

def etiqueta(i, hasta=26):
    """Nombre de la fila 'Unidad exterior' / 'Unidad interior' sobre los códigos."""
    for j in range(i - 1, max(0, i - hasta), -1):
        if re.match(r"^\s*(Unidad (exterior|interior)|Modelo|Descripci[óo]n)\b", lineas[j]):
            return j
    return None

def familia_de(modelo, ctx):
    m, c = modelo.upper(), ctx.lower()
    # solo es bomba de calor si el MODELO lo dice; el contexto no basta,
    # porque en esas páginas hay también accesorios sueltos.
    if re.match(r"MHC-V\d", m): return "bomba_calor"
    if not m or m.startswith("MIDEA "): return "accesorio"
    if "hidr" in c or "depósito" in c or "deposito" in c:            return "acumulador"
    if "conducto" in c:      return "aire_conductos"
    if "cassette" in c:      return "aire_cassette"
    if "mural" in c or "split" in c: return "aire_split"
    return "otros"

def potencia_de(modelo):
    m = re.search(r"-V(\d{1,2})W", modelo, re.I)          # MHC-V8W -> 8 kW
    if m: return float(m.group(1))
    m = re.search(r"-(\d{2,3})\b", modelo)                 # MSC-26 -> 2,6 kW
    if m:
        v = int(m.group(1))
        if 15 <= v <= 160: return v / 10
    return None

filas, vistos = [], set()

for i, ln in enumerate(lineas):
    if not re.match(r"^\s*C[óo]digo\b", ln):
        continue
    codigos = centros(COD, ln)
    if not codigos:
        continue

    # buscar la fila P.V.R. más cercana por debajo (mismo bloque)
    precios, ctx = [], ""
    for j in range(i + 1, min(len(lineas), i + 45)):
        if re.match(r"^\s*C[óo]digo\b", lineas[j]):
            break
        if "P.V.R" in lineas[j]:
            precios = centros(PRECIO, lineas[j])
            ctx = "\n".join(lineas[max(0, i - 40):j])
            break
    if not precios:
        continue

    # nombres de modelo de la fila de cabecera (+ su continuación)
    jm = etiqueta(i)
    modelos = []
    if jm is not None:
        modelos = centros(MODELO, lineas[jm])
        if jm + 1 < i:
            for c, v in centros(MODELO, lineas[jm + 1]):
                modelos.append((c, v))
            sufijos = [(c, v) for c, v in
                       ((( m.start()+m.end())//2, m.group(0))
                        for m in re.finditer(r"\b[A-Z]\d[A-Z]\d{2}\b", lineas[jm + 1]))]
            for c, s in sufijos:
                cerca = min(modelos, key=lambda x: abs(x[0] - c)) if modelos else None
                if cerca and abs(cerca[0] - c) < 14 and not cerca[1].endswith(s):
                    modelos[modelos.index(cerca)] = (cerca[0], cerca[1] + s)

    for cc, cod in codigos:
        if not precios:
            continue
        cp, pv = min(precios, key=lambda p: abs(p[0] - cc))
        if abs(cp - cc) > 26:            # columna demasiado lejos: no fiable
            continue
        mod = ""
        if modelos:
            cm, mm = min(modelos, key=lambda m: abs(m[0] - cc))
            if abs(cm - cc) <= 26:
                mod = mm
        if cod in vistos:
            continue
        vistos.add(cod)
        fam = familia_de(mod or "", ctx)
        kw  = potencia_de(mod or "")
        atr = {}
        if kw: atr["potencia_kw"] = kw
        filas.append({
            "referencia": cod,
            "nombre": (mod or "Midea " + cod).strip(),
            "familia": fam,
            "unidad": "ud",
            "precio_tarifa": f"{num(pv):.2f}",
            "iva": "21",
            "atributos": "{" + ", ".join(f'"{k}": {v}' for k, v in atr.items()) + "}",
        })

with open(f"{OUT}/catalogo_midea_2026.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
    w.writeheader(); w.writerows(filas)

print(f"{len(filas)} productos extraídos\n")
for fam, n in collections.Counter(r["familia"] for r in filas).most_common():
    print(f"  {fam:16} {n:5}")

print("\n--- bombas de calor (aerotermia) ---")
bc = [r for r in filas if r["familia"] == "bomba_calor"]
for r in sorted(bc, key=lambda x: float(x["precio_tarifa"])):
    print(f"  {r['referencia']}  {r['nombre'][:44]:44} {float(r['precio_tarifa']):9,.0f}  {r['atributos']}")

ps = sorted(float(r["precio_tarifa"]) for r in filas)
print(f"\nprecios: min {ps[0]:,.0f}  mediana {ps[len(ps)//2]:,.0f}  max {ps[-1]:,.0f}")
