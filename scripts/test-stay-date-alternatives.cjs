const mysql = require('mysql2/promise');

function getDbConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dwira',
  };
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateOnly(value) {
  const raw = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnlyString(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalDate(value);
  }
  return String(value || '').trim().slice(0, 10);
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

function labelAlternative(alt) {
  if (!alt) return 'aucune';
  if (alt.kind === 'shorter') return '-1 nuit';
  if (alt.kind === 'longer') return '+1 nuit';
  return (alt.shiftDays || 0) > 0 ? '+7 j' : '-7 j';
}

(async () => {
  const conn = await mysql.createConnection(getDbConfig());

  try {
    const today = new Date();
    const searchWindow = {
      start: addDays(today, 20),
      end: addDays(today, 27),
    };

    const [rows] = await conn.query(`
      SELECT b.reference, u.start_date, u.end_date, u.status
      FROM biens b
      LEFT JOIN unavailable_dates u ON u.bien_id = b.id
      WHERE b.reference IN ('TEST-STAY-001', 'TEST-STAY-002', 'TEST-STAY-003', 'TEST-STAY-004')
      ORDER BY b.reference ASC, u.start_date ASC
    `);

    const byReference = new Map();
    for (const row of rows) {
      const reference = String(row.reference || '').trim();
      if (!byReference.has(reference)) byReference.set(reference, []);
      if (row.start_date && row.end_date) {
        byReference.get(reference).push({
          start: toDateOnlyString(row.start_date),
          end: toDateOnlyString(row.end_date),
          status: String(row.status || '').toLowerCase(),
        });
      }
    }

    const expectations = {
      'TEST-STAY-001': { exactAvailable: true, alternativeLabel: 'aucune' },
      'TEST-STAY-002': { exactAvailable: false, alternativeLabel: '-1 nuit' },
      'TEST-STAY-003': { exactAvailable: false, alternativeLabel: '+7 j' },
      'TEST-STAY-004': { exactAvailable: false, alternativeLabel: 'aucune' },
    };

    const problems = [];
    console.log(`Plage de recherche UI recommandee: ${searchWindow.start} -> ${searchWindow.end}`);

    for (const [reference, expected] of Object.entries(expectations)) {
      const ranges = byReference.get(reference) || [];
      const exactAvailable = !hasBlockingUnavailableDates(ranges, searchWindow.start, searchWindow.end);
      const alternative = exactAvailable
        ? null
        : (findOneNightFlexAvailabilityAlternative(ranges, searchWindow.start, searchWindow.end)
          || findWeeklyAvailabilityAlternative(ranges, searchWindow.start, searchWindow.end));
      const alternativeLabel = labelAlternative(alternative);

      console.log(`${reference}: exact=${exactAvailable ? 'oui' : 'non'} | alternative=${alternativeLabel}`);
      if (expected.exactAvailable !== exactAvailable) {
        problems.push(`${reference}: disponibilite exacte attendue=${expected.exactAvailable} obtenue=${exactAvailable}`);
      }
      if (expected.alternativeLabel !== alternativeLabel) {
        problems.push(`${reference}: alternative attendue=${expected.alternativeLabel} obtenue=${alternativeLabel}`);
      }
    }

    if (problems.length > 0) {
      console.error('\nECARTS DETECTES:');
      problems.forEach((problem) => console.error(`- ${problem}`));
      process.exit(2);
    }

    console.log('\nOK: logique disponibilite/alternatives conforme aux cas TEST-STAY-*');
  } finally {
    await conn.end();
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
