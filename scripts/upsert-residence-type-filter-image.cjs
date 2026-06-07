const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const useSite = String(process.env.DB_SOURCE || '').trim().toLowerCase() === 'site';
  const conn = await mysql.createConnection({
    host: useSite ? (process.env.SITE_DB_HOST || process.env.VPS_DB_HOST || '127.0.0.1') : (process.env.DB_HOST || '127.0.0.1'),
    port: Number(useSite ? (process.env.SITE_DB_PORT || process.env.VPS_DB_PORT || 3306) : (process.env.DB_PORT || 3306)),
    user: useSite ? (process.env.SITE_DB_USER || process.env.VPS_DB_USER || '') : (process.env.DB_USER || ''),
    password: useSite ? (process.env.SITE_DB_PASSWORD || process.env.VPS_DB_PASSWORD || '') : (process.env.DB_PASSWORD || ''),
    database: useSite ? (process.env.SITE_DB_NAME || process.env.VPS_DB_NAME || '') : (process.env.DB_NAME || ''),
  });
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const id = 'location_saisonniere__residence____main__';
    const imageUrl = '/type-filters/residence.png';
    await conn.query(
      `INSERT INTO type_filter_images (id, mode_bien, main_type, sub_type, image_url, created_at, updated_at)
       VALUES (?, 'location_saisonniere', 'residence', NULL, ?, ?, ?)
       ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), updated_at = VALUES(updated_at)`,
      [id, imageUrl, now, now]
    );
    const [rows] = await conn.query(
      `SELECT id, mode_bien, main_type, sub_type, image_url
       FROM type_filter_images
       WHERE id = ?`,
      [id]
    );
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
