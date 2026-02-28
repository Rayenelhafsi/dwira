import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Edit2, FileText, Mail, Phone, Plus, Search, Trash2, Upload, UserSquare2, Users, X } from 'lucide-react';
import { Bien, ClienteleProfile, ClienteleTask, Contrat, Locataire, Maintenance, Paiement, Proprietaire, Utilisateur } from '../types';
import { toast } from 'sonner';
import { fetchClientInteractions } from '../../utils/clientInteractions';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const DOSSIERS_STORAGE_KEY = 'dwira_clienteles_dossiers_v1';

type ClientCategory = 'locataires' | 'acheteurs' | 'proprietaires';
type ClientRole = 'Locataire' | 'Acheteur' | 'Proprietaire';

type ContratApi = Contrat & {
  bien_titre?: string;
  locataire_nom?: string;
};

type ClientRecord = {
  id: string;
  category: ClientCategory;
  role: ClientRole;
  sourceTable: 'utilisateurs' | 'locataires' | 'proprietaires';
  origins: Array<'utilisateurs' | 'locataires' | 'proprietaires'>;
  linkedUserId?: string | null;
  linkedRecordIds: string[];
  clientType?: 'proprietaire' | 'locataire' | 'acheteur' | null;
  cinImageUrl?: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  cin: string;
  createdAt: string;
};

type BusinessTask = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  dueDate?: string;
};

type BuyerMatch = {
  bienId: string;
  score: number;
  reasons: string[];
};

type ClientInteractionType = 'visite' | 'like' | 'partage';

type ClientInteraction = {
  id: string;
  type: ClientInteractionType;
  bienId: string;
  date: string;
  heure?: string;
  source?: 'admin' | 'site_public';
  clientEmail?: string;
  clientUserId?: string;
};

type ClientDossier = {
  cinImageUrl?: string;
  extraPhones?: string[];
  extraEmails?: string[];
  interactions: ClientInteraction[];
};

type DossierStore = Record<string, ClientDossier>;
type ClientFormState = {
  category: ClientCategory;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  cin: string;
  extraPhones: string;
  extraEmails: string;
};

const splitFullName = (fullName?: string | null) => {
  const cleaned = String(fullName || '').trim();
  if (!cleaned) return { prenom: '', nom: '' };
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { prenom: parts[0], nom: '' };
  return {
    prenom: parts[0],
    nom: parts.slice(1).join(' '),
  };
};

const normalizeText = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizePhone = (value?: string | null) => String(value || '').replace(/\D/g, '');

const formatDate = (value?: string | null) => {
  if (!value) return 'Non renseigne';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

const parseMultivalueText = (value: string) =>
  Array.from(new Set(
    value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
  ));

const mergeUniqueContacts = (primary?: string | null, extras?: string[]) =>
  Array.from(new Set([String(primary || '').trim(), ...(extras || []).map((item) => String(item || '').trim())].filter(Boolean)));

const getTodayDate = () => new Date().toISOString().split('T')[0];
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const createEmptyProfile = (sourceTable: ClientRecord['sourceTable'], sourceId: string, linkedUserId?: string | null, email?: string): ClienteleProfile => ({
  id: `draft_${sourceTable}_${sourceId}`,
  sourceTable,
  sourceId,
  linkedUserId: linkedUserId || null,
  email: email || '',
  globalStatus: 'prospect',
  scoreOverride: null,
  canalEntree: null,
  lastInteractionAt: null,
  lastInteractionNote: '',
  activeRoles: [],
  vip: false,
  blacklistReason: '',
  locataireStatus: null,
  locCinValidee: false,
  locContratSigne: false,
  locDepotEncaisse: false,
  locJustificatifRevenus: false,
  locAttestationTravail: false,
  locNbPersonnes: null,
  locJourEcheance: 5,
  locPenaliteMode: 'jour',
  locPenaliteValeur: null,
  saisonMinNuits: null,
  saisonMaxNuits: null,
  saisonCapaciteMax: null,
  saisonJoursArrivee: [],
  saisonJoursDepart: [],
  saisonAcomptePourcentage: 30,
  saisonDocumentsRecus: false,
  saisonDepotBloque: false,
  saisonDepotRetenuMontant: null,
  saisonDepotRetenuMotif: '',
  acheteurStatus: null,
  acheteurZones: [],
  acheteurTypes: [],
  acheteurBudgetMin: null,
  acheteurBudgetMax: null,
  acheteurSurfaceMin: null,
  acheteurDistancePlageMax: null,
  acheteurFinancementMode: '',
  acheteurNextAction: null,
  acheteurActionDueAt: null,
  proprietaireStatus: null,
  proprietaireMandatType: null,
  proprietaireMandatStart: null,
  proprietaireMandatEnd: null,
  proprietaireReversementFrequence: 'mensuel',
  proprietaireModePaiement: 'virement',
  proprietaireCommissionPercent: 10,
  proprietairePlafondTravaux: 200,
  proprietaireLastStatementAt: null,
  createdAt: '',
  updatedAt: '',
});

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const parseDateToMs = (value?: string | null) => {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Non renseigne';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('fr-FR');
};

const formatGlobalStatus = (value?: ClienteleProfile['globalStatus']) => {
  if (value === 'actif') return 'Actif';
  if (value === 'inactif') return 'Inactif';
  if (value === 'blackliste') return 'Blackliste';
  return 'Prospect';
};

const formatLocataireStatus = (value?: ClienteleProfile['locataireStatus'] | null) => {
  if (value === 'verification') return 'En verification';
  if (value === 'actif') return 'Locataire actif';
  if (value === 'incident') return 'En incident';
  if (value === 'archive') return 'Archive';
  if (value === 'blackliste') return 'Blackliste';
  return 'Prospect locataire';
};

const formatAcheteurStatus = (value?: ClienteleProfile['acheteurStatus'] | null) => {
  if (value === 'qualifie') return 'Qualifie';
  if (value === 'recherche') return 'En recherche';
  if (value === 'visite_planifiee') return 'Visite planifiee';
  if (value === 'offre_en_cours') return 'Offre en cours';
  if (value === 'compromis_signe') return 'Compromis signe';
  if (value === 'vendu') return 'Vendu';
  if (value === 'perdu') return 'Perdu';
  return 'Lead brut';
};

const formatProprietaireStatus = (value?: ClienteleProfile['proprietaireStatus'] | null) => {
  if (value === 'mandat_location') return 'Sous mandat locatif';
  if (value === 'mandat_vente') return 'Sous mandat vente';
  if (value === 'actif') return 'Actif';
  if (value === 'inactif') return 'Inactif';
  if (value === 'blackliste') return 'Blackliste';
  return 'Prospect proprietaire';
};

const formatCanalEntree = (value?: ClienteleProfile['canalEntree'] | null) => {
  if (value === 'site_web') return 'Site web';
  if (value === 'visite_agence') return 'Visite agence';
  if (value === 'recommandation') return 'Recommandation';
  if (value === 'whatsapp') return 'WhatsApp';
  if (value === 'facebook') return 'Facebook';
  if (value === 'google') return 'Google';
  if (value === 'autre') return 'Autre';
  return 'Non renseigne';
};

const formatRoleSlug = (value: string) => {
  if (value === 'locataire') return 'Locataire';
  if (value === 'acheteur') return 'Acheteur';
  if (value === 'proprietaire') return 'Proprietaire';
  return value;
};

const scoreStars = (score: number) => `${'★'.repeat(Math.max(1, Math.min(5, Math.round(score / 20))))} / ${score}`;

const parseInteractionDateTime = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4] || '00',
    minute: match[5] || '00',
    second: match[6] || '00',
  };
};

const formatInteractionDate = (value?: string | null) => {
  const date = parseInteractionDateTime(value);
  if (!date) return String(value || '');
  return `${date.day}/${date.month}/${date.year}`;
};

const formatInteractionTime = (value?: string | null) => {
  const date = parseInteractionDateTime(value);
  if (!date) return '';
  return `${date.hour}:${date.minute}`;
};

const formatInteractionDayKey = (value?: string | null) => {
  const date = parseInteractionDateTime(value);
  if (!date) return '';
  return `${date.year}-${date.month}-${date.day}`;
};

const isClientInteraction = (value: unknown): value is ClientInteraction => {
  if (!value || typeof value !== 'object') return false;
  const interaction = value as Record<string, unknown>;
  return (
    typeof interaction.id === 'string' &&
    (interaction.type === 'visite' || interaction.type === 'like' || interaction.type === 'partage') &&
    typeof interaction.bienId === 'string' &&
    typeof interaction.date === 'string' &&
    (interaction.heure === undefined || typeof interaction.heure === 'string')
  );
};

export default function ClientelesPage() {
  const [activeCategory, setActiveCategory] = useState<ClientCategory>('locataires');
  const [locataires, setLocataires] = useState<Locataire[]>([]);
  const [proprietaires, setProprietaires] = useState<Proprietaire[]>([]);
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [contrats, setContrats] = useState<ContratApi[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [profiles, setProfiles] = useState<ClienteleProfile[]>([]);
  const [persistedBusinessTasks, setPersistedBusinessTasks] = useState<ClienteleTask[] | null>(null);
  const [dossiers, setDossiers] = useState<DossierStore>({});
  const [publicInteractions, setPublicInteractions] = useState<ClientInteraction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [isCinViewerOpen, setIsCinViewerOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientModalMode, setClientModalMode] = useState<'create' | 'edit'>('create');
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingClientSourceTable, setEditingClientSourceTable] = useState<ClientRecord['sourceTable'] | null>(null);
  const [editingLinkedUserId, setEditingLinkedUserId] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState<ClientFormState>({
    category: 'acheteurs',
    nom: '',
    prenom: '',
    telephone: '',
    email: '',
    cin: '',
    extraPhones: '',
    extraEmails: '',
  });
  const [interactionFilters, setInteractionFilters] = useState<{
    type: '' | ClientInteractionType;
    dateFrom: string;
    dateTo: string;
  }>({
    type: '',
    dateFrom: '',
    dateTo: '',
  });
  const [businessProfileDraft, setBusinessProfileDraft] = useState<ClienteleProfile | null>(null);
  const [isSavingBusinessProfile, setIsSavingBusinessProfile] = useState(false);

  useEffect(() => {
    try {
      const savedDossiers = localStorage.getItem(DOSSIERS_STORAGE_KEY);
      const parsedDossiers = savedDossiers ? JSON.parse(savedDossiers) : {};
      const normalizedDossiers = Object.fromEntries(
        Object.entries((parsedDossiers && typeof parsedDossiers === 'object') ? parsedDossiers : {}).map(([clientId, dossier]) => {
          const safeDossier = dossier && typeof dossier === 'object' ? dossier as Record<string, unknown> : {};
          return [clientId, {
            cinImageUrl: typeof safeDossier.cinImageUrl === 'string' ? safeDossier.cinImageUrl : undefined,
            extraPhones: Array.isArray(safeDossier.extraPhones) ? safeDossier.extraPhones.map((item) => String(item || '').trim()).filter(Boolean) : [],
            extraEmails: Array.isArray(safeDossier.extraEmails) ? safeDossier.extraEmails.map((item) => String(item || '').trim()).filter(Boolean) : [],
            interactions: Array.isArray(safeDossier.interactions) ? safeDossier.interactions.filter(isClientInteraction) : [],
          } satisfies ClientDossier];
        })
      );
      setDossiers(normalizedDossiers);
    } catch {
      setDossiers({});
    }
  }, []);

  useEffect(() => {
    const loadInteractions = async () => {
      try {
        const rows = await fetchClientInteractions();
        const nextInteractions = rows.map((interaction) => {
          return {
            id: interaction.id,
            type: interaction.type,
            bienId: interaction.bienId,
            date: formatInteractionDayKey(interaction.dateTime),
            heure: formatInteractionTime(interaction.dateTime) || undefined,
            source: interaction.source === 'admin' ? 'admin' as const : 'site_public' as const,
            clientEmail: interaction.clientEmail,
            clientUserId: interaction.clientUserId,
          };
        });
        setPublicInteractions(nextInteractions);
      } catch {
        setPublicInteractions([]);
      }
    };
    void loadInteractions();
  }, []);

  useEffect(() => {
    localStorage.setItem(DOSSIERS_STORAGE_KEY, JSON.stringify(dossiers));
  }, [dossiers]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const [locatairesResult, proprietairesResult, utilisateursResult, contratsResult, biensResult, paiementsResult, maintenancesResult, profilesResult] = await Promise.allSettled([
        fetch(`${API_URL}/locataires`),
        fetch(`${API_URL}/proprietaires`),
        fetch(`${API_URL}/utilisateurs`),
        fetch(`${API_URL}/contrats`),
        fetch(`${API_URL}/biens`),
        fetch(`${API_URL}/paiements`),
        fetch(`${API_URL}/maintenance`),
        fetch(`${API_URL}/clienteles/profiles`),
      ]);

      if (locatairesResult.status === 'fulfilled' && locatairesResult.value.ok) {
        const rows = await locatairesResult.value.json();
        setLocataires(Array.isArray(rows) ? rows : []);
      } else {
        setLocataires([]);
      }

      if (proprietairesResult.status === 'fulfilled' && proprietairesResult.value.ok) {
        const rows = await proprietairesResult.value.json();
        setProprietaires(Array.isArray(rows) ? rows : []);
      } else {
        setProprietaires([]);
      }

      if (utilisateursResult.status === 'fulfilled' && utilisateursResult.value.ok) {
        const rows = await utilisateursResult.value.json();
        setUtilisateurs(Array.isArray(rows) ? rows : []);
      } else {
        setUtilisateurs([]);
      }

      if (contratsResult.status === 'fulfilled' && contratsResult.value.ok) {
        const rows = await contratsResult.value.json();
        setContrats(Array.isArray(rows) ? rows : []);
      } else {
        setContrats([]);
      }

      if (biensResult.status === 'fulfilled' && biensResult.value.ok) {
        const rows = await biensResult.value.json();
        setBiens(Array.isArray(rows) ? rows : []);
      } else {
        setBiens([]);
      }

      if (paiementsResult.status === 'fulfilled' && paiementsResult.value.ok) {
        const rows = await paiementsResult.value.json();
        setPaiements(Array.isArray(rows) ? rows : []);
      } else {
        setPaiements([]);
      }

      if (maintenancesResult.status === 'fulfilled' && maintenancesResult.value.ok) {
        const rows = await maintenancesResult.value.json();
        setMaintenances(Array.isArray(rows) ? rows : []);
      } else {
        setMaintenances([]);
      }

      if (profilesResult.status === 'fulfilled' && profilesResult.value.ok) {
        const rows = await profilesResult.value.json();
        setProfiles(Array.isArray(rows) ? rows : []);
      } else {
        setProfiles([]);
      }

      setIsLoading(false);
    };

    void fetchData();
  }, []);

  const clientTypeByEmail = useMemo(() => {
    return new Map(
      utilisateurs
        .filter((utilisateur) => utilisateur.role === 'user' && utilisateur.email)
        .map((utilisateur) => [normalizeText(utilisateur.email), utilisateur.client_type || null] as const)
    );
  }, [utilisateurs]);

  const resolveClientType = (email: string, fallback: ClientRecord['clientType']) =>
    clientTypeByEmail.get(normalizeText(email)) || fallback || null;

  const formatClientType = (value?: ClientRecord['clientType']) => {
    if (value === 'proprietaire') return 'Proprietaire';
    if (value === 'locataire') return 'Locataire';
    if (value === 'acheteur') return 'Acheteur';
    return 'Non precise';
  };

  const formatOriginLabel = (origin: ClientRecord['origins'][number]) => {
    if (origin === 'utilisateurs') return 'Compte client';
    if (origin === 'locataires') return 'Table locataires';
    return 'Table proprietaires';
  };

  const utilisateursClientsByType = useMemo(() => {
    const baseUsers = utilisateurs.filter((utilisateur) => utilisateur.role === 'user' && utilisateur.email);
    return {
      locataires: baseUsers.filter((utilisateur) => utilisateur.client_type === 'locataire'),
      acheteurs: baseUsers.filter((utilisateur) => utilisateur.client_type === 'acheteur'),
      proprietaires: baseUsers.filter((utilisateur) => utilisateur.client_type === 'proprietaire'),
    };
  }, [utilisateurs]);

  const findLinkedUser = (
    targetType: 'locataire' | 'proprietaire',
    email?: string | null,
    telephone?: string | null,
    usedUserIds?: Set<string>
  ) => {
    const emailKey = normalizeText(email);
    const phoneKey = normalizePhone(telephone);
    return utilisateurs
      .filter((utilisateur) => utilisateur.role === 'user' && utilisateur.client_type === targetType)
      .find((utilisateur) => {
        if (usedUserIds?.has(utilisateur.id)) return false;
        return (
          (emailKey && normalizeText(utilisateur.email) === emailKey) ||
          (phoneKey && normalizePhone(utilisateur.telephone) === phoneKey)
        );
      }) || null;
  };

  const locataireClients = useMemo<ClientRecord[]>(() => {
    const matchedUserIds = new Set<string>();
    const baseClients = locataires.map((locataire) => {
      const linkedUser = findLinkedUser('locataire', locataire.email, locataire.telephone, matchedUserIds);
      if (linkedUser) matchedUserIds.add(linkedUser.id);
      const { prenom, nom } = splitFullName(locataire.nom);
      return {
        id: locataire.id,
        category: 'locataires',
        role: 'Locataire',
        sourceTable: 'locataires',
        origins: linkedUser ? ['locataires', 'utilisateurs'] : ['locataires'],
        linkedUserId: linkedUser?.id || null,
        linkedRecordIds: [locataire.id, ...(linkedUser ? [linkedUser.id] : [])],
        clientType: linkedUser?.client_type || resolveClientType(locataire.email, 'locataire'),
        cinImageUrl: linkedUser?.cin_image_url || undefined,
        nom: nom || splitFullName(linkedUser?.nom).nom,
        prenom: prenom || splitFullName(linkedUser?.nom).prenom,
        telephone: locataire.telephone || linkedUser?.telephone || '',
        email: locataire.email || linkedUser?.email || '',
        cin: locataire.cin || linkedUser?.cin || '',
        createdAt: locataire.created_at,
      };
    });
    const userOnlyClients = utilisateursClientsByType.locataires
      .filter((utilisateur) => !matchedUserIds.has(utilisateur.id))
      .map((utilisateur) => {
        const { prenom, nom } = splitFullName(utilisateur.nom);
        return {
          id: utilisateur.id,
          category: 'locataires',
          role: 'Locataire',
          sourceTable: 'utilisateurs',
          origins: ['utilisateurs'],
          linkedUserId: utilisateur.id,
          linkedRecordIds: [utilisateur.id],
          clientType: 'locataire' as const,
          cinImageUrl: utilisateur.cin_image_url || undefined,
          nom,
          prenom,
          telephone: utilisateur.telephone || '',
          email: utilisateur.email,
          cin: utilisateur.cin || '',
          createdAt: utilisateur.created_at,
        };
      });
    return [...baseClients, ...userOnlyClients];
  }, [findLinkedUser, locataires, resolveClientType, utilisateursClientsByType.locataires]);

  const proprietaireClients = useMemo<ClientRecord[]>(() => {
    const matchedUserIds = new Set<string>();
    const baseClients = proprietaires.map((proprietaire) => {
      const linkedUser = findLinkedUser('proprietaire', proprietaire.email, proprietaire.telephone, matchedUserIds);
      if (linkedUser) matchedUserIds.add(linkedUser.id);
      const { prenom, nom } = splitFullName(proprietaire.nom);
      return {
        id: proprietaire.id,
        category: 'proprietaires',
        role: 'Proprietaire',
        sourceTable: 'proprietaires',
        origins: linkedUser ? ['proprietaires', 'utilisateurs'] : ['proprietaires'],
        linkedUserId: linkedUser?.id || null,
        linkedRecordIds: [proprietaire.id, ...(linkedUser ? [linkedUser.id] : [])],
        clientType: linkedUser?.client_type || resolveClientType(proprietaire.email, 'proprietaire'),
        cinImageUrl: linkedUser?.cin_image_url || undefined,
        nom: nom || splitFullName(linkedUser?.nom).nom,
        prenom: prenom || splitFullName(linkedUser?.nom).prenom,
        telephone: proprietaire.telephone || linkedUser?.telephone || '',
        email: proprietaire.email || linkedUser?.email || '',
        cin: proprietaire.cin || linkedUser?.cin || '',
        createdAt: '',
      };
    });
    const userOnlyClients = utilisateursClientsByType.proprietaires
      .filter((utilisateur) => !matchedUserIds.has(utilisateur.id))
      .map((utilisateur) => {
        const { prenom, nom } = splitFullName(utilisateur.nom);
        return {
          id: utilisateur.id,
          category: 'proprietaires',
          role: 'Proprietaire',
          sourceTable: 'utilisateurs',
          origins: ['utilisateurs'],
          linkedUserId: utilisateur.id,
          linkedRecordIds: [utilisateur.id],
          clientType: 'proprietaire' as const,
          cinImageUrl: utilisateur.cin_image_url || undefined,
          nom,
          prenom,
          telephone: utilisateur.telephone || '',
          email: utilisateur.email,
          cin: utilisateur.cin || '',
          createdAt: utilisateur.created_at,
        };
      });
    return [...baseClients, ...userOnlyClients];
  }, [findLinkedUser, proprietaires, resolveClientType, utilisateursClientsByType.proprietaires]);

  const acheteurClients = useMemo<ClientRecord[]>(() => {
    return utilisateursClientsByType.acheteurs
      .map((utilisateur) => {
        const { prenom, nom } = splitFullName(utilisateur.nom);
        return {
          id: utilisateur.id,
          category: 'acheteurs',
          role: 'Acheteur',
          sourceTable: 'utilisateurs',
          origins: ['utilisateurs'],
          linkedUserId: utilisateur.id,
          linkedRecordIds: [utilisateur.id],
          clientType: 'acheteur',
          cinImageUrl: utilisateur.cin_image_url || undefined,
          nom,
          prenom,
          telephone: utilisateur.telephone || '',
          email: utilisateur.email,
          cin: utilisateur.cin || '',
          createdAt: utilisateur.created_at,
        };
      });
  }, [utilisateursClientsByType.acheteurs]);

  const clients = useMemo<Record<ClientCategory, ClientRecord[]>>(() => ({
    locataires: locataireClients,
    acheteurs: acheteurClients,
    proprietaires: proprietaireClients,
  }), [acheteurClients, locataireClients, proprietaireClients]);

  const filteredClients = useMemo(() => {
    return clients[activeCategory].filter((client) =>
      normalizeText(`${client.nom} ${client.prenom} ${client.telephone} ${client.cin} ${client.email}`).includes(normalizeText(searchTerm))
    );
  }, [activeCategory, clients, searchTerm]);

  const selectedClientLinkedIds = selectedClient?.linkedRecordIds || (selectedClient ? [selectedClient.id] : []);
  const selectedClientDossier = useMemo<ClientDossier>(() => {
    if (!selectedClient) return { interactions: [] };
    return selectedClientLinkedIds.reduce<ClientDossier>((acc, clientId) => {
      const dossier = dossiers[clientId];
      if (!dossier) return acc;
      return {
        cinImageUrl: acc.cinImageUrl || dossier.cinImageUrl,
        extraPhones: Array.from(new Set([...(acc.extraPhones || []), ...(dossier.extraPhones || [])])),
        extraEmails: Array.from(new Set([...(acc.extraEmails || []), ...(dossier.extraEmails || [])])),
        interactions: [...acc.interactions, ...(dossier.interactions || [])],
      };
    }, { cinImageUrl: selectedClient.cinImageUrl, interactions: [] });
  }, [dossiers, selectedClient, selectedClientLinkedIds]);
  const selectedClientPhones = selectedClient ? mergeUniqueContacts(selectedClient.telephone, selectedClientDossier.extraPhones) : [];
  const selectedClientEmails = selectedClient ? mergeUniqueContacts(selectedClient.email, selectedClientDossier.extraEmails) : [];
  const selectedClientInteractions = useMemo(() => {
    if (!selectedClient) return [];
    const emailSet = new Set(selectedClientEmails.map((email) => normalizeText(email)));
    const userIdSet = new Set(selectedClientLinkedIds);
    const siteInteractions = publicInteractions.filter((interaction) =>
      (interaction.clientUserId && userIdSet.has(interaction.clientUserId)) ||
      emailSet.has(normalizeText(interaction.clientEmail))
    );
    return [...siteInteractions, ...(selectedClientDossier.interactions || [])]
      .filter((interaction) => !interactionFilters.type || interaction.type === interactionFilters.type)
      .filter((interaction) => !interactionFilters.dateFrom || interaction.date >= interactionFilters.dateFrom)
      .filter((interaction) => !interactionFilters.dateTo || interaction.date <= interactionFilters.dateTo)
      .sort((a, b) => {
        const aStamp = `${a.date || ''} ${a.heure || ''}`;
        const bStamp = `${b.date || ''} ${b.heure || ''}`;
        return aStamp < bStamp ? 1 : -1;
      });
  }, [interactionFilters.dateFrom, interactionFilters.dateTo, interactionFilters.type, selectedClient, selectedClientDossier.interactions, selectedClientEmails, selectedClientLinkedIds, publicInteractions]);

  const selectedClientProfile = useMemo(() => {
    if (!selectedClient) return null;
    const primary = profiles.find((profile) => profile.sourceTable === selectedClient.sourceTable && profile.sourceId === selectedClient.id);
    if (primary) return primary;
    if (selectedClient.linkedUserId) {
      const linked = profiles.find((profile) => profile.sourceTable === 'utilisateurs' && profile.sourceId === selectedClient.linkedUserId);
      if (linked) return linked;
    }
    return createEmptyProfile(selectedClient.sourceTable, selectedClient.id, selectedClient.linkedUserId, selectedClient.email);
  }, [profiles, selectedClient]);

  useEffect(() => {
    setBusinessProfileDraft(selectedClientProfile ? { ...selectedClientProfile } : null);
  }, [selectedClientProfile]);

  const selectedClientContracts = useMemo(() => {
    if (!selectedClient) return [];
    if (selectedClient.category === 'locataires') {
      return contrats.filter((contrat) => contrat.locataire_id === selectedClient.id);
    }
    if (selectedClient.category === 'proprietaires') {
      const ownerBienIds = new Set(biens.filter((bien) => bien.proprietaire_id === selectedClient.id).map((bien) => bien.id));
      return contrats.filter((contrat) => ownerBienIds.has(contrat.bien_id));
    }
    return [];
  }, [biens, contrats, selectedClient]);

  const selectedClientPayments = useMemo(() => {
    const contractIds = new Set(selectedClientContracts.map((contrat) => contrat.id));
    return paiements.filter((paiement) => contractIds.has(paiement.contrat_id));
  }, [paiements, selectedClientContracts]);

  const selectedOwnerBiens = useMemo(() => {
    if (!selectedClient || selectedClient.category !== 'proprietaires') return [];
    return biens.filter((bien) => bien.proprietaire_id === selectedClient.id);
  }, [biens, selectedClient]);

  const getBienTitle = (bienId: string) => biens.find((bien) => bien.id === bienId)?.titre || `Bien #${bienId}`;
  const getBienDisplayLabel = (bienId: string) => {
    const bien = biens.find((item) => item.id === bienId);
    if (!bien) return `Bien #${bienId}`;
    return bien.reference ? `${bien.reference} - ${bien.titre}` : bien.titre;
  };

  const lastTrackedInteraction = useMemo(() => {
    if (selectedClientInteractions.length === 0) return null;
    const [first] = selectedClientInteractions;
    return {
      at: `${first.date || ''}${first.heure ? ` ${first.heure}` : ''}`.trim(),
      note: getInteractionLabel(first),
    };
  }, [selectedClientInteractions]);

  const buyerMatches = useMemo<BuyerMatch[]>(() => {
    if (!selectedClient || selectedClient.category !== 'acheteurs' || !businessProfileDraft) return [];
    return biens
      .filter((bien) => bien.mode === 'vente')
      .map((bien) => {
        let score = 0;
        const reasons: string[] = [];
        const zones = (businessProfileDraft.acheteurZones || []).map((item) => normalizeText(item));
        const types = (businessProfileDraft.acheteurTypes || []).map((item) => normalizeText(item));
        if (types.length > 0 && types.includes(normalizeText(bien.type))) {
          score += 30;
          reasons.push('Type compatible');
        }
        if (zones.length > 0 && zones.includes(normalizeText(String((bien as unknown as { zone_nom?: string }).zone_nom || bien.zone_id || '')))) {
          score += 25;
          reasons.push('Zone compatible');
        }
        if (businessProfileDraft.acheteurBudgetMin && (bien.prix_affiche_client || bien.prix_nuitee || 0) >= businessProfileDraft.acheteurBudgetMin) {
          score += 10;
        }
        if (businessProfileDraft.acheteurBudgetMax && (bien.prix_affiche_client || bien.prix_nuitee || 0) <= businessProfileDraft.acheteurBudgetMax) {
          score += 20;
          reasons.push('Budget compatible');
        }
        if (businessProfileDraft.acheteurSurfaceMin && (bien.superficie_m2 || bien.terrain_surface_m2 || 0) >= businessProfileDraft.acheteurSurfaceMin) {
          score += 10;
          reasons.push('Surface suffisante');
        }
        if (businessProfileDraft.acheteurDistancePlageMax && (bien.distance_plage_m || bien.terrain_distance_plage_m || 0) <= businessProfileDraft.acheteurDistancePlageMax) {
          score += 5;
        }
        return {
          bienId: bien.id,
          score: clampScore(score),
          reasons,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [biens, businessProfileDraft, selectedClient]);

  const businessInsights = useMemo(() => {
    if (!selectedClient || !businessProfileDraft) return null;

    const paidPayments = selectedClientPayments.filter((paiement) => paiement.statut === 'paye').length;
    const latePayments = selectedClientPayments.filter((paiement) => paiement.statut === 'retard').length;
    const pendingPayments = selectedClientPayments.filter((paiement) => paiement.statut === 'en_attente').length;
    const totalPayments = selectedClientPayments.length;
    const paidOnTimeRatio = totalPayments > 0 ? paidPayments / totalPayments : 1;
    const hasActiveContract = selectedClientContracts.some((contrat) => contrat.statut === 'actif');
    const hasEndedContract = selectedClientContracts.some((contrat) => contrat.statut === 'termine');
    const ownerRevenue = selectedClientPayments.filter((paiement) => paiement.statut === 'paye').reduce((sum, paiement) => sum + Number(paiement.montant || 0), 0);
    const ownerCharges = maintenances
      .filter((maintenance) => selectedOwnerBiens.some((bien) => bien.id === maintenance.bien_id))
      .reduce((sum, maintenance) => sum + Number(maintenance.cout || 0), 0);
    const ownerCommissionPercent = Number(businessProfileDraft.proprietaireCommissionPercent || 10);
    const ownerCommission = ownerRevenue * (ownerCommissionPercent / 100);
    const ownerNet = ownerRevenue - ownerCommission - ownerCharges;

    let computedLocataireStatus = businessProfileDraft.locataireStatus;
    if (selectedClient.category === 'locataires' && !computedLocataireStatus) {
      if (businessProfileDraft.globalStatus === 'blackliste' || businessProfileDraft.blacklistReason) computedLocataireStatus = 'blackliste';
      else if (latePayments > 0) computedLocataireStatus = 'incident';
      else if (hasActiveContract) computedLocataireStatus = 'actif';
      else if (hasEndedContract) computedLocataireStatus = 'archive';
      else if (businessProfileDraft.locCinValidee || businessProfileDraft.locContratSigne || businessProfileDraft.locDepotEncaisse) computedLocataireStatus = 'verification';
      else computedLocataireStatus = 'prospect';
    }

    let computedAcheteurStatus = businessProfileDraft.acheteurStatus;
    if (selectedClient.category === 'acheteurs' && !computedAcheteurStatus) {
      if (buyerMatches.some((item) => item.score >= 80)) computedAcheteurStatus = 'recherche';
      else if ((businessProfileDraft.acheteurZones || []).length > 0 && (businessProfileDraft.acheteurTypes || []).length > 0 && businessProfileDraft.acheteurBudgetMax && businessProfileDraft.acheteurFinancementMode) computedAcheteurStatus = 'qualifie';
      else computedAcheteurStatus = 'lead_brut';
    }

    let computedProprietaireStatus = businessProfileDraft.proprietaireStatus;
    if (selectedClient.category === 'proprietaires' && !computedProprietaireStatus) {
      const hasActiveBien = selectedOwnerBiens.some((bien) => bien.visible_sur_site || bien.statut === 'disponible' || bien.statut === 'reserve');
      if (businessProfileDraft.globalStatus === 'blackliste' || businessProfileDraft.blacklistReason) computedProprietaireStatus = 'blackliste';
      else if (hasActiveBien) computedProprietaireStatus = 'actif';
      else if (selectedOwnerBiens.length > 0) computedProprietaireStatus = 'inactif';
      else if (businessProfileDraft.proprietaireMandatType === 'vente') computedProprietaireStatus = 'mandat_vente';
      else if (businessProfileDraft.proprietaireMandatType === 'gestion_locative') computedProprietaireStatus = 'mandat_location';
      else computedProprietaireStatus = 'prospect';
    }

    const autoRoles = Array.from(new Set([
      ...(selectedClient.category === 'locataires' ? ['locataire'] : []),
      ...(selectedClient.category === 'acheteurs' ? ['acheteur'] : []),
      ...(selectedClient.category === 'proprietaires' ? ['proprietaire'] : []),
      ...(businessProfileDraft.activeRoles || []),
    ])) as Array<'locataire' | 'acheteur' | 'proprietaire'>;

    let computedScore = businessProfileDraft.scoreOverride;
    if (computedScore === null || computedScore === undefined) {
      if (selectedClient.category === 'locataires') {
        computedScore = clampScore(100 - (latePayments * 20) - (pendingPayments * 10) + (paidOnTimeRatio * 15));
      } else if (selectedClient.category === 'acheteurs') {
        computedScore = clampScore(30 + ((businessProfileDraft.acheteurBudgetMax ? 1 : 0) * 15) + ((businessProfileDraft.acheteurFinancementMode ? 1 : 0) * 15) + Math.min(40, buyerMatches[0]?.score || 0));
      } else {
        computedScore = clampScore(30 + Math.min(30, selectedOwnerBiens.length * 10) + Math.min(20, ownerRevenue / 1000) + Math.min(20, Math.max(0, (Date.now() - parseDateToMs(selectedClient.createdAt || null)) / DAY_IN_MS / 365)));
      }
    }

    const computedGlobalStatus = businessProfileDraft.globalStatus === 'prospect' && (hasActiveContract || selectedOwnerBiens.length > 0 || buyerMatches.some((item) => item.score >= 80))
      ? 'actif'
      : businessProfileDraft.globalStatus;

    return {
      locataireStatus: computedLocataireStatus,
      acheteurStatus: computedAcheteurStatus,
      proprietaireStatus: computedProprietaireStatus,
      activeRoles: autoRoles,
      score: clampScore(Number(computedScore || 0)),
      globalStatus: computedGlobalStatus,
      ownerRevenue,
      ownerCommission,
      ownerCharges,
      ownerNet,
    };
  }, [businessProfileDraft, buyerMatches, maintenances, selectedClient, selectedClientContracts, selectedClientPayments, selectedOwnerBiens]);

  const businessTasks = useMemo<BusinessTask[]>(() => {
    if (!selectedClient || !businessProfileDraft || !businessInsights) return [];
    const tasks: BusinessTask[] = [];

    selectedClientPayments
      .filter((paiement) => paiement.statut === 'retard' && Math.floor((Date.now() - parseDateToMs(paiement.date_paiement)) / DAY_IN_MS) >= 7)
      .forEach((paiement) => {
        tasks.push({
          id: `late-${paiement.id}`,
          severity: 'critical',
          title: 'Envoyer relance 1',
          detail: `Paiement ${paiement.id} en retard depuis plus de 7 jours.`,
          dueDate: paiement.date_paiement,
        });
      });

    selectedClientContracts.forEach((contrat) => {
      const endMs = parseDateToMs(contrat.date_fin);
      const daysToEnd = Math.ceil((endMs - Date.now()) / DAY_IN_MS);
      if (Number.isFinite(daysToEnd) && daysToEnd >= 0 && daysToEnd <= 30) {
        tasks.push({
          id: `renew-${contrat.id}`,
          severity: 'warning',
          title: 'Proposer renouvellement',
          detail: `Contrat ${contrat.id} arrive a echeance dans ${daysToEnd} jour(s).`,
          dueDate: contrat.date_fin,
        });
      }
    });

    if (selectedClient.category === 'acheteurs' && businessInsights.acheteurStatus === 'recherche') {
      const lastInteractionMs = parseDateToMs(lastTrackedInteraction?.at || null);
      const inactiveDays = Number.isFinite(lastInteractionMs) ? Math.floor((Date.now() - lastInteractionMs) / DAY_IN_MS) : 999;
      if (inactiveDays > 15) {
        tasks.push({
          id: 'buyer-follow-up',
          severity: 'warning',
          title: 'Relancer l acheteur',
          detail: 'Aucun contact recent depuis plus de 15 jours.',
          dueDate: getTodayDate(),
        });
      }
      buyerMatches.filter((item) => item.score >= 80).slice(0, 3).forEach((match) => {
        tasks.push({
          id: `buyer-match-${match.bienId}`,
          severity: 'info',
          title: 'Envoyer nouvelle offre',
          detail: `${getBienDisplayLabel(match.bienId)} correspond a ${match.score}%.`,
        });
      });
    }

    if (selectedClient.category === 'proprietaires') {
      const lastStatementMs = parseDateToMs(businessProfileDraft.proprietaireLastStatementAt || null);
      const monthsWithoutStatement = Number.isFinite(lastStatementMs) ? (Date.now() - lastStatementMs) / DAY_IN_MS / 30 : 999;
      if (monthsWithoutStatement >= 3) {
        tasks.push({
          id: 'owner-statement',
          severity: 'warning',
          title: 'Preparer releve',
          detail: 'Aucun releve envoye depuis plusieurs mois.',
        });
      }
      maintenances
        .filter((maintenance) => selectedOwnerBiens.some((bien) => bien.id === maintenance.bien_id) && Number(maintenance.cout || 0) > Number(businessProfileDraft.proprietairePlafondTravaux || 200))
        .forEach((maintenance) => {
          tasks.push({
            id: `maintenance-${maintenance.id}`,
            severity: 'warning',
            title: 'Accord proprietaire requis',
            detail: `Maintenance ${maintenance.id} depasse le plafond autorise.`,
          });
        });
    }

    return tasks;
  }, [businessInsights, businessProfileDraft, buyerMatches, lastTrackedInteraction?.at, maintenances, selectedClient, selectedClientContracts, selectedClientPayments, selectedOwnerBiens]);

  const displayBusinessTasks = useMemo<BusinessTask[]>(
    () => (
      persistedBusinessTasks !== null
        ? persistedBusinessTasks.map((task) => ({
            id: task.id,
            severity: task.severity,
            title: task.title,
            detail: task.detail,
            dueDate: task.dueDate || undefined,
          }))
        : businessTasks
    ),
    [businessTasks, persistedBusinessTasks]
  );

  useEffect(() => {
    if (!selectedClient) {
      setPersistedBusinessTasks(null);
      return;
    }

    let cancelled = false;
    const loadTasks = async () => {
      try {
        const response = await fetch(
          `${API_URL}/clienteles/tasks/${encodeURIComponent(selectedClient.sourceTable)}/${encodeURIComponent(selectedClient.id)}`
        );
        if (!response.ok) {
          if (!cancelled) setPersistedBusinessTasks(null);
          return;
        }
        const rows = await response.json();
        if (!cancelled) setPersistedBusinessTasks(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setPersistedBusinessTasks(null);
      }
    };

    void loadTasks();
    return () => {
      cancelled = true;
    };
  }, [selectedClient]);

  function getInteractionLabel(interaction: ClientInteraction) {
    const bienTitle = getBienDisplayLabel(interaction.bienId);
    if (interaction.type === 'visite') return `Visite du bien ${bienTitle}`;
    if (interaction.type === 'like') return `Like sur le bien ${bienTitle}`;
    return `Partage du bien ${bienTitle}`;
  }

  const resetClientForm = (category: ClientCategory = activeCategory) => {
    setClientForm({
      category,
      nom: '',
      prenom: '',
      telephone: '',
      email: '',
      cin: '',
      extraPhones: '',
      extraEmails: '',
    });
    setEditingClientId(null);
    setEditingClientSourceTable(null);
    setEditingLinkedUserId(null);
    setClientModalMode('create');
  };

  const openCreateClientModal = () => {
    resetClientForm(activeCategory);
    setIsClientModalOpen(true);
  };

  const openEditClientModal = (client: ClientRecord) => {
    const dossier = dossiers[client.id] || { interactions: [] };
    setClientModalMode('edit');
    setEditingClientId(client.id);
    setEditingClientSourceTable(client.sourceTable);
    setEditingLinkedUserId(client.linkedUserId || null);
    setClientForm({
      category: client.category,
      nom: client.nom,
      prenom: client.prenom,
      telephone: client.telephone,
      email: client.email,
      cin: client.cin,
      extraPhones: (dossier.extraPhones || []).join('\n'),
      extraEmails: (dossier.extraEmails || []).join('\n'),
    });
    setIsClientModalOpen(true);
  };

  const closeClientModal = () => {
    setIsClientModalOpen(false);
    resetClientForm(activeCategory);
  };

  const handleSaveBusinessProfile = async () => {
    if (!selectedClient || !businessProfileDraft) return;
    if (selectedClient.category === 'acheteurs' && businessProfileDraft.acheteurStatus === 'qualifie') {
      if ((businessProfileDraft.acheteurZones || []).length === 0 || (businessProfileDraft.acheteurTypes || []).length === 0 || !businessProfileDraft.acheteurBudgetMax || !businessProfileDraft.acheteurFinancementMode) {
        toast.error('Un acheteur qualifie doit avoir zones, type de bien, budget et mode de financement');
        return;
      }
    }
    if (selectedClient.category === 'locataires' && businessProfileDraft.locataireStatus === 'actif') {
      if (!businessProfileDraft.locCinValidee || !businessProfileDraft.locContratSigne || !businessProfileDraft.locDepotEncaisse) {
        toast.error('Passage en locataire actif impossible sans CIN validee, contrat signe et depot encaisse');
        return;
      }
    }
    if (selectedClient.category === 'proprietaires' && (businessProfileDraft.proprietaireStatus === 'actif' || businessProfileDraft.proprietaireStatus === 'mandat_location' || businessProfileDraft.proprietaireStatus === 'mandat_vente')) {
      if (!businessProfileDraft.proprietaireMandatType || !businessProfileDraft.proprietaireMandatStart) {
        toast.error('Un proprietaire actif ou sous mandat doit avoir un mandat renseigne');
        return;
      }
    }
    setIsSavingBusinessProfile(true);
    try {
      const response = await fetch(
        `${API_URL}/clienteles/profiles/${encodeURIComponent(businessProfileDraft.sourceTable)}/${encodeURIComponent(businessProfileDraft.sourceId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...businessProfileDraft,
            activeRoles: businessInsights?.activeRoles || businessProfileDraft.activeRoles,
            scoreOverride: businessProfileDraft.scoreOverride === null || businessProfileDraft.scoreOverride === undefined || businessProfileDraft.scoreOverride === 0
              ? null
              : businessProfileDraft.scoreOverride,
            linkedUserId: selectedClient.linkedUserId || null,
            email: selectedClient.email || businessProfileDraft.email || '',
          }),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Sauvegarde impossible');
      }
      const savedProfile = await response.json();
      setProfiles((prev) => {
        const next = prev.filter((item) => !(item.sourceTable === savedProfile.sourceTable && item.sourceId === savedProfile.sourceId));
        return [savedProfile, ...next];
      });
      setBusinessProfileDraft(savedProfile);
      if (selectedClient) {
        const tasksResponse = await fetch(
          `${API_URL}/clienteles/tasks/${encodeURIComponent(selectedClient.sourceTable)}/${encodeURIComponent(selectedClient.id)}`
        );
        if (tasksResponse.ok) {
          const rows = await tasksResponse.json();
          setPersistedBusinessTasks(Array.isArray(rows) ? rows : []);
        }
      }
      toast.success('Profil metier enregistre');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de sauvegarder le profil metier');
    } finally {
      setIsSavingBusinessProfile(false);
    }
  };

  const handleSaveClient = async () => {
    if (!clientForm.nom.trim() || !clientForm.prenom.trim() || !clientForm.telephone.trim() || !clientForm.cin.trim()) {
      toast.error('Nom, prenom, telephone et CIN sont requis');
      return;
    }

    const extraPhones = parseMultivalueText(clientForm.extraPhones);
    const extraEmails = parseMultivalueText(clientForm.extraEmails);

    const payload = {
      nom: `${clientForm.prenom.trim()} ${clientForm.nom.trim()}`.trim(),
      telephone: clientForm.telephone.trim(),
      email: clientForm.email.trim(),
      cin: clientForm.cin.trim(),
      score_fiabilite: 5,
    };

    try {
      if (clientForm.category === 'acheteurs') {
        const utilisateurPayload = {
          nom: `${clientForm.prenom.trim()} ${clientForm.nom.trim()}`.trim(),
          email: clientForm.email.trim(),
          role: 'user',
          telephone: clientForm.telephone.trim(),
          client_type: 'acheteur',
          cin: clientForm.cin.trim() || null,
          cin_image_url: (editingClientId ? dossiers[editingClientId]?.cinImageUrl : '') || null,
        };
        const url = clientModalMode === 'edit' && editingClientId
          ? `${API_URL}/utilisateurs/${encodeURIComponent(editingClientId)}`
          : `${API_URL}/utilisateurs`;
        const method = clientModalMode === 'edit' ? 'PUT' : 'POST';
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(utilisateurPayload),
        });
        if (!response.ok) throw new Error('Acheteur request failed');
        const savedBuyer = await response.json();
        setUtilisateurs((prev) => {
          if (clientModalMode === 'edit') {
            return prev.map((item) => item.id === savedBuyer.id ? savedBuyer : item);
          }
          return [savedBuyer, ...prev];
        });
        if (selectedClient?.id === savedBuyer.id) {
          const parts = splitFullName(savedBuyer.nom);
          setSelectedClient((prev) => prev ? {
            ...prev,
            nom: parts.nom,
            prenom: parts.prenom,
            telephone: savedBuyer.telephone || '',
            email: savedBuyer.email,
            cin: savedBuyer.cin || '',
          } : null);
        }
        setDossiers((prev) => ({
          ...prev,
          [savedBuyer.id]: {
            cinImageUrl: prev[savedBuyer.id]?.cinImageUrl || savedBuyer.cin_image_url || undefined,
            interactions: prev[savedBuyer.id]?.interactions || [],
            extraPhones,
            extraEmails,
          },
        }));
        toast.success(clientModalMode === 'edit' ? 'Acheteur modifie' : 'Acheteur ajoute');
        closeClientModal();
        return;
      }

      if (clientModalMode === 'edit' && editingClientSourceTable === 'utilisateurs' && editingClientId) {
        const utilisateurPayload = {
          nom: `${clientForm.prenom.trim()} ${clientForm.nom.trim()}`.trim(),
          email: clientForm.email.trim(),
          role: 'user',
          telephone: clientForm.telephone.trim(),
          client_type: clientForm.category === 'locataires' ? 'locataire' : 'proprietaire',
          cin: clientForm.cin.trim() || null,
          cin_image_url: dossiers[editingClientId]?.cinImageUrl || null,
        };
        const response = await fetch(`${API_URL}/utilisateurs/${encodeURIComponent(editingClientId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(utilisateurPayload),
        });
        if (!response.ok) throw new Error('User request failed');
        const savedUser = await response.json();
        setUtilisateurs((prev) => prev.map((item) => item.id === savedUser.id ? savedUser : item));
        if (selectedClient?.id === savedUser.id) {
          const parts = splitFullName(savedUser.nom);
          setSelectedClient((prev) => prev ? {
            ...prev,
            nom: parts.nom,
            prenom: parts.prenom,
            telephone: savedUser.telephone || '',
            email: savedUser.email,
            cin: savedUser.cin || '',
          } : null);
        }
        setDossiers((prev) => ({
          ...prev,
          [savedUser.id]: {
            cinImageUrl: prev[savedUser.id]?.cinImageUrl || savedUser.cin_image_url || undefined,
            interactions: prev[savedUser.id]?.interactions || [],
            extraPhones,
            extraEmails,
          },
        }));
        toast.success('Client modifie');
        closeClientModal();
        return;
      }

      const endpoint = clientForm.category === 'locataires' ? 'locataires' : 'proprietaires';
      const url = clientModalMode === 'edit' && editingClientId
        ? `${API_URL}/${endpoint}/${encodeURIComponent(editingClientId)}`
        : `${API_URL}/${endpoint}`;
      const method = clientModalMode === 'edit' ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Request failed');
      const saved = await response.json();

      if (clientForm.category === 'locataires') {
        setLocataires((prev) => {
          const next = clientModalMode === 'edit'
            ? prev.map((item) => item.id === saved.id ? saved : item)
            : [saved, ...prev];
          return next;
        });
      } else {
        setProprietaires((prev) => {
          const next = clientModalMode === 'edit'
            ? prev.map((item) => item.id === saved.id ? saved : item)
            : [saved, ...prev];
          return next;
        });
      }

      if (selectedClient?.id === saved.id) {
        const parts = splitFullName(saved.nom);
        setSelectedClient((prev) => prev ? {
          ...prev,
          nom: parts.nom,
          prenom: parts.prenom,
          telephone: saved.telephone,
          email: saved.email,
          cin: saved.cin,
        } : null);
      }

      setDossiers((prev) => ({
        ...prev,
        [saved.id]: {
          cinImageUrl: prev[saved.id]?.cinImageUrl,
          interactions: prev[saved.id]?.interactions || [],
          extraPhones,
          extraEmails,
        },
      }));

      if (editingLinkedUserId) {
        const linkedUserPayload = {
          nom: `${clientForm.prenom.trim()} ${clientForm.nom.trim()}`.trim(),
          email: clientForm.email.trim(),
          role: 'user',
          telephone: clientForm.telephone.trim(),
          client_type: clientForm.category === 'locataires' ? 'locataire' : 'proprietaire',
          cin: clientForm.cin.trim() || null,
          cin_image_url: dossiers[editingLinkedUserId]?.cinImageUrl || null,
        };
        const linkedResponse = await fetch(`${API_URL}/utilisateurs/${encodeURIComponent(editingLinkedUserId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(linkedUserPayload),
        });
        if (linkedResponse.ok) {
          const linkedUser = await linkedResponse.json();
          setUtilisateurs((prev) => prev.map((item) => item.id === linkedUser.id ? linkedUser : item));
        }
      }

      toast.success(clientModalMode === 'edit' ? 'Client modifie' : 'Client ajoute');
      closeClientModal();
    } catch {
      toast.error("Erreur lors de l'enregistrement du client");
    }
  };

  const handleDeleteClient = async (client: ClientRecord) => {
    if (!window.confirm(`Supprimer ${client.prenom} ${client.nom} ?`)) return;

    try {
      if (client.category === 'acheteurs' || client.sourceTable === 'utilisateurs') {
        const response = await fetch(`${API_URL}/utilisateurs/${encodeURIComponent(client.id)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        setUtilisateurs((prev) => prev.filter((item) => item.id !== client.id));
      } else {
        const endpoint = client.category === 'locataires' ? 'locataires' : 'proprietaires';
        const response = await fetch(`${API_URL}/${endpoint}/${encodeURIComponent(client.id)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        if (client.category === 'locataires') {
          setLocataires((prev) => prev.filter((item) => item.id !== client.id));
        } else {
          setProprietaires((prev) => prev.filter((item) => item.id !== client.id));
        }
      }

      setDossiers((prev) => {
        const next = { ...prev };
        delete next[client.id];
        return next;
      });
      if (selectedClient?.id === client.id) {
        setSelectedClient(null);
      }
      toast.success('Client supprime');
    } catch {
      toast.error('Erreur lors de la suppression du client');
    }
  };

  const handleUploadCinImage = async (clientId: string, file: File) => {
    const uploadFormData = new FormData();
    uploadFormData.append('image', file);
    const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: uploadFormData });
    if (!response.ok) throw new Error('Upload failed');
    const data = await response.json();
    const imageUrl = String(data?.url || data?.imageUrl || '');
    if (!imageUrl) throw new Error('Missing uploaded image url');

    if (selectedClient) {
      const linkedIds = selectedClient.linkedRecordIds.length > 0 ? selectedClient.linkedRecordIds : [clientId];
      setDossiers((prev) => {
        const next = { ...prev };
        for (const linkedId of linkedIds) {
          next[linkedId] = {
            cinImageUrl: imageUrl,
            extraPhones: prev[linkedId]?.extraPhones || [],
            extraEmails: prev[linkedId]?.extraEmails || [],
            interactions: prev[linkedId]?.interactions || [],
          };
        }
        return next;
      });
      setSelectedClient((prev) => prev ? { ...prev, cinImageUrl: imageUrl } : null);

      const targetUserId = selectedClient.linkedUserId || (selectedClient.sourceTable === 'utilisateurs' ? selectedClient.id : null);
      if (targetUserId) {
        const linkedUser = utilisateurs.find((item) => item.id === targetUserId);
        if (linkedUser) {
          const updateResponse = await fetch(`${API_URL}/utilisateurs/${encodeURIComponent(targetUserId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nom: linkedUser.nom,
              email: linkedUser.email,
              role: linkedUser.role,
              avatar: linkedUser.avatar || null,
              telephone: linkedUser.telephone || null,
              client_type: linkedUser.client_type || null,
              cin: linkedUser.cin || null,
              cin_image_url: imageUrl,
            }),
          });
          if (updateResponse.ok) {
            const savedUser = await updateResponse.json();
            setUtilisateurs((prev) => prev.map((item) => item.id === savedUser.id ? savedUser : item));
          }
        }
      }
      return;
    }

    setDossiers((prev) => ({
      ...prev,
      [clientId]: {
        cinImageUrl: imageUrl,
        extraPhones: prev[clientId]?.extraPhones || [],
        extraEmails: prev[clientId]?.extraEmails || [],
        interactions: prev[clientId]?.interactions || [],
      },
    }));
  };

  const handleCinFileChange = async (event: React.ChangeEvent<HTMLInputElement>, clientId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await handleUploadCinImage(clientId, file);
      toast.success("Image de la carte d'identite ajoutee");
    } catch {
      toast.error("Erreur lors de l'upload de la carte d'identite");
    } finally {
      event.target.value = '';
    }
  };

  useEffect(() => {
    setInteractionFilters({
      type: '',
      dateFrom: '',
      dateTo: '',
    });
  }, [selectedClient?.id]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clienteles</h1>
          <p className="text-sm text-gray-500">Locataires, acheteurs et proprietaires avec dossier client, CIN et historique.</p>
        </div>
        <button
          type="button"
          onClick={openCreateClientModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Nouveau client
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <CategoryButton active={activeCategory === 'locataires'} label={`Locataires (${locataireClients.length})`} onClick={() => setActiveCategory('locataires')} />
            <CategoryButton active={activeCategory === 'acheteurs'} label={`Acheteurs (${acheteurClients.length})`} onClick={() => setActiveCategory('acheteurs')} />
            <CategoryButton active={activeCategory === 'proprietaires'} label={`Proprietaires (${proprietaireClients.length})`} onClick={() => setActiveCategory('proprietaires')} />
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher un client..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Prenom</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Roles actifs</th>
                <th className="px-4 py-3">Type client</th>
                <th className="px-4 py-3">Origine</th>
                <th className="px-4 py-3">Telephone</th>
                <th className="px-4 py-3">Carte d'identite</th>
                <th className="px-4 py-3">Image CIN</th>
                <th className="px-4 py-3">Historique</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredClients.map((client) => {
                const dossierImage = client.cinImageUrl || dossiers[client.id]?.cinImageUrl;
                const clientProfile = profiles.find((profile) => profile.sourceTable === client.sourceTable && profile.sourceId === client.id)
                  || (client.linkedUserId ? profiles.find((profile) => profile.sourceTable === 'utilisateurs' && profile.sourceId === client.linkedUserId) : null)
                  || createEmptyProfile(client.sourceTable, client.id, client.linkedUserId, client.email);
                const profileRoles = Array.from(new Set([...(clientProfile.activeRoles || []), ...(client.category === 'locataires' ? ['locataire'] : []), ...(client.category === 'acheteurs' ? ['acheteur'] : []), ...(client.category === 'proprietaires' ? ['proprietaire'] : [])]));
                const profileStatus = clientProfile.globalStatus;
                const clientContracts = client.category === 'locataires'
                  ? contrats.filter((contrat) => contrat.locataire_id === client.id)
                  : client.category === 'proprietaires'
                    ? contrats.filter((contrat) => biens.some((bien) => bien.proprietaire_id === client.id && bien.id === contrat.bien_id))
                    : [];
                const contractIds = new Set(clientContracts.map((contrat) => contrat.id));
                const clientPayments = paiements.filter((paiement) => contractIds.has(paiement.contrat_id));
                const profileScore = clientProfile.scoreOverride ?? (
                  client.category === 'locataires'
                    ? clampScore(100 - (clientPayments.filter((item) => item.statut === 'retard').length * 20) - (clientPayments.filter((item) => item.statut === 'en_attente').length * 10))
                    : client.category === 'acheteurs'
                      ? clampScore(30 + ((clientProfile.acheteurBudgetMax ? 1 : 0) * 20) + ((clientProfile.acheteurFinancementMode ? 1 : 0) * 20))
                      : clampScore(30 + (biens.filter((bien) => bien.proprietaire_id === client.id).length * 10))
                );
                return (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">{client.nom || '-'}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{client.role}</span>
                        {client.origins.length > 1 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">Fusionne</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{client.prenom || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatGlobalStatus(profileStatus)}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{scoreStars(profileScore)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {profileRoles.map((role) => (
                          <span key={`${client.id}-${role}`} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                            {formatRoleSlug(role)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{formatClientType(client.clientType)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {client.origins.map((origin) => (
                          <span key={`${client.id}-${origin}`} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
                            {formatOriginLabel(origin)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{client.telephone || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{client.cin || '-'}</td>
                    <td className="px-4 py-4">
                      {dossierImage ? (
                        <img src={dossierImage} alt="Carte d'identite" className="h-12 w-20 rounded border border-gray-200 object-cover" />
                      ) : (
                        <span className="text-xs text-gray-400">Aucune image</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => setSelectedClient(client)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                        <FileText className="h-4 w-4" />
                        Ouvrir dossier
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openEditClientModal(client)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <Edit2 className="h-4 w-4" />
                          Modifier
                        </button>
                        <button type="button" onClick={() => void handleDeleteClient(client)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredClients.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-gray-500" colSpan={12}>Aucun client trouve pour cette categorie.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Dossier client</h2>
                <p className="text-sm text-gray-500">{selectedClient.prenom} {selectedClient.nom} - {selectedClient.role}</p>
              </div>
              <button type="button" onClick={() => setSelectedClient(null)} className="rounded-lg p-2 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[360px,1fr]">
              <div className="border-b border-gray-200 bg-gray-50 p-5 lg:border-b-0 lg:border-r">
                <h3 className="text-sm font-semibold text-gray-900">Informations client</h3>
                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  <InfoRow icon={<Users className="h-4 w-4" />} label="Nom" value={selectedClient.nom || '-'} />
                  <InfoRow icon={<UserSquare2 className="h-4 w-4" />} label="Prenom" value={selectedClient.prenom || '-'} />
                  <InfoRow icon={<Users className="h-4 w-4" />} label="Type client" value={formatClientType(selectedClient.clientType)} />
                  <InfoRow icon={<Users className="h-4 w-4" />} label="Statut global" value={businessInsights ? formatGlobalStatus(businessInsights.globalStatus) : 'Prospect'} />
                  <InfoRow icon={<Users className="h-4 w-4" />} label="Score" value={businessInsights ? scoreStars(businessInsights.score) : '-'} />
                  <InfoListRow icon={<FileText className="h-4 w-4" />} label="Origines" values={selectedClient.origins.map(formatOriginLabel)} emptyLabel="Aucune origine" />
                  <InfoListRow icon={<Users className="h-4 w-4" />} label="Roles actifs" values={businessInsights ? businessInsights.activeRoles.map(formatRoleSlug) : []} emptyLabel="Aucun role actif" />
                  <InfoListRow icon={<Phone className="h-4 w-4" />} label="Telephones" values={selectedClientPhones} emptyLabel="Aucun telephone" />
                  <InfoListRow icon={<Mail className="h-4 w-4" />} label="Emails" values={selectedClientEmails} emptyLabel="Aucun email" />
                  <InfoRow icon={<FileText className="h-4 w-4" />} label="Carte d'identite" value={selectedClient.cin || '-'} />
                </div>

                <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-gray-900">Image carte d'identite</h4>
                  <div className="mt-3">
                    {selectedClientDossier.cinImageUrl ? (
                      <img src={selectedClientDossier.cinImageUrl} alt="Carte d'identite" className="h-44 w-full rounded-lg border border-gray-200 object-cover" />
                    ) : (
                      <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
                        Aucune image de CIN
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedClientDossier.cinImageUrl ? (
                      <button
                        type="button"
                        onClick={() => setIsCinViewerOpen(true)}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
                      >
                        Voir en grand
                      </button>
                    ) : null}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                      <Upload className="h-4 w-4" />
                      Upload image CIN
                      <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleCinFileChange(event, selectedClient.id)} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-5">
                {businessProfileDraft && businessInsights && (
                  <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Logique metier client</h3>
                        <p className="mt-1 text-xs text-gray-500">Statut global, score, canal d'entree, roles actifs et regles metier par categorie.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSaveBusinessProfile()}
                        disabled={isSavingBusinessProfile}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingBusinessProfile ? 'Enregistrement...' : 'Enregistrer le profil metier'}
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div className="rounded-xl border border-white bg-white p-4">
                        <h4 className="text-sm font-semibold text-gray-900">Vision globale</h4>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <FormField label="Statut global">
                            <select value={businessProfileDraft.globalStatus} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, globalStatus: e.target.value as ClienteleProfile['globalStatus'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                              <option value="prospect">Prospect</option>
                              <option value="actif">Actif</option>
                              <option value="inactif">Inactif</option>
                              <option value="blackliste">Blackliste</option>
                            </select>
                          </FormField>
                          <FormField label="Score manuel (0-100)">
                            <input type="number" min={0} max={100} value={businessProfileDraft.scoreOverride ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, scoreOverride: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Canal d'entree">
                            <select value={businessProfileDraft.canalEntree || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, canalEntree: (e.target.value || null) as ClienteleProfile['canalEntree'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                              <option value="">Selectionner</option>
                              <option value="facebook">Facebook</option>
                              <option value="site_web">Site web</option>
                              <option value="whatsapp">WhatsApp</option>
                              <option value="visite_agence">Visite agence</option>
                              <option value="recommandation">Recommandation</option>
                              <option value="google">Google</option>
                              <option value="autre">Autre</option>
                            </select>
                          </FormField>
                          <FormField label="Derniere interaction">
                            <input type="datetime-local" value={businessProfileDraft.lastInteractionAt ? String(businessProfileDraft.lastInteractionAt).replace(' ', 'T').slice(0, 16) : ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, lastInteractionAt: e.target.value ? `${e.target.value}:00` : null } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Note derniere interaction">
                            <textarea value={businessProfileDraft.lastInteractionNote || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, lastInteractionNote: e.target.value } : prev)} rows={3} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs uppercase tracking-wide text-gray-400">Synthese</p>
                            <p className="mt-2 text-sm font-medium text-gray-900">{formatGlobalStatus(businessInsights.globalStatus)}</p>
                            <p className="mt-1 text-sm text-gray-600">{scoreStars(businessInsights.score)}</p>
                            <p className="mt-1 text-xs text-gray-500">Canal: {formatCanalEntree(businessProfileDraft.canalEntree)}</p>
                            <p className="mt-1 text-xs text-gray-500">Derniere interaction: {businessProfileDraft.lastInteractionAt ? formatDateTime(businessProfileDraft.lastInteractionAt) : (lastTrackedInteraction?.at || 'Non renseignee')}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {(['locataire', 'acheteur', 'proprietaire'] as const).map((role) => (
                            <label key={role} className="inline-flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={(businessProfileDraft.activeRoles || businessInsights.activeRoles).includes(role)}
                                onChange={(e) => setBusinessProfileDraft((prev) => prev ? {
                                  ...prev,
                                  activeRoles: e.target.checked
                                    ? Array.from(new Set([...(prev.activeRoles || []), role]))
                                    : (prev.activeRoles || []).filter((item) => item !== role),
                                } : prev)}
                              />
                              {formatRoleSlug(role)}
                            </label>
                          ))}
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={businessProfileDraft.vip} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, vip: e.target.checked } : prev)} />
                            VIP
                          </label>
                        </div>
                        {businessProfileDraft.globalStatus === 'blackliste' && (
                          <div className="mt-3">
                            <FormField label="Motif blacklist">
                              <textarea value={businessProfileDraft.blacklistReason || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, blacklistReason: e.target.value } : prev)} rows={2} className="w-full rounded-lg border border-red-200 p-2 text-sm" />
                            </FormField>
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-white bg-white p-4">
                        <h4 className="text-sm font-semibold text-gray-900">Alertes & taches automatiques</h4>
                        <div className="mt-3 space-y-3">
                          {displayBusinessTasks.length === 0 && <p className="text-sm text-gray-500">Aucune tache automatique pour le moment.</p>}
                          {displayBusinessTasks.map((task) => (
                            <div key={task.id} className={`rounded-lg border p-3 ${task.severity === 'critical' ? 'border-red-200 bg-red-50' : task.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-sky-200 bg-sky-50'}`}>
                              <p className="text-sm font-medium text-gray-900">{task.title}</p>
                              <p className="mt-1 text-sm text-gray-600">{task.detail}</p>
                              {task.dueDate ? <p className="mt-1 text-xs text-gray-500">Echeance: {formatDate(task.dueDate)}</p> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {selectedClient.category === 'locataires' && (
                      <div className="mt-4 rounded-xl border border-white bg-white p-4">
                        <h4 className="text-sm font-semibold text-gray-900">Regles locataire</h4>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <FormField label="Cycle locataire">
                            <select value={businessProfileDraft.locataireStatus || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, locataireStatus: (e.target.value || null) as ClienteleProfile['locataireStatus'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                              <option value="">Auto</option>
                              <option value="prospect">Prospect locataire</option>
                              <option value="verification">En verification</option>
                              <option value="actif">Locataire actif</option>
                              <option value="incident">En incident</option>
                              <option value="archive">Archive</option>
                              <option value="blackliste">Blackliste</option>
                            </select>
                          </FormField>
                          <FormField label="Jour echeance loyer">
                            <input type="number" min={1} max={31} value={businessProfileDraft.locJourEcheance ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, locJourEcheance: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Penalite">
                            <div className="flex gap-2">
                              <select value={businessProfileDraft.locPenaliteMode || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, locPenaliteMode: (e.target.value || null) as ClienteleProfile['locPenaliteMode'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                                <option value="">Aucune</option>
                                <option value="jour">DT / jour</option>
                                <option value="mois">% / mois</option>
                              </select>
                              <input type="number" step="0.01" value={businessProfileDraft.locPenaliteValeur ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, locPenaliteValeur: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-32 rounded-lg border border-gray-300 p-2 text-sm" />
                            </div>
                          </FormField>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {[
                            ['locCinValidee', 'CIN validee'],
                            ['locContratSigne', 'Contrat signe'],
                            ['locDepotEncaisse', 'Depot encaisse'],
                            ['locJustificatifRevenus', 'Justificatif revenus'],
                            ['locAttestationTravail', 'Attestation travail'],
                            ['saisonDocumentsRecus', 'Documents identite recus'],
                            ['saisonDepotBloque', 'Depot bloque'],
                          ].map(([field, label]) => (
                            <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                              <input type="checkbox" checked={Boolean((businessProfileDraft as unknown as Record<string, unknown>)[field])} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, [field]: e.target.checked } as ClienteleProfile : prev)} />
                              {label}
                            </label>
                          ))}
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                          <FormField label="Nb personnes">
                            <input type="number" min={1} value={businessProfileDraft.locNbPersonnes ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, locNbPersonnes: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Min nuits">
                            <input type="number" min={1} value={businessProfileDraft.saisonMinNuits ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, saisonMinNuits: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Max nuits">
                            <input type="number" min={1} value={businessProfileDraft.saisonMaxNuits ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, saisonMaxNuits: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Capacite max">
                            <input type="number" min={1} value={businessProfileDraft.saisonCapaciteMax ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, saisonCapaciteMax: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                        </div>
                        <div className="mt-3 text-sm text-gray-600">
                          <p>Statut calcule: <span className="font-medium text-gray-900">{formatLocataireStatus(businessInsights.locataireStatus)}</span></p>
                          <p className="mt-1">Paiements a l'heure: {selectedClientPayments.filter((item) => item.statut === 'paye').length}/{selectedClientPayments.length || 0}</p>
                        </div>
                      </div>
                    )}

                    {selectedClient.category === 'acheteurs' && (
                      <div className="mt-4 rounded-xl border border-white bg-white p-4">
                        <h4 className="text-sm font-semibold text-gray-900">Pipeline acheteur & matching</h4>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <FormField label="Statut acheteur">
                            <select value={businessProfileDraft.acheteurStatus || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurStatus: (e.target.value || null) as ClienteleProfile['acheteurStatus'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                              <option value="">Auto</option>
                              <option value="lead_brut">Lead brut</option>
                              <option value="qualifie">Qualifie</option>
                              <option value="recherche">En recherche</option>
                              <option value="visite_planifiee">Visite planifiee</option>
                              <option value="offre_en_cours">Offre en cours</option>
                              <option value="compromis_signe">Compromis signe</option>
                              <option value="vendu">Vendu</option>
                              <option value="perdu">Perdu</option>
                            </select>
                          </FormField>
                          <FormField label="Zones souhaitees">
                            <input value={(businessProfileDraft.acheteurZones || []).join(', ')} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurZones: parseMultivalueText(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Types de bien">
                            <input value={(businessProfileDraft.acheteurTypes || []).join(', ')} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurTypes: parseMultivalueText(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Budget min">
                            <input type="number" value={businessProfileDraft.acheteurBudgetMin ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurBudgetMin: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Budget max">
                            <input type="number" value={businessProfileDraft.acheteurBudgetMax ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurBudgetMax: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Mode financement">
                            <input value={businessProfileDraft.acheteurFinancementMode || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurFinancementMode: e.target.value } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Surface min">
                            <input type="number" value={businessProfileDraft.acheteurSurfaceMin ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurSurfaceMin: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Distance plage max">
                            <input type="number" value={businessProfileDraft.acheteurDistancePlageMax ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurDistancePlageMax: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Prochaine action">
                            <div className="flex gap-2">
                              <select value={businessProfileDraft.acheteurNextAction || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurNextAction: (e.target.value || null) as ClienteleProfile['acheteurNextAction'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                                <option value="">Aucune</option>
                                <option value="rappeler">Rappeler</option>
                                <option value="envoyer_offres">Envoyer offres</option>
                                <option value="programmer_visite">Programmer visite</option>
                              </select>
                              <input type="datetime-local" value={businessProfileDraft.acheteurActionDueAt ? String(businessProfileDraft.acheteurActionDueAt).replace(' ', 'T').slice(0, 16) : ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, acheteurActionDueAt: e.target.value ? `${e.target.value}:00` : null } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                            </div>
                          </FormField>
                        </div>
                        <p className="mt-3 text-sm text-gray-600">Statut calcule: <span className="font-medium text-gray-900">{formatAcheteurStatus(businessInsights.acheteurStatus)}</span></p>
                        <div className="mt-3 space-y-2">
                          {buyerMatches.filter((item) => item.score >= 80).slice(0, 5).map((match) => (
                            <div key={match.bienId} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <p className="text-sm font-medium text-gray-900">{getBienDisplayLabel(match.bienId)}</p>
                              <p className="mt-1 text-sm text-gray-600">Matching {match.score}% {match.reasons.length ? `- ${match.reasons.join(', ')}` : ''}</p>
                            </div>
                          ))}
                          {buyerMatches.filter((item) => item.score >= 80).length === 0 && <p className="text-sm text-gray-500">Aucun bien recommande a 80% pour le moment.</p>}
                        </div>
                      </div>
                    )}

                    {selectedClient.category === 'proprietaires' && (
                      <div className="mt-4 rounded-xl border border-white bg-white p-4">
                        <h4 className="text-sm font-semibold text-gray-900">Mandat, reversements & travaux</h4>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <FormField label="Statut proprietaire">
                            <select value={businessProfileDraft.proprietaireStatus || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, proprietaireStatus: (e.target.value || null) as ClienteleProfile['proprietaireStatus'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                              <option value="">Auto</option>
                              <option value="prospect">Prospect</option>
                              <option value="mandat_location">Sous mandat locatif</option>
                              <option value="mandat_vente">Sous mandat vente</option>
                              <option value="actif">Actif</option>
                              <option value="inactif">Inactif</option>
                              <option value="blackliste">Blackliste</option>
                            </select>
                          </FormField>
                          <FormField label="Type mandat">
                            <select value={businessProfileDraft.proprietaireMandatType || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, proprietaireMandatType: (e.target.value || null) as ClienteleProfile['proprietaireMandatType'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                              <option value="">Selectionner</option>
                              <option value="gestion_locative">Gestion locative</option>
                              <option value="vente">Mandat de vente</option>
                            </select>
                          </FormField>
                          <FormField label="Periode mandat">
                            <div className="flex gap-2">
                              <input type="date" value={businessProfileDraft.proprietaireMandatStart || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, proprietaireMandatStart: e.target.value || null } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                              <input type="date" value={businessProfileDraft.proprietaireMandatEnd || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, proprietaireMandatEnd: e.target.value || null } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                            </div>
                          </FormField>
                          <FormField label="Frequence reversement">
                            <select value={businessProfileDraft.proprietaireReversementFrequence || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, proprietaireReversementFrequence: (e.target.value || null) as ClienteleProfile['proprietaireReversementFrequence'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                              <option value="">Selectionner</option>
                              <option value="mensuel">Mensuel</option>
                              <option value="trimestriel">Trimestriel</option>
                            </select>
                          </FormField>
                          <FormField label="Mode paiement">
                            <select value={businessProfileDraft.proprietaireModePaiement || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, proprietaireModePaiement: (e.target.value || null) as ClienteleProfile['proprietaireModePaiement'] } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                              <option value="">Selectionner</option>
                              <option value="virement">Virement</option>
                              <option value="especes">Cash</option>
                              <option value="cheque">Cheque</option>
                            </select>
                          </FormField>
                          <FormField label="Commission agence %">
                            <input type="number" step="0.01" value={businessProfileDraft.proprietaireCommissionPercent ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, proprietaireCommissionPercent: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Plafond travaux sans validation">
                            <input type="number" step="0.01" value={businessProfileDraft.proprietairePlafondTravaux ?? ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, proprietairePlafondTravaux: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                          <FormField label="Dernier releve envoye">
                            <input type="date" value={businessProfileDraft.proprietaireLastStatementAt || ''} onChange={(e) => setBusinessProfileDraft((prev) => prev ? { ...prev, proprietaireLastStatementAt: e.target.value || null } : prev)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
                          </FormField>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                          <MetricCard label="Loyers encaisses" value={`${businessInsights.ownerRevenue.toFixed(2)} DT`} />
                          <MetricCard label="Commission agence" value={`${businessInsights.ownerCommission.toFixed(2)} DT`} />
                          <MetricCard label="Charges / maintenance" value={`${businessInsights.ownerCharges.toFixed(2)} DT`} />
                          <MetricCard label="Net proprietaire" value={`${businessInsights.ownerNet.toFixed(2)} DT`} />
                        </div>
                        <p className="mt-3 text-sm text-gray-600">Statut calcule: <span className="font-medium text-gray-900">{formatProprietaireStatus(businessInsights.proprietaireStatus)}</span></p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">Historique contrats</h3>
                    <div className="mt-4 space-y-3">
                      {selectedClientContracts.length === 0 && <p className="text-sm text-gray-500">Aucun contrat dans le dossier.</p>}
                      {selectedClientContracts.map((contrat) => (
                        <div key={contrat.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <p className="font-medium text-gray-900">{getBienTitle(contrat.bien_id)}</p>
                          <p className="mt-1 text-sm text-gray-600">Contrat #{contrat.id} - {contrat.statut}</p>
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatDate(contrat.date_debut)} au {formatDate(contrat.date_fin)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">Historique interactions</h3>
                    <p className="mt-1 text-xs text-gray-500">Les visites du site public sont enregistrees automatiquement quand le client ouvre la fiche d'un bien.</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <select
                        value={interactionFilters.type}
                        onChange={(e) => setInteractionFilters((prev) => ({ ...prev, type: e.target.value as '' | ClientInteractionType }))}
                        className="rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-emerald-500"
                      >
                        <option value="">Tous les types</option>
                        <option value="visite">Visites</option>
                        <option value="like">Like</option>
                        <option value="partage">Partages</option>
                      </select>
                      <input
                        type="date"
                        value={interactionFilters.dateFrom}
                        onChange={(e) => setInteractionFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                        className="rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-emerald-500"
                      />
                      <input
                        type="date"
                        value={interactionFilters.dateTo}
                        onChange={(e) => setInteractionFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                        className="rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setInteractionFilters({ type: '', dateFrom: '', dateTo: '' })}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Reinitialiser
                      </button>
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedClientInteractions.length === 0 && <p className="text-sm text-gray-500">Aucune interaction enregistree.</p>}
                      {selectedClientInteractions.map((interaction) => (
                        <div key={interaction.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-gray-900">{getInteractionLabel(interaction)}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${interaction.source === 'site_public' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {interaction.source === 'site_public' ? 'Site public' : 'Admin'}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-600">
                            {formatInteractionDate(interaction.date)}
                            {interaction.type === 'visite' && interaction.heure ? ` a ${interaction.heure}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedClient && isCinViewerOpen && selectedClientDossier.cinImageUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-5xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Carte d'identite - vue complete</h3>
              <button
                type="button"
                onClick={() => setIsCinViewerOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
              <img
                src={selectedClientDossier.cinImageUrl}
                alt="Carte d'identite complete"
                className="mx-auto h-auto max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {isClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{clientModalMode === 'edit' ? 'Modifier client' : 'Nouveau client'}</h2>
                <p className="text-sm text-gray-500">Nom, prenom, telephone, CIN et dossier historique.</p>
              </div>
              <button type="button" onClick={closeClientModal} className="rounded-lg p-2 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2">
              <FormField label="Categorie">
                <select
                  value={clientForm.category}
                  onChange={(e) => setClientForm((prev) => ({ ...prev, category: e.target.value as ClientCategory }))}
                  disabled={clientModalMode === 'edit'}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm disabled:bg-gray-50"
                >
                  <option value="locataires">Locataires</option>
                  <option value="acheteurs">Acheteurs</option>
                  <option value="proprietaires">Proprietaires</option>
                </select>
              </FormField>
              <FormField label="Nom *">
                <input value={clientForm.nom} onChange={(e) => setClientForm((prev) => ({ ...prev, nom: e.target.value }))} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              </FormField>
              <FormField label="Prenom *">
                <input value={clientForm.prenom} onChange={(e) => setClientForm((prev) => ({ ...prev, prenom: e.target.value }))} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              </FormField>
              <FormField label="Telephone *">
                <input value={clientForm.telephone} onChange={(e) => setClientForm((prev) => ({ ...prev, telephone: e.target.value }))} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              </FormField>
              <FormField label="Email">
                <input value={clientForm.email} onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              </FormField>
              <FormField label="Autres telephones">
                <textarea
                  value={clientForm.extraPhones}
                  onChange={(e) => setClientForm((prev) => ({ ...prev, extraPhones: e.target.value }))}
                  placeholder={"Un numero par ligne ou separe par virgule"}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                />
              </FormField>
              <FormField label="Autres emails">
                <textarea
                  value={clientForm.extraEmails}
                  onChange={(e) => setClientForm((prev) => ({ ...prev, extraEmails: e.target.value }))}
                  placeholder={"Un email par ligne ou separe par virgule"}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                />
              </FormField>
              <FormField label="Carte d'identite *">
                <input value={clientForm.cin} onChange={(e) => setClientForm((prev) => ({ ...prev, cin: e.target.value }))} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              </FormField>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button type="button" onClick={closeClientModal} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">Annuler</button>
              <button type="button" onClick={() => void handleSaveClient()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">{clientModalMode === 'edit' ? 'Enregistrer' : 'Creer client'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
    >
      {label}
    </button>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-emerald-600">{icon}</span>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm text-gray-700">{value}</p>
      </div>
    </div>
  );
}

function InfoListRow({ icon, label, values, emptyLabel }: { icon: ReactNode; label: string; values: string[]; emptyLabel: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-emerald-600">{icon}</span>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
        {values.length === 0 ? (
          <p className="text-sm text-gray-700">{emptyLabel}</p>
        ) : (
          <div className="space-y-1">
            {values.map((value) => <p key={value} className="text-sm text-gray-700">{value}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
