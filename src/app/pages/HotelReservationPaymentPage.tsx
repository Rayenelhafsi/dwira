import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, BadgeCheck, CreditCard, Landmark, MapPin, Phone, ReceiptText, TimerReset, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import type { HotelReservationDemand } from "../services/hotels";
import { getSessionUser } from "../services/auth";
import { trackMetaEvent } from "../utils/metaConversions";
import CenterStatusPopup from "../components/CenterStatusPopup";

const API_URL = import.meta.env.VITE_API_URL || "/api";

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

function formatMoney(value?: number | null, currency = "TND") {
  return `${Number(value || 0).toLocaleString("fr-FR")} ${currency}`;
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

export default function HotelReservationPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [demand, setDemand] = useState<HotelReservationDemand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptNote, setReceiptNote] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [startingFlouci, setStartingFlouci] = useState(false);
  const [confirmingFlouci, setConfirmingFlouci] = useState(false);
  const [startingClickToPay, setStartingClickToPay] = useState(false);
  const [confirmingClickToPay, setConfirmingClickToPay] = useState(false);
  const [redirectHomeAfterSuccess, setRedirectHomeAfterSuccess] = useState(false);
  const [centerSuccess, setCenterSuccess] = useState<{ open: boolean; title: string; message: string; tone?: "success" | "error" }>({
    open: false,
    title: "",
    message: "",
  });
  const [statusPopupShown, setStatusPopupShown] = useState(false);
  const selectedMethod = useMemo(() => normalizePaymentMethodParam(searchParams.get("method")), [searchParams]);

  const fetchDemand = useCallback(async () => {
    if (!id || !user?.email) return;
    setIsLoading(true);
    try {
      const sessionUser = await getSessionUser();
      if (!sessionUser) {
        setDemand(null);
        return;
      }
      const response = await fetch(`${API_URL}/hotel-reservation-demands`, { credentials: "include" });
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(String(rows?.error || "Impossible de charger la demande hotel"));
      const found = (Array.isArray(rows) ? rows : []).find((row) => String(row.id) === String(id)) || null;
      setDemand(found);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de charger la demande hotel");
      setDemand(null);
    } finally {
      setIsLoading(false);
    }
  }, [id, user?.email]);

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
      setCenterSuccess({
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
      setSearchParams(next, { replace: true });
      return;
    }
    if (!paymentId) return;
    setConfirmingFlouci(true);
    (async () => {
      try {
        const response = await fetch(`${API_URL}/hotel-reservation-demands/${encodeURIComponent(demand.id)}/flouci/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ payment_id: paymentId }),
        });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, "Confirmation Flouci impossible"));
        const updated = await response.json();
        setDemand(updated);
        await trackMetaEvent({
          eventName: "Purchase",
          customData: {
            content_name: demand.hotel_name || "Reservation hotel",
            content_ids: [String(demand.hotel_id || demand.id)],
            value: Number(demand.amount_due_now || demand.total_amount || 0),
            currency: String(demand.currency || "TND"),
            payment_method: "flouci",
          },
          userData: {
            email: user?.email,
            externalId: user?.authProvider === 'facebook'
              ? String(user?.providerUserId || user?.id || '')
              : String(user?.id || ''),
          },
        });
        setCenterSuccess({
          open: true,
          title: "Paiement confirme",
          message: "Votre paiement Flouci a été confirmé avec succès.",
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Confirmation Flouci impossible");
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("flouci_payment_id");
        next.delete("flouci_flow");
        setSearchParams(next, { replace: true });
        setConfirmingFlouci(false);
      }
    })();
  }, [confirmingFlouci, demand?.id, searchParams, setSearchParams]);

  useEffect(() => {
    if (!demand?.id || confirmingClickToPay) return;
    const payment = String(searchParams.get("payment") || "").trim().toLowerCase();
    const hotelDemandId = String(searchParams.get("hotel_demand_id") || "").trim();
    if (!payment || !hotelDemandId || hotelDemandId !== demand.id) return;
    if (payment === "failed") {
      const reason = String(searchParams.get("reason") || "").trim();
      setCenterSuccess({
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
      next.delete("hotel_demand_id");
      setSearchParams(next, { replace: true });
      return;
    }
    if (payment !== "success") return;
    setConfirmingClickToPay(true);
    (async () => {
      try {
        const response = await fetch(`${API_URL}/hotel-reservation-demands/${encodeURIComponent(demand.id)}/clicktopay/confirm`, {
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
            content_name: demand.hotel_name || "Reservation hotel",
            content_ids: [String(demand.hotel_id || demand.id)],
            value: Number(demand.amount_due_now || demand.total_amount || 0),
            currency: String(demand.currency || "TND"),
            payment_method: "clicktopay",
          },
          userData: {
            email: user?.email,
            externalId: user?.authProvider === 'facebook'
              ? String(user?.providerUserId || user?.id || '')
              : String(user?.id || ''),
          },
        });
        setCenterSuccess({
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
        next.delete("hotel_demand_id");
        setSearchParams(next, { replace: true });
        setConfirmingClickToPay(false);
      }
    })();
  }, [confirmingClickToPay, demand?.id, searchParams, setSearchParams]);

  useEffect(() => {
    if (!redirectHomeAfterSuccess || !centerSuccess.open || centerSuccess.tone === "error") return;
    const timeoutId = window.setTimeout(() => {
      navigate("/", { replace: true });
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [centerSuccess.open, navigate, redirectHomeAfterSuccess]);

  useEffect(() => {
    if (!demand || statusPopupShown || redirectHomeAfterSuccess) return;
    if (String(demand.status || "") === "voucher_en_cours" || String(demand.status || "") === "voucher_envoye") {
      setCenterSuccess({
        open: true,
        title: "Paiement terminé",
        message: "Votre paiement est confirmé. Votre voucher est en traitement.",
      });
      setStatusPopupShown(true);
    }
  }, [demand, redirectHomeAfterSuccess, statusPopupShown]);

  const canPayOnline = useMemo(
    () => Boolean(demand && !demand.reservation_payment_id && !["voucher_en_cours", "voucher_envoye"].includes(String(demand.status || ""))),
    [demand]
  );
  const isFlouciActionable = canPayOnline && !startingFlouci && !confirmingFlouci;
  const isClickToPayActionable = canPayOnline && !startingClickToPay && !confirmingClickToPay;
  const showClickToPayBlock = selectedMethod !== "receipt";
  const showReceiptBlock = selectedMethod !== "clicktopay";
  const visiblePaymentCardsCount = Number(showClickToPayBlock) + Number(showReceiptBlock);

  const handleStartFlouci = async () => {
    if (!demand) return;
    setStartingFlouci(true);
    try {
      await trackMetaEvent({
        eventName: "InitiateCheckout",
        customData: {
          content_name: demand.hotel_name || "Reservation hotel",
          content_ids: [String(demand.hotel_id || demand.id)],
          value: Number(demand.amount_due_now || demand.total_amount || 0),
          currency: String(demand.currency || "TND"),
          payment_method: "flouci",
        },
        userData: {
          email: user?.email,
          phone: user?.telephone || undefined,
          externalId: String(user?.providerUserId || user?.id || ""),
        },
      });
      const response = await fetch(`${API_URL}/hotel-reservation-demands/${encodeURIComponent(demand.id)}/flouci/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Creation session Flouci impossible"));
      const payload = await response.json();
      const checkoutUrl = String(payload?.checkout_url || "").trim();
      if (!checkoutUrl) throw new Error("Lien checkout Flouci manquant");
      openExternalCheckout(checkoutUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation session Flouci impossible");
    } finally {
      setStartingFlouci(false);
    }
  };

  const handleStartClickToPay = async () => {
    if (!demand) return;
    setStartingClickToPay(true);
    try {
      await trackMetaEvent({
        eventName: "InitiateCheckout",
        customData: {
          content_name: demand.hotel_name || "Reservation hotel",
          content_ids: [String(demand.hotel_id || demand.id)],
          value: Number(demand.amount_due_now || demand.total_amount || 0),
          currency: String(demand.currency || "TND"),
          payment_method: "clicktopay",
        },
        userData: {
          email: user?.email,
          phone: user?.telephone || undefined,
          externalId: String(user?.providerUserId || user?.id || ""),
        },
      });
      const response = await fetch(`${API_URL}/hotel-reservation-demands/${encodeURIComponent(demand.id)}/clicktopay/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Creation session Click to Pay impossible"));
      const payload = await response.json();
      const checkoutUrl = String(payload?.checkout_url || "").trim();
      if (!checkoutUrl) throw new Error("Lien checkout Click to Pay manquant");
      openExternalCheckout(checkoutUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation session Click to Pay impossible");
    } finally {
      setStartingClickToPay(false);
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
          content_name: demand.hotel_name || "Reservation hotel",
          content_ids: [String(demand.hotel_id || demand.id)],
          value: Number(demand.amount_due_now || demand.total_amount || 0),
          currency: String(demand.currency || "TND"),
          payment_method: "receipt",
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
      if (paymentReference.trim()) formData.append("payment_reference", paymentReference.trim());
      const response = await fetch(`${API_URL}/hotel-reservation-demands/${encodeURIComponent(demand.id)}/upload-payment-receipt`, {
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
      setCenterSuccess({
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
            <p className="text-gray-700">Demande hotel introuvable.</p>
            <Link to="/mes-reservations" className="mt-4 inline-flex rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Retour a mes demandes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedMethod) {
    return (
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

          <section className="mt-6 rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Paiement hotel</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Choisir votre mode de paiement</h1>
            <p className="mt-2 text-sm text-gray-500">
              Selectionnez une option pour ouvrir sa page dediee.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoCard label="Hotel" value={demand.hotel_name} />
              <InfoCard label="Ville" value={demand.hotel_city_name || "-"} />
              <InfoCard label="Periode" value={`${demand.check_in} au ${demand.check_out}`} />
              <InfoCard label="Montant a regler" value={formatMoney(demand.amount_due_now || demand.total_price, demand.currency || "TND")} />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <button
                type="button"
                onClick={() => setSearchParams({ method: "clicktopay" })}
                className="group rounded-[28px] bg-[linear-gradient(135deg,#0b7a58_0%,#169b67_56%,#34d399_100%)] p-6 text-left text-white shadow-[0_24px_80px_-32px_rgba(5,150,105,0.85)] transition hover:-translate-y-1"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur">
                  <CreditCard className="h-6 w-6" />
                </div>
                <p className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-white/80">Carte bancaire</p>
                <h2 className="mt-2 text-2xl font-bold">Paiement en ligne</h2>
                <p className="mt-3 text-sm leading-6 text-emerald-50">
                  Ouvrir la page dediee au paiement securise Click to Pay.
                </p>
                <span className="mt-6 inline-flex rounded-full bg-white px-5 py-2 text-sm font-semibold text-emerald-800">
                  Continuer
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSearchParams({ method: "receipt" })}
                className="group rounded-[28px] border border-sky-200 bg-[linear-gradient(180deg,#eff9ff_0%,#f8fdff_100%)] p-6 text-left shadow-[0_24px_80px_-40px_rgba(14,116,144,0.45)] transition hover:-translate-y-1"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-sky-800">Virement et recu</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">Envoyer un justificatif</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Ouvrir la page dediee au virement bancaire et a l'envoi du recu.
                </p>
                <span className="mt-6 inline-flex rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white">
                  Continuer
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <>
      <CenterStatusPopup
        open={centerSuccess.open}
        title={centerSuccess.title}
        message={centerSuccess.message}
        tone={centerSuccess.tone || "success"}
        onClose={() => {
          setCenterSuccess({ open: false, title: "", message: "" });
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
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Finaliser votre reservation hotel</h1>
            <p className="mt-2 text-sm text-gray-500">
              {selectedMethod === "receipt"
                ? "Envoyez votre recu pour verification manuelle par l'administration."
                : "Lancez le paiement en ligne puis revenez automatiquement sur votre dossier apres verification."}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoCard label="Hotel" value={demand.hotel_name} />
              <InfoCard label="Ville" value={demand.hotel_city_name || "-"} />
              <InfoCard label="Periode" value={`${demand.check_in} au ${demand.check_out}`} />
              <InfoCard label="Voyageurs" value={`${demand.adults} adulte(s)${Array.isArray(demand.child_ages) && demand.child_ages.length ? `, ${demand.child_ages.length} enfant(s)` : ""}`} />
              <InfoCard label="Montant a regler" value={formatMoney(demand.amount_due_now || demand.total_price, demand.currency || "TND")} />
              <InfoCard label="Statut" value={String(demand.status || "-")} />
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
                          disabled={!isClickToPayActionable}
                          onClick={() => {
                            void handleStartClickToPay();
                          }}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-emerald-800 shadow-lg shadow-emerald-950/10 transition hover:-translate-y-0.5 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-[260px]"
                        >
                          <CreditCard className="h-4 w-4" />
                          {startingClickToPay ? "Ouverture..." : confirmingClickToPay ? "Verification..." : "Payer avec Click to Pay"}
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
                <Line label="Hotel a regler" value={demand.reservation_payment_id ? "Regle" : formatMoney(demand.amount_due_now || demand.total_price, demand.currency || "TND")} />
                <Line label="Recu virement" value={demand.payment_receipt_uploaded_at ? `Envoye le ${formatDateTime(demand.payment_receipt_uploaded_at)}` : "Non envoye"} />
                <Line label="Paiement total" value={formatMoney(demand.amount_due_now || demand.total_price, demand.currency || "TND")} strong />
              </div>
            </div>

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

            {demand.status === "voucher_en_cours" ? (
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800 shadow-sm">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="h-5 w-5" />
                  <p className="font-semibold">Paiement valide</p>
                </div>
                <p className="mt-2">Votre voucher est en cours de traitement par l'administration.</p>
              </div>
            ) : null}

            {demand.voucher_url ? (
              <div className="rounded-[28px] border border-indigo-200 bg-indigo-50 p-6 text-sm text-indigo-900 shadow-sm">
                <div className="flex items-center gap-3">
                  <ReceiptText className="h-5 w-5" />
                  <p className="font-semibold">Voucher disponible</p>
                </div>
                <p className="mt-2">Numero: {demand.voucher_number || "-"}</p>
                <p className="mt-1">Identifiant hotel: {demand.voucher_id || "-"}</p>
                <a
                  href={resolveAssetUrl(demand.voucher_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-3 py-2 font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Consulter mon voucher
                </a>
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
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={strong ? "font-semibold text-gray-900" : "text-gray-900"}>{value}</span>
    </div>
  );
}
