const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function printHelp() {
  console.log(`
Usage:
  node scripts/migrate-media-to-cloudinary.cjs [--apply] [--limit <n>] [--bien-id <id>] [--folder <name>] [--tag <name>] [--overwrite]

Options:
  --apply            Apply DB updates (default is dry-run)
  --limit            Limit number of rows to inspect
  --bien-id          Process only one bien_id
  --folder           Cloudinary folder (default: dwira_uploads)
  --tag              Cloudinary tag to add (default: dwira_migrated)
  --overwrite        Re-upload even when same public_id exists
  --help             Show this help

Required env:
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
  and one of:
    CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
    or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET

Examples:
  node scripts/migrate-media-to-cloudinary.cjs
  node scripts/migrate-media-to-cloudinary.cjs --apply
  node scripts/migrate-media-to-cloudinary.cjs --apply --bien-id b123
  node scripts/migrate-media-to-cloudinary.cjs --apply --folder dwira/test --tag migration_mars
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    limit: null,
    bienId: null,
    folder: 'dwira_uploads',
    tag: 'dwira_migrated',
    overwrite: false,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--apply') out.apply = true;
    else if (token === '--limit') out.limit = Number(args[++i] || 0) || null;
    else if (token === '--bien-id') out.bienId = String(args[++i] || '').trim() || null;
    else if (token === '--folder') out.folder = String(args[++i] || '').trim() || out.folder;
    else if (token === '--tag') out.tag = String(args[++i] || '').trim() || out.tag;
    else if (token === '--overwrite') out.overwrite = true;
    else if (token === '--help' || token === '-h') out.help = true;
  }

  return out;
}

function getDbConfig() {
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  if (!host || !user || typeof password === 'undefined' || !database) {
    throw new Error('Missing DB config. Expected DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in .env');
  }
  return { host, port, user, password, database };
}

function parseCloudinaryFromEnv() {
  const url = String(process.env.CLOUDINARY_URL || '').trim();
  if (url.startsWith('cloudinary://')) {
    const parsed = new URL(url);
    const cloudName = parsed.hostname;
    const apiKey = decodeURIComponent(parsed.username || '');
    const apiSecret = decodeURIComponent(parsed.password || '');
    if (cloudName && apiKey && apiSecret) {
      return { cloudName, apiKey, apiSecret };
    }
  }

  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary creds. Provide CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET');
  }
  return { cloudName, apiKey, apiSecret };
}

function extractUploadsRelativePath(mediaUrl) {
  const value = String(mediaUrl || '').trim();
  if (!value) return null;

  if (value.startsWith('/api/uploads/')) return value.replace(/^\/api\/uploads\//, '');
  if (value.startsWith('/uploads/')) return value.replace(/^\/uploads\//, '');

  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith('/api/uploads/')) return parsed.pathname.replace(/^\/api\/uploads\//, '');
    if (parsed.pathname.startsWith('/uploads/')) return parsed.pathname.replace(/^\/uploads\//, '');
  } catch {
    return null;
  }

  return null;
}

function isCloudinaryUrl(value) {
  return /(^https?:\/\/)?res\.cloudinary\.com\//i.test(String(value || '').trim());
}

function buildOriginUrl(mediaUrl) {
  const value = String(mediaUrl || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const pathPart = value.startsWith('/') ? value : `/${value}`;
  return `https://www.dwiraimmobilier.com${pathPart}`;
}

function safePublicIdPart(input) {
  return String(input || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9/_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildPublicId(options, row) {
  const relative = extractUploadsRelativePath(row.url) || '';
  const relativeSafe = safePublicIdPart(relative);
  const fallback = `media_${safePublicIdPart(row.id) || Date.now()}`;
  const base = relativeSafe || fallback;
  const folder = String(options.folder || '').replace(/^\/+|\/+$/g, '');
  return folder ? `${folder}/${base}` : base;
}

function signCloudinaryParams(params, apiSecret) {
  const signatureBase = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${signatureBase}${apiSecret}`).digest('hex');
}

async function uploadToCloudinary(creds, row, options) {
  const endpoint = `https://api.cloudinary.com/v1_1/${creds.cloudName}/image/upload`;
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = buildPublicId(options, row);
  const file = buildOriginUrl(row.url);

  if (!file) {
    throw new Error(`Invalid media url for row ${row.id}`);
  }

  const paramsForSignature = {
    folder: '',
    invalidate: 'true',
    overwrite: options.overwrite ? 'true' : 'false',
    public_id: publicId,
    tags: options.tag,
    timestamp: String(timestamp),
    type: 'upload',
    unique_filename: 'false',
    use_filename: 'false',
  };

  const signature = signCloudinaryParams(paramsForSignature, creds.apiSecret);

  const form = new FormData();
  form.append('file', file);
  form.append('public_id', publicId);
  form.append('overwrite', options.overwrite ? 'true' : 'false');
  form.append('invalidate', 'true');
  form.append('unique_filename', 'false');
  form.append('use_filename', 'false');
  form.append('tags', options.tag);
  form.append('type', 'upload');
  form.append('timestamp', String(timestamp));
  form.append('api_key', creds.apiKey);
  form.append('signature', signature);

  const response = await fetch(endpoint, { method: 'POST', body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return {
    secureUrl: String(body.secure_url || '').trim(),
    publicId: String(body.public_id || publicId),
    bytes: Number(body.bytes || 0),
    format: String(body.format || ''),
  };
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }

  const dbConfig = getDbConfig();
  const cloudinaryCreds = parseCloudinaryFromEnv();
  const dryRun = !options.apply;

  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log(`DB: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  console.log(`Cloudinary cloud: ${cloudinaryCreds.cloudName}`);
  console.log(`Folder: ${options.folder}`);
  console.log(`Tag: ${options.tag}`);
  console.log(`Overwrite: ${options.overwrite ? 'yes' : 'no'}`);

  const where = ["type = 'image'"];
  const params = [];
  if (options.bienId) {
    where.push('bien_id = ?');
    params.push(options.bienId);
  }
  const limitClause = options.limit ? `LIMIT ${Math.max(1, Math.trunc(options.limit))}` : '';
  const sql = `
    SELECT id, bien_id, type, url, position
    FROM media
    WHERE ${where.join(' AND ')}
    ORDER BY bien_id ASC, position ASC, id ASC
    ${limitClause}
  `;

  const connection = await mysql.createConnection(dbConfig);
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackPath = path.resolve(__dirname, `../tmp/cloudinary-media-rollback-${now}.json`);
  fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });

  try {
    const [rows] = await connection.query(sql, params);
    const allRows = Array.isArray(rows) ? rows : [];

    const candidates = allRows.filter((row) => {
      const url = String(row.url || '').trim();
      if (!url) return false;
      if (isCloudinaryUrl(url)) return false;
      return Boolean(extractUploadsRelativePath(url));
    });

    console.log(`Scanned rows: ${allRows.length}`);
    console.log(`Candidate upload rows: ${candidates.length}`);
    if (candidates.length === 0) {
      console.log('Nothing to migrate.');
      return;
    }

    const updates = [];
    const failures = [];

    for (let i = 0; i < candidates.length; i += 1) {
      const row = candidates[i];
      const label = `[${i + 1}/${candidates.length}] row=${row.id} bien=${row.bien_id}`;
      try {
        const uploaded = await uploadToCloudinary(cloudinaryCreds, row, options);
        if (!uploaded.secureUrl) {
          throw new Error('No secure_url returned by Cloudinary');
        }
        updates.push({
          id: String(row.id),
          bien_id: row.bien_id,
          old_url: row.url,
          new_url: uploaded.secureUrl,
          public_id: uploaded.publicId,
          bytes: uploaded.bytes,
          format: uploaded.format,
        });
        console.log(`${label} -> OK`);
      } catch (error) {
        failures.push({
          id: String(row.id),
          bien_id: row.bien_id,
          old_url: row.url,
          error: error.message,
        });
        console.log(`${label} -> FAIL: ${error.message}`);
      }
    }

    console.log(`\nUploaded OK: ${updates.length}`);
    console.log(`Failed: ${failures.length}`);

    fs.writeFileSync(
      rollbackPath,
      JSON.stringify(
        {
          created_at: new Date().toISOString(),
          mode: dryRun ? 'dry-run' : 'apply',
          cloud_name: cloudinaryCreds.cloudName,
          updates,
          failures,
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(`Rollback/report file: ${rollbackPath}`);

    if (dryRun || updates.length === 0) {
      console.log(dryRun ? '\nDry-run finished. No DB changes made.' : '\nNo successful uploads to update in DB.');
      return;
    }

    await connection.beginTransaction();
    try {
      for (const item of updates) {
        await connection.query(
          'UPDATE media SET url = ? WHERE id = ?',
          [item.new_url, item.id]
        );
      }
      await connection.commit();
      console.log(`\nDB updated rows: ${updates.length}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});

