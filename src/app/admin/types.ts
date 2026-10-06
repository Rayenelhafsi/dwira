export type UserRole = 'admin' | 'user';

export interface Utilisateur {
  id: string;
  nom: string;
  email: string;
  role: UserRole;
  avatar?: string;
  client_type?: 'proprietaire' | 'locataire' | 'acheteur' | 'agent_amicale' | 'agence_partenaire' | null;
  telephone?: string | null;
  cin?: string | null;
  cin_image_url?: string | null;
  cin_image_recto_url?: string | null;
  cin_image_verso_url?: string | null;
  auth_provider?: 'local' | 'google' | 'facebook' | 'apple' | 'phone' | 'email' | 'passkey';
  provider_user_id?: string | null;
  last_login_at?: string | null;
  profile_completed_at?: string | null;
  updated_at?: string | null;
  created_at: string;
}

export type ClienteleGlobalStatus = 'prospect' | 'actif' | 'inactif' | 'blackliste';
export type CanalEntree = 'facebook' | 'site_web' | 'whatsapp' | 'visite_agence' | 'recommandation' | 'google' | 'autre';
export type ClienteleLocataireStatus = 'prospect' | 'verification' | 'actif' | 'incident' | 'archive' | 'blackliste';
export type ClienteleAcheteurStatus = 'lead_brut' | 'qualifie' | 'recherche' | 'visite_planifiee' | 'offre_en_cours' | 'compromis_signe' | 'vendu' | 'perdu';
export type ClienteleProprietaireStatus = 'prospect' | 'mandat_location' | 'mandat_vente' | 'actif' | 'inactif' | 'blackliste';
export type ClientelePenaltyMode = 'jour' | 'mois';
export type ClienteleAcheteurNextAction = 'rappeler' | 'envoyer_offres' | 'programmer_visite';
export type ClienteleMandatType = 'gestion_locative' | 'vente';
export type ClienteleReversementFrequence = 'mensuel' | 'trimestriel';
export type ClienteleProprietaireModePaiement = 'virement' | 'especes' | 'cheque';

export interface ClienteleProfile {
  id: string;
  sourceTable: 'utilisateurs' | 'locataires' | 'proprietaires';
  sourceId: string;
  linkedUserId?: string | null;
  email?: string;
  globalStatus: ClienteleGlobalStatus;
  scoreOverride?: number | null;
  canalEntree?: CanalEntree | null;
  lastInteractionAt?: string | null;
  lastInteractionNote?: string;
  activeRoles: Array<'locataire' | 'acheteur' | 'proprietaire'>;
  vip: boolean;
  blacklistReason?: string;
  locataireStatus?: ClienteleLocataireStatus | null;
  locCinValidee?: boolean;
  locContratSigne?: boolean;
  locDepotEncaisse?: boolean;
  locJustificatifRevenus?: boolean;
  locAttestationTravail?: boolean;
  locNbPersonnes?: number | null;
  locJourEcheance?: number | null;
  locPenaliteMode?: ClientelePenaltyMode | null;
  locPenaliteValeur?: number | null;
  saisonMinNuits?: number | null;
  saisonMaxNuits?: number | null;
  saisonCapaciteMax?: number | null;
  saisonJoursArrivee?: string[];
  saisonJoursDepart?: string[];
  saisonAcomptePourcentage?: number | null;
  saisonDocumentsRecus?: boolean;
  saisonDepotBloque?: boolean;
  saisonDepotRetenuMontant?: number | null;
  saisonDepotRetenuMotif?: string;
  acheteurStatus?: ClienteleAcheteurStatus | null;
  acheteurZones?: string[];
  acheteurTypes?: string[];
  acheteurBudgetMin?: number | null;
  acheteurBudgetMax?: number | null;
  acheteurSurfaceMin?: number | null;
  acheteurDistancePlageMax?: number | null;
  acheteurFinancementMode?: string;
  acheteurNextAction?: ClienteleAcheteurNextAction | null;
  acheteurActionDueAt?: string | null;
  proprietaireStatus?: ClienteleProprietaireStatus | null;
  proprietaireMandatType?: ClienteleMandatType | null;
  proprietaireMandatStart?: string | null;
  proprietaireMandatEnd?: string | null;
  proprietaireReversementFrequence?: ClienteleReversementFrequence | null;
  proprietaireModePaiement?: ClienteleProprietaireModePaiement | null;
  proprietaireCommissionPercent?: number | null;
  proprietairePlafondTravaux?: number | null;
  proprietaireLastStatementAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Zone {
  id: string;
  nom: string;
  description: string;
  pays?: string | null;
  gouvernerat?: string | null;
  region?: string | null;
  quartier?: string | null;
  google_maps_url?: string;
  image_url?: string | null;
  pays_image_url?: string | null;
  gouvernerat_image_url?: string | null;
  region_image_url?: string | null;
  quartier_image_url?: string | null;
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
  | 'residence'
  | 'villa_maison'
  | 'studio'
  | 'immeuble'
  | 'terrain'
  | 'lotissement'
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
export type ModeAffichagePrixTerrain = 'total_uniquement' | 'm2_uniquement' | 'total_et_m2';
export type ModePrixLotissement = 'm2_unique' | 'paliers';
export type TarificationMethodeVente = 'avec_commission' | 'sans_commission';
export type ModalitePaiementVente = 'comptant' | 'facilite';
export type AppartementVenteStanding = 'standard' | 'bon_standing' | 'haut_standing';
export type AppartementVenteOrientation = 'nord' | 'sud' | 'est' | 'ouest' | 'nord_est' | 'nord_ouest' | 'sud_est' | 'sud_ouest';
export type AppartementVenteEtat = 'neuf' | 'recent' | 'a_renover';
export type AppartementVenteVue = 'mer' | 'degagee' | 'jardin' | 'piscine' | 'ville' | 'sans_vue';
export type TerrainTopographie = 'plat' | 'en_pente';
export type TerrainVoisinage = 'residentiel_calme' | 'touristique_anime' | 'agricole';
export type TerrainNiveauSonore = 'faible' | 'moyen' | 'eleve';
export type TerrainViabilisationOnas = 'disponible' | 'en_facade' | 'non_disponible';
export type TerrainViabilisationSteg = 'disponible' | 'a_proximite' | 'transformateur_proche' | 'non_disponible';
export type TerrainTypeSol = 'sablonneux' | 'rocheux' | 'terre_agricole';

export interface DateStatus {
  id?: string;
  start: string;
  end: string;
  status: 'blocked' | 'pending' | 'booked';
  color?: string;
  paymentDeadline?: string;
  reservationDemandId?: string | null;
  sync_source?: string | null;
  sync_uid?: string | null;
}

export interface SeasonalPricingPeriod {
  id?: string;
  start: string;
  end: string;
  prix_nuitee: number;
  prix_semaine?: number | null;
  minimum_nuitees?: number | null;
  checkin_jour?: 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche' | null;
  checkout_jour?: 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche' | null;
  scope?: 'global' | 'amicales' | 'amicale';
  amicale_id?: string | null;
}

export interface ImmeubleAppartementDetail {
  index: number;
  reference?: string | null;
  modele?: string | null;
  type_unite?: 'appartement' | 'local_commercial' | 'bureau' | null;
  etage?: string | number | null;
  chambres: number;
  salle_bain: number;
  superficie_m2?: number | null;
  configuration?: string | null;
  prix?: number | null;
  prix_negociable?: boolean;
  statut?: string | null;
  suite_parentale?: boolean;
  balcon?: boolean;
  terrasse?: boolean;
  orientation?: string | null;
  vue?: string | null;
  climatisation?: boolean;
  chauffage_central?: boolean;
  cuisine_equipee?: boolean;
  parking?: boolean;
  garage?: boolean;
  titre_foncier_individuel?: boolean;
  etat_bien?: string | null;
}

export interface ImmeubleUnitModel {
  id?: string;
  label?: string;
  quantity?: number;
  type_unite?: 'appartement' | 'local_commercial' | 'bureau' | null;
  configuration?: string | null;
  superficie_m2?: number | null;
  chambres?: number | null;
  salle_bain?: number | null;
  prix?: number | null;
  balcon?: boolean;
  chauffage_central?: boolean;
  climatisation?: boolean;
  cuisine_equipee?: boolean;
}

export interface ImmeubleGarageDetail {
  index: number;
  reference?: string | null;
  modele?: string | null;
}

export interface ImmeubleLocalCommercialDetail {
  index: number;
  reference?: string | null;
}

export interface ResidenceApartmentTemplate {
  name?: string;
  reference?: string | null;
  nom_bien_mobile?: string | null;
  description?: string;
  proprietaire_id?: string | null;
  unavailable_dates?: DateStatus[];
}

export interface ResidenceUnitTemplate {
  id: string;
  main_type?: 'appartement' | 'villa_maison';
  shared_title?: string;
  sub_type: string;
  quantity: number;
  apartment_names?: string[];
  apartment_references?: string[];
  apartments?: ResidenceApartmentTemplate[];
  template_bien?: Partial<Bien>;
  template_media?: Media[];
  pricing_periods?: SeasonalPricingPeriod[];
  feature_ids?: string[];
  feature_values?: Record<string, string | string[]>;
}

export interface LotissementTerrainDetail {
  index: number;
  reference?: string | null;
  modele?: string | null;
  type_terrain?: TypeTerrainVente | null;
  surface_m2?: number | null;
  facade_m?: number | null;
  profondeur_m?: number | null;
  nb_facades?: number | null;
  orientation?: string | null;
  position?: string | null;
  prix_m2?: number | null;
  prix_total?: number | null;
  statut?: string | null;
  type_rue?: TypeRueAppartementVente | null;
  type_papier?: TypePapierAppartementVente | null;
  terrain_zone?: string | null;
  terrain_distance_plage_m?: number | null;
  terrain_constructible?: boolean;
  terrain_angle?: boolean;
}

export interface LotissementLotModel {
  id?: string;
  label?: string;
  quantity?: number;
  type_terrain?: TypeTerrainVente | null;
  surface_m2?: number | null;
  facade_m?: number | null;
  profondeur_m?: number | null;
  nb_facades?: number | null;
  prix_m2?: number | null;
  prix_total?: number | null;
  type_rue?: TypeRueAppartementVente | null;
  type_papier?: TypePapierAppartementVente | null;
}

export interface LotissementPalierPrix {
  min_m2: number;
  max_m2?: number | null;
  prix_m2: number;
}

export interface VenteAppartementDetails {
  proximite_plage?: boolean;
  proximite_centre?: boolean;
  proximite_ecoles?: boolean;
  proximite_commerces?: boolean;
  residence?: boolean;
  residence_gardee?: boolean;
  copropriete?: boolean;
  titre_foncier_individuel?: boolean;
  etat_bien?: AppartementVenteEtat | null;
  standing?: AppartementVenteStanding | null;
  orientation?: AppartementVenteOrientation | null;
  vue?: AppartementVenteVue | null;
  garage?: boolean;
  abri_voiture?: boolean;
  suite_parentale?: boolean;
  jardin_rdc?: boolean;
  piscine_individuelle?: boolean;
  piscine_commune?: boolean;
  frais_syndic_tnd?: number | null;
  disponibilite_immediate?: boolean;
}

export interface VenteMaisonDetails {
  surface_terrain_m2?: number | null;
  surface_batie_m2?: number | null;
  facade_m?: number | null;
  nb_niveaux?: number | null;
  rdc?: boolean;
  independant?: boolean;
  titre_foncier_individuel?: boolean;
  etat_bien?: AppartementVenteEtat | null;
  standing?: AppartementVenteStanding | null;
  orientation?: AppartementVenteOrientation | null;
  vue?: AppartementVenteVue | null;
  garage?: boolean;
  abri_voiture?: boolean;
  jardin?: boolean;
  piscine_individuelle?: boolean;
  piscine_commune?: boolean;
  suite_parentale?: boolean;
  disponibilite_immediate?: boolean;
}

export interface BienUiConfig {
  show_gallery?: boolean;
  show_informations_generales?: boolean;
  show_caracteristiques?: boolean;
  show_tarification_publique?: boolean;
  show_modalites_paiement?: boolean;
  show_localisation?: boolean;
  show_disponibilites?: boolean;
  show_booking_card?: boolean;
  show_immeuble_appartements?: boolean;
  show_immeuble_garages?: boolean;
  show_immeuble_locaux_commerciaux?: boolean;
  show_lotissement_terrains?: boolean;
  terrain_tabs?: Record<string, boolean>;
}

export type CategorieStanding = 'economique' | 'confort' | 'premium' | 'luxe';
export type EtageAppartement = 'rdc' | '1' | '2' | '3' | '4' | '5_plus';
export type VueAppartement = 'mer' | 'jardin' | 'ville' | 'montagne' | 'sans_vue';
export type NiveauSonoreAppartement = 'tres_calme' | 'calme' | 'moyen' | 'bruyant';
export type AccesGeneralAppartement = 'tres_facile' | 'facile' | 'moyen' | 'difficile';
export type PolitiqueAnnulation = 'flexible' | 'moderee' | 'stricte' | 'non_remboursable';
export type TypeCaution = 'cash' | 'preautorisation' | 'virement' | 'aucune';
export type RegleFumeurs = 'autorise' | 'interdit' | 'balcon_terrasse';
export type RegleAnimaux = 'autorises' | 'interdits' | 'sous_conditions';
export type ServicePayantTarification = 'fixe' | 'sur_demande' | 'a_partir_de';

export type ServicePayantBien = {
  id: string;
  categorie?: string;
  label: string;
  description_courte?: string;
  prix_affiche?: string;
  prix: number;
  type_tarification?: ServicePayantTarification;
  enabled: boolean;
};
export type VenteFlashConfig = {
  id: string;
  active?: boolean;
  title?: string | null;
  mode?: 'pourcentage' | 'montant_tnd' | null;
  discount_percent?: number | null;
  fixed_amount_tnd?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  minimum_nuitees?: number | null;
  expiration_hours?: number | null;
  created_at?: string | null;
  expires_at?: string | null;
};
export type LocationSaisonniereConfig = {
  categorie_standing?: CategorieStanding | null;
  etage?: EtageAppartement | null;
  ascenseur?: boolean;
  vue?: VueAppartement | null;
  niveau_sonore?: NiveauSonoreAppartement | null;
  acces_general?: AccesGeneralAppartement | null;
  limite_personnes_nuit?: number | null;
  max_adultes?: number | null;
  max_enfants?: number | null;
  duree_min_sejour_nuits?: number | null;
  duree_max_sejour_nuits?: number | null;
  politique_annulation?: PolitiqueAnnulation | null;
  depot_garantie?: boolean;
  montant_caution?: number | null;
  type_caution?: TypeCaution | null;
  checkin_heure?: string | null;
  checkout_heure?: string | null;
  fumeurs?: RegleFumeurs | null;
  alcool?: 'autorise' | 'interdit' | null;
  fetes?: 'autorise' | 'interdit' | null;
  heures_silence?: string | null;
  animaux?: RegleAnimaux | null;
  produits_accueil_gratuits?: boolean;
  frais_produits_accueil?: number | null;
  matelas_supplementaire_prix?: number | null;
  matelas_supplementaires_max?: number | null;
  avance_pourcentage?: number | null;
  reservation_instantanee?: boolean;
  vente_flash_active?: boolean;
  vente_flash_titre?: string | null;
  vente_flash_mode?: 'pourcentage' | 'montant_tnd' | null;
  vente_flash_taux_reduction?: number | null;
  vente_flash_montant_tnd?: number | null;
  vente_flash_date_debut?: string | null;
  vente_flash_date_fin?: string | null;
  ventes_flash?: VenteFlashConfig[];
  frais_menage_disponible?: boolean;
  frais_menage?: number | null;
  frais_service_disponible?: boolean;
  frais_service?: number | null;
  services_payants?: ServicePayantBien[];
  google_maps_embed_url?: string | null;
  airbnb_sync_enabled?: boolean;
  airbnb_import_ics_url?: string | null;
  airbnb_last_sync_at?: string | null;
  airbnb_last_sync_status?: 'success' | 'error' | 'idle' | null;
  airbnb_last_sync_message?: string | null;
  airbnb_last_sync_event_count?: number | null;
  airbnb_sync_history?: Array<{
    at: string;
    status: 'success' | 'error' | 'idle';
    message?: string | null;
    event_count?: number | null;
    removed_count?: number | null;
    source?: 'manual' | 'scheduled' | 'startup' | null;
  }>;
  exterieur_jardin?: string[];
  confort_equipements_interieurs?: string[];
  climatisation?: boolean;
  terrasse?: boolean;
  vue_mer?: boolean;
  proche_plage?: boolean;
  distance_plage_m?: number | null;
};

export interface OwnerCalendarPromptStatus {
  promptId: string;
  ownerId: string;
  ownerName: string;
  promptDate?: string | null;
  status: string;
  notificationId?: string | null;
  overdueNotificationId?: string | null;
  overdueNotifiedAt?: string | null;
  respondedAt?: string | null;
  responseMetadata?: {
    response?: string | null;
    bienId?: string | null;
    propertyTitle?: string | null;
    respondedAt?: string | null;
    verifiedAt?: string | null;
  } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Bien {
  id: string;
  reference: string;
  titre: string;
  folder_id?: string | null;
  folder_name?: string | null;
  nom_bien_mobile?: string | null;
  nom_application?: string | null;
  description?: string;
  mode: BienMode;
  type: BienType;
  residence_parent_bien_id?: string | null;
  residence_parent_name?: string | null;
  residence_unit_key?: string | null;
  residence_unit_sub_type?: string | null;
  residence_units?: ResidenceUnitTemplate[];
  surface?: number;
  nb_chambres: number;
  nb_salle_bain: number;
  prix_nuitee: number;
  prix_semaine?: number | null;
  tarification_methode?: TarificationMethodeVente | null;
  prix_affiche_client?: number | null;
  prix_fixe_proprietaire?: number | null;
  prix_proprietaire?: number | null;
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
  vente_appartement_details?: VenteAppartementDetails | null;
  vente_appartement_details_json?: string | null;
  vente_maison_details?: VenteMaisonDetails | null;
  vente_maison_details_json?: string | null;
  eau_puits?: boolean;
  eau_sonede?: boolean;
  electricite_steg?: boolean;
  surface_local_m2?: number | null;
  facade_m?: number | null;
  hauteur_plafond_m?: number | null;
  activite_recommandee?: string | null;
  local_commercial_details?: Record<string, any> | null;
  local_commercial_details_json?: string | null;
  local_sous_type?: string | null;
  local_usage_actuel?: string | null;
  local_surface_exploitable_m2?: number | null;
  local_surface_rdc_m2?: number | null;
  local_surface_mezzanine_m2?: number | null;
  local_largeur_vitrine_m?: number | null;
  local_nb_vitrines?: number | null;
  local_nb_facades?: number | null;
  local_visibilite_commerciale?: string | null;
  local_nb_pieces_bureaux?: number | null;
  local_nb_sanitaires?: number | null;
  local_nb_places_parking?: number | null;
  local_type_activite_actuelle?: string | null;
  local_etat?: string | null;
  local_standing?: string | null;
  local_passage_pieton?: string | null;
  local_passage_automobile?: string | null;
  local_titre_foncier?: string | null;
  local_situation_juridique?: string | null;
  local_loyer_mensuel_actuel?: number | null;
  local_revenu_annuel?: number | null;
  local_rendement_brut_pct?: number | null;
  toilette?: boolean;
  reserve_local?: boolean;
  vitrine?: boolean;
  coin_angle?: boolean;
  electricite_3_phases?: boolean;
  alarme?: boolean;
  local_sur_rue_principale?: boolean;
  local_entree_independante?: boolean;
  local_open_space?: boolean;
  local_reception?: boolean;
  local_kitchenette?: boolean;
  local_mezzanine?: boolean;
  local_sous_sol?: boolean;
  local_acces_direct_rue?: boolean;
  local_acces_pmr?: boolean;
  local_ascenseur?: boolean;
  local_double_entree?: boolean;
  local_parking?: boolean;
  local_stationnement_facile?: boolean;
  local_chauffage?: boolean;
  local_fibre_internet?: boolean;
  local_activite_commerciale_autorisee?: boolean;
  local_extraction_possible?: boolean;
  local_adapte_restauration?: boolean;
  local_adapte_cabinet_medical?: boolean;
  local_adapte_bureau?: boolean;
  local_amenage?: boolean;
  local_actuellement_loue?: boolean;
  local_bail_en_cours?: boolean;
  local_zone_commerciale?: boolean;
  local_proche_administrations?: boolean;
  local_proche_commerces?: boolean;
  local_titre_bleu?: boolean;
  local_disponible_immediatement?: boolean;
  type_terrain?: TypeTerrainVente | null;
  terrain_facade_m?: number | null;
  terrain_surface_m2?: number | null;
  terrain_distance_plage_m?: number | null;
  terrain_zone?: string | null;
  terrain_constructible?: boolean;
  terrain_angle?: boolean;
  terrain_prix_affiche_total?: number | null;
  terrain_prix_affiche_par_m2?: number | null;
  terrain_mode_affichage_prix?: ModeAffichagePrixTerrain | null;
  terrain_disponibilite_reseaux?: string[] | null;
  terrain_hauteur_construction_autorisee?: string | null;
  terrain_route_acces_largeur_m?: number | null;
  terrain_forme?: string | null;
  terrain_topographie?: TerrainTopographie | null;
  terrain_bornage?: boolean;
  terrain_travaux_municipalite_autorises?: boolean;
  terrain_limites_cadastrales?: boolean;
  terrain_visualisation_limites_cadastrales?: boolean;
  terrain_voisinage?: TerrainVoisinage | null;
  terrain_proximites_commodites?: string[] | null;
  terrain_proximites_commodites_autres?: string | null;
  terrain_viabilisation_eau_sources?: string[] | null;
  terrain_viabilisation_onas?: TerrainViabilisationOnas | null;
  terrain_viabilisation_steg?: TerrainViabilisationSteg | null;
  terrain_viabilisation_gaz_ville?: boolean;
  terrain_viabilisation_fibre_optique?: boolean;
  terrain_viabilisation_telephone_fixe?: boolean;
  terrain_type_sol?: TerrainTypeSol | null;
  terrain_vegetation?: string | null;
  terrain_niveau_sonore?: TerrainNiveauSonore | null;
  terrain_risque_inondation?: boolean;
  terrain_exposition_vent?: string | null;
  terrain_ideal_utilisations?: string[] | null;
  terrain_documents_disponibles?: string[] | null;
  immeuble_surface_terrain_m2?: number | null;
  immeuble_surface_batie_m2?: number | null;
  immeuble_largeur_facade_m?: number | null;
  immeuble_nb_facades?: number | null;
  immeuble_nb_niveaux?: number | null;
  immeuble_nb_etages?: number | null;
  immeuble_nb_garages?: number | null;
  immeuble_nb_appartements?: number | null;
  immeuble_nb_s1?: number | null;
  immeuble_nb_s2?: number | null;
  immeuble_nb_s3?: number | null;
  immeuble_nb_locaux_commerciaux?: number | null;
  immeuble_nb_bureaux?: number | null;
  immeuble_nb_places_parking?: number | null;
  immeuble_nb_unites_louees?: number | null;
  immeuble_revenu_locatif_mensuel?: number | null;
  immeuble_revenu_locatif_annuel?: number | null;
  immeuble_rendement_brut_pct?: number | null;
  immeuble_niveaux_autorises?: string | null;
  immeuble_distance_centre_m?: number | null;
  immeuble_distance_plage_m?: number | null;
  immeuble_usage_actuel?: string | null;
  immeuble_etat?: string | null;
  immeuble_standing?: string | null;
  immeuble_loue_actuellement?: string | null;
  immeuble_titre_foncier?: string | null;
  immeuble_permis_batir?: string | null;
  immeuble_situation_juridique?: string | null;
  immeuble_mode_vente?: string | null;
  immeuble_proche_plage?: boolean;
  immeuble_ascenseur?: boolean;
  immeuble_depot_sous_sol?: boolean;
  immeuble_garage?: boolean;
  immeuble_parking_sous_sol?: boolean;
  immeuble_parking_exterieur?: boolean;
  immeuble_syndic?: boolean;
  immeuble_vue_mer?: boolean;
  immeuble_chauffage_central?: boolean;
  immeuble_climatisation?: boolean;
  immeuble_gaz_ville?: boolean;
  immeuble_compteurs_individuels?: boolean;
  immeuble_eau_electricite_disponible?: boolean;
  immeuble_location_saisonniere_possible?: boolean;
  immeuble_extension_possible?: boolean;
  immeuble_construction_supplementaire_possible?: boolean;
  immeuble_route_principale?: boolean;
  immeuble_proche_commerces?: boolean;
  immeuble_titre_bleu?: boolean;
  immeuble_plans_disponibles?: boolean;
  immeuble_disponible_immediatement?: boolean;
  immeuble_appartements?: ImmeubleAppartementDetail[];
  immeuble_unit_models?: ImmeubleUnitModel[];
  immeuble_garages?: ImmeubleGarageDetail[];
  immeuble_locaux_commerciaux?: ImmeubleLocalCommercialDetail[];
  lotissement_nb_terrains?: number | null;
  lotissement_prix_total?: number | null;
  lotissement_mode_prix_m2?: ModePrixLotissement | null;
  lotissement_prix_m2_unique?: number | null;
  lotissement_vente_mode?: string | null;
  lotissement_prix_m2_moyen?: number | null;
  lotissement_prix_negociable?: boolean;
  lotissement_prix_different_par_lot?: boolean;
  lotissement_surface_totale_m2?: number | null;
  lotissement_surface_vendable_m2?: number | null;
  lotissement_surface_voirie_commune_m2?: number | null;
  lotissement_nb_lots_disponibles?: number | null;
  lotissement_nb_lots_vendus_reserves?: number | null;
  lotissement_surface_lot_min_m2?: number | null;
  lotissement_surface_lot_max_m2?: number | null;
  lotissement_surface_lot_moyenne_m2?: number | null;
  lotissement_cloture?: boolean;
  lotissement_entree_unique?: boolean;
  lotissement_voirie_interne?: boolean;
  lotissement_route_goudronnee?: boolean;
  lotissement_largeur_voies_m?: number | null;
  lotissement_vocation?: string | null;
  lotissement_approuve?: string | null;
  lotissement_constructible?: boolean;
  lotissement_nb_etages_autorises?: string | null;
  lotissement_cahier_charges?: boolean;
  lotissement_electricite?: string | null;
  lotissement_eau?: string | null;
  lotissement_onas?: boolean;
  lotissement_gaz?: boolean;
  lotissement_eclairage_public?: boolean;
  lotissement_distance_plage_m?: number | null;
  lotissement_distance_centre_m?: number | null;
  lotissement_vue_mer?: boolean;
  lotissement_quartier_residentiel?: boolean;
  lotissement_titre_foncier_global?: boolean;
  lotissement_titre_individuel_par_lot?: string | null;
  lotissement_titre_bleu?: boolean;
  lotissement_plan_lotissement?: boolean;
  lotissement_situation_juridique?: string | null;
  lotissement_disponible_immediatement?: boolean;
  lotissement_terrains?: LotissementTerrainDetail[];
  lotissement_lot_models?: LotissementLotModel[];
  lotissement_paliers_prix_m2?: LotissementPalierPrix[];
  charges?: number;
  statut: BienStatut;
  visible_sur_site?: boolean;
  is_featured?: boolean;
  reservation_sur_demande?: boolean;
  ui_config?: BienUiConfig | null;
  location_saisonniere_config?: LocationSaisonniereConfig | null;
  menage_en_cours: boolean;
  zone_id?: string;
  proprietaire_id?: string;
  date_ajout: string;
  created_at: string;
  updated_at: string;
  admin_last_saved_at?: string | null;
  owner_calendar_prompt_status?: OwnerCalendarPromptStatus | null;
  media?: Media[];
  unavailableDates?: DateStatus[];
  pricing_periods?: SeasonalPricingPeriod[];
  caracteristiques?: string[];
  caracteristique_ids?: string[];
  caracteristique_valeurs?: Record<string, string | string[]>;
}

export interface BienFolder {
  id: string;
  name: string;
  parent_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PropertyPack {
  id: string;
  name: string;
  description?: string | null;
  bienIds: string[];
  clientTabId?: string | null;
  isActive?: boolean;
  clientTab?: PropertyPackTab | null;
  highlightBullets?: string[];
  galleryImages?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type PropertyPackTabIconKey =
  | 'home'
  | 'heart'
  | 'crown'
  | 'map'
  | 'briefcase'
  | 'sparkles';

export interface PropertyPackTab {
  id: string;
  label: string;
  iconKey: PropertyPackTabIconKey;
  customIconUrl?: string | null;
  sortOrder?: number | null;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PropertyGroupItem {
  id: string;
  group_id: string;
  bien_id: string;
  bien_reference?: string | null;
  bien_titre?: string | null;
  bien_configuration?: string | null;
  bien_nb_chambres?: number | null;
  order_index?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PropertyGroup {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  mode?: BienMode | null;
  zone_id?: string | null;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  items: PropertyGroupItem[];
}

export interface Caracteristique {
  id: string;
  nom: string;
  type_caracteristique?: 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte';
  choix_json?: string | null;
  unite?: string | null;
  icon_name?: string | null;
  onglet_id?: string | null;
  onglet_nom?: string | null;
  visibilite_client?: number | null;
  valeur_json?: string | null;
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
  montant_donne_proprietaire?: number | null;
  montant_total_proprietaire?: number | null;
  profit_net?: number | null;
  url_pdf?: string;
  owner_url_pdf?: string;
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

export type MaintenanceStatut = 'en_attente_accord_proprietaire' | 'approuve' | 'en_cours' | 'termine' | 'annule';

export interface Maintenance {
  id: string;
  bien_id: string;
  description: string;
  cout: number;
  statut: MaintenanceStatut;
  bien_titre?: string;
  proprietaire_id?: string | null;
  proprietaire_nom?: string | null;
  owner_approval_required?: boolean;
  owner_approval_status?: 'non_requis' | 'en_attente' | 'approuve';
  owner_approved_at?: string | null;
  created_at: string;
}

export type ClienteleTaskSeverity = 'info' | 'warning' | 'critical';
export type ClienteleTaskStatus = 'open' | 'done';

export interface ClienteleTask {
  id: string;
  sourceTable: 'utilisateurs' | 'locataires' | 'proprietaires';
  sourceId: string;
  taskType: string;
  severity: ClienteleTaskSeverity;
  title: string;
  detail: string;
  dueDate?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  status: ClienteleTaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  utilisateur_id?: string | null;
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  lu: boolean;
  created_at: string;
}

export type ReservationDemandStatus =
  | 'en_attente_reponse_proprietaire'
  | 'pas_de_reponse_proprietaire'
  | 'reponse_positive_attente_confirmation_client'
  | 'client_procede_vers_paiement_en_cours'
  | 'reponse_negative_autre_proposition_meme_bien'
  | 'reponse_negative_autre_proposition_bien_similaire'
  | 'attente_validation_agence_partenaire'
  | 'attente_validation_amicale'
  | 'attente_validation_par_agence'
  | 'voucher_en_cours'
  | 'rejete_par_agence_partenaire'
  | 'rejete_par_amicale'
  | 'rejete_par_agence'
  | 'demande_rejetee_admin'
  | 'demande_annulee_client'
  | 'demande_annulee_echeance_contrat'
  | 'attente_envoi_coordonnees_contrat'
  | 'demande_recu_paiement'
  | 'recu_paiement_envoye'
  | 'contrat_realise'
  | 'succes_paiement';

export type ReservationDemandRequestType = 'reservation' | 'visite';

export type HotelReservationDemandStatus =
  | 'attente_validation_amicale'
  | 'attente_validation_par_agence'
  | 'nouvelle_demande'
  | 'client_procede_vers_paiement_en_cours'
  | 'demande_recu_paiement'
  | 'recu_paiement_envoye'
  | 'succes_paiement'
  | 'voucher_en_cours'
  | 'voucher_envoye'
  | 'rejete_par_amicale'
  | 'rejete_par_agence'
  | 'annulee';

export interface ReservationDemand {
  id: string;
  bien_id: string;
  reservation_group_id?: string | null;
  reservation_group_role?: 'master' | 'child' | null;
  reservation_group_parent_demand_id?: string | null;
  reservation_group_sequence?: number | null;
  reservation_group_label?: string | null;
  reservation_group_refs?: string[] | null;
  reservation_group_item_bien_ids?: string[] | null;
  request_type?: ReservationDemandRequestType;
  unavailable_date_id?: string | null;
  client_user_id?: string | null;
  client_email?: string | null;
  client_name?: string | null;
  proprietaire_id?: string | null;
  owner_user_id?: string | null;
  start_date: string;
  end_date: string;
  guests: number;
  adult_guests?: number;
  child_guests?: number;
  payment_mode?: 'avance' | 'totalite' | 'amicale' | null;
  partner_agency_id?: string | null;
  partner_agency_name?: string | null;
  partner_agency_slug?: string | null;
  partner_agency_logo_url?: string | null;
  partner_agency_margin_multiplier?: number | null;
  pricing_amicale_id?: string | null;
  amicale_matricule?: string | null;
  amicale_phone?: string | null;
  amicale_code?: string | null;
  total_amount?: number | null;
  amount_due_now?: number | null;
  flash_offer?: {
    title?: string | null;
    start: string;
    end: string;
    mode?: 'percentage' | 'fixed_amount' | null;
    discountPercent?: number | null;
    fixedNightlyAmount?: number | null;
    minimumNights?: number | null;
  } | null;
  selected_fixed_services?: ServicePayantBien[];
  selected_variable_services?: ServicePayantBien[];
  variable_services_quote?: Array<ServicePayantBien & { prix_saisi?: number | null }>;
  variable_services_quote_total?: number | null;
  variable_services_quote_status?: 'aucun' | 'a_traiter' | 'devis_envoye' | 'accepte' | 'paye' | null;
  partner_agency_validation_at?: string | null;
  amicale_validation_at?: string | null;
  agency_validation_at?: string | null;
  voucher_id?: string | null;
  voucher_number?: string | null;
  voucher_url?: string | null;
  voucher_generated_at?: string | null;
  montant_donne_proprietaire?: number | null;
  montant_total_proprietaire?: number | null;
  profit_net?: number | null;
  reservation_payment_id?: string | null;
  reservation_payment_paid_at?: string | null;
  services_payment_id?: string | null;
  services_payment_paid_at?: string | null;
  flouci_checkout_id?: string | null;
  flouci_scope?: 'reservation' | 'services' | 'combined' | null;
  flouci_status?: string | null;
  flouci_checkout_url?: string | null;
  flouci_verified_at?: string | null;
  clicktopay_scope?: 'reservation' | 'services' | 'combined' | null;
  clicktopay_payment_id?: string | null;
  clicktopay_order_number?: string | null;
  clicktopay_status?: string | null;
  clicktopay_checkout_url?: string | null;
  clicktopay_paid_at?: string | null;
  payment_receipt_image_url?: string | null;
  payment_receipt_uploaded_at?: string | null;
  payment_receipt_note?: string | null;
  status: ReservationDemandStatus;
  owner_notified_at?: string | null;
  owner_response_at?: string | null;
  client_confirmation_clicked_at?: string | null;
  admin_note?: string | null;
  client_note?: string | null;
  identity_document_type?: 'cin_tn' | 'passport_tn' | 'passport_foreign' | null;
  identity_document_number?: string | null;
  identity_first_name?: string | null;
  identity_last_name?: string | null;
  identity_document_country?: string | null;
  identity_document_image_url?: string | null;
  identity_ocr_text?: string | null;
  identity_submitted_at?: string | null;
  contract_generated_at?: string | null;
  finalization_due_at?: string | null;
  contract_id?: string | null;
  contract_url?: string | null;
  owner_contract_url?: string | null;
  payment_id?: string | null;
  bien_titre?: string | null;
  bien_reference?: string | null;
  bien_mode?: string | null;
  proprietaire_nom?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationDemandHistory {
  id: string;
  demand_id: string;
  status: ReservationDemandStatus;
  actor_type: 'client' | 'admin' | 'system' | 'proprietaire' | 'agent_amicale' | 'agence_partenaire';
  actor_id?: string | null;
  note?: string | null;
  created_at: string;
}

export interface HotelReservationDemand {
  id: string;
  client_user_id?: string | null;
  client_email?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  hotel_id: string;
  hotel_name: string;
  hotel_city_id?: string | null;
  hotel_city_name?: string | null;
  hotel_image_url?: string | null;
  check_in: string;
  check_out: string;
  adults: number;
  child_ages?: number[];
  boarding_id?: string | null;
  boarding_name?: string | null;
  room_id?: string | null;
  room_name?: string | null;
  total_price?: number | null;
  amount_due_now?: number | null;
  currency?: string | null;
  payment_mode?: 'avance' | 'totalite' | 'amicale' | null;
  pricing_amicale_id?: string | null;
  amicale_name?: string | null;
  amicale_matricule?: string | null;
  amicale_phone?: string | null;
  amicale_code?: string | null;
  amicale_validation_at?: string | null;
  agency_validation_at?: string | null;
  payment_method?: 'virement' | 'flouci' | 'clicktopay' | null;
  reservation_payment_id?: string | null;
  reservation_payment_paid_at?: string | null;
  flouci_checkout_id?: string | null;
  flouci_scope?: 'reservation' | null;
  flouci_status?: string | null;
  flouci_checkout_url?: string | null;
  flouci_verified_at?: string | null;
  clicktopay_payment_id?: string | null;
  clicktopay_order_number?: string | null;
  clicktopay_status?: string | null;
  clicktopay_checkout_url?: string | null;
  clicktopay_paid_at?: string | null;
  payment_receipt_image_url?: string | null;
  payment_receipt_uploaded_at?: string | null;
  payment_receipt_note?: string | null;
  voucher_id?: string | null;
  voucher_number?: string | null;
  voucher_url?: string | null;
  voucher_generated_at?: string | null;
  voucher_sent_at?: string | null;
  voucher_qr_payload?: string | null;
  voucher_qr_image_url?: string | null;
  status: HotelReservationDemandStatus;
  client_note?: string | null;
  admin_note?: string | null;
  hotel_context?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
