import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, BadgeCheck, ExternalLink, Hotel, ReceiptText, TimerReset, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import type { HotelReservationDemand } from "../services/hotels";
import { getSessionUser } from "../services/auth";
import { trackMetaEvent } from "../utils/metaConversions";
import CenterStatusPopup from "../components/CenterStatusPopup";

const API_URL = import.meta.env.VITE_API_URL || "/api";

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

export default function HotelReservationPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [demand, setDemand] = useState<HotelReservationDemand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptNote, setReceiptNote] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [startingFlouci, setStartingFlouci] = useState(false);
  const [confirmingFlouci, setConfirmingFlouci] = useState(false);
  const [startingClickToPay, setStartingClickToPay] = useState(false);
  const [confirmingClickToPay, setConfirmingClickToPay] = useState(false);
  const [centerSuccess, setCenterSuccess] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  });
  const [statusPopupShown, setStatusPopupShown] = useState(false);

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
      toast.error("Paiement Flouci annule ou echoue.");
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
          message: "Votre paiement Flouci a ete confirme avec succes.",
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
      toast.error(reason || "Paiement Click to Pay annule ou echoue.");
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
          title: "Paiement confirme",
          message: "Votre paiement Click to Pay a ete confirme avec succes.",
        });
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
    if (!demand || statusPopupShown) return;
    if (String(demand.status || "") === "voucher_en_cours" || String(demand.status || "") === "voucher_envoye") {
      setCenterSuccess({
        open: true,
        title: "Paiement termine",
        message: "Votre paiement est confirme. Votre voucher est en traitement.",
      });
      setStatusPopupShown(true);
    }
  }, [demand, statusPopupShown]);

  const canPayOnline = useMemo(
    () => Boolean(demand && !demand.reservation_payment_id && !["voucher_en_cours", "voucher_envoye"].includes(String(demand.status || ""))),
    [demand]
  );

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
      window.location.assign(checkoutUrl);
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
      window.location.assign(checkoutUrl);
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
      const formData = new FormData();
      formData.append("receipt", receiptFile);
      if (receiptNote.trim()) formData.append("payment_receipt_note", receiptNote.trim());
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
      setCenterSuccess({
        open: true,
        title: "Recu envoye",
        message: "L'admin va verifier avant validation du paiement.",
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

  return (
    <>
      <CenterStatusPopup
        open={centerSuccess.open}
        title={centerSuccess.title}
        message={centerSuccess.message}
        onClose={() => setCenterSuccess({ open: false, title: "", message: "" })}
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
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Paiement hotel</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Finaliser votre reservation hotel</h1>
            <p className="mt-2 text-sm text-gray-500">
              Votre demande est bien enregistree. Finalisez maintenant le paiement pour lancer le traitement du voucher.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoCard label="Hotel" value={demand.hotel_name} />
              <InfoCard label="Ville" value={demand.hotel_city_name || "-"} />
              <InfoCard label="Periode" value={`${demand.check_in} au ${demand.check_out}`} />
              <InfoCard label="Voyageurs" value={`${demand.adults} adulte(s)${Array.isArray(demand.child_ages) && demand.child_ages.length ? `, ${demand.child_ages.length} enfant(s)` : ""}`} />
              <InfoCard label="Montant a regler" value={formatMoney(demand.amount_due_now || demand.total_price, demand.currency || "TND")} />
              <InfoCard label="Statut" value={String(demand.status || "-")} />
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-5">
                <p className="text-sm font-semibold text-emerald-800">Paiement en ligne Flouci</p>
                <p className="mt-1 text-sm text-emerald-700">Lancez le checkout Flouci. Au retour, la confirmation se fait automatiquement.</p>
                <button
                  type="button"
                  disabled={!canPayOnline || startingFlouci || confirmingFlouci}
                  onClick={() => void handleStartFlouci()}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  {startingFlouci ? "Ouverture..." : "Payer avec Flouci"}
                </button>
              </div>

              <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-5 py-5">
                <p className="text-sm font-semibold text-sky-800">Paiement en ligne Click to Pay</p>
                <p className="mt-1 text-sm text-sky-700">Ouvrez la passerelle bancaire puis revenez automatiquement ici apres paiement.</p>
                <button
                  type="button"
                  disabled={!canPayOnline || startingClickToPay || confirmingClickToPay}
                  onClick={() => void handleStartClickToPay()}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  {startingClickToPay ? "Ouverture..." : "Payer avec Click to Pay"}
                </button>
              </div>

              <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-5">
                <p className="text-sm font-semibold text-amber-800">Virement bancaire</p>
                <p className="mt-1 text-sm text-amber-700">Envoyez votre recu pour verification manuelle par l'administration.</p>
                <div className="mt-4 space-y-3">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                  />
                  <textarea
                    value={receiptNote}
                    onChange={(event) => setReceiptNote(event.target.value)}
                    rows={2}
                    placeholder="Note (optionnelle)"
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleUploadReceipt()}
                    disabled={uploadingReceipt}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingReceipt ? "Envoi..." : "Uploader mon recu"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <Hotel className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Suivi de la demande</p>
                  <p className="text-xs text-gray-500">Le voucher apparait ici apres validation admin.</p>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <Line label="Paiement" value={demand.reservation_payment_id ? `Regle le ${formatDateTime(demand.reservation_payment_paid_at)}` : "En attente"} />
                <Line label="Recu virement" value={demand.payment_receipt_uploaded_at ? `Envoye le ${formatDateTime(demand.payment_receipt_uploaded_at)}` : "Non envoye"} />
                <Line label="Statut voucher" value={demand.status === "voucher_envoye" ? "Envoye" : demand.status === "voucher_en_cours" ? "En cours de traitement" : "En attente"} strong />
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
