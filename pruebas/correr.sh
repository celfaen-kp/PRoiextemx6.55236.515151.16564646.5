#!/bin/bash
# Corre las pruebas del arnés. Sin argumentos, todas.
#   ./pruebas/correr.sh            todas
#   ./pruebas/correr.sh ventana    solo pruebas/ventana.js
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
TMP=/tmp/sysefen-pruebas
# Las tarifas y el histórico de presupuestos están fuera del repo, en el Drive.
TARIFAS="${SYSEFEN_TARIFAS:-$HOME/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app}"

python3 "$AQUI/preparar.py" "$TMP" >/dev/null

fallos=0
for f in "$AQUI"/${1:-*}.js; do
  nombre=$(basename "$f" .js)
  [ "$nombre" = "arnes" ] && continue
  echo "=============== $nombre ==============="
  if ! "$JSC" -e "
    globalThis.RUTA_TMP = '$TMP'; globalThis.RUTA_TARIFAS = '$TARIFAS';
    load('$AQUI/arnes.js'); load('$TMP/modulos.js'); load('$TMP/app.js');
    load('$f');
  "; then fallos=$((fallos+1)); fi
  echo
done
exit $fallos
