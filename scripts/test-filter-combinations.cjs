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

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
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
  if (!start || !end || !(start < end)) return { ok: true };

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
  };
}

function evaluateExactDate(property, startRaw, endRaw) {
  const minStay = Math.max(1, Number(property.seasonalConfig?.duree_min_sejour_nuits || 1));
  const maxStay = Math.max(minStay, Number(property.seasonalConfig?.duree_max_sejour_nuits || 365));
  const nights = computeStayNights(startRaw, endRaw);

  if (hasBlockingUnavailableDates(property.unavailableDates, startRaw, endRaw)) return false;
  if (nights < getReservationMinStayRequirement(property.pricingPeriods, startRaw, endRaw, minStay)) return false;
  if (nights > maxStay) return false;
  return validateReservationWeekdayRule(property.pricingPeriods, startRaw, endRaw).ok;
}

function getMainTypeFromType(type) {
  const normalized = normalizeToken(type);
  if (normalized.includes('villa')) return 'villa_maison';
  if (normalized === 'studio') return 'studio';
  if (normalized === 'bungalow') return 'bungalow';
  if (normalized === 'immeuble') return 'immeuble';
  return 'appartement';
}

function scoreProperty(property, filters) {
  let score = 0;
  let maxScore = 0;

  if (filters.location) {
    maxScore += 18;
    const exact = String(property.location || '').toLowerCase().includes(String(filters.location).toLowerCase());
    if (exact) score += 18;
    else if (normalizeToken(property.location).includes(normalizeToken(filters.location).split(' ')[0] || '')) score += 8;
  }

  if (filters.mainType) {
    maxScore += 16;
    if (getMainTypeFromType(property.type) === filters.mainType) score += 16;
  }

  if (filters.subType) {
    maxScore += 16;
    if (normalizeToken(property.configuration) === normalizeToken(filters.subType)) score += 16;
  }

  maxScore += 10;
  if (Number(property.pricePerNight || 0) <= Number(filters.priceMax)) score += 10;
  else {
    const over = Number(property.pricePerNight || 0) - Number(filters.priceMax || 0);
    const ratio = over / Math.max(1, Number(filters.priceMax || 0));
    if (ratio <= 0.2) score += 5;
  }

  if (filters.standing) {
    maxScore += 6;
    if (String(property.seasonalConfig?.categorie_standing || '') === String(filters.standing)) score += 6;
  }

  if (Number(filters.minGuests || 1) > 1) {
    maxScore += 6;
    if (Number(property.guests || 1) >= Number(filters.minGuests)) score += 6;
    else if (Number(filters.minGuests) - Number(property.guests || 1) <= 1) score += 3;
  }

  if (filters.checkIn && filters.checkOut) {
    maxScore += 20;
    if (evaluateExactDate(property, filters.checkIn, filters.checkOut)) score += 20;
  }

  const normalizedScore = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((score / maxScore) * 100))) : 100;
  return normalizedScore;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Echec API ${response.status} sur ${url}`);
  return response.json();
}

async function loadProperties() {
  const rows = await fetchJson(`${API_BASE_URL}/biens`);
  const filtered = rows.filter((row) => String(row.reference || '').startsWith('TEST-STAY-'));
  const result = [];
  for (const row of filtered) {
    const unavailableRows = await fetchJson(`${API_BASE_URL}/unavailable-dates/${row.id}`);
    result.push({
      reference: row.reference,
      location: row.zone_nom || '',
      type: row.type,
      configuration: row.configuration || '',
      pricePerNight: Number(row.prix_nuitee || 0),
      guests: Number(JSON.parse(row.location_saisonniere_config_json || '{}')?.limite_personnes_nuit || row.nb_chambres || 1),
      seasonalConfig: JSON.parse(row.location_saisonniere_config_json || '{}'),
      pricingPeriods: JSON.parse(row.pricing_periods_json || '[]'),
      unavailableDates: (Array.isArray(unavailableRows) ? unavailableRows : []).map((item) => ({
        start: normalizeDateOnlyInput(item.start || item.start_date),
        end: normalizeDateOnlyInput(item.end || item.end_date),
        status: String(item.status || '').toLowerCase(),
      })),
    });
  }
  return result;
}

(async () => {
  const properties = await loadProperties();
  const scenarios = [
    {
      name: 'Combo exact TEST-STAY-001',
      filters: {
        location: 'Centre Ville',
        mainType: 'appartement',
        subType: 'S+2',
        standing: 'confort',
        minGuests: 4,
        priceMax: 330,
        checkIn: '2026-06-14',
        checkOut: '2026-06-21',
      },
      expected100: ['TEST-STAY-001'],
    },
    {
      name: 'Combo Ezzahra bloque par dates',
      filters: {
        location: 'Ezzahra',
        mainType: 'appartement',
        subType: 'S+2',
        standing: 'confort',
        minGuests: 4,
        priceMax: 340,
        checkIn: '2026-06-14',
        checkOut: '2026-06-21',
      },
      expected100: [],
    },
    {
      name: 'Combo exact TEST-STAY-900',
      filters: {
        location: 'Plage El Mansoura',
        mainType: 'villa_maison',
        subType: 'S+3',
        standing: 'premium',
        minGuests: 8,
        priceMax: 760,
        checkIn: '2026-07-05',
        checkOut: '2026-07-12',
      },
      expected100: ['TEST-STAY-900'],
    },
    {
      name: 'Combo villa Mansoura avec 9 voyageurs',
      filters: {
        location: 'Plage El Mansoura',
        mainType: 'villa_maison',
        subType: 'S+3',
        standing: 'premium',
        minGuests: 9,
        priceMax: 760,
        checkIn: '2026-07-05',
        checkOut: '2026-07-12',
      },
      expected100: [],
    },
  ];

  const problems = [];
  console.log('Validation combinaisons de filtres');

  for (const scenario of scenarios) {
    const rows = properties.map((property) => ({
      reference: property.reference,
      score: scoreProperty(property, scenario.filters),
    })).sort((a, b) => b.score - a.score || a.reference.localeCompare(b.reference, 'fr'));

    const exact100 = rows.filter((row) => row.score === 100).map((row) => row.reference).sort();
    const expected = [...scenario.expected100].sort();
    console.log(`\n${scenario.name}`);
    rows.forEach((row) => console.log(`- ${row.reference}: ${row.score}%`));

    if (JSON.stringify(exact100) !== JSON.stringify(expected)) {
      problems.push(`${scenario.name}: attendus à 100%=${expected.join(', ') || 'aucun'} obtenus=${exact100.join(', ') || 'aucun'}`);
    }
  }

  if (problems.length > 0) {
    console.error('\nECARTS DETECTES:');
    problems.forEach((problem) => console.error(`- ${problem}`));
    process.exit(2);
  }

  console.log('\nOK: les combinaisons de filtres ne donnent 100% qu aux biens qui valident tous les criteres.');
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
