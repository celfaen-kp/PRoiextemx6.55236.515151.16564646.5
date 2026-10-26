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
  # jsc sale con 0 aunque una excepción corte el archivo a medias (26-10-2026):
  # se mira también la salida, y una «Exception:» cuenta como fallo.
  salida=$("$JSC" -e "
    globalThis.RUTA_TMP = '$TMP'; globalThis.RUTA_TARIFAS = '$TARIFAS';
    load('$AQUI/arnes.js'); load('$TMP/modulos.js'); load('$TMP/app.js');
    load('$f');
  " 2>&1); codigo=$?
  printf '%s\n' "$salida"
  if [ $codigo -ne 0 ] || printf '%s' "$salida" | grep -q '^Exception:'; then fallos=$((fallos+1)); echo ">>> FALLO en $nombre (excepción o salida con error)"; fi
  echo
done
exit $fallos
