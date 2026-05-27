import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Hotel, ImagePlus, LoaderCircle, MessageSquareText, Phone, RefreshCw, Save, Send, Settings2, Upload, User } from "lucide-react";
import { toast } from "sonner";
import type { HotelReservationDemand, HotelReservationDemandStatus } from "../types";
import {
  getHotelVoucherLayout,
  listHotelReservationDemands,
  saveHotelVoucherLayout,
  type HotelVoucherLayout,
  updateHotelReservationDemand,
  uploadHotelVoucherQr,
} from "../../services/hotels";

const statusLabels: Record<HotelReservationDemandStatus, string> = {
  nouvelle_demande: "Nouvelle demande",
  client_procede_vers_paiement_en_cours: "Client procede vers paiement",
  demande_recu_paiement: "Demande de recu",
  recu_paiement_envoye: "Recu envoye",
  succes_paiement: "Paiement succes",
  voucher_en_cours: "Voucher en cours",
  voucher_envoye: "Voucher envoye",
  annulee: "Annulee",
};

const statusTone: Record<HotelReservationDemandStatus, string> = {
  nouvelle_demande: "bg-amber-100 text-amber-800 border-amber-200",
  client_procede_vers_paiement_en_cours: "bg-sky-100 text-sky-800 border-sky-200",
  demande_recu_paiement: "bg-amber-100 text-amber-800 border-amber-200",
  recu_paiement_envoye: "bg-cyan-100 text-cyan-800 border-cyan-200",
  succes_paiement: "bg-emerald-100 text-emerald-800 border-emerald-200",
  voucher_en_cours: "bg-violet-100 text-violet-800 border-violet-200",
  voucher_envoye: "bg-indigo-100 text-indigo-800 border-indigo-200",
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

function buildPreviewValues(row: HotelReservationDemand) {
  const childCount = Array.isArray(row.child_ages) ? row.child_ages.length : 0;
  const totalGuests = Math.max(1, Number(row.adults || 1)) + childCount;
  const checkInParts = String(row.check_in || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const checkOutParts = String(row.check_out || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return {
    client_name: row.client_name || "Nom & Prenom client",
    client_phone: row.client_phone || "00 000 000",
    hotel_reference: `${row.hotel_name || "Hotel"}${row.voucher_number ? ` / Ref ${row.voucher_number}` : ""}`,
    checkin_day: checkInParts?.[3] || "--",
    checkin_month: checkInParts?.[2] || "--",
    checkout_day: checkOutParts?.[3] || "--",
    checkout_month: checkOutParts?.[2] || "--",
    guests: `${totalGuests} personne(s)${childCount > 0 ? ` dont ${childCount} enfant(s)` : ""}`,
    room_type: row.room_name || row.boarding_name || "Type de chambre",
    voucher_id: row.voucher_id || row.voucher_number || "VOUCHER ID",
  } satisfies Record<string, string>;
}

function VoucherLayoutEditor({
  row,
  layout,
  onChange,
  onSave,
  saving,
}: {
  row: HotelReservationDemand;
  layout: HotelVoucherLayout;
  onChange: (layout: HotelVoucherLayout) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}) {
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const previewValues = useMemo(() => buildPreviewValues(row), [row]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingField) return;
    const field = layout.fields[draggingField];
    if (!field) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleX = layout.canvasWidth / bounds.width;
    const scaleY = layout.canvasHeight / bounds.height;
    const nextX = Math.max(0, Math.min(layout.canvasWidth - field.width, (event.clientX - bounds.left) * scaleX - field.width / 2));
    const nextY = Math.max(0, Math.min(layout.canvasHeight - field.height, (event.clientY - bounds.top) * scaleY - field.height / 2));
    onChange({
      ...layout,
      fields: {
        ...layout.fields,
        [draggingField]: { ...field, x: Math.round(nextX), y: Math.round(nextY) },
      },
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Layout voucher hotel</p>
          <p className="mt-1 text-sm text-slate-600">Deplace les zones sur le fond, puis ajuste x/y/largeur/hauteur si besoin.</p>
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
          Enregistrer layout
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div
          className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          style={{ aspectRatio: `${layout.canvasWidth} / ${layout.canvasHeight}` }}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDraggingField(null)}
          onPointerLeave={() => setDraggingField(null)}
        >
          <img src={resolveAssetUrl(layout.templateUrl)} alt="Template voucher hotel" className="absolute inset-0 h-full w-full object-cover" />
          {Object.entries(layout.fields).map(([fieldKey, field]) => {
            const left = (field.x / layout.canvasWidth) * 100;
            const top = (field.y / layout.canvasHeight) * 100;
            const width = (field.width / layout.canvasWidth) * 100;
            const height = (field.height / layout.canvasHeight) * 100;
            const isImage = field.kind === "image";
            return (
              <button
                key={fieldKey}
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setDraggingField(fieldKey);
                }}
                className={`absolute overflow-hidden rounded-lg border-2 text-left ${draggingField === fieldKey ? "border-emerald-500 bg-emerald-100/70" : "border-sky-400 bg-white/65"} ${isImage ? "p-1" : "px-2 py-1"}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  fontSize: `${Math.max(10, ((field.fontSize || 16) / layout.canvasWidth) * 1536 * 0.075)}rem`,
                  color: field.color || "#172033",
                  fontWeight: field.fontWeight || 700,
                  textAlign: field.textAlign || "left",
                }}
              >
                {isImage ? (
                  row.voucher_qr_image_url ? (
                    <img src={resolveAssetUrl(row.voucher_qr_image_url)} alt="QR" className="h-full w-full object-contain" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">QR</span>
                  )
                ) : (
                  <span className="block truncate">{previewValues[fieldKey] || field.label}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {Object.entries(layout.fields).map(([fieldKey, field]) => (
            <div key={fieldKey} className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">{field.label}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["x", "y", "width", "height"] as const).map((prop) => (
                  <label key={prop} className="text-xs text-slate-500">
                    {prop.toUpperCase()}
                    <input
                      type="number"
                      value={Number(field[prop] || 0)}
                      onChange={(event) =>
                        onChange({
                          ...layout,
                          fields: {
                            ...layout.fields,
                            [fieldKey]: { ...field, [prop]: Number(event.target.value || 0) },
                          },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                    />
                  </label>
                ))}
                {field.kind === "text" ? (
                  <>
                    <label className="text-xs text-slate-500">
                      Font
                      <input
                        type="number"
                        value={Number(field.fontSize || 20)}
                        onChange={(event) =>
                          onChange({
                            ...layout,
                            fields: {
                              ...layout.fields,
                              [fieldKey]: { ...field, fontSize: Number(event.target.value || 20) },
                            },
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Alignement
                      <select
                        value={field.textAlign || "left"}
                        onChange={(event) =>
                          onChange({
                            ...layout,
                            fields: {
                              ...layout.fields,
                              [fieldKey]: { ...field, textAlign: event.target.value as "left" | "center" | "right" },
                            },
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                      >
                        <option value="left">Gauche</option>
                        <option value="center">Centre</option>
                        <option value="right">Droite</option>
                      </select>
                    </label>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HotelReservationsPage() {
  const [rows, setRows] = useState<HotelReservationDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [layout, setLayout] = useState<HotelVoucherLayout | null>(null);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutOpenFor, setLayoutOpenFor] = useState<string | null>(null);
  const [uploadingQrId, setUploadingQrId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [nextRows, nextLayout] = await Promise.all([
        listHotelReservationDemands(),
        getHotelVoucherLayout().catch(() => null),
      ]);
      setRows(Array.isArray(nextRows) ? nextRows : []);
      if (nextLayout) {
        setLayout(nextLayout);
      }
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

  const handleSaveLayout = async () => {
    if (!layout) return;
    setLayoutSaving(true);
    try {
      const saved = await saveHotelVoucherLayout(layout);
      setLayout(saved);
      toast.success("Layout du voucher hotel enregistre");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement du layout impossible");
    } finally {
      setLayoutSaving(false);
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
                      {row.amount_due_now || row.total_price ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(row.amount_due_now || row.total_price || 0))} ${row.currency || "TND"}` : "Sur demande"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[0.95fr,1.05fr]">
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Client</p>
                  <p className="inline-flex items-center gap-2 text-sm text-slate-700"><User size={14} /> {row.client_name || "-"}</p>
                  <p className="text-sm text-slate-700">{row.client_email || "-"}</p>
                  <p className="inline-flex items-center gap-2 text-sm text-slate-700"><Phone size={14} /> {row.client_phone || "-"}</p>
                  <p className="text-xs text-slate-500">Recue le {formatDateTime(row.created_at)}</p>
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
                      <p className="font-semibold">Voucher genere</p>
                      <p className="mt-1">Numero: {row.voucher_number || "-"}</p>
                      <p className="mt-1">ID hotel: {row.voucher_id || "-"}</p>
                      <p className="mt-1">Genere le: {formatDateTime(row.voucher_generated_at)}</p>
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
                    value={row.voucher_id || ""}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, voucher_id: event.target.value } : item))}
                    placeholder="ID voucher hotel (manuel)"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  />

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
                      onClick={() => setLayoutOpenFor((prev) => (prev === row.id ? null : row.id))}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <Settings2 size={16} />
                      Positionner les zones
                    </button>
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
                      onClick={() => void saveRow(row, { ...row, status: "voucher_en_cours", force_generate_voucher: true }, "Voucher hotel genere")}
                      disabled={savingId === row.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {savingId === row.id ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                      Generer voucher
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveRow(row, { ...row, status: "voucher_envoye", force_generate_voucher: true }, "Voucher hotel envoye")}
                      disabled={savingId === row.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {savingId === row.id ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
                      Envoyer voucher
                    </button>
                  </div>
                </div>
              </div>

              {layoutOpenFor === row.id && layout ? (
                <div className="mt-5">
                  <VoucherLayoutEditor
                    row={row}
                    layout={layout}
                    onChange={setLayout}
                    onSave={handleSaveLayout}
                    saving={layoutSaving}
                  />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
