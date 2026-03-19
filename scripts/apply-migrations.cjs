#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

function getDbConfig() {
  const host = String(process.env.DB_HOST || "127.0.0.1").trim();
  const port = Number(process.env.DB_PORT || 3306);
  const user = String(process.env.DB_USER || "").trim();
  const password = String(process.env.DB_PASSWORD || "").trim();
  const database = String(process.env.DB_NAME || "").trim();

  if (!user || !database) {
    throw new Error("Missing DB config. Expected DB_USER and DB_NAME in .env");
  }

  return { host, port, user, password, database, multipleStatements: true };
}

async function ensureSchemaMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function getMigrationFiles() {
  const migrationsDir = path.resolve(__dirname, "../migrations");
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`migrations directory not found: ${migrationsDir}`);
  }
  const files = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  return { migrationsDir, files };
}

async function run() {
  const db = getDbConfig();
  const { migrationsDir, files } = getMigrationFiles();
  if (files.length === 0) {
    console.log("[db:migrate] no migration files found");
    return;
  }

  const connection = await mysql.createConnection(db);
  try {
    await ensureSchemaMigrationsTable(connection);
    console.log(`[db:migrate] connected to ${db.host}:${db.port}/${db.database}`);

    let applied = 0;
    let skipped = 0;
    for (const file of files) {
      const [[row]] = await connection.query(
        "SELECT COUNT(*) AS count FROM schema_migrations WHERE migration = ?",
        [file]
      );
      if (Number(row?.count || 0) > 0) {
        skipped += 1;
        console.log(`[db:migrate] skip ${file} (already applied)`);
        continue;
      }

      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      console.log(`[db:migrate] apply ${file}`);

      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.query("INSERT INTO schema_migrations (migration) VALUES (?)", [file]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        const message = String(error?.message || "");
        const isJsonTableIncompat = /JSON_TABLE|non-string DEFAULT value for a column in a JSON_TABLE expression/i.test(message);
        if (isJsonTableIncompat) {
          console.warn(`[db:migrate] skip ${file} (incompatible with local MySQL JSON_TABLE): ${message}`);
          await connection.query("INSERT IGNORE INTO schema_migrations (migration) VALUES (?)", [file]);
          skipped += 1;
          continue;
        }
        throw new Error(`${file}: ${message}`);
      }
      applied += 1;
    }

    console.log(`[db:migrate] done (applied=${applied}, skipped=${skipped})`);
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`[db:migrate] ERROR: ${error.message}`);
  process.exit(1);
});
