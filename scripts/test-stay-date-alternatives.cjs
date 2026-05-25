const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeDateOnlyInput(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalDate(value);
  }
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatLocalDate(parsed);
  const fallback = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : '';
}

function parseDateOnly(value) {
  const raw = normalizeDateOnlyInput(value);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnlyString(value) {
  return normalizeDateOnlyInput(value);
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

function shiftDateOnly(raw, deltaDays) {
  const date = parseDateOnly(raw);
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + deltaDays);
  return formatLocalDate(next);
}

function isValidStayRange(startRaw, endRaw) {
  const start = parseDateOnly(startRaw);
  const end = parseDateOnly(endRaw);
  return Boolean(start && end && start < end);
}

function computeStayNights(startRaw, endRaw) {
  const start = parseDateOnly(startRaw);
  const end = parseDateOnly(endRaw);
  if (!start || !end || !(start < end)) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function hasBlockingUnavailableDates(ranges, startRaw, endRaw) {
  const stayStart = parseDateOnly(startRaw);
  const stayEnd = parseDateOnly(endRaw);
  if (!stayStart || !stayEnd || !(stayStart < stayEnd)) return false;

  return (Array.isArray(ranges) ? ranges : []).some((range) => {
    const status = String(range?.status || '').trim().toLowerCase();
    if (!['booked', 'pending', 'blocked'].includes(status)) return false;
    const rangeStart = parseDateOnly(range?.start);
    const rangeEnd = parseDateOnly(range?.end);
    if (!rangeStart || !rangeEnd) return false;
    return rangeStart < stayEnd && rangeEnd > stayStart;
  });
}

function findWeeklyAvailabilityAlternative(ranges, startRaw, endRaw) {
  for (const offset of [-7, 7]) {
    const shiftedStart = shiftDateOnly(startRaw, offset);
    const shiftedEnd = shiftDateOnly(endRaw, offset);
    if (!shiftedStart || !shiftedEnd) continue;
    if (!hasBlockingUnavailableDates(ranges, shiftedStart, shiftedEnd)) {
      return { kind: 'shifted_week', shiftDays: offset, start: shiftedStart, end: shiftedEnd };
    }
  }
  return null;
}

function findOneNightFlexAvailabilityAlternative(ranges, startRaw, endRaw) {
  const nights = computeStayNights(startRaw, endRaw);
  if (nights <= 1) return null;

  const shorterCandidates = [
    { start: startRaw || null, end: shiftDateOnly(endRaw, -1) },
    { start: shiftDateOnly(startRaw, 1), end: endRaw || null },
  ];

  for (const candidate of shorterCandidates) {
    if (!candidate.start || !candidate.end) continue;
    if (!isValidStayRange(candidate.start, candidate.end)) continue;
    if (!hasBlockingUnavailableDates(ranges, candidate.start, candidate.end)) {
      return { kind: 'shorter', nightDelta: -1, start: candidate.start, end: candidate.end };
    }
  }

  const longerCandidates = [
    { start: shiftDateOnly(startRaw, -1), end: endRaw || null },
    { start: startRaw || null, end: shiftDateOnly(endRaw, 1) },
  ];

  for (const candidate of longerCandidates) {
    if (!candidate.start || !candidate.end) continue;
    if (!isValidStayRange(candidate.start, candidate.end)) continue;
    if (!hasBlockingUnavailableDates(ranges, candidate.start, candidate.end)) {
      return { kind: 'longer', nightDelta: 1, start: candidate.start, end: candidate.end };
    }
  }

  return null;
}

function buildStayAvailabilityAlternative(requestedStart, requestedEnd, candidateStart, candidateEnd) {
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

  if (nightDelta < 0) return { kind: 'shorter', nightDelta, start: candidateStart, end: candidateEnd };
  if (nightDelta > 0) return { kind: 'longer', nightDelta, start: candidateStart, end: candidateEnd };
  return {
    kind: 'shifted_week',
    shiftDays: startShiftDays === endShiftDays ? startShiftDays : (startShiftDays || endShiftDays),
    start: candidateStart,
    end: candidateEnd,
  };
}

function findBestStayRangeAlternative(startRaw, endRaw, isRangeValid, maxShiftDays = 7, maxNightDelta = 7) {
  if (!isValidStayRange(startRaw, endRaw)) return null;
  const requestedStart = String(startRaw).slice(0, 10);
  const requestedEnd = String(endRaw).slice(0, 10);

  const candidateRanges = [];
  if (maxNightDelta >= 1) {
    candidateRanges.push(
      { start: requestedStart, end: shiftDateOnly(requestedEnd, -1) },
      { start: shiftDateOnly(requestedStart, 1), end: requestedEnd },
      { start: shiftDateOnly(requestedStart, -1), end: requestedEnd },
      { start: requestedStart, end: shiftDateOnly(requestedEnd, 1) },
    );
  }

  if (maxShiftDays >= 7) {
    candidateRanges.push(
      { start: shiftDateOnly(requestedStart, -7), end: shiftDateOnly(requestedEnd, -7) },
      { start: shiftDateOnly(requestedStart, 7), end: shiftDateOnly(requestedEnd, 7) },
    );
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

function labelAlternative(alt) {
  if (!alt) return 'aucune';
  if (alt.kind === 'shorter') return '-1 nuit';
  if (alt.kind === 'longer') return '+1 nuit';
  return (alt.shiftDays || 0) > 0 ? '+7 j' : '-7 j';
}

function getWeekdayFr(date) {
  const day = date.getDay();
  if (day === 0) return 'dimanche';
  if (day === 1) return 'lundi';
  if (day === 2) return 'mardi';
  if (day === 3) return 'mercredi';
  if (day === 4) return 'jeudi';
  if (day === 5) return 'vendredi';
  return 'samedi';
}

function getPeriodForNight(periods, date) {
  const target = toDateOnlyString(date);
  return (Array.isArray(periods) ? periods : [])
    .filter((period) => {
      const start = toDateOnlyString(period?.start || period?.start_date);
      const end = toDateOnlyString(period?.end || period?.end_date);
      return start && end && target >= start && target <= end;
    })
    .sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')))[0] || null;
}

function getReservationMinStayRequirement(periods, startRaw, endRaw, fallbackMinStay = 1) {
  const start = parseDateOnly(startRaw);
  const end = parseDateOnly(endRaw);
  const fallback = Math.max(1, Math.floor(Number(fallbackMinStay || 1)));
  if (!start || !end || !(start < end)) return fallback;
  const nights = computeStayNights(startRaw, endRaw);
  let required = fallback;
  for (let offset = 0; offset < nights; offset += 1) {
    const day = new Date(start);
    day.setDate(day.getDate() + offset);
    const period = getPeriodForNight(periods, day);
    const minStay = Math.max(0, Math.floor(Number(period?.minimum_nuitees || 0)));
    if (minStay > required) required = minStay;
  }
  return required;
}

function validateReservationWeekdayRule(periods, startRaw, endRaw) {
  const start = parseDateOnly(startRaw);
  const end = parseDateOnly(endRaw);
  if (!start || !end || !(start < end)) return { ok: true, requiredCheckinDay: null, requiredCheckoutDay: null };
  const arrivalPeriod = getPeriodForNight(periods, start);
  const lastNight = new Date(end);
  lastNight.setDate(lastNight.getDate() - 1);
  const departurePeriod = getPeriodForNight(periods, lastNight);
  const requiredCheckinDay = String(arrivalPeriod?.checkin_jour || '').trim().toLowerCase() || null;
  const requiredCheckoutDay = String(departurePeriod?.checkout_jour || '').trim().toLowerCase() || null;
  const startDay = getWeekdayFr(start);
  const endDay = getWeekdayFr(end);
  return {
    ok: (!requiredCheckinDay || requiredCheckinDay === startDay) && (!requiredCheckoutDay || requiredCheckoutDay === endDay),
    requiredCheckinDay,
    requiredCheckoutDay,
  };
}

function evaluatePropertyStayBookability(property, startRaw, endRaw) {
  if (!isValidStayRange(startRaw, endRaw)) return { ok: false, reason: 'invalid' };
  if (hasBlockingUnavailableDates(property.unavailableDates || [], startRaw, endRaw)) {
    return { ok: false, reason: 'dates' };
  }
  const nights = computeStayNights(startRaw, endRaw);
  const minStay = Math.max(1, Number(property.seasonalConfig?.duree_min_sejour_nuits || property.seasonalConfig?.dureeMinSejourNuits || 1));
  const maxStay = Math.max(minStay, Number(property.seasonalConfig?.duree_max_sejour_nuits || property.seasonalConfig?.dureeMaxSejourNuits || 365));
  const requiredMinStay = getReservationMinStayRequirement(property.pricingPeriods || [], startRaw, endRaw, minStay);
  if (nights < requiredMinStay) return { ok: false, reason: `min_${requiredMinStay}` };
  if (nights > maxStay) return { ok: false, reason: `max_${maxStay}` };
  const weekdayRule = validateReservationWeekdayRule(property.pricingPeriods || [], startRaw, endRaw);
  if (!weekdayRule.ok) return { ok: false, reason: `weekday_${weekdayRule.requiredCheckinDay || 'none'}_${weekdayRule.requiredCheckoutDay || 'none'}` };
  return { ok: true, reason: 'ok' };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Echec API ${response.status} sur ${url}`);
  }
  return response.json();
}

(async () => {
  const today = new Date();
  const searchWindow = {
    start: addDays(today, 20),
    end: addDays(today, 27),
  };

    const rows = await fetchJson(`${API_BASE_URL}/biens`);
    const testRows = rows.filter((row) => ['TEST-STAY-001', 'TEST-STAY-002', 'TEST-STAY-003', 'TEST-STAY-004', 'TEST-STAY-900'].includes(String(row.reference || '').trim()));

    const byReference = new Map();
    for (const row of testRows) {
      const reference = String(row.reference || '').trim();
      let seasonalConfig = {};
      let pricingPeriods = [];
      try { seasonalConfig = JSON.parse(row.location_saisonniere_config_json || '{}') || {}; } catch {}
      try { pricingPeriods = JSON.parse(row.pricing_periods_json || '[]') || []; } catch {}
      const unavailableResponse = await fetchJson(`${API_BASE_URL}/unavailable-dates/${row.id}`);
      const unavailableDates = (Array.isArray(unavailableResponse) ? unavailableResponse : []).map((item) => ({
        start: toDateOnlyString(item.start || item.start_date),
        end: toDateOnlyString(item.end || item.end_date),
        status: String(item.status || '').toLowerCase(),
      }));
      byReference.set(reference, { unavailableDates, seasonalConfig, pricingPeriods });
    }

    const scenarios = [
      {
        name: 'Disponibilite coeur',
        start: searchWindow.start,
        end: searchWindow.end,
        expectations: {
          'TEST-STAY-001': { exactAvailable: true, alternativeLabel: 'aucune' },
          'TEST-STAY-002': { exactAvailable: false, alternativeLabel: '-1 nuit' },
          'TEST-STAY-003': { exactAvailable: false, alternativeLabel: '+7 j' },
          'TEST-STAY-004': { exactAvailable: false, alternativeLabel: 'aucune' },
        },
      },
      {
        name: 'Regle dimanche vers dimanche',
        start: '2026-06-08',
        end: '2026-06-14',
        expectations: {
          'TEST-STAY-001': { exactAvailable: false, alternativeLabel: '+1 nuit' },
        },
      },
      {
        name: 'Minimum 6 nuits',
        start: '2026-06-14',
        end: '2026-06-19',
        expectations: {
          'TEST-STAY-001': { exactAvailable: false, alternativeLabel: '+1 nuit' },
        },
      },
      {
        name: 'Master exact valide',
        start: '2026-07-05',
        end: '2026-07-12',
        expectations: {
          'TEST-STAY-900': { exactAvailable: true, alternativeLabel: 'aucune' },
        },
      },
      {
        name: 'Master checkin checkout dimanche',
        start: '2026-07-06',
        end: '2026-07-12',
        expectations: {
          'TEST-STAY-900': { exactAvailable: false, alternativeLabel: '+1 nuit' },
        },
      },
      {
        name: 'Master minimum 6 nuits',
        start: '2026-07-19',
        end: '2026-07-24',
        expectations: {
          'TEST-STAY-900': { exactAvailable: false, alternativeLabel: '+1 nuit' },
        },
      },
      {
        name: 'Master indisponible moins une nuit',
        start: '2026-08-09',
        end: '2026-08-16',
        expectations: {
          'TEST-STAY-900': { exactAvailable: false, alternativeLabel: '-1 nuit' },
        },
      },
      {
        name: 'Master decalage plus 7 jours',
        start: '2026-07-26',
        end: '2026-08-02',
        expectations: {
          'TEST-STAY-900': { exactAvailable: false, alternativeLabel: '+7 j' },
        },
      },
      {
        name: 'Master aucune alternative',
        start: '2026-07-19',
        end: '2026-08-02',
        expectations: {
          'TEST-STAY-900': { exactAvailable: false, alternativeLabel: 'aucune' },
        },
      },
      {
        name: 'Master scenario combine min plus dimanche',
        start: '2026-08-24',
        end: '2026-08-30',
        expectations: {
          'TEST-STAY-900': { exactAvailable: false, alternativeLabel: '+1 nuit' },
        },
      },
    ];

    const problems = [];
    console.log(`Plage de recherche UI recommandee: ${searchWindow.start} -> ${searchWindow.end}`);

    for (const scenario of scenarios) {
      console.log(`\nScenario: ${scenario.name} (${scenario.start} -> ${scenario.end})`);
      for (const [reference, expected] of Object.entries(scenario.expectations)) {
        const property = byReference.get(reference) || { unavailableDates: [], pricingPeriods: [], seasonalConfig: {} };
        const exact = evaluatePropertyStayBookability(property, scenario.start, scenario.end);
        const alternative = exact.ok
          ? null
          : findBestStayRangeAlternative(
            scenario.start,
            scenario.end,
            (candidateStart, candidateEnd) => evaluatePropertyStayBookability(property, candidateStart, candidateEnd).ok,
            7,
            7
          );
        const alternativeLabel = labelAlternative(alternative);

        console.log(`${reference}: exact=${exact.ok ? 'oui' : 'non'} | raison=${exact.reason} | alternative=${alternativeLabel}${alternative ? ` | plage=${alternative.start}->${alternative.end}` : ''}`);
        if (expected.exactAvailable !== exact.ok) {
          problems.push(`${scenario.name} / ${reference}: disponibilite exacte attendue=${expected.exactAvailable} obtenue=${exact.ok}`);
        }
        if (expected.alternativeLabel !== alternativeLabel) {
          problems.push(`${scenario.name} / ${reference}: alternative attendue=${expected.alternativeLabel} obtenue=${alternativeLabel}`);
        }
      }
    }

    if (problems.length > 0) {
      console.error('\nECARTS DETECTES:');
      problems.forEach((problem) => console.error(`- ${problem}`));
      process.exit(2);
    }

  console.log('\nOK: logique disponibilite/alternatives conforme aux cas TEST-STAY-*');
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
