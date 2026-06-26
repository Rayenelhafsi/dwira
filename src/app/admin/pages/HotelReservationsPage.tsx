import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Hotel, LoaderCircle, MessageSquareText, Phone, RefreshCw, Save, Trash2, Upload, User, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { HotelReservationDemand, HotelReservationDemandStatus } from "../types";
import {
  listHotelReservationDemands,
  deleteHotelReservationDemand,
  updateHotelReservationDemand,
  uploadHotelVoucherPdf,
  uploadHotelVoucherQr,
} from "../../services/hotels";

const statusLabels: Record<HotelReservationDemandStatus, string> = {
  attente_validation_amicale: "Attente validation amicale",
  attente_validation_par_agence: "Attente validation agence",
  nouvelle_demande: "Nouvelle demande",
  client_procede_vers_paiement_en_cours: "Client procede vers paiement",
  demande_recu_paiement: "Demande de recu",
  recu_paiement_envoye: "Recu envoye",
  succes_paiement: "Paiement succes",
  voucher_en_cours: "Voucher en cours",
  voucher_envoye: "Voucher envoye",
  rejete_par_amicale: "Rejetee par amicale",
  rejete_par_agence: "Rejetee par agence",
  annulee: "Annulee",
};

const statusTone: Record<HotelReservationDemandStatus, string> = {
  attente_validation_amicale: "bg-emerald-100 text-emerald-800 border-emerald-200",
  attente_validation_par_agence: "bg-cyan-100 text-cyan-800 border-cyan-200",
  nouvelle_demande: "bg-amber-100 text-amber-800 border-amber-200",
  client_procede_vers_paiement_en_cours: "bg-sky-100 text-sky-800 border-sky-200",
  demande_recu_paiement: "bg-amber-100 text-amber-800 border-amber-200",
  recu_paiement_envoye: "bg-cyan-100 text-cyan-800 border-cyan-200",
  succes_paiement: "bg-emerald-100 text-emerald-800 border-emerald-200",
  voucher_en_cours: "bg-violet-100 text-violet-800 border-violet-200",
  voucher_envoye: "bg-indigo-100 text-indigo-800 border-indigo-200",
  rejete_par_amicale: "bg-rose-100 text-rose-800 border-rose-200",
  rejete_par_agence: "bg-rose-100 text-rose-800 border-rose-200",
  annulee: "bg-slate-100 text-slate-700 border-slate-200",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]} ${match[4] || "00"}:${match[5] || "00"}`;
}

function resolveAssetUrl(url?: string | null) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${window.location.origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

type HotelSelectedRoom = {
  boardingName?: string | null;
  roomName?: string | null;
  price?: number | null;
};

type HotelTravellerIdentity = {
  firstName?: string | null;
  lastName?: string | null;
  age?: number | null;
};

function parseSelectedRooms(row: HotelReservationDemand): HotelSelectedRoom[] {
  const rawContext = row.hotel_context && typeof row.hotel_context === "object" ? row.hotel_context : null;
  const rawRooms = Array.isArray((rawContext as any)?.rooms) ? (rawContext as any).rooms : [];
  const mapped = rawRooms
    .map((item: any) => ({
      boardingName: String(item?.boardingName || "").trim() || null,
      roomName: String(item?.roomName || "").trim() || null,
      price: Number.isFinite(Number(item?.price)) ? Number(item.price) : null,
    }))
    .filter((item) => item.boardingName || item.roomName || item.price !== null);
  if (mapped.length > 0) return mapped;
  if (row.boarding_name || row.room_name || Number.isFinite(Number(row.total_price))) {
    return [{
      boardingName: row.boarding_name || null,
      roomName: row.room_name || null,
      price: Number.isFinite(Number(row.total_price)) ? Number(row.total_price) : null,
    }];
  }
  return [];
}

function parseSelectedTravellers(row: HotelReservationDemand): { adults: HotelTravellerIdentity[]; children: HotelTravellerIdentity[] } {
  const rawContext = row.hotel_context && typeof row.hotel_context === "object" ? row.hotel_context : null;
  const rawTravellers = rawContext && typeof (rawContext as any).travellers === "object" ? (rawContext as any).travellers : null;
  const adults = Array.isArray(rawTravellers?.adults) ? rawTravellers.adults : [];
  const children = Array.isArray(rawTravellers?.children) ? rawTravellers.children : [];
  return {
    adults: adults
      .map((item: any) => ({
        firstName: String(item?.firstName || "").trim() || null,
        lastName: String(item?.lastName || "").trim() || null,
      }))
      .filter((item) => item.firstName || item.lastName),
    children: children
      .map((item: any) => ({
        firstName: String(item?.firstName || "").trim() || null,
        lastName: String(item?.lastName || "").trim() || null,
        age: Number.isFinite(Number(item?.age)) ? Number(item.age) : null,
      }))
      .filter((item) => item.firstName || item.lastName || item.age !== null),
  };
}

function formatTnd(value?: number | null) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "Sur demande";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(num)} TND`;
}

export default function HotelReservationsPage() {
  const [rows, setRows] = useState<HotelReservationDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingQrId, setUploadingQrId] = useState<string | null>(null);
  const [uploadingVoucherId, setUploadingVoucherId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const nextRows = await listHotelReservationDemands();
      setRows(Array.isArray(nextRows) ? nextRows : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de charger les demandes hotellerie");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    return rows.reduce<Record<HotelReservationDemandStatus, number>>(
      (acc, row) => {
        acc[row.status] += 1;
        return acc;
      },
      {
        nouvelle_demande: 0,
        client_procede_vers_paiement_en_cours: 0,
        demande_recu_paiement: 0,
        recu_paiement_envoye: 0,
        succes_paiement: 0,
        voucher_en_cours: 0,
        voucher_envoye: 0,
        annulee: 0,
      }
    );
  }, [rows]);

  const saveRow = async (
    row: HotelReservationDemand,
    patch: Partial<HotelReservationDemand> & { force_generate_voucher?: boolean },
    successMessage = "Demande hotellerie mise a jour"
  ) => {
    setSavingId(row.id);
    try {
      const updated = await updateHotelReservationDemand(row.id, {
        status: patch.status as HotelReservationDemandStatus | undefined,
        admin_note: patch.admin_note,
        client_note: patch.client_note,
        client_name: patch.client_name,
        client_phone: patch.client_phone,
        amicale_name: patch.amicale_name,
        hotel_name: patch.hotel_name,
        boarding_name: patch.boarding_name,
        room_name: patch.room_name,
        check_in: patch.check_in,
        check_out: patch.check_out,
        voucher_id: patch.voucher_id,
        voucher_number: patch.voucher_number,
        voucher_qr_payload: patch.voucher_qr_payload,
        voucher_qr_image_url: patch.voucher_qr_image_url,
        force_generate_voucher: patch.force_generate_voucher,
      });
      setRows((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(successMessage);
      return updated;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
      return null;
    } finally {
      setSavingId(null);
    }
  };

  const handleQrUpload = async (row: HotelReservationDemand, file: File | null) => {
    if (!file) return;
    setUploadingQrId(row.id);
    try {
      const updated = await uploadHotelVoucherQr(row.id, file);
      setRows((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success("QR du voucher charge");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload QR impossible");
    } finally {
      setUploadingQrId(null);
    }
  };

  const handleVoucherUpload = async (row: HotelReservationDemand, file: File | null) => {
    if (!file) return;
    setUploadingVoucherId(row.id);
    try {
      const updated = await uploadHotelVoucherPdf(row.id, file);
      setRows((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(row.voucher_url ? "Voucher PDF remplace" : "Voucher PDF charge");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload voucher impossible");
    } finally {
      setUploadingVoucherId(null);
    }
  };

  const handleDeleteDemand = async (row: HotelReservationDemand) => {
    const confirmed = window.confirm(`Supprimer definitivement la demande hotel ${row.id} de la base de donnees ?`);
    if (!confirmed) return;
    setSavingId(row.id);
    try {
      await deleteHotelReservationDemand(row.id);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      toast.success("Demande hotel supprimee de la base.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">Hotel</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Reservations hotellerie</h1>
            <p className="mt-2 text-sm text-gray-500">Suivi des demandes clients, paiements, QR et vouchers pour la section hotels.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            <RefreshCw size={16} />
            Actualiser
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-5">
          {(Object.keys(statusLabels) as HotelReservationDemandStatus[]).map((status) => (
            <div key={status} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{statusLabels[status]}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{summary[status]}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-10 shadow-sm">
          <div className="flex items-center justify-center gap-3 text-slate-500">
            <LoaderCircle size={18} className="animate-spin" />
            Chargement des demandes hotellerie...
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Aucune demande hotellerie pour le moment.
        </div>
      ) : (
        <div className="grid gap-5">
          {rows.map((row) => (
            <article key={row.id} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              {(() => {
                const selectedRooms = parseSelectedRooms(row);
                const selectedTravellers = parseSelectedTravellers(row);
                const selectedRoomsTotal = selectedRooms.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
                const resolvedTotal = Number(row.amount_due_now || row.total_price || selectedRoomsTotal || 0);
                return (
                  <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  {row.hotel_image_url ? (
                    <img src={row.hotel_image_url} alt={row.hotel_name} className="h-24 w-32 rounded-2xl object-cover" />
                  ) : (
                    <div className="flex h-24 w-32 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <Hotel size={26} />
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{row.hotel_city_name || "Destination"}</p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-900">{row.hotel_name}</h2>
                    <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1">
                        <CalendarDays size={14} />
                        {formatDate(row.check_in)} au {formatDate(row.check_out)}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1">
                        <User size={14} />
                        {row.adults} adulte(s){Array.isArray(row.child_ages) && row.child_ages.length > 0 ? `, ${row.child_ages.length} enfant(s)` : ""}
                      </span>
                      {row.boarding_name ? <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sky-700">{row.boarding_name}</span> : null}
                      {row.room_name ? <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-violet-700">{row.room_name}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[row.status]}`}>
                    {statusLabels[row.status]}
                  </span>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Prix indicatif</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {resolvedTotal > 0 ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(resolvedTotal)} ${row.currency || "TND"}` : "Sur demande"}
                    </p>
                  </div>
                </div>
              </div>

              {selectedRooms.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Details selection client</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {row.adults} adulte(s){Array.isArray(row.child_ages) && row.child_ages.length > 0 ? `, ${row.child_ages.length} enfant(s)` : ""} • {selectedRooms.length} chambre(s)
                  </p>
                  {Array.isArray(row.child_ages) && row.child_ages.length > 0 ? (
                    <p className="mt-1 text-sm text-slate-700">
                      Ages enfants: <span className="font-medium">{row.child_ages.map((age) => `${Number(age)} ans`).join(", ")}</span>
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2">
                    {selectedRooms.map((item, idx) => (
                      <div key={`${row.id}-selected-room-${idx}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">Chambre {idx + 1}</p>
                        <p className="mt-1">Offre: <span className="font-medium">{item.boardingName || "-"}</span></p>
                        <p>Type: <span className="font-medium">{item.roomName || "-"}</span></p>
                        <p>Tarif chambre: <span className="font-semibold">{formatTnd(item.price)}</span></p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">Total selectionne: {formatTnd(selectedRoomsTotal || resolvedTotal)}</p>
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 lg:grid-cols-[0.95fr,1.05fr]">
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Client</p>
                  <p className="inline-flex items-center gap-2 text-sm text-slate-700"><User size={14} /> {row.client_name || "-"}</p>
                  <p className="text-sm text-slate-700">{row.client_email || "-"}</p>
                  <p className="inline-flex items-center gap-2 text-sm text-slate-700"><Phone size={14} /> {row.client_phone || "-"}</p>
                  {Array.isArray(row.child_ages) && row.child_ages.length > 0 ? (
                    <p className="text-sm text-slate-700">
                      Ages enfants: <span className="font-medium">{row.child_ages.map((age) => `${Number(age)} ans`).join(", ")}</span>
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">Recue le {formatDateTime(row.created_at)}</p>
                  {selectedTravellers.adults.length > 0 || selectedTravellers.children.length > 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">Voyageurs saisis par le client</p>
                      {selectedTravellers.adults.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Adultes</p>
                          <div className="mt-1 space-y-1">
                            {selectedTravellers.adults.map((adult, index) => (
                              <p key={`${row.id}-adult-name-${index}`}>
                                {index + 1}. {String(adult.firstName || "").trim()} {String(adult.lastName || "").trim()}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {selectedTravellers.children.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Enfants</p>
                          <div className="mt-1 space-y-1">
                            {selectedTravellers.children.map((child, index) => (
                              <p key={`${row.id}-child-name-${index}`}>
                                {index + 1}. {String(child.firstName || "").trim()} {String(child.lastName || "").trim()}
                                {Number.isFinite(Number(child.age)) ? ` (${Number(child.age)} ans)` : ""}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {row.client_note ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-semibold">Note client</p>
                      <p className="mt-1 whitespace-pre-wrap">{row.client_note}</p>
                    </div>
                  ) : null}
                  {(row.payment_receipt_image_url || row.payment_receipt_uploaded_at || row.payment_receipt_note) ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                      <p className="font-semibold">Recu paiement</p>
                      <p className="mt-1">Date: {formatDateTime(row.payment_receipt_uploaded_at)}</p>
                      {row.payment_receipt_note ? <p className="mt-1">Note: {row.payment_receipt_note}</p> : null}
                      {row.payment_receipt_image_url ? (
                        <a href={resolveAssetUrl(row.payment_receipt_image_url)} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-700">
                          Ouvrir le recu
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {row.voucher_url ? (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                      <p className="font-semibold">Voucher PDF</p>
                      <p className="mt-1">Numero: {row.voucher_number || "-"}</p>
                      <p className="mt-1">ID hotel: {row.voucher_id || "-"}</p>
                      <p className="mt-1">Charge le: {formatDateTime(row.voucher_generated_at)}</p>
                      {row.voucher_qr_image_url ? <p className="mt-1">QR image charge.</p> : null}
                      <a href={resolveAssetUrl(row.voucher_url)} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700">
                        Ouvrir voucher
                      </a>
                    </div>
                  ) : null}
                  {row.voucher_qr_image_url ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      <p className="font-semibold">QR hotel charge</p>
                      <img src={resolveAssetUrl(row.voucher_qr_image_url)} alt="QR voucher hotel" className="mt-2 h-28 w-28 rounded-xl border border-emerald-200 bg-white object-contain p-1" />
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <MessageSquareText size={14} />
                    Traitement admin
                  </p>
                  <select
                    value={row.status}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, status: event.target.value as HotelReservationDemandStatus } : item))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  >
                    {(Object.keys(statusLabels) as HotelReservationDemandStatus[]).map((status) => (
                      <option key={status} value={status}>{statusLabels[status]}</option>
                    ))}
                  </select>
                  <input
                    value={row.amicale_name || ""}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, amicale_name: event.target.value } : item))}
                    placeholder="Amicale"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  />
                  <input
                    value={row.client_name || ""}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, client_name: event.target.value } : item))}
                    placeholder="Nom & prenom"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  />
                  <input
                    value={row.client_phone || ""}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, client_phone: event.target.value } : item))}
                    placeholder="Telephone"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  />
                  <input
                    value={row.hotel_name || ""}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, hotel_name: event.target.value } : item))}
                    placeholder="Hotel / reference"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  />
                  <input
                    value={row.room_name || ""}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, room_name: event.target.value } : item))}
                    placeholder="Type de chambre"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  />
                  <input
                    value={row.voucher_number || ""}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, voucher_number: event.target.value } : item))}
                    placeholder="Numero voucher"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  />
                  <input
                    value={row.voucher_id || ""}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, voucher_id: event.target.value } : item))}
                    placeholder="ID voucher hotel (manuel)"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  />
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      type="date"
                      value={row.check_in || ""}
                      onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, check_in: event.target.value } : item))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      disabled={savingId === row.id}
                    />
                    <input
                      type="date"
                      value={row.check_out || ""}
                      onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, check_out: event.target.value } : item))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      disabled={savingId === row.id}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Variables modifiables manuellement avant enregistrement ou avant l'upload du voucher PDF.
                  </p>

                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Voucher PDF manuel</p>
                        <p className="text-xs text-slate-500">Charge un PDF et remplace le voucher existant pour cette demande.</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        {uploadingVoucherId === row.id ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                        {row.voucher_url ? "Remplacer PDF" : "Upload PDF"}
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            void handleVoucherUpload(row, file);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">QR fourni par l'hotel</p>
                        <p className="text-xs text-slate-500">Charge l'image QR exacte fournie par l'hotel.</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        {uploadingQrId === row.id ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                        Upload QR
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            void handleQrUpload(row, file);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void saveRow(row, row)}
                      disabled={savingId === row.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingId === row.id ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveRow(row, { ...row, status: "voucher_en_cours" }, "Demande hotel validee")}
                      disabled={savingId === row.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {savingId === row.id ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Valider demande
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveRow(row, { ...row, status: "annulee" }, "Reservation hoteliere rejetee")}
                      disabled={savingId === row.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {savingId === row.id ? <LoaderCircle size={16} className="animate-spin" /> : <XCircle size={16} />}
                      Rejeter reservation
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteDemand(row)}
                      disabled={savingId === row.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingId === row.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      Supprimer BDD
                    </button>
                  </div>
                </div>
              </div>
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
