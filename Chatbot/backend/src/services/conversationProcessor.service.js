import { redis } from "../config/redis.js";
import { prisma } from "../config/prisma.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parseUserIntent } from "./ai/intent.service.js";
import { planConversationTurn } from "./ai/conversationPlanner.service.js";
import { planSqlPropertySearch } from "./ai/sqlSearchPlanner.service.js";
import { retrieveContext } from "./rag/retrieval.service.js";
import { getPropertyByReference, searchAvailableProperties } from "./propertySearch.service.js";
import { generateAssistantReply, generateKnowledgeReply, polishAssistantReply } from "./ai/reply.service.js";
import { sendMetaMessage } from "./meta/sender.service.js";
import {
  confirmManualReservationPaymentFromChat,
  createReservationCheckoutFromChat,
  createReservationDemandDirectFromChat,
  fetchReservationDemandById,
  listReservationDemandsByPhone,
  submitReservationIdentityFromChat,
  updateReservationDemandStatusFromChat,
  uploadReservationPaymentReceiptLinkFromChat,
  upsertProjectUserFromChat,
} from "./projectBooking.service.js";
import { STATES } from "./stateMachine.js";

const CONTEXT_TTL_SEC = 60 * 60 * 24;
const DATA_SOURCE = String(process.env.CHATBOT_DATA_SOURCE || "chatbot").trim().toLowerCase();
const PROJECT_DB = String(process.env.PROJECT_DB_NAME || "dwira").trim();
const WEBSITE_BASE_URL = String(process.env.WEBSITE_BASE_URL || "https://www.dwiraimmobilier.com").replace(/\/+$/, "");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHATBOT_MEDIA_DIR = path.resolve(__dirname, "..", "..", "uploads", "chatbot-media");
const LOCAL_SITE_CHATBOT_MEDIA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "public", "chatbot-media");

function normalizeReferenceToken(value) {
  const raw = decodeURIComponent(String(value || "").trim());
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) return "";
  if (/^ref\d+$/i.test(compact)) return compact.toUpperCase();
  return raw;
}

function normalizePropertyReference(value) {
  const raw = decodeURIComponent(String(value || "").trim());
  if (!raw) return null;
  const compact = raw.replace(/[^a-z0-9]/gi, "");
  if (!compact) return null;
  if (/^\d{2,10}$/.test(compact)) return `REF-${compact}`;
  const refMatch = compact.match(/^ref(\d{2,10})$/i);
  if (refMatch?.[1]) return `REF-${refMatch[1]}`;
  return raw.toUpperCase();
}

function getPropertyRouteToken(property) {
  const reference = String(property?.reference || "").trim();
  if (reference) return normalizeReferenceToken(reference) || reference;
  const slug = String(property?.slug || "").trim();
  if (slug) return slug;
  return String(property?.id || "").trim();
}

function parseDate(value) {
  const s = String(value || "").trim().slice(0, 10);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function isMeaningfulValue(value) {
  const text = String(value || "").trim().toLowerCase();
  return Boolean(text && text !== "autre" && text !== "other" && text !== "unknown" && text !== "auto");
}

function normalizeSelectedPropertyId(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0 && /^[0-9]+$/.test(raw)) return numeric;
  return raw;
}

function normalizeConversationLanguage(baseLanguage, extractedLanguage) {
  const extracted = String(extractedLanguage || "").trim().toLowerCase();
  if (isMeaningfulValue(extracted)) return extracted;
  const base = String(baseLanguage || "").trim().toLowerCase();
  if (isMeaningfulValue(base)) return base;
  return "fr";
}

function hasTunisianDialectMarkers(value) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return false;
  return [
    "aslema", "aslama", "sallem", "salam", "marhbe", "mar7be", "ahla",
    "chnw", "chnowa", "chno", "win", "nheb", "n7eb", "brabi", "fama",
    "bch", "tawa", "mouch", "9adech", "b9adech", "warini", "warri",
    "najem", "naawnouk", "kifech", "kifesh", "3lech", "3andi", "andek",
  ].some((marker) => text.includes(marker));
}

function resolveConversationLanguage(baseLanguage, extractedLanguage, rawMessage) {
  const base = String(baseLanguage || "").trim().toLowerCase();
  const extracted = String(extractedLanguage || "").trim().toLowerCase();
  const message = String(rawMessage || "").trim();
  if (base === "tn" && (!extracted || extracted === "fr")) return "tn";
  if (base === "tn" && hasTunisianDialectMarkers(message)) return "tn";
  if (isMeaningfulValue(extracted)) return extracted;
  if (isMeaningfulValue(base)) return base;
  return "fr";
}

function extractGuestBreakdownFromMessage(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return { adults: null, children: null };
  const adultsMatch = text.match(/(\d{1,2})\s*(adultes?|adults?)/i);
  const childrenMatch = text.match(/(\d{1,2})\s*(enfants?|kids?|children|child)/i);
  return {
    adults: adultsMatch?.[1] ? Number(adultsMatch[1]) : null,
    children: childrenMatch?.[1] ? Number(childrenMatch[1]) : null,
  };
}

function normalizeConstraints(existing, extracted, rawMessage = "") {
  const base = existing || {};
  const startDate = parseDate(extracted?.dates?.start) || base.startDate || null;
  const endDate = parseDate(extracted?.dates?.end) || base.endDate || null;
  const extractedGuests = Number(extracted?.guests);
  const extractedBudget = Number(extracted?.budget);
  const budget =
    Number.isFinite(extractedBudget) && extractedBudget >= 50 && extractedBudget <= 100000
      ? extractedBudget
      : base.budget || null;
  const messageGuestBreakdown = extractGuestBreakdownFromMessage(rawMessage);
  const adultGuests = Number.isFinite(messageGuestBreakdown.adults)
    ? messageGuestBreakdown.adults
    : (Number.isFinite(Number(base.adultGuests)) ? Number(base.adultGuests) : null);
  const childGuests = Number.isFinite(messageGuestBreakdown.children)
    ? messageGuestBreakdown.children
    : (Number.isFinite(Number(base.childGuests)) ? Number(base.childGuests) : 0);
  const extractedOrBaseGuests =
    Number.isFinite(extractedGuests) && extractedGuests >= 1 && extractedGuests <= 30
      ? extractedGuests
      : base.guests || null;
  const normalizedAdultGuests =
    Number.isFinite(adultGuests) && adultGuests > 0
      ? adultGuests
      : (Number.isFinite(extractedOrBaseGuests) ? Math.max(1, extractedOrBaseGuests - Math.max(0, childGuests || 0)) : null);
  const normalizedChildGuests = Number.isFinite(childGuests) && childGuests >= 0 ? childGuests : 0;
  const computedGuestTotal =
    Number.isFinite(normalizedAdultGuests) && normalizedAdultGuests > 0
      ? normalizedAdultGuests + normalizedChildGuests
      : null;
  const guests =
    Number.isFinite(computedGuestTotal) && computedGuestTotal >= 1 && computedGuestTotal <= 30
      ? computedGuestTotal
      : extractedOrBaseGuests;
  const location = String(extracted?.location || base.location || "").trim() || null;
  const pref = new Set([...(Array.isArray(base.preferences) ? base.preferences : []), ...(Array.isArray(extracted?.preferences) ? extracted.preferences : [])]);
  const extractedType = String(extracted?.type || "").trim().toLowerCase();
  const extractedSubType = String(extracted?.subType || "").trim().toLowerCase();
  const baseType = String(base.type || "").trim().toLowerCase();
  const baseSubType = String(base.subType || "").trim().toLowerCase();
  const type = (isMeaningfulValue(extractedType) ? extractedType : baseType) || null;
  const subType = (isMeaningfulValue(extractedSubType) ? extractedSubType : baseSubType) || null;
  const extractedBedrooms = Number(extracted?.bedrooms);
  const bedrooms = Number.isFinite(extractedBedrooms) && extractedBedrooms > 0 ? extractedBedrooms : base.bedrooms || null;
  let floor = base.floor || null;
  if (!floor && Array.isArray(extracted?.preferences)) {
    if (extracted.preferences.includes("ground_floor")) floor = "ground";
    else if (extracted.preferences.includes("first_floor")) floor = "first";
  }
  return {
    startDate,
    endDate,
    guests,
    adultGuests: normalizedAdultGuests,
    childGuests: normalizedChildGuests,
    budget,
    location,
    type,
    subType,
    bedrooms,
    floor,
    preferences: Array.from(pref),
    language: resolveConversationLanguage(base.language, extracted?.language, rawMessage),
    selectedPropertyId: normalizeSelectedPropertyId(base.selectedPropertyId),
    selectedPropertyRef: String(base.selectedPropertyRef || "").trim() || null,
    reservationDemandId: String(base.reservationDemandId || "").trim() || null,
    profile: {
      fullName: String(extracted?.fullName || base?.profile?.fullName || "").trim() || null,
      phone: String(extracted?.phone || base?.profile?.phone || "").trim() || null,
      email: String(base?.profile?.email || "").trim() || null,
      address: String(base?.profile?.address || "").trim() || null,
      identityNumber: String(base?.profile?.identityNumber || "").trim() || null,
      identityImageUrl: String(base?.profile?.identityImageUrl || "").trim() || null,
    },
    payment: {
      method: String(base?.payment?.method || "").trim() || null,
      receiptProvided: Boolean(base?.payment?.receiptProvided),
    },
    pendingDateAlternative: base?.pendingDateAlternative && typeof base.pendingDateAlternative === "object"
      ? {
          propertyId: normalizeSelectedPropertyId(base.pendingDateAlternative.propertyId),
          propertyRef: String(base.pendingDateAlternative.propertyRef || "").trim() || null,
          startDate: parseDate(base.pendingDateAlternative.startDate) || null,
          endDate: parseDate(base.pendingDateAlternative.endDate) || null,
          sourceStartDate: parseDate(base.pendingDateAlternative.sourceStartDate) || null,
          sourceEndDate: parseDate(base.pendingDateAlternative.sourceEndDate) || null,
        }
      : null,
    browse: {
      shownOptionIds: Array.isArray(base?.browse?.shownOptionIds) ? base.browse.shownOptionIds.map((item) => String(item)) : [],
      lastShownCount: Number.isFinite(Number(base?.browse?.lastShownCount)) ? Number(base.browse.lastShownCount) : 0,
      lastOptions: Array.isArray(base?.browse?.lastOptions)
        ? base.browse.lastOptions
          .map((item) => ({
            id: item?.id ?? null,
            reference: String(item?.reference || "").trim() || null,
            title: String(item?.title || "").trim() || null,
            location: String(item?.location || "").trim() || null,
            capacity: Number.isFinite(Number(item?.capacity)) ? Number(item.capacity) : null,
            pricePerNightTnd: Number.isFinite(Number(item?.pricePerNightTnd)) ? Number(item.pricePerNightTnd) : null,
            pricePerWeekTnd: Number.isFinite(Number(item?.pricePerWeekTnd)) ? Number(item.pricePerWeekTnd) : null,
            nearBeach: Boolean(item?.nearBeach),
            seaView: Boolean(item?.seaView),
            beachfront: Boolean(item?.beachfront),
            pool: Boolean(item?.pool),
            poolPrivate: Boolean(item?.poolPrivate),
            poolShared: Boolean(item?.poolShared),
            parking: Boolean(item?.parking),
            type: String(item?.type || "").trim() || null,
            bedrooms: Number.isFinite(Number(item?.bedrooms)) ? Number(item.bedrooms) : null,
            bathrooms: Number.isFinite(Number(item?.bathrooms)) ? Number(item.bathrooms) : null,
            floor: String(item?.floor || "").trim() || null,
            link: String(item?.link || "").trim() || null,
            matchScore: Number.isFinite(Number(item?.matchScore)) ? Number(item.matchScore) : null,
            alternativeReasons: Array.isArray(item?.alternativeReasons) ? item.alternativeReasons.map((reason) => String(reason)) : [],
            matchFlags: item?.matchFlags && typeof item.matchFlags === "object" ? item.matchFlags : {},
          }))
          .filter((item) => item.id && item.title)
          .slice(0, 24)
        : [],
    },
  };
}

function clearPendingDateAlternative(constraints) {
  if (!constraints || typeof constraints !== "object") return;
  constraints.pendingDateAlternative = null;
}

function rememberPendingDateAlternative(constraints, property, alternative) {
  if (!constraints || !property || !alternative?.start || !alternative?.end) return;
  constraints.pendingDateAlternative = {
    propertyId: normalizeSelectedPropertyId(property.id),
    propertyRef: String(property.reference || constraints.selectedPropertyRef || "").trim() || null,
    startDate: parseDate(alternative.start) || null,
    endDate: parseDate(alternative.end) || null,
    sourceStartDate: parseDate(constraints.startDate) || null,
    sourceEndDate: parseDate(constraints.endDate) || null,
  };
}

function isDateAlternativeChoiceMessage(message) {
  const raw = String(message || "").trim();
  const text = normText(raw);
  if (!text) return false;
  if (/^1[\].:-]?$/.test(text)) return true;
  if (/^(option|choix)\s*1$/.test(text)) return true;
  if (/(nbadd?lou|nbadlou|badel|badelna|change|changer).{0,20}dates?/.test(text)) return true;
  if (/^dates?$/.test(text)) return true;
  return false;
}

function shouldApplyPendingDateAlternative(message, constraints) {
  if (!constraints?.pendingDateAlternative?.startDate || !constraints?.pendingDateAlternative?.endDate) return false;
  if (!isDateAlternativeChoiceMessage(message)) return false;
  const currentStart = parseDate(constraints?.startDate);
  const currentEnd = parseDate(constraints?.endDate);
  const sourceStart = parseDate(constraints?.pendingDateAlternative?.sourceStartDate);
  const sourceEnd = parseDate(constraints?.pendingDateAlternative?.sourceEndDate);
  if (!currentStart || !currentEnd) return true;
  if (sourceStart && sourceEnd && currentStart === sourceStart && currentEnd === sourceEnd) return true;
  return false;
}

function hasMeaningfulSearchConstraints(constraints) {
  if (!constraints || typeof constraints !== "object") return false;
  return Boolean(
    String(constraints.location || "").trim()
    || (String(constraints.type || "").trim() && String(constraints.type || "").trim().toLowerCase() !== "autre")
    || (String(constraints.subType || "").trim() && String(constraints.subType || "").trim().toLowerCase() !== "autre")
    || Number.isFinite(Number(constraints.guests))
    || Number.isFinite(Number(constraints.budget))
    || Number.isFinite(Number(constraints.bedrooms))
    || (Array.isArray(constraints.preferences) && constraints.preferences.length > 0)
    || String(constraints.selectedPropertyRef || "").trim()
  );
}

async function getConversationContext(conversationId) {
  const raw = await redis.get(`conversation:ctx:${conversationId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setConversationContext(conversationId, ctx) {
  await redis.set(`conversation:ctx:${conversationId}`, JSON.stringify(ctx), "EX", CONTEXT_TTL_SEC);
  const demandId = String(ctx?.reservationDemandId || "").trim();
  if (demandId) {
    await redis.set(`reservation:demand:conversation:${demandId}`, String(conversationId), "EX", CONTEXT_TTL_SEC);
  }
}

function toPropertyCards(properties) {
  return properties.map((p) => ({
    id: p.id,
    reference: String(p.reference || "").trim() || null,
    title: p.title,
    location: p.location,
    capacity: p.capacity,
    pricePerNightTnd: Number(p.pricePerNight),
    pricePerWeekTnd: Number(p.pricePerWeek || 0) || null,
    nearBeach: Boolean(p.nearBeach),
    seaView: Boolean(p.seaView),
    beachfront: Boolean(p.beachfront) || (Boolean(p.seaView) && Number.isFinite(Number(p.beachDistanceM)) && Number(p.beachDistanceM) <= 50),
    beachDistanceM: Number.isFinite(Number(p.beachDistanceM)) ? Number(p.beachDistanceM) : null,
    pool: Boolean(p.pool),
    poolPrivate: Boolean(p.poolPrivate),
    poolShared: Boolean(p.poolShared),
    parking: Boolean(p.parking),
    type: p.type,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    floor: p.floor || null,
    description: p.description,
    pricingPeriods: Array.isArray(p?.seasonalConfig?.pricingPeriods) ? p.seasonalConfig.pricingPeriods : [],
    link: `${WEBSITE_BASE_URL}/properties/${encodeURIComponent(getPropertyRouteToken(p))}`,
    photos: (p.media || []).map((m) => m.imageUrl).filter(Boolean),
    exactDateAvailable: p?.exactDateAvailable !== false,
    stayDateAlternative: p?.stayDateAlternative || null,
    dateFailureReason: String(p?.dateFailureReason || "").trim() || "",
    hasDateRuleAlternative: Boolean(p?.hasDateRuleAlternative),
  }));
}

function normText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getRequestedComfortProfile(constraints) {
  const prefs = Array.isArray(constraints?.preferences) ? constraints.preferences : [];
  return {
    seaView: prefs.includes("sea_view"),
    nearBeach: prefs.includes("near_beach"),
    beachfront: prefs.includes("beachfront"),
    pool: prefs.includes("pool"),
    poolPrivate: prefs.includes("pool_private"),
    poolShared: prefs.includes("pool_shared"),
    parking: prefs.includes("parking"),
    groundFloor: constraints?.floor === "ground" || prefs.includes("ground_floor"),
    firstFloor: constraints?.floor === "first" || prefs.includes("first_floor"),
  };
}

function getPropertyComfortProfile(property) {
  return {
    seaView: Boolean(property?.seaView),
    nearBeach: Boolean(property?.nearBeach),
    beachfront: Boolean(property?.beachfront) || (Boolean(property?.seaView) && Number.isFinite(Number(property?.beachDistanceM)) && Number(property?.beachDistanceM) <= 50),
    pool: Boolean(property?.pool),
    poolPrivate: Boolean(property?.poolPrivate),
    poolShared: Boolean(property?.poolShared),
    parking: Boolean(property?.parking),
    groundFloor: ["rdc", "0"].includes(String(property?.floor || "").trim().toLowerCase()),
    firstFloor: ["1", "1er", "1er etage", "1er �tage"].includes(String(property?.floor || "").trim().toLowerCase()),
  };
}

function getPropertySPlusValue(value) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/s\s*\+\s*(\d+)/);
  return match?.[1] ? Number(match[1]) : null;
}

function getMainTypeFromCategory(value) {
  const normalized = normText(value).replace(/\s+/g, " ");
  if (!normalized) return "autre";
  if (normalized.includes("appartement") || /\bs\s*\+\s*\d+/.test(normalized)) return "appartement";
  if (normalized.includes("residence")) return "residence";
  if (normalized.includes("bungalow") || normalized.includes("villa") || normalized.includes("maison")) return "villa_maison";
  if (normalized.includes("studio")) return "studio";
  if (normalized.includes("immeuble")) return "immeuble";
  return "autre";
}

function getCanonicalSubTypeKey(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return "";
  const sPlusMatch = raw.match(/s\s*\+\s*(\d+)/);
  if (sPlusMatch?.[1]) return `s+${sPlusMatch[1]}`;
  const numericBedroomMatch = raw.match(/(\d+)\s*chambre/);
  if (numericBedroomMatch?.[1]) return `s+${numericBedroomMatch[1]}`;
  if (/\b(une|un)\s+chambre/.test(raw)) return "s+1";
  if (/\bdeux\s+chambre/.test(raw)) return "s+2";
  if (/\btrois\s+chambre/.test(raw)) return "s+3";
  if (/\bquatre\s+chambre/.test(raw)) return "s+4";
  if (/\bcinq\s+chambre/.test(raw)) return "s+5";
  if (/\bsix\s+chambre/.test(raw)) return "s+6";
  if (["studio", "duplex", "triplex", "bungalow"].includes(raw)) return raw;
  return raw.replace(/\s+/g, " ");
}

function buildMainTypeSubTypeMatchKey(mainType, value) {
  const subTypeKey = getCanonicalSubTypeKey(value);
  if (!mainType || !subTypeKey) return "";
  return `${mainType}::${subTypeKey}`;
}

function getSelectedSubTypeMatchKeys(value, selectedMainTypes) {
  const subTypeKey = getCanonicalSubTypeKey(value);
  if (!subTypeKey) return [];
  return Array.from(new Set(
    (Array.isArray(selectedMainTypes) ? selectedMainTypes : [])
      .map((mainType) => buildMainTypeSubTypeMatchKey(mainType, subTypeKey))
      .filter(Boolean)
  ));
}

function getPropertyMatchProfile(property) {
  const rawCategory = [property?.type, property?.title, property?.description]
    .map((item) => String(item || "").trim())
    .find(Boolean) || "";
  const mainType = getMainTypeFromCategory(rawCategory);
  const subTypeKey = getCanonicalSubTypeKey(`${property?.title || ""} ${property?.type || ""}`);
  const subTypeMatchKey = subTypeKey ? `${mainType}::${subTypeKey}` : "";
  return { mainType, subTypeKey, subTypeMatchKey };
}

function inferPropertySubType(property) {
  const candidates = [
    property?.title,
    property?.description,
    property?.type,
  ];
  for (const candidate of candidates) {
    const value = getPropertySPlusValue(candidate);
    if (value !== null) return `s+${value}`;
  }
  const typeText = normText(property?.type || "");
  if (typeText.includes("studio")) return "studio";
  return null;
}

function hydrateConstraintsFromSelectedProperty(constraints, property) {
  if (!constraints || !property) return;
  if (!constraints.location) constraints.location = String(property.location || "").trim() || null;
  if (!constraints.type || constraints.type === "autre") {
    constraints.type = String(property.type || "").trim().toLowerCase() || null;
  }
  if (!constraints.subType || constraints.subType === "autre") {
    constraints.subType = inferPropertySubType(property) || constraints.subType || null;
  }
  if (!Number.isFinite(Number(constraints.bedrooms)) || Number(constraints.bedrooms) <= 0) {
    const bedrooms = Number(property.bedrooms || 0);
    constraints.bedrooms = bedrooms > 0 ? bedrooms : constraints.bedrooms || null;
  }
}

function getRequestedLocationPartCount(value) {
  return String(value || "")
    .split(/[\/,]/)
    .map((item) => normText(item))
    .filter(Boolean)
    .length;
}

function hydrateConstraintLocationFromMatches(constraints, propertyCards) {
  const requestedLocation = String(constraints?.location || "").trim();
  if (!requestedLocation) return;
  if (getRequestedLocationPartCount(requestedLocation) < 2) return;
  const exactMatch = (Array.isArray(propertyCards) ? propertyCards : []).find((property) =>
    propertyMatchesLocationExact(property, requestedLocation)
    && getRequestedLocationPartCount(property?.location) >= 3
  );
  if (exactMatch?.location) {
    constraints.location = String(exactMatch.location).trim();
  }
}

async function loadWebsiteLikeCatalogPool(constraints) {
  return searchAvailableProperties({
    location: null,
    guests: null,
    budget: null,
    startDate: null,
    endDate: null,
    nearBeach: false,
    seaView: false,
    beachfront: false,
    pool: false,
    poolPrivate: false,
    poolShared: false,
    parking: false,
    type: null,
    subType: null,
    bedrooms: null,
    floor: null,
    limit: Math.max(120, Number(process.env.CHATBOT_SEARCH_LIMIT || 60) * 2),
  }).then((rows) => attachAlternativeStayData(rows, constraints));
}

function getPropertyLocationSignals(property) {
  const hierarchy = property?.filterProfile?.locationHierarchy || {};
  const values = [
    property?.filterProfile?.locationLabel,
    hierarchy?.pays,
    hierarchy?.gouvernerat,
    hierarchy?.region,
    hierarchy?.quartier,
    property?.location,
    property?.title,
    property?.description,
    property?.reference,
  ]
    .map((value) => normText(value))
    .filter(Boolean);
  return Array.from(new Set(values));
}

function getPropertyStrictLocationSignals(property) {
  const hierarchy = property?.filterProfile?.locationHierarchy || {};
  return Array.from(new Set([
    property?.filterProfile?.locationLabel,
    hierarchy?.pays,
    hierarchy?.gouvernerat,
    hierarchy?.region,
    hierarchy?.quartier,
    property?.location,
  ]
    .map((value) => normText(value))
    .filter(Boolean)));
}

function splitRequestedLocationParts(value) {
  return String(value || "")
    .split(/[\/,]/)
    .map((item) => normText(item))
    .filter(Boolean);
}

function extractSelectedLocationHierarchy(value) {
  const parts = splitRequestedLocationParts(value);
  if (parts.length >= 3) {
    return {
      zone: parts[0],
      region: parts[1],
      governorate: parts[2],
      parts,
    };
  }
  if (parts.length === 2) {
    return {
      zone: parts[0],
      region: parts[1],
      governorate: null,
      parts,
    };
  }
  const single = parts[0] || normText(value);
  return {
    zone: single,
    region: single,
    governorate: null,
    parts: single ? [single] : [],
  };
}

function parseLocationLabelParts(value) {
  const parts = String(value || "")
    .split(",")
    .map((item) => normText(item))
    .filter(Boolean);
  return {
    zone: parts[0] || null,
    region: parts[1] || null,
    governorate: parts[2] || null,
  };
}

function getPropertyRegionZone(property) {
  const h = property?.filterProfile?.locationHierarchy || {};
  const fallback = parseLocationLabelParts(property?.filterProfile?.locationLabel || property?.location || "");
  const region = normText(h?.region || fallback.region || h?.gouvernerat || fallback.governorate || h?.pays || property?.filterProfile?.locationLabel || property?.location || "");
  const zone = normText(h?.quartier || h?.zone || fallback.zone || property?.filterProfile?.locationLabel || property?.location || "");
  return { region, zone };
}

function getPropertyGovernorate(property) {
  const h = property?.filterProfile?.locationHierarchy || {};
  const fallback = parseLocationLabelParts(property?.filterProfile?.locationLabel || property?.location || "");
  return normText(h?.gouvernerat || fallback.governorate || "");
}

function propertyMatchesLocationExact(property, requestedLocation) {
  const requested = extractSelectedLocationHierarchy(requestedLocation);
  const requestedParts = requested.parts;
  const normalized = requested.region || requested.zone || normText(requestedLocation);
  if (!normalized) return false;
  const values = getPropertyStrictLocationSignals(property);
  const propertyRegionZone = getPropertyRegionZone(property);
  const propertyGovernorate = getPropertyGovernorate(property);
  if (requested.zone && requested.region && requestedParts.length >= 2) {
    const exactZone = propertyRegionZone.zone === requested.zone;
    const exactRegion = propertyRegionZone.region === requested.region;
    const exactGovernorate = !requested.governorate || propertyGovernorate === requested.governorate;
    if (exactZone && exactRegion && exactGovernorate) return true;
  }
  if (requestedParts.length > 1) {
    const allPartsMatch = requestedParts.every((part) =>
      values.some((value) => value === part || value.includes(part) || part.includes(value))
    );
    if (allPartsMatch) return true;
    return false;
  }
  return values.some((value) => value === normalized || value.includes(normalized) || normalized.includes(value));
}

function getLocationAlternativeRank(property, requestedLocation) {
  const requested = extractSelectedLocationHierarchy(requestedLocation);
  const propertyRegionZone = getPropertyRegionZone(property);
  const propertyGovernorate = getPropertyGovernorate(property);
  const sameZone = Boolean(requested.zone) && propertyRegionZone.zone === requested.zone;
  const sameRegion = Boolean(requested.region) && propertyRegionZone.region === requested.region;
  const sameGovernorate = Boolean(requested.governorate)
    ? propertyGovernorate === requested.governorate
    : Boolean(requested.region) && propertyGovernorate === requested.region;

  if (sameZone && sameRegion) return 4;
  if (sameRegion) return 3;
  if (sameGovernorate) return 2;
  return 0;
}

function propertyHasLocationAlternative(property, requestedLocation) {
  const normalized = normText(requestedLocation);
  if (!normalized) return false;
  const locationRank = getLocationAlternativeRank(property, requestedLocation);
  if (locationRank >= 3 && !propertyMatchesLocationExact(property, requestedLocation)) return true;
  if (locationRank === 2) return true;
  return false;
}

function formatDateAlternativeReason(reason) {
  const normalized = normText(reason);
  const minMatch = normalized.match(/minimum\s+(\d+)/);
  if (minMatch?.[1]) return `minimum ${minMatch[1]} nuits`;
  const maxMatch = normalized.match(/maximum\s+(\d+)/);
  if (maxMatch?.[1]) return `maximum ${maxMatch[1]} nuits`;
  return reason || "adapter selon les regles du bien";
}

function describeComfortFallbacks(property, constraints) {
  const requested = getRequestedComfortProfile(constraints);
  const actual = getPropertyComfortProfile(property);
  const fallbacks = [];

  if (requested.beachfront && !actual.beachfront && actual.nearBeach) fallbacks.push("beachfront_to_near_beach");
  if (requested.poolPrivate && !actual.poolPrivate && actual.poolShared) fallbacks.push("private_pool_to_shared_pool");
  if (requested.groundFloor && !actual.groundFloor && actual.firstFloor) fallbacks.push("ground_to_first_floor");

  return fallbacks;
}

function comfortFallbackLabel(code, lang) {
  const labels = {
    beachfront_to_near_beach: {
      tn: "mouch pied dans l'eau ama proche plage",
      en: "not beachfront but near the beach",
      fr: "pas pied dans l'eau mais proche plage",
    },
    private_pool_to_shared_pool: {
      tn: "mouch piscine privee ama piscine partagee",
      en: "not a private pool but a shared pool",
      fr: "pas piscine privee mais piscine partagee",
    },
    ground_to_first_floor: {
      tn: "mouch rdc ama 1er etage",
      en: "not ground floor but first floor",
      fr: "pas RDC mais 1er etage",
    },
    date_shift: {
      tn: "badil dates",
      en: "alternative dates",
      fr: "alternative dates",
    },
    date_rule: {
      tn: "r�gle dates/sejour",
      en: "date/stay rule",
      fr: "r�gle dates/s�jour",
    },
  };
  return labels[code]?.[lang === "tn" || lang === "en" ? lang : "fr"] || null;
}

function buildComfortSnippet(property, lang) {
  const parts = [];
  if (property?.beachfront) parts.push(lang === "tn" ? "pied dans l'eau" : "pied dans l'eau");
  else if (property?.nearBeach) parts.push(lang === "tn" ? "proche plage" : "proche plage");
  if (property?.seaView) parts.push(lang === "tn" ? "vue mer" : "vue mer");
  if (property?.poolPrivate) parts.push(lang === "tn" ? "piscine privee" : "piscine privee");
  else if (property?.poolShared) parts.push(lang === "tn" ? "piscine partagee" : "piscine partagee");
  if (String(property?.floor || "").trim()) parts.push(lang === "tn" ? `etage ${property.floor}` : `etage ${property.floor}`);
  return parts.slice(0, 3);
}

function computeMatchMeta(property, constraints) {
  let score = 0;
  let maxScore = 0;
  const reasons = [];
  const text = normText([property.title, property.location, property.description, property.type].join(" "));
  const requested = getRequestedComfortProfile(constraints);
  const actual = getPropertyComfortProfile(property);
  const comfortFallbacks = describeComfortFallbacks(property, constraints);
  const { mainType: propertyMainType, subTypeKey: propertySubTypeKey, subTypeMatchKey: propertySubTypeMatchKey } = getPropertyMatchProfile(property);
  const selectedMainTypes = constraints?.type && constraints.type !== "autre" ? [getMainTypeFromCategory(constraints.type)] : [];
  const selectedSubTypeKeys = constraints?.subType && constraints.subType !== "autre" ? [getCanonicalSubTypeKey(constraints.subType)].filter(Boolean) : [];
  const selectedSubTypeMatchKeys = constraints?.subType && constraints.subType !== "autre"
    ? getSelectedSubTypeMatchKeys(constraints.subType, selectedMainTypes)
    : [];
  const requestedSubTypeValue = getPropertySPlusValue(selectedSubTypeKeys[0]);
  const propertySubTypeValue = getPropertySPlusValue(propertySubTypeKey);
  const exactLocationMatch = constraints.location ? propertyMatchesLocationExact(property, constraints.location) : true;
  const locationAlternativeRank = constraints.location ? getLocationAlternativeRank(property, constraints.location) : 0;
  const locationAlternative = constraints.location ? !exactLocationMatch && propertyHasLocationAlternative(property, constraints.location) : false;
  const strictMainTypeMatch = selectedMainTypes.length === 0 || selectedMainTypes.includes(propertyMainType);
  const strictSubTypeMatch = selectedSubTypeMatchKeys.length === 0 || selectedSubTypeMatchKeys.includes(propertySubTypeMatchKey);
  const hasTypeAlternative31 = selectedSubTypeMatchKeys.length > 0
    && selectedMainTypes.length > 0
    && selectedSubTypeKeys.includes(propertySubTypeKey)
    && !selectedSubTypeMatchKeys.includes(propertySubTypeMatchKey);
  const hasTypeAlternative32 = selectedMainTypes.length > 0
    && selectedSubTypeKeys.length === 1
    && selectedMainTypes.includes(propertyMainType)
    && !selectedSubTypeMatchKeys.includes(propertySubTypeMatchKey)
    && requestedSubTypeValue !== null
    && propertySubTypeValue !== null
    && Math.abs(propertySubTypeValue - requestedSubTypeValue) === 1;
  const typeAlternative = Boolean(hasTypeAlternative31 || hasTypeAlternative32);

  if (constraints.location) {
    maxScore += 18;
    if (exactLocationMatch) score += 18;
    else if (locationAlternative) score += 8;
    else reasons.push("location");
  }
  if (constraints.type && constraints.type !== "autre") {
    maxScore += 16;
    if (strictMainTypeMatch) score += 16;
    else reasons.push("type");
  }
  if (constraints.subType && constraints.subType !== "autre") {
    maxScore += 16;
    if (strictSubTypeMatch) score += 16;
    else if (typeAlternative) score += 8;
    else reasons.push("subtype");
  }
  if (Number.isFinite(Number(constraints.bedrooms)) && Number(constraints.bedrooms) > 0) {
    maxScore += 8;
    if (Number(property.bedrooms || 0) >= Number(constraints.bedrooms)) score += 8;
    else reasons.push("bedrooms");
  }
  if (requested.seaView) {
    maxScore += 10;
    if (actual.seaView) score += 10;
    else reasons.push("sea_view");
  }
  if (requested.nearBeach) {
    maxScore += 10;
    if (actual.nearBeach) score += 10;
    else reasons.push("near_beach");
  }
  if (requested.beachfront) {
    maxScore += 10;
    if (actual.beachfront) score += 10;
    else reasons.push(comfortFallbacks.includes("beachfront_to_near_beach") ? "beachfront_to_near_beach" : "beachfront");
  }
  if (requested.poolPrivate) {
    maxScore += 10;
    if (actual.poolPrivate) score += 10;
    else reasons.push(comfortFallbacks.includes("private_pool_to_shared_pool") ? "private_pool_to_shared_pool" : "pool_private");
  } else if (requested.poolShared) {
    maxScore += 10;
    if (actual.poolShared) score += 10;
    else reasons.push("pool_shared");
  } else if (requested.pool) {
    maxScore += 10;
    if (actual.pool) score += 10;
    else reasons.push("pool");
  }
  if (requested.parking) {
    maxScore += 6;
    if (actual.parking) score += 6;
    else reasons.push("parking");
  }
  if (requested.groundFloor) {
    maxScore += 8;
    if (actual.groundFloor) score += 8;
    else reasons.push(comfortFallbacks.includes("ground_to_first_floor") ? "ground_to_first_floor" : "ground_floor");
  } else if (requested.firstFloor) {
    maxScore += 8;
    if (actual.firstFloor) score += 8;
    else reasons.push("first_floor");
  }
  if (Number.isFinite(Number(constraints.budget))) {
    maxScore += 10;
    if (Number(property.pricePerNightTnd || 0) <= Number(constraints.budget)) score += 10;
    else reasons.push("budget");
  }

  const normalizedScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 100;
  const exactComfortMatch = !requested.seaView && !requested.nearBeach && !requested.beachfront && !requested.pool && !requested.poolPrivate && !requested.poolShared && !requested.parking && !requested.groundFloor && !requested.firstFloor
    ? true
    : !reasons.some((reason) =>
      ["sea_view", "near_beach", "beachfront", "pool", "pool_private", "pool_shared", "parking", "ground_floor", "first_floor", "beachfront_to_near_beach", "private_pool_to_shared_pool", "ground_to_first_floor"].includes(reason)
    );
  const hasComfortAlternative = reasons.some((reason) => ["beachfront_to_near_beach", "private_pool_to_shared_pool", "ground_to_first_floor"].includes(reason));
  return {
    score: normalizedScore,
    reasons: Array.from(new Set(reasons)),
    flags: {
      exactLocationMatch,
      locationAlternativeRank,
      locationAlternative,
      strictTypeMatch: strictMainTypeMatch && strictSubTypeMatch,
      strictSubTypeMatch,
      typeAlternative,
      strictMainTypeMatch,
      hasTypeAlternative31,
      hasTypeAlternative32,
      exactComfortMatch,
      hasComfortAlternative,
    },
  };
}

function parseQuickIntent(message) {
  const m = normText(message);
  const mentionsIdentityDocument =
    /(carte\s*d'?identite|cin\b|c\.?i\.?n\b|identity\s*card|id\s*card|numero\s*d'?identite|num[e�]ro\s*d'?identite)/.test(m);
  const wantsStatus =
    /(status|etat reservation|reservation status|statut|etat|suivi reservation|ou en est ma reservation|win wslet|woslet|waslet|fech weslet|ach sar 3la reservation)/.test(m) ||
    m.includes("حالة") ||
    m.includes("الحجز");
  const wantsReserve =
    /(reserver|reserve|book|booking)/.test(m) ||
    m.includes("نحب نحجز") ||
    m.includes("احجز");
  const asksReceipt =
    /(recu|receipt|preuve|paiement|payment|virement)/.test(m) ||
    m.includes("وصل") ||
    m.includes("ايصال");
  const mentionsAlternative =
    /(alternative|autre|another)/.test(m) ||
    m.includes("بديل") ||
    m.includes("غير");
  const wantsMoreOptions =
    /(autres?\s+choix|autres?\s+options|more options|show more|next options|chnw\s*e5er|chnowa\s*e5er|chnowa\s*e5er|e5er|ekher)/.test(m) ||
    m.includes("اخر") ||
    m.includes("اكثر");
  const hasReceiptLink = /(https?:\/\/\S+\.(png|jpe?g|webp|pdf)\b|preuve de paiement|payment proof)/.test(m);
  const paymentMethod =
    /\b(cash|especes|espece)\b/.test(m) ? "cash" :
    /\b(virement|transfer|bank)\b/.test(m) ? "bank_transfer" :
    (!mentionsIdentityDocument && /\b(clicktopay|carte|card)\b/.test(m)) ? "card" : null;
  return { wantsStatus, wantsReserve, asksReceipt, mentionsAlternative, wantsMoreOptions, hasReceiptLink, paymentMethod, mentionsIdentityDocument };
}

function nextOptionBatch(options, constraints, size = 3) {
  const shownIds = new Set(Array.isArray(constraints?.browse?.shownOptionIds) ? constraints.browse.shownOptionIds.map((item) => String(item)) : []);
  const rows = Array.isArray(options) ? options : [];
  const remaining = rows.filter((item) => !shownIds.has(String(item?.id)));
  const batch = remaining.slice(0, Math.max(1, size));
  return {
    batch,
    hasMore: remaining.length > batch.length,
    remainingCount: Math.max(0, remaining.length - batch.length),
  };
}

function rememberShownOptions(constraints, options) {
  if (!constraints?.browse) constraints.browse = { shownOptionIds: [], lastShownCount: 0, lastOptions: [] };
  const current = new Set(Array.isArray(constraints.browse.shownOptionIds) ? constraints.browse.shownOptionIds.map((item) => String(item)) : []);
  for (const option of Array.isArray(options) ? options : []) current.add(String(option?.id));
  constraints.browse.shownOptionIds = Array.from(current);
  constraints.browse.lastShownCount = current.size;
}

function clearShownOptions(constraints) {
  if (!constraints?.browse) constraints.browse = { shownOptionIds: [], lastShownCount: 0, lastOptions: [] };
  constraints.browse.shownOptionIds = [];
  constraints.browse.lastShownCount = 0;
}

function compactBrowseOption(option) {
  if (!option?.id || !option?.title) return null;
  return {
    id: option.id,
    reference: String(option.reference || "").trim() || null,
    title: String(option.title || "").trim(),
    location: String(option.location || "").trim() || null,
    capacity: Number.isFinite(Number(option.capacity)) ? Number(option.capacity) : null,
    pricePerNightTnd: Number.isFinite(Number(option.pricePerNightTnd)) ? Number(option.pricePerNightTnd) : null,
    pricePerWeekTnd: Number.isFinite(Number(option.pricePerWeekTnd)) ? Number(option.pricePerWeekTnd) : null,
    nearBeach: Boolean(option.nearBeach),
    seaView: Boolean(option.seaView),
    beachfront: Boolean(option.beachfront),
    pool: Boolean(option.pool),
    poolPrivate: Boolean(option.poolPrivate),
    poolShared: Boolean(option.poolShared),
    parking: Boolean(option.parking),
    type: String(option.type || "").trim() || null,
    bedrooms: Number.isFinite(Number(option.bedrooms)) ? Number(option.bedrooms) : null,
    bathrooms: Number.isFinite(Number(option.bathrooms)) ? Number(option.bathrooms) : null,
    floor: String(option.floor || "").trim() || null,
    link: String(option.link || "").trim() || null,
    matchScore: Number.isFinite(Number(option.matchScore)) ? Number(option.matchScore) : null,
    alternativeReasons: Array.isArray(option.alternativeReasons) ? option.alternativeReasons.map((reason) => String(reason)) : [],
    matchFlags: option.matchFlags && typeof option.matchFlags === "object" ? option.matchFlags : {},
  };
}

function rememberBrowseUniverse(constraints, options) {
  if (!constraints?.browse) constraints.browse = { shownOptionIds: [], lastShownCount: 0, lastOptions: [] };
  constraints.browse.lastOptions = (Array.isArray(options) ? options : [])
    .map(compactBrowseOption)
    .filter(Boolean)
    .slice(0, 24);
}

function getBrowseUniverse(constraints) {
  return Array.isArray(constraints?.browse?.lastOptions) ? constraints.browse.lastOptions.filter((item) => item?.id && item?.title) : [];
}

function buildMoreOptionsReply(lang, batch, hasMore) {
  const top = (Array.isArray(batch) ? batch : []).slice(0, 3).map((p, index) => `${index + 1}. ${formatPropertyLabel(p, lang)}`).join("\n");
  if (!top) {
    if (lang === "tn") return "Taw ma fama ch options okhrin ala nafs taleb. Ken t7eb, badel zone, budget, wala comfort w nlawwejlek men jdid.";
    if (lang === "en") return "There are no more options on the same request. If you want, change the area, budget, or comfort preferences and I will search again.";
    return "Il n'y a pas d'autres choix sur cette m�me demande. Si vous voulez, changez la zone, le budget ou le confort et je relance la recherche.";
  }
  if (lang === "tn") {
    return hasMore
      ? `Hedhom options okhrin ynajmou yensbouk:\n${top}\nKen t7eb, naajem nzid nwarik mazid.`
      : `Hedhom el options okhrin elli ba9ew:\n${top}\nKen t7eb, badel zone, budget wala comfort bech nlawwejlek ala badayel okhrin.`;
  }
  if (lang === "en") {
    return hasMore
      ? `Here are more matching options:\n${top}\nIf you want, I can show you more.`
      : `Here are the remaining matching options:\n${top}\nIf you want, change the area, budget, or comfort and I will look for alternatives.`;
  }
  return hasMore
    ? `Voici d'autres choix correspondants:\n${top}\nSi vous voulez, je peux encore vous en montrer.`
    : `Voici les choix restants pour cette demande:\n${top}\nSi vous voulez, changez la zone, le budget ou le confort et je chercherai d'autres alternatives.`;
}

function hasBrowseContext(constraints) {
  return Boolean(
    constraints?.browse
    && Array.isArray(constraints.browse.shownOptionIds)
    && constraints.browse.shownOptionIds.length > 0
  );
}

function hasSearchSignal(constraints, message) {
  const text = normText(message);
  return Boolean(
    constraints.location ||
    constraints.type ||
    constraints.subType ||
    Number.isFinite(Number(constraints.bedrooms)) ||
    constraints.preferences.length > 0 ||
    /(montre|cherche|cherche moi|voir|dispo|disponible|appartement|villa|studio|s\+\d+|options?)/.test(text)
  );
}

function isGreetingOnly(message, extracted, constraints, quick = null) {
  const hasIntentGreeting = String(extracted?.intent || "").trim().toLowerCase() === "greeting";
  const hasGreetingMode = String(extracted?.responseMode || "").trim().toLowerCase() === "greeting";
  const type = String(constraints?.type || "").trim().toLowerCase();
  const subType = String(constraints?.subType || "").trim().toLowerCase();
  const hasAnySearchConstraint = Boolean(
    constraints?.location ||
    (type && type !== "autre") ||
    (subType && subType !== "autre" && subType !== type) ||
    (Number.isFinite(Number(constraints?.bedrooms)) && Number(constraints.bedrooms) > 0) ||
    (Number.isFinite(Number(constraints?.guests)) && Number(constraints.guests) > 0) ||
    (Number.isFinite(Number(constraints?.budget)) && Number(constraints.budget) > 0) ||
    (Array.isArray(constraints?.preferences) && constraints.preferences.length > 0) ||
    constraints?.startDate ||
    constraints?.endDate ||
    extracted?.propertyReference
  );
  if (quick?.wantsMoreOptions || quick?.mentionsAlternative || hasBrowseContext(constraints)) {
    return false;
  }
  return (hasIntentGreeting || hasGreetingMode) && !hasAnySearchConstraint;
}

function buildGreetingReply(lang) {
  if (lang === "tn") {
    return "marhbe bik, kifech najemou naawnouk, chnw tlawej bithabet?";
  }
  if (lang === "en") {
    return "Hello. Share your dates, number of guests, budget, and preferred area, and I will suggest the best matching options.";
  }
  if (lang === "ar") {
    return "Ahlan. Arsil li attawarikh, 3adad al mousafirin, al budget, wal manta9a elli t7ebha, w ana na9tarah lak afdal al options.";
  }
  return "Bonjour. Indiquez-moi vos dates, le nombre de voyageurs, votre budget et la zone souhait�e, et je vous proposerai les options les plus adapt�es.";
}

function buildKnowledgeFallbackReply(lang, message) {
  const text = normText(message);
  if (/(paiement|payment|virement|carte|cash|recu|receipt)/.test(text)) {
    if (lang === "tn") return "Bech tkammel reservation, tnajem t5tar cash, virement bancaire wala carte. W ken 5allast, tnajem tab3ath recu bech l administration tthabet el paiement.";
    if (lang === "en") return "To continue a reservation, the available payment methods are cash, bank transfer, or card. If you already paid, you can send a receipt so the admin can review it.";
    return "Pour finaliser une reservation, les modes de paiement disponibles sont especes, virement bancaire ou carte. Si vous avez deja paye, vous pouvez envoyer un recu pour verification par l'administration.";
  }
  if (/(comment|kifeh|reservation|reserver|booking|hajz)/.test(text)) {
    if (lang === "tn") return "El reservation temchi hakka: t5tar el bien, t3atini dates w 9adech men personne, ba3d na3mlou demande reservation, w ba3d t5tar tari9et el paiement.";
    if (lang === "en") return "The reservation flow is: choose a property, share your dates and guest count, create the reservation request, then choose the payment method.";
    return "Le flux de reservation est simple: vous choisissez un bien, vous partagez les dates et le nombre de voyageurs, une demande de reservation est creee, puis vous choisissez le mode de paiement.";
  }
  if (/(annulation|cancel|cancellation|check in|check-in|check out|check-out|minimum nuit|min stay|regle|regles|rule|rules)/.test(text)) {
    if (lang === "tn") return "El regles tbadel men bien l ekher: fama minimum nuits, w baadh el biens 3andhom regles check-in/check-out 7asb periode. Ken t3atini reference wala dates, n9ollek d9i9.";
    if (lang === "en") return "Rules can change from one property to another: some have a minimum stay, and some have check-in/check-out day rules depending on the period. If you give me a reference or dates, I can answer more precisely.";
    return "Les regles peuvent changer d'un bien a l'autre: certains ont un minimum de nuits et certains ont des regles de check-in/check-out selon la periode. Si vous me donnez une reference ou des dates, je peux repondre plus precisement.";
  }
  if (lang === "tn") return "Nnajem n3awnek fil zones, prix, references, reservation, paiement w regles de sejour. Ken t9olli talbek b d9a, na3tik reponse a9rab.";
  if (lang === "en") return "I can help with areas, prices, references, reservation flow, payment, and stay rules. If you tell me exactly what you need, I will answer more precisely.";
  return "Je peux vous aider sur les zones, les prix, les references, le processus de reservation, le paiement et les regles de sejour. Si vous precisez votre besoin, je repondrai plus exactement.";
}

function formatPropertyLabel(property, lang = "fr") {
  const parts = [property.title];
  if (property.reference) parts.push(`Ref ${property.reference}`);
  if (property.location) parts.push(property.location);
  if (Number.isFinite(Number(property.pricePerNightTnd)) && Number(property.pricePerNightTnd) > 0) {
    parts.push(`${Number(property.pricePerNightTnd)} TND/nuit`);
  }
  const comfortParts = buildComfortSnippet(property, lang);
  if (comfortParts.length) parts.push(comfortParts.join(", "));
  const fallbackLabels = (Array.isArray(property?.alternativeReasons) ? property.alternativeReasons : [])
    .map((reason) => comfortFallbackLabel(reason, lang))
    .filter(Boolean);
  if (fallbackLabels.length) {
    const lead = lang === "tn" ? "badil comfort" : "alternative";
    parts.push(`${lead}: ${fallbackLabels.join(" | ")}`);
  }
  if (property?.stayDateAlternative?.start && property?.stayDateAlternative?.end) {
    const altLabel = getStayAvailabilityAlternativeLabel(property.stayDateAlternative);
    const dateLead = lang === "tn" ? "badil dates" : lang === "en" ? "date alternative" : "dates alternatives";
    parts.push(`${dateLead}: ${formatShortDate(property.stayDateAlternative.start)}-${formatShortDate(property.stayDateAlternative.end)}${altLabel ? ` (${altLabel})` : ""}`);
  } else if (property?.dateFailureReason && property?.hasDateRuleAlternative) {
    const dateLead = lang === "tn" ? "regle sejour" : lang === "en" ? "stay rule" : "r�gle s�jour";
    parts.push(`${dateLead}: ${formatDateAlternativeReason(property.dateFailureReason)}`);
  }
  if (property.link) parts.push(property.link);
  return parts.join(" - ");
}

function evaluatePropertyStayWindow(property, startDate, endDate, unavailableRanges = [], options = {}) {
  if (!startDate || !endDate) return { ok: true, exactDateAvailable: true, reason: "" };
  const stayStart = parseIsoDateAtMidnight(startDate);
  const stayEnd = parseIsoDateAtMidnight(endDate);
  if (!stayStart || !stayEnd || stayEnd <= stayStart) return { ok: false, exactDateAvailable: false, reason: "dates invalides" };
  const includePending = Boolean(options?.includePending);
  const blockingStatuses = includePending ? ["blocked", "booked", "pending"] : ["blocked", "booked"];
  const blocked = (Array.isArray(unavailableRanges) ? unavailableRanges : []).some((range) => {
    const rangeStart = parseIsoDateAtMidnight(range?.start_date || range?.start);
    const rangeEnd = parseIsoDateAtMidnight(range?.end_date || range?.end);
    const status = String(range?.status || "").trim().toLowerCase();
    if (!rangeStart || !rangeEnd || !blockingStatuses.includes(status)) return false;
    // Align with website logic: occupied nights are handled as [start, end),
    // so checkout on `rangeStart` and checkin on `rangeEnd` remain valid boundaries.
    return rangeStart < stayEnd && rangeEnd > stayStart;
  });
  if (blocked) return { ok: false, exactDateAvailable: false, reason: "Dates non disponibles" };
  const rule = getStayRuleDiagnostics([property], { startDate, endDate })?.rows?.[0] || null;
  if (rule && !rule.minStayOk) return { ok: false, exactDateAvailable: true, reason: `sejour minimum ${rule.requiredMinStay}` };
  if (rule && !rule.checkinOk && rule.requiredCheckinDay) return { ok: false, exactDateAvailable: true, reason: `check-in ${rule.requiredCheckinDay}` };
  if (rule && !rule.checkoutOk && rule.requiredCheckoutDay) return { ok: false, exactDateAvailable: true, reason: `check-out ${rule.requiredCheckoutDay}` };
  return { ok: true, exactDateAvailable: true, reason: "" };
}

async function attachAlternativeStayData(properties, constraints) {
  const rows = Array.isArray(properties) ? properties : [];
  if (!constraints?.startDate || !constraints?.endDate || DATA_SOURCE !== "project" || rows.length === 0) return rows;
  const ids = rows.map((item) => String(item?.id || "").trim()).filter(Boolean);
  if (ids.length === 0) return rows;
  const unavailableRows = await prisma.$queryRawUnsafe(
    `SELECT bien_id, start_date, end_date, status
     FROM ${PROJECT_DB}.unavailable_dates
     WHERE bien_id IN (${ids.map(() => "?").join(",")})
       AND status IN ('blocked', 'pending', 'booked')`,
    ...ids
  );
  const byBien = new Map();
  for (const row of Array.isArray(unavailableRows) ? unavailableRows : []) {
    const key = String(row?.bien_id || "").trim();
    if (!key) continue;
    if (!byBien.has(key)) byBien.set(key, []);
    byBien.get(key).push(row);
  }
  return rows.map((property) => {
    const unavailableRanges = byBien.get(String(property.id)) || [];
    const evaluation = evaluatePropertyStayWindow(property, constraints.startDate, constraints.endDate, unavailableRanges);
    const stayDateAlternative = !evaluation.ok
      ? findBestStayRangeAlternative({
          startRaw: constraints.startDate,
          endRaw: constraints.endDate,
          isRangeValid: (candidateStart, candidateEnd) => evaluatePropertyStayWindow(property, candidateStart, candidateEnd, unavailableRanges).ok,
          maxShiftDays: 7,
          maxNightDelta: 7,
        })
      : null;
    const dateRuleType = classifyDateRuleReason(evaluation.reason);
    return {
      ...property,
      unavailableRanges,
      exactDateAvailable: evaluation.ok,
      stayDateAlternative,
      dateFailureReason: evaluation.reason || "",
      dateRuleType,
      hasDateRuleAlternative: Boolean(
        stayDateAlternative
        || (!evaluation.ok && ["min_max", "weekday", "availability"].includes(dateRuleType))
      ),
    };
  });
}

function summarizeZones(options) {
  const counts = new Map();
  for (const option of Array.isArray(options) ? options : []) {
    const zone = String(option?.location || "").trim();
    if (!zone) continue;
    counts.set(zone, (counts.get(zone) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([zone, count]) => ({ zone, count }));
}

function classifyPropertyCards(constraints, propertyCards) {
  const rows = (Array.isArray(propertyCards) ? propertyCards : []).map((property) => {
    const meta = computeMatchMeta(property, constraints);
    const mergedReasons = Array.from(new Set([...(Array.isArray(property?.alternativeReasons) ? property.alternativeReasons : []), ...meta.reasons]));
    return {
      ...property,
      matchScore: meta.score,
      alternativeReasons: mergedReasons,
      matchFlags: {
        ...meta.flags,
        exactDateAvailable: property?.exactDateAvailable !== false,
        hasDateRuleAlternative: Boolean(property?.hasDateRuleAlternative),
      },
    };
  });

  const hasCoreFilters = Boolean(
    constraints?.location
    || (constraints?.type && constraints.type !== "autre")
    || (constraints?.subType && constraints.subType !== "autre")
    || (Array.isArray(constraints?.preferences) && constraints.preferences.length > 0)
    || constraints?.startDate
    || constraints?.endDate
  );
  const threshold = hasCoreFilters ? 60 : 0;
  const hasDateFilter = Boolean(constraints?.startDate && constraints?.endDate);
  const hasExplicitTypeFilter = Boolean(
    (constraints?.type && constraints.type !== "autre")
    || (constraints?.subType && constraints.subType !== "autre")
  );

  let exact = rows.filter((row) =>
    row.matchFlags.strictTypeMatch
    && row.matchFlags.strictSubTypeMatch
    && row.matchFlags.exactComfortMatch
    && row.matchScore >= threshold
    && (!constraints?.location || row.matchFlags.exactLocationMatch)
    && (!constraints?.startDate || row.matchFlags.exactDateAvailable)
  );

  if (exact.length === 0) {
    exact = rows.filter((row) =>
      row.matchFlags.strictTypeMatch
      && row.matchFlags.strictSubTypeMatch
      && row.matchFlags.exactComfortMatch
      && (!constraints?.startDate || row.matchFlags.exactDateAvailable)
    );
  }

  const exactIds = new Set(exact.map((row) => String(row.id)));
  const alternatives = rows.filter((row) => {
    if (exactIds.has(String(row.id))) return false;
    if (constraints?.location && !row.matchFlags.exactLocationMatch && !row.matchFlags.locationAlternative) {
      return false;
    }
    const hasNonDateAlternative = Boolean(
      row.matchFlags.locationAlternative
      || row.matchFlags.typeAlternative
      || row.matchFlags.hasComfortAlternative
      || (!hasExplicitTypeFilter && !row.matchFlags.strictTypeMatch)
    );
    if (hasExplicitTypeFilter && !row.matchFlags.strictTypeMatch && !row.matchFlags.typeAlternative) {
      return false;
    }
    if (hasDateFilter) {
      const hasDateAlternative = Boolean(row.matchFlags.hasDateRuleAlternative || row.hasDateRuleAlternative);
      const hasNonDateAlternativeWithExactDates = row.matchFlags.exactDateAvailable && hasNonDateAlternative;
      return hasDateAlternative || hasNonDateAlternativeWithExactDates;
    }
    return hasNonDateAlternative;
  });

  const sorter = (a, b) =>
    Number(a.alternativeSearchStageRank ?? 99) - Number(b.alternativeSearchStageRank ?? 99)
    || Number(b.matchFlags?.locationAlternativeRank || 0) - Number(a.matchFlags?.locationAlternativeRank || 0)
    || Number(b.matchScore || 0) - Number(a.matchScore || 0);
  const prioritizeBeachComfort = Array.isArray(constraints?.preferences) && constraints.preferences.includes("beachfront");
  const sectionOrder = prioritizeBeachComfort
    ? ["comfort", "location_comfort", "dates_comfort", "type_comfort", "location_dates", "location_type", "dates_type", "location", "dates", "type", "other"]
    : ["location_dates", "location_type", "location_comfort", "dates_type", "dates_comfort", "type_comfort", "location", "dates", "type", "comfort", "other"];
  const alternativeSorter = (a, b) => {
    const sectionA = inferAlternativeSection(a, prioritizeBeachComfort);
    const sectionB = inferAlternativeSection(b, prioritizeBeachComfort);
    const indexA = sectionOrder.indexOf(sectionA);
    const indexB = sectionOrder.indexOf(sectionB);
    if (indexA !== indexB) return indexA - indexB;
    return sorter(a, b);
  };
  exact.sort(sorter);
  alternatives.sort(alternativeSorter);
  if (exact.length === 0 && alternatives.length === 0) {
    const fallback = [...rows].sort(sorter);
    return {
      exact: fallback.slice(0, Math.min(12, fallback.length)),
      alternatives: [],
      combined: fallback,
    };
  }
  return {
    exact,
    alternatives,
    combined: [...exact, ...alternatives],
  };
}

function getAlternativeSectionDefs(prioritizeBeachComfort = false) {
  return prioritizeBeachComfort
    ? [
        { key: "comfort", match: (row) => Boolean(row?.matchFlags?.hasComfortAlternative || row?.hasComfortAlternative) },
        { key: "location_comfort", match: (row) => Boolean(row?.matchFlags?.locationAlternative) && Boolean(row?.matchFlags?.hasComfortAlternative || row?.hasComfortAlternative) },
        { key: "dates_comfort", match: (row) => Boolean(row?.matchFlags?.hasDateRuleAlternative || row?.hasDateRuleAlternative) && Boolean(row?.matchFlags?.hasComfortAlternative || row?.hasComfortAlternative) },
        { key: "type_comfort", match: (row) => Boolean(row?.matchFlags?.typeAlternative) && Boolean(row?.matchFlags?.hasComfortAlternative || row?.hasComfortAlternative) },
        { key: "location_dates", match: (row) => Boolean(row?.matchFlags?.locationAlternative) && Boolean(row?.matchFlags?.hasDateRuleAlternative || row?.hasDateRuleAlternative) },
        { key: "location_type", match: (row) => Boolean(row?.matchFlags?.locationAlternative) && Boolean(row?.matchFlags?.typeAlternative) },
        { key: "dates_type", match: (row) => Boolean(row?.matchFlags?.hasDateRuleAlternative || row?.hasDateRuleAlternative) && Boolean(row?.matchFlags?.typeAlternative) },
        { key: "location", match: (row) => Boolean(row?.matchFlags?.locationAlternative) },
        { key: "dates", match: (row) => Boolean(row?.matchFlags?.hasDateRuleAlternative || row?.hasDateRuleAlternative) },
        { key: "type", match: (row) => Boolean(row?.matchFlags?.typeAlternative) },
      ]
    : [
        { key: "location_dates", match: (row) => Boolean(row?.matchFlags?.locationAlternative) && Boolean(row?.matchFlags?.hasDateRuleAlternative || row?.hasDateRuleAlternative) },
        { key: "location_type", match: (row) => Boolean(row?.matchFlags?.locationAlternative) && Boolean(row?.matchFlags?.typeAlternative) },
        { key: "location_comfort", match: (row) => Boolean(row?.matchFlags?.locationAlternative) && Boolean(row?.matchFlags?.hasComfortAlternative || row?.hasComfortAlternative) },
        { key: "dates_type", match: (row) => Boolean(row?.matchFlags?.hasDateRuleAlternative || row?.hasDateRuleAlternative) && Boolean(row?.matchFlags?.typeAlternative) },
        { key: "dates_comfort", match: (row) => Boolean(row?.matchFlags?.hasDateRuleAlternative || row?.hasDateRuleAlternative) && Boolean(row?.matchFlags?.hasComfortAlternative || row?.hasComfortAlternative) },
        { key: "type_comfort", match: (row) => Boolean(row?.matchFlags?.typeAlternative) && Boolean(row?.matchFlags?.hasComfortAlternative || row?.hasComfortAlternative) },
        { key: "location", match: (row) => Boolean(row?.matchFlags?.locationAlternative) },
        { key: "dates", match: (row) => Boolean(row?.matchFlags?.hasDateRuleAlternative || row?.hasDateRuleAlternative) },
        { key: "type", match: (row) => Boolean(row?.matchFlags?.typeAlternative) },
        { key: "comfort", match: (row) => Boolean(row?.matchFlags?.hasComfortAlternative || row?.hasComfortAlternative) },
      ];
}

function inferAlternativeSection(row, prioritizeBeachComfort = false) {
  return getAlternativeSectionDefs(prioritizeBeachComfort).find((def) => def.match(row))?.key || "other";
}

function getAlternativeSectionOrder(prioritizeBeachComfort = false) {
  return [...getAlternativeSectionDefs(prioritizeBeachComfort).map((def) => def.key), "other"];
}

function summarizeAlternativeRelaxations(lang, alternatives) {
  const counters = new Map();
  for (const row of Array.isArray(alternatives) ? alternatives : []) {
    const reasons = Array.isArray(row?.alternativeReasons) ? row.alternativeReasons : [];
    for (const reason of reasons) {
      const key = String(reason || "").trim();
      if (!key) continue;
      counters.set(key, (counters.get(key) || 0) + 1);
    }
  }
  const ordered = Array.from(counters.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason]) => comfortFallbackLabel(reason, lang) || (
      reason === "subtype"
        ? (lang === "tn" ? "type s+ diff�rent" : lang === "en" ? "different s+ type" : "sous-type different")
        : reason === "type"
        ? (lang === "tn" ? "type bien diff�rent" : lang === "en" ? "different property type" : "type de bien different")
        : reason === "location"
        ? (lang === "tn" ? "zone proche" : lang === "en" ? "nearby area" : "zone proche")
        : reason === "budget"
        ? (lang === "tn" ? "prix diff�rent" : lang === "en" ? "different price range" : "budget different")
        : reason === "pool_private"
        ? (lang === "tn" ? "sans piscine priv�e exacte" : lang === "en" ? "without exact private pool" : "sans piscine privee exacte")
        : reason === "beachfront"
        ? (lang === "tn" ? "sans pied dans l'eau exact" : lang === "en" ? "without exact beachfront" : "sans pied dans l'eau exact")
        : null
    ))
    .filter(Boolean);
  return ordered;
}

function alternativeSectionLabel(section, lang) {
  const labels = {
    location_dates: { tn: "badil emplacement w dates", en: "location and dates alternative", fr: "alternative emplacement et dates" },
    location_type: { tn: "badil emplacement w type", en: "location and type alternative", fr: "alternative emplacement et type" },
    location_comfort: { tn: "badil emplacement w confort", en: "location and comfort alternative", fr: "alternative emplacement et confort" },
    dates_type: { tn: "badil dates w type", en: "dates and type alternative", fr: "alternative dates et type" },
    dates_comfort: { tn: "badil dates w confort", en: "dates and comfort alternative", fr: "alternative dates et confort" },
    type_comfort: { tn: "badil type w confort", en: "type and comfort alternative", fr: "alternative type et confort" },
    location: { tn: "badil emplacement", en: "location alternative", fr: "alternative emplacement" },
    dates: { tn: "badil dates", en: "dates alternative", fr: "alternative dates" },
    type: { tn: "badil type", en: "type alternative", fr: "alternative type" },
    comfort: { tn: "badil confort", en: "comfort alternative", fr: "alternative confort" },
    other: { tn: "badayel okhrin", en: "other alternatives", fr: "autres alternatives" },
  };
  return labels[section]?.[lang === "tn" || lang === "en" ? lang : "fr"] || labels.other[lang === "tn" || lang === "en" ? lang : "fr"];
}

function formatRequestedTypeLabel(constraints) {
  const parts = [];
  if (constraints?.type && constraints.type !== "autre") parts.push(String(constraints.type).trim());
  if (constraints?.subType && constraints.subType !== "autre") parts.push(String(constraints.subType).trim());
  return parts.filter(Boolean).join(" ");
}

function renderLocationAlternativeLineForChat(row, constraints, lang) {
  const requested = String(constraints?.location || "").trim();
  const alternative = String(row?.location || "").trim();
  if (!requested || !alternative || requested === alternative) return null;
  if (lang === "tn") return `emplacement: ${requested} -> ${alternative}`;
  if (lang === "en") return `location: ${requested} -> ${alternative}`;
  return `emplacement: ${requested} -> ${alternative}`;
}

function renderTypeAlternativeLineForChat(row, constraints, lang) {
  const requested = formatRequestedTypeLabel(constraints);
  const alternative = [String(row?.type || "").trim(), inferPropertySubType(row)]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!requested || !alternative || requested === alternative) return null;
  if (lang === "tn") return `type: ${requested} -> ${alternative}`;
  if (lang === "en") return `type: ${requested} -> ${alternative}`;
  return `type: ${requested} -> ${alternative}`;
}

function renderDateAlternativeLineForChat(row, constraints, lang) {
  if (!constraints?.startDate || !constraints?.endDate || !row?.hasDateRuleAlternative) return null;
  const requested = `${formatShortDate(constraints.startDate)}-${formatShortDate(constraints.endDate)}`;
  if (row?.stayDateAlternative?.start && row?.stayDateAlternative?.end) {
    const alternative = `${formatShortDate(row.stayDateAlternative.start)}-${formatShortDate(row.stayDateAlternative.end)}`;
    if (lang === "tn") return `dates: ${requested} -> ${alternative}`;
    if (lang === "en") return `dates: ${requested} -> ${alternative}`;
    return `dates: ${requested} -> ${alternative}`;
  }
  if (row?.dateFailureReason) {
    const reason = formatDateAlternativeReason(row.dateFailureReason);
    if (lang === "tn") return `dates/regle sejour: ${requested} -> ${reason}`;
    if (lang === "en") return `dates/stay rule: ${requested} -> ${reason}`;
    return `dates/regle sejour: ${requested} -> ${reason}`;
  }
  return null;
}

function renderComfortAlternativeLineForChat(row, constraints, lang) {
  const requested = Array.isArray(constraints?.preferences) ? constraints.preferences : [];
  const changes = [];
  if (row?.matchFlags?.hasComfortAlternative || row?.hasComfortAlternative) {
    const reasons = Array.isArray(row?.alternativeReasons) ? row.alternativeReasons : [];
    for (const reason of reasons) {
      const label = comfortFallbackLabel(reason, lang);
      if (label) changes.push(label);
    }
  }
  if (changes.length === 0 || requested.length === 0) return null;
  const rendered = Array.from(new Set(changes)).join(" | ");
  if (lang === "tn") return `confort: ${rendered}`;
  if (lang === "en") return `comfort: ${rendered}`;
  return `confort: ${rendered}`;
}

function buildAlternativeChangeSummary(row, constraints, lang) {
  return [
    renderLocationAlternativeLineForChat(row, constraints, lang),
    (row?.matchFlags?.typeAlternative || row?.matchFlags?.hasTypeAlternative31 || row?.matchFlags?.hasTypeAlternative32) ? renderTypeAlternativeLineForChat(row, constraints, lang) : null,
    renderDateAlternativeLineForChat(row, constraints, lang),
    renderComfortAlternativeLineForChat(row, constraints, lang),
  ].filter(Boolean);
}

function formatAlternativeOptionWithChanges(row, constraints, lang, index) {
  const label = `${index + 1}. ${formatPropertyLabel(row, lang)}`;
  const changes = buildAlternativeChangeSummary(row, constraints, lang);
  if (changes.length === 0) return label;
  return `${label}\n   ${changes.join("\n   ")}`;
}

function formatBlockedReservationReasons(lang, reasons) {
  const rows = (Array.isArray(reasons) ? reasons : []).map((reason) => String(reason || "").trim()).filter(Boolean);
  return rows.map((reason) => {
    if (reason === "pending") {
      if (lang === "tn") return "dates hedhouma taw en attente ta2kid client ekher";
      if (lang === "en") return "these dates are currently pending another client's confirmation";
      return "ces dates sont actuellement en attente de confirmation par un autre client";
    }
    if (reason === "booked") {
      if (lang === "tn") return "deja reserve fil dates hedhouma";
      if (lang === "en") return "already booked for these dates";
      return "deja reserve pour ces dates";
    }
    if (reason === "blocked") {
      if (lang === "tn") return "bloque fil dates hedhouma";
      if (lang === "en") return "blocked for these dates";
      return "bloque pour ces dates";
    }
    if (reason === "unavailable") {
      if (lang === "tn") return "deja reserve wala bloque fil dates hedhouma";
      if (lang === "en") return "already reserved or blocked for these dates";
      return "deja reserve ou bloque pour ces dates";
    }
    if (/capacite max\s+(\d+)/i.test(reason)) {
      const match = reason.match(/capacite max\s+(\d+)/i);
      const count = match?.[1] || "";
      if (lang === "tn") return `capacite max ${count} voyageurs`;
      if (lang === "en") return `maximum capacity ${count} guests`;
      return `capacite maximale ${count} voyageurs`;
    }
    if (/minimum\s+(\d+)/i.test(reason)) {
      const match = reason.match(/minimum\s+(\d+)/i);
      const count = match?.[1] || "";
      if (lang === "tn") return `minimum ${count} nuits`;
      if (lang === "en") return `minimum stay ${count} nights`;
      return `minimum ${count} nuits`;
    }
    if (/check-in/i.test(reason)) {
      if (lang === "tn") return `regle periode: ${reason}`;
      if (lang === "en") return `period rule: ${reason}`;
      return `regle de periode: ${reason}`;
    }
    if (/check-out/i.test(reason)) {
      if (lang === "tn") return `regle periode: ${reason}`;
      if (lang === "en") return `period rule: ${reason}`;
      return `regle de periode: ${reason}`;
    }
    return reason;
  });
}

function buildAlternativeSearchReply(lang, constraints, classified) {
  const exactCount = Array.isArray(classified?.exact) ? classified.exact.length : 0;
  const alternatives = Array.isArray(classified?.alternatives) ? classified.alternatives : [];
  if (alternatives.length === 0) return null;
  const prioritizeBeachComfort = Array.isArray(constraints?.preferences) && constraints.preferences.includes("beachfront");
  const sectionOrder = getAlternativeSectionOrder(prioritizeBeachComfort);
  const buckets = new Map();
  const groupedRows = new Map();
  for (const row of alternatives) {
    const section = inferAlternativeSection(row, prioritizeBeachComfort);
    buckets.set(section, (buckets.get(section) || 0) + 1);
    if (!groupedRows.has(section)) groupedRows.set(section, []);
    groupedRows.get(section).push(row);
  }
  const sections = Array.from(buckets.entries())
    .sort((a, b) => sectionOrder.indexOf(a[0]) - sectionOrder.indexOf(b[0]) || b[1] - a[1])
    .slice(0, 3)
    .map(([section, count]) => `${alternativeSectionLabel(section, lang)} (${count})`);
  const relaxations = summarizeAlternativeRelaxations(lang, alternatives);
  const sectionDetails = Array.from(groupedRows.entries())
    .sort((a, b) => {
      return sectionOrder.indexOf(a[0]) - sectionOrder.indexOf(b[0]) || b[1].length - a[1].length;
    })
    .slice(0, 3)
    .map(([section, rows]) => {
      const title = alternativeSectionLabel(section, lang);
      const top = rows
        .slice(0, 2)
        .map((row, index) => formatAlternativeOptionWithChanges(row, constraints, lang, index))
        .join("\n");
      return `${title}:\n${top}`;
    })
    .join("\n");
  if (lang === "tn") {
    return [
      exactCount === 0
        ? "Ma l9itech choix exact yotlob kol chay kif ma t7eb, ama l9it badayel coh�rents ynajmou yensbouk."
        : `L9it ${exactCount} choix exacts, w zeda fama badayel coh�rents ken t7eb t9aren.`,
      relaxations.length ? `Akther 7ajet rakhast'hom: ${relaxations.join(" | ")}.` : null,
      sections.length ? `A9rab cat�gories mta3 badayel: ${sections.join(" | ")}.` : null,
      "Hedhom badayel m9asmin kif ma homa fel site, w kol wa7da chnowa tbaddel:",
      sectionDetails,
      "9olli chnia t7eb: nbadlou emplacement, type, dates wala confort?",
    ].filter(Boolean).join("\n");
  }
  if (lang === "en") {
    return [
      exactCount === 0
        ? "I did not find an exact match for every part of your request, but I found coherent alternatives."
        : `I found ${exactCount} exact matches, and also coherent alternatives if you want to compare.`,
      relaxations.length ? `Main relaxed criteria: ${relaxations.join(" | ")}.` : null,
      sections.length ? `Closest alternative categories: ${sections.join(" | ")}.` : null,
      "Here are the alternatives grouped like on the website, with what changes in each option:",
      sectionDetails,
      "Tell me your decision: should I relax area, type, dates, or comfort?",
    ].filter(Boolean).join("\n");
  }
  return [
    exactCount === 0
      ? "Je n'ai pas trouv� de choix exact qui respecte toute la demande, mais j'ai trouv� des alternatives coh�rentes."
      : `J'ai trouv� ${exactCount} choix exacts, et aussi des alternatives coh�rentes si vous voulez comparer.`,
    relaxations.length ? `Criteres le plus souvent relaches: ${relaxations.join(" | ")}.` : null,
    sections.length ? `Cat�gories alternatives les plus proches: ${sections.join(" | ")}.` : null,
    "Voici les alternatives regroupees comme sur le site, avec ce qui change dans chaque proposition:",
    sectionDetails,
    "Dites-moi votre decision: faut-il relacher la zone, le type, les dates ou le confort ?",
  ].filter(Boolean).join("\n");
}

function buildZoneSummaryReply(lang, constraints, options) {
  const zones = summarizeZones(options).slice(0, 6);
  const city = String(constraints.location || "").trim();
  const subType = String(constraints.subType || constraints.type || "").trim();
  if (zones.length === 0) {
    if (lang === "tn") return `Taw ma l9itech zones wad7in 3la talbek. Ken t9olli zone mou3ayna wala budget, na9arrablek akther.`;
    if (lang === "en") return `I could not identify matching zones yet. Share a preferred area or budget and I will narrow it down.`;
    return `Je n'ai pas pu identifier de zones correspondantes pour le moment. Donnez-moi une zone ou un budget et j'affinerai.`;
  }

  const zoneLine = zones.map((item, index) => `${index + 1}. ${item.zone}${item.count > 1 ? ` (${item.count})` : ""}`).join("\n");
  if (lang === "tn") {
    const intro = city && subType
      ? `Fhemt elli t7eb taaref win fama ${subType} fi ${city}.`
      : city
        ? `Fhemt elli t7eb taaref win fama options fi ${city}.`
        : `Fhemt elli t7eb taaref win fama el options.`;
    return `${intro}\nHedhom el zones elli l9ithom:\n${zoneLine}\nKen t7eb, 9olli esm zone w nwarik el biens elli fiha.`;
  }
  if (lang === "en") {
    const intro = city && subType
      ? `I understood that you want to know which areas in ${city} have ${subType} options.`
      : `I understood that you want the matching areas first.`;
    return `${intro}\nAvailable areas:\n${zoneLine}\nTell me one area and I will show the matching properties there.`;
  }
  return `${city && subType ? `J'ai compris que vous voulez savoir dans quelles zones de ${city} il y a des ${subType}.` : "J'ai compris que vous voulez d'abord les zones disponibles."}\nZones trouv�es:\n${zoneLine}\nIndiquez-moi une zone et je vous montrerai les biens correspondants.`;
}

function summarizePricing(options) {
  const rows = (Array.isArray(options) ? options : []).filter((item) => Number(item?.pricePerNightTnd || 0) > 0);
  if (rows.length === 0) return null;
  const nightlyPrices = rows
    .flatMap((item) => {
      const base = Number(item.pricePerNightTnd || 0);
      const periodValues = (Array.isArray(item.pricingPeriods) ? item.pricingPeriods : [])
        .map((period) => Number(period?.prix_nuitee || 0))
        .filter((value) => Number.isFinite(value) && value > 0);
      return [base, ...periodValues];
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  const weeklyPrices = rows
    .flatMap((item) => {
      const baseWeekly = Number(item.pricePerWeekTnd || 0) > 0 ? Number(item.pricePerWeekTnd) : Number(item.pricePerNightTnd || 0) * 7;
      const periodValues = (Array.isArray(item.pricingPeriods) ? item.pricingPeriods : [])
        .map((period) => {
          const weekly = Number(period?.prix_semaine || 0);
          if (Number.isFinite(weekly) && weekly > 0) return weekly;
          const nightly = Number(period?.prix_nuitee || 0);
          return Number.isFinite(nightly) && nightly > 0 ? nightly * 7 : 0;
        })
        .filter((value) => Number.isFinite(value) && value > 0);
      return [baseWeekly, ...periodValues];
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!nightlyPrices.length || !weeklyPrices.length) return null;
  return {
    minNightly: Math.min(...nightlyPrices),
    maxNightly: Math.max(...nightlyPrices),
    minWeekly: Math.min(...weeklyPrices),
    maxWeekly: Math.max(...weeklyPrices),
    sampleCount: rows.length,
  };
}

function summarizePricingAtDate(options, targetDateRaw) {
  const targetDate = parseIsoDateAtMidnight(targetDateRaw);
  if (!targetDate) return null;
  const rows = [];
  for (const option of Array.isArray(options) ? options : []) {
    const periods = Array.isArray(option?.pricingPeriods) ? option.pricingPeriods : [];
    const activePeriod = getActivePricingPeriod(periods, targetDate);
    const nightly = normalizePositivePrice(activePeriod?.prix_nuitee) || normalizePositivePrice(option?.pricePerNightTnd);
    const weekly = normalizePositivePrice(activePeriod?.prix_semaine) || normalizePositivePrice(option?.pricePerWeekTnd) || (nightly > 0 ? nightly * 7 : 0);
    if (nightly <= 0 && weekly <= 0) continue;
    rows.push({
      reference: option?.reference || option?.id || null,
      nightly,
      weekly,
      minimumNights: Math.max(1, Number(activePeriod?.minimum_nuitees || 1)),
      checkinDay: normalizeWeekday(activePeriod?.checkin_jour),
      checkoutDay: normalizeWeekday(activePeriod?.checkout_jour),
      hasPeriodPricing: Boolean(activePeriod),
    });
  }
  if (!rows.length) return null;
  const nightlyValues = rows.map((row) => row.nightly).filter((value) => value > 0);
  const weeklyValues = rows.map((row) => row.weekly).filter((value) => value > 0);
  return {
    date: targetDateRaw,
    minNightly: nightlyValues.length ? Math.min(...nightlyValues) : null,
    maxNightly: nightlyValues.length ? Math.max(...nightlyValues) : null,
    minWeekly: weeklyValues.length ? Math.min(...weeklyValues) : null,
    maxWeekly: weeklyValues.length ? Math.max(...weeklyValues) : null,
    sampleCount: rows.length,
    rows,
  };
}

function parseIsoDateAtMidnight(value) {
  if (value instanceof Date) {
    const dt = new Date(value.getTime());
    if (Number.isNaN(dt.getTime())) return null;
    return new Date(`${dt.toISOString().slice(0, 10)}T00:00:00`);
  }
  const raw = String(value || "").trim();
  const isoCandidate = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
  const s = isoCandidate || raw.slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function diffNights(startDate, endDate) {
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
}

function formatShortDate(value) {
  const parsed = parseIsoDateAtMidnight(value);
  if (!parsed) return String(value || "");
  return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function classifyDateRuleReason(reason) {
  const normalized = normText(reason);
  if (!normalized) return "none";
  if (normalized.includes("minimum") || normalized.includes("maximum")) return "min_max";
  if (normalized.includes("check-in") || normalized.includes("check-out") || normalized.includes("regle")) return "weekday";
  if (normalized.includes("dates non disponibles") || normalized.includes("unavailable")) return "availability";
  return "other";
}

function getStayAvailabilityAlternativeLabel(alternative) {
  if (!alternative) return null;
  if (alternative.kind === "shorter") {
    const delta = Math.max(1, Math.abs(Number(alternative.nightDelta || 1)));
    return `-${delta} nuit${delta > 1 ? "s" : ""}`;
  }
  if (alternative.kind === "longer") {
    const delta = Math.max(1, Math.abs(Number(alternative.nightDelta || 1)));
    return `+${delta} nuit${delta > 1 ? "s" : ""}`;
  }
  const shift = Number(alternative.shiftDays || 0);
  const absShift = Math.max(1, Math.abs(shift));
  return `${shift >= 0 ? "+" : "-"}${absShift} j`;
}

function shiftDateOnly(raw, deltaDays) {
  const date = parseIsoDateAtMidnight(raw);
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + deltaDays);
  return dateKey(next);
}

function isValidStayRange(startRaw, endRaw) {
  const start = parseIsoDateAtMidnight(startRaw);
  const end = parseIsoDateAtMidnight(endRaw);
  return Boolean(start && end && end > start);
}

function buildStayAvailabilityAlternative(requestedStart, requestedEnd, candidateStart, candidateEnd) {
  const requestedStartDate = parseIsoDateAtMidnight(requestedStart);
  const requestedEndDate = parseIsoDateAtMidnight(requestedEnd);
  const candidateStartDate = parseIsoDateAtMidnight(candidateStart);
  const candidateEndDate = parseIsoDateAtMidnight(candidateEnd);
  if (!requestedStartDate || !requestedEndDate || !candidateStartDate || !candidateEndDate) return null;
  const requestedNights = diffNights(requestedStartDate, requestedEndDate);
  const candidateNights = diffNights(candidateStartDate, candidateEndDate);
  if (requestedNights <= 0 || candidateNights <= 0) return null;
  const startShiftDays = Math.round((candidateStartDate.getTime() - requestedStartDate.getTime()) / 86400000);
  const nightDelta = candidateNights - requestedNights;
  if (nightDelta < 0) return { kind: "shorter", nightDelta, start: candidateStart, end: candidateEnd };
  if (nightDelta > 0) return { kind: "longer", nightDelta, start: candidateStart, end: candidateEnd };
  return { kind: "shifted_week", shiftDays: startShiftDays, start: candidateStart, end: candidateEnd };
}

function findBestStayRangeAlternative({ startRaw, endRaw, isRangeValid, maxShiftDays = 7, maxNightDelta = 7 }) {
  if (!isValidStayRange(startRaw, endRaw)) return null;
  const requestedStart = String(startRaw);
  const requestedEnd = String(endRaw);
  const candidateRanges = [];
  for (let offset = 1; offset <= Math.max(0, Number(maxShiftDays || 7)); offset += 1) {
    candidateRanges.push(
      { start: shiftDateOnly(requestedStart, offset), end: shiftDateOnly(requestedEnd, offset) },
      { start: shiftDateOnly(requestedStart, -offset), end: shiftDateOnly(requestedEnd, -offset) }
    );
  }
  for (let delta = 1; delta <= Math.max(0, Number(maxNightDelta || 7)); delta += 1) {
    candidateRanges.push(
      { start: requestedStart, end: shiftDateOnly(requestedEnd, -delta) },
      { start: shiftDateOnly(requestedStart, delta), end: requestedEnd },
      { start: shiftDateOnly(requestedStart, -delta), end: requestedEnd },
      { start: requestedStart, end: shiftDateOnly(requestedEnd, delta) }
    );
  }
  for (const candidate of candidateRanges) {
    if (!candidate.start || !candidate.end) continue;
    if (!isValidStayRange(candidate.start, candidate.end)) continue;
    if (!isRangeValid(candidate.start, candidate.end)) continue;
    const alternative = buildStayAvailabilityAlternative(requestedStart, requestedEnd, candidate.start, candidate.end);
    if (alternative) return alternative;
  }
  return null;
}

function findPreferredFutureStayAlternative({ startRaw, endRaw, isRangeValid, maxShiftDays = 30, maxNightDelta = 14 }) {
  if (!isValidStayRange(startRaw, endRaw)) return null;
  const requestedStart = String(startRaw);
  const requestedEnd = String(endRaw);
  for (let offset = 1; offset <= Math.max(0, Number(maxShiftDays || 30)); offset += 1) {
    const candidateStart = shiftDateOnly(requestedStart, offset);
    const candidateEnd = shiftDateOnly(requestedEnd, offset);
    if (!candidateStart || !candidateEnd) continue;
    if (!isValidStayRange(candidateStart, candidateEnd)) continue;
    if (!isRangeValid(candidateStart, candidateEnd)) continue;
    const alternative = buildStayAvailabilityAlternative(requestedStart, requestedEnd, candidateStart, candidateEnd);
    if (alternative) return alternative;
  }
  for (let delta = 1; delta <= Math.max(0, Number(maxNightDelta || 14)); delta += 1) {
    const candidateRanges = [
      { start: shiftDateOnly(requestedStart, delta), end: requestedEnd },
      { start: requestedStart, end: shiftDateOnly(requestedEnd, delta) },
    ];
    for (const candidate of candidateRanges) {
      if (!candidate.start || !candidate.end) continue;
      if (!isValidStayRange(candidate.start, candidate.end)) continue;
      if (!isRangeValid(candidate.start, candidate.end)) continue;
      const alternative = buildStayAvailabilityAlternative(requestedStart, requestedEnd, candidate.start, candidate.end);
      if (alternative) return alternative;
    }
  }
  return findBestStayRangeAlternative({ startRaw, endRaw, isRangeValid, maxShiftDays, maxNightDelta });
}

function normalizePositivePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function getActivePricingPeriod(periods, day) {
  const target = dateKey(day);
  return (Array.isArray(periods) ? periods : [])
    .filter((period) => {
      const start = String(period?.start || "").slice(0, 10);
      const end = String(period?.end || "").slice(0, 10);
      return start && end && start <= target && end >= target && normalizePositivePrice(period?.prix_nuitee) > 0;
    })
    .sort((a, b) => String(b?.start || "").localeCompare(String(a?.start || "")) || String(b?.end || "").localeCompare(String(a?.end || "")))[0] || null;
}

function normalizeWeekday(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"].includes(normalized) ? normalized : null;
}

function weekdayFr(date) {
  return ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][date.getDay()] || null;
}

function getStayRuleDiagnostics(options, constraints) {
  if (!constraints?.startDate || !constraints?.endDate) return null;
  const start = parseIsoDateAtMidnight(constraints.startDate);
  const end = parseIsoDateAtMidnight(constraints.endDate);
  if (!start || !end || end <= start) return null;
  const nights = diffNights(start, end);
  if (nights <= 0) return null;

  const rows = [];
  for (const option of Array.isArray(options) ? options : []) {
    const periods = Array.isArray(option?.pricingPeriods) ? option.pricingPeriods : [];
    let requiredMinStay = 1;
    for (let offset = 0; offset < nights; offset += 1) {
      const period = getActivePricingPeriod(periods, addDays(start, offset));
      const periodMin = Math.max(1, Number(period?.minimum_nuitees || 1));
      if (Number.isFinite(periodMin) && periodMin > requiredMinStay) requiredMinStay = periodMin;
    }
    const arrivalPeriod = getActivePricingPeriod(periods, start);
    const departurePeriod = getActivePricingPeriod(periods, addDays(end, -1));
    const requiredCheckinDay = normalizeWeekday(arrivalPeriod?.checkin_jour);
    const requiredCheckoutDay = normalizeWeekday(departurePeriod?.checkout_jour);
    rows.push({
      reference: option?.reference || option?.id || null,
      requiredMinStay,
      requiredCheckinDay,
      requiredCheckoutDay,
      startDay: weekdayFr(start),
      endDay: weekdayFr(end),
      minStayOk: nights >= requiredMinStay,
      checkinOk: !requiredCheckinDay || requiredCheckinDay === weekdayFr(start),
      checkoutOk: !requiredCheckoutDay || requiredCheckoutDay === weekdayFr(end),
    });
  }
  if (!rows.length) return null;
  return {
    nights,
    strictestMinStay: Math.max(...rows.map((row) => Number(row.requiredMinStay || 1))),
    checkinDays: Array.from(new Set(rows.map((row) => row.requiredCheckinDay).filter(Boolean))),
    checkoutDays: Array.from(new Set(rows.map((row) => row.requiredCheckoutDay).filter(Boolean))),
    rows,
  };
}

function calculateSegmentSubtotal(nights, nightlyPrice, weeklyPrice) {
  const nightly = normalizePositivePrice(nightlyPrice);
  const weekly = normalizePositivePrice(weeklyPrice) || (nightly * 7);
  if (nights <= 0 || nightly <= 0) return 0;
  if (nights >= 7 && weekly > 0) return Math.round(((weekly * nights) / 7) * 100) / 100;
  return Math.round((nightly * nights) * 100) / 100;
}

function calculateStayPricing(property, startDateRaw, endDateRaw) {
  const start = parseIsoDateAtMidnight(startDateRaw);
  const end = parseIsoDateAtMidnight(endDateRaw);
  if (!start || !end || end <= start) return null;
  const nights = diffNights(start, end);
  if (nights <= 0) return null;
  const baseNightly = normalizePositivePrice(property?.pricePerNightTnd);
  const baseWeekly = normalizePositivePrice(property?.pricePerWeekTnd) || (baseNightly * 7);
  let total = 0;
  let segmentNights = 0;
  let currentKey = null;
  let currentNightly = 0;
  let currentWeekly = 0;

  const flush = () => {
    if (!segmentNights || !currentKey) return;
    total += calculateSegmentSubtotal(segmentNights, currentNightly, currentWeekly);
    segmentNights = 0;
  };

  for (let offset = 0; offset < nights; offset += 1) {
    const day = addDays(start, offset);
    const period = getActivePricingPeriod(property?.pricingPeriods, day);
    const nightly = normalizePositivePrice(period?.prix_nuitee) || baseNightly;
    const weekly = normalizePositivePrice(period?.prix_semaine) || baseWeekly || (nightly * 7);
    const key = period ? `period:${String(period.start)}:${String(period.end)}:${nightly}:${weekly}` : `base:${nightly}:${weekly}`;
    if (currentKey === null) {
      currentKey = key;
      currentNightly = nightly;
      currentWeekly = weekly;
      segmentNights = 1;
      continue;
    }
    if (key === currentKey) {
      segmentNights += 1;
      continue;
    }
    flush();
    currentKey = key;
    currentNightly = nightly;
    currentWeekly = weekly;
    segmentNights = 1;
  }
  flush();

  return {
    nights,
    total: Math.round(total * 100) / 100,
    averageNightly: Math.round((total / nights) * 100) / 100,
  };
}

function summarizeExactStayPricing(options, constraints) {
  if (!constraints?.startDate || !constraints?.endDate) return null;
  const rows = (Array.isArray(options) ? options : [])
    .map((option) => ({ option, pricing: calculateStayPricing(option, constraints.startDate, constraints.endDate) }))
    .filter((row) => row.pricing && row.pricing.total > 0);
  if (!rows.length) return null;
  const totals = rows.map((row) => row.pricing.total);
  const averages = rows.map((row) => row.pricing.averageNightly);
  const nights = rows[0].pricing.nights;
  return {
    nights,
    minTotal: Math.min(...totals),
    maxTotal: Math.max(...totals),
    minAverageNightly: Math.min(...averages),
    maxAverageNightly: Math.max(...averages),
    sampleCount: rows.length,
  };
}

function buildPriceSummaryReply(lang, constraints, options) {
  const stayPricing = summarizeExactStayPricing(options, constraints);
  const stayRules = getStayRuleDiagnostics(options, constraints);
  const pricing = summarizePricing(options);
  const pricingAtDate = constraints?.startDate && !constraints?.endDate ? summarizePricingAtDate(options, constraints.startDate) : null;
  const singleOption = Array.isArray(options) && options.length === 1 ? options[0] : null;
  const label = String(
    constraints.subType
    || (constraints.type && constraints.type !== "autre" ? constraints.type : "")
    || (singleOption?.reference ? `ref ${singleOption.reference}` : "")
    || singleOption?.title
    || "biens"
  ).trim();
  const city = String(constraints.location || "").trim();
  if (!pricing && !stayPricing && !pricingAtDate) {
    if (lang === "tn") return `Taw ma najjemch naatik soum d9i9 5ater ma l9itech biens kif talebt. Ken t9olli zone wala date wala p�riode, na9arrablek akther.`;
    if (lang === "en") return `I cannot estimate the price yet because I do not have matching properties for this request. Share an area or dates and I will narrow it down.`;
    return `Je ne peux pas encore estimer le prix faute de biens correspondants � cette demande. Donnez-moi une zone ou des dates et j'affinerai.`;
  }

  if (pricingAtDate) {
    const nightly = pricingAtDate.minNightly ? `${pricingAtDate.minNightly} TND/nuit` : null;
    const weekly = pricingAtDate.minWeekly ? `${pricingAtDate.minWeekly} TND/semaine` : null;
    const minStay = Math.max(...pricingAtDate.rows.map((row) => Number(row.minimumNights || 1)));
    const hasCheckinRules = pricingAtDate.rows.some((row) => row.checkinDay || row.checkoutDay);
    if (lang === "tn") {
      return `Bennesba lel ${city ? `${label} fi ${city}` : label} nhar ${constraints.startDate}, el soum yabda men ${nightly || "n/a"}${weekly ? ` w men ${weekly}` : ""}. Hatha 7asb periode tarifaire mta3 nhar hedha, ama disponibilit� tab9a tethabet wa9t el r�servation. ${minStay > 1 ? `Baadh el biens yetalbou minimum ${minStay} nuits. ` : ""}${hasCheckinRules ? "Fama zeda baadh r�gles check-in/check-out 7asb el bien. " : ""}Ken t7eb, nwariklek zeda anahi biens aw zones elli fihom soum hedha.`;
    }
    if (lang === "en") {
      return `For ${city ? `${label} in ${city}` : label} on ${constraints.startDate}, prices start from ${nightly || "n/a"}${weekly ? ` and ${weekly}` : ""}. This is based on the pricing period active on that date, but availability still depends on the property. ${minStay > 1 ? `Some properties require a minimum stay of ${minStay} nights. ` : ""}${hasCheckinRules ? "Some properties also have check-in/check-out day rules. " : ""}If you want, I can also show the matching properties or areas.`;
    }
    return `Pour ${city ? `${label} � ${city}` : label} � la date du ${constraints.startDate}, les prix commencent � partir de ${nightly || "n/a"}${weekly ? ` et ${weekly}` : ""}. Cela correspond � la p�riode tarifaire active � cette date, sous r�serve de disponibilit� r�elle des biens. ${minStay > 1 ? `Certains biens demandent un minimum de ${minStay} nuits. ` : ""}${hasCheckinRules ? "Certains biens ont aussi des r�gles de check-in/check-out selon les jours. " : ""}Si vous voulez, je peux aussi vous montrer les biens ou les zones correspondants.`;
  }

  if (stayPricing) {
    const intro = city ? `${label} fi ${city}` : label;
    const minStayLine = stayRules?.strictestMinStay && stayRules.strictestMinStay > stayPricing.nights
      ? ` Baadh el biens yetalbou minimum ${stayRules.strictestMinStay} nuits.`
      : "";
    const weekdayLine = stayRules && ((stayRules.checkinDays || []).length > 0 || (stayRules.checkoutDays || []).length > 0)
      ? ` Fama zeda r�gles check-in/check-out 7asb baadh les periodes.`
      : "";
    if (lang === "tn") {
      return `Bennesba lel ${intro}, lel dates mteek men ${constraints.startDate} lel ${constraints.endDate}, les tarifs disponibles yebdew men ${stayPricing.minTotal} TND lkol l ${stayPricing.nights} nuits, yaani 7doud ${stayPricing.minAverageNightly} TND/nuit.${minStayLine}${weekdayLine} Hatha soum ta9ribi w yetbaddel 7asb periode mta3 el reservation w disponibilit�. Ken t7eb, n9ollek zeda anahi zones wala nwarik options m3aynin.`;
    }
    if (lang === "en") {
      return `For ${intro}, for your dates from ${constraints.startDate} to ${constraints.endDate}, available prices start from ${stayPricing.minTotal} TND total for ${stayPricing.nights} nights, about ${stayPricing.minAverageNightly} TND/night on average.${minStayLine}${weekdayLine} This still depends on live availability and pricing period. If you want, I can also give you the matching areas or concrete properties.`;
    }
    return `Pour ${city ? `${label} � ${city}` : label}, pour vos dates du ${constraints.startDate} au ${constraints.endDate}, les tarifs disponibles commencent � partir de ${stayPricing.minTotal} TND pour ${stayPricing.nights} nuits, soit environ ${stayPricing.minAverageNightly} TND/nuit en moyenne.${minStayLine}${weekdayLine} Cela d�pend encore de la disponibilit� et de la p�riode tarifaire. Si vous voulez, je peux aussi vous donner les zones ou les biens correspondants.`;
  }

  const nightly = `${pricing.minNightly} TND/nuit`;
  const weekly = `${pricing.minWeekly} TND/semaine`;
  if (lang === "tn") {
    const intro = city ? `Bennesba lel ${label} fi ${city},` : `Bennesba lel ${label},`;
    return `${intro} el soum yabda men ${nightly} w men ${weekly}. Hatha prix de depart bark, w yetbaddel 7asb periode mta3 reservation w disponibilit�. Ken t7eb, n9ollek anahi zones wala nwarik options m3aynin.`;
  }
  if (lang === "en") {
    const intro = city ? `For ${label} in ${city},` : `For ${label},`;
    return `${intro} prices start from ${nightly} and ${weekly}. This is a starting price only and it changes depending on your reservation period and property availability. If you want, I can also show the matching areas or specific properties.`;
  }
  return `${city ? `Pour les ${label} � ${city},` : `Pour les ${label},`} les prix commencent � partir de ${nightly} et ${weekly}. Ce sont des prix de d�part, variables selon la p�riode de r�servation et la disponibilit� des biens. Si vous voulez, je peux aussi vous donner les zones ou les biens correspondants.`;
}

function buildZonePriceSummaryReply(lang, constraints, options) {
  const zoneReply = buildZoneSummaryReply(lang, constraints, options);
  const priceReply = buildPriceSummaryReply(lang, constraints, options);
  return `${zoneReply}\n\n${priceReply}`;
}

function buildProgressiveSearchReply(lang, constraints, options) {
  const classified = classifyPropertyCards(constraints, options);
  if (classified.exact.length === 0 && classified.alternatives.length > 0) {
    return buildAlternativeSearchReply(lang, constraints, classified);
  }
  const summary = [];
  const guestCount = Number(constraints.guests);
  const budgetAmount = Number(constraints.budget);
  if (constraints.type && constraints.type !== "autre") summary.push(constraints.type);
  if (constraints.subType && constraints.subType !== "autre" && constraints.subType !== constraints.type) summary.push(constraints.subType);
  if (constraints.location) summary.push(`a ${constraints.location}`);
  if (Number.isFinite(guestCount) && guestCount > 0) summary.push(`${guestCount} voyageurs`);
  if (Number.isFinite(budgetAmount) && budgetAmount > 0) summary.push(`budget ${budgetAmount} TND`);

  const missing = [];
  if (!constraints.location) missing.push(lang === "en" ? "location" : "zone");
  if (!constraints.startDate || !constraints.endDate) missing.push(lang === "en" ? "dates" : "dates");
  if (!constraints.guests) missing.push(lang === "en" ? "guests" : "voyageurs");

  const topOptions = Array.isArray(classified.combined) ? classified.combined.slice(0, 3) : [];
  const top = topOptions.map((p, index) => `${index + 1}. ${formatPropertyLabel(p, lang)}`).join("\n");
  const exactCount = classified.exact.length;
  const alternativeCount = classified.alternatives.length;

  if (lang === "en") {
    const intro = summary.length ? `I understood your request: ${summary.join(", ")}.` : "I understood your request.";
    const counts = exactCount || alternativeCount ? `I found ${exactCount} exact match(es) and ${alternativeCount} alternative(s).` : "";
    const ask = missing.length ? `Tell me ${missing.join(", ")} and I will narrow the results.` : "Tell me your dates and guest count to narrow the results.";
    return top ? `${intro}\n${counts}\nHere are some matching options:\n${top}\n${ask}` : `${intro} ${counts} ${ask}`.trim();
  }

  if (lang === "tn") {
    const intro = summary.length ? `Fhemt talbek: ${summary.join(", ")}.` : "Fhemt talbek.";
    const counts = exactCount || alternativeCount ? `L9it ${exactCount} choix exacts w ${alternativeCount} choix alternatives.` : "";
    const ask = missing.length ? `Ab3athli ${missing.join(", ")} bech ndhay9lek el ikhtiyar.` : "Ab3athli dates w 3adad voyageurs bech ndhay9lek akther.";
    return top ? `${intro}\n${counts}\nHedhom baadh options ynajmou yensbouk:\n${top}\n${ask}` : `${intro} ${counts} ${ask}`.trim();
  }

  if (lang === "ar") {
    const intro = summary.length ? `Fahimt talabak: ${summary.join(", ")}.` : "Fahimt talabak.";
    const ask = missing.length ? `Arsil li ${missing.join(", ")} bash adhayyaq al ikhtiyar.` : "Arsil li attawarikh wa 3adad al mousafirin bash adhayyaq al ikhtiyar.";
    return top ? `${intro}\nHadhihi baadh al khiyarat al mounasiba:\n${top}\n${ask}` : `${intro} ${ask}`;
  }

  const intro = summary.length ? `J'ai compris votre demande: ${summary.join(", ")}.` : "J'ai compris votre demande.";
  const counts = exactCount || alternativeCount ? `J'ai trouv� ${exactCount} choix exacts et ${alternativeCount} choix alternatives.` : "";
  const ask = missing.length ? `Indiquez-moi ${missing.join(", ")} pour affiner.` : "Indiquez-moi les dates et le nombre de voyageurs pour affiner.";
  return top ? `${intro}\n${counts}\nVoici quelques options possibles:\n${top}\n${ask}` : `${intro} ${counts} ${ask}`.trim();
}

function buildSelectedPropertyFollowupReply(lang, property, constraints) {
  const missing = [];
  if (!constraints.startDate || !constraints.endDate) missing.push("dates");
  if (!constraints.guests) missing.push(lang === "tn" ? "3adad voyageurs" : lang === "en" ? "guest count" : "voyageurs");
  const label = property ? formatPropertyLabel(property, lang) : (constraints.selectedPropertyRef || "ce bien");
  if (lang === "tn") {
    return missing.length
      ? `Ikhtart ${label}. Ab3athli ${missing.join(" w ")} bech n7sebellek total w nkammlou el reservation.`
      : `Ikhtart ${label}. Bech nkammlou, ab3athli esmek w numero tel.`;
  }
  if (lang === "en") {
    return missing.length
      ? `You selected ${label}. Send me ${missing.join(" and ")} so I can calculate the total and continue the reservation.`
      : `You selected ${label}. To continue, send me your full name and phone number.`;
  }
  if (lang === "ar") {
    return missing.length
      ? `Ikhtarta ${label}. Arsil li ${missing.join(" wa ")} bash na7seb al majmou3 wa nkammil al hajz.`
      : `Ikhtarta ${label}. Bash nkammil, arsil al ism al kamil wa raqm al hatif.`;
  }
  return missing.length
    ? `Vous avez choisi ${label}. Envoyez-moi ${missing.join(" et ")} pour que je calcule le total et continue la reservation.`
    : `Vous avez choisi ${label}. Pour continuer, envoyez-moi votre nom complet et votre telephone.`;
}

function buildReservationQuoteLine(lang, property, constraints) {
  if (!property || !constraints?.startDate || !constraints?.endDate) return "";
  const pricing = calculateStayPricing(property, constraints.startDate, constraints.endDate);
  if (!pricing || !Number.isFinite(Number(pricing.total)) || pricing.total <= 0) return "";
  const nightly = Math.max(0, Number(property?.pricePerNightTnd || 0));
  const amountDueNow = Math.min(pricing.total, nightly > 0 ? nightly : pricing.total);
  if (lang === "tn") {
    return `Total séjour ${pricing.nights} nuits: ${pricing.total} TND. Tawa fi demande réservation, a payer taw: ${amountDueNow} TND baad accord propriétaire.`;
  }
  if (lang === "en") {
    return `Stay total for ${pricing.nights} nights: ${pricing.total} TND. For the reservation request, due now after owner approval: ${amountDueNow} TND.`;
  }
  return `Total du sejour pour ${pricing.nights} nuits: ${pricing.total} TND. Montant a payer apres accord proprietaire: ${amountDueNow} TND.`;
}

function buildProfileCompletionReply(lang, constraints, property = null) {
  const missing = [];
  if (!constraints?.profile?.fullName) missing.push(lang === "tn" ? "esmek el kamel" : lang === "en" ? "your full name" : "votre nom complet");
  if (!constraints?.profile?.phone) missing.push(lang === "tn" ? "numero tel" : lang === "en" ? "your phone number" : "votre telephone");
  if (!constraints?.profile?.identityNumber) missing.push(lang === "tn" ? "numero CIN" : lang === "en" ? "your ID number" : "votre numero CIN");
  if (!constraints?.profile?.identityImageUrl) missing.push(lang === "tn" ? "photo CIN" : lang === "en" ? "your ID photo" : "la photo CIN");
  const quoteLine = buildReservationQuoteLine(lang, property, constraints);
  if (lang === "tn") {
    return [quoteLine, `Bech nkammel profil client w n3addi demande reservation, ab3athli ${missing.join(", ")}.`].filter(Boolean).join("\n");
  }
  if (lang === "en") {
    return [quoteLine, `To complete the client profile and create the reservation, send me ${missing.join(", ")}.`].filter(Boolean).join("\n");
  }
  return [quoteLine, `Pour completer le profil client et creer la reservation, envoyez-moi ${missing.join(", ")}.`].filter(Boolean).join("\n");
}

function hasCompleteReservationProfile(constraints) {
  return Boolean(
    constraints?.profile?.fullName
    && constraints?.profile?.phone
    && constraints?.profile?.identityNumber
    && constraints?.profile?.identityImageUrl
  );
}

async function persistAttachmentDataUrl(dataUrl, fileName = "") {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match?.[1] || !match?.[2]) return null;
  const mimeType = String(match[1]).toLowerCase();
  const ext =
    mimeType.includes("png") ? "png"
    : mimeType.includes("webp") ? "webp"
    : mimeType.includes("gif") ? "gif"
    : "jpg";
  await fs.mkdir(CHATBOT_MEDIA_DIR, { recursive: true });
  const safeBase = String(fileName || "chatbot-cin")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "chatbot-cin";
  const storedName = `${safeBase}-${Date.now()}.${ext}`;
  const fileBuffer = Buffer.from(match[2], "base64");
  await fs.writeFile(path.join(CHATBOT_MEDIA_DIR, storedName), fileBuffer);
  // Keep local website previews working without relying on Vite proxy behavior.
  try {
    await fs.mkdir(LOCAL_SITE_CHATBOT_MEDIA_DIR, { recursive: true });
    await fs.writeFile(path.join(LOCAL_SITE_CHATBOT_MEDIA_DIR, storedName), fileBuffer);
  } catch {
    // Best effort only for local lab usage.
  }
  return `${WEBSITE_BASE_URL}/chatbot-media/${storedName}`;
}

async function getFirstAttachmentImageUrl(payload) {
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  for (const attachment of attachments) {
    const type = String(attachment?.type || "").trim().toLowerCase();
    const mimeType = String(attachment?.mimeType || "").trim().toLowerCase();
    const url = String(attachment?.url || "").trim();
    if (url && (type === "image" || mimeType.startsWith("image/"))) return url;
    if (String(attachment?.dataUrl || "").trim() && (type === "image" || mimeType.startsWith("image/") || !type)) {
      const persistedUrl = await persistAttachmentDataUrl(attachment.dataUrl, attachment.name || "chatbot-cin");
      if (persistedUrl) return persistedUrl;
    }
  }
  return null;
}

function getStandaloneImageUrlFromText(message) {
  const match = String(message || "").match(/\b(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|bmp))\b/i);
  return match?.[1] ? String(match[1]).trim() : null;
}

function extractSelectionId(message) {
  const match = String(message || "").match(/\b(?:id|ref|property)\s*[:#-]?\s*(\d+)\b/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function extractSelectionReference(message) {
  const raw = String(message || "");
  const refMatch = raw.match(/\bref(?:erence)?\s*[:#-]?\s*([a-z0-9-]{2,30})\b/i);
  if (refMatch?.[1]) return normalizePropertyReference(refMatch[1]);
  const compactRef = raw.match(/\bREF[\s-]?\d{2,10}\b/i);
  if (compactRef?.[0]) return normalizePropertyReference(compactRef[0]);
  return null;
}

function normalizeRefToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findOptionByReference(options, reference) {
  const token = normalizeRefToken(reference);
  if (!token) return null;
  return (Array.isArray(options) ? options : []).find((option) => normalizeRefToken(option?.reference) === token) || null;
}

function languagePack(lang) {
  if (lang === "en") {
    return {
      askMissing: "Please share missing details: dates, guests, budget, and preferred location.",
      none: "No exact match is available now. I can suggest alternatives if you relax one condition (dates/budget/location).",
      choose: "I found options. Reply with the property id or reference to continue booking.",
      askIdentity: "To create your profile and reservation, please share full name and phone number.",
      askIdentityDocument: "To continue, I also need the ID number and the ID photo.",
      pending: "Your reservation request is created with status pending.",
      askPayment: "Please choose payment method (cash, bank transfer, card) and send receipt image/link to confirm payment.",
      receiptReceived: "Receipt received. Payment confirmation will be reviewed by admin.",
      statusNone: "No reservation found yet for your profile.",
    };
  }
  if (lang === "tn") {
    return {
      askMissing: "Brabi ab3athli el ma3loumet enna9sa: dates, 3adad voyageurs, budget w zone.",
      none: "Taw ma famech resultat exact kif talebt. Najem naatik badayel ken nbaddlou chwaya men conditions.",
      choose: "L9it options behin. Ab3athli ref wala id mta3 el bien bech nkammlou.",
      askIdentity: "Bech na3mlou profil w demande reservation, ab3athli esmek w numero tel.",
      askIdentityDocument: "Bech nkammel, zed ab3athli numero CIN w photo CIN.",
      pending: "Demande mte3ek tsajlet w status mte3ha taw pending.",
      askPayment: "Ikhtar tari9et el paiement: cash, virement wala carte, w ab3athli lien wala tsawer mta3 recu paiement.",
      receiptReceived: "Recu wasel. Ladmin bech ythabet el paiement.",
      statusNone: "Taw ma famech reservation msajla lel profil hedha.",
    };
  }
  if (lang === "ar") {
    return {
      askMissing: "Min fadlik zuwdni bil ma3loumet an naqsa: dates, guests, budget, wal mawqi3.",
      none: "Ma famech natija moutabiqa tawa. Najem naqtarah badayel idha nakhaffif shart wahid.",
      choose: "Laqit khiyarat mounasiba. Arsil li id aw reference mta3 el bien bash nkammilou.",
      askIdentity: "Bash naamel profil wal hajz, arsil al ism al kamil wa raqm al hatif.",
      askIdentityDocument: "Lil moutaba3a, arsil aythan raqm al hawiya wa rabit sourat al hawiya.",
      pending: "Tam insha talab al hajz wa halatou haliyan pending.",
      askPayment: "Ikhtar tariqat ad daf3 (cash, virement, carte) wa arsil soura aw rabit al wasl li ta2kid ad daf3.",
      receiptReceived: "Tam istelam al wasl. Sayoutam mouraja3at ta2kid ad daf3 min taraf al idara.",
      statusNone: "Ma famech hajz msajjal haliyan lihatha al profil.",
    };
  }
  return {
    askMissing: "Merci de partager les infos manquantes: dates, voyageurs, budget et localisation.",
    none: "Aucune option exacte disponible. Je peux proposer des alternatives si vous assouplissez une condition (dates/budget/localisation).",
    choose: "J'ai trouve des options. Repondez avec l'id ou la reference du bien pour continuer la reservation.",
    askIdentity: "Pour creer votre profil et la reservation, envoyez nom complet et telephone.",
    askIdentityDocument: "Pour continuer, envoyez aussi le numero CIN et la photo CIN.",
    pending: "Votre demande de reservation a ete creee avec le statut pending.",
    askPayment: "Choisissez le mode de paiement (especes, virement, carte) et envoyez l'image/le lien du recu pour confirmer le paiement.",
    receiptReceived: "Recu recu. La confirmation du paiement sera validee par l'administration.",
    statusNone: "Aucune reservation trouvee pour votre profil pour le moment.",
  };
}

async function findAlternatives(constraints) {
  const prefs = Array.isArray(constraints?.preferences) ? constraints.preferences : [];
  const limit = Number(process.env.CHATBOT_ALTERNATIVE_LIMIT || 60);
  const baseFilters = {
    guests: constraints.guests,
    budget: null,
    startDate: null,
    endDate: null,
    nearBeach: prefs.includes("near_beach") || prefs.includes("beachfront"),
    seaView: prefs.includes("sea_view"),
    beachfront: false,
    pool: prefs.includes("pool") || prefs.includes("pool_private") || prefs.includes("pool_shared"),
    poolPrivate: false,
    poolShared: false,
    parking: prefs.includes("parking"),
    bedrooms: constraints.bedrooms,
    floor: null,
    limit,
  };
  const requestedLocation = extractSelectedLocationHierarchy(constraints?.location);
  const locationStages = Array.from(new Set([
    requestedLocation.zone || null,
    requestedLocation.region && requestedLocation.region !== requestedLocation.zone ? requestedLocation.region : null,
    requestedLocation.governorate
      && requestedLocation.governorate !== requestedLocation.region
      && requestedLocation.governorate !== requestedLocation.zone
      ? requestedLocation.governorate
      : null,
    null,
  ]));
  const stages = [];
  for (const location of locationStages) {
    stages.push({ location, type: constraints.type, subType: constraints.subType });
    stages.push({ location, type: constraints.type, subType: null });
    stages.push({ location, type: null, subType: null });
  }
  const relaxedComfortFilters = {
    ...baseFilters,
    nearBeach: false,
    seaView: false,
    pool: false,
    parking: false,
  };
  const merged = [];
  const seen = new Set();
  const excludedIds = new Set([
    String(constraints?.selectedPropertyId || "").trim(),
  ].filter(Boolean));
  const excludedRefToken = normalizeRefToken(constraints?.selectedPropertyRef || "");
  for (const filterSet of [baseFilters, relaxedComfortFilters]) {
    for (const stage of stages) {
      const rows = await searchAvailableProperties({
        ...filterSet,
        location: stage.location,
        type: stage.type,
        subType: stage.subType,
      });
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = String(row?.id || "");
        if (!key || seen.has(key) || excludedIds.has(key)) continue;
        if (excludedRefToken && normalizeRefToken(row?.reference) === excludedRefToken) continue;
        seen.add(key);
        merged.push({
          ...row,
          alternativeSearchStage: stage.location || "global",
          alternativeSearchStageRank: locationStages.indexOf(stage.location),
        });
        if (merged.length >= limit) break;
      }
      if (merged.length >= limit) break;
    }
    if (merged.length >= limit) break;
  }
  return attachAlternativeStayData(merged, constraints);
}

async function isProjectPropertyUnavailableForDates(propertyId, startDate, endDate) {
  if (DATA_SOURCE !== "project" || !propertyId || !startDate || !endDate) return false;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT bien_id
     FROM ${PROJECT_DB}.unavailable_dates
     WHERE bien_id = ?
       AND status IN ('blocked','booked')
       AND start_date < ?
       AND end_date > ?
     LIMIT 1`,
    String(propertyId),
    endDate,
    startDate
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function getProjectPropertyOverlap(propertyId, startDate, endDate, options = {}) {
  if (DATA_SOURCE !== "project" || !propertyId || !startDate || !endDate) return null;
  const includePending = Boolean(options?.includePending);
  const statuses = includePending ? ["blocked", "booked", "pending"] : ["blocked", "booked"];
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, bien_id, start_date, end_date, status, payment_deadline
     FROM ${PROJECT_DB}.unavailable_dates
     WHERE bien_id = ?
       AND status IN (${statuses.map(() => "?").join(",")})
       AND start_date < ?
       AND end_date > ?
     ORDER BY FIELD(status, 'booked', 'blocked', 'pending')
     LIMIT 1`,
    String(propertyId),
    ...statuses,
    endDate,
    startDate
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function evaluateSpecificPropertyRequest(property, constraints, options = {}) {
  if (!property) return { ok: false, reason: "not_found" };
  if (!constraints?.startDate || !constraints?.endDate) return { ok: true, property };
  const includePendingAvailability = Boolean(options?.includePendingAvailability);

  const enrichedProperty = (await attachAlternativeStayData([property], constraints))?.[0] || property;
  const overlap = includePendingAvailability
    ? await getProjectPropertyOverlap(property.id, constraints.startDate, constraints.endDate, { includePending: true })
    : null;
  const unavailable = overlap
    ? true
    : await isProjectPropertyUnavailableForDates(property.id, constraints.startDate, constraints.endDate);
  const unavailableRows = DATA_SOURCE === "project"
    ? await prisma.$queryRawUnsafe(
        `SELECT bien_id, start_date, end_date, status
         FROM ${PROJECT_DB}.unavailable_dates
         WHERE bien_id = ?
           AND status IN ('blocked', 'pending', 'booked')`,
        String(property.id)
      )
    : [];
  const stayRules = getStayRuleDiagnostics([enrichedProperty], constraints);
  const rule = stayRules?.rows?.[0] || null;
  const samePropertyDateAlternative = findPreferredFutureStayAlternative({
    startRaw: constraints.startDate,
    endRaw: constraints.endDate,
    isRangeValid: (candidateStart, candidateEnd) => evaluatePropertyStayWindow(
      enrichedProperty,
      candidateStart,
      candidateEnd,
      unavailableRows,
      { includePending: includePendingAvailability }
    ).ok,
    maxShiftDays: 30,
    maxNightDelta: 14,
  });
  const errors = [];
  const requestedGuests = Number(constraints?.guests || 0);
  const propertyCapacity = Number(enrichedProperty?.capacity || 0);
  if (unavailable) {
    const overlapStatus = String(overlap?.status || "").trim().toLowerCase();
    if (overlapStatus === "pending") errors.push("pending");
    else if (overlapStatus === "booked") errors.push("booked");
    else if (overlapStatus === "blocked") errors.push("blocked");
    else errors.push("unavailable");
  }
  if (requestedGuests > 0 && propertyCapacity > 0 && requestedGuests > propertyCapacity) {
    errors.push(`capacite max ${propertyCapacity} voyageurs`);
  }
  if (rule && !rule.minStayOk) errors.push(`minimum ${rule.requiredMinStay} nuits`);
  if (rule && !rule.checkinOk && rule.requiredCheckinDay) errors.push(`check-in ${rule.requiredCheckinDay}`);
  if (rule && !rule.checkoutOk && rule.requiredCheckoutDay) errors.push(`check-out ${rule.requiredCheckoutDay}`);
  return {
    ok: errors.length === 0,
    property: {
      ...enrichedProperty,
      stayDateAlternative: (() => {
        const candidate = samePropertyDateAlternative || enrichedProperty?.stayDateAlternative || null;
        if (!candidate?.start || !candidate?.end) return null;
        if (parseDate(candidate.start) === parseDate(constraints.startDate) && parseDate(candidate.end) === parseDate(constraints.endDate)) {
          return null;
        }
        return candidate;
      })(),
      hasDateRuleAlternative: Boolean(
        (samePropertyDateAlternative || enrichedProperty?.stayDateAlternative)
        && !(
          parseDate((samePropertyDateAlternative || enrichedProperty?.stayDateAlternative)?.start) === parseDate(constraints.startDate)
          && parseDate((samePropertyDateAlternative || enrichedProperty?.stayDateAlternative)?.end) === parseDate(constraints.endDate)
        )
      ),
    },
    errors,
    stayRule: rule,
  };
}

function buildSpecificPropertyBlockedReply(lang, property, evaluation, alternatives, constraints = null) {
  const title = property?.reference ? `Ref ${property.reference}` : String(property?.title || "ce bien");
  const reasons = formatBlockedReservationReasons(lang, Array.isArray(evaluation?.errors) ? evaluation.errors : []);
  const evaluatedProperty = evaluation?.property || property;
  const altRows = [...(Array.isArray(alternatives) ? alternatives : [])].sort((a, b) => {
    const score = (row) => {
      if (row?.matchFlags?.hasDateRuleAlternative || row?.hasDateRuleAlternative) return 0;
      if (row?.matchFlags?.exactLocationMatch && row?.matchFlags?.strictTypeMatch && row?.matchFlags?.exactDateAvailable) return 1;
      if (row?.matchFlags?.locationAlternative) return 2;
      if (row?.matchFlags?.typeAlternative) return 3;
      if (row?.matchFlags?.hasComfortAlternative) return 4;
      return 9;
    };
    return score(a) - score(b)
      || Number(b?.matchScore || 0) - Number(a?.matchScore || 0);
  }).slice(0, 3);
  const sameRefDateAlternative = evaluatedProperty?.stayDateAlternative
    && !(
      parseDate(evaluatedProperty.stayDateAlternative.start) === parseDate(constraints?.startDate)
      && parseDate(evaluatedProperty.stayDateAlternative.end) === parseDate(constraints?.endDate)
    )
    ? (lang === "tn"
      ? `1. Nbadlou ken dates, w neb9aw 3la nafs ${title}: ${formatShortDate(constraints?.startDate)}-${formatShortDate(constraints?.endDate)} -> ${formatShortDate(evaluatedProperty.stayDateAlternative.start)}-${formatShortDate(evaluatedProperty.stayDateAlternative.end)}`
      : lang === "en"
      ? `1. Keep the same ${title} and only change dates: ${formatShortDate(constraints?.startDate)}-${formatShortDate(constraints?.endDate)} -> ${formatShortDate(evaluatedProperty.stayDateAlternative.start)}-${formatShortDate(evaluatedProperty.stayDateAlternative.end)}`
      : `1. Garder la meme ${title} et changer seulement les dates: ${formatShortDate(constraints?.startDate)}-${formatShortDate(constraints?.endDate)} -> ${formatShortDate(evaluatedProperty.stayDateAlternative.start)}-${formatShortDate(evaluatedProperty.stayDateAlternative.end)}`)
    : null;
  const altTop = altRows.map((item, index) => formatAlternativeOptionWithChanges(item, {
    location: constraints?.location || property?.location || null,
    type: constraints?.type || property?.type || null,
    subType: constraints?.subType || inferPropertySubType(property) || null,
    startDate: constraints?.startDate || null,
    endDate: constraints?.endDate || null,
    preferences: Array.isArray(constraints?.preferences) ? constraints.preferences : [],
  }, lang, sameRefDateAlternative ? index + 1 : index)).join("\n");
  const alternativesBody = [sameRefDateAlternative, altTop].filter(Boolean).join("\n");
  const reasonsText = reasons.join(" | ");
  if (lang === "tn") {
    return alternativesBody
      ? `${title} ma ynajjemch yet7ajjez. Sbeb: ${reasonsText}.\nHouni badayel mratbin: d'abord badil dates, ba3d ken yelzem badil emplacement/type/confort. Kol proposition tfasser chnowa tbaddel:\n${alternativesBody}\n9olli decision mte3ek: t7eb nbadlou dates, wala nemchiw l badil okher?`
      : `${title} ma ynajjemch yet7ajjez. Sbeb: ${reasonsText}. Ken t7eb, badel dates wala 9olli zone/budget ekher.`;
  }
  if (lang === "en") {
    return alternativesBody
      ? `${title} cannot be reserved. Reason: ${reasonsText}.\nI prioritized date alternatives first, then other changes. Each option explains what changed from your request:\n${alternativesBody}\nTell me your decision: should I change only the dates, or move to another option?`
      : `${title} is not suitable for these dates: ${reasonsText}. You can change the dates or share another area/budget.`;
  }
  return alternativesBody
    ? `${title} ne peut pas etre reserve. Raison: ${reasonsText}.\nJ'ai priorise d'abord les alternatives de dates de sejour, puis les autres changements. Chaque proposition explique ce qui change par rapport a votre demande:\n${alternativesBody}\nDites-moi votre decision: faut-il changer seulement les dates, ou passer a une autre option ?`
    : `${title} n'est pas compatible avec ces dates: ${reasonsText}. Vous pouvez changer les dates ou pr�ciser une autre zone/un autre budget.`;
}

function extractIdentity(message) {
  const text = String(message || "").trim();
  const hasIdentityCue = /\b(my name is|name is|full name|nom|prenom|phone|telephone|tel|numero|portable|gsm|tlf|ismi|esmi|esmii|ism|carte\s*d'?identite|cin|identity\s*card|id\s*card|email|adresse|address|photo\s*cin)\b/i.test(text);
  if (!hasIdentityCue) return { fullName: null, phone: null, email: null, address: null, identityNumber: null, identityImageUrl: null };
  const phoneMatch = text.match(/(\+?\d[\d\s.-]{7,}\d)/);
  const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, "") : null;
  const sanitizedPhone = phone && /^\d{4}-\d{2}-\d{2}$/.test(phone) ? null : phone;
  const emailMatch = text.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);
  const email = emailMatch?.[1] ? String(emailMatch[1]).trim().toLowerCase() : null;
  const identityMatch = text.match(/(?:carte\s*d'?identite|cin\b|c\.?i\.?n\b|identity\s*card|id\s*card|numero\s*d'?identite)\s*[:#-]?\s*([a-z0-9]{5,20})/i);
  const identityNumber = identityMatch?.[1] ? String(identityMatch[1]).trim().toUpperCase() : null;
  const imageUrlMatch = text.match(/(?:photo\s*cin|cin\s*photo|image\s*cin|photo\s*carte|identity\s*photo|photo\s*d'?identite)\s*[:\-]?\s*(https?:\/\/\S+)/i);
  const standaloneImageUrlMatch = text.match(/\b(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|bmp))\b/i);
  const identityImageUrl = imageUrlMatch?.[1]
    ? String(imageUrlMatch[1]).trim()
    : standaloneImageUrlMatch?.[1]
    ? String(standaloneImageUrlMatch[1]).trim()
    : null;
  const addressMatch = text.match(/(?:adresse|address|adresse)\s*[:\-]?\s*(.+)$/i);
  const address = addressMatch?.[1] ? String(addressMatch[1]).trim() : null;
  let name = null;
  const namePatterns = [
    /(?:my\s+(?:full\s+)?name\s+is|name\s+is)\s*[:\-]?\s*(.+?)(?:\s+(?:phone|telephone|tel|numero|cin|email|adresse|address)\b|$)/i,
    /(?:nom|prenom)\s*[:\-]?\s*(.+?)(?:\s+(?:phone|telephone|tel|numero|cin|email|adresse|address)\b|$)/i,
    /(?:ismi|esmi|esmii|ism)\s*[:\-]?\s*(.+?)(?:\s+(?:phone|telephone|tel|numero|cin|email|adresse|address)\b|$)/i,
    /^([a-z�-�' -]{5,80}?)(?:\s*,\s*|\s+)(?:phone|telephone|tel|numero|cin|email|adresse|address)\b/i,
  ];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      name = String(match[1]).trim();
      break;
    }
  }
  return {
    fullName: name && name.length >= 5 ? name : null,
    phone: sanitizedPhone,
    email,
    address,
    identityNumber,
    identityImageUrl,
  };
}

async function getLatestReservation(clientId) {
  return prisma.reservation.findFirst({
    where: { clientId },
    orderBy: { id: "desc" },
    include: { property: true },
  });
}

function toWebsiteUrl(urlOrPath) {
  const raw = String(urlOrPath || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${WEBSITE_BASE_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function formatProjectReservationStatus(lang, demand) {
  const status = String(demand?.status || "").trim() || "pending";
  const id = String(demand?.id || "");
  const ref = String(demand?.reference || demand?.reservation_ref || "").trim();
  const contractLink = toWebsiteUrl(String(demand?.contract_url || "").trim()) || `${WEBSITE_BASE_URL}/mes-reservations`;
  const paymentLink = `${WEBSITE_BASE_URL}/mes-reservations/${encodeURIComponent(id || ref)}/paiement`;
  if (lang === "en") return `Request ${id || ref}: status ${status}. Contract: ${contractLink} Payment: ${paymentLink}`;
  if (lang === "ar" || lang === "tn") return `Demande ${id || ref}: statut ${status}. Contrat: ${contractLink} Paiement: ${paymentLink}`;
  return `Demande ${id || ref}: statut ${status}. Contrat: ${contractLink} Paiement: ${paymentLink}`;
}

function buildProjectDemandCreatedReply(lang, demand) {
  const status = String(demand?.status || "").trim();
  const contractLink = toWebsiteUrl(String(demand?.contract_url || "").trim());
  const clientName = String(demand?.client_name || "").trim();
  if (status === "en_attente_reponse_proprietaire") {
    if (lang === "tn") return `${clientName ? `Sallem ${clientName}, ` : ""}talbetek tsajlet. Taw nstannaou reponse mel proprietaire 9bal ay paiement. Ki fama update n9olk houni fel conversation.`;
    if (lang === "en") return "Your reservation request is created. It is now waiting for the owner response before any payment step. I will update you here in this conversation.";
    return "Votre demande de reservation est creee. Elle attend maintenant la reponse du proprietaire avant toute etape de paiement. Je vous informerai ici dans cette conversation.";
  }
  if (status === "reponse_positive_attente_confirmation_client") {
    if (lang === "tn") return "El proprietaire 9bel ettaleb. Tawa n7atherlek el contrat, w ki yجهز nab3athoulek houni m3a tari9et el paiement.";
    if (lang === "en") return "The owner accepted the request. I am preparing your contract now and I will send it here with the payment options.";
    return "Le proprietaire a accepte la demande. Je prepare maintenant votre contrat et je vous l'enverrai ici avec les options de paiement.";
  }
  if (["client_procede_vers_paiement_en_cours", "contrat_realise"].includes(status)) {
    if (!contractLink) {
      if (lang === "tn") return "El proprietaire 9bel ettaleb mte3ek. Tawa n7atherlek el contrat, w ki yجهز nab3athoulek houni m3a tari9et el paiement.";
      if (lang === "en") return "The owner accepted your request. I am preparing your contract now and I will send it here with the payment options.";
      return "Le proprietaire a accepte votre demande. Je prepare maintenant votre contrat et je vous l'enverrai ici avec les options de paiement.";
    }
    if (lang === "tn") return `El proprietaire 9bel ettaleb mte3ek. Hedha contratk PDF: ${contractLink}. Bech nkamlou finalisation, 9olli t7eb t5alles b clicktopay wala b virement. Ken clicktopay, nab3athlek lien paiement. Ken virement, ab3athli recu paiement houni.`;
    if (lang === "en") return `The owner accepted your request. Here is your PDF contract: ${contractLink}. To finalize the reservation, choose your payment method: ClickToPay or bank transfer. If you choose ClickToPay, I will send the payment link. If you choose bank transfer, send me the receipt here.`;
    return `Le proprietaire a accepte votre demande. Voici votre contrat PDF : ${contractLink}. Pour finaliser la reservation, choisissez votre mode de paiement : ClickToPay ou virement. Si vous choisissez ClickToPay, je vous enverrai le lien. Si vous choisissez le virement, envoyez-moi le recu ici.`;
  }
  if (status === "succes_paiement") {
    if (lang === "tn") return `Paiement tsajjel b succes.${contractLink ? ` Hedha contratk: ${contractLink}` : ""}`;
    if (lang === "en") return `Payment recorded successfully.${contractLink ? ` Here is your contract: ${contractLink}` : ""}`;
    return `Le paiement a ete enregistre avec succes.${contractLink ? ` Voici votre contrat : ${contractLink}` : ""}`;
  }
  return formatProjectReservationStatus(lang, demand);
}
function extractFirstHttpUrl(text) {
  const match = String(text || "").match(/https?:\/\/\S+/i);
  return match?.[0] ? String(match[0]).trim() : null;
}

async function handleProjectReservationFollowup({ lang, constraints, quick, payload, client }) {
  const demandId = String(constraints?.reservationDemandId || "").trim();
  if (!demandId) return null;
  const demand = await fetchReservationDemandById(demandId);
  if (!demand) return null;

  const paymentPageLink = `${WEBSITE_BASE_URL}/mes-reservations/${encodeURIComponent(demandId)}/paiement`;
  const receiptUrl =
    (!quick.mentionsIdentityDocument && quick.hasReceiptLink ? extractFirstHttpUrl(payload.message) : null)
    || (!quick.mentionsIdentityDocument && quick.asksReceipt ? await getFirstAttachmentImageUrl(payload) : null);

  if (quick.asksReceipt && receiptUrl) {
    const updatedDemand = await uploadReservationPaymentReceiptLinkFromChat(demandId, {
      receiptUrl,
      note: payload.message,
      paymentReference: null,
    });
    constraints.payment.receiptProvided = true;
    return {
      reply:
        lang === "tn"
          ? `Recu wasel pour demande ${demandId}. Ladmin bech ythabet el paiement. ${paymentPageLink}`
          : lang === "en"
          ? `Receipt received for request ${demandId}. Admin will verify the payment. ${paymentPageLink}`
          : `Recu recu pour la demande ${demandId}. L'administration va verifier le paiement.`,
      reservationDemand: updatedDemand,
      state: STATES.PENDING_CONFIRMATION,
    };
  }

  if ((quick.paymentMethod || quick.asksReceipt || quick.hasReceiptLink) && String(demand.status || "").trim() === "en_attente_reponse_proprietaire") {
    return {
      reply:
        lang === "tn"
          ? `Demande mte3ek mazelt testanna reponse mel proprietaire. Ma fama hata etape paiement taw. Ki yetsajjel accord w yetwajjed el contrat, n9olk.`
          : lang === "en"
          ? `Your request is still waiting for the owner response. There is no payment step yet. Once the owner accepts and the contract is prepared, payment will open.`
          : `Votre demande attend encore la reponse du proprietaire. Aucune etape de paiement n'est ouverte pour le moment. Le paiement s'ouvrira apres acceptation et preparation du contrat.`,
      reservationDemand: demand,
      state: STATES.PENDING_CONFIRMATION,
    };
  }

  if ((quick.paymentMethod || quick.asksReceipt || quick.hasReceiptLink) && String(demand.status || "").trim() === "reponse_positive_attente_confirmation_client") {
    return {
      reply:
        lang === "tn"
          ? `El proprietaire 9bel ettaleb. Tawa n7atherlek el contrat, w ki yetsajjel nab3athoulek houni m3a tari9et el paiement.`
          : lang === "en"
          ? `The owner accepted the request. The contract step must be completed before payment becomes available.`
          : `Le proprietaire a accepte la demande. L'etape du contrat doit etre finalisee avant l'ouverture du paiement.`,
      reservationDemand: demand,
      state: STATES.PENDING_CONFIRMATION,
    };
  }

  if (quick.paymentMethod && ["client_procede_vers_paiement_en_cours", "contrat_realise"].includes(String(demand.status || "").trim())) {
    if (quick.paymentMethod === "card") {
      try {
        const checkout = await createReservationCheckoutFromChat(demandId, "clicktopay", "reservation");
        const checkoutUrl = String(checkout?.checkout_url || checkout?.redirect_url || "").trim();
        if (checkoutUrl) {
          return {
            reply:
              lang === "tn"
                ? `Hedha lien paiement carte mte3ek: ${checkoutUrl}`
                : lang === "en"
                ? `Here is your card payment link: ${checkoutUrl}`
                : `Voici votre lien de paiement par carte: ${checkoutUrl}`,
            reservationDemand: await fetchReservationDemandById(demandId),
            state: STATES.PENDING_CONFIRMATION,
          };
        }
      } catch {
        // Fall back to the standard payment page below.
      }
    }

    if (quick.paymentMethod === "bank_transfer") {
      return {
        reply:
          lang === "tn"
            ? `Mriguel. Ken bech t5alles b virement, ab3ath recu paiement fel conversation, soit image wala lien direct, w taw ntsajlouh w nstannaw ta2kid succes mta3 paiement.`
            : lang === "en"
            ? `Okay. If you want to pay by bank transfer, send the payment receipt in this conversation as an image or direct link. We will store it and wait for payment success confirmation. Tracking page: ${paymentPageLink}`
            : `D'accord. Si vous choisissez le virement, envoyez le recu de paiement dans cette conversation sous forme d'image ou de lien direct. Nous l'enregistrerons puis nous attendrons la confirmation du succes du paiement. Page de suivi: ${paymentPageLink}`,
        reservationDemand: demand,
        state: STATES.PENDING_CONFIRMATION,
      };
    }

    return {
      reply:
        lang === "tn"
          ? `Tnajem tkammel el paiement men hedh el page: ${paymentPageLink}${String(demand?.contract_url || "").trim() ? ` | Contrat: ${demand.contract_url}` : ""}`
          : lang === "en"
          ? `You can continue payment from this page: ${paymentPageLink}${String(demand?.contract_url || "").trim() ? ` | Contract: ${demand.contract_url}` : ""}`
          : `Vous pouvez poursuivre le paiement depuis cette page: ${paymentPageLink}${String(demand?.contract_url || "").trim() ? ` | Contrat: ${demand.contract_url}` : ""}`,
      reservationDemand: demand,
      state: STATES.PENDING_CONFIRMATION,
    };
  }

  if (quick.wantsStatus) {
    return {
      reply: formatProjectReservationStatus(lang, demand),
      reservationDemand: demand,
      state: STATES.PENDING_CONFIRMATION,
    };
  }

  return null;
}

async function createPendingReservation(clientId, constraints, selectedPropertyId) {
  if (!selectedPropertyId || !constraints.startDate || !constraints.endDate || !constraints.guests) return null;
  const property = await prisma.property.findUnique({ where: { id: selectedPropertyId } });
  if (!property) return null;
  const start = new Date(constraints.startDate);
  const end = new Date(constraints.endDate);
  const nights = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));
  const totalPrice = Number(property.pricePerNight) * nights;
  return prisma.reservation.create({
    data: {
      propertyId: property.id,
      clientId,
      startDate: start,
      endDate: end,
      guests: constraints.guests,
      totalPrice,
      status: "pending",
    },
  });
}

async function createProjectReservationDemand(constraints, selectedProperty) {
  if (!selectedProperty || !constraints.startDate || !constraints.endDate || !constraints.guests) return null;
  const projectUser = await upsertProjectUserFromChat(constraints.profile || {});
  const start = new Date(`${constraints.startDate}T00:00:00`);
  const end = new Date(`${constraints.endDate}T00:00:00`);
  const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));
  const totalAmount = Math.max(0, Number(selectedProperty.pricePerNightTnd || 0)) * nights;
  const payload = {
    bien_id: String(selectedProperty.id),
    client_user_id: String(projectUser.id),
    client_name: constraints.profile.fullName || projectUser.nom || "",
    client_email: constraints.profile.email || projectUser.email || null,
    start_date: constraints.startDate,
    end_date: constraints.endDate,
    guests: constraints.guests,
    adult_guests: Math.max(1, Number(constraints.adultGuests || constraints.guests || 1)),
    child_guests: Math.max(0, Number(constraints.childGuests || 0)),
    payment_mode: "avance",
    total_amount: totalAmount,
    amount_due_now: Math.min(totalAmount, Math.max(0, Number(selectedProperty.pricePerNightTnd || 0))),
    selected_fixed_services: [],
    selected_variable_services: [],
    client_note: `Created by chatbot assistant | phone:${constraints.profile.phone || ""} | cin:${constraints.profile.identityNumber || ""} | cin_image:${constraints.profile.identityImageUrl || ""} | address:${constraints.profile.address || ""}`,
    request_type: "reservation",
  };
  if (process.env.NODE_ENV !== "production") {
    console.log("[chatbot-create-project-reservation:before]", JSON.stringify({ payload, profile: constraints.profile, selectedPropertyId: selectedProperty.id }));
  }
  const created = await createReservationDemandDirectFromChat(payload, constraints.profile || {});
  if (process.env.NODE_ENV !== "production") {
    console.log("[chatbot-create-project-reservation:after]", JSON.stringify(created));
  }
  if (created?.id && constraints.profile.identityNumber && constraints.profile.identityImageUrl && constraints.profile.fullName) {
    try {
      await submitReservationIdentityFromChat(created.id, constraints.profile);
    } catch {
      // Identity submission can fail for non-instant reservations; the user profile still remains synced.
    }
  }
  return created;
}

async function buildReservationCreationFailureReply(lang, constraints, selectedProperty) {
  const errorEvaluation = await evaluateSpecificPropertyRequest(selectedProperty, constraints);
  const alternativesRaw = toPropertyCards(await findAlternatives(constraints));
  const alternativesClassified = classifyPropertyCards(constraints, alternativesRaw);
  const alternatives = alternativesClassified.alternatives.length > 0
    ? alternativesClassified.alternatives
    : alternativesClassified.combined;
  rememberPendingDateAlternative(constraints, selectedProperty, errorEvaluation?.property?.stayDateAlternative);
  const reply = await polishAssistantReply({
    draftReply: buildSpecificPropertyBlockedReply(lang, selectedProperty, errorEvaluation, alternatives, constraints),
    language: lang,
    userMessage: "",
    constraints,
    propertyOptions: alternatives,
  });
  return { reply, alternatives };
}

async function findProjectReservationStatus(constraints, client) {
  const phoneRaw = String(constraints?.profile?.phone || client?.phone || "").trim();
  const phoneDigits = phoneRaw.replace(/\D+/g, "");
  const fullName = String(constraints?.profile?.fullName || client?.fullName || "").trim();
  const params = [];
  const where = [];
  if (phoneDigits.length >= 6) {
    where.push("(REPLACE(REPLACE(REPLACE(COALESCE(amicale_phone,''),'+',''),' ',''),'-','') LIKE ? OR REPLACE(REPLACE(REPLACE(COALESCE(client_note,''),'+',''),' ',''),'-','') LIKE ?)");
    params.push(`%${phoneDigits}%`, `%${phoneDigits}%`);
  }
  if (fullName.length >= 3) {
    where.push("LOWER(COALESCE(client_name,'')) = LOWER(?)");
    params.push(fullName);
  }
  if (!where.length) return null;
  const sql = `SELECT id, status, updated_at FROM ${PROJECT_DB}.reservation_demands WHERE ${where.join(" OR ")} ORDER BY updated_at DESC LIMIT 1`;
  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function withConversationLock(key, fn) {
  const lockKey = `lock:conversation:${key}`;
  const acquired = await redis.set(lockKey, "1", "NX", "EX", 30);
  if (!acquired) return null;
  try {
    return await fn();
  } finally {
    await redis.del(lockKey);
  }
}

export async function processIncomingMessage(payload) {
  return withConversationLock(`${payload.platform}:${payload.platformUserId}`, async () => {
    const client = await prisma.client.upsert({
      where: {
        platform_platformUserId: {
          platform: payload.platform,
          platformUserId: payload.platformUserId,
        },
      },
      update: {},
      create: {
        platform: payload.platform,
        platformUserId: payload.platformUserId,
        language: "auto",
      },
    });

    let conversation = await prisma.conversation.findFirst({
      where: { clientId: client.id },
      orderBy: { updatedAt: "desc" },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { clientId: client.id, state: STATES.NEW_LEAD },
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "client",
        content: payload.message,
      },
    });

    if (conversation.isHumanTakeover) {
      return { conversationId: conversation.id, reply: "" };
    }

    const extracted = payload?.parsedIntent || await parseUserIntent(payload.message);
    const quick = parseQuickIntent(payload.message);
    const prevCtx = await getConversationContext(conversation.id);
    const constraints = normalizeConstraints(prevCtx, extracted, payload.message);
    const hasStoredBrowseUniverse = getBrowseUniverse(constraints).length > 0;
    if (quick.paymentMethod) constraints.payment.method = quick.paymentMethod;
    const explicitSelectedReference = normalizePropertyReference(extracted?.propertyReference || extractSelectionReference(payload.message) || constraints.selectedPropertyRef);
    if (explicitSelectedReference) constraints.selectedPropertyRef = explicitSelectedReference;
    if (parseDate(extracted?.dates?.start) || parseDate(extracted?.dates?.end)) {
      clearPendingDateAlternative(constraints);
    } else if (shouldApplyPendingDateAlternative(payload.message, constraints)) {
      constraints.startDate = constraints.pendingDateAlternative.startDate;
      constraints.endDate = constraints.pendingDateAlternative.endDate;
      if (!constraints.selectedPropertyId && constraints.pendingDateAlternative.propertyId) {
        constraints.selectedPropertyId = constraints.pendingDateAlternative.propertyId;
      }
      if (!constraints.selectedPropertyRef && constraints.pendingDateAlternative.propertyRef) {
        constraints.selectedPropertyRef = constraints.pendingDateAlternative.propertyRef;
      }
      clearPendingDateAlternative(constraints);
    }
    const incomingIdentityImageUrl =
      await getFirstAttachmentImageUrl(payload)
      || getStandaloneImageUrlFromText(payload.message)
      || null;
    if (quick.wantsReserve || quick.mentionsIdentityDocument || /name|nom|phone|telephone|cin|carte d'?identite|identity card|photo\s*cin|email|adresse|address|ismi|esmi|ism/i.test(payload.message)) {
      const idData = extractIdentity(payload.message);
      if (!constraints.profile.fullName && idData.fullName) constraints.profile.fullName = idData.fullName;
      if (!constraints.profile.phone && idData.phone) constraints.profile.phone = idData.phone;
      if (!constraints.profile.email && idData.email) constraints.profile.email = idData.email;
      if (!constraints.profile.address && idData.address) constraints.profile.address = idData.address;
      if (!constraints.profile.identityNumber && idData.identityNumber) constraints.profile.identityNumber = idData.identityNumber;
      if (!constraints.profile.identityImageUrl && idData.identityImageUrl) constraints.profile.identityImageUrl = idData.identityImageUrl;
    }
    if (!constraints.profile.identityImageUrl && incomingIdentityImageUrl) {
      constraints.profile.identityImageUrl = incomingIdentityImageUrl;
    }
    await setConversationContext(conversation.id, constraints);

    const planner = await planConversationTurn({
      userMessage: payload.message,
      previousState: conversation.state,
      extracted,
      constraints,
    });
    const plannerWantsKnowledgeOnly = Boolean(planner?.shouldUseRag) && String(planner?.searchMode || "").trim().toLowerCase() === "none";
    const shouldSearch = quick.wantsMoreOptions && hasStoredBrowseUniverse
      ? false
      : quick.wantsMoreOptions && hasMeaningfulSearchConstraints(constraints)
      ? true
      : plannerWantsKnowledgeOnly
      ? false
      : (planner ? Boolean(planner.shouldSearch) : hasMeaningfulSearchConstraints(constraints));
    const shouldUseRag = planner ? Boolean(planner.shouldUseRag) : false;
    const sqlSearchPlan = shouldSearch && planner?.searchMode !== "reference_first"
      ? await planSqlPropertySearch({
          userMessage: payload.message,
          language: constraints.language || extracted.language || client.language || "fr",
          plannerAnswerMode: planner?.answerMode || extracted?.responseMode || null,
          constraints,
        })
      : null;

    const ragContext = shouldUseRag ? await retrieveContext(payload.message) : "";
    const shouldLockSelectedProperty =
      Boolean(constraints.selectedPropertyRef)
      && !quick.wantsMoreOptions
      && !quick.mentionsAlternative
      && (
        quick.wantsReserve
        || Boolean(prevCtx?.selectedPropertyRef)
        || Boolean(constraints.startDate)
        || Boolean(constraints.endDate)
        || Boolean(constraints.guests)
        || Boolean(constraints.profile?.fullName)
        || Boolean(constraints.profile?.phone)
        || quick.mentionsIdentityDocument
      );
    const hasPaymentReceiptSignal = quick.asksReceipt || (quick.hasReceiptLink && !quick.mentionsIdentityDocument);
    let directProperty = null;
    if ((planner?.searchMode === "reference_first" || shouldLockSelectedProperty) && String(extracted?.propertyReference || constraints.selectedPropertyRef || "").trim()) {
      directProperty = await getPropertyByReference(normalizePropertyReference(extracted?.propertyReference || constraints.selectedPropertyRef));
      if (directProperty) {
        constraints.selectedPropertyId = directProperty.id;
        constraints.selectedPropertyRef = String(directProperty.reference || normalizePropertyReference(extracted?.propertyReference || constraints.selectedPropertyRef)).trim() || null;
        hydrateConstraintsFromSelectedProperty(constraints, toPropertyCards([directProperty])[0]);
      }
    }

    const properties = directProperty
      ? [directProperty]
      : shouldSearch
        ? await searchAvailableProperties({
            location: constraints.location,
            guests: constraints.guests,
            budget: constraints.budget,
            startDate: null,
            endDate: null,
            nearBeach: constraints.preferences.includes("near_beach"),
            seaView: constraints.preferences.includes("sea_view"),
            beachfront: constraints.preferences.includes("beachfront"),
            pool: constraints.preferences.includes("pool") || constraints.preferences.includes("pool_private") || constraints.preferences.includes("pool_shared"),
            poolPrivate: constraints.preferences.includes("pool_private"),
            poolShared: constraints.preferences.includes("pool_shared"),
            parking: constraints.preferences.includes("parking"),
            type: constraints.type,
            subType: constraints.subType,
            bedrooms: constraints.bedrooms,
            floor: constraints.floor,
            aiPlan: sqlSearchPlan,
            limit:
              sqlSearchPlan?.limit
                ? sqlSearchPlan.limit
                : planner?.searchMode === "zone_aggregation"
                ? Math.max(Number(process.env.CHATBOT_SEARCH_LIMIT || 60), 80)
                : Number(process.env.CHATBOT_SEARCH_LIMIT || 60),
          })
        : [];
    const hydratedProperties = constraints.startDate && constraints.endDate
      ? await attachAlternativeStayData(properties, constraints)
      : properties;
    const websiteLikePool = shouldSearch
      ? await loadWebsiteLikeCatalogPool(constraints)
      : [];
    let propertyCards = toPropertyCards([
      ...hydratedProperties,
      ...websiteLikePool.filter((candidate) => !hydratedProperties.some((item) => String(item?.id) === String(candidate?.id))),
    ]);
    hydrateConstraintLocationFromMatches(constraints, propertyCards);
    if (!constraints.selectedPropertyId && constraints.selectedPropertyRef) {
      const matchedSelectedCard = findOptionByReference(propertyCards, constraints.selectedPropertyRef);
      if (matchedSelectedCard) {
        constraints.selectedPropertyId = matchedSelectedCard.id;
        constraints.selectedPropertyRef = matchedSelectedCard.reference || constraints.selectedPropertyRef;
        hydrateConstraintsFromSelectedProperty(constraints, matchedSelectedCard);
      }
    }
    const requestedReference = normalizePropertyReference(extracted?.propertyReference || constraints.selectedPropertyRef);
    if (!websiteLikePool.length && !quick.wantsMoreOptions && shouldSearch && hasMeaningfulSearchConstraints(constraints)) {
      const alternatives = toPropertyCards(await findAlternatives(constraints));
      const seen = new Set(propertyCards.map((p) => String(p.id)));
      for (const alt of alternatives) {
        if (seen.has(String(alt.id))) continue;
        propertyCards.push(alt);
      }
    }
    if (!constraints.selectedPropertyId && constraints.selectedPropertyRef) {
      const matchedSelectedCard = findOptionByReference(propertyCards, constraints.selectedPropertyRef);
      if (matchedSelectedCard) {
        constraints.selectedPropertyId = matchedSelectedCard.id;
        constraints.selectedPropertyRef = matchedSelectedCard.reference || constraints.selectedPropertyRef;
        hydrateConstraintsFromSelectedProperty(constraints, matchedSelectedCard);
      }
    }
    let classified = classifyPropertyCards(constraints, propertyCards);
    propertyCards = classified.combined;
    const browseUniverse = classified.exact.length > 0 ? classified.exact : classified.combined;
    if (!(quick.wantsMoreOptions && hasStoredBrowseUniverse) && browseUniverse.length > 0) {
      rememberBrowseUniverse(constraints, browseUniverse);
    }
    if (planner?.searchMode === "reference_first" && requestedReference) {
      const matchedByRef = findOptionByReference(propertyCards, requestedReference);
      if (matchedByRef) {
        constraints.selectedPropertyId = matchedByRef.id;
        constraints.selectedPropertyRef = matchedByRef.reference || requestedReference;
        hydrateConstraintsFromSelectedProperty(constraints, matchedByRef);
        propertyCards = [matchedByRef, ...propertyCards.filter((item) => String(item.id) !== String(matchedByRef.id))];
        classified = classifyPropertyCards(constraints, propertyCards);
      } else {
        const forcedProperty = await getPropertyByReference(requestedReference);
        if (forcedProperty) {
          propertyCards = toPropertyCards([forcedProperty]);
          classified = classifyPropertyCards(constraints, propertyCards);
          constraints.selectedPropertyId = propertyCards[0]?.id || null;
          constraints.selectedPropertyRef = propertyCards[0]?.reference || requestedReference;
          hydrateConstraintsFromSelectedProperty(constraints, propertyCards[0]);
        }
      }
    }
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[chatbot-debug]",
        JSON.stringify({
          user: payload.platformUserId,
          constraints,
          exactCount: classified.exact.length,
          alternativeCount: classified.alternatives.length,
          properties: propertyCards.map((p) => ({ id: p.id, title: p.title })),
        })
      );
    }

    const lang = constraints.language || extracted.language || client.language || "fr";
    const responseMode = String(planner?.answerMode || extracted?.responseMode || "").trim().toLowerCase() || "property_list";
    const L = languagePack(lang);
    let reply = "";
    let options = propertyCards;
    let newState = conversation.state;
    let activeSelectedProperty = options.find((p) => String(p.id) === String(constraints.selectedPropertyId)) || findOptionByReference(options, constraints.selectedPropertyRef) || null;
    if (!activeSelectedProperty && constraints.selectedPropertyRef) {
      const selectedPropertyDirect = await getPropertyByReference(constraints.selectedPropertyRef);
      activeSelectedProperty = selectedPropertyDirect ? toPropertyCards([selectedPropertyDirect])[0] : null;
    }
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[chatbot-selected-flow]",
        JSON.stringify({
          user: payload.platformUserId,
          message: payload.message,
          activeSelectedPropertyId: activeSelectedProperty?.id || null,
          startDate: constraints.startDate,
          endDate: constraints.endDate,
          guests: constraints.guests,
          profile: constraints.profile,
          quick,
        })
      );
    }

    const reservationReadyForCreation = Boolean(
      activeSelectedProperty
      && constraints.startDate
      && constraints.endDate
      && constraints.guests
      && hasCompleteReservationProfile(constraints)
      && !quick.wantsMoreOptions
      && !quick.mentionsAlternative
      && !quick.wantsStatus
    );
    const reservationFollowup = DATA_SOURCE === "project"
      ? await handleProjectReservationFollowup({ lang, constraints, quick, payload, client })
      : null;

    if (reservationFollowup) {
      reply = reservationFollowup.reply;
      newState = reservationFollowup.state || STATES.PENDING_CONFIRMATION;
    } else if (isGreetingOnly(payload.message, extracted, constraints, quick)) {
      clearShownOptions(constraints);
      reply = buildGreetingReply(lang);
      options = [];
      newState = STATES.ASKING_PREFERENCES;
    } else if (reservationReadyForCreation) {
      await prisma.client.update({
        where: { id: client.id },
        data: { fullName: constraints.profile.fullName, phone: constraints.profile.phone, language: lang },
      });
      let selectedProperty = options.find((p) => String(p.id) === String(constraints.selectedPropertyId)) || findOptionByReference(options, constraints.selectedPropertyRef) || null;
      if (!selectedProperty && constraints.selectedPropertyRef) {
        const directSelectedProperty = await getPropertyByReference(constraints.selectedPropertyRef);
        selectedProperty = directSelectedProperty ? toPropertyCards([directSelectedProperty])[0] : null;
      }
        const selectedEvaluation = await evaluateSpecificPropertyRequest(selectedProperty, constraints);
        if (!selectedEvaluation.ok) {
        const alternativesRaw = toPropertyCards(await findAlternatives(constraints));
        const alternativesClassified = classifyPropertyCards(constraints, alternativesRaw);
        const alternatives = alternativesClassified.alternatives.length > 0
          ? alternativesClassified.alternatives
          : alternativesClassified.combined;
        rememberPendingDateAlternative(constraints, selectedProperty, selectedEvaluation?.property?.stayDateAlternative);
        reply = buildSpecificPropertyBlockedReply(lang, selectedProperty, selectedEvaluation, alternatives, constraints);
        reply = await polishAssistantReply({
          draftReply: reply,
          language: lang,
          userMessage: payload.message,
          constraints,
          propertyOptions: alternatives,
        });
        options = alternatives;
        newState = STATES.SHOWING_OPTIONS;
      } else {
        let reservation = null;
        try {
          reservation =
            DATA_SOURCE === "project"
              ? await createProjectReservationDemand(constraints, selectedProperty)
              : await createPendingReservation(client.id, constraints, constraints.selectedPropertyId);
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.log("[chatbot-reservation-create-error]", error?.stack || error?.message || error);
          }
          const errorText = String(error?.message || error || "").toLowerCase();
          if (
            DATA_SOURCE === "project"
            && selectedProperty
            && (
              errorText.includes("deja indisponible")
              || errorText.includes("deja en attente")
              || errorText.includes("already")
              || errorText.includes("pending")
            )
          ) {
            const failedCreation = await buildReservationCreationFailureReply(lang, constraints, selectedProperty);
            reply = failedCreation.reply;
            options = failedCreation.alternatives;
            newState = STATES.SHOWING_OPTIONS;
          } else {
            reply =
              lang === "tn"
                ? "El reservation ma najmetch tet3adda tawa 5ater fama mochkla technique fil service. 3awed ba3d chweya wala khalini nkammel m3ak b options okhrin."
                : lang === "en"
                ? "The reservation could not be created right now because the booking service is unavailable. Try again shortly."
                : "La reservation ne peut pas etre creee pour le moment car le service de reservation est indisponible. Reessayez un peu plus tard.";
            newState = STATES.COLLECTING_IDENTITY;
          }
        }
        if (reservation) {
          if (DATA_SOURCE === "project") {
            constraints.reservationDemandId = String(reservation.id || "");
          }
          if (hasPaymentReceiptSignal) {
            constraints.payment.receiptProvided = true;
            reply = buildProjectDemandCreatedReply(lang, reservation);
          } else {
            reply = DATA_SOURCE === "project"
              ? buildProjectDemandCreatedReply(lang, reservation)
              : `${L.pending} ${L.askPayment}`;
          }
          newState = STATES.PENDING_CONFIRMATION;
        } else if (!reply) {
          reply = L.askMissing;
          newState = STATES.ASKING_DATES;
        }
      }
    } else if (
      activeSelectedProperty
      && constraints.startDate
      && constraints.endDate
      && constraints.guests
      && (!constraints.profile.fullName || !constraints.profile.phone || !constraints.profile.identityNumber || !constraints.profile.identityImageUrl)
      && !quick.wantsMoreOptions
      && !quick.mentionsAlternative
    ) {
      const selectedEvaluation = await evaluateSpecificPropertyRequest(activeSelectedProperty, constraints);
      if (!selectedEvaluation.ok) {
        const alternativesRaw = toPropertyCards(await findAlternatives(constraints));
        const alternativesClassified = classifyPropertyCards(constraints, alternativesRaw);
        const alternatives = alternativesClassified.alternatives.length > 0
          ? alternativesClassified.alternatives
          : alternativesClassified.combined;
        clearShownOptions(constraints);
        rememberPendingDateAlternative(constraints, activeSelectedProperty, selectedEvaluation?.property?.stayDateAlternative);
        reply = buildSpecificPropertyBlockedReply(lang, activeSelectedProperty, selectedEvaluation, alternatives, constraints);
        options = alternatives;
        newState = STATES.SHOWING_OPTIONS;
      } else {
        clearShownOptions(constraints);
        reply = buildProfileCompletionReply(lang, constraints, activeSelectedProperty);
        options = [activeSelectedProperty];
        newState = STATES.COLLECTING_IDENTITY;
      }
    } else if (quick.wantsMoreOptions && (getBrowseUniverse(constraints).length > 0 || propertyCards.length > 0)) {
      const browseOptions = getBrowseUniverse(constraints);
      const sourceOptions = browseOptions.length > 0 ? browseOptions : propertyCards;
      const { batch, hasMore } = nextOptionBatch(sourceOptions, constraints, 3);
      reply = buildMoreOptionsReply(lang, batch, hasMore);
      options = batch;
      rememberShownOptions(constraints, batch);
      newState = STATES.SHOWING_OPTIONS;
    } else if (planner?.shouldUseRag && !shouldSearch) {
      clearShownOptions(constraints);
      options = [];
      reply = await generateKnowledgeReply({
        userMessage: payload.message,
        language: lang,
        ragContext,
        constraints,
        conversationState: conversation.state,
      });
      if (!String(reply || "").trim()) {
        reply = buildKnowledgeFallbackReply(lang, payload.message);
      }
      newState = conversation.state || STATES.ASKING_PREFERENCES;
    } else if (planner?.shouldAskClarification && !shouldSearch) {
      clearShownOptions(constraints);
      reply = planner.clarificationQuestion || L.askMissing;
      options = [];
      newState = STATES.ASKING_PREFERENCES;
    } else if (quick.wantsStatus) {
      if (DATA_SOURCE === "project") {
        const phone = constraints.profile.phone || client.phone || "";
        if (!phone) {
          reply = L.askIdentity;
        } else {
          const rows = await listReservationDemandsByPhone(phone);
          if (rows.length) {
            reply = formatProjectReservationStatus(lang, rows[0]);
          } else {
            const direct = await findProjectReservationStatus(constraints, client);
            reply = direct ? formatProjectReservationStatus(lang, direct) : L.statusNone;
          }
        }
      } else {
        const latest = await getLatestReservation(client.id);
        if (!latest) {
          reply = L.statusNone;
        } else {
          reply = `Reservation #${latest.id} - ${latest.property.title} - status: ${latest.status} - total: ${Number(latest.totalPrice)} TND.`;
        }
      }
      newState = STATES.PENDING_CONFIRMATION;
    } else if (responseMode === "zone_price_summary") {
      clearShownOptions(constraints);
      reply = buildZonePriceSummaryReply(lang, constraints, propertyCards);
      newState = STATES.SHOWING_OPTIONS;
    } else if (responseMode === "zone_summary") {
      clearShownOptions(constraints);
      reply = buildZoneSummaryReply(lang, constraints, propertyCards);
      newState = STATES.SHOWING_OPTIONS;
    } else if (responseMode === "price_summary") {
      clearShownOptions(constraints);
      reply = buildPriceSummaryReply(lang, constraints, propertyCards);
      newState = STATES.SHOWING_OPTIONS;
    } else if (!planner?.shouldUseRag && (!constraints.startDate || !constraints.endDate || !constraints.guests || (!constraints.location && !constraints.selectedPropertyId && !constraints.selectedPropertyRef))) {
      let selectedProperty = options.find((p) => String(p.id) === String(constraints.selectedPropertyId)) || findOptionByReference(options, constraints.selectedPropertyRef);
      if (!selectedProperty && constraints.selectedPropertyRef) {
        const directSelectedProperty = await getPropertyByReference(constraints.selectedPropertyRef);
        selectedProperty = directSelectedProperty ? toPropertyCards([directSelectedProperty])[0] : null;
      }
      if (selectedProperty && (!constraints.startDate || !constraints.endDate || !constraints.guests)) {
        clearShownOptions(constraints);
        reply = buildSelectedPropertyFollowupReply(lang, selectedProperty, constraints);
        options = [selectedProperty];
        newState = STATES.ASKING_DATES;
      } else if (selectedProperty && constraints.startDate && constraints.endDate && constraints.guests) {
        const selectedEvaluation = await evaluateSpecificPropertyRequest(selectedProperty, constraints);
        if (!selectedEvaluation.ok) {
          const alternativesRaw = toPropertyCards(await findAlternatives(constraints));
          const alternativesClassified = classifyPropertyCards(constraints, alternativesRaw);
          const alternatives = alternativesClassified.alternatives.length > 0
            ? alternativesClassified.alternatives
            : alternativesClassified.combined;
          clearShownOptions(constraints);
          rememberPendingDateAlternative(constraints, selectedProperty, selectedEvaluation?.property?.stayDateAlternative);
          reply = buildSpecificPropertyBlockedReply(lang, selectedProperty, selectedEvaluation, alternatives, constraints);
          options = alternatives;
          newState = STATES.SHOWING_OPTIONS;
        } else if (!constraints.profile.fullName || !constraints.profile.phone || !constraints.profile.identityNumber || !constraints.profile.identityImageUrl) {
          clearShownOptions(constraints);
          reply = buildProfileCompletionReply(lang, constraints, selectedProperty);
          options = [selectedProperty];
          newState = STATES.COLLECTING_IDENTITY;
        } else {
          clearShownOptions(constraints);
          reply = buildSelectedPropertyFollowupReply(lang, selectedProperty, constraints);
          options = [selectedProperty];
          newState = STATES.ASKING_DATES;
        }
      } else if (selectedProperty && (!constraints.profile.fullName || !constraints.profile.phone || !constraints.profile.identityNumber || !constraints.profile.identityImageUrl)) {
        clearShownOptions(constraints);
        reply = buildProfileCompletionReply(lang, constraints, selectedProperty);
        options = [selectedProperty];
        newState = STATES.COLLECTING_IDENTITY;
      } else if (hasSearchSignal(constraints, payload.message) && propertyCards.length > 0) {
        reply = buildProgressiveSearchReply(lang, constraints, propertyCards);
        options = propertyCards.slice(0, 3);
        clearShownOptions(constraints);
        rememberShownOptions(constraints, options);
        newState = STATES.SHOWING_OPTIONS;
      } else {
        clearShownOptions(constraints);
        reply = L.askMissing;
        newState = STATES.ASKING_PREFERENCES;
      }
    } else if (propertyCards.length === 0) {
      clearShownOptions(constraints);
      const alternatives = toPropertyCards(await findAlternatives(constraints));
      options = alternatives;
      if (alternatives.length > 0) {
        const classifiedAlternatives = classifyPropertyCards(constraints, alternatives);
        reply = buildAlternativeSearchReply(lang, constraints, classifiedAlternatives) || `${L.none} ${L.choose}`;
      } else {
        reply = L.none;
      }
      newState = STATES.SHOWING_OPTIONS;
    } else {
      const selectedId = extractSelectionId(payload.message);
      const selectedReference = normalizePropertyReference(extracted?.propertyReference || extractSelectionReference(payload.message));
      if (selectedId && propertyCards.some((p) => p.id === selectedId)) {
        constraints.selectedPropertyId = selectedId;
      } else if (selectedReference) {
        const matchedByRef = findOptionByReference(propertyCards, selectedReference);
        if (matchedByRef) {
          constraints.selectedPropertyId = matchedByRef.id;
          constraints.selectedPropertyRef = matchedByRef.reference || selectedReference;
        } else {
          const directProperty = await getPropertyByReference(selectedReference);
          const directCard = directProperty ? toPropertyCards([directProperty])[0] : null;
          if (directCard) {
            const evaluation = await evaluateSpecificPropertyRequest(directCard, constraints);
            if (evaluation.ok) {
              constraints.selectedPropertyId = directCard.id;
              constraints.selectedPropertyRef = directCard.reference || selectedReference;
              if (!propertyCards.some((p) => String(p.id) === String(directCard.id))) {
                propertyCards.unshift(directCard);
                options = propertyCards;
              }
            } else {
              const alternativesRaw = toPropertyCards(await findAlternatives(constraints));
              const alternativesClassified = classifyPropertyCards(constraints, alternativesRaw);
              const alternatives = alternativesClassified.alternatives.length > 0
                ? alternativesClassified.alternatives
                : alternativesClassified.combined;
              rememberPendingDateAlternative(constraints, directCard, evaluation?.property?.stayDateAlternative);
              reply = buildSpecificPropertyBlockedReply(lang, directCard, evaluation, alternatives, constraints);
              options = alternatives;
              newState = STATES.SHOWING_OPTIONS;
            }
          }
        }
      } else if (
        !constraints.selectedPropertyId
        && propertyCards.length === 1
        && classified.exact.length === 1
        && classified.alternatives.length === 0
      ) {
        constraints.selectedPropertyId = propertyCards[0].id;
      }

      if (reply) {
        // Keep the blocked-property reply decided above.
      } else if (!constraints.selectedPropertyId && hasSearchSignal(constraints, payload.message)) {
        reply = buildProgressiveSearchReply(lang, constraints, propertyCards);
        options = (classified.exact.length > 0 ? classified.exact : classified.alternatives).slice(0, 3);
        clearShownOptions(constraints);
        rememberShownOptions(constraints, options);
        newState = STATES.SHOWING_OPTIONS;
      } else if (!constraints.selectedPropertyId) {
        reply = L.choose;
        newState = STATES.WAITING_SELECTION;
      } else if (!constraints.profile.fullName || !constraints.profile.phone || !constraints.profile.identityNumber || !constraints.profile.identityImageUrl) {
        reply = (!constraints.profile.fullName || !constraints.profile.phone) && !constraints.profile.identityNumber && !constraints.profile.identityImageUrl
          ? `${L.askIdentity} ${L.askIdentityDocument}`
          : buildProfileCompletionReply(lang, constraints, activeSelectedProperty);
        newState = STATES.COLLECTING_IDENTITY;
      } else {
        await prisma.client.update({
          where: { id: client.id },
          data: { fullName: constraints.profile.fullName, phone: constraints.profile.phone, language: lang },
        });
        let selectedProperty = options.find((p) => String(p.id) === String(constraints.selectedPropertyId)) || findOptionByReference(options, constraints.selectedPropertyRef) || null;
        if (!selectedProperty && constraints.selectedPropertyRef) {
          const directSelectedProperty = await getPropertyByReference(constraints.selectedPropertyRef);
          selectedProperty = directSelectedProperty ? toPropertyCards([directSelectedProperty])[0] : null;
        }
        const selectedEvaluation = await evaluateSpecificPropertyRequest(selectedProperty, constraints);
        if (!selectedEvaluation.ok) {
          const alternativesRaw = toPropertyCards(await findAlternatives(constraints));
          const alternativesClassified = classifyPropertyCards(constraints, alternativesRaw);
          const alternatives = alternativesClassified.alternatives.length > 0
            ? alternativesClassified.alternatives
            : alternativesClassified.combined;
          rememberPendingDateAlternative(constraints, selectedProperty, selectedEvaluation?.property?.stayDateAlternative);
          reply = buildSpecificPropertyBlockedReply(lang, selectedProperty, selectedEvaluation, alternatives, constraints);
          reply = await polishAssistantReply({
            draftReply: reply,
            language: lang,
            userMessage: payload.message,
            constraints,
            propertyOptions: alternatives,
          });
          options = alternatives;
          newState = STATES.SHOWING_OPTIONS;
          await setConversationContext(conversation.id, constraints);
          await prisma.conversation.update({ where: { id: conversation.id }, data: { state: newState } });
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              senderType: "bot",
              content: reply,
            },
          });
          if (payload.platform !== "website") {
            await sendMetaMessage(payload.platformUserId, reply);
          }
          return {
            conversationId: conversation.id,
            reply,
            options,
            diagnostics: {
              planner,
              sqlSearchPlan,
              shouldSearch,
              shouldUseRag,
              optionsCount: Array.isArray(options) ? options.length : 0,
              responseMode,
              exactCount: classified.exact.length,
              alternativeCount: classified.alternatives.length,
              exactZoneSummary: summarizeZones(classified.exact),
              alternativeZoneSummary: summarizeZones(classified.alternatives),
              zoneSummary: summarizeZones(options),
              pricingSummary: summarizePricing(options),
              exactStayPricing: summarizeExactStayPricing(options, constraints),
              stayRules: getStayRuleDiagnostics(options, constraints),
            },
          };
        }
        let reservation = null;
        try {
          reservation =
            DATA_SOURCE === "project"
              ? await createProjectReservationDemand(constraints, selectedProperty)
              : await createPendingReservation(client.id, constraints, constraints.selectedPropertyId);
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.log("[chatbot-reservation-create-error]", error?.message || error);
          }
          const errorText = String(error?.message || error || "").toLowerCase();
          if (
            DATA_SOURCE === "project"
            && selectedProperty
            && (
              errorText.includes("deja indisponible")
              || errorText.includes("deja en attente")
              || errorText.includes("already")
              || errorText.includes("pending")
            )
          ) {
            const failedCreation = await buildReservationCreationFailureReply(lang, constraints, selectedProperty);
            reply = failedCreation.reply;
            options = failedCreation.alternatives;
            newState = STATES.SHOWING_OPTIONS;
          } else {
            reply =
              lang === "tn"
                ? "El reservation ma najmetch tet3adda tawa 5ater fama mochkla technique fil service. 3awed ba3d chweya wala khalini nkammel m3ak b options okhrin."
                : lang === "en"
                ? "The reservation could not be created right now because the booking service is unavailable. Try again shortly."
                : "La reservation ne peut pas etre creee pour le moment car le service de reservation est indisponible. Reessayez un peu plus tard.";
            newState = STATES.COLLECTING_IDENTITY;
          }
        }
        if (reservation) {
          if (DATA_SOURCE === "project") {
            constraints.reservationDemandId = String(reservation.id || "");
          }
          if (hasPaymentReceiptSignal) {
            constraints.payment.receiptProvided = true;
            reply = buildProjectDemandCreatedReply(lang, reservation);
          } else {
            reply = DATA_SOURCE === "project"
              ? buildProjectDemandCreatedReply(lang, reservation)
              : `${L.pending} ${L.askPayment}`;
          }
          newState = STATES.PENDING_CONFIRMATION;
        } else if (!reply) {
          reply = L.askMissing;
          newState = STATES.ASKING_DATES;
        }
      }
    }

    if (!reply) {
      reply = await generateAssistantReply({
        userMessage: payload.message,
        language: lang,
        state: newState,
        extracted,
        constraints,
        propertyOptions: options,
        ragContext,
      });
      if (!String(reply || "").trim()) {
        reply = buildKnowledgeFallbackReply(lang, payload.message);
      }
    }
    reply = await polishAssistantReply({
      draftReply: reply,
      language: lang,
      userMessage: payload.message,
      constraints,
      propertyOptions: options,
    });
    await setConversationContext(conversation.id, constraints);
    await prisma.conversation.update({ where: { id: conversation.id }, data: { state: newState } });

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "bot",
        content: reply,
      },
    });

    if (payload.platform !== "website") {
      await sendMetaMessage(payload.platformUserId, reply);
    }

    return {
      conversationId: conversation.id,
      reply,
      options,
      diagnostics: {
        planner,
        sqlSearchPlan,
        shouldSearch,
        shouldUseRag,
        optionsCount: Array.isArray(options) ? options.length : 0,
        responseMode,
        exactCount: classified.exact.length,
        alternativeCount: classified.alternatives.length,
        exactZoneSummary: summarizeZones(classified.exact),
        alternativeZoneSummary: summarizeZones(classified.alternatives),
        zoneSummary: summarizeZones(propertyCards),
        pricingSummary: summarizePricing(propertyCards),
        exactStayPricing: summarizeExactStayPricing(propertyCards, constraints),
        stayRules: getStayRuleDiagnostics(propertyCards, constraints),
      },
    };
  });
}




