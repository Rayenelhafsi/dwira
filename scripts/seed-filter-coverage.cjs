const mysql = require('mysql2/promise');

function nowSql(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function seasonConfig({
  standing,
  etage,
  vue,
  maxGuests,
  maxAdults,
  maxChildren,
  checkin = '14:00',
  checkout = '11:00',
  pricingPeriods = [],
  servicesPayants = [],
  exterieurJardin = [],
  confortInterieurs = [],
  prochePlage = false,
  distancePlageM = null,
  vueMer = false,
}) {
  return {
    categorie_standing: standing,
    etage,
    ascenseur: etage !== 'rdc',
    vue,
    niveau_sonore: 'calme',
    acces_general: 'facile',
    limite_personnes_nuit: maxGuests,
    max_adultes: maxAdults,
    max_enfants: maxChildren,
    duree_min_sejour_nuits: 2,
    duree_max_sejour_nuits: 30,
    politique_annulation: 'moderee',
    depot_garantie: true,
    montant_caution: 800,
    type_caution: 'especes',
    checkin_heure: checkin,
    checkout_heure: checkout,
    fumeurs: 'interdit',
    alcool: 'autorise',
    fetes: 'interdit',
    animaux: 'interdits',
    heures_silence_heure: '01:00',
    visiteurs: 'autorise',
    produits_accueil_gratuits: false,
    frais_produits_accueil: 20,
    matelas_supplementaire_prix: 25,
    matelas_supplementaires_max: 3,
    avance_pourcentage: 30,
    frais_menage_disponible: true,
    frais_menage: 70,
    frais_service_disponible: true,
    frais_service: 45,
    services_payants: servicesPayants,
    exterieur_jardin: exterieurJardin,
    confort_equipements_interieurs: confortInterieurs,
    proche_plage: !!prochePlage,
    distance_plage_m: distancePlageM,
    vue_mer: !!vueMer,
    pricing_periods: pricingPeriods,
  };
}

(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'dwira',
  });

  try {
    await conn.beginTransaction();
    const createdAt = nowSql();
    const today = new Date();

    const [owners] = await conn.query('SELECT id, nom FROM proprietaires ORDER BY id ASC');
    if (!owners.length) throw new Error('Aucun proprietaire en base');
    const ownerA = owners[0].id;
    const ownerB = owners[Math.min(1, owners.length - 1)].id;

    await conn.query("DELETE FROM biens WHERE id LIKE 'test_cov_bien_%'");
    await conn.query("DELETE FROM zones WHERE id LIKE 'test_cov_zone_%'");

    const zones = [
      { id: 'z1', nom: 'Ain Grenz', pays: 'Tunisie', gouvernerat: 'Nabeul', region: 'Kélibia', quartier: 'Ain Grenz' },
      { id: 'z2', nom: 'Dar Chabeb', pays: 'Tunisie', gouvernerat: 'Nabeul', region: 'Kélibia', quartier: 'Dar Chabeb' },
      { id: 'z3', nom: 'Plage El Mansoura', pays: 'Tunisie', gouvernerat: 'Nabeul', region: 'Mansoura', quartier: 'Plage El Mansoura' },
      { id: 'test_cov_zone_1', nom: 'Centre Ville', pays: 'Tunisie', gouvernerat: 'Nabeul', region: 'Kélibia', quartier: 'Centre Ville' },
      { id: 'test_cov_zone_2', nom: 'Ezzahra', pays: 'Tunisie', gouvernerat: 'Nabeul', region: 'Hammam Ghezèze', quartier: 'Ezzahra Plage' },
      { id: 'test_cov_zone_3', nom: 'Petit Paris', pays: 'Tunisie', gouvernerat: 'Nabeul', region: 'Kélibia', quartier: 'Petit Paris' },
    ];

    for (const z of zones) {
      await conn.query(
        `INSERT INTO zones (id, nom, description, pays, gouvernerat, region, quartier, google_maps_url, image_url, pays_image_url, gouvernerat_image_url, region_image_url, quartier_image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL)
         ON DUPLICATE KEY UPDATE
           nom = VALUES(nom),
           description = VALUES(description),
           pays = VALUES(pays),
           gouvernerat = VALUES(gouvernerat),
           region = VALUES(region),
           quartier = VALUES(quartier)`,
        [z.id, z.nom, `Zone test ${z.nom}`, z.pays, z.gouvernerat, z.region, z.quartier]
      );
    }

    const pricingA = [
      { id: 'cov_pp_1', start: addDays(today, 2), end: addDays(today, 16), prix_nuitee: 900, prix_semaine: 5600 },
      { id: 'cov_pp_2', start: addDays(today, 17), end: addDays(today, 40), prix_nuitee: 750, prix_semaine: 4700 },
    ];
    const pricingB = [
      { id: 'cov_pp_3', start: addDays(today, 2), end: addDays(today, 12), prix_nuitee: 420, prix_semaine: 2600 },
    ];

    const biens = [
      {
        id: 'test_cov_bien_1',
        reference: 'TEST-COV-001',
        titre: 'Appartement S+1 climatise pres de la plage',
        description: 'Appartement S+1 climatise, RDC, pres de la plage, terrasse.',
        type: 'appartement',
        configuration: 'S+1',
        zone_id: 'z1',
        proprietaire_id: ownerA,
        prix_nuitee: 220,
        prix_semaine: 1400,
        avance: 30,
        caution: 500,
        nb_chambres: 1,
        nb_salle_bain: 1,
        standing: 'economique',
        etage: 'rdc',
        vue: 'ville',
        maxGuests: 3,
        maxAdults: 2,
        maxChildren: 1,
        climatisation: true,
        terrasse: true,
      },
      {
        id: 'test_cov_bien_2',
        reference: 'TEST-COV-002',
        titre: 'Appartement S+2 toutes pieces climatisees vue sur mer',
        description: 'Appartement S+2 avec climatisation dans toutes les pieces, vue sur mer.',
        type: 'appartement',
        configuration: 'S+2',
        zone_id: 'z2',
        proprietaire_id: ownerA,
        prix_nuitee: 350,
        prix_semaine: 2200,
        avance: 30,
        caution: 600,
        nb_chambres: 2,
        nb_salle_bain: 1,
        standing: 'confort',
        etage: '1',
        vue: 'mer',
        maxGuests: 5,
        maxAdults: 3,
        maxChildren: 2,
        climatisation: true,
        terrasse: false,
      },
      {
        id: 'test_cov_bien_3',
        reference: 'TEST-COV-003',
        titre: 'Villa S+3 pied dans l eau piscine privee jardin gazon',
        description: 'Villa S+3 pied dans l eau avec piscine privee, jardin gazon et terrasse.',
        type: 'villa_maison',
        configuration: 'S+3',
        zone_id: 'z3',
        proprietaire_id: ownerB,
        prix_nuitee: 800,
        prix_semaine: 5300,
        avance: 30,
        caution: 1000,
        nb_chambres: 3,
        nb_salle_bain: 2,
        standing: 'premium',
        etage: 'rdc',
        vue: 'mer',
        maxGuests: 8,
        maxAdults: 5,
        maxChildren: 4,
        pricingPeriods: pricingA,
        climatisation: true,
        terrasse: true,
      },
      {
        id: 'test_cov_bien_4',
        reference: 'TEST-COV-004',
        titre: 'Villa S+2 piscine partagee',
        description: 'Villa S+2 avec piscine partagee et vue mer, proche plage.',
        type: 'villa_maison',
        configuration: 'S+2',
        zone_id: 'test_cov_zone_2',
        proprietaire_id: ownerB,
        prix_nuitee: 560,
        prix_semaine: 3600,
        avance: 30,
        caution: 900,
        nb_chambres: 2,
        nb_salle_bain: 2,
        standing: 'luxe',
        etage: '1',
        vue: 'mer',
        maxGuests: 6,
        maxAdults: 4,
        maxChildren: 3,
        climatisation: true,
        terrasse: false,
      },
      {
        id: 'test_cov_bien_5',
        reference: 'TEST-COV-005',
        titre: 'Studio RDC climatise centre ville',
        description: 'Studio climatise au rez de chaussee, centre ville.',
        type: 'studio',
        configuration: 'Studio',
        zone_id: 'test_cov_zone_1',
        proprietaire_id: ownerA,
        prix_nuitee: 180,
        prix_semaine: 1100,
        avance: 25,
        caution: 300,
        nb_chambres: 1,
        nb_salle_bain: 1,
        standing: 'economique',
        etage: 'rdc',
        vue: 'ville',
        maxGuests: 2,
        maxAdults: 2,
        maxChildren: 0,
        climatisation: true,
        terrasse: false,
      },
      {
        id: 'test_cov_bien_6',
        reference: 'TEST-COV-006',
        titre: 'Immeuble S+4 terrasse',
        description: 'Immeuble S+4 avec terrasse et proche plage.',
        type: 'immeuble',
        configuration: 'S+4',
        zone_id: 'test_cov_zone_3',
        proprietaire_id: ownerB,
        prix_nuitee: 420,
        prix_semaine: 2600,
        avance: 30,
        caution: 700,
        nb_chambres: 4,
        nb_salle_bain: 2,
        standing: 'confort',
        etage: '2',
        vue: 'ville',
        maxGuests: 7,
        maxAdults: 4,
        maxChildren: 3,
        pricingPeriods: pricingB,
        climatisation: true,
        terrasse: true,
      },
      {
        id: 'test_cov_bien_7',
        reference: 'TEST-COV-007',
        titre: 'Local commercial test autre',
        description: 'Local commercial climatise, terrasse, quartier central.',
        type: 'local_commercial',
        configuration: 'Open space',
        zone_id: 'z2',
        proprietaire_id: ownerA,
        prix_nuitee: 300,
        prix_semaine: 1800,
        avance: 20,
        caution: 400,
        nb_chambres: 1,
        nb_salle_bain: 1,
        standing: 'confort',
        etage: 'rdc',
        vue: 'ville',
        maxGuests: 4,
        maxAdults: 3,
        maxChildren: 1,
        climatisation: true,
        terrasse: true,
      },
      {
        id: 'test_cov_bien_8',
        reference: 'TEST-COV-008',
        titre: 'Appartement test variable interieure',
        description: 'Description neutre sans mot cle maritime.',
        type: 'appartement',
        configuration: 'S+1',
        zone_id: 'test_cov_zone_1',
        proprietaire_id: ownerA,
        prix_nuitee: 260,
        prix_semaine: 1600,
        avance: 25,
        caution: 500,
        nb_chambres: 1,
        nb_salle_bain: 1,
        standing: 'confort',
        etage: 'rdc',
        vue: 'ville',
        maxGuests: 3,
        maxAdults: 2,
        maxChildren: 1,
        confortInterieurs: ['Climatisation', 'Toutes les pieces climatisees'],
        climatisation: true,
        terrasse: false,
      },
      {
        id: 'test_cov_bien_9',
        reference: 'TEST-COV-009',
        titre: 'Villa test variable exterieure',
        description: 'Description neutre sans mot cle explicite.',
        type: 'villa_maison',
        configuration: 'S+2',
        zone_id: 'test_cov_zone_2',
        proprietaire_id: ownerB,
        prix_nuitee: 610,
        prix_semaine: 3900,
        avance: 30,
        caution: 950,
        nb_chambres: 2,
        nb_salle_bain: 2,
        standing: 'premium',
        etage: '1',
        vue: 'ville',
        maxGuests: 6,
        maxAdults: 4,
        maxChildren: 3,
        exterieurJardin: ['Jardin partage', 'Terrasse', 'Piscine partagee'],
        prochePlage: true,
        distancePlageM: 180,
        climatisation: false,
        terrasse: true,
      },
    ];

    for (const b of biens) {
      const cfg = seasonConfig({
        standing: b.standing,
        etage: b.etage,
        vue: b.vue,
        maxGuests: b.maxGuests,
        maxAdults: b.maxAdults,
        maxChildren: b.maxChildren,
        pricingPeriods: b.pricingPeriods || [],
        exterieurJardin: b.exterieurJardin || [],
        confortInterieurs: b.confortInterieurs || [],
        prochePlage: b.prochePlage || false,
        distancePlageM: b.distancePlageM ?? null,
        vueMer: b.vue === 'mer',
        servicesPayants: [
          { id: `svc_${b.id}_1`, categorie: 'Conciergerie', label: 'Check-in de nuit', prix: 40, type_tarification: 'fixe', enabled: true },
          { id: `svc_${b.id}_2`, categorie: 'Transport', label: 'Transfert aeroport', prix: 20, type_tarification: 'a_partir_de', enabled: true },
        ],
      });

      await conn.query(
        `INSERT INTO biens (
          id, reference, titre, description, type, nb_chambres, nb_salle_bain, prix_nuitee, prix_semaine, avance, caution,
          statut, visible_sur_site, is_featured, menage_en_cours, zone_id, proprietaire_id, date_ajout, created_at, updated_at, mode,
          configuration, ui_config_json, location_saisonniere_config_json, climatisation, terrasse, vue_mer, cuisine_equipee, place_parking
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          reference=VALUES(reference),
          titre=VALUES(titre),
          description=VALUES(description),
          type=VALUES(type),
          nb_chambres=VALUES(nb_chambres),
          nb_salle_bain=VALUES(nb_salle_bain),
          prix_nuitee=VALUES(prix_nuitee),
          prix_semaine=VALUES(prix_semaine),
          avance=VALUES(avance),
          caution=VALUES(caution),
          statut=VALUES(statut),
          visible_sur_site=VALUES(visible_sur_site),
          zone_id=VALUES(zone_id),
          proprietaire_id=VALUES(proprietaire_id),
          updated_at=VALUES(updated_at),
          mode=VALUES(mode),
          configuration=VALUES(configuration),
          location_saisonniere_config_json=VALUES(location_saisonniere_config_json),
          climatisation=VALUES(climatisation),
          terrasse=VALUES(terrasse),
          vue_mer=VALUES(vue_mer),
          cuisine_equipee=VALUES(cuisine_equipee),
          place_parking=VALUES(place_parking)`,
        [
          b.id, b.reference, b.titre, b.description, b.type, b.nb_chambres, b.nb_salle_bain, b.prix_nuitee, b.prix_semaine, b.avance, b.caution,
          'disponible', 1, 0, 0, b.zone_id, b.proprietaire_id, addDays(today, 0), createdAt, createdAt, 'location_saisonniere',
          b.configuration, null, JSON.stringify(cfg), b.climatisation ? 1 : 0, b.terrasse ? 1 : 0, b.vue === 'mer' ? 1 : 0, 1, 1,
        ]
      );
    }

    await conn.commit();
    console.log('Seed couverture filtres termine.');
    console.log(`Zones upsert: ${zones.length}`);
    console.log(`Biens upsert: ${biens.length}`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
})().catch((error) => {
  console.error('Erreur seed couverture filtres:', error.message);
  process.exit(1);
});
