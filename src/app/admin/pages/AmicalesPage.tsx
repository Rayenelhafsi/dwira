import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Code2, Eye, FileText, Printer, RefreshCw, Ticket, Trash2, Upload, Users } from "lucide-react";
import { createAmicaleApi, deleteAmicaleApi, fetchAmicalesAdmin, normalizeAmicaleHotelMarkupPercent, type AmicaleItem, updateAmicaleApi } from "../../utils/amicales";
import type { HotelReservationDemand, ReservationDemand, ReservationDemandStatus } from "../types";
import { regenerateHotelVoucher, uploadHotelVoucherPdf } from "../../services/hotels";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type AdminAmicaleTab = "amicales" | "demandes";
type DemandSectionTab = "actives" | "rejetees";
type DemandSortMode = "arrival" | "recent";

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

  const loadData = useCallback(async (options?: { background?: boolean }) => {
    if (!options?.background) setLoading(true);
    try {
      const [amicalesResponse, demandsResponse, hotelDemandsResponse] = await Promise.all([
        fetchAmicalesAdmin(),
        fetch(`${API_URL}/reservation-demands`, { credentials: "include" }),
        fetch(`${API_URL}/hotel-reservation-demands`, { credentials: "include" }),
      ]);
      const demandJson = demandsResponse.ok ? await demandsResponse.json().catch(() => []) : [];
      const hotelDemandJson = hotelDemandsResponse.ok ? await hotelDemandsResponse.json().catch(() => []) : [];
      setAmicales(Array.isArray(amicalesResponse) ? amicalesResponse : []);
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

  const handleDemandAction = async (demand: AmicaleDemandRow, nextStatus: "voucher_en_cours" | "rejete_par_agence") => {
    setSavingId(demand.id);
    try {
      const isHotel = String(demand.source_kind || "").trim() === "hotel";
      const response = isHotel
        ? await fetch(
            `${API_URL}/admin/hotel-reservation-demands/${encodeURIComponent(demand.id)}/${nextStatus === "voucher_en_cours" ? "validate" : "reject"}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                ...(nextStatus === "voucher_en_cours" ? buildHotelVoucherPatch(demand) : {}),
                admin_note:
                  nextStatus === "voucher_en_cours"
                    ? "Agence valide la demande amicale. Voucher genere automatiquement."
                    : "Agence rejette la demande amicale",
              }),
            }
          )
        : await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              status: nextStatus,
              actor_type: "admin",
              actor_id: "admin",
              history_note:
                nextStatus === "voucher_en_cours"
                  ? "Agence valide la demande amicale et genere le voucher"
                  : "Agence rejette la demande amicale",
            }),
          });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(String(data?.error || "Mise a jour impossible"));
      }
      toast.success(nextStatus === "voucher_en_cours" ? "Demande validee. Voucher genere automatiquement." : "Demande rejetee.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
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
                        <div className="flex flex-wrap gap-2 pt-1">
                          {demandSectionTab === "actives" ? (
                            <>
                              <button
                                type="button"
                                disabled={savingId === demand.id}
                                onClick={() => void handleDemandAction(demand, "voucher_en_cours")}
                                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Valider
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
  value: number;
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
