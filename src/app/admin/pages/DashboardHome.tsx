import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CreditCard, FileText, Hotel, LoaderCircle, MessageSquarePlus, RefreshCw, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useAuth } from "../../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "/api";
type ReservationCategoryFilter = {
  completed: boolean;
  pendingPayment: boolean;
  rejected: boolean;
};

type DiscussionEntry = {
  id: string;
  note: string;
  created_at?: string | null;
  created_by_admin_name?: string | null;
};

type ReservationDashboardItem = {
  entity_type: "contract" | "reservation_demand" | "amicale_gross" | "hotel_reservation";
  entity_id: string;
  source_label: string;
  title: string;
  reference?: string | null;
  owner_name?: string | null;
  tenant_name?: string | null;
  amicale_name?: string | null;
  status?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  owner_amount_paid?: number | null;
  owner_total_amount?: number | null;
  total_amount?: number | null;
  profit_net?: number | null;
  admin_note?: string | null;
  bien_id?: string | null;
  amicale_id?: string | null;
  agent_note?: string | null;
  contract_url?: string | null;
  owner_contract_url?: string | null;
  voucher_url?: string | null;
  receipt_urls?: string[];
};

type DateFilterMode = "precise" | "period";
type DateFieldFilter = {
  checkIn: boolean;
  checkOut: boolean;
};

function formatMoney(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(numeric)} DT`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseDate(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesTextFilter(value: unknown, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  return normalizeText(value).includes(normalizedQuery);
}

function resolveExistingOwnerAmount(item: ReservationDashboardItem) {
  const ownerPaid = Number(item.owner_amount_paid);
  if (Number.isFinite(ownerPaid)) return ownerPaid;
  const ownerTotal = Number(item.owner_total_amount);
  if (Number.isFinite(ownerTotal)) return ownerTotal;
  return null;
}

function matchesDateFilter(
  item: ReservationDashboardItem,
  mode: DateFilterMode,
  preciseDate: string,
  periodStart: string,
  periodEnd: string,
  fields: DateFieldFilter
) {
  const checkIn = parseDate(item.check_in);
  const checkOut = parseDate(item.check_out);
  const includeCheckIn = fields.checkIn;
  const includeCheckOut = fields.checkOut;
  if (!includeCheckIn && !includeCheckOut) return true;
  if (mode === "precise") {
    if (!preciseDate) return true;
    const target = parseDate(preciseDate);
    if (!target) return true;
    const targetValue = target.getTime();
    return Boolean(
      (includeCheckIn && checkIn && checkIn.getTime() === targetValue)
      || (includeCheckOut && checkOut && checkOut.getTime() === targetValue)
    );
  }
  if (!periodStart || !periodEnd) return true;
  const start = parseDate(periodStart);
  const end = parseDate(periodEnd);
  if (!start || !end) return true;
  const startValue = start.getTime();
  const endValue = end.getTime();
  const matchesCheckIn = includeCheckIn && checkIn ? checkIn.getTime() >= startValue && checkIn.getTime() <= endValue : false;
  const matchesCheckOut = includeCheckOut && checkOut ? checkOut.getTime() >= startValue && checkOut.getTime() <= endValue : false;
  return matchesCheckIn || matchesCheckOut;
}

function statusLabel(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Sans statut";
  return normalized.replaceAll("_", " ");
}

function statusTone(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("rejete") || normalized.includes("annule")) return "bg-rose-100 text-rose-700";
  if (normalized.includes("succes") || normalized.includes("actif") || normalized.includes("soumise")) return "bg-emerald-100 text-emerald-700";
  if (normalized.includes("voucher") || normalized.includes("contrat")) return "bg-indigo-100 text-indigo-700";
  return "bg-amber-100 text-amber-700";
}

function matchesCategoryFilter(item: ReservationDashboardItem, filters: ReservationCategoryFilter) {
  if (!filters.completed && !filters.pendingPayment && !filters.rejected) return true;
  const status = String(item.status || "").trim().toLowerCase();
  const isRejected = status.includes("rejete") || status.includes("annule") || status.includes("resilie");
  const isPendingPayment = [
    "client_procede_vers_paiement_en_cours",
    "demande_recu_paiement",
    "recu_paiement_envoye",
    "en_attente_reponse_proprietaire",
    "reponse_positive_attente_confirmation_client",
  ].includes(status);
  const isCompleted = !isRejected && !isPendingPayment && (
    ["actif", "termine", "contrat_realise", "succes_paiement", "voucher_en_cours", "voucher_envoye", "soumise"].includes(status)
  );
  return (filters.completed && isCompleted)
    || (filters.pendingPayment && isPendingPayment)
    || (filters.rejected && isRejected);
}

function resolveAssetUrl(url?: string | null) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${window.location.origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

export default function DashboardHome() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === "admin" && user?.adminType === "superadmin";
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "reservations">(isSuperadmin ? "reservations" : "overview");
  const [items, setItems] = useState<ReservationDashboardItem[]>([]);
  const [globalDiscussions, setGlobalDiscussions] = useState<DiscussionEntry[]>([]);
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("precise");
  const [dateFieldFilter, setDateFieldFilter] = useState<DateFieldFilter>({ checkIn: true, checkOut: true });
  const [categoryFilter, setCategoryFilter] = useState<ReservationCategoryFilter>({ completed: false, pendingPayment: false, rejected: false });
  const [preciseDate, setPreciseDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [referenceFilter, setReferenceFilter] = useState("");
  const [ownerDrafts, setOwnerDrafts] = useState<Record<string, string>>({});
  const [globalDiscussionDraft, setGlobalDiscussionDraft] = useState("");
  const [savingOwnerKey, setSavingOwnerKey] = useState<string | null>(null);
  const [savingGlobalDiscussion, setSavingGlobalDiscussion] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/admin/dashboard-reservations`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.error || "Chargement dashboard impossible"));
      }
      const data = await response.json();
      setItems(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
      setGlobalDiscussions(Array.isArray(data?.globalDiscussions) ? data.globalDiscussions : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement dashboard impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const filteredItems = useMemo(() => (
    items
      .filter((item) => matchesDateFilter(item, dateFilterMode, preciseDate, periodStart, periodEnd, dateFieldFilter))
      .filter((item) => matchesCategoryFilter(item, categoryFilter))
      .filter((item) => matchesTextFilter(item.reference, referenceFilter))
      .filter((item) => matchesTextFilter(item.owner_name, ownerFilter))
      .filter((item) => matchesTextFilter(item.tenant_name, tenantFilter))
      .sort((left, right) => String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")))
  ), [items, dateFilterMode, preciseDate, periodStart, periodEnd, dateFieldFilter, categoryFilter, referenceFilter, ownerFilter, tenantFilter]);

  const totalOwnerPaid = useMemo(
    () => filteredItems.reduce((sum, item) => {
      const value = resolveExistingOwnerAmount(item);
      return sum + (value === null ? 0 : value);
    }, 0),
    [filteredItems]
  );

  const overviewStats = useMemo(() => {
    const contractsCount = items.filter((item) => item.entity_type === "contract").length;
    const reservationsCount = items.length;
    const hotelCount = items.filter((item) => item.entity_type === "hotel_reservation").length;
    const totalRevenue = items.reduce((sum, item) => sum + (Number.isFinite(Number(item.total_amount)) ? Number(item.total_amount) : 0), 0);
    return { contractsCount, reservationsCount, hotelCount, totalRevenue };
  }, [items]);

  const toggleDateField = (field: keyof DateFieldFilter) => {
    setDateFieldFilter((current) => ({ ...current, [field]: !current[field] }));
  };

  const toggleCategoryFilter = (field: keyof ReservationCategoryFilter) => {
    setCategoryFilter((current) => ({ ...current, [field]: !current[field] }));
  };

  const getOwnerDraft = (item: ReservationDashboardItem) => {
    const key = `${item.entity_type}:${item.entity_id}`;
    if (ownerDrafts[key] !== undefined) return ownerDrafts[key];
    const existingAmount = resolveExistingOwnerAmount(item);
    return existingAmount === null ? "" : String(existingAmount);
  };

  const handleOwnerDraftChange = (item: ReservationDashboardItem, value: string) => {
    const key = `${item.entity_type}:${item.entity_id}`;
    setOwnerDrafts((current) => ({ ...current, [key]: value }));
  };

  const handleSaveOwnerAmount = async (item: ReservationDashboardItem) => {
    const key = `${item.entity_type}:${item.entity_id}`;
    const rawValue = String(getOwnerDraft(item) || "").trim().replace(",", ".");
    const parsed = rawValue ? Number(rawValue) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error("Montant proprietaire invalide");
      return;
    }
    setSavingOwnerKey(key);
    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};
      if (item.entity_type === "contract") {
        endpoint = `${API_URL}/contrats/${encodeURIComponent(item.entity_id)}`;
        body = { montant_donne_proprietaire: parsed };
      } else if (item.entity_type === "reservation_demand") {
        endpoint = `${API_URL}/reservation-demands/${encodeURIComponent(item.entity_id)}`;
        body = { montant_donne_proprietaire: parsed };
      } else if (item.entity_type === "hotel_reservation") {
        endpoint = `${API_URL}/hotel-reservation-demands/${encodeURIComponent(item.entity_id)}`;
        body = { montant_donne_proprietaire: parsed };
      } else {
        endpoint = `${API_URL}/admin/amicale-gross-entries/${encodeURIComponent(item.entity_id)}`;
        body = {
          amicaleId: item.amicale_id,
          amicaleName: item.amicale_name || item.tenant_name || "",
          bienId: item.bien_id,
          bienReference: item.reference || "",
          bienTitle: item.title,
          arrivalDate: item.check_in,
          departureDate: item.check_out,
          ownerAdvanceAmount: parsed ?? 0,
          rentalTotalAmount: item.total_amount ?? 0,
          internalNote: item.admin_note || "Suivi dashboard reservation",
          agentNote: item.agent_note || "",
          benefitAmount: item.profit_net ?? 0,
        };
      }
      const response = await fetch(endpoint, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.error || "Sauvegarde impossible"));
      }
      setItems((current) => current.map((entry) => (
        entry.entity_type === item.entity_type && entry.entity_id === item.entity_id
          ? { ...entry, owner_amount_paid: parsed, owner_total_amount: item.entity_type === "amicale_gross" ? parsed : entry.owner_total_amount }
          : entry
      )));
      toast.success("Montant proprietaire enregistre");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sauvegarde impossible");
    } finally {
      setSavingOwnerKey(key);
    }
  };

  const handleSaveGlobalDiscussion = async () => {
    const note = String(globalDiscussionDraft || "").trim();
    if (!note) {
      toast.error("Ajoutez une note avant d enregistrer la derniere discussion");
      return;
    }
    setSavingGlobalDiscussion(true);
    try {
      const response = await fetch(`${API_URL}/admin/dashboard-reservations/dashboard_global/reservations_dashboard/discussions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.error || "Enregistrement discussion impossible"));
      }
      const created = await response.json();
      setGlobalDiscussions((current) => [...current, created]);
      setGlobalDiscussionDraft("");
      toast.success("Derniere discussion globale ajoutee a l historique");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement discussion impossible");
    } finally {
      setSavingGlobalDiscussion(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-sm text-gray-500">
            {isSuperadmin ? "Vue super admin avec suivi unifie des reservations." : "Vue admin des reservations et indicateurs."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Recharger
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "overview" | "reservations")} className="gap-4">
        <TabsList className="w-full justify-start md:w-auto">
          <TabsTrigger value="overview">Apercu</TabsTrigger>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={FileText} label="Contrats" value={String(overviewStats.contractsCount)} tone="emerald" />
            <StatCard icon={Users} label="Reservations total" value={String(overviewStats.reservationsCount)} tone="blue" />
            <StatCard icon={Hotel} label="Reservations hotels" value={String(overviewStats.hotelCount)} tone="amber" />
            <StatCard icon={CreditCard} label="Montant total" value={formatMoney(overviewStats.totalRevenue)} tone="slate" />
          </div>
        </TabsContent>

        <TabsContent value="reservations" className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <p className="mb-2 text-sm font-semibold text-gray-800">Filtre date</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDateFilterMode("precise")}
                    className={`rounded-lg px-3 py-2 text-sm ${dateFilterMode === "precise" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700"}`}
                  >
                    Date precise
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterMode("period")}
                    className={`rounded-lg px-3 py-2 text-sm ${dateFilterMode === "period" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700"}`}
                  >
                    Periode
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleDateField("checkIn")}
                    className={`rounded-lg px-3 py-2 text-sm ${dateFieldFilter.checkIn ? "bg-sky-600 text-white" : "bg-gray-100 text-gray-700"}`}
                  >
                    Check-in
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleDateField("checkOut")}
                    className={`rounded-lg px-3 py-2 text-sm ${dateFieldFilter.checkOut ? "bg-sky-600 text-white" : "bg-gray-100 text-gray-700"}`}
                  >
                    Check-out
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCategoryFilter("completed")}
                    className={`rounded-lg px-3 py-2 text-sm ${categoryFilter.completed ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}
                  >
                    Contrats realises
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCategoryFilter("pendingPayment")}
                    className={`rounded-lg px-3 py-2 text-sm ${categoryFilter.pendingPayment ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}
                  >
                    En attente paiement
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCategoryFilter("rejected")}
                    className={`rounded-lg px-3 py-2 text-sm ${categoryFilter.rejected ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}
                  >
                    Contrats rejetes
                  </button>
                </div>
                {dateFilterMode === "precise" ? (
                  <input
                    type="date"
                    value={preciseDate}
                    onChange={(event) => setPreciseDate(event.target.value)}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="date"
                      value={periodStart}
                      onChange={(event) => setPeriodStart(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      value={periodEnd}
                      onChange={(event) => setPeriodEnd(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-800">Reference bien</span>
                <input
                  type="text"
                  value={referenceFilter}
                  onChange={(event) => setReferenceFilter(event.target.value)}
                  placeholder="Filtrer par reference"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-800">Nom proprietaire</span>
                <input
                  type="text"
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value)}
                  placeholder="Filtrer par proprietaire"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-800">Nom locataire</span>
                <input
                  type="text"
                  value={tenantFilter}
                  onChange={(event) => setTenantFilter(event.target.value)}
                  placeholder="Filtrer par locataire"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-900">Total donne au proprietaire</p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{formatMoney(totalOwnerPaid)}</p>
                <p className="mt-1 text-xs text-emerald-700">{filteredItems.length} cards filtrees</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4 text-slate-600" />
                <p className="text-sm font-semibold text-gray-900">Derniere discussion globale</p>
              </div>
              <p className="mt-1 text-xs text-gray-500">Note commune de l equipe pour la date du jour et le discours de finalisation.</p>
              <textarea
                rows={3}
                value={globalDiscussionDraft}
                onChange={(event) => setGlobalDiscussionDraft(event.target.value)}
                placeholder="Saisir la note globale du jour..."
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleSaveGlobalDiscussion()}
                disabled={savingGlobalDiscussion}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {savingGlobalDiscussion ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
                Enregistrer la discussion globale
              </button>

              <div className="mt-4 space-y-2">
                {globalDiscussions.length === 0 ? (
                  <p className="text-xs text-gray-500">Aucun historique global de discussion.</p>
                ) : [...globalDiscussions].slice(-5).reverse().map((discussion) => (
                  <div key={discussion.id} className="rounded-lg bg-white px-3 py-2">
                    <p className="text-xs font-medium text-gray-600">
                      {formatDate(discussion.created_at)}{discussion.created_by_admin_name ? ` • ${discussion.created_by_admin_name}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{discussion.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
              Aucune reservation pour les filtres selectionnes.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {filteredItems.map((item) => {
                const itemKey = `${item.entity_type}:${item.entity_id}`;
                return (
                  <article key={itemKey} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{item.source_label}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
                        </div>
                        <h2 className="mt-3 text-lg font-semibold text-gray-900">{item.title || "Reservation"}</h2>
                        <p className="mt-1 text-sm text-gray-500">
                          {[item.reference, item.amicale_name].filter(Boolean).join(" • ") || "Sans reference"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-3 py-2 text-right">
                        <p className="text-xs text-gray-500">Montant total</p>
                        <p className="text-sm font-semibold text-gray-900">{formatMoney(item.total_amount)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <InfoRow icon={CalendarDays} label="Check-in" value={formatDate(item.check_in)} />
                      <InfoRow icon={CalendarDays} label="Check-out" value={formatDate(item.check_out)} />
                      <InfoRow icon={Users} label="Proprietaire" value={item.owner_name || "-"} />
                      <InfoRow icon={Users} label="Locataire" value={item.tenant_name || "-"} />
                    </div>

                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-emerald-800">Montant donne au proprietaire</span>
                          <input
                            type="text"
                            value={getOwnerDraft(item)}
                            onChange={(event) => handleOwnerDraftChange(item, event.target.value)}
                            placeholder="0"
                            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleSaveOwnerAmount(item)}
                          disabled={savingOwnerKey === itemKey}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {savingOwnerKey === itemKey ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Enregistrer
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.contract_url ? (
                        <a
                          href={resolveAssetUrl(item.contract_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
                        >
                          Voir contrat
                        </a>
                      ) : null}
                      {item.voucher_url ? (
                        <a
                          href={resolveAssetUrl(item.voucher_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                        >
                          Voir voucher
                        </a>
                      ) : null}
                      {(item.receipt_urls || []).map((receiptUrl, index) => (
                        <a
                          key={`${itemKey}-receipt-${index}`}
                          href={resolveAssetUrl(receiptUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          {index === 0 ? "Voir recus" : `Recu ${index + 1}`}
                        </a>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  tone: "emerald" | "blue" | "amber" | "slate";
}) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <span className={`rounded-xl p-3 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm text-gray-900">{value}</p>
    </div>
  );
}
