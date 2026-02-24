const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

const MODE_REFERENCE_CODES = {
  vente: 'VENTE',
  location_annuelle: 'LOCANNUELLE',
  location_saisonniere: 'LOCSAISONNIERE',
};

const TYPE_REFERENCE_CODES = {
  appartement: 'APP',
  villa_maison: 'VILLA',
  studio: 'STU',
  immeuble: 'IMM',
  terrain: 'TER',
  lotissement: 'LOT',
  local_commercial: 'LCOM',
  bungalow: 'BUN',
  S1: 'APP',
  S2: 'APP',
  S3: 'APP',
  S4: 'APP',
  villa: 'VILLA',
  local: 'LOC',
};

const TYPE_UNIT_PREFIX = {
  appartement: 'A',
  villa_maison: 'V',
  studio: 'S',
  immeuble: 'I',
  terrain: 'T',
  lotissement: 'L',
  local_commercial: 'C',
  bungalow: 'B',
  S1: 'A',
  S2: 'A',
  S3: 'A',
  S4: 'A',
  villa: 'V',
  local: 'C',
};

function normalizeAnnonceKey(titre, zoneId, proprietaireId) {
  const normalizedTitle = String(titre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${normalizedTitle}__${String(zoneId || '')}__${String(proprietaireId || '')}`;
}

function buildChildReference(baseReference, prefix, index) {
  return `${String(baseReference).trim().toUpperCase()}-${prefix}${index}`;
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const env = { ...readEnvFile(path.join(root, '.env')), ...process.env };
  const connection = await mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || 'root',
    database: env.DB_NAME || 'dwira',
  });

  const [rows] = await connection.query(
    `SELECT id, mode, type, titre, zone_id, proprietaire_id, reference, immeuble_details_json, immeuble_appartements_json, lotissement_terrains_json
     FROM biens
     ORDER BY mode ASC, type ASC, date_ajout ASC, created_at ASC, id ASC`
  );

  const annCounters = new Map();
  const annByAnnonceKey = new Map();
  const unitByAnnonceKey = new Map();
  const updates = [];

  for (const row of rows) {
    const mode = String(row.mode || 'location_saisonniere');
    const type = String(row.type || 'appartement');
    const modeCode = MODE_REFERENCE_CODES[mode] || 'MODE';
    const typeCode = TYPE_REFERENCE_CODES[type] || 'TYPE';
    const unitPrefix = TYPE_UNIT_PREFIX[type] || 'U';
    const groupKey = `${mode}|${type}`;
    const annonceKey = `${groupKey}|${normalizeAnnonceKey(row.titre, row.zone_id, row.proprietaire_id)}`;

    const nextAnn = (annCounters.get(groupKey) || 0) + 1;
    const annNumber = annByAnnonceKey.has(annonceKey) ? annByAnnonceKey.get(annonceKey) : nextAnn;
    if (!annByAnnonceKey.has(annonceKey)) {
      annByAnnonceKey.set(annonceKey, annNumber);
      annCounters.set(groupKey, annNumber);
    }

    const unitKey = `${annonceKey}|${unitPrefix}`;
    const unitNumber = (unitByAnnonceKey.get(unitKey) || 0) + 1;
    unitByAnnonceKey.set(unitKey, unitNumber);

    const newReference = `REF-${modeCode}-${typeCode}-ANN${annNumber}-${unitPrefix}${unitNumber}`;

    let immeubleAppartementsJson = row.immeuble_appartements_json || null;
    let immeubleDetailsJson = row.immeuble_details_json || null;
    let lotissementTerrainsJson = row.lotissement_terrains_json || null;

    const appartements = toArray(row.immeuble_appartements_json).map((item, idx) => ({
      ...(item || {}),
      index: idx + 1,
      reference: buildChildReference(newReference, 'APT', idx + 1),
    }));
    if (appartements.length > 0) {
      immeubleAppartementsJson = safeJsonStringify(appartements);
    }

    const details = row.immeuble_details_json ? (() => {
      try { return JSON.parse(row.immeuble_details_json); } catch { return null; }
    })() : null;
    if (details && typeof details === 'object') {
      const garages = Array.isArray(details.garages) ? details.garages : [];
      const locaux = Array.isArray(details.locaux_commerciaux) ? details.locaux_commerciaux : [];
      details.garages = garages.map((item, idx) => ({
        ...(item || {}),
        index: idx + 1,
        reference: buildChildReference(newReference, 'GAR', idx + 1),
      }));
      details.locaux_commerciaux = locaux.map((item, idx) => ({
        ...(item || {}),
        index: idx + 1,
        reference: buildChildReference(newReference, 'LOC', idx + 1),
      }));
      immeubleDetailsJson = safeJsonStringify(details);
    }

    const terrains = toArray(row.lotissement_terrains_json).map((item, idx) => ({
      ...(item || {}),
      index: idx + 1,
      reference: buildChildReference(newReference, 'TRN', idx + 1),
    }));
    if (terrains.length > 0) {
      lotissementTerrainsJson = safeJsonStringify(terrains);
    }

    updates.push({
      id: row.id,
      oldReference: row.reference,
      newReference,
      immeubleAppartementsJson,
      immeubleDetailsJson,
      lotissementTerrainsJson,
    });
  }

  await connection.beginTransaction();
  try {
    // Temporary references to avoid unique collisions during bulk rename.
    for (const item of updates) {
      await connection.query('UPDATE biens SET reference = ? WHERE id = ?', [`TMP-${item.id}`, item.id]);
    }

    for (const item of updates) {
      await connection.query(
        `UPDATE biens
         SET reference = ?, immeuble_appartements_json = ?, immeuble_details_json = ?, lotissement_terrains_json = ?
         WHERE id = ?`,
        [item.newReference, item.immeubleAppartementsJson, item.immeubleDetailsJson, item.lotissementTerrainsJson, item.id]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  console.log(`Normalization terminee. Lignes traitees: ${updates.length}`);
  await connection.end();
}

main().catch((error) => {
  console.error('Echec normalisation references:', error.message);
  process.exit(1);
});
