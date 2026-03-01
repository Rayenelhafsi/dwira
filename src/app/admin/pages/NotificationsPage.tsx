import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, History, MessageSquareShare, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Notification, ReservationDemand, ReservationDemandHistory, ReservationDemandStatus } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const openStatuses = new Set<ReservationDemandStatus>([
  'en_attente_reponse_proprietaire',
  'pas_de_reponse_proprietaire',
  'reponse_positive_attente_confirmation_client',
  'reponse_negative_autre_proposition_meme_bien',
  'reponse_negative_autre_proposition_bien_similaire',
  'attente_envoi_coordonnees_contrat',
]);

const statusLabels: Record<ReservationDemandStatus, string> = {
  en_attente_reponse_proprietaire: 'En attente de reponse proprietaire',
  pas_de_reponse_proprietaire: 'Pas de reponse proprietaire',
  reponse_positive_attente_confirmation_client: 'Reponse positive, attente confirmation client',
  reponse_negative_autre_proposition_meme_bien: 'Reponse negative, autre proposition pour ce bien',
  reponse_negative_autre_proposition_bien_similaire: 'Reponse negative, autre proposition pour un bien similaire',
  attente_envoi_coordonnees_contrat: 'Attente d envoi de coordonnees pour contrat',
  contrat_realise: 'Contrat realise',
  succes_paiement: 'Succes paiement',
};

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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [demands, setDemands] = useState<ReservationDemand[]>([]);
  const [historyRows, setHistoryRows] = useState<ReservationDemandHistory[]>([]);
  const [historyDemandId, setHistoryDemandId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [notificationsResponse, demandsResponse] = await Promise.all([
        fetch(`${API_URL}/notifications`),
        fetch(`${API_URL}/reservation-demands`),
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

  const pendingDemands = useMemo(
    () => demands.filter((demand) => openStatuses.has(demand.status)),
    [demands]
  );

  const handleDemandUpdate = async (demand: ReservationDemand, patch: Partial<ReservationDemand> & { communicateToOwner?: boolean; history_note?: string }) => {
    setSavingId(demand.id);
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

  const openHistory = async (demandId: string) => {
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demandId)}/history`);
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
      const response = await fetch(`${API_URL}/notifications/${encodeURIComponent(notificationId)}/lu`, { method: 'PUT' });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Impossible de marquer la notification comme lue'));
      setNotifications((prev) => prev.map((item) => item.id === notificationId ? { ...item, lu: true } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de marquer la notification comme lue');
    }
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

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-gray-900">Demandes en attente</h2>
        </div>
        <div className="space-y-3">
          {pendingDemands.length === 0 && <p className="text-sm text-gray-500">Aucune demande client en attente.</p>}
          {pendingDemands.map((demand) => (
            <div key={demand.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {demand.bien_reference || demand.bien_id} - {demand.bien_titre || 'Bien'}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Client: {demand.client_name || demand.client_email || 'Client non identifie'} | Periode: {demand.start_date} au {demand.end_date} | Voyageurs: {demand.guests}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Proprietaire: {demand.proprietaire_nom || '-'} | Cree le {formatDateTime(demand.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={demand.status}
                    onChange={(event) => void handleDemandUpdate(demand, { status: event.target.value as ReservationDemandStatus, history_note: `Etat change par admin: ${statusLabels[event.target.value as ReservationDemandStatus]}` })}
                    disabled={savingId === demand.id}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleDemandUpdate(demand, { communicateToOwner: true, history_note: 'Demande communiquee au proprietaire' })}
                    disabled={savingId === demand.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
                  >
                    <MessageSquareShare className="h-4 w-4" />
                    Communiquer au proprietaire
                  </button>
                  <button
                    type="button"
                    onClick={() => void openHistory(demand.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <History className="h-4 w-4" />
                    Trace
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 text-xs text-gray-500">
                <div>Etat: <span className="font-medium text-gray-700">{statusLabels[demand.status]}</span></div>
                <div>Notif proprietaire: <span className="font-medium text-gray-700">{demand.owner_notified_at ? formatDateTime(demand.owner_notified_at) : 'Non envoyee'}</span></div>
                <div>Reponse proprietaire: <span className="font-medium text-gray-700">{demand.owner_response_at ? formatDateTime(demand.owner_response_at) : 'Pas encore'}</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Notifications systeme</h2>
        </div>
        <div className="space-y-3">
          {notifications.length === 0 && <p className="text-sm text-gray-500">Aucune notification.</p>}
          {notifications.map((notification) => (
            <div key={notification.id} className={`rounded-lg border p-3 ${notification.lu ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-800">{notification.message}</p>
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
