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
  google_maps_url?: string;
}

export interface Proprietaire {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  cin: string;
}

export type BienMode = 'vente' | 'location_annuelle' | 'location_saisonniere';
export type BienType =
  | 'appartement'
  | 'villa_maison'
  | 'studio'
  | 'immeuble'
  | 'terrain'
  | 'local_commercial'
  | 'bungalow'
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'villa'
  | 'local';
export type BienStatut = 'disponible' | 'loue' | 'reserve' | 'maintenance' | 'bloque';
export type TypeRueAppartementVente = 'piste' | 'route_goudronnee' | 'rue_residentielle';
export type TypePapierAppartementVente =
  | 'titre_foncier_individuel'
  | 'titre_foncier_collectif'
  | 'contrat_seulement'
  | 'sans_papier';
export type TypeTerrainVente = 'agricole' | 'habitation' | 'industrielle' | 'loisir';
export type TarificationMethodeVente = 'avec_commission' | 'sans_commission';
export type ModalitePaiementVente = 'comptant' | 'facilite';

export interface DateStatus {
  start: string;
  end: string;
  status: 'blocked' | 'pending' | 'booked';
  color?: string;
  paymentDeadline?: string;
}

export interface ImmeubleAppartementDetail {
  index: number;
  chambres: number;
  salle_bain: number;
  superficie_m2?: number | null;
  configuration?: string | null;
}

export interface Bien {
  id: string;
  reference: string;
  titre: string;
  description?: string;
  mode: BienMode;
  type: BienType;
  surface?: number;
  nb_chambres: number;
  nb_salle_bain: number;
  prix_nuitee: number;
  tarification_methode?: TarificationMethodeVente | null;
  prix_affiche_client?: number | null;
  prix_fixe_proprietaire?: number | null;
  prix_final?: number | null;
  revenu_agence?: number | null;
  commission_pourcentage_proprietaire?: number | null;
  commission_pourcentage_client?: number | null;
  montant_max_reduction_negociation?: number | null;
  prix_minimum_accepte?: number | null;
  modalite_paiement_vente?: ModalitePaiementVente | null;
  pourcentage_premiere_partie_promesse?: number | null;
  montant_premiere_partie_promesse?: number | null;
  montant_deuxieme_partie?: number | null;
  nombre_tranches?: number | null;
  periode_tranches_mois?: number | null;
  montant_par_tranche?: number | null;
  avance: number;
  caution: number;
  type_rue?: TypeRueAppartementVente | null;
  type_papier?: TypePapierAppartementVente | null;
  superficie_m2?: number | null;
  etage?: number | null;
  configuration?: string | null;
  annee_construction?: number | null;
  distance_plage_m?: number | null;
  proche_plage?: boolean;
  chauffage_central?: boolean;
  climatisation?: boolean;
  balcon?: boolean;
  terrasse?: boolean;
  ascenseur?: boolean;
  vue_mer?: boolean;
  gaz_ville?: boolean;
  cuisine_equipee?: boolean;
  place_parking?: boolean;
  syndic?: boolean;
  meuble?: boolean;
  independant?: boolean;
  eau_puits?: boolean;
  eau_sonede?: boolean;
  electricite_steg?: boolean;
  surface_local_m2?: number | null;
  facade_m?: number | null;
  hauteur_plafond_m?: number | null;
  activite_recommandee?: string | null;
  toilette?: boolean;
  reserve_local?: boolean;
  vitrine?: boolean;
  coin_angle?: boolean;
  electricite_3_phases?: boolean;
  alarme?: boolean;
  type_terrain?: TypeTerrainVente | null;
  terrain_facade_m?: number | null;
  terrain_surface_m2?: number | null;
  terrain_distance_plage_m?: number | null;
  terrain_zone?: string | null;
  terrain_constructible?: boolean;
  terrain_angle?: boolean;
  immeuble_surface_terrain_m2?: number | null;
  immeuble_surface_batie_m2?: number | null;
  immeuble_nb_niveaux?: number | null;
  immeuble_nb_garages?: number | null;
  immeuble_nb_appartements?: number | null;
  immeuble_nb_locaux_commerciaux?: number | null;
  immeuble_distance_plage_m?: number | null;
  immeuble_proche_plage?: boolean;
  immeuble_ascenseur?: boolean;
  immeuble_parking_sous_sol?: boolean;
  immeuble_parking_exterieur?: boolean;
  immeuble_syndic?: boolean;
  immeuble_vue_mer?: boolean;
  immeuble_appartements?: ImmeubleAppartementDetail[];
  charges?: number;
  statut: BienStatut;
  menage_en_cours: boolean;
  zone_id?: string;
  proprietaire_id?: string;
  date_ajout: string;
  created_at: string;
  updated_at: string;
  media?: Media[];
  unavailableDates?: DateStatus[];
  caracteristiques?: string[];
  caracteristique_ids?: string[];
}

export interface Caracteristique {
  id: string;
  nom: string;
}

export interface Media {
  id: string;
  bien_id: string;
  type: 'image' | 'video';
  url: string;
  position?: number;
  motif_upload?: string | null;
}

export interface Locataire {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  cin: string;
  score_fiabilite: number;
  created_at: string;
}

export type ContratStatut = 'actif' | 'termine' | 'resilie';

export interface Contrat {
  id: string;
  bien_id: string;
  locataire_id: string;
  date_debut: string;
  date_fin: string;
  montant_recu: number;
  url_pdf?: string;
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
