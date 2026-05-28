APP=/var/www/dwiraimmobilier.com/public
cd "$APP"
LATEST_JS=$(ls -1t dist/assets/index-*.js | head -n1)
echo "Bundle=$LATEST_JS"
if grep -q "pub-5bcc4bf8ad794dcf9f62544b15095530.r2.dev" "$LATEST_JS"; then
  echo "FOUND_CLOUDFLARE_IN_BUNDLE=yes"
else
  echo "FOUND_CLOUDFLARE_IN_BUNDLE=no"
fi
curl -s https://www.dwiraimmobilier.com | sed -n '1,120p' | grep -oE 'assets/index-[^" ]+\.js' | head -n1
