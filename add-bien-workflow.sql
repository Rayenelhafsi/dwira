-- Workflow creation for biens: mode -> type -> caracteristiques

-- 1) Ensure mode and caution on biens
ALTER TABLE biens
  MODIFY COLUMN mode ENUM('vente','location_saisonniere','location_annuelle') NOT NULL;

ALTER TABLE biens
  ADD COLUMN IF NOT EXISTS caution DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER avance;

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
