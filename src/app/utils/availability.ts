export interface UnavailableDateRangeLike {
  start?: string | null;
  end?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
}

export interface StayAvailabilityAlternative {
  kind: "shorter" | "longer" | "shifted_week";
  shiftDays?: number;
  nightDelta?: number;
  start: string;
  end: string;
}

export interface StayAvailabilityResolution {
  exactAvailable: boolean;
  alternative: StayAvailabilityAlternative | null;
  status: "exact" | "alternative" | "unavailable";
}

// Public booking flow allows "pending" stays as waiting-list reservations,
// so only fully unavailable statuses should block exact matches and search results.
const BLOCKING_STATUSES = new Set(["booked", "blocked"]);

function formatDateOnlyLocal(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function normalizeDateOnlyInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : formatDateOnlyLocal(value);
  }

  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatDateOnlyLocal(parsed);

  const fallback = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : "";
}

export function parseDateOnly(value: string | Date | null | undefined): Date | null {
  const raw = normalizeDateOnlyInput(value);
  if (!raw) return null;
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
    const rangeStart = parseDateOnly(range?.start || range?.start_date);
    const rangeEnd = parseDateOnly(range?.end || range?.end_date);
    if (!rangeStart || !rangeEnd) return false;
    return rangeStart < stayEnd && rangeEnd > stayStart;
  });
}

export function shiftDateOnly(raw: string | null | undefined, deltaDays: number) {
  const date = parseDateOnly(raw);
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + deltaDays);
  return formatDateOnlyLocal(next);
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

export function getStayAvailabilityAlternativeLabel(alternative: StayAvailabilityAlternative | null | undefined) {
  if (!alternative) return null;
  if (alternative.kind === "shorter") {
    const delta = Math.max(1, Math.abs(Number(alternative.nightDelta || 1)));
    return `-${delta} nuit${delta > 1 ? "s" : ""}`;
  }
  if (alternative.kind === "longer") {
    const delta = Math.max(1, Math.abs(Number(alternative.nightDelta || 1)));
    return `+${delta} nuit${delta > 1 ? "s" : ""}`;
  }
  const shift = Number(alternative.shiftDays || 0);
  const absShift = Math.max(1, Math.abs(shift));
  return `${shift >= 0 ? "+" : "-"}${absShift} j`;
}

function buildStayAvailabilityAlternative(
  requestedStart: string,
  requestedEnd: string,
  candidateStart: string,
  candidateEnd: string
): StayAvailabilityAlternative | null {
  const requestedNights = computeStayNights(requestedStart, requestedEnd);
  const candidateNights = computeStayNights(candidateStart, candidateEnd);
  if (requestedNights <= 0 || candidateNights <= 0) return null;

  const requestedStartDate = parseDateOnly(requestedStart);
  const requestedEndDate = parseDateOnly(requestedEnd);
  const candidateStartDate = parseDateOnly(candidateStart);
  const candidateEndDate = parseDateOnly(candidateEnd);
  if (!requestedStartDate || !requestedEndDate || !candidateStartDate || !candidateEndDate) return null;

  const startShiftDays = Math.round((candidateStartDate.getTime() - requestedStartDate.getTime()) / 86400000);
  const endShiftDays = Math.round((candidateEndDate.getTime() - requestedEndDate.getTime()) / 86400000);
  const nightDelta = candidateNights - requestedNights;

  if (nightDelta < 0) {
    return { kind: "shorter", nightDelta, start: candidateStart, end: candidateEnd };
  }
  if (nightDelta > 0) {
    return { kind: "longer", nightDelta, start: candidateStart, end: candidateEnd };
  }
  return {
    kind: "shifted_week",
    shiftDays: startShiftDays === endShiftDays ? startShiftDays : startShiftDays || endShiftDays,
    start: candidateStart,
    end: candidateEnd,
  };
}

export function findBestStayRangeAlternative(params: {
  startRaw: string | null | undefined;
  endRaw: string | null | undefined;
  isRangeValid: (start: string, end: string) => boolean;
  maxShiftDays?: number;
  maxNightDelta?: number;
}): StayAvailabilityAlternative | null {
  const { startRaw, endRaw, isRangeValid } = params;
  if (!isValidStayRange(startRaw, endRaw)) return null;

  const requestedStart = normalizeDateOnlyInput(startRaw);
  const requestedEnd = normalizeDateOnlyInput(endRaw);
  const maxShiftDays = Math.max(0, Number(params.maxShiftDays ?? 7));
  const maxNightDelta = Math.max(0, Number(params.maxNightDelta ?? 7));

  const candidateRanges: Array<{ start: string | null; end: string | null }> = [];

  // 1) Try nearest same-duration shifts first in the [-maxShiftDays, +maxShiftDays] window.
  for (let offset = 1; offset <= maxShiftDays; offset += 1) {
    candidateRanges.push(
      { start: shiftDateOnly(requestedStart, -offset), end: shiftDateOnly(requestedEnd, -offset) },
      { start: shiftDateOnly(requestedStart, offset), end: shiftDateOnly(requestedEnd, offset) }
    );
  }

  // 2) Then try reduced/extended durations around requested stay.
  if (maxNightDelta >= 1) {
    for (let delta = 1; delta <= maxNightDelta; delta += 1) {
      candidateRanges.push(
        { start: requestedStart, end: shiftDateOnly(requestedEnd, -delta) },
        { start: shiftDateOnly(requestedStart, delta), end: requestedEnd },
        { start: shiftDateOnly(requestedStart, -delta), end: requestedEnd },
        { start: requestedStart, end: shiftDateOnly(requestedEnd, delta) }
      );
    }
  }

  for (const candidate of candidateRanges) {
    if (!candidate.start || !candidate.end) continue;
    if (!isValidStayRange(candidate.start, candidate.end)) continue;
    if (!isRangeValid(candidate.start, candidate.end)) continue;
    const alternative = buildStayAvailabilityAlternative(requestedStart, requestedEnd, candidate.start, candidate.end);
    if (alternative) return alternative;
  }

  return null;
}

export function resolveStayAvailability(
  ranges: UnavailableDateRangeLike[] | null | undefined,
  startRaw: string | null | undefined,
  endRaw: string | null | undefined
): StayAvailabilityResolution {
  const exactAvailable = !hasBlockingUnavailableDates(ranges, startRaw, endRaw);
  if (exactAvailable) {
    return {
      exactAvailable: true,
      alternative: null,
      status: "exact",
    };
  }

  const alternative =
    findOneNightFlexAvailabilityAlternative(ranges, startRaw, endRaw)
    || findWeeklyAvailabilityAlternative(ranges, startRaw, endRaw);

  return {
    exactAvailable: false,
    alternative,
    status: alternative ? "alternative" : "unavailable",
  };
}
