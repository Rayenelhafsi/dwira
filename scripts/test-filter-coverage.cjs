const mysql = require('mysql2/promise');

const SEASIDE = ['pied_dans_eau', 'vue_sur_mer', 'pres_plage'];
const COMFORT = ['climatise', 'toutes_pieces_climatisees', 'rdc', 'jardin_gazon', 'terrasse', 'piscine_privee', 'piscine_partagee'];
const STANDING = ['economique', 'confort', 'premium', 'luxe'];

function norm(v) {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(blob, tokens) {
  return tokens.some((t) => blob.includes(norm(t)));
}

function matchSeaside(p, option) {
  const sc = p.sc || {};
  const blob = norm([p.titre, p.description, p.zoneNom, p.type, p.configuration].join(' '));
  const distance = Number(sc.distancePlageM ?? Number.NaN);
  const hasDistance = Number.isFinite(distance);
  if (option === 'pied_dans_eau') return (Boolean(sc.vueMer) && hasDistance && distance <= 50) || hasAny(blob, ['pied dans l eau', 'front de mer', 'bord de mer', 'acces direct plage']);
  if (option === 'vue_sur_mer') return sc.vue === 'mer' || Boolean(sc.vueMer) || hasAny(blob, ['vue sur mer', 'vue mer']);
  if (option === 'pres_plage') return Boolean(sc.prochePlage) || (hasDistance && distance <= 300) || hasAny(blob, ['proche plage', 'pres de la plage', 'plage']);
  return false;
}

function matchComfort(p, option) {
  const sc = p.sc || {};
  const blob = norm([p.titre, p.description, p.zoneNom, p.type, p.configuration].join(' '));
  const exterieur = Array.isArray(sc.exterieurJardin) ? sc.exterieurJardin.map(norm) : [];
  const interieur = Array.isArray(sc.confortEquipementsInterieurs) ? sc.confortEquipementsInterieurs.map(norm) : [];
  const hasEx = (...tokens) => tokens.some((t) => exterieur.some((v) => v.includes(norm(t))));
  const hasIn = (...tokens) => tokens.some((t) => interieur.some((v) => v.includes(norm(t))));
  if (option === 'climatise') return Boolean(sc.climatisation) || hasIn('climatise', 'climatisation') || hasAny(blob, ['climatise', 'climatisation']);
  if (option === 'toutes_pieces_climatisees') return hasIn('toutes les pieces climatisees', 'toutes pieces climatisees') || hasAny(blob, ['toutes les pieces climatisees', 'toutes pieces climatisees', 'climatisation complete']);
  if (option === 'rdc') return String(sc.etage || '').toLowerCase() === 'rdc' || hasAny(blob, ['rdc', 'rez de chaussee']);
  if (option === 'jardin_gazon') return hasEx('jardin', 'gazon', 'pelouse', 'espace vert') || hasAny(blob, ['jardin', 'gazon', 'pelouse']);
  if (option === 'terrasse') return Boolean(sc.terrasse) || hasEx('terrasse') || hasAny(blob, ['terrasse']);
  if (option === 'piscine_privee') return hasEx('piscine privee') || hasAny(blob, ['piscine privee']);
  if (option === 'piscine_partagee') return hasEx('piscine partagee', 'piscine commune', 'piscine collective') || hasAny(blob, ['piscine partagee', 'piscine commune', 'piscine collective']);
  return false;
}

(async () => {
  const c = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: '', database: 'dwira' });
  try {
    const [rows] = await c.query(`
      SELECT b.id,b.reference,b.titre,b.description,b.type,b.configuration,b.mode,b.zone_id,b.prix_nuitee,b.prix_semaine,
             b.climatisation,b.terrasse,b.vue_mer,b.proche_plage,b.distance_plage_m,
             b.location_saisonniere_config_json,z.nom AS zone_nom,z.pays,z.gouvernerat,z.region,z.quartier
      FROM biens b
      LEFT JOIN zones z ON z.id=b.zone_id
      WHERE b.mode='location_saisonniere' AND b.visible_sur_site=1
    `);
    const props = rows.map((r) => {
      let raw = {};
      try { raw = JSON.parse(r.location_saisonniere_config_json || '{}'); } catch {}
      return {
        id: r.id,
        reference: r.reference,
        titre: r.titre,
        description: r.description,
        type: r.type,
        configuration: r.configuration,
        zoneNom: r.zone_nom,
        zone: { pays: r.pays, gouvernerat: r.gouvernerat, region: r.region, quartier: r.quartier },
        prixNuit: Number(r.prix_nuitee || 0),
        prixSemaine: Number(r.prix_semaine || 0),
        sc: {
          vue: raw.vue || null,
          etage: raw.etage || null,
          categorieStanding: raw.categorie_standing || null,
          climatisation: Boolean(r.climatisation),
          terrasse: Boolean(r.terrasse),
          vueMer: Boolean(r.vue_mer) || raw.vue === 'mer',
          prochePlage: Boolean(r.proche_plage) || Boolean(raw.proche_plage),
          distancePlageM: Number(raw.distance_plage_m ?? Number.NaN),
          exterieurJardin: Array.isArray(raw.exterieur_jardin) ? raw.exterieur_jardin : [],
          confortEquipementsInterieurs: Array.isArray(raw.confort_equipements_interieurs) ? raw.confort_equipements_interieurs : [],
          maxGuests: Number(raw.limite_personnes_nuit || 0),
        },
      };
    });

    const coverage = {
      seaside: Object.fromEntries(SEASIDE.map((k) => [k, props.filter((p) => matchSeaside(p, k)).map((p) => p.reference)])),
      comfort: Object.fromEntries(COMFORT.map((k) => [k, props.filter((p) => matchComfort(p, k)).map((p) => p.reference)])),
      standing: Object.fromEntries(STANDING.map((k) => [k, props.filter((p) => p.sc.categorieStanding === k).map((p) => p.reference)])),
      location: {
        pays: [...new Set(props.map((p) => p.zone.pays).filter(Boolean))],
        gouvernerat: [...new Set(props.map((p) => p.zone.gouvernerat).filter(Boolean))],
        region: [...new Set(props.map((p) => p.zone.region).filter(Boolean))],
        zone: [...new Set(props.map((p) => p.zone.quartier || p.zoneNom).filter(Boolean))],
      },
      pricing: {
        minNuit: Math.min(...props.map((p) => p.prixNuit)),
        maxNuit: Math.max(...props.map((p) => p.prixNuit)),
        withWeekly: props.filter((p) => p.prixSemaine > 0).map((p) => p.reference),
      },
      guests: {
        min: Math.min(...props.map((p) => Number(p.sc.maxGuests || 1))),
        max: Math.max(...props.map((p) => Number(p.sc.maxGuests || 1))),
      },
    };

    const expectedByFilter = {
      seaside: {
        pied_dans_eau: ['TEST-COV-003'],
        vue_sur_mer: ['TEST-COV-002', 'TEST-COV-003', 'TEST-COV-004'],
        pres_plage: ['TEST-COV-001', 'TEST-COV-003', 'TEST-COV-004', 'TEST-COV-006', 'TEST-COV-009'],
      },
      comfort: {
        climatise: ['TEST-COV-001', 'TEST-COV-002', 'TEST-COV-003', 'TEST-COV-004', 'TEST-COV-005', 'TEST-COV-006', 'TEST-COV-007', 'TEST-COV-008'],
        toutes_pieces_climatisees: ['TEST-COV-002', 'TEST-COV-008'],
        rdc: ['TEST-COV-001', 'TEST-COV-003', 'TEST-COV-005', 'TEST-COV-007', 'TEST-COV-008'],
        jardin_gazon: ['TEST-COV-003', 'TEST-COV-009'],
        terrasse: ['TEST-COV-001', 'TEST-COV-003', 'TEST-COV-006', 'TEST-COV-007', 'TEST-COV-009'],
        piscine_privee: ['TEST-COV-003'],
        piscine_partagee: ['TEST-COV-004', 'TEST-COV-009'],
      },
      standing: {
        economique: ['TEST-COV-001', 'TEST-COV-005'],
        confort: ['TEST-COV-002', 'TEST-COV-006', 'TEST-COV-007', 'TEST-COV-008'],
        premium: ['TEST-COV-003', 'TEST-COV-009'],
        luxe: ['TEST-COV-004'],
      },
    };

    const uniqueSorted = (arr) => [...new Set(arr)].sort();
    const problems = [];

    Object.entries(expectedByFilter.seaside).forEach(([key, expected]) => {
      const actual = uniqueSorted((coverage.seaside[key] || []).filter((ref) => ref.startsWith('TEST-COV-')));
      const exp = uniqueSorted(expected);
      if (JSON.stringify(actual) !== JSON.stringify(exp)) {
        problems.push(`[seaside:${key}] attendu=${exp.join(',')} obtenu=${actual.join(',')}`);
      }
    });

    Object.entries(expectedByFilter.comfort).forEach(([key, expected]) => {
      const actual = uniqueSorted((coverage.comfort[key] || []).filter((ref) => ref.startsWith('TEST-COV-')));
      const exp = uniqueSorted(expected);
      if (JSON.stringify(actual) !== JSON.stringify(exp)) {
        problems.push(`[comfort:${key}] attendu=${exp.join(',')} obtenu=${actual.join(',')}`);
      }
    });

    Object.entries(expectedByFilter.standing).forEach(([key, expected]) => {
      const actual = uniqueSorted((coverage.standing[key] || []).filter((ref) => ref.startsWith('TEST-COV-')));
      const exp = uniqueSorted(expected);
      if (JSON.stringify(actual) !== JSON.stringify(exp)) {
        problems.push(`[standing:${key}] attendu=${exp.join(',')} obtenu=${actual.join(',')}`);
      }
    });

    console.log(JSON.stringify(coverage, null, 2));
    if (problems.length > 0) {
      console.error('\nECARTS DETECTES:');
      problems.forEach((p) => console.error(`- ${p}`));
      process.exit(2);
    }
    console.log('\nOK: couverture filtres conforme aux attentes sur TEST-COV-*');
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
