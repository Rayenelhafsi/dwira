#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/dwiraimmobilier.com/public"
ENV_FILE="${APP_DIR}/.env"
BRANCH="${1:-main}"

echo "[deploy] Branch: ${BRANCH}"
cd "${APP_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[deploy] ERROR: ${ENV_FILE} not found"
  exit 1
fi

echo "[deploy] Fetch and reset code"
git fetch origin
git reset --hard "origin/${BRANCH}"

echo "[deploy] Install dependencies and build"
npm ci
npm run build

echo "[deploy] Restart services"
sudo systemctl restart dwira-api
sudo systemctl reload nginx

echo "[deploy] Done"
