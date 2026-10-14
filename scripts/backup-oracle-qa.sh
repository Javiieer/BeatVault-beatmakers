#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
qa_env_file=".env.oracle.example"
qa_compose_file="compose.backup-qa.yml"
upload_volume="beatvault-backup-qa-$run_id-uploads"
pg_volume="beatvault-backup-qa-$run_id-pg"
backup_dir="backups/backup-qa-$run_id"
compose=(docker compose --env-file "$qa_env_file" -f "$qa_compose_file")
compose_started=0

export BEATVAULT_QA_RUN="$run_id"
export BEATVAULT_BACKUP_ENV_FILE="$qa_env_file"
export BEATVAULT_BACKUP_COMPOSE_FILE="$qa_compose_file"
export BEATVAULT_BACKUP_DIR="$backup_dir"
export BEATVAULT_UPLOAD_VOLUME="$upload_volume"
export BEATVAULT_BACKUP_POSTGRES_USER=beatvault_qa
export BEATVAULT_BACKUP_POSTGRES_DB=beatvault

cleanup() {
  if [[ "$compose_started" == 1 ]]; then
    "${compose[@]}" down --volumes --remove-orphans >/dev/null || true
  fi
  local backup_root target
  backup_root="$(pwd)/backups"
  target="$(pwd)/$backup_dir"
  case "$target" in
    "$backup_root"/backup-qa-*) rm -rf -- "$target" ;;
    *) echo "No se eliminó una ruta de respaldo QA inesperada: $target" >&2 ;;
  esac
}
trap cleanup EXIT

for volume in "$upload_volume" "$pg_volume"; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    echo "El volumen QA ya existe; se aborta sin reutilizarlo: $volume" >&2
    exit 1
  fi
done

compose_started=1
"${compose[@]}" up -d
ready=0
for _ in $(seq 1 120); do
  postgres_logs="$("${compose[@]}" logs postgres 2>&1 || true)"
  if [[ "$postgres_logs" == *'PostgreSQL init process complete'* ]] && \
    "${compose[@]}" exec -T postgres pg_isready -U beatvault_qa -d beatvault >/dev/null 2>&1; then
      ready=1
      break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  echo 'PostgreSQL QA no quedó listo.' >&2
  exit 1
fi

"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U beatvault_qa -d beatvault \
  -c "CREATE TABLE backup_qa_marker (value text PRIMARY KEY); INSERT INTO backup_qa_marker VALUES ('db-restored-$run_id');"
"${compose[@]}" exec -T api sh -c \
  "mkdir -p /app/data/uploads/backup-qa && printf 'audio-backup-marker-$run_id' > /app/data/uploads/backup-qa/marker.txt"

bash scripts/backup-oracle.sh
api_container="$("${compose[@]}" ps -q api)"
api_status="$(docker inspect --format '{{.State.Status}}' "$api_container")"
if [[ "$api_status" != running ]]; then
  echo 'El servicio API no volvió a levantarse después del respaldo.' >&2
  exit 1
fi

shopt -s nullglob
db_files=("$backup_dir"/*.sql.gz)
upload_files=("$backup_dir"/*.tar.gz)
manifests=("$backup_dir"/*.sha256)
if [[ ${#db_files[@]} != 1 || ${#upload_files[@]} != 1 || ${#manifests[@]} != 1 ]]; then
  echo 'El respaldo no produjo exactamente un dump, un archivo de uploads y un manifiesto.' >&2
  exit 1
fi
(
  cd "$backup_dir"
  sha256sum --check "$(basename "${manifests[0]}")"
  gzip -t "$(basename "${db_files[0]}")"
)

"${compose[@]}" exec -T postgres createdb -U beatvault_qa backup_restore_qa
gzip -dc "${db_files[0]}" | "${compose[@]}" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U beatvault_qa -d backup_restore_qa >/dev/null
restored_marker="$("${compose[@]}" exec -T postgres psql -U beatvault_qa -d backup_restore_qa -tAc 'SELECT value FROM backup_qa_marker')"
if [[ "$restored_marker" != "db-restored-$run_id" ]]; then
  echo 'El marcador de base de datos no sobrevivió a la restauración.' >&2
  exit 1
fi
restored_audio="$(tar -xOf "${upload_files[0]}" uploads/backup-qa/marker.txt)"
if [[ "$restored_audio" != "audio-backup-marker-$run_id" ]]; then
  echo 'El archivo marcador no sobrevivió al respaldo de uploads.' >&2
  exit 1
fi

echo 'PASS: backup-oracle real, SHA-256, gzip, restauración SQL, uploads y reinicio de API.'
