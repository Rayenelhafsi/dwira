import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, History, MessageSquareShare, RefreshCw } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import AvailabilityCalendar from '../../components/AvailabilityCalendar';
import type { DateStatus, Notification, Proprietaire, ReservationDemand, ReservationDemandHistory, ReservationDemandStatus } from '../types';
import { getServiceDisplayPrice } from '../../utils/servicePayants';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type CalendarPromptSchedule = {
  enabled: boolean;
  startDate: string | null;
  dailyTime: string;
  dispatchHour: number;
  dispatchMinute: number;
  timezoneOffsetLabel: string;
  lastDispatchedLocalDate?: string | null;
};

type OwnerCalendarPromptStatus = {
  promptId: string;
  ownerId: string;
  ownerName: string;
  promptDate?: string | null;
  status: string;
  notificationId?: string | null;
  respondedAt?: string | null;
  responseMetadata?: {
    response?: string | null;
    bienId?: string | null;
    propertyTitle?: string | null;
    respondedAt?: string | null;
  } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AdminCalendarRequest = {
  id: string;
  ownerId: string;
  ownerName: string;
  bienId: string;
  propertyTitle: string;
  startDate: string;
  endDate: string;
  note?: string | null;
  status: string;
  requestType: 'open' | 'close';
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  decision?: string | null;
  reason?: string | null;
};

type CalendarDiffPayload = {
  interactionId: string;
  ownerId: string;
  ownerName: string;
  bienId: string;
  propertyTitle: string;
  startDate: string;
  endDate: string;
  requestType: 'open' | 'close';
  status: string;
  note?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  currentCalendar: DateStatus[];
  projectedCalendar: DateStatus[];
};

const openStatuses = new Set<ReservationDemandStatus>([
  'en_attente_reponse_proprietaire',
  'pas_de_reponse_proprietaire',
  'reponse_positive_attente_confirmation_client',
  'client_procede_vers_paiement_en_cours',
  'reponse_negative_autre_proposition_meme_bien',
  'reponse_negative_autre_proposition_bien_similaire',
  'attente_validation_amicale',
  'attente_validation_par_agence',
  'voucher_en_cours',
  'rejete_par_amicale',
  'rejete_par_agence',
  'demande_recu_paiement',
  'recu_paiement_envoye',
]);

const demandPriority: Record<ReservationDemandStatus, number> = {
  demande_annulee_client: 0,
  demande_annulee_echeance_contrat: 0,
  reponse_positive_attente_confirmation_client: 1,
  client_procede_vers_paiement_en_cours: 2,
  en_attente_reponse_proprietaire: 3,
  pas_de_reponse_proprietaire: 4,
  reponse_negative_autre_proposition_meme_bien: 5,
  reponse_negative_autre_proposition_bien_similaire: 6,
  attente_validation_amicale: 7,
  attente_validation_par_agence: 8,
  voucher_en_cours: 9,
  rejete_par_amicale: 10,
  rejete_par_agence: 11,
  demande_recu_paiement: 12,
  recu_paiement_envoye: 13,
  demande_rejetee_admin: 14,
  attente_envoi_coordonnees_contrat: 15,
  contrat_realise: 16,
  succes_paiement: 17,
};

function resolveDisplayStatus(demand: ReservationDemand): ReservationDemandStatus {
  const adminNote = String(demand.admin_note || '').toLowerCase();
  const clientNote = String(demand.client_note || '').toLowerCase();
  const mergedNote = `${adminNote} ${clientNote}`;
  if (
    mergedNote.includes('echeance') ||
    mergedNote.includes('échéance') ||
    mergedNote.includes('deadline') ||
    mergedNote.includes('expire') ||
    mergedNote.includes('expir')
  ) {
    return 'demande_annulee_echeance_contrat';
  }
  const note = String(demand.client_note || '').toLowerCase();
  if (note.includes('annulee par le client') || note.includes('annulée par le client')) {
    return 'demande_annulee_client';
  }
  return demand.status;
}

function isAmicaleDemand(demand: ReservationDemand) {
  return String(demand.payment_mode || '').trim() === 'amicale' || Boolean(String(demand.pricing_amicale_id || '').trim());
}

const statusLabels: Record<ReservationDemandStatus, string> = {
  en_attente_reponse_proprietaire: 'En attente de reponse proprietaire',
  pas_de_reponse_proprietaire: 'Pas de reponse proprietaire',
  reponse_positive_attente_confirmation_client: 'Reponse positive, attente confirmation client',
  client_procede_vers_paiement_en_cours: 'Confirme, attente de paiement',
  reponse_negative_autre_proposition_meme_bien: 'Reponse negative, autre proposition pour ce bien',
  reponse_negative_autre_proposition_bien_similaire: 'Reponse negative, autre proposition pour un bien similaire',
  attente_validation_amicale: 'Attente validation amicale',
  attente_validation_par_agence: 'Attente validation par l agence',
  voucher_en_cours: 'Voucher en cours',
  rejete_par_amicale: 'Rejete par l amicale',
  rejete_par_agence: 'Rejete par l agence',
  demande_rejetee_admin: 'Demande rejetee par admin',
  demande_annulee_client: 'Demande annulee par client',
  demande_annulee_echeance_contrat: 'Demande annulee par echeance contrat',
  attente_envoi_coordonnees_contrat: 'Attente d envoi de coordonnees pour contrat',
  demande_recu_paiement: 'Demande de recu de paiement',
  recu_paiement_envoye: 'Recu de paiement envoye',
  contrat_realise: 'Contrat realise',
  succes_paiement: 'Succes paiement',
};
const statusToneClasses: Record<ReservationDemandStatus, string> = {
  en_attente_reponse_proprietaire: 'bg-sky-100 text-sky-800 border-sky-200',
  pas_de_reponse_proprietaire: 'bg-orange-100 text-orange-800 border-orange-200',
  reponse_positive_attente_confirmation_client: 'bg-amber-100 text-amber-800 border-amber-200',
  client_procede_vers_paiement_en_cours: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  reponse_negative_autre_proposition_meme_bien: 'bg-violet-100 text-violet-800 border-violet-200',
  reponse_negative_autre_proposition_bien_similaire: 'bg-violet-100 text-violet-800 border-violet-200',
  attente_validation_amicale: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  attente_validation_par_agence: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  voucher_en_cours: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  rejete_par_amicale: 'bg-slate-100 text-slate-700 border-slate-200',
  rejete_par_agence: 'bg-rose-100 text-rose-800 border-rose-200',
  demande_rejetee_admin: 'bg-rose-100 text-rose-800 border-rose-200',
  demande_annulee_client: 'bg-slate-100 text-slate-800 border-slate-200',
  demande_annulee_echeance_contrat: 'bg-slate-100 text-slate-800 border-slate-200',
  attente_envoi_coordonnees_contrat: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  demande_recu_paiement: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  recu_paiement_envoye: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  contrat_realise: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  succes_paiement: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};
const editableStatusOptions: ReservationDemandStatus[] = [
  'en_attente_reponse_proprietaire',
  'pas_de_reponse_proprietaire',
  'reponse_positive_attente_confirmation_client',
  'reponse_negative_autre_proposition_meme_bien',
  'reponse_negative_autre_proposition_bien_similaire',
  'recu_paiement_envoye',
  'succes_paiement',
];

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

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return value;
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}
function formatStayDate(value?: string | null) {
  if (!value) return '-';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function parseDateForRelative(value?: string | null) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRelativeDelay(value?: string | null, suffix = '') {
  const parsed = parseDateForRelative(value);
  if (!parsed) return '';
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return '';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return `il y a quelques secondes${suffix}`;
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} heure${hours > 1 ? 's' : ''}${suffix}`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} jour${days > 1 ? 's' : ''}${suffix}`;
}

function resolveAssetUrl(url?: string | null) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${window.location.origin}${value.startsWith('/') ? value : `/${value}`}`;
}

function appendCacheBuster(url: string, version?: string | null) {
  const value = String(url || '').trim();
  if (!value) return '';
  const token = String(version || '').trim();
  if (!token) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    parsed.searchParams.set('v', token);
    return parsed.toString();
  } catch {
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}v=${encodeURIComponent(token)}`;
  }
}

function getOwnerCalendarStatusMeta(status?: OwnerCalendarPromptStatus | null) {
  const value = String(status?.status || '').trim();
  const sentAt = value === 'pending'
    ? status?.updatedAt || status?.createdAt || null
    : status?.createdAt || status?.updatedAt || null;
  if (value === 'pending') {
    return {
      label: 'En attente',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      detail: sentAt ? `Envoyee le ${formatDateTime(sentAt)} (UTC+01:00)` : (status?.promptDate ? `Relance du ${formatStayDate(status.promptDate)}` : 'Relance envoyee'),
      helper: sentAt ? formatRelativeDelay(sentAt, ' sans reponse') : 'Sans reponse',
      sentAt,
      respondedAt: null,
    };
  }
  if (value === 'confirmed_up_to_date') {
    const answeredAt = status?.respondedAt || status?.responseMetadata?.respondedAt || null;
    return {
      label: 'A jour',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      detail: sentAt ? `Envoyee le ${formatDateTime(sentAt)} (UTC+01:00)` : 'Calendrier confirme a jour',
      helper: answeredAt ? `Repondu ${formatRelativeDelay(answeredAt).replace(/^il y a /, 'il y a ')}` : 'Calendrier confirme a jour',
      sentAt,
      respondedAt: answeredAt,
    };
  }
  if (value === 'update_requested') {
    const answeredAt = status?.respondedAt || status?.responseMetadata?.respondedAt || null;
    const propertyTitle = String(status?.responseMetadata?.propertyTitle || '').trim();
    return {
      label: 'Mise a jour demandee',
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
      detail: sentAt ? `Envoyee le ${formatDateTime(sentAt)} (UTC+01:00)` : 'Ouverture calendrier demandee',
      helper: propertyTitle ? `Bien: ${propertyTitle}` : 'Ouverture calendrier demandee',
      sentAt,
      respondedAt: answeredAt,
    };
  }
  return {
    label: 'Aucune reponse',
    tone: 'border-gray-200 bg-gray-50 text-gray-600',
    detail: 'Aucune relance recente',
    helper: '',
    sentAt: null,
    respondedAt: null,
  };
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [demands, setDemands] = useState<ReservationDemand[]>([]);
  const [historyRows, setHistoryRows] = useState<ReservationDemandHistory[]>([]);
  const [historyDemandId, setHistoryDemandId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'demands' | 'chat' | 'calendars'>('demands');
  const [demandTab, setDemandTab] = useState<'pending' | 'finished_success' | 'finished_cancelled'>('pending');
  const [cancelledSubTab, setCancelledSubTab] = useState<'client' | 'echeance'>('client');
  const [selectedChatOwner, setSelectedChatOwner] = useState<{ id: string; name: string; demandId?: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; text: string; kind?: string; createdAt?: string }>>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [owners, setOwners] = useState<Proprietaire[]>([]);
  const [calendarPromptSchedule, setCalendarPromptSchedule] = useState<CalendarPromptSchedule | null>(null);
  const [ownerCalendarStatuses, setOwnerCalendarStatuses] = useState<Record<string, OwnerCalendarPromptStatus>>({});
  const [pendingCalendarRequests, setPendingCalendarRequests] = useState<AdminCalendarRequest[]>([]);
  const [calendarRequestHistory, setCalendarRequestHistory] = useState<AdminCalendarRequest[]>([]);
  const [calendarReviewRequest, setCalendarReviewRequest] = useState<AdminCalendarRequest | null>(null);
  const [calendarReviewDiff, setCalendarReviewDiff] = useState<CalendarDiffPayload | null>(null);
  const [calendarReviewLoading, setCalendarReviewLoading] = useState(false);
  const [calendarActionLoadingId, setCalendarActionLoadingId] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [dispatchingCalendarPrompt, setDispatchingCalendarPrompt] = useState(false);
  const [dispatchingCalendarPromptOwnerId, setDispatchingCalendarPromptOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [generatingContractDemandId, setGeneratingContractDemandId] = useState<string | null>(null);
  const [sendingContractDemandId, setSendingContractDemandId] = useState<string | null>(null);
  const [serviceQuoteDrafts, setServiceQuoteDrafts] = useState<Record<string, Record<string, number>>>({});
  const [expandedDemandIds, setExpandedDemandIds] = useState<Record<string, boolean>>({});
  const hasLoadedOnceRef = useRef(false);
  const isFetchingRef = useRef(false);
  const isChatFetchingRef = useRef<string | null>(null);

  const fetchData = useCallback(async (options?: { background?: boolean }) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    const shouldShowBlockingLoader = !hasLoadedOnceRef.current && !options?.background;
    if (shouldShowBlockingLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const [
        notificationsResponse,
        demandsResponse,
        ownersResponse,
        calendarPromptScheduleResponse,
        ownerCalendarStatusesResponse,
        pendingCalendarRequestsResponse,
        calendarRequestHistoryResponse,
      ] = await Promise.all([
        fetch(`${API_URL}/notifications`, { credentials: 'include' }),
        fetch(`${API_URL}/reservation-demands`, { credentials: 'include' }),
        fetch(`${API_URL}/proprietaires`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/calendar-prompt-schedule`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/owner-calendar-prompt-statuses`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/calendar-requests?statuses=pending`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/calendar-requests?statuses=approved,rejected`, { credentials: 'include' }),
      ]);
      if (!notificationsResponse.ok) throw new Error(await getApiErrorMessage(notificationsResponse, 'Impossible de charger les notifications'));
      if (!demandsResponse.ok) throw new Error(await getApiErrorMessage(demandsResponse, 'Impossible de charger les demandes'));
      if (!ownersResponse.ok) throw new Error(await getApiErrorMessage(ownersResponse, 'Impossible de charger les proprietaires'));
      if (!calendarPromptScheduleResponse.ok) throw new Error(await getApiErrorMessage(calendarPromptScheduleResponse, 'Impossible de charger la programmation calendrier'));
      if (!ownerCalendarStatusesResponse.ok) throw new Error(await getApiErrorMessage(ownerCalendarStatusesResponse, 'Impossible de charger les etats calendrier proprietaires'));
      if (!pendingCalendarRequestsResponse.ok) throw new Error(await getApiErrorMessage(pendingCalendarRequestsResponse, 'Impossible de charger les demandes calendrier en attente'));
      if (!calendarRequestHistoryResponse.ok) throw new Error(await getApiErrorMessage(calendarRequestHistoryResponse, 'Impossible de charger l historique calendrier'));
      const notificationRows = await notificationsResponse.json();
      const demandRows = await demandsResponse.json();
      const ownerRows = await ownersResponse.json();
      const scheduleRow = await calendarPromptScheduleResponse.json();
      const ownerCalendarStatusRows = await ownerCalendarStatusesResponse.json();
      const pendingCalendarRows = await pendingCalendarRequestsResponse.json();
      const historyCalendarRows = await calendarRequestHistoryResponse.json();
      const mappedOwnerStatuses = Array.isArray(ownerCalendarStatusRows)
        ? ownerCalendarStatusRows.reduce<Record<string, OwnerCalendarPromptStatus>>((acc, row) => {
            const ownerId = String(row?.ownerId || '').trim();
            if (ownerId) acc[ownerId] = row as OwnerCalendarPromptStatus;
            return acc;
          }, {})
        : {};
      setNotifications(Array.isArray(notificationRows) ? notificationRows : []);
      setDemands(Array.isArray(demandRows) ? demandRows : []);
      setOwners(Array.isArray(ownerRows) ? ownerRows : []);
      setCalendarPromptSchedule(scheduleRow || null);
      setOwnerCalendarStatuses(mappedOwnerStatuses);
      setPendingCalendarRequests(Array.isArray(pendingCalendarRows) ? pendingCalendarRows : []);
      setCalendarRequestHistory(Array.isArray(historyCalendarRows) ? historyCalendarRows : []);
      hasLoadedOnceRef.current = true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (activeView === 'chat' && selectedChatOwner?.id) return;
      void fetchData({ background: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [fetchData, activeView, selectedChatOwner?.id]);

  const pendingDemands = useMemo(() => {
    return demands
      .filter((demand) => openStatuses.has(demand.status))
      .filter((demand) => !isAmicaleDemand(demand))
      .sort((a, b) => {
        const updatedA = new Date(String(a.updated_at || a.created_at || '')).getTime();
        const updatedB = new Date(String(b.updated_at || b.created_at || '')).getTime();
        if (updatedA !== updatedB) return updatedB - updatedA;
        const createdA = new Date(String(a.created_at || '')).getTime();
        const createdB = new Date(String(b.created_at || '')).getTime();
        if (createdA !== createdB) return createdB - createdA;
        const sa = resolveDisplayStatus(a);
        const sb = resolveDisplayStatus(b);
        const pa = demandPriority[sa] ?? 99;
        const pb = demandPriority[sb] ?? 99;
        return pa - pb;
      });
  }, [demands]);
  const finishedSuccessDemands = useMemo(
    () =>
      demands
        .filter((demand) => !isAmicaleDemand(demand))
        .filter((demand) => resolveDisplayStatus(demand) === 'succes_paiement')
        .sort((a, b) => new Date(String(b.updated_at || b.created_at || '')).getTime() - new Date(String(a.updated_at || a.created_at || '')).getTime()),
    [demands]
  );
  const cancelledByClientDemands = useMemo(
    () =>
      demands
        .filter((demand) => !isAmicaleDemand(demand))
        .filter((demand) => resolveDisplayStatus(demand) === 'demande_annulee_client')
        .sort((a, b) => new Date(String(b.updated_at || b.created_at || '')).getTime() - new Date(String(a.updated_at || a.created_at || '')).getTime()),
    [demands]
  );
  const cancelledByDeadlineDemands = useMemo(
    () =>
      demands
        .filter((demand) => !isAmicaleDemand(demand))
        .filter((demand) => resolveDisplayStatus(demand) === 'demande_annulee_echeance_contrat')
        .sort((a, b) => new Date(String(b.updated_at || b.created_at || '')).getTime() - new Date(String(a.updated_at || a.created_at || '')).getTime()),
    [demands]
  );
  const visibleDemands = useMemo(() => {
    if (demandTab === 'finished_success') return finishedSuccessDemands;
    if (demandTab === 'finished_cancelled') {
      return cancelledSubTab === 'client' ? cancelledByClientDemands : cancelledByDeadlineDemands;
    }
    return pendingDemands;
  }, [demandTab, cancelledSubTab, pendingDemands, finishedSuccessDemands, cancelledByClientDemands, cancelledByDeadlineDemands]);
  const unreadNotificationsCount = useMemo(
    () => notifications.filter((item) => !item.lu).length,
    [notifications]
  );
  const demandCounters = useMemo(() => {
    const awaitingOwner = pendingDemands.filter((d) => resolveDisplayStatus(d) === 'en_attente_reponse_proprietaire').length;
    const awaitingClient = pendingDemands.filter((d) => resolveDisplayStatus(d) === 'reponse_positive_attente_confirmation_client').length;
    const paymentFlow = pendingDemands.filter((d) => {
      const s = resolveDisplayStatus(d);
      return s === 'demande_recu_paiement' || s === 'recu_paiement_envoye';
    }).length;
    return { awaitingOwner, awaitingClient, paymentFlow };
  }, [pendingDemands]);

  const chatOwners = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; demandId?: string }>();
    owners.forEach((owner) => {
      const ownerId = String(owner.id || '').trim();
      if (!ownerId) return;
      byId.set(ownerId, {
        id: ownerId,
        name: String(owner.nom || ownerId),
      });
    });
    demands.forEach((demand) => {
      if (isAmicaleDemand(demand)) return;
      const ownerId = String(demand.proprietaire_id || '').trim();
      if (!ownerId) return;
      if (!byId.has(ownerId)) {
        byId.set(ownerId, {
          id: ownerId,
          name: String(demand.proprietaire_nom || ownerId),
          demandId: demand.id,
        });
      }
    });
    return Array.from(byId.values());
  }, [demands, owners]);

  const calendarOwners = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    owners.forEach((owner) => {
      const ownerId = String(owner.id || '').trim();
      if (!ownerId) return;
      byId.set(ownerId, {
        id: ownerId,
        name: String(owner.nom || ownerId).trim() || ownerId,
      });
    });
    Object.values(ownerCalendarStatuses).forEach((status) => {
      const ownerId = String(status.ownerId || '').trim();
      if (!ownerId || byId.has(ownerId)) return;
      byId.set(ownerId, {
        id: ownerId,
        name: String(status.ownerName || ownerId).trim() || ownerId,
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [owners, ownerCalendarStatuses]);

  const pendingCalendarRequestByOwner = useMemo(() => {
    const byOwner = new Map<string, AdminCalendarRequest>();
    for (const request of pendingCalendarRequests) {
      const ownerId = String(request.ownerId || '').trim();
      if (!ownerId || byOwner.has(ownerId)) continue;
      byOwner.set(ownerId, request);
    }
    return byOwner;
  }, [pendingCalendarRequests]);

  const loadOwnerChat = useCallback(async (ownerId: string, options?: { background?: boolean }) => {
    const normalizedOwnerId = String(ownerId || '').trim();
    if (!normalizedOwnerId) return;
    if (isChatFetchingRef.current === normalizedOwnerId) return;
    isChatFetchingRef.current = normalizedOwnerId;
    if (!options?.background) {
      setChatLoading(true);
    }
    try {
      const response = await fetch(`${API_URL}/mobile/owners/${encodeURIComponent(normalizedOwnerId)}/chat`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Impossible de charger le chat proprietaire'));
      const rows = await response.json();
      const mapped = (Array.isArray(rows) ? rows : []).map((row: any) => ({
        id: String(row.id || ''),
        text: String(row.text || ''),
        kind: String(row.kind || ''),
        createdAt: String(row.createdAt || ''),
      }));
      setChatMessages(mapped);
    } catch (error) {
      if (!options?.background) {
        toast.error(error instanceof Error ? error.message : 'Impossible de charger le chat proprietaire');
        setChatMessages([]);
      }
    } finally {
      if (!options?.background) {
        setChatLoading(false);
      }
      if (isChatFetchingRef.current === normalizedOwnerId) {
        isChatFetchingRef.current = null;
      }
    }
  }, []);

  const openOwnerChat = useCallback((demand: ReservationDemand) => {
    const ownerId = String(demand.proprietaire_id || '').trim();
    if (!ownerId) {
      toast.error('Cette demande ne contient pas d identifiant proprietaire');
      return;
    }
    const owner = {
      id: ownerId,
      name: String(demand.proprietaire_nom || ownerId),
      demandId: demand.id,
    };
    if (selectedChatOwner?.id === owner.id && activeView === 'chat') {
      return;
    }
    setSelectedChatOwner(owner);
    setChatDraft('');
    setActiveView('chat');
    void loadOwnerChat(owner.id);
  }, [loadOwnerChat, activeView, selectedChatOwner?.id]);

  useEffect(() => {
    if (activeView !== 'chat' || !selectedChatOwner?.id) return;
    const intervalId = window.setInterval(() => {
      void loadOwnerChat(selectedChatOwner.id, { background: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [activeView, selectedChatOwner?.id, loadOwnerChat]);

  const sendChatMessage = async () => {
    if (!selectedChatOwner) return;
    const text = chatDraft.trim();
    if (!text) return;
    setChatSending(true);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/owners/${encodeURIComponent(selectedChatOwner.id)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Envoi message proprietaire impossible'));
      setChatDraft('');
      await loadOwnerChat(selectedChatOwner.id);
      if (selectedChatOwner.demandId) {
        const demand = demands.find((item) => item.id === selectedChatOwner.demandId);
        if (demand) {
          await handleDemandUpdate(demand, {
            communicateToOwner: true,
            history_note: 'Communication envoyee au proprietaire via chat',
          });
        }
      }
      toast.success('Message envoye au proprietaire');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi message proprietaire impossible');
    } finally {
      setChatSending(false);
    }
  };

  const requestOwnerAvailability = async (demand: ReservationDemand) => {
    setSavingId(demand.id);
    try {
      const response = await fetch(
        `${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/request-owner-availability`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Envoi demande disponibilite impossible'));
      }
      const updated = await response.json();
      if (updated?.id) {
        setDemands((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      }
      toast.success(updated?.pushSkipped ? 'Demande deja envoyee. Reponse proprietaire en attente.' : 'Demande de disponibilite envoyee au proprietaire');
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi demande disponibilite impossible');
    } finally {
      setSavingId(null);
    }
  };

  const saveCalendarPromptSchedule = async () => {
    if (!calendarPromptSchedule) return;
    setScheduleSaving(true);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-prompt-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: calendarPromptSchedule.enabled,
          startDate: calendarPromptSchedule.startDate,
          dispatchHour: calendarPromptSchedule.dispatchHour,
          dispatchMinute: calendarPromptSchedule.dispatchMinute,
        }),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Impossible de sauvegarder la programmation calendrier'));
      }
      const next = await response.json();
      setCalendarPromptSchedule(next);
      toast.success('Programmation calendrier enregistree');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de sauvegarder la programmation calendrier');
    } finally {
      setScheduleSaving(false);
    }
  };

  const dispatchCalendarPromptNow = async () => {
    setDispatchingCalendarPrompt(true);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-prompt-schedule/dispatch-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Impossible d envoyer la relance calendrier'));
      }
      const result = await response.json();
      toast.success(`Relance calendrier envoyee (${result.sentOwners ?? 0}/${result.totalOwners ?? 0})`);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d envoyer la relance calendrier');
    } finally {
      setDispatchingCalendarPrompt(false);
    }
  };

  const dispatchCalendarPromptToOwner = async (owner: { id: string; name: string }) => {
    const ownerId = String(owner.id || '').trim();
    if (!ownerId) return;
    setDispatchingCalendarPromptOwnerId(ownerId);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-prompt-schedule/dispatch-owner/${encodeURIComponent(ownerId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Impossible d envoyer la relance calendrier a ce proprietaire'));
      }
      const result = await response.json();
      toast.success(`Relance calendrier envoyee a ${result.ownerName || owner.name}`);
      await fetchData({ background: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d envoyer la relance calendrier a ce proprietaire');
    } finally {
      setDispatchingCalendarPromptOwnerId(null);
    }
  };

  const openCalendarDiff = async (request: AdminCalendarRequest) => {
    setCalendarReviewRequest(request);
    setCalendarReviewDiff(null);
    setCalendarReviewLoading(true);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-requests/${encodeURIComponent(request.id)}/diff`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Impossible de charger la difference calendrier'));
      }
      const payload = await response.json();
      setCalendarReviewDiff(payload || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger la difference calendrier');
      setCalendarReviewRequest(null);
    } finally {
      setCalendarReviewLoading(false);
    }
  };

  const approveCalendarRequest = async (request: AdminCalendarRequest) => {
    setCalendarActionLoadingId(request.id);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-requests/${encodeURIComponent(request.id)}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Approbation calendrier impossible'));
      }
      toast.success('Mise a jour calendrier approuvee');
      setCalendarReviewRequest(null);
      setCalendarReviewDiff(null);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Approbation calendrier impossible');
    } finally {
      setCalendarActionLoadingId(null);
    }
  };

  const rejectCalendarRequest = async (request: AdminCalendarRequest) => {
    const reason = window.prompt('Raison du rejet (optionnel) :', '') ?? '';
    setCalendarActionLoadingId(request.id);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-requests/${encodeURIComponent(request.id)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Rejet calendrier impossible'));
      }
      toast.success('Mise a jour calendrier rejetee');
      setCalendarReviewRequest(null);
      setCalendarReviewDiff(null);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rejet calendrier impossible');
    } finally {
      setCalendarActionLoadingId(null);
    }
  };

  const handleDemandUpdate = async (
    demand: ReservationDemand,
    patch: Partial<ReservationDemand> & {
      communicateToOwner?: boolean;
      history_note?: string;
      notifyClientOnRejection?: boolean;
    }
  ) => {
    setSavingId(demand.id);
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...patch,
          actor_type: 'admin',
          actor_id: 'admin',
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Mise a jour demande impossible'));
      const updated = await response.json();
      setDemands((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      toast.success('Demande mise a jour');
      if (historyDemandId === demand.id) {
        void openHistory(demand.id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Mise a jour demande impossible');
    } finally {
      setSavingId(null);
    }
  };

  const rejectDemand = async (demand: ReservationDemand, notifyClient: boolean) => {
    const defaultNote = "Votre demande a ete rejetee par l'administration.";
    await handleDemandUpdate(demand, {
      status: 'demande_rejetee_admin',
      notifyClientOnRejection: notifyClient,
      client_note: notifyClient ? defaultNote : null,
      history_note: notifyClient
        ? 'Demande rejetee par admin et popup client demandee'
        : 'Demande rejetee par admin',
    });
  };

  const openHistory = async (demandId: string) => {
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demandId)}/history`, { credentials: 'include' });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Impossible de charger l historique'));
      
      const rows = await response.json();
      setHistoryRows(Array.isArray(rows) ? rows : []);
      setHistoryDemandId(demandId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger l historique');
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`${API_URL}/notifications/${encodeURIComponent(notificationId)}/lu`, { method: 'PUT', credentials: 'include' });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Impossible de marquer la notification comme lue'));
      setNotifications((prev) => prev.map((item) => item.id === notificationId ? { ...item, lu: true } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de marquer la notification comme lue');
    }
  };

  const getVariableServiceDrafts = (demand: ReservationDemand) => {
    const existing = serviceQuoteDrafts[demand.id];
    if (existing) return existing;
    const base: Record<string, number> = {};
    (demand.variable_services_quote || demand.selected_variable_services || []).forEach((service) => {
      base[String(service.id)] = Number((service as any).prix_saisi ?? service.prix ?? 0);
    });
    return base;
  };

  const saveVariableServicesQuote = async (demand: ReservationDemand) => {
    const sourceServices = demand.selected_variable_services || [];
    const drafts = getVariableServiceDrafts(demand);
    const quoteRows = sourceServices.map((service) => ({
      ...service,
      prix_saisi: Math.max(0, Number(drafts[String(service.id)] || 0)),
    }));
    const quoteTotal = quoteRows.reduce((sum, service) => sum + Number(service.prix_saisi || 0), 0);
    await handleDemandUpdate(demand, {
      variable_services_quote: quoteRows,
      variable_services_quote_total: quoteTotal,
      variable_services_quote_status: quoteRows.length > 0 ? 'devis_envoye' : 'aucun',
      history_note: quoteRows.length > 0 ? `Devis services envoye (${quoteTotal} TND)` : 'Aucun devis services a envoyer',
    });
  };

  const generateContractForDemand = async (demand: ReservationDemand) => {
    const contractId = String(demand.contract_id || '').trim();
    if (!contractId) {
      toast.error('Aucun contrat associe a cette demande');
      return;
    }
    setGeneratingContractDemandId(demand.id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contractId)}/regenerate-template-pdf`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Generation contrat impossible'));
      toast.success('Contrat regenere');
      await fetchData({ background: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation contrat impossible');
    } finally {
      setGeneratingContractDemandId(null);
    }
  };

  const viewContractForDemand = async (demand: ReservationDemand) => {
    const contractId = String(demand.contract_id || '').trim();
    if (!contractId) {
      toast.error('Aucun contrat associe a cette demande');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contractId)}`, { credentials: 'include' });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Ouverture contrat impossible'));
      const contract = await response.json();
      const url = resolveAssetUrl(String(contract?.url_pdf || '').trim());
      if (!url) throw new Error('PDF contrat indisponible');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ouverture contrat impossible');
    }
  };

  const sendContractToClient = async (demand: ReservationDemand) => {
    const contractId = String(demand.contract_id || '').trim();
    if (!contractId) {
      toast.error('Aucun contrat associe a cette demande');
      return;
    }
    setSendingContractDemandId(demand.id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contractId)}/send-to-client`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Envoi contrat impossible'));
      toast.success('Version admin envoyee au client');
      await fetchData({ background: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi contrat impossible');
    } finally {
      setSendingContractDemandId(null);
    }
  };
  const toggleDemandExpanded = (demandId: string) => {
    setExpandedDemandIds((prev) => ({ ...prev, [demandId]: !prev[demandId] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">Demandes de reservation, alertes admin et suivi de progression.</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchData({ background: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Rechargement...' : 'Recharger'}
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Demandes en attente</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{pendingDemands.length}</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Attente proprietaire</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{demandCounters.awaitingOwner}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Attente client</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{demandCounters.awaitingClient}</p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Notifications non lues</p>
          <p className="mt-1 text-2xl font-bold text-violet-900">{unreadNotificationsCount}</p>
        </div>
      </section>

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveView('demands')}
          className={`rounded-md px-3 py-2 text-sm font-medium ${activeView === 'demands' ? 'bg-emerald-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          Demandes
        </button>
        <button
          type="button"
          onClick={() => setActiveView('chat')}
          className={`rounded-md px-3 py-2 text-sm font-medium ${activeView === 'chat' ? 'bg-emerald-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          Chat proprietaires
        </button>
        <button
          type="button"
          onClick={() => setActiveView('calendars')}
          className={`rounded-md px-3 py-2 text-sm font-medium ${activeView === 'calendars' ? 'bg-emerald-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          Calendriers
        </button>
      </div>

      {activeView === 'demands' && (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-gray-900">Demandes</h2>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDemandTab('pending')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${demandTab === 'pending' ? 'bg-emerald-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            En attente ({pendingDemands.length})
          </button>
          <button
            type="button"
            onClick={() => setDemandTab('finished_success')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${demandTab === 'finished_success' ? 'bg-emerald-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            Demandes finies succes ({finishedSuccessDemands.length})
          </button>
          <button
            type="button"
            onClick={() => setDemandTab('finished_cancelled')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${demandTab === 'finished_cancelled' ? 'bg-emerald-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            Demandes finies annulees ({cancelledByClientDemands.length + cancelledByDeadlineDemands.length})
          </button>
        </div>
        {demandTab === 'finished_cancelled' && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCancelledSubTab('client')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${cancelledSubTab === 'client' ? 'bg-slate-700 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              Annulees par client ({cancelledByClientDemands.length})
            </button>
            <button
              type="button"
              onClick={() => setCancelledSubTab('echeance')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${cancelledSubTab === 'echeance' ? 'bg-slate-700 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              Annulees par echeance ({cancelledByDeadlineDemands.length})
            </button>
          </div>
        )}
        <div className="space-y-3">
          {visibleDemands.length === 0 && <p className="text-sm text-gray-500">Aucune demande dans cet onglet.</p>}
          {visibleDemands.map((demand) => {
            const displayStatus = resolveDisplayStatus(demand);
            const statusSelectOptions = editableStatusOptions.includes(displayStatus)
              ? editableStatusOptions
              : [displayStatus, ...editableStatusOptions];
            const isExpanded = Boolean(expandedDemandIds[demand.id]);
            const receiptUrl = demand.payment_receipt_image_url ? resolveAssetUrl(demand.payment_receipt_image_url) : '';
            const hasReceipt = Boolean(receiptUrl);
            const cinPhotoUrlBase = demand.identity_document_image_url ? resolveAssetUrl(demand.identity_document_image_url) : '';
            const cinPhotoUrl = cinPhotoUrlBase && /\/chatbot-media\//i.test(cinPhotoUrlBase)
              ? appendCacheBuster(cinPhotoUrlBase, demand.updated_at || demand.identity_submitted_at || demand.id)
              : cinPhotoUrlBase;
            const hasCinPhoto = Boolean(cinPhotoUrl);
            const isAmicaleDemand = String(demand.payment_mode || '').trim() === 'amicale' || Boolean(String(demand.pricing_amicale_id || '').trim());
            const voucherUrl = demand.voucher_url ? resolveAssetUrl(demand.voucher_url) : '';
            return (
            <div key={demand.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClasses[displayStatus]}`}>
                      {statusLabels[displayStatus]}
                    </span>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                      Cree le {formatDateTime(demand.created_at)}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-gray-900">
                    {demand.bien_reference || demand.bien_id} - {demand.bien_titre || 'Bien'}
                  </p>
                  <p className="text-sm text-gray-700">
                    {demand.client_name || demand.client_email || 'Client non identifie'} - {formatStayDate(demand.start_date)} {'->'} {formatStayDate(demand.end_date)} - {demand.guests} voyageurs
                  </p>
                  <p className="text-xs text-gray-500">
                    Proprietaire: <span className="font-medium text-gray-700">{demand.proprietaire_nom || '-'}</span>
                  </p>
                  {isAmicaleDemand && (
                    <div className="space-y-1 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      <p className="font-semibold uppercase tracking-wide text-emerald-700">Amicale</p>
                      <p>
                        Matricule: <span className="font-medium text-emerald-900">{demand.amicale_matricule || '-'}</span>
                      </p>
                      <p>
                        Telephone: <span className="font-medium text-emerald-900">{demand.amicale_phone || '-'}</span>
                      </p>
                      <p>
                        Code: <span className="font-medium text-emerald-900">{demand.amicale_code || '-'}</span>
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => toggleDemandExpanded(demand.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {isExpanded ? 'Masquer details' : 'Voir details'}
                  </button>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-600">
                    Etat
                    <select
                      value={displayStatus}
                      onChange={(event) => void handleDemandUpdate(demand, { status: event.target.value as ReservationDemandStatus, history_note: `Etat change par admin: ${statusLabels[event.target.value as ReservationDemandStatus]}` })}
                      disabled={savingId === demand.id}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700"
                    >
                      {statusSelectOptions.map((value) => (
                        <option key={value} value={value}>{statusLabels[value]}</option>
                      ))}
                    </select>
                  </label>
                  {isAmicaleDemand ? (
                    <>
                      {displayStatus === 'attente_validation_par_agence' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleDemandUpdate(demand, { status: 'voucher_en_cours', history_note: 'Agence valide la demande amicale et genere le voucher' })}
                            disabled={savingId === demand.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Valider voucher
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDemandUpdate(demand, { status: 'rejete_par_agence', history_note: "Agence rejette la demande amicale" })}
                            disabled={savingId === demand.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                          >
                            Rejeter agence
                          </button>
                        </>
                      )}
                      {voucherUrl && (
                        <a
                          href={voucherUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                        >
                          Ouvrir voucher
                        </a>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDemandUpdate(demand, { communicateToOwner: true, history_note: 'Demande communiquee au proprietaire' });
                          openOwnerChat(demand);
                        }}
                        disabled={savingId === demand.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
                      >
                        <MessageSquareShare className="h-4 w-4" />
                        Contacter proprietaire
                      </button>
                      <a
                        href={hasReceipt ? receiptUrl : undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!hasReceipt}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                          hasReceipt
                            ? 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100'
                            : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                        onClick={(event) => {
                          if (hasReceipt) return;
                          event.preventDefault();
                        }}
                      >
                        Voir recu
                      </a>
                      <a
                        href={hasCinPhoto ? cinPhotoUrl : undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!hasCinPhoto}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                          hasCinPhoto
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                        onClick={(event) => {
                          if (hasCinPhoto) return;
                          event.preventDefault();
                        }}
                      >
                        Voir photo CIN
                      </a>
                      <button
                        type="button"
                        onClick={() => void requestOwnerAvailability(demand)}
                        disabled={savingId === demand.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Bell className="h-4 w-4" />
                        Demander disponibilite
                      </button>
                      <button
                        type="button"
                        onClick={() => void generateContractForDemand(demand)}
                        disabled={generatingContractDemandId === demand.id || !String(demand.contract_id || '').trim()}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {generatingContractDemandId === demand.id ? 'Generation...' : 'Generer contrat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void viewContractForDemand(demand)}
                        disabled={!String(demand.contract_id || '').trim()}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                      >
                        Voir contrat
                      </button>
                      <button
                        type="button"
                        onClick={() => void sendContractToClient(demand)}
                        disabled={sendingContractDemandId === demand.id || !String(demand.contract_id || '').trim()}
                        className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
                      >
                        {sendingContractDemandId === demand.id ? 'Envoi...' : 'Envoyer contrat client'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void openHistory(demand.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <History className="h-4 w-4" />
                    Trace
                  </button>
                  {!isAmicaleDemand && (
                    <>
                      <button
                        type="button"
                        onClick={() => void rejectDemand(demand, false)}
                        disabled={savingId === demand.id || demand.status === 'demande_rejetee_admin'}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        Rejeter
                      </button>
                      <button
                        type="button"
                        onClick={() => void rejectDemand(demand, true)}
                        disabled={savingId === demand.id || demand.status === 'demande_rejetee_admin'}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                      >
                        Rejeter + popup client
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                <div>Notif proprietaire: <span className="font-semibold text-gray-800">{demand.owner_notified_at ? formatDateTime(demand.owner_notified_at) : 'Non envoyee'}</span></div>
                <div>Reponse proprietaire: <span className="font-semibold text-gray-800">{demand.owner_response_at ? formatDateTime(demand.owner_response_at) : 'Pas encore'}</span></div>
                <div>Consultation client: <span className="font-semibold text-gray-800">{demand.client_confirmation_clicked_at ? formatDateTime(demand.client_confirmation_clicked_at) : 'Pas encore'}</span></div>
                <div>Derniere MAJ: <span className="font-semibold text-gray-800">{demand.updated_at ? formatDateTime(demand.updated_at) : formatDateTime(demand.created_at)}</span></div>
                <div>Contrat realise: <span className="font-semibold text-gray-800">{demand.contract_generated_at ? formatDateTime(demand.contract_generated_at) : 'Pas encore'}</span></div>
              </div>
              {isExpanded && (
                <>
              <div className="mt-2 text-xs text-gray-500">
                Repartition voyageurs: <span className="font-medium text-gray-700">Adultes {Number(demand.adult_guests || demand.guests || 1)} / Enfants {Number(demand.child_guests || 0)}</span>
              </div>
              {(demand.selected_fixed_services?.length || demand.selected_variable_services?.length) ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {(demand.selected_fixed_services || []).length > 0 && (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Services fixes inclus</p>
                      <div className="mt-2 space-y-2 text-sm text-gray-700">
                        {(demand.selected_fixed_services || []).map((service) => (
                          <div key={`fixed-${service.id}`} className="flex items-center justify-between gap-3">
                            <span>{service.label}</span>
                            <span className="font-semibold text-gray-900">{getServiceDisplayPrice(service)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(demand.selected_variable_services || []).length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Services a deviser</p>
                      <div className="mt-2 space-y-2">
                        {(demand.selected_variable_services || []).map((service) => (
                          <div key={`variable-${service.id}`} className="grid gap-2 sm:grid-cols-[1fr_120px]">
                            <div className="text-sm text-gray-700">
                              <div className="font-medium text-gray-900">{service.label}</div>
                              <div className="text-xs text-gray-500">{service.categorie || 'Services client'} - {getServiceDisplayPrice(service)}</div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={getVariableServiceDrafts(demand)[String(service.id)] ?? 0}
                              onChange={(event) => setServiceQuoteDrafts((prev) => ({
                                ...prev,
                                [demand.id]: {
                                  ...getVariableServiceDrafts(demand),
                                  [String(service.id)]: Number(event.target.value || 0),
                                },
                              }))}
                              className="rounded-lg border border-amber-200 px-3 py-2 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-amber-800">
                          Statut devis: <span className="font-semibold">{demand.variable_services_quote_status || 'a_traiter'}</span>
                          {demand.variable_services_quote_total ? ` - ${demand.variable_services_quote_total} TND` : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() => void saveVariableServicesQuote(demand)}
                          disabled={savingId === demand.id}
                          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
                        >
                          Enregistrer devis services
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              {(demand.identity_submitted_at || demand.identity_document_number) && (
                <div className="mt-2 text-xs text-gray-500">
                  Coordonnees client: <span className="font-medium text-gray-700">{demand.identity_document_type || '-'}</span> - numero <span className="font-medium text-gray-700">{demand.identity_document_number || '-'}</span> - soumis le <span className="font-medium text-gray-700">{demand.identity_submitted_at ? formatDateTime(demand.identity_submitted_at) : '-'}</span>
                </div>
              )}
              {(demand.payment_receipt_image_url || demand.payment_receipt_uploaded_at || demand.payment_receipt_note) && (
                <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Recu de paiement client</p>
                  <p className="mt-1 text-xs text-gray-600">
                    Envoye le <span className="font-medium text-gray-800">{demand.payment_receipt_uploaded_at ? formatDateTime(demand.payment_receipt_uploaded_at) : '-'}</span>
                  </p>
                  {demand.payment_receipt_note ? (
                    <p className="mt-1 text-xs text-gray-700">Note client: <span className="font-medium">{demand.payment_receipt_note}</span></p>
                  ) : null}
                  {demand.payment_receipt_image_url ? (
                    <a
                      href={resolveAssetUrl(demand.payment_receipt_image_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
                    >
                      Ouvrir le recu
                    </a>
                  ) : null}
                </div>
              )}
                </>
              )}
            </div>
          )})}
        </div>
      </section>
      )}

      {activeView === 'chat' && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Chat proprietaires</h2>
              <p className="text-sm text-gray-500">Communication admin {'<->'} proprietaire sans informations locataire.</p>
            </div>
            <button
              type="button"
              onClick={() => selectedChatOwner ? void loadOwnerChat(selectedChatOwner.id) : undefined}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Recharger chat
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
            <div className="space-y-2 rounded-xl border border-gray-200 p-3">
              {chatOwners.length === 0 && (
                <p className="text-sm text-gray-500">Aucun proprietaire lie aux demandes.</p>
              )}
              {chatOwners.map((owner) => (
                <button
                  key={owner.id}
                  type="button"
                  onClick={() => {
                    if (selectedChatOwner?.id === owner.id) return;
                    setSelectedChatOwner(owner);
                    setChatDraft('');
                    void loadOwnerChat(owner.id);
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    selectedChatOwner?.id === owner.id
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{owner.name}</div>
                  <div className="text-xs text-gray-500">ID: {owner.id}</div>
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              {!selectedChatOwner ? (
                <p className="text-sm text-gray-500">Selectionnez un proprietaire pour ouvrir la conversation.</p>
              ) : (
                <div className="space-y-3">
                  <div className="border-b border-gray-100 pb-2">
                    <p className="font-medium text-gray-900">{selectedChatOwner.name}</p>
                    <p className="text-xs text-gray-500">ID: {selectedChatOwner.id}</p>
                  </div>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-lg bg-gray-50 p-3">
                    {chatLoading && <p className="text-sm text-gray-500">Chargement chat...</p>}
                    {!chatLoading && chatMessages.length === 0 && (
                      <p className="text-sm text-gray-500">Aucun message pour ce proprietaire.</p>
                    )}
                    {!chatLoading && chatMessages.map((message) => {
                      const fromAdmin = message.kind === 'admin_owner_chat';
                      return (
                        <div
                          key={message.id}
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            fromAdmin
                              ? 'ml-auto bg-emerald-100 text-emerald-900'
                              : 'bg-white text-gray-800'
                          }`}
                        >
                          <p>{message.text || '(message vide)'}</p>
                          <p className="mt-1 text-[11px] text-gray-500">{formatDateTime(message.createdAt)}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                      placeholder="Ecrire un message au proprietaire..."
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void sendChatMessage()}
                      disabled={chatSending}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {chatSending ? 'Envoi...' : 'Envoyer'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeView === 'calendars' && (
        <section className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Relance quotidienne calendrier proprietaires</h2>
                <p className="text-sm text-gray-500">Suivi complet des relances calendrier, des reponses proprietaires et des demandes de modification.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void dispatchCalendarPromptNow()}
                  disabled={dispatchingCalendarPrompt}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                >
                  {dispatchingCalendarPrompt ? 'Envoi...' : 'Envoyer maintenant'}
                </button>
                <button
                  type="button"
                  onClick={() => void saveCalendarPromptSchedule()}
                  disabled={scheduleSaving || !calendarPromptSchedule}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {scheduleSaving ? 'Enregistrement...' : 'Enregistrer horaire'}
                </button>
              </div>
            </div>
            {calendarPromptSchedule && (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">Date de debut</span>
                  <input
                    type="date"
                    value={calendarPromptSchedule.startDate || ''}
                    onChange={(event) => setCalendarPromptSchedule((prev) => prev ? { ...prev, startDate: event.target.value || null } : prev)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">Heure quotidienne ({calendarPromptSchedule.timezoneOffsetLabel})</span>
                  <input
                    type="time"
                    value={calendarPromptSchedule.dailyTime}
                    onChange={(event) => {
                      const [hourRaw, minuteRaw] = String(event.target.value || '').split(':');
                      const hour = Number(hourRaw || 0);
                      const minute = Number(minuteRaw || 0);
                      setCalendarPromptSchedule((prev) => prev ? {
                        ...prev,
                        dispatchHour: hour,
                        dispatchMinute: minute,
                        dailyTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
                      } : prev);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">Etat</span>
                  <select
                    value={calendarPromptSchedule.enabled ? 'enabled' : 'disabled'}
                    onChange={(event) => setCalendarPromptSchedule((prev) => prev ? {
                      ...prev,
                      enabled: event.target.value === 'enabled',
                    } : prev)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="enabled">Active</option>
                    <option value="disabled">Inactive</option>
                  </select>
                </label>
                <div className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">Dernier envoi</span>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">
                    {calendarPromptSchedule.lastDispatchedLocalDate || 'Aucun'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[340px,1fr]">
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-semibold text-gray-900">Etat par proprietaire</h3>
              </div>
              <div className="space-y-3">
                {calendarOwners.length === 0 && <p className="text-sm text-gray-500">Aucun proprietaire disponible.</p>}
                {calendarOwners.map((owner) => {
                  const calendarStatus = ownerCalendarStatuses[owner.id] || null;
                  const statusMeta = getOwnerCalendarStatusMeta(calendarStatus);
                  const pendingCalendarRequest = pendingCalendarRequestByOwner.get(owner.id) || null;
                  const isDispatchingThisOwner = dispatchingCalendarPromptOwnerId === owner.id;
                  return (
                    <div key={owner.id} className="rounded-xl border border-gray-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-900">{owner.name}</div>
                          <div className="mt-1 text-xs text-gray-500">ID: {owner.id}</div>
                        </div>
                        <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusMeta.tone}`}>
                          {statusMeta.label}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void dispatchCalendarPromptToOwner(owner)}
                          disabled={isDispatchingThisOwner}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                        >
                          {isDispatchingThisOwner ? 'Envoi...' : (statusMeta.label === 'En attente' ? 'Renvoyer la relance' : 'Envoyer la relance')}
                        </button>
                      </div>
                      <div className="mt-3 grid gap-1 text-xs">
                        <div className="text-gray-600">{statusMeta.detail}</div>
                        {statusMeta.helper ? (
                          <div className="font-medium text-gray-500">{statusMeta.helper}</div>
                        ) : null}
                        <div className="text-gray-500">
                          Reponse:{' '}
                          <span className="font-medium text-gray-700">
                            {statusMeta.respondedAt ? formatDateTime(statusMeta.respondedAt) : '-'}
                          </span>
                        </div>
                      </div>
                      {statusMeta.label === 'Mise a jour demandee' && pendingCalendarRequest ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => void openCalendarDiff(pendingCalendarRequest)}
                            disabled={calendarActionLoadingId === pendingCalendarRequest.id}
                            className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50"
                          >
                            Consulter la difference
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Demandes de mise a jour calendrier</h3>
                  <p className="text-sm text-gray-500">Approuver ou rejeter les changements demandes par les proprietaires.</p>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">En attente {pendingCalendarRequests.length}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">Historique {calendarRequestHistory.length}</span>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-700">En attente</h4>
                  <div className="space-y-3">
                    {pendingCalendarRequests.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                        Aucune demande calendrier en attente.
                      </div>
                    )}
                    {pendingCalendarRequests.map((request) => (
                      <div key={request.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-base font-semibold text-gray-900">{request.ownerName}</div>
                            <div className="text-xs text-gray-500">ID: {request.ownerId}</div>
                            <div className="mt-2 text-sm text-gray-700">{request.propertyTitle || 'Bien sans titre'}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {request.requestType === 'open' ? 'Reouverture demandee' : 'Fermeture demandee'} du {formatStayDate(request.startDate)} au {formatStayDate(request.endDate)}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">Envoyee le {formatDateTime(request.submittedAt || request.startDate)} (UTC+01:00)</div>
                            {request.note ? <div className="mt-2 text-xs text-gray-600">Note: {request.note}</div> : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void openCalendarDiff(request)}
                              disabled={calendarActionLoadingId === request.id}
                              className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50"
                            >
                              Consulter la difference
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Historique</h4>
                  <div className="space-y-3">
                    {calendarRequestHistory.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                        Aucune demande calendrier traitee.
                      </div>
                    )}
                    {calendarRequestHistory.map((request) => (
                      <div key={request.id} className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-base font-semibold text-gray-900">{request.ownerName}</div>
                            <div className="text-xs text-gray-500">ID: {request.ownerId}</div>
                            <div className="mt-2 text-sm text-gray-700">{request.propertyTitle || 'Bien sans titre'}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {request.requestType === 'open' ? 'Reouverture' : 'Fermeture'} du {formatStayDate(request.startDate)} au {formatStayDate(request.endDate)}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">Soumise le {formatDateTime(request.submittedAt || request.startDate)} (UTC+01:00)</div>
                            <div className="mt-1 text-xs text-gray-500">Traitee le {request.reviewedAt ? `${formatDateTime(request.reviewedAt)} (UTC+01:00)` : '-'}</div>
                            {request.reason ? <div className="mt-1 text-xs text-rose-600">Motif rejet: {request.reason}</div> : null}
                          </div>
                          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${request.status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                            {request.status === 'approved' ? 'Approuvee' : 'Rejetee'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Notifications systeme</h2>
          {unreadNotificationsCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {unreadNotificationsCount} non lue(s)
            </span>
          )}
        </div>
        <div className="space-y-3">
          {notifications.length === 0 && <p className="text-sm text-gray-500">Aucune notification.</p>}
          {notifications.map((notification) => (
            <div key={notification.id} className={`rounded-lg border p-3 ${notification.lu ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-800 line-clamp-2">{notification.message}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDateTime(notification.created_at)}</p>
                </div>
                {!notification.lu && (
                  <button
                    type="button"
                    onClick={() => void markNotificationAsRead(notification.id)}
                    className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    Marquer lu
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {calendarReviewRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Difference calendrier</h3>
                <p className="text-sm text-gray-500">
                  {calendarReviewRequest.ownerName} - {calendarReviewRequest.propertyTitle || 'Bien sans titre'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {calendarReviewRequest.requestType === 'open' ? 'Reouverture demandee' : 'Fermeture demandee'} du {formatStayDate(calendarReviewRequest.startDate)} au {formatStayDate(calendarReviewRequest.endDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCalendarReviewRequest(null);
                  setCalendarReviewDiff(null);
                }}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Fermer
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {calendarReviewLoading && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                  Chargement de la difference calendrier...
                </div>
              )}

              {!calendarReviewLoading && calendarReviewDiff && (
                <>
                  {calendarReviewDiff.note ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      Note proprietaire: {calendarReviewDiff.note}
                    </div>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-gray-900">Calendrier avant</div>
                        <div className="text-xs text-gray-500">Etat actuel du bien avant approbation.</div>
                      </div>
                      <AvailabilityCalendar
                        unavailableDates={calendarReviewDiff.currentCalendar}
                        onDateRangeSelect={() => {}}
                        selectedStart={null}
                        selectedEnd={null}
                      />
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-gray-900">Calendrier apres</div>
                        <div className="text-xs text-gray-500">Projection si l admin confirme cette demande.</div>
                      </div>
                      <AvailabilityCalendar
                        unavailableDates={calendarReviewDiff.projectedCalendar}
                        onDateRangeSelect={() => {}}
                        selectedStart={null}
                        selectedEnd={null}
                      />
                    </div>
                  </div>

                  {calendarReviewRequest.status === 'pending' && (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
                      <button
                        type="button"
                        onClick={() => void rejectCalendarRequest(calendarReviewRequest)}
                        disabled={calendarActionLoadingId === calendarReviewRequest.id}
                        className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        {calendarActionLoadingId === calendarReviewRequest.id ? 'Traitement...' : 'Rejeter'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void approveCalendarRequest(calendarReviewRequest)}
                        disabled={calendarActionLoadingId === calendarReviewRequest.id}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {calendarActionLoadingId === calendarReviewRequest.id ? 'Traitement...' : 'Confirmer'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {historyDemandId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Trace de progression</h3>
                <p className="text-sm text-gray-500">Demande {historyDemandId}</p>
              </div>
              <button type="button" onClick={() => setHistoryDemandId(null)} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
                Fermer
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {historyRows.length === 0 && <p className="text-sm text-gray-500">Aucun historique sauvegarde.</p>}
              <div className="space-y-3">
                {historyRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900">{statusLabels[row.status]}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(row.created_at)}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Acteur: {row.actor_type} {row.actor_id ? `(${row.actor_id})` : ''}</p>
                    {row.note ? <p className="mt-2 text-sm text-gray-700">{row.note}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
