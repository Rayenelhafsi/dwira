set -e
APP=/var/www/dwiraimmobilier.com/public
ENV=$APP/.env
# load env safely
set -a
. "$ENV"
set +a

if [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_BUCKET_NAME" ] || [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ]; then
  echo "Missing R2 env vars in $ENV"
  exit 2
fi

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
LOCAL_DIR="$APP/public/partners"

if [ ! -d "$LOCAL_DIR" ]; then
  echo "Local partners directory not found: $LOCAL_DIR"
  exit 3
fi

if command -v aws >/dev/null 2>&1; then
  echo "Using aws cli"
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="auto" \
    aws s3 cp "$LOCAL_DIR" "s3://${R2_BUCKET_NAME}/partners/" --recursive --endpoint-url "$ENDPOINT" --no-progress
else
  echo "aws cli not found, installing awscli via pip"
  python3 -m pip -q install --user awscli
  export PATH="$HOME/.local/bin:$PATH"
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="auto" \
    aws s3 cp "$LOCAL_DIR" "s3://${R2_BUCKET_NAME}/partners/" --recursive --endpoint-url "$ENDPOINT" --no-progress
fi

BASE=$(printf "%s" "$R2_PUBLIC_BASE_URL" | sed 's#/*$##')
FAILED=0
for f in \
  amicale-cadres-ministere-education.png bh-bank.png cnss.png clicktopay.png etap.png flouci.png \
  gct-amicale.png gct.png mastercard.png mtk.png oaca.png opella.png serept.png tita-travel.png visa.png
  do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/partners/$f")
    echo "$f -> HTTP $code"
    if [ "$code" != "200" ]; then FAILED=1; fi
  done

if [ "$FAILED" -ne 0 ]; then
  echo "Some files are not reachable on public URL"
  exit 4
fi

echo "R2 upload and public verification OK"
