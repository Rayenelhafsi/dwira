START TRANSACTION;

INSERT INTO caracteristique_onglets (id, mode_bien, type_bien, nom, ordre, is_system)
VALUES
  ('ls_app_infos_generales', 'location_saisonniere', 'appartement', '1. Informations generales', 10, 1),
  ('ls_app_localisation', 'location_saisonniere', 'appartement', '2. Localisation & acces', 20, 1),
  ('ls_app_lits', 'location_saisonniere', 'appartement', '4. Lits & couchages', 40, 1),
  ('ls_app_confort', 'location_saisonniere', 'appartement', '6. Confort & equipements interieurs', 60, 1),
  ('ls_app_securite', 'location_saisonniere', 'appartement', '9. Securite & reglement', 90, 1),
  ('ls_app_conditions', 'location_saisonniere', 'appartement', '11. Conditions de reservation', 110, 1)
ON DUPLICATE KEY UPDATE
  nom = VALUES(nom),
  ordre = VALUES(ordre),
  is_system = VALUES(is_system);

DROP TEMPORARY TABLE IF EXISTS tmp_ls_app_features;
CREATE TEMPORARY TABLE tmp_ls_app_features (
  id VARCHAR(50) PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  onglet_id VARCHAR(50) NOT NULL,
  ordre INT NOT NULL DEFAULT 0,
  type_caracteristique ENUM('simple','choix_multiple','plusieurs_choix','valeur','texte') NOT NULL DEFAULT 'simple',
  choix_json LONGTEXT NULL,
  unite VARCHAR(50) NULL
) ENGINE=InnoDB;

INSERT INTO tmp_ls_app_features (id, nom, onglet_id, ordre, type_caracteristique, choix_json, unite)
VALUES
  ('lsapp_reference', 'Reference', 'ls_app_infos_generales', 1, 'simple', NULL, NULL),
  ('lsapp_titre_annonce', 'Titre annonce', 'ls_app_infos_generales', 2, 'simple', NULL, NULL),
  ('lsapp_type_logement', 'Type logement', 'ls_app_infos_generales', 3, 'simple', NULL, NULL),
  ('lsapp_categorie_standing', 'Categorie standing', 'ls_app_infos_generales', 4, 'choix_multiple', '["Economique","Confort","Premium","Luxe"]', NULL),
  ('lsapp_etage', 'Etage', 'ls_app_infos_generales', 5, 'choix_multiple', '["RDC","1","2","3","4","5+"]', NULL),
  ('lsapp_ascenseur', 'Ascenseur', 'ls_app_infos_generales', 6, 'choix_multiple', '["Oui","Non"]', NULL),
  ('lsapp_vue', 'Vue', 'ls_app_infos_generales', 7, 'choix_multiple', '["Vue mer","Vue jardin","Vue ville","Vue montagne","Sans vue particuliere"]', NULL),
  ('lsapp_niveau_sonore', 'Niveau sonore', 'ls_app_infos_generales', 8, 'choix_multiple', '["Tres calme","Calme","Moyen","Bruyant"]', NULL),
  ('lsapp_acces_general', 'Acces general', 'ls_app_infos_generales', 9, 'choix_multiple', '["Tres facile","Facile","Moyen","Difficile"]', NULL),

  ('lsapp_zone_quartier', 'Zone / Quartier', 'ls_app_localisation', 1, 'simple', NULL, NULL),
  ('lsapp_ville', 'Ville', 'ls_app_localisation', 2, 'simple', NULL, NULL),
  ('lsapp_gouvernerat', 'Gouvernerat', 'ls_app_localisation', 3, 'simple', NULL, NULL),
  ('lsapp_gps', 'Coordonnees GPS', 'ls_app_localisation', 4, 'simple', NULL, NULL),

  ('lsapp_matelas_supp_prix', 'Prix matelas supplementaire', 'ls_app_lits', 1, 'valeur', NULL, 'DT'),
  ('lsapp_matelas_supp_max', 'Maximum matelas supplementaires', 'ls_app_lits', 2, 'valeur', NULL, 'Unite'),

  ('lsapp_produits_accueil', 'Produits d accueil', 'ls_app_confort', 1, 'choix_multiple', '["Oui","Non"]', NULL),
  ('lsapp_frais_produits_accueil', 'Frais produits d accueil', 'ls_app_confort', 2, 'valeur', NULL, 'DT'),
  ('lsapp_services_payants', 'Services payants', 'ls_app_confort', 3, 'simple', NULL, NULL),

  ('lsapp_limite_personnes', 'Limite personnes (nuit)', 'ls_app_securite', 1, 'valeur', NULL, 'Personne'),
  ('lsapp_fumeurs', 'Fumeurs', 'ls_app_securite', 2, 'choix_multiple', '["Autorise","Interdit","Autorise sur balcon/terrasse"]', NULL),
  ('lsapp_alcool', 'Alcool', 'ls_app_securite', 3, 'choix_multiple', '["Autorise","Interdit"]', NULL),
  ('lsapp_animaux', 'Animaux', 'ls_app_securite', 4, 'choix_multiple', '["Autorises","Interdits","Autorises sous conditions"]', NULL),

  ('lsapp_duree_min', 'Duree min sejour (nuits)', 'ls_app_conditions', 1, 'valeur', NULL, 'Nuit'),
  ('lsapp_duree_max', 'Duree max sejour (nuits)', 'ls_app_conditions', 2, 'valeur', NULL, 'Nuit'),
  ('lsapp_politique_annulation', 'Politique annulation', 'ls_app_conditions', 3, 'choix_multiple', '["Flexible","Moderee","Stricte","Non remboursable"]', NULL),
  ('lsapp_depot_garantie', 'Depot de garantie', 'ls_app_conditions', 4, 'choix_multiple', '["Oui","Non"]', NULL),
  ('lsapp_montant_caution', 'Montant caution', 'ls_app_conditions', 5, 'valeur', NULL, 'DT'),
  ('lsapp_type_caution', 'Type caution', 'ls_app_conditions', 6, 'choix_multiple', '["Cash","Pre-autorisation","Virement","Aucune"]', NULL),
  ('lsapp_checkin_heure', 'Check-in heure', 'ls_app_conditions', 7, 'simple', NULL, NULL),
  ('lsapp_checkout_heure', 'Check-out heure', 'ls_app_conditions', 8, 'simple', NULL, NULL);

INSERT INTO caracteristiques (id, nom, type_caracteristique, choix_json, unite, visibilite_client)
SELECT t.id, t.nom, t.type_caracteristique, t.choix_json, t.unite, 1
FROM tmp_ls_app_features t
LEFT JOIN caracteristiques c
  ON LOWER(TRIM(c.nom)) = LOWER(TRIM(t.nom))
WHERE c.id IS NULL;

UPDATE caracteristiques c
INNER JOIN tmp_ls_app_features t
  ON LOWER(TRIM(c.nom)) = LOWER(TRIM(t.nom))
SET c.type_caracteristique = t.type_caracteristique,
    c.choix_json = t.choix_json,
    c.unite = t.unite,
    c.visibilite_client = 1;

INSERT INTO caracteristique_contextes (id, caracteristique_id, mode_bien, type_bien, onglet_id)
SELECT LEFT(CONCAT('ctx_ls_app_', c.id), 50), c.id, 'location_saisonniere', 'appartement', t.onglet_id
FROM tmp_ls_app_features t
INNER JOIN caracteristiques c
  ON LOWER(TRIM(c.nom)) = LOWER(TRIM(t.nom))
ON DUPLICATE KEY UPDATE
  onglet_id = VALUES(onglet_id),
  mode_bien = VALUES(mode_bien),
  type_bien = VALUES(type_bien);

INSERT INTO modifier_onglets (id, mode_bien, type_bien, onglet_id, caracteristique_id, ordre)
SELECT LEFT(CONCAT('mo_ls_app_', c.id), 50), 'location_saisonniere', 'appartement', t.onglet_id, c.id, t.ordre
FROM tmp_ls_app_features t
INNER JOIN caracteristiques c
  ON LOWER(TRIM(c.nom)) = LOWER(TRIM(t.nom))
ON DUPLICATE KEY UPDATE
  onglet_id = VALUES(onglet_id),
  ordre = VALUES(ordre);

DROP TEMPORARY TABLE IF EXISTS tmp_ls_app_features;

COMMIT;
