import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ArrowLeft, FileText, Printer, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import type { ReservationDemand } from "../admin/types";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type ContractApi = {
  id: string;
  url_pdf?: string;
};

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

function formatAmount(value?: number | null) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString("fr-FR")} TND`;
}

async function getApiErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || "").trim();
    const detail = String(data?.detail || "").trim();
    if (message && detail && !message.includes(detail)) return `${message} - ${detail}`;
    if (message) return message;
  }
  return fallback;
}

function resolveAssetUrl(url?: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url}`;
}

export default function ContractIdentityPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [demand, setDemand] = useState<ReservationDemand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clientTypeTab, setClientTypeTab] = useState<"tunisie" | "etranger">("tunisie");
  const [tunisiaDocumentType, setTunisiaDocumentType] = useState<"cin_tn" | "passport_tn">("cin_tn");
  const [manualDocumentNumber, setManualDocumentNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingContract, setLoadingContract] = useState(false);

  const fetchDemand = useCallback(async () => {
    if (!id || !user?.email) return;
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (user.id) query.set("client_user_id", user.id);
      query.set("client_email", user.email);
      const response = await fetch(`${API_URL}/reservation-demands?${query.toString()}`);
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(String(rows?.error || "Impossible de charger vos demandes"));
      const found = (Array.isArray(rows) ? rows : []).find((row) => String(row.id) === String(id)) || null;
      setDemand(found);
      if (found?.identity_document_number) setManualDocumentNumber(found.identity_document_number);
      if (found?.identity_first_name) setFirstName(found.identity_first_name);
      if (found?.identity_last_name) setLastName(found.identity_last_name);
      if (found?.identity_document_type === "passport_foreign") {
        setClientTypeTab("etranger");
      } else if (found?.identity_document_type === "passport_tn") {
        setClientTypeTab("tunisie");
        setTunisiaDocumentType("passport_tn");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de charger la demande");
      setDemand(null);
    } finally {
      setIsLoading(false);
    }
  }, [id, user?.email, user?.id]);

  useEffect(() => {
    void fetchDemand();
  }, [fetchDemand]);

  const proceedFromPositive = async () => {
    if (!demand) return;
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
      setDemand(updated);
      toast.success("Vous pouvez maintenant valider vos coordonnees.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    }
  };

  const extractFromOcr = async () => {
    if (!demand) return;
    if (!identityFile && !manualDocumentNumber.trim()) {
      toast.error("Ajoutez une image ou renseignez le numero manuellement.");
      return;
    }
    setExtracting(true);
    try {
      const documentType = clientTypeTab === "etranger" ? "passport_foreign" : tunisiaDocumentType;
      const formData = new FormData();
      formData.append("document_type", documentType);
      formData.append("manual_document_number", manualDocumentNumber.trim());
      if (identityFile) formData.append("document", identityFile);

      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/extract-identity`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Extraction OCR impossible"));
      const data = await response.json();
      setManualDocumentNumber(String(data?.identity_document_number || ""));
      setFirstName(String(data?.identity_first_name || ""));
      setLastName(String(data?.identity_last_name || ""));
      setUploadedImageUrl(String(data?.identity_document_image_url || "") || null);
      toast.success("Extraction terminee. Verifiez et confirmez les donnees.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Extraction OCR impossible");
    } finally {
      setExtracting(false);
    }
  };

  const submitIdentity = async () => {
    if (!demand) return;
    if (!manualDocumentNumber.trim() || !firstName.trim() || !lastName.trim()) {
      toast.error("Numero, nom et prenom sont obligatoires.");
      return;
    }
    setSubmitting(true);
    try {
      const documentType = clientTypeTab === "etranger" ? "passport_foreign" : tunisiaDocumentType;
      const formData = new FormData();
      formData.append("document_type", documentType);
      formData.append("document_country", clientTypeTab === "etranger" ? "etranger" : "tunisie");
      formData.append("manual_document_number", manualDocumentNumber.trim());
      formData.append("manual_first_name", firstName.trim());
      formData.append("manual_last_name", lastName.trim());
      formData.append("actor_id", user?.id || user?.email || "client");
      if (uploadedImageUrl) formData.append("identity_document_image_url", uploadedImageUrl);
      if (identityFile) formData.append("document", identityFile);

      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/submit-identity`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Soumission des coordonnees impossible"));
      const updated = await response.json();
      setDemand(updated);
      setIdentityFile(null);
      toast.success("Coordonnees confirmees. Contrat genere.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Soumission des coordonnees impossible");
    } finally {
      setSubmitting(false);
    }
  };

  const openContract = async () => {
    if (!demand?.contract_id) return;
    setLoadingContract(true);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(demand.contract_id)}`);
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Impossible de charger le contrat"));
      const contract = (await response.json()) as ContractApi;
      if (!contract.url_pdf) throw new Error("Le contrat n'a pas encore de fichier associe");
      window.open(resolveAssetUrl(contract.url_pdf), "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de charger le contrat");
    } finally {
      setLoadingContract(false);
    }
  };

  const printContract = async () => {
    if (!demand?.contract_id) return;
    setLoadingContract(true);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(demand.contract_id)}`);
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Impossible de charger le contrat"));
      const contract = (await response.json()) as ContractApi;
      if (!contract.url_pdf) throw new Error("Le contrat n'a pas encore de fichier associe");
      const popup = window.open(resolveAssetUrl(contract.url_pdf), "_blank", "noopener,noreferrer");
      if (!popup) throw new Error("Autorisez les popups pour imprimer le contrat");
      popup.addEventListener("load", () => popup.print(), { once: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'imprimer le contrat");
    } finally {
      setLoadingContract(false);
    }
  };

  const periodText = useMemo(() => {
    if (!demand) return "-";
    const nights = computeNights(demand.start_date, demand.end_date);
    return `${formatDateOnly(demand.start_date)} au ${formatDateOnly(demand.end_date)} (${nights} nuit(s))`;
  }, [demand]);

  if (!user || user.role !== "user") {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbf9_0%,#ffffff_55%)] pt-28 pb-20">
        <div className="container mx-auto max-w-4xl px-4 md:px-6">
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
          </div>
        </div>
      </div>
    );
  }

  if (!demand) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbf9_0%,#ffffff_55%)] pt-28 pb-20">
        <div className="container mx-auto max-w-4xl px-4 md:px-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-700">Demande introuvable.</p>
            <Link to="/mes-reservations" className="mt-4 inline-flex rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Retour a mes demandes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canCollectIdentity = demand.status === "attente_envoi_coordonnees_contrat" || demand.status === "reponse_positive_attente_confirmation_client";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbf9_0%,#ffffff_55%)] pt-28 pb-20">
      <div className="container mx-auto max-w-4xl px-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </button>
          <button type="button" onClick={() => void fetchDemand()} className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <TimerReset className="h-4 w-4" />
            Actualiser
          </button>
        </div>

        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Coordonnees contrat</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Validation des donnees OCR</h1>
          <div className="mt-4 grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 sm:grid-cols-2">
            <p><strong>Reference:</strong> {demand.bien_reference || demand.bien_id}</p>
            <p><strong>Type:</strong> {demand.request_type === "visite" ? "Visite" : "Reservation"}</p>
            <p><strong>Periode:</strong> {periodText}</p>
            <p><strong>Voyageurs:</strong> {demand.guests}</p>
            <p><strong>Montant total:</strong> {formatAmount(demand.total_amount)}</p>
            <p><strong>Paiement choisi:</strong> {demand.payment_mode === "totalite" ? "Totalite" : "Avance"}</p>
          </div>

          {demand.status === "reponse_positive_attente_confirmation_client" && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Le proprietaire a accepte votre demande. Cliquez pour continuer vers l'envoi de vos coordonnees.
              <div className="mt-3">
                <button type="button" onClick={() => void proceedFromPositive()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Proceder maintenant
                </button>
              </div>
            </div>
          )}

          {canCollectIdentity && demand.status !== "reponse_positive_attente_confirmation_client" && (
            <div className="mt-6 space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setClientTypeTab("tunisie")} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${clientTypeTab === "tunisie" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-700"}`}>
                  Client tunisien
                </button>
                <button type="button" onClick={() => setClientTypeTab("etranger")} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${clientTypeTab === "etranger" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-700"}`}>
                  Client etranger
                </button>
              </div>

              {clientTypeTab === "tunisie" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <input type="radio" checked={tunisiaDocumentType === "cin_tn"} onChange={() => setTunisiaDocumentType("cin_tn")} />
                    Carte d'identite tunisienne
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <input type="radio" checked={tunisiaDocumentType === "passport_tn"} onChange={() => setTunisiaDocumentType("passport_tn")} />
                    Passeport tunisien
                  </label>
                </div>
              )}

              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(event) => setIdentityFile(event.target.files?.[0] || null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  value={manualDocumentNumber}
                  onChange={(event) => setManualDocumentNumber(event.target.value)}
                  placeholder="Numero document"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Nom"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Prenom"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void extractFromOcr()} disabled={extracting} className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                  {extracting ? "Extraction..." : "Extraire donnees OCR"}
                </button>
                <button type="button" onClick={() => void submitIdentity()} disabled={submitting} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {submitting ? "Generation..." : "Valider et generer contrat"}
                </button>
              </div>
            </div>
          )}

          {(demand.status === "contrat_realise" || demand.status === "succes_paiement") && demand.contract_id && (
            <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-sm text-sky-800">Contrat genere. Vous pouvez le consulter ou l'imprimer.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={() => void openContract()} disabled={loadingContract} className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                  <FileText className="h-4 w-4" />
                  Consulter mon contrat
                </button>
                <button type="button" onClick={() => void printContract()} disabled={loadingContract} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <Printer className="h-4 w-4" />
                  Imprimer le contrat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
