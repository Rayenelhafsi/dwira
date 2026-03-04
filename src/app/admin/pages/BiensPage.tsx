import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, MapPin, Home, Banknote, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Check, Calendar as CalendarIcon, Image as ImageIcon, Bed, Bath, Maximize, Sofa, ArrowLeft, Trash, Save, GripVertical, Upload, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { mockZones, mockProprietaires } from '../data/mockData';
import { Bien, BienStatut, Media, DateStatus, BienType, BienMode, Zone, Proprietaire, Caracteristique, TypeRueAppartementVente, TypePapierAppartementVente, TypeTerrainVente, TarificationMethodeVente, ModalitePaiementVente, ModeAffichagePrixTerrain, ModePrixLotissement, BienUiConfig } from '../types';
import * as Dialog from '@radix-ui/react-dialog';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, addMonths, subMonths, startOfWeek, endOfWeek, isWithinInterval, parseISO, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { useProperties } from '../../context/PropertiesContext';
import PublicBienPageView from '../../ventes/components/PublicBienPageView';
import LocationPublicBienPageView from '../../locations/components/LocationPublicBienPageView';
import { isYouTubeUrl, toYouTubeEmbedUrl, toYouTubeThumbnailUrl } from '../../utils/videoLinks';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const resolveMediaUrl = (url?: string | null) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = /^https?:\/\//i.test(API_URL)
    ? API_URL
    : (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : window.location.origin);
  const origin = new URL(base, window.location.origin).origin;
  if (value.startsWith('/')) return `${origin}${value}`;
  return value;
};

const statusColors: Record<BienStatut, string> = { disponible: "bg-emerald-100 text-emerald-800 border-emerald-200", loue: "bg-blue-100 text-blue-800 border-blue-200", reserve: "bg-amber-100 text-amber-800 border-amber-200", maintenance: "bg-red-100 text-red-800 border-red-200", bloque: "bg-gray-200 text-gray-800 border-gray-300" };
const statusLabels: Record<BienStatut, string> = { disponible: "Disponible", loue: "Loué", reserve: "Réservé", maintenance: "Maintenance", bloque: "Bloqué" };
const modeLabels: Record<BienMode, string> = {
  vente: "Vente",
  location_annuelle: "Location annuelle",
  location_saisonniere: "Location saisonniere",
};
const typeLabels: Record<BienType, string> = {
  appartement: "Appartement",
  villa_maison: "Villa/Maison",
  studio: "Studio",
  immeuble: "Immeuble",
  terrain: "Terrain",
  lotissement: "Lotissement",
  local_commercial: "Local commercial",
  bungalow: "Bungalow",
  S1: "Appartement",
  S2: "Appartement",
  S3: "Appartement",
  S4: "Appartement",
  villa: "Villa/Maison",
  local: "Local commercial",
};
const BIEN_TYPES_BY_MODE: Record<BienMode, BienType[]> = {
  vente: ['appartement', 'villa_maison', 'studio', 'immeuble', 'terrain', 'lotissement', 'local_commercial'],
  location_saisonniere: ['appartement', 'villa_maison', 'bungalow', 'studio'],
  location_annuelle: ['appartement', 'local_commercial', 'villa_maison'],
};
const TERRAIN_PRIX_MODE_LABELS: Record<ModeAffichagePrixTerrain, string> = {
  total_uniquement: 'Total uniquement',
  m2_uniquement: 'Prix / m2 uniquement',
  total_et_m2: 'Total et prix / m2',
};
const LOTISSEMENT_PRIX_MODE_LABELS: Record<ModePrixLotissement, string> = {
  m2_unique: 'Prix / m2 unique',
  paliers: 'Paliers selon surface',
};
const TYPE_RUE_LABELS: Record<TypeRueAppartementVente, string> = {
  piste: 'Piste',
  route_goudronnee: 'Route goudronnée',
  rue_residentielle: 'Rue résidentielle',
};
const TYPE_PAPIER_LABELS: Record<TypePapierAppartementVente, string> = {
  titre_foncier_individuel: 'Titre foncier individuel',
  titre_foncier_collectif: 'Titre foncier collectif',
  contrat_seulement: 'Contrat seulement',
  sans_papier: 'Sans papier',
};
const TYPE_TERRAIN_LABELS: Record<TypeTerrainVente, string> = {
  agricole: 'Agricole',
  habitation: 'Habitation',
  industrielle: 'Industrielle',
  loisir: 'Loisir',
};
const TERRAIN_SECTION_TABS = [
  { id: 'informations_generales', label: '1. Informations generales' },
  { id: 'dimensions_forme', label: '2. Dimensions & forme' },
  { id: 'situation_juridique', label: '3. Situation juridique' },
  { id: 'acces_environnement', label: '4. Acces & environnement' },
  { id: 'viabilisation', label: '5. Viabilisation' },
  { id: 'environnement_naturel', label: '6. Environnement naturel' },
  { id: 'ideal_utilisation', label: '7. Ideal pour' },
  { id: 'documents_disponibles', label: '8. Documents disponibles' },
] as const;
const UI_SECTION_FEATURE_TAB_DEFINITIONS: Partial<Record<keyof BienUiConfig, { label: string; ordre: number }>> = {
  show_gallery: { label: 'Galerie', ordre: 10 },
  show_informations_generales: { label: 'Informations generales', ordre: 20 },
  show_caracteristiques: { label: 'Caracteristiques', ordre: 30 },
  show_tarification_publique: { label: 'Tarification publique', ordre: 40 },
  show_modalites_paiement: { label: 'Modalites de paiement', ordre: 50 },
  show_immeuble_appartements: { label: 'Bloc appartements', ordre: 60 },
  show_immeuble_garages: { label: 'Bloc garages', ordre: 70 },
  show_immeuble_locaux_commerciaux: { label: 'Bloc locaux commerciaux', ordre: 80 },
  show_lotissement_terrains: { label: 'Bloc terrains du lotissement', ordre: 90 },
};
type TerrainSectionTab = string;
type CaracteristiqueOnglet = {
  id: string;
  nom: string;
  ordre?: number;
  is_system?: number | boolean;
};
const DEFAULT_DETAILS_TABS: CaracteristiqueOnglet[] = [
  { id: 'informations_generales', nom: 'Informations generales', ordre: 20, is_system: 1 },
  { id: 'caracteristiques', nom: 'Caracteristiques', ordre: 30, is_system: 1 },
];
type ValidationIssue = {
  step: 1 | 2 | 3 | 4 | 5;
  fieldName: string;
  label: string;
  message: string;
};
const TERRAIN_HAUTEUR_OPTIONS = ['R+1', 'R+2', 'R+3', 'R+4', 'R+5'];
const TERRAIN_FORME_OPTIONS = ['rectangulaire', 'irreguliere', 'carre', 'triangle', 'autre'];
const TERRAIN_TOPOGRAPHIE_OPTIONS = [
  { value: 'plat', label: 'Plat' },
  { value: 'en_pente', label: 'En pente' },
];
const TERRAIN_VOISINAGE_OPTIONS = [
  { value: 'residentiel_calme', label: 'Residentiel calme' },
  { value: 'touristique_anime', label: 'Touristique anime' },
  { value: 'agricole', label: 'Agricole' },
];
const TERRAIN_TYPE_SOL_OPTIONS = [
  { value: 'sablonneux', label: 'Sablonneux' },
  { value: 'rocheux', label: 'Rocheux' },
  { value: 'terre_agricole', label: 'Terre agricole' },
];
const TERRAIN_NIVEAU_SONORE_OPTIONS = [
  { value: 'faible', label: 'Faible' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'eleve', label: 'Eleve' },
];
const TERRAIN_ONAS_OPTIONS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'en_facade', label: 'En facade' },
  { value: 'non_disponible', label: 'Non disponible' },
];
const TERRAIN_STEG_OPTIONS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'a_proximite', label: 'A proximite' },
  { value: 'transformateur_proche', label: 'Transformateur proche' },
  { value: 'non_disponible', label: 'Non disponible' },
];
const TERRAIN_MULTI_OPTIONS = {
  disponibiliteReseaux: [
    { value: 'eau', label: 'Eau' },
    { value: 'electricite', label: 'Electricite' },
    { value: 'onas', label: 'ONAS' },
  ],
  proximites: [
    { value: 'ecole', label: 'Ecole' },
    { value: 'commerce', label: 'Commerce' },
    { value: 'transport', label: 'Transport' },
    { value: 'centre_ville', label: 'Centre-ville' },
  ],
  eauSources: [
    { value: 'sonede', label: 'SONEDE' },
    { value: 'puits', label: 'Puits' },
    { value: 'citerne', label: 'Citerne' },
  ],
  idealUtilisations: [
    { value: 'construction_villa', label: 'Construction villa' },
    { value: 'construction_immeuble', label: 'Construction immeuble' },
    { value: 'projet_touristique', label: 'Projet touristique' },
    { value: 'projet_commercial', label: 'Projet commercial' },
    { value: 'projet_agricole', label: 'Projet agricole' },
    { value: 'investissement_longue_duree', label: 'Investissement longue duree' },
  ],
  documents: [
    { value: 'plan_masse', label: 'Plan de masse' },
    { value: 'plan_topographique', label: 'Plan topographique' },
    { value: 'certificat_propriete', label: 'Certificat de propriete' },
    { value: 'certificat_bornage', label: 'Certificat de bornage' },
    { value: 'certificat_conformite_municipal', label: 'Certificat conformite municipal' },
    { value: 'certificat_non_affectation_agricole', label: 'Certificat non-affectation agricole' },
  ],
} as const;
const APPARTEMENT_VENTE_BOOLEAN_FIELDS = [
  'proche_plage', 'chauffage_central', 'climatisation', 'balcon', 'terrasse', 'ascenseur', 'vue_mer',
  'gaz_ville', 'cuisine_equipee', 'place_parking', 'syndic', 'meuble', 'independant', 'eau_puits',
  'eau_sonede', 'electricite_steg'
] as const;
const APPARTEMENT_VENTE_BOOLEAN_LABELS: Record<(typeof APPARTEMENT_VENTE_BOOLEAN_FIELDS)[number], string> = {
  proche_plage: 'Proche de la plage',
  chauffage_central: 'Chauffage central',
  climatisation: 'Climatisation',
  balcon: 'Balcon',
  terrasse: 'Terrasse',
  ascenseur: 'Ascenseur',
  vue_mer: 'Vue mer',
  gaz_ville: 'Gaz de ville',
  cuisine_equipee: 'Cuisine equipee',
  place_parking: 'Place parking',
  syndic: 'Syndic',
  meuble: 'Meublé',
  independant: 'Indépendant',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Électricité STEG',
};
const normalizeFeatureName = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const parseFeatureChoices = (value: string) =>
  Array.from(new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean)));
const stringifyFeatureChoices = (value?: string | null) => {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean).join(', ') : '';
  } catch {
    return '';
  }
};
const APPARTEMENT_VENTE_DETAIL_FEATURES = new Set(
  Object.values(APPARTEMENT_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
APPARTEMENT_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Parking'));
APPARTEMENT_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Vue sur mer'));
const LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS = [
  'toilette', 'reserve_local', 'vitrine', 'coin_angle', 'electricite_3_phases', 'gaz_ville', 'alarme',
  'eau_puits', 'eau_sonede', 'electricite_steg'
] as const;
const LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS: Record<(typeof LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS)[number], string> = {
  toilette: 'Toilette',
  reserve_local: 'Réserve',
  vitrine: 'Vitrine',
  coin_angle: "Coin d'angle",
  electricite_3_phases: 'Électricité 3 phases',
  gaz_ville: 'Gaz de ville',
  alarme: 'Alarme',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Électricité STEG',
};
const LOCAL_COMMERCIAL_VENTE_DETAIL_FEATURES = new Set(
  Object.values(LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
const TERRAIN_VENTE_BOOLEAN_FIELDS = ['terrain_constructible', 'terrain_angle', 'eau_puits', 'eau_sonede', 'electricite_steg'] as const;
const TERRAIN_VENTE_BOOLEAN_LABELS: Record<(typeof TERRAIN_VENTE_BOOLEAN_FIELDS)[number], string> = {
  terrain_constructible: 'Constructible',
  terrain_angle: "Terrain d'angle",
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Électricité STEG',
};
const TERRAIN_VENTE_DETAIL_FEATURES = new Set(
  Object.values(TERRAIN_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain agricole'));
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain habitation'));
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain industrielle'));
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain loisir'));
const IMMEUBLE_VENTE_BOOLEAN_FIELDS = ['immeuble_proche_plage', 'immeuble_ascenseur', 'immeuble_parking_sous_sol', 'immeuble_parking_exterieur', 'immeuble_syndic', 'immeuble_vue_mer', 'eau_puits', 'eau_sonede', 'electricite_steg'] as const;
const IMMEUBLE_VENTE_BOOLEAN_LABELS: Record<(typeof IMMEUBLE_VENTE_BOOLEAN_FIELDS)[number], string> = {
  immeuble_proche_plage: 'Proche de la plage',
  immeuble_ascenseur: 'Ascenseur',
  immeuble_parking_sous_sol: 'Parking sous-sol',
  immeuble_parking_exterieur: 'Parking extérieur',
  immeuble_syndic: 'Syndic',
  immeuble_vue_mer: 'Vue mer',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Électricité STEG',
};
const IMMEUBLE_VENTE_DETAIL_FEATURES = new Set(
  Object.values(IMMEUBLE_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
const CHARACTERISTICS_MARKER = '[CARACTERISTIQUES_JSON]';
const DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT = 3;
const DEFAULT_COMMISSION_CLIENT_PERCENT = 2;
const DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE = 30;
const PROOF_MOTIF_TYPE_RUE = 'preuve_type_rue';
const PROOF_MOTIF_TYPE_PAPIER = 'preuve_type_papier';
const GALLERY_UNIT_MOTIF = 'gallery_unite';
const buildProofMotif = (
  proofType: typeof PROOF_MOTIF_TYPE_RUE | typeof PROOF_MOTIF_TYPE_PAPIER,
  mode?: BienMode,
  type?: BienType,
  unitKey?: string
) => `${proofType}|${mode || 'unknown_mode'}|${type || 'unknown_type'}${unitKey ? `|${unitKey}` : ''}`;
const buildUnitGalleryMotif = (mode?: BienMode, type?: BienType, unitKey?: string) =>
  `${GALLERY_UNIT_MOTIF}|${mode || 'unknown_mode'}|${type || 'unknown_type'}${unitKey ? `|${unitKey}` : ''}`;
const isProofMotif = (motif?: string | null) =>
  String(motif || '') === PROOF_MOTIF_TYPE_RUE
  || String(motif || '') === PROOF_MOTIF_TYPE_PAPIER
  || String(motif || '').startsWith(`${PROOF_MOTIF_TYPE_RUE}|`)
  || String(motif || '').startsWith(`${PROOF_MOTIF_TYPE_PAPIER}|`);

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeVenteTarification(formData: Partial<Bien>) {
  const selectedType = (formData.type || 'appartement') as BienType;
  const terrainPrixDerive = selectedType === 'terrain'
    ? (Number(formData.terrain_prix_affiche_total || 0) || (Number(formData.terrain_surface_m2 || 0) * Number(formData.terrain_prix_affiche_par_m2 || 0)))
    : 0;
  const lotissementPrixDerive = selectedType === 'lotissement'
    ? Number(formData.lotissement_prix_total || 0)
    : 0;
  const prixAfficheClient = Number(formData.prix_affiche_client ?? formData.prix_nuitee ?? terrainPrixDerive ?? lotissementPrixDerive ?? 0);
  const tarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
  if (!Number.isFinite(prixAfficheClient) || prixAfficheClient <= 0) {
    return {
      prixAfficheClient: 0,
      prixFixeProprietaire: 0,
      prixFinal: 0,
      revenuAgence: 0,
      prixMinimumAccepte: 0,
      commissionPourcentageProprietaire: Number(formData.commission_pourcentage_proprietaire ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT),
      commissionPourcentageClient: Number(formData.commission_pourcentage_client ?? DEFAULT_COMMISSION_CLIENT_PERCENT),
    };
  }

  if (tarificationMethode === 'avec_commission') {
    const commissionPourcentageProprietaire = Number(formData.commission_pourcentage_proprietaire ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT);
    const commissionPourcentageClient = Number(formData.commission_pourcentage_client ?? DEFAULT_COMMISSION_CLIENT_PERCENT);
    const partProprietaire = toMoney((prixAfficheClient * Math.max(0, commissionPourcentageProprietaire)) / 100);
    const partClient = toMoney((prixAfficheClient * Math.max(0, commissionPourcentageClient)) / 100);
    const prixFixeProprietaire = toMoney(prixAfficheClient - partProprietaire);
    const prixFinal = toMoney(prixAfficheClient + partClient);
    const revenuAgence = toMoney(partProprietaire + partClient);

    return {
      prixAfficheClient: toMoney(prixAfficheClient),
      prixFixeProprietaire,
      prixFinal,
      revenuAgence,
      prixMinimumAccepte: 0,
      commissionPourcentageProprietaire: Math.max(0, commissionPourcentageProprietaire),
      commissionPourcentageClient: Math.max(0, commissionPourcentageClient),
    };
  }

  const prixFixeProprietaire = Math.max(0, Number(formData.prix_fixe_proprietaire ?? 0));
  const revenuAgence = toMoney(Math.max(0, prixAfficheClient - prixFixeProprietaire));
  const montantMaxReduction = Math.max(0, Number(formData.montant_max_reduction_negociation ?? 0));
  const reductionEffective = Math.min(montantMaxReduction, revenuAgence);
  const prixMinimumAccepte = toMoney(prixAfficheClient - reductionEffective);

  return {
    prixAfficheClient: toMoney(prixAfficheClient),
    prixFixeProprietaire: toMoney(prixFixeProprietaire),
    prixFinal: toMoney(prixAfficheClient),
    revenuAgence,
    prixMinimumAccepte,
    commissionPourcentageProprietaire: 0,
    commissionPourcentageClient: 0,
  };
}

function computeVentePaiement(formData: Partial<Bien>, prixTotalClient: number) {
  const total = Number(prixTotalClient || 0);
  const modalite = (formData.modalite_paiement_vente || 'comptant') as ModalitePaiementVente;
  if (!Number.isFinite(total) || total <= 0) {
    return {
      modalite,
      pourcentagePremierePartiePromesse: 0,
      montantPremierePartiePromesse: 0,
      montantDeuxiemePartie: 0,
      nombreTranches: Number(formData.nombre_tranches ?? 0),
      periodeTranchesMois: Number(formData.periode_tranches_mois ?? 0),
      montantParTranche: 0,
    };
  }

  if (modalite === 'comptant') {
    return {
      modalite,
      pourcentagePremierePartiePromesse: 100,
      montantPremierePartiePromesse: toMoney(total),
      montantDeuxiemePartie: 0,
      nombreTranches: 0,
      periodeTranchesMois: 0,
      montantParTranche: 0,
    };
  }

  const pourcentagePremierePartiePromesse = Math.max(0, Number(formData.pourcentage_premiere_partie_promesse ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE));
  const montantPremierePartiePromesse = toMoney((total * pourcentagePremierePartiePromesse) / 100);
  const montantDeuxiemePartie = toMoney(Math.max(0, total - montantPremierePartiePromesse));
  const nombreTranches = Math.max(0, Math.floor(Number(formData.nombre_tranches ?? 0)));
  const periodeTranchesMois = Math.max(0, Math.floor(Number(formData.periode_tranches_mois ?? 0)));
  const montantParTranche = nombreTranches > 0 ? toMoney(montantDeuxiemePartie / nombreTranches) : 0;

  return {
    modalite,
    pourcentagePremierePartiePromesse,
    montantPremierePartiePromesse,
    montantDeuxiemePartie,
    nombreTranches,
    periodeTranchesMois,
    montantParTranche,
  };
}

export default function BiensPage() {
  const { biens, zones, proprietaires, modePriorities, saveModePriorities, addBien, updateBien, deleteBien, refreshData, isLoading } = useProperties();
  const zoneOptions = zones.length > 0 ? zones : mockZones;
  const proprietaireOptions = proprietaires.length > 0 ? proprietaires : mockProprietaires;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BienStatut | 'all'>('all');
  const [modeFilter, setModeFilter] = useState<BienMode | 'all'>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingBien, setEditingBien] = useState<Bien | null>(null);
  const [viewingBien, setViewingBien] = useState<Bien | null>(null);
  const [editorInitialStep, setEditorInitialStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [saveSuccessDialogOpen, setSaveSuccessDialogOpen] = useState(false);
  const [priorityDraft, setPriorityDraft] = useState<Record<BienMode, number>>(modePriorities);
  const [isSavingPriorities, setIsSavingPriorities] = useState(false);

  useEffect(() => {
    setPriorityDraft(modePriorities);
  }, [modePriorities]);

  const priorityValues = Object.values(priorityDraft);
  const hasValidPrioritySet =
    priorityValues.length === 3 &&
    priorityValues.every((value) => Number.isInteger(value) && value >= 1 && value <= 3) &&
    new Set(priorityValues).size === 3;

  const filteredBiens = biens.filter((bien) => {
    const query = searchTerm.toLowerCase();
    const matchesQuery = bien.titre.toLowerCase().includes(query) || bien.reference.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || bien.statut === statusFilter;
    const matchesMode = modeFilter === 'all' || bien.mode === modeFilter;
    return matchesQuery && matchesStatus && matchesMode;
  });
  const modeTabs: Array<{ value: BienMode | 'all'; label: string }> = [
    { value: 'all', label: 'Tous les biens' },
    { value: 'vente', label: 'Vente' },
    { value: 'location_annuelle', label: 'Location annuelle' },
    { value: 'location_saisonniere', label: 'Location saisonniere' },
  ];

  const handleDelete = async (id: string) => { if (window.confirm('Supprimer ce bien ?')) { try { await deleteBien(id); toast.success('Bien supprimé'); } catch { toast.error('Erreur'); } } };
  const syncMediaForBien = async (bienId: string, media: Media[]) => {
    const existingResponse = await fetch(`${API_URL}/media/${bienId}`);
    const existingMedia = existingResponse.ok ? await existingResponse.json() : [];
    for (const m of existingMedia) {
      await fetch(`${API_URL}/media/${m.id}`, { method: 'DELETE' });
    }
    const orderedMedia = (Array.isArray(media) ? media : []).map((m, idx) => ({ ...m, position: idx }));
    for (const m of orderedMedia) {
      const createResponse = await fetch(`${API_URL}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bien_id: bienId, type: m.type || 'image', url: m.url, motif_upload: m.motif_upload || null, position: m.position ?? 0 }),
      });
      if (!createResponse.ok) throw new Error('Failed to save media');
    }
  };
  const handleSave = async (bien: Bien) => {
    try {
      const { created_at, updated_at, media, unavailableDates, ...bienData } = bien;
      if (editingBien) {
        await updateBien(bien as any);
        await syncMediaForBien(bien.id, media || []);
      } else {
        const createdBienId = await addBien(bienData as any);
        await syncMediaForBien(createdBienId || String(bienData.id || bien.id), media || []);
      }
      await refreshData();
      setIsAddOpen(false);
      setEditingBien(null);
      setSaveSuccessDialogOpen(true);
      // Hard refresh to guarantee dashboard state reflects persisted data.
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (error: any) {
      const message = String(error?.message || '').trim();
      if (message.includes('mandat proprietaire manquant, invalide ou expire') && bien.visible_sur_site !== false) {
        try {
          const draftBien = { ...bien, visible_sur_site: false } as any;
          if (editingBien) {
            await updateBien(draftBien);
            await syncMediaForBien(bien.id, bien.media || []);
          } else {
            const { created_at: _createdAt, updated_at: _updatedAt, media: _media, unavailableDates: _dates, ...draftBienData } = draftBien;
            const createdBienId = await addBien(draftBienData);
            await syncMediaForBien(createdBienId || String(draftBienData.id || bien.id), bien.media || []);
          }
          await refreshData();
          setIsAddOpen(false);
          setEditingBien(null);
          toast.success('Bien sauvegardé en brouillon. Publication désactivée car le mandat propriétaire est invalide ou expiré.');
          setTimeout(() => {
            window.location.reload();
          }, 300);
          return;
        } catch (retryError: any) {
          const retryMessage = String(retryError?.message || '').trim();
          toast.error(retryMessage ? `Erreur sauvegarde: ${retryMessage}` : 'Erreur sauvegarde');
          return;
        }
      }
      toast.error(message ? `Erreur sauvegarde: ${message}` : 'Erreur sauvegarde');
    }
  };
  const handlePreviewVisibilitySave = async (bienId: string, patch: { visible_sur_site: boolean; ui_config: BienUiConfig | null }) => {
    const currentBien = biens.find((item) => item.id === bienId) || viewingBien;
    if (!currentBien) return;
    try {
      const savedBien = await updateBien({ ...currentBien, ...patch } as any);
      await refreshData();
      const savedVisible = savedBien?.visible_sur_site === 1 || savedBien?.visible_sur_site === true || savedBien?.visible_sur_site === '1';
      const resolvedPatch = {
        visible_sur_site: savedVisible,
        ui_config: savedBien?.ui_config_json && typeof savedBien.ui_config_json === 'string'
          ? JSON.parse(savedBien.ui_config_json)
          : (savedBien?.ui_config || patch.ui_config || null),
      };
      setViewingBien((prev) => prev && prev.id === bienId ? { ...prev, ...resolvedPatch } : prev);
      setEditingBien((prev) => prev && prev.id === bienId ? { ...prev, ...resolvedPatch } : prev);
      if (patch.visible_sur_site !== resolvedPatch.visible_sur_site) {
        toast.info('Le bien a ete sauvegarde hors site. Le mandat proprietaire ne permet pas la publication.');
      } else {
        toast.success('Visibilite mise a jour');
      }
    } catch (error: any) {
      const message = String(error?.message || '').trim();
      toast.error(message ? `Erreur visibilite: ${message}` : 'Erreur visibilite');
    }
  };
  const handleSaveModePriorities = async () => {
    if (!hasValidPrioritySet) {
      toast.error('Choisissez exactement 1, 2 et 3, sans doublon.');
      return;
    }
    try {
      setIsSavingPriorities(true);
      await saveModePriorities(priorityDraft);
      toast.success('Priorites des modes mises a jour');
    } catch (error: any) {
      const message = String(error?.message || '').trim();
      toast.error(message ? `Erreur priorites: ${message}` : 'Erreur priorites');
    } finally {
      setIsSavingPriorities(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div><h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestion des Biens</h1><p className="text-xs sm:text-sm text-gray-500">Gérez votre portefeuille</p></div>
        <button onClick={() => { setEditingBien(null); setEditorInitialStep(1); setIsAddOpen(true); }} className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" /> Nouveau Bien</button>
      </div>
      <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-5 w-5 text-gray-400" /></div><input type="text" className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
        <div className="w-full sm:w-64"><select className="block w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as BienStatut | 'all')}><option value="all">Tous les statuts</option><option value="disponible">Disponible</option><option value="loue">Loué</option><option value="reserve">Réservé</option><option value="maintenance">Maintenance</option><option value="bloque">Bloqué</option></select></div>
      </div>
      <div className="bg-white p-2 sm:p-3 rounded-lg shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-2">
          {modeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setModeFilter(tab.value)}
              className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                modeFilter === tab.value
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-gray-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Priorite des modes sur l'accueil</h2>
            <p className="text-sm text-gray-500">Le mode avec priorite 1 sera affiche en premier sur `https://dwiraimmobilier.com`.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[540px]">
            {([
              { key: 'location_saisonniere', label: 'Location saisonniere' },
              { key: 'vente', label: 'Vente' },
              { key: 'location_annuelle', label: 'Location annuelle' },
            ] as Array<{ key: BienMode; label: string }>).map((item) => (
              <label key={item.key} className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">{item.label}</span>
                <select
                  value={priorityDraft[item.key]}
                  onChange={(event) => setPriorityDraft((prev) => ({ ...prev, [item.key]: Number(event.target.value) }))}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value={1}>Priorite 1</option>
                  <option value={2}>Priorite 2</option>
                  <option value={3}>Priorite 3</option>
                </select>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSaveModePriorities()}
            disabled={isSavingPriorities || !hasValidPrioritySet}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingPriorities ? 'Enregistrement...' : 'Enregistrer les priorites'}
          </button>
        </div>
        {!hasValidPrioritySet && (
          <p className="mt-3 text-sm text-amber-700">
            Les trois modes doivent avoir les priorites 1, 2 et 3, sans doublon.
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {filteredBiens.map((bien) => <BienCard key={bien.id} bien={bien} zones={zoneOptions} onEdit={() => { setEditingBien(bien); setEditorInitialStep(1); setIsAddOpen(true); }} onDelete={() => handleDelete(bien.id)} onView={() => setViewingBien(bien)} />)}
      </div>
      {filteredBiens.length === 0 && <div className="text-center py-12"><Home className="mx-auto h-10 w-10 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">Aucun bien trouvé</h3></div>}
      <Dialog.Root open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setEditorInitialStep(1); }}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" /><Dialog.Content className="fixed inset-0 z-50 w-full h-full bg-white overflow-hidden flex flex-col">
          <Dialog.Description className="sr-only">Formulaire d'ajout ou de modification de bien</Dialog.Description>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center gap-3"><button onClick={() => setIsAddOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><Dialog.Title className="text-lg font-semibold text-gray-900">{editingBien ? 'Modifier le bien' : 'Nouveau bien'}</Dialog.Title></div>
            <button
              onClick={() => {
                const form = document.getElementById('bien-editor-form') as HTMLFormElement | null;
                if (form) form.requestSubmit();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            ><Save className="h-4 w-4" /><span>Sauvegarder</span></button>
          </div>
          <div className="flex-1 overflow-y-auto"><BienEditor initialData={editingBien} initialGeneralStep={editorInitialStep} zones={zoneOptions} proprietaires={proprietaireOptions} existingBiens={biens} onSubmit={handleSave} onCancel={() => setIsAddOpen(false)} /></div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={!!viewingBien} onOpenChange={() => setViewingBien(null)}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" /><Dialog.Content className="fixed inset-0 z-50 w-full h-full bg-white overflow-hidden flex flex-col">
          <Dialog.Description className="sr-only">Apercu du bien</Dialog.Description>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center gap-3"><button onClick={() => setViewingBien(null)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><Dialog.Title className="text-lg font-semibold text-gray-900">Apercu</Dialog.Title></div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setViewingBien(null); if (viewingBien) { setEditingBien(viewingBien); setEditorInitialStep(2); setIsAddOpen(true); } }} className="flex items-center gap-2 px-4 py-2 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50"><span>Modifier visibilite</span></button>
              <button onClick={() => { setViewingBien(null); if (viewingBien) { setEditingBien(viewingBien); setEditorInitialStep(1); setIsAddOpen(true); } }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Edit2 className="h-4 w-4" /><span>Modifier</span></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">{viewingBien && <BienPreview bien={viewingBien} zones={zoneOptions} onSaveVisibility={handlePreviewVisibilitySave} />}</div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={saveSuccessDialogOpen} onOpenChange={setSaveSuccessDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Dialog.Content className="fixed z-[61] left-1/2 top-1/2 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Sauvegarde</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-600">Sauvegarde avec succès.</Dialog.Description>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setSaveSuccessDialogOpen(false)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">OK</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function BienCard({ bien, zones, onEdit, onDelete, onView }: { bien: Bien; zones: Zone[]; onEdit: () => void; onDelete: () => void; onView: () => void; }) {
  const firstImageMedia = (bien.media || []).find((media) => media.type !== 'video');
  const firstVideoMedia = (bien.media || []).find((media) => media.type === 'video');
  const mainImage = resolveMediaUrl(firstImageMedia?.url) || toYouTubeThumbnailUrl(firstVideoMedia?.url) || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800';
  const imageCount = bien.media?.length || 0;
  const terrainMode = bien.terrain_mode_affichage_prix || 'total_et_m2';
  const terrainTotal = Number(bien.terrain_prix_affiche_total ?? bien.prix_affiche_client ?? bien.prix_nuitee ?? 0);
  const terrainParM2 = Number(bien.terrain_prix_affiche_par_m2 ?? 0);
  const displayPrice = bien.mode === 'vente'
    ? (bien.type === 'terrain' && terrainMode === 'm2_uniquement' && terrainParM2 > 0
      ? terrainParM2
      : Number(bien.prix_affiche_client ?? terrainTotal ?? bien.prix_nuitee ?? 0))
    : Number(bien.prix_nuitee || 0);
  const priceSuffix = bien.mode === 'vente'
    ? (bien.type === 'terrain' && terrainMode === 'm2_uniquement' ? '/m2' : '')
    : '/nuit';
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full group">
      <div className="relative h-44 sm:h-48 bg-gray-100 overflow-hidden">
        <img src={mainImage} alt={bien.titre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute top-3 left-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[bien.statut]}`}>{statusLabels[bien.statut]}</span></div>
        {imageCount > 1 && <div className="absolute top-3 right-3 bg-black/50 text-white px-2 py-1 rounded-lg text-xs"><ImageIcon className="h-3 w-3 inline" /> {imageCount}</div>}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button onClick={onView} className="p-2 bg-white rounded-full hover:bg-gray-100"><Eye className="h-4 w-4 text-gray-700" /></button>
          <button onClick={onEdit} className="p-2 bg-white rounded-full hover:bg-gray-100"><Edit2 className="h-4 w-4 text-emerald-600" /></button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3"><p className="text-white font-bold text-lg">{displayPrice} DT{priceSuffix ? <span className="text-xs font-normal text-white/80">{priceSuffix}</span> : null}</p></div>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="mb-3"><h3 className="font-bold text-gray-900 text-base line-clamp-1 mb-1">{bien.titre}</h3><div className="flex items-center gap-1 text-gray-500 text-xs"><MapPin className="h-3 w-3" /><span>{zones.find(z => z.id === bien.zone_id)?.nom || 'Zone Inconnue'}</span></div></div>
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-4"><div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded"><Bed className="h-3 w-3" /><span>{bien.nb_chambres}</span></div><div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded"><Bath className="h-3 w-3" /><span>{bien.nb_salle_bain}</span></div><div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded"><Banknote className="h-3 w-3" /><span>{bien.avance} DT</span></div></div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-4"><span className="px-2 py-1 bg-gray-100 rounded font-medium">{typeLabels[bien.type]}</span><span>Ref: {bien.reference}</span></div>
        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100">
          <button onClick={onView} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium"><Eye className="h-4 w-4" /></button>
          <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium"><Edit2 className="h-4 w-4" /></button>
          <button onClick={onDelete} className="flex-1 flex items-center justify-center p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

function BienEditor({ initialData, zones, proprietaires, existingBiens, onSubmit }: { initialData: Bien | null; zones: Zone[]; proprietaires: Proprietaire[]; existingBiens: Bien[]; onSubmit: (data: Bien) => void | Promise<void>; onCancel: () => void; }) {
  const [activeTab, setActiveTab] = useState<'general' | 'images' | 'calendar'>('general');
  const [generalStep, setGeneralStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [formData, setFormData] = useState<Partial<Bien>>(initialData || { reference: '', titre: '', description: '', mode: 'location_saisonniere' as BienMode, type: 'appartement' as BienType, nb_chambres: 0, nb_salle_bain: 0, prix_nuitee: 0, tarification_methode: 'avec_commission' as TarificationMethodeVente, prix_affiche_client: 0, prix_fixe_proprietaire: 0, prix_final: 0, revenu_agence: 0, commission_pourcentage_proprietaire: DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT, commission_pourcentage_client: DEFAULT_COMMISSION_CLIENT_PERCENT, montant_max_reduction_negociation: 0, prix_minimum_accepte: 0, modalite_paiement_vente: 'comptant' as ModalitePaiementVente, pourcentage_premiere_partie_promesse: DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE, montant_premiere_partie_promesse: 0, montant_deuxieme_partie: 0, nombre_tranches: 6, periode_tranches_mois: 6, montant_par_tranche: 0, avance: 0, caution: 0, type_rue: null, type_papier: null, superficie_m2: null, etage: null, configuration: null, annee_construction: null, distance_plage_m: null, proche_plage: false, chauffage_central: false, climatisation: false, balcon: false, terrasse: false, ascenseur: false, vue_mer: false, gaz_ville: false, cuisine_equipee: false, place_parking: false, syndic: false, meuble: false, independant: false, eau_puits: false, eau_sonede: false, electricite_steg: false, surface_local_m2: null, facade_m: null, hauteur_plafond_m: null, activite_recommandee: null, toilette: false, reserve_local: false, vitrine: false, coin_angle: false, electricite_3_phases: false, alarme: false, type_terrain: null, terrain_facade_m: null, terrain_surface_m2: null, terrain_distance_plage_m: null, terrain_zone: null, terrain_constructible: false, terrain_angle: false, terrain_prix_affiche_total: null, terrain_prix_affiche_par_m2: null, terrain_mode_affichage_prix: 'total_et_m2' as ModeAffichagePrixTerrain, terrain_disponibilite_reseaux: [], terrain_hauteur_construction_autorisee: null, terrain_route_acces_largeur_m: null, terrain_forme: null, terrain_topographie: null, terrain_bornage: false, terrain_travaux_municipalite_autorises: false, terrain_limites_cadastrales: false, terrain_visualisation_limites_cadastrales: false, terrain_voisinage: null, terrain_proximites_commodites: [], terrain_proximites_commodites_autres: null, terrain_viabilisation_eau_sources: [], terrain_viabilisation_onas: null, terrain_viabilisation_steg: null, terrain_viabilisation_gaz_ville: false, terrain_viabilisation_fibre_optique: false, terrain_viabilisation_telephone_fixe: false, terrain_type_sol: null, terrain_vegetation: null, terrain_niveau_sonore: null, terrain_risque_inondation: false, terrain_exposition_vent: null, terrain_ideal_utilisations: [], terrain_documents_disponibles: [], lotissement_nb_terrains: 1, lotissement_prix_total: null, lotissement_mode_prix_m2: 'm2_unique' as ModePrixLotissement, lotissement_prix_m2_unique: null, lotissement_terrains: [], lotissement_paliers_prix_m2: [], immeuble_surface_terrain_m2: null, immeuble_surface_batie_m2: null, immeuble_nb_niveaux: null, immeuble_nb_garages: null, immeuble_nb_appartements: null, immeuble_nb_locaux_commerciaux: null, immeuble_distance_plage_m: null, immeuble_proche_plage: false, immeuble_ascenseur: false, immeuble_parking_sous_sol: false, immeuble_parking_exterieur: false, immeuble_syndic: false, immeuble_vue_mer: false, immeuble_appartements: [], immeuble_garages: [], immeuble_locaux_commerciaux: [], statut: 'disponible' as BienStatut, visible_sur_site: true, ui_config: null, menage_en_cours: false, zone_id: zones[0]?.id || '', proprietaire_id: proprietaires[0]?.id || '' });
  const [zonesOptions, setZonesOptions] = useState<Zone[]>(zones);
  const [proprietaireOptions, setProprietaireOptions] = useState<Proprietaire[]>(proprietaires);
  const [images, setImages] = useState<Media[]>(initialData?.media || []);
  const [unavailableDates, setUnavailableDates] = useState<DateStatus[]>(initialData?.unavailableDates || []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newImageMotif, setNewImageMotif] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showFeaturePanel, setShowFeaturePanel] = useState(false);
  const [newFeature, setNewFeature] = useState('');
  const [newFeatureType, setNewFeatureType] = useState<'simple' | 'choix_multiple' | 'valeur'>('simple');
  const [newFeatureChoices, setNewFeatureChoices] = useState('');
  const [newFeatureUnit, setNewFeatureUnit] = useState('');
  const [newFeatureVisibilite, setNewFeatureVisibilite] = useState<0 | 1>(1);
  const [featureTabs, setFeatureTabs] = useState<CaracteristiqueOnglet[]>([]);
  const [featureTabDrafts, setFeatureTabDrafts] = useState<Record<string, string>>({});
  const [selectedFeatureTabId, setSelectedFeatureTabId] = useState<string>('');
  const [newFeatureTabName, setNewFeatureTabName] = useState('');
  const [featureDrafts, setFeatureDrafts] = useState<Record<string, { nom: string; type_caracteristique: 'simple' | 'choix_multiple' | 'valeur'; choix: string; unite: string; onglet_id: string; visibilite_client: 0 | 1 }>>({});
  const [featureSaving, setFeatureSaving] = useState(false);
  const [availableFeatures, setAvailableFeatures] = useState<Caracteristique[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>(initialData?.caracteristique_ids || []);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddProprietaire, setShowAddProprietaire] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneDescription, setNewZoneDescription] = useState('');
  const [newZoneGoogleMapsUrl, setNewZoneGoogleMapsUrl] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerCin, setNewOwnerCin] = useState('');
  const [draggedImageIndex, setDraggedImageIndex] = useState<string | null>(null);
  const [validationDialogState, setValidationDialogState] = useState<{ open: boolean; issues: ValidationIssue[] }>({ open: false, issues: [] });
  const [validatedSteps, setValidatedSteps] = useState<Set<number>>(new Set(initialData ? [1, 2, 3, 4, 5] : []));
  const [terrainSectionTab, setTerrainSectionTab] = useState<TerrainSectionTab>('informations_generales');
  const [detailSectionTabId, setDetailSectionTabId] = useState<string>('informations_generales');
  const normalizeLegacyType = (value?: BienType): BienType => {
    if (value === 'S1' || value === 'S2' || value === 'S3' || value === 'S4') return 'appartement';
    if (value === 'villa') return 'villa_maison';
    if (value === 'local') return 'local_commercial';
    return (value || 'appartement') as BienType;
  };
  const MODE_REFERENCE_CODES: Record<BienMode, string> = {
    vente: 'VENTE',
    location_annuelle: 'LOCANNUELLE',
    location_saisonniere: 'LOCSAISONNIERE',
  };
  const TYPE_REFERENCE_CODES: Record<BienType, string> = {
    appartement: 'APP',
    villa_maison: 'VILLA',
    studio: 'STU',
    immeuble: 'IMM',
    terrain: 'TER',
    lotissement: 'LOT',
    local_commercial: 'LCOM',
    bungalow: 'BUN',
    S1: 'APP',
    S2: 'APP',
    S3: 'APP',
    S4: 'APP',
    villa: 'VILLA',
    local: 'LOC',
  };
  const TYPE_UNIT_PREFIX: Record<BienType, string> = {
    appartement: 'A',
    villa_maison: 'V',
    studio: 'S',
    immeuble: 'I',
    terrain: 'T',
    lotissement: 'L',
    local_commercial: 'C',
    bungalow: 'B',
    S1: 'A',
    S2: 'A',
    S3: 'A',
    S4: 'A',
    villa: 'V',
    local: 'C',
  };
  const normalizeAnnonceKey = (titre?: string | null, zoneId?: string | null, proprietaireId?: string | null) =>
    `${String(titre || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()}__${String(zoneId || '')}__${String(proprietaireId || '')}`;
  const generateReference = () => {
    const mode = (formData.mode || 'location_saisonniere') as BienMode;
    const type = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const modeCode = MODE_REFERENCE_CODES[mode] || 'MODE';
    const typeCode = TYPE_REFERENCE_CODES[type] || 'TYPE';
    const unitPrefix = TYPE_UNIT_PREFIX[type] || 'U';
    const pattern = new RegExp(`^REF-${modeCode}-${typeCode}-ANN(\\d+)-([A-Z])(\\d+)$`);

    const filtered = existingBiens.filter((bien) => bien.mode === mode && normalizeLegacyType(bien.type) === type && (!initialData || bien.id !== initialData.id));
    let maxAnnonceNumber = 0;
    let annonceNumberForCurrent: number | null = null;
    let maxUnitForCurrentAnnonce = 0;
    const annonceKey = normalizeAnnonceKey(formData.titre, formData.zone_id, formData.proprietaire_id);

    for (const bien of filtered) {
      const parsed = pattern.exec(String(bien.reference || '').trim().toUpperCase());
      if (!parsed) continue;
      const ann = Number(parsed[1] || 0);
      const unit = String(parsed[2] || '');
      const unitNo = Number(parsed[3] || 0);
      maxAnnonceNumber = Math.max(maxAnnonceNumber, ann);
      const bienAnnonceKey = normalizeAnnonceKey(bien.titre, bien.zone_id, bien.proprietaire_id);
      if (bienAnnonceKey === annonceKey) {
        if (!annonceNumberForCurrent) annonceNumberForCurrent = ann;
        if (annonceNumberForCurrent === ann && unit === unitPrefix) {
          maxUnitForCurrentAnnonce = Math.max(maxUnitForCurrentAnnonce, unitNo);
        }
      }
    }

    const annNumber = annonceNumberForCurrent || (maxAnnonceNumber + 1);
    const unitNumber = maxUnitForCurrentAnnonce + 1;
    return `REF-${modeCode}-${typeCode}-ANN${annNumber}-${unitPrefix}${unitNumber}`;
  };
  const normalizeReferenceBase = (value?: string | null) => {
    const base = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    return base || 'REF';
  };
  const generateChildReference = (prefix: 'APT' | 'GAR' | 'LOC' | 'TRN', index: number) =>
    `${normalizeReferenceBase(formData.reference)}-${prefix}${index}`;
  const currentProofTypeRueMotif = buildProofMotif(
    PROOF_MOTIF_TYPE_RUE,
    (formData.mode || 'location_saisonniere') as BienMode,
    normalizeLegacyType((formData.type || 'appartement') as BienType)
  );
  const currentProofTypePapierMotif = buildProofMotif(
    PROOF_MOTIF_TYPE_PAPIER,
    (formData.mode || 'location_saisonniere') as BienMode,
    normalizeLegacyType((formData.type || 'appartement') as BienType)
  );
  const isProofImage = (img: Media) => isProofMotif(img.motif_upload);
  const clientVisibleImages = images.filter((img) => img.type === 'image' && !isProofImage(img));
  const clientVisibleVideos = images.filter((img) => img.type === 'video');
  const typeRueProofImages = images.filter((img) => img.motif_upload === currentProofTypeRueMotif);
  const typePapierProofImages = images.filter((img) => img.motif_upload === currentProofTypePapierMotif);
  const getLotissementTerrainProofs = (
    proofType: typeof PROOF_MOTIF_TYPE_RUE | typeof PROOF_MOTIF_TYPE_PAPIER,
    terrainIndex: number
  ) => {
    const unitKey = `terrain_${terrainIndex}`;
    const motif = buildProofMotif(
      proofType,
      (formData.mode || 'location_saisonniere') as BienMode,
      normalizeLegacyType((formData.type || 'appartement') as BienType),
      unitKey
    );
    return images.filter((img) => img.motif_upload === motif);
  };
  const getImmeubleAppartementProofs = (
    proofType: typeof PROOF_MOTIF_TYPE_RUE | typeof PROOF_MOTIF_TYPE_PAPIER,
    appartementIndex: number
  ) => {
    const unitKey = `appartement_${appartementIndex}`;
    const motif = buildProofMotif(
      proofType,
      (formData.mode || 'location_saisonniere') as BienMode,
      normalizeLegacyType((formData.type || 'appartement') as BienType),
      unitKey
    );
    return images.filter((img) => img.motif_upload === motif);
  };
  const getUnitClientImages = (unitKey: string) => {
    const motif = buildUnitGalleryMotif(
      (formData.mode || 'location_saisonniere') as BienMode,
      normalizeLegacyType((formData.type || 'appartement') as BienType),
      unitKey
    );
    return clientVisibleImages.filter((img) => img.motif_upload === motif);
  };

  useEffect(() => {
    const rawDescription = initialData?.description || '';
    const markerIndex = rawDescription.indexOf(CHARACTERISTICS_MARKER);
    const normalizedType = normalizeLegacyType((initialData?.type || formData.type) as BienType);
    const resolvedMode = (initialData?.mode || 'location_saisonniere') as BienMode;
    const allowedTypes = BIEN_TYPES_BY_MODE[resolvedMode] || BIEN_TYPES_BY_MODE.location_saisonniere;
    if (markerIndex >= 0) {
      const cleanDescription = rawDescription.slice(0, markerIndex).trim();
      setFormData((prev) => ({
        ...prev,
        description: cleanDescription,
        mode: resolvedMode,
        type: allowedTypes.includes(normalizedType) ? normalizedType : allowedTypes[0],
        reference: prev.reference || generateReference(),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        mode: resolvedMode,
        type: allowedTypes.includes(normalizedType) ? normalizedType : allowedTypes[0],
        reference: prev.reference || generateReference(),
      }));
    }
    setSelectedFeatureIds(initialData?.caracteristique_ids || []);
  }, [initialData]);

  useEffect(() => { setZonesOptions(zones); }, [zones]);
  useEffect(() => { setProprietaireOptions(proprietaires); }, [proprietaires]);
  useEffect(() => {
    const currentMode = (formData.mode || 'location_saisonniere') as BienMode;
    if (currentMode === 'vente' && activeTab === 'calendar') {
      setActiveTab('general');
    }
  }, [formData.mode, activeTab]);
  useEffect(() => {
    const currentMode = (formData.mode || 'location_saisonniere') as BienMode;
    const currentType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    if (!(currentMode === 'vente' && currentType === 'terrain')) {
      setTerrainSectionTab('informations_generales');
    }
  }, [formData.mode, formData.type]);
  useEffect(() => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType(formData.type as BienType);
    if (!selectedMode || !selectedType) {
      setAvailableFeatures([]);
      setFeatureTabs([]);
      return;
    }

    void loadAvailableFeatures(selectedMode, selectedType);
    void loadFeatureTabs(selectedMode, selectedType);
  }, [formData.mode, formData.type]);

  useEffect(() => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const isImmeubleModeType = selectedMode === 'vente' && selectedType === 'immeuble';
    const isLotissementModeType = selectedMode === 'vente' && selectedType === 'lotissement';
    const visibleKeys = (Object.keys(UI_SECTION_FEATURE_TAB_DEFINITIONS) as Array<keyof BienUiConfig>)
      .filter((key) => {
        if (key === 'show_immeuble_appartements' && !isImmeubleModeType) return false;
        if (key === 'show_immeuble_garages' && !isImmeubleModeType) return false;
        if (key === 'show_immeuble_locaux_commerciaux' && !isImmeubleModeType) return false;
        if (key === 'show_lotissement_terrains' && !isLotissementModeType) return false;
        return isUiSectionVisible(key);
      });
    if (visibleKeys.length === 0) return;
    void ensureFeatureTabsForCurrentContext(visibleKeys);
  }, [formData.mode, formData.type, formData.ui_config]);

  useEffect(() => {
    const targetCount = Math.max(0, Math.floor(Number(formData.immeuble_nb_appartements || 0)));
    const currentRows = Array.isArray(formData.immeuble_appartements) ? formData.immeuble_appartements : [];
    const needsSync = currentRows.length !== targetCount || currentRows.some((row, idx) => !row?.reference || Number(row?.index || 0) !== (idx + 1));
    if (!needsSync) return;
    const nextRows = [];
    for (let i = 0; i < targetCount; i += 1) {
      const existing = currentRows[i];
      nextRows.push({
        index: i + 1,
        reference: existing?.reference || generateChildReference('APT', i + 1),
        chambres: Number(existing?.chambres || 0),
        salle_bain: Number(existing?.salle_bain || 0),
        superficie_m2: existing?.superficie_m2 ?? null,
        configuration: existing?.configuration || null,
      });
    }
    setFormData((prev) => ({ ...prev, immeuble_appartements: nextRows }));
  }, [formData.immeuble_nb_appartements, formData.reference]);
  useEffect(() => {
    const targetCount = Math.max(0, Math.floor(Number(formData.immeuble_nb_garages || 0)));
    const currentRows = Array.isArray(formData.immeuble_garages) ? formData.immeuble_garages : [];
    const needsSync = currentRows.length !== targetCount || currentRows.some((row, idx) => !row?.reference || Number(row?.index || 0) !== (idx + 1));
    if (!needsSync) return;
    const nextRows = [];
    for (let i = 0; i < targetCount; i += 1) {
      const existing = currentRows[i];
      nextRows.push({
        index: i + 1,
        reference: existing?.reference || generateChildReference('GAR', i + 1),
      });
    }
    setFormData((prev) => ({ ...prev, immeuble_garages: nextRows }));
  }, [formData.immeuble_nb_garages, formData.reference]);
  useEffect(() => {
    const targetCount = Math.max(0, Math.floor(Number(formData.immeuble_nb_locaux_commerciaux || 0)));
    const currentRows = Array.isArray(formData.immeuble_locaux_commerciaux) ? formData.immeuble_locaux_commerciaux : [];
    const needsSync = currentRows.length !== targetCount || currentRows.some((row, idx) => !row?.reference || Number(row?.index || 0) !== (idx + 1));
    if (!needsSync) return;
    const nextRows = [];
    for (let i = 0; i < targetCount; i += 1) {
      const existing = currentRows[i];
      nextRows.push({
        index: i + 1,
        reference: existing?.reference || generateChildReference('LOC', i + 1),
      });
    }
    setFormData((prev) => ({ ...prev, immeuble_locaux_commerciaux: nextRows }));
  }, [formData.immeuble_nb_locaux_commerciaux, formData.reference]);
  useEffect(() => {
    const targetCount = Math.max(1, Math.floor(Number(formData.lotissement_nb_terrains || 1)));
    const currentRows = Array.isArray(formData.lotissement_terrains) ? formData.lotissement_terrains : [];
    const needsSync = currentRows.length !== targetCount || currentRows.some((row, idx) => !row?.reference || Number(row?.index || 0) !== (idx + 1));
    if (!needsSync) return;
    const nextRows = [];
    for (let i = 0; i < targetCount; i += 1) {
      const existing = currentRows[i];
      nextRows.push({
        index: i + 1,
        reference: existing?.reference || generateChildReference('TRN', i + 1),
        type_terrain: (existing?.type_terrain || null),
        surface_m2: existing?.surface_m2 ?? null,
        type_rue: (existing?.type_rue || null),
        type_papier: (existing?.type_papier || null),
        terrain_zone: existing?.terrain_zone || null,
        terrain_distance_plage_m: existing?.terrain_distance_plage_m ?? null,
        terrain_constructible: !!existing?.terrain_constructible,
        terrain_angle: !!existing?.terrain_angle,
      });
    }
    setFormData((prev) => ({ ...prev, lotissement_terrains: nextRows }));
  }, [formData.lotissement_nb_terrains, formData.reference]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, motifOverride?: string | null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const isLocalCommercial = selectedType === 'local_commercial';
    const resolvedMotif = motifOverride ?? (isLocalCommercial ? newImageMotif.trim() : null);
    if (isLocalCommercial && !resolvedMotif) {
      toast.error("Motif d'upload requis pour le local");
      e.target.value = '';
      return;
    }
    setUploading(true);
    const uploadFormData = new FormData();
    uploadFormData.append('image', file);
    try {
      const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: uploadFormData });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      const newMedia: Media = {
        id: Math.random().toString(36).substr(2, 9),
        bien_id: '',
        type: 'image',
        url: data.url,
        motif_upload: resolvedMotif,
      };
      setImages([...images, newMedia]);
      if (isLocalCommercial && !motifOverride) setNewImageMotif('');
      toast.success('Image uploadée');
    } catch { toast.error('Erreur upload'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleProofFileUpload = async (
    proofType: typeof PROOF_MOTIF_TYPE_RUE | typeof PROOF_MOTIF_TYPE_PAPIER,
    e: React.ChangeEvent<HTMLInputElement>,
    unitKey?: string
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    try {
      for (const file of files) {
        const uploadFormData = new FormData();
        uploadFormData.append('image', file);
        const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: uploadFormData });
        if (!response.ok) {
          continue;
        }
        const data = await response.json();
        const newMedia: Media = {
          id: Math.random().toString(36).substr(2, 9),
          bien_id: formData.id || '',
          type: 'image',
          url: data.url,
          motif_upload: buildProofMotif(
            proofType,
            (formData.mode || 'location_saisonniere') as BienMode,
            normalizeLegacyType((formData.type || 'appartement') as BienType),
            unitKey
          ),
        };
        setImages((prev) => [...prev, newMedia]);
        successCount += 1;
      }
      if (successCount > 0) {
        toast.success(`${successCount} preuve(s) uploadee(s)`);
      } else {
        toast.error('Erreur upload');
      }
    } catch {
      toast.error('Erreur upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const optionalNumericFields = ['superficie_m2', 'etage', 'annee_construction', 'distance_plage_m', 'surface_local_m2', 'facade_m', 'hauteur_plafond_m', 'terrain_facade_m', 'terrain_surface_m2', 'terrain_distance_plage_m', 'terrain_prix_affiche_total', 'terrain_prix_affiche_par_m2', 'terrain_route_acces_largeur_m', 'lotissement_nb_terrains', 'lotissement_prix_total', 'lotissement_prix_m2_unique', 'immeuble_surface_terrain_m2', 'immeuble_surface_batie_m2', 'immeuble_nb_niveaux', 'immeuble_nb_garages', 'immeuble_nb_appartements', 'immeuble_nb_locaux_commerciaux', 'immeuble_distance_plage_m', 'prix_affiche_client', 'prix_fixe_proprietaire', 'commission_pourcentage_proprietaire', 'commission_pourcentage_client', 'montant_max_reduction_negociation', 'pourcentage_premiere_partie_promesse', 'nombre_tranches', 'periode_tranches_mois'];
    if (name === 'mode') {
      const nextMode = value as BienMode;
      const allowedTypes = BIEN_TYPES_BY_MODE[nextMode] || BIEN_TYPES_BY_MODE.location_saisonniere;
      setFormData((prev) => {
        const currentType = normalizeLegacyType(prev.type as BienType);
        const nextType = allowedTypes.includes(currentType) ? currentType : allowedTypes[0];
        const keepAppartementVenteDetails = nextMode === 'vente' && nextType === 'appartement';
        const keepLocalCommercialVenteDetails = nextMode === 'vente' && nextType === 'local_commercial';
        const keepTerrainVenteDetails = nextMode === 'vente' && nextType === 'terrain';
        const keepLotissementVenteDetails = nextMode === 'vente' && nextType === 'lotissement';
        const keepImmeubleVenteDetails = nextMode === 'vente' && nextType === 'immeuble';
        const next = {
          ...prev,
          mode: nextMode,
          type: nextType,
          type_rue: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails || keepLotissementVenteDetails) ? prev.type_rue || null : null,
          type_papier: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails || keepLotissementVenteDetails) ? prev.type_papier || null : null,
        };
        if (keepAppartementVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(next))));
        if (keepLocalCommercialVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetAppartementVenteFields(next))));
        if (keepTerrainVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        if (keepLotissementVenteDetails) return resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        if (keepImmeubleVenteDetails) return resetLotissementVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next)))));
      });
      return;
    }
    if (name === 'type') {
      const nextType = normalizeLegacyType(value as BienType);
      setFormData((prev) => {
        const keepAppartementVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'appartement';
        const keepLocalCommercialVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'local_commercial';
        const keepTerrainVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'terrain';
        const keepLotissementVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'lotissement';
        const keepImmeubleVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'immeuble';
        const next = {
          ...prev,
          type: nextType,
          type_rue: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails || keepLotissementVenteDetails) ? prev.type_rue || null : null,
          type_papier: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails || keepLotissementVenteDetails) ? prev.type_papier || null : null,
        };
        if (keepAppartementVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(next))));
        if (keepLocalCommercialVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetAppartementVenteFields(next))));
        if (keepTerrainVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        if (keepLotissementVenteDetails) return resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        if (keepImmeubleVenteDetails) return resetLotissementVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next)))));
      });
      return;
    }
    if (optionalNumericFields.includes(name)) {
      setFormData(prev => ({ ...prev, [name]: value === '' ? null : Number(value) }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };
  const resetAppartementVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    superficie_m2: null,
    etage: null,
    configuration: null,
    annee_construction: null,
    distance_plage_m: null,
    proche_plage: false,
    chauffage_central: false,
    climatisation: false,
    balcon: false,
    terrasse: false,
    ascenseur: false,
    vue_mer: false,
    gaz_ville: false,
    cuisine_equipee: false,
    place_parking: false,
    syndic: false,
    meuble: false,
    independant: false,
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const resetLocalCommercialVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    surface_local_m2: null,
    facade_m: null,
    hauteur_plafond_m: null,
    activite_recommandee: null,
    toilette: false,
    reserve_local: false,
    vitrine: false,
    coin_angle: false,
    electricite_3_phases: false,
    gaz_ville: false,
    alarme: false,
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const resetTerrainVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    type_terrain: null,
    terrain_facade_m: null,
    terrain_surface_m2: null,
    terrain_distance_plage_m: null,
    terrain_zone: null,
    terrain_constructible: false,
    terrain_angle: false,
    terrain_prix_affiche_total: null,
    terrain_prix_affiche_par_m2: null,
    terrain_mode_affichage_prix: null,
    terrain_disponibilite_reseaux: [],
    terrain_hauteur_construction_autorisee: null,
    terrain_route_acces_largeur_m: null,
    terrain_forme: null,
    terrain_topographie: null,
    terrain_bornage: false,
    terrain_travaux_municipalite_autorises: false,
    terrain_limites_cadastrales: false,
    terrain_visualisation_limites_cadastrales: false,
    terrain_voisinage: null,
    terrain_proximites_commodites: [],
    terrain_proximites_commodites_autres: null,
    terrain_viabilisation_eau_sources: [],
    terrain_viabilisation_onas: null,
    terrain_viabilisation_steg: null,
    terrain_viabilisation_gaz_ville: false,
    terrain_viabilisation_fibre_optique: false,
    terrain_viabilisation_telephone_fixe: false,
    terrain_type_sol: null,
    terrain_vegetation: null,
    terrain_niveau_sonore: null,
    terrain_risque_inondation: false,
    terrain_exposition_vent: null,
    terrain_ideal_utilisations: [],
    terrain_documents_disponibles: [],
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const resetLotissementVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    lotissement_nb_terrains: null,
    lotissement_prix_total: null,
    lotissement_mode_prix_m2: null,
    lotissement_prix_m2_unique: null,
    lotissement_terrains: [],
    lotissement_paliers_prix_m2: [],
  });
  const resetImmeubleVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    immeuble_surface_terrain_m2: null,
    immeuble_surface_batie_m2: null,
    immeuble_nb_niveaux: null,
    immeuble_nb_garages: null,
    immeuble_nb_appartements: null,
    immeuble_nb_locaux_commerciaux: null,
    immeuble_distance_plage_m: null,
    immeuble_proche_plage: false,
    immeuble_ascenseur: false,
    immeuble_parking_sous_sol: false,
    immeuble_parking_exterieur: false,
    immeuble_syndic: false,
    immeuble_vue_mer: false,
    immeuble_appartements: [],
    immeuble_garages: [],
    immeuble_locaux_commerciaux: [],
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }));
  const updateUiConfig = (patch: Partial<BienUiConfig>) =>
    setFormData((prev) => ({ ...prev, ui_config: { ...(prev.ui_config || {}), ...patch } }));
  const setUiSectionVisible = (key: keyof BienUiConfig, checked: boolean) =>
    updateUiConfig({ [key]: checked } as Partial<BienUiConfig>);
  const getFeatureTabApiBases = () => Array.from(new Set([
    `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique-onglets`,
    `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique-onglets`,
  ]));
  const setTerrainTabVisible = (tabId: string, checked: boolean) =>
    setFormData((prev) => ({
      ...prev,
      ui_config: {
        ...(prev.ui_config || {}),
        terrain_tabs: {
          ...((prev.ui_config && prev.ui_config.terrain_tabs) || {}),
          [tabId]: checked,
        },
      },
    }));
  type TerrainMultiField =
    | 'terrain_disponibilite_reseaux'
    | 'terrain_proximites_commodites'
    | 'terrain_viabilisation_eau_sources'
    | 'terrain_ideal_utilisations'
    | 'terrain_documents_disponibles';
  const handleMultiSelectChange = (field: keyof Bien, values: string[]) => {
    setFormData((prev) => ({ ...prev, [field]: values }));
  };
  const handleTerrainMultiToggle = (field: TerrainMultiField, value: string, checked: boolean) => {
    const currentValues = Array.isArray(formData[field]) ? (formData[field] as string[]) : [];
    const nextValues = checked
      ? Array.from(new Set([...currentValues, value]))
      : currentValues.filter((item) => item !== value);
    handleMultiSelectChange(field, nextValues);
  };
  const renderTerrainMultiChoice = (
    field: TerrainMultiField,
    label: string,
    options: readonly { value: string; label: string }[],
    helperText?: string
  ) => {
    const selectedValues = Array.isArray(formData[field]) ? (formData[field] as string[]) : [];
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="rounded-lg border border-gray-300 p-2 bg-white">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedValues.length > 0 ? selectedValues.map((selectedValue) => {
              const optionLabel = options.find((option) => option.value === selectedValue)?.label || selectedValue;
              return (
                <button
                  key={selectedValue}
                  type="button"
                  onClick={() => handleTerrainMultiToggle(field, selectedValue, false)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-emerald-200 text-emerald-700 bg-emerald-50"
                  title="Retirer"
                >
                  <span>{optionLabel}</span>
                  <span aria-hidden="true">x</span>
                </button>
              );
            }) : <span className="text-xs text-gray-500">Aucune selection</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {options.map((option) => (
              <label key={option.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option.value)}
                  onChange={(e) => handleTerrainMultiToggle(field, option.value, e.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        {helperText && <p className="text-xs text-gray-500 mt-1">{helperText}</p>}
      </div>
    );
  };
  const handleBooleanSelectChange = (field: keyof Bien, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value === 'oui' }));
  };
  const getBooleanSelectValue = (value?: boolean) => (value ? 'oui' : 'non');
  const handleImmeubleAppartementChange = (index: number, field: 'chambres' | 'salle_bain' | 'superficie_m2' | 'configuration', value: string) => {
    const rows = Array.isArray(formData.immeuble_appartements) ? [...formData.immeuble_appartements] : [];
    const current = rows[index] || { index: index + 1, reference: generateChildReference('APT', index + 1), chambres: 0, salle_bain: 0, superficie_m2: null, configuration: null };
    if (field === 'configuration') {
      rows[index] = { ...current, configuration: value || null };
    } else if (field === 'superficie_m2') {
      rows[index] = { ...current, superficie_m2: value === '' ? null : Number(value) };
    } else {
      rows[index] = { ...current, [field]: Math.max(0, Number(value || 0)) } as any;
    }
    setFormData((prev) => ({ ...prev, immeuble_appartements: rows }));
  };
  const handleLotissementTerrainChange = (index: number, field: string, value: string | boolean) => {
    const rows = Array.isArray(formData.lotissement_terrains) ? [...formData.lotissement_terrains] : [];
    const current = rows[index] || { index: index + 1, reference: generateChildReference('TRN', index + 1) };
    const numericFields = ['surface_m2', 'terrain_distance_plage_m'];
    const nextValue = numericFields.includes(field as string)
      ? (value === '' ? null : Number(value))
      : value;
    rows[index] = { ...current, [field]: nextValue };
    setFormData((prev) => ({ ...prev, lotissement_terrains: rows }));
  };
  const handleLotissementPalierChange = (index: number, field: 'min_m2' | 'max_m2' | 'prix_m2', value: string) => {
    const rows = Array.isArray(formData.lotissement_paliers_prix_m2) ? [...formData.lotissement_paliers_prix_m2] : [];
    const current = rows[index] || { min_m2: 0, max_m2: null, prix_m2: 0 };
    rows[index] = { ...current, [field]: value === '' ? null : Number(value) } as any;
    setFormData((prev) => ({ ...prev, lotissement_paliers_prix_m2: rows }));
  };
  const addLotissementPalier = () => {
    setFormData((prev) => ({
      ...prev,
      lotissement_paliers_prix_m2: [...(prev.lotissement_paliers_prix_m2 || []), { min_m2: 0, max_m2: null, prix_m2: 0 }],
    }));
  };
  const removeLotissementPalier = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      lotissement_paliers_prix_m2: (prev.lotissement_paliers_prix_m2 || []).filter((_, idx) => idx !== index),
    }));
  };

  const handleAddImage = (motifOverride?: string | null) => {
    if (!newImageUrl.trim()) return;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const isLocalCommercial = selectedType === 'local_commercial';
    const resolvedMotif = motifOverride ?? (isLocalCommercial ? newImageMotif.trim() : null);
    if (isLocalCommercial && !resolvedMotif) {
      return toast.error("Motif d'upload requis pour le local");
    }
    const newMedia: Media = {
      id: Math.random().toString(36).substr(2, 9),
      bien_id: formData.id || '',
      type: 'image',
      url: newImageUrl,
      motif_upload: resolvedMotif,
    };
    setImages([...images, newMedia]);
    setNewImageUrl('');
    if (isLocalCommercial && !motifOverride) setNewImageMotif('');
    toast.success('Image ajoutée');
  };

  const handleAddVideo = () => {
    if (!newVideoUrl.trim()) return;
    if (!isYouTubeUrl(newVideoUrl)) {
      toast.error('Ajoutez un lien YouTube valide');
      return;
    }
    const newMedia: Media = {
      id: Math.random().toString(36).substr(2, 9),
      bien_id: formData.id || '',
      type: 'video',
      url: newVideoUrl.trim(),
      motif_upload: null,
    };
    setImages([...images, newMedia]);
    setNewVideoUrl('');
    toast.success('Vidéo ajoutée');
  };

  const handleRemoveImage = (id: string) => { setImages(images.filter(img => img.id !== id)); toast.success('Média supprimé'); };

  const reorderClientImages = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const clientImages = images.filter((img) => img.type === 'image' && !isProofImage(img));
    const fromIndex = clientImages.findIndex((img) => img.id === fromId);
    const toIndex = clientImages.findIndex((img) => img.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextClientImages = [...clientImages];
    const [movedImage] = nextClientImages.splice(fromIndex, 1);
    nextClientImages.splice(toIndex, 0, movedImage);
    let clientCursor = 0;
    setImages(images.map((img) => (isProofImage(img) || img.type === 'video' ? img : nextClientImages[clientCursor++])));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, imageId: string) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    setDraggedImageIndex(imageId);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleDrop = (targetId: string) => {
    if (draggedImageIndex === null) return;
    reorderClientImages(draggedImageIndex, targetId);
    setDraggedImageIndex(null);
  };
  const handleDragEnd = () => setDraggedImageIndex(null);

  const handleMoveImage = (imageId: string, direction: 'up' | 'down') => {
    const index = clientVisibleImages.findIndex((img) => img.id === imageId);
    if (index < 0) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= clientVisibleImages.length) return;
    reorderClientImages(imageId, clientVisibleImages[newIndex].id);
  };

  const handleSetMainImage = (index: number) => {
    if (index === 0) return;
    const newImages = [...clientVisibleImages];
    const [movedImage] = newImages.splice(index, 1);
    newImages.unshift(movedImage);
    let clientCursor = 0;
    setImages(images.map((img) => (isProofImage(img) || img.type === 'video' ? img : newImages[clientCursor++])));
    toast.success('Image principale définie');
  };


  const renderTypeProofUploads = () => (
    <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-3 sm:p-4">
      <h5 className="text-sm font-semibold text-gray-800">Preuves (optionnel)</h5>
      <p className="text-xs text-gray-500 mt-1">Vous pouvez ajouter des images de preuve pour le type de rue et le type de papier de ce bien.</p>
      <p className="text-xs text-gray-500 mt-1">Contexte: {(formData.mode || 'location_saisonniere')} / {normalizeLegacyType((formData.type || 'appartement') as BienType)}</p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Upload className="h-4 w-4 text-emerald-600" />
            <span>Preuve type de rue</span>
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_RUE, e)}
            disabled={uploading}
            className="block w-full text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            {typeRueProofImages.map((img) => (
              <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                    <img src={resolveMediaUrl(img.url)} alt="Preuve type de rue" className="w-full h-20 object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(img.id)}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
                  aria-label="Supprimer preuve type de rue"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {typeRueProofImages.length === 0 && <span className="text-xs text-gray-500 col-span-full">Aucune preuve type de rue</span>}
          </div>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Upload className="h-4 w-4 text-emerald-600" />
            <span>Preuve type de papier</span>
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_PAPIER, e)}
            disabled={uploading}
            className="block w-full text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            {typePapierProofImages.map((img) => (
              <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                    <img src={resolveMediaUrl(img.url)} alt="Preuve type de papier" className="w-full h-20 object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(img.id)}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
                  aria-label="Supprimer preuve type de papier"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {typePapierProofImages.length === 0 && <span className="text-xs text-gray-500 col-span-full">Aucune preuve type de papier</span>}
          </div>
        </div>
      </div>
      {uploading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600 mt-3"></div>}
    </div>
  );

  const getFeatureApiBases = () => Array.from(new Set([
    `${String(API_URL || '').replace(/\/+$/, '')}/caracteristiques`,
    `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique`,
    `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristiques`,
    `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique`,
  ]));

  const loadFeatureTabs = async (mode: BienMode, type: BienType) => {
    const tabApiBases = getFeatureTabApiBases();
    let lastResponse: Response | null = null;
    for (const base of tabApiBases) {
      const response = await fetch(`${base}?mode_bien=${mode}&type_bien=${type}`);
      lastResponse = response;
      if (response.ok) {
        const rows = await response.json();
        const nextTabs = Array.isArray(rows) ? rows : [];
        setFeatureTabs(nextTabs);
        setFeatureTabDrafts((prev) => {
          const nextDrafts: Record<string, string> = {};
          for (const tab of nextTabs) nextDrafts[tab.id] = prev[tab.id] ?? String(tab.nom || '');
          return nextDrafts;
        });
        if (nextTabs.length > 0) {
          const hasCurrent = nextTabs.some((tab: CaracteristiqueOnglet) => tab.id === selectedFeatureTabId);
          if (!hasCurrent) setSelectedFeatureTabId(nextTabs[0].id);
        } else {
          setSelectedFeatureTabId('');
        }
        return nextTabs as CaracteristiqueOnglet[];
      }
      if (response.status !== 404) break;
    }
    if (lastResponse && !lastResponse.ok) {
      setFeatureTabs([]);
      setSelectedFeatureTabId('');
    }
    return [] as CaracteristiqueOnglet[];
  };

  const loadAvailableFeatures = async (mode: BienMode, type: BienType) => {
    const featureApiBases = getFeatureApiBases();
    const fetchFromFeatureApi = async (
      buildUrl: (base: string) => string,
      init?: RequestInit
    ) => {
      let lastResponse: Response | null = null;
      for (const base of featureApiBases) {
        const response = await fetch(buildUrl(base), init);
        lastResponse = response;
        if (response.ok) return response;
        if (response.status !== 404) return response;
      }
      return lastResponse;
    };
    try {
      const bienIdQuery = initialData?.id ? `&bien_id=${encodeURIComponent(initialData.id)}` : '';
      const response = await fetchFromFeatureApi(
        (base) => `${base}?mode_bien=${mode}&type_bien=${type}${bienIdQuery}`
      );
      if (!response || !response.ok) throw new Error('Failed to fetch features');
      const rows = await response.json();
      const nextFeaturesRaw = Array.isArray(rows) ? rows : [];
      const seenNames = new Set<string>();
      const dedupedFeatures = nextFeaturesRaw.filter((f: Caracteristique) => {
        const normalizedName = normalizeFeatureName(f.nom || '');
        if (seenNames.has(normalizedName)) return false;
        seenNames.add(normalizedName);
        return true;
      });
      const nextFeatures = dedupedFeatures;
      setAvailableFeatures(nextFeatures);
      const nextFeatureIds = new Set(nextFeatures.map((f: Caracteristique) => f.id));
      setSelectedFeatureIds((prev) => prev.filter((id) => nextFeatureIds.has(id)));
      setFeatureDrafts((prev) => {
        const nextDrafts: Record<string, { nom: string; type_caracteristique: 'simple' | 'choix_multiple' | 'valeur'; choix: string; unite: string; onglet_id: string; visibilite_client: 0 | 1 }> = {};
        for (const feature of nextFeatures) {
          nextDrafts[feature.id] = {
            nom: feature.nom || '',
            type_caracteristique: feature.type_caracteristique === 'valeur'
              ? 'valeur'
              : feature.type_caracteristique === 'choix_multiple'
                ? 'choix_multiple'
                : 'simple',
            choix: stringifyFeatureChoices(feature.choix_json),
            unite: feature.unite || '',
            onglet_id: feature.onglet_id || '',
            visibilite_client: Number(feature.visibilite_client) === 0 ? 0 : 1,
          };
        }
        return { ...prev, ...nextDrafts };
      });
      return nextFeatures;
    } catch {
      setAvailableFeatures([]);
      return [];
    }
  };

  const handleAddFeature = async () => {
    const featureApiBases = getFeatureApiBases();
    const fetchFromFeatureApi = async (
      buildUrl: (base: string) => string,
      init?: RequestInit
    ) => {
      let lastResponse: Response | null = null;
      for (const base of featureApiBases) {
        const response = await fetch(buildUrl(base), init);
        lastResponse = response;
        if (response.ok) return response;
        if (response.status !== 404) return response;
      }
      return lastResponse;
    };
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const value = newFeature.trim();
    const parsedChoices = parseFeatureChoices(newFeatureChoices);
    const parsedUnit = newFeatureUnit.trim();
    if (!value) return toast.error('Nom de caracteristique requis');
    const normalizedValue = normalizeFeatureName(value);
    if (APPARTEMENT_VENTE_DETAIL_FEATURES.has(normalizedValue)) return;
    if (LOCAL_COMMERCIAL_VENTE_DETAIL_FEATURES.has(normalizedValue)) return;
    if (TERRAIN_VENTE_DETAIL_FEATURES.has(normalizedValue)) return;
    if (IMMEUBLE_VENTE_DETAIL_FEATURES.has(normalizedValue)) return;
    if (availableFeatures.some((feature) => normalizeFeatureName(feature.nom || '') === normalizedValue)) {
      return toast.error('Caracteristique deja existante');
    }
    if (newFeatureType === 'valeur' && !parsedUnit) {
      return toast.error('Unite requise pour type valeur');
    }
    if (newFeatureType === 'choix_multiple' && parsedChoices.length === 0) {
      return toast.error('Ajoutez au moins un choix');
    }
    setFeatureSaving(true);
    try {
      const response = await fetchFromFeatureApi((base) => base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: value,
          mode_bien: selectedMode,
          type_bien: selectedType,
          type_caracteristique: newFeatureType,
          choix: newFeatureType === 'choix_multiple' ? parsedChoices : [],
          unite: newFeatureType === 'valeur' ? parsedUnit : null,
          onglet_id: selectedFeatureTabId || null,
          visibilite_client: newFeatureVisibilite,
        }),
      });
      if (!response || !response.ok) throw new Error('Failed to create feature');
      const createdFeature = await response.json();
      await loadAvailableFeatures(selectedMode, selectedType);
      if (createdFeature?.id) {
        setSelectedFeatureIds((prev) => (prev.includes(createdFeature.id) ? prev : [...prev, createdFeature.id]));
      }
      setNewFeature('');
      setNewFeatureType('simple');
      setNewFeatureChoices('');
      setNewFeatureUnit('');
      setNewFeatureVisibilite(1);
      toast.success('Caracteristique ajoutee');
    } catch {
      toast.error('Erreur ajout caracteristique');
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleRemoveFeature = async (feature: Caracteristique) => {
    const featureApiBases = Array.from(new Set([
      `${String(API_URL || '').replace(/\/+$/, '')}/caracteristiques`,
      `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique`,
      `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristiques`,
      `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique`,
    ]));
    const fetchFromFeatureApi = async (
      buildUrl: (base: string) => string,
      init?: RequestInit
    ) => {
      let lastResponse: Response | null = null;
      for (const base of featureApiBases) {
        const response = await fetch(buildUrl(base), init);
        lastResponse = response;
        if (response.ok) return response;
        if (response.status !== 404) return response;
      }
      return lastResponse;
    };
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    setFeatureSaving(true);
    try {
      const response = await fetchFromFeatureApi(
        (base) => `${base}/${encodeURIComponent(feature.id)}?mode_bien=${selectedMode}&type_bien=${selectedType}`,
        { method: 'DELETE' }
      );
      if (!response || !response.ok) {
        const responseStatus = response?.status ?? 0;
        const responseText = response ? await response.text().catch(() => '') : '';
        if (responseStatus === 404 && responseText.includes('Cannot DELETE')) {
          toast.error("Suppression indisponible sur ce backend. Redemarrer l'API serveur.");
          return;
        }
        throw new Error(`Failed to delete feature: ${responseStatus}`);
      }
      setSelectedFeatureIds((prev) => prev.filter((id) => id !== feature.id));
      await loadAvailableFeatures(selectedMode, selectedType);
      toast.success('Caracteristique supprimee');
    } catch {
      toast.error('Erreur suppression caracteristique (verifier API/restart backend)');
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleCreateFeatureTab = async () => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const tabName = newFeatureTabName.trim();
    if (!tabName) return toast.error("Nom d'onglet requis");
    setFeatureSaving(true);
    try {
      const tabApiBases = Array.from(new Set([
        `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique-onglets`,
        `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique-onglets`,
      ]));
      let response: Response | null = null;
      for (const base of tabApiBases) {
        const next = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode_bien: selectedMode,
            type_bien: selectedType,
            nom: tabName,
          }),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) throw new Error('Failed to create tab');
      const created = await response.json();
      await loadFeatureTabs(selectedMode, selectedType);
      if (created?.id) setSelectedFeatureTabId(created.id);
      setNewFeatureTabName('');
      toast.success('Onglet ajoute');
    } catch {
      toast.error("Erreur ajout onglet");
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleDeleteFeatureTab = async (tab: CaracteristiqueOnglet) => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    setFeatureSaving(true);
    try {
      const tabApiBases = Array.from(new Set([
        `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique-onglets`,
        `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique-onglets`,
      ]));
      let response: Response | null = null;
      for (const base of tabApiBases) {
        const next = await fetch(`${base}/${encodeURIComponent(tab.id)}`, { method: 'DELETE' });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) throw new Error('Failed to delete tab');
      await loadFeatureTabs(selectedMode, selectedType);
      await loadAvailableFeatures(selectedMode, selectedType);
      toast.success('Onglet supprime');
    } catch {
      toast.error("Erreur suppression onglet");
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleUpdateFeatureTab = async (tab: CaracteristiqueOnglet) => {
    const nextName = String(featureTabDrafts[tab.id] || '').trim();
    if (!nextName) return toast.error("Nom d'onglet requis");
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    setSelectedFeatureTabId(tab.id);
    setFeatureSaving(true);
    try {
      const tabApiBases = Array.from(new Set([
        `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique-onglets`,
        `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique-onglets`,
      ]));
      let response: Response | null = null;
      for (const base of tabApiBases) {
        const next = await fetch(`${base}/${encodeURIComponent(tab.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: nextName, ordre: tab.ordre || 999 }),
        });
        response = next;
        if (next.ok) break;
        if (next.status === 404) {
          const fallback = await fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: tab.id,
              mode_bien: selectedMode,
              type_bien: selectedType,
              nom: nextName,
              ordre: tab.ordre || 999,
            }),
          });
          response = fallback;
          if (fallback.ok || fallback.status !== 404) break;
        } else {
          break;
        }
      }
      if (!response || !response.ok) throw new Error('Failed to update tab');
      await loadFeatureTabs(selectedMode, selectedType);
      await loadAvailableFeatures(selectedMode, selectedType);
      setSelectedFeatureTabId(tab.id);
      toast.success('Onglet modifie');
    } catch {
      toast.error("Erreur modification onglet");
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleFeatureDraftChange = (featureId: string, patch: Partial<{ nom: string; type_caracteristique: 'simple' | 'choix_multiple' | 'valeur'; choix: string; unite: string; onglet_id: string; visibilite_client: 0 | 1 }>) => {
    setFeatureDrafts((prev) => ({
      ...prev,
      [featureId]: {
        nom: prev[featureId]?.nom || '',
        type_caracteristique: prev[featureId]?.type_caracteristique || 'simple',
        choix: prev[featureId]?.choix || '',
        unite: prev[featureId]?.unite || '',
        onglet_id: prev[featureId]?.onglet_id || '',
        visibilite_client: prev[featureId]?.visibilite_client ?? 1,
        ...patch,
      },
    }));
  };

  const handleUpdateFeature = async (feature: Caracteristique) => {
    return handleUpdateFeatureWithScope(feature, false);
  };

  const handleUpdateFeatureWithScope = async (feature: Caracteristique, applyToAll: boolean) => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const draft = featureDrafts[feature.id];
    if (!draft) return;
    const normalizedName = String(draft.nom || '').trim();
    const normalizedChoices = parseFeatureChoices(draft.choix);
    const normalizedUnit = String(draft.unite || '').trim();
    if (!normalizedName) return toast.error('Nom requis');
    if (draft.type_caracteristique === 'valeur' && !normalizedUnit) {
      return toast.error('Unite requise');
    }
    if (draft.type_caracteristique === 'choix_multiple' && normalizedChoices.length === 0) {
      return toast.error('Ajoutez au moins un choix');
    }
    setFeatureSaving(true);
    try {
      const featureApiBases = getFeatureApiBases();
      let response: Response | null = null;
      for (const base of featureApiBases) {
        const next = await fetch(`${base}/${encodeURIComponent(feature.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode_bien: selectedMode,
            type_bien: selectedType,
            bien_id: initialData?.id || null,
            apply_to_all: applyToAll,
            nom: normalizedName,
            type_caracteristique: draft.type_caracteristique,
            choix: draft.type_caracteristique === 'choix_multiple' ? normalizedChoices : [],
            unite: draft.type_caracteristique === 'valeur' ? normalizedUnit : null,
            onglet_id: draft.onglet_id || null,
            visibilite_client: draft.visibilite_client,
          }),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) throw new Error('Failed to update feature');
      const nextFeatures = await loadAvailableFeatures(selectedMode, selectedType);
      const updatedFeature = Array.isArray(nextFeatures) ? nextFeatures.find((item) => item.id === feature.id) : null;
      if (updatedFeature && (Number(updatedFeature.visibilite_client) === 0 ? 0 : 1) !== draft.visibilite_client) {
        throw new Error('Feature visibility mismatch after reload');
      }
      toast.success(applyToAll ? 'Caracteristique appliquee a tous les biens' : 'Caracteristique mise a jour');
    } catch {
      toast.error("Modification non persistée. Vérifier que l'API/backend déployé contient bien la logique d'override par bien.");
    } finally {
      setFeatureSaving(false);
    }
  };

  const savePendingFeatureDrafts = async (mode: BienMode, type: BienType) => {
    const featureApiBases = getFeatureApiBases();
    for (const feature of availableFeatures) {
      const draft = featureDrafts[feature.id];
      if (!draft) continue;
      const currentType = feature.type_caracteristique === 'valeur'
        ? 'valeur'
        : feature.type_caracteristique === 'choix_multiple'
          ? 'choix_multiple'
          : 'simple';
      const currentChoices = stringifyFeatureChoices(feature.choix_json);
      const currentUnit = String(feature.unite || '').trim();
      const currentTab = String(feature.onglet_id || '').trim();
      const currentVisibility = Number(feature.visibilite_client) === 0 ? 0 : 1;
      const nextName = String(draft.nom || '').trim();
      const nextType = draft.type_caracteristique;
      const nextChoices = parseFeatureChoices(draft.choix);
      const nextUnit = String(draft.unite || '').trim();
      const nextTab = String(draft.onglet_id || '').trim();
      const nextVisibility = draft.visibilite_client;
      const unchanged =
        nextName === String(feature.nom || '').trim() &&
        nextType === currentType &&
        draft.choix.trim() === currentChoices &&
        nextUnit === currentUnit &&
        nextTab === currentTab &&
        nextVisibility === currentVisibility;
      if (unchanged) continue;
      if (!nextName) continue;
      if (nextType === 'valeur' && !nextUnit) continue;
      if (nextType === 'choix_multiple' && nextChoices.length === 0) continue;

      let response: Response | null = null;
      for (const base of featureApiBases) {
        const next = await fetch(`${base}/${encodeURIComponent(feature.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode_bien: mode,
            type_bien: type,
            bien_id: initialData?.id || null,
            nom: nextName,
            type_caracteristique: nextType,
            choix: nextType === 'choix_multiple' ? nextChoices : [],
            unite: nextType === 'valeur' ? nextUnit : null,
            onglet_id: nextTab || null,
            visibilite_client: nextVisibility,
          }),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) {
        throw new Error(`Failed to update feature ${feature.id}`);
      }
    }
  };

  const handleAddZone = async () => {
    if (!newZoneName.trim()) return toast.error('Nom de zone requis');
    try {
      const payload = {
        id: `z${Date.now()}`,
        nom: newZoneName.trim(),
        description: newZoneDescription.trim(),
        google_maps_url: newZoneGoogleMapsUrl.trim() || null
      };
      const response = await fetch(`${API_URL}/zones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('Failed to create zone');
      const createdZone = await response.json();
      setZonesOptions([...zonesOptions, createdZone]);
      setFormData(prev => ({ ...prev, zone_id: createdZone.id }));
      setNewZoneName('');
      setNewZoneDescription('');
      setNewZoneGoogleMapsUrl('');
      setShowAddZone(false);
      toast.success('Zone ajoutée');
    } catch {
      toast.error('Erreur ajout zone');
    }
  };

  const handleAddProprietaire = async () => {
    if (!newOwnerName.trim()) return toast.error('Nom du propriétaire requis');
    if (!newOwnerEmail.trim()) return toast.error('Email du propriétaire requis');
    try {
      const payload = { nom: newOwnerName.trim(), telephone: newOwnerPhone.trim(), email: newOwnerEmail.trim(), cin: newOwnerCin.trim() };
      const response = await fetch(`${API_URL}/proprietaires`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('Failed to create owner');
      const createdOwner = await response.json();

      const utilisateursResponse = await fetch(`${API_URL}/utilisateurs`);
      const utilisateurs = utilisateursResponse.ok ? await utilisateursResponse.json() : [];
      const existingUser = Array.isArray(utilisateurs)
        ? utilisateurs.find((item) => String(item?.email || '').trim().toLowerCase() === newOwnerEmail.trim().toLowerCase())
        : null;

      const utilisateurPayload = {
        nom: newOwnerName.trim(),
        email: newOwnerEmail.trim(),
        role: 'user',
        telephone: newOwnerPhone.trim() || null,
        client_type: 'proprietaire',
        cin: newOwnerCin.trim() || null,
        cin_image_url: existingUser?.cin_image_url || null,
        avatar: existingUser?.avatar || null,
      };

      if (existingUser?.id) {
        const syncResponse = await fetch(`${API_URL}/utilisateurs/${encodeURIComponent(existingUser.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(utilisateurPayload),
        });
        if (!syncResponse.ok) {
          throw new Error('Failed to sync owner user');
        }
      } else {
        const createUserResponse = await fetch(`${API_URL}/utilisateurs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(utilisateurPayload),
        });
        if (!createUserResponse.ok) {
          throw new Error('Failed to create owner user');
        }
      }

      setProprietaireOptions([...proprietaireOptions, createdOwner]);
      setFormData(prev => ({ ...prev, proprietaire_id: createdOwner.id }));
      setNewOwnerName('');
      setNewOwnerPhone('');
      setNewOwnerEmail('');
      setNewOwnerCin('');
      setShowAddProprietaire(false);
      toast.success('Propriétaire ajouté');
    } catch {
      toast.error('Erreur ajout propriétaire');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const allIssues = [1, 2, 3, 4, 5].flatMap((step) => getStepValidationIssues(step as 1 | 2 | 3 | 4 | 5));
    if (allIssues.length > 0) {
      openValidationDialog(allIssues);
      return;
    }

    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType(formData.type as BienType);
    const venteTarification = computeVenteTarification(formData);
    const isAppartementVente = selectedMode === 'vente' && selectedType === 'appartement';
    const isLocalCommercialVente = selectedMode === 'vente' && selectedType === 'local_commercial';
    const isTerrainVente = selectedMode === 'vente' && selectedType === 'terrain';
    const isLotissementVente = selectedMode === 'vente' && selectedType === 'lotissement';
    const isImmeubleVente = selectedMode === 'vente' && selectedType === 'immeuble';

    try {
      await savePendingFeatureDrafts(selectedMode, selectedType);
      await loadAvailableFeatures(selectedMode, selectedType);
    } catch {
      setGeneralStep(3);
      return toast.error('Erreur sauvegarde des modifications de caracteristiques');
    }

    const orderedMediaForSave = [...clientVisibleImages, ...clientVisibleVideos, ...images.filter((img) => isProofImage(img))];
    const imagesWithPositions = orderedMediaForSave.map((img, idx) => ({ ...img, position: idx }));
    const ventePaiement = computeVentePaiement(formData, venteTarification.prixFinal);
    const deriveBedroomsFromConfiguration = (configuration?: string | null): number => {
      if (!configuration) return 0;
      const match = configuration.match(/S\s*\+\s*(\d+)/i);
      if (!match) return 0;
      return Number(match[1]) || 0;
    };
    const resolvedNbChambres = isAppartementVente
      ? deriveBedroomsFromConfiguration(formData.configuration || null)
      : isLocalCommercialVente
        ? 0
        : isTerrainVente
          ? 0
          : isLotissementVente
            ? 0
          : isImmeubleVente
            ? 0
        : Number(formData.nb_chambres || 0);
    const resolvedNbSalleBain = (isLocalCommercialVente || isTerrainVente || isLotissementVente || isImmeubleVente) ? 0 : Number(formData.nb_salle_bain || 0);
    const appartementVenteData = isAppartementVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          superficie_m2: formData.superficie_m2 ?? null,
          etage: formData.etage ?? null,
          configuration: formData.configuration || null,
          annee_construction: formData.annee_construction ?? null,
          distance_plage_m: formData.distance_plage_m ?? null,
          proche_plage: !!formData.proche_plage,
          chauffage_central: !!formData.chauffage_central,
          climatisation: !!formData.climatisation,
          balcon: !!formData.balcon,
          terrasse: !!formData.terrasse,
          ascenseur: !!formData.ascenseur,
          vue_mer: !!formData.vue_mer,
          gaz_ville: !!formData.gaz_ville,
          cuisine_equipee: !!formData.cuisine_equipee,
          place_parking: !!formData.place_parking,
          syndic: !!formData.syndic,
          meuble: !!formData.meuble,
          independant: !!formData.independant,
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          type_rue: null,
          type_papier: null,
          superficie_m2: null,
          etage: null,
          configuration: null,
          annee_construction: null,
          distance_plage_m: null,
          proche_plage: false,
          chauffage_central: false,
          climatisation: false,
          balcon: false,
          terrasse: false,
          ascenseur: false,
          vue_mer: false,
          gaz_ville: false,
          cuisine_equipee: false,
          place_parking: false,
          syndic: false,
          meuble: false,
          independant: false,
          eau_puits: false,
          eau_sonede: false,
          electricite_steg: false,
        };
    const localCommercialVenteData = isLocalCommercialVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          surface_local_m2: formData.surface_local_m2 ?? null,
          facade_m: formData.facade_m ?? null,
          hauteur_plafond_m: formData.hauteur_plafond_m ?? null,
          activite_recommandee: formData.activite_recommandee || null,
          toilette: !!formData.toilette,
          reserve_local: !!formData.reserve_local,
          vitrine: !!formData.vitrine,
          coin_angle: !!formData.coin_angle,
          electricite_3_phases: !!formData.electricite_3_phases,
          gaz_ville: !!formData.gaz_ville,
          alarme: !!formData.alarme,
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          surface_local_m2: null,
          facade_m: null,
          hauteur_plafond_m: null,
          activite_recommandee: null,
          toilette: false,
          reserve_local: false,
          vitrine: false,
          coin_angle: false,
          electricite_3_phases: false,
          alarme: false,
        };
    const terrainVenteData = isTerrainVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          type_terrain: formData.type_terrain || null,
          terrain_facade_m: formData.terrain_facade_m ?? null,
          terrain_surface_m2: formData.terrain_surface_m2 ?? null,
          terrain_distance_plage_m: formData.terrain_distance_plage_m ?? null,
          terrain_zone: formData.terrain_zone || null,
          terrain_constructible: !!formData.terrain_constructible,
          terrain_angle: !!formData.terrain_angle,
          terrain_prix_affiche_total: formData.terrain_prix_affiche_total ?? null,
          terrain_prix_affiche_par_m2: formData.terrain_prix_affiche_par_m2 ?? null,
          terrain_mode_affichage_prix: formData.terrain_mode_affichage_prix || 'total_et_m2',
          terrain_disponibilite_reseaux: Array.isArray(formData.terrain_disponibilite_reseaux) ? formData.terrain_disponibilite_reseaux : [],
          terrain_hauteur_construction_autorisee: formData.terrain_hauteur_construction_autorisee || null,
          terrain_route_acces_largeur_m: formData.terrain_route_acces_largeur_m ?? null,
          terrain_forme: formData.terrain_forme || null,
          terrain_topographie: formData.terrain_topographie || null,
          terrain_bornage: !!formData.terrain_bornage,
          terrain_travaux_municipalite_autorises: !!formData.terrain_travaux_municipalite_autorises,
          terrain_limites_cadastrales: !!formData.terrain_limites_cadastrales,
          terrain_visualisation_limites_cadastrales: !!formData.terrain_visualisation_limites_cadastrales,
          terrain_voisinage: formData.terrain_voisinage || null,
          terrain_proximites_commodites: Array.isArray(formData.terrain_proximites_commodites) ? formData.terrain_proximites_commodites : [],
          terrain_proximites_commodites_autres: formData.terrain_proximites_commodites_autres || null,
          terrain_viabilisation_eau_sources: Array.isArray(formData.terrain_viabilisation_eau_sources) ? formData.terrain_viabilisation_eau_sources : [],
          terrain_viabilisation_onas: formData.terrain_viabilisation_onas || null,
          terrain_viabilisation_steg: formData.terrain_viabilisation_steg || null,
          terrain_viabilisation_gaz_ville: !!formData.terrain_viabilisation_gaz_ville,
          terrain_viabilisation_fibre_optique: !!formData.terrain_viabilisation_fibre_optique,
          terrain_viabilisation_telephone_fixe: !!formData.terrain_viabilisation_telephone_fixe,
          terrain_type_sol: formData.terrain_type_sol || null,
          terrain_vegetation: formData.terrain_vegetation || null,
          terrain_niveau_sonore: formData.terrain_niveau_sonore || null,
          terrain_risque_inondation: !!formData.terrain_risque_inondation,
          terrain_exposition_vent: formData.terrain_exposition_vent || null,
          terrain_ideal_utilisations: Array.isArray(formData.terrain_ideal_utilisations) ? formData.terrain_ideal_utilisations : [],
          terrain_documents_disponibles: Array.isArray(formData.terrain_documents_disponibles) ? formData.terrain_documents_disponibles : [],
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          type_terrain: null,
          terrain_facade_m: null,
          terrain_surface_m2: null,
          terrain_distance_plage_m: null,
          terrain_zone: null,
          terrain_constructible: false,
          terrain_angle: false,
          terrain_prix_affiche_total: null,
          terrain_prix_affiche_par_m2: null,
          terrain_mode_affichage_prix: null,
          terrain_disponibilite_reseaux: [],
          terrain_hauteur_construction_autorisee: null,
          terrain_route_acces_largeur_m: null,
          terrain_forme: null,
          terrain_topographie: null,
          terrain_bornage: false,
          terrain_travaux_municipalite_autorises: false,
          terrain_limites_cadastrales: false,
          terrain_visualisation_limites_cadastrales: false,
          terrain_voisinage: null,
          terrain_proximites_commodites: [],
          terrain_proximites_commodites_autres: null,
          terrain_viabilisation_eau_sources: [],
          terrain_viabilisation_onas: null,
          terrain_viabilisation_steg: null,
          terrain_viabilisation_gaz_ville: false,
          terrain_viabilisation_fibre_optique: false,
          terrain_viabilisation_telephone_fixe: false,
          terrain_type_sol: null,
          terrain_vegetation: null,
          terrain_niveau_sonore: null,
          terrain_risque_inondation: false,
          terrain_exposition_vent: null,
          terrain_ideal_utilisations: [],
          terrain_documents_disponibles: [],
        };
    const lotissementVenteData = isLotissementVente
      ? {
          lotissement_nb_terrains: formData.lotissement_nb_terrains ?? 1,
          lotissement_prix_total: formData.lotissement_prix_total ?? null,
          lotissement_mode_prix_m2: formData.lotissement_mode_prix_m2 || 'm2_unique',
          lotissement_prix_m2_unique: formData.lotissement_prix_m2_unique ?? null,
          lotissement_terrains: Array.isArray(formData.lotissement_terrains) ? formData.lotissement_terrains : [],
          lotissement_paliers_prix_m2: Array.isArray(formData.lotissement_paliers_prix_m2) ? formData.lotissement_paliers_prix_m2 : [],
        }
      : {
          lotissement_nb_terrains: null,
          lotissement_prix_total: null,
          lotissement_mode_prix_m2: null,
          lotissement_prix_m2_unique: null,
          lotissement_terrains: [],
          lotissement_paliers_prix_m2: [],
        };
    const immeubleVenteData = isImmeubleVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          immeuble_surface_terrain_m2: formData.immeuble_surface_terrain_m2 ?? null,
          immeuble_surface_batie_m2: formData.immeuble_surface_batie_m2 ?? null,
          immeuble_nb_niveaux: formData.immeuble_nb_niveaux ?? null,
          immeuble_nb_garages: formData.immeuble_nb_garages ?? null,
          immeuble_nb_appartements: formData.immeuble_nb_appartements ?? null,
          immeuble_nb_locaux_commerciaux: formData.immeuble_nb_locaux_commerciaux ?? null,
          immeuble_distance_plage_m: formData.immeuble_distance_plage_m ?? null,
          immeuble_proche_plage: !!formData.immeuble_proche_plage,
          immeuble_ascenseur: !!formData.immeuble_ascenseur,
          immeuble_parking_sous_sol: !!formData.immeuble_parking_sous_sol,
          immeuble_parking_exterieur: !!formData.immeuble_parking_exterieur,
          immeuble_syndic: !!formData.immeuble_syndic,
          immeuble_vue_mer: !!formData.immeuble_vue_mer,
          immeuble_appartements: Array.isArray(formData.immeuble_appartements) ? formData.immeuble_appartements : [],
          immeuble_garages: Array.isArray(formData.immeuble_garages) ? formData.immeuble_garages : [],
          immeuble_locaux_commerciaux: Array.isArray(formData.immeuble_locaux_commerciaux) ? formData.immeuble_locaux_commerciaux : [],
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          immeuble_surface_terrain_m2: null,
          immeuble_surface_batie_m2: null,
          immeuble_nb_niveaux: null,
          immeuble_nb_garages: null,
          immeuble_nb_appartements: null,
          immeuble_nb_locaux_commerciaux: null,
          immeuble_distance_plage_m: null,
          immeuble_proche_plage: false,
          immeuble_ascenseur: false,
          immeuble_parking_sous_sol: false,
          immeuble_parking_exterieur: false,
          immeuble_syndic: false,
          immeuble_vue_mer: false,
          immeuble_appartements: [],
          immeuble_garages: [],
          immeuble_locaux_commerciaux: [],
        };
    const finalData: Bien = {
      ...formData,
      mode: selectedMode,
      type: selectedType,
      nb_chambres: resolvedNbChambres,
      nb_salle_bain: resolvedNbSalleBain,
      prix_nuitee: selectedMode === 'vente' ? venteTarification.prixAfficheClient : Number(formData.prix_nuitee || 0),
      tarification_methode: selectedMode === 'vente' ? tarificationMethode : null,
      prix_affiche_client: selectedMode === 'vente' ? venteTarification.prixAfficheClient : null,
      prix_fixe_proprietaire: selectedMode === 'vente' ? venteTarification.prixFixeProprietaire : null,
      prix_final: selectedMode === 'vente' ? venteTarification.prixFinal : null,
      revenu_agence: selectedMode === 'vente' ? venteTarification.revenuAgence : null,
      commission_pourcentage_proprietaire: selectedMode === 'vente' ? venteTarification.commissionPourcentageProprietaire : null,
      commission_pourcentage_client: selectedMode === 'vente' ? venteTarification.commissionPourcentageClient : null,
      montant_max_reduction_negociation: selectedMode === 'vente' && tarificationMethode === 'sans_commission'
        ? Number(formData.montant_max_reduction_negociation ?? 0)
        : null,
      prix_minimum_accepte: selectedMode === 'vente' && tarificationMethode === 'sans_commission'
        ? venteTarification.prixMinimumAccepte
        : null,
      modalite_paiement_vente: selectedMode === 'vente' ? ventePaiement.modalite : null,
      pourcentage_premiere_partie_promesse: selectedMode === 'vente' ? ventePaiement.pourcentagePremierePartiePromesse : null,
      montant_premiere_partie_promesse: selectedMode === 'vente' ? ventePaiement.montantPremierePartiePromesse : null,
      montant_deuxieme_partie: selectedMode === 'vente' ? ventePaiement.montantDeuxiemePartie : null,
      nombre_tranches: selectedMode === 'vente' && ventePaiement.modalite === 'facilite' ? ventePaiement.nombreTranches : null,
      periode_tranches_mois: selectedMode === 'vente' && ventePaiement.modalite === 'facilite' ? ventePaiement.periodeTranchesMois : null,
      montant_par_tranche: selectedMode === 'vente' && ventePaiement.modalite === 'facilite' ? ventePaiement.montantParTranche : null,
      ...appartementVenteData,
      ...localCommercialVenteData,
      ...terrainVenteData,
      ...lotissementVenteData,
      ...immeubleVenteData,
      description: formData.description || '',
      caracteristiques: availableFeatures
        .filter((feature) => selectedFeatureIds.includes(feature.id) && Number(feature.visibilite_client) !== 0)
        .map((feature) => feature.nom),
      caracteristique_ids: selectedFeatureIds,
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      media: imagesWithPositions,
      unavailableDates: unavailableDates,
      visible_sur_site: formData.visible_sur_site !== false,
      created_at: initialData?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      date_ajout: initialData?.date_ajout || new Date().toISOString().split('T')[0]
    } as Bien;
    markStepValidated(selectedMode === 'vente' ? 5 : 4);
    await onSubmit(finalData);
  };
  const selectedProprietaire = proprietaireOptions.find((p) => p.id === (formData.proprietaire_id || ''));
  const isAppartementVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'appartement';
  const isLocalCommercialVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'local_commercial';
  const isTerrainVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'terrain';
  const isLotissementVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'lotissement';
  const isImmeubleVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'immeuble';
  const terrainTabsForRender = featureTabs
    .slice()
    .sort((a, b) => Number(a.ordre || 999) - Number(b.ordre || 999))
    .map((tab) => ({ id: tab.id, label: String(tab.nom || tab.id), is_system: Number(tab.is_system || 0) === 1 }));
  const detailTabsForRender = (featureTabs.length > 0 ? featureTabs : DEFAULT_DETAILS_TABS)
    .slice()
    .sort((a, b) => Number(a.ordre || 999) - Number(b.ordre || 999))
    .map((tab) => ({ id: tab.id, label: String(tab.nom || tab.id), is_system: Number(tab.is_system || 0) === 1 }));
  const uiConfig = (formData.ui_config || {}) as BienUiConfig;
  const isUiSectionVisible = (key: keyof BienUiConfig) => uiConfig[key] !== false;
  const visibleFeaturesForSelectedTab = selectedFeatureTabId
    ? availableFeatures.filter((feature) => String(feature.onglet_id || '') === selectedFeatureTabId)
    : [];
  const unassignedFeatures = availableFeatures.filter((feature) => !String(feature.onglet_id || '').trim());
  const terrainTabFeatures = availableFeatures.filter((feature) => (feature.onglet_id || '') === terrainSectionTab);
  const detailTabFeatures = availableFeatures.filter((feature) => String(feature.onglet_id || '') === detailSectionTabId);
  const renderTerrainTabFeatures = () => (
    <div className="mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {terrainTabFeatures.map((feature) => (
          <label key={`terrain-tab-${feature.id}`} className="inline-flex items-center gap-2 text-sm text-gray-700 p-2 rounded border border-gray-200">
            <input
              type="checkbox"
              checked={selectedFeatureIds.includes(feature.id)}
              onChange={(e) => setSelectedFeatureIds((prev) => e.target.checked ? [...prev, feature.id] : prev.filter((id) => id !== feature.id))}
            />
            <span>{feature.nom}</span>
          </label>
        ))}
        {terrainTabFeatures.length === 0 && <span className="text-xs text-gray-500">Aucune caracteristique dans cet onglet</span>}
      </div>
    </div>
  );
  const renderDetailTabFeatures = () => (
    <div className="mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {detailTabFeatures.map((feature) => (
          <label key={`detail-tab-${feature.id}`} className="inline-flex items-center gap-2 text-sm text-gray-700 p-2 rounded border border-gray-200">
            <input
              type="checkbox"
              checked={selectedFeatureIds.includes(feature.id)}
              onChange={(e) => setSelectedFeatureIds((prev) => e.target.checked ? [...prev, feature.id] : prev.filter((id) => id !== feature.id))}
            />
            <span>{feature.nom}</span>
          </label>
        ))}
        {detailTabFeatures.length === 0 && <span className="text-xs text-gray-500">Aucune caracteristique dans cet onglet</span>}
      </div>
    </div>
  );
  useEffect(() => {
    if (!isTerrainVente) return;
    const hasTab = terrainTabsForRender.some((tab) => tab.id === terrainSectionTab);
    if (!hasTab) setTerrainSectionTab(terrainTabsForRender[0]?.id || '');
  }, [isTerrainVente, terrainSectionTab, terrainTabsForRender]);
  useEffect(() => {
    if (isTerrainVente) return;
    const hasTab = detailTabsForRender.some((tab) => tab.id === detailSectionTabId);
    if (!hasTab) setDetailSectionTabId(detailTabsForRender[0]?.id || 'informations_generales');
  }, [isTerrainVente, detailSectionTabId, detailTabsForRender]);
  const activeDetailTabLabel = normalizeFeatureName(String(detailTabsForRender.find((tab) => tab.id === detailSectionTabId)?.label || ''));
  const isInfoDetailTab = activeDetailTabLabel.includes('information');
  const isCharacteristicsDetailTab = activeDetailTabLabel.includes('caracteristique');
  const immeubleClientImageUnits = [
    ...Array.from({ length: Math.max(0, Number(formData.immeuble_nb_appartements || 0)) }, (_, idx) => ({ unitKey: `appartement_${idx + 1}`, label: `Appartement ${idx + 1}` })),
    ...Array.from({ length: Math.max(0, Number(formData.immeuble_nb_garages || 0)) }, (_, idx) => ({ unitKey: `garage_${idx + 1}`, label: `Garage ${idx + 1}` })),
    ...Array.from({ length: Math.max(0, Number(formData.immeuble_nb_locaux_commerciaux || 0)) }, (_, idx) => ({ unitKey: `local_commercial_${idx + 1}`, label: `Local commercial ${idx + 1}` })),
  ];
  const lotissementClientImageUnits = Array.from({ length: Math.max(1, Number(formData.lotissement_nb_terrains || 1)) }, (_, idx) => ({ unitKey: `terrain_${idx + 1}`, label: `Terrain ${idx + 1}` }));
  const isModeVente = (formData.mode || 'location_saisonniere') === 'vente';
  const currentTarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
  const venteTarificationPreview = computeVenteTarification(formData);
  const currentModalitePaiementVente = (formData.modalite_paiement_vente || 'comptant') as ModalitePaiementVente;
  const ventePaiementPreview = computeVentePaiement(formData, venteTarificationPreview.prixFinal);
  const requiredPrimaryStep = isModeVente ? 5 : 4;
  const createValidationIssue = (step: 1 | 2 | 3 | 4 | 5, fieldName: string, label: string, message: string): ValidationIssue => ({
    step,
    fieldName,
    label,
    message,
  });
  const getStepValidationIssues = (step: 1 | 2 | 3 | 4 | 5): ValidationIssue[] => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType(formData.type as BienType);
    const allowedTypes = BIEN_TYPES_BY_MODE[selectedMode] || [];
    const tarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
    const venteTarification = computeVenteTarification(formData);
    const modalitePaiementVente = (formData.modalite_paiement_vente || 'comptant') as ModalitePaiementVente;
    const appartementVente = selectedMode === 'vente' && selectedType === 'appartement';
    const localCommercialVente = selectedMode === 'vente' && selectedType === 'local_commercial';
    const terrainVente = selectedMode === 'vente' && selectedType === 'terrain';
    const lotissementVente = selectedMode === 'vente' && selectedType === 'lotissement';
    const immeubleVente = selectedMode === 'vente' && selectedType === 'immeuble';
    const issues: ValidationIssue[] = [];

    if (step === 1) {
      if (!String(formData.titre || '').trim()) issues.push(createValidationIssue(1, 'titre', 'Titre', 'Titre obligatoire'));
      if (!String(formData.reference || '').trim()) issues.push(createValidationIssue(1, 'reference', 'Reference interne', 'Reference obligatoire'));
      if (!selectedMode) issues.push(createValidationIssue(1, 'mode', 'Mode', 'Mode obligatoire'));
    }

    if (step === 2) {
      if (!selectedType || !allowedTypes.includes(selectedType)) {
        issues.push(createValidationIssue(2, 'type', 'Type', 'Type invalide pour ce mode'));
      }
    }

    if (step === 3) {
      if (appartementVente && !formData.type_rue) issues.push(createValidationIssue(3, 'type_rue', 'Type de rue', 'Type de rue obligatoire pour Appartement en vente'));
      if (appartementVente && !formData.type_papier) issues.push(createValidationIssue(3, 'type_papier', 'Type de papier', 'Type de papier obligatoire pour Appartement en vente'));
      if (appartementVente && !String(formData.configuration || '').trim()) issues.push(createValidationIssue(3, 'configuration', 'Configuration', 'Configuration obligatoire pour Appartement en vente'));
      if (localCommercialVente && !String(formData.activite_recommandee || '').trim()) issues.push(createValidationIssue(3, 'activite_recommandee', 'Activite recommandee', 'Activite recommandee obligatoire pour Local commercial en vente'));
      if (localCommercialVente && !formData.type_rue) issues.push(createValidationIssue(3, 'type_rue', 'Type de rue', 'Type de rue obligatoire pour Local commercial en vente'));
      if (localCommercialVente && !formData.type_papier) issues.push(createValidationIssue(3, 'type_papier', 'Type de papier', 'Type de papier obligatoire pour Local commercial en vente'));
      if (terrainVente && !formData.type_terrain) issues.push(createValidationIssue(3, 'type_terrain', 'Type de terrain', 'Type de terrain obligatoire pour Terrain en vente'));
      if (terrainVente && (!formData.terrain_surface_m2 || Number(formData.terrain_surface_m2) <= 0)) issues.push(createValidationIssue(3, 'terrain_surface_m2', 'Surface terrain', 'Surface terrain obligatoire (> 0)'));
      if (terrainVente && (formData.terrain_mode_affichage_prix === 'm2_uniquement' || formData.terrain_mode_affichage_prix === 'total_et_m2') && (!formData.terrain_prix_affiche_par_m2 || Number(formData.terrain_prix_affiche_par_m2) <= 0)) issues.push(createValidationIssue(3, 'terrain_prix_affiche_par_m2', 'Prix affiche par m2', 'Prix affiche par m2 obligatoire (> 0)'));
      if (terrainVente && !formData.type_rue) issues.push(createValidationIssue(3, 'type_rue', 'Type de rue', 'Type de rue obligatoire pour Terrain en vente'));
      if (terrainVente && !formData.type_papier) issues.push(createValidationIssue(3, 'type_papier', 'Type de papier', 'Type de papier obligatoire pour Terrain en vente'));
      if (immeubleVente && !formData.type_rue) issues.push(createValidationIssue(3, 'type_rue', 'Type de rue', 'Type de rue obligatoire pour Immeuble en vente'));
      if (immeubleVente && !formData.type_papier) issues.push(createValidationIssue(3, 'type_papier', 'Type de papier', 'Type de papier obligatoire pour Immeuble en vente'));
      if (lotissementVente && (!formData.lotissement_nb_terrains || Number(formData.lotissement_nb_terrains) <= 0)) issues.push(createValidationIssue(3, 'lotissement_nb_terrains', 'Nombre de terrains', 'Nombre de terrains obligatoire pour le lotissement'));
      if (lotissementVente && (formData.lotissement_mode_prix_m2 || 'm2_unique') === 'm2_unique' && (!formData.lotissement_prix_m2_unique || Number(formData.lotissement_prix_m2_unique) <= 0)) issues.push(createValidationIssue(3, 'lotissement_prix_m2_unique', 'Prix m2 unique', 'Prix m2 unique obligatoire pour le lotissement'));
      if (lotissementVente && formData.lotissement_mode_prix_m2 === 'paliers' && (!Array.isArray(formData.lotissement_paliers_prix_m2) || formData.lotissement_paliers_prix_m2.length === 0)) issues.push(createValidationIssue(3, 'lotissement_mode_prix_m2', 'Paliers prix m2', 'Ajoutez au moins un palier de prix m2'));
    }

    if (step === 4 && selectedMode === 'vente') {
      const prixAfficheClient = Number(formData.prix_affiche_client ?? formData.prix_nuitee ?? 0);
      const terrainPrixDerive = terrainVente
        ? Number(formData.terrain_prix_affiche_total || 0) || (Number(formData.terrain_surface_m2 || 0) * Number(formData.terrain_prix_affiche_par_m2 || 0))
        : 0;
      const lotissementPrixDerive = lotissementVente ? Number(formData.lotissement_prix_total || 0) : 0;
      const prixValideVente = (terrainVente || lotissementVente)
        ? (prixAfficheClient > 0 || terrainPrixDerive > 0 || lotissementPrixDerive > 0)
        : (prixAfficheClient > 0);
      if (!prixValideVente) issues.push(createValidationIssue(4, 'prix_affiche_client', 'Prix affiche client', 'Prix affiche client obligatoire et > 0 (ou prix terrain/lotissement)'));
      if (tarificationMethode === 'sans_commission') {
        const prixFixeProprietaire = Number(formData.prix_fixe_proprietaire ?? 0);
        const maxReduction = Number(formData.montant_max_reduction_negociation ?? 0);
        if (!Number.isFinite(prixFixeProprietaire) || prixFixeProprietaire <= 0) issues.push(createValidationIssue(4, 'prix_fixe_proprietaire', 'Prix fixe proprietaire', 'Prix fixe proprietaire obligatoire et > 0'));
        if (prixFixeProprietaire > prixAfficheClient) issues.push(createValidationIssue(4, 'prix_fixe_proprietaire', 'Prix fixe proprietaire', 'Prix fixe proprietaire ne peut pas depasser le prix affiche client'));
        if (maxReduction < 0 || maxReduction > venteTarification.revenuAgence) issues.push(createValidationIssue(4, 'montant_max_reduction_negociation', 'Montant max a diminuer', 'Montant max de reduction invalide'));
      }
    }

    if (step === 5 && selectedMode === 'vente' && modalitePaiementVente === 'facilite') {
      const pourcentagePromesse = Number(formData.pourcentage_premiere_partie_promesse ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE);
      const nombreTranches = Math.floor(Number(formData.nombre_tranches ?? 0));
      const periodeMois = Math.floor(Number(formData.periode_tranches_mois ?? 0));
      if (pourcentagePromesse <= 0 || pourcentagePromesse >= 100) issues.push(createValidationIssue(5, 'pourcentage_premiere_partie_promesse', 'Pourcentage 1ere partie', 'Le pourcentage de promesse doit etre > 0 et < 100'));
      if (nombreTranches <= 0) issues.push(createValidationIssue(5, 'nombre_tranches', 'Nombre de tranches', 'Le nombre de tranches doit etre > 0'));
      if (periodeMois <= 0) issues.push(createValidationIssue(5, 'periode_tranches_mois', 'Periode totale', 'La periode (mois) doit etre > 0'));
    }

    return issues;
  };

  const ensureFeatureTabsForCurrentContext = async (keys: Array<keyof BienUiConfig>) => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const definitions = keys
      .map((key) => UI_SECTION_FEATURE_TAB_DEFINITIONS[key])
      .filter((definition): definition is { label: string; ordre: number } => Boolean(definition));
    if (definitions.length === 0) return;

    let knownTabs = featureTabs.length > 0 ? [...featureTabs] : await loadFeatureTabs(selectedMode, selectedType);
    const tabApiBases = getFeatureTabApiBases();
    let createdAny = false;

    for (const definition of definitions) {
      const existing = knownTabs.find((tab) => normalizeFeatureName(String(tab.nom || '')) === normalizeFeatureName(definition.label));
      if (existing) continue;

      let response: Response | null = null;
      for (const base of tabApiBases) {
        const next = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode_bien: selectedMode,
            type_bien: selectedType,
            nom: definition.label,
            ordre: definition.ordre,
          }),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) continue;
      const createdTab = await response.json();
      if (createdTab?.id) {
        knownTabs = [...knownTabs, createdTab];
        createdAny = true;
      }
    }

    if (createdAny) {
      await loadFeatureTabs(selectedMode, selectedType);
    }
  };

  const handleUiSectionVisibilityChange = (key: keyof BienUiConfig, checked: boolean) => {
    setUiSectionVisible(key, checked);
    if (!checked) return;
    void ensureFeatureTabsForCurrentContext([key]);
  };
  const canAddFeature =
    String(newFeature || '').trim().length > 0
    && String(selectedFeatureTabId || '').trim().length > 0
    && (
      newFeatureType === 'simple'
      || (newFeatureType === 'valeur' && String(newFeatureUnit || '').trim().length > 0)
      || (newFeatureType === 'choix_multiple' && parseFeatureChoices(newFeatureChoices).length > 0)
    );
  const openValidationDialog = (issues: ValidationIssue[]) => {
    if (issues.length === 0) return;
    setActiveTab('general');
    setGeneralStep(issues[0].step);
    setValidationDialogState({ open: true, issues });
    toast.error(issues.length === 1 ? issues[0].message : 'Des champs obligatoires sont manquants');
  };
  const focusValidationIssue = (issue: ValidationIssue) => {
    setActiveTab('general');
    setGeneralStep(issue.step);
    setValidationDialogState({ open: false, issues: [] });
    window.setTimeout(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[name="${issue.fieldName}"], #${issue.fieldName}, [data-field="${issue.fieldName}"]`));
      const target = candidates.find((element) => element.offsetParent !== null) || candidates[0];
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus();
    }, 180);
  };
  const validateStepBeforeContinue = (step: 1 | 2 | 3 | 4 | 5, nextStep?: 1 | 2 | 3 | 4 | 5) => {
    const issues = getStepValidationIssues(step);
    if (issues.length > 0) {
      openValidationDialog(issues);
      return;
    }
    markStepValidated(step);
    if (nextStep) {
      setValidationDialogState({ open: false, issues: [] });
      setGeneralStep(nextStep);
      return;
    }
    setValidationDialogState({ open: false, issues: [] });
    setActiveTab('images');
    toast.success(`Etape ${step} validee`);
  };
  const markStepValidated = (step: number) => {
    setValidatedSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  };
  const isStepUnlocked = (targetStep: number) => {
    if (targetStep <= 1) return true;
    for (let step = 1; step < targetStep; step += 1) {
      if (!validatedSteps.has(step)) return false;
    }
    return true;
  };
  const goToStep = (targetStep: 1 | 2 | 3 | 4 | 5) => {
    if (targetStep > 1) {
      for (let step = 1 as 1 | 2 | 3 | 4 | 5; step < targetStep; step += 1) {
        const issues = getStepValidationIssues(step);
        if (issues.length > 0) {
          openValidationDialog(issues);
          return;
        }
      }
    }
    if (!isStepUnlocked(targetStep)) {
      toast.error("Validez d'abord les etapes precedentes");
      return;
    }
    setGeneralStep(targetStep);
  };
  const canAccessSecondaryTabs = isStepUnlocked(requiredPrimaryStep) && validatedSteps.has(requiredPrimaryStep);

  return (
    <form id="bien-editor-form" onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 bg-gray-50 px-4 shrink-0 overflow-x-auto">
        <button type="button" onClick={() => setActiveTab('general')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'general' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}><Home className="h-4 w-4 inline mr-2" />Informations</button>
        <button type="button" disabled={!canAccessSecondaryTabs} onClick={() => setActiveTab('images')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'images' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'} ${!canAccessSecondaryTabs ? 'opacity-50 cursor-not-allowed' : ''}`}><ImageIcon className="h-4 w-4 inline mr-2" />Images ({clientVisibleImages.length})</button>
        {!isModeVente && <button type="button" disabled={!canAccessSecondaryTabs} onClick={() => setActiveTab('calendar')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'calendar' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'} ${!canAccessSecondaryTabs ? 'opacity-50 cursor-not-allowed' : ''}`}><CalendarIcon className="h-4 w-4 inline mr-2" />Calendrier</button>}
      </div>
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {activeTab === 'general' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="grid grid-cols-5 gap-2 text-xs sm:text-sm">
                <button type="button" onClick={() => goToStep(1)} className={`px-3 py-2 rounded-lg border ${generalStep === 1 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`}>Etape 1: Base</button>
                <button type="button" disabled={!isStepUnlocked(2)} onClick={() => goToStep(2)} className={`px-3 py-2 rounded-lg border ${generalStep === 2 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(2) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 2: Type</button>
                <button type="button" disabled={!isStepUnlocked(3)} onClick={() => goToStep(3)} className={`px-3 py-2 rounded-lg border ${generalStep === 3 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(3) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 3: Details</button>
                <button type="button" disabled={!isStepUnlocked(4)} onClick={() => goToStep(4)} className={`px-3 py-2 rounded-lg border ${generalStep === 4 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(4) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 4: Tarification</button>
                <button type="button" disabled={!isModeVente || !isStepUnlocked(5)} onClick={() => goToStep(5)} className={`px-3 py-2 rounded-lg border ${generalStep === 5 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${(!isModeVente || !isStepUnlocked(5)) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 5: Paiement</button>
              </div>
            </div>
            {generalStep === 1 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Home className="h-5 w-5 inline text-emerald-600 mr-2" />Etape 1 - Informations de base</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label><input required name="titre" value={formData.titre || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference interne *</label>
                  <div className="flex gap-2">
                    <input required name="reference" value={formData.reference || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, reference: generateReference() }))} className="px-3 py-2 rounded-lg border border-gray-300 text-xs">Auto</button>
                  </div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Mode *</label><select name="mode" value={formData.mode || 'location_saisonniere'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Localisation (Zone)</label>
                  <select name="zone_id" value={formData.zone_id || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{zonesOptions.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}</select>
                  <button type="button" onClick={() => setShowAddZone(!showAddZone)} className="text-xs text-emerald-700 hover:underline">+ Ajouter une zone</button>
                  {showAddZone && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <input type="text" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="Nom de la zone" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newZoneDescription} onChange={(e) => setNewZoneDescription(e.target.value)} placeholder="Description" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="url" value={newZoneGoogleMapsUrl} onChange={(e) => setNewZoneGoogleMapsUrl(e.target.value)} placeholder="Lien Google Maps (optionnel)" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <button type="button" onClick={handleAddZone} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm">Enregistrer zone</button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Propriétaire</label>
                  <select name="proprietaire_id" value={formData.proprietaire_id || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{proprietaireOptions.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select>
                  <button type="button" onClick={() => setShowAddProprietaire(!showAddProprietaire)} className="text-xs text-emerald-700 hover:underline">+ Ajouter un propriétaire</button>
                  {showAddProprietaire && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <input type="text" value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} placeholder="Nom" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newOwnerPhone} onChange={(e) => setNewOwnerPhone(e.target.value)} placeholder="Téléphone" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="email" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} placeholder="Email" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newOwnerCin} onChange={(e) => setNewOwnerCin(e.target.value)} placeholder="CIN" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <button type="button" onClick={handleAddProprietaire} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm">Enregistrer propriétaire</button>
                    </div>
                  )}
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Nom propriétaire</label><input value={selectedProprietaire?.nom || ''} readOnly className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Numéro propriétaire</label><input value={selectedProprietaire?.telephone || ''} readOnly className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea name="description" value={formData.description || ''} onChange={handleChange} rows={4} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
              <div className="flex justify-end"><button type="button" onClick={() => validateStepBeforeContinue(1, 2)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 2</button></div>
            </div>}
            {generalStep === 2 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold"><Maximize className="h-5 w-5 inline text-emerald-600 mr-2" />Etape 2 - Type de bien</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Type *</label><select name="type" value={formData.type || 'appartement'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{(BIEN_TYPES_BY_MODE[(formData.mode || 'location_saisonniere') as BienMode] || []).map((typeValue) => <option key={typeValue} value={typeValue}>{typeLabels[typeValue]}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Statut</label><select name="statut" value={formData.statut || 'disponible'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="disponible">Disponible</option><option value="loue">Loué</option><option value="reserve">Réservé</option><option value="maintenance">Maintenance</option><option value="bloque">Bloqué</option></select></div>
              </div>
              <label htmlFor="visible_sur_site" className="flex items-center justify-between gap-3 p-3 rounded-lg border border-emerald-100 bg-emerald-50/60 cursor-pointer">
                <div>
                  <span className="block text-sm font-medium text-gray-800">Visible sur le site</span>
                  <span className="block text-xs text-gray-500">Si désactivé, le bien reste en admin mais n'apparait plus côté client.</span>
                </div>
                <input type="checkbox" id="visible_sur_site" name="visible_sur_site" checked={formData.visible_sur_site !== false} onChange={handleCheckboxChange} className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Visibilite des composants UI</h4>
                  <p className="text-xs text-gray-500">Ces reglages controlent quels blocs apparaissent sur la page client et dans l'aperçu admin.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm text-gray-700">Galerie</span>
                    <input type="checkbox" checked={isUiSectionVisible('show_gallery')} onChange={(e) => handleUiSectionVisibilityChange('show_gallery', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm text-gray-700">Informations generales</span>
                    <input type="checkbox" checked={isUiSectionVisible('show_informations_generales')} onChange={(e) => handleUiSectionVisibilityChange('show_informations_generales', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm text-gray-700">Caracteristiques</span>
                    <input type="checkbox" checked={isUiSectionVisible('show_caracteristiques')} onChange={(e) => handleUiSectionVisibilityChange('show_caracteristiques', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm text-gray-700">Tarification publique</span>
                    <input type="checkbox" checked={isUiSectionVisible('show_tarification_publique')} onChange={(e) => handleUiSectionVisibilityChange('show_tarification_publique', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm text-gray-700">Modalites de paiement</span>
                    <input type="checkbox" checked={isUiSectionVisible('show_modalites_paiement')} onChange={(e) => handleUiSectionVisibilityChange('show_modalites_paiement', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                  </label>
                  {isImmeubleVente && <>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <span className="text-sm text-gray-700">Bloc appartements</span>
                      <input type="checkbox" checked={isUiSectionVisible('show_immeuble_appartements')} onChange={(e) => handleUiSectionVisibilityChange('show_immeuble_appartements', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <span className="text-sm text-gray-700">Bloc garages</span>
                      <input type="checkbox" checked={isUiSectionVisible('show_immeuble_garages')} onChange={(e) => handleUiSectionVisibilityChange('show_immeuble_garages', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <span className="text-sm text-gray-700">Bloc locaux commerciaux</span>
                      <input type="checkbox" checked={isUiSectionVisible('show_immeuble_locaux_commerciaux')} onChange={(e) => handleUiSectionVisibilityChange('show_immeuble_locaux_commerciaux', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                    </label>
                  </>}
                  {isLotissementVente && <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm text-gray-700">Bloc terrains du lotissement</span>
                    <input type="checkbox" checked={isUiSectionVisible('show_lotissement_terrains')} onChange={(e) => handleUiSectionVisibilityChange('show_lotissement_terrains', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                  </label>}
                </div>
                {isTerrainVente && terrainTabsForRender.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <h5 className="text-sm font-semibold text-gray-800">Onglets terrain visibles</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {terrainTabsForRender.map((tab) => (
                        <label key={`ui-tab-${tab.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                          <span className="text-sm text-gray-700">{tab.label}</span>
                          <input type="checkbox" checked={uiConfig.terrain_tabs?.[tab.id] !== false} onChange={(e) => setTerrainTabVisible(tab.id, e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-between">
                <button type="button" onClick={() => goToStep(1)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                <button type="button" onClick={() => validateStepBeforeContinue(2, 3)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 3</button>
              </div>
            </div>}
            {generalStep === 3 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold"><Maximize className="h-5 w-5 inline text-emerald-600 mr-2" />Etape 3 - Caractéristiques</h3>
                <button type="button" onClick={() => setShowFeaturePanel(!showFeaturePanel)} className="px-3 py-1.5 text-xs sm:text-sm rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">Gerer caractéristiques</button>
              </div>
              <p className="text-sm text-gray-500">Les caracteristiques sont selectionnees et affichees directement dans les onglets de details ci-dessous.</p>
              {showFeaturePanel && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <select value={selectedFeatureTabId} onChange={(e) => setSelectedFeatureTabId(e.target.value)} className="rounded-lg border-gray-300 border p-2 text-sm">
                      <option value="">-- Choisir onglet --</option>
                      {featureTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.nom}</option>)}
                    </select>
                    <input type="text" value={newFeatureTabName} onChange={(e) => setNewFeatureTabName(e.target.value)} placeholder="Ajouter un onglet (nom)" className="rounded-lg border-gray-300 border p-2 text-sm" />
                    <button type="button" onClick={() => void handleCreateFeatureTab()} disabled={featureSaving} className="px-3 py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-sm disabled:opacity-60">Ajouter onglet</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {featureTabs.map((tab) => (
                      <span key={tab.id} className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border ${(selectedFeatureTabId === tab.id) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-emerald-200 text-emerald-700'}`}>
                        <button type="button" onClick={() => setSelectedFeatureTabId(tab.id)}>{tab.nom}</button>
                        <button type="button" onClick={() => void handleDeleteFeatureTab(tab)} className={`${selectedFeatureTabId === tab.id ? 'text-white' : 'text-red-500'}`}>x</button>
                      </span>
                    ))}
                    {featureTabs.length === 0 && <span className="text-xs text-gray-500">Aucun onglet disponible</span>}
                  </div>
                  <div className="space-y-2">
                    {featureTabs.map((tab) => (
                      <div key={`edit-tab-${tab.id}`} className="grid grid-cols-1 md:grid-cols-4 gap-2 p-2 bg-white border border-emerald-200 rounded-lg">
                        <input
                          value={featureTabDrafts[tab.id] ?? tab.nom}
                          onChange={(e) => setFeatureTabDrafts((prev) => ({ ...prev, [tab.id]: e.target.value }))}
                          className="rounded-lg border-gray-300 border p-2 text-sm md:col-span-2"
                        />
                        <button type="button" onClick={() => setSelectedFeatureTabId(tab.id)} className="px-3 py-2 border border-emerald-300 text-emerald-700 rounded-lg text-sm">Selectionner</button>
                        <button type="button" onClick={() => { setSelectedFeatureTabId(tab.id); void handleUpdateFeatureTab(tab); }} disabled={featureSaving} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-60">Modifier onglet</button>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    <input type="text" value={newFeature} onChange={(e) => setNewFeature(e.target.value)} placeholder="Ex: Wifi, Vue mer, Clim centralisee" className="rounded-lg border-gray-300 border p-2 text-sm" />
                    <select value={newFeatureType} onChange={(e) => setNewFeatureType(e.target.value as 'simple' | 'choix_multiple' | 'valeur')} className="rounded-lg border-gray-300 border p-2 text-sm">
                      <option value="simple">Simple (Oui/Non)</option>
                      <option value="choix_multiple">Choix multiple</option>
                      <option value="valeur">Valeur</option>
                    </select>
                    <select value={newFeatureVisibilite} onChange={(e) => setNewFeatureVisibilite((Number(e.target.value) === 0 ? 0 : 1) as 0 | 1)} className="rounded-lg border-gray-300 border p-2 text-sm">
                      <option value={1}>Externe (client)</option>
                      <option value={0}>Interne (admin)</option>
                    </select>
                    <select value={selectedFeatureTabId} onChange={(e) => setSelectedFeatureTabId(e.target.value)} className="rounded-lg border-gray-300 border p-2 text-sm">
                      <option value="">-- Choisir onglet details --</option>
                      {featureTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.nom}</option>)}
                    </select>
                    <button type="button" onClick={() => void handleAddFeature()} disabled={featureSaving || !canAddFeature} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-60">{featureSaving ? '...' : 'Ajouter'}</button>
                  </div>
                  {newFeatureType === 'choix_multiple' && (
                    <input
                      type="text"
                      value={newFeatureChoices}
                      onChange={(e) => setNewFeatureChoices(e.target.value)}
                      placeholder="Choix separes par virgules: Wifi, Clim, Vue mer"
                      className="rounded-lg border-gray-300 border p-2 text-sm"
                    />
                  )}
                  {newFeatureType === 'valeur' && (
                    <input
                      type="text"
                      value={newFeatureUnit}
                      onChange={(e) => setNewFeatureUnit(e.target.value)}
                      placeholder="Unite (m2, m...)"
                      className="rounded-lg border-gray-300 border p-2 text-sm"
                    />
                  )}
                  {unassignedFeatures.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <div>
                        <h5 className="text-sm font-semibold text-amber-900">Caracteristiques sans onglet</h5>
                        <p className="text-xs text-amber-800">Associez chaque caracteristique a un onglet existant pour ce mode et type de bien.</p>
                      </div>
                      <div className="space-y-2">
                        {unassignedFeatures.map((feature) => {
                          const draft = featureDrafts[feature.id] || {
                            nom: feature.nom || '',
                            type_caracteristique: (
                              feature.type_caracteristique === 'valeur'
                                ? 'valeur'
                                : feature.type_caracteristique === 'choix_multiple'
                                  ? 'choix_multiple'
                                  : 'simple'
                            ) as 'simple' | 'choix_multiple' | 'valeur',
                            choix: stringifyFeatureChoices(feature.choix_json),
                            unite: feature.unite || '',
                            onglet_id: '',
                            visibilite_client: (Number(feature.visibilite_client) === 0 ? 0 : 1) as 0 | 1
                          };
                          return (
                            <div key={`unassigned-${feature.id}`} className="grid grid-cols-1 md:grid-cols-5 gap-2 rounded-lg border border-amber-200 bg-white p-2">
                              <input value={draft.nom} onChange={(e) => handleFeatureDraftChange(feature.id, { nom: e.target.value })} className="rounded-lg border-gray-300 border p-2 text-sm" />
                              <select value={draft.onglet_id} onChange={(e) => handleFeatureDraftChange(feature.id, { onglet_id: e.target.value })} className="rounded-lg border-gray-300 border p-2 text-sm">
                                <option value="">Choisir onglet</option>
                                {featureTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.nom}</option>)}
                              </select>
                              <select value={draft.type_caracteristique} onChange={(e) => handleFeatureDraftChange(feature.id, { type_caracteristique: e.target.value as 'simple' | 'choix_multiple' | 'valeur' })} className="rounded-lg border-gray-300 border p-2 text-sm">
                                <option value="simple">Simple</option>
                                <option value="choix_multiple">Choix multiple</option>
                                <option value="valeur">Valeur</option>
                              </select>
                              <input value={draft.type_caracteristique === 'choix_multiple' ? draft.choix : draft.unite} onChange={(e) => handleFeatureDraftChange(feature.id, draft.type_caracteristique === 'choix_multiple' ? { choix: e.target.value } : { unite: e.target.value })} placeholder={draft.type_caracteristique === 'choix_multiple' ? 'Choix (si multiple)' : 'Unite (si valeur)'} className="rounded-lg border-gray-300 border p-2 text-sm" />
                              <button type="button" onClick={() => void handleUpdateFeature(feature)} disabled={featureSaving || !draft.onglet_id} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-60">Associer</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {visibleFeaturesForSelectedTab.map((feature) => {
                      const draft = featureDrafts[feature.id] || {
                        nom: feature.nom || '',
                        type_caracteristique: (
                          feature.type_caracteristique === 'valeur'
                            ? 'valeur'
                            : feature.type_caracteristique === 'choix_multiple'
                              ? 'choix_multiple'
                              : 'simple'
                        ) as 'simple' | 'choix_multiple' | 'valeur',
                        choix: stringifyFeatureChoices(feature.choix_json),
                        unite: feature.unite || '',
                        onglet_id: feature.onglet_id || '',
                        visibilite_client: (Number(feature.visibilite_client) === 0 ? 0 : 1) as 0 | 1
                      };
                      return (
                        <div key={feature.id} className="grid grid-cols-1 md:grid-cols-8 gap-2 p-2 bg-white border border-emerald-200 rounded-lg">
                          <input value={draft.nom} onChange={(e) => handleFeatureDraftChange(feature.id, { nom: e.target.value })} className="rounded-lg border-gray-300 border p-2 text-sm" />
                          <select value={draft.type_caracteristique} onChange={(e) => handleFeatureDraftChange(feature.id, { type_caracteristique: e.target.value as 'simple' | 'choix_multiple' | 'valeur' })} className="rounded-lg border-gray-300 border p-2 text-sm">
                            <option value="simple">Simple</option>
                            <option value="choix_multiple">Choix multiple</option>
                            <option value="valeur">Valeur</option>
                          </select>
                          <select value={draft.visibilite_client} onChange={(e) => handleFeatureDraftChange(feature.id, { visibilite_client: (Number(e.target.value) === 0 ? 0 : 1) as 0 | 1 })} className="rounded-lg border-gray-300 border p-2 text-sm">
                            <option value={1}>Externe</option>
                            <option value={0}>Interne</option>
                          </select>
                          <select value={draft.onglet_id} onChange={(e) => handleFeatureDraftChange(feature.id, { onglet_id: e.target.value })} className="rounded-lg border-gray-300 border p-2 text-sm">
                            {featureTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.nom}</option>)}
                          </select>
                          <input value={draft.choix} onChange={(e) => handleFeatureDraftChange(feature.id, { choix: e.target.value })} placeholder="Choix (si multiple)" className="rounded-lg border-gray-300 border p-2 text-sm" />
                          <input value={draft.unite} onChange={(e) => handleFeatureDraftChange(feature.id, { unite: e.target.value })} placeholder="Unite (si type valeur)" className="rounded-lg border-gray-300 border p-2 text-sm" />
                          <button type="button" onClick={() => void handleUpdateFeature(feature)} disabled={featureSaving} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-60">Modifier</button>
                          <button type="button" onClick={() => void handleUpdateFeatureWithScope(feature, true)} disabled={featureSaving} className="px-3 py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-sm disabled:opacity-60">Appliquer a tous</button>
                          <button type="button" onClick={() => void handleRemoveFeature(feature)} disabled={featureSaving} className="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm disabled:opacity-60">Supprimer</button>
                        </div>
                      );
                    })}
                    {visibleFeaturesForSelectedTab.length === 0 && <span className="text-xs text-gray-500">Aucune caracteristique dans cet onglet</span>}
                  </div>
                </div>
              )}
              {isAppartementVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Détails Appartement (Vente)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Superficie (m²)</label>
                      <input type="number" min={0} step="0.01" name="superficie_m2" value={formData.superficie_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Étage</label>
                      <input type="number" min={0} name="etage" value={formData.etage ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Configuration</label>
                      <input name="configuration" value={formData.configuration || ''} onChange={handleChange} placeholder="S+2, S+3..." className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de SDB</label>
                      <input type="number" min={0} name="nb_salle_bain" value={formData.nb_salle_bain || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Année construction</label>
                      <input type="number" min={1800} max={3000} name="annee_construction" value={formData.annee_construction ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label>
                      <select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label>
                      <select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Distance plage (m)</label>
                      <input type="number" min={0} name="distance_plage_m" value={formData.distance_plage_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {APPARTEMENT_VENTE_BOOLEAN_FIELDS.slice(0, 13).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{APPARTEMENT_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                  {renderTypeProofUploads()}
                  <h5 className="mt-4 text-sm font-semibold text-gray-800">Caractéristiques générales</h5>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {APPARTEMENT_VENTE_BOOLEAN_FIELDS.slice(13).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{APPARTEMENT_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {isLocalCommercialVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Détails Local commercial (Vente)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Surface (m²)</label>
                      <input type="number" min={0} step="0.01" name="surface_local_m2" value={formData.surface_local_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Façade (m)</label>
                      <input type="number" min={0} step="0.01" name="facade_m" value={formData.facade_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hauteur plafond (m)</label>
                      <input type="number" min={0} step="0.01" name="hauteur_plafond_m" value={formData.hauteur_plafond_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Activité recommandée</label>
                      <input name="activite_recommandee" value={formData.activite_recommandee || ''} onChange={handleChange} placeholder="Café, boutique..." className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label>
                      <select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label>
                      <select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS.slice(0, 7).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                  {renderTypeProofUploads()}
                  <h5 className="mt-4 text-sm font-semibold text-gray-800">Caractéristiques générales</h5>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS.slice(7).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {isTerrainVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Détails Terrain (Vente)</h4>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {terrainTabsForRender.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setTerrainSectionTab(section.id)}
                        className={`px-3 py-1.5 text-xs rounded-full border ${terrainSectionTab === section.id ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300'}`}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>

                  {terrainSectionTab === 'informations_generales' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type de terrain *</label>
                        <select name="type_terrain" value={formData.type_terrain || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {Object.entries(TYPE_TERRAIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
                        <input name="terrain_zone" value={formData.terrain_zone || ''} onChange={handleChange} placeholder="Urbaine / touristique..." className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label>
                        <select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label>
                        <select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        {renderTerrainMultiChoice('terrain_disponibilite_reseaux', 'Disponibilite reseaux', TERRAIN_MULTI_OPTIONS.disponibiliteReseaux)}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Hauteur de construction autorisee</label>
                        <select name="terrain_hauteur_construction_autorisee" value={formData.terrain_hauteur_construction_autorisee || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_HAUTEUR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mode affichage prix</label>
                        <select name="terrain_mode_affichage_prix" value={formData.terrain_mode_affichage_prix || 'total_et_m2'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          {Object.entries(TERRAIN_PRIX_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix affiche total (DT)</label>
                        <input type="number" min={0} step="0.01" name="terrain_prix_affiche_total" value={formData.terrain_prix_affiche_total ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix affiche / m2 (DT)</label>
                        <input type="number" min={0} step="0.01" name="terrain_prix_affiche_par_m2" value={formData.terrain_prix_affiche_par_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'dimensions_forme' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Surface (m2) *</label>
                        <input type="number" min={0} step="0.01" name="terrain_surface_m2" value={formData.terrain_surface_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Facade (m)</label>
                        <input type="number" min={0} step="0.01" name="terrain_facade_m" value={formData.terrain_facade_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Route d'acces (largeur en m)</label>
                        <input type="number" min={0} step="0.01" name="terrain_route_acces_largeur_m" value={formData.terrain_route_acces_largeur_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Forme</label>
                        <select name="terrain_forme" value={formData.terrain_forme || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_FORME_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Terrain plat / en pente</label>
                        <select name="terrain_topographie" value={formData.terrain_topographie || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_TOPOGRAPHIE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Distance plage (m)</label>
                        <input type="number" min={0} name="terrain_distance_plage_m" value={formData.terrain_distance_plage_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Terrain d'angle</label>
                        <select value={getBooleanSelectValue(formData.terrain_angle)} onChange={(e) => handleBooleanSelectChange('terrain_angle', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'situation_juridique' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Bornage</label>
                          <select value={getBooleanSelectValue(formData.terrain_bornage)} onChange={(e) => handleBooleanSelectChange('terrain_bornage', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Travaux autorises selon municipalite</label>
                          <select value={getBooleanSelectValue(formData.terrain_travaux_municipalite_autorises)} onChange={(e) => handleBooleanSelectChange('terrain_travaux_municipalite_autorises', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Limites cadastrales</label>
                          <select value={getBooleanSelectValue(formData.terrain_limites_cadastrales)} onChange={(e) => handleBooleanSelectChange('terrain_limites_cadastrales', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Si oui visualiser</label>
                          <select value={getBooleanSelectValue(formData.terrain_visualisation_limites_cadastrales)} onChange={(e) => handleBooleanSelectChange('terrain_visualisation_limites_cadastrales', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Constructible</label>
                          <select value={getBooleanSelectValue(formData.terrain_constructible)} onChange={(e) => handleBooleanSelectChange('terrain_constructible', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                      </div>
                      {renderTerrainTabFeatures()}
                    </div>
                  )}

                  {terrainSectionTab === 'acces_environnement' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Voisinage</label>
                        <select name="terrain_voisinage" value={formData.terrain_voisinage || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_VOISINAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        {renderTerrainMultiChoice('terrain_proximites_commodites', 'Proximite commodites', TERRAIN_MULTI_OPTIONS.proximites)}
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Autres proximites</label>
                        <input name="terrain_proximites_commodites_autres" value={formData.terrain_proximites_commodites_autres || ''} onChange={handleChange} placeholder="Hopital, clinique, etc." className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'viabilisation' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        {renderTerrainMultiChoice('terrain_viabilisation_eau_sources', 'Eau (sources)', TERRAIN_MULTI_OPTIONS.eauSources)}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Canalisation ONAS</label>
                        <select name="terrain_viabilisation_onas" value={formData.terrain_viabilisation_onas || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_ONAS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">STEG</label>
                        <select name="terrain_viabilisation_steg" value={formData.terrain_viabilisation_steg || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_STEG_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gaz de ville</label>
                        <select value={getBooleanSelectValue(formData.terrain_viabilisation_gaz_ville)} onChange={(e) => handleBooleanSelectChange('terrain_viabilisation_gaz_ville', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fibre optique / internet</label>
                        <select value={getBooleanSelectValue(formData.terrain_viabilisation_fibre_optique)} onChange={(e) => handleBooleanSelectChange('terrain_viabilisation_fibre_optique', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Telephone fixe</label>
                        <select value={getBooleanSelectValue(formData.terrain_viabilisation_telephone_fixe)} onChange={(e) => handleBooleanSelectChange('terrain_viabilisation_telephone_fixe', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <h5 className="text-sm font-semibold text-gray-800 mb-2">Caractéristiques générales</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {TERRAIN_VENTE_BOOLEAN_FIELDS.slice(2).map((field) => (
                            <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                              <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                              <span>{TERRAIN_VENTE_BOOLEAN_LABELS[field]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'environnement_naturel' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type du sol</label>
                        <select name="terrain_type_sol" value={formData.terrain_type_sol || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_TYPE_SOL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vegetation</label>
                        <input name="terrain_vegetation" value={formData.terrain_vegetation || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Niveau sonore</label>
                        <select name="terrain_niveau_sonore" value={formData.terrain_niveau_sonore || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_NIVEAU_SONORE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Risque inondation</label>
                        <select value={getBooleanSelectValue(formData.terrain_risque_inondation)} onChange={(e) => handleBooleanSelectChange('terrain_risque_inondation', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Exposition au vent</label>
                        <input name="terrain_exposition_vent" value={formData.terrain_exposition_vent || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'ideal_utilisation' && (
                    <div>
                      {renderTerrainMultiChoice('terrain_ideal_utilisations', 'Ideal pour', TERRAIN_MULTI_OPTIONS.idealUtilisations)}
                      {renderTerrainTabFeatures()}
                    </div>
                  )}

                  {terrainSectionTab === 'documents_disponibles' && (
                    <div>
                      {renderTerrainMultiChoice('terrain_documents_disponibles', 'Documents disponibles', TERRAIN_MULTI_OPTIONS.documents)}
                      {renderTypeProofUploads()}
                      {renderTerrainTabFeatures()}
                    </div>
                  )}
                  {!TERRAIN_SECTION_TABS.some((tab) => tab.id === terrainSectionTab) && (
                    <div>
                      {renderTerrainTabFeatures()}
                    </div>
                  )}
                </div>
              )}
              {isLotissementVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Détails Lotissement (Vente)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de terrains *</label>
                      <input type="number" min={1} name="lotissement_nb_terrains" value={formData.lotissement_nb_terrains ?? 1} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix total (DT)</label>
                      <input type="number" min={0} step="0.01" name="lotissement_prix_total" value={formData.lotissement_prix_total ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mode prix m2 *</label>
                      <select name="lotissement_mode_prix_m2" value={formData.lotissement_mode_prix_m2 || 'm2_unique'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        {Object.entries(LOTISSEMENT_PRIX_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    {(formData.lotissement_mode_prix_m2 || 'm2_unique') === 'm2_unique' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix m2 unique (DT) *</label>
                        <input type="number" min={0} step="0.01" name="lotissement_prix_m2_unique" value={formData.lotissement_prix_m2_unique ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                    )}
                  </div>
                  {(formData.lotissement_mode_prix_m2 || 'm2_unique') === 'paliers' && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-gray-800">Paliers prix m2</h5>
                        <button type="button" onClick={addLotissementPalier} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs">Ajouter palier</button>
                      </div>
                      {(formData.lotissement_paliers_prix_m2 || []).map((row, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <input type="number" min={1} placeholder="Min m2" value={row.min_m2 ?? ''} onChange={(e) => handleLotissementPalierChange(idx, 'min_m2', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                          <input type="number" min={1} placeholder="Max m2 (optionnel)" value={row.max_m2 ?? ''} onChange={(e) => handleLotissementPalierChange(idx, 'max_m2', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                          <input type="number" min={0} step="0.01" placeholder="Prix m2 (DT)" value={row.prix_m2 ?? ''} onChange={(e) => handleLotissementPalierChange(idx, 'prix_m2', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                          <button type="button" onClick={() => removeLotissementPalier(idx)} className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm">Supprimer</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 space-y-2">
                    <h5 className="text-sm font-semibold text-gray-800">Terrains du lotissement</h5>
                    {(formData.lotissement_terrains || []).map((row, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 rounded-lg border border-gray-200 bg-white">
                        <input value={row.reference || generateChildReference('TRN', idx + 1)} readOnly className="rounded-lg border-gray-300 border p-2 bg-gray-50 text-xs font-semibold text-gray-700" />
                        <select value={row.type_terrain || ''} onChange={(e) => handleLotissementTerrainChange(idx, 'type_terrain', e.target.value)} className="rounded-lg border-gray-300 border p-2">
                          <option value="">Type terrain</option>
                          {Object.entries(TYPE_TERRAIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input type="number" min={0} step="0.01" placeholder="Surface m2" value={row.surface_m2 ?? ''} onChange={(e) => handleLotissementTerrainChange(idx, 'surface_m2', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                        <select value={row.type_rue || ''} onChange={(e) => handleLotissementTerrainChange(idx, 'type_rue', e.target.value)} className="rounded-lg border-gray-300 border p-2">
                          <option value="">Type rue</option>
                          {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <select value={row.type_papier || ''} onChange={(e) => handleLotissementTerrainChange(idx, 'type_papier', e.target.value)} className="rounded-lg border-gray-300 border p-2">
                          <option value="">Type papier</option>
                          {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input placeholder="Zone" value={row.terrain_zone || ''} onChange={(e) => handleLotissementTerrainChange(idx, 'terrain_zone', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                        <div className="md:col-span-5 mt-1 rounded-lg border border-dashed border-gray-300 p-2">
                          <div className="text-xs font-medium text-gray-700 mb-2">Preuves Terrain {idx + 1} (type rue / type papier)</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                                <Upload className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Preuve type de rue</span>
                              </label>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_RUE, e, `terrain_${idx + 1}`)}
                                disabled={uploading}
                                className="block w-full text-xs"
                              />
                              <div className="mt-2 grid grid-cols-4 gap-2">
                                {getLotissementTerrainProofs(PROOF_MOTIF_TYPE_RUE, idx + 1).map((img) => (
                                  <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                                    <img src={resolveMediaUrl(img.url)} alt={`Preuve rue terrain ${idx + 1}`} className="w-full h-16 object-cover" />
                                    <button type="button" onClick={() => handleRemoveImage(img.id)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full">
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                                <Upload className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Preuve type de papier</span>
                              </label>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_PAPIER, e, `terrain_${idx + 1}`)}
                                disabled={uploading}
                                className="block w-full text-xs"
                              />
                              <div className="mt-2 grid grid-cols-4 gap-2">
                                {getLotissementTerrainProofs(PROOF_MOTIF_TYPE_PAPIER, idx + 1).map((img) => (
                                  <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                                    <img src={resolveMediaUrl(img.url)} alt={`Preuve papier terrain ${idx + 1}`} className="w-full h-16 object-cover" />
                                    <button type="button" onClick={() => handleRemoveImage(img.id)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full">
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isImmeubleVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Détails Immeuble (Vente)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Surface terrain (m²)</label><input type="number" min={0} step="0.01" name="immeuble_surface_terrain_m2" value={formData.immeuble_surface_terrain_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Surface bâtie (m²)</label><input type="number" min={0} step="0.01" name="immeuble_surface_batie_m2" value={formData.immeuble_surface_batie_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de niveaux</label><input type="number" min={0} name="immeuble_nb_niveaux" value={formData.immeuble_nb_niveaux ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de garages</label><input type="number" min={0} name="immeuble_nb_garages" value={formData.immeuble_nb_garages ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre d'appartements</label><input type="number" min={0} name="immeuble_nb_appartements" value={formData.immeuble_nb_appartements ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de locaux commerciaux</label><input type="number" min={0} name="immeuble_nb_locaux_commerciaux" value={formData.immeuble_nb_locaux_commerciaux ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label><select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">-- Choisir --</option>{Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label><select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">-- Choisir --</option>{Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Distance plage (m)</label><input type="number" min={0} name="immeuble_distance_plage_m" value={formData.immeuble_distance_plage_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                  </div>
                  <div className="mt-4">
                    <h5 className="text-sm font-semibold text-gray-800 mb-2">Appartements de l'immeuble</h5>
                    <div className="space-y-2">
                      {(formData.immeuble_appartements || []).map((row, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 p-3 rounded-lg border border-gray-200 bg-white">
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Référence</label><input value={row.reference || generateChildReference('APT', idx + 1)} readOnly className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-xs font-semibold text-gray-700" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Chambres</label><input type="number" min={0} value={row.chambres || 0} onChange={(e) => handleImmeubleAppartementChange(idx, 'chambres', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - SDB</label><input type="number" min={0} value={row.salle_bain || 0} onChange={(e) => handleImmeubleAppartementChange(idx, 'salle_bain', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Surface (m²)</label><input type="number" min={0} step="0.01" value={row.superficie_m2 ?? ''} onChange={(e) => handleImmeubleAppartementChange(idx, 'superficie_m2', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Configuration</label><input value={row.configuration || ''} onChange={(e) => handleImmeubleAppartementChange(idx, 'configuration', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div className="md:col-span-4 mt-1 rounded-lg border border-dashed border-gray-300 p-2">
                            <div className="text-xs font-medium text-gray-700 mb-2">Preuves Appartement {idx + 1} (type rue / type papier)</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                                  <Upload className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Preuve type de rue</span>
                                </label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_RUE, e, `appartement_${idx + 1}`)}
                                  disabled={uploading}
                                  className="block w-full text-xs"
                                />
                                <div className="mt-2 grid grid-cols-4 gap-2">
                                  {getImmeubleAppartementProofs(PROOF_MOTIF_TYPE_RUE, idx + 1).map((img) => (
                                    <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                                      <img src={resolveMediaUrl(img.url)} alt={`Preuve rue appartement ${idx + 1}`} className="w-full h-16 object-cover" />
                                      <button type="button" onClick={() => handleRemoveImage(img.id)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full">
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                                  <Upload className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Preuve type de papier</span>
                                </label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_PAPIER, e, `appartement_${idx + 1}`)}
                                  disabled={uploading}
                                  className="block w-full text-xs"
                                />
                                <div className="mt-2 grid grid-cols-4 gap-2">
                                  {getImmeubleAppartementProofs(PROOF_MOTIF_TYPE_PAPIER, idx + 1).map((img) => (
                                    <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                                      <img src={resolveMediaUrl(img.url)} alt={`Preuve papier appartement ${idx + 1}`} className="w-full h-16 object-cover" />
                                      <button type="button" onClick={() => handleRemoveImage(img.id)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full">
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {(formData.immeuble_appartements || []).length === 0 && <span className="text-xs text-gray-500">Le nombre de lignes suit le champ "Nombre d'appartements".</span>}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <h6 className="text-sm font-semibold text-gray-800 mb-2">Références garages</h6>
                      <div className="space-y-2">
                        {(formData.immeuble_garages || []).map((row, idx) => (
                          <input key={`garage-${idx}`} value={row.reference || generateChildReference('GAR', idx + 1)} readOnly className="w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-xs font-semibold text-gray-700" />
                        ))}
                        {(formData.immeuble_garages || []).length === 0 && <span className="text-xs text-gray-500">Aucun garage défini.</span>}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <h6 className="text-sm font-semibold text-gray-800 mb-2">Références locaux commerciaux</h6>
                      <div className="space-y-2">
                        {(formData.immeuble_locaux_commerciaux || []).map((row, idx) => (
                          <input key={`local-${idx}`} value={row.reference || generateChildReference('LOC', idx + 1)} readOnly className="w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-xs font-semibold text-gray-700" />
                        ))}
                        {(formData.immeuble_locaux_commerciaux || []).length === 0 && <span className="text-xs text-gray-500">Aucun local commercial défini.</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {IMMEUBLE_VENTE_BOOLEAN_FIELDS.slice(0, 6).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{IMMEUBLE_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                  <h5 className="mt-4 text-sm font-semibold text-gray-800">Caractéristiques générales</h5>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {IMMEUBLE_VENTE_BOOLEAN_FIELDS.slice(6).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{IMMEUBLE_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!isAppartementVente && !isLocalCommercialVente && !isTerrainVente && !isLotissementVente && !isImmeubleVente && <div><label className="block text-sm font-medium text-gray-700 mb-1">Chambres</label><input type="number" name="nb_chambres" value={formData.nb_chambres || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>}
                {!isAppartementVente && !isLocalCommercialVente && !isTerrainVente && !isLotissementVente && !isImmeubleVente && <div><label className="block text-sm font-medium text-gray-700 mb-1">Salles de bain</label><input type="number" name="nb_salle_bain" value={formData.nb_salle_bain || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>}
                {!isTerrainVente && !isLotissementVente && <label htmlFor="menage_en_cours" className="md:col-span-2 flex items-center justify-between gap-3 p-3 rounded-lg border border-emerald-100 bg-emerald-50/60 cursor-pointer">
                  <div>
                    <span className="block text-sm font-medium text-gray-800">Ménage en cours</span>
                    <span className="block text-xs text-gray-500">Indique si le bien est en préparation</span>
                  </div>
                  <input type="checkbox" id="menage_en_cours" name="menage_en_cours" checked={formData.menage_en_cours || false} onChange={handleCheckboxChange} className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                </label>}
              </div>
              <div className="flex justify-between">
                <button type="button" onClick={() => goToStep(2)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                <button type="button" onClick={() => validateStepBeforeContinue(3, 4)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 4</button>
              </div>
            </div>}
            {generalStep === 4 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Banknote className="h-5 w-5 inline text-emerald-600 mr-2" />Tarification</h3>
              {isModeVente ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Méthode de commission</label>
                      <select name="tarification_methode" value={currentTarificationMethode} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="avec_commission">Avec commission</option>
                        <option value="sans_commission">Sans commission</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix affiché client (DT)</label>
                      <input type="number" min={0} step="0.01" name="prix_affiche_client" value={formData.prix_affiche_client ?? formData.prix_nuitee ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    {currentTarificationMethode === 'avec_commission' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix fixe propriétaire (calculé)</label>
                        <input readOnly value={venteTarificationPreview.prixFixeProprietaire} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix fixe propriétaire (DT)</label>
                        <input type="number" min={0} step="0.01" name="prix_fixe_proprietaire" value={formData.prix_fixe_proprietaire ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                    )}
                  </div>
                  {currentTarificationMethode === 'avec_commission' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Commission part propriétaire (%)</label>
                        <input type="number" min={0} step="0.01" name="commission_pourcentage_proprietaire" value={formData.commission_pourcentage_proprietaire ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Commission part client (%)</label>
                        <input type="number" min={0} step="0.01" name="commission_pourcentage_client" value={formData.commission_pourcentage_client ?? DEFAULT_COMMISSION_CLIENT_PERCENT} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Montant max à diminuer (DT)</label>
                        <input type="number" min={0} step="0.01" name="montant_max_reduction_negociation" value={formData.montant_max_reduction_negociation ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix minimum accepté (calculé)</label>
                        <input readOnly value={venteTarificationPreview.prixMinimumAccepte} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix final (DT)</label><input readOnly value={venteTarificationPreview.prixFinal} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Revenu agence (DT)</label><input readOnly value={venteTarificationPreview.revenuAgence} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix fixe propriétaire (DT)</label><input readOnly value={venteTarificationPreview.prixFixeProprietaire} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix / nuit (DT)</label><input type="number" name="prix_nuitee" value={formData.prix_nuitee || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Avance (DT)</label><input type="number" name="avance" value={formData.avance || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Caution (DT)</label><input type="number" name="caution" value={formData.caution || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                </div>
              )}
              <div className="flex justify-between">
                <button type="button" onClick={() => goToStep(3)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                {isModeVente
                  ? <button type="button" onClick={() => validateStepBeforeContinue(4, 5)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 5</button>
                  : <button type="button" onClick={() => validateStepBeforeContinue(4)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Valider etape 4</button>}
              </div>
            </div>}
            {isModeVente && generalStep === 5 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Banknote className="h-5 w-5 inline text-emerald-600 mr-2" />Modalite de paiement (Vente)</h3>
              {isModeVente ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement</label>
                      <select name="modalite_paiement_vente" value={currentModalitePaiementVente} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="comptant">Comptant</option>
                        <option value="facilite">Facilite de paiement</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix total client (DT)</label>
                      <input readOnly value={venteTarificationPreview.prixFinal} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">1ere partie promesse (DT)</label>
                      <input readOnly value={ventePaiementPreview.montantPremierePartiePromesse} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                    </div>
                  </div>
                  {currentModalitePaiementVente === 'facilite' ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Pourcentage 1ere partie (%)</label>
                          <input type="number" min={0} max={100} step="0.01" name="pourcentage_premiere_partie_promesse" value={formData.pourcentage_premiere_partie_promesse ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de tranches</label>
                          <input type="number" min={1} step="1" name="nombre_tranches" value={formData.nombre_tranches ?? 6} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Periode totale (mois)</label>
                          <input type="number" min={1} step="1" name="periode_tranches_mois" value={formData.periode_tranches_mois ?? 6} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">2eme partie restante (DT)</label><input readOnly value={ventePaiementPreview.montantDeuxiemePartie} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Montant par tranche (DT)</label><input readOnly value={ventePaiementPreview.montantParTranche} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Resume</label><input readOnly value={`${ventePaiementPreview.nombreTranches} tranches / ${ventePaiementPreview.periodeTranchesMois} mois`} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Montant comptant (DT)</label><input readOnly value={ventePaiementPreview.montantPremierePartiePromesse} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Reste (DT)</label><input readOnly value={0} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <button type="button" onClick={() => goToStep(4)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                    <button type="button" onClick={() => validateStepBeforeContinue(5)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Valider etape 5</button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">La modalite de paiement est geree uniquement pour le mode vente.</p>
              )}
            </div>}
          </div>
        )}
        {activeTab === 'images' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-semibold mb-4"><ImageIcon className="h-5 w-5 inline text-emerald-600 mr-2" />Gestion des images</h3>
              {normalizeLegacyType((formData.type || 'appartement') as BienType) === 'local_commercial' && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motif d'upload photo du local</label>
                  <input
                    type="text"
                    value={newImageMotif}
                    onChange={(e) => setNewImageMotif(e.target.value)}
                    placeholder="Ex: Facade, Vitrine, Interieur, Reserve..."
                    className="w-full rounded-lg border-gray-300 border p-2"
                  />
                </div>
              )}
              {(isImmeubleVente || isLotissementVente) ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Les images client sont séparées par {(isImmeubleVente ? "unité d'immeuble" : "terrain")} pour éviter tout mélange.
                  </p>
                  {(isImmeubleVente ? immeubleClientImageUnits : lotissementClientImageUnits).map(({ unitKey, label }) => {
                    const unitMotif = buildUnitGalleryMotif(
                      (formData.mode || 'location_saisonniere') as BienMode,
                      normalizeLegacyType((formData.type || 'appartement') as BienType),
                      unitKey
                    );
                    const unitImages = getUnitClientImages(unitKey);
                    return (
                      <div key={unitKey} className="rounded-lg border border-gray-200 p-3">
                        <h4 className="text-sm font-semibold text-gray-800 mb-2">{label}</h4>
                        <div className="flex gap-2 mb-3">
                          <input type="text" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder={`URL de l'image - ${label}`} className="flex-1 rounded-lg border-gray-300 border p-2" />
                          <button type="button" onClick={() => handleAddImage(unitMotif)} disabled={!newImageUrl.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">Ajouter</button>
                        </div>
                        <div className="mb-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                            <Upload className="h-4 w-4 text-emerald-600" />
                            <span>Ou upload ({label})</span>
                          </label>
                          <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, unitMotif)} disabled={uploading} className="block w-full text-sm" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                          {unitImages.map((img, index) => (
                            <div key={img.id} className="relative group rounded-lg overflow-hidden border border-gray-200">
                              <img src={resolveMediaUrl(img.url)} alt={label} className="w-full h-24 object-cover" />
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(img.id)}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full shadow"
                                aria-label="Supprimer l'image"
                                title="Supprimer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              <span className="absolute bottom-1 right-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">{index + 1}/{unitImages.length}</span>
                            </div>
                          ))}
                          {unitImages.length === 0 && <div className="col-span-full text-xs text-gray-500">Aucune image pour {label.toLowerCase()}.</div>}
                        </div>
                      </div>
                    );
                  })}
                  {isImmeubleVente && immeubleClientImageUnits.length === 0 && (
                    <div className="text-xs text-gray-500">Ajoutez le nombre d'appartements, de garages ou de locaux commerciaux dans les détails immeuble.</div>
                  )}
                  {uploading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600 mt-2"></div>}
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-4"><input type="text" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="URL de l'image" className="flex-1 rounded-lg border-gray-300 border p-2" /><button type="button" onClick={handleAddImage} disabled={!newImageUrl.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">Ajouter</button></div>
                  <div className="mb-6">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Upload className="h-4 w-4 text-emerald-600" />
                      <span>Ou upload</span>
                    </label>
                    <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading} className="block w-full text-sm" />
                    {uploading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600 mt-2"></div>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {clientVisibleImages.map((img, index) => (
                      <div
                        key={img.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, img.id)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(img.id)}
                        onDragEnd={handleDragEnd}
                        className={`relative group rounded-lg overflow-hidden border border-gray-200 ${draggedImageIndex === img.id ? 'opacity-60 ring-2 ring-emerald-300' : ''}`}
                      >
                        <img src={resolveMediaUrl(img.url)} alt="" className="w-full h-32 object-cover" />
                        <div className="absolute top-2 right-2 p-1 bg-black/40 text-white rounded cursor-grab"><GripVertical className="h-3.5 w-3.5" /></div>
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMoveImage(img.id, 'up')}
                            disabled={index === 0}
                            className="p-1.5 bg-white/95 rounded-full disabled:opacity-50 shadow"
                            aria-label="Monter l'image"
                            title="Monter"
                          >
                            <ChevronUp className="h-4 w-4 text-gray-800" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveImage(img.id, 'down')}
                            disabled={index === clientVisibleImages.length - 1}
                            className="p-1.5 bg-white/95 rounded-full disabled:opacity-50 shadow"
                            aria-label="Descendre l'image"
                            title="Descendre"
                          >
                            <ChevronDown className="h-4 w-4 text-gray-800" />
                          </button>
                          {index !== 0 && (
                            <button
                              type="button"
                              onClick={() => handleSetMainImage(index)}
                              className="p-1.5 bg-emerald-500 text-white rounded-full shadow"
                              aria-label="Définir comme image principale"
                              title="Définir en principale"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(img.id)}
                            className="p-1.5 bg-red-500 text-white rounded-full shadow"
                            aria-label="Supprimer l'image"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {index === 0 && <span className="absolute top-2 left-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded">Principale</span>}
                        {!!img.motif_upload && <span className="absolute top-2 left-20 bg-white/90 text-gray-700 text-xs px-2 py-0.5 rounded border">{img.motif_upload}</span>}
                        <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">{index + 1}/{clientVisibleImages.length}</span>
                      </div>
                    ))}
                    {clientVisibleImages.length === 0 && <div className="col-span-full text-center py-8 text-gray-500">Aucune image</div>}
                  </div>
                  <div className="mt-8 border-t border-gray-200 pt-6">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Vidéos du bien</h4>
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newVideoUrl}
                        onChange={(e) => setNewVideoUrl(e.target.value)}
                        placeholder="Lien YouTube"
                        className="flex-1 rounded-lg border-gray-300 border p-2"
                      />
                      <button
                        type="button"
                        onClick={handleAddVideo}
                        disabled={!newVideoUrl.trim()}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50"
                      >
                        Ajouter
                      </button>
                    </div>
                    <p className="mb-6 text-xs text-gray-500">Collez un lien YouTube classique, `youtu.be` ou `shorts`. La vidéo sera affichée directement dans la page du bien.</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {clientVisibleVideos.map((video, index) => (
                        <div key={video.id} className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 p-2">
                          <iframe
                            src={toYouTubeEmbedUrl(video.url) || ''}
                            title={`Video ${index + 1}`}
                            className="w-full h-56 rounded-lg bg-black"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(video.id)}
                            className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full shadow"
                            aria-label="Supprimer la vidéo"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <span className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-2 py-0.5 rounded">{index + 1}/{clientVisibleVideos.length}</span>
                        </div>
                      ))}
                      {clientVisibleVideos.length === 0 && <div className="col-span-full text-center py-6 text-gray-500">Aucune vidéo</div>}
                    </div>
                  </div>
                </>
              )}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('general');
                    setGeneralStep(isModeVente ? 5 : 4);
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  Retour
                </button>
                {!isModeVente ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('calendar')}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"
                  >
                    Continuer vers calendrier
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toast.success('Images validees')}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"
                  >
                    Valider images
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {!isModeVente && activeTab === 'calendar' && (
          <div className="max-w-5xl mx-auto">
            <AdminCalendar dates={unavailableDates} onDatesChange={setUnavailableDates} />
          </div>
        )}
      </div>
      <Dialog.Root open={validationDialogState.open} onOpenChange={(open) => setValidationDialogState((prev) => ({ ...prev, open }))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Dialog.Content className="fixed z-[61] left-1/2 top-1/2 w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
            <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Champs obligatoires manquants
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-600">Completez les champs ci-dessous avant de continuer.</Dialog.Description>
            <div className="mt-4 space-y-3">
              {validationDialogState.issues.map((issue, index) => (
                <div key={`${issue.step}-${issue.fieldName}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border border-red-100 bg-red-50/60 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Etape {issue.step} - {issue.label}</p>
                    <p className="text-sm text-gray-600">{issue.message}</p>
                  </div>
                  <button type="button" onClick={() => focusValidationIssue(issue)} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white">
                    Allez
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setValidationDialogState({ open: false, issues: [] })} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700">Fermer</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  );
}

function AdminCalendar({ dates, onDatesChange }: { dates: DateStatus[], onDatesChange: (dates: DateStatus[]) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'blocked' | 'booked' | 'pending'>('blocked');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const monthStart = startOfMonth(currentMonth), monthEnd = endOfMonth(currentMonth), calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }), calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 }), days = eachDayOfInterval({ start: calendarStart, end: calendarEnd }), today = startOfDay(new Date());

  const getDateStatus = (date: Date): DateStatus | undefined => dates.find(range => range?.start && range?.end && isWithinInterval(date, { start: parseISO(range.start), end: parseISO(range.end) }));
  const handleDateClick = (date: Date) => { if (isBefore(date, today)) return; if (!selectionStart || (selectionStart && selectionEnd)) { setSelectionStart(date); setSelectionEnd(null); } else { if (date < selectionStart) setSelectionStart(date); else setSelectionEnd(date); } };
  const buildDateStatus = (start: string, end: string): DateStatus => ({ start, end, status: selectedStatus, color: selectedStatus === 'booked' ? '#ef4444' : selectedStatus === 'pending' ? '#f97316' : '#111827' });
  const handleAddPeriod = () => { if (!selectionStart || !selectionEnd) return; const start = format(selectionStart < selectionEnd ? selectionStart : selectionEnd, 'yyyy-MM-dd'); const end = format(selectionStart < selectionEnd ? selectionEnd : selectionStart, 'yyyy-MM-dd'); onDatesChange([...dates, buildDateStatus(start, end)]); setSelectionStart(null); setSelectionEnd(null); toast.success('Période ajoutée'); };
  const handleManualAddPeriod = () => { if (!manualStartDate || !manualEndDate) return toast.error('Choisissez les deux dates'); if (manualEndDate < manualStartDate) return toast.error('La date de fin doit être après la date de début'); onDatesChange([...dates, buildDateStatus(manualStartDate, manualEndDate)]); setManualStartDate(''); setManualEndDate(''); toast.success('Période ajoutée'); };
  const handleRemovePeriod = (index: number) => { onDatesChange(dates.filter((_, i) => i !== index)); toast.success('Période supprimée'); };
  const getDayClassName = (date: Date) => { const status = getDateStatus(date); const isPast = isBefore(date, today); const isSelected = (selectionStart && date.getTime() === selectionStart.getTime()) || (selectionEnd && date.getTime() === selectionEnd.getTime()); const inSelectionRange = selectionStart && selectionEnd && isWithinInterval(date, { start: selectionStart < selectionEnd ? selectionStart : selectionEnd, end: selectionStart < selectionEnd ? selectionEnd : selectionStart }); let base = "w-full h-12 sm:h-14 lg:h-16 flex items-center justify-center text-sm rounded-lg cursor-pointer "; if (isPast) base += "text-gray-300 cursor-not-allowed "; else if (status) base += "text-white font-medium "; else if (isSelected || inSelectionRange) base += "bg-emerald-500 text-white font-bold "; else base += "bg-green-100 text-green-700 hover:bg-green-200 "; return base; };
  const getDayBackground = (date: Date) => { const status = getDateStatus(date); if (status?.color) return status.color; if (status?.status === 'booked') return '#ef4444'; if (status?.status === 'pending') return '#f97316'; if (status?.status === 'blocked') return '#111827'; return ''; };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <h3 className="text-lg font-semibold mb-4"><CalendarIcon className="h-5 w-5 inline text-emerald-600 mr-2" />Calendrier</h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4"><div className="flex-1 min-w-[200px]"><label className="block text-xs font-medium text-gray-500 mb-1">Statut</label><select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as 'blocked' | 'booked' | 'pending')} className="w-full rounded-lg border-gray-300 border p-2"><option value="blocked">Bloqué</option><option value="booked">Réservé</option><option value="pending">En attente</option></select></div></div>
        <div className="flex items-center gap-2"><span className="text-sm text-gray-600">Sélection calendrier: {selectionStart ? format(selectionStart, 'dd/MM/yyyy') : '...'}{selectionEnd ? ` - ${format(selectionEnd, 'dd/MM/yyyy')}` : ''}</span><button type="button" onClick={handleAddPeriod} disabled={!selectionStart || !selectionEnd} className="ml-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">Ajouter sélection</button></div>
        <div className="border-t border-gray-200 pt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Date début</label><input type="date" value={manualStartDate} onChange={(e) => setManualStartDate(e.target.value)} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Date fin</label><input type="date" value={manualEndDate} onChange={(e) => setManualEndDate(e.target.value)} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div>
          <div className="sm:col-span-2 sm:flex sm:justify-end"><button type="button" onClick={handleManualAddPeriod} disabled={!manualStartDate || !manualEndDate} className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">Confirmer saisie manuelle</button></div>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4"><button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="h-5 w-5" /></button><h4 className="text-lg font-semibold capitalize">{format(currentMonth, "MMMM yyyy", { locale: fr })}</h4><button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="h-5 w-5" /></button></div>
      <div className="grid grid-cols-7 gap-1 mb-2">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">{day}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">{days.map((day, idx) => <div key={idx} onClick={() => handleDateClick(day)}><div className={getDayClassName(day)} style={{ backgroundColor: getDayBackground(day) || undefined }}><span>{format(day, "d")}</span></div></div>)}</div>
      {dates.length > 0 && <div className="mt-6 pt-4 border-t"><h5 className="font-semibold mb-3">Périodes</h5><div className="space-y-2">{dates.map((date, index) => <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><div className="flex items-center gap-3"><div className="w-4 h-4 rounded" style={{ backgroundColor: date.color || '#111827' }}></div><span className="text-sm">{format(parseISO(date.start), 'dd/MM/yyyy')} - {format(parseISO(date.end), 'dd/MM/yyyy')}</span></div><button onClick={() => handleRemovePeriod(index)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button></div>)}</div></div>}
    </div>
  );
}

function BienPreview({ bien, zones, onSaveVisibility }: { bien: Bien; zones: Zone[]; onSaveVisibility: (bienId: string, patch: { visible_sur_site: boolean; ui_config: BienUiConfig | null }) => Promise<void>; }) {
  const [draftVisibleSurSite, setDraftVisibleSurSite] = useState(bien.visible_sur_site !== false);
  const [draftUiConfig, setDraftUiConfig] = useState<BienUiConfig>(bien.ui_config || {});
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [featureReloadKey, setFeatureReloadKey] = useState(0);

  useEffect(() => {
    setDraftVisibleSurSite(bien.visible_sur_site !== false);
    setDraftUiConfig(bien.ui_config || {});
  }, [bien]);

  const persistVisibility = async (nextVisibleSurSite: boolean, nextUiConfig: BienUiConfig, key: string) => {
    setTogglingKey(key);
    try {
      await onSaveVisibility(bien.id, { visible_sur_site: nextVisibleSurSite, ui_config: nextUiConfig });
    } finally {
      setTogglingKey(null);
    }
  };

  const handleToggleVisibility = async (type: 'section' | 'terrain_tab', key: string, nextValue: boolean) => {
    if (type === 'section') {
      const nextUiConfig = { ...draftUiConfig, [key]: nextValue } as BienUiConfig;
      setDraftUiConfig(nextUiConfig);
      await persistVisibility(draftVisibleSurSite, nextUiConfig, `${type}:${key}`);
      return;
    }
    const nextUiConfig = {
      ...draftUiConfig,
      terrain_tabs: {
        ...(draftUiConfig.terrain_tabs || {}),
        [key]: nextValue,
      },
    };
    setDraftUiConfig(nextUiConfig);
    await persistVisibility(draftVisibleSurSite, nextUiConfig, `${type}:${key}`);
  };

  const handleToggleFeatureVisibility = async (
    feature: { id: string; nom: string; onglet_id?: string | null; type_caracteristique?: string | null; unite?: string | null },
    nextValue: boolean,
  ) => {
    const requestKey = `feature:${feature.id}`;
    setTogglingKey(requestKey);
    try {
      const payload = {
        mode_bien: bien.mode,
        type_bien: bien.type,
        bien_id: bien.id,
        nom: feature.nom,
        type_caracteristique: feature.type_caracteristique === 'valeur' ? 'valeur' : feature.type_caracteristique === 'choix_multiple' ? 'choix_multiple' : 'simple',
        unite: feature.type_caracteristique === 'valeur' ? (feature.unite || '') : '',
        onglet_id: feature.onglet_id || '',
        visibilite_client: nextValue ? 1 : 0,
      };
      const base = String(API_URL || '').replace(/\/+$/, '');
      const normalizedBase = base.replace(/\/api$/i, '');
      const urls = Array.from(new Set([
        `${base}/caracteristiques/${encodeURIComponent(feature.id)}`,
        `${normalizedBase}/api/caracteristiques/${encodeURIComponent(feature.id)}`,
      ]));
      let response: Response | null = null;
      for (const url of urls) {
        const next = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      const data = response && response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : null;
      if (!response?.ok) {
        throw new Error(data?.error || 'Erreur mise a jour caracteristique');
      }
      setFeatureReloadKey((prev) => prev + 1);
      toast.success('Visibilite caracteristique mise a jour');
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message ? `Erreur caracteristique: ${message}` : 'Erreur caracteristique');
      throw error;
    } finally {
      setTogglingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Visibilite du bien</h3>
            <p className="text-xs text-gray-500">Les blocs se pilotent directement dans la page ci-dessous.</p>
          </div>
          <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <span className="text-sm text-gray-700">Visible sur le site</span>
            <input
              type="checkbox"
              checked={draftVisibleSurSite}
              onChange={async (e) => {
                const next = e.target.checked;
                setDraftVisibleSurSite(next);
                await persistVisibility(next, draftUiConfig, 'site_visibility');
              }}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600"
            />
          </label>
        </div>
      </div>
      {bien.mode === 'vente' ? (
        <PublicBienPageView
          bien={{ ...bien, visible_sur_site: draftVisibleSurSite, ui_config: draftUiConfig }}
          zones={zones}
          backHref={null}
          previewMode
          onToggleVisibility={handleToggleVisibility}
          onToggleFeatureVisibility={handleToggleFeatureVisibility}
          togglingKey={togglingKey}
          featureReloadKey={featureReloadKey}
        />
      ) : (
        <LocationPublicBienPageView
          bien={{ ...bien, visible_sur_site: draftVisibleSurSite, ui_config: draftUiConfig }}
          zones={zones}
          previewMode
          onToggleVisibility={handleToggleVisibility}
          onToggleFeatureVisibility={handleToggleFeatureVisibility}
          togglingKey={togglingKey}
          featureReloadKey={featureReloadKey}
        />
      )}
    </div>
  );
}
