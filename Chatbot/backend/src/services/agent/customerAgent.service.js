import { openai } from "../../config/openai.js";
import { config } from "../../config/env.js";
import { retrieveContext } from "../rag/retrieval.service.js";
import { getPropertyByReference, searchAvailableProperties } from "../propertySearch.service.js";
import {
  createReservationDemandDirectFromChat,
  fetchReservationDemandById,
  listReservationDemandsByPhone,
  submitReservationIdentityFromChat,
  upsertProjectUserFromChat,
} from "../projectBooking.service.js";
import { STATES } from "../stateMachine.js";

const WEBSITE_BASE_URL = String(process.env.WEBSITE_BASE_URL || "https://www.dwiraimmobilier.com").replace(/\/+$/, "");
const PROJECT_API_BASE = String(process.env.PROJECT_API_BASE || "").trim().replace(/\/+$/, "");

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), Math.max(1, ms))),
  ]);
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseJsonSafe(value, fallback = null) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function parseDate(value) {
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function toNullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toPositiveNullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function normalizeReferenceToken(value) {
  const raw = decodeURIComponent(String(value || "").trim());
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) return "";
  if (/^ref\d+$/i.test(compact)) return compact.toUpperCase();
  return raw;
}

function getPropertyRouteToken(property) {
  const reference = String(property?.reference || "").trim();
  if (reference) return normalizeReferenceToken(reference) || reference;
  const slug = String(property?.slug || "").trim();
  if (slug) return slug;
  return String(property?.id || "").trim();
}

function toPropertyCard(property) {
  if (!property) return null;
  return {
    id: property.id,
    reference: String(property.reference || "").trim() || null,
    title: String(property.title || "").trim() || "Bien",
    location: String(property.location || "").trim() || null,
    capacity: toNullableNumber(property.capacity),
    bedrooms: toNullableNumber(property.bedrooms),
    bathrooms: toNullableNumber(property.bathrooms),
    pricePerNightTnd: toNullableNumber(property.pricePerNight),
    pricePerWeekTnd: toNullableNumber(property.pricePerWeek),
    nearBeach: Boolean(property.nearBeach),
    seaView: Boolean(property.seaView),
    beachfront: Boolean(property.beachfront),
    pool: Boolean(property.pool),
    poolPrivate: Boolean(property.poolPrivate),
    poolShared: Boolean(property.poolShared),
    parking: Boolean(property.parking),
    type: String(property.type || "").trim() || null,
    floor: String(property.floor || "").trim() || null,
    description: String(property.description || "").trim() || "",
    link: `${WEBSITE_BASE_URL}/properties/${encodeURIComponent(getPropertyRouteToken(property))}`,
  };
}

function toCompactSearchCriteria(context) {
  return {
    location: context?.location || null,
    type: context?.type || null,
    subType: context?.subType || null,
    guests: toNullableNumber(context?.guests),
    budget: toNullableNumber(context?.budget),
    startDate: parseDate(context?.startDate),
    endDate: parseDate(context?.endDate),
    bedrooms: toNullableNumber(context?.bedrooms),
    floor: String(context?.floor || "").trim() || null,
    preferences: Array.isArray(context?.preferences) ? context.preferences : [],
  };
}

function buildSearchLandingRelativeUrl(constraints) {
  const params = new URLSearchParams();
  params.set("mode", "location_saisonniere");

  const location = String(constraints?.location || "").trim();
  const type = String(constraints?.type || "").trim().toLowerCase();
  const subType = String(constraints?.subType || "").trim().toLowerCase();
  const startDate = parseDate(constraints?.startDate);
  const endDate = parseDate(constraints?.endDate);
  const guests = toPositiveNullableNumber(constraints?.guests);
  const budget = toPositiveNullableNumber(constraints?.budget);
  const bedrooms = toPositiveNullableNumber(constraints?.bedrooms);
  const preferences = Array.isArray(constraints?.preferences) ? constraints.preferences.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean) : [];

  if (location) params.set("locations", location);
  if (subType) params.set("q", subType);
  if (startDate || endDate) {
    if (startDate) params.set("checkIn", startDate);
    if (endDate) params.set("checkOut", endDate);
    const rangeStart = startDate || "";
    const rangeEnd = endDate || "";
    if (rangeStart || rangeEnd) params.set("stayRanges", `${rangeStart}:${rangeEnd}`);
  }
  if (type && type !== "autre") {
    const mappedType = type === "villa_maison" ? "villa_maison" : type;
    params.set("mainTypes", mappedType);
  }
  if (guests && guests > 1) params.set("guestsMin", String(guests));
  if (budget) params.set("maxPrice", String(budget));
  if (preferences.length > 0) {
    const seaside = [];
    const comfort = [];
    if (preferences.includes("beachfront")) seaside.push("pied_dans_eau");
    if (preferences.includes("sea_view")) seaside.push("vue_sur_mer");
    if (preferences.includes("near_beach")) seaside.push("pres_plage");
    if (preferences.includes("pool_private")) comfort.push("piscine_privee");
    else if (preferences.includes("pool_shared")) comfort.push("piscine_partagee");
    else if (preferences.includes("pool")) comfort.push("piscine_partagee");
    if (preferences.includes("ground_floor")) comfort.push("rdc");
    if (preferences.includes("first_floor")) comfort.push("premier_etage");
    if (seaside.length > 0) params.set("seaside", Array.from(new Set(seaside)).join(","));
    if (comfort.length > 0) params.set("comfort", Array.from(new Set(comfort)).join(","));
  }
  if (bedrooms && !subType) params.set("q", `s+${bedrooms}`);
  const queryString = params.toString();
  return `/logements${queryString ? `?${queryString}` : ""}`;
}

async function createSearchShareLink(relativeUrl) {
  const normalizedRelativeUrl = String(relativeUrl || "").trim();
  if (!normalizedRelativeUrl) return "";
  const fallbackUrl = `${WEBSITE_BASE_URL}${normalizedRelativeUrl}`;
  if (!PROJECT_API_BASE) return fallbackUrl;
  const endpoint = `${PROJECT_API_BASE}/search-share-links`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ relativeUrl: normalizedRelativeUrl }),
    });
    if (!response.ok) return fallbackUrl;
    const payload = await response.json().catch(() => null);
    return String(payload?.shortUrl || "").trim() || fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

function hasBroadSearchCriteria(context) {
  return Boolean(
    String(context?.location || "").trim()
    || String(context?.type || "").trim()
    || String(context?.subType || "").trim()
    || toNullableNumber(context?.bedrooms)
    || (Array.isArray(context?.preferences) && context.preferences.length > 0)
  );
}

function formatPropertyShortLine(property, language) {
  const label = String(property?.title || "").trim() || "Bien";
  const ref = String(property?.reference || "").trim();
  const location = String(property?.location || "").trim();
  const price = Number.isFinite(Number(property?.pricePerNightTnd)) && Number(property.pricePerNightTnd) > 0
    ? `${Number(property.pricePerNightTnd)} TND/nuit`
    : null;
  const parts = [label];
  if (ref) parts.push(`Ref ${ref}`);
  if (location) parts.push(location);
  if (price) parts.push(price);
  if (String(property?.link || "").trim()) parts.push(String(property.link).trim());
  return parts.join(" - ");
}

function buildScopeLabel(constraints) {
  const type = String(constraints?.type || "").trim().toLowerCase();
  const subType = String(constraints?.subType || "").trim().toLowerCase();
  const location = String(constraints?.location || "").trim();
  const typeBits = [type, subType].filter((value) => value && value !== "autre").join(" ").trim();
  return [typeBits, location].filter(Boolean).join(" fi ").trim();
}

function buildBrowseReply(language, constraints, options) {
  const lang = String(language || "fr").trim().toLowerCase();
  const shortlist = (Array.isArray(options) ? options : []).slice(0, 3);
  if (shortlist.length === 0) return "";
  const typeBits = [String(constraints?.type || "").trim(), String(constraints?.subType || "").trim()].filter(Boolean).join(" ");
  const zone = String(constraints?.location || "").trim();
  const scope = [typeBits, zone].filter(Boolean).join(" fi ").trim();
  const lines = shortlist.map((item, index) => `${index + 1}. ${formatPropertyShortLine(item, lang)}`).join("\n");

  if (lang === "tn") {
    return [
      scope ? `3andi barcha choix ynajmou yensbouk${scope ? `: ${scope}` : ""}.` : "3andi barcha choix ynajmou yensbouk.",
      "Hedhom a9wa options taw:",
      lines,
      "Ken t9olli dates mte3ek w 9adech men personne, ndhay9lek l ikhtiyar w نحسبلك exact total.",
    ].join("\n");
  }
  if (lang === "en") {
    return [
      scope ? `I found a few strong options for ${scope}.` : "I found a few strong options.",
      lines,
      "Send me your stay dates and guest count, and I will narrow it down and calculate the exact total.",
    ].join("\n");
  }
  if (lang === "ar") {
    return [
      scope ? `لقيتلك شوية خيارات مناسبة ${scope}.` : "لقيتلك شوية خيارات مناسبة.",
      lines,
      "اذا تبعثلي التواريخ وعدد الاشخاص نضيّقلك الاختيار ونحسبلك المبلغ الصحيح.",
    ].join("\n");
  }
  return [
    scope ? `J'ai trouve quelques options interessantes pour ${scope}.` : "J'ai trouve quelques options interessantes.",
    lines,
    "Envoyez-moi vos dates et le nombre de voyageurs, et je vous dirai lesquelles conviennent le mieux avec le total exact.",
  ].join("\n");
}

function buildFewOptionsReply(language, constraints, options) {
  const lang = String(language || "fr").trim().toLowerCase();
  const shortlist = (Array.isArray(options) ? options : []).slice(0, 3);
  if (shortlist.length === 0) return "";
  const lines = shortlist.map((item, index) => `${index + 1}. ${formatPropertyShortLine(item, lang)}`).join("\n");
  const hasDates = Boolean(parseDate(constraints?.startDate) && parseDate(constraints?.endDate));

  if (lang === "tn") {
    return [
      "L9it hedhom elli yensbouk taw:",
      lines,
      hasDates
        ? "Hedhom mfiltrin 7asb dates elli 3tithomli. Ken t7eb bien mo3ayen, 9olli ref mte3ou w nkammel m3ak."
        : "Ken t7eb bien mo3ayen, 9olli ref mte3ou. W ken tab3athli dates, nchecki disponibiliteh b thabet.",
    ].join("\n");
  }
  if (lang === "en") {
    return [
      "I found these matching options:",
      lines,
      hasDates
        ? "These are filtered on the stay dates you gave me. If one fits, send me its reference and I will continue."
        : "If one fits, send me its reference. If you send the dates too, I can verify availability precisely.",
    ].join("\n");
  }
  if (lang === "ar") {
    return [
      "لقيتلك هالخيارات المناسبة:",
      lines,
      hasDates
        ? "هذم مفلترين حسب التواريخ اللي بعثتهالي. كان يعجبك واحد منهم ابعثلي المرجع متاعو ونكمل."
        : "إذا يعجبك واحد منهم ابعثلي المرجع. وإذا تبعثلي التواريخ نثبتلك التوفر بدقة.",
    ].join("\n");
  }
  return [
    "J'ai trouve ces options qui correspondent:",
    lines,
    hasDates
      ? "Elles sont deja filtrees selon vos dates. Si l'une vous convient, envoyez-moi sa reference et je continue."
      : "Si l'une vous convient, envoyez-moi sa reference. Avec les dates, je peux verifier la disponibilite exacte.",
  ].join("\n");
}

function buildManyOptionsReply(language, constraints, searchUrl) {
  const lang = String(language || "fr").trim().toLowerCase();
  const scope = buildScopeLabel(constraints);
  const hasDates = Boolean(parseDate(constraints?.startDate) && parseDate(constraints?.endDate));

  if (lang === "tn") {
    return [
      scope ? `L9it barcha choix ${scope}.` : "L9it barcha choix ynajmou yensbouk.",
      hasDates ? "L lien hedha mfiltri deja 7asb dates w disponibilite." : "Tnajem tchouf kol les choix men houni:",
      searchUrl,
      "Ken t7eb, ba3d ma tchoufhom 9olli ref elli y3ajbek w nkammel m3ak.",
    ].join("\n");
  }
  if (lang === "en") {
    return [
      scope ? `I found several matching options for ${scope}.` : "I found several matching options.",
      hasDates ? "This link is already filtered by your dates and current availability:" : "You can browse the full filtered list here:",
      searchUrl,
      "Once you pick one, send me the reference and I will continue with you.",
    ].join("\n");
  }
  if (lang === "ar") {
    return [
      scope ? `لقيت برشا خيارات مناسبة ${scope}.` : "لقيت برشا خيارات مناسبة.",
      hasDates ? "الرابط هذا مفلتر حسب التواريخ والتوفر الحالي:" : "تنجم تشوف القائمة الكاملة من هنا:",
      searchUrl,
      "بعد ما تختار، ابعثلي المرجع ونكمل معاك.",
    ].join("\n");
  }
  return [
    scope ? `J'ai trouve plusieurs choix pour ${scope}.` : "J'ai trouve plusieurs choix qui correspondent.",
    hasDates ? "Ce lien est deja filtre selon vos dates et la disponibilite actuelle :" : "Vous pouvez parcourir la liste filtree complete ici :",
    searchUrl,
    "Une fois votre choix fait, envoyez-moi la reference et je continue avec vous.",
  ].join("\n");
}

async function buildNoAvailabilityReply(language, constraints) {
  const lang = String(language || "fr").trim().toLowerCase();
  const hasDates = Boolean(parseDate(constraints?.startDate) && parseDate(constraints?.endDate));
  if (!hasDates) return "";
  const relaxedConstraints = {
    ...constraints,
    startDate: null,
    endDate: null,
  };
  const relaxedUrl = await createSearchShareLink(buildSearchLandingRelativeUrl(relaxedConstraints));
  const subType = String(constraints?.subType || "").trim() || String(constraints?.type || "").trim() || "logement";
  const location = String(constraints?.location || "").trim();

  if (lang === "tn") {
    return [
      `Ma l9itech ${subType}${location ? ` fi ${location}` : ""} disponible fel dates hedhom.`,
      "Hedha lien nafs recherche sans dates bech tchouf kol les choix w tbadel periode ken t7eb:",
      relaxedUrl,
      "Ken t7eb, nجم zeda nqalleblek 3la dates okhra aw 3la zone 9riba.",
    ].join("\n");
  }
  if (lang === "en") {
    return [
      `I did not find available ${subType}${location ? ` in ${location}` : ""} for those dates.`,
      "Here is the same search without date filtering so you can browse the full set of options:",
      relaxedUrl,
      "If you want, I can also suggest other dates or nearby areas.",
    ].join("\n");
  }
  if (lang === "ar") {
    return [
      `ما لقيتش ${subType}${location ? ` في ${location}` : ""} متاح في التواريخ هاذم.`,
      "هذا نفس البحث من غير فلترة بالتواريخ باش تشوف كل الخيارات:",
      relaxedUrl,
      "وإذا تحب، نجم نقترح عليك تواريخ أخرى أو منطقة قريبة.",
    ].join("\n");
  }
  return [
    `Je n'ai pas trouve ${subType}${location ? ` a ${location}` : ""} disponible sur ces dates.`,
    "Voici la meme recherche sans filtre de dates pour parcourir plus largement les biens disponibles :",
    relaxedUrl,
    "Si vous voulez, je peux aussi proposer d'autres dates ou une zone proche.",
  ].join("\n");
}

function buildPriceSummaryReply(language, constraints, options) {
  const lang = String(language || "fr").trim().toLowerCase();
  const shortlist = (Array.isArray(options) ? options : []).filter((item) => Number.isFinite(Number(item?.pricePerNightTnd)) && Number(item.pricePerNightTnd) > 0);
  if (shortlist.length === 0) return "";
  const prices = shortlist.map((item) => Number(item.pricePerNightTnd)).sort((a, b) => a - b);
  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];
  const zone = String(constraints?.location || "").trim();
  const subtype = String(constraints?.subType || "").trim() || String(constraints?.type || "").trim();
  const examples = shortlist.slice(0, 2).map((item) => `- ${formatPropertyShortLine(item, lang)}`).join("\n");

  if (lang === "tn") {
    return [
      `Bennesba lel ${subtype || "logement"}${zone ? ` fi ${zone}` : ""}, aswem taw yebdew men ${minPrice} TND/nuit${maxPrice > minPrice ? ` w يوصلوا حتى ${maxPrice} TND/nuit` : ""}.`,
      "Exemples:",
      examples,
      "Ken t9olli dates mte3ek, نحسبلك exact prix حسب الفترة ونقولك شنوّا الأنسب.",
    ].join("\n");
  }
  if (lang === "en") {
    return [
      `For ${subtype || "this type of stay"}${zone ? ` in ${zone}` : ""}, current nightly prices start around ${minPrice} TND${maxPrice > minPrice ? ` and go up to about ${maxPrice} TND` : ""}.`,
      "Examples:",
      examples,
      "If you send the dates, I can calculate the exact price for your stay.",
    ].join("\n");
  }
  if (lang === "ar") {
    return [
      `بالنسبة ${subtype || "لهذا النوع"}${zone ? ` في ${zone}` : ""}، الاسعار الحالية تبدأ تقريباً من ${minPrice} TND لليلة${maxPrice > minPrice ? ` وتوصل حتى ${maxPrice} TND` : ""}.`,
      "أمثلة:",
      examples,
      "اذا تبعثلي التواريخ نحسبلك السعر الصحيح حسب الفترة.",
    ].join("\n");
  }
  return [
    `Pour ${subtype || "ce type de bien"}${zone ? ` a ${zone}` : ""}, les prix actuels commencent autour de ${minPrice} TND/nuit${maxPrice > minPrice ? ` et montent jusqu'a ${maxPrice} TND/nuit` : ""}.`,
    "Exemples:",
    examples,
    "Si vous m'envoyez les dates, je vous calcule le prix exact selon la periode.",
  ].join("\n");
}

function isBroadDiscoveryRequest(message, extracted, constraints) {
  const text = norm(message);
  const responseMode = String(extracted?.responseMode || "").trim().toLowerCase();
  if (["property_list", "price_summary", "zone_summary", "zone_price_summary"].includes(responseMode)) return true;
  return hasBroadSearchCriteria(constraints)
    && /(?:chnw|show|liste|options|andek|b9adech|prix|soum|zones?|ou|where|kelibia|location|appartement|villa|studio|s\+\d)/i.test(text);
}

async function preloadDiscoveryOptions(state, extracted) {
  if (!isBroadDiscoveryRequest(state.userMessage, extracted, state.constraints)) return;
  if (Array.isArray(state.currentOptions) && state.currentOptions.length > 0) return;
  const filters = buildSearchFilters(state.constraints, { limit: 12 });
  const rows = await searchAvailableProperties(filters);
  const cards = rows.map(toPropertyCard).filter(Boolean);
  if (cards.length === 0) return;
  state.currentOptions = cards.slice(0, 3);
  state.constraints.browse = {
    shownOptionIds: cards.slice(0, 12).map((item) => String(item.id)),
    lastShownCount: cards.length,
    lastOptions: cards.slice(0, 12),
  };
}

function buildDeterministicDiscoveryReply(language, extracted, constraints, options) {
  const responseMode = String(extracted?.responseMode || "").trim().toLowerCase();
  if (!Array.isArray(options) || options.length === 0) return "";
  if (responseMode === "price_summary") return buildPriceSummaryReply(language, constraints, options);
  if (["property_list", "zone_summary", "zone_price_summary"].includes(responseMode)) return buildBrowseReply(language, constraints, options);
  return "";
}

function sanitizeAgentReply(reply) {
  return String(reply || "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, "$1: $2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTnOptionLine(property, index) {
  const title = String(property?.title || "").trim() || "Bien";
  const ref = String(property?.reference || "").trim();
  const location = String(property?.location || "").trim();
  const floor = String(property?.floor || "").trim();
  const price = Number.isFinite(Number(property?.pricePerNightTnd)) && Number(property.pricePerNightTnd) > 0
    ? `${Number(property.pricePerNightTnd)} TND/lyla`
    : null;
  const bits = [];
  if (location) bits.push(location);
  if (floor) bits.push(`etage ${floor}`);
  if (price) bits.push(price);
  const summary = bits.length > 0 ? ` - ${bits.join(" - ")}` : "";
  const link = String(property?.link || "").trim();
  return `${index + 1}. ${title}${ref ? ` - Ref ${ref}` : ""}${summary}${link ? ` - ${link}` : ""}`;
}

function buildTnBrowseReply(constraints, options) {
  const shortlist = (Array.isArray(options) ? options : []).slice(0, 3);
  if (shortlist.length === 0) return "";
  const typeLabel = [String(constraints?.type || "").trim(), String(constraints?.subType || "").trim()].filter(Boolean).join(" ").trim();
  const locationLabel = String(constraints?.location || "").trim();
  const scope = [typeLabel, locationLabel].filter(Boolean).join(" fi ");
  const lines = shortlist.map((item, index) => formatTnOptionLine(item, index)).join("\n");
  return [
    scope ? `L9it chwaya options behin ${scope}:` : "L9it chwaya options behin:",
    lines,
    "Ken tab3athli dates w 9adech men personne, n9ollek chnouwa anseb option w n7sebhalek el total.",
  ].join("\n");
}

function buildTnPriceReply(constraints, options) {
  const shortlist = (Array.isArray(options) ? options : []).filter((item) => Number.isFinite(Number(item?.pricePerNightTnd)) && Number(item.pricePerNightTnd) > 0);
  if (shortlist.length === 0) return "";
  const prices = shortlist.map((item) => Number(item.pricePerNightTnd)).sort((a, b) => a - b);
  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];
  const subtype = String(constraints?.subType || "").trim() || String(constraints?.type || "").trim() || "logement";
  const zone = String(constraints?.location || "").trim();
  const examples = shortlist.slice(0, 2).map((item, index) => formatTnOptionLine(item, index)).join("\n");
  return [
    `Bennesba lel ${subtype}${zone ? ` fi ${zone}` : ""}, soum taw yabda men ${minPrice} TND/lyla${maxPrice > minPrice ? ` w ywasel hata ${maxPrice} TND/lyla` : ""}.`,
    "Exemples:",
    examples,
    "Ken tab3athli dates, n7sebhalek exact soum 7asb periode.",
  ].join("\n");
}

function buildDeterministicTnReply(state, extracted, options) {
  const messageText = norm(state?.userMessage || "");
  const responseMode = String(extracted?.responseMode || "").trim().toLowerCase();
  const selectedRef = String(state?.constraints?.selectedPropertyRef || "").trim();
  const hasDates = Boolean(parseDate(state?.constraints?.startDate) && parseDate(state?.constraints?.endDate));
  const guests = toPositiveNullableNumber(state?.constraints?.guests);
  const profile = state?.constraints?.profile || {};
  const missingProfile = !String(profile.fullName || "").trim() || !String(profile.phone || "").trim();

  if ((responseMode === "greeting" || /^(sallem|salem|slm|aslema|marhbe|ahla)\b/.test(messageText)) && !hasBroadSearchCriteria(state?.constraints) && !selectedRef) {
    return "Sallem! Najem n3awnek fel recherche, prix, disponibilite, wala reservation. 9olli chnowa tlawej b thabet.";
  }
  if (selectedRef && (!hasDates || !guests)) {
    return `Behi, باش nkammlou b Ref ${selectedRef}. Ab3athli dates d5oul w 5rouj, w 9adech men personne.`;
  }
  if (selectedRef && hasDates && guests && missingProfile) {
    return `Fhemt. Ref ${selectedRef}, men ${state.constraints.startDate} lel ${state.constraints.endDate} pour ${guests} personne${guests > 1 ? "s" : ""}. Taw ab3athli esmek el kamel w numero telephone bech nkammlou el reservation.`;
  }
  if (responseMode === "price_summary") {
    return buildTnPriceReply(state?.constraints, options);
  }
  if (["property_list", "zone_summary", "zone_price_summary"].includes(responseMode)) {
    return buildTnBrowseReply(state?.constraints, options);
  }
  return "";
}

async function buildDeterministicTnDiscoveryOutcome(state, extracted, options, totalCount) {
  const responseMode = String(extracted?.responseMode || "").trim().toLowerCase();
  if (!["property_list", "zone_summary", "zone_price_summary"].includes(responseMode)) return "";
  const safeCount = Math.max(Array.isArray(options) ? options.length : 0, Number(totalCount || 0));
  if (safeCount <= 0) return buildNoAvailabilityReply("tn", state?.constraints);
  if (safeCount <= 3) return buildFewOptionsReply("tn", state?.constraints, options);
  const relativeUrl = buildSearchLandingRelativeUrl(state?.constraints);
  const shareUrl = await createSearchShareLink(relativeUrl);
  return buildManyOptionsReply("tn", state?.constraints, shareUrl);
}

async function preloadSelectedProperty(state) {
  const selectedReference = String(state?.constraints?.selectedPropertyRef || "").trim();
  if (!selectedReference) return;
  const current = Array.isArray(state.currentOptions) ? state.currentOptions : [];
  const alreadySelected = current.find((item) => String(item?.reference || "").trim().toLowerCase() === selectedReference.toLowerCase());
  if (alreadySelected) {
    state.currentOptions = [alreadySelected];
    return;
  }
  const row = await getPropertyByReference(selectedReference);
  const property = toPropertyCard(row);
  if (!property) return;
  state.currentOptions = [property];
  state.constraints.selectedPropertyId = property.id;
  state.constraints.selectedPropertyRef = property.reference || selectedReference;
}

async function buildDeterministicDiscoveryOutcome(language, extracted, constraints, options, totalCount) {
  const responseMode = String(extracted?.responseMode || "").trim().toLowerCase();
  if (!["property_list", "zone_summary", "zone_price_summary"].includes(responseMode)) return "";
  const safeCount = Math.max(Array.isArray(options) ? options.length : 0, Number(totalCount || 0));
  if (safeCount <= 0) return buildNoAvailabilityReply(language, constraints);
  if (safeCount <= 3) return buildFewOptionsReply(language, constraints, options);
  const relativeUrl = buildSearchLandingRelativeUrl(constraints);
  const shareUrl = await createSearchShareLink(relativeUrl);
  return buildManyOptionsReply(language, constraints, shareUrl);
}

function buildSearchFilters(context, override = {}) {
  const prefs = new Set([
    ...(Array.isArray(context?.preferences) ? context.preferences : []),
    ...(Array.isArray(override?.preferences) ? override.preferences : []),
  ]);
  const floor = String(override?.floor || context?.floor || "").trim().toLowerCase();
  return {
    location: String(override?.location || context?.location || "").trim() || null,
    type: String(override?.type || context?.type || "").trim() || null,
    subType: String(override?.subType || context?.subType || "").trim() || null,
    guests: toPositiveNullableNumber(override?.guests ?? context?.guests),
    budget: toPositiveNullableNumber(override?.budget ?? context?.budget),
    startDate: parseDate(override?.startDate || context?.startDate),
    endDate: parseDate(override?.endDate || context?.endDate),
    bedrooms: toPositiveNullableNumber(override?.bedrooms ?? context?.bedrooms),
    floor: floor === "ground" || floor === "first" ? floor : null,
    nearBeach: prefs.has("near_beach"),
    seaView: prefs.has("sea_view"),
    beachfront: prefs.has("beachfront"),
    pool: prefs.has("pool"),
    poolPrivate: prefs.has("pool_private"),
    poolShared: prefs.has("pool_shared"),
    parking: prefs.has("parking"),
    preferences: Array.from(prefs),
    limit: Math.max(1, Math.min(12, Number(override?.limit || 6))),
  };
}

function mergeProfile(target, patch = {}) {
  const next = target && typeof target === "object" ? target : {};
  if (String(patch.fullName || "").trim()) next.fullName = String(patch.fullName).trim();
  if (String(patch.phone || "").trim()) next.phone = normalizePhone(patch.phone);
  if (String(patch.email || "").trim()) next.email = String(patch.email).trim().toLowerCase();
  if (String(patch.address || "").trim()) next.address = String(patch.address).trim();
  if (String(patch.identityNumber || "").trim()) next.identityNumber = String(patch.identityNumber).trim().toUpperCase();
  if (String(patch.identityImageUrl || "").trim()) next.identityImageUrl = String(patch.identityImageUrl).trim();
  return next;
}

function mergeSearchContext(target, patch = {}) {
  const next = target && typeof target === "object" ? target : {};
  if (String(patch.location || "").trim()) next.location = String(patch.location).trim();
  if (String(patch.type || "").trim()) next.type = String(patch.type).trim().toLowerCase();
  if (String(patch.subType || "").trim()) next.subType = String(patch.subType).trim().toLowerCase();
  if (parseDate(patch.startDate)) next.startDate = parseDate(patch.startDate);
  if (parseDate(patch.endDate)) next.endDate = parseDate(patch.endDate);
  if (toNullableNumber(patch.guests) && Number(patch.guests) > 0) next.guests = Number(patch.guests);
  if (toNullableNumber(patch.budget) && Number(patch.budget) > 0) next.budget = Number(patch.budget);
  if (toNullableNumber(patch.bedrooms) && Number(patch.bedrooms) > 0) next.bedrooms = Number(patch.bedrooms);
  if (String(patch.floor || "").trim()) next.floor = String(patch.floor).trim().toLowerCase();
  if (Array.isArray(patch.preferences) && patch.preferences.length > 0) {
    next.preferences = Array.from(new Set([...(Array.isArray(next.preferences) ? next.preferences : []), ...patch.preferences.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)]));
  }
  return next;
}

function summarizeConversationContext({ conversation, client, constraints, extracted, currentOptions }) {
  return {
    state: String(conversation?.state || "").trim() || STATES.NEW_LEAD,
    platform: String(client?.platform || "").trim() || "website",
    language: String(constraints?.language || extracted?.language || client?.language || "fr").trim().toLowerCase(),
    search: toCompactSearchCriteria(constraints),
    selectedPropertyRef: String(constraints?.selectedPropertyRef || "").trim() || null,
    selectedPropertyId: constraints?.selectedPropertyId ?? null,
    reservationDemandId: String(constraints?.reservationDemandId || "").trim() || null,
    profile: {
      fullName: String(constraints?.profile?.fullName || "").trim() || null,
      phone: String(constraints?.profile?.phone || "").trim() || null,
      email: String(constraints?.profile?.email || "").trim() || null,
      address: String(constraints?.profile?.address || "").trim() || null,
      identityNumber: String(constraints?.profile?.identityNumber || "").trim() || null,
      identityImageUrl: String(constraints?.profile?.identityImageUrl || "").trim() || null,
    },
    currentOptions: (Array.isArray(currentOptions) ? currentOptions : []).slice(0, 3).map((item) => ({
      reference: item.reference,
      title: item.title,
      location: item.location,
      pricePerNightTnd: item.pricePerNightTnd,
      link: item.link,
    })),
  };
}

function buildFallbackReply(language, constraints) {
  const lang = String(language || "fr").trim().toLowerCase();
  if (lang === "tn") {
    if (constraints?.selectedPropertyRef && (!constraints?.startDate || !constraints?.endDate || !constraints?.guests)) {
      return "Fhemt el bien elli t7ebou. 9olli taw dates w 9adech men personne bech nchecki disponibiliteh w prixou.";
    }
    return "Fhemtk. Najem nlawwejlek fel site b thkeya, nwarik options, norbotk b reference mo3ayena, wala nkammel m3ak reservation. 9olli zone, dates, budget, nombre de personnes, wala directement la reference.";
  }
  if (lang === "en") {
    return "I understood. I can search the site intelligently, show matching options, follow one property reference, or continue the reservation with you. Tell me the area, dates, budget, guests, or the exact property reference.";
  }
  if (lang === "ar") {
    return "فهمت طلبك. نجم نبحثلك في الموقع بذكاء، نوريك الاختيارات المناسبة، نتابع مرجع عقار معين، او نكمل معاك الحجز. ابعثلي المنطقة او التواريخ او الميزانية او عدد الاشخاص او المرجع مباشرة.";
  }
  return "J'ai compris. Je peux chercher intelligemment sur le site, proposer des choix, suivre une reference precise, ou continuer la reservation avec vous. Donnez-moi la zone, les dates, le budget, le nombre de personnes, ou la reference du bien.";
}

function inferConversationState({ constraints, options, attemptedReservation }) {
  if (String(constraints?.reservationDemandId || "").trim()) return STATES.PENDING_CONFIRMATION;
  const profile = constraints?.profile || {};
  const missingIdentity = !String(profile.fullName || "").trim()
    || !String(profile.phone || "").trim()
    || !String(profile.identityNumber || "").trim()
    || !String(profile.identityImageUrl || "").trim();
  if (attemptedReservation && missingIdentity) return STATES.COLLECTING_IDENTITY;
  if (constraints?.selectedPropertyId || String(constraints?.selectedPropertyRef || "").trim()) {
    if (!constraints?.startDate || !constraints?.endDate || !constraints?.guests) return STATES.ASKING_DATES;
    if (missingIdentity) return STATES.COLLECTING_IDENTITY;
    return STATES.WAITING_SELECTION;
  }
  if (Array.isArray(options) && options.length > 0) return STATES.SHOWING_OPTIONS;
  if (constraints?.location || constraints?.type || constraints?.subType || constraints?.budget || constraints?.guests) {
    return STATES.ASKING_PREFERENCES;
  }
  return STATES.NEW_LEAD;
}

function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "save_client_profile",
        description: "Store or update customer identity information extracted from the conversation.",
        parameters: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            address: { type: "string" },
            identityNumber: { type: "string" },
            identityImageUrl: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_search_criteria",
        description: "Store or refine the search criteria that should be remembered for the client.",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
            type: { type: "string" },
            subType: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
            guests: { type: "number" },
            budget: { type: "number" },
            bedrooms: { type: "number" },
            floor: { type: "string" },
            preferences: {
              type: "array",
              items: {
                type: "string",
                enum: ["sea_view", "near_beach", "beachfront", "pool", "pool_private", "pool_shared", "parking", "ground_floor", "first_floor"],
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_properties",
        description: "Search live site inventory using the current or refined criteria.",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
            type: { type: "string" },
            subType: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
            guests: { type: "number" },
            budget: { type: "number" },
            bedrooms: { type: "number" },
            floor: { type: "string" },
            preferences: {
              type: "array",
              items: {
                type: "string",
                enum: ["sea_view", "near_beach", "beachfront", "pool", "pool_private", "pool_shared", "parking", "ground_floor", "first_floor"],
              },
            },
            limit: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_property_details",
        description: "Load one specific property by reference or id.",
        parameters: {
          type: "object",
          properties: {
            reference: { type: "string" },
            propertyId: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_knowledge",
        description: "Retrieve RAG knowledge for general rules, process, payment, reservation, cancellation, and policy questions.",
        parameters: {
          type: "object",
          properties: {
            question: { type: "string" },
          },
          required: ["question"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_reservation_status",
        description: "Check the status of an existing reservation demand using a demand id or phone number.",
        parameters: {
          type: "object",
          properties: {
            demandId: { type: "string" },
            phone: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_reservation_request",
        description: "Create a reservation demand when the selected property, stay dates, guests, and customer identity are available.",
        parameters: {
          type: "object",
          properties: {
            reference: { type: "string" },
            propertyId: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}

async function createReservationDemandFromAgent(constraints, selectedProperty) {
  if (!selectedProperty || !constraints?.startDate || !constraints?.endDate || !constraints?.guests) {
    return { ok: false, missing: ["selected_property", "dates", "guests"] };
  }
  const profile = constraints?.profile || {};
  const missing = [];
  if (!String(profile.fullName || "").trim()) missing.push("full_name");
  if (!String(profile.phone || "").trim()) missing.push("phone");
  if (!String(profile.identityNumber || "").trim()) missing.push("identity_number");
  if (!String(profile.identityImageUrl || "").trim()) missing.push("identity_image");
  if (missing.length > 0) return { ok: false, missing };

  const projectUser = await upsertProjectUserFromChat(profile);
  const start = new Date(`${constraints.startDate}T00:00:00`);
  const end = new Date(`${constraints.endDate}T00:00:00`);
  const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const pricePerNight = Math.max(0, Number(selectedProperty.pricePerNightTnd || 0));
  const totalAmount = pricePerNight * nights;

  const payload = {
    bien_id: String(selectedProperty.id),
    client_user_id: String(projectUser.id),
    client_name: String(profile.fullName || projectUser.nom || "").trim(),
    client_email: String(profile.email || projectUser.email || "").trim() || null,
    start_date: constraints.startDate,
    end_date: constraints.endDate,
    guests: Math.max(1, Number(constraints.guests || 1)),
    adult_guests: Math.max(1, Number(constraints.adultGuests || constraints.guests || 1)),
    child_guests: Math.max(0, Number(constraints.childGuests || 0)),
    payment_mode: "avance",
    total_amount: totalAmount,
    amount_due_now: Math.min(totalAmount, pricePerNight),
    selected_fixed_services: [],
    selected_variable_services: [],
    client_note: `Created by AI agent | phone:${profile.phone || ""} | cin:${profile.identityNumber || ""} | cin_image:${profile.identityImageUrl || ""} | address:${profile.address || ""}`,
    request_type: "reservation",
  };

  const created = await createReservationDemandDirectFromChat(payload, profile);
  if (created?.id && profile.identityNumber && profile.identityImageUrl && profile.fullName) {
    try {
      await submitReservationIdentityFromChat(created.id, profile);
    } catch {
      // The demand remains created even if identity sync fails afterward.
    }
  }

  return {
    ok: Boolean(created?.id),
    reservation: created ? {
      id: String(created.id),
      status: String(created.status || "").trim() || null,
      startDate: String(created.start_date || "").slice(0, 10) || constraints.startDate,
      endDate: String(created.end_date || "").slice(0, 10) || constraints.endDate,
      totalAmount,
      amountDueNow: Math.min(totalAmount, pricePerNight),
    } : null,
  };
}

async function executeToolCall(toolCall, state) {
  const name = String(toolCall?.function?.name || "").trim();
  const args = parseJsonSafe(toolCall?.function?.arguments, {}) || {};
  state.toolsUsed.push(name);

  if (name === "save_client_profile") {
    state.constraints.profile = mergeProfile(state.constraints.profile, args);
    return {
      ok: true,
      profile: {
        fullName: String(state.constraints.profile?.fullName || "").trim() || null,
        phone: String(state.constraints.profile?.phone || "").trim() || null,
        email: String(state.constraints.profile?.email || "").trim() || null,
        address: String(state.constraints.profile?.address || "").trim() || null,
        identityNumber: String(state.constraints.profile?.identityNumber || "").trim() || null,
        identityImageUrl: String(state.constraints.profile?.identityImageUrl || "").trim() || null,
      },
    };
  }

  if (name === "update_search_criteria") {
    mergeSearchContext(state.constraints, args);
    return {
      ok: true,
      search: toCompactSearchCriteria(state.constraints),
    };
  }

  if (name === "search_properties") {
    mergeSearchContext(state.constraints, args);
    const filters = buildSearchFilters(state.constraints, args);
    const rows = await searchAvailableProperties(filters);
    const cards = rows.map(toPropertyCard).filter(Boolean);
    state.currentOptions = cards.slice(0, 3);
    state.constraints.browse = {
      shownOptionIds: cards.slice(0, 12).map((item) => String(item.id)),
      lastShownCount: cards.length,
      lastOptions: cards.slice(0, 12),
    };
    if (cards.length === 1) {
      state.constraints.selectedPropertyId = cards[0].id;
      state.constraints.selectedPropertyRef = cards[0].reference || state.constraints.selectedPropertyRef || null;
    }
    return {
      ok: true,
      count: cards.length,
      filters,
      results: cards.slice(0, 5),
    };
  }

  if (name === "get_property_details") {
    let property = null;
    if (toNullableNumber(args.propertyId)) {
      const options = Array.isArray(state.constraints?.browse?.lastOptions) ? state.constraints.browse.lastOptions : [];
      property = options.find((item) => Number(item.id) === Number(args.propertyId)) || null;
    }
    if (!property && String(args.reference || "").trim()) {
      const row = await getPropertyByReference(args.reference);
      property = toPropertyCard(row);
    }
    if (!property && String(state.constraints.selectedPropertyRef || "").trim()) {
      const row = await getPropertyByReference(state.constraints.selectedPropertyRef);
      property = toPropertyCard(row);
    }
    if (!property) {
      return { ok: false, reason: "property_not_found" };
    }
    state.currentOptions = [property];
    state.constraints.selectedPropertyId = property.id;
    state.constraints.selectedPropertyRef = property.reference || state.constraints.selectedPropertyRef || null;
    return { ok: true, property };
  }

  if (name === "search_knowledge") {
    const question = String(args.question || state.userMessage || "").trim();
    const context = await retrieveContext(question, 6);
    return {
      ok: Boolean(context),
      context: context || "",
    };
  }

  if (name === "get_reservation_status") {
    const demandId = String(args.demandId || state.constraints.reservationDemandId || "").trim();
    if (demandId) {
      const demand = await fetchReservationDemandById(demandId);
      return demand
        ? {
            ok: true,
            reservation: {
              id: String(demand.id || ""),
              status: String(demand.status || "").trim() || null,
              propertyTitle: String(demand.bien_titre || "").trim() || null,
              propertyReference: String(demand.bien_reference || "").trim() || null,
              startDate: String(demand.start_date_fmt || "").trim() || null,
              endDate: String(demand.end_date_fmt || "").trim() || null,
            },
          }
        : { ok: false, reason: "reservation_not_found" };
    }

    const phone = normalizePhone(args.phone || state.constraints?.profile?.phone || "");
    if (!phone) return { ok: false, reason: "phone_missing" };
    const rows = await listReservationDemandsByPhone(phone);
    const latest = Array.isArray(rows) ? rows[0] : null;
    return latest
      ? {
          ok: true,
          reservation: {
            id: String(latest.id || ""),
            status: String(latest.status || "").trim() || null,
            propertyTitle: String(latest.bien_titre || latest.property_title || "").trim() || null,
            propertyReference: String(latest.bien_reference || latest.reference || "").trim() || null,
            startDate: String(latest.start_date || latest.start_date_fmt || "").slice(0, 10) || null,
            endDate: String(latest.end_date || latest.end_date_fmt || "").slice(0, 10) || null,
          },
        }
      : { ok: false, reason: "reservation_not_found" };
  }

  if (name === "create_reservation_request") {
    let selectedProperty = null;
    if (toNullableNumber(args.propertyId)) {
      const options = Array.isArray(state.constraints?.browse?.lastOptions) ? state.constraints.browse.lastOptions : [];
      selectedProperty = options.find((item) => Number(item.id) === Number(args.propertyId)) || null;
    }
    if (!selectedProperty && String(args.reference || "").trim()) {
      const row = await getPropertyByReference(args.reference);
      selectedProperty = toPropertyCard(row);
    }
    if (!selectedProperty && String(state.constraints.selectedPropertyRef || "").trim()) {
      const row = await getPropertyByReference(state.constraints.selectedPropertyRef);
      selectedProperty = toPropertyCard(row);
    }
    if (!selectedProperty && state.currentOptions.length === 1) {
      selectedProperty = state.currentOptions[0];
    }
    const result = await createReservationDemandFromAgent(state.constraints, selectedProperty);
    state.attemptedReservation = true;
    if (result?.ok && result.reservation?.id) {
      state.constraints.reservationDemandId = String(result.reservation.id);
      state.currentOptions = selectedProperty ? [selectedProperty] : state.currentOptions;
    }
    return result;
  }

  return { ok: false, reason: "unsupported_tool" };
}

export async function runCustomerAgentTurn(input) {
  const {
    payload,
    client,
    conversation,
    constraints,
    extracted,
    conversationTranscript,
  } = input;

  const state = {
    userMessage: String(payload?.message || "").trim(),
    constraints,
    currentOptions: Array.isArray(constraints?.browse?.lastOptions) ? constraints.browse.lastOptions.slice(0, 3) : [],
    attemptedReservation: false,
    toolsUsed: [],
  };

  const language = String(constraints?.language || extracted?.language || client?.language || "fr").trim().toLowerCase();
  await preloadSelectedProperty(state);
  await preloadDiscoveryOptions(state, extracted);
  const systemPrompt = [
    "You are the Dwira AI agent.",
    "You are not a scripted chatbot. You must behave like a smart rental agent that understands the customer, searches the live site inventory intelligently, follows one client across the conversation, and moves the booking forward.",
    "Always prefer tool use over guessing.",
    "For property discovery, use search_properties.",
    "For one exact property reference, use get_property_details.",
    "For general process or policy questions, use search_knowledge.",
    "If the customer wants booking progress or booking status, use get_reservation_status or create_reservation_request.",
    "If customer identity or criteria appear in the message, store them with save_client_profile or update_search_criteria.",
    "Never invent property details, availability, prices, policy rules, or reservation status.",
    "Reply in the same language as the customer. Supported languages: fr, en, ar, tn.",
    "If language is tn, write natural Tunisian dialect in Latin/Facebook style.",
    "Keep replies concise, human, and action-oriented.",
    "Do not speak like an internal search engine or scripted bot.",
    "Do not say exact matches, alternatives, filtered search, search link prepared, or any internal ranking/counting phrasing unless the user explicitly asks for that.",
    "When several properties fit, act like a human advisor.",
    "If there are more than 3 good matches, share one broad filtered search link instead of dumping many property links.",
    "If there are 3 matches or fewer, share the direct property links.",
    "Do not dump large counts of results. Do not expose internal search labels.",
    "Ask only the next blocking piece of information when something is missing.",
    "If there are several matches, summarize the best choices and mention references and direct links naturally.",
    "Output plain text only. No markdown bullets with stars, no JSON.",
  ].join(" ");

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `CURRENT_CONTEXT:\n${JSON.stringify(summarizeConversationContext({
        conversation,
        client,
        constraints,
        extracted,
        currentOptions: state.currentOptions,
      }), null, 2)}`,
    },
    {
      role: "system",
      content: `RECENT_TRANSCRIPT:\n${String(conversationTranscript || "").trim() || "none"}`,
    },
    {
      role: "system",
      content: `DISCOVERY_OPTIONS:\n${JSON.stringify((Array.isArray(state.currentOptions) ? state.currentOptions : []).slice(0, 3), null, 2)}`,
    },
    {
      role: "user",
      content: state.userMessage,
    },
  ];

  const tools = buildTools();
  let finalReply = "";

  for (let step = 0; step < 6; step += 1) {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: config.openaiChatModel,
        temperature: 0.2,
        messages,
        tools,
        tool_choice: "auto",
      }),
      config.openaiTimeoutMs,
      "customer_agent"
    );

    const assistantMessage = completion.choices[0]?.message;
    const toolCalls = Array.isArray(assistantMessage?.tool_calls) ? assistantMessage.tool_calls : [];

    if (toolCalls.length === 0) {
      finalReply = String(assistantMessage?.content || "").trim();
      break;
    }

    messages.push({
      role: "assistant",
      content: assistantMessage?.content || "",
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const result = await executeToolCall(toolCall, state);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  if (!finalReply) {
    finalReply = buildFallbackReply(language, state.constraints);
  }

  const options = Array.isArray(state.currentOptions) ? state.currentOptions.slice(0, 3) : [];
  const totalCount = Number(state?.constraints?.browse?.lastShownCount || 0);
  const deterministicReply = buildDeterministicDiscoveryReply(language, extracted, state.constraints, options);
  const hasTnStyleMessage = /\b(sallem|salem|slm|aslema|marhbe|ahla|chnw|chnowa|nheb|andek|b9adech|fama)\b/.test(norm(state.userMessage));
  const deterministicTnReply = (language === "tn" || hasTnStyleMessage) ? buildDeterministicTnReply(state, extracted, options) : "";
  const deterministicDiscoveryOutcome = await buildDeterministicDiscoveryOutcome(language, extracted, state.constraints, options, totalCount);
  const deterministicTnDiscoveryOutcome = (language === "tn" || hasTnStyleMessage)
    ? await buildDeterministicTnDiscoveryOutcome(state, extracted, options, totalCount)
    : "";
  if ((!String(finalReply || "").trim() || /je n.ai pas trouv|ma fama hata|no availability currently/i.test(String(finalReply || ""))) && deterministicReply) {
    finalReply = deterministicReply;
  }
  if (deterministicDiscoveryOutcome) {
    finalReply = deterministicDiscoveryOutcome;
  }
  if (deterministicTnReply) {
    finalReply = deterministicTnReply;
  }
  if (deterministicTnDiscoveryOutcome) {
    finalReply = deterministicTnDiscoveryOutcome;
  }
  finalReply = sanitizeAgentReply(finalReply);
  const newState = inferConversationState({
    constraints: state.constraints,
    options,
    attemptedReservation: state.attemptedReservation,
  });

  return {
    reply: finalReply,
    options,
    newState,
    updatedConstraints: state.constraints,
    diagnostics: {
      mode: "agent_rag",
      toolsUsed: state.toolsUsed,
    },
  };
}
