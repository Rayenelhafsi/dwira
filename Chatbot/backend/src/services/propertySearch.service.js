import { prisma } from "../config/prisma.js";
import { qdrant } from "../config/qdrant.js";
import { config } from "../config/env.js";
import { redis } from "../config/redis.js";
import { embedText } from "./rag/embedding.service.js";

const DATA_SOURCE = String(process.env.CHATBOT_DATA_SOURCE || "chatbot").trim().toLowerCase();
const PROJECT_DB = String(process.env.PROJECT_DB_NAME || "dwira").trim();

function norm(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonSafe(v) {
  if (!v) return {};
  if (typeof v === "object") return v;
  try { return JSON.parse(String(v)); } catch { return {}; }
}

function containsAnyNormalized(values, ...tokens) {
  const normalizedValues = (Array.isArray(values) ? values : [values])
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => norm(String(value || "")))
    .filter(Boolean);
  const normalizedTokens = tokens.map((token) => norm(token)).filter(Boolean);
  return normalizedTokens.some((token) => normalizedValues.some((value) => value.includes(token)));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), Math.max(1, ms))),
  ]);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeCacheFilters(filters) {
  const toNullableNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  return {
    location: String(filters?.location || "").trim().toLowerCase() || null,
    guests: toNullableNumber(filters?.guests),
    budget: toNullableNumber(filters?.budget),
    startDate: String(filters?.startDate || "").trim() || null,
    endDate: String(filters?.endDate || "").trim() || null,
    nearBeach: Boolean(filters?.nearBeach),
    seaView: Boolean(filters?.seaView),
    beachfront: Boolean(filters?.beachfront),
    pool: Boolean(filters?.pool),
    poolPrivate: Boolean(filters?.poolPrivate),
    poolShared: Boolean(filters?.poolShared),
    parking: Boolean(filters?.parking),
    type: String(filters?.type || "").trim().toLowerCase() || null,
    subType: String(filters?.subType || "").trim().toLowerCase() || null,
    bedrooms: toNullableNumber(filters?.bedrooms),
    floor: String(filters?.floor || "").trim().toLowerCase() || null,
    limit: Math.max(1, Math.min(200, Number(filters?.limit || config.chatbotSearchLimit || 60))),
    aiPlan: filters?.aiPlan && typeof filters.aiPlan === "object"
      ? {
          strategy: String(filters.aiPlan.strategy || "").trim().toLowerCase() || null,
          sort: String(filters.aiPlan.sort || "").trim().toLowerCase() || null,
          titleTerms: Array.isArray(filters.aiPlan.titleTerms) ? filters.aiPlan.titleTerms.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean) : [],
          textTerms: Array.isArray(filters.aiPlan.textTerms) ? filters.aiPlan.textTerms.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean) : [],
          zoneTerms: Array.isArray(filters.aiPlan.zoneTerms) ? filters.aiPlan.zoneTerms.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean) : [],
          excludeTerms: Array.isArray(filters.aiPlan.excludeTerms) ? filters.aiPlan.excludeTerms.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean) : [],
          filters: filters.aiPlan.filters || {},
        }
      : null,
  };
}

async function readSearchCache(key) {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeSearchCache(key, rows) {
  try {
    await redis.set(key, JSON.stringify(rows), "EX", 120);
  } catch {
    // Ignore cache write errors.
  }
}

function daysBetween(startDate, endDate) {
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
}

function getFloorRaw(p) {
  return String(p?.seasonalConfig?.etage ?? p?.etage ?? "").trim().toLowerCase();
}

function matchesSeasideOption(p, option) {
  const textBlob = norm([p.title, p.description, p.location, p.type].join(" "));
  const hasAny = (...tokens) => tokens.some((t) => textBlob.includes(norm(t)));
  const sc = p.seasonalConfig || {};
  const distancePlage = Number(sc.distancePlageM ?? Number.NaN);
  const hasDistance = Number.isFinite(distancePlage);
  if (option === "pied_dans_eau") {
    return (Boolean(sc.vueMer) && hasDistance && distancePlage <= 50)
      || hasAny("pied dans l eau", "front de mer", "bord de mer", "acces direct plage");
  }
  if (option === "vue_sur_mer") return sc.vue === "mer" || Boolean(sc.vueMer) || hasAny("vue sur mer", "vue mer");
  if (option === "pres_plage") {
    return Boolean(sc.prochePlage) || (hasDistance && distancePlage <= 300)
      || hasAny("proche plage", "pres de la plage", "a quelques pas de la plage");
  }
  return false;
}

function matchesComfortOption(p, option) {
  const textBlob = norm([p.title, p.description, p.location, p.type].join(" "));
  const hasAny = (...tokens) => tokens.some((t) => textBlob.includes(norm(t)));
  const sc = p.seasonalConfig || {};
  const exterior = Array.isArray(sc.exterieurJardin) ? sc.exterieurJardin : [];
  const interior = Array.isArray(sc.confortEquipementsInterieurs) ? sc.confortEquipementsInterieurs : [];
  const hasPrivatePool = Boolean(sc.piscinePrivee)
    || containsAnyNormalized(exterior, "piscine privee", "piscine privée")
    || hasAny("piscine privee", "piscine privée", "private pool");
  const hasSharedPool = Boolean(sc.piscinePartagee)
    || containsAnyNormalized(
      exterior,
      "piscine partagee",
      "piscine partagée",
      "piscine commune",
      "piscine collective",
      "piscine residence",
      "piscine résidence"
    )
    || hasAny("piscine partagee", "piscine partagée", "piscine commune", "shared pool");
  if (option === "piscine_privee") return hasPrivatePool;
  if (option === "piscine_partagee") return hasSharedPool;
  if (option === "rdc") {
    const floor = getFloorRaw(p);
    return floor === "rdc" || floor === "0";
  }
  if (option === "premier_etage") {
    const floor = getFloorRaw(p);
    return floor === "1" || floor === "1er" || floor === "1er etage" || floor === "1er étage" || hasAny("1er etage", "1er étage", "premier etage", "premier étage", "1st floor");
  }
  if (option === "climatise") return Boolean(sc.climatisation) || containsAnyNormalized(interior, "climatise", "climatisation") || hasAny("climatise", "climatisation");
  return false;
}

function toPositiveInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
}

function resolveProjectGuestCapacity(scRaw, nbChambres) {
  const totalLimit =
    toPositiveInt(scRaw?.limite_personnes_nuit)
    || toPositiveInt(scRaw?.limitePersonnesNuit)
    || toPositiveInt(scRaw?.limite_personne_nuit);
  if (totalLimit) return totalLimit;

  const maxAdults =
    toPositiveInt(scRaw?.max_adultes)
    || toPositiveInt(scRaw?.maxAdultes)
    || toPositiveInt(scRaw?.capaciteMaxAdultes);
  const maxChildren =
    toPositiveInt(scRaw?.max_enfants)
    || toPositiveInt(scRaw?.maxEnfants)
    || toPositiveInt(scRaw?.capacite_enfants_personne)
    || toPositiveInt(scRaw?.capaciteEnfantsPersonne);
  if (maxAdults && maxChildren !== null) return Math.max(1, maxAdults + Math.max(0, maxChildren));
  if (maxAdults) return maxAdults;
  return Math.max(1, Number(nbChambres || 0) + 1);
}

function mapProjectRows(rows, mediaRows = []) {
  const mediaByBien = new Map();
  for (const m of mediaRows || []) {
    const key = String(m.bien_id);
    if (!mediaByBien.has(key)) mediaByBien.set(key, []);
    mediaByBien.get(key).push({ imageUrl: String(m.url || "").trim() });
  }

  return (rows || []).map((r) => {
    const scRaw = parseJsonSafe(r.location_saisonniere_config_json);
    const resolvedCapacity = resolveProjectGuestCapacity(scRaw, r.nb_chambres);
    const seasonalConfig = {
      vueMer: Boolean(r.vue_mer) || Boolean(scRaw.vue_mer),
      vue: String(scRaw.vue || "").toLowerCase() || null,
      prochePlage: Boolean(r.proche_plage) || Boolean(scRaw.proche_plage),
      distancePlageM: Number.isFinite(Number(r.distance_plage_m)) ? Number(r.distance_plage_m) : Number(scRaw.distance_plage_m ?? Number.NaN),
      etage: scRaw.etage ?? r.etage ?? null,
      piscinePrivee: Boolean(scRaw.piscinePrivee ?? scRaw.piscine_privee),
      piscinePartagee: Boolean(scRaw.piscinePartagee ?? scRaw.piscine_partagee),
      exterieurJardin: Array.isArray(scRaw.exterieurJardin) ? scRaw.exterieurJardin : [],
      confortEquipementsInterieurs: Array.isArray(scRaw.confortEquipementsInterieurs) ? scRaw.confortEquipementsInterieurs : [],
      pricingPeriods: Array.isArray(scRaw.pricing_periods) ? scRaw.pricing_periods : [],
    };
    const comfortProbe = { title: r.titre, description: r.description, location: r.location_name, type: r.type, seasonalConfig };
    const poolPrivate = matchesComfortOption(comfortProbe, "piscine_privee");
    const poolShared = matchesComfortOption(comfortProbe, "piscine_partagee");
    return {
      id: r.id,
      reference: String(r.reference || "").trim() || null,
      title: r.titre,
      type: r.type,
      location: r.location_name,
      filterProfile: {
        locationLabel: String(r.location_name || "").trim() || null,
        locationHierarchy: {
          pays: "Tunisie",
          gouvernerat: String(r.gouvernerat || "").trim() || null,
          region: String(r.region || "").trim() || null,
          quartier: String(r.quartier || r.zone_nom || r.location_name || "").trim() || null,
        },
      },
      capacity: resolvedCapacity,
      bedrooms: Number(r.nb_chambres || 0),
      bathrooms: Number(r.nb_salle_bain || 0),
      floor: String((seasonalConfig.etage ?? r.etage) || "").trim() || null,
      nearBeach: matchesSeasideOption(comfortProbe, "pres_plage"),
      seaView: matchesSeasideOption(comfortProbe, "vue_sur_mer"),
      beachfront: matchesSeasideOption(comfortProbe, "pied_dans_eau"),
      beachDistanceM: Number(seasonalConfig.distancePlageM ?? Number.NaN),
      pool: poolPrivate || poolShared || /piscine/i.test(String(r.titre || "") + " " + String(r.description || "")),
      poolPrivate,
      poolShared,
      parking: Boolean(r.place_parking),
      description: r.description || "",
      pricePerNight: Number(r.price_per_night || 0),
      pricePerWeek: Number(r.price_per_week || 0) || null,
      status: "active",
      seasonalConfig,
      media: mediaByBien.get(String(r.id)) || [],
    };
  });
}

async function searchProjectProperties(filters) {
  const normalizedFilters = normalizeCacheFilters(filters);
  const limit = normalizedFilters.limit;
  const cacheKey = `chatbot:search:${stableStringify(normalizedFilters)}`;
  const cached = await readSearchCache(cacheKey);
  if (cached) return cached;
  const params = [];
  const where = [`b.mode = 'location_saisonniere'`, `b.statut = 'disponible'`, `COALESCE(b.visible_sur_site, 1) = 1`];

  if (normalizedFilters.location) {
    where.push(`(b.titre LIKE ? OR z.nom LIKE ? OR b.terrain_zone LIKE ?)`);
    const q = `%${normalizedFilters.location}%`;
    params.push(q, q, q);
  }
  const aiPlan = normalizedFilters.aiPlan;

  let hybridCandidateIds = null;
  if (config.hybridSearchEnabled) {
    try {
      const queryText = [
        normalizedFilters.location ? `location ${normalizedFilters.location}` : "",
        normalizedFilters.type ? `type ${normalizedFilters.type}` : "",
        normalizedFilters.subType ? `subtype ${normalizedFilters.subType}` : "",
        Number.isFinite(normalizedFilters.guests) ? `guests ${normalizedFilters.guests}` : "",
        Number.isFinite(normalizedFilters.bedrooms) ? `bedrooms ${normalizedFilters.bedrooms}` : "",
        normalizedFilters.seaView ? "vue mer sea view" : "",
        normalizedFilters.nearBeach ? "proche plage near beach" : "",
        normalizedFilters.beachfront ? "pied dans l eau beachfront" : "",
      ].filter(Boolean).join(" | ");
      if (queryText.trim()) {
        const qvec = await withTimeout(embedText(queryText), config.hybridTimeoutMs, "hybrid_embed");
        const semantic = await withTimeout(
          qdrant.search(config.qdrantPropertyCollection, {
            vector: qvec,
            limit: Math.max(10, config.hybridCandidateLimit),
            with_payload: true,
          }),
          config.hybridTimeoutMs,
          "hybrid_search"
        );
        hybridCandidateIds = semantic
          .map((s) => String(s?.payload?.bien_id || ""))
          .filter(Boolean);
      }
    } catch {
      hybridCandidateIds = null;
    }
  }
  if (normalizedFilters.type && normalizedFilters.type !== "autre") {
    where.push(`b.type LIKE ?`);
    params.push(`%${normalizedFilters.type}%`);
  }
  if (Array.isArray(aiPlan?.titleTerms) && aiPlan.titleTerms.length > 0) {
    for (const term of aiPlan.titleTerms) {
      where.push(`LOWER(b.titre) LIKE ?`);
      params.push(`%${term}%`);
    }
  }
  if (Array.isArray(aiPlan?.textTerms) && aiPlan.textTerms.length > 0) {
    for (const term of aiPlan.textTerms) {
      where.push(`(LOWER(b.titre) LIKE ? OR LOWER(b.description) LIKE ? OR LOWER(COALESCE(b.location_saisonniere_config_json, '')) LIKE ?)`);
      const q = `%${term}%`;
      params.push(q, q, q);
    }
  }
  if (Array.isArray(aiPlan?.zoneTerms) && aiPlan.zoneTerms.length > 0) {
    const zoneClauses = [];
    for (const term of aiPlan.zoneTerms) {
      zoneClauses.push(`LOWER(COALESCE(z.nom, '')) LIKE ?`);
      params.push(`%${term}%`);
    }
    if (zoneClauses.length > 0) where.push(`(${zoneClauses.join(" OR ")})`);
  }
  if (normalizedFilters.subType && normalizedFilters.subType !== "autre") {
    where.push(`(LOWER(b.titre) LIKE ? OR LOWER(b.description) LIKE ? OR LOWER(COALESCE(b.location_saisonniere_config_json, '')) LIKE ?)`);
    const sub = `%${normalizedFilters.subType}%`;
    params.push(sub, sub, sub);
  }
  if (Number.isFinite(normalizedFilters.guests)) {
    where.push(`COALESCE(
      NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(b.location_saisonniere_config_json, '$.limite_personnes_nuit')) AS SIGNED), 0),
      NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(b.location_saisonniere_config_json, '$.limitePersonnesNuit')) AS SIGNED), 0),
      NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(b.location_saisonniere_config_json, '$.limite_personne_nuit')) AS SIGNED), 0),
      NULLIF(
        COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(b.location_saisonniere_config_json, '$.max_adultes')) AS SIGNED), 0)
        + COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(b.location_saisonniere_config_json, '$.max_enfants')) AS SIGNED), 0),
        0
      ),
      NULLIF(
        COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(b.location_saisonniere_config_json, '$.maxAdultes')) AS SIGNED), 0)
        + COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(b.location_saisonniere_config_json, '$.maxEnfants')) AS SIGNED), 0),
        0
      ),
      NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(b.location_saisonniere_config_json, '$.capaciteMaxAdultes')) AS SIGNED), 0),
      b.nb_chambres + 1
    ) >= ?`);
    params.push(normalizedFilters.guests);
  }
  if (Number.isFinite(normalizedFilters.bedrooms)) {
    where.push(`COALESCE(b.nb_chambres, 0) >= ?`);
    params.push(normalizedFilters.bedrooms);
  }
  if (Number.isFinite(normalizedFilters.budget)) {
    where.push(`COALESCE(b.prix_affiche_client, b.prix_nuitee) <= ?`);
    params.push(normalizedFilters.budget);
  }
  if (Array.isArray(hybridCandidateIds) && hybridCandidateIds.length > 0) {
    where.push(`b.id IN (${hybridCandidateIds.map(() => "?").join(",")})`);
    params.push(...hybridCandidateIds);
  }
  // Seaside filters are evaluated in-memory using the same matching semantics as website pages.
  if (normalizedFilters.pool === true) where.push(`(b.id IN (SELECT bien_id FROM ${PROJECT_DB}.bien_caracteristiques WHERE caracteristique_id = 'car1'))`);
  if (normalizedFilters.parking === true) where.push(`(b.place_parking = 1 OR b.id IN (SELECT bien_id FROM ${PROJECT_DB}.bien_caracteristiques WHERE caracteristique_id IN ('car15','car35')))`);
  // Floor filters are evaluated in-memory with website-like token rules.

  const orderBy =
    aiPlan?.sort === "price_desc" ? `COALESCE(b.prix_affiche_client, b.prix_nuitee) DESC` :
    aiPlan?.sort === "newest" ? `b.id DESC` :
    hybridCandidateIds && aiPlan?.sort === "relevance" ? `COALESCE(b.prix_affiche_client, b.prix_nuitee) ASC` :
    `COALESCE(b.prix_affiche_client, b.prix_nuitee) ASC`;

  const sql = `
    SELECT 
      b.id, b.reference, b.titre, b.type, b.description, b.nb_chambres, b.nb_salle_bain, b.etage, b.location_saisonniere_config_json,
      COALESCE(b.prix_affiche_client, b.prix_nuitee) AS price_per_night,
      NULLIF(b.prix_semaine, 0) AS price_per_week,
      COALESCE(z.nom, b.terrain_zone, '') AS location_name,
      z.nom AS zone_nom,
      z.gouvernerat,
      z.region,
      z.quartier,
      b.proche_plage, b.vue_mer, b.place_parking, b.distance_plage_m
    FROM ${PROJECT_DB}.biens b
    LEFT JOIN ${PROJECT_DB}.zones z ON z.id = b.zone_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `;
  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const ids = rows.map((r) => String(r.id));
  const mediaRows = await prisma.$queryRawUnsafe(
    `SELECT bien_id, url FROM ${PROJECT_DB}.media WHERE type = 'image' AND bien_id IN (${ids.map(() => "?").join(",")}) ORDER BY position ASC`,
    ...ids
  );
  const mappedRows = mapProjectRows(rows, mediaRows);

  const withWebsiteFilters = mappedRows.filter((p) => {
    if (Array.isArray(aiPlan?.excludeTerms) && aiPlan.excludeTerms.length > 0) {
      const blob = norm([p.title, p.description, p.location, p.type, p.reference].join(" "));
      if (aiPlan.excludeTerms.some((term) => blob.includes(norm(term)))) return false;
    }
    if (normalizedFilters.beachfront === true && !matchesSeasideOption(p, "pied_dans_eau")) return false;
    if (normalizedFilters.seaView === true && !matchesSeasideOption(p, "vue_sur_mer")) return false;
    if (normalizedFilters.nearBeach === true && !matchesSeasideOption(p, "pres_plage")) return false;
    if (normalizedFilters.poolPrivate === true && !matchesComfortOption(p, "piscine_privee")) return false;
    if (normalizedFilters.poolShared === true && !matchesComfortOption(p, "piscine_partagee")) return false;
    if (normalizedFilters.floor === "ground" && !matchesComfortOption(p, "rdc")) return false;
    if (normalizedFilters.floor === "first" && !matchesComfortOption(p, "premier_etage")) return false;
    if (aiPlan?.filters?.floor === "ground" && !matchesComfortOption(p, "rdc")) return false;
    if (aiPlan?.filters?.floor === "first" && !matchesComfortOption(p, "premier_etage")) return false;
    if (aiPlan?.filters?.beachfront === true && !matchesSeasideOption(p, "pied_dans_eau")) return false;
    if (aiPlan?.filters?.seaView === true && !matchesSeasideOption(p, "vue_sur_mer")) return false;
    if (aiPlan?.filters?.nearBeach === true && !matchesSeasideOption(p, "pres_plage")) return false;
    if (aiPlan?.filters?.poolPrivate === true && !matchesComfortOption(p, "piscine_privee")) return false;
    if (aiPlan?.filters?.poolShared === true && !matchesComfortOption(p, "piscine_partagee")) return false;
    if (aiPlan?.filters?.parking === true && !Boolean(p.parking)) return false;
    return true;
  });

  if (!normalizedFilters.startDate || !normalizedFilters.endDate) {
    await writeSearchCache(cacheKey, withWebsiteFilters);
    return withWebsiteFilters;
  }

  const blocked = await prisma.$queryRawUnsafe(
    `SELECT bien_id FROM ${PROJECT_DB}.unavailable_dates WHERE start_date <= ? AND end_date >= ? AND status IN ('blocked','pending','booked')`,
    normalizedFilters.endDate,
    normalizedFilters.startDate
  );
  const blockedSet = new Set((blocked || []).map((x) => String(x.bien_id)));

  const nights = daysBetween(normalizedFilters.startDate, normalizedFilters.endDate);
  const finalRows = withWebsiteFilters.filter((r) => {
    if (blockedSet.has(String(r.id))) return false;
    const sc = r.seasonalConfig || {};
    const minStay = Math.max(1, Number(sc.dureeMinSejourNuits || sc.minStayNights || 1));
    const maxStay = Math.max(minStay, Number(sc.dureeMaxSejourNuits || sc.maxStayNights || 365));
    if (nights < minStay) return false;
    if (nights > maxStay) return false;
    return true;
  });
  await writeSearchCache(cacheKey, finalRows);
  return finalRows;
}

export async function searchAvailableProperties(filters) {
  if (DATA_SOURCE === "project") return searchProjectProperties(filters);

  const type = String(filters.type || "").trim().toLowerCase();
  const subType = String(filters.subType || "").trim().toLowerCase();
  const where = {
    status: "active",
    ...(filters.location ? { location: { contains: filters.location } } : {}),
    ...(type ? { type: { contains: type } } : {}),
    ...(subType ? { title: { contains: subType } } : {}),
    ...(Number.isFinite(filters.guests) ? { capacity: { gte: filters.guests } } : {}),
    ...(Number.isFinite(filters.budget) ? { pricePerNight: { lte: filters.budget } } : {}),
    ...(filters.nearBeach === true ? { nearBeach: true } : {}),
    ...(filters.pool === true ? { pool: true } : {}),
    ...(filters.parking === true ? { parking: true } : {}),
    ...(filters.poolPrivate === true ? { poolPrivate: true } : {}),
    ...(filters.poolShared === true ? { poolShared: true } : {}),
  };

  const rows = await prisma.property.findMany({
    where,
    include: { media: true },
    take: Math.max(1, Math.min(200, Number(filters?.limit || config.chatbotSearchLimit || 60))),
    orderBy: { pricePerNight: "asc" },
  });

  if (!filters.startDate || !filters.endDate) return rows;

  const blockedIds = await prisma.availability.findMany({
    where: {
      unavailableStart: { lte: new Date(filters.endDate) },
      unavailableEnd: { gte: new Date(filters.startDate) },
    },
    select: { propertyId: true },
  });

  const blocked = new Set(blockedIds.map((x) => x.propertyId));
  return rows.filter((p) => !blocked.has(p.id));
}

export async function getPropertyByReference(reference) {
  const token = String(reference || "").trim();
  if (!token) return null;

  if (DATA_SOURCE !== "project") {
    const row = await prisma.property.findFirst({
      where: {
        OR: [
          { id: token },
          { title: { contains: token } },
        ],
      },
      include: { media: true },
    });
    return row || null;
  }

  const compact = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  const sql = `
    SELECT
      b.id, b.reference, b.titre, b.type, b.description, b.nb_chambres, b.nb_salle_bain, b.etage, b.location_saisonniere_config_json,
      COALESCE(b.prix_affiche_client, b.prix_nuitee) AS price_per_night,
      NULLIF(b.prix_semaine, 0) AS price_per_week,
      COALESCE(z.nom, b.terrain_zone, '') AS location_name,
      b.proche_plage, b.vue_mer, b.place_parking, b.distance_plage_m
    FROM ${PROJECT_DB}.biens b
    LEFT JOIN ${PROJECT_DB}.zones z ON z.id = b.zone_id
    WHERE b.mode = 'location_saisonniere'
      AND COALESCE(b.visible_sur_site, 1) = 1
      AND (
        LOWER(REPLACE(REPLACE(COALESCE(b.reference, ''), '-', ''), ' ', '')) = ?
        OR CAST(b.id AS CHAR) = ?
      )
    LIMIT 1
  `;
  const rows = await prisma.$queryRawUnsafe(sql, compact, token);
  if (!Array.isArray(rows) || !rows[0]) return null;
  const mediaRows = await prisma.$queryRawUnsafe(
    `SELECT bien_id, url FROM ${PROJECT_DB}.media WHERE type = 'image' AND bien_id = ? ORDER BY position ASC`,
    String(rows[0].id)
  );
  return mapProjectRows(rows, mediaRows)[0] || null;
}
