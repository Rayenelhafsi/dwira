import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { CalendarClock, ShoppingBag, TimerReset } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

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
  const { user } = useAuth();
  const { properties } = useProperties();
  const [reservations, setReservations] = useState<ReservationDemand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePositiveDemandId, setActivePositiveDemandId] = useState<string | null>(null);
  const [activeIdentityDemandId, setActiveIdentityDemandId] = useState<string | null>(null);
  const [activeContractDemandId, setActiveContractDemandId] = useState<string | null>(null);
  const [clientTypeTab, setClientTypeTab] = useState<"tunisie" | "etranger">("tunisie");
  const [tunisiaDocumentType, setTunisiaDocumentType] = useState<"cin_tn" | "passport_tn">("cin_tn");
  const [manualDocumentNumber, setManualDocumentNumber] = useState("");
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [submittingIdentity, setSubmittingIdentity] = useState(false);
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
      setActiveIdentityDemandId(updated.id);
      toast.success("Merci. Veuillez maintenant envoyer votre piece d'identite.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour de la demande impossible");
    }
  };

  const submitIdentity = async () => {
    const demand = reservations.find((item) => item.id === activeIdentityDemandId);
    if (!demand) return;
    if (!identityFile && !manualDocumentNumber.trim()) {
      toast.error("Ajoutez une image du document ou renseignez le numero manuellement.");
      return;
    }

    setSubmittingIdentity(true);
    try {
      const formData = new FormData();
      const documentType = clientTypeTab === "etranger" ? "passport_foreign" : tunisiaDocumentType;
      formData.append("document_type", documentType);
      formData.append("document_country", clientTypeTab === "etranger" ? "etranger" : "tunisie");
      formData.append("manual_document_number", manualDocumentNumber.trim());
      formData.append("actor_id", user?.id || user?.email || "client");
      if (identityFile) formData.append("document", identityFile);

      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/submit-identity`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Soumission des coordonnees impossible"));
      const updated = await response.json();
      updateReservationInState(updated);
      setIdentityFile(null);
      setManualDocumentNumber("");
      setActiveIdentityDemandId(null);
      setActiveContractDemandId(updated.id);
      toast.success("Coordonnees confirmees. Le contrat a ete genere.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Soumission des coordonnees impossible");
    } finally {
      setSubmittingIdentity(false);
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

  if (!user || user.role !== "user") {
    return <Navigate to="/login" replace />;
  }

  const activePositiveDemand = reservations.find((item) => item.id === activePositiveDemandId) || null;
  const activeIdentityDemand = reservations.find((item) => item.id === activeIdentityDemandId) || null;
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
                        <Info label={reservation.request_type === "visite" ? "Creneau" : "Periode"} value={`${reservation.start_date} au ${reservation.end_date}`} />
                        <Info label={reservation.request_type === "visite" ? "Visiteurs" : "Voyageurs"} value={`${reservation.guests}`} />
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
                        <button
                          type="button"
                          onClick={() => setActiveIdentityDemandId(reservation.id)}
                          className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          Fournir mes coordonnees
                        </button>
                      )}
                      {(reservation.status === "contrat_realise" || reservation.status === "succes_paiement") && reservation.contract_id && (
                        <button
                          type="button"
                          onClick={() => void openContract(reservation)}
                          disabled={loadingContractId === reservation.contract_id}
                          className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                        >
                          {loadingContractId === reservation.contract_id ? "Ouverture..." : "Consulter mon contrat"}
                        </button>
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

      <Dialog open={!!activeIdentityDemand} onOpenChange={(open) => !open && setActiveIdentityDemandId(null)}>
        <DialogContent className="max-w-3xl p-7">
          <DialogHeader>
            <DialogTitle className="text-xl">Coordonnees pour contrat</DialogTitle>
            <DialogDescription>
              Envoyez votre document d'identite. Nous faisons une extraction OCR simple du numero puis nous generons le contrat automatiquement.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={clientTypeTab} onValueChange={(value) => setClientTypeTab(value as "tunisie" | "etranger")} className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="tunisie">Client tunisien</TabsTrigger>
              <TabsTrigger value="etranger">Client etranger</TabsTrigger>
            </TabsList>
            <TabsContent value="tunisie" className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <input
                    type="radio"
                    checked={tunisiaDocumentType === "cin_tn"}
                    onChange={() => setTunisiaDocumentType("cin_tn")}
                  />
                  Carte d'identite tunisienne
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <input
                    type="radio"
                    checked={tunisiaDocumentType === "passport_tn"}
                    onChange={() => setTunisiaDocumentType("passport_tn")}
                  />
                  Passeport tunisien
                </label>
              </div>
            </TabsContent>
            <TabsContent value="etranger" className="text-sm text-gray-600">
              Importez votre passeport. Le numero sera detecte automatiquement si possible, sinon renseignez-le manuellement.
            </TabsContent>
          </Tabs>

          <div className="space-y-3">
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={(event) => setIdentityFile(event.target.files?.[0] || null)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={manualDocumentNumber}
              onChange={(event) => setManualDocumentNumber(event.target.value)}
              placeholder="Numero document (optionnel, utile si OCR ne detecte pas)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => void submitIdentity()}
              disabled={submittingIdentity}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submittingIdentity ? "Generation en cours..." : "Confirmer mes coordonnees"}
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
