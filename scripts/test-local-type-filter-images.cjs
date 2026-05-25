const PROD_API_URL = process.env.PROD_API_URL || 'https://dwiraimmobilier.com/api/type-filter-images';
const LOCAL_API_URL = process.env.LOCAL_API_URL || 'http://localhost:3001/api/type-filter-images';

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row.mode_bien || '').trim() === 'location_saisonniere')
    .map((row) => ({
      mode_bien: 'location_saisonniere',
      main_type: String(row.main_type || '').trim(),
      sub_type: row.sub_type === null || row.sub_type === undefined || String(row.sub_type).trim() === '' ? null : String(row.sub_type).trim(),
      image_url: String(row.image_url || '').trim(),
    }))
    .sort((a, b) =>
      `${a.mode_bien}|${a.main_type}|${a.sub_type || ''}`.localeCompare(`${b.mode_bien}|${b.main_type}|${b.sub_type || ''}`, 'fr')
    );
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Echec ${response.status} sur ${url}`);
  return response.json();
}

(async () => {
  const prodRows = normalizeRows(await fetchJson(PROD_API_URL));
  const localRows = normalizeRows(await fetchJson(LOCAL_API_URL));

  console.log(`prod rows: ${prodRows.length}`);
  console.log(`local rows: ${localRows.length}`);

  const prodJson = JSON.stringify(prodRows);
  const localJson = JSON.stringify(localRows);
  if (prodJson !== localJson) {
    console.error('ECART DETECTE entre prod et local pour type_filter_images');
    process.exit(2);
  }

  console.log('OK: type_filter_images local repliquent la prod pour location_saisonniere.');
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
