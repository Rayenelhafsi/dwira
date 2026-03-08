import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { CalendarClock, Printer, ShoppingBag, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useProperties } from "../context/PropertiesContext";
import type { ReservationDemand } from "../admin/types";
import { getReservationsFromCache } from "../utils/reservations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

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

async function getApiErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || "").trim();
    const detail = String(data?.detail || "").trim();
    if (message && detail && !message.includes(detail)) return `${message} - ${detail}`;
    if (message) return message;
  } else {
    const text = await response.text().catch(() => "");
    if (text && !text.startsWith("<!DOCTYPE")) return text;
  }
  return fallback;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", hour12: false });
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(value?: string | null) {
  const parsed = parseDateOnly(value);
  if (!parsed) return value || "-";
  return parsed.toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" });
}

function computeNights(startDate?: string | null, endDate?: string | null) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return 1;
  const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff);
}

function formatReservationPeriod(reservation: ReservationDemand) {
  if (reservation.request_type === "visite") {
    return `${formatDateOnly(reservation.start_date)} au ${formatDateOnly(reservation.end_date)}`;
  }
  const nights = computeNights(reservation.start_date, reservation.end_date);
  return `${formatDateOnly(reservation.start_date)} au ${formatDateOnly(reservation.end_date)} (${nights} nuit(s))`;
}

function resolveAssetUrl(url?: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url}`;
}

type ContractApi = {
  id: string;
  url_pdf?: string;
};

export default function MyReservationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { properties } = useProperties();
  const [reservations, setReservations] = useState<ReservationDemand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePositiveDemandId, setActivePositiveDemandId] = useState<string | null>(null);
  const [activeContractDemandId, setActiveContractDemandId] = useState<string | null>(null);
  const [loadingContractId, setLoadingContractId] = useState<string | null>(null);

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
      const cachedRows = getReservationsFromCache({ clientUserId: user.id, clientEmail: user.email });
      setReservations(cachedRows);
      toast.error(
        cachedRows.length > 0
          ? "API indisponible. Historique local affiche."
          : (error instanceof Error ? error.message : "Impossible de charger vos reservations")
      );
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, user?.id]);

  useEffect(() => {
    void fetchReservations();
  }, [fetchReservations]);

  useEffect(() => {
    if (!activePositiveDemandId) {
      const demand = reservations.find((item) =>
        item.status === "reponse_positive_attente_confirmation_client" &&
        !item.client_confirmation_clicked_at
      );
      if (demand) setActivePositiveDemandId(demand.id);
    }
  }, [reservations, activePositiveDemandId]);

  useEffect(() => {
    for (const demand of reservations) {
      if (demand.status !== "contrat_realise" || !demand.contract_id) continue;
      const key = `dwira_contract_notice_${demand.id}_${demand.contract_id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setActiveContractDemandId(demand.id);
        break;
      }
    }
  }, [reservations]);

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

  const updateReservationInState = (updated: ReservationDemand) => {
    setReservations((prev) => prev.map((row) => row.id === updated.id ? updated : row));
  };

  const proceedToIdentity = async (demand: ReservationDemand) => {
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "attente_envoi_coordonnees_contrat",
          actor_type: "client",
          actor_id: user?.id || user?.email || "client",
          history_note: "Client a consulte la reponse positive et a clique pour fournir ses coordonnees",
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Mise a jour de la demande impossible"));
      const updated = await response.json();
      updateReservationInState(updated);
      setActivePositiveDemandId(null);
      navigate(`/mes-reservations/${encodeURIComponent(updated.id)}/coordonnees`);
      toast.success("Merci. Veuillez maintenant valider vos coordonnees.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour de la demande impossible");
    }
  };

  const openContract = async (demand: ReservationDemand) => {
    if (!demand.contract_id) {
      toast.error("Contrat indisponible.");
      return;
    }
    setLoadingContractId(demand.contract_id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(demand.contract_id)}`);
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Impossible de charger le contrat"));
      const contract = await response.json() as ContractApi;
      if (!contract?.url_pdf) throw new Error("Le contrat n'a pas encore de fichier associe");
      window.open(resolveAssetUrl(contract.url_pdf), "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de charger le contrat");
    } finally {
      setLoadingContractId(null);
    }
  };

  const printContract = async (demand: ReservationDemand) => {
    if (!demand.contract_id) {
      toast.error("Contrat indisponible.");
      return;
    }
    setLoadingContractId(demand.contract_id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(demand.contract_id)}`);
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Impossible de charger le contrat"));
      const contract = await response.json() as ContractApi;
      if (!contract?.url_pdf) throw new Error("Le contrat n'a pas encore de fichier associe");
      const popup = window.open(resolveAssetUrl(contract.url_pdf), "_blank", "noopener,noreferrer");
      if (!popup) {
        window.location.href = resolveAssetUrl(contract.url_pdf);
        toast.info("Popup bloquee. Contrat ouvert dans l'onglet courant pour impression.");
        return;
      }
      popup.addEventListener("load", () => popup.print(), { once: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'imprimer le contrat");
    } finally {
      setLoadingContractId(null);
    }
  };

  if (!user || user.role !== "user") {
    return <Navigate to="/login" replace />;
  }

  const activePositiveDemand = reservations.find((item) => item.id === activePositiveDemandId) || null;
  const activeContractDemand = reservations.find((item) => item.id === activeContractDemandId) || null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbf9_0%,#ffffff_55%)] pt-28 pb-20">
      <div className="container mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Espace client</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Mes demandes</h1>
            <p className="mt-2 text-sm text-gray-500">Historique et statut de vos demandes de reservation et de visite.</p>
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
              <h2 className="mt-4 text-xl font-semibold text-gray-900">Aucune demande pour le moment</h2>
              <p className="mt-2 text-sm text-gray-500">Explorez les biens et envoyez votre premiere demande.</p>
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
                        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{reservation.request_type === "visite" ? "Visite" : "Reservation"}</span>
                      </div>
                      <h2 className="mt-3 text-2xl font-bold text-gray-900">{reservation.bien_titre || "Bien"}</h2>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Info label={reservation.request_type === "visite" ? "Creneau" : "Periode"} value={formatReservationPeriod(reservation)} />
                        <Info label={reservation.request_type === "visite" ? "Visiteurs" : "Voyageurs"} value={`${reservation.guests}`} />
                        {reservation.request_type !== "visite" && (
                          <Info label="Montant total" value={`${Number(reservation.total_amount || 0).toLocaleString("fr-FR")} TND`} />
                        )}
                        {reservation.request_type !== "visite" && (
                          <Info label="Paiement choisi" value={reservation.payment_mode === "totalite" ? "Totalite" : "Avance"} />
                        )}
                        <Info label="Cree le" value={formatDateTime(reservation.created_at)} icon={<CalendarClock className="h-4 w-4" />} />
                        <Info label="Derniere mise a jour" value={formatDateTime(reservation.updated_at)} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Link to={reservation.path} className="inline-flex rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                        Voir le bien
                      </Link>
                      {reservation.status === "reponse_positive_attente_confirmation_client" && (
                        <button
                          type="button"
                          onClick={() => setActivePositiveDemandId(reservation.id)}
                          className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Consulter la demande
                        </button>
                      )}
                      {reservation.status === "attente_envoi_coordonnees_contrat" && (
                        <Link
                          to={`/mes-reservations/${encodeURIComponent(reservation.id)}/coordonnees`}
                          className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          Fournir mes coordonnees
                        </Link>
                      )}
                      {(reservation.status === "contrat_realise" || reservation.status === "succes_paiement") && reservation.contract_id && (
                        <>
                          <button
                            type="button"
                            onClick={() => void openContract(reservation)}
                            disabled={loadingContractId === reservation.contract_id}
                            className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                          >
                            {loadingContractId === reservation.contract_id ? "Ouverture..." : "Consulter mon contrat"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void printContract(reservation)}
                            disabled={loadingContractId === reservation.contract_id}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Printer className="h-4 w-4" />
                            Imprimer le contrat
                          </button>
                        </>
                      )}
                      {reservation.status === "contrat_realise" && (
                        <Link to="/contact" className="inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                          Proceder vers paiement
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!activePositiveDemand} onOpenChange={(open) => !open && setActivePositiveDemandId(null)}>
        <DialogContent className="max-w-3xl border-2 border-emerald-200 p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl text-emerald-700">Reponse positive recue</DialogTitle>
            <DialogDescription className="text-base text-gray-600">
              Le proprietaire a accepte votre demande pour {activePositiveDemand?.bien_titre || "ce bien"}.
              Cliquez sur le bouton ci-dessous pour continuer et fournir votre piece d'identite ou passeport afin de finaliser le contrat.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
            Une fois clique, l'etat passe a "Attente d'envoi de coordonnees pour contrat" et l'admin est informe de l'heure de consultation.
          </div>
          <DialogFooter className="mt-3">
            <button
              type="button"
              onClick={() => activePositiveDemand && void proceedToIdentity(activePositiveDemand)}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Proceder maintenant
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeContractDemand} onOpenChange={(open) => !open && setActiveContractDemandId(null)}>
        <DialogContent className="max-w-2xl p-7">
          <DialogHeader>
            <DialogTitle className="text-xl text-emerald-700">Contrat genere avec succes</DialogTitle>
            <DialogDescription>
              Votre contrat est pret et ajoute a votre historique. Vous pouvez le consulter maintenant puis proceder au paiement comme etape finale.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            Demande: {activeContractDemand?.id} <br />
            Contrat: {activeContractDemand?.contract_id || "-"}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => activeContractDemand && void openContract(activeContractDemand)}
              className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
            >
              Consulter le contrat
            </button>
            <button
              type="button"
              onClick={() => activeContractDemand && void printContract(activeContractDemand)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Printer className="h-4 w-4" />
              Imprimer le contrat
            </button>
            <Link to="/contact" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              Proceder vers paiement
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
