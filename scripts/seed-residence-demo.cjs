const mysql = require('mysql2/promise');
require('dotenv').config();

function getDbConfig() {
  const source = String(process.env.DB_SOURCE || 'local').trim().toLowerCase();
  const useSite = source === 'site' || source === 'production';
  return {
    host: useSite ? (process.env.SITE_DB_HOST || process.env.VPS_DB_HOST || '127.0.0.1') : (process.env.DB_HOST || '127.0.0.1'),
    port: Number(useSite ? (process.env.SITE_DB_PORT || process.env.VPS_DB_PORT || 3306) : (process.env.DB_PORT || 3306)),
    user: useSite ? (process.env.SITE_DB_USER || process.env.VPS_DB_USER || '') : (process.env.DB_USER || ''),
    password: useSite ? (process.env.SITE_DB_PASSWORD || process.env.VPS_DB_PASSWORD || '') : (process.env.DB_PASSWORD || ''),
    database: useSite ? (process.env.SITE_DB_NAME || process.env.VPS_DB_NAME || '') : (process.env.DB_NAME || ''),
  };
}

function buildNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function getTableColumns(conn, tableName) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
  return new Set(rows.map((row) => String(row.Field || '').trim()).filter(Boolean));
}

async function upsertBien(conn, availableColumns, payload) {
  const filteredEntries = Object.entries(payload).filter(([key]) => availableColumns.has(key));
  const columns = filteredEntries.map(([key]) => key);
  const values = filteredEntries.map(([, value]) => value);
  const placeholders = columns.map(() => '?').join(', ');
  const updateClause = columns
    .filter((column) => column !== 'id' && column !== 'created_at' && column !== 'date_ajout')
    .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
    .join(', ');
  await conn.query(
    `INSERT INTO biens (${columns.map((column) => `\`${column}\``).join(', ')})
     VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE ${updateClause}`,
    values
  );
}

async function upsertGeneric(conn, tableName, availableColumns, uniqueIgnoreColumns, payload) {
  const filteredEntries = Object.entries(payload).filter(([key]) => availableColumns.has(key));
  const columns = filteredEntries.map(([key]) => key);
  const values = filteredEntries.map(([, value]) => value);
  const placeholders = columns.map(() => '?').join(', ');
  const updateClause = columns
    .filter((column) => !uniqueIgnoreColumns.includes(column))
    .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
    .join(', ');
  const effectiveUpdateClause = updateClause || `\`${columns[0]}\` = \`${columns[0]}\``;
  await conn.query(
    `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')})
     VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE ${effectiveUpdateClause}`,
    values
  );
}

async function getFeatureIds(conn) {
  const [rows] = await conn.query(
    `SELECT DISTINCT c.id
      FROM caracteristiques c
       INNER JOIN caracteristique_contextes cc ON cc.caracteristique_id = c.id
      WHERE cc.mode_bien = 'location_saisonniere'
        AND cc.type_bien = 'appartement'
      ORDER BY c.id ASC
      LIMIT 4`
  );
  return rows.map((row) => String(row.id || '').trim()).filter(Boolean);
}

async function getMediaUrls(conn) {
  const [rows] = await conn.query(
    `SELECT m.url
       FROM media m
       INNER JOIN biens b ON b.id = m.bien_id
      WHERE b.mode = 'location_saisonniere'
        AND b.type = 'appartement'
        AND m.type = 'image'
        AND m.url IS NOT NULL
        AND m.url <> ''
      ORDER BY m.id DESC
      LIMIT 6`
  );
  const urls = rows.map((row) => String(row.url || '').trim()).filter(Boolean);
  if (urls.length > 0) return urls;
  return [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
  ];
}

async function main() {
  const conn = await mysql.createConnection(getDbConfig());
  const now = buildNow();
  try {
    const bienColumns = await getTableColumns(conn, 'biens');
    const mediaColumns = await getTableColumns(conn, 'media');
    const pricingColumns = await getTableColumns(conn, 'bien_pricing_periods');
    const unavailableColumns = await getTableColumns(conn, 'unavailable_dates');
    const bienCaracteristiqueColumns = await getTableColumns(conn, 'bien_caracteristiques');
    const [zoneRows] = await conn.query(
      `SELECT id, nom FROM zones WHERE LOWER(nom) = 'ain grenz' ORDER BY id ASC LIMIT 1`
    );
    const [ownerRows] = await conn.query(
      `SELECT id, nom FROM proprietaires WHERE LOWER(nom) LIKE '%ahmed ben ali%' ORDER BY id ASC LIMIT 1`
    );
    const [fallbackZoneRows] = zoneRows.length ? [zoneRows] : await conn.query(`SELECT id, nom FROM zones ORDER BY id ASC LIMIT 1`);
    const [fallbackOwnerRows] = ownerRows.length ? [ownerRows] : await conn.query(`SELECT id, nom FROM proprietaires ORDER BY id ASC LIMIT 1`);
    const zone = (zoneRows.length ? zoneRows : fallbackZoneRows)[0];
    const owner = (ownerRows.length ? ownerRows : fallbackOwnerRows)[0];
    if (!zone) throw new Error('Aucune zone disponible');
    if (!owner) throw new Error('Aucun proprietaire disponible');

    const featureIds = await getFeatureIds(conn);
    const mediaUrls = await getMediaUrls(conn);

    const parentId = 'res_demo_parent';
    const parentTitle = 'Residence Demo Codex';
    const parentReference = 'REF-LOCSAISONNIERE-RES-ANN900-R1';
    const units = [
      {
        id: 'res_unit_s1',
        sub_type: 'S+1',
        quantity: 2,
        apartment_names: ['Residence Demo Codex - S+1 A1', 'Residence Demo Codex - S+1 A2'],
        apartment_references: ['REF-LOCSAISONNIERE-APP-ANN900-A1', 'REF-LOCSAISONNIERE-APP-ANN900-A2'],
        apartments: [
          {
            name: 'Residence Demo Codex - S+1 A1',
            reference: 'REF-LOCSAISONNIERE-APP-ANN900-A1',
            nom_bien_mobile: 'Residence Demo Codex S+1 A1',
            description: 'Appartement S+1 dans la Residence Demo Codex.',
            proprietaire_id: owner.id,
            unavailable_dates: [{ start: '2026-07-10', end: '2026-07-15', status: 'blocked' }],
          },
          {
            name: 'Residence Demo Codex - S+1 A2',
            reference: 'REF-LOCSAISONNIERE-APP-ANN900-A2',
            nom_bien_mobile: 'Residence Demo Codex S+1 A2',
            description: 'Appartement S+1 dans la Residence Demo Codex.',
            proprietaire_id: owner.id,
            unavailable_dates: [{ start: '2026-07-18', end: '2026-07-22', status: 'blocked' }],
          },
        ],
        pricing_periods: [
          { start: '2026-06-15', end: '2026-09-15', prix_nuitee: 180, prix_semaine: 1100, minimum_nuitees: 3, scope: 'global' },
        ],
        feature_ids: featureIds,
      },
      {
        id: 'res_unit_s2',
        sub_type: 'S+2',
        quantity: 1,
        apartment_names: ['Residence Demo Codex - S+2 A1'],
        apartment_references: ['REF-LOCSAISONNIERE-APP-ANN900-A3'],
        apartments: [
          {
            name: 'Residence Demo Codex - S+2 A1',
            reference: 'REF-LOCSAISONNIERE-APP-ANN900-A3',
            nom_bien_mobile: 'Residence Demo Codex S+2 A1',
            description: 'Appartement S+2 dans la Residence Demo Codex.',
            proprietaire_id: owner.id,
            unavailable_dates: [{ start: '2026-08-01', end: '2026-08-09', status: 'blocked' }],
          },
        ],
        pricing_periods: [
          { start: '2026-06-15', end: '2026-09-15', prix_nuitee: 260, prix_semaine: 1650, minimum_nuitees: 3, scope: 'global' },
        ],
        feature_ids: featureIds,
      },
    ];

    await upsertBien(conn, bienColumns, {
      id: parentId,
      reference: parentReference,
      titre: parentTitle,
      nom_bien_mobile: parentTitle,
      description: 'Residence de test creee automatiquement avec appartements enfants, images, caracteristiques et calendriers.',
      mode: 'location_saisonniere',
      type: 'residence',
      statut: 'disponible',
      visible_sur_site: 1,
      is_featured: 0,
      zone_id: zone.id,
      proprietaire_id: owner.id,
      prix_nuitee: 0,
      prix_semaine: 0,
      nb_chambres: 0,
      nb_salle_bain: 0,
      configuration: null,
      avance: 0,
      caution: 0,
      residence_parent_bien_id: null,
      residence_parent_name: null,
      residence_unit_key: null,
      residence_unit_sub_type: null,
      residence_units_json: JSON.stringify(units),
      date_ajout: now.slice(0, 10),
      created_at: now,
      updated_at: now,
      admin_last_saved_at: now,
    });

    await conn.query(`DELETE FROM media WHERE bien_id IN ('res_demo_s1_1','res_demo_s1_2','res_demo_s2_1')`);
    await conn.query(`DELETE FROM bien_caracteristiques WHERE bien_id IN ('res_demo_s1_1','res_demo_s1_2','res_demo_s2_1')`);
    await conn.query(`DELETE FROM bien_pricing_periods WHERE bien_id IN ('res_demo_s1_1','res_demo_s1_2','res_demo_s2_1')`);
    await conn.query(`DELETE FROM unavailable_dates WHERE bien_id IN ('res_demo_s1_1','res_demo_s1_2','res_demo_s2_1')`);

    const children = [
      {
        id: 'res_demo_s1_1',
        title: 'Residence Demo Codex - S+1 A1',
        reference: 'REF-LOCSAISONNIERE-APP-ANN900-A1',
        subType: 'S+1',
        nightly: 180,
        weekly: 1100,
        blockedStart: '2026-07-10',
        blockedEnd: '2026-07-15',
      },
      {
        id: 'res_demo_s1_2',
        title: 'Residence Demo Codex - S+1 A2',
        reference: 'REF-LOCSAISONNIERE-APP-ANN900-A2',
        subType: 'S+1',
        nightly: 180,
        weekly: 1100,
        blockedStart: '2026-07-18',
        blockedEnd: '2026-07-22',
      },
      {
        id: 'res_demo_s2_1',
        title: 'Residence Demo Codex - S+2 A1',
        reference: 'REF-LOCSAISONNIERE-APP-ANN900-A3',
        subType: 'S+2',
        nightly: 260,
        weekly: 1650,
        blockedStart: '2026-08-01',
        blockedEnd: '2026-08-09',
      },
    ];

    for (const child of children) {
      const bedrooms = child.subType === 'S+2' ? 2 : 1;
      await upsertBien(conn, bienColumns, {
        id: child.id,
        reference: child.reference,
        titre: child.title,
        nom_bien_mobile: child.title,
        description: `Appartement ${child.subType} rattache a ${parentTitle}.`,
        mode: 'location_saisonniere',
        type: 'appartement',
        statut: 'disponible',
        visible_sur_site: 1,
        is_featured: 0,
        zone_id: zone.id,
        proprietaire_id: owner.id,
        prix_nuitee: child.nightly,
        prix_semaine: child.weekly,
        nb_chambres: bedrooms,
        nb_salle_bain: 1,
        configuration: child.subType,
        avance: 300,
        caution: 0,
        residence_parent_bien_id: parentId,
        residence_parent_name: parentTitle,
        residence_unit_key: `unit_${child.id}`,
        residence_unit_sub_type: child.subType,
        residence_units_json: null,
        date_ajout: now.slice(0, 10),
        created_at: now,
        updated_at: now,
        admin_last_saved_at: now,
      });

      for (let i = 0; i < mediaUrls.length; i += 1) {
        await upsertGeneric(conn, 'media', mediaColumns, ['id', 'created_at'], {
          id: `${child.id}_media_${i + 1}`,
          bien_id: child.id,
          url: mediaUrls[i],
          type: 'image',
          created_at: now,
        });
      }

      for (const featureId of featureIds) {
        await upsertGeneric(conn, 'bien_caracteristiques', bienCaracteristiqueColumns, ['bien_id', 'caracteristique_id', 'created_at'], {
          bien_id: child.id,
          caracteristique_id: featureId,
          valeur: null,
          created_at: now,
          updated_at: now,
        });
      }

      await upsertGeneric(conn, 'bien_pricing_periods', pricingColumns, ['id', 'created_at'], {
        id: `${child.id}_summer_2026`,
        bien_id: child.id,
        start_date: '2026-06-15',
        end_date: '2026-09-15',
        prix_nuitee: child.nightly,
        prix_semaine: child.weekly,
        minimum_nuitees: 3,
        checkin_jour: null,
        checkout_jour: null,
        scope: 'global',
        amicale_id: null,
        created_at: now,
        updated_at: now,
      });

      await upsertGeneric(conn, 'unavailable_dates', unavailableColumns, ['id', 'created_at'], {
        id: `${child.id}_blocked_1`,
        bien_id: child.id,
        start_date: child.blockedStart,
        end_date: child.blockedEnd,
        status: 'blocked',
        created_at: now,
        updated_at: now,
      });
    }

    const [rows] = await conn.query(
      `SELECT id, titre, reference, type, mode, residence_parent_bien_id, residence_parent_name, residence_unit_sub_type
         FROM biens
        WHERE id = 'res_demo_parent' OR residence_parent_bien_id = 'res_demo_parent'
        ORDER BY id ASC`
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
