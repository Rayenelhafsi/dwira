const mysql = require('mysql2/promise');

function nowSql(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function dateOnly(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

    const [[adminUser]] = await conn.query('SELECT id, nom FROM utilisateurs ORDER BY created_at ASC LIMIT 1');
    if (!adminUser) throw new Error('Aucun utilisateur trouvé dans utilisateurs');

    const [zones] = await conn.query('SELECT id, nom FROM zones ORDER BY id ASC');
    const [owners] = await conn.query('SELECT id, nom, telephone FROM proprietaires ORDER BY id ASC');
    if (!zones.length) throw new Error('Aucune zone trouvée');
    if (!owners.length) throw new Error('Aucun propriétaire trouvé');

    const zoneA = zones[0].id;
    const zoneB = zones[Math.min(1, zones.length - 1)].id;
    const ownerA = owners[0].id;
    const ownerB = owners[Math.min(1, owners.length - 1)].id;

    await conn.query("DELETE FROM reservation_demands WHERE id LIKE 'test_seed_rd_%'");
    await conn.query("DELETE FROM notifications WHERE id LIKE 'test_seed_notif_%'");
    await conn.query("DELETE FROM biens WHERE id LIKE 'test_seed_bien_%'");

    const createdAt = nowSql();

    const baseSeasonConfig = {
      categorie_standing: 'haut_standing',
      etage: 'rdc',
      ascenseur: false,
      vue: 'vue_mer',
      niveau_sonore: 'calme',
      acces_general: 'facile',
      limite_personnes_nuit: 8,
      max_adultes: 5,
      max_enfants: 4,
      duree_min_sejour_nuits: 2,
      duree_max_sejour_nuits: 30,
      politique_annulation: 'moderee',
      depot_garantie: true,
      montant_caution: 1000,
      type_caution: 'especes',
      checkin_heure: '14:00',
      checkout_heure: '11:00',
      fumeurs: 'interdit',
      alcool: 'autorise',
      fetes: 'interdit',
      animaux: 'interdits',
      heures_silence_heure: '01:00',
      visiteurs: 'autorise',
      produits_accueil_gratuits: false,
      frais_produits_accueil: 30,
      matelas_supplementaire_prix: 25,
      matelas_supplementaires_max: 2,
      avance_pourcentage: 30,
      frais_menage_disponible: true,
      frais_menage: 80,
      frais_service_disponible: true,
      frais_service: 50,
      services_payants: [
        { id: 'svc_test_1', categorie: 'Conciergerie', label: 'Check-in de nuit', prix: 40, type_tarification: 'fixe' },
        { id: 'svc_test_2', categorie: 'Transport', label: 'Transfert aeroport', prix: 0, type_tarification: 'sur_demande' },
      ],
      pricing_periods: [
        { id: 'pp_test_1', start: dateOnly(3), end: dateOnly(17), prix_nuitee: 900, prix_semaine: 5600 },
        { id: 'pp_test_2', start: dateOnly(18), end: dateOnly(35), prix_nuitee: 780, prix_semaine: 5000 },
      ],
      exterieur_jardin: ['Piscine', 'Gazon', 'Jardin partagé', 'Terrasse', 'Pergola'],
      cuisine_repas: ['Cuisine équipée', 'Machine café'],
      confort_equipements_interieurs: ['Climatisation', 'WiFi', 'TV'],
      securite_reglement: ['Interphone', 'Caméras extérieures'],
      accessibilite: ['RDC'],
    };

    const biens = [
      {
        id: 'test_seed_bien_1',
        reference: 'TEST-SEED-001',
        titre: 'TEST Villa S+3 Vue mer',
        type: 'villa_maison',
        zone_id: zoneA,
        proprietaire_id: ownerA,
        prix_nuitee: 800,
        prix_semaine: 5300,
        avance: 30,
        caution: 1000,
        nb_chambres: 3,
        nb_salle_bain: 2,
        climatisation: 1,
        terrasse: 1,
        vue_mer: 1,
        cuisine_equipee: 1,
        place_parking: 1,
      },
      {
        id: 'test_seed_bien_2',
        reference: 'TEST-SEED-002',
        titre: 'TEST Appartement S+2 Centre',
        type: 'appartement',
        zone_id: zoneB,
        proprietaire_id: ownerB,
        prix_nuitee: 350,
        prix_semaine: 2200,
        avance: 30,
        caution: 600,
        nb_chambres: 2,
        nb_salle_bain: 1,
        climatisation: 1,
        terrasse: 0,
        vue_mer: 0,
        cuisine_equipee: 1,
        place_parking: 0,
      },
      {
        id: 'test_seed_bien_3',
        reference: 'TEST-SEED-003',
        titre: 'TEST Studio RDC',
        type: 'studio',
        zone_id: zoneA,
        proprietaire_id: ownerA,
        prix_nuitee: 180,
        prix_semaine: 1100,
        avance: 25,
        caution: 300,
        nb_chambres: 1,
        nb_salle_bain: 1,
        climatisation: 1,
        terrasse: 0,
        vue_mer: 0,
        cuisine_equipee: 1,
        place_parking: 0,
      },
    ];

    for (const b of biens) {
      const cfg = {
        ...baseSeasonConfig,
        limite_personnes_nuit: b.id === 'test_seed_bien_3' ? 3 : 8,
        max_adultes: b.id === 'test_seed_bien_3' ? 2 : 5,
        max_enfants: b.id === 'test_seed_bien_3' ? 1 : 4,
      };

      await conn.query(
        `INSERT INTO biens (
          id, reference, titre, description, type, nb_chambres, nb_salle_bain, prix_nuitee, prix_semaine, avance, caution,
          statut, visible_sur_site, is_featured, menage_en_cours, zone_id, proprietaire_id, date_ajout, created_at, updated_at,
          mode, ui_config_json, location_saisonniere_config_json,
          climatisation, terrasse, vue_mer, cuisine_equipee, place_parking
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          b.id,
          b.reference,
          b.titre,
          'Bien de test injecte pour validation UI/variables',
          b.type,
          b.nb_chambres,
          b.nb_salle_bain,
          b.prix_nuitee,
          b.prix_semaine,
          b.avance,
          b.caution,
          'disponible',
          1,
          0,
          0,
          b.zone_id,
          b.proprietaire_id,
          dateOnly(0),
          createdAt,
          createdAt,
          'location_saisonniere',
          null,
          JSON.stringify(cfg),
          b.climatisation,
          b.terrasse,
          b.vue_mer,
          b.cuisine_equipee,
          b.place_parking,
        ]
      );
    }

    const demands = [
      { id: 'test_seed_rd_1', bien_id: 'test_seed_bien_1', proprietaire_id: ownerA, status: 'en_attente_reponse_proprietaire', start: dateOnly(7), end: dateOnly(14), guests: 6, adults: 4, children: 2, total: 5600, dueNow: 1680, mode: 'avance' },
      { id: 'test_seed_rd_2', bien_id: 'test_seed_bien_2', proprietaire_id: ownerB, status: 'reponse_positive_attente_confirmation_client', start: dateOnly(10), end: dateOnly(17), guests: 4, adults: 2, children: 2, total: 2200, dueNow: 660, mode: 'avance' },
      { id: 'test_seed_rd_3', bien_id: 'test_seed_bien_1', proprietaire_id: ownerA, status: 'demande_recu_paiement', start: dateOnly(18), end: dateOnly(25), guests: 8, adults: 5, children: 3, total: 5000, dueNow: 5000, mode: 'totalite' },
      { id: 'test_seed_rd_4', bien_id: 'test_seed_bien_3', proprietaire_id: ownerA, status: 'recu_paiement_envoye', start: dateOnly(3), end: dateOnly(6), guests: 2, adults: 2, children: 0, total: 540, dueNow: 540, mode: 'totalite' },
    ];

    for (const d of demands) {
      await conn.query(
        `INSERT INTO reservation_demands (
          id, bien_id, request_type, client_email, client_name, proprietaire_id, start_date, end_date,
          guests, adult_guests, child_guests, payment_mode, total_amount, amount_due_now,
          selected_fixed_services_json, selected_variable_services_json,
          status, owner_notified_at, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          d.id,
          d.bien_id,
          'reservation',
          `${d.id}@example.com`,
          `Client ${d.id}`,
          d.proprietaire_id,
          d.start,
          d.end,
          d.guests,
          d.adults,
          d.children,
          d.mode,
          d.total,
          d.dueNow,
          JSON.stringify([]),
          JSON.stringify([]),
          d.status,
          createdAt,
          createdAt,
          createdAt,
        ]
      );
    }

    const notifications = [
      { id: 'test_seed_notif_1', type: 'info', msg: 'Test: nouvelle demande de reservation injectee (attente proprietaire).' },
      { id: 'test_seed_notif_2', type: 'warning', msg: 'Test: demande en attente confirmation client.' },
      { id: 'test_seed_notif_3', type: 'success', msg: 'Test: recu de paiement envoye par le client.' },
    ];

    for (const n of notifications) {
      await conn.query(
        'INSERT INTO notifications (id, utilisateur_id, type, message, lu, created_at) VALUES (?,?,?,?,?,?)',
        [n.id, adminUser.id, n.type, n.msg, 0, createdAt]
      );
    }

    await conn.commit();

    const [[countBiens]] = await conn.query("SELECT COUNT(*) AS c FROM biens WHERE id LIKE 'test_seed_bien_%'");
    const [[countDemands]] = await conn.query("SELECT COUNT(*) AS c FROM reservation_demands WHERE id LIKE 'test_seed_rd_%'");
    const [[countNotif]] = await conn.query("SELECT COUNT(*) AS c FROM notifications WHERE id LIKE 'test_seed_notif_%'");

    console.log('Seed termine.');
    console.log('Biens test:', countBiens.c);
    console.log('Demandes test:', countDemands.c);
    console.log('Notifications test:', countNotif.c);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error('Erreur seed:', e.message);
  process.exit(1);
});

