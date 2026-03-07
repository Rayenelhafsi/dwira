const mysql = require('mysql2/promise');

function cfg(prefix, fallback = {}) {
  return {
    host: process.env[`${prefix}_HOST`] || fallback.host || '127.0.0.1',
    port: Number(process.env[`${prefix}_PORT`] || fallback.port || 3306),
    user: process.env[`${prefix}_USER`] || fallback.user || '',
    password: process.env[`${prefix}_PASSWORD`] || fallback.password || '',
    database: process.env[`${prefix}_NAME`] || fallback.database || '',
  };
}

function required(name, value) {
  if (!value) throw new Error(`Missing config: ${name}`);
}

async function loadSchema(conn, dbName) {
  const [tables] = await conn.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME`,
    [dbName]
  );

  const [columns] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [dbName]
  );

  const tableSet = new Set(tables.map((t) => String(t.TABLE_NAME)));
  const columnMap = new Map();
  for (const col of columns) {
    const t = String(col.TABLE_NAME);
    const arr = columnMap.get(t) || [];
    arr.push({
      name: String(col.COLUMN_NAME),
      type: String(col.COLUMN_TYPE),
      nullable: String(col.IS_NULLABLE) === 'YES',
      def: col.COLUMN_DEFAULT,
    });
    columnMap.set(t, arr);
  }

  return { tableSet, columnMap };
}

function diffSchemas(a, b, aName, bName) {
  const missingInB = [...a.tableSet].filter((t) => !b.tableSet.has(t));
  const missingInA = [...b.tableSet].filter((t) => !a.tableSet.has(t));

  const shared = [...a.tableSet].filter((t) => b.tableSet.has(t)).sort();
  const colDiffs = [];

  for (const table of shared) {
    const aCols = a.columnMap.get(table) || [];
    const bCols = b.columnMap.get(table) || [];
    const aBy = new Map(aCols.map((c) => [c.name, c]));
    const bBy = new Map(bCols.map((c) => [c.name, c]));

    const missingColsInB = aCols.filter((c) => !bBy.has(c.name)).map((c) => c.name);
    const missingColsInA = bCols.filter((c) => !aBy.has(c.name)).map((c) => c.name);

    const typeMismatches = [];
    for (const c of aCols) {
      if (!bBy.has(c.name)) continue;
      const d = bBy.get(c.name);
      if (!d) continue;
      if (c.type !== d.type || c.nullable !== d.nullable) {
        typeMismatches.push({
          column: c.name,
          [aName]: `${c.type}${c.nullable ? ' NULL' : ' NOT NULL'}`,
          [bName]: `${d.type}${d.nullable ? ' NULL' : ' NOT NULL'}`,
        });
      }
    }

    if (missingColsInB.length || missingColsInA.length || typeMismatches.length) {
      colDiffs.push({ table, missingColsInB, missingColsInA, typeMismatches });
    }
  }

  return { missingInB, missingInA, colDiffs };
}

async function loadAppliedMigrations(conn) {
  const [exists] = await conn.query("SHOW TABLES LIKE 'schema_migrations'");
  if (!exists.length) return { exists: false, migrations: [] };
  const [rows] = await conn.query('SELECT migration FROM schema_migrations ORDER BY migration');
  return { exists: true, migrations: rows.map((r) => String(r.migration)) };
}

(async () => {
  const local = cfg('LOCAL_DB', cfg('DB'));
  const remote = cfg('REMOTE_DB');

  required('LOCAL_DB_USER or DB_USER', local.user);
  required('LOCAL_DB_NAME or DB_NAME', local.database);
  required('REMOTE_DB_HOST', remote.host);
  required('REMOTE_DB_USER', remote.user);
  required('REMOTE_DB_NAME', remote.database);

  const localConn = await mysql.createConnection(local);
  const remoteConn = await mysql.createConnection(remote);

  try {
    const [localSchema, remoteSchema, localMig, remoteMig] = await Promise.all([
      loadSchema(localConn, local.database),
      loadSchema(remoteConn, remote.database),
      loadAppliedMigrations(localConn),
      loadAppliedMigrations(remoteConn),
    ]);

    const diff = diffSchemas(localSchema, remoteSchema, 'local', 'remote');

    const localMigSet = new Set(localMig.migrations);
    const remoteMigSet = new Set(remoteMig.migrations);

    const onlyLocalMigrations = localMig.migrations.filter((m) => !remoteMigSet.has(m));
    const onlyRemoteMigrations = remoteMig.migrations.filter((m) => !localMigSet.has(m));

    const result = {
      local: { host: local.host, db: local.database, tables: localSchema.tableSet.size, schemaMigrations: localMig.exists },
      remote: { host: remote.host, db: remote.database, tables: remoteSchema.tableSet.size, schemaMigrations: remoteMig.exists },
      tableDiff: {
        tablesMissingInRemote: diff.missingInB,
        tablesMissingInLocal: diff.missingInA,
      },
      columnDiffCount: diff.colDiffs.length,
      columnDiffSample: diff.colDiffs.slice(0, 25),
      migrationDiff: {
        onlyLocalMigrations,
        onlyRemoteMigrations,
      },
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await localConn.end();
    await remoteConn.end();
  }
})().catch((e) => {
  console.error(`COMPARE_DB_ERROR: ${e.message}`);
  process.exit(1);
});
