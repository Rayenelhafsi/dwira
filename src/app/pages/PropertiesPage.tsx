import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Check, MapPin, Search, SlidersHorizontal, Sparkles, Users, X, Waves, Wind, Percent, Coins, ListFilter, Layers, ConciergeBell, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useProperties } from "../context/PropertiesContext";
import { PropertyCard } from "../components/PropertyCard";
import { getServiceDisplayPrice, normalizeServicePayant, type NormalizedServicePayant } from "../utils/servicePayants";
import ComingSoonState from "../components/ComingSoonState";
import { PUBLIC_COMING_SOON } from "../config/publicAvailability";
import {
  findBestStayRangeAlternative,
  getStayAvailabilityAlternativeLabel,
  isValidStayRange,
  resolveStayAvailability,
} from "../utils/availability";
import { getReservationMinStayRequirement, validateReservationWeekdayRule } from "../utils/seasonalPricing";

type ListingMode = "vente" | "location_annuelle" | "location_saisonniere";
type PropertyMainType = "appartement" | "villa_maison" | "studio" | "immeuble" | "autre";
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
  villa_maison: "Villa / Maison",
  studio: "Studio",
  immeuble: "Immeuble",
  autre: "Autre",
};
const MAIN_TYPE_DISPLAY_ORDER: PropertyMainType[] = [
  "appartement",
  "villa_maison",
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
  if (selectedParts.length > 1) {
    const allPartsMatch = selectedParts.every((part) =>
      normalizedValues.some((value) => value === part || value.includes(part) || part.includes(value))
    );
    if (allPartsMatch) {
      return { exact: true, partial: true };
    }
  } else if (normalizedValues.includes(normalizedSelected)) {
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
  return parts[0] || "";
};
const getPropertyRegionZone = (property: any): { region: string; zone: string } => {
  const h = property?.filterProfile?.locationHierarchy || {};
  const region = normalizeFeatureName(h?.region || h?.gouvernerat || h?.pays || property?.filterProfile?.locationLabel || property?.location || "");
  const zone = normalizeFeatureName(h?.quartier || h?.zone || property?.filterProfile?.locationLabel || property?.location || "");
  return { region, zone };
};
const getPropertyGovernorate = (property: any): string => {
  const h = property?.filterProfile?.locationHierarchy || {};
  return normalizeFeatureName(h?.gouvernerat || "");
};

const getMainTypeFromCategory = (category: string): PropertyMainType => {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized.includes("appartement")) return "appartement";
  if (normalized.startsWith("s+")) return "appartement";
  if (normalized.includes("bungalow")) return "villa_maison";
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
  if (raw === "appartement" || raw === "villa_maison" || raw === "studio" || raw === "immeuble" || raw === "autre") {
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
const getSelectedSubTypeMatchKeys = (value: string, selectedMainTypes: PropertyMainType[]) => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (hasExplicitMainTypeInLabel(raw) || selectedMainTypes.length === 0) {
    const key = getMainTypeSubTypeMatchKey(raw);
    return key ? [key] : [];
  }
  return Array.from(new Set(
    selectedMainTypes
      .map((mainType) => buildMainTypeSubTypeMatchKey(mainType, raw))
      .filter(Boolean)
  ));
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
  return ["appartement", "villa", "maison", "villa maison", "bungalow"].includes(normalized);
};
const getResolvedPropertyCategoryLabel = (property: any): string => {
  const rawCategory = String(property?.category || "").trim();
  const title = String(property?.title || "").trim();
  const titleSPlus = title.match(/s\+\d+/i)?.[0]?.toUpperCase() || "";
  const rawSPlus = rawCategory.match(/s\+\d+/i)?.[0]?.toUpperCase() || "";
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
  const shouldInferSPlusSubtype = inferredMainType === "appartement" || inferredMainType === "villa_maison";
  const mainLabelByType: Record<PropertyMainType, string> = {
    appartement: "Appartement",
    villa_maison: normalizedPlainCategory.includes("maison") && !normalizedPlainCategory.includes("villa") ? "Maison" : "Villa",
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
    return (Boolean(sc?.vueMer) && hasDistance && distancePlage <= 50)
      || hasAny("pied dans l eau", "front de mer", "bord de mer", "acces direct plage");
  }
  if (option === "vue_sur_mer") return sc?.vue === "mer" || Boolean(sc?.vueMer) || hasAny("vue sur mer", "vue mer");
  if (option === "pres_plage") {
    return Boolean(sc?.prochePlage) || (hasDistance && distancePlage <= 300)
      || hasAny("proche plage", "pres de la plage", "a quelques pas de la plage", "plage");
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
    return hasStructuredAny("piscine privee", "piscine privée");
  }
  if (option === "piscine_partagee") {
    return hasStructuredAny("piscine partagee", "piscine partagée");
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

  const requiredMinStay = getReservationMinStayRequirement({
    startDate: startRaw,
    endDate: endRaw,
    periods: stayRules?.pricingPeriods || property?.pricingPeriods || [],
    fallbackMinStay: minStay,
  });
  if (nights < requiredMinStay) {
    return { ok: false, reason: `Sejour minimum ${requiredMinStay} nuit(s).` };
  }
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

export default function PropertiesPage() {
  const PAGE_SIZE = 10;
  const { properties, biens, zones, modePriorities, loading } = useProperties();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ListingMode>("location_saisonniere");
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);
  const filtersAnchorRef = useRef<HTMLDivElement | null>(null);
  const alternativesAnchorRef = useRef<HTMLDivElement | null>(null);
  const [modeFeaturesByType, setModeFeaturesByType] = useState<Record<string, FeatureApiRow[]>>({});
  const [modeFeatureTabsByType, setModeFeatureTabsByType] = useState<Record<string, FeatureTabApiRow[]>>({});
  const [advancedPanel, setAdvancedPanel] = useState<"tabs" | "services">("tabs");
  const [typeFilterImageRows, setTypeFilterImageRows] = useState<Array<{ mode_bien: string; main_type: string; sub_type: string | null; image_url: string }>>([]);
  const [homeFilterOptionImageRows, setHomeFilterOptionImageRows] = useState<Array<{ mode_bien: string; filter_group: string; option_key: string; image_url: string }>>([]);

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
    searchParams.get("categories")?.split(",").filter(Boolean) || []
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
  const [showAllResults, setShowAllResults] = useState(false);
  const isAnnualComingSoon = PUBLIC_COMING_SOON.locationAnnuelle && selectedMode === "location_annuelle";
  const primaryStayRange = stayRanges[0] || { start: "", end: "" };
  const checkIn = primaryStayRange.start;
  const checkOut = primaryStayRange.end;

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
    const mainTypes = parseCsvParam(searchParams.get("mainTypes") || searchParams.get("mainType")) as PropertyMainType[];
    if (mainTypes.length === 0) return;
    setSelectedMainTypes(mainTypes);
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
    const groups = new Map<PropertyMainType, { mainType: PropertyMainType; label: string; imageUrl: string; subTypes: Array<{ label: string; imageUrl: string }> }>();
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
      if (!subType) continue;
      const mainType = getMainTypeFromCategory(String(row.main_type || ""));
      const group = groups.get(mainType);
      if (!group) continue;
      const canonicalSubType = getCanonicalSubTypeKey(subType);
      if (!group.subTypes.some((item) => getCanonicalSubTypeKey(item.label) === canonicalSubType)) {
        group.subTypes.push({ label: subType, imageUrl: row.image_url || TYPE_FALLBACK_IMAGE });
      }
      if (!group.imageUrl || group.imageUrl === TYPE_FALLBACK_IMAGE) {
        group.imageUrl = row.image_url || group.imageUrl;
      }
    }

    for (const option of availableTypeOptions) {
      const mainType = getMainTypeFromCategory(option.label);
      const group = groups.get(mainType);
      if (!group) continue;
      const canonicalSubType = getCanonicalSubTypeKey(option.label);
      if (!group.subTypes.some((item) => getCanonicalSubTypeKey(item.label) === canonicalSubType)) {
        group.subTypes.push({ label: option.label, imageUrl: option.imageUrl });
      }
      if (!group.imageUrl || group.imageUrl === TYPE_FALLBACK_IMAGE) {
        group.imageUrl = option.imageUrl || group.imageUrl;
      }
    }

    return Array.from(groups.values())
      .map((group) => {
        const hasSpecificSPlus = group.subTypes.some((item) => /^s\+\d+$/.test(getCanonicalSubTypeKey(item.label)));
        if (!hasSpecificSPlus) return group;
        return {
          ...group,
          subTypes: group.subTypes.filter((item) => !isGenericPropertySubtype(item.label)),
        };
      })
      .filter((group) => group.subTypes.length > 0 || group.imageUrl !== TYPE_FALLBACK_IMAGE)
      .sort((a, b) => MAIN_TYPE_DISPLAY_ORDER.indexOf(a.mainType) - MAIN_TYPE_DISPLAY_ORDER.indexOf(b.mainType));
  }, [availableTypeOptions, selectedMode, typeFilterImageRows]);
  const secondaryTypeOptions = useMemo(() => {
    if (selectedMainTypes.length === 0) return availableTypeOptions;
    const merged = new Map<string, { label: string; imageUrl: string }>();
    groupedTypeOptions
      .filter((group) => selectedMainTypes.includes(group.mainType))
      .forEach((group) => {
        group.subTypes.forEach((subType) => {
          const key = buildMainTypeSubTypeMatchKey(group.mainType, subType.label) || subType.label;
          if (!merged.has(key)) merged.set(key, subType);
        });
      });
    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [availableTypeOptions, groupedTypeOptions, selectedMainTypes]);
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

  useEffect(() => {
    const mainTypeAllowed = new Set(groupedTypeOptions.map((item) => item.mainType));
    setSelectedMainTypes((prev) => prev.filter((item) => mainTypeAllowed.has(item)));
  }, [groupedTypeOptions]);
  useEffect(() => {
    if (selectedMainTypes.length === 0) return;
    const canonicalToLabel = new Map<string, string>();
    groupedTypeOptions
      .filter((group) => selectedMainTypes.includes(group.mainType))
      .forEach((group) => {
        group.subTypes.forEach((item) => {
          const key = buildMainTypeSubTypeMatchKey(group.mainType, item.label);
          if (key && !canonicalToLabel.has(key)) canonicalToLabel.set(key, item.label);
        });
      });
    setSelectedCategories((prev) => {
      const remapped = prev
        .map((cat) => {
          const resolvedLabel = getSelectedSubTypeMatchKeys(cat, selectedMainTypes)
            .map((key) => canonicalToLabel.get(key) || "")
            .find(Boolean);
          return resolvedLabel || cat;
        })
        .filter(Boolean);
      return Array.from(new Set(remapped));
    });
  }, [groupedTypeOptions, selectedMainTypes]);
  useEffect(() => {
    const allowedFeatures = new Set(Array.from(tabFeatureOptionsMap.values()).flat());
    setSelectedFeatureNames((prev) => prev.filter((item) => allowedFeatures.has(item)));
  }, [tabFeatureOptionsMap]);
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

  useEffect(() => {
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
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
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
    setSearchParams(params, { replace: true });
  }, [
    selectedMode,
    query,
    selectedLocations,
    stayRanges,
    selectedMainTypes,
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
    selectedStanding,
    minGuests,
    isFeaturedOnly,
    priceMax,
    smartTolerance,
    sortMode,
    priceCeiling,
    setSearchParams,
  ]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };
  const toggleLocation = (loc: string) => {
    setSelectedLocations((prev) => (prev.includes(loc) ? prev.filter((item) => item !== loc) : [...prev, loc]));
  };
  const toggleMainType = (mainType: PropertyMainType) => {
    setSelectedMainTypes((prev) => (prev.includes(mainType) ? prev.filter((item) => item !== mainType) : [...prev, mainType]));
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
    const validStayRanges = selectedMode === "location_saisonniere"
      ? stayRanges.filter((range) => isValidStayRange(range.start, range.end))
      : [];
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

    const selectedSubTypeKeys = selectedCategories
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => getCanonicalSubTypeKey(value))
      .filter(Boolean);
    const selectedSubTypeMatchKeys = selectedCategories
      .flatMap((value) => getSelectedSubTypeMatchKeys(value, selectedMainTypes))
      .filter(Boolean);
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
        if (selectedMainTypes.length > 0) {
          maxScore += 16;
          if (selectedMainTypes.includes(propertyMainType)) score += 16;
          else missing.push("Type principal different");
        }
        if (selectedSubTypeMatchKeys.length > 0) {
          maxScore += 16;
          if (selectedSubTypeMatchKeys.includes(propertySubTypeMatchKey)) score += 16;
          else missing.push("Sous-type different");
        }

        const matchSeaside = selectedSeasideOptions.some((option) => propertyMatchesSeasideOption(property, option));
        const matchesPresPlage = propertyMatchesSeasideOption(property, "pres_plage");
        if (selectedSeasideOptions.length > 0) {
          maxScore += 10;
          if (matchSeaside) score += 10;
          else missing.push("Critere bord de mer incomplet");
        }

        const matchComfort = selectedComfortOptions.some((option) => propertyMatchesComfortOption(property, option));
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
            const exactRange = validStayRanges.find((range) => evaluatePropertyStayBookability(property, range.start, range.end).ok);
            exactDateAvailable = Boolean(exactRange);
            if (exactDateAvailable) {
              score += 20;
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
        const strictMainTypeMatch = selectedMainTypes.length === 0 || selectedMainTypes.includes(propertyMainType);
        const strictSubTypeMatch = selectedSubTypeMatchKeys.length === 0 || selectedSubTypeMatchKeys.includes(propertySubTypeMatchKey);
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
        const requestedSPlusValues = selectedSubTypeKeys.map((item) => getSPlusValue(item)).filter((value): value is number => Number.isFinite(value as number));
        const propertySPlusValue = getSPlusValue(propertySubTypeKey);
        const hasTypeAlternative31 = selectedSubTypeMatchKeys.length > 0
          && selectedMainTypes.length > 0
          && selectedSubTypeKeys.includes(propertySubTypeKey)
          && !selectedSubTypeMatchKeys.includes(propertySubTypeMatchKey);
        const hasTypeAlternative32 = selectedMainTypes.length > 0
          && selectedSubTypeKeys.length > 0
          && selectedSubTypeKeys.length === 1
          && selectedMainTypes.includes(propertyMainType)
          && !selectedSubTypeMatchKeys.includes(propertySubTypeMatchKey)
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
        const genericComfortAlternative = selectedComfortOptions.length > 0 && !matchComfort;
        const hasComfortAlternative = requiresRdcComfortFallback
          ? hasComfortFallbackFromRdc
          : genericComfortAlternative || hasComfortFallbackFromBeach;
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
          exactDateAvailable,
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
          hasComfortAlternative,
          hasComfortFallbackFromBeach,
          hasComfortFallbackFromRdc,
          hasDateRuleAlternative,
          dateRuleType,
          dateFailureReason,
        };
      });

    const threshold = hasCoreFilters ? smartTolerance : 0;
    let primary = rows.filter(
      (row) =>
        row.strictTypeMatch
        && row.score >= threshold
        && (!requiresRdcComfortFallback || propertyMatchesComfortOption(row.property, "rdc"))
        && (!hasDateFilter || row.exactDateAvailable)
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
        const hasNonDateAlternativeWithExactDates = row.exactDateAvailable && hasNonDateAlternative;
        return hasDateAlternative || hasNonDateAlternativeWithExactDates;
      }
      return hasNonDateAlternative;
    }).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.property.isFeatured !== b.property.isFeatured) return a.property.isFeatured ? -1 : 1;
      return Number(b.property.rating || 0) - Number(a.property.rating || 0);
    });
    if (primary.length === 0) {
      primary = rows.filter((row) => row.strictTypeMatch && (!hasDateFilter || row.exactDateAvailable));
    }
    if (primary.length === 0 && !hasDateFilter && !hasExplicitTypeFilter) {
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
    if (!["matching", "price", "featured"].includes(sortMode)) {
      setSortMode("matching");
    }
  }, [sortMode]);
  useEffect(() => {
    if (advancedPanel !== "tabs") return;
    if (featureTabsList.length === 0) return;
    if (expandedFeatureTabs.length > 0) return;
    setExpandedFeatureTabs([featureTabsList[0]]);
  }, [advancedPanel, featureTabsList, expandedFeatureTabs]);
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
      return list.sort((a, b) => Number(a.property.pricePerNight || 0) - Number(b.property.pricePerNight || 0));
    }
    if (sortMode === "featured") {
      return list.sort((a, b) => {
        if (a.property.isFeatured !== b.property.isFeatured) return a.property.isFeatured ? -1 : 1;
        return b.score - a.score;
      });
    }
    return list.sort((a, b) => b.score - a.score);
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
  const hasStrictStaySearch = selectedMode === "location_saisonniere" && stayRanges.some((range) => isValidStayRange(range.start, range.end));
  const visibleSortedScoredResults = useMemo(
    () => (showAllResults ? sortedScoredResults : sortedScoredResults.slice(0, visibleCount)),
    [showAllResults, sortedScoredResults, visibleCount]
  );
  const hasMoreResults = !showAllResults && sortedScoredResults.length > visibleCount;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setShowAllResults(false);
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
    if (hasStrictStaySearch && sortedScoredResults.length === 0 && alternativeScoredResults.length > 0) {
      setTimeout(() => {
        if (alternativesAnchorRef.current) {
          alternativesAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 80);
    }
  }, [hasStrictStaySearch, sortedScoredResults.length, alternativeScoredResults.length]);
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
  const requestedSubTypeLabel = selectedCategories.join(" | ");
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

                  <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <MapPin size={14} className="text-emerald-600" /> Emplacement
                  </label>
                  <div className="relative overflow-hidden rounded-xl">
                    {selectedLocationImage && (
                      <img
                        src={resolveZoneImageUrl(selectedLocationImage)}
                        alt={selectedLocations[0] || "Emplacement"}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    {selectedLocationImage && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                    <select
                      value=""
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value) toggleLocation(value);
                      }}
                      className={`relative z-10 w-full rounded-xl border p-2.5 text-sm outline-none ${
                        selectedLocationImage
                          ? "border-white/70 bg-transparent font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]"
                          : "border-gray-200 bg-white text-gray-700 focus:border-emerald-500"
                      }`}
                    >
                      <option value="">Ajouter un emplacement</option>
                      {uniqueLocations.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="max-h-40 overflow-y-auto pr-1">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedLocations([])}
                        className={`relative h-16 overflow-hidden rounded-xl border px-3 text-left ${selectedLocations.length === 0 ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                      >
                        <img src={resolveZoneImageUrl(null)} alt="Tous les emplacements" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-black/30" />
                        <span className="relative z-10 text-xs font-semibold text-white">Tous les emplacements</span>
                      </button>
                      {uniqueLocations.map((loc) => (
                        <button
                          key={`location-card-${loc}`}
                          type="button"
                          onClick={() => toggleLocation(loc)}
                          className={`relative h-16 overflow-hidden rounded-xl border px-3 text-left ${selectedLocations.includes(loc) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                        >
                          <img src={resolveZoneImageUrl(locationImageMap.get(loc) || null)} alt={loc} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                          <div className="pointer-events-none absolute inset-0 bg-black/35" />
                          <span className="relative z-10 text-xs font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{loc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedMode === "location_saisonniere" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="col-span-2 space-y-2">
                          {stayRanges.map((range, index) => (
                            <div key={`stay-range-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                              <div>
                                <label className="mb-1 block text-xs font-bold text-gray-700">Arrivee {index + 1}</label>
                                <input
                                  type="date"
                                  value={range.start}
                                  onChange={(e) => updateStayRange(index, "start", e.target.value)}
                                  className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-emerald-500"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-bold text-gray-700">Depart {index + 1}</label>
                                <input
                                  type="date"
                                  value={range.end}
                                  onChange={(e) => updateStayRange(index, "end", e.target.value)}
                                  className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-emerald-500"
                                />
                              </div>
                              <div className="flex items-end">
                                <button
                                  type="button"
                                  onClick={() => removeStayRange(index)}
                                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                                >
                                  Suppr.
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={addStayRange}
                            className="rounded-lg border border-dashed border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Ajouter une periode
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <label className="text-sm font-bold text-gray-900">Type principal</label>
                  <div className="grid grid-cols-2 gap-2">
                    {groupedTypeOptions.map((group) => (
                      <button
                        key={`main-type-${group.mainType}`}
                        type="button"
                        onClick={() => {
                          toggleMainType(group.mainType);
                        }}
                        className={`relative h-24 overflow-hidden rounded-xl border text-left ${
                          selectedMainTypes.includes(group.mainType) ? "ring-2 ring-emerald-400" : "border-gray-200"
                        }`}
                      >
                        <img src={resolveTypeImageUrl(group.imageUrl)} alt={group.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-black/40" />
                        <span className="relative z-10 px-3 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{group.label}</span>
                      </button>
                    ))}
                  </div>
                  <label className="text-sm font-bold text-gray-900">Sous-type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {secondaryTypeOptions.map((cat) => (
                      <button
                        key={`sub-type-${cat.label}`}
                        type="button"
                        onClick={() => toggleCategory(cat.label)}
                        className={`relative h-24 overflow-hidden rounded-xl border text-left ${
                          selectedCategories.includes(cat.label) ? "ring-2 ring-emerald-400" : "border-gray-200"
                        }`}
                      >
                        <img src={resolveTypeImageUrl(cat.imageUrl)} alt={cat.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-black/40" />
                        <span className="relative z-10 px-3 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{cat.label}</span>
                        {selectedCategories.includes(cat.label) && (
                          <span className="absolute right-2 top-2 z-10 rounded-full bg-emerald-600 p-1 text-white">
                            <Check size={12} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

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

                <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 lg:col-span-5">
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <ListFilter size={14} className="text-emerald-600" />
                    Filtres detailles
                  </label>
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-1.5">
                    <button
                      type="button"
                      onClick={() => setAdvancedPanel("tabs")}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${advancedPanel === "tabs" ? "bg-emerald-100 text-emerald-800" : "text-gray-600 hover:bg-gray-100"}`}
                    >
                      Onglets
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdvancedPanel("services")}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${advancedPanel === "services" ? "bg-emerald-100 text-emerald-800" : "text-gray-600 hover:bg-gray-100"}`}
                    >
                      Services payants
                    </button>
                  </div>
                  {advancedPanel === "tabs" && (
                    <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1 lg:max-h-[38rem]">
                      {featureTabsList.length === 0 && <p className="text-sm text-gray-500">Aucun onglet detecte.</p>}
                      {featureTabsList.map((tab) => (
                        <div key={`tab-filter-${tab}`} className="rounded-xl border border-gray-200 bg-white">
                          <button
                            type="button"
                            onClick={() => toggleExpandedTab(tab)}
                            className={`w-full rounded-xl px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 ${expandedFeatureTabs.includes(tab) ? "text-emerald-800" : "text-gray-700"}`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Layers size={14} className={expandedFeatureTabs.includes(tab) ? "text-emerald-600" : "text-gray-400"} />
                              <span className="font-medium">{tab}</span>
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                                {(tabFeatureOptionsMap.get(tab) || []).length} choix
                              </span>
                              {expandedFeatureTabs.includes(tab) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                          </button>
                          {expandedFeatureTabs.includes(tab) && (
                            <div className="border-t border-gray-100 px-4 py-3">
                              <p className="mb-2 text-xs text-gray-500">Choisissez les options de cet onglet.</p>
                              <div className="flex flex-wrap gap-2">
                                {(tabFeatureOptionsMap.get(tab) || []).map((featureName) => (
                                  <button
                                    key={`feature-${tab}-${featureName}`}
                                    type="button"
                                    onClick={() => toggleFeatureName(featureName)}
                                    className={`rounded-full border px-3 py-2 text-xs transition-colors ${
                                      selectedFeatureNames.includes(featureName)
                                        ? "border-emerald-500 bg-emerald-100 text-emerald-800 font-semibold"
                                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                    }`}
                                  >
                                    {featureName}
                                  </button>
                                ))}
                                {(tabFeatureOptionsMap.get(tab) || []).length === 0 && (
                                  <p className="text-xs text-gray-500">Aucun choix disponible pour cette categorie.</p>
                                )}
                              </div>
                              {normalizeFeatureName(tab).includes("capacite") && (
                                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <label className="space-y-1">
                                    <span className="text-xs font-semibold text-gray-700">Nombre chambres double (min)</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={minDoubleRooms}
                                      onChange={(e) => setMinDoubleRooms(Math.max(0, Number(e.target.value || 0)))}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                    />
                                  </label>
                                  <label className="space-y-1">
                                    <span className="text-xs font-semibold text-gray-700">Nombre de chambres parentale (min)</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={minParentRooms}
                                      onChange={(e) => setMinParentRooms(Math.max(0, Number(e.target.value || 0)))}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                    />
                                  </label>
                                  <label className="space-y-1">
                                    <span className="text-xs font-semibold text-gray-700">Nombre de chambres simple (min)</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={minSimpleRooms}
                                      onChange={(e) => setMinSimpleRooms(Math.max(0, Number(e.target.value || 0)))}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                    />
                                  </label>
                                  <label className="space-y-1">
                                    <span className="text-xs font-semibold text-gray-700">Nombre de salle de bain (min)</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={minBathroomsCount}
                                      onChange={(e) => setMinBathroomsCount(Math.max(0, Number(e.target.value || 0)))}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                    />
                                  </label>
                                </div>
                              )}
                              {normalizeFeatureName(tab).includes("confort") && (
                                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <label className="space-y-1">
                                    <span className="text-xs font-semibold text-gray-700">Nombres de chambres climatise (min)</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={minClimatizedRooms}
                                      onChange={(e) => setMinClimatizedRooms(Math.max(0, Number(e.target.value || 0)))}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {advancedPanel === "services" && (
                    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-sm text-gray-600">
                        Ouvrez le popup pour parcourir les services par categorie et type de tarification.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span className="rounded-full bg-gray-100 px-2 py-1">
                          {paidServicesCatalog.length} services
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-1">
                          {paidServiceCategories.length} categories
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
                          {selectedPaidServices.length} selectionne(s)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPaidServicesModal(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                      >
                        <ConciergeBell size={16} />
                        Ouvrir services payants
                      </button>
                      {selectedPaidServices.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {selectedPaidServices.map((label) => (
                            <button
                              key={`selected-service-chip-${label}`}
                              type="button"
                              onClick={() => togglePaidService(label)}
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
                            >
                              {label}
                              <X size={12} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
            <div className="mb-6 flex items-center justify-between">
              <span className="font-medium text-gray-500">
                {sortedScoredResults.length} resultat{sortedScoredResults.length !== 1 ? "s" : ""} trouve{sortedScoredResults.length !== 1 ? "s" : ""}
              </span>
              {alternativeScoredResults.length > 0 && <span className="text-sm text-gray-500">{alternativeScoredResults.length} choix alternatives</span>}
            </div>

            {sortedScoredResults.length > 0 ? (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {visibleSortedScoredResults.map((row) => (
                  <div key={row.property.id} className="space-y-2">
                    <PropertyCard property={row.property} searchParams={searchParams.toString()} />
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                      {row.hints.length > 0 && (
                        <p className="text-xs text-emerald-800">{row.hints.join(" | ")}</p>
                      )}
                    </div>
                  </div>
                ))}
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
            {sortedScoredResults.length > PAGE_SIZE && (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {hasMoreResults && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    Suivant
                  </button>
                )}
                {!showAllResults && (
                  <button
                    type="button"
                    onClick={() => setShowAllResults(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Voir tout le catalogue
                  </button>
                )}
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
                        {section.rows.map((row) => (
                          <div key={`${section.key}-${row.property.id}`} className="space-y-2">
                            <PropertyCard
                              property={row.property}
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
                            />
                            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                              <div className="space-y-1 text-xs">
                                {row.hasLocationAlternative && requestedLocationLabel && (
                                  renderLocationAlternativeLine(row)
                                )}
                                {(row.hasTypeAlternative31 || row.hasTypeAlternative32) && (requestedMainTypeLabel || requestedSubTypeLabel) && (
                                  <p>
                                    <span className="text-gray-500 line-through">{[requestedMainTypeLabel, requestedSubTypeLabel].filter(Boolean).join(" ")}</span>
                                    {" -> "}
                                    <span className="font-semibold text-red-600">{getResolvedPropertyCategoryLabel(row.property)}</span>
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
                        ))}
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



