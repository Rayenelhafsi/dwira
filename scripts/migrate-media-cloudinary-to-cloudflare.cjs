const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function printHelp() {
  console.log(`
Usage:
  node scripts/migrate-media-cloudinary-to-cloudflare.cjs [--apply] [--limit <n>] [--bien-id <id>]

Options:
  --apply       Apply DB updates (default is dry-run)
  --limit       Limit number of rows
  --bien-id     Process a single bien_id
  --help        Show this help

Required env:
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
  CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
  Optional for Cloudinary 401 fallback:
  CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, limit: null, bienId: null, help: false };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--apply') out.apply = true;
    else if (token === '--limit') out.limit = Number(args[++i] || 0) || null;
    else if (token === '--bien-id') out.bienId = String(args[++i] || '').trim() || null;
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
    throw new Error('Missing DB config. Expected DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.');
  }
  return { host, port, user, password, database };
}

function getCloudflareConfig() {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const variant = String(process.env.CLOUDFLARE_IMAGES_VARIANT || 'public').trim() || 'public';
  const requireSigned = String(process.env.CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS || '').trim().toLowerCase() === 'true';
  if (!accountId || !apiToken) {
    throw new Error('Missing Cloudflare config. Expected CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.');
  }
  return { accountId, apiToken, variant, requireSigned };
}

function parseCloudinaryCredentials() {
  const cloudinaryUrl = String(process.env.CLOUDINARY_URL || '').trim();
  if (cloudinaryUrl.startsWith('cloudinary://')) {
    try {
      const parsed = new URL(cloudinaryUrl);
      const cloudName = String(parsed.hostname || '').trim();
      const apiKey = decodeURIComponent(String(parsed.username || '').trim());
      const apiSecret = decodeURIComponent(String(parsed.password || '').trim());
      if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret };
    } catch {
      // fallback to explicit vars
    }
  }
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

function isCloudinaryUrl(value) {
  return /(^https?:\/\/)?res\.cloudinary\.com\//i.test(String(value || '').trim());
}

function isCloudinaryTransformationSegment(segment) {
  const value = String(segment || '').trim();
  if (!value) return false;
  if (value.includes(',')) return true;
  return /^(?:w_|h_|c_|q_|f_|dpr_|g_|e_|ar_|b_|bo_|x_|y_|z_)/i.test(value);
}

function extractCloudinaryPublicIdAndFormat(assetUrl) {
  try {
    const parsed = new URL(assetUrl);
    if (!/res\.cloudinary\.com$/i.test(parsed.hostname)) return null;
    const marker = '/image/upload/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx < 0) return null;
    const tail = parsed.pathname.slice(idx + marker.length);
    const segments = tail.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    let i = 0;
    while (i < segments.length && isCloudinaryTransformationSegment(segments[i])) i += 1;
    if (i < segments.length && /^v\d+$/i.test(segments[i])) i += 1;
    const publicIdWithExt = segments.slice(i).join('/').trim();
    if (!publicIdWithExt) return null;
    const dot = publicIdWithExt.lastIndexOf('.');
    if (dot <= 0 || dot === publicIdWithExt.length - 1) {
      return { publicId: publicIdWithExt, format: null };
    }
    return {
      publicId: publicIdWithExt.slice(0, dot),
      format: publicIdWithExt.slice(dot + 1),
    };
  } catch {
    return null;
  }
}

function signCloudinaryParams(params, apiSecret) {
  const signatureBase = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${signatureBase}${apiSecret}`).digest('hex');
}

async function tryFetchCloudinaryAsset(assetUrl, cloudinaryCreds) {
  const direct = await fetch(assetUrl);
  if (direct.ok) {
    const bytes = Buffer.from(await direct.arrayBuffer());
    return { bytes, contentType: direct.headers.get('content-type') || 'application/octet-stream', via: 'direct' };
  }
  if (direct.status !== 401 || !cloudinaryCreds) {
    throw new Error(`Cloudinary fetch failed (${direct.status})`);
  }

  const parsed = extractCloudinaryPublicIdAndFormat(assetUrl);
  if (!parsed?.publicId) {
    throw new Error('Cloudinary URL is 401 and public_id could not be extracted');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: parsed.publicId,
    timestamp: String(timestamp),
    type: 'upload',
    ...(parsed.format ? { format: parsed.format } : {}),
  };
  const signature = signCloudinaryParams(params, cloudinaryCreds.apiSecret);
  const endpoint = new URL(`https://api.cloudinary.com/v1_1/${cloudinaryCreds.cloudName}/image/download`);
  endpoint.searchParams.set('public_id', parsed.publicId);
  endpoint.searchParams.set('type', 'upload');
  if (parsed.format) endpoint.searchParams.set('format', parsed.format);
  endpoint.searchParams.set('timestamp', String(timestamp));
  endpoint.searchParams.set('api_key', cloudinaryCreds.apiKey);
  endpoint.searchParams.set('signature', signature);

  const signedResponse = await fetch(endpoint.toString());
  if (!signedResponse.ok) {
    throw new Error(`Cloudinary signed download failed (${signedResponse.status})`);
  }
  const bytes = Buffer.from(await signedResponse.arrayBuffer());
  return { bytes, contentType: signedResponse.headers.get('content-type') || 'application/octet-stream', via: 'signed' };
}

function parseCloudflareApiEnvelope(payload) {
  if (payload && typeof payload === 'object') return payload;
  return {};
}

function extractCloudflareErrorDetail(payload, fallbackMessage) {
  const envelope = parseCloudflareApiEnvelope(payload);
  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    const message = envelope.errors
      .map((entry) => String(entry?.message || entry?.code || '').trim())
      .filter(Boolean)
      .join('; ');
    if (message) return message;
  }
  return String(envelope.message || fallbackMessage || 'Cloudflare request failed').trim();
}

async function uploadBytesToCloudflareImage(bytes, filename, contentType, cloudflareConfig) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareConfig.accountId)}/images/v1`;
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: contentType || 'application/octet-stream' }), filename || 'image.jpg');
  form.append('requireSignedURLs', cloudflareConfig.requireSigned ? 'true' : 'false');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cloudflareConfig.apiToken}`,
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractCloudflareErrorDetail(payload, `Cloudflare upload failed (${response.status})`));
  }
  const variants = Array.isArray(payload?.result?.variants) ? payload.result.variants.filter(Boolean) : [];
  if (variants.length === 0) throw new Error('Cloudflare upload returned no variants');
  const chosen =
    variants.find((url) => String(url).split('/').pop() === cloudflareConfig.variant)
    || variants[0];
  return String(chosen || '').trim();
}

function getFileNameFromUrl(rawUrl, fallback) {
  try {
    const parsed = new URL(rawUrl);
    const name = String(parsed.pathname.split('/').pop() || '').trim();
    if (name) return name;
  } catch {
    // ignore
  }
  return fallback;
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }

  const dbConfig = getDbConfig();
  const cloudflareConfig = getCloudflareConfig();
  const cloudinaryCreds = parseCloudinaryCredentials();
  const dryRun = !options.apply;

  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log(`DB: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  console.log(`Cloudflare account: ${cloudflareConfig.accountId}`);
  console.log(`Cloudinary creds present: ${cloudinaryCreds ? 'yes' : 'no'}`);

  const where = [`m.type = 'image'`, `m.url IS NOT NULL`, `m.url <> ''`];
  const params = [];
  if (options.bienId) {
    where.push('m.bien_id = ?');
    params.push(options.bienId);
  }
  const limitClause = options.limit ? `LIMIT ${Math.max(1, Math.trunc(options.limit))}` : '';
  const sql = `
    SELECT m.id, m.bien_id, m.url, m.position
    FROM media m
    WHERE ${where.join(' AND ')}
    ORDER BY m.bien_id ASC, m.position ASC, m.id ASC
    ${limitClause}
  `;

  const connection = await mysql.createConnection(dbConfig);
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.resolve(__dirname, `../tmp/cloudinary-to-cloudflare-report-${now}.json`);

  try {
    const [rows] = await connection.query(sql, params);
    const allRows = Array.isArray(rows) ? rows : [];
    const cloudinaryRows = allRows.filter((row) => isCloudinaryUrl(row.url));

    console.log(`Scanned rows: ${allRows.length}`);
    console.log(`Cloudinary rows: ${cloudinaryRows.length}`);
    if (cloudinaryRows.length === 0) {
      console.log('Nothing to migrate.');
      return;
    }

    const updates = [];
    const failures = [];

    for (let i = 0; i < cloudinaryRows.length; i += 1) {
      const row = cloudinaryRows[i];
      const label = `[${i + 1}/${cloudinaryRows.length}] row=${row.id} bien=${row.bien_id}`;
      try {
        const downloaded = await tryFetchCloudinaryAsset(String(row.url || '').trim(), cloudinaryCreds);
        const fallbackName = `media_${String(row.id || '').trim() || i + 1}.jpg`;
        const fileName = getFileNameFromUrl(String(row.url || '').trim(), fallbackName);
        const cloudflareUrl = await uploadBytesToCloudflareImage(
          downloaded.bytes,
          fileName,
          downloaded.contentType,
          cloudflareConfig
        );
        updates.push({
          id: String(row.id),
          bien_id: row.bien_id,
          old_url: row.url,
          new_url: cloudflareUrl,
          fetched_via: downloaded.via,
        });
        console.log(`${label} -> OK (${downloaded.via})`);
      } catch (error) {
        failures.push({
          id: String(row.id),
          bien_id: row.bien_id,
          old_url: row.url,
          error: error?.message || String(error),
        });
        console.log(`${label} -> FAIL: ${error?.message || error}`);
      }
    }

    const report = {
      created_at: new Date().toISOString(),
      mode: dryRun ? 'dry-run' : 'apply',
      totals: {
        scanned: allRows.length,
        cloudinary: cloudinaryRows.length,
        updated: updates.length,
        failed: failures.length,
      },
      updates,
      failures,
    };

    require('fs').mkdirSync(path.dirname(reportPath), { recursive: true });
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Report: ${reportPath}`);
    console.log(`Updated candidates: ${updates.length} | Failed: ${failures.length}`);

    if (dryRun || updates.length === 0) {
      console.log(dryRun ? 'Dry-run finished. No DB changes made.' : 'No successful uploads to apply.');
      return;
    }

    await connection.beginTransaction();
    try {
      for (const item of updates) {
        await connection.query('UPDATE media SET url = ? WHERE id = ?', [item.new_url, item.id]);
      }
      await connection.commit();
      console.log(`DB updated rows: ${updates.length}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error?.message || error}`);
  process.exit(1);
});

