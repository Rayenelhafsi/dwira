import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Download, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type ResumePayload = {
  generatedAt?: string;
  volume: {
    securityLogs: number;
    interactionsTotal: number;
    interactionsAnonymous: number;
    interactionsKnown: number;
    oldestSecurityLogAt?: string | null;
    oldestInteractionAt?: string | null;
  };
  topVisitedProperties: Array<{ bienId: string; propertyTitle: string; visits: number }>;
  security: {
    byEvent: Array<{ eventType: string; total: number; failures: number }>;
    blocking: {
      http401: number;
      http403: number;
      http429: number;
    };
  };
  lastExports?: Record<string, string | null>;
};

async function downloadFile(url: string, filename: string) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Export impossible');
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function StatistiquesPage() {
  const [resume, setResume] = useState<ResumePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleanupDaysInteractions, setCleanupDaysInteractions] = useState(90);
  const [cleaningInteractions, setCleaningInteractions] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');

  const fetchResume = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/statistiques/resume`, { credentials: 'include' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.error || 'Resume indisponible'));
      setResume(data as ResumePayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Resume indisponible');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchResume();
  }, [fetchResume]);

  const cards = useMemo(() => {
    if (!resume) return [];
    return [
      { label: 'Logs securite', value: resume.volume.securityLogs, icon: ShieldCheck, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
      { label: 'Interactions total', value: resume.volume.interactionsTotal, icon: Activity, tone: 'text-blue-700 bg-blue-50 border-blue-200' },
      { label: 'Interactions anonymes', value: resume.volume.interactionsAnonymous, icon: AlertTriangle, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
      { label: 'Interactions connues', value: resume.volume.interactionsKnown, icon: BarChart3, tone: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
    ];
  }, [resume]);

  const cleanInteractions = async (segment: 'all' | 'anonymous' | 'known') => {
    if (!window.confirm(`Supprimer les interactions "${segment}" plus anciennes que ${cleanupDaysInteractions} jours ?`)) return;
    setCleaningInteractions(true);
    try {
      const response = await fetch(
        `${API_URL}/client-interactions?older_than_days=${encodeURIComponent(String(cleanupDaysInteractions))}&segment=${encodeURIComponent(segment)}`,
        { method: 'DELETE', credentials: 'include' }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.error || 'Nettoyage interactions impossible'));
      toast.success(`${Number(data?.deleted || 0)} interactions supprimees (${segment})`);
      await fetchResume();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nettoyage interactions impossible');
    } finally {
      setCleaningInteractions(false);
    }
  };

  const exportInteractions = async (segment: 'all' | 'anonymous' | 'known') => {
    try {
      const params = new URLSearchParams();
      params.set('format', 'xlsx');
      params.set('segment', segment);
      params.set('limit', '50000');
      if (exportDateFrom) params.set('date_from', exportDateFrom);
      if (exportDateTo) params.set('date_to', exportDateTo);
      await downloadFile(
        `${API_URL}/client-interactions/export?${params.toString()}`,
        `interactions-${segment}-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`
      );
      toast.success(`Export interactions ${segment} Excel telecharge`);
      await fetchResume();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export interactions impossible');
    }
  };

  const exportSecurity = async () => {
    try {
      const params = new URLSearchParams();
      params.set('format', 'xlsx');
      params.set('limit', '50000');
      if (exportDateFrom) params.set('date_from', exportDateFrom);
      if (exportDateTo) params.set('date_to', exportDateTo);
      await downloadFile(`${API_URL}/security-audit-logs/export?${params.toString()}`, `security-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
      toast.success('Export securite Excel telecharge');
      await fetchResume();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export securite impossible');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques et surcharge</h1>
          <p className="mt-1 text-sm text-gray-500">Resume securite, interactions (anonymes/connues), surfaces d'attaque et biens les plus visites.</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchResume()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Recharger
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.tone}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">{card.label}</p>
              <card.icon className="h-4 w-4" />
            </div>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Top biens les plus visites</h2>
          {loading ? <p className="mt-3 text-sm text-gray-500">Chargement...</p> : (
            <div className="mt-3 space-y-2">
              {(resume?.topVisitedProperties || []).slice(0, 8).map((item) => (
                <div key={`${item.bienId}-${item.propertyTitle}`} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <p className="text-sm text-gray-700">{item.propertyTitle || item.bienId}</p>
                  <p className="text-sm font-semibold text-emerald-700">{item.visits}</p>
                </div>
              ))}
              {(resume?.topVisitedProperties || []).length === 0 ? <p className="text-sm text-gray-500">Aucune interaction visite.</p> : null}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Surface d'attaque et blocage</h2>
          {loading ? <p className="mt-3 text-sm text-gray-500">Chargement...</p> : (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
                  <p className="text-xs text-amber-700">401</p>
                  <p className="text-lg font-bold text-amber-800">{resume?.security?.blocking?.http401 || 0}</p>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-center">
                  <p className="text-xs text-rose-700">403</p>
                  <p className="text-lg font-bold text-rose-800">{resume?.security?.blocking?.http403 || 0}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-center">
                  <p className="text-xs text-red-700">429</p>
                  <p className="text-lg font-bold text-red-800">{resume?.security?.blocking?.http429 || 0}</p>
                </div>
              </div>
              <div className="space-y-2">
                {(resume?.security?.byEvent || []).slice(0, 8).map((event) => (
                  <div key={event.eventType} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                    <p className="text-sm text-gray-700">{event.eventType}</p>
                    <p className="text-xs text-gray-500">total {event.total} / echecs {event.failures}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Exports et nettoyage (anti-surcharge DB)</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Periode export - du</span>
            <input type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Periode export - au</span>
            <input type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          <p>Dernier export securite: {resume?.lastExports?.security_audit_logs || 'jamais'}</p>
          <p>Dernier export interactions all: {resume?.lastExports?.client_interactions_all || 'jamais'}</p>
          <p>Dernier export interactions anonymous: {resume?.lastExports?.client_interactions_anonymous || 'jamais'}</p>
          <p>Dernier export interactions known: {resume?.lastExports?.client_interactions_known || 'jamais'}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportSecurity} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export audit securite
          </button>
          <button type="button" onClick={() => void exportInteractions('all')} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export interactions (toutes)
          </button>
          <button type="button" onClick={() => void exportInteractions('anonymous')} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export interactions anonymes
          </button>
          <button type="button" onClick={() => void exportInteractions('known')} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export interactions connues
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={7}
            max={3650}
            value={cleanupDaysInteractions}
            onChange={(e) => setCleanupDaysInteractions(Math.max(7, Number(e.target.value || 90)))}
            className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-sm"
          />
          <button
            type="button"
            disabled={cleaningInteractions}
            onClick={() => void cleanInteractions('anonymous')}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Nettoyer anonymes
          </button>
          <button
            type="button"
            disabled={cleaningInteractions}
            onClick={() => void cleanInteractions('known')}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Nettoyer connues
          </button>
          <button
            type="button"
            disabled={cleaningInteractions}
            onClick={() => void cleanInteractions('all')}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Nettoyer toutes
          </button>
        </div>
      </section>
    </div>
  );
}
