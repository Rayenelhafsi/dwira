import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Calendar, AlertCircle, Search, ArrowDownUp, Eye, Download, Upload, Trash2, Plus, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import AvailabilityCalendar from '../../components/AvailabilityCalendar';
import { calculateAccommodationPricing, type SeasonalPricingPeriod } from '../../utils/seasonalPricing';
import { computeGuestLimits } from '../../utils/guestLimits';
import { getServiceDisplayPrice, splitServicesByTarification } from '../../utils/servicePayants';
import { readSessionPageCache, writeSessionPageCache } from '../utils/sessionPageCache';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const CONTRACTS_CACHE_KEY = 'dwira_admin_contrats_cache_v1';

async function getApiErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || '').trim();
    if (message) return message;
  } else {
    const text = await response.text().catch(() => '');
    if (text && !text.startsWith('<!DOCTYPE')) return text;
  }
  return fallback;
}

type ContratApi = {
  id: string;
  bien_id: string;
  locataire_id: string;
  date_debut: string;
  date_fin: string;
  montant_recu: number;
  url_pdf?: string;
  owner_url_pdf?: string;
  template_vars_json?: string | null;
  creation_steps_json?: string | null;
  resolved_template_vars?: Record<string, string> | null;
  client_sent_at?: string | null;
  origine?: 'manuel' | 'automatique' | string;
  statut: 'actif' | 'termine' | 'resilie';
  created_at: string;
  bien_titre?: string;
  locataire_nom?: string;
  reservation_demand_id?: string | null;
  payment_receipt_image_url?: string | null;
  payment_receipt_uploaded_at?: string | null;
  payment_receipt_note?: string | null;
  montant_donne_proprietaire?: number | null;
  montant_total_proprietaire?: number | null;
  profit_net?: number | null;
  reservation_demand_status?: string | null;
  reservation_payment_mode?: string | null;
  pricing_amicale_id?: string | null;
  amicale_name?: string | null;
};

type BienApi = {
  id: string;
  mode?: string;
  type?: string;
  reference?: string;
  proprietaire_nom?: string;
  titre?: string;
  prix_nuitee?: number;
  prix_semaine?: number | null;
  caution?: number | null;
  guests?: number;
  pricing_periods?: Array<{
    id?: string;
    start?: string;
    end?: string;
    start_date?: string;
    end_date?: string;
    prix_nuitee?: number;
    prix_semaine?: number | null;
  }>;
  location_saisonniere_config?: {
    limite_personnes_nuit?: number;
    limitePersonnesNuit?: number;
    limite_personne_nuit?: number;
    max_adultes?: number;
    max_enfants?: number;
    avance_pourcentage?: number;
    avancePourcentage?: number;
    montant_caution?: number;
    montantCaution?: number;
  };
  location_saisonniere_config_json?: string | Record<string, any> | null;
  locationSaisonniereConfig?: Record<string, any> | null;
  image_url?: string;
  image?: string;
};

type MediaApi = {
  id: string;
  bien_id: string;
  type?: string;
  url?: string;
  motif_upload?: string | null;
  position?: number | null;
};

type LocataireApi = {
  id: string;
  nom: string;
};

type UnavailableDateApi = {
  id?: string;
  start_date: string;
  end_date: string;
  status: 'blocked' | 'pending' | 'booked';
};

type ContractsPageCachePayload = {
  contrats: ContratApi[];
  biens: BienApi[];
  locataires: LocataireApi[];
  bienImageById: Record<string, string>;
};

type SortOption = 'created_desc' | 'created_asc' | 'start_desc' | 'start_asc';
type OriginFilter = 'all' | 'manuel' | 'automatique';
type ManualStep = 1 | 2 | 3;
type ContractCategoryFilter = 'all' | 'rejected' | 'pending_payment' | 'finished_paid';

type ManualReservationDraft = {
  client_first_name: string;
  client_last_name: string;
  client_email: string;
  client_telephone: string;
  client_address: string;
  identity_document_type: 'cin_tn' | 'passport_tn' | 'passport_foreign';
  identity_document_number: string;
  representative: 'chayma' | 'ghaith';
  arrival_time: string;
  departure_time: string;
  payment_id: string;
  payment_deadline_date: string;
  payment_deadline_time: string;
  signature_city: string;
  service_1: string;
  prix_service_1: string;
  service_2: string;
  prix_service_2: string;
  service_3: string;
  prix_service_3: string;
  adult_guests: string;
  child_guests: string;
  caution_amount: string;
  total_amount: string;
  amount_due_now: string;
  payment_mode: 'avance' | 'totalite';
  payment_method: 'virement' | 'especes' | 'carte' | 'cheque';
  client_note: string;
};

const MANUAL_DEFAULT: ManualReservationDraft = {
  client_first_name: '',
  client_last_name: '',
  client_email: '',
  client_telephone: '',
  client_address: '',
  identity_document_type: 'cin_tn',
  identity_document_number: '',
  representative: 'ghaith',
  arrival_time: '14:00',
  departure_time: '11:00',
  payment_id: '',
  payment_deadline_date: '',
  payment_deadline_time: '',
  signature_city: '',
  service_1: '',
  prix_service_1: '',
  service_2: '',
  prix_service_2: '',
  service_3: '',
  prix_service_3: '',
  adult_guests: '1',
  child_guests: '0',
  caution_amount: '',
  total_amount: '',
  amount_due_now: '',
  payment_mode: 'avance',
  payment_method: 'virement',
  client_note: '',
};

const BIEN_IMAGE_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23e5e7eb'/%3E%3Cpath d='M150 240l90-88 62 62 52-52 88 78H150z' fill='%23cbd5e1'/%3E%3Ccircle cx='232' cy='124' r='30' fill='%23cbd5e1'/%3E%3C/svg%3E";

const DEFAULT_TEMPLATE_VAR_KEYS = [
  'fullName', 'identityRef', 'userAddress', 'userPhone',
  'typeLogement', 'adresseBien', 'capacite', 'adultes', 'enfants', 'equipementsBien',
  'jj1', 'mm1', 'jj2', 'mm2', 'heureArrivee', 'heureDepart',
  'loyerTotal', 'acompteReservation', 'jjp', 'mmp', 'hhp', 'minp',
  'idPaiement', 'soldeArrivee', 'modePaiement', 'caution',
  'VS', 'JJs', 'MMS'
] as const;

type TemplateVarKey = typeof DEFAULT_TEMPLATE_VAR_KEYS[number];

const MANUAL_TEMPLATE_VAR_LABELS: Record<TemplateVarKey, string> = {
  fullName: 'Nom complet',
  identityRef: 'CIN / passeport',
  userAddress: 'Adresse client',
  userPhone: 'Telephone client',
  typeLogement: 'Type logement',
  adresseBien: 'Adresse bien',
  capacite: 'Capacite',
  adultes: 'Adultes',
  enfants: 'Enfants',
  equipementsBien: 'Equipements',
  jj1: 'Jour arrivee',
  mm1: 'Mois arrivee',
  jj2: 'Jour depart',
  mm2: 'Mois depart',
  heureArrivee: 'Heure arrivee',
  heureDepart: 'Heure depart',
  loyerTotal: 'Loyer total',
  acompteReservation: 'Acompte',
  jjp: 'Jour paiement',
  mmp: 'Mois paiement',
  hhp: 'Heure paiement',
  minp: 'Minute paiement',
  idPaiement: 'ID paiement',
  soldeArrivee: 'Solde arrivee',
  modePaiement: 'Mode paiement',
  caution: 'Caution',
  VS: 'Ville signature',
  JJs: 'Jour signature',
  MMS: 'Mois signature',
};

const MANUAL_TEMPLATE_VAR_PLACEHOLDERS: Record<TemplateVarKey, string> = {
  fullName: 'Nom et prenom du locataire',
  identityRef: 'Ex: CIN 12345678',
  userAddress: 'Adresse du locataire',
  userPhone: 'Telephone du locataire',
  typeLogement: 'Ex: Appartement S+2',
  adresseBien: 'Adresse ou zone du bien',
  capacite: 'Ex: 5',
  adultes: 'Ex: 2 adulte(s)',
  enfants: 'Ex: 1 enfant(s)',
  equipementsBien: 'Climatisation, terrasse...',
  jj1: 'Jour',
  mm1: 'Mois',
  jj2: 'Jour',
  mm2: 'Mois',
  heureArrivee: 'Ex: 14:00',
  heureDepart: 'Ex: 11:00',
  loyerTotal: 'Ex: 1200 TND',
  acompteReservation: 'Ex: 360 TND',
  jjp: 'Jour',
  mmp: 'Mois',
  hhp: 'Heure',
  minp: 'Minute',
  idPaiement: 'Ex: VIR-2026-001',
  soldeArrivee: 'Ex: 840 TND',
  modePaiement: 'Virement bancaire',
  caution: 'Ex: 500',
  VS: 'Ex: Kelibia',
  JJs: 'Jour',
  MMS: 'Mois',
};

const MANUAL_TEMPLATE_FIELD_GROUPS: Array<{ title: string; keys: TemplateVarKey[] }> = [
  { title: 'Identite locataire', keys: ['fullName', 'identityRef', 'userPhone', 'userAddress'] },
  { title: 'Bien et sejour', keys: ['typeLogement', 'adresseBien', 'capacite', 'adultes', 'enfants', 'equipementsBien', 'heureArrivee', 'heureDepart'] },
  { title: 'Dates sejour', keys: ['jj1', 'mm1', 'jj2', 'mm2'] },
  { title: 'Paiement', keys: ['loyerTotal', 'acompteReservation', 'soldeArrivee', 'idPaiement', 'modePaiement', 'caution', 'jjp', 'mmp', 'hhp', 'minp'] },
  { title: 'Signature', keys: ['VS', 'JJs', 'MMS'] },
];

const MANUAL_STEP1_GROUP_TITLES = new Set(['Identite locataire']);
const MANUAL_STEP2_GROUP_TITLES = new Set(['Bien et sejour', 'Dates sejour', 'Paiement']);

function createEmptyTemplateVars(): Record<string, string> {
  return Object.fromEntries(DEFAULT_TEMPLATE_VAR_KEYS.map((key) => [key, '']));
}

function splitManualFullName(fullName: string) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function normalizeManualIdentityNumber(identityRef: string): string {
  return String(identityRef || '')
    .replace(/^cin\s*/i, '')
    .replace(/^passeport\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getManualFieldClass(hasError: boolean) {
  return `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
    hasError
      ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-2 focus:ring-red-100'
      : 'border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
  }`;
}

function formatManualAmount(value: number): string {
  if (!Number.isFinite(value)) return '';
  return `${Math.round(value * 100) / 100} TND`;
}

function getManualDateParts(sqlDate: string) {
  const raw = String(sqlDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { dd: '', mm: '' };
  const [, mm, dd] = raw.split('-');
  return {
    dd: String(Number(dd)),
    mm: String(Number(mm)),
  };
}

function getManualTimeParts(value: string) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return { hh: '', min: '' };
  const [hh, min] = raw.split(':');
  return {
    hh,
    min,
  };
}

function buildManualPropertyLabel(bien: BienApi | null): string {
  if (!bien) return '';
  const reference = String(bien.reference || '').trim();
  const title = String(bien.titre || '').trim();
  if (reference && title) return `Ref ${reference}, ${title}`;
  return title || (reference ? `Ref ${reference}` : '');
}

function parseContractCreationHistory(raw: string | null | undefined): Record<string, any> | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}

function parseTemplateVars(raw: unknown): Record<string, string> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).map(([key, value]) => [String(key), String(value ?? '').trim()])
    );
  }
  const text = String(raw || '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [String(key), String(value ?? '').trim()])
    );
  } catch {
    return {};
  }
}

function resolveContractTemplateVars(contrat: Pick<ContratApi, 'template_vars_json' | 'creation_steps_json' | 'resolved_template_vars'> | null | undefined): Record<string, string> {
  if (!contrat) return {};
  const resolvedVars = parseTemplateVars(contrat.resolved_template_vars);
  if (Object.keys(resolvedVars).length > 0) return resolvedVars;

  const directVars = parseTemplateVars(contrat.template_vars_json);
  if (Object.keys(directVars).length > 0) return directVars;

  const history = parseContractCreationHistory(contrat.creation_steps_json);
  const step1Fields = parseTemplateVars(history?.step_1?.fields);
  if (Object.keys(step1Fields).length > 0) return step1Fields;

  const rootTemplateVars = parseTemplateVars(history?.template_vars ?? history?.templateVars);
  if (Object.keys(rootTemplateVars).length > 0) return rootTemplateVars;

  return {};
}

function getContractCardDetails(contrat: ContratApi, bien?: BienApi | null) {
  const origin = String(contrat.origine || 'automatique').toLowerCase() === 'manuel' ? 'manuel' : 'automatique';
  const templateVars = parseTemplateVars(contrat.template_vars_json);
  const manualTitle = String(templateVars.typeLogement || '').trim();
  const manualLocataire = String(templateVars.fullName || '').trim();
  const manualAcompte = String(templateVars.acompteReservation || '').trim();

  return {
    title: origin === 'manuel'
      ? (manualTitle || contrat.bien_titre || bien?.titre || 'Bien Inconnu')
      : (contrat.bien_titre || bien?.titre || 'Bien Inconnu'),
    locataire: origin === 'manuel'
      ? (manualLocataire || contrat.locataire_nom || 'Inconnu')
      : (contrat.locataire_nom || 'Inconnu'),
    montantRecu: origin === 'manuel'
      ? (manualAcompte || `${Number(contrat.montant_recu || 0)} DT`)
      : `${Number(contrat.montant_recu || 0)} DT`,
  };
}

function getContractCategory(contrat: ContratApi): ContractCategoryFilter {
  const demandStatus = String(contrat.reservation_demand_status || '').trim().toLowerCase();
  const contractStatus = String(contrat.statut || '').trim().toLowerCase();
  if (demandStatus === 'demande_rejetee_admin' || contractStatus === 'resilie') return 'rejected';
  if (demandStatus === 'succes_paiement' || contractStatus === 'termine') return 'finished_paid';
  return 'pending_payment';
}

function getContractCategoryLabel(category: ContractCategoryFilter) {
  if (category === 'rejected') return 'Contrat rejete';
  if (category === 'pending_payment') return 'Contrat genere en attente de paiement';
  if (category === 'finished_paid') return 'Contrat fini et paye';
  return 'Tous les contrats';
}

function extractManualPropertyEquipements(bien: BienApi | null, seasonalConfig: Record<string, any>): string {
  if (!bien) return '';
  const scalarFlags: Array<[unknown, string]> = [
    [(seasonalConfig as any)?.climatisation, 'Climatisation'],
    [(seasonalConfig as any)?.terrasse, 'Terrasse'],
    [(seasonalConfig as any)?.vue_mer ?? (seasonalConfig as any)?.vue === 'mer', 'Vue mer'],
    [(seasonalConfig as any)?.proche_plage, 'Proche plage'],
    [(seasonalConfig as any)?.ascenseur, 'Ascenseur'],
  ];
  const arraySources = [
    Array.isArray((seasonalConfig as any)?.confort_equipements_interieurs) ? (seasonalConfig as any).confort_equipements_interieurs : [],
    Array.isArray((seasonalConfig as any)?.confortEquipementsInterieurs) ? (seasonalConfig as any).confortEquipementsInterieurs : [],
    Array.isArray((seasonalConfig as any)?.exterieur_jardin) ? (seasonalConfig as any).exterieur_jardin : [],
    Array.isArray((seasonalConfig as any)?.exterieurJardin) ? (seasonalConfig as any).exterieurJardin : [],
  ];
  const normalized = Array.from(new Set([
    ...arraySources.flat().map((item) => String(item || '').trim()).filter(Boolean),
    ...scalarFlags.filter(([enabled]) => Boolean(enabled)).map(([, label]) => label),
  ]));
  return normalized.join(', ');
}

function computeNights(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const startUtc = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endUtc = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.max(1, Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000)));
}

function toSqlDate(value: Date | null): string {
  if (!value) return '';
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseOptionalAmount(value: string): number | null {
  const raw = String(value || '').trim().replace(',', '.');
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return Number.NaN;
  return Math.round(numeric * 100) / 100;
}

function toAbsoluteAssetUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const apiOrigin = /^https?:\/\//i.test(API_URL)
    ? new URL(API_URL).origin
    : window.location.origin;
  if (raw.startsWith('/')) return `${apiOrigin}${raw}`;
  return `${apiOrigin}/${raw}`;
}

export default function ContratsPage() {
  const initialCache = readSessionPageCache<ContractsPageCachePayload>(CONTRACTS_CACHE_KEY);
  const [contrats, setContrats] = useState<ContratApi[]>(initialCache?.contrats || []);
  const [biens, setBiens] = useState<BienApi[]>(initialCache?.biens || []);
  const [locataires, setLocataires] = useState<LocataireApi[]>(initialCache?.locataires || []);
  const [bienImageById, setBienImageById] = useState<Record<string, string>>(initialCache?.bienImageById || {});
  const [isLoading, setIsLoading] = useState(!initialCache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingContratId, setUploadingContratId] = useState<string | null>(null);
  const [uploadingReceiptContratId, setUploadingReceiptContratId] = useState<string | null>(null);
  const [regeneratingContratId, setRegeneratingContratId] = useState<string | null>(null);
  const [sendingContratId, setSendingContratId] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<ContractCategoryFilter>('all');
  const [financialDrafts, setFinancialDrafts] = useState<Record<string, { ownerAmount: string; ownerTotal: string; netProfit: string }>>({});
  const [expandedFinancials, setExpandedFinancials] = useState<Record<string, boolean>>({});
  const [savingFinancialContratId, setSavingFinancialContratId] = useState<string | null>(null);
  const [reopeningContratId, setReopeningContratId] = useState<string | null>(null);

  const [searchLocataire, setSearchLocataire] = useState('');
  const [searchProprietaire, setSearchProprietaire] = useState('');
  const [searchReference, setSearchReference] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created_desc');

  const [manualOpen, setManualOpen] = useState(false);
  const [manualStep, setManualStep] = useState<ManualStep>(1);
  const [manualDraft, setManualDraft] = useState<ManualReservationDraft>(MANUAL_DEFAULT);
  const [manualTemplateVars, setManualTemplateVars] = useState<Record<string, string>>(() => createEmptyTemplateVars());
  const [manualEditedTemplateVars, setManualEditedTemplateVars] = useState<Record<string, boolean>>({});
  const [manualTouchedFields, setManualTouchedFields] = useState<Record<string, boolean>>({});
  const [manualBienSearch, setManualBienSearch] = useState('');
  const [selectedBienId, setSelectedBienId] = useState('');
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [selectedBienUnavailableDates, setSelectedBienUnavailableDates] = useState<UnavailableDateApi[]>([]);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualPreviewUrl, setManualPreviewUrl] = useState('');
  const [manualPreviewLoading, setManualPreviewLoading] = useState(false);
  const [loadingManualCalendar, setLoadingManualCalendar] = useState(false);
  const [selectedManualServiceIds, setSelectedManualServiceIds] = useState<string[]>([]);
  const [selectedManualServiceCategory, setSelectedManualServiceCategory] = useState<string>('all');
  const [templateVarsEditorOpen, setTemplateVarsEditorOpen] = useState(false);
  const [templateVarsTargetContract, setTemplateVarsTargetContract] = useState<ContratApi | null>(null);
  const [templateVarsDraft, setTemplateVarsDraft] = useState<Record<string, string>>({});
  const [templateVarsLoadingContractId, setTemplateVarsLoadingContractId] = useState<string | null>(null);
  const [historyViewerContract, setHistoryViewerContract] = useState<ContratApi | null>(null);

  const templateVarKeys = useMemo(() => {
    const known = new Set<string>(DEFAULT_TEMPLATE_VAR_KEYS);
    const extras = Object.keys(templateVarsDraft)
      .map((key) => String(key || '').trim())
      .filter((key) => key && !known.has(key))
      .sort((a, b) => a.localeCompare(b));
    return [...DEFAULT_TEMPLATE_VAR_KEYS, ...extras];
  }, [templateVarsDraft]);

  const manualLivePreview = useMemo(() => {
    const read = (key: TemplateVarKey, fallback = 'Auto apres bien et dates') => {
      const value = String(manualTemplateVars[key] || '').trim();
      return value || fallback;
    };
    return {
      fullName: read('fullName', 'Nom locataire'),
      identityRef: read('identityRef', 'CIN / passeport auto'),
      userPhone: read('userPhone', 'Telephone auto'),
      userAddress: read('userAddress', 'Adresse auto'),
      typeLogement: read('typeLogement'),
      adresseBien: read('adresseBien'),
      capacite: read('capacite'),
      adultes: read('adultes'),
      enfants: read('enfants'),
      equipementsBien: read('equipementsBien'),
      arrivalDate: `${read('jj1', '--')}/${read('mm1', '--')}`,
      departureDate: `${read('jj2', '--')}/${read('mm2', '--')}`,
      heureArrivee: read('heureArrivee', '14:00'),
      heureDepart: read('heureDepart', '11:00'),
      loyerTotal: read('loyerTotal', 'Montant auto'),
      acompteReservation: read('acompteReservation', 'Acompte auto'),
      paymentDeadline: `${read('jjp', '--')}/${read('mmp', '--')} a ${read('hhp', '--')}:${read('minp', '--')}`,
      idPaiement: read('idPaiement', 'ID paiement auto'),
      soldeArrivee: read('soldeArrivee', 'Solde auto'),
      modePaiement: read('modePaiement', 'Mode auto'),
      caution: read('caution', 'Caution auto'),
      signature: `${read('VS', 'Ville auto')} le ${read('JJs', '--')}/${read('MMS', '--')}`,
    };
  }, [manualTemplateVars]);
  const historyViewerData = useMemo(
    () => parseContractCreationHistory(historyViewerContract?.creation_steps_json),
    [historyViewerContract]
  );

  const fetchData = useCallback(async (options?: { background?: boolean }) => {
    const shouldShowBlockingLoader = !initialCache && !options?.background && contrats.length === 0 && biens.length === 0;
    if (shouldShowBlockingLoader) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    const [contratsResult, biensResult, locatairesResult] = await Promise.allSettled([
      fetch(`${API_URL}/contrats`, { credentials: 'include' }),
      fetch(`${API_URL}/biens`, { credentials: 'include' }),
      fetch(`${API_URL}/locataires`, { credentials: 'include' }),
    ]);

    let hasAnyData = false;
    const errors: string[] = [];
    let nextContrats: ContratApi[] = [];
    let nextBiens: BienApi[] = [];
    let nextLocataires: LocataireApi[] = [];
    let nextBienImages: Record<string, string> = {};

    if (contratsResult.status === 'fulfilled' && contratsResult.value.ok) {
      const contratsData = await contratsResult.value.json();
      nextContrats = Array.isArray(contratsData) ? contratsData : [];
      setContrats(nextContrats);
      hasAnyData = true;
    } else {
      setContrats([]);
      errors.push('contrats');
    }

    if (biensResult.status === 'fulfilled' && biensResult.value.ok) {
      const biensData = await biensResult.value.json();
      const normalizedBiens = Array.isArray(biensData) ? biensData : [];
      nextBiens = normalizedBiens;
      setBiens(normalizedBiens);
      const bienIds = normalizedBiens.map((row: any) => String(row?.id || '').trim()).filter(Boolean);
      if (bienIds.length > 0) {
        try {
          const mediaResponse = await fetch(`${API_URL}/media-bulk?bien_ids=${encodeURIComponent(bienIds.join(','))}`, { credentials: 'include' });
          if (mediaResponse.ok) {
            const mediaRows = await mediaResponse.json();
            const grouped = new Map<string, MediaApi[]>();
            for (const media of (Array.isArray(mediaRows) ? mediaRows : []) as MediaApi[]) {
              const bienId = String(media?.bien_id || '').trim();
              if (!bienId) continue;
              const list = grouped.get(bienId) || [];
              list.push(media);
              grouped.set(bienId, list);
            }
            const nextImages: Record<string, string> = {};
            for (const bienId of bienIds) {
              const medias = (grouped.get(bienId) || [])
                .filter((m) => String(m?.type || 'image').toLowerCase() !== 'video')
                .filter((m) => {
                  const motif = String(m?.motif_upload || '');
                  const isProof = motif === 'preuve_type_rue'
                    || motif === 'preuve_type_papier'
                    || motif.startsWith('preuve_type_rue|')
                    || motif.startsWith('preuve_type_papier|');
                  return !isProof;
                })
                .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
              const first = String(medias[0]?.url || '').trim();
              if (!first) continue;
              nextImages[bienId] = toAbsoluteAssetUrl(first);
            }
            nextBienImages = nextImages;
            setBienImageById(nextImages);
          } else {
            setBienImageById({});
          }
        } catch {
          setBienImageById({});
        }
      } else {
        setBienImageById({});
      }
      hasAnyData = true;
    } else {
      setBiens([]);
      setBienImageById({});
      errors.push('biens');
    }

    if (locatairesResult.status === 'fulfilled' && locatairesResult.value.ok) {
      const locatairesData = await locatairesResult.value.json();
      nextLocataires = Array.isArray(locatairesData) ? locatairesData : [];
      setLocataires(nextLocataires);
      hasAnyData = true;
    } else {
      setLocataires([]);
      errors.push('locataires');
    }

    if (hasAnyData) {
      writeSessionPageCache<ContractsPageCachePayload>(CONTRACTS_CACHE_KEY, {
        contrats: nextContrats,
        biens: nextBiens,
        locataires: nextLocataires,
        bienImageById: nextBienImages,
      });
    }

    if (errors.length > 0) {
      const message = `Chargement partiel: ${errors.join(', ')}`;
      setError(hasAnyData ? message : 'Impossible de charger les donnees');
      toast.error(message);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [biens.length, contrats.length, initialCache]);

  useEffect(() => {
    void fetchData({ background: Boolean(initialCache) });
  }, [fetchData]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchData({ background: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchData]);

  useEffect(() => {
    const bienId = String(selectedBienId || '').trim();
    if (!manualOpen || manualStep !== 2 || !bienId) {
      setSelectedBienUnavailableDates([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingManualCalendar(true);
      try {
        const response = await fetch(`${API_URL}/unavailable-dates/${encodeURIComponent(bienId)}`, { credentials: 'include' });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Impossible de charger le calendrier du bien'));
        const rows = await response.json();
        if (!cancelled) {
          setSelectedBienUnavailableDates(Array.isArray(rows) ? rows : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSelectedBienUnavailableDates([]);
          toast.error(err?.message || 'Impossible de charger le calendrier');
        }
      } finally {
        if (!cancelled) setLoadingManualCalendar(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manualOpen, manualStep, selectedBienId]);

  const bienById = useMemo(() => {
    const map = new Map<string, BienApi>();
    for (const bien of biens) map.set(bien.id, bien);
    return map;
  }, [biens]);

  const selectedBien = useMemo(() => {
    const id = String(selectedBienId || '').trim();
    return id ? (bienById.get(id) || null) : null;
  }, [bienById, selectedBienId]);
  const selectedSeasonalConfig = useMemo(() => {
    const raw = (selectedBien as any)?.location_saisonniere_config
      ?? (selectedBien as any)?.locationSaisonniereConfig
      ?? (selectedBien as any)?.location_saisonniere_config_json;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
    }
    return {};
  }, [selectedBien]);
  const guestCaps = useMemo(() => {
    const rawTotal = Number(
      (selectedSeasonalConfig as any)?.limite_personnes_nuit
      ?? (selectedSeasonalConfig as any)?.limitePersonnesNuit
      ?? (selectedSeasonalConfig as any)?.limite_personne_nuit
      ?? (selectedBien as any)?.limite_personnes_nuit
      ?? (selectedBien as any)?.limitePersonnesNuit
    );
    const rawAdults = Number(
      (selectedSeasonalConfig as any)?.max_adultes
      ?? (selectedSeasonalConfig as any)?.maxAdultes
      ?? (selectedBien as any)?.max_adultes
      ?? (selectedBien as any)?.maxAdultes
    );
    const rawChildren = Number(
      (selectedSeasonalConfig as any)?.max_enfants
      ?? (selectedSeasonalConfig as any)?.maxEnfants
      ?? (selectedBien as any)?.max_enfants
      ?? (selectedBien as any)?.maxEnfants
    );
    const fallbackFromCaps = Number.isFinite(rawTotal) && rawTotal > 0
      ? Math.floor(rawTotal)
      : ((Number.isFinite(rawAdults) && rawAdults > 0 ? Math.floor(rawAdults) : 1)
        + (Number.isFinite(rawChildren) && rawChildren >= 0 ? Math.floor(rawChildren) : 0));
    const fallbackGuests = Math.max(1, Number((selectedBien as any)?.guests || fallbackFromCaps || 10));
    const limits = computeGuestLimits({
      fallbackGuests,
      maxGuestsCap: rawTotal,
      maxAdultsCap: rawAdults,
      maxChildrenCap: rawChildren,
    });
    return {
      maxGuests: limits.maxGuests,
      maxAdults: limits.maxAdultGuests,
      maxChildren: limits.maxChildGuests,
    };
  }, [selectedBien, selectedSeasonalConfig]);

  const filteredAndSorted = useMemo(() => {
    const locataireQuery = searchLocataire.trim().toLowerCase();
    const proprietaireQuery = searchProprietaire.trim().toLowerCase();
    const referenceQuery = searchReference.trim().toLowerCase();

    const filtered = contrats.filter((contrat) => {
      const bien = bienById.get(contrat.bien_id);
      const locataireNom = (contrat.locataire_nom || '').toLowerCase();
      const proprietaireNom = (bien?.proprietaire_nom || '').toLowerCase();
      const referenceBien = (bien?.reference || '').toLowerCase();
      const normalizedOrigin = String(contrat.origine || 'automatique').toLowerCase() === 'manuel' ? 'manuel' : 'automatique';

      const matchesLocataire = !locataireQuery || locataireNom.includes(locataireQuery);
      const matchesProprietaire = !proprietaireQuery || proprietaireNom.includes(proprietaireQuery);
      const matchesReference = !referenceQuery || referenceBien.includes(referenceQuery);
      const matchesOrigin = originFilter === 'all' || normalizedOrigin === originFilter;
      const matchesCategory = categoryFilter === 'all' || getContractCategory(contrat) === categoryFilter;

      let matchesDate = true;
      if (filterDate) {
        const target = new Date(filterDate);
        const start = new Date(contrat.date_debut);
        const end = new Date(contrat.date_fin);
        const created = new Date(contrat.created_at);
        matchesDate =
          (target >= start && target <= end) ||
          created.toISOString().slice(0, 10) === filterDate;
      }

      return matchesLocataire && matchesProprietaire && matchesReference && matchesOrigin && matchesCategory && matchesDate;
    });

    return [...filtered].sort((a, b) => {
      const createdA = new Date(a.created_at).getTime();
      const createdB = new Date(b.created_at).getTime();
      const startA = new Date(a.date_debut).getTime();
      const startB = new Date(b.date_debut).getTime();

      if (sortBy === 'created_asc') return createdA - createdB;
      if (sortBy === 'start_desc') return startB - startA;
      if (sortBy === 'start_asc') return startA - startB;
      return createdB - createdA;
    });
  }, [contrats, bienById, searchLocataire, searchProprietaire, searchReference, filterDate, sortBy, originFilter, categoryFilter]);

  const contractCategoryCounts = useMemo(() => {
    return contrats.reduce<Record<ContractCategoryFilter, number>>((acc, contrat) => {
      const category = getContractCategory(contrat);
      acc.all += 1;
      acc[category] += 1;
      return acc;
    }, { all: 0, rejected: 0, pending_payment: 0, finished_paid: 0 });
  }, [contrats]);

  const availableBiensForManual = useMemo(() => {
    const query = manualBienSearch.trim().toLowerCase();
    return biens
      .filter((bien) => String(bien.mode || '').toLowerCase() !== 'vente')
      .filter((bien) => {
        if (!query) return true;
        const ref = String(bien.reference || '').toLowerCase();
        const title = String(bien.titre || '').toLowerCase();
        return ref.includes(query) || title.includes(query);
      });
  }, [biens, manualBienSearch]);

  const manualNights = useMemo(() => computeNights(selectedStart, selectedEnd), [selectedStart, selectedEnd]);
  const manualStartDateSql = useMemo(() => toSqlDate(selectedStart), [selectedStart]);
  const manualEndDateSql = useMemo(() => toSqlDate(selectedEnd), [selectedEnd]);
  const manualPeriodReady = !!manualStartDateSql && !!manualEndDateSql && manualEndDateSql >= manualStartDateSql;

  const baseNightly = Math.max(0, Number(selectedBien?.prix_nuitee || 0));
  const baseWeekly = Number(selectedBien?.prix_semaine || 0) > 0 ? Number(selectedBien?.prix_semaine || 0) : null;
  const normalizedPricingPeriods = useMemo<SeasonalPricingPeriod[]>(() => (
    (Array.isArray(selectedBien?.pricing_periods) ? selectedBien?.pricing_periods : [])
      .map((period, index) => {
        const start = String(period?.start || period?.start_date || '').slice(0, 10);
        const end = String(period?.end || period?.end_date || '').slice(0, 10);
        const nightly = Number(period?.prix_nuitee || 0);
        const weekly = period?.prix_semaine === null || period?.prix_semaine === undefined ? null : Number(period?.prix_semaine || 0);
        if (!start || !end || !Number.isFinite(nightly) || nightly <= 0) return null;
        return {
          id: String(period?.id || `manual-${index}`),
          start,
          end,
          prix_nuitee: nightly,
          prix_semaine: Number.isFinite(Number(weekly)) && Number(weekly) > 0 ? Number(weekly) : null,
        } as SeasonalPricingPeriod;
      })
      .filter(Boolean) as SeasonalPricingPeriod[]
  ), [selectedBien?.pricing_periods]);
  const pricingSummary = useMemo(() => {
    if (!manualPeriodReady) {
      return { nights: 0, accommodationTotal: 0, averageNightlyPrice: 0, hasPeriodOverride: false };
    }
    return calculateAccommodationPricing({
      startDate: manualStartDateSql,
      endDate: manualEndDateSql,
      defaultNightlyPrice: baseNightly,
      defaultWeeklyPrice: baseWeekly,
      pricingPeriods: normalizedPricingPeriods,
    });
  }, [manualPeriodReady, manualStartDateSql, manualEndDateSql, baseNightly, baseWeekly, normalizedPricingPeriods]);
  const baseCaution = Math.max(
    0,
    Number((selectedSeasonalConfig?.montant_caution ?? selectedSeasonalConfig?.montantCaution ?? selectedBien?.caution) || 0)
  );
  const advancePercent = Math.min(
    100,
    Math.max(1, Number((selectedSeasonalConfig?.avance_pourcentage ?? selectedSeasonalConfig?.avancePourcentage) || 30))
  );
  const manualAdultGuests = Math.max(1, Number(manualDraft.adult_guests || 1));
  const manualChildGuests = Math.max(0, Number(manualDraft.child_guests || 0));
  const manualGuestsTotal = Math.max(1, manualAdultGuests + manualChildGuests);
  const manualFullName = String(manualTemplateVars.fullName || '').trim();
  const manualIdentityRef = String(manualTemplateVars.identityRef || '').trim();
  const manualEmail = String(manualDraft.client_email || '').trim();
  const manualStep1RequiredFields = ['fullName', 'identityRef'];
  const manualStep2RequiredFields = ['client_email'];
  const manualMissingStep1Fields = manualStep1RequiredFields.filter((field) => {
    if (field === 'fullName') return !manualFullName;
    if (field === 'identityRef') return !manualIdentityRef;
    return false;
  });
  const manualMissingStep2Fields = manualStep2RequiredFields.filter((field) => {
    if (field === 'client_email') return !manualEmail;
    return false;
  });
  const resolvedManualCaution = baseCaution;
  const autoManualAccommodationTotal = Number(pricingSummary.accommodationTotal || 0);
  const manualTotalInput = parseOptionalAmount(manualDraft.total_amount);
  const manualAdvanceInput = parseOptionalAmount(manualDraft.amount_due_now);
  const hasManualTotalInput = String(manualDraft.total_amount || '').trim() !== '';
  const hasManualAdvanceInput = String(manualDraft.amount_due_now || '').trim() !== '';
  const manualTotalInputIsValid = manualTotalInput !== null && Number.isFinite(manualTotalInput) && manualTotalInput > 0;
  const manualAdvanceInputIsValid = manualAdvanceInput !== null && Number.isFinite(manualAdvanceInput);

  const getPdfUrl = (url?: string) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${window.location.origin}${url}`;
  };

  const handlePreviewPdf = (url?: string) => {
    const pdfUrl = getPdfUrl(url);
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPdf = (contratId: string, url?: string) => {
    const pdfUrl = getPdfUrl(url);
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    const ext = String(url || '').toLowerCase().endsWith('.html') ? 'html' : 'pdf';
    link.download = `contrat-${contratId}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUploadContractPdf = async (contrat: ContratApi, file?: File | null) => {
    if (!file) return;
    setUploadingContratId(contrat.id);
    try {
      const formData = new FormData();
      formData.append('contract', file);
      const uploadResponse = await fetch(`${API_URL}/upload-contract`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error('Upload PDF impossible');
      const uploadData = await uploadResponse.json();

      const updateResponse = await fetch(`${API_URL}/contrats/${contrat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_pdf: uploadData.url }),
      });
      if (!updateResponse.ok) throw new Error(await getApiErrorMessage(updateResponse, 'Mise a jour contrat impossible'));

      await fetchData();
      toast.success('PDF du contrat mis a jour');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erreur upload contrat');
    } finally {
      setUploadingContratId(null);
    }
  };

  const handleUploadPaymentReceipt = async (contrat: ContratApi, file?: File | null) => {
    if (!file) return;
    setUploadingReceiptContratId(contrat.id);
    try {
      const formData = new FormData();
      formData.append('receipt', file);
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contrat.id)}/upload-payment-receipt`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Upload recu impossible'));
      const data = await response.json().catch(() => null);
      const updatedContract = data?.contract && typeof data.contract === 'object' ? data.contract as ContratApi : null;
      if (updatedContract) {
        setContrats((current) => current.map((item) => (item.id === updatedContract.id ? { ...item, ...updatedContract } : item)));
        setTemplateVarsTargetContract((current) => (current?.id === updatedContract.id ? { ...current, ...updatedContract } : current));
      } else {
        setContrats((current) => current.map((item) => (
          item.id === contrat.id
            ? {
                ...item,
                reservation_demand_id: String(data?.demand_id || item.reservation_demand_id || '').trim() || null,
                payment_receipt_image_url: String(data?.payment_receipt_image_url || '').trim() || null,
                payment_receipt_uploaded_at: String(data?.payment_receipt_uploaded_at || '').trim() || null,
                payment_receipt_note: String(data?.payment_receipt_note || '').trim() || null,
              }
            : item
        )));
      }
      toast.success('Recu de paiement uploade');
    } catch (error: any) {
      toast.error(error?.message || 'Upload recu impossible');
    } finally {
      setUploadingReceiptContratId(null);
    }
  };

  const handleRegenerateTemplatePdf = async (contrat: ContratApi) => {
    setRegeneratingContratId(contrat.id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contrat.id)}/regenerate-template-pdf`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Regeneration impossible'));
      const data = await response.json().catch(() => null);
      const updatedContract = data?.contract && typeof data.contract === 'object' ? data.contract as ContratApi : null;
      if (updatedContract) {
        setContrats((current) => current.map((item) => (item.id === updatedContract.id ? { ...item, ...updatedContract } : item)));
        setTemplateVarsTargetContract((current) => (current?.id === updatedContract.id ? { ...current, ...updatedContract } : current));
      }
      await fetchData();
      toast.success('Contrat regenere depuis le template');
    } catch (error: any) {
      toast.error(error?.message || 'Regeneration impossible');
    } finally {
      setRegeneratingContratId(null);
    }
  };

  const handleEditTemplateVars = async (contrat: ContratApi) => {
    setTemplateVarsLoadingContractId(contrat.id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contrat.id)}`, {
        credentials: 'include',
      });
      const detailedContract = response.ok
        ? await response.json().catch(() => null)
        : null;
      const nextContract = detailedContract && typeof detailedContract === 'object'
        ? { ...contrat, ...detailedContract } as ContratApi
        : contrat;
      const parsed = resolveContractTemplateVars(nextContract);
      setContrats((current) => current.map((item) => (item.id === nextContract.id ? { ...item, ...nextContract } : item)));
      setTemplateVarsTargetContract(nextContract);
      setTemplateVarsDraft(parsed);
      setTemplateVarsEditorOpen(true);
    } catch (error: any) {
      toast.error(error?.message || 'Chargement des variables impossible');
    } finally {
      setTemplateVarsLoadingContractId(null);
    }
  };

  const handleSaveTemplateVars = async () => {
    if (!templateVarsTargetContract) return;
    try {
      const payload = Object.fromEntries(
        Object.entries(templateVarsDraft)
          .map(([k, v]) => [k, String(v || '').trim()])
          .filter(([, v]) => v.length > 0)
      );
      const saveResponse = await fetch(`${API_URL}/contrats/${encodeURIComponent(templateVarsTargetContract.id)}/template-vars`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_vars: payload }),
      });
      if (!saveResponse.ok) throw new Error(await getApiErrorMessage(saveResponse, 'Sauvegarde variables impossible'));
      await handleRegenerateTemplatePdf(templateVarsTargetContract);
      setTemplateVarsTargetContract((current) => current ? {
        ...current,
        template_vars_json: JSON.stringify(payload),
      } : current);
      setContrats((current) => current.map((item) => (
        item.id === templateVarsTargetContract.id
          ? { ...item, template_vars_json: JSON.stringify(payload) }
          : item
      )));
      setTemplateVarsDraft(payload);
      toast.success('Variables sauvegardees et contrat regenere');
    } catch (error: any) {
      toast.error(error?.message || 'Sauvegarde variables impossible');
    }
  };

  const handleSendContractToClient = async (contrat: ContratApi) => {
    setSendingContratId(contrat.id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contrat.id)}/send-to-client`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Envoi client impossible'));
      await fetchData();
      toast.success('Version admin du contrat envoyee au client');
    } catch (error: any) {
      toast.error(error?.message || 'Envoi client impossible');
    } finally {
      setSendingContratId(null);
    }
  };

  const handleDeleteContract = async (contratId: string) => {
    const confirmed = window.confirm('Supprimer ce contrat ?');
    if (!confirmed) return;
    try {
      const response = await fetch(`${API_URL}/contrats/${contratId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Suppression contrat impossible'));
      toast.success('Contrat supprime');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erreur suppression contrat');
    }
  };

  const handleMoveRejectedToPendingPayment = async (contrat: ContratApi) => {
    setReopeningContratId(contrat.id);
    try {
      const contractResponse = await fetch(`${API_URL}/contrats/${encodeURIComponent(contrat.id)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'actif' }),
      });
      if (!contractResponse.ok) {
        throw new Error(await getApiErrorMessage(contractResponse, 'Reouverture du contrat impossible'));
      }

      if (String(contrat.reservation_demand_id || '').trim()) {
        const demandResponse = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(String(contrat.reservation_demand_id || '').trim())}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'contrat_realise',
            actor_type: 'admin',
            actor_id: 'admin',
            history_note: 'Contrat reouvert et remis en attente de paiement par admin',
          }),
        });
        if (!demandResponse.ok) {
          throw new Error(await getApiErrorMessage(demandResponse, 'Reouverture de la demande liee impossible'));
        }
      }

      await fetchData();
      toast.success('Contrat remis en attente de paiement');
    } catch (error: any) {
      toast.error(error?.message || 'Reouverture du contrat impossible');
    } finally {
      setReopeningContratId(null);
    }
  };

  const getFinancialDraft = (contrat: ContratApi) => {
    const existing = financialDrafts[contrat.id];
    if (existing) return existing;
    const ownerAmountValue = contrat.montant_donne_proprietaire ?? null;
    return {
      ownerAmount: ownerAmountValue === null || ownerAmountValue === undefined ? '' : String(ownerAmountValue),
      ownerTotal: contrat.montant_total_proprietaire === null || contrat.montant_total_proprietaire === undefined
        ? ''
        : String(Math.round(Number(contrat.montant_total_proprietaire) * 100) / 100),
      netProfit: contrat.profit_net === null || contrat.profit_net === undefined
        ? ''
        : String(Math.round(Number(contrat.profit_net) * 100) / 100),
    };
  };

  const handleFinancialDraftChange = (contrat: ContratApi, patch: Partial<{ ownerAmount: string; ownerTotal: string; netProfit: string }>) => {
    const current = getFinancialDraft(contrat);
    const next = { ...current, ...patch };
    if (patch.ownerAmount !== undefined && patch.netProfit === undefined) {
      const parsedOwnerAmount = Number(String(patch.ownerAmount || '').replace(',', '.'));
      if (Number.isFinite(parsedOwnerAmount)) {
        next.netProfit = String(Math.round((Number(contrat.montant_recu || 0) - parsedOwnerAmount) * 100) / 100);
      }
    }
    setFinancialDrafts((prev) => ({ ...prev, [contrat.id]: next }));
  };

  const handleSaveFinancials = async (contrat: ContratApi) => {
    const draft = getFinancialDraft(contrat);
    const ownerAmount = draft.ownerAmount === '' ? null : Number(String(draft.ownerAmount).replace(',', '.'));
    const ownerTotal = draft.ownerTotal === '' ? null : Number(String(draft.ownerTotal).replace(',', '.'));
    const netProfit = draft.netProfit === '' ? null : Number(String(draft.netProfit).replace(',', '.'));
    if ((ownerAmount !== null && !Number.isFinite(ownerAmount)) || (ownerTotal !== null && !Number.isFinite(ownerTotal)) || (netProfit !== null && !Number.isFinite(netProfit))) {
      toast.error('Montants invalides');
      return;
    }
    setSavingFinancialContratId(contrat.id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contrat.id)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montant_donne_proprietaire: ownerAmount,
          montant_total_proprietaire: ownerTotal,
          profit_net: netProfit,
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Sauvegarde montants impossible'));
      const updated = await response.json();
      setContrats((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      toast.success('Montants du contrat mis a jour');
    } catch (error: any) {
      toast.error(error?.message || 'Sauvegarde montants impossible');
    } finally {
      setSavingFinancialContratId(null);
    }
  };

  const resetManualWizard = () => {
    setManualOpen(false);
    setManualStep(1);
    setManualDraft(MANUAL_DEFAULT);
    setManualTemplateVars(createEmptyTemplateVars());
    setManualEditedTemplateVars({});
    setManualTouchedFields({});
    setManualBienSearch('');
    setSelectedBienId('');
    setSelectedStart(null);
    setSelectedEnd(null);
    setSelectedBienUnavailableDates([]);
    setSelectedManualServiceIds([]);
    setSelectedManualServiceCategory('all');
    setManualPreviewUrl('');
  };

  const buildManualTemplateVarsPayload = () => (
    Object.fromEntries(
      Object.entries(manualTemplateVars)
        .map(([key, value]) => [key, String(value || '').trim()])
        .filter(([, value]) => value.length > 0)
    )
  );

  const markManualFieldsTouched = (fields: string[]) => {
    setManualTouchedFields((prev) => ({
      ...prev,
      ...Object.fromEntries(fields.map((field) => [field, true])),
    }));
  };

  const updateManualTemplateVar = (key: string, value: string) => {
    setManualTemplateVars((prev) => ({ ...prev, [key]: value }));
    setManualEditedTemplateVars((prev) => ({ ...prev, [key]: true }));
  };

  const buildManualReservationPayload = () => {
    const { firstName, lastName } = splitManualFullName(manualFullName);
    const templateVars = buildManualTemplateVarsPayload();
    return {
      bien_id: selectedBienId,
      start_date: manualStartDateSql,
      end_date: manualEndDateSql,
      guests: manualGuestsTotal,
      adult_guests: manualAdultGuests,
      child_guests: manualChildGuests,
      caution_amount: resolvedManualCaution,
      payment_mode: manualDraft.payment_mode,
      total_amount: resolvedManualTotal,
      amount_due_now: resolvedManualDueNow,
      client_note: manualDraft.client_note,
      client_first_name: firstName,
      client_last_name: lastName,
      client_email: manualDraft.client_email,
      client_telephone: manualTemplateVars.userPhone || manualDraft.client_telephone,
      client_address: manualTemplateVars.userAddress || manualDraft.client_address,
      identity_document_type: manualDraft.identity_document_type,
      identity_document_number: normalizeManualIdentityNumber(manualIdentityRef),
      representative: manualDraft.representative,
      arrival_time: manualTemplateVars.heureArrivee || manualDraft.arrival_time,
      departure_time: manualTemplateVars.heureDepart || manualDraft.departure_time,
      payment_id: manualTemplateVars.idPaiement || manualDraft.payment_id,
      payment_method: manualDraft.payment_method,
      payment_deadline_date: manualDraft.payment_deadline_date,
      payment_deadline_time: manualDraft.payment_deadline_time,
      signature_city: manualTemplateVars.VS || manualDraft.signature_city,
      service_1: selectedSeasonalServices[0]?.label || '',
      prix_service_1: String(selectedSeasonalServices[0]?.prix || ''),
      service_2: selectedSeasonalServices[1]?.label || '',
      prix_service_2: String(selectedSeasonalServices[1]?.prix || ''),
      service_3: selectedSeasonalServices[2]?.label || '',
      prix_service_3: String(selectedSeasonalServices[2]?.prix || ''),
      template_vars: templateVars,
      creation_steps: {
        saved_at: new Date().toISOString(),
        preview_url: manualPreviewUrl || null,
        step_1: {
          title: 'Variables du contrat',
          fields: templateVars,
          edited_keys: Object.keys(manualEditedTemplateVars).filter((key) => manualEditedTemplateVars[key]),
        },
        step_2: {
          title: 'Bien, sejour et paiement',
          bien: selectedBien ? {
            id: selectedBien.id,
            reference: selectedBien.reference || null,
            titre: selectedBien.titre || null,
          } : null,
          period: {
            start_date: manualStartDateSql,
            end_date: manualEndDateSql,
            nights: manualNights,
            arrival_time: manualTemplateVars.heureArrivee || manualDraft.arrival_time,
            departure_time: manualTemplateVars.heureDepart || manualDraft.departure_time,
          },
          guests: {
            total: manualGuestsTotal,
            adults: manualAdultGuests,
            children: manualChildGuests,
            capacity_max: guestCaps.maxGuests,
          },
          payment: {
            payment_mode: manualDraft.payment_mode,
            payment_method: manualDraft.payment_method,
            payment_id: manualTemplateVars.idPaiement || manualDraft.payment_id,
            payment_deadline_date: manualDraft.payment_deadline_date,
            payment_deadline_time: manualDraft.payment_deadline_time,
            total_amount: resolvedManualTotal,
            amount_due_now: resolvedManualDueNow,
            balance_due: resolvedManualBalance,
            caution_amount: resolvedManualCaution,
          },
          selected_services: selectedSeasonalServices.map((service) => ({
            id: String(service.id || ''),
            label: String(service.label || ''),
            prix: Number(service.prix || 0),
            categorie: String(service.categorie || ''),
          })),
          client_note: manualDraft.client_note || '',
        },
        step_3: {
          title: 'Generation et confirmation',
          preview_generated: Boolean(manualPreviewUrl),
          ready_to_confirm: Boolean(selectedBienId && manualStartDateSql && manualEndDateSql),
        },
      },
    };
  };

  const goToManualStep2 = () => {
    if (manualMissingStep1Fields.length > 0) {
      markManualFieldsTouched(manualStep1RequiredFields);
      toast.error('Remplissez les champs obligatoires en rouge');
      return;
    }
    if (!Number.isFinite(manualAdultGuests) || manualAdultGuests < 1) {
      toast.error('Le nombre d adultes doit etre >= 1');
      return;
    }
    if (!Number.isFinite(manualChildGuests) || manualChildGuests < 0) {
      toast.error('Le nombre d enfants doit etre >= 0');
      return;
    }
    setManualStep(2);
  };

  const goToManualStep3 = () => {
    if (manualMissingStep2Fields.length > 0) {
      markManualFieldsTouched(manualStep2RequiredFields);
      toast.error('Remplissez les champs obligatoires en rouge');
      return;
    }
    if (!selectedBienId) {
      toast.error('Selectionnez un bien');
      return;
    }
    if (!manualStartDateSql || !manualEndDateSql) {
      toast.error('Selectionnez la periode de reservation');
      return;
    }
    setManualDraft((prev) => {
      const adults = Math.min(Math.max(1, Number(prev.adult_guests || 1)), guestCaps.maxAdults, guestCaps.maxGuests);
      const children = Math.min(Math.max(0, Number(prev.child_guests || 0)), guestCaps.maxChildren, Math.max(0, guestCaps.maxGuests - adults));
      return { ...prev, adult_guests: String(adults), child_guests: String(children) };
    });
    setManualStep(3);
  };

  const seasonalServices = useMemo(() => {
    const raw = (selectedSeasonalConfig as any)?.services_payants
      ?? (selectedSeasonalConfig as any)?.servicesPayants
      ?? [];
    return splitServicesByTarification(Array.isArray(raw) ? raw : []).all;
  }, [selectedSeasonalConfig]);

  const selectedSeasonalServices = useMemo(
    () => seasonalServices.filter((service) => selectedManualServiceIds.includes(String(service.id))),
    [seasonalServices, selectedManualServiceIds]
  );
  const seasonalServiceCategories = useMemo(() => {
    const grouped = new Map<string, { id: string; label: string; count: number }>();
    for (const service of seasonalServices) {
      const label = String(service.categorie || 'Services').trim() || 'Services';
      const id = label.toLowerCase().replace(/\s+/g, '_');
      const current = grouped.get(id);
      if (current) {
        current.count += 1;
      } else {
        grouped.set(id, { id, label, count: 1 });
      }
    }
    return Array.from(grouped.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [seasonalServices]);
  const visibleSeasonalServices = useMemo(() => {
    if (selectedManualServiceCategory === 'all') return seasonalServices;
    const selected = seasonalServiceCategories.find((item) => item.id === selectedManualServiceCategory);
    if (!selected) return seasonalServices;
    return seasonalServices.filter((service) => String(service.categorie || 'Services').trim() === selected.label);
  }, [seasonalServices, seasonalServiceCategories, selectedManualServiceCategory]);

  const fixedSeasonalServicesTotal = useMemo(
    () => selectedSeasonalServices
      .filter((service) => service.type_tarification === 'fixe')
      .reduce((sum, service) => sum + Number(service.prix || 0), 0),
    [selectedSeasonalServices]
  );
  const autoManualTotal = autoManualAccommodationTotal + fixedSeasonalServicesTotal;
  const resolvedManualTotal = manualTotalInputIsValid && manualTotalInput !== null ? manualTotalInput : autoManualTotal;
  const autoManualDueNow = Math.round((resolvedManualTotal * advancePercent) / 100);
  const resolvedManualDueNow = manualDraft.payment_mode === 'totalite'
    ? resolvedManualTotal
    : (manualAdvanceInputIsValid && manualAdvanceInput !== null ? manualAdvanceInput : autoManualDueNow);
  const resolvedManualBalance = Math.max(0, Math.round((resolvedManualTotal - resolvedManualDueNow) * 100) / 100);

  useEffect(() => {
    const startParts = getManualDateParts(manualStartDateSql);
    const endParts = getManualDateParts(manualEndDateSql);
    const paymentDateParts = getManualDateParts(manualDraft.payment_deadline_date);
    const paymentTimeParts = getManualTimeParts(manualDraft.payment_deadline_time);
    const locationParts = [
      String((selectedBien as any)?.zone_nom || '').trim(),
      String((selectedBien as any)?.ville || '').trim(),
      String((selectedBien as any)?.adresse || '').trim(),
      String(selectedBien?.titre || '').trim(),
    ].filter(Boolean);
    const equipements = extractManualPropertyEquipements(selectedBien, selectedSeasonalConfig);
    const autoVars: Record<string, string> = {
      typeLogement: buildManualPropertyLabel(selectedBien),
      adresseBien: locationParts[0] || '',
      capacite: selectedBien ? String(guestCaps.maxGuests) : '',
      adultes: String(manualAdultGuests > 0 ? `${manualAdultGuests} adulte(s)` : ''),
      enfants: String(`${manualChildGuests} enfant(s)`),
      equipementsBien: equipements,
      heureArrivee: manualDraft.arrival_time || '14:00',
      heureDepart: manualDraft.departure_time || '11:00',
      jj1: startParts.dd,
      mm1: startParts.mm,
      jj2: endParts.dd,
      mm2: endParts.mm,
      loyerTotal: resolvedManualTotal > 0 ? formatManualAmount(resolvedManualTotal) : '',
      acompteReservation: resolvedManualDueNow > 0 ? formatManualAmount(resolvedManualDueNow) : '',
      soldeArrivee: formatManualAmount(resolvedManualBalance),
      idPaiement: manualDraft.payment_id || '',
      modePaiement: manualDraft.payment_method ? `Paiement par ${manualDraft.payment_method}` : '',
      caution: resolvedManualCaution > 0 ? String(resolvedManualCaution) : '',
      jjp: paymentDateParts.dd,
      mmp: paymentDateParts.mm,
      hhp: paymentTimeParts.hh,
      minp: paymentTimeParts.min,
      VS: manualDraft.signature_city || String((selectedBien as any)?.ville || '').trim() || 'Kelibia',
    };
    setManualTemplateVars((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(autoVars)) {
        if (manualEditedTemplateVars[key]) continue;
        next[key] = value;
      }
      return next;
    });
  }, [
    selectedBien,
    selectedSeasonalServices,
    guestCaps.maxGuests,
    manualAdultGuests,
    manualChildGuests,
    manualDraft.arrival_time,
    manualDraft.departure_time,
    manualDraft.payment_deadline_date,
    manualDraft.payment_deadline_time,
    manualDraft.payment_id,
    manualDraft.payment_method,
    manualDraft.signature_city,
    manualStartDateSql,
    manualEndDateSql,
    resolvedManualTotal,
    resolvedManualDueNow,
    resolvedManualBalance,
    resolvedManualCaution,
    manualEditedTemplateVars,
  ]);

  useEffect(() => {
    setManualPreviewUrl('');
  }, [
    manualTemplateVars,
    manualDraft,
    selectedBienId,
    manualStartDateSql,
    manualEndDateSql,
    selectedManualServiceIds,
  ]);

  const handleCreateManualReservation = async () => {
    if (!selectedBienId || !manualStartDateSql || !manualEndDateSql) {
      toast.error('Selectionnez un bien et une periode');
      return;
    }
    if (manualEndDateSql < manualStartDateSql) {
      toast.error('La date de fin doit etre apres la date de debut');
      return;
    }
    if (manualGuestsTotal > guestCaps.maxGuests) {
      toast.error(`Le nombre max de voyageurs pour ce bien est ${guestCaps.maxGuests}`);
      return;
    }
    if (manualAdultGuests > guestCaps.maxAdults) {
      toast.error(`Le nombre max d adultes pour ce bien est ${guestCaps.maxAdults}`);
      return;
    }
    if (manualChildGuests > guestCaps.maxChildren) {
      toast.error(`Le nombre max d enfants pour ce bien est ${guestCaps.maxChildren}`);
      return;
    }
    if (hasManualTotalInput && !manualTotalInputIsValid) {
      toast.error('Le prix total manuel doit etre superieur a 0');
      return;
    }
    if (manualDraft.payment_mode === 'avance' && hasManualAdvanceInput && !manualAdvanceInputIsValid) {
      toast.error('L avance manuelle doit etre un montant valide');
      return;
    }
    if (manualDraft.payment_mode === 'avance' && resolvedManualDueNow > resolvedManualTotal) {
      toast.error('L avance a verser ne peut pas depasser le total');
      return;
    }

    setManualSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/contrats/manual-reservation`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildManualReservationPayload()),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Creation reservation manuelle impossible'));
      toast.success('Reservation manuelle creee avec contrat');
      await fetchData();
      resetManualWizard();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erreur creation reservation manuelle');
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleGenerateManualPreview = async () => {
    if (!selectedBienId || !manualStartDateSql || !manualEndDateSql) {
      toast.error('Completez le bien et la periode avant la generation de l apercu');
      return;
    }
    setManualPreviewLoading(true);
    try {
      const response = await fetch(`${API_URL}/contrats/manual-reservation-preview`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildManualReservationPayload()),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Generation apercu impossible'));
      const data = await response.json();
      const nextUrl = String(data?.contract_url || '').trim();
      if (!nextUrl) throw new Error('Apercu du contrat indisponible');
      setManualPreviewUrl(nextUrl);
      toast.success('Apercu du contrat genere');
    } catch (error: any) {
      toast.error(error?.message || 'Generation apercu impossible');
    } finally {
      setManualPreviewLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestion des Contrats</h1>
          {isRefreshing ? <span className="text-xs font-medium text-emerald-600">Actualisation...</span> : null}
        </div>
        {!manualOpen ? (
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus size={16} />
            Contrat manuel
          </button>
        ) : (
          <button
            type="button"
            onClick={resetManualWizard}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Fermer
          </button>
        )}
      </div>

      {manualOpen && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={16} />
            Contrat manuel - Etape {manualStep}/3
          </div>

          {manualStep === 1 && (
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Variables du contrat</h2>
                <p className="mt-1 text-sm text-gray-600">Remplissez seulement ce que vous voulez imposer. Le reste restera automatique. La vue a droite se met a jour pendant la saisie.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="max-h-[72vh] space-y-4 overflow-auto pr-1">
                    {MANUAL_TEMPLATE_FIELD_GROUPS.filter((group) => MANUAL_STEP1_GROUP_TITLES.has(group.title)).map((group) => (
                      <div key={group.title} className="rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-gray-900">{group.title}</h3>
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {group.keys.map((key) => (
                            <label key={key} className={key === 'equipementsBien' || key === 'userAddress' ? 'sm:col-span-2' : ''}>
                              <span className="mb-1 block text-xs font-medium text-gray-700">{MANUAL_TEMPLATE_VAR_LABELS[key]}</span>
                              <input
                                type="text"
                                className={getManualFieldClass(
                                  Boolean(manualTouchedFields[key]) && ((key === 'fullName' && !manualFullName) || (key === 'identityRef' && !manualIdentityRef))
                                )}
                                placeholder={MANUAL_TEMPLATE_VAR_PLACEHOLDERS[key]}
                                value={manualTemplateVars[key] || ''}
                                onChange={(e) => updateManualTemplateVar(key, e.target.value)}
                                onBlur={() => setManualTouchedFields((prev) => ({ ...prev, [key]: true }))}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="sticky top-4 rounded-[28px] border border-gray-200 bg-[#f6f8fb] p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Vue live</p>
                        <h3 className="text-sm font-semibold text-gray-900">Apercu graphique du contrat</h3>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500">Mise a jour instantanee</div>
                    </div>
                    <div className="overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-inner">
                      <div className="bg-white px-5 py-6 text-[12px] leading-5 text-black">
                        <h4 className="text-center text-[16px] font-bold uppercase tracking-[0.03em] text-black">
                          CONTRAT DE LOCATION SAISONNIERE
                        </h4>

                        <div className="mt-4">
                          <p className="mb-2 font-semibold">Entre les soussignes:</p>
                          <div className="overflow-hidden border border-gray-300">
                            {[
                              ['Le Bailleur :', 'Agence Dwira'],
                              ['Adresse :', 'Rue Ibn Khaldoun, Kelibia 8090, Nabeul'],
                              ['Tel :', '29 879 227 / 52 080 695'],
                              ['MF :', '1919183/K/A/M/000'],
                              ['Represente par :', manualDraft.representative === 'chayma' ? 'Lengliz Chayma, Gerante' : 'Hafsi Ghaith, Responsable commercial'],
                            ].map(([label, value], index) => (
                              <div key={label} className={`grid grid-cols-[220px_minmax(0,1fr)] ${index > 0 ? 'border-t border-gray-300' : ''}`}>
                                <div className="border-r border-gray-300 bg-gray-50 px-2 py-1 font-semibold">{label}</div>
                                <div className="px-2 py-1">{value}</div>
                              </div>
                            ))}
                          </div>
                          <p className="mt-1 text-[10px] italic text-gray-600">(ci-apres designe "le Bailleur")</p>
                        </div>

                        <p className="my-3 text-center text-[14px] font-bold">Et</p>

                        <div>
                          <div className="overflow-hidden border border-gray-300">
                            {[
                              ['Le Locataire :', ''],
                              ['Nom et prenom :', manualLivePreview.fullName],
                              ['N° CIN ou Passeport :', manualLivePreview.identityRef],
                              ['Adresse :', manualLivePreview.userAddress],
                              ['Tel :', manualLivePreview.userPhone],
                            ].map(([label, value], index) => (
                              <div key={label} className={`grid grid-cols-[220px_minmax(0,1fr)] ${index > 0 ? 'border-t border-gray-300' : ''}`}>
                                <div className="border-r border-gray-300 bg-gray-50 px-2 py-1 font-semibold">{label}</div>
                                <div className="px-2 py-1">{value || '\u00A0'}</div>
                              </div>
                            ))}
                          </div>
                          <p className="mt-1 text-[10px] italic text-gray-600">(ci-apres designe "le Locataire")</p>
                        </div>

                        <div className="mt-5 space-y-4">
                          <section>
                            <p className="font-bold">1. Objet du contrat</p>
                            <p>Le present contrat a pour objet la location d'un bien immobilier meuble a usage exclusif d'habitation saisonniere.</p>
                          </section>

                          <section>
                            <p className="font-bold">2. Designation du bien loue</p>
                            <div className="mt-1 space-y-1">
                              <p><span className="font-semibold">Type de logement :</span> {manualLivePreview.typeLogement}</p>
                              <p><span className="font-semibold">Adresse exacte du bien loue :</span> {manualLivePreview.adresseBien}</p>
                              <p><span className="font-semibold">Capacite maximale d'accueil :</span> {manualLivePreview.capacite} personnes, {manualLivePreview.adultes}, {manualLivePreview.enfants}</p>
                              <p><span className="font-semibold">Equipements fournis :</span></p>
                              <p>{manualLivePreview.equipementsBien}</p>
                            </div>
                          </section>

                          <section>
                            <p className="font-bold">3. Duree de la location</p>
                            <p>Le present contrat est conclu pour une duree determinee :</p>
                            <div className="mt-1 space-y-1">
                              <p><span className="font-semibold">Du :</span> {manualLivePreview.arrivalDate} <span className="font-semibold">au</span> {manualLivePreview.departureDate}</p>
                              <p><span className="font-semibold">Heure d'arrivee :</span> {manualLivePreview.heureArrivee}</p>
                              <p><span className="font-semibold">Heure de depart :</span> {manualLivePreview.heureDepart}</p>
                              <p className="font-semibold">NB : Le contrat ne pourra etre renouvele automatiquement.</p>
                            </div>
                          </section>

                          <section>
                            <p className="font-bold">4. Prix et modalites de paiement</p>
                            <div className="mt-2 overflow-hidden border border-gray-300">
                              {[
                                ['Loyer total :', manualLivePreview.loyerTotal],
                                ['Acompte verse a la reservation :', manualLivePreview.acompteReservation],
                                ['Date limite de paiement de l’avance :', manualLivePreview.paymentDeadline],
                                ['N° de quittance / ID du virement :', manualLivePreview.idPaiement],
                                ['Solde a regler a l’arrivee :', manualLivePreview.soldeArrivee],
                                ['Mode de paiement :', manualLivePreview.modePaiement],
                                ['Caution :', manualLivePreview.caution],
                              ].map(([label, value], index) => (
                                <div key={label} className={`grid grid-cols-[260px_minmax(0,1fr)] ${index > 0 ? 'border-t border-gray-300' : ''}`}>
                                  <div className="border-r border-gray-300 bg-gray-50 px-2 py-1 font-semibold">{label}</div>
                                  <div className="px-2 py-1">{value}</div>
                                </div>
                              ))}
                            </div>
                          </section>
                        </div>

                        <div className="mt-5 flex items-end justify-between gap-4 border-t border-gray-200 pt-4">
                          <div>
                            <p className="font-semibold">Fait a {manualTemplateVars.VS || 'Kelibia'}</p>
                            <p>{manualLivePreview.signature}</p>
                          </div>
                          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-right text-[11px]">
                            <p className="font-semibold text-emerald-800">Etat</p>
                            <p className="font-bold text-emerald-900">Brouillon interactif</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={goToManualStep2} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Suivant
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {manualStep === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-900">Selection du bien</h2>
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input value={manualBienSearch} onChange={(e) => setManualBienSearch(e.target.value)} placeholder="Filtrer par reference ou titre" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-auto pr-1">
                {availableBiensForManual.map((bien) => {
                  const isSelected = selectedBienId === bien.id;
                  const imageSrc = bienImageById[bien.id]
                    || toAbsoluteAssetUrl(String(bien.image_url || bien.image || ''))
                    || BIEN_IMAGE_FALLBACK;
                  return (
                    <button
                      key={bien.id}
                      type="button"
                      onClick={() => setSelectedBienId(bien.id)}
                      className={`text-left rounded-lg border p-3 transition ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'}`}
                    >
                      <div className="mb-2 h-24 w-full overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                        <img
                          src={imageSrc}
                          alt={bien.titre || bien.reference || 'Bien'}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(event) => {
                            if (event.currentTarget.src !== BIEN_IMAGE_FALLBACK) {
                              event.currentTarget.src = BIEN_IMAGE_FALLBACK;
                            }
                          }}
                        />
                      </div>
                      <p className="text-xs font-semibold text-gray-500">{bien.reference || bien.id}</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 line-clamp-2">{bien.titre || 'Bien'}</p>
                      <p className="mt-1 text-xs text-gray-600">Prix nuit base: {Number(bien.prix_nuitee || 0)} DT</p>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                  <h3 className="text-sm font-semibold text-gray-900">Bien et sejour</h3>
                  <div className="mt-3 rounded-lg border border-emerald-100 bg-white p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {MANUAL_TEMPLATE_FIELD_GROUPS.find((group) => group.title === 'Bien et sejour')?.keys.map((key) => (
                        <label key={key} className={key === 'equipementsBien' ? 'sm:col-span-2' : ''}>
                          <span className="mb-1 block text-xs font-medium text-gray-700">{MANUAL_TEMPLATE_VAR_LABELS[key]}</span>
                          <input
                            type="text"
                            className={getManualFieldClass(false)}
                            placeholder={MANUAL_TEMPLATE_VAR_PLACEHOLDERS[key]}
                            value={manualTemplateVars[key] || ''}
                            onChange={(e) => updateManualTemplateVar(key, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  {selectedBien ? (
                    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                      <p><strong>Bien:</strong> {selectedBien.reference || selectedBien.id} - {selectedBien.titre || 'Bien'}</p>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-dashed border-gray-300 bg-white p-3 text-sm text-gray-500">
                      Selectionnez un bien ci-dessus pour continuer.
                    </div>
                  )}
                  <div className="mt-3">
                    <h4 className="text-sm font-semibold text-gray-900">Dates de sejour</h4>
                    <p className="mt-1 text-xs text-gray-600">Le calendrier definit la periode de sejour.</p>
                    <div className="mt-3 rounded-lg border border-emerald-100 bg-white p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {MANUAL_TEMPLATE_FIELD_GROUPS.find((group) => group.title === 'Dates sejour')?.keys.map((key) => (
                          <label key={key}>
                            <span className="mb-1 block text-xs font-medium text-gray-700">{MANUAL_TEMPLATE_VAR_LABELS[key]}</span>
                            <input
                              type="text"
                              className={getManualFieldClass(false)}
                              placeholder={MANUAL_TEMPLATE_VAR_PLACEHOLDERS[key]}
                              value={manualTemplateVars[key] || ''}
                              onChange={(e) => updateManualTemplateVar(key, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2">
                      {loadingManualCalendar ? (
                        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">Chargement du calendrier...</div>
                      ) : (
                        <AvailabilityCalendar
                          unavailableDates={selectedBienUnavailableDates.map((row) => ({
                            start: String(row.start_date || '').slice(0, 10),
                            end: String(row.end_date || '').slice(0, 10),
                            status: row.status,
                          }))}
                          onDateRangeSelect={(start, end) => {
                            setSelectedStart(start);
                            setSelectedEnd(end);
                          }}
                          selectedStart={selectedStart}
                          selectedEnd={selectedEnd}
                          showAdminBlockedStatus
                        />
                      )}
                    </div>
                    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
                      <p><strong>Sejour choisi dans le calendrier:</strong> {manualStartDateSql || '-'} au {manualEndDateSql || '-'}</p>
                      <p><strong>Nuits:</strong> {manualNights || 0}</p>
                      <p><strong>Tarif applique:</strong> {pricingSummary.hasPeriodOverride ? 'Periode tarifaire' : 'Tarif standard'} ({baseNightly} DT/nuit{baseWeekly ? `, ${baseWeekly} DT/semaine` : ''})</p>
                    </div>
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-gray-900">Voyageurs et paiement</h3>
                <div className="rounded-lg border border-emerald-100 bg-white p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {MANUAL_TEMPLATE_FIELD_GROUPS.find((group) => group.title === 'Paiement')?.keys.map((key) => (
                      <label key={key}>
                        <span className="mb-1 block text-xs font-medium text-gray-700">{MANUAL_TEMPLATE_VAR_LABELS[key]}</span>
                        <input
                          type="text"
                          className={getManualFieldClass(false)}
                          placeholder={MANUAL_TEMPLATE_VAR_PLACEHOLDERS[key]}
                          value={manualTemplateVars[key] || ''}
                          onChange={(e) => updateManualTemplateVar(key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-2">
                  <input
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${
                      manualTouchedFields.client_email && !manualEmail
                        ? 'border-red-400 bg-red-50'
                        : ''
                    }`}
                    placeholder="Email client *"
                    value={manualDraft.client_email}
                    onChange={(e) => setManualDraft((p) => ({ ...p, client_email: e.target.value }))}
                    onBlur={() => setManualTouchedFields((prev) => ({ ...prev, client_email: true }))}
                  />
                  <select className="w-full rounded-lg border px-3 py-2 text-sm" value={manualDraft.identity_document_type} onChange={(e) => setManualDraft((p) => ({ ...p, identity_document_type: e.target.value as ManualReservationDraft['identity_document_type'] }))}>
                    <option value="cin_tn">Type identite: CIN tunisienne</option>
                    <option value="passport_tn">Type identite: Passeport tunisien</option>
                    <option value="passport_foreign">Type identite: Passeport etranger</option>
                  </select>
                  <select className="w-full rounded-lg border px-3 py-2 text-sm" value={manualDraft.representative} onChange={(e) => setManualDraft((p) => ({ ...p, representative: e.target.value as ManualReservationDraft['representative'] }))}>
                    <option value="ghaith">Representant: Ghaith</option>
                    <option value="chayma">Representant: Chayma</option>
                  </select>
                  <select className="w-full rounded-lg border px-3 py-2 text-sm" value={manualDraft.payment_method} onChange={(e) => setManualDraft((p) => ({ ...p, payment_method: e.target.value as ManualReservationDraft['payment_method'] }))}>
                    <option value="virement">Methode paiement: Virement</option>
                    <option value="especes">Methode paiement: Especes</option>
                    <option value="carte">Methode paiement: Carte</option>
                    <option value="cheque">Methode paiement: Cheque</option>
                  </select>
                </div>
                <textarea className="w-full rounded-lg border px-3 py-2 text-sm" rows={2} placeholder="Note client (optionnel)" value={manualDraft.client_note} onChange={(e) => setManualDraft((p) => ({ ...p, client_note: e.target.value }))} />
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input type="date" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Date limite paiement" value={manualDraft.payment_deadline_date} onChange={(e) => setManualDraft((p) => ({ ...p, payment_deadline_date: e.target.value }))} />
                  <input type="time" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Heure limite paiement" value={manualDraft.payment_deadline_time} onChange={(e) => setManualDraft((p) => ({ ...p, payment_deadline_time: e.target.value }))} />
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                  <p><strong>Voyageurs:</strong> {manualGuestsTotal} (Adultes: {manualAdultGuests}, Enfants: {manualChildGuests})</p>
                  <p><strong>Capacite max:</strong> {guestCaps.maxGuests} voyageurs</p>
                  <p><strong>Total contrat calcule:</strong> {resolvedManualTotal} DT</p>
                  <p><strong>Avance calculee:</strong> {resolvedManualDueNow} DT</p>
                  <p><strong>Solde a l'arrivee:</strong> {Math.max(0, resolvedManualTotal - resolvedManualDueNow)} DT</p>
                  <p><strong>Caution:</strong> {resolvedManualCaution} DT</p>
                  <p><strong>Mode de reglement:</strong> {manualDraft.payment_mode === 'totalite' ? 'Totalite' : `Avance (${advancePercent}%)`}</p>
                  {seasonalServices.length > 0 && (
                    <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Services payants</p>
                          <p className="text-sm font-semibold text-gray-900">Services additionnels disponibles</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700"
                          onClick={() => setSelectedManualServiceCategory('all')}
                        >
                          Voir les {seasonalServices.length} services
                        </button>
                      </div>
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {seasonalServiceCategories.slice(0, 4).map((category) => {
                          const isActive = selectedManualServiceCategory === category.id;
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => setSelectedManualServiceCategory(category.id)}
                              className={`rounded-2xl border px-3 py-3 text-left transition ${isActive ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white'}`}
                            >
                              <p className="text-sm font-semibold text-gray-900">{category.label}</p>
                              <p className="text-xs text-gray-500">{category.count} services</p>
                            </button>
                          );
                        })}
                      </div>
                      <div className="space-y-2 max-h-44 overflow-auto pr-1">
                        {visibleSeasonalServices.map((service) => {
                          const checked = selectedManualServiceIds.includes(String(service.id));
                          return (
                            <label key={service.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                              <span className="min-w-0 pr-2">
                                <span className="block truncate font-semibold text-gray-900">{service.label}</span>
                                <span className="block truncate text-xs text-gray-500">{service.categorie}</span>
                              </span>
                              <span className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-gray-700">{getServiceDisplayPrice(service)}</span>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setSelectedManualServiceIds((prev) => (
                                      checked
                                        ? prev.filter((id) => id !== String(service.id))
                                        : [...prev, String(service.id)]
                                    ));
                                  }}
                                />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-gray-600">Total services fixes: {fixedSeasonalServicesTotal} DT</p>
                    </div>
                  )}
                  {seasonalServices.length === 0 && (
                    <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-500">
                      Aucun service payant configure pour ce bien.
                    </div>
                  )}
                  <p><strong>Total calcule:</strong> {autoManualTotal} DT</p>
                  <p><strong>Total contrat:</strong> {resolvedManualTotal} DT{hasManualTotalInput && manualTotalInputIsValid ? ' (manuel)' : ''}</p>
                  <p><strong>A payer maintenant:</strong> {resolvedManualDueNow} DT ({manualDraft.payment_mode === 'totalite' ? 'Totalite' : (hasManualAdvanceInput && manualAdvanceInputIsValid ? 'Avance manuelle' : `Avance ${advancePercent}%`)})</p>
                  <p><strong>Reste a payer a l'arrivee:</strong> {resolvedManualBalance} DT</p>
                  <p><strong>Caution:</strong> {resolvedManualCaution} DT</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setManualStep(1)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  <ArrowLeft size={15} />
                  Retour
                </button>
                <button type="button" onClick={goToManualStep3} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Suivant
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {manualStep === 3 && (
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Generation et visualisation</h2>
                <p className="mt-1 text-sm text-gray-600">Generez d abord l apercu du contrat, verifiez le PDF, puis confirmez la creation definitive.</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
                <p><strong>Client:</strong> {manualLivePreview.fullName || '-'}</p>
                <p><strong>Email:</strong> {manualEmail || '-'}</p>
                <p><strong>Identite:</strong> {manualLivePreview.identityRef || '-'}</p>
                <p><strong>Bien:</strong> {manualLivePreview.typeLogement || '-'}</p>
                <p><strong>Periode:</strong> {manualLivePreview.arrivalDate || '-'} au {manualLivePreview.departureDate || '-'}</p>
                <p><strong>Total contrat:</strong> {manualLivePreview.loyerTotal || `${resolvedManualTotal} DT`}</p>
                <p><strong>A payer maintenant:</strong> {manualLivePreview.acompteReservation || `${resolvedManualDueNow} DT`}</p>
                <p><strong>Reste a payer:</strong> {manualLivePreview.soldeArrivee || `${resolvedManualBalance} DT`}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleGenerateManualPreview()}
                  disabled={manualPreviewLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {manualPreviewLoading ? 'Generation apercu...' : 'Generer l apercu du contrat'}
                </button>
                {manualPreviewUrl ? (
                  <button
                    type="button"
                    onClick={() => handlePreviewPdf(manualPreviewUrl)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Eye size={15} />
                    Ouvrir l apercu
                  </button>
                ) : null}
              </div>
              {manualPreviewUrl ? (
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <iframe
                    title="Apercu du contrat manuel"
                    src={getPdfUrl(manualPreviewUrl)}
                    className="h-[720px] w-full"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                  Aucun apercu genere pour le moment.
                </div>
              )}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setManualStep(2)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  <ArrowLeft size={15} />
                  Retour
                </button>
                <button type="button" onClick={handleCreateManualReservation} disabled={manualSubmitting || !manualStartDateSql || !manualEndDateSql || !manualPreviewUrl} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {manualSubmitting ? 'Confirmation...' : 'Confirmer et reserver'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={searchLocataire} onChange={(e) => setSearchLocataire(e.target.value)} placeholder="Nom locataire" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={searchProprietaire} onChange={(e) => setSearchProprietaire(e.target.value)} placeholder="Nom proprietaire" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={searchReference} onChange={(e) => setSearchReference(e.target.value)} placeholder="Reference bien" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
          </div>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value as OriginFilter)} className="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="all">Toutes origines</option>
            <option value="manuel">Manuel</option>
            <option value="automatique">Automatique</option>
          </select>
          <div className="relative">
            <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm">
              <option value="created_desc">Plus recents</option>
              <option value="created_asc">Plus anciens</option>
              <option value="start_desc">Debut recent vers ancien</option>
              <option value="start_asc">Debut ancien vers recent</option>
            </select>
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500">{filteredAndSorted.length} contrat(s) trouve(s)</div>
      <div className="flex flex-wrap gap-2">
        {([
          ['all', getContractCategoryLabel('all')],
          ['rejected', getContractCategoryLabel('rejected')],
          ['pending_payment', getContractCategoryLabel('pending_payment')],
          ['finished_paid', getContractCategoryLabel('finished_paid')],
        ] as Array<[ContractCategoryFilter, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategoryFilter(value)}
            className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              categoryFilter === value
                ? 'bg-emerald-600 text-white'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {label} ({contractCategoryCounts[value]})
          </button>
        ))}
      </div>

      {templateVarsEditorOpen && templateVarsTargetContract && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-sky-900">
              Variables contrat: {templateVarsTargetContract.id}
            </h3>
            <button
              type="button"
              onClick={() => {
                setTemplateVarsEditorOpen(false);
                setTemplateVarsTargetContract(null);
                setTemplateVarsDraft({});
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Fermer
            </button>
          </div>
          <p className="text-xs text-sky-800">
            Les valeurs existantes du contrat sont pre-remplies ici. L admin peut les modifier puis regenerer le PDF.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {templateVarKeys.map((key) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">{key}</span>
                <input
                  type="text"
                  value={templateVarsDraft[key] || ''}
                  onChange={(event) => setTemplateVarsDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  placeholder="Laisser vide = valeur auto"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSaveTemplateVars()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Sauvegarder + regenerer
            </button>
          </div>
        </div>
      )}

      {historyViewerContract && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Historique de creation: {historyViewerContract.id}</h3>
              <p className="text-xs text-amber-800">Etapes sauvegardees du parcours de creation du contrat manuel.</p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryViewerContract(null)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Fermer
            </button>
          </div>
          {historyViewerData ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <div className="rounded-lg border border-amber-100 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Etape 1</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{String(historyViewerData?.step_1?.title || 'Variables du contrat')}</p>
                <pre className="mt-2 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap break-words">{JSON.stringify(historyViewerData?.step_1 || {}, null, 2)}</pre>
              </div>
              <div className="rounded-lg border border-amber-100 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Etape 2</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{String(historyViewerData?.step_2?.title || 'Bien, sejour et paiement')}</p>
                <pre className="mt-2 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap break-words">{JSON.stringify(historyViewerData?.step_2 || {}, null, 2)}</pre>
              </div>
              <div className="rounded-lg border border-amber-100 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Etape 3</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{String(historyViewerData?.step_3?.title || 'Generation et confirmation')}</p>
                <pre className="mt-2 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap break-words">{JSON.stringify(historyViewerData?.step_3 || {}, null, 2)}</pre>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-amber-200 bg-white p-4 text-sm text-gray-500">
              Aucun historique sauvegarde pour ce contrat.
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filteredAndSorted.map((contrat) => {
          const bien = bienById.get(contrat.bien_id);
          const origin = String(contrat.origine || 'automatique').toLowerCase() === 'manuel' ? 'manuel' : 'automatique';
          const isAmicaleContract = String(contrat.reservation_payment_mode || '').trim().toLowerCase() === 'amicale'
            || Boolean(String(contrat.pricing_amicale_id || '').trim())
            || Boolean(String(contrat.amicale_name || '').trim());
          const cardDetails = getContractCardDetails(contrat, bien);
          const category = getContractCategory(contrat);
          const financialDraft = getFinancialDraft(contrat);
          const receiptUrl = contrat.payment_receipt_image_url ? toAbsoluteAssetUrl(contrat.payment_receipt_image_url) : '';
          const hasReceipt = Boolean(receiptUrl);
          return (
            <div
              key={contrat.id}
              className={`p-4 sm:p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow ${
                isAmicaleContract
                  ? 'bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(255,255,255,1))] border-emerald-300'
                  : 'bg-white border-gray-100'
              }`}
            >
              <div className="flex justify-between items-start mb-3 sm:mb-4">
                <div className={`${isAmicaleContract ? 'bg-emerald-200 text-emerald-700' : 'bg-emerald-100 text-emerald-600'} p-2 rounded-lg`}>
                  <FileText size={20} className="sm:w-6 sm:h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${isAmicaleContract ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {isAmicaleContract ? 'Demande adherant' : 'Particulier'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${origin === 'manuel' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'}`}>
                    {origin}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${contrat.statut === 'actif' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {contrat.statut}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    category === 'finished_paid'
                      ? 'bg-emerald-100 text-emerald-800'
                      : category === 'rejected'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-800'
                  }`}>
                    {getContractCategoryLabel(category)}
                  </span>
                </div>
              </div>

              <h3 className="font-bold text-base sm:text-lg text-gray-900 mb-1 truncate">{cardDetails.title}</h3>
              <p className="text-xs sm:text-sm text-gray-500 mb-1 truncate">Locataire: {cardDetails.locataire}</p>
              <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 truncate">Proprietaire: {bien?.proprietaire_nom || 'Inconnu'} - Ref: {bien?.reference || '-'}</p>
              {isAmicaleContract ? (
                <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <span>Nom amicale:</span>
                  <span className="truncate">{contrat.amicale_name || 'Amicale'}</span>
                </div>
              ) : null}

              <div className="space-y-2 text-xs sm:text-sm text-gray-600 border-t pt-3 sm:pt-4">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-gray-400 flex-shrink-0 sm:w-4 sm:h-4" />
                  <span className="truncate">Du {new Date(contrat.date_debut).toLocaleDateString()} au {new Date(contrat.date_fin).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-gray-400 flex-shrink-0 sm:w-4 sm:h-4" />
                  <span>Montant recu: {cardDetails.montantRecu}</span>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                <button
                  type="button"
                  onClick={() => setExpandedFinancials((prev) => ({ ...prev, [contrat.id]: !prev[contrat.id] }))}
                  className="flex w-full items-center justify-between gap-3 text-left text-xs text-emerald-900"
                >
                  <span className="font-medium">Pilotage financier contrat</span>
                  <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800">
                    {expandedFinancials[contrat.id] ? 'Reduire' : 'Afficher'}
                    {expandedFinancials[contrat.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>
                {expandedFinancials[contrat.id] ? (
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-800">Montant donne au proprietaire</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={financialDraft.ownerAmount}
                          onChange={(event) => handleFinancialDraftChange(contrat, { ownerAmount: event.target.value })}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-800">Montant total proprietaire</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={financialDraft.ownerTotal}
                          onChange={(event) => handleFinancialDraftChange(contrat, { ownerTotal: event.target.value })}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-800">Profit net</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={financialDraft.netProfit}
                          onChange={(event) => handleFinancialDraftChange(contrat, { netProfit: event.target.value })}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleSaveFinancials(contrat)}
                        disabled={savingFinancialContratId === contrat.id}
                        className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                      >
                        {savingFinancialContratId === contrat.id ? 'Enregistrement...' : 'Enregistrer montants'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button type="button" onClick={() => handlePreviewPdf(contrat.url_pdf)} disabled={!contrat.url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  <Eye size={16} /> Visualiser
                </button>
                <button type="button" onClick={() => void handleRegenerateTemplatePdf(contrat)} disabled={regeneratingContratId === contrat.id} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50">
                  {regeneratingContratId === contrat.id ? 'Regeneration...' : 'Generer template'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleEditTemplateVars(contrat)}
                  disabled={templateVarsLoadingContractId === contrat.id}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-sky-300 text-sky-700 text-sm font-medium hover:bg-sky-50 disabled:opacity-50"
                >
                  {templateVarsLoadingContractId === contrat.id ? 'Chargement...' : 'Modifier variables'}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryViewerContract(contrat)}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
                >
                  Historique creation
                </button>
                <button type="button" onClick={() => void handleSendContractToClient(contrat)} disabled={sendingContratId === contrat.id} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50">
                  {sendingContratId === contrat.id ? 'Envoi...' : 'Envoyer client'}
                </button>
                <button type="button" onClick={() => handleDownloadPdf(contrat.id, contrat.url_pdf)} disabled={!contrat.url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50">
                  <Download size={16} /> Telecharger
                </button>
                <button type="button" onClick={() => handlePreviewPdf(contrat.owner_url_pdf)} disabled={!contrat.owner_url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                  <Eye size={16} /> Visualiser proprietaire
                </button>
                <button type="button" onClick={() => handleDownloadPdf(`${contrat.id}-owner`, contrat.owner_url_pdf)} disabled={!contrat.owner_url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50">
                  <Download size={16} /> Telecharger proprietaire
                </button>
                {category === 'rejected' ? (
                  <button
                    type="button"
                    onClick={() => void handleMoveRejectedToPendingPayment(contrat)}
                    disabled={reopeningContratId === contrat.id}
                    className="col-span-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-violet-300 text-violet-700 text-sm font-medium hover:bg-violet-50 disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    {reopeningContratId === contrat.id ? 'Reouverture...' : 'Deplacer vers attente de paiement'}
                  </button>
                ) : null}
                <label className="col-span-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                  <Upload size={16} />
                  {uploadingContratId === contrat.id ? 'Upload en cours...' : 'Uploader / Remplacer PDF'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={uploadingContratId === contrat.id}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      handleUploadContractPdf(contrat, file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                {hasReceipt ? (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-sky-300 text-sky-700 text-sm font-medium hover:bg-sky-50"
                  >
                    <Eye size={16} /> Voir recu
                  </a>
                ) : (
                  <div className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-dashed border-sky-200 text-sky-600 text-sm">
                    Aucun recu
                  </div>
                )}
                <label className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-50 cursor-pointer">
                  <Upload size={16} />
                  {uploadingReceiptContratId === contrat.id ? 'Upload recu...' : (hasReceipt ? 'Remplacer recu' : 'Uploader recu')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    disabled={uploadingReceiptContratId === contrat.id}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      void handleUploadPaymentReceipt(contrat, file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <button type="button" onClick={() => handleDeleteContract(contrat.id)} className="col-span-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50">
                  <Trash2 size={16} /> Supprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredAndSorted.length === 0 && (
        <div className="text-center py-10 bg-white rounded-lg border border-gray-100 text-gray-500">
          Aucun contrat ne correspond aux filtres.
        </div>
      )}
    </div>
  );
}
