const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });


const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/contracts', express.static(path.join(__dirname, 'contracts')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'dwira-api',
    authAdminRoute: '/api/auth/admin/login',
    version: 'auth-v2',
    timestamp: new Date().toISOString(),
  });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'image-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});


// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'dwira',
  waitForConnections: true,
  connectionLimit: 10
};

const pool = mysql.createPool(dbConfig);
let mediaHasPositionColumn = true;
const socialAuthSessions = new Map();
const BIEN_MODES = ['vente', 'location_annuelle', 'location_saisonniere'];
const BIEN_TYPES_BY_MODE = {
  vente: ['appartement', 'villa_maison', 'studio', 'immeuble', 'terrain', 'local_commercial'],
  location_saisonniere: ['appartement', 'villa_maison', 'bungalow', 'studio'],
  location_annuelle: ['appartement', 'local_commercial', 'villa_maison'],
};
const APPARTEMENT_VENTE_RUE_TYPES = ['piste', 'route_goudronnee', 'rue_residentielle'];
const APPARTEMENT_VENTE_PAPIER_TYPES = ['titre_foncier_individuel', 'titre_foncier_collectif', 'contrat_seulement', 'sans_papier'];
const LOCAL_COMMERCIAL_VENTE_RUE_TYPES = APPARTEMENT_VENTE_RUE_TYPES;
const LOCAL_COMMERCIAL_VENTE_PAPIER_TYPES = APPARTEMENT_VENTE_PAPIER_TYPES;
const LEGACY_TYPE_MAP = {
  S1: 'appartement',
  S2: 'appartement',
  S3: 'appartement',
  S4: 'appartement',
  villa: 'villa_maison',
  local: 'local_commercial',
};

function normalizeBienType(rawType) {
  return LEGACY_TYPE_MAP[rawType] || rawType;
}

function normalizeBienMode(rawMode) {
  if (!rawMode) return 'location_saisonniere';
  if (rawMode === 'location annuelle') return 'location_annuelle';
  if (rawMode === 'location saisonniere') return 'location_saisonniere';
  return rawMode;
}

function validateModeAndType(mode, type) {
  if (!BIEN_MODES.includes(mode)) {
    return { valid: false, error: 'mode invalide' };
  }
  const allowedTypes = BIEN_TYPES_BY_MODE[mode] || [];
  if (!allowedTypes.includes(type)) {
    return { valid: false, error: `type "${type}" non autorise pour le mode "${mode}"` };
  }
  return { valid: true };
}

function normalizeAppartementVenteDetails(mode, type, payload = {}) {
  const isAppartementVente = mode === 'vente' && type === 'appartement';
  const toNullableNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const toFlag = (value) => value === true || value === 1 || value === '1';

  if (!isAppartementVente) {
    return {
      typeRue: null,
      typePapier: null,
      superficieM2: null,
      etage: null,
      configuration: null,
      anneeConstruction: null,
      distancePlageM: null,
      prochePlage: false,
      chauffageCentral: false,
      climatisation: false,
      balcon: false,
      terrasse: false,
      ascenseur: false,
      vueMer: false,
      gazVille: false,
      cuisineEquipee: false,
      placeParking: false,
      syndic: false,
      meuble: false,
      independant: false,
      eauPuits: false,
      eauSonede: false,
      electriciteSteg: false,
    };
  }

  const typeRue = payload.type_rue || null;
  const typePapier = payload.type_papier || null;

  if (typeRue && !APPARTEMENT_VENTE_RUE_TYPES.includes(typeRue)) {
    return { error: 'type_rue invalide' };
  }
  if (typePapier && !APPARTEMENT_VENTE_PAPIER_TYPES.includes(typePapier)) {
    return { error: 'type_papier invalide' };
  }

  return {
    typeRue,
    typePapier,
    superficieM2: toNullableNumber(payload.superficie_m2),
    etage: toNullableNumber(payload.etage),
    configuration: (payload.configuration !== undefined && payload.configuration !== null ? String(payload.configuration) : '').trim() || null,
    anneeConstruction: toNullableNumber(payload.annee_construction),
    distancePlageM: toNullableNumber(payload.distance_plage_m),
    prochePlage: toFlag(payload.proche_plage),
    chauffageCentral: toFlag(payload.chauffage_central),
    climatisation: toFlag(payload.climatisation),
    balcon: toFlag(payload.balcon),
    terrasse: toFlag(payload.terrasse),
    ascenseur: toFlag(payload.ascenseur),
    vueMer: toFlag(payload.vue_mer),
    gazVille: toFlag(payload.gaz_ville),
    cuisineEquipee: toFlag(payload.cuisine_equipee),
    placeParking: toFlag(payload.place_parking),
    syndic: toFlag(payload.syndic),
    meuble: toFlag(payload.meuble),
    independant: toFlag(payload.independant),
    eauPuits: toFlag(payload.eau_puits),
    eauSonede: toFlag(payload.eau_sonede),
    electriciteSteg: toFlag(payload.electricite_steg),
  };
}

function normalizeLocalCommercialVenteDetails(mode, type, payload = {}) {
  const isLocalCommercialVente = mode === 'vente' && type === 'local_commercial';
  const toNullableNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const toFlag = (value) => value === true || value === 1 || value === '1';

  if (!isLocalCommercialVente) {
    return {
      typeRue: null,
      typePapier: null,
      surfaceM2: null,
      facadeM: null,
      hauteurPlafondM: null,
      activiteRecommandee: null,
      toilette: false,
      reserveLocal: false,
      vitrine: false,
      coinAngle: false,
      electricite3Phases: false,
      gazVille: false,
      alarme: false,
      eauPuits: false,
      eauSonede: false,
      electriciteSteg: false,
    };
  }

  const typeRue = payload.type_rue || null;
  const typePapier = payload.type_papier || null;

  if (typeRue && !LOCAL_COMMERCIAL_VENTE_RUE_TYPES.includes(typeRue)) {
    return { error: 'type_rue invalide' };
  }
  if (typePapier && !LOCAL_COMMERCIAL_VENTE_PAPIER_TYPES.includes(typePapier)) {
    return { error: 'type_papier invalide' };
  }

  return {
    typeRue,
    typePapier,
    surfaceM2: toNullableNumber(payload.surface_local_m2),
    facadeM: toNullableNumber(payload.facade_m),
    hauteurPlafondM: toNullableNumber(payload.hauteur_plafond_m),
    activiteRecommandee: (payload.activite_recommandee !== undefined && payload.activite_recommandee !== null ? String(payload.activite_recommandee) : '').trim() || null,
    toilette: toFlag(payload.toilette),
    reserveLocal: toFlag(payload.reserve_local),
    vitrine: toFlag(payload.vitrine),
    coinAngle: toFlag(payload.coin_angle),
    electricite3Phases: toFlag(payload.electricite_3_phases),
    gazVille: toFlag(payload.gaz_ville),
    alarme: toFlag(payload.alarme),
    eauPuits: toFlag(payload.eau_puits),
    eauSonede: toFlag(payload.eau_sonede),
    electriciteSteg: toFlag(payload.electricite_steg),
  };
}

function deriveBedroomsFromConfiguration(configuration) {
  if (!configuration) return 0;
  const match = String(configuration).match(/S\s*\+\s*(\d+)/i);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function syncBienCaracteristiques(bienId, caracteristiqueIds) {
  const [bienRows] = await pool.query('SELECT mode, type FROM biens WHERE id = ? LIMIT 1', [bienId]);
  const bien = bienRows[0];
  if (!bien) return;

  const normalizedMode = normalizeBienMode(bien.mode);
  const normalizedType = normalizeBienType(bien.type);

  if (Array.isArray(caracteristiqueIds) && caracteristiqueIds.length > 0) {
    const placeholders = caracteristiqueIds.map(() => '?').join(',');
    const [allowedRows] = await pool.query(
      `SELECT caracteristique_id
       FROM caracteristique_contextes
       WHERE mode_bien = ? AND type_bien = ? AND caracteristique_id IN (${placeholders})`,
      [normalizedMode, normalizedType, ...caracteristiqueIds]
    );
    const allowedIds = new Set(allowedRows.map((row) => row.caracteristique_id));
    const invalidIds = caracteristiqueIds.filter((id) => !allowedIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`Invalid caracteristique_ids for mode/type: ${invalidIds.join(', ')}`);
    }
  }

  await pool.query('DELETE FROM bien_caracteristiques WHERE bien_id = ?', [bienId]);
  if (!Array.isArray(caracteristiqueIds) || caracteristiqueIds.length === 0) return;

  for (const caracteristiqueId of caracteristiqueIds) {
    await pool.query(
      'INSERT IGNORE INTO bien_caracteristiques (bien_id, caracteristique_id) VALUES (?, ?)',
      [bienId, caracteristiqueId]
    );
  }
}

const createTemporarySocialToken = (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  socialAuthSessions.set(token, { user, expiresAt });
  return token;
};

const consumeTemporarySocialToken = (token) => {
  const entry = socialAuthSessions.get(token);
  if (!entry) return null;

  socialAuthSessions.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry.user;
};

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of socialAuthSessions.entries()) {
    if (entry.expiresAt < now) {
      socialAuthSessions.delete(token);
    }
  }
}, 60 * 1000);

async function ensureAuthSchema() {
  const columnExists = async (tableName, columnName) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return Number(rows[0]?.total || 0) > 0;
  };

  const indexExists = async (tableName, indexName) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?`,
      [tableName, indexName]
    );
    return Number(rows[0]?.total || 0) > 0;
  };

  await pool.query(`
    CREATE TABLE IF NOT EXISTS administrateurs (
      id VARCHAR(50) PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      mot_de_passe_hash VARCHAR(255) NOT NULL,
      actif BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_admin_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('utilisateurs', 'auth_provider'))) {
    await pool.query(
      "ALTER TABLE utilisateurs ADD COLUMN auth_provider ENUM('local', 'google', 'facebook') NOT NULL DEFAULT 'local'"
    );
  }

  if (!(await columnExists('utilisateurs', 'provider_user_id'))) {
    await pool.query(
      'ALTER TABLE utilisateurs ADD COLUMN provider_user_id VARCHAR(150) NULL'
    );
  }

  if (!(await columnExists('utilisateurs', 'last_login_at'))) {
    await pool.query(
      'ALTER TABLE utilisateurs ADD COLUMN last_login_at DATETIME NULL'
    );
  }

  if (!(await indexExists('utilisateurs', 'uq_provider_user'))) {
    await pool.query(
      'CREATE UNIQUE INDEX uq_provider_user ON utilisateurs (auth_provider, provider_user_id)'
    );
  }

  const seedEmail = process.env.ADMIN_SEED_EMAIL;
  const seedPassword = process.env.ADMIN_SEED_PASSWORD;
  if (seedEmail && seedPassword) {
    const hashedPassword = await bcrypt.hash(seedPassword, 10);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      `INSERT INTO administrateurs (id, nom, email, mot_de_passe_hash, actif, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?) AS new_admin
       ON DUPLICATE KEY UPDATE
         nom = new_admin.nom,
         mot_de_passe_hash = new_admin.mot_de_passe_hash,
         actif = 1,
         updated_at = new_admin.updated_at`,
      ['admin-seed', process.env.ADMIN_SEED_NAME || 'Administrateur', seedEmail.toLowerCase(), hashedPassword, now, now]
    );
  }
}

async function ensureBiensWorkflowSchema() {
  const columnExists = async (tableName, columnName) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return Number(rows[0]?.total || 0) > 0;
  };

  const indexExists = async (tableName, indexName) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?`,
      [tableName, indexName]
    );
    return Number(rows[0]?.total || 0) > 0;
  };

  const hasModeColumn = await columnExists('biens', 'mode');
  const hasModeBienColumn = await columnExists('biens', 'mode_bien');

  if (!hasModeColumn && !hasModeBienColumn) {
    await pool.query(
      "ALTER TABLE biens ADD COLUMN mode ENUM('vente','location_annuelle','location_saisonniere') NOT NULL DEFAULT 'location_saisonniere' AFTER titre"
    );
  }

  if (!hasModeColumn && hasModeBienColumn) {
    await pool.query(
      "ALTER TABLE biens ADD COLUMN mode ENUM('vente','location_annuelle','location_saisonniere') NOT NULL DEFAULT 'location_saisonniere' AFTER titre"
    );
    await pool.query('UPDATE biens SET mode = mode_bien');
  }

  if (hasModeColumn) {
    await pool.query(
      "ALTER TABLE biens MODIFY COLUMN mode ENUM('vente','location_annuelle','location_saisonniere') NOT NULL DEFAULT 'location_saisonniere'"
    );
  }

  if (!(await columnExists('biens', 'caution'))) {
    await pool.query(
      'ALTER TABLE biens ADD COLUMN caution DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER avance'
    );
  }

  if (!(await columnExists('biens', 'type_rue'))) {
    await pool.query(
      "ALTER TABLE biens ADD COLUMN type_rue ENUM('piste','route_goudronnee','rue_residentielle') NULL DEFAULT NULL AFTER caution"
    );
  }

  if (!(await columnExists('biens', 'type_papier'))) {
    await pool.query(
      "ALTER TABLE biens ADD COLUMN type_papier ENUM('titre_foncier_individuel','titre_foncier_collectif','contrat_seulement','sans_papier') NULL DEFAULT NULL AFTER type_rue"
    );
  }
  if (!(await columnExists('biens', 'superficie_m2'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN superficie_m2 DECIMAL(10,2) NULL DEFAULT NULL AFTER type_papier');
  }
  if (!(await columnExists('biens', 'etage'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN etage INT NULL DEFAULT NULL AFTER superficie_m2');
  }
  if (!(await columnExists('biens', 'configuration'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN configuration VARCHAR(50) NULL DEFAULT NULL AFTER etage');
  }
  if (!(await columnExists('biens', 'annee_construction'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN annee_construction INT NULL DEFAULT NULL AFTER configuration');
  }
  if (!(await columnExists('biens', 'distance_plage_m'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN distance_plage_m INT NULL DEFAULT NULL AFTER annee_construction');
  }
  if (!(await columnExists('biens', 'proche_plage'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN proche_plage TINYINT(1) NOT NULL DEFAULT 0 AFTER distance_plage_m');
  }
  if (!(await columnExists('biens', 'chauffage_central'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN chauffage_central TINYINT(1) NOT NULL DEFAULT 0 AFTER proche_plage');
  }
  if (!(await columnExists('biens', 'climatisation'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN climatisation TINYINT(1) NOT NULL DEFAULT 0 AFTER chauffage_central');
  }
  if (!(await columnExists('biens', 'balcon'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN balcon TINYINT(1) NOT NULL DEFAULT 0 AFTER climatisation');
  }
  if (!(await columnExists('biens', 'terrasse'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrasse TINYINT(1) NOT NULL DEFAULT 0 AFTER balcon');
  }
  if (!(await columnExists('biens', 'ascenseur'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN ascenseur TINYINT(1) NOT NULL DEFAULT 0 AFTER terrasse');
  }
  if (!(await columnExists('biens', 'vue_mer'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN vue_mer TINYINT(1) NOT NULL DEFAULT 0 AFTER ascenseur');
  }
  if (!(await columnExists('biens', 'gaz_ville'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN gaz_ville TINYINT(1) NOT NULL DEFAULT 0 AFTER vue_mer');
  }
  if (!(await columnExists('biens', 'cuisine_equipee'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN cuisine_equipee TINYINT(1) NOT NULL DEFAULT 0 AFTER gaz_ville');
  }
  if (!(await columnExists('biens', 'place_parking'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN place_parking TINYINT(1) NOT NULL DEFAULT 0 AFTER cuisine_equipee');
  }
  if (!(await columnExists('biens', 'syndic'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN syndic TINYINT(1) NOT NULL DEFAULT 0 AFTER place_parking');
  }
  if (!(await columnExists('biens', 'meuble'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN meuble TINYINT(1) NOT NULL DEFAULT 0 AFTER syndic');
  }
  if (!(await columnExists('biens', 'independant'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN independant TINYINT(1) NOT NULL DEFAULT 0 AFTER meuble');
  }
  if (!(await columnExists('biens', 'eau_puits'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN eau_puits TINYINT(1) NOT NULL DEFAULT 0 AFTER independant');
  }
  if (!(await columnExists('biens', 'eau_sonede'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN eau_sonede TINYINT(1) NOT NULL DEFAULT 0 AFTER eau_puits');
  }
  if (!(await columnExists('biens', 'electricite_steg'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN electricite_steg TINYINT(1) NOT NULL DEFAULT 0 AFTER eau_sonede');
  }

  await pool.query(
    "ALTER TABLE biens MODIFY COLUMN type ENUM('appartement','villa_maison','studio','immeuble','terrain','local_commercial','bungalow','S1','S2','S3','S4','villa','local') NOT NULL"
  );

  if (!(await indexExists('biens', 'idx_biens_mode_type'))) {
    const modeColumn = (await columnExists('biens', 'mode')) ? 'mode' : 'mode_bien';
    await pool.query(`CREATE INDEX idx_biens_mode_type ON biens (${modeColumn}, type)`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS caracteristiques (
      id VARCHAR(50) PRIMARY KEY,
      nom VARCHAR(100) NOT NULL UNIQUE,
      INDEX idx_nom (nom)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bien_caracteristiques (
      bien_id VARCHAR(50) NOT NULL,
      caracteristique_id VARCHAR(50) NOT NULL,
      PRIMARY KEY (bien_id, caracteristique_id),
      FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE CASCADE,
      FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE,
      INDEX idx_caracteristique_id (caracteristique_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS caracteristique_contextes (
      id VARCHAR(50) PRIMARY KEY,
      caracteristique_id VARCHAR(50) NOT NULL,
      mode_bien ENUM('vente','location_annuelle','location_saisonniere') NOT NULL,
      type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','local_commercial','bungalow') NOT NULL,
      UNIQUE KEY uq_car_context (caracteristique_id, mode_bien, type_bien),
      INDEX idx_mode_type (mode_bien, type_bien),
      FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    INSERT INTO caracteristiques (id, nom) VALUES
      ('car1', 'Piscine'),
      ('car2', 'Garage'),
      ('car3', 'Climatisation'),
      ('car4', 'Vue sur mer'),
      ('car5', 'Jardin'),
      ('car6', 'Wifi'),
      ('car7', 'Ascenseur'),
      ('car8', 'Parking'),
      ('car9', 'Cuisine equipee'),
      ('car10', 'Terrasse'),
      ('car11', 'Proche de la plage'),
      ('car12', 'Chauffage central'),
      ('car13', 'Balcon'),
      ('car14', 'Gaz de ville'),
      ('car15', 'Place parking'),
      ('car16', 'Syndic'),
      ('car17', 'Meuble'),
      ('car18', 'Independant'),
      ('car19', 'Eau puits'),
      ('car20', 'Eau Sonede'),
      ('car21', 'Electricite STEG')
    ON DUPLICATE KEY UPDATE nom = VALUES(nom)
  `);

  const contextSeeds = [
    ['ctx1', 'car6', 'vente', 'appartement'],
    ['ctx2', 'car7', 'vente', 'appartement'],
    ['ctx13', 'car3', 'vente', 'appartement'],
    ['ctx14', 'car4', 'vente', 'appartement'],
    ['ctx15', 'car9', 'vente', 'appartement'],
    ['ctx16', 'car10', 'vente', 'appartement'],
    ['ctx17', 'car11', 'vente', 'appartement'],
    ['ctx18', 'car12', 'vente', 'appartement'],
    ['ctx19', 'car13', 'vente', 'appartement'],
    ['ctx20', 'car14', 'vente', 'appartement'],
    ['ctx21', 'car15', 'vente', 'appartement'],
    ['ctx22', 'car16', 'vente', 'appartement'],
    ['ctx23', 'car17', 'vente', 'appartement'],
    ['ctx24', 'car18', 'vente', 'appartement'],
    ['ctx25', 'car19', 'vente', 'appartement'],
    ['ctx26', 'car20', 'vente', 'appartement'],
    ['ctx27', 'car21', 'vente', 'appartement'],
    ['ctx3', 'car8', 'vente', 'villa_maison'],
    ['ctx4', 'car5', 'vente', 'villa_maison'],
    ['ctx5', 'car6', 'location_saisonniere', 'appartement'],
    ['ctx6', 'car3', 'location_saisonniere', 'appartement'],
    ['ctx7', 'car1', 'location_saisonniere', 'villa_maison'],
    ['ctx8', 'car4', 'location_saisonniere', 'villa_maison'],
    ['ctx9', 'car10', 'location_saisonniere', 'bungalow'],
    ['ctx10', 'car9', 'location_annuelle', 'appartement'],
    ['ctx11', 'car8', 'location_annuelle', 'local_commercial'],
    ['ctx12', 'car3', 'location_annuelle', 'villa_maison'],
  ];

  for (const [id, caracteristiqueId, mode, type] of contextSeeds) {
    await pool.query(
      `INSERT INTO caracteristique_contextes (id, caracteristique_id, mode_bien, type_bien)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE mode_bien = VALUES(mode_bien), type_bien = VALUES(type_bien)`,
      [id, caracteristiqueId, mode, type]
    );
  }
}

async function ensureZonesSchema() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'zones'
       AND COLUMN_NAME = 'google_maps_url'`
  );
  const hasGoogleMapsUrl = Number(rows[0]?.total || 0) > 0;
  if (!hasGoogleMapsUrl) {
    await pool.query('ALTER TABLE zones ADD COLUMN google_maps_url VARCHAR(500) NULL AFTER description');
  }
}

async function upsertSocialUser({ email, name, avatar, provider, providerUserId }) {
  const userId = `u${Date.now()}`;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await pool.query(
    `INSERT INTO utilisateurs (id, nom, email, role, avatar, created_at, auth_provider, provider_user_id, last_login_at)
     VALUES (?, ?, ?, 'user', ?, CURDATE(), ?, ?, ?) AS new_user
     ON DUPLICATE KEY UPDATE
       nom = new_user.nom,
       avatar = new_user.avatar,
       auth_provider = new_user.auth_provider,
       provider_user_id = new_user.provider_user_id,
       last_login_at = new_user.last_login_at`,
    [userId, name, email.toLowerCase(), avatar || null, provider, providerUserId || null, now]
  );

  const [rows] = await pool.query(
    'SELECT id, nom, email, role, avatar FROM utilisateurs WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );
  return rows[0] || null;
}

console.log('🔄 Connecting to database...');
pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
    return ensureAuthSchema();
  })
  .then(() => ensureZonesSchema())
  .then(() => ensureBiensWorkflowSchema())
  .then(() => {
    console.log('✅ Auth schema and bien workflow ready');
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

// ============================================
// BIENS (PROPERTIES) API
// ============================================

// GET all biens
app.get('/api/biens', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*, z.nom as zone_nom, p.nom as proprietaire_nom,
        (
          SELECT GROUP_CONCAT(c.id SEPARATOR '||')
          FROM bien_caracteristiques bc
          INNER JOIN caracteristiques c ON c.id = bc.caracteristique_id
          WHERE bc.bien_id = b.id
        ) as caracteristique_ids_list,
        (
          SELECT GROUP_CONCAT(c.nom SEPARATOR '||')
          FROM bien_caracteristiques bc
          INNER JOIN caracteristiques c ON c.id = bc.caracteristique_id
          WHERE bc.bien_id = b.id
        ) as caracteristiques_list
      FROM biens b 
      LEFT JOIN zones z ON b.zone_id = z.id 
      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
      ORDER BY b.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching biens:', error);
    res.status(500).json({ error: 'Failed to fetch biens' });
  }
});

// GET single bien
app.get('/api/biens/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*,
        (
          SELECT GROUP_CONCAT(c.id SEPARATOR '||')
          FROM bien_caracteristiques bc
          INNER JOIN caracteristiques c ON c.id = bc.caracteristique_id
          WHERE bc.bien_id = b.id
        ) as caracteristique_ids_list,
        (
          SELECT GROUP_CONCAT(c.nom SEPARATOR '||')
          FROM bien_caracteristiques bc
          INNER JOIN caracteristiques c ON c.id = bc.caracteristique_id
          WHERE bc.bien_id = b.id
        ) as caracteristiques_list
      FROM biens b
      WHERE b.id = ?
    `, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bien not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching bien:', error);
    res.status(500).json({ error: 'Failed to fetch bien' });
  }
});

// POST create bien
app.post('/api/biens', async (req, res) => {
  try {
    const {
      id,
      reference, titre, description, type, type_bien, mode, mode_bien, nb_chambres, nb_salle_bain,
      prix_nuitee, avance, caution, statut, menage_en_cours, zone_id, proprietaire_id, caracteristique_ids,
      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,
      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg
    } = req.body;

    const resolvedMode = normalizeBienMode(mode ?? mode_bien);
    const resolvedType = normalizeBienType(type_bien ?? type);
    const validation = validateModeAndType(resolvedMode, resolvedType);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const details = normalizeAppartementVenteDetails(resolvedMode, resolvedType, {
      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,
      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg
    });
    if (details.error) {
      return res.status(400).json({ error: details.error });
    }

    const resolvedNbChambres = (resolvedMode === 'vente' && resolvedType === 'appartement')
      ? deriveBedroomsFromConfiguration(details.configuration)
      : Number(nb_chambres || 0);

    const bienId = id || ('b' + Date.now());
    const created_at = new Date().toISOString().split('T')[0];
    const updated_at = created_at;

    await pool.query(
      `INSERT INTO biens (id, reference, titre, description, mode, type, nb_chambres, nb_salle_bain, 
        prix_nuitee, avance, caution, type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
        proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville, cuisine_equipee, place_parking,
        syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg, statut, menage_en_cours, zone_id, proprietaire_id, 
        date_ajout, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bienId, reference, titre, description || null, resolvedMode, resolvedType, resolvedNbChambres, nb_salle_bain,
       prix_nuitee, avance || 0, caution || 0, details.typeRue, details.typePapier, details.superficieM2, details.etage, details.configuration, details.anneeConstruction, details.distancePlageM,
       details.prochePlage ? 1 : 0, details.chauffageCentral ? 1 : 0, details.climatisation ? 1 : 0, details.balcon ? 1 : 0, details.terrasse ? 1 : 0, details.ascenseur ? 1 : 0, details.vueMer ? 1 : 0, details.gazVille ? 1 : 0, details.cuisineEquipee ? 1 : 0, details.placeParking ? 1 : 0,
       details.syndic ? 1 : 0, details.meuble ? 1 : 0, details.independant ? 1 : 0, details.eauPuits ? 1 : 0, details.eauSonede ? 1 : 0, details.electriciteSteg ? 1 : 0, statut || 'disponible', 
       menage_en_cours ? 1 : 0, zone_id || null, proprietaire_id || null,
       created_at, created_at, updated_at]
    );

    if (Array.isArray(caracteristique_ids)) {
      await syncBienCaracteristiques(bienId, caracteristique_ids);
    }

    const [newBien] = await pool.query('SELECT * FROM biens WHERE id = ?', [bienId]);
    res.status(201).json(newBien[0]);
  } catch (error) {
    console.error('Error creating bien:', error);
    if (String(error?.message || '').includes('Invalid caracteristique_ids')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create bien' });
  }
});


// PUT update bien
app.put('/api/biens/:id', async (req, res) => {
  try {
    const {
      reference, titre, description, type, type_bien, mode, mode_bien, nb_chambres, nb_salle_bain,
      prix_nuitee, avance, caution, statut, menage_en_cours, zone_id, proprietaire_id, caracteristique_ids,
      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,
      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg
    } = req.body;

    const resolvedMode = normalizeBienMode(mode ?? mode_bien);
    const resolvedType = normalizeBienType(type_bien ?? type);
    const validation = validateModeAndType(resolvedMode, resolvedType);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const details = normalizeAppartementVenteDetails(resolvedMode, resolvedType, {
      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,
      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg
    });
    if (details.error) {
      return res.status(400).json({ error: details.error });
    }

    const resolvedNbChambres = (resolvedMode === 'vente' && resolvedType === 'appartement')
      ? deriveBedroomsFromConfiguration(details.configuration)
      : Number(nb_chambres || 0);

    const updated_at = new Date().toISOString().split('T')[0];

    await pool.query(
      `UPDATE biens SET 
        reference = ?, titre = ?, description = ?, mode = ?, type = ?, nb_chambres = ?, 
        nb_salle_bain = ?, prix_nuitee = ?, avance = ?, caution = ?, type_rue = ?, type_papier = ?, superficie_m2 = ?, etage = ?, configuration = ?, annee_construction = ?, distance_plage_m = ?,
        proche_plage = ?, chauffage_central = ?, climatisation = ?, balcon = ?, terrasse = ?, ascenseur = ?, vue_mer = ?, gaz_ville = ?, cuisine_equipee = ?, place_parking = ?,
        syndic = ?, meuble = ?, independant = ?, eau_puits = ?, eau_sonede = ?, electricite_steg = ?,
        statut = ?, menage_en_cours = ?, zone_id = ?, proprietaire_id = ?, updated_at = ?
       WHERE id = ?`,
      [reference, titre, description || null, resolvedMode, resolvedType, resolvedNbChambres, nb_salle_bain,
       prix_nuitee, avance || 0, caution || 0, details.typeRue, details.typePapier, details.superficieM2, details.etage, details.configuration, details.anneeConstruction, details.distancePlageM,
       details.prochePlage ? 1 : 0, details.chauffageCentral ? 1 : 0, details.climatisation ? 1 : 0, details.balcon ? 1 : 0, details.terrasse ? 1 : 0, details.ascenseur ? 1 : 0, details.vueMer ? 1 : 0, details.gazVille ? 1 : 0, details.cuisineEquipee ? 1 : 0, details.placeParking ? 1 : 0,
       details.syndic ? 1 : 0, details.meuble ? 1 : 0, details.independant ? 1 : 0, details.eauPuits ? 1 : 0, details.eauSonede ? 1 : 0, details.electriciteSteg ? 1 : 0, statut || 'disponible',
       menage_en_cours ? 1 : 0, zone_id || null, proprietaire_id || null,
       updated_at, req.params.id]
    );

    if (Array.isArray(caracteristique_ids)) {
      await syncBienCaracteristiques(req.params.id, caracteristique_ids);
    }

    const [updatedBien] = await pool.query('SELECT * FROM biens WHERE id = ?', [req.params.id]);
    res.json(updatedBien[0]);
  } catch (error) {
    console.error('Error updating bien:', error);
    if (String(error?.message || '').includes('Invalid caracteristique_ids')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update bien' });
  }
});


// DELETE bien
app.delete('/api/biens/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM biens WHERE id = ?', [req.params.id]);
    res.json({ message: 'Bien deleted successfully' });
  } catch (error) {
    console.error('Error deleting bien:', error);
    res.status(500).json({ error: 'Failed to delete bien' });
  }
});

// ============================================
// ZONES API
// ============================================

app.get('/api/zones', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM zones ORDER BY nom');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching zones:', error);
    res.status(500).json({ error: 'Failed to fetch zones' });
  }
});

app.post('/api/zones', async (req, res) => {
  try {
    const { id, nom, description, google_maps_url } = req.body;
    await pool.query('INSERT INTO zones (id, nom, description, google_maps_url) VALUES (?, ?, ?, ?)', 
      [id, nom, description || '', google_maps_url || null]);
    const [newZone] = await pool.query('SELECT * FROM zones WHERE id = ?', [id]);
    res.status(201).json(newZone[0]);
  } catch (error) {
    console.error('Error creating zone:', error);
    res.status(500).json({ error: 'Failed to create zone' });
  }
});

// ============================================
// PROPRIETAIRES API
// ============================================

app.get('/api/proprietaires', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM proprietaires ORDER BY nom');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching proprietaires:', error);
    res.status(500).json({ error: 'Failed to fetch proprietaires' });
  }
});

app.post('/api/proprietaires', async (req, res) => {
  try {
    const { id, nom, telephone, email, cin } = req.body;
    const newId = id || 'p' + Date.now();
    await pool.query('INSERT INTO proprietaires (id, nom, telephone, email, cin) VALUES (?, ?, ?, ?, ?)', 
      [newId, nom, telephone, email, cin]);
    const [newProp] = await pool.query('SELECT * FROM proprietaires WHERE id = ?', [newId]);
    res.status(201).json(newProp[0]);
  } catch (error) {
    console.error('Error creating proprietaire:', error);
    res.status(500).json({ error: 'Failed to create proprietaire' });
  }
});

app.put('/api/proprietaires/:id', async (req, res) => {
  try {
    const { nom, telephone, email, cin } = req.body;
    await pool.query('UPDATE proprietaires SET nom = ?, telephone = ?, email = ?, cin = ? WHERE id = ?',
      [nom, telephone, email, cin, req.params.id]);
    const [updated] = await pool.query('SELECT * FROM proprietaires WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating proprietaire:', error);
    res.status(500).json({ error: 'Failed to update proprietaire' });
  }
});

app.delete('/api/proprietaires/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM proprietaires WHERE id = ?', [req.params.id]);
    res.json({ message: 'Proprietaire deleted' });
  } catch (error) {
    console.error('Error deleting proprietaire:', error);
    res.status(500).json({ error: 'Failed to delete proprietaire' });
  }
});

// ============================================
// LOCATAIRES API
// ============================================

app.get('/api/locataires', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM locataires ORDER BY nom');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch locataires' });
  }
});

app.post('/api/locataires', async (req, res) => {
  try {
    const { nom, telephone, email, cin, score_fiabilite } = req.body;
    const id = 'l' + Date.now();
    const created_at = new Date().toISOString().split('T')[0];
    await pool.query(
      'INSERT INTO locataires (id, nom, telephone, email, cin, score_fiabilite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, nom, telephone, email, cin, score_fiabilite || 5, created_at]
    );
    const [newLoc] = await pool.query('SELECT * FROM locataires WHERE id = ?', [id]);
    res.status(201).json(newLoc[0]);
  } catch (error) {
    console.error('Error creating locataire:', error);
    res.status(500).json({ error: 'Failed to create locataire' });
  }
});

// ============================================
// CONTRATS API
// ============================================

app.get('/api/contrats', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, b.titre as bien_titre, l.nom as locataire_nom 
      FROM contrats c 
      LEFT JOIN biens b ON c.bien_id = b.id 
      LEFT JOIN locataires l ON c.locataire_id = l.id
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contrats' });
  }
});

app.post('/api/contrats', async (req, res) => {
  try {
    const { bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, statut } = req.body;
    const id = 'c' + Date.now();
    const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      'INSERT INTO contrats (id, bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, statut, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, bien_id, locataire_id, date_debut, date_fin, montant_recu || 0, url_pdf || null, statut || 'actif', created_at]
    );
    const [newContrat] = await pool.query('SELECT * FROM contrats WHERE id = ?', [id]);
    res.status(201).json(newContrat[0]);
  } catch (error) {
    console.error('Error creating contrat:', error);
    res.status(500).json({ error: 'Failed to create contrat' });
  }
});

// ============================================
// PAIEMENTS API
// ============================================

app.get('/api/paiements', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, c.id as contrat_ref 
      FROM paiements p 
      LEFT JOIN contrats c ON p.contrat_id = c.id
      ORDER BY p.date_paiement DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch paiements' });
  }
});

app.post('/api/paiements', async (req, res) => {
  try {
    const { contrat_id, montant, date_paiement, statut, methode } = req.body;
    const id = 'pay' + Date.now();
    await pool.query(
      'INSERT INTO paiements (id, contrat_id, montant, date_paiement, statut, methode) VALUES (?, ?, ?, ?, ?, ?)',
      [id, contrat_id, montant, date_paiement, statut || 'en_attente', methode || 'virement']
    );
    const [newPaiement] = await pool.query('SELECT * FROM paiements WHERE id = ?', [id]);
    res.status(201).json(newPaiement[0]);
  } catch (error) {
    console.error('Error creating paiement:', error);
    res.status(500).json({ error: 'Failed to create paiement' });
  }
});

// ============================================
// MAINTENANCE API
// ============================================

app.get('/api/maintenance', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, b.titre as bien_titre 
      FROM maintenance m 
      LEFT JOIN biens b ON m.bien_id = b.id
      ORDER BY m.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch maintenance' });
  }
});

app.post('/api/maintenance', async (req, res) => {
  try {
    const { bien_id, description, cout, statut } = req.body;
    const id = 'maint' + Date.now();
    const created_at = new Date().toISOString().split('T')[0];
    await pool.query(
      'INSERT INTO maintenance (id, bien_id, description, cout, statut, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, bien_id, description, cout || 0, statut || 'en_cours', created_at]
    );
    const [newMaint] = await pool.query('SELECT * FROM maintenance WHERE id = ?', [id]);
    res.status(201).json(newMaint[0]);
  } catch (error) {
    console.error('Error creating maintenance:', error);
    res.status(500).json({ error: 'Failed to create maintenance' });
  }
});

// ============================================
// NOTIFICATIONS API
// ============================================

app.get('/api/notifications', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const { utilisateur_id, type, message } = req.body;
    const id = 'n' + Date.now();
    const created_at = new Date().toISOString();
    await pool.query(
      'INSERT INTO notifications (id, utilisateur_id, type, message, lu, created_at) VALUES (?, ?, ?, ?, 0, ?)',
      [id, utilisateur_id || '1', type || 'info', message, created_at]
    );
    const [newNotif] = await pool.query('SELECT * FROM notifications WHERE id = ?', [id]);
    res.status(201).json(newNotif[0]);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

app.put('/api/notifications/:id/lu', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET lu = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// ============================================
// MEDIA API
// ============================================

app.get('/api/media/:bien_id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM media WHERE bien_id = ? ORDER BY position ASC, id ASC', [req.params.bien_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.delete('/api/contrats/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM contrats WHERE id = ?', [req.params.id]);
    res.json({ message: 'Contrat deleted successfully' });
  } catch (error) {
    console.error('Error deleting contrat:', error);
    res.status(500).json({ error: 'Failed to delete contrat' });
  }
});

app.put('/api/contrats/:id', async (req, res) => {
  try {
    const { bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, statut } = req.body;
    const fields = [];
    const values = [];

    if (bien_id !== undefined) { fields.push('bien_id = ?'); values.push(bien_id); }
    if (locataire_id !== undefined) { fields.push('locataire_id = ?'); values.push(locataire_id); }
    if (date_debut !== undefined) { fields.push('date_debut = ?'); values.push(date_debut); }
    if (date_fin !== undefined) { fields.push('date_fin = ?'); values.push(date_fin); }
    if (montant_recu !== undefined) { fields.push('montant_recu = ?'); values.push(montant_recu); }
    if (url_pdf !== undefined) { fields.push('url_pdf = ?'); values.push(url_pdf); }
    if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await pool.query(`UPDATE contrats SET ${fields.join(', ')} WHERE id = ?`, values);
    const [updated] = await pool.query('SELECT * FROM contrats WHERE id = ?', [req.params.id]);
    if (!updated.length) return res.status(404).json({ error: 'Contrat not found' });
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating contrat:', error);
    res.status(500).json({ error: 'Failed to update contrat' });
  }
});

const contractStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const contractsDir = path.join(__dirname, 'contracts');
    if (!fs.existsSync(contractsDir)) {
      fs.mkdirSync(contractsDir, { recursive: true });
    }
    cb(null, contractsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'contract-' + uniqueSuffix + '.pdf');
  }
});

const contractUpload = multer({
  storage: contractStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = path.extname(file.originalname).toLowerCase() === '.pdf';
    if (isPdfMime || isPdfExt) return cb(null, true);
    cb(new Error('Only PDF files are allowed'));
  }
});

// ============================================
// CARACTERISTIQUES API
// ============================================

app.get('/api/workflow/biens-options', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT cc.mode_bien, cc.type_bien, c.id, c.nom
       FROM caracteristique_contextes cc
       INNER JOIN caracteristiques c ON c.id = cc.caracteristique_id
       ORDER BY cc.mode_bien ASC, cc.type_bien ASC, c.nom ASC`
    );

    const featuresByModeAndType = {};
    for (const row of rows) {
      if (!featuresByModeAndType[row.mode_bien]) featuresByModeAndType[row.mode_bien] = {};
      if (!featuresByModeAndType[row.mode_bien][row.type_bien]) featuresByModeAndType[row.mode_bien][row.type_bien] = [];
      featuresByModeAndType[row.mode_bien][row.type_bien].push({ id: row.id, nom: row.nom });
    }

    res.json({
      modes: BIEN_MODES.map((mode) => ({
        value: mode,
        types: BIEN_TYPES_BY_MODE[mode] || [],
      })),
      featuresByModeAndType,
    });
  } catch (error) {
    console.error('Error fetching bien workflow options:', error);
    res.status(500).json({ error: 'Failed to fetch bien workflow options' });
  }
});

app.get('/api/caracteristiques', async (req, res) => {
  try {
    const mode = normalizeBienMode(req.query.mode_bien || req.query.mode);
    const type = normalizeBienType(req.query.type_bien || req.query.type);

    if ((req.query.mode_bien || req.query.mode) && (req.query.type_bien || req.query.type)) {
      const validation = validateModeAndType(mode, type);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      const [rows] = await pool.query(
        `SELECT DISTINCT c.*
         FROM caracteristiques c
         INNER JOIN caracteristique_contextes cc ON cc.caracteristique_id = c.id
         WHERE cc.mode_bien = ? AND cc.type_bien = ?
         ORDER BY c.nom ASC`,
        [mode, type]
      );
      return res.json(rows);
    }

    const [rows] = await pool.query('SELECT * FROM caracteristiques ORDER BY nom ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching caracteristiques:', error);
    res.status(500).json({ error: 'Failed to fetch caracteristiques' });
  }
});

app.post('/api/caracteristiques', async (req, res) => {
  try {
    const { nom, mode_bien, mode, type_bien, type } = req.body;
    const normalizedMode = normalizeBienMode(mode_bien ?? mode);
    const normalizedType = normalizeBienType(type_bien ?? type);
    const featureName = String(nom || '').trim();
    if (!featureName) {
      return res.status(400).json({ error: 'nom requis' });
    }

    const id = 'car' + Date.now();
    await pool.query(
      `INSERT INTO caracteristiques (id, nom)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE nom = VALUES(nom)`,
      [id, featureName]
    );

    const [rows] = await pool.query('SELECT * FROM caracteristiques WHERE nom = ? LIMIT 1', [featureName]);
    const caracteristique = rows[0];

    if ((mode_bien || mode) && (type_bien || type)) {
      const validation = validateModeAndType(normalizedMode, normalizedType);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      await pool.query(
        `INSERT INTO caracteristique_contextes (id, caracteristique_id, mode_bien, type_bien)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE mode_bien = VALUES(mode_bien), type_bien = VALUES(type_bien)`,
        ['ctx' + Date.now(), caracteristique.id, normalizedMode, normalizedType]
      );
    }

    res.status(201).json(caracteristique);
  } catch (error) {
    console.error('Error creating caracteristique:', error);
    res.status(500).json({ error: 'Failed to create caracteristique' });
  }
});

app.post('/api/biens/:id/caracteristiques', async (req, res) => {
  try {
    const { caracteristique_ids } = req.body;
    if (!Array.isArray(caracteristique_ids)) {
      return res.status(400).json({ error: 'caracteristique_ids must be an array' });
    }

    await syncBienCaracteristiques(req.params.id, caracteristique_ids);

    res.json({ message: 'Caracteristiques updated' });
  } catch (error) {
    console.error('Error updating bien caracteristiques:', error);
    if (String(error?.message || '').includes('Invalid caracteristique_ids')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update bien caracteristiques' });
  }
});

// Upload image endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imageUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
    res.json({ 
      success: true, 
      url: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

app.post('/api/upload-contract', contractUpload.single('contract'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No contract file uploaded' });
    }
    const contractUrl = `http://localhost:${PORT}/contracts/${req.file.filename}`;
    res.json({
      success: true,
      url: contractUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading contract:', error);
    res.status(500).json({ error: 'Failed to upload contract' });
  }
});

app.post('/api/media', async (req, res) => {
  try {
    const { bien_id, type, url, position } = req.body;
    const id = 'm' + Date.now();
    
    // Calculate the next position if not provided (max existing position + 1)
    let mediaPosition = position;
    if (mediaPosition === undefined || mediaPosition === null) {
      const [maxPosResult] = await pool.query(
        'SELECT MAX(position) as maxPos FROM media WHERE bien_id = ?',
        [bien_id]
      );
      mediaPosition = (maxPosResult[0]?.maxPos ?? -1) + 1;
    }
    
    await pool.query('INSERT INTO media (id, bien_id, type, url, position) VALUES (?, ?, ?, ?, ?)',
      [id, bien_id, type || 'image', url, mediaPosition]);
    const [newMedia] = await pool.query('SELECT * FROM media WHERE id = ?', [id]);
    res.status(201).json(newMedia[0]);
  } catch (error) {
    console.error('Error creating media:', error);
    res.status(500).json({ error: 'Failed to create media' });
  }
});


// Update media order
app.put('/api/media/:id/position', async (req, res) => {
  try {
    const { position } = req.body;
    await pool.query('UPDATE media SET position = ? WHERE id = ?', [position, req.params.id]);
    res.json({ message: 'Position updated' });
  } catch (error) {
    console.error('Error updating media position:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// Bulk update media positions
app.put('/api/media/bulk/positions', async (req, res) => {
  try {
    const { media } = req.body;
    if (!Array.isArray(media)) {
      return res.status(400).json({ error: 'Media array required' });
    }
    
    for (const item of media) {
      await pool.query('UPDATE media SET position = ? WHERE id = ?', [item.position, item.id]);
    }
    
    res.json({ message: 'Positions updated' });
  } catch (error) {
    console.error('Error updating media positions:', error);
    res.status(500).json({ error: 'Failed to update positions' });
  }
});

app.delete('/api/media/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM media WHERE id = ?', [req.params.id]);
    res.json({ message: 'Media deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete media' });
  }
});


// ============================================
// UNAVAILABLE DATES API
// ============================================

app.get('/api/unavailable-dates/:bien_id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM unavailable_dates WHERE bien_id = ?', [req.params.bien_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unavailable dates' });
  }
});

app.post('/api/unavailable-dates', async (req, res) => {
  try {
    const { bien_id, start_date, end_date, status } = req.body;
    const id = 'ud' + Date.now();
    await pool.query('INSERT INTO unavailable_dates (id, bien_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)',
      [id, bien_id, start_date, end_date, status || 'blocked']);
    const [newDate] = await pool.query('SELECT * FROM unavailable_dates WHERE id = ?', [id]);
    res.status(201).json(newDate[0]);
  } catch (error) {
    console.error('Error creating unavailable date:', error);
    res.status(500).json({ error: 'Failed to create unavailable date' });
  }
});

app.delete('/api/unavailable-dates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM unavailable_dates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Unavailable date deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete unavailable date' });
  }
});

// ============================================
// UTILISATEURS API
// ============================================

// ============================================
// AUTH API
// ============================================

app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe obligatoires' });
    }

    const [rows] = await pool.query(
      'SELECT id, nom, email, mot_de_passe_hash, actif FROM administrateurs WHERE email = ? LIMIT 1',
      [String(email).toLowerCase()]
    );
    const admin = rows[0];
    if (!admin || !admin.actif) {
      return res.status(401).json({ error: 'Identifiants administrateur invalides' });
    }

    const isPasswordValid = await bcrypt.compare(String(password), admin.mot_de_passe_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Identifiants administrateur invalides' });
    }

    res.json({
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.nom,
        role: 'admin',
      },
    });
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({ error: 'Erreur de connexion administrateur' });
  }
});

app.get('/api/auth/google/start', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;

  if (!clientId) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID manquant' });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=google_code_missing`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=google_config_missing`);
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=google_token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=google_access_token_missing`);
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=google_profile_fetch_failed`);
    }

    const profile = await profileResponse.json();
    if (!profile.email) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=google_email_missing`);
    }

    const user = await upsertSocialUser({
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      avatar: profile.picture || null,
      provider: 'google',
      providerUserId: profile.sub || null,
    });

    const socialToken = createTemporarySocialToken(user);
    res.redirect(`${FRONTEND_URL}/login?social_token=${socialToken}`);
  } catch (error) {
    console.error('Google callback error:', error);
    res.redirect(`${FRONTEND_URL}/login?oauth_error=google_callback_failed`);
  }
});

app.get('/api/auth/facebook/start', async (req, res) => {
  const clientId = process.env.FACEBOOK_CLIENT_ID;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `http://localhost:${PORT}/api/auth/facebook/callback`;

  if (!clientId) {
    return res.status(500).json({ error: 'FACEBOOK_CLIENT_ID manquant' });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'email,public_profile',
  });

  res.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`);
});

app.get('/api/auth/facebook/callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=facebook_code_missing`);
    }

    const clientId = process.env.FACEBOOK_CLIENT_ID;
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `http://localhost:${PORT}/api/auth/facebook/callback`;

    if (!clientId || !clientSecret) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=facebook_config_missing`);
    }

    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', String(code));

    const tokenResponse = await fetch(tokenUrl);
    if (!tokenResponse.ok) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=facebook_token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=facebook_access_token_missing`);
    }

    const profileUrl = new URL('https://graph.facebook.com/me');
    profileUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
    profileUrl.searchParams.set('access_token', tokenData.access_token);

    const profileResponse = await fetch(profileUrl);
    if (!profileResponse.ok) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=facebook_profile_fetch_failed`);
    }

    const profile = await profileResponse.json();
    if (!profile.email) {
      return res.redirect(`${FRONTEND_URL}/login?oauth_error=facebook_email_missing`);
    }

    const user = await upsertSocialUser({
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      avatar: profile.picture?.data?.url || null,
      provider: 'facebook',
      providerUserId: profile.id || null,
    });

    const socialToken = createTemporarySocialToken(user);
    res.redirect(`${FRONTEND_URL}/login?social_token=${socialToken}`);
  } catch (error) {
    console.error('Facebook callback error:', error);
    res.redirect(`${FRONTEND_URL}/login?oauth_error=facebook_callback_failed`);
  }
});

app.get('/api/auth/social/session/:token', (req, res) => {
  const user = consumeTemporarySocialToken(req.params.token);
  if (!user) {
    return res.status(404).json({ error: 'Session sociale invalide ou expirée' });
  }
  res.json({ user });
});

app.get('/api/utilisateurs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM utilisateurs ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch utilisateurs' });
  }
});

app.post('/api/utilisateurs', async (req, res) => {
  try {
    const { id, nom, email, role, avatar } = req.body;
    const newId = id || 'u' + Date.now();
    const created_at = new Date().toISOString().split('T')[0];
    await pool.query(
      'INSERT INTO utilisateurs (id, nom, email, role, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId, nom, email, role || 'user', avatar || null, created_at]
    );
    const [newUser] = await pool.query('SELECT * FROM utilisateurs WHERE id = ?', [newId]);
    res.status(201).json(newUser[0]);
  } catch (error) {
    console.error('Error creating utilisateur:', error);
    res.status(500).json({ error: 'Failed to create utilisateur' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('   - GET    /api/biens');
  console.log('   - POST   /api/biens');
  console.log('   - PUT    /api/biens/:id');
  console.log('   - DELETE /api/biens/:id');
  console.log('   - GET    /api/zones');
  console.log('   - GET    /api/proprietaires');
  console.log('   - GET    /api/locataires');
  console.log('   - GET    /api/contrats');
  console.log('   - GET    /api/paiements');
  console.log('   - GET    /api/maintenance');
  console.log('   - GET    /api/notifications');
});
