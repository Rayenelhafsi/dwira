import { addDays, differenceInDays, format } from 'date-fns';

export type SeasonalPricingPeriod = {
  id?: string;
  start: string;
  end: string;
  prix_nuitee: number;
  prix_semaine?: number | null;
  minimum_nuitees?: number | null;
  checkin_jour?: string | null;
  checkout_jour?: string | null;
  scope?: 'global' | 'amicales' | 'amicale';
  amicale_id?: string | null;
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
  segments: {
    key: string;
    label: string;
    nights: number;
    nightlyPrice: number;
    weeklyPrice: number;
    subtotal: number;
    startDate: string;
    endDate: string;
    isAmicale: boolean;
  }[];
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

function normalizeAmicaleId(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

function getPeriodAmicaleId(period?: SeasonalPricingPeriod | null): string | null {
  if (!period || typeof period !== 'object') return null;
  return normalizeAmicaleId((period as SeasonalPricingPeriod & { amicaleId?: string | null }).amicale_id
    ?? (period as SeasonalPricingPeriod & { amicaleId?: string | null }).amicaleId
    ?? null);
}

function getPeriodScope(period?: SeasonalPricingPeriod | null): 'global' | 'amicales' | 'amicale' {
  if (!period || typeof period !== 'object') return 'global';
  const explicit = String((period as SeasonalPricingPeriod).scope || '').trim().toLowerCase();
  if (explicit === 'global' || explicit === 'amicales' || explicit === 'amicale') return explicit;
  return getPeriodAmicaleId(period) ? 'amicale' : 'global';
}

function getPeriodScopeRank(period: SeasonalPricingPeriod, amicaleId?: string | null): number {
  const targetAmicaleId = normalizeAmicaleId(amicaleId);
  const scope = getPeriodScope(period);
  const periodAmicaleId = getPeriodAmicaleId(period);
  if (!targetAmicaleId) {
    return scope === 'global' ? 1 : 0;
  }
  if (scope === 'amicale' && periodAmicaleId === targetAmicaleId) return 3;
  if (scope === 'amicales') return 2;
  if (scope === 'global') return 1;
  return 0;
}

function toDateKey(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}

export function resolveCurrentPricing(params: {
  today?: Date | string;
  defaultNightlyPrice: number;
  defaultWeeklyPrice?: number | null;
  pricingPeriods?: SeasonalPricingPeriod[];
  amicaleId?: string | null;
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
      return start && end && start <= end && nightly > 0 && todayKey >= start && todayKey <= end && getPeriodScopeRank(period, params.amicaleId) > 0;
    })
    .sort((a, b) => {
      const scopeDiff = getPeriodScopeRank(b, params.amicaleId) - getPeriodScopeRank(a, params.amicaleId);
      if (scopeDiff !== 0) return scopeDiff;
      const startDiff = String(b.start || '').localeCompare(String(a.start || ''));
      if (startDiff !== 0) return startDiff;
      return String(b.end || '').localeCompare(String(a.end || ''));
    });

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
  if (nights >= 7) {
    return (normalizedWeekly * nights) / 7;
  }
  return nights * normalizedNightly;
}

function findPeriodForNight(periods: SeasonalPricingPeriod[], day: Date, amicaleId?: string | null): SeasonalPricingPeriod | null {
  const target = format(day, 'yyyy-MM-dd');
  const candidates = (Array.isArray(periods) ? periods : [])
    .filter((period) => {
      const start = String(period.start || '').slice(0, 10);
      const end = String(period.end || '').slice(0, 10);
      return start && end && target >= start && target <= end && getPeriodScopeRank(period, amicaleId) > 0;
    })
    .sort((a, b) => {
      const scopeDiff = getPeriodScopeRank(b, amicaleId) - getPeriodScopeRank(a, amicaleId);
      if (scopeDiff !== 0) return scopeDiff;
      const startDiff = String(b.start || '').localeCompare(String(a.start || ''));
      if (startDiff !== 0) return startDiff;
      return String(b.end || '').localeCompare(String(a.end || ''));
    });
  return candidates[0] || null;
}

function normalizeMinNights(value: number | null | undefined): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(1, Math.floor(numeric));
}

const WEEKDAY_VALUES = new Set(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']);

export function normalizeWeekday(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim().toLowerCase();
  return WEEKDAY_VALUES.has(normalized) ? normalized : null;
}

function getWeekdayFr(date: Date): string {
  const day = date.getDay(); // 0=dimanche ... 6=samedi
  if (day === 0) return 'dimanche';
  if (day === 1) return 'lundi';
  if (day === 2) return 'mardi';
  if (day === 3) return 'mercredi';
  if (day === 4) return 'jeudi';
  if (day === 5) return 'vendredi';
  return 'samedi';
}

export function getPeriodMinStayForDate(periods: SeasonalPricingPeriod[], date: Date | string, amicaleId?: string | null): number | null {
  const day = toDateAtMidnight(date);
  if (!day) return null;
  const period = findPeriodForNight(Array.isArray(periods) ? periods : [], day, amicaleId);
  return normalizeMinNights(period?.minimum_nuitees);
}

export function getReservationMinStayRequirement(params: {
  startDate: Date | string;
  endDate: Date | string;
  periods?: SeasonalPricingPeriod[];
  fallbackMinStay?: number;
  amicaleId?: string | null;
}): number {
  const start = toDateAtMidnight(params.startDate);
  const end = toDateAtMidnight(params.endDate);
  const fallback = Math.max(1, Math.floor(Number(params.fallbackMinStay || 1)));
  if (!start || !end) return fallback;
  const nights = Math.max(0, Math.abs(differenceInDays(end, start)));
  if (nights <= 0) return fallback;

  const rangeStart = start <= end ? start : end;
  let required = fallback;
  const periods = Array.isArray(params.periods) ? params.periods : [];
  for (let offset = 0; offset < nights; offset += 1) {
    const day = addDays(rangeStart, offset);
    const period = findPeriodForNight(periods, day, params.amicaleId);
    const periodMin = normalizeMinNights(period?.minimum_nuitees);
    if (periodMin && periodMin > required) required = periodMin;
  }
  return required;
}

export function getReservationWeekdayRule(params: {
  startDate: Date | string;
  endDate: Date | string;
  periods?: SeasonalPricingPeriod[];
  amicaleId?: string | null;
}): { requiredCheckinDay: string | null; requiredCheckoutDay: string | null } {
  const start = toDateAtMidnight(params.startDate);
  const end = toDateAtMidnight(params.endDate);
  if (!start || !end) return { requiredCheckinDay: null, requiredCheckoutDay: null };
  const periods = Array.isArray(params.periods) ? params.periods : [];
  const rangeStart = start <= end ? start : end;
  const rangeEnd = start <= end ? end : start;
  const nights = Math.max(0, Math.abs(differenceInDays(end, start)));
  if (nights <= 0) return { requiredCheckinDay: null, requiredCheckoutDay: null };

  // Rules are period-based:
  // - check-in day comes from the arrival period
  // - check-out day comes from the period of the last stayed night
  const arrivalPeriod = findPeriodForNight(periods, rangeStart, params.amicaleId);
  const lastNightDate = addDays(rangeEnd, -1);
  const departurePeriod = findPeriodForNight(periods, lastNightDate, params.amicaleId);
  const requiredCheckinDay = normalizeWeekday(arrivalPeriod?.checkin_jour);
  const requiredCheckoutDay = normalizeWeekday(departurePeriod?.checkout_jour);
  return { requiredCheckinDay, requiredCheckoutDay };
}

export function validateCheckinWeekdayRule(params: {
  startDate: Date | string;
  periods?: SeasonalPricingPeriod[];
  amicaleId?: string | null;
}): { ok: boolean; requiredCheckinDay: string | null; startDay: string | null } {
  const start = toDateAtMidnight(params.startDate);
  if (!start) return { ok: true, requiredCheckinDay: null, startDay: null };
  const periods = Array.isArray(params.periods) ? params.periods : [];
  const arrivalPeriod = findPeriodForNight(periods, start, params.amicaleId);
  const requiredCheckinDay = normalizeWeekday(arrivalPeriod?.checkin_jour);
  const startDay = getWeekdayFr(start);
  return { ok: !requiredCheckinDay || requiredCheckinDay === startDay, requiredCheckinDay, startDay };
}

export function validateReservationWeekdayRule(params: {
  startDate: Date | string;
  endDate: Date | string;
  periods?: SeasonalPricingPeriod[];
  amicaleId?: string | null;
}): { ok: boolean; requiredCheckinDay: string | null; requiredCheckoutDay: string | null; startDay: string | null; endDay: string | null } {
  const start = toDateAtMidnight(params.startDate);
  const end = toDateAtMidnight(params.endDate);
  if (!start || !end) return { ok: true, requiredCheckinDay: null, requiredCheckoutDay: null, startDay: null, endDay: null };
  const { requiredCheckinDay, requiredCheckoutDay } = getReservationWeekdayRule(params);
  const startDay = getWeekdayFr(start);
  const endDay = getWeekdayFr(end);
  const checkinOk = !requiredCheckinDay || requiredCheckinDay === startDay;
  const checkoutOk = !requiredCheckoutDay || requiredCheckoutDay === endDay;
  return { ok: checkinOk && checkoutOk, requiredCheckinDay, requiredCheckoutDay, startDay, endDay };
}

export function calculateAccommodationPricing(params: {
  startDate: Date | string;
  endDate: Date | string;
  defaultNightlyPrice: number;
  defaultWeeklyPrice?: number | null;
  pricingPeriods?: SeasonalPricingPeriod[];
  amicaleId?: string | null;
}): AccommodationPricingResult {
  const start = toDateAtMidnight(params.startDate);
  const end = toDateAtMidnight(params.endDate);
  if (!start || !end) {
    return { nights: 0, accommodationTotal: 0, averageNightlyPrice: 0, hasPeriodOverride: false, segments: [] };
  }
  const nights = Math.max(0, Math.abs(differenceInDays(end, start)));
  if (nights === 0) {
    return { nights: 0, accommodationTotal: 0, averageNightlyPrice: 0, hasPeriodOverride: false, segments: [] };
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
    const period = findPeriodForNight(sortedPeriods, day, params.amicaleId);
    const nightlyPrice = normalizePrice(period?.prix_nuitee) || defaultNightly;
    const weeklyPrice = normalizePrice(period?.prix_semaine) || defaultWeekly || (nightlyPrice * 7);
    const periodScope = getPeriodScope(period);
    const periodAmicaleId = periodScope === 'amicale' ? (getPeriodAmicaleId(period) || 'amicale') : periodScope;
    const key = period?.id
      ? `period:${period.id}:${periodAmicaleId}`
      : period
        ? `period:${String(period.start)}:${String(period.end)}:${periodAmicaleId}:${nightlyPrice}:${weeklyPrice}`
        : `base:${nightlyPrice}:${weeklyPrice}`;
    contexts.push({ key, nightlyPrice, weeklyPrice });
  }

  let hasPeriodOverride = false;
  let total = 0;
  let segmentNights = 0;
  let segment: PricingContext | null = null;
  let segmentStart: Date | null = null;
  let segmentEnd: Date | null = null;
  const segments: AccommodationPricingResult['segments'] = [];

  const flushSegment = () => {
    if (!segment || segmentNights <= 0 || !segmentStart || !segmentEnd) return;
    const subtotalRaw = segmentCost(segmentNights, segment.nightlyPrice, segment.weeklyPrice);
    const subtotal = Math.round(subtotalRaw * 100) / 100;
    total += subtotal;
    const startDate = toDateKey(segmentStart);
    const endDate = toDateKey(segmentEnd);
    const isPeriod = segment.key.startsWith('period:');
    const isAmicale = isPeriod && (segment.key.includes(':amicales') || segment.key.includes(':amicale'));
    segments.push({
      key: segment.key,
      label: isPeriod
        ? (isAmicale ? `Tarif periode amicale (${startDate} → ${endDate})` : `Tarif periode standard (${startDate} → ${endDate})`)
        : `Tarif de base (${startDate} → ${endDate})`,
      nights: segmentNights,
      nightlyPrice: segment.nightlyPrice,
      weeklyPrice: segment.weeklyPrice,
      subtotal,
      startDate,
      endDate,
      isAmicale,
    });
    segmentNights = 0;
    segmentStart = null;
    segmentEnd = null;
  };

  contexts.forEach((ctx, index) => {
    const day = addDays(rangeStart, index);
    if (!segment) {
      segment = ctx;
      segmentNights = 1;
      segmentStart = day;
      segmentEnd = day;
      if (ctx.key.startsWith('period:')) hasPeriodOverride = true;
      return;
    }
    if (ctx.key === segment.key) {
      segmentNights += 1;
      segmentEnd = day;
      if (ctx.key.startsWith('period:')) hasPeriodOverride = true;
      return;
    }
    flushSegment();
    segment = ctx;
    segmentNights = 1;
    segmentStart = day;
    segmentEnd = day;
    if (ctx.key.startsWith('period:')) hasPeriodOverride = true;
  });
  flushSegment();

  return {
    nights,
    accommodationTotal: Math.round(total * 100) / 100,
    averageNightlyPrice: Math.round((total / nights) * 100) / 100,
    hasPeriodOverride,
    segments,
  };
}
