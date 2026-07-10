import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useProperties } from '../context/PropertiesContext';
import { buildPropertyPackPath, getPackVariantParamValue } from '../utils/propertyPacks';
import { clearPendingReservationDraft, readPendingReservationDraft, savePendingReservationDraft, type PendingReservationDraft } from '../utils/pendingReservation';
import type { PropertyPack } from '../admin/types';
import { calculateAccommodationPricing } from '../utils/seasonalPricing';
import { formatTnd } from '../utils/amicalePricing';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type LocationState = {
  draft?: PendingReservationDraft;
};

export default function PackReservationConfirmationPage() {
  const { packId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const { properties } = useProperties();
  const [packs, setPacks] = useState<PropertyPack[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const draft = ((location.state as LocationState | null)?.draft || readPendingReservationDraft()) as PendingReservationDraft | null;

  useEffect(() => {
    if (packs !== null) return;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/property-packs`);
        const data = await response.json().catch(() => []);
        setPacks(Array.isArray(data) ? data : []);
      } catch {
        setPacks([]);
      }
    })();
  }, [packs]);

  const pack = useMemo(
    () => (packs || []).find((entry) => String(entry.id || '').trim() === String(packId || '').trim()) || null,
    [packId, packs]
  );
  const selectedProperties = useMemo(() => {
    const ids = new Set((draft?.groupSelectedBienIds || []).map((value) => String(value || '').trim()).filter(Boolean));
    return properties.filter((property) => ids.has(String(property.id || '').trim()));
  }, [draft?.groupSelectedBienIds, properties]);
  const summary = useMemo(() => {
    if (!draft) return null;
    return selectedProperties.reduce((acc, property) => {
      const pricing = calculateAccommodationPricing({
        startDate: draft.startDate,
        endDate: draft.endDate,
        defaultNightlyPrice: property.pricePerNight,
        defaultWeeklyPrice: property.pricePerWeek,
        pricingPeriods: property.pricingPeriods,
      });
      const accommodationTotal = pricing.accommodationTotal;
      const extrasTotal = Number(property.cleaningFee || 0) + Number(property.serviceFee || 0);
      const propertyTotal = accommodationTotal + extrasTotal;
      const advancePercentRaw = Number(property.seasonalConfig?.avancePourcentage ?? 30);
      const advancePercent = Number.isFinite(advancePercentRaw) && advancePercentRaw > 0 ? advancePercentRaw : 30;
      const propertyDueNow = draft.paymentMode === 'totalite'
        ? propertyTotal
        : Math.round(((propertyTotal * advancePercent) / 100) * 100) / 100;
      return {
        nights: Math.max(acc.nights, pricing.nights),
        total: acc.total + propertyTotal,
        dueNow: acc.dueNow + propertyDueNow,
        paymentMode: draft.paymentMode === 'totalite' ? 'totalite' : 'avance',
      };
    }, { nights: 0, total: 0, dueNow: 0, paymentMode: draft.paymentMode === 'totalite' ? 'totalite' : 'avance' });
  }, [draft, selectedProperties]);

  if (isLoading) {
    return <div className="min-h-screen pt-28 text-center text-sm text-slate-500">Chargement...</div>;
  }
  if (!user || user.role !== 'user') {
    const returnTo = packId ? `/reservation/packs/confirmation/${packId}` : '/packs';
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (!draft || !['pack', 'group'].includes(String(draft.targetType || '')) || !pack || selectedProperties.length === 0) {
    return <Navigate to={pack ? buildPropertyPackPath(pack) : '/packs'} replace />;
  }

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/reservation-demands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bien_id: selectedProperties[0]?.id,
          client_user_id: user.id,
          client_email: user.email,
          client_name: user.name,
          start_date: draft.startDate,
          end_date: draft.endDate,
          guests: draft.guests,
          adult_guests: draft.adultGuests || draft.guests,
          child_guests: draft.childGuests || 0,
          payment_mode: summary?.paymentMode || 'avance',
          total_amount: summary?.total || 0,
          amount_due_now: summary?.dueNow || 0,
          client_note: draft.groupLabel || `groupe : ${(draft.groupSelectedBienRefs || []).join(', ')}` || `Pack ${pack.name}`,
          group_reservation: {
            group_id: draft.groupId || pack.id,
            group_label: draft.groupLabel || `groupe : ${(draft.groupSelectedBienRefs || []).join(', ')}`,
            selected_bien_ids: draft.groupSelectedBienIds || [],
          },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.error || 'Impossible de confirmer la demande groupe'));
      clearPendingReservationDraft();
      toast.success('Demande groupe envoyee');
      navigate('/mes-reservations', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Demande impossible');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffef9_0%,#ffffff_45%,#f7fbfa_100%)] pt-28 pb-20">
      <div className="container mx-auto max-w-5xl px-4 md:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.12fr,0.88fr]">
          <div className="rounded-[30px] border border-white/80 bg-white p-6 shadow-[0_25px_90px_rgba(15,23,42,0.10)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">Confirmation groupe</p>
            <h1 className="mt-3 text-3xl font-bold text-slate-950">{pack.name}</h1>
            <p className="mt-3 text-sm text-slate-600">{draft.groupLabel}</p>
            <div className="mt-6 space-y-3">
              {selectedProperties.map((property) => (
                <div key={property.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-950">{property.reference || property.id} - {property.title}</p>
                  <p className="text-sm text-slate-500">{property.category} • {formatTnd(property.pricePerNight)} TND / nuit</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[30px] border border-emerald-100 bg-white p-6 shadow-[0_25px_90px_rgba(15,23,42,0.08)]">
            <h2 className="text-xl font-bold text-slate-950">Synthese</h2>
            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Periode</span>
                <span className="font-semibold text-slate-950">{draft.startDate} {'->'} {draft.endDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Nuits</span>
                <span className="font-semibold text-slate-950">{summary?.nights || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Voyageurs</span>
                <span className="font-semibold text-slate-950">{draft.guests}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="font-semibold text-slate-950">Montant total</span>
                <span className="text-xl font-bold text-emerald-700">{formatTnd(summary?.total || 0)} TND</span>
              </div>
              <div className="flex items-center justify-between">
                <span>A payer maintenant</span>
                <span className="font-semibold text-slate-950">
                  {formatTnd(summary?.dueNow || 0)} TND ({summary?.paymentMode === 'totalite' ? 'Totalite' : 'Avance'})
                </span>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirm()}
                className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? 'Confirmation...' : 'Confirmer la demande groupe'}
              </button>
              <button
                type="button"
                onClick={() => {
                  savePendingReservationDraft(draft);
                  const params = new URLSearchParams();
                  const variantValue = getPackVariantParamValue({
                    variantPropertyIds: draft.groupSelectedBienIds || [],
                  });
                  if (variantValue) params.set('variantBienIds', variantValue);
                  navigate(`${buildPropertyPackPath(pack)}${params.toString() ? `?${params.toString()}` : ''}`);
                }}
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Modifier
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
