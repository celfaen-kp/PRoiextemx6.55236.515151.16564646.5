#!/bin/bash
# Comprueba la sintaxis de todas las Edge Functions. No compila ni mira tipos:
# solo dice si el archivo se sostiene, que es lo que no avisa nadie cuando se
# despliegan pegándolas en el panel de Supabase.
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
TMP=$(mktemp -d)
fallos=0

mira() {   # mira <etiqueta> <archivo.js>
  local salida
  salida=$("$JSC" -e "
    var src = readFile('$2');
    try { new Function(src); print('BIEN'); } catch (e) { print('MAL ' + e.message); }" 2>&1)
  if [ "$salida" = "BIEN" ]; then
    printf "  OK     %s\n" "$1"
  else
    printf "  FALLA  %-22s %s\n" "$1" "${salida#MAL }"; fallos=$((fallos+1))
  fi
}

for f in "$RAIZ"/supabase/functions/*/index.ts; do
  nombre=$(basename "$(dirname "$f")")
  python3 "$AQUI/ts-a-js.py" "$f" "$TMP/$nombre.js" 2>/dev/null
  mira "$nombre" "$TMP/$nombre.js"
done
# Y las piezas sueltas del motor, que son JavaScript normal.
for f in "$RAIZ"/supabase/functions/presupuestar/*.js; do
  nombre=$(basename "$f")
  sed -e 's/^export default /var _d = /' -e 's/^export //' -e '/^import /d' "$f" > "$TMP/$nombre"
  mira "$nombre" "$TMP/$nombre"
done

rm -rf "$TMP"
[ $fallos -eq 0 ] && echo ">>> todas bien" || echo ">>> $fallos con problemas"
exit $fallos
