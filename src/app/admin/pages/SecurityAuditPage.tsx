import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type SecurityAuditRow = {
  id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | string;
  success: boolean;
  http_status?: number | null;
  method?: string | null;
  path?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', hour12: false });
}

function severityBadgeClass(severity: string) {
  const normalized = String(severity || '').toLowerCase();
  if (normalized === 'error') return 'bg-red-100 text-red-700 border-red-200';
  if (normalized === 'warning') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

export default function SecurityAuditPage() {
  const [rows, setRows] = useState<SecurityAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleanupDays, setCleanupDays] = useState(90);
  const [isCleaning, setIsCleaning] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [eventType, setEventType] = useState('');
  const [userId, setUserId] = useState('');
  const [successFilter, setSuccessFilter] = useState<'all' | '1' | '0'>('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (eventType.trim()) params.set('event_type', eventType.trim());
      if (userId.trim()) params.set('user_id', userId.trim());
      if (successFilter !== 'all') params.set('success', successFilter);
      const response = await fetch(`${API_URL}/security-audit-logs?${params.toString()}`, { credentials: 'include' });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(data?.error || 'Impossible de charger les logs de securite'));
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les logs de securite');
    } finally {
      setLoading(false);
    }
  }, [eventType, limit, successFilter, userId]);

  const fetchLastExport = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/statistiques/resume`, { credentials: 'include' });
      const data = await response.json().catch(() => null);
      if (!response.ok) return;
      setLastExportAt(String(data?.lastExports?.security_audit_logs || '').trim() || null);
    } catch {
      // ignore
    }
  }, []);

  const exportLogs = async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(Math.max(1000, limit)));
      if (eventType.trim()) params.set('event_type', eventType.trim());
      if (userId.trim()) params.set('user_id', userId.trim());
      if (successFilter !== 'all') params.set('success', successFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const response = await fetch(`${API_URL}/security-audit-logs/export?${params.toString()}`, { credentials: 'include' });
      const text = await response.text();
      if (!response.ok) {
        throw new Error('Export securite impossible');
      }
      const blob = new Blob([text], { type: 'text/tab-separated-values;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `security-audit-export-${new Date().toISOString().replace(/[:.]/g, '-')}.tsv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Export securite (Excel/TSV) telecharge');
      await fetchLastExport();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export securite impossible');
    }
  };

  const cleanOldLogs = async () => {
    if (!window.confirm(`Supprimer les logs de securite plus anciens que ${cleanupDays} jours ?`)) return;
    setIsCleaning(true);
    try {
      const response = await fetch(`${API_URL}/security-audit-logs?older_than_days=${encodeURIComponent(String(cleanupDays))}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.error || 'Nettoyage securite impossible'));
      toast.success(`${Number(data?.deleted || 0)} logs supprimes`);
      await fetchLogs();
      await fetchLastExport();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nettoyage securite impossible');
    } finally {
      setIsCleaning(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    void fetchLastExport();
  }, [fetchLastExport]);

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.success) acc.success += 1;
        if (!row.success) acc.failed += 1;
        if (String(row.severity || '').toLowerCase() === 'warning') acc.warning += 1;
        if (String(row.severity || '').toLowerCase() === 'error') acc.error += 1;
        return acc;
      },
      { total: 0, success: 0, failed: 0, warning: 0, error: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit securite</h1>
          <p className="mt-1 text-sm text-gray-500">Suivi des tentatives login/OTP, rate-limit et acces refuses.</p>
          <p className="mt-1 text-xs text-gray-500">Dernier export: {lastExportAt || 'jamais'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportLogs}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Export Excel (CSV)
          </button>
          <div className="inline-flex items-center gap-2">
            <input
              type="number"
              min={7}
              max={3650}
              value={cleanupDays}
              onChange={(e) => setCleanupDays(Math.max(7, Number(e.target.value || 90)))}
              className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void cleanOldLogs()}
              disabled={isCleaning}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              {isCleaning ? 'Nettoyage...' : 'Nettoyer anciens'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void fetchLogs()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Recharger
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-3"><p className="text-xs text-gray-500">Total</p><p className="text-lg font-semibold text-gray-900">{stats.total}</p></div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Succes</p><p className="text-lg font-semibold text-emerald-800">{stats.success}</p></div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-xs text-red-700">Echecs</p><p className="text-lg font-semibold text-red-800">{stats.failed}</p></div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-700">Warnings</p><p className="text-lg font-semibold text-amber-800">{stats.warning}</p></div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3"><p className="text-xs text-rose-700">Errors</p><p className="text-lg font-semibold text-rose-800">{stats.error}</p></div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Event type</span>
            <input value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="admin_login_failed" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">User ID</span>
            <input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="u..." />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Succes</span>
            <select value={successFilter} onChange={(e) => setSuccessFilter(e.target.value as 'all' | '1' | '0')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="all">Tous</option>
              <option value="1">Succes</option>
              <option value="0">Echecs</option>
            </select>
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Du</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Au</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Limite</span>
            <select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value || 100))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Evenements</h2>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          {loading ? (
            <div className="p-6 text-sm text-gray-500">Chargement...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">Aucun evenement sur ce filtre.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-left">Niveau</th>
                  <th className="px-3 py-2 text-left">Resultat</th>
                  <th className="px-3 py-2 text-left">HTTP</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Route</th>
                  <th className="px-3 py-2 text-left">Message</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDateTime(row.created_at)}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{row.event_type}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${severityBadgeClass(row.severity)}`}>
                        {row.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.success ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-4 w-4" />ok</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="h-4 w-4" />ko</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{row.http_status || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <div>{row.user_id || '-'}</div>
                      <div className="text-xs text-gray-500">{row.user_email || '-'}</div>
                      <div className="text-xs text-gray-500">{row.ip || '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      <div className="font-mono text-xs">{row.method || '-'}</div>
                      <div className="max-w-[320px] break-all text-xs text-gray-500">{row.path || '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      <div>{row.message || '-'}</div>
                      {row.metadata ? (
                        <pre className="mt-1 max-w-[340px] overflow-auto rounded bg-gray-50 p-2 text-[11px] text-gray-500">
                          {JSON.stringify(row.metadata, null, 2)}
                        </pre>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
