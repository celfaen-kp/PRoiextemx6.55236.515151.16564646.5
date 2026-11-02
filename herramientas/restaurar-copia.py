#!/usr/bin/env python3
"""
Sysefen · Restaurar una copia de seguridad (los DATOS de las tablas)

DE DÓNDE SALE LA COPIA:
  La Edge Function `copia-seguridad` deja cada semana en Drive, en
  SYSEFEN DATA / 09-Copias de seguridad / <fecha> / datos /, un archivo
  NN-tabla.json por tabla (NN = orden de restauración) y un .csv para mirar.
  Este script lee esa carpeta `datos` (sincronizada en el Mac o descargada) y
  genera UN archivo .sql que vuelve a meter todas las filas.

CÓMO SE USA:
  python3 herramientas/restaurar-copia.py "<carpeta datos>"                 → genera restaurar-<copia>-NN.sql aquí
  python3 herramientas/restaurar-copia.py "<carpeta datos>" --solo presupuestos,presupuesto_lineas
  python3 herramientas/restaurar-copia.py "<carpeta datos>" --pisar        → las filas que ya existan se sobrescriben
  python3 herramientas/restaurar-copia.py "<carpeta datos>" --omitir obra_costes.coste_total
      (columnas que no hay que insertar; las calculadas las apunta ya la propia copia desde el 2-11-2026)
  for f in restaurar-<copia>-*.sql; do herramientas/supabase-sql.sh "$f" || break; done
  (en partes de ~700 KB porque la API de Supabase no admite peticiones mayores)

QUÉ HACE EL SQL:
  - Desactiva las comprobaciones de claves ajenas y los triggers durante la
    carga (session_replication_role = replica; funciona como `postgres`, que es
    como entra supabase-sql.sh), porque hay tablas que se apuntan en círculo
    (presupuestos ↔ visitas ↔ citas).
  - Inserta tabla a tabla, en el orden de la copia, con
    jsonb_populate_recordset, que convierte cada campo a su tipo real
    (fechas, arrays, jsonb…). Sin --pisar, las filas que ya existan (misma
    clave primaria) se dejan como están: sirve para recuperar lo borrado sin
    tocar lo demás.

QUÉ NO HACE:
  - No crea tablas ni políticas: eso vive en sql/ (Git). En un proyecto nuevo,
    primero los sql/etapa*.sql en orden, luego esto.
  - No restaura los ARCHIVOS (PDF, fotos): están tal cual en la carpeta
    `archivos` de la copia, en espejo bucket/ruta, para subirlos a Storage con
    el panel de Supabase o con un script aparte si hiciera falta.
  - Usuarios de Supabase Auth (auth.users): no van en la copia; los empleados
    se vuelven a enlazar con su PIN desde la app si hace falta.
"""

import sys, os, json, re

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__); sys.exit(2)
    carpeta = args[0]
    pisar = '--pisar' in sys.argv
    solo = None
    for a in sys.argv[1:]:
        if a.startswith('--solo'):
            v = a.split('=', 1)[1] if '=' in a else sys.argv[sys.argv.index(a) + 1]
            solo = set(x.strip() for x in v.split(',') if x.strip())
    omitir = set()
    for a in sys.argv[1:]:
        if a.startswith('--omitir'):
            v = a.split('=', 1)[1] if '=' in a else sys.argv[sys.argv.index(a) + 1]
            omitir |= set(x.strip() for x in v.split(',') if x.strip())
    if not os.path.isdir(carpeta):
        print('No existe la carpeta', carpeta); sys.exit(2)

    archivos = sorted(f for f in os.listdir(carpeta) if re.match(r'^\d{2}-[a-z_0-9]+\.json$', f))
    if not archivos:
        print('No hay archivos NN-tabla.json en', carpeta); sys.exit(2)

    nombre_copia = os.path.basename(os.path.dirname(os.path.abspath(carpeta)))
    # La API de gestión de Supabase no admite peticiones de más de ~1 MB: el SQL
    # se reparte en partes autosuficientes (cada una desactiva y reactiva las
    # claves ajenas) que se ejecutan en orden.
    LIMITE = 700_000
    partes, actual, tam = [], [], 0
    cabecera = ['-- Restauración generada por herramientas/restaurar-copia.py', '-- Copia: ' + nombre_copia,
                "set session_replication_role = replica;  -- sin claves ajenas ni triggers mientras se carga"]
    def cerrar():
        nonlocal actual, tam
        if actual:
            partes.append(cabecera + actual + ['set session_replication_role = origin;'])
            actual, tam = [], 0
    def anadir(sentencia):
        nonlocal tam
        if tam + len(sentencia) > LIMITE: cerrar()
        actual.append(sentencia); tam += len(sentencia)
    salida = type('S', (), {'append': staticmethod(anadir)})()
    total = 0
    for f in archivos:
        with open(os.path.join(carpeta, f), encoding='utf-8') as h:
            d = json.load(h)
        tabla, filas, pk = d['tabla'], d['datos'], d.get('pk') or 'id'
        # Columnas calculadas (generated always) no se insertan: las apunta la copia; o se pasan con --omitir.
        saltar = set(d.get('generadas') or []) | {o.split('.', 1)[1] for o in omitir if o.startswith(tabla + '.')}
        if solo and tabla not in solo:
            continue
        if not re.match(r'^[a-z_0-9]+$', tabla):
            print('Nombre de tabla raro, se salta:', tabla); continue
        if not filas:
            salida.append(f'-- {tabla}: sin filas'); continue
        salida.append(f'\n-- {tabla}: {len(filas)} filas')
        # Columnas presentes en la copia (por si la tabla ha ganado columnas después: las nuevas quedan en su valor por defecto).
        cols = []
        for fila in filas:
            for k in fila:
                if k not in cols and k not in saltar: cols.append(k)
        cols_sql = ', '.join('"%s"' % c for c in cols)
        pk_cols = ', '.join('"%s"' % c.strip().strip('"') for c in pk.split(','))
        if pisar:
            upd = ', '.join('"%s" = excluded."%s"' % (c, c) for c in cols if c.strip('"') not in [x.strip().strip('"') for x in pk.split(',')])
            conflicto = f'on conflict ({pk_cols}) do update set {upd}' if upd else f'on conflict ({pk_cols}) do nothing'
        else:
            conflicto = f'on conflict ({pk_cols}) do nothing'
        # En trozos de 300 filas para que cada sentencia sea manejable.
        for i in range(0, len(filas), 300):
            trozo = json.dumps(filas[i:i + 300], ensure_ascii=False)
            etiqueta = 'j' + str(abs(hash(trozo)) % 100000)
            while ('$' + etiqueta + '$') in trozo: etiqueta += 'x'
            salida.append(
                f'insert into public."{tabla}" ({cols_sql})\n'
                f'select {cols_sql} from jsonb_populate_recordset(null::public."{tabla}", ${etiqueta}${trozo}${etiqueta}$::jsonb)\n'
                f'{conflicto};')
        total += len(filas)
    salida.append(f"select '{total} filas procesadas' as resultado;")
    cerrar()

    # Fuera de la carpeta de la copia (que está en Drive y no hay que ensuciar): en el directorio actual.
    base = os.path.abspath('restaurar-' + re.sub(r'[^0-9A-Za-z_.-]+', '_', nombre_copia))
    rutas = []
    for i, parte in enumerate(partes, 1):
        destino = f'{base}-{i:02d}.sql'
        with open(destino, 'w', encoding='utf-8') as h:
            h.write('\n'.join(parte) + '\n')
        rutas.append(destino)
    print(f'Listo: {len(rutas)} parte(s) ({total} filas, {len(archivos)} tablas{"" if not solo else ", filtradas"}, {"sobrescribiendo" if pisar else "sin pisar lo existente"}):')
    for r in rutas: print('   ' + r)
    print('Ejecutar en orden con:')
    print('   for f in "%s"-*.sql; do herramientas/supabase-sql.sh "$f" || break; done' % base)

if __name__ == '__main__':
    main()
