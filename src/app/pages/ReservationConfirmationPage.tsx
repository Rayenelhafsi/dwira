import { useMemo, useState, type ReactNode } from "react";
import { Navigate, Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Calendar, CheckCircle2, Home, ImageIcon, ShoppingBag, Users } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { useProperties } from "../context/PropertiesContext";
import { useAuth } from "../context/AuthContext";
import type { ReservationDemand } from "../admin/types";
import { saveReservationToCache } from "../utils/reservations";
import { clearPendingReservationDraft, readPendingReservationDraft, savePendingReservationDraft, type PendingReservationDraft } from "../utils/pendingReservation";

type LocationState = {
  draft?: PendingReservationDraft;
};

export default function ReservationConfirmationPage() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { properties, refreshData } = useProperties();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdDemand, setCreatedDemand] = useState<{ id: string } | null>(null);

  const draftFromState = (location.state as LocationState | null)?.draft || null;
  const draftFromStorage = useMemo(() => readPendingReservationDraft(), []);
  const draft = draftFromState || draftFromStorage || null;
  const property = properties.find((item) => item.slug === slug);
  const requestType = draft?.requestType === 'visite' ? 'visite' : 'reservation';
  const isVisitRequest = requestType === 'visite';
  const seasonalConfig = property?.seasonalConfig;
  const maxGuests = Math.max(1, seasonalConfig?.limitePersonnesNuit || property?.guests || 1);
  const hasCleaningFee = !isVisitRequest
    && (seasonalConfig?.fraisMenageDisponible !== false)
    && Number(property?.cleaningFee || 0) > 0;
  const hasServiceFee = !isVisitRequest
    && (seasonalConfig?.fraisServiceDisponible !== false)
    && Number(property?.serviceFee || 0) > 0;
  const activePaidServices = useMemo(
    () => (seasonalConfig?.servicesPayants || []).filter((service) => service.enabled !== false && Number(service.prix || 0) > 0 && String(service.label || '').trim().length > 0),
    [seasonalConfig?.servicesPayants]
  );
  const extraMattressPrice = Math.max(0, Number(seasonalConfig?.matelasSupplementairePrix || 0));
  const extraMattressMax = Math.max(0, Number(seasonalConfig?.matelasSupplementairesMax || 0));

  const summary = useMemo(() => {
    if (!property || !draft) return null;
    const start = new Date(draft.startDate);
    const end = new Date(draft.endDate);
    const nights = Math.max(0, Math.abs(differenceInDays(end, start)));
    const accommodationTotal = property.pricePerNight * nights;
    const cleaningFee = hasCleaningFee && draft.includeCleaningFee ? (property.cleaningFee || 0) : 0;
    const serviceFee = hasServiceFee && draft.includeServiceFee ? (property.serviceFee || 0) : 0;
    const extraMattresses = Math.min(extraMattressMax, Math.max(0, Number(draft.extraMattresses || 0)));
    const extraMattressTotal = extraMattresses * extraMattressPrice;
    const paidServices = activePaidServices.filter((service) => (draft.selectedPaidServiceIds || []).includes(service.id));
    const paidServicesTotal = paidServices.reduce((sum, service) => sum + Number(service.prix || 0), 0);
    const productsAccueilFee = seasonalConfig?.produitsAccueilGratuits === false
      ? Number(seasonalConfig?.fraisProduitsAccueil || 0)
      : 0;
    const extrasTotal = cleaningFee + serviceFee + extraMattressTotal + paidServicesTotal + productsAccueilFee;
    const total = accommodationTotal + extrasTotal;
    const advancePercent = Number(seasonalConfig?.avancePourcentage || 30);
    const dueNow = draft.paymentMode === 'totalite' ? total : Math.round((total * advancePercent) / 100);
    const guests = Math.min(maxGuests, Math.max(1, Number(draft.guests || 1)));
    return {
      guests,
      nights,
      accommodationTotal,
      cleaningFee,
      serviceFee,
      extraMattresses,
      extraMattressTotal,
      paidServicesTotal,
      productsAccueilFee,
      extrasTotal,
      total,
      dueNow,
      paymentMode: draft.paymentMode === 'totalite' ? 'totalite' : 'avance',
      advancePercent,
    };
  }, [activePaidServices, draft, extraMattressMax, extraMattressPrice, hasCleaningFee, hasServiceFee, maxGuests, property, seasonalConfig]);

  if (!user || user.role !== "user") {
    const returnTo = slug ? `/reservation/confirmation/${slug}` : "/logements";
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (!property || !draft || draft.propertySlug !== slug) {
    return <Navigate to={property ? `/properties/${property.slug}` : "/logements"} replace />;
  }

  const handleEditReservation = () => {
    savePendingReservationDraft(draft);
    const propertyPath = property.detailPath || `/properties/${property.slug}`;
    navigate(propertyPath, {
      state: { draft, restoreDraft: true },
    });
  };

  const handleConfirm = async () => {
    if (!property || !summary) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/reservation-demands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bien_id: String(property.id),
          client_user_id: user.id,
          client_email: user.email,
          client_name: user.name,
          start_date: draft.startDate,
          end_date: draft.endDate,
            guests: summary?.guests || Math.min(maxGuests, Math.max(1, Number(draft.guests || 1))),
            client_note: draft.reservationNote || null,
            request_type: requestType,
          }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.error || "Impossible de confirmer la demande"));
      saveReservationToCache(data);
      clearPendingReservationDraft();
      setCreatedDemand({ id: data.id });
      await refreshData();
      toast.success(isVisitRequest ? "Votre demande de visite est maintenant en attente." : "Votre demande est maintenant en attente.");
    } catch (error) {
      const fallbackId = `local_${Date.now()}`;
      const fallbackReservation: ReservationDemand = {
        id: fallbackId,
        bien_id: String(property.id),
        request_type: requestType,
        unavailable_date_id: null,
        client_user_id: user.id || null,
        client_email: user.email || null,
        client_name: user.name || null,
        proprietaire_id: property.proprietaire_id || null,
        owner_user_id: null,
        start_date: draft.startDate,
        end_date: draft.endDate,
        guests: summary?.guests || Math.min(maxGuests, Math.max(1, Number(draft.guests || 1))),
        status: "en_attente_reponse_proprietaire",
        owner_notified_at: null,
        owner_response_at: null,
        admin_note: "Sauvegarde locale en attente de synchronisation API",
        client_note: draft.reservationNote || null,
        finalization_due_at: null,
        contract_id: null,
        payment_id: null,
        bien_titre: property.title,
        bien_reference: property.reference || property.id,
        proprietaire_nom: null,
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };
      saveReservationToCache(fallbackReservation);
      clearPendingReservationDraft();
      setCreatedDemand({ id: fallbackId });
      toast.error(error instanceof Error ? `${error.message}. Demande sauvegardee localement.` : "API indisponible. Demande sauvegardee localement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (createdDemand) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbf9_0%,#ffffff_55%)] pt-28 pb-20">
        <div className="container mx-auto max-w-4xl px-4 md:px-6">
          <div className="overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
            <div className="bg-emerald-950 px-6 py-8 text-white md:px-10">
              <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-amber-300" />
                {isVisitRequest ? 'Visite en attente' : 'Demande en attente'}
              </div>
              <h1 className="mt-4 text-3xl font-bold">{isVisitRequest ? 'Votre demande de visite est en attente' : 'Votre demande de reservation est en attente'}</h1>
              <p className="mt-2 text-sm text-emerald-100/80">
                Merci d&apos;attendre notre retour. Identifiant de demande: <span className="font-semibold text-white">{createdDemand.id}</span>
              </p>
            </div>

            <div className="grid gap-8 px-6 py-8 md:grid-cols-[1.1fr,0.9fr] md:px-10">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-emerald-700">Resume du bien</p>
                <div className="mt-4 overflow-hidden rounded-3xl border border-gray-100">
                  {property.images[0] ? (
                    <img src={property.images[0]} alt={property.title} className="h-64 w-full object-cover" />
                  ) : (
                    <div className="flex h-64 items-center justify-center bg-gray-100 text-gray-400">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">{property.reference || property.id}</p>
                  <h2 className="mt-2 text-2xl font-bold text-gray-900">{property.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">{property.location}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {property.amenities.slice(0, 6).map((amenity) => (
                      <span key={amenity} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-emerald-700">{isVisitRequest ? 'Details visite' : 'Details reservation'}</p>
                <div className="mt-5 space-y-4 text-sm text-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Reference bien</span>
                    <span className="font-semibold text-gray-900">{property.reference || property.id}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{isVisitRequest ? 'Creneau souhaite' : 'Periode'}</span>
                    <span className="font-semibold text-gray-900">{format(new Date(draft.startDate), "dd/MM/yyyy")} au {format(new Date(draft.endDate), "dd/MM/yyyy")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{isVisitRequest ? 'Visiteurs' : 'Nuits'}</span>
                    <span className="font-semibold text-gray-900">{isVisitRequest ? summary?.guests || draft.guests : summary?.nights}</span>
                  </div>
                  {!isVisitRequest && <div className="flex items-center justify-between gap-3">
                    <span>Voyageurs</span>
                    <span className="font-semibold text-gray-900">{summary?.guests || draft.guests}</span>
                  </div>}
                  {!isVisitRequest && <div className="flex items-center justify-between gap-3">
                    <span>Hebergement</span>
                    <span className="font-semibold text-gray-900">{summary?.accommodationTotal} TND</span>
                  </div>}
                  {!isVisitRequest && summary?.cleaningFee ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>Frais de menage</span>
                      <span className="font-semibold text-gray-900">{summary.cleaningFee} TND</span>
                    </div>
                  ) : null}
                  {!isVisitRequest && summary?.serviceFee ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>Frais de service</span>
                      <span className="font-semibold text-gray-900">{summary.serviceFee} TND</span>
                    </div>
                  ) : null}
                  {!isVisitRequest && summary?.extraMattressTotal ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>Matelas supplementaires</span>
                      <span className="font-semibold text-gray-900">{summary.extraMattressTotal} TND</span>
                    </div>
                  ) : null}
                  {!isVisitRequest && summary?.paidServicesTotal ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>Services payants</span>
                      <span className="font-semibold text-gray-900">{summary.paidServicesTotal} TND</span>
                    </div>
                  ) : null}
                  {!isVisitRequest && summary?.productsAccueilFee ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>Produits d'accueil</span>
                      <span className="font-semibold text-gray-900">{summary.productsAccueilFee} TND</span>
                    </div>
                  ) : null}
                  {!isVisitRequest && (
                    <div className="flex items-center justify-between gap-3">
                      <span>Total frais supplementaires</span>
                      <span className="font-semibold text-gray-900">{summary?.extrasTotal || 0} TND</span>
                    </div>
                  )}
                  {!isVisitRequest && <div className="border-t border-emerald-100 pt-4">
                    <div className="flex items-center justify-between gap-3 text-base">
                      <span className="font-semibold text-gray-900">Montant total</span>
                      <span className="text-xl font-bold text-emerald-700">{summary?.total} TND</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-600">A payer maintenant</span>
                    <span className="font-semibold text-gray-900">{summary?.dueNow} TND ({summary?.paymentMode === 'totalite' ? 'Totalite' : `Avance ${summary?.advancePercent || 30}%`})</span>
                  </div>
                </div>}
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    <Home className="h-4 w-4" />
                    Retour accueil
                  </Link>
                  <Link
                    to="/mes-reservations"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Voir mes demandes
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d9f5e9_0%,#f8fbfa_42%,#ffffff_100%)] pt-28 pb-20">
      <div className="container mx-auto max-w-6xl px-4 md:px-6">
        <div className="mb-6">
          <button
            type="button"
            onClick={handleEditReservation}
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft className="h-4 w-4" />
            {isVisitRequest ? 'Modifier ma demande' : 'Modifier ma reservation'}
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="overflow-hidden rounded-[30px] border border-white/80 bg-white/95 shadow-[0_25px_90px_rgba(15,23,42,0.10)] backdrop-blur">
            <div className="grid gap-6 p-6 md:grid-cols-[0.9fr,1.1fr] md:p-8">
              <div className="overflow-hidden rounded-[26px] bg-gray-100">
                {property.images[0] ? (
                  <img src={property.images[0]} alt={property.title} className="h-full min-h-[320px] w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[320px] items-center justify-center text-gray-400">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Verification finale</p>
                <h1 className="mt-3 text-3xl font-bold text-gray-900">{isVisitRequest ? 'Confirmez votre demande de visite' : 'Confirmez votre demande de reservation'}</h1>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {isVisitRequest
                    ? "Relisez les details ci-dessous. Une fois confirmee, votre demande de visite passera en attente de validation proprietaire."
                    : "Relisez les details ci-dessous. Une fois confirmee, votre demande passera en attente de validation et la periode sera marquee en orange dans le calendrier."}
                </p>

                <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5">
                  <div className="flex items-center gap-3 text-emerald-900">
                    <Calendar className="h-5 w-5" />
                    <div>
                      <p className="text-sm font-semibold">{property.title}</p>
                      <p className="text-xs text-emerald-800/70">{property.location}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <SummaryItem label="Reference" value={property.reference || property.id} />
                    <SummaryItem label="Categorie" value={property.category} />
                    <SummaryItem label={isVisitRequest ? "Date souhaitee" : "Arrivee"} value={format(new Date(draft.startDate), "dd/MM/yyyy")} />
                    <SummaryItem label={isVisitRequest ? "Date alternative" : "Depart"} value={format(new Date(draft.endDate), "dd/MM/yyyy")} />
                    <SummaryItem label={isVisitRequest ? "Visiteurs" : "Voyageurs"} value={`${summary?.guests || draft.guests}`} icon={<Users className="h-4 w-4" />} />
                    <SummaryItem label={isVisitRequest ? "Type demande" : "Nuits"} value={isVisitRequest ? "Visite de bien" : `${summary?.nights || 0}`} />
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-semibold text-gray-900">Caracteristiques resumees</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {property.amenities.slice(0, 8).map((amenity) => (
                      <span key={amenity} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-emerald-100 bg-white p-6 shadow-[0_25px_90px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">{isVisitRequest ? 'Synthese demande' : 'Montants'}</p>
            {isVisitRequest ? (
              <div className="mt-6 space-y-4 text-sm text-gray-700">
                <Line label="Bien" value={property.reference || property.id} />
                <Line label="Statut initial" value="En attente de reponse proprietaire" />
                <Line label="Type" value="Planification de visite" strong />
              </div>
            ) : (
              <div className="mt-6 space-y-4 text-sm text-gray-700">
                <Line label={`${property.pricePerNight} TND x ${summary?.nights || 0} nuits`} value={`${summary?.accommodationTotal || 0} TND`} />
                {summary?.cleaningFee ? <Line label="Frais de menage" value={`${summary.cleaningFee} TND`} /> : null}
                {summary?.serviceFee ? <Line label="Frais de service" value={`${summary.serviceFee} TND`} /> : null}
                {summary?.extraMattressTotal ? <Line label="Matelas supplementaires" value={`${summary.extraMattressTotal} TND`} /> : null}
                {summary?.paidServicesTotal ? <Line label="Services payants" value={`${summary.paidServicesTotal} TND`} /> : null}
                {summary?.productsAccueilFee ? <Line label="Produits d'accueil" value={`${summary.productsAccueilFee} TND`} /> : null}
                <Line label="Total frais supplementaires" value={`${summary?.extrasTotal || 0} TND`} />
                <div className="border-t border-gray-100 pt-4">
                  <Line label="Montant total" value={`${summary?.total || 0} TND`} strong />
                  <Line label="A payer maintenant" value={`${summary?.dueNow || 0} TND (${summary?.paymentMode === 'totalite' ? 'Totalite' : `Avance ${summary?.advancePercent || 30}%`})`} />
                </div>
              </div>
            )}

            {draft.reservationNote ? (
              <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">Votre note</p>
                <p className="mt-1 whitespace-pre-line">{draft.reservationNote}</p>
              </div>
            ) : null}

            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? "Confirmation..." : (isVisitRequest ? "Confirmer la visite" : "Confirmer la reservation")}
              </button>
              <button
                type="button"
                onClick={handleEditReservation}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                <ArrowLeft className="h-4 w-4" />
                {isVisitRequest ? 'Modifier la demande' : 'Modifier la reservation'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{label}</p>
      <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "text-base font-semibold text-gray-900" : ""}`}>
      <span>{label}</span>
      <span className={strong ? "text-emerald-700" : "font-medium text-gray-900"}>{value}</span>
    </div>
  );
}
