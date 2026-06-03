import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Building2,
  Calculator,
  Hotel,
  LoaderCircle,
  Plus,
  RefreshCw,
  ReceiptText,
  Scale,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { Bien, Contrat, HotelReservationDemand, Locataire, ReservationDemand, ServicePayantBien } from "../../admin/types";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const STORAGE_KEY = "dwira_admin_comptabilite_v1";
const ACCOUNTING_ACCESS_CODE_HASH = "7791bbeb1bb62b9658180226f794a5c6afd6cfe00f9bf304201983c309c6650b";
const ACCOUNTING_ACCESS_STORAGE_KEY = "dwira_admin_comptabilite_access_v1";

type ManualRevenueEntry = {
  id: string;
  label: string;
  amount: number;
  comment: string;
  createdAt: string;
};

type ManualBenefitEntry = ManualRevenueEntry;

type ManualChargeEntry = ManualRevenueEntry & {
  chargeDate: string;
};

type ManualBeneficiaryEntry = {
  id: string;
  name: string;
  amount: number;
  comment: string;
  createdAt: string;
};

type ContractAdjustment = {
  ownerPrice: string;
  comment: string;
};

type HotelAdjustment = {
  markupPercent: string;
  comment: string;
};

type ServiceAdjustment = {
  baseCost: string;
  comment: string;
};

type AmicaleAdjustment = {
  ownerPrice: string;
  comment: string;
};

type AccountingStore = {
  contractAdjustments: Record<string, ContractAdjustment>;
  hotelAdjustments: Record<string, HotelAdjustment>;
  serviceAdjustments: Record<string, ServiceAdjustment>;
  amicaleAdjustments: Record<string, AmicaleAdjustment>;
  manualRevenues: ManualRevenueEntry[];
  manualBenefits: ManualBenefitEntry[];
  manualCharges: ManualChargeEntry[];
  manualBeneficiaries: ManualBeneficiaryEntry[];
  beneficiaryNames: {
    first: string;
    second: string;
  };
};

type LocalDataState = {
  contracts: Contrat[];
  biensById: Record<string, Bien>;
  locatairesById: Record<string, Locataire>;
  reservationDemands: ReservationDemand[];
  hotelDemands: HotelReservationDemand[];
  loading: boolean;
  error: string | null;
};

type ServiceLine = {
  id: string;
  label: string;
  category: string;
  grossRevenue: number;
  quantity: number;
  sourceLabel: string;
};

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseMoney(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)} DT`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", hour12: false });
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

async function hashText(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isCancelledStatus(value: unknown) {
  const status = normalizeText(value).toLowerCase();
  return status.includes("annule") || status.includes("rejete") || status === "cancelled" || status === "canceled";
}

function loadStore(): AccountingStore {
  if (typeof window === "undefined") {
    return {
      contractAdjustments: {},
      hotelAdjustments: {},
      serviceAdjustments: {},
      amicaleAdjustments: {},
      manualRevenues: [],
      manualBenefits: [],
      manualCharges: [],
      manualBeneficiaries: [],
      beneficiaryNames: { first: "Partie A", second: "Partie B" },
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Partial<AccountingStore>;
    return {
      contractAdjustments: parsed.contractAdjustments || {},
      hotelAdjustments: parsed.hotelAdjustments || {},
      serviceAdjustments: parsed.serviceAdjustments || {},
      amicaleAdjustments: parsed.amicaleAdjustments || {},
      manualRevenues: Array.isArray(parsed.manualRevenues) ? parsed.manualRevenues : [],
      manualBenefits: Array.isArray(parsed.manualBenefits) ? parsed.manualBenefits : [],
      manualCharges: Array.isArray(parsed.manualCharges) ? parsed.manualCharges : [],
      manualBeneficiaries: Array.isArray(parsed.manualBeneficiaries) ? parsed.manualBeneficiaries : [],
      beneficiaryNames: {
        first: normalizeText(parsed.beneficiaryNames?.first) || "Partie A",
        second: normalizeText(parsed.beneficiaryNames?.second) || "Partie B",
      },
    };
  } catch {
    return {
      contractAdjustments: {},
      hotelAdjustments: {},
      serviceAdjustments: {},
      amicaleAdjustments: {},
      manualRevenues: [],
      manualBenefits: [],
      manualCharges: [],
      manualBeneficiaries: [],
      beneficiaryNames: { first: "Partie A", second: "Partie B" },
    };
  }
}

function saveStore(store: AccountingStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function getRowLabel(row?: Bien | Contrat | HotelReservationDemand | ReservationDemand | Locataire | null) {
  if (!row) return "-";
  if ("titre" in row) return String(row.titre || row.reference || row.id || "-");
  if ("hotel_name" in row) return String(row.hotel_name || row.id || "-");
  if ("client_name" in row) return String(row.client_name || row.id || "-");
  if ("nom" in row) return String(row.nom || row.id || "-");
  return String((row as any).id || "-");
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function aggregateServiceLines(rows: ReservationDemand[]) {
  const lines = new Map<string, ServiceLine>();

  const addService = (service: Partial<ServicePayantBien> | null | undefined, sourceLabel: string) => {
    const id = normalizeText(service?.id) || normalizeText(service?.label) || createId("service");
    const label = normalizeText(service?.label) || "Service sans label";
    const category = normalizeText(service?.categorie) || "Services";
    const grossRevenue = parseMoney((service as any)?.prix_saisi ?? service?.prix);
    const current = lines.get(id);
    if (current) {
      current.grossRevenue += grossRevenue;
      current.quantity += 1;
      if (!current.sourceLabel && sourceLabel) current.sourceLabel = sourceLabel;
      return;
    }
    lines.set(id, {
      id,
      label,
      category,
      grossRevenue,
      quantity: 1,
      sourceLabel,
    });
  };

  rows
    .filter((row) => !isCancelledStatus(row.status))
    .forEach((row) => {
    safeArray<Partial<ServicePayantBien>>(row.selected_fixed_services).forEach((service) => {
      addService(service, "service fixe");
    });
    safeArray<Partial<ServicePayantBien>>(row.selected_variable_services).forEach((service) => {
      addService(service, "service variable");
    });
    safeArray<Partial<ServicePayantBien> & { prix_saisi?: number | null }>(row.variable_services_quote).forEach((service) => {
      addService(service, "devis service");
    });
  });

  return Array.from(lines.values()).sort((a, b) => b.grossRevenue - a.grossRevenue || a.label.localeCompare(b.label));
}

function buildEmptyDrafts() {
  return {
    manualRevenue: { label: "", amount: "", comment: "" },
    manualBenefit: { label: "", amount: "", comment: "" },
    manualCharge: { label: "", amount: "", comment: "", chargeDate: new Date().toISOString().slice(0, 10) },
    manualBeneficiary: { name: "", amount: "", comment: "" },
  };
}

export default function ComptabilitePage() {
  const [data, setData] = useState<LocalDataState>({
    contracts: [],
    biensById: {},
    locatairesById: {},
    reservationDemands: [],
    hotelDemands: [],
    loading: true,
    error: null,
  });
  const [store, setStore] = useState<AccountingStore>(() => loadStore());
  const [drafts, setDrafts] = useState(() => buildEmptyDrafts());
  const [unlockCode, setUnlockCode] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(ACCOUNTING_ACCESS_STORAGE_KEY) === ACCOUNTING_ACCESS_CODE;
  });

  const loadData = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [contractsResponse, biensResponse, locatairesResponse, reservationDemandsResponse, hotelDemandsResponse] = await Promise.all([
        fetch(`${API_URL}/contrats`, { credentials: "include" }),
        fetch(`${API_URL}/biens`, { credentials: "include" }),
        fetch(`${API_URL}/locataires`, { credentials: "include" }),
        fetch(`${API_URL}/reservation-demands`, { credentials: "include" }),
        fetch(`${API_URL}/hotel-reservation-demands`, { credentials: "include" }),
      ]);

      const parseResponse = async <T,>(response: Response, fallback: T[] = []) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(String(payload?.error || "Chargement comptabilite impossible"));
        }
        const payload = await response.json().catch(() => fallback);
        return safeArray<T>(payload);
      };

      const [contracts, biens, locataires, reservationDemands, hotelDemands] = await Promise.all([
        parseResponse<Contrat>(contractsResponse),
        parseResponse<Bien>(biensResponse),
        parseResponse<Locataire>(locatairesResponse),
        parseResponse<ReservationDemand>(reservationDemandsResponse),
        parseResponse<HotelReservationDemand>(hotelDemandsResponse),
      ]);

      setData({
        contracts,
        biensById: Object.fromEntries(biens.map((bien) => [String(bien.id), bien])),
        locatairesById: Object.fromEntries(locataires.map((locataire) => [String(locataire.id), locataire])),
        reservationDemands,
        hotelDemands,
        loading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement comptabilite impossible";
      setData((prev) => ({ ...prev, loading: false, error: message }));
      toast.error(message);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    saveStore(store);
  }, [store]);

  const serviceLines = useMemo(() => aggregateServiceLines(data.reservationDemands), [data.reservationDemands]);

  const contractRows = useMemo(() => {
    return data.contracts
      .filter((contract) => !isCancelledStatus(contract.statut) && String(contract.statut || "").trim() !== "resilie")
      .map((contract) => {
      const bien = data.biensById[String(contract.bien_id)] || null;
      const locataire = data.locatairesById[String(contract.locataire_id)] || null;
      const adjustment = store.contractAdjustments[String(contract.id)] || { ownerPrice: "", comment: "" };
      const gross = parseMoney(contract.montant_recu);
      const ownerPrice = parseMoney(adjustment.ownerPrice);
      const benefit = gross - ownerPrice;
      return {
        id: String(contract.id),
        title: getRowLabel(bien) || String(contract.bien_id || "-"),
        client: getRowLabel(locataire) || String(contract.locataire_id || "-"),
        gross,
        ownerPrice,
        benefit,
        status: contract.statut,
        adjustment,
        contract,
      };
    });
  }, [data.biensById, data.contracts, data.locatairesById, store.contractAdjustments]);

  const amicaleRows = useMemo(() => {
    return data.reservationDemands
      .filter((row) => String(row.payment_mode || "") === "amicale" || Boolean(normalizeText(row.pricing_amicale_id)))
      .filter((row) => !isCancelledStatus(row.status))
      .map((row) => {
        const adjustment = store.amicaleAdjustments[String(row.id)] || { ownerPrice: "", comment: "" };
        const gross = parseMoney(row.total_amount);
        const ownerPrice = parseMoney(adjustment.ownerPrice);
        const benefit = gross - ownerPrice;
        return {
          id: String(row.id),
          title: String(row.bien_titre || row.bien_reference || row.bien_id || "-"),
          client: String(row.client_name || "-"),
          gross,
          ownerPrice,
          benefit,
          status: String(row.status || "-"),
          row,
          adjustment,
        };
      });
  }, [data.reservationDemands, store.amicaleAdjustments]);

  const hotelRows = useMemo(() => {
    return data.hotelDemands
      .filter((row) => !isCancelledStatus(row.status))
      .filter((row) => String(row.status || "") === "voucher_envoye" || Boolean(row.voucher_sent_at) || Boolean(row.voucher_url))
      .map((row) => {
        const adjustment = store.hotelAdjustments[String(row.id)] || { markupPercent: "", comment: "" };
        const gross = parseMoney(row.total_price);
        const markupPercent = parseMoney(adjustment.markupPercent);
        const benefit = gross * (markupPercent / 100);
        return {
          id: String(row.id),
          title: String(row.hotel_name || "-"),
          client: String(row.client_name || "-"),
          gross,
          markupPercent,
          benefit,
          status: String(row.status || "-"),
          row,
          adjustment,
        };
      });
  }, [data.hotelDemands, store.hotelAdjustments]);

  const serviceRows = useMemo(() => {
    return serviceLines.map((line) => {
      const adjustment = store.serviceAdjustments[String(line.id)] || { baseCost: "", comment: "" };
      const baseCost = parseMoney(adjustment.baseCost);
      const benefit = line.grossRevenue - baseCost * line.quantity;
      return {
        ...line,
        baseCost,
        benefit,
        adjustment,
      };
    });
  }, [serviceLines, store.serviceAdjustments]);

  const manualRevenueTotal = useMemo(() => store.manualRevenues.reduce((sum, entry) => sum + parseMoney(entry.amount), 0), [store.manualRevenues]);
  const manualBenefitTotal = useMemo(() => store.manualBenefits.reduce((sum, entry) => sum + parseMoney(entry.amount), 0), [store.manualBenefits]);
  const manualChargeTotal = useMemo(() => store.manualCharges.reduce((sum, entry) => sum + parseMoney(entry.amount), 0), [store.manualCharges]);
  const manualBeneficiaryTotal = useMemo(() => store.manualBeneficiaries.reduce((sum, entry) => sum + parseMoney(entry.amount), 0), [store.manualBeneficiaries]);

  const totalContracts = useMemo(() => contractRows.reduce((sum, row) => sum + row.gross, 0), [contractRows]);
  const totalAmicales = useMemo(() => amicaleRows.reduce((sum, row) => sum + row.gross, 0), [amicaleRows]);
  const totalHotels = useMemo(() => hotelRows.reduce((sum, row) => sum + row.gross, 0), [hotelRows]);
  const totalServices = useMemo(() => serviceRows.reduce((sum, row) => sum + row.grossRevenue, 0), [serviceRows]);
  const chiffreAffaires = totalContracts + totalAmicales + totalHotels + totalServices + manualRevenueTotal;

  const totalLocationBenefits = useMemo(() => contractRows.reduce((sum, row) => sum + row.benefit, 0), [contractRows]);
  const totalAmicaleBenefits = useMemo(() => amicaleRows.reduce((sum, row) => sum + row.benefit, 0), [amicaleRows]);
  const totalHotelBenefits = useMemo(() => hotelRows.reduce((sum, row) => sum + row.benefit, 0), [hotelRows]);
  const totalServiceBenefits = useMemo(() => serviceRows.reduce((sum, row) => sum + row.benefit, 0), [serviceRows]);
  const totalBenefits = totalLocationBenefits + totalAmicaleBenefits + totalHotelBenefits + totalServiceBenefits + manualBenefitTotal;
  const resultBeforeCharges = totalBenefits;
  const netResult = resultBeforeCharges - manualChargeTotal;
  const availableAfterManualBeneficiaries = netResult - manualBeneficiaryTotal;
  const baseShare = availableAfterManualBeneficiaries / 2;

  const totals = [
    { label: "Chiffre d affaire", value: chiffreAffaires, tone: "emerald", icon: ReceiptText },
    { label: "Benefices calcules", value: totalBenefits, tone: "sky", icon: Scale },
    { label: "Charges", value: manualChargeTotal, tone: "amber", icon: Wallet },
    { label: "Net repartissable", value: netResult, tone: "violet", icon: Calculator },
  ] as const;

  const updateStoreMap = <K extends keyof AccountingStore>(
    key: K,
    entityId: string,
    patch: Partial<AccountingStore[K] extends Record<string, infer TValue> ? TValue : never>
  ) => {
    if (!isUnlocked) {
      toast.error("Code administratif requis avant modification.");
      return;
    }
    setStore((prev) => ({
      ...prev,
      [key]: {
        ...((prev[key] as Record<string, unknown>) || {}),
        [entityId]: {
          ...(((prev[key] as Record<string, any>) || {})[entityId] || {}),
          ...patch,
        },
      },
    }));
  };

  const addManualRevenue = () => {
    if (!isUnlocked) {
      toast.error("Code administratif requis avant ajout.");
      return;
    }
    const label = normalizeText(drafts.manualRevenue.label);
    const amount = parseMoney(drafts.manualRevenue.amount);
    if (!label || amount <= 0) {
      toast.error("Ajoutez un libelle et un montant valide.");
      return;
    }
    setStore((prev) => ({
      ...prev,
      manualRevenues: [
        {
          id: createId("rev"),
          label,
          amount,
          comment: normalizeText(drafts.manualRevenue.comment),
          createdAt: new Date().toISOString(),
        },
        ...prev.manualRevenues,
      ],
    }));
    setDrafts((prev) => ({ ...prev, manualRevenue: { label: "", amount: "", comment: "" } }));
    toast.success("Revenu manuel ajoute.");
  };

  const addManualBenefit = () => {
    if (!isUnlocked) {
      toast.error("Code administratif requis avant ajout.");
      return;
    }
    const label = normalizeText(drafts.manualBenefit.label);
    const amount = parseMoney(drafts.manualBenefit.amount);
    if (!label || amount <= 0) {
      toast.error("Ajoutez un libelle et un montant valide.");
      return;
    }
    setStore((prev) => ({
      ...prev,
      manualBenefits: [
        {
          id: createId("ben"),
          label,
          amount,
          comment: normalizeText(drafts.manualBenefit.comment),
          createdAt: new Date().toISOString(),
        },
        ...prev.manualBenefits,
      ],
    }));
    setDrafts((prev) => ({ ...prev, manualBenefit: { label: "", amount: "", comment: "" } }));
    toast.success("Benefice manuel ajoute.");
  };

  const addManualCharge = () => {
    if (!isUnlocked) {
      toast.error("Code administratif requis avant ajout.");
      return;
    }
    const label = normalizeText(drafts.manualCharge.label);
    const amount = parseMoney(drafts.manualCharge.amount);
    const chargeDate = normalizeText(drafts.manualCharge.chargeDate);
    if (!label || amount <= 0 || !chargeDate) {
      toast.error("Ajoutez un libelle, un montant et une date.");
      return;
    }
    setStore((prev) => ({
      ...prev,
      manualCharges: [
        {
          id: createId("chg"),
          label,
          amount,
          comment: normalizeText(drafts.manualCharge.comment),
          chargeDate,
          createdAt: new Date().toISOString(),
        },
        ...prev.manualCharges,
      ],
    }));
    setDrafts((prev) => ({
      ...prev,
      manualCharge: { label: "", amount: "", comment: "", chargeDate: new Date().toISOString().slice(0, 10) },
    }));
    toast.success("Charge ajoutee.");
  };

  const addManualBeneficiary = () => {
    if (!isUnlocked) {
      toast.error("Code administratif requis avant ajout.");
      return;
    }
    const name = normalizeText(drafts.manualBeneficiary.name);
    const amount = parseMoney(drafts.manualBeneficiary.amount);
    if (!name || amount <= 0) {
      toast.error("Ajoutez un nom et un montant valide.");
      return;
    }
    setStore((prev) => ({
      ...prev,
      manualBeneficiaries: [
        {
          id: createId("part"),
          name,
          amount,
          comment: normalizeText(drafts.manualBeneficiary.comment),
          createdAt: new Date().toISOString(),
        },
        ...prev.manualBeneficiaries,
      ],
    }));
    setDrafts((prev) => ({ ...prev, manualBeneficiary: { name: "", amount: "", comment: "" } }));
    toast.success("Beneficiaire manuel ajoute.");
  };

  const removeEntry = (key: "manualRevenues" | "manualBenefits" | "manualCharges" | "manualBeneficiaries", id: string) => {
    if (!isUnlocked) {
      toast.error("Code administratif requis avant modification.");
      return;
    }
    setStore((prev) => ({
      ...prev,
      [key]: (prev[key] as Array<{ id: string }>).filter((item) => item.id !== id),
    }) as AccountingStore);
  };

  const unlockAccounting = async () => {
    const digest = await hashText(normalizeText(unlockCode));
    if (digest !== ACCOUNTING_ACCESS_CODE_HASH) {
      toast.error("Code administratif invalide.");
      return;
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(ACCOUNTING_ACCESS_STORAGE_KEY, ACCOUNTING_ACCESS_CODE);
    }
    setIsUnlocked(true);
    toast.success("Edition comptable deverrouillee.");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-900 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-emerald-200">
              <Calculator className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.3em]">Admin</span>
            </div>
            <h1 className="mt-3 text-3xl font-bold">Comptabilite</h1>
            <p className="mt-2 text-sm leading-6 text-emerald-100/80">
              Chiffre d affaire, benefices, charges et repartition. Les lignes manuelles restent modifiables apres deverrouillage et peuvent recevoir un commentaire.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15"
          >
            <RefreshCw className="h-4 w-4" />
            Recharger les donnees
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totals.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">{card.label}</p>
              <span className={`rounded-xl px-2.5 py-2 text-xs font-semibold ${
                card.tone === "emerald"
                  ? "bg-emerald-50 text-emerald-700"
                  : card.tone === "sky"
                    ? "bg-sky-50 text-sky-700"
                    : card.tone === "amber"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-violet-50 text-violet-700"
              }`}>
                <card.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-4 text-2xl font-bold text-gray-900">{formatMoney(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-900">Code administratif requis pour toute ajout ou modification</p>
            <p className="text-xs text-amber-800/80">Saisissez votre code administratif pour activer l edition de cette page.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={unlockCode}
                onChange={(event) => setUnlockCode(event.target.value)}
                placeholder="Code administratif"
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void unlockAccounting()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Deverrouiller
            </button>
          </div>
        </div>
      </div>

      {data.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {data.error}
        </div>
      ) : null}

      <SectionCard
        title="Chiffre d affaire detaille"
        subtitle="Total des contrats, amicales TTC, hotels vouchers envoyes, services et autres affaires saisies manuellement."
        icon={<ReceiptText className="h-5 w-5" />}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DataBlock label="Contrats" value={formatMoney(totalContracts)} help={`${contractRows.length} contrats`} />
          <DataBlock label="Amicales TTC" value={formatMoney(totalAmicales)} help={`${amicaleRows.length} demandes amicale`} />
          <DataBlock label="Services" value={formatMoney(totalServices)} help={`${serviceRows.length} lignes de services`} />
          <DataBlock label="Hotels confirmes" value={formatMoney(totalHotels)} help={`${hotelRows.length} vouchers envoyes`} />
          <DataBlock label="Autres affaires" value={formatMoney(manualRevenueTotal)} help={`${store.manualRevenues.length} saisies manuelles`} />
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-gray-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Detail</th>
                <th className="px-4 py-3 font-semibold">Montant</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ...contractRows.map((row) => ({ key: `contract-${row.id}`, source: "Contrat", detail: `${row.title} / ${row.client}`, amount: row.gross, status: row.status })),
                ...amicaleRows.map((row) => ({ key: `amicale-${row.id}`, source: "Amicale", detail: `${row.title} / ${row.client}`, amount: row.gross, status: row.status })),
                ...hotelRows.map((row) => ({ key: `hotel-${row.id}`, source: "Hotel", detail: `${row.title} / ${row.client}`, amount: row.gross, status: row.status })),
              ].slice(0, 8).map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.source}</td>
                  <td className="px-4 py-3 text-gray-600">{row.detail}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">{formatMoney(row.amount)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{String(row.status || "-")}</td>
                </tr>
              ))}
              {store.manualRevenues.length === 0 ? null : store.manualRevenues.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">Autre affaire</td>
                  <td className="px-4 py-3 text-gray-600">{entry.label}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">{formatMoney(entry.amount)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{entry.comment || "-"}</td>
              </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Revenus et benefices"
        subtitle="Chaque ligne calcule la marge avec les donnees manueles. Les commentaires sont conserves par ligne."
        icon={<Scale className="h-5 w-5" />}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <SubSection title="Locations" description="Benefice = montant du contrat - prix proprietaire saisi manuellement">
            <div className="space-y-3">
              {contractRows.length === 0 ? <EmptyState text="Aucun contrat charge." /> : null}
              {contractRows.map((row) => (
                <AccountingEntityRow
                  key={row.id}
                  title={row.title}
                  subtitle={`${row.client} | ${formatMoney(row.gross)} brut | statut ${String(row.status || "-")}`}
                  valueLabel="Prix proprietaire"
                  value={row.adjustment.ownerPrice}
                  onValueChange={(value) => updateStoreMap("contractAdjustments", row.id, { ownerPrice: value })}
                  comment={row.adjustment.comment}
                  onCommentChange={(value) => updateStoreMap("contractAdjustments", row.id, { comment: value })}
                  computedValue={row.benefit}
                  computedLabel="Benefice"
                  disabled={!isUnlocked}
                />
              ))}
            </div>
          </SubSection>

          <SubSection title="Hotellerie" description="Benefice = montant voucher x pourcentage de majoration saisi manuellement">
            <div className="space-y-3">
              {hotelRows.length === 0 ? <EmptyState text="Aucun voucher hotel envoye." /> : null}
              {hotelRows.map((row) => (
                <AccountingEntityRow
                  key={row.id}
                  title={row.title}
                  subtitle={`${row.client} | ${formatMoney(row.gross)} TTC | ${String(row.status || "-")}`}
                  valueLabel="Majoration (%)"
                  value={row.adjustment.markupPercent}
                  onValueChange={(value) => updateStoreMap("hotelAdjustments", row.id, { markupPercent: value })}
                  comment={row.adjustment.comment}
                  onCommentChange={(value) => updateStoreMap("hotelAdjustments", row.id, { comment: value })}
                  computedValue={row.benefit}
                  computedLabel="Benefice hotel"
                  suffix="%"
                  disabled={!isUnlocked}
                />
              ))}
            </div>
          </SubSection>

          <SubSection title="Services" description="Benefice = prix service - prix de base du service saisi manuellement">
            <div className="space-y-3">
              {serviceRows.length === 0 ? <EmptyState text="Aucun service additionnel charge." /> : null}
              {serviceRows.map((row) => (
                <AccountingEntityRow
                  key={row.id}
                  title={row.label}
                  subtitle={`${row.category} | ${row.quantity} occurrence(s) | brut ${formatMoney(row.grossRevenue)}`}
                  valueLabel="Cout de base"
                  value={row.adjustment.baseCost}
                  onValueChange={(value) => updateStoreMap("serviceAdjustments", row.id, { baseCost: value })}
                  comment={row.adjustment.comment}
                  onCommentChange={(value) => updateStoreMap("serviceAdjustments", row.id, { comment: value })}
                  computedValue={row.benefit}
                  computedLabel="Benefice services"
                  disabled={!isUnlocked}
                />
              ))}
            </div>
          </SubSection>

          <SubSection title="Amicales" description="Benefice = total TTC de la reservation - prix proprietaire saisi manuellement">
            <div className="space-y-3">
              {amicaleRows.length === 0 ? <EmptyState text="Aucune reservation amicale chargee." /> : null}
              {amicaleRows.map((row) => (
                <AccountingEntityRow
                  key={row.id}
                  title={row.title}
                  subtitle={`${row.client} | ${formatMoney(row.gross)} TTC | ${String(row.status || "-")}`}
                  valueLabel="Prix proprietaire"
                  value={row.adjustment.ownerPrice}
                  onValueChange={(value) => updateStoreMap("amicaleAdjustments", row.id, { ownerPrice: value })}
                  comment={row.adjustment.comment}
                  onCommentChange={(value) => updateStoreMap("amicaleAdjustments", row.id, { comment: value })}
                  computedValue={row.benefit}
                  computedLabel="Benefice amicale"
                  disabled={!isUnlocked}
                />
              ))}
            </div>
          </SubSection>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Autres benefices manuels</h3>
              <p className="text-xs text-gray-500">Chaque ligne ajoute un benefice supplementaire avec commentaire.</p>
            </div>
              <button
                type="button"
                onClick={addManualBenefit}
                disabled={!isUnlocked}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
              <Plus className="h-4 w-4" />
              Ajouter
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              value={drafts.manualBenefit.label}
              onChange={(event) => setDrafts((prev) => ({ ...prev, manualBenefit: { ...prev.manualBenefit, label: event.target.value } }))}
              placeholder="Nom du benefice"
              disabled={!isUnlocked}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <input
              value={drafts.manualBenefit.amount}
              onChange={(event) => setDrafts((prev) => ({ ...prev, manualBenefit: { ...prev.manualBenefit, amount: event.target.value } }))}
              placeholder="Valeur"
              type="number"
              step="0.01"
              disabled={!isUnlocked}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <input
              value={drafts.manualBenefit.comment}
              onChange={(event) => setDrafts((prev) => ({ ...prev, manualBenefit: { ...prev.manualBenefit, comment: event.target.value } }))}
              placeholder="Commentaire"
              disabled={!isUnlocked}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nom</th>
                  <th className="px-4 py-3 font-semibold">Valeur</th>
                  <th className="px-4 py-3 font-semibold">Commentaire</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {store.manualBenefits.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-gray-500" colSpan={4}>
                      Aucun benefice manuel.
                    </td>
                  </tr>
                ) : (
                  store.manualBenefits.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{entry.label}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">{formatMoney(entry.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">{entry.comment || "-"}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => removeEntry("manualBenefits", entry.id)} disabled={!isUnlocked} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Charges"
        subtitle="Chaque charge demande un nom, une valeur, une date et un commentaire optionnel."
        icon={<Wallet className="h-5 w-5" />}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={drafts.manualCharge.label}
            onChange={(event) => setDrafts((prev) => ({ ...prev, manualCharge: { ...prev.manualCharge, label: event.target.value } }))}
            placeholder="Nom de la charge"
            disabled={!isUnlocked}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={drafts.manualCharge.amount}
            onChange={(event) => setDrafts((prev) => ({ ...prev, manualCharge: { ...prev.manualCharge, amount: event.target.value } }))}
            placeholder="Valeur"
            type="number"
            step="0.01"
            disabled={!isUnlocked}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={drafts.manualCharge.chargeDate}
            onChange={(event) => setDrafts((prev) => ({ ...prev, manualCharge: { ...prev.manualCharge, chargeDate: event.target.value } }))}
            type="date"
            disabled={!isUnlocked}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={drafts.manualCharge.comment}
            onChange={(event) => setDrafts((prev) => ({ ...prev, manualCharge: { ...prev.manualCharge, comment: event.target.value } }))}
            placeholder="Commentaire"
            disabled={!isUnlocked}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-4"
            rows={2}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={addManualCharge}
            disabled={!isUnlocked}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Ajouter la charge
          </button>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Nom</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Valeur</th>
                <th className="px-4 py-3 font-semibold">Commentaire</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {store.manualCharges.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={5}>
                    Aucune charge saisie.
                  </td>
                </tr>
              ) : (
                store.manualCharges.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{entry.label}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(entry.chargeDate)}</td>
                    <td className="px-4 py-3 font-semibold text-rose-700">{formatMoney(entry.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{entry.comment || "-"}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => removeEntry("manualCharges", entry.id)} disabled={!isUnlocked} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Supprimer
                        </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Repartition beneficeurs"
        subtitle="Deux noms peuvent etre saisis pour le partage par defaut. Les allocations supplementaires restent traçables par commentaire."
        icon={<Building2 className="h-5 w-5" />}
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Partage par defaut</p>
            <div className="mt-3 space-y-3">
              <input
                value={store.beneficiaryNames.first}
                onChange={(event) => {
                  if (!isUnlocked) return;
                  setStore((prev) => ({ ...prev, beneficiaryNames: { ...prev.beneficiaryNames, first: event.target.value } }));
                }}
                placeholder="Nom partie 1"
                disabled={!isUnlocked}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
              <input
                value={store.beneficiaryNames.second}
                onChange={(event) => {
                  if (!isUnlocked) return;
                  setStore((prev) => ({ ...prev, beneficiaryNames: { ...prev.beneficiaryNames, second: event.target.value } }));
                }}
                placeholder="Nom partie 2"
                disabled={!isUnlocked}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 grid gap-3">
              <DataBlock label={store.beneficiaryNames.first || "Partie 1"} value={formatMoney(baseShare)} help="50 % du solde apres allocations" />
              <DataBlock label={store.beneficiaryNames.second || "Partie 2"} value={formatMoney(baseShare)} help="50 % du solde apres allocations" />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 xl:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Parties supplementaires manuelles</h3>
                <p className="text-xs text-gray-500">Si vous ajoutez d'autres beneficiaires, leur total est retire du solde disponible.</p>
              </div>
              <button
                type="button"
                onClick={addManualBeneficiary}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Ajouter
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input
                value={drafts.manualBeneficiary.name}
                onChange={(event) => setDrafts((prev) => ({ ...prev, manualBeneficiary: { ...prev.manualBeneficiary, name: event.target.value } }))}
                placeholder="Nom du beneficeur"
                disabled={!isUnlocked}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={drafts.manualBeneficiary.amount}
                onChange={(event) => setDrafts((prev) => ({ ...prev, manualBeneficiary: { ...prev.manualBeneficiary, amount: event.target.value } }))}
                placeholder="Valeur"
                type="number"
                step="0.01"
                disabled={!isUnlocked}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={drafts.manualBeneficiary.comment}
                onChange={(event) => setDrafts((prev) => ({ ...prev, manualBeneficiary: { ...prev.manualBeneficiary, comment: event.target.value } }))}
                placeholder="Commentaire"
                disabled={!isUnlocked}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nom</th>
                    <th className="px-4 py-3 font-semibold">Valeur</th>
                    <th className="px-4 py-3 font-semibold">Commentaire</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {store.manualBeneficiaries.length === 0 ? (
                    <tr>
                    <td className="px-4 py-4 text-gray-500" colSpan={4}>
                      Aucune allocation supplementaire.
                    </td>
                    </tr>
                  ) : (
                    store.manualBeneficiaries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3 font-medium text-gray-900">{entry.name}</td>
                        <td className="px-4 py-3 font-semibold text-sky-700">{formatMoney(entry.amount)}</td>
                        <td className="px-4 py-3 text-gray-600">{entry.comment || "-"}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => removeEntry("manualBeneficiaries", entry.id)} disabled={!isUnlocked} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                            <Trash2 className="h-3.5 w-3.5" />
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DataBlock label="Net avant beneficiaires manuels" value={formatMoney(netResult)} help="benefices - charges" />
          <DataBlock label="Beneficiaires manuels" value={formatMoney(manualBeneficiaryTotal)} help={`${store.manualBeneficiaries.length} lignes`} />
          <DataBlock label="Solde apres allocations" value={formatMoney(availableAfterManualBeneficiaries)} help="peut devenir negatif si les allocations depassent le net" />
          <DataBlock label="Partage de base" value={formatMoney(baseShare)} help="Solde apres allocations / 2" />
        </div>
      </SectionCard>

      <SectionCard
        title="Saisies manuelles supplementaires"
        subtitle="Autres revenus et autres benefices sont stockes dans le navigateur avec leur commentaire."
        icon={<Plus className="h-5 w-5" />}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <ManualEntryPanel
            title="Autres affaires"
            description="Revenus manuels a ajouter au chiffre d affaire."
            entries={store.manualRevenues}
            draft={drafts.manualRevenue}
            onDraftChange={(patch) => setDrafts((prev) => ({ ...prev, manualRevenue: { ...prev.manualRevenue, ...patch } }))}
            onSubmit={addManualRevenue}
            valueLabel="Montant"
            valuePlaceholder="Montant"
            allowDate={false}
            disabled={!isUnlocked}
            onDelete={(id) => removeEntry("manualRevenues", id)}
          />
          <ManualEntryPanel
            title="Autres benefices"
            description="Lignes de benefice supplementaire independantes du calcul automatique."
            entries={store.manualBenefits}
            draft={drafts.manualBenefit}
            onDraftChange={(patch) => setDrafts((prev) => ({ ...prev, manualBenefit: { ...prev.manualBenefit, ...patch } }))}
            onSubmit={addManualBenefit}
            valueLabel="Valeur"
            valuePlaceholder="Valeur"
            allowDate={false}
            disabled={!isUnlocked}
            onDelete={(id) => removeEntry("manualBenefits", id)}
          />
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700">
            {icon}
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SubSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function DataBlock({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {help ? <p className="mt-1 text-xs text-gray-500">{help}</p> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-500">{text}</div>;
}

function AccountingEntityRow({
  title,
  subtitle,
  valueLabel,
  value,
  onValueChange,
  comment,
  onCommentChange,
  computedLabel,
  computedValue,
  suffix,
  disabled,
}: {
  title: string;
  subtitle: string;
  valueLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  comment: string;
  onCommentChange: (value: string) => void;
  computedLabel: string;
  computedValue: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="block text-xs font-semibold text-gray-500">{valueLabel}</span>
          <div className="flex rounded-lg border border-gray-300 bg-white">
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              disabled={disabled}
              className="min-w-0 flex-1 rounded-l-lg px-3 py-2 text-sm outline-none"
            />
            {suffix ? <span className="border-l border-gray-300 px-3 py-2 text-sm text-gray-500">{suffix}</span> : null}
          </div>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold text-gray-500">Commentaire</span>
          <input
            value={comment}
            onChange={(event) => onCommentChange(event.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Commentaire"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
        <span className="text-gray-500">{computedLabel}</span>
        <span className="font-semibold text-gray-900">{formatMoney(computedValue)}</span>
      </div>
    </div>
  );
}

function ManualEntryPanel<T extends { id: string; label?: string; name?: string; amount: number; comment?: string; createdAt: string; chargeDate?: string }>({
  title,
  description,
  entries,
  draft,
  onDraftChange,
  onSubmit,
  onDelete,
  valueLabel,
  valuePlaceholder,
  allowDate,
  disabled,
}: {
  title: string;
  description: string;
  entries: T[];
  draft: Record<string, string>;
  onDraftChange: (patch: Record<string, string>) => void;
  onSubmit: () => void;
  onDelete: (id: string) => void;
  valueLabel: string;
  valuePlaceholder: string;
  allowDate: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-xs text-gray-500">{description}</p>
        </div>
        <button type="button" onClick={onSubmit} disabled={disabled} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
          <Plus className="h-4 w-4" />
          Ajouter
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input
          value={draft.label ?? draft.name ?? ""}
          onChange={(event) => onDraftChange(title.includes("benefice") ? { label: event.target.value } : { label: event.target.value, name: event.target.value })}
          placeholder={title.includes("benefice") ? "Nom du benefice" : "Nom de la saisie"}
          disabled={disabled}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        />
        <input
          value={draft.amount || ""}
          onChange={(event) => onDraftChange({ amount: event.target.value })}
          placeholder={valuePlaceholder}
          type="number"
          step="0.01"
          disabled={disabled}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        />
        {allowDate ? (
          <input
            value={draft.chargeDate || ""}
            onChange={(event) => onDraftChange({ chargeDate: event.target.value })}
            type="date"
            disabled={disabled}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        ) : null}
        <input
          value={draft.comment || ""}
          onChange={(event) => onDraftChange({ comment: event.target.value })}
          placeholder="Commentaire"
          disabled={disabled}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm md:col-span-2 xl:col-span-4"
        />
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">{title.includes("benefice") ? "Nom" : "Libelle"}</th>
              {allowDate ? <th className="px-4 py-3 font-semibold">Date</th> : null}
              <th className="px-4 py-3 font-semibold">{valueLabel}</th>
              <th className="px-4 py-3 font-semibold">Commentaire</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-gray-500" colSpan={allowDate ? 5 : 4}>
                  Aucune ligne.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{entry.label || entry.name || "-"}</td>
                  {allowDate ? <td className="px-4 py-3 text-gray-600">{formatDate(entry.chargeDate || entry.createdAt)}</td> : null}
                  <td className="px-4 py-3 font-semibold text-emerald-700">{formatMoney(entry.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{entry.comment || "-"}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => onDelete(entry.id)} disabled={disabled} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
