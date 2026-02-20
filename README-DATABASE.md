# Dwira - Configuration de la Base de Données MySQL

Ce guide explique comment configurer la base de données MySQL pour le projet Dwira.

## Prérequis

- MySQL Server installé sur votre machine
- Node.js et npm installés

## Étapes d'installation

### 1. Créer la base de données

Exécutez le script SQL pour créer toutes les tables et insérer les données示例:

```
bash
mysql -u root -p < database.sql
```

Ou via MySQL Workbench:
1. Ouvrez MySQL Workbench
2. Connectez-vous à votre serveur MySQL
3. File > Open SQL Script > Sélectionnez `database.sql`
4. Executez le script

### 2. Configurer les variables d'environnement

Copiez le fichier `.env.example` vers `.env` et modifiez les valeurs:

```
env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=votre_mot_de_passe
DB_NAME=dwira
```

### 3. Installer les dépendances

```
bash
npm install
```

### 4. Démarrer l'application

```
bash
npm run dev
```

## Structure des tables

Voici la liste des tables créées:

| Table | Description |
|-------|-------------|
| `utilisateurs` | Administrateurs et agents |
| `zones` | Zones géographiques (Kélibia Centre, El Mansoura, etc.) |
| `proprietaires` | Propriétaires des biens |
| `biens` | Biens immobiliers (appartements, villas, studios, etc.) |
| `media` | Images et vidéos des biens |
| `locataires` | Locataires/Tenants |
| `contrats` | Contrats de location |
| `paiements` | Paiements liés aux contrats |
| `maintenance` | Demandes de maintenance |
| `notifications` | Notifications système |
| `unavailable_dates` | Calendrier de disponibilité des biens |

## Utilisation des services CRUD

### Exemple: Récupérer tous les biens

```
typescript
import { getAllBiens } from './app/services/biens';

const biens = await getAllBiens();
console.log(biens);
```

### Exemple: Créer un nouveau bien

```typescript
import { createBien } from './app/services/biens';

await createBien({
  id: 'b5',
  reference: 'REF-005',
  titre: 'Nouvel Appartement',
  type: 'S2',
  nb_chambres: 2,
  nb_salle_bain: 1,
  prix_nuitee: 150,
  avance: 75,
  statut: 'disponible',
  menage_en_cours: false,
  zone_id: 'z1',
  proprietaire_id: 'p1',
  date_ajout: '2024-01-01',
  created_at: '2024-01-01',
  updated_at: '2024-01-01'
});
```

### Exemple: Authentifier un utilisateur

```
typescript
import { authenticateUser } from './app/services/utilisateurs';

const user = await authenticateUser('admin@dwira.com');
if (user && user.role === 'admin') {
  // Accès administrateur
}
```

## Services disponibles

Tous les services CRUD sont exportés depuis `src/app/services/index.ts`:

- `utilisateurs.ts` - Gestion des utilisateurs
- `zones.ts` - Gestion des zones
- `proprietaires.ts` - Gestion des propriétaires
- `biens.ts` - Gestion des biens immobiliers
- `locataires.ts` - Gestion des locataires
- `contrats.ts` - Gestion des contrats
- `paiements.ts` - Gestion des paiements
- `maintenance.ts` - Gestion de la maintenance
- `notifications.ts` - Gestion des notifications
- `unavailable_dates.ts` - Gestion des dates indisponibles

## Données de test

Le script `database.sql` contient des données示例 pour tester l'application:

- 2 utilisateurs (admin et agent)
- 3 zones
- 3 propriétaires
- 4 biens
- 3 locataires
- 1 contrat
- 3 paiements
- 1 demande de maintenance
- 2 notifications
- 3 périodes indisponibles
