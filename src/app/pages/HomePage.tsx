import { useState, useRef, useMemo, useEffect } from "react";
import { Suspense, lazy } from "react";
import { useCallback } from "react";
import type { Dispatch, SetStateAction, UIEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Search, MapPin, Calendar, CalendarDays, ArrowRight, Star, Key, KeyRound, Globe, Facebook, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Home, Check, Waves, Wind, SlidersHorizontal, Users, BedDouble, LoaderCircle, AlertCircle, Sparkles, ShieldCheck, ShieldX, TicketPercent, Minus, Plus, Upload, CheckCircle2, CircleDollarSign, UtensilsCrossed, ExternalLink, LayoutGrid, Rows3, Flame, Building2, Palmtree } from "lucide-react";
import { useProperties } from "../context/PropertiesContext";
import { useAuth } from "../context/AuthContext";
import { PropertyCard } from "../components/PropertyCard";
import type { Property } from "../data/properties";
import { Zone } from "../admin/types";
import logo from "../../../logo dwira.jpg";
import titaTravelLogo from "../../../logo Tita travel.jpg";
import ComingSoonState from "../components/ComingSoonState";
import { PUBLIC_COMING_SOON } from "../config/publicAvailability";
import type { HotelCity, HotelSummary } from "../services/hotels";
import { extractHotelBoardingNames, extractHotelMinPrice, flattenHotelRoomOffers, getHotelCardDescription, getHotelFacilityTitles, pickHotelDisplayedPrice } from "../utils/hotelHelpers";
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
import { getPropertyFlashOffers, type PropertyFlashOffer } from "../utils/flashOffers";
import { fetchAmicalesPublic } from "../utils/amicales";

type ListingMode = "vente" | "location_annuelle" | "location_saisonniere" | "hotellerie";
type PropertyMainType = "appartement" | "residence" | "villa_maison" | "studio" | "immeuble" | "autre";
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
  if (raw === "appartement" || raw === "residence" || raw === "villa_maison" || raw === "studio" || raw === "immeuble" || raw === "autre") {
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
const decodeScopedCategory = (value?: string | null) => {
  const raw = String(value || "").trim();
  return getScopedCategoryMeta(raw)?.label || raw;
};
const getCategoryDisplayLabel = (value?: string | null) => decodeScopedCategory(value);
type PropertyDisplayCard = {
  key: string;
  property: Property;
  cardVariant: "default" | "flash";
  flashOffer: PropertyFlashOffer | null;
  flashOffers?: PropertyFlashOffer[];
  searchParams: string;
};
const MODE_TABS: Array<{ value: ListingMode; label: string; comingSoon?: boolean }> = [
  { value: "location_saisonniere", label: "Location saisonniere", comingSoon: false },
  { value: "hotellerie", label: "Hotellerie", comingSoon: false },
];
const HERO_TABS: Array<{
  key: "location_saisonniere" | "hotellerie" | "ventes_flash";
  label: string;
  icon: typeof Palmtree;
}> = [
  { key: "location_saisonniere", label: "Location saisonniere", icon: Palmtree },
  { key: "hotellerie", label: "Hotellerie", icon: Building2 },
  { key: "ventes_flash", label: "Ventes flash", icon: Flame },
];

const ZONE_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23d1fae5'/%3E%3Cstop offset='100%25' stop-color='%23a7f3d0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='360' fill='url(%23g)'/%3E%3Cpath d='M0 260h640v100H0z' fill='%23059669' fill-opacity='0.16'/%3E%3C/svg%3E";
const TYPE_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Cdefs%3E%3ClinearGradient id='tg' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23ecfeff'/%3E%3Cstop offset='100%25' stop-color='%23cffafe'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='360' fill='url(%23tg)'/%3E%3Cpath d='M0 270h640v90H0z' fill='%230899b2' fill-opacity='0.16'/%3E%3C/svg%3E";
const MAIN_TYPE_LABELS: Record<PropertyMainType, string> = {
  appartement: "Appartement",
  residence: "Residence",
  villa_maison: "Villa / Maison",
  studio: "Studio",
  immeuble: "Immeuble",
  autre: "Autre",
};
const MAIN_TYPE_DISPLAY_ORDER: PropertyMainType[] = [
  "appartement",
  "residence",
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
const HOTEL_SEARCH_CACHE_KEY = "dwira_home_hotel_search_cache";
const LazyWebsiteChatbotWidget = lazy(() => import("../components/WebsiteChatbotWidget"));
const loadHotelsService = () => import("../services/hotels");
const loadAuthService = () => import("../services/auth");

const normalizeLocationMatchToken = (value?: string | null) =>
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
    .map((value) => normalizeLocationMatchToken(value))
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

const propertyMatchesLocation = (property: any, selectedLocation: string) => {
  const selectedParts = String(selectedLocation || "")
    .split("/")
    .map((item) => normalizeLocationMatchToken(item))
    .filter(Boolean);
  const normalizedSelected = selectedParts[selectedParts.length - 1] || normalizeLocationMatchToken(selectedLocation);
  if (!normalizedSelected) return false;

  const normalizedValues = Array.from(
    new Set(getPropertyLocationValues(property).map((value) => normalizeLocationMatchToken(value)).filter(Boolean))
  );

  if (selectedParts.length > 1) {
    return hasExactLocationHierarchyMatch(property, selectedParts);
  }

  return normalizedValues.some((value) =>
    value === normalizedSelected
    || value.includes(normalizedSelected)
    || normalizedSelected.includes(value)
  );
};

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

type CachedHomeHotelSearch = {
  signature: string;
  hasSearched: boolean;
  hotelResults: HotelSummary[];
  hotelCityId: number;
  hotelDestinationQuery: string;
  selectedHotelId: number;
  hotelDestinationScopeConfirmed: boolean;
  hotelCheckIn: string;
  hotelCheckOut: string;
  hotelAdults: number;
  hotelChildAges: number[];
  sharedHotelRoomCount: number;
  sharedHotelRoomTravellers: HotelRoomTravellerSelection[];
  localRoomSelectionsByHotel: Record<number, Array<{ boardingKey: string; roomKey: string }>>;
  hotelAvailabilitySignatureByHotel: Record<number, string>;
  hotelResultsView: HotelResultsView;
  hotelResultsSort: HotelResultsSort;
  hotelResultsPageSize: number;
  hotelResultsSearchTerm: string;
  selectedHotelResultBoardings: string[];
  selectedHotelResultStars: string[];
  selectedHotelResultFacilities: string[];
  hotelResultsOnlyPromotions: boolean;
  hotelResultsOnlyRefundable: boolean;
  hotelResultsOnlyWithPrice: boolean;
  hotelResultsOnlyOnRequest: boolean;
  hotelResultsBudgetMin: number | null;
  hotelResultsBudgetMax: number | null;
  hotelSearchFallbackNotice: string;
  hotelCountsByCityCache: Record<number, number>;
};

function buildHomeHotelSearchSignature(searchParams: URLSearchParams) {
  const params = new URLSearchParams();
  params.set("mode", String(searchParams.get("mode") || "").trim());
  params.set("cityId", String(searchParams.get("cityId") || "").trim());
  params.set("hotelId", String(searchParams.get("hotelId") || "").trim());
  params.set("checkIn", String(searchParams.get("checkIn") || "").trim());
  params.set("checkOut", String(searchParams.get("checkOut") || "").trim());
  params.set("adults", String(searchParams.get("adults") || "").trim());
  params.set("children", String(searchParams.get("children") || "").trim());
  params.set("q", String(searchParams.get("q") || "").trim());
  params.set("hotelListQ", String(searchParams.get("hotelListQ") || "").trim());
  params.set("hotelSort", String(searchParams.get("hotelSort") || "").trim());
  params.set("hotelView", String(searchParams.get("hotelView") || "").trim());
  params.set("hotelPageSize", String(searchParams.get("hotelPageSize") || "").trim());
  params.set("hotelPromo", String(searchParams.get("hotelPromo") || "").trim());
  params.set("hotelRefundable", String(searchParams.get("hotelRefundable") || "").trim());
  params.set("hotelWithPrice", String(searchParams.get("hotelWithPrice") || "").trim());
  params.set("hotelOnRequest", String(searchParams.get("hotelOnRequest") || "").trim());
  params.set("hotelBudgetMin", String(searchParams.get("hotelBudgetMin") || "").trim());
  params.set("hotelBudgetMax", String(searchParams.get("hotelBudgetMax") || "").trim());
  searchParams.getAll("hotelBoarding").forEach((value) => params.append("hotelBoarding", String(value || "").trim()));
  searchParams.getAll("hotelStar").forEach((value) => params.append("hotelStar", String(value || "").trim()));
  searchParams.getAll("hotelFacility").forEach((value) => params.append("hotelFacility", String(value || "").trim()));
  return params.toString();
}

function readHotelFilterArray(searchParams: URLSearchParams, key: string) {
  return searchParams.getAll(key).map((item) => String(item || "").trim()).filter(Boolean);
}

function saveHomeHotelSearchCache(payload: CachedHomeHotelSearch) {
  try {
    sessionStorage.setItem(HOTEL_SEARCH_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

function readHomeHotelSearchCache(): CachedHomeHotelSearch | null {
  try {
    const raw = sessionStorage.getItem(HOTEL_SEARCH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as CachedHomeHotelSearch;
  } catch {
    return null;
  }
}

type HotelTravellerIdentity = {
  firstName: string;
  lastName: string;
};

type HotelDestinationTab = "destinations" | "top" | "villes" | "hotels";
type HotelResultsSort = "recommended" | "price_asc" | "price_desc" | "stars_desc" | "stars_asc" | "name_asc";
type HotelResultsView = "grid" | "list";
type HotelResultsFilterPanel = null | "popular" | "boarding" | "category" | "budget" | "services" | "parameters" | "sort" | "page_size";

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
  if (normalized.includes("residence")) return "residence";
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
  if (raw === "appartement" || raw === "residence" || raw === "villa_maison" || raw === "studio" || raw === "immeuble" || raw === "autre") {
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
  if (selectedMainTypes.includes("residence")) {
    const residenceKey = buildMainTypeSubTypeMatchKey("residence", displayLabel);
    return residenceKey ? [residenceKey] : [];
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
    "residence",
    "villa",
    "maison",
    "villa maison",
    "bungalow",
  ].includes(normalizedPlainCategory);
  const shouldInferSPlusSubtype = inferredMainType === "appartement" || inferredMainType === "residence" || inferredMainType === "villa_maison";
  const mainLabelByType: Record<PropertyMainType, string> = {
    appartement: "Appartement",
    residence: "Residence",
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

const DEFAULT_HOTEL_ROOM_COUNT = 1;
const HOTEL_DESTINATION_PAGE_SIZE = 20;
const HOTEL_RESULTS_PAGE_SIZE_OPTIONS = [12, 30, 51, 102] as const;

function normalizeHotelResultsToken(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildHotelMapsLink(hotel: HotelSummary) {
  const latitude = String(hotel?.Localization?.Latitude || "").trim();
  const longitude = String(hotel?.Localization?.Longitude || "").trim();
  if (!latitude || !longitude) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
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
  forcedPartnerAgencyId?: string | null;
  forcedPartnerAgencyMarginMultiplier?: number | null;
  publicPartnerSlug?: string | null;
  partnerBrandName?: string | null;
  partnerBrandLogoUrl?: string | null;
};

export default function HomePage({
  forcedAmicaleId,
  forcedPartnerAgencyId,
  forcedPartnerAgencyMarginMultiplier,
  publicPartnerSlug,
  partnerBrandName,
  partnerBrandLogoUrl,
}: HomePageProps = {}) {
  const INITIAL_VISIBLE_PROPERTIES = 10;
  const hotelDefaults = useMemo(() => buildDefaultHotelSearch(), []);
  // Use shared context for properties
  const { properties, zones, modePriorities, loading } = useProperties();
  const { user, login, isLoading: authLoading } = useAuth();
  
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const resultsRef = useRef<HTMLDivElement>(null);
  const flashSectionRef = useRef<HTMLDivElement>(null);
  const filterControlsRef = useRef<HTMLDivElement>(null);
  const locationDesktopPopupRef = useRef<HTMLDivElement>(null);
  const locationMobilePopupRef = useRef<HTMLDivElement>(null);
  const hotelDestinationDesktopListRef = useRef<HTMLDivElement>(null);
  const hotelDestinationMobileListRef = useRef<HTMLDivElement>(null);
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
    normalizeResidenceExclusiveMainTypes(
      parseCsvParam(searchParams.get("mainTypes") || searchParams.get("mainType")) as PropertyMainType[],
      (String(searchParams.get("mainType") || "").trim() as PropertyMainType | "") || undefined
    )
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
  const [showChatbotWidget, setShowChatbotWidget] = useState(false);
  const [locationPays, setLocationPays] = useState("Tunisie");
  const [locationGouvernerat, setLocationGouvernerat] = useState("");
  const [locationRegion, setLocationRegion] = useState("");
  const [locationZone, setLocationZone] = useState("");
  const [openLocationLevel, setOpenLocationLevel] = useState<null | "pays" | "gouvernerat" | "region" | "zone">(null);
  const [locationSelectionStep, setLocationSelectionStep] = useState<"gouvernerat" | "region" | "zone">("gouvernerat");
  const [draftSelectedGouvernerats, setDraftSelectedGouvernerats] = useState<string[]>([]);
  const [draftSelectedRegions, setDraftSelectedRegions] = useState<string[]>([]);
  const [draftSelectedZones, setDraftSelectedZones] = useState<string[]>([]);
  const [selectedSeasideOptions, setSelectedSeasideOptions] = useState<HomeSeasideOptionKey[]>([]);
  const [selectedComfortOptions, setSelectedComfortOptions] = useState<HomeComfortOptionKey[]>([]);
  const [visiblePropertiesCount, setVisiblePropertiesCount] = useState(INITIAL_VISIBLE_PROPERTIES);
  const [showAllProperties, setShowAllProperties] = useState(false);
  const propertiesAutoLoadTriggerRef = useRef<HTMLDivElement | null>(null);
  const lastAutoLoadedPropertiesCountRef = useRef(0);
  const hotelInitialSearchDoneRef = useRef(false);
  const hotelDirectoryLoadedCityIdRef = useRef<number | null>(null);
  const hotelShouldAutoSearchFromUrlRef = useRef(
    String(searchParams.get("mode") || "").trim() === "hotellerie"
      && Number(searchParams.get("cityId") || 0) > 0
      && hasValidHotelSearchDates(
        String(searchParams.get("checkIn") || "").trim(),
        String(searchParams.get("checkOut") || "").trim(),
      )
  );
  const [hotelConfigReady, setHotelConfigReady] = useState<boolean | null>(null);

  const [hotelProviderError, setHotelProviderError] = useState("");
  const [hotelCities, setHotelCities] = useState<HotelCity[]>([]);
  const [hotelResults, setHotelResults] = useState<HotelSummary[]>([]);
  const [hotelResultsSearchTerm, setHotelResultsSearchTerm] = useState(() => String(searchParams.get("hotelListQ") || "").trim());
  const [hotelResultsSort, setHotelResultsSort] = useState<HotelResultsSort>(() => {
    const raw = String(searchParams.get("hotelSort") || "").trim();
    return ["recommended", "price_asc", "price_desc", "stars_desc", "stars_asc", "name_asc"].includes(raw) ? raw as HotelResultsSort : "recommended";
  });
  const [hotelResultsView, setHotelResultsView] = useState<HotelResultsView>(() => (
    String(searchParams.get("hotelView") || "").trim() === "list" ? "list" : "grid"
  ));
  const [isMobileHotelSearchOverlayViewport, setIsMobileHotelSearchOverlayViewport] = useState<boolean>(() => (
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  ));
  const [isMobileHotelResultsViewport, setIsMobileHotelResultsViewport] = useState<boolean>(() => (
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  ));
  const [expandedHotelResultDetailsById, setExpandedHotelResultDetailsById] = useState<Record<number, boolean>>({});
  const [hotelResultsPageSize, setHotelResultsPageSize] = useState<number>(() => {
    const raw = Number(searchParams.get("hotelPageSize") || 12);
    return HOTEL_RESULTS_PAGE_SIZE_OPTIONS.includes(raw) ? raw : 12;
  });
  const [hotelResultsFilterPanel, setHotelResultsFilterPanel] = useState<HotelResultsFilterPanel>(null);
  const [selectedHotelResultBoardings, setSelectedHotelResultBoardings] = useState<string[]>(() => readHotelFilterArray(searchParams, "hotelBoarding"));
  const [selectedHotelResultStars, setSelectedHotelResultStars] = useState<string[]>(() => readHotelFilterArray(searchParams, "hotelStar"));
  const [selectedHotelResultFacilities, setSelectedHotelResultFacilities] = useState<string[]>(() => readHotelFilterArray(searchParams, "hotelFacility"));
  const [hotelResultsOnlyPromotions, setHotelResultsOnlyPromotions] = useState(() => String(searchParams.get("hotelPromo") || "").trim() === "1");
  const [hotelResultsOnlyRefundable, setHotelResultsOnlyRefundable] = useState(() => String(searchParams.get("hotelRefundable") || "").trim() === "1");
  const [hotelResultsOnlyWithPrice, setHotelResultsOnlyWithPrice] = useState(() => String(searchParams.get("hotelWithPrice") || "").trim() === "1");
  const [hotelResultsOnlyOnRequest, setHotelResultsOnlyOnRequest] = useState(() => String(searchParams.get("hotelOnRequest") || "").trim() === "1");
  const [hotelResultsBudgetMin, setHotelResultsBudgetMin] = useState<number | null>(() => {
    const raw = Number(searchParams.get("hotelBudgetMin") || "");
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  });
  const [hotelResultsBudgetMax, setHotelResultsBudgetMax] = useState<number | null>(() => {
    const raw = Number(searchParams.get("hotelBudgetMax") || "");
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  });
  const [hotelSearchFallbackNotice, setHotelSearchFallbackNotice] = useState("");
  const [loadingHotelCities, setLoadingHotelCities] = useState(false);
  const [loadingHotelResults, setLoadingHotelResults] = useState(false);
  const [checkingAvailabilityHotelId, setCheckingAvailabilityHotelId] = useState<number | null>(null);
  const [loadingHotelsByCity, setLoadingHotelsByCity] = useState(false);
  const [hotelCityId, setHotelCityId] = useState<number>(() => Number(searchParams.get("cityId") || 0) || 0);
  const [hotelDestinationQuery, setHotelDestinationQuery] = useState(() => searchParams.get("q") || "");
  const effectiveHotelResultsView: HotelResultsView = isMobileHotelResultsViewport ? "grid" : hotelResultsView;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncViewport = () => setIsMobileHotelResultsViewport(window.innerWidth < 1024);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncViewport = () => setIsMobileHotelSearchOverlayViewport(window.innerWidth < 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);
  const [selectedHotelId, setSelectedHotelId] = useState<number>(() => Number(searchParams.get("hotelId") || 0) || 0);
  const [hotelDestinationOpen, setHotelDestinationOpen] = useState(false);
  const [hotelDestinationTab, setHotelDestinationTab] = useState<HotelDestinationTab>("destinations");
  const [hotelDestinationScopeConfirmed, setHotelDestinationScopeConfirmed] = useState(false);
  const [visibleHotelDestinationCount, setVisibleHotelDestinationCount] = useState(HOTEL_DESTINATION_PAGE_SIZE);
  const [hotelCheckIn, setHotelCheckIn] = useState(() => searchParams.get("checkIn") || hotelDefaults.checkIn);
  const [hotelCheckOut, setHotelCheckOut] = useState(() => searchParams.get("checkOut") || hotelDefaults.checkOut);
  const [hotelAdults, setHotelAdults] = useState(() => {
    const rawAdults = String(searchParams.get("adults") || "").trim();
    if (!rawAdults) return hotelDefaults.adults;
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
  const [hotelCountsByCityCache, setHotelCountsByCityCache] = useState<Record<number, number>>({});
  const [sharedHotelRoomCount, setSharedHotelRoomCount] = useState(DEFAULT_HOTEL_ROOM_COUNT);
  const [localRoomSelectionsByHotel, setLocalRoomSelectionsByHotel] = useState<Record<number, Array<{ boardingKey: string; roomKey: string }>>>({});
  const [sharedHotelRoomTravellers, setSharedHotelRoomTravellers] = useState<HotelRoomTravellerSelection[]>(() =>
    buildHotelRoomTravellersFromFilters(DEFAULT_HOTEL_ROOM_COUNT, hotelDefaults.adults, hotelDefaults.childAges)
  );
  const [hotelAvailabilitySignatureByHotel, setHotelAvailabilitySignatureByHotel] = useState<Record<number, string>>({});
  const [hotelCriteriaGlowTarget, setHotelCriteriaGlowTarget] = useState<null | "dates" | "chambres" | "voyageurs" | "action">(null);
  const [hotelTravellersOpen, setHotelTravellersOpen] = useState(false);
  const [hotelCalendarOpen, setHotelCalendarOpen] = useState(false);
  const [hotelCalendarMonth, setHotelCalendarMonth] = useState<Date>(() => {
    const rawCheckIn = String(searchParams.get("checkIn") || hotelDefaults.checkIn || "").trim();
    const parsed = rawCheckIn ? parseISO(rawCheckIn) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  });
  const [hotelCalendarCheckInDraft, setHotelCalendarCheckInDraft] = useState<Date | null>(() => {
    const rawCheckIn = String(searchParams.get("checkIn") || hotelDefaults.checkIn || "").trim();
    if (!rawCheckIn) return null;
    const parsed = parseISO(rawCheckIn);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });
  const [hotelCalendarCheckOutDraft, setHotelCalendarCheckOutDraft] = useState<Date | null>(() => {
    const rawCheckOut = String(searchParams.get("checkOut") || hotelDefaults.checkOut || "").trim();
    if (!rawCheckOut) return null;
    const parsed = parseISO(rawCheckOut);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });
  const [hotelSearchLoadingModal, setHotelSearchLoadingModal] = useState(false);
  const [hotelTravellerAccordionOpen, setHotelTravellerAccordionOpen] = useState("adult-0");
  const [hotelAmicaleOptions, setHotelAmicaleOptions] = useState<Array<{ id: string; name: string; code: string; logoUrl?: string; hotelMarkupPercent?: number }>>([]);
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
    paymentMode: "standard" | "amicale";
    amicaleSelectionId: string;
    amicaleFullName: string;
    amicaleMatricule: string;
    amicalePhone: string;
    amicaleCode: string;
    phone: string;
    note: string;
  }>(null);
  const [submittingHotelReserve, setSubmittingHotelReserve] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [providers, setProviders] = useState({ google: false, facebook: false, apple: false, phoneOtp: false, emailOtp: false, passkey: true });
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
    cinImageRectoUrl: "",
    cinImageVersoUrl: "",
  });
  const currentHotelSearchSignature = useMemo(
    () => buildHomeHotelSearchSignature(searchParams),
    [searchParams]
  );
  useEffect(() => {
    const shouldLockBodyScroll =
      hotelCalendarOpen
      || showLoginPrompt
      || Boolean(hotelReserveModal)
      || hotelSearchLoadingModal
      || (isMobileHotelSearchOverlayViewport && (hotelDestinationOpen || hotelTravellersOpen));
    if (!shouldLockBodyScroll) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [
    hotelCalendarOpen,
    showLoginPrompt,
    hotelReserveModal,
    hotelSearchLoadingModal,
    hotelDestinationOpen,
    hotelTravellersOpen,
    isMobileHotelSearchOverlayViewport,
  ]);
  useEffect(() => {
    if (showChatbotWidget) return;
    const idleCallback = window.requestIdleCallback?.(() => setShowChatbotWidget(true), { timeout: 1800 });
    const timeoutId = window.setTimeout(() => setShowChatbotWidget(true), 2200);
    return () => {
      if (typeof idleCallback === "number") {
        window.cancelIdleCallback?.(idleCallback);
      }
      window.clearTimeout(timeoutId);
    };
  }, [showChatbotWidget]);
  const activeAmicaleId = String(forcedAmicaleId || searchParams.get("amicale") || "").trim() || null;
  const activePartnerAgencyId = String(forcedPartnerAgencyId || searchParams.get("partner") || "").trim() || null;
  const activePublicPartnerSlug = String(publicPartnerSlug || searchParams.get("publicPartnerSlug") || "").trim() || null;
  const activePublicPartnerKind = forcedAmicaleId
    ? "amicale"
    : forcedPartnerAgencyId
      ? "partner_agency"
      : (String(searchParams.get("publicPartnerKind") || "").trim() || null);
  const activeAmicaleHotelMarkupPercent = useMemo(() => {
    if (!activeAmicaleId) return 0;
    const matched = hotelAmicaleOptions.find((item) => item.id === activeAmicaleId) || null;
    return Number(matched?.hotelMarkupPercent || 0);
  }, [activeAmicaleId, hotelAmicaleOptions]);
  const isAmicaleHotelFlow = Boolean(activeAmicaleId);
  const activePartnerAgencyMarginMultiplier = (() => {
    const raw = forcedPartnerAgencyMarginMultiplier ?? Number(searchParams.get("partnerMargin") || 0);
    return Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;
  })();
  const activePartnerBrandName = String(partnerBrandName || "").trim() || null;
  const activePartnerBrandLogoUrl = String(partnerBrandLogoUrl || "").trim()
    ? resolveMediaUrl(String(partnerBrandLogoUrl || "").trim())
    : null;
  const publicPartnerQueryString = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("amicale");
    params.delete("partner");
    params.delete("partnerMargin");
    if (activePublicPartnerSlug) {
      params.set("publicPartnerSlug", activePublicPartnerSlug);
      if (activePublicPartnerKind) params.set("publicPartnerKind", activePublicPartnerKind);
      else params.delete("publicPartnerKind");
    } else {
      params.delete("publicPartnerSlug");
      params.delete("publicPartnerKind");
    }
    return params.toString();
  }, [activePublicPartnerKind, activePublicPartnerSlug, searchParams]);
  const publicListingLink = useMemo(() => {
    if (!activePublicPartnerSlug) {
      return `/logements?mode=${encodeURIComponent(selectedMode)}`;
    }
    return publicPartnerQueryString ? `/${activePublicPartnerSlug}?${publicPartnerQueryString}` : `/${activePublicPartnerSlug}`;
  }, [activePublicPartnerSlug, publicPartnerQueryString, selectedMode]);
  const applyAmicaleParam = (params: URLSearchParams) => {
    params.delete("amicale");
    params.delete("partner");
    params.delete("partnerMargin");
    params.delete("publicPartnerSlug");
    params.delete("publicPartnerKind");
    if (activePublicPartnerSlug) {
      params.set("publicPartnerSlug", activePublicPartnerSlug);
      if (activePublicPartnerKind) params.set("publicPartnerKind", activePublicPartnerKind);
      return params;
    }
    if (activeAmicaleId) {
      params.set("amicale", activeAmicaleId);
    } else {
      params.delete("amicale");
    }
    if (activePartnerAgencyId) {
      params.set("partner", activePartnerAgencyId);
    } else {
      params.delete("partner");
    }
    return params;
  };
  useEffect(() => {
    if (!activeAmicaleId) return;
    let cancelled = false;
    void fetchAmicalesPublic()
      .then((rows) => {
        if (cancelled) return;
        setHotelAmicaleOptions(
          rows.map((item) => ({
            id: String(item.id || "").trim(),
            name: String(item.name || "").trim(),
            code: String(item.code || "").trim(),
            logoUrl: item.logoUrl ? String(item.logoUrl).trim() : undefined,
            hotelMarkupPercent: Number(item.hotelMarkupPercent || 0),
          }))
        );
      })
      .catch(() => {
        if (!cancelled) {
          setHotelAmicaleOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeAmicaleId]);

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
  const isFlashLanding = routerLocation.pathname === "/ventes_flash";
  const isHotelMode = selectedMode === "hotellerie";
  const showPartnerHeroBranding = Boolean(activePublicPartnerSlug && activePartnerBrandLogoUrl && !isHotelMode);
  const selectedHotelCity = useMemo(
    () => hotelCities.find((item) => Number(item.Id) === Number(hotelCityId)) || null,
    [hotelCities, hotelCityId]
  );
  const hotelDestinationNeedle = normalizeLocationMatchToken(hotelDestinationQuery);
  const hotelDestinationHotelNeedle = useMemo(() => {
    if (selectedHotelId > 0) return hotelDestinationNeedle;
    if (
      hotelCityId > 0
      && hotelDestinationNeedle
      && hotelDestinationNeedle === normalizeLocationMatchToken(selectedHotelCity?.Name || "")
    ) {
      return "";
    }
    return hotelDestinationNeedle;
  }, [hotelCityId, hotelDestinationNeedle, selectedHotelCity, selectedHotelId]);
  const hotelCitiesSorted = useMemo(
    () => [...hotelCities].sort((left, right) => String(left?.Name || "").localeCompare(String(right?.Name || ""), "fr")),
    [hotelCities]
  );
  const hotelCountsByCityId = useMemo(() => {
    const counts: Record<number, number> = { ...hotelCountsByCityCache };
    hotelsByCity.forEach((hotel) => {
      const cityId = Number(hotel?.City?.Id || 0);
      if (cityId <= 0) return;
      counts[cityId] = (counts[cityId] || 0) + 1;
    });
    return counts;
  }, [hotelCountsByCityCache, hotelsByCity]);
  const filteredHotelCities = useMemo(
    () =>
      hotelCitiesSorted
        .filter((city) => !hotelDestinationNeedle || normalizeLocationMatchToken(city.Name).includes(hotelDestinationNeedle)),
    [hotelCitiesSorted, hotelDestinationNeedle]
  );
  const featuredHotelCities = useMemo(
    () => filteredHotelCities,
    [filteredHotelCities]
  );
  const getHotelCityCountLabel = useCallback((cityId: number) => {
    const normalizedCityId = Number(cityId) || 0;
    if (normalizedCityId <= 0) return "";
    if (!Object.prototype.hasOwnProperty.call(hotelCountsByCityId, normalizedCityId)) return "";
    return `(${hotelCountsByCityId[normalizedCityId] || 0})`;
  }, [hotelCountsByCityId]);
  const filteredHotelsByCity = useMemo(
    () =>
      hotelsByCity
        .filter((hotel) => {
          const matchesCity =
            Number(hotelCityId) <= 0 || Number(hotel?.City?.Id || 0) === Number(hotelCityId);
          const matchesQuery =
            !hotelDestinationHotelNeedle ||
            normalizeLocationMatchToken(hotel.Name).includes(hotelDestinationHotelNeedle) ||
            normalizeLocationMatchToken(hotel?.City?.Name).includes(hotelDestinationHotelNeedle);
          return matchesCity && matchesQuery;
        })
        .sort((left, right) => {
          const leftSelected = Number(left?.Id || 0) === Number(selectedHotelId) ? 1 : 0;
          const rightSelected = Number(right?.Id || 0) === Number(selectedHotelId) ? 1 : 0;
          if (leftSelected !== rightSelected) return rightSelected - leftSelected;
          const leftRecommended = Number(left?.Recommended || 0);
          const rightRecommended = Number(right?.Recommended || 0);
          if (leftRecommended !== rightRecommended) return rightRecommended - leftRecommended;
          return String(left?.Name || "").localeCompare(String(right?.Name || ""), "fr");
        }),
    [hotelsByCity, hotelCityId, hotelDestinationHotelNeedle, selectedHotelId]
  );
  const visibleFilteredHotelsByCity = useMemo(
    () => filteredHotelsByCity.slice(0, visibleHotelDestinationCount),
    [filteredHotelsByCity, visibleHotelDestinationCount]
  );
  const featuredHotels = useMemo(
    () =>
      [...filteredHotelsByCity]
        .sort((left, right) => {
          const leftRecommended = Number(left?.Recommended || 0);
          const rightRecommended = Number(right?.Recommended || 0);
          if (leftRecommended !== rightRecommended) return rightRecommended - leftRecommended;
          const leftPrice = extractHotelMinPrice(left, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow) ?? Number.POSITIVE_INFINITY;
          const rightPrice = extractHotelMinPrice(right, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow) ?? Number.POSITIVE_INFINITY;
          if (leftPrice !== rightPrice) return leftPrice - rightPrice;
          return String(left?.Name || "").localeCompare(String(right?.Name || ""), "fr");
        })
        .slice(0, 10),
    [activeAmicaleHotelMarkupPercent, filteredHotelsByCity, isAmicaleHotelFlow]
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
  const hotelPublicErrorMessage = hotelProviderError ? getClientFacingHotelError(hotelProviderError) : "";
  const hotelResultBoardingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    hotelResults.forEach((hotel) => {
      extractHotelBoardingNames(hotel).forEach((boarding) => {
        counts.set(boarding, (counts.get(boarding) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
  }, [hotelResults]);
  const hotelResultStarCounts = useMemo(() => {
    const counts = new Map<string, number>();
    hotelResults.forEach((hotel) => {
      const star = String(hotel?.Star ?? "").trim();
      if (!star) return;
      counts.set(star, (counts.get(star) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => Number(b.label) - Number(a.label));
  }, [hotelResults]);
  const hotelResultFacilityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    hotelResults.forEach((hotel) => {
      getHotelFacilityTitles(hotel.Facilities, 12).forEach((facility) => {
        counts.set(facility, (counts.get(facility) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"))
      .slice(0, 12);
  }, [hotelResults]);
  const hotelResultPriceBounds = useMemo(() => {
    const prices = hotelResults
      .map((hotel) => extractHotelMinPrice(hotel, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow))
      .filter((price): price is number => Number.isFinite(price) && Number(price) > 0);
    if (prices.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [activeAmicaleHotelMarkupPercent, hotelResults, isAmicaleHotelFlow]);
  const filteredHotelResults = useMemo(() => {
    const keyword = normalizeHotelResultsToken(hotelResultsSearchTerm);
    const budgetMin = hotelResultsBudgetMin ?? hotelResultPriceBounds.min;
    const budgetMax = hotelResultsBudgetMax ?? hotelResultPriceBounds.max;

    return hotelResults.filter((hotel) => {
      const minPrice = extractHotelMinPrice(hotel, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow);
      const roomOffers = flattenHotelRoomOffers(hotel);
      const boardingNames = extractHotelBoardingNames(hotel);
      const facilityTitles = getHotelFacilityTitles(hotel.Facilities, 12);
      const hotelTokens = [
        hotel.Name,
        hotel.City?.Name,
        hotel.ShortDescription,
        hotel.HotelDescription,
        hotel.Adress,
        ...boardingNames,
        ...facilityTitles,
      ]
        .map((value) => normalizeHotelResultsToken(value))
        .filter(Boolean);

      if (keyword && !hotelTokens.some((value) => value.includes(keyword))) return false;
      if (selectedHotelResultBoardings.length > 0 && !selectedHotelResultBoardings.some((item) => boardingNames.includes(item))) return false;
      if (selectedHotelResultStars.length > 0 && !selectedHotelResultStars.includes(String(hotel?.Star ?? "").trim())) return false;
      if (selectedHotelResultFacilities.length > 0 && !selectedHotelResultFacilities.every((item) => facilityTitles.includes(item))) return false;
      if (hotelResultsOnlyPromotions && !hasHotelPromotion(hotel)) return false;
      if (hotelResultsOnlyRefundable && !roomOffers.some((offer) => !offer.room?.NotRefundable)) return false;
      if (hotelResultsOnlyWithPrice && minPrice === null) return false;
      if (hotelResultsOnlyOnRequest && !roomOffers.some((offer) => Boolean(offer.room?.OnRequest || offer.room?.StopReservation))) return false;
      if (minPrice !== null && hotelResultPriceBounds.max > 0 && (minPrice < budgetMin || minPrice > budgetMax)) return false;
      if (minPrice === null && (hotelResultsBudgetMin !== null || hotelResultsBudgetMax !== null)) return false;
      return true;
    });
  }, [
    hotelResults,
    hotelResultsSearchTerm,
    hotelResultsBudgetMax,
    hotelResultsBudgetMin,
    hotelResultsOnlyOnRequest,
    hotelResultsOnlyPromotions,
    hotelResultsOnlyRefundable,
    hotelResultsOnlyWithPrice,
    hotelResultPriceBounds.max,
    hotelResultPriceBounds.min,
    activeAmicaleHotelMarkupPercent,
    isAmicaleHotelFlow,
    selectedHotelResultBoardings,
    selectedHotelResultFacilities,
    selectedHotelResultStars,
  ]);
  const sortedHotelResults = useMemo(
    () => [...filteredHotelResults].sort((left, right) => {
      const leftSelected = Number(left?.Id || 0) === Number(selectedHotelId) ? 1 : 0;
      const rightSelected = Number(right?.Id || 0) === Number(selectedHotelId) ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      const leftPromotion = hasHotelPromotion(left) ? 1 : 0;
      const rightPromotion = hasHotelPromotion(right) ? 1 : 0;
      const leftRecommended = Number(left?.Recommended || 0);
      const rightRecommended = Number(right?.Recommended || 0);
      const leftPrice = extractHotelMinPrice(left, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow) ?? Number.POSITIVE_INFINITY;
      const rightPrice = extractHotelMinPrice(right, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow) ?? Number.POSITIVE_INFINITY;
      const leftStar = Number(left?.Star || 0);
      const rightStar = Number(right?.Star || 0);

      switch (hotelResultsSort) {
        case "price_asc":
          if (leftPrice !== rightPrice) return leftPrice - rightPrice;
          break;
        case "price_desc":
          if (leftPrice !== rightPrice) return rightPrice - leftPrice;
          break;
        case "stars_desc":
          if (leftStar !== rightStar) return rightStar - leftStar;
          break;
        case "stars_asc":
          if (leftStar !== rightStar) return leftStar - rightStar;
          break;
        case "name_asc":
          return String(left?.Name || "").localeCompare(String(right?.Name || ""), "fr");
        case "recommended":
        default:
          if (leftPromotion !== rightPromotion) return rightPromotion - leftPromotion;
          if (leftRecommended !== rightRecommended) return rightRecommended - leftRecommended;
          if (leftPrice !== rightPrice) return leftPrice - rightPrice;
          break;
      }

      if (leftRecommended !== rightRecommended) return rightRecommended - leftRecommended;
      if (leftPrice !== rightPrice) return leftPrice - rightPrice;
      return String(left?.Name || "").localeCompare(String(right?.Name || ""), "fr");
    }),
    [activeAmicaleHotelMarkupPercent, filteredHotelResults, hotelResultsSort, isAmicaleHotelFlow, selectedHotelId]
  );
  const visibleHotelResults = useMemo(
    () => sortedHotelResults.slice(0, hotelResultsPageSize),
    [sortedHotelResults, hotelResultsPageSize]
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
  const hotelTravellersLabel = `${sharedHotelRoomCount} chambre${sharedHotelRoomCount > 1 ? "s" : ""} - ${hotelAdults} adulte${hotelAdults > 1 ? "s" : ""} - ${hotelChildAges.length} enfant${hotelChildAges.length > 1 ? "s" : ""}`;
  const hotelSearchInfoMessage =
    hasCompleteHotelCriteria
    && selectedHotelId > 0
    && hasSearched
    && !loadingHotelResults
    && sortedHotelResults.length === 0
      ? selectedHotelUnavailableMessage
      : "";
  const hotelDestinationSelectionLabel = selectedHotelCity?.Name || "";
  const hotelDestinationFieldLabel = selectedHotelId > 0
    ? (selectedHotelLabel || hotelDestinationSelectionLabel)
    : hotelDestinationSelectionLabel;
  const hasConfirmedHotelDestinationChoice = selectedHotelId > 0 || hotelDestinationScopeConfirmed;
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
  const findZoneForRegion = (regionValue?: string | null) => {
    const targetRegion = normalizeLocationToken(regionValue);
    if (!targetRegion) return null;
    return normalizedZones.find((zone) => {
      const sameRegion = isSameLocationToken(zone.region, regionValue);
      if (!sameRegion) return false;
      if (locationPays && !isSameLocationToken(locationPays, zone.pays)) return false;
      if (locationGouvernerat && !isSameLocationToken(locationGouvernerat, zone.gouvernerat)) return false;
      return true;
    }) || normalizedZones.find((zone) => isSameLocationToken(zone.region, regionValue)) || null;
  };
  const findZoneForQuartier = (zoneValue?: string | null) => {
    const targetZone = normalizeLocationToken(zoneValue);
    if (!targetZone) return null;
    return normalizedZones.find((zone) => {
      const sameZone = isSameLocationToken(zone.quartier || zone.nom, zoneValue);
      if (!sameZone) return false;
      if (locationPays && !isSameLocationToken(locationPays, zone.pays)) return false;
      if (locationGouvernerat && !isSameLocationToken(locationGouvernerat, zone.gouvernerat)) return false;
      if (locationRegion && !isSameLocationToken(locationRegion, zone.region)) return false;
      return true;
    }) || normalizedZones.find((zone) => isSameLocationToken(zone.quartier || zone.nom, zoneValue)) || null;
  };
  const applyGovernorateSelection = (value: string) => {
    setLocationGouvernerat(value);
    setDraftSelectedGouvernerats((prev) => {
      const next = toggleStringInList(prev, value);
      const nextRegions = draftSelectedRegions.filter((region) =>
        normalizedZones.some((zone) =>
          isTokenInList(next, zone.gouvernerat)
          && isSameLocationToken(zone.region, region)
        )
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
    setDraftSelectedGouvernerats([]);
    setDraftSelectedRegions([]);
    setDraftSelectedZones([]);
    setLocationPays("Tunisie");
    setLocationGouvernerat("");
    setLocationRegion("");
    setLocationZone("");
    setLocationSelectionStep("gouvernerat");
  };
  const openLocationSelector = () => {
    setDraftSelectedLocations(selectedLocations);
    setLocationPays("Tunisie");
    hydrateLocationDraftsFromSelection(selectedLocations);
    setOpenLocationLevel(locationZone ? "zone" : locationRegion ? "region" : "gouvernerat");
    setShowLocationDropdown(true);
  };
  const toggleDraftLocationSelection = (value: string) => {
    const nextValue = String(value || "").trim();
    if (!nextValue) return;
    setDraftSelectedLocations((prev) => toggleStringInList(prev, nextValue));
  };
  const resetCurrentLocationPath = () => {
    setLocationGouvernerat("");
    setLocationRegion("");
    setLocationZone("");
    setDraftSelectedGouvernerats([]);
    setDraftSelectedRegions([]);
    setDraftSelectedZones([]);
    setOpenLocationLevel("gouvernerat");
    setLocationSelectionStep("gouvernerat");
  };
  const confirmLocationSelection = () => {
    const zoneLabels = draftSelectedZones.map((zoneName) => {
      const resolvedZone = normalizedZones.find((zone) =>
        (draftSelectedGouvernerats.length === 0 || isTokenInList(draftSelectedGouvernerats, zone.gouvernerat))
        && (draftSelectedRegions.length === 0 || isTokenInList(draftSelectedRegions, zone.region))
        && isSameLocationToken(zone.quartier || zone.nom, zoneName)
      );
      return buildHierarchicalLocationLabel([
        resolvedZone?.gouvernerat || "",
        resolvedZone?.region || "",
        zoneName,
      ]);
    }).filter(Boolean);
    const regionLabels = zoneLabels.length === 0
      ? draftSelectedRegions.map((regionName) => {
          const resolvedZone = normalizedZones.find((zone) =>
            (draftSelectedGouvernerats.length === 0 || isTokenInList(draftSelectedGouvernerats, zone.gouvernerat))
            && isSameLocationToken(zone.region, regionName)
          );
          return buildHierarchicalLocationLabel([
            resolvedZone?.gouvernerat || "",
            regionName,
          ]);
        }).filter(Boolean)
      : [];
    const governorateLabels = zoneLabels.length === 0 && regionLabels.length === 0
      ? draftSelectedGouvernerats
      : [];
    const nextLocations = dedupeHierarchicalLocations([
      ...zoneLabels,
      ...regionLabels,
      ...governorateLabels,
    ]);
    setSelectedLocations(nextLocations);
    setDraftSelectedLocations(nextLocations);
    const firstLabel = nextLocations[0] || "";
    const firstParts = firstLabel.split("/").map((item) => item.trim()).filter(Boolean);
    setLocationGouvernerat(firstParts[0] || "");
    setLocationRegion(firstParts.length >= 2 ? firstParts[firstParts.length - 2] : "");
    setLocationZone(firstParts.length >= 3 ? firstParts[firstParts.length - 1] : "");
    setShowCalendar(true);
    setShowCategoryDropdown(false);
    setShowLocationDropdown(false);
  };
  useEffect(() => {
    const zoneLabels = draftSelectedZones.map((zoneName) => {
      const resolvedZone = normalizedZones.find((zone) =>
        (draftSelectedGouvernerats.length === 0 || isTokenInList(draftSelectedGouvernerats, zone.gouvernerat))
        && (draftSelectedRegions.length === 0 || isTokenInList(draftSelectedRegions, zone.region))
        && isSameLocationToken(zone.quartier || zone.nom, zoneName)
      );
      return buildHierarchicalLocationLabel([
        resolvedZone?.gouvernerat || "",
        resolvedZone?.region || "",
        zoneName,
      ]);
    }).filter(Boolean);
    const regionLabels = zoneLabels.length === 0
      ? draftSelectedRegions.map((regionName) => {
          const resolvedZone = normalizedZones.find((zone) =>
            (draftSelectedGouvernerats.length === 0 || isTokenInList(draftSelectedGouvernerats, zone.gouvernerat))
            && isSameLocationToken(zone.region, regionName)
          );
          return buildHierarchicalLocationLabel([
            resolvedZone?.gouvernerat || "",
            regionName,
          ]);
        }).filter(Boolean)
      : [];
    const governorateLabels = zoneLabels.length === 0 && regionLabels.length === 0
      ? draftSelectedGouvernerats
      : [];
    setDraftSelectedLocations(dedupeHierarchicalLocations([
      ...zoneLabels,
      ...regionLabels,
      ...governorateLabels,
    ]));
  }, [draftSelectedGouvernerats, draftSelectedRegions, draftSelectedZones, normalizedZones]);
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
      if (level === "gouvernerat") return isSameLocationToken(gouv, value);
      if (level === "region") return isSameLocationToken(region, value);
      return isSameLocationToken(zoneName, value);
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
    const groups = new Map<PropertyMainType, GroupedPropertyTypeOption>();
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

    // 3) Complete with sub-types inferred from published properties (fallback when admin row missing).
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
          const explicitResidenceChildSubTypes = nextGroup.subTypes.filter(
            (item) => item.matchMainType && item.matchMainType !== "residence"
          );
          if (explicitResidenceChildSubTypes.length > 0) {
            const explicitResidenceChildKeys = new Set(
              explicitResidenceChildSubTypes
                .map((item) => getCanonicalSubTypeKey(item.label))
                .filter(Boolean)
            );
            nextGroup = {
              ...nextGroup,
              subTypes: nextGroup.subTypes.filter((item) => {
                const canonicalKey = getCanonicalSubTypeKey(item.label);
                if (!canonicalKey) return false;
                if (item.matchMainType && item.matchMainType !== "residence") return true;
                return !explicitResidenceChildKeys.has(canonicalKey);
              }),
            };
            nextGroup = {
              ...nextGroup,
              subTypes: nextGroup.subTypes.filter(
                (item) => item.matchMainType && item.matchMainType !== "residence"
              ),
            };
          }
        }
        return nextGroup;
      })
      .filter((group) => group.subTypes.length > 0 || group.imageUrl !== TYPE_FALLBACK_IMAGE)
      .sort((a, b) => MAIN_TYPE_DISPLAY_ORDER.indexOf(a.mainType) - MAIN_TYPE_DISPLAY_ORDER.indexOf(b.mainType));
  }, [availableTypeOptions, modeProperties, selectedMode, typeFilterImageRows]);
  const secondaryTypeOptions = useMemo(() => {
    if (selectedMainTypes.length === 0) return availableTypeOptions;
    const merged = new Map<string, GroupedPropertySubType>();
    groupedTypeOptions
      .filter((group) => selectedMainTypes.includes(group.mainType))
      .forEach((group) => {
        group.subTypes.forEach((subType) => {
          const key = getGroupedSubTypeOptionKey(group.mainType, subType);
          if (!merged.has(key)) {
            merged.set(key, {
              ...subType,
              selectionScope: getGroupedSubTypeSelectionScope(group.mainType, subType),
            });
          }
        });
      });
    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [availableTypeOptions, groupedTypeOptions, selectedMainTypes]);
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
  const draftSecondaryTypeOptions = useMemo(() => {
    if (!draftMainType) return availableTypeOptions;
    const selectedGroup = groupedTypeOptions.find((group) => group.mainType === draftMainType);
    return selectedGroup?.subTypes || [];
  }, [availableTypeOptions, groupedTypeOptions, draftMainType]);
  const normalizeSelectedCategories = useCallback((categories: string[], mainTypes: PropertyMainType[]) => {
    const next: string[] = [];
    const seenNormalizedCategories = new Set<string>();
    categories.forEach((category) => {
      const rawCategory = String(category || "").trim();
      const scopedMainType = getScopedCategoryMainType(rawCategory);
      const displayCategory = getCategoryDisplayLabel(rawCategory);
      const genericSubTypeKey = getCanonicalSubTypeKey(displayCategory);
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
  const formatResidenceChipCategories = useCallback((categories: string[]) => {
    if (categories.length === 0) return [];
    return Array.from(new Set(
      categories
        .map((category) => getCategoryDisplayLabel(category))
        .filter(Boolean)
    ));
  }, []);
  const selectedMainTypeLabels = selectedMainTypes.map((item) => MAIN_TYPE_LABELS[item]).filter(Boolean);
  const normalizedSelectedCategoryDisplays = useMemo(
    () => normalizedSelectedCategories.map((item) => getCategoryDisplayLabel(item)),
    [normalizedSelectedCategories]
  );
  const selectedTypeSummaryText = selectedMainTypeLabels.length > 0
    ? (normalizedSelectedCategoryDisplays.length > 0 ? `${selectedMainTypeLabels.join(", ")} • ${normalizedSelectedCategoryDisplays.join(", ")}` : selectedMainTypeLabels.join(", "))
    : (normalizedSelectedCategoryDisplays.length > 0 ? normalizedSelectedCategoryDisplays.join(", ") : "Tous les types");
  const selectedTypeImage = useMemo(() => {
    if (normalizedSelectedCategories.length === 1) {
      const selectedCategory = normalizedSelectedCategories[0];
      const selectedCategoryLabel = getCategoryDisplayLabel(selectedCategory);
      const selectedScopedMainType = getScopedCategoryMainType(selectedCategory);
      const selectedMainType = selectedScopedMainType === "residence"
        ? resolveScopedCategoryMatchMainType("residence", selectedCategoryLabel)
        : (selectedScopedMainType || getMainTypeFromCategory(selectedCategoryLabel));
      const selectedCategoryKey = buildMainTypeSubTypeMatchKey(selectedMainType, selectedCategoryLabel);
      const selectedFromAdmin = typeFilterImageRows.find(
        (row) =>
          String(row.mode_bien || "").trim() === selectedMode
          && buildMainTypeSubTypeMatchKey(row.main_type, row.sub_type) === selectedCategoryKey
      );
      if (selectedFromAdmin?.image_url) return selectedFromAdmin.image_url;
      const selected = availableTypeOptions.find((item) => buildMainTypeSubTypeMatchKey(getMainTypeFromCategory(item.label), item.label) === selectedCategoryKey);
      if (selected?.imageUrl) return selected.imageUrl;
    }
    if (selectedMainTypes.length > 0) {
      const group = groupedTypeOptions.find((item) => item.mainType === selectedMainTypes[0]);
      return group?.imageUrl || null;
    }
    return null;
  }, [availableTypeOptions, groupedTypeOptions, normalizedSelectedCategories, selectedMainTypes, selectedMode, typeFilterImageRows]);
  const isCategorySelectedForMainTypes = useCallback((categories: string[], label: string, mainTypes: PropertyMainType[], scopeMainType?: PropertyMainType | "") => {
    const scopedLabel = scopeMainType ? encodeScopedCategory(scopeMainType, label) : label;
    const normalizedCategories = normalizeSelectedCategories(categories, mainTypes);
    const normalizedLabel = normalizeSelectedCategories([scopedLabel], mainTypes)[0] || scopedLabel;
    return normalizedCategories.includes(normalizedLabel);
  }, [normalizeSelectedCategories]);
  const resolveSelectedCategoryMainType = useCallback((category: string, mainTypes: PropertyMainType[]) => {
    const scopedMainType = getScopedCategoryMainType(category);
    if (scopedMainType) return scopedMainType;
    const matchKeys = getSelectedSubTypeMatchKeys(category, mainTypes);
    if (mainTypes.includes("residence")) {
      const belongsToResidence = matchKeys.some((key) => (groupedCategoryMetadata.ownerMainTypesByKey.get(key) || []).includes("residence"));
      if (belongsToResidence) return "residence";
    }
    for (const mainType of mainTypes) {
      const ownsCategory = matchKeys.some((key) => (groupedCategoryMetadata.ownerMainTypesByKey.get(key) || []).includes(mainType));
      if (ownsCategory) return mainType;
    }
    return getMainTypeFromCategory(getCategoryDisplayLabel(category));
  }, [groupedCategoryMetadata]);
  const removeCategoriesForMainType = useCallback((
    categories: string[],
    mainType: PropertyMainType,
    currentSelectedTypes: PropertyMainType[],
  ) => {
    const normalizedCategories = normalizeSelectedCategories(categories, currentSelectedTypes);
    const nextSelectedTypes = currentSelectedTypes.filter((item) => item !== mainType);
    if (nextSelectedTypes.length === 0) return [];
    const nextCategories = normalizedCategories.filter(
      (item) => resolveSelectedCategoryMainType(item, currentSelectedTypes) !== mainType
    );
    return normalizeSelectedCategories(nextCategories, nextSelectedTypes);
  }, [normalizeSelectedCategories, resolveSelectedCategoryMainType]);
  const selectedTypeChipGroups = useMemo(() => {
    const grouped = new Map<PropertyMainType, string[]>();
    selectedMainTypes.forEach((mainType) => grouped.set(mainType, []));
    normalizedSelectedCategories.forEach((category) => {
      const mainType = resolveSelectedCategoryMainType(category, selectedMainTypes);
      if (!grouped.has(mainType)) grouped.set(mainType, []);
      grouped.get(mainType)?.push(category);
    });
    const groups = Array.from(grouped.entries()).flatMap(([mainType, categories]) => {
      if (mainType === "residence") {
        return formatResidenceChipCategories(categories).map((category) => ({
          mainType,
          categories: [category],
        }));
      }
      return [{
        mainType,
        categories,
      }];
    });
    const hasGroupedCategories = groups.some(({ categories }) => categories.length > 0);
    return hasGroupedCategories ? groups.filter(({ categories }) => categories.length > 0) : groups;
  }, [formatResidenceChipCategories, normalizedSelectedCategories, resolveSelectedCategoryMainType, selectedMainTypes]);

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
    setSelectedCategories((prev) => {
      const next = normalizeSelectedCategories(prev, selectedMainTypes);
      return areStringArraysEqual(prev, next) ? prev : next;
    });
    const mainTypeAllowed = new Set(groupedTypeOptions.map((item) => item.mainType));
    setSelectedMainTypes((prev) => {
      const next = normalizeResidenceExclusiveMainTypes(
        prev.filter((item) => mainTypeAllowed.has(item)),
        selectedMainType || undefined
      );
      return areStringArraysEqual(prev, next) ? prev : next;
    });
    setSelectedMainType((prev) => {
      if (prev && mainTypeAllowed.has(prev) && selectedMainTypes.includes(prev)) return prev;
      return selectedMainTypes[0] || "";
    });
  }, [groupedTypeOptions, normalizeSelectedCategories, selectedMainType, selectedMainTypes]);
  useEffect(() => {
    const allowedSeaside = new Set(availableSeasideOptions);
    const allowedComfort = new Set(availableComfortOptions);
    setSelectedSeasideOptions((prev) => prev.filter((item) => allowedSeaside.has(item)));
    setSelectedComfortOptions((prev) => prev.filter((item) => allowedComfort.has(item)));
  }, [availableSeasideOptions, availableComfortOptions]);

  useEffect(() => {
    if (selectedMainTypes.length === 0) return;
    setSelectedCategories((prev) => {
      const next = normalizeSelectedCategories(prev, selectedMainTypes);
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [groupedTypeOptions, normalizeSelectedCategories, selectedMainTypes]);
  useEffect(() => {
    const firstRange = selectedStayRanges[0];
    if (!firstRange) return;
    setCheckIn(firstRange.start ? parseISO(firstRange.start) : null);
    setCheckOut(firstRange.end ? parseISO(firstRange.end) : null);
  }, []);

  useEffect(() => {
    if (!isHotelMode || !hotelDestinationOpen) return;
    const normalizedCityId = Number(hotelCityId) > 0 ? Number(hotelCityId) : 0;
    if (hotelDirectoryLoadedCityIdRef.current === normalizedCityId && hotelsByCity.length > 0) {
      return;
    }
    let cancelled = false;
    setLoadingHotelsByCity(true);
    void (async () => {
      try {
        const { listHotels } = await loadHotelsService();
        const rows = await listHotels(normalizedCityId > 0 ? normalizedCityId : undefined);
        if (!cancelled) {
          const nextRows = Array.isArray(rows) ? rows : [];
          hotelDirectoryLoadedCityIdRef.current = normalizedCityId;
          setHotelsByCity(nextRows);
          if (normalizedCityId > 0 && nextRows.length > 0) {
            setHotelCountsByCityCache((prev) => ({
              ...prev,
              [normalizedCityId]: nextRows.length,
            }));
          }
        }
      } catch {
        if (!cancelled) {
          hotelDirectoryLoadedCityIdRef.current = normalizedCityId;
          if (normalizedCityId > 0) setHotelsByCity([]);
        }
      } finally {
        if (!cancelled) setLoadingHotelsByCity(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hotelCityId, hotelDestinationOpen, hotelsByCity.length, isHotelMode]);
  useEffect(() => {
    if (!hotelDestinationOpen || hotelDestinationTab !== "hotels") return;
    const scrollToTop = () => {
      if (hotelDestinationDesktopListRef.current) hotelDestinationDesktopListRef.current.scrollTop = 0;
      if (hotelDestinationMobileListRef.current) hotelDestinationMobileListRef.current.scrollTop = 0;
    };
    const frameId = window.requestAnimationFrame(scrollToTop);
    return () => window.cancelAnimationFrame(frameId);
  }, [hotelCityId, hotelDestinationOpen, hotelDestinationTab]);
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
    if (!isHotelMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getHotelConfig } = await loadHotelsService();
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
  }, [isHotelMode]);

  useEffect(() => {
    if (!isHotelMode) return;
    let cancelled = false;
    setLoadingHotelCities(true);
    void (async () => {
      try {
        const { listHotelCities } = await loadHotelsService();
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
  }, [isHotelMode]);

  useEffect(() => {
    if (!isHotelMode) return;
    const cachedSearch = readHomeHotelSearchCache();
    if (!cachedSearch || cachedSearch.signature !== currentHotelSearchSignature || !Array.isArray(cachedSearch.hotelResults)) {
      return;
    }
    setHotelResults(cachedSearch.hotelResults);
    setHasSearched(Boolean(cachedSearch.hasSearched));
    setHotelCityId(Number(cachedSearch.hotelCityId || 0));
    setHotelDestinationQuery(String(cachedSearch.hotelDestinationQuery || ""));
    setSelectedHotelId(Number(cachedSearch.selectedHotelId || 0));
    setHotelDestinationScopeConfirmed(Boolean(cachedSearch.hotelDestinationScopeConfirmed));
    setHotelCheckIn(String(cachedSearch.hotelCheckIn || ""));
    setHotelCheckOut(String(cachedSearch.hotelCheckOut || ""));
    setHotelAdults(Math.max(1, Number(cachedSearch.hotelAdults || 1)));
    setHotelChildAges(Array.isArray(cachedSearch.hotelChildAges) ? cachedSearch.hotelChildAges : []);
    setSharedHotelRoomCount(Math.max(1, Number(cachedSearch.sharedHotelRoomCount || 1)));
    setSharedHotelRoomTravellers(Array.isArray(cachedSearch.sharedHotelRoomTravellers) ? cachedSearch.sharedHotelRoomTravellers : []);
    setLocalRoomSelectionsByHotel(cachedSearch.localRoomSelectionsByHotel && typeof cachedSearch.localRoomSelectionsByHotel === "object" ? cachedSearch.localRoomSelectionsByHotel : {});
    setHotelAvailabilitySignatureByHotel(cachedSearch.hotelAvailabilitySignatureByHotel && typeof cachedSearch.hotelAvailabilitySignatureByHotel === "object" ? cachedSearch.hotelAvailabilitySignatureByHotel : {});
    setHotelResultsView(cachedSearch.hotelResultsView === "list" ? "list" : "grid");
    setHotelResultsSort(cachedSearch.hotelResultsSort || "recommended");
    setHotelResultsPageSize(Math.max(1, Number(cachedSearch.hotelResultsPageSize || 12)));
    setHotelResultsSearchTerm(String(cachedSearch.hotelResultsSearchTerm || ""));
    setSelectedHotelResultBoardings(Array.isArray(cachedSearch.selectedHotelResultBoardings) ? cachedSearch.selectedHotelResultBoardings : []);
    setSelectedHotelResultStars(Array.isArray(cachedSearch.selectedHotelResultStars) ? cachedSearch.selectedHotelResultStars : []);
    setSelectedHotelResultFacilities(Array.isArray(cachedSearch.selectedHotelResultFacilities) ? cachedSearch.selectedHotelResultFacilities : []);
    setHotelResultsOnlyPromotions(Boolean(cachedSearch.hotelResultsOnlyPromotions));
    setHotelResultsOnlyRefundable(Boolean(cachedSearch.hotelResultsOnlyRefundable));
    setHotelResultsOnlyWithPrice(Boolean(cachedSearch.hotelResultsOnlyWithPrice));
    setHotelResultsOnlyOnRequest(Boolean(cachedSearch.hotelResultsOnlyOnRequest));
    setHotelResultsBudgetMin(
      cachedSearch.hotelResultsBudgetMin === null || cachedSearch.hotelResultsBudgetMin === undefined
        ? null
        : Number(cachedSearch.hotelResultsBudgetMin)
    );
    setHotelResultsBudgetMax(
      cachedSearch.hotelResultsBudgetMax === null || cachedSearch.hotelResultsBudgetMax === undefined
        ? null
        : Number(cachedSearch.hotelResultsBudgetMax)
    );
    setHotelSearchFallbackNotice(String(cachedSearch.hotelSearchFallbackNotice || ""));
    setHotelCountsByCityCache(cachedSearch.hotelCountsByCityCache && typeof cachedSearch.hotelCountsByCityCache === "object" ? cachedSearch.hotelCountsByCityCache : {});
    hotelInitialSearchDoneRef.current = true;
    hotelShouldAutoSearchFromUrlRef.current = false;
  }, [currentHotelSearchSignature, isHotelMode]);

  useEffect(() => {
    if (!isHotelMode || !hasSearched) return;
    saveHomeHotelSearchCache({
      signature: currentHotelSearchSignature,
      hasSearched,
      hotelResults,
      hotelCityId,
      hotelDestinationQuery,
      selectedHotelId,
      hotelDestinationScopeConfirmed,
      hotelCheckIn,
      hotelCheckOut,
      hotelAdults,
      hotelChildAges,
      sharedHotelRoomCount,
      sharedHotelRoomTravellers,
      localRoomSelectionsByHotel,
      hotelAvailabilitySignatureByHotel,
      hotelResultsView,
      hotelResultsSort,
      hotelResultsPageSize,
      hotelResultsSearchTerm,
      selectedHotelResultBoardings,
      selectedHotelResultStars,
      selectedHotelResultFacilities,
      hotelResultsOnlyPromotions,
      hotelResultsOnlyRefundable,
      hotelResultsOnlyWithPrice,
      hotelResultsOnlyOnRequest,
      hotelResultsBudgetMin,
      hotelResultsBudgetMax,
      hotelSearchFallbackNotice,
      hotelCountsByCityCache,
    });
  }, [
    currentHotelSearchSignature,
    hasSearched,
    hotelAdults,
    hotelCheckIn,
    hotelCheckOut,
    hotelChildAges,
    hotelCityId,
    hotelCountsByCityCache,
    hotelDestinationQuery,
    hotelDestinationScopeConfirmed,
    hotelResults,
    hotelResultsBudgetMax,
    hotelResultsBudgetMin,
    hotelResultsOnlyOnRequest,
    hotelResultsOnlyPromotions,
    hotelResultsOnlyRefundable,
    hotelResultsOnlyWithPrice,
    hotelResultsPageSize,
    hotelResultsSearchTerm,
    hotelResultsSort,
    hotelResultsView,
    hotelSearchFallbackNotice,
    hotelAvailabilitySignatureByHotel,
    isHotelMode,
    localRoomSelectionsByHotel,
    selectedHotelResultBoardings,
    selectedHotelResultFacilities,
    selectedHotelResultStars,
    selectedHotelId,
    sharedHotelRoomCount,
    sharedHotelRoomTravellers,
  ]);

  useEffect(() => {
    if (!isHotelMode || loadingHotelCities || hotelInitialSearchDoneRef.current || !hotelShouldAutoSearchFromUrlRef.current) return;
    if (!hotelCityId || !hotelCheckIn || !hotelCheckOut) return;
    hotelInitialSearchDoneRef.current = true;
    hotelShouldAutoSearchFromUrlRef.current = false;
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
    const normalizedMainTypes = normalizeResidenceExclusiveMainTypes(selectedMainTypes, selectedMainType || undefined);
    const normalizedMainType = normalizedMainTypes.includes("residence")
      ? "residence"
      : (selectedMainType && normalizedMainTypes.includes(selectedMainType) ? selectedMainType : (normalizedMainTypes[0] || ""));
    setDraftMainType(normalizedMainType);
    setDraftSelectedMainTypes(normalizedMainTypes);
    setDraftCategories(normalizeSelectedCategories(selectedCategories, normalizedMainTypes));
    setTypeSelectionStep(normalizedMainType ? "sub" : "main");
    setShowCategoryDropdown(true);
  };
  const chooseDraftMainType = (mainType: PropertyMainType) => {
    setDraftMainType(mainType);
    setTypeSelectionStep("sub");
  };
  const toggleDraftMainTypeSelection = (mainType: PropertyMainType) => {
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
  };
  const toggleDraftCategory = (cat: string, scopeMainType?: PropertyMainType | "") => {
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
  };
  const confirmTypeSelection = () => {
    const normalizedMainTypes = normalizeResidenceExclusiveMainTypes(draftSelectedMainTypes, draftMainType || undefined);
    const normalizedMainType = draftMainType && normalizedMainTypes.includes(draftMainType) ? draftMainType : (normalizedMainTypes[0] || "");
    setSelectedMainTypes(normalizedMainTypes);
    setSelectedMainType(normalizedMainType);
    setSelectedCategories(normalizeSelectedCategories(draftCategories, normalizedMainTypes));
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
    setHotelAvailabilitySignatureByHotel({});
    setHotelCriteriaGlowTarget(hasHotelTravellerSelection ? "chambres" : "voyageurs");
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

  const updateHotelAdults = (nextAdults: number) => {
    const minimumAdults = Math.max(1, Math.min(4, Number(sharedHotelRoomCount ?? DEFAULT_HOTEL_ROOM_COUNT) || DEFAULT_HOTEL_ROOM_COUNT));
    setHotelAdults(Math.max(minimumAdults, Math.min(8, Math.floor(Number(nextAdults) || minimumAdults))));
  };

  const resetHotelDestinationSelection = () => {
    setHotelDestinationQuery("");
    setSelectedHotelId(0);
    setHotelCityId(0);
    setHotelDestinationScopeConfirmed(false);
    setHotelDestinationTab("destinations");
    setVisibleHotelDestinationCount(HOTEL_DESTINATION_PAGE_SIZE);
  };

  const openHotelDestinationPicker = () => {
    if (selectedHotelId > 0 || hotelCityId > 0) setHotelDestinationTab("hotels");
    else if (hotelDestinationNeedle) setHotelDestinationTab("villes");
    else setHotelDestinationTab("destinations");
    setHotelDestinationOpen(true);
  };

  const selectHotelDestinationCity = (city: HotelCity) => {
    setHotelCityId(Number(city.Id) || 0);
    setHotelDestinationQuery(String(city.Name || "").trim());
    setSelectedHotelId(0);
    setHotelDestinationScopeConfirmed(false);
    setHotelDestinationTab("hotels");
    setVisibleHotelDestinationCount(HOTEL_DESTINATION_PAGE_SIZE);
  };

  const selectHotelDestinationHotel = (hotel: HotelSummary) => {
    if (Number(hotel?.City?.Id || 0) > 0) {
      setHotelCityId(Number(hotel.City?.Id || 0));
    }
    setSelectedHotelId(Number(hotel.Id || 0));
    setHotelDestinationScopeConfirmed(true);
    setHotelDestinationQuery(String(hotel.Name || "").trim());
    setHotelDestinationOpen(false);
  };

  const clearSelectedHotelDestinationHotel = () => {
    setSelectedHotelId(0);
    setHotelDestinationScopeConfirmed(false);
    setHotelDestinationQuery(selectedHotelCity?.Name ? String(selectedHotelCity.Name).trim() : "");
    setHotelDestinationTab(selectedHotelCity ? "hotels" : "destinations");
    setVisibleHotelDestinationCount(HOTEL_DESTINATION_PAGE_SIZE);
  };

  const showAllHotelDestinationChoices = () => {
    if (selectedHotelCity?.Name) {
      setHotelDestinationQuery(String(selectedHotelCity.Name).trim());
    }
    setSelectedHotelId(0);
    setHotelDestinationScopeConfirmed(true);
    setHotelDestinationTab(selectedHotelCity ? "hotels" : "destinations");
    setVisibleHotelDestinationCount(Math.max(HOTEL_DESTINATION_PAGE_SIZE, filteredHotelsByCity.length));
    setHotelDestinationOpen(false);
  };

  const toggleHotelResultSelection = (value: string, setState: Dispatch<SetStateAction<string[]>>) => {
    setState((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const loadMoreHotelDestinationHotels = useCallback(() => {
    setVisibleHotelDestinationCount((prev) =>
      prev >= filteredHotelsByCity.length ? prev : prev + HOTEL_DESTINATION_PAGE_SIZE
    );
  }, [filteredHotelsByCity.length]);

  const handleHotelDestinationScroll = (event: UIEvent<HTMLDivElement>) => {
    if (hotelDestinationTab !== "hotels" || loadingHotelsByCity) return;
    const container = event.currentTarget;
    if (container.scrollTop + container.clientHeight < container.scrollHeight - 48) return;
    loadMoreHotelDestinationHotels();
  };

  const hotelDestinationTabMeta: Array<{ key: HotelDestinationTab; label: string }> = [
    { key: "destinations", label: "Destinations" },
    { key: "top", label: "Top" },
    { key: "villes", label: "Villes" },
    { key: "hotels", label: "Hôtels" },
  ];

  const setHotelRoomCount = (nextRoomCount: number) => {
    const safeRoomCount = Math.max(1, Math.min(4, Math.floor(Number(nextRoomCount) || 1)));
    setSharedHotelRoomCount(safeRoomCount);
    setHotelAdults((prev) => Math.max(safeRoomCount, Math.min(8, Math.floor(Number(prev) || hotelDefaults.adults || safeRoomCount))));
    setSharedHotelRoomTravellers((prev) => {
      const seededCurrent = Array.isArray(prev) && prev.length > 0
        ? prev
        : buildHotelRoomTravellersFromFilters(sharedHotelRoomCount, hotelAdults, hotelChildAges);
      return normalizeHotelRoomTravellers(seededCurrent, safeRoomCount);
    });
    setHotelAvailabilitySignatureByHotel({});
    setHotelCriteriaGlowTarget(hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut) ? "action" : "dates");
  };

  useEffect(() => {
    setSharedHotelRoomTravellers(buildHotelRoomTravellersFromFilters(sharedHotelRoomCount, hotelAdults, hotelChildAges));
    setHotelAvailabilitySignatureByHotel({});
  }, [sharedHotelRoomCount, hotelAdults, hotelChildAges]);

  useEffect(() => {
    setVisibleHotelDestinationCount(HOTEL_DESTINATION_PAGE_SIZE);
  }, [hotelDestinationTab, hotelCityId, hotelDestinationNeedle]);

  useEffect(() => {
    setHotelAvailabilitySignatureByHotel({});
  }, [hotelCheckIn, hotelCheckOut]);

  useEffect(() => {
    if (hotelResultPriceBounds.max <= 0) {
      setHotelResultsBudgetMin(null);
      setHotelResultsBudgetMax(null);
      return;
    }
    setHotelResultsBudgetMin((prev) => (prev === null ? hotelResultPriceBounds.min : Math.max(hotelResultPriceBounds.min, Math.min(prev, hotelResultPriceBounds.max))));
    setHotelResultsBudgetMax((prev) => (prev === null ? hotelResultPriceBounds.max : Math.min(hotelResultPriceBounds.max, Math.max(prev, hotelResultPriceBounds.min))));
  }, [hotelResultPriceBounds.max, hotelResultPriceBounds.min]);

  const runHotelSearch = async (options?: { replace?: boolean; scroll?: boolean }) => {
    const travellerContext = resolveHotelSearchTravellerContext();
    const nextChildAges = [...travellerContext.childAges];
    const keywords = selectedHotelId > 0 ? "" : hotelDestinationQuery.trim();
    const providerKeywords = selectedHotelId > 0
      ? ""
      : (
        hotelCityId > 0
        && normalizeHotelResultsToken(keywords) === normalizeHotelResultsToken(selectedHotelCity?.Name || "")
          ? ""
          : keywords
      );
    const resolvedAdults = Math.max(1, Number(travellerContext.adults || hotelAdults || hotelDefaults.adults || 1));
    const hasValidDates = hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut);
    const hasValidTravellers = travellerContext.adults > 0 || nextChildAges.length > 0 || hasHotelTravellerSelection;
    setHasSearched(true);
    setLoadingHotelResults(true);
    setHotelSearchLoadingModal(true);
    setHotelProviderError("");
    setHotelSearchFallbackNotice("");

    try {
      const { listHotels, searchHotels } = await loadHotelsService();
      let finalHotels: HotelSummary[] = [];

      if (!hotelCityId || !hasValidDates || !hasValidTravellers) {
        const fallbackHotels = await listHotels(hotelCityId || undefined);
        const filteredFallback = Array.isArray(fallbackHotels)
          ? fallbackHotels.filter((hotel) => {
              const matchesKeyword = matchesHotelKeywordForFallback(hotel, keywords);
              const matchesSelected = selectedHotelId <= 0 || Number(hotel.Id || 0) === Number(selectedHotelId);
              return matchesKeyword && matchesSelected;
            })
          : [];
        finalHotels = filteredFallback;
        setHotelResults(filteredFallback);
        setHotelSearchFallbackNotice("");
      } else {
        try {
          const hotels = await searchHotels({
            cityId: hotelCityId || undefined,
            checkIn: hotelCheckIn,
            checkOut: hotelCheckOut,
            adults: resolvedAdults,
            childAges: nextChildAges,
            keywords: providerKeywords || undefined,
          });

          if (hotels.length === 0 && hotelCityId > 0) {
            const fallbackHotels = await listHotels(hotelCityId);
            const filteredFallback = Array.isArray(fallbackHotels)
              ? fallbackHotels.filter((hotel) => {
                  const matchesKeyword = matchesHotelKeywordForFallback(hotel, keywords);
                  const matchesSelected = selectedHotelId <= 0 || Number(hotel.Id || 0) === Number(selectedHotelId);
                  return matchesKeyword && matchesSelected;
                })
              : [];

            finalHotels = filteredFallback;
            setHotelResults(filteredFallback);
            setHotelSearchFallbackNotice("");
          } else {
            finalHotels = hotels;
            setHotelResults(hotels);
            if (hotelCityId > 0) {
              setHotelCountsByCityCache((prev) => ({
                ...prev,
                [Number(hotelCityId)]: hotels.length,
              }));
            }
          }
        } catch (searchError) {
          const fallbackHotels = hotelCityId > 0 ? await listHotels(hotelCityId) : [];
          const filteredFallback = Array.isArray(fallbackHotels)
            ? fallbackHotels.filter((hotel) => {
                const matchesKeyword = matchesHotelKeywordForFallback(hotel, keywords);
                const matchesSelected = selectedHotelId <= 0 || Number(hotel.Id || 0) === Number(selectedHotelId);
                return matchesKeyword && matchesSelected;
              })
            : [];

          if (filteredFallback.length > 0) {
            finalHotels = filteredFallback;
            setHotelResults(filteredFallback);
            setHotelSearchFallbackNotice("");
            setHotelProviderError("");
          } else {
            throw searchError;
          }
        }

        if (finalHotels.length > 0) {
          setHotelResults(finalHotels);
          setHotelAvailabilitySignatureByHotel((prev) => {
            const next = { ...prev };
            finalHotels.forEach((hotel) => {
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
      if (selectedHotelId > 0) nextParams.set("hotelId", String(selectedHotelId));
      else nextParams.delete("hotelId");
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

      return finalHotels;
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
    setHotelCriteriaGlowTarget(null);
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
    const isAmicaleHotelFlow = Boolean(activeAmicaleId);
    if (!user || user.role !== "user" || !user.email) {
      if (isAmicaleHotelFlow) {
        setHotelReserveModal({
          ...payload,
          travellers: {
            adults: Array.from({ length: Math.max(1, payload.adults) }).map(() => ({ firstName: "", lastName: "" })),
            children: Array.from({ length: payload.childAges.length }).map(() => ({ firstName: "", lastName: "" })),
          },
          paymentMode: "amicale",
          amicaleSelectionId: activeAmicaleId || "",
          amicaleFullName: "",
          amicaleMatricule: "",
          amicalePhone: "",
          amicaleCode: "",
          phone: "",
          note: "",
        });
        setHotelTravellerAccordionOpen("adult-0");
        return;
      }
      savePendingHomeHotelReserve(payload);
      setLoginPromptStep("choices");
      setShowLoginPrompt(true);
      return;
    }
    if (!isAmicaleHotelFlow && !user.profileCompleted) {
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
      paymentMode: isAmicaleHotelFlow ? "amicale" : "standard",
      amicaleSelectionId: activeAmicaleId || "",
      amicaleFullName: isAmicaleHotelFlow ? `${userFirstName} ${userLastName}`.trim() : "",
      amicaleMatricule: "",
      amicalePhone: isAmicaleHotelFlow ? String(user.telephone || "").trim() : "",
      amicaleCode: "",
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
      cinImageRectoUrl: String(currentUser?.cinImageRectoUrl || currentUser?.cinImageUrl || "").trim(),
      cinImageVersoUrl: String(currentUser?.cinImageVersoUrl || "").trim(),
    });
    setLoginPromptStep("profile_setup");
    setShowLoginPrompt(true);
  };

  const handleProfileCinUpload = async (event: React.ChangeEvent<HTMLInputElement>, side: "recto" | "verso") => {
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
      setProfilePromptForm((prev) => ({
        ...prev,
        cinImageUrl: side === "recto" ? imageUrl : prev.cinImageUrl,
        cinImageRectoUrl: side === "recto" ? imageUrl : prev.cinImageRectoUrl,
        cinImageVersoUrl: side === "verso" ? imageUrl : prev.cinImageVersoUrl,
      }));
      toast.success(`Photo CIN ${side === "recto" ? "recto" : "verso"} enregistree`);
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
      cinImageRectoUrl: loggedUser.cinImageRectoUrl || loggedUser.cinImageUrl || undefined,
      cinImageVersoUrl: loggedUser.cinImageVersoUrl || undefined,
      profileCompleted: loggedUser.profileCompleted,
      role: "user",
    });
  };

  const handlePromptSocialLogin = (provider: "google" | "facebook" | "apple") => {
    if (provider === "google" && !providers.google) {
      toast.error("Google login indisponible pour le moment");
      return;
    }
    if (provider === "facebook" && !providers.facebook) {
      toast.error("Facebook login indisponible pour le moment");
      return;
    }
    if (provider === "apple" && !providers.apple) {
      toast.error("Apple login indisponible pour le moment");
      return;
    }
    const returnTo = `${routerLocation.pathname}${routerLocation.search}`;
    saveAuthReturnTo(returnTo);
    markAuthPendingLogin();
    setIsAwaitingLogin(true);
    setShowLoginPrompt(false);
    // Keep auth in the same tab/page flow (no popup window).
    void loadAuthService().then(({ startSocialLogin }) => {
      startSocialLogin(provider, returnTo);
    });
  };

  const handlePromptPasskeyLogin = async () => {
    if (!providers.passkey) return toast.error("Passkey indisponible pour le moment");
    if (!window.PublicKeyCredential || !navigator.credentials) return toast.error("Passkey non supporte sur ce navigateur/appareil");
    setIsPasskeyPromptLoading(true);
    try {
      const { loginWithPasskey } = await loadAuthService();
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
      const { registerWithPasskey } = await loadAuthService();
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
    if (!profilePromptForm.cinImageRectoUrl.trim() || !profilePromptForm.cinImageVersoUrl.trim()) {
      return toast.error("Les photos CIN recto et verso sont obligatoires.");
    }
    setIsProfilePromptSaving(true);
    try {
      const { completeSocialProfile } = await loadAuthService();
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
        cinImageUrl: profilePromptForm.cinImageRectoUrl.trim(),
        cinImageRectoUrl: profilePromptForm.cinImageRectoUrl.trim(),
        cinImageVersoUrl: profilePromptForm.cinImageVersoUrl.trim(),
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
    const isAmicaleHotelFlow = hotelReserveModal.paymentMode === "amicale";
    if (!isAmicaleHotelFlow && authLoading) {
      toast.info("Verification de votre session en cours...");
      return;
    }
    if (!isAmicaleHotelFlow && (!user || user.role !== "user" || !user.email)) {
      setLoginPromptStep("choices");
      setShowLoginPrompt(true);
      return;
    }
    const phone = String(isAmicaleHotelFlow ? hotelReserveModal.amicalePhone : hotelReserveModal.phone || "").trim();
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
    if (isAmicaleHotelFlow) {
      const selectedAmicale = hotelAmicaleOptions.find((item) => item.id === hotelReserveModal.amicaleSelectionId) || null;
      if (!selectedAmicale) {
        toast.error("Selection amicale invalide.");
        return;
      }
      if (!String(hotelReserveModal.amicaleFullName || "").trim()) {
        toast.error("Nom et prenom obligatoires.");
        return;
      }
      if (!String(hotelReserveModal.amicaleMatricule || "").trim()) {
        toast.error("Matricule obligatoire.");
        return;
      }
      if (selectedAmicale.code !== String(hotelReserveModal.amicaleCode || "").trim()) {
        toast.error("Code amicale incorrect.");
        return;
      }
    }

    const demandPayload = {
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
      currency: "TND" as const,
      clientPhone: phone,
      clientNote: String(hotelReserveModal.note || "").trim() || null,
      paymentMode: isAmicaleHotelFlow ? "amicale" as const : "avance" as const,
      pricingAmicaleId: isAmicaleHotelFlow ? hotelReserveModal.amicaleSelectionId : null,
      amicaleName: isAmicaleHotelFlow ? String(hotelReserveModal.amicaleFullName || "").trim() : null,
      amicaleMatricule: isAmicaleHotelFlow ? String(hotelReserveModal.amicaleMatricule || "").trim() : null,
      amicalePhone: isAmicaleHotelFlow ? String(hotelReserveModal.amicalePhone || "").trim() : null,
      amicaleCode: isAmicaleHotelFlow ? String(hotelReserveModal.amicaleCode || "").trim() : null,
      hotelContext: {
        source: "homepage_card",
        publicPartnerSlug: publicPartnerSlug || null,
        amicaleId: activeAmicaleId,
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
    };

    setSubmittingHotelReserve(true);
    try {
      const { createHotelReservationDemand } = await loadHotelsService();
      const created = await createHotelReservationDemand(demandPayload);
      setHotelReserveModal(null);
      clearPendingHomeHotelReserve();
      if (isAmicaleHotelFlow) {
        toast.success("Demande amicale envoyee. Votre amicale recevra la reservation hotel.");
      } else {
        toast.success("Demande créée. Passez maintenant au paiement.");
        navigate(`/mes-reservations/hotels/${encodeURIComponent(created.id)}/paiement`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de creer la demande hotel.";
      if (!isAmicaleHotelFlow && /401|auth|connect|session|acces refuse|forbidden/i.test(message)) {
        try {
          const { getSessionUser } = await loadAuthService();
          const restoredUser = await getSessionUser();
          if (restoredUser?.email) {
            applyLoggedUser(restoredUser);
            if (!restoredUser.profileCompleted) {
              openProfileSetupStep(restoredUser);
              return;
            }
            const { createHotelReservationDemand } = await loadHotelsService();
            const created = await createHotelReservationDemand(demandPayload);
            setHotelReserveModal(null);
            clearPendingHomeHotelReserve();
            toast.success("Demande créée. Passez maintenant au paiement.");
            navigate(`/mes-reservations/hotels/${encodeURIComponent(created.id)}/paiement`);
            return;
          }
        } catch {}
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
      paymentMode: activeAmicaleId ? "amicale" : "standard",
      amicaleSelectionId: activeAmicaleId || "",
      amicaleFullName: activeAmicaleId ? `${String(user.firstName || "").trim()} ${String(user.lastName || "").trim()}`.trim() : "",
      amicaleMatricule: "",
      amicalePhone: activeAmicaleId ? String(user.telephone || "").trim() : "",
      amicaleCode: "",
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
    void loadAuthService().then(({ getAuthProviders }) =>
      getAuthProviders().then((availableProviders) => {
        if (!cancelled) setProviders(availableProviders);
      })
    );
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
        return;
      }
      if (type === "DWIRA_AUTH_PENDING_PROFILE") {
        clearAuthPendingLogin();
        setIsAwaitingLogin(false);
        setShowLoginPrompt(true);
        setLoginPromptStep("profile_setup");
      }
    };
    window.addEventListener("message", onAuthMessage);
    return () => window.removeEventListener("message", onAuthMessage);
  }, []);

  const handleSearch = () => {
    setHasSearched(true);
    if (isHotelMode) {
      if (!hotelCityId || !hasConfirmedHotelDestinationChoice || loadingHotelResults) return;
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
    params.delete("categories");
    params.delete("seaside");
    params.delete("comfort");
    params.delete("checkIn");
    params.delete("checkOut");
    params.delete("stayRanges");
    if (selectedLocations.length > 0) params.set("locations", selectedLocations.join(","));
    if (selectedMainTypes.length > 0) params.set("mainTypes", selectedMainTypes.join(","));
    if (normalizedSelectedCategories.length > 0) params.set("categories", normalizedSelectedCategories.join(","));
    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
    if (selectedStayRanges.length > 0) {
      params.set("stayRanges", serializeStayRangesParam(selectedStayRanges));
      params.set("checkIn", selectedStayRanges[0].start);
      params.set("checkOut", selectedStayRanges[0].end);
    }
    
    const paramsQuery = params.toString();
    navigate(selectedMode === "vente" ? `/ventes` : `/logements?${paramsQuery}`);
    
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleShareHotelSearch = async () => {
    const nextParams = new URLSearchParams(window.location.search);
    const normalizedQuery = normalizeHotelResultsToken(hotelDestinationQuery);
    const normalizedSelectedCity = normalizeHotelResultsToken(selectedHotelCity?.Name || "");
    const hasCustomBudgetMin =
      hotelResultsBudgetMin !== null
      && Math.abs(Number(hotelResultsBudgetMin) - Number(hotelResultPriceBounds.min || 0)) > 0.01;
    const hasCustomBudgetMax =
      hotelResultsBudgetMax !== null
      && Math.abs(Number(hotelResultsBudgetMax) - Number(hotelResultPriceBounds.max || 0)) > 0.01;
    if (selectedHotelId > 0) nextParams.set("hotelId", String(selectedHotelId));
    else nextParams.delete("hotelId");
    if (selectedHotelId <= 0 && normalizedQuery && normalizedQuery === normalizedSelectedCity) nextParams.delete("q");
    if (hotelResultsSearchTerm.trim()) nextParams.set("hotelListQ", hotelResultsSearchTerm.trim());
    else nextParams.delete("hotelListQ");
    if (hotelResultsSort && hotelResultsSort !== "recommended") nextParams.set("hotelSort", hotelResultsSort);
    else nextParams.delete("hotelSort");
    if (hotelResultsView === "list") nextParams.set("hotelView", "list");
    else nextParams.delete("hotelView");
    if (hotelResultsPageSize !== 12) nextParams.set("hotelPageSize", String(hotelResultsPageSize));
    else nextParams.delete("hotelPageSize");
    if (hotelResultsOnlyPromotions) nextParams.set("hotelPromo", "1");
    else nextParams.delete("hotelPromo");
    if (hotelResultsOnlyRefundable) nextParams.set("hotelRefundable", "1");
    else nextParams.delete("hotelRefundable");
    if (hotelResultsOnlyWithPrice) nextParams.set("hotelWithPrice", "1");
    else nextParams.delete("hotelWithPrice");
    if (hotelResultsOnlyOnRequest) nextParams.set("hotelOnRequest", "1");
    else nextParams.delete("hotelOnRequest");
    if (hasCustomBudgetMin) nextParams.set("hotelBudgetMin", String(hotelResultsBudgetMin));
    else nextParams.delete("hotelBudgetMin");
    if (hasCustomBudgetMax) nextParams.set("hotelBudgetMax", String(hotelResultsBudgetMax));
    else nextParams.delete("hotelBudgetMax");
    nextParams.delete("hotelBoarding");
    selectedHotelResultBoardings.forEach((value) => nextParams.append("hotelBoarding", value));
    nextParams.delete("hotelStar");
    selectedHotelResultStars.forEach((value) => nextParams.append("hotelStar", value));
    nextParams.delete("hotelFacility");
    selectedHotelResultFacilities.forEach((value) => nextParams.append("hotelFacility", value));
    const relativeUrl = `${window.location.pathname}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
    let shareUrl = `${window.location.origin}${relativeUrl}`;

    try {
      const response = await fetch(buildApiUrl("/search-share-links"), {
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
      // Keep the full URL when short-link generation is unavailable.
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Recherche hôtellerie Dwira",
          text: "Consultez cette recherche hôtelière sur Dwira.",
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Lien de recherche copié.");
    } catch {
      toast.error("Impossible de copier le lien de recherche.");
    }
  };

  const filteredProperties = useMemo(() => {
    const selectedSubTypeKeys = normalizedSelectedCategories
      .filter((item) => !hasExplicitMainTypeInLabel(getCategoryDisplayLabel(item)))
      .map((item) => getCanonicalSubTypeKey(item))
      .filter(Boolean);
    const selectedSubTypeMatchKeys = normalizedSelectedCategories
      .flatMap((item) => getSelectedSubTypeMatchKeys(item, selectedMainTypes))
      .filter(Boolean);
    const validStayRanges = selectedStayRanges.filter((range) => isValidStayRange(range.start, range.end));
    const shouldFilterByStay = hasSearched && validStayRanges.length > 0;
    const baseProperties = hasSearched
      ? modeProperties.filter((property) => {
          const matchLocation =
            selectedLocations.length === 0
            || selectedLocations.some((item) => propertyMatchesLocation(property, item));
          const resolvedCategory = getResolvedPropertyCategoryLabel(property);
          const propertyMainType = getMainTypeFromCategory(String(resolvedCategory || property.category || ""));
          const propertySubTypeKey = getCanonicalSubTypeKey(resolvedCategory || property.category || "");
          const propertySubTypeMatchKey = propertySubTypeKey ? `${propertyMainType}::${propertySubTypeKey}` : "";
          const matchMainType = propertyMatchesSelectedMainTypes(selectedMainTypes, propertyMainType, property);
          const matchSubType = propertyMatchesSelectedSubTypes({
            selectedMainTypes,
            selectedSubTypeKeys,
            selectedSubTypeMatchKeys,
            property,
            propertySubTypeKey,
            propertySubTypeMatchKey,
          });
          const matchSeaside = selectedSeasideOptions.length === 0 || selectedSeasideOptions.some((option) => propertyMatchesSeasideOption(property, option));
          const matchComfort = selectedComfortOptions.length === 0 || selectedComfortOptions.every((option) => propertyMatchesComfortOption(property, option));
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
  }, [hasSearched, selectedLocations, selectedMainTypes, normalizedSelectedCategories, selectedSeasideOptions, selectedComfortOptions, selectedStayRanges, modeProperties]);
  const basePropertySearchParams = useMemo(() => {
    const params = applyAmicaleParam(new URLSearchParams(searchParams));
    params.set("mode", selectedMode);
    params.delete("location");
    params.delete("locations");
    params.delete("mainType");
    params.delete("mainTypes");
    params.delete("categories");
    params.delete("seaside");
    params.delete("comfort");
    params.delete("stayRanges");
    params.delete("flashOffer");
    params.delete("flashStart");
    params.delete("flashEnd");
    params.delete("flashDiscount");
    params.delete("flashMode");
    params.delete("flashAmount");
    params.delete("flashTitle");
    if (selectedLocations.length > 0) params.set("locations", selectedLocations.join(","));
    if (selectedMainTypes.length > 0) params.set("mainTypes", selectedMainTypes.join(","));
    if (normalizedSelectedCategories.length > 0) params.set("categories", normalizedSelectedCategories.join(","));
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
    return params;
  }, [searchParams, selectedMode, selectedLocations, selectedMainTypes, selectedCategories, selectedSeasideOptions, selectedComfortOptions, selectedStayRanges]);
  const filteredPropertyCards = useMemo<PropertyDisplayCard[]>(() => {
    const flashCards: PropertyDisplayCard[] = [];
    const regularCards: PropertyDisplayCard[] = [];
    filteredProperties.forEach((property) => {
      const flashOffers = getPropertyFlashOffers(property);
      const flashSearchParamsByOffer = flashOffers.map((flashOffer) => {
        const flashParams = new URLSearchParams(basePropertySearchParams.toString());
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
      if (flashSearchParamsByOffer.length > 0) {
        flashCards.push({
          key: `${property.id}-flash-group`,
          property,
          cardVariant: "flash",
          flashOffer: flashSearchParamsByOffer[0].flashOffer,
          flashOffers: flashSearchParamsByOffer.map((item) => item.flashOffer),
          searchParams: flashSearchParamsByOffer[0].searchParams,
        });
      }
      regularCards.push({
        key: String(property.id),
        property,
        cardVariant: "default",
        flashOffer: null,
        searchParams: basePropertySearchParams.toString(),
      });
    });
    return [...flashCards, ...regularCards];
  }, [basePropertySearchParams, filteredProperties]);
  const flashPropertyCards = useMemo(
    () => filteredPropertyCards.filter((card) => card.cardVariant === "flash"),
    [filteredPropertyCards]
  );
  const regularPropertyCards = useMemo(
    () => filteredPropertyCards.filter((card) => card.cardVariant !== "flash"),
    [filteredPropertyCards]
  );
  const visibleRegularPropertyCards = useMemo(
    () => (showAllProperties ? regularPropertyCards : regularPropertyCards.slice(0, visiblePropertiesCount)),
    [regularPropertyCards, showAllProperties, visiblePropertiesCount]
  );
  const hasMoreFilteredProperties = !showAllProperties && regularPropertyCards.length > visiblePropertiesCount;
  const loadNextRegularProperties = useCallback(() => {
    setVisiblePropertiesCount((prev) => (
      regularPropertyCards.length > prev ? prev + INITIAL_VISIBLE_PROPERTIES : prev
    ));
  }, [regularPropertyCards.length]);

  useEffect(() => {
    if (routerLocation.pathname !== "/ventes_flash") return;
    if (flashPropertyCards.length === 0) return;
    const timeoutId = window.setTimeout(() => {
      flashSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [flashPropertyCards.length, routerLocation.pathname]);

  useEffect(() => {
    setVisiblePropertiesCount(INITIAL_VISIBLE_PROPERTIES);
    setShowAllProperties(false);
    lastAutoLoadedPropertiesCountRef.current = 0;
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

  useEffect(() => {
    if (!hasMoreFilteredProperties || showAllProperties) return;
    const trigger = propertiesAutoLoadTriggerRef.current;
    if (!trigger || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (lastAutoLoadedPropertiesCountRef.current === visiblePropertiesCount) return;
        lastAutoLoadedPropertiesCountRef.current = visiblePropertiesCount;
        loadNextRegularProperties();
      },
      {
        rootMargin: "0px 0px 220px 0px",
        threshold: 0.05,
      }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMoreFilteredProperties, showAllProperties, visiblePropertiesCount, loadNextRegularProperties]);

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
    params.set("openFilters", "1");
    params.delete("location");
    params.delete("locations");
    params.delete("mainType");
    params.delete("mainTypes");
    params.delete("categories");
    params.delete("seaside");
    params.delete("comfort");
    params.delete("checkIn");
    params.delete("checkOut");
    params.delete("stayRanges");
    if (selectedLocations.length > 0) params.set("locations", selectedLocations.join(","));
    if (selectedMainTypes.length > 0) params.set("mainTypes", selectedMainTypes.join(","));
    if (normalizedSelectedCategories.length > 0) params.set("categories", normalizedSelectedCategories.join(","));
    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
    if (selectedStayRanges.length > 0) {
      params.set("stayRanges", serializeStayRangesParam(selectedStayRanges));
      params.set("checkIn", selectedStayRanges[0].start);
      params.set("checkOut", selectedStayRanges[0].end);
    }
    navigate(`/logements?${params.toString()}`);
  };
  const selectedLocationWidgetImage = selectedLocations.length > 0
    ? (
      selectedLocationImages.zone
      || selectedLocationImages.region
      || selectedLocationImages.gouvernerat
      || selectedLocationImages.pays
      || null
    )
    : null;
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
               ) : showPartnerHeroBranding ? (
                 <div className="flex items-center gap-3">
                   <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/30 bg-white/10 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md md:h-24 md:w-24">
                     <img src={logo} alt="Logo Dwira" className="h-full w-full rounded-full object-cover" />
                   </div>
                   <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/30 bg-white/10 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md md:h-24 md:w-24">
                     <img
                       src={activePartnerBrandLogoUrl}
                       alt={`Logo ${activePartnerBrandName || "partenaire"}`}
                       className="h-full w-full rounded-full bg-white object-contain p-1.5"
                     />
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
               {isHotelMode
                 ? "Dwira Immobilier x Tita Travel, en partenariat pour vos séjours"
                 : showPartnerHeroBranding
                   ? `Dwira Immobilier x ${activePartnerBrandName || "Agence partenaire"}`
                   : "Votre partenaire de confiance à Kélibia"}
             </p>
          </div>
          
          <p className="text-lg md:text-xl mb-8 max-w-2xl mx-auto drop-shadow-md text-gray-100">
            Location saisonniere • Hotellerie • Ventes flash
          </p>

          {/* Filter Bar */}
          <div className="relative z-10 -mb-3 px-4 pb-0 md:px-6">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {HERO_TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected =
                tab.key === "ventes_flash"
                  ? isFlashLanding
                  : !isFlashLanding && selectedMode === tab.key;
              return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  if (tab.key === "ventes_flash") {
                    navigate("/ventes_flash");
                    return;
                  }
                  setSelectedMode(tab.key);
                  setHasSearched(false);
                  const next = applyAmicaleParam(new URLSearchParams(searchParams));
                  next.set("mode", tab.key);
                  setSearchParams(next, { replace: true });
                  if (routerLocation.pathname === "/ventes_flash") {
                    navigate(`/?${next.toString()}`, { replace: true });
                  }
                }}
                className={`relative min-w-0 rounded-[18px] border px-2 py-3 text-xs font-semibold leading-tight transition-all duration-200 sm:px-3 sm:text-sm md:rounded-[22px] md:px-5 ${
                  isSelected
                    ? "z-10 border-white/70 bg-white/78 text-emerald-800 shadow-[0_10px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                    : "border-white/18 bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl hover:bg-white/20"
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <Icon size={16} className={isSelected ? "text-emerald-600" : "text-white"} />
                  <span>{tab.label}</span>
                </span>
              </button>
            )})}
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
                          onClick={() => {
                            if (hotelDestinationOpen) {
                              setHotelDestinationOpen(false);
                              return;
                            }
                            openHotelDestinationPicker();
                          }}
                          className="h-14 w-full rounded-2xl border border-slate-200/90 bg-white px-4 pr-12 text-left text-slate-900 outline-none transition hover:border-sky-500 hover:shadow-[0_8px_28px_rgba(14,116,214,0.14)]"
                        >
                          {hotelDestinationFieldLabel || "Ville ou nom hotel"}
                        </button>
                        {(hotelDestinationQuery.trim() || selectedHotelCity || selectedHotelId > 0 || hotelCityId > 0) && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              resetHotelDestinationSelection();
                            }}
                            className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                            aria-label="Supprimer la destination"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {hotelDestinationOpen && (
                        <div className="absolute left-0 right-0 top-[84px] z-30 hidden overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)] md:block">
                          <div className="border-b border-slate-100 p-3">
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <Search size={16} className="text-slate-500" />
                              <input
                                value={hotelDestinationQuery}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setHotelDestinationQuery(nextValue);
                                  setSelectedHotelId(0);
                                  setHotelDestinationScopeConfirmed(false);
                                  if (nextValue.trim()) setHotelDestinationTab("villes");
                                  if (!nextValue.trim()) {
                                    setHotelCityId(0);
                                    setSelectedHotelId(0);
                                    setHotelDestinationScopeConfirmed(false);
                                    setHotelDestinationTab("destinations");
                                  }
                                }}
                                placeholder="ex. ville, nom hotel"
                                className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                              />
                            </div>
                          </div>
                          <div className="border-b border-slate-100 px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Entrez une ou plusieurs destinations ou établissements</p>
                                {(hotelDestinationSelectionLabel || selectedHotelLabel) ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {hotelDestinationSelectionLabel ? (
                                      <div className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white">
                                        <span>{hotelDestinationSelectionLabel}</span>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            resetHotelDestinationSelection();
                                          }}
                                          className="rounded-full text-white/90 transition hover:text-white"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ) : null}
                                    {selectedHotelLabel ? (
                                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                                        <span>{selectedHotelLabel}</span>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            clearSelectedHotelDestinationHotel();
                                          }}
                                          className="rounded-full text-white/90 transition hover:text-white"
                                          aria-label="Supprimer l'hôtel sélectionné"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              {(hotelDestinationSelectionLabel || selectedHotelLabel) ? (
                                <button
                                  type="button"
                                  onClick={resetHotelDestinationSelection}
                                  className="text-xs font-semibold text-rose-500 transition hover:text-rose-600"
                                >
                                  Supprimer tout
                                </button>
                              ) : null}
                            </div>
                            <div className="mt-3 flex overflow-hidden rounded-xl border border-sky-500">
                              {hotelDestinationTabMeta.map((tab) => (
                                <button
                                  key={`desktop-hotel-destination-tab-${tab.key}`}
                                  type="button"
                                  onClick={() => setHotelDestinationTab(tab.key)}
                                  className={`flex-1 px-3 py-2 text-xs font-semibold transition ${
                                    hotelDestinationTab === tab.key ? "bg-sky-500 text-white" : "bg-white text-slate-700 hover:bg-sky-50"
                                  }`}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div ref={hotelDestinationDesktopListRef} className="max-h-80 overflow-y-auto" onScroll={handleHotelDestinationScroll}>
                            {hotelDestinationTab === "hotels" && selectedHotelCity && (
                              <div className="border-b border-slate-100 bg-white px-4 py-4">
                                <button
                                  type="button"
                                  onClick={showAllHotelDestinationChoices}
                                  className="inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(2,132,199,0.28)] transition hover:bg-sky-700"
                                >
                                  Voir tous les choix
                                </button>
                              </div>
                            )}
                            {(hotelDestinationTab === "destinations" ? featuredHotelCities : hotelDestinationTab === "villes" ? filteredHotelCities : []).map((city) => (
                              hotelDestinationTab === "destinations" || hotelDestinationTab === "villes" ? (
                                <button
                                  key={`home-hotel-city-${hotelDestinationTab}-${city.Id}`}
                                  type="button"
                                  onClick={() => selectHotelDestinationCity(city)}
                                  className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-sky-50/60"
                                >
                                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                                    <MapPin size={16} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-900">{city.Name}</p>
                                    <p className="text-xs text-slate-500">Tunisie</p>
                                  </div>
                                  {getHotelCityCountLabel(Number(city.Id)) ? (
                                    <span className="shrink-0 text-sm font-semibold text-violet-500">{getHotelCityCountLabel(Number(city.Id))}</span>
                                  ) : null}
                                </button>
                              ) : null
                            ))}
                            {hotelDestinationTab === "top" && featuredHotels.map((hotel) => (
                              <button
                                key={`home-featured-hotel-${hotel.Id}`}
                                type="button"
                                onClick={() => selectHotelDestinationHotel(hotel)}
                                className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-sky-50/60"
                              >
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                                  <BedDouble size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-slate-900">{hotel.Name}</p>
                                  <p className="text-xs text-slate-500">Tunisie, {hotel?.City?.Name || "Destination"}</p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold text-violet-500">(1)</span>
                              </button>
                            ))}
                            {loadingHotelsByCity && hotelDestinationTab === "hotels" && (
                              <div className="px-4 py-4 text-sm text-slate-500">Chargement des hôtels...</div>
                            )}
                            {hotelDestinationTab === "hotels" && visibleFilteredHotelsByCity.map((hotel) => (
                              <button
                                key={`home-hotel-name-${hotel.Id}`}
                                type="button"
                                onClick={() => selectHotelDestinationHotel(hotel)}
                                className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-sky-50/60"
                              >
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                                  <BedDouble size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-slate-900">{hotel.Name}</p>
                                  <p className="text-xs text-slate-500">Tunisie, {hotel?.City?.Name || "Destination"}</p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold text-violet-500">(1)</span>
                              </button>
                            ))}
                            {((hotelDestinationTab === "top" && featuredHotels.length === 0)
                              || (hotelDestinationTab === "hotels" && !loadingHotelsByCity && filteredHotelsByCity.length === 0)
                              || (hotelDestinationTab === "destinations" && featuredHotelCities.length === 0)
                              || (hotelDestinationTab === "villes" && filteredHotelCities.length === 0)) && (
                              <div className="px-4 py-6 text-sm text-slate-500">
                                Aucun résultat pour cet onglet.
                              </div>
                            )}
                            {hotelDestinationTab === "hotels" && visibleFilteredHotelsByCity.length < filteredHotelsByCity.length && (
                              <div className="px-4 py-3 text-center text-xs font-medium text-slate-500">
                                Faites défiler pour charger plus d'hôtels
                              </div>
                            )}
                          </div>
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
                          className="min-h-14 w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-2 pr-12 text-left text-slate-900 outline-none transition hover:border-sky-500 hover:shadow-[0_8px_28px_rgba(14,116,214,0.14)]"
                        >
                          <span className="block pr-2 text-[15px] font-medium leading-[1.25] text-slate-900 whitespace-normal break-words">
                            {hotelTravellersLabel}
                          </span>
                        </button>
                        {hasHotelTravellerSelection && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSharedHotelRoomCount(DEFAULT_HOTEL_ROOM_COUNT);
                              setHotelAdults(hotelDefaults.adults);
                              setHotelChildAges(hotelDefaults.childAges);
                              setSharedHotelRoomTravellers(buildHotelRoomTravellersFromFilters(DEFAULT_HOTEL_ROOM_COUNT, hotelDefaults.adults, hotelDefaults.childAges));
                            }}
                            className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                            aria-label="Reinitialiser chambres et voyageurs"
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
                        disabled={!hotelCityId || !hasConfirmedHotelDestinationChoice || loadingHotelResults}
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
                        <p className="text-sm font-semibold text-slate-900">Chambres</p>
                        <div className="flex items-center gap-2 text-slate-900">
                          <button type="button" onClick={() => setHotelRoomCount(sharedHotelRoomCount - 1)} className="rounded-lg border border-slate-300 p-2 text-slate-900 hover:bg-white"><Minus size={14} /></button>
                          <span className="w-6 text-center font-semibold text-slate-900">{sharedHotelRoomCount}</span>
                          <button type="button" onClick={() => setHotelRoomCount(sharedHotelRoomCount + 1)} className="rounded-lg border border-slate-300 p-2 text-slate-900 hover:bg-white"><Plus size={14} /></button>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">Adultes</p>
                        <div className="flex items-center gap-2 text-slate-900">
                          <button type="button" onClick={() => updateHotelAdults(hotelAdults - 1)} className="rounded-lg border border-slate-300 p-2 text-slate-900 hover:bg-white"><Minus size={14} /></button>
                          <span className="w-6 text-center font-semibold text-slate-900">{hotelAdults}</span>
                          <button type="button" onClick={() => updateHotelAdults(hotelAdults + 1)} className="rounded-lg border border-slate-300 p-2 text-slate-900 hover:bg-white"><Plus size={14} /></button>
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
                      {selectedHotelLabel
                        ? `Hôtel sélectionné : ${selectedHotelLabel}${selectedHotelCity ? `, ${selectedHotelCity.Name}.` : "."}`
                        : selectedHotelCity
                          ? `Destination sélectionnée : ${selectedHotelCity.Name}.`
                          : "Sélectionnez une destination pour lancer votre recherche."}
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
                        <div className="rounded-[26px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60 p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Tunisie</p>
                              <h3 className="mt-2 text-lg font-bold text-gray-900">{locationStepMeta[locationSelectionStep].title}</h3>
                              <p className="mt-1 text-sm text-gray-600">{locationStepMeta[locationSelectionStep].subtitle}</p>
                            </div>
                            <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                              Étape {locationSelectionStep === "gouvernerat" ? "1/3" : locationSelectionStep === "region" ? "2/3" : "3/3"}
                            </div>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-3">
                            <button
                              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${draftSelectedLocations.length === 0 ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700 border border-gray-200'}`}
                              onClick={() => { setDraftSelectedLocations([]); resetCurrentLocationPath(); }}
                            >
                              Tous les emplacements
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (locationSelectionStep === "gouvernerat") return;
                                const previousStep = locationSelectionStep === "zone" ? "region" : "gouvernerat";
                                setLocationSelectionStep(previousStep);
                                setOpenLocationLevel(previousStep);
                              }}
                              disabled={locationSelectionStep === "gouvernerat"}
                              className="w-full rounded-xl border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Précédent
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (locationSelectionStep === "gouvernerat") {
                                  setLocationSelectionStep("region");
                                  setOpenLocationLevel("region");
                                  return;
                                }
                                if (locationSelectionStep === "region") {
                                  setLocationSelectionStep("zone");
                                  setOpenLocationLevel("zone");
                                  return;
                                }
                                confirmLocationSelection();
                              }}
                              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                            >
                              {locationSelectionStep === "zone" ? "Confirmer la sélection" : "Suivant"}
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-3">
                            {locationStepMeta[locationSelectionStep].options.map((item) => {
                              const level = locationSelectionStep;
                              const selected = level === "gouvernerat"
                                ? isTokenInList(draftSelectedGouvernerats, item)
                                : level === "region"
                                  ? isTokenInList(draftSelectedRegions, item)
                                  : isTokenInList(draftSelectedZones, item);
                              return (
                                <button
                                  key={`desktop-location-step-${level}-${item}`}
                                  type="button"
                                  onClick={() => {
                                    if (level === "gouvernerat") applyGovernorateSelection(item);
                                    if (level === "region") applyRegionSelection(item);
                                    if (level === "zone") applyZoneSelection(item);
                                  }}
                                  className={`group relative h-28 overflow-hidden rounded-2xl border text-left transition-all duration-200 ${locationCardSelectionClass(selected)}`}
                                >
                                  {renderSelectionCheckbox(selected)}
                                  <img src={getLocationOptionImage(level, item)} alt={item} className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                                  <div className={`pointer-events-none absolute inset-0 ${selected ? "bg-emerald-950/25" : "bg-black/40"}`} />
                                  <div className="relative z-10 flex h-full items-center p-4">
                                    {renderSelectionLabel(item)}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
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
                          type="button"
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
                                {renderSelectionCheckbox(draftSelectedMainTypes.includes(group.mainType))}
                                <img src={resolveTypeImageUrl(group.imageUrl)} alt={group.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                                <div className="pointer-events-none absolute inset-0 bg-black/40" />
                                    <span className="relative z-10 px-4">{renderSelectionLabel(group.label)}</span>
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
                            {draftSecondaryTypeOptions.map((cat) => {
                              const scopeMainType = cat.selectionScope || draftMainType || cat.matchMainType;
                              const isSelected = isCategorySelectedForMainTypes(draftCategories, cat.label, draftSelectedMainTypes, scopeMainType);
                              return (
                              <button
                                key={`home-sub-${scopeMainType || "any"}-${cat.label}`}
                                type="button"
                                onClick={() => toggleDraftCategory(cat.label, scopeMainType)}
                                className={`relative h-28 overflow-hidden rounded-xl border text-left ${isSelected ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                              >
                                {renderSelectionCheckbox(isSelected)}
                                <img src={resolveTypeImageUrl(cat.imageUrl)} alt={getCategoryDisplayLabel(cat.label)} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                                <div className="pointer-events-none absolute inset-0 bg-black/40" />
                                <span className="relative z-10 px-3">{renderSelectionLabel(getCategoryDisplayLabel(cat.label))}</span>
                              </button>
                              );
                            })}
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
                      <div className="sticky top-0 z-10 bg-white pb-2">
                        <button type="button" onClick={confirmComfortSelection} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
                          Confirmer confort
                        </button>
                      </div>
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
                            {renderSelectionCheckbox(selected)}
                            <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={SEASIDE_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                            <div className="pointer-events-none absolute inset-0 bg-black/40" />
                            <span className="relative z-10">{renderSelectionLabel(SEASIDE_OPTION_LABELS[key])}</span>
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
                            {renderSelectionCheckbox(selected)}
                            <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={COMFORT_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                            <div className="pointer-events-none absolute inset-0 bg-black/40" />
                            <span className="relative z-10">{renderSelectionLabel(COMFORT_OPTION_LABELS[key])}</span>
                          </button>
                        );
                      })}
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
                        <button type="button" onClick={() => setSelectedLocations((prev) => prev.filter((value) => value !== item))} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {selectedTypeChipGroups.map(({ mainType, categories }) => (
                      <span key={`chip-main-type-${mainType}-${categories.map((item) => String(item || "").trim()).join("__") || "all"}`} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Home size={12} />
                        {categories.length > 0 ? `${MAIN_TYPE_LABELS[mainType]} : ${categories.map((item) => getCategoryDisplayLabel(item)).join(", ")}` : MAIN_TYPE_LABELS[mainType]}
                        <button type="button" onClick={() => {
                          if (categories.length > 0) {
                            const categorySet = new Set(categories.map((item) => String(item || "").trim()));
                            setSelectedCategories((prev) => prev.filter((item) => !categorySet.has(String(item || "").trim())));
                            return;
                          }
                          const nextMainTypes = selectedMainTypes.filter((value) => value !== mainType);
                          setSelectedMainTypes(nextMainTypes);
                          if (selectedMainType === mainType) {
                            setSelectedMainType("");
                          }
                          setSelectedCategories((prev) => removeCategoriesForMainType(prev, mainType, selectedMainTypes));
                        }} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {normalizedSelectedCategories
                      .filter((cat) => {
                        if (selectedMainTypes.includes("residence")) return false;
                        return !selectedMainTypes.includes(resolveSelectedCategoryMainType(cat, selectedMainTypes));
                      })
                      .map(cat => (
                      <span key={cat} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Home size={12} />
                        {getCategoryDisplayLabel(cat)}
                        <button type="button" onClick={() => setSelectedCategories((prev) => prev.filter((item) => item !== cat))} className="ml-1 hover:text-emerald-200">
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
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${draftSelectedLocations.length === 0 ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                    onClick={() => { setDraftSelectedLocations([]); resetCurrentLocationPath(); }}
                  >
                    Tous les emplacements
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (locationSelectionStep === "gouvernerat") return;
                      const previousStep = locationSelectionStep === "zone" ? "region" : "gouvernerat";
                      setLocationSelectionStep(previousStep);
                      setOpenLocationLevel(previousStep);
                    }}
                    disabled={locationSelectionStep === "gouvernerat"}
                    className="w-full rounded-xl border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Précédent
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (locationSelectionStep === "gouvernerat") {
                        setLocationSelectionStep("region");
                        setOpenLocationLevel("region");
                        return;
                      }
                      if (locationSelectionStep === "region") {
                        setLocationSelectionStep("zone");
                        setOpenLocationLevel("zone");
                        return;
                      }
                      confirmLocationSelection();
                    }}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
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
                        key={`mobile-location-step-${level}-${item}`}
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
                      {renderSelectionCheckbox(draftSelectedMainTypes.includes(group.mainType))}
                      <img src={resolveTypeImageUrl(group.imageUrl)} alt={group.label} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                      <div className="pointer-events-none absolute inset-0 bg-black/40" />
                      <span className="relative z-10 px-4">{renderSelectionLabel(group.label)}</span>
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
                  {draftSecondaryTypeOptions.map((cat) => {
                    const scopeMainType = cat.selectionScope || draftMainType || cat.matchMainType;
                    const isSelected = isCategorySelectedForMainTypes(draftCategories, cat.label, draftSelectedMainTypes, scopeMainType);
                    return (
                      <button
                        key={`mobile-sub-${scopeMainType || "any"}-${cat.label}`}
                        type="button"
                        onClick={() => toggleDraftCategory(cat.label, scopeMainType)}
                        className={`relative h-28 overflow-hidden rounded-xl border text-left ${isSelected ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                      >
                        {renderSelectionCheckbox(isSelected)}
                        <img src={resolveTypeImageUrl(cat.imageUrl)} alt={getCategoryDisplayLabel(cat.label)} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-black/40" />
                        <span className="relative z-10 px-3">{renderSelectionLabel(getCategoryDisplayLabel(cat.label))}</span>
                      </button>
                    );
                  })}
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
              <div className="sticky top-0 z-10 bg-white pb-2">
                <button type="button" onClick={confirmComfortSelection} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
                  Confirmer confort
                </button>
              </div>
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
                    {renderSelectionCheckbox(selected)}
                    <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={SEASIDE_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                    <span className="relative z-10">{renderSelectionLabel(SEASIDE_OPTION_LABELS[key])}</span>
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
                    {renderSelectionCheckbox(selected)}
                    <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={COMFORT_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                    <span className="relative z-10">{renderSelectionLabel(COMFORT_OPTION_LABELS[key])}</span>
                  </button>
                );
              })}
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
                    ? `${regularPropertyCards.length} bien${regularPropertyCards.length !== 1 ? 's' : ''} trouvé${regularPropertyCards.length !== 1 ? 's' : ''} selon vos critères`
                    : `Affichage du mode ${orderedModeTabs.find((tab) => tab.value === selectedMode)?.label.toLowerCase()}. Les biens en vedette apparaissent en premier.`}
              </p>
            </div>
            {!isSelectedModeComingSoon && !isHotelMode && (
              <div className="hidden md:flex items-center gap-3">
                <Link
                  to="/packs"
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-[linear-gradient(135deg,#fff8d6,#facc15)] px-5 py-2.5 text-sm font-bold text-amber-900 shadow-[0_12px_26px_rgba(245,158,11,0.16)] transition-transform hover:-translate-y-0.5"
                >
                  Voir nos packs
                </Link>
                <Link
                  to={(() => {
                    if (selectedMode === "vente") return "/ventes";
                    const params = applyAmicaleParam(new URLSearchParams(searchParams));
                    params.set("mode", selectedMode);
                    return `/logements?${params.toString()}`;
                  })()}
                  className="flex items-center gap-2 text-emerald-700 font-bold hover:text-emerald-800 transition-colors group"
                >
                  Voir tout le catalogue <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
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

              {hasSearched && (
                <div className="mb-6 space-y-4">
                  <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <p className="text-sm text-slate-400">Accueil - Liste Hôtels</p>
                        <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                          {loadingHotelResults
                            ? "Recherche en cours..."
                            : `${sortedHotelResults.length} hôtel${sortedHotelResults.length > 1 ? "s" : ""} trouvé${sortedHotelResults.length > 1 ? "s" : ""}${selectedHotelCity ? ` à ${selectedHotelCity.Name}` : ""}${hotelSearchPeriodLabel ? ` du ${hotelSearchPeriodLabel}` : ""} pour ${hotelTravellersLabel}`}
                        </h3>
                        <p className="mt-2 text-sm text-sky-700">Plus de détails</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void handleShareHotelSearch()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
                        >
                          <Upload size={16} />
                          Partager la recherche
                        </button>
                      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-2">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setHotelResultsFilterPanel((prev) => prev === "sort" ? null : "sort")}
                            className="inline-flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                          >
                            <span>
                              {{
                                recommended: "Recommandé",
                                price_asc: "Prix ASC",
                                price_desc: "Prix DESC",
                                stars_desc: "Catégorie DESC",
                                stars_asc: "Catégorie ASC",
                                name_asc: "Nom A-Z",
                              }[hotelResultsSort]}
                            </span>
                            <ChevronDown size={16} />
                          </button>
                          {hotelResultsFilterPanel === "sort" && (
                            <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_45px_rgba(15,23,42,0.16)]">
                              {[
                                ["recommended", "Recommandé"],
                                ["price_asc", "Prix ASC"],
                                ["price_desc", "Prix DESC"],
                                ["stars_desc", "Catégorie DESC"],
                                ["stars_asc", "Catégorie ASC"],
                                ["name_asc", "Nom A-Z"],
                              ].map(([value, label]) => (
                                <button
                                  key={`hotel-sort-${value}`}
                                  type="button"
                                  onClick={() => {
                                    setHotelResultsSort(value as HotelResultsSort);
                                    setHotelResultsFilterPanel(null);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${hotelResultsSort === value ? "bg-sky-50 text-sky-700" : "text-slate-700 hover:bg-slate-50"}`}
                                >
                                  <span>{label}</span>
                                  {hotelResultsSort === value ? <Check size={14} /> : null}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setHotelResultsFilterPanel((prev) => prev === "page_size" ? null : "page_size")}
                            className="inline-flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                          >
                            <span>{hotelResultsPageSize} hôtels</span>
                            <ChevronDown size={16} />
                          </button>
                          {hotelResultsFilterPanel === "page_size" && (
                            <div className="absolute right-0 z-20 mt-2 w-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_45px_rgba(15,23,42,0.16)]">
                              {HOTEL_RESULTS_PAGE_SIZE_OPTIONS.map((size) => (
                                <button
                                  key={`hotel-page-size-${size}`}
                                  type="button"
                                  onClick={() => {
                                    setHotelResultsPageSize(size);
                                    setHotelResultsFilterPanel(null);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${hotelResultsPageSize === size ? "bg-sky-50 text-sky-700" : "text-slate-700 hover:bg-slate-50"}`}
                                >
                                  <span>{size} hôtels</span>
                                  {hotelResultsPageSize === size ? <Check size={14} /> : null}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
                      {[
                        { key: "popular", label: "Filtres populaires" },
                        { key: "boarding", label: "Formule repas" },
                        { key: "category", label: "Catégorie" },
                        { key: "budget", label: "Budget" },
                        { key: "services", label: "Services" },
                        { key: "parameters", label: "Paramètres" },
                      ].map((filter) => (
                        <div key={`hotel-toolbar-${filter.key}`} className="relative">
                          <button
                            type="button"
                            onClick={() => setHotelResultsFilterPanel((prev) => prev === filter.key ? null : (filter.key as HotelResultsFilterPanel))}
                            className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 xl:w-auto xl:justify-start"
                          >
                            {filter.label}
                            <ChevronDown size={16} />
                          </button>

                          {hotelResultsFilterPanel === filter.key && filter.key === "popular" && (
                            <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.16)]">
                              <p className="text-lg font-semibold text-slate-900">Filtres populaires</p>
                              <div className="mt-4 space-y-3">
                                {[
                                  ["Promotions uniquement", hotelResultsOnlyPromotions, setHotelResultsOnlyPromotions],
                                  ["Annulation selon conditions", hotelResultsOnlyRefundable, setHotelResultsOnlyRefundable],
                                  ["Afficher seulement avec prix", hotelResultsOnlyWithPrice, setHotelResultsOnlyWithPrice],
                                  ["Offres sur demande", hotelResultsOnlyOnRequest, setHotelResultsOnlyOnRequest],
                                ].map(([label, checked, setter]) => (
                                  <label key={`popular-${label}`} className="flex items-center gap-3 text-sm text-slate-700">
                                    <input type="checkbox" checked={Boolean(checked)} onChange={(event) => (setter as Dispatch<SetStateAction<boolean>>)(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                                    <span>{label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {hotelResultsFilterPanel === filter.key && filter.key === "boarding" && (
                            <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.16)]">
                              <p className="text-lg font-semibold text-slate-900">Formule repas</p>
                              <div className="mt-4 max-h-72 space-y-3 overflow-auto">
                                {hotelResultBoardingCounts.length > 0 ? hotelResultBoardingCounts.map((item) => (
                                  <label key={`boarding-filter-${item.label}`} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                                    <span className="flex items-center gap-3">
                                      <input type="checkbox" checked={selectedHotelResultBoardings.includes(item.label)} onChange={() => toggleHotelResultSelection(item.label, setSelectedHotelResultBoardings)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                                      <span>{item.label}</span>
                                    </span>
                                    <span className="font-semibold text-sky-600">{item.count}</span>
                                  </label>
                                )) : (
                                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                    Aucune formule repas detaillee n'a ete retournee pour ces resultats.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {hotelResultsFilterPanel === filter.key && filter.key === "category" && (
                            <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.16)]">
                              <p className="text-lg font-semibold text-slate-900">Catégorie</p>
                              <div className="mt-4 space-y-3">
                                {hotelResultStarCounts.length > 0 ? hotelResultStarCounts.map((item) => (
                                  <label key={`star-filter-${item.label}`} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                                    <span className="flex items-center gap-3">
                                      <input type="checkbox" checked={selectedHotelResultStars.includes(item.label)} onChange={() => toggleHotelResultSelection(item.label, setSelectedHotelResultStars)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                                      <span>{item.label} étoile(s)</span>
                                    </span>
                                    <span className="font-semibold text-sky-600">{item.count}</span>
                                  </label>
                                )) : (
                                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                    Aucune categorie n'est disponible pour le filtrage sur ces resultats.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {hotelResultsFilterPanel === filter.key && filter.key === "budget" && (
                            <div className="absolute left-0 z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.16)]">
                              <p className="text-lg font-semibold text-slate-900">Budget</p>
                              <div className="mt-4 space-y-5">
                                <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                                  <span>{formatHotelPrice(hotelResultsBudgetMin ?? hotelResultPriceBounds.min) || "0"} DT</span>
                                  <span>{formatHotelPrice(hotelResultsBudgetMax ?? hotelResultPriceBounds.max) || "0"} DT</span>
                                </div>
                                <input type="range" min={hotelResultPriceBounds.min} max={hotelResultPriceBounds.max || hotelResultPriceBounds.min + 1} value={hotelResultsBudgetMin ?? hotelResultPriceBounds.min} onChange={(event) => setHotelResultsBudgetMin(Math.min(Number(event.target.value), hotelResultsBudgetMax ?? hotelResultPriceBounds.max))} className="w-full accent-sky-500" />
                                <input type="range" min={hotelResultPriceBounds.min} max={hotelResultPriceBounds.max || hotelResultPriceBounds.min + 1} value={hotelResultsBudgetMax ?? hotelResultPriceBounds.max} onChange={(event) => setHotelResultsBudgetMax(Math.max(Number(event.target.value), hotelResultsBudgetMin ?? hotelResultPriceBounds.min))} className="w-full accent-sky-500" />
                              </div>
                            </div>
                          )}

                          {hotelResultsFilterPanel === filter.key && filter.key === "services" && (
                            <div className="absolute left-0 z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.16)]">
                              <p className="text-lg font-semibold text-slate-900">Services</p>
                              <div className="mt-4 max-h-72 space-y-3 overflow-auto">
                                {hotelResultFacilityCounts.length > 0 ? hotelResultFacilityCounts.map((item) => (
                                  <label key={`facility-filter-${item.label}`} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                                    <span className="flex items-center gap-3">
                                      <input type="checkbox" checked={selectedHotelResultFacilities.includes(item.label)} onChange={() => toggleHotelResultSelection(item.label, setSelectedHotelResultFacilities)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                                      <span>{item.label}</span>
                                    </span>
                                    <span className="font-semibold text-sky-600">{item.count}</span>
                                  </label>
                                )) : (
                                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                    Aucun service exploitable n'a ete trouve dans les resultats actuels.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {hotelResultsFilterPanel === filter.key && filter.key === "parameters" && (
                            <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.16)]">
                              <p className="text-lg font-semibold text-slate-900">Paramètres</p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {selectedHotelResultBoardings.length + selectedHotelResultStars.length + selectedHotelResultFacilities.length + Number(hotelResultsOnlyPromotions) + Number(hotelResultsOnlyRefundable) + Number(hotelResultsOnlyWithPrice) + Number(hotelResultsOnlyOnRequest) > 0 ? (
                                  <>
                                    {selectedHotelResultBoardings.map((item) => <span key={`active-boarding-${item}`} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{item}</span>)}
                                    {selectedHotelResultStars.map((item) => <span key={`active-star-${item}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{item}*</span>)}
                                    {selectedHotelResultFacilities.map((item) => <span key={`active-fac-${item}`} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{item}</span>)}
                                  </>
                                ) : (
                                  <p className="text-sm text-slate-500">Aucun filtre actif pour le moment.</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedHotelResultBoardings([]);
                                  setSelectedHotelResultStars([]);
                                  setSelectedHotelResultFacilities([]);
                                  setHotelResultsOnlyPromotions(false);
                                  setHotelResultsOnlyRefundable(false);
                                  setHotelResultsOnlyWithPrice(false);
                                  setHotelResultsOnlyOnRequest(false);
                                  setHotelResultsBudgetMin(hotelResultPriceBounds.min);
                                  setHotelResultsBudgetMax(hotelResultPriceBounds.max);
                                  setHotelResultsFilterPanel(null);
                                }}
                                className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                              >
                                Réinitialiser
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <Search size={18} className="text-slate-400" />
                          <input
                            value={hotelResultsSearchTerm}
                            onChange={(event) => setHotelResultsSearchTerm(event.target.value)}
                            placeholder="Recherchez un hôtel dans la liste"
                            className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                      <div className={`items-center gap-3 self-end lg:self-auto ${isMobileHotelResultsViewport ? "hidden" : "flex"}`}>
                        <span className="text-sm font-semibold text-slate-900">Mode d'affichage</span>
                        <button type="button" onClick={() => setHotelResultsView("list")} className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${effectiveHotelResultsView === "list" ? "border-sky-500 bg-sky-500 text-white" : "border-slate-200 bg-white text-slate-400"}`}>
                          <Rows3 size={18} />
                        </button>
                        <button type="button" onClick={() => setHotelResultsView("grid")} className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${effectiveHotelResultsView === "grid" ? "border-sky-500 bg-sky-500 text-white" : "border-slate-200 bg-white text-slate-400"}`}>
                          <LayoutGrid size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
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
                  {hotelSearchInfoMessage && !hotelSearchFallbackNotice && (
                    <p className="mt-3 text-sm text-slate-600">
                      {hotelSearchInfoMessage}
                    </p>
                  )}
                </div>
              )}

              {!loadingHotelResults && sortedHotelResults.length > 0 && (
                <div className={effectiveHotelResultsView === "list" ? "space-y-6" : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"}>
                  {visibleHotelResults.map((hotel) => {
                    const hotelId = Number(hotel.Id || 0);
                    const hotelStarCount = getHotelStarCount(hotel.Category?.Star ?? hotel.Star);
                    const isResultDetailsExpanded = effectiveHotelResultsView === "grid" || Boolean(expandedHotelResultDetailsById[hotelId]);
                    const minPrice = extractHotelMinPrice(hotel, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow);
                    const roomOffers = flattenHotelRoomOffers(hotel);
                    const leadOffer = roomOffers.find((offer) => pickHotelDisplayedPrice(offer.room, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow) !== null) || roomOffers[0] || null;
                    const leadOfferPrice = leadOffer ? pickHotelDisplayedPrice(leadOffer.room, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow) : null;
                    const hasPromotion = hasHotelPromotion(hotel);
                    const hasRefundableOffer = roomOffers.some((offer) => !offer.room?.NotRefundable);
                    const hasOnRequestOffer = roomOffers.some((offer) => Boolean(offer.room?.OnRequest || offer.room?.StopReservation));
                    const boardings = extractHotelBoardingNames(hotel).slice(0, 3);
                    const facilities = getHotelFacilityTitles(hotel.Facilities, 6);
                    const mapsLink = buildHotelMapsLink(hotel);
                    const promotionTitle = String(hotel.Promotion?.Title || hotel.Promotion?.Description || "").trim();
                    const promotionRate = Number(hotel.Promotion?.Rate || 0);
                    const cityShortDescription = String(hotel.City?.ShortDescription || "").trim();
                    const hotelAddress = String(hotel.Adress || "").trim();
                    const boardingMap = new Map<string, { key: string; boardingId: number | null; boardingName: string; price: number | null }>();
                    roomOffers.forEach((offer) => {
                    const offerPrice = pickHotelDisplayedPrice(offer.room, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow);
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
                    const roomTypeCount = new Set(
                      roomOffers
                        .map((offer) => String(offer.room?.Name || "").trim())
                        .filter(Boolean)
                    ).size;
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
                          const roomPrice = pickHotelDisplayedPrice(room, activeAmicaleHotelMarkupPercent, isAmicaleHotelFlow);
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
                    const detailParams = applyAmicaleParam(new URLSearchParams(searchParams));
                    detailParams.set("mode", "hotellerie");
                    if (hotelCityId > 0) detailParams.set("cityId", String(hotelCityId));
                    else detailParams.delete("cityId");
                    if (hotelCheckIn) detailParams.set("checkIn", hotelCheckIn);
                    else detailParams.delete("checkIn");
                    if (hotelCheckOut) detailParams.set("checkOut", hotelCheckOut);
                    else detailParams.delete("checkOut");
                    detailParams.set("adults", String(totalRoomAdults));
                    if (totalRoomChildren > 0) detailParams.set("children", flattenHotelRoomChildAges(roomTravellers).join(","));
                    else detailParams.delete("children");
                    if (resolvedRoomChoices[0]?.selectedBoardingOption?.boardingId) detailParams.set("boardingId", String(resolvedRoomChoices[0].selectedBoardingOption.boardingId));
                    if (resolvedRoomChoices[0]?.selectedRoomOption?.roomId) detailParams.set("roomId", String(resolvedRoomChoices[0].selectedRoomOption.roomId));
                    detailParams.delete("amicale");
                    detailParams.delete("partner");
                    detailParams.delete("partnerMargin");
                    detailParams.delete("publicPartnerSlug");
                    detailParams.delete("publicPartnerKind");
                    if (activePublicPartnerSlug) {
                      detailParams.set("publicPartnerSlug", activePublicPartnerSlug);
                      if (activePublicPartnerKind) detailParams.set("publicPartnerKind", activePublicPartnerKind);
                    } else if (activeAmicaleId) {
                      detailParams.set("amicale", activeAmicaleId);
                    } else if (activePartnerAgencyId) {
                      detailParams.set("partner", activePartnerAgencyId);
                    }
                    detailParams.set("returnTo", `${routerLocation.pathname}${routerLocation.search}`);
                    const linkTo = `/hotels/${encodeURIComponent(String(hotel.Id))}${detailParams.toString() ? `?${detailParams.toString()}` : ""}`;
                    return (
                      <article
                        key={hotel.Id}
                        className={`group overflow-hidden rounded-[30px] bg-white transition hover:-translate-y-1 ${
                          hasPromotion
                            ? "border border-amber-200 shadow-[0_18px_48px_rgba(217,119,6,0.18)] hover:shadow-[0_30px_70px_rgba(217,119,6,0.28)]"
                            : "border border-slate-100 shadow-[0_18px_48px_rgba(15,23,42,0.08)] hover:shadow-[0_28px_60px_rgba(15,23,42,0.12)]"
                        } ${effectiveHotelResultsView === "list" ? "mx-auto w-full max-w-[1160px] lg:grid lg:grid-cols-[280px_minmax(0,1fr)]" : ""}`}
                      >
                        <Link to={linkTo} className="block">
                          <div className={`relative overflow-hidden ${effectiveHotelResultsView === "list" ? "h-full min-h-[260px]" : "aspect-[16/10] sm:aspect-[16/10]"}`}>
                            <img
                              src={String(hotel.Image || "").trim() || HOTEL_FALLBACK_IMAGE}
                              alt={hotel.Name}
                              className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/10 to-transparent" />
                            {hotelStarCount > 0 ? (
                              <div className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/14 px-3 py-1 text-amber-300 backdrop-blur">
                                {Array.from({ length: hotelStarCount }).map((_, starIndex) => (
                                  <Star key={`${hotel.Id}-cover-star-${starIndex}`} size={12} className="fill-current" />
                                ))}
                              </div>
                            ) : null}
                            {hasPromotion && (
                              <div className="absolute right-3 top-3 z-10 rounded-[22px] border border-white/35 bg-[radial-gradient(circle_at_top,_rgba(253,224,71,0.98)_0%,_rgba(249,115,22,0.97)_38%,_rgba(220,38,38,0.98)_100%)] px-3 py-2 text-white shadow-[0_16px_35px_rgba(220,38,38,0.38)] ring-1 ring-black/5 backdrop-blur-sm sm:right-4 sm:top-4 sm:px-4">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/18">
                                    <Sparkles size={14} className="text-yellow-100" />
                                  </span>
                                  <div className="leading-none">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-50/90">
                                      Promo
                                    </p>
                                    <p className="mt-1 text-lg font-black tracking-tight sm:text-xl">
                                      {promotionRate > 0 ? `-${promotionRate}%` : promotionTitle || "OFFRE"}
                                    </p>
                                  </div>
                                </div>
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
                            <div className="mt-3 flex flex-wrap gap-2">
                              {hotelStarCount > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                  {Array.from({ length: hotelStarCount }).map((_, starIndex) => (
                                    <Star key={`${hotel.Id}-chip-star-${starIndex}`} size={11} className="fill-current" />
                                  ))}
                                </span>
                              ) : null}
                              {Number(hotel.Recommended || 0) > 0 ? (
                                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 size={12} />
                                  Recommande
                                </span>
                              ) : null}
                              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                                hasOnRequestOffer
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-sky-200 bg-sky-50 text-sky-700"
                              }`}>
                                <CircleDollarSign size={12} />
                                {hasOnRequestOffer ? "Sur demande possible" : "Tarif affiche"}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
                              <span className="inline-flex items-center gap-2">
                                <MapPin size={14} className="text-sky-600" />
                                {cityShortDescription || hotelAddress || hotel.City?.Name || "Tunisie"}
                              </span>
                              {boardingOptions.length > 0 ? (
                                <span className="inline-flex items-center gap-2">
                                  <UtensilsCrossed size={14} className="text-sky-600" />
                                  {boardingOptions.length} formule{boardingOptions.length > 1 ? "s" : ""}
                                </span>
                              ) : null}
                              {roomTypeCount > 0 ? (
                                <span className="inline-flex items-center gap-2">
                                  <BedDouble size={14} className="text-sky-600" />
                                  {roomTypeCount} type{roomTypeCount > 1 ? "s" : ""} de chambre
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-500">
                              {getHotelCardDescription(hotel)}
                            </p>
                          </div>

                          {facilities.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {facilities.slice(0, 4).map((item) => (
                                <span key={`${hotel.Id}-facility-${item}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                                  {item}
                                </span>
                              ))}
                              {facilities.length > 4 ? (
                                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">+{facilities.length - 4} plus</span>
                              ) : null}
                            </div>
                          )}

                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">A partir de</p>
                              <p className="mt-2 text-lg font-semibold text-slate-900">
                                {displayedClientPrice !== null ? `${formatHotelPrice(displayedClientPrice)} TND` : "Sur demande"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {resolvedRoomChoices[0]?.selectedBoardingOption?.boardingName || leadOffer?.boardingName || "Selon les chambres"}
                              </p>
                            </div>
                            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Conditions</p>
                              <p className={`mt-2 text-sm font-semibold ${hasRefundableOffer ? "text-emerald-700" : "text-amber-700"}`}>
                                {hasRefundableOffer ? "Annulation selon conditions" : "Non remboursable"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {hasOnRequestOffer ? "Certaines offres sont sur demande." : "Reservation directe selon disponibilite."}
                              </p>
                            </div>
                            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Total sejour</p>
                              <p className="mt-2 text-lg font-semibold text-slate-900">
                                {Number.isFinite(totalClientPrice) && totalClientPrice > 0 ? `${formatHotelPrice(totalClientPrice)} TND` : "Sur demande"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {roomCount} chambre{roomCount > 1 ? "s" : ""} • {totalRoomAdults} adulte{totalRoomAdults > 1 ? "s" : ""}{totalRoomChildren > 0 ? ` • ${totalRoomChildren} enfant${totalRoomChildren > 1 ? "s" : ""}` : ""}
                              </p>
                            </div>
                          </div>

                          {effectiveHotelResultsView === "list" && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setExpandedHotelResultDetailsById((prev) => ({
                                  ...prev,
                                  [hotelId]: !prev[hotelId],
                                }))}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:border-sky-400 hover:text-sky-700"
                              >
                                {isResultDetailsExpanded ? "Réduire les détails" : "Développer les détails"}
                                {isResultDetailsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </div>
                          )}

                          {isResultDetailsExpanded && (
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

                            {boardings.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {boardings.map((item) => (
                                  <span key={`${hotel.Id}-boarding-${item}`} className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                                    <UtensilsCrossed size={12} />
                                    {item}
                                  </span>
                                ))}
                              </div>
                            )}

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
                                        setHotelCriteriaGlowTarget(hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut) ? "action" : "dates");
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
                                        setHotelCriteriaGlowTarget(hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut) ? "action" : "dates");
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
                                                setHotelCriteriaGlowTarget(hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut) ? "action" : "dates");
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
                                                setHotelCriteriaGlowTarget(hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut) ? "action" : "dates");
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
                                                setHotelCriteriaGlowTarget(hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut) ? "action" : "dates");
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
                                                setHotelCriteriaGlowTarget(hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut) ? "action" : "dates");
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
                                                    setHotelCriteriaGlowTarget(hasValidHotelSearchDates(hotelCheckIn, hotelCheckOut) ? "action" : "dates");
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
                          )}

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
                                className={`inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold text-white transition sm:px-4 sm:text-sm ${
                                  hotelCriteriaGlowTarget === "action"
                                    ? "border-amber-300 shadow-[0_0_0_3px_rgba(251,191,36,0.24),0_18px_40px_rgba(245,158,11,0.24)]"
                                    : "border-transparent"
                                } ${
                                  isAvailabilityVerified
                                    ? "bg-sky-600 hover:bg-sky-700"
                                    : "bg-amber-500 hover:bg-amber-600"
                                } disabled:cursor-not-allowed disabled:opacity-70`}
                              >
                                {checkingAvailabilityHotelId === hotelId ? "Vérification..." : availabilityActionLabel}
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
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
                              {hasPromotion ? (
                                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                  <Sparkles size={13} />
                                  Promotion disponible
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3">
                              {mapsLink ? (
                                <a
                                  href={mapsLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
                                >
                                  Carte <ExternalLink size={14} />
                                </a>
                              ) : null}
                              <Link to={linkTo} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
                                Détails
                              </Link>
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

          {!isSelectedModeComingSoon && !isHotelMode && flashPropertyCards.length > 0 && (
            <div
              ref={flashSectionRef}
              id="ventes-flash-section"
              className="mb-8 rounded-[30px] border border-orange-100 bg-[linear-gradient(135deg,#fff7ed,#fff1f2)] px-4 py-5 shadow-[0_18px_44px_rgba(249,115,22,0.08)] md:px-6 md:py-7"
            >
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h3 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                    <Flame className="text-orange-500" size={24} />
                    Ventes flash
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600">
                    Offres limitées avec compteur actif. Chaque bien n'apparait qu'une seule fois avec toutes ses periodes flash.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700">
                  {flashPropertyCards.length} bien{flashPropertyCards.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {flashPropertyCards.map((card) => (
                  <PropertyCard
                    key={card.key}
                    property={card.property}
                    searchParams={card.searchParams}
                    cardVariant={card.cardVariant}
                    flashOffer={card.flashOffer}
                    flashOffers={card.flashOffers}
                    pricingAmicaleId={activeAmicaleId}
                    partnerAgencyMarginMultiplier={activePartnerAgencyMarginMultiplier}
                    publicPartnerSlug={publicPartnerSlug}
                  />
                ))}
              </div>
            </div>
          )}

          {!isSelectedModeComingSoon && !isHotelMode && (<div className="rounded-[30px] border border-gray-100 bg-white px-4 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] md:px-6 md:py-7">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {visibleRegularPropertyCards.map((card) => (
                <PropertyCard
                  key={card.key}
                  property={card.property}
                  searchParams={card.searchParams}
                  cardVariant={card.cardVariant}
                  flashOffer={card.flashOffer}
                  pricingAmicaleId={activeAmicaleId}
                  partnerAgencyMarginMultiplier={activePartnerAgencyMarginMultiplier}
                  publicPartnerSlug={publicPartnerSlug}
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
            {hasMoreFilteredProperties && (
              <div ref={propertiesAutoLoadTriggerRef} className="h-1 w-full" aria-hidden="true" />
            )}
            {regularPropertyCards.length > INITIAL_VISIBLE_PROPERTIES && (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {hasMoreFilteredProperties && (
                  <button
                    type="button"
                    onClick={loadNextRegularProperties}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    Suivant
                  </button>
                )}
                {!showAllProperties && (
                  <>
                    <Link
                      to={publicPartnerSlug ? publicListingLink : "/packs"}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-[linear-gradient(135deg,#fff8d6,#facc15)] px-5 py-2.5 text-sm font-semibold text-amber-900 shadow-[0_12px_24px_rgba(245,158,11,0.14)] transition-colors hover:brightness-105"
                    >
                      Voir nos packs
                    </Link>
                    <button
                      type="button"
                      onClick={() => setShowAllProperties(true)}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                    >
                      Voir tout le catalogue
                    </button>
                  </>
                )}
              </div>
            )}
          </div>)}
          
          {regularPropertyCards.length === 0 && hasSearched && !isSelectedModeComingSoon && !isHotelMode && (
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
              <Link to={selectedMode === "vente" ? "/ventes" : publicListingLink} className="inline-flex items-center gap-2 text-emerald-700 font-bold hover:text-emerald-800 transition-colors border-2 border-emerald-700 px-6 py-3 rounded-full hover:bg-emerald-50">
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
            <div className="fixed inset-0 z-[9999] flex flex-col bg-[linear-gradient(160deg,#ffffff,#f6faff)] md:hidden">
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
                      setHotelDestinationScopeConfirmed(false);
                      if (nextValue.trim()) setHotelDestinationTab("villes");
                      if (!nextValue.trim()) {
                        setHotelCityId(0);
                        setSelectedHotelId(0);
                        setHotelDestinationScopeConfirmed(false);
                        setHotelDestinationTab("destinations");
                      }
                    }}
                    placeholder="ex. ville, nom hotel"
                    className="w-full border-0 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
              <div className="border-b border-slate-200 px-4 py-4">
                <p className="text-[15px] font-medium leading-6 text-slate-900">Entrez une ou plusieurs destinations ou établissements</p>
                {(hotelDestinationSelectionLabel || selectedHotelLabel) ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {hotelDestinationSelectionLabel ? (
                        <div className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">
                          <span>{hotelDestinationSelectionLabel}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              resetHotelDestinationSelection();
                            }}
                            className="rounded-full text-white/90 transition hover:text-white"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : null}
                      {selectedHotelLabel ? (
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                          <span>{selectedHotelLabel}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              clearSelectedHotelDestinationHotel();
                            }}
                            className="rounded-full text-white/90 transition hover:text-white"
                            aria-label="Supprimer l'hôtel sélectionné"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={resetHotelDestinationSelection}
                      className="text-sm font-medium text-rose-500"
                    >
                      Supprimer tout
                    </button>
                  </div>
                ) : null}
                <div className="mt-4 flex overflow-hidden rounded-xl border border-sky-500 bg-white">
                  {hotelDestinationTabMeta.map((tab) => (
                    <button
                      key={`mobile-hotel-destination-tab-${tab.key}`}
                      type="button"
                      onClick={() => setHotelDestinationTab(tab.key)}
                      className={`flex-1 px-2 py-2 text-[13px] font-semibold transition ${
                        hotelDestinationTab === tab.key ? "bg-sky-500 text-white" : "text-slate-700"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={hotelDestinationMobileListRef} className="min-h-0 flex-1 overflow-y-auto pb-8" onScroll={handleHotelDestinationScroll}>
                {hotelDestinationTab === "hotels" && selectedHotelCity && (
                  <div className="bg-white px-4 pb-2 pt-4">
                    <button
                      type="button"
                      onClick={showAllHotelDestinationChoices}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(2,132,199,0.28)] transition active:scale-[0.99]"
                    >
                      Voir tous les choix
                    </button>
                  </div>
                )}
                {(hotelDestinationTab === "destinations" ? featuredHotelCities : hotelDestinationTab === "villes" ? filteredHotelCities : []).map((city) => (
                  hotelDestinationTab === "destinations" || hotelDestinationTab === "villes" ? (
                    <button
                      key={`mobile-home-hotel-city-${hotelDestinationTab}-${city.Id}`}
                      type="button"
                      onClick={() => selectHotelDestinationCity(city)}
                      className="flex w-full items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 text-left transition active:bg-sky-50"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                        <MapPin size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px] font-semibold text-slate-900">{city.Name}</p>
                        <p className="text-[12px] text-slate-500">Tunisie</p>
                      </div>
                      {getHotelCityCountLabel(Number(city.Id)) ? (
                        <span className="shrink-0 text-sm font-semibold text-violet-500">{getHotelCityCountLabel(Number(city.Id))}</span>
                      ) : null}
                    </button>
                  ) : null
                ))}
                {hotelDestinationTab === "top" && featuredHotels.map((hotel) => (
                  <button
                    key={`mobile-featured-hotel-${hotel.Id}`}
                    type="button"
                    onClick={() => selectHotelDestinationHotel(hotel)}
                    className="flex w-full items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 text-left transition active:bg-sky-50"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                      <BedDouble size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold text-slate-900">{hotel.Name}</p>
                      <p className="text-[12px] text-slate-500">Tunisie, {hotel?.City?.Name || "Destination"}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-violet-500">(1)</span>
                  </button>
                ))}
                {loadingHotelsByCity && hotelDestinationTab === "hotels" && (
                  <div className="border-b border-slate-200 px-4 py-3 text-[13px] text-slate-500">
                    Chargement des hôtels...
                  </div>
                )}
                {hotelDestinationTab === "hotels" && visibleFilteredHotelsByCity.map((hotel) => (
                  <button
                    key={`mobile-home-hotel-name-${hotel.Id}`}
                    type="button"
                    onClick={() => selectHotelDestinationHotel(hotel)}
                    className="flex w-full items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 text-left transition active:bg-sky-50"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                      <BedDouble size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold text-slate-900">{hotel.Name}</p>
                      <p className="text-[12px] text-slate-500">Tunisie, {hotel?.City?.Name || "Destination"}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-violet-500">(1)</span>
                  </button>
                ))}
                {((hotelDestinationTab === "top" && featuredHotels.length === 0)
                  || (hotelDestinationTab === "hotels" && !loadingHotelsByCity && filteredHotelsByCity.length === 0)
                  || (hotelDestinationTab === "destinations" && featuredHotelCities.length === 0)
                  || (hotelDestinationTab === "villes" && filteredHotelCities.length === 0)) && (
                  <div className="px-4 py-6 text-sm text-slate-500">
                    Aucun résultat pour cet onglet.
                  </div>
                )}
                {hotelDestinationTab === "hotels" && visibleFilteredHotelsByCity.length < filteredHotelsByCity.length && (
                  <div className="px-4 py-3 text-center text-xs font-medium text-slate-500">
                    Faites défiler pour charger plus d'hôtels
                  </div>
                )}
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
                    <button type="button" disabled={!providers.apple} onClick={() => handlePromptSocialLogin("apple")} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                      Continuer avec Apple / iCloud
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
                    <p className="text-sm text-gray-600">Completez votre identite. Le popup reste bloque tant que la CIN recto et verso ne sont pas enregistrees.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={profilePromptForm.firstName} onChange={(e) => setProfilePromptForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Prenom *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                      <input type="text" value={profilePromptForm.lastName} onChange={(e) => setProfilePromptForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Nom *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    </div>
                    <input type="tel" value={profilePromptForm.telephone} onChange={(e) => setProfilePromptForm((p) => ({ ...p, telephone: e.target.value }))} placeholder="Telephone *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    <input type="text" value={profilePromptForm.address} onChange={(e) => setProfilePromptForm((p) => ({ ...p, address: e.target.value }))} placeholder="Adresse *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    <input type="text" value={profilePromptForm.cin} onChange={(e) => setProfilePromptForm((p) => ({ ...p, cin: e.target.value }))} placeholder="CIN *" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:col-span-2">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Recto</p>
                        <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-gray-800">
                          <Upload className="h-4 w-4" />
                          {isProfileCinUploading ? "Upload photo CIN..." : "Uploader recto *"}
                          <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleProfileCinUpload(event, "recto")} />
                        </label>
                        {profilePromptForm.cinImageRectoUrl ? (
                          <img src={profilePromptForm.cinImageRectoUrl} alt="Photo CIN recto" className="mt-2 h-32 w-full rounded-xl border border-emerald-200 object-cover" />
                        ) : null}
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Verso</p>
                        <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-gray-800">
                          <Upload className="h-4 w-4" />
                          {isProfileCinUploading ? "Upload photo CIN..." : "Uploader verso *"}
                          <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleProfileCinUpload(event, "verso")} />
                        </label>
                        {profilePromptForm.cinImageVersoUrl ? (
                          <img src={profilePromptForm.cinImageVersoUrl} alt="Photo CIN verso" className="mt-2 h-32 w-full rounded-xl border border-emerald-200 object-cover" />
                        ) : null}
                      </div>
                    </div>
                    {(!profilePromptForm.cinImageRectoUrl || !profilePromptForm.cinImageVersoUrl) ? (
                      <p className="text-xs text-red-600 sm:col-span-2">Les photos CIN recto et verso sont obligatoires pour continuer.</p>
                    ) : null}
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
                      value={hotelReserveModal.paymentMode === "amicale" ? hotelReserveModal.amicalePhone : hotelReserveModal.phone}
                      onChange={(event) =>
                        setHotelReserveModal((prev) =>
                          prev
                            ? (prev.paymentMode === "amicale"
                                ? { ...prev, amicalePhone: event.target.value }
                                : { ...prev, phone: event.target.value })
                            : prev
                        )
                      }
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-[15px] sm:text-sm text-slate-900 outline-none focus:border-sky-500"
                      placeholder="Ex: 98 123 456"
                    />
                  </label>
                  {hotelReserveModal.paymentMode === "amicale" && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Formulaire amicale</p>
                      <div className="mt-3 grid gap-2">
                        <div>
                          <p className="mb-2 text-xs font-semibold text-emerald-800">Selectionner amicale</p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {hotelAmicaleOptions.map((item) => (
                              <button
                                key={`hotel-amicale-${item.id}`}
                                type="button"
                                onClick={() =>
                                  setHotelReserveModal((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          amicaleSelectionId: item.id,
                                        }
                                      : prev
                                  )
                                }
                                className={`relative h-16 overflow-hidden rounded-lg border text-left transition ${
                                  hotelReserveModal.amicaleSelectionId === item.id
                                    ? "border-emerald-600 ring-2 ring-emerald-300"
                                    : "border-emerald-200 hover:border-emerald-400"
                                }`}
                              >
                                {item.logoUrl ? (
                                  <div
                                    className="absolute inset-0 bg-no-repeat"
                                    style={{ backgroundImage: `url(${item.logoUrl})`, backgroundSize: "100% 100%" }}
                                  />
                                ) : (
                                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-100 to-white" />
                                )}
                                <div className="absolute inset-0 bg-black/25" />
                                <div className="relative z-10 px-3 py-2 text-sm font-semibold text-white">
                                  {item.name}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type="text"
                          value={hotelReserveModal.amicaleFullName}
                          onChange={(event) => setHotelReserveModal((prev) => (prev ? { ...prev, amicaleFullName: event.target.value } : prev))}
                          placeholder="Nom et prenom"
                          className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                        <input
                          type="text"
                          value={hotelReserveModal.amicaleMatricule}
                          onChange={(event) => setHotelReserveModal((prev) => (prev ? { ...prev, amicaleMatricule: event.target.value } : prev))}
                          placeholder="Identifiant interne (Matricule)"
                          className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                        <input
                          type="text"
                          value={hotelReserveModal.amicaleCode}
                          onChange={(event) => setHotelReserveModal((prev) => (prev ? { ...prev, amicaleCode: event.target.value } : prev))}
                          placeholder="Code"
                          className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      </div>
                    </div>
                  )}
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
                    {hotelReserveModal.paymentMode === "amicale" ? "Envoyer la demande amicale" : "Proceder au paiement"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {hotelTravellersOpen && (
            <div className="fixed inset-0 z-[9999] bg-[linear-gradient(160deg,#ffffff,#f6faff)] md:hidden">
              <div className="relative border-b border-slate-200 px-5 py-4">
                <h3 className="text-[18px] font-semibold text-slate-900">Chambres et voyageurs</h3>
                <button type="button" onClick={() => setHotelTravellersOpen(false)} className="absolute right-3 top-3 rounded-full p-2 text-slate-700">
                  <X size={22} />
                </button>
              </div>
              <div className="max-h-[calc(100vh-130px)] overflow-y-auto px-5 py-5">
                <div className="space-y-7 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[16px] font-medium text-slate-900">Chambres</p>
                    <div className="flex min-w-[168px] items-center justify-between rounded-xl border border-slate-300 bg-slate-50 px-5 py-3 text-slate-900">
                      <button type="button" className="text-sky-600" onClick={() => setHotelRoomCount(sharedHotelRoomCount - 1)}><Minus size={18} /></button>
                      <span className="w-8 text-center text-[18px] font-semibold text-slate-900">{sharedHotelRoomCount}</span>
                      <button type="button" className="text-sky-600" onClick={() => setHotelRoomCount(sharedHotelRoomCount + 1)}><Plus size={18} /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[16px] font-medium text-slate-900">Adultes</p>
                    <div className="flex min-w-[168px] items-center justify-between rounded-xl border border-slate-300 bg-slate-50 px-5 py-3 text-slate-900">
                      <button type="button" className="text-sky-600" onClick={() => updateHotelAdults(hotelAdults - 1)}><Minus size={18} /></button>
                      <span className="w-8 text-center text-[18px] font-semibold text-slate-900">{hotelAdults}</span>
                      <button type="button" className="text-sky-600" onClick={() => updateHotelAdults(hotelAdults + 1)}><Plus size={18} /></button>
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
      {showChatbotWidget ? (
        <Suspense fallback={null}>
          <LazyWebsiteChatbotWidget />
        </Suspense>
      ) : null}
    </div>
  );
}

function getHotelStarCount(value: string | number | null | undefined) {
  const numericValue = Math.max(0, Math.min(5, Math.floor(Number(value) || 0)));
  return numericValue;
}















