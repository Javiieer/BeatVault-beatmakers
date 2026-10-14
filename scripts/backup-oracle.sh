#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
env_file="${BEATVAULT_BACKUP_ENV_FILE:-.env.oracle}"
compose_file="${BEATVAULT_BACKUP_COMPOSE_FILE:-compose.oracle.yml}"
backup_dir="${BEATVAULT_BACKUP_DIR:-backups}"
upload_volume="${BEATVAULT_UPLOAD_VOLUME:-beatvault_app_data}"
postgres_service="${BEATVAULT_BACKUP_POSTGRES_SERVICE:-postgres}"
postgres_user="${BEATVAULT_BACKUP_POSTGRES_USER:-beatvault}"
postgres_db="${BEATVAULT_BACKUP_POSTGRES_DB:-beatvault}"
api_service="${BEATVAULT_BACKUP_API_SERVICE:-api}"
if [[ ! -f "$env_file" ]]; then
  echo "Falta el archivo de entorno: $env_file" >&2
  exit 1
fi
if [[ ! -f "$compose_file" ]]; then
  echo "Falta el archivo Compose: $compose_file" >&2
  exit 1
fi

umask 077
mkdir -p "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
db_file="$backup_dir/beatvault-db-$stamp.sql.gz"
uploads_file="$backup_dir/beatvault-uploads-$stamp.tar.gz"
manifest_file="$backup_dir/beatvault-checksums-$stamp.sha256"
db_tmp="$db_file.tmp"
uploads_tmp="$uploads_file.tmp"
manifest_tmp="$manifest_file.tmp"
docker_backup_dir="$backup_dir"
if command -v cygpath >/dev/null 2>&1; then
  docker_backup_dir="$(cygpath -m "$backup_dir")"
fi
compose=(docker compose --env-file "$env_file" -f "$compose_file")
api_stopped=0
backup_complete=0
restart_api() {
  if [[ "$api_stopped" == 1 ]]; then
    "${compose[@]}" start "$api_service" >/dev/null || true
  fi
  if [[ "$backup_complete" != 1 ]]; then
    rm -f "$db_file" "$uploads_file" "$manifest_file"
  fi
  rm -f "$db_tmp" "$uploads_tmp" "$manifest_tmp"
}
trap restart_api EXIT

api_stopped=1
"${compose[@]}" stop "$api_service"
"${compose[@]}" exec -T "$postgres_service" pg_dump -U "$postgres_user" -d "$postgres_db" | gzip > "$db_tmp"
gzip -t "$db_tmp"
mv "$db_tmp" "$db_file"
MSYS_NO_PATHCONV=1 docker run --rm --mount "type=volume,src=$upload_volume,dst=/source,readonly" --mount "type=bind,src=$docker_backup_dir,dst=/backup" alpine:3.21 tar -czf "/backup/$(basename "$uploads_tmp")" -C /source uploads
mv "$uploads_tmp" "$uploads_file"
(
  cd "$backup_dir"
  sha256sum "$(basename "$db_file")" "$(basename "$uploads_file")" > "$(basename "$manifest_tmp")"
)
mv "$manifest_tmp" "$manifest_file"
"${compose[@]}" start "$api_service"
api_stopped=0
backup_complete=1
trap - EXIT
echo "Respaldo creado: $db_file, $uploads_file y $manifest_file. Guárdalo también fuera del VPS."
