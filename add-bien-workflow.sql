-- Workflow creation for biens: mode -> type -> caracteristiques

-- 1) Ensure mode and caution on biens
ALTER TABLE biens
  MODIFY COLUMN mode ENUM('vente','location_saisonniere','location_annuelle') NOT NULL;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS caution DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER avance;

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
  ('car21', 'Electricite STEG')
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
  ('ctx27', 'car21', 'vente', 'appartement')
ON DUPLICATE KEY UPDATE mode_bien = VALUES(mode_bien), type_bien = VALUES(type_bien);
