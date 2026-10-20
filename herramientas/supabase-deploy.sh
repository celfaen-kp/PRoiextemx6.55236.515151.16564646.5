#!/bin/bash
# Despliega una Edge Function en Supabase desde este Mac (Enzo, 20-10-2026).
#   herramientas/supabase-deploy.sh teamleader-presupuesto
#   herramientas/supabase-deploy.sh presupuestar      (se empaqueta antes en un solo archivo)
# Respeta el ajuste actual de «verify JWT» de la función (si no existe, lo deja
# en falso: las funciones comprueban la sesión ellas mismas y el cron entra con x-clave).
set -euo pipefail
REF="pcftuxqgzeacladtmaqx"
TOKEN_FILE="$HOME/.config/sysefen/supabase.token"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
[ -n "$SLUG" ] || { echo "Uso: $0 nombre-de-la-funcion"; exit 2; }
[ -f "$TOKEN_FILE" ] || { echo "Falta $TOKEN_FILE"; exit 2; }
TOKEN=$(tr -d '\n' < "$TOKEN_FILE")
if [ "$SLUG" = "presupuestar" ]; then
  python3 "$RAIZ/herramientas/empaquetar-presupuestar.py" >/dev/null
  ARCHIVO="$RAIZ/subir-a-supabase/presupuestar/index.ts"
else
  ARCHIVO="$RAIZ/supabase/functions/$SLUG/index.ts"
fi
[ -f "$ARCHIVO" ] || { echo "No existe $ARCHIVO"; exit 2; }
# El ajuste actual de la función (404 si es nueva).
ACTUAL=$(curl -sS -o /tmp/sysefen-fn.json -w '%{http_code}' "https://api.supabase.com/v1/projects/$REF/functions/$SLUG" -H "Authorization: Bearer $TOKEN")
VERIFY="false"
if [ "$ACTUAL" = "200" ]; then VERIFY=$(python3 -c 'import json; print(str(json.load(open("/tmp/sysefen-fn.json")).get("verify_jwt", False)).lower())'); fi
META=$(python3 -c 'import json,sys; print(json.dumps({"entrypoint_path": "index.ts", "name": sys.argv[1], "verify_jwt": sys.argv[2] == "true"}))' "$SLUG" "$VERIFY")
HTTP=$(curl -sS -o /tmp/sysefen-deploy.out -w '%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=$SLUG" \
  -H "Authorization: Bearer $TOKEN" -F "metadata=$META;type=application/json" -F "file=@$ARCHIVO;filename=index.ts;type=application/typescript")
if [ "$HTTP" -ge 200 ] && [ "$HTTP" -lt 300 ]; then echo "OK ($HTTP) $SLUG desplegada (verify_jwt=$VERIFY)"; head -c 300 /tmp/sysefen-deploy.out; echo; else echo "ERROR ($HTTP) $SLUG"; cat /tmp/sysefen-deploy.out; echo; exit 1; fi
