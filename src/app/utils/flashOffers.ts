import type { Property } from "../data/properties";

export type PropertyFlashOfferMode = "percentage" | "fixed_amount";

export type PropertyFlashOffer = {
  title: string | null;
  mode: PropertyFlashOfferMode;
  discountPercent: number | null;
  fixedNightlyAmount: number | null;
  start: string;
  end: string;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value?: string | null): value is string {
  return DATE_ONLY_RE.test(String(value || "").trim());
}

function normalizeAmount(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && startB < endA;
}

function isFlashAlreadyBooked(property: Property, start: string, end: string) {
  const unavailableDates = Array.isArray(property.unavailableDates) ? property.unavailableDates : [];
  return unavailableDates.some((range) => {
    const status = String(range?.status || "").trim().toLowerCase();
    if (status !== "booked") return false;
    const bookedStart = String(range?.start || "").slice(0, 10);
    const bookedEnd = String(range?.end || "").slice(0, 10);
    if (!isValidDateOnly(bookedStart) || !isValidDateOnly(bookedEnd)) return false;
    return rangesOverlap(start, end, bookedStart, bookedEnd);
  });
}

export function getPropertyFlashOffer(property?: Property | null): PropertyFlashOffer | null {
  if (!property || String(property.mode || "").trim() !== "location_saisonniere") return null;
  const config = property.seasonalConfig || null;
  if (!config?.venteFlashActive) return null;

  const start = String(config.venteFlashStart || "").trim();
  const end = String(config.venteFlashEnd || "").trim();
  if (!isValidDateOnly(start) || !isValidDateOnly(end) || end < start) return null;
  if (isFlashAlreadyBooked(property, start, end)) return null;

  const mode: PropertyFlashOfferMode = config.venteFlashMode === "montant_tnd" ? "fixed_amount" : "percentage";
  const discountPercent = mode === "percentage"
    ? Math.max(0, Math.min(95, Number(config.venteFlashDiscountPercent || 0)))
    : null;
  const fixedNightlyAmount = mode === "fixed_amount"
    ? normalizeAmount(config.venteFlashFixedAmount)
    : null;

  if (mode === "percentage" && (!Number.isFinite(discountPercent) || Number(discountPercent) <= 0)) return null;
  if (mode === "fixed_amount" && (!Number.isFinite(fixedNightlyAmount) || Number(fixedNightlyAmount) <= 0)) return null;

  const title = String(config.venteFlashTitle || "").trim() || null;
  return {
    title,
    mode,
    discountPercent,
    fixedNightlyAmount,
    start,
    end,
  };
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
