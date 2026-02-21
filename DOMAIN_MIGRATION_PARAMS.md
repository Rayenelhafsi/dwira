# Domain Migration Parameters

Fill this file before switching to the new domain.

## Frontend (Vite)

Set these values in your frontend `.env`:

```env
VITE_API_URL=https://api.NEW_DOMAIN/api
```

## Backend (Node API)

Set these values in your backend `.env`:

```env
# API server port
PORT=3001

# Public frontend URL (used for social auth redirect back to /login)
FRONTEND_URL=https://NEW_DOMAIN

# Public backend base URL (used to build uploaded file URLs and OAuth callback defaults)
SERVER_PUBLIC_URL=https://api.NEW_DOMAIN

# Allowed origins for browser calls to API ("*" or comma-separated list)
CORS_ORIGIN=https://NEW_DOMAIN,https://www.NEW_DOMAIN

# Optional explicit OAuth callback URLs (recommended in production)
GOOGLE_REDIRECT_URI=https://api.NEW_DOMAIN/api/auth/google/callback
FACEBOOK_REDIRECT_URI=https://api.NEW_DOMAIN/api/auth/facebook/callback

# OAuth app credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=

# Database
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=

# Optional admin seed
ADMIN_SEED_NAME=
ADMIN_SEED_EMAIL=
ADMIN_SEED_PASSWORD=
```

## Also update outside `.env`

Set this if you deploy to GitHub Pages:

```json
"homepage": "https://NEW_DOMAIN"
```

Current file: `package.json`
