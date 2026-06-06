#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/dwiraimmobilier.com/public"
ENV_FILE="${APP_DIR}/.env"
BRANCH="${1:-main}"
STATE_DIR="${APP_DIR}/.deploy"
LOCK_HASH_FILE="${STATE_DIR}/package-lock.sha256"

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

DB_SOURCE="$(printf '%s' "${DB_SOURCE:-${DB_TARGET:-local}}" | tr '[:upper:]' '[:lower:]')"
if [ "${DB_SOURCE}" = "site" ] || [ "${DB_SOURCE}" = "production" ]; then
  DB_HOST="${SITE_DB_HOST:-${VPS_DB_HOST:-127.0.0.1}}"
  DB_PORT="${SITE_DB_PORT:-${VPS_DB_PORT:-3306}}"
  DB_USER="${SITE_DB_USER:-${VPS_DB_USER:-}}"
  DB_PASSWORD="${SITE_DB_PASSWORD:-${VPS_DB_PASSWORD:-}}"
  DB_NAME="${SITE_DB_NAME:-${VPS_DB_NAME:-}}"
else
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-3306}"
  DB_USER="${DB_USER:-}"
  DB_PASSWORD="${DB_PASSWORD:-}"
  DB_NAME="${DB_NAME:-}"
fi

if [ -z "${DB_USER}" ] || [ -z "${DB_NAME}" ]; then
  echo "[deploy] ERROR: database credentials missing in ${ENV_FILE} for DB_SOURCE=${DB_SOURCE}"
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
# Low-memory defaults (override via env if needed)
export npm_config_jobs="${NPM_JOBS:-1}"
export npm_config_audit="false"
export npm_config_fund="false"
export npm_config_progress="false"
export npm_config_include="dev"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"

if [ -d "${APP_DIR}/dist" ]; then
  echo "[deploy] Ensure deploy user can replace dist"
  sudo chown -R deploy:deploy "${APP_DIR}/dist"
fi

mkdir -p "${STATE_DIR}"
CURRENT_LOCK_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
PREVIOUS_LOCK_HASH="$(cat "${LOCK_HASH_FILE}" 2>/dev/null || true)"

NEEDS_INSTALL="1"
if [ -d node_modules ] && [ -n "${PREVIOUS_LOCK_HASH}" ] && [ "${PREVIOUS_LOCK_HASH}" = "${CURRENT_LOCK_HASH}" ]; then
  NEEDS_INSTALL="0"
fi

if [ "${NEEDS_INSTALL}" = "1" ]; then
  echo "[deploy] package-lock changed (or first deploy): npm ci required"
  npm ci --prefer-offline
  echo "${CURRENT_LOCK_HASH}" > "${LOCK_HASH_FILE}"
else
  echo "[deploy] package-lock unchanged: reuse existing node_modules"
fi

if [ ! -x "${APP_DIR}/node_modules/.bin/vite" ]; then
  echo "[deploy] vite missing in node_modules: install minimal build toolchain"
  npm install --no-save --prefer-offline --include=dev vite @vitejs/plugin-react @tailwindcss/vite tailwindcss
fi

npm run build

apply_migrations

echo "[deploy] Restart services"
sudo systemctl restart dwira-api
sudo systemctl reload nginx

echo "[deploy] Done"
