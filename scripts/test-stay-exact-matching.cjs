const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeDateOnlyInput(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatLocalDate(value);
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
    const rangeStart = parseDateOnly(range?.start || range?.start_date);
    const rangeEnd = parseDateOnly(range?.end || range?.end_date);
    if (!rangeStart || !rangeEnd) return false;
    return rangeStart < stayEnd && rangeEnd > stayStart;
  });
}

function getWeekdayFr(date) {
  return ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][date.getDay()];
}

function getPeriodForNight(periods, date) {
  const target = normalizeDateOnlyInput(date);
  return (Array.isArray(periods) ? periods : [])
    .filter((period) => {
      const start = normalizeDateOnlyInput(period?.start || period?.start_date);
      const end = normalizeDateOnlyInput(period?.end || period?.end_date);
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
  if (!start || !end || !(start < end)) return { ok: true, reason: 'dates_invalides' };

  const arrivalPeriod = getPeriodForNight(periods, start);
  const lastNight = new Date(end);
  lastNight.setDate(lastNight.getDate() - 1);
  const departurePeriod = getPeriodForNight(periods, lastNight);
  const requiredCheckinDay = String(arrivalPeriod?.checkin_jour || '').trim().toLowerCase() || null;
  const requiredCheckoutDay = String(departurePeriod?.checkout_jour || '').trim().toLowerCase() || null;
  const startDay = getWeekdayFr(start);
  const endDay = getWeekdayFr(end);
  const ok = (!requiredCheckinDay || requiredCheckinDay === startDay) && (!requiredCheckoutDay || requiredCheckoutDay === endDay);
  return {
    ok,
    reason: ok ? 'ok' : `weekday_${requiredCheckinDay || 'none'}_${requiredCheckoutDay || 'none'}`,
  };
}

function evaluateExactMatch(property, startRaw, endRaw) {
  const minStay = Math.max(1, Number(property.seasonalConfig?.duree_min_sejour_nuits || 1));
  const maxStay = Math.max(minStay, Number(property.seasonalConfig?.duree_max_sejour_nuits || 365));
  const nights = computeStayNights(startRaw, endRaw);

  if (hasBlockingUnavailableDates(property.unavailableDates, startRaw, endRaw)) {
    return { ok: false, reason: 'dates' };
  }

  const requiredMinStay = getReservationMinStayRequirement(property.pricingPeriods, startRaw, endRaw, minStay);
  if (nights < requiredMinStay) {
    return { ok: false, reason: `min_${requiredMinStay}` };
  }

  if (nights > maxStay) {
    return { ok: false, reason: `max_${maxStay}` };
  }

  const weekdayRule = validateReservationWeekdayRule(property.pricingPeriods, startRaw, endRaw);
  if (!weekdayRule.ok) return { ok: false, reason: weekdayRule.reason };

  return { ok: true, reason: 'ok' };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Echec API ${response.status} sur ${url}`);
  return response.json();
}

async function loadProperty(reference) {
  const rows = await fetchJson(`${API_BASE_URL}/biens`);
  const row = rows.find((item) => String(item.reference || '').trim() === reference);
  if (!row) throw new Error(`Bien introuvable: ${reference}`);

  const unavailableRows = await fetchJson(`${API_BASE_URL}/unavailable-dates/${row.id}`);
  return {
    reference,
    seasonalConfig: JSON.parse(row.location_saisonniere_config_json || '{}'),
    pricingPeriods: JSON.parse(row.pricing_periods_json || '[]'),
    unavailableDates: (Array.isArray(unavailableRows) ? unavailableRows : []).map((item) => ({
      start: normalizeDateOnlyInput(item.start || item.start_date),
      end: normalizeDateOnlyInput(item.end || item.end_date),
      status: String(item.status || '').toLowerCase(),
    })),
  };
}

(async () => {
  const master = await loadProperty('TEST-STAY-900');
  const scenarios = [
    { name: 'Exact valide', start: '2026-07-05', end: '2026-07-12', ok: true, reason: 'ok' },
    { name: 'Checkin checkout dimanche', start: '2026-07-06', end: '2026-07-12', ok: false, reason: 'weekday_dimanche_dimanche' },
    { name: 'Minimum 6 nuits', start: '2026-09-15', end: '2026-09-20', ok: false, reason: 'min_6' },
    { name: 'Indisponible exact', start: '2026-08-09', end: '2026-08-16', ok: false, reason: 'dates' },
    { name: 'Decalage semaine bloque', start: '2026-07-26', end: '2026-08-02', ok: false, reason: 'dates' },
    { name: 'Aucune alternative potentielle exacte', start: '2026-07-19', end: '2026-08-02', ok: false, reason: 'dates' },
    { name: 'Scenario combine min et dimanche', start: '2026-08-24', end: '2026-08-30', ok: false, reason: 'min_7' },
  ];

  const problems = [];
  console.log(`Validation 100% matching pour ${master.reference}`);

  for (const scenario of scenarios) {
    const result = evaluateExactMatch(master, scenario.start, scenario.end);
    console.log(`${scenario.name}: ${scenario.start} -> ${scenario.end} | exact=${result.ok ? 'oui' : 'non'} | raison=${result.reason}`);
    if (result.ok !== scenario.ok) {
      problems.push(`${scenario.name}: exact attendu=${scenario.ok} obtenu=${result.ok}`);
    }
    if (result.reason !== scenario.reason) {
      problems.push(`${scenario.name}: raison attendue=${scenario.reason} obtenue=${result.reason}`);
    }
  }

  if (problems.length > 0) {
    console.error('\nECARTS DETECTES:');
    problems.forEach((problem) => console.error(`- ${problem}`));
    process.exit(2);
  }

  console.log('\nOK: les matchs exacts 100% respectent les regles stockees du bien maitre.');
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
