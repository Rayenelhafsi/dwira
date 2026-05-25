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
    .replace(/\s+/g, ' ')
    .trim();
}

function getPropertyLocationValues(property) {
  return [
    property.zone_pays,
    property.zone_gouvernerat,
    property.zone_region,
    property.zone_quartier,
    property.zone_nom,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function locationMatch(property, selectedLocation) {
  const selected = normalizeToken(selectedLocation);
  const values = Array.from(new Set(getPropertyLocationValues(property).map(normalizeToken).filter(Boolean)));
  if (values.includes(selected)) return 'exact';
  const firstToken = selected.split(' ')[0] || '';
  if (values.some((value) => value.includes(selected) || selected.includes(value) || (firstToken && value.includes(firstToken)))) {
    return 'partial';
  }
  return 'none';
}

(async () => {
  const [rows, zones] = await Promise.all([
    fetchJson(`${API_BASE_URL}/biens`),
    fetchJson(`${API_BASE_URL}/zones`),
  ]);
  const zonesById = new Map((Array.isArray(zones) ? zones : []).map((zone) => [String(zone.id), zone]));
  const properties = rows
    .filter((row) => String(row.mode || 'location_saisonniere') === 'location_saisonniere' && Number(row.visible_sur_site || 0) === 1)
    .filter((row) => String(row.reference || '').startsWith('TEST-STAY-'))
    .map((row) => {
      const zone = zonesById.get(String(row.zone_id || '')) || {};
      return {
      reference: row.reference,
      type: row.type,
      zone_nom: zone.nom || row.zone_nom,
      zone_pays: zone.pays || row.zone_pays,
      zone_gouvernerat: zone.gouvernerat || row.zone_gouvernerat,
      zone_region: zone.region || row.zone_region,
      zone_quartier: zone.quartier || row.zone_quartier,
      guests: Number(row.nb_chambres || 0) + 1,
      };
    });

  const findProperty = (reference) => {
    const property = properties.find((item) => item.reference === reference);
    if (!property) throw new Error(`Bien introuvable: ${reference}`);
    return property;
  };

  const kelibiaProperty = findProperty('TEST-STAY-003');
  const blockedByOtherFilterProperty = findProperty('TEST-STAY-900');

  const scenarios = [
    { name: 'Pays uniquement', property: kelibiaProperty, location: 'Tunisie', expected: 'exact' },
    { name: 'Gouvernerat uniquement', property: kelibiaProperty, location: 'Nabeul', expected: 'exact' },
    { name: 'Region uniquement', property: kelibiaProperty, location: 'Kélibia', expected: 'exact' },
    { name: 'Zone uniquement', property: kelibiaProperty, location: 'Petit Paris', expected: 'exact' },
    { name: 'Region sans accent', property: kelibiaProperty, location: 'kelibia', expected: 'exact' },
    { name: 'Lieu sans correspondance', property: kelibiaProperty, location: 'Hammam Ghezèze', expected: 'none' },
  ];

  const failures = [];
  console.log('Validation filtre hierarchique gouvernerat/region/zone');

  for (const scenario of scenarios) {
    const result = locationMatch(scenario.property, scenario.location);
    console.log(`${scenario.name}: ${scenario.location} => ${result}`);
    if (result !== scenario.expected) {
      failures.push(`${scenario.name}: attendu=${scenario.expected} obtenu=${result}`);
    }
  }

  const exactLocation = locationMatch(blockedByOtherFilterProperty, 'Nabeul') === 'exact';
  const guestFilterPasses = blockedByOtherFilterProperty.guests >= 9;
  console.log(`Combinaison avec autre filtre cassant le 100%: location exact=${exactLocation}, guests>=9=${guestFilterPasses}`);
  if (!exactLocation) {
    failures.push('Le bien TEST-STAY-900 devrait matcher exactement la location Nabeul.');
  }
  if (guestFilterPasses) {
    failures.push('Le bien TEST-STAY-900 ne devrait pas satisfaire une combinaison exigeant 9 voyageurs.');
  }

  if (failures.length > 0) {
    console.error('\nECARTS DETECTES:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(2);
  }

  console.log('\nOK: la hierarchie de localisation match exactement, et un autre filtre peut toujours empecher le 100%.');
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
