import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { CalendarClock, ShoppingBag, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useProperties } from "../context/PropertiesContext";
import type { ReservationDemand } from "../admin/types";
import { getReservationsFromCache } from "../utils/reservations";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const statusLabels: Record<ReservationDemand["status"], string> = {
  en_attente_reponse_proprietaire: "En attente de reponse proprietaire",
  pas_de_reponse_proprietaire: "Pas de reponse proprietaire",
  reponse_positive_attente_confirmation_client: "Reponse positive, attente confirmation client",
  reponse_negative_autre_proposition_meme_bien: "Reponse negative, autre proposition pour ce bien",
  reponse_negative_autre_proposition_bien_similaire: "Reponse negative, autre proposition pour un bien similaire",
  attente_envoi_coordonnees_contrat: "Attente d'envoi de coordonnees pour contrat",
  contrat_realise: "Contrat realise",
  succes_paiement: "Succes paiement",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", hour12: false });
}

export default function MyReservationsPage() {
  const { user } = useAuth();
  const { properties } = useProperties();
  const [reservations, setReservations] = useState<ReservationDemand[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReservations = useCallback(async () => {
    if (!user?.email) return;
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (user.id) query.set("client_user_id", user.id);
      query.set("client_email", user.email);
      const response = await fetch(`${API_URL}/reservation-demands?${query.toString()}`);
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(String(rows?.error || "Impossible de charger vos reservations"));
      setReservations(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setReservations(getReservationsFromCache({ clientUserId: user.id, clientEmail: user.email }));
      toast.error(error instanceof Error ? error.message : "Impossible de charger vos reservations");
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, user?.id]);

  useEffect(() => {
    void fetchReservations();
  }, [fetchReservations]);

  const reservationCards = useMemo(
    () => reservations.map((reservation) => {
      const property = properties.find((item) => String(item.id) === String(reservation.bien_id));
      return {
        ...reservation,
        image: property?.images?.[0] || "",
        path: property?.detailPath || (property?.slug ? `/properties/${property.slug}` : "/logements"),
      };
    }),
    [properties, reservations]
  );

  if (!user || user.role !== "user") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbf9_0%,#ffffff_55%)] pt-28 pb-20">
      <div className="container mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Espace client</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Mes reservations</h1>
            <p className="mt-2 text-sm text-gray-500">Historique et statut de vos demandes de reservation.</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchReservations()}
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <TimerReset className="h-4 w-4" />
            Actualiser
          </button>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
            </div>
          ) : reservationCards.length === 0 ? (
            <div className="rounded-[28px] border border-gray-200 bg-white p-12 text-center shadow-sm">
              <ShoppingBag className="mx-auto h-10 w-10 text-gray-300" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">Aucune reservation pour le moment</h2>
              <p className="mt-2 text-sm text-gray-500">Explorez les logements et envoyez votre premiere demande.</p>
              <Link to="/logements" className="mt-6 inline-flex rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
                Voir les logements
              </Link>
            </div>
          ) : (
            <div className="grid gap-5">
              {reservationCards.map((reservation) => (
                <div key={reservation.id} className="grid gap-5 overflow-hidden rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm md:grid-cols-[280px,1fr]">
                  <div className="overflow-hidden rounded-[22px] bg-gray-100">
                    {reservation.image ? (
                      <img src={reservation.image} alt={reservation.bien_titre || reservation.bien_id} className="h-full min-h-[220px] w-full object-cover" />
                    ) : (
                      <div className="flex h-full min-h-[220px] items-center justify-center text-gray-400">Image indisponible</div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between gap-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{reservation.bien_reference || reservation.bien_id}</span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{statusLabels[reservation.status]}</span>
                      </div>
                      <h2 className="mt-3 text-2xl font-bold text-gray-900">{reservation.bien_titre || "Bien"}</h2>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Info label="Periode" value={`${reservation.start_date} au ${reservation.end_date}`} />
                        <Info label="Voyageurs" value={`${reservation.guests}`} />
                        <Info label="Cree le" value={formatDateTime(reservation.created_at)} icon={<CalendarClock className="h-4 w-4" />} />
                        <Info label="Derniere mise a jour" value={formatDateTime(reservation.updated_at)} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Link to={reservation.path} className="inline-flex rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                        Voir le bien
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{label}</p>
      <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}
