import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import type { ReservationDemand } from "../admin/types";

const API_URL = import.meta.env.VITE_API_URL || "/api";

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

function splitHumanName(fullName?: string | null) {
  const normalized = String(fullName || "").replace(/\s+/g, " ").trim();
  if (!normalized) return { firstName: "", lastName: "" };
  const parts = normalized.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(""),
  };
}

export default function ContractIdentityPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [demand, setDemand] = useState<ReservationDemand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const autoFilledFromProfileRef = useRef(false);

  const fetchDemand = useCallback(async () => {
    if (!id || !user?.email) return;
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (user.id) query.set("client_user_id", user.id);
      query.set("client_email", user.email);
      const response = await fetch(`${API_URL}/reservation-demands?${query.toString()}`, { credentials: "include" });
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(String(rows?.error || "Impossible de charger vos demandes"));
      const found = (Array.isArray(rows) ? rows : []).find((row) => String(row.id) === String(id)) || null;
      setDemand(found);
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

  const submitIdentityFromProfile = useCallback(async () => {
    if (!demand || !user) return;
    const fallbackNames = splitHumanName(user.name);
    const profileCin = String(user.cin || "").trim();
    const profileFirstName = String(user.firstName || fallbackNames.firstName || "").trim();
    const profileLastName = String(user.lastName || fallbackNames.lastName || "").trim();
    if (!profileCin || !profileFirstName || !profileLastName) return;

    try {
      const formData = new FormData();
      formData.append("document_type", "cin_tn");
      formData.append("document_country", "tunisie");
      formData.append("manual_document_number", profileCin);
      formData.append("manual_first_name", profileFirstName);
      formData.append("manual_last_name", profileLastName);
      formData.append("actor_id", user?.id || user?.email || "client");

      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/submit-identity`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Soumission des coordonnees impossible"));
      const updated = await response.json();
      setDemand(updated);
      toast.success("Coordonnees du profil utilisees automatiquement.");
    } catch (error) {
      autoFilledFromProfileRef.current = false;
      toast.error(error instanceof Error ? error.message : "Soumission des coordonnees impossible");
    }
  }, [demand, user]);

  useEffect(() => {
    if (!demand || !user) return;
    if (autoFilledFromProfileRef.current) return;
    const canCollectIdentity = demand.status === "attente_envoi_coordonnees_contrat";
    if (!canCollectIdentity) return;
    if (String(demand.identity_document_number || "").trim()) return;
    const fallbackNames = splitHumanName(user.name);
    if (!String(user.cin || "").trim()) return;
    if (!String(user.firstName || fallbackNames.firstName || "").trim()) return;
    if (!String(user.lastName || fallbackNames.lastName || "").trim()) return;
    autoFilledFromProfileRef.current = true;
    void submitIdentityFromProfile();
  }, [demand, user, submitIdentityFromProfile]);

  const periodText = useMemo(() => {
    if (!demand) return "-";
    const nights = computeNights(demand.start_date, demand.end_date);
    return `${formatDateOnly(demand.start_date)} au ${formatDateOnly(demand.end_date)} (${nights} nuit(s))`;
  }, [demand]);
  const reservationAmount = Number(demand?.total_amount || 0);
  const servicesQuoteAmount = Number(demand?.variable_services_quote_total || 0);
  const hasServicesQuote = servicesQuoteAmount > 0;
  const globalAmount = reservationAmount + servicesQuoteAmount;
  const isPaymentFlowLocked = String(demand?.status || "") === "client_procede_vers_paiement_en_cours";

  useEffect(() => {
    if (!isPaymentFlowLocked) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onPopState = () => {
      window.history.pushState(null, "", window.location.href);
      toast.info("Finalisez votre demande avant de quitter cette page.");
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [isPaymentFlowLocked]);

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

  const canProceedToPayment = demand.status !== "demande_rejetee_admin";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbf9_0%,#ffffff_55%)] pt-28 pb-20">
      <div className="container mx-auto max-w-4xl px-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {isPaymentFlowLocked ? (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700">
              Finalisation en cours
            </span>
          ) : (
            <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </button>
          )}
          <button type="button" onClick={() => void fetchDemand()} className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <TimerReset className="h-4 w-4" />
            Actualiser
          </button>
        </div>

        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Coordonnees contrat</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Finalisation de reservation</h1>
          <div className="mt-4 grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 sm:grid-cols-2">
            <p><strong>Reference:</strong> {demand.bien_reference || demand.bien_id}</p>
            <p><strong>Type:</strong> {demand.request_type === "visite" ? "Visite" : "Reservation"}</p>
            <p><strong>Periode:</strong> {periodText}</p>
            <p><strong>Voyageurs:</strong> {demand.guests}</p>
            <p><strong>Montant reservation:</strong> {formatAmount(reservationAmount)}</p>
            {hasServicesQuote ? (
              <p><strong>Devis services:</strong> {formatAmount(servicesQuoteAmount)}</p>
            ) : null}
            <p><strong>Montant global:</strong> {formatAmount(hasServicesQuote ? globalAmount : reservationAmount)}</p>
            <p><strong>Paiement choisi:</strong> {demand.payment_mode === "totalite" ? "Totalite" : demand.payment_mode === "amicale" ? "Amicale" : "Avance"}</p>
          </div>

          {hasServicesQuote ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Le montant global inclut la reservation et le devis de vos services payants variables.
            </div>
          ) : null}

          {canProceedToPayment && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 p-5">
              <p className="text-sm text-amber-900">Etape OCR supprimee. Continuez directement vers le paiement.</p>
              <div className="mt-4">
                <Link
                  to={`/mes-reservations/${encodeURIComponent(demand.id)}/paiement`}
                  className="group inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-5 py-2.5 text-sm font-semibold text-amber-800 shadow-sm transition hover:shadow-[0_0_20px_rgba(245,158,11,0.35)]"
                >
                  Proceder vers paiement
                  <ArrowRight className="h-4 w-4 animate-pulse transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
