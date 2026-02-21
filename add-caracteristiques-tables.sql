-- Caracteristiques master table
CREATE TABLE IF NOT EXISTS caracteristiques (
    id VARCHAR(50) PRIMARY KEY,
    nom VARCHAR(100) NOT NULL UNIQUE,
    INDEX idx_nom (nom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Many-to-many link between biens and caracteristiques
CREATE TABLE IF NOT EXISTS bien_caracteristiques (
    bien_id VARCHAR(50) NOT NULL,
    caracteristique_id VARCHAR(50) NOT NULL,
    PRIMARY KEY (bien_id, caracteristique_id),
    FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE CASCADE,
    FOREIGN KEY (caracteristique_id) REFERENCES caracteristiques(id) ON DELETE CASCADE,
    INDEX idx_caracteristique_id (caracteristique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed common caracteristiques
INSERT INTO caracteristiques (id, nom) VALUES
('car1', 'Piscine'),
('car2', 'Garage'),
('car3', 'Climatisation'),
('car4', 'Vue sur mer'),
('car5', 'Jardin'),
('car6', 'Wifi')
ON DUPLICATE KEY UPDATE nom = VALUES(nom);
