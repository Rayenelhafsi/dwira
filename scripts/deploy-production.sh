#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/dwiraimmobilier.com/public"
ENV_FILE="${APP_DIR}/.env"
BRANCH="${1:-main}"

if [ ! -d "${APP_DIR}/migrations" ]; then
  echo "[deploy] ERROR: migrations directory not found: ${APP_DIR}/migrations"
  exit 1
fi

echo "[deploy] Branch: ${BRANCH}"
cd "${APP_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[deploy] ERROR: ${ENV_FILE} not found"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-}"

if [ -z "${DB_USER}" ] || [ -z "${DB_NAME}" ]; then
  echo "[deploy] ERROR: DB_USER / DB_NAME missing in ${ENV_FILE}"
  exit 1
fi

run_sql() {
  local sql="$1"
  MYSQL_PWD="${DB_PASSWORD}" mysql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --user="${DB_USER}" \
    --database="${DB_NAME}" \
    --batch --silent \
    -e "${sql}"
}

apply_migrations() {
  echo "[deploy] Ensure schema_migrations table exists"
  run_sql "CREATE TABLE IF NOT EXISTS schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    migration VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"

  shopt -s nullglob
  local files=(migrations/*.sql)
  shopt -u nullglob

  if [ ${#files[@]} -eq 0 ]; then
    echo "[deploy] No SQL migration file found"
    return
  fi

  IFS=$'\n' files=($(printf '%s\n' "${files[@]}" | sort))
  unset IFS

  echo "[deploy] Apply SQL migrations"
  for file in "${files[@]}"; do
    local migration
    migration="$(basename "${file}")"
    local already_applied
    already_applied="$(run_sql "SELECT COUNT(*) FROM schema_migrations WHERE migration='${migration}';")"
    if [ "${already_applied}" != "0" ]; then
      echo "[deploy] Skip ${migration} (already applied)"
      continue
    fi

    echo "[deploy] Running ${migration}"
    MYSQL_PWD="${DB_PASSWORD}" mysql \
      --host="${DB_HOST}" \
      --port="${DB_PORT}" \
      --user="${DB_USER}" \
      --database="${DB_NAME}" \
      < "${file}"
    run_sql "INSERT INTO schema_migrations (migration) VALUES ('${migration}');"
  done
}

echo "[deploy] Fetch and reset code"
git fetch origin
git reset --hard "origin/${BRANCH}"

echo "[deploy] Install dependencies and build"
npm ci
npm run build

apply_migrations

echo "[deploy] Restart services"
sudo systemctl restart dwira-api
sudo systemctl reload nginx

echo "[deploy] Done"
