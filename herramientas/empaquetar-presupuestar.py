#!/usr/bin/env python3
"""
Sysefen · Juntar la función `presupuestar` en un solo archivo (presupuestar.ts)

POR QUÉ EXISTE:
  La función está partida en cuatro (index.ts, motor.js, cadena.js,
  formulas.js) porque así se puede probar cada pieza por separado con el arnés.
  Pero en el panel de Supabase se pega UN archivo, y si solo se pega index.ts
  el despliegue falla con «Module not found … motor.js».

  Esto las junta en uno, en el orden correcto y sin los import/export, y deja
  el resultado listo para copiar y pegar en el panel.

CÓMO SE USA:
  python3 herramientas/empaquetar-presupuestar.py
  python3 herramientas/empaquetar-presupuestar.py ~/Desktop

  Sin argumento lo deja en la carpeta APPS del Drive, al lado de los SQL.

NO SE EDITA EL RESULTADO: se editan las piezas y se vuelve a ejecutar esto.
"""

import os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNCION = os.path.join(RAIZ, 'supabase', 'functions', 'presupuestar')
PIEZAS = ['formulas.js', 'cadena.js', 'motor.js']      # en orden de dependencia
DESTINO = os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/APPS')

CABECERA = """// =============================================================================
// Sysefen · Edge Function `presupuestar` · TODO EN UNO
//
// Generado por herramientas/empaquetar-presupuestar.py. NO SE EDITA A MANO:
// se cambian las piezas de supabase/functions/presupuestar/ y se vuelve a
// generar. Aquí van juntas porque en el panel de Supabase se pega un archivo
// solo, y con los import sueltos el despliegue falla con "Module not found".
//
// Piezas, en este orden: formulas.js · cadena.js · motor.js · index.ts
// =============================================================================

"""


def sin_modulos(texto):
    """Quita los import de piezas hermanas y la palabra export."""
    texto = re.sub(r"^import\s+[^;]*?from\s+'\./[^']+';\s*$", '', texto, flags=re.M | re.S)
    texto = re.sub(r'^export\s+(?=(async\s+)?function|const|let|var|class)', '', texto, flags=re.M)
    texto = re.sub(r'^export\s*\{[^}]*\};\s*$', '', texto, flags=re.M)
    return texto.strip() + '\n'


def main():
    destino = sys.argv[1] if len(sys.argv) > 1 else DESTINO
    if not os.path.isdir(destino):
        sys.exit(f'No existe la carpeta {destino}')

    partes = [CABECERA]
    for nombre in PIEZAS:
        ruta = os.path.join(FUNCION, nombre)
        partes.append(f'/* ----- {nombre} ' + '-' * (66 - len(nombre)) + ' */\n')
        partes.append(sin_modulos(open(ruta, encoding='utf-8').read()))
        partes.append('\n')
    partes.append('/* ----- index.ts ' + '-' * 58 + ' */\n')
    partes.append(sin_modulos(open(os.path.join(FUNCION, 'index.ts'), encoding='utf-8').read()))

    salida = ''.join(partes)
    # Los import de fuera (supabase-js) se suben arriba del todo: son válidos en
    # cualquier sitio, pero a media página no hay quien los vea.
    fuera = re.findall(r"^import\s+[^;]+?from\s+'https?://[^']+';$", salida, flags=re.M)
    if fuera:
        salida = re.sub(r"^import\s+[^;]+?from\s+'https?://[^']+';\n", '', salida, flags=re.M)
        salida = salida.replace(CABECERA, CABECERA + '\n'.join(dict.fromkeys(fuera)) + '\n\n', 1)
    # Lo único que puede quedar de fuera es el cliente de Supabase, que sí es
    # una dependencia de verdad y tiene que seguir importándose.
    if "from 'https://esm.sh/@supabase/supabase-js" not in salida:
        sys.exit('Se ha perdido el import de supabase-js: revisa el empaquetado.')
    if re.search(r"^import .*'\./", salida, flags=re.M):
        sys.exit('Ha quedado algún import de una pieza hermana.')

    ruta = os.path.join(destino, 'presupuestar.ts')
    open(ruta, 'w', encoding='utf-8').write(salida)
    print(f'Hecho: {ruta}')
    print(f'{len(salida.splitlines())} líneas. Pégalo tal cual en el panel, como index.ts.')


if __name__ == '__main__':
    main()
