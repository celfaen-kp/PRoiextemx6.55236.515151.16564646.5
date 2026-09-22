#!/usr/bin/env python3
"""Extrae el catálogo Vaillant 2025 (PDF -> CSV) para cargar en Supabase/Teamleader."""
import re, csv, subprocess, sys, os, collections

PDF = "/root/.claude/uploads/abb6d09b-ec7d-518e-99f9-c7f222317da3/42f2534a-guia-rapida-tarifa-2026-3161480.pdf"
OUT = "/tmp/claude-0/-home-claude/abb6d09b-ec7d-518e-99f9-c7f222317da3/scratchpad"

txt = subprocess.run(["pdftotext", "-layout", PDF, "-"],
                     capture_output=True, text=True).stdout

# nombre .... referencia(10 dígitos) .... precio [.... nº página]
FILA = re.compile(
    r"^\s{0,6}(?P<nombre>\S.*?)\s{2,}"
    r"(?P<ref>\d{10})\s+"
    r"(?P<precio>\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*"
    r"(?P<pag>\d{1,3})?\s*$"
)

def num(s):
    return float(s.replace(".", "").replace(",", "."))

# Familia deducida del nombre. El orden importa: gana la primera.
FAMILIAS = [
    ("cascada",       r"Ampliaci[óo]n cascadas"),
    ("deposito_inercia", r"\bVPS\b|\bVP RW\b|\bVI \d|inercia"),
    ("bomba_calor",   r"aroTHERM|flexoTHERM|geoTHERM|recoVAIR.*calor"),
    ("hidronico",     r"uniTOWER|hydraulic|aroCOLLECT"),
    ("acumulador",    r"uniSTOR|actoSTOR|alliSTOR|auroSTOR"),
    ("caldera",       r"ecoTEC|atmoTEC|turboTEC|ecoCOMPACT"),
    ("termo",         r"aroSTOR|eloSTOR|VEH"),
    ("regulacion",    r"sensoCOMFORT|sensoHOME|sensoROOM|VRC|VR\s?\d|multiMATIC|calorMATIC|VRT"),
    ("conectividad",  r"sensoNET|VR\s?9[12]|myVAILLANT|Gateway"),
    ("solar",         r"auroTHERM|auroFLOW|colector solar"),
    ("ventilacion",   r"recoVAIR|aeroTHERM"),
    ("accesorio",     r"kit|soporte|válvula|valvula|sonda|bomba|vaso|purgador|filtro|manguito|racor"),
]

def familia_de(nombre):
    for fam, pat in FAMILIAS:
        if re.search(pat, nombre, re.I):
            return fam
    return "otros"

# Potencia kW del nombre: 'aroTHERM plus 8', 'VWL 85/6' -> 8
def potencia_de(nombre):
    m = re.search(r"VWL\s*(\d{2,3})\s*/", nombre, re.I)
    if m:
        v = int(m.group(1))
        return v / 10 if v >= 35 else float(v)
    m = re.search(r"(?:aroTHERM|flexoTHERM|geoTHERM)[\w\s]*?\b(\d{1,2})\b", nombre, re.I)
    if m:
        v = int(m.group(1))
        if 3 <= v <= 30:
            return float(v)
    return None

def litros_de(nombre):
    m = re.search(r"\b(\d{2,4})\s*(?:l|litros)\b", nombre, re.I)
    if m:
        v = int(m.group(1))
        if 50 <= v <= 2000:
            return v
    m = re.search(r"VIH\s+\w+\s+(\d{3})", nombre, re.I)
    return int(m.group(1)) if m else None

filas, vistas = [], set()
for ln in txt.splitlines():
    m = FILA.match(ln.rstrip())
    if not m:
        continue
    nombre = re.sub(r"\s+", " ", m.group("nombre")).strip()
    nombre = re.sub(r"\s*(NOVEDAD|HASTA FIN DE EXISTENCIAS|NUEVO)\s*$", "", nombre, flags=re.I).strip()
    ref = m.group("ref")
    precio = num(m.group("precio"))

    if len(nombre) < 6 or precio <= 0:
        continue
    if ref in vistas:              # misma ref repetida en varias páginas
        continue
    vistas.add(ref)

    fam = familia_de(nombre)
    atr = {}
    kw = potencia_de(nombre)
    if kw and fam in ("bomba_calor", "hidronico"):
        atr["potencia_kw"] = kw
    litros = litros_de(nombre)
    if litros and fam in ("acumulador", "hidronico"):
        atr["litros"] = litros
    if re.search(r"400\s?V|trif", nombre, re.I):
        atr["trifasica"] = True
    if re.search(r"cableado", nombre, re.I):
        atr["control"] = "cableado"
    elif re.search(r"inal[áa]mbrico", nombre, re.I):
        atr["control"] = "inalambrico"

    filas.append({
        "referencia": ref,
        "nombre": nombre,
        "familia": fam,
        "unidad": "ud",
        "precio_tarifa": f"{precio:.2f}",
        "iva": "21",
        "atributos": "{" + ", ".join(f'"{k}": {v if not isinstance(v,str) else chr(34)+v+chr(34)}'
                                     for k, v in atr.items()).replace("True","true") + "}",
    })

with open(f"{OUT}/catalogo_saunier_2026.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
    w.writeheader(); w.writerows(filas)

print(f"{len(filas)} productos extraídos\n")
c = collections.Counter(r["familia"] for r in filas)
for fam, n in c.most_common():
    print(f"  {fam:15} {n:5}")

print("\n--- bombas de calor con potencia detectada ---")
bc = [r for r in filas if r["familia"] == "bomba_calor" and "potencia_kw" in r["atributos"]]
for r in sorted(bc, key=lambda x: float(x["precio_tarifa"]))[:14]:
    print(f"  {r['referencia']}  {r['nombre'][:62]:62} {float(r['precio_tarifa']):9,.0f}  {r['atributos']}")
print(f"\n  ({len(bc)} bombas de calor con kW de {sum(1 for r in filas if r['familia']=='bomba_calor')} totales)")
