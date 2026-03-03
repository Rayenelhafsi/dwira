
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

Minimum production checks:

1. `https://www.dwiraimmobilier.com/api/health` must return JSON.
2. `https://www.dwiraimmobilier.com/api/auth/providers` must return JSON.
3. `/api`, `/uploads`, and `/contracts` must proxy to `http://127.0.0.1:3001`.
4. `dwiraimmobilier.com` should redirect to `www.dwiraimmobilier.com`.

Do not commit production secrets.

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
  
