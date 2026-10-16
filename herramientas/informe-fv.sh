#!/bin/bash
# Sysefen · Informe de prueba del motor de presupuestos de fotovoltaica.
#
# Calcula una batería de presupuestos con las mismas medidas (10 m de todo,
# teja, monofásico) cambiando inversor y batería, con 10 y con 20 paneles, con
# EXACTAMENTE el mismo código que la Edge Function (hibrido.js + fv.js +
# motor.js + cadena.js), y escribe un informe HTML con cada presupuesto, su
# desglose y los datos usados. Se abre en el navegador y se imprime a PDF.
#
#   ./herramientas/informe-fv.sh            → carpeta de tarifas del Drive, informes/
#   ./herramientas/informe-fv.sh salida.html
#
# El informe lleva costes y márgenes: NO va al repo (la carpeta del Drive está
# fuera; si se pasa otra ruta, que no sea dentro del repo).
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
TMP=/tmp/sysefen-pruebas
TARIFAS="${SYSEFEN_TARIFAS:-$HOME/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app}"
SALIDA="${1:-$TARIFAS/informes/informe-motor-fv-$(date +%Y-%m-%d).html}"
mkdir -p "$(dirname "$SALIDA")"
python3 "$RAIZ/pruebas/preparar.py" "$TMP" >/dev/null
"$JSC" -e "
  globalThis.RUTA_TMP = '$TMP'; globalThis.RUTA_TARIFAS = '$TARIFAS'; globalThis.FECHA = '$(date +%d/%m/%Y)';
  load('$TMP/formulas.js'); load('$TMP/motor.js'); load('$TMP/cadena.js'); load('$TMP/fv.js'); load('$TMP/hibrido.js');
  load('$AQUI/informe-fv.js');
" > "$SALIDA"
echo "Informe: $SALIDA ($(wc -c < "$SALIDA" | tr -d ' ') bytes)"
