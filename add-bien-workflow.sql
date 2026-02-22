-- Workflow creation for biens: mode -> type -> caracteristiques

-- 1) Ensure mode and caution on biens
ALTER TABLE biens
  MODIFY COLUMN mode ENUM('vente','location_saisonniere','location_annuelle') NOT NULL;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS caution DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER avance;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS tarification_methode ENUM('avec_commission','sans_commission') NULL DEFAULT NULL AFTER caution,
  ADD COLUMN IF NOT EXISTS prix_affiche_client DECIMAL(12,2) NULL DEFAULT NULL AFTER tarification_methode,
  ADD COLUMN IF NOT EXISTS prix_fixe_proprietaire DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_affiche_client,
  ADD COLUMN IF NOT EXISTS prix_final DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_fixe_proprietaire,
  ADD COLUMN IF NOT EXISTS revenu_agence DECIMAL(12,2) NULL DEFAULT NULL AFTER prix_final,
  ADD COLUMN IF NOT EXISTS commission_pourcentage_proprietaire DECIMAL(5,2) NULL DEFAULT NULL AFTER revenu_agence,
  ADD COLUMN IF NOT EXISTS commission_pourcentage_client DECIMAL(5,2) NULL DEFAULT NULL AFTER commission_pourcentage_proprietaire,
  ADD COLUMN IF NOT EXISTS montant_max_reduction_negociation DECIMAL(12,2) NULL DEFAULT NULL AFTER commission_pourcentage_client,
  ADD COLUMN IF NOT EXISTS prix_minimum_accepte DECIMAL(12,2) NULL DEFAULT NULL AFTER montant_max_reduction_negociation,
  ADD COLUMN IF NOT EXISTS modalite_paiement_vente ENUM('comptant','facilite') NULL DEFAULT NULL AFTER prix_minimum_accepte,
  ADD COLUMN IF NOT EXISTS pourcentage_premiere_partie_promesse DECIMAL(5,2) NULL DEFAULT NULL AFTER modalite_paiement_vente,
  ADD COLUMN IF NOT EXISTS montant_premiere_partie_promesse DECIMAL(12,2) NULL DEFAULT NULL AFTER pourcentage_premiere_partie_promesse,
  ADD COLUMN IF NOT EXISTS montant_deuxieme_partie DECIMAL(12,2) NULL DEFAULT NULL AFTER montant_premiere_partie_promesse,
  ADD COLUMN IF NOT EXISTS nombre_tranches INT NULL DEFAULT NULL AFTER montant_deuxieme_partie,
  ADD COLUMN IF NOT EXISTS periode_tranches_mois INT NULL DEFAULT NULL AFTER nombre_tranches,
  ADD COLUMN IF NOT EXISTS montant_par_tranche DECIMAL(12,2) NULL DEFAULT NULL AFTER periode_tranches_mois;

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS motif_upload VARCHAR(255) NULL DEFAULT NULL AFTER url;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS type_rue ENUM('piste','route_goudronnee','rue_residentielle') NULL DEFAULT NULL AFTER caution;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS type_papier ENUM('titre_foncier_individuel','titre_foncier_collectif','contrat_seulement','sans_papier') NULL DEFAULT NULL AFTER type_rue;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS superficie_m2 DECIMAL(10,2) NULL DEFAULT NULL AFTER type_papier,
  ADD COLUMN IF NOT EXISTS etage INT NULL DEFAULT NULL AFTER superficie_m2,
  ADD COLUMN IF NOT EXISTS configuration VARCHAR(50) NULL DEFAULT NULL AFTER etage,
  ADD COLUMN IF NOT EXISTS annee_construction INT NULL DEFAULT NULL AFTER configuration,
  ADD COLUMN IF NOT EXISTS distance_plage_m INT NULL DEFAULT NULL AFTER annee_construction,
  ADD COLUMN IF NOT EXISTS proche_plage TINYINT(1) NOT NULL DEFAULT 0 AFTER distance_plage_m,
  ADD COLUMN IF NOT EXISTS chauffage_central TINYINT(1) NOT NULL DEFAULT 0 AFTER proche_plage,
  ADD COLUMN IF NOT EXISTS climatisation TINYINT(1) NOT NULL DEFAULT 0 AFTER chauffage_central,
  ADD COLUMN IF NOT EXISTS balcon TINYINT(1) NOT NULL DEFAULT 0 AFTER climatisation,
  ADD COLUMN IF NOT EXISTS terrasse TINYINT(1) NOT NULL DEFAULT 0 AFTER balcon,
  ADD COLUMN IF NOT EXISTS ascenseur TINYINT(1) NOT NULL DEFAULT 0 AFTER terrasse,
  ADD COLUMN IF NOT EXISTS vue_mer TINYINT(1) NOT NULL DEFAULT 0 AFTER ascenseur,
  ADD COLUMN IF NOT EXISTS gaz_ville TINYINT(1) NOT NULL DEFAULT 0 AFTER vue_mer,
  ADD COLUMN IF NOT EXISTS cuisine_equipee TINYINT(1) NOT NULL DEFAULT 0 AFTER gaz_ville,
  ADD COLUMN IF NOT EXISTS place_parking TINYINT(1) NOT NULL DEFAULT 0 AFTER cuisine_equipee,
  ADD COLUMN IF NOT EXISTS syndic TINYINT(1) NOT NULL DEFAULT 0 AFTER place_parking,
  ADD COLUMN IF NOT EXISTS meuble TINYINT(1) NOT NULL DEFAULT 0 AFTER syndic,
  ADD COLUMN IF NOT EXISTS independant TINYINT(1) NOT NULL DEFAULT 0 AFTER meuble,
  ADD COLUMN IF NOT EXISTS eau_puits TINYINT(1) NOT NULL DEFAULT 0 AFTER independant,
  ADD COLUMN IF NOT EXISTS eau_sonede TINYINT(1) NOT NULL DEFAULT 0 AFTER eau_puits,
  ADD COLUMN IF NOT EXISTS electricite_steg TINYINT(1) NOT NULL DEFAULT 0 AFTER eau_sonede;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS surface_local_m2 DECIMAL(10,2) NULL DEFAULT NULL AFTER electricite_steg,
  ADD COLUMN IF NOT EXISTS facade_m DECIMAL(10,2) NULL DEFAULT NULL AFTER surface_local_m2,
  ADD COLUMN IF NOT EXISTS hauteur_plafond_m DECIMAL(10,2) NULL DEFAULT NULL AFTER facade_m,
  ADD COLUMN IF NOT EXISTS activite_recommandee VARCHAR(255) NULL DEFAULT NULL AFTER hauteur_plafond_m,
  ADD COLUMN IF NOT EXISTS toilette TINYINT(1) NOT NULL DEFAULT 0 AFTER activite_recommandee,
  ADD COLUMN IF NOT EXISTS reserve_local TINYINT(1) NOT NULL DEFAULT 0 AFTER toilette,
  ADD COLUMN IF NOT EXISTS vitrine TINYINT(1) NOT NULL DEFAULT 0 AFTER reserve_local,
  ADD COLUMN IF NOT EXISTS coin_angle TINYINT(1) NOT NULL DEFAULT 0 AFTER vitrine,
  ADD COLUMN IF NOT EXISTS electricite_3_phases TINYINT(1) NOT NULL DEFAULT 0 AFTER coin_angle,
  ADD COLUMN IF NOT EXISTS alarme TINYINT(1) NOT NULL DEFAULT 0 AFTER electricite_3_phases;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS type_terrain ENUM('agricole','habitation','industrielle','loisir') NULL DEFAULT NULL AFTER alarme,
  ADD COLUMN IF NOT EXISTS terrain_facade_m DECIMAL(10,2) NULL DEFAULT NULL AFTER type_terrain,
  ADD COLUMN IF NOT EXISTS terrain_surface_m2 DECIMAL(10,2) NULL DEFAULT NULL AFTER terrain_facade_m,
  ADD COLUMN IF NOT EXISTS terrain_distance_plage_m INT NULL DEFAULT NULL AFTER terrain_surface_m2,
  ADD COLUMN IF NOT EXISTS terrain_zone VARCHAR(255) NULL DEFAULT NULL AFTER terrain_distance_plage_m,
  ADD COLUMN IF NOT EXISTS terrain_constructible TINYINT(1) NOT NULL DEFAULT 0 AFTER terrain_zone,
  ADD COLUMN IF NOT EXISTS terrain_angle TINYINT(1) NOT NULL DEFAULT 0 AFTER terrain_constructible;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS immeuble_details_json LONGTEXT NULL AFTER terrain_angle,
  ADD COLUMN IF NOT EXISTS immeuble_appartements_json LONGTEXT NULL AFTER immeuble_details_json;

ALTER TABLE biens
  MODIFY COLUMN type ENUM(
    'appartement','villa_maison','studio','immeuble','terrain','local_commercial','bungalow',
    'S1','S2','S3','S4','villa','local'
  ) NOT NULL;

CREATE INDEX idx_biens_mode_type ON biens (mode, type);

-- 2) Caracteristiques base tables
CREATE TABLE IF NOT EXISTS caracteristiques (
  id VARCHAR(50) PRIMARY KEY,
  nom VARCHAR(100) NOT NULL UNIQUE,
  INDEX idx_nom (nom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bien_caracteristiques (
  bien_id VARCHAR(50) NOT NULL,
  caracteristique_id VARCHAR(50) NOT NULL,
  PRIMARY KEY (bien_id, caracteristique_id),
  FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE CASCADE,
  FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE,
  INDEX idx_caracteristique_id (caracteristique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Link caracteristiques to mode + type
CREATE TABLE IF NOT EXISTS caracteristique_contextes (
  id VARCHAR(50) PRIMARY KEY,
  caracteristique_id VARCHAR(50) NOT NULL,
  mode_bien ENUM('vente','location_annuelle','location_saisonniere') NOT NULL,
  type_bien ENUM('appartement','villa_maison','studio','immeuble','terrain','local_commercial','bungalow') NOT NULL,
  UNIQUE KEY uq_car_context (caracteristique_id, mode_bien, type_bien),
  INDEX idx_mode_type (mode_bien, type_bien),
  FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Seeds: caracteristiques Appartement Vente (sans doublons avec les details)
INSERT INTO caracteristiques (id, nom) VALUES
  ('car3', 'Climatisation'),
  ('car4', 'Vue sur mer'),
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
ON DUPLICATE KEY UPDATE nom = VALUES(nom);

INSERT INTO caracteristique_contextes (id, caracteristique_id, mode_bien, type_bien) VALUES
  ('ctx13', 'car3', 'vente', 'appartement'),
  ('ctx14', 'car4', 'vente', 'appartement'),
  ('ctx15', 'car9', 'vente', 'appartement'),
  ('ctx16', 'car10', 'vente', 'appartement'),
  ('ctx17', 'car11', 'vente', 'appartement'),
  ('ctx18', 'car12', 'vente', 'appartement'),
  ('ctx19', 'car13', 'vente', 'appartement'),
  ('ctx20', 'car14', 'vente', 'appartement'),
  ('ctx21', 'car15', 'vente', 'appartement'),
  ('ctx22', 'car16', 'vente', 'appartement'),
  ('ctx23', 'car17', 'vente', 'appartement'),
  ('ctx24', 'car18', 'vente', 'appartement'),
  ('ctx25', 'car19', 'vente', 'appartement'),
  ('ctx26', 'car20', 'vente', 'appartement'),
  ('ctx27', 'car21', 'vente', 'appartement'),
  ('ctx28', 'car14', 'vente', 'local_commercial'),
  ('ctx29', 'car19', 'vente', 'local_commercial'),
  ('ctx30', 'car20', 'vente', 'local_commercial'),
  ('ctx31', 'car21', 'vente', 'local_commercial'),
  ('ctx32', 'car22', 'vente', 'local_commercial'),
  ('ctx33', 'car23', 'vente', 'local_commercial'),
  ('ctx34', 'car24', 'vente', 'local_commercial'),
  ('ctx35', 'car25', 'vente', 'local_commercial'),
  ('ctx36', 'car26', 'vente', 'local_commercial'),
  ('ctx37', 'car27', 'vente', 'local_commercial'),
  ('ctx38', 'car28', 'vente', 'terrain'),
  ('ctx39', 'car29', 'vente', 'terrain'),
  ('ctx40', 'car19', 'vente', 'terrain'),
  ('ctx41', 'car20', 'vente', 'terrain'),
  ('ctx42', 'car21', 'vente', 'terrain'),
  ('ctx43', 'car30', 'vente', 'terrain'),
  ('ctx44', 'car31', 'vente', 'terrain'),
  ('ctx45', 'car32', 'vente', 'terrain'),
  ('ctx46', 'car33', 'vente', 'terrain'),
  ('ctx47', 'car7', 'vente', 'immeuble'),
  ('ctx48', 'car34', 'vente', 'immeuble'),
  ('ctx49', 'car35', 'vente', 'immeuble'),
  ('ctx50', 'car16', 'vente', 'immeuble'),
  ('ctx51', 'car4', 'vente', 'immeuble'),
  ('ctx52', 'car11', 'vente', 'immeuble'),
  ('ctx53', 'car19', 'vente', 'immeuble'),
  ('ctx54', 'car20', 'vente', 'immeuble'),
  ('ctx55', 'car21', 'vente', 'immeuble')
ON DUPLICATE KEY UPDATE mode_bien = VALUES(mode_bien), type_bien = VALUES(type_bien);
