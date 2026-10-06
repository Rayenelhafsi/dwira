#!/usr/bin/env bash
set -euo pipefail

# Server-side blue/green deployment helper.
# Step 1: ./scripts/deploy-blue-green.sh prepare main
# Step 2: ./scripts/deploy-blue-green.sh promote

APP_ROOT="${APP_ROOT:-/var/www/dwiraimmobilier.com}"
RELEASES_DIR="${RELEASES_DIR:-${APP_ROOT}/releases}"
CURRENT_LINK="${CURRENT_LINK:-${APP_ROOT}/current}"
ENV_FILE="${ENV_FILE:-${APP_ROOT}/shared/.env}"
BRANCH="${2:-main}"
ACTION="${1:-prepare}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
PENDING_FILE="${APP_ROOT}/shared/pending-release"
REPO_URL="${REPO_URL:-origin}"

require_env() {
  if [ ! -f "${ENV_FILE}" ]; then
    echo "[blue-green] ERROR: env file missing: ${ENV_FILE}"
    exit 1
  fi
}

load_env() {
  require_env
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
}

run_healthcheck() {
  local port="${PORT:-3001}"
  local base_url="${HEALTHCHECK_URL:-http://127.0.0.1:${port}/api/health}"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error "${base_url}" >/dev/null
    echo "[blue-green] Healthcheck OK: ${base_url}"
  else
    echo "[blue-green] curl not found, skipped healthcheck"
  fi
}

prepare_release() {
  load_env
  mkdir -p "${RELEASES_DIR}" "$(dirname "${PENDING_FILE}")"
  echo "[blue-green] Prepare ${RELEASE_ID} from ${BRANCH}"
  git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${RELEASE_DIR}"
  cp "${ENV_FILE}" "${RELEASE_DIR}/.env"
  cd "${RELEASE_DIR}"
  npm ci --include=dev --audit=false --fund=false
  npm run build
  npm run db:migrate
  node --check server/index.cjs
  echo "${RELEASE_DIR}" > "${PENDING_FILE}"
  echo "[blue-green] Prepared release: ${RELEASE_DIR}"
  echo "[blue-green] Test this release before promote."
}

promote_release() {
  local release_dir="${RELEASE_DIR}"
  if [ -f "${PENDING_FILE}" ]; then
    release_dir="$(cat "${PENDING_FILE}")"
  fi
  if [ ! -d "${release_dir}" ]; then
    echo "[blue-green] ERROR: release not found: ${release_dir}"
    exit 1
  fi
  echo "[blue-green] Promote ${release_dir}"
  ln -sfn "${release_dir}" "${CURRENT_LINK}.next"
  mv -Tf "${CURRENT_LINK}.next" "${CURRENT_LINK}"
  sudo systemctl restart dwira-api
  run_healthcheck
  sudo systemctl reload nginx
  rm -f "${PENDING_FILE}"
  echo "[blue-green] Current release: ${release_dir}"
}

case "${ACTION}" in
  prepare) prepare_release ;;
  promote) promote_release ;;
  *)
    echo "Usage: $0 prepare [branch] | promote"
    exit 2
    ;;
esac
