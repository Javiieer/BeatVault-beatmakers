#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
env_file=".env.oracle"

if [[ ! -f "$env_file" ]]; then
  echo "Falta .env.oracle. Crea una copia de .env.oracle.example y configura dominio y clave de base de datos." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Instala Docker Engine y Docker Compose v2 antes de desplegar." >&2
  exit 1
fi

domain="$(sed -n 's/^BEATVAULT_DOMAIN=//p' "$env_file" | head -n 1)"
db_password="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$env_file" | head -n 1)"
if [[ -z "$domain" || "$domain" == *example* || "$domain" == *your-domain* || "$domain" == *" "* ]]; then
  echo "BEATVAULT_DOMAIN debe ser el dominio público real de BeatVault." >&2
  exit 1
fi
if [[ ${#db_password} -lt 64 || "$db_password" == *[!0-9a-fA-F]* ]]; then
  echo "POSTGRES_PASSWORD debe tener al menos 64 caracteres hexadecimales (por ejemplo, openssl rand -hex 32)." >&2
  exit 1
fi

umask 077
chmod 600 "$env_file"
docker compose --env-file "$env_file" -f compose.oracle.yml config --quiet
docker compose --env-file "$env_file" -f compose.oracle.yml up -d --build
docker compose --env-file "$env_file" -f compose.oracle.yml ps
