const mysql = require('mysql2/promise');

const PROD_API_URL = process.env.PROD_API_URL || 'https://dwiraimmobilier.com/api/type-filter-images';

function getDbConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dwira',
  };
}

function nowSql(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

(async () => {
  const response = await fetch(PROD_API_URL);
  if (!response.ok) {
    throw new Error(`Echec fetch prod ${response.status} sur ${PROD_API_URL}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error('Payload prod invalide pour type-filter-images');
  }

  const conn = await mysql.createConnection(getDbConfig());
  const timestamp = nowSql();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM type_filter_images WHERE mode_bien = 'location_saisonniere'");

    for (const row of rows) {
      if (String(row.mode_bien || '').trim() !== 'location_saisonniere') continue;
      await conn.query(
        `INSERT INTO type_filter_images (
          id, mode_bien, main_type, sub_type, image_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.id || '').trim(),
          'location_saisonniere',
          String(row.main_type || '').trim(),
          row.sub_type === null || row.sub_type === undefined || String(row.sub_type).trim() === '' ? null : String(row.sub_type).trim(),
          String(row.image_url || '').trim(),
          timestamp,
          timestamp,
        ]
      );
    }

    await conn.commit();
    console.log(`type_filter_images synchronisees: ${rows.length} lignes source`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
