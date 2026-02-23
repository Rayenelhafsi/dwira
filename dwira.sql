-- MySQL dump 10.13  Distrib 9.6.0, for Win64 (x86_64)
--
-- Host: localhost    Database: dwira
-- ------------------------------------------------------
-- Server version	9.6.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `dwira`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `dwira` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `dwira`;

--
-- Table structure for table `administrateurs`
--

DROP TABLE IF EXISTS `administrateurs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `administrateurs` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mot_de_passe_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actif` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_admin_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `administrateurs`
--

LOCK TABLES `administrateurs` WRITE;
/*!40000 ALTER TABLE `administrateurs` DISABLE KEYS */;
INSERT INTO `administrateurs` VALUES ('a1','Admin Ghaith','admin@dwira.com','$2b$10$C333bRsFl3c2tW9ZZ4fAv.Gs0z.H8cNHFMjbFroElKFlL0kZ/xrIa',1,'2026-02-21 03:05:39','2026-02-21 03:53:46');
/*!40000 ALTER TABLE `administrateurs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bien_caracteristiques`
--

DROP TABLE IF EXISTS `bien_caracteristiques`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bien_caracteristiques` (
  `bien_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `caracteristique_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`bien_id`,`caracteristique_id`),
  KEY `idx_caracteristique_id` (`caracteristique_id`),
  CONSTRAINT `bien_caracteristiques_ibfk_1` FOREIGN KEY (`bien_id`) REFERENCES `biens` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bien_caracteristiques_ibfk_2` FOREIGN KEY (`caracteristique_id`) REFERENCES `caracteristiques` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bien_caracteristiques`
--

LOCK TABLES `bien_caracteristiques` WRITE;
/*!40000 ALTER TABLE `bien_caracteristiques` DISABLE KEYS */;
INSERT INTO `bien_caracteristiques` VALUES ('b1','car1'),('b1','car2'),('b4','car2'),('b1','car3'),('b2','car3'),('b3','car3'),('b2','car4'),('b1','car5'),('b1','car6'),('b2','car6'),('b3','car6');
/*!40000 ALTER TABLE `bien_caracteristiques` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biens`
--

DROP TABLE IF EXISTS `biens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biens` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `titre` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `type` enum('appartement','villa_maison','studio','immeuble','terrain','local_commercial','bungalow','S1','S2','S3','S4','villa','local') COLLATE utf8mb4_unicode_ci NOT NULL,
  `nb_chambres` int NOT NULL,
  `nb_salle_bain` int NOT NULL,
  `prix_nuitee` decimal(10,2) NOT NULL,
  `avance` decimal(10,2) NOT NULL,
  `statut` enum('disponible','loue','reserve','maintenance') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'disponible',
  `menage_en_cours` tinyint(1) NOT NULL DEFAULT '0',
  `zone_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proprietaire_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_ajout` date NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `mode` enum('vente','location_saisonniere','location_annuelle') COLLATE utf8mb4_unicode_ci NOT NULL,
  `tarification_methode` enum('avec_commission','sans_commission') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prix_affiche_client` decimal(12,2) DEFAULT NULL,
  `prix_fixe_proprietaire` decimal(12,2) DEFAULT NULL,
  `prix_final` decimal(12,2) DEFAULT NULL,
  `revenu_agence` decimal(12,2) DEFAULT NULL,
  `commission_pourcentage_proprietaire` decimal(5,2) DEFAULT NULL,
  `commission_pourcentage_client` decimal(5,2) DEFAULT NULL,
  `montant_max_reduction_negociation` decimal(12,2) DEFAULT NULL,
  `prix_minimum_accepte` decimal(12,2) DEFAULT NULL,
  `modalite_paiement_vente` enum('comptant','facilite') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pourcentage_premiere_partie_promesse` decimal(5,2) DEFAULT NULL,
  `montant_premiere_partie_promesse` decimal(12,2) DEFAULT NULL,
  `montant_deuxieme_partie` decimal(12,2) DEFAULT NULL,
  `nombre_tranches` int DEFAULT NULL,
  `periode_tranches_mois` int DEFAULT NULL,
  `montant_par_tranche` decimal(12,2) DEFAULT NULL,
  `type_rue` enum('piste','route_goudronnee','rue_residentielle') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type_papier` enum('titre_foncier_individuel','titre_foncier_collectif','contrat_seulement','sans_papier') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `superficie_m2` decimal(10,2) DEFAULT NULL,
  `etage` int DEFAULT NULL,
  `configuration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `annee_construction` int DEFAULT NULL,
  `distance_plage_m` int DEFAULT NULL,
  `proche_plage` tinyint(1) NOT NULL DEFAULT '0',
  `chauffage_central` tinyint(1) NOT NULL DEFAULT '0',
  `climatisation` tinyint(1) NOT NULL DEFAULT '0',
  `balcon` tinyint(1) NOT NULL DEFAULT '0',
  `terrasse` tinyint(1) NOT NULL DEFAULT '0',
  `ascenseur` tinyint(1) NOT NULL DEFAULT '0',
  `vue_mer` tinyint(1) NOT NULL DEFAULT '0',
  `gaz_ville` tinyint(1) NOT NULL DEFAULT '0',
  `cuisine_equipee` tinyint(1) NOT NULL DEFAULT '0',
  `place_parking` tinyint(1) NOT NULL DEFAULT '0',
  `syndic` tinyint(1) NOT NULL DEFAULT '0',
  `meuble` tinyint(1) NOT NULL DEFAULT '0',
  `independant` tinyint(1) NOT NULL DEFAULT '0',
  `eau_puits` tinyint(1) NOT NULL DEFAULT '0',
  `eau_sonede` tinyint(1) NOT NULL DEFAULT '0',
  `electricite_steg` tinyint(1) NOT NULL DEFAULT '0',
  `surface_local_m2` decimal(10,2) DEFAULT NULL,
  `facade_m` decimal(10,2) DEFAULT NULL,
  `hauteur_plafond_m` decimal(10,2) DEFAULT NULL,
  `activite_recommandee` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `toilette` tinyint NOT NULL DEFAULT '0',
  `reserve_local` tinyint NOT NULL DEFAULT '0',
  `vitrine` tinyint NOT NULL DEFAULT '0',
  `coin_angle` tinyint NOT NULL DEFAULT '0',
  `electricite_3_phases` tinyint NOT NULL DEFAULT '0',
  `alarme` tinyint NOT NULL DEFAULT '0',
  `type_terrain` enum('agricole','habitation','industrielle','loisir') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `terrain_facade_m` decimal(10,2) DEFAULT NULL,
  `terrain_surface_m2` decimal(10,2) DEFAULT NULL,
  `terrain_distance_plage_m` int DEFAULT NULL,
  `terrain_zone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `terrain_constructible` tinyint NOT NULL DEFAULT '0',
  `terrain_angle` tinyint NOT NULL DEFAULT '0',
  `immeuble_details_json` longtext COLLATE utf8mb4_unicode_ci,
  `immeuble_appartements_json` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference` (`reference`),
  KEY `idx_proprietaire_id` (`proprietaire_id`),
  KEY `idx_zone_id` (`zone_id`),
  KEY `idx_statut` (`statut`),
  KEY `idx_type` (`type`),
  KEY `idx_type_transaction` (`mode`),
  KEY `idx_biens_mode_type` (`mode`,`type`),
  CONSTRAINT `biens_ibfk_1` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`) ON DELETE SET NULL,
  CONSTRAINT `biens_ibfk_2` FOREIGN KEY (`proprietaire_id`) REFERENCES `proprietaires` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biens`
--

LOCK TABLES `biens` WRITE;
/*!40000 ALTER TABLE `biens` DISABLE KEYS */;
INSERT INTO `biens` VALUES ('b1','REF-001','Villa de Luxe avec Piscine mmmm','Magnifique villa moderne à 5min de la plage avec piscine privée','villa',4,3,450.00,200.00,'disponible',0,'z2','p1','2023-05-10','2026-02-20 00:10:21','2026-02-21 00:00:00','location_saisonniere',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,NULL,NULL,NULL,NULL,0,0,0,0,0,0,NULL,NULL,NULL,NULL,NULL,0,0,NULL,NULL),('b2','REF-002','Appartement S+2 Vue Mer','Vue imprenable sur la Méditerranée','S2',2,1,120.00,50.00,'loue',0,'z2','p2','2023-04-15','2026-02-20 00:10:21','2026-02-20 00:10:21','location_annuelle',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,NULL,NULL,NULL,NULL,0,0,0,0,0,0,NULL,NULL,NULL,NULL,NULL,0,0,NULL,NULL),('b3','REF-003','Studio Centre Ville','Idéal étudiant ou jeune couple','studio',1,1,60.00,30.00,'disponible',1,'z1','p3','2023-06-20','2026-02-20 00:10:21','2026-02-20 00:10:21','location_saisonniere',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,NULL,NULL,NULL,NULL,0,0,0,0,0,0,NULL,NULL,NULL,NULL,NULL,0,0,NULL,NULL),('b4','REF-004','Local Commercial','Grand local sur rue passante','local',0,1,250.00,500.00,'maintenance',0,'z1','p3','2023-01-10','2026-02-20 00:10:21','2026-02-20 00:10:21','vente',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,NULL,NULL,NULL,NULL,0,0,0,0,0,0,NULL,NULL,NULL,NULL,NULL,0,0,NULL,NULL);
/*!40000 ALTER TABLE `biens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caracteristique_contextes`
--

DROP TABLE IF EXISTS `caracteristique_contextes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `caracteristique_contextes` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `caracteristique_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mode_bien` enum('vente','location_annuelle','location_saisonniere') COLLATE utf8mb4_unicode_ci NOT NULL,
  `type_bien` enum('appartement','villa_maison','studio','immeuble','terrain','local_commercial','bungalow') COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_car_context` (`caracteristique_id`,`mode_bien`,`type_bien`),
  KEY `idx_mode_type` (`mode_bien`,`type_bien`),
  CONSTRAINT `caracteristique_contextes_ibfk_1` FOREIGN KEY (`caracteristique_id`) REFERENCES `caracteristiques` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caracteristique_contextes`
--

LOCK TABLES `caracteristique_contextes` WRITE;
/*!40000 ALTER TABLE `caracteristique_contextes` DISABLE KEYS */;
INSERT INTO `caracteristique_contextes` VALUES ('ctx16','car10','vente','appartement'),('ctx17','car11','vente','appartement'),('ctx52','car11','vente','immeuble'),('ctx18','car12','vente','appartement'),('ctx19','car13','vente','appartement'),('ctx20','car14','vente','appartement'),('ctx28','car14','vente','local_commercial'),('ctx21','car15','vente','appartement'),('ctx22','car16','vente','appartement'),('ctx50','car16','vente','immeuble'),('ctx23','car17','vente','appartement'),('ctx24','car18','vente','appartement'),('ctx25','car19','vente','appartement'),('ctx53','car19','vente','immeuble'),('ctx40','car19','vente','terrain'),('ctx29','car19','vente','local_commercial'),('ctx26','car20','vente','appartement'),('ctx54','car20','vente','immeuble'),('ctx41','car20','vente','terrain'),('ctx30','car20','vente','local_commercial'),('ctx27','car21','vente','appartement'),('ctx55','car21','vente','immeuble'),('ctx42','car21','vente','terrain'),('ctx31','car21','vente','local_commercial'),('ctx32','car22','vente','local_commercial'),('ctx33','car23','vente','local_commercial'),('ctx34','car24','vente','local_commercial'),('ctx35','car25','vente','local_commercial'),('ctx36','car26','vente','local_commercial'),('ctx37','car27','vente','local_commercial'),('ctx38','car28','vente','terrain'),('ctx39','car29','vente','terrain'),('ctx13','car3','vente','appartement'),('ctx43','car30','vente','terrain'),('ctx44','car31','vente','terrain'),('ctx45','car32','vente','terrain'),('ctx46','car33','vente','terrain'),('ctx48','car34','vente','immeuble'),('ctx49','car35','vente','immeuble'),('ctx14','car4','vente','appartement'),('ctx51','car4','vente','immeuble'),('ctx47','car7','vente','immeuble'),('ctx15','car9','vente','appartement');
/*!40000 ALTER TABLE `caracteristique_contextes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caracteristiques`
--

DROP TABLE IF EXISTS `caracteristiques`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `caracteristiques` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nom` (`nom`),
  KEY `idx_nom` (`nom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caracteristiques`
--

LOCK TABLES `caracteristiques` WRITE;
/*!40000 ALTER TABLE `caracteristiques` DISABLE KEYS */;
INSERT INTO `caracteristiques` VALUES ('car27','Alarme'),('car13','Balcon'),('car12','Chauffage central'),('car3','Climatisation'),('car25','Coin d angle'),('car28','Constructible'),('car9','Cuisine equipee'),('car19','Eau puits'),('car20','Eau Sonede'),('car26','Electricite 3 phases'),('car21','Electricite STEG'),('car2','Garage'),('car14','Gaz de ville'),('car7','Immeuble'),('car18','Independant'),('car5','Jardin'),('car17','Meuble'),('car35','Parking extérieur'),('car34','Parking sous-sol'),('car1','Piscine'),('car15','Place parking'),('car11','Proche de la plage'),('car23','Reserve'),('car16','Syndic'),('car30','Terrain agricole'),('car29','Terrain d angle'),('car31','Terrain habitation'),('car32','Terrain industrielle'),('car33','Terrain loisir'),('car10','Terrasse'),('car22','Toilette'),('car24','Vitrine'),('car4','Vue sur mer'),('car6','Wifi');
/*!40000 ALTER TABLE `caracteristiques` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contrats`
--

DROP TABLE IF EXISTS `contrats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contrats` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bien_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locataire_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date_debut` date NOT NULL,
  `date_fin` date NOT NULL,
  `montant_recu` decimal(10,2) NOT NULL,
  `url_pdf` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `statut` enum('actif','termine','resilie') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'actif',
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bien_id` (`bien_id`),
  KEY `idx_locataire_id` (`locataire_id`),
  KEY `idx_statut` (`statut`),
  KEY `idx_date_debut` (`date_debut`),
  KEY `idx_date_fin` (`date_fin`),
  CONSTRAINT `contrats_ibfk_1` FOREIGN KEY (`bien_id`) REFERENCES `biens` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contrats_ibfk_2` FOREIGN KEY (`locataire_id`) REFERENCES `locataires` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contrats`
--

LOCK TABLES `contrats` WRITE;
/*!40000 ALTER TABLE `contrats` DISABLE KEYS */;
INSERT INTO `contrats` VALUES ('c_test_1','b1','l2','2025-01-10','2025-06-30',3500.00,'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf','termine','2025-01-09 00:00:00'),('c_test_2','b3','l3','2026-01-01','2026-12-31',1200.00,'https://www.africau.edu/images/default/sample.pdf','actif','2025-12-20 00:00:00'),('c1','b2','l1','2023-05-01','2024-04-30',2400.00,'https://example.com/test.pdf','actif','2026-02-20 00:10:21');
/*!40000 ALTER TABLE `contrats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `locataires`
--

DROP TABLE IF EXISTS `locataires`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `locataires` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telephone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cin` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `score_fiabilite` int NOT NULL DEFAULT '5',
  `created_at` date NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `cin` (`cin`),
  KEY `idx_email` (`email`),
  KEY `idx_cin` (`cin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `locataires`
--

LOCK TABLES `locataires` WRITE;
/*!40000 ALTER TABLE `locataires` DISABLE KEYS */;
INSERT INTO `locataires` VALUES ('l1','Sami Tounsi','20 111 222','sami@gmail.com','05555555',9,'2023-03-10'),('l2','Amel Karoui','50 333 444','amel@yahoo.com','06666666',7,'2023-04-05'),('l3','Jean Dupont','98 777 888','jean@france.fr','P1234567',10,'2023-06-01');
/*!40000 ALTER TABLE `locataires` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `maintenance`
--

DROP TABLE IF EXISTS `maintenance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bien_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `cout` decimal(10,2) NOT NULL,
  `statut` enum('en_cours','termine','annule') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en_cours',
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bien_id` (`bien_id`),
  KEY `idx_statut` (`statut`),
  CONSTRAINT `maintenance_ibfk_1` FOREIGN KEY (`bien_id`) REFERENCES `biens` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `maintenance`
--

LOCK TABLES `maintenance` WRITE;
/*!40000 ALTER TABLE `maintenance` DISABLE KEYS */;
INSERT INTO `maintenance` VALUES ('maint1','b4','Peinture façade et réparation porte',1500.00,'en_cours','2023-07-01 00:00:00');
/*!40000 ALTER TABLE `maintenance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `media`
--

DROP TABLE IF EXISTS `media`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `media` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bien_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('image','video') COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_bien_id` (`bien_id`),
  CONSTRAINT `media_ibfk_1` FOREIGN KEY (`bien_id`) REFERENCES `biens` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `media`
--

LOCK TABLES `media` WRITE;
/*!40000 ALTER TABLE `media` DISABLE KEYS */;
INSERT INTO `media` VALUES ('m10','b4','image','https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800',0),('m11','b4','image','https://images.unsplash.com/photo-1497366811353-6870744d04b2?q=80&w=800',1),('m1771632778262','b1','image','https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?q=80&w=800',0),('m1771632778273','b1','image','https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=800',0),('m1771632778284','b1','image','https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=800',0),('m1771632778298','b1','image','https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=800',0),('m5','b2','image','https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=800',0),('m6','b2','image','https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?q=80&w=800',1),('m7','b2','image','https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?q=80&w=800',2),('m8','b3','image','https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=800',0),('m9','b3','image','https://images.unsplash.com/photo-1536376072261-38c75010e6c9?q=80&w=800',1);
/*!40000 ALTER TABLE `media` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `utilisateur_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('info','warning','success','error') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `lu` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_utilisateur_id` (`utilisateur_id`),
  KEY `idx_lu` (`lu`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`utilisateur_id`) REFERENCES `utilisateurs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES ('n1','1','info','Nouveau contrat signé pour REF-002',0,'2023-07-05 10:30:00'),('n2','1','warning','Retard de paiement pour contrat C1',0,'2023-07-06 09:15:00');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `paiements`
--

DROP TABLE IF EXISTS `paiements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `paiements` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contrat_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `montant` decimal(10,2) NOT NULL,
  `date_paiement` date NOT NULL,
  `statut` enum('paye','en_attente','retard') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en_attente',
  `methode` enum('virement','especes','cheque') COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_contrat_id` (`contrat_id`),
  KEY `idx_date_paiement` (`date_paiement`),
  CONSTRAINT `paiements_ibfk_1` FOREIGN KEY (`contrat_id`) REFERENCES `contrats` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `paiements`
--

LOCK TABLES `paiements` WRITE;
/*!40000 ALTER TABLE `paiements` DISABLE KEYS */;
INSERT INTO `paiements` VALUES ('pay1','c1',1200.00,'2023-05-01','paye','virement'),('pay2','c1',1200.00,'2023-06-01','paye','virement'),('pay3','c1',1200.00,'2023-07-01','en_attente','virement');
/*!40000 ALTER TABLE `paiements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `proprietaires`
--

DROP TABLE IF EXISTS `proprietaires`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proprietaires` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telephone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cin` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `cin` (`cin`),
  KEY `idx_email` (`email`),
  KEY `idx_cin` (`cin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `proprietaires`
--

LOCK TABLES `proprietaires` WRITE;
/*!40000 ALTER TABLE `proprietaires` DISABLE KEYS */;
INSERT INTO `proprietaires` VALUES ('p1','Ahmed Ben Ali','+216 55 123 456','ahmed@gmail.com','09876543'),('p1771706586306','Rayen Elhafsi','24879087','elhafsirayen@gmail.com','14449155'),('p2','Fatma Zahra','+216 22 987 654','fatma@yahoo.fr','01234567'),('p3','Société Immobilière du Cap','+216 71 111 222','contact@sicap.tn','12345678');
/*!40000 ALTER TABLE `proprietaires` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `unavailable_dates`
--

DROP TABLE IF EXISTS `unavailable_dates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `unavailable_dates` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bien_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` enum('blocked','pending','booked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'blocked',
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_deadline` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bien_id` (`bien_id`),
  KEY `idx_start_date` (`start_date`),
  KEY `idx_end_date` (`end_date`),
  CONSTRAINT `unavailable_dates_ibfk_1` FOREIGN KEY (`bien_id`) REFERENCES `biens` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `unavailable_dates`
--

LOCK TABLES `unavailable_dates` WRITE;
/*!40000 ALTER TABLE `unavailable_dates` DISABLE KEYS */;
INSERT INTO `unavailable_dates` VALUES ('ud1','b1','2024-12-20','2024-12-31','booked','#ef4444',NULL),('ud2','b1','2025-01-05','2025-01-10','pending','#f97316','2025-01-03'),('ud3','b1','2025-02-01','2025-02-07','blocked','#111827',NULL);
/*!40000 ALTER TABLE `unavailable_dates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `utilisateurs`
--

DROP TABLE IF EXISTS `utilisateurs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `utilisateurs` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','user') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` date NOT NULL,
  `auth_provider` enum('local','google','facebook') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'local',
  `provider_user_id` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `uq_provider_user` (`auth_provider`,`provider_user_id`),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `utilisateurs`
--

LOCK TABLES `utilisateurs` WRITE;
/*!40000 ALTER TABLE `utilisateurs` DISABLE KEYS */;
INSERT INTO `utilisateurs` VALUES ('1','Admin Ghaith','admin@dwira.com','admin',NULL,'2023-01-01','local',NULL,NULL),('2','Agent Immo','agent@dwira.com','user',NULL,'2023-02-15','local',NULL,NULL),('u1771688126490','Rayen Elhafsi','elhafsirayen@gmail.com','user','https://lh3.googleusercontent.com/a/ACg8ocLPlbhWWpu3CkKpERCS5BUcwe_9Jo2adup4V1rhOX6QTVKwunFD=s96-c','2026-02-21','google','101326635551288512024','2026-02-21 15:43:35');
/*!40000 ALTER TABLE `utilisateurs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `zones`
--

DROP TABLE IF EXISTS `zones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `zones` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `google_maps_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_nom` (`nom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `zones`
--

LOCK TABLES `zones` WRITE;
/*!40000 ALTER TABLE `zones` DISABLE KEYS */;
INSERT INTO `zones` VALUES ('z1','Kélibia Centre','Zone urbaine dynamique',NULL),('z2','El Mansoura','Zone touristique balnéaire',NULL),('z3','Petit Paris','Quartier résidentiel calme',NULL);
/*!40000 ALTER TABLE `zones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'dwira'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-22 17:40:58
