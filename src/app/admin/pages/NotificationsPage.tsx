import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, ChevronDown, ChevronUp, History, MessageSquareShare, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Notification, ReservationDemand, ReservationDemandHistory, ReservationDemandStatus } from '../types';
import { getServiceDisplayPrice } from '../../utils/servicePayants';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const openStatuses = new Set<ReservationDemandStatus>([
  'en_attente_reponse_proprietaire',
  'pas_de_reponse_proprietaire',
  'reponse_positive_attente_confirmation_client',
  'reponse_negative_autre_proposition_meme_bien',
  'reponse_negative_autre_proposition_bien_similaire',
  'attente_validation_amicale',
  'attente_validation_par_agence',
  'voucher_en_cours',
  'rejete_par_amicale',
  'rejete_par_agence',
  'demande_annulee_client',
  'demande_recu_paiement',
  'recu_paiement_envoye',
]);

const demandPriority: Record<ReservationDemandStatus, number> = {
  demande_annulee_client: 0,
  reponse_positive_attente_confirmation_client: 1,
  en_attente_reponse_proprietaire: 2,
  pas_de_reponse_proprietaire: 3,
  reponse_negative_autre_proposition_meme_bien: 4,
  reponse_negative_autre_proposition_bien_similaire: 5,
  attente_validation_amicale: 6,
  attente_validation_par_agence: 7,
  voucher_en_cours: 8,
  rejete_par_amicale: 9,
  rejete_par_agence: 10,
  demande_recu_paiement: 11,
  recu_paiement_envoye: 12,
  demande_rejetee_admin: 13,
  attente_envoi_coordonnees_contrat: 14,
  contrat_realise: 15,
  succes_paiement: 16,
};

function resolveDisplayStatus(demand: ReservationDemand): ReservationDemandStatus {
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
  reponse_negative_autre_proposition_meme_bien: 'Reponse negative, autre proposition pour ce bien',
  reponse_negative_autre_proposition_bien_similaire: 'Reponse negative, autre proposition pour un bien similaire',
  attente_validation_amicale: 'Attente validation amicale',
  attente_validation_par_agence: 'Attente validation par l agence',
  voucher_en_cours: 'Voucher en cours',
  rejete_par_amicale: 'Rejete par l amicale',
  rejete_par_agence: 'Rejete par l agence',
  demande_rejetee_admin: 'Demande rejetee par admin',
  demande_annulee_client: 'Demande annulee par client',
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
  reponse_negative_autre_proposition_meme_bien: 'bg-violet-100 text-violet-800 border-violet-200',
  reponse_negative_autre_proposition_bien_similaire: 'bg-violet-100 text-violet-800 border-violet-200',
  attente_validation_amicale: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  attente_validation_par_agence: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  voucher_en_cours: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  rejete_par_amicale: 'bg-slate-100 text-slate-700 border-slate-200',
  rejete_par_agence: 'bg-rose-100 text-rose-800 border-rose-200',
  demande_rejetee_admin: 'bg-rose-100 text-rose-800 border-rose-200',
  demande_annulee_client: 'bg-slate-100 text-slate-800 border-slate-200',
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
  'attente_validation_amicale',
  'attente_validation_par_agence',
  'voucher_en_cours',
  'rejete_par_amicale',
  'rejete_par_agence',
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
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', hour12: false });
}
function formatStayDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' });
}

function resolveAssetUrl(url?: string | null) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${window.location.origin}${value.startsWith('/') ? value : `/${value}`}`;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [demands, setDemands] = useState<ReservationDemand[]>([]);
  const [historyRows, setHistoryRows] = useState<ReservationDemandHistory[]>([]);
  const [historyDemandId, setHistoryDemandId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'demands' | 'chat'>('demands');
  const [selectedChatOwner, setSelectedChatOwner] = useState<{ id: string; name: string; demandId?: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; text: string; kind?: string; createdAt?: string }>>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [serviceQuoteDrafts, setServiceQuoteDrafts] = useState<Record<string, Record<string, number>>>({});
  const [expandedDemandIds, setExpandedDemandIds] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [notificationsResponse, demandsResponse] = await Promise.all([
        fetch(`${API_URL}/notifications`, { credentials: 'include' }),
        fetch(`${API_URL}/reservation-demands`, { credentials: 'include' }),
      ]);
      if (!notificationsResponse.ok) throw new Error(await getApiErrorMessage(notificationsResponse, 'Impossible de charger les notifications'));
      if (!demandsResponse.ok) throw new Error(await getApiErrorMessage(demandsResponse, 'Impossible de charger les demandes'));
      const notificationRows = await notificationsResponse.json();
      const demandRows = await demandsResponse.json();
      setNotifications(Array.isArray(notificationRows) ? notificationRows : []);
      setDemands(Array.isArray(demandRows) ? demandRows : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchData();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [fetchData]);

  const pendingDemands = useMemo(() => {
    return demands
      .filter((demand) => openStatuses.has(demand.status))
      .filter((demand) => !isAmicaleDemand(demand))
      .sort((a, b) => {
        const sa = resolveDisplayStatus(a);
        const sb = resolveDisplayStatus(b);
        const pa = demandPriority[sa] ?? 99;
        const pb = demandPriority[sb] ?? 99;
        if (pa !== pb) return pa - pb;
        const da = new Date(String(a.updated_at || a.created_at || '')).getTime();
        const db = new Date(String(b.updated_at || b.created_at || '')).getTime();
        return db - da;
      });
  }, [demands]);
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
  }, [demands]);

  const loadOwnerChat = useCallback(async (ownerId: string) => {
    setChatLoading(true);
    try {
      const response = await fetch(`${API_URL}/mobile/owners/${encodeURIComponent(ownerId)}/chat`, {
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
      toast.error(error instanceof Error ? error.message : 'Impossible de charger le chat proprietaire');
      setChatMessages([]);
    } finally {
      setChatLoading(false);
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
    setSelectedChatOwner(owner);
    setActiveView('chat');
    void loadOwnerChat(owner.id);
  }, [loadOwnerChat]);

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
      setDemands((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success('Demande de disponibilite envoyee au proprietaire');
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi demande disponibilite impossible');
    } finally {
      setSavingId(null);
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
          onClick={() => void fetchData()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Recharger
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
      </div>

      {activeView === 'demands' && (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-gray-900">Demandes en attente</h2>
        </div>
        <div className="space-y-3">
          {pendingDemands.length === 0 && <p className="text-sm text-gray-500">Aucune demande client en attente.</p>}
          {pendingDemands.map((demand) => {
            const displayStatus = resolveDisplayStatus(demand);
            const isExpanded = Boolean(expandedDemandIds[demand.id]);
            const receiptUrl = demand.payment_receipt_image_url ? resolveAssetUrl(demand.payment_receipt_image_url) : '';
            const hasReceipt = Boolean(receiptUrl);
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
                      value={demand.status}
                      onChange={(event) => void handleDemandUpdate(demand, { status: event.target.value as ReservationDemandStatus, history_note: `Etat change par admin: ${statusLabels[event.target.value as ReservationDemandStatus]}` })}
                      disabled={savingId === demand.id}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700"
                    >
                      {editableStatusOptions.map((value) => (
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
                      <button
                        type="button"
                        onClick={() => void requestOwnerAvailability(demand)}
                        disabled={savingId === demand.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Bell className="h-4 w-4" />
                        Demander disponibilite
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
                    setSelectedChatOwner(owner);
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
