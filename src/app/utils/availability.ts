export interface UnavailableDateRangeLike {
  start?: string | null;
  end?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  paymentDeadline?: string | null;
  payment_deadline?: string | null;
  reservationDemandId?: string | null;
  reservation_demand_id?: string | null;
  id?: string | null;
}

export interface NormalizedUnavailableDateRange {
  id?: string;
  start: string;
  end: string;
  status: "blocked" | "pending" | "booked";
  paymentDeadline?: string;
  reservationDemandId?: string | null;
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

// Public booking flow keeps pending stays selectable so the next client can
// still submit a parallel request and see the waiting-list note.
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

function normalizeUnavailableStatus(value: string | null | undefined): "blocked" | "pending" | "booked" | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "blocked" || normalized === "pending" || normalized === "booked") {
    return normalized;
  }
  return null;
}

function addDaysToDateOnly(raw: string, days: number) {
  const date = parseDateOnly(raw);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return formatDateOnlyLocal(date);
}

function compareDateOnly(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeDateOnlyInput(a);
  const right = normalizeDateOnlyInput(b);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function getStatusPriority(status: "blocked" | "pending" | "booked") {
  if (status === "booked") return 3;
  if (status === "blocked") return 2;
  return 1;
}

export function normalizeUnavailableDateRanges(
  ranges: UnavailableDateRangeLike[] | null | undefined
): NormalizedUnavailableDateRange[] {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => {
      const start = normalizeDateOnlyInput(range?.start || range?.start_date);
      const end = normalizeDateOnlyInput(range?.end || range?.end_date);
      const status = normalizeUnavailableStatus(range?.status);
      if (!start || !end || !status || end < start) return null;
      return {
        id: range?.id ? String(range.id) : undefined,
        start,
        end,
        status,
        paymentDeadline: normalizeDateOnlyInput(range?.paymentDeadline || range?.payment_deadline) || undefined,
        reservationDemandId: range?.reservationDemandId
          ? String(range.reservationDemandId)
          : (range?.reservation_demand_id ? String(range.reservation_demand_id) : null),
      } satisfies NormalizedUnavailableDateRange;
    })
    .filter((range): range is NormalizedUnavailableDateRange => Boolean(range))
    .sort((a, b) => {
      const startCompare = compareDateOnly(a.start, b.start);
      if (startCompare !== 0) return startCompare;
      const endCompare = compareDateOnly(a.end, b.end);
      if (endCompare !== 0) return endCompare;
      return getStatusPriority(b.status) - getStatusPriority(a.status);
    });
}

function getUnitStatusForDay(
  ranges: NormalizedUnavailableDateRange[],
  day: string
): NormalizedUnavailableDateRange | null {
  let selected: NormalizedUnavailableDateRange | null = null;
  for (const range of ranges) {
    if (range.start <= day && day <= range.end) {
      if (!selected || getStatusPriority(range.status) > getStatusPriority(selected.status)) {
        selected = range;
      }
    }
  }
  return selected;
}

export function aggregateUnavailableDatesByUnitCalendars(
  unitCalendars: Array<UnavailableDateRangeLike[] | null | undefined>
): NormalizedUnavailableDateRange[] {
  const normalizedCalendars = (Array.isArray(unitCalendars) ? unitCalendars : []).map((calendar) =>
    normalizeUnavailableDateRanges(calendar)
  );
  const allRanges = normalizedCalendars.flat();
  if (allRanges.length === 0) return [];

  let minDay = allRanges[0].start;
  let maxDay = allRanges[0].end;
  for (const range of allRanges) {
    if (range.start < minDay) minDay = range.start;
    if (range.end > maxDay) maxDay = range.end;
  }

  const dayStatuses: Array<NormalizedUnavailableDateRange> = [];
  for (let day = minDay; day <= maxDay; day = addDaysToDateOnly(day, 1)) {
    const unitStatuses = normalizedCalendars.map((calendar) => getUnitStatusForDay(calendar, day));
    if (unitStatuses.some((entry) => entry === null)) continue;

    const occupiedStatuses = unitStatuses.filter((entry): entry is NormalizedUnavailableDateRange => Boolean(entry));
    const allPending = occupiedStatuses.every((entry) => entry.status === "pending");
    if (allPending) {
      const deadlines = occupiedStatuses
        .map((entry) => normalizeDateOnlyInput(entry.paymentDeadline))
        .filter(Boolean);
      const earliestDeadline = deadlines.length > 0 ? deadlines.sort()[0] : undefined;
      const reservationIds = Array.from(new Set(
        occupiedStatuses
          .map((entry) => String(entry.reservationDemandId || "").trim())
          .filter(Boolean)
      ));
      dayStatuses.push({
        start: day,
        end: day,
        status: "pending",
        paymentDeadline: earliestDeadline || undefined,
        reservationDemandId: reservationIds.length === 1 ? reservationIds[0] : null,
      });
      continue;
    }

    dayStatuses.push({
      start: day,
      end: day,
      status: occupiedStatuses.some((entry) => entry.status === "booked") ? "booked" : "blocked",
    });
  }

  if (dayStatuses.length === 0) return [];

  const merged: NormalizedUnavailableDateRange[] = [];
  for (const entry of dayStatuses) {
    const previous = merged[merged.length - 1];
    const canMerge = previous
      && previous.status === entry.status
      && (previous.paymentDeadline || "") === (entry.paymentDeadline || "")
      && (previous.reservationDemandId || "") === (entry.reservationDemandId || "")
      && addDaysToDateOnly(previous.end, 1) === entry.start;
    if (canMerge) {
      previous.end = entry.end;
      continue;
    }
    merged.push({ ...entry });
  }

  return merged;
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
  const stayLastOccupiedDay = new Date(stayEnd);
  stayLastOccupiedDay.setDate(stayLastOccupiedDay.getDate() - 1);

  return (Array.isArray(ranges) ? ranges : []).some((range) => {
    const status = String(range?.status || "").trim().toLowerCase();
    if (!BLOCKING_STATUSES.has(status)) return false;
    const rangeStart = parseDateOnly(range?.start || range?.start_date);
    const rangeEnd = parseDateOnly(range?.end || range?.end_date);
    if (!rangeStart || !rangeEnd) return false;
    // Unavailable date rows are displayed and aggregated as inclusive ranges
    // across the app, so the exact-match filter must treat the end date as
    // occupied too.
    return rangeStart <= stayLastOccupiedDay && rangeEnd >= stayStart;
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
