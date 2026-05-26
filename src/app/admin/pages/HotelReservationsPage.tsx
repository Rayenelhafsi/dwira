import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Hotel, LoaderCircle, MessageSquareText, Phone, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";
import type { HotelReservationDemand, HotelReservationDemandStatus } from "../types";
import { listHotelReservationDemands, updateHotelReservationDemand } from "../../services/hotels";

const statusLabels: Record<HotelReservationDemandStatus, string> = {
  nouvelle_demande: "Nouvelle demande",
  contact_client: "Client contacte",
  en_cours: "En cours",
  confirmee: "Confirmee",
  annulee: "Annulee",
};

const statusTone: Record<HotelReservationDemandStatus, string> = {
  nouvelle_demande: "bg-amber-100 text-amber-800 border-amber-200",
  contact_client: "bg-sky-100 text-sky-800 border-sky-200",
  en_cours: "bg-violet-100 text-violet-800 border-violet-200",
  confirmee: "bg-emerald-100 text-emerald-800 border-emerald-200",
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

export default function HotelReservationsPage() {
  const [rows, setRows] = useState<HotelReservationDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

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
        contact_client: 0,
        en_cours: 0,
        confirmee: 0,
        annulee: 0,
      }
    );
  }, [rows]);

  const handleSave = async (row: HotelReservationDemand, patch: Partial<HotelReservationDemand>) => {
    setSavingId(row.id);
    try {
      const updated = await updateHotelReservationDemand(row.id, {
        status: patch.status as HotelReservationDemandStatus | undefined,
        admin_note: patch.admin_note,
      });
      setRows((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success("Demande hotellerie mise a jour");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
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
            <p className="mt-2 text-sm text-gray-500">Suivi des demandes clients envoyees depuis la section hotels.</p>
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
                      {row.total_price ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(row.total_price)} ${row.currency || "TND"}` : "Sur demande"}
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
                  <textarea
                    value={row.admin_note || ""}
                    onChange={(event) => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, admin_note: event.target.value } : item))}
                    rows={4}
                    placeholder="Note interne ou retour a preparer pour le client"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={savingId === row.id}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleSave(row, row)}
                      disabled={savingId === row.id}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {savingId === row.id ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Enregistrer
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
