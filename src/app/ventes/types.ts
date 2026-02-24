// Types pour la section ventes

export interface Image {
  url: string;
  alt: string;
}

// Caractéristiques générales
export interface CaracteristiquesGenerales {
  eau_puits: boolean;
  eau_sonede: boolean;
  electricite_steg: boolean;
}

// Tarification
export interface Tarification {
  prix_affiche: number;
  commission: number;
  prix_final: number;
  prix_au_m2?: number;
  mode_prix?: 'unique' | 'paliers'; // Pour lotissement
}

// Paiement
export interface Paiement {
  mode: 'comptant' | 'facilite';
  montant_total: number;
  promesse: number;
  reste: number;
}

// Base pour tous les biens
export interface BienBase {
  id: string;
  titre: string;
  reference: string;
  localisation: string;
  statut: 'disponible' | 'indisponible' | 'vendu';
  type: 'immeuble' | 'lotissement';
  images: Image[];
  caracteristiques_generales: CaracteristiquesGenerales;
  tarification: Tarification;
  paiement: Paiement;
  description?: string;
}

// Appartement dans un immeuble
export interface Appartement {
  id: string;
  reference: string;
  nombre_chambres: number;
  nombre_salles_bain: number;
  surface: number;
  configuration: string; // ex: "S+2", "S+3"
  etage?: number;
  images: Image[];
  statut: 'disponible' | 'vendu' | 'reserve';
  prix?: number;
}

// Garage dans un immeuble
export interface Garage {
  id: string;
  reference: string;
  surface: number;
  type: 'sous-sol' | 'exterieur';
  images: Image[];
  statut: 'disponible' | 'vendu' | 'reserve';
  prix?: number;
}

// Local commercial dans un immeuble
export interface LocalCommercial {
  id: string;
  reference: string;
  surface: number;
  facade: number; // en mètres
  hauteur_plafond: number; // en mètres
  activite_recommandee?: string;
  images: Image[];
  statut: 'disponible' | 'vendu' | 'reserve';
  prix?: number;
}

// Caractéristiques additionnelles immeuble
export interface CaracteristiquesImmeuble {
  vue_mer: boolean;
  proche_plage: boolean;
  ascenseur: boolean;
  parking_sous_sol: boolean;
  parking_exterieur: boolean;
  syndic: boolean;
}

// Immeuble
export interface Immeuble extends BienBase {
  type: 'immeuble';
  distance_plage?: number; // en mètres
  surface_terrain: number;
  surface_batie: number;
  nombre_niveaux: number;
  appartements: Appartement[];
  garages: Garage[];
  locaux_commerciaux: LocalCommercial[];
  caracteristiques: CaracteristiquesImmeuble;
}

// Terrain dans un lotissement
export interface Terrain {
  id: string;
  reference: string;
  facade: number; // en mètres
  surface: number;
  type_terrain: 'agricole' | 'habitation' | 'industriel' | 'loisir';
  zone?: string;
  distance_plage?: number; // en mètres
  constructible: boolean;
  terrain_angle: boolean;
  images: Image[];
  statut: 'disponible' | 'vendu' | 'reserve';
  prix?: number;
  prix_au_m2?: number;
}

// Lotissement
export interface Lotissement extends BienBase {
  type: 'lotissement';
  nombre_total_terrains: number;
  terrains: Terrain[];
}

// Union type pour tous les biens
export type Bien = Immeuble | Lotissement;
