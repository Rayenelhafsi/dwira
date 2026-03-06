#!/usr/bin/env bash
set -euo pipefail

# Refresh Messenger page access tokens from a long-lived user token.
# Expected env vars in .env:
# - MESSENGER_USER_LONG_LIVED_TOKEN
# - MESSENGER_PAGE_ID_LOCATION
# - MESSENGER_PAGE_ID_VENTE
# Optional:
# - FACEBOOK_CLIENT_ID
# - FACEBOOK_CLIENT_SECRET
#
# Usage:
#   bash scripts/refresh-messenger-page-tokens.sh
#   bash scripts/refresh-messenger-page-tokens.sh --env /var/www/dwiraimmobilier.com/public/.env
#   bash scripts/refresh-messenger-page-tokens.sh --no-restart

ENV_FILE=""
RESTART_SERVICE=1
SERVICE_NAME="dwira-api.service"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --no-restart)
      RESTART_SERVICE=0
      shift
      ;;
    --service)
      SERVICE_NAME="${2:-dwira-api.service}"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ENV_FILE" ]]; then
  if [[ -f "/var/www/dwiraimmobilier.com/public/.env" ]]; then
    ENV_FILE="/var/www/dwiraimmobilier.com/public/.env"
  elif [[ -f ".env" ]]; then
    ENV_FILE=".env"
  else
    echo "No .env file found. Use --env /path/to/.env" >&2
    exit 1
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

USER_TOKEN="${MESSENGER_USER_LONG_LIVED_TOKEN:-}"
PAGE_ID_LOCATION="${MESSENGER_PAGE_ID_LOCATION:-}"
PAGE_ID_VENTE="${MESSENGER_PAGE_ID_VENTE:-}"

if [[ -z "$USER_TOKEN" ]]; then
  echo "MESSENGER_USER_LONG_LIVED_TOKEN is missing in $ENV_FILE" >&2
  exit 1
fi
if [[ -z "$PAGE_ID_LOCATION" || -z "$PAGE_ID_VENTE" ]]; then
  echo "MESSENGER_PAGE_ID_LOCATION or MESSENGER_PAGE_ID_VENTE missing in $ENV_FILE" >&2
  exit 1
fi

if [[ -n "${FACEBOOK_CLIENT_ID:-}" && -n "${FACEBOOK_CLIENT_SECRET:-}" ]]; then
  APP_ACCESS_TOKEN="${FACEBOOK_CLIENT_ID}|${FACEBOOK_CLIENT_SECRET}"
  DEBUG_JSON="$(curl -fsS "https://graph.facebook.com/debug_token?input_token=${USER_TOKEN}&access_token=${APP_ACCESS_TOKEN}")"
  IS_VALID="$(printf '%s' "$DEBUG_JSON" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(String(Boolean(d?.data?.is_valid)));")"
  if [[ "$IS_VALID" != "true" ]]; then
    echo "Long-lived user token is invalid. Re-generate MESSENGER_USER_LONG_LIVED_TOKEN." >&2
    exit 1
  fi
fi

ACCOUNTS_JSON="$(curl -fsS "https://graph.facebook.com/v21.0/me/accounts?access_token=${USER_TOKEN}")"

extract_page_token() {
  local page_id="$1"
  local json="$2"
  printf '%s' "$json" | node -e "const fs=require('fs');const pageId=String(process.argv[1]);const d=JSON.parse(fs.readFileSync(0,'utf8'));const row=(d.data||[]).find((p)=>String(p.id)===pageId);if(!row||!row.access_token){process.exit(3)}process.stdout.write(String(row.access_token));" "$page_id"
}

LOCATION_TOKEN="$(extract_page_token "$PAGE_ID_LOCATION" "$ACCOUNTS_JSON" || true)"
VENTE_TOKEN="$(extract_page_token "$PAGE_ID_VENTE" "$ACCOUNTS_JSON" || true)"

if [[ -z "$LOCATION_TOKEN" || -z "$VENTE_TOKEN" ]]; then
  echo "Could not extract page tokens from /me/accounts. Check page IDs and user token permissions." >&2
  exit 1
fi

upsert_env() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(printf '%s' "$value" | sed 's/[&|]/\\&/g')"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

upsert_env "MESSENGER_PAGE_ACCESS_TOKEN_LOCATION" "$LOCATION_TOKEN"
upsert_env "MESSENGER_PAGE_ACCESS_TOKEN_VENTE" "$VENTE_TOKEN"

echo "Updated $ENV_FILE:"
echo "  - MESSENGER_PAGE_ACCESS_TOKEN_LOCATION (len ${#LOCATION_TOKEN})"
echo "  - MESSENGER_PAGE_ACCESS_TOKEN_VENTE (len ${#VENTE_TOKEN})"

if [[ "$RESTART_SERVICE" -eq 1 ]]; then
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart "$SERVICE_NAME"
    echo "Restarted service: $SERVICE_NAME"
  else
    echo "systemctl not found; restart service manually."
  fi
fi

echo "Done."
