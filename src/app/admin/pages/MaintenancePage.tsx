import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Clock3, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import type { Bien, Maintenance, MaintenanceStatut } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type BienApi = Pick<Bien, 'id' | 'reference' | 'titre'>;

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

const statusMeta: Record<MaintenanceStatut, { label: string; className: string; icon: ReactNode }> = {
  en_attente_accord_proprietaire: {
    label: 'Accord proprietaire requis',
    className: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: <Clock3 size={12} />,
  },
  approuve: {
    label: 'Approuve',
    className: 'text-sky-700 bg-sky-50 border-sky-200',
    icon: <CheckCircle size={12} />,
  },
  en_cours: {
    label: 'En cours',
    className: 'text-blue-700 bg-blue-50 border-blue-200',
    icon: <Wrench size={12} />,
  },
  termine: {
    label: 'Termine',
    className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon: <CheckCircle size={12} />,
  },
  annule: {
    label: 'Annule',
    className: 'text-rose-700 bg-rose-50 border-rose-200',
    icon: <AlertTriangle size={12} />,
  },
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', hour12: false });
}

export default function MaintenancePage() {
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [biens, setBiens] = useState<BienApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    bien_id: '',
    description: '',
    cout: '',
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [maintenanceResponse, biensResponse] = await Promise.all([
        fetch(`${API_URL}/maintenance`),
        fetch(`${API_URL}/biens`),
      ]);

      if (!maintenanceResponse.ok) {
        throw new Error(await getApiErrorMessage(maintenanceResponse, 'Impossible de charger la maintenance'));
      }
      if (!biensResponse.ok) {
        throw new Error(await getApiErrorMessage(biensResponse, 'Impossible de charger les biens'));
      }

      const maintenanceData = await maintenanceResponse.json();
      const biensData = await biensResponse.json();
      setMaintenances(Array.isArray(maintenanceData) ? maintenanceData : []);
      setBiens(Array.isArray(biensData) ? biensData : []);
      if (!form.bien_id && Array.isArray(biensData) && biensData[0]?.id) {
        setForm((prev) => ({ ...prev, bien_id: biensData[0].id }));
      }
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Impossible de charger la maintenance';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [form.bien_id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const sortedMaintenances = useMemo(
    () => [...maintenances].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    [maintenances]
  );

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.bien_id || !form.description.trim()) {
      toast.error('Bien et description requis');
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bien_id: form.bien_id,
          description: form.description.trim(),
          cout: Number(form.cout || 0),
        }),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Creation de la maintenance impossible'));
      }
      const created = await response.json();
      setMaintenances((prev) => [created, ...prev]);
      setForm((prev) => ({ ...prev, description: '', cout: '' }));
      if (created.owner_approval_required) {
        toast.success("Maintenance creee. Accord proprietaire requis avant execution.");
      } else {
        toast.success('Maintenance ajoutee');
      }
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Creation de la maintenance impossible');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (maintenance: Maintenance, statut: MaintenanceStatut) => {
    try {
      const response = await fetch(`${API_URL}/maintenance/${encodeURIComponent(maintenance.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Mise a jour maintenance impossible'));
      }
      const updated = await response.json();
      setMaintenances((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      toast.success('Maintenance mise a jour');
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : 'Mise a jour maintenance impossible');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Maintenance et Reparations</h1>
        <p className="mt-1 text-sm text-gray-500">Les travaux au-dessus du plafond proprietaire passent automatiquement en attente d'accord.</p>
      </div>

      <form onSubmit={handleCreate} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Nouvelle demande</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <select
            value={form.bien_id}
            onChange={(event) => setForm((prev) => ({ ...prev, bien_id: event.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
          >
            <option value="">Selectionner un bien</option>
            {biens.map((bien) => (
              <option key={bien.id} value={bien.id}>
                {(bien.reference || bien.id)} - {bien.titre || 'Bien'}
              </option>
            ))}
          </select>
          <input
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description du probleme"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm lg:col-span-2"
            required
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cout}
              onChange={(event) => setForm((prev) => ({ ...prev, cout: event.target.value }))}
              placeholder="Cout estime (DT)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {error && <div className="border-b border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
              <tr>
                <th className="p-4">Bien</th>
                <th className="p-4">Description</th>
                <th className="p-4">Cout</th>
                <th className="p-4">Statut</th>
                <th className="p-4">Details metier</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedMaintenances.map((maintenance) => {
                const meta = statusMeta[(maintenance.statut || 'en_cours') as MaintenanceStatut] || statusMeta.en_cours;
                return (
                  <tr key={maintenance.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 align-top">
                      <div className="font-medium text-gray-900">{maintenance.bien_titre || maintenance.bien_id}</div>
                      <div className="text-xs text-gray-500">{maintenance.proprietaire_nom ? `Proprietaire: ${maintenance.proprietaire_nom}` : 'Sans proprietaire lie'}</div>
                    </td>
                    <td className="p-4 align-top text-sm text-gray-600">{maintenance.description}</td>
                    <td className="p-4 align-top text-sm font-semibold text-red-500">{Number(maintenance.cout || 0).toFixed(2)} DT</td>
                    <td className="p-4 align-top">
                      <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${meta.className}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                    </td>
                    <td className="p-4 align-top text-sm text-gray-600">
                      <div>Creation: {formatDateTime(maintenance.created_at)}</div>
                      <div className="mt-1">
                        Accord: {maintenance.owner_approval_required ? (maintenance.owner_approval_status === 'approuve' ? 'approuve' : 'en attente') : 'non requis'}
                      </div>
                      {maintenance.owner_approved_at ? <div className="mt-1 text-xs text-gray-500">Valide le {formatDateTime(maintenance.owner_approved_at)}</div> : null}
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        {maintenance.statut === 'en_attente_accord_proprietaire' && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(maintenance, 'approuve')}
                              className="rounded-lg border border-sky-200 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-50"
                            >
                              Approuver
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(maintenance, 'annule')}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              Annuler
                            </button>
                          </>
                        )}
                        {maintenance.statut === 'approuve' && (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(maintenance, 'en_cours')}
                            className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Demarrer
                          </button>
                        )}
                        {maintenance.statut === 'en_cours' && (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(maintenance, 'termine')}
                            className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Marquer termine
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedMaintenances.length === 0 && (
                <tr>
                  <td className="p-10 text-center text-sm text-gray-500" colSpan={6}>
                    Aucune maintenance enregistree.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
