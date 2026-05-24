export interface UnavailableDateRangeLike {
  start?: string | null;
  end?: string | null;
  status?: string | null;
}

export interface StayAvailabilityAlternative {
  kind: "shorter" | "longer" | "shifted_week";
  shiftDays?: number;
  nightDelta?: number;
  start: string;
  end: string;
}

const BLOCKING_STATUSES = new Set(["booked", "pending", "blocked"]);

export function parseDateOnly(value: string | null | undefined): Date | null {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidStayRange(startRaw: string | null | undefined, endRaw: string | null | undefined) {
  const start = parseDateOnly(startRaw);
  const end = parseDateOnly(endRaw);
  return Boolean(start && end && start < end);
}

export function hasBlockingUnavailableDates(
  ranges: UnavailableDateRangeLike[] | null | undefined,
  startRaw: string | null | undefined,
  endRaw: string | null | undefined
) {
  const stayStart = parseDateOnly(startRaw);
  const stayEnd = parseDateOnly(endRaw);
  if (!stayStart || !stayEnd || !(stayStart < stayEnd)) return false;

  return (Array.isArray(ranges) ? ranges : []).some((range) => {
    const status = String(range?.status || "").trim().toLowerCase();
    if (!BLOCKING_STATUSES.has(status)) return false;
    const rangeStart = parseDateOnly(range?.start);
    const rangeEnd = parseDateOnly(range?.end);
    if (!rangeStart || !rangeEnd) return false;
    return rangeStart < stayEnd && rangeEnd > stayStart;
  });
}

export function shiftDateOnly(raw: string | null | undefined, deltaDays: number) {
  const date = parseDateOnly(raw);
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

export function computeStayNights(startRaw: string | null | undefined, endRaw: string | null | undefined) {
  const start = parseDateOnly(startRaw);
  const end = parseDateOnly(endRaw);
  if (!start || !end || !(start < end)) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function findWeeklyAvailabilityAlternative(
  ranges: UnavailableDateRangeLike[] | null | undefined,
  startRaw: string | null | undefined,
  endRaw: string | null | undefined
): StayAvailabilityAlternative | null {
  const offsets = [-7, 7];
  for (const offset of offsets) {
    const shiftedStart = shiftDateOnly(startRaw, offset);
    const shiftedEnd = shiftDateOnly(endRaw, offset);
    if (!shiftedStart || !shiftedEnd) continue;
    if (!hasBlockingUnavailableDates(ranges, shiftedStart, shiftedEnd)) {
      return {
        kind: "shifted_week",
        shiftDays: offset,
        start: shiftedStart,
        end: shiftedEnd,
      };
    }
  }
  return null;
}

export function findOneNightFlexAvailabilityAlternative(
  ranges: UnavailableDateRangeLike[] | null | undefined,
  startRaw: string | null | undefined,
  endRaw: string | null | undefined
): StayAvailabilityAlternative | null {
  const nights = computeStayNights(startRaw, endRaw);
  if (nights <= 1) return null;

  const shorterCandidates: Array<{ start: string | null; end: string | null }> = [
    { start: startRaw || null, end: shiftDateOnly(endRaw, -1) },
    { start: shiftDateOnly(startRaw, 1), end: endRaw || null },
  ];

  for (const candidate of shorterCandidates) {
    if (!candidate.start || !candidate.end) continue;
    if (!isValidStayRange(candidate.start, candidate.end)) continue;
    if (!hasBlockingUnavailableDates(ranges, candidate.start, candidate.end)) {
      return {
        kind: "shorter",
        nightDelta: -1,
        start: candidate.start,
        end: candidate.end,
      };
    }
  }

  const longerCandidates: Array<{ start: string | null; end: string | null }> = [
    { start: shiftDateOnly(startRaw, -1), end: endRaw || null },
    { start: startRaw || null, end: shiftDateOnly(endRaw, 1) },
  ];

  for (const candidate of longerCandidates) {
    if (!candidate.start || !candidate.end) continue;
    if (!isValidStayRange(candidate.start, candidate.end)) continue;
    if (!hasBlockingUnavailableDates(ranges, candidate.start, candidate.end)) {
      return {
        kind: "longer",
        nightDelta: 1,
        start: candidate.start,
        end: candidate.end,
      };
    }
  }

  return null;
}
