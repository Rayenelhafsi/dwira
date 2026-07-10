import type { Property } from "../data/properties";
import type { PropertyPack, PropertyPackTab, PropertyPackTabIconKey } from "../admin/types";
import { normalizeDateOnlyInput, resolveStayAvailability } from "./availability";
import { resolveCurrentPricing } from "./seasonalPricing";

export const PROPERTY_PACK_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23065f46'/%3E%3Cstop offset='100%25' stop-color='%23134e4a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1600' height='900' fill='url(%23g)'/%3E%3Cpath d='M240 630l240-220 170 160 150-140 260 200H240z' fill='%23d1fae5' fill-opacity='.22'/%3E%3Ccircle cx='500' cy='250' r='70' fill='%23d1fae5' fill-opacity='.24'/%3E%3C/svg%3E";

export type PropertyPackThemeKey = "famille" | "romantique" | "luxe" | "decouverte" | "affaires" | "exclusive";

export type PropertyPackTheme = {
  key: PropertyPackThemeKey;
  label: string;
  iconKey: PropertyPackTabIconKey;
  sourceTabId?: string | null;
  accentClass: string;
  pillClass: string;
  buttonClass: string;
  softClass: string;
};

export type PackSearchContext = {
  checkIn: string;
  checkOut: string;
  guestsMin: number;
  locations: string[];
  categories: string[];
  mainTypes: string[];
  comboRequests: PackCombinationRequest[];
};

export type PackCombinationRequest = {
  mainType: string;
  label: string;
  count: number;
};

export type PackAvailabilityStatus = "exact" | "partial" | "unavailable";

export type ResolvedPropertyPack = PropertyPack & {
  variantKey: string;
  variantPropertyIds: string[];
  rootProperties: Property[];
  properties: Property[];
  matchedProperties: Property[];
  rootPropertyCount: number;
  matchedSubtypeScore: number;
  matchedRequestedSubtypeScore: number;
  matchedReferences: string[];
  coverImage: string;
  galleryImages: string[];
  totalNightlyPrice: number;
  totalWeeklyPrice: number;
  maxGuests: number;
  minStayNights: number;
  locationSummary: string;
  shortDescription: string;
  commonAmenities: string[];
  highlightItems: string[];
  locationPills: string[];
  propertyLines: string[];
  featureTags: string[];
  theme: PropertyPackTheme;
  availabilityStatus: PackAvailabilityStatus;
  isSearchVariant: boolean;
  searchSummary: string | null;
};

const PACK_THEMES: Record<PropertyPackThemeKey, PropertyPackTheme> = {
  famille: {
    key: "famille",
    label: "Famille",
    iconKey: "home",
    accentClass: "from-emerald-700/95 via-emerald-600/90 to-emerald-500/85",
    pillClass: "bg-emerald-600 text-white",
    buttonClass: "bg-emerald-600 text-white hover:bg-emerald-700",
    softClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  romantique: {
    key: "romantique",
    label: "Romantique",
    iconKey: "heart",
    accentClass: "from-pink-700/95 via-fuchsia-600/90 to-rose-500/85",
    pillClass: "bg-pink-600 text-white",
    buttonClass: "bg-pink-600 text-white hover:bg-pink-700",
    softClass: "bg-pink-50 text-pink-700 border-pink-200",
  },
  luxe: {
    key: "luxe",
    label: "Luxe",
    iconKey: "crown",
    accentClass: "from-amber-700/95 via-amber-500/90 to-yellow-400/85",
    pillClass: "bg-amber-500 text-white",
    buttonClass: "bg-amber-500 text-slate-950 hover:bg-amber-400",
    softClass: "bg-amber-50 text-amber-800 border-amber-200",
  },
  decouverte: {
    key: "decouverte",
    label: "Decouverte",
    iconKey: "map",
    accentClass: "from-cyan-700/95 via-sky-600/90 to-blue-500/85",
    pillClass: "bg-sky-600 text-white",
    buttonClass: "bg-sky-600 text-white hover:bg-sky-700",
    softClass: "bg-sky-50 text-sky-700 border-sky-200",
  },
  affaires: {
    key: "affaires",
    label: "Affaires",
    iconKey: "briefcase",
    accentClass: "from-slate-800/95 via-slate-700/90 to-slate-600/85",
    pillClass: "bg-slate-700 text-white",
    buttonClass: "bg-slate-700 text-white hover:bg-slate-800",
    softClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  exclusive: {
    key: "exclusive",
    label: "Selection",
    iconKey: "sparkles",
    accentClass: "from-teal-900/95 via-emerald-800/90 to-emerald-600/85",
    pillClass: "bg-white text-emerald-800",
    buttonClass: "bg-emerald-600 text-white hover:bg-emerald-700",
    softClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

export const PROPERTY_PACK_TAB_ICON_OPTIONS: Array<{
  key: PropertyPackTabIconKey;
  label: string;
  themeKey: PropertyPackThemeKey;
}> = [
  { key: "home", label: "Famille", themeKey: "famille" },
  { key: "heart", label: "Romantique", themeKey: "romantique" },
  { key: "crown", label: "Luxe", themeKey: "luxe" },
  { key: "map", label: "Decouverte", themeKey: "decouverte" },
  { key: "briefcase", label: "Affaires", themeKey: "affaires" },
  { key: "sparkles", label: "Selection", themeKey: "exclusive" },
];

const normalizeToken = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const decodeScopedCategory = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw.startsWith("__scoped__::")) return raw;
  const payload = raw.slice("__scoped__::".length);
  const separatorIndex = payload.indexOf("::");
  if (separatorIndex <= 0) return raw;
  return payload.slice(separatorIndex + 2).trim() || raw;
};

const normalizeMainType = (value: string) => {
  const normalized = normalizeToken(value);
  if (normalized === "appartement" || normalized.includes("appartement") || normalized.startsWith("s+")) return "appartement";
  if (normalized === "residence" || normalized.includes("residence")) return "residence";
  if (normalized === "studio" || normalized.includes("studio")) return "studio";
  if (normalized.includes("villa") || normalized.includes("maison") || normalized.includes("bungalow")) return "villa_maison";
  return normalized;
};

const getSPlusValue = (value?: string | null): number | null => {
  const normalized = normalizeToken(String(value || ""));
  const direct = normalized.match(/s\+(\d+)/);
  if (direct?.[1]) return Number(direct[1]);
  const bedrooms = normalized.match(/(\d+)\s*ch/);
  if (bedrooms?.[1]) return Number(bedrooms[1]);
  return null;
};

const getPropertyMainType = (property: Property) =>
  normalizeMainType(String(property.category || "").trim() || String(property.residenceUnitSubType || "").trim() || "appartement");

const getPropertySubtypeScore = (property: Property) =>
  getSPlusValue(property.category)
  ?? getSPlusValue(property.title)
  ?? getSPlusValue(property.residenceUnitSubType)
  ?? Math.max(1, Number(property.bedrooms || 0));

const getCategoryMatchToken = (value?: string | null) => {
  const decoded = decodeScopedCategory(value);
  const sPlusValue = getSPlusValue(decoded);
  if (sPlusValue && sPlusValue > 0) return `s+${sPlusValue}`;
  return normalizeToken(decoded).replace(/[^a-z0-9+]+/g, " ").replace(/\s+/g, " ").trim();
};

const getPropertyCategoryTokens = (property: Property) => {
  const sourceValues = [
    property.filterProfile?.displayCategory,
    property.filterProfile?.subType,
    property.residenceUnitSubType,
    property.category,
    property.title,
  ];
  return Array.from(new Set(
    sourceValues
      .map((value) => getCategoryMatchToken(String(value || "")))
      .filter(Boolean)
  ));
};

const propertyMatchesCombinationRequest = (property: Property, request: PackCombinationRequest) => {
  const normalizedMainType = normalizeMainType(request.mainType);
  if (normalizedMainType && getPropertyMainType(property) !== normalizedMainType) return false;
  const requestToken = getCategoryMatchToken(request.label);
  if (!requestToken) return true;
  const propertyTokens = getPropertyCategoryTokens(property);
  return propertyTokens.some((token) => token === requestToken || token.includes(requestToken) || requestToken.includes(token));
};

const parsePackCombinationRequests = (params: URLSearchParams): PackCombinationRequest[] => {
  const raw = String(params.get("packCombos") || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        mainType: String(item?.mainType || "").trim(),
        label: String(item?.label || "").trim(),
        count: Math.max(0, Number(item?.count || 0) || 0),
      }))
      .filter((item) => item.mainType && item.label && item.count > 0);
  } catch {
    return [];
  }
};

const getPropertyLocationTokens = (property: Property) => {
  const hierarchy = property.filterProfile?.locationHierarchy;
  return [
    property.filterProfile?.locationLabel,
    hierarchy?.quartier,
    hierarchy?.region,
    hierarchy?.gouvernerat,
    property.location,
  ]
    .map((value) => normalizeToken(String(value || "")))
    .filter(Boolean);
};

const locationsMatch = (property: Property, locations: string[]) => {
  if (locations.length === 0) return true;
  const tokens = getPropertyLocationTokens(property);
  return locations.some((location) => {
    const selectedParts = String(location || "")
      .split("/")
      .map((item) => normalizeToken(item))
      .filter(Boolean);
    return selectedParts.every((part) => tokens.some((token) => token === part || token.includes(part) || part.includes(token)));
  });
};

export function buildPropertyPackPath(pack: Pick<PropertyPack, "id">) {
  return `/packs/${encodeURIComponent(String(pack.id || "").trim())}`;
}

export function getPackVariantParamValue(pack: { variantPropertyIds?: string[] }) {
  return (Array.isArray(pack.variantPropertyIds) ? pack.variantPropertyIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(",");
}

export function getPackSearchContextFromParams(params: URLSearchParams): PackSearchContext {
  const adultGuests = Math.max(1, Number(params.get("adultGuests") || 0) || 0);
  const childGuests = Math.max(0, Number(params.get("childGuests") || 0) || 0);
  const guestsMin = Math.max(
    Number(params.get("guestsMin") || 0) || 0,
    adultGuests + childGuests
  );
  return {
    checkIn: normalizeDateOnlyInput(params.get("checkIn") || ""),
    checkOut: normalizeDateOnlyInput(params.get("checkOut") || ""),
    guestsMin,
    locations: String(params.get("locations") || params.get("location") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    categories: String(params.get("categories") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    mainTypes: String(params.get("mainTypes") || params.get("mainType") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    comboRequests: parsePackCombinationRequests(params),
  };
}

export function formatPackCombinationRequestLabel(requests: PackCombinationRequest[]) {
  return requests
    .filter((request) => request.count > 0)
    .map((request) => `${request.count} x ${decodeScopedCategory(request.label)}`)
    .join(" + ");
}

export function getRequestedPackSubtypeScore(context: Pick<PackSearchContext, "categories" | "comboRequests">) {
  const comboRequestedScore = Array.isArray(context.comboRequests)
    ? context.comboRequests.reduce((sum, request) => {
      const requestValue = getSPlusValue(request.label) || 0;
      return sum + (requestValue > 0 ? requestValue * Math.max(0, Number(request.count || 0)) : 0);
    }, 0)
    : 0;
  if (comboRequestedScore > 0) return comboRequestedScore;
  return Math.max(
    0,
    ...((context.categories || []).map((value) => getSPlusValue(value) || 0))
  );
}

export function getRequestedPackSubtypeScores(context: Pick<PackSearchContext, "categories" | "comboRequests">) {
  if (Array.isArray(context.comboRequests) && context.comboRequests.length > 0) {
    const total = getRequestedPackSubtypeScore(context);
    return total > 0 ? [total] : [];
  }
  return Array.from(
    new Set(
      (context.categories || [])
        .map((value) => getSPlusValue(value) || 0)
        .filter((value) => value > 0)
    )
  ).sort((a, b) => a - b);
}

export function inferPropertyPackTheme(name?: string | null, description?: string | null): PropertyPackTheme {
  const haystack = normalizeToken(`${name || ""} ${description || ""}`);
  if (/(famille|family|kids|tribu|grand groupe)/.test(haystack)) return PACK_THEMES.famille;
  if (/(romantique|couple|honeymoon|lune de miel|love)/.test(haystack)) return PACK_THEMES.romantique;
  if (/(luxe|prestige|premium|vip|exclusive)/.test(haystack)) return PACK_THEMES.luxe;
  if (/(affaire|business|pro|travail|seminaire)/.test(haystack)) return PACK_THEMES.affaires;
  if (/(decouverte|exploration|escapade|sejour|weekend)/.test(haystack)) return PACK_THEMES.decouverte;
  return PACK_THEMES.exclusive;
}

function resolvePropertyPackTheme(pack: PropertyPack): PropertyPackTheme {
  const clientTab = pack.clientTab || null;
  if (clientTab?.iconKey) {
    const iconTheme = PROPERTY_PACK_TAB_ICON_OPTIONS.find((option) => option.key === clientTab.iconKey)?.themeKey || "exclusive";
    const baseTheme = PACK_THEMES[iconTheme];
    return {
      ...baseTheme,
      label: String(clientTab.label || "").trim() || baseTheme.label,
      iconKey: clientTab.iconKey,
      sourceTabId: String(clientTab.id || "").trim() || null,
    };
  }
  return inferPropertyPackTheme(pack.name, pack.description);
}

export function sortPropertyPackTabs(tabs: PropertyPackTab[]) {
  return [...tabs].sort((a, b) =>
    Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    || String(a.label || "").localeCompare(String(b.label || ""), "fr")
  );
}

function getNightlyPrice(property: Property) {
  return resolveCurrentPricing({
    defaultNightlyPrice: Number(property.pricePerNight || 0),
    defaultWeeklyPrice: Number(property.pricePerWeek || 0),
    pricingPeriods: property.pricingPeriods || [],
  }).nightlyPrice;
}

function getWeeklyPrice(property: Property) {
  const pricing = resolveCurrentPricing({
    defaultNightlyPrice: Number(property.pricePerNight || 0),
    defaultWeeklyPrice: Number(property.pricePerWeek || 0),
    pricingPeriods: property.pricingPeriods || [],
  });
  if (pricing.weeklyPrice > 0) return pricing.weeklyPrice;
  return pricing.nightlyPrice > 0 ? pricing.nightlyPrice * 7 : 0;
}

function getMinStay(property: Property) {
  return Math.max(1, Number(property.seasonalConfig?.dureeMinSejourNuits || property.filterProfile?.stayRules?.minStayNights || 1));
}

function buildLocationSummary(properties: Property[]) {
  const token = String(
    properties[0]?.filterProfile?.locationHierarchy?.quartier
      || properties[0]?.filterProfile?.locationHierarchy?.region
      || properties[0]?.filterProfile?.locationHierarchy?.gouvernerat
      || properties[0]?.location
      || ""
  ).trim();
  return token || "Tunisie";
}

function buildLocationPills(properties: Property[]) {
  const values = Array.from(
    new Set(
      properties.flatMap((property) => [
        property.filterProfile?.locationHierarchy?.quartier,
        property.filterProfile?.locationHierarchy?.region,
        property.filterProfile?.locationHierarchy?.gouvernerat,
        property.filterProfile?.locationLabel,
        property.location,
      ])
    )
  )
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return values.slice(0, 2);
}

function buildShortDescription(pack: PropertyPack, properties: Property[]) {
  const description = String(pack.description || "").trim();
  if (description) return description;
  const titles = properties.slice(0, 2).map((property) => String(property.title || "").trim()).filter(Boolean);
  if (titles.length === 0) return "Une composition de logements selectionnes pour simplifier le choix de vos clients.";
  return `${titles.join(" + ")}. Une combinaison de logements prete a etre proposee en un seul pack.`;
}

function buildPropertyLine(property: Property) {
  const reference = String(property.reference || "").trim();
  const typeLabel = String(property.filterProfile?.displayCategory || property.residenceUnitSubType || property.category || "Bien").trim();
  const bedrooms = Math.max(0, Number(property.bedrooms || 0));
  const bedroomLabel = bedrooms > 0 ? `${bedrooms} chambre${bedrooms > 1 ? "s" : ""}` : "configuration libre";
  return [reference, typeLabel, bedroomLabel].filter(Boolean).join(" - ");
}

function buildFeatureTags(properties: Property[], pack: PropertyPack) {
  const manual = Array.isArray(pack.highlightBullets) ? pack.highlightBullets.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const tags = new Set<string>();
  for (const item of manual) {
    const parts = item.split(/[•,;|]/).map((value) => value.trim()).filter(Boolean);
    parts.forEach((part) => {
      if (part.length <= 26) tags.add(part);
    });
  }
  for (const property of properties) {
    const distancePlage = Number(property.seasonalConfig?.distancePlageM ?? Number.NaN);
    const hasDistancePlage = Number.isFinite(distancePlage);
    if (
      (hasDistancePlage && distancePlage <= 50)
      || property.amenities.some((item) => /pied dans l'?eau|front de mer|bord de mer|acces direct plage/i.test(item))
    ) tags.add("Pied dans l'eau");
    if (property.seasonalConfig?.piscinePrivee || property.seasonalConfig?.piscinePartagee || property.amenities.some((item) => /piscine/i.test(item))) tags.add("Piscine");
    if (property.seasonalConfig?.vueMer || property.amenities.some((item) => /vue mer|mer/i.test(item))) tags.add("Vue mer");
    if (property.seasonalConfig?.terrasse || property.amenities.some((item) => /terrasse/i.test(item))) tags.add("Terrasse");
    if (property.seasonalConfig?.climatisation || property.amenities.some((item) => /clim/i.test(item))) tags.add("Climatisation");
  }
  return Array.from(tags).slice(0, 6);
}

function buildCommonAmenities(properties: Property[]) {
  const amenitySets = properties
    .map((property) => (property.amenities || []).map((item) => String(item || "").trim()).filter(Boolean))
    .filter((items) => items.length > 0);
  if (amenitySets.length === 0) return [];
  const [first, ...rest] = amenitySets;
  return first.filter((item) => rest.every((group) => group.includes(item))).slice(0, 6);
}

function buildHighlightItems(properties: Property[], commonAmenities: string[]) {
  const highlights: string[] = [];
  const totalGuests = properties.reduce((sum, property) => sum + Math.max(0, Number(property.guests || 0)), 0);
  if (properties.length > 1) highlights.push(`${properties.length} logements regroupes dans le meme pack`);
  if (totalGuests > 0) highlights.push(`Jusqu'a ${totalGuests} personnes`);
  if (properties.some((property) => property.seasonalConfig?.piscinePrivee || property.amenities.some((item) => /piscine/i.test(item)))) {
    highlights.push("Acces piscine sur au moins un logement");
  }
  if (properties.some((property) => property.seasonalConfig?.vueMer || property.amenities.some((item) => /mer|plage/i.test(item)))) {
    highlights.push("Selection avec mer ou plage a proximite");
  }
  if (properties.some((property) => property.amenities.some((item) => /parking/i.test(item)))) {
    highlights.push("Stationnement disponible");
  }
  if (commonAmenities.length > 0) highlights.push(`${commonAmenities.length} prestations communes dans le pack`);
  return highlights.slice(0, 5);
}

function buildSubsets<T>(values: T[]) {
  const capped = values.slice(0, 10);
  const subsets: T[][] = [];
  const total = 1 << capped.length;
  for (let mask = 1; mask < total; mask += 1) {
    const subset: T[] = [];
    for (let index = 0; index < capped.length; index += 1) {
      if (mask & (1 << index)) subset.push(capped[index]);
    }
    subsets.push(subset);
  }
  return subsets;
}

function buildSubsetKey(properties: Property[]) {
  return properties
    .map((property) => String(property.id || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "fr"))
    .join("__");
}

function choosePackVariants(properties: Property[], context: PackSearchContext) {
  if (properties.length < 2) {
    return {
      matchedPropertiesList: [] as Property[][],
      availabilityStatus: "unavailable" as PackAvailabilityStatus,
      matchedRequestedSubtypeScores: [] as number[],
    };
  }
  const allowedMainTypes = context.mainTypes.map(normalizeMainType).filter(Boolean);
  const comboRequests = Array.isArray(context.comboRequests) ? context.comboRequests.filter((item) => item.count > 0) : [];
  const requestedSubtypeScores = getRequestedPackSubtypeScores(context);
  const requestedSubtypeScore = getRequestedPackSubtypeScore(context);
  const requestedGuests = Math.max(0, Number(context.guestsMin || 0));
  const requestedUnitCount = comboRequests.reduce((sum, request) => sum + Math.max(0, Number(request.count || 0)), 0);
  const exactAvailable = properties.filter((property) => {
    if (!locationsMatch(property, context.locations)) return false;
    if (allowedMainTypes.length > 0 && !allowedMainTypes.includes(getPropertyMainType(property))) return false;
    if (!context.checkIn || !context.checkOut) return true;
    return resolveStayAvailability(property.unavailableDates || [], context.checkIn, context.checkOut).exactAvailable;
  });

  if (exactAvailable.length === 0) {
    return {
      matchedPropertiesList: [] as Property[][],
      availabilityStatus: "unavailable" as PackAvailabilityStatus,
      matchedRequestedSubtypeScores: [] as number[],
    };
  }

  const subsets = buildSubsets(exactAvailable);
  const scored = subsets
    .map((subset) => {
      const totalGuests = subset.reduce((sum, property) => sum + Math.max(0, Number(property.guests || 0)), 0);
      const subtypeTotal = subset.reduce((sum, property) => sum + Math.max(0, getPropertySubtypeScore(property) || 0), 0);
      const guestGap = requestedGuests > 0 && totalGuests < requestedGuests ? requestedGuests - totalGuests : 0;
      const subtypeGap = requestedSubtypeScore > 0 ? Math.abs(subtypeTotal - requestedSubtypeScore) : 0;
      const comboShortage = comboRequests.reduce((sum, request) => {
        const matchedCount = subset.filter((property) => propertyMatchesCombinationRequest(property, request)).length;
        return sum + Math.max(0, request.count - matchedCount);
      }, 0);
      const comboOverflow = comboRequests.reduce((sum, request) => {
        const matchedCount = subset.filter((property) => propertyMatchesCombinationRequest(property, request)).length;
        return sum + Math.max(0, matchedCount - request.count);
      }, 0);
      const comboGap = comboShortage + comboOverflow;
      const unitGap = requestedUnitCount > 0 ? Math.abs(subset.length - requestedUnitCount) : 0;
      const matchedRequestedSubtypeScore =
        requestedSubtypeScores.find((score) => score > 0 && subtypeTotal === score) || 0;
      return {
        subset,
        guestGap,
        subtypeGap,
        comboGap,
        unitGap,
        totalGuests,
        subtypeTotal,
        matchedRequestedSubtypeScore,
        unitCount: subset.length,
      };
    })
    .filter((item) => {
      if (item.subset.length < 2) return false;
      if (item.guestGap !== 0 || item.comboGap !== 0 || item.unitGap !== 0) return false;
      if (requestedSubtypeScores.length > 0 && item.matchedRequestedSubtypeScore <= 0) return false;
      if (requestedSubtypeScores.length === 0 && requestedSubtypeScore > 0 && item.subtypeTotal !== requestedSubtypeScore) return false;
      return true;
    })
    .sort((a, b) =>
      a.matchedRequestedSubtypeScore - b.matchedRequestedSubtypeScore
      || a.subtypeGap - b.subtypeGap
      || Math.abs(a.subtypeTotal - requestedSubtypeScore) - Math.abs(b.subtypeTotal - requestedSubtypeScore)
      || a.unitCount - b.unitCount
      || a.totalGuests - b.totalGuests
    );

  if (scored.length > 0) {
    const uniqueVariants = new Map<string, { subset: Property[]; matchedRequestedSubtypeScore: number }>();
    scored.forEach((item) => {
      const key = buildSubsetKey(item.subset);
      if (!key || uniqueVariants.has(key)) return;
      uniqueVariants.set(key, {
        subset: item.subset,
        matchedRequestedSubtypeScore: item.matchedRequestedSubtypeScore,
      });
    });
    return {
      matchedPropertiesList: Array.from(uniqueVariants.values()).map((item) => item.subset),
      availabilityStatus: "exact" as PackAvailabilityStatus,
      matchedRequestedSubtypeScores: Array.from(uniqueVariants.values()).map((item) => item.matchedRequestedSubtypeScore),
    };
  }

  if (!context.checkIn && !context.checkOut && requestedGuests === 0 && requestedSubtypeScore === 0 && allowedMainTypes.length === 0 && comboRequests.length === 0) {
    return {
      matchedPropertiesList: exactAvailable.length >= 2 ? [exactAvailable] : ([] as Property[][]),
      availabilityStatus: exactAvailable.length >= 2 ? ("exact" as PackAvailabilityStatus) : ("unavailable" as PackAvailabilityStatus),
      matchedRequestedSubtypeScores: exactAvailable.length >= 2 ? [0] : [],
    };
  }

  return {
    matchedPropertiesList: [] as Property[][],
    availabilityStatus: "unavailable" as PackAvailabilityStatus,
    matchedRequestedSubtypeScores: [] as number[],
  };
}

function buildSearchSummary(
  context: PackSearchContext,
  matchedProperties: Property[],
  availabilityStatus: PackAvailabilityStatus,
  matchedRequestedSubtypeScore = 0
) {
  const comboLabel = context.comboRequests.length > 0 ? formatPackCombinationRequestLabel(context.comboRequests) : "";
  const subtypeLabel = matchedRequestedSubtypeScore > 0 ? `S+${matchedRequestedSubtypeScore}` : "";
  if (!context.checkIn || !context.checkOut) {
    if (comboLabel && availabilityStatus === "exact") {
      return `${comboLabel} compose a partir des references du pack`;
    }
    if (subtypeLabel && availabilityStatus === "exact") {
      return `Combinaison ${subtypeLabel} composee a partir des references du pack`;
    }
    return null;
  }
  if (availabilityStatus === "exact") {
    return comboLabel
      ? `${comboLabel} disponible pour vos dates`
      : subtypeLabel
        ? `Combinaison ${subtypeLabel} disponible pour vos dates`
      : `${matchedProperties.length} reference(s) disponibles pour vos dates`;
  }
  if (availabilityStatus === "partial") {
    return `Composition partielle disponible pour vos dates`;
  }
  return comboLabel
    ? `Aucune combinaison disponible pour ${comboLabel}`
    : "Aucune composition disponible pour vos dates";
}

export function resolvePublicPropertyPacks(
  packs: PropertyPack[],
  properties: Property[],
  context?: PackSearchContext | null
): ResolvedPropertyPack[] {
  const propertiesById = new Map(properties.map((property) => [String(property.id || "").trim(), property]));
  const safeContext: PackSearchContext = context || {
    checkIn: "",
    checkOut: "",
    guestsMin: 0,
    locations: [],
    categories: [],
    mainTypes: [],
    comboRequests: [],
  };

  return packs
    .filter((pack) => pack?.isActive !== false)
    .flatMap((pack) => {
      const rootProperties = (Array.isArray(pack.bienIds) ? pack.bienIds : [])
        .map((id) => propertiesById.get(String(id || "").trim()))
        .filter((property): property is Property => Boolean(property));
      const variant = choosePackVariants(rootProperties, safeContext);
      const propertySets = variant.matchedPropertiesList.length > 0
        ? variant.matchedPropertiesList
        : (safeContext.checkIn || safeContext.checkOut || safeContext.categories.length > 0 || safeContext.comboRequests.length > 0 || safeContext.mainTypes.length > 0
          ? []
          : [rootProperties]);
      const preferredGalleryImages = Array.isArray(pack.galleryImages) && pack.galleryImages.length > 0 ? pack.galleryImages : [];
      const rootImages = rootProperties.flatMap((property) => property.images || []).filter(Boolean);
      return propertySets.map((matchedProperties, variantIndex) => {
        const matchedImages = matchedProperties.flatMap((property) => property.images || []).filter(Boolean);
        const commonAmenities = buildCommonAmenities(matchedProperties);
        const matchedReferences = matchedProperties
          .map((property) => String(property.reference || "").trim())
          .filter(Boolean);
        const variantPropertyIds = matchedProperties
          .map((property) => String(property.id || "").trim())
          .filter(Boolean);
        const variantKey = `${String(pack.id || "").trim()}::${buildSubsetKey(matchedProperties) || variantIndex}`;
        const matchedRequestedSubtypeScore = Number(variant.matchedRequestedSubtypeScores?.[variantIndex] || 0);
        return {
          ...pack,
          variantKey,
          variantPropertyIds,
          rootProperties,
          properties: matchedProperties,
          matchedProperties,
          rootPropertyCount: rootProperties.length,
          matchedSubtypeScore: matchedProperties.reduce((sum, property) => sum + Math.max(0, getPropertySubtypeScore(property) || 0), 0),
          matchedRequestedSubtypeScore,
          matchedReferences,
          coverImage: matchedImages[0] || preferredGalleryImages[0] || rootImages[0] || PROPERTY_PACK_FALLBACK_IMAGE,
          galleryImages: Array.from(new Set(
            matchedImages.length > 0
              ? matchedImages
              : (preferredGalleryImages.length > 0 ? preferredGalleryImages : rootImages)
          )).slice(0, 8),
          totalNightlyPrice: matchedProperties.reduce((sum, property) => sum + getNightlyPrice(property), 0),
          totalWeeklyPrice: matchedProperties.reduce((sum, property) => sum + getWeeklyPrice(property), 0),
          maxGuests: matchedProperties.reduce((sum, property) => sum + Math.max(0, Number(property.guests || 0)), 0),
          minStayNights: matchedProperties.reduce((max, property) => Math.max(max, getMinStay(property)), 1),
          locationSummary: buildLocationSummary(matchedProperties.length > 0 ? matchedProperties : rootProperties),
          shortDescription: buildShortDescription(pack, matchedProperties.length > 0 ? matchedProperties : rootProperties),
          commonAmenities,
          highlightItems: buildHighlightItems(matchedProperties.length > 0 ? matchedProperties : rootProperties, commonAmenities),
          locationPills: buildLocationPills(matchedProperties.length > 0 ? matchedProperties : rootProperties),
          propertyLines: (matchedProperties.length > 0 ? matchedProperties : rootProperties).map(buildPropertyLine).slice(0, 5),
          featureTags: buildFeatureTags(matchedProperties.length > 0 ? matchedProperties : rootProperties, pack),
          theme: resolvePropertyPackTheme(pack),
          availabilityStatus: variant.availabilityStatus,
          isSearchVariant: variant.availabilityStatus === "exact" && matchedProperties.length !== rootProperties.length,
          searchSummary: buildSearchSummary(
            safeContext,
            matchedProperties,
            variant.availabilityStatus,
            matchedRequestedSubtypeScore
          ),
        };
      });
    })
    .filter((pack) => {
      if (pack.rootProperties.length < 2) return false;
      if (pack.properties.length < 2) return false;
      if (safeContext.comboRequests.length > 0) return pack.availabilityStatus !== "unavailable";
      if (safeContext.categories.length > 0) return pack.availabilityStatus !== "unavailable";
      if (safeContext.checkIn && safeContext.checkOut) return pack.availabilityStatus !== "unavailable";
      return true;
    })
    .sort((a, b) => {
      const statusWeight = { exact: 0, partial: 1, unavailable: 2 };
      const requestedSubtypeScore = getRequestedPackSubtypeScore(safeContext);
      const subtypeDeltaA = requestedSubtypeScore > 0 ? Math.abs(a.matchedSubtypeScore - requestedSubtypeScore) : 0;
      const subtypeDeltaB = requestedSubtypeScore > 0 ? Math.abs(b.matchedSubtypeScore - requestedSubtypeScore) : 0;
      const guestDeltaA = safeContext.guestsMin > 0 ? Math.max(0, a.maxGuests - safeContext.guestsMin) : 0;
      const guestDeltaB = safeContext.guestsMin > 0 ? Math.max(0, b.maxGuests - safeContext.guestsMin) : 0;
      return statusWeight[a.availabilityStatus] - statusWeight[b.availabilityStatus]
        || subtypeDeltaA - subtypeDeltaB
        || guestDeltaA - guestDeltaB
        || a.properties.length - b.properties.length
        || a.totalNightlyPrice - b.totalNightlyPrice;
    });
}
