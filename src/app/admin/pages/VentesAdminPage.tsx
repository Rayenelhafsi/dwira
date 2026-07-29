import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { BadgeDollarSign, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, ExternalLink, Eye, Filter, FolderOpen, Hash, Home, ImageIcon, LandPlot, Layers3, Mail, MapPin, PencilLine, Phone, Plus, RefreshCw, Ruler, Save, UserCheck, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useAuth } from "../../context/AuthContext";
import { useProperties } from "../../context/PropertiesContext";
import { resolveMediaUrl } from "../../utils/media";
import { buildPropertyDetailsPath } from "../../utils/propertyRouting";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type SalesStage =
  | "nouvelle_demande"
  | "a_rappeler"
  | "visite_planifiee"
  | "visite_effectuee"
  | "offre_en_cours"
  | "compromis_signe"
  | "vendu"
  | "perdu";

type SalesDemand = {
  id: string;
  bien_id: string;
  bien_titre?: string | null;
  bien_reference?: string | null;
  bien_type?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  status?: string | null;
  sales_stage?: SalesStage | null;
  sales_last_note?: string | null;
  visit_preferred_date?: string | null;
  visit_time_slot?: string | null;
  visit_confirmed_at?: string | null;
  visit_assigned_admin_id?: string | null;
  visit_assigned_admin_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type DemandDraft = {
  sales_stage: SalesStage;
  visit_preferred_date: string;
  visit_time_slot: string;
  visit_assigned_admin_id: string;
  sales_last_note: string;
};

const SALES_STAGE_OPTIONS: Array<{ value: SalesStage; label: string }> = [
  { value: "nouvelle_demande", label: "Nouvelle demande" },
  { value: "a_rappeler", label: "A rappeler" },
  { value: "visite_planifiee", label: "Visite planifiee" },
  { value: "visite_effectuee", label: "Visite effectuee" },
  { value: "offre_en_cours", label: "Offre en cours" },
  { value: "compromis_signe", label: "Compromis signe" },
  { value: "vendu", label: "Vendu" },
  { value: "perdu", label: "Perdu" },
];

const TIME_SLOT_OPTIONS = ["09:00-11:00", "11:00-13:00", "14:00-16:00", "16:00-18:00", "18:00-20:00"];

function stageLabel(stage?: string | null) {
  return SALES_STAGE_OPTIONS.find((item) => item.value === stage)?.label || "Nouvelle demande";
}

function statusLabel(value?: string | null) {
  return String(value || "").trim().replaceAll("_", " ") || "Sans statut";
}

function dateLabel(value?: string | null) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw || "-";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function isoDate(value?: string | null) {
  return String(value || "").trim().slice(0, 10);
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function shiftMonthKey(monthKey: string, delta: number) {
  const monthDate = parseMonthKey(monthKey);
  monthDate.setMonth(monthDate.getMonth() + delta);
  return monthKeyFromDate(monthDate);
}

function monthLabel(monthKey: string) {
  return parseMonthKey(monthKey).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function buildMonthCalendar(monthKey: string) {
  const monthDate = parseMonthKey(monthKey);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leadingEmpty = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < leadingEmpty; i += 1) cells.push({ date: null, day: null });
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
    });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  return cells;
}

function getInitialDraft(row: SalesDemand): DemandDraft {
  return {
    sales_stage: (row.sales_stage || "nouvelle_demande") as SalesStage,
    visit_preferred_date: String(row.visit_preferred_date || "").slice(0, 10),
    visit_time_slot: String(row.visit_time_slot || ""),
    visit_assigned_admin_id: String(row.visit_assigned_admin_id || ""),
    sales_last_note: String(row.sales_last_note || ""),
  };
}

function buildSalesCreateHref(type: string) {
  return `/admin/biens?createBien=1&mode=vente&type=${encodeURIComponent(type)}&returnTo=${encodeURIComponent("/admin/ventes")}`;
}

function buildSalesEditHref(id: string) {
  return `/admin/biens?editBien=${encodeURIComponent(id)}&returnTo=${encodeURIComponent("/admin/ventes")}`;
}

const CARD_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23e2e8f0'/%3E%3Cpath d='M180 560l210-180 120 108 120-120 210 192H180z' fill='%23cbd5e1'/%3E%3Ccircle cx='360' cy='230' r='48' fill='%23cbd5e1'/%3E%3C/svg%3E";

function formatCurrency(value?: number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Prix sur demande";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} DT`;
}

function getSaleAdminImage(bien: any) {
  const gallery = Array.isArray(bien?.media)
    ? bien.media.filter((item: any) => !String(item?.motif_upload || "").startsWith("preuve_type_"))
    : [];
  return resolveMediaUrl(gallery[0]?.url) || CARD_FALLBACK;
}

function getSaleAdminPrice(bien: any) {
  if (bien?.type === "terrain") {
    if (bien?.terrain_mode_affichage_prix === "m2_uniquement" && Number(bien?.terrain_prix_affiche_par_m2 || 0) > 0) {
      return `${formatCurrency(Number(bien.terrain_prix_affiche_par_m2 || 0))}/m2`;
    }
    return formatCurrency(Number(bien?.terrain_prix_affiche_total || bien?.prix_affiche_client || bien?.prix_final || 0));
  }
  if (bien?.type === "lotissement") {
    return formatCurrency(Number(bien?.lotissement_prix_total || bien?.prix_affiche_client || bien?.prix_final || 0));
  }
  return formatCurrency(Number(bien?.prix_affiche_client || bien?.prix_final || 0));
}

function getSaleAdminSurface(bien: any) {
  if (bien?.type === "terrain") return bien?.terrain_surface_m2 ? `${bien.terrain_surface_m2} m2` : "Surface a definir";
  if (bien?.type === "lotissement") return bien?.lotissement_nb_terrains ? `${bien.lotissement_nb_terrains} lots` : "Lotissement";
  if (bien?.type === "immeuble") return bien?.immeuble_surface_batie_m2 ? `${bien.immeuble_surface_batie_m2} m2` : "Immeuble";
  if (bien?.superficie_m2) return `${bien.superficie_m2} m2`;
  return "Surface a definir";
}

function getSaleAdminMeta(bien: any) {
  if (bien?.type === "terrain") return bien?.terrain_facade_m ? `${bien.terrain_facade_m} m facade` : "Facade a definir";
  if (bien?.type === "lotissement") return bien?.lotissement_nb_terrains ? `${bien.lotissement_nb_terrains} terrains` : "Programme terrain";
  if (bien?.type === "immeuble") return bien?.immeuble_nb_appartements ? `${bien.immeuble_nb_appartements} appartements` : "Immeuble";
  if (Number(bien?.nb_chambres || 0) > 0) return `${bien.nb_chambres} chambres`;
  return bien?.type === "local_commercial" ? "Usage commercial" : "Visite conseillee";
}

function getSaleTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    appartement: "Appartement",
    villa_maison: "Villa / Maison",
    studio: "Studio",
    immeuble: "Immeuble",
    terrain: "Terrain",
    lotissement: "Lotissement",
    local_commercial: "Local commercial",
  };
  return labels[String(type || "").trim()] || "Bien vente";
}

function getSaleTypeIcon(type?: string | null) {
  if (type === "terrain" || type === "lotissement") return LandPlot;
  if (type === "immeuble" || type === "local_commercial") return Building2;
  return Home;
}

export default function VentesAdminPage() {
  const { user } = useAuth();
  const { biens, isLoading: propertiesLoading } = useProperties();
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [demands, setDemands] = useState<SalesDemand[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DemandDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("demandes");
  const [search, setSearch] = useState("");
  const [salesStageFilter, setSalesStageFilter] = useState("");
  const [bienFilter, setBienFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState(() => monthKeyFromDate(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState("");

  const venteBiens = useMemo(
    () => biens.filter((bien) => bien.mode === "vente").sort((a, b) => String(a.reference || "").localeCompare(String(b.reference || ""))),
    [biens]
  );

  const loadDemands = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setReloading(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (salesStageFilter) params.set("sales_stage", salesStageFilter);
      if (bienFilter) params.set("bien_id", bienFilter);
      if (assignedFilter.trim()) params.set("assigned_admin_id", assignedFilter.trim());
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const response = await fetch(`${API_URL}/admin/sales-demands${params.toString() ? `?${params.toString()}` : ""}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(String(payload?.error || "Chargement ventes impossible"));
      const rows = Array.isArray(payload) ? payload : [];
      setDemands(rows);
      setDrafts((current) => {
        const next = { ...current };
        rows.forEach((row: SalesDemand) => {
          if (!next[row.id]) next[row.id] = getInitialDraft(row);
        });
        return next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement ventes impossible");
    } finally {
      setLoading(false);
      setReloading(false);
    }
  };

  useEffect(() => {
    void loadDemands("initial");
  }, []);

  const assignedAdminOptions = useMemo(() => {
    const map = new Map<string, string>();
    demands.forEach((row) => {
      const id = String(row.visit_assigned_admin_id || "").trim();
      if (!id) return;
      map.set(id, String(row.visit_assigned_admin_name || id).trim());
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [demands]);

  const pipeline = useMemo(() => {
    return SALES_STAGE_OPTIONS.map((stage) => ({
      ...stage,
      items: demands.filter((row) => String(row.sales_stage || "nouvelle_demande") === stage.value),
    }));
  }, [demands]);

  const scheduledDemands = useMemo(
    () => demands.filter((row) => String(row.sales_stage || "") === "visite_planifiee").sort((a, b) => String(a.visit_preferred_date || "").localeCompare(String(b.visit_preferred_date || ""))),
    [demands]
  );

  const scheduledByDate = useMemo(() => {
    const map = new Map<string, SalesDemand[]>();
    scheduledDemands.forEach((row) => {
      const key = isoDate(row.visit_preferred_date);
      if (!key) return;
      const bucket = map.get(key) || [];
      bucket.push(row);
      map.set(key, bucket);
    });
    return map;
  }, [scheduledDemands]);

  const calendarCells = useMemo(() => buildMonthCalendar(selectedCalendarMonth), [selectedCalendarMonth]);

  const selectedDayDemands = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return scheduledByDate.get(selectedCalendarDate) || [];
  }, [scheduledByDate, selectedCalendarDate]);

  useEffect(() => {
    if (scheduledDemands.length === 0) {
      setSelectedCalendarDate("");
      return;
    }
    const currentSelected = isoDate(selectedCalendarDate);
    if (currentSelected && scheduledByDate.has(currentSelected)) return;
    const firstScheduledDate = isoDate(scheduledDemands[0]?.visit_preferred_date);
    if (!firstScheduledDate) return;
    setSelectedCalendarDate(firstScheduledDate);
    setSelectedCalendarMonth(firstScheduledDate.slice(0, 7));
  }, [scheduledDemands, scheduledByDate, selectedCalendarDate]);

  const referenceStats = useMemo(() => ({
    total: venteBiens.length,
    visible: venteBiens.filter((bien) => bien.visible_sur_site !== false).length,
    terrains: venteBiens.filter((bien) => bien.type === "terrain").length,
    lotissements: venteBiens.filter((bien) => bien.type === "lotissement").length,
  }), [venteBiens]);

  const updateDraft = (id: string, patch: Partial<DemandDraft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {
          sales_stage: "nouvelle_demande",
          visit_preferred_date: "",
          visit_time_slot: "",
          visit_assigned_admin_id: "",
          sales_last_note: "",
        }),
        ...patch,
      },
    }));
  };

  const saveDemand = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const response = await fetch(`${API_URL}/admin/sales-demands/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Mise a jour impossible"));
      toast.success("Demande vente mise a jour");
      await loadDemands("refresh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setSavingId(null);
    }
  };

  const scheduleDemand = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const response = await fetch(`${API_URL}/admin/sales-demands/${encodeURIComponent(id)}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          visit_preferred_date: draft.visit_preferred_date,
          visit_time_slot: draft.visit_time_slot,
          visit_assigned_admin_id: draft.visit_assigned_admin_id || user?.id || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Planification impossible"));
      toast.success("Visite planifiee");
      await loadDemands("refresh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Planification impossible");
    } finally {
      setSavingId(null);
    }
  };

  const closeDemand = async (id: string, stage: "vendu" | "perdu") => {
    const draft = drafts[id];
    setSavingId(id);
    try {
      const response = await fetch(`${API_URL}/admin/sales-demands/${encodeURIComponent(id)}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sales_stage: stage,
          sales_last_note: draft?.sales_last_note || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Cloture impossible"));
      toast.success(stage === "vendu" ? "Demande marquee vendue" : "Demande marquee perdue");
      await loadDemands("refresh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cloture impossible");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Module ventes</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Pilotage commercial des visites</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            File des demandes de visite, planification des rendez-vous, pipeline commercial et references publiques des biens en vente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={buildSalesCreateHref("appartement")} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            Nouveau bien vente
          </Link>
          <Link to={buildSalesCreateHref("terrain")} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300">
            <Layers3 className="h-4 w-4" />
            Nouveau terrain
          </Link>
          <button
            type="button"
            onClick={() => void loadDemands("refresh")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700"
          >
            <RefreshCw className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(145deg,#ffffff,#f8fafc)] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.05)]">
          <div className="inline-flex rounded-2xl bg-slate-900 p-2 text-white"><FolderOpen className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-semibold text-slate-900">Catalogue vente</p>
          <p className="mt-1 text-sm text-slate-600">Tous les biens visibles et brouillons relies au tunnel commercial.</p>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>References</span><span className="font-semibold text-slate-950">{referenceStats.total}</span></div>
          <div className="mt-2 flex items-center justify-between text-sm text-slate-600"><span>Visibles sur site</span><span className="font-semibold text-slate-950">{referenceStats.visible}</span></div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-[linear-gradient(145deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))] p-5 shadow-[0_18px_36px_rgba(16,185,129,0.08)]">
          <div className="inline-flex rounded-2xl bg-emerald-600 p-2 text-white"><Layers3 className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-semibold text-slate-900">Terrains et lots</p>
          <p className="mt-1 text-sm text-slate-600">Acces rapide a la creation et a l'edition des terrains et lotissements.</p>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>Terrains</span><span className="font-semibold text-slate-950">{referenceStats.terrains}</span></div>
          <div className="mt-2 flex items-center justify-between text-sm text-slate-600"><span>Lotissements</span><span className="font-semibold text-slate-950">{referenceStats.lotissements}</span></div>
        </div>
        <Link to={buildSalesCreateHref("lotissement")} className="rounded-2xl border border-amber-200 bg-[linear-gradient(145deg,rgba(255,251,235,0.96),rgba(255,255,255,0.98))] p-5 shadow-[0_18px_36px_rgba(245,158,11,0.08)] transition hover:translate-y-[-1px]">
          <div className="inline-flex rounded-2xl bg-amber-500 p-2 text-white"><Plus className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-semibold text-slate-900">Creer un lotissement</p>
          <p className="mt-1 text-sm text-slate-600">Ouvre directement l'editeur Biens en mode vente lotissement.</p>
        </Link>
        <Link to="/admin/biens" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_18px_36px_rgba(15,23,42,0.04)] transition hover:translate-y-[-1px]">
          <div className="inline-flex rounded-2xl bg-white p-2 text-slate-700 ring-1 ring-gray-200"><PencilLine className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-semibold text-slate-900">Admin biens complet</p>
          <p className="mt-1 text-sm text-slate-600">Acces integral a l'editeur, aux medias, aux caracteristiques et a la visibilite.</p>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="grid gap-1 text-sm text-gray-700">
          <span className="inline-flex items-center gap-2 font-medium"><Filter className="h-4 w-4" />Recherche</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID demande, client, ref, bien" className="rounded-lg border border-gray-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm text-gray-700">
          <span className="font-medium">Etape</span>
          <select value={salesStageFilter} onChange={(event) => setSalesStageFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2">
            <option value="">Toutes</option>
            {SALES_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-gray-700">
          <span className="font-medium">Bien</span>
          <select value={bienFilter} onChange={(event) => setBienFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2">
            <option value="">Tous</option>
            {venteBiens.map((bien) => <option key={bien.id} value={bien.id}>{bien.reference} - {bien.titre}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-gray-700">
          <span className="font-medium">Commercial</span>
          <select value={assignedFilter} onChange={(event) => setAssignedFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2">
            <option value="">Tous</option>
            {assignedAdminOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-gray-700">
          <span className="font-medium">Date debut</span>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm text-gray-700">
          <span className="font-medium">Date fin</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void loadDemands("refresh")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Appliquer</button>
        <button type="button" onClick={() => {
          setSearch("");
          setSalesStageFilter("");
          setBienFilter("");
          setAssignedFilter("");
          setDateFrom("");
          setDateTo("");
          void loadDemands("refresh");
        }} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Reinitialiser</button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-700"><ClipboardList className="h-5 w-5" /></div>
          <p className="mt-3 text-sm text-gray-500">Demandes</p>
          <p className="text-2xl font-bold text-gray-900">{demands.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="inline-flex rounded-lg bg-amber-50 p-2 text-amber-700"><CalendarDays className="h-5 w-5" /></div>
          <p className="mt-3 text-sm text-gray-500">Visites planifiees</p>
          <p className="text-2xl font-bold text-gray-900">{scheduledDemands.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="inline-flex rounded-lg bg-sky-50 p-2 text-sky-700"><BadgeDollarSign className="h-5 w-5" /></div>
          <p className="mt-3 text-sm text-gray-500">Offres / compromis</p>
          <p className="text-2xl font-bold text-gray-900">{demands.filter((row) => ["offre_en_cours", "compromis_signe"].includes(String(row.sales_stage || ""))).length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="inline-flex rounded-lg bg-rose-50 p-2 text-rose-700"><UserCheck className="h-5 w-5" /></div>
          <p className="mt-3 text-sm text-gray-500">Assignes</p>
          <p className="text-2xl font-bold text-gray-900">{assignedAdminOptions.length}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto grid-cols-2 gap-2 bg-transparent p-0 md:grid-cols-4">
          <TabsTrigger value="demandes" className="rounded-lg border border-gray-200 bg-white px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-50">Demandes</TabsTrigger>
          <TabsTrigger value="calendrier" className="rounded-lg border border-gray-200 bg-white px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-50">Calendrier / RDV</TabsTrigger>
          <TabsTrigger value="pipeline" className="rounded-lg border border-gray-200 bg-white px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-50">Pipeline</TabsTrigger>
          <TabsTrigger value="references" className="rounded-lg border border-gray-200 bg-white px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-50">References</TabsTrigger>
        </TabsList>

        <TabsContent value="demandes" className="mt-6 space-y-4">
          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Chargement des demandes ventes...</div>
          ) : demands.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Aucune demande vente.</div>
          ) : (
            demands.map((row) => {
              const draft = drafts[row.id] || getInitialDraft(row);
              return (
                <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                          <Hash className="h-3.5 w-3.5" />
                          Demande #{row.id}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{row.bien_reference || row.bien_id}</span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{stageLabel(row.sales_stage)}</span>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{statusLabel(row.status)}</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{row.bien_titre || "Bien vente"}</h3>
                      <div className="grid gap-1 text-sm text-gray-600 md:grid-cols-2">
                        <p><span className="font-medium text-gray-900">Client:</span> {row.client_name || "-"}</p>
                        <p><span className="font-medium text-gray-900">Email:</span> {row.client_email || "-"}</p>
                        <p><span className="font-medium text-gray-900">Telephone:</span> {row.client_phone || "-"}</p>
                        <p><span className="font-medium text-gray-900">Creee le:</span> {dateLabel(row.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => updateDraft(row.id, { visit_assigned_admin_id: String(user?.id || "") })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-emerald-300 hover:text-emerald-700">M'affecter</button>
                      <button type="button" onClick={() => void closeDemand(row.id, "vendu")} disabled={savingId === row.id} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Marquer vendu</button>
                      <button type="button" onClick={() => void closeDemand(row.id, "perdu")} disabled={savingId === row.id} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">Marquer perdu</button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-5">
                    <label className="grid gap-1 text-sm text-gray-700">
                      <span className="font-medium">Etape</span>
                      <select value={draft.sales_stage} onChange={(event) => updateDraft(row.id, { sales_stage: event.target.value as SalesStage })} className="rounded-lg border border-gray-200 px-3 py-2">
                        {SALES_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm text-gray-700">
                      <span className="font-medium">Date visite</span>
                      <input type="date" value={draft.visit_preferred_date} onChange={(event) => updateDraft(row.id, { visit_preferred_date: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2" />
                    </label>
                    <label className="grid gap-1 text-sm text-gray-700">
                      <span className="font-medium">Creneau</span>
                      <select value={draft.visit_time_slot} onChange={(event) => updateDraft(row.id, { visit_time_slot: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2">
                        <option value="">Choisir</option>
                        {TIME_SLOT_OPTIONS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm text-gray-700">
                      <span className="font-medium">Commercial (id)</span>
                      <input value={draft.visit_assigned_admin_id} onChange={(event) => updateDraft(row.id, { visit_assigned_admin_id: event.target.value })} placeholder={row.visit_assigned_admin_name || "Affectation"} className="rounded-lg border border-gray-200 px-3 py-2" />
                    </label>
                    <div className="grid gap-2 self-end">
                      <button type="button" onClick={() => void saveDemand(row.id)} disabled={savingId === row.id} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60">
                        <Save className="h-4 w-4" />
                        Sauvegarder
                      </button>
                      <button type="button" onClick={() => void scheduleDemand(row.id)} disabled={savingId === row.id} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                        <CalendarDays className="h-4 w-4" />
                        Planifier
                      </button>
                    </div>
                  </div>

                  <label className="mt-3 grid gap-1 text-sm text-gray-700">
                    <span className="font-medium">Note commerciale</span>
                    <textarea value={draft.sales_last_note} onChange={(event) => updateDraft(row.id, { sales_last_note: event.target.value })} rows={3} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Compte-rendu, besoin client, suivi..." />
                  </label>
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="calendrier" className="mt-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedCalendarMonth((current) => shiftMonthKey(current, -1))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Calendrier des visites</p>
                  <h3 className="mt-1 text-xl font-bold capitalize text-slate-950">{monthLabel(selectedCalendarMonth)}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCalendarMonth((current) => shiftMonthKey(current, 1))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
                  <div key={label} className="py-2">{label}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarCells.map((cell, index) => {
                  if (!cell.date || !cell.day) {
                    return <div key={`empty-${index}`} className="aspect-square rounded-2xl bg-slate-50/60" />;
                  }
                  const dayVisits = scheduledByDate.get(cell.date) || [];
                  const isSelected = cell.date === selectedCalendarDate;
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => setSelectedCalendarDate(cell.date || "")}
                      className={`relative aspect-square rounded-2xl border p-2 text-left transition ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-600 text-white shadow-[0_14px_30px_rgba(16,185,129,0.2)]"
                          : dayVisits.length > 0
                            ? "border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-300"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${isSelected ? "text-white" : "text-current"}`}>{cell.day}</span>
                      {dayVisits.length > 0 ? (
                        <span className={`absolute bottom-2 left-2 inline-flex min-w-7 items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold ${
                          isSelected ? "bg-white/18 text-white" : "bg-emerald-600 text-white"
                        }`}>
                          {dayVisits.length}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Jour selectionne</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950">
                    {selectedCalendarDate ? dateLabel(selectedCalendarDate) : "Aucune date"}
                  </h3>
                </div>
                {selectedCalendarDate ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {(selectedDayDemands || []).length} visite{selectedDayDemands.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>

              <div className="mt-4">
            {scheduledDemands.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune visite planifiee.</p>
              ) : selectedDayDemands.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune visite pour cette date.</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayDemands.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                          <Hash className="h-3.5 w-3.5" />
                          Demande #{row.id}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                          {row.bien_reference || row.bien_id}
                        </span>
                      </div>
                      <p className="mt-3 text-base font-bold text-slate-950">{row.bien_titre || "Bien vente"}</p>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600">
                        <p className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-600" />{row.visit_time_slot || "Creneau a confirmer"}</p>
                        <p className="inline-flex items-center gap-2"><UserCheck className="h-4 w-4 text-emerald-600" />{row.client_name || "Client"}</p>
                        <p className="inline-flex items-center gap-2"><Phone className="h-4 w-4 text-sky-600" />{row.client_phone || "-"}</p>
                        <p className="inline-flex items-center gap-2"><Mail className="h-4 w-4 text-violet-600" />{row.client_email || "-"}</p>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Commercial: {row.visit_assigned_admin_name || row.visit_assigned_admin_id || "Non affecte"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-6">
          <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-8">
            {pipeline.map((column) => (
              <div key={column.value} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{column.label}</h3>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{column.items.length}</span>
                </div>
                <div className="mt-3 space-y-3">
                  {column.items.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucune demande</p>
                  ) : (
                    column.items.map((row) => (
                      <div key={row.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{row.bien_reference || row.bien_id}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">#{row.id}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-600">{row.client_name || row.client_email || "Client"}</p>
                        <p className="mt-1 text-xs text-gray-500">{row.visit_preferred_date ? dateLabel(row.visit_preferred_date) : "Date non planifiee"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="references" className="mt-6">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Link to={buildSalesCreateHref("appartement")} className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Creation</p>
                <p className="mt-2 text-base font-semibold text-gray-900">Bien vente standard</p>
                <p className="mt-1 text-sm text-gray-600">Appartement, villa, studio ou local commercial.</p>
              </Link>
              <Link to={buildSalesCreateHref("terrain")} className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Creation</p>
                <p className="mt-2 text-base font-semibold text-gray-900">Terrain</p>
                <p className="mt-1 text-sm text-gray-600">Surface, facade, documents, viabilisation et prix au m2.</p>
              </Link>
              <Link to={buildSalesCreateHref("lotissement")} className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Creation</p>
                <p className="mt-2 text-base font-semibold text-gray-900">Lotissement</p>
                <p className="mt-1 text-sm text-gray-600">Lots, paliers de prix et galerie par terrain.</p>
              </Link>
            </div>
            {propertiesLoading ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Chargement des biens vente...</div>
            ) : venteBiens.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Aucun bien vente pour le moment.</div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                {venteBiens.map((bien) => {
                  const TypeIcon = getSaleTypeIcon(bien.type);
                  const mediaCount = Array.isArray(bien.media)
                    ? bien.media.filter((item: any) => !String(item?.motif_upload || "").startsWith("preuve_type_")).length
                    : 0;
                  return (
                    <article
                      key={bien.id}
                      className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_28px_60px_rgba(15,23,42,0.12)]"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-slate-200">
                        <img
                          src={getSaleAdminImage(bien)}
                          alt={String(bien.titre || bien.reference || "Bien vente")}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/78 via-slate-950/18 to-transparent" />
                        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                          <div className="flex flex-wrap gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                              bien.statut === "disponible" ? "bg-emerald-100/95 text-emerald-900" : "bg-white/90 text-slate-800"
                            }`}>
                              {bien.statut === "disponible" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              {String(bien.statut || "brouillon")}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-800">
                              <TypeIcon className="h-3.5 w-3.5" />
                              {getSaleTypeLabel(bien.type)}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                            <ImageIcon className="h-3.5 w-3.5" />
                            {mediaCount}
                          </span>
                        </div>
                        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-3xl font-black tracking-tight text-white">{getSaleAdminPrice(bien)}</p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
                              {bien.reference || bien.id}
                            </p>
                          </div>
                          {bien.visible_sur_site !== false ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/95 px-3 py-1 text-xs font-semibold text-emerald-900">
                              <Eye className="h-3.5 w-3.5" />
                              En ligne
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100/95 px-3 py-1 text-xs font-semibold text-rose-900">
                              <XCircle className="h-3.5 w-3.5" />
                              Hors ligne
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-5 p-5">
                        <div className="space-y-2">
                          <h3 className="text-xl font-bold tracking-tight text-slate-950">{bien.titre || "Bien vente"}</h3>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-4 w-4 text-emerald-600" />
                              {bien.zone || "Zone a definir"}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Ruler className="h-4 w-4 text-sky-600" />
                              {getSaleAdminSurface(bien)}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reference</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">{bien.reference || bien.id}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Meta</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">{getSaleAdminMeta(bien)}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Paiement</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">
                              {bien.modalite_paiement_vente === "facilite" ? "Facilite" : "Comptant"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                          <Link
                            to={buildPropertyDetailsPath(bien as any)}
                            target="_blank"
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Voir le site
                          </Link>
                          <Link
                            to={buildSalesEditHref(String(bien.id || ""))}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
                          >
                            <PencilLine className="h-4 w-4" />
                            Gerer le bien
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
