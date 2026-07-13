import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
  Area,
  AreaChart,
} from 'recharts';
import { getOptimizedMediaUrl, resolveMediaUrl } from '../../utils/media';
import { buildPropertyDetailsPath } from '../../utils/propertyRouting';
import { MapContainer, Popup, TileLayer, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const STATS_REQUEST_TIMEOUT_MS = 25000;

type StatsEndpointResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

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

type AvailabilityPressureTimelinePoint = {
  bucket: string;
  label: string;
  blockedDays: number;
  bookedDays: number;
  pendingDays: number;
  unavailableDays: number;
  visits: number;
  saturationRate: number;
  pressureScore: number;
};

type AvailabilityPressureTypeItem = {
  key: string;
  typeKey: string;
  typeLabel: string;
  subTypeKey?: string | null;
  subTypeLabel?: string | null;
  propertyCount: number;
  saturatedPropertyCount: number;
  blockedDays: number;
  bookedDays: number;
  pendingDays: number;
  unavailableDays: number;
  capacityDays: number;
  saturationRate: number;
  visits: number;
  pressureScore: number;
  monthly: Array<{
    bucket: string;
    label: string;
    unavailableDays: number;
    blockedDays: number;
    bookedDays: number;
    pendingDays: number;
    saturationRate: number;
  }>;
};

type AvailabilityPressureMapPoint = {
  key: string;
  label: string;
  propertyCount: number;
  blockedDays: number;
  bookedDays: number;
  pendingDays: number;
  unavailableDays: number;
  saturationRate: number;
  visits: number;
  pressureScore: number;
  lat: number;
  lng: number;
  dominantTypeLabel: string;
};

type AvailabilityPressurePropertyMapPoint = {
  key: string;
  bienId: string;
  label: string;
  propertyTitle: string;
  propertyReference?: string | null;
  typeLabel: string;
  subTypeLabel?: string | null;
  zoneLabel: string;
  lat: number;
  lng: number;
  mapPrecision: 'property' | 'zone' | 'unknown';
  blockedDays: number;
  bookedDays: number;
  pendingDays: number;
  unavailableDays: number;
  visits: number;
  saturationRate: number;
  pressureScore: number;
};

type AvailabilityPressureCalendarDay = {
  date: string;
  availableProperties: number;
  unavailableProperties: number;
  blockedProperties: number;
  bookedProperties: number;
  pendingProperties: number;
  visits: number;
  remainingShare: number;
  saturationRate: number;
};

type AvailabilityPressureTypeCalendar = {
  key: string;
  label: string;
  propertyCount: number;
  saturationRate: number;
  visits: number;
  days: AvailabilityPressureCalendarDay[];
};

type AvailabilityPressureTypePeakRange = {
  key: string;
  label: string;
  typeLabel: string;
  subTypeLabel?: string | null;
  propertyCount: number;
  visits: number;
  saturationRate: number;
  ranges: Array<{
    key: string;
    startDate: string;
    endDate: string;
    unavailableDays: number;
    visits: number;
    blockedDays: number;
    bookedDays: number;
    pendingDays: number;
    dayCount: number;
    peakUnavailableProperties: number;
    avgSaturationRate: number;
  }>;
};

type AvailabilityPressureResponse = {
  overview: {
    totalProperties: number;
    totalCapacityDays: number;
    totalUnavailableDays: number;
    totalVisits: number;
    saturationRate: number;
    pressuredType?: {
      key: string;
      label: string;
      saturationRate: number;
      pressureScore: number;
      visits: number;
    } | null;
    peakPeriod?: {
      bucket: string;
      label: string;
      saturationRate: number;
      unavailableDays: number;
      visits: number;
    } | null;
  };
  timeline: AvailabilityPressureTimelinePoint[];
  types: AvailabilityPressureTypeItem[];
  heatmap: {
    columns: Array<{ bucket: string; label: string }>;
    rows: Array<{
      key: string;
      label: string;
      cells: Array<{
        bucket: string;
        label: string;
        saturationRate: number;
        unavailableDays: number;
        blockedDays: number;
        bookedDays: number;
        pendingDays: number;
      }>;
    }>;
  };
  mapPoints: AvailabilityPressureMapPoint[];
  propertyMapPoints: AvailabilityPressurePropertyMapPoint[];
  typeCalendars: AvailabilityPressureTypeCalendar[];
  peakPeriods: Array<{
    bucket: string;
    label: string;
    blockedDays: number;
    bookedDays: number;
    pendingDays: number;
    unavailableDays: number;
    visits: number;
    saturationRate: number;
  }>;
  typePeakRanges: AvailabilityPressureTypePeakRange[];
  recommendations: Array<{
    key: string;
    label: string;
    message: string;
  }>;
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

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('fr-FR');
}

function formatDateRangeLabel(startDate?: string | null, endDate?: string | null) {
  if (!startDate && !endDate) return 'Periode indisponible';
  return `Du ${formatDateOnly(startDate)} au ${formatDateOnly(endDate)}`;
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

function formatCompactLabel(value?: string | null) {
  return String(value || '').trim() || 'Aucune donnee';
}

function getHeatmapColor(rate: number) {
  const safe = Math.max(0, Math.min(100, Number(rate || 0)));
  if (safe >= 80) return 'bg-rose-600 text-white';
  if (safe >= 60) return 'bg-orange-500 text-white';
  if (safe >= 40) return 'bg-amber-300 text-slate-900';
  if (safe >= 20) return 'bg-emerald-200 text-slate-900';
  return 'bg-slate-100 text-slate-500';
}

function getPressureBadgeColor(score: number) {
  const safe = Number(score || 0);
  if (safe >= 70) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (safe >= 50) return 'border-orange-200 bg-orange-50 text-orange-700';
  if (safe >= 30) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getMapCircleColor(rate: number) {
  const safe = Number(rate || 0);
  if (safe >= 80) return '#e11d48';
  if (safe >= 60) return '#f97316';
  if (safe >= 40) return '#f59e0b';
  if (safe >= 20) return '#10b981';
  return '#94a3b8';
}

function getMapCircleRadius(rate: number, pressureScore: number) {
  const base = Math.max(Number(rate || 0), Number(pressureScore || 0));
  return Math.max(8, Math.min(26, 8 + (base / 100) * 18));
}

function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
  );
}

function getAvailabilityDayColor(remainingShare: number, unavailableProperties: number) {
  if (unavailableProperties <= 0) return 'bg-emerald-100 text-emerald-800';
  const safe = Math.max(0, Math.min(100, Number(remainingShare || 0)));
  if (safe <= 10) return 'bg-rose-600 text-white';
  if (safe <= 30) return 'bg-orange-500 text-white';
  if (safe <= 55) return 'bg-amber-300 text-slate-900';
  return 'bg-sky-100 text-sky-800';
}

async function fetchStatsEndpoint<T>(path: string): Promise<StatsEndpointResult<T>> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), STATS_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      data: data as T | null,
      error: response.ok ? null : String((data as any)?.error || 'Erreur API'),
    };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Timeout de chargement'
      : (error instanceof Error ? error.message : 'Erreur reseau');
    return {
      ok: false,
      status: 0,
      data: null,
      error: message,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
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
  const [availabilityPressure, setAvailabilityPressure] = useState<AvailabilityPressureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [authExpired, setAuthExpired] = useState(false);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [cleanupDaysInteractions, setCleanupDaysInteractions] = useState(90);
  const [cleaningInteractions, setCleaningInteractions] = useState(false);
  const [exportingSnapshot, setExportingSnapshot] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const baseQuery = buildStatsQuery(filters);
      const [overviewResponse, timeseriesResponse, propertyResponse, stayResponse, channelsResponse, gaResponse, availabilityResponse] = await Promise.all([
        fetchStatsEndpoint<OverviewResponse>(`/statistiques/overview?${baseQuery}`),
        fetchStatsEndpoint<TimeSeriesResponse>(`/statistiques/timeseries?${baseQuery}`),
        fetchStatsEndpoint<PropertyPerformanceResponse>(`/statistiques/property-performance?${buildStatsQuery(filters, { limit: '24' })}`),
        fetchStatsEndpoint<StayDemandResponse>(`/statistiques/stay-demand?${buildStatsQuery(filters, { limit: '12' })}`),
        fetchStatsEndpoint<ChannelsResponse>(`/statistiques/channels?${baseQuery}`),
        fetchStatsEndpoint<GaStatusResponse>(`/statistiques/google-analytics/status`),
        fetchStatsEndpoint<AvailabilityPressureResponse>(`/statistiques/availability-pressure?${buildStatsQuery(filters, { limit: '12' })}`),
      ]);

      if ([overviewResponse, timeseriesResponse, propertyResponse, stayResponse, channelsResponse, gaResponse, availabilityResponse].some((response) => response.status === 401)) {
        setAuthExpired(true);
        setPartialErrors([]);
        toast.error('Session admin expiree. Reconnectez-vous pour relancer les statistiques.');
        return;
      }

      const nextPartialErrors: string[] = [];

      if (overviewResponse.ok) {
        setOverview(overviewResponse.data as OverviewResponse);
      } else {
        setOverview(null);
        nextPartialErrors.push(String(overviewResponse.error || 'Vue d ensemble indisponible'));
      }

      if (timeseriesResponse.ok) {
        setTimeseries(timeseriesResponse.data as TimeSeriesResponse);
      } else {
        setTimeseries(null);
        nextPartialErrors.push(String(timeseriesResponse.error || 'Courbes indisponibles'));
      }

      if (propertyResponse.ok) {
        setPropertyPerformance(propertyResponse.data as PropertyPerformanceResponse);
      } else {
        setPropertyPerformance(null);
        nextPartialErrors.push(String(propertyResponse.error || 'Performance des biens indisponible'));
      }

      if (stayResponse.ok) {
        setStayDemand(stayResponse.data as StayDemandResponse);
      } else {
        setStayDemand(null);
        nextPartialErrors.push(String(stayResponse.error || 'Demande de sejour indisponible'));
      }

      if (channelsResponse.ok) {
        setChannels(channelsResponse.data as ChannelsResponse);
      } else {
        setChannels(null);
        nextPartialErrors.push(String(channelsResponse.error || 'Canaux indisponibles'));
      }

      if (gaResponse.ok) {
        setGaStatus(gaResponse.data as GaStatusResponse);
      } else {
        setGaStatus(null);
        nextPartialErrors.push(String(gaResponse.error || 'Statut GA4 indisponible'));
      }

      if (availabilityResponse.ok) {
        setAvailabilityPressure(availabilityResponse.data as AvailabilityPressureResponse);
      } else {
        setAvailabilityPressure(null);
        nextPartialErrors.push(String(availabilityResponse.error || 'Saturation calendrier indisponible'));
      }

      const hasMainData =
        overviewResponse.ok
        || timeseriesResponse.ok
        || propertyResponse.ok
        || stayResponse.ok
        || channelsResponse.ok;

      if (!hasMainData && nextPartialErrors.length > 0) {
        throw new Error(nextPartialErrors[0]);
      }

      setPartialErrors(nextPartialErrors);
      setAuthExpired(false);
    } catch (error) {
      setPartialErrors([]);
      toast.error(error instanceof Error ? error.message : 'Statistiques indisponibles');
    } finally {
      setLoading(false);
    }
  }, [filters]);

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
    availabilityPressure,
    exportedAt: new Date().toISOString(),
  }), [availabilityPressure, channels, filters, gaStatus, overview, propertyPerformance, stayDemand, timeseries]);

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
  const saturationTimeline = availabilityPressure?.timeline || [];
  const saturationTypes = availabilityPressure?.types || [];
  const saturationHeatmapColumns = availabilityPressure?.heatmap?.columns || [];
  const saturationHeatmapRows = availabilityPressure?.heatmap?.rows || [];
  const saturationPropertyCalendars = availabilityPressure?.typeCalendars || [];
  const saturationMapPoints = useMemo(
    () => (availabilityPressure?.propertyMapPoints || []).filter((point) => isValidLatLng(point.lat, point.lng)),
    [availabilityPressure?.propertyMapPoints],
  );
  const saturationTypePeakRanges = availabilityPressure?.typePeakRanges || [];
  const saturationTimelineMinWidth = useMemo(() => getChartMinWidth(saturationTimeline.length, 760, 58, 2400), [saturationTimeline.length]);
  const saturationCalendarMinWidth = useMemo(
    () => getChartMinWidth(Math.max(...saturationPropertyCalendars.map((item) => item.days.length), 0), 920, 38, 3200),
    [saturationPropertyCalendars],
  );
  const saturationMapCenter = useMemo<[number, number]>(() => {
    if (saturationMapPoints.length === 0) return [36.8471, 11.0939];
    const latAvg = saturationMapPoints.reduce((sum, point) => sum + point.lat, 0) / saturationMapPoints.length;
    const lngAvg = saturationMapPoints.reduce((sum, point) => sum + point.lng, 0) / saturationMapPoints.length;
    return [latAvg, lngAvg];
  }, [saturationMapPoints]);

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
        {!authExpired && partialErrors.length > 0 ? (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Certaines sections du cockpit n ont pas pu etre chargees: {partialErrors.join(' | ')}
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

      <section className="space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <article className="rounded-[28px] border border-rose-100 bg-[linear-gradient(135deg,#fff1f2_0%,#ffffff_100%)] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Saturation globale</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{formatPercent(availabilityPressure?.overview?.saturationRate)}</p>
            <p className="mt-2 text-sm text-slate-600">
              {formatNumber(availabilityPressure?.overview?.totalUnavailableDays)} jours indisponibles sur {formatNumber(availabilityPressure?.overview?.totalCapacityDays)} jours-capacite.
            </p>
          </article>
          <article className="rounded-[28px] border border-amber-100 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Periode la plus indisponible</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{formatCompactLabel(availabilityPressure?.overview?.peakPeriod?.label)}</p>
            <p className="mt-2 text-sm text-slate-600">
              {formatPercent(availabilityPressure?.overview?.peakPeriod?.saturationRate)} de saturation pour {formatNumber(availabilityPressure?.overview?.peakPeriod?.visits)} visites.
            </p>
          </article>
          <article className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Type sous tension</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{formatCompactLabel(availabilityPressure?.overview?.pressuredType?.label)}</p>
            <p className="mt-2 text-sm text-slate-600">
              Score {Number(availabilityPressure?.overview?.pressuredType?.pressureScore || 0).toFixed(1)} • {formatPercent(availabilityPressure?.overview?.pressuredType?.saturationRate)} • {formatNumber(availabilityPressure?.overview?.pressuredType?.visits)} visites.
            </p>
          </article>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Saturation calendrier et trafic</h2>
              <p className="text-sm text-slate-500">Courbe de tension qui croise indisponibilites et consultations sur la plage filtree.</p>
            </div>
            {loading ? <EmptyChart message="Chargement de la saturation..." /> : saturationTimeline.length === 0 ? (
              <EmptyChart message="Aucune indisponibilite exploitable sur cette plage." />
            ) : (
              <div className="overflow-x-auto pb-2 [scrollbar-gutter:stable]">
                <div className="h-[340px] min-w-full" style={{ width: `${saturationTimelineMinWidth}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={saturationTimeline} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
                      <defs>
                        <linearGradient id="pressureFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.04} />
                        </linearGradient>
                        <linearGradient id="visitsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} minTickGap={20} />
                      <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="saturationRate" name="Saturation (%)" stroke="#e11d48" fill="url(#pressureFill)" strokeWidth={3} />
                      <Area yAxisId="left" type="monotone" dataKey="pressureScore" name="Indice tension" stroke="#f97316" fillOpacity={0} strokeWidth={2} />
                      <Area yAxisId="right" type="monotone" dataKey="visits" name="Visites" stroke="#2563eb" fill="url(#visitsFill)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Actions suggerees</h2>
              <p className="text-sm text-slate-500">Axes prioritaires pour injecter du stock sur les periodes et typologies tendues.</p>
            </div>
            <div className="space-y-3">
              {(availabilityPressure?.recommendations || []).slice(0, 5).map((item) => (
                <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.message}</p>
                </div>
              ))}
              {(availabilityPressure?.recommendations || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                  Pas de tension forte detectee sur cette plage. Les types restent globalement alimentes.
                </div>
              ) : null}
            </div>
          </article>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Calendriers disponibilite par type</h2>
              <p className="text-sm text-slate-500">Lecture jour par jour du stock restant et des jours indisponibles pour les types et sous-types les plus exposes.</p>
            </div>
            {loading ? <EmptyChart message="Chargement des calendriers..." /> : saturationPropertyCalendars.length === 0 ? (
              <EmptyChart message="Aucun calendrier de disponibilite a afficher." />
            ) : (
              <div className="overflow-x-auto pb-2 [scrollbar-gutter:stable]">
                <div className="space-y-3" style={{ minWidth: `${saturationCalendarMinWidth}px` }}>
                  {saturationPropertyCalendars.map((calendar) => (
                    <div key={calendar.key} className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{calendar.label}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatNumber(calendar.propertyCount)} biens • {formatPercent(calendar.saturationRate)} de saturation • {formatNumber(calendar.visits)} visites
                          </p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPressureBadgeColor(calendar.saturationRate)}`}>
                          reste {formatPercent(calendar.days[calendar.days.length - 1]?.remainingShare)}
                        </span>
                      </div>
                      <div className="grid gap-1.5" style={{ gridTemplateColumns: `180px repeat(${calendar.days.length}, minmax(36px, 1fr))` }}>
                        <div className="flex items-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Disponibilite</div>
                        {calendar.days.map((day) => (
                          <div key={`${calendar.key}-head-${day.date}`} className="text-center text-[10px] font-semibold text-slate-500">
                            {String(day.date).slice(8, 10)}
                          </div>
                        ))}
                        <div className="flex items-center text-xs text-slate-600">Reste / indispo</div>
                        {calendar.days.map((day) => (
                          <div
                            key={`${calendar.key}-${day.date}`}
                            className={`rounded-xl px-1 py-2 text-center text-[10px] font-semibold shadow-sm ${getAvailabilityDayColor(day.remainingShare, day.unavailableProperties)}`}
                            title={`${calendar.label} • ${formatDateOnly(day.date)} • ${formatNumber(day.availableProperties)} dispo / ${formatNumber(day.unavailableProperties)} indispo • ${formatNumber(day.visits)} visites`}
                          >
                            <div>{formatNumber(day.availableProperties)}</div>
                            <div className="opacity-80">/{formatNumber(day.unavailableProperties)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Types et sous-types presque satures</h2>
              <p className="text-sm text-slate-500">Classement combine saturation calendrier et pression de consultation.</p>
            </div>
            <div className="space-y-3">
              {saturationTypes.slice(0, 8).map((item) => (
                <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{item.subTypeLabel ? `${item.typeLabel} / ${item.subTypeLabel}` : item.typeLabel}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatNumber(item.propertyCount)} biens • {formatNumber(item.saturatedPropertyCount)} quasi satures • {formatNumber(item.visits)} visites
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPressureBadgeColor(item.pressureScore)}`}>
                      tension {item.pressureScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300" style={{ width: `${Math.max(6, Math.min(100, item.saturationRate))}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
                    <p>Saturation {formatPercent(item.saturationRate)}</p>
                    <p>Indispo {formatNumber(item.unavailableDays)} jours</p>
                    <p>Booked {formatNumber(item.bookedDays)} j</p>
                    <p>Pending {formatNumber(item.pendingDays)} j</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Heatmap calendrier par type</h2>
              <p className="text-sm text-slate-500">Lecture rapide des mois critiques, type par type et sous-type par sous-type.</p>
            </div>
            {loading ? <EmptyChart message="Chargement de la heatmap..." /> : saturationHeatmapRows.length === 0 ? (
              <EmptyChart message="Aucune matrice de saturation disponible." />
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[860px]">
                  <div className="grid gap-2" style={{ gridTemplateColumns: `220px repeat(${saturationHeatmapColumns.length}, minmax(74px, 1fr))` }}>
                    <div />
                    {saturationHeatmapColumns.map((column) => (
                      <div key={column.bucket} className="px-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {column.label}
                      </div>
                    ))}
                    {saturationHeatmapRows.map((row) => (
                      <Fragment key={row.key}>
                        <div key={`${row.key}-label`} className="flex items-center pr-3 text-sm font-semibold text-slate-800">
                          {row.label}
                        </div>
                        {row.cells.map((cell) => (
                          <div
                            key={`${row.key}-${cell.bucket}`}
                            className={`rounded-2xl px-2 py-3 text-center text-xs font-semibold shadow-sm ${getHeatmapColor(cell.saturationRate)}`}
                            title={`${row.label} • ${cell.label} • ${formatPercent(cell.saturationRate)} • ${formatNumber(cell.unavailableDays)} jours indisponibles`}
                          >
                            <div>{formatPercent(cell.saturationRate)}</div>
                            <div className="mt-1 text-[10px] opacity-80">{formatNumber(cell.unavailableDays)} j</div>
                          </div>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Periodes les plus indisponibles par type</h2>
              <p className="text-sm text-slate-500">Chaque carte donne une plage precise du premier au dernier jour critique pour chaque type.</p>
            </div>
            <div className="space-y-3">
              {saturationTypePeakRanges.slice(0, 6).map((item) => {
                const range = item.ranges[0];
                if (!range) return null;
                return (
                  <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateRangeLabel(range.startDate, range.endDate)}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPressureBadgeColor(range.avgSaturationRate)}`}>
                        {formatPercent(range.avgSaturationRate)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <span>{formatNumber(range.unavailableDays)} jours indisponibles</span>
                      <span>{formatNumber(range.visits)} visites</span>
                      <span>pic {formatNumber(range.peakUnavailableProperties)} biens indisponibles</span>
                      <span>{formatNumber(item.propertyCount)} biens suivis</span>
                    </div>
                  </div>
                );
              })}
              {saturationTypePeakRanges.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                  Aucune plage continue d indisponibilite detectee sur les types filtres.
                </div>
              ) : null}
            </div>
          </article>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
          <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Carte des biens sous pression</h2>
              <p className="text-sm text-slate-500">Chaque cercle represente un bien. La couleur montre le degre d indisponibilite; sans coordonnee propre, le bien reste ancre sur sa zone.</p>
            </div>
            {loading ? <EmptyChart message="Chargement de la carte..." /> : saturationMapPoints.length === 0 ? (
              <EmptyChart message="Aucune coordonnee exploitable pour afficher la carte des biens." />
            ) : (
              <div className="overflow-hidden rounded-[24px] border border-slate-100">
                <MapContainer center={saturationMapCenter} zoom={10} scrollWheelZoom className="h-[380px] w-full">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {saturationMapPoints.map((point) => (
                    <CircleMarker
                      key={point.key}
                      center={[point.lat, point.lng]}
                      radius={getMapCircleRadius(point.saturationRate, point.pressureScore)}
                      pathOptions={{
                        color: getMapCircleColor(point.saturationRate),
                        fillColor: getMapCircleColor(point.saturationRate),
                        fillOpacity: 0.42,
                        weight: 2,
                      }}
                    >
                      <Popup>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">{point.label}</p>
                          <p className="text-xs text-slate-600">{point.subTypeLabel ? `${point.typeLabel} / ${point.subTypeLabel}` : point.typeLabel}</p>
                          <p className="text-xs text-slate-600">{point.zoneLabel} • precision {point.mapPrecision === 'property' ? 'bien' : 'zone'}</p>
                          <p className="text-xs text-slate-600">Saturation {formatPercent(point.saturationRate)} • tension {point.pressureScore.toFixed(1)}</p>
                          <p className="text-xs text-slate-600">{formatNumber(point.unavailableDays)} jours indisponibles • {formatNumber(point.visits)} visites</p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            )}
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Periodes les plus indisponibles</h2>
              <p className="text-sm text-slate-500">Vue globale par mois pour comparer rapidement le calendrier et le volume de consultation.</p>
            </div>
            <div className="space-y-3">
              {(availabilityPressure?.peakPeriods || []).slice(0, 8).map((item) => (
                <div key={item.bucket} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatNumber(item.unavailableDays)} jours indisponibles • {formatNumber(item.visits)} visites
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPressureBadgeColor(item.saturationRate)}`}>
                      {formatPercent(item.saturationRate)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                    <span>Booked {formatNumber(item.bookedDays)} j</span>
                    <span>Pending {formatNumber(item.pendingDays)} j</span>
                    <span>Blocked {formatNumber(item.blockedDays)} j</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
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
