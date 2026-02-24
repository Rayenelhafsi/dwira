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
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const env = {
    ...readEnvFile(path.join(root, '.env')),
    ...process.env,
  };

  const connection = await mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || 'root',
    database: env.DB_NAME || 'dwira',
    multipleStatements: true,
  });

  const now = new Date();
  const nowSql = now.toISOString().slice(0, 19).replace('T', ' ');
  const dateAjout = now.toISOString().slice(0, 10);

  await connection.query(
    `
    INSERT INTO zones (id, nom, description, google_maps_url) VALUES
      ('z_seed_centre', 'Kelibia Centre', 'Zone seed test centre', 'https://maps.app.goo.gl/1ajusb4v6eQGp6WJ9'),
      ('z_seed_mansoura', 'Plage El Mansoura', 'Zone seed test plage', 'https://maps.app.goo.gl/1ajusb4v6eQGp6WJ9')
    ON DUPLICATE KEY UPDATE
      nom = VALUES(nom),
      description = VALUES(description),
      google_maps_url = VALUES(google_maps_url)
    `
  );

  await connection.query(
    `
    INSERT INTO proprietaires (id, nom, telephone, email, cin) VALUES
      ('prop_seed_1', 'Proprietaire Seed 1', '+21650000001', 'seed.owner1@dwira.test', 'SEED-CIN-001'),
      ('prop_seed_2', 'Proprietaire Seed 2', '+21650000002', 'seed.owner2@dwira.test', 'SEED-CIN-002')
    ON DUPLICATE KEY UPDATE
      nom = VALUES(nom),
      telephone = VALUES(telephone),
      email = VALUES(email),
      cin = VALUES(cin)
    `
  );

  const biens = [
    {
      id: 'bien_seed_appartement_vente',
      reference: 'SEED-VENTE-APP-001',
      titre: 'Appartement Vue Mer Seed',
      description: 'Appartement de test injecte via script seed.',
      type: 'appartement',
      nb_chambres: 3,
      nb_salle_bain: 2,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      statut: 'disponible',
      menage_en_cours: 0,
      zone_id: 'z_seed_centre',
      proprietaire_id: 'prop_seed_1',
      mode: 'vente',
      tarification_methode: 'avec_commission',
      prix_affiche_client: 320000,
      prix_fixe_proprietaire: 304000,
      prix_final: 326400,
      revenu_agence: 22400,
      commission_pourcentage_proprietaire: 3,
      commission_pourcentage_client: 2,
      modalite_paiement_vente: 'facilite',
      pourcentage_premiere_partie_promesse: 30,
      montant_premiere_partie_promesse: 97920,
      montant_deuxieme_partie: 228480,
      nombre_tranches: 12,
      periode_tranches_mois: 12,
      montant_par_tranche: 19040,
      superficie_m2: 145,
      etage: 2,
      configuration: 'S+3',
      type_rue: 'route_goudronnee',
      type_papier: 'titre_foncier_individuel',
      distance_plage_m: 350,
      vue_mer: 1,
      balcon: 1,
      climatisation: 1,
      eau_sonede: 1,
      electricite_steg: 1,
    },
    {
      id: 'bien_seed_villa_vente',
      reference: 'SEED-VENTE-VIL-001',
      titre: 'Villa Moderne Seed',
      description: 'Villa seed pour tester les cartes ventes.',
      type: 'villa_maison',
      nb_chambres: 4,
      nb_salle_bain: 3,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      statut: 'disponible',
      menage_en_cours: 0,
      zone_id: 'z_seed_mansoura',
      proprietaire_id: 'prop_seed_1',
      mode: 'vente',
      tarification_methode: 'sans_commission',
      prix_affiche_client: 680000,
      prix_fixe_proprietaire: 650000,
      prix_final: 680000,
      revenu_agence: 30000,
      montant_max_reduction_negociation: 12000,
      prix_minimum_accepte: 668000,
      modalite_paiement_vente: 'comptant',
      pourcentage_premiere_partie_promesse: 100,
      montant_premiere_partie_promesse: 680000,
      montant_deuxieme_partie: 0,
      nombre_tranches: 0,
      periode_tranches_mois: 0,
      montant_par_tranche: 0,
      superficie_m2: 420,
      type_rue: 'rue_residentielle',
      type_papier: 'titre_foncier_individuel',
      proche_plage: 1,
      place_parking: 1,
      terrasse: 1,
      eau_sonede: 1,
      electricite_steg: 1,
    },
    {
      id: 'bien_seed_terrain_vente',
      reference: 'SEED-VENTE-TER-001',
      titre: 'Terrain Habitation Seed',
      description: 'Terrain seed avec affichage total et m2.',
      type: 'terrain',
      nb_chambres: 0,
      nb_salle_bain: 0,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      statut: 'disponible',
      menage_en_cours: 0,
      zone_id: 'z_seed_centre',
      proprietaire_id: 'prop_seed_2',
      mode: 'vente',
      tarification_methode: 'avec_commission',
      prix_affiche_client: 165000,
      prix_fixe_proprietaire: 156750,
      prix_final: 168300,
      revenu_agence: 11550,
      commission_pourcentage_proprietaire: 3,
      commission_pourcentage_client: 2,
      modalite_paiement_vente: 'facilite',
      pourcentage_premiere_partie_promesse: 35,
      montant_premiere_partie_promesse: 58905,
      montant_deuxieme_partie: 109395,
      nombre_tranches: 8,
      periode_tranches_mois: 8,
      montant_par_tranche: 13674.38,
      type_terrain: 'habitation',
      terrain_facade_m: 18,
      terrain_surface_m2: 550,
      terrain_distance_plage_m: 500,
      terrain_zone: 'Zone Urbaine A',
      terrain_constructible: 1,
      terrain_angle: 1,
      terrain_prix_affiche_total: 165000,
      terrain_prix_affiche_par_m2: 300,
      terrain_mode_affichage_prix: 'total_et_m2',
      eau_sonede: 1,
      electricite_steg: 1,
    },
    {
      id: 'bien_seed_local_vente',
      reference: 'SEED-VENTE-LOC-001',
      titre: 'Local Commercial Seed',
      description: 'Local seed pour tester les details commerciaux.',
      type: 'local_commercial',
      nb_chambres: 0,
      nb_salle_bain: 1,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      statut: 'reserve',
      menage_en_cours: 0,
      zone_id: 'z_seed_centre',
      proprietaire_id: 'prop_seed_2',
      mode: 'vente',
      tarification_methode: 'avec_commission',
      prix_affiche_client: 210000,
      prix_fixe_proprietaire: 199500,
      prix_final: 214200,
      revenu_agence: 14700,
      commission_pourcentage_proprietaire: 3,
      commission_pourcentage_client: 2,
      modalite_paiement_vente: 'facilite',
      pourcentage_premiere_partie_promesse: 30,
      montant_premiere_partie_promesse: 64260,
      montant_deuxieme_partie: 149940,
      nombre_tranches: 10,
      periode_tranches_mois: 10,
      montant_par_tranche: 14994,
      surface_local_m2: 95,
      facade_m: 7.5,
      hauteur_plafond_m: 3.6,
      activite_recommandee: 'Showroom',
      toilette: 1,
      reserve_local: 1,
      vitrine: 1,
      coin_angle: 1,
      electricite_3_phases: 1,
      alarme: 1,
      eau_sonede: 1,
      electricite_steg: 1,
    },
    {
      id: 'bien_seed_immeuble_vente',
      reference: 'SEED-VENTE-IMM-001',
      titre: 'Immeuble Premium Seed',
      description: 'Immeuble seed avec appartements, garages et locaux.',
      type: 'immeuble',
      nb_chambres: 0,
      nb_salle_bain: 0,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      statut: 'disponible',
      menage_en_cours: 0,
      zone_id: 'z_seed_mansoura',
      proprietaire_id: 'prop_seed_1',
      mode: 'vente',
      tarification_methode: 'avec_commission',
      prix_affiche_client: 1850000,
      prix_fixe_proprietaire: 1757500,
      prix_final: 1887000,
      revenu_agence: 129500,
      commission_pourcentage_proprietaire: 3,
      commission_pourcentage_client: 2,
      modalite_paiement_vente: 'facilite',
      pourcentage_premiere_partie_promesse: 30,
      montant_premiere_partie_promesse: 566100,
      montant_deuxieme_partie: 1320900,
      nombre_tranches: 18,
      periode_tranches_mois: 18,
      montant_par_tranche: 73383.33,
      immeuble_details_json: JSON.stringify({
        surface_terrain_m2: 980,
        surface_batie_m2: 1650,
        nb_niveaux: 4,
        nb_garages: 3,
        nb_appartements: 6,
        nb_locaux_commerciaux: 2,
        distance_plage_m: 220,
        proche_plage: true,
        ascenseur: true,
        parking_sous_sol: true,
        parking_exterieur: true,
        syndic: true,
        vue_mer: true,
        garages: [{ index: 1, reference: 'GAR-1' }, { index: 2, reference: 'GAR-2' }, { index: 3, reference: 'GAR-3' }],
        locaux_commerciaux: [{ index: 1, reference: 'LOC-1' }, { index: 2, reference: 'LOC-2' }],
      }),
      immeuble_appartements_json: JSON.stringify([
        { index: 1, reference: 'A1', chambres: 2, salle_bain: 1, superficie_m2: 110, configuration: 'S+2' },
        { index: 2, reference: 'A2', chambres: 3, salle_bain: 2, superficie_m2: 140, configuration: 'S+3' },
      ]),
      eau_sonede: 1,
      electricite_steg: 1,
    },
    {
      id: 'bien_seed_lotissement_vente',
      reference: 'SEED-VENTE-LOT-001',
      titre: 'Lotissement Jardin Seed',
      description: 'Lotissement seed avec terrains et paliers.',
      type: 'lotissement',
      nb_chambres: 0,
      nb_salle_bain: 0,
      prix_nuitee: 0,
      avance: 0,
      caution: 0,
      statut: 'disponible',
      menage_en_cours: 0,
      zone_id: 'z_seed_mansoura',
      proprietaire_id: 'prop_seed_2',
      mode: 'vente',
      tarification_methode: 'avec_commission',
      prix_affiche_client: 990000,
      prix_fixe_proprietaire: 940500,
      prix_final: 1009800,
      revenu_agence: 69300,
      commission_pourcentage_proprietaire: 3,
      commission_pourcentage_client: 2,
      modalite_paiement_vente: 'facilite',
      pourcentage_premiere_partie_promesse: 30,
      montant_premiere_partie_promesse: 302940,
      montant_deuxieme_partie: 706860,
      nombre_tranches: 12,
      periode_tranches_mois: 12,
      montant_par_tranche: 58905,
      lotissement_nb_terrains: 8,
      lotissement_prix_total: 990000,
      lotissement_mode_prix_m2: 'paliers',
      lotissement_prix_m2_unique: 280,
      lotissement_terrains_json: JSON.stringify([
        { index: 1, reference: 'T1', type_terrain: 'habitation', surface_m2: 420, type_rue: 'route_goudronnee', type_papier: 'titre_foncier_individuel', terrain_zone: 'A', terrain_distance_plage_m: 300, terrain_constructible: true, terrain_angle: false },
        { index: 2, reference: 'T2', type_terrain: 'habitation', surface_m2: 510, type_rue: 'route_goudronnee', type_papier: 'titre_foncier_individuel', terrain_zone: 'A', terrain_distance_plage_m: 320, terrain_constructible: true, terrain_angle: true }
      ]),
      lotissement_paliers_prix_m2_json: JSON.stringify([
        { min_m2: 300, max_m2: 450, prix_m2: 290 },
        { min_m2: 451, max_m2: 700, prix_m2: 270 }
      ]),
      eau_sonede: 1,
      electricite_steg: 1,
    },
  ];

  for (const bien of biens) {
    await connection.query(
      `
      INSERT INTO biens (
        id, reference, titre, description, type, nb_chambres, nb_salle_bain, prix_nuitee, avance, caution, statut, menage_en_cours,
        zone_id, proprietaire_id, date_ajout, created_at, updated_at, mode,
        tarification_methode, prix_affiche_client, prix_fixe_proprietaire, prix_final, revenu_agence,
        commission_pourcentage_proprietaire, commission_pourcentage_client, montant_max_reduction_negociation, prix_minimum_accepte,
        modalite_paiement_vente, pourcentage_premiere_partie_promesse, montant_premiere_partie_promesse, montant_deuxieme_partie,
        nombre_tranches, periode_tranches_mois, montant_par_tranche,
        type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
        proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville, cuisine_equipee, place_parking,
        syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg,
        surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette, reserve_local, vitrine, coin_angle, electricite_3_phases, alarme,
        type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle,
        terrain_prix_affiche_total, terrain_prix_affiche_par_m2, terrain_mode_affichage_prix,
        lotissement_nb_terrains, lotissement_prix_total, lotissement_mode_prix_m2, lotissement_prix_m2_unique, lotissement_terrains_json, lotissement_paliers_prix_m2_json,
        immeuble_details_json, immeuble_appartements_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )
      ON DUPLICATE KEY UPDATE
        titre = VALUES(titre),
        description = VALUES(description),
        type = VALUES(type),
        nb_chambres = VALUES(nb_chambres),
        nb_salle_bain = VALUES(nb_salle_bain),
        prix_nuitee = VALUES(prix_nuitee),
        avance = VALUES(avance),
        caution = VALUES(caution),
        statut = VALUES(statut),
        menage_en_cours = VALUES(menage_en_cours),
        zone_id = VALUES(zone_id),
        proprietaire_id = VALUES(proprietaire_id),
        date_ajout = VALUES(date_ajout),
        updated_at = VALUES(updated_at),
        mode = VALUES(mode),
        tarification_methode = VALUES(tarification_methode),
        prix_affiche_client = VALUES(prix_affiche_client),
        prix_fixe_proprietaire = VALUES(prix_fixe_proprietaire),
        prix_final = VALUES(prix_final),
        revenu_agence = VALUES(revenu_agence),
        commission_pourcentage_proprietaire = VALUES(commission_pourcentage_proprietaire),
        commission_pourcentage_client = VALUES(commission_pourcentage_client),
        montant_max_reduction_negociation = VALUES(montant_max_reduction_negociation),
        prix_minimum_accepte = VALUES(prix_minimum_accepte),
        modalite_paiement_vente = VALUES(modalite_paiement_vente),
        pourcentage_premiere_partie_promesse = VALUES(pourcentage_premiere_partie_promesse),
        montant_premiere_partie_promesse = VALUES(montant_premiere_partie_promesse),
        montant_deuxieme_partie = VALUES(montant_deuxieme_partie),
        nombre_tranches = VALUES(nombre_tranches),
        periode_tranches_mois = VALUES(periode_tranches_mois),
        montant_par_tranche = VALUES(montant_par_tranche),
        type_rue = VALUES(type_rue),
        type_papier = VALUES(type_papier),
        superficie_m2 = VALUES(superficie_m2),
        etage = VALUES(etage),
        configuration = VALUES(configuration),
        annee_construction = VALUES(annee_construction),
        distance_plage_m = VALUES(distance_plage_m),
        proche_plage = VALUES(proche_plage),
        chauffage_central = VALUES(chauffage_central),
        climatisation = VALUES(climatisation),
        balcon = VALUES(balcon),
        terrasse = VALUES(terrasse),
        ascenseur = VALUES(ascenseur),
        vue_mer = VALUES(vue_mer),
        gaz_ville = VALUES(gaz_ville),
        cuisine_equipee = VALUES(cuisine_equipee),
        place_parking = VALUES(place_parking),
        syndic = VALUES(syndic),
        meuble = VALUES(meuble),
        independant = VALUES(independant),
        eau_puits = VALUES(eau_puits),
        eau_sonede = VALUES(eau_sonede),
        electricite_steg = VALUES(electricite_steg),
        surface_local_m2 = VALUES(surface_local_m2),
        facade_m = VALUES(facade_m),
        hauteur_plafond_m = VALUES(hauteur_plafond_m),
        activite_recommandee = VALUES(activite_recommandee),
        toilette = VALUES(toilette),
        reserve_local = VALUES(reserve_local),
        vitrine = VALUES(vitrine),
        coin_angle = VALUES(coin_angle),
        electricite_3_phases = VALUES(electricite_3_phases),
        alarme = VALUES(alarme),
        type_terrain = VALUES(type_terrain),
        terrain_facade_m = VALUES(terrain_facade_m),
        terrain_surface_m2 = VALUES(terrain_surface_m2),
        terrain_distance_plage_m = VALUES(terrain_distance_plage_m),
        terrain_zone = VALUES(terrain_zone),
        terrain_constructible = VALUES(terrain_constructible),
        terrain_angle = VALUES(terrain_angle),
        terrain_prix_affiche_total = VALUES(terrain_prix_affiche_total),
        terrain_prix_affiche_par_m2 = VALUES(terrain_prix_affiche_par_m2),
        terrain_mode_affichage_prix = VALUES(terrain_mode_affichage_prix),
        lotissement_nb_terrains = VALUES(lotissement_nb_terrains),
        lotissement_prix_total = VALUES(lotissement_prix_total),
        lotissement_mode_prix_m2 = VALUES(lotissement_mode_prix_m2),
        lotissement_prix_m2_unique = VALUES(lotissement_prix_m2_unique),
        lotissement_terrains_json = VALUES(lotissement_terrains_json),
        lotissement_paliers_prix_m2_json = VALUES(lotissement_paliers_prix_m2_json),
        immeuble_details_json = VALUES(immeuble_details_json),
        immeuble_appartements_json = VALUES(immeuble_appartements_json)
      `,
      [
        bien.id, bien.reference, bien.titre, bien.description, bien.type, bien.nb_chambres, bien.nb_salle_bain, bien.prix_nuitee, bien.avance, bien.caution, bien.statut, bien.menage_en_cours,
        bien.zone_id, bien.proprietaire_id, dateAjout, nowSql, nowSql, bien.mode,
        bien.tarification_methode || null, bien.prix_affiche_client || null, bien.prix_fixe_proprietaire || null, bien.prix_final || null, bien.revenu_agence || null,
        bien.commission_pourcentage_proprietaire || null, bien.commission_pourcentage_client || null, bien.montant_max_reduction_negociation || null, bien.prix_minimum_accepte || null,
        bien.modalite_paiement_vente || null, bien.pourcentage_premiere_partie_promesse || null, bien.montant_premiere_partie_promesse || null, bien.montant_deuxieme_partie || null,
        bien.nombre_tranches || null, bien.periode_tranches_mois || null, bien.montant_par_tranche || null,
        bien.type_rue || null, bien.type_papier || null, bien.superficie_m2 || null, bien.etage || null, bien.configuration || null, bien.annee_construction || null, bien.distance_plage_m || null,
        bien.proche_plage || 0, bien.chauffage_central || 0, bien.climatisation || 0, bien.balcon || 0, bien.terrasse || 0, bien.ascenseur || 0, bien.vue_mer || 0, bien.gaz_ville || 0, bien.cuisine_equipee || 0, bien.place_parking || 0,
        bien.syndic || 0, bien.meuble || 0, bien.independant || 0, bien.eau_puits || 0, bien.eau_sonede || 0, bien.electricite_steg || 0,
        bien.surface_local_m2 || null, bien.facade_m || null, bien.hauteur_plafond_m || null, bien.activite_recommandee || null, bien.toilette || 0, bien.reserve_local || 0, bien.vitrine || 0, bien.coin_angle || 0, bien.electricite_3_phases || 0, bien.alarme || 0,
        bien.type_terrain || null, bien.terrain_facade_m || null, bien.terrain_surface_m2 || null, bien.terrain_distance_plage_m || null, bien.terrain_zone || null, bien.terrain_constructible || 0, bien.terrain_angle || 0,
        bien.terrain_prix_affiche_total || null, bien.terrain_prix_affiche_par_m2 || null, bien.terrain_mode_affichage_prix || null,
        bien.lotissement_nb_terrains || null, bien.lotissement_prix_total || null, bien.lotissement_mode_prix_m2 || null, bien.lotissement_prix_m2_unique || null, bien.lotissement_terrains_json || null, bien.lotissement_paliers_prix_m2_json || null,
        bien.immeuble_details_json || null, bien.immeuble_appartements_json || null,
      ]
    );
  }

  const medias = [
    ['m_seed_app_1', 'bien_seed_appartement_vente', 'image', 'https://images.unsplash.com/photo-1738168279272-c08d6dd22002?auto=format&fit=crop&w=1600&q=80', null, 0],
    ['m_seed_villa_1', 'bien_seed_villa_vente', 'image', 'https://images.unsplash.com/photo-1690549392404-de10519e6adb?auto=format&fit=crop&w=1600&q=80', null, 0],
    ['m_seed_terrain_1', 'bien_seed_terrain_vente', 'image', 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?auto=format&fit=crop&w=1600&q=80', null, 0],
    ['m_seed_local_1', 'bien_seed_local_vente', 'image', 'https://images.unsplash.com/photo-1641159930908-e9eb9ccdc002?auto=format&fit=crop&w=1600&q=80', null, 0],
    ['m_seed_imm_1', 'bien_seed_immeuble_vente', 'image', 'https://images.unsplash.com/photo-1559329146-807aff9ff1fb?auto=format&fit=crop&w=1600&q=80', null, 0],
    ['m_seed_lot_1', 'bien_seed_lotissement_vente', 'image', 'https://images.unsplash.com/photo-1764222233275-87dc016c11dc?auto=format&fit=crop&w=1600&q=80', null, 0],
    ['m_seed_imm_app_1', 'bien_seed_immeuble_vente', 'image', 'https://images.unsplash.com/photo-1738168279272-c08d6dd22002?auto=format&fit=crop&w=1600&q=80', 'gallery_unite|vente|immeuble|appartement_1', 1],
    ['m_seed_imm_app_2', 'bien_seed_immeuble_vente', 'image', 'https://images.unsplash.com/photo-1597497522150-2f50bffea452?auto=format&fit=crop&w=1600&q=80', 'gallery_unite|vente|immeuble|appartement_2', 2],
    ['m_seed_lot_ter_1', 'bien_seed_lotissement_vente', 'image', 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?auto=format&fit=crop&w=1600&q=80', 'gallery_unite|vente|lotissement|terrain_1', 1],
    ['m_seed_lot_ter_2', 'bien_seed_lotissement_vente', 'image', 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?auto=format&fit=crop&w=1600&q=80', 'gallery_unite|vente|lotissement|terrain_2', 2],
  ];

  for (const media of medias) {
    await connection.query(
      `
      INSERT INTO media (id, bien_id, type, url, motif_upload, position)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        bien_id = VALUES(bien_id),
        type = VALUES(type),
        url = VALUES(url),
        motif_upload = VALUES(motif_upload),
        position = VALUES(position)
      `,
      media
    );
  }

  const [countRows] = await connection.query(
    "SELECT COUNT(*) AS total FROM biens WHERE mode = 'vente' AND id LIKE 'bien_seed_%'"
  );

  console.log(`Seed ventes termine. Biens seed vente disponibles: ${countRows[0].total}`);
  await connection.end();
}

main().catch((error) => {
  console.error('Echec seed ventes:', error.message);
  process.exit(1);
});
