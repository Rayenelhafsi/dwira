import { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Search, MapPin, Calendar, CalendarDays, ArrowRight, Star, Key, KeyRound, Globe, Facebook, X, ChevronLeft, ChevronRight, ChevronDown, Home, Check, Waves, Wind, SlidersHorizontal, Users, BedDouble, LoaderCircle, AlertCircle, Sparkles, ShieldCheck, ShieldX, TicketPercent, Minus, Plus, Upload } from "lucide-react";
import { useProperties } from "../context/PropertiesContext";
import { useAuth } from "../context/AuthContext";
import { PropertyCard } from "../components/PropertyCard";
import { Zone } from "../admin/types";
import logo from "../../../logo dwira.jpg";
import titaTravelLogo from "../../../logo Tita travel.jpg";
import ComingSoonState from "../components/ComingSoonState";
import { PUBLIC_COMING_SOON } from "../config/publicAvailability";
import { createHotelReservationDemand, getHotelConfig, listHotelCities, listHotels, searchHotels, type HotelCity, type HotelSummary } from "../services/hotels";
import { completeSocialProfile, getAuthProviders, loginWithPasskey, registerWithPasskey, startSocialLogin } from "../services/auth";
import { extractHotelMinPrice, flattenHotelRoomOffers, formatHotelStarLabel, getHotelCardDescription, pickHotelDisplayedPrice } from "../utils/hotelHelpers";
import { buildApiUrl } from "../utils/api";
import { clearAuthPendingLogin, isAuthPendingLogin, markAuthPendingLogin, saveAuthReturnTo } from "../utils/pendingReservation";
import { toast } from "sonner";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  parseISO,
  isBefore,
  startOfDay
} from "date-fns";
import { fr } from "date-fns/locale";
import { hasBlockingUnavailableDates, isValidStayRange } from "../utils/availability";
import { resolveMediaUrl } from "../utils/media";
import WebsiteChatbotWidget from "../components/WebsiteChatbotWidget";

type ListingMode = "vente" | "location_annuelle" | "location_saisonniere" | "hotellerie";
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
const MODE_TABS: Array<{ value: ListingMode; label: string; comingSoon?: boolean }> = [
  { value: "location_saisonniere", label: "Location saisonniere", comingSoon: false },
  { value: "hotellerie", label: "Hotellerie", comingSoon: false },
  { value: "vente", label: "Vente", comingSoon: PUBLIC_COMING_SOON.ventes },
  { value: "location_annuelle", label: "Location annuelle", comingSoon: PUBLIC_COMING_SOON.locationAnnuelle },
];

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
type StayRangeSelection = { start: string; end: string };
const HERO_IMAGE_URL =
  "https://images.unsplash.com/photo-1690549392404-de10519e6adb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxUdW5pc2lhJTIwS2VsaWJpYSUyMGJlYWNoJTIwdmlsbGElMjBtZWRpdGVycmFuZWFuJTIwY29hc3R8ZW58MXx8fHwxNzcxNDEyOTU5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";
const HERO_IMAGE_URL_MOBILE =
  "https://images.unsplash.com/photo-1690549392404-de10519e6adb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxUdW5pc2lhJTIwS2VsaWJpYSUyMGJlYWNoJTIwdmlsbGElMjBtZWRpdGVycmFuZWFuJTIwY29hc3R8ZW58MXx8fHwxNzcxNDEyOTU5fDA&ixlib=rb-4.1.0&q=70&w=640&utm_source=figma&utm_medium=referral";
const HOTEL_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1280 720'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23dbeafe'/%3E%3Cstop offset='100%25' stop-color='%23fde68a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1280' height='720' fill='url(%23g)'/%3E%3Cpath d='M0 530h1280v190H0z' fill='%230f766e' fill-opacity='0.18'/%3E%3Cpath d='M220 500V280l170-90 170 90v220H220zm410 0V230l120-70 120 70v270H630zm330 0V320l95-50 95 50v180H960z' fill='%23ffffff' fill-opacity='0.72'/%3E%3C/svg%3E";
const HOTEL_PENDING_HOME_RESERVE_KEY = "dwira_pending_home_hotel_reserve";

type PendingHomeHotelReserve = {
  hotel: HotelSummary;
  adults: number;
  childAges: number[];
  rooms: Array<{
    boardingId: number | null;
    boardingName: string | null;
    roomId: number | null;
    roomName: string | null;
    price: number | null;
    adults: number;
    children: number;
    childAges: number[];
  }>;
  totalPrice: number | null;
};

type HotelTravellerIdentity = {
  firstName: string;
  lastName: string;
};

type HotelRoomTravellerSelection = {
  adults: number;
  children: number;
  childAges: number[];
};

function normalizeHotelRoomChildAges(current: number[] | undefined, childrenCount: number) {
  const safeChildrenCount = Math.max(0, Math.floor(Number(childrenCount) || 0));
  const next = Array.isArray(current)
    ? current
        .slice(0, safeChildrenCount)
        .map((age) => Math.max(0, Math.min(17, Math.floor(Number(age) || 0))))
    : [];

  while (next.length < safeChildrenCount) next.push(0);
  return next;
}

function buildDefaultHotelRoomTravellers(roomCount: number) {
  return Array.from({ length: Math.max(1, Math.floor(Number(roomCount) || 1)) }).map(() => ({
    adults: 1,
    children: 0,
    childAges: [],
  }));
}

function normalizeHotelRoomTravellers(
  current: HotelRoomTravellerSelection[] | undefined,
  roomCount: number
) {
  const safeRoomCount = Math.max(1, Math.floor(Number(roomCount) || 1));
  const next = Array.isArray(current)
    ? current.slice(0, safeRoomCount).map((room) => ({
        adults: Math.max(1, Math.floor(Number(room?.adults) || 1)),
        children: Math.max(0, Math.floor(Number(room?.children) || 0)),
        childAges: normalizeHotelRoomChildAges(room?.childAges, Math.max(0, Math.floor(Number(room?.children) || 0))),
      }))
    : [];

  while (next.length < safeRoomCount) {
    next.push({ adults: 1, children: 0, childAges: [] });
  }

  return next;
}

function flattenHotelRoomChildAges(roomTravellers: HotelRoomTravellerSelection[]) {
  return Array.isArray(roomTravellers)
    ? roomTravellers.flatMap((room) => normalizeHotelRoomChildAges(room?.childAges, room?.children))
    : [];
}

function buildHotelRoomTravellersFromFilters(
  roomCount: number,
  adults: number,
  childAges: number[]
) {
  const safeRoomCount = Math.max(1, Math.floor(Number(roomCount) || 1));
  const safeAdults = Math.max(1, Math.floor(Number(adults) || 1));
  const normalizedChildAges = Array.isArray(childAges)
    ? childAges
        .map((age) => Math.max(0, Math.min(17, Math.floor(Number(age) || 0))))
    : [];

  if (safeRoomCount === 1) {
    return [{
      adults: safeAdults,
      children: normalizedChildAges.length,
      childAges: normalizedChildAges,
    }];
  }

  const next = buildDefaultHotelRoomTravellers(safeRoomCount);
  let remainingAdults = safeAdults;

  for (let index = 0; index < safeRoomCount; index += 1) {
    const roomsLeft = safeRoomCount - index;
    const adultsForRoom = Math.max(1, remainingAdults - (roomsLeft - 1));
    next[index].adults = adultsForRoom;
    remainingAdults = Math.max(0, remainingAdults - adultsForRoom);
  }

  if (normalizedChildAges.length > 0) {
    next[0].children = normalizedChildAges.length;
    next[0].childAges = normalizedChildAges;
  }

  return next;
}

function buildHotelAvailabilitySignature(input: {
  hotelId: number;
  hotelCityId: number;
  hotelDestinationQuery: string;
  selectedHotelId: number;
  checkIn: string;
  checkOut: string;
  roomCount: number;
  roomTravellers: HotelRoomTravellerSelection[];
  roomSelections: Array<{ boardingKey: string; roomKey: string }>;
}) {
  const totalAdults = Array.isArray(input.roomTravellers)
    ? input.roomTravellers.reduce((sum, room) => sum + Math.max(0, Math.floor(Number(room?.adults) || 0)), 0)
    : 0;
  const totalChildren = Array.isArray(input.roomTravellers)
    ? input.roomTravellers.reduce((sum, room) => sum + Math.max(0, Math.floor(Number(room?.children) || 0)), 0)
    : 0;
  return JSON.stringify({
    hotelId: Number(input.hotelId || 0),
    hotelCityId: Number(input.hotelCityId || 0),
    hotelDestinationQuery: String(input.hotelDestinationQuery || "").trim(),
    selectedHotelId: Number(input.selectedHotelId || 0),
    checkIn: String(input.checkIn || "").trim(),
    checkOut: String(input.checkOut || "").trim(),
    adults: totalAdults,
    children: totalChildren,
    roomCount: Math.max(1, Math.floor(Number(input.roomCount) || 1)),
    roomTravellers: Array.isArray(input.roomTravellers)
      ? input.roomTravellers.map((room) => ({
          adults: Math.max(1, Math.floor(Number(room?.adults) || 1)),
        children: Math.max(0, Math.floor(Number(room?.children) || 0)),
        childAges: normalizeHotelRoomChildAges(room?.childAges, Math.max(0, Math.floor(Number(room?.children) || 0))),
      }))
      : [],
    roomSelections: Array.isArray(input.roomSelections)
      ? input.roomSelections.map((selection) => ({
          boardingKey: String(selection?.boardingKey || ""),
          roomKey: String(selection?.roomKey || ""),
        }))
      : [],
  });
}

function savePendingHomeHotelReserve(payload: PendingHomeHotelReserve) {
  try {
    sessionStorage.setItem(HOTEL_PENDING_HOME_RESERVE_KEY, JSON.stringify(payload));
  } catch {}
}

function readPendingHomeHotelReserve(): PendingHomeHotelReserve | null {
  try {
    const raw = sessionStorage.getItem(HOTEL_PENDING_HOME_RESERVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as PendingHomeHotelReserve;
  } catch {
    return null;
  }
}

function clearPendingHomeHotelReserve() {
  try {
    sessionStorage.removeItem(HOTEL_PENDING_HOME_RESERVE_KEY);
  } catch {}
}

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
const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);
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
      villa_maison: "Villa / Maison",
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
  const rawSPlus = rawSubType.match(/s\+\d+/i)?.[0]?.toUpperCase() || rawCategory.match(/s\+\d+/i)?.[0]?.toUpperCase() || "";
  const titleSPlus = title.match(/s\+\d+/i)?.[0]?.toUpperCase() || "";
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
const propertyMatchesSeasideOption = (property: any, option: HomeSeasideOptionKey) => {
  const normalizeToken = (value?: string | null) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const textBlob = normalizeToken(
    [
      property?.title,
      property?.description,
      property?.location,
      property?.category,
      ...(Array.isArray(property?.amenities) ? property.amenities : []),
    ].join(" ")
  );
  const hasAny = (...tokens: string[]) => tokens.some((token) => textBlob.includes(normalizeToken(token)));
  const sc = property?.seasonalConfig || {};
  const distancePlage = Number(sc?.distancePlageM ?? Number.NaN);
  const hasDistance = Number.isFinite(distancePlage);
  if (option === "pied_dans_eau") {
    return Boolean(sc?.vueMer) && hasDistance && distancePlage <= 50
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
  const getFloorRaw = () =>
    String(
      property?.seasonalConfig?.etage
      ?? property?.etage
      ?? property?.filterProfile?.etage
      ?? ""
    )
      .trim()
      .toLowerCase();
  const normalizeToken = (value?: string | null) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const textBlob = normalizeToken(
    [
      property?.title,
      property?.description,
      property?.location,
      property?.category,
      ...(Array.isArray(property?.amenities) ? property.amenities : []),
    ].join(" ")
  );
  const hasAny = (...tokens: string[]) => tokens.some((token) => textBlob.includes(normalizeToken(token)));
  const structuredValues = [
    ...(Array.isArray(property?.caracteristiques) ? property.caracteristiques : []),
    ...Object.values(property?.caracteristique_valeurs || {}).flatMap((value) =>
      Array.isArray(value) ? value : [value]
    ),
  ].map((value) => normalizeToken(String(value || "")));
  const hasStructuredAny = (...tokens: string[]) =>
    tokens.some((token) => structuredValues.some((value) => value.includes(normalizeToken(token))));
  const sc = property?.seasonalConfig || {};
  const exterieur = Array.isArray(sc?.exterieurJardin) ? sc.exterieurJardin.map((item: string) => normalizeToken(item)) : [];
  const interieur = Array.isArray(sc?.confortEquipementsInterieurs) ? sc.confortEquipementsInterieurs.map((item: string) => normalizeToken(item)) : [];
  const hasExteriorAny = (...tokens: string[]) => tokens.some((token) => exterieur.some((value: string) => value.includes(normalizeToken(token))));
  const hasInteriorAny = (...tokens: string[]) => tokens.some((token) => interieur.some((value: string) => value.includes(normalizeToken(token))));
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
  if (option === "piscine_privee") return hasStructuredAny("piscine privee", "piscine privée");
  if (option === "piscine_partagee") return hasStructuredAny("piscine partagee", "piscine partagée");
  if (option === "rdc") {
    const floor = getFloorRaw();
    return floor === "rdc" || floor === "0";
  }
  if (option === "premier_etage") {
    const floor = getFloorRaw();
    return floor === "1"
      || floor === "1er"
      || floor === "1er etage"
      || floor === "1er étage"
      || hasAny("1er etage", "1er étage", "premier etage", "premier étage", "1st floor");
  }
  if (option === "jardin_gazon") return hasExteriorAny("jardin", "gazon", "pelouse", "espace vert") || hasAny("jardin", "gazon", "pelouse", "espace vert");
  if (option === "terrasse") return Boolean(sc?.terrasse) || hasExteriorAny("terrasse") || hasAny("terrasse");
  return false;
};

const parseCsvParam = (value: string | null) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseStayRangesParam = (value: string | null): StayRangeSelection[] =>
  String(value || "")
    .split(";")
    .map((item) => {
      const [start, end] = String(item || "").split("_");
      return { start: String(start || "").trim(), end: String(end || "").trim() };
    })
    .filter((item) => item.start && item.end);

const serializeStayRangesParam = (ranges: StayRangeSelection[]) =>
  ranges
    .filter((item) => item.start && item.end)
    .map((item) => `${item.start}_${item.end}`)
    .join(";");

const toggleStringInList = (items: string[], value: string) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

const buildHierarchicalLocationLabel = (parts: Array<string | null | undefined>) => {
  const cleaned = parts.map((item) => String(item || "").trim()).filter(Boolean);
  return cleaned.join(" / ");
};
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
      const lastPart = otherParts[otherParts.length - 1];
      return token === lastPart;
    });
  });
};
const hasLocationTokenSelected = (selectedValues: string[], token: string) => {
  const normalizedToken = String(token || "").trim().toLowerCase();
  if (!normalizedToken) return false;
  return selectedValues.some((value) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    if (!normalizedValue) return false;
    if (normalizedValue === normalizedToken) return true;
    const parts = normalizedValue.split("/").map((part) => part.trim()).filter(Boolean);
    return parts.includes(normalizedToken);
  });
};

function buildDefaultHotelSearch() {
  const today = new Date();
  const checkIn = new Date(today);
  checkIn.setDate(checkIn.getDate() + 7);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);
  return {
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
    adults: 2,
    childAges: [] as number[],
  };
}

function formatHotelPrice(value: number | null) {
  if (!Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value));
}

function formatHotelDateDisplay(value: string) {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "Sélectionner";
  const parsed = parseISO(normalized);
  if (Number.isNaN(parsed.getTime())) return "Sélectionner";
  return format(parsed, "dd/MM/yyyy", { locale: fr });
}

function getClientFacingHotelError(message: string) {
  const normalized = String(message || "").toLowerCase();
  if (
    !normalized
    || normalized.includes("not configured")
    || normalized.includes("configuration")
    || normalized.includes("deactivated")
    || normalized.includes("desactive")
    || normalized.includes("auth")
    || normalized.includes("provider")
    || normalized.includes("mygo")
    || normalized.includes("partenaire")
  ) {
    return "Notre selection d'hotels est temporairement indisponible. Merci de reessayer un peu plus tard.";
  }
  return "Impossible de charger les offres pour le moment. Merci de reessayer dans quelques instants.";
}

function hasValidHotelSearchDates(checkIn: string, checkOut: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(checkIn || "").trim()) && /^\d{4}-\d{2}-\d{2}$/.test(String(checkOut || "").trim());
}

function hasRequiredHotelSearchApiInputs(input: {
  cityId?: number | null;
  checkIn?: string;
  checkOut?: string;
  adults?: number | null;
}) {
  return Number(input.cityId || 0) > 0
    && hasValidHotelSearchDates(String(input.checkIn || ""), String(input.checkOut || ""))
    && Math.max(0, Math.floor(Number(input.adults) || 0)) > 0;
}

function matchesHotelKeywordForFallback(hotel: HotelSummary, keyword: string) {
  const needle = String(keyword || "").trim().toLowerCase();
  if (!needle) return true;
  return [
    hotel.Name,
    hotel.City?.Name,
    hotel.ShortDescription,
    hotel.HotelDescription,
    hotel.Adress,
  ].some((value) => String(value || "").toLowerCase().includes(needle));
}

function hasHotelPromotion(hotel: HotelSummary) {
  const promotion = hotel?.Promotion;
  if (!promotion || typeof promotion !== "object") return false;
  return Boolean(
    String(promotion.Title || "").trim()
    || String(promotion.Description || "").trim()
    || Number(promotion.Rate || 0) > 0
  );
}

type HomePageProps = {
  forcedAmicaleId?: string | null;
};

export default function HomePage({ forcedAmicaleId }: HomePageProps = {}) {
  const INITIAL_VISIBLE_PROPERTIES = 10;
  const hotelDefaults = useMemo(() => buildDefaultHotelSearch(), []);
  // Use shared context for properties
  const { properties, zones, modePriorities, loading } = useProperties();
  const { user, login } = useAuth();
  
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const resultsRef = useRef<HTMLDivElement>(null);
  const filterControlsRef = useRef<HTMLDivElement>(null);
  const locationDesktopPopupRef = useRef<HTMLDivElement>(null);
  const locationMobilePopupRef = useRef<HTMLDivElement>(null);
  const calendarMobilePopupRef = useRef<HTMLDivElement>(null);
  const categoryMobilePopupRef = useRef<HTMLDivElement>(null);
  const seasideDesktopPopupRef = useRef<HTMLDivElement>(null);
  const comfortDesktopPopupRef = useRef<HTMLDivElement>(null);
  const seasideMobilePopupRef = useRef<HTMLDivElement>(null);
  const comfortMobilePopupRef = useRef<HTMLDivElement>(null);
  const suppressFilterOpenUntilRef = useRef(0);
  
  // Filter states
  const [location, setLocation] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    dedupeHierarchicalLocations(parseCsvParam(searchParams.get("locations") || searchParams.get("location")))
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedMainType, setSelectedMainType] = useState<PropertyMainType | "">("");
  const [selectedMainTypes, setSelectedMainTypes] = useState<PropertyMainType[]>(
    parseCsvParam(searchParams.get("mainTypes") || searchParams.get("mainType")) as PropertyMainType[]
  );
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [selectedStayRanges, setSelectedStayRanges] = useState<StayRangeSelection[]>(
    (() => {
      const parsed = parseStayRangesParam(searchParams.get("stayRanges"));
      if (parsed.length > 0) return parsed;
      const start = String(searchParams.get("checkIn") || "").trim();
      const end = String(searchParams.get("checkOut") || "").trim();
      return start && end ? [{ start, end }] : [];
    })()
  );
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSeasideDropdown, setShowSeasideDropdown] = useState(false);
  const [showComfortDropdown, setShowComfortDropdown] = useState(false);
  const [typeSelectionStep, setTypeSelectionStep] = useState<"main" | "sub">("main");
  const [draftSelectedLocations, setDraftSelectedLocations] = useState<string[]>([]);
  const [draftSelectedStayRanges, setDraftSelectedStayRanges] = useState<StayRangeSelection[]>([]);
  const [draftMainType, setDraftMainType] = useState<PropertyMainType | "">("");
  const [draftSelectedMainTypes, setDraftSelectedMainTypes] = useState<PropertyMainType[]>([]);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [draftSeasideOptions, setDraftSeasideOptions] = useState<HomeSeasideOptionKey[]>([]);
  const [draftComfortOptions, setDraftComfortOptions] = useState<HomeComfortOptionKey[]>([]);
  const [typeFilterImageRows, setTypeFilterImageRows] = useState<Array<{ mode_bien: string; main_type: string; sub_type: string | null; image_url: string }>>([]);
  const [homeFilterOptionImageRows, setHomeFilterOptionImageRows] = useState<Array<{ mode_bien: string; filter_group: string; option_key: string; image_url: string }>>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ListingMode>("location_saisonniere");
  const [locationPays, setLocationPays] = useState("Tunisie");
  const [locationGouvernerat, setLocationGouvernerat] = useState("");
  const [locationRegion, setLocationRegion] = useState("");
  const [locationZone, setLocationZone] = useState("");
  const [openLocationLevel, setOpenLocationLevel] = useState<null | "pays" | "gouvernerat" | "region" | "zone">(null);
  const [selectedSeasideOptions, setSelectedSeasideOptions] = useState<HomeSeasideOptionKey[]>([]);
  const [selectedComfortOptions, setSelectedComfortOptions] = useState<HomeComfortOptionKey[]>([]);
  const [visiblePropertiesCount, setVisiblePropertiesCount] = useState(INITIAL_VISIBLE_PROPERTIES);
  const [showAllProperties, setShowAllProperties] = useState(false);
  const hotelInitialSearchDoneRef = useRef(false);
  const [hotelConfigReady, setHotelConfigReady] = useState<boolean | null>(null);

  const [hotelProviderError, setHotelProviderError] = useState("");
  const [hotelCities, setHotelCities] = useState<HotelCity[]>([]);
  const [hotelResults, setHotelResults] = useState<HotelSummary[]>([]);
  const [hotelSearchFallbackNotice, setHotelSearchFallbackNotice] = useState("");
  const [loadingHotelCities, setLoadingHotelCities] = useState(false);
  const [loadingHotelResults, setLoadingHotelResults] = useState(false);
  const [checkingAvailabilityHotelId, setCheckingAvailabilityHotelId] = useState<number | null>(null);
  const [loadingHotelsByCity, setLoadingHotelsByCity] = useState(false);
  const [hotelCityId, setHotelCityId] = useState<number>(() => Number(searchParams.get("cityId") || 0) || 0);
  const [hotelDestinationQuery, setHotelDestinationQuery] = useState(() => searchParams.get("q") || "");
  const [selectedHotelId, setSelectedHotelId] = useState<number>(0);
  const [hotelDestinationOpen, setHotelDestinationOpen] = useState(false);
  const [hotelCheckIn, setHotelCheckIn] = useState(() => searchParams.get("checkIn") || "");
  const [hotelCheckOut, setHotelCheckOut] = useState(() => searchParams.get("checkOut") || "");
  const [hotelAdults, setHotelAdults] = useState(() => {
    const rawAdults = String(searchParams.get("adults") || "").trim();
    if (!rawAdults) return 0;
    return Math.max(1, Number(rawAdults) || 1);
  });
  const [hotelChildAges, setHotelChildAges] = useState<number[]>(() => {
    const parsed = String(searchParams.get("children") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => Number(item))
      .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17);
    return parsed.length > 0 ? parsed : hotelDefaults.childAges;
  });
  const [hotelsByCity, setHotelsByCity] = useState<HotelSummary[]>([]);
  const [sharedHotelRoomCount, setSharedHotelRoomCount] = useState(1);
  const [localRoomSelectionsByHotel, setLocalRoomSelectionsByHotel] = useState<Record<number, Array<{ boardingKey: string; roomKey: string }>>>({});
  const [sharedHotelRoomTravellers, setSharedHotelRoomTravellers] = useState<HotelRoomTravellerSelection[]>(() => buildDefaultHotelRoomTravellers(1));
  const [hotelAvailabilitySignatureByHotel, setHotelAvailabilitySignatureByHotel] = useState<Record<number, string>>({});
  const [hotelCriteriaGlowTarget, setHotelCriteriaGlowTarget] = useState<null | "dates" | "chambres" | "voyageurs">(null);
  const [hotelTravellersOpen, setHotelTravellersOpen] = useState(false);
  const [hotelCalendarOpen, setHotelCalendarOpen] = useState(false);
  const [hotelCalendarMonth, setHotelCalendarMonth] = useState<Date>(() => {
    const rawCheckIn = String(searchParams.get("checkIn") || "").trim();
    const parsed = rawCheckIn ? parseISO(rawCheckIn) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  });
  const [hotelCalendarCheckInDraft, setHotelCalendarCheckInDraft] = useState<Date | null>(() => {
    const rawCheckIn = String(searchParams.get("checkIn") || "").trim();
    if (!rawCheckIn) return null;
    const parsed = parseISO(rawCheckIn);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });
  const [hotelCalendarCheckOutDraft, setHotelCalendarCheckOutDraft] = useState<Date | null>(() => {
    const rawCheckOut = String(searchParams.get("checkOut") || "").trim();
    if (!rawCheckOut) return null;
    const parsed = parseISO(rawCheckOut);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });
  const [hotelSearchLoadingModal, setHotelSearchLoadingModal] = useState(false);
  const [hotelTravellerAccordionOpen, setHotelTravellerAccordionOpen] = useState("adult-0");
  const [hotelReserveModal, setHotelReserveModal] = useState<null | {
    hotel: HotelSummary;
    adults: number;
    childAges: number[];
    rooms: Array<{
      boardingId: number | null;
      boardingName: string | null;
      roomId: number | null;
      roomName: string | null;
      price: number | null;
      adults: number;
      children: number;
      childAges: number[];
    }>;
    totalPrice: number | null;
    travellers: {
      adults: HotelTravellerIdentity[];
      children: HotelTravellerIdentity[];
    };
    phone: string;
    note: string;
  }>(null);
  const [submittingHotelReserve, setSubmittingHotelReserve] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [providers, setProviders] = useState({ google: false, facebook: false, phoneOtp: false, emailOtp: false, passkey: true });
  const [isAwaitingLogin, setIsAwaitingLogin] = useState(false);
  const [isPasskeyPromptLoading, setIsPasskeyPromptLoading] = useState(false);
  const [isPasskeyCreateLoading, setIsPasskeyCreateLoading] = useState(false);
  const [loginPromptStep, setLoginPromptStep] = useState<"choices" | "passkey_setup" | "profile_setup">("choices");
  const [passkeyPromptEmail, setPasskeyPromptEmail] = useState("");
  const [passkeyPromptName, setPasskeyPromptName] = useState("");
  const [isProfilePromptSaving, setIsProfilePromptSaving] = useState(false);
  const [isProfileCinUploading, setIsProfileCinUploading] = useState(false);
  const [profilePromptForm, setProfilePromptForm] = useState({
    firstName: "",
    lastName: "",
    clientType: "locataire",
    telephone: "",
    address: "",
    cin: "",
    cinImageUrl: "",
  });
  useEffect(() => {
    if (!hotelDestinationOpen && !hotelTravellersOpen && !hotelCalendarOpen && !showLoginPrompt && !hotelReserveModal && !hotelSearchLoadingModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hotelDestinationOpen, hotelTravellersOpen, hotelCalendarOpen, showLoginPrompt, hotelReserveModal, hotelSearchLoadingModal]);
  const activeAmicaleId = String(forcedAmicaleId || searchParams.get("amicale") || "").trim() || null;
  const applyAmicaleParam = (params: URLSearchParams) => {
    if (activeAmicaleId) {
      params.set("amicale", activeAmicaleId);
    } else {
      params.delete("amicale");
    }
    return params;
  };

  const today = startOfDay(new Date());
  const getModeTabPriority = (mode: ListingMode) => {
    if (mode === "hotellerie") return 1.5;
    return modePriorities[mode as Exclude<ListingMode, "hotellerie">] || 99;
  };
  const orderedModeTabs = useMemo(
    () =>
      [...MODE_TABS].sort(
        (a, b) => getModeTabPriority(a.value) - getModeTabPriority(b.value)
      ),
    [modePriorities]
  );
  const isHotelMode = selectedMode === "hotellerie";
  const selectedHotelCity = useMemo(
    () => hotelCities.find((item) => Number(item.Id) === Number(hotelCityId)) || null,
    [hotelCities, hotelCityId]
  );
  const hotelDestinationNeedle = String(hotelDestinationQuery || "").trim().toLowerCase();
  const filteredHotelCities = useMemo(
    () => hotelCities.filter((city) => !hotelDestinationNeedle || String(city.Name || "").toLowerCase().includes(hotelDestinationNeedle)).slice(0, 12),
    [hotelCities, hotelDestinationNeedle]
  );
  const filteredHotelsByCity = useMemo(
    () =>
      hotelsByCity
        .filter((hotel) => {
          const matchesCity =
            Number(hotelCityId) <= 0 || Number(hotel?.City?.Id || 0) === Number(hotelCityId);
          const matchesQuery =
            !hotelDestinationNeedle ||
            String(hotel.Name || "").toLowerCase().includes(hotelDestinationNeedle);
          return matchesCity && matchesQuery;
        })
        .sort((left, right) => {
          const leftSelected = Number(left?.Id || 0) === Number(selectedHotelId) ? 1 : 0;
          const rightSelected = Number(right?.Id || 0) === Number(selectedHotelId) ? 1 : 0;
          if (leftSelected !== rightSelected) return rightSelected - leftSelected;
          return String(left?.Name || "").localeCompare(String(right?.Name || ""), "fr");
        })
        .slice(0, 12),
    [hotelsByCity, hotelCityId, hotelDestinationNeedle, selectedHotelId]
  );
  const selectedHotelLabel = useMemo(() => {
    if (selectedHotelId <= 0) return "";
    const allHotels = [...hotelsByCity, ...hotelResults];
    const match = allHotels.find((hotel) => Number(hotel?.Id || 0) === Number(selectedHotelId));
    if (match?.Name) return String(match.Name).trim();
    return String(hotelDestinationQuery || "").trim();
  }, [selectedHotelId, hotelsByCity, hotelResults, hotelDestinationQuery]);
  const selectedHotelUnavailableMessage = selectedHotelLabel
    ? `L'hotel ${selectedHotelLabel} n'a aucune offre disponible pour votre choix veuillez changer vos filtres ou consultez les alternatives disponibles.`
    : "Cet hotel n'a aucune offre disponible pour votre choix veuillez changer vos filtres ou consultez les alternatives disponibles.";
  const hotelUnavailableMessage =
    "Cet hotel n'a aucune offre disponible pour votre choix veuillez changer vos filtres ou consultez les alternatives disponibles.";
  const hotelPublicErrorMessage = hotelProviderError ? getClientFacingHotelError(hotelProviderError) : "";
  const sortedHotelResults = useMemo(
    () => [...hotelResults].sort((left, right) => {
      const leftSelected = Number(left?.Id || 0) === Number(selectedHotelId) ? 1 : 0;
      const rightSelected = Number(right?.Id || 0) === Number(selectedHotelId) ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      const leftPromotion = hasHotelPromotion(left) ? 1 : 0;
      const rightPromotion = hasHotelPromotion(right) ? 1 : 0;
      if (leftPromotion !== rightPromotion) return rightPromotion - leftPromotion;
      const leftRecommended = Number(left?.Recommended || 0);
      const rightRecommended = Number(right?.Recommended || 0);
      if (leftRecommended !== rightRecommended) return rightRecommended - leftRecommended;
      const leftPrice = extractHotelMinPrice(left) ?? Number.POSITIVE_INFINITY;
      const rightPrice = extractHotelMinPrice(right) ?? Number.POSITIVE_INFINITY;
      if (leftPrice !== rightPrice) return leftPrice - rightPrice;
      return String(left?.Name || "").localeCompare(String(right?.Name || ""), "fr");
    }),
    [hotelResults, selectedHotelId]
  );
  const hotelSearchPeriodLabel = useMemo(() => {
    try {
      if (!hotelCheckIn || !hotelCheckOut) return "";
      return `${format(parseISO(hotelCheckIn), "d MMM yyyy", { locale: fr })} - ${format(parseISO(hotelCheckOut), "d MMM yyyy", { locale: fr })}`;
    } catch {
      return `${hotelCheckIn} - ${hotelCheckOut}`;
    }
  }, [hotelCheckIn, hotelCheckOut]);
  const hasHotelTravellerSelection = hotelAdults > 0 || hotelChildAges.length > 0;
  const hasCompleteHotelCriteria = hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut) && hasHotelTravellerSelection;
  const hotelTravellersLabel = hasHotelTravellerSelection
    ? `${hotelAdults} adulte${hotelAdults > 1 ? "s" : ""} - ${hotelChildAges.length} enfant${hotelChildAges.length > 1 ? "s" : ""}`
    : "Voyageurs";
  const hotelSearchInfoMessage = hasCompleteHotelCriteria
    ? (selectedHotelId > 0 ? selectedHotelUnavailableMessage : hotelUnavailableMessage)
    : "";
  const isSelectedModeComingSoon =
    (selectedMode === "vente" && PUBLIC_COMING_SOON.ventes)
    || (selectedMode === "location_annuelle" && PUBLIC_COMING_SOON.locationAnnuelle);
  const normalizedZones = useMemo(
    () =>
      (Array.isArray(zones) ? zones : []).filter((zone): zone is Zone =>
        Boolean(String(zone?.id || '').trim()) && Boolean(String(zone?.nom || '').trim())
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
  const cascadePaysOptions = useMemo(
    () => dedupeLocationValues(normalizedZones.map((zone) => String(zone.pays || "").trim()).filter(Boolean)),
    [normalizedZones]
  );
  const cascadeGouverneratOptions = useMemo(
    () =>
      dedupeLocationValues(
        normalizedZones
          .filter((zone) => !locationPays || isSameLocationToken(zone.pays, locationPays))
          .map((zone) => String(zone.gouvernerat || "").trim())
          .filter(Boolean)
      ),
    [normalizedZones, locationPays]
  );
  const cascadeRegionOptions = useMemo(
    () =>
      dedupeLocationValues(
        normalizedZones
          .filter(
            (zone) =>
              (!locationPays || isSameLocationToken(zone.pays, locationPays))
              && (!locationGouvernerat || isSameLocationToken(zone.gouvernerat, locationGouvernerat))
          )
          .map((zone) => String(zone.region || "").trim())
          .filter(Boolean)
      ),
    [normalizedZones, locationPays, locationGouvernerat]
  );
  const cascadeZoneOptions = useMemo(
    () =>
      dedupeLocationValues(
        normalizedZones
          .filter(
            (zone) =>
              (!locationPays || isSameLocationToken(zone.pays, locationPays))
              && (!locationGouvernerat || isSameLocationToken(zone.gouvernerat, locationGouvernerat))
              && (!locationRegion || isSameLocationToken(zone.region, locationRegion))
          )
          .map((zone) => String(zone.quartier || zone.nom || "").trim())
          .filter(Boolean)
      ),
    [normalizedZones, locationPays, locationGouvernerat, locationRegion]
  );
  const imageCacheBustTokenRef = useRef(`iosfix-${Date.now()}`);
  const withCacheBust = (url: string) => {
    if (!url || url.startsWith("data:")) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${imageCacheBustTokenRef.current}`;
  };
  const resolveZoneImageUrl = (url?: string | null) => {
    const value = resolveMediaUrl(url);
    if (!value) return 'about:blank';
    if (/^https?:\/\//i.test(value)) return withCacheBust(value);
    return withCacheBust(value.startsWith('/') ? `${window.location.origin}${value}` : value);
  };
  const resolveTypeImageUrl = (url?: string | null) => {
    const value = resolveMediaUrl(url);
    if (!value) return TYPE_FALLBACK_IMAGE;
    if (/^https?:\/\//i.test(value)) return withCacheBust(value);
    return withCacheBust(value.startsWith('/') ? `${window.location.origin}${value}` : value);
  };
  const normalizeTypeToken = (value?: string | null) => String(value || "").trim().toLowerCase();
  const normalizeSearchToken = (value?: string | null) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const resetLocationFilters = () => {
    setLocation("");
    setSelectedLocations([]);
    setDraftSelectedLocations([]);
    setLocationPays("");
    setLocationGouvernerat("");
    setLocationRegion("");
    setLocationZone("");
  };
  const openLocationSelector = () => {
    setDraftSelectedLocations(selectedLocations);
    setOpenLocationLevel(locationZone ? "zone" : locationRegion ? "region" : locationGouvernerat ? "gouvernerat" : locationPays ? "gouvernerat" : "pays");
    setShowLocationDropdown(true);
  };
  const toggleDraftLocationSelection = (value: string) => {
    const nextValue = String(value || "").trim();
    if (!nextValue) return;
    setDraftSelectedLocations((prev) => toggleStringInList(prev, nextValue));
  };
  const currentDraftLocationValue = buildHierarchicalLocationLabel([
    locationPays && String(locationPays).trim().toLowerCase() !== "tunisie" ? locationPays : "",
    locationGouvernerat,
    locationRegion,
    locationZone,
  ]) || String(locationPays || "").trim();
  const resetCurrentLocationPath = () => {
    setLocationGouvernerat("");
    setLocationRegion("");
    setLocationZone("");
    setOpenLocationLevel(locationPays ? "gouvernerat" : "pays");
  };
  const addCurrentLocationToDraft = () => {
    if (!currentDraftLocationValue) return;
    setDraftSelectedLocations((prev) => dedupeHierarchicalLocations(prev.includes(currentDraftLocationValue) ? prev : [...prev, currentDraftLocationValue]));
    resetCurrentLocationPath();
  };
  const confirmLocationSelection = () => {
    const nextLocations = currentDraftLocationValue
      ? dedupeHierarchicalLocations(
          draftSelectedLocations.includes(currentDraftLocationValue)
            ? draftSelectedLocations
            : [...draftSelectedLocations, currentDraftLocationValue]
        )
      : dedupeHierarchicalLocations(draftSelectedLocations);
    setSelectedLocations(nextLocations);
    setShowCalendar(true);
    setShowCategoryDropdown(false);
    setShowLocationDropdown(false);
  };
  const getHomeFilterOptionImage = (group: "seaside" | "comfort", key: string): string | null => {
    const row = homeFilterOptionImageRows.find(
      (item) =>
        String(item.mode_bien || "").trim() === selectedMode
        && String(item.filter_group || "").trim() === group
        && normalizeTypeToken(item.option_key) === normalizeTypeToken(key)
    );
    return row?.image_url || null;
  };
  const selectedComfortSummary = [...selectedSeasideOptions.map((key) => SEASIDE_OPTION_LABELS[key]), ...selectedComfortOptions.map((key) => COMFORT_OPTION_LABELS[key])].join(", ") || "Confort";
  const selectedComfortImage =
    (selectedComfortOptions.length > 0 ? getHomeFilterOptionImage("comfort", selectedComfortOptions[0]) : null)
    || (selectedSeasideOptions.length > 0 ? getHomeFilterOptionImage("seaside", selectedSeasideOptions[0]) : null);
  const openCalendarSelector = () => {
    setDraftSelectedStayRanges(selectedStayRanges);
    setShowCalendar(true);
  };
  const addDraftStayRange = () => {
    if (!checkIn || !checkOut) return;
    const range = {
      start: format(checkIn, 'yyyy-MM-dd'),
      end: format(checkOut, 'yyyy-MM-dd'),
    };
    setDraftSelectedStayRanges((prev) =>
      prev.some((item) => item.start === range.start && item.end === range.end) ? prev : [...prev, range]
    );
    setCheckIn(null);
    setCheckOut(null);
  };
  const confirmCalendarSelection = () => {
    const nextRanges = [...draftSelectedStayRanges];
    if (checkIn && checkOut) {
      const range = {
        start: format(checkIn, 'yyyy-MM-dd'),
        end: format(checkOut, 'yyyy-MM-dd'),
      };
      if (!nextRanges.some((item) => item.start === range.start && item.end === range.end)) {
        nextRanges.push(range);
      }
    }
    setSelectedStayRanges(nextRanges);
    setShowLocationDropdown(false);
    setShowCalendar(false);
    openCategoryDropdown();
    setShowSeasideDropdown(false);
    setShowComfortDropdown(false);
  };
  const selectedLocationImages = useMemo(() => {
    const pickImage = (items: Zone[], field: 'pays_image_url' | 'gouvernerat_image_url' | 'region_image_url' | 'quartier_image_url') =>
      items.find((item) => String(item[field] || '').trim())?.[field] || null;

    const paysImage = locationPays
      ? pickImage(normalizedZones.filter((zone) => isSameLocationToken(zone.pays, locationPays)), 'pays_image_url')
      : null;
    const gouverneratImage = locationGouvernerat
      ? pickImage(
          normalizedZones.filter(
            (zone) =>
              (!locationPays || isSameLocationToken(zone.pays, locationPays))
              && isSameLocationToken(zone.gouvernerat, locationGouvernerat)
          ),
          'gouvernerat_image_url'
        )
      : null;
    const regionImage = locationRegion
      ? pickImage(
          normalizedZones.filter(
            (zone) =>
              (!locationPays || isSameLocationToken(zone.pays, locationPays))
              && (!locationGouvernerat || isSameLocationToken(zone.gouvernerat, locationGouvernerat))
              && isSameLocationToken(zone.region, locationRegion)
          ),
          'region_image_url'
        )
      : null;
    const zoneImage = locationZone
      ? pickImage(
          normalizedZones.filter(
            (zone) =>
              (!locationPays || isSameLocationToken(zone.pays, locationPays))
              && (!locationGouvernerat || isSameLocationToken(zone.gouvernerat, locationGouvernerat))
              && (!locationRegion || isSameLocationToken(zone.region, locationRegion))
              && isSameLocationToken(zone.quartier || zone.nom, locationZone)
          ),
          'quartier_image_url'
        )
      : null;

    return {
      pays: paysImage,
      gouvernerat: gouverneratImage,
      region: regionImage,
      zone: zoneImage,
    };
  }, [normalizedZones, locationPays, locationGouvernerat, locationRegion, locationZone]);
  const getLocationOptionImage = (
    level: "pays" | "gouvernerat" | "region" | "zone",
    value: string
  ) => {
    const rows = normalizedZones.filter((zone) => {
      const pays = String(zone.pays || "").trim();
      const gouv = String(zone.gouvernerat || "").trim();
      const region = String(zone.region || "").trim();
      const zoneName = String(zone.quartier || zone.nom || "").trim();
      if (level === "pays") return isSameLocationToken(pays, value);
      if (level === "gouvernerat") return (!locationPays || isSameLocationToken(pays, locationPays)) && isSameLocationToken(gouv, value);
      if (level === "region") {
        return (!locationPays || isSameLocationToken(pays, locationPays))
          && (!locationGouvernerat || isSameLocationToken(gouv, locationGouvernerat))
          && isSameLocationToken(region, value);
      }
      return (!locationPays || isSameLocationToken(pays, locationPays))
        && (!locationGouvernerat || isSameLocationToken(gouv, locationGouvernerat))
        && (!locationRegion || isSameLocationToken(region, locationRegion))
        && isSameLocationToken(zoneName, value);
    });
    if (!rows.length) return 'about:blank';
    const pickFirstNonEmpty = (field: 'pays_image_url' | 'gouvernerat_image_url' | 'region_image_url' | 'quartier_image_url' | 'image_url') =>
      String(rows.find((item) => String(item[field] || '').trim())?.[field] || '').trim();
    const levelImage =
      level === "pays"
        ? pickFirstNonEmpty('pays_image_url')
        : level === "gouvernerat"
          ? pickFirstNonEmpty('gouvernerat_image_url')
          : level === "region"
            ? pickFirstNonEmpty('region_image_url')
            : pickFirstNonEmpty('quartier_image_url');

    return resolveZoneImageUrl(levelImage || '');
  };
  const modeProperties = useMemo(
    () => properties.filter((property) => (property.mode || "location_saisonniere") === selectedMode),
    [properties, selectedMode]
  );
  // Keep filter options stable across iOS/Android/Desktop.
  // Options should not disappear based on currently loaded properties.
  const availableSeasideOptions = useMemo(
    () => [...SEASIDE_OPTION_KEYS],
    []
  );
  const availableComfortOptions = useMemo(
    () => [...COMFORT_OPTION_KEYS],
    []
  );
  const availableTypeOptions = useMemo(() => {
    const byCategory = new Map<string, { label: string; imageUrl: string }>();
    for (const property of modeProperties) {
      const category = getResolvedPropertyCategoryLabel(property);
      if (!category) continue;
      if (!byCategory.has(category)) {
        const firstImage = Array.isArray(property.images) ? String(property.images[0] || '').trim() : '';
        const imageFromAdmin = typeFilterImageRows.find((row) =>
          String(row.mode_bien || '').trim() === selectedMode
          && normalizeTypeToken(row.sub_type) === normalizeTypeToken(category)
        )?.image_url || '';
        byCategory.set(category, {
          label: category,
          imageUrl: imageFromAdmin || firstImage || TYPE_FALLBACK_IMAGE,
        });
      }
    }
    return Array.from(byCategory.values()).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }, [modeProperties, selectedMode, typeFilterImageRows]);
  const groupedTypeOptions = useMemo(() => {
    const groups = new Map<PropertyMainType, { mainType: PropertyMainType; label: string; imageUrl: string; subTypes: Array<{ label: string; imageUrl: string }> }>();
    const modeRows = typeFilterImageRows.filter((row) => String(row.mode_bien || "").trim() === selectedMode);

    // 1) Seed all main types from admin uploaded "type principal" rows.
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

    // 2) Add sub-types from admin rows first (authoritative source for filter images).
    for (const row of modeRows) {
      const subType = String(row.sub_type || "").trim();
      if (!subType || isInvalidPropertySubtype(subType)) continue;
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

    // 3) Complete with sub-types inferred from published properties (fallback when admin row missing).
    for (const option of availableTypeOptions) {
      if (isInvalidPropertySubtype(option.label)) continue;
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
  const draftSecondaryTypeOptions = useMemo(() => {
    if (!draftMainType) return availableTypeOptions;
    const selectedGroup = groupedTypeOptions.find((group) => group.mainType === draftMainType);
    return selectedGroup?.subTypes || [];
  }, [availableTypeOptions, groupedTypeOptions, draftMainType]);
  const selectedMainTypeLabels = selectedMainTypes.map((item) => MAIN_TYPE_LABELS[item]).filter(Boolean);
  const selectedTypeSummaryText = selectedMainTypeLabels.length > 0
    ? (selectedCategories.length > 0 ? `${selectedMainTypeLabels.join(", ")} â€¢ ${selectedCategories.join(", ")}` : selectedMainTypeLabels.join(", "))
    : (selectedCategories.length > 0 ? selectedCategories.join(", ") : "Tous les types");
  const selectedTypeImage = useMemo(() => {
    if (selectedCategories.length === 1) {
      const selectedCategoryKey = getCanonicalSubTypeKey(selectedCategories[0]);
      const selectedFromAdmin = typeFilterImageRows.find(
        (row) =>
          String(row.mode_bien || "").trim() === selectedMode
          && getCanonicalSubTypeKey(row.sub_type) === selectedCategoryKey
      );
      if (selectedFromAdmin?.image_url) return selectedFromAdmin.image_url;
      const selected = availableTypeOptions.find((item) => getCanonicalSubTypeKey(item.label) === selectedCategoryKey);
      if (selected?.imageUrl) return selected.imageUrl;
    }
    if (selectedMainTypes.length > 0) {
      const group = groupedTypeOptions.find((item) => item.mainType === selectedMainTypes[0]);
      return group?.imageUrl || null;
    }
    return null;
  }, [availableTypeOptions, groupedTypeOptions, selectedCategories, selectedMainTypes, selectedMode, typeFilterImageRows]);
  const removeCategoriesForMainType = (categories: string[], mainType: PropertyMainType) => {
    const selectedGroup = groupedTypeOptions.find((group) => group.mainType === mainType);
    if (!selectedGroup) return categories;
    const blockedSubTypes = new Set(selectedGroup.subTypes.map((item) => getCanonicalSubTypeKey(item.label)));
    return categories.filter((item) => !blockedSubTypes.has(getCanonicalSubTypeKey(item)));
  };
  const selectedTypeChipGroups = useMemo(() => {
    const grouped = new Map<PropertyMainType, string[]>();
    selectedMainTypes.forEach((mainType) => grouped.set(mainType, []));
    selectedCategories.forEach((category) => {
      const mainType = getMainTypeFromCategory(category);
      if (!grouped.has(mainType)) grouped.set(mainType, []);
      grouped.get(mainType)?.push(category);
    });
    return Array.from(grouped.entries()).map(([mainType, categories]) => ({
      mainType,
      categories,
    }));
  }, [selectedMainTypes, selectedCategories]);

  useEffect(() => {
    if (!locationPays && cascadePaysOptions.some((item) => item.toLowerCase() === 'tunisie')) {
      setLocationPays('Tunisie');
    }
  }, [cascadePaysOptions, locationPays]);

  useEffect(() => {
    let cancelled = false;
    if (isHotelMode) {
      setTypeFilterImageRows([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const response = await fetch(
          `/api/type-filter-images?mode=${encodeURIComponent(selectedMode)}&cb=${Date.now()}`,
          { cache: "no-store", credentials: "include" }
        );
        if (!response.ok) throw new Error('type-filter-images');
        const rows = await response.json();
        if (!cancelled) setTypeFilterImageRows(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setTypeFilterImageRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHotelMode, selectedMode]);

  useEffect(() => {
    let cancelled = false;
    if (isHotelMode) {
      setHomeFilterOptionImageRows([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const response = await fetch(
          `/api/home-filter-option-images?mode=${encodeURIComponent(selectedMode)}&cb=${Date.now()}`,
          { cache: "no-store", credentials: "include" }
        );
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
  }, [isHotelMode, selectedMode]);

  useEffect(() => {
    const canonicalToLabel = new Map<string, string>();
    groupedTypeOptions.forEach((group) => {
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
          return resolvedLabel || "";
        })
        .filter(Boolean);
      const next = Array.from(new Set(remapped));
      return areStringArraysEqual(prev, next) ? prev : next;
    });
    const mainTypeAllowed = new Set(groupedTypeOptions.map((item) => item.mainType));
    setSelectedMainType((prev) => {
      return prev && mainTypeAllowed.has(prev) ? prev : "";
    });
    setSelectedMainTypes((prev) => {
      const next = prev.filter((item) => mainTypeAllowed.has(item));
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [groupedTypeOptions, selectedMainTypes]);
  useEffect(() => {
    const allowedSeaside = new Set(availableSeasideOptions);
    const allowedComfort = new Set(availableComfortOptions);
    setSelectedSeasideOptions((prev) => prev.filter((item) => allowedSeaside.has(item)));
    setSelectedComfortOptions((prev) => prev.filter((item) => allowedComfort.has(item)));
  }, [availableSeasideOptions, availableComfortOptions]);

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
      const next = Array.from(new Set(remapped));
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [groupedTypeOptions, selectedMainTypes]);
  useEffect(() => {
    const firstRange = selectedStayRanges[0];
    if (!firstRange) return;
    setCheckIn(firstRange.start ? parseISO(firstRange.start) : null);
    setCheckOut(firstRange.end ? parseISO(firstRange.end) : null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingHotelsByCity(true);
    void (async () => {
      try {
        const rows = await listHotels(Number(hotelCityId) > 0 ? hotelCityId : undefined);
        if (!cancelled) setHotelsByCity(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setHotelsByCity([]);
      } finally {
        if (!cancelled) setLoadingHotelsByCity(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hotelCityId]);
  useEffect(() => {
    if (selectedLocations.length === 0) {
      setLocation("");
      return;
    }
    setLocation(selectedLocations.join(", "));
  }, [selectedLocations]);

  useEffect(() => {
    if (loading) {
      return;
    }
    const requestedMode = searchParams.get("mode");
    if (requestedMode === "vente" || requestedMode === "location_annuelle" || requestedMode === "location_saisonniere" || requestedMode === "hotellerie") {
      const requestedTab = orderedModeTabs.find((tab) => tab.value === requestedMode);
      if (requestedTab && !requestedTab.comingSoon) {
        setSelectedMode(requestedMode);
        return;
      }
    }
    const defaultMode = orderedModeTabs.find((tab) => !tab.comingSoon)?.value || "location_saisonniere";
    setSelectedMode(defaultMode);
    const next = applyAmicaleParam(new URLSearchParams(searchParams));
    if (next.get("mode") !== defaultMode) {
      next.set("mode", defaultMode);
      setSearchParams(next, { replace: true });
    }
  }, [activeAmicaleId, loading, orderedModeTabs, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await getHotelConfig();
        if (!cancelled) setHotelConfigReady(config.configured);
      } catch (error) {
        if (!cancelled) {
          setHotelConfigReady(false);
          setHotelProviderError(error instanceof Error ? error.message : "Configuration hoteliere indisponible.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingHotelCities(true);
    void (async () => {
      try {
        const nextCities = await listHotelCities();
        if (!cancelled) {
          setHotelCities(nextCities);
          setHotelProviderError("");
        }
      } catch (error) {
        if (!cancelled) {
          setHotelProviderError(error instanceof Error ? error.message : "Chargement des villes impossible.");
          setHotelCities([]);
        }
      } finally {
        if (!cancelled) setLoadingHotelCities(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHotelMode || loadingHotelCities || hotelInitialSearchDoneRef.current) return;
    if (!hotelCityId || !hotelCheckIn || !hotelCheckOut) return;
    hotelInitialSearchDoneRef.current = true;
    void runHotelSearch({ replace: true, scroll: false });
    // Intentionally run once after hotel mode is hydrated from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHotelMode, loadingHotelCities, hotelCityId, hotelCheckIn, hotelCheckOut]);

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const openCategoryDropdown = () => {
    setDraftMainType(selectedMainType);
    setDraftSelectedMainTypes(selectedMainTypes);
    setDraftCategories(selectedCategories);
    setTypeSelectionStep(selectedMainType ? "sub" : "main");
    setShowCategoryDropdown(true);
  };
  const chooseDraftMainType = (mainType: PropertyMainType) => {
    setDraftMainType(mainType);
    setTypeSelectionStep("sub");
  };
  const toggleDraftMainTypeSelection = (mainType: PropertyMainType) => {
    const selectedGroup = groupedTypeOptions.find((group) => group.mainType === mainType);
    const nextSelectedMainTypes = draftSelectedMainTypes.includes(mainType)
      ? draftSelectedMainTypes.filter((item) => item !== mainType)
      : [...draftSelectedMainTypes, mainType];
    setDraftSelectedMainTypes(nextSelectedMainTypes);
    if (draftSelectedMainTypes.includes(mainType) && selectedGroup) {
      const blockedSubTypes = new Set(selectedGroup.subTypes.map((item) => getCanonicalSubTypeKey(item.label)));
      setDraftCategories((prev) => prev.filter((item) => !blockedSubTypes.has(getCanonicalSubTypeKey(item))));
      if (draftMainType === mainType) {
        setDraftMainType(nextSelectedMainTypes[0] || "");
        setTypeSelectionStep(nextSelectedMainTypes.length > 0 ? "sub" : "main");
      }
      return;
    }
    setDraftMainType(mainType);
    setTypeSelectionStep("sub");
  };
  const toggleDraftCategory = (cat: string) => {
    setDraftCategories((prev) => (prev.includes(cat) ? prev.filter((item) => item !== cat) : [...prev, cat]));
  };
  const confirmTypeSelection = () => {
    setSelectedMainTypes(draftSelectedMainTypes);
    setSelectedMainType(draftMainType);
    setSelectedCategories(draftCategories);
    setShowCategoryDropdown(false);
    setShowSeasideDropdown(true);
    setShowComfortDropdown(false);
  };
  const openSeasideSelector = () => {
    setDraftSeasideOptions(selectedSeasideOptions);
    setShowSeasideDropdown(true);
  };
  const toggleDraftSeasideOption = (key: HomeSeasideOptionKey) => {
    setDraftSeasideOptions((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };
  const confirmSeasideSelection = () => {
    setSelectedSeasideOptions(draftSeasideOptions);
    setShowSeasideDropdown(false);
    setShowComfortDropdown(true);
  };
  const openComfortSelector = () => {
    setDraftSeasideOptions(selectedSeasideOptions);
    setDraftComfortOptions(selectedComfortOptions);
    setShowComfortDropdown(true);
  };
  const toggleDraftComfortOption = (key: HomeComfortOptionKey) => {
    setDraftComfortOptions((prev) => {
      if (POOL_OPTION_KEYS.includes(key)) {
        const withoutPool = prev.filter((item) => !POOL_OPTION_KEYS.includes(item));
        return prev.includes(key) ? withoutPool : [...withoutPool, key];
      }
      return prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key];
    });
  };
  const confirmComfortSelection = () => {
    setSelectedSeasideOptions(draftSeasideOptions);
    setSelectedComfortOptions(draftComfortOptions);
    setShowComfortDropdown(false);
  };

  const handleDateClick = (date: Date) => {
    if (isBefore(date, today)) return;
    
    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(date);
      setCheckOut(null);
    } else {
      if (date < checkIn) {
        setCheckIn(date);
        setCheckOut(checkIn);
      } else {
        setCheckOut(date);
      }
    }
  };

  const isDateInRange = (date: Date) => {
    if (!checkIn || !checkOut) return false;
    return isWithinInterval(date, { 
      start: checkIn < checkOut ? checkIn : checkOut, 
      end: checkIn < checkOut ? checkOut : checkIn 
    });
  };

  const getDayClassName = (date: Date) => {
    const isCurrentMonth = isSameMonth(date, currentMonth);
    const isPast = isBefore(date, today);
    const isStart = checkIn && isSameDay(date, checkIn);
    const isEnd = checkOut && isSameDay(date, checkOut);
    const isInRange = isDateInRange(date);

    let className = "w-10 h-10 flex items-center justify-center text-sm rounded-full cursor-pointer transition-all ";
    
    if (!isCurrentMonth) {
      className += "text-gray-300 ";
    } else if (isPast) {
      className += "text-gray-300 cursor-not-allowed ";
    } else if (isStart || isEnd || isInRange) {
      className += "bg-emerald-600 text-white font-bold shadow-lg ";
    } else {
      className += "text-gray-700 hover:bg-emerald-50 ";
    }

    return className;
  };

  const hotelCalendarMonthStart = startOfMonth(hotelCalendarMonth);
  const hotelCalendarMonthEnd = endOfMonth(hotelCalendarMonth);
  const hotelCalendarGridStart = startOfWeek(hotelCalendarMonthStart, { weekStartsOn: 1 });
  const hotelCalendarGridEnd = endOfWeek(hotelCalendarMonthEnd, { weekStartsOn: 1 });
  const hotelCalendarDays = eachDayOfInterval({ start: hotelCalendarGridStart, end: hotelCalendarGridEnd });

  const handleHotelCalendarDayClick = (date: Date) => {
    if (isBefore(date, today)) return;
    if (!hotelCalendarCheckInDraft || (hotelCalendarCheckInDraft && hotelCalendarCheckOutDraft)) {
      setHotelCalendarCheckInDraft(date);
      setHotelCalendarCheckOutDraft(null);
      return;
    }
    if (date < hotelCalendarCheckInDraft) {
      setHotelCalendarCheckInDraft(date);
      setHotelCalendarCheckOutDraft(hotelCalendarCheckInDraft);
      return;
    }
    setHotelCalendarCheckOutDraft(date);
  };

  const isHotelCalendarDateInRange = (date: Date) => {
    if (!hotelCalendarCheckInDraft || !hotelCalendarCheckOutDraft) return false;
    const start = hotelCalendarCheckInDraft < hotelCalendarCheckOutDraft ? hotelCalendarCheckInDraft : hotelCalendarCheckOutDraft;
    const end = hotelCalendarCheckInDraft < hotelCalendarCheckOutDraft ? hotelCalendarCheckOutDraft : hotelCalendarCheckInDraft;
    return isWithinInterval(date, { start, end });
  };

  const getHotelCalendarDayClassName = (date: Date) => {
    const isCurrentMonth = isSameMonth(date, hotelCalendarMonth);
    const isPast = isBefore(date, today);
    const isStart = hotelCalendarCheckInDraft && isSameDay(date, hotelCalendarCheckInDraft);
    const isEnd = hotelCalendarCheckOutDraft && isSameDay(date, hotelCalendarCheckOutDraft);
    const isInRange = isHotelCalendarDateInRange(date);
    let className = "h-10 w-10 rounded-full text-sm transition-all ";
    if (!isCurrentMonth) className += "text-slate-300 ";
    else if (isPast) className += "cursor-not-allowed text-slate-300 ";
    else if (isStart || isEnd || isInRange) className += "bg-sky-600 font-bold text-white shadow-[0_8px_18px_rgba(2,132,199,0.45)] ";
    else className += "text-slate-700 hover:bg-sky-50 ";
    return className;
  };

  const openHotelCalendar = () => {
    const referenceValue = hotelCheckIn || hotelCheckOut;
    const referenceDate = referenceValue ? parseISO(referenceValue) : new Date();
    const nextMonth = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
    const nextCheckIn = hotelCheckIn ? parseISO(hotelCheckIn) : null;
    const nextCheckOut = hotelCheckOut ? parseISO(hotelCheckOut) : null;
    setHotelCalendarMonth(startOfMonth(nextMonth));
    setHotelCalendarCheckInDraft(nextCheckIn && !Number.isNaN(nextCheckIn.getTime()) ? nextCheckIn : null);
    setHotelCalendarCheckOutDraft(nextCheckOut && !Number.isNaN(nextCheckOut.getTime()) ? nextCheckOut : null);
    setHotelCalendarOpen(true);
  };

  const confirmHotelCalendarSelection = () => {
    if (!hotelCalendarCheckInDraft || !hotelCalendarCheckOutDraft) return;
    const start = hotelCalendarCheckInDraft < hotelCalendarCheckOutDraft ? hotelCalendarCheckInDraft : hotelCalendarCheckOutDraft;
    const end = hotelCalendarCheckInDraft < hotelCalendarCheckOutDraft ? hotelCalendarCheckOutDraft : hotelCalendarCheckInDraft;
    const nextCheckIn = format(start, "yyyy-MM-dd");
    const nextCheckOut = format(end, "yyyy-MM-dd");
    setHotelCheckIn(nextCheckIn);
    setHotelCheckOut(nextCheckOut);
    setHotelCalendarOpen(false);
    if (hotelCityId > 0 && hasHotelTravellerSelection) {
      setHotelCriteriaGlowTarget(null);
      setTimeout(() => {
        void runHotelSearch({ replace: true, scroll: false });
      }, 0);
    } else {
      setHotelCriteriaGlowTarget(hasHotelTravellerSelection ? "chambres" : "voyageurs");
    }
  };

  const resolveHotelCardRoomTravellers = (roomCount: number) => {
    if (Array.isArray(sharedHotelRoomTravellers) && sharedHotelRoomTravellers.length > 0) {
      return normalizeHotelRoomTravellers(sharedHotelRoomTravellers, roomCount);
    }
    return buildHotelRoomTravellersFromFilters(roomCount, hotelAdults, hotelChildAges);
  };

  const resolveHotelSearchTravellerContext = () => {
    const roomCount = Math.max(1, Math.min(4, Number(sharedHotelRoomCount ?? 1) || 1));
    const roomTravellers = resolveHotelCardRoomTravellers(roomCount);
    return {
      roomCount,
      roomTravellers,
      adults: roomTravellers.reduce((sum, room) => sum + Math.max(1, Number(room.adults) || 1), 0),
      childAges: flattenHotelRoomChildAges(roomTravellers),
    };
  };

  const setHotelRoomCount = (nextRoomCount: number) => {
    const safeRoomCount = Math.max(1, Math.min(4, Math.floor(Number(nextRoomCount) || 1)));
    setSharedHotelRoomCount(safeRoomCount);
    setSharedHotelRoomTravellers((prev) => {
      const seededCurrent = Array.isArray(prev) && prev.length > 0
        ? prev
        : buildHotelRoomTravellersFromFilters(sharedHotelRoomCount, hotelAdults, hotelChildAges);
      return normalizeHotelRoomTravellers(seededCurrent, safeRoomCount);
    });
    setHotelAvailabilitySignatureByHotel({});
    setHotelCriteriaGlowTarget("chambres");
  };

  useEffect(() => {
    setSharedHotelRoomTravellers(buildHotelRoomTravellersFromFilters(sharedHotelRoomCount, hotelAdults, hotelChildAges));
    setHotelAvailabilitySignatureByHotel({});
  }, [sharedHotelRoomCount, hotelAdults, hotelChildAges]);

  useEffect(() => {
    setHotelAvailabilitySignatureByHotel({});
  }, [hotelCheckIn, hotelCheckOut]);

  const runHotelSearch = async (options?: { replace?: boolean; scroll?: boolean }) => {
    const travellerContext = resolveHotelSearchTravellerContext();
    const nextChildAges = [...travellerContext.childAges];
    const keywords = selectedHotelId > 0 ? "" : hotelDestinationQuery.trim();
    const resolvedAdults = Math.max(1, Number(travellerContext.adults || hotelAdults || hotelDefaults.adults || 1));
    const hasValidDates = hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut);
    const hasValidTravellers = travellerContext.adults > 0 || nextChildAges.length > 0 || hasHotelTravellerSelection;
    setHasSearched(true);
    setLoadingHotelResults(true);
    setHotelSearchLoadingModal(true);
    setHotelProviderError("");
    setHotelSearchFallbackNotice("");

    try {
      if (!hotelCityId || !hasValidDates || !hasValidTravellers) {
        const fallbackHotels = await listHotels(hotelCityId || undefined);
        const filteredFallback = Array.isArray(fallbackHotels)
          ? fallbackHotels.filter((hotel) => {
              const matchesKeyword = matchesHotelKeywordForFallback(hotel, keywords);
              const matchesSelected = selectedHotelId <= 0 || Number(hotel.Id || 0) === Number(selectedHotelId);
              return matchesKeyword && matchesSelected;
            })
          : [];
          setHotelResults(filteredFallback);
        if (!hotelCityId) {
          setHotelSearchFallbackNotice("Aucune destination selectionnee. Voici les hotels disponibles.");
        } else if (hasValidDates && hasValidTravellers) {
          setHotelSearchFallbackNotice("Voici les hotels de la destination selectionnee.");
        }
        return filteredFallback;
      } else {
        const hotels = await searchHotels({
          cityId: hotelCityId || undefined,
          checkIn: hotelCheckIn,
          checkOut: hotelCheckOut,
          adults: resolvedAdults,
          childAges: nextChildAges,
          keywords: keywords || undefined,
          onlyAvailable: true,
        });
        if (hotels.length === 0 && nextChildAges.length > 0 && hotelCityId > 0) {
          const fallbackHotels = await listHotels(hotelCityId);
          const filteredFallback = Array.isArray(fallbackHotels)
            ? fallbackHotels.filter((hotel) => {
                const matchesKeyword = matchesHotelKeywordForFallback(hotel, keywords);
                const matchesSelected = selectedHotelId <= 0 || Number(hotel.Id || 0) === Number(selectedHotelId);
                return matchesKeyword && matchesSelected;
              })
            : [];
          setHotelResults(filteredFallback);
          setHotelSearchFallbackNotice(
            selectedHotelId > 0
              ? selectedHotelUnavailableMessage
              : hotelUnavailableMessage
          );
          return filteredFallback;
        } else {
          setHotelResults(hotels);
          setHotelAvailabilitySignatureByHotel((prev) => {
            const next = { ...prev };
            hotels.forEach((hotel) => {
              const hotelId = Number(hotel?.Id || 0);
              if (hotelId <= 0) return;
              const roomSelections = Array.isArray(localRoomSelectionsByHotel[hotelId]) ? localRoomSelectionsByHotel[hotelId] : [];
              next[hotelId] = buildHotelAvailabilitySignature({
                hotelId,
                hotelCityId,
                hotelDestinationQuery,
                selectedHotelId,
                checkIn: hotelCheckIn,
                checkOut: hotelCheckOut,
                roomTravellers: travellerContext.roomTravellers,
                roomCount: travellerContext.roomCount,
                roomSelections,
              });
            });
            return next;
          });
          return hotels;
        }
      }

      const nextParams = applyAmicaleParam(new URLSearchParams(searchParams));
      nextParams.set("mode", "hotellerie");
      nextParams.delete("location");
      nextParams.delete("locations");
      nextParams.delete("mainType");
      nextParams.delete("mainTypes");
      nextParams.delete("categories");
      nextParams.delete("seaside");
      nextParams.delete("comfort");
      nextParams.delete("stayRanges");
      if (hotelCityId > 0) nextParams.set("cityId", String(hotelCityId));
      else nextParams.delete("cityId");
      if (hotelCheckIn) nextParams.set("checkIn", hotelCheckIn);
      else nextParams.delete("checkIn");
      if (hotelCheckOut) nextParams.set("checkOut", hotelCheckOut);
      else nextParams.delete("checkOut");
      if (resolvedAdults > 0) nextParams.set("adults", String(resolvedAdults));
      else nextParams.delete("adults");
      if (nextChildAges.length > 0) nextParams.set("children", nextChildAges.join(","));
      else nextParams.delete("children");
      if (keywords) nextParams.set("q", keywords);
      else nextParams.delete("q");
      setSearchParams(nextParams, { replace: Boolean(options?.replace) });

      if (options?.scroll !== false) {
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    } catch (error) {
      setHotelResults([]);
      setHotelProviderError(error instanceof Error ? error.message : "Recherche hoteliere impossible.");
      return [];
    } finally {
      setLoadingHotelResults(false);
      setTimeout(() => setHotelSearchLoadingModal(false), 250);
    }
  };

  const verifyHotelAvailability = async (hotel: HotelSummary, hotelId: number) => {
    if (checkingAvailabilityHotelId !== null) return;
    const resolvedCityId = Number(hotelCityId || hotel.City?.Id || 0);
    if (!resolvedCityId) {
      return;
    }
    if (!hotelCheckIn || !hotelCheckOut) {
      setHotelCriteriaGlowTarget("dates");
      return;
    }
    const travellerContext = resolveHotelSearchTravellerContext();
    const roomSelections = Array.isArray(localRoomSelectionsByHotel[hotelId]) ? localRoomSelectionsByHotel[hotelId] : [];
    const totalSelectedAdults = travellerContext.adults;
    if (!hasRequiredHotelSearchApiInputs({
      cityId: resolvedCityId,
      checkIn: hotelCheckIn,
      checkOut: hotelCheckOut,
      adults: totalSelectedAdults,
    })) {
      setHotelCriteriaGlowTarget("voyageurs");
      return;
    }
    setCheckingAvailabilityHotelId(hotelId);
    try {
      const refreshedHotels = await runHotelSearch({ replace: true, scroll: false });
      if (!Array.isArray(refreshedHotels) || refreshedHotels.length === 0) {
        setHotelCriteriaGlowTarget("chambres");
        toast.error("Aucune disponibilité pour ce choix. Modifiez vos critères puis revérifiez.");
        return;
      }
      setHotelAvailabilitySignatureByHotel((prev) => {
        const next = { ...prev };
        refreshedHotels.forEach((visibleHotel) => {
          const visibleHotelId = Number(visibleHotel?.Id || 0);
          if (visibleHotelId <= 0) return;
          const visibleRoomSelections = Array.isArray(localRoomSelectionsByHotel[visibleHotelId]) ? localRoomSelectionsByHotel[visibleHotelId] : [];
          next[visibleHotelId] = buildHotelAvailabilitySignature({
            hotelId: visibleHotelId,
            hotelCityId,
            hotelDestinationQuery,
            selectedHotelId,
            checkIn: hotelCheckIn,
            checkOut: hotelCheckOut,
            roomCount: travellerContext.roomCount,
            roomTravellers: travellerContext.roomTravellers,
            roomSelections: visibleRoomSelections,
          });
        });
        return next;
      });
      setHotelCriteriaGlowTarget(null);
      toast.success("Disponibilité vérifiée pour les hôtels affichés.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vérification de disponibilité impossible.");
    } finally {
      setCheckingAvailabilityHotelId(null);
    }
  };

  const openHotelReserveModal = (payload: {
    hotel: HotelSummary;
    adults: number;
    childAges: number[];
    rooms: Array<{
      boardingId: number | null;
      boardingName: string | null;
      roomId: number | null;
      roomName: string | null;
      price: number | null;
      adults: number;
      children: number;
      childAges: number[];
    }>;
    totalPrice: number | null;
  }) => {
    if (!user || user.role !== "user" || !user.email) {
      savePendingHomeHotelReserve(payload);
      setLoginPromptStep("choices");
      setShowLoginPrompt(true);
      return;
    }
    if (!user.profileCompleted) {
      savePendingHomeHotelReserve(payload);
      openProfileSetupStep(user);
      return;
    }
    const userFirstName = String(user.firstName || "").trim();
    const userLastName = String(user.lastName || "").trim();
    const adults = Array.from({ length: Math.max(1, payload.adults) }).map((_, index) => ({
      firstName: index === 0 ? userFirstName : "",
      lastName: index === 0 ? userLastName : "",
    }));
    const children = Array.from({ length: payload.childAges.length }).map(() => ({
      firstName: "",
      lastName: "",
    }));
    setHotelReserveModal({
      ...payload,
      travellers: { adults, children },
      phone: String(user.telephone || "").trim(),
      note: "",
    });
    setHotelTravellerAccordionOpen("adult-0");
  };

  const splitHumanName = (value?: string | null) => {
    const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: "", lastName: "" };
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join(" ") };
  };

  const openProfileSetupStep = (sourceUser?: any) => {
    const currentUser = sourceUser || user;
    const nameParts = splitHumanName(currentUser?.name || "");
    setProfilePromptForm({
      firstName: String(currentUser?.firstName || nameParts.firstName || "").trim(),
      lastName: String(currentUser?.lastName || nameParts.lastName || "").trim(),
      clientType: "locataire",
      telephone: String(currentUser?.telephone || "").trim(),
      address: String(currentUser?.address || "").trim(),
      cin: String(currentUser?.cin || "").trim(),
      cinImageUrl: String(currentUser?.cinImageUrl || "").trim(),
    });
    setLoginPromptStep("profile_setup");
    setShowLoginPrompt(true);
  };

  const handleProfileCinUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsProfileCinUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch(buildApiUrl("/upload"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.error || "Upload de la photo CIN echoue"));
      const imageUrl = String(data?.url || data?.imageUrl || "").trim();
      if (!imageUrl) throw new Error("URL photo CIN manquante");
      setProfilePromptForm((prev) => ({ ...prev, cinImageUrl: imageUrl }));
      toast.success("Photo CIN enregistree");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload de la photo CIN echoue");
    } finally {
      setIsProfileCinUploading(false);
      event.target.value = "";
    }
  };

  const applyLoggedUser = (loggedUser: any) => {
    login({
      id: loggedUser.id,
      email: loggedUser.email,
      name: loggedUser.name,
      firstName: loggedUser.firstName || undefined,
      lastName: loggedUser.lastName || undefined,
      avatar: loggedUser.avatar || undefined,
      clientType: loggedUser.clientType || undefined,
      telephone: loggedUser.telephone || undefined,
      address: loggedUser.address || undefined,
      cin: loggedUser.cin || undefined,
      cinImageUrl: loggedUser.cinImageUrl || undefined,
      profileCompleted: loggedUser.profileCompleted,
      role: "user",
    });
  };

  const handlePromptSocialLogin = (provider: "google" | "facebook") => {
    if (provider === "google" && !providers.google) {
      toast.error("Google login indisponible pour le moment");
      return;
    }
    if (provider === "facebook" && !providers.facebook) {
      toast.error("Facebook login indisponible pour le moment");
      return;
    }
    const returnTo = `${routerLocation.pathname}${routerLocation.search}`;
    saveAuthReturnTo(returnTo);
    markAuthPendingLogin();
    setIsAwaitingLogin(true);
    setShowLoginPrompt(false);
    // Keep auth in the same tab/page flow (no popup window).
    startSocialLogin(provider, returnTo);
  };

  const handlePromptPasskeyLogin = async () => {
    if (!providers.passkey) return toast.error("Passkey indisponible pour le moment");
    if (!window.PublicKeyCredential || !navigator.credentials) return toast.error("Passkey non supporte sur ce navigateur/appareil");
    setIsPasskeyPromptLoading(true);
    try {
      const loggedUser = await loginWithPasskey();
      applyLoggedUser(loggedUser);
      if (!loggedUser.profileCompleted) {
        openProfileSetupStep(loggedUser);
        toast.info("Completez votre profil pour continuer.");
        return;
      }
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      toast.success("Connexion reussie");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion Passkey echouee";
      if (/aucun passkey|no passkey|credential not found|introuvable/i.test(String(message).toLowerCase())) {
        setLoginPromptStep("passkey_setup");
        return toast.info("Aucune passkey detectee. Creez-en une.");
      }
      toast.error(message);
    } finally {
      setIsPasskeyPromptLoading(false);
    }
  };

  const handlePromptPasskeyCreate = async () => {
    const email = passkeyPromptEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Entrez un email valide.");
    setIsPasskeyCreateLoading(true);
    try {
      const loggedUser = await registerWithPasskey(email, passkeyPromptName.trim());
      applyLoggedUser(loggedUser);
      if (!loggedUser.profileCompleted) {
        openProfileSetupStep(loggedUser);
        toast.info("Completez votre profil pour continuer.");
        return;
      }
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      toast.success("Passkey creee avec succes");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation Passkey echouee");
    } finally {
      setIsPasskeyCreateLoading(false);
    }
  };

  const handlePromptProfileComplete = async () => {
    if (!user?.id) return toast.error("Session invalide.");
    if (!profilePromptForm.firstName.trim() || !profilePromptForm.lastName.trim() || !profilePromptForm.telephone.trim() || !profilePromptForm.address.trim() || !profilePromptForm.cin.trim()) {
      return toast.error("Nom, prenom, telephone, adresse et CIN sont obligatoires.");
    }
    if (!profilePromptForm.cinImageUrl.trim()) {
      return toast.error("La photo CIN est obligatoire.");
    }
    setIsProfilePromptSaving(true);
    try {
      const savedUser = await completeSocialProfile({
        id: user.id,
        firstName: profilePromptForm.firstName.trim(),
        lastName: profilePromptForm.lastName.trim(),
        name: `${profilePromptForm.firstName.trim()} ${profilePromptForm.lastName.trim()}`.trim(),
        email: user.email,
        clientType: "locataire",
        telephone: profilePromptForm.telephone.trim(),
        address: profilePromptForm.address.trim(),
        cin: profilePromptForm.cin.trim(),
        cinImageUrl: profilePromptForm.cinImageUrl.trim(),
      });
      applyLoggedUser(savedUser);
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      toast.success("Profil complete.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de sauvegarder le profil");
    } finally {
      setIsProfilePromptSaving(false);
    }
  };

  const submitHotelReserveFromHome = async () => {
    if (!hotelReserveModal) return;
    if (!user || user.role !== "user" || !user.email) {
      setLoginPromptStep("choices");
      setShowLoginPrompt(true);
      return;
    }
    const phone = String(hotelReserveModal.phone || "").trim();
    if (!phone) {
      toast.error("Numero de telephone obligatoire.");
      return;
    }
    const invalidAdultIndex = hotelReserveModal.travellers.adults.findIndex((adult) => !String(adult.firstName || "").trim() || !String(adult.lastName || "").trim());
    if (invalidAdultIndex >= 0) {
      toast.error(`Nom et prenom obligatoires pour adulte ${invalidAdultIndex + 1}.`);
      return;
    }
    const invalidChildIndex = hotelReserveModal.travellers.children.findIndex((child) => !String(child.firstName || "").trim() || !String(child.lastName || "").trim());
    if (invalidChildIndex >= 0) {
      toast.error(`Nom et prenom obligatoires pour enfant ${invalidChildIndex + 1}.`);
      return;
    }

    setSubmittingHotelReserve(true);
    try {
      const created = await createHotelReservationDemand({
        hotelId: hotelReserveModal.hotel.Id,
        hotelName: hotelReserveModal.hotel.Name,
        hotelCityId: hotelReserveModal.hotel.City?.Id || null,
        hotelCityName: hotelReserveModal.hotel.City?.Name || null,
        hotelImageUrl: String(hotelReserveModal.hotel.Image || "").trim() || null,
        checkIn: hotelCheckIn,
        checkOut: hotelCheckOut,
        adults: hotelReserveModal.adults,
        childAges: hotelReserveModal.childAges,
        boardingId: hotelReserveModal.rooms[0]?.boardingId || null,
        boardingName: hotelReserveModal.rooms[0]?.boardingName || null,
        roomId: hotelReserveModal.rooms[0]?.roomId || null,
        roomName: hotelReserveModal.rooms[0]?.roomName || null,
        totalPrice: hotelReserveModal.totalPrice,
        currency: "TND",
        clientPhone: phone,
        clientNote: String(hotelReserveModal.note || "").trim() || null,
        hotelContext: {
          source: "homepage_card",
          rooms: hotelReserveModal.rooms.map((room, index) => ({
            ...room,
            index,
          })),
          roomCount: hotelReserveModal.rooms.length,
          travellers: {
            adults: hotelReserveModal.travellers.adults.map((adult) => ({
              firstName: String(adult.firstName || "").trim(),
              lastName: String(adult.lastName || "").trim(),
            })),
            children: hotelReserveModal.travellers.children.map((child, index) => ({
              firstName: String(child.firstName || "").trim(),
              lastName: String(child.lastName || "").trim(),
              age: Number(hotelReserveModal.childAges[index] ?? 0),
            })),
          },
        },
      });
      setHotelReserveModal(null);
      clearPendingHomeHotelReserve();
      toast.success("Demande créée. Passez maintenant au paiement.");
      navigate(`/mes-reservations/hotels/${encodeURIComponent(created.id)}/paiement`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de creer la demande hotel.";
      if (/401|auth|connect|session|acces refuse|forbidden/i.test(message)) {
        savePendingHomeHotelReserve({
          hotel: hotelReserveModal.hotel,
          adults: hotelReserveModal.adults,
          childAges: hotelReserveModal.childAges,
          rooms: hotelReserveModal.rooms,
          totalPrice: hotelReserveModal.totalPrice,
        });
        setLoginPromptStep("choices");
        setShowLoginPrompt(true);
        return;
      }
      toast.error(message);
    } finally {
      setSubmittingHotelReserve(false);
    }
  };

  useEffect(() => {
    if (!user || user.role !== "user" || !user.email) return;
    if (hotelReserveModal) return;
    const pending = readPendingHomeHotelReserve();
    if (!pending) return;
    setHotelReserveModal({
      ...pending,
      travellers: {
        adults: Array.from({ length: Math.max(1, pending.adults) }).map((_, index) => ({
          firstName: index === 0 ? String(user.firstName || "").trim() : "",
          lastName: index === 0 ? String(user.lastName || "").trim() : "",
        })),
        children: Array.from({ length: pending.childAges.length }).map(() => ({ firstName: "", lastName: "" })),
      },
      phone: String(user.telephone || "").trim(),
      note: "",
    });
    setHotelTravellerAccordionOpen("adult-0");
    clearPendingHomeHotelReserve();
  }, [user, hotelReserveModal]);

  useEffect(() => {
    if (!user || user.role !== "user" || !user.email) return;
    if (user.profileCompleted) return;
    if (showLoginPrompt && loginPromptStep === "profile_setup") return;
    openProfileSetupStep(user);
  }, [loginPromptStep, openProfileSetupStep, showLoginPrompt, user]);

  useEffect(() => {
    let cancelled = false;
    if (!showLoginPrompt) return;
    void getAuthProviders().then((availableProviders) => {
      if (!cancelled) setProviders(availableProviders);
    });
    return () => {
      cancelled = true;
    };
  }, [showLoginPrompt]);

  useEffect(() => {
    if (!isAwaitingLogin && !isAuthPendingLogin()) return;
    if (!user || user.role !== "user" || !user.email) return;
    clearAuthPendingLogin();
    setIsAwaitingLogin(false);
    if (!user.profileCompleted) {
      openProfileSetupStep(user);
      return;
    }
    setShowLoginPrompt(false);
  }, [isAwaitingLogin, user]);

  useEffect(() => {
    const onAuthMessage = (event: MessageEvent) => {
      const payload = event?.data;
      if (!payload || typeof payload !== "object") return;
      const type = String((payload as any).type || "").trim();
      if (type === "DWIRA_AUTH_SUCCESS") {
        clearAuthPendingLogin();
        setIsAwaitingLogin(false);
      }
    };
    window.addEventListener("message", onAuthMessage);
    return () => window.removeEventListener("message", onAuthMessage);
  }, []);

  const handleSearch = () => {
    setHasSearched(true);
    if (isHotelMode) {
      if (!hotelCityId || loadingHotelResults) return;
      if (!hotelCheckIn || !hotelCheckOut) {
        setHotelCriteriaGlowTarget("dates");
      } else if (!hasHotelTravellerSelection) {
        setHotelCriteriaGlowTarget("voyageurs");
      } else {
        setHotelCriteriaGlowTarget(null);
      }
      void runHotelSearch();
      return;
    }

    const params = applyAmicaleParam(new URLSearchParams(searchParams));
    params.set("mode", selectedMode);
    params.delete("location");
    params.delete("locations");
    params.delete("mainType");
    params.delete("mainTypes");
    params.delete("checkIn");
    params.delete("checkOut");
    params.delete("stayRanges");
    if (selectedLocations.length > 0) params.set("locations", selectedLocations.join(","));
    if (selectedMainTypes.length > 0) params.set("mainTypes", selectedMainTypes.join(","));
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
    if (selectedStayRanges.length > 0) {
      params.set("stayRanges", serializeStayRangesParam(selectedStayRanges));
      params.set("checkIn", selectedStayRanges[0].start);
      params.set("checkOut", selectedStayRanges[0].end);
    }
    
    navigate(selectedMode === "vente" ? `/ventes` : `/logements?${params.toString()}`);
    
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const filteredProperties = useMemo(() => {
    const selectedSubTypeMatchKeys = selectedCategories
      .flatMap((item) => getSelectedSubTypeMatchKeys(item, selectedMainTypes))
      .filter(Boolean);
    const validStayRanges = selectedStayRanges.filter((range) => isValidStayRange(range.start, range.end));
    const shouldFilterByStay = hasSearched && validStayRanges.length > 0;
    const baseProperties = hasSearched
      ? modeProperties.filter((property) => {
          const propertyLocationText = String(property.location || "").toLowerCase();
          const matchLocation =
            selectedLocations.length === 0
            || selectedLocations.some((item) => {
              const parts = String(item || "").split("/").map((part) => part.trim().toLowerCase()).filter(Boolean);
              if (parts.length === 0) return false;
              return parts.some((part) => propertyLocationText.includes(part));
            });
          const resolvedCategory = getResolvedPropertyCategoryLabel(property);
          const propertyMainType = getMainTypeFromCategory(String(resolvedCategory || property.category || ""));
          const propertySubTypeKey = getCanonicalSubTypeKey(resolvedCategory || property.category || "");
          const propertySubTypeMatchKey = propertySubTypeKey ? `${propertyMainType}::${propertySubTypeKey}` : "";
          const matchMainType = selectedMainTypes.length === 0 || selectedMainTypes.includes(propertyMainType);
          const matchSubType = selectedSubTypeMatchKeys.length === 0 || selectedSubTypeMatchKeys.includes(propertySubTypeMatchKey);
          const matchSeaside = selectedSeasideOptions.length === 0 || selectedSeasideOptions.some((option) => propertyMatchesSeasideOption(property, option));
          const matchComfort = selectedComfortOptions.length === 0 || selectedComfortOptions.some((option) => propertyMatchesComfortOption(property, option));
          const matchStay =
            !shouldFilterByStay
            || validStayRanges.some((range) => !hasBlockingUnavailableDates(property.unavailableDates || [], range.start, range.end));
          return matchLocation && matchMainType && matchSubType && matchSeaside && matchComfort && matchStay;
        })
      : modeProperties;

    return [...baseProperties].sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return b.rating - a.rating;
    });
  }, [hasSearched, selectedLocations, selectedMainTypes, selectedCategories, selectedSeasideOptions, selectedComfortOptions, selectedStayRanges, modeProperties]);
  const visibleFilteredProperties = useMemo(
    () => (showAllProperties ? filteredProperties : filteredProperties.slice(0, visiblePropertiesCount)),
    [filteredProperties, showAllProperties, visiblePropertiesCount]
  );
  const hasMoreFilteredProperties = !showAllProperties && filteredProperties.length > visiblePropertiesCount;

  useEffect(() => {
    setVisiblePropertiesCount(INITIAL_VISIBLE_PROPERTIES);
    setShowAllProperties(false);
  }, [
    selectedMode,
    hasSearched,
    selectedLocations,
    selectedMainTypes,
    selectedCategories,
    selectedSeasideOptions,
    selectedComfortOptions,
    selectedStayRanges,
  ]);

  const dateRangeText = () => {
    if (selectedStayRanges.length > 1) {
      return `${selectedStayRanges.length} periodes`;
    }
    if (selectedStayRanges.length === 1) {
      const [range] = selectedStayRanges;
      return `${format(parseISO(range.start), "d MMM", { locale: fr })} - ${format(parseISO(range.end), "d MMM yyyy", { locale: fr })}`;
    }
    if (checkIn) {
      return `Du ${format(checkIn, "d MMM", { locale: fr })}...`;
    }
    return "Dates de séjour";
  };

  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const closeAllFilters = () => {
    setShowLocationDropdown(false);
    setShowCalendar(false);
    setShowCategoryDropdown(false);
    setShowSeasideDropdown(false);
    setShowComfortDropdown(false);
  };
  const closeAllFiltersAndSuppress = () => {
    closeAllFilters();
    suppressFilterOpenUntilRef.current = Date.now() + 280;
  };
  const anyFilterOpen =
    showLocationDropdown || showCalendar || showCategoryDropdown || showSeasideDropdown || showComfortDropdown;
  const handleOpenAdvancedFilters = () => {
    const params = applyAmicaleParam(new URLSearchParams(searchParams));
    const logementsMode = selectedMode === "location_annuelle" ? "location_annuelle" : "location_saisonniere";
    params.set("mode", logementsMode);
    params.delete("location");
    params.delete("locations");
    params.delete("mainType");
    params.delete("mainTypes");
    params.delete("checkIn");
    params.delete("checkOut");
    params.delete("stayRanges");
    if (selectedLocations.length > 0) params.set("locations", selectedLocations.join(","));
    if (selectedMainTypes.length > 0) params.set("mainTypes", selectedMainTypes.join(","));
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
    if (selectedStayRanges.length > 0) {
      params.set("stayRanges", serializeStayRangesParam(selectedStayRanges));
      params.set("checkIn", selectedStayRanges[0].start);
      params.set("checkOut", selectedStayRanges[0].end);
    }
    navigate(`/logements?${params.toString()}`);
  };
  const selectedLocationWidgetImage =
    selectedLocationImages.zone
    || selectedLocationImages.region
    || selectedLocationImages.gouvernerat
    || selectedLocationImages.pays
    || null;
  const selectedLocationSummary = selectedLocations.length > 0 ? selectedLocations.join(", ") : "Tous les emplacements";

  useEffect(() => {
    if (!showLocationDropdown && !showCalendar && !showCategoryDropdown && !showSeasideDropdown && !showComfortDropdown) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      const isInsideControls = Boolean(filterControlsRef.current && target && filterControlsRef.current.contains(target));
      const isInsideDesktopLocation = Boolean(locationDesktopPopupRef.current && target && locationDesktopPopupRef.current.contains(target));
      const isInsideMobileLocation = Boolean(locationMobilePopupRef.current && target && locationMobilePopupRef.current.contains(target));
      const isInsideMobileCalendar = Boolean(calendarMobilePopupRef.current && target && calendarMobilePopupRef.current.contains(target));
      const isInsideMobileCategory = Boolean(categoryMobilePopupRef.current && target && categoryMobilePopupRef.current.contains(target));
      const isInsideDesktopSeaside = Boolean(seasideDesktopPopupRef.current && target && seasideDesktopPopupRef.current.contains(target));
      const isInsideDesktopComfort = Boolean(comfortDesktopPopupRef.current && target && comfortDesktopPopupRef.current.contains(target));
      const isInsideMobileSeaside = Boolean(seasideMobilePopupRef.current && target && seasideMobilePopupRef.current.contains(target));
      const isInsideMobileComfort = Boolean(comfortMobilePopupRef.current && target && comfortMobilePopupRef.current.contains(target));
      if (!isInsideControls && !isInsideDesktopLocation && !isInsideMobileLocation && !isInsideMobileCalendar && !isInsideMobileCategory && !isInsideDesktopSeaside && !isInsideDesktopComfort && !isInsideMobileSeaside && !isInsideMobileComfort) {
        closeAllFiltersAndSuppress();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showLocationDropdown, showCalendar, showCategoryDropdown, showSeasideDropdown, showComfortDropdown]);
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center py-20">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={HERO_IMAGE_URL}
            srcSet={`${HERO_IMAGE_URL_MOBILE} 640w, ${HERO_IMAGE_URL} 1080w`}
            sizes="(max-width: 768px) 100vw, 1080px"
            alt="Kelibia Beach"
            className="hidden md:block w-full h-full object-cover brightness-75"
            loading="eager"
            fetchpriority="high"
            decoding="async"
          />
          <div className="md:hidden absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,129,0.35),transparent_45%),linear-gradient(160deg,#0f172a_0%,#134e4a_55%,#064e3b_100%)]" />
          <div className="absolute inset-0 bg-emerald-950/40 mix-blend-multiply pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        </div>

        <div className="relative z-10 container mx-auto px-4 md:px-6 text-center text-white w-full max-w-6xl">
          <div className="mb-6">
             <div className="mb-5 flex justify-center">
               {isHotelMode ? (
                 <div className="flex items-center gap-3">
                   <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/30 bg-white/10 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md md:h-24 md:w-24">
                     <img src={logo} alt="Logo Dwira" className="h-full w-full rounded-full object-cover" />
                   </div>
                   <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/30 bg-white/10 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md md:h-24 md:w-24">
                     <img src={titaTravelLogo} alt="Logo Tita Travel" className="h-full w-full rounded-full object-cover" />
                   </div>
                 </div>
               ) : (
                 <div className="h-24 w-24 overflow-hidden rounded-full border border-white/30 bg-white/10 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md md:h-28 md:w-28">
                   <img src={logo} alt="Logo Dwira" className="h-full w-full rounded-full object-contain" />
                 </div>
               )}
             </div>
             <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 leading-tight drop-shadow-xl">
               Dwira <span className="text-amber-400">Immobilier</span>
             </h1>
             <p className="text-xl md:text-2xl font-light tracking-wide text-emerald-50">
               {isHotelMode ? "Dwira Immobilier x Tita Travel, en partenariat pour vos séjours" : "Votre partenaire de confiance à Kélibia"}
             </p>
          </div>
          
          <p className="text-lg md:text-xl mb-8 max-w-2xl mx-auto drop-shadow-md text-gray-100">
            Achat • Vente • Location • Gestion personnalisée
          </p>

          {/* Filter Bar */}
          <div className="relative z-10 -mb-3 px-4 pb-0 md:px-6">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {orderedModeTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                disabled={Boolean(tab.comingSoon)}
                onClick={() => {
                  if (tab.comingSoon) return;
                  setSelectedMode(tab.value);
                  setHasSearched(false);
                  const next = applyAmicaleParam(new URLSearchParams(searchParams));
                  next.set("mode", tab.value);
                  setSearchParams(next, { replace: true });
                }}
                className={`relative min-w-0 rounded-[18px] border px-2 py-3 text-xs font-semibold leading-tight transition-all duration-200 sm:px-3 sm:text-sm md:rounded-[22px] md:px-5 ${
                  selectedMode === tab.value
                    ? "z-10 border-white/70 bg-white/78 text-emerald-800 shadow-[0_10px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                    : tab.comingSoon
                      ? "border-white/18 bg-white/8 text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl opacity-80 cursor-not-allowed"
                      : "border-white/18 bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl hover:bg-white/20"
                }`}
              >
                <span className="block">{tab.label}</span>
                {tab.comingSoon && <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-amber-200">Bientot</span>}
              </button>
            ))}
            </div>
          </div>

          <div className="pointer-events-auto overflow-visible rounded-[34px] border border-white/60 bg-[linear-gradient(140deg,rgba(255,255,255,0.98),rgba(240,247,255,0.96))] shadow-[0_30px_90px_rgba(2,32,71,0.35),0_0_0_1px_rgba(99,102,241,0.22),0_0_42px_rgba(56,189,248,0.18)] backdrop-blur-xl max-md:shadow-[0_0_0_1px_rgba(56,189,248,0.5),0_0_28px_rgba(56,189,248,0.45),0_0_60px_rgba(99,102,241,0.26)]">
            {/* Filter Controls */}
            <div className="p-4 md:p-6">
              {isHotelMode ? (
                <>
                  <div className="rounded-[26px] border border-sky-100/70 bg-white/85 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] md:p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                    <div className="relative md:col-span-4">
                      <span className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-600 drop-shadow-[0_0_14px_rgba(56,189,248,0.6)]">
                        <MapPin size={16} className="text-sky-600" />
                        Destination
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setHotelDestinationOpen((prev) => !prev)}
                          className="h-14 w-full rounded-2xl border border-slate-200/90 bg-white px-4 pr-12 text-left text-slate-900 outline-none transition hover:border-sky-500 hover:shadow-[0_8px_28px_rgba(14,116,214,0.14)]"
                        >
                          {hotelDestinationQuery.trim() || selectedHotelCity?.Name || "Ville ou nom hotel"}
                        </button>
                        {(hotelDestinationQuery.trim() || selectedHotelCity || selectedHotelId > 0 || hotelCityId > 0) && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setHotelDestinationQuery("");
                              setSelectedHotelId(0);
                              setHotelCityId(0);
                            }}
                            className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                            aria-label="Supprimer la destination"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {hotelDestinationOpen && (
                        <div className="absolute left-0 right-0 top-[84px] z-30 hidden max-h-80 overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)] md:block">
                          <div className="border-b border-slate-100 p-3">
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <Search size={16} className="text-slate-500" />
                              <input
                                value={hotelDestinationQuery}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setHotelDestinationQuery(nextValue);
                                  setSelectedHotelId(0);
                                  if (!nextValue.trim()) {
                                    setHotelCityId(0);
                                    setSelectedHotelId(0);
                                  }
                                }}
                                placeholder="ex. ville, nom hotel"
                                className="w-full border-0 bg-transparent text-sm outline-none"
                              />
                            </div>
                          </div>
                          {filteredHotelCities.map((city) => (
                            <button
                              key={`home-hotel-city-${city.Id}`}
                              type="button"
                              onClick={() => {
                                setHotelCityId(city.Id);
                                setHotelDestinationQuery(city.Name);
                                setSelectedHotelId(0);
                              }}
                              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-sky-50/60"
                            >
                              <MapPin size={14} className="text-slate-500" />
                              <span className="text-sm font-medium text-slate-800">{city.Name}</span>
                            </button>
                          ))}
                          {loadingHotelsByCity && (
                            <div className="px-3 py-3 text-xs text-slate-500">Chargement des hôtels...</div>
                          )}
                          {filteredHotelsByCity.map((hotel) => (
                            <button
                              key={`home-hotel-name-${hotel.Id}`}
                              type="button"
                              onClick={() => {
                                if (Number(hotel?.City?.Id || 0) > 0) {
                                  setHotelCityId(Number(hotel.City?.Id || 0));
                                }
                                setSelectedHotelId(Number(hotel.Id || 0));
                                setHotelDestinationQuery(hotel.Name);
                                setHotelDestinationOpen(false);
                              }}
                              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-sky-50/60"
                            >
                              <BedDouble size={14} className="text-slate-500" />
                              <span className="text-sm font-medium text-slate-800">{hotel.Name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <label className="md:col-span-2">
                      <span className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-600 drop-shadow-[0_0_14px_rgba(56,189,248,0.6)]">
                        <Calendar size={16} className="text-sky-600" />
                        Arrivée
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            const inDate = parseISO(hotelCheckIn);
                            const outDate = parseISO(hotelCheckOut);
                            setHotelCalendarCheckInDraft(Number.isNaN(inDate.getTime()) ? null : inDate);
                            setHotelCalendarCheckOutDraft(Number.isNaN(outDate.getTime()) ? null : outDate);
                            setHotelCalendarMonth(Number.isNaN(inDate.getTime()) ? new Date() : inDate);
                            setHotelCalendarOpen(true);
                          }}
                          className="h-14 w-full rounded-2xl border border-slate-200/90 bg-white px-4 pr-12 text-left text-slate-900 outline-none transition hover:border-sky-500 hover:shadow-[0_8px_28px_rgba(14,116,214,0.14)]"
                        >
                          {hotelCheckIn || "Sélectionner"}
                        </button>
                        {hotelCheckIn && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setHotelCheckIn("");
                              setHotelCalendarCheckInDraft(null);
                            }}
                            className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                            aria-label="Supprimer la date d'arrivée"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </label>

                    <label className="md:col-span-2">
                      <span className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-600 drop-shadow-[0_0_14px_rgba(56,189,248,0.6)]">
                        <Calendar size={16} className="text-sky-600" />
                        Départ
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            const inDate = parseISO(hotelCheckIn);
                            const outDate = parseISO(hotelCheckOut);
                            setHotelCalendarCheckInDraft(Number.isNaN(inDate.getTime()) ? null : inDate);
                            setHotelCalendarCheckOutDraft(Number.isNaN(outDate.getTime()) ? null : outDate);
                            setHotelCalendarMonth(Number.isNaN(inDate.getTime()) ? new Date() : inDate);
                            setHotelCalendarOpen(true);
                          }}
                          className="h-14 w-full rounded-2xl border border-slate-200/90 bg-white px-4 pr-12 text-left text-slate-900 outline-none transition hover:border-sky-500 hover:shadow-[0_8px_28px_rgba(14,116,214,0.14)]"
                        >
                          {hotelCheckOut || "Sélectionner"}
                        </button>
                        {hotelCheckOut && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setHotelCheckOut("");
                              setHotelCalendarCheckOutDraft(null);
                            }}
                            className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                            aria-label="Supprimer la date de départ"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </label>

                    <div className="md:col-span-2">
                      <span className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-600 drop-shadow-[0_0_14px_rgba(56,189,248,0.6)]">
                        <Users size={16} className="text-sky-600" />
                        Voyageurs
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setHotelTravellersOpen((prev) => !prev)}
                          className="h-14 w-full rounded-2xl border border-slate-200/90 bg-white px-4 pr-12 text-left text-slate-900 outline-none transition hover:border-sky-500 hover:shadow-[0_8px_28px_rgba(14,116,214,0.14)]"
                        >
                          {hotelTravellersLabel}
                        </button>
                        {hasHotelTravellerSelection && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setHotelAdults(0);
                              setHotelChildAges([]);
                            }}
                            className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                            aria-label="Supprimer les voyageurs"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <span className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-transparent">Action</span>
                      <button
                        type="button"
                        onClick={handleSearch}
                        disabled={!hotelCityId || loadingHotelResults}
                        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0284c7,#2563eb)] px-6 text-sm font-bold text-white shadow-[0_14px_34px_rgba(3,105,161,0.42),0_0_24px_rgba(56,189,248,0.32)] transition hover:translate-y-[-1px] hover:shadow-[0_20px_40px_rgba(3,105,161,0.5),0_0_30px_rgba(99,102,241,0.3)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                      >
                        {loadingHotelResults ? <LoaderCircle size={18} className="animate-spin" /> : <Search size={18} />}
                        {hasSearched ? "Vérifier disponibilité" : "Rechercher les hôtels"}
                      </button>
                    </div>
                  </div>
                  </div>
                  {hotelTravellersOpen && (
                    <div className="mt-4 hidden rounded-2xl border border-slate-200/90 bg-[linear-gradient(180deg,#f8fbff,#f1f5f9)] p-4 text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.08)] md:block">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">Adultes</p>
                        <div className="flex items-center gap-2 text-slate-900">
                          <button type="button" onClick={() => setHotelAdults((prev) => Math.max(0, prev - 1))} className="rounded-lg border border-slate-300 p-2 text-slate-900 hover:bg-white"><Minus size={14} /></button>
                          <span className="w-6 text-center font-semibold text-slate-900">{hotelAdults}</span>
                          <button type="button" onClick={() => setHotelAdults((prev) => Math.min(8, prev + 1))} className="rounded-lg border border-slate-300 p-2 text-slate-900 hover:bg-white"><Plus size={14} /></button>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">Enfants</p>
                        <div className="flex items-center gap-2 text-slate-900">
                          <button type="button" onClick={() => setHotelChildAges((prev) => prev.slice(0, Math.max(0, prev.length - 1)))} className="rounded-lg border border-slate-300 p-2 text-slate-900 hover:bg-white"><Minus size={14} /></button>
                          <span className="w-6 text-center font-semibold text-slate-900">{hotelChildAges.length}</span>
                          <button type="button" onClick={() => setHotelChildAges((prev) => [...prev, 0])} className="rounded-lg border border-slate-300 p-2 text-slate-900 hover:bg-white"><Plus size={14} /></button>
                        </div>
                      </div>
                      {hotelChildAges.length > 0 && (
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          {hotelChildAges.map((age, index) => (
                            <label key={`home-child-age-${index}`} className="text-xs text-slate-600">
                              Age enfant {index + 1}
                              <select
                                value={age}
                                onChange={(event) => setHotelChildAges((prev) => {
                                  const next = [...prev];
                                  next[index] = Number(event.target.value) || 0;
                                  return next;
                                })}
                                className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                              >
                                {Array.from({ length: 18 }).map((_, ageOption) => (
                                  <option key={`home-age-opt-${index}-${ageOption}`} value={ageOption}>{ageOption} ans</option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3">
                    <div className="rounded-xl border border-slate-200/70 bg-white/75 px-3 py-2 text-sm text-slate-600">
                      {selectedHotelCity ? `Destination sélectionnée : ${selectedHotelCity.Name}.` : "Sélectionnez une destination pour lancer votre recherche."}
                    </div>
                  </div>

                  {hotelPublicErrorMessage && (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <div className="flex items-start gap-3">
                        <AlertCircle size={18} className="mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold">Offres temporairement indisponibles</p>
                          <p className="mt-1">{hotelPublicErrorMessage}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {hotelConfigReady === false && !hotelPublicErrorMessage && (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Les offres hôtelières seront disponibles très prochainement.
                    </div>
                  )}
                </>
              ) : (
              <>
              <div ref={filterControlsRef} className="grid grid-cols-1 gap-4 md:grid-cols-12">
                
                {/* Location Dropdown */}
                <div className={`relative pointer-events-auto md:col-span-3 ${showLocationDropdown ? 'z-[120]' : 'z-10'}`}>
                  <button 
                    type="button"
                    className={`relative w-full flex items-center gap-3 overflow-hidden px-4 py-3 rounded-2xl border cursor-pointer transition-colors h-full text-left pointer-events-auto ${showLocationDropdown ? "border-emerald-500 ring-2 ring-emerald-100 bg-white" : "border-gray-200 bg-gray-50 hover:border-emerald-400"}`}
                    onClick={() => {
                      if (Date.now() < suppressFilterOpenUntilRef.current) return;
                      if (anyFilterOpen && !showLocationDropdown) {
                        closeAllFiltersAndSuppress();
                        setOpenLocationLevel(null);
                        return;
                      }
                      if (showLocationDropdown) setShowLocationDropdown(false);
                      else openLocationSelector();
                      setOpenLocationLevel(null);
                      setShowCategoryDropdown(false);
                      setShowCalendar(false);
                    }}
                  >
                    {selectedLocationWidgetImage && (
                      <img
                        src={resolveZoneImageUrl(selectedLocationWidgetImage)}
                        alt={selectedLocationSummary}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    {selectedLocationWidgetImage && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                    <MapPin className={`relative z-10 shrink-0 ${selectedLocationWidgetImage ? "text-white" : "text-emerald-600"}`} size={20} />
                    <div className="relative z-10 flex-1 min-w-0">
                      <p className={`text-xs font-medium ${selectedLocationWidgetImage ? "text-white/90" : "text-gray-500"}`}>Où cherchez-vous ?</p>
                      <p className={`truncate text-sm font-semibold ${selectedLocationWidgetImage ? "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]" : "text-gray-800"}`}>
                        {selectedLocationSummary}
                      </p>
                    </div>
                  </button>
                  
                  {showLocationDropdown && (
                    <div ref={locationDesktopPopupRef} className="absolute top-full left-0 mt-2 z-[150] max-h-[75vh] overflow-auto bg-white rounded-2xl shadow-xl border border-gray-100 hidden md:block md:w-[760px]">
                      <div className="p-4 space-y-4">
                        {draftSelectedLocations.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {draftSelectedLocations.map((item) => (
                              <span key={`draft-location-${item}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                                {item}
                                <button type="button" onClick={() => toggleDraftLocationSelection(item)} className="text-emerald-700">
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Pays</p>
                            <div className="max-h-56 space-y-2 overflow-auto pr-1">
                              {(openLocationLevel === "pays"
                                ? [{ label: "Tous pays", value: "" }, ...cascadePaysOptions.map((item) => ({ label: item, value: item }))]
                                : [([{ label: "Tous pays", value: "" }, ...cascadePaysOptions.map((item) => ({ label: item, value: item }))].find((item) => item.value === locationPays) || { label: "Tous pays", value: "" })]
                              ).map((item) => {
                                const selected = hasLocationTokenSelected(draftSelectedLocations, item.value);
                                return (
                                  <button
                                    key={`home-pays-card-${item.label}`}
                                    type="button"
                                    onClick={() => {
                                      if (openLocationLevel !== "pays") {
                                        setOpenLocationLevel("pays");
                                        return;
                                      }
                                      setLocationPays(item.value);
                                      setLocationGouvernerat("");
                                      setLocationRegion("");
                                      setLocationZone("");
                                      setOpenLocationLevel("gouvernerat");
                                    }}
                                    className={`relative h-20 w-full overflow-hidden rounded-xl border text-left ${selected ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                                  >
                                    <img src={getLocationOptionImage("pays", item.value || cascadePaysOptions[0] || "")} alt={item.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                                    <span className="relative z-10 px-3 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{item.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Gouvernorat</p>
                            <div className="max-h-56 space-y-2 overflow-auto pr-1">
                              {(openLocationLevel === "gouvernerat"
                                ? [{ label: "Tous gouvernorats", value: "" }, ...cascadeGouverneratOptions.map((item) => ({ label: item, value: item }))]
                                : [([{ label: "Tous gouvernorats", value: "" }, ...cascadeGouverneratOptions.map((item) => ({ label: item, value: item }))].find((item) => item.value === locationGouvernerat) || { label: "Tous gouvernorats", value: "" })]
                              ).map((item) => {
                                const selected = hasLocationTokenSelected(draftSelectedLocations, item.value);
                                return (
                                  <button
                                    key={`home-gouv-card-${item.label}`}
                                    type="button"
                                    onClick={() => {
                                      if (openLocationLevel !== "gouvernerat") {
                                        setOpenLocationLevel("gouvernerat");
                                        return;
                                      }
                                      setLocationGouvernerat(item.value);
                                      setLocationRegion("");
                                      setLocationZone("");
                                      setOpenLocationLevel("region");
                                    }}
                                    className={`relative h-20 w-full overflow-hidden rounded-xl border text-left ${selected ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                                  >
                                    <img src={getLocationOptionImage("gouvernerat", item.value || cascadeGouverneratOptions[0] || "")} alt={item.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                                    <span className="relative z-10 px-3 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{item.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Region</p>
                            <div className="max-h-56 space-y-2 overflow-auto pr-1">
                              {(openLocationLevel === "region"
                                ? [{ label: "Toutes regions", value: "" }, ...cascadeRegionOptions.map((item) => ({ label: item, value: item }))]
                                : [([{ label: "Toutes regions", value: "" }, ...cascadeRegionOptions.map((item) => ({ label: item, value: item }))].find((item) => item.value === locationRegion) || { label: "Toutes regions", value: "" })]
                              ).map((item) => {
                                const selected = hasLocationTokenSelected(draftSelectedLocations, item.value);
                                return (
                                  <button
                                    key={`home-region-card-${item.label}`}
                                    type="button"
                                    onClick={() => {
                                      if (openLocationLevel !== "region") {
                                        setOpenLocationLevel("region");
                                        return;
                                      }
                                      setLocationRegion(item.value);
                                      setLocationZone("");
                                      setOpenLocationLevel("zone");
                                    }}
                                    className={`relative h-20 w-full overflow-hidden rounded-xl border text-left ${selected ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                                  >
                                    <img src={getLocationOptionImage("region", item.value || cascadeRegionOptions[0] || "")} alt={item.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                                    <span className="relative z-10 px-3 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{item.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Zone</p>
                            <div className="max-h-56 space-y-2 overflow-auto pr-1">
                              {(openLocationLevel === "zone"
                                ? [{ label: "Toutes zones", value: "" }, ...cascadeZoneOptions.map((item) => ({ label: item, value: item }))]
                                : [([{ label: "Toutes zones", value: "" }, ...cascadeZoneOptions.map((item) => ({ label: item, value: item }))].find((item) => item.value === locationZone) || { label: "Toutes zones", value: "" })]
                              ).map((item) => {
                                const selected = hasLocationTokenSelected(draftSelectedLocations, item.value);
                                return (
                                  <button
                                    key={`home-zone-card-${item.label}`}
                                    type="button"
                                    onClick={() => {
                                      if (openLocationLevel !== "zone") {
                                        setOpenLocationLevel("zone");
                                        return;
                                      }
                                      setLocationZone(item.value);
                                      if (item.value) {
                                        const hierarchicalValue = buildHierarchicalLocationLabel([
                                          locationPays && String(locationPays).trim().toLowerCase() !== "tunisie" ? locationPays : "",
                                          locationGouvernerat,
                                          locationRegion,
                                          item.value,
                                        ]) || item.value;
                                        setDraftSelectedLocations((prev) =>
                                          dedupeHierarchicalLocations(prev.includes(hierarchicalValue) ? prev : [...prev, hierarchicalValue])
                                        );
                                      }
                                    }}
                                    className={`relative h-20 w-full overflow-hidden rounded-xl border text-left ${selected ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                                  >
                                    <img src={getLocationOptionImage("zone", item.value || cascadeZoneOptions[0] || "")} alt={item.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                                    <span className="relative z-10 px-3 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{item.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <button
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${draftSelectedLocations.length === 0 ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700 border border-gray-200'}`}
                            onClick={() => { setDraftSelectedLocations([]); resetCurrentLocationPath(); }}
                          >
                            Tous les emplacements
                          </button>
                          <button
                            type="button"
                            onClick={addCurrentLocationToDraft}
                            disabled={!currentDraftLocationValue}
                            className="w-full rounded-xl border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Ajouter un autre emplacement
                          </button>
                          <button
                            type="button"
                            onClick={confirmLocationSelection}
                            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                          >
                            Confirmer la selection
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Date Range Picker */}
                <div className={`relative pointer-events-auto md:col-span-3 ${showCalendar ? 'z-[120]' : 'z-10'}`}>
                  <button 
                    type="button"
                    className={`w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border cursor-pointer transition-colors h-full text-left pointer-events-auto ${showCalendar ? "border-emerald-500 ring-2 ring-emerald-100 bg-white" : "border-gray-200 hover:border-emerald-400"}`}
                    onClick={() => {
                      if (Date.now() < suppressFilterOpenUntilRef.current) return;
                      if (anyFilterOpen && !showCalendar) {
                        closeAllFiltersAndSuppress();
                        setOpenLocationLevel(null);
                        return;
                      }
                      if (showCalendar) setShowCalendar(false);
                      else openCalendarSelector();
                      setShowLocationDropdown(false);
                      setShowCategoryDropdown(false);
                    }}
                  >
                    <Calendar className="text-emerald-600 shrink-0" size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 font-medium">Dates de séjour</p>
                      <p className="text-sm text-gray-800 font-semibold truncate">
                        {dateRangeText()}
                      </p>
                    </div>
                  </button>

                  {showCalendar && (
                    <div className="absolute top-full left-0 right-0 mt-2 z-[150] max-h-[75vh] overflow-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 md:w-[400px] md:left-auto md:right-0 hidden md:block">
                        {draftSelectedStayRanges.length > 0 && (
                          <div className="mb-4 flex flex-wrap gap-2">
                            {draftSelectedStayRanges.map((range) => (
                              <span key={`draft-stay-${range.start}-${range.end}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                                {format(parseISO(range.start), "d MMM", { locale: fr })} - {format(parseISO(range.end), "d MMM", { locale: fr })}
                                <button type="button" onClick={() => setDraftSelectedStayRanges((prev) => prev.filter((item) => item.start !== range.start || item.end !== range.end))}>
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between mb-4">
                          <button 
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                            className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <h3 className="font-bold text-gray-900 capitalize">
                            {format(currentMonth, "MMMM yyyy", { locale: fr })}
                          </h3>
                          <button 
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                            className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-2">
                          {weekDays.map((day) => (
                            <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
                              {day}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {days.map((day, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleDateClick(day)}
                              className={getDayClassName(day)}
                            >
                              {format(day, "d")}
                            </button>
                          ))}
                        </div>

                      <div className="mt-4 space-y-3 pt-4 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={addDraftStayRange}
                          disabled={!checkIn || !checkOut}
                          className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Ajouter cette periode
                        </button>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-emerald-600"></div>
                            <span className="text-gray-600">Sélectionné</span>
                          </div>
                        </div>
                        <button 
                          onClick={confirmCalendarSelection}
                          className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          Valider
                        </button>
                      </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Property Type Dropdown */}
                <div className={`relative pointer-events-auto md:col-span-3 ${showCategoryDropdown ? 'z-[120]' : 'z-10'}`}>
                  <button 
                    type="button"
                    className={`relative w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border cursor-pointer transition-colors h-full text-left pointer-events-auto overflow-hidden ${showCategoryDropdown ? "border-emerald-500 ring-2 ring-emerald-100 bg-white" : "border-gray-200 hover:border-emerald-400"}`}
                    onClick={() => {
                      if (Date.now() < suppressFilterOpenUntilRef.current) return;
                      if (anyFilterOpen && !showCategoryDropdown) {
                        closeAllFiltersAndSuppress();
                        setOpenLocationLevel(null);
                        return;
                      }
                      if (showCategoryDropdown) setShowCategoryDropdown(false);
                      else openCategoryDropdown();
                      setShowLocationDropdown(false);
                      setShowCalendar(false);
                    }}
                  >
                    {selectedTypeImage && (
                      <img
                        src={resolveTypeImageUrl(selectedTypeImage)}
                        alt={selectedCategories[0] || "Type de bien"}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    {selectedTypeImage && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                    <Home className="text-emerald-600 shrink-0" size={20} />
                    <div className={`relative z-10 flex-1 min-w-0 ${selectedTypeImage ? 'text-white' : ''}`}>
                      <p className={`text-xs font-medium ${selectedTypeImage ? 'text-white/85' : 'text-gray-500'}`}>Type de bien</p>
                      <p className={`text-sm font-semibold truncate ${selectedTypeImage ? 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]' : 'text-gray-800'}`}>
                        {selectedTypeSummaryText}
                      </p>
                    </div>
                  </button>

                  {showCategoryDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 z-[150] max-h-[70vh] overflow-auto bg-white rounded-2xl shadow-xl border border-gray-100 hidden md:block">
                      <div className="p-2">
                        <button
                          className={`w-full text-left px-4 py-5 rounded-xl text-sm transition-colors ${draftCategories.length === 0 && draftSelectedMainTypes.length === 0 ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                          onClick={() => { setDraftMainType(""); setDraftSelectedMainTypes([]); setDraftCategories([]); setTypeSelectionStep("main"); }}
                        >
                          Tous les types
                        </button>
                        {draftSelectedMainTypes.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2 px-2">
                            {draftSelectedMainTypes.map((item) => (
                              <span key={`draft-main-${item}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                                {MAIN_TYPE_LABELS[item]}
                                <button type="button" onClick={() => toggleDraftMainTypeSelection(item)}>
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="relative mt-3 overflow-hidden min-h-[230px]">
                          <div className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{typeSelectionStep === "main" ? "Type principal" : "Sous-type"}</div>
                          <div className={`mt-3 transition-all duration-300 ${typeSelectionStep === "main" ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0 pointer-events-none absolute inset-0"}`}>
                            <div className="grid grid-cols-1 gap-3">
                            {groupedTypeOptions.map((group) => (
                              <button
                                key={`home-main-${group.mainType}`}
                                type="button"
                                onClick={() => toggleDraftMainTypeSelection(group.mainType)}
                                className={`relative h-36 overflow-hidden rounded-xl border text-left ${draftSelectedMainTypes.includes(group.mainType) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                              >
                                <img src={resolveTypeImageUrl(group.imageUrl)} alt={group.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                                <div className="pointer-events-none absolute inset-0 bg-black/40" />
                                    <span className="relative z-10 px-4 text-lg font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{group.label}</span>
                              </button>
                            ))}
                            </div>
                          </div>
                          <div className={`mt-3 transition-all duration-300 ${typeSelectionStep === "sub" ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0 pointer-events-none absolute inset-0"}`}>
                            <button
                              type="button"
                              onClick={() => setTypeSelectionStep("main")}
                              className="mb-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                            >
                              <ChevronLeft size={14} /> Retour types principaux
                            </button>
                            <div className="grid grid-cols-2 gap-3">
                            {draftSecondaryTypeOptions.map((cat) => (
                              <button
                                key={`home-sub-${cat.label}`}
                                type="button"
                                onClick={() => toggleDraftCategory(cat.label)}
                                className={`relative h-28 overflow-hidden rounded-xl border text-left ${draftCategories.includes(cat.label) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                              >
                                <img src={resolveTypeImageUrl(cat.imageUrl)} alt={cat.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                                <div className="pointer-events-none absolute inset-0 bg-black/40" />
                                    <span className="relative z-10 px-3 text-base font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{cat.label}</span>
                                {draftCategories.includes(cat.label) && (
                                  <span className="absolute right-2 top-2 z-10 rounded-full bg-emerald-600 p-1 text-white">
                                    <Check size={12} />
                                  </span>
                                )}
                              </button>
                            ))}
                            </div>
                          </div>
                        </div>
                        {groupedTypeOptions.length === 0 && (
                          <div className="px-4 py-3 text-sm text-gray-500">Aucun type disponible pour ce mode.</div>
                        )}
                        <button
                          type="button"
                          onClick={confirmTypeSelection}
                          className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                        >
                          Confirmer le type de bien
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`relative pointer-events-auto md:col-span-3 ${showComfortDropdown ? 'z-[120]' : 'z-10'}`}>
                  <button
                    type="button"
                    className={`relative w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border cursor-pointer transition-colors h-full text-left pointer-events-auto overflow-hidden ${showComfortDropdown ? "border-emerald-500 ring-2 ring-emerald-100 bg-white" : "border-gray-200 hover:border-emerald-400"}`}
                    onClick={() => {
                      if (Date.now() < suppressFilterOpenUntilRef.current) return;
                      if (anyFilterOpen && !showComfortDropdown) {
                        closeAllFiltersAndSuppress();
                        setOpenLocationLevel(null);
                        return;
                      }
                      if (showComfortDropdown) setShowComfortDropdown(false);
                      else openComfortSelector();
                      setShowLocationDropdown(false);
                      setShowCalendar(false);
                      setShowCategoryDropdown(false);
                      setShowSeasideDropdown(false);
                    }}
                  >
                    {selectedComfortImage && (
                      <img src={resolveTypeImageUrl(selectedComfortImage)} alt="Confort" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                    )}
                    {selectedComfortImage && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                    <Wind className="text-emerald-600 shrink-0" size={20} />
                    <div className={`relative z-10 flex-1 min-w-0 ${selectedComfortImage ? "text-white" : ""}`}>
                      <p className={`text-xs font-medium ${selectedComfortImage ? "text-white/85" : "text-gray-500"}`}>Confort</p>
                      <p className={`text-sm font-semibold truncate ${selectedComfortImage ? "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]" : "text-gray-800"}`}>{selectedComfortSummary}</p>
                    </div>
                  </button>
                  {showComfortDropdown && (
                    <div ref={comfortDesktopPopupRef} className="absolute top-full left-0 right-0 mt-2 z-[150] max-h-[70vh] overflow-auto bg-white rounded-2xl shadow-xl border border-gray-100 hidden md:block p-2 space-y-2">
                      <div className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Bord de mer</div>
                      {availableSeasideOptions.map((key) => {
                        const image = getHomeFilterOptionImage("seaside", key);
                        const selected = draftSeasideOptions.includes(key);
                        return (
                          <button
                            key={`comfort-seaside-desktop-${key}`}
                            type="button"
                            onClick={() => toggleDraftSeasideOption(key)}
                            className={`relative w-full h-24 rounded-xl overflow-hidden text-left px-4 flex items-center justify-between ${selected ? "ring-2 ring-emerald-400" : "hover:bg-gray-50"}`}
                          >
                            <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={SEASIDE_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                            <div className="pointer-events-none absolute inset-0 bg-black/40" />
                            <span className="relative z-10 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{SEASIDE_OPTION_LABELS[key]}</span>
                            {selected && <Check size={14} className="relative z-10 text-white" />}
                          </button>
                        );
                      })}
                      <div className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Confort</div>
                      {availableComfortOptions.map((key) => {
                        const image = getHomeFilterOptionImage("comfort", key);
                        const selected = draftComfortOptions.includes(key);
                        return (
                          <button
                            key={`comfort-desktop-${key}`}
                            type="button"
                            onClick={() => toggleDraftComfortOption(key)}
                            className={`relative w-full h-24 rounded-xl overflow-hidden text-left px-4 flex items-center justify-between ${selected ? "ring-2 ring-emerald-400" : "hover:bg-gray-50"}`}
                          >
                            <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={COMFORT_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                            <div className="pointer-events-none absolute inset-0 bg-black/40" />
                            <span className="relative z-10 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{COMFORT_OPTION_LABELS[key]}</span>
                            {selected && <Check size={14} className="relative z-10 text-white" />}
                          </button>
                        );
                      })}
                      <button type="button" onClick={confirmComfortSelection} className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
                        Confirmer confort
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-stretch gap-2 md:col-span-12">
                  <button
                    onClick={handleSearch}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 duration-200 flex items-center justify-center gap-2"
                  >
                    <Search size={20} />
                    <span>Rechercher</span>
                  </button>
                  {!isHotelMode && (
                    <button
                      type="button"
                      onClick={handleOpenAdvancedFilters}
                      aria-label="Ouvrir filtres avances"
                      title="Filtres avances"
                      className="shrink-0 rounded-2xl border border-emerald-200 bg-white px-4 text-emerald-700 transition-colors hover:bg-emerald-50"
                    >
                      <SlidersHorizontal size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Selected Filters Display - moved under controls */}
              {(selectedLocations.length > 0 || selectedMainTypes.length > 0 || selectedCategories.length > 0 || selectedSeasideOptions.length > 0 || selectedComfortOptions.length > 0 || selectedStayRanges.length > 0) && (
                <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 border border-emerald-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 uppercase">Filtres actifs:</span>
                    {selectedLocations.map((item) => (
                      <span key={`chip-location-${item}`} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <MapPin size={12} />
                        {item}
                        <button onClick={() => setSelectedLocations((prev) => prev.filter((value) => value !== item))} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {selectedTypeChipGroups.map(({ mainType, categories }) => (
                      <span key={`chip-main-type-${mainType}`} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Home size={12} />
                        {categories.length > 0 ? `${MAIN_TYPE_LABELS[mainType]} : ${categories.join(", ")}` : MAIN_TYPE_LABELS[mainType]}
                        <button onClick={() => {
                          setSelectedMainTypes((prev) => prev.filter((value) => value !== mainType));
                          if (selectedMainType === mainType) {
                            setSelectedMainType("");
                          }
                          setSelectedCategories((prev) => removeCategoriesForMainType(prev, mainType));
                        }} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {selectedCategories
                      .filter((cat) => !selectedMainTypes.includes(getMainTypeFromCategory(cat)))
                      .map(cat => (
                      <span key={cat} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Home size={12} />
                        {cat}
                        <button onClick={() => setSelectedCategories((prev) => prev.filter((item) => item !== cat))} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {selectedSeasideOptions.map((key) => (
                      <span key={`chip-seaside-${key}`} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Wind size={12} />
                        {SEASIDE_OPTION_LABELS[key]}
                        <button onClick={() => setSelectedSeasideOptions((prev) => prev.filter((item) => item !== key))} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {selectedComfortOptions.map((key) => (
                      <span key={`chip-comfort-${key}`} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Wind size={12} />
                        {COMFORT_OPTION_LABELS[key]}
                        <button onClick={() => setSelectedComfortOptions((prev) => prev.filter((item) => item !== key))} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {selectedStayRanges.map((range) => (
                      <span key={`chip-stay-${range.start}-${range.end}`} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Calendar size={12} />
                        {format(parseISO(range.start), "d MMM", { locale: fr })} - {format(parseISO(range.end), "d MMM", { locale: fr })}
                        <button onClick={() => {
                          setSelectedStayRanges((prev) => prev.filter((item) => item.start !== range.start || item.end !== range.end));
                        }} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              </>
              )}
            </div>
          </div>
        </div>

        {showLocationDropdown && (
          <div className="fixed inset-0 z-[220] md:hidden">
            <button type="button" className="absolute inset-0 bg-black/35" onClick={closeAllFiltersAndSuppress} />
            <div ref={locationMobilePopupRef} className="absolute left-3 right-3 bottom-3 max-h-[72vh] overflow-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-3 space-y-3">
              {draftSelectedLocations.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {draftSelectedLocations.map((item) => (
                    <span key={`mobile-draft-location-${item}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                      {item}
                      <button type="button" onClick={() => toggleDraftLocationSelection(item)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Pays</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(openLocationLevel === "pays"
                      ? [{ label: "Tous pays", value: "" }, ...cascadePaysOptions.map((item) => ({ label: item, value: item }))]
                      : [([{ label: "Tous pays", value: "" }, ...cascadePaysOptions.map((item) => ({ label: item, value: item }))].find((item) => item.value === locationPays) || { label: "Tous pays", value: "" })]
                    ).map((item) => (
                      <button key={`mobile-pays-card-${item.label}`} type="button" onClick={() => { if (openLocationLevel !== "pays") { setOpenLocationLevel("pays"); return; } setLocationPays(item.value); setLocationGouvernerat(""); setLocationRegion(""); setLocationZone(""); setOpenLocationLevel("gouvernerat"); }} className={`relative h-24 min-w-[140px] overflow-hidden rounded-xl border ${hasLocationTokenSelected(draftSelectedLocations, item.value) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}>
                        <img src={getLocationOptionImage("pays", item.value || cascadePaysOptions[0] || "")} alt={item.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-black/40" />
                        <span className="relative z-10 px-3 text-sm font-semibold text-white">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Gouvernorat</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(openLocationLevel === "gouvernerat"
                      ? [{ label: "Tous gouvernorats", value: "" }, ...cascadeGouverneratOptions.map((item) => ({ label: item, value: item }))]
                      : [([{ label: "Tous gouvernorats", value: "" }, ...cascadeGouverneratOptions.map((item) => ({ label: item, value: item }))].find((item) => item.value === locationGouvernerat) || { label: "Tous gouvernorats", value: "" })]
                    ).map((item) => (
                      <button key={`mobile-gouv-card-${item.label}`} type="button" onClick={() => { if (openLocationLevel !== "gouvernerat") { setOpenLocationLevel("gouvernerat"); return; } setLocationGouvernerat(item.value); setLocationRegion(""); setLocationZone(""); setOpenLocationLevel("region"); }} className={`relative h-24 min-w-[150px] overflow-hidden rounded-xl border ${hasLocationTokenSelected(draftSelectedLocations, item.value) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}>
                        <img src={getLocationOptionImage("gouvernerat", item.value || cascadeGouverneratOptions[0] || "")} alt={item.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-black/40" />
                        <span className="relative z-10 px-3 text-sm font-semibold text-white">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Region</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(openLocationLevel === "region"
                      ? [{ label: "Toutes regions", value: "" }, ...cascadeRegionOptions.map((item) => ({ label: item, value: item }))]
                      : [([{ label: "Toutes regions", value: "" }, ...cascadeRegionOptions.map((item) => ({ label: item, value: item }))].find((item) => item.value === locationRegion) || { label: "Toutes regions", value: "" })]
                    ).map((item) => (
                      <button key={`mobile-region-card-${item.label}`} type="button" onClick={() => { if (openLocationLevel !== "region") { setOpenLocationLevel("region"); return; } setLocationRegion(item.value); setLocationZone(""); setOpenLocationLevel("zone"); }} className={`relative h-24 min-w-[150px] overflow-hidden rounded-xl border ${hasLocationTokenSelected(draftSelectedLocations, item.value) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}>
                        <img src={getLocationOptionImage("region", item.value || cascadeRegionOptions[0] || "")} alt={item.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-black/40" />
                        <span className="relative z-10 px-3 text-sm font-semibold text-white">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Zone</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(openLocationLevel === "zone"
                      ? [{ label: "Toutes zones", value: "" }, ...cascadeZoneOptions.map((item) => ({ label: item, value: item }))]
                      : [([{ label: "Toutes zones", value: "" }, ...cascadeZoneOptions.map((item) => ({ label: item, value: item }))].find((item) => item.value === locationZone) || { label: "Toutes zones", value: "" })]
                    ).map((item) => (
                      <button key={`mobile-zone-card-${item.label}`} type="button" onClick={() => { if (openLocationLevel !== "zone") { setOpenLocationLevel("zone"); return; } setLocationZone(item.value); if (item.value) { const hierarchicalValue = buildHierarchicalLocationLabel([locationPays && String(locationPays).trim().toLowerCase() !== "tunisie" ? locationPays : "", locationGouvernerat, locationRegion, item.value]) || item.value; setDraftSelectedLocations((prev) => dedupeHierarchicalLocations(prev.includes(hierarchicalValue) ? prev : [...prev, hierarchicalValue])); } }} className={`relative h-24 min-w-[150px] overflow-hidden rounded-xl border ${hasLocationTokenSelected(draftSelectedLocations, item.value) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}>
                        <img src={getLocationOptionImage("zone", item.value || cascadeZoneOptions[0] || "")} alt={item.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-black/40" />
                        <span className="relative z-10 px-3 text-sm font-semibold text-white">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${draftSelectedLocations.length === 0 ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                  onClick={() => { setDraftSelectedLocations([]); resetCurrentLocationPath(); }}
                >
                  Tous les emplacements
                </button>
                <button
                  type="button"
                  onClick={addCurrentLocationToDraft}
                  disabled={!currentDraftLocationValue}
                  className="w-full rounded-xl border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Ajouter un autre emplacement
                </button>
              </div>
              <button
                type="button"
                onClick={confirmLocationSelection}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Confirmer la selection
              </button>
            </div>
          </div>
        )}

        {showCalendar && (
          <div className="fixed inset-0 z-[220] md:hidden">
            <button type="button" className="absolute inset-0 bg-black/35" onClick={closeAllFiltersAndSuppress} />
            <div ref={calendarMobilePopupRef} className="absolute left-3 right-3 bottom-3 max-h-[72vh] overflow-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-4">
              {draftSelectedStayRanges.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {draftSelectedStayRanges.map((range) => (
                    <span key={`mobile-draft-stay-${range.start}-${range.end}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                      {format(parseISO(range.start), "d MMM", { locale: fr })} - {format(parseISO(range.end), "d MMM", { locale: fr })}
                      <button type="button" onClick={() => setDraftSelectedStayRanges((prev) => prev.filter((item) => item.start !== range.start || item.end !== range.end))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <h3 className="font-bold text-gray-900 capitalize">{format(currentMonth, "MMMM yyyy", { locale: fr })}</h3>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map((day) => (
                  <div key={`mobile-day-${day}`} className="text-center text-xs font-semibold text-gray-500 py-2">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, idx) => (
                  <button key={`mobile-calendar-${idx}`} onClick={() => handleDateClick(day)} className={getDayClassName(day)}>
                    {format(day, "d")}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={addDraftStayRange} disabled={!checkIn || !checkOut} className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
                  Ajouter cette periode
                </button>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-emerald-600" />
                  <span className="text-gray-600">Selectionne</span>
                </div>
                <button onClick={confirmCalendarSelection} className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                  Valider
                </button>
              </div>
              </div>
            </div>
          </div>
        )}

        {showCategoryDropdown && (
          <div className="fixed inset-0 z-[220] md:hidden">
            <button type="button" className="absolute inset-0 bg-black/35" onClick={closeAllFiltersAndSuppress} />
            <div ref={categoryMobilePopupRef} className="absolute left-3 right-3 bottom-3 max-h-[62vh] overflow-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-2">
              <button
                className={`w-full text-left px-4 py-5 rounded-xl text-sm transition-colors ${draftCategories.length === 0 && draftSelectedMainTypes.length === 0 ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                onClick={() => { setDraftMainType(""); setDraftSelectedMainTypes([]); setDraftCategories([]); setTypeSelectionStep("main"); }}
              >
                Tous les types
              </button>
              {draftSelectedMainTypes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 px-2">
                  {draftSelectedMainTypes.map((item) => (
                    <span key={`mobile-draft-main-${item}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                      {MAIN_TYPE_LABELS[item]}
                      <button type="button" onClick={() => toggleDraftMainTypeSelection(item)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative mt-3 overflow-hidden min-h-[230px]">
                <p className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{typeSelectionStep === "main" ? "Type principal" : "Sous-type"}</p>
                <div className={`mt-3 transition-all duration-300 ${typeSelectionStep === "main" ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0 pointer-events-none absolute inset-0"}`}>
                  <div className="grid grid-cols-1 gap-3">
                  {groupedTypeOptions.map((group) => (
                    <button
                      key={`mobile-main-${group.mainType}`}
                      type="button"
                      onClick={() => toggleDraftMainTypeSelection(group.mainType)}
                      className={`relative h-36 overflow-hidden rounded-xl border text-left ${draftSelectedMainTypes.includes(group.mainType) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                    >
                      <img src={resolveTypeImageUrl(group.imageUrl)} alt={group.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                      <div className="pointer-events-none absolute inset-0 bg-black/40" />
                      <span className="relative z-10 px-4 text-lg font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{group.label}</span>
                    </button>
                  ))}
                  </div>
                </div>
                <div className={`mt-3 transition-all duration-300 ${typeSelectionStep === "sub" ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0 pointer-events-none absolute inset-0"}`}>
                  <button
                    type="button"
                    onClick={() => setTypeSelectionStep("main")}
                    className="mb-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    <ChevronLeft size={14} /> Retour types principaux
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                  {draftSecondaryTypeOptions.map((cat) => (
                    <button
                      key={`mobile-sub-${cat.label}`}
                      type="button"
                      onClick={() => toggleDraftCategory(cat.label)}
                      className={`relative h-28 overflow-hidden rounded-xl border text-left ${draftCategories.includes(cat.label) ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                    >
                      <img src={resolveTypeImageUrl(cat.imageUrl)} alt={cat.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                      <div className="pointer-events-none absolute inset-0 bg-black/40" />
                      <span className="relative z-10 px-3 text-base font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{cat.label}</span>
                      {draftCategories.includes(cat.label) && (
                        <span className="absolute right-2 top-2 z-10 rounded-full bg-emerald-600 p-1 text-white">
                          <Check size={12} />
                        </span>
                      )}
                    </button>
                  ))}
                  </div>
                </div>
              </div>
              {groupedTypeOptions.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-500">Aucun type disponible pour ce mode.</div>
              )}
              <button
                type="button"
                onClick={confirmTypeSelection}
                className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Confirmer le type de bien
              </button>
            </div>
          </div>
        )}
        {showComfortDropdown && (
          <div className="fixed inset-0 z-[220] md:hidden">
            <button type="button" className="absolute inset-0 bg-black/35" onClick={closeAllFiltersAndSuppress} />
            <div ref={comfortMobilePopupRef} className="absolute left-3 right-3 bottom-3 max-h-[62vh] overflow-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-2 space-y-2">
              <div className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Bord de mer</div>
              {availableSeasideOptions.map((key) => {
                const image = getHomeFilterOptionImage("seaside", key);
                const selected = draftSeasideOptions.includes(key);
                return (
                  <button
                    key={`comfort-seaside-mobile-${key}`}
                    type="button"
                    onClick={() => toggleDraftSeasideOption(key)}
                    className={`relative w-full h-24 rounded-xl overflow-hidden text-left px-4 flex items-center justify-between ${selected ? "ring-2 ring-emerald-400" : ""}`}
                  >
                    <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={SEASIDE_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                    <span className="relative z-10 text-sm font-semibold text-white">{SEASIDE_OPTION_LABELS[key]}</span>
                    {selected && <Check size={14} className="relative z-10 text-white" />}
                  </button>
                );
              })}
              <div className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Confort</div>
              {availableComfortOptions.map((key) => {
                const image = getHomeFilterOptionImage("comfort", key);
                const selected = draftComfortOptions.includes(key);
                return (
                  <button
                    key={`comfort-mobile-${key}`}
                    type="button"
                    onClick={() => toggleDraftComfortOption(key)}
                    className={`relative w-full h-24 rounded-xl overflow-hidden text-left px-4 flex items-center justify-between ${selected ? "ring-2 ring-emerald-400" : ""}`}
                  >
                    <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={COMFORT_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                    <span className="relative z-10 text-sm font-semibold text-white">{COMFORT_OPTION_LABELS[key]}</span>
                    {selected && <Check size={14} className="relative z-10 text-white" />}
                  </button>
                );
              })}
              <button type="button" onClick={confirmComfortSelection} className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
                Confirmer confort
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Search Results / Featured Properties */}
      <section ref={resultsRef} className="py-20 bg-gray-50 scroll-mt-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Star className="text-amber-500 fill-amber-500" size={28} />
                {hasSearched ? "Résultats de la recherche" : "Catalogue des biens"}
              </h2>
              <p className="text-gray-600 max-w-xl">
                {isHotelMode
                  ? "Consultez une sélection d'hôtels avec leurs disponibilités, leurs informations pratiques et leurs tarifs."
                  : hasSearched
                    ? `${filteredProperties.length} bien${filteredProperties.length !== 1 ? 's' : ''} trouvé${filteredProperties.length !== 1 ? 's' : ''} selon vos critères`
                    : `Affichage du mode ${orderedModeTabs.find((tab) => tab.value === selectedMode)?.label.toLowerCase()}. Les biens en vedette apparaissent en premier.`}
              </p>
            </div>
            {!isSelectedModeComingSoon && !isHotelMode && (
              <Link
                to={(() => {
                  if (selectedMode === "vente") return "/ventes";
                  const params = applyAmicaleParam(new URLSearchParams(searchParams));
                  params.set("mode", selectedMode);
                  return `/logements?${params.toString()}`;
                })()}
                className="hidden md:flex items-center gap-2 text-emerald-700 font-bold hover:text-emerald-800 transition-colors group"
              >
                Voir tout le catalogue <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
            {!isSelectedModeComingSoon && isHotelMode && (
              <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
                Hôtels disponibles
              </div>
            )}
          </div>
          {!isSelectedModeComingSoon && isHotelMode && hasSearched && (
            <div className="mb-8 rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#f0f9ff,#eef2ff)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Résultats de la recherche</p>
              <p className="mt-2 text-sm font-medium text-slate-700">
                {hasCompleteHotelCriteria ? (
                  <>
                    Dates de séjour <span className="font-semibold text-slate-900">{hotelSearchPeriodLabel}</span> •{" "}
                    Voyageurs <span className="font-semibold text-slate-900">{hotelTravellersLabel}</span>
                  </>
                ) : (
                  <>
                    Destination <span className="font-semibold text-slate-900">{selectedHotelCity?.Name || "non définie"}</span>
                  </>
                )}
              </p>
              {selectedHotelLabel && (
                <p className="mt-2 text-sm text-slate-700">
                  Hotel selectionne: <span className="font-semibold text-slate-900">{selectedHotelLabel}</span>
                </p>
              )}
              {hotelSearchInfoMessage && (
                <p className="mt-2 text-sm text-slate-600">
                  {hotelSearchInfoMessage}
                </p>
              )}
            </div>
          )}

          {isSelectedModeComingSoon && (
            <ComingSoonState
              title={selectedMode === "vente" ? "Mode Vente" : "Mode Location annuelle"}
              description="Ce mode est en stabilisation cote client. Il sera ouvert au public tres bientot."
              backTo="/"
              backLabel="Retour a l'accueil"
            />
          )}

          {!isSelectedModeComingSoon && isHotelMode && (
            <div className="rounded-[30px] border border-sky-100 bg-white px-4 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] md:px-6 md:py-7">
              {!hasSearched && (
                <div className="rounded-[28px] border border-slate-100 bg-[linear-gradient(135deg,#f8fafc,#eff6ff)] p-6">
                  <h3 className="text-2xl font-semibold text-slate-900">Sélection d'hôtels</h3>
                </div>
              )}

              {loadingHotelResults && (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={`hotel-skeleton-${index}`} className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
                      <div className="aspect-[16/10] animate-pulse bg-slate-200" />
                      <div className="space-y-3 p-5">
                        <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                        <div className="h-7 w-3/4 animate-pulse rounded bg-slate-200" />
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loadingHotelResults && hasSearched && sortedHotelResults.length === 0 && (
                <div className="rounded-[32px] border border-dashed border-slate-200 bg-white/90 px-6 py-14 text-center shadow-sm">
                  <p className="text-lg font-semibold text-slate-900">Aucun hôtel disponible pour cette recherche.</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Essayez une autre destination ou modifiez vos dates pour découvrir davantage d'offres.
                  </p>
                  {selectedHotelLabel && (
                    <p className="mt-3 text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">{selectedHotelUnavailableMessage}</span>
                    </p>
                  )}
                  {hotelSearchInfoMessage && !hotelSearchFallbackNotice && (
                    <p className="mt-3 text-sm text-slate-600">
                      {hotelSearchInfoMessage}
                    </p>
                  )}
                </div>
              )}

              {!loadingHotelResults && hotelSearchFallbackNotice && sortedHotelResults.length > 0 && (
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {hotelSearchFallbackNotice}
                </div>
              )}

              {!loadingHotelResults && sortedHotelResults.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {sortedHotelResults.map((hotel) => {
                    const hotelId = Number(hotel.Id || 0);
                    const minPrice = extractHotelMinPrice(hotel);
                    const roomOffers = flattenHotelRoomOffers(hotel);
                    const leadOffer = roomOffers.find((offer) => pickHotelDisplayedPrice(offer.room) !== null) || roomOffers[0] || null;
                    const leadOfferPrice = leadOffer ? pickHotelDisplayedPrice(leadOffer.room) : null;
                    const hasPromotion = hasHotelPromotion(hotel);
                    const hasRefundableOffer = roomOffers.some((offer) => !offer.room?.NotRefundable);
                    const boardingMap = new Map<string, { key: string; boardingId: number | null; boardingName: string; price: number | null }>();
                    roomOffers.forEach((offer) => {
                      const offerPrice = pickHotelDisplayedPrice(offer.room);
                      const fallbackBoardingName = String(offer.boardingName || "").trim() || "Offre hotel";
                      const key = offer.boardingId ? `id:${offer.boardingId}` : `name:${fallbackBoardingName.toLowerCase()}`;
                      const current = boardingMap.get(key);
                      if (!current) {
                        boardingMap.set(key, {
                          key,
                          boardingId: offer.boardingId || null,
                          boardingName: fallbackBoardingName,
                          price: offerPrice,
                        });
                        return;
                      }
                      if (offerPrice !== null && (current.price === null || offerPrice < current.price)) {
                        current.price = offerPrice;
                      }
                    });
                    const boardingOptions = Array.from(boardingMap.values()).sort((a, b) => {
                      const aPrice = a.price ?? Number.POSITIVE_INFINITY;
                      const bPrice = b.price ?? Number.POSITIVE_INFINITY;
                      return aPrice - bPrice;
                    });
                    const roomCount = Math.max(1, Math.min(4, Number(sharedHotelRoomCount ?? 1) || 1));
                    const roomSelections = Array.isArray(localRoomSelectionsByHotel[hotelId]) ? localRoomSelectionsByHotel[hotelId] : [];
                    const resolvedRoomChoices = Array.from({ length: roomCount }).map((_, roomIndex) => {
                      const selection = roomSelections[roomIndex] || null;
                      const selectedBoardingKey = selection?.boardingKey || boardingOptions[0]?.key || "";
                      const selectedBoardingOption = boardingOptions.find((item) => item.key === selectedBoardingKey) || boardingOptions[0] || null;
                      const roomOptions = roomOffers
                        .filter((offer) => {
                          if (!selectedBoardingOption) return true;
                          if (selectedBoardingOption.boardingId) return Number(offer.boardingId || 0) === Number(selectedBoardingOption.boardingId || 0);
                          return String(offer.boardingName || "").trim().toLowerCase() === String(selectedBoardingOption.boardingName || "").trim().toLowerCase();
                        })
                        .map((offer, index) => {
                          const room = offer.room;
                          const roomPrice = pickHotelDisplayedPrice(room);
                          const roomId = Number(room?.Id || 0);
                          const key = roomId > 0 ? `id:${roomId}` : `idx:${index}`;
                          return {
                            key,
                            roomId: roomId > 0 ? roomId : null,
                            roomName: String(room?.Name || "").trim() || `Chambre ${index + 1}`,
                            price: roomPrice,
                            description: String(room?.Description || "").trim(),
                            quantity: Math.max(0, Number(room?.Quantity || 0)),
                            onRequest: Boolean(room?.OnRequest || room?.StopReservation),
                            notRefundable: Boolean(room?.NotRefundable),
                          };
                        });
                      const selectedRoomKey = selection?.roomKey || roomOptions[0]?.key || "";
                      const selectedRoomOption = roomOptions.find((item) => item.key === selectedRoomKey) || roomOptions[0] || null;
                      return {
                        roomIndex,
                        selectedBoardingKey,
                        selectedBoardingOption,
                        roomOptions,
                        selectedRoomKey,
                        selectedRoomOption,
                        price: selectedRoomOption?.price ?? selectedBoardingOption?.price ?? leadOfferPrice ?? minPrice,
                      };
                    });
                    const displayedClientPrice = resolvedRoomChoices[0]?.price ?? leadOfferPrice ?? minPrice;
                    const totalClientPrice = resolvedRoomChoices.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
                    const roomTravellers = resolveHotelCardRoomTravellers(roomCount);
                    const totalRoomAdults = roomTravellers.reduce((sum, room) => sum + Math.max(1, Number(room.adults) || 1), 0);
                    const totalRoomChildren = roomTravellers.reduce((sum, room) => sum + Math.max(0, Number(room.children) || 0), 0);
                    const availabilitySignature = buildHotelAvailabilitySignature({
                      hotelId,
                      hotelCityId,
                      hotelDestinationQuery,
                      selectedHotelId,
                      checkIn: hotelCheckIn,
                      checkOut: hotelCheckOut,
                      roomCount,
                      roomTravellers,
                      roomSelections,
                    });
                    const isAvailabilityVerified = hotelAvailabilitySignatureByHotel[hotelId] === availabilitySignature;
                    const availabilityActionLabel = isAvailabilityVerified ? "Réserver" : "Vérifier disponibilité";
                    const detailParams = new URLSearchParams();
                    if (hotelCityId > 0) detailParams.set("cityId", String(hotelCityId));
                    detailParams.set("checkIn", hotelCheckIn);
                    detailParams.set("checkOut", hotelCheckOut);
                    detailParams.set("adults", String(totalRoomAdults));
                    if (totalRoomChildren > 0) detailParams.set("children", flattenHotelRoomChildAges(roomTravellers).join(","));
                    if (resolvedRoomChoices[0]?.selectedBoardingOption?.boardingId) detailParams.set("boardingId", String(resolvedRoomChoices[0].selectedBoardingOption.boardingId));
                    if (resolvedRoomChoices[0]?.selectedRoomOption?.roomId) detailParams.set("roomId", String(resolvedRoomChoices[0].selectedRoomOption.roomId));
                    const linkTo = `/hotels/${encodeURIComponent(String(hotel.Id))}${detailParams.toString() ? `?${detailParams.toString()}` : ""}`;
                    return (
                      <article
                        key={hotel.Id}
                        className={`group overflow-hidden rounded-[30px] bg-white transition hover:-translate-y-1 ${
                          hasPromotion
                            ? "border border-amber-200 shadow-[0_18px_48px_rgba(217,119,6,0.18)] hover:shadow-[0_30px_70px_rgba(217,119,6,0.28)]"
                            : "border border-slate-100 shadow-[0_18px_48px_rgba(15,23,42,0.08)] hover:shadow-[0_28px_60px_rgba(15,23,42,0.12)]"
                        }`}
                      >
                        <Link to={linkTo} className="block">
                          <div className="relative aspect-[16/10] overflow-hidden">
                            <img
                              src={String(hotel.Image || "").trim() || HOTEL_FALLBACK_IMAGE}
                              alt={hotel.Name}
                              className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/10 to-transparent" />
                            <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/14 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                              <Star size={13} className="fill-current" />
                              {formatHotelStarLabel(hotel.Star)}
                            </div>
                            {hasPromotion && (
                              <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-400/95 px-3 py-1 text-xs font-semibold text-slate-950 shadow-md">
                                <Sparkles size={13} />
                                Promotion
                              </div>
                            )}
                            {(leadOfferPrice !== null || minPrice !== null) && (
                              <div className="absolute bottom-4 right-4 rounded-2xl bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 shadow-md">
                                A partir de {formatHotelPrice(leadOfferPrice ?? minPrice)} TND
                              </div>
                            )}
                          </div>
                        </Link>

                        <div className="space-y-4 p-5">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                              {hotel.City?.Name || "Destination"}
                            </p>
                            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{hotel.Name}</h3>
                            <p className="mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-500">
                              {getHotelCardDescription(hotel)}
                            </p>
                          </div>

                          {hasCompleteHotelCriteria && hotelSearchFallbackNotice && (
                            <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                              {selectedHotelLabel && Number(hotel.Id || 0) === Number(selectedHotelId)
                                ? selectedHotelUnavailableMessage
                                : hotelUnavailableMessage}
                            </div>
                          )}

                          <div className="space-y-3">
                            <div className={`rounded-[20px] border bg-slate-50/80 px-4 py-3 transition-all ${
                              hotelCriteriaGlowTarget === "dates"
                                ? "border-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.18),0_18px_40px_rgba(56,189,248,0.18)]"
                                : "border-slate-200"
                            }`}>
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                <CalendarDays size={14} className="text-amber-600" />
                                Dates de séjour
                              </div>
                              <div className="mt-3 grid gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHotelCriteriaGlowTarget("dates");
                                    openHotelCalendar();
                                  }}
                                  className="flex h-12 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left transition hover:border-sky-500 hover:shadow-[0_8px_24px_rgba(14,116,214,0.12)]"
                                >
                                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Arrivée</span>
                                  <span className={`text-sm font-semibold ${hotelCheckIn ? "text-slate-900" : "text-slate-400"}`}>
                                    {formatHotelDateDisplay(hotelCheckIn)}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHotelCriteriaGlowTarget("dates");
                                    openHotelCalendar();
                                  }}
                                  className="flex h-12 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left transition hover:border-sky-500 hover:shadow-[0_8px_24px_rgba(14,116,214,0.12)]"
                                >
                                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Départ</span>
                                  <span className={`text-sm font-semibold ${hotelCheckOut ? "text-slate-900" : "text-slate-400"}`}>
                                    {formatHotelDateDisplay(hotelCheckOut)}
                                  </span>
                                </button>
                              </div>
                              <p className="mt-2 text-xs text-slate-500">
                                Cliquez sur une date pour ouvrir le calendrier de séjour.
                              </p>
                            </div>

                            <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                <TicketPercent size={14} className="text-sky-600" />
                                Tarif client
                              </div>
                              <p className="mt-2 text-lg font-semibold text-slate-900">
                                {displayedClientPrice !== null ? `${formatHotelPrice(displayedClientPrice)} TND` : "Sur demande"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {resolvedRoomChoices[0]?.selectedBoardingOption?.boardingName || leadOffer?.boardingName || "Selon les chambres et les dates"}
                              </p>
                              <p className="mt-2 text-xs font-semibold text-slate-700">
                                Total ({roomCount} chambre{roomCount > 1 ? "s" : ""}): {Number.isFinite(totalClientPrice) && totalClientPrice > 0 ? `${formatHotelPrice(totalClientPrice)} TND` : "Sur demande"}
                              </p>
                            </div>

                            <div className={`rounded-[20px] border bg-slate-50/80 px-4 py-3 transition-all ${
                              hotelCriteriaGlowTarget === "chambres"
                                ? "border-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.18),0_18px_40px_rgba(56,189,248,0.18)]"
                                : "border-slate-200"
                            }`}>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  <BedDouble size={14} className="text-emerald-600" />
                                  Chambres
                                </div>
                                <div className="flex items-center gap-2 self-start sm:self-auto">
                                  <button type="button" onClick={() => setHotelRoomCount(roomCount - 1)} className="shrink-0 rounded-lg border border-slate-300 p-1 text-slate-800"><Minus size={12} /></button>
                                  <span className="min-w-[1.25rem] text-center text-sm font-semibold text-slate-900">{roomCount}</span>
                                  <button type="button" onClick={() => setHotelRoomCount(roomCount + 1)} className="shrink-0 rounded-lg border border-slate-300 p-1 text-slate-800"><Plus size={12} /></button>
                                </div>
                              </div>
                              <div className="mt-3 space-y-2">
                                {resolvedRoomChoices.map((choice) => (
                                  <div key={`${hotelId}-room-choice-${choice.roomIndex}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">Chambre {choice.roomIndex + 1}</p>
                                        <p className="mt-0.5 text-[10px] font-semibold text-slate-500 sm:hidden">
                                          {choice.price !== null ? `${formatHotelPrice(choice.price)} TND` : "Sur demande"}
                                        </p>
                                      </div>
                                      <p className="hidden text-[10px] font-semibold text-slate-500 sm:block">
                                        {choice.price !== null ? `${formatHotelPrice(choice.price)} TND` : "Sur demande"}
                                      </p>
                                    </div>
                                    <select
                                      value={choice.selectedBoardingKey}
                                      onChange={(event) => {
                                        const nextKey = event.target.value;
                                        setLocalRoomSelectionsByHotel((prev) => {
                                          const current = Array.isArray(prev[hotelId]) ? [...prev[hotelId]] : [];
                                          current[choice.roomIndex] = { boardingKey: nextKey, roomKey: "" };
                                          return { ...prev, [hotelId]: current };
                                        });
                                        setHotelAvailabilitySignatureByHotel({});
                                      }}
                                      className="mt-1.5 h-9 w-full max-w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] text-slate-900"
                                    >
                                      {boardingOptions.length > 0 ? boardingOptions.map((option) => (
                                        <option key={`${hotel.Id}-${option.key}-${choice.roomIndex}`} value={option.key}>
                                          {option.boardingName}{option.price !== null ? ` - ${formatHotelPrice(option.price)} TND` : ""}
                                        </option>
                                      )) : <option value="">{hasCompleteHotelCriteria ? "Selon les offres disponibles" : "Complétez les critères pour voir les offres"}</option>}
                                    </select>
                                    <select
                                      value={choice.selectedRoomKey}
                                      onChange={(event) => {
                                        const nextKey = event.target.value;
                                        setLocalRoomSelectionsByHotel((prev) => {
                                          const current = Array.isArray(prev[hotelId]) ? [...prev[hotelId]] : [];
                                          const currentBoardingKey = current[choice.roomIndex]?.boardingKey || choice.selectedBoardingKey;
                                          current[choice.roomIndex] = { boardingKey: currentBoardingKey, roomKey: nextKey };
                                          return { ...prev, [hotelId]: current };
                                        });
                                        setHotelAvailabilitySignatureByHotel({});
                                      }}
                                      className="mt-1.5 h-9 w-full max-w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] text-slate-900"
                                    >
                                      {choice.roomOptions.length > 0 ? choice.roomOptions.map((option) => (
                                        <option key={`${hotel.Id}-room-${option.key}-${choice.roomIndex}`} value={option.key}>
                                          {option.roomName}{option.price !== null ? ` - ${formatHotelPrice(option.price)} TND` : ""}
                                        </option>
                                      )) : <option value="">{hasCompleteHotelCriteria ? "Types de chambre indisponibles" : "Complétez les critères pour voir les chambres"}</option>}
                                    </select>
                                    <p className="mt-1.5 text-[11px] font-medium text-slate-700">
                                      Tarif chambre: {choice.price !== null ? `${formatHotelPrice(choice.price)} TND` : "Sur demande"}
                                    </p>
                                    {!hasCompleteHotelCriteria && boardingOptions.length === 0 && (
                                      <div className="mt-2 rounded-lg border border-dashed border-sky-200 bg-sky-50/70 px-3 py-3 text-[11px] text-sky-700">
                                        Renseignez les dates, les voyageurs et la répartition des chambres pour charger les offres disponibles.
                                      </div>
                                    )}
                                    <div className={`mt-2 rounded-lg border bg-slate-50 px-2 py-2 transition-all ${
                                      hotelCriteriaGlowTarget === "voyageurs"
                                        ? "border-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.18),0_18px_40px_rgba(56,189,248,0.18)]"
                                        : "border-slate-200"
                                    }`}>
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Voyageurs chambre</span>
                                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1">
                                            <span className="text-[10px] text-slate-500">A</span>
                                            <button
                                              type="button"
                                              onClick={() => setSharedHotelRoomTravellers((prev) => {
                                                const current = normalizeHotelRoomTravellers(prev, roomCount);
                                                current[choice.roomIndex] = {
                                                  ...current[choice.roomIndex],
                                                  adults: Math.max(1, current[choice.roomIndex]?.adults - 1 || 1),
                                                };
                                                setHotelAvailabilitySignatureByHotel({});
                                                setHotelCriteriaGlowTarget("voyageurs");
                                                return current;
                                              })}
                                              className="shrink-0 rounded-md border border-slate-300 bg-white p-1 text-slate-700"
                                            >
                                              <Minus size={11} />
                                            </button>
                                            <span className="min-w-[1.5rem] text-center text-sm font-semibold text-slate-900">
                                              {roomTravellers[choice.roomIndex]?.adults ?? 1}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => setSharedHotelRoomTravellers((prev) => {
                                                const current = normalizeHotelRoomTravellers(prev, roomCount);
                                                current[choice.roomIndex] = {
                                                  ...current[choice.roomIndex],
                                                  adults: Math.min(8, (current[choice.roomIndex]?.adults || 1) + 1),
                                                };
                                                setHotelAvailabilitySignatureByHotel({});
                                                setHotelCriteriaGlowTarget("voyageurs");
                                                return current;
                                              })}
                                              className="shrink-0 rounded-md border border-slate-300 bg-white p-1 text-slate-700"
                                            >
                                              <Plus size={11} />
                                            </button>
                                          </div>
                                          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1">
                                            <span className="text-[10px] text-slate-500">E</span>
                                            <button
                                              type="button"
                                              onClick={() => setSharedHotelRoomTravellers((prev) => {
                                                const current = normalizeHotelRoomTravellers(prev, roomCount);
                                                current[choice.roomIndex] = {
                                                  ...current[choice.roomIndex],
                                                  children: Math.max(0, (current[choice.roomIndex]?.children || 0) - 1),
                                                };
                                                current[choice.roomIndex].childAges = normalizeHotelRoomChildAges(
                                                  current[choice.roomIndex]?.childAges,
                                                  current[choice.roomIndex]?.children || 0
                                                );
                                                setHotelAvailabilitySignatureByHotel({});
                                                setHotelCriteriaGlowTarget("voyageurs");
                                                return current;
                                              })}
                                              className="shrink-0 rounded-md border border-slate-300 bg-white p-1 text-slate-700"
                                            >
                                              <Minus size={11} />
                                            </button>
                                            <span className="min-w-[1.5rem] text-center text-sm font-semibold text-slate-900">
                                              {roomTravellers[choice.roomIndex]?.children ?? 0}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => setSharedHotelRoomTravellers((prev) => {
                                                const current = normalizeHotelRoomTravellers(prev, roomCount);
                                                current[choice.roomIndex] = {
                                                  ...current[choice.roomIndex],
                                                  children: Math.min(8, (current[choice.roomIndex]?.children || 0) + 1),
                                                };
                                                current[choice.roomIndex].childAges = normalizeHotelRoomChildAges(
                                                  current[choice.roomIndex]?.childAges,
                                                  current[choice.roomIndex]?.children || 0
                                                );
                                                setHotelAvailabilitySignatureByHotel({});
                                                setHotelCriteriaGlowTarget("voyageurs");
                                                return current;
                                              })}
                                              className="shrink-0 rounded-md border border-slate-300 bg-white p-1 text-slate-700"
                                            >
                                              <Plus size={11} />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                      {(roomTravellers[choice.roomIndex]?.children ?? 0) > 0 && (
                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                          {normalizeHotelRoomChildAges(
                                            roomTravellers[choice.roomIndex]?.childAges,
                                            roomTravellers[choice.roomIndex]?.children ?? 0
                                          ).map((age, childIndex) => (
                                            <label
                                              key={`${hotelId}-room-${choice.roomIndex}-child-age-${childIndex}`}
                                              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2 py-2"
                                            >
                                              <span className="text-[11px] font-medium text-slate-600">Enfant {childIndex + 1}</span>
                                              <select
                                                value={age}
                                                onChange={(event) => {
                                                  const nextAge = Math.max(0, Math.min(17, Math.floor(Number(event.target.value) || 0)));
                                                  setSharedHotelRoomTravellers((prev) => {
                                                    const current = normalizeHotelRoomTravellers(prev, roomCount);
                                                    const currentRoom = current[choice.roomIndex] || { adults: 1, children: 0, childAges: [] };
                                                    const nextChildAges = normalizeHotelRoomChildAges(currentRoom.childAges, currentRoom.children);
                                                    nextChildAges[childIndex] = nextAge;
                                                    current[choice.roomIndex] = {
                                                      ...currentRoom,
                                                      childAges: nextChildAges,
                                                    };
                                                    setHotelAvailabilitySignatureByHotel({});
                                                    setHotelCriteriaGlowTarget("voyageurs");
                                                    return current;
                                                  });
                                                }}
                                                className="h-8 min-w-[7rem] rounded-lg border border-slate-300 bg-white px-2 text-[11px] text-slate-900"
                                              >
                                                {Array.from({ length: 18 }).map((_, ageOption) => (
                                                  <option key={`${hotelId}-room-${choice.roomIndex}-child-${childIndex}-age-${ageOption}`} value={ageOption}>
                                                    {ageOption} ans
                                                  </option>
                                                ))}
                                              </select>
                                            </label>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {hasRefundableOffer ? (
                              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                <ShieldCheck size={13} />
                                Annulation selon conditions
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                                <ShieldX size={13} />
                                Offre non remboursable
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                            <div className="text-xs text-slate-500">
                              {selectedHotelCity?.Name || hotel.City?.Name || "Destination"} • {totalRoomAdults} adulte{totalRoomAdults > 1 ? "s" : ""}{totalRoomChildren > 0 ? ` - ${totalRoomChildren} enfant${totalRoomChildren > 1 ? "s" : ""}` : ""}
                            </div>
                            <div className="flex items-center gap-2">
                              <Link
                                to={linkTo}
                                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:border-sky-600 hover:text-sky-700 sm:px-4 sm:text-sm"
                              >
                                Voir le détail
                              </Link>
                              <button
                                type="button"
                                disabled={checkingAvailabilityHotelId === hotelId}
                                onClick={() => {
                                  if (!isAvailabilityVerified) {
                                    void verifyHotelAvailability(hotel, hotelId);
                                    return;
                                  }
                                  openHotelReserveModal({
                                    hotel,
                                    adults: totalRoomAdults,
                                    childAges: flattenHotelRoomChildAges(roomTravellers),
                                    rooms: resolvedRoomChoices.map((item, index) => ({
                                      boardingId: item.selectedBoardingOption?.boardingId || null,
                                      boardingName: item.selectedBoardingOption?.boardingName || null,
                                      roomId: item.selectedRoomOption?.roomId || null,
                                      roomName: item.selectedRoomOption?.roomName || null,
                                      price: item.price ?? null,
                                      adults: roomTravellers[index]?.adults ?? 1,
                                      children: roomTravellers[index]?.children ?? 0,
                                      childAges: normalizeHotelRoomChildAges(
                                        roomTravellers[index]?.childAges,
                                        roomTravellers[index]?.children ?? 0
                                      ),
                                    })),
                                    totalPrice: Number.isFinite(totalClientPrice) && totalClientPrice > 0 ? totalClientPrice : null,
                                  });
                                }}
                                className={`inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold text-white transition sm:px-4 sm:text-sm ${
                                  isAvailabilityVerified
                                    ? "bg-sky-600 hover:bg-sky-700"
                                    : "bg-amber-500 hover:bg-amber-600"
                                } disabled:cursor-not-allowed disabled:opacity-70`}
                              >
                                {checkingAvailabilityHotelId === hotelId ? "Vérification..." : availabilityActionLabel}
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {false && !isSelectedModeComingSoon && isHotelMode && (
            <div className="rounded-[30px] border border-sky-100 bg-white px-4 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] md:px-6 md:py-7">
              <div className="grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
                <div className="rounded-[28px] border border-slate-100 bg-[linear-gradient(135deg,#f8fafc,#eff6ff)] p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Séjours hôteliers</p>
                  <h3 className="mt-3 text-3xl font-semibold text-slate-900">Hôtels, pensions et séjours dans un espace dédié.</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                    Cette section réunit les offres d'hébergement avec un parcours clair pour choisir la destination, les dates de séjour et consulter les fiches hôtels.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white">
                      Recherche sur l'accueil
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white px-4 py-3 text-sm font-medium text-slate-600">
                      <Calendar size={16} className="text-sky-600" />
                      Recherche par ville et dates
                    </span>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-100 bg-slate-950 p-6 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Pourquoi choisir cette section</p>
                  <div className="mt-5 space-y-4 text-sm leading-6 text-sky-50/88">
                    <p><span className="font-semibold text-white">Parcours dédié :</span> toutes les offres d'hébergement sont regroupées dans un espace simple à parcourir.</p>
                    <p><span className="font-semibold text-white">Recherche rapide :</span> filtrez par destination, dates de séjour et nombre de voyageurs.</p>
                    <p><span className="font-semibold text-white">Détails utiles :</span> consultez les informations essentielles avant de choisir l'offre qui vous convient.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isSelectedModeComingSoon && !isHotelMode && (<div className="rounded-[30px] border border-gray-100 bg-white px-4 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] md:px-6 md:py-7">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {visibleFilteredProperties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  searchParams={(() => {
                    const params = applyAmicaleParam(new URLSearchParams(searchParams));
                    params.set("mode", selectedMode);
                    params.delete("location");
                    params.delete("locations");
                    params.delete("mainType");
                    params.delete("mainTypes");
                    params.delete("stayRanges");
                    if (selectedLocations.length > 0) params.set("locations", selectedLocations.join(","));
                    if (selectedMainTypes.length > 0) params.set("mainTypes", selectedMainTypes.join(","));
                    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
                    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
                    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
                    if (selectedStayRanges.length > 0) {
                      params.set("stayRanges", serializeStayRangesParam(selectedStayRanges));
                      params.set("checkIn", selectedStayRanges[0].start);
                      params.set("checkOut", selectedStayRanges[0].end);
                    } else {
                      params.delete("checkIn");
                      params.delete("checkOut");
                    }
                    return params.toString();
                  })()}
                />
              ))}
              {loading && filteredProperties.length === 0 && Array.from({ length: 3 }).map((_, index) => (
                <div key={`property-skeleton-${index}`} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                  <div className="aspect-[4/3] w-full animate-pulse bg-gray-200" />
                  <div className="p-5">
                    <div className="mb-3 h-4 w-24 animate-pulse rounded bg-gray-200" />
                    <div className="mb-3 h-7 w-4/5 animate-pulse rounded bg-gray-200" />
                    <div className="mb-5 h-4 w-3/5 animate-pulse rounded bg-gray-200" />
                    <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-4">
                      <div className="h-10 animate-pulse rounded bg-gray-100" />
                      <div className="h-10 animate-pulse rounded bg-gray-100" />
                      <div className="h-10 animate-pulse rounded bg-gray-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredProperties.length > INITIAL_VISIBLE_PROPERTIES && (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {hasMoreFilteredProperties && (
                  <button
                    type="button"
                    onClick={() => setVisiblePropertiesCount((prev) => prev + INITIAL_VISIBLE_PROPERTIES)}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    Suivant
                  </button>
                )}
                {!showAllProperties && (
                  <button
                    type="button"
                    onClick={() => setShowAllProperties(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Voir tout le catalogue
                  </button>
                )}
              </div>
            )}
          </div>)}
          
          {filteredProperties.length === 0 && hasSearched && !isSelectedModeComingSoon && !isHotelMode && (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg mb-4">Aucun bien ne correspond à vos critères pour ce mode</p>
              <button 
                onClick={() => {
                  setLocation("");
                  setSelectedCategories([]);
                  setSelectedSeasideOptions([]);
                  setSelectedComfortOptions([]);
                  setCheckIn(null);
                  setCheckOut(null);
                  setHasSearched(false);
                }}
                className="text-emerald-600 font-semibold hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}
          
          {!isSelectedModeComingSoon && !isHotelMode && (
            <div className="mt-12 text-center md:hidden">
              <Link to={selectedMode === "vente" ? "/ventes" : `/logements?mode=${encodeURIComponent(selectedMode)}`} className="inline-flex items-center gap-2 text-emerald-700 font-bold hover:text-emerald-800 transition-colors border-2 border-emerald-700 px-6 py-3 rounded-full hover:bg-emerald-50">
                Voir tous les logements <ArrowRight size={20} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-white" style={{ contentVisibility: "auto", containIntrinsicSize: "1000px" }}>
        <div className="container mx-auto px-4 md:px-6">
           <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Pourquoi Choisir Dwira Immobilier ?</h2>
            <p className="text-gray-600">L'expertise locale au service de votre projet immobilier.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div className="p-8 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-emerald-100 group">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <MapPin size={36} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Expertise Locale</h3>
              <p className="text-gray-600">Basés à Kélibia, nous connaissons chaque quartier et chaque opportunité du marché local.</p>
            </div>
            
            <div className="p-8 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-emerald-100 group">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <Key size={36} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Gestion Personnalisée</h3>
              <p className="text-gray-600">De la remise des clés à l'entretien, nous gérons votre bien comme si c'était le nôtre.</p>
            </div>

            <div className="p-8 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-emerald-100 group">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <Star size={36} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Confiance & Qualité</h3>
              <p className="text-gray-600">Une agence reconnue pour son sérieux, sa transparence et la qualité de ses services.</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Call to Action */}
      <section className="py-20 bg-emerald-700 text-white text-center relative overflow-hidden" style={{ contentVisibility: "auto", containIntrinsicSize: "900px" }}>
        <div className="absolute inset-0 opacity-10 pattern-dots"></div>
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Confiez-nous votre projet</h2>
          <p className="text-emerald-100 text-lg mb-10 max-w-2xl mx-auto">
            Que vous cherchiez à acheter, vendre ou louer, Dwira Immobilier est là pour concrétiser vos rêves.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/contact" className="inline-block bg-white text-emerald-800 font-bold py-4 px-10 rounded-full hover:bg-amber-400 hover:text-white transition-all shadow-lg transform hover:-translate-y-1">
              Nous Contacter
            </Link>
            <Link to="/logements" className="inline-block bg-emerald-800 text-white border border-emerald-600 font-bold py-4 px-10 rounded-full hover:bg-emerald-900 transition-all shadow-lg">
              Parcourir les offres
            </Link>
          </div>
        </div>
      </section>
      {createPortal(
        <>
          {hotelDestinationOpen && (
            <div className="fixed inset-0 z-[9999] bg-[linear-gradient(160deg,#ffffff,#f6faff)] md:hidden">
              <div className="relative border-b border-slate-200 px-4 py-4">
                <h3 className="text-center text-[18px] font-semibold leading-tight text-slate-900">Indiquez la destination</h3>
                <button type="button" onClick={() => setHotelDestinationOpen(false)} className="absolute right-3 top-3 rounded-full p-2 text-slate-700">
                  <X size={22} />
                </button>
              </div>
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                  <Search size={18} className="text-slate-500" />
                  <input
                    value={hotelDestinationQuery}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setHotelDestinationQuery(nextValue);
                      setSelectedHotelId(0);
                      if (!nextValue.trim()) {
                        setHotelCityId(0);
                        setSelectedHotelId(0);
                      }
                    }}
                    placeholder="ex. ville, nom hotel"
                    className="w-full border-0 bg-transparent text-[14px] outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
              <div className="border-b border-slate-200 px-4 py-4">
                <div className="mb-3 flex items-center gap-3 text-slate-900">
                  <MapPin size={20} />
                  <span className="text-[15px] font-semibold">Proche de votre emplacement</span>
                </div>
                <p className="text-[18px] font-semibold text-slate-900">Destinations en vogue</p>
              </div>
              <div className="h-[calc(100vh-260px)] overflow-y-auto">
                {filteredHotelCities.map((city) => (
                  <button
                    key={`mobile-home-hotel-city-${city.Id}`}
                    type="button"
                    onClick={() => {
                      setHotelCityId(city.Id);
                      setHotelDestinationQuery(city.Name);
                      setSelectedHotelId(0);
                    }}
                    className="flex w-full items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 text-left transition active:bg-sky-50"
                  >
                    <MapPin size={20} className="text-slate-700" />
                    <div>
                      <p className="text-[16px] font-semibold text-slate-900">{city.Name}</p>
                      <p className="text-[12px] text-slate-500">Tunisie</p>
                    </div>
                  </button>
                ))}
                {loadingHotelsByCity && (
                  <div className="border-b border-slate-200 px-4 py-3 text-[13px] text-slate-500">
                    Chargement des hôtels...
                  </div>
                )}
                {filteredHotelsByCity.map((hotel) => (
                  <button
                    key={`mobile-home-hotel-name-${hotel.Id}`}
                    type="button"
                    onClick={() => {
                      if (Number(hotel?.City?.Id || 0) > 0) {
                        setHotelCityId(Number(hotel.City?.Id || 0));
                      }
                      setSelectedHotelId(Number(hotel.Id || 0));
                      setHotelDestinationQuery(hotel.Name);
                      setHotelDestinationOpen(false);
                    }}
                    className="flex w-full items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 text-left transition active:bg-sky-50"
                  >
                    <BedDouble size={20} className="text-slate-700" />
                    <div>
                      <p className="text-[16px] font-semibold text-slate-900">{hotel.Name}</p>
                      <p className="text-[12px] text-slate-500">{selectedHotelCity?.Name || "Hotel"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hotelCalendarOpen && (
            <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
              <div className="w-full max-w-md rounded-3xl border border-sky-100 bg-white p-4 shadow-[0_32px_80px_rgba(15,23,42,0.28)]">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Dates de séjour</p>
                  <button type="button" onClick={() => setHotelCalendarOpen(false)} className="rounded-full p-2 text-slate-600 hover:bg-slate-100">
                    <X size={18} />
                  </button>
                </div>
                <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <button type="button" onClick={() => setHotelCalendarMonth((prev) => subMonths(prev, 1))} className="rounded-lg p-2 text-slate-700 hover:bg-white">
                    <ChevronLeft size={18} />
                  </button>
                  <p className="text-sm font-semibold text-slate-900">{format(hotelCalendarMonth, "MMMM yyyy", { locale: fr })}</p>
                  <button type="button" onClick={() => setHotelCalendarMonth((prev) => addMonths(prev, 1))} className="rounded-lg p-2 text-slate-700 hover:bg-white">
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="mb-2 grid grid-cols-7 text-center text-xs font-semibold uppercase text-slate-500">
                  {["lu", "ma", "me", "je", "ve", "sa", "di"].map((day) => (
                    <div key={`hotel-cal-day-${day}`}>{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {hotelCalendarDays.map((day, idx) => (
                    <button key={`hotel-cal-date-${idx}`} type="button" onClick={() => handleHotelCalendarDayClick(day)} className={getHotelCalendarDayClassName(day)}>
                      {format(day, "d")}
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  {hotelCalendarCheckInDraft && hotelCalendarCheckOutDraft ? (
                    <>
                      Du <span className="font-semibold text-slate-900">{format(hotelCalendarCheckInDraft, "dd/MM/yyyy")}</span> au{" "}
                      <span className="font-semibold text-slate-900">{format(hotelCalendarCheckOutDraft, "dd/MM/yyyy")}</span>
                    </>
                  ) : (
                    "Sélectionnez d'abord l'arrivée puis le départ."
                  )}
                </div>
                <button
                  type="button"
                  onClick={confirmHotelCalendarSelection}
                  disabled={!hotelCalendarCheckInDraft || !hotelCalendarCheckOutDraft}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0284c7,#2563eb)] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Valider les dates
                </button>
              </div>
            </div>
          )}

          {hotelSearchLoadingModal && (
            <div className="fixed inset-0 z-[10008] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-3xl border border-sky-100 bg-white p-6 text-center shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-sky-50">
                  <LoaderCircle size={30} className="animate-spin text-sky-600" />
                </div>
                <p className="text-lg font-semibold text-slate-900">Nous cherchons la disponibilité de votre demande</p>
                <p className="mt-2 text-sm text-slate-500">Merci de patienter quelques secondes...</p>
              </div>
            </div>
          )}

          {showLoginPrompt && (
            <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
              <div className="mx-auto w-full max-w-md rounded-[28px] border border-white/60 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Connexion client</p>
                    <h3 className="mt-2 text-2xl font-bold text-gray-900">
                      {loginPromptStep === "profile_setup" ? "Completez votre profil" : "Connectez-vous pour continuer"}
                    </h3>
                    {loginPromptStep !== "profile_setup" ? (
                      <p className="mt-2 text-sm leading-6 text-gray-500">Connectez-vous en tant que client pour envoyer une demande de reservation.</p>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => setShowLoginPrompt(false)} className="rounded-full p-2 text-gray-400 hover:bg-gray-100">
                    <X size={18} />
                  </button>
                </div>

                {loginPromptStep === "choices" && (
                  <div className="mt-5 space-y-3">
                    <button type="button" disabled={!providers.google} onClick={() => handlePromptSocialLogin("google")} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                      <Globe className="h-5 w-5 text-emerald-700" />
                      Continuer avec Google
                    </button>
                    <button type="button" disabled={!providers.facebook} onClick={() => handlePromptSocialLogin("facebook")} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                      <Facebook className="h-5 w-5 text-blue-600" />
                      Continuer avec Facebook
                    </button>
                    <button type="button" disabled={isPasskeyPromptLoading || !providers.passkey} onClick={() => void handlePromptPasskeyLogin()} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                      <KeyRound className="h-5 w-5 text-emerald-700" />
                      {isPasskeyPromptLoading ? "Verification Passkey..." : "Continuer avec Passkey"}
                    </button>
                  </div>
                )}

                {loginPromptStep === "passkey_setup" && (
                  <div className="mt-4 space-y-3">
                    <button type="button" onClick={() => setLoginPromptStep("choices")} className="text-xs font-semibold text-emerald-700">Retour</button>
                    <input type="email" value={passkeyPromptEmail} onChange={(e) => setPasskeyPromptEmail(e.target.value)} placeholder="Email client" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    <input type="text" value={passkeyPromptName} onChange={(e) => setPasskeyPromptName(e.target.value)} placeholder="Nom (optionnel)" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" disabled={isPasskeyCreateLoading} onClick={() => void handlePromptPasskeyCreate()} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50">
                        <KeyRound className="h-5 w-5 text-white" />
                        {isPasskeyCreateLoading ? "Creation Passkey..." : "Creer et continuer"}
                      </button>
                    </div>
                  </div>
                )}

                {loginPromptStep === "profile_setup" && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-gray-600">Completez votre identite. Le popup reste bloque tant que la CIN et sa photo ne sont pas enregistrees.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={profilePromptForm.firstName} onChange={(e) => setProfilePromptForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Prenom *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                      <input type="text" value={profilePromptForm.lastName} onChange={(e) => setProfilePromptForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Nom *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    </div>
                    <input type="tel" value={profilePromptForm.telephone} onChange={(e) => setProfilePromptForm((p) => ({ ...p, telephone: e.target.value }))} placeholder="Telephone *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    <input type="text" value={profilePromptForm.address} onChange={(e) => setProfilePromptForm((p) => ({ ...p, address: e.target.value }))} placeholder="Adresse *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    <input type="text" value={profilePromptForm.cin} onChange={(e) => setProfilePromptForm((p) => ({ ...p, cin: e.target.value }))} placeholder="CIN *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-gray-800">
                      <Upload className="h-4 w-4" />
                      {isProfileCinUploading ? "Upload photo CIN..." : "Uploader photo CIN *"}
                      <input type="file" accept="image/*" className="hidden" onChange={handleProfileCinUpload} />
                    </label>
                    {profilePromptForm.cinImageUrl ? (
                      <img src={profilePromptForm.cinImageUrl} alt="Photo CIN" className="h-32 w-full rounded-xl border border-emerald-200 object-cover" />
                    ) : (
                      <p className="text-xs text-red-600">La photo CIN est obligatoire pour continuer.</p>
                    )}
                    <div className="flex items-center justify-end">
                      <button type="button" disabled={isProfilePromptSaving || isProfileCinUploading} onClick={() => void handlePromptProfileComplete()} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50">
                        {isProfilePromptSaving ? "Sauvegarde..." : "Enregistrer et continuer"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {hotelReserveModal && (
            <div className="fixed inset-0 z-[10000] flex items-start sm:items-center justify-center overflow-y-auto bg-slate-950/40 p-2 pt-3 sm:p-4 backdrop-blur-[1px]">
              <div className="mx-auto my-0 sm:my-2 w-full max-w-lg max-h-[calc(100dvh-0.75rem)] overflow-y-auto overscroll-contain touch-pan-y rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-3 sm:p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Reservation hotel</p>
                    <h3 className="mt-1 text-lg sm:text-xl font-semibold text-slate-900">{hotelReserveModal.hotel.Name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{hotelReserveModal.hotel.City?.Name || "Destination"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHotelReserveModal(null)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="mt-3 sm:mt-4 grid gap-2 sm:gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 sm:p-3 text-sm text-slate-700">
                  <p>Periode: <span className="font-semibold text-slate-900">{hotelCheckIn}</span> au <span className="font-semibold text-slate-900">{hotelCheckOut}</span></p>
                  <p>Voyageurs: <span className="font-semibold text-slate-900">{hotelReserveModal.adults} adulte{hotelReserveModal.adults > 1 ? "s" : ""}{hotelReserveModal.childAges.length > 0 ? ` - ${hotelReserveModal.childAges.length} enfant${hotelReserveModal.childAges.length > 1 ? "s" : ""}` : ""}</span></p>
                  <p>Chambres: <span className="font-semibold text-slate-900">{hotelReserveModal.rooms.length}</span></p>
                  <div className="space-y-1">
                    {hotelReserveModal.rooms.map((room, roomIndex) => (
                      <p key={`modal-room-${roomIndex}`} className="text-xs text-slate-700">
                        Chambre {roomIndex + 1}: <span className="font-semibold text-slate-900">{room.boardingName || "Offre"} / {room.roomName || "Type chambre"}</span>
                        {room.price !== null ? ` - ${formatHotelPrice(room.price)} TND` : ""}
                        <br />
                        <span className="font-semibold text-slate-900">
                          {Number(room.adults || 0)} adulte{Number(room.adults || 0) > 1 ? "s" : ""}{Number(room.children || 0) > 0 ? `, ${Number(room.children || 0)} enfant${Number(room.children || 0) > 1 ? "s" : ""}` : ""}
                        </span>
                      </p>
                    ))}
                  </div>
                  <p>Prix client: <span className="font-semibold text-slate-900">{hotelReserveModal.totalPrice !== null ? `${formatHotelPrice(hotelReserveModal.totalPrice)} TND` : "Sur demande"}</span></p>
                </div>
                <div className="mt-3 sm:mt-4 space-y-2.5 sm:space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Identite voyageurs (obligatoire)</p>
                    <div className="mt-2.5 sm:mt-3 space-y-2.5 sm:space-y-3">
                      {hotelReserveModal.travellers.adults.map((adult, index) => (
                        <div key={`modal-adult-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                          <button
                            type="button"
                            onClick={() => setHotelTravellerAccordionOpen((prev) => (prev === `adult-${index}` ? "" : `adult-${index}`))}
                            className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left"
                          >
                            <p className="text-xs font-semibold text-slate-700">Adulte {index + 1}</p>
                            <ChevronDown
                              size={16}
                              className={`text-slate-500 transition-transform ${hotelTravellerAccordionOpen === `adult-${index}` ? "rotate-180" : ""}`}
                            />
                          </button>
                          {hotelTravellerAccordionOpen === `adult-${index}` ? (
                            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                value={adult.firstName}
                                onChange={(event) =>
                                  setHotelReserveModal((prev) => {
                                    if (!prev) return prev;
                                    const nextAdults = [...prev.travellers.adults];
                                    nextAdults[index] = { ...nextAdults[index], firstName: event.target.value };
                                    return { ...prev, travellers: { ...prev.travellers, adults: nextAdults } };
                                  })
                                }
                                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[15px] sm:text-sm text-slate-900 outline-none focus:border-sky-500"
                                placeholder="Prenom *"
                              />
                              <input
                                type="text"
                                value={adult.lastName}
                                onChange={(event) =>
                                  setHotelReserveModal((prev) => {
                                    if (!prev) return prev;
                                    const nextAdults = [...prev.travellers.adults];
                                    nextAdults[index] = { ...nextAdults[index], lastName: event.target.value };
                                    return { ...prev, travellers: { ...prev.travellers, adults: nextAdults } };
                                  })
                                }
                                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[15px] sm:text-sm text-slate-900 outline-none focus:border-sky-500"
                                placeholder="Nom *"
                              />
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {hotelReserveModal.travellers.children.map((child, index) => (
                        <div key={`modal-child-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                          <button
                            type="button"
                            onClick={() => setHotelTravellerAccordionOpen((prev) => (prev === `child-${index}` ? "" : `child-${index}`))}
                            className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left"
                          >
                            <p className="text-xs font-semibold text-slate-700">Enfant {index + 1} ({Number(hotelReserveModal.childAges[index] ?? 0)} ans)</p>
                            <ChevronDown
                              size={16}
                              className={`text-slate-500 transition-transform ${hotelTravellerAccordionOpen === `child-${index}` ? "rotate-180" : ""}`}
                            />
                          </button>
                          {hotelTravellerAccordionOpen === `child-${index}` ? (
                            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                value={child.firstName}
                                onChange={(event) =>
                                  setHotelReserveModal((prev) => {
                                    if (!prev) return prev;
                                    const nextChildren = [...prev.travellers.children];
                                    nextChildren[index] = { ...nextChildren[index], firstName: event.target.value };
                                    return { ...prev, travellers: { ...prev.travellers, children: nextChildren } };
                                  })
                                }
                                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[15px] sm:text-sm text-slate-900 outline-none focus:border-sky-500"
                                placeholder="Prenom *"
                              />
                              <input
                                type="text"
                                value={child.lastName}
                                onChange={(event) =>
                                  setHotelReserveModal((prev) => {
                                    if (!prev) return prev;
                                    const nextChildren = [...prev.travellers.children];
                                    nextChildren[index] = { ...nextChildren[index], lastName: event.target.value };
                                    return { ...prev, travellers: { ...prev.travellers, children: nextChildren } };
                                  })
                                }
                                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[15px] sm:text-sm text-slate-900 outline-none focus:border-sky-500"
                                placeholder="Nom *"
                              />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Telephone</span>
                    <input
                      type="tel"
                      value={hotelReserveModal.phone}
                      onChange={(event) => setHotelReserveModal((prev) => (prev ? { ...prev, phone: event.target.value } : prev))}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-[15px] sm:text-sm text-slate-900 outline-none focus:border-sky-500"
                      placeholder="Ex: 98 123 456"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Note (optionnel)</span>
                    <textarea
                      value={hotelReserveModal.note}
                      onChange={(event) => setHotelReserveModal((prev) => (prev ? { ...prev, note: event.target.value } : prev))}
                      className="min-h-20 sm:min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-[15px] sm:text-sm text-slate-900 outline-none focus:border-sky-500"
                      placeholder="Informations supplementaires"
                    />
                  </label>
                </div>
                <div className="mt-4 sm:mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setHotelReserveModal(null)}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={submittingHotelReserve}
                    onClick={() => void submitHotelReserveFromHome()}
                    className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {submittingHotelReserve ? <LoaderCircle size={16} className="animate-spin" /> : null}
                    Proceder au paiement
                  </button>
                </div>
              </div>
            </div>
          )}

          {hotelTravellersOpen && (
            <div className="fixed inset-0 z-[9999] bg-[linear-gradient(160deg,#ffffff,#f6faff)] md:hidden">
              <div className="relative border-b border-slate-200 px-5 py-4">
                <h3 className="text-[18px] font-semibold text-slate-900">Voyageurs</h3>
                <button type="button" onClick={() => setHotelTravellersOpen(false)} className="absolute right-3 top-3 rounded-full p-2 text-slate-700">
                  <X size={22} />
                </button>
              </div>
              <div className="max-h-[calc(100vh-130px)] overflow-y-auto px-5 py-5">
                <div className="space-y-7 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[16px] font-medium text-slate-900">Adultes</p>
                    <div className="flex min-w-[168px] items-center justify-between rounded-xl border border-slate-300 bg-slate-50 px-5 py-3 text-slate-900">
                      <button type="button" className="text-sky-600" onClick={() => setHotelAdults((prev) => Math.max(0, prev - 1))}><Minus size={18} /></button>
                      <span className="w-8 text-center text-[18px] font-semibold text-slate-900">{hotelAdults}</span>
                      <button type="button" className="text-sky-600" onClick={() => setHotelAdults((prev) => Math.min(8, prev + 1))}><Plus size={18} /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[16px] font-medium text-slate-900">Enfants</p>
                    <div className="flex min-w-[168px] items-center justify-between rounded-xl border border-slate-300 bg-slate-50 px-5 py-3 text-slate-900">
                      <button type="button" className="text-sky-600" onClick={() => setHotelChildAges((prev) => prev.slice(0, Math.max(0, prev.length - 1)))}><Minus size={18} /></button>
                      <span className="w-8 text-center text-[18px] font-semibold text-slate-900">{hotelChildAges.length}</span>
                      <button type="button" className="text-sky-600" onClick={() => setHotelChildAges((prev) => [...prev, 0])}><Plus size={18} /></button>
                    </div>
                  </div>
                  {hotelChildAges.length > 0 && (
                    <div className="space-y-3 border-t border-slate-200 pt-5">
                      <p className="text-[16px] font-semibold text-slate-900">Âge des enfants à la fin du séjour (obligatoire)</p>
                      <p className="text-[13px] leading-relaxed text-slate-500">L'indication des âges réels nous permet de vous proposer les options et tarifs qui correspondent le mieux à votre famille.</p>
                      <div className="grid grid-cols-2 gap-3">
                        {hotelChildAges.map((age, index) => (
                          <select
                            key={`mobile-home-age-${index}`}
                            value={age}
                            onChange={(event) => setHotelChildAges((prev) => {
                              const next = [...prev];
                              next[index] = Number(event.target.value) || 0;
                              return next;
                            })}
                            className="h-12 rounded-xl border border-rose-400 bg-white px-3 text-[14px] text-slate-900"
                          >
                            {Array.from({ length: 18 }).map((_, ageOption) => (
                              <option key={`mobile-age-opt-${index}-${ageOption}`} value={ageOption}>{ageOption} ans</option>
                            ))}
                          </select>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>,
        document.body
      )}
      <WebsiteChatbotWidget />
    </div>
  );
}















