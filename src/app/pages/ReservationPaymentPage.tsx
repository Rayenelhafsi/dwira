import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ArrowLeft, BadgeCheck, CreditCard, ReceiptText, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import type { ReservationDemand } from "../admin/types";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type PaymentScope = "reservation" | "services" | "combined";
type PaymentMethod = "carte" | "virement";

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

export default function ReservationPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [demand, setDemand] = useState<ReservationDemand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submittingScope, setSubmittingScope] = useState<PaymentScope | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("carte");

  const fetchDemand = useCallback(async () => {
    if (!id || !user?.email) return;
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (user.id) query.set("client_user_id", user.id);
      query.set("client_email", user.email);
      const response = await fetch(`${API_URL}/reservation-demands?${query.toString()}`);
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

  const handlePay = async (scope: PaymentScope) => {
    if (!demand) return;
    setSubmittingScope(scope);
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          methode: paymentMethod,
          actor_id: user?.id || user?.email || "client",
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Paiement impossible"));
      const updated = await response.json();
      setDemand(updated);
      toast.success(
        scope === "combined"
          ? "Paiement reservation + services enregistre."
          : scope === "services"
            ? "Paiement des services enregistre."
            : "Paiement de la reservation enregistre."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Paiement impossible");
    } finally {
      setSubmittingScope(null);
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Paiement client</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Finaliser votre demande</h1>
            <p className="mt-2 text-sm text-gray-500">
              Vous pouvez regler la reservation, le devis services, ou les deux ensemble selon votre preference.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoCard label="Demande" value={demand.bien_reference || demand.id} />
              <InfoCard label="Bien" value={demand.bien_titre || "Bien"} />
              <InfoCard label="Paiement reservation" value={summary?.reservationPaid ? `Regle le ${formatDateTime(demand.reservation_payment_paid_at)}` : formatMoney(summary?.reservationAmount)} />
              <InfoCard label="Paiement services" value={summary?.servicesPayable ? (summary?.servicesPaid ? `Regle le ${formatDateTime(demand.services_payment_paid_at)}` : formatMoney(summary?.servicesAmount)) : "Aucun devis a regler"} />
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold text-gray-900">Methode de paiement</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setPaymentMethod("carte")} className={`rounded-2xl border px-4 py-3 text-left ${paymentMethod === "carte" ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-700"}`}>
                  <p className="font-semibold">Carte / paiement en ligne</p>
                  <p className="mt-1 text-xs text-gray-500">Paiement rapide pour finaliser la demande.</p>
                </button>
                <button type="button" onClick={() => setPaymentMethod("virement")} className={`rounded-2xl border px-4 py-3 text-left ${paymentMethod === "virement" ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-700"}`}>
                  <p className="font-semibold">Virement</p>
                  <p className="mt-1 text-xs text-gray-500">Reglement bancaire suivi par l'agence.</p>
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {summary?.canPayCombined ? (
                <PaymentOptionCard
                  title="Payer reservation + services"
                  description="Une seule action pour regler l'avance ou la totalite de la reservation ainsi que le devis services."
                  amount={summary.reservationAmount + summary.servicesAmount}
                  accent="emerald"
                  cta="Payer les deux"
                  busy={submittingScope === "combined"}
                  onClick={() => void handlePay("combined")}
                />
              ) : null}

              {summary?.canPayReservation ? (
                <PaymentOptionCard
                  title="Payer la reservation seulement"
                  description="Le contrat de reservation avance sans attendre le paiement des services variables."
                  amount={summary.reservationAmount}
                  accent="sky"
                  cta="Payer reservation"
                  busy={submittingScope === "reservation"}
                  onClick={() => void handlePay("reservation")}
                />
              ) : (
                <StatusCard
                  title="Reservation deja reglee"
                  description={demand.reservation_payment_paid_at ? `Paiement confirme le ${formatDateTime(demand.reservation_payment_paid_at)}.` : "Aucun paiement reservation restant."}
                />
              )}

              {summary?.canPayServices ? (
                <PaymentOptionCard
                  title="Payer le devis services"
                  description="Le devis services payants peut etre regle independamment de la reservation."
                  amount={summary.servicesAmount}
                  accent="amber"
                  cta="Payer services"
                  busy={submittingScope === "services"}
                  onClick={() => void handlePay("services")}
                />
              ) : (
                <StatusCard
                  title={summary?.servicesPayable ? "Services deja regles" : "Pas de devis services a regler"}
                  description={
                    summary?.servicesPayable && demand.services_payment_paid_at
                      ? `Paiement confirme le ${formatDateTime(demand.services_payment_paid_at)}.`
                      : "Les services variables seront affiches ici seulement quand un devis sera disponible."
                  }
                />
              )}
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
                  <p className="text-xs text-gray-500">Choisissez le mode qui vous convient.</p>
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
