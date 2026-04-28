export type GuestLimitsInput = {
  fallbackGuests: number;
  maxGuestsCap?: number | null;
  maxAdultsCap?: number | null;
  maxChildrenCap?: number | null;
};

export type GuestLimits = {
  maxGuests: number;
  maxAdultGuests: number;
  maxChildGuests: number;
};

export function computeGuestLimits(input: GuestLimitsInput): GuestLimits {
  const fallbackGuests = Math.max(1, Math.floor(Number(input.fallbackGuests || 1)));
  const rawTotal = Number(input.maxGuestsCap);
  const rawAdults = Number(input.maxAdultsCap);
  const rawChildren = Number(input.maxChildrenCap);

  const hasTotalCap = Number.isFinite(rawTotal) && rawTotal > 0;
  const hasAdultsCap = Number.isFinite(rawAdults) && rawAdults > 0;
  const hasChildrenCap = Number.isFinite(rawChildren) && rawChildren >= 0;

  const totalCap = hasTotalCap ? Math.max(1, Math.floor(rawTotal)) : null;
  const maxAdultGuests = hasAdultsCap
    ? Math.max(1, Math.floor(rawAdults))
    : (totalCap ?? fallbackGuests);
  const maxChildGuests = hasChildrenCap
    ? Math.max(0, Math.floor(rawChildren))
    : Math.max(0, (totalCap ?? fallbackGuests) - 1);

  const combinedCaps = maxAdultGuests + maxChildGuests;
  const maxGuestsFromCaps = Math.max(1, combinedCaps);
  const maxGuests = totalCap !== null
    ? Math.min(totalCap, maxGuestsFromCaps)
    : maxGuestsFromCaps;

  return {
    maxGuests,
    maxAdultGuests: Math.min(maxGuests, maxAdultGuests),
    maxChildGuests: Math.min(maxGuests, maxChildGuests),
  };
}
