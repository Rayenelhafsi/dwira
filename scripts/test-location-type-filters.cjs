const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Echec API ${response.status} sur ${url}`);
  return response.json();
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

function getMainTypeFromType(type) {
  const normalized = normalizeToken(type);
  if (normalized === 'villa maison' || normalized === 'villa' || normalized === 'maison') return 'villa_maison';
  if (normalized === 'studio') return 'studio';
  if (normalized === 'bungalow') return 'bungalow';
  return 'appartement';
}

function locationMatches(property, location) {
  const propertyLocation = String(property.location || '').toLowerCase();
  const target = String(location || '').toLowerCase();
  if (propertyLocation.includes(target)) return true;
  return normalizeToken(property.location).includes(normalizeToken(location).split(' ')[0] || '');
}

function typeMatches(property, mainType) {
  return getMainTypeFromType(property.type) === mainType;
}

(async () => {
  const rows = await fetchJson(`${API_BASE_URL}/biens`);
  const properties = rows
    .filter((row) => String(row.mode || 'location_saisonniere') === 'location_saisonniere' && Number(row.visible_sur_site || 0) === 1)
    .map((row) => ({
      reference: row.reference,
      type: row.type,
      location: row.zone_nom || '',
    }))
    .filter((row) => String(row.reference || '').startsWith('TEST-STAY-'));

  const scenarios = [
    {
      name: 'Filtre emplacement Ezzahra',
      location: 'Ezzahra',
      mainType: null,
      expectedRefs: ['TEST-STAY-002'],
    },
    {
      name: 'Filtre emplacement Plage El Mansoura',
      location: 'Plage El Mansoura',
      mainType: null,
      expectedRefs: ['TEST-STAY-004', 'TEST-STAY-900'],
    },
    {
      name: 'Filtre type appartement',
      location: null,
      mainType: 'appartement',
      expectedRefs: ['TEST-STAY-001', 'TEST-STAY-002'],
    },
    {
      name: 'Filtre type villa_maison',
      location: null,
      mainType: 'villa_maison',
      expectedRefs: ['TEST-STAY-003', 'TEST-STAY-004', 'TEST-STAY-900'],
    },
    {
      name: 'Filtre combine Ezzahra + appartement',
      location: 'Ezzahra',
      mainType: 'appartement',
      expectedRefs: ['TEST-STAY-002'],
    },
    {
      name: 'Filtre combine Plage El Mansoura + villa_maison',
      location: 'Plage El Mansoura',
      mainType: 'villa_maison',
      expectedRefs: ['TEST-STAY-004', 'TEST-STAY-900'],
    },
  ];

  const problems = [];
  console.log('Validation filtres emplacement + type de bien');

  for (const scenario of scenarios) {
    const matched = properties.filter((property) => {
      if (scenario.location && !locationMatches(property, scenario.location)) return false;
      if (scenario.mainType && !typeMatches(property, scenario.mainType)) return false;
      return true;
    });
    const refs = matched.map((item) => item.reference).sort();
    const expected = [...scenario.expectedRefs].sort();
    console.log(`${scenario.name}: ${refs.join(', ') || 'aucun'}`);
    if (JSON.stringify(refs) !== JSON.stringify(expected)) {
      problems.push(`${scenario.name}: attendu=${expected.join(', ')} obtenu=${refs.join(', ')}`);
    }
  }

  if (problems.length > 0) {
    console.error('\nECARTS DETECTES:');
    problems.forEach((problem) => console.error(`- ${problem}`));
    process.exit(2);
  }

  console.log('\nOK: la logique existante des filtres emplacement/type n est pas cassee.');
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
