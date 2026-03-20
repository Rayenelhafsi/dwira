
# Dwira

## Local Development (PC)

1. Install dependencies:
```bash
npm i
```

2. Create local env file:
```bash
cp .env.example .env
```

3. Update local DB credentials in `.env`:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

4. Start backend API:
```bash
npm run server
```

5. Start frontend:
```bash
npm run dev
```

## Production Deployment (www.dwiraimmobilier.com)

The repository includes:

- `scripts/deploy-production.sh`
- `.github/workflows/deploy.yml`

Server keeps its own `.env` at:

- `/var/www/dwiraimmobilier.com/public/.env`

Use `https://www.dwiraimmobilier.com` as the canonical frontend URL.
Keep `VITE_API_URL=/api` only if Nginx proxies `/api/*` to the Node server on port `3001`.
An example server block is available in:

- `scripts/nginx-dwiraimmobilier.conf.example`

Important for media uploads:

- Nginx must include `client_max_body_size 50M;` or uploads can fail with `413 Request Entity Too Large` before Node receives the file.

Minimum production checks:

1. `https://www.dwiraimmobilier.com/api/health` must return JSON.
2. `https://www.dwiraimmobilier.com/api/auth/providers` must return JSON.
3. `/api`, `/uploads`, and `/contracts` must proxy to `http://127.0.0.1:3001`.
4. `dwiraimmobilier.com` should redirect to `www.dwiraimmobilier.com`.

Do not commit production secrets.

## Passkey + Cloudflare Turnstile Setup

### 1) Environment variables

Set these values in `.env` (local) and server `.env` (production):

- `SESSION_SECRET` (long random secret, required for stable login cookies)
- `WEBAUTHN_RP_NAME` (ex: `Dwira Immobilier`)
- `WEBAUTHN_RP_ID`:
  - local: `localhost`
  - production: `www.dwiraimmobilier.com`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

### 2) Cloudflare Turnstile dashboard

1. Create a Turnstile widget in Cloudflare.
2. Add allowed hostnames:
- `localhost`
- `www.dwiraimmobilier.com`
3. Copy `site key` and `secret key` into `.env`.

### 3) Verify backend + frontend wiring

1. Restart backend after env changes.
2. Check anti-bot config endpoint:
```bash
curl https://www.dwiraimmobilier.com/api/anti-bot/config
```
Expected: `enabled: true` and a non-empty `siteKey`.
3. In reservation confirmation page, Turnstile must appear before submission.

### 4) Passkey domain rules

- Passkey requires `https` in production.
- Local development works on `http://localhost`.
- `WEBAUTHN_RP_ID` must exactly match the domain used by users.

## GitHub Actions Secrets

Set these repo secrets:

- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`

Workflow triggers on push to `main`.

## Recommended Git Flow

1. Work on `Deploy-diwra`.
2. Push changes to production branch:
```bash
git push origin Deploy-diwra:main
```
3. GitHub Action deploys automatically.

## Database Migrations

Version SQL changes in `migrations/`.

Apply manually:
```bash
mysql -u USER -p DB_NAME < migrations/2026-02-23-add-zone-google-maps-url.sql
```

## Phone OTP via n8n

For WhatsApp OTP delivery through `n8n`, see:

- `guidelines/whatsapp-otp-n8n.md`

Backend-side OTP generation and verification already exist. `n8n` is only the delivery layer.

## Messenger Auto-Reply (Official Meta)

This project now supports Messenger webhook + Send API for property-link auto reply.

Required `.env` values:

- `MESSENGER_VERIFY_TOKEN`
- `MESSENGER_PAGE_ACCESS_TOKEN`
- `MESSENGER_APP_SECRET`
- `MESSENGER_API_VERSION` (default `v21.0`)

Meta App Webhook URL:

- `https://www.dwiraimmobilier.com/api/messenger/webhook`

Verification endpoint:

- `GET /api/messenger/webhook`

Events endpoint:

- `POST /api/messenger/webhook`

Important:

- Messenger still requires user interaction before page messages are allowed.
- The card button opens `m.me` with `ref` context of the property URL.
- The backend webhook replies with the property link so Messenger renders the link preview image.
  
