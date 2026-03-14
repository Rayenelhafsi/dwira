const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TABLES = [
  'caracteristiques',
  'caracteristique_onglets',
  'caracteristique_contextes',
  'modifier_onglets',
];

const BIEN_LINK_TABLE = 'bien_caracteristiques';

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    dryRun: flags.has('--dry-run'),
    skipBienLinks: flags.has('--skip-bien-links'),
  };
}

function getDbConfig(prefix) {
  const host = process.env[`${prefix}_HOST`];
  const port = Number(process.env[`${prefix}_PORT`] || 3306);
  const user = process.env[`${prefix}_USER`];
  const password = process.env[`${prefix}_PASSWORD`];
  const database = process.env[`${prefix}_NAME`];

  if (!host || !user || typeof password === 'undefined' || !database) {
    throw new Error(
      `Missing DB config for prefix ${prefix}. Expected ${prefix}_HOST, ${prefix}_PORT, ${prefix}_USER, ${prefix}_PASSWORD, ${prefix}_NAME`
    );
  }

  return {
    host,
    port,
    user,
    password,
    database,
    multipleStatements: false,
  };
}

function quoteId(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function valueToSql(value) {
  if (value === null || typeof value === 'undefined') return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  return mysql.escape(value);
}

function buildUpsertSql(tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map(quoteId).join(', ');
  const valuesSql = rows
    .map((row) => `(${columns.map((column) => valueToSql(row[column])).join(', ')})`)
    .join(',\n');
  const updateSql = columns
    .map((column) => `${quoteId(column)} = VALUES(${quoteId(column)})`)
    .join(', ');

  return `INSERT INTO ${quoteId(tableName)} (${quotedColumns})
VALUES
${valuesSql}
ON DUPLICATE KEY UPDATE ${updateSql}`;
}

async function fetchAllRows(connection, tableName) {
  const [rows] = await connection.query(`SELECT * FROM ${quoteId(tableName)}`);
  return Array.isArray(rows) ? rows : [];
}

async function fetchMatchingBienLinkRows(sourceConnection, localConnection) {
  const [localBiens] = await localConnection.query('SELECT id FROM biens');
  const bienIds = Array.isArray(localBiens) ? localBiens.map((row) => String(row.id || '').trim()).filter(Boolean) : [];
  if (bienIds.length === 0) return [];

  const chunkSize = 500;
  const matchedRows = [];

  for (let i = 0; i < bienIds.length; i += chunkSize) {
    const chunk = bienIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(', ');
    const [rows] = await sourceConnection.query(
      `SELECT * FROM ${quoteId(BIEN_LINK_TABLE)} WHERE bien_id IN (${placeholders})`,
      chunk
    );
    if (Array.isArray(rows) && rows.length > 0) {
      matchedRows.push(...rows);
    }
  }

  return matchedRows;
}

async function applyUpserts(connection, tableName, rows, dryRun) {
  if (!rows.length) {
    console.log(`- ${tableName}: 0 rows`);
    return 0;
  }

  console.log(`- ${tableName}: ${rows.length} rows`);
  if (dryRun) return rows.length;

  const sql = buildUpsertSql(tableName, rows);
  await connection.query(sql);
  return rows.length;
}

async function main() {
  const { dryRun, skipBienLinks } = parseArgs(process.argv);
  const sourceConfig = getDbConfig('VPS_DB');
  const localConfig = getDbConfig('DB');

  let sourceConnection;
  let localConnection;

  try {
    sourceConnection = await mysql.createConnection(sourceConfig);
    localConnection = await mysql.createConnection(localConfig);

    console.log(`Source DB: ${sourceConfig.host}:${sourceConfig.port}/${sourceConfig.database}`);
    console.log(`Local DB: ${localConfig.host}:${localConfig.port}/${localConfig.database}`);
    console.log(dryRun ? 'Mode: dry-run' : 'Mode: apply');

    const tableRows = new Map();
    for (const tableName of TABLES) {
      tableRows.set(tableName, await fetchAllRows(sourceConnection, tableName));
    }

    const bienLinkRows = skipBienLinks
      ? []
      : await fetchMatchingBienLinkRows(sourceConnection, localConnection);

    if (!dryRun) {
      await localConnection.beginTransaction();
    }

    for (const tableName of TABLES) {
      await applyUpserts(localConnection, tableName, tableRows.get(tableName) || [], dryRun);
    }

    if (!skipBienLinks) {
      await applyUpserts(localConnection, BIEN_LINK_TABLE, bienLinkRows, dryRun);
    } else {
      console.log(`- ${BIEN_LINK_TABLE}: skipped`);
    }

    if (!dryRun) {
      await localConnection.commit();
    }

    console.log('Sync completed successfully.');
  } catch (error) {
    if (localConnection && !dryRun) {
      try {
        await localConnection.rollback();
      } catch {
        // Ignore rollback failure and surface the original error.
      }
    }
    console.error('Sync failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (sourceConnection) await sourceConnection.end();
    if (localConnection) await localConnection.end();
  }
}

main();
