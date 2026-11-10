#!/usr/bin/env python3
"""Junta sql/etapa105_vaillant_2026.sql con los productos de vaillant-2026.csv (Drive)
en subir-a-supabase/etapa105_vaillant_2026_completo.sql, que es el que se ejecuta:

  python3 herramientas/sql-tarifa-vaillant-2026.py
  herramientas/supabase-sql.sh subir-a-supabase/etapa105_vaillant_2026_completo.sql

El repo es público y las listas de precios no van en él: por eso las filas se
ponen aquí, fuera de Git (subir-a-supabase/ está en .gitignore)."""
import csv, json, os, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.environ.get('SYSEFEN_TARIFAS') or os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app')
MARCA = '-- <<PRODUCTOS: los pone herramientas/sql-tarifa-vaillant-2026.py>>'
DTO = 43   # descuento de distribuidor de Vaillant sobre PVP (sql/etapa84)


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    plantilla = open(os.path.join(RAIZ, 'sql', 'etapa105_vaillant_2026.sql'), encoding='utf-8').read()
    if plantilla.count(MARCA) != 1:
        sys.exit('No encuentro la marca de los productos en sql/etapa105_vaillant_2026.sql')
    with open(os.path.join(CARPETA, 'vaillant-2026.csv'), encoding='utf-8', newline='') as f:
        filas = list(csv.DictReader(f))
    if len(filas) < 850:
        sys.exit('vaillant-2026.csv trae solo %d productos' % len(filas))
    trozos = []
    for i in range(0, len(filas), 300):
        valores = []
        for r in filas[i:i + 300]:
            precio = round(float(r['precio_tarifa']), 2)
            if precio <= 0:
                sys.exit('Precio a cero en ' + r['referencia'])
            json.loads(r['atributos'] or '{}')
            valores.append('(%s, %s, %s, %s, %.2f, %s)' % (lit(r['referencia']), lit(r['nombre'][:200]), lit(r['familia']), lit(r['unidad'] or 'ud'), precio, lit(r['atributos'] or '{}')))
        trozos.append(
            'insert into public.productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, descuento_proveedor, iva, atributos, activo)\n'
            'select t.id, v.referencia, v.nombre, v.familia, v.unidad, v.precio, %d, 21, v.atributos::jsonb, true\n'
            '  from public.tarifas t, (values\n  %s\n  ) as v(referencia, nombre, familia, unidad, precio, atributos)\n'
            " where t.nombre = 'Vaillant 2026'\n"
            'on conflict (tarifa_id, referencia) do nothing;\n' % (DTO, ',\n  '.join(valores)))
    salida = os.path.join(RAIZ, 'subir-a-supabase', 'etapa105_vaillant_2026_completo.sql')
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    open(salida, 'w', encoding='utf-8').write(plantilla.replace(MARCA, '-- 1 · los %d productos del catálogo 2026\n%s' % (len(filas), '\n'.join(trozos))))
    print('%d productos → %s' % (len(filas), salida))


if __name__ == '__main__':
    main()
