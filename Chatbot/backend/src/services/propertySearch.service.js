import { prisma } from "../config/prisma.js";
import { qdrant } from "../config/qdrant.js";
import { config } from "../config/env.js";
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
      || hasAny("proche plage", "pres de la plage", "a quelques pas de la plage", "plage");
  }
  return false;
}

function matchesComfortOption(p, option) {
  const textBlob = norm([p.title, p.description, p.location, p.type].join(" "));
  const hasAny = (...tokens) => tokens.some((t) => textBlob.includes(norm(t)));
  const sc = p.seasonalConfig || {};
  if (option === "rdc") {
    const floor = getFloorRaw(p);
    return floor === "rdc" || floor === "0" || hasAny("rdc", "rez de chaussee", "rez-de-chaussee", "ground floor");
  }
  if (option === "premier_etage") {
    const floor = getFloorRaw(p);
    return floor === "1" || floor === "1er" || floor === "1er etage" || floor === "1er étage" || hasAny("1er etage", "1er étage", "premier etage", "premier étage", "1st floor");
  }
  return false;
}

async function searchProjectProperties(filters) {
  const params = [];
  const where = [`b.mode = 'location_saisonniere'`, `b.statut = 'disponible'`];

  if (filters.location) {
    where.push(`(b.titre LIKE ? OR z.nom LIKE ? OR b.terrain_zone LIKE ?)`);
    const q = `%${filters.location}%`;
    params.push(q, q, q);
  }

  let hybridCandidateIds = null;
  if (config.hybridSearchEnabled) {
    try {
      const queryText = [
        filters.location ? `location ${filters.location}` : "",
        filters.type ? `type ${filters.type}` : "",
        filters.subType ? `subtype ${filters.subType}` : "",
        Number.isFinite(filters.guests) ? `guests ${filters.guests}` : "",
        Number.isFinite(filters.bedrooms) ? `bedrooms ${filters.bedrooms}` : "",
        filters.seaView ? "vue mer sea view" : "",
        filters.nearBeach ? "proche plage near beach" : "",
        filters.beachfront ? "pied dans l eau beachfront" : "",
      ].filter(Boolean).join(" | ");
      if (queryText.trim()) {
        const qvec = await embedText(queryText);
        const semantic = await qdrant.search(config.qdrantPropertyCollection, {
          vector: qvec,
          limit: Math.max(10, config.hybridCandidateLimit),
          with_payload: true,
        });
        hybridCandidateIds = semantic
          .map((s) => String(s?.payload?.bien_id || ""))
          .filter(Boolean);
      }
    } catch {
      hybridCandidateIds = null;
    }
  }
  if (filters.type && String(filters.type).toLowerCase() !== "autre") {
    where.push(`b.type LIKE ?`);
    params.push(`%${filters.type}%`);
  }
  if (filters.subType && String(filters.subType).toLowerCase() !== "autre") {
    where.push(`(LOWER(b.titre) LIKE ? OR LOWER(b.description) LIKE ? OR LOWER(COALESCE(b.location_saisonniere_config_json, '')) LIKE ?)`);
    const sub = `%${String(filters.subType).toLowerCase()}%`;
    params.push(sub, sub, sub);
  }
  if (Number.isFinite(filters.guests)) {
    where.push(`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(b.location_saisonniere_config_json, '$.capaciteMaxAdultes')), b.nb_chambres + 1) >= ?`);
    params.push(filters.guests);
  }
  if (Number.isFinite(filters.bedrooms)) {
    where.push(`COALESCE(b.nb_chambres, 0) >= ?`);
    params.push(filters.bedrooms);
  }
  if (Number.isFinite(filters.budget)) {
    where.push(`COALESCE(b.prix_affiche_client, b.prix_nuitee) <= ?`);
    params.push(filters.budget);
  }
  if (Array.isArray(hybridCandidateIds) && hybridCandidateIds.length > 0) {
    where.push(`b.id IN (${hybridCandidateIds.map(() => "?").join(",")})`);
    params.push(...hybridCandidateIds);
  }
  // Seaside filters are evaluated in-memory using the same matching semantics as website pages.
  if (filters.pool === true) where.push(`(b.id IN (SELECT bien_id FROM ${PROJECT_DB}.bien_caracteristiques WHERE caracteristique_id = 'car1'))`);
  if (filters.parking === true) where.push(`(b.place_parking = 1 OR b.id IN (SELECT bien_id FROM ${PROJECT_DB}.bien_caracteristiques WHERE caracteristique_id IN ('car15','car35')))`);
  // Floor filters are evaluated in-memory with website-like token rules.

  const sql = `
    SELECT 
      b.id, b.reference, b.titre, b.type, b.description, b.nb_chambres, b.nb_salle_bain, b.etage, b.location_saisonniere_config_json,
      COALESCE(b.prix_affiche_client, b.prix_nuitee) AS price_per_night,
      COALESCE(z.nom, b.terrain_zone, '') AS location_name,
      b.proche_plage, b.vue_mer, b.place_parking, b.distance_plage_m
    FROM ${PROJECT_DB}.biens b
    LEFT JOIN ${PROJECT_DB}.zones z ON z.id = b.zone_id
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(b.prix_affiche_client, b.prix_nuitee) ASC
    LIMIT 10
  `;
  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const ids = rows.map((r) => String(r.id));
  const mediaRows = await prisma.$queryRawUnsafe(
    `SELECT bien_id, url FROM ${PROJECT_DB}.media WHERE type = 'image' AND bien_id IN (${ids.map(() => "?").join(",")}) ORDER BY position ASC`,
    ...ids
  );
  const mediaByBien = new Map();
  for (const m of mediaRows || []) {
    const key = String(m.bien_id);
    if (!mediaByBien.has(key)) mediaByBien.set(key, []);
    mediaByBien.get(key).push({ imageUrl: String(m.url || "").trim() });
  }

  const mappedRows = rows.map((r) => {
    const scRaw = parseJsonSafe(r.location_saisonniere_config_json);
    const seasonalConfig = {
      vueMer: Boolean(r.vue_mer) || Boolean(scRaw.vue_mer),
      vue: String(scRaw.vue || "").toLowerCase() || null,
      prochePlage: Boolean(r.proche_plage) || Boolean(scRaw.proche_plage),
      distancePlageM: Number.isFinite(Number(r.distance_plage_m)) ? Number(r.distance_plage_m) : Number(scRaw.distance_plage_m ?? Number.NaN),
      etage: scRaw.etage ?? r.etage ?? null,
    };
    return {
      id: r.id,
      title: r.titre,
      type: r.type,
      location: r.location_name,
      capacity: Number(r.nb_chambres || 0) + 1,
      bedrooms: Number(r.nb_chambres || 0),
      bathrooms: Number(r.nb_salle_bain || 0),
      floor: String((seasonalConfig.etage ?? r.etage) || "").trim() || null,
      nearBeach: matchesSeasideOption({ title: r.titre, description: r.description, location: r.location_name, type: r.type, seasonalConfig }, "pres_plage"),
      seaView: matchesSeasideOption({ title: r.titre, description: r.description, location: r.location_name, type: r.type, seasonalConfig }, "vue_sur_mer"),
      beachDistanceM: Number(seasonalConfig.distancePlageM ?? Number.NaN),
      pool: /piscine/i.test(String(r.titre || "") + " " + String(r.description || "")),
      parking: Boolean(r.place_parking),
      description: r.description || "",
      pricePerNight: Number(r.price_per_night || 0),
      status: "active",
      seasonalConfig,
      media: mediaByBien.get(String(r.id)) || [],
    };
  });

  const withWebsiteFilters = mappedRows.filter((p) => {
    if (filters.beachfront === true && !matchesSeasideOption(p, "pied_dans_eau")) return false;
    if (filters.seaView === true && !matchesSeasideOption(p, "vue_sur_mer")) return false;
    if (filters.nearBeach === true && !matchesSeasideOption(p, "pres_plage")) return false;
    if (filters.floor === "ground" && !matchesComfortOption(p, "rdc")) return false;
    if (filters.floor === "first" && !matchesComfortOption(p, "premier_etage")) return false;
    return true;
  });

  if (!filters.startDate || !filters.endDate) {
    return withWebsiteFilters;
  }

  const blocked = await prisma.$queryRawUnsafe(
    `SELECT bien_id FROM ${PROJECT_DB}.unavailable_dates WHERE start_date <= ? AND end_date >= ? AND status IN ('blocked','pending','booked')`,
    filters.endDate,
    filters.startDate
  );
  const blockedSet = new Set((blocked || []).map((x) => String(x.bien_id)));

  const nights = daysBetween(filters.startDate, filters.endDate);
  return withWebsiteFilters.filter((r) => {
    if (blockedSet.has(String(r.id))) return false;
    const sc = r.seasonalConfig || {};
    const minStay = Math.max(1, Number(sc.dureeMinSejourNuits || sc.minStayNights || 1));
    const maxStay = Math.max(minStay, Number(sc.dureeMaxSejourNuits || sc.maxStayNights || 365));
    if (nights < minStay) return false;
    if (nights > maxStay) return false;
    return true;
  });
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
  };

  const rows = await prisma.property.findMany({
    where,
    include: { media: true },
    take: 5,
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
