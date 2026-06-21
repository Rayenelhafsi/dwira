import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, BadgeCheck, CreditCard, Landmark, MapPin, Phone, ReceiptText, TimerReset, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import type { ReservationDemand } from "../admin/types";
import { getSessionUser } from "../services/auth";
import { trackMetaEvent } from "../utils/metaConversions";
import CenterStatusPopup from "../components/CenterStatusPopup";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const CARD_PAYMENT_COMING_SOON_LABEL = "methode Arrive dans quelques jours";

type PaymentScope = "reservation" | "services" | "combined";
type PaymentMethod = "carte" | "virement";

function normalizePaymentMethodParam(value?: string | null): "clicktopay" | "receipt" | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "clicktopay" || normalized === "click_to_pay" || normalized === "click-to-pay" || normalized === "flouci") return "clicktopay";
  if (normalized === "receipt" || normalized === "recu" || normalized === "upload" || normalized === "virement") return "receipt";
  return null;
}

function openExternalCheckout(url: string) {
  const target = String(url || "").trim();
  if (!target) return;
  const anchor = document.createElement("a");
  anchor.href = target;
  anchor.rel = "noopener noreferrer";
  anchor.target = "_self";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.location.replace(target);
}

async function getApiErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || "").trim();
    if (message) return message;
  }
  return fallback;
}

function formatMoney(value?: number | null) {
  return `${Number(value || 0).toLocaleString("fr-FR")} TND`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", hour12: false });
}

function resolveAssetUrl(url?: string | null) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${window.location.origin}${value.startsWith("/") ? value : `/${value}`}`;
}

const AGENCY_BANK_DETAILS = {
  titulaire: "DWIRA KELIBIA",
  adresse: "Rue Ibn Khaldoun, Kelibia 8090, Nabeul",
  rib: "14 069 0691017000664 77",
  banque: "BH Banque",
  contacts: ["29 879 227", "52 080 695"],
};

export default function ReservationPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [demand, setDemand] = useState<ReservationDemand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submittingScope, setSubmittingScope] = useState<PaymentScope | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("carte");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptNote, setReceiptNote] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [startingFlouciScope, setStartingFlouciScope] = useState<PaymentScope | null>(null);
  const [confirmingFlouci, setConfirmingFlouci] = useState(false);
  const [startingClickToPayScope, setStartingClickToPayScope] = useState<PaymentScope | null>(null);
  const [confirmingClickToPay, setConfirmingClickToPay] = useState(false);
  const [redirectHomeAfterSuccess, setRedirectHomeAfterSuccess] = useState(false);
  const [centerFeedback, setCenterFeedback] = useState<{ open: boolean; title: string; message: string; tone?: "success" | "error" }>({
    open: false,
    title: "",
    message: "",
    tone: "success",
  });
  const [statusPopupShown, setStatusPopupShown] = useState(false);
  const selectedMethod = useMemo(() => normalizePaymentMethodParam(searchParams.get("method")), [searchParams]);
  const showClickToPayBlock = selectedMethod === "clicktopay";
  const showReceiptBlock = selectedMethod === "receipt";
  const visiblePaymentCardsCount = Number(showClickToPayBlock) + Number(showReceiptBlock);

  const fetchDemand = useCallback(async () => {
    if (!id || !user?.email) return;
    setIsLoading(true);
    try {
      const sessionUser = await getSessionUser();
      if (!sessionUser) {
        setDemand(null);
        return;
      }
      const query = new URLSearchParams();
      if (user.id) query.set("client_user_id", user.id);
      query.set("client_email", user.email);
      const response = await fetch(`${API_URL}/reservation-demands?${query.toString()}`, { credentials: "include" });
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(String(rows?.error || "Impossible de charger la demande"));
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

  useEffect(() => {
    if (!demand?.id || confirmingFlouci) return;
    const paymentId = String(searchParams.get("flouci_payment_id") || "").trim();
    const flow = String(searchParams.get("flouci_flow") || "").trim().toLowerCase();
    if (!paymentId && !flow) return;
    if (flow === "fail") {
      const reason = String(searchParams.get("reason") || "").trim();
      setCenterFeedback({
        open: true,
        title: "Paiement échoué",
        message: reason
          ? `Votre paiement Flouci a échoué. Motif : ${reason}. Merci de réessayer une autre fois.`
          : "Votre paiement Flouci a échoué. Merci de réessayer une autre fois.",
        tone: "error",
      });
      const next = new URLSearchParams(searchParams);
      next.delete("flouci_payment_id");
      next.delete("flouci_flow");
      next.delete("scope");
      next.delete("demand_id");
      setSearchParams(next, { replace: true });
      return;
    }
    if (!paymentId) return;
    const scope = String(searchParams.get("scope") || demand.flouci_scope || "reservation").trim().toLowerCase();
    if (!["reservation", "services", "combined"].includes(scope)) return;

    setConfirmingFlouci(true);
    (async () => {
      try {
        const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/flouci/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ payment_id: paymentId, scope }),
        });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, "Confirmation Flouci impossible"));
        const updated = await response.json();
        setDemand(updated);
        await trackMetaEvent({
          eventName: "Purchase",
          customData: {
            content_name: demand.bien_titre || "Reservation",
            content_ids: [String(demand.bien_id || demand.id)],
            value: Number(demand.amount_due_now || demand.total_amount || 0),
            currency: "TND",
            payment_method: "flouci",
          },
          userData: {
            email: user?.email,
            externalId: user?.authProvider === 'facebook'
              ? String(user?.providerUserId || user?.id || '')
              : String(user?.id || ''),
          },
        });
        setCenterFeedback({
          open: true,
          title: "Paiement confirme",
          message: "Votre paiement Flouci a été confirmé avec succès.",
          tone: "success",
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Confirmation Flouci impossible");
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("flouci_payment_id");
        next.delete("flouci_flow");
        next.delete("scope");
        next.delete("demand_id");
        setSearchParams(next, { replace: true });
        setConfirmingFlouci(false);
      }
    })();
  }, [confirmingFlouci, demand?.flouci_scope, demand?.id, searchParams, setSearchParams]);

  useEffect(() => {
    if (!demand?.id || confirmingClickToPay) return;
    const payment = String(searchParams.get("payment") || "").trim().toLowerCase();
    const reservationDemandId = String(searchParams.get("reservation_demand_id") || "").trim();
    if (!payment || !reservationDemandId || reservationDemandId !== demand.id) return;
    if (payment === "failed") {
      const reason = String(searchParams.get("reason") || "").trim();
      setCenterFeedback({
        open: true,
        title: "Paiement échoué",
        message: reason
          ? `Votre paiement Click to Pay a échoué. Motif : ${reason}. Merci de réessayer une autre fois.`
          : "Votre paiement Click to Pay a échoué. Merci de réessayer une autre fois.",
        tone: "error",
      });
      const next = new URLSearchParams(searchParams);
      next.delete("payment");
      next.delete("reason");
      next.delete("reference");
      next.delete("reservation_demand_id");
      setSearchParams(next, { replace: true });
      return;
    }
    if (payment !== "success") return;
    setConfirmingClickToPay(true);
    (async () => {
      try {
        const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/clicktopay/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, "Confirmation Click to Pay impossible"));
        const updated = await response.json();
        setDemand(updated);
        await trackMetaEvent({
          eventName: "Purchase",
          customData: {
            content_name: demand.bien_titre || "Reservation",
            content_ids: [String(demand.bien_id || demand.id)],
            value: Number(demand.amount_due_now || demand.total_amount || 0),
            currency: "TND",
            payment_method: "clicktopay",
          },
          userData: {
            email: user?.email,
            externalId: user?.authProvider === 'facebook'
              ? String(user?.providerUserId || user?.id || '')
              : String(user?.id || ''),
          },
        });
        setCenterFeedback({
          open: true,
          title: "Réservation confirmée",
          message: "Votre paiement Click to Pay a été confirmé avec succès. Merci pour votre confiance.",
        });
        setRedirectHomeAfterSuccess(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Confirmation Click to Pay impossible");
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("payment");
        next.delete("reason");
        next.delete("reference");
        next.delete("reservation_demand_id");
        setSearchParams(next, { replace: true });
        setConfirmingClickToPay(false);
      }
    })();
  }, [confirmingClickToPay, demand?.id, searchParams, setSearchParams]);

  useEffect(() => {
    if (!redirectHomeAfterSuccess || !centerFeedback.open || centerFeedback.tone === "error") return;
    const timeoutId = window.setTimeout(() => {
      navigate("/", { replace: true });
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [centerFeedback.open, centerFeedback.tone, navigate, redirectHomeAfterSuccess]);

  useEffect(() => {
    if (!demand || statusPopupShown || redirectHomeAfterSuccess) return;
    if (String(demand.status || "") === "succes_paiement") {
      setCenterFeedback({
        open: true,
        title: "Paiement terminé",
        message: "Votre réservation est finalisée avec succès.",
      });
      setStatusPopupShown(true);
    }
  }, [demand, redirectHomeAfterSuccess, statusPopupShown]);

  const paymentSummary = useMemo(() => {
    if (!demand) return null;
    const reservationAmount = Number(demand.amount_due_now || demand.total_amount || 0);
    const servicesAmount = Number(demand.variable_services_quote_total || 0);
    const reservationPaid = !!demand.reservation_payment_id;
    const servicesPayable = demand.variable_services_quote_status === "devis_envoye" && servicesAmount > 0;
    const servicesPaid = !!demand.services_payment_id || demand.variable_services_quote_status === "paye";
    return {
      reservationAmount,
      servicesAmount,
      reservationPaid,
      servicesPayable,
      servicesPaid,
      canPayReservation: reservationAmount > 0 && !reservationPaid,
      canPayServices: servicesPayable && !servicesPaid,
      canPayCombined: reservationAmount > 0 && !reservationPaid && servicesPayable && !servicesPaid,
    };
  }, [demand]);

  const flouciPayScope: PaymentScope | null = useMemo(() => {
    if (!paymentSummary) return null;
    if (paymentSummary.canPayCombined) return "combined";
    if (paymentSummary.canPayReservation) return "reservation";
    if (paymentSummary.canPayServices) return "services";
    return null;
  }, [paymentSummary]);

  const clickToPayScope: PaymentScope | null = useMemo(() => {
    if (!paymentSummary) return null;
    if (paymentSummary.canPayCombined) return "combined";
    if (paymentSummary.canPayReservation) return "reservation";
    if (paymentSummary.canPayServices) return "services";
    return null;
  }, [paymentSummary]);

  const handlePay = async (scope: PaymentScope) => {
    if (!demand) return;
    setSubmittingScope(scope);
    try {
      await trackMetaEvent({
        eventName: "InitiateCheckout",
        customData: {
          content_name: demand.bien_titre || "Reservation",
          content_ids: [String(demand.bien_id || demand.id)],
          value: Number(demand.amount_due_now || demand.total_amount || 0),
          currency: "TND",
          checkout_scope: scope,
        },
        userData: {
          email: user?.email,
          phone: user?.telephone || undefined,
          externalId: String(user?.providerUserId || user?.id || ""),
        },
      });
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scope,
          methode: paymentMethod,
          actor_id: user?.id || user?.email || "client",
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Paiement impossible"));
      const updated = await response.json();
      setDemand(updated);
      await trackMetaEvent({
        eventName: "Purchase",
        customData: {
          content_name: demand.bien_titre || "Reservation",
          content_ids: [String(demand.bien_id || demand.id)],
          value: Number(demand.amount_due_now || demand.total_amount || 0),
          currency: "TND",
          payment_method: paymentMethod,
        },
        userData: {
          email: user?.email,
          externalId: user?.authProvider === 'facebook'
            ? String(user?.providerUserId || user?.id || '')
            : String(user?.id || ''),
        },
      });
      setCenterFeedback({
        open: true,
        title: "Paiement enregistré",
        message:
          scope === "combined"
            ? "Paiement réservation + services enregistré."
            : scope === "services"
              ? "Paiement des services enregistré."
              : "Paiement de la réservation enregistré.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Paiement impossible");
    } finally {
      setSubmittingScope(null);
    }
  };

  const handleStartFlouci = async (scope: PaymentScope) => {
    if (!demand) return;
    setStartingFlouciScope(scope);
    try {
      await trackMetaEvent({
        eventName: "InitiateCheckout",
        customData: {
          content_name: demand.bien_titre || "Reservation",
          content_ids: [String(demand.bien_id || demand.id)],
          value: Number(demand.amount_due_now || demand.total_amount || 0),
          currency: "TND",
          payment_method: "flouci",
          checkout_scope: scope,
        },
        userData: {
          email: user?.email,
          phone: user?.telephone || undefined,
          externalId: String(user?.providerUserId || user?.id || ""),
        },
      });
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/flouci/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scope }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Creation session Flouci impossible"));
      const payload = await response.json();
      const checkoutUrl = String(payload?.checkout_url || "").trim();
      if (!checkoutUrl) throw new Error("Lien checkout Flouci manquant");
      openExternalCheckout(checkoutUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation session Flouci impossible");
    } finally {
      setStartingFlouciScope(null);
    }
  };

  const handleStartClickToPay = async (scope: PaymentScope) => {
    if (!demand) return;
    setStartingClickToPayScope(scope);
    try {
      await trackMetaEvent({
        eventName: "InitiateCheckout",
        customData: {
          content_name: demand.bien_titre || "Reservation",
          content_ids: [String(demand.bien_id || demand.id)],
          value: Number(demand.amount_due_now || demand.total_amount || 0),
          currency: "TND",
          payment_method: "clicktopay",
          checkout_scope: scope,
        },
        userData: {
          email: user?.email,
          phone: user?.telephone || undefined,
          externalId: String(user?.providerUserId || user?.id || ""),
        },
      });
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/clicktopay/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scope }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Creation session Click to Pay impossible"));
      const payload = await response.json();
      const checkoutUrl = String(payload?.checkout_url || "").trim();
      if (!checkoutUrl) throw new Error("Lien checkout Click to Pay manquant");
      openExternalCheckout(checkoutUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation session Click to Pay impossible");
    } finally {
      setStartingClickToPayScope(null);
    }
  };

  const handleUploadReceipt = async () => {
    if (!demand) return;
    if (!receiptFile) {
      toast.error("Veuillez selectionner une image du recu.");
      return;
    }
    setUploadingReceipt(true);
    try {
      await trackMetaEvent({
        eventName: "InitiateCheckout",
        customData: {
          content_name: demand.bien_titre || "Reservation",
          content_ids: [String(demand.bien_id || demand.id)],
          value: Number(demand.amount_due_now || demand.total_amount || 0),
          currency: "TND",
          payment_method: "receipt",
          checkout_scope: "reservation",
        },
        userData: {
          email: user?.email,
          phone: user?.telephone || undefined,
          externalId: String(user?.providerUserId || user?.id || ""),
        },
      });
      const formData = new FormData();
      formData.append("receipt", receiptFile);
      if (receiptNote.trim()) formData.append("payment_receipt_note", receiptNote.trim());
      if (paymentReference.trim()) formData.append("payment_id", paymentReference.trim());
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/upload-payment-receipt`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Envoi du recu impossible"));
      const updated = await response.json();
      setDemand(updated);
      setReceiptFile(null);
      setReceiptNote("");
      setPaymentReference("");
      setCenterFeedback({
        open: true,
        title: "Recu envoye",
        message: "Admin traite votre demande.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi du recu impossible");
    } finally {
      setUploadingReceipt(false);
    }
  };

  if (!user || user.role !== "user") {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbf9_0%,#ffffff_55%)] pt-28 pb-20">
        <div className="container mx-auto max-w-5xl px-4 md:px-6">
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
        <div className="container mx-auto max-w-5xl px-4 md:px-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-700">Demande introuvable.</p>
            <Link to="/mes-reservations" className="mt-4 inline-flex rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Retour a mes demandes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const summary = paymentSummary;

  if (!selectedMethod) {
    return <Navigate to={`/mes-reservations/${encodeURIComponent(demand.id)}/coordonnees`} replace />;
  }

  return (
    <>
      <CenterStatusPopup
        open={centerFeedback.open}
        title={centerFeedback.title}
        message={centerFeedback.message}
        tone={centerFeedback.tone || "success"}
        onClose={() => {
          setCenterFeedback({ open: false, title: "", message: "", tone: "success" });
          setRedirectHomeAfterSuccess(false);
        }}
      />
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbf9_0%,#ffffff_55%)] pt-28 pb-20">
      <div className="container mx-auto max-w-5xl px-4 md:px-6">
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Paiement client</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Finaliser votre demande</h1>
            <p className="mt-2 text-sm text-gray-500">
              {selectedMethod === "receipt"
                ? "Envoyez votre recu pour verification manuelle par l'administration."
                : "Lancez le paiement en ligne puis revenez automatiquement sur votre dossier apres verification."}
            </p>
            {!!String(demand.contract_url || "").trim() && (
              <div className="mt-3">
                <a
                  href={resolveAssetUrl(demand.contract_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Voir le contrat
                </a>
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoCard label="Demande" value={demand.bien_reference || demand.id} />
              <InfoCard label="Bien" value={demand.bien_titre || "Bien"} />
              <InfoCard label="Paiement reservation" value={summary?.reservationPaid ? `Regle le ${formatDateTime(demand.reservation_payment_paid_at)}` : formatMoney(summary?.reservationAmount)} />
              <InfoCard label="Paiement services" value={summary?.servicesPayable ? (summary?.servicesPaid ? `Regle le ${formatDateTime(demand.services_payment_paid_at)}` : formatMoney(summary?.servicesAmount)) : "Aucun devis a regler"} />
            </div>

            <div className="mt-6 overflow-x-auto pb-2 [scrollbar-width:thin]">
              <div className="flex min-w-full gap-4">
              {showClickToPayBlock ? (
                <div
                  className={`relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0b7a58_0%,#169b67_56%,#34d399_100%)] p-6 text-white shadow-[0_24px_80px_-32px_rgba(5,150,105,0.85)] ${
                    visiblePaymentCardsCount > 1 ? "min-w-[320px] shrink-0 sm:min-w-[380px] lg:min-w-[440px]" : "w-full flex-1"
                  }`}
                >
                  <div className="absolute -right-10 top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
                  <div className="relative flex h-full min-h-[260px] flex-col justify-between">
                    <div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur">
                        <CreditCard className="h-6 w-6" />
                      </div>
                      <p className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-white/80">Paiement avec carte bancaire</p>
                      <h2 className="mt-2 text-2xl font-bold leading-tight">Reglez votre reservation en ligne</h2>
                      <p className="mt-3 text-sm leading-6 text-emerald-50">
                        Paiement securise via Click to Pay. La confirmation de votre dossier se fait automatiquement apres verification du statut.
                      </p>
                      <div className="mt-5 inline-flex rounded-[22px] border border-white/10 bg-white/10 px-4 py-3 text-left text-white/80 backdrop-blur">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.32em]">Methode</p>
                          <p className="mt-1 text-lg font-semibold text-white">Click to Pay</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        disabled
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-emerald-800 shadow-lg shadow-emerald-950/10 transition hover:-translate-y-0.5 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-[260px]"
                      >
                        <CreditCard className="h-4 w-4" />
                        {CARD_PAYMENT_COMING_SOON_LABEL}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {showReceiptBlock ? (
                <div
                  className={`rounded-[28px] border border-sky-200 bg-[linear-gradient(180deg,#eff9ff_0%,#f8fdff_100%)] p-6 shadow-[0_24px_80px_-40px_rgba(14,116,144,0.45)] ${
                    visiblePaymentCardsCount > 1 ? "min-w-[320px] shrink-0 sm:min-w-[420px] lg:min-w-[520px]" : "w-full flex-1"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-sky-800">Paiement par virement et envoi de recu</p>
                      <h2 className="mt-2 text-2xl font-bold text-slate-900">Coordonnees bancaires de l'agence</h2>
                    </div>
                    <div className="hidden rounded-2xl bg-sky-100 p-3 text-sky-700 sm:block">
                      <Landmark className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-2xl border border-white/70 bg-white/85 p-4 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Titulaire</p>
                      <p className="mt-2 text-lg font-bold text-slate-900">{AGENCY_BANK_DETAILS.titulaire}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1.45fr,1fr]">
                      <div className="rounded-2xl border border-white/70 bg-white/85 p-4 backdrop-blur">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Landmark className="h-4 w-4" />
                          <p className="text-xs font-semibold uppercase tracking-[0.2em]">RIB / Compte</p>
                        </div>
                        <p className="mt-2 text-lg font-bold tracking-[0.08em] text-slate-900">{AGENCY_BANK_DETAILS.rib}</p>
                        <p className="mt-1 text-sm text-slate-500">{AGENCY_BANK_DETAILS.banque}</p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white/85 p-4 backdrop-blur">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Phone className="h-4 w-4" />
                          <p className="text-xs font-semibold uppercase tracking-[0.2em]">Confirmation</p>
                        </div>
                        <p className="mt-2 text-lg font-bold text-slate-900">{AGENCY_BANK_DETAILS.contacts.join(" / ")}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/85 p-4 backdrop-blur">
                      <div className="flex items-center gap-2 text-slate-500">
                        <MapPin className="h-4 w-4" />
                        <p className="text-xs font-semibold uppercase tracking-[0.2em]">Adresse agence</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{AGENCY_BANK_DETAILS.adresse}</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[24px] border border-sky-100 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-900">Envoyer mon recu de paiement</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {demand.status === "demande_recu_paiement"
                        ? "L'administration demande votre recu pour valider le paiement."
                        : demand.status === "recu_paiement_envoye"
                          ? "Recu deja envoye. Vous pouvez en renvoyer un autre si necessaire."
                          : "Apres votre virement, ajoutez votre justificatif pour verification."}
                    </p>
                    <div className="mt-4 space-y-3">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
                        className="w-full rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-sky-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                      />
                      <textarea
                        value={receiptNote}
                        onChange={(event) => setReceiptNote(event.target.value)}
                        rows={3}
                        placeholder="Note (optionnelle)"
                        className="w-full rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400"
                      />
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(event) => setPaymentReference(event.target.value)}
                        placeholder="N° quittance / ID virement"
                        className="w-full rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => void handleUploadReceipt()}
                        disabled={uploadingReceipt}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/10 transition hover:-translate-y-0.5 hover:bg-sky-700 disabled:opacity-60"
                      >
                        <Upload className="h-4 w-4" />
                        {uploadingReceipt ? "Envoi..." : "Uploader mon recu"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </div>

            {false && showClickToPayBlock ? (
              <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-5">
                <p className="text-sm font-semibold text-emerald-800">Paiement en ligne Click to Pay</p>
                <p className="mt-1 text-sm text-emerald-700">
                  Lancez le checkout Click to Pay. Au retour, la confirmation se fait automatiquement apres verification du statut.
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <CreditCard className="h-4 w-4" />
                    {CARD_PAYMENT_COMING_SOON_LABEL}
                  </button>
                </div>
              </div>
            ) : null}

            {false && showReceiptBlock ? (
              <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-5">
                <p className="text-sm font-semibold text-emerald-800">Envoyer mon recu de paiement</p>
                <p className="mt-1 text-sm text-emerald-700">
                  {demand.status === "demande_recu_paiement"
                    ? "L'administration demande votre recu pour valider le paiement."
                    : demand.status === "recu_paiement_envoye"
                      ? "Recu deja envoye. Vous pouvez en renvoyer un autre si necessaire."
                      : "Vous pouvez envoyer votre recu de paiement pour verification."}
                </p>
                <div className="mt-4 space-y-3">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
                    className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm"
                  />
                  <textarea
                    value={receiptNote}
                    onChange={(event) => setReceiptNote(event.target.value)}
                    rows={2}
                    placeholder="Note (optionnelle)"
                    className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    placeholder="N° quittance / ID virement"
                    className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleUploadReceipt()}
                    disabled={uploadingReceipt}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingReceipt ? "Envoi..." : "Uploader recu"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <ReceiptText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Resume de paiement</p>
                  <p className="text-xs text-gray-500">
                    {selectedMethod === "receipt" ? "Verification du recu en cours de traitement manuel." : "Paiement en ligne en attente de validation automatique."}
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <Line label="Reservation a regler" value={summary?.reservationPaid ? "Reglee" : formatMoney(summary?.reservationAmount)} />
                <Line label="Devis services" value={summary?.servicesPayable ? (summary?.servicesPaid ? "Regle" : formatMoney(summary?.servicesAmount)) : "Aucun"} />
                <Line label="Paiement combine" value={formatMoney((summary?.reservationPaid ? 0 : summary?.reservationAmount || 0) + (summary?.servicesPayable && !summary?.servicesPaid ? summary?.servicesAmount || 0 : 0))} strong />
              </div>
            </div>

            {demand.variable_services_quote?.length ? (
              <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Services devises</p>
                <div className="mt-4 space-y-3">
                  {demand.variable_services_quote.map((service) => (
                    <div key={`${demand.id}-${service.id}`} className="flex items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-900">{service.label}</p>
                        <p className="text-xs text-gray-500">{service.categorie || "Services client"}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{formatMoney((service as { prix_saisi?: number | null }).prix_saisi ?? service.prix ?? 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {(demand.payment_receipt_image_url || demand.payment_receipt_uploaded_at || demand.payment_receipt_note) ? (
              <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-6 text-sm text-sky-900 shadow-sm">
                <p className="font-semibold">Recu envoye</p>
                <p className="mt-2">Date: {demand.payment_receipt_uploaded_at ? formatDateTime(demand.payment_receipt_uploaded_at) : "-"}</p>
                {demand.payment_receipt_note ? <p className="mt-1">Note: {demand.payment_receipt_note}</p> : null}
                {demand.payment_receipt_image_url ? (
                  <a
                    href={resolveAssetUrl(demand.payment_receipt_image_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-white px-3 py-2 font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    Ouvrir le recu image
                  </a>
                ) : null}
              </div>
            ) : null}

            {demand.status === "succes_paiement" ? (
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800 shadow-sm">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="h-5 w-5" />
                  <p className="font-semibold">Demande entierement reglee</p>
                </div>
                <p className="mt-2">Vos reglements enregistres sont bien lies a cette demande.</p>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
      </div>
    </>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? "font-semibold text-gray-900" : "text-gray-700"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatusCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-gray-200 bg-gray-50 px-5 py-4">
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
    </div>
  );
}

function PaymentOptionCard({
  title,
  description,
  amount,
  accent,
  cta,
  busy,
  onClick,
}: {
  title: string;
  description: string;
  amount: number;
  accent: "emerald" | "sky" | "amber";
  cta: string;
  busy: boolean;
  onClick: () => void;
}) {
  const accentClass =
    accent === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : accent === "sky"
        ? "border-sky-200 bg-sky-50"
        : "border-amber-200 bg-amber-50";
  const buttonClass =
    accent === "emerald"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : accent === "sky"
        ? "bg-sky-600 hover:bg-sky-700"
        : "bg-amber-500 hover:bg-amber-600";

  return (
    <div className={`rounded-[24px] border px-5 py-5 ${accentClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-gray-900">{title}</p>
          <p className="mt-1 max-w-xl text-sm text-gray-600">{description}</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Montant</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{formatMoney(amount)}</p>
        </div>
      </div>
      <div className="mt-4">
        <button type="button" onClick={onClick} disabled={busy} className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 ${buttonClass}`}>
          <CreditCard className="h-4 w-4" />
          {busy ? "Traitement..." : cta}
        </button>
      </div>
    </div>
  );
}
