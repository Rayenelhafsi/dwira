import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Construction,
  Droplets,
  ExternalLink,
  FileText,
  Hammer,
  MapPinned,
  Paintbrush,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { buildApiUrl } from "../../utils/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

type AdminAccount = {
  id: string;
  nom: string;
  email: string;
  admin_type: "superadmin" | "subadmin";
  actif: boolean | number;
};

type AssignmentRow = {
  id: string;
  contract_id: string;
  subadmin_admin_id: string;
  subadmin_name?: string | null;
  urgent: boolean;
  status?: "active" | "in_progress" | "done";
  note?: string | null;
  bien_reference?: string | null;
  bien_titre?: string | null;
  google_maps_url?: string | null;
  property_url?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  arrival_time?: string | null;
  departure_time?: string | null;
  url_pdf?: string | null;
  proprietaire_nom?: string | null;
  proprietaire_telephone?: string | null;
  montant_total_contrat?: number | null;
  montant_avance?: number | null;
  montant_a_encaisser?: number | null;
  montant_donne_proprietaire?: number | null;
  montant_total_proprietaire?: number | null;
  reste_a_donner_proprietaire?: number | null;
  resolved_template_vars?: Record<string, string> | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ReservationDemandRow = {
  id: string;
  status?: string | null;
  contract_id?: string | null;
  pricing_amicale_id?: string | null;
  amicale_name?: string | null;
  bien_id?: string | null;
  bien_reference?: string | null;
  bien_titre?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  total_amount?: number | string | null;
  amount_due_now?: number | string | null;
  voucher_url?: string | null;
  voucher_generated_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type HotelReservationDemandRow = {
  id: string;
  status?: string | null;
  pricing_amicale_id?: string | null;
  amicale_name?: string | null;
  hotel_id?: string | null;
  hotel_name?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  total_price?: number | string | null;
  amount_due_now?: number | string | null;
  voucher_url?: string | null;
  voucher_generated_at?: string | null;
  adults?: number | string | null;
  child_ages?: unknown;
  hotel_context?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AmicaleAssignmentRow = {
  id: string;
  demand_id: string;
  contract_id?: string | null;
  source_kind: "property" | "hotel";
  status?: string | null;
  amicale_name?: string | null;
  bien_id?: string | null;
  bien_reference?: string | null;
  bien_titre?: string | null;
  property_url?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  total_amount?: number | null;
  amount_due_now?: number | null;
  voucher_url?: string | null;
  voucher_generated_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TaskRow = {
  id: string;
  subadmin_admin_id: string;
  subadmin_name?: string | null;
  bien_id?: string | null;
  bien_reference?: string | null;
  bien_titre?: string | null;
  property_url?: string | null;
  title: string;
  note?: string | null;
  urgent: boolean;
  status: "open" | "done";
  completed_at?: string | null;
};

type ChargeRow = {
  id: string;
  subadmin_admin_id: string;
  subadmin_name?: string | null;
  note: string;
  image_url?: string | null;
  created_at: string;
};

type TechnicianRow = {
  id: string;
  subadmin_admin_id?: string | null;
  subadmin_name?: string | null;
  specialty: string;
  first_name: string;
  last_name: string;
  phone: string;
  notes?: string | null;
  mobile_access_enabled?: boolean;
  last_login_at?: string | null;
};

type TechnicianAssignmentRow = {
  id: string;
  technician_id: string;
  technician_name?: string | null;
  technician_phone?: string | null;
  specialty?: string | null;
  subadmin_admin_id?: string | null;
  bien_id: string;
  contract_id?: string | null;
  reservation_demand_id?: string | null;
  assignment_event_type?: "arrivee" | "depart" | null;
  bien_reference?: string | null;
  bien_titre?: string | null;
  property_url?: string | null;
  google_maps_url?: string | null;
  client_name?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  arrival_time?: string | null;
  departure_time?: string | null;
  note?: string | null;
  status: "active" | "done";
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  gallery_urls?: string[];
};

type ContractOption = {
  id: string;
  bien_id?: string | null;
  reservation_demand_id?: string | null;
  bien_titre?: string;
  bien_reference?: string;
  locataire_nom?: string;
  created_at?: string;
  date_debut?: string | null;
  date_fin?: string | null;
  reservation_payment_mode?: string | null;
  pricing_amicale_id?: string | null;
  amicale_name?: string | null;
};

type ContractAutofill = {
  contract_id: string;
  bien_id?: string | null;
  bien_reference?: string | null;
  bien_titre?: string | null;
  property_url?: string | null;
  google_maps_url?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  proprietaire_nom?: string | null;
  proprietaire_telephone?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  arrival_time?: string | null;
  departure_time?: string | null;
  payment_reference?: string | null;
  url_pdf?: string | null;
  owner_url_pdf?: string | null;
  montant_total_contrat?: number | null;
  montant_avance?: number | null;
  montant_a_encaisser?: number | null;
  montant_donne_proprietaire?: number | null;
  montant_total_proprietaire?: number | null;
  reste_a_donner_proprietaire?: number | null;
  resolved_template_vars?: Record<string, string> | null;
};

type BienOption = {
  id: string;
  reference?: string;
  titre?: string;
};

type PushDispatchResult = {
  sent?: number;
  noTokens?: boolean;
  disabled?: boolean;
};

type PanelTab = "assignments" | "tasks" | "technicians" | "charges";

type PickerVariant = "contract" | "bien";

type PickerOption = {
  id: string;
  selectValue?: string;
  sourceBienId?: string;
  contractId?: string;
  reservationDemandId?: string;
  hotelReservationDemandId?: string;
  sourceKind?: "property" | "hotel";
  assignmentEventType?: "arrivee" | "depart";
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: "emerald" | "sky" | "slate";
  sortDate?: string;
  sortFallback?: string;
  metaBadges?: Array<{
    label: string;
    tone?: "emerald" | "sky" | "amber" | "slate";
  }>;
  note?: string;
  noteTone?: "emerald" | "sky" | "slate";
  highlight?: "default" | "amicale";
  disabled?: boolean;
};

const RESERVATION_DEMAND_PICKER_PREFIX = "reservation-demand:";
const HOTEL_RESERVATION_DEMAND_PICKER_PREFIX = "hotel-reservation-demand:";
const TECHNICIAN_CONTRACT_PICKER_PREFIX = "technician-contract:";
const TECHNICIAN_DEMAND_PICKER_PREFIX = "technician-demand:";

type DeleteTarget =
  | {
      kind: "assignment" | "task" | "charge" | "technician" | "technician_assignment";
      id: string;
      title: string;
      description: string;
      path: string;
      successMessage: string;
      fallbackError: string;
    }
  | null;

type TechnicianPreset = {
  value: string;
  label: string;
  hint: string;
  icon: typeof Wrench;
  tone: string;
};

const initialAssignmentDraft = {
  subadminId: "",
  contractId: "",
  contractIds: [] as string[],
  urgent: false,
  note: "",
};

const initialTaskDraft = {
  subadminId: "",
  bienId: "",
  contractId: "",
  title: "",
  note: "",
  urgent: false,
  assignToAll: false,
};

const initialTechnicianDraft = {
  id: "",
  subadminId: "",
  specialty: "",
  firstName: "",
  lastName: "",
  phone: "",
  mobilePassword: "",
  mobileAccessEnabled: false,
  notes: "",
};

const initialTechnicianAssignmentDraft = {
  id: "",
  technicianId: "",
  bienId: "",
  selectionId: "",
  contractId: "",
  reservationDemandId: "",
  assignmentEventType: "",
  arrivalTime: "",
  departureTime: "",
  note: "",
};

const technicianPresets: TechnicianPreset[] = [
  {
    value: "electricien",
    label: "Electricien",
    hint: "Pannes, prises, luminaires",
    icon: Zap,
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    value: "plombier",
    label: "Plombier",
    hint: "Fuites, robinets, chauffe-eau",
    icon: Droplets,
    tone: "border-sky-200 bg-sky-50 text-sky-800",
  },
  {
    value: "femme de menage",
    label: "Femme de menage",
    hint: "Nettoyage, linge, remise en etat",
    icon: Sparkles,
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
];

async function getApiErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return String(data?.error || fallback);
  } catch {
    return fallback;
  }
}

function showPushDeliveryWarning(push?: PushDispatchResult | null, label = "Operation") {
  if (push?.noTokens) {
    toast.warning(`${label} enregistree, mais aucune notification push n'a pu etre envoyee au sous-admin.`);
    return;
  }
  if (push?.disabled) {
    toast.warning(`${label} enregistree, mais le service FCM du serveur est inactif.`);
  }
}

function formatMoney(value?: number | null) {
  if (!Number.isFinite(Number(value))) return "-";
  return `${Math.round(Number(value) * 100) / 100} DT`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", hour12: false });
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" });
}

function normalizeAssignmentStatus(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "done") return "done" as const;
  if (normalized === "in_progress") return "in_progress" as const;
  return "active" as const;
}

function normalizeDemandStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function isRejectedAmicaleDemandStatus(value?: string | null) {
  return ["rejete_par_amicale", "rejete_par_agence", "demande_rejetee_admin"].includes(normalizeDemandStatus(value));
}

function isAmicaleDemandRow(row: ReservationDemandRow | HotelReservationDemandRow) {
  return String((row as { payment_mode?: string | null }).payment_mode || "").trim() === "amicale"
    || Boolean(String(row.pricing_amicale_id || "").trim());
}

function resolveDemandPropertyUrl(row: { source_kind: "property" | "hotel"; bien_id?: string | null; bien_reference?: string | null }) {
  if (row.source_kind === "hotel") {
    const token = String(row.bien_id || "").trim();
    return token ? `/hotels/${encodeURIComponent(token)}` : null;
  }
  const token = String(row.bien_reference || row.bien_id || "").trim();
  return token ? `/properties/${encodeURIComponent(token)}` : null;
}

function mapHotelDemandToAmicaleAssignmentRow(row: HotelReservationDemandRow): AmicaleAssignmentRow {
  const hotelId = String(row.hotel_id || "").trim();
  return {
    id: `hotel-demand-${row.id}`,
    demand_id: row.id,
    contract_id: null,
    source_kind: "hotel",
    status: row.status || null,
    amicale_name: row.amicale_name || null,
    bien_id: hotelId || null,
    bien_reference: hotelId ? `HOTEL-${hotelId}` : row.id,
    bien_titre: row.hotel_name || null,
    property_url: resolveDemandPropertyUrl({ source_kind: "hotel", bien_id: hotelId }),
    client_name: row.client_name || null,
    client_phone: row.client_phone || null,
    start_date: row.check_in || null,
    end_date: row.check_out || null,
    total_amount: Number.isFinite(Number(row.total_price)) ? Number(row.total_price) : null,
    amount_due_now: Number.isFinite(Number(row.amount_due_now)) ? Number(row.amount_due_now) : null,
    voucher_url: row.voucher_url || null,
    voucher_generated_at: row.voucher_generated_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function mapPropertyDemandToAmicaleAssignmentRow(row: ReservationDemandRow): AmicaleAssignmentRow {
  return {
    id: `property-demand-${row.id}`,
    demand_id: row.id,
    contract_id: row.contract_id || null,
    source_kind: "property",
    status: row.status || null,
    amicale_name: row.amicale_name || null,
    bien_id: row.bien_id || null,
    bien_reference: row.bien_reference || null,
    bien_titre: row.bien_titre || null,
    property_url: resolveDemandPropertyUrl({ source_kind: "property", bien_id: row.bien_id, bien_reference: row.bien_reference }),
    client_name: row.client_name || null,
    client_phone: row.client_phone || null,
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    total_amount: Number.isFinite(Number(row.total_amount)) ? Number(row.total_amount) : null,
    amount_due_now: Number.isFinite(Number(row.amount_due_now)) ? Number(row.amount_due_now) : null,
    voucher_url: row.voucher_url || null,
    voucher_generated_at: row.voucher_generated_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function parseSortDate(value?: string | null) {
  if (!value) return Number.NaN;
  return new Date(String(value).replace(" ", "T")).getTime();
}

function compareNearestArrivalDates(leftValue?: string | null, rightValue?: string | null, leftFallback?: string | null, rightFallback?: string | null) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const leftTime = parseSortDate(leftValue) || parseSortDate(leftFallback);
  const rightTime = parseSortDate(rightValue) || parseSortDate(rightFallback);
  const leftIsValid = Number.isFinite(leftTime);
  const rightIsValid = Number.isFinite(rightTime);
  if (!leftIsValid && !rightIsValid) return 0;
  if (!leftIsValid) return 1;
  if (!rightIsValid) return -1;
  const leftFuture = leftTime >= today;
  const rightFuture = rightTime >= today;
  if (leftFuture && !rightFuture) return -1;
  if (!leftFuture && rightFuture) return 1;
  if (leftFuture && rightFuture) return leftTime - rightTime;
  return rightTime - leftTime;
}

function getAssignmentStatusMeta(status?: string | null) {
  const normalized = normalizeAssignmentStatus(status);
  if (normalized === "done") {
    return {
      label: "Terminee",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (normalized === "in_progress") {
    return {
      label: "En cours",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }
  return {
    label: "Active",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  };
}

function buildContractLabel(contract: ContractOption) {
  const segments = [
    String(contract.id || "").trim(),
    String(contract.bien_titre || "").trim(),
    String(contract.locataire_nom || "").trim(),
  ].filter(Boolean);
  return segments.join(" - ");
}

function buildBienLabel(bien: BienOption) {
  const reference = String(bien.reference || "").trim();
  const title = String(bien.titre || "").trim();
  if (reference && title) return `${reference} - ${title}`;
  return reference || title || bien.id;
}

function comparePickerOptionLabels(left: PickerOption, right: PickerOption) {
  return left.title.localeCompare(right.title, "fr", { sensitivity: "base" });
}

function getTechnicianSpecialtyMeta(specialty?: string | null) {
  const normalized = String(specialty || "").trim().toLowerCase();
  if (normalized.includes("elect")) {
    return { icon: Zap, tone: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  if (normalized.includes("plomb") || normalized.includes("robinet") || normalized.includes("eau")) {
    return { icon: Droplets, tone: "border-sky-200 bg-sky-50 text-sky-800" };
  }
  if (normalized.includes("menage") || normalized.includes("femme") || normalized.includes("clean") || normalized.includes("netto")) {
    return { icon: Sparkles, tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  if (normalized.includes("peint")) {
    return { icon: Paintbrush, tone: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800" };
  }
  if (normalized.includes("bricol") || normalized.includes("maint") || normalized.includes("travaux")) {
    return { icon: Hammer, tone: "border-slate-200 bg-slate-100 text-slate-800" };
  }
  return { icon: Construction, tone: "border-slate-200 bg-slate-50 text-slate-700" };
}

function SelectionButton({
  label,
  value,
  placeholder,
  onOpen,
  onClear,
  accent = "emerald",
}: {
  label: string;
  value?: string;
  placeholder: string;
  onOpen: () => void;
  onClear?: () => void;
  accent?: "emerald" | "amber";
}) {
  const accentClasses =
    accent === "amber"
      ? "border-amber-200 bg-white text-gray-900 hover:border-amber-300"
      : "border-emerald-200 bg-white text-gray-900 hover:border-emerald-300";

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onOpen}
          className={`group flex min-h-[54px] flex-1 items-center justify-between rounded-2xl border px-4 py-3 text-left shadow-sm transition-all ${accentClasses}`}
        >
          <span className={`block min-w-0 pr-3 text-sm ${value ? "font-medium text-gray-900" : "text-gray-400"}`}>
            {value || placeholder}
          </span>
          <ChevronsUpDown size={16} className="shrink-0 text-gray-400 transition group-hover:text-gray-700" />
        </button>
        {value && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-[46px] w-full shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-rose-200 hover:text-rose-600 sm:h-[54px] sm:w-[54px]"
            aria-label={`Effacer ${label}`}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SelectionDialog({
  open,
  onOpenChange,
  title,
  description,
  searchValue,
  onSearchChange,
  options,
  selectedId,
  selectedIds,
  selectionMode = "single",
  onSelect,
  onConfirmSelection,
  emptyLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  options: PickerOption[];
  selectedId: string;
  selectedIds?: string[];
  selectionMode?: "single" | "multiple";
  onSelect: (id: string) => void;
  onConfirmSelection?: (ids: string[]) => void;
  emptyLabel: string;
}) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  } as const;
  const isMultiple = selectionMode === "multiple";
  const normalizedSelectedIds = useMemo(
    () => Array.from(new Set((selectedIds || []).map((value) => String(value || "").trim()).filter(Boolean))),
    [selectedIds]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-[24px] border border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.98))] p-0 shadow-[0_30px_80px_rgba(15,23,42,0.20)] sm:rounded-[30px]">
        <div className="overflow-hidden rounded-[24px] sm:rounded-[30px]">
          <div className="border-b border-emerald-100 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_48%),linear-gradient(135deg,#f8fffc_0%,#ffffff_55%,#f0fdf4_100%)] px-4 py-4 sm:px-6 sm:py-5">
            <DialogHeader className="text-left">
              <DialogTitle className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">{description}</DialogDescription>
            </DialogHeader>
            {isMultiple ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                {normalizedSelectedIds.length} selection{normalizedSelectedIds.length > 1 ? "s" : ""}
              </p>
            ) : null}
            <div className="relative mt-4">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Rechercher par reference, client, contrat ou amicale..."
                className="h-12 w-full rounded-2xl border border-emerald-100 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/80"
              />
            </div>
          </div>

          <div className="max-h-[72vh] overflow-y-auto px-3 py-3 sm:max-h-[65vh] sm:px-4 sm:py-4">
            {options.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 sm:rounded-3xl sm:px-6 sm:py-10">
                {emptyLabel}
              </div>
            ) : (
              <div className="space-y-2">
                {options.map((option) => {
                  const effectiveValue = option.selectValue || option.id;
                  const isSelected = isMultiple
                    ? normalizedSelectedIds.includes(effectiveValue)
                    : effectiveValue === selectedId;
                  const isAmicale = option.highlight === "amicale";
                  const selectedClasses = isSelected
                    ? isAmicale
                      ? "border-sky-300 bg-sky-50 shadow-[0_12px_24px_rgba(14,165,233,0.12)]"
                      : "border-emerald-300 bg-emerald-50 shadow-[0_12px_24px_rgba(16,185,129,0.10)]"
                    : isAmicale
                      ? "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.96),rgba(255,255,255,0.98))] hover:border-sky-300 hover:bg-sky-50/70"
                      : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40";
                  const badgeTone = option.badgeTone || "emerald";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        if (!option.disabled) onSelect(effectiveValue);
                      }}
                      disabled={option.disabled}
                      className={`flex w-full items-start gap-3 rounded-[24px] border px-3 py-3 text-left transition sm:rounded-3xl sm:px-4 sm:py-4 ${selectedClasses} ${
                        option.disabled ? "cursor-not-allowed opacity-75" : ""
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          isSelected
                            ? isAmicale
                              ? "border-sky-500 bg-sky-500 text-white"
                              : "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-300 text-transparent"
                        }`}
                      >
                        <Check size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-start gap-2">
                          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{option.title}</span>
                          {option.badge ? (
                            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${toneClasses[badgeTone]}`}>
                              {option.badge}
                            </span>
                          ) : null}
                        </span>
                        {option.subtitle ? <span className="mt-1 block text-sm text-slate-500">{option.subtitle}</span> : null}
                        {option.metaBadges?.length ? (
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {option.metaBadges.map((badge) => (
                              <span
                                key={`${option.id}-${badge.label}`}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClasses[badge.tone || "slate"]}`}
                              >
                                {badge.label}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {option.note ? (
                          <span
                            className={`mt-2 block rounded-2xl border px-3 py-2 text-xs font-medium ${
                              option.noteTone === "sky"
                                ? "border-sky-200 bg-sky-50/80 text-sky-700"
                                : option.noteTone === "emerald"
                                  ? "border-emerald-200 bg-emerald-50/80 text-emerald-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {option.note}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {isMultiple ? (
            <div className="border-t border-emerald-100 bg-white px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConfirmSelection?.(normalizedSelectedIds);
                    onOpenChange(false);
                  }}
                  className="rounded-2xl border border-emerald-200 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Valider la selection
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald" | "amber" | "sky";
}) {
  const toneClasses = {
    default: "border-white/70 bg-white/92",
    emerald: "border-emerald-100 bg-emerald-50/80",
    amber: "border-amber-100 bg-amber-50/80",
    sky: "border-sky-100 bg-sky-50/80",
  } as const;

  return (
    <div className={`rounded-[24px] border p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:rounded-[28px] sm:p-4 ${toneClasses[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900 sm:mt-3 sm:text-3xl">{value}</p>
    </div>
  );
}

function PanelSurface({
  title,
  description,
  accent,
  children,
}: {
  title: string;
  description?: string;
  accent: "emerald" | "amber" | "sky" | "slate";
  children: React.ReactNode;
}) {
  const classes = {
    emerald:
      "border-emerald-100 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,253,244,0.92))]",
    amber:
      "border-amber-100 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,251,235,0.94))]",
    sky:
      "border-sky-100 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94))]",
    slate:
      "border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))]",
  } as const;

  return (
    <section className={`rounded-[24px] border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:rounded-[30px] sm:p-5 ${classes[accent]}`}>
      <div className="mb-4 sm:mb-5">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center text-sm text-slate-500 sm:rounded-[28px] sm:px-6 sm:py-10">
      {label}
    </div>
  );
}

function AutofillField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white/90 px-3.5 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{String(value || "-")}</p>
    </div>
  );
}

function normalizeContractAutofillPayload(payload: unknown): ContractAutofill | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const source =
    record.assignment_autofill && typeof record.assignment_autofill === "object"
      ? (record.assignment_autofill as Record<string, unknown>)
      : record;

  const contractId = String(source.contract_id || record.id || "").trim();
  if (!contractId) return null;

  return {
    contract_id: contractId,
    bien_id: source.bien_id ? String(source.bien_id) : null,
    bien_reference: source.bien_reference ? String(source.bien_reference) : null,
    bien_titre: source.bien_titre ? String(source.bien_titre) : null,
    property_url: source.property_url ? String(source.property_url) : null,
    google_maps_url: source.google_maps_url ? String(source.google_maps_url) : null,
    client_name: source.client_name ? String(source.client_name) : null,
    client_phone: source.client_phone ? String(source.client_phone) : null,
    proprietaire_nom: source.proprietaire_nom ? String(source.proprietaire_nom) : null,
    proprietaire_telephone: source.proprietaire_telephone ? String(source.proprietaire_telephone) : null,
    contract_start_date: source.contract_start_date ? String(source.contract_start_date) : null,
    contract_end_date: source.contract_end_date ? String(source.contract_end_date) : null,
    arrival_time: source.arrival_time ? String(source.arrival_time) : null,
    departure_time: source.departure_time ? String(source.departure_time) : null,
    payment_reference: source.payment_reference ? String(source.payment_reference) : null,
    url_pdf: source.url_pdf ? String(source.url_pdf) : null,
    owner_url_pdf: source.owner_url_pdf ? String(source.owner_url_pdf) : null,
    montant_total_contrat: Number.isFinite(Number(source.montant_total_contrat)) ? Number(source.montant_total_contrat) : null,
    montant_avance: Number.isFinite(Number(source.montant_avance)) ? Number(source.montant_avance) : null,
    montant_a_encaisser: Number.isFinite(Number(source.montant_a_encaisser)) ? Number(source.montant_a_encaisser) : null,
    montant_donne_proprietaire: Number.isFinite(Number(source.montant_donne_proprietaire)) ? Number(source.montant_donne_proprietaire) : null,
    montant_total_proprietaire: Number.isFinite(Number(source.montant_total_proprietaire)) ? Number(source.montant_total_proprietaire) : null,
    reste_a_donner_proprietaire: Number.isFinite(Number(source.reste_a_donner_proprietaire)) ? Number(source.reste_a_donner_proprietaire) : null,
    resolved_template_vars:
      source.resolved_template_vars && typeof source.resolved_template_vars === "object"
        ? (source.resolved_template_vars as Record<string, string>)
        : null,
  };
}

export default function SubAdminOperationsPanel({
  subadmins,
}: {
  subadmins: AdminAccount[];
}) {
  const [activeTab, setActiveTab] = useState<PanelTab>("assignments");
  const [selectedSubadminId, setSelectedSubadminId] = useState("");
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [amicaleDemands, setAmicaleDemands] = useState<AmicaleAssignmentRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianRow[]>([]);
  const [technicianAssignments, setTechnicianAssignments] = useState<TechnicianAssignmentRow[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [biens, setBiens] = useState<BienOption[]>([]);
  const [assignmentDraft, setAssignmentDraft] = useState(initialAssignmentDraft);
  const [taskDraft, setTaskDraft] = useState(initialTaskDraft);
  const [technicianDraft, setTechnicianDraft] = useState(initialTechnicianDraft);
  const [technicianAssignmentDraft, setTechnicianAssignmentDraft] = useState(initialTechnicianAssignmentDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<PickerVariant | null>(null);
  const [contractSearch, setContractSearch] = useState("");
  const [bienSearch, setBienSearch] = useState("");
  const [assignmentContractDetails, setAssignmentContractDetails] = useState<ContractAutofill | null>(null);
  const [assignmentContractLoading, setAssignmentContractLoading] = useState(false);
  const [assignmentVariablesOpen, setAssignmentVariablesOpen] = useState(false);
  const [assignmentTransferTargets, setAssignmentTransferTargets] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const suffix = useMemo(
    () => (selectedSubadminId ? `?subadmin_id=${encodeURIComponent(selectedSubadminId)}` : ""),
    [selectedSubadminId]
  );

  useEffect(() => {
    if (!selectedSubadminId && subadmins.length > 0) {
      const fallback = String(subadmins[0]?.id || "").trim();
      setSelectedSubadminId(fallback);
      setAssignmentDraft((prev) => ({ ...prev, subadminId: fallback }));
      setTaskDraft((prev) => ({ ...prev, subadminId: fallback }));
      setTechnicianDraft((prev) => ({ ...prev, subadminId: fallback }));
    }
  }, [selectedSubadminId, subadmins]);

  const selectedSubadmin = useMemo(
    () => subadmins.find((entry) => entry.id === selectedSubadminId) || null,
    [selectedSubadminId, subadmins]
  );

  const loadReferenceData = useCallback(async () => {
    const [contractsResponse, biensResponse] = await Promise.all([
      fetch(buildApiUrl("/contrats"), { credentials: "include" }),
      fetch(buildApiUrl("/biens"), { credentials: "include" }),
    ]);
    if (contractsResponse.ok) {
      const rows = await contractsResponse.json().catch(() => []);
      setContracts(Array.isArray(rows) ? rows : []);
    }
    if (biensResponse.ok) {
      const rows = await biensResponse.json().catch(() => []);
      setBiens(Array.isArray(rows) ? rows : []);
    }
  }, []);

  const openContractPicker = useCallback(() => {
    void loadReferenceData();
    setPickerOpen("contract");
  }, [loadReferenceData]);

  const loadAssignments = useCallback(async () => {
    const response = await fetch(buildApiUrl(`/subadmin/contracts${suffix}`), {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, "Impossible de charger les affectations"));
    }
    const rows = await response.json().catch(() => []);
    setAssignments(Array.isArray(rows) ? rows : []);
  }, [suffix]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const loadCollection = async <T,>(path: string, fallback: string) => {
        const response = await fetch(buildApiUrl(path), { credentials: "include" });
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, fallback));
        }
        const rows = await response.json().catch(() => []);
        return Array.isArray(rows) ? (rows as T[]) : [];
      };

      const [assignmentsResult, tasksResult, chargesResult, techniciansResult, technicianAssignmentsResult, reservationDemandsResult, hotelDemandsResult] = await Promise.allSettled([
        loadCollection<AssignmentRow>(`/subadmin/contracts${suffix}`, "Impossible de charger les affectations"),
        loadCollection<TaskRow>(`/subadmin/tasks${suffix}`, "Impossible de charger les taches"),
        loadCollection<ChargeRow>(`/subadmin/charges${suffix}`, "Impossible de charger les charges"),
        loadCollection<TechnicianRow>(`/subadmin/technicians${suffix}`, "Impossible de charger les techniciens"),
        loadCollection<TechnicianAssignmentRow>(`/subadmin/technician-assignments${suffix}`, "Impossible de charger les affectations technicien"),
        loadCollection<ReservationDemandRow>("/reservation-demands", "Impossible de charger les demandes adherants"),
        loadCollection<HotelReservationDemandRow>("/hotel-reservation-demands", "Impossible de charger les demandes adherants"),
      ]);

      const errors: string[] = [];

      if (assignmentsResult.status === "fulfilled") setAssignments(assignmentsResult.value);
      else errors.push(assignmentsResult.reason instanceof Error ? assignmentsResult.reason.message : "Impossible de charger les affectations");

      if (tasksResult.status === "fulfilled") setTasks(tasksResult.value);
      else errors.push(tasksResult.reason instanceof Error ? tasksResult.reason.message : "Impossible de charger les taches");

      if (chargesResult.status === "fulfilled") setCharges(chargesResult.value);
      else errors.push(chargesResult.reason instanceof Error ? chargesResult.reason.message : "Impossible de charger les charges");

      if (techniciansResult.status === "fulfilled") setTechnicians(techniciansResult.value);
      else errors.push(techniciansResult.reason instanceof Error ? techniciansResult.reason.message : "Impossible de charger les techniciens");

      if (technicianAssignmentsResult.status === "fulfilled") setTechnicianAssignments(technicianAssignmentsResult.value);
      else errors.push(technicianAssignmentsResult.reason instanceof Error ? technicianAssignmentsResult.reason.message : "Impossible de charger les affectations technicien");

      if (reservationDemandsResult.status === "fulfilled" || hotelDemandsResult.status === "fulfilled") {
        const propertyRows = reservationDemandsResult.status === "fulfilled" ? reservationDemandsResult.value : [];
        const hotelRows = hotelDemandsResult.status === "fulfilled" ? hotelDemandsResult.value : [];
        const assignedContractIds = new Set(
          (assignmentsResult.status === "fulfilled" ? assignmentsResult.value : [])
            .map((assignment) => String(assignment.contract_id || "").trim())
            .filter(Boolean)
        );
        const assignedHotelDemandIds = new Set(
          (assignmentsResult.status === "fulfilled" ? assignmentsResult.value : [])
            .map((assignment) => String((assignment as { hotel_reservation_demand_id?: string | null }).hotel_reservation_demand_id || "").trim())
            .filter(Boolean)
        );
        const merged = [
          ...propertyRows
            .filter((row) => row
              && isAmicaleDemandRow(row)
              && !isRejectedAmicaleDemandStatus(row.status)
              && !assignedContractIds.has(String(row.contract_id || "").trim()))
            .map(mapPropertyDemandToAmicaleAssignmentRow),
          ...hotelRows
            .filter((row) =>
              row
              && isAmicaleDemandRow(row)
              && !isRejectedAmicaleDemandStatus(row.status)
              && !assignedHotelDemandIds.has(String(row.id || "").trim())
            )
            .map(mapHotelDemandToAmicaleAssignmentRow),
        ].sort((left, right) => compareNearestArrivalDates(left.start_date, right.start_date, left.created_at, right.created_at));
        setAmicaleDemands(merged);
      } else {
        errors.push("Impossible de charger les demandes adherants");
      }

      if (errors.length > 0) {
        toast.error(errors[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [suffix]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const contractId = String(assignmentDraft.contractId || "").trim();
    if (!contractId || selectedAssignmentContractIds.length !== 1) {
      setAssignmentContractDetails(null);
      setAssignmentContractLoading(false);
      setAssignmentVariablesOpen(false);
      return;
    }
    if (
      contractId.startsWith(RESERVATION_DEMAND_PICKER_PREFIX)
      || contractId.startsWith(HOTEL_RESERVATION_DEMAND_PICKER_PREFIX)
    ) {
      setAssignmentContractDetails(null);
      setAssignmentContractLoading(false);
      setAssignmentVariablesOpen(false);
      return;
    }

    let cancelled = false;
    setAssignmentContractLoading(true);

    const loadContractDetails = async () => {
      try {
        const response = await fetch(buildApiUrl(`/contrats/${encodeURIComponent(contractId)}`), {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Impossible de charger les variables du contrat"));
        }
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        setAssignmentContractDetails(normalizeContractAutofillPayload(payload));
      } catch (error) {
        if (!cancelled) {
          setAssignmentContractDetails(null);
          toast.error(error instanceof Error ? error.message : "Impossible de charger les variables du contrat");
        }
      } finally {
        if (!cancelled) {
          setAssignmentContractLoading(false);
        }
      }
    };

    void loadContractDetails();

    return () => {
      cancelled = true;
    };
  }, [assignmentDraft.contractId, selectedAssignmentContractIds.length]);

  const openTasks = useMemo(() => tasks.filter((task) => task.status === "open"), [tasks]);
  const historyTasks = useMemo(() => tasks.filter((task) => task.status === "done"), [tasks]);
  const activeTechnicianAssignments = useMemo(
    () => technicianAssignments.filter((assignment) => assignment.status !== "done"),
    [technicianAssignments]
  );
  const historyTechnicianAssignments = useMemo(
    () => technicianAssignments.filter((assignment) => assignment.status === "done"),
    [technicianAssignments]
  );
  const activeAssignments = useMemo(
    () =>
      [...assignments]
        .filter((assignment) => normalizeAssignmentStatus(assignment.status) !== "done")
        .sort((left, right) => {
          const dateCompare = compareNearestArrivalDates(
            left.contract_start_date,
            right.contract_start_date,
            left.created_at || left.updated_at,
            right.created_at || right.updated_at
          );
          if (dateCompare !== 0) return dateCompare;
          if (left.urgent !== right.urgent) return left.urgent ? -1 : 1;
          return parseSortDate(right.updated_at) - parseSortDate(left.updated_at);
        }),
    [assignments]
  );
  const assignmentHistory = useMemo(
    () =>
      [...assignments]
        .filter((assignment) => normalizeAssignmentStatus(assignment.status) === "done")
        .sort((left, right) => parseSortDate(right.completed_at || right.updated_at) - parseSortDate(left.completed_at || left.updated_at)),
    [assignments]
  );
  const inProgressAssignments = useMemo(
    () => assignments.filter((assignment) => normalizeAssignmentStatus(assignment.status) === "in_progress"),
    [assignments]
  );

  const selectedAssignmentContract = useMemo(
    () => contracts.find((entry) => entry.id === assignmentDraft.contractId) || null,
    [assignmentDraft.contractId, contracts]
  );
  const selectedAssignmentContractIds = useMemo(
    () => Array.from(new Set((assignmentDraft.contractIds || []).map((value) => String(value || "").trim()).filter(Boolean))),
    [assignmentDraft.contractIds]
  );
  const selectedTaskBien = useMemo(
    () => biens.find((entry) => entry.id === taskDraft.bienId) || null,
    [biens, taskDraft.bienId]
  );
  const selectedTechnicianAssignmentBien = useMemo(
    () => biens.find((entry) => entry.id === technicianAssignmentDraft.bienId) || null,
    [biens, technicianAssignmentDraft.bienId]
  );
  const selectedTaskContract = useMemo(
    () => contracts.find((entry) => entry.id === taskDraft.contractId) || null,
    [contracts, taskDraft.contractId]
  );

  const contractPickerOptions = useMemo(() => {
    const needle = contractSearch.trim().toLowerCase();
    const contractDateMap = new Map(
      contracts.map((contract) => [String(contract.id || "").trim(), { start: contract.date_debut || null, fallback: contract.created_at || null }])
    );
    const buildDateOptions = ({
      baseId,
      selectValue,
      title,
      subtitle,
      primaryTone,
      metaBadges,
      note,
      noteTone,
      highlight,
      disabled,
      arrivalDate,
      departureDate,
      fallbackDate,
    }: {
      baseId: string;
      selectValue?: string;
      title: string;
      subtitle: string;
      primaryTone: "emerald" | "sky";
      metaBadges: PickerOption["metaBadges"];
      note?: string;
      noteTone?: PickerOption["noteTone"];
      highlight?: PickerOption["highlight"];
      disabled?: boolean;
      arrivalDate?: string | null;
      departureDate?: string | null;
      fallbackDate?: string | null;
    }) => {
      const items: PickerOption[] = [];
      if (arrivalDate) {
        items.push({
          id: `${baseId}-arrival`,
          selectValue,
          title,
          subtitle,
          badge: `Arrivee ${formatDateOnly(arrivalDate)}`,
          badgeTone: primaryTone,
          sortDate: arrivalDate,
          sortFallback: fallbackDate || undefined,
          metaBadges: [...(metaBadges || []), { label: "Arrivee", tone: "emerald" }],
          note,
          noteTone,
          highlight,
          disabled,
        });
      }
      if (departureDate) {
        items.push({
          id: `${baseId}-departure`,
          selectValue,
          title,
          subtitle,
          badge: `Depart ${formatDateOnly(departureDate)}`,
          badgeTone: primaryTone,
          sortDate: departureDate,
          sortFallback: fallbackDate || undefined,
          metaBadges: [...(metaBadges || []), { label: "Depart", tone: "amber" }],
          note,
          noteTone,
          highlight,
          disabled,
        });
      }
      if (items.length === 0) {
        items.push({
          id: `${baseId}-default`,
          selectValue,
          title,
          subtitle,
          badge: fallbackDate ? formatDateOnly(fallbackDate) : undefined,
          badgeTone: primaryTone,
          sortFallback: fallbackDate || undefined,
          metaBadges,
          note,
          noteTone,
          highlight,
          disabled,
        });
      }
      return items;
    };

    const baseOptions = [...contracts]
      .filter((contract) => {
        if (!needle) return true;
        return [
          contract.id,
          contract.bien_reference,
          contract.bien_titre,
          contract.locataire_nom,
          contract.amicale_name,
          contract.reservation_payment_mode,
          contract.created_at,
          contract.date_debut,
          contract.date_fin,
        ]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(needle));
      })
      .flatMap((contract) => {
        const isAmicale =
          String(contract.reservation_payment_mode || "").trim().toLowerCase() === "amicale"
          || Boolean(String(contract.pricing_amicale_id || "").trim());
        const contractLabel = String(contract.id || "").trim();
        const titleParts = [String(contract.bien_titre || "").trim(), String(contract.bien_reference || "").trim()].filter(Boolean);
        const metaBadges = [
          { label: isAmicale ? "Contrat amicale" : "Contrat particulier", tone: isAmicale ? "sky" : "emerald" },
          contract.bien_reference ? { label: `Ref ${String(contract.bien_reference).trim()}`, tone: "slate" } : null,
          contract.amicale_name ? { label: `Amicale ${String(contract.amicale_name).trim()}`, tone: "sky" } : null,
        ].filter(Boolean) as PickerOption["metaBadges"];

        return buildDateOptions({
          baseId: contract.id,
          selectValue: contract.id,
          title: titleParts.length > 0 ? titleParts.join(" - ") : contractLabel,
          subtitle: [
            contractLabel ? `Contrat ${contractLabel}` : "",
            String(contract.locataire_nom || "").trim() ? `Client ${String(contract.locataire_nom || "").trim()}` : "",
          ]
            .filter(Boolean)
            .join(" | "),
          primaryTone: isAmicale ? "sky" : "emerald",
          metaBadges,
          note: isAmicale
            ? `Note terrain: amicale : ${String(contract.amicale_name || "Amicale").trim()}`
            : undefined,
          noteTone: isAmicale ? "sky" : "slate",
          highlight: isAmicale ? "amicale" : "default",
          arrivalDate: contract.date_debut || null,
          departureDate: contract.date_fin || null,
          fallbackDate: contract.created_at || null,
        });
      });

    const knownContractIds = new Set(
      contracts.map((contract) => String(contract.id || "").trim()).filter(Boolean)
    );

    const amicaleDemandOptions = amicaleDemands
      .filter((demand) => {
        const linkedContractId = String(demand.contract_id || "").trim();
        if (linkedContractId && knownContractIds.has(linkedContractId)) return false;
        if (!needle) return true;
        return [
          demand.demand_id,
          demand.contract_id,
          demand.bien_reference,
          demand.bien_titre,
          demand.client_name,
          demand.amicale_name,
          demand.start_date,
          demand.end_date,
          demand.source_kind,
        ]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(needle));
      })
      .flatMap((demand) => {
        const linkedContractId = String(demand.contract_id || "").trim();
        const canAssignFromVoucher = Boolean(String(demand.voucher_url || "").trim());
        const hasLinkedContract = Boolean(linkedContractId);
        const canSelectForAssignment = hasLinkedContract || canAssignFromVoucher;
        const demandLabel = demand.source_kind === "hotel" ? "Demande hotel amicale" : "Demande bien amicale";
        const titleParts = [String(demand.bien_reference || "").trim(), String(demand.bien_titre || "").trim()].filter(Boolean);
        const note = hasLinkedContract
          ? `Note terrain: amicale : ${String(demand.amicale_name || "Amicale").trim()}`
          : canAssignFromVoucher
            ? `Affectation via voucher PDF: amicale : ${String(demand.amicale_name || "Amicale").trim()}`
            : demand.source_kind === "hotel"
              ? "Demande hotel sans contrat lie: visible ici, non affectable depuis ce popup."
              : "Demande adherant sans voucher PDF: generer le voucher avant affectation.";

        return buildDateOptions({
          baseId: demand.id,
          selectValue: hasLinkedContract
            ? linkedContractId
            : canAssignFromVoucher
              ? demand.source_kind === "hotel"
                ? `${HOTEL_RESERVATION_DEMAND_PICKER_PREFIX}${String(demand.demand_id || "").trim()}`
                : `${RESERVATION_DEMAND_PICKER_PREFIX}${String(demand.demand_id || "").trim()}`
              : undefined,
          sourceKind: demand.source_kind,
          reservationDemandId: demand.source_kind === "property" ? demand.demand_id : undefined,
          hotelReservationDemandId: demand.source_kind === "hotel" ? demand.demand_id : undefined,
          title: titleParts.length > 0 ? titleParts.join(" - ") : demand.demand_id,
          subtitle: [
            `Demande ${String(demand.demand_id || "").trim()}`,
            String(demand.client_name || "").trim() ? `Client ${String(demand.client_name || "").trim()}` : "",
          ]
            .filter(Boolean)
            .join(" | "),
          primaryTone: "sky",
          metaBadges: [
            { label: demandLabel, tone: "sky" },
            demand.amicale_name ? { label: `Amicale ${String(demand.amicale_name).trim()}`, tone: "sky" } : null,
            hasLinkedContract
              ? { label: `Contrat ${linkedContractId}`, tone: "emerald" }
              : canAssignFromVoucher
                ? { label: "Voucher PDF", tone: "emerald" }
                : { label: "Sans contrat", tone: "amber" },
          ].filter(Boolean) as PickerOption["metaBadges"],
          note,
          noteTone: canSelectForAssignment ? "sky" : "slate",
          highlight: "amicale",
          disabled: !canSelectForAssignment,
          arrivalDate: demand.start_date || null,
          departureDate: demand.end_date || null,
          fallbackDate: demand.created_at || null,
        });
      });

    return [...baseOptions, ...amicaleDemandOptions].sort((left, right) => {
      return compareNearestArrivalDates(
        left.sortDate || null,
        right.sortDate || null,
        left.sortFallback || contractDateMap.get(String(left.selectValue || left.id || "").trim())?.fallback || null,
        right.sortFallback || contractDateMap.get(String(right.selectValue || right.id || "").trim())?.fallback || null
      );
    });
  }, [amicaleDemands, contractSearch, contracts]);
  const selectedAssignmentContractPickerOption = useMemo(
    () => contractPickerOptions.find((entry) => String(entry.selectValue || entry.id || "").trim() === String(assignmentDraft.contractId || "").trim()) || null,
    [assignmentDraft.contractId, contractPickerOptions]
  );

  const technicianBienPickerOptions = useMemo(() => {
    const needle = bienSearch.trim().toLowerCase();
    const bienScheduleMap = new Map<string, Array<{
      sortDate?: string | null;
      sortFallback?: string | null;
      selectValue?: string;
      assignmentEventType?: "arrivee" | "depart";
      badge?: string;
      badgeTone?: PickerOption["badgeTone"];
      metaBadges?: PickerOption["metaBadges"];
      note?: string;
      noteTone?: PickerOption["noteTone"];
      highlight?: PickerOption["highlight"];
      contractId?: string | null;
      reservationDemandId?: string | null;
    }>>();

    const pushBienSchedule = (
      bienId: string,
      entry: {
        sortDate?: string | null;
        sortFallback?: string | null;
        selectValue?: string;
        assignmentEventType?: "arrivee" | "depart";
        badge?: string;
        badgeTone?: PickerOption["badgeTone"];
        metaBadges?: PickerOption["metaBadges"];
        note?: string;
        noteTone?: PickerOption["noteTone"];
        highlight?: PickerOption["highlight"];
        contractId?: string | null;
        reservationDemandId?: string | null;
      }
    ) => {
      const normalizedBienId = String(bienId || "").trim();
      if (!normalizedBienId) return;
      const current = bienScheduleMap.get(normalizedBienId) || [];
      current.push(entry);
      bienScheduleMap.set(normalizedBienId, current);
    };

    contracts.forEach((contract) => {
      const bienId = String(contract.bien_id || "").trim();
      if (!bienId) return;
      const isAmicale =
        String(contract.reservation_payment_mode || "").trim().toLowerCase() === "amicale"
        || Boolean(String(contract.pricing_amicale_id || "").trim());
      const commonMetaBadges = [
        { label: isAmicale ? "Contrat amicale" : "Contrat particulier", tone: isAmicale ? "sky" : "emerald" },
        contract.bien_reference ? { label: `Ref ${String(contract.bien_reference).trim()}`, tone: "slate" } : null,
        contract.amicale_name ? { label: `Amicale ${String(contract.amicale_name).trim()}`, tone: "sky" } : null,
      ].filter(Boolean) as PickerOption["metaBadges"];

      if (contract.date_debut) {
        pushBienSchedule(bienId, {
          selectValue: `${TECHNICIAN_CONTRACT_PICKER_PREFIX}${String(contract.id || "").trim()}`,
          assignmentEventType: "arrivee",
          sortDate: contract.date_debut,
          sortFallback: contract.created_at || null,
          badge: `Arrivee ${formatDateOnly(contract.date_debut)}`,
          badgeTone: isAmicale ? "sky" : "emerald",
          metaBadges: [...commonMetaBadges, { label: "Arrivee", tone: "emerald" }],
          note: contract.locataire_nom ? `Client ${String(contract.locataire_nom).trim()}` : undefined,
          noteTone: isAmicale ? "sky" : "emerald",
          highlight: isAmicale ? "amicale" : "default",
          contractId: contract.id,
          reservationDemandId: contract.reservation_demand_id || null,
        });
      }

      if (contract.date_fin) {
        pushBienSchedule(bienId, {
          selectValue: `${TECHNICIAN_CONTRACT_PICKER_PREFIX}${String(contract.id || "").trim()}`,
          assignmentEventType: "depart",
          sortDate: contract.date_fin,
          sortFallback: contract.created_at || null,
          badge: `Depart ${formatDateOnly(contract.date_fin)}`,
          badgeTone: isAmicale ? "sky" : "emerald",
          metaBadges: [...commonMetaBadges, { label: "Depart", tone: "amber" }],
          note: contract.locataire_nom ? `Client ${String(contract.locataire_nom).trim()}` : undefined,
          noteTone: isAmicale ? "sky" : "emerald",
          highlight: isAmicale ? "amicale" : "default",
          contractId: contract.id,
          reservationDemandId: contract.reservation_demand_id || null,
        });
      }

      if (!contract.date_debut && !contract.date_fin) {
        pushBienSchedule(bienId, {
          selectValue: `${TECHNICIAN_CONTRACT_PICKER_PREFIX}${String(contract.id || "").trim()}`,
          sortFallback: contract.created_at || null,
          badge: contract.created_at ? formatDateOnly(contract.created_at) : undefined,
          badgeTone: isAmicale ? "sky" : "emerald",
          metaBadges: commonMetaBadges,
          note: contract.locataire_nom ? `Client ${String(contract.locataire_nom).trim()}` : undefined,
          noteTone: isAmicale ? "sky" : "emerald",
          highlight: isAmicale ? "amicale" : "default",
          contractId: contract.id,
          reservationDemandId: contract.reservation_demand_id || null,
        });
      }
    });

    amicaleDemands.forEach((demand) => {
      if (demand.source_kind !== "property") return;
      const normalizedBienId = String(demand.bien_id || "").trim();
      if (!normalizedBienId) return;
      const commonMetaBadges = [
        { label: "Demande amicale", tone: "sky" },
        demand.amicale_name ? { label: `Amicale ${String(demand.amicale_name).trim()}`, tone: "sky" } : null,
        demand.bien_reference ? { label: `Ref ${String(demand.bien_reference).trim()}`, tone: "slate" } : null,
      ].filter(Boolean) as PickerOption["metaBadges"];

      if (demand.start_date) {
        pushBienSchedule(normalizedBienId, {
          selectValue: `${TECHNICIAN_DEMAND_PICKER_PREFIX}${String(demand.demand_id || demand.id || "").trim()}`,
          assignmentEventType: "arrivee",
          sortDate: demand.start_date,
          sortFallback: demand.created_at || null,
          badge: `Arrivee ${formatDateOnly(demand.start_date)}`,
          badgeTone: "sky",
          metaBadges: [...commonMetaBadges, { label: "Arrivee", tone: "emerald" }],
          note: demand.client_name ? `Client ${String(demand.client_name).trim()}` : undefined,
          noteTone: "sky",
          highlight: "amicale",
          contractId: demand.contract_id || null,
          reservationDemandId: demand.demand_id,
        });
      }

      if (demand.end_date) {
        pushBienSchedule(normalizedBienId, {
          selectValue: `${TECHNICIAN_DEMAND_PICKER_PREFIX}${String(demand.demand_id || demand.id || "").trim()}`,
          assignmentEventType: "depart",
          sortDate: demand.end_date,
          sortFallback: demand.created_at || null,
          badge: `Depart ${formatDateOnly(demand.end_date)}`,
          badgeTone: "sky",
          metaBadges: [...commonMetaBadges, { label: "Depart", tone: "amber" }],
          note: demand.client_name ? `Client ${String(demand.client_name).trim()}` : undefined,
          noteTone: "sky",
          highlight: "amicale",
          contractId: demand.contract_id || null,
          reservationDemandId: demand.demand_id,
        });
      }
    });

    return biens
      .filter((bien) => {
        if (!needle) return true;
        return [bien.id, bien.reference, bien.titre]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(needle));
      })
      .map((bien) => {
        const candidates = bienScheduleMap.get(String(bien.id || "").trim()) || [];
        const sortedCandidates = [...candidates].sort((left, right) =>
          compareNearestArrivalDates(left.sortDate || null, right.sortDate || null, left.sortFallback || null, right.sortFallback || null)
        );
        const primaryCandidate = sortedCandidates[0] || null;
        return {
          id: bien.id,
          selectValue: primaryCandidate?.selectValue || String(bien.id || "").trim(),
          sourceBienId: String(bien.id || "").trim(),
          contractId: primaryCandidate?.contractId || null,
          reservationDemandId: primaryCandidate?.reservationDemandId || null,
          assignmentEventType: primaryCandidate?.assignmentEventType,
          title: String(bien.titre || bien.reference || bien.id),
          subtitle: String(buildBienLabel(bien)),
          badge: primaryCandidate?.badge || String(bien.reference || "").trim() || undefined,
          badgeTone: primaryCandidate?.badgeTone || "emerald",
          sortDate: primaryCandidate?.sortDate || null,
          sortFallback: primaryCandidate?.sortFallback || null,
          metaBadges: primaryCandidate?.metaBadges,
          note: primaryCandidate?.note,
          noteTone: primaryCandidate?.noteTone,
          highlight: primaryCandidate?.highlight,
        } satisfies PickerOption;
      })
      .sort((left, right) => {
        const dateCompare = compareNearestArrivalDates(left.sortDate || null, right.sortDate || null, left.sortFallback || null, right.sortFallback || null);
        if (dateCompare !== 0) return dateCompare;
        return comparePickerOptionLabels(left, right);
      });
  }, [amicaleDemands, bienSearch, biens, contracts]);
  const selectedTechnicianAssignmentPickerOption = useMemo(
    () =>
      technicianBienPickerOptions.find(
        (entry) =>
          String(entry.selectValue || entry.id || "").trim()
          === String(technicianAssignmentDraft.selectionId || "").trim()
      ) || null,
    [technicianAssignmentDraft.selectionId, technicianBienPickerOptions]
  );
  const bienPickerOptions = useMemo(
    () =>
      technicianBienPickerOptions.map((entry) => ({
        ...entry,
        selectValue: String(entry.sourceBienId || entry.id || "").trim(),
      })),
    [technicianBienPickerOptions]
  );

  const saveAssignment = async () => {
    if (!assignmentDraft.subadminId || selectedAssignmentContractIds.length === 0) {
      toast.error("Sous-admin et au moins un contrat obligatoires");
      return;
    }
    setSaving(true);
    try {
      const selectedOptions = selectedAssignmentContractIds
        .map((selectedId) => contractPickerOptions.find((entry) => String(entry.selectValue || entry.id || "").trim() === selectedId) || null)
        .filter(Boolean) as PickerOption[];
      let warningShown = false;

      for (const selectedOption of selectedOptions) {
        const rawSelection = String(selectedOption.selectValue || selectedOption.id || "").trim();
        const reservationDemandId = rawSelection.startsWith(RESERVATION_DEMAND_PICKER_PREFIX)
          ? rawSelection.slice(RESERVATION_DEMAND_PICKER_PREFIX.length).trim()
          : "";
        const hotelReservationDemandId = rawSelection.startsWith(HOTEL_RESERVATION_DEMAND_PICKER_PREFIX)
          ? rawSelection.slice(HOTEL_RESERVATION_DEMAND_PICKER_PREFIX.length).trim()
          : "";
        const contractId = reservationDemandId || hotelReservationDemandId ? "" : rawSelection;
        const response = await fetch(buildApiUrl("/subadmin/contracts"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subadmin_id: assignmentDraft.subadminId,
            contract_id: contractId || null,
            reservation_demand_id: reservationDemandId || String(selectedOption.reservationDemandId || "").trim() || null,
            hotel_reservation_demand_id: hotelReservationDemandId || String(selectedOption.hotelReservationDemandId || "").trim() || null,
            urgent: assignmentDraft.urgent,
            note: assignmentDraft.note,
          }),
        });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, "Affectation impossible"));
        const payload = (await response.json().catch(() => null)) as { push?: PushDispatchResult } | null;
        if (!warningShown) {
          showPushDeliveryWarning(payload?.push, "Affectation");
          warningShown = true;
        }
      }

      toast.success(
        selectedAssignmentContractIds.length > 1
          ? `${selectedAssignmentContractIds.length} affectations enregistrees.`
          : "Contrat affecte."
      );
      setAssignmentDraft((prev) => ({ ...prev, contractId: "", contractIds: [], note: "", urgent: false }));
      setAssignmentContractDetails(null);
      setAssignmentVariablesOpen(false);
      await loadAssignments();
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Affectation impossible");
    } finally {
      setSaving(false);
    }
  };

  const saveTask = async () => {
    const assignToAll = Boolean(taskDraft.urgent && taskDraft.assignToAll);
    if ((!assignToAll && !taskDraft.subadminId) || !taskDraft.title.trim()) {
      toast.error(assignToAll ? "Titre obligatoire" : "Sous-admin et titre obligatoires");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl("/subadmin/tasks"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subadmin_id: taskDraft.subadminId,
          bien_id: taskDraft.bienId || null,
          contract_id: taskDraft.contractId || null,
          title: taskDraft.title,
          note: taskDraft.note,
          urgent: taskDraft.urgent,
          assign_to_all: assignToAll,
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Creation tache impossible"));
      const payload = (await response.json().catch(() => null)) as
        | { created_count?: number; push?: PushDispatchResult }
        | null;
      const createdCount = Number(payload?.created_count || 0);
      toast.success(assignToAll ? `Tache urgente envoyee a ${createdCount || subadmins.length} sous-admins.` : "Tache creee.");
      if (!assignToAll) {
        showPushDeliveryWarning(payload?.push, "Tache");
      }
      setTaskDraft((prev) => ({
        ...prev,
        title: "",
        note: "",
        urgent: false,
        assignToAll: false,
        bienId: "",
        contractId: "",
      }));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation tache impossible");
    } finally {
      setSaving(false);
    }
  };

  const updateTask = async (task: TaskRow, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/subadmin/tasks/${encodeURIComponent(task.id)}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Mise a jour tache impossible"));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour tache impossible");
    } finally {
      setSaving(false);
    }
  };

  const completeTask = async (task: TaskRow) => {
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/subadmin/tasks/${encodeURIComponent(task.id)}/complete`), {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Cloture tache impossible"));
      toast.success("Tache deplacee dans l historique.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cloture tache impossible");
    } finally {
      setSaving(false);
    }
  };

  const updateAssignmentStatus = async (assignment: AssignmentRow, status: "active" | "in_progress" | "done") => {
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/subadmin/contracts/${encodeURIComponent(assignment.id)}/status`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Mise a jour affectation impossible"));
      toast.success(status === "done" ? "Affectation deplacee dans l'historique." : status === "in_progress" ? "Affectation marquee en cours." : "Affectation reactivee.");
      await loadAssignments();
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour affectation impossible");
    } finally {
      setSaving(false);
    }
  };

  const moveAssignment = async (assignment: AssignmentRow) => {
    const targetSubadminId = String(assignmentTransferTargets[assignment.id] || assignment.subadmin_admin_id || "").trim();
    if (!targetSubadminId || targetSubadminId === String(assignment.subadmin_admin_id || "").trim()) {
      toast.error("Choisissez un autre sous-admin pour deplacer l'affectation");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/subadmin/contracts/${encodeURIComponent(assignment.id)}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subadmin_id: targetSubadminId,
          urgent: assignment.urgent,
          note: assignment.note || "",
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Deplacement affectation impossible"));
      const payload = (await response.json().catch(() => null)) as { push?: PushDispatchResult } | null;
      toast.success("Affectation deplacee vers le nouveau sous-admin.");
      showPushDeliveryWarning(payload?.push, "Affectation");
      setAssignmentTransferTargets((prev) => {
        const next = { ...prev };
        delete next[assignment.id];
        return next;
      });
      await loadAssignments();
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Deplacement affectation impossible");
    } finally {
      setSaving(false);
    }
  };

  const saveTechnician = async () => {
    if (!technicianDraft.specialty || !technicianDraft.firstName || !technicianDraft.lastName || !technicianDraft.phone) {
      toast.error("Specialite, nom, prenom et telephone obligatoires");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        buildApiUrl(
          technicianDraft.id
            ? `/subadmin/technicians/${encodeURIComponent(technicianDraft.id)}`
            : "/subadmin/technicians"
        ),
        {
          method: technicianDraft.id ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subadmin_id: technicianDraft.subadminId || null,
            specialty: technicianDraft.specialty,
            first_name: technicianDraft.firstName,
            last_name: technicianDraft.lastName,
            phone: technicianDraft.phone,
            mobile_password: technicianDraft.mobilePassword,
            mobile_access_enabled: technicianDraft.mobileAccessEnabled,
            notes: technicianDraft.notes,
          }),
        }
      );
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Enregistrement technicien impossible"));
      toast.success(technicianDraft.id ? "Technicien mis a jour." : "Technicien cree.");
      setTechnicianDraft((prev) => ({ ...initialTechnicianDraft, subadminId: prev.subadminId || selectedSubadminId }));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement technicien impossible");
    } finally {
      setSaving(false);
    }
  };

  const saveTechnicianAssignment = async () => {
    if (!technicianAssignmentDraft.technicianId || !technicianAssignmentDraft.bienId) {
      toast.error("Technicien et bien obligatoires");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(
        technicianAssignmentDraft.id
          ? `/subadmin/technician-assignments/${encodeURIComponent(technicianAssignmentDraft.id)}`
          : "/subadmin/technician-assignments"
      ), {
        method: technicianAssignmentDraft.id ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technician_id: technicianAssignmentDraft.technicianId,
          bien_id: technicianAssignmentDraft.bienId,
          contract_id: technicianAssignmentDraft.contractId || null,
          reservation_demand_id: technicianAssignmentDraft.reservationDemandId || null,
          assignment_event_type: technicianAssignmentDraft.assignmentEventType || null,
          arrival_time: technicianAssignmentDraft.arrivalTime || null,
          departure_time: technicianAssignmentDraft.departureTime || null,
          note: technicianAssignmentDraft.note,
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, technicianAssignmentDraft.id ? "Modification affectation technicien impossible" : "Creation affectation technicien impossible"));
      const payload = (await response.json().catch(() => null)) as { push?: PushDispatchResult } | null;
      toast.success(technicianAssignmentDraft.id ? "Affectation technicien mise a jour." : "Bien affecte au technicien.");
      showPushDeliveryWarning(payload?.push, "Affectation technicien");
      setTechnicianAssignmentDraft((prev) => ({
        ...initialTechnicianAssignmentDraft,
        technicianId: prev.technicianId,
      }));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (technicianAssignmentDraft.id ? "Modification affectation technicien impossible" : "Creation affectation technicien impossible"));
    } finally {
      setSaving(false);
    }
  };

  const updateTechnicianAssignmentStatus = async (assignment: TechnicianAssignmentRow, status: "active" | "done") => {
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/subadmin/technician-assignments/${encodeURIComponent(assignment.id)}/status`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Mise a jour affectation technicien impossible"));
      toast.success(status === "done" ? "Affectation technicien terminee." : "Affectation technicien reactivee.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour affectation technicien impossible");
    } finally {
      setSaving(false);
    }
  };

  const deleteTechnician = async (technician: TechnicianRow) => {
    setDeleteTarget({
      kind: "technician",
      id: technician.id,
      title: `Supprimer ${technician.first_name} ${technician.last_name}`,
      description: "Ce technicien sera retire du site web admin et de l'application mobile.",
      path: `/subadmin/technicians/${encodeURIComponent(technician.id)}`,
      successMessage: "Technicien supprime.",
      fallbackError: "Suppression technicien impossible",
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(deleteTarget.path), {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, deleteTarget.fallbackError));
      toast.success(deleteTarget.successMessage);
      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : deleteTarget.fallbackError);
    } finally {
      setSaving(false);
    }
  };

  const tabItems = [
    { id: "assignments", label: "Affectations", icon: FileText, accent: "emerald" },
    { id: "tasks", label: "Taches", icon: AlertTriangle, accent: "amber" },
    { id: "technicians", label: "Techniciens", icon: Wrench, accent: "sky" },
    { id: "charges", label: "Charges", icon: Receipt, accent: "slate" },
  ] as const;

  return (
    <>
      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.97))] p-3.5 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:rounded-[34px] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Mobile Ops
            </div>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-950 sm:text-[2rem]">Operations sous-admin</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:leading-7">
              Affectations contrats, taches, charges et techniciens relies a l application mobile avec une interface plus propre pour la gestion quotidienne.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:min-w-[420px]">
            <div className="rounded-[22px] border border-slate-200 bg-white/92 p-3 shadow-[0_14px_35px_rgba(15,23,42,0.06)] sm:rounded-[28px]">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sous-admin actif</p>
              <select
                value={selectedSubadminId}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedSubadminId(value);
                  setAssignmentDraft((prev) => ({ ...prev, subadminId: value }));
                  setTaskDraft((prev) => ({ ...prev, subadminId: value }));
                  setTechnicianDraft((prev) => ({ ...prev, subadminId: value }));
                }}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
              >
                {subadmins.map((subadmin) => (
                  <option key={subadmin.id} value={subadmin.id}>
                    {subadmin.nom} - {subadmin.email}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                void loadReferenceData();
                void loadData();
              }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[22px] border border-slate-200 bg-white/92 px-5 text-sm font-semibold text-slate-700 shadow-[0_14px_35px_rgba(15,23,42,0.06)] transition hover:border-emerald-200 hover:text-emerald-700 sm:h-[74px] sm:rounded-[28px]"
            >
              <RefreshCw size={16} />
              Recharger
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Sous-admin" value={selectedSubadmin?.nom || "-"} tone="emerald" />
          <MetricCard label="Affectations actives" value={String(activeAssignments.length)} tone="default" />
          <MetricCard label="Affectations en cours" value={String(inProgressAssignments.length)} tone="sky" />
          <MetricCard label="Taches ouvertes" value={String(openTasks.length)} tone="amber" />
          <MetricCard label="Charges" value={String(charges.length)} tone="sky" />
        </div>

        <div className="mt-5 -mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2.5">
          {tabItems.map((tab) => {
            const isActive = activeTab === tab.id;
            const activeClasses =
              tab.accent === "amber"
                ? "border-amber-500 bg-amber-500 text-white shadow-[0_14px_28px_rgba(245,158,11,0.25)]"
                : tab.accent === "sky"
                  ? "border-sky-500 bg-sky-500 text-white shadow-[0_14px_28px_rgba(14,165,233,0.25)]"
                  : tab.accent === "slate"
                    ? "border-slate-800 bg-slate-800 text-white shadow-[0_14px_28px_rgba(15,23,42,0.20)]"
                    : "border-emerald-600 bg-emerald-600 text-white shadow-[0_14px_28px_rgba(16,185,129,0.24)]";
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                  isActive ? activeClasses : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            );
          })}
          </div>
        </div>

        {activeTab === "assignments" ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_360px]">
            <PanelSurface
              title="Nouvelle affectation contrat"
              description="Selectionnez un contrat via un popup propre, ajoutez une note terrain, puis envoyez la mission au sous-admin."
              accent="emerald"
            >
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Sous-admin</p>
                  <select
                    value={assignmentDraft.subadminId}
                    onChange={(event) => setAssignmentDraft((prev) => ({ ...prev, subadminId: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                  >
                    <option value="">Choisir le sous-admin</option>
                    {subadmins.map((subadmin) => (
                      <option key={subadmin.id} value={subadmin.id}>
                        {subadmin.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <SelectionButton
                  label="Contrat"
                  value={
                    selectedAssignmentContractIds.length > 1
                      ? `${selectedAssignmentContractIds.length} contrats selectionnes`
                      : selectedAssignmentContract
                        ? buildContractLabel(selectedAssignmentContract)
                        : selectedAssignmentContractPickerOption?.title || ""
                  }
                  placeholder="Choisir le contrat dans un popup"
                  onOpen={openContractPicker}
                  onClear={() => {
                    setAssignmentDraft((prev) => ({ ...prev, contractId: "", contractIds: [] }));
                    setAssignmentContractDetails(null);
                    setAssignmentVariablesOpen(false);
                  }}
                />

                {selectedAssignmentContractIds.length > 0 ? (
                  <div className="rounded-[24px] border border-emerald-200 bg-white/90 p-3.5 shadow-[0_14px_32px_rgba(16,185,129,0.08)] sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Variables auto-remplies</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {selectedAssignmentContractIds.length > 1
                            ? "Le lot sera affecte au sous-admin avec la meme note terrain. Les variables detaillees restent visibles seulement pour une selection unique."
                            : "Les donnees du contrat selectionne sont injectees automatiquement pour l'affectation mobile."}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedAssignmentContractIds.length === 1 && assignmentContractLoading ? (
                          <span className="text-sm font-medium text-emerald-700">Chargement...</span>
                        ) : null}
                        {selectedAssignmentContractIds.length === 1 ? (
                          <button
                            type="button"
                            onClick={() => setAssignmentVariablesOpen((prev) => !prev)}
                            className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
                          >
                            {assignmentVariablesOpen ? "Masquer les variables" : "Voir les variables"}
                          </button>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                            {selectedAssignmentContractIds.length} elements seront affectes
                          </span>
                        )}
                      </div>
                    </div>

                    {assignmentVariablesOpen && assignmentContractDetails ? (
                      <>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <AutofillField label="Contrat" value={assignmentContractDetails.contract_id} />
                          <AutofillField
                            label="Bien"
                            value={
                              [
                                assignmentContractDetails.bien_reference,
                                assignmentContractDetails.bien_titre,
                              ]
                                .filter(Boolean)
                                .join(" - ") || "-"
                            }
                          />
                          <AutofillField label="Client" value={assignmentContractDetails.client_name} />
                          <AutofillField label="Telephone client" value={assignmentContractDetails.client_phone} />
                          <AutofillField
                            label="Proprietaire"
                            value={
                              [
                                assignmentContractDetails.proprietaire_nom,
                                assignmentContractDetails.proprietaire_telephone,
                              ]
                                .filter(Boolean)
                                .join(" - ") || "-"
                            }
                          />
                          <AutofillField
                            label="Page du bien"
                            value={assignmentContractDetails.property_url ? "Lien disponible ci-dessous" : "-"}
                          />
                          <AutofillField
                            label="Google Maps"
                            value={assignmentContractDetails.google_maps_url ? "Localisation disponible ci-dessous" : "-"}
                          />
                          <AutofillField label="Date check-in" value={formatDateOnly(assignmentContractDetails.contract_start_date)} />
                          <AutofillField label="Heure check-in" value={assignmentContractDetails.arrival_time} />
                          <AutofillField label="Date check-out" value={formatDateOnly(assignmentContractDetails.contract_end_date)} />
                          <AutofillField label="Heure depart" value={assignmentContractDetails.departure_time} />
                          <AutofillField label="Montant total contrat" value={formatMoney(assignmentContractDetails.montant_total_contrat)} />
                          <AutofillField label="Montant avance" value={formatMoney(assignmentContractDetails.montant_avance)} />
                          <AutofillField label="Reste a encaisser" value={formatMoney(assignmentContractDetails.montant_a_encaisser)} />
                          <AutofillField label="Total proprietaire" value={formatMoney(assignmentContractDetails.montant_total_proprietaire)} />
                          <AutofillField label="Donne proprietaire" value={formatMoney(assignmentContractDetails.montant_donne_proprietaire)} />
                          <AutofillField label="Reste proprietaire" value={formatMoney(assignmentContractDetails.reste_a_donner_proprietaire)} />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {assignmentContractDetails.url_pdf ? (
                            <a
                              href={assignmentContractDetails.url_pdf}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
                            >
                              <FileText size={15} />
                              Contrat PDF
                            </a>
                          ) : null}
                          {assignmentContractDetails.google_maps_url ? (
                            <a
                              href={assignmentContractDetails.google_maps_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800"
                            >
                              <MapPinned size={15} />
                              Ouvrir Google Maps
                            </a>
                          ) : null}
                          {assignmentContractDetails.property_url ? (
                            <a
                              href={assignmentContractDetails.property_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                            >
                              <ExternalLink size={15} />
                              Consulter la page du bien
                            </a>
                          ) : null}
                          {assignmentContractDetails.client_phone ? (
                            <a
                              href={`tel:${assignmentContractDetails.client_phone}`}
                              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800"
                            >
                              <Phone size={15} />
                              Appeler client
                            </a>
                          ) : null}
                        </div>
                      </>
                    ) : null}

                    {assignmentVariablesOpen && !assignmentContractLoading && !assignmentContractDetails ? (
                      <div className="mt-4 rounded-[20px] border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-4 text-sm text-emerald-800">
                        Aucune variable exploitable n'a ete renvoyee pour ce contrat. Si le backend vient d'etre modifie, redemarrez le serveur Node.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Note terrain</p>
                  <textarea
                    value={assignmentDraft.note}
                    onChange={(event) => setAssignmentDraft((prev) => ({ ...prev, note: event.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                    placeholder="Instructions, encaissement, precisions client, acces, horaire..."
                  />
                </div>

                <label className="inline-flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={assignmentDraft.urgent}
                    onChange={(event) => setAssignmentDraft((prev) => ({ ...prev, urgent: event.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Marquer cette affectation comme urgente
                </label>

                <button
                  type="button"
                  onClick={() => void saveAssignment()}
                  disabled={saving}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white shadow-[0_16px_30px_rgba(16,185,129,0.28)] transition hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
                >
                  {selectedAssignmentContractIds.length > 1 ? "Affecter la selection" : "Affecter le contrat"}
                </button>
              </div>
            </PanelSurface>

            <PanelSurface
              title="Resume"
              description="Vue rapide du volume de travail courant pour le sous-admin selectionne."
              accent="slate"
            >
              <div className="grid gap-3">
                <MetricCard label="Affectations actives" value={String(activeAssignments.length)} tone="emerald" />
                <MetricCard label="Affectations en cours" value={String(inProgressAssignments.length)} tone="sky" />
                <MetricCard label="Affectations terminees" value={String(assignmentHistory.length)} tone="default" />
                <MetricCard label="Demandes adherants" value={String(amicaleDemands.length)} tone="sky" />
                <MetricCard label="Taches ouvertes" value={String(openTasks.length)} tone="amber" />
                <MetricCard label="Charges remontees" value={String(charges.length)} tone="sky" />
              </div>
            </PanelSurface>

            <div className="xl:col-span-2">
              {loading ? <EmptyState label="Chargement..." /> : null}
              {!loading && activeAssignments.length === 0 ? <EmptyState label="Aucune affectation active pour le moment." /> : null}
              {!loading && activeAssignments.length > 0 ? (
                <div className="space-y-4">
                  {activeAssignments.map((assignment) => {
                    const statusMeta = getAssignmentStatusMeta(assignment.status);
                    const normalizedStatus = normalizeAssignmentStatus(assignment.status);
                    return (
                    <article
                      key={assignment.id}
                      className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.07)] sm:rounded-[30px] sm:p-5"
                    >
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-lg font-bold text-slate-950">
                              {assignment.bien_reference || assignment.contract_id} - {assignment.bien_titre || "Bien"}
                            </h4>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                            {assignment.urgent ? (
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                                Urgent
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                            <p>Sous-admin: {assignment.subadmin_name || assignment.subadmin_admin_id}</p>
                            <p>Client: {assignment.client_name || "-"} - {assignment.client_phone || "-"}</p>
                            <p>Check-in: {assignment.arrival_time || "-"}</p>
                            <p>Proprietaire: {assignment.proprietaire_nom || "-"} - {assignment.proprietaire_telephone || "-"}</p>
                            <p>Debut: {formatDateTime(assignment.started_at)}</p>
                            <p>MAJ: {formatDateTime(assignment.updated_at)}</p>
                          </div>

                          {assignment.note ? (
                            <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                              {assignment.note}
                            </p>
                          ) : null}
                        </div>

                        <div className="grid gap-2 rounded-[22px] border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700 sm:rounded-[26px] sm:p-4 sm:grid-cols-2 xl:min-w-[360px]">
                          <span>Total contrat: {formatMoney(assignment.montant_total_contrat)}</span>
                          <span>Avance: {formatMoney(assignment.montant_avance)}</span>
                          <span>A encaisser: {formatMoney(assignment.montant_a_encaisser)}</span>
                          <span>Donne proprietaire: {formatMoney(assignment.montant_donne_proprietaire)}</span>
                          <span>Total proprietaire: {formatMoney(assignment.montant_total_proprietaire)}</span>
                          <span>Reste proprietaire: {formatMoney(assignment.reste_a_donner_proprietaire)}</span>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {assignment.url_pdf ? (
                          <a
                            href={assignment.url_pdf}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
                          >
                            <FileText size={15} />
                            Contrat PDF
                          </a>
                        ) : null}
                        {assignment.google_maps_url ? (
                          <a
                            href={assignment.google_maps_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800"
                          >
                            <MapPinned size={15} />
                            Google Maps
                          </a>
                        ) : null}
                        {assignment.property_url ? (
                          <a
                            href={assignment.property_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                          >
                            <ExternalLink size={15} />
                            Page du bien
                          </a>
                        ) : null}
                        {assignment.client_phone ? (
                          <a
                            href={`tel:${assignment.client_phone}`}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800"
                          >
                            <Phone size={15} />
                            Appeler client
                          </a>
                        ) : null}
                        {normalizedStatus !== "in_progress" ? (
                          <button
                            type="button"
                            onClick={() => void updateAssignmentStatus(assignment, "in_progress")}
                            className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800"
                          >
                            <RefreshCw size={15} />
                            Mettre en cours
                          </button>
                        ) : null}
                          <button
                            type="button"
                            onClick={() => void updateAssignmentStatus(assignment, "done")}
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
                          >
                            <CheckCircle2 size={15} />
                            Terminer
                          </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              kind: "assignment",
                              id: assignment.id,
                              title: "Supprimer cette affectation",
                              description: "Cette affectation sera retiree du dashboard admin et de l'application mobile.",
                              path: `/subadmin/contracts/${encodeURIComponent(assignment.id)}`,
                              successMessage: "Affectation supprimee.",
                              fallbackError: "Suppression affectation impossible",
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                        >
                          <Trash2 size={15} />
                          Supprimer
                        </button>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 rounded-[22px] border border-slate-200 bg-slate-50/80 p-3 sm:flex-row sm:items-center">
                        <p className="text-sm font-semibold text-slate-700 sm:min-w-[110px]">Deplacer vers</p>
                        <select
                          value={assignmentTransferTargets[assignment.id] ?? assignment.subadmin_admin_id}
                          onChange={(event) =>
                            setAssignmentTransferTargets((prev) => ({
                              ...prev,
                              [assignment.id]: event.target.value,
                            }))
                          }
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                        >
                          {subadmins.map((subadmin) => (
                            <option key={subadmin.id} value={subadmin.id}>
                              {subadmin.nom}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void moveAssignment(assignment)}
                          className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                        >
                          Deplacer
                        </button>
                      </div>
                    </article>
                    );
                  })}
                </div>
              ) : null}
              {!loading && assignmentHistory.length > 0 ? (
                <div className="mt-5 space-y-4">
                  <PanelSurface title="Historique affectations" description="Affectations terminees par le sous-admin ou par admin." accent="slate">
                    <div className="space-y-3">
                      {assignmentHistory.map((assignment) => (
                        <article key={assignment.id} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px]">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="font-bold text-slate-950">
                                {assignment.bien_reference || assignment.contract_id} - {assignment.bien_titre || "Bien"}
                              </h4>
                              <p className="text-sm text-slate-600">
                                {assignment.subadmin_name || assignment.subadmin_admin_id} • {assignment.client_name || "-"}
                              </p>
                            </div>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Terminee le {formatDateTime(assignment.completed_at)}
                            </span>
                          </div>
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "assignment",
                                  id: assignment.id,
                                  title: "Supprimer cette affectation historisee",
                                  description: "Cette affectation sera retiree definitivement de l'historique admin.",
                                  path: `/subadmin/contracts/${encodeURIComponent(assignment.id)}`,
                                  successMessage: "Affectation supprimee.",
                                  fallbackError: "Suppression affectation impossible",
                                })
                              }
                              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                            >
                              <Trash2 size={15} />
                              Supprimer
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </PanelSurface>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "tasks" ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <PanelSurface
              title="Creer une tache"
              description="Utilisez les popups pour choisir un bien ou un contrat sans casser la mise en page."
              accent="amber"
            >
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Sous-admin</p>
                  <select
                    value={taskDraft.subadminId}
                    onChange={(event) => setTaskDraft((prev) => ({ ...prev, subadminId: event.target.value }))}
                    disabled={taskDraft.urgent && taskDraft.assignToAll}
                    className="h-12 w-full rounded-2xl border border-amber-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100/70"
                  >
                    <option value="">Choisir le sous-admin</option>
                    {subadmins.map((subadmin) => (
                      <option key={subadmin.id} value={subadmin.id}>
                        {subadmin.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <SelectionButton
                  label="Bien"
                  value={selectedTaskBien ? buildBienLabel(selectedTaskBien) : ""}
                  placeholder="Choisir le bien dans un popup"
                  onOpen={() => setPickerOpen("bien")}
                  onClear={() => setTaskDraft((prev) => ({ ...prev, bienId: "" }))}
                  accent="amber"
                />

                <SelectionButton
                  label="Contrat lie"
                  value={selectedTaskContract ? buildContractLabel(selectedTaskContract) : ""}
                  placeholder="Lier un contrat si besoin"
                  onOpen={() => setPickerOpen("contract")}
                  onClear={() => setTaskDraft((prev) => ({ ...prev, contractId: "" }))}
                  accent="amber"
                />

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Titre</p>
                  <input
                    value={taskDraft.title}
                    onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-amber-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-4 focus:ring-amber-100/70"
                    placeholder="Titre de la tache"
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Instruction</p>
                  <textarea
                    value={taskDraft.note}
                    onChange={(event) => setTaskDraft((prev) => ({ ...prev, note: event.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-4 focus:ring-amber-100/70"
                    placeholder="Details ou consigne..."
                  />
                </div>

                <label className="inline-flex items-center gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={taskDraft.urgent}
                    onChange={(event) =>
                      setTaskDraft((prev) => ({
                        ...prev,
                        urgent: event.target.checked,
                        assignToAll: event.target.checked ? prev.assignToAll : false,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                  />
                  Tache urgente
                </label>

                {taskDraft.urgent ? (
                  <label className="inline-flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm font-medium text-rose-900">
                    <input
                      type="checkbox"
                      checked={taskDraft.assignToAll}
                      onChange={(event) =>
                        setTaskDraft((prev) => ({
                          ...prev,
                          assignToAll: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                    />
                    Affecter cette tache urgente a tous les sous-admins
                  </label>
                ) : null}

                <button
                  type="button"
                  onClick={() => void saveTask()}
                  disabled={saving}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-amber-500 px-5 text-sm font-bold text-white shadow-[0_16px_30px_rgba(245,158,11,0.25)] transition hover:bg-amber-600 disabled:opacity-60 sm:w-auto"
                >
                  Ajouter la tache
                </button>
              </div>
            </PanelSurface>

            <div className="space-y-5">
              <PanelSurface title="Taches en cours" description="Suivi des taches ouvertes et reassignment rapide." accent="slate">
                <div className="space-y-3">
                  {openTasks.length === 0 ? <EmptyState label="Aucune tache ouverte." /> : null}
                  {openTasks.map((task) => (
                    <article key={task.id} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px]">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-bold text-slate-950">{task.title}</h4>
                            {task.urgent ? (
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                                Urgent
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{task.subadmin_name || task.subadmin_admin_id}</p>
                          {task.note ? <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{task.note}</p> : null}
                          {task.property_url ? (
                            <a
                              href={task.property_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"
                            >
                              <ExternalLink size={14} />
                              Consulter la page du bien
                            </a>
                          ) : null}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row xl:max-w-[340px] xl:justify-end">
                          <select
                            value={task.subadmin_admin_id}
                            onChange={(event) => void updateTask(task, { subadmin_id: event.target.value })}
                            aria-label="Deplacer la tache vers un autre sous-admin"
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                          >
                            {subadmins.map((subadmin) => (
                              <option key={subadmin.id} value={subadmin.id}>
                                {subadmin.nom}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void updateTask(task, { urgent: !task.urgent })}
                            className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 sm:w-auto"
                          >
                            {task.urgent ? "Retirer urgent" : "Marquer urgent"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void completeTask(task)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 sm:w-auto"
                          >
                            <CheckCircle2 size={15} />
                            Terminer
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                kind: "task",
                                id: task.id,
                                title: "Supprimer cette tache",
                                description: "Cette tache sera retiree du site web admin et de l'application mobile.",
                                path: `/subadmin/tasks/${encodeURIComponent(task.id)}`,
                                successMessage: "Tache supprimee.",
                                fallbackError: "Suppression tache impossible",
                              })
                            }
                            className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 sm:w-auto"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </PanelSurface>

              <PanelSurface title="Historique" description="Taches cloturees avec date de completion." accent="slate">
                <div className="space-y-3">
                  {historyTasks.length === 0 ? <EmptyState label="Aucune tache terminee." /> : null}
                  {historyTasks.map((task) => (
                    <article key={task.id} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="font-bold text-slate-950">{task.title}</h4>
                          <p className="text-sm text-slate-600">{task.subadmin_name || task.subadmin_admin_id}</p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                          Terminee le {formatDateTime(task.completed_at)}
                        </span>
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              kind: "task",
                              id: task.id,
                              title: "Supprimer cette tache historisee",
                              description: "Cette tache sera retiree definitivement de l'historique admin et mobile.",
                              path: `/subadmin/tasks/${encodeURIComponent(task.id)}`,
                              successMessage: "Tache supprimee.",
                              fallbackError: "Suppression tache impossible",
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                        >
                          <Trash2 size={15} />
                          Supprimer
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </PanelSurface>
            </div>
          </div>
        ) : null}

        {activeTab === "technicians" ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <PanelSurface
              title={technicianDraft.id ? "Modifier technicien" : "Creer un technicien"}
              description="Contacts terrain disponibles pour un sous-admin specifique ou pour tous."
              accent="sky"
            >
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Visibilite</p>
                  <select
                    value={technicianDraft.subadminId}
                    onChange={(event) => setTechnicianDraft((prev) => ({ ...prev, subadminId: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-sky-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70"
                  >
                    <option value="">Visible pour tous les sous-admins</option>
                    {subadmins.map((subadmin) => (
                      <option key={subadmin.id} value={subadmin.id}>
                        {subadmin.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Specialite</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {technicianPresets.map((preset) => {
                      const Icon = preset.icon;
                      const isActive = technicianDraft.specialty.trim().toLowerCase() === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => setTechnicianDraft((prev) => ({ ...prev, specialty: preset.value }))}
                          className={`rounded-[22px] border px-4 py-3 text-left transition ${
                            isActive
                              ? `${preset.tone} shadow-[0_14px_24px_rgba(14,165,233,0.14)]`
                              : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${isActive ? "bg-white/80" : "bg-slate-100"}`}>
                              <Icon size={16} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold">{preset.label}</span>
                              <span className="block text-xs text-slate-500">{preset.hint}</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={technicianDraft.specialty}
                    onChange={(event) => setTechnicianDraft((prev) => ({ ...prev, specialty: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-sky-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70"
                    placeholder="Ou saisir une autre specialite"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={technicianDraft.firstName}
                    onChange={(event) => setTechnicianDraft((prev) => ({ ...prev, firstName: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-sky-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70"
                    placeholder="Prenom"
                  />
                  <input
                    value={technicianDraft.lastName}
                    onChange={(event) => setTechnicianDraft((prev) => ({ ...prev, lastName: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-sky-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70"
                    placeholder="Nom"
                  />
                </div>
                <input
                  value={technicianDraft.phone}
                  onChange={(event) => setTechnicianDraft((prev) => ({ ...prev, phone: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-sky-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70"
                  placeholder="Telephone"
                />
                <input
                  value={technicianDraft.mobilePassword}
                  onChange={(event) => setTechnicianDraft((prev) => ({ ...prev, mobilePassword: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-sky-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70"
                  placeholder={technicianDraft.id ? "Nouveau mot de passe application (laisser vide pour conserver)" : "Mot de passe application"}
                />
                <label className="inline-flex items-center gap-3 rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={technicianDraft.mobileAccessEnabled}
                    onChange={(event) => setTechnicianDraft((prev) => ({ ...prev, mobileAccessEnabled: event.target.checked }))}
                    className="h-4 w-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                  />
                  Activer le dashboard technicien dans l'application mobile
                </label>
                <textarea
                  value={technicianDraft.notes}
                  onChange={(event) => setTechnicianDraft((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={4}
                  className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70"
                  placeholder="Notes optionnelles"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => void saveTechnician()}
                    disabled={saving}
                    className="w-full rounded-2xl bg-sky-600 px-5 py-3 text-sm font-bold text-white shadow-[0_16px_30px_rgba(14,165,233,0.25)] transition hover:bg-sky-700 disabled:opacity-60 sm:w-auto"
                  >
                    {technicianDraft.id ? "Enregistrer" : "Creer"}
                  </button>
                  {technicianDraft.id ? (
                    <button
                      type="button"
                      onClick={() => setTechnicianDraft((prev) => ({ ...initialTechnicianDraft, subadminId: prev.subadminId || selectedSubadminId }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 sm:w-auto"
                    >
                      Annuler
                    </button>
                  ) : null}
                </div>
              </div>
            </PanelSurface>

            <div className="space-y-5">
              <PanelSurface title="Affecter un bien au technicien" description="Le technicien recevra la reference, le lien site, Google Maps et la galerie photo dans l'application." accent="emerald">
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Technicien</p>
                    <select
                      value={technicianAssignmentDraft.technicianId}
                      onChange={(event) => setTechnicianAssignmentDraft((prev) => ({ ...prev, technicianId: event.target.value }))}
                      className="h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                    >
                      <option value="">Choisir le technicien</option>
                      {technicians
                        .filter((entry) => Boolean(entry.mobile_access_enabled))
                        .map((technician) => (
                          <option key={technician.id} value={technician.id}>
                            {technician.first_name} {technician.last_name} - {technician.specialty}
                          </option>
                        ))}
                    </select>
                  </div>
                  <SelectionButton
                    label="Bien"
                    value={
                      selectedTechnicianAssignmentPickerOption
                        ? String(selectedTechnicianAssignmentPickerOption.subtitle || selectedTechnicianAssignmentPickerOption.title || "")
                        : selectedTechnicianAssignmentBien
                          ? buildBienLabel(selectedTechnicianAssignmentBien)
                          : ""
                    }
                    placeholder="Choisir le bien dans un popup"
                    onOpen={() => setPickerOpen("bien")}
                    onClear={() =>
                      setTechnicianAssignmentDraft((prev) => ({
                        ...prev,
                        bienId: "",
                        selectionId: "",
                        contractId: "",
                        reservationDemandId: "",
                        assignmentEventType: "",
                        arrivalTime: "",
                        departureTime: "",
                      }))
                    }
                    accent="emerald"
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Heure arrivee</p>
                      <input
                        type="time"
                        value={technicianAssignmentDraft.arrivalTime}
                        onChange={(event) => setTechnicianAssignmentDraft((prev) => ({ ...prev, arrivalTime: event.target.value }))}
                        className="h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Heure depart</p>
                      <input
                        type="time"
                        value={technicianAssignmentDraft.departureTime}
                        onChange={(event) => setTechnicianAssignmentDraft((prev) => ({ ...prev, departureTime: event.target.value }))}
                        className="h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                      />
                    </div>
                  </div>
                  <textarea
                    value={technicianAssignmentDraft.note}
                    onChange={(event) => setTechnicianAssignmentDraft((prev) => ({ ...prev, note: event.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                    placeholder="Note ou consigne pour le technicien"
                  />
                  <button
                    type="button"
                    onClick={() => void saveTechnicianAssignment()}
                    disabled={saving}
                    className="w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-[0_16px_30px_rgba(16,185,129,0.22)] transition hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
                  >
                    {technicianAssignmentDraft.id ? "Enregistrer modification" : "Affecter le bien"}
                  </button>
                  {technicianAssignmentDraft.id ? (
                    <button
                      type="button"
                      onClick={() =>
                        setTechnicianAssignmentDraft((prev) => ({
                          ...initialTechnicianAssignmentDraft,
                          technicianId: prev.technicianId,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 sm:w-auto"
                    >
                      Annuler modification
                    </button>
                  ) : null}
                </div>
              </PanelSurface>

              <PanelSurface title="Techniciens enregistres" description="Carnet terrain partage ou assigne." accent="slate">
                <div className="space-y-3">
                  {technicians.length === 0 ? <EmptyState label="Aucun technicien enregistre." /> : null}
                  {technicians.map((technician) => (
                    <article key={technician.id} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px]">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {(() => {
                              const specialtyMeta = getTechnicianSpecialtyMeta(technician.specialty);
                              const SpecialtyIcon = specialtyMeta.icon;
                              return (
                                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${specialtyMeta.tone}`}>
                                  <SpecialtyIcon size={17} />
                                </span>
                              );
                            })()}
                            <h4 className="font-bold text-slate-950">
                              {technician.first_name} {technician.last_name}
                            </h4>
                            {(() => {
                              const specialtyMeta = getTechnicianSpecialtyMeta(technician.specialty);
                              return (
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${specialtyMeta.tone}`}>
                                  {technician.specialty}
                                </span>
                              );
                            })()}
                            {technician.mobile_access_enabled ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                App active
                              </span>
                            ) : (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                                App inactive
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{technician.phone}</p>
                          <p className="text-sm text-slate-500">
                            {technician.subadmin_name ? `Visible pour ${technician.subadmin_name}` : "Visible pour tous les sous-admins"}
                          </p>
                          <p className="text-xs text-slate-400">
                            Derniere connexion: {technician.last_login_at ? formatDateTime(technician.last_login_at) : "-"}
                          </p>
                          {technician.notes ? <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{technician.notes}</p> : null}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <button
                            type="button"
                            onClick={() =>
                              setTechnicianDraft({
                                id: technician.id,
                                subadminId: technician.subadmin_admin_id || "",
                                specialty: technician.specialty,
                                firstName: technician.first_name,
                                lastName: technician.last_name,
                                phone: technician.phone,
                                mobilePassword: "",
                                mobileAccessEnabled: Boolean(technician.mobile_access_enabled),
                                notes: technician.notes || "",
                              })
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 sm:w-auto"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteTechnician(technician)}
                            className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 sm:w-auto"
                          >
                            <Trash2 size={15} className="inline-block" />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </PanelSurface>

              <PanelSurface title="Affectations technicien" description="Biens en cours chez les techniciens avec liens directs." accent="slate">
                <div className="space-y-3">
                  {activeTechnicianAssignments.length === 0 ? <EmptyState label="Aucune affectation technicien active." /> : null}
                  {activeTechnicianAssignments.map((assignment) => (
                    <article key={assignment.id} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px]">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-950">
                            {assignment.bien_reference || assignment.bien_id} - {assignment.bien_titre || "Bien"}
                          </h4>
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                            {assignment.specialty || "Technicien"}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">
                          {assignment.technician_name || assignment.technician_id} - {assignment.technician_phone || "-"}
                        </p>
                        {assignment.note ? <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{assignment.note}</p> : null}
                        {Array.isArray(assignment.gallery_urls) && assignment.gallery_urls.length > 0 ? (
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {assignment.gallery_urls.slice(0, 6).map((url, index) => (
                              <a key={`${assignment.id}-gallery-${index}`} href={url} target="_blank" rel="noreferrer" className="block shrink-0">
                                <img src={url} alt={`gallery-${index}`} className="h-16 w-24 rounded-2xl object-cover" />
                              </a>
                            ))}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setTechnicianAssignmentDraft({
                                id: assignment.id,
                                technicianId: assignment.technician_id,
                                bienId: assignment.bien_id,
                                selectionId: assignment.reservation_demand_id
                                  ? `${TECHNICIAN_DEMAND_PICKER_PREFIX}${assignment.reservation_demand_id}`
                                  : assignment.contract_id
                                    ? `${TECHNICIAN_CONTRACT_PICKER_PREFIX}${assignment.contract_id}`
                                    : assignment.bien_id,
                                contractId: assignment.contract_id || "",
                                reservationDemandId: assignment.reservation_demand_id || "",
                                assignmentEventType: assignment.assignment_event_type || "",
                                arrivalTime: assignment.arrival_time || "",
                                departureTime: assignment.departure_time || "",
                                note: assignment.note || "",
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                          >
                            <Wrench size={15} />
                            Modifier
                          </button>
                          {assignment.property_url ? (
                            <a href={assignment.property_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                              <ExternalLink size={15} />
                              Ouvrir le bien
                            </a>
                          ) : null}
                          {assignment.google_maps_url ? (
                            <a href={assignment.google_maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800">
                              <MapPinned size={15} />
                              Google Maps
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void updateTechnicianAssignmentStatus(assignment, "done")}
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
                          >
                            <CheckCircle2 size={15} />
                            Terminer
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                kind: "technician_assignment",
                                id: assignment.id,
                                title: "Supprimer cette affectation technicien",
                                description: "Cette affectation sera retiree du dashboard technicien et du site admin.",
                                path: `/subadmin/technician-assignments/${encodeURIComponent(assignment.id)}`,
                                successMessage: "Affectation technicien supprimee.",
                                fallbackError: "Suppression affectation technicien impossible",
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                          >
                            <Trash2 size={15} />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </PanelSurface>

              <PanelSurface title="Historique technicien" description="Affectations terminees par les techniciens." accent="slate">
                <div className="space-y-3">
                  {historyTechnicianAssignments.length === 0 ? <EmptyState label="Aucun historique technicien." /> : null}
                  {historyTechnicianAssignments.map((assignment) => (
                    <article key={assignment.id} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="font-bold text-slate-950">
                            {assignment.bien_reference || assignment.bien_id} - {assignment.bien_titre || "Bien"}
                          </h4>
                          <p className="text-sm text-slate-600">{assignment.technician_name || assignment.technician_id}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Terminee le {formatDateTime(assignment.completed_at)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                kind: "technician_assignment",
                                id: assignment.id,
                                title: "Supprimer cet historique technicien",
                                description: "Cette ligne sera retiree definitivement de l'historique technicien.",
                                path: `/subadmin/technician-assignments/${encodeURIComponent(assignment.id)}`,
                                successMessage: "Historique technicien supprime.",
                                fallbackError: "Suppression affectation technicien impossible",
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                          >
                            <Trash2 size={15} />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </PanelSurface>
            </div>
          </div>
        ) : null}

        {activeTab === "charges" ? (
          <div className="mt-6">
            <PanelSurface title="Charges remontees" description="Photos et remarques envoyees depuis le mobile." accent="slate">
              <div className="space-y-3">
                {charges.length === 0 ? <EmptyState label="Aucune charge remontee." /> : null}
                {charges.map((charge) => (
                  <article key={charge.id} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-950">{charge.subadmin_name || charge.subadmin_admin_id}</h4>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                            Charge
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-700">{charge.note}</p>
                        <p className="mt-3 text-xs font-medium text-slate-500">{formatDateTime(charge.created_at)}</p>
                      </div>
                      {charge.image_url ? (
                        <a
                          href={charge.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 sm:w-auto"
                        >
                          <ExternalLink size={15} />
                          Voir l image
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            kind: "charge",
                            id: charge.id,
                            title: "Supprimer cette charge",
                            description: "La charge et son justificatif image seront retires du site web admin et de l'application mobile.",
                            path: `/subadmin/charges/${encodeURIComponent(charge.id)}`,
                            successMessage: "Charge supprimee.",
                            fallbackError: "Suppression charge impossible",
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                      >
                        <Trash2 size={15} />
                        Supprimer
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </PanelSurface>
          </div>
        ) : null}
      </section>

      <SelectionDialog
        open={pickerOpen === "contract"}
        onOpenChange={(open) => {
          if (!open) {
            setPickerOpen(null);
            return;
          }
          void loadReferenceData();
        }}
        title="Choisir le contrat"
        description="Contrats et demandes adherants visibles dans une seule liste, tries par arrivee la plus proche."
        searchValue={contractSearch}
        onSearchChange={setContractSearch}
        options={
          activeTab === "tasks"
            ? contractPickerOptions.map((option) => ({
                ...option,
                disabled:
                  option.disabled
                  || String(option.selectValue || "").trim().startsWith(RESERVATION_DEMAND_PICKER_PREFIX)
                  || String(option.selectValue || "").trim().startsWith(HOTEL_RESERVATION_DEMAND_PICKER_PREFIX),
              }))
            : contractPickerOptions
        }
        selectedId={activeTab === "tasks" ? taskDraft.contractId : assignmentDraft.contractId}
        selectedIds={activeTab === "assignments" ? selectedAssignmentContractIds : undefined}
        selectionMode={activeTab === "assignments" ? "multiple" : "single"}
        onSelect={(id) => {
          if (activeTab === "tasks") {
            setTaskDraft((prev) => ({ ...prev, contractId: id }));
            setPickerOpen(null);
          } else {
            setAssignmentDraft((prev) => {
              const normalizedId = String(id || "").trim();
              const existing = Array.from(new Set((prev.contractIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
              const nextIds = existing.includes(normalizedId)
                ? existing.filter((value) => value !== normalizedId)
                : [...existing, normalizedId];
              return {
                ...prev,
                contractIds: nextIds,
                contractId: nextIds[0] || "",
              };
            });
          }
        }}
        onConfirmSelection={(ids) => {
          if (activeTab !== "assignments") return;
          setAssignmentDraft((prev) => ({
            ...prev,
            contractIds: ids,
            contractId: ids[0] || "",
          }));
        }}
        emptyLabel="Aucun contrat correspondant."
      />

      <SelectionDialog
        open={pickerOpen === "bien"}
        onOpenChange={(open) => {
          if (!open) setPickerOpen(null);
        }}
        title="Choisir le bien"
        description="Selectionnez un bien avec une presentation propre, sans liste deroulante casseuse de layout."
        searchValue={bienSearch}
        onSearchChange={setBienSearch}
        options={activeTab === "technicians" ? technicianBienPickerOptions : bienPickerOptions}
        selectedId={activeTab === "technicians" ? technicianAssignmentDraft.selectionId : taskDraft.bienId}
        onSelect={(id) => {
          if (activeTab === "technicians") {
            const option = technicianBienPickerOptions.find(
              (entry) => String(entry.selectValue || entry.id || "").trim() === String(id || "").trim()
            ) || null;
            setTechnicianAssignmentDraft((prev) => ({
              ...prev,
              bienId: String(option?.sourceBienId || "").trim(),
              selectionId: String(option?.selectValue || id || "").trim(),
              contractId: String(option?.contractId || "").trim(),
              reservationDemandId: String(option?.reservationDemandId || "").trim(),
              assignmentEventType: String(option?.assignmentEventType || "").trim(),
              arrivalTime: "",
              departureTime: "",
            }));
          } else {
            setTaskDraft((prev) => ({ ...prev, bienId: id }));
          }
          setPickerOpen(null);
        }}
        emptyLabel="Aucun bien correspondant."
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <DialogContent className="max-w-lg rounded-[24px] border border-rose-100 bg-white p-0 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:rounded-[30px]">
          <div className="overflow-hidden rounded-[24px] sm:rounded-[30px]">
            <div className="border-b border-rose-100 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.12),transparent_48%),linear-gradient(135deg,#fffafb_0%,#ffffff_55%,#fff1f2_100%)] px-5 py-5">
              <DialogHeader className="text-left">
                <DialogTitle className="text-xl font-bold text-slate-950">{deleteTarget?.title || "Confirmer la suppression"}</DialogTitle>
                <DialogDescription className="text-sm leading-6 text-slate-600">
                  {deleteTarget?.description || "Cette action est definitive."}
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="px-5 py-5">
              <p className="text-sm text-slate-600">
                Seul l'admin sur le site web peut faire ce nettoyage. Cette action est irreversible.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Trash2 size={15} />
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
