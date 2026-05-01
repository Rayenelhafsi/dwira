import { addDays, differenceInDays, format } from 'date-fns';

export type SeasonalPricingPeriod = {
  id?: string;
  start: string;
  end: string;
  prix_nuitee: number;
  prix_semaine?: number | null;
};

type PricingContext = {
  key: string;
  nightlyPrice: number;
  weeklyPrice: number;
};

export type AccommodationPricingResult = {
  nights: number;
  accommodationTotal: number;
  averageNightlyPrice: number;
  hasPeriodOverride: boolean;
};

export type CurrentPricingResult = {
  nightlyPrice: number;
  weeklyPrice: number;
  hasPeriodOverride: boolean;
  activePeriod: SeasonalPricingPeriod | null;
};

function toDateAtMidnight(value: Date | string): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizePrice(value: number | null | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric;
}

function toDateKey(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}

export function resolveCurrentPricing(params: {
  today?: Date | string;
  defaultNightlyPrice: number;
  defaultWeeklyPrice?: number | null;
  pricingPeriods?: SeasonalPricingPeriod[];
}): CurrentPricingResult {
  const today = toDateAtMidnight(params.today || new Date());
  const defaultNightly = normalizePrice(params.defaultNightlyPrice);
  const fallbackWeekly = normalizePrice(params.defaultWeeklyPrice) || (defaultNightly * 7);

  if (!today) {
    return {
      nightlyPrice: defaultNightly,
      weeklyPrice: fallbackWeekly,
      hasPeriodOverride: false,
      activePeriod: null,
    };
  }

  const todayKey = toDateKey(today);
  const candidates = (Array.isArray(params.pricingPeriods) ? params.pricingPeriods : [])
    .filter((period) => {
      const start = String(period?.start || '').slice(0, 10);
      const end = String(period?.end || '').slice(0, 10);
      const nightly = normalizePrice(period?.prix_nuitee);
      return start && end && start <= end && nightly > 0 && todayKey >= start && todayKey <= end;
    })
    .sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')));

  const activePeriod = candidates[0] || null;
  if (!activePeriod) {
    return {
      nightlyPrice: defaultNightly,
      weeklyPrice: fallbackWeekly,
      hasPeriodOverride: false,
      activePeriod: null,
    };
  }

  const nightly = normalizePrice(activePeriod.prix_nuitee) || defaultNightly;
  const weekly = normalizePrice(activePeriod.prix_semaine) || fallbackWeekly || (nightly * 7);
  return {
    nightlyPrice: nightly,
    weeklyPrice: weekly,
    hasPeriodOverride: true,
    activePeriod,
  };
}

function segmentCost(nights: number, nightlyPrice: number, weeklyPrice: number): number {
  if (nights <= 0) return 0;
  const normalizedNightly = normalizePrice(nightlyPrice);
  const normalizedWeekly = normalizePrice(weeklyPrice) || (normalizedNightly * 7);
  const weeks = Math.floor(nights / 7);
  const remainingNights = nights % 7;
  return (weeks * normalizedWeekly) + (remainingNights * normalizedNightly);
}

function findPeriodForNight(periods: SeasonalPricingPeriod[], day: Date): SeasonalPricingPeriod | null {
  const target = format(day, 'yyyy-MM-dd');
  for (const period of periods) {
    const start = String(period.start || '').slice(0, 10);
    const end = String(period.end || '').slice(0, 10);
    if (!start || !end) continue;
    if (target >= start && target <= end) return period;
  }
  return null;
}

export function calculateAccommodationPricing(params: {
  startDate: Date | string;
  endDate: Date | string;
  defaultNightlyPrice: number;
  defaultWeeklyPrice?: number | null;
  pricingPeriods?: SeasonalPricingPeriod[];
}): AccommodationPricingResult {
  const start = toDateAtMidnight(params.startDate);
  const end = toDateAtMidnight(params.endDate);
  if (!start || !end) {
    return { nights: 0, accommodationTotal: 0, averageNightlyPrice: 0, hasPeriodOverride: false };
  }
  const nights = Math.max(0, Math.abs(differenceInDays(end, start)));
  if (nights === 0) {
    return { nights: 0, accommodationTotal: 0, averageNightlyPrice: 0, hasPeriodOverride: false };
  }

  const rangeStart = start <= end ? start : end;
  const sortedPeriods = (Array.isArray(params.pricingPeriods) ? params.pricingPeriods : [])
    .filter((period) => normalizePrice(period.prix_nuitee) > 0)
    .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  const defaultNightly = normalizePrice(params.defaultNightlyPrice);
  const defaultWeekly = normalizePrice(params.defaultWeeklyPrice) || (defaultNightly * 7);

  const contexts: PricingContext[] = [];
  for (let offset = 0; offset < nights; offset += 1) {
    const day = addDays(rangeStart, offset);
    const period = findPeriodForNight(sortedPeriods, day);
    const nightlyPrice = normalizePrice(period?.prix_nuitee) || defaultNightly;
    const weeklyPrice = normalizePrice(period?.prix_semaine) || defaultWeekly || (nightlyPrice * 7);
    const key = period?.id
      ? `period:${period.id}`
      : period
        ? `period:${String(period.start)}:${String(period.end)}:${nightlyPrice}:${weeklyPrice}`
        : `base:${nightlyPrice}:${weeklyPrice}`;
    contexts.push({ key, nightlyPrice, weeklyPrice });
  }

  let hasPeriodOverride = false;
  let total = 0;
  let segmentNights = 0;
  let segment: PricingContext | null = null;

  const flushSegment = () => {
    if (!segment || segmentNights <= 0) return;
    total += segmentCost(segmentNights, segment.nightlyPrice, segment.weeklyPrice);
    segmentNights = 0;
  };

  for (const ctx of contexts) {
    if (!segment) {
      segment = ctx;
      segmentNights = 1;
      if (ctx.key.startsWith('period:')) hasPeriodOverride = true;
      continue;
    }
    if (ctx.key === segment.key) {
      segmentNights += 1;
      if (ctx.key.startsWith('period:')) hasPeriodOverride = true;
      continue;
    }
    flushSegment();
    segment = ctx;
    segmentNights = 1;
    if (ctx.key.startsWith('period:')) hasPeriodOverride = true;
  }
  flushSegment();

  return {
    nights,
    accommodationTotal: Math.round(total * 100) / 100,
    averageNightlyPrice: Math.round((total / nights) * 100) / 100,
    hasPeriodOverride,
  };
}
