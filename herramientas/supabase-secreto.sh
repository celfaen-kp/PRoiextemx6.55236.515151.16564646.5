#!/bin/bash
# Pone (o cambia) un secreto de las Edge Functions desde este Mac (Enzo, 6-11-2026).
#   herramientas/supabase-secreto.sh ANTHROPIC_API_KEY ~/.config/sysefen/anthropic.key
# El valor se lee de un archivo (nunca se escribe en la terminal ni en el chat).
set -euo pipefail
REF="pcftuxqgzeacladtmaqx"
TOKEN_FILE="$HOME/.config/sysefen/supabase.token"
NOMBRE="${1:-}"; ARCHIVO="${2:-}"
[ -n "$NOMBRE" ] && [ -f "$ARCHIVO" ] || { echo "Uso: $0 NOMBRE_DEL_SECRETO archivo-con-el-valor"; exit 2; }
TOKEN=$(tr -d '\n' < "$TOKEN_FILE")
CUERPO=$(python3 -c 'import json,sys; print(json.dumps([{"name": sys.argv[1], "value": open(sys.argv[2]).read().strip()}]))' "$NOMBRE" "$ARCHIVO")
HTTP=$(curl -sS -o /tmp/sysefen-secreto.out -w '%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/secrets" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$CUERPO")
if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ]; then echo "OK ($HTTP) secreto $NOMBRE puesto"; else echo "ERROR ($HTTP)"; cat /tmp/sysefen-secreto.out; exit 1; fi
