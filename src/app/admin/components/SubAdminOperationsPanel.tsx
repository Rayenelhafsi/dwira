import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  ExternalLink,
  FileText,
  MapPinned,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  Wrench,
  X,
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
  note?: string | null;
  bien_reference?: string | null;
  bien_titre?: string | null;
  google_maps_url?: string | null;
  property_url?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  arrival_time?: string | null;
  url_pdf?: string | null;
  proprietaire_nom?: string | null;
  proprietaire_telephone?: string | null;
  montant_total_contrat?: number | null;
  montant_avance?: number | null;
  montant_a_encaisser?: number | null;
  montant_donne_proprietaire?: number | null;
  montant_total_proprietaire?: number | null;
  reste_a_donner_proprietaire?: number | null;
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
};

type ContractOption = {
  id: string;
  bien_titre?: string;
  bien_reference?: string;
  locataire_nom?: string;
  created_at?: string;
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

type PanelTab = "assignments" | "tasks" | "technicians" | "charges";

type PickerVariant = "contract" | "bien";

type PickerOption = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
};

const initialAssignmentDraft = {
  subadminId: "",
  contractId: "",
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
  notes: "",
};

async function getApiErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return String(data?.error || fallback);
  } catch {
    return fallback;
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
  onSelect,
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
  onSelect: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-[24px] border border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.98))] p-0 shadow-[0_30px_80px_rgba(15,23,42,0.20)] sm:rounded-[30px]">
        <div className="overflow-hidden rounded-[24px] sm:rounded-[30px]">
          <div className="border-b border-emerald-100 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_48%),linear-gradient(135deg,#f8fffc_0%,#ffffff_55%,#f0fdf4_100%)] px-4 py-4 sm:px-6 sm:py-5">
            <DialogHeader className="text-left">
              <DialogTitle className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">{description}</DialogDescription>
            </DialogHeader>
            <div className="relative mt-4">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Rechercher..."
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
                  const isSelected = option.id === selectedId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelect(option.id)}
                      className={`flex w-full items-start gap-3 rounded-[24px] border px-3 py-3 text-left transition sm:rounded-3xl sm:px-4 sm:py-4 ${
                        isSelected
                          ? "border-emerald-300 bg-emerald-50 shadow-[0_12px_24px_rgba(16,185,129,0.10)]"
                          : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          isSelected ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent"
                        }`}
                      >
                        <Check size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{option.title}</span>
                        {option.subtitle ? <span className="mt-1 block text-sm text-slate-500">{option.subtitle}</span> : null}
                      </span>
                      {option.badge ? (
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                          {option.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianRow[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [biens, setBiens] = useState<BienOption[]>([]);
  const [assignmentDraft, setAssignmentDraft] = useState(initialAssignmentDraft);
  const [taskDraft, setTaskDraft] = useState(initialTaskDraft);
  const [technicianDraft, setTechnicianDraft] = useState(initialTechnicianDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<PickerVariant | null>(null);
  const [contractSearch, setContractSearch] = useState("");
  const [bienSearch, setBienSearch] = useState("");
  const [assignmentContractDetails, setAssignmentContractDetails] = useState<ContractAutofill | null>(null);
  const [assignmentContractLoading, setAssignmentContractLoading] = useState(false);
  const [assignmentVariablesOpen, setAssignmentVariablesOpen] = useState(false);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const suffix = selectedSubadminId ? `?subadmin_id=${encodeURIComponent(selectedSubadminId)}` : "";
      const [assignmentsResponse, tasksResponse, chargesResponse, techniciansResponse] = await Promise.all([
        fetch(buildApiUrl(`/subadmin/contracts${suffix}`), { credentials: "include" }),
        fetch(buildApiUrl(`/subadmin/tasks${suffix}`), { credentials: "include" }),
        fetch(buildApiUrl(`/subadmin/charges${suffix}`), { credentials: "include" }),
        fetch(buildApiUrl(`/subadmin/technicians${suffix}`), { credentials: "include" }),
      ]);
      if (!assignmentsResponse.ok) throw new Error(await getApiErrorMessage(assignmentsResponse, "Impossible de charger les affectations"));
      if (!tasksResponse.ok) throw new Error(await getApiErrorMessage(tasksResponse, "Impossible de charger les taches"));
      if (!chargesResponse.ok) throw new Error(await getApiErrorMessage(chargesResponse, "Impossible de charger les charges"));
      if (!techniciansResponse.ok) throw new Error(await getApiErrorMessage(techniciansResponse, "Impossible de charger les techniciens"));
      const [assignmentsRows, tasksRows, chargesRows, techniciansRows] = await Promise.all([
        assignmentsResponse.json().catch(() => []),
        tasksResponse.json().catch(() => []),
        chargesResponse.json().catch(() => []),
        techniciansResponse.json().catch(() => []),
      ]);
      setAssignments(Array.isArray(assignmentsRows) ? assignmentsRows : []);
      setTasks(Array.isArray(tasksRows) ? tasksRows : []);
      setCharges(Array.isArray(chargesRows) ? chargesRows : []);
      setTechnicians(Array.isArray(techniciansRows) ? techniciansRows : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement sous-admin impossible");
    } finally {
      setLoading(false);
    }
  }, [selectedSubadminId]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const contractId = String(assignmentDraft.contractId || "").trim();
    if (!contractId) {
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
  }, [assignmentDraft.contractId]);

  const openTasks = useMemo(() => tasks.filter((task) => task.status === "open"), [tasks]);
  const historyTasks = useMemo(() => tasks.filter((task) => task.status === "done"), [tasks]);

  const selectedAssignmentContract = useMemo(
    () => contracts.find((entry) => entry.id === assignmentDraft.contractId) || null,
    [assignmentDraft.contractId, contracts]
  );
  const selectedTaskBien = useMemo(
    () => biens.find((entry) => entry.id === taskDraft.bienId) || null,
    [biens, taskDraft.bienId]
  );
  const selectedTaskContract = useMemo(
    () => contracts.find((entry) => entry.id === taskDraft.contractId) || null,
    [contracts, taskDraft.contractId]
  );

  const contractPickerOptions = useMemo(() => {
    const needle = contractSearch.trim().toLowerCase();
    return contracts
      .filter((contract) => {
        if (!needle) return true;
        return [
          contract.id,
          contract.bien_reference,
          contract.bien_titre,
          contract.locataire_nom,
          contract.created_at,
        ]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(needle));
      })
      .map((contract) => ({
        id: contract.id,
        title: String(contract.bien_titre || contract.id),
        subtitle: [String(contract.id || "").trim(), String(contract.locataire_nom || "").trim()].filter(Boolean).join(" • "),
        badge: contract.created_at ? formatDateTime(contract.created_at).slice(0, 10) : undefined,
      }));
  }, [contractSearch, contracts]);

  const bienPickerOptions = useMemo(() => {
    const needle = bienSearch.trim().toLowerCase();
    return biens
      .filter((bien) => {
        if (!needle) return true;
        return [bien.id, bien.reference, bien.titre]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(needle));
      })
      .map((bien) => ({
        id: bien.id,
        title: String(bien.titre || bien.reference || bien.id),
        subtitle: String(buildBienLabel(bien)),
        badge: String(bien.reference || "").trim() || undefined,
      }));
  }, [bienSearch, biens]);

  const saveAssignment = async () => {
    if (!assignmentDraft.subadminId || !assignmentDraft.contractId) {
      toast.error("Sous-admin et contrat obligatoires");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl("/subadmin/contracts"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subadmin_id: assignmentDraft.subadminId,
          contract_id: assignmentDraft.contractId,
          urgent: assignmentDraft.urgent,
          note: assignmentDraft.note,
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Affectation impossible"));
      toast.success("Contrat affecte.");
      setAssignmentDraft((prev) => ({ ...prev, contractId: "", note: "", urgent: false }));
      setAssignmentContractDetails(null);
      setAssignmentVariablesOpen(false);
      await loadData();
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
      const payload = await response.json().catch(() => null);
      const createdCount = Number(payload?.created_count || 0);
      toast.success(assignToAll ? `Tache urgente envoyee a ${createdCount || subadmins.length} sous-admins.` : "Tache creee.");
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

  const deleteTechnician = async (technician: TechnicianRow) => {
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/subadmin/technicians/${encodeURIComponent(technician.id)}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Suppression technicien impossible"));
      toast.success("Technicien supprime.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression technicien impossible");
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
              onClick={() => void loadData()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[22px] border border-slate-200 bg-white/92 px-5 text-sm font-semibold text-slate-700 shadow-[0_14px_35px_rgba(15,23,42,0.06)] transition hover:border-emerald-200 hover:text-emerald-700 sm:h-[74px] sm:rounded-[28px]"
            >
              <RefreshCw size={16} />
              Recharger
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Sous-admin" value={selectedSubadmin?.nom || "-"} tone="emerald" />
          <MetricCard label="Affectations" value={String(assignments.length)} tone="default" />
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
                  value={selectedAssignmentContract ? buildContractLabel(selectedAssignmentContract) : ""}
                  placeholder="Choisir le contrat dans un popup"
                  onOpen={() => setPickerOpen("contract")}
                  onClear={() => {
                    setAssignmentDraft((prev) => ({ ...prev, contractId: "" }));
                    setAssignmentContractDetails(null);
                    setAssignmentVariablesOpen(false);
                  }}
                />

                {assignmentDraft.contractId ? (
                  <div className="rounded-[24px] border border-emerald-200 bg-white/90 p-3.5 shadow-[0_14px_32px_rgba(16,185,129,0.08)] sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Variables auto-remplies</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Les donnees du contrat selectionne sont injectees automatiquement pour l&apos;affectation mobile.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {assignmentContractLoading ? (
                          <span className="text-sm font-medium text-emerald-700">Chargement...</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setAssignmentVariablesOpen((prev) => !prev)}
                          className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
                        >
                          {assignmentVariablesOpen ? "Masquer les variables" : "Voir les variables"}
                        </button>
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
                        Aucune variable exploitable n&apos;a ete renvoyee pour ce contrat. Si le backend vient d&apos;etre modifie, redemarrez le serveur Node.
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
                  Affecter le contrat
                </button>
              </div>
            </PanelSurface>

            <PanelSurface
              title="Resume"
              description="Vue rapide du volume de travail courant pour le sous-admin selectionne."
              accent="slate"
            >
              <div className="grid gap-3">
                <MetricCard label="Affectations actives" value={String(assignments.length)} tone="emerald" />
                <MetricCard label="Taches ouvertes" value={String(openTasks.length)} tone="amber" />
                <MetricCard label="Charges remontees" value={String(charges.length)} tone="sky" />
              </div>
            </PanelSurface>

            <div className="xl:col-span-2">
              {loading ? <EmptyState label="Chargement..." /> : null}
              {!loading && assignments.length === 0 ? <EmptyState label="Aucune affectation pour le moment." /> : null}
              {!loading && assignments.length > 0 ? (
                <div className="space-y-4">
                  {assignments.map((assignment) => (
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
                      </div>
                    </article>
                  ))}
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
                <input
                  value={technicianDraft.specialty}
                  onChange={(event) => setTechnicianDraft((prev) => ({ ...prev, specialty: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-sky-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70"
                  placeholder="Specialite: plombier, electricien..."
                />
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

            <PanelSurface title="Techniciens enregistres" description="Carnet terrain partage ou assigne." accent="slate">
              <div className="space-y-3">
                {technicians.length === 0 ? <EmptyState label="Aucun technicien enregistre." /> : null}
                {technicians.map((technician) => (
                  <article key={technician.id} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[28px]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-950">
                            {technician.first_name} {technician.last_name}
                          </h4>
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                            {technician.specialty}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{technician.phone}</p>
                        <p className="text-sm text-slate-500">
                          {technician.subadmin_name ? `Visible pour ${technician.subadmin_name}` : "Visible pour tous les sous-admins"}
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
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </PanelSurface>
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
          if (!open) setPickerOpen(null);
        }}
        title="Choisir le contrat"
        description="Selectionnez un contrat depuis une fenetre dediee, avec recherche et lecture confortable."
        searchValue={contractSearch}
        onSearchChange={setContractSearch}
        options={contractPickerOptions}
        selectedId={activeTab === "tasks" ? taskDraft.contractId : assignmentDraft.contractId}
        onSelect={(id) => {
          if (activeTab === "tasks") {
            setTaskDraft((prev) => ({ ...prev, contractId: id }));
          } else {
            setAssignmentDraft((prev) => ({ ...prev, contractId: id }));
          }
          setPickerOpen(null);
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
        options={bienPickerOptions}
        selectedId={taskDraft.bienId}
        onSelect={(id) => {
          setTaskDraft((prev) => ({ ...prev, bienId: id }));
          setPickerOpen(null);
        }}
        emptyLabel="Aucun bien correspondant."
      />
    </>
  );
}
