const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const entries = lines
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    });
  return Object.fromEntries(entries);
}

function uid(prefix, value) {
  return `${prefix}_${String(value).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 36)}`;
}

function pickKnownColumns(row, allowedColumns) {
  return Object.fromEntries(
    Object.entries(row).filter(([key, value]) => value !== undefined && allowedColumns.has(key))
  );
}

async function upsertRow(connection, table, row, keyColumns = ['id']) {
  const columns = Object.keys(row).filter((key) => row[key] !== undefined);
  const placeholders = columns.map(() => '?').join(', ');
  const updateColumns = columns.filter((column) => !keyColumns.includes(column));
  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${updateColumns.map((column) => `${column}=VALUES(${column})`).join(', ')}
  `;
  await connection.query(sql, columns.map((column) => row[column]));
}

async function replaceMedia(connection, bienId, items) {
  await connection.query('DELETE FROM media WHERE bien_id = ?', [bienId]);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    await upsertRow(connection, 'media', {
      id: item.id || uid('media', `${bienId}_${index}_${item.motif_upload}`),
      bien_id: bienId,
      type: item.type || 'image',
      url: item.url,
      motif_upload: item.motif_upload || 'gallery',
      position: index,
    });
  }
}

async function replaceBienFeatures(connection, bienId, features) {
  await connection.query('DELETE FROM bien_caracteristiques WHERE bien_id = ?', [bienId]);
  for (const feature of features) {
    await upsertRow(connection, 'bien_caracteristiques', {
      bien_id: bienId,
      caracteristique_id: feature.caracteristique_id,
      visibilite_client: 1,
      override_nom: feature.override_nom || null,
      override_type_caracteristique: feature.override_type_caracteristique || null,
      override_unite: feature.override_unite || null,
      override_onglet_id: feature.override_onglet_id || null,
      override_valeur_json: feature.override_valeur_json ? JSON.stringify(feature.override_valeur_json) : null,
    }, ['bien_id', 'caracteristique_id']);
  }
}

async function ensureFeature(connection, feature) {
  const [[existingFeature]] = await connection.query(
    'SELECT id FROM caracteristiques WHERE nom = ? LIMIT 1',
    [feature.nom]
  );
  const featureId = existingFeature?.id || feature.id;
  await upsertRow(connection, 'caracteristiques', {
    id: featureId,
    nom: feature.nom,
    type_caracteristique: feature.type_caracteristique || 'simple',
    choix_json: feature.choix_json ? JSON.stringify(feature.choix_json) : null,
    unite: feature.unite || null,
    icon_name: feature.icon_name || null,
    visibilite_client: 1,
  });
  await upsertRow(connection, 'caracteristique_contextes', {
    id: uid('ctx', `${featureId}_${feature.mode_bien}_${feature.type_bien}`),
    caracteristique_id: featureId,
    mode_bien: feature.mode_bien,
    type_bien: feature.type_bien,
    onglet_id: feature.onglet_id || null,
  });
  if (feature.onglet_id) {
    await upsertRow(connection, 'modifier_onglets', {
      id: uid('mo', `${featureId}_${feature.mode_bien}_${feature.type_bien}`),
      mode_bien: feature.mode_bien,
      type_bien: feature.type_bien,
      onglet_id: feature.onglet_id,
      caracteristique_id: featureId,
      ordre: feature.ordre || 100,
    });
  }
  return featureId;
}

async function main() {
  const env = loadEnv();
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
  });

  const today = '2026-07-29';
  const now = '2026-07-29 12:00:00';
  const [bienColumnsRows] = await connection.query('SHOW COLUMNS FROM biens');
  const bienColumns = new Set(bienColumnsRows.map((row) => String(row.Field)));

  const featureDefs = [
    { id: 'sale_villa_piscine', nom: 'Piscine privee', type_caracteristique: 'simple', icon_name: 'pool', mode_bien: 'vente', type_bien: 'villa_maison', onglet_id: 'tab1772311598348', ordre: 10 },
    { id: 'sale_villa_suite', nom: 'Suite parentale', type_caracteristique: 'simple', icon_name: 'bed', mode_bien: 'vente', type_bien: 'villa_maison', onglet_id: 'tab1772311598348', ordre: 11 },
    { id: 'sale_villa_securite', nom: 'Securite residence', type_caracteristique: 'simple', icon_name: 'security', mode_bien: 'vente', type_bien: 'villa_maison', onglet_id: 'tab1772311598348', ordre: 12 },
    { id: 'sale_villa_cuisine_ext', nom: 'Cuisine exterieure', type_caracteristique: 'simple', icon_name: 'deck', mode_bien: 'vente', type_bien: 'villa_maison', onglet_id: 'tab1772311598348', ordre: 13 },
    { id: 'sale_villa_parking_multi', nom: 'Parking visiteurs', type_caracteristique: 'valeur', icon_name: 'parking', mode_bien: 'vente', type_bien: 'villa_maison', onglet_id: 'tab1772311598348', ordre: 14 },
    { id: 'sale_app_residence', nom: 'Residence securisee', type_caracteristique: 'simple', icon_name: 'security', mode_bien: 'vente', type_bien: 'appartement', onglet_id: 'tab1772323427763', ordre: 20 },
    { id: 'sale_app_parking_ss', nom: 'Parking sous-sol', type_caracteristique: 'simple', icon_name: 'parking', mode_bien: 'vente', type_bien: 'appartement', onglet_id: 'tab1772323427763', ordre: 21 },
    { id: 'sale_app_vestiaire', nom: 'Dressing integre', type_caracteristique: 'simple', icon_name: 'hanger', mode_bien: 'vente', type_bien: 'appartement', onglet_id: 'tab1772323427763', ordre: 22 },
    { id: 'sale_app_vue_pano', nom: 'Vue panoramique', type_caracteristique: 'simple', icon_name: 'view', mode_bien: 'vente', type_bien: 'appartement', onglet_id: 'tab1772323427763', ordre: 23 },
    { id: 'sale_imm_local_gardien', nom: 'Loge gardien', type_caracteristique: 'simple', icon_name: 'building', mode_bien: 'vente', type_bien: 'immeuble', onglet_id: 'tab1772739675665', ordre: 30 },
    { id: 'sale_imm_toit_terrasse', nom: 'Toit terrasse exploitable', type_caracteristique: 'simple', icon_name: 'deck', mode_bien: 'vente', type_bien: 'immeuble', onglet_id: 'tab1772739675665', ordre: 31 },
    { id: 'sale_local_flux', nom: 'Flux pieton eleve', type_caracteristique: 'simple', icon_name: 'building', mode_bien: 'vente', type_bien: 'local_commercial', onglet_id: 'tab1772734708649', ordre: 40 },
    { id: 'sale_local_rideau', nom: 'Rideau metallique', type_caracteristique: 'simple', icon_name: 'security', mode_bien: 'vente', type_bien: 'local_commercial', onglet_id: 'tab1772734708649', ordre: 41 },
  ];

  const featureIdMap = {};
  for (const feature of featureDefs) {
    featureIdMap[feature.id] = await ensureFeature(connection, feature);
  }

  const biens = [
    {
      id: 'sale-villa-301',
      reference: 'REF-V301',
      titre: 'Villa Horizon avec piscine',
      description: 'Villa familiale en vente avec finitions recentes, suite parentale, jardin paysage, piscine et terrasse vue mer partielle. Parcours complet pour tests client et admin.',
      mode: 'vente',
      type: 'villa_maison',
      nb_chambres: 4,
      nb_salle_bain: 3,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      superficie_m2: 312,
      annee_construction: 2021,
      distance_plage_m: 850,
      proche_plage: 1,
      chauffage_central: 1,
      climatisation: 1,
      balcon: 0,
      terrasse: 1,
      ascenseur: 0,
      vue_mer: 1,
      gaz_ville: 1,
      cuisine_equipee: 1,
      place_parking: 1,
      syndic: 0,
      meuble: 0,
      independant: 1,
      eau_puits: 0,
      eau_sonede: 1,
      electricite_steg: 1,
      statut: 'disponible',
      visible_sur_site: 1,
      is_featured: 1,
      reservation_sur_demande: 0,
      menage_en_cours: 0,
      zone_id: 'z2',
      proprietaire_id: 'p2',
      date_ajout: today,
      created_at: now,
      updated_at: now,
      prix_affiche_client: 980000,
      prix_final: 980000,
      modalite_paiement_vente: 'facilite',
      montant_premiere_partie_promesse: 98000,
      montant_deuxieme_partie: 294000,
      nombre_tranches: 6,
      montant_par_tranche: 98000,
      facade_m: 18,
    },
    {
      id: 'sale-app-401',
      reference: 'REF-A401',
      titre: 'Appartement Azure front mer',
      description: 'Appartement haut standing avec balcon, vue panoramique, cuisine equipee et residence securisee. Fiche complete pour le module ventes.',
      mode: 'vente',
      type: 'appartement',
      nb_chambres: 3,
      nb_salle_bain: 2,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      superficie_m2: 168,
      etage: 4,
      configuration: 'S+3',
      annee_construction: 2022,
      distance_plage_m: 120,
      proche_plage: 1,
      chauffage_central: 1,
      climatisation: 1,
      balcon: 1,
      terrasse: 0,
      ascenseur: 1,
      vue_mer: 1,
      gaz_ville: 1,
      cuisine_equipee: 1,
      place_parking: 1,
      syndic: 1,
      meuble: 0,
      independant: 0,
      eau_puits: 0,
      eau_sonede: 1,
      electricite_steg: 1,
      statut: 'disponible',
      visible_sur_site: 1,
      is_featured: 0,
      reservation_sur_demande: 0,
      menage_en_cours: 0,
      zone_id: 'z1',
      proprietaire_id: 'p1',
      date_ajout: today,
      created_at: now,
      updated_at: now,
      prix_affiche_client: 465000,
      prix_final: 465000,
      modalite_paiement_vente: 'comptant',
      montant_premiere_partie_promesse: 46500,
      montant_deuxieme_partie: 418500,
      nombre_tranches: 0,
      montant_par_tranche: 0,
    },
    {
      id: 'sale-imm-501',
      reference: 'REF-I501',
      titre: 'Immeuble Patio investissement',
      description: 'Immeuble R+3 avec plusieurs appartements, stationnements et local gardien. Convient a un investissement locatif ou patrimonial.',
      mode: 'vente',
      type: 'immeuble',
      nb_chambres: 0,
      nb_salle_bain: 0,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      superficie_m2: 0,
      annee_construction: 2019,
      proche_plage: 0,
      chauffage_central: 0,
      climatisation: 0,
      balcon: 0,
      terrasse: 0,
      ascenseur: 1,
      vue_mer: 0,
      gaz_ville: 0,
      cuisine_equipee: 0,
      place_parking: 0,
      syndic: 1,
      meuble: 0,
      independant: 0,
      eau_puits: 0,
      eau_sonede: 1,
      electricite_steg: 1,
      statut: 'disponible',
      visible_sur_site: 1,
      is_featured: 0,
      reservation_sur_demande: 0,
      menage_en_cours: 0,
      zone_id: 'z2',
      proprietaire_id: 'p3',
      date_ajout: today,
      created_at: now,
      updated_at: now,
      prix_affiche_client: 1650000,
      prix_final: 1650000,
      modalite_paiement_vente: 'facilite',
      montant_premiere_partie_promesse: 165000,
      montant_deuxieme_partie: 495000,
      nombre_tranches: 8,
      montant_par_tranche: 123750,
      immeuble_surface_batie_m2: 980,
      immeuble_surface_terrain_m2: 420,
      immeuble_nb_niveaux: 4,
      immeuble_nb_garages: 6,
      immeuble_nb_appartements: 8,
      immeuble_nb_locaux_commerciaux: 1,
    },
    {
      id: 'sale-terrain-201',
      reference: 'REF-T201',
      titre: 'Terrain d angle vue degagee',
      description: 'Terrain constructible avec facade genereuse, acces facile et proximite des commodites. Inclut des informations completes de viabilisation pour les tests ventes.',
      mode: 'vente',
      type: 'terrain',
      nb_chambres: 0,
      nb_salle_bain: 0,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      statut: 'disponible',
      visible_sur_site: 1,
      is_featured: 0,
      reservation_sur_demande: 0,
      menage_en_cours: 0,
      zone_id: 'z1',
      proprietaire_id: 'p1',
      date_ajout: today,
      created_at: now,
      updated_at: now,
      prix_affiche_client: 285000,
      prix_final: 285000,
      modalite_paiement_vente: 'facilite',
      montant_premiere_partie_promesse: 28500,
      montant_deuxieme_partie: 85500,
      nombre_tranches: 5,
      montant_par_tranche: 34200,
      type_terrain: 'terrain_habitation',
      terrain_facade_m: 24,
      terrain_surface_m2: 780,
      terrain_distance_plage_m: 950,
      terrain_zone: 'Zone villa',
      terrain_constructible: 1,
      terrain_angle: 1,
      terrain_prix_affiche_total: 285000,
      terrain_prix_affiche_par_m2: 365,
      terrain_mode_affichage_prix: 'total_et_m2',
      terrain_hauteur_construction_autorisee: 'R+2',
      terrain_route_acces_largeur_m: 12,
      terrain_forme: 'Rectangulaire',
      terrain_topographie: 'Plat',
      terrain_bornage: 1,
      terrain_travaux_municipalite_autorises: 1,
      terrain_limites_cadastrales: 1,
      terrain_visualisation_limites_cadastrales: 1,
      terrain_voisinage: 'Quartier residentiel',
      terrain_proximites_commodites_autres: 'Ecole, pharmacie, axe principal',
      terrain_viabilisation_onas: 'Oui',
      terrain_viabilisation_steg: 'Oui',
      terrain_viabilisation_gaz_ville: 1,
      terrain_viabilisation_fibre_optique: 1,
      terrain_viabilisation_telephone_fixe: 1,
      terrain_type_sol: 'Stable',
      terrain_vegetation: 'Quelques oliviers',
      terrain_niveau_sonore: 'Faible',
      terrain_risque_inondation: 0,
      terrain_exposition_vent: 'Moderee',
    },
    {
      id: 'b4',
      reference: 'REF-C701',
      titre: 'Local Commercial Signature',
      description: 'Local commercial premium sur axe passant, double vitrine, reserve et electricite 3 phases. Convient a showroom, agence ou activite medicale.',
      mode: 'vente',
      type: 'local_commercial',
      nb_chambres: 0,
      nb_salle_bain: 1,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      statut: 'disponible',
      visible_sur_site: 1,
      is_featured: 0,
      reservation_sur_demande: 0,
      menage_en_cours: 0,
      zone_id: 'z1',
      proprietaire_id: 'p3',
      date_ajout: today,
      created_at: now,
      updated_at: now,
      prix_affiche_client: 520000,
      prix_final: 520000,
      modalite_paiement_vente: 'facilite',
      montant_premiere_partie_promesse: 52000,
      montant_deuxieme_partie: 156000,
      nombre_tranches: 6,
      montant_par_tranche: 52000,
      surface_local_m2: 186,
      facade_m: 9.5,
      hauteur_plafond_m: 4.2,
      activite_recommandee: 'Showroom, agence, concept store',
      toilette: 1,
      reserve_local: 1,
      vitrine: 1,
      coin_angle: 1,
      electricite_3_phases: 1,
      alarme: 1,
      gaz_ville: 1,
      eau_sonede: 1,
      electricite_steg: 1,
    },
  ];

  for (const bien of biens) {
    await upsertRow(connection, 'biens', pickKnownColumns(bien, bienColumns));
  }

  const galleryBase = {
    villa: [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1600',
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1600',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=1600',
    ],
    appartement: [
      'https://images.unsplash.com/photo-1502672023488-70e25813eb80?q=80&w=1600',
      'https://images.unsplash.com/photo-1494526585095-c41746248156?q=80&w=1600',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?q=80&w=1600',
    ],
    immeuble: [
      'https://images.unsplash.com/photo-1460317442991-0ec209397118?q=80&w=1600',
      'https://images.unsplash.com/photo-1494526585095-c41746248156?q=80&w=1600',
      'https://images.unsplash.com/photo-1460317442991-0ec209397118?q=80&w=1600&sat=-20',
    ],
    terrain: [
      'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600',
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1600',
    ],
    local: [
      'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1600',
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?q=80&w=1600',
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=1600',
    ],
  };

  const plan2d = (ref) => `https://dummyimage.com/1600x1100/f8fafc/0f172a&text=Plan+2D+${encodeURIComponent(ref)}`;
  const plan3d = (ref) => `https://dummyimage.com/1600x1100/ecfeff/0f172a&text=Plan+3D+${encodeURIComponent(ref)}`;

  await replaceMedia(connection, 'sale-villa-301', [
    ...galleryBase.villa.map((url) => ({ url, motif_upload: 'gallery' })),
    { url: plan2d('REF-V301'), motif_upload: 'plan_2d' },
    { url: plan3d('REF-V301'), motif_upload: 'plan_3d' },
  ]);
  await replaceMedia(connection, 'sale-app-401', [
    ...galleryBase.appartement.map((url) => ({ url, motif_upload: 'gallery' })),
    { url: plan2d('REF-A401'), motif_upload: 'plan_2d' },
  ]);
  await replaceMedia(connection, 'sale-imm-501', [
    ...galleryBase.immeuble.map((url) => ({ url, motif_upload: 'gallery' })),
    { url: plan2d('REF-I501'), motif_upload: 'plan_2d' },
    { url: plan3d('REF-I501'), motif_upload: 'plan_3d' },
  ]);
  await replaceMedia(connection, 'sale-terrain-201', [
    ...galleryBase.terrain.map((url) => ({ url, motif_upload: 'gallery' })),
    { url: plan2d('REF-T201'), motif_upload: 'plan_2d' },
  ]);
  await replaceMedia(connection, 'b4', [
    ...galleryBase.local.map((url) => ({ url, motif_upload: 'gallery' })),
    { url: plan2d('REF-C701'), motif_upload: 'plan_2d' },
  ]);

  await replaceBienFeatures(connection, 'sale-villa-301', [
    { caracteristique_id: 'car5', override_onglet_id: 'tab1772311598348', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car8', override_onglet_id: 'tab1772311598348', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_villa_piscine, override_onglet_id: 'tab1772311598348', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_villa_suite, override_onglet_id: 'tab1772311598348', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_villa_securite, override_onglet_id: 'tab1772311598348', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_villa_cuisine_ext, override_onglet_id: 'tab1772311598348', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_villa_parking_multi, override_onglet_id: 'tab1772311598348', override_type_caracteristique: 'valeur', override_valeur_json: ['4 vehicules'] },
  ]);
  await replaceBienFeatures(connection, 'sale-app-401', [
    { caracteristique_id: 'car7', override_onglet_id: 'tab1772323427763', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car13', override_onglet_id: 'tab1772323427763', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car3', override_onglet_id: 'tab1772323427763', override_valeur_json: ['Split chaud/froid'] },
    { caracteristique_id: 'car9', override_onglet_id: 'tab1772323427763', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car15', override_onglet_id: 'tab1772323427763', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car4', override_onglet_id: 'tab1772323427763', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_app_residence, override_onglet_id: 'tab1772323427763', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_app_parking_ss, override_onglet_id: 'tab1772323427763', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_app_vestiaire, override_onglet_id: 'tab1772323427763', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_app_vue_pano, override_onglet_id: 'tab1772323427763', override_valeur_json: ['Oui'] },
  ]);
  await replaceBienFeatures(connection, 'sale-imm-501', [
    { caracteristique_id: 'car7', override_onglet_id: 'tab1772739675665', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car34', override_onglet_id: 'tab1772739675665', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car35', override_onglet_id: 'tab1772739675665', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car16', override_onglet_id: 'tab1772739675665', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_imm_local_gardien, override_onglet_id: 'tab1772739675665', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_imm_toit_terrasse, override_onglet_id: 'tab1772739675665', override_valeur_json: ['Oui'] },
  ]);
  await replaceBienFeatures(connection, 'sale-terrain-201', [
    { caracteristique_id: 'terr_surface_m2', override_onglet_id: 'dimensions_forme', override_type_caracteristique: 'valeur', override_valeur_json: ['780'] },
    { caracteristique_id: 'terr_facade_m', override_onglet_id: 'dimensions_forme', override_type_caracteristique: 'valeur', override_valeur_json: ['24'] },
    { caracteristique_id: 'terr_route_acces_largeur_m', override_onglet_id: 'dimensions_forme', override_type_caracteristique: 'valeur', override_valeur_json: ['12'] },
    { caracteristique_id: 'terr_forme', override_onglet_id: 'dimensions_forme', override_valeur_json: ['Rectangulaire'] },
    { caracteristique_id: 'car29', override_onglet_id: 'dimensions_forme', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car28', override_onglet_id: 'situation_juridique', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'terr_bornage', override_onglet_id: 'situation_juridique', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'terr_proximite_commodites', override_onglet_id: 'acces_environnement', override_valeur_json: ['Ecole', 'Pharmacie', 'Route principale'] },
    { caracteristique_id: 'terr_steg', override_onglet_id: 'viabilisation', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'terr_fibre_internet', override_onglet_id: 'viabilisation', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'terr_documents_disponibles', override_onglet_id: 'documents_disponibles', override_valeur_json: ['Titre foncier', 'Plan topographique'] },
  ]);
  await replaceBienFeatures(connection, 'b4', [
    { caracteristique_id: 'car24', override_onglet_id: 'tab1772734708649', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car22', override_onglet_id: 'tab1772734708649', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car23', override_onglet_id: 'tab1772734708649', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car25', override_onglet_id: 'tab1772734708649', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car26', override_onglet_id: 'tab1772734708649', override_valeur_json: ['Oui'] },
    { caracteristique_id: 'car27', override_onglet_id: 'tab1772734708649', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_local_flux, override_onglet_id: 'tab1772734708649', override_valeur_json: ['Oui'] },
    { caracteristique_id: featureIdMap.sale_local_rideau, override_onglet_id: 'tab1772734708649', override_valeur_json: ['Oui'] },
  ]);

  const [rows] = await connection.query(
    "SELECT id, reference, titre, type, statut, visible_sur_site, prix_affiche_client FROM biens WHERE mode='vente' ORDER BY reference ASC"
  );
  console.log(JSON.stringify(rows, null, 2));
  await connection.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
