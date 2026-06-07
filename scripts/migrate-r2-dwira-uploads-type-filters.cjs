const mysql = require('mysql2/promise');
const {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
require('dotenv').config();

const R2_ACCOUNT_ID = String(process.env.R2_ACCOUNT_ID || '').trim();
const R2_BUCKET_NAME = String(process.env.R2_BUCKET_NAME || '').trim();
const R2_ACCESS_KEY_ID = String(process.env.R2_ACCESS_KEY_ID || '').trim();
const R2_SECRET_ACCESS_KEY = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const R2_S3_ENDPOINT = R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '';

function getDbConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
  };
}

function ensureR2Config() {
  if (!R2_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_BASE_URL) {
    throw new Error('R2 config missing');
  }
}

function buildR2Client() {
  ensureR2Config();
  return new S3Client({
    region: 'auto',
    endpoint: R2_S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

async function listObjectsByPrefix(client, prefix) {
  const collected = [];
  let continuationToken = undefined;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const entry of response.Contents || []) {
      if (entry?.Key) {
        collected.push({
          key: String(entry.Key),
          size: Number(entry.Size || 0),
        });
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return collected;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const client = buildR2Client();
  const conn = await mysql.createConnection(getDbConfig());
  try {
    const [rows] = await conn.query(
      `SELECT id, image_url
       FROM type_filter_images
       WHERE image_url LIKE ?`,
      [`${R2_PUBLIC_BASE_URL}/dwira_uploads/%`]
    );

    const mappedRows = (rows || []).map((row) => {
      const oldUrl = String(row.image_url || '').trim();
      const oldKey = oldUrl.replace(`${R2_PUBLIC_BASE_URL}/`, '');
      const filename = oldKey.split('/').filter(Boolean).pop();
      const newKey = `biens/filter-type-main/images/${filename}`;
      const newUrl = `${R2_PUBLIC_BASE_URL}/${newKey}`;
      return {
        id: String(row.id || '').trim(),
        oldUrl,
        oldKey,
        newKey,
        newUrl,
      };
    });

    const existingDwiraUploads = await listObjectsByPrefix(client, 'dwira_uploads/');
    const activeOldKeys = new Set(mappedRows.map((row) => row.oldKey));
    const activeDwiraUploadObjects = existingDwiraUploads.filter((item) => activeOldKeys.has(item.key));
    const existingBiensFilterMain = await listObjectsByPrefix(client, 'biens/filter-type-main/');

    const report = {
      apply,
      referencedRows: mappedRows,
      dwiraUploadsObjectCount: existingDwiraUploads.length,
      dwiraUploadsObjects: existingDwiraUploads,
      activeDwiraUploadObjectCount: activeDwiraUploadObjects.length,
      activeDwiraUploadObjects,
      biensFilterTypeMainObjectCount: existingBiensFilterMain.length,
      biensFilterTypeMainObjects: existingBiensFilterMain,
      copied: [],
      updatedRows: [],
      deletedKeys: [],
    };

    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    for (const row of mappedRows) {
      await client.send(new CopyObjectCommand({
        Bucket: R2_BUCKET_NAME,
        CopySource: `${R2_BUCKET_NAME}/${row.oldKey}`,
        Key: row.newKey,
      }));
      report.copied.push({ from: row.oldKey, to: row.newKey });

      await conn.query(
        `UPDATE type_filter_images
         SET image_url = ?, updated_at = NOW()
         WHERE id = ?`,
        [row.newUrl, row.id]
      );
      report.updatedRows.push({ id: row.id, image_url: row.newUrl });
    }

    const keysToDelete = activeDwiraUploadObjects.map((item) => ({ Key: item.key }));
    if (keysToDelete.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: {
          Objects: keysToDelete,
          Quiet: false,
        },
      }));
      report.deletedKeys = keysToDelete.map((item) => item.Key);
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
