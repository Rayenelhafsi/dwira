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
const CANONICAL_FRONTEND_URL = String(FRONTEND_URL || '').trim().replace('https://dwiraimmobilier.com', 'https://www.dwiraimmobilier.com');
const ALLOWED_ORIGINS = [
  ...String(process.env.FRONTEND_URL || CANONICAL_FRONTEND_URL).split(',').map((value) => value.trim()).filter(Boolean),
  CANONICAL_FRONTEND_URL,
  'http://localhost:5173',
  'https://localhost:5173',
  'http://localhost:5174',
  'https://localhost:5174',
  'https://www.dwiraimmobilier.com',
  'https://dwiraimmobilier.com',
];
app.disable('x-powered-by');
const AGENCY_TIME_ZONE = 'Africa/Tunis';

function isLocalDevOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin || '').trim());
}

function getAgencySqlDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AGENCY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  const hour = parts.find((part) => part.type === 'hour')?.value || '00';
  const minute = parts.find((part) => part.type === 'minute')?.value || '00';
  const second = parts.find((part) => part.type === 'second')?.value || '00';
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isLocalDevOrigin(origin)) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('CORS blocked for this origin'));
  },
  credentials: true,
}));
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (String(req.headers['x-forwarded-proto'] || '').includes('https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
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
const phoneOtpSessions = new Map();
const BIEN_MODES = ['vente', 'location_annuelle', 'location_saisonniere'];
const BIEN_TYPES_BY_MODE = {
  vente: ['appartement', 'villa_maison', 'studio', 'immeuble', 'terrain', 'lotissement', 'local_commercial'],
  location_saisonniere: ['appartement', 'villa_maison', 'bungalow', 'studio'],
  location_annuelle: ['appartement', 'local_commercial', 'villa_maison'],
};
const APPARTEMENT_VENTE_RUE_TYPES = ['piste', 'route_goudronnee', 'rue_residentielle'];
const APPARTEMENT_VENTE_PAPIER_TYPES = ['titre_foncier_individuel', 'titre_foncier_collectif', 'contrat_seulement', 'sans_papier'];
const LOCAL_COMMERCIAL_VENTE_RUE_TYPES = APPARTEMENT_VENTE_RUE_TYPES;
const LOCAL_COMMERCIAL_VENTE_PAPIER_TYPES = APPARTEMENT_VENTE_PAPIER_TYPES;
const TERRAIN_VENTE_RUE_TYPES = APPARTEMENT_VENTE_RUE_TYPES;
const TERRAIN_VENTE_PAPIER_TYPES = APPARTEMENT_VENTE_PAPIER_TYPES;
const TERRAIN_VENTE_TYPES = ['agricole', 'habitation', 'industrielle', 'loisir'];
const TERRAIN_AFFICHAGE_PRIX_MODES = ['total_uniquement', 'm2_uniquement', 'total_et_m2'];
const TERRAIN_HAUTEUR_CONSTRUCTION_OPTIONS = ['R+1', 'R+2', 'R+3', 'R+4', 'R+5'];
const TERRAIN_TOPOGRAPHIE_OPTIONS = ['plat', 'en_pente'];
const TERRAIN_VOISINAGE_OPTIONS = ['residentiel_calme', 'touristique_anime', 'agricole'];
const TERRAIN_VIABILISATION_ONAS_OPTIONS = ['disponible', 'en_facade', 'non_disponible'];
const TERRAIN_VIABILISATION_STEG_OPTIONS = ['disponible', 'a_proximite', 'transformateur_proche', 'non_disponible'];
const TERRAIN_TYPE_SOL_OPTIONS = ['sablonneux', 'rocheux', 'terre_agricole'];
const TERRAIN_NIVEAU_SONORE_OPTIONS = ['faible', 'moyen', 'eleve'];
const TERRAIN_DISPONIBILITE_RESEAUX_OPTIONS = ['eau', 'electricite', 'onas'];
const TERRAIN_PROXIMITES_OPTIONS = ['ecole', 'commerce', 'transport', 'centre_ville'];
const TERRAIN_VIABILISATION_EAU_SOURCES_OPTIONS = ['sonede', 'puits', 'citerne'];
const TERRAIN_IDEAL_UTILISATIONS_OPTIONS = ['construction_villa', 'construction_immeuble', 'projet_touristique', 'projet_commercial', 'projet_agricole', 'investissement_longue_duree'];
const TERRAIN_DOCUMENTS_OPTIONS = ['plan_masse', 'plan_topographique', 'certificat_propriete', 'certificat_bornage', 'certificat_conformite_municipal', 'certificat_non_affectation_agricole'];
const LOTISSEMENT_PRIX_M2_MODES = ['m2_unique', 'paliers'];
const TARIFICATION_METHODES = ['avec_commission', 'sans_commission'];
const MODALITES_PAIEMENT_VENTE = ['comptant', 'facilite'];
const DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT = 3;
const DEFAULT_COMMISSION_CLIENT_PERCENT = 2;
const DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE = 30;
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

function normalizeReferenceBase(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'REF';
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

function normalizeAnnonceKey({ titre, zoneId, proprietaireId }) {
  const normalizedTitle = String(titre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${normalizedTitle}__${String(zoneId || '')}__${String(proprietaireId || '')}`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function generateStructuredBienReference({ mode, type, titre, zoneId, proprietaireId, excludeId = null }) {
  const modeCode = MODE_REFERENCE_CODES[mode] || normalizeReferenceBase(mode).replace(/-/g, '');
  const typeCode = TYPE_REFERENCE_CODES[type] || normalizeReferenceBase(type).replace(/-/g, '');
  const unitPrefix = TYPE_UNIT_PREFIX[type] || 'U';
  const basePrefix = `REF-${modeCode}-${typeCode}-ANN`;

  const params = [mode, type];
  let sql = 'SELECT id, reference, titre, zone_id, proprietaire_id FROM biens WHERE mode = ? AND type = ?';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await pool.query(sql, params);

  const pattern = new RegExp(`^REF-${escapeRegExp(modeCode)}-${escapeRegExp(typeCode)}-ANN(\\d+)-([A-Z])(\\d+)$`);
  const annonceKey = normalizeAnnonceKey({ titre, zoneId, proprietaireId });

  let maxAnnonceNumber = 0;
  let annonceNumberForCurrent = null;
  let maxUnitForCurrentAnnonce = 0;

  for (const row of rows) {
    const parsed = pattern.exec(String(row.reference || '').trim().toUpperCase());
    if (!parsed) continue;
    const annNumber = Number(parsed[1] || 0);
    const rowUnitPrefix = String(parsed[2] || '');
    const rowUnitNumber = Number(parsed[3] || 0);
    if (annNumber > maxAnnonceNumber) maxAnnonceNumber = annNumber;
    const rowKey = normalizeAnnonceKey({
      titre: row.titre,
      zoneId: row.zone_id,
      proprietaireId: row.proprietaire_id,
    });
    if (rowKey === annonceKey) {
      if (!annonceNumberForCurrent) annonceNumberForCurrent = annNumber;
      if (annonceNumberForCurrent === annNumber && rowUnitPrefix === unitPrefix) {
        maxUnitForCurrentAnnonce = Math.max(maxUnitForCurrentAnnonce, rowUnitNumber);
      }
    }
  }

  const finalAnnonceNumber = annonceNumberForCurrent || (maxAnnonceNumber + 1);
  const finalUnitNumber = maxUnitForCurrentAnnonce + 1;
  return `${basePrefix}${finalAnnonceNumber}-${unitPrefix}${finalUnitNumber}`;
}

function isStructuredBienReference(reference, mode, type) {
  const modeCode = MODE_REFERENCE_CODES[mode] || normalizeReferenceBase(mode).replace(/-/g, '');
  const typeCode = TYPE_REFERENCE_CODES[type] || normalizeReferenceBase(type).replace(/-/g, '');
  const pattern = new RegExp(`^REF-${escapeRegExp(modeCode)}-${escapeRegExp(typeCode)}-ANN\\d+-[A-Z]\\d+$`);
  return pattern.test(String(reference || '').trim().toUpperCase());
}

function buildChildReference(baseReference, prefix, index) {
  return `${normalizeReferenceBase(baseReference)}-${prefix}${index}`;
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

function normalizeTerrainVenteDetails(mode, type, payload = {}) {
  const isTerrainVente = mode === 'vente' && type === 'terrain';
  const toNullableNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const toFlag = (value) => value === true || value === 1 || value === '1';
  const toNullableString = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
  };
  const toStringArray = (value) => Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const normalizeMulti = (value, allowed = []) => {
    const items = toStringArray(value);
    if (!Array.isArray(allowed) || allowed.length === 0) return items;
    return Array.from(new Set(items.filter((item) => allowed.includes(item))));
  };

  if (!isTerrainVente) {
    return {
      typeRue: null,
      typePapier: null,
      typeTerrain: null,
      facadeM: null,
      surfaceM2: null,
      prixAfficheTotal: null,
      prixAfficheParM2: null,
      modeAffichagePrix: null,
      distancePlageM: null,
      zoneTerrain: null,
      constructible: false,
      terrainAngle: false,
      eauPuits: false,
      eauSonede: false,
      electriciteSteg: false,
      terrainDetailsJson: null,
    };
  }

  const typeRue = payload.type_rue || null;
  const typePapier = payload.type_papier || null;
  const typeTerrain = payload.type_terrain || null;
  const modeAffichagePrix = payload.terrain_mode_affichage_prix || 'total_et_m2';
  const surfaceM2 = toNullableNumber(payload.terrain_surface_m2);
  const prixAfficheTotal = toNullableNumber(payload.terrain_prix_affiche_total);
  const prixAfficheParM2 = toNullableNumber(payload.terrain_prix_affiche_par_m2);

  if (typeRue && !TERRAIN_VENTE_RUE_TYPES.includes(typeRue)) {
    return { error: 'type_rue invalide' };
  }
  if (typePapier && !TERRAIN_VENTE_PAPIER_TYPES.includes(typePapier)) {
    return { error: 'type_papier invalide' };
  }
  if (typeTerrain && !TERRAIN_VENTE_TYPES.includes(typeTerrain)) {
    return { error: 'type_terrain invalide' };
  }
  if (!surfaceM2 || surfaceM2 <= 0) {
    return { error: 'terrain_surface_m2 obligatoire (> 0)' };
  }
  if (modeAffichagePrix && !TERRAIN_AFFICHAGE_PRIX_MODES.includes(modeAffichagePrix)) {
    return { error: 'terrain_mode_affichage_prix invalide' };
  }
  const topographie = toNullableString(payload.terrain_topographie);
  if (topographie && !TERRAIN_TOPOGRAPHIE_OPTIONS.includes(topographie)) {
    return { error: 'terrain_topographie invalide' };
  }
  const hauteurConstruction = toNullableString(payload.terrain_hauteur_construction_autorisee);
  if (hauteurConstruction && !TERRAIN_HAUTEUR_CONSTRUCTION_OPTIONS.includes(hauteurConstruction)) {
    return { error: 'terrain_hauteur_construction_autorisee invalide' };
  }
  const voisinage = toNullableString(payload.terrain_voisinage);
  if (voisinage && !TERRAIN_VOISINAGE_OPTIONS.includes(voisinage)) {
    return { error: 'terrain_voisinage invalide' };
  }
  const viabilisationOnas = toNullableString(payload.terrain_viabilisation_onas);
  if (viabilisationOnas && !TERRAIN_VIABILISATION_ONAS_OPTIONS.includes(viabilisationOnas)) {
    return { error: 'terrain_viabilisation_onas invalide' };
  }
  const viabilisationSteg = toNullableString(payload.terrain_viabilisation_steg);
  if (viabilisationSteg && !TERRAIN_VIABILISATION_STEG_OPTIONS.includes(viabilisationSteg)) {
    return { error: 'terrain_viabilisation_steg invalide' };
  }
  const typeSol = toNullableString(payload.terrain_type_sol);
  if (typeSol && !TERRAIN_TYPE_SOL_OPTIONS.includes(typeSol)) {
    return { error: 'terrain_type_sol invalide' };
  }
  const niveauSonore = toNullableString(payload.terrain_niveau_sonore);
  if (niveauSonore && !TERRAIN_NIVEAU_SONORE_OPTIONS.includes(niveauSonore)) {
    return { error: 'terrain_niveau_sonore invalide' };
  }

  const terrainDetails = {
    disponibilite_reseaux: normalizeMulti(payload.terrain_disponibilite_reseaux, TERRAIN_DISPONIBILITE_RESEAUX_OPTIONS),
    hauteur_construction_autorisee: hauteurConstruction,
    route_acces_largeur_m: toNullableNumber(payload.terrain_route_acces_largeur_m),
    forme: toNullableString(payload.terrain_forme),
    topographie,
    bornage: toFlag(payload.terrain_bornage),
    travaux_municipalite_autorises: toFlag(payload.terrain_travaux_municipalite_autorises),
    limites_cadastrales: toFlag(payload.terrain_limites_cadastrales),
    visualisation_limites_cadastrales: toFlag(payload.terrain_visualisation_limites_cadastrales),
    voisinage,
    proximites_commodites: normalizeMulti(payload.terrain_proximites_commodites, TERRAIN_PROXIMITES_OPTIONS),
    proximites_commodites_autres: toNullableString(payload.terrain_proximites_commodites_autres),
    viabilisation_eau_sources: normalizeMulti(payload.terrain_viabilisation_eau_sources, TERRAIN_VIABILISATION_EAU_SOURCES_OPTIONS),
    viabilisation_onas: viabilisationOnas,
    viabilisation_steg: viabilisationSteg,
    viabilisation_gaz_ville: toFlag(payload.terrain_viabilisation_gaz_ville),
    viabilisation_fibre_optique: toFlag(payload.terrain_viabilisation_fibre_optique),
    viabilisation_telephone_fixe: toFlag(payload.terrain_viabilisation_telephone_fixe),
    type_sol: typeSol,
    vegetation: toNullableString(payload.terrain_vegetation),
    niveau_sonore: niveauSonore,
    risque_inondation: toFlag(payload.terrain_risque_inondation),
    exposition_vent: toNullableString(payload.terrain_exposition_vent),
    ideal_utilisations: normalizeMulti(payload.terrain_ideal_utilisations, TERRAIN_IDEAL_UTILISATIONS_OPTIONS),
    documents_disponibles: normalizeMulti(payload.terrain_documents_disponibles, TERRAIN_DOCUMENTS_OPTIONS),
  };

  return {
    typeRue,
    typePapier,
    typeTerrain,
    facadeM: toNullableNumber(payload.terrain_facade_m),
    surfaceM2,
    prixAfficheTotal,
    prixAfficheParM2,
    modeAffichagePrix,
    distancePlageM: toNullableNumber(payload.terrain_distance_plage_m),
    zoneTerrain: (payload.terrain_zone !== undefined && payload.terrain_zone !== null ? String(payload.terrain_zone) : '').trim() || null,
    constructible: toFlag(payload.terrain_constructible),
    terrainAngle: toFlag(payload.terrain_angle),
    eauPuits: toFlag(payload.eau_puits),
    eauSonede: toFlag(payload.eau_sonede),
    electriciteSteg: toFlag(payload.electricite_steg),
    terrainDetailsJson: JSON.stringify(terrainDetails),
  };
}

function normalizeLotissementVenteDetails(mode, type, payload = {}) {
  const isLotissementVente = mode === 'vente' && type === 'lotissement';
  const toNullableNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const toFlag = (value) => value === true || value === 1 || value === '1';
  if (!isLotissementVente) {
    return {
      nbTerrains: null,
      prixTotal: null,
      modePrixM2: null,
      prixM2Unique: null,
      terrainsJson: null,
      paliersPrixM2Json: null,
    };
  }

  const nbTerrains = Math.max(1, Math.floor(Number(payload.lotissement_nb_terrains || 1)));
  const modePrixM2 = String(payload.lotissement_mode_prix_m2 || 'm2_unique');
  if (!LOTISSEMENT_PRIX_M2_MODES.includes(modePrixM2)) {
    return { error: 'lotissement_mode_prix_m2 invalide' };
  }

  const rawTerrains = Array.isArray(payload.lotissement_terrains) ? payload.lotissement_terrains : [];
  const baseReference = payload.reference || payload.titre || 'LOTISSEMENT';
  const terrains = [];
  for (let i = 0; i < nbTerrains; i += 1) {
    const row = rawTerrains[i] || {};
    const typeTerrain = row.type_terrain || null;
    const typeRue = row.type_rue || null;
    const typePapier = row.type_papier || null;
    if (typeTerrain && !TERRAIN_VENTE_TYPES.includes(typeTerrain)) return { error: `type_terrain invalide pour terrain ${i + 1}` };
    if (typeRue && !TERRAIN_VENTE_RUE_TYPES.includes(typeRue)) return { error: `type_rue invalide pour terrain ${i + 1}` };
    if (typePapier && !TERRAIN_VENTE_PAPIER_TYPES.includes(typePapier)) return { error: `type_papier invalide pour terrain ${i + 1}` };
    const surfaceM2 = toNullableNumber(row.surface_m2);
    if (!surfaceM2 || surfaceM2 <= 0) return { error: `surface_m2 obligatoire pour terrain ${i + 1}` };
    terrains.push({
      index: i + 1,
      reference: (row.reference ? String(row.reference).trim().toUpperCase() : buildChildReference(baseReference, 'TRN', i + 1)),
      type_terrain: typeTerrain,
      surface_m2: surfaceM2,
      type_rue: typeRue,
      type_papier: typePapier,
      terrain_zone: row.terrain_zone ? String(row.terrain_zone).trim() : null,
      terrain_distance_plage_m: toNullableNumber(row.terrain_distance_plage_m),
      terrain_constructible: toFlag(row.terrain_constructible),
      terrain_angle: toFlag(row.terrain_angle),
    });
  }

  const prixM2Unique = toNullableNumber(payload.lotissement_prix_m2_unique);
  const prixTotal = toNullableNumber(payload.lotissement_prix_total);
  const rawPaliers = Array.isArray(payload.lotissement_paliers_prix_m2) ? payload.lotissement_paliers_prix_m2 : [];
  let paliers = [];

  if (modePrixM2 === 'm2_unique') {
    if (!prixM2Unique || prixM2Unique <= 0) return { error: 'lotissement_prix_m2_unique obligatoire (> 0)' };
  } else {
    paliers = rawPaliers
      .map((row) => ({
        min_m2: Number(row?.min_m2 || 0),
        max_m2: toNullableNumber(row?.max_m2),
        prix_m2: Number(row?.prix_m2 || 0),
      }))
      .filter((row) => row.min_m2 > 0 && row.prix_m2 > 0);
    if (paliers.length === 0) return { error: 'lotissement_paliers_prix_m2 obligatoire en mode paliers' };
  }

  return {
    nbTerrains,
    prixTotal,
    modePrixM2,
    prixM2Unique: modePrixM2 === 'm2_unique' ? prixM2Unique : null,
    terrainsJson: JSON.stringify(terrains),
    paliersPrixM2Json: modePrixM2 === 'paliers' ? JSON.stringify(paliers) : null,
  };
}

function normalizeImmeubleVenteDetails(mode, type, payload = {}) {
  const isImmeubleVente = mode === 'vente' && type === 'immeuble';
  const toNullableNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const toFlag = (value) => value === true || value === 1 || value === '1';

  if (!isImmeubleVente) {
    return {
      typeRue: null,
      typePapier: null,
      detailsJson: null,
      appartementsJson: null,
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

  const nbAppartements = Math.max(0, Math.floor(toNullableNumber(payload.immeuble_nb_appartements) || 0));
  const nbGarages = Math.max(0, Math.floor(toNullableNumber(payload.immeuble_nb_garages) || 0));
  const nbLocauxCommerciaux = Math.max(0, Math.floor(toNullableNumber(payload.immeuble_nb_locaux_commerciaux) || 0));
  const baseReference = payload.reference || payload.titre || 'IMMEUBLE';
  const inputRows = Array.isArray(payload.immeuble_appartements) ? payload.immeuble_appartements : [];
  const inputGarages = Array.isArray(payload.immeuble_garages) ? payload.immeuble_garages : [];
  const inputLocaux = Array.isArray(payload.immeuble_locaux_commerciaux) ? payload.immeuble_locaux_commerciaux : [];
  const appartements = [];
  for (let i = 0; i < nbAppartements; i += 1) {
    const row = inputRows[i] || {};
    appartements.push({
      index: i + 1,
      reference: (row.reference ? String(row.reference).trim().toUpperCase() : buildChildReference(baseReference, 'APT', i + 1)),
      chambres: Math.max(0, Math.floor(toNullableNumber(row.chambres) || 0)),
      salle_bain: Math.max(0, Math.floor(toNullableNumber(row.salle_bain) || 0)),
      superficie_m2: toNullableNumber(row.superficie_m2),
      configuration: row.configuration ? String(row.configuration).trim() : null,
    });
  }
  const garages = [];
  for (let i = 0; i < nbGarages; i += 1) {
    const row = inputGarages[i] || {};
    garages.push({
      index: i + 1,
      reference: (row.reference ? String(row.reference).trim().toUpperCase() : buildChildReference(baseReference, 'GAR', i + 1)),
    });
  }
  const locauxCommerciaux = [];
  for (let i = 0; i < nbLocauxCommerciaux; i += 1) {
    const row = inputLocaux[i] || {};
    locauxCommerciaux.push({
      index: i + 1,
      reference: (row.reference ? String(row.reference).trim().toUpperCase() : buildChildReference(baseReference, 'LOC', i + 1)),
    });
  }

  const details = {
    surface_terrain_m2: toNullableNumber(payload.immeuble_surface_terrain_m2),
    surface_batie_m2: toNullableNumber(payload.immeuble_surface_batie_m2),
    nb_niveaux: Math.max(0, Math.floor(toNullableNumber(payload.immeuble_nb_niveaux) || 0)),
    nb_garages: nbGarages,
    nb_appartements: nbAppartements,
    nb_locaux_commerciaux: nbLocauxCommerciaux,
    distance_plage_m: toNullableNumber(payload.immeuble_distance_plage_m),
    proche_plage: toFlag(payload.immeuble_proche_plage),
    ascenseur: toFlag(payload.immeuble_ascenseur),
    parking_sous_sol: toFlag(payload.immeuble_parking_sous_sol),
    parking_exterieur: toFlag(payload.immeuble_parking_exterieur),
    syndic: toFlag(payload.immeuble_syndic),
    vue_mer: toFlag(payload.immeuble_vue_mer),
    garages,
    locaux_commerciaux: locauxCommerciaux,
  };

  return {
    typeRue,
    typePapier,
    detailsJson: JSON.stringify(details),
    appartementsJson: JSON.stringify(appartements),
  };
}

function deriveBedroomsFromConfiguration(configuration) {
  if (!configuration) return 0;
  const match = String(configuration).match(/S\s*\+\s*(\d+)/i);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeVenteTarification(mode, type, payload = {}) {
  const toNullableNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const toMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

  if (mode !== 'vente') {
    return {
      tarificationMethode: null,
      prixAfficheClient: null,
      prixFixeProprietaire: null,
      prixFinal: null,
      revenuAgence: null,
      commissionPourcentageProprietaire: null,
      commissionPourcentageClient: null,
      montantMaxReductionNegociation: null,
      prixMinimumAccepte: null,
    };
  }

  let prixAfficheClient = toNullableNumber(payload.prix_affiche_client ?? payload.prix_nuitee);
  if ((prixAfficheClient === null || prixAfficheClient <= 0) && type === 'terrain') {
    const surfaceTerrain = toNullableNumber(payload.terrain_surface_m2);
    const prixParM2 = toNullableNumber(payload.terrain_prix_affiche_par_m2);
    if (surfaceTerrain && surfaceTerrain > 0 && prixParM2 && prixParM2 > 0) {
      prixAfficheClient = toMoney(surfaceTerrain * prixParM2);
    }
  }
  if ((prixAfficheClient === null || prixAfficheClient <= 0) && type === 'lotissement') {
    const prixTotal = toNullableNumber(payload.lotissement_prix_total);
    if (prixTotal && prixTotal > 0) {
      prixAfficheClient = toMoney(prixTotal);
    }
  }
  if (prixAfficheClient === null || prixAfficheClient <= 0) {
    return {
      tarificationMethode: null,
      prixAfficheClient: null,
      prixFixeProprietaire: null,
      prixFinal: null,
      revenuAgence: null,
      commissionPourcentageProprietaire: null,
      commissionPourcentageClient: null,
      montantMaxReductionNegociation: null,
      prixMinimumAccepte: null,
    };
  }

  const tarificationMethode = String(payload.tarification_methode || 'avec_commission');
  if (!TARIFICATION_METHODES.includes(tarificationMethode)) {
    return { error: 'tarification_methode invalide' };
  }

  if (tarificationMethode === 'avec_commission') {
    const commissionPourcentageProprietaire = toNullableNumber(payload.commission_pourcentage_proprietaire) ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT;
    const commissionPourcentageClient = toNullableNumber(payload.commission_pourcentage_client) ?? DEFAULT_COMMISSION_CLIENT_PERCENT;
    if (commissionPourcentageProprietaire < 0 || commissionPourcentageClient < 0) {
      return { error: 'les pourcentages de commission doivent etre >= 0' };
    }

    const commissionPartProprietaire = toMoney((prixAfficheClient * commissionPourcentageProprietaire) / 100);
    const supplementPartClient = toMoney((prixAfficheClient * commissionPourcentageClient) / 100);
    const prixFixeProprietaire = toMoney(prixAfficheClient - commissionPartProprietaire);
    if (prixFixeProprietaire < 0) {
      return { error: 'prix_fixe_proprietaire negatif: verifier la commission proprietaire' };
    }

    return {
      tarificationMethode,
      prixAfficheClient: toMoney(prixAfficheClient),
      prixFixeProprietaire,
      prixFinal: toMoney(prixAfficheClient + supplementPartClient),
      revenuAgence: toMoney(commissionPartProprietaire + supplementPartClient),
      commissionPourcentageProprietaire,
      commissionPourcentageClient,
      montantMaxReductionNegociation: null,
      prixMinimumAccepte: null,
    };
  }

  const prixFixeProprietaire = toNullableNumber(payload.prix_fixe_proprietaire);
  if (prixFixeProprietaire === null || prixFixeProprietaire <= 0) {
    return { error: 'prix_fixe_proprietaire invalide (doit etre > 0)' };
  }
  if (prixFixeProprietaire > prixAfficheClient) {
    return { error: 'prix_fixe_proprietaire ne peut pas depasser le prix_affiche_client' };
  }

  const revenuAgence = toMoney(prixAfficheClient - prixFixeProprietaire);
  const montantMaxReductionNegociation = toNullableNumber(payload.montant_max_reduction_negociation) ?? 0;
  if (montantMaxReductionNegociation < 0) {
    return { error: 'montant_max_reduction_negociation doit etre >= 0' };
  }
  if (montantMaxReductionNegociation > revenuAgence) {
    return { error: 'montant_max_reduction_negociation ne peut pas depasser le revenu_agence' };
  }

  return {
    tarificationMethode,
    prixAfficheClient: toMoney(prixAfficheClient),
    prixFixeProprietaire: toMoney(prixFixeProprietaire),
    prixFinal: toMoney(prixAfficheClient),
    revenuAgence,
    commissionPourcentageProprietaire: 0,
    commissionPourcentageClient: 0,
    montantMaxReductionNegociation: toMoney(montantMaxReductionNegociation),
    prixMinimumAccepte: toMoney(prixAfficheClient - montantMaxReductionNegociation),
  };
}

function normalizeVentePaiement(mode, totalPrixClient, payload = {}) {
  const toNullableNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const toMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const toPositiveInt = (value) => {
    const numeric = toNullableNumber(value);
    if (numeric === null) return null;
    return Math.floor(numeric);
  };

  if (mode !== 'vente') {
    return {
      modalitePaiementVente: null,
      pourcentagePremierePartiePromesse: null,
      montantPremierePartiePromesse: null,
      montantDeuxiemePartie: null,
      nombreTranches: null,
      periodeTranchesMois: null,
      montantParTranche: null,
    };
  }

  const total = Number(totalPrixClient || 0);
  if (!Number.isFinite(total) || total <= 0) {
    return {
      modalitePaiementVente: null,
      pourcentagePremierePartiePromesse: null,
      montantPremierePartiePromesse: null,
      montantDeuxiemePartie: null,
      nombreTranches: null,
      periodeTranchesMois: null,
      montantParTranche: null,
    };
  }

  const modalitePaiementVente = String(payload.modalite_paiement_vente || 'comptant');
  if (!MODALITES_PAIEMENT_VENTE.includes(modalitePaiementVente)) {
    return { error: 'modalite_paiement_vente invalide' };
  }

  if (modalitePaiementVente === 'comptant') {
    return {
      modalitePaiementVente,
      pourcentagePremierePartiePromesse: 100,
      montantPremierePartiePromesse: toMoney(total),
      montantDeuxiemePartie: 0,
      nombreTranches: null,
      periodeTranchesMois: null,
      montantParTranche: null,
    };
  }

  const pourcentagePremierePartiePromesse = toNullableNumber(payload.pourcentage_premiere_partie_promesse)
    ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE;
  if (pourcentagePremierePartiePromesse <= 0 || pourcentagePremierePartiePromesse >= 100) {
    return { error: 'pourcentage_premiere_partie_promesse doit etre > 0 et < 100' };
  }

  const nombreTranches = toPositiveInt(payload.nombre_tranches);
  if (nombreTranches === null || nombreTranches <= 0) {
    return { error: 'nombre_tranches invalide (doit etre > 0)' };
  }

  const periodeTranchesMois = toPositiveInt(payload.periode_tranches_mois);
  if (periodeTranchesMois === null || periodeTranchesMois <= 0) {
    return { error: 'periode_tranches_mois invalide (doit etre > 0)' };
  }

  const montantPremierePartiePromesse = toMoney((total * pourcentagePremierePartiePromesse) / 100);
  const montantDeuxiemePartie = toMoney(total - montantPremierePartiePromesse);
  const montantParTranche = toMoney(montantDeuxiemePartie / nombreTranches);

  return {
    modalitePaiementVente,
    pourcentagePremierePartiePromesse,
    montantPremierePartiePromesse,
    montantDeuxiemePartie,
    nombreTranches,
    periodeTranchesMois,
    montantParTranche,
  };
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

  const normalizedIds = Array.isArray(caracteristiqueIds) ? Array.from(new Set(caracteristiqueIds.map((id) => String(id || '').trim()).filter(Boolean))) : [];
  const [existingRows] = await pool.query(
    'SELECT caracteristique_id FROM bien_caracteristiques WHERE bien_id = ?',
    [bienId]
  );
  const existingIds = new Set(existingRows.map((row) => String(row.caracteristique_id || '').trim()).filter(Boolean));

  const toDelete = [...existingIds].filter((id) => !normalizedIds.includes(id));
  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => '?').join(',');
    await pool.query(
      `DELETE FROM bien_caracteristiques WHERE bien_id = ? AND caracteristique_id IN (${placeholders})`,
      [bienId, ...toDelete]
    );
  }

  if (normalizedIds.length === 0) return;

  const toInsert = normalizedIds.filter((id) => !existingIds.has(id));
  if (toInsert.length === 0) return;

  const placeholders = toInsert.map(() => '?').join(',');
  const [featureRows] = await pool.query(
    `SELECT id, COALESCE(visibilite_client, 1) AS visibilite_client
     FROM caracteristiques
     WHERE id IN (${placeholders})`,
    toInsert
  );
  const visibilityById = new Map(featureRows.map((row) => [String(row.id), Number(row.visibilite_client) === 0 ? 0 : 1]));

  for (const caracteristiqueId of toInsert) {
    await pool.query(
      `INSERT INTO bien_caracteristiques (
        bien_id, caracteristique_id, visibilite_client, override_nom, override_type_caracteristique, override_unite, override_onglet_id
      ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL)`,
      [bienId, caracteristiqueId, visibilityById.get(caracteristiqueId) ?? 1]
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

  const [authProviderRows] = await pool.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'utilisateurs'
       AND COLUMN_NAME = 'auth_provider'
     LIMIT 1`
  );
  const authProviderColumnType = String(authProviderRows?.[0]?.column_type || '');
  if (authProviderColumnType && !authProviderColumnType.includes("'phone'")) {
    await pool.query(
      "ALTER TABLE utilisateurs MODIFY COLUMN auth_provider ENUM('local', 'google', 'facebook', 'phone') NOT NULL DEFAULT 'local'"
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

  if (!(await columnExists('utilisateurs', 'telephone'))) {
    await pool.query(
      'ALTER TABLE utilisateurs ADD COLUMN telephone VARCHAR(30) NULL'
    );
  }

  if (!(await columnExists('utilisateurs', 'cin'))) {
    await pool.query(
      'ALTER TABLE utilisateurs ADD COLUMN cin VARCHAR(50) NULL'
    );
  }

  if (!(await columnExists('utilisateurs', 'cin_image_url'))) {
    await pool.query(
      'ALTER TABLE utilisateurs ADD COLUMN cin_image_url VARCHAR(500) NULL'
    );
  }

  if (!(await columnExists('utilisateurs', 'profile_completed_at'))) {
    await pool.query(
      'ALTER TABLE utilisateurs ADD COLUMN profile_completed_at DATETIME NULL'
    );
  }

  if (!(await columnExists('utilisateurs', 'updated_at'))) {
    await pool.query(
      'ALTER TABLE utilisateurs ADD COLUMN updated_at DATETIME NULL'
    );
  }

  if (!(await columnExists('utilisateurs', 'client_type'))) {
    await pool.query(
      "ALTER TABLE utilisateurs ADD COLUMN client_type ENUM('proprietaire', 'locataire', 'acheteur') NULL"
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
  if (!(await columnExists('biens', 'visible_sur_site'))) {
    await pool.query(
      'ALTER TABLE biens ADD COLUMN visible_sur_site TINYINT(1) NOT NULL DEFAULT 1 AFTER statut'
    );
  }
  if (!(await columnExists('biens', 'ui_config_json'))) {
    await pool.query(
      'ALTER TABLE biens ADD COLUMN ui_config_json LONGTEXT NULL AFTER visible_sur_site'
    );
  }

  if (!(await columnExists('biens', 'tarification_methode'))) {
    await pool.query(
      "ALTER TABLE biens ADD COLUMN tarification_methode ENUM('avec_commission','sans_commission') NULL DEFAULT NULL AFTER caution"
    );
  }
  if (!(await columnExists('biens', 'prix_affiche_client'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN prix_affiche_client DECIMAL(12,2) NULL DEFAULT NULL AFTER tarification_methode');
  }
  if (!(await columnExists('biens', 'prix_fixe_proprietaire'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN prix_fixe_proprietaire DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_affiche_client');
  }
  if (!(await columnExists('biens', 'prix_final'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN prix_final DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_fixe_proprietaire');
  }
  if (!(await columnExists('biens', 'revenu_agence'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN revenu_agence DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_final');
  }
  if (!(await columnExists('biens', 'commission_pourcentage_proprietaire'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN commission_pourcentage_proprietaire DECIMAL(5,2) NULL DEFAULT NULL AFTER revenu_agence');
  }
  if (!(await columnExists('biens', 'commission_pourcentage_client'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN commission_pourcentage_client DECIMAL(5,2) NULL DEFAULT NULL AFTER commission_pourcentage_proprietaire');
  }
  if (!(await columnExists('biens', 'montant_max_reduction_negociation'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN montant_max_reduction_negociation DECIMAL(12,2) NULL DEFAULT NULL AFTER commission_pourcentage_client');
  }
  if (!(await columnExists('biens', 'prix_minimum_accepte'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN prix_minimum_accepte DECIMAL(12,2) NULL DEFAULT NULL AFTER montant_max_reduction_negociation');
  }
  if (!(await columnExists('biens', 'modalite_paiement_vente'))) {
    await pool.query(
      "ALTER TABLE biens ADD COLUMN modalite_paiement_vente ENUM('comptant','facilite') NULL DEFAULT NULL AFTER prix_minimum_accepte"
    );
  }
  if (!(await columnExists('biens', 'pourcentage_premiere_partie_promesse'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN pourcentage_premiere_partie_promesse DECIMAL(5,2) NULL DEFAULT NULL AFTER modalite_paiement_vente');
  }
  if (!(await columnExists('biens', 'montant_premiere_partie_promesse'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN montant_premiere_partie_promesse DECIMAL(12,2) NULL DEFAULT NULL AFTER pourcentage_premiere_partie_promesse');
  }
  if (!(await columnExists('biens', 'montant_deuxieme_partie'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN montant_deuxieme_partie DECIMAL(12,2) NULL DEFAULT NULL AFTER montant_premiere_partie_promesse');
  }
  if (!(await columnExists('biens', 'nombre_tranches'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN nombre_tranches INT NULL DEFAULT NULL AFTER montant_deuxieme_partie');
  }
  if (!(await columnExists('biens', 'periode_tranches_mois'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN periode_tranches_mois INT NULL DEFAULT NULL AFTER nombre_tranches');
  }
  if (!(await columnExists('biens', 'montant_par_tranche'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN montant_par_tranche DECIMAL(12,2) NULL DEFAULT NULL AFTER periode_tranches_mois');
  }
  if (!(await columnExists('media', 'motif_upload'))) {
    await pool.query('ALTER TABLE media ADD COLUMN motif_upload VARCHAR(255) NULL DEFAULT NULL AFTER url');
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
  if (!(await columnExists('biens', 'surface_local_m2'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN surface_local_m2 DECIMAL(10,2) NULL DEFAULT NULL AFTER electricite_steg');
  }
  if (!(await columnExists('biens', 'facade_m'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN facade_m DECIMAL(10,2) NULL DEFAULT NULL AFTER surface_local_m2');
  }
  if (!(await columnExists('biens', 'hauteur_plafond_m'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN hauteur_plafond_m DECIMAL(10,2) NULL DEFAULT NULL AFTER facade_m');
  }
  if (!(await columnExists('biens', 'activite_recommandee'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN activite_recommandee VARCHAR(255) NULL DEFAULT NULL AFTER hauteur_plafond_m');
  }
  if (!(await columnExists('biens', 'toilette'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN toilette TINYINT(1) NOT NULL DEFAULT 0 AFTER activite_recommandee');
  }
  if (!(await columnExists('biens', 'reserve_local'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN reserve_local TINYINT(1) NOT NULL DEFAULT 0 AFTER toilette');
  }
  if (!(await columnExists('biens', 'vitrine'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN vitrine TINYINT(1) NOT NULL DEFAULT 0 AFTER reserve_local');
  }
  if (!(await columnExists('biens', 'coin_angle'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN coin_angle TINYINT(1) NOT NULL DEFAULT 0 AFTER vitrine');
  }
  if (!(await columnExists('biens', 'electricite_3_phases'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN electricite_3_phases TINYINT(1) NOT NULL DEFAULT 0 AFTER coin_angle');
  }
  if (!(await columnExists('biens', 'alarme'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN alarme TINYINT(1) NOT NULL DEFAULT 0 AFTER electricite_3_phases');
  }
  if (!(await columnExists('biens', 'type_terrain'))) {
    await pool.query("ALTER TABLE biens ADD COLUMN type_terrain ENUM('agricole','habitation','industrielle','loisir') NULL DEFAULT NULL AFTER alarme");
  }
  if (!(await columnExists('biens', 'terrain_facade_m'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrain_facade_m DECIMAL(10,2) NULL DEFAULT NULL AFTER type_terrain');
  }
  if (!(await columnExists('biens', 'terrain_surface_m2'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrain_surface_m2 DECIMAL(10,2) NULL DEFAULT NULL AFTER terrain_facade_m');
  }
  if (!(await columnExists('biens', 'terrain_distance_plage_m'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrain_distance_plage_m INT NULL DEFAULT NULL AFTER terrain_surface_m2');
  }
  if (!(await columnExists('biens', 'terrain_zone'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrain_zone VARCHAR(255) NULL DEFAULT NULL AFTER terrain_distance_plage_m');
  }
  if (!(await columnExists('biens', 'terrain_constructible'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrain_constructible TINYINT(1) NOT NULL DEFAULT 0 AFTER terrain_zone');
  }
  if (!(await columnExists('biens', 'terrain_angle'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrain_angle TINYINT(1) NOT NULL DEFAULT 0 AFTER terrain_constructible');
  }
  if (!(await columnExists('biens', 'terrain_prix_affiche_total'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrain_prix_affiche_total DECIMAL(12,2) NULL DEFAULT NULL AFTER terrain_angle');
  }
  if (!(await columnExists('biens', 'terrain_prix_affiche_par_m2'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrain_prix_affiche_par_m2 DECIMAL(12,2) NULL DEFAULT NULL AFTER terrain_prix_affiche_total');
  }
  if (!(await columnExists('biens', 'terrain_mode_affichage_prix'))) {
    await pool.query("ALTER TABLE biens ADD COLUMN terrain_mode_affichage_prix ENUM('total_uniquement','m2_uniquement','total_et_m2') NULL DEFAULT NULL AFTER terrain_prix_affiche_par_m2");
  }
  if (!(await columnExists('biens', 'terrain_details_json'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN terrain_details_json LONGTEXT NULL AFTER terrain_mode_affichage_prix');
  }
  if (!(await columnExists('biens', 'lotissement_nb_terrains'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_nb_terrains INT NULL DEFAULT NULL AFTER terrain_details_json');
  }
  if (!(await columnExists('biens', 'lotissement_prix_total'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_prix_total DECIMAL(12,2) NULL DEFAULT NULL AFTER lotissement_nb_terrains');
  }
  if (!(await columnExists('biens', 'lotissement_mode_prix_m2'))) {
    await pool.query("ALTER TABLE biens ADD COLUMN lotissement_mode_prix_m2 ENUM('m2_unique','paliers') NULL DEFAULT NULL AFTER lotissement_prix_total");
  }
  if (!(await columnExists('biens', 'lotissement_prix_m2_unique'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_prix_m2_unique DECIMAL(12,2) NULL DEFAULT NULL AFTER lotissement_mode_prix_m2');
  }
  if (!(await columnExists('biens', 'lotissement_terrains_json'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_terrains_json LONGTEXT NULL AFTER lotissement_prix_m2_unique');
  }
  if (!(await columnExists('biens', 'lotissement_paliers_prix_m2_json'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN lotissement_paliers_prix_m2_json LONGTEXT NULL AFTER lotissement_terrains_json');
  }
  if (!(await columnExists('biens', 'immeuble_details_json'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN immeuble_details_json LONGTEXT NULL AFTER terrain_angle');
  }
  if (!(await columnExists('biens', 'immeuble_appartements_json'))) {
    await pool.query('ALTER TABLE biens ADD COLUMN immeuble_appartements_json LONGTEXT NULL AFTER immeuble_details_json');
  }

  await pool.query(
    "ALTER TABLE biens MODIFY COLUMN type ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow','S1','S2','S3','S4','villa','local') NOT NULL"
  );

  if (!(await indexExists('biens', 'idx_biens_mode_type'))) {
    const modeColumn = (await columnExists('biens', 'mode')) ? 'mode' : 'mode_bien';
    await pool.query(`CREATE INDEX idx_biens_mode_type ON biens (${modeColumn}, type)`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS caracteristiques (
      id VARCHAR(50) PRIMARY KEY,
      nom VARCHAR(100) NOT NULL UNIQUE,
      type_caracteristique ENUM('simple','choix_multiple','valeur') NOT NULL DEFAULT 'simple',
      choix_json LONGTEXT NULL,
      unite VARCHAR(50) NULL,
      visibilite_client TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_nom (nom)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  if (!(await columnExists('caracteristiques', 'type_caracteristique'))) {
    await pool.query("ALTER TABLE caracteristiques ADD COLUMN type_caracteristique ENUM('simple','choix_multiple','valeur') NOT NULL DEFAULT 'simple' AFTER nom");
  }
  if (!(await columnExists('caracteristiques', 'choix_json'))) {
    await pool.query('ALTER TABLE caracteristiques ADD COLUMN choix_json LONGTEXT NULL AFTER type_caracteristique');
  }
  if (!(await columnExists('caracteristiques', 'unite'))) {
    await pool.query('ALTER TABLE caracteristiques ADD COLUMN unite VARCHAR(50) NULL AFTER choix_json');
  }
  if (!(await columnExists('caracteristiques', 'visibilite_client'))) {
    await pool.query('ALTER TABLE caracteristiques ADD COLUMN visibilite_client TINYINT(1) NOT NULL DEFAULT 1 AFTER unite');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bien_caracteristiques (
      bien_id VARCHAR(50) NOT NULL,
      caracteristique_id VARCHAR(50) NOT NULL,
      visibilite_client TINYINT(1) NULL DEFAULT NULL,
      override_nom VARCHAR(100) NULL,
      override_type_caracteristique ENUM('simple','choix_multiple','valeur') NULL DEFAULT NULL,
      override_unite VARCHAR(50) NULL,
      override_onglet_id VARCHAR(50) NULL,
      PRIMARY KEY (bien_id, caracteristique_id),
      FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE CASCADE,
      FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE,
      INDEX idx_caracteristique_id (caracteristique_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  if (!(await columnExists('bien_caracteristiques', 'visibilite_client'))) {
    await pool.query('ALTER TABLE bien_caracteristiques ADD COLUMN visibilite_client TINYINT(1) NULL DEFAULT NULL AFTER caracteristique_id');
  }
  if (!(await columnExists('bien_caracteristiques', 'override_nom'))) {
    await pool.query('ALTER TABLE bien_caracteristiques ADD COLUMN override_nom VARCHAR(100) NULL AFTER visibilite_client');
  }
  if (!(await columnExists('bien_caracteristiques', 'override_type_caracteristique'))) {
    await pool.query("ALTER TABLE bien_caracteristiques ADD COLUMN override_type_caracteristique ENUM('simple','choix_multiple','valeur') NULL DEFAULT NULL AFTER override_nom");
  }
  if (!(await columnExists('bien_caracteristiques', 'override_unite'))) {
    await pool.query('ALTER TABLE bien_caracteristiques ADD COLUMN override_unite VARCHAR(50) NULL AFTER override_type_caracteristique');
  }
  if (!(await columnExists('bien_caracteristiques', 'override_onglet_id'))) {
    await pool.query('ALTER TABLE bien_caracteristiques ADD COLUMN override_onglet_id VARCHAR(50) NULL AFTER override_unite');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS caracteristique_contextes (
      id VARCHAR(50) PRIMARY KEY,
      caracteristique_id VARCHAR(50) NOT NULL,
      mode_bien ENUM('vente','location_annuelle','location_saisonniere') NOT NULL,
      type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow') NOT NULL,
      onglet_id VARCHAR(50) NULL,
      UNIQUE KEY uq_car_context (caracteristique_id, mode_bien, type_bien),
      INDEX idx_mode_type (mode_bien, type_bien),
      FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(
    "ALTER TABLE caracteristique_contextes MODIFY COLUMN type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow') NOT NULL"
  );
  if (!(await columnExists('caracteristique_contextes', 'onglet_id'))) {
    await pool.query('ALTER TABLE caracteristique_contextes ADD COLUMN onglet_id VARCHAR(50) NULL AFTER type_bien');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS caracteristique_onglets (
      id VARCHAR(50) PRIMARY KEY,
      mode_bien ENUM('vente','location_annuelle','location_saisonniere') NOT NULL,
      type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow') NOT NULL,
      nom VARCHAR(120) NOT NULL,
      ordre INT NOT NULL DEFAULT 0,
      is_system TINYINT(1) NOT NULL DEFAULT 0,
      UNIQUE KEY uq_mode_type_nom (mode_bien, type_bien, nom),
      INDEX idx_mode_type_ordre (mode_bien, type_bien, ordre)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS modifier_onglets (
      id VARCHAR(50) PRIMARY KEY,
      mode_bien ENUM('vente','location_annuelle','location_saisonniere') NOT NULL,
      type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','lotissement','local_commercial','bungalow') NOT NULL,
      onglet_id VARCHAR(50) NOT NULL,
      caracteristique_id VARCHAR(50) NOT NULL,
      ordre INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_modif_onglet_car (mode_bien, type_bien, caracteristique_id),
      INDEX idx_modif_onglet (mode_bien, type_bien, onglet_id, ordre),
      FOREIGN KEY (onglet_id) REFERENCES caracteristique_onglets(id) ON DELETE CASCADE,
      FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(
    `INSERT INTO modifier_onglets (id, mode_bien, type_bien, onglet_id, caracteristique_id, ordre)
     SELECT CONCAT('mo_', cc.mode_bien, '_', cc.type_bien, '_', cc.caracteristique_id), cc.mode_bien, cc.type_bien, cc.onglet_id, cc.caracteristique_id, 0
     FROM caracteristique_contextes cc
     WHERE cc.onglet_id IS NOT NULL AND cc.onglet_id <> ''
     ON DUPLICATE KEY UPDATE onglet_id = VALUES(onglet_id), ordre = VALUES(ordre)`
  );

  const terrainTabsSeeds = [
    ['informations_generales', 'vente', 'terrain', '1. Informations generales', 1, 1],
    ['dimensions_forme', 'vente', 'terrain', '2. Dimensions & forme', 2, 1],
    ['situation_juridique', 'vente', 'terrain', '3. Situation juridique', 3, 1],
    ['acces_environnement', 'vente', 'terrain', '4. Acces & environnement', 4, 1],
    ['viabilisation', 'vente', 'terrain', '5. Viabilisation', 5, 1],
    ['environnement_naturel', 'vente', 'terrain', '6. Environnement naturel', 6, 1],
    ['ideal_utilisation', 'vente', 'terrain', '7. Ideal pour', 7, 1],
    ['documents_disponibles', 'vente', 'terrain', '8. Documents disponibles', 8, 1],
  ];
  for (const [id, mode_bien, type_bien, nom, ordre, is_system] of terrainTabsSeeds) {
    await pool.query(
      `INSERT INTO caracteristique_onglets (id, mode_bien, type_bien, nom, ordre, is_system)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nom = VALUES(nom), ordre = VALUES(ordre), is_system = VALUES(is_system)`,
      [id, mode_bien, type_bien, nom, ordre, is_system]
    );
  }

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
      ('car21', 'Electricite STEG'),
      ('car22', 'Toilette'),
      ('car23', 'Reserve'),
      ('car24', 'Vitrine'),
      ('car25', 'Coin d angle'),
      ('car26', 'Electricite 3 phases'),
      ('car27', 'Alarme'),
      ('car28', 'Constructible'),
      ('car29', 'Terrain d angle'),
      ('car30', 'Terrain agricole'),
      ('car31', 'Terrain habitation'),
      ('car32', 'Terrain industrielle'),
      ('car33', 'Terrain loisir'),
      ('car34', 'Parking sous-sol'),
      ('car35', 'Parking extérieur')
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
    ['ctx28', 'car14', 'vente', 'local_commercial'],
    ['ctx29', 'car19', 'vente', 'local_commercial'],
    ['ctx30', 'car20', 'vente', 'local_commercial'],
    ['ctx31', 'car21', 'vente', 'local_commercial'],
    ['ctx32', 'car22', 'vente', 'local_commercial'],
    ['ctx33', 'car23', 'vente', 'local_commercial'],
    ['ctx34', 'car24', 'vente', 'local_commercial'],
    ['ctx35', 'car25', 'vente', 'local_commercial'],
    ['ctx36', 'car26', 'vente', 'local_commercial'],
    ['ctx37', 'car27', 'vente', 'local_commercial'],
    ['ctx47', 'car7', 'vente', 'immeuble'],
    ['ctx48', 'car34', 'vente', 'immeuble'],
    ['ctx49', 'car35', 'vente', 'immeuble'],
    ['ctx50', 'car16', 'vente', 'immeuble'],
    ['ctx51', 'car4', 'vente', 'immeuble'],
    ['ctx52', 'car11', 'vente', 'immeuble'],
    ['ctx53', 'car19', 'vente', 'immeuble'],
    ['ctx54', 'car20', 'vente', 'immeuble'],
    ['ctx55', 'car21', 'vente', 'immeuble'],
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
    `INSERT INTO utilisateurs (id, nom, email, role, avatar, created_at, auth_provider, provider_user_id, last_login_at, updated_at)
     VALUES (?, ?, ?, 'user', ?, CURDATE(), ?, ?, ?, ?) AS new_user
     ON DUPLICATE KEY UPDATE
       nom = new_user.nom,
       avatar = new_user.avatar,
       auth_provider = new_user.auth_provider,
       provider_user_id = new_user.provider_user_id,
       last_login_at = new_user.last_login_at,
       updated_at = new_user.updated_at`,
    [userId, name, email.toLowerCase(), avatar || null, provider, providerUserId || null, now, now]
  );

  const [rows] = await pool.query(
    `SELECT id, nom, email, role, avatar, telephone, cin, cin_image_url, profile_completed_at, client_type,
            auth_provider, provider_user_id, last_login_at, updated_at
     FROM utilisateurs
     WHERE email = ? LIMIT 1`,
    [email.toLowerCase()]
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    email: rows[0].email,
    name: rows[0].nom,
    role: rows[0].role,
    avatar: rows[0].avatar || null,
    clientType: rows[0].client_type || null,
    telephone: rows[0].telephone || null,
    cin: rows[0].cin || null,
    cinImageUrl: rows[0].cin_image_url || null,
    authProvider: rows[0].auth_provider,
    providerUserId: rows[0].provider_user_id || null,
    lastLoginAt: rows[0].last_login_at || null,
    updatedAt: rows[0].updated_at || null,
    profileCompleted: Boolean(rows[0].profile_completed_at && rows[0].telephone && rows[0].client_type),
  };
}

function normalizePhoneNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return `${hasPlus ? '+' : ''}${digits}`;
}

function buildPhonePlaceholderEmail(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return `phone_${digits || Date.now()}@phone.dwira.local`;
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

async function upsertPhoneUser({ telephone }) {
  const normalizedPhone = normalizePhoneNumber(telephone);
  const now = getAgencySqlDateTime();
  const [existingRows] = await pool.query(
    `SELECT id, nom, email, role, avatar, telephone, cin, cin_image_url, profile_completed_at, client_type,
            auth_provider, provider_user_id, last_login_at, updated_at
     FROM utilisateurs
     WHERE telephone = ?
     LIMIT 1`,
    [normalizedPhone]
  );

  if (existingRows[0]) {
    await pool.query(
      `UPDATE utilisateurs
       SET auth_provider = 'phone',
           provider_user_id = ?,
           last_login_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [normalizedPhone.replace(/\D/g, ''), now, now, existingRows[0].id]
    );
    return {
      id: existingRows[0].id,
      email: existingRows[0].email,
      name: existingRows[0].nom,
      role: existingRows[0].role,
      avatar: existingRows[0].avatar || null,
      clientType: existingRows[0].client_type || null,
      telephone: existingRows[0].telephone || null,
      cin: existingRows[0].cin || null,
      cinImageUrl: existingRows[0].cin_image_url || null,
      profileCompleted: Boolean(
        existingRows[0].profile_completed_at &&
        existingRows[0].telephone &&
        existingRows[0].client_type &&
        existingRows[0].email &&
        !String(existingRows[0].email).endsWith('@phone.dwira.local')
      ),
    };
  }

  const userId = `u${Date.now()}`;
  const placeholderEmail = buildPhonePlaceholderEmail(normalizedPhone);
  const displayName = `Client ${maskPhone(normalizedPhone)}`;
  await pool.query(
    `INSERT INTO utilisateurs (
      id, nom, email, role, avatar, telephone, created_at, auth_provider, provider_user_id, last_login_at, updated_at
    ) VALUES (?, ?, ?, 'user', NULL, ?, CURDATE(), 'phone', ?, ?, ?)`,
    [userId, displayName, placeholderEmail, normalizedPhone, normalizedPhone.replace(/\D/g, ''), now, now]
  );

  return {
    id: userId,
    email: placeholderEmail,
    name: displayName,
    role: 'user',
    avatar: null,
    clientType: null,
    telephone: normalizedPhone,
    cin: null,
    cinImageUrl: null,
    profileCompleted: false,
  };
}

async function deliverPhoneOtp({ telephone, code }) {
  const webhookUrl = String(process.env.OTP_PROVIDER_WEBHOOK_URL || '').trim();
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telephone,
        code,
        brand: 'Dwira Immobilier',
        message: `Votre code OTP Dwira Immobilier est ${code}. Il expire dans 5 minutes.`,
      }),
    });
    if (!response.ok) {
      throw new Error('OTP provider request failed');
    }
    return { delivered: true, debugCode: null };
  }

  if (process.env.ALLOW_OTP_IN_RESPONSE === '1') {
    console.log(`OTP fallback for ${telephone}: ${code}`);
    return { delivered: false, debugCode: code };
  }

  throw new Error('otp_provider_missing');
}

async function ensureClientInteractionsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_interactions (
      id VARCHAR(80) PRIMARY KEY,
      client_user_id VARCHAR(50) NULL,
      client_email VARCHAR(100) NULL,
      client_name VARCHAR(150) NULL,
      type ENUM('visite', 'like', 'partage') NOT NULL,
      bien_id VARCHAR(50) NOT NULL,
      property_title VARCHAR(255) NULL,
      source ENUM('site_public', 'admin') NOT NULL DEFAULT 'site_public',
      event_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_client_interactions_user (client_user_id),
      INDEX idx_client_interactions_email (client_email),
      INDEX idx_client_interactions_bien (bien_id),
      INDEX idx_client_interactions_event_at (event_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureClientelesSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clienteles_profiles (
      id VARCHAR(80) PRIMARY KEY,
      source_table ENUM('utilisateurs', 'locataires', 'proprietaires') NOT NULL,
      source_id VARCHAR(50) NOT NULL,
      linked_user_id VARCHAR(50) NULL,
      email VARCHAR(100) NULL,
      global_status ENUM('prospect', 'actif', 'inactif', 'blackliste') NOT NULL DEFAULT 'prospect',
      score_override INT NULL,
      canal_entree ENUM('facebook', 'site_web', 'whatsapp', 'visite_agence', 'recommandation', 'google', 'autre') NULL,
      last_interaction_at DATETIME NULL,
      last_interaction_note TEXT NULL,
      active_roles_json LONGTEXT NULL,
      vip TINYINT(1) NOT NULL DEFAULT 0,
      blacklist_reason TEXT NULL,
      locataire_status ENUM('prospect', 'verification', 'actif', 'incident', 'archive', 'blackliste') NULL,
      loc_cin_validee TINYINT(1) NOT NULL DEFAULT 0,
      loc_contrat_signe TINYINT(1) NOT NULL DEFAULT 0,
      loc_depot_encaisse TINYINT(1) NOT NULL DEFAULT 0,
      loc_justificatif_revenus TINYINT(1) NOT NULL DEFAULT 0,
      loc_attestation_travail TINYINT(1) NOT NULL DEFAULT 0,
      loc_nb_personnes INT NULL,
      loc_jour_echeance INT NULL,
      loc_penalite_mode ENUM('jour', 'mois') NULL,
      loc_penalite_valeur DECIMAL(10,2) NULL,
      saison_min_nuits INT NULL,
      saison_max_nuits INT NULL,
      saison_capacite_max INT NULL,
      saison_jours_arrivee_json LONGTEXT NULL,
      saison_jours_depart_json LONGTEXT NULL,
      saison_acompte_pourcentage DECIMAL(5,2) NULL,
      saison_documents_recus TINYINT(1) NOT NULL DEFAULT 0,
      saison_depot_bloque TINYINT(1) NOT NULL DEFAULT 0,
      saison_depot_retenu_montant DECIMAL(10,2) NULL,
      saison_depot_retenu_motif TEXT NULL,
      acheteur_status ENUM('lead_brut', 'qualifie', 'recherche', 'visite_planifiee', 'offre_en_cours', 'compromis_signe', 'vendu', 'perdu') NULL,
      acheteur_zones_json LONGTEXT NULL,
      acheteur_types_json LONGTEXT NULL,
      acheteur_budget_min DECIMAL(12,2) NULL,
      acheteur_budget_max DECIMAL(12,2) NULL,
      acheteur_surface_min DECIMAL(10,2) NULL,
      acheteur_distance_plage_max INT NULL,
      acheteur_financement_mode VARCHAR(120) NULL,
      acheteur_next_action ENUM('rappeler', 'envoyer_offres', 'programmer_visite') NULL,
      acheteur_action_due_at DATETIME NULL,
      proprietaire_status ENUM('prospect', 'mandat_location', 'mandat_vente', 'actif', 'inactif', 'blackliste') NULL,
      proprietaire_mandat_type ENUM('gestion_locative', 'vente') NULL,
      proprietaire_mandat_start DATE NULL,
      proprietaire_mandat_end DATE NULL,
      proprietaire_reversement_frequence ENUM('mensuel', 'trimestriel') NULL,
      proprietaire_mode_paiement ENUM('virement', 'especes', 'cheque') NULL,
      proprietaire_commission_percent DECIMAL(5,2) NULL DEFAULT 10.00,
      proprietaire_plafond_travaux DECIMAL(10,2) NULL DEFAULT 200.00,
      proprietaire_last_statement_at DATE NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_clienteles_source (source_table, source_id),
      INDEX idx_clienteles_email (email),
      INDEX idx_clienteles_linked_user (linked_user_id),
      INDEX idx_clienteles_global_status (global_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function parseJsonArrayField(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseBooleanFlag(value) {
  return value === true || value === 1 || value === '1';
}

function normalizeClienteleProfileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    linkedUserId: row.linked_user_id || null,
    email: row.email || '',
    globalStatus: row.global_status || 'prospect',
    scoreOverride: row.score_override === null || row.score_override === undefined ? null : Number(row.score_override),
    canalEntree: row.canal_entree || null,
    lastInteractionAt: row.last_interaction_at || null,
    lastInteractionNote: row.last_interaction_note || '',
    activeRoles: parseJsonArrayField(row.active_roles_json),
    vip: parseBooleanFlag(row.vip),
    blacklistReason: row.blacklist_reason || '',
    locataireStatus: row.locataire_status || null,
    locCinValidee: parseBooleanFlag(row.loc_cin_validee),
    locContratSigne: parseBooleanFlag(row.loc_contrat_signe),
    locDepotEncaisse: parseBooleanFlag(row.loc_depot_encaisse),
    locJustificatifRevenus: parseBooleanFlag(row.loc_justificatif_revenus),
    locAttestationTravail: parseBooleanFlag(row.loc_attestation_travail),
    locNbPersonnes: row.loc_nb_personnes === null || row.loc_nb_personnes === undefined ? null : Number(row.loc_nb_personnes),
    locJourEcheance: row.loc_jour_echeance === null || row.loc_jour_echeance === undefined ? null : Number(row.loc_jour_echeance),
    locPenaliteMode: row.loc_penalite_mode || null,
    locPenaliteValeur: row.loc_penalite_valeur === null || row.loc_penalite_valeur === undefined ? null : Number(row.loc_penalite_valeur),
    saisonMinNuits: row.saison_min_nuits === null || row.saison_min_nuits === undefined ? null : Number(row.saison_min_nuits),
    saisonMaxNuits: row.saison_max_nuits === null || row.saison_max_nuits === undefined ? null : Number(row.saison_max_nuits),
    saisonCapaciteMax: row.saison_capacite_max === null || row.saison_capacite_max === undefined ? null : Number(row.saison_capacite_max),
    saisonJoursArrivee: parseJsonArrayField(row.saison_jours_arrivee_json),
    saisonJoursDepart: parseJsonArrayField(row.saison_jours_depart_json),
    saisonAcomptePourcentage: row.saison_acompte_pourcentage === null || row.saison_acompte_pourcentage === undefined ? null : Number(row.saison_acompte_pourcentage),
    saisonDocumentsRecus: parseBooleanFlag(row.saison_documents_recus),
    saisonDepotBloque: parseBooleanFlag(row.saison_depot_bloque),
    saisonDepotRetenuMontant: row.saison_depot_retenu_montant === null || row.saison_depot_retenu_montant === undefined ? null : Number(row.saison_depot_retenu_montant),
    saisonDepotRetenuMotif: row.saison_depot_retenu_motif || '',
    acheteurStatus: row.acheteur_status || null,
    acheteurZones: parseJsonArrayField(row.acheteur_zones_json),
    acheteurTypes: parseJsonArrayField(row.acheteur_types_json),
    acheteurBudgetMin: row.acheteur_budget_min === null || row.acheteur_budget_min === undefined ? null : Number(row.acheteur_budget_min),
    acheteurBudgetMax: row.acheteur_budget_max === null || row.acheteur_budget_max === undefined ? null : Number(row.acheteur_budget_max),
    acheteurSurfaceMin: row.acheteur_surface_min === null || row.acheteur_surface_min === undefined ? null : Number(row.acheteur_surface_min),
    acheteurDistancePlageMax: row.acheteur_distance_plage_max === null || row.acheteur_distance_plage_max === undefined ? null : Number(row.acheteur_distance_plage_max),
    acheteurFinancementMode: row.acheteur_financement_mode || '',
    acheteurNextAction: row.acheteur_next_action || null,
    acheteurActionDueAt: row.acheteur_action_due_at || null,
    proprietaireStatus: row.proprietaire_status || null,
    proprietaireMandatType: row.proprietaire_mandat_type || null,
    proprietaireMandatStart: row.proprietaire_mandat_start || null,
    proprietaireMandatEnd: row.proprietaire_mandat_end || null,
    proprietaireReversementFrequence: row.proprietaire_reversement_frequence || null,
    proprietaireModePaiement: row.proprietaire_mode_paiement || null,
    proprietaireCommissionPercent: row.proprietaire_commission_percent === null || row.proprietaire_commission_percent === undefined ? null : Number(row.proprietaire_commission_percent),
    proprietairePlafondTravaux: row.proprietaire_plafond_travaux === null || row.proprietaire_plafond_travaux === undefined ? null : Number(row.proprietaire_plafond_travaux),
    proprietaireLastStatementAt: row.proprietaire_last_statement_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchClienteleProfileBySource(sourceTable, sourceId) {
  const [rows] = await pool.query(
    'SELECT * FROM clienteles_profiles WHERE source_table = ? AND source_id = ? LIMIT 1',
    [sourceTable, String(sourceId || '').trim()]
  );
  return normalizeClienteleProfileRow(rows?.[0] || null);
}

function isMandatValidForMode(profile, mode) {
  if (!profile) return false;
  const now = new Date().toISOString().split('T')[0];
  const start = profile.proprietaireMandatStart || null;
  const end = profile.proprietaireMandatEnd || null;
  const mandatType = profile.proprietaireMandatType || null;
  const typeMatches = mode === 'vente' ? mandatType === 'vente' : mandatType === 'gestion_locative';
  if (!typeMatches) return false;
  if (!start || start > now) return false;
  if (end && end < now) return false;
  return true;
}

function scoreBuyerMatch(profile, bien) {
  if (!profile || !bien) return { score: 0, reasons: [] };
  let score = 0;
  const reasons = [];
  const budgetMin = profile.acheteurBudgetMin == null ? null : Number(profile.acheteurBudgetMin);
  const budgetMax = profile.acheteurBudgetMax == null ? null : Number(profile.acheteurBudgetMax);
  const surfaceMin = profile.acheteurSurfaceMin == null ? null : Number(profile.acheteurSurfaceMin);
  const distancePlageMax = profile.acheteurDistancePlageMax == null ? null : Number(profile.acheteurDistancePlageMax);
  const wantedTypes = Array.isArray(profile.acheteurTypes) ? profile.acheteurTypes.map((item) => String(item).trim()).filter(Boolean) : [];
  const wantedZones = Array.isArray(profile.acheteurZones) ? profile.acheteurZones.map((item) => normalizeText(item)).filter(Boolean) : [];
  const bienTitle = String(bien.titre || '');
  const bienType = String(bien.type || '');
  const bienZone = normalizeText(bien.zone_nom || '');
  const bienPrice = Number(bien.prix_nuitee || 0);
  const bienSurface = bien.superficie_m2 == null ? null : Number(bien.superficie_m2);
  const bienDistancePlage = bien.distance_plage_m == null ? null : Number(bien.distance_plage_m);

  if (wantedTypes.length === 0 || wantedTypes.includes(bienType)) {
    score += wantedTypes.length > 0 ? 30 : 10;
    reasons.push(`Type ${bienType || bienTitle}`);
  }
  if (wantedZones.length === 0 || wantedZones.includes(bienZone)) {
    score += wantedZones.length > 0 ? 25 : 10;
    reasons.push(`Zone ${bien.zone_nom || 'compatible'}`);
  }
  if ((budgetMin === null || bienPrice >= budgetMin) && (budgetMax === null || bienPrice <= budgetMax)) {
    score += 25;
    reasons.push('Budget compatible');
  }
  if (surfaceMin === null || (bienSurface !== null && bienSurface >= surfaceMin)) {
    score += 10;
    reasons.push('Surface compatible');
  }
  if (distancePlageMax === null || (bienDistancePlage !== null && bienDistancePlage <= distancePlageMax)) {
    score += 10;
    reasons.push('Distance plage compatible');
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

const RESERVATION_DEMAND_STATUSES = new Set([
  'en_attente_reponse_proprietaire',
  'pas_de_reponse_proprietaire',
  'reponse_positive_attente_confirmation_client',
  'reponse_negative_autre_proposition_meme_bien',
  'reponse_negative_autre_proposition_bien_similaire',
  'attente_envoi_coordonnees_contrat',
  'contrat_realise',
  'succes_paiement',
]);

function normalizeReservationDemandStatus(value) {
  const normalized = String(value || '').trim();
  return RESERVATION_DEMAND_STATUSES.has(normalized) ? normalized : 'en_attente_reponse_proprietaire';
}

function formatReservationDemandRow(row) {
  if (!row) return null;
  return {
    ...row,
    request_type: row.request_type === 'visite' ? 'visite' : 'reservation',
    guests: Number(row.guests || 1),
    owner_notified_at: row.owner_notified_at || null,
    owner_response_at: row.owner_response_at || null,
    finalization_due_at: row.finalization_due_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function appendReservationDemandHistory(demandId, status, actorType, actorId, note, createdAt = getAgencySqlDateTime()) {
  const historyId = `rdh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO reservation_demand_history (id, demand_id, status, actor_type, actor_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [historyId, demandId, status, actorType, actorId || null, note || null, createdAt]
  );
}

async function createAdminNotification(type, message, createdAt = getAgencySqlDateTime()) {
  const notificationId = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    'INSERT INTO admin_notifications (id, type, message, lu, created_at) VALUES (?, ?, ?, 0, ?)',
    [notificationId, type || 'info', message, createdAt]
  );
  return notificationId;
}

async function syncClienteleTasks(sourceTable, sourceId) {
  const profile = await fetchClienteleProfileBySource(sourceTable, sourceId);
  const now = new Date();
  const nowSql = getAgencySqlDateTime(now);
  const tasks = [];
  let clientEmail = profile?.email || null;

  if (sourceTable === 'locataires' && !clientEmail) {
    const [locataireRows] = await pool.query('SELECT email FROM locataires WHERE id = ? LIMIT 1', [sourceId]);
    clientEmail = locataireRows[0]?.email || null;
  }
  if (sourceTable === 'proprietaires' && !clientEmail) {
    const [ownerRows] = await pool.query('SELECT email FROM proprietaires WHERE id = ? LIMIT 1', [sourceId]);
    clientEmail = ownerRows[0]?.email || null;
  }

  if (sourceTable === 'locataires') {
    const [contracts] = await pool.query('SELECT * FROM contrats WHERE locataire_id = ?', [sourceId]);
    if (contracts.length > 0) {
      const contractIds = contracts.map((item) => item.id);
      const [payments] = await pool.query(
        `SELECT * FROM paiements WHERE contrat_id IN (${contractIds.map(() => '?').join(', ')})`,
        contractIds
      );

      payments
        .filter((payment) => payment.statut === 'retard')
        .forEach((payment) => {
          const paymentDate = new Date(payment.date_paiement);
          if (Number.isNaN(paymentDate.getTime())) return;
          const daysLate = Math.floor((now.getTime() - paymentDate.getTime()) / (24 * 60 * 60 * 1000));
          if (daysLate >= 7) {
            tasks.push({
              taskType: 'relance_retard_7j',
              severity: 'critical',
              title: 'Envoyer relance 1',
              detail: `Paiement ${payment.id} en retard depuis ${daysLate} jour(s).`,
              dueDate: payment.date_paiement,
              relatedEntityType: 'paiement',
              relatedEntityId: payment.id,
            });
          }
        });

      contracts.forEach((contrat) => {
        const contractEnd = new Date(contrat.date_fin);
        if (Number.isNaN(contractEnd.getTime())) return;
        const daysToEnd = Math.ceil((contractEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (daysToEnd >= 0 && daysToEnd <= 30) {
          tasks.push({
            taskType: 'renouvellement_contrat',
            severity: 'warning',
            title: 'Proposer renouvellement',
            detail: `Contrat ${contrat.id} arrive a echeance dans ${daysToEnd} jour(s).`,
            dueDate: contrat.date_fin,
            relatedEntityType: 'contrat',
            relatedEntityId: contrat.id,
          });
        }
      });
    }
  }

  if (sourceTable === 'utilisateurs') {
    const [userRows] = await pool.query('SELECT id, email FROM utilisateurs WHERE id = ? LIMIT 1', [sourceId]);
    const user = userRows[0];
    const profileStatus = String(profile?.acheteurStatus || '');
    if (user && profileStatus === 'recherche') {
      const [interactionRows] = await pool.query(
        `SELECT event_at
         FROM client_interactions
         WHERE client_user_id = ? OR (client_email IS NOT NULL AND client_email = ?)
         ORDER BY event_at DESC
         LIMIT 1`,
        [sourceId, user.email || '']
      );
      const lastInteractionAt = interactionRows[0]?.event_at || profile?.lastInteractionAt || null;
      const lastInteractionDate = lastInteractionAt ? new Date(String(lastInteractionAt).replace(' ', 'T')) : null;
      const inactiveDays = !lastInteractionDate || Number.isNaN(lastInteractionDate.getTime())
        ? 999
        : Math.floor((now.getTime() - lastInteractionDate.getTime()) / (24 * 60 * 60 * 1000));
      if (inactiveDays > 15) {
        tasks.push({
          taskType: 'relance_acheteur',
          severity: 'warning',
          title: 'Relancer l acheteur',
          detail: 'Aucun contact recent depuis plus de 15 jours.',
          dueDate: nowSql,
          relatedEntityType: 'utilisateur',
          relatedEntityId: sourceId,
        });
      }
    }

    if (profile) {
      const [saleBiens] = await pool.query(
        `SELECT b.id, b.reference, b.titre, b.type, b.prix_nuitee, b.superficie_m2, b.distance_plage_m, z.nom AS zone_nom
         FROM biens b
         LEFT JOIN zones z ON z.id = b.zone_id
         WHERE b.mode = 'vente'`
      );
      saleBiens
        .map((bien) => ({ bien, match: scoreBuyerMatch(profile, bien) }))
        .filter((item) => item.match.score >= 80)
        .sort((a, b) => b.match.score - a.match.score)
        .slice(0, 3)
        .forEach(({ bien, match }) => {
          tasks.push({
            taskType: 'nouvelle_offre',
            severity: 'info',
            title: 'Envoyer nouvelle offre',
            detail: `${bien.reference || bien.id} - ${bien.titre} correspond a ${match.score}%.`,
            relatedEntityType: 'bien',
            relatedEntityId: bien.id,
          });
        });
    }
  }

  if (sourceTable === 'proprietaires') {
    const plafond = Number(profile?.proprietairePlafondTravaux || 200);
    const lastStatementAt = profile?.proprietaireLastStatementAt ? new Date(String(profile.proprietaireLastStatementAt).replace(' ', 'T')) : null;
    const monthsWithoutStatement = !lastStatementAt || Number.isNaN(lastStatementAt.getTime())
      ? 999
      : (now.getTime() - lastStatementAt.getTime()) / (24 * 60 * 60 * 1000 * 30);
    if (monthsWithoutStatement >= 3) {
      tasks.push({
        taskType: 'releve_proprietaire',
        severity: 'warning',
        title: 'Preparer releve',
        detail: 'Aucun releve envoye depuis plusieurs mois.',
        relatedEntityType: 'proprietaire',
        relatedEntityId: sourceId,
      });
    }

    const [ownerBiens] = await pool.query('SELECT id FROM biens WHERE proprietaire_id = ?', [sourceId]);
    if (ownerBiens.length > 0) {
      const bienIds = ownerBiens.map((item) => item.id);
      const [maintenanceRows] = await pool.query(
        `SELECT id, cout FROM maintenance WHERE bien_id IN (${bienIds.map(() => '?').join(', ')})`,
        bienIds
      );
      maintenanceRows
        .filter((item) => Number(item.cout || 0) > plafond)
        .forEach((item) => {
          tasks.push({
            taskType: 'accord_travaux_proprietaire',
            severity: 'warning',
            title: 'Accord proprietaire requis',
            detail: `Maintenance ${item.id} depasse le plafond autorise (${plafond} DT).`,
            relatedEntityType: 'maintenance',
            relatedEntityId: item.id,
          });
        });
    }
  }

  if (sourceTable === 'utilisateurs' || sourceTable === 'locataires') {
    const reservationParams = [];
    const reservationWhere = [];
    if (sourceTable === 'utilisateurs') {
      reservationWhere.push('client_user_id = ?');
      reservationParams.push(sourceId);
    }
    if (clientEmail) {
      reservationWhere.push('client_email = ?');
      reservationParams.push(clientEmail);
    }
    if (reservationWhere.length > 0) {
      const [reservationRows] = await pool.query(
        `SELECT id, bien_id, start_date, end_date, status, request_type
         FROM reservation_demands
         WHERE ${reservationWhere.join(' OR ')}
           AND status IN (
             'en_attente_reponse_proprietaire',
             'pas_de_reponse_proprietaire',
             'reponse_positive_attente_confirmation_client',
             'reponse_negative_autre_proposition_meme_bien',
             'reponse_negative_autre_proposition_bien_similaire',
             'attente_envoi_coordonnees_contrat'
           )
         ORDER BY created_at DESC`,
        reservationParams
      );
      reservationRows.forEach((demand) => {
        const requestLabel = demand.request_type === 'visite' ? 'Demande de visite' : 'Demande de reservation';
        tasks.push({
          taskType: 'demande_reservation',
          severity: demand.status === 'en_attente_reponse_proprietaire' ? 'warning' : 'info',
          title: `${requestLabel} en attente`,
          detail: `Demande ${demand.id} pour le bien ${demand.bien_id} du ${demand.start_date} au ${demand.end_date}.`,
          dueDate: `${demand.start_date} 00:00:00`,
          relatedEntityType: 'reservation_demand',
          relatedEntityId: demand.id,
        });
      });
    }
  }

  if (sourceTable === 'proprietaires') {
    const [reservationRows] = await pool.query(
      `SELECT id, bien_id, start_date, end_date, status, request_type
       FROM reservation_demands
       WHERE proprietaire_id = ?
         AND status IN ('en_attente_reponse_proprietaire', 'pas_de_reponse_proprietaire')
       ORDER BY created_at DESC`,
      [sourceId]
    );
    reservationRows.forEach((demand) => {
      const requestLabel = demand.request_type === 'visite' ? 'visite' : 'reservation';
      tasks.push({
        taskType: 'demande_client_proprietaire',
        severity: 'warning',
        title: 'Reponse proprietaire attendue',
        detail: `Demande de ${requestLabel} ${demand.id} sur le bien ${demand.bien_id} attend une reponse proprietaire.`,
        dueDate: `${demand.start_date} 00:00:00`,
        relatedEntityType: 'reservation_demand',
        relatedEntityId: demand.id,
      });
    });
  }

  await pool.query('DELETE FROM clienteles_tasks WHERE source_table = ? AND source_id = ?', [sourceTable, sourceId]);

  for (const task of tasks) {
    const taskId = `ct_${sourceTable}_${sourceId}_${task.taskType}_${task.relatedEntityId || 'none'}`
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .slice(0, 100);
    await pool.query(
      `INSERT INTO clienteles_tasks (
        id, source_table, source_id, task_type, severity, title, detail, due_date,
        related_entity_type, related_entity_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [
        taskId,
        sourceTable,
        sourceId,
        task.taskType,
        task.severity,
        task.title,
        task.detail || null,
        task.dueDate || null,
        task.relatedEntityType || null,
        task.relatedEntityId || null,
        nowSql,
        nowSql,
      ]
    );
  }

  const [rows] = await pool.query(
    `SELECT
      id,
      source_table AS sourceTable,
      source_id AS sourceId,
      task_type AS taskType,
      severity,
      title,
      detail,
      DATE_FORMAT(due_date, '%Y-%m-%d %H:%i:%s') AS dueDate,
      related_entity_type AS relatedEntityType,
      related_entity_id AS relatedEntityId,
      status,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
     FROM clienteles_tasks
     WHERE source_table = ? AND source_id = ?
     ORDER BY severity DESC, due_date IS NULL, due_date ASC, created_at DESC`,
    [sourceTable, sourceId]
  );

  return rows || [];
}

console.log('🔄 Connecting to database...');
pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
    return ensureAuthSchema();
  })
  .then(() => ensureAdminNotificationsSchema())
  .then(() => ensureClientInteractionsSchema())
  .then(() => ensureClientelesSchema())
  .then(() => ensureMaintenanceWorkflowSchema())
  .then(() => ensureClientelesTasksSchema())
  .then(() => ensureReservationDemandSchema())
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
          SELECT GROUP_CONCAT(COALESCE(bc.override_nom, c.nom) SEPARATOR '||')
          FROM bien_caracteristiques bc
          INNER JOIN caracteristiques c ON c.id = bc.caracteristique_id
          WHERE bc.bien_id = b.id AND COALESCE(bc.visibilite_client, c.visibilite_client, 1) = 1
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
          SELECT GROUP_CONCAT(COALESCE(bc.override_nom, c.nom) SEPARATOR '||')
          FROM bien_caracteristiques bc
          INNER JOIN caracteristiques c ON c.id = bc.caracteristique_id
          WHERE bc.bien_id = b.id AND COALESCE(bc.visibilite_client, c.visibilite_client, 1) = 1
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
      prix_nuitee, avance, caution, statut, visible_sur_site, ui_config, menage_en_cours, zone_id, proprietaire_id, caracteristique_ids,
      tarification_methode, prix_affiche_client, prix_fixe_proprietaire, commission_pourcentage_proprietaire, commission_pourcentage_client, montant_max_reduction_negociation,
      modalite_paiement_vente, pourcentage_premiere_partie_promesse, nombre_tranches, periode_tranches_mois,
      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,
      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg,
      surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette, reserve_local, vitrine, coin_angle, electricite_3_phases, alarme,
      type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle,
      terrain_prix_affiche_total, terrain_prix_affiche_par_m2, terrain_mode_affichage_prix,
      terrain_disponibilite_reseaux, terrain_hauteur_construction_autorisee, terrain_route_acces_largeur_m, terrain_forme, terrain_topographie, terrain_bornage,
      terrain_travaux_municipalite_autorises, terrain_limites_cadastrales, terrain_visualisation_limites_cadastrales, terrain_voisinage,
      terrain_proximites_commodites, terrain_proximites_commodites_autres,
      terrain_viabilisation_eau_sources, terrain_viabilisation_onas, terrain_viabilisation_steg, terrain_viabilisation_gaz_ville, terrain_viabilisation_fibre_optique, terrain_viabilisation_telephone_fixe,
      terrain_type_sol, terrain_vegetation, terrain_niveau_sonore, terrain_risque_inondation, terrain_exposition_vent,
      terrain_ideal_utilisations, terrain_documents_disponibles,
      lotissement_nb_terrains, lotissement_prix_total, lotissement_mode_prix_m2, lotissement_prix_m2_unique, lotissement_terrains, lotissement_paliers_prix_m2,
      immeuble_surface_terrain_m2, immeuble_surface_batie_m2, immeuble_nb_niveaux, immeuble_nb_garages, immeuble_nb_appartements, immeuble_nb_locaux_commerciaux, immeuble_distance_plage_m,
      immeuble_proche_plage, immeuble_ascenseur, immeuble_parking_sous_sol, immeuble_parking_exterieur, immeuble_syndic, immeuble_vue_mer, immeuble_appartements, immeuble_garages, immeuble_locaux_commerciaux
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
    const localDetails = normalizeLocalCommercialVenteDetails(resolvedMode, resolvedType, {
      type_rue, type_papier, surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette,
      reserve_local, vitrine, coin_angle, electricite_3_phases, gaz_ville, alarme, eau_puits, eau_sonede, electricite_steg
    });
    if (localDetails.error) {
      return res.status(400).json({ error: localDetails.error });
    }

    const terrainDetails = normalizeTerrainVenteDetails(resolvedMode, resolvedType, {
      type_rue, type_papier, type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle,
      terrain_prix_affiche_total, terrain_prix_affiche_par_m2, terrain_mode_affichage_prix,
      terrain_disponibilite_reseaux, terrain_hauteur_construction_autorisee, terrain_route_acces_largeur_m, terrain_forme, terrain_topographie, terrain_bornage,
      terrain_travaux_municipalite_autorises, terrain_limites_cadastrales, terrain_visualisation_limites_cadastrales, terrain_voisinage,
      terrain_proximites_commodites, terrain_proximites_commodites_autres,
      terrain_viabilisation_eau_sources, terrain_viabilisation_onas, terrain_viabilisation_steg, terrain_viabilisation_gaz_ville, terrain_viabilisation_fibre_optique, terrain_viabilisation_telephone_fixe,
      terrain_type_sol, terrain_vegetation, terrain_niveau_sonore, terrain_risque_inondation, terrain_exposition_vent,
      terrain_ideal_utilisations, terrain_documents_disponibles,
      eau_puits, eau_sonede, electricite_steg
    });
    if (terrainDetails.error) {
      return res.status(400).json({ error: terrainDetails.error });
    }
    const providedReference = String(reference || '').trim().toUpperCase();
    const resolvedReference = isStructuredBienReference(providedReference, resolvedMode, resolvedType)
      ? providedReference
      : await generateStructuredBienReference({
          mode: resolvedMode,
          type: resolvedType,
          titre,
          zoneId: zone_id,
          proprietaireId: proprietaire_id,
        });

    const lotissementDetails = normalizeLotissementVenteDetails(resolvedMode, resolvedType, {
      reference: resolvedReference, titre, lotissement_nb_terrains, lotissement_prix_total, lotissement_mode_prix_m2, lotissement_prix_m2_unique, lotissement_terrains, lotissement_paliers_prix_m2
    });
    if (lotissementDetails.error) {
      return res.status(400).json({ error: lotissementDetails.error });
    }
    const immeubleDetails = normalizeImmeubleVenteDetails(resolvedMode, resolvedType, {
      reference: resolvedReference, titre, type_rue, type_papier, immeuble_surface_terrain_m2, immeuble_surface_batie_m2, immeuble_nb_niveaux, immeuble_nb_garages, immeuble_nb_appartements,
      immeuble_nb_locaux_commerciaux, immeuble_distance_plage_m, immeuble_proche_plage, immeuble_ascenseur, immeuble_parking_sous_sol, immeuble_parking_exterieur,
      immeuble_syndic, immeuble_vue_mer, immeuble_appartements, immeuble_garages, immeuble_locaux_commerciaux
    });
    if (immeubleDetails.error) {
      return res.status(400).json({ error: immeubleDetails.error });
    }
    const venteTarification = normalizeVenteTarification(resolvedMode, resolvedType, {
      prix_nuitee,
      prix_affiche_client,
      terrain_surface_m2,
      terrain_prix_affiche_par_m2,
      lotissement_prix_total,
      prix_fixe_proprietaire,
      tarification_methode,
      commission_pourcentage_proprietaire,
      commission_pourcentage_client,
      montant_max_reduction_negociation,
    });
    if (venteTarification.error) {
      return res.status(400).json({ error: venteTarification.error });
    }

    const shouldPublish = !(visible_sur_site === false || Number(visible_sur_site) === 0);
    if (shouldPublish && proprietaire_id) {
      const ownerProfile = await fetchClienteleProfileBySource('proprietaires', proprietaire_id);
      if (!isMandatValidForMode(ownerProfile, resolvedMode)) {
        return res.status(400).json({ error: 'Publication impossible: mandat proprietaire manquant, invalide ou expire' });
      }
    }

    const resolvedNbChambres = (resolvedMode === 'vente' && resolvedType === 'appartement')
      ? deriveBedroomsFromConfiguration(details.configuration)
      : (resolvedMode === 'vente' && resolvedType === 'local_commercial')
        ? 0
        : (resolvedMode === 'vente' && (resolvedType === 'terrain' || resolvedType === 'lotissement'))
          ? 0
        : Number(nb_chambres || 0);
    const resolvedNbSalleBain = (resolvedMode === 'vente' && (resolvedType === 'local_commercial' || resolvedType === 'terrain' || resolvedType === 'lotissement'))
      ? 0
      : Number(nb_salle_bain || 0);

    const bienId = id || ('b' + Date.now());
    const created_at = new Date().toISOString().split('T')[0];
    const updated_at = created_at;
    const resolvedPrixNuitee = resolvedMode === 'vente'
      ? Number(venteTarification.prixAfficheClient || 0)
      : Number(prix_nuitee || 0);
    const totalPrixClientVente = resolvedMode === 'vente'
      ? Number(venteTarification.prixFinal || 0)
      : 0;
    const paiementVente = normalizeVentePaiement(resolvedMode, totalPrixClientVente, {
      modalite_paiement_vente,
      pourcentage_premiere_partie_promesse,
      nombre_tranches,
      periode_tranches_mois,
    });
    if (paiementVente.error) {
      return res.status(400).json({ error: paiementVente.error });
    }

    await pool.query(
      `INSERT INTO biens (id, reference, titre, description, mode, type, nb_chambres, nb_salle_bain, 
        prix_nuitee, avance, caution, type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
        proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville, cuisine_equipee, place_parking,
        syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg, surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette, reserve_local, vitrine, coin_angle, electricite_3_phases, alarme,
        type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle, immeuble_details_json, immeuble_appartements_json, statut, visible_sur_site, ui_config_json, menage_en_cours, zone_id, proprietaire_id, 
        date_ajout, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bienId, resolvedReference, titre, description || null, resolvedMode, resolvedType, resolvedNbChambres, resolvedNbSalleBain,
       resolvedPrixNuitee, avance || 0, caution || 0, details.typeRue, details.typePapier, details.superficieM2, details.etage, details.configuration, details.anneeConstruction, details.distancePlageM,
       details.prochePlage ? 1 : 0, details.chauffageCentral ? 1 : 0, details.climatisation ? 1 : 0, details.balcon ? 1 : 0, details.terrasse ? 1 : 0, details.ascenseur ? 1 : 0, details.vueMer ? 1 : 0, details.gazVille ? 1 : 0, details.cuisineEquipee ? 1 : 0, details.placeParking ? 1 : 0,
       details.syndic ? 1 : 0, details.meuble ? 1 : 0, details.independant ? 1 : 0,
       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.eauPuits ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.eauPuits ? 1 : 0) : (details.eauPuits ? 1 : 0))),
       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.eauSonede ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.eauSonede ? 1 : 0) : (details.eauSonede ? 1 : 0))),
       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.electriciteSteg ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.electriciteSteg ? 1 : 0) : (details.electriciteSteg ? 1 : 0))),
       localDetails.surfaceM2, localDetails.facadeM, localDetails.hauteurPlafondM, localDetails.activiteRecommandee,
       localDetails.toilette ? 1 : 0, localDetails.reserveLocal ? 1 : 0, localDetails.vitrine ? 1 : 0, localDetails.coinAngle ? 1 : 0, localDetails.electricite3Phases ? 1 : 0, localDetails.alarme ? 1 : 0,
       terrainDetails.typeTerrain, terrainDetails.facadeM, terrainDetails.surfaceM2, terrainDetails.distancePlageM, terrainDetails.zoneTerrain, terrainDetails.constructible ? 1 : 0, terrainDetails.terrainAngle ? 1 : 0,
       immeubleDetails.detailsJson, immeubleDetails.appartementsJson,
       statut || 'disponible',
       visible_sur_site === false || Number(visible_sur_site) === 0 ? 0 : 1,
       ui_config && typeof ui_config === 'object' ? JSON.stringify(ui_config) : null,
       menage_en_cours ? 1 : 0, zone_id || null, proprietaire_id || null,
       created_at, created_at, updated_at]
    );

    await pool.query(
      `UPDATE biens
       SET tarification_methode = ?, prix_affiche_client = ?, prix_fixe_proprietaire = ?, prix_final = ?, revenu_agence = ?,
           commission_pourcentage_proprietaire = ?, commission_pourcentage_client = ?, montant_max_reduction_negociation = ?, prix_minimum_accepte = ?,
           modalite_paiement_vente = ?, pourcentage_premiere_partie_promesse = ?, montant_premiere_partie_promesse = ?, montant_deuxieme_partie = ?,
           nombre_tranches = ?, periode_tranches_mois = ?, montant_par_tranche = ?,
           terrain_prix_affiche_total = ?, terrain_prix_affiche_par_m2 = ?, terrain_mode_affichage_prix = ?, terrain_details_json = ?,
           lotissement_nb_terrains = ?, lotissement_prix_total = ?, lotissement_mode_prix_m2 = ?, lotissement_prix_m2_unique = ?, lotissement_terrains_json = ?, lotissement_paliers_prix_m2_json = ?
       WHERE id = ?`,
      [
        venteTarification.tarificationMethode,
        venteTarification.prixAfficheClient,
        venteTarification.prixFixeProprietaire,
        venteTarification.prixFinal,
        venteTarification.revenuAgence,
        venteTarification.commissionPourcentageProprietaire,
        venteTarification.commissionPourcentageClient,
        venteTarification.montantMaxReductionNegociation,
        venteTarification.prixMinimumAccepte,
        paiementVente.modalitePaiementVente,
        paiementVente.pourcentagePremierePartiePromesse,
        paiementVente.montantPremierePartiePromesse,
        paiementVente.montantDeuxiemePartie,
        paiementVente.nombreTranches,
        paiementVente.periodeTranchesMois,
        paiementVente.montantParTranche,
        terrainDetails.prixAfficheTotal,
        terrainDetails.prixAfficheParM2,
        terrainDetails.modeAffichagePrix,
        terrainDetails.terrainDetailsJson,
        lotissementDetails.nbTerrains,
        lotissementDetails.prixTotal,
        lotissementDetails.modePrixM2,
        lotissementDetails.prixM2Unique,
        lotissementDetails.terrainsJson,
        lotissementDetails.paliersPrixM2Json,
        bienId,
      ]
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
      prix_nuitee, avance, caution, statut, visible_sur_site, ui_config, menage_en_cours, zone_id, proprietaire_id, caracteristique_ids,
      tarification_methode, prix_affiche_client, prix_fixe_proprietaire, commission_pourcentage_proprietaire, commission_pourcentage_client, montant_max_reduction_negociation,
      modalite_paiement_vente, pourcentage_premiere_partie_promesse, nombre_tranches, periode_tranches_mois,
      type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville,
      cuisine_equipee, place_parking, syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg,
      surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette, reserve_local, vitrine, coin_angle, electricite_3_phases, alarme,
      type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle,
      terrain_prix_affiche_total, terrain_prix_affiche_par_m2, terrain_mode_affichage_prix,
      terrain_disponibilite_reseaux, terrain_hauteur_construction_autorisee, terrain_route_acces_largeur_m, terrain_forme, terrain_topographie, terrain_bornage,
      terrain_travaux_municipalite_autorises, terrain_limites_cadastrales, terrain_visualisation_limites_cadastrales, terrain_voisinage,
      terrain_proximites_commodites, terrain_proximites_commodites_autres,
      terrain_viabilisation_eau_sources, terrain_viabilisation_onas, terrain_viabilisation_steg, terrain_viabilisation_gaz_ville, terrain_viabilisation_fibre_optique, terrain_viabilisation_telephone_fixe,
      terrain_type_sol, terrain_vegetation, terrain_niveau_sonore, terrain_risque_inondation, terrain_exposition_vent,
      terrain_ideal_utilisations, terrain_documents_disponibles,
      lotissement_nb_terrains, lotissement_prix_total, lotissement_mode_prix_m2, lotissement_prix_m2_unique, lotissement_terrains, lotissement_paliers_prix_m2,
      immeuble_surface_terrain_m2, immeuble_surface_batie_m2, immeuble_nb_niveaux, immeuble_nb_garages, immeuble_nb_appartements, immeuble_nb_locaux_commerciaux, immeuble_distance_plage_m,
      immeuble_proche_plage, immeuble_ascenseur, immeuble_parking_sous_sol, immeuble_parking_exterieur, immeuble_syndic, immeuble_vue_mer, immeuble_appartements, immeuble_garages, immeuble_locaux_commerciaux
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
    const localDetails = normalizeLocalCommercialVenteDetails(resolvedMode, resolvedType, {
      type_rue, type_papier, surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette,
      reserve_local, vitrine, coin_angle, electricite_3_phases, gaz_ville, alarme, eau_puits, eau_sonede, electricite_steg
    });
    if (localDetails.error) {
      return res.status(400).json({ error: localDetails.error });
    }

    const terrainDetails = normalizeTerrainVenteDetails(resolvedMode, resolvedType, {
      type_rue, type_papier, type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle,
      terrain_prix_affiche_total, terrain_prix_affiche_par_m2, terrain_mode_affichage_prix,
      terrain_disponibilite_reseaux, terrain_hauteur_construction_autorisee, terrain_route_acces_largeur_m, terrain_forme, terrain_topographie, terrain_bornage,
      terrain_travaux_municipalite_autorises, terrain_limites_cadastrales, terrain_visualisation_limites_cadastrales, terrain_voisinage,
      terrain_proximites_commodites, terrain_proximites_commodites_autres,
      terrain_viabilisation_eau_sources, terrain_viabilisation_onas, terrain_viabilisation_steg, terrain_viabilisation_gaz_ville, terrain_viabilisation_fibre_optique, terrain_viabilisation_telephone_fixe,
      terrain_type_sol, terrain_vegetation, terrain_niveau_sonore, terrain_risque_inondation, terrain_exposition_vent,
      terrain_ideal_utilisations, terrain_documents_disponibles,
      eau_puits, eau_sonede, electricite_steg
    });
    if (terrainDetails.error) {
      return res.status(400).json({ error: terrainDetails.error });
    }
    const currentId = req.params.id;
    const providedReference = String(reference || '').trim().toUpperCase();
    const resolvedReference = isStructuredBienReference(providedReference, resolvedMode, resolvedType)
      ? providedReference
      : await generateStructuredBienReference({
          mode: resolvedMode,
          type: resolvedType,
          titre,
          zoneId: zone_id,
          proprietaireId: proprietaire_id,
          excludeId: currentId,
        });

    const lotissementDetails = normalizeLotissementVenteDetails(resolvedMode, resolvedType, {
      reference: resolvedReference, titre, lotissement_nb_terrains, lotissement_prix_total, lotissement_mode_prix_m2, lotissement_prix_m2_unique, lotissement_terrains, lotissement_paliers_prix_m2
    });
    if (lotissementDetails.error) {
      return res.status(400).json({ error: lotissementDetails.error });
    }
    const immeubleDetails = normalizeImmeubleVenteDetails(resolvedMode, resolvedType, {
      reference: resolvedReference, titre, type_rue, type_papier, immeuble_surface_terrain_m2, immeuble_surface_batie_m2, immeuble_nb_niveaux, immeuble_nb_garages, immeuble_nb_appartements,
      immeuble_nb_locaux_commerciaux, immeuble_distance_plage_m, immeuble_proche_plage, immeuble_ascenseur, immeuble_parking_sous_sol, immeuble_parking_exterieur,
      immeuble_syndic, immeuble_vue_mer, immeuble_appartements, immeuble_garages, immeuble_locaux_commerciaux
    });
    if (immeubleDetails.error) {
      return res.status(400).json({ error: immeubleDetails.error });
    }
    const venteTarification = normalizeVenteTarification(resolvedMode, resolvedType, {
      prix_nuitee,
      prix_affiche_client,
      terrain_surface_m2,
      terrain_prix_affiche_par_m2,
      lotissement_prix_total,
      prix_fixe_proprietaire,
      tarification_methode,
      commission_pourcentage_proprietaire,
      commission_pourcentage_client,
      montant_max_reduction_negociation,
    });
    if (venteTarification.error) {
      return res.status(400).json({ error: venteTarification.error });
    }

    const shouldPublish = !(visible_sur_site === false || Number(visible_sur_site) === 0);
    if (shouldPublish && proprietaire_id) {
      const ownerProfile = await fetchClienteleProfileBySource('proprietaires', proprietaire_id);
      if (!isMandatValidForMode(ownerProfile, resolvedMode)) {
        return res.status(400).json({ error: 'Publication impossible: mandat proprietaire manquant, invalide ou expire' });
      }
    }

    const resolvedNbChambres = (resolvedMode === 'vente' && resolvedType === 'appartement')
      ? deriveBedroomsFromConfiguration(details.configuration)
      : (resolvedMode === 'vente' && resolvedType === 'local_commercial')
        ? 0
        : (resolvedMode === 'vente' && (resolvedType === 'terrain' || resolvedType === 'lotissement'))
          ? 0
        : Number(nb_chambres || 0);
    const resolvedNbSalleBain = (resolvedMode === 'vente' && (resolvedType === 'local_commercial' || resolvedType === 'terrain' || resolvedType === 'lotissement'))
      ? 0
      : Number(nb_salle_bain || 0);

    const updated_at = new Date().toISOString().split('T')[0];
    const resolvedPrixNuitee = resolvedMode === 'vente'
      ? Number(venteTarification.prixAfficheClient || 0)
      : Number(prix_nuitee || 0);
    const totalPrixClientVente = resolvedMode === 'vente'
      ? Number(venteTarification.prixFinal || 0)
      : 0;
    const paiementVente = normalizeVentePaiement(resolvedMode, totalPrixClientVente, {
      modalite_paiement_vente,
      pourcentage_premiere_partie_promesse,
      nombre_tranches,
      periode_tranches_mois,
    });
    if (paiementVente.error) {
      return res.status(400).json({ error: paiementVente.error });
    }

    await pool.query(
      `UPDATE biens SET 
        reference = ?, titre = ?, description = ?, mode = ?, type = ?, nb_chambres = ?, 
        nb_salle_bain = ?, prix_nuitee = ?, avance = ?, caution = ?, type_rue = ?, type_papier = ?, superficie_m2 = ?, etage = ?, configuration = ?, annee_construction = ?, distance_plage_m = ?,
        proche_plage = ?, chauffage_central = ?, climatisation = ?, balcon = ?, terrasse = ?, ascenseur = ?, vue_mer = ?, gaz_ville = ?, cuisine_equipee = ?, place_parking = ?,
        syndic = ?, meuble = ?, independant = ?, eau_puits = ?, eau_sonede = ?, electricite_steg = ?, surface_local_m2 = ?, facade_m = ?, hauteur_plafond_m = ?, activite_recommandee = ?, toilette = ?, reserve_local = ?, vitrine = ?, coin_angle = ?, electricite_3_phases = ?, alarme = ?,
        type_terrain = ?, terrain_facade_m = ?, terrain_surface_m2 = ?, terrain_distance_plage_m = ?, terrain_zone = ?, terrain_constructible = ?, terrain_angle = ?, immeuble_details_json = ?, immeuble_appartements_json = ?,
        statut = ?, visible_sur_site = ?, ui_config_json = ?, menage_en_cours = ?, zone_id = ?, proprietaire_id = ?, updated_at = ?
       WHERE id = ?`,
      [resolvedReference, titre, description || null, resolvedMode, resolvedType, resolvedNbChambres, resolvedNbSalleBain,
       resolvedPrixNuitee, avance || 0, caution || 0, details.typeRue, details.typePapier, details.superficieM2, details.etage, details.configuration, details.anneeConstruction, details.distancePlageM,
       details.prochePlage ? 1 : 0, details.chauffageCentral ? 1 : 0, details.climatisation ? 1 : 0, details.balcon ? 1 : 0, details.terrasse ? 1 : 0, details.ascenseur ? 1 : 0, details.vueMer ? 1 : 0, details.gazVille ? 1 : 0, details.cuisineEquipee ? 1 : 0, details.placeParking ? 1 : 0,
       details.syndic ? 1 : 0, details.meuble ? 1 : 0, details.independant ? 1 : 0,
       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.eauPuits ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.eauPuits ? 1 : 0) : (details.eauPuits ? 1 : 0))),
       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.eauSonede ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.eauSonede ? 1 : 0) : (details.eauSonede ? 1 : 0))),
       (resolvedMode === 'vente' && resolvedType === 'local_commercial' ? (localDetails.electriciteSteg ? 1 : 0) : (resolvedMode === 'vente' && resolvedType === 'terrain' ? (terrainDetails.electriciteSteg ? 1 : 0) : (details.electriciteSteg ? 1 : 0))),
       localDetails.surfaceM2, localDetails.facadeM, localDetails.hauteurPlafondM, localDetails.activiteRecommandee,
       localDetails.toilette ? 1 : 0, localDetails.reserveLocal ? 1 : 0, localDetails.vitrine ? 1 : 0, localDetails.coinAngle ? 1 : 0, localDetails.electricite3Phases ? 1 : 0, localDetails.alarme ? 1 : 0,
       terrainDetails.typeTerrain, terrainDetails.facadeM, terrainDetails.surfaceM2, terrainDetails.distancePlageM, terrainDetails.zoneTerrain, terrainDetails.constructible ? 1 : 0, terrainDetails.terrainAngle ? 1 : 0,
       immeubleDetails.detailsJson, immeubleDetails.appartementsJson,
       statut || 'disponible',
       visible_sur_site === false || Number(visible_sur_site) === 0 ? 0 : 1,
       ui_config && typeof ui_config === 'object' ? JSON.stringify(ui_config) : null,
       menage_en_cours ? 1 : 0, zone_id || null, proprietaire_id || null,
       updated_at, req.params.id]
    );

    await pool.query(
      `UPDATE biens
       SET tarification_methode = ?, prix_affiche_client = ?, prix_fixe_proprietaire = ?, prix_final = ?, revenu_agence = ?,
           commission_pourcentage_proprietaire = ?, commission_pourcentage_client = ?, montant_max_reduction_negociation = ?, prix_minimum_accepte = ?,
           modalite_paiement_vente = ?, pourcentage_premiere_partie_promesse = ?, montant_premiere_partie_promesse = ?, montant_deuxieme_partie = ?,
           nombre_tranches = ?, periode_tranches_mois = ?, montant_par_tranche = ?,
           terrain_prix_affiche_total = ?, terrain_prix_affiche_par_m2 = ?, terrain_mode_affichage_prix = ?, terrain_details_json = ?,
           lotissement_nb_terrains = ?, lotissement_prix_total = ?, lotissement_mode_prix_m2 = ?, lotissement_prix_m2_unique = ?, lotissement_terrains_json = ?, lotissement_paliers_prix_m2_json = ?
       WHERE id = ?`,
      [
        venteTarification.tarificationMethode,
        venteTarification.prixAfficheClient,
        venteTarification.prixFixeProprietaire,
        venteTarification.prixFinal,
        venteTarification.revenuAgence,
        venteTarification.commissionPourcentageProprietaire,
        venteTarification.commissionPourcentageClient,
        venteTarification.montantMaxReductionNegociation,
        venteTarification.prixMinimumAccepte,
        paiementVente.modalitePaiementVente,
        paiementVente.pourcentagePremierePartiePromesse,
        paiementVente.montantPremierePartiePromesse,
        paiementVente.montantDeuxiemePartie,
        paiementVente.nombreTranches,
        paiementVente.periodeTranchesMois,
        paiementVente.montantParTranche,
        terrainDetails.prixAfficheTotal,
        terrainDetails.prixAfficheParM2,
        terrainDetails.modeAffichagePrix,
        terrainDetails.terrainDetailsJson,
        lotissementDetails.nbTerrains,
        lotissementDetails.prixTotal,
        lotissementDetails.modePrixM2,
        lotissementDetails.prixM2Unique,
        lotissementDetails.terrainsJson,
        lotissementDetails.paliersPrixM2Json,
        req.params.id,
      ]
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

app.put('/api/locataires/:id', async (req, res) => {
  try {
    const { nom, telephone, email, cin, score_fiabilite } = req.body;
    await pool.query(
      'UPDATE locataires SET nom = ?, telephone = ?, email = ?, cin = ?, score_fiabilite = ? WHERE id = ?',
      [nom, telephone, email, cin, score_fiabilite || 5, req.params.id]
    );
    const [updated] = await pool.query('SELECT * FROM locataires WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating locataire:', error);
    res.status(500).json({ error: 'Failed to update locataire' });
  }
});

app.delete('/api/locataires/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM locataires WHERE id = ?', [req.params.id]);
    res.json({ message: 'Locataire deleted' });
  } catch (error) {
    console.error('Error deleting locataire:', error);
    res.status(500).json({ error: 'Failed to delete locataire' });
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
    const locataireProfile = await fetchClienteleProfileBySource('locataires', locataire_id);
    if (locataireProfile && (locataireProfile.globalStatus === 'blackliste' || locataireProfile.locataireStatus === 'blackliste')) {
      return res.status(400).json({ error: 'Creation impossible: ce locataire est blackliste' });
    }
    const id = 'c' + Date.now();
    const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      'INSERT INTO contrats (id, bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, statut, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, bien_id, locataire_id, date_debut, date_fin, montant_recu || 0, url_pdf || null, statut || 'actif', created_at]
    );
    const [matchingDemandRows] = await pool.query(
      `SELECT d.id
       FROM reservation_demands d
       LEFT JOIN locataires l ON l.id = ?
       WHERE d.bien_id = ?
         AND (d.client_user_id = ? OR (l.email IS NOT NULL AND d.client_email = l.email))
         AND d.start_date <= ?
         AND d.end_date >= ?
         AND d.status IN (
           'en_attente_reponse_proprietaire',
           'pas_de_reponse_proprietaire',
           'reponse_positive_attente_confirmation_client',
           'reponse_negative_autre_proposition_meme_bien',
           'reponse_negative_autre_proposition_bien_similaire',
           'attente_envoi_coordonnees_contrat'
         )
       ORDER BY d.created_at DESC
       LIMIT 1`,
      [locataire_id, bien_id, locataire_id, date_fin, date_debut]
    );
    if (matchingDemandRows[0]) {
      const demandUpdatedAt = getAgencySqlDateTime();
      await pool.query(
        `UPDATE reservation_demands
         SET status = 'contrat_realise', contract_id = ?, updated_at = ?
         WHERE id = ?`,
        [id, demandUpdatedAt, matchingDemandRows[0].id]
      );
      await appendReservationDemandHistory(
        matchingDemandRows[0].id,
        'contrat_realise',
        'system',
        id,
        `Contrat ${id} cree automatiquement depuis la demande`,
        demandUpdatedAt
      );
    }
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
    if ((statut || 'en_attente') === 'paye' && contrat_id) {
      const [demandRows] = await pool.query(
        `SELECT id
         FROM reservation_demands
         WHERE contract_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
        [contrat_id]
      );
      if (demandRows[0]) {
        const demandUpdatedAt = getAgencySqlDateTime();
        await pool.query(
          `UPDATE reservation_demands
           SET status = 'succes_paiement', payment_id = ?, updated_at = ?
           WHERE id = ?`,
          [id, demandUpdatedAt, demandRows[0].id]
        );
        await appendReservationDemandHistory(
          demandRows[0].id,
          'succes_paiement',
          'system',
          id,
          `Paiement ${id} enregistre avec succes`,
          demandUpdatedAt
        );
      }
    }
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
      SELECT
        m.*,
        b.titre as bien_titre,
        b.proprietaire_id,
        p.nom as proprietaire_nom
      FROM maintenance m 
      LEFT JOIN biens b ON m.bien_id = b.id
      LEFT JOIN proprietaires p ON p.id = b.proprietaire_id
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
    if (!bien_id || !description) {
      return res.status(400).json({ error: 'Bien et description requis' });
    }
    const id = 'maint' + Date.now();
    const created_at = getAgencySqlDateTime();
    const [bienRows] = await pool.query('SELECT id, titre, proprietaire_id FROM biens WHERE id = ? LIMIT 1', [bien_id]);
    const bien = bienRows[0];
    if (!bien) {
      return res.status(404).json({ error: 'Bien introuvable' });
    }

    let ownerApprovalRequired = 0;
    let ownerApprovalStatus = 'non_requis';
    let resolvedStatut = statut || 'en_cours';
    if (bien.proprietaire_id) {
      const ownerProfile = await fetchClienteleProfileBySource('proprietaires', bien.proprietaire_id);
      const plafond = Number(ownerProfile?.proprietairePlafondTravaux || 200);
      if (Number(cout || 0) > plafond) {
        ownerApprovalRequired = 1;
        ownerApprovalStatus = 'en_attente';
        resolvedStatut = 'en_attente_accord_proprietaire';
      }
    }

    await pool.query(
      `INSERT INTO maintenance (
        id, bien_id, description, cout, statut, owner_approval_required, owner_approval_status, owner_approved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, bien_id, description, cout || 0, resolvedStatut, ownerApprovalRequired, ownerApprovalStatus, null, created_at]
    );
    const [newMaint] = await pool.query(`
      SELECT
        m.*,
        b.titre as bien_titre,
        b.proprietaire_id,
        p.nom as proprietaire_nom
      FROM maintenance m
      LEFT JOIN biens b ON b.id = m.bien_id
      LEFT JOIN proprietaires p ON p.id = b.proprietaire_id
      WHERE m.id = ?`,
      [id]
    );
    res.status(201).json(newMaint[0]);
  } catch (error) {
    console.error('Error creating maintenance:', error);
    res.status(500).json({ error: 'Failed to create maintenance' });
  }
});

app.put('/api/maintenance/:id', async (req, res) => {
  try {
    const { description, cout, statut } = req.body || {};
    const [rows] = await pool.query(
      `SELECT m.*, b.proprietaire_id
       FROM maintenance m
       LEFT JOIN biens b ON b.id = m.bien_id
       WHERE m.id = ?
       LIMIT 1`,
      [req.params.id]
    );
    const current = rows[0];
    if (!current) {
      return res.status(404).json({ error: 'Maintenance introuvable' });
    }

    let ownerApprovalRequired = Number(current.owner_approval_required || 0);
    let ownerApprovalStatus = String(current.owner_approval_status || 'non_requis');
    let ownerApprovedAt = current.owner_approved_at || null;
    const nextCost = cout === undefined ? Number(current.cout || 0) : Number(cout || 0);
    let nextStatus = statut === undefined ? String(current.statut || 'en_cours') : String(statut);

    if (current.proprietaire_id) {
      const ownerProfile = await fetchClienteleProfileBySource('proprietaires', current.proprietaire_id);
      const plafond = Number(ownerProfile?.proprietairePlafondTravaux || 200);
      ownerApprovalRequired = nextCost > plafond ? 1 : 0;
      if (!ownerApprovalRequired) {
        ownerApprovalStatus = 'non_requis';
        ownerApprovedAt = null;
      } else if (nextStatus === 'approuve') {
        ownerApprovalStatus = 'approuve';
        ownerApprovedAt = getAgencySqlDateTime();
      } else if (ownerApprovalStatus !== 'approuve') {
        ownerApprovalStatus = 'en_attente';
        if (nextStatus === 'en_cours') {
          return res.status(400).json({ error: 'Passage en cours impossible: accord proprietaire requis avant travaux' });
        }
        if (nextStatus !== 'termine' && nextStatus !== 'annule') {
          nextStatus = 'en_attente_accord_proprietaire';
        }
      }
    }

    await pool.query(
      `UPDATE maintenance
       SET description = ?, cout = ?, statut = ?, owner_approval_required = ?, owner_approval_status = ?, owner_approved_at = ?
       WHERE id = ?`,
      [
        description === undefined ? current.description : String(description),
        nextCost,
        nextStatus,
        ownerApprovalRequired,
        ownerApprovalStatus,
        ownerApprovedAt,
        req.params.id,
      ]
    );

    const [updatedRows] = await pool.query(`
      SELECT
        m.*,
        b.titre as bien_titre,
        b.proprietaire_id,
        p.nom as proprietaire_nom
      FROM maintenance m
      LEFT JOIN biens b ON b.id = m.bien_id
      LEFT JOIN proprietaires p ON p.id = b.proprietaire_id
      WHERE m.id = ?`,
      [req.params.id]
    );
    res.json(updatedRows[0]);
  } catch (error) {
    console.error('Error updating maintenance:', error);
    res.status(500).json({ error: 'Failed to update maintenance' });
  }
});

// ============================================
// NOTIFICATIONS API
// ============================================

app.get('/api/notifications', async (req, res) => {
  try {
    await ensureAdminNotificationsSchema();
    const [rows] = await pool.query('SELECT id, NULL AS utilisateur_id, type, message, lu, created_at FROM admin_notifications ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const { type, message } = req.body;
    const created_at = new Date().toISOString();
    await ensureAdminNotificationsSchema();
    const id = await createAdminNotification(type || 'info', message, created_at);
    const [newNotif] = await pool.query('SELECT id, NULL AS utilisateur_id, type, message, lu, created_at FROM admin_notifications WHERE id = ?', [id]);
    res.status(201).json(newNotif[0]);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

app.put('/api/notifications/:id/lu', async (req, res) => {
  try {
    await ensureAdminNotificationsSchema();
    await pool.query('UPDATE admin_notifications SET lu = 1 WHERE id = ?', [req.params.id]);
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
    if (locataire_id) {
      const locataireProfile = await fetchClienteleProfileBySource('locataires', locataire_id);
      if (locataireProfile && (locataireProfile.globalStatus === 'blackliste' || locataireProfile.locataireStatus === 'blackliste')) {
        return res.status(400).json({ error: 'Mise a jour impossible: ce locataire est blackliste' });
      }
    }
    if (statut === 'termine') {
      const [pendingPayments] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM paiements
         WHERE contrat_id = ? AND statut IN ('en_attente', 'retard')`,
        [req.params.id]
      );
      if (Number(pendingPayments?.[0]?.total || 0) > 0) {
        return res.status(400).json({ error: 'Cloture impossible: des loyers ou penalites restent impayes' });
      }
    }
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

app.get('/api/caracteristique-onglets', async (req, res) => {
  try {
    const mode = normalizeBienMode(req.query.mode_bien || req.query.mode);
    const type = normalizeBienType(req.query.type_bien || req.query.type);
    const validation = validateModeAndType(mode, type);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const [rows] = await pool.query(
      `SELECT id, mode_bien, type_bien, nom, ordre, is_system
       FROM caracteristique_onglets
       WHERE mode_bien = ? AND type_bien = ?
       ORDER BY ordre ASC, nom ASC`,
      [mode, type]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching caracteristique onglets:', error);
    res.status(500).json({ error: 'Failed to fetch caracteristique onglets' });
  }
});

app.get('/api/reservation-demands', async (req, res) => {
  try {
    await ensureReservationDemandSchema();
    const where = [];
    const params = [];
    if (req.query.client_user_id) {
      where.push('d.client_user_id = ?');
      params.push(String(req.query.client_user_id));
    }
    if (req.query.client_email) {
      where.push('d.client_email = ?');
      params.push(String(req.query.client_email).trim().toLowerCase());
    }
    if (req.query.proprietaire_id) {
      where.push('d.proprietaire_id = ?');
      params.push(String(req.query.proprietaire_id));
    }

    const [rows] = await pool.query(`
      SELECT
        d.*,
        b.titre AS bien_titre,
        b.reference AS bien_reference,
        b.mode AS bien_mode,
        p.nom AS proprietaire_nom,
        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,
        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,
        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,
        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM reservation_demands d
      LEFT JOIN biens b ON b.id = d.bien_id
      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id
      ${where.length > 0 ? `WHERE ${where.join(' OR ')}` : ''}
      ORDER BY d.created_at DESC
    `, params);
    res.json((rows || []).map((row) => formatReservationDemandRow(row)));
  } catch (error) {
    console.error('Error fetching reservation demands:', error);
    res.status(500).json({ error: 'Impossible de charger les demandes de reservation' });
  }
});

app.get('/api/reservation-demands/:id/history', async (req, res) => {
  try {
    await ensureReservationDemandSchema();
    const [rows] = await pool.query(
      `SELECT
         id,
         demand_id,
         status,
         actor_type,
         actor_id,
         note,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM reservation_demand_history
       WHERE demand_id = ?
       ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching reservation demand history:', error);
    res.status(500).json({ error: 'Impossible de charger l historique de la demande' });
  }
});

app.post('/api/reservation-demands', async (req, res) => {
  try {
    await ensureReservationDemandSchema();
    const {
      bien_id,
      client_user_id,
      client_email,
      client_name,
      start_date,
      end_date,
      guests,
      client_note,
      request_type,
    } = req.body || {};

    if (!bien_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'Bien, date de debut et date de fin requis' });
    }
    if (String(end_date) < String(start_date)) {
      return res.status(400).json({ error: 'La date de fin doit etre apres la date de debut' });
    }

    const [bienRows] = await pool.query('SELECT id, titre, reference, mode, proprietaire_id FROM biens WHERE id = ? LIMIT 1', [bien_id]);
    const bien = bienRows[0];
    if (!bien) return res.status(404).json({ error: 'Bien introuvable' });
    const requestType = bien.mode === 'vente' ? 'visite' : (request_type === 'visite' ? 'visite' : 'reservation');

    const [overlapRows] = await pool.query(
      `SELECT id, status
       FROM unavailable_dates
       WHERE bien_id = ?
         AND start_date <= ?
         AND end_date >= ?
         AND status IN ('blocked', 'booked', 'pending')
       LIMIT 1`,
      [bien_id, end_date, start_date]
    );
    if (overlapRows[0]) {
      return res.status(400).json({ error: 'Bien deja indisponible ou deja en attente sur cette periode' });
    }

    const now = getAgencySqlDateTime();
    const demandId = `rd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const unavailableDateId = `ud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const paymentDeadline = getAgencySqlDateTime(new Date(Date.now() + (48 * 60 * 60 * 1000)));
    const ownerUserId = bien.proprietaire_id
      ? (await fetchClienteleProfileBySource('proprietaires', bien.proprietaire_id))?.linkedUserId || null
      : null;

    await pool.query(
      `INSERT INTO reservation_demands (
        id, bien_id, request_type, unavailable_date_id, client_user_id, client_email, client_name, proprietaire_id, owner_user_id,
        start_date, end_date, guests, status, owner_notified_at, owner_response_at, admin_note, client_note,
        finalization_due_at, contract_id, payment_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        demandId,
        bien_id,
        requestType,
        unavailableDateId,
        client_user_id || null,
        client_email || null,
        client_name || null,
        bien.proprietaire_id || null,
        ownerUserId,
        start_date,
        end_date,
        Number(guests || 1),
        'en_attente_reponse_proprietaire',
        null,
        null,
        null,
        client_note || null,
        paymentDeadline,
        null,
        null,
        now,
        now,
      ]
    );

    await pool.query(
      `INSERT INTO unavailable_dates (id, bien_id, start_date, end_date, status, reservation_demand_id, payment_deadline)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [unavailableDateId, bien_id, start_date, end_date, demandId, paymentDeadline]
    );

    await appendReservationDemandHistory(
      demandId,
      'en_attente_reponse_proprietaire',
      'client',
      client_user_id || client_email || null,
      `Nouvelle demande de ${requestType === 'visite' ? 'visite' : 'reservation'} pour ${bien.reference || bien.id} - ${bien.titre}`
    );

    await createAdminNotification(
      'warning',
      `Nouvelle demande de ${requestType === 'visite' ? 'visite' : 'reservation'}: ${client_name || client_email || 'Client'} pour ${bien.reference || bien.id} du ${start_date} au ${end_date}`,
      now
    );

    const [rows] = await pool.query(
      `SELECT
        d.*,
        b.titre AS bien_titre,
        b.reference AS bien_reference,
        b.mode AS bien_mode,
        p.nom AS proprietaire_nom,
        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,
        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,
        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,
        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM reservation_demands d
      LEFT JOIN biens b ON b.id = d.bien_id
      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id
      WHERE d.id = ? LIMIT 1`,
      [demandId]
    );
    res.status(201).json(formatReservationDemandRow(rows[0]));
  } catch (error) {
    console.error('Error creating reservation demand:', error);
    res.status(500).json({ error: 'Impossible de creer la demande de reservation' });
  }
});

app.put('/api/reservation-demands/:id', async (req, res) => {
  try {
    await ensureReservationDemandSchema();
    const demandId = String(req.params.id || '').trim();
    const body = req.body || {};
    const [rows] = await pool.query('SELECT * FROM reservation_demands WHERE id = ? LIMIT 1', [demandId]);
    const current = rows[0];
    if (!current) return res.status(404).json({ error: 'Demande introuvable' });

    const nextStatus = normalizeReservationDemandStatus(body.status || current.status);
    const ownerNotifiedAt = body.communicateToOwner
      ? getAgencySqlDateTime()
      : (body.owner_notified_at !== undefined ? body.owner_notified_at : current.owner_notified_at);
    const ownerResponseAt = body.owner_response_at !== undefined
      ? body.owner_response_at
      : (nextStatus !== current.status && (
          nextStatus === 'pas_de_reponse_proprietaire' ||
          nextStatus === 'reponse_positive_attente_confirmation_client' ||
          nextStatus === 'reponse_negative_autre_proposition_meme_bien' ||
          nextStatus === 'reponse_negative_autre_proposition_bien_similaire'
        ) ? getAgencySqlDateTime() : current.owner_response_at);
    const updatedAt = getAgencySqlDateTime();
    const adminNote = body.admin_note !== undefined ? body.admin_note : current.admin_note;
    const clientNote = body.client_note !== undefined ? body.client_note : current.client_note;
    const finalizationDueAt = body.finalization_due_at !== undefined ? body.finalization_due_at : current.finalization_due_at;
    const contractId = body.contract_id !== undefined ? body.contract_id : current.contract_id;
    const paymentId = body.payment_id !== undefined ? body.payment_id : current.payment_id;

    await pool.query(
      `UPDATE reservation_demands
       SET status = ?, owner_notified_at = ?, owner_response_at = ?, admin_note = ?, client_note = ?,
           finalization_due_at = ?, contract_id = ?, payment_id = ?, updated_at = ?
       WHERE id = ?`,
      [nextStatus, ownerNotifiedAt || null, ownerResponseAt || null, adminNote || null, clientNote || null, finalizationDueAt || null, contractId || null, paymentId || null, updatedAt, demandId]
    );

    if (current.unavailable_date_id) {
      const unavailableStatus = (nextStatus === 'contrat_realise' || nextStatus === 'succes_paiement') ? 'booked' : 'pending';
      await pool.query(
        'UPDATE unavailable_dates SET status = ?, payment_deadline = ? WHERE id = ?',
        [unavailableStatus, finalizationDueAt || current.finalization_due_at || null, current.unavailable_date_id]
      );
    }

    if (body.communicateToOwner) {
      const notificationMessage = `Demande reservation a traiter pour le bien ${current.bien_id} du ${current.start_date} au ${current.end_date}`;
      await createAdminNotification('info', notificationMessage, updatedAt);
      await appendReservationDemandHistory(demandId, nextStatus, 'admin', body.actor_id || 'admin', body.history_note || 'Demande communiquee au proprietaire', updatedAt);
    } else if (nextStatus !== current.status || body.history_note) {
      await appendReservationDemandHistory(
        demandId,
        nextStatus,
        body.actor_type || 'admin',
        body.actor_id || 'admin',
        body.history_note || `Etat mis a jour vers ${nextStatus}`,
        updatedAt
      );
    }

    const [updatedRows] = await pool.query(
      `SELECT
        d.*,
        b.titre AS bien_titre,
        b.reference AS bien_reference,
        p.nom AS proprietaire_nom,
        DATE_FORMAT(d.owner_notified_at, '%Y-%m-%d %H:%i:%s') AS owner_notified_at,
        DATE_FORMAT(d.owner_response_at, '%Y-%m-%d %H:%i:%s') AS owner_response_at,
        DATE_FORMAT(d.finalization_due_at, '%Y-%m-%d %H:%i:%s') AS finalization_due_at,
        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM reservation_demands d
      LEFT JOIN biens b ON b.id = d.bien_id
      LEFT JOIN proprietaires p ON p.id = d.proprietaire_id
      WHERE d.id = ? LIMIT 1`,
      [demandId]
    );
    res.json(formatReservationDemandRow(updatedRows[0]));
  } catch (error) {
    console.error('Error updating reservation demand:', error);
    res.status(500).json({ error: 'Impossible de mettre a jour la demande de reservation' });
  }
});

app.post('/api/caracteristique-onglets', async (req, res) => {
  try {
    const mode = normalizeBienMode(req.body.mode_bien || req.body.mode);
    const type = normalizeBienType(req.body.type_bien || req.body.type);
    const nom = String(req.body.nom || '').trim();
    const ordre = Number(req.body.ordre || 999);
    const validation = validateModeAndType(mode, type);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    if (!nom) {
      return res.status(400).json({ error: 'nom requis' });
    }
    const id = String(req.body.id || `tab${Date.now()}`).trim();
    await pool.query(
      `INSERT INTO caracteristique_onglets (id, mode_bien, type_bien, nom, ordre, is_system)
       VALUES (?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE nom = VALUES(nom), ordre = VALUES(ordre)`,
      [id, mode, type, nom, Number.isFinite(ordre) ? ordre : 999]
    );
    const [rows] = await pool.query('SELECT * FROM caracteristique_onglets WHERE id = ? LIMIT 1', [id]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating caracteristique onglet:', error);
    res.status(500).json({ error: 'Failed to create caracteristique onglet' });
  }
});

app.delete('/api/caracteristique-onglets/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id requis' });
    const [rows] = await pool.query('SELECT * FROM caracteristique_onglets WHERE id = ? LIMIT 1', [id]);
    const onglet = rows?.[0];
    if (!onglet) return res.status(404).json({ error: 'onglet introuvable' });
    await pool.query('UPDATE caracteristique_contextes SET onglet_id = NULL WHERE onglet_id = ?', [id]);
    await pool.query('DELETE FROM caracteristique_onglets WHERE id = ?', [id]);
    res.json({ message: 'Onglet supprime' });
  } catch (error) {
    console.error('Error deleting caracteristique onglet:', error);
    res.status(500).json({ error: 'Failed to delete caracteristique onglet' });
  }
});

app.put('/api/caracteristique-onglets/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const nom = String(req.body.nom || '').trim();
    const ordre = Number(req.body.ordre || 999);
    if (!id) return res.status(400).json({ error: 'id requis' });
    if (!nom) return res.status(400).json({ error: 'nom requis' });
    const [rows] = await pool.query('SELECT * FROM caracteristique_onglets WHERE id = ? LIMIT 1', [id]);
    const onglet = rows?.[0];
    if (!onglet) return res.status(404).json({ error: 'onglet introuvable' });

    await pool.query(
      'UPDATE caracteristique_onglets SET nom = ?, ordre = ? WHERE id = ?',
      [nom, Number.isFinite(ordre) ? ordre : 999, id]
    );
    const [nextRows] = await pool.query('SELECT * FROM caracteristique_onglets WHERE id = ? LIMIT 1', [id]);
    res.json(nextRows[0]);
  } catch (error) {
    console.error('Error updating caracteristique onglet:', error);
    res.status(500).json({ error: 'Failed to update caracteristique onglet' });
  }
});

app.get('/api/caracteristiques', async (req, res) => {
  try {
    const mode = normalizeBienMode(req.query.mode_bien || req.query.mode);
    const type = normalizeBienType(req.query.type_bien || req.query.type);
    const bienId = String(req.query.bien_id || '').trim() || null;

    if ((req.query.mode_bien || req.query.mode) && (req.query.type_bien || req.query.type)) {
      const validation = validateModeAndType(mode, type);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      const query = bienId
        ? `SELECT DISTINCT c.id,
             COALESCE(bc.override_nom, c.nom) AS nom,
             COALESCE(bc.override_type_caracteristique, c.type_caracteristique) AS type_caracteristique,
             c.choix_json,
             COALESCE(bc.override_unite, c.unite) AS unite,
             COALESCE(bc.override_onglet_id, mo.onglet_id) AS onglet_id,
             co.nom AS onglet_nom,
             COALESCE(bc.visibilite_client, c.visibilite_client, 1) AS visibilite_client
           FROM caracteristiques c
           INNER JOIN caracteristique_contextes cc ON cc.caracteristique_id = c.id
           LEFT JOIN modifier_onglets mo
             ON mo.caracteristique_id = c.id
            AND mo.mode_bien = cc.mode_bien
            AND mo.type_bien = cc.type_bien
           LEFT JOIN bien_caracteristiques bc
             ON bc.caracteristique_id = c.id
            AND bc.bien_id = ?
           LEFT JOIN caracteristique_onglets co
             ON co.id = COALESCE(bc.override_onglet_id, mo.onglet_id)
           WHERE cc.mode_bien = ? AND cc.type_bien = ?
           ORDER BY nom ASC`
        : `SELECT DISTINCT c.*, mo.onglet_id, co.nom as onglet_nom
           FROM caracteristiques c
           INNER JOIN caracteristique_contextes cc ON cc.caracteristique_id = c.id
           LEFT JOIN modifier_onglets mo
             ON mo.caracteristique_id = c.id
            AND mo.mode_bien = cc.mode_bien
            AND mo.type_bien = cc.type_bien
           LEFT JOIN caracteristique_onglets co ON co.id = mo.onglet_id
           WHERE cc.mode_bien = ? AND cc.type_bien = ?
           ORDER BY c.nom ASC`;
      const params = bienId ? [bienId, mode, type] : [mode, type];
      const [rows] = await pool.query(query, params);
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
    const { nom, mode_bien, mode, type_bien, type, type_caracteristique, choix, unite, onglet_id, visibilite_client } = req.body;
    const normalizedMode = normalizeBienMode(mode_bien ?? mode);
    const normalizedType = normalizeBienType(type_bien ?? type);
    const featureName = String(nom || '').trim();
    const featureType = ['simple', 'choix_multiple', 'valeur'].includes(String(type_caracteristique || '').trim())
      ? String(type_caracteristique).trim()
      : 'simple';
    const normalizedChoices = Array.isArray(choix)
      ? Array.from(new Set(choix.map((item) => String(item || '').trim()).filter(Boolean)))
      : [];
    const normalizedUnit = String(unite || '').trim() || null;
    const visibleClient = Number(visibilite_client) === 0 ? 0 : 1;
    if (!featureName) {
      return res.status(400).json({ error: 'nom requis' });
    }
    if (featureType === 'choix_multiple' && normalizedChoices.length === 0) {
      return res.status(400).json({ error: 'choix requis pour type choix_multiple' });
    }
    if (featureType !== 'choix_multiple' && normalizedChoices.length > 0) {
      return res.status(400).json({ error: 'choix autorises uniquement pour type choix_multiple' });
    }
    if (featureType !== 'valeur' && normalizedUnit) {
      return res.status(400).json({ error: 'unite autorisee uniquement pour type valeur' });
    }
    const featureChoicesJson = featureType === 'choix_multiple' ? JSON.stringify(normalizedChoices) : null;
    const featureUnit = featureType === 'valeur' ? normalizedUnit : null;

    const [existingRows] = await pool.query(
      'SELECT * FROM caracteristiques WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?)) LIMIT 1',
      [featureName]
    );
    let caracteristique = existingRows[0];
    if (!caracteristique) {
      const id = 'car' + Date.now();
      await pool.query(
        'INSERT INTO caracteristiques (id, nom, type_caracteristique, choix_json, unite, visibilite_client) VALUES (?, ?, ?, ?, ?, ?)',
        [id, featureName, featureType, featureChoicesJson, featureUnit, visibleClient]
      );
      caracteristique = {
        id,
        nom: featureName,
        type_caracteristique: featureType,
        choix_json: featureChoicesJson,
        unite: featureUnit,
        visibilite_client: visibleClient,
      };
    } else {
      await pool.query(
        'UPDATE caracteristiques SET type_caracteristique = ?, choix_json = ?, unite = ?, visibilite_client = ? WHERE id = ?',
        [featureType, featureChoicesJson, featureUnit, visibleClient, caracteristique.id]
      );
      caracteristique = {
        ...caracteristique,
        type_caracteristique: featureType,
        choix_json: featureChoicesJson,
        unite: featureUnit,
        visibilite_client: visibleClient,
      };
    }

    if ((mode_bien || mode) && (type_bien || type)) {
      const validation = validateModeAndType(normalizedMode, normalizedType);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      const normalizedOngletId = String(onglet_id || '').trim() || null;
      if (normalizedOngletId) {
        const [ongletRows] = await pool.query(
          'SELECT id FROM caracteristique_onglets WHERE id = ? AND mode_bien = ? AND type_bien = ? LIMIT 1',
          [normalizedOngletId, normalizedMode, normalizedType]
        );
        if (!ongletRows?.[0]) {
          return res.status(400).json({ error: 'onglet invalide pour ce mode/type' });
        }
      }
      await pool.query(
        `INSERT INTO caracteristique_contextes (id, caracteristique_id, mode_bien, type_bien, onglet_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE mode_bien = VALUES(mode_bien), type_bien = VALUES(type_bien), onglet_id = VALUES(onglet_id)`,
        ['ctx' + Date.now(), caracteristique.id, normalizedMode, normalizedType, normalizedOngletId]
      );
      if (normalizedOngletId) {
        await pool.query(
          `INSERT INTO modifier_onglets (id, mode_bien, type_bien, onglet_id, caracteristique_id, ordre)
           VALUES (?, ?, ?, ?, ?, 0)
           ON DUPLICATE KEY UPDATE onglet_id = VALUES(onglet_id), ordre = VALUES(ordre)`,
          [`mo_${normalizedMode}_${normalizedType}_${caracteristique.id}`, normalizedMode, normalizedType, normalizedOngletId, caracteristique.id]
        );
      } else {
        await pool.query(
          'DELETE FROM modifier_onglets WHERE mode_bien = ? AND type_bien = ? AND caracteristique_id = ?',
          [normalizedMode, normalizedType, caracteristique.id]
        );
      }
    }

    res.status(201).json(caracteristique);
  } catch (error) {
    console.error('Error creating caracteristique:', error);
    res.status(500).json({ error: 'Failed to create caracteristique' });
  }
});

async function ensureMaintenanceWorkflowSchema() {
  const columnExists = async (tableName, columnName) => {
    const [rows] = await pool.query(
      `
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
      `,
      [tableName, columnName]
    );
    return rows.length > 0;
  };

  if (!(await columnExists('maintenance', 'owner_approval_required'))) {
    await pool.query("ALTER TABLE maintenance ADD COLUMN owner_approval_required TINYINT(1) NOT NULL DEFAULT 0 AFTER statut");
  }
  if (!(await columnExists('maintenance', 'owner_approval_status'))) {
    await pool.query("ALTER TABLE maintenance ADD COLUMN owner_approval_status VARCHAR(32) NOT NULL DEFAULT 'non_requis' AFTER owner_approval_required");
  }
  if (!(await columnExists('maintenance', 'owner_approved_at'))) {
    await pool.query('ALTER TABLE maintenance ADD COLUMN owner_approved_at DATETIME NULL AFTER owner_approval_status');
  }
}

async function ensureAdminNotificationsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id VARCHAR(100) PRIMARY KEY,
      type VARCHAR(20) NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      lu TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      KEY idx_admin_notifications_lu_created (lu, created_at)
    )
  `);
}

async function ensureClientelesTasksSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clienteles_tasks (
      id VARCHAR(100) PRIMARY KEY,
      source_table VARCHAR(50) NOT NULL,
      source_id VARCHAR(100) NOT NULL,
      task_type VARCHAR(100) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      detail TEXT NULL,
      due_date DATETIME NULL,
      related_entity_type VARCHAR(50) NULL,
      related_entity_id VARCHAR(100) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uniq_client_task (source_table, source_id, task_type, related_entity_type, related_entity_id)
    )
  `);
}

async function ensureReservationDemandSchema() {
  const columnExists = async (tableName, columnName) => {
    const [rows] = await pool.query(
      `
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
      `,
      [tableName, columnName]
    );
    return rows.length > 0;
  };

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservation_demands (
      id VARCHAR(100) PRIMARY KEY,
      bien_id VARCHAR(100) NOT NULL,
      request_type VARCHAR(20) NOT NULL DEFAULT 'reservation',
      unavailable_date_id VARCHAR(100) NULL,
      client_user_id VARCHAR(100) NULL,
      client_email VARCHAR(255) NULL,
      client_name VARCHAR(255) NULL,
      proprietaire_id VARCHAR(100) NULL,
      owner_user_id VARCHAR(100) NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      guests INT NOT NULL DEFAULT 1,
      status VARCHAR(80) NOT NULL,
      owner_notified_at DATETIME NULL,
      owner_response_at DATETIME NULL,
      admin_note TEXT NULL,
      client_note TEXT NULL,
      finalization_due_at DATETIME NULL,
      contract_id VARCHAR(100) NULL,
      payment_id VARCHAR(100) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      KEY idx_reservation_demands_client (client_user_id, client_email),
      KEY idx_reservation_demands_bien (bien_id),
      KEY idx_reservation_demands_owner (proprietaire_id, owner_user_id),
      KEY idx_reservation_demands_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservation_demand_history (
      id VARCHAR(100) PRIMARY KEY,
      demand_id VARCHAR(100) NOT NULL,
      status VARCHAR(80) NOT NULL,
      actor_type VARCHAR(30) NOT NULL,
      actor_id VARCHAR(100) NULL,
      note TEXT NULL,
      created_at DATETIME NOT NULL,
      KEY idx_reservation_demand_history_demand (demand_id, created_at)
    )
  `);

  if (!(await columnExists('unavailable_dates', 'reservation_demand_id'))) {
    await pool.query('ALTER TABLE unavailable_dates ADD COLUMN reservation_demand_id VARCHAR(100) NULL AFTER status');
  }
  if (!(await columnExists('unavailable_dates', 'payment_deadline'))) {
    await pool.query('ALTER TABLE unavailable_dates ADD COLUMN payment_deadline DATETIME NULL AFTER reservation_demand_id');
  }
  if (!(await columnExists('reservation_demands', 'request_type'))) {
    await pool.query("ALTER TABLE reservation_demands ADD COLUMN request_type VARCHAR(20) NOT NULL DEFAULT 'reservation' AFTER bien_id");
  }
}

app.delete('/api/caracteristiques/:id', async (req, res) => {
  try {
    const featureId = String(req.params.id || '').trim();
    if (!featureId) {
      return res.status(400).json({ error: 'id requis' });
    }

    const hasMode = req.query.mode_bien || req.query.mode;
    const hasType = req.query.type_bien || req.query.type;
    const normalizedMode = normalizeBienMode(hasMode);
    const normalizedType = normalizeBienType(hasType);

    if ((hasMode && !hasType) || (!hasMode && hasType)) {
      return res.status(400).json({ error: 'mode_bien et type_bien requis ensemble' });
    }

    if (hasMode && hasType) {
      const validation = validateModeAndType(normalizedMode, normalizedType);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      await pool.query(
        'DELETE FROM caracteristique_contextes WHERE caracteristique_id = ? AND mode_bien = ? AND type_bien = ?',
        [featureId, normalizedMode, normalizedType]
      );
      await pool.query(
        'DELETE FROM modifier_onglets WHERE caracteristique_id = ? AND mode_bien = ? AND type_bien = ?',
        [featureId, normalizedMode, normalizedType]
      );
    } else {
      await pool.query('DELETE FROM caracteristique_contextes WHERE caracteristique_id = ?', [featureId]);
      await pool.query('DELETE FROM modifier_onglets WHERE caracteristique_id = ?', [featureId]);
      await pool.query('DELETE FROM bien_caracteristiques WHERE caracteristique_id = ?', [featureId]);
      await pool.query('DELETE FROM caracteristiques WHERE id = ?', [featureId]);
      return res.json({ message: 'Caracteristique supprimee' });
    }

    const [ctxRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM caracteristique_contextes WHERE caracteristique_id = ?',
      [featureId]
    );
    const [linkRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM bien_caracteristiques WHERE caracteristique_id = ?',
      [featureId]
    );
    const ctxCount = Number(ctxRows?.[0]?.total || 0);
    const linkCount = Number(linkRows?.[0]?.total || 0);

    if (ctxCount === 0 && linkCount === 0) {
      await pool.query('DELETE FROM caracteristiques WHERE id = ?', [featureId]);
    }

    res.json({ message: 'Caracteristique supprimee du contexte' });
  } catch (error) {
    console.error('Error deleting caracteristique:', error);
    res.status(500).json({ error: 'Failed to delete caracteristique' });
  }
});

app.put('/api/caracteristiques/:id', async (req, res) => {
  try {
    const featureId = String(req.params.id || '').trim();
    const mode = normalizeBienMode(req.body.mode_bien || req.body.mode);
    const type = normalizeBienType(req.body.type_bien || req.body.type);
    const bienId = String(req.body.bien_id || '').trim() || null;
    const applyToAll = req.body.apply_to_all === true || String(req.body.apply_to_all || '').trim() === '1';
    const nom = String(req.body.nom || '').trim();
    const featureType = ['simple', 'choix_multiple', 'valeur'].includes(String(req.body.type_caracteristique || '').trim())
      ? String(req.body.type_caracteristique).trim()
      : 'simple';
    const normalizedChoices = Array.isArray(req.body.choix)
      ? Array.from(new Set(req.body.choix.map((item) => String(item || '').trim()).filter(Boolean)))
      : [];
    const normalizedUnit = String(req.body.unite || '').trim() || null;
    const normalizedOngletId = String(req.body.onglet_id || '').trim() || null;
    const visibleClient = Number(req.body.visibilite_client) === 0 ? 0 : 1;

    if (!featureId) return res.status(400).json({ error: 'id requis' });
    if (!nom) return res.status(400).json({ error: 'nom requis' });
    const validation = validateModeAndType(mode, type);
    if (!validation.valid) return res.status(400).json({ error: validation.error });
    if (featureType === 'choix_multiple' && normalizedChoices.length === 0) {
      return res.status(400).json({ error: 'choix requis pour type choix_multiple' });
    }
    if (featureType !== 'choix_multiple' && normalizedChoices.length > 0) {
      return res.status(400).json({ error: 'choix autorises uniquement pour type choix_multiple' });
    }
    if (featureType !== 'valeur' && normalizedUnit) {
      return res.status(400).json({ error: 'unite autorisee uniquement pour type valeur' });
    }
    if (normalizedOngletId) {
      const [ongletRows] = await pool.query(
        'SELECT id FROM caracteristique_onglets WHERE id = ? AND mode_bien = ? AND type_bien = ? LIMIT 1',
        [normalizedOngletId, mode, type]
      );
      if (!ongletRows?.[0]) {
        return res.status(400).json({ error: 'onglet invalide pour ce mode/type' });
      }
    }

    if (bienId && !applyToAll) {
      const [bienRows] = await pool.query('SELECT id FROM biens WHERE id = ? LIMIT 1', [bienId]);
      if (!bienRows?.[0]) {
        return res.status(404).json({ error: 'bien introuvable' });
      }
      await pool.query(
        `INSERT INTO bien_caracteristiques (
          bien_id, caracteristique_id, visibilite_client, override_nom, override_type_caracteristique, override_unite, override_onglet_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          visibilite_client = VALUES(visibilite_client),
          override_nom = VALUES(override_nom),
          override_type_caracteristique = VALUES(override_type_caracteristique),
          override_unite = VALUES(override_unite),
          override_onglet_id = VALUES(override_onglet_id)`,
        [
          bienId,
          featureId,
          visibleClient,
          nom,
          featureType,
          featureType === 'valeur' ? normalizedUnit : null,
          normalizedOngletId,
        ]
      );

      const [rows] = await pool.query(
        `SELECT c.id,
            COALESCE(bc.override_nom, c.nom) AS nom,
            COALESCE(bc.override_type_caracteristique, c.type_caracteristique) AS type_caracteristique,
            c.choix_json,
            COALESCE(bc.override_unite, c.unite) AS unite,
            COALESCE(bc.override_onglet_id, mo.onglet_id) AS onglet_id,
            co.nom AS onglet_nom,
            COALESCE(bc.visibilite_client, c.visibilite_client, 1) AS visibilite_client
         FROM caracteristiques c
         LEFT JOIN modifier_onglets mo
           ON mo.caracteristique_id = c.id
          AND mo.mode_bien = ?
          AND mo.type_bien = ?
         LEFT JOIN bien_caracteristiques bc
           ON bc.caracteristique_id = c.id
          AND bc.bien_id = ?
         LEFT JOIN caracteristique_onglets co
           ON co.id = COALESCE(bc.override_onglet_id, mo.onglet_id)
         WHERE c.id = ?
         LIMIT 1`,
        [mode, type, bienId, featureId]
      );
      return res.json(rows[0] || null);
    }

    await pool.query(
      'UPDATE caracteristiques SET nom = ?, type_caracteristique = ?, choix_json = ?, unite = ?, visibilite_client = ? WHERE id = ?',
      [nom, featureType, featureType === 'choix_multiple' ? JSON.stringify(normalizedChoices) : null, featureType === 'valeur' ? normalizedUnit : null, visibleClient, featureId]
    );
    await pool.query(
      'UPDATE caracteristique_contextes SET onglet_id = ? WHERE caracteristique_id = ? AND mode_bien = ? AND type_bien = ?',
      [normalizedOngletId, featureId, mode, type]
    );
    if (normalizedOngletId) {
      await pool.query(
        `INSERT INTO modifier_onglets (id, mode_bien, type_bien, onglet_id, caracteristique_id, ordre)
         VALUES (?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE onglet_id = VALUES(onglet_id), ordre = VALUES(ordre)`,
        [`mo_${mode}_${type}_${featureId}`, mode, type, normalizedOngletId, featureId]
      );
    } else {
      await pool.query(
        'DELETE FROM modifier_onglets WHERE mode_bien = ? AND type_bien = ? AND caracteristique_id = ?',
        [mode, type, featureId]
      );
    }
    if (applyToAll) {
      await pool.query(
        `UPDATE bien_caracteristiques bc
         INNER JOIN biens b ON b.id = bc.bien_id
         SET bc.visibilite_client = ?,
             bc.override_nom = ?,
             bc.override_type_caracteristique = ?,
             bc.override_unite = ?,
             bc.override_onglet_id = ?
         WHERE bc.caracteristique_id = ?
           AND b.mode = ?
           AND b.type = ?`,
        [visibleClient, nom, featureType, featureType === 'valeur' ? normalizedUnit : null, normalizedOngletId, featureId, mode, type]
      );
    }
    const [rows] = await pool.query('SELECT * FROM caracteristiques WHERE id = ? LIMIT 1', [featureId]);
    res.json(rows[0] || null);
  } catch (error) {
    console.error('Error updating caracteristique:', error);
    res.status(500).json({ error: 'Failed to update caracteristique' });
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
    
    const imageUrl = `/uploads/${req.file.filename}`;
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
    const contractUrl = `/contracts/${req.file.filename}`;
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
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'payload JSON invalide' });
    }
    const { bien_id, type, url, position, motif_upload } = req.body;
    if (!bien_id || typeof bien_id !== 'string') {
      return res.status(400).json({ error: 'bien_id requis' });
    }
    const resolvedType = Array.isArray(type)
      ? String(type[type.length - 1] || 'image')
      : String(type || 'image');
    const safeType = resolvedType === 'video' ? 'video' : 'image';
    const resolvedUrl = Array.isArray(url) ? String(url[0] || '') : String(url || '');
    const resolvedMotif = Array.isArray(motif_upload)
      ? String(motif_upload[motif_upload.length - 1] || '')
      : String(motif_upload || '');
    if (!resolvedUrl.trim()) {
      return res.status(400).json({ error: 'url image requis' });
    }
    const id = 'm' + Date.now();
    
    // Calculate the next position if not provided (max existing position + 1)
    let mediaPosition = Number(position);
    if (position === undefined || position === null || Number.isNaN(mediaPosition)) {
      const [maxPosResult] = await pool.query(
        'SELECT MAX(position) as maxPos FROM media WHERE bien_id = ?',
        [bien_id]
      );
      mediaPosition = (maxPosResult[0]?.maxPos ?? -1) + 1;
    }
    if (!Number.isFinite(mediaPosition) || mediaPosition < 0) {
      mediaPosition = 0;
    }
    
    await pool.query('INSERT INTO media (id, bien_id, type, url, motif_upload, position) VALUES (?, ?, ?, ?, ?, ?)',
      [id, bien_id, safeType, resolvedUrl, resolvedMotif.trim() || null, mediaPosition]);
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
    await ensureReservationDemandSchema();
    const [rows] = await pool.query(
      `SELECT
         id,
         bien_id,
         start_date,
         end_date,
         status,
         reservation_demand_id,
         DATE_FORMAT(payment_deadline, '%Y-%m-%d %H:%i:%s') AS paymentDeadline
       FROM unavailable_dates
       WHERE bien_id = ?`,
      [req.params.bien_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unavailable dates' });
  }
});

app.post('/api/unavailable-dates', async (req, res) => {
  try {
    await ensureReservationDemandSchema();
    const { bien_id, start_date, end_date, status } = req.body;
    const id = 'ud' + Date.now();
    await pool.query(
      'INSERT INTO unavailable_dates (id, bien_id, start_date, end_date, status, reservation_demand_id, payment_deadline) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, bien_id, start_date, end_date, status || 'blocked', null, null]
    );
    const [newDate] = await pool.query('SELECT * FROM unavailable_dates WHERE id = ?', [id]);
    res.status(201).json(newDate[0]);
  } catch (error) {
    console.error('Error creating unavailable date:', error);
    res.status(500).json({ error: 'Failed to create unavailable date' });
  }
});

app.delete('/api/unavailable-dates/:id', async (req, res) => {
  try {
    await ensureReservationDemandSchema();
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

app.get('/api/auth/providers', (req, res) => {
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const facebookConfigured = Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);
  const phoneOtpConfigured = Boolean(process.env.OTP_PROVIDER_WEBHOOK_URL || process.env.ALLOW_OTP_IN_RESPONSE === '1');
  res.json({
    google: googleConfigured,
    facebook: facebookConfigured,
    phoneOtp: phoneOtpConfigured,
  });
});

app.post('/api/auth/phone/request-otp', async (req, res) => {
  try {
    const telephone = normalizePhoneNumber(req.body?.telephone);
    if (!telephone || telephone.replace(/\D/g, '').length < 8) {
      return res.status(400).json({ error: 'Numero de telephone invalide' });
    }

    const code = String(process.env.OTP_STATIC_CODE || Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 5 * 60 * 1000;
    phoneOtpSessions.set(telephone, {
      code,
      expiresAt,
      attempts: 0,
    });

    const delivery = await deliverPhoneOtp({ telephone, code });
    res.json({
      success: true,
      expiresInSeconds: 300,
      ...(delivery.debugCode ? { debugCode: delivery.debugCode } : {}),
    });
  } catch (error) {
    if (String(error?.message || '') === 'otp_provider_missing') {
      return res.status(503).json({
        error: "OTP telephone indisponible pour le moment. Configurez OTP_PROVIDER_WEBHOOK_URL ou ALLOW_OTP_IN_RESPONSE.",
      });
    }
    console.error('Error requesting phone OTP:', error);
    res.status(500).json({ error: 'Impossible d envoyer le code OTP' });
  }
});

app.post('/api/auth/phone/verify-otp', async (req, res) => {
  try {
    await ensureAuthSchema();
    const telephone = normalizePhoneNumber(req.body?.telephone);
    const code = String(req.body?.code || '').trim();
    if (!telephone || !code) {
      return res.status(400).json({ error: 'Telephone et code OTP obligatoires' });
    }

    const session = phoneOtpSessions.get(telephone);
    if (!session) {
      return res.status(404).json({ error: 'Code OTP introuvable ou expire' });
    }
    if (Date.now() > Number(session.expiresAt || 0)) {
      phoneOtpSessions.delete(telephone);
      return res.status(410).json({ error: 'Code OTP expire' });
    }
    if (String(session.code) !== code) {
      session.attempts = Number(session.attempts || 0) + 1;
      if (session.attempts >= 5) {
        phoneOtpSessions.delete(telephone);
      } else {
        phoneOtpSessions.set(telephone, session);
      }
      return res.status(401).json({ error: 'Code OTP invalide' });
    }

    phoneOtpSessions.delete(telephone);
    const user = await upsertPhoneUser({ telephone });
    res.json({ user });
  } catch (error) {
    console.error('Error verifying phone OTP:', error);
    res.status(500).json({ error: 'Impossible de verifier le code OTP' });
  }
});

app.get('/api/auth/google/start', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;

  if (!clientId) {
    return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=google_config_missing`);
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
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=google_code_missing`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=google_config_missing`);
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
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=google_token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=google_access_token_missing`);
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=google_profile_fetch_failed`);
    }

    const profile = await profileResponse.json();
    if (!profile.email) {
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=google_email_missing`);
    }

    const user = await upsertSocialUser({
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      avatar: profile.picture || null,
      provider: 'google',
      providerUserId: profile.sub || null,
    });

    const socialToken = createTemporarySocialToken(user);
    res.redirect(`${CANONICAL_FRONTEND_URL}/login?social_token=${socialToken}`);
  } catch (error) {
    console.error('Google callback error:', error);
    res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=google_callback_failed`);
  }
});

app.get('/api/auth/facebook/start', async (req, res) => {
  const clientId = process.env.FACEBOOK_CLIENT_ID;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `http://localhost:${PORT}/api/auth/facebook/callback`;

  if (!clientId) {
    return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=facebook_config_missing`);
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
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=facebook_code_missing`);
    }

    const clientId = process.env.FACEBOOK_CLIENT_ID;
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `http://localhost:${PORT}/api/auth/facebook/callback`;

    if (!clientId || !clientSecret) {
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=facebook_config_missing`);
    }

    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', String(code));

    const tokenResponse = await fetch(tokenUrl);
    if (!tokenResponse.ok) {
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=facebook_token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=facebook_access_token_missing`);
    }

    const profileUrl = new URL('https://graph.facebook.com/me');
    profileUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
    profileUrl.searchParams.set('access_token', tokenData.access_token);

    const profileResponse = await fetch(profileUrl);
    if (!profileResponse.ok) {
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=facebook_profile_fetch_failed`);
    }

    const profile = await profileResponse.json();
    if (!profile.email) {
      return res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=facebook_email_missing`);
    }

    const user = await upsertSocialUser({
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      avatar: profile.picture?.data?.url || null,
      provider: 'facebook',
      providerUserId: profile.id || null,
    });

    const socialToken = createTemporarySocialToken(user);
    res.redirect(`${CANONICAL_FRONTEND_URL}/login?social_token=${socialToken}`);
  } catch (error) {
    console.error('Facebook callback error:', error);
    res.redirect(`${CANONICAL_FRONTEND_URL}/login?oauth_error=facebook_callback_failed`);
  }
});

app.get('/api/auth/social/session/:token', (req, res) => {
  const user = consumeTemporarySocialToken(req.params.token);
  if (!user) {
    return res.status(404).json({ error: 'Session sociale invalide ou expirée' });
  }
  res.json({ user });
});

app.get('/api/client-interactions', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, client_user_id, client_email, client_name, type, bien_id, property_title, source,
              DATE_FORMAT(event_at, '%Y-%m-%d %H:%i:%s') AS event_at
       FROM client_interactions
       ORDER BY event_at DESC`
    );
    res.json((rows || []).map((row) => ({
      id: row.id,
      clientUserId: row.client_user_id || undefined,
      clientEmail: row.client_email || '',
      clientName: row.client_name || undefined,
      type: row.type,
      bienId: row.bien_id,
      propertyTitle: row.property_title || '',
      source: row.source,
      dateTime: row.event_at,
    })));
  } catch (error) {
    console.error('Error fetching client interactions:', error);
    res.status(500).json({ error: 'Impossible de charger les interactions clients' });
  }
});

app.post('/api/client-interactions', async (req, res) => {
  try {
    const id = `ci_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const clientUserId = String(req.body?.clientUserId || '').trim() || null;
    const clientEmail = String(req.body?.clientEmail || '').trim().toLowerCase();
    const clientName = String(req.body?.clientName || '').trim() || null;
    const type = String(req.body?.type || '').trim();
    const bienId = String(req.body?.bienId || '').trim();
    const propertyTitle = String(req.body?.propertyTitle || '').trim() || null;
    const nowSql = getAgencySqlDateTime();

    if (!clientEmail) return res.status(400).json({ error: 'Email client obligatoire' });
    if (!['visite', 'like', 'partage'].includes(type)) return res.status(400).json({ error: 'Type interaction invalide' });
    if (!bienId) return res.status(400).json({ error: 'Bien obligatoire' });

    await pool.query(
      `INSERT INTO client_interactions
       (id, client_user_id, client_email, client_name, type, bien_id, property_title, source, event_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'site_public', ?, ?)`,
      [id, clientUserId, clientEmail, clientName, type, bienId, propertyTitle, nowSql, nowSql]
    );

    res.status(201).json({
      id,
      clientUserId: clientUserId || undefined,
      clientEmail,
      clientName: clientName || undefined,
      type,
      bienId,
      propertyTitle: propertyTitle || '',
      source: 'site_public',
      dateTime: nowSql,
    });
  } catch (error) {
    console.error('Error creating client interaction:', error);
    res.status(500).json({ error: "Impossible d'enregistrer l interaction client" });
  }
});

app.get('/api/clienteles/profiles', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM clienteles_profiles ORDER BY updated_at DESC, created_at DESC');
    res.json((rows || []).map((row) => normalizeClienteleProfileRow(row)));
  } catch (error) {
    console.error('Error fetching clienteles profiles:', error);
    res.status(500).json({ error: 'Impossible de charger les profils clienteles' });
  }
});

app.get('/api/clienteles/tasks/:sourceTable/:sourceId', async (req, res) => {
  try {
    const sourceTable = String(req.params.sourceTable || '').trim();
    const sourceId = String(req.params.sourceId || '').trim();
    if (!['utilisateurs', 'locataires', 'proprietaires'].includes(sourceTable)) {
      return res.status(400).json({ error: 'sourceTable invalide' });
    }
    if (!sourceId) {
      return res.status(400).json({ error: 'sourceId requis' });
    }
    const tasks = await syncClienteleTasks(sourceTable, sourceId);
    res.json(tasks);
  } catch (error) {
    console.error('Error syncing clientele tasks:', error);
    res.status(500).json({ error: 'Impossible de charger les taches clienteles' });
  }
});

app.put('/api/clienteles/profiles/:sourceTable/:sourceId', async (req, res) => {
  try {
    const sourceTable = String(req.params.sourceTable || '').trim();
    const sourceId = String(req.params.sourceId || '').trim();
    if (!['utilisateurs', 'locataires', 'proprietaires'].includes(sourceTable)) {
      return res.status(400).json({ error: 'sourceTable invalide' });
    }
    if (!sourceId) {
      return res.status(400).json({ error: 'sourceId requis' });
    }

    const now = getAgencySqlDateTime();
    const profileId = `cp_${sourceTable}_${sourceId}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const body = req.body || {};
    const payload = [
      body.linkedUserId ? String(body.linkedUserId).trim() : null,
      body.email ? String(body.email).trim().toLowerCase() : null,
      ['prospect', 'actif', 'inactif', 'blackliste'].includes(String(body.globalStatus || '')) ? String(body.globalStatus) : 'prospect',
      body.scoreOverride === null || body.scoreOverride === undefined || body.scoreOverride === '' ? null : Number(body.scoreOverride),
      body.canalEntree ? String(body.canalEntree).trim() : null,
      body.lastInteractionAt ? String(body.lastInteractionAt).trim().replace('T', ' ') : null,
      body.lastInteractionNote ? String(body.lastInteractionNote) : null,
      JSON.stringify(Array.isArray(body.activeRoles) ? body.activeRoles : []),
      body.vip ? 1 : 0,
      body.blacklistReason ? String(body.blacklistReason) : null,
      body.locataireStatus ? String(body.locataireStatus) : null,
      body.locCinValidee ? 1 : 0,
      body.locContratSigne ? 1 : 0,
      body.locDepotEncaisse ? 1 : 0,
      body.locJustificatifRevenus ? 1 : 0,
      body.locAttestationTravail ? 1 : 0,
      body.locNbPersonnes === null || body.locNbPersonnes === undefined || body.locNbPersonnes === '' ? null : Number(body.locNbPersonnes),
      body.locJourEcheance === null || body.locJourEcheance === undefined || body.locJourEcheance === '' ? null : Number(body.locJourEcheance),
      body.locPenaliteMode ? String(body.locPenaliteMode) : null,
      body.locPenaliteValeur === null || body.locPenaliteValeur === undefined || body.locPenaliteValeur === '' ? null : Number(body.locPenaliteValeur),
      body.saisonMinNuits === null || body.saisonMinNuits === undefined || body.saisonMinNuits === '' ? null : Number(body.saisonMinNuits),
      body.saisonMaxNuits === null || body.saisonMaxNuits === undefined || body.saisonMaxNuits === '' ? null : Number(body.saisonMaxNuits),
      body.saisonCapaciteMax === null || body.saisonCapaciteMax === undefined || body.saisonCapaciteMax === '' ? null : Number(body.saisonCapaciteMax),
      JSON.stringify(Array.isArray(body.saisonJoursArrivee) ? body.saisonJoursArrivee : []),
      JSON.stringify(Array.isArray(body.saisonJoursDepart) ? body.saisonJoursDepart : []),
      body.saisonAcomptePourcentage === null || body.saisonAcomptePourcentage === undefined || body.saisonAcomptePourcentage === '' ? null : Number(body.saisonAcomptePourcentage),
      body.saisonDocumentsRecus ? 1 : 0,
      body.saisonDepotBloque ? 1 : 0,
      body.saisonDepotRetenuMontant === null || body.saisonDepotRetenuMontant === undefined || body.saisonDepotRetenuMontant === '' ? null : Number(body.saisonDepotRetenuMontant),
      body.saisonDepotRetenuMotif ? String(body.saisonDepotRetenuMotif) : null,
      body.acheteurStatus ? String(body.acheteurStatus) : null,
      JSON.stringify(Array.isArray(body.acheteurZones) ? body.acheteurZones : []),
      JSON.stringify(Array.isArray(body.acheteurTypes) ? body.acheteurTypes : []),
      body.acheteurBudgetMin === null || body.acheteurBudgetMin === undefined || body.acheteurBudgetMin === '' ? null : Number(body.acheteurBudgetMin),
      body.acheteurBudgetMax === null || body.acheteurBudgetMax === undefined || body.acheteurBudgetMax === '' ? null : Number(body.acheteurBudgetMax),
      body.acheteurSurfaceMin === null || body.acheteurSurfaceMin === undefined || body.acheteurSurfaceMin === '' ? null : Number(body.acheteurSurfaceMin),
      body.acheteurDistancePlageMax === null || body.acheteurDistancePlageMax === undefined || body.acheteurDistancePlageMax === '' ? null : Number(body.acheteurDistancePlageMax),
      body.acheteurFinancementMode ? String(body.acheteurFinancementMode) : null,
      body.acheteurNextAction ? String(body.acheteurNextAction) : null,
      body.acheteurActionDueAt ? String(body.acheteurActionDueAt).trim().replace('T', ' ') : null,
      body.proprietaireStatus ? String(body.proprietaireStatus) : null,
      body.proprietaireMandatType ? String(body.proprietaireMandatType) : null,
      body.proprietaireMandatStart ? String(body.proprietaireMandatStart) : null,
      body.proprietaireMandatEnd ? String(body.proprietaireMandatEnd) : null,
      body.proprietaireReversementFrequence ? String(body.proprietaireReversementFrequence) : null,
      body.proprietaireModePaiement ? String(body.proprietaireModePaiement) : null,
      body.proprietaireCommissionPercent === null || body.proprietaireCommissionPercent === undefined || body.proprietaireCommissionPercent === '' ? null : Number(body.proprietaireCommissionPercent),
      body.proprietairePlafondTravaux === null || body.proprietairePlafondTravaux === undefined || body.proprietairePlafondTravaux === '' ? null : Number(body.proprietairePlafondTravaux),
      body.proprietaireLastStatementAt ? String(body.proprietaireLastStatementAt) : null,
      now,
      now,
    ];

    await pool.query(
      `INSERT INTO clienteles_profiles (
        id, source_table, source_id, linked_user_id, email, global_status, score_override, canal_entree, last_interaction_at, last_interaction_note,
        active_roles_json, vip, blacklist_reason, locataire_status, loc_cin_validee, loc_contrat_signe, loc_depot_encaisse, loc_justificatif_revenus,
        loc_attestation_travail, loc_nb_personnes, loc_jour_echeance, loc_penalite_mode, loc_penalite_valeur, saison_min_nuits, saison_max_nuits,
        saison_capacite_max, saison_jours_arrivee_json, saison_jours_depart_json, saison_acompte_pourcentage, saison_documents_recus, saison_depot_bloque,
        saison_depot_retenu_montant, saison_depot_retenu_motif, acheteur_status, acheteur_zones_json, acheteur_types_json, acheteur_budget_min,
        acheteur_budget_max, acheteur_surface_min, acheteur_distance_plage_max, acheteur_financement_mode, acheteur_next_action, acheteur_action_due_at,
        proprietaire_status, proprietaire_mandat_type, proprietaire_mandat_start, proprietaire_mandat_end, proprietaire_reversement_frequence,
        proprietaire_mode_paiement, proprietaire_commission_percent, proprietaire_plafond_travaux, proprietaire_last_statement_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON DUPLICATE KEY UPDATE
        linked_user_id = VALUES(linked_user_id),
        email = VALUES(email),
        global_status = VALUES(global_status),
        score_override = VALUES(score_override),
        canal_entree = VALUES(canal_entree),
        last_interaction_at = VALUES(last_interaction_at),
        last_interaction_note = VALUES(last_interaction_note),
        active_roles_json = VALUES(active_roles_json),
        vip = VALUES(vip),
        blacklist_reason = VALUES(blacklist_reason),
        locataire_status = VALUES(locataire_status),
        loc_cin_validee = VALUES(loc_cin_validee),
        loc_contrat_signe = VALUES(loc_contrat_signe),
        loc_depot_encaisse = VALUES(loc_depot_encaisse),
        loc_justificatif_revenus = VALUES(loc_justificatif_revenus),
        loc_attestation_travail = VALUES(loc_attestation_travail),
        loc_nb_personnes = VALUES(loc_nb_personnes),
        loc_jour_echeance = VALUES(loc_jour_echeance),
        loc_penalite_mode = VALUES(loc_penalite_mode),
        loc_penalite_valeur = VALUES(loc_penalite_valeur),
        saison_min_nuits = VALUES(saison_min_nuits),
        saison_max_nuits = VALUES(saison_max_nuits),
        saison_capacite_max = VALUES(saison_capacite_max),
        saison_jours_arrivee_json = VALUES(saison_jours_arrivee_json),
        saison_jours_depart_json = VALUES(saison_jours_depart_json),
        saison_acompte_pourcentage = VALUES(saison_acompte_pourcentage),
        saison_documents_recus = VALUES(saison_documents_recus),
        saison_depot_bloque = VALUES(saison_depot_bloque),
        saison_depot_retenu_montant = VALUES(saison_depot_retenu_montant),
        saison_depot_retenu_motif = VALUES(saison_depot_retenu_motif),
        acheteur_status = VALUES(acheteur_status),
        acheteur_zones_json = VALUES(acheteur_zones_json),
        acheteur_types_json = VALUES(acheteur_types_json),
        acheteur_budget_min = VALUES(acheteur_budget_min),
        acheteur_budget_max = VALUES(acheteur_budget_max),
        acheteur_surface_min = VALUES(acheteur_surface_min),
        acheteur_distance_plage_max = VALUES(acheteur_distance_plage_max),
        acheteur_financement_mode = VALUES(acheteur_financement_mode),
        acheteur_next_action = VALUES(acheteur_next_action),
        acheteur_action_due_at = VALUES(acheteur_action_due_at),
        proprietaire_status = VALUES(proprietaire_status),
        proprietaire_mandat_type = VALUES(proprietaire_mandat_type),
        proprietaire_mandat_start = VALUES(proprietaire_mandat_start),
        proprietaire_mandat_end = VALUES(proprietaire_mandat_end),
        proprietaire_reversement_frequence = VALUES(proprietaire_reversement_frequence),
        proprietaire_mode_paiement = VALUES(proprietaire_mode_paiement),
        proprietaire_commission_percent = VALUES(proprietaire_commission_percent),
        proprietaire_plafond_travaux = VALUES(proprietaire_plafond_travaux),
        proprietaire_last_statement_at = VALUES(proprietaire_last_statement_at),
        updated_at = VALUES(updated_at)`,
      [profileId, sourceTable, sourceId, ...payload]
    );

    const profile = await fetchClienteleProfileBySource(sourceTable, sourceId);
    res.json(profile);
  } catch (error) {
    console.error('Error saving clientele profile:', error);
    res.status(500).json({ error: 'Impossible de sauvegarder le profil clientele' });
  }
});

app.put('/api/auth/social/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const nom = String(req.body?.name || req.body?.nom || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const telephone = String(req.body?.telephone || '').trim();
    const clientType = String(req.body?.clientType || req.body?.client_type || '').trim().toLowerCase();
    const cin = String(req.body?.cin || '').trim();
    const cinImageUrl = String(req.body?.cinImageUrl || req.body?.cin_image_url || '').trim();
    const avatar = req.body?.avatar === undefined ? undefined : String(req.body.avatar || '').trim();
    const now = getAgencySqlDateTime();

    if (!id) return res.status(400).json({ error: 'Utilisateur introuvable' });
    if (!nom) return res.status(400).json({ error: 'Nom obligatoire' });
    if (!email) return res.status(400).json({ error: 'Email obligatoire' });
    if (!telephone) return res.status(400).json({ error: 'Numero de telephone obligatoire' });
    if (!['proprietaire', 'locataire', 'acheteur'].includes(clientType)) {
      return res.status(400).json({ error: 'Type client obligatoire' });
    }

    const [existingRows] = await pool.query('SELECT id FROM utilisateurs WHERE id = ? LIMIT 1', [id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Utilisateur non trouve' });
    }

    const [emailRows] = await pool.query('SELECT id FROM utilisateurs WHERE email = ? AND id <> ? LIMIT 1', [email, id]);
    if (emailRows[0]) {
      return res.status(409).json({ error: 'Cet email est deja utilise' });
    }

    await pool.query(
      `UPDATE utilisateurs
       SET nom = ?, email = ?, telephone = ?, client_type = ?, cin = ?, cin_image_url = ?, avatar = COALESCE(?, avatar),
           profile_completed_at = ?, updated_at = ?
       WHERE id = ?`,
      [nom, email, telephone, clientType, cin || null, cinImageUrl || null, avatar || null, now, now, id]
    );

    const [rows] = await pool.query(
      `SELECT id, nom, email, role, avatar, telephone, client_type, cin, cin_image_url, profile_completed_at,
              auth_provider, provider_user_id, last_login_at, updated_at
       FROM utilisateurs
       WHERE id = ? LIMIT 1`,
      [id]
    );
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouve apres mise a jour' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.nom,
        role: user.role,
        avatar: user.avatar || null,
        clientType: user.client_type || null,
        telephone: user.telephone || null,
        cin: user.cin || null,
        cinImageUrl: user.cin_image_url || null,
        authProvider: user.auth_provider,
        providerUserId: user.provider_user_id || null,
        lastLoginAt: user.last_login_at || null,
        updatedAt: user.updated_at || null,
        profileCompleted: Boolean(user.profile_completed_at && user.telephone && user.client_type),
      },
    });
  } catch (error) {
    console.error('Error completing social profile:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde du profil client' });
  }
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
    const { id, nom, email, role, avatar, telephone, client_type, cin, cin_image_url } = req.body;
    const newId = id || 'u' + Date.now();
    const created_at = new Date().toISOString().split('T')[0];
    await pool.query(
      `INSERT INTO utilisateurs (id, nom, email, role, avatar, telephone, client_type, cin, cin_image_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, nom, email, role || 'user', avatar || null, telephone || null, client_type || null, cin || null, cin_image_url || null, created_at]
    );
    const [newUser] = await pool.query('SELECT * FROM utilisateurs WHERE id = ?', [newId]);
    res.status(201).json(newUser[0]);
  } catch (error) {
    console.error('Error creating utilisateur:', error);
    res.status(500).json({ error: 'Failed to create utilisateur' });
  }
});

app.put('/api/utilisateurs/:id', async (req, res) => {
  try {
    const { nom, email, role, avatar, telephone, client_type, cin, cin_image_url } = req.body;
    await pool.query(
      `UPDATE utilisateurs
       SET nom = ?, email = ?, role = ?, avatar = ?, telephone = ?, client_type = ?, cin = ?, cin_image_url = ?, updated_at = ?
       WHERE id = ?`,
      [
        nom,
        email,
        role || 'user',
        avatar || null,
        telephone || null,
        client_type || null,
        cin || null,
        cin_image_url || null,
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        req.params.id,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM utilisateurs WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(rows[0] || null);
  } catch (error) {
    console.error('Error updating utilisateur:', error);
    res.status(500).json({ error: 'Failed to update utilisateur' });
  }
});

app.delete('/api/utilisateurs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM utilisateurs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting utilisateur:', error);
    res.status(500).json({ error: 'Failed to delete utilisateur' });
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

