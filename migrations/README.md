# Migrations SQL

Place all production-safe SQL changes in this folder and version them by date.

Naming convention:

- `YYYY-MM-DD-short-description.sql`

Apply manually on local and production (after backup):

```bash
mysql -u USER -p DB_NAME < migrations/2026-02-23-add-zone-google-maps-url.sql
```

Recommended workflow:

1. Create migration file.
2. Test on local DB.
3. Commit migration in Git.
4. Apply on production DB.
