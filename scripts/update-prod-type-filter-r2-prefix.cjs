const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
  });

  const updates = [
    ['location_saisonniere__autre____main__', 'https://pub-5bcc4bf8ad794dcf9f62544b15095530.r2.dev/biens/filter-type-main/images/autre-26cbb2bc48.png'],
    ['location_saisonniere__villa_maison____main__', 'https://pub-5bcc4bf8ad794dcf9f62544b15095530.r2.dev/biens/filter-type-main/images/villa_maison-76e52d013a.png'],
    ['tfi_location_saisonniere_appartement_1780163016442_967', 'https://pub-5bcc4bf8ad794dcf9f62544b15095530.r2.dev/biens/filter-type-main/images/appartement-cd45804b42.png'],
    ['tfi_location_saisonniere_immeuble_1780163016480_297', 'https://pub-5bcc4bf8ad794dcf9f62544b15095530.r2.dev/biens/filter-type-main/images/immeuble-d1d6cb9b64.png'],
    ['tfi_location_saisonniere_studio_1780163016476_425', 'https://pub-5bcc4bf8ad794dcf9f62544b15095530.r2.dev/biens/filter-type-main/images/studio-a1dbc3ccc5.png'],
  ];

  try {
    for (const [id, url] of updates) {
      await conn.query(
        'UPDATE type_filter_images SET image_url = ?, updated_at = NOW() WHERE id = ?',
        [url, id]
      );
    }

    const [rows] = await conn.query(
      `SELECT id, image_url
       FROM type_filter_images
       WHERE id IN (
         'location_saisonniere__autre____main__',
         'location_saisonniere__villa_maison____main__',
         'tfi_location_saisonniere_appartement_1780163016442_967',
         'tfi_location_saisonniere_immeuble_1780163016480_297',
         'tfi_location_saisonniere_studio_1780163016476_425'
       )
       ORDER BY id`
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
