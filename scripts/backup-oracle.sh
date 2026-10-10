#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
env_file=".env.oracle"
if [[ ! -f "$env_file" ]]; then
  echo "Falta .env.oracle." >&2
  exit 1
fi

umask 077
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
api_stopped=0
restart_api() {
  if [[ "$api_stopped" == 1 ]]; then
    docker compose --env-file "$env_file" -f compose.oracle.yml start api >/dev/null || true
  fi
}
trap restart_api EXIT

docker compose --env-file "$env_file" -f compose.oracle.yml stop api
api_stopped=1
docker compose --env-file "$env_file" -f compose.oracle.yml exec -T postgres pg_dump -U beatvault -d beatvault | gzip > "backups/beatvault-db-$stamp.sql.gz"
docker run --rm -v beatvault_app_data:/source:ro -v "$PWD/backups:/backup" alpine:3.21 tar -czf "/backup/beatvault-uploads-$stamp.tar.gz" -C /source uploads
docker compose --env-file "$env_file" -f compose.oracle.yml start api
api_stopped=0
trap - EXIT
echo "Respaldo local creado en backups/beatvault-*-$stamp.*. Guárdalo también fuera del VPS."
