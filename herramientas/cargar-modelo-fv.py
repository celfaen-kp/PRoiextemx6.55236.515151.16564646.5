#!/usr/bin/env python3
"""
Sysefen · El modelo del presupuestador FV v2 (Ramón) a Supabase (sql/etapa74)

QUÉ HACE:
  Lee modelo_fv.json de la carpeta de tarifas del Drive y escribe
    subir-a-supabase/etapa74b_modelo_fv_datos.sql
  con un INSERT en public.motor_modelos: la versión del JSON (campo "version" +
  "fecha"), vigente desde su fecha, y las versiones anteriores de 'solar'
  cerradas ese mismo día. Se pega en el SQL Editor DESPUÉS de sql/etapa74.

  NO VA AL REPO: lleva costes, márgenes y proveedores (el repo es público).

CUANDO RAMÓN MANDE UN JSON NUEVO:
  1. Copiarlo a la carpeta de tarifas como modelo_fv.json (y sus casos como
     casos_prueba_fv.json).
  2. ./pruebas/correr.sh motor-fv   → tienen que pasar todos los casos.
  3. python3 herramientas/cargar-modelo-fv.py   y pegar el SQL.
  Si el JSON trae la misma "version" + "fecha" que uno ya cargado, el SQL lo
  sustituye (on conflict) en vez de añadir otra fila.

USO:
  python3 herramientas/cargar-modelo-fv.py
  SYSEFEN_TARIFAS=/otra/carpeta python3 herramientas/cargar-modelo-fv.py
"""
import json, os, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.environ.get('SYSEFEN_TARIFAS') or os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app')
RUTA = os.path.join(CARPETA, 'modelo_fv.json')
if not os.path.exists(RUTA):
    sys.exit('No está ' + RUTA)

with open(RUTA, encoding='utf-8-sig') as f:
    modelo = json.load(f)
for clave in ('parametros', 'tramos_factura', 'inversores', 'precios', 'cuadros_ac'):
    if clave not in modelo:
        sys.exit('El modelo no trae «' + clave + '»: no es un modelo_fv.json completo.')

version = str(modelo.get('version', 'v?')) + ' ' + str(modelo.get('fecha', ''))
version = version.strip()
fecha = str(modelo.get('fecha') or '')
if not fecha:
    sys.exit('El modelo no trae "fecha" (AAAA-MM-DD).')
notas = (modelo.get('nota') or '').strip()
# El JSON entero, tal cual, como literal dollar-quoted (no hay que escapar nada).
cuerpo = json.dumps(modelo, ensure_ascii=False, indent=1)
if '$json$' in cuerpo:
    sys.exit('El JSON contiene "$json$": cambia el delimitador.')
q = lambda s: "'" + str(s).replace("'", "''") + "'"

sql = f"""-- =============================================================================
-- Sysefen · Etapa 74b · Los datos del presupuestador FV v2: modelo {version}
--
-- GENERADO por herramientas/cargar-modelo-fv.py desde modelo_fv.json. No se
-- edita a mano: se cambia el JSON y se vuelve a generar. NO VA AL REPO.
-- Pegar DESPUÉS de sql/etapa74_modelo_fv.sql. Idempotente: la misma versión
-- se sustituye; una versión nueva cierra las anteriores de 'solar'.
--
--   {len(modelo['inversores'])} inversores · {len(modelo['precios'])} precios · {len(modelo['cuadros_ac'])} cuadros AC · {len(modelo['parametros'])} parámetros
-- =============================================================================

begin;

insert into public.motor_modelos (categoria, version, vigente_desde, vigente_hasta, datos, notas)
values ('solar', {q(version)}, date {q(fecha)}, null, $json$
{cuerpo}
$json$::jsonb, {q(notas)})
on conflict (categoria, version) do update
  set datos = excluded.datos, notas = excluded.notas, vigente_desde = excluded.vigente_desde, vigente_hasta = null;

-- Las versiones anteriores dejan de estar vigentes desde la fecha de esta.
update public.motor_modelos
   set vigente_hasta = date {q(fecha)}
 where categoria = 'solar' and version <> {q(version)} and vigente_hasta is null;

commit;

-- COMPROBACIÓN
--   select version, vigente_desde, vigente_hasta from public.motor_modelos where categoria = 'solar' order by vigente_desde desc;
"""
salida = os.path.join(RAIZ, 'subir-a-supabase', 'etapa74b_modelo_fv_datos.sql')
os.makedirs(os.path.dirname(salida), exist_ok=True)
with open(salida, 'w', encoding='utf-8') as f:
    f.write(sql)
print('modelo', version, '·', len(modelo['inversores']), 'inversores ·', len(modelo['precios']), 'precios →', os.path.relpath(salida, RAIZ))
