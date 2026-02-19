export type UserRole = 'admin' | 'user';

export interface Utilisateur {
  id: string;
  nom: string;
  email: string;
  role: UserRole;
  avatar?: string;
  created_at: string;
}

export interface Zone {
  id: string;
  nom: string;
  description: string;
}

export interface Proprietaire {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  cin: string;
}

export type BienType = 'S1' | 'S2' | 'S3' | 'villa' | 'studio' | 'local';
export type ModeLocation = 'annuelle' | 'saisonniere';
export type BienStatut = 'disponible' | 'loue' | 'reserve' | 'maintenance';

export interface DateStatus {
  start: string;
  end: string;
  status: 'blocked' | 'pending' | 'booked';
  color?: string;
  paymentDeadline?: string;
}

export interface Bien {
  id: string;
  reference: string;
  titre: string;
  description?: string;
  type: BienType;
  surface: number;
  nb_chambres: number;
  nb_salle_bain: number;
  meuble: boolean;
  prix_loyer: number;
  charges: number;
  caution: number;
  mode_location: ModeLocation;
  statut: BienStatut;
  zone_id: string;
  proprietaire_id: string;
  date_ajout: string;
  created_at: string;
  updated_at: string;
  // Additional fields for frontend display
  media?: Media[];
  unavailableDates?: DateStatus[];
}

export interface Media {
  id: string;
  bien_id: string;
  type: 'image' | 'video';
  url: string;
}

export interface Locataire {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  cin: string;
  score_fiabilite: number; // 1-10
  created_at: string;
}

export type ContratStatut = 'actif' | 'termine' | 'resilie';

export interface Contrat {
  id: string;
  bien_id: string;
  locataire_id: string;
  date_debut: string;
  date_fin: string;
  depot_garantie: number;
  statut: ContratStatut;
  created_at: string;
}

export type PaiementStatut = 'paye' | 'en_attente' | 'retard';
export type PaiementMethode = 'virement' | 'especes' | 'cheque';

export interface Paiement {
  id: string;
  contrat_id: string;
  montant: number;
  date_paiement: string;
  statut: PaiementStatut;
  methode: PaiementMethode;
}

export type MaintenanceStatut = 'en_cours' | 'termine' | 'annule';

export interface Maintenance {
  id: string;
  bien_id: string;
  description: string;
  cout: number;
  statut: MaintenanceStatut;
  created_at: string;
}

export interface Notification {
  id: string;
  utilisateur_id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  lu: boolean;
  created_at: string;
}
