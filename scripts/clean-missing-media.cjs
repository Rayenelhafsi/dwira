const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function printHelp() {
  console.log(`
Usage:
  node scripts/clean-missing-media.cjs [--apply] [--uploads-dir <path>] [--limit <n>] [--bien-id <id>] [--include-videos]

Options:
  --apply            Apply deletion in DB (default is dry-run)
  --uploads-dir      Uploads directory path (default: ../server/uploads)
  --limit            Limit number of rows to inspect
  --bien-id          Inspect only one bien_id
  --include-videos   Also check rows with type=video
  --help             Show this help

Examples:
  node scripts/clean-missing-media.cjs
  node scripts/clean-missing-media.cjs --apply
  node scripts/clean-missing-media.cjs --apply --bien-id b123
  node scripts/clean-missing-media.cjs --uploads-dir /var/www/dwira/server/uploads --apply
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    uploadsDir: path.resolve(__dirname, '../server/uploads'),
    limit: null,
    bienId: null,
    includeVideos: false,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--apply') out.apply = true;
    else if (token === '--uploads-dir') out.uploadsDir = path.resolve(process.cwd(), String(args[++i] || ''));
    else if (token === '--limit') out.limit = Number(args[++i] || 0) || null;
    else if (token === '--bien-id') out.bienId = String(args[++i] || '').trim() || null;
    else if (token === '--include-videos') out.includeVideos = true;
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

function extractUploadsRelativePath(mediaUrl) {
  const value = String(mediaUrl || '').trim();
  if (!value) return null;

  if (value.startsWith('/uploads/')) {
    return value.replace(/^\/uploads\//, '');
  }

  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith('/uploads/')) {
      return parsed.pathname.replace(/^\/uploads\//, '');
    }
  } catch {
    return null;
  }

  return null;
}

function rowToFilePath(row, uploadsDir) {
  const relative = extractUploadsRelativePath(row.url);
  if (!relative) return null;
  const normalized = path.normalize(relative).replace(/^([/\\])+/, '');
  const absolute = path.resolve(uploadsDir, normalized);
  const uploadsRoot = path.resolve(uploadsDir);
  if (!absolute.startsWith(uploadsRoot)) return null;
  return absolute;
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }

  const dbConfig = getDbConfig();
  const dryRun = !options.apply;
  const uploadsDir = options.uploadsDir;

  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log(`DB: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  console.log(`Uploads dir: ${uploadsDir}`);

  const typeFilter = options.includeVideos ? '' : "AND type = 'image'";
  const limitClause = options.limit ? `LIMIT ${Math.max(1, Math.trunc(options.limit))}` : '';
  const bienClause = options.bienId ? 'AND bien_id = ?' : '';
  const params = [];
  if (options.bienId) params.push(options.bienId);

  const sql = `
    SELECT id, bien_id, type, url, motif_upload, position
    FROM media
    WHERE 1 = 1
      ${typeFilter}
      ${bienClause}
    ORDER BY bien_id ASC, position ASC, id ASC
    ${limitClause}
  `;

  const connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.query(sql, params);
    const mediaRows = Array.isArray(rows) ? rows : [];

    const localRows = mediaRows
      .map((row) => {
        const filePath = rowToFilePath(row, uploadsDir);
        return filePath ? { ...row, filePath } : null;
      })
      .filter(Boolean);

    const missing = localRows.filter((row) => !fs.existsSync(row.filePath));

    console.log(`Scanned rows: ${mediaRows.length}`);
    console.log(`Local uploads URLs: ${localRows.length}`);
    console.log(`Missing file rows: ${missing.length}`);

    if (missing.length > 0) {
      const byBien = new Map();
      for (const row of missing) {
        const key = String(row.bien_id || 'unknown');
        byBien.set(key, (byBien.get(key) || 0) + 1);
      }
      const summary = Array.from(byBien.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([bienId, count]) => `${bienId}:${count}`)
        .join(', ');
      console.log(`Missing by bien_id: ${summary}`);

      console.log('\nSample missing rows (max 25):');
      missing.slice(0, 25).forEach((row) => {
        console.log(`- ${row.id} | bien=${row.bien_id} | type=${row.type} | url=${row.url}`);
      });
    }

    if (dryRun || missing.length === 0) {
      console.log(dryRun ? '\nDry-run finished. No DB changes made.' : '\nNothing to delete.');
      return;
    }

    const ids = missing.map((row) => String(row.id));
    const placeholders = ids.map(() => '?').join(', ');

    await connection.beginTransaction();
    try {
      const [result] = await connection.query(
        `DELETE FROM media WHERE id IN (${placeholders})`,
        ids
      );
      await connection.commit();
      console.log(`\nDeleted media rows: ${result.affectedRows || 0}`);
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
