#!/bin/bash
# Ejecuta un archivo .sql en el proyecto de Supabase desde este Mac, sin pegar
# nada a mano (Enzo, 20-10-2026: para publicar cambios mientras viaja).
#   herramientas/supabase-sql.sh sql/etapa83_tablero_no_responden.sql
# Usa la API de gestión de Supabase con el token personal guardado en
# ~/.config/sysefen/supabase.token (fuera del repo, solo lectura del usuario).
set -euo pipefail
REF="pcftuxqgzeacladtmaqx"
TOKEN_FILE="$HOME/.config/sysefen/supabase.token"
[ -f "$TOKEN_FILE" ] || { echo "Falta $TOKEN_FILE (token personal de Supabase: Dashboard → Account → Access Tokens)"; exit 2; }
[ -f "${1:-}" ] || { echo "Uso: $0 archivo.sql"; exit 2; }
TOKEN=$(tr -d '\n' < "$TOKEN_FILE")
# La API quiere el SQL dentro de un JSON: se escapa con python.
BODY=$(python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$1")
HTTP=$(curl -sS -o /tmp/sysefen-sql.out -w '%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary "$BODY")
if [ "$HTTP" -ge 200 ] && [ "$HTTP" -lt 300 ]; then echo "OK ($HTTP) $1"; head -c 600 /tmp/sysefen-sql.out; echo; else echo "ERROR ($HTTP) $1"; cat /tmp/sysefen-sql.out; echo; exit 1; fi
