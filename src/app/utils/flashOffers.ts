import type { Property } from "../data/properties";

export type PropertyFlashOfferMode = "percentage" | "fixed_amount";

export type PropertyFlashOffer = {
  id?: string;
  title: string | null;
  mode: PropertyFlashOfferMode;
  discountPercent: number | null;
  fixedNightlyAmount: number | null;
  start: string;
  end: string;
  minimumNights?: number | null;
  expirationHours?: number | null;
  createdAt?: string | null;
  expiresAt?: string | null;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value?: string | null): value is string {
  return DATE_ONLY_RE.test(String(value || "").trim());
}

function normalizeAmount(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

function rangeFullyContains(start: string, end: string, outerStart: string, outerEnd: string) {
  return outerStart <= start && outerEnd >= end;
}

function isFlashEntirelyBooked(property: Property, start: string, end: string) {
  const unavailableDates = Array.isArray(property.unavailableDates) ? property.unavailableDates : [];
  return unavailableDates.some((range) => {
    const status = String(range?.status || "").trim().toLowerCase();
    if (status !== "booked") return false;
    const bookedStart = String(range?.start || "").slice(0, 10);
    const bookedEnd = String(range?.end || "").slice(0, 10);
    if (!isValidDateOnly(bookedStart) || !isValidDateOnly(bookedEnd)) return false;
    return rangeFullyContains(start, end, bookedStart, bookedEnd);
  });
}

function parseFutureIsoTimestamp(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function normalizeFlashOfferCandidate(raw: any, fallbackId: string): PropertyFlashOffer | null {
  const active = raw?.active !== false;
  if (!active) return null;
  const start = String(raw?.start ?? raw?.start_date ?? "").trim();
  const end = String(raw?.end ?? raw?.end_date ?? "").trim();
  if (!isValidDateOnly(start) || !isValidDateOnly(end) || end < start) return null;
  const mode: PropertyFlashOfferMode = raw?.mode === "montant_tnd" || raw?.mode === "fixed_amount" ? "fixed_amount" : "percentage";
  const discountPercent = mode === "percentage"
    ? Math.max(0, Math.min(95, Number(raw?.discountPercent ?? raw?.discount_percent ?? 0)))
    : null;
  const fixedNightlyAmount = mode === "fixed_amount"
    ? normalizeAmount(raw?.fixedNightlyAmount ?? raw?.fixed_amount_tnd)
    : null;
  const minimumNightsRaw = Number(raw?.minimumNights ?? raw?.minimum_nuitees ?? 1);
  const minimumNights = Number.isFinite(minimumNightsRaw) && minimumNightsRaw > 0
    ? Math.max(1, Math.floor(minimumNightsRaw))
    : 1;
  if (mode === "percentage" && (!Number.isFinite(discountPercent) || Number(discountPercent) <= 0)) return null;
  if (mode === "fixed_amount" && (!Number.isFinite(fixedNightlyAmount) || Number(fixedNightlyAmount) <= 0)) return null;
  const expiresAt = parseFutureIsoTimestamp(raw?.expiresAt ?? raw?.expires_at);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return null;
  return {
    id: String(raw?.id || fallbackId),
    title: String(raw?.title || "").trim() || null,
    mode,
    discountPercent,
    fixedNightlyAmount,
    start,
    end,
    minimumNights,
    expirationHours: raw?.expirationHours ?? raw?.expiration_hours ?? null,
    createdAt: parseFutureIsoTimestamp(raw?.createdAt ?? raw?.created_at) || null,
    expiresAt,
  };
}

export function getPropertyFlashOffers(property?: Property | null): PropertyFlashOffer[] {
  if (!property || String(property.mode || "").trim() !== "location_saisonniere") return [];
  const config = property.seasonalConfig || null;
  const rawOffers = Array.isArray(config?.venteFlashOffers) && config.venteFlashOffers.length > 0
    ? config.venteFlashOffers
    : (config?.venteFlashActive ? [{
        id: `${property.id}-legacy-flash`,
        active: config.venteFlashActive,
        title: config.venteFlashTitle,
        mode: config.venteFlashMode,
        discountPercent: config.venteFlashDiscountPercent,
        fixedNightlyAmount: config.venteFlashFixedAmount,
        start: config.venteFlashStart,
        end: config.venteFlashEnd,
      }] : []);
  return rawOffers
    .map((offer, index) => normalizeFlashOfferCandidate(offer, `${property.id}-flash-${index}`))
    .filter((offer): offer is PropertyFlashOffer => Boolean(offer))
    .filter((offer) => !isFlashEntirelyBooked(property, offer.start, offer.end));
}

export function getPropertyFlashOffer(property?: Property | null): PropertyFlashOffer | null {
  return getPropertyFlashOffers(property)[0] || null;
}

export function getFlashNightlyAmount(amount: number, offer?: Pick<PropertyFlashOffer, "mode" | "discountPercent" | "fixedNightlyAmount"> | null) {
  const safeAmount = normalizeAmount(amount);
  if (!offer) return safeAmount;
  if (offer.mode === "fixed_amount") {
    const fixed = normalizeAmount(offer.fixedNightlyAmount);
    return fixed > 0 ? fixed : safeAmount;
  }
  const safeDiscount = Math.max(0, Math.min(95, Number(offer.discountPercent || 0)));
  if (!Number.isFinite(safeDiscount) || safeDiscount <= 0) return safeAmount;
  return Math.max(0, Math.round(safeAmount * (100 - safeDiscount)) / 100);
}

export function getDiscountedAmount(amount: number, discountPercent: number) {
  return getFlashNightlyAmount(amount, { mode: "percentage", discountPercent, fixedNightlyAmount: null });
}

export function getFlashBadgeLabel(offer?: PropertyFlashOffer | null) {
  if (!offer) return "";
  if (offer.mode === "fixed_amount") return `${normalizeAmount(offer.fixedNightlyAmount)} TND`;
  return `-${Math.max(0, Math.min(95, Number(offer.discountPercent || 0)))}%`;
}
