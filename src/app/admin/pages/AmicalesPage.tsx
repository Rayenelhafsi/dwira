import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { format as formatDateFn } from "date-fns";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Code2, Eye, FileText, Printer, RefreshCw, Search, Sparkles, Ticket, Trash2, Upload, Users } from "lucide-react";
import { createAmicaleApi, deleteAmicaleApi, fetchAmicalesAdmin, normalizeAmicaleHotelMarkupPercent, type AmicaleItem, updateAmicaleApi } from "../../utils/amicales";
import type { Bien, HotelReservationDemand, Proprietaire, ReservationDemand, ReservationDemandStatus } from "../types";
import { regenerateHotelVoucher, uploadHotelVoucherPdf } from "../../services/hotels";
import { Calendar } from "../../components/ui/calendar";
import { resolveMediaUrl } from "../../utils/media";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const AMICALE_GROSS_STORAGE_KEY = "dwira_admin_amicales_en_gros_v1";
const AMICALE_GROSS_UNAVAILABLE_COLOR = "#6b7280";
const AMICALE_GROSS_SYNC_SOURCE = "amicale_gross";
const BIEN_IMAGE_FALLBACK = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80";

type AdminAmicaleTab = "amicales" | "en_gros" | "demandes";
type DemandSectionTab = "actives" | "rejetees";
type DemandSortMode = "arrival" | "recent";

type AmicaleGrossManualEntry = {
  id: string;
  amicaleId: string;
  amicaleName: string;
  bienId: string;
  bienReference: string;
  bienTitle: string;
  arrivalDate: string;
  departureDate: string;
  ownerAdvanceAmount: number;
  rentalTotalAmount: number;
  note: string;
  benefitAmount: number;
  createdAt: string;
  updatedAt: string;
};

type UnavailableDateApiRow = {
  id?: string;
  bien_id?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  color?: string | null;
  sync_source?: string | null;
  sync_uid?: string | null;
};

type AmicaleGrossDraft = {
  entryId: string | null;
  amicaleId: string;
  bienId: string;
  arrivalDate: string;
  departureDate: string;
  ownerAdvanceAmount: string;
  rentalTotalAmount: string;
  note: string;
  benefitAmount: string;
};

type AmicaleDemandRow = ReservationDemand & {
  amicale_name?: string | null;
  amicale_logo_url?: string | null;
  source_kind?: "property" | "hotel";
  hotel_context?: Record<string, unknown> | null;
  child_ages?: number[];
  adults?: number | null;
  boarding_name?: string | null;
  room_name?: string | null;
  client_phone?: string | null;
  hotel_id?: string | null;
  hotel_name?: string | null;
};

const statusLabels: Partial<Record<ReservationDemandStatus, string>> = {
  attente_validation_amicale: "Attente validation amicale",
  attente_validation_par_agence: "Attente validation par l agence",
  voucher_en_cours: "Voucher en cours",
  rejete_par_amicale: "Rejete par l amicale",
  rejete_par_agence: "Rejete par l agence",
  demande_rejetee_admin: "Demande rejetee par admin",
  demande_annulee_client: "Demande annulee par client",
  en_attente_reponse_proprietaire: "En attente proprietaire",
  pas_de_reponse_proprietaire: "Pas de reponse proprietaire",
  reponse_positive_attente_confirmation_client: "Attente confirmation client",
  client_procede_vers_paiement_en_cours: "Client procede vers le paiement en cours",
  reponse_negative_autre_proposition_meme_bien: "Autre proposition meme bien",
  reponse_negative_autre_proposition_bien_similaire: "Autre proposition bien similaire",
  attente_envoi_coordonnees_contrat: "Attente coordonnees contrat",
  demande_recu_paiement: "Demande recu paiement",
  recu_paiement_envoye: "Recu paiement envoye",
  contrat_realise: "Contrat realise",
  succes_paiement: "Succes paiement",
};

const statusToneClasses: Partial<Record<ReservationDemandStatus, string>> = {
  attente_validation_amicale: "bg-emerald-100 text-emerald-800 border-emerald-200",
  attente_validation_par_agence: "bg-cyan-100 text-cyan-800 border-cyan-200",
  voucher_en_cours: "bg-indigo-100 text-indigo-800 border-indigo-200",
  rejete_par_amicale: "bg-slate-100 text-slate-700 border-slate-200",
  rejete_par_agence: "bg-rose-100 text-rose-800 border-rose-200",
  demande_rejetee_admin: "bg-rose-100 text-rose-800 border-rose-200",
  demande_annulee_client: "bg-slate-100 text-slate-800 border-slate-200",
  en_attente_reponse_proprietaire: "bg-sky-100 text-sky-800 border-sky-200",
  pas_de_reponse_proprietaire: "bg-orange-100 text-orange-800 border-orange-200",
  reponse_positive_attente_confirmation_client: "bg-amber-100 text-amber-800 border-amber-200",
  client_procede_vers_paiement_en_cours: "bg-yellow-100 text-yellow-800 border-yellow-200",
  reponse_negative_autre_proposition_meme_bien: "bg-violet-100 text-violet-800 border-violet-200",
  reponse_negative_autre_proposition_bien_similaire: "bg-violet-100 text-violet-800 border-violet-200",
  attente_envoi_coordonnees_contrat: "bg-cyan-100 text-cyan-800 border-cyan-200",
  demande_recu_paiement: "bg-indigo-100 text-indigo-800 border-indigo-200",
  recu_paiement_envoye: "bg-indigo-100 text-indigo-800 border-indigo-200",
  contrat_realise: "bg-emerald-100 text-emerald-800 border-emerald-200",
  succes_paiement: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

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

function formatCurrency(value?: number | string | null) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0 DT";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(num)} DT`;
}

function createLocalId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

function sortAmicaleDemandRows(rows: AmicaleDemandRow[], mode: DemandSortMode) {
  return [...rows].sort((left, right) => {
    if (mode === "arrival") {
      const arrivalCompare = compareNearestArrivalDates(
        left.start_date,
        right.start_date,
        left.updated_at || left.created_at,
        right.updated_at || right.created_at
      );
      if (arrivalCompare !== 0) return arrivalCompare;
    }
    const updatedGap = parseSortDate(right.updated_at || right.created_at) - parseSortDate(left.updated_at || left.created_at);
    if (updatedGap !== 0) return updatedGap;
    return String(right.id || "").localeCompare(String(left.id || ""));
  });
}

function parseOptionalAmount(value: string): number | null {
  const raw = String(value || "").trim().replace(",", ".");
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return Number.NaN;
  return Math.round(numeric * 100) / 100;
}

function loadAmicaleGrossEntries() {
  if (typeof window === "undefined") return [] as AmicaleGrossManualEntry[];
  try {
    const raw = window.localStorage.getItem(AMICALE_GROSS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
      id: String(entry?.id || createLocalId("amg")).trim(),
      amicaleId: String(entry?.amicaleId || "").trim(),
      amicaleName: String(entry?.amicaleName || "").trim(),
      bienId: String(entry?.bienId || "").trim(),
      bienReference: String(entry?.bienReference || "").trim(),
      bienTitle: String(entry?.bienTitle || "").trim(),
      arrivalDate: String(entry?.arrivalDate || "").trim(),
      departureDate: String(entry?.departureDate || "").trim(),
      ownerAdvanceAmount: Number(entry?.ownerAdvanceAmount || 0) || 0,
      rentalTotalAmount: Number(entry?.rentalTotalAmount || 0) || 0,
      note: String(entry?.note || "").trim(),
      benefitAmount: Number(entry?.benefitAmount || 0) || 0,
      createdAt: String(entry?.createdAt || new Date().toISOString()).trim(),
      updatedAt: String(entry?.updatedAt || entry?.createdAt || new Date().toISOString()).trim(),
    })) as AmicaleGrossManualEntry[];
  } catch {
    return [];
  }
}

function buildEmptyAmicaleGrossDraft(): AmicaleGrossDraft {
  return {
    entryId: null,
    amicaleId: "",
    bienId: "",
    arrivalDate: "",
    departureDate: "",
    ownerAdvanceAmount: "",
    rentalTotalAmount: "",
    note: "",
    benefitAmount: "",
  };
}

function formatDateInputValue(value?: string | Date | null) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return formatDateFn(value, "yyyy-MM-dd");
  }
  return String(value || "").trim().slice(0, 10);
}

function parseDateInputValue(value?: string | null) {
  const normalized = formatDateInputValue(value);
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getBienPreviewImage(bien?: Bien | null) {
  if (!bien) return BIEN_IMAGE_FALLBACK;
  const mediaList = Array.isArray(bien.media) ? bien.media : [];
  const firstImage = mediaList.find((item) => String(item?.type || "").toLowerCase() !== "video" && String(item?.url || "").trim());
  const directImage = resolveMediaUrl(String(firstImage?.url || "").trim());
  if (directImage) return directImage;
  const fallbackImage = resolveMediaUrl(String((bien as { image_url?: string | null }).image_url || "").trim());
  return fallbackImage || BIEN_IMAGE_FALLBACK;
}

function resolveAssetUrl(url?: string | null) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${window.location.origin}${value.startsWith("/") ? value : `/${value}`}`;
}

function printVoucherUrl(voucherUrl: string) {
  const popup = window.open("", "_blank");
  if (!popup) {
    window.location.href = voucherUrl;
    toast.info("Popup bloquee. Voucher ouvert dans l onglet courant pour impression.");
    return;
  }
  popup.addEventListener("load", () => {
    popup.focus();
    popup.print();
  }, { once: true });
  popup.location.href = voucherUrl;
}

function isAmicaleDemand(demand: ReservationDemand) {
  return String(demand.payment_mode || "").trim() === "amicale" || Boolean(String(demand.pricing_amicale_id || "").trim());
}

function isRejectedAmicaleDemand(status?: ReservationDemandStatus | null) {
  return ["rejete_par_amicale", "rejete_par_agence", "demande_rejetee_admin"].includes(String(status || "").trim());
}

function buildPropertyPath(demand: ReservationDemand) {
  if (String((demand as AmicaleDemandRow).source_kind || "").trim() === "hotel") {
    const hotelToken = String((demand as AmicaleDemandRow).hotel_id || demand.bien_id || "").trim();
    return hotelToken ? `/hotels/${encodeURIComponent(hotelToken)}` : "/hotels";
  }
  const token = String(demand.bien_reference || demand.bien_id || "").trim();
  return token ? `/properties/${encodeURIComponent(token)}` : "/logements";
}

function demandStatusLabel(status?: ReservationDemandStatus | null) {
  const value = String(status || "").trim() as ReservationDemandStatus;
  return statusLabels[value] || value || "-";
}

function demandStatusTone(status?: ReservationDemandStatus | null) {
  const value = String(status || "").trim() as ReservationDemandStatus;
  return statusToneClasses[value] || "bg-gray-100 text-gray-700 border-gray-200";
}

function toRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : null;
}

function mapHotelDemandToAmicaleDemandRow(row: HotelReservationDemand): AmicaleDemandRow {
  const adultGuests = Math.max(1, Number(row.adults || 1));
  const childAges = Array.isArray(row.child_ages) ? row.child_ages.map((age) => Number(age)).filter((age) => Number.isFinite(age) && age >= 0) : [];
  const hotelId = String(row.hotel_id || "").trim();
  return {
    ...row,
    source_kind: "hotel",
    request_type: "reservation",
    bien_id: hotelId,
    bien_reference: hotelId ? `HOTEL-${hotelId}` : row.id,
    bien_titre: row.hotel_name || null,
    bien_mode: "hotellerie",
    start_date: row.check_in,
    end_date: row.check_out,
    guests: adultGuests + childAges.length,
    adult_guests: adultGuests,
    child_guests: childAges.length,
    total_amount: row.total_price ?? null,
    amount_due_now: row.amount_due_now ?? null,
    child_ages: childAges,
    adults: adultGuests,
    hotel_id: hotelId,
    hotel_name: row.hotel_name || null,
    boarding_name: row.boarding_name || null,
    room_name: row.room_name || null,
    client_phone: row.client_phone || null,
    hotel_context: row.hotel_context || null,
    pricing_amicale_id: row.pricing_amicale_id || null,
    amicale_name: row.amicale_name || null,
    amicale_matricule: row.amicale_matricule || null,
    amicale_phone: row.amicale_phone || null,
    amicale_code: row.amicale_code || null,
    amicale_validation_at: row.amicale_validation_at || null,
    agency_validation_at: row.agency_validation_at || null,
    voucher_id: row.voucher_id || null,
    voucher_number: row.voucher_number || null,
    voucher_url: row.voucher_url || null,
    voucher_generated_at: row.voucher_generated_at || null,
    voucher_sent_at: row.voucher_sent_at || null,
  };
}

function getHotelDemandRoomLines(demand: AmicaleDemandRow) {
  const context = toRecord(demand.hotel_context);
  const rawRooms = Array.isArray(context?.rooms) ? context.rooms : [];
  const lines = rawRooms
    .map((entry, index) => {
      const room = toRecord(entry);
      if (!room) return "";
      const adults = Math.max(0, Number(room.adults || 0));
      const children = Math.max(0, Number(room.children || 0));
      const childAges = Array.isArray(room.childAges)
        ? room.childAges.map((age) => Number(age)).filter((age) => Number.isFinite(age) && age >= 0)
        : [];
      const parts = [
        `Chambre ${index + 1}`,
        String(room.boardingName || room.boarding_name || "Pension non precise").trim(),
        String(room.roomName || room.room_name || "Type chambre non precise").trim(),
        `${adults} adulte${adults > 1 ? "s" : ""}${children > 0 ? `, ${children} enfant${children > 1 ? "s" : ""}` : ""}`,
      ];
      if (childAges.length > 0) {
        parts.push(`ages: ${childAges.join(", ")} ans`);
      }
      return parts.join(" - ");
    })
    .filter(Boolean);
  if (lines.length > 0) return lines;

  const fallbackChildren = Array.isArray(demand.child_ages) ? demand.child_ages : [];
  const fallbackAdults = Math.max(1, Number(demand.adults || demand.adult_guests || 1));
  return [
    [
      "Chambre 1",
      String(demand.boarding_name || "Pension non precise").trim(),
      String(demand.room_name || "Type chambre non precise").trim(),
      `${fallbackAdults} adulte${fallbackAdults > 1 ? "s" : ""}${fallbackChildren.length > 0 ? `, ${fallbackChildren.length} enfant${fallbackChildren.length > 1 ? "s" : ""}` : ""}`,
      fallbackChildren.length > 0 ? `ages: ${fallbackChildren.join(", ")} ans` : "",
    ].filter(Boolean).join(" - "),
  ];
}

function getHotelDemandTravellerLines(demand: AmicaleDemandRow) {
  const context = toRecord(demand.hotel_context);
  const travellers = toRecord(context?.travellers);
  const adults = Array.isArray(travellers?.adults) ? travellers.adults : [];
  const children = Array.isArray(travellers?.children) ? travellers.children : [];
  const adultLines = adults.map((entry, index) => {
    const person = toRecord(entry);
    const firstName = String(person?.firstName || "").trim();
    const lastName = String(person?.lastName || "").trim();
    return `${index + 1}. ${firstName || "-"} ${lastName || ""}`.trim();
  }).filter(Boolean);
  const childLines = children.map((entry, index) => {
    const person = toRecord(entry);
    const firstName = String(person?.firstName || "").trim();
    const lastName = String(person?.lastName || "").trim();
    const age = Number(person?.age);
    return `${index + 1}. ${firstName || "-"} ${lastName || ""}${Number.isFinite(age) && age >= 0 ? ` (${age} ans)` : ""}`.trim();
  }).filter(Boolean);
  return { adultLines, childLines };
}

function buildHotelVoucherPatch(demand: AmicaleDemandRow) {
  return {
    voucher_id: String(demand.voucher_id || `hotel-voucher-${demand.id}`).trim(),
    voucher_number: String(demand.voucher_number || `HTL-${String(demand.id).slice(-8).toUpperCase()}`).trim(),
  };
}

export default function AmicalesPage() {
  const [amicales, setAmicales] = useState<AmicaleItem[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [proprietaires, setProprietaires] = useState<Proprietaire[]>([]);
  const [demandRows, setDemandRows] = useState<AmicaleDemandRow[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [hotelMarkupPercent, setHotelMarkupPercent] = useState("0");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminAmicaleTab>("amicales");
  const [demandSectionTab, setDemandSectionTab] = useState<DemandSectionTab>("actives");
  const [demandSortMode, setDemandSortMode] = useState<DemandSortMode>("arrival");
  const [activeAmicaleFilter, setActiveAmicaleFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingVoucherId, setUploadingVoucherId] = useState<string | null>(null);
  const [hotelMarkupById, setHotelMarkupById] = useState<Record<string, string>>({});
  const [financialDrafts, setFinancialDrafts] = useState<Record<string, { ownerAmount: string; ownerTotal: string; netProfit: string }>>({});
  const [expandedFinancials, setExpandedFinancials] = useState<Record<string, boolean>>({});
  const [savingFinancialDemandId, setSavingFinancialDemandId] = useState<string | null>(null);
  const [savingAmicaleGross, setSavingAmicaleGross] = useState(false);
  const [amicaleGrossDraft, setAmicaleGrossDraft] = useState<AmicaleGrossDraft>(() => buildEmptyAmicaleGrossDraft());
  const [amicaleGrossEntries, setAmicaleGrossEntries] = useState<AmicaleGrossManualEntry[]>(() => loadAmicaleGrossEntries());
  const [amicaleGrossPropertySearch, setAmicaleGrossPropertySearch] = useState("");

  const loadData = useCallback(async (options?: { background?: boolean }) => {
    if (!options?.background) setLoading(true);
    try {
      const [amicalesResponse, biensResponse, proprietairesResponse, demandsResponse, hotelDemandsResponse] = await Promise.all([
        fetchAmicalesAdmin(),
        fetch(`${API_URL}/biens`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/proprietaires`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/reservation-demands`, { credentials: "include" }),
        fetch(`${API_URL}/hotel-reservation-demands`, { credentials: "include" }),
      ]);
      const biensJson = biensResponse.ok ? await biensResponse.json().catch(() => []) : [];
      const proprietairesJson = proprietairesResponse.ok ? await proprietairesResponse.json().catch(() => []) : [];
      const demandJson = demandsResponse.ok ? await demandsResponse.json().catch(() => []) : [];
      const hotelDemandJson = hotelDemandsResponse.ok ? await hotelDemandsResponse.json().catch(() => []) : [];
      setAmicales(Array.isArray(amicalesResponse) ? amicalesResponse : []);
      setBiens(Array.isArray(biensJson) ? biensJson : []);
      setProprietaires(Array.isArray(proprietairesJson) ? proprietairesJson : []);
      setDemandRows(sortAmicaleDemandRows(
        [
          ...(Array.isArray(demandJson) ? demandJson : []),
          ...(Array.isArray(hotelDemandJson) ? hotelDemandJson.map((row) => mapHotelDemandToAmicaleDemandRow(row as HotelReservationDemand)) : []),
        ]
          .filter((row): row is AmicaleDemandRow => Boolean(row && isAmicaleDemand(row))),
        "recent"
      ));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible");
    } finally {
      if (!options?.background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (activeTab !== "demandes") return;
      if (savingId || uploadingVoucherId || savingFinancialDemandId || logoUploading) return;
      void loadData({ background: true });
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [activeTab, loadData, logoUploading, savingFinancialDemandId, savingId, uploadingVoucherId]);

  useEffect(() => {
    setHotelMarkupById(
      amicales.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = String(normalizeAmicaleHotelMarkupPercent(item.hotelMarkupPercent));
        return acc;
      }, {})
    );
  }, [amicales]);

  useEffect(() => {
    if (!biens.length) return;
    const missingMediaBienIds = biens
      .filter((item) => !Array.isArray(item.media) || item.media.length === 0)
      .map((item) => String(item.id || "").trim())
      .filter(Boolean);
    if (!missingMediaBienIds.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/media-bulk?bien_ids=${encodeURIComponent(missingMediaBienIds.join(","))}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const mediaRows = await response.json().catch(() => []);
        if (cancelled || !Array.isArray(mediaRows)) return;
        const mediaByBienId = new Map<string, any[]>();
        for (const media of mediaRows) {
          const bienId = String(media?.bien_id || "").trim();
          if (!bienId) continue;
          const current = mediaByBienId.get(bienId) || [];
          current.push(media);
          mediaByBienId.set(bienId, current);
        }
        setBiens((current) => current.map((item) => {
          const bienId = String(item.id || "").trim();
          const media = mediaByBienId.get(bienId);
          return media && media.length > 0 ? { ...item, media } : item;
        }));
      } catch {
        // ignore media preview failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [biens]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AMICALE_GROSS_STORAGE_KEY, JSON.stringify(amicaleGrossEntries));
  }, [amicaleGrossEntries]);

  const amicaleCounts = useMemo(() => {
    const waitingAmicale = demandRows.filter((row) => row.status === "attente_validation_amicale").length;
    const waitingAgency = demandRows.filter((row) => row.status === "attente_validation_par_agence").length;
    const voucherCount = demandRows.filter((row) => row.status === "voucher_en_cours" && Boolean(row.voucher_url)).length;
    const rejectedCount = demandRows.filter((row) => isRejectedAmicaleDemand(row.status)).length;
    return { waitingAmicale, waitingAgency, voucherCount, rejectedCount };
  }, [demandRows]);

  const amicaleNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of amicales) {
      map.set(String(item.id || "").trim(), String(item.name || "").trim());
    }
    return map;
  }, [amicales]);

  const proprietaireNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of proprietaires) {
      map.set(String(item.id || "").trim(), String(item.nom || "").trim());
    }
    return map;
  }, [proprietaires]);

  const scopedDemandRows = useMemo(() => (
    demandSectionTab === "rejetees"
      ? demandRows.filter((row) => isRejectedAmicaleDemand(row.status))
      : demandRows.filter((row) => !isRejectedAmicaleDemand(row.status))
  ), [demandRows, demandSectionTab]);

  const amicaleTabs = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>();
    for (const row of scopedDemandRows) {
      const id = String(row.pricing_amicale_id || "").trim();
      if (!id) continue;
      const current = byId.get(id);
      const name = String(row.amicale_name || amicaleNameById.get(id) || id).trim();
      byId.set(id, { id, name, count: (current?.count || 0) + 1 });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [scopedDemandRows, amicaleNameById]);

  const selectedGrossAmicale = useMemo(
    () => amicales.find((item) => String(item.id || "").trim() === amicaleGrossDraft.amicaleId) || null,
    [amicales, amicaleGrossDraft.amicaleId]
  );

  const selectedGrossBien = useMemo(
    () => biens.find((item) => String(item.id || "").trim() === amicaleGrossDraft.bienId) || null,
    [biens, amicaleGrossDraft.bienId]
  );

  const selectedGrossOwnerName = useMemo(() => {
    if (!selectedGrossBien) return "";
    return proprietaireNameById.get(String(selectedGrossBien.proprietaire_id || "").trim()) || String((selectedGrossBien as { proprietaire_nom?: string | null }).proprietaire_nom || "").trim();
  }, [proprietaireNameById, selectedGrossBien]);

  const grossArrivalDate = useMemo(
    () => parseDateInputValue(amicaleGrossDraft.arrivalDate),
    [amicaleGrossDraft.arrivalDate]
  );
  const grossDepartureDate = useMemo(
    () => parseDateInputValue(amicaleGrossDraft.departureDate),
    [amicaleGrossDraft.departureDate]
  );

  const missingGrossSetupLabels = useMemo(() => {
    const labels: string[] = [];
    if (!amicaleGrossDraft.amicaleId) labels.push("amicale");
    if (!amicaleGrossDraft.bienId) labels.push("bien");
    if (!amicaleGrossDraft.arrivalDate) labels.push("arrivee");
    if (!amicaleGrossDraft.departureDate) labels.push("depart");
    return labels;
  }, [
    amicaleGrossDraft.amicaleId,
    amicaleGrossDraft.arrivalDate,
    amicaleGrossDraft.bienId,
    amicaleGrossDraft.departureDate,
  ]);

  const filteredGrossBiens = useMemo(() => {
    const needle = String(amicaleGrossPropertySearch || "").trim().toLowerCase();
    return biens
      .slice()
      .sort((left, right) => String(left.reference || "").localeCompare(String(right.reference || ""), "fr"))
      .filter((item) => {
        if (!needle) return true;
        const ownerName = proprietaireNameById.get(String(item.proprietaire_id || "").trim()) || String((item as { proprietaire_nom?: string | null }).proprietaire_nom || "").trim();
        const bag = [
          item.reference,
          item.titre,
          ownerName,
        ].map((value) => String(value || "").toLowerCase());
        return bag.some((value) => value.includes(needle));
      });
  }, [amicaleGrossPropertySearch, biens, proprietaireNameById]);

  const sortedAmicaleGrossEntries = useMemo(() => (
    [...amicaleGrossEntries].sort((left, right) => {
      const leftTime = parseSortDate(left.arrivalDate);
      const rightTime = parseSortDate(right.arrivalDate);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
      return parseSortDate(right.updatedAt) - parseSortDate(left.updatedAt);
    })
  ), [amicaleGrossEntries]);

  const filteredDemands = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const filtered = scopedDemandRows.filter((row) => {
      const amicaleId = String(row.pricing_amicale_id || "").trim();
      if (activeAmicaleFilter !== "all" && amicaleId !== activeAmicaleFilter) return false;
      if (!needle) return true;
      const bag = [
        row.client_name,
        row.amicale_matricule,
        row.amicale_phone,
        row.bien_reference,
        row.bien_titre,
        row.amicale_name,
        row.pricing_amicale_id,
        row.status,
      ].map((v) => String(v || "").toLowerCase());
      return bag.some((v) => v.includes(needle));
    });
    return sortAmicaleDemandRows(filtered, demandSortMode);
  }, [activeAmicaleFilter, demandSortMode, scopedDemandRows, searchTerm]);

  const handleAdd = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error("Nom et code obligatoires.");
      return;
    }
    try {
      await createAmicaleApi({
        name,
        code,
        logoUrl: logoUrl || undefined,
        hotelMarkupPercent: normalizeAmicaleHotelMarkupPercent(hotelMarkupPercent),
      });
      setName("");
      setCode("");
      setHotelMarkupPercent("0");
      setLogoUrl("");
      setLogoFile(null);
      await loadData();
      toast.success("Amicale ajoutee.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ajout impossible");
    }
  };

  const handleSaveHotelMarkup = async (item: AmicaleItem) => {
    const nextMarkup = normalizeAmicaleHotelMarkupPercent(hotelMarkupById[item.id]);
    setSavingId(item.id);
    try {
      await updateAmicaleApi({
        id: item.id,
        name: item.name,
        code: item.code,
        logoUrl: item.logoUrl,
        hotelMarkupPercent: nextMarkup,
      });
      toast.success("Majoration hotel mise a jour.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setSavingId(null);
    }
  };

  const handleLogoUpload = async (file?: File | null) => {
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("upload_scope", "amicale");
      formData.append("amicale_name", name.trim());
      formData.append("amicale_code", code.trim());
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await response.json().catch(() => null);
          throw new Error(String(payload?.error || "Upload logo impossible"));
        }
        throw new Error((await response.text().catch(() => "")) || "Upload logo impossible");
      }
      const data = await response.json().catch(() => null);
      const uploadedUrl = String(data?.url || data?.imageUrl || "").trim();
      if (!uploadedUrl) throw new Error("URL logo manquante apres upload");
      setLogoUrl(uploadedUrl);
      setLogoFile(null);
      toast.success("Logo uploadé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload logo impossible");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleDemandAction = async (demand: AmicaleDemandRow, nextStatus: "attente_validation_par_agence" | "voucher_en_cours" | "rejete_par_agence") => {
    setSavingId(demand.id);
    try {
      const isHotel = String(demand.source_kind || "").trim() === "hotel";
      let response: Response;
      if (isHotel) {
        if (nextStatus === "attente_validation_par_agence") {
          response = await fetch(`${API_URL}/hotel-reservation-demands/${encodeURIComponent(demand.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              status: "attente_validation_par_agence",
              admin_note: String(demand.admin_note || "").trim() || "Demande amicale transmise a l agence pour validation finale.",
            }),
          });
        } else {
          response = await fetch(
            `${API_URL}/admin/hotel-reservation-demands/${encodeURIComponent(demand.id)}/${nextStatus === "voucher_en_cours" ? "validate" : "reject"}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                ...(nextStatus === "voucher_en_cours" ? buildHotelVoucherPatch(demand) : {}),
                admin_note: String(demand.admin_note || "").trim() || (
                  nextStatus === "voucher_en_cours"
                    ? "Agence valide la demande amicale. Voucher genere automatiquement."
                    : "Agence rejette la demande amicale"
                ),
              }),
            }
          );
        }
      } else {
        response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status: nextStatus,
            actor_type: "admin",
            actor_id: "admin",
            admin_note: String(demand.admin_note || "").trim() || undefined,
            history_note:
              nextStatus === "attente_validation_par_agence"
                ? "Demande amicale transmise a l agence pour validation finale"
                : nextStatus === "voucher_en_cours"
                  ? "Agence valide la demande amicale et genere le voucher"
                  : "Agence rejette la demande amicale",
          }),
        });
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(String(data?.error || "Mise a jour impossible"));
      }
      toast.success(
        nextStatus === "attente_validation_par_agence"
          ? "Demande passee en attente agence."
          : nextStatus === "voucher_en_cours"
            ? "Demande validee. Voucher genere automatiquement."
            : "Demande rejetee."
      );
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveAdminNote = async (demand: AmicaleDemandRow) => {
    setSavingId(demand.id);
    try {
      const isHotel = String(demand.source_kind || "").trim() === "hotel";
      const response = await fetch(
        `${API_URL}/${isHotel ? "hotel-reservation-demands" : "reservation-demands"}/${encodeURIComponent(demand.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            admin_note: String(demand.admin_note || "").trim() || null,
            ...(isHotel ? {} : { actor_type: "admin", actor_id: "admin" }),
          }),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(String(data?.error || "Sauvegarde note impossible"));
      }
      toast.success("Note admin enregistree");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sauvegarde note impossible");
    } finally {
      setSavingId(null);
    }
  };

  const handleVoucherUpload = async (demand: AmicaleDemandRow, file: File | null) => {
    if (!file) return;
    if (String(demand.source_kind || "").trim() !== "hotel") return;
    setUploadingVoucherId(demand.id);
    try {
      await uploadHotelVoucherPdf(demand.id, file);
      toast.success(demand.voucher_url ? "Voucher PDF remplace." : "Voucher PDF charge.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload voucher impossible");
    } finally {
      setUploadingVoucherId(null);
    }
  };

  const handleVoucherRegenerate = async (demand: AmicaleDemandRow) => {
    if (String(demand.source_kind || "").trim() !== "hotel") return;
    setSavingId(demand.id);
    try {
      await regenerateHotelVoucher(demand.id, {
        status: demand.status === "voucher_envoye" ? "voucher_envoye" : "voucher_en_cours",
        voucher_id: demand.voucher_id || undefined,
        voucher_number: demand.voucher_number || undefined,
      });
      toast.success("Voucher regenere.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Regeneration voucher impossible");
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteDemand = async (demand: AmicaleDemandRow) => {
    const confirmed = window.confirm(`Supprimer definitivement la demande ${demand.id} de la base de donnees ?`);
    if (!confirmed) return;
    setSavingId(demand.id);
    try {
      const endpoint = String(demand.source_kind || "").trim() === "hotel"
        ? `${API_URL}/hotel-reservation-demands/${encodeURIComponent(demand.id)}`
        : `${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}`;
      const response = await fetch(endpoint, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(String(data?.error || "Suppression impossible"));
      }
      toast.success("Demande supprimee de la base.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setSavingId(null);
    }
  };

  const resetAmicaleGrossDraft = () => {
    setAmicaleGrossDraft(buildEmptyAmicaleGrossDraft());
  };

  const fetchUnavailableDatesForBien = useCallback(async (bienId: string) => {
    const normalizedBienId = String(bienId || "").trim();
    if (!normalizedBienId) return [] as UnavailableDateApiRow[];
    const response = await fetch(`${API_URL}/unavailable-dates/${encodeURIComponent(normalizedBienId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Impossible de charger les indisponibilites du bien");
    }
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? (rows as UnavailableDateApiRow[]) : [];
  }, []);

  const deleteUnavailableDateById = useCallback(async (id: string) => {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return;
    const response = await fetch(`${API_URL}/unavailable-dates/${encodeURIComponent(normalizedId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok && response.status !== 404) {
      throw new Error("Impossible de supprimer l indisponibilite amicale en gros");
    }
  }, []);

  const syncAmicaleGrossUnavailableDate = useCallback(async (
    entry: AmicaleGrossManualEntry,
    previousEntry?: AmicaleGrossManualEntry | null
  ) => {
    const syncUid = String(entry.id || "").trim();
    if (!syncUid) {
      throw new Error("Identifiant amicale en gros manquant");
    }
    const bienIds = Array.from(new Set([
      String(entry.bienId || "").trim(),
      String(previousEntry?.bienId || "").trim(),
    ].filter(Boolean)));

    for (const bienId of bienIds) {
      const rows = await fetchUnavailableDatesForBien(bienId);
      const matchingRows = rows.filter((row) =>
        String(row?.sync_source || "").trim() === AMICALE_GROSS_SYNC_SOURCE
        && String(row?.sync_uid || "").trim() === syncUid
      );
      for (const row of matchingRows) {
        await deleteUnavailableDateById(String(row.id || "").trim());
      }
    }

    const createResponse = await fetch(`${API_URL}/unavailable-dates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        bien_id: entry.bienId,
        start_date: entry.arrivalDate,
        end_date: entry.departureDate,
        status: "blocked",
        color: AMICALE_GROSS_UNAVAILABLE_COLOR,
        sync_source: AMICALE_GROSS_SYNC_SOURCE,
        sync_uid: syncUid,
      }),
    });
    if (!createResponse.ok) {
      const data = await createResponse.json().catch(() => null);
      throw new Error(String(data?.error || "Impossible d enregistrer l indisponibilite amicale en gros"));
    }
  }, [deleteUnavailableDateById, fetchUnavailableDatesForBien]);

  const removeAmicaleGrossUnavailableDate = useCallback(async (entry: AmicaleGrossManualEntry) => {
    const bienId = String(entry?.bienId || "").trim();
    const syncUid = String(entry?.id || "").trim();
    if (!bienId || !syncUid) return;
    const rows = await fetchUnavailableDatesForBien(bienId);
    const matchingRows = rows.filter((row) =>
      String(row?.sync_source || "").trim() === AMICALE_GROSS_SYNC_SOURCE
      && String(row?.sync_uid || "").trim() === syncUid
    );
    for (const row of matchingRows) {
      await deleteUnavailableDateById(String(row.id || "").trim());
    }
  }, [deleteUnavailableDateById, fetchUnavailableDatesForBien]);

  const handleSaveAmicaleGrossEntry = async () => {
    const selectedAmicaleId = String(amicaleGrossDraft.amicaleId || "").trim();
    const selectedBienId = String(amicaleGrossDraft.bienId || "").trim();
    const arrivalDate = String(amicaleGrossDraft.arrivalDate || "").trim();
    const departureDate = String(amicaleGrossDraft.departureDate || "").trim();
    const ownerAdvanceAmount = parseOptionalAmount(amicaleGrossDraft.ownerAdvanceAmount);
    const rentalTotalAmount = parseOptionalAmount(amicaleGrossDraft.rentalTotalAmount);
    const benefitAmount = parseOptionalAmount(amicaleGrossDraft.benefitAmount);
    const note = String(amicaleGrossDraft.note || "").trim();
    const amicale = amicales.find((item) => String(item.id || "").trim() === selectedAmicaleId) || null;
    const bien = biens.find((item) => String(item.id || "").trim() === selectedBienId) || null;
    if (!amicale || !bien || !arrivalDate || !departureDate) {
      toast.error("Selectionnez l amicale, le bien et les dates.");
      return;
    }
    if (parseSortDate(arrivalDate) > parseSortDate(departureDate)) {
      toast.error("La date de depart doit etre apres la date d arrivee.");
      return;
    }
    if (
      ownerAdvanceAmount === null || !Number.isFinite(ownerAdvanceAmount)
      || rentalTotalAmount === null || !Number.isFinite(rentalTotalAmount)
      || benefitAmount === null || !Number.isFinite(benefitAmount)
      || !note
    ) {
      toast.error("Saisissez les 4 variables manuelles: avance, location totale, note et benefice.");
      return;
    }

    const nowIso = new Date().toISOString();
    const previousEntry = amicaleGrossDraft.entryId
      ? (amicaleGrossEntries.find((entry) => entry.id === amicaleGrossDraft.entryId) || null)
      : null;
    const nextEntry: AmicaleGrossManualEntry = {
      id: amicaleGrossDraft.entryId || createLocalId("amg"),
      amicaleId: selectedAmicaleId,
      amicaleName: String(amicale.name || "").trim(),
      bienId: selectedBienId,
      bienReference: String(bien.reference || "").trim(),
      bienTitle: String(bien.titre || "").trim(),
      arrivalDate,
      departureDate,
      ownerAdvanceAmount,
      rentalTotalAmount,
      note,
      benefitAmount,
      createdAt: amicaleGrossDraft.entryId
        ? (amicaleGrossEntries.find((entry) => entry.id === amicaleGrossDraft.entryId)?.createdAt || nowIso)
        : nowIso,
      updatedAt: nowIso,
    };

    setSavingAmicaleGross(true);
    try {
      await syncAmicaleGrossUnavailableDate(nextEntry, previousEntry);
      setAmicaleGrossEntries((current) => {
        if (amicaleGrossDraft.entryId) {
          return current.map((entry) => (entry.id === amicaleGrossDraft.entryId ? nextEntry : entry));
        }
        return [nextEntry, ...current];
      });
      resetAmicaleGrossDraft();
      toast.success(amicaleGrossDraft.entryId ? "Saisie amicale en gros mise a jour." : "Saisie amicale en gros ajoutee.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement amicale en gros impossible");
    } finally {
      setSavingAmicaleGross(false);
    }
  };

  const handleEditAmicaleGrossEntry = (entry: AmicaleGrossManualEntry) => {
    setActiveTab("en_gros");
    setAmicaleGrossDraft({
      entryId: entry.id,
      amicaleId: entry.amicaleId,
      bienId: entry.bienId,
      arrivalDate: entry.arrivalDate,
      departureDate: entry.departureDate,
      ownerAdvanceAmount: String(entry.ownerAdvanceAmount),
      rentalTotalAmount: String(entry.rentalTotalAmount),
      note: entry.note,
      benefitAmount: String(entry.benefitAmount),
    });
  };

  const handleDeleteAmicaleGrossEntry = async (entryId: string) => {
    if (!window.confirm("Supprimer cette saisie amicale en gros ?")) return;
    const targetEntry = amicaleGrossEntries.find((entry) => entry.id === entryId) || null;
    setSavingAmicaleGross(true);
    try {
      if (targetEntry) {
        await removeAmicaleGrossUnavailableDate(targetEntry);
      }
      setAmicaleGrossEntries((current) => current.filter((entry) => entry.id !== entryId));
      if (amicaleGrossDraft.entryId === entryId) {
        resetAmicaleGrossDraft();
      }
      toast.success("Saisie amicale en gros supprimee.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression amicale en gros impossible");
    } finally {
      setSavingAmicaleGross(false);
    }
  };

  const handleAmicaleGrossCalendarDayClick = (date: Date) => {
    const clicked = formatDateInputValue(date);
    const currentArrival = parseDateInputValue(amicaleGrossDraft.arrivalDate);
    const currentDeparture = parseDateInputValue(amicaleGrossDraft.departureDate);
    if (!currentArrival || currentDeparture) {
      setAmicaleGrossDraft((prev) => ({
        ...prev,
        arrivalDate: clicked,
        departureDate: "",
      }));
      return;
    }
    if (date.getTime() < currentArrival.getTime()) {
      setAmicaleGrossDraft((prev) => ({
        ...prev,
        arrivalDate: clicked,
        departureDate: formatDateInputValue(currentArrival),
      }));
      return;
    }
    setAmicaleGrossDraft((prev) => ({
      ...prev,
      departureDate: clicked,
    }));
  };

  const getFinancialDraft = (demand: AmicaleDemandRow) => {
    const existing = financialDrafts[demand.id];
    if (existing) return existing;
    return {
      ownerAmount: demand.montant_donne_proprietaire === null || demand.montant_donne_proprietaire === undefined ? "" : String(Math.round(Number(demand.montant_donne_proprietaire) * 100) / 100),
      ownerTotal: demand.montant_total_proprietaire === null || demand.montant_total_proprietaire === undefined ? "" : String(Math.round(Number(demand.montant_total_proprietaire) * 100) / 100),
      netProfit: demand.profit_net === null || demand.profit_net === undefined ? "" : String(Math.round(Number(demand.profit_net) * 100) / 100),
    };
  };

  const handleFinancialDraftChange = (
    demand: AmicaleDemandRow,
    patch: Partial<{ ownerAmount: string; ownerTotal: string; netProfit: string }>
  ) => {
    const current = getFinancialDraft(demand);
    const next = { ...current, ...patch };
    if (patch.ownerAmount !== undefined && patch.netProfit === undefined) {
      const parsedOwnerAmount = Number(String(patch.ownerAmount || "").replace(",", "."));
      if (Number.isFinite(parsedOwnerAmount)) {
        next.netProfit = String(Math.round((Number(demand.total_amount || 0) - parsedOwnerAmount) * 100) / 100);
      }
    }
    setFinancialDrafts((prev) => ({ ...prev, [demand.id]: next }));
  };

  const handleSaveFinancials = async (demand: AmicaleDemandRow) => {
    const draft = getFinancialDraft(demand);
    const ownerAmount = parseOptionalAmount(draft.ownerAmount);
    const ownerTotal = parseOptionalAmount(draft.ownerTotal);
    const netProfit = parseOptionalAmount(draft.netProfit);
    if ((ownerAmount !== null && !Number.isFinite(ownerAmount)) || (ownerTotal !== null && !Number.isFinite(ownerTotal)) || (netProfit !== null && !Number.isFinite(netProfit))) {
      toast.error("Montants invalides");
      return;
    }
    setSavingFinancialDemandId(demand.id);
    try {
      const endpoint = String(demand.source_kind || "").trim() === "hotel"
        ? `${API_URL}/hotel-reservation-demands/${encodeURIComponent(demand.id)}`
        : `${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}`;
      const response = await fetch(endpoint, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          montant_donne_proprietaire: ownerAmount,
          montant_total_proprietaire: ownerTotal,
          profit_net: netProfit,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.error || "Sauvegarde montants impossible"));
      }
      const updated = await response.json().catch(() => null);
      if (updated?.id) {
        setDemandRows((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      } else {
        await loadData();
      }
      toast.success("Montants de la demande mis a jour");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sauvegarde montants impossible");
    } finally {
      setSavingFinancialDemandId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const amicaleDemandCount = demandRows.length;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Amicales</h1>
          <p className="mt-1 text-sm text-gray-500">Ajoutez les amicales, puis suivez ici les demandes amicale et leur statut.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Recharger
        </button>
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveTab("amicales")}
          className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "amicales" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
        >
          Amicales
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("en_gros")}
          className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "en_gros" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
        >
          Amicale en gros
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("demandes")}
          className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "demandes" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
        >
          Demandes adherants
        </button>
      </div>

      {activeTab === "amicales" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Amicales" value={amicales.length} tone="emerald" />
            <StatCard label="Demandes amicale" value={amicaleDemandCount} tone="sky" />
            <StatCard label="En attente amicale" value={amicaleCounts.waitingAmicale} tone="amber" />
            <StatCard label="En attente agence" value={amicaleCounts.waitingAgency} tone="indigo" />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
            <p className="text-sm font-semibold text-gray-900">Nouvelle amicale</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nom amicale"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Code amicale"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={hotelMarkupPercent}
                onChange={(event) => setHotelMarkupPercent(event.target.value)}
                placeholder="Majoration hotel (%)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="rounded-lg border border-gray-200 p-3 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Logo amicale (upload)</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] || null;
                    setLogoFile(nextFile);
                    if (nextFile) {
                      setLogoUrl("");
                      toast.info(`Fichier selectionne: ${nextFile.name}`);
                    }
                  }}
                  className="w-full text-sm"
                />
                {logoFile ? (
                  <p className="mt-2 text-xs text-gray-600">
                    Fichier selectionne: <span className="font-semibold">{logoFile.name}</span>
                  </p>
                ) : null}
                {logoUploading ? (
                  <p className="mt-2 text-xs text-emerald-700">Upload du logo en cours...</p>
                ) : null}
                {!logoUploading && logoFile ? (
                  <button
                    type="button"
                    onClick={() => void handleLogoUpload(logoFile)}
                    className="mt-3 inline-flex rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Uploader le logo
                  </button>
                ) : null}
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo amicale" className="mt-3 h-16 w-16 rounded-lg border border-gray-200 object-cover" />
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={logoUploading}
              className="mt-4 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Ajouter
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
            <p className="text-sm font-semibold text-gray-900">Liste des amicales</p>
            {amicales.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">Aucune amicale ajoutee.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="px-3 py-2 font-semibold">Nom</th>
                      <th className="px-3 py-2 font-semibold">Logo</th>
                      <th className="px-3 py-2 font-semibold">Code</th>
                      <th className="px-3 py-2 font-semibold">Majoration hotel</th>
                      <th className="px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amicales.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-900">{item.name}</td>
                        <td className="px-3 py-2">
                          {item.logoUrl ? (
                            <img src={item.logoUrl} alt={item.name} className="h-10 w-10 rounded-lg border border-gray-200 object-cover" />
                          ) : (
                            <span className="text-xs text-gray-400">Sans logo</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{item.code}</td>
                        <td className="px-3 py-2">
                          <div className="flex min-w-[170px] items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={hotelMarkupById[item.id] ?? String(normalizeAmicaleHotelMarkupPercent(item.hotelMarkupPercent))}
                              onChange={(event) => setHotelMarkupById((prev) => ({ ...prev, [item.id]: event.target.value }))}
                              className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <span className="text-xs font-semibold text-gray-500">%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={savingId === item.id}
                              onClick={() => void handleSaveHotelMarkup(item)}
                              className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              onClick={() => void (async () => {
                                try {
                                  await deleteAmicaleApi(item.id);
                                  await loadData();
                                  toast.success("Amicale supprimee.");
                                } catch (error) {
                                  toast.error(error instanceof Error ? error.message : "Suppression impossible");
                                }
                              })()}
                              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "en_gros" && (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-950 via-emerald-900 to-cyan-900 p-6 text-white shadow-[0_24px_80px_-32px_rgba(4,120,87,0.55)]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100/90">
                  <Sparkles className="h-3.5 w-3.5" />
                  Amicale en gros
                </div>
                <h2 className="mt-4 text-2xl font-bold tracking-tight">Saisie visuelle des locations amicales</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
                  Choisissez l amicale, trouvez le bien avec photo et proprietaire, puis definissez la plage de sejour avec le calendrier du site avant de saisir vos montants manuels.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <GlassMetricCard label="Saisies en gros" value={String(amicaleGrossEntries.length)} />
                <GlassMetricCard label="Avances proprietaire" value={formatCurrency(sortedAmicaleGrossEntries.reduce((sum, entry) => sum + Number(entry.ownerAdvanceAmount || 0), 0))} />
                <GlassMetricCard label="Location totale" value={formatCurrency(sortedAmicaleGrossEntries.reduce((sum, entry) => sum + Number(entry.rentalTotalAmount || 0), 0))} />
                <GlassMetricCard label="Benefice" value={formatCurrency(sortedAmicaleGrossEntries.reduce((sum, entry) => sum + Number(entry.benefitAmount || 0), 0))} />
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-emerald-100 bg-white p-4 shadow-[0_22px_60px_-40px_rgba(15,118,110,0.45)] sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Nouvelle saisie amicale en gros</h3>
                <p className="mt-1 text-sm text-slate-500">Etape 1: amicale. Etape 2: bien avec photo et proprietaire. Etape 3: periode dans le calendrier. Etape 4: montants et note.</p>
              </div>
              {amicaleGrossDraft.entryId ? (
                <button
                  type="button"
                  onClick={resetAmicaleGrossDraft}
                  className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Annuler modification
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 p-4">
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Amicale</span>
                    <select
                      value={amicaleGrossDraft.amicaleId}
                      onChange={(event) => setAmicaleGrossDraft((prev) => ({ ...prev, amicaleId: event.target.value }))}
                      className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    >
                      <option value="">Selectionner amicale</option>
                      {amicales.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Selection du bien</p>
                      <p className="mt-1 text-xs text-slate-500">Recherche par reference, titre ou nom proprietaire.</p>
                    </div>
                    <div className="relative w-full sm:max-w-sm">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={amicaleGrossPropertySearch}
                        onChange={(event) => setAmicaleGrossPropertySearch(event.target.value)}
                        placeholder="Filtrer par reference ou nom proprietaire"
                        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid max-h-[540px] grid-cols-1 gap-3 overflow-auto pr-1 md:grid-cols-2">
                    {filteredGrossBiens.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500 md:col-span-2">
                        Aucun bien ne correspond a ce filtre.
                      </div>
                    ) : filteredGrossBiens.map((bien) => {
                      const isSelected = amicaleGrossDraft.bienId === bien.id;
                      const ownerName = proprietaireNameById.get(String(bien.proprietaire_id || "").trim()) || String((bien as { proprietaire_nom?: string | null }).proprietaire_nom || "").trim() || "Proprietaire inconnu";
                      const imageSrc = getBienPreviewImage(bien);
                      return (
                        <button
                          key={bien.id}
                          type="button"
                          onClick={() => setAmicaleGrossDraft((prev) => ({ ...prev, bienId: bien.id }))}
                          className={`overflow-hidden rounded-[22px] border text-left transition ${isSelected ? "border-emerald-400 bg-emerald-50 shadow-[0_20px_45px_-32px_rgba(16,185,129,0.75)]" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)]"}`}
                        >
                          <div className="relative h-32 overflow-hidden">
                            <img
                              src={imageSrc}
                              alt={bien.titre || bien.reference || "Bien"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={(event) => {
                                if (event.currentTarget.src !== BIEN_IMAGE_FALLBACK) {
                                  event.currentTarget.src = BIEN_IMAGE_FALLBACK;
                                }
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-900/10 to-transparent" />
                            <div className="absolute left-3 top-3 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm">
                              {bien.reference || bien.id}
                            </div>
                          </div>
                          <div className="space-y-2 p-4">
                            <p className="line-clamp-2 text-sm font-semibold text-slate-900">{bien.titre || "Bien sans titre"}</p>
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">{ownerName}</span>
                              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{formatCurrency(bien.prix_nuitee || 0)} / nuit</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Selection active</p>
                      <p className="mt-1 text-base font-semibold text-slate-900">{selectedGrossAmicale?.name || "Aucune amicale selectionnee"}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedGrossBien ? `${selectedGrossBien.reference} - ${selectedGrossBien.titre}` : "Choisissez un bien dans la grille a gauche."}
                      </p>
                    </div>
                    {selectedGrossBien ? (
                      <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                        {selectedGrossOwnerName || "Sans proprietaire"}
                      </div>
                    ) : null}
                  </div>

                  {selectedGrossBien ? (
                    <div className="mt-4 overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-sm">
                      <div className="grid gap-0 md:grid-cols-[170px_minmax(0,1fr)]">
                        <div className="h-40 bg-slate-100">
                          <img
                            src={getBienPreviewImage(selectedGrossBien)}
                            alt={selectedGrossBien.titre || selectedGrossBien.reference || "Bien"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(event) => {
                              if (event.currentTarget.src !== BIEN_IMAGE_FALLBACK) {
                                event.currentTarget.src = BIEN_IMAGE_FALLBACK;
                              }
                            }}
                          />
                        </div>
                        <div className="space-y-3 p-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{selectedGrossBien.reference || selectedGrossBien.id}</p>
                            <p className="mt-1 text-lg font-semibold text-slate-900">{selectedGrossBien.titre || "Bien sans titre"}</p>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <InfoPill label="Proprietaire" value={selectedGrossOwnerName || "-"} />
                            <InfoPill label="Prix nuit base" value={formatCurrency(selectedGrossBien.prix_nuitee || 0)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-slate-900">Calendrier de sejour</h4>
                      <p className="mt-1 text-sm text-slate-500">Selectionnez la date d arrivee puis la date de depart avec le meme style de calendrier que le site.</p>
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[24px] border border-emerald-100 bg-emerald-50/40 p-3">
                    <Calendar
                      numberOfMonths={2}
                      selected={grossArrivalDate || undefined}
                      modifiers={{
                        arrival: grossArrivalDate || undefined,
                        departure: grossDepartureDate || undefined,
                        inRange: (date) => {
                          if (!grossArrivalDate || !grossDepartureDate) return false;
                          return date > grossArrivalDate && date < grossDepartureDate;
                        },
                      }}
                      modifiersClassNames={{
                        arrival: "rounded-full bg-emerald-700 font-semibold !text-white shadow-[0_10px_22px_rgba(4,120,87,0.35)] hover:bg-emerald-800",
                        departure: "rounded-full bg-emerald-700 font-semibold !text-white shadow-[0_10px_22px_rgba(4,120,87,0.35)] hover:bg-emerald-800",
                        inRange: "rounded-none bg-emerald-700 font-semibold !text-white hover:bg-emerald-700",
                      }}
                      onDayClick={handleAmicaleGrossCalendarDayClick}
                      className="mx-auto w-full"
                      classNames={{
                        months: "flex flex-col gap-6 lg:flex-row lg:justify-center",
                        month: "w-full rounded-[20px] bg-white p-3 shadow-sm",
                        caption_label: "text-sm font-semibold text-slate-900",
                        table: "w-full border-separate border-spacing-y-1.5",
                        row: "flex w-full mt-2",
                        head_cell: "w-10 text-[11px] font-semibold uppercase tracking-wide text-slate-400",
                        cell: "relative h-10 w-10 overflow-visible p-0 text-center text-sm",
                        day: "relative z-10 h-10 w-10 rounded-full text-sm font-medium text-slate-700 transition-colors hover:bg-emerald-50",
                        day_today: "bg-emerald-100 text-emerald-800",
                        day_selected: "!text-white shadow-none",
                      }}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Arrivee</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateOnly(amicaleGrossDraft.arrivalDate) || "-"}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Depart</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateOnly(amicaleGrossDraft.departureDate) || "-"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5">
              <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Variables manuelles</p>
                  <p className="mt-1 text-xs text-slate-500">Tous les champs ci-dessous sont saisis manuellement par l administration.</p>
                </div>
                <div className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  {selectedGrossBien ? `${selectedGrossBien.reference} | ${formatDateOnly(amicaleGrossDraft.arrivalDate)} -> ${formatDateOnly(amicaleGrossDraft.departureDate)}` : "-"}
                </div>
              </div>

              {missingGrossSetupLabels.length > 0 ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Champs encore manquants pour finaliser la saisie: {missingGrossSetupLabels.join(", ")}.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Montant avance donnee au proprietaire</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amicaleGrossDraft.ownerAdvanceAmount}
                    onChange={(event) => setAmicaleGrossDraft((prev) => ({ ...prev, ownerAdvanceAmount: event.target.value }))}
                    placeholder="0"
                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Montant location total</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amicaleGrossDraft.rentalTotalAmount}
                    onChange={(event) => setAmicaleGrossDraft((prev) => ({ ...prev, rentalTotalAmount: event.target.value }))}
                    placeholder="0"
                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Note</span>
                  <textarea
                    value={amicaleGrossDraft.note}
                    onChange={(event) => setAmicaleGrossDraft((prev) => ({ ...prev, note: event.target.value }))}
                    placeholder="Note interne admin"
                    rows={4}
                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Benefice</span>
                  <input
                    type="number"
                    step="0.01"
                    value={amicaleGrossDraft.benefitAmount}
                    onChange={(event) => setAmicaleGrossDraft((prev) => ({ ...prev, benefitAmount: event.target.value }))}
                    placeholder="0"
                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveAmicaleGrossEntry()}
                  disabled={savingAmicaleGross}
                  className="inline-flex items-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingAmicaleGross ? "Enregistrement..." : (amicaleGrossDraft.entryId ? "Mettre a jour" : "Enregistrer la saisie")}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-white p-4 shadow-[0_20px_55px_-40px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Saisies enregistrees</h2>
                <p className="mt-1 text-sm text-slate-500">Suivi local des amicales en gros avec modification et suppression.</p>
              </div>
            </div>

            {sortedAmicaleGrossEntries.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">Aucune saisie amicale en gros pour le moment.</p>
            ) : (
              <div className="mt-4 grid gap-4">
                {sortedAmicaleGrossEntries.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-white via-emerald-50/60 to-cyan-50/60 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">{entry.amicaleName || "Amicale"}</span>
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{entry.bienReference || "-"}</span>
                        </div>
                        <div>
                          <p className="text-base font-semibold text-gray-900">{entry.bienTitle || "Bien sans titre"}</p>
                          <p className="text-sm text-gray-500">{formatDateOnly(entry.arrivalDate)} au {formatDateOnly(entry.departureDate)}</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <InfoPill label="Avance proprietaire" value={formatCurrency(entry.ownerAdvanceAmount)} />
                          <InfoPill label="Location totale" value={formatCurrency(entry.rentalTotalAmount)} />
                          <InfoPill label="Benefice" value={formatCurrency(entry.benefitAmount)} />
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Note</p>
                          <p className="mt-2 whitespace-pre-wrap">{entry.note || "-"}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditAmicaleGrossEntry(entry)}
                          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAmicaleGrossEntry(entry.id)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "demandes" && (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Total</p>
              <p className="text-xl font-bold text-emerald-900">{amicaleDemandCount}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">En attente amicale</p>
              <p className="text-xl font-bold text-amber-900">{amicaleCounts.waitingAmicale}</p>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">En attente agence</p>
              <p className="text-xl font-bold text-cyan-900">{amicaleCounts.waitingAgency}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Vouchers</p>
              <p className="text-xl font-bold text-indigo-900">{amicaleCounts.voucherCount}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setDemandSectionTab("actives")}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${demandSectionTab === "actives" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                >
                  Demandes actives ({demandRows.length - amicaleCounts.rejectedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDemandSectionTab("rejetees")}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${demandSectionTab === "rejetees" ? "bg-rose-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                >
                  Demandes rejetees ({amicaleCounts.rejectedCount})
                </button>
              </div>
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setDemandSortMode("arrival")}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${demandSortMode === "arrival" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                >
                  Arrivee la plus proche
                </button>
                <button
                  type="button"
                  onClick={() => setDemandSortMode("recent")}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${demandSortMode === "recent" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                >
                  Plus recentes
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveAmicaleFilter("all")}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeAmicaleFilter === "all" ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                Toutes ({scopedDemandRows.length})
              </button>
              {amicaleTabs.map((tabItem) => (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => setActiveAmicaleFilter(tabItem.id)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeAmicaleFilter === tabItem.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  {tabItem.name} ({tabItem.count})
                </button>
              ))}
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Filtrer: matricule, nom/prenom, tel, reference logement, statut..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {filteredDemands.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune demande amicale pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {filteredDemands.map((demand) => {
                const consultPath = buildPropertyPath(demand);
                const voucherUrl = demand.voucher_url ? resolveAssetUrl(demand.voucher_url) : "";
                const isHotelDemand = String(demand.source_kind || "").trim() === "hotel";
                const hasGeneratedVoucher = Boolean(String(demand.voucher_url || "").trim() || String(demand.voucher_generated_at || "").trim());
                const financialDraft = getFinancialDraft(demand);
                const roomLines = isHotelDemand ? getHotelDemandRoomLines(demand) : [];
                const travellerLines = isHotelDemand ? getHotelDemandTravellerLines(demand) : { adultLines: [], childLines: [] };
                const validationTarget = demand.status === "attente_validation_amicale" ? "attente_validation_par_agence" : "voucher_en_cours";
                const validationLabel = validationTarget === "attente_validation_par_agence" ? "Passer a l agence" : "Valider";
                return (
                  <article key={demand.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="space-y-1 text-sm">
                        <p><span className="font-semibold">Amicale:</span> {String(amicaleNameById.get(String(demand.pricing_amicale_id || "").trim()) || demand.amicale_name || "-")}</p>
                        <p><span className="font-semibold">Nom:</span> {String(demand.client_name || "-")}</p>
                        <p><span className="font-semibold">Matricule:</span> {String(demand.amicale_matricule || "-")}</p>
                        <p><span className="font-semibold">Telephone:</span> {String(demand.amicale_phone || demand.client_phone || "-")}</p>
                        {isHotelDemand && travellerLines.adultLines.length > 0 ? (
                          <div className="pt-2">
                            <p className="font-semibold text-gray-900">Voyageurs adultes</p>
                            {travellerLines.adultLines.map((line) => (
                              <p key={`adult-${demand.id}-${line}`} className="text-gray-600">{line}</p>
                            ))}
                          </div>
                        ) : null}
                        {isHotelDemand && travellerLines.childLines.length > 0 ? (
                          <div className="pt-2">
                            <p className="font-semibold text-gray-900">Enfants</p>
                            {travellerLines.childLines.map((line) => (
                              <p key={`child-${demand.id}-${line}`} className="text-gray-600">{line}</p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="font-semibold">{String(demand.bien_reference || demand.bien_id || "-")}</p>
                        <p className="text-gray-600">{String(demand.bien_titre || "-")}</p>
                        <p><span className="font-semibold">Periode:</span> {formatDateOnly(demand.start_date)} au {formatDateOnly(demand.end_date)}</p>
                        <p><span className="font-semibold">Total HT:</span> {formatCurrency(demand.total_amount)}</p>
                        <p><span className="font-semibold">Validation agence:</span> {demand.agency_validation_at ? formatDateTime(demand.agency_validation_at) : "-"}</p>
                        {isHotelDemand ? (
                          <>
                            <p>
                              <span className="font-semibold">Configuration:</span>{" "}
                              {`${Math.max(1, roomLines.length)} chambre${Math.max(1, roomLines.length) > 1 ? "s" : ""} - ${Math.max(1, Number(demand.adults || demand.adult_guests || 1))} adulte${Math.max(1, Number(demand.adults || demand.adult_guests || 1)) > 1 ? "s" : ""}${Array.isArray(demand.child_ages) && demand.child_ages.length > 0 ? ` - ${demand.child_ages.length} enfant${demand.child_ages.length > 1 ? "s" : ""}` : ""}`}
                            </p>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              {roomLines.map((line) => (
                                <p key={`room-${demand.id}-${line}`} className="text-gray-700">{line}</p>
                              ))}
                            </div>
                          </>
                        ) : null}
                        <Link
                          to={consultPath}
                          className="mt-1 inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Consulter
                        </Link>
                      </div>
                      <div className="space-y-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${demandStatusTone(demand.status)}`}>
                          {demandStatusLabel(demand.status)}
                        </span>
                        {voucherUrl ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={voucherUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-indigo-700 hover:underline"
                            >
                              Ouvrir voucher
                            </a>
                            <button
                              type="button"
                              onClick={() => printVoucherUrl(voucherUrl)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Imprimer voucher
                            </button>
                          </div>
                        ) : null}
                        {hasGeneratedVoucher ? (
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                            <button
                              type="button"
                              onClick={() => setExpandedFinancials((prev) => ({ ...prev, [demand.id]: !prev[demand.id] }))}
                              className="flex w-full items-center justify-between gap-3 text-left text-xs text-emerald-900"
                            >
                              <span className="font-medium">Pilotage financier contrat</span>
                              <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800">
                                {expandedFinancials[demand.id] ? "Reduire" : "Afficher"}
                                {expandedFinancials[demand.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </span>
                            </button>
                            {expandedFinancials[demand.id] ? (
                              <div className="mt-3 grid grid-cols-1 gap-3">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                  <label className="block">
                                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-800">Montant donne au proprietaire</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={financialDraft.ownerAmount}
                                      onChange={(event) => handleFinancialDraftChange(demand, { ownerAmount: event.target.value })}
                                      className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                                    />
                                  </label>
                                  <label className="block">
                                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-800">Montant total proprietaire</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={financialDraft.ownerTotal}
                                      onChange={(event) => handleFinancialDraftChange(demand, { ownerTotal: event.target.value })}
                                      className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                                    />
                                  </label>
                                  <label className="block">
                                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-800">Profit net</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={financialDraft.netProfit}
                                      onChange={(event) => handleFinancialDraftChange(demand, { netProfit: event.target.value })}
                                      className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                                    />
                                  </label>
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveFinancials(demand)}
                                    disabled={savingFinancialDemandId === demand.id}
                                    className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                                  >
                                    {savingFinancialDemandId === demand.id ? "Enregistrement..." : "Enregistrer montants"}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-700">Note admin interne</span>
                            <textarea
                              rows={3}
                              value={String(demand.admin_note || "")}
                              onChange={(event) => setDemandRows((prev) => prev.map((item) => (
                                item.id === demand.id ? { ...item, admin_note: event.target.value } : item
                              )))}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                              placeholder="Visible uniquement pour l administration."
                            />
                          </label>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              disabled={savingId === demand.id}
                              onClick={() => void handleSaveAdminNote(demand)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                            >
                              {savingId === demand.id ? "Enregistrement..." : "Enregistrer note"}
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {demandSectionTab === "actives" ? (
                            <>
                              <button
                                type="button"
                                disabled={savingId === demand.id}
                                onClick={() => void handleDemandAction(demand, validationTarget)}
                                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {validationLabel}
                              </button>
                              <button
                                type="button"
                                disabled={savingId === demand.id}
                                onClick={() => void handleDemandAction(demand, "rejete_par_agence")}
                                className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                              >
                                Rejeter
                              </button>
                            </>
                          ) : null}
                          {String(demand.source_kind || "") === "hotel" && ["voucher_en_cours", "voucher_envoye"].includes(String(demand.status || "").trim()) ? (
                            <>
                              <button
                                type="button"
                                disabled={savingId === demand.id}
                                onClick={() => void handleVoucherRegenerate(demand)}
                                className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                              >
                                <RefreshCw className={`h-4 w-4 ${savingId === demand.id ? "animate-spin" : ""}`} />
                                Regenerer voucher
                              </button>
                              {voucherUrl ? (
                                <label className={`inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 ${uploadingVoucherId === demand.id ? "opacity-60" : "cursor-pointer"}`}>
                                  <Upload className="h-4 w-4" />
                                  Remplacer voucher PDF
                                  <input
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    className="hidden"
                                    disabled={uploadingVoucherId === demand.id}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0] || null;
                                      void handleVoucherUpload(demand, file);
                                      event.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                              ) : null}
                            </>
                          ) : null}
                          <button
                            type="button"
                            disabled={savingId === demand.id}
                            onClick={() => void handleDeleteDemand(demand)}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer BDD
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "emerald" | "sky" | "amber" | "indigo";
}) {
  const tones: Record<typeof tone, string> = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
  } as const;
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function GlassMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/15 bg-white/10 px-4 py-4 backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-50/70">{label}</p>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/90 px-3 py-2 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
