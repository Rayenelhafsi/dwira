const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Echec API ${response.status} sur ${url}`);
  return response.json();
}

function normalizeDate(value) {
  return String(value || '').slice(0, 10);
}

function normalizeRange(range) {
  return {
    start: normalizeDate(range.start || range.start_date),
    end: normalizeDate(range.end || range.end_date),
    status: String(range.status || '').trim().toLowerCase(),
  };
}

(async () => {
  const rows = await fetchJson(`${API_BASE_URL}/biens`);
  const seasonal = (Array.isArray(rows) ? rows : []).filter((row) => String(row.mode || '') === 'location_saisonniere');
  const failures = [];

  console.log(`Audit unavailableDates embarquees dans /biens`);
  console.log(`Biens saisonniers controles: ${seasonal.length}`);

  for (const row of seasonal) {
    const payloadRanges = (Array.isArray(row.unavailableDates) ? row.unavailableDates : []).map(normalizeRange);
    const directRanges = (await fetchJson(`${API_BASE_URL}/unavailable-dates/${encodeURIComponent(String(row.id || ''))}`)).map(normalizeRange);

    const payloadKeys = new Set(payloadRanges.map((item) => `${item.start}|${item.end}|${item.status}`));
    const directKeys = new Set(directRanges.map((item) => `${item.start}|${item.end}|${item.status}`));

    const missingInPayload = [...directKeys].filter((key) => !payloadKeys.has(key));
    const extraInPayload = [...payloadKeys].filter((key) => !directKeys.has(key));

    if (missingInPayload.length > 0 || extraInPayload.length > 0) {
      failures.push({
        reference: row.reference,
        id: row.id,
        missingInPayload,
        extraInPayload,
      });
    }
  }

  if (failures.length > 0) {
    console.error(`\nECARTS DETECTES: ${failures.length}`);
    failures.slice(0, 30).forEach((failure) => {
      console.error(`- ${failure.reference} (${failure.id})`);
      if (failure.missingInPayload.length > 0) {
        console.error(`  missing: ${failure.missingInPayload.join(', ')}`);
      }
      if (failure.extraInPayload.length > 0) {
        console.error(`  extra: ${failure.extraInPayload.join(', ')}`);
      }
    });
    process.exit(2);
  }

  console.log('\nOK: /api/biens expose exactement les memes indisponibilites que /api/unavailable-dates/:bien_id.');
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
