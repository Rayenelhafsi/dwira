set -e
APP=/var/www/dwiraimmobilier.com/public
ENV=$APP/.env
R2=$(grep '^R2_PUBLIC_BASE_URL=' "$ENV" | head -n1 | cut -d'=' -f2- | tr -d "'\"\r\n")
if [ -z "$R2" ]; then
  echo "R2_PUBLIC_BASE_URL is empty in $ENV"
  exit 2
fi
if grep -q '^VITE_PARTNERS_CDN_BASE_URL=' "$ENV"; then
  sed -i "s|^VITE_PARTNERS_CDN_BASE_URL=.*$|VITE_PARTNERS_CDN_BASE_URL=${R2}/partners|" "$ENV"
else
  echo "VITE_PARTNERS_CDN_BASE_URL=${R2}/partners" >> "$ENV"
fi
sed -i 's/\r$//' "$ENV"
echo "Configured VITE_PARTNERS_CDN_BASE_URL=$(grep '^VITE_PARTNERS_CDN_BASE_URL=' "$ENV" | cut -d'=' -f2-)"
sudo -u deploy bash "$APP/scripts/deploy-production.sh" Deploy-diwra
cd "$APP"
LATEST_JS=$(ls -1t dist/assets/index-*.js | head -n1)
echo "Latest bundle: $LATEST_JS"
grep -oE "https://[^\"']+/partners/[A-Za-z0-9._-]+\.png" "$LATEST_JS" | head -n 5
