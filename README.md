
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

## Production Deployment (dwiraimmobilier.com)

The repository includes:

- `scripts/deploy-production.sh`
- `.github/workflows/deploy.yml`

Server keeps its own `.env` at:

- `/var/www/dwiraimmobilier.com/public/.env`

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
  
