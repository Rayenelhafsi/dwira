const mysql = require('mysql2/promise');

const PROD_API_BASE = process.env.PROD_API_BASE || 'https://dwiraimmobilier.com/api';

function nowSql(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getDbConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dwira',
  };
}

function chunk(array, size) {
  const out = [];
  for (let index = 0; index < array.length; index += size) {
    out.push(array.slice(index, index + size));
  }
  return out;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Echec fetch ${response.status} sur ${url}`);
  }
  return response.json();
}

function sqlPlaceholders(columns) {
  return columns.map(() => '?').join(', ');
}

function sqlUpdateAssignments(columns) {
  return columns.map((column) => `${column}=VALUES(${column})`).join(', ');
}

function rowValues(columns, row) {
  return columns.map((column) => {
    const value = row[column];
    if (value === undefined) return null;
    return value;
  });
}

(async () => {
  const timestamp = nowSql();
  const [zones, biens] = await Promise.all([
    fetchJson(`${PROD_API_BASE}/zones`),
    fetchJson(`${PROD_API_BASE}/biens`),
  ]);

  if (!Array.isArray(zones) || !Array.isArray(biens)) {
    throw new Error('Payload prod invalide pour zones ou biens');
  }

  const bienIds = biens.map((bien) => String(bien.id || '').trim()).filter(Boolean);
  const ownerIds = Array.from(new Set(
    biens.map((bien) => String(bien.proprietaire_id || '').trim()).filter(Boolean)
  ));

  const mediaRows = [];
  for (const idsChunk of chunk(bienIds, 25)) {
    const mediaChunk = await fetchJson(`${PROD_API_BASE}/media-bulk?bien_ids=${encodeURIComponent(idsChunk.join(','))}`);
    if (Array.isArray(mediaChunk)) mediaRows.push(...mediaChunk);
  }

  const unavailableRows = [];
  const pricingRows = [];
  for (const bienId of bienIds) {
    const [unavailableDates, pricingPeriods] = await Promise.all([
      fetchJson(`${PROD_API_BASE}/unavailable-dates/${encodeURIComponent(bienId)}`),
      fetchJson(`${PROD_API_BASE}/pricing-periods/${encodeURIComponent(bienId)}`),
    ]);
    if (Array.isArray(unavailableDates)) {
      unavailableRows.push(
        ...unavailableDates.map((row) => ({
          id: String(row.id || '').trim(),
          bien_id: bienId,
          start_date: row.start_date || row.start || null,
          end_date: row.end_date || row.end || null,
          status: String(row.status || 'blocked').trim() || 'blocked',
          reservation_demand_id: row.reservation_demand_id ? String(row.reservation_demand_id) : null,
          color: row.color ? String(row.color) : null,
          payment_deadline: row.payment_deadline || row.paymentDeadline || null,
        })).filter((row) => row.id && row.start_date && row.end_date)
      );
    }
    if (Array.isArray(pricingPeriods)) {
      pricingRows.push(
        ...pricingPeriods.map((row) => ({
          id: String(row.id || '').trim(),
          bien_id: bienId,
          scope: String(row.scope || '').trim().toLowerCase() || 'global',
          amicale_id: row.amicale_id ? String(row.amicale_id) : null,
          start_date: row.start_date || row.start || null,
          end_date: row.end_date || row.end || null,
          prix_nuitee: row.prix_nuitee === null || row.prix_nuitee === undefined ? null : Number(row.prix_nuitee),
          prix_semaine: row.prix_semaine === null || row.prix_semaine === undefined ? null : Number(row.prix_semaine),
          minimum_nuitees: row.minimum_nuitees === null || row.minimum_nuitees === undefined ? null : Number(row.minimum_nuitees),
          checkin_jour: row.checkin_jour ? String(row.checkin_jour).toLowerCase() : null,
          checkout_jour: row.checkout_jour ? String(row.checkout_jour).toLowerCase() : null,
          created_at: row.created_at || timestamp,
          updated_at: row.updated_at || timestamp,
        })).filter((row) => row.id && row.start_date && row.end_date && Number.isFinite(row.prix_nuitee))
      );
    }
  }

  const conn = await mysql.createConnection(getDbConfig());
  try {
    const [[{ totalBefore }]] = await conn.query('SELECT COUNT(*) AS totalBefore FROM biens');
    const [zoneColumnsRows] = await conn.query('SHOW COLUMNS FROM zones');
    const [bienColumnsRows] = await conn.query('SHOW COLUMNS FROM biens');
    const [mediaColumnsRows] = await conn.query('SHOW COLUMNS FROM media');
    const [unavailableColumnsRows] = await conn.query('SHOW COLUMNS FROM unavailable_dates');
    const [pricingColumnsRows] = await conn.query('SHOW COLUMNS FROM bien_pricing_periods');

    const zoneColumns = zoneColumnsRows.map((row) => row.Field);
    const bienColumns = bienColumnsRows.map((row) => row.Field);
    const mediaColumns = mediaColumnsRows.map((row) => row.Field);
    const unavailableColumns = unavailableColumnsRows.map((row) => row.Field);
    const pricingColumns = pricingColumnsRows.map((row) => row.Field);

    await conn.beginTransaction();

    for (const ownerId of ownerIds) {
      await conn.query(
        `INSERT INTO proprietaires (id, nom, telephone, email, cin)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [ownerId, `Import prod ${ownerId}`, '', '', '']
      );
    }

    for (const zone of zones) {
      const columns = zoneColumns.filter((column) => Object.prototype.hasOwnProperty.call(zone, column));
      if (!columns.length) continue;
      await conn.query(
        `INSERT INTO zones (${columns.join(', ')})
         VALUES (${sqlPlaceholders(columns)})
         ON DUPLICATE KEY UPDATE ${sqlUpdateAssignments(columns)}`,
        rowValues(columns, zone)
      );
    }

    const [existingOwnersRows] = await conn.query('SELECT id FROM proprietaires');
    const existingOwnerIds = new Set(existingOwnersRows.map((row) => String(row.id || '').trim()).filter(Boolean));

    for (const bien of biens) {
      const normalizedBien = { ...bien };
      const ownerId = String(normalizedBien.proprietaire_id || '').trim();
      if (!ownerId || !existingOwnerIds.has(ownerId)) {
        normalizedBien.proprietaire_id = null;
      }
      const columns = bienColumns.filter((column) => Object.prototype.hasOwnProperty.call(normalizedBien, column));
      if (!columns.length) continue;
      await conn.query(
        `INSERT INTO biens (${columns.join(', ')})
         VALUES (${sqlPlaceholders(columns)})
         ON DUPLICATE KEY UPDATE ${sqlUpdateAssignments(columns)}`,
        rowValues(columns, normalizedBien)
      );
    }

    for (const idsChunk of chunk(bienIds, 50)) {
      const placeholders = idsChunk.map(() => '?').join(', ');
      await conn.query(`DELETE FROM media WHERE bien_id IN (${placeholders})`, idsChunk);
      await conn.query(`DELETE FROM unavailable_dates WHERE bien_id IN (${placeholders})`, idsChunk);
      await conn.query(`DELETE FROM bien_pricing_periods WHERE bien_id IN (${placeholders})`, idsChunk);
    }

    for (const media of mediaRows) {
      const columns = mediaColumns.filter((column) => Object.prototype.hasOwnProperty.call(media, column));
      if (!columns.length) continue;
      await conn.query(
        `INSERT INTO media (${columns.join(', ')})
         VALUES (${sqlPlaceholders(columns)})
         ON DUPLICATE KEY UPDATE ${sqlUpdateAssignments(columns)}`,
        rowValues(columns, media)
      );
    }

    for (const unavailable of unavailableRows) {
      const columns = unavailableColumns.filter((column) => Object.prototype.hasOwnProperty.call(unavailable, column));
      if (!columns.length) continue;
      await conn.query(
        `INSERT INTO unavailable_dates (${columns.join(', ')})
         VALUES (${sqlPlaceholders(columns)})
         ON DUPLICATE KEY UPDATE ${sqlUpdateAssignments(columns)}`,
        rowValues(columns, unavailable)
      );
    }

    for (const pricing of pricingRows) {
      const columns = pricingColumns.filter((column) => Object.prototype.hasOwnProperty.call(pricing, column));
      if (!columns.length) continue;
      await conn.query(
        `INSERT INTO bien_pricing_periods (${columns.join(', ')})
         VALUES (${sqlPlaceholders(columns)})
         ON DUPLICATE KEY UPDATE ${sqlUpdateAssignments(columns)}`,
        rowValues(columns, pricing)
      );
    }

    await conn.commit();

    const [[{ totalAfter }]] = await conn.query('SELECT COUNT(*) AS totalAfter FROM biens');
    const [[{ importedPresent }]] = await conn.query(
      `SELECT COUNT(*) AS importedPresent FROM biens WHERE id IN (${bienIds.map(() => '?').join(', ')})`,
      bienIds
    );

    console.log(`Import prod -> local termine.`);
    console.log(`Zones importees/upsertees: ${zones.length}`);
    console.log(`Biens importes/upsertes: ${biens.length}`);
    console.log(`Medias reimportes: ${mediaRows.length}`);
    console.log(`Indisponibilites reimportees: ${unavailableRows.length}`);
    console.log(`Periodes tarifaires reimportees: ${pricingRows.length}`);
    console.log(`Biens locaux avant: ${totalBefore} | apres: ${totalAfter}`);
    console.log(`Biens prod presents en local: ${importedPresent}/${biens.length}`);
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
