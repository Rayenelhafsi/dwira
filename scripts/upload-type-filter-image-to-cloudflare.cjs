const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || String(next).startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function getDbConfig(useSite) {
  return {
    host: useSite ? (process.env.SITE_DB_HOST || process.env.VPS_DB_HOST || '127.0.0.1') : (process.env.DB_HOST || '127.0.0.1'),
    port: Number(useSite ? (process.env.SITE_DB_PORT || process.env.VPS_DB_PORT || 3306) : (process.env.DB_PORT || 3306)),
    user: useSite ? (process.env.SITE_DB_USER || process.env.VPS_DB_USER || '') : (process.env.DB_USER || ''),
    password: useSite ? (process.env.SITE_DB_PASSWORD || process.env.VPS_DB_PASSWORD || '') : (process.env.DB_PASSWORD || ''),
    database: useSite ? (process.env.SITE_DB_NAME || process.env.VPS_DB_NAME || '') : (process.env.DB_NAME || ''),
  };
}

function getCloudflareHeaders() {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }
  return {
    Authorization: `Bearer ${apiToken}`,
  };
}

async function uploadToCloudflareImage(localFilePath, filename, folderKey, uploadScope) {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const variant = String(process.env.CLOUDFLARE_IMAGES_VARIANT || 'public').trim() || 'public';
  const requireSigned = String(process.env.CLOUDFLARE_IMAGES_REQUIRE_SIGNED_URLS || '').trim().toLowerCase() === 'true';
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/images/v1`;
  const fileBuffer = await fs.promises.readFile(localFilePath);
  const blob = new Blob([fileBuffer]);
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('requireSignedURLs', requireSigned ? 'true' : 'false');
  form.append('metadata', JSON.stringify({
    folderKey,
    scope: uploadScope,
    originalFilename: filename,
  }));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getCloudflareHeaders(),
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.map?.((item) => item?.message).filter(Boolean).join(' | ')
      || payload?.messages?.map?.((item) => item?.message).filter(Boolean).join(' | ')
      || `Cloudflare upload failed (${response.status})`;
    throw new Error(message);
  }

  const result = payload?.result || {};
  const variants = Array.isArray(result?.variants) ? result.variants : [];
  const preferredVariant = variants.find((url) => {
    try {
      const parsed = new URL(String(url || '').trim());
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] === variant;
    } catch {
      return false;
    }
  });
  const imageUrl = String(preferredVariant || variants[0] || '').trim();
  if (!imageUrl) {
    throw new Error('Cloudflare upload returned no delivery URL');
  }
  return {
    imageUrl,
    imageId: String(result?.id || '').trim() || null,
    variants,
  };
}

async function upsertTypeFilterImage({ useSite, mode, mainType, subType, imageUrl }) {
  const conn = await mysql.createConnection(getDbConfig(useSite));
  try {
    const normalizedMode = String(mode || '').trim();
    const normalizedMainType = String(mainType || '').trim().toLowerCase();
    const normalizedSubType = String(subType || '').trim() || null;
    const id = `${normalizedMode}__${normalizedMainType}__${normalizedSubType ? normalizedSubType.toLowerCase() : '__main__'}`;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await conn.query(
      `INSERT INTO type_filter_images (id, mode_bien, main_type, sub_type, image_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), updated_at = VALUES(updated_at)`,
      [id, normalizedMode, normalizedMainType, normalizedSubType, imageUrl, now, now]
    );
    const [rows] = await conn.query(
      `SELECT id, mode_bien, main_type, sub_type, image_url
       FROM type_filter_images
       WHERE id = ?`,
      [id]
    );
    return rows?.[0] || null;
  } finally {
    await conn.end();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const imagePath = path.resolve(String(args.file || '').trim());
  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const mode = String(args.mode || 'location_saisonniere').trim();
  const mainType = String(args.mainType || args.main_type || 'residence').trim();
  const subType = args.subType || args.sub_type || '';
  const uploadScope = String(args.scope || 'type_filter').trim();
  const folderKey = String(args.folderKey || args.folder_key || `${mode}-${mainType}${subType ? `-${subType}` : '-main'}`).trim();
  const useSite = String(args.db || process.env.DB_SOURCE || '').trim().toLowerCase() === 'site';
  const filename = path.basename(imagePath);

  const uploaded = await uploadToCloudflareImage(imagePath, filename, folderKey, uploadScope);
  const row = await upsertTypeFilterImage({
    useSite,
    mode,
    mainType,
    subType,
    imageUrl: uploaded.imageUrl,
  });

  console.log(JSON.stringify({
    uploaded,
    row,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
