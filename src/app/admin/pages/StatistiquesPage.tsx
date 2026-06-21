import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Activity,
  BarChart3,
  CalendarRange,
  Download,
  ExternalLink,
  Gauge,
  LineChart as LineChartIcon,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getOptimizedMediaUrl, resolveMediaUrl } from '../../utils/media';
import { buildPropertyDetailsPath } from '../../utils/propertyRouting';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type StatsFilters = {
  dateFrom: string;
  dateTo: string;
  granularity: 'day' | 'week' | 'month';
  segment: 'all' | 'known' | 'anonymous';
  channel: 'all' | 'direct' | 'amicale' | 'partner';
  propertyId: string;
};

type OverviewResponse = {
  generatedAt?: string;
  summary: {
    totalInteractions: number;
    sessions: number;
    knownVisitors: number;
    anonymousVisitors: number;
    visits: number;
    reservationAttempts: number;
    reservationSubmitted: number;
    conversionRate: number;
    avgViewDurationSeconds: number;
    topChannel: string;
    channelCounts: Record<string, number>;
    amicaleShare: number;
    partnerShare: number;
  };
};

type TimeSeriesPoint = {
  bucket: string;
  label: string;
  sessions: number;
  visits: number;
  reservationAttempts: number;
  reservationSubmitted: number;
  knownVisitors: number;
  anonymousVisitors: number;
  avgViewDurationSeconds: number;
  conversionRate: number;
};

type TimeSeriesResponse = {
  series: TimeSeriesPoint[];
};

type PropertyPerformanceItem = {
  bienId: string;
  propertyTitle: string;
  propertyReference?: string | null;
  coverImageUrl?: string | null;
  visits: number;
  reservationAttempts: number;
  reservationSubmitted: number;
  sessions: number;
  conversionRate: number;
  dominantChannel: string;
  lastActivityAt?: string | null;
};

type PropertyPerformanceResponse = {
  items: PropertyPerformanceItem[];
};

type StayDemandRange = {
  startDate: string;
  endDate: string;
  nights: number;
  total: number;
  submitted: number;
  propertyTitle?: string;
};

type StayDemandMonth = {
  month: string;
  label: string;
  total: number;
};

type StayDemandResponse = {
  averageStayNights: number;
  topRanges: StayDemandRange[];
  topMonths: StayDemandMonth[];
};

type ChannelItem = {
  key: 'direct' | 'amicale' | 'partner' | 'autre';
  label: string;
  interactions: number;
  sessions: number;
  visits: number;
  reservationAttempts: number;
  reservationSubmitted: number;
  knownVisitors: number;
  anonymousVisitors: number;
  conversionRate: number;
};

type ChannelsResponse = {
  channels: ChannelItem[];
  topAmicales: Array<{ key: string; name: string; demands: number }>;
  topPartners: Array<{ key: string; name: string; demands: number }>;
};

type GaStatusResponse = {
  enabled: boolean;
  measurementId?: string | null;
  propertyId?: string | null;
  mode?: string | null;
  adminUrl?: string | null;
  summary?: string | null;
};

const PROPERTY_PLACEHOLDER =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0" y1="0" x2="1" y2="1"%3E%3Cstop offset="0%25" stop-color="%23f0fdf4"/%3E%3Cstop offset="100%25" stop-color="%23dbeafe"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width="800" height="520" fill="url(%23g)"/%3E%3Cpath d="M0 360L180 230l110 84 120-96 180 142H0z" fill="%2394a3b8" fill-opacity=".22"/%3E%3Ccircle cx="620" cy="140" r="44" fill="%2310b981" fill-opacity=".35"/%3E%3C/svg%3E';

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  const toDateInput = (value: Date) => value.toISOString().slice(0, 10);
  return {
    dateFrom: toDateInput(start),
    dateTo: toDateInput(end),
  };
}

function formatNumber(value: number | undefined | null) {
  return new Intl.NumberFormat('fr-FR').format(Number(value || 0));
}

function formatPercent(value: number | undefined | null) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Jamais';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('fr-FR', { hour12: false });
}

function formatDuration(seconds: number | undefined | null) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

function buildStatsQuery(filters: StatsFilters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  params.set('date_from', filters.dateFrom);
  params.set('date_to', filters.dateTo);
  params.set('granularity', filters.granularity);
  params.set('segment', filters.segment);
  params.set('channel', filters.channel);
  if (filters.propertyId.trim()) params.set('property_id', filters.propertyId.trim());
  Object.entries(extra).forEach(([key, value]) => {
    if (String(value || '').trim()) params.set(key, value);
  });
  return params.toString();
}

async function downloadFile(url: string, filename: string) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('Export impossible');
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function channelLabel(value?: string | null) {
  if (value === 'partner') return 'Agences partenaires';
  if (value === 'amicale') return 'Amicales';
  if (value === 'autre') return 'Autres';
  return 'Direct';
}

function getChartMinWidth(points: number, min = 720, perPoint = 56, max = 2200) {
  if (points <= 0) return min;
  return Math.max(min, Math.min(max, points * perPoint));
}

function getPropertyCardImage(item?: PropertyPerformanceItem | null) {
  const resolved = resolveMediaUrl(item?.coverImageUrl || '');
  return resolved ? getOptimizedMediaUrl(resolved, { width: 720, quality: 72 }) : PROPERTY_PLACEHOLDER;
}

function buildPropertyStatsHref(item: PropertyPerformanceItem) {
  return buildPropertyDetailsPath({
    id: item.bienId,
    reference: item.propertyReference || item.bienId,
    slug: item.bienId,
  });
}

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Activity;
  accent: string;
}) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{hint}</p>
        </div>
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export default function StatistiquesPage() {
  const navigate = useNavigate();
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [filters, setFilters] = useState<StatsFilters>({
    ...defaultRange,
    granularity: 'day',
    segment: 'all',
    channel: 'all',
    propertyId: '',
  });
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [timeseries, setTimeseries] = useState<TimeSeriesResponse | null>(null);
  const [propertyPerformance, setPropertyPerformance] = useState<PropertyPerformanceResponse | null>(null);
  const [stayDemand, setStayDemand] = useState<StayDemandResponse | null>(null);
  const [channels, setChannels] = useState<ChannelsResponse | null>(null);
  const [gaStatus, setGaStatus] = useState<GaStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [authExpired, setAuthExpired] = useState(false);
  const [cleanupDaysInteractions, setCleanupDaysInteractions] = useState(90);
  const [cleaningInteractions, setCleaningInteractions] = useState(false);
  const [exportingSnapshot, setExportingSnapshot] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const baseQuery = buildStatsQuery(filters);
      const [overviewResponse, timeseriesResponse, propertyResponse, stayResponse, channelsResponse, gaResponse] = await Promise.all([
        fetch(`${API_URL}/statistiques/overview?${baseQuery}`, { credentials: 'include' }),
        fetch(`${API_URL}/statistiques/timeseries?${baseQuery}`, { credentials: 'include' }),
        fetch(`${API_URL}/statistiques/property-performance?${buildStatsQuery(filters, { limit: '24' })}`, { credentials: 'include' }),
        fetch(`${API_URL}/statistiques/stay-demand?${buildStatsQuery(filters, { limit: '12' })}`, { credentials: 'include' }),
        fetch(`${API_URL}/statistiques/channels?${baseQuery}`, { credentials: 'include' }),
        fetch(`${API_URL}/statistiques/google-analytics/status`, { credentials: 'include' }),
      ]);

      const [overviewData, timeseriesData, propertyData, stayData, channelsData, gaData] = await Promise.all([
        overviewResponse.json().catch(() => null),
        timeseriesResponse.json().catch(() => null),
        propertyResponse.json().catch(() => null),
        stayResponse.json().catch(() => null),
        channelsResponse.json().catch(() => null),
        gaResponse.json().catch(() => null),
      ]);

      if ([overviewResponse, timeseriesResponse, propertyResponse, stayResponse, channelsResponse, gaResponse].some((response) => response.status === 401)) {
        setAuthExpired(true);
        toast.error('Session admin expiree. Reconnectez-vous.');
        navigate('/connexion-admin-interne', { replace: true });
        return;
      }

      if (!overviewResponse.ok) throw new Error(String(overviewData?.error || 'Impossible de charger les statistiques'));
      if (!timeseriesResponse.ok) throw new Error(String(timeseriesData?.error || 'Impossible de charger les courbes'));
      if (!propertyResponse.ok) throw new Error(String(propertyData?.error || 'Impossible de charger la performance des biens'));
      if (!stayResponse.ok) throw new Error(String(stayData?.error || 'Impossible de charger la demande de sejour'));
      if (!channelsResponse.ok) throw new Error(String(channelsData?.error || 'Impossible de charger les canaux'));
      if (!gaResponse.ok) throw new Error(String(gaData?.error || 'Impossible de charger le statut GA4'));

      setOverview(overviewData as OverviewResponse);
      setTimeseries(timeseriesData as TimeSeriesResponse);
      setPropertyPerformance(propertyData as PropertyPerformanceResponse);
      setStayDemand(stayData as StayDemandResponse);
      setChannels(channelsData as ChannelsResponse);
      setGaStatus(gaData as GaStatusResponse);
      setAuthExpired(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Statistiques indisponibles');
    } finally {
      setLoading(false);
    }
  }, [filters, navigate]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const propertyOptions = useMemo(() => {
    const seen = new Set<string>();
    return (propertyPerformance?.items || []).filter((item) => {
      const key = String(item.bienId || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [propertyPerformance]);

  const snapshotPayload = useMemo(() => ({
    filters,
    overview,
    timeseries,
    propertyPerformance,
    stayDemand,
    channels,
    gaStatus,
    exportedAt: new Date().toISOString(),
  }), [channels, filters, gaStatus, overview, propertyPerformance, stayDemand, timeseries]);

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
      await fetchStats();
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
      params.set('date_from', filters.dateFrom);
      params.set('date_to', filters.dateTo);
      await downloadFile(
        `${API_URL}/client-interactions/export?${params.toString()}`,
        `interactions-${segment}-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`
      );
      toast.success(`Export interactions ${segment} telecharge`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export interactions impossible');
    }
  };

  const exportCurrentSnapshot = async () => {
    setExportingSnapshot(true);
    try {
      downloadJson(snapshotPayload, `statistiques-cockpit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      toast.success('Snapshot statistiques telecharge');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export du snapshot impossible');
    } finally {
      setExportingSnapshot(false);
    }
  };

  const series = timeseries?.series || [];
  const channelCards = channels?.channels || [];
  const summary = overview?.summary;
  const trendChartMinWidth = useMemo(() => getChartMinWidth(series.length, 760, 58, 2400), [series.length]);
  const conversionChartMinWidth = useMemo(() => getChartMinWidth(series.length, 680, 54, 2200), [series.length]);
  const stayChartMinWidth = useMemo(() => getChartMinWidth((stayDemand?.topMonths || []).length, 560, 72, 1600), [stayDemand?.topMonths]);

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-[32px] border border-emerald-100 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.10),_transparent_35%),linear-gradient(135deg,#f4fbf8_0%,#ffffff_52%,#eef7ff_100%)] shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Cockpit trafic et conversion</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Statistiques business multi-canaux</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Vue admin unifiee sur les consultations, les parcours amicales et agences partenaires, les biens performants,
              les periodes de sejour les plus demandees et la conversion reservation.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Derniere synchro</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(overview?.generatedAt)}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Source GA4</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{gaStatus?.enabled ? 'Active' : 'Non configuree'}</p>
            </div>
            <button
              type="button"
              onClick={() => void fetchStats()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Recharger
            </button>
          </div>
        </div>
      </section>

      <section className="sticky top-4 z-20 rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
        {authExpired ? (
          <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Session admin expiree. Reconnexion requise pour recharger les statistiques et les listes annexes.
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Du</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Au</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Granularite</span>
            <select
              value={filters.granularity}
              onChange={(e) => setFilters((prev) => ({ ...prev, granularity: e.target.value as StatsFilters['granularity'] }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="day">Jour</option>
              <option value="week">Semaine</option>
              <option value="month">Mois</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Segment</span>
            <select
              value={filters.segment}
              onChange={(e) => setFilters((prev) => ({ ...prev, segment: e.target.value as StatsFilters['segment'] }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">Tous</option>
              <option value="known">Connus</option>
              <option value="anonymous">Anonymes</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Canal</span>
            <select
              value={filters.channel}
              onChange={(e) => setFilters((prev) => ({ ...prev, channel: e.target.value as StatsFilters['channel'] }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">Tous</option>
              <option value="direct">Direct</option>
              <option value="amicale">Amicales</option>
              <option value="partner">Agences partenaires</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Bien</span>
            <input
              list="stats-property-options"
              value={filters.propertyId}
              onChange={(e) => setFilters((prev) => ({ ...prev, propertyId: e.target.value }))}
              placeholder="ID bien"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <datalist id="stats-property-options">
              {propertyOptions.map((item) => (
                <option key={item.bienId} value={item.bienId}>
                  {item.propertyTitle}
                </option>
              ))}
            </datalist>
          </label>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard title="Sessions" value={formatNumber(summary?.sessions)} hint={`${formatNumber(summary?.knownVisitors)} connus / ${formatNumber(summary?.anonymousVisitors)} anonymes`} icon={Users} accent="bg-emerald-100 text-emerald-700" />
        <KpiCard title="Visites biens" value={formatNumber(summary?.visits)} hint={`${formatNumber(summary?.totalInteractions)} interactions totales`} icon={Activity} accent="bg-sky-100 text-sky-700" />
        <KpiCard title="Tentatives reservation" value={formatNumber(summary?.reservationAttempts)} hint={`${formatNumber(summary?.reservationSubmitted)} reservations soumises`} icon={Gauge} accent="bg-amber-100 text-amber-700" />
        <KpiCard title="Taux conversion" value={formatPercent(summary?.conversionRate)} hint={`Canal dominant: ${channelLabel(summary?.topChannel)}`} icon={LineChartIcon} accent="bg-violet-100 text-violet-700" />
        <KpiCard title="Part amicales" value={formatPercent(summary?.amicaleShare)} hint={`Part partners: ${formatPercent(summary?.partnerShare)}`} icon={CalendarRange} accent="bg-rose-100 text-rose-700" />
        <KpiCard title="Lecture moyenne" value={formatDuration(summary?.avgViewDurationSeconds)} hint="Base property_view_end" icon={BarChart3} accent="bg-slate-100 text-slate-700" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Trafic et tendances</h2>
            <p className="text-sm text-slate-500">Sessions, visites, tentatives et reservations par periode.</p>
          </div>
          {loading ? <EmptyChart message="Chargement des courbes..." /> : series.length === 0 ? (
            <EmptyChart message="Aucune donnee disponible pour cette plage." />
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto pb-2 [scrollbar-gutter:stable]">
                <div className="h-[320px] min-w-full" style={{ width: `${trendChartMinWidth}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} minTickGap={20} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="sessions" name="Sessions" stroke="#0f766e" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="visits" name="Visites" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="reservationAttempts" name="Tentatives" stroke="#d97706" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="reservationSubmitted" name="Soumises" stroke="#7c3aed" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-xs text-slate-500">Les courbes restent scrollables horizontalement sur desktop et mobile quand la plage contient beaucoup de points.</p>
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Conversion et engagement</h2>
            <p className="text-sm text-slate-500">Lecture moyenne et conversion par periode.</p>
          </div>
          {loading ? <EmptyChart message="Chargement de l'engagement..." /> : series.length === 0 ? (
            <EmptyChart message="Aucune donnee disponible." />
          ) : (
            <div className="overflow-x-auto pb-2 [scrollbar-gutter:stable]">
              <div className="h-[320px] min-w-full" style={{ width: `${conversionChartMinWidth}px` }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} minTickGap={20} />
                    <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="avgViewDurationSeconds" name="Lecture moyenne (s)" fill="#0f766e" radius={[8, 8, 0, 0]} />
                    <Bar yAxisId="right" dataKey="conversionRate" name="Conversion (%)" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
        <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Biens et performance</h2>
            <p className="text-sm text-slate-500">Top biens par visites avec funnel, image de couverture et canal dominant.</p>
          </div>
          {loading ? <EmptyChart message="Chargement des biens..." /> : (propertyPerformance?.items || []).length === 0 ? (
            <EmptyChart message="Aucun bien suivi sur cette plage." />
          ) : (
            <div className="space-y-3">
              {(propertyPerformance?.items || []).slice(0, 10).map((item) => {
                const maxVisits = Math.max(1, ...(propertyPerformance?.items || []).map((row) => row.visits));
                const width = Math.max(8, Math.round((item.visits / maxVisits) * 100));
                return (
                  <div key={item.bienId} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-4 md:flex-row">
                      <div className="h-28 overflow-hidden rounded-2xl bg-slate-200 md:w-44">
                        <img src={getPropertyCardImage(item)} alt={item.propertyTitle || item.bienId} className="h-full w-full object-cover" loading="lazy" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{item.propertyTitle || item.bienId}</p>
                            <p className="text-xs text-slate-500">
                              {item.propertyReference ? `Ref ${item.propertyReference} • ` : ''}ID {item.bienId} • Canal dominant: {channelLabel(item.dominantChannel)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                            <span>Visites {formatNumber(item.visits)}</span>
                            <span>Tentatives {formatNumber(item.reservationAttempts)}</span>
                            <span>Soumises {formatNumber(item.reservationSubmitted)}</span>
                            <span>Conv. {formatPercent(item.conversionRate)}</span>
                          </div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-200">
                          <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${width}%` }} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-500">Derniere activite: {formatDateTime(item.lastActivityAt)}</p>
                          <a
                            href={buildPropertyStatsHref(item)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                          >
                            Ouvrir le bien
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Demande de sejour</h2>
            <p className="text-sm text-slate-500">Periodes et mois les plus selectionnes.</p>
          </div>
          <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Sejour moyen</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">{Number(stayDemand?.averageStayNights || 0).toFixed(1)} nuits</p>
          </div>
          {loading ? <EmptyChart message="Chargement des periodes..." /> : (stayDemand?.topMonths || []).length === 0 ? (
            <EmptyChart message="Aucune periode recherchee sur cette plage." />
          ) : (
            <>
              <div className="overflow-x-auto pb-2 [scrollbar-gutter:stable]">
                <div className="h-[220px] min-w-full" style={{ width: `${stayChartMinWidth}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stayDemand?.topMonths || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} minTickGap={18} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="total" name="Demandes" fill="#0f766e" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {(stayDemand?.topRanges || []).slice(0, 6).map((range) => (
                  <div key={`${range.startDate}-${range.endDate}`} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{range.startDate}{' -> '}{range.endDate}</p>
                        <p className="text-xs text-slate-500">{range.nights} nuits{range.propertyTitle ? ` • ${range.propertyTitle}` : ''}</p>
                      </div>
                      <div className="text-right text-xs text-slate-600">
                        <p>{formatNumber(range.total)} tentatives</p>
                        <p>{formatNumber(range.submitted)} soumises</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Canaux et segments</h2>
            <p className="text-sm text-slate-500">Direct, amicales, agences partenaires et comportement visiteur.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {channelCards.map((item) => (
              <div key={item.key} className="rounded-[24px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {formatPercent(item.conversionRate)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Interactions</p>
                    <p className="text-lg font-bold text-slate-900">{formatNumber(item.interactions)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Sessions</p>
                    <p className="text-lg font-bold text-slate-900">{formatNumber(item.sessions)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Visites</p>
                    <p className="font-semibold text-slate-800">{formatNumber(item.visits)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Soumises</p>
                    <p className="font-semibold text-slate-800">{formatNumber(item.reservationSubmitted)}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">{formatNumber(item.knownVisitors)} visiteurs connus • {formatNumber(item.anonymousVisitors)} anonymes</p>
                {item.reservationSubmitted > 0 && item.visits === 0 ? (
                  <p className="mt-1 text-[11px] text-amber-700">Soumissions detectees depuis les tables reservations, sans visite trackee associee.</p>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div className="rounded-[24px] border border-sky-100 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Google Analytics 4</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{gaStatus?.enabled ? 'Tracking pret' : 'A configurer'}</p>
              </div>
              <Gauge className="h-5 w-5 text-sky-700" />
            </div>
            <p className="mt-3 text-sm text-slate-600">{gaStatus?.summary || 'Statut indisponible.'}</p>
            {gaStatus?.measurementId ? <p className="mt-2 text-xs text-slate-500">Measurement ID: {gaStatus.measurementId}</p> : null}
            {gaStatus?.adminUrl ? (
              <a href={gaStatus.adminUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50">
                Ouvrir GA4
              </a>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">Top amicales</p>
              <div className="mt-3 space-y-2 text-sm">
                {(channels?.topAmicales || []).slice(0, 5).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3">
                    <span className="truncate text-slate-700">{item.name}</span>
                    <span className="font-semibold text-slate-900">{formatNumber(item.demands)}</span>
                  </div>
                ))}
                {(channels?.topAmicales || []).length === 0 ? <p className="text-slate-500">Aucune donnee amicale.</p> : null}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">Top agences partenaires</p>
              <div className="mt-3 space-y-2 text-sm">
                {(channels?.topPartners || []).slice(0, 5).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3">
                    <span className="truncate text-slate-700">{item.name}</span>
                    <span className="font-semibold text-slate-900">{formatNumber(item.demands)}</span>
                  </div>
                ))}
                {(channels?.topPartners || []).length === 0 ? <p className="text-slate-500">Aucune donnee partenaire.</p> : null}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Operations et retention</h2>
            <p className="text-sm text-slate-500">Exports de travail et nettoyage de la table d'interactions.</p>
          </div>
          <button
            type="button"
            onClick={() => void exportCurrentSnapshot()}
            disabled={exportingSnapshot}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Export snapshot JSON
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void exportInteractions('all')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" />
            Export interactions
          </button>
          <button type="button" onClick={() => void exportInteractions('anonymous')} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50">
            <Download className="h-4 w-4" />
            Export anonymes
          </button>
          <button type="button" onClick={() => void exportInteractions('known')} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 px-3 py-2 text-sm text-violet-700 hover:bg-violet-50">
            <Download className="h-4 w-4" />
            Export connues
          </button>
        </div>

        <div className="mt-5 rounded-[24px] border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nettoyage au-dela de</span>
              <input
                type="number"
                min={7}
                max={3650}
                value={cleanupDaysInteractions}
                onChange={(e) => setCleanupDaysInteractions(Math.max(7, Number(e.target.value || 90)))}
                className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={cleaningInteractions}
                onClick={() => void cleanInteractions('anonymous')}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Nettoyer anonymes
              </button>
              <button
                type="button"
                disabled={cleaningInteractions}
                onClick={() => void cleanInteractions('known')}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Nettoyer connues
              </button>
              <button
                type="button"
                disabled={cleaningInteractions}
                onClick={() => void cleanInteractions('all')}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Nettoyer toutes
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
