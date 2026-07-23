import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Check, MapPin, Search, SlidersHorizontal, Sparkles, Users, X, Waves, Wind, Percent, Coins, ChevronDown, ChevronUp, RotateCcw, Share2, Flame, ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isBefore, isSameDay, isSameMonth, isWithinInterval, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { useProperties } from "../context/PropertiesContext";
import { PropertyCard } from "../components/PropertyCard";
import { SmartImage } from "../components/SmartImage";
import type { Property } from "../data/properties";
import { getServiceDisplayPrice, normalizeServicePayant, type NormalizedServicePayant } from "../utils/servicePayants";
import ComingSoonState from "../components/ComingSoonState";
import { PUBLIC_COMING_SOON } from "../config/publicAvailability";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import {
  findBestStayRangeAlternative,
  hasBlockingUnavailableDates,
  getStayAvailabilityAlternativeLabel,
  isValidStayRange,
  resolveStayAvailability,
} from "../utils/availability";
import { getReservationMinStayRequirement, validateReservationWeekdayRule } from "../utils/seasonalPricing";
import { getPropertyFlashOffers, type PropertyFlashOffer } from "../utils/flashOffers";
import { fetchPartnerAgenciesPublic, findPartnerAgencyById, normalizePartnerAgencySlug } from "../utils/partnerAgencies";
import { fetchAmicalesPublic, findAmicaleById, normalizeAmicaleSlug } from "../utils/amicales";
import { resolvePublicPartnerBySlug } from "../utils/publicPartnerResolver";
import { getOrCreateTrackingSessionId, hasTrackingConsent } from "../utils/consent";
import { trackPublicClientInteraction } from "../utils/clientInteractions";
import { buildPropertyPackPath, formatPackCombinationRequestLabel, getPackSearchContextFromParams, getPackVariantParamValue, getRequestedPackSubtypeScore, resolvePublicPropertyPacks } from "../utils/propertyPacks";
import type { PropertyPack } from "../admin/types";

type ListingMode = "vente" | "location_annuelle" | "location_saisonniere";
type PropertyMainType = "appartement" | "residence" | "villa_maison" | "bungalow" | "studio" | "immeuble" | "autre";
type GroupedPropertySubType = {
  label: string;
  imageUrl: string;
  matchMainType?: PropertyMainType;
  residenceScoped?: boolean;
  selectionScope?: PropertyMainType;
};
type GroupedPropertyTypeOption = {
  mainType: PropertyMainType;
  label: string;
  imageUrl: string;
  subTypes: GroupedPropertySubType[];
};
type HomeSeasideOptionKey = "pied_dans_eau" | "vue_sur_mer" | "pres_plage";
type HomeComfortOptionKey =
  | "climatise"
  | "piscine_privee"
  | "piscine_partagee"
  | "rdc"
  | "premier_etage"
  | "toutes_pieces_climatisees"
  | "jardin_gazon"
  | "terrasse";
const SCOPED_CATEGORY_PREFIX = "__scoped__::";
const parseScopedCategoryMainType = (value?: string | null): PropertyMainType | "" => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "appartement" || raw === "residence" || raw === "villa_maison" || raw === "bungalow" || raw === "studio" || raw === "immeuble" || raw === "autre") {
    return raw;
  }
  return "";
};
const encodeScopedCategory = (mainType: PropertyMainType, value?: string | null) => {
  const raw = String(value || "").trim();
  return raw ? `${SCOPED_CATEGORY_PREFIX}${mainType}::${raw}` : "";
};
const getScopedCategoryMeta = (value?: string | null): { mainType: PropertyMainType; label: string } | null => {
  const raw = String(value || "").trim();
  if (!raw.startsWith(SCOPED_CATEGORY_PREFIX)) return null;
  const payload = raw.slice(SCOPED_CATEGORY_PREFIX.length);
  const separatorIndex = payload.indexOf("::");
  if (separatorIndex <= 0) return null;
  const mainType = parseScopedCategoryMainType(payload.slice(0, separatorIndex));
  const label = payload.slice(separatorIndex + 2).trim();
  if (!mainType || !label) return null;
  return { mainType, label };
};
const getScopedCategoryMainType = (value?: string | null): PropertyMainType | "" => getScopedCategoryMeta(value)?.mainType || "";
const decodeScopedCategory = (value?: string | null) => getScopedCategoryMeta(value)?.label || String(value || "").trim();
const getCategoryDisplayLabel = (value?: string | null) => decodeScopedCategory(value);
type PrimaryDisplayResult = {
  displayKey: string;
  property: Property;
  hints: string[];
  score: number;
  cardVariant: "default" | "flash";
  flashOffer: PropertyFlashOffer | null;
  flashOffers?: PropertyFlashOffer[];
  searchParams: string;
};

const MODE_TABS: Array<{ value: ListingMode; label: string }> = [
  { value: "location_saisonniere", label: "Location saisonniere" },
  { value: "location_annuelle", label: "Location annuelle" },
];

const STANDING_LABELS: Record<string, string> = {
  economique: "Economique",
  confort: "Confort",
  premium: "Premium",
  luxe: "Luxe",
};
const API_URL = import.meta.env.VITE_API_URL || "/api";
const SEASIDE_OPTION_LABELS: Record<HomeSeasideOptionKey, string> = {
  pied_dans_eau: "Pied dans l'eau",
  vue_sur_mer: "Vue sur mer",
  pres_plage: "Pres de la plage",
};
const COMFORT_OPTION_LABELS: Record<HomeComfortOptionKey, string> = {
  climatise: "Climatise",
  piscine_privee: "Piscine privee",
  piscine_partagee: "Piscine partagee",
  rdc: "RDC",
  premier_etage: "1er etage",
  toutes_pieces_climatisees: "Toutes les pieces climatisees",
  jardin_gazon: "Jardin / Gazon",
  terrasse: "Terrasse",
};
const SEASIDE_OPTION_KEYS: HomeSeasideOptionKey[] = ["pied_dans_eau", "vue_sur_mer", "pres_plage"];
const COMFORT_OPTION_KEYS: HomeComfortOptionKey[] = [
  "climatise",
  "toutes_pieces_climatisees",
  "rdc",
  "premier_etage",
  "jardin_gazon",
  "terrasse",
  "piscine_privee",
  "piscine_partagee",
];
const POOL_OPTION_KEYS: HomeComfortOptionKey[] = ["piscine_privee", "piscine_partagee"];
const ZONE_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23d1fae5'/%3E%3Cstop offset='100%25' stop-color='%23a7f3d0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='360' fill='url(%23g)'/%3E%3Cpath d='M0 260h640v100H0z' fill='%23059669' fill-opacity='0.16'/%3E%3C/svg%3E";
const TYPE_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Cdefs%3E%3ClinearGradient id='tg' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23ecfeff'/%3E%3Cstop offset='100%25' stop-color='%23cffafe'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='360' fill='url(%23tg)'/%3E%3Cpath d='M0 270h640v90H0z' fill='%230899b2' fill-opacity='0.16'/%3E%3C/svg%3E";
const MAIN_TYPE_LABELS: Record<PropertyMainType, string> = {
  appartement: "Appartement",
  residence: "Residence",
  villa_maison: "Villa / Maison",
  bungalow: "Bungalow",
  studio: "Studio",
  immeuble: "Immeuble",
  autre: "Autre",
};
const MAIN_TYPE_DISPLAY_ORDER: PropertyMainType[] = [
  "appartement",
  "residence",
  "villa_maison",
  "bungalow",
  "studio",
  "immeuble",
  "autre",
];

type FeatureApiRow = {
  id: string;
  nom: string;
  onglet_id?: string | null;
  onglet_nom?: string | null;
  visibilite_client?: number | null;
};
type FeatureTabApiRow = {
  id: string;
  nom: string;
  ordre?: number | null;
};

const normalizeFeatureName = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const getPropertyLocationValues = (property: any): string[] => {
  const hierarchy = property?.filterProfile?.locationHierarchy;
  return [
    property?.filterProfile?.locationLabel,
    hierarchy?.pays,
    hierarchy?.gouvernerat,
    hierarchy?.region,
    hierarchy?.quartier,
    property?.location,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
};

const getPropertyLocationHierarchyParts = (property: any): string[] => {
  const hierarchy = property?.filterProfile?.locationHierarchy;
  return [
    hierarchy?.pays,
    hierarchy?.gouvernerat,
    hierarchy?.region,
    hierarchy?.quartier || property?.filterProfile?.locationLabel || property?.location,
  ]
    .map((value) => normalizeFeatureName(value))
    .filter(Boolean)
    .filter((value, index, items) => items.indexOf(value) === index);
};

const hasExactLocationHierarchyMatch = (property: any, selectedParts: string[]) => {
  if (selectedParts.length === 0) return false;
  const hierarchyParts = getPropertyLocationHierarchyParts(property);
  if (hierarchyParts.length < selectedParts.length) return false;
  for (let start = 0; start <= hierarchyParts.length - selectedParts.length; start += 1) {
    const matchesWindow = selectedParts.every((part, index) => hierarchyParts[start + index] === part);
    if (matchesWindow) return true;
  }
  return false;
};

const propertyMatchesLocation = (
  property: any,
  selectedLocation: string
): { exact: boolean; partial: boolean } => {
  const selectedParts = String(selectedLocation || "")
    .split("/")
    .map((item) => normalizeFeatureName(item))
    .filter(Boolean);
  const normalizedSelected = selectedParts[selectedParts.length - 1] || normalizeFeatureName(selectedLocation);
  if (!normalizedSelected) return { exact: false, partial: false };

  const normalizedValues = Array.from(
    new Set(getPropertyLocationValues(property).map((value) => normalizeFeatureName(value)).filter(Boolean))
  );
  if (hasExactLocationHierarchyMatch(property, selectedParts)) {
    return { exact: true, partial: true };
  }
  if (normalizedValues.includes(normalizedSelected)) {
    return { exact: true, partial: true };
  }

  const selectedFirstToken = normalizedSelected.split(" ")[0] || "";
  const partial = normalizedValues.some((value) =>
    value.includes(normalizedSelected)
    || normalizedSelected.includes(value)
    || (selectedFirstToken ? value.includes(selectedFirstToken) : false)
  );
  return { exact: false, partial };
};

type StayRangeSelection = {
  start: string;
  end: string;
};

const parseCsvParam = (value: string | null) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseCategoriesParam = (value: string | null) => {
  const seen = new Set<string>();
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const areCanonicalStringArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const normalize = (items: string[]) =>
    items
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "fr"));
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const areStayRangesEqual = (left: StayRangeSelection[], right: StayRangeSelection[]) =>
  left.length === right.length
  && left.every((value, index) => value.start === right[index]?.start && value.end === right[index]?.end);

const dedupeSubTypeLabelsByCanonicalKey = (values: string[]) => {
  const byCanonical = new Map<string, string>();
  values.forEach((value) => {
    const label = String(value || "").trim();
    const canonical = getCanonicalSubTypeKey(label);
    if (!label || !canonical || byCanonical.has(canonical)) return;
    byCanonical.set(canonical, label);
  });
  return Array.from(byCanonical.values());
};

const parseStayRangesParam = (value: string | null): StayRangeSelection[] => {
  const parsed = String(value || "")
    .split(";")
    .map((item) => {
      const [start, end] = String(item || "").split("_");
      return {
        start: String(start || "").trim(),
        end: String(end || "").trim(),
      };
    })
    .filter((item) => item.start || item.end);
  return parsed;
};

const serializeStayRangesParam = (ranges: StayRangeSelection[]) =>
  ranges
    .map((range) => `${String(range.start || "").trim()}_${String(range.end || "").trim()}`)
    .filter((item) => item !== "_")
    .join(";");
const toggleStringInList = (items: string[], value: string) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
const buildHierarchicalLocationLabel = (parts: Array<string | null | undefined>) =>
  parts.map((item) => String(item || "").trim()).filter(Boolean).join(" / ");
const dedupeHierarchicalLocations = (values: string[]) => {
  const byNormalized = new Map<string, string>();
  for (const raw of values) {
    const item = String(raw || "").trim();
    if (!item) continue;
    byNormalized.set(item.toLowerCase(), item);
  }
  const unique = Array.from(byNormalized.values());
  return unique.filter((item) => {
    const token = item.toLowerCase();
    return !unique.some((other) => {
      if (other === item) return false;
      const otherParts = other.toLowerCase().split("/").map((part) => part.trim()).filter(Boolean);
      if (otherParts.length <= 1) return false;
      return token === otherParts[otherParts.length - 1];
    });
  });
};

const stayRangeContainsFlashOffer = (
  stayRange: StayRangeSelection,
  flashOffer: Pick<PropertyFlashOffer, "start" | "end">
) => (
  isValidStayRange(stayRange.start, stayRange.end)
  && flashOffer.start >= stayRange.start
  && flashOffer.end <= stayRange.end
);

const filterFlashOffersByStayRanges = (
  flashOffers: PropertyFlashOffer[],
  stayRanges: StayRangeSelection[],
  enabled: boolean
) => {
  if (!enabled) return flashOffers;
  const validStayRanges = stayRanges.filter((range) => isValidStayRange(range.start, range.end));
  if (validStayRanges.length === 0) return flashOffers;
  return flashOffers.filter((flashOffer) =>
    validStayRanges.some((stayRange) => stayRangeContainsFlashOffer(stayRange, flashOffer))
  );
};

const cleanFeatureTabName = (value: string) =>
  String(value || "")
    .replace(/^\s*\d+\s*[\.\-:)]\s*/g, "")
    .trim();

const isCharacteristicsTabName = (value: string) =>
  normalizeFeatureName(cleanFeatureTabName(value)).includes("caracteristique");

const getPaidServiceTypeMeta = (type: "fixe" | "sur_demande" | "a_partir_de") => {
  if (type === "sur_demande") {
    return { label: "Sur demande", className: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  if (type === "a_partir_de") {
    return { label: "A partir de", className: "border-sky-200 bg-sky-50 text-sky-700" };
  }
  return { label: "Prix fixe", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
};
const paidServiceCategoryImages = {
  arriveeDepart: new URL("../../../services_images_independantes/01_arrivee_et_depart.png", import.meta.url).href,
  transfert: new URL("../../../services_images_independantes/02_transfert_et_transport.png", import.meta.url).href,
  menage: new URL("../../../services_images_independantes/03_menage_et_entretien.png", import.meta.url).href,
  accueil: new URL("../../../services_images_independantes/04_packs_accueil_et_restauration.png", import.meta.url).href,
  famille: new URL("../../../services_images_independantes/05_famille_et_bebe.png", import.meta.url).href,
  linge: new URL("../../../services_images_independantes/06_linge_et_confort.png", import.meta.url).href,
  piscine: new URL("../../../services_images_independantes/07_piscine_plage_et_exterieur.png", import.meta.url).href,
  assistance: new URL("../../../services_images_independantes/08_conciergerie_et_assistance.png", import.meta.url).href,
  loisirs: new URL("../../../services_images_independantes/09_loisirs_et_activites.png", import.meta.url).href,
  proA: new URL("../../../services_images_independantes/10_services_professionnels_a.png", import.meta.url).href,
  premium: new URL("../../../services_images_independantes/15_experience_premium.png", import.meta.url).href,
} as const;
const getPaidServiceCategoryImage = (category: string) => {
  const normalized = normalizeFeatureName(category);
  if (normalized.includes("arrivee") || normalized.includes("check")) return paidServiceCategoryImages.arriveeDepart;
  if (normalized.includes("transport") || normalized.includes("transfert")) return paidServiceCategoryImages.transfert;
  if (normalized.includes("menage") || normalized.includes("entretien")) return paidServiceCategoryImages.menage;
  if (normalized.includes("accueil") || normalized.includes("restauration") || normalized.includes("boisson")) return paidServiceCategoryImages.accueil;
  if (normalized.includes("famille") || normalized.includes("bebe")) return paidServiceCategoryImages.famille;
  if (normalized.includes("linge")) return paidServiceCategoryImages.linge;
  if (normalized.includes("piscine") || normalized.includes("plage")) return paidServiceCategoryImages.piscine;
  if (normalized.includes("conciergerie") || normalized.includes("assistance")) return paidServiceCategoryImages.assistance;
  if (normalized.includes("loisir") || normalized.includes("activite")) return paidServiceCategoryImages.loisirs;
  if (normalized.includes("premium")) return paidServiceCategoryImages.premium;
  return paidServiceCategoryImages.proA;
};

const formatDateLabel = (value: string) => {
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(parsed);
};
const classifyDateRuleReason = (reason: string): "min_max" | "weekday" | "availability" | "other" | "none" => {
  const normalized = normalizeFeatureName(reason);
  if (!normalized) return "none";
  if (normalized.includes("sejour minimum") || normalized.includes("sejour maximum")) return "min_max";
  if (normalized.includes("check-in") || normalized.includes("check-out") || normalized.includes("regle de periode")) return "weekday";
  if (normalized.includes("dates non disponibles")) return "availability";
  return "other";
};
const formatDateAlternativeReason = (reason: string) => {
  const normalized = normalizeFeatureName(reason);
  const minMatch = normalized.match(/sejour minimum\s+(\d+)/);
  if (minMatch?.[1]) return `Demande de reserver un minimum = ${minMatch[1]} nuitee(s)`;
  const maxMatch = normalized.match(/sejour maximum\s+(\d+)/);
  if (maxMatch?.[1]) return `Demande de reserver un maximum = ${maxMatch[1]} nuitee(s)`;
  return reason || "Adapter selon les regles du bien";
};
const getSPlusValue = (value?: string | null): number | null => {
  const key = getCanonicalSubTypeKey(value);
  const match = key.match(/^s\+(\d+)$/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};
const extractSelectedLocationRegionZone = (value: string): { region: string; zone: string } => {
  const parts = String(value || "").split("/").map((item) => normalizeFeatureName(item)).filter(Boolean);
  if (parts.length >= 2) {
    return { region: parts[parts.length - 2], zone: parts[parts.length - 1] };
  }
  const single = parts[0] || normalizeFeatureName(value);
  return { region: single, zone: single };
};
const extractSelectedGovernorate = (value: string): string => {
  const parts = String(value || "").split("/").map((item) => normalizeFeatureName(item)).filter(Boolean);
  if (parts.length >= 2) return parts[0];
  return "";
};
const getPropertyRegionZone = (property: any): { region: string; zone: string } => {
  const h = property?.filterProfile?.locationHierarchy || {};
  const region = normalizeFeatureName(h?.region || h?.gouvernerat || h?.pays || property?.filterProfile?.locationLabel || property?.location || "");
  const zone = normalizeFeatureName(h?.quartier || h?.zone || property?.filterProfile?.locationLabel || property?.location || "");
  return { region, zone };
};
const groupRowsBySuccessiveZone = <T extends { property: any }>(rows: T[]): T[] => {
  const groups = new Map<string, T[]>();
  const orderedKeys: string[] = [];
  rows.forEach((row) => {
    const { region, zone } = getPropertyRegionZone(row.property);
    const groupKey = zone || region || `unknown-${orderedKeys.length}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      orderedKeys.push(groupKey);
    }
    groups.get(groupKey)?.push(row);
  });
  return orderedKeys.flatMap((key) => groups.get(key) || []);
};
const getPropertyGovernorate = (property: any): string => {
  const h = property?.filterProfile?.locationHierarchy || {};
  return normalizeFeatureName(h?.gouvernerat || "");
};

const getMainTypeFromCategory = (category: string): PropertyMainType => {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized.includes("appartement")) return "appartement";
  if (normalized.includes("residence")) return "residence";
  if (normalized.startsWith("s+")) return "appartement";
  if (normalized.includes("bungalow")) return "bungalow";
  if (normalized.includes("villa")) return "villa_maison";
  if (normalized.includes("maison")) return "villa_maison";
  if (normalized.includes("studio")) return "studio";
  if (normalized.includes("immeuble")) return "immeuble";
  return "autre";
};
const getCanonicalSubTypeKey = (value?: string | null) => {
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
  return raw.replace(/\s+/g, " ");
};
const hasExplicitMainTypeInLabel = (value?: string | null) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  return (
    normalized.includes("appartement")
    || normalized.includes("residence")
    || normalized.includes("villa")
    || normalized.includes("maison")
    || normalized.includes("bungalow")
    || normalized.includes("studio")
    || normalized.includes("immeuble")
  );
};
const getNormalizedMainTypeForMatchKey = (value?: string | null): PropertyMainType | "" => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "appartement" || raw === "residence" || raw === "villa_maison" || raw === "bungalow" || raw === "studio" || raw === "immeuble" || raw === "autre") {
    return raw;
  }
  return getMainTypeFromCategory(raw);
};
const buildMainTypeSubTypeMatchKey = (mainType: PropertyMainType | string | null | undefined, value?: string | null) => {
  const raw = String(value || "").trim();
  const subTypeKey = getCanonicalSubTypeKey(raw);
  if (!subTypeKey) return "";
  const normalizedMainType = getNormalizedMainTypeForMatchKey(mainType);
  if (!normalizedMainType) return "";
  return `${normalizedMainType}::${subTypeKey}`;
};
const getMainTypeSubTypeMatchKey = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const mainType = getMainTypeFromCategory(raw);
  return buildMainTypeSubTypeMatchKey(mainType, raw);
};
const resolveScopedCategoryMatchMainType = (scopedMainType: PropertyMainType, label: string): PropertyMainType => (
  scopedMainType === "residence" && hasExplicitMainTypeInLabel(label)
    ? getMainTypeFromCategory(label)
    : scopedMainType
);
const getSelectedSubTypeMatchKeys = (value: string, selectedMainTypes: PropertyMainType[]) => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const scopedCategory = getScopedCategoryMeta(raw);
  if (scopedCategory) {
    const key = buildMainTypeSubTypeMatchKey(
      resolveScopedCategoryMatchMainType(scopedCategory.mainType, scopedCategory.label),
      scopedCategory.label
    );
    return key ? [key] : [];
  }
  const displayLabel = getCategoryDisplayLabel(raw);
  if (hasExplicitMainTypeInLabel(displayLabel) || selectedMainTypes.length === 0) {
    const key = getMainTypeSubTypeMatchKey(displayLabel);
    return key ? [key] : [];
  }
  return Array.from(new Set(
    selectedMainTypes
      .map((mainType) => buildMainTypeSubTypeMatchKey(mainType, displayLabel))
      .filter(Boolean)
  ));
};
const normalizeResidenceExclusiveMainTypes = (
  mainTypes: PropertyMainType[],
  preferredMainType?: PropertyMainType | "",
) => {
  void preferredMainType;
  return Array.from(new Set(mainTypes.filter(Boolean)));
};
const isResidenceGroupedProperty = (property: any) =>
  Boolean(String(property?.residenceName || property?.filterProfile?.residenceName || "").trim());
const getGroupedSubTypeMatchKey = (
  groupMainType: PropertyMainType,
  subType: GroupedPropertySubType
) => buildMainTypeSubTypeMatchKey(
  subType.residenceScoped
    ? resolveScopedCategoryMatchMainType(subType.matchMainType || groupMainType, subType.label)
    : (subType.matchMainType || groupMainType),
  subType.label
);
const getGroupedSubTypeSelectionScope = (
  groupMainType: PropertyMainType,
  subType: GroupedPropertySubType
): PropertyMainType => subType.selectionScope || (subType.residenceScoped ? "residence" : (subType.matchMainType || groupMainType));
const getGroupedSubTypeOptionKey = (
  groupMainType: PropertyMainType,
  subType: GroupedPropertySubType
) => encodeScopedCategory(getGroupedSubTypeSelectionScope(groupMainType, subType), subType.label);
const propertyMatchesSelectedMainTypes = (
  selectedMainTypes: PropertyMainType[],
  propertyMainType: PropertyMainType,
  property: any
) => {
  if (selectedMainTypes.length === 0) return true;
  if (selectedMainTypes.includes(propertyMainType)) return true;
  return selectedMainTypes.includes("residence") && isResidenceGroupedProperty(property);
};
const propertyMatchesSelectedSubTypes = ({
  selectedMainTypes,
  selectedSubTypeKeys,
  selectedSubTypeMatchKeys,
  property,
  propertySubTypeKey,
  propertySubTypeMatchKey,
}: {
  selectedMainTypes: PropertyMainType[];
  selectedSubTypeKeys: string[];
  selectedSubTypeMatchKeys: string[];
  property: any;
  propertySubTypeKey: string;
  propertySubTypeMatchKey: string;
}) => {
  if (selectedSubTypeKeys.length === 0 && selectedSubTypeMatchKeys.length === 0) return true;
  if (selectedSubTypeMatchKeys.includes(propertySubTypeMatchKey)) return true;
  return selectedMainTypes.includes("residence")
    && isResidenceGroupedProperty(property)
    && selectedSubTypeKeys.includes(propertySubTypeKey);
};
const isGenericPropertySubtype = (label?: string | null) => {
  const normalized = String(label || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ["appartement", "residence", "villa", "maison", "villa maison", "bungalow"].includes(normalized);
};
const isInvalidPropertySubtype = (label?: string | null) => {
  const raw = String(label || "").trim();
  if (!raw) return true;
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.includes("s+?") || /\bs\s*\+\s*\?/i.test(raw) || normalized.includes("?")) return true;
  const canonical = getCanonicalSubTypeKey(raw);
  if (!canonical) return true;
  return false;
};
const getResolvedPropertyCategoryLabel = (property: any): string => {
  const rawMainType = String(property?.filterProfile?.mainType || "").trim();
  const rawSubType = String(property?.filterProfile?.subType || "").trim();
  const rawDisplayCategory = String(property?.filterProfile?.displayCategory || "").trim();
  if (rawMainType) {
    const resolvedMainType = getNormalizedMainTypeForMatchKey(rawMainType) || getMainTypeFromCategory(rawMainType);
    const mainLabelByType: Record<PropertyMainType, string> = {
      appartement: "Appartement",
      residence: "Residence",
      villa_maison: "Villa / Maison",
      bungalow: "Bungalow",
      studio: "Studio",
      immeuble: "Immeuble",
      autre: "Autre",
    };
    const mainLabel = mainLabelByType[resolvedMainType];
    if (rawSubType) {
      return hasExplicitMainTypeInLabel(rawSubType) ? rawSubType : `${mainLabel} ${rawSubType}`.trim();
    }
    if (rawDisplayCategory) return rawDisplayCategory;
    return mainLabel;
  }
  const rawCategory = String(rawDisplayCategory || property?.category || "").trim();
  const title = String(property?.title || "").trim();
  const titleSPlus = title.match(/s\+\d+/i)?.[0]?.toUpperCase() || "";
  const rawSPlus = rawSubType.match(/s\+\d+/i)?.[0]?.toUpperCase() || rawCategory.match(/s\+\d+/i)?.[0]?.toUpperCase() || "";
  const resolvedSPlus = rawSPlus || titleSPlus;
  const bedrooms = Number(property?.bedrooms || 0);
  const normalizedCategory = rawCategory.toLowerCase().replace(/\s+/g, " ");
  const hasUnknownSPlus = /\bs\+\s*\?/i.test(rawCategory) || normalizedCategory.includes("s+?");
  const inferredMainType = getMainTypeFromCategory(rawCategory || title);
  const normalizedPlainCategory = rawCategory
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const isGenericMainCategory = [
    "appartement",
    "villa",
    "maison",
    "villa maison",
    "bungalow",
  ].includes(normalizedPlainCategory);
  const shouldInferSPlusSubtype = inferredMainType === "appartement" || inferredMainType === "residence" || inferredMainType === "villa_maison" || inferredMainType === "bungalow";
  const mainLabelByType: Record<PropertyMainType, string> = {
    appartement: "Appartement",
    residence: "Residence",
    villa_maison: normalizedPlainCategory.includes("maison") && !normalizedPlainCategory.includes("villa") ? "Maison" : "Villa",
    bungalow: "Bungalow",
    studio: "Studio",
    immeuble: "Immeuble",
    autre: "Autre",
  };
  const mainLabel = mainLabelByType[inferredMainType];

  if ((hasUnknownSPlus || isGenericMainCategory) && shouldInferSPlusSubtype) {
    if (resolvedSPlus) return `${mainLabel} ${resolvedSPlus}`;
    if (Number.isFinite(bedrooms) && bedrooms > 0) return `${mainLabel} S+${Math.max(1, Math.floor(bedrooms))}`;
  }
  if (hasUnknownSPlus) {
    if (resolvedSPlus) return `${mainLabel} ${resolvedSPlus}`;
    if (Number.isFinite(bedrooms) && bedrooms > 0) return `${mainLabel} S+${Math.max(1, Math.floor(bedrooms))}`;
  }
  if (rawCategory) return rawCategory;
  if (resolvedSPlus && shouldInferSPlusSubtype) return `${mainLabel} ${resolvedSPlus}`;
  if (Number.isFinite(bedrooms) && bedrooms > 0 && shouldInferSPlusSubtype) return `${mainLabel} S+${Math.max(1, Math.floor(bedrooms))}`;
  return "";
};
const normalizeTypeToken = (value?: string | null) => String(value || "").trim().toLowerCase();
const getPropertyFloorRaw = (property: any) =>
  String(
    property?.seasonalConfig?.etage
    ?? property?.etage
    ?? property?.filterProfile?.etage
    ?? ""
  )
    .trim()
    .toLowerCase();

const propertyMatchesSeasideOption = (property: any, option: HomeSeasideOptionKey) => {
  const textBlob = normalizeFeatureName(
    [
      property?.title,
      property?.description,
      property?.location,
      property?.category,
      ...(Array.isArray(property?.amenities) ? property.amenities : []),
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ")
  );
  const hasAny = (...tokens: string[]) => tokens.some((token) => textBlob.includes(normalizeFeatureName(token)));
  const sc = property?.seasonalConfig || {};
  const distancePlage = Number(sc?.distancePlageM ?? Number.NaN);
  const hasDistance = Number.isFinite(distancePlage);
  if (option === "pied_dans_eau") {
    return hasDistance
      ? distancePlage <= 50
      : (
        (Boolean(sc?.vueMer) && hasAny("front de mer", "bord de mer", "acces direct plage"))
        || hasAny("pied dans l eau", "front de mer", "bord de mer", "acces direct plage")
      );
  }
  if (option === "vue_sur_mer") return sc?.vue === "mer" || Boolean(sc?.vueMer) || hasAny("vue sur mer", "vue mer");
  if (option === "pres_plage") {
    return hasDistance
      ? distancePlage <= 300
      : Boolean(sc?.prochePlage) || hasAny("proche plage", "pres de la plage", "a quelques pas de la plage");
  }
  return false;
};

const propertyMatchesComfortOption = (property: any, option: HomeComfortOptionKey) => {
  const textBlob = normalizeFeatureName(
    [
      property?.title,
      property?.description,
      property?.location,
      property?.category,
      ...(Array.isArray(property?.amenities) ? property.amenities : []),
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ")
  );
  const hasAny = (...tokens: string[]) => tokens.some((token) => textBlob.includes(normalizeFeatureName(token)));
  const structuredValues = [
    ...(Array.isArray(property?.caracteristiques) ? property.caracteristiques : []),
    ...Object.values(property?.caracteristique_valeurs || {}).flatMap((value) =>
      Array.isArray(value) ? value : [value]
    ),
  ].map((value) => normalizeFeatureName(String(value || "")));
  const hasStructuredAny = (...tokens: string[]) =>
    tokens.some((token) => structuredValues.some((value) => value.includes(normalizeFeatureName(token))));
  const sc = property?.seasonalConfig || {};
  const exterieur = Array.isArray(sc?.exterieurJardin) ? sc.exterieurJardin.map((item: string) => normalizeFeatureName(item)) : [];
  const interieur = Array.isArray(sc?.confortEquipementsInterieurs) ? sc.confortEquipementsInterieurs.map((item: string) => normalizeFeatureName(item)) : [];
  const hasExteriorAny = (...tokens: string[]) => tokens.some((token) => exterieur.some((value: string) => value.includes(normalizeFeatureName(token))));
  const hasInteriorAny = (...tokens: string[]) => tokens.some((token) => interieur.some((value: string) => value.includes(normalizeFeatureName(token))));
  const hasPrivatePool = Boolean(sc?.piscinePrivee) || hasExteriorAny("piscine privee", "piscine privée");
  const hasSharedPool = Boolean(sc?.piscinePartagee) || hasExteriorAny(
    "piscine partagee",
    "piscine partagée",
    "piscine commune",
    "piscine collective",
    "piscine residence",
    "piscine résidence",
    "en residence",
    "en résidence"
  );
  if (option === "climatise") return Boolean(sc?.climatisation) || hasInteriorAny("climatise", "climatisation") || hasAny("climatise", "climatisation");
  if (option === "toutes_pieces_climatisees") {
    return hasInteriorAny("toutes les pieces climatisees", "toutes pieces climatisees")
      || hasAny(
      "toutes les pieces climatisees",
      "toutes pieces climatisees",
      "climatisation complete",
      "climatisation dans toutes les pieces"
    );
  }
  if (option === "piscine_privee") {
    return hasPrivatePool;
  }
  if (option === "piscine_partagee") {
    return hasSharedPool;
  }
  if (option === "rdc") {
    const etageRaw = getPropertyFloorRaw(property);
    return etageRaw === "rdc" || etageRaw === "0";
  }
  if (option === "premier_etage") {
    const etageRaw = getPropertyFloorRaw(property);
    return etageRaw === "1"
      || etageRaw === "1er"
      || etageRaw === "1er etage"
      || etageRaw === "1er étage"
      || hasAny("1er etage", "1er étage", "premier etage", "premier étage", "1st floor");
  }
  if (option === "jardin_gazon") return hasExteriorAny("jardin", "gazon", "pelouse", "espace vert") || hasAny("jardin", "gazon", "pelouse", "espace vert");
  if (option === "terrasse") return Boolean(sc?.terrasse) || hasExteriorAny("terrasse") || hasAny("terrasse");
  return false;
};

const evaluatePropertyStayBookability = (property: any, startRaw: string, endRaw: string) => {
  if (!isValidStayRange(startRaw, endRaw)) {
    return { ok: false, reason: "Plage de sejour invalide." };
  }

  const stayRules = property?.filterProfile?.stayRules || null;
  const seasonalConfig = property?.seasonalConfig || {};
  const minStay = Math.max(1, Number(stayRules?.minStayNights || seasonalConfig?.dureeMinSejourNuits || 1));
  const maxStay = Math.max(minStay, Number(stayRules?.maxStayNights || seasonalConfig?.dureeMaxSejourNuits || 365));
  const start = new Date(`${startRaw}T00:00:00`);
  const end = new Date(`${endRaw}T00:00:00`);
  const nights = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));

  const stayAvailability = resolveStayAvailability(stayRules?.unavailableDates || property?.unavailableDates || [], startRaw, endRaw);
  if (!stayAvailability.exactAvailable) {
    return { ok: false, reason: "Dates non disponibles." };
  }

  // For search exact-match classification, do not downgrade a property only because
  // the selected stay is below the minimum-night rule. Reservation pages still enforce it.
  if (nights > maxStay) {
    return { ok: false, reason: `Sejour maximum ${maxStay} nuit(s).` };
  }

  const weekdayRuleCheck = validateReservationWeekdayRule({
    startDate: startRaw,
    endDate: endRaw,
    periods: stayRules?.pricingPeriods || property?.pricingPeriods || [],
  });
  if (!weekdayRuleCheck.ok) {
    const detail = [
      weekdayRuleCheck.requiredCheckinDay ? `check-in ${weekdayRuleCheck.requiredCheckinDay}` : null,
      weekdayRuleCheck.requiredCheckoutDay ? `check-out ${weekdayRuleCheck.requiredCheckoutDay}` : null,
    ].filter(Boolean).join(" | ");
    return { ok: false, reason: detail ? `Regle de periode: ${detail}.` : "Regle de reservation non respectee." };
  }

  return { ok: true, reason: "" };
};

const isPropertyStayRangeCalendarAvailable = (property: any, startRaw: string, endRaw: string) => {
  if (!isValidStayRange(startRaw, endRaw)) return false;
  const stayRules = property?.filterProfile?.stayRules || null;
  const stayAvailability = resolveStayAvailability(stayRules?.unavailableDates || property?.unavailableDates || [], startRaw, endRaw);
  return stayAvailability.exactAvailable;
};

const getPropertyDisplayVariantForStayRanges = (
  property: Property,
  ranges: Array<{ start: string; end: string }>
): Property | null => {
  const variants = Array.isArray(property.residenceGroupedVariants) ? property.residenceGroupedVariants : [];
  if (variants.length === 0 || ranges.length === 0) return null;

  const matchingVariant = variants.find((variant) =>
    ranges.every((range) => !hasBlockingUnavailableDates(variant.unavailableDates || [], range.start, range.end))
  );
  if (!matchingVariant) return null;

  return {
    ...property,
    id: matchingVariant.id,
    reference: matchingVariant.reference || property.reference,
    slug: matchingVariant.slug || property.slug,
    detailPath: matchingVariant.detailPath || property.detailPath,
    unavailableDates: matchingVariant.unavailableDates || property.unavailableDates,
    images: Array.isArray(matchingVariant.images) && matchingVariant.images.length > 0 ? matchingVariant.images : property.images,
  };
};

export default function PropertiesPage() {
  const PAGE_SIZE = 10;
  const { properties, biens, zones, modePriorities, loading } = useProperties();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ListingMode>("location_saisonniere");
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);
  const filtersAnchorRef = useRef<HTMLDivElement | null>(null);
  const alternativesAnchorRef = useRef<HTMLDivElement | null>(null);
  const trackedSearchFiltersSignatureRef = useRef("");
  const trackedSearchResultsSignatureRef = useRef("");
  const [modeFeaturesByType, setModeFeaturesByType] = useState<Record<string, FeatureApiRow[]>>({});
  const [modeFeatureTabsByType, setModeFeatureTabsByType] = useState<Record<string, FeatureTabApiRow[]>>({});
  const [typeFilterImageRows, setTypeFilterImageRows] = useState<Array<{ mode_bien: string; main_type: string; sub_type: string | null; image_url: string }>>([]);
  const [homeFilterOptionImageRows, setHomeFilterOptionImageRows] = useState<Array<{ mode_bien: string; filter_group: string; option_key: string; image_url: string }>>([]);
  const [publicPartnerSlug, setPublicPartnerSlug] = useState<string | null>(null);
  const [resolvedPricingAmicaleId, setResolvedPricingAmicaleId] = useState<string | null>(null);
  const [resolvedPartnerAgencyMarginMultiplier, setResolvedPartnerAgencyMarginMultiplier] = useState<number | null>(null);
  const trackingChannel = useMemo(() => {
    const partnerQuery = String(searchParams.get("partner") || searchParams.get("partnerAgencyId") || searchParams.get("partner_agency_id") || searchParams.get("publicPartnerSlug") || "").trim();
    if (partnerQuery || publicPartnerSlug) return "partner" as const;
    const amicaleQuery = String(searchParams.get("amicale") || searchParams.get("amicaleId") || searchParams.get("pricingAmicaleId") || searchParams.get("pricing_amicale_id") || "").trim();
    if (amicaleQuery || resolvedPricingAmicaleId) return "amicale" as const;
    return "direct" as const;
  }, [publicPartnerSlug, resolvedPricingAmicaleId, searchParams]);

  const orderedModeTabs = useMemo(
    () =>
      [...MODE_TABS].sort(
        (a, b) => (modePriorities[a.value] || 99) - (modePriorities[b.value] || 99)
      ),
    [modePriorities]
  );
  const resolveZoneImageUrl = (url?: string | null) => {
    const value = String(url || "").trim();
    if (!value) return ZONE_FALLBACK_IMAGE;
    if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
    return `${window.location.origin}${value.startsWith("/") ? value : `/${value}`}`;
  };
  const resolveTypeImageUrl = (url?: string | null) => {
    const value = String(url || "").trim();
    if (!value) return TYPE_FALLBACK_IMAGE;
    if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
    return `${window.location.origin}${value.startsWith("/") ? value : `/${value}`}`;
  };
  const getHomeFilterOptionImage = (group: "seaside" | "comfort", key: string): string | null => {
    const row = homeFilterOptionImageRows.find(
      (item) =>
        String(item.mode_bien || "").trim() === selectedMode
        && String(item.filter_group || "").trim() === group
        && String(item.option_key || "").trim() === key
        && String(item.image_url || "").trim()
    );
    return row?.image_url || null;
  };

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    parseCsvParam(searchParams.get("locations") || searchParams.get("location"))
  );
  const initialStayRanges = parseStayRangesParam(searchParams.get("stayRanges"));
  const [stayRanges, setStayRanges] = useState<StayRangeSelection[]>(
    initialStayRanges.length > 0
      ? initialStayRanges
      : [{
          start: searchParams.get("checkIn") || "",
          end: searchParams.get("checkOut") || "",
        }]
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    parseCategoriesParam(searchParams.get("categories"))
  );
  const [selectedMainTypes, setSelectedMainTypes] = useState<PropertyMainType[]>(
    parseCsvParam(searchParams.get("mainTypes") || searchParams.get("mainType")) as PropertyMainType[]
  );
  const [selectedFeatureNames, setSelectedFeatureNames] = useState<string[]>(
    () => searchParams.get("features")?.split(",").map((item) => item.trim()).filter(Boolean) || []
  );
  const [minDoubleRooms, setMinDoubleRooms] = useState(parseInt(searchParams.get("doubleRoomsMin") || "0", 10));
  const [minParentRooms, setMinParentRooms] = useState(parseInt(searchParams.get("parentRoomsMin") || "0", 10));
  const [minSimpleRooms, setMinSimpleRooms] = useState(parseInt(searchParams.get("simpleRoomsMin") || "0", 10));
  const [minBathroomsCount, setMinBathroomsCount] = useState(parseInt(searchParams.get("bathroomsMin") || "0", 10));
  const [minClimatizedRooms, setMinClimatizedRooms] = useState(parseInt(searchParams.get("climatizedRoomsMin") || "0", 10));
  const [expandedFeatureTabs, setExpandedFeatureTabs] = useState<string[]>([]);
  const [selectedCharacteristicsCategory, setSelectedCharacteristicsCategory] = useState("");
  const [activeCharacteristicsCategoryModal, setActiveCharacteristicsCategoryModal] = useState("");
  const [selectedPaidServices, setSelectedPaidServices] = useState<string[]>(
    searchParams.get("paidServices")?.split(",").map((item) => item.trim()).filter(Boolean) || []
  );
  const [showPaidServicesModal, setShowPaidServicesModal] = useState(false);
  const [selectedPaidServiceCategory, setSelectedPaidServiceCategory] = useState("");
  const [selectedPaidServiceTypeFilter, setSelectedPaidServiceTypeFilter] = useState<"all" | "fixe" | "sur_demande" | "a_partir_de">("all");
  const [selectedSeasideOptions, setSelectedSeasideOptions] = useState<HomeSeasideOptionKey[]>(
    searchParams.get("seaside")?.split(",").map((item) => item.trim()).filter(Boolean) as HomeSeasideOptionKey[] || []
  );
  const [selectedComfortOptions, setSelectedComfortOptions] = useState<HomeComfortOptionKey[]>(
    searchParams.get("comfort")?.split(",").map((item) => item.trim()).filter(Boolean) as HomeComfortOptionKey[] || []
  );
  const [selectedStanding, setSelectedStanding] = useState(searchParams.get("standing") || "");
  const [minGuests, setMinGuests] = useState(parseInt(searchParams.get("guestsMin") || "1", 10));
  const [isFeaturedOnly, setIsFeaturedOnly] = useState(searchParams.get("featured") === "true");
  const [priceMax, setPriceMax] = useState(parseInt(searchParams.get("maxPrice") || "1650", 10));
  const [smartTolerance, setSmartTolerance] = useState(parseInt(searchParams.get("tolerance") || "75", 10));
  const [sortMode, setSortMode] = useState<"matching" | "price" | "featured">(
    (String(searchParams.get("sort") || "matching").trim() as "matching" | "price" | "featured")
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [propertyPacks, setPropertyPacks] = useState<PropertyPack[]>([]);
  const [showAllResults, setShowAllResults] = useState(false);
  const resultsAutoLoadTriggerRef = useRef<HTMLDivElement | null>(null);
  const lastAutoLoadedResultsCountRef = useRef(0);
  const isAnnualComingSoon = PUBLIC_COMING_SOON.locationAnnuelle && selectedMode === "location_annuelle";
  const primaryStayRange = stayRanges[0] || { start: "", end: "" };
  const checkIn = primaryStayRange.start;
  const checkOut = primaryStayRange.end;
  const today = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [calendarCheckIn, setCalendarCheckIn] = useState<Date | null>(checkIn ? parseISO(checkIn) : null);
  const [calendarCheckOut, setCalendarCheckOut] = useState<Date | null>(checkOut ? parseISO(checkOut) : null);
  const [draftStayRanges, setDraftStayRanges] = useState<StayRangeSelection[]>(stayRanges.filter((range) => range.start && range.end));
  const [locationPays, setLocationPays] = useState("Tunisie");
  const [locationGouvernerat, setLocationGouvernerat] = useState("");
  const [locationRegion, setLocationRegion] = useState("");
  const [locationZone, setLocationZone] = useState("");
  const [locationSelectionStep, setLocationSelectionStep] = useState<"gouvernerat" | "region" | "zone">("gouvernerat");
  const [draftSelectedLocations, setDraftSelectedLocations] = useState<string[]>([]);
  const [draftSelectedGouvernerats, setDraftSelectedGouvernerats] = useState<string[]>([]);
  const [draftSelectedRegions, setDraftSelectedRegions] = useState<string[]>([]);
  const [draftSelectedZones, setDraftSelectedZones] = useState<string[]>([]);
  const [typeSelectionStep, setTypeSelectionStep] = useState<"main" | "sub">("main");
  const [draftMainType, setDraftMainType] = useState<PropertyMainType | "">("");
  const [draftSelectedMainTypes, setDraftSelectedMainTypes] = useState<PropertyMainType[]>([]);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/property-packs`);
        if (!response.ok) throw new Error("property-packs");
        const rows = await response.json();
        if (!cancelled) setPropertyPacks(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setPropertyPacks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const requestedMode = searchParams.get("mode");
    if (requestedMode === "location_annuelle" || requestedMode === "location_saisonniere") {
      setSelectedMode(requestedMode);
      return;
    }
    const defaultMode = orderedModeTabs[0]?.value || "location_saisonniere";
    setSelectedMode(defaultMode);
    const params = new URLSearchParams(searchParams);
    params.set("mode", defaultMode);
    setSearchParams(params, { replace: true });
  }, [loading, orderedModeTabs, searchParams, setSearchParams]);
  useEffect(() => {
    let cancelled = false;
    const publicSlug = String(searchParams.get("publicPartnerSlug") || "").trim();
    const partnerId = String(searchParams.get("partner") || "").trim();
    const amicaleId = String(searchParams.get("amicale") || "").trim();
    if (!publicSlug && !partnerId && !amicaleId) {
      setPublicPartnerSlug(null);
      setResolvedPricingAmicaleId(null);
      setResolvedPartnerAgencyMarginMultiplier(null);
      return () => {
        cancelled = true;
      };
    }

    const resolveSlug = async () => {
      try {
        if (publicSlug) {
          const match = await resolvePublicPartnerBySlug(publicSlug);
          if (cancelled) return;
          setPublicPartnerSlug(match ? publicSlug : null);
          if (match?.kind === "partner_agency") {
            setResolvedPricingAmicaleId(null);
            setResolvedPartnerAgencyMarginMultiplier(Number(match.item.marginMultiplier || 0) || null);
            return;
          }
          setResolvedPricingAmicaleId(match?.kind === "amicale" ? (String(match.item.id || "").trim() || null) : null);
          setResolvedPartnerAgencyMarginMultiplier(null);
          return;
        }
        if (partnerId) {
          const cached = findPartnerAgencyById(partnerId);
          if (cached) {
            if (!cancelled) {
              setPublicPartnerSlug(normalizePartnerAgencySlug(cached.slug || cached.name) || null);
              setResolvedPricingAmicaleId(null);
              setResolvedPartnerAgencyMarginMultiplier(Number(cached.marginMultiplier || 0) || null);
            }
            return;
          }
          const rows = await fetchPartnerAgenciesPublic();
          if (cancelled) return;
          const matched = (Array.isArray(rows) ? rows : []).find((item) => String(item.id || "").trim() === partnerId) || null;
          setPublicPartnerSlug(matched ? (normalizePartnerAgencySlug(matched.slug || matched.name) || null) : null);
          setResolvedPricingAmicaleId(null);
          setResolvedPartnerAgencyMarginMultiplier(matched ? (Number(matched.marginMultiplier || 0) || null) : null);
          return;
        }

        const cachedAmicale = findAmicaleById(amicaleId);
        if (cachedAmicale) {
          if (!cancelled) {
            setPublicPartnerSlug(normalizeAmicaleSlug(cachedAmicale.name) || null);
            setResolvedPricingAmicaleId(String(cachedAmicale.id || "").trim() || null);
            setResolvedPartnerAgencyMarginMultiplier(null);
          }
          return;
        }
        const rows = await fetchAmicalesPublic();
        if (cancelled) return;
        const matched = (Array.isArray(rows) ? rows : []).find((item) => String(item.id || "").trim() === amicaleId) || null;
        setPublicPartnerSlug(matched ? (normalizeAmicaleSlug(matched.name) || null) : null);
        setResolvedPricingAmicaleId(matched ? (String(matched.id || "").trim() || null) : null);
        setResolvedPartnerAgencyMarginMultiplier(null);
      } catch {
        if (!cancelled) {
          setPublicPartnerSlug(null);
          setResolvedPricingAmicaleId(null);
          setResolvedPartnerAgencyMarginMultiplier(null);
        }
      }
    };

    void resolveSlug();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);
  useEffect(() => {
    const mainTypes = parseCsvParam(searchParams.get("mainTypes") || searchParams.get("mainType")) as PropertyMainType[];
    if (mainTypes.length === 0) return;
    setSelectedMainTypes(mainTypes);
  }, [searchParams]);
  useEffect(() => {
    if (searchParams.get("openFilters") !== "1") return;
    setIsFilterOpen(true);
    setTimeout(() => {
      if (filtersAnchorRef.current) {
        filtersAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("openFilters");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    const nextQuery = searchParams.get("q") || "";
    const nextLocations = parseCsvParam(searchParams.get("locations") || searchParams.get("location"));
    const nextStayRangesParsed = parseStayRangesParam(searchParams.get("stayRanges"));
    const nextStayRanges = nextStayRangesParsed.length > 0
      ? nextStayRangesParsed
      : [{
          start: searchParams.get("checkIn") || "",
          end: searchParams.get("checkOut") || "",
        }];
    const nextCategories = parseCategoriesParam(searchParams.get("categories"));
    const nextMainTypes = parseCsvParam(searchParams.get("mainTypes") || searchParams.get("mainType")) as PropertyMainType[];
    const nextFeatures = searchParams.get("features")?.split(",").map((item) => item.trim()).filter(Boolean) || [];
    const nextDoubleRoomsMin = parseInt(searchParams.get("doubleRoomsMin") || "0", 10);
    const nextParentRoomsMin = parseInt(searchParams.get("parentRoomsMin") || "0", 10);
    const nextSimpleRoomsMin = parseInt(searchParams.get("simpleRoomsMin") || "0", 10);
    const nextBathroomsMin = parseInt(searchParams.get("bathroomsMin") || "0", 10);
    const nextClimatizedRoomsMin = parseInt(searchParams.get("climatizedRoomsMin") || "0", 10);
    const nextPaidServices = searchParams.get("paidServices")?.split(",").map((item) => item.trim()).filter(Boolean) || [];
    const nextSeaside = searchParams.get("seaside")?.split(",").map((item) => item.trim()).filter(Boolean) as HomeSeasideOptionKey[] || [];
    const nextComfort = searchParams.get("comfort")?.split(",").map((item) => item.trim()).filter(Boolean) as HomeComfortOptionKey[] || [];
    const nextStanding = searchParams.get("standing") || "";
    const nextGuestsMin = parseInt(searchParams.get("guestsMin") || "1", 10);
    const nextFeatured = searchParams.get("featured") === "true";
    const nextPriceMax = parseInt(searchParams.get("maxPrice") || "1650", 10);
    const nextTolerance = parseInt(searchParams.get("tolerance") || "75", 10);
    const nextSort = (String(searchParams.get("sort") || "matching").trim() as "matching" | "price" | "featured");

    if (query !== nextQuery) setQuery(nextQuery);
    if (!areStringArraysEqual(selectedLocations, nextLocations)) setSelectedLocations(nextLocations);
    if (!areStayRangesEqual(stayRanges, nextStayRanges)) setStayRanges(nextStayRanges);
    if (!areCanonicalStringArraysEqual(selectedCategories, nextCategories)) setSelectedCategories(nextCategories);
    if (!areStringArraysEqual(selectedMainTypes, nextMainTypes)) setSelectedMainTypes(nextMainTypes);
    if (!areStringArraysEqual(selectedFeatureNames, nextFeatures)) setSelectedFeatureNames(nextFeatures);
    if (minDoubleRooms !== nextDoubleRoomsMin) setMinDoubleRooms(nextDoubleRoomsMin);
    if (minParentRooms !== nextParentRoomsMin) setMinParentRooms(nextParentRoomsMin);
    if (minSimpleRooms !== nextSimpleRoomsMin) setMinSimpleRooms(nextSimpleRoomsMin);
    if (minBathroomsCount !== nextBathroomsMin) setMinBathroomsCount(nextBathroomsMin);
    if (minClimatizedRooms !== nextClimatizedRoomsMin) setMinClimatizedRooms(nextClimatizedRoomsMin);
    if (!areStringArraysEqual(selectedPaidServices, nextPaidServices)) setSelectedPaidServices(nextPaidServices);
    if (!areStringArraysEqual(selectedSeasideOptions, nextSeaside)) setSelectedSeasideOptions(nextSeaside);
    if (!areStringArraysEqual(selectedComfortOptions, nextComfort)) setSelectedComfortOptions(nextComfort);
    if (selectedStanding !== nextStanding) setSelectedStanding(nextStanding);
    if (minGuests !== nextGuestsMin) setMinGuests(nextGuestsMin);
    if (isFeaturedOnly !== nextFeatured) setIsFeaturedOnly(nextFeatured);
    if (priceMax !== nextPriceMax) setPriceMax(nextPriceMax);
    if (smartTolerance !== nextTolerance) setSmartTolerance(nextTolerance);
    if (sortMode !== nextSort) setSortMode(nextSort);
  }, [searchParams]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/type-filter-images?mode=${encodeURIComponent(selectedMode)}`);
        if (!response.ok) throw new Error("type-filter-images");
        const rows = await response.json();
        if (!cancelled) setTypeFilterImageRows(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setTypeFilterImageRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMode]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/home-filter-option-images?mode=${encodeURIComponent(selectedMode)}`);
        if (!response.ok) throw new Error("home-filter-option-images");
        const rows = await response.json();
        if (!cancelled) setHomeFilterOptionImageRows(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setHomeFilterOptionImageRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMode]);

  const modeProperties = useMemo(
    () => properties.filter((p) => (p.mode || "location_saisonniere") === selectedMode),
    [properties, selectedMode]
  );
  const modeBiens = useMemo(
    () => biens.filter((bien) => (bien.mode || "location_saisonniere") === selectedMode),
    [biens, selectedMode]
  );
  const bienById = useMemo(
    () => new Map(biens.map((bien) => [String(bien.id), bien])),
    [biens]
  );

  useEffect(() => {
    let disposed = false;

    const loadModeFeatures = async () => {
      const uniqueTypes = Array.from(new Set(
        modeBiens
          .map((bien) => String(bien.type || "").trim())
          .filter(Boolean)
      ));

      if (uniqueTypes.length === 0) {
        if (!disposed) setModeFeaturesByType({});
        return;
      }

      try {
        const base = String(API_URL || "").replace(/\/+$/, "");
        const normalizedBase = base.replace(/\/api$/i, "");
        const entries = await Promise.all(uniqueTypes.map(async (type) => {
          const currentMode = encodeURIComponent(selectedMode);
          const currentType = encodeURIComponent(type);
          const urls = [
            `${base}/caracteristiques?mode_bien=${currentMode}&type_bien=${currentType}`,
            `${normalizedBase}/api/caracteristiques?mode_bien=${currentMode}&type_bien=${currentType}`,
          ];

          let response: Response | null = null;
          for (const url of Array.from(new Set(urls))) {
            const next = await fetch(url);
            response = next;
            if (next.ok || next.status !== 404) break;
          }

          const rows = response?.ok ? await response.json() : [];
          return [type, Array.isArray(rows) ? rows : []] as const;
        }));
        const tabEntries = await Promise.all(uniqueTypes.map(async (type) => {
          const currentMode = encodeURIComponent(selectedMode);
          const currentType = encodeURIComponent(type);
          const urls = [
            `${base}/caracteristique-onglets?mode_bien=${currentMode}&type_bien=${currentType}`,
            `${normalizedBase}/api/caracteristique-onglets?mode_bien=${currentMode}&type_bien=${currentType}`,
          ];

          let response: Response | null = null;
          for (const url of Array.from(new Set(urls))) {
            const next = await fetch(url);
            response = next;
            if (next.ok || next.status !== 404) break;
          }
          const rows = response?.ok ? await response.json() : [];
          return [type, Array.isArray(rows) ? rows : []] as const;
        }));

        if (!disposed) {
          setModeFeaturesByType(Object.fromEntries(entries));
          setModeFeatureTabsByType(Object.fromEntries(tabEntries));
        }
      } catch {
        if (!disposed) {
          setModeFeaturesByType({});
          setModeFeatureTabsByType({});
        }
      }
    };

    void loadModeFeatures();
    return () => {
      disposed = true;
    };
  }, [modeBiens, selectedMode]);

  const priceCeiling = useMemo(() => {
    const maxPrice = Math.max(0, ...modeProperties.map((p) => Number(p.pricePerNight || 0)));
    if (maxPrice <= 300) return 300;
    return Math.ceil(maxPrice / 50) * 50;
  }, [modeProperties]);

  useEffect(() => {
    setPriceMax((prev) => Math.min(Math.max(prev, 0), priceCeiling));
  }, [priceCeiling]);

  const uniqueLocations = useMemo(() => {
    const values = new Map<string, string>();
    modeProperties.forEach((property) => {
      getPropertyLocationValues(property).forEach((value) => {
        const normalized = normalizeFeatureName(value);
        if (!normalized || values.has(normalized)) return;
        values.set(normalized, value);
      });
    });
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b, "fr"));
  }, [modeProperties]);
  const locationImageMap = useMemo(() => {
    const next = new Map<string, string>();
    uniqueLocations.forEach((loc) => {
      const target = normalizeFeatureName(loc);
      const zone = (Array.isArray(zones) ? zones : []).find((item: any) => {
        const values = [
          item?.quartier,
          item?.nom,
          item?.region,
          item?.gouvernerat,
          item?.pays,
        ].map((value) => normalizeFeatureName(String(value || "")));
        return values.includes(target);
      });
      const image =
        String(zone?.quartier_image_url || "").trim()
        || String(zone?.region_image_url || "").trim()
        || String(zone?.gouvernerat_image_url || "").trim()
        || String(zone?.pays_image_url || "").trim()
        || String(zone?.image_url || "").trim();
      if (image) next.set(loc, image);
    });
    return next;
  }, [zones, uniqueLocations]);
  const selectedLocationImage = useMemo(() => {
    if (selectedLocations.length === 0) return null;
    return locationImageMap.get(selectedLocations[0]) || null;
  }, [selectedLocations, locationImageMap]);
  const normalizedZones = useMemo(
    () =>
      (Array.isArray(zones) ? zones : []).filter((zone): zone is typeof zones[number] =>
        Boolean(String(zone?.id || "").trim()) && Boolean(String(zone?.nom || "").trim())
      ),
    [zones]
  );
  const normalizeLocationToken = (value?: string | null) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const isSameLocationToken = (left?: string | null, right?: string | null) =>
    normalizeLocationToken(left) !== "" && normalizeLocationToken(left) === normalizeLocationToken(right);
  const isTokenInList = (values: string[], target?: string | null) => {
    const normalizedTarget = normalizeLocationToken(target);
    if (!normalizedTarget) return false;
    return values.some((value) => normalizeLocationToken(value) === normalizedTarget);
  };
  const dedupeLocationValues = (values: string[]) => {
    const byToken = new Map<string, string>();
    for (const rawValue of values) {
      const value = String(rawValue || "").trim();
      if (!value) continue;
      const token = normalizeLocationToken(value);
      if (!token || byToken.has(token)) continue;
      byToken.set(token, value);
    }
    return Array.from(byToken.values()).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  };
  const hydrateLocationDraftsFromSelection = useCallback((values: string[]) => {
    const nextGouvernerats = new Set<string>();
    const nextRegions = new Set<string>();
    const nextZones = new Set<string>();

    values.forEach((rawValue) => {
      const parts = String(rawValue || "")
        .split("/")
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      if (parts.length >= 1) nextGouvernerats.add(parts[0]);
      if (parts.length >= 2) nextRegions.add(parts[parts.length - 2]);
      if (parts.length >= 3) nextZones.add(parts[parts.length - 1]);
    });

    setDraftSelectedGouvernerats(Array.from(nextGouvernerats));
    setDraftSelectedRegions(Array.from(nextRegions));
    setDraftSelectedZones(Array.from(nextZones));
    if (nextZones.size > 0) setLocationSelectionStep("zone");
    else if (nextRegions.size > 0) setLocationSelectionStep("region");
    else setLocationSelectionStep("gouvernerat");
  }, []);
  const findZoneForRegion = (regionValue?: string | null) =>
    normalizedZones.find((zone) => {
      if (!isSameLocationToken(zone.region, regionValue)) return false;
      if (locationPays && !isSameLocationToken(zone.pays, locationPays)) return false;
      if (locationGouvernerat && !isSameLocationToken(zone.gouvernerat, locationGouvernerat)) return false;
      return true;
    }) || normalizedZones.find((zone) => isSameLocationToken(zone.region, regionValue)) || null;
  const findZoneForQuartier = (zoneValue?: string | null) =>
    normalizedZones.find((zone) => {
      if (!isSameLocationToken(zone.quartier || zone.nom, zoneValue)) return false;
      if (locationPays && !isSameLocationToken(zone.pays, locationPays)) return false;
      if (locationGouvernerat && !isSameLocationToken(zone.gouvernerat, locationGouvernerat)) return false;
      if (locationRegion && !isSameLocationToken(zone.region, locationRegion)) return false;
      return true;
    }) || normalizedZones.find((zone) => isSameLocationToken(zone.quartier || zone.nom, zoneValue)) || null;
  const cascadeGouverneratOptions = useMemo(
    () =>
      dedupeLocationValues(
        normalizedZones
          .filter((zone) => !locationPays || isSameLocationToken(zone.pays, locationPays))
          .map((zone) => String(zone.gouvernerat || "").trim())
          .filter(Boolean)
      ),
    [locationPays, normalizedZones]
  );
  const draftCascadeRegionOptions = useMemo(
    () =>
      dedupeLocationValues(
        normalizedZones
          .filter((zone) => draftSelectedGouvernerats.length === 0 || isTokenInList(draftSelectedGouvernerats, zone.gouvernerat))
          .map((zone) => String(zone.region || "").trim())
          .filter(Boolean)
      ),
    [draftSelectedGouvernerats, normalizedZones]
  );
  const draftCascadeZoneOptions = useMemo(
    () =>
      dedupeLocationValues(
        normalizedZones
          .filter((zone) =>
            (draftSelectedGouvernerats.length === 0 || isTokenInList(draftSelectedGouvernerats, zone.gouvernerat))
            && (draftSelectedRegions.length === 0 || isTokenInList(draftSelectedRegions, zone.region))
          )
          .map((zone) => String(zone.quartier || zone.nom || "").trim())
          .filter(Boolean)
      ),
    [draftSelectedGouvernerats, draftSelectedRegions, normalizedZones]
  );
  const applyGovernorateSelection = (value: string) => {
    setLocationGouvernerat(value);
    setDraftSelectedGouvernerats((prev) => {
      const next = toggleStringInList(prev, value);
      const nextRegions = draftSelectedRegions.filter((region) =>
        normalizedZones.some((zone) => isTokenInList(next, zone.gouvernerat) && isSameLocationToken(zone.region, region))
      );
      const nextZones = draftSelectedZones.filter((zoneName) =>
        normalizedZones.some((zone) =>
          isTokenInList(next, zone.gouvernerat)
          && (!nextRegions.length || isTokenInList(nextRegions, zone.region))
          && isSameLocationToken(zone.quartier || zone.nom, zoneName)
        )
      );
      setDraftSelectedRegions(nextRegions);
      setDraftSelectedZones(nextZones);
      return next;
    });
  };
  const applyRegionSelection = (value: string) => {
    const resolvedZone = findZoneForRegion(value);
    if (resolvedZone?.gouvernerat) setLocationGouvernerat(String(resolvedZone.gouvernerat));
    setLocationRegion(value);
    setDraftSelectedRegions((prev) => {
      const next = toggleStringInList(prev, value);
      const nextZones = draftSelectedZones.filter((zoneName) =>
        normalizedZones.some((zone) =>
          isTokenInList(draftSelectedGouvernerats, zone.gouvernerat)
          && isTokenInList(next, zone.region)
          && isSameLocationToken(zone.quartier || zone.nom, zoneName)
        )
      );
      setDraftSelectedZones(nextZones);
      return next;
    });
  };
  const applyZoneSelection = (value: string) => {
    const resolvedZone = findZoneForQuartier(value);
    if (resolvedZone?.gouvernerat) setLocationGouvernerat(String(resolvedZone.gouvernerat));
    if (resolvedZone?.region) setLocationRegion(String(resolvedZone.region));
    setLocationZone(value);
    setDraftSelectedZones((prev) => toggleStringInList(prev, value));
  };
  const getLocationOptionImage = (level: "gouvernerat" | "region" | "zone", value: string) => {
    const rows = normalizedZones.filter((zone) => {
      if (level === "gouvernerat") return isSameLocationToken(zone.gouvernerat, value);
      if (level === "region") return isSameLocationToken(zone.region, value);
      return isSameLocationToken(zone.quartier || zone.nom, value);
    });
    const pickFirstNonEmpty = (field: "gouvernerat_image_url" | "region_image_url" | "quartier_image_url" | "image_url") =>
      String(rows.find((item) => String(item[field] || "").trim())?.[field] || "").trim();
    const levelImage =
      level === "gouvernerat"
        ? pickFirstNonEmpty("gouvernerat_image_url")
        : level === "region"
          ? pickFirstNonEmpty("region_image_url")
          : pickFirstNonEmpty("quartier_image_url");
    return resolveZoneImageUrl(levelImage || pickFirstNonEmpty("image_url"));
  };
  const locationCardSelectionClass = (selected: boolean) =>
    selected
      ? "border-emerald-300 ring-2 ring-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.75),0_0_22px_rgba(52,211,153,0.65)]"
      : "border-gray-200";
  const renderSelectionCheckbox = (selected: boolean) => (
    <span
      className={`absolute right-3 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[10px] border backdrop-blur-md transition-all duration-200 ${
        selected
          ? "border-emerald-300 bg-emerald-500/95 text-white shadow-[0_10px_25px_rgba(16,185,129,0.35)]"
          : "border-white/75 bg-white/92 text-transparent shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
      }`}
      aria-hidden="true"
    >
      <Check size={16} strokeWidth={3} />
    </span>
  );
  const renderSelectionLabel = (label: string) => (
    <span className="flex min-h-[3rem] max-w-[calc(100%-3.75rem)] min-w-[7rem] items-center rounded-xl border border-white/20 bg-black/30 px-4 py-2 text-left text-sm font-semibold leading-snug text-white shadow-[0_10px_25px_rgba(15,23,42,0.22)] backdrop-blur-md [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
      {label}
    </span>
  );
  const locationStepMeta = {
    gouvernerat: {
      title: "Gouvernorat",
      subtitle: "Choisissez un ou plusieurs gouvernorats en Tunisie.",
      options: cascadeGouverneratOptions,
    },
    region: {
      title: "Région",
      subtitle: "Affinez votre recherche avec une ou plusieurs régions.",
      options: draftCascadeRegionOptions,
    },
    zone: {
      title: "Zone",
      subtitle: "Choisissez une ou plusieurs zones puis confirmez.",
      options: draftCascadeZoneOptions,
    },
  } as const;
  const availableTypeOptions = useMemo(() => {
    const byCategory = new Map<string, { label: string; imageUrl: string }>();
    for (const property of modeProperties) {
      const category = getResolvedPropertyCategoryLabel(property);
      if (!category) continue;
      if (!byCategory.has(category)) {
        const firstImage = Array.isArray(property.images) ? String(property.images[0] || "").trim() : "";
        const imageFromAdmin = typeFilterImageRows.find((row) =>
          String(row.mode_bien || "").trim() === selectedMode
          && normalizeTypeToken(row.sub_type) === normalizeTypeToken(category)
        )?.image_url || "";
        byCategory.set(category, {
          label: category,
          imageUrl: imageFromAdmin || firstImage || TYPE_FALLBACK_IMAGE,
        });
      }
    }
    return Array.from(byCategory.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [modeProperties, selectedMode, typeFilterImageRows]);
  const groupedTypeOptions = useMemo(() => {
    const groups = new Map<PropertyMainType, GroupedPropertyTypeOption>();
    const modeRows = typeFilterImageRows.filter((row) => String(row.mode_bien || "").trim() === selectedMode);

    for (const mainType of Object.keys(MAIN_TYPE_LABELS) as PropertyMainType[]) {
      const mainImageFromAdmin = modeRows.find(
        (row) => normalizeTypeToken(row.main_type) === normalizeTypeToken(mainType) && !String(row.sub_type || "").trim()
      )?.image_url || "";
      groups.set(mainType, {
        mainType,
        label: MAIN_TYPE_LABELS[mainType],
        imageUrl: mainImageFromAdmin || TYPE_FALLBACK_IMAGE,
        subTypes: [],
      });
    }

    for (const row of modeRows) {
      const subType = String(row.sub_type || "").trim();
      if (!subType || isInvalidPropertySubtype(subType)) continue;
      const mainType = getMainTypeFromCategory(String(row.main_type || ""));
      const group = groups.get(mainType);
      if (!group) continue;
      const matchKey = buildMainTypeSubTypeMatchKey(mainType, subType);
      if (!group.subTypes.some((item) => getGroupedSubTypeMatchKey(group.mainType, item) === matchKey)) {
        group.subTypes.push({
          label: subType,
          imageUrl: row.image_url || TYPE_FALLBACK_IMAGE,
          matchMainType: mainType,
          residenceScoped: mainType === "residence",
          selectionScope: mainType,
        });
      }
      if (!group.imageUrl || group.imageUrl === TYPE_FALLBACK_IMAGE) {
        group.imageUrl = row.image_url || group.imageUrl;
      }
    }

    for (const option of availableTypeOptions) {
      if (isInvalidPropertySubtype(option.label)) continue;
      const mainType = getMainTypeFromCategory(option.label);
      const group = groups.get(mainType);
      if (!group) continue;
      const matchKey = buildMainTypeSubTypeMatchKey(mainType, option.label);
      if (!group.subTypes.some((item) => getGroupedSubTypeMatchKey(group.mainType, item) === matchKey)) {
        group.subTypes.push({
          label: option.label,
          imageUrl: option.imageUrl,
          matchMainType: mainType,
          residenceScoped: false,
          selectionScope: mainType,
        });
      }
      if (!group.imageUrl || group.imageUrl === TYPE_FALLBACK_IMAGE) {
        group.imageUrl = option.imageUrl || group.imageUrl;
      }
    }

    const residenceGroup = groups.get("residence");
    if (residenceGroup) {
      for (const property of modeProperties) {
        if (!isResidenceGroupedProperty(property)) continue;
        const label = getResolvedPropertyCategoryLabel(property);
        if (isInvalidPropertySubtype(label)) continue;
        const actualMainType = getMainTypeFromCategory(label);
        const matchKey = buildMainTypeSubTypeMatchKey("residence", label);
        if (!matchKey) continue;
        const imageFromAdmin = modeRows.find(
          (row) =>
            normalizeTypeToken(row.main_type) === normalizeTypeToken(actualMainType)
            && normalizeTypeToken(row.sub_type) === normalizeTypeToken(label)
        )?.image_url || "";
        const propertyImage = Array.isArray(property.images) ? String(property.images[0] || "").trim() : "";
        if (!residenceGroup.subTypes.some((item) => getGroupedSubTypeMatchKey(residenceGroup.mainType, item) === matchKey)) {
          residenceGroup.subTypes.push({
            label,
            imageUrl: imageFromAdmin || propertyImage || TYPE_FALLBACK_IMAGE,
            matchMainType: actualMainType,
            residenceScoped: true,
            selectionScope: "residence",
          });
        }
      }
    }

    return Array.from(groups.values())
      .map((group) => {
        const hasSpecificSPlus = group.subTypes.some((item) => /^s\+\d+$/.test(getCanonicalSubTypeKey(item.label)));
        let nextGroup = hasSpecificSPlus
          ? {
              ...group,
              subTypes: group.subTypes.filter((item) => !isGenericPropertySubtype(item.label)),
            }
          : group;
        if (nextGroup.mainType === "residence") {
          const explicitResidenceChildKeys = new Set(
            nextGroup.subTypes
              .filter((item) => item.matchMainType && item.matchMainType !== "residence")
              .map((item) => getCanonicalSubTypeKey(item.label))
              .filter(Boolean)
          );
          if (explicitResidenceChildKeys.size > 0) {
            nextGroup = {
              ...nextGroup,
              subTypes: nextGroup.subTypes.filter((item) => {
                const canonicalKey = getCanonicalSubTypeKey(item.label);
                if (!canonicalKey) return false;
                if (item.matchMainType && item.matchMainType !== "residence") return true;
                return !explicitResidenceChildKeys.has(canonicalKey);
              }),
            };
          }
        }
        return nextGroup;
      })
      .filter((group) => group.subTypes.length > 0 || group.imageUrl !== TYPE_FALLBACK_IMAGE)
      .sort((a, b) => MAIN_TYPE_DISPLAY_ORDER.indexOf(a.mainType) - MAIN_TYPE_DISPLAY_ORDER.indexOf(b.mainType));
  }, [availableTypeOptions, modeProperties, selectedMode, typeFilterImageRows]);
  const groupedCategoryMetadata = useMemo(() => {
    const canonicalLabelByKey = new Map<string, string>();
    const ownerMainTypesByKey = new Map<string, PropertyMainType[]>();
    const residenceCanonicalLabelBySubTypeKey = new Map<string, string>();
    groupedTypeOptions.forEach((group) => {
      group.subTypes.forEach((item) => {
        const key = getGroupedSubTypeMatchKey(group.mainType, item);
        if (!key) return;
        if (!canonicalLabelByKey.has(key)) canonicalLabelByKey.set(key, item.label);
        const owners = ownerMainTypesByKey.get(key) || [];
        if (!owners.includes(group.mainType)) owners.push(group.mainType);
        ownerMainTypesByKey.set(key, owners);
        const subTypeKey = getCanonicalSubTypeKey(item.label);
        if (
          group.mainType === "residence"
          && subTypeKey
          && item.matchMainType
          && item.matchMainType !== "residence"
          && !residenceCanonicalLabelBySubTypeKey.has(subTypeKey)
        ) {
          residenceCanonicalLabelBySubTypeKey.set(subTypeKey, item.label);
        }
      });
    });
    return { canonicalLabelByKey, ownerMainTypesByKey, residenceCanonicalLabelBySubTypeKey };
  }, [groupedTypeOptions]);
  const normalizeSelectedCategories = useCallback((categories: string[], mainTypes: PropertyMainType[]) => {
    const next: string[] = [];
    const seenNormalizedCategories = new Set<string>();
    categories.forEach((category) => {
      const rawCategory = String(category || "").trim();
      const scopedMainType = getScopedCategoryMainType(rawCategory);
      const displayCategory = getCategoryDisplayLabel(rawCategory);
      const genericSubTypeKey = getCanonicalSubTypeKey(displayCategory);
      const multiTypeSubtypeScopes =
        !scopedMainType
        && !hasExplicitMainTypeInLabel(displayCategory)
        && genericSubTypeKey
        && mainTypes.length > 1
          ? mainTypes.filter((mainType) => ["appartement", "villa_maison", "bungalow", "residence"].includes(mainType))
          : [];
      if (multiTypeSubtypeScopes.length > 1) {
        multiTypeSubtypeScopes.forEach((mainType) => {
          const scopedLabel =
            mainType === "appartement"
              ? `Appartement ${displayCategory}`.trim()
              : mainType === "villa_maison"
                ? `Villa / Maison ${displayCategory}`.trim()
                : mainType === "bungalow"
                  ? `Bungalow ${displayCategory}`.trim()
                : (groupedCategoryMetadata.residenceCanonicalLabelBySubTypeKey.get(genericSubTypeKey) || `Appartement ${displayCategory}`.trim());
          const normalizedScopedCategory = encodeScopedCategory(mainType, scopedLabel);
          if (!normalizedScopedCategory || seenNormalizedCategories.has(normalizedScopedCategory)) return;
          seenNormalizedCategories.add(normalizedScopedCategory);
          next.push(normalizedScopedCategory);
        });
        return;
      }
      const residenceExplicitLabel =
        !scopedMainType && !hasExplicitMainTypeInLabel(displayCategory) && mainTypes.includes("residence") && genericSubTypeKey
          ? groupedCategoryMetadata.residenceCanonicalLabelBySubTypeKey.get(genericSubTypeKey) || ""
          : "";
      const normalizedSourceCategory = residenceExplicitLabel || rawCategory;
      const matchKeys = getSelectedSubTypeMatchKeys(normalizedSourceCategory, mainTypes);
      const preferredKey = matchKeys.find((key) => {
        const owners = groupedCategoryMetadata.ownerMainTypesByKey.get(key) || [];
        return mainTypes.some((mainType) => owners.includes(mainType));
      }) || matchKeys[0];
      if (!preferredKey) return;
      const preferredMainType = parseScopedCategoryMainType(preferredKey.split("::")[0] || "");
      const fallbackCanonicalLabel = groupedCategoryMetadata.canonicalLabelByKey.get(preferredKey) || getCategoryDisplayLabel(normalizedSourceCategory);
      const canonicalLabel = scopedMainType === "residence"
        ? (
            hasExplicitMainTypeInLabel(displayCategory)
              ? displayCategory
              : (
                  preferredMainType && preferredMainType !== "residence"
                    ? `${MAIN_TYPE_LABELS[preferredMainType]} ${displayCategory}`.trim()
                    : fallbackCanonicalLabel
                )
          )
        : fallbackCanonicalLabel;
      const shouldKeepScoped =
        Boolean(preferredMainType)
        && (
          scopedMainType === preferredMainType
          || scopedMainType === "residence"
          || (!scopedMainType && !hasExplicitMainTypeInLabel(displayCategory) && mainTypes.length > 1)
        );
      const scopeToKeep = scopedMainType || preferredMainType;
      const normalizedCategory = shouldKeepScoped && scopeToKeep ? encodeScopedCategory(scopeToKeep, canonicalLabel) : canonicalLabel;
      if (!normalizedCategory || seenNormalizedCategories.has(normalizedCategory)) return;
      seenNormalizedCategories.add(normalizedCategory);
      next.push(normalizedCategory);
    });
    return next;
  }, [groupedCategoryMetadata]);
  const normalizedSelectedCategories = useMemo(
    () => normalizeSelectedCategories(selectedCategories, selectedMainTypes),
    [normalizeSelectedCategories, selectedCategories, selectedMainTypes]
  );
  const resolveRequestedCategoryMainType = useCallback((category: string): PropertyMainType => {
    const scopedMainType = getScopedCategoryMainType(category);
    if (scopedMainType) return scopedMainType;
    const displayCategory = getCategoryDisplayLabel(category);
    if (hasExplicitMainTypeInLabel(displayCategory)) {
      return getMainTypeFromCategory(displayCategory);
    }
    if (selectedMainTypes.length === 1) return selectedMainTypes[0];
    const matchKeys = getSelectedSubTypeMatchKeys(category, selectedMainTypes);
    for (const mainType of selectedMainTypes) {
      const ownsCategory = matchKeys.some((key) => (groupedCategoryMetadata.ownerMainTypesByKey.get(key) || []).includes(mainType));
      if (ownsCategory) return mainType;
    }
    return getMainTypeFromCategory(displayCategory);
  }, [groupedCategoryMetadata, selectedMainTypes]);
  const selectedTypeTargetsByMainType = useMemo(() => {
    const grouped = new Map<PropertyMainType, {
      mainType: PropertyMainType;
      categories: string[];
      displayLabels: string[];
      subTypeKeys: Set<string>;
      matchKeys: Set<string>;
    }>();
    const ensureTarget = (mainType: PropertyMainType) => {
      const existing = grouped.get(mainType);
      if (existing) return existing;
      const next = {
        mainType,
        categories: [],
        displayLabels: [],
        subTypeKeys: new Set<string>(),
        matchKeys: new Set<string>(),
      };
      grouped.set(mainType, next);
      return next;
    };
    selectedMainTypes.forEach((mainType) => {
      ensureTarget(mainType);
    });
    const appendCategoryToTarget = (
      target: {
        mainType: PropertyMainType;
        categories: string[];
        displayLabels: string[];
        subTypeKeys: Set<string>;
        matchKeys: Set<string>;
      },
      category: string,
      displayLabel: string,
      matchMainTypes: PropertyMainType[],
    ) => {
      target.categories.push(category);
      target.displayLabels.push(displayLabel);
      const subTypeKey = getCanonicalSubTypeKey(displayLabel);
      if (subTypeKey) target.subTypeKeys.add(subTypeKey);
      matchMainTypes.forEach((matchMainType) => {
        getSelectedSubTypeMatchKeys(category, [matchMainType]).forEach((key) => {
          if (key) target.matchKeys.add(key);
        });
      });
    };
    normalizedSelectedCategories.forEach((category) => {
      const mainType = resolveRequestedCategoryMainType(category);
      const displayLabel = getCategoryDisplayLabel(category);
      const target = ensureTarget(mainType);
      appendCategoryToTarget(target, category, displayLabel, [mainType]);

      const scopedMainType = getScopedCategoryMainType(category);
      const explicitChildMainType = scopedMainType === "residence" && hasExplicitMainTypeInLabel(displayLabel)
        ? getMainTypeFromCategory(displayLabel)
        : null;
      if (explicitChildMainType && explicitChildMainType !== mainType) {
        const childTarget = ensureTarget(explicitChildMainType);
        appendCategoryToTarget(childTarget, category, displayLabel, [explicitChildMainType]);
      }
    });
    return grouped;
  }, [normalizedSelectedCategories, resolveRequestedCategoryMainType, selectedMainTypes]);
  useEffect(() => {
    setSelectedCategories((prev) => {
      const next = normalizeSelectedCategories(prev, selectedMainTypes);
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [normalizeSelectedCategories, selectedMainTypes]);
  const removeCategoriesForMainType = (
    categories: string[],
    mainType: PropertyMainType,
    currentSelectedTypes: PropertyMainType[] = selectedMainTypes,
  ) => {
    const selectedGroup = groupedTypeOptions.find((group) => group.mainType === mainType);
    if (!selectedGroup) return categories;
    const remainingGroups = groupedTypeOptions.filter((group) => currentSelectedTypes.includes(group.mainType) && group.mainType !== mainType);
    const stillAllowedMatchKeys = new Set(
      remainingGroups.flatMap((group) => group.subTypes.map((item) => getGroupedSubTypeMatchKey(group.mainType, item)).filter(Boolean))
    );
    const blockedMatchKeys = new Set(
      selectedGroup.subTypes.map((item) => getGroupedSubTypeMatchKey(selectedGroup.mainType, item)).filter(Boolean)
    );
    return categories.filter((item) => {
      const matchKeys = getSelectedSubTypeMatchKeys(item, [mainType]);
      return !matchKeys.some((key) => blockedMatchKeys.has(key) && !stillAllowedMatchKeys.has(key));
    });
  };
  const secondaryTypeOptions = useMemo(() => {
    if (selectedMainTypes.length === 0) return [];
    const merged = new Map<string, GroupedPropertySubType>();
    groupedTypeOptions
      .filter((group) => selectedMainTypes.includes(group.mainType))
      .forEach((group) => {
        group.subTypes.forEach((subType) => {
          const optionKey = getGroupedSubTypeOptionKey(group.mainType, subType);
          if (!optionKey) return;
          if (!merged.has(optionKey)) {
            merged.set(optionKey, {
              label: subType.label,
              imageUrl: subType.imageUrl,
              matchMainType: subType.matchMainType,
              residenceScoped: subType.residenceScoped,
              selectionScope: getGroupedSubTypeSelectionScope(group.mainType, subType),
            });
          }
        });
      });
      return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [groupedTypeOptions, selectedMainTypes]);
  const draftSecondaryTypeOptions = useMemo(() => {
    if (!draftMainType) return availableTypeOptions;
    const selectedGroup = groupedTypeOptions.find((group) => group.mainType === draftMainType);
    return selectedGroup?.subTypes || [];
  }, [availableTypeOptions, draftMainType, groupedTypeOptions]);
  const isCategorySelectedForMainTypes = useCallback((categories: string[], label: string, mainTypes: PropertyMainType[], scopeMainType?: PropertyMainType | "") => {
    const scopedLabel = scopeMainType ? encodeScopedCategory(scopeMainType, label) : label;
    const normalizedCategories = normalizeSelectedCategories(categories, mainTypes);
    const normalizedLabel = normalizeSelectedCategories([scopedLabel], mainTypes)[0] || scopedLabel;
    return normalizedCategories.includes(normalizedLabel);
  }, [normalizeSelectedCategories]);
  const openTypeSelection = useCallback(() => {
    const normalizedMainTypes = normalizeResidenceExclusiveMainTypes(selectedMainTypes);
    const normalizedMainType = normalizedMainTypes.includes("residence") ? "residence" : (normalizedMainTypes[0] || "");
    setDraftMainType(normalizedMainType);
    setDraftSelectedMainTypes(normalizedMainTypes);
    setDraftCategories(normalizeSelectedCategories(selectedCategories, normalizedMainTypes));
    setTypeSelectionStep(normalizedMainType ? "sub" : "main");
  }, [normalizeSelectedCategories, selectedCategories, selectedMainTypes]);
  const toggleDraftMainTypeSelection = useCallback((mainType: PropertyMainType) => {
    const isRemoving = draftSelectedMainTypes.includes(mainType);
    const nextSelectedMainTypes = isRemoving
      ? draftSelectedMainTypes.filter((item) => item !== mainType)
      : normalizeResidenceExclusiveMainTypes([...draftSelectedMainTypes, mainType], mainType);
    setDraftSelectedMainTypes(nextSelectedMainTypes);
    if (isRemoving) {
      setDraftCategories((prev) => removeCategoriesForMainType(prev, mainType, draftSelectedMainTypes));
      if (draftMainType === mainType) {
        setDraftMainType(nextSelectedMainTypes[0] || "");
        setTypeSelectionStep(nextSelectedMainTypes.length > 0 ? "sub" : "main");
      }
      return;
    }
    setDraftMainType(mainType);
    setTypeSelectionStep("sub");
  }, [draftMainType, draftSelectedMainTypes, removeCategoriesForMainType]);
  const toggleDraftCategory = useCallback((cat: string, scopeMainType?: PropertyMainType | "") => {
    const resolvedScopeMainType = scopeMainType || draftMainType;
    const scopedCategory = resolvedScopeMainType ? encodeScopedCategory(resolvedScopeMainType, cat) : cat;
    const normalizedCategory = normalizeSelectedCategories([scopedCategory], draftSelectedMainTypes)[0] || scopedCategory;
    setDraftCategories((prev) => {
      const normalizedPrev = normalizeSelectedCategories(prev, draftSelectedMainTypes);
      const next = normalizedPrev.includes(normalizedCategory)
        ? normalizedPrev.filter((item) => item !== normalizedCategory)
        : [...normalizedPrev, normalizedCategory];
      return normalizeSelectedCategories(next, draftSelectedMainTypes);
    });
  }, [draftMainType, draftSelectedMainTypes, normalizeSelectedCategories]);
  const confirmTypeSelection = useCallback(() => {
    const normalizedMainTypes = normalizeResidenceExclusiveMainTypes(draftSelectedMainTypes, draftMainType || undefined);
    setSelectedMainTypes(normalizedMainTypes);
    setSelectedCategories(normalizeSelectedCategories(draftCategories, normalizedMainTypes));
  }, [draftCategories, draftMainType, draftSelectedMainTypes, normalizeSelectedCategories]);
  useEffect(() => {
    setDraftStayRanges(stayRanges.filter((range) => range.start && range.end));
    const firstRange = stayRanges[0] || { start: "", end: "" };
    setCalendarCheckIn(firstRange.start ? parseISO(firstRange.start) : null);
    setCalendarCheckOut(firstRange.end ? parseISO(firstRange.end) : null);
  }, [stayRanges]);
  useEffect(() => {
    setLocationPays("Tunisie");
    hydrateLocationDraftsFromSelection(selectedLocations);
    setDraftSelectedLocations(selectedLocations);
    const firstLabel = selectedLocations[0] || "";
    const parts = firstLabel.split("/").map((item) => item.trim()).filter(Boolean);
    setLocationGouvernerat(parts[0] || "");
    setLocationRegion(parts.length >= 2 ? parts[parts.length - 2] : "");
    setLocationZone(parts.length >= 3 ? parts[parts.length - 1] : "");
  }, [hydrateLocationDraftsFromSelection, selectedLocations]);
  useEffect(() => {
    const zoneLabels = draftSelectedZones.map((zoneName) => {
      const resolvedZone = normalizedZones.find((zone) =>
        (draftSelectedGouvernerats.length === 0 || isTokenInList(draftSelectedGouvernerats, zone.gouvernerat))
        && (draftSelectedRegions.length === 0 || isTokenInList(draftSelectedRegions, zone.region))
        && isSameLocationToken(zone.quartier || zone.nom, zoneName)
      );
      return buildHierarchicalLocationLabel([resolvedZone?.gouvernerat || "", resolvedZone?.region || "", zoneName]);
    }).filter(Boolean);
    const regionLabels = zoneLabels.length === 0
      ? draftSelectedRegions.map((regionName) => {
          const resolvedZone = normalizedZones.find((zone) =>
            (draftSelectedGouvernerats.length === 0 || isTokenInList(draftSelectedGouvernerats, zone.gouvernerat))
            && isSameLocationToken(zone.region, regionName)
          );
          return buildHierarchicalLocationLabel([resolvedZone?.gouvernerat || "", regionName]);
        }).filter(Boolean)
      : [];
    const governorateLabels = zoneLabels.length === 0 && regionLabels.length === 0 ? draftSelectedGouvernerats : [];
    setDraftSelectedLocations(dedupeHierarchicalLocations([...zoneLabels, ...regionLabels, ...governorateLabels]));
  }, [draftSelectedGouvernerats, draftSelectedRegions, draftSelectedZones, normalizedZones]);
  useEffect(() => {
    openTypeSelection();
  }, [openTypeSelection]);
  const availableStandingOptions = useMemo(() => {
    const standingSet = new Set<string>();
    modeProperties.forEach((property) => {
      const key = String(property.seasonalConfig?.categorieStanding || "").trim();
      if (key) standingSet.add(key);
    });
    return [
      { value: "", label: "Tous standings" },
      ...Array.from(standingSet)
        .sort((a, b) => a.localeCompare(b, "fr"))
        .map((value) => ({ value, label: STANDING_LABELS[value] || value })),
    ];
  }, [modeProperties]);
  const availableSeasideOptions = useMemo(
    () => SEASIDE_OPTION_KEYS.filter((key) => modeProperties.some((property) => propertyMatchesSeasideOption(property, key))),
    [modeProperties]
  );
  const availableComfortOptions = useMemo(() => {
    const detected = COMFORT_OPTION_KEYS.filter((key) => modeProperties.some((property) => propertyMatchesComfortOption(property, key)));
    if (detected.includes("rdc") && !detected.includes("premier_etage")) {
      const rdcIndex = detected.indexOf("rdc");
      detected.splice(rdcIndex + 1, 0, "premier_etage");
    }
    return detected;
  }, [modeProperties]);

  const amenitiesList = useMemo(
    () => {
      const amenityNames = new Set<string>();

      modeProperties.forEach((property) => {
        const sourceBien = bienById.get(String(property.id));
        const type = String(sourceBien?.type || "").trim();
        const typeFeatures = modeFeaturesByType[type] || [];
        const selectedFeatureIds = new Set(
          (Array.isArray(sourceBien?.caracteristique_ids) ? sourceBien?.caracteristique_ids : []).map((item) => String(item))
        );
        const selectedFeatureNames = new Set(
          (Array.isArray(sourceBien?.caracteristiques) ? sourceBien?.caracteristiques : []).map((item) => normalizeFeatureName(String(item)))
        );
        const matchedFeatureNames = typeFeatures
          .filter((feature) => {
            if (Number(feature.visibilite_client) === 0) return false;
            if (!isCharacteristicsTabName(String(feature.onglet_nom || ""))) return false;
            const byId = selectedFeatureIds.has(String(feature.id || ""));
            const byName = selectedFeatureNames.has(normalizeFeatureName(String(feature.nom || "")));
            return byId || byName;
          })
          .map((feature) => String(feature.nom || "").trim())
          .filter(Boolean);

        if (matchedFeatureNames.length > 0) {
          matchedFeatureNames.forEach((name) => amenityNames.add(name));
          return;
        }

        (property.amenities || []).forEach((amenity) => amenityNames.add(amenity));
      });

      return Array.from(amenityNames).sort((a, b) => a.localeCompare(b, "fr")).slice(0, 24);
    },
    [modeProperties, bienById, modeFeaturesByType]
  );

  const propertyAmenityMap = useMemo(() => {
    const next = new Map<string, string[]>();

    modeProperties.forEach((property) => {
      const sourceBien = bienById.get(String(property.id));
      const type = String(sourceBien?.type || "").trim();
      const typeFeatures = modeFeaturesByType[type] || [];
      const selectedFeatureIds = new Set(
        (Array.isArray(sourceBien?.caracteristique_ids) ? sourceBien?.caracteristique_ids : []).map((item) => String(item))
      );
      const selectedFeatureNames = new Set(
        (Array.isArray(sourceBien?.caracteristiques) ? sourceBien?.caracteristiques : []).map((item) => normalizeFeatureName(String(item)))
      );

      const amenityNames = typeFeatures
        .filter((feature) => {
          if (Number(feature.visibilite_client) === 0) return false;
          if (!isCharacteristicsTabName(String(feature.onglet_nom || ""))) return false;
          const byId = selectedFeatureIds.has(String(feature.id || ""));
          const byName = selectedFeatureNames.has(normalizeFeatureName(String(feature.nom || "")));
          return byId || byName;
        })
        .map((feature) => String(feature.nom || "").trim())
        .filter(Boolean);

      next.set(String(property.id), amenityNames.length > 0 ? amenityNames : (property.amenities || []));
    });

    return next;
  }, [modeProperties, bienById, modeFeaturesByType]);
  const propertyFeatureTabMap = useMemo(() => {
    const next = new Map<string, string[]>();
    modeProperties.forEach((property) => {
      const sourceBien = bienById.get(String(property.id));
      const type = String(sourceBien?.type || "").trim();
      const typeFeatures = modeFeaturesByType[type] || [];
      const selectedFeatureIds = new Set(
        (Array.isArray(sourceBien?.caracteristique_ids) ? sourceBien?.caracteristique_ids : []).map((item) => String(item))
      );
      const selectedFeatureNames = new Set(
        (Array.isArray(sourceBien?.caracteristiques) ? sourceBien?.caracteristiques : []).map((item) => normalizeFeatureName(String(item)))
      );
      const tabs = typeFeatures
        .filter((feature) => {
          if (Number(feature?.visibilite_client) === 0) return false;
          const byId = selectedFeatureIds.has(String(feature.id || ""));
          const byName = selectedFeatureNames.has(normalizeFeatureName(String(feature.nom || "")));
          return byId || byName;
        })
        .map((feature) => cleanFeatureTabName(String(feature.onglet_nom || "")).trim())
        .filter(Boolean);
      next.set(String(property.id), Array.from(new Set(tabs)));
    });
    return next;
  }, [modeProperties, bienById, modeFeaturesByType]);
  const paidServicesCatalog = useMemo(() => {
    const rows: NormalizedServicePayant[] = [];
    modeProperties.forEach((property) => {
      const services = Array.isArray(property.seasonalConfig?.servicesPayants) ? property.seasonalConfig?.servicesPayants : [];
      services.forEach((service) => {
        const normalized = normalizeServicePayant(service);
        if (normalized.enabled === false) return;
        if (!String(normalized.label || "").trim()) return;
        rows.push(normalized);
      });
    });
    const dedup = new Map<string, NormalizedServicePayant>();
    rows.forEach((service) => {
      const key = `${normalizeFeatureName(service.categorie)}|${normalizeFeatureName(service.label)}|${service.type_tarification}`;
      if (!dedup.has(key)) dedup.set(key, service);
    });
    return Array.from(dedup.values()).sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""), "fr"));
  }, [modeProperties]);
  const paidServiceCategories = useMemo(() => {
    const grouped = new Map<string, NormalizedServicePayant[]>();
    paidServicesCatalog.forEach((service) => {
      const category = String(service.categorie || "Services").trim() || "Services";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category)?.push(service);
    });
    return Array.from(grouped.entries())
      .map(([category, services]) => ({
        id: normalizeFeatureName(category) || category,
        label: category,
        services,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [paidServicesCatalog]);
  const selectedPaidServiceCategoryData = useMemo(() => (
    paidServiceCategories.find((item) => item.id === selectedPaidServiceCategory) || null
  ), [paidServiceCategories, selectedPaidServiceCategory]);
  const visiblePaidServices = useMemo(() => {
    if (!selectedPaidServiceCategoryData) return [];
    const list = selectedPaidServiceCategoryData.services;
    if (selectedPaidServiceTypeFilter === "all") return list;
    return list.filter((service) => service.type_tarification === selectedPaidServiceTypeFilter);
  }, [selectedPaidServiceCategoryData, selectedPaidServiceTypeFilter]);
  const propertyPaidServicesMap = useMemo(() => {
    const next = new Map<string, string[]>();
    modeProperties.forEach((property) => {
      const services = Array.isArray(property.seasonalConfig?.servicesPayants) ? property.seasonalConfig?.servicesPayants : [];
      const labels = services
        .filter((service) => Boolean(service?.enabled))
        .map((service) => String(service?.label || "").trim())
        .filter(Boolean);
      next.set(String(property.id), labels);
    });
    return next;
  }, [modeProperties]);
  const tabFeatureOptionsMap = useMemo(() => {
    const tabBuckets = new Map<string, { label: string; order: number; features: Set<string> }>();
    modeProperties.forEach((property) => {
      const sourceBien = bienById.get(String(property.id));
      const type = String(sourceBien?.type || "").trim();
      const typeFeatures = modeFeaturesByType[type] || [];
      const typeTabs = modeFeatureTabsByType[type] || [];
      const tabById = new Map(typeTabs.map((tab) => [String(tab.id || "").trim(), tab]));
      const selectedFeatureIds = new Set(
        (Array.isArray(sourceBien?.caracteristique_ids) ? sourceBien.caracteristique_ids : []).map((item) => String(item))
      );
      const selectedFeatureNames = new Set(
        (Array.isArray(sourceBien?.caracteristiques) ? sourceBien.caracteristiques : []).map((item) => normalizeFeatureName(String(item)))
      );

      typeFeatures.forEach((feature) => {
        if (Number(feature?.visibilite_client) === 0) return;
        const tabId = String(feature.onglet_id || "").trim();
        const resolvedTab = tabById.get(tabId);
        const tabLabel = cleanFeatureTabName(String(resolvedTab?.nom || feature.onglet_nom || "")).trim();
        if (!tabLabel || isCharacteristicsTabName(tabLabel)) return;
        const byId = selectedFeatureIds.has(String(feature.id || ""));
        const byName = selectedFeatureNames.has(normalizeFeatureName(String(feature.nom || "")));
        if (!byId && !byName) return;
        const featureName = String(feature.nom || "").trim();
        if (!featureName) return;
        const tabKey = normalizeFeatureName(tabLabel);
        const orderValue = Number.isFinite(Number(resolvedTab?.ordre))
          ? Number(resolvedTab?.ordre)
          : 999;
        if (!tabBuckets.has(tabKey)) {
          tabBuckets.set(tabKey, { label: tabLabel, order: orderValue, features: new Set<string>() });
        } else {
          const current = tabBuckets.get(tabKey)!;
          if (orderValue < current.order) current.order = orderValue;
        }
        tabBuckets.get(tabKey)?.features.add(featureName);
      });
    });
    const ordered = Array.from(tabBuckets.values())
      .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label, "fr"))
      .map((bucket) => [bucket.label, Array.from(bucket.features).sort((a, b) => a.localeCompare(b, "fr"))] as const);
    return new Map(ordered);
  }, [modeProperties, bienById, modeFeaturesByType, modeFeatureTabsByType]);
  const featureTabsList = useMemo(
    () => Array.from(tabFeatureOptionsMap.keys()),
    [tabFeatureOptionsMap]
  );
  const detailedFeatureTabsList = useMemo(
    () => featureTabsList.filter((tab) => normalizeFeatureName(tab) !== "informationsgenerales"),
    [featureTabsList]
  );

  useEffect(() => {
    const allowedFeatures = new Set(Array.from(tabFeatureOptionsMap.values()).flat());
    setSelectedFeatureNames((prev) => prev.filter((item) => allowedFeatures.has(item)));
  }, [tabFeatureOptionsMap]);
  useEffect(() => {
    if (selectedMainTypes.length > 0) return;
    if (selectedCategories.length === 0) return;
    setSelectedCategories([]);
  }, [selectedCategories, selectedMainTypes]);
  // Keep Home -> Advanced transfer lossless: do not auto-drop selected comfort/seaside filters.
  useEffect(() => {
    const allowedStanding = new Set(availableStandingOptions.map((item) => item.value).filter(Boolean));
    if (selectedStanding && !allowedStanding.has(selectedStanding)) {
      setSelectedStanding("");
    }
  }, [availableStandingOptions, selectedStanding]);

  const maxGuestsAvailable = useMemo(
    () => Math.max(2, ...modeProperties.map((p) => Math.max(1, Number(p.guests || 1)))),
    [modeProperties]
  );
  const validStayRanges = useMemo(
    () => (selectedMode === "location_saisonniere"
      ? stayRanges.filter((range) => isValidStayRange(range.start, range.end))
      : []),
    [selectedMode, stayRanges]
  );

  const buildManagedSearchParams = () => {
    const params = new URLSearchParams(searchParams);
    [
      "mode",
      "q",
      "location",
      "locations",
      "checkIn",
      "checkOut",
      "stayRanges",
      "mainType",
      "mainTypes",
      "categories",
      "features",
      "doubleRoomsMin",
      "parentRoomsMin",
      "simpleRoomsMin",
      "bathroomsMin",
      "climatizedRoomsMin",
      "paidServices",
      "seaside",
      "comfort",
      "standing",
      "guestsMin",
      "featured",
      "maxPrice",
      "tolerance",
      "sort",
    ].forEach((key) => params.delete(key));
    params.set("mode", selectedMode);
    if (query.trim()) params.set("q", query.trim());
    if (selectedLocations.length > 0) params.set("locations", selectedLocations.join(","));
    if (selectedMode === "location_saisonniere") {
      const validRanges = stayRanges.filter((range) => range.start || range.end);
      if (validRanges.length > 0) {
        params.set("stayRanges", serializeStayRangesParam(validRanges));
        if (validRanges[0]?.start) params.set("checkIn", validRanges[0].start);
        if (validRanges[0]?.end) params.set("checkOut", validRanges[0].end);
      }
    }
    if (selectedMainTypes.length > 0) params.set("mainTypes", selectedMainTypes.join(","));
    if (normalizedSelectedCategories.length > 0) params.set("categories", normalizedSelectedCategories.join(","));
    if (selectedFeatureNames.length > 0) params.set("features", selectedFeatureNames.join(","));
    if (minDoubleRooms > 0) params.set("doubleRoomsMin", String(minDoubleRooms));
    if (minParentRooms > 0) params.set("parentRoomsMin", String(minParentRooms));
    if (minSimpleRooms > 0) params.set("simpleRoomsMin", String(minSimpleRooms));
    if (minBathroomsCount > 0) params.set("bathroomsMin", String(minBathroomsCount));
    if (minClimatizedRooms > 0) params.set("climatizedRoomsMin", String(minClimatizedRooms));
    if (selectedPaidServices.length > 0) params.set("paidServices", selectedPaidServices.join(","));
    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
    if (selectedMode === "location_saisonniere" && selectedStanding) params.set("standing", selectedStanding);
    if (selectedMode === "location_saisonniere" && minGuests > 1) params.set("guestsMin", String(minGuests));
    if (isFeaturedOnly) params.set("featured", "true");
    if (priceMax < priceCeiling) params.set("maxPrice", String(priceMax));
    if (smartTolerance !== 75) params.set("tolerance", String(smartTolerance));
    if (sortMode !== "matching") params.set("sort", sortMode);
    return params;
  };

  useEffect(() => {
    const params = buildManagedSearchParams();
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [
    selectedMode,
    query,
    selectedLocations,
    stayRanges,
    selectedMainTypes,
    normalizedSelectedCategories,
    selectedFeatureNames,
    minDoubleRooms,
    minParentRooms,
    minSimpleRooms,
    minBathroomsCount,
    minClimatizedRooms,
    selectedPaidServices,
    selectedSeasideOptions,
    selectedComfortOptions,
    selectedStanding,
    minGuests,
    isFeaturedOnly,
    priceMax,
    smartTolerance,
    sortMode,
    priceCeiling,
    searchParams,
    setSearchParams,
  ]);

  const handleShareSearch = async (shareFlashOnly = false) => {
    const params = buildManagedSearchParams();
    const queryString = params.toString();
    const hasFlashResultsToShare = shareFlashOnly && flashDisplayResults.length > 0;
    const sharePath = hasFlashResultsToShare ? "/ventes_flash" : window.location.pathname;
    const relativeUrl = `${sharePath}${queryString ? `?${queryString}` : ""}`;
    let shareUrl = `${window.location.origin}${relativeUrl}`;
    const shareTitle = hasFlashResultsToShare ? "Ventes flash Dwira" : "Recherche Dwira";
    const shareText = hasFlashResultsToShare
      ? "Consultez cette selection de ventes flash filtrees sur Dwira."
      : "Consultez cette recherche filtree sur Dwira.";
    const copySuccessMessage = hasFlashResultsToShare ? "Lien de vente flash copié." : "Lien de recherche copié.";
    const copyErrorMessage = hasFlashResultsToShare ? "Impossible de copier le lien de vente flash." : "Impossible de copier le lien de recherche.";

    try {
      const base = String(API_URL || "").replace(/\/+$/, "");
      const response = await fetch(`${base}/search-share-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ relativeUrl }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.shortUrl) {
        shareUrl = String(payload.shortUrl).trim();
      }
    } catch {
      // Fall back to the full URL if the short-link service is unavailable.
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fall back to clipboard when native share is cancelled or unavailable.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(copySuccessMessage);
    } catch {
      toast.error(copyErrorMessage);
    }
  };

  const toggleCategory = (cat: string, scopeMainType?: PropertyMainType) => {
    if (selectedMainTypes.length === 0) return;
    const scopedCategory = scopeMainType ? encodeScopedCategory(scopeMainType, cat) : cat;
    const normalizedCategory = normalizeSelectedCategories([scopedCategory], selectedMainTypes)[0] || scopedCategory;
    setSelectedCategories((prev) => {
      const normalizedPrev = normalizeSelectedCategories(prev, selectedMainTypes);
      const exists = normalizedPrev.includes(normalizedCategory);
      if (exists) {
        return normalizedPrev.filter((item) => item !== normalizedCategory);
      }
      return normalizeSelectedCategories([...normalizedPrev, normalizedCategory], selectedMainTypes);
    });
  };
  const toggleLocation = (loc: string) => {
    setSelectedLocations((prev) => (prev.includes(loc) ? prev.filter((item) => item !== loc) : [...prev, loc]));
  };
  const resetCurrentLocationPath = () => {
    setLocationGouvernerat("");
    setLocationRegion("");
    setLocationZone("");
    setDraftSelectedGouvernerats([]);
    setDraftSelectedRegions([]);
    setDraftSelectedZones([]);
    setLocationSelectionStep("gouvernerat");
  };
  const confirmLocationSelection = () => {
    const nextLocations = dedupeHierarchicalLocations(draftSelectedLocations);
    setSelectedLocations(nextLocations);
  };
  const removeDraftLocationChip = (value: string) => {
    const parts = String(value || "").split("/").map((item) => item.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const target = parts[parts.length - 1];
      setDraftSelectedZones((prev) => prev.filter((item) => !isSameLocationToken(item, target)));
      return;
    }
    if (parts.length === 2) {
      const target = parts[parts.length - 1];
      setDraftSelectedRegions((prev) => prev.filter((item) => !isSameLocationToken(item, target)));
      setDraftSelectedZones((prev) =>
        prev.filter((zoneName) =>
          !normalizedZones.some((zone) => isSameLocationToken(zone.region, target) && isSameLocationToken(zone.quartier || zone.nom, zoneName))
        )
      );
      return;
    }
    if (parts.length === 1) {
      const target = parts[0];
      setDraftSelectedGouvernerats((prev) => prev.filter((item) => !isSameLocationToken(item, target)));
      setDraftSelectedRegions((prev) =>
        prev.filter((regionName) =>
          !normalizedZones.some((zone) => isSameLocationToken(zone.gouvernerat, target) && isSameLocationToken(zone.region, regionName))
        )
      );
      setDraftSelectedZones((prev) =>
        prev.filter((zoneName) =>
          !normalizedZones.some((zone) => isSameLocationToken(zone.gouvernerat, target) && isSameLocationToken(zone.quartier || zone.nom, zoneName))
        )
      );
    }
  };
  const toggleMainType = (mainType: PropertyMainType) => {
    setSelectedMainTypes((prev) => {
      const exists = prev.includes(mainType);
      const next = exists ? prev.filter((item) => item !== mainType) : [...prev, mainType];
      if (exists) {
        setSelectedCategories((current) => removeCategoriesForMainType(current, mainType));
      }
      return next;
    });
  };
  const updateStayRange = (index: number, key: "start" | "end", value: string) => {
    setStayRanges((prev) => prev.map((range, rangeIndex) => (rangeIndex === index ? { ...range, [key]: value } : range)));
  };
  const addStayRange = () => {
    setStayRanges((prev) => [...prev, { start: "", end: "" }]);
  };
  const removeStayRange = (index: number) => {
    setStayRanges((prev) => {
      if (prev.length <= 1) return [{ start: "", end: "" }];
      return prev.filter((_, rangeIndex) => rangeIndex !== index);
    });
  };
  const addDraftStayRange = () => {
    if (!calendarCheckIn || !calendarCheckOut) return;
    const range = {
      start: format(calendarCheckIn, "yyyy-MM-dd"),
      end: format(calendarCheckOut, "yyyy-MM-dd"),
    };
    setDraftStayRanges((prev) =>
      prev.some((item) => item.start === range.start && item.end === range.end) ? prev : [...prev, range]
    );
    setCalendarCheckIn(null);
    setCalendarCheckOut(null);
  };
  const confirmCalendarSelection = () => {
    const nextRanges = [...draftStayRanges];
    if (calendarCheckIn && calendarCheckOut) {
      const range = {
        start: format(calendarCheckIn, "yyyy-MM-dd"),
        end: format(calendarCheckOut, "yyyy-MM-dd"),
      };
      if (!nextRanges.some((item) => item.start === range.start && item.end === range.end)) {
        nextRanges.push(range);
      }
    }
    setStayRanges(nextRanges.length > 0 ? nextRanges : [{ start: "", end: "" }]);
  };
  const handleCalendarDateClick = (date: Date) => {
    if (isBefore(date, today)) return;
    if (!calendarCheckIn || (calendarCheckIn && calendarCheckOut)) {
      setCalendarCheckIn(date);
      setCalendarCheckOut(null);
      return;
    }
    if (date < calendarCheckIn) {
      setCalendarCheckIn(date);
      setCalendarCheckOut(calendarCheckIn);
      return;
    }
    setCalendarCheckOut(date);
  };
  const isDateInRange = (date: Date) => {
    if (!calendarCheckIn || !calendarCheckOut) return false;
    return isWithinInterval(date, {
      start: calendarCheckIn < calendarCheckOut ? calendarCheckIn : calendarCheckOut,
      end: calendarCheckIn < calendarCheckOut ? calendarCheckOut : calendarCheckIn,
    });
  };
  const getDayClassName = (date: Date) => {
    const isCurrentMonth = isSameMonth(date, currentMonth);
    const isPast = isBefore(date, today);
    const isStart = calendarCheckIn && isSameDay(date, calendarCheckIn);
    const isEnd = calendarCheckOut && isSameDay(date, calendarCheckOut);
    const isInRange = isDateInRange(date);
    let className = "flex h-10 w-10 items-center justify-center rounded-full text-sm transition-all ";
    if (!isCurrentMonth) className += "text-gray-300 ";
    else if (isPast) className += "cursor-not-allowed text-gray-300 ";
    else if (isStart || isEnd || isInRange) className += "bg-emerald-600 font-bold text-white shadow-lg ";
    else className += "text-gray-700 hover:bg-emerald-50 ";
    return className;
  };

  const toggleFeatureName = (name: string) => {
    setSelectedFeatureNames((prev) => (prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]));
  };
  const toggleExpandedTab = (tab: string) => {
    setExpandedFeatureTabs((prev) => (prev.includes(tab) ? prev.filter((item) => item !== tab) : [...prev, tab]));
  };
  const togglePaidService = (label: string) => {
    setSelectedPaidServices((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]));
  };
  const toggleSeasideOption = (key: HomeSeasideOptionKey) => {
    setSelectedSeasideOptions((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };
  const toggleComfortOption = (key: HomeComfortOptionKey) => {
    setSelectedComfortOptions((prev) => {
      if (POOL_OPTION_KEYS.includes(key)) {
        const withoutPool = prev.filter((item) => !POOL_OPTION_KEYS.includes(item));
        return prev.includes(key) ? withoutPool : [...withoutPool, key];
      }
      return prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key];
    });
  };

  const clearFilters = () => {
    setQuery("");
    setSelectedLocations([]);
    setStayRanges([{ start: "", end: "" }]);
    setSelectedCategories([]);
    setSelectedMainTypes([]);
    setSelectedFeatureNames([]);
    setMinDoubleRooms(0);
    setMinParentRooms(0);
    setMinSimpleRooms(0);
    setMinBathroomsCount(0);
    setMinClimatizedRooms(0);
    setExpandedFeatureTabs([]);
    setSelectedPaidServices([]);
    setShowPaidServicesModal(false);
    setSelectedPaidServiceCategory("");
    setSelectedPaidServiceTypeFilter("all");
    setSelectedSeasideOptions([]);
    setSelectedComfortOptions([]);
    setSelectedStanding("");
    setMinGuests(1);
    setIsFeaturedOnly(false);
    setPriceMax(priceCeiling);
    setSmartTolerance(35);
    setSortMode("matching");
    const next = new URLSearchParams(searchParams);
    [
      "q",
      "location",
      "locations",
      "checkIn",
      "checkOut",
      "stayRanges",
      "mainType",
      "mainTypes",
      "categories",
      "features",
      "doubleRoomsMin",
      "parentRoomsMin",
      "simpleRoomsMin",
      "bathroomsMin",
      "climatizedRoomsMin",
      "paidServices",
      "seaside",
      "comfort",
      "standing",
      "guestsMin",
      "featured",
      "maxPrice",
      "tolerance",
      "sort",
    ].forEach((key) => next.delete(key));
    next.set("mode", selectedMode);
    setSearchParams(next, { replace: true });
  };

  const scoringBuckets = useMemo(() => {
    const hasDateFilter = validStayRanges.length > 0;
    const requiresRdcComfortFallback = selectedComfortOptions.includes("rdc");
    const hasCoreFilters =
      Boolean(query.trim()) ||
      selectedLocations.length > 0 ||
      validStayRanges.length > 0 ||
      selectedCategories.length > 0 ||
      selectedSeasideOptions.length > 0 ||
      selectedComfortOptions.length > 0 ||
      selectedFeatureNames.length > 0 ||
      minDoubleRooms > 0 ||
      minParentRooms > 0 ||
      minSimpleRooms > 0 ||
      minBathroomsCount > 0 ||
      minClimatizedRooms > 0 ||
      Boolean(selectedStanding) ||
      minGuests > 1 ||
      isFeaturedOnly ||
      priceMax < priceCeiling;

    const selectedSubTypeKeys = normalizedSelectedCategories
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .filter((value) => !hasExplicitMainTypeInLabel(getCategoryDisplayLabel(value)))
      .map((value) => getCanonicalSubTypeKey(value))
      .filter(Boolean);
    const selectedRequestedSubTypeKeys = normalizedSelectedCategories
      .map((value) => getCanonicalSubTypeKey(getCategoryDisplayLabel(value)))
      .filter(Boolean);
    const selectedSubTypeMatchKeys = normalizedSelectedCategories
      .flatMap((value) => getSelectedSubTypeMatchKeys(value, selectedMainTypes))
      .filter(Boolean);
    const requestedMainTypesFromSelection = new Set<PropertyMainType>(
      Array.from(selectedTypeTargetsByMainType.keys())
    );
    const selectedGovernorates = new Set(
      selectedLocations
        .map((value) => extractSelectedGovernorate(value))
        .filter(Boolean)
    );

    const rows = properties
      .filter((property) => {
        const mode = property.mode || "location_saisonniere";
        if (mode !== selectedMode) return false;
        if (selectedGovernorates.size === 0) return true;
        const propertyGovernorate = getPropertyGovernorate(property);
        if (!propertyGovernorate) return false;
        return selectedGovernorates.has(propertyGovernorate);
      })
      .map((property) => {
        const sourceBien = bienById.get(String(property.id));
        const characteristicLines = (Array.isArray(sourceBien?.caracteristiques) ? sourceBien?.caracteristiques : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean);
        const extractNumericCharacteristic = (keywords: string[]) => {
          for (const line of characteristicLines) {
            const normalizedLine = normalizeFeatureName(line);
            if (!keywords.some((keyword) => normalizedLine.includes(normalizeFeatureName(keyword)))) continue;
            const parts = line.split(":");
            const rawValue = parts.length > 1 ? parts.slice(1).join(":").trim() : "";
            if (!rawValue) continue;
            const parsed = Number(String(rawValue).replace(",", "."));
            if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
          }
          return 0;
        };
        const propertyDoubleRooms = extractNumericCharacteristic(["nombre chambres double"]);
        const propertyParentRooms = extractNumericCharacteristic(["nombre chambres parentale", "nombre chambre parentale"]);
        const propertySimpleRooms = extractNumericCharacteristic(["nombre chambres simple", "nombre chambre simple"]);
        const propertyBathrooms = extractNumericCharacteristic(["nombre de salle de bain", "nombre salles de bain", "nombre salle de bain"]);
        const propertyClimatizedRooms = extractNumericCharacteristic(["nombres de chambres climatise", "nombre de chambres climatise", "chambres climatise"]);
        const propertyAmenities = propertyAmenityMap.get(String(property.id)) || property.amenities || [];
        const propertyFeatureTabs = propertyFeatureTabMap.get(String(property.id)) || [];
        const propertyPaidServices = propertyPaidServicesMap.get(String(property.id)) || [];
        const normalizedAmenities = propertyAmenities.map((item) => normalizeFeatureName(String(item || "")));
        const matchesAmenity = (selectedAmenity: string) => {
          const token = normalizeFeatureName(selectedAmenity);
          if (!token) return true;
          if (token.includes("acces") && token.includes("check-in")) {
            return Boolean(String(property.seasonalConfig?.checkinHeure || "").trim())
              || normalizedAmenities.some((item) =>
                item.includes("check-in")
                || item.includes("check in")
                || item.includes("acces")
              );
          }
          if (token.includes("balcon") && token.includes("terasse")) {
            return normalizedAmenities.some((item) =>
              item.includes("balcon")
              || item.includes("terrasse")
              || item.includes("terasse")
              || item.includes("exterieur")
              || item.includes("jardin")
            );
          }
          if (token.includes("pied dans l eau")) {
            return normalizedAmenities.some((item) =>
              item.includes("pied dans l eau")
              || item.includes("front de mer")
              || item.includes("bord de mer")
              || item.includes("acces direct plage")
            );
          }
          if (token.includes("vue sur mer")) {
            return normalizedAmenities.some((item) => item.includes("vue") && item.includes("mer"));
          }
          if (token.includes("proche de la plage")) {
            return normalizedAmenities.some((item) => item.includes("plage"));
          }
          if (token.includes("climatisation") || token.includes("climatise")) {
            return normalizedAmenities.some((item) => item.includes("clim"));
          }
          if (token.includes("toutes les pieces climatisees") || token.includes("toutes pieces climatisees")) {
            return normalizedAmenities.some((item) =>
              item.includes("toutes les pieces climatisees")
              || item.includes("toutes pieces climatisees")
              || item.includes("climatisation complete")
              || item.includes("climatisation dans toutes les pieces")
            );
          }
          if (token.includes("piscine privee")) {
            return normalizedAmenities.some((item) =>
              item.includes("piscine")
              && (item.includes("prive") || !item.includes("partag") && !item.includes("commune") && !item.includes("collectiv"))
            );
          }
          if (token.includes("piscine partagee")) {
            return normalizedAmenities.some((item) =>
              item.includes("piscine") && (item.includes("partag") || item.includes("commune") || item.includes("collectiv") || !item.includes("prive"))
            );
          }
          if (token.includes("rdc") || token.includes("rez de chaussee") || token.includes("ground floor")) {
            const etageRaw = getPropertyFloorRaw(property);
            return etageRaw === "rdc" || etageRaw === "0"
              || normalizedAmenities.some((item) =>
                item.includes("rdc")
                || item.includes("rez de chaussee")
                || item.includes("rez-de-chaussee")
                || item.includes("ground floor")
              );
          }
          if (token.includes("1er etage") || token.includes("premier etage") || token.includes("1st floor")) {
            const etageRaw = getPropertyFloorRaw(property);
            return etageRaw === "1"
              || etageRaw === "1er"
              || etageRaw === "1er etage"
              || etageRaw === "1er étage"
              || normalizedAmenities.some((item) =>
                item.includes("1er etage")
                || item.includes("premier etage")
                || item.includes("1st floor")
              );
          }
          if (token.includes("jardin") || token.includes("gazon") || token.includes("pelouse")) {
            return normalizedAmenities.some((item) =>
              item.includes("jardin")
              || item.includes("gazon")
              || item.includes("pelouse")
              || item.includes("espace vert")
            );
          }
          if (token.includes("jardin partage")) {
            return normalizedAmenities.some((item) => item.includes("jardin") && item.includes("partage"));
          }
          if (token.includes("jardin prive")) {
            return normalizedAmenities.some((item) =>
              item.includes("jardin prive")
              || (item.includes("jardin") && item.includes("prive"))
            );
          }
          if (token.includes("acces pmr")) {
            return normalizedAmenities.some((item) =>
              item.includes("acces pmr")
              || item.includes("pmr")
              || item.includes("mobilite reduite")
              || item.includes("fauteuil")
            );
          }
          if (token.includes("terrasse")) {
            return normalizedAmenities.some((item) => item.includes("terrasse"));
          }
          if (token.includes("acces direct plage")) {
            return normalizedAmenities.some((item) =>
              item.includes("acces direct plage")
              || item.includes("pied dans l eau")
              || item.includes("front de mer")
            );
          }
          if (token.includes("espace de jeux")) {
            return normalizedAmenities.some((item) => item.includes("espace de jeux") || item.includes("aire de jeux") || item.includes("jeux"));
          }
          if (token.includes("barbecue")) {
            return normalizedAmenities.some((item) => item.includes("barbecue") || item.includes("bbq"));
          }
          if (token.includes("materiel plage")) {
            return normalizedAmenities.some((item) => item.includes("materiel plage") || item.includes("equipement plage"));
          }
          if (token.includes("douche exterieure")) {
            return normalizedAmenities.some((item) => item.includes("douche exterieure"));
          }
          if (token.includes("mobilier exterieur")) {
            return normalizedAmenities.some((item) => item.includes("mobilier exterieur") || item.includes("salon de jardin"));
          }
          if (token.includes("parasol")) {
            return normalizedAmenities.some((item) => item.includes("parasol"));
          }
          if (token.includes("piscine")) {
            return normalizedAmenities.some((item) => item.includes("piscine"));
          }
          if (token.includes("smarttv") || token.includes("smart tv")) {
            return normalizedAmenities.some((item) => item.includes("smarttv") || item.includes("smart tv"));
          }
          if (token.includes("netflix")) {
            return normalizedAmenities.some((item) => item.includes("netflix"));
          }
          return normalizedAmenities.some((item) => item === token);
        };
        const textBlob = normalizeFeatureName(
          [
            property.title,
            property.description,
            property.location,
            property.category,
            ...(Array.isArray(propertyAmenities) ? propertyAmenities : []),
          ].join(" ")
        );
        const hasAny = (...tokens: string[]) =>
          tokens.some((token) => textBlob.includes(normalizeFeatureName(token)));
        let score = 0;
        let maxScore = 0;
        const hints: string[] = [];
        const missing: string[] = [];
        let exactDateAvailable = true;
        let exactDateBookable = true;
        let stayDateAlternative:
          | { kind: "shorter" | "longer" | "shifted_week"; shiftDays?: number; nightDelta?: number; start: string; end: string }
          | null = null;
        let dateFailureReason = "";
        let dateRuleType: "min_max" | "weekday" | "availability" | "other" | "none" = "none";

        const queryValue = query.trim().toLowerCase();
        if (queryValue) {
          maxScore += 10;
          const inText =
            property.title.toLowerCase().includes(queryValue) ||
            property.location.toLowerCase().includes(queryValue) ||
            property.category.toLowerCase().includes(queryValue) ||
            String(property.reference || "").toLowerCase().includes(queryValue);
          if (inText) score += 10;
        }

        let hasExactLocationMatch = false;
        if (selectedLocations.length > 0) {
          maxScore += 18;
          const locationMatches = selectedLocations.map((item) => propertyMatchesLocation(property, item));
          hasExactLocationMatch = locationMatches.some((item) => item.exact);
          if (hasExactLocationMatch) score += 18;
          else if (locationMatches.some((item) => item.partial)) score += 8;
          else missing.push("Emplacement partiellement different");
        }

        const resolvedCategoryLabel = getResolvedPropertyCategoryLabel(property);
        const propertyMainType = getMainTypeFromCategory(resolvedCategoryLabel || property.category || "");
        const propertySubTypeKey = getCanonicalSubTypeKey(resolvedCategoryLabel || property.category || "");
        const propertySubTypeMatchKey = propertySubTypeKey ? `${propertyMainType}::${propertySubTypeKey}` : "";
        const requestedTypeTarget = selectedTypeTargetsByMainType.get(propertyMainType)
          || (isResidenceGroupedProperty(property) ? selectedTypeTargetsByMainType.get("residence") || null : null);
        const requestedTypeMainLabel = requestedTypeTarget ? MAIN_TYPE_LABELS[requestedTypeTarget.mainType] : "";
        const requestedTypeSubLabel = requestedTypeTarget && requestedTypeTarget.displayLabels.length > 0
          ? requestedTypeTarget.displayLabels.join(" | ")
          : "";
        const requestedTypeDisplayLabel = [requestedTypeMainLabel, requestedTypeSubLabel].filter(Boolean).join(" ");
        const requestedTypeMatchKeys = requestedTypeTarget ? Array.from(requestedTypeTarget.matchKeys) : [];
        const requestedTypeSubTypeKeys = requestedTypeTarget ? Array.from(requestedTypeTarget.subTypeKeys) : [];
        const hasRequestedTypeSubFilter = requestedTypeMatchKeys.length > 0 || requestedTypeSubTypeKeys.length > 0;
        const hasResidenceScopedExactTypeMatch = isResidenceGroupedProperty(property)
          && normalizedSelectedCategories.some((category) => {
            if (getScopedCategoryMainType(category) !== "residence") return false;
            const displayLabel = getCategoryDisplayLabel(category);
            return getMainTypeFromCategory(displayLabel) === propertyMainType
              && getCanonicalSubTypeKey(displayLabel) === propertySubTypeKey;
          });
        const strictMainTypeMatch =
          selectedMainTypes.length === 0
          || selectedMainTypes.includes(propertyMainType)
          || (selectedMainTypes.includes("residence") && isResidenceGroupedProperty(property));
        const strictSubTypeMatch =
          !hasRequestedTypeSubFilter
          || requestedTypeMatchKeys.includes(propertySubTypeMatchKey)
          || hasResidenceScopedExactTypeMatch;
        if (selectedMainTypes.length > 0) {
          maxScore += 16;
          if (strictMainTypeMatch) score += 16;
          else missing.push("Type principal different");
        }
        if (hasRequestedTypeSubFilter) {
          maxScore += 16;
          if (strictSubTypeMatch) score += 16;
          else missing.push("Sous-type different");
        }

        const matchSeaside = selectedSeasideOptions.some((option) => propertyMatchesSeasideOption(property, option));
        const matchesPresPlage = propertyMatchesSeasideOption(property, "pres_plage");
        if (selectedSeasideOptions.length > 0) {
          maxScore += 10;
          if (matchSeaside) score += 10;
          else missing.push("Critere bord de mer incomplet");
        }

        const selectedPoolComfortOptions = selectedComfortOptions.filter((option) => POOL_OPTION_KEYS.includes(option));
        const selectedNonPoolComfortOptions = selectedComfortOptions.filter((option) => !POOL_OPTION_KEYS.includes(option));
        const matchComfort = selectedComfortOptions.every((option) => propertyMatchesComfortOption(property, option));
        const matchNonPoolComfort = selectedNonPoolComfortOptions.every((option) => propertyMatchesComfortOption(property, option));
        const hasSharedPoolAlternativeForPrivate = selectedPoolComfortOptions.includes("piscine_privee")
          && !propertyMatchesComfortOption(property, "piscine_privee")
          && propertyMatchesComfortOption(property, "piscine_partagee");
        const hasPoolAlternative = selectedPoolComfortOptions.length > 0
          && matchNonPoolComfort
          && selectedPoolComfortOptions.every((option) => option === "piscine_privee" && hasSharedPoolAlternativeForPrivate);
        if (selectedComfortOptions.length > 0) {
          maxScore += 10;
          if (matchComfort) score += 10;
          else missing.push("Confort partiel");
        }

        if (selectedFeatureNames.length > 0) {
          maxScore += 16;
          const matched = selectedFeatureNames.filter((am) => matchesAmenity(am)).length;
          score += Math.round((matched / selectedFeatureNames.length) * 16);
          if (matched < selectedFeatureNames.length) {
            const misses = selectedFeatureNames.filter((am) => !matchesAmenity(am)).slice(0, 2);
            missing.push(`Manque: ${misses.join(", ")}`);
            if (misses.some((item) => normalizeFeatureName(item).includes("wifi"))) {
              hints.push("Alternative: bien similaire sans Wifi, mais avec autres criteres proches");
            }
          }
        }
        if (minDoubleRooms > 0) {
          maxScore += 8;
          if (propertyDoubleRooms >= minDoubleRooms) score += 8;
          else missing.push("Chambres double insuffisantes");
        }
        if (minParentRooms > 0) {
          maxScore += 8;
          if (propertyParentRooms >= minParentRooms) score += 8;
          else missing.push("Chambres parentale insuffisantes");
        }
        if (minSimpleRooms > 0) {
          maxScore += 8;
          if (propertySimpleRooms >= minSimpleRooms) score += 8;
          else missing.push("Chambres simple insuffisantes");
        }
        if (minBathroomsCount > 0) {
          maxScore += 8;
          if (propertyBathrooms >= minBathroomsCount) score += 8;
          else missing.push("Salles de bain insuffisantes");
        }
        if (minClimatizedRooms > 0) {
          maxScore += 8;
          if (propertyClimatizedRooms >= minClimatizedRooms || hasAny("climatise", "climatisation")) score += 8;
          else missing.push("Chambres climatisees insuffisantes");
        }
        if (propertyFeatureTabs.length > 0 && selectedFeatureNames.length > 0) {
          maxScore += 10;
          const matchedTabsFromFeatures = new Set(
            selectedFeatureNames
              .flatMap((selected) =>
                propertyFeatureTabs.filter((tab) =>
                  (tabFeatureOptionsMap.get(tab) || []).some((featureName) => normalizeFeatureName(featureName) === normalizeFeatureName(selected))
                )
              )
          );
          const allSelectedTabs = new Set(
            Array.from(tabFeatureOptionsMap.entries())
              .filter(([, features]) => features.some((featureName) => selectedFeatureNames.some((selected) => normalizeFeatureName(selected) === normalizeFeatureName(featureName))))
              .map(([tab]) => tab)
          );
          score += Math.round((matchedTabsFromFeatures.size / Math.max(1, allSelectedTabs.size)) * 10);
        }
        if (selectedPaidServices.length > 0) {
          maxScore += 10;
          const matchedServices = selectedPaidServices.filter((service) =>
            propertyPaidServices.some((item) => normalizeFeatureName(item) === normalizeFeatureName(service))
          ).length;
          score += Math.round((matchedServices / selectedPaidServices.length) * 10);
          if (matchedServices < selectedPaidServices.length) missing.push("Services payants partiellement disponibles");
        }

        maxScore += 10;
        const currentPrice = Number(property.pricePerNight || 0);
        if (currentPrice <= priceMax) score += 10;
        else {
          const over = currentPrice - priceMax;
          const ratio = over / Math.max(1, priceMax);
          if (ratio <= 0.2) {
            score += 5;
            missing.push("Budget legerement au-dessus");
          } else {
            missing.push("Au-dessus du budget");
          }
        }

        if (isFeaturedOnly) {
          maxScore += 4;
          if (property.isFeatured) score += 4;
        }

        if (selectedMode === "location_saisonniere") {
          if (selectedStanding) {
            maxScore += 6;
            if (property.seasonalConfig?.categorieStanding === selectedStanding) score += 6;
            else missing.push("Standing different");
          }
          maxScore += 6;
          if (Math.max(1, Number(property.guests || 1)) >= minGuests) score += 6;
          else {
            const deltaGuests = minGuests - Math.max(1, Number(property.guests || 1));
            if (deltaGuests <= 1) score += 3;
            missing.push("Capacite voyageurs legerement inferieure");
          }

          if (hasDateFilter) {
            maxScore += 20;
            const firstUnavailableExactRange = validStayRanges.find((range) => !isPropertyStayRangeCalendarAvailable(property, range.start, range.end)) || null;
            const firstUnbookableExactRange = validStayRanges.find((range) => !evaluatePropertyStayBookability(property, range.start, range.end).ok) || null;
            const exactRange = firstUnavailableExactRange ? null : (validStayRanges[0] || null);
            const exactBookableRange = firstUnbookableExactRange ? null : (validStayRanges[0] || null);
            exactDateAvailable = !firstUnavailableExactRange;
            exactDateBookable = !firstUnbookableExactRange;
            if (exactDateAvailable) {
              if (exactDateBookable) {
                score += 20;
              } else {
                const exactAvailabilityRange = firstUnbookableExactRange || exactRange || validStayRanges[0];
                if (exactAvailabilityRange) {
                  const stayValidation = evaluatePropertyStayBookability(property, exactAvailabilityRange.start, exactAvailabilityRange.end);
                  if (stayValidation.reason) {
                    dateFailureReason = stayValidation.reason;
                    dateRuleType = classifyDateRuleReason(stayValidation.reason);
                  }
                  const alternative = findBestStayRangeAlternative({
                    startRaw: exactAvailabilityRange.start,
                    endRaw: exactAvailabilityRange.end,
                    isRangeValid: (candidateStart, candidateEnd) => evaluatePropertyStayBookability(property, candidateStart, candidateEnd).ok,
                    maxShiftDays: 7,
                    maxNightDelta: 7,
                  });
                  stayDateAlternative = alternative;
                  if (alternative) {
                    const altLabel = getStayAvailabilityAlternativeLabel(alternative);
                    hints.push(
                      `Alternative dates: ${formatDateLabel(alternative.start)} - ${formatDateLabel(alternative.end)}${altLabel ? ` (${altLabel})` : ""}`
                    );
                  } else {
                    missing.push(stayValidation.reason || "Dates non disponibles");
                  }
                }
              }
            } else {
              let failureReason = "Dates non disponibles";
              const alternatives = validStayRanges
                .map((range) => {
                  const stayValidation = evaluatePropertyStayBookability(property, range.start, range.end);
                  if (stayValidation.reason) failureReason = stayValidation.reason;
                  const alternative = findBestStayRangeAlternative({
                    startRaw: range.start,
                    endRaw: range.end,
                    isRangeValid: (candidateStart, candidateEnd) => evaluatePropertyStayBookability(property, candidateStart, candidateEnd).ok,
                    maxShiftDays: 7,
                    maxNightDelta: 7,
                  });
                  return alternative;
                })
                .filter(Boolean) as NonNullable<typeof stayDateAlternative>[];
              stayDateAlternative = alternatives[0] || null;
              dateFailureReason = failureReason;
              dateRuleType = classifyDateRuleReason(failureReason);
              if (!stayDateAlternative) {
                missing.push(failureReason || "Dates non disponibles");
              } else {
                const altLabel = getStayAvailabilityAlternativeLabel(stayDateAlternative);
                hints.push(
                  `Alternative dates: ${formatDateLabel(stayDateAlternative.start)} - ${formatDateLabel(stayDateAlternative.end)}${altLabel ? ` (${altLabel})` : ""}`
                );
              }
            }
          }
        }
        const selectedTabsFromFeatures = new Set(
          selectedFeatureNames
            .map((name) => {
              for (const [tab, features] of tabFeatureOptionsMap.entries()) {
                if (features.some((featureName) => normalizeFeatureName(featureName) === normalizeFeatureName(name))) return tab;
              }
              return "";
            })
            .filter(Boolean)
        );
        const matchedTabsCount = Array.from(selectedTabsFromFeatures).filter((tab) => propertyFeatureTabs.includes(tab)).length;
        const normalizedScore = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((score / maxScore) * 100))) : 100;
        const altNights = stayDateAlternative
          ? Math.max(0, Math.round((new Date(`${stayDateAlternative.end}T00:00:00`).getTime() - new Date(`${stayDateAlternative.start}T00:00:00`).getTime()) / 86400000))
          : 0;
        const selectedRangesWithNights = validStayRanges.map((range) => {
          const requestedNights = Math.max(0, Math.round((new Date(`${range.end}T00:00:00`).getTime() - new Date(`${range.start}T00:00:00`).getTime()) / 86400000));
          const shiftDays = stayDateAlternative
            ? Math.round((new Date(`${stayDateAlternative.start}T00:00:00`).getTime() - new Date(`${range.start}T00:00:00`).getTime()) / 86400000)
            : 0;
          return { requestedNights, shiftDays };
        });
        const hasDateShiftAlt = Boolean(
          stayDateAlternative
          && selectedRangesWithNights.some((candidate) =>
            candidate.requestedNights > 0
            && altNights === candidate.requestedNights
            && Math.abs(candidate.shiftDays) <= 7
          )
        );
        const hasDateReducedAlt = Boolean(
          stayDateAlternative
          && selectedRangesWithNights.some((candidate) =>
            candidate.requestedNights > 1
            && altNights === (candidate.requestedNights - 1)
            && (Math.abs(candidate.shiftDays) <= 1 || stayDateAlternative.kind === "shorter")
          )
        );
        const requestedSPlusValues = requestedTypeSubTypeKeys.map((item) => getSPlusValue(item)).filter((value): value is number => Number.isFinite(value as number));
        const selectedRequestedSPlusValues = selectedRequestedSubTypeKeys.map((item) => getSPlusValue(item)).filter((value): value is number => Number.isFinite(value as number));
        const propertySPlusValue = getSPlusValue(propertySubTypeKey);
        const bungalowAlternativeTargets = new Set<PropertyMainType>();
        if (selectedMainTypes.includes("villa_maison") || requestedMainTypesFromSelection.has("villa_maison")) {
          bungalowAlternativeTargets.add("villa_maison");
        }
        if (selectedMainTypes.includes("appartement") || requestedMainTypesFromSelection.has("appartement")) {
          bungalowAlternativeTargets.add("appartement");
        }
        if (selectedMainTypes.includes("bungalow") || requestedMainTypesFromSelection.has("bungalow")) {
          bungalowAlternativeTargets.add("bungalow");
        }
        const hasBungalowCrossMainAlternative = !strictMainTypeMatch && (
          (propertyMainType === "bungalow" && (bungalowAlternativeTargets.has("villa_maison") || bungalowAlternativeTargets.has("appartement")))
          || (propertyMainType === "villa_maison" && bungalowAlternativeTargets.has("bungalow"))
          || (propertyMainType === "appartement" && bungalowAlternativeTargets.has("bungalow"))
        );
        const hasCompatibleBungalowCrossSubType = selectedRequestedSPlusValues.length > 0
          ? selectedRequestedSPlusValues.some((requested) => propertySPlusValue !== null && propertySPlusValue === requested)
          : (
              selectedRequestedSubTypeKeys.length === 0
              || selectedRequestedSubTypeKeys.includes(propertySubTypeKey)
            );
        const hasTypeAlternative31 = hasBungalowCrossMainAlternative && hasCompatibleBungalowCrossSubType;
        const hasTypeAlternative32 = strictMainTypeMatch
          && requestedTypeSubTypeKeys.length === 1
          && !strictSubTypeMatch
          && requestedSPlusValues.some((requested) => propertySPlusValue !== null && Math.abs(propertySPlusValue - requested) === 1);
        const propertyRegionZone = getPropertyRegionZone(property);
        const propertyGovernorate = getPropertyGovernorate(property);
        const hasLocationAlternative = !hasExactLocationMatch && selectedLocations.length > 0 && selectedLocations.some((loc) => {
          const selectedGovernorate = extractSelectedGovernorate(loc);
          const selectedRegionZone = extractSelectedLocationRegionZone(loc);
          const sameGovernorate = Boolean(selectedGovernorate)
            && propertyGovernorate === selectedGovernorate;
          const sameRegionDifferentZone = Boolean(selectedRegionZone.region)
            && propertyRegionZone.region === selectedRegionZone.region
            && propertyRegionZone.zone
            && selectedRegionZone.zone
            && propertyRegionZone.zone !== selectedRegionZone.zone;
          const differentRegionSameGovernorate = sameGovernorate
            && Boolean(selectedRegionZone.region)
            && Boolean(propertyRegionZone.region)
            && propertyRegionZone.region !== selectedRegionZone.region;
          return sameRegionDifferentZone || differentRegionSameGovernorate;
        });
        const hasComfortFallbackFromBeach = selectedSeasideOptions.includes("pied_dans_eau")
          && !propertyMatchesSeasideOption(property, "pied_dans_eau")
          && matchesPresPlage;
        const hasComfortFallbackFromRdc = selectedComfortOptions.includes("rdc")
          && !propertyMatchesComfortOption(property, "rdc")
          && propertyMatchesComfortOption(property, "premier_etage");
        const genericComfortAlternative = selectedComfortOptions.length > 0
          && !matchComfort
          && selectedPoolComfortOptions.length === 0;
        const hasComfortAlternative = requiresRdcComfortFallback
          ? hasComfortFallbackFromRdc
          : genericComfortAlternative || hasComfortFallbackFromBeach || hasPoolAlternative;
        const hasDateRuleAlternative = Boolean(
          hasDateFilter
          && !exactDateAvailable
          && (
            Boolean(stayDateAlternative)
            || dateRuleType === "min_max"
          )
        );
        return {
          property,
          score: normalizedScore,
          strictTypeMatch: strictMainTypeMatch && strictSubTypeMatch,
          exactLocationMatch: selectedLocations.length === 0 || hasExactLocationMatch,
          exactSeasideMatch: selectedSeasideOptions.length === 0 || matchSeaside,
          exactDateAvailable,
          exactDateBookable,
          stayDateAlternative,
          details: {
            amenitiesMatched: selectedFeatureNames.length > 0
              ? `${selectedFeatureNames.filter((am) => matchesAmenity(am)).length}/${selectedFeatureNames.length}`
              : "n/a",
            tabsMatched: selectedFeatureNames.length > 0
              ? `${matchedTabsCount}/${Math.max(1, selectedTabsFromFeatures.size)}`
              : "n/a",
            servicesMatched: selectedPaidServices.length > 0
              ? `${selectedPaidServices.filter((service) => propertyPaidServices.some((item) => normalizeFeatureName(item) === normalizeFeatureName(service))).length}/${selectedPaidServices.length}`
              : "n/a",
          },
          hints: hints.slice(0, 2),
          missing: missing.slice(0, 2),
          hasLocationAlternative,
          hasDateShiftAlt,
          hasDateReducedAlt,
          hasTypeAlternative31,
          hasTypeAlternative32,
          exactComfortMatch: matchComfort,
          hasComfortAlternative,
          hasComfortFallbackFromBeach,
          hasComfortFallbackFromRdc,
          hasPoolAlternative,
          hasDateRuleAlternative,
          dateRuleType,
          dateFailureReason,
          requestedTypeDisplayLabel,
        };
      });

    const threshold = hasCoreFilters ? smartTolerance : 0;
    let primary = rows.filter(
      (row) =>
        row.strictTypeMatch
        && row.exactLocationMatch
        && row.score >= threshold
        && row.exactSeasideMatch
        && row.exactComfortMatch
        && (!requiresRdcComfortFallback || propertyMatchesComfortOption(row.property, "rdc"))
        && (!hasDateFilter || (row.exactDateAvailable && row.exactDateBookable))
    );
    const hasExplicitTypeFilter = selectedMainTypes.length > 0 || selectedSubTypeKeys.length > 0;
    const alternatives = rows.filter((row) => {
      if (requiresRdcComfortFallback && !row.hasComfortFallbackFromRdc) {
        return false;
      }
      const hasNonDateAlternative = Boolean(
        row.hasLocationAlternative
        || row.hasTypeAlternative31
        || row.hasTypeAlternative32
        || row.hasComfortAlternative
        || (!hasExplicitTypeFilter && !row.strictTypeMatch)
      );
      // When type filter is set, never allow broad type drift in alternatives.
      // Only keep type alternatives that respect configured margins/rules.
      if (hasExplicitTypeFilter && !row.strictTypeMatch && !row.hasTypeAlternative31 && !row.hasTypeAlternative32) {
        return false;
      }
      if (hasDateFilter) {
        const hasDateAlternative = row.hasDateRuleAlternative;
        const hasNonDateAlternativeWithExactDates = row.exactDateAvailable && row.exactDateBookable && hasNonDateAlternative;
        return hasDateAlternative || hasNonDateAlternativeWithExactDates;
      }
      return hasNonDateAlternative;
    }).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.property.isFeatured !== b.property.isFeatured) return a.property.isFeatured ? -1 : 1;
      return Number(b.property.rating || 0) - Number(a.property.rating || 0);
    });
    if (primary.length === 0) {
      primary = rows.filter(
        (row) =>
          row.strictTypeMatch
          && row.exactLocationMatch
          && row.exactSeasideMatch
          && row.exactComfortMatch
          && (!hasDateFilter || (row.exactDateAvailable && row.exactDateBookable))
      );
    }
    if (
      primary.length === 0
      && !hasDateFilter
      && !hasExplicitTypeFilter
      && selectedComfortOptions.length === 0
      && selectedSeasideOptions.length === 0
    ) {
      primary = [...rows].sort((a, b) => b.score - a.score).slice(0, 12);
    } else {
      primary = primary.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.property.isFeatured !== b.property.isFeatured) return a.property.isFeatured ? -1 : 1;
        return Number(b.property.rating || 0) - Number(a.property.rating || 0);
      });
    }
    return { primary, alternatives };
  }, [
      properties,
      selectedMode,
      query,
      selectedLocations,
      selectedCategories,
      selectedFeatureNames,
      minDoubleRooms,
      minParentRooms,
      minSimpleRooms,
      minBathroomsCount,
      minClimatizedRooms,
      selectedPaidServices,
      selectedSeasideOptions,
      selectedComfortOptions,
      propertyAmenityMap,
      propertyFeatureTabMap,
      propertyPaidServicesMap,
      tabFeatureOptionsMap,
      priceMax,
      isFeaturedOnly,
      selectedStanding,
      minGuests,
      stayRanges,
      smartTolerance,
      priceCeiling,
      selectedMainTypes,
      selectedTypeTargetsByMainType,
    ]);

  const activeFiltersCount =
    Number(Boolean(query.trim())) +
    selectedLocations.length +
    stayRanges.filter((range) => range.start || range.end).length +
    selectedMainTypes.length +
    selectedCategories.length +
    selectedFeatureNames.length +
    Number(minDoubleRooms > 0) +
    Number(minParentRooms > 0) +
    Number(minSimpleRooms > 0) +
    Number(minBathroomsCount > 0) +
    Number(minClimatizedRooms > 0) +
    selectedPaidServices.length +
    selectedSeasideOptions.length +
    selectedComfortOptions.length +
    Number(Boolean(selectedStanding)) +
    Number(minGuests > 1) +
    Number(Boolean(isFeaturedOnly)) +
    Number(priceMax < priceCeiling);

  useEffect(() => {
    if (!hasTrackingConsent()) return;
    const signature = JSON.stringify({
      mode: selectedMode,
      query: query.trim(),
      locations: selectedLocations,
      stayRanges,
      mainTypes: selectedMainTypes,
      categories: selectedCategories,
      features: selectedFeatureNames,
      paidServices: selectedPaidServices,
      seaside: selectedSeasideOptions,
      comfort: selectedComfortOptions,
      standing: selectedStanding,
      guestsMin: minGuests,
      featured: isFeaturedOnly,
      priceMax,
      activeFiltersCount,
      channel: trackingChannel,
    });
    if (trackedSearchFiltersSignatureRef.current === signature) return;
    trackedSearchFiltersSignatureRef.current = signature;
    void trackPublicClientInteraction({
      type: 'search_filters_applied',
      propertyTitle: 'Recherche biens',
      clientUserId: user?.role === 'user' ? user.id : undefined,
      clientEmail: user?.role === 'user' ? user.email : undefined,
      clientName: user?.role === 'user' ? user.name : undefined,
      sessionId: getOrCreateTrackingSessionId(),
      path: `${window.location.pathname}?${searchParams.toString()}`,
      channel: trackingChannel,
      referrerSource: document.referrer || undefined,
      metadata: {
        mode: selectedMode,
        query: query.trim() || null,
        locations: selectedLocations,
        stayRanges,
        mainTypes: selectedMainTypes,
        categories: selectedCategories,
        features: selectedFeatureNames,
        paidServices: selectedPaidServices,
        seaside: selectedSeasideOptions,
        comfort: selectedComfortOptions,
        standing: selectedStanding || null,
        guestsMin: minGuests,
        featuredOnly: isFeaturedOnly,
        priceMax,
        activeFiltersCount,
        channel: trackingChannel,
      },
    }).catch(() => {});
  }, [
    activeFiltersCount,
    isFeaturedOnly,
    minGuests,
    priceMax,
    query,
    searchParams,
    selectedCategories,
    selectedComfortOptions,
    selectedFeatureNames,
    selectedLocations,
    selectedMainTypes,
    selectedMode,
    selectedPaidServices,
    selectedSeasideOptions,
    selectedStanding,
    stayRanges,
    trackingChannel,
    user?.email,
    user?.id,
    user?.name,
    user?.role,
  ]);

  useEffect(() => {
    if (!["matching", "price", "featured"].includes(sortMode)) {
      setSortMode("matching");
    }
  }, [sortMode]);
  useEffect(() => {
    if (detailedFeatureTabsList.length === 0) return;
    if (expandedFeatureTabs.length > 0) return;
    setExpandedFeatureTabs([detailedFeatureTabsList[0]]);
  }, [detailedFeatureTabsList, expandedFeatureTabs]);
  useEffect(() => {
    if (selectedCharacteristicsCategory) setSelectedCharacteristicsCategory("");
    if (activeCharacteristicsCategoryModal) setActiveCharacteristicsCategoryModal("");
  }, [selectedCharacteristicsCategory, activeCharacteristicsCategoryModal]);
  useEffect(() => {
    if (!showPaidServicesModal) return;
    if (paidServiceCategories.length === 0) {
      if (selectedPaidServiceCategory) setSelectedPaidServiceCategory("");
      return;
    }
    if (!selectedPaidServiceCategory || !paidServiceCategories.some((item) => item.id === selectedPaidServiceCategory)) {
      setSelectedPaidServiceCategory(paidServiceCategories[0].id);
    }
  }, [showPaidServicesModal, paidServiceCategories, selectedPaidServiceCategory]);

  const sortedScoredResults = useMemo(() => {
    const list = [...scoringBuckets.primary];
    if (sortMode === "price") {
      return groupRowsBySuccessiveZone(
        list.sort((a, b) => Number(a.property.pricePerNight || 0) - Number(b.property.pricePerNight || 0))
      );
    }
    if (sortMode === "featured") {
      return groupRowsBySuccessiveZone(list.sort((a, b) => {
        if (a.property.isFeatured !== b.property.isFeatured) return a.property.isFeatured ? -1 : 1;
        return b.score - a.score;
      }));
    }
    return groupRowsBySuccessiveZone(list.sort((a, b) => b.score - a.score));
  }, [scoringBuckets.primary, sortMode]);
  const alternativeScoredResults = useMemo(() => {
    const list = [...scoringBuckets.alternatives];
    return list.sort((a, b) => b.score - a.score);
  }, [scoringBuckets.alternatives]);
  const groupedAlternativeSections = useMemo(() => {
    const prioritizeBeachComfort = selectedSeasideOptions.includes("pied_dans_eau");
    const sectionDefs: Array<{ key: string; title: string; match: (row: (typeof alternativeScoredResults)[number]) => boolean }> = prioritizeBeachComfort
      ? [
          { key: "comfort", title: "Alternative confort", match: (row) => row.hasComfortFallbackFromBeach || row.hasComfortAlternative },
          { key: "location_comfort", title: "Alternative emplacement et confort", match: (row) => row.hasLocationAlternative && row.hasComfortAlternative },
          { key: "dates_comfort", title: "Alternative date de sejour et confort", match: (row) => row.hasDateRuleAlternative && row.hasComfortAlternative },
          { key: "type_comfort", title: "Alternative type de bien et confort", match: (row) => (row.hasTypeAlternative31 || row.hasTypeAlternative32) && row.hasComfortAlternative },
          { key: "location_dates", title: "Alternative emplacement et dates de sejour", match: (row) => row.hasLocationAlternative && row.hasDateRuleAlternative },
          { key: "location_type", title: "Alternative emplacement et type de bien", match: (row) => row.hasLocationAlternative && (row.hasTypeAlternative31 || row.hasTypeAlternative32) },
          { key: "dates_type", title: "Alternative date de sejour et type de bien", match: (row) => row.hasDateRuleAlternative && (row.hasTypeAlternative31 || row.hasTypeAlternative32) },
          { key: "location", title: "Alternatives emplacement", match: (row) => row.hasLocationAlternative },
          { key: "dates", title: "Alternative dates de sejour", match: (row) => row.hasDateRuleAlternative },
          { key: "type", title: "Alternative type de bien", match: (row) => row.hasTypeAlternative31 || row.hasTypeAlternative32 },
        ]
      : [
          { key: "location_dates", title: "Alternative emplacement et dates de sejour", match: (row) => row.hasLocationAlternative && row.hasDateRuleAlternative },
          { key: "location_type", title: "Alternative emplacement et type de bien", match: (row) => row.hasLocationAlternative && (row.hasTypeAlternative31 || row.hasTypeAlternative32) },
          { key: "location_comfort", title: "Alternative emplacement et confort", match: (row) => row.hasLocationAlternative && row.hasComfortAlternative },
          { key: "dates_type", title: "Alternative date de sejour et type de bien", match: (row) => row.hasDateRuleAlternative && (row.hasTypeAlternative31 || row.hasTypeAlternative32) },
          { key: "dates_comfort", title: "Alternative date de sejour et confort", match: (row) => row.hasDateRuleAlternative && row.hasComfortAlternative },
          { key: "type_comfort", title: "Alternative type de bien et confort", match: (row) => (row.hasTypeAlternative31 || row.hasTypeAlternative32) && row.hasComfortAlternative },
          { key: "location", title: "Alternatives emplacement", match: (row) => row.hasLocationAlternative },
          { key: "dates", title: "Alternative dates de sejour", match: (row) => row.hasDateRuleAlternative },
          { key: "type", title: "Alternative type de bien", match: (row) => row.hasTypeAlternative31 || row.hasTypeAlternative32 },
          { key: "comfort", title: "Alternative confort", match: (row) => row.hasComfortAlternative },
        ];
    const buckets = new Map<string, { key: string; title: string; rows: typeof alternativeScoredResults }>();
    for (const def of sectionDefs) {
      buckets.set(def.key, { key: def.key, title: def.title, rows: [] });
    }
    const fallbackRows: typeof alternativeScoredResults = [];
    for (const row of alternativeScoredResults) {
      const firstMatch = sectionDefs.find((def) => def.match(row));
      if (!firstMatch) {
        fallbackRows.push(row);
        continue;
      }
      const target = buckets.get(firstMatch.key);
      if (target) target.rows.push(row);
    }
    const sections = Array.from(buckets.values()).filter((section) => section.rows.length > 0);
    if (fallbackRows.length > 0) {
      sections.push({
        key: "other",
        title: "Autres alternatives",
        rows: fallbackRows,
      });
    }
    return sections;
  }, [alternativeScoredResults, selectedSeasideOptions]);
  const packSearchContext = useMemo(() => getPackSearchContextFromParams(searchParams), [searchParams]);
  const matchingSearchPacks = useMemo(
    () => resolvePublicPropertyPacks(propertyPacks, properties, packSearchContext).slice(0, 4),
    [packSearchContext, properties, propertyPacks]
  );
  const packRequestLabel = useMemo(() => {
    if (packSearchContext.comboRequests.length > 0) {
      const comboLabel = formatPackCombinationRequestLabel(packSearchContext.comboRequests);
      return comboLabel ? `Combinaison ${comboLabel}` : "";
    }
    const requestedSubtypeScore = getRequestedPackSubtypeScore(packSearchContext);
    return requestedSubtypeScore > 0 ? `Combinaison S+${requestedSubtypeScore}` : "";
  }, [packSearchContext]);
  const hasStrictStaySearch = selectedMode === "location_saisonniere" && stayRanges.some((range) => isValidStayRange(range.start, range.end));
  const displayedPrimaryResults = useMemo<PrimaryDisplayResult[]>(() => {
    const flashRows: PrimaryDisplayResult[] = [];
    const regularRows: PrimaryDisplayResult[] = [];
    sortedScoredResults.forEach((row) => {
      const displayProperty = hasStrictStaySearch
        ? (getPropertyDisplayVariantForStayRanges(row.property, validStayRanges) || row.property)
        : row.property;
      const baseParams = new URLSearchParams(searchParams.toString());
      const flashOffers = filterFlashOffersByStayRanges(
        getPropertyFlashOffers(displayProperty),
        stayRanges,
        hasStrictStaySearch
      );
      const flashEntries = flashOffers.map((flashOffer) => {
        const flashParams = new URLSearchParams(baseParams.toString());
        flashParams.set("mode", "location_saisonniere");
        flashParams.set("checkIn", flashOffer.start);
        flashParams.set("checkOut", flashOffer.end);
        flashParams.set("stayRanges", serializeStayRangesParam([{ start: flashOffer.start, end: flashOffer.end }]));
        flashParams.set("flashOffer", "1");
        flashParams.set("flashStart", flashOffer.start);
        flashParams.set("flashEnd", flashOffer.end);
        flashParams.set("flashMode", flashOffer.mode);
        flashParams.set("flashMinNights", String(Math.max(1, Number(flashOffer.minimumNights || 1))));
        if (flashOffer.discountPercent !== null && flashOffer.discountPercent !== undefined) {
          flashParams.set("flashDiscount", String(flashOffer.discountPercent));
        }
        if (flashOffer.fixedNightlyAmount !== null && flashOffer.fixedNightlyAmount !== undefined) {
          flashParams.set("flashAmount", String(flashOffer.fixedNightlyAmount));
        }
        if (flashOffer.title) {
          flashParams.set("flashTitle", flashOffer.title);
        }
        if (flashOffer.id) {
          flashParams.set("flashId", flashOffer.id);
        }
        if (flashOffer.expiresAt) {
          flashParams.set("flashExpiresAt", flashOffer.expiresAt);
        }
        return { flashOffer, searchParams: flashParams.toString() };
      });
      if (flashEntries.length > 0) {
        flashRows.push({
          ...row,
          property: displayProperty,
          displayKey: `${displayProperty.id}-flash-group`,
          cardVariant: "flash",
          flashOffer: flashEntries[0].flashOffer,
          flashOffers: flashEntries.map((entry) => entry.flashOffer),
          searchParams: flashEntries[0].searchParams,
        });
      }
      regularRows.push({
        ...row,
        property: displayProperty,
        displayKey: String(displayProperty.id),
        cardVariant: "default",
        flashOffer: null,
        searchParams: baseParams.toString(),
      });
    });
    return [...flashRows, ...regularRows];
  }, [hasStrictStaySearch, searchParams, sortedScoredResults, stayRanges]);
  const flashDisplayResults = useMemo(
    () => displayedPrimaryResults.filter((row) => row.cardVariant === "flash"),
    [displayedPrimaryResults]
  );
  const regularDisplayResults = useMemo(
    () => displayedPrimaryResults.filter((row) => row.cardVariant !== "flash"),
    [displayedPrimaryResults]
  );
  const visibleRegularDisplayResults = useMemo(
    () => (showAllResults ? regularDisplayResults : regularDisplayResults.slice(0, visibleCount)),
    [regularDisplayResults, showAllResults, visibleCount]
  );
  const hasMoreResults = !showAllResults && regularDisplayResults.length > visibleCount;
  const loadNextResultsPage = useCallback(() => {
    setVisibleCount((prev) => (
      regularDisplayResults.length > prev ? prev + PAGE_SIZE : prev
    ));
  }, [regularDisplayResults.length]);
  const isLoadingInitialResults = loading && properties.length === 0 && biens.length === 0;

  useEffect(() => {
    if (!hasTrackingConsent()) return;
    if (isLoadingInitialResults) return;
    const resultIds = displayedPrimaryResults.slice(0, 12).map((row) => String(row.property.id));
    const signature = JSON.stringify({
      mode: selectedMode,
      channel: trackingChannel,
      count: displayedPrimaryResults.length,
      alternatives: alternativeScoredResults.length,
      ids: resultIds,
    });
    if (trackedSearchResultsSignatureRef.current === signature) return;
    trackedSearchResultsSignatureRef.current = signature;
    void trackPublicClientInteraction({
      type: 'search_results_viewed',
      propertyTitle: 'Resultats recherche',
      clientUserId: user?.role === 'user' ? user.id : undefined,
      clientEmail: user?.role === 'user' ? user.email : undefined,
      clientName: user?.role === 'user' ? user.name : undefined,
      sessionId: getOrCreateTrackingSessionId(),
      path: `${window.location.pathname}?${searchParams.toString()}`,
      channel: trackingChannel,
      referrerSource: document.referrer || undefined,
      metadata: {
        mode: selectedMode,
        channel: trackingChannel,
        displayedCount: displayedPrimaryResults.length,
        alternativeCount: alternativeScoredResults.length,
        propertyIds: resultIds,
      },
    }).catch(() => {});
  }, [
    alternativeScoredResults.length,
    displayedPrimaryResults,
    isLoadingInitialResults,
    searchParams,
    selectedMode,
    trackingChannel,
    user?.email,
    user?.id,
    user?.name,
    user?.role,
  ]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setShowAllResults(false);
    lastAutoLoadedResultsCountRef.current = 0;
  }, [
    selectedMode,
    query,
    selectedLocations,
    selectedCategories,
    selectedMainTypes,
    selectedFeatureNames,
    minDoubleRooms,
    minParentRooms,
    minSimpleRooms,
    minBathroomsCount,
    minClimatizedRooms,
    selectedPaidServices,
    selectedSeasideOptions,
    selectedComfortOptions,
    selectedStanding,
    minGuests,
    isFeaturedOnly,
    stayRanges,
    priceMax,
    smartTolerance,
    sortMode,
  ]);

  useEffect(() => {
    if (!hasMoreResults || showAllResults) return;
    const trigger = resultsAutoLoadTriggerRef.current;
    if (!trigger || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (lastAutoLoadedResultsCountRef.current === visibleCount) return;
        lastAutoLoadedResultsCountRef.current = visibleCount;
        loadNextResultsPage();
      },
      {
        rootMargin: "0px 0px 220px 0px",
        threshold: 0.05,
      }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMoreResults, showAllResults, visibleCount, loadNextResultsPage]);
  useEffect(() => {
    if (hasStrictStaySearch && sortedScoredResults.length === 0 && alternativeScoredResults.length > 0) {
      setTimeout(() => {
        if (alternativesAnchorRef.current) {
          alternativesAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 80);
    }
  }, [hasStrictStaySearch, sortedScoredResults.length, alternativeScoredResults.length]);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const handleQuickSearch = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsFilterOpen(false);
    }
    if (resultsAnchorRef.current) {
      resultsAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };
  const scrollToFilters = () => {
    if (filtersAnchorRef.current) {
      filtersAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleQuickToggleFilters = () => {
    setIsFilterOpen((prev) => {
      const next = !prev;
      if (!prev) {
        setTimeout(() => scrollToFilters(), 80);
      } else {
        scrollToFilters();
      }
      return next;
    });
  };
  const handleQuickResetFilters = () => {
    clearFilters();
    setIsFilterOpen(true);
    setTimeout(() => scrollToFilters(), 80);
  };
  const requestedLocationLabel = selectedLocations.join(" | ");
  const requestedMainTypeLabel = selectedMainTypes.map((item) => MAIN_TYPE_LABELS[item]).join(" | ");
  const requestedSubTypeLabel = normalizedSelectedCategories.map((item) => getCategoryDisplayLabel(item)).join(" | ");
  const isSubTypeSelected = (label: string, scopeMainType?: PropertyMainType) => {
    const scopedLabel = scopeMainType ? encodeScopedCategory(scopeMainType, label) : label;
    const normalizedLabel = normalizeSelectedCategories([scopedLabel], selectedMainTypes)[0] || scopedLabel;
    return normalizedSelectedCategories.includes(normalizedLabel);
  };
  const requestedComfortLabel = [
    ...selectedSeasideOptions.map((key) => SEASIDE_OPTION_LABELS[key]),
    ...selectedComfortOptions.map((key) => COMFORT_OPTION_LABELS[key]),
  ].join(" | ");
  const renderLocationAlternativeLine = (row: any) => {
    const requestedRaw = String(selectedLocations[0] || "").trim();
    const requestedParts = requestedRaw.split("/").map((item) => String(item || "").trim()).filter(Boolean);
    const requestedGov = requestedParts[0] || "";
    const requestedRegion = requestedParts.length >= 2 ? requestedParts[1] : "";
    const requestedZone = requestedParts.length >= 3 ? requestedParts[2] : "";

    const altHierarchy = row?.property?.filterProfile?.locationHierarchy || {};
    const altGov = String(altHierarchy?.gouvernerat || "").trim();
    const altRegion = String(altHierarchy?.region || "").trim();
    const altZone = String(altHierarchy?.quartier || row?.property?.filterProfile?.locationLabel || row?.property?.location || "").trim();

    const sameRegion = Boolean(
      normalizeFeatureName(requestedRegion)
      && normalizeFeatureName(requestedRegion) === normalizeFeatureName(altRegion)
    );
    const altRegionZone = [altRegion, altZone].filter(Boolean).join(" / ") || altZone || "-";

    return (
      <p>
        {requestedGov ? <span className="text-gray-600">{requestedGov}</span> : null}
        {requestedRegion ? (
          <>
            {requestedGov ? <span className="text-gray-500"> / </span> : null}
            <span className={sameRegion ? "text-gray-600" : "text-gray-500 line-through"}>{requestedRegion}</span>
          </>
        ) : null}
        {requestedZone ? (
          <>
            {(requestedGov || requestedRegion) ? <span className="text-gray-500"> / </span> : null}
            <span className="text-gray-500 line-through">{requestedZone}</span>
          </>
        ) : null}
        {" -> "}
        <span className="font-semibold text-red-600">{altRegionZone}</span>
      </p>
    );
  };
  const renderComfortAlternativeLine = (row: any) => {
    const parts: JSX.Element[] = [];
    if (row.hasPoolAlternative && selectedComfortOptions.includes("piscine_privee")) {
      parts.push(
        <span key="pool-alt">
          <span className="text-gray-500 line-through">Piscine privee</span>
          {" -> "}
          <span className="font-semibold text-red-600">Piscine partagee</span>
        </span>
      );
    }
    if (row.hasComfortFallbackFromRdc && selectedComfortOptions.includes("rdc")) {
      parts.push(
        <span key="rdc-alt">
          <span className="text-gray-500 line-through">RDC</span>
          {" -> "}
          <span className="font-semibold text-red-600">1er etage</span>
        </span>
      );
    }
    if (row.hasComfortFallbackFromBeach && selectedSeasideOptions.includes("pied_dans_eau")) {
      parts.push(
        <span key="beach-alt">
          <span className="text-gray-500 line-through">Pied dans l'eau</span>
          {" -> "}
          <span className="font-semibold text-red-600">Proche de la plage</span>
        </span>
      );
    }
    if (parts.length > 0) {
      return (
        <p>
          {parts.map((part, index) => (
            <span key={`comfort-alt-${index}`}>
              {index > 0 ? <span className="text-gray-400"> | </span> : null}
              {part}
            </span>
          ))}
        </p>
      );
    }
    return (
      <p>
        <span className="text-gray-500 line-through">{requestedComfortLabel}</span>
        {" -> "}
        <span className="font-semibold text-red-600">Confort alternatif</span>
      </p>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 pt-32">
      {!isAnnualComingSoon && (
        <div className="fixed right-1 top-1/2 z-[115] -translate-y-1/2 sm:right-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-gray-200/80 bg-white/95 p-1.5 shadow-xl backdrop-blur">
            <button
              type="button"
              onClick={handleQuickToggleFilters}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-emerald-700 transition-colors hover:bg-emerald-50"
              title={isFilterOpen ? "Masquer les filtres" : "Afficher les filtres"}
              aria-label={isFilterOpen ? "Masquer les filtres" : "Afficher les filtres"}
            >
              <SlidersHorizontal size={18} />
            </button>
            <button
              type="button"
              onClick={handleQuickResetFilters}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-700 transition-colors hover:bg-gray-100"
              title="Reinitialiser les filtres"
              aria-label="Reinitialiser les filtres"
            >
              <RotateCcw size={18} />
            </button>
            <button
              type="button"
              onClick={handleQuickSearch}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700"
              title="Rechercher"
              aria-label="Rechercher"
            >
              <Search size={18} />
            </button>
          </div>
        </div>
      )}
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-4">
          <button
            type="button"
            onClick={handleGoBack}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ChevronDown size={16} className="rotate-90" />
            Retour
          </button>
        </div>
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-gray-900">Nos Biens Immobiliers</h1>
            <p className="text-gray-600">Filtres optimises pour trouver vite le bien qui vous correspond.</p>
          </div>
          <button
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
              isFilterOpen ? "bg-emerald-700 text-white shadow-lg" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal size={16} />
            {isFilterOpen ? "Masquer les filtres" : `Afficher les filtres${activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}`}
          </button>
          <div className="inline-flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Tri</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as "matching" | "price" | "featured")}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="matching">Meilleur matching</option>
              <option value="price">Prix croissant</option>
              <option value="featured">Biens vedette</option>
            </select>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {orderedModeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setSelectedMode(tab.value)}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                selectedMode === tab.value
                  ? "border-emerald-200 bg-white text-emerald-800 shadow-[0_10px_30px_rgba(15,23,42,0.10)]"
                  : "border-gray-200 bg-white/70 text-gray-700 hover:bg-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!isAnnualComingSoon && (
          <AnimatePresence initial={false}>
            {isFilterOpen && (
            <motion.div
              ref={filtersAnchorRef}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-10 overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.10)]"
            >
              <div className="border-b border-emerald-100 bg-[linear-gradient(135deg,#f4fbf8_0%,#ffffff_60%,#eef8f3_100%)] px-5 py-4 md:px-7">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Filtres adaptes</p>
                <p className="mt-1 text-sm text-gray-600">
                  {selectedMode === "location_saisonniere"
                    ? "Recherche saisonniere: standing, voyageurs, dates et prix."
                    : "Recherche annuelle: emplacement, type, caracteristiques et budget."}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2 md:p-7 lg:grid-cols-12">
                <div className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 lg:col-span-4">
                  <label className="text-sm font-bold text-gray-900">Recherche</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Titre, reference, zone..."
                      className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                      <MapPin size={14} className="text-emerald-600" /> Emplacement
                    </label>
                    {draftSelectedLocations.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {draftSelectedLocations.map((item) => (
                          <span key={`adv-location-${item}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                            {item}
                            <button type="button" onClick={() => removeDraftLocationChip(item)}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="rounded-[26px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Tunisie</p>
                          <h3 className="mt-2 text-lg font-bold text-gray-900">{locationStepMeta[locationSelectionStep].title}</h3>
                          <p className="mt-1 text-sm text-gray-600">{locationStepMeta[locationSelectionStep].subtitle}</p>
                        </div>
                        <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-semibold text-emerald-700">
                          {locationSelectionStep === "gouvernerat" ? "1/3" : locationSelectionStep === "region" ? "2/3" : "3/3"}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftSelectedLocations([]);
                            resetCurrentLocationPath();
                            setSelectedLocations([]);
                          }}
                          className={`w-full rounded-xl px-4 py-3 text-left text-sm transition-colors ${selectedLocations.length === 0 ? "bg-emerald-50 font-semibold text-emerald-700" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                        >
                          Tous les emplacements
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (locationSelectionStep === "gouvernerat") return;
                            setLocationSelectionStep(locationSelectionStep === "zone" ? "region" : "gouvernerat");
                          }}
                          disabled={locationSelectionStep === "gouvernerat"}
                          className="w-full rounded-xl border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Précédent
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (locationSelectionStep === "gouvernerat") {
                              setLocationSelectionStep("region");
                              return;
                            }
                            if (locationSelectionStep === "region") {
                              setLocationSelectionStep("zone");
                              return;
                            }
                            confirmLocationSelection();
                          }}
                          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          {locationSelectionStep === "zone" ? "Confirmer la sélection" : "Suivant"}
                        </button>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3">
                        {locationStepMeta[locationSelectionStep].options.map((item) => {
                          const level = locationSelectionStep;
                          const selected = level === "gouvernerat"
                            ? isTokenInList(draftSelectedGouvernerats, item)
                            : level === "region"
                              ? isTokenInList(draftSelectedRegions, item)
                              : isTokenInList(draftSelectedZones, item);
                          return (
                            <button
                              key={`adv-location-step-${level}-${item}`}
                              type="button"
                              onClick={() => {
                                if (level === "gouvernerat") applyGovernorateSelection(item);
                                if (level === "region") applyRegionSelection(item);
                                if (level === "zone") applyZoneSelection(item);
                              }}
                              className={`group relative h-28 overflow-hidden rounded-2xl border ${locationCardSelectionClass(selected)}`}
                            >
                              {renderSelectionCheckbox(selected)}
                              <img src={getLocationOptionImage(level, item)} alt={item} className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                              <div className={`pointer-events-none absolute inset-0 ${selected ? "bg-emerald-950/25" : "bg-black/40"}`} />
                              <div className="relative z-10 flex h-full items-center p-4 text-left">
                                {renderSelectionLabel(item)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>

                <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-3 sm:p-4 lg:col-span-5">
                  <label className="text-sm font-bold text-gray-900">Type de bien</label>
                  {draftSelectedMainTypes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {draftSelectedMainTypes.map((item) => (
                        <span key={`adv-main-${item}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                          {MAIN_TYPE_LABELS[item]}
                          <button type="button" onClick={() => toggleDraftMainTypeSelection(item)}>
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-2.5 sm:p-3">
                    <button
                      type="button"
                      className={`w-full rounded-xl px-4 py-3 text-left text-sm transition-colors ${draftCategories.length === 0 && draftSelectedMainTypes.length === 0 ? "bg-emerald-50 font-semibold text-emerald-700" : "text-gray-700 hover:bg-gray-50"}`}
                      onClick={() => {
                        setDraftMainType("");
                        setDraftSelectedMainTypes([]);
                        setDraftCategories([]);
                        setTypeSelectionStep("main");
                        setSelectedMainTypes([]);
                        setSelectedCategories([]);
                      }}
                    >
                      Tous les types
                    </button>
                    <p className="mt-3 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{typeSelectionStep === "main" ? "Type principal" : "Sous-type"}</p>
                    <div className={`mt-3 transition-all duration-300 ${typeSelectionStep === "main" ? "translate-x-0 opacity-100" : "-translate-x-8 pointer-events-none absolute inset-0 opacity-0"}`}>
                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                        {groupedTypeOptions.map((group) => (
                          <button
                            key={`adv-main-type-${group.mainType}`}
                            type="button"
                            onClick={() => toggleDraftMainTypeSelection(group.mainType)}
                            className={`relative h-24 overflow-hidden rounded-lg border text-left sm:h-28 sm:rounded-xl lg:h-24 xl:h-28 ${draftSelectedMainTypes.includes(group.mainType) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                          >
                            {renderSelectionCheckbox(draftSelectedMainTypes.includes(group.mainType))}
                            <img src={resolveTypeImageUrl(group.imageUrl)} alt={group.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                            <div className="pointer-events-none absolute inset-0 bg-black/40" />
                            <span className="relative z-10 px-3 sm:px-4">{renderSelectionLabel(group.label)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={`mt-3 transition-all duration-300 ${typeSelectionStep === "sub" ? "translate-x-0 opacity-100" : "pointer-events-none absolute inset-0 translate-x-8 opacity-0"}`}>
                      <button type="button" onClick={() => setTypeSelectionStep("main")} className="mb-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                        <ChevronLeft size={14} /> Retour types principaux
                      </button>
                      {draftSelectedMainTypes.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                          Selectionnez d'abord un type principal.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                          {draftSecondaryTypeOptions.map((cat) => {
                            const scopeMainType = cat.selectionScope || draftMainType || cat.matchMainType;
                            const isSelected = isCategorySelectedForMainTypes(draftCategories, cat.label, draftSelectedMainTypes, scopeMainType);
                            return (
                              <button
                                key={`adv-sub-type-${scopeMainType || "any"}-${cat.label}`}
                                type="button"
                                onClick={() => toggleDraftCategory(cat.label, scopeMainType)}
                                className={`relative h-20 overflow-hidden rounded-lg border text-left sm:h-24 sm:rounded-xl ${isSelected ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                              >
                                {renderSelectionCheckbox(isSelected)}
                                <img src={resolveTypeImageUrl(cat.imageUrl)} alt={getCategoryDisplayLabel(cat.label)} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                                <div className="pointer-events-none absolute inset-0 bg-black/40" />
                                <span className="relative z-10 px-2.5 sm:px-3">{renderSelectionLabel(getCategoryDisplayLabel(cat.label))}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={confirmTypeSelection} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
                    Valider le type
                  </button>

                  {selectedMode === "location_saisonniere" && (
                    <div className="space-y-3 border-t border-gray-200 pt-3">
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                        <Calendar size={14} className="text-emerald-600" /> Date de séjour
                      </label>
                      {draftStayRanges.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {draftStayRanges.map((range) => (
                            <span key={`adv-stay-${range.start}-${range.end}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                              {format(parseISO(range.start), "d MMM", { locale: fr })} - {format(parseISO(range.end), "d MMM", { locale: fr })}
                              <button type="button" onClick={() => setDraftStayRanges((prev) => prev.filter((item) => item.start !== range.start || item.end !== range.end))}>
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100">
                            <ChevronLeft size={20} />
                          </button>
                          <h3 className="font-bold capitalize text-gray-900">{format(currentMonth, "MMMM yyyy", { locale: fr })}</h3>
                          <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100">
                            <ChevronRight size={20} />
                          </button>
                        </div>
                        <div className="mb-2 grid grid-cols-7 gap-1">
                          {weekDays.map((day) => (
                            <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500">{day}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {days.map((day, idx) => (
                            <button key={`adv-calendar-${idx}`} type="button" onClick={() => handleCalendarDateClick(day)} className={getDayClassName(day)}>
                              {format(day, "d")}
                            </button>
                          ))}
                        </div>
                        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                          <button
                            type="button"
                            onClick={addDraftStayRange}
                            disabled={!calendarCheckIn || !calendarCheckOut}
                            className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Ajouter cette période
                          </button>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs">
                              <div className="h-3 w-3 rounded-full bg-emerald-600" />
                              <span className="text-gray-600">Sélectionné</span>
                            </div>
                            <button type="button" onClick={confirmCalendarSelection} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                              Valider
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 lg:col-span-3">
                  <label className="text-sm font-bold text-gray-900">Reglages de recherche</label>
                  {selectedMode === "location_saisonniere" && (
                    <>
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                        <Sparkles size={14} className="text-emerald-600" /> Standing
                      </label>
                      <select
                        value={selectedStanding}
                        onChange={(e) => setSelectedStanding(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-500"
                      >
                        {availableStandingOptions.map((opt) => (
                          <option key={opt.value || "all"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                            <Users size={14} className="text-emerald-600" /> Voyageurs minimum
                          </label>
                          <span className="text-sm font-semibold text-emerald-700">{minGuests}+</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max={maxGuestsAvailable}
                          step="1"
                          value={minGuests}
                          onChange={(e) => setMinGuests(parseInt(e.target.value, 10))}
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-emerald-600"
                        />
                      </div>
                      <div className="space-y-2 rounded-xl p-1">
                        <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                          <Waves size={14} className="text-emerald-600" />
                          Bord de mer
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                          {availableSeasideOptions.map((key) => (
                            <button
                              key={`adv-seaside-${key}`}
                              type="button"
                              onClick={() => toggleSeasideOption(key)}
                              className={`relative h-16 overflow-hidden rounded-xl border text-left ${
                                selectedSeasideOptions.includes(key) ? "ring-2 ring-emerald-400" : "border-gray-200"
                              }`}
                            >
                              <img src={resolveTypeImageUrl(getHomeFilterOptionImage("seaside", key) || TYPE_FALLBACK_IMAGE)} alt={SEASIDE_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                              <div className="pointer-events-none absolute inset-0 bg-black/40" />
                              <span className="relative z-10 px-3 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{SEASIDE_OPTION_LABELS[key]}</span>
                            </button>
                          ))}
                          {availableSeasideOptions.length === 0 && (
                            <p className="text-xs text-gray-500">Aucune option disponible pour les biens actuels.</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 rounded-xl p-1">
                        <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                          <Wind size={14} className="text-emerald-600" />
                          Confort
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                          {availableComfortOptions.map((key) => (
                            <button
                              key={`adv-comfort-${key}`}
                              type="button"
                              onClick={() => toggleComfortOption(key)}
                              className={`relative h-16 overflow-hidden rounded-xl border text-left ${
                                selectedComfortOptions.includes(key) ? "ring-2 ring-emerald-400" : "border-gray-200"
                              }`}
                            >
                              <img src={resolveTypeImageUrl(getHomeFilterOptionImage("comfort", key) || TYPE_FALLBACK_IMAGE)} alt={COMFORT_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                              <div className="pointer-events-none absolute inset-0 bg-black/40" />
                              <span className="relative z-10 px-3 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{COMFORT_OPTION_LABELS[key]}</span>
                            </button>
                          ))}
                          {availableComfortOptions.length === 0 && (
                            <p className="text-xs text-gray-500">Aucune option disponible pour les biens actuels.</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <div className="mb-2 flex justify-between">
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                        <Percent size={14} className="text-emerald-600" /> Tolerance matching
                      </label>
                      <span className="text-sm font-semibold text-emerald-700">{smartTolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="5"
                      value={smartTolerance}
                      onChange={(e) => setSmartTolerance(parseInt(e.target.value, 10))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-emerald-600"
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between">
                      <label className="text-sm font-bold text-gray-900">
                        <span className="inline-flex items-center gap-2"><Coins size={14} className="text-emerald-600" />Prix max {selectedMode === "location_annuelle" ? "/ mois" : "/ nuit"}</span>
                      </label>
                      <span className="text-sm font-semibold text-emerald-700">{priceMax} TND</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={priceCeiling}
                      step="50"
                      value={priceMax}
                      onChange={(e) => setPriceMax(parseInt(e.target.value, 10))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-emerald-600"
                    />
                    <div className="mt-1 flex justify-between text-xs text-gray-500">
                      <span>0</span>
                      <span>{priceCeiling} TND</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFeaturedOnly((prev) => !prev)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      isFeaturedOnly
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"
                    }`}
                  >
                    <span className="font-semibold">Biens en vedette</span>
                    <span
                      className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                        isFeaturedOnly ? "bg-emerald-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          isFeaturedOnly ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-2 text-sm font-medium text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <X size={14} /> Reinitialiser les filtres
                  </button>
                </div>

              </div>
            </motion.div>
            )}
          </AnimatePresence>
        )}

        {isAnnualComingSoon ? (
          <ComingSoonState
            title="Mode Location annuelle"
            description="Le mode Location annuelle est en stabilisation cote client. Merci de revenir tres bientot."
            backTo="/"
          />
        ) : (
          <div ref={resultsAnchorRef}>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {isLoadingInitialResults ? (
                  <span className="font-medium text-gray-500">Chargement des biens...</span>
                ) : (
                  <>
                    <span className="font-medium text-gray-500">
                      {regularDisplayResults.length > 0
                        ? `${regularDisplayResults.length} resultat${regularDisplayResults.length !== 1 ? "s" : ""} trouve${regularDisplayResults.length !== 1 ? "s" : ""}`
                        : matchingSearchPacks.length > 0
                          ? `${matchingSearchPacks.length} pack${matchingSearchPacks.length !== 1 ? "s" : ""} compatible${matchingSearchPacks.length !== 1 ? "s" : ""}`
                          : "0 resultat trouve"}
                    </span>
                    {flashDisplayResults.length > 0 && (
                      <span className="text-sm font-medium text-orange-600">{flashDisplayResults.length} vente{flashDisplayResults.length !== 1 ? "s" : ""} flash</span>
                    )}
                    {alternativeScoredResults.length > 0 && <span className="text-sm text-gray-500">{alternativeScoredResults.length} choix alternatives</span>}
                  </>
                )}
              </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleShareSearch(false)}
                    disabled={isLoadingInitialResults}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Share2 size={16} />
                    <span>Partager la recherche</span>
                  </button>
                  {flashDisplayResults.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleShareSearch(true)}
                      disabled={isLoadingInitialResults}
                      className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Share2 size={16} />
                      <span>Partager vente flash</span>
                    </button>
                  )}
                </div>
              </div>

            {isLoadingInitialResults ? (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`property-loading-${index}`} className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
                    <div className="h-64 animate-pulse bg-slate-100" />
                    <div className="space-y-4 p-6">
                      <div className="h-4 w-24 animate-pulse rounded-full bg-slate-100" />
                      <div className="h-8 w-4/5 animate-pulse rounded-2xl bg-slate-100" />
                      <div className="h-5 w-2/3 animate-pulse rounded-full bg-slate-100" />
                      <div className="grid grid-cols-3 gap-3">
                        <div className="h-10 animate-pulse rounded-2xl bg-emerald-50" />
                        <div className="h-10 animate-pulse rounded-2xl bg-emerald-50" />
                        <div className="h-10 animate-pulse rounded-2xl bg-emerald-50" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (regularDisplayResults.length > 0 || flashDisplayResults.length > 0 || matchingSearchPacks.length > 0) ? (
              <div className="space-y-8">
                {flashDisplayResults.length > 0 && (
                  <div className="rounded-[30px] border border-orange-100 bg-[linear-gradient(135deg,#fff7ed,#fff1f2)] px-4 py-5 shadow-[0_18px_44px_rgba(249,115,22,0.08)] md:px-6 md:py-7">
                    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <h3 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                          <Flame className="text-orange-500" size={24} />
                          Ventes flash
                        </h3>
                        <p className="mt-2 max-w-2xl text-sm text-slate-600">
                          Offres limitées séparées du catalogue principal, une seule carte par bien avec toutes les periodes flash.
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700">
                        {flashDisplayResults.length} bien{flashDisplayResults.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                      {flashDisplayResults.map((row) => (
                        <div key={row.displayKey} className="space-y-2">
                          <PropertyCard property={row.property} searchParams={row.searchParams} cardVariant={row.cardVariant} flashOffer={row.flashOffer} flashOffers={row.flashOffers} pricingAmicaleId={resolvedPricingAmicaleId} partnerAgencyMarginMultiplier={resolvedPartnerAgencyMarginMultiplier} publicPartnerSlug={publicPartnerSlug} />
                          <div className="rounded-xl border border-orange-100 bg-white/80 p-3">
                            {row.hints.length > 0 && (
                              <p className="text-xs text-orange-800">{row.hints.join(" | ")}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {regularDisplayResults.length > 0 ? (
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                    {visibleRegularDisplayResults.map((row) => (
                      <div key={row.displayKey} className="space-y-2">
                        <PropertyCard property={row.property} searchParams={row.searchParams} cardVariant={row.cardVariant} flashOffer={row.flashOffer} pricingAmicaleId={resolvedPricingAmicaleId} partnerAgencyMarginMultiplier={resolvedPartnerAgencyMarginMultiplier} publicPartnerSlug={publicPartnerSlug} />
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                          {row.hints.length > 0 && (
                            <p className="text-xs text-emerald-800">{row.hints.join(" | ")}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {hasMoreResults && (
                  <div ref={resultsAutoLoadTriggerRef} className="h-1 w-full" aria-hidden="true" />
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white py-20 text-center shadow-sm">
                <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                  <Search size={40} className="text-gray-400" />
                </div>
                <h3 className="mb-2 text-2xl font-bold text-gray-900">Aucun bien trouve</h3>
                <p className="mx-auto mb-8 max-w-md text-gray-500">
                  Elargissez les criteres de recherche ou reinitialisez les filtres.
                </p>
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center rounded-lg bg-emerald-600 px-8 py-3 font-bold text-white shadow-lg transition-colors hover:bg-emerald-700"
                >
                  Tout effacer
                </button>
              </div>
            )}
            {regularDisplayResults.length > PAGE_SIZE && (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {hasMoreResults && (
                  <button
                    type="button"
                    onClick={loadNextResultsPage}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    Suivant
                  </button>
                )}
                {!showAllResults && (
                  <>
                    <Link
                      to="/packs"
                      className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-[linear-gradient(135deg,#fff8d6,#facc15)] px-5 py-2.5 text-sm font-semibold text-amber-900 shadow-[0_12px_24px_rgba(245,158,11,0.14)] transition-colors hover:brightness-105"
                    >
                      Voir nos packs
                    </Link>
                    <button
                      type="button"
                      onClick={() => setShowAllResults(true)}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                    >
                      Voir tout le catalogue
                    </button>
                  </>
                )}
              </div>
            )}
            {matchingSearchPacks.length > 0 && (
              <div className="mt-10 rounded-[30px] border border-amber-200 bg-[linear-gradient(135deg,#fffdf3,#fff7ed)] p-5 shadow-[0_18px_44px_rgba(245,158,11,0.08)]">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">Packs combines</h3>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700">
                    {matchingSearchPacks.length} choix
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {matchingSearchPacks.map((pack) => {
                    const packHrefParams = new URLSearchParams(searchParams.toString());
                    const variantValue = getPackVariantParamValue(pack);
                    if (variantValue) packHrefParams.set("variantBienIds", variantValue);
                    const packHref = `${buildPropertyPackPath(pack)}${packHrefParams.toString() ? `?${packHrefParams.toString()}` : ''}`;
                    return (
                    <Link
                      key={pack.variantKey}
                      to={packHref}
                      className="overflow-hidden rounded-[26px] border border-amber-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <div className="grid gap-0 md:grid-cols-[1.12fr_0.88fr]">
                        <div className="relative min-h-[260px] overflow-hidden bg-slate-100 md:min-h-full">
                          <SmartImage
                            src={pack.coverImage}
                            alt={pack.name}
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                            targetWidth={960}
                            quality={58}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
                          <div className="absolute left-4 top-4 inline-flex items-center rounded-full bg-amber-400/95 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-950">
                            Pack
                          </div>
                          <div className="absolute bottom-4 left-4 right-4">
                            <h4 className="text-lg font-bold text-white">{pack.name}</h4>
                            <p className="mt-1 text-sm text-white/85">
                              {packSearchContext.comboRequests.length > 0
                                ? (packRequestLabel || `${pack.properties.length} biens combines`)
                                : pack.matchedRequestedSubtypeScore > 0
                                  ? `Combinaison S+${pack.matchedRequestedSubtypeScore}`
                                  : (packRequestLabel || (pack.matchedSubtypeScore > 0 ? `Combinaison S+${pack.matchedSubtypeScore}` : `${pack.properties.length} biens combines`))}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm text-slate-600">{pack.searchSummary || pack.shortDescription}</p>
                              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                                <MapPin size={15} className="text-emerald-600" />
                                <span>{pack.locationSummary}</span>
                              </div>
                            </div>
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                              {pack.properties.length} bien{pack.properties.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {pack.matchedReferences.slice(0, 4).map((reference) => (
                              <span key={`${pack.variantKey}-${reference}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                                {reference}
                              </span>
                            ))}
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                            <div className="rounded-2xl bg-slate-50 px-3 py-3">
                              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Biens</p>
                              <p className="mt-1 font-semibold text-slate-950">{pack.properties.length}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-3 py-3">
                              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Voyageurs</p>
                              <p className="mt-1 font-semibold text-slate-950">{pack.maxGuests}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-3 py-3">
                              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Prix / nuit</p>
                              <p className="mt-1 font-semibold text-slate-950">{Math.round(pack.totalNightlyPrice)} TND</p>
                            </div>
                          </div>
                          {pack.galleryImages.length > 1 && (
                            <div className="mt-auto pt-4">
                              <div className="grid grid-cols-3 gap-2">
                              {pack.galleryImages.slice(1, 4).map((image, imageIndex) => (
                                <SmartImage
                                  key={`${pack.variantKey}-thumb-${imageIndex}`}
                                  src={image}
                                  alt={`${pack.name} ${imageIndex + 2}`}
                                  className="h-20 w-full rounded-2xl object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  fetchPriority="low"
                                  targetWidth={280}
                                  quality={46}
                                />
                              ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                    );
                  })}
                </div>
              </div>
            )}
            {alternativeScoredResults.length > 0 && (
              <div ref={alternativesAnchorRef} className="mt-10">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Choix alternatives</h3>
                  <span className="text-sm text-gray-500">{alternativeScoredResults.length} bien(s)</span>
                </div>
                <div className="space-y-10">
                  {groupedAlternativeSections.map((section) => (
                    <div key={section.key}>
                      <div className="mb-4 flex items-center justify-between">
                        <h4 className="text-base font-semibold text-gray-900">{section.title}</h4>
                        <span className="text-xs text-gray-500">{section.rows.length} bien(s)</span>
                      </div>
                      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                        {section.rows.map((row) => {
                          const alternativeRanges = row.stayDateAlternative?.start && row.stayDateAlternative?.end
                            ? [{ start: row.stayDateAlternative.start, end: row.stayDateAlternative.end }]
                            : validStayRanges;
                          const displayProperty = hasStrictStaySearch
                            ? (getPropertyDisplayVariantForStayRanges(row.property, alternativeRanges) || row.property)
                            : row.property;
                          return (
                          <div key={`${section.key}-${displayProperty.id}`} className="space-y-2">
                            <PropertyCard
                              property={displayProperty}
                              searchParams={(() => {
                                const params = new URLSearchParams(searchParams);
                                if (row.stayDateAlternative?.start) params.set("checkIn", row.stayDateAlternative.start);
                                if (row.stayDateAlternative?.end) params.set("checkOut", row.stayDateAlternative.end);
                                if (row.stayDateAlternative?.start || row.stayDateAlternative?.end) {
                                  params.set("stayRanges", serializeStayRangesParam([{
                                    start: row.stayDateAlternative?.start || "",
                                    end: row.stayDateAlternative?.end || "",
                                  }]));
                                }
                                return params.toString();
                              })()}
                              pricingAmicaleId={resolvedPricingAmicaleId}
                              partnerAgencyMarginMultiplier={resolvedPartnerAgencyMarginMultiplier}
                              publicPartnerSlug={publicPartnerSlug}
                            />
                            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                              <div className="space-y-1 text-xs">
                                {row.hasLocationAlternative && requestedLocationLabel && (
                                  renderLocationAlternativeLine(row)
                                )}
                                {(row.hasTypeAlternative31 || row.hasTypeAlternative32) && (row.requestedTypeDisplayLabel || requestedMainTypeLabel || requestedSubTypeLabel) && (
                                  <p>
                                    <span className="text-gray-500 line-through">{row.requestedTypeDisplayLabel || [requestedMainTypeLabel, requestedSubTypeLabel].filter(Boolean).join(" ")}</span>
                                    {" -> "}
                                    <span className="font-semibold text-red-600">{getResolvedPropertyCategoryLabel(displayProperty)}</span>
                                  </p>
                                )}
                                {row.hasDateRuleAlternative && stayRanges[0]?.start && stayRanges[0]?.end && row.stayDateAlternative && (
                                  <p>
                                    <span className="text-gray-500 line-through">{formatDateLabel(stayRanges[0].start)} - {formatDateLabel(stayRanges[0].end)}</span>
                                    {" -> "}
                                    <span className="font-semibold text-red-600">{formatDateLabel(row.stayDateAlternative.start)} - {formatDateLabel(row.stayDateAlternative.end)}</span>
                                  </p>
                                )}
                                {row.hasDateRuleAlternative && stayRanges[0]?.start && stayRanges[0]?.end && !row.stayDateAlternative && (
                                  <p>
                                    <span className="text-gray-500 line-through">{formatDateLabel(stayRanges[0].start)} - {formatDateLabel(stayRanges[0].end)}</span>
                                    {" -> "}
                                    <span className="font-semibold text-red-600">{formatDateAlternativeReason(row.dateFailureReason)}</span>
                                  </p>
                                )}
                                {row.hasComfortAlternative && requestedComfortLabel && (
                                  renderComfortAlternativeLine(row)
                                )}
                                <p className="text-amber-700">{getStayAvailabilityAlternativeLabel(row.stayDateAlternative) || "Alternative"}</p>
                              </div>
                            </div>
                          </div>
                        )})}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {activeCharacteristicsCategoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setActiveCharacteristicsCategoryModal("")}
          >
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-2xl rounded-2xl border border-emerald-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Options de categorie</p>
                  <h3 className="text-lg font-bold text-gray-900">{activeCharacteristicsCategoryModal}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCharacteristicsCategoryModal("")}
                  className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                  aria-label="Fermer popup options"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-[65vh] overflow-y-auto p-4">
                <div className="flex flex-wrap gap-2">
                  {(tabFeatureOptionsMap.get(activeCharacteristicsCategoryModal) || []).map((featureName) => (
                    <button
                      key={`feature-modal-${activeCharacteristicsCategoryModal}-${featureName}`}
                      type="button"
                      onClick={() => toggleFeatureName(featureName)}
                      className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                        selectedFeatureNames.includes(featureName)
                          ? "border-emerald-500 bg-emerald-100 text-emerald-800 font-semibold"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {featureName}
                    </button>
                  ))}
                </div>
                {(tabFeatureOptionsMap.get(activeCharacteristicsCategoryModal) || []).length === 0 && (
                  <p className="text-sm text-gray-500">Aucune option disponible pour cette categorie.</p>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setActiveCharacteristicsCategoryModal("")}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Terminer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {showPaidServicesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-3 sm:p-5"
            onClick={() => setShowPaidServicesModal(false)}
          >
            <motion.div
              initial={{ y: 18, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 18, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="max-h-[86vh] w-[min(96vw,920px)] overflow-hidden rounded-[1.8rem] border border-gray-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-100 px-5 pb-4 pt-6 sm:px-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 sm:text-3xl">Services payants</h3>
                    <p className="mt-2 text-xs text-gray-600 sm:text-sm">
                      Choisissez d'abord une categorie, puis filtrez par type de tarification.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPaidServicesModal(false)}
                    className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                    aria-label="Fermer popup services payants"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(86vh-108px)] overflow-y-auto px-4 pb-6 pt-4 sm:px-7 sm:pb-8">
                <div className="space-y-5">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-900 sm:text-sm">{paidServicesCatalog.length} services disponibles</div>
                        <p className="mt-1 text-[11px] text-gray-600 sm:text-xs">Navigation par besoin client et type de tarification.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPaidServiceTypeFilter("all");
                          if (paidServiceCategories.length > 0) setSelectedPaidServiceCategory(paidServiceCategories[0].id);
                        }}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-emerald-300 hover:text-emerald-700"
                      >
                        Tout afficher
                      </button>
                    </div>
                  </div>

                  <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex w-max min-w-full gap-2.5">
                      {paidServiceCategories.map((category) => {
                        const isActive = category.id === selectedPaidServiceCategory;
                        const selectedCount = category.services.filter((service) => selectedPaidServices.includes(service.label)).length;
                        const imageUrl = getPaidServiceCategoryImage(category.label);
                        return (
                          <button
                            key={`paid-service-category-${category.id}`}
                            type="button"
                            onClick={() => setSelectedPaidServiceCategory(category.id)}
                            className={`min-w-[200px] rounded-2xl border p-3 text-left transition ${
                              isActive ? "border-emerald-300 bg-emerald-50 shadow-sm" : "border-gray-200 bg-white hover:border-emerald-200"
                            }`}
                          >
                            <div className="relative h-20 overflow-hidden rounded-xl border border-white/70 bg-slate-100">
                              <img
                                src={imageUrl}
                                alt={category.label}
                                className="absolute inset-0 h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                              <div className="absolute inset-0 bg-black/20" />
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-gray-900">{category.label}</span>
                              {selectedCount > 0 && (
                                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">{selectedCount}</span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-gray-500">{category.services.length} service(s)</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedPaidServiceCategoryData && (
                    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedPaidServiceTypeFilter("all")}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedPaidServiceTypeFilter === "all" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"}`}
                        >
                          Tous ({selectedPaidServiceCategoryData.services.length})
                        </button>
                        {(["fixe", "a_partir_de", "sur_demande"] as const).map((type) => {
                          const count = selectedPaidServiceCategoryData.services.filter((service) => service.type_tarification === type).length;
                          if (count === 0) return null;
                          const meta = getPaidServiceTypeMeta(type);
                          const active = selectedPaidServiceTypeFilter === type;
                          return (
                            <button
                              key={`paid-service-type-${type}`}
                              type="button"
                              onClick={() => setSelectedPaidServiceTypeFilter(type)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? meta.className : "border-gray-200 bg-white text-gray-700"}`}
                            >
                              {meta.label} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedPaidServiceCategoryData ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                      <p className="text-sm font-semibold text-emerald-900">{selectedPaidServiceCategoryData.label}</p>
                      <p className="mt-1 text-xs text-emerald-800">
                        {visiblePaidServices.length} service(s) visible(s) pour cette categorie.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                      Choisissez une categorie de services.
                    </div>
                  )}

                  {selectedPaidServiceCategoryData && visiblePaidServices.length > 0 && (
                    <div className="space-y-3">
                      {visiblePaidServices.map((service) => {
                        const isSelected = selectedPaidServices.includes(service.label);
                        const typeMeta = getPaidServiceTypeMeta(service.type_tarification);
                        return (
                          <button
                            key={`paid-service-item-${service.id}-${service.label}`}
                            type="button"
                            onClick={() => togglePaidService(service.label)}
                            className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                              isSelected ? "border-emerald-500 bg-emerald-50 shadow-[0_8px_20px_rgba(16,185,129,0.10)]" : "border-gray-200 bg-white hover:border-emerald-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-base font-semibold text-gray-900">{service.label}</span>
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${typeMeta.className}`}>
                                    {typeMeta.label}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">{service.categorie || "Services client"}</p>
                                <p className="mt-2 text-sm text-gray-600">
                                  {service.description_courte || "Service additionnel disponible pour ce logement."}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-lg font-bold text-gray-900">{getServiceDisplayPrice(service)}</div>
                                <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${isSelected ? "border-emerald-500 bg-emerald-600 text-white" : "border-gray-300 text-gray-600"}`}>
                                  {isSelected ? "Selectionne" : "Selectionner"}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedPaidServiceCategoryData && visiblePaidServices.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                      Aucun service ne correspond a ce filtre.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end border-t border-gray-100 px-5 py-3 sm:px-7">
                <button
                  type="button"
                  onClick={() => setShowPaidServicesModal(false)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Terminer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



