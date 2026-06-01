import { useParams, Link, useSearchParams, Navigate, useNavigate, useLocation } from "react-router";
import { useProperties } from "../context/PropertiesContext";
import { MapPin, Check, Star, Share2, Heart, Calendar, X, ChevronLeft, ChevronRight, ArrowRight, Facebook, Globe, MessageCircle, BedSingle, Minus, Plus, Wallet, Building2, Mountain, Route, ShieldCheck, Users, Volume2, Clock3, ListChecks, ChevronDown, ChevronUp, Wifi, Snowflake, UtensilsCrossed, Car, Tv, Waves, Trees, PawPrint, Cigarette, ConciergeBell, House, Bath, Info, KeyRound } from "lucide-react";
import useEmblaCarousel from 'embla-carousel-react';
import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, cloneElement } from "react";
import { createPortal } from "react-dom";
import AvailabilityCalendar from "../components/AvailabilityCalendar";
import { format, differenceInDays, isWithinInterval, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { trackPublicClientInteraction } from "../utils/clientInteractions";
import { getOrCreateTrackingSessionId, hasTrackingConsent } from "../utils/consent";
import { completeSocialProfile, getAuthProviders, loginWithPasskey, registerWithPasskey, startSocialLogin } from "../services/auth";
import { canRenderVideoInIframe, isFacebookReelUrl, isFacebookVideoUrl, isVerticalVideoUrl, toVideoEmbedUrl, toVideoExternalUrl } from "../utils/videoLinks";
import { buildApiUrl } from "../utils/api";
import { getOptimizedMediaUrl, getOriginalMediaUrl } from "../utils/media";
import { hasFailedImageSource, markFailedImageSource } from "../utils/imageFailures";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { getFeatureIconElement } from "../utils/featureIcons";
import { getServiceDisplayPrice, getServiceTarificationLabel, splitServicesByTarification } from "../utils/servicePayants";
import { calculateAccommodationPricing, getPeriodMinStayForDate, getReservationMinStayRequirement, getReservationWeekdayRule, validateCheckinWeekdayRule, validateReservationWeekdayRule, resolveCurrentPricing } from "../utils/seasonalPricing";
import { computeGuestLimits } from "../utils/guestLimits";
import { SmartImage } from "../components/SmartImage";
import { MapContainer, TileLayer, Circle } from "react-leaflet";
import logo from "../../../logo dwira.jpg";
import { buildPropertyDetailsPath, buildReservationConfirmationPath, getPropertyRouteToken, propertyMatchesRouteToken } from "../utils/propertyRouting";
import { applyAmicaleTtc, formatTnd } from "../utils/amicalePricing";
import {
  clearAuthPendingLogin,
  isAuthPendingLogin,
  markAuthPendingLogin,
  saveAuthReturnTo,
  savePendingReservationDraft,
  readPendingReservationDraft,
  type PendingReservationDraft,
} from "../utils/pendingReservation";
import { fetchAmicalesPublic } from "../utils/amicales";
const API_URL = import.meta.env.VITE_API_URL || '/api';
const GALLERY_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 675'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23e5e7eb'/%3E%3Cstop offset='100%25' stop-color='%23cbd5e1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='675' fill='url(%23g)'/%3E%3C/svg%3E";
const ENABLE_EXTERNAL_NEARBY_FALLBACK = String(import.meta.env.VITE_ENABLE_EXTERNAL_NEARBY_FALLBACK || 'true').trim().toLowerCase() !== 'false';
const ENABLE_MEDIA_AVAILABILITY_PROBE = String(import.meta.env.VITE_ENABLE_MEDIA_AVAILABILITY_PROBE || '').trim().toLowerCase() === 'true';
const LIGHTBOX_QUALITY_LOW = 42;
const LIGHTBOX_QUALITY_MEDIUM = 58;
const LIGHTBOX_QUALITY_HIGH = 70;
const GOOGLE_HYBRID_TILE_URL = "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
const GOOGLE_TILE_ATTRIBUTION = '&copy; <a href="https://maps.google.com">Google</a>';

function canLoadFullResByConnection(): boolean {
  if (typeof navigator === "undefined") return true;
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  const type = String(connection.effectiveType || "").toLowerCase();
  return type === "" || type === "4g";
}

type FeatureApiRow = {
  id: string;
  nom: string;
  onglet_id?: string | null;
  onglet_nom?: string | null;
  type_caracteristique?: 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte' | null;
  unite?: string | null;
  icon_name?: string | null;
  valeur_json?: string | null;
  visibilite_client?: number | null;
};

type FeatureTabRow = {
  id: string;
  nom: string;
  ordre?: number;
};

type UnavailableDateRow = {
  id?: string;
  start_date?: string;
  end_date?: string;
  status?: 'blocked' | 'pending' | 'booked' | string;
  paymentDeadline?: string;
  payment_deadline?: string;
  reservation_demand_id?: string | null;
};

type SeasonalDetailRow = { label: string; value: string };
type SeasonalFallbackTab = { id: string; nom: string; rows: SeasonalDetailRow[] };
type AmenitySection = { id: string; nom: string; features: FeatureApiRow[] };
type FeatureDisplayItem = { id: string; label: string; meta: string | null; sectionName: string; feature: FeatureApiRow };
type PaidServiceItem = {
  id: string;
  label: string;
  categorie?: string;
  description_courte?: string;
  prix_affiche?: string;
  prix?: number;
  type_tarification: 'fixe' | 'sur_demande' | 'a_partir_de';
  enabled?: boolean;
};

type PaidServiceCategoryMeta = {
  label: string;
  icon: JSX.Element;
  cardClass: string;
  iconWrapClass: string;
  badgeClass: string;
  watermarkClass: string;
  imageUrl: string;
};

const paidServiceCategoryImages = {
  arriveeDepart: new URL("../../../services_images_independantes/01_arrivee_et_depart.png", import.meta.url).href,
  transport: new URL("../../../services_images_independantes/02_transfert_et_transport.png", import.meta.url).href,
  menage: new URL("../../../services_images_independantes/03_menage_et_entretien.png", import.meta.url).href,
  packs: new URL("../../../services_images_independantes/04_packs_accueil_et_restauration.png", import.meta.url).href,
  famille: new URL("../../../services_images_independantes/05_famille_et_bebe.png", import.meta.url).href,
  linge: new URL("../../../services_images_independantes/06_linge_et_confort.png", import.meta.url).href,
  exterieur: new URL("../../../services_images_independantes/07_piscine_plage_et_exterieur.png", import.meta.url).href,
  conciergerie: new URL("../../../services_images_independantes/08_conciergerie_et_assistance.png", import.meta.url).href,
  loisirs: new URL("../../../services_images_independantes/09_loisirs_et_activites.png", import.meta.url).href,
  proA: new URL("../../../services_images_independantes/10_services_professionnels_a.png", import.meta.url).href,
  modificationsA: new URL("../../../services_images_independantes/11_modifications_et_frais_a.png", import.meta.url).href,
  decoration: new URL("../../../services_images_independantes/12_decoration_et_evenements.png", import.meta.url).href,
  proB: new URL("../../../services_images_independantes/13_services_professionnels_b.png", import.meta.url).href,
  modificationsB: new URL("../../../services_images_independantes/14_modifications_et_frais_administratifs.png", import.meta.url).href,
  premium: new URL("../../../services_images_independantes/15_experience_premium.png", import.meta.url).href,
} as const;

const normalizeFeatureName = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const formatReferenceLabel = (reference?: string | null) => {
  const safeReference = String(reference || "").trim();
  if (!safeReference) return "";
  return /^ref\b/i.test(safeReference) ? safeReference : `REF - ${safeReference}`;
};

const buildReferenceTitle = (reference?: string | null, title?: string | null) => {
  const safeTitle = String(title || "").trim();
  const referenceLabel = formatReferenceLabel(reference);
  if (!referenceLabel) return safeTitle;
  return `${referenceLabel} : ${safeTitle}`;
};

const getPaidServiceTypeMeta = (type: PaidServiceItem["type_tarification"]) => {
  if (type === "sur_demande") {
    return {
      label: "Sur demande",
      chipClass: "border-amber-200 bg-amber-50 text-amber-700",
      panelClass: "border-amber-200 bg-amber-50/60",
      icon: <MessageCircle size={14} className="text-amber-600" />,
      hint: "Prix confirmé par l'agence selon disponibilité.",
    };
  }
  if (type === "a_partir_de") {
    return {
      label: "A partir de",
      chipClass: "border-sky-200 bg-sky-50 text-sky-700",
      panelClass: "border-sky-200 bg-sky-50/60",
      icon: <ArrowRight size={14} className="text-sky-600" />,
      hint: "Le tarif final varie selon période et options.",
    };
  }
  return {
    label: "Prix fixe",
    chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    panelClass: "border-emerald-200 bg-emerald-50/60",
    icon: <Check size={14} className="text-emerald-600" />,
    hint: "Ajouté directement au total de la réservation.",
  };
};

const getPaidServiceCategoryMeta = (category?: string | null): PaidServiceCategoryMeta => {
  const normalized = normalizeFeatureName(String(category || ""));
  if (normalized.includes("famille") || normalized.includes("bebe")) {
    return {
      label: category || "Famille et bebe",
      icon: <Users size={18} className="text-rose-700" />,
      cardClass: "border-rose-200 bg-[linear-gradient(180deg,#fff7fb,#fff1f6)]",
      iconWrapClass: "bg-rose-100/90",
      badgeClass: "bg-rose-100 text-rose-700",
      watermarkClass: "text-rose-300/70",
      imageUrl: paidServiceCategoryImages.famille,
    };
  }
  if (normalized.includes("animaux") || normalized.includes("animal")) {
    return {
      label: category || "Services pour animaux",
      icon: <PawPrint size={18} className="text-orange-700" />,
      cardClass: "border-orange-200 bg-[linear-gradient(180deg,#fffaf5,#fff7ed)]",
      iconWrapClass: "bg-orange-100/90",
      badgeClass: "bg-orange-100 text-orange-700",
      watermarkClass: "text-orange-300/70",
      imageUrl: paidServiceCategoryImages.famille,
    };
  }
  if (normalized.includes("check") || normalized.includes("acces")) {
    return {
      label: category || "Acces & check-in",
      icon: <ConciergeBell size={18} className="text-emerald-700" />,
      cardClass: "border-emerald-200 bg-[linear-gradient(180deg,#f4fdf8,#ecfdf3)]",
      iconWrapClass: "bg-emerald-100/90",
      badgeClass: "bg-emerald-100 text-emerald-700",
      watermarkClass: "text-emerald-300/70",
      imageUrl: paidServiceCategoryImages.arriveeDepart,
    };
  }
  if (normalized.includes("accessibil")) {
    return {
      label: category || "Accessibilite",
      icon: <Route size={18} className="text-sky-700" />,
      cardClass: "border-sky-200 bg-[linear-gradient(180deg,#f6fbff,#eef8ff)]",
      iconWrapClass: "bg-sky-100/90",
      badgeClass: "bg-sky-100 text-sky-700",
      watermarkClass: "text-sky-300/70",
      imageUrl: paidServiceCategoryImages.famille,
    };
  }
  if (normalized.includes("buander") || normalized.includes("linge")) {
    return {
      label: category || "Buanderie",
      icon: <Bath size={18} className="text-cyan-700" />,
      cardClass: "border-cyan-200 bg-[linear-gradient(180deg,#f5feff,#ecfeff)]",
      iconWrapClass: "bg-cyan-100/90",
      badgeClass: "bg-cyan-100 text-cyan-700",
      watermarkClass: "text-cyan-300/70",
      imageUrl: paidServiceCategoryImages.linge,
    };
  }
  if (normalized.includes("cuisine") || normalized.includes("repas")) {
    return {
      label: category || "Cuisine & repas",
      icon: <UtensilsCrossed size={18} className="text-amber-700" />,
      cardClass: "border-amber-200 bg-[linear-gradient(180deg,#fffdf5,#fffbeb)]",
      iconWrapClass: "bg-amber-100/90",
      badgeClass: "bg-amber-100 text-amber-700",
      watermarkClass: "text-amber-300/70",
      imageUrl: paidServiceCategoryImages.packs,
    };
  }
  if (normalized.includes("balcon") || normalized.includes("terrasse") || normalized.includes("exterieur")) {
    return {
      label: category || "Exterieur",
      icon: <Trees size={18} className="text-lime-700" />,
      cardClass: "border-lime-200 bg-[linear-gradient(180deg,#f9fff4,#f7fee7)]",
      iconWrapClass: "bg-lime-100/90",
      badgeClass: "bg-lime-100 text-lime-700",
      watermarkClass: "text-lime-300/70",
      imageUrl: paidServiceCategoryImages.exterieur,
    };
  }
  if (normalized.includes("chauffage") || normalized.includes("clim")) {
    return {
      label: category || "Climatisation",
      icon: <Snowflake size={18} className="text-cyan-700" />,
      cardClass: "border-cyan-200 bg-[linear-gradient(180deg,#f7fdff,#ecfeff)]",
      iconWrapClass: "bg-cyan-100/90",
      badgeClass: "bg-cyan-100 text-cyan-700",
      watermarkClass: "text-cyan-300/70",
      imageUrl: paidServiceCategoryImages.premium,
    };
  }
  if (normalized.includes("chambre")) {
    return {
      label: category || "Chambre & linge",
      icon: <BedSingle size={18} className="text-violet-700" />,
      cardClass: "border-violet-200 bg-[linear-gradient(180deg,#faf7ff,#f5f3ff)]",
      iconWrapClass: "bg-violet-100/90",
      badgeClass: "bg-violet-100 text-violet-700",
      watermarkClass: "text-violet-300/70",
      imageUrl: paidServiceCategoryImages.linge,
    };
  }
  if (normalized.includes("parking") || normalized.includes("transport")) {
    return {
      label: category || "Transport",
      icon: <Car size={18} className="text-slate-700" />,
      cardClass: "border-slate-200 bg-[linear-gradient(180deg,#fbfcfd,#f8fafc)]",
      iconWrapClass: "bg-slate-100/90",
      badgeClass: "bg-slate-100 text-slate-700",
      watermarkClass: "text-slate-300/70",
      imageUrl: paidServiceCategoryImages.transport,
    };
  }
  if (normalized.includes("internet") || normalized.includes("wifi")) {
    return {
      label: category || "Connexion",
      icon: <Wifi size={18} className="text-blue-700" />,
      cardClass: "border-blue-200 bg-[linear-gradient(180deg,#f6faff,#eff6ff)]",
      iconWrapClass: "bg-blue-100/90",
      badgeClass: "bg-blue-100 text-blue-700",
      watermarkClass: "text-blue-300/70",
      imageUrl: paidServiceCategoryImages.proA,
    };
  }
  if (normalized.includes("concier") || normalized.includes("assist")) {
    return {
      label: category || "Conciergerie et assistance",
      icon: <ConciergeBell size={18} className="text-emerald-700" />,
      cardClass: "border-emerald-200 bg-[linear-gradient(180deg,#f8fffb,#eefcf5)]",
      iconWrapClass: "bg-emerald-100/90",
      badgeClass: "bg-emerald-100 text-emerald-700",
      watermarkClass: "text-emerald-300/70",
      imageUrl: paidServiceCategoryImages.conciergerie,
    };
  }
  if (normalized.includes("menage") || normalized.includes("entretien")) {
    return {
      label: category || "Menage et entretien",
      icon: <Bath size={18} className="text-cyan-700" />,
      cardClass: "border-cyan-200 bg-[linear-gradient(180deg,#f5feff,#ecfeff)]",
      iconWrapClass: "bg-cyan-100/90",
      badgeClass: "bg-cyan-100 text-cyan-700",
      watermarkClass: "text-cyan-300/70",
      imageUrl: paidServiceCategoryImages.menage,
    };
  }
  if (normalized.includes("activit") || normalized.includes("loisir")) {
    return {
      label: category || "Loisirs et activites",
      icon: <Waves size={18} className="text-sky-700" />,
      cardClass: "border-sky-200 bg-[linear-gradient(180deg,#f6fbff,#eef8ff)]",
      iconWrapClass: "bg-sky-100/90",
      badgeClass: "bg-sky-100 text-sky-700",
      watermarkClass: "text-sky-300/70",
      imageUrl: paidServiceCategoryImages.loisirs,
    };
  }
  if (normalized.includes("evenement") || normalized.includes("decor")) {
    return {
      label: category || "Decoration et evenements",
      icon: <Star size={18} className="text-amber-700" />,
      cardClass: "border-amber-200 bg-[linear-gradient(180deg,#fffdf5,#fffbeb)]",
      iconWrapClass: "bg-amber-100/90",
      badgeClass: "bg-amber-100 text-amber-700",
      watermarkClass: "text-amber-300/70",
      imageUrl: paidServiceCategoryImages.decoration,
    };
  }
  if (normalized.includes("premium") || normalized.includes("experience")) {
    return {
      label: category || "Experience premium",
      icon: <Star size={18} className="text-amber-700" />,
      cardClass: "border-amber-200 bg-[linear-gradient(180deg,#fffdf5,#fffbeb)]",
      iconWrapClass: "bg-amber-100/90",
      badgeClass: "bg-amber-100 text-amber-700",
      watermarkClass: "text-amber-300/70",
      imageUrl: paidServiceCategoryImages.premium,
    };
  }
  return {
    label: category || "Services",
    icon: <ListChecks size={18} className="text-emerald-700" />,
    cardClass: "border-emerald-200 bg-[linear-gradient(180deg,#f8fffb,#eefcf5)]",
    iconWrapClass: "bg-emerald-100/90",
    badgeClass: "bg-emerald-100 text-emerald-700",
    watermarkClass: "text-emerald-300/70",
    imageUrl: paidServiceCategoryImages.premium,
  };
};

const cleanFeatureTabName = (value: string) =>
  String(value || '')
    .replace(/^\s*\d+\s*[\.\-:)]\s*/g, '')
    .trim();

const isCharacteristicsTabName = (value: string) => normalizeFeatureName(cleanFeatureTabName(value)).includes('caracteristique');

const parseFeatureValueJson = (rawValue?: string | null): string[] => {
  const text = String(rawValue || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    }
    const scalar = String(parsed || '').trim();
    return scalar ? [scalar] : [];
  } catch {
    return text ? [text] : [];
  }
};

type LatLng = { lat: number; lng: number };
type NearbyPlace = {
  id: string;
  name: string;
  kind: "cafe" | "restaurant" | "shop";
  distanceKm: number;
  address: string;
  opening: string | null;
  imageUrl: string | null;
  imageSource: "google" | "osm" | "fallback";
};

const isValidLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const decodeBase64Utf8 = (value: string): string | null => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Array.from(binary).map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
    return decodeURIComponent(bytes);
  } catch {
    return null;
  }
};

const parseDmsCoordinates = (value: string): LatLng | null => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const match = text.match(/(\d{1,2})[°º]\s*(\d{1,2})['’]\s*(\d{1,2}(?:\.\d+)?)["”]?\s*([NS])\s+(\d{1,3})[°º]\s*(\d{1,2})['’]\s*(\d{1,2}(?:\.\d+)?)["”]?\s*([EW])/i);
  if (!match) return null;
  const latDeg = Number(match[1]);
  const latMin = Number(match[2]);
  const latSec = Number(match[3]);
  const latHem = String(match[4]).toUpperCase();
  const lngDeg = Number(match[5]);
  const lngMin = Number(match[6]);
  const lngSec = Number(match[7]);
  const lngHem = String(match[8]).toUpperCase();
  const latSign = latHem === 'S' ? -1 : 1;
  const lngSign = lngHem === 'W' ? -1 : 1;
  const lat = latSign * (latDeg + latMin / 60 + latSec / 3600);
  const lng = lngSign * (lngDeg + lngMin / 60 + lngSec / 3600);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
};

function splitHumanName(fullName?: string | null) {
  const normalized = String(fullName || "").replace(/\s+/g, " ").trim();
  if (!normalized) return { firstName: "", lastName: "" };
  const parts = normalized.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(""),
  };
}

const parseGoogleMapsLatLng = (url?: string | null): LatLng | null => {
  const value = String(url || '').trim();
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const encodedPlaceToken = decoded.match(/!2z([A-Za-z0-9_-]+)/i)?.[1];
  if (encodedPlaceToken) {
    const decodedPlace = decodeBase64Utf8(encodedPlaceToken);
    const placeCoords = decodedPlace ? parseDmsCoordinates(decodedPlace) : null;
    if (placeCoords) return placeCoords;
  }
  const inlineDmsCoords = parseDmsCoordinates(decoded);
  if (inlineDmsCoords) return inlineDmsCoords;
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const isLngLatPattern = pattern.source.startsWith('!2d');
    const lat = Number(isLngLatPattern ? match[2] : match[1]);
    const lng = Number(isLngLatPattern ? match[1] : match[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }
  return null;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

const toRad = (deg: number) => (deg * Math.PI) / 180;
const haversineKm = (a: LatLng, b: LatLng) => {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(aa));
};

const normalizeAmenity = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const kindLabel = (kind: NearbyPlace["kind"]) => {
  if (kind === "restaurant") return "Restaurant";
  if (kind === "cafe") return "Café";
  return "Magasin";
};

const nearbyImageUrlFromTags = (tags: Record<string, any>): string | null => {
  const direct = String(tags?.image || "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;
  const commons = String(tags?.wikimedia_commons || "").trim();
  if (/^File:/i.test(commons)) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(commons.replace(/^File:/i, "").trim())}`;
  }
  return null;
};

const imageUrlFromWikidata = async (entityId?: string | null): Promise<string | null> => {
  const id = String(entityId || "").trim();
  if (!/^Q\d+$/i.test(id)) return null;
  try {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json();
    const claim = payload?.entities?.[id]?.claims?.P18?.[0];
    const filename = String(claim?.mainsnak?.datavalue?.value || "").trim();
    if (!filename) return null;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
  } catch {
    return null;
  }
};

const fallbackApproxLocation = (seed: string): LatLng => {
  const h = hashString(seed || 'kelibia');
  const baseLat = 36.847;
  const baseLng = 11.093;
  const latJitter = ((h % 240) - 120) / 1000;
  const lngJitter = ((((h / 7) | 0) % 240) - 120) / 1000;
  return { lat: baseLat + latJitter, lng: baseLng + lngJitter };
};

const obfuscateLocation = (exact: LatLng, seed: string): LatLng => {
  void seed;
  return exact;
};

export default function PropertyDetailsPage() {
  // Use shared context for properties
  const { properties, biens, zones } = useProperties();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const property = properties.find((p) => propertyMatchesRouteToken(p, slug));
  const propertyRouteToken = property ? getPropertyRouteToken(property) : "";
  const propertyDisplayTitle = buildReferenceTitle(property?.reference, property?.title);
  const propertyVideos = property?.videos || [];
  const [facebookDirectVideoUrls, setFacebookDirectVideoUrls] = useState<Record<string, string>>({});
  const [facebookEmbedUnavailableByUrl, setFacebookEmbedUnavailableByUrl] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const uniqueFacebookUrls = Array.from(
      new Set(
        propertyVideos
          .map((videoUrl) => String(videoUrl || '').trim())
          .filter((url) => url && isFacebookVideoUrl(url) && !facebookDirectVideoUrls[url])
      )
    );
    if (uniqueFacebookUrls.length === 0) return;
    let cancelled = false;
    void (async () => {
      const nextEntries: Array<[string, string]> = [];
      for (const url of uniqueFacebookUrls) {
        try {
          const endpoint = buildApiUrl(`/facebook/video-source?url=${encodeURIComponent(url)}`);
          const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
          if (!response.ok) {
            nextEntries.push([url, '']);
            continue;
          }
          const payload = await response.json().catch(() => null);
          const source = String(payload?.source || '').trim();
          nextEntries.push([url, source || '']);
        } catch {
          // Ignore failures and keep iframe/link fallback.
        }
      }
      if (!cancelled && nextEntries.length > 0) {
        setFacebookDirectVideoUrls((prev) => ({ ...prev, ...Object.fromEntries(nextEntries) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facebookDirectVideoUrls, propertyVideos]);
  useEffect(() => {
    const uniqueFacebookUrls = Array.from(
      new Set(
        propertyVideos
          .map((videoUrl) => String(videoUrl || '').trim())
          .filter((url) => url && isFacebookVideoUrl(url) && facebookEmbedUnavailableByUrl[url] === undefined)
      )
    );
    if (uniqueFacebookUrls.length === 0) return;
    let cancelled = false;
    void (async () => {
      const updates: Array<[string, boolean]> = [];
      for (const url of uniqueFacebookUrls) {
        try {
          const endpoint = buildApiUrl(`/facebook/embed-status?url=${encodeURIComponent(url)}`);
          const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
          const payload = await response.json().catch(() => null);
          updates.push([url, payload?.embeddable === false]);
        } catch {
          updates.push([url, false]);
        }
      }
      if (!cancelled && updates.length > 0) {
        setFacebookEmbedUnavailableByUrl((prev) => ({ ...prev, ...Object.fromEntries(updates) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facebookEmbedUnavailableByUrl, propertyVideos]);
  useEffect(() => {
    const bienId = String((property as any)?.id || '').trim();
    if (!bienId) {
      setLiveUnavailableDates(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/unavailable-dates/${encodeURIComponent(bienId)}`, { credentials: 'include' });
        if (!response.ok) return;
        const rows = (await response.json().catch(() => [])) as UnavailableDateRow[];
        const normalized = (Array.isArray(rows) ? rows : [])
          .map((row) => {
            const start = String(row?.start_date || '').slice(0, 10);
            const end = String(row?.end_date || '').slice(0, 10);
            const rawStatus = String(row?.status || '').trim().toLowerCase();
            const status = rawStatus === 'booked' || rawStatus === 'pending' || rawStatus === 'blocked'
              ? rawStatus
              : 'blocked';
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return null;
            return {
              start,
              end,
              status: status as 'blocked' | 'pending' | 'booked',
              paymentDeadline: row?.paymentDeadline || row?.payment_deadline || undefined,
              reservationDemandId: row?.reservation_demand_id ? String(row.reservation_demand_id) : null,
            };
          })
          .filter((entry): entry is {
            start: string;
            end: string;
            status: 'blocked' | 'pending' | 'booked';
            paymentDeadline?: string;
            reservationDemandId?: string | null;
          } => Boolean(entry));
        if (!cancelled) {
          setLiveUnavailableDates(normalized);
        }
      } catch {
        // Keep context values as fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [property?.id]);
  const allGalleryImages = property?.images || [];
  const [availableGalleryImages, setAvailableGalleryImages] = useState<string[]>([GALLERY_FALLBACK_IMAGE]);
  const [galleryAvailabilityChecked, setGalleryAvailabilityChecked] = useState(false);
  const galleryImages = useMemo(() => {
    const base = galleryAvailabilityChecked
      ? (availableGalleryImages.length > 0 ? availableGalleryImages : [GALLERY_FALLBACK_IMAGE])
      : [GALLERY_FALLBACK_IMAGE];
    return base;
  }, [availableGalleryImages, galleryAvailabilityChecked]);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const lastTrackedVisitKeyRef = useRef<string>('');
  const [mobileGalleryIndex, setMobileGalleryIndex] = useState(0);
  const mobileVisibleImageIndexes = useMemo(() => {
    const total = galleryImages.length;
    if (total <= 2) return new Set(Array.from({ length: total }, (_, index) => index));
    const current = ((mobileGalleryIndex % total) + total) % total;
    return new Set([
      current,
      (current + 1) % total,
      (current - 1 + total) % total,
    ]);
  }, [galleryImages.length, mobileGalleryIndex]);

  useEffect(() => {
    let cancelled = false;
    const source = Array.isArray(allGalleryImages)
      ? allGalleryImages.filter((item) => String(item || "").trim().length > 0)
      : [];
    if (source.length === 0) {
      setAvailableGalleryImages([GALLERY_FALLBACK_IMAGE]);
      setGalleryAvailabilityChecked(true);
      return;
    }
    if (!ENABLE_MEDIA_AVAILABILITY_PROBE) {
      setAvailableGalleryImages(source);
      setGalleryAvailabilityChecked(true);
      return;
    }

    const validate = async () => {
      if (cancelled) return;
      // Keep all images to preserve order/slots; failures are handled per-image with SmartImage fallback.
      setAvailableGalleryImages(source);
      setGalleryAvailabilityChecked(true);
    };

    setGalleryAvailabilityChecked(false);
    void validate();
    return () => {
      cancelled = true;
    };
  }, [allGalleryImages]);

  // Read filter state from URL
  const filterLocation = searchParams.get("location") || "";
  const filterCategories = searchParams.get("categories")?.split(",").filter(Boolean) || [];
  const filterAmenities = searchParams.get("amenities")?.split(",").filter(Boolean) || [];
  const filterFeatured = searchParams.get("featured") === "true";
  const minPrice = parseInt(searchParams.get("minPrice") || "0");
  const maxPriceParam = searchParams.get("maxPrice");
  const maxPrice = maxPriceParam ? parseInt(maxPriceParam, 10) : Number.POSITIVE_INFINITY;
  const filterMode = (searchParams.get("mode") || property?.mode || "location_saisonniere").trim();

  // Build query string for "Voir tout" link
  const filterQueryString = searchParams.toString();
  const backToListUrl = filterQueryString ? `/logements?${filterQueryString}` : "/logements";

  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [adultGuests, setAdultGuests] = useState(1);
  const [childGuests, setChildGuests] = useState(0);
  const [includeCleaningFee, setIncludeCleaningFee] = useState(false);
  const [includeServiceFee, setIncludeServiceFee] = useState(false);
  const [extraMattresses, setExtraMattresses] = useState(0);
  const [selectedPaidServiceIds, setSelectedPaidServiceIds] = useState<string[]>([]);
  const [paymentMode, setPaymentMode] = useState<'totalite' | 'avance' | 'amicale'>('avance');
  const [amicaleSelectionId, setAmicaleSelectionId] = useState("");
  const [amicaleFullName, setAmicaleFullName] = useState("");
  const [amicaleMatricule, setAmicaleMatricule] = useState("");
  const [amicalePhone, setAmicalePhone] = useState("");
  const [amicaleCode, setAmicaleCode] = useState("");
  const [amicaleOptions, setAmicaleOptions] = useState<Array<{ id: string; name: string; code: string; logoUrl?: string }>>([]);
  const [showSeasonalDetails, setShowSeasonalDetails] = useState(false);
  const [showAmenitiesDialog, setShowAmenitiesDialog] = useState(false);
  const [showPaidServicesDialog, setShowPaidServicesDialog] = useState(false);
  const [showVariablePaidServiceNotice, setShowVariablePaidServiceNotice] = useState(false);
  const [hasSeenVariablePaidServiceNotice, setHasSeenVariablePaidServiceNotice] = useState(false);
  const [selectedPaidServiceCategoryId, setSelectedPaidServiceCategoryId] = useState<string>("");
  const [selectedPaidServiceTypeFilter, setSelectedPaidServiceTypeFilter] = useState<"all" | PaidServiceItem["type_tarification"]>("all");
  const [showBookingCalendarDialog, setShowBookingCalendarDialog] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [ruleDialogMessage, setRuleDialogMessage] = useState("");
  const [seasonalDetailsTabId, setSeasonalDetailsTabId] = useState<string>('');
  const [allFeatures, setAllFeatures] = useState<FeatureApiRow[]>([]);
  const [featureTabs, setFeatureTabs] = useState<FeatureTabRow[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [lightboxImageLoading, setLightboxImageLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [reservationNote, setReservationNote] = useState("");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [providers, setProviders] = useState({ google: false, facebook: false, phoneOtp: false, emailOtp: false, passkey: true });
  const [isPasskeyPromptLoading, setIsPasskeyPromptLoading] = useState(false);
  const [isPasskeyCreateLoading, setIsPasskeyCreateLoading] = useState(false);
  const [loginPromptStep, setLoginPromptStep] = useState<"choices" | "passkey_setup" | "profile_setup">("choices");
  const [passkeyPromptEmail, setPasskeyPromptEmail] = useState("");
  const [passkeyPromptName, setPasskeyPromptName] = useState("");
  const [isProfilePromptSaving, setIsProfilePromptSaving] = useState(false);
  const [profilePromptForm, setProfilePromptForm] = useState({
    firstName: "",
    lastName: "",
    clientType: "locataire",
    telephone: "",
    address: "",
    cin: "",
  });
  const [pendingDraft, setPendingDraft] = useState<PendingReservationDraft | null>(null);
  const pricingAmicaleId = String(searchParams.get("amicale") || (paymentMode === "amicale" ? amicaleSelectionId : "") || pendingDraft?.pricingAmicaleId || "").trim() || null;
  const isAmicalePricingActive = Boolean(pricingAmicaleId) && property?.priceContext !== 'sale';
  const [liveUnavailableDates, setLiveUnavailableDates] = useState<Array<{
    start: string;
    end: string;
    status: 'blocked' | 'pending' | 'booked';
    paymentDeadline?: string;
    reservationDemandId?: string | null;
  }> | null>(null);
  const [isAwaitingLogin, setIsAwaitingLogin] = useState(false);
  const [pulsePhase, setPulsePhase] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [consentRevision, setConsentRevision] = useState(0);
  const authPopupRef = useRef<Window | null>(null);
  const draftHydratedRef = useRef(false);
  const detailTabsNavRef = useRef<HTMLDivElement | null>(null);
  const paidServicesCategoriesNavRef = useRef<HTMLDivElement | null>(null);
  const seasonalDetailsPanelRef = useRef<HTMLDivElement | null>(null);
  const stayInfoSectionRef = useRef<HTMLDivElement | null>(null);
  const locationSectionRef = useRef<HTMLDivElement | null>(null);
  const calendarSectionRef = useRef<HTMLDivElement | null>(null);
  const googlePlacesUnsupportedRef = useRef(false);
  const nearbyPlacesCacheRef = useRef<Record<string, NearbyPlace[]>>({});
  const nearbyPlacesFailureRef = useRef<Record<string, true>>({});
  const lightboxPointerStartXRef = useRef<number | null>(null);
  const loadedLightboxPreviewSrcsRef = useRef<Set<string>>(new Set());
  const loadedLightboxOriginalSrcsRef = useRef<Set<string>>(new Set());
  const lightboxPreloadRunIdRef = useRef(0);
  const [lightboxOriginalLoaded, setLightboxOriginalLoaded] = useState(false);
  const [lightboxOriginalIndex, setLightboxOriginalIndex] = useState<number | null>(null);
  const [lightboxPreviewQualityByIndex, setLightboxPreviewQualityByIndex] = useState<Record<number, number>>({});
  const isSaleProperty = property?.priceContext === 'sale';
  const guests = adultGuests + childGuests;
  const sourceBien = useMemo(
    () => biens.find((item) => String(item.id) === String(property?.id)),
    [biens, property?.id]
  );
  const selectedZone = useMemo(
    () => zones.find((item) => item.id === sourceBien?.zone_id),
    [sourceBien?.zone_id, zones]
  );
  const selectedBienMapsUrl = String((sourceBien?.location_saisonniere_config as any)?.google_maps_embed_url || '').trim();
  const selectedZoneMapsUrl = String(selectedZone?.google_maps_url || '').trim();
  const selectedMapsUrl = useMemo(() => {
    const value = selectedBienMapsUrl || selectedZoneMapsUrl;
    if (!value) return '';
    const iframeSrcMatch = value.match(/<iframe[^>]*\s+src=["']([^"']+)["']/i);
    const extracted = iframeSrcMatch?.[1] || value;
    return extracted.replace(/&amp;/g, '&').trim();
  }, [selectedBienMapsUrl, selectedZoneMapsUrl]);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const displayMapCenter = useMemo(
    () => (mapCenter ? mapCenter : null),
    [mapCenter]
  );
  const animatedOuterRadius = useMemo(
    () => 230 + Math.sin(pulsePhase * 2.6) * 26,
    [pulsePhase]
  );
  const animatedInnerRadius = useMemo(
    () => 95 + Math.sin((pulsePhase * 2.6) + (Math.PI / 2)) * 10,
    [pulsePhase]
  );
  const googleEmbedUrl = useMemo(() => {
    if (!displayMapCenter) return '';
    return `https://www.google.com/maps?output=embed&ll=${displayMapCenter.lat},${displayMapCenter.lng}&z=14&t=k`;
  }, [displayMapCenter]);

  useEffect(() => {
    let disposed = false;
    const geocodeFromZone = async (): Promise<LatLng | null> => {
      const q = [
        selectedZone?.quartier,
        selectedZone?.region,
        selectedZone?.gouvernerat,
        selectedZone?.pays,
        selectedZone?.nom,
      ].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
      if (!q) return null;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) return null;
        const rows = await response.json();
        const first = Array.isArray(rows) ? rows[0] : null;
        const lat = Number(first?.lat);
        const lng = Number(first?.lon);
        return isValidLatLng(lat, lng) ? { lat, lng } : null;
      } catch {
        return null;
      }
    };

    const load = async () => {
      const parsed = parseGoogleMapsLatLng(selectedMapsUrl);
      const exact = parsed || await geocodeFromZone();
      if (disposed) return;
      if (!exact) {
        if (selectedZone) {
          setMapCenter(fallbackApproxLocation(`${property?.id || ''}-${selectedZone.id}-${selectedZone.nom || ''}`));
        } else {
          setMapCenter(null);
        }
        return;
      }
      const approx = obfuscateLocation(exact, `${property?.id || ''}-${selectedZone?.id || ''}`);
      setMapCenter(approx);
    };

    void load();
    return () => { disposed = true; };
  }, [selectedMapsUrl, selectedZone?.quartier, selectedZone?.region, selectedZone?.gouvernerat, selectedZone?.pays, selectedZone?.nom, selectedZone?.id, property?.id]);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const raf1 = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      const raf2 = window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
      return () => window.cancelAnimationFrame(raf2);
    });
    return () => window.cancelAnimationFrame(raf1);
  }, [slug]);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setPulsePhase((Date.now() - startedAt) / 1000);
    }, 80);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const syncViewport = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport, { passive: true });
    return () => window.removeEventListener("resize", syncViewport);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const loadNearby = async () => {
      if (!displayMapCenter) {
        setNearbyPlaces([]);
        return;
      }
      const nearbyCacheKey = `${displayMapCenter.lat.toFixed(5)}:${displayMapCenter.lng.toFixed(5)}`;
      const cachedNearbyPlaces = nearbyPlacesCacheRef.current[nearbyCacheKey];
      if (cachedNearbyPlaces) {
        setNearbyPlaces(cachedNearbyPlaces);
        return;
      }
      if (nearbyPlacesFailureRef.current[nearbyCacheKey]) {
        setNearbyPlaces([]);
        return;
      }
      const query = `
[out:json][timeout:12];
(
  node["amenity"="cafe"](around:1800,${displayMapCenter.lat},${displayMapCenter.lng});
  node["amenity"="restaurant"](around:1800,${displayMapCenter.lat},${displayMapCenter.lng});
  node["shop"="supermarket"](around:1800,${displayMapCenter.lat},${displayMapCenter.lng});
  node["shop"="convenience"](around:1800,${displayMapCenter.lat},${displayMapCenter.lng});
);
out body 40;
`;
      try {
        if (!googlePlacesUnsupportedRef.current) {
          const googleNearbyUrl = buildApiUrl(`/google-places/nearby?lat=${encodeURIComponent(String(displayMapCenter.lat))}&lng=${encodeURIComponent(String(displayMapCenter.lng))}&radius=1800`);
          const googleResponse = await fetch(googleNearbyUrl);
          if (googleResponse.status === 404 || googleResponse.status === 503) {
            googlePlacesUnsupportedRef.current = true;
            if (googleResponse.status === 503 || !ENABLE_EXTERNAL_NEARBY_FALLBACK) {
              nearbyPlacesFailureRef.current[nearbyCacheKey] = true;
              setNearbyPlaces([]);
              return;
            }
          } else if (googleResponse.ok) {
            const googlePayload = await googleResponse.json().catch(() => ({}));
            if (googlePayload?.disabled === true) {
              googlePlacesUnsupportedRef.current = true;
              if (!ENABLE_EXTERNAL_NEARBY_FALLBACK) {
                nearbyPlacesFailureRef.current[nearbyCacheKey] = true;
                setNearbyPlaces([]);
                return;
              }
            } else {
            const googleRows = Array.isArray(googlePayload?.places) ? googlePayload.places : [];
            const googleItems = googleRows
              .map((row: any) => {
                const lat = Number(row?.lat);
                const lng = Number(row?.lng);
                const name = String(row?.name || '').trim();
                const kind = String(row?.kind || '').trim();
                if (!name || !isValidLatLng(lat, lng)) return null;
                if (kind !== 'restaurant' && kind !== 'cafe' && kind !== 'shop') return null;
                return {
                  id: String(row?.id || `${lat}-${lng}`),
                  name,
                  kind,
                  distanceKm: haversineKm(displayMapCenter, { lat, lng }),
                  address: String(row?.address || '').trim() || 'Adresse locale',
                  opening: String(row?.opening || '').trim() || null,
                  imageUrl: String(row?.imageUrl || '').trim() || null,
                  imageSource: String(row?.imageUrl || '').trim() ? "google" : "fallback",
                } as NearbyPlace;
              })
              .filter(Boolean)
              .sort((a: NearbyPlace, b: NearbyPlace) => a.distanceKm - b.distanceKm)
              .slice(0, 12);
            if (googleItems.length > 0) {
              nearbyPlacesCacheRef.current[nearbyCacheKey] = googleItems;
              setNearbyPlaces(googleItems);
              return;
            }
            }
          }
        }
        if (!ENABLE_EXTERNAL_NEARBY_FALLBACK) {
          nearbyPlacesFailureRef.current[nearbyCacheKey] = true;
          setNearbyPlaces([]);
          return;
        }
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: query,
        });
        if (!response.ok) throw new Error('overpass_failed');
        const payload = await response.json();
        if (cancelled) return;
        const rawItems = (Array.isArray(payload?.elements) ? payload.elements : [])
          .map((item: any) => {
            const lat = Number(item?.lat);
            const lng = Number(item?.lon);
            if (!isValidLatLng(lat, lng)) return null;
            const tags = item?.tags || {};
            const name = String(tags?.name || '').trim();
            if (!name) return null;
            const amenity = String(tags?.amenity || '').trim();
            const shop = String(tags?.shop || '').trim();
            const kind: NearbyPlace["kind"] | null =
              amenity === 'cafe' ? 'cafe' :
              amenity === 'restaurant' ? 'restaurant' :
              (shop === 'supermarket' || shop === 'convenience') ? 'shop' :
              null;
            if (!kind) return null;
            const street = String(tags?.["addr:street"] || '').trim();
            const house = String(tags?.["addr:housenumber"] || '').trim();
            const address = [house, street].filter(Boolean).join(' ') || String(tags?.["addr:full"] || '').trim() || 'Adresse locale';
            const openingRaw = String(tags?.opening_hours || '').trim();
            const opening = openingRaw ? (openingRaw.includes('24/7') ? 'Ouvert 24h/24' : openingRaw) : null;
            const osmImage = nearbyImageUrlFromTags(tags);
            return {
              id: String(item?.id || `${lat}-${lng}`),
              name,
              kind,
              distanceKm: haversineKm(displayMapCenter, { lat, lng }),
              address,
              opening,
              imageUrl: osmImage,
              imageSource: osmImage ? "osm" : "fallback",
              wikidata: String(tags?.wikidata || '').trim() || null,
            } as NearbyPlace;
          })
          .filter(Boolean)
          .sort((a: NearbyPlace, b: NearbyPlace) => a.distanceKm - b.distanceKm)
          .slice(0, 12);
        const items = await Promise.all(
          rawItems.map(async (place: any) => {
            if (place.imageUrl) return place as NearbyPlace;
            const wikidataImage = await imageUrlFromWikidata(place.wikidata);
            return { ...place, imageUrl: wikidataImage || null, imageSource: wikidataImage ? "osm" : "fallback" } as NearbyPlace;
          })
        );
        nearbyPlacesCacheRef.current[nearbyCacheKey] = items;
        setNearbyPlaces(items);
      } catch {
        nearbyPlacesFailureRef.current[nearbyCacheKey] = true;
        if (!cancelled) setNearbyPlaces([]);
      }
    };
    void loadNearby();
    return () => { cancelled = true; };
  }, [displayMapCenter?.lat, displayMapCenter?.lng]);
  const featureIcon = useCallback((iconName?: string | null, featureName?: string | null, tabName?: string | null) => {
    return getFeatureIconElement(iconName, featureName, tabName);
  }, []);
  const scrollToSeasonalDetails = useCallback(() => {
    const target = seasonalDetailsPanelRef.current;
    if (!target) return;
    const offset = 104;
    const top = window.scrollY + target.getBoundingClientRect().top - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);
  const scrollToSection = useCallback((target: HTMLElement | null, offset = 104) => {
    if (!target) return;
    const top = window.scrollY + target.getBoundingClientRect().top - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);
  const handleOpenAndScrollSeasonalDetails = useCallback(() => {
    if (!showSeasonalDetails) {
      setShowSeasonalDetails(true);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scrollToSeasonalDetails());
      });
      return;
    }
    scrollToSeasonalDetails();
  }, [showSeasonalDetails, scrollToSeasonalDetails]);
  const seasonalConfig = property?.seasonalConfig;
  const fallbackMaxGuests = Math.max(1, property?.guests || seasonalConfig?.limitePersonnesNuit || 1);
  const { maxGuests, maxAdultGuests, maxChildGuests } = computeGuestLimits({
    fallbackGuests: fallbackMaxGuests,
    maxGuestsCap: seasonalConfig?.limitePersonnesNuit,
    maxAdultsCap: seasonalConfig?.maxAdultes,
    maxChildrenCap: seasonalConfig?.maxEnfants,
  });
  const minStay = Math.max(1, seasonalConfig?.dureeMinSejourNuits || 1);
  const maxStay = Math.max(minStay, seasonalConfig?.dureeMaxSejourNuits || 365);
  const periodMinStay = useMemo(() => {
    if (!selectedStart) return null;
    return getPeriodMinStayForDate(property?.pricingPeriods || [], selectedStart, pricingAmicaleId);
  }, [pricingAmicaleId, property?.pricingPeriods, selectedStart]);
  const displayedMinStay = Math.max(minStay, periodMinStay || 0);
  const activeWeekdayRule = useMemo(() => {
    if (!selectedStart || !selectedEnd) return { requiredCheckinDay: null, requiredCheckoutDay: null };
    const start = selectedStart < selectedEnd ? selectedStart : selectedEnd;
    const end = selectedStart < selectedEnd ? selectedEnd : selectedStart;
    return getReservationWeekdayRule({
      startDate: start,
      endDate: end,
      periods: property?.pricingPeriods || [],
      amicaleId: pricingAmicaleId,
    });
  }, [pricingAmicaleId, property?.pricingPeriods, selectedEnd, selectedStart]);
  const reservationValidation = useMemo(() => {
    if (isSaleProperty) return { valid: true, message: "" };
    if (!selectedStart || !selectedEnd) return { valid: false, message: "Selectionnez vos dates d'arrivee et de depart." };

    const start = selectedStart < selectedEnd ? selectedStart : selectedEnd;
    const end = selectedStart < selectedEnd ? selectedEnd : selectedStart;
    const startDate = format(start, 'yyyy-MM-dd');
    const endDate = format(end, 'yyyy-MM-dd');

    if (startDate === endDate) {
      return { valid: false, message: "Choisissez au moins une nuit." };
    }

    const nights = Math.max(0, Math.abs(differenceInDays(end, start)));
    const minStayForSelection = getReservationMinStayRequirement({
      startDate,
      endDate,
      periods: property?.pricingPeriods || [],
      fallbackMinStay: minStay,
      amicaleId: pricingAmicaleId,
    });
    if (nights < minStayForSelection) {
      return { valid: false, message: `Sejour minimum pour cette periode: ${minStayForSelection} nuit(s).` };
    }
    if (nights > maxStay) {
      return { valid: false, message: `Sejour maximum autorise: ${maxStay} nuit(s).` };
    }

    const weekdayRuleCheck = validateReservationWeekdayRule({
      startDate,
      endDate,
      periods: property?.pricingPeriods || [],
      amicaleId: pricingAmicaleId,
    });
    if (!weekdayRuleCheck.ok) {
      const checkinMessage = weekdayRuleCheck.requiredCheckinDay ? `check-in ${weekdayRuleCheck.requiredCheckinDay}` : null;
      const checkoutMessage = weekdayRuleCheck.requiredCheckoutDay ? `check-out ${weekdayRuleCheck.requiredCheckoutDay}` : null;
      const detail = [checkinMessage, checkoutMessage].filter(Boolean).join(" | ");
      return { valid: false, message: `Regle de periode non respectee: ${detail}.` };
    }

    if (paymentMode === "amicale") {
      if (!amicaleSelectionId) return { valid: false, message: "Selectionnez une amicale." };
      if (!String(amicaleFullName || "").trim()) return { valid: false, message: "Nom et prenom obligatoires." };
      if (!String(amicaleMatricule || "").trim()) return { valid: false, message: "Matricule obligatoire." };
      if (!String(amicalePhone || "").trim()) return { valid: false, message: "Numero de telephone obligatoire." };
      if (!String(amicaleCode || "").trim()) return { valid: false, message: "Code amicale obligatoire." };
    }

    return { valid: true, message: "" };
  }, [amicaleCode, amicaleFullName, amicaleMatricule, amicalePhone, amicaleSelectionId, isSaleProperty, maxStay, minStay, paymentMode, pricingAmicaleId, property?.pricingPeriods, selectedEnd, selectedStart]);
  const extraMattressPrice = Math.max(0, seasonalConfig?.matelasSupplementairePrix || 0);
  const extraMattressMax = Math.max(0, seasonalConfig?.matelasSupplementairesMax || 0);
  const advancePercent = Math.min(100, Math.max(1, seasonalConfig?.avancePourcentage || 30));
  const standingLabel = seasonalConfig?.categorieStanding ? ({ economique: 'Economique', confort: 'Confort', premium: 'Premium', luxe: 'Luxe' } as const)[seasonalConfig.categorieStanding] : null;
  const etageLabel = seasonalConfig?.etage ? ({ rdc: 'RDC', '1': '1', '2': '2', '3': '3', '4': '4', '5_plus': '5+' } as const)[seasonalConfig.etage] : null;
  const vueLabel = seasonalConfig?.vue ? ({ mer: 'Vue mer', jardin: 'Vue jardin', ville: 'Vue ville', montagne: 'Vue montagne', sans_vue: 'Sans vue particuliere' } as const)[seasonalConfig.vue] : null;
  const niveauSonoreLabel = seasonalConfig?.niveauSonore ? ({ tres_calme: 'Tres calme', calme: 'Calme', moyen: 'Moyen', bruyant: 'Bruyant' } as const)[seasonalConfig.niveauSonore] : null;
  const accesLabel = seasonalConfig?.accesGeneral ? ({ tres_facile: 'Tres facile', facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' } as const)[seasonalConfig.accesGeneral] : null;
  const politiqueAnnulationLabel = seasonalConfig?.politiqueAnnulation ? ({ flexible: 'Flexible', moderee: 'Moderee', stricte: 'Stricte', non_remboursable: 'Non remboursable' } as const)[seasonalConfig.politiqueAnnulation] : null;
  const typeCautionLabel = seasonalConfig?.typeCaution ? ({ cash: 'Cash', preautorisation: 'Pre-autorisation', virement: 'Virement', aucune: 'Aucune' } as const)[seasonalConfig.typeCaution] : null;
  const fumeursLabel = seasonalConfig?.fumeurs ? ({ autorise: 'Autorise', interdit: 'Interdit', balcon_terrasse: 'Autorise sur balcon/terrasse' } as const)[seasonalConfig.fumeurs] : null;
  const alcoolLabel = seasonalConfig?.alcool ? ({ autorise: 'Autorise', interdit: 'Interdit' } as const)[seasonalConfig.alcool] : null;
  const fetesLabel = seasonalConfig?.fetes ? ({ autorise: 'Autorise', interdit: 'Interdit' } as const)[seasonalConfig.fetes] : null;
  const heuresSilenceLabel = seasonalConfig?.heuresSilence ? String(seasonalConfig.heuresSilence).toUpperCase() : null;
  const animauxLabel = seasonalConfig?.animaux ? ({ autorises: 'Autorises', interdits: 'Interdits', sous_conditions: 'Autorises sous conditions' } as const)[seasonalConfig.animaux] : null;
  const currentDisplayPricing = useMemo(
    () => resolveCurrentPricing({
      today: selectedStart || searchParams.get("checkIn") || undefined,
      defaultNightlyPrice: Number(property?.pricePerNight || 0),
      defaultWeeklyPrice: Number(property?.pricePerWeek || 0),
      pricingPeriods: property?.pricingPeriods || [],
      amicaleId: pricingAmicaleId,
    }),
    [pricingAmicaleId, property?.pricePerNight, property?.pricePerWeek, property?.pricingPeriods, selectedStart, searchParams]
  );
  const displayedNightlyPrice = applyAmicaleTtc(Number(currentDisplayPricing.nightlyPrice || 0), isAmicalePricingActive);
  const displayedWeeklyPrice = applyAmicaleTtc(Number(currentDisplayPricing.weeklyPrice || 0), isAmicalePricingActive);
  const hasCleaningFee = !isSaleProperty
    && (seasonalConfig?.fraisMenageDisponible !== false)
    && Number(property?.cleaningFee || 0) > 0;
  const hasServiceFee = !isSaleProperty
    && (seasonalConfig?.fraisServiceDisponible !== false)
    && Number(property?.serviceFee || 0) > 0;
  const paidServicesBuckets = useMemo(
    () => splitServicesByTarification(seasonalConfig?.servicesPayants || []),
    [seasonalConfig?.servicesPayants]
  );
  const activePaidServices = paidServicesBuckets.all;
  const hasPaidServices = !isSaleProperty && activePaidServices.length > 0;
  const paidServicePreview = useMemo(() => activePaidServices.slice(0, 4), [activePaidServices]);
  const paidServicesByType = useMemo(
    () => ({
      fixe: activePaidServices.filter((service) => service.type_tarification === "fixe"),
      sur_demande: activePaidServices.filter((service) => service.type_tarification === "sur_demande"),
      a_partir_de: activePaidServices.filter((service) => service.type_tarification === "a_partir_de"),
    }),
    [activePaidServices]
  );
  const paidServiceCategories = useMemo(() => {
    const grouped = new Map<string, { id: string; label: string; services: PaidServiceItem[]; meta: PaidServiceCategoryMeta }>();
    activePaidServices.forEach((service) => {
      const rawLabel = String(service.categorie || "").trim() || "Services";
      const id = normalizeFeatureName(rawLabel) || "services";
      const existing = grouped.get(id);
      if (existing) {
        existing.services.push(service);
        return;
      }
      grouped.set(id, {
        id,
        label: rawLabel,
        services: [service],
        meta: getPaidServiceCategoryMeta(rawLabel),
      });
    });
    return Array.from(grouped.values()).sort((a, b) => b.services.length - a.services.length || a.label.localeCompare(b.label));
  }, [activePaidServices]);
  const visiblePaidServices = useMemo(() => (
    activePaidServices.filter((service) => {
      const categoryId = normalizeFeatureName(String(service.categorie || "").trim() || "Services") || "services";
      const matchesCategory = selectedPaidServiceCategoryId === "all" || categoryId === selectedPaidServiceCategoryId;
      const matchesType = selectedPaidServiceTypeFilter === "all" || service.type_tarification === selectedPaidServiceTypeFilter;
      return matchesCategory && matchesType;
    })
  ), [activePaidServices, selectedPaidServiceCategoryId, selectedPaidServiceTypeFilter]);
  const visiblePaidServicesPreview = useMemo(() => visiblePaidServices.slice(0, 3), [visiblePaidServices]);
  const selectedPaidServiceCategory = useMemo(
    () => paidServiceCategories.find((category) => category.id === selectedPaidServiceCategoryId) || null,
    [paidServiceCategories, selectedPaidServiceCategoryId]
  );
  const hasExtraMattress = !isSaleProperty && extraMattressMax > 0 && extraMattressPrice > 0;
  const reglesResume = [
    `Fumeurs: ${fumeursLabel || 'Non precise'}`,
    `Alcool: ${alcoolLabel || 'Non precise'}`,
    `Fetes: ${fetesLabel || 'Non precise'}`,
    `Heures silence: ${heuresSilenceLabel || 'Non precise'}`,
    `Animaux: ${animauxLabel || 'Non precise'}`,
  ].join(' | ');
  const formatRating = (value: number) =>
    Number.isFinite(value)
      ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
      : "0,0";

  const seasonalHighlights = useMemo(() => {
    if (isSaleProperty) return [];
    const rows = [
      { key: 'standing', label: 'Standing', value: standingLabel || '-', icon: <Star size={15} className="text-emerald-600" /> },
      { key: 'etage', label: 'Etage', value: etageLabel || '-', icon: <Building2 size={15} className="text-emerald-600" /> },
      { key: 'ascenseur', label: 'Ascenseur', value: seasonalConfig?.ascenseur ? 'Oui' : 'Non', icon: <Building2 size={15} className="text-emerald-600" /> },
      { key: 'vue', label: 'Vue', value: vueLabel || '-', icon: <Mountain size={15} className="text-emerald-600" /> },
      { key: 'sonore', label: 'Niveau sonore', value: niveauSonoreLabel || '-', icon: <Volume2 size={15} className="text-emerald-600" /> },
      { key: 'acces', label: 'Acces', value: accesLabel || '-', icon: <Route size={15} className="text-emerald-600" /> },
      { key: 'regles', label: 'Regles', value: reglesResume, icon: <ShieldCheck size={15} className="text-emerald-600" /> },
      { key: 'check', label: 'Check-in/out', value: `${seasonalConfig?.checkinHeure || '-'} / ${seasonalConfig?.checkoutHeure || '-'}`, icon: <Clock3 size={15} className="text-emerald-600" /> },
      { key: 'annulation', label: 'Annulation', value: politiqueAnnulationLabel || '-', icon: <Calendar size={15} className="text-emerald-600" /> },
      { key: 'depot', label: 'Depot', value: seasonalConfig?.depotGarantie ? `${seasonalConfig?.montantCaution || 0} TND (${typeCautionLabel || '-'})` : 'Non', icon: <Wallet size={15} className="text-emerald-600" /> },
      { key: 'produits', label: "Produits d'accueil", value: seasonalConfig?.produitsAccueilGratuits ? 'Gratuit' : `Supplement (${seasonalConfig?.fraisProduitsAccueil || 0} TND)`, icon: <Check size={15} className="text-emerald-600" /> },
    ];
    return rows;
  }, [
    accesLabel,
    alcoolLabel,
    animauxLabel,
    etageLabel,
    fumeursLabel,
    isSaleProperty,
    niveauSonoreLabel,
    politiqueAnnulationLabel,
    seasonalConfig?.ascenseur,
    seasonalConfig?.checkinHeure,
    seasonalConfig?.checkoutHeure,
    seasonalConfig?.depotGarantie,
    seasonalConfig?.fraisProduitsAccueil,
    seasonalConfig?.montantCaution,
    seasonalConfig?.produitsAccueilGratuits,
    reglesResume,
    standingLabel,
    typeCautionLabel,
    vueLabel,
  ]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      if (!sourceBien?.mode || !sourceBien?.type || !sourceBien?.id) {
        if (!disposed) {
          setAllFeatures([]);
          setFeatureTabs([]);
          setSeasonalDetailsTabId('');
        }
        return;
      }
      try {
        const base = String(API_URL || '').replace(/\/+$/, '');
        const normalizedBase = base.replace(/\/api$/i, '');
        const mode = encodeURIComponent(String(sourceBien.mode));
        const type = encodeURIComponent(String(sourceBien.type));
        const bienId = encodeURIComponent(String(sourceBien.id));
        const featureUrls = [
          `${base}/caracteristiques?mode_bien=${mode}&type_bien=${type}&bien_id=${bienId}`,
          `${normalizedBase}/api/caracteristiques?mode_bien=${mode}&type_bien=${type}&bien_id=${bienId}`,
        ];
        let featureResponse: Response | null = null;
        for (const url of Array.from(new Set(featureUrls))) {
          const next = await fetch(url);
          featureResponse = next;
          if (next.ok || next.status !== 404) break;
        }
        const featureRows = featureResponse?.ok ? await featureResponse.json() : [];
        if (!disposed) setAllFeatures(Array.isArray(featureRows) ? featureRows : []);

        const tabUrls = [
          `${base}/caracteristique-onglets?mode_bien=${mode}&type_bien=${type}`,
          `${normalizedBase}/api/caracteristique-onglets?mode_bien=${mode}&type_bien=${type}`,
        ];
        let tabResponse: Response | null = null;
        for (const url of Array.from(new Set(tabUrls))) {
          const next = await fetch(url);
          tabResponse = next;
          if (next.ok || next.status !== 404) break;
        }
        const tabRows = tabResponse?.ok ? await tabResponse.json() : [];
        if (!disposed) setFeatureTabs(Array.isArray(tabRows) ? tabRows : []);
      } catch {
        if (!disposed) {
          setAllFeatures([]);
          setFeatureTabs([]);
        }
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [sourceBien?.id, sourceBien?.mode, sourceBien?.type]);

  const selectedFeatureIds = useMemo(
    () => new Set((Array.isArray(sourceBien?.caracteristique_ids) ? sourceBien?.caracteristique_ids : []).map((item) => String(item))),
    [sourceBien?.caracteristique_ids]
  );
  const selectedFeatureNames = useMemo(
    () => new Set((Array.isArray(sourceBien?.caracteristiques) ? sourceBien?.caracteristiques : []).map((item) => normalizeFeatureName(String(item)))),
    [sourceBien?.caracteristiques]
  );
  const selectedPublicFeatures = useMemo(
    () => allFeatures.filter((feature) => {
      const byId = selectedFeatureIds.has(String(feature.id || ''));
      const byName = selectedFeatureNames.has(normalizeFeatureName(String(feature.nom || '')));
      return (byId || byName) && Number(feature.visibilite_client) !== 0;
    }),
    [allFeatures, selectedFeatureIds, selectedFeatureNames]
  );
  const selectedVisibleFeatures = useMemo(
    () => selectedPublicFeatures.filter((item) => String(item.onglet_id || '').trim().length > 0),
    [selectedPublicFeatures]
  );
  const selectedAmenityFeatures = useMemo(
    () => selectedVisibleFeatures.filter((feature) => isCharacteristicsTabName(String(feature.onglet_nom || ''))),
    [selectedVisibleFeatures]
  );
  const amenitySections = useMemo<AmenitySection[]>(() => {
    const orderLookup = new Map(featureTabs.map((tab) => [String(tab.id), Number(tab.ordre || 999)]));
    const nameLookup = new Map(featureTabs.map((tab) => [String(tab.id), cleanFeatureTabName(tab.nom)]));
    const grouped = new Map<string, AmenitySection>();

    selectedAmenityFeatures.forEach((feature) => {
      const tabId = String(feature.onglet_id || '').trim() || 'autres';
      const tabName = String(feature.onglet_nom || nameLookup.get(tabId) || 'Autres équipements');
      if (!grouped.has(tabId)) {
        grouped.set(tabId, { id: tabId, nom: cleanFeatureTabName(tabName), features: [] });
      }
      grouped.get(tabId)?.features.push(feature);
    });

    return Array.from(grouped.values())
      .map((section) => ({
        ...section,
        features: section.features.slice().sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr')),
      }))
      .sort((a, b) => (orderLookup.get(a.id) ?? 999) - (orderLookup.get(b.id) ?? 999));
  }, [featureTabs, selectedAmenityFeatures]);
  const detailTabs = useMemo(() => {
    const availableTabIds = new Set(selectedVisibleFeatures.map((item) => String(item.onglet_id || '')));
    return featureTabs
      .filter((tab) => availableTabIds.has(String(tab.id || '')))
      .map((tab) => ({ ...tab, nom: cleanFeatureTabName(String(tab.nom || '')) }))
      .slice()
      .sort((a, b) => Number(a.ordre || 999) - Number(b.ordre || 999));
  }, [featureTabs, selectedVisibleFeatures]);
  const selectedDetailFeatures = useMemo(
    () => selectedVisibleFeatures.filter((item) => String(item.onglet_id || '') === seasonalDetailsTabId),
    [seasonalDetailsTabId, selectedVisibleFeatures]
  );
  const fallbackDetailTabs = useMemo<SeasonalFallbackTab[]>(() => {
    if (selectedPublicFeatures.length === 0) return [];
    return [{
      id: 'fallback_externes',
      nom: 'Caracteristiques externes',
      rows: selectedPublicFeatures.map((feature) => ({
        label: feature.nom,
        value: 'Disponible',
      })),
    }];
  }, [selectedPublicFeatures]);
  const systemFallbackTabs = useMemo<SeasonalFallbackTab[]>(() => {
    const sortedTabs = featureTabs.slice().sort((a, b) => Number(a.ordre || 999) - Number(b.ordre || 999));
    const zoneName = selectedZone?.quartier || selectedZone?.nom || property?.location || '-';
    const villeName = selectedZone?.region || '-';
    const gouvernoratName = selectedZone?.gouvernerat || '-';
    const rowsForTab = (tabName: string): SeasonalDetailRow[] => {
      const key = normalizeFeatureName(tabName);
      if (key.includes('information')) {
        return [
          { label: 'Reference', value: sourceBien?.reference || '-' },
          { label: 'Titre annonce', value: sourceBien?.titre || property?.title || '-' },
          { label: 'Type logement', value: 'Appartement' },
          { label: 'Categorie standing', value: standingLabel || '-' },
          { label: 'Etage', value: etageLabel || '-' },
          { label: 'Ascenseur', value: seasonalConfig?.ascenseur ? 'Oui' : 'Non' },
          { label: 'Vue', value: vueLabel || '-' },
          { label: 'Niveau sonore', value: niveauSonoreLabel || '-' },
          { label: 'Acces general', value: accesLabel || '-' },
        ].filter((row) => row.value !== '-');
      }
      if (key.includes('localisation')) {
        return [
          { label: 'Zone / Quartier', value: zoneName },
          { label: 'Ville', value: villeName },
          { label: 'Gouvernorat', value: gouvernoratName },
        ].filter((row) => row.value !== '-');
      }
      if (key.includes('securite') || key.includes('reglement')) {
        return [
          { label: 'Fumeurs', value: fumeursLabel || '-' },
          { label: 'Alcool', value: alcoolLabel || '-' },
          { label: 'Animaux', value: animauxLabel || '-' },
          { label: 'Limite personnes / nuit', value: String(maxGuests) },
        ].filter((row) => row.value !== '-');
      }
      if (key.includes('condition')) {
        return [
          { label: 'Duree min sejour', value: `${minStay} nuit(s)` },
          { label: 'Duree max sejour', value: `${maxStay} nuit(s)` },
          { label: 'Politique annulation', value: politiqueAnnulationLabel || '-' },
          { label: 'Depot de garantie', value: seasonalConfig?.depotGarantie ? `${seasonalConfig?.montantCaution || 0} TND (${typeCautionLabel || '-'})` : 'Non' },
          { label: 'Check-in', value: seasonalConfig?.checkinHeure || '-' },
          { label: 'Check-out', value: seasonalConfig?.checkoutHeure || '-' },
        ].filter((row) => row.value !== '-');
      }
      if (key.includes('tarification')) {
        return [
          { label: 'Tarif nuit', value: `${formatTnd(displayedNightlyPrice)} TND${isAmicalePricingActive ? ' TTC' : ''}` },
          { label: 'Tarif semaine', value: `${formatTnd(displayedWeeklyPrice)} TND${isAmicalePricingActive ? ' TTC' : ''}` },
          ...(hasCleaningFee ? [{ label: 'Frais de menage', value: `${formatTnd(applyAmicaleTtc(property?.cleaningFee || 0, isAmicalePricingActive))} TND${isAmicalePricingActive ? ' TTC' : ''}` }] : []),
          ...(hasServiceFee ? [{ label: 'Frais de service', value: `${formatTnd(applyAmicaleTtc(property?.serviceFee || 0, isAmicalePricingActive))} TND${isAmicalePricingActive ? ' TTC' : ''}` }] : []),
          ...(hasExtraMattress ? [{ label: 'Matelas supplementaire', value: `${formatTnd(applyAmicaleTtc(extraMattressPrice, isAmicalePricingActive))} TND${isAmicalePricingActive ? ' TTC' : ''} / unite` }] : []),
          ...activePaidServices.map((service) => ({ label: service.label, value: `${formatTnd(applyAmicaleTtc(Number(service.prix || 0), isAmicalePricingActive))} TND${isAmicalePricingActive ? ' TTC' : ''}` })),
        ];
      }
      return [];
    };
    return sortedTabs
      .map((tab) => ({ id: tab.id, nom: cleanFeatureTabName(String(tab.nom || '')), rows: rowsForTab(String(tab.nom || '')) }))
      .filter((tab) => tab.rows.length > 0);
  }, [
    accesLabel,
    activePaidServices,
    alcoolLabel,
    animauxLabel,
    etageLabel,
    extraMattressPrice,
    fumeursLabel,
    hasCleaningFee,
    hasExtraMattress,
    hasServiceFee,
    isAmicalePricingActive,
    maxGuests,
    maxStay,
    minStay,
    niveauSonoreLabel,
    politiqueAnnulationLabel,
    property?.cleaningFee,
    property?.location,
    property?.serviceFee,
    property?.title,
    displayedNightlyPrice,
    displayedWeeklyPrice,
    seasonalConfig?.ascenseur,
    seasonalConfig?.checkinHeure,
    seasonalConfig?.checkoutHeure,
    seasonalConfig?.depotGarantie,
    seasonalConfig?.montantCaution,
    selectedZone?.gouvernerat,
    selectedZone?.nom,
    selectedZone?.quartier,
    selectedZone?.region,
    sourceBien?.reference,
    sourceBien?.titre,
    standingLabel,
    typeCautionLabel,
    vueLabel,
    featureTabs,
  ]);
  const usingConfiguredTabs = detailTabs.length > 0;
  const visibleDetailTabs = usingConfiguredTabs
    ? detailTabs.map((tab) => ({ id: tab.id, nom: tab.nom }))
    : (systemFallbackTabs.length > 0
      ? systemFallbackTabs.map((tab) => ({ id: tab.id, nom: tab.nom }))
      : fallbackDetailTabs.map((tab) => ({ id: tab.id, nom: tab.nom })));
  const selectedFallbackTab = (systemFallbackTabs.length > 0 ? systemFallbackTabs : fallbackDetailTabs).find((tab) => tab.id === seasonalDetailsTabId)
    || (systemFallbackTabs.length > 0 ? systemFallbackTabs[0] : fallbackDetailTabs[0])
    || null;

  useEffect(() => {
    if (visibleDetailTabs.length === 0) {
      setSeasonalDetailsTabId('');
      return;
    }
    if (!visibleDetailTabs.some((tab) => tab.id === seasonalDetailsTabId)) {
      setSeasonalDetailsTabId(visibleDetailTabs[0].id);
    }
  }, [visibleDetailTabs, seasonalDetailsTabId]);

  const valueForFeature = useCallback((featureName: string) => {
    const key = normalizeFeatureName(featureName);
    const zoneName = selectedZone?.nom || property?.location || '-';
    const startsWith = (value: string) => key.startsWith(value) || key.includes(value);
    if (startsWith('reference')) return sourceBien?.reference || '-';
    if (startsWith('titre annonce')) return sourceBien?.titre || property?.title || '-';
    if (startsWith('type logement')) return 'Appartement';
    if (startsWith('zone') || startsWith('quartier')) return selectedZone?.quartier || zoneName;
    if (startsWith('ville')) return selectedZone?.region || '-';
    if (startsWith('gouvernerat')) return selectedZone?.gouvernerat || '-';
    if (startsWith('coordonnees gps')) return '-';
    if (startsWith('categorie standing')) return standingLabel || '-';
    if (startsWith('etage')) return etageLabel || '-';
    if (startsWith('ascenseur')) return seasonalConfig?.ascenseur ? 'Oui' : 'Non';
    if (startsWith('vue')) return vueLabel || '-';
    if (startsWith('niveau sonore')) return niveauSonoreLabel || '-';
    if (startsWith('acces')) return accesLabel || '-';
    if (startsWith('limite personnes')) return String(maxGuests);
    if (startsWith('duree min sejour')) return `${minStay}`;
    if (startsWith('duree max sejour')) return `${maxStay}`;
    if (startsWith('politique annulation')) return politiqueAnnulationLabel || '-';
    if (startsWith('depot de garantie')) return seasonalConfig?.depotGarantie ? 'Oui' : 'Non';
    if (startsWith('montant caution')) return `${seasonalConfig?.montantCaution || 0}`;
    if (startsWith('type caution')) return typeCautionLabel || '-';
    if (startsWith('check-in')) return seasonalConfig?.checkinHeure || '-';
    if (startsWith('check-out')) return seasonalConfig?.checkoutHeure || '-';
    if (startsWith('fumeurs')) return fumeursLabel || '-';
    if (startsWith('alcool')) return alcoolLabel || '-';
    if (startsWith('animaux')) return animauxLabel || '-';
    if (startsWith('produits d accueil') || startsWith("produits d'accueil")) {
      return seasonalConfig?.produitsAccueilGratuits ? 'Gratuit' : `${seasonalConfig?.fraisProduitsAccueil || 0} TND`;
    }
    if (startsWith('frais de menage')) return hasCleaningFee ? `${formatTnd(applyAmicaleTtc(property?.cleaningFee || 0, isAmicalePricingActive))} TND${isAmicalePricingActive ? ' TTC' : ''}` : 'Non disponible';
    if (startsWith('frais de service')) return hasServiceFee ? `${formatTnd(applyAmicaleTtc(property?.serviceFee || 0, isAmicalePricingActive))} TND${isAmicalePricingActive ? ' TTC' : ''}` : 'Non disponible';
    if (startsWith('matelas supplementaire')) return hasExtraMattress ? `${formatTnd(applyAmicaleTtc(extraMattressPrice, isAmicalePricingActive))} TND${isAmicalePricingActive ? ' TTC' : ''} / unite` : 'Non disponible';
    if (startsWith('tarif nuit') || startsWith('prix nuit')) return `${formatTnd(displayedNightlyPrice)} TND${isAmicalePricingActive ? ' TTC' : ''}`;
    if (startsWith('tarif semaine') || startsWith('prix semaine')) return `${formatTnd(displayedWeeklyPrice)} TND${isAmicalePricingActive ? ' TTC' : ''}`;
    return 'Oui';
  }, [
    accesLabel,
    alcoolLabel,
    animauxLabel,
    etageLabel,
    extraMattressPrice,
    fumeursLabel,
    hasCleaningFee,
    hasExtraMattress,
    hasServiceFee,
    maxGuests,
    maxStay,
    minStay,
    niveauSonoreLabel,
    politiqueAnnulationLabel,
    property?.cleaningFee,
    property?.location,
    property?.serviceFee,
    property?.title,
    currentDisplayPricing.nightlyPrice,
    currentDisplayPricing.weeklyPrice,
    seasonalConfig?.ascenseur,
    seasonalConfig?.checkinHeure,
    seasonalConfig?.checkoutHeure,
    seasonalConfig?.depotGarantie,
    seasonalConfig?.fraisProduitsAccueil,
    seasonalConfig?.montantCaution,
    seasonalConfig?.produitsAccueilGratuits,
    selectedZone?.gouvernerat,
    selectedZone?.nom,
    selectedZone?.quartier,
    selectedZone?.region,
    sourceBien?.reference,
    sourceBien?.titre,
    standingLabel,
    typeCautionLabel,
    vueLabel,
  ]);

  const lightboxPreviewTargetWidth = useMemo(() => {
    if (typeof window === "undefined") return isMobileViewport ? 760 : 1180;
    const viewportWidth = Math.max(320, window.innerWidth || 320);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const requested = Math.round(viewportWidth * dpr * 0.92);
    const minWidth = isMobileViewport ? 640 : 900;
    return Math.max(minWidth, Math.min(1280, requested));
  }, [isMobileViewport, lightboxOpen]);
  const valuesForFeature = useCallback((feature: FeatureApiRow): string[] => {
    const directValues = parseFeatureValueJson(feature.valeur_json);
    if (directValues.length > 0) return directValues;

    const fallbackValue = valueForFeature(feature.nom);
    const normalizedType = String(feature.type_caracteristique || 'simple').trim().toLowerCase();
    const isSimpleType = normalizedType === 'simple';
    if (!fallbackValue || fallbackValue === '-') return [];
    if (!isSimpleType && fallbackValue === 'Oui') return [];
    return [fallbackValue];
  }, [valueForFeature]);
  const featureDisplayItems = useMemo<FeatureDisplayItem[]>(() => (
    amenitySections.flatMap((section) => (
      section.features.flatMap((feature) => {
        const values = valuesForFeature(feature);
        const normalizedType = String(feature.type_caracteristique || 'simple').trim().toLowerCase();
        const isSimpleType = normalizedType === 'simple';
        if (values.length === 0 && !isSimpleType) {
          return [];
        }
        if (values.length > 0) {
          const combinedValue = values.join(', ');
          return [{
            id: `${feature.id}:${combinedValue}`,
            label: feature.nom,
            meta: combinedValue === feature.nom ? null : combinedValue,
            sectionName: section.nom,
            feature,
          }];
        }
        return [{
          id: feature.id,
          label: feature.nom,
          meta: null,
          sectionName: section.nom,
          feature,
        }];
      })
    ))
  ), [amenitySections, valuesForFeature]);
  const amenityPreviewItems = useMemo(() => featureDisplayItems.slice(0, 6), [featureDisplayItems]);
  const totalAmenitiesCount = featureDisplayItems.length;
  const visibleSelectedDetailFeatures = useMemo(
    () => selectedDetailFeatures.filter((feature) => {
      const normalizedType = String(feature.type_caracteristique || 'simple').trim().toLowerCase();
      return normalizedType === 'simple' || valuesForFeature(feature).length > 0;
    }),
    [selectedDetailFeatures, valuesForFeature]
  );
  const hasSeasonalStayInfo = seasonalHighlights.length > 0 || visibleDetailTabs.length > 0;

  // Load saved state from localStorage on mount
  useEffect(() => {
    if (property) {
      const savedProperties = JSON.parse(localStorage.getItem('savedProperties') || '[]');
      setIsSaved(savedProperties.includes(property.id));
    }
  }, [property]);

  useEffect(() => {
    if (!showLoginPrompt) return;
    let isMounted = true;
    if (!user || user.role !== "user" || user.profileCompleted) {
      setLoginPromptStep("choices");
    }
    void getAuthProviders().then((availableProviders) => {
      if (isMounted) setProviders(availableProviders);
    });
    return () => {
      isMounted = false;
    };
  }, [showLoginPrompt, user]);

  const openProfileSetupStep = useCallback((sourceUser?: any) => {
    const currentUser = sourceUser || user;
    const nameParts = splitHumanName(currentUser?.name || "");
    setProfilePromptForm({
      firstName: String(currentUser?.firstName || nameParts.firstName || "").trim(),
      lastName: String(currentUser?.lastName || nameParts.lastName || "").trim(),
      clientType: "locataire",
      telephone: String(currentUser?.telephone || "").trim(),
      address: String(currentUser?.address || "").trim(),
      cin: String(currentUser?.cin || "").trim(),
    });
    setLoginPromptStep("profile_setup");
    setShowLoginPrompt(true);
  }, [user]);

  useEffect(() => {
    if (!property) return;
    if (!hasTrackingConsent()) return;
    const identityKey = user?.email || 'anonymous';
    const visitKey = `${identityKey}:${property.id}`;
    if (lastTrackedVisitKeyRef.current === visitKey) return;
    lastTrackedVisitKeyRef.current = visitKey;
    void trackPublicClientInteraction({
      type: 'visite',
      bienId: String(property.id),
      propertyTitle: property.title,
      clientUserId: user?.role === 'user' ? user.id : undefined,
      clientEmail: user?.role === 'user' ? user.email : undefined,
      clientName: user?.role === 'user' ? user.name : undefined,
      sessionId: getOrCreateTrackingSessionId(),
      path: window.location.pathname + window.location.search,
      metadata: {
        propertyCategory: String(property.category || '').trim() || null,
        bedrooms: Number(property.bedrooms || 0),
      },
    }).catch(() => {});
  }, [property, user, consentRevision]);

  useEffect(() => {
    const onConsentUpdated = () => setConsentRevision((prev) => prev + 1);
    window.addEventListener('dwira-consent-updated', onConsentUpdated as EventListener);
    return () => window.removeEventListener('dwira-consent-updated', onConsentUpdated as EventListener);
  }, []);

  // Carousel for other properties
  const [otherPropertiesRef, otherPropertiesApi] = useEmblaCarousel({ 
    loop: false, 
    align: 'start',
    slidesToScroll: 1,
    containScroll: 'trimSnaps'
  });

  // Filter other properties based on URL filter state (same logic as PropertiesPage)
  const filteredOtherProperties = useMemo(() => {
    const filtered = properties.filter((p) => {
      if (p.id === property?.id) return false;
      const matchMode = !filterMode || (p.mode || "location_saisonniere") === filterMode;
      
      // Location filter (case insensitive includes)
      const matchLocation = !filterLocation || p.location.toLowerCase().includes(filterLocation.toLowerCase());
      
      // Category filter (OR logic - any selected category matches)
      const matchCategory = filterCategories.length === 0 || filterCategories.includes(p.category);
      
      // Amenities filter (AND logic - must have ALL selected amenities)
      const matchAmenities = filterAmenities.every(am => p.amenities.includes(am));
      
      // Price filter
      const matchPrice = p.pricePerNight >= minPrice && p.pricePerNight <= maxPrice;
      
      // Featured filter
      const matchFeatured = !filterFeatured || p.isFeatured;
      
      return matchMode && matchLocation && matchCategory && matchAmenities && matchPrice && matchFeatured;
    });

    // Sort: featured first (same as PropertiesPage)
    return filtered.sort((a, b) => {
      if (a.isFeatured === b.isFeatured) return 0;
      return a.isFeatured ? -1 : 1;
    });
  }, [property?.id, filterMode, filterLocation, filterCategories, filterAmenities, filterFeatured, minPrice, maxPrice, properties]);

  const getLightboxOriginalSrc = useCallback((index: number) => {
    if (galleryImages.length === 0) return "";
    const safeIndex = ((index % galleryImages.length) + galleryImages.length) % galleryImages.length;
    return getOriginalMediaUrl(galleryImages[safeIndex]);
  }, [galleryImages]);

  const getLightboxPreviewSrc = useCallback((index: number, quality = 68) => {
    if (galleryImages.length === 0) return "";
    const safeIndex = ((index % galleryImages.length) + galleryImages.length) % galleryImages.length;
    return getOptimizedMediaUrl(galleryImages[safeIndex], { width: lightboxPreviewTargetWidth, quality });
  }, [galleryImages, lightboxPreviewTargetWidth]);

  const ensureLightboxPreviewQuality = useCallback((index: number, quality: number) => {
    return new Promise<boolean>((resolve) => {
      if (galleryImages.length === 0) {
        resolve(false);
        return;
      }
      const safeIndex = ((index % galleryImages.length) + galleryImages.length) % galleryImages.length;
      const previewSrc = getLightboxPreviewSrc(safeIndex, quality);
      if (!previewSrc) {
        resolve(false);
        return;
      }
      if (loadedLightboxPreviewSrcsRef.current.has(previewSrc)) {
        setLightboxPreviewQualityByIndex((prev) => {
          const currentQuality = prev[safeIndex] || 0;
          if (currentQuality >= quality) return prev;
          return { ...prev, [safeIndex]: quality };
        });
        resolve(true);
        return;
      }
      if (hasFailedImageSource(previewSrc)) {
        resolve(false);
        return;
      }
      const previewImage = new Image();
      previewImage.decoding = "async";
      previewImage.onload = () => {
        loadedLightboxPreviewSrcsRef.current.add(previewSrc);
        setLightboxPreviewQualityByIndex((prev) => {
          const currentQuality = prev[safeIndex] || 0;
          if (currentQuality >= quality) return prev;
          return { ...prev, [safeIndex]: quality };
        });
        resolve(true);
      };
      previewImage.onerror = () => {
        markFailedImageSource(previewSrc);
        resolve(false);
      };
      previewImage.src = previewSrc;
    });
  }, [galleryImages.length, getLightboxPreviewSrc]);

  const ensureLightboxOriginalLoaded = useCallback((index: number) => {
    return new Promise<boolean>((resolve) => {
      if (galleryImages.length === 0) {
        resolve(false);
        return;
      }
      const safeIndex = ((index % galleryImages.length) + galleryImages.length) % galleryImages.length;
      const originalSrc = getLightboxOriginalSrc(safeIndex);
      if (!originalSrc) {
        resolve(false);
        return;
      }
      if (loadedLightboxOriginalSrcsRef.current.has(originalSrc)) {
        resolve(true);
        return;
      }
      if (hasFailedImageSource(originalSrc)) {
        resolve(false);
        return;
      }
      const originalImage = new Image();
      originalImage.decoding = "async";
      originalImage.onload = () => {
        loadedLightboxOriginalSrcsRef.current.add(originalSrc);
        resolve(true);
      };
      originalImage.onerror = () => {
        markFailedImageSource(originalSrc);
        resolve(false);
      };
      originalImage.src = originalSrc;
    });
  }, [galleryImages.length, getLightboxOriginalSrc]);

  const openLightbox = (index: number) => {
    const initialOriginalSrc = getLightboxOriginalSrc(index);
    const initialPreviewSrc = getLightboxPreviewSrc(index, LIGHTBOX_QUALITY_LOW);
    setCurrentImageIndex(index);
    setLightboxOriginalLoaded(loadedLightboxOriginalSrcsRef.current.has(initialOriginalSrc));
    setLightboxImageLoading(!loadedLightboxPreviewSrcsRef.current.has(initialPreviewSrc));
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    document.body.style.overflow = 'unset';
  };

  const nextImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev + 1) % Math.max(1, galleryImages.length));
  }, [galleryImages.length]);

  const prevImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev - 1 + Math.max(1, galleryImages.length)) % Math.max(1, galleryImages.length));
  }, [galleryImages.length]);

  useEffect(() => {
    if (galleryImages.length === 0) {
      setCurrentImageIndex(0);
      return;
    }
    setCurrentImageIndex((prev) => (prev >= galleryImages.length ? 0 : prev));
  }, [galleryImages.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, nextImage, prevImage]);

  useEffect(() => {
    if (!lightboxOpen || galleryImages.length === 0) return;

    const runId = ++lightboxPreloadRunIdRef.current;
    const isStale = () => runId !== lightboxPreloadRunIdRef.current;
    const allowFullResOriginal = canLoadFullResByConnection() && !isMobileViewport;
    const currentOriginalSrc = getLightboxOriginalSrc(currentImageIndex);
    const currentPreviewSrc = getLightboxPreviewSrc(currentImageIndex, LIGHTBOX_QUALITY_LOW);
    const hasOriginal = loadedLightboxOriginalSrcsRef.current.has(currentOriginalSrc);
    const hasPreview = loadedLightboxPreviewSrcsRef.current.has(currentPreviewSrc);
    setLightboxOriginalIndex(allowFullResOriginal && hasOriginal ? currentImageIndex : null);
    setLightboxOriginalLoaded(allowFullResOriginal && hasOriginal);
    setLightboxImageLoading(!hasPreview);
    const nextIndex = (currentImageIndex + 1) % galleryImages.length;
    const prevIndex = (currentImageIndex - 1 + galleryImages.length) % galleryImages.length;

    const preloadOrder: number[] = [];
    const seen = new Set<number>();
    const pushUnique = (index: number) => {
      const safe = ((index % galleryImages.length) + galleryImages.length) % galleryImages.length;
      if (seen.has(safe)) return;
      seen.add(safe);
      preloadOrder.push(safe);
    };
    pushUnique(currentImageIndex);
    pushUnique(nextIndex);
    pushUnique(prevIndex);
    for (let offset = 2; offset < Math.min(galleryImages.length, 5); offset += 1) {
      pushUnique(currentImageIndex + offset);
      pushUnique(currentImageIndex - offset);
    }

    void (async () => {
      // Phase 1: render the current image quickly at low quality.
      await ensureLightboxPreviewQuality(currentImageIndex, LIGHTBOX_QUALITY_LOW);
      if (isStale()) return;
      setLightboxImageLoading(false);

      // Phase 2: secure near navigation first.
      await ensureLightboxPreviewQuality(nextIndex, LIGHTBOX_QUALITY_LOW);
      if (isStale()) return;
      await ensureLightboxPreviewQuality(prevIndex, LIGHTBOX_QUALITY_LOW);
      if (isStale()) return;

      // Phase 3: progressively improve current image quality.
      await ensureLightboxPreviewQuality(currentImageIndex, LIGHTBOX_QUALITY_MEDIUM);
      if (isStale()) return;
      await ensureLightboxPreviewQuality(currentImageIndex, LIGHTBOX_QUALITY_HIGH);
      if (isStale()) return;
      if (allowFullResOriginal) {
        setLightboxOriginalIndex(currentImageIndex);
        await ensureLightboxOriginalLoaded(currentImageIndex);
        if (isStale()) return;
      }

      // Phase 4: load the rest one-by-one to avoid connection spikes.
      for (const index of preloadOrder) {
        if (isStale()) return;
        if (index === currentImageIndex || index === nextIndex || index === prevIndex) continue;
        await ensureLightboxPreviewQuality(index, LIGHTBOX_QUALITY_LOW);
      }
    })();

    return () => {
      lightboxPreloadRunIdRef.current += 1;
    };
  }, [
    currentImageIndex,
    galleryImages.length,
    lightboxOpen,
    getLightboxOriginalSrc,
    getLightboxPreviewSrc,
    ensureLightboxOriginalLoaded,
    ensureLightboxPreviewQuality,
    isMobileViewport,
  ]);

  useEffect(() => {
    if (!lightboxOpen || !lightboxImageLoading) return;
    const timeoutId = window.setTimeout(() => {
      setLightboxImageLoading(false);
    }, 2800);
    return () => window.clearTimeout(timeoutId);
  }, [lightboxImageLoading, lightboxOpen, currentImageIndex]);

  useEffect(() => {
    if (lightboxOpen) return;
    lightboxPreloadRunIdRef.current += 1;
  }, [lightboxOpen]);

  const visibleLightboxThumbIndexes = useMemo(() => {
    if (galleryImages.length <= 7) {
      return galleryImages.map((_, index) => index);
    }

    const indexes: number[] = [];
    for (let offset = -3; offset <= 3; offset += 1) {
      indexes.push((currentImageIndex + offset + galleryImages.length) % galleryImages.length);
    }
    return indexes;
  }, [currentImageIndex, galleryImages]);

  const currentLightboxPreviewQuality = useMemo(
    () => lightboxPreviewQualityByIndex[currentImageIndex] || LIGHTBOX_QUALITY_LOW,
    [currentImageIndex, lightboxPreviewQualityByIndex]
  );
  const currentLightboxPreviewSrc = useMemo(
    () => getLightboxPreviewSrc(currentImageIndex, currentLightboxPreviewQuality),
    [currentImageIndex, currentLightboxPreviewQuality, getLightboxPreviewSrc]
  );
  const currentLightboxOriginalSrc = useMemo(
    () => getLightboxOriginalSrc(currentImageIndex),
    [currentImageIndex, getLightboxOriginalSrc]
  );

  const handleLightboxPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    lightboxPointerStartXRef.current = event.clientX;
  }, []);

  const handleLightboxPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    const startX = lightboxPointerStartXRef.current;
    const endX = event.clientX ?? null;
    lightboxPointerStartXRef.current = null;
    if (startX === null || endX === null) return;
    const deltaX = endX - startX;
    if (Math.abs(deltaX) < 40) return;
    if (deltaX < 0) {
      nextImage();
      return;
    }
    prevImage();
  }, [nextImage, prevImage]);

  const handleDateRangeSelect = (start: Date | null, end: Date | null) => {
    const failRule = (message: string) => {
      setRuleDialogMessage(message);
      setShowRuleDialog(true);
      setSelectedStart(null);
      setSelectedEnd(null);
    };

    if (!isSaleProperty && start && !end) {
      const startDate = format(start, 'yyyy-MM-dd');
      const weekdayRuleCheck = validateCheckinWeekdayRule({
        startDate,
        periods: property?.pricingPeriods || [],
        amicaleId: pricingAmicaleId,
      });
      if (!weekdayRuleCheck.ok) {
        const checkinMessage = weekdayRuleCheck.requiredCheckinDay ? `check-in: ${weekdayRuleCheck.requiredCheckinDay}` : null;
        const detail = [checkinMessage].filter(Boolean).join(' | ');
        failRule(`Arrivee non autorisee pour cette periode (${detail}).`);
        return;
      }
    }

    if (!isSaleProperty && start && end) {
      const orderedStart = start < end ? start : end;
      const orderedEnd = start < end ? end : start;
      const startDate = format(orderedStart, 'yyyy-MM-dd');
      const endDate = format(orderedEnd, 'yyyy-MM-dd');
      const unavailableRows = liveUnavailableDates
        ?? (Array.isArray(property?.unavailableDates) ? property.unavailableDates : []);
      const nextDayDate = format(new Date(orderedStart.getTime() + (24 * 60 * 60 * 1000)), 'yyyy-MM-dd');
      const isBlockedOrBookedDay = (day: string) => unavailableRows.some((row) => {
        const status = String(row?.status || '').toLowerCase();
        if (status !== 'blocked' && status !== 'booked') return false;
        const rowStart = String(row?.start || '').slice(0, 10);
        const rowEnd = String(row?.end || '').slice(0, 10);
        if (!rowStart || !rowEnd) return false;
        return rowStart <= day && day <= rowEnd;
      });
      const isArrivalInsideOccupiedNight = unavailableRows.some((row) => {
        const status = String(row?.status || '').toLowerCase();
        if (status !== 'blocked' && status !== 'booked') return false;
        const rowStart = String(row?.start || '').slice(0, 10);
        const rowEnd = String(row?.end || '').slice(0, 10);
        if (!rowStart || !rowEnd) return false;
        // Occupied nights are [rowStart, rowEnd). Arrival on rowEnd is allowed (boundary).
        return rowStart <= startDate && startDate < rowEnd;
      });
      if (isArrivalInsideOccupiedNight && isBlockedOrBookedDay(nextDayDate)) {
        failRule("Date d'arrivee invalide: ce jour est bloque ou reserve.");
        return;
      }
      const hasBlockedOrBookedOverlap = unavailableRows.some((row) => {
        const status = String(row?.status || '').toLowerCase();
        if (status !== 'blocked' && status !== 'booked') return false;
        const rowStart = String(row?.start || '').slice(0, 10);
        const rowEnd = String(row?.end || '').slice(0, 10);
        if (!rowStart || !rowEnd) return false;
        // Night-overlap check with end-exclusive intervals:
        // guest stay [startDate, endDate), occupied range [rowStart, rowEnd)
        // This allows checkout exactly on rowStart (boundary handoff day).
        return rowStart < endDate && rowEnd > startDate;
      });
      if (hasBlockedOrBookedOverlap) {
        failRule("Periode invalide: un ou plusieurs jours sont bloques ou reserves.");
        return;
      }
      const nights = Math.max(0, Math.abs(differenceInDays(orderedEnd, orderedStart)));

      const minStayForSelection = getReservationMinStayRequirement({
        startDate,
        endDate,
        periods: property?.pricingPeriods || [],
        fallbackMinStay: minStay,
        amicaleId: pricingAmicaleId,
      });
      if (nights < minStayForSelection) {
        failRule(`Sejour minimum pour cette periode: ${minStayForSelection} nuit(s).`);
        return;
      }
      if (nights > maxStay) {
        failRule(`Sejour maximum: ${maxStay} nuit(s).`);
        return;
      }

      const weekdayRuleCheck = validateReservationWeekdayRule({
        startDate,
        endDate,
        periods: property?.pricingPeriods || [],
        amicaleId: pricingAmicaleId,
      });
      if (!weekdayRuleCheck.ok) {
        const checkinMessage = weekdayRuleCheck.requiredCheckinDay ? `check-in: ${weekdayRuleCheck.requiredCheckinDay}` : null;
        const checkoutMessage = weekdayRuleCheck.requiredCheckoutDay ? `check-out: ${weekdayRuleCheck.requiredCheckoutDay}` : null;
        const detail = [checkinMessage, checkoutMessage].filter(Boolean).join(' | ');
        failRule(`Regle de periode non respectee (${detail}).`);
        return;
      }
    }

    setSelectedStart(start);
    setSelectedEnd(end);
  };

  const handleBookingDateRangeSelect = useCallback((start: Date | null, end: Date | null) => {
    handleDateRangeSelect(start, end);
    if (start && end) {
      setShowBookingCalendarDialog(false);
    }
  }, []);

  const formatBookingFieldDate = useCallback((value: Date | null) => {
    if (!value) return "jj/mm/aaaa";
    return format(value, "dd/MM/yyyy");
  }, []);

  useEffect(() => {
    const loadAmicales = async () => {
      try {
        const rows = await fetchAmicalesPublic();
        setAmicaleOptions(rows.map((item) => ({ id: item.id, name: item.name, code: item.code, logoUrl: item.logoUrl })));
      } catch {
        setAmicaleOptions([]);
      }
    };
    void loadAmicales();
  }, []);

  useEffect(() => {
    if (!property || draftHydratedRef.current) return;
    const stateDraft = (location.state as { draft?: PendingReservationDraft; restoreDraft?: boolean } | null)?.draft || null;
    const storedDraft = readPendingReservationDraft();
    const candidate = stateDraft || storedDraft;
    if (!candidate || !propertyMatchesRouteToken(property, candidate.propertySlug)) return;
    const parsedStart = candidate.startDate ? new Date(candidate.startDate) : null;
    const parsedEnd = candidate.endDate ? new Date(candidate.endDate) : null;
    if (!parsedStart || !parsedEnd || Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) return;
    draftHydratedRef.current = true;
    setSelectedStart(parsedStart);
    setSelectedEnd(parsedEnd);
    const fallbackGuests = Math.max(1, Number(candidate.guests || 1));
    const nextAdults = Math.max(1, Number((candidate as PendingReservationDraft).adultGuests ?? fallbackGuests));
    const nextChildren = Math.max(0, Number((candidate as PendingReservationDraft).childGuests ?? (fallbackGuests - nextAdults)));
    const boundedAdults = Math.min(maxGuests, maxAdultGuests, nextAdults);
    const boundedChildren = Math.min(Math.max(0, Math.min(maxChildGuests, maxGuests - boundedAdults)), nextChildren);
    setAdultGuests(boundedAdults);
    setChildGuests(boundedChildren);
    setIncludeCleaningFee(Boolean(candidate.includeCleaningFee));
    setIncludeServiceFee(Boolean(candidate.includeServiceFee));
    setExtraMattresses(Math.max(0, Number(candidate.extraMattresses || 0)));
    setSelectedPaidServiceIds(Array.isArray(candidate.selectedPaidServiceIds) ? candidate.selectedPaidServiceIds : []);
    setPaymentMode(candidate.paymentMode === 'totalite' ? 'totalite' : (candidate.paymentMode === 'amicale' ? 'amicale' : 'avance'));
    setAmicaleSelectionId(String(candidate.amicaleSelectionId || ""));
    setAmicaleFullName(String(candidate.amicaleName || ""));
    setAmicaleMatricule(String(candidate.amicaleMatricule || ""));
    setAmicalePhone(String(candidate.amicalePhone || ""));
    setAmicaleCode(String(candidate.amicaleCode || ""));
    setReservationNote(String(candidate.reservationNote || ""));
    setPendingDraft(candidate);
  }, [location.state, maxAdultGuests, maxChildGuests, maxGuests, property]);

  // Calculate total price
  const calculateTotal = () => {
    const selectedServices = activePaidServices.filter((service) => selectedPaidServiceIds.includes(service.id));
    const fixedSelectedServices = selectedServices.filter((service) => service.type_tarification === 'fixe');
    const variableSelectedServices = selectedServices.filter((service) => service.type_tarification !== 'fixe');
    const paidServicesTotal = fixedSelectedServices.reduce((sum, service) => sum + Number(service.prix || 0), 0);
    const productsAccueilFee = property?.seasonalConfig?.produitsAccueilGratuits === false
      ? Number(property?.seasonalConfig?.fraisProduitsAccueil || 0)
      : 0;
    if (!selectedStart || !selectedEnd) return {
      nights: 0,
      accommodationTotal: 0,
      cleaningFee: 0,
      serviceFee: 0,
      extraMattressTotal: 0,
      paidServicesTotal,
      fixedSelectedServices,
      variableSelectedServices,
      productsAccueilFee,
      extrasTotal: paidServicesTotal + productsAccueilFee,
      total: paidServicesTotal + productsAccueilFee
    };
    const accommodationPricing = calculateAccommodationPricing({
      startDate: selectedStart,
      endDate: selectedEnd,
      defaultNightlyPrice: property!.pricePerNight,
      defaultWeeklyPrice: property!.pricePerWeek,
      pricingPeriods: property!.pricingPeriods,
      amicaleId: pricingAmicaleId,
    });
    const nights = accommodationPricing.nights;
    const accommodationTotal = accommodationPricing.accommodationTotal;
    const cleaningFee = (hasCleaningFee && includeCleaningFee && property?.cleaningFee) ? property.cleaningFee : 0;
    const serviceFee = (hasServiceFee && includeServiceFee && property?.serviceFee) ? property.serviceFee : 0;
    const extraMattressTotal = extraMattresses * extraMattressPrice;
    const extrasTotal = cleaningFee + serviceFee + extraMattressTotal + paidServicesTotal + productsAccueilFee;
    const total = accommodationTotal + extrasTotal;
    return {
      nights,
      accommodationTotal: applyAmicaleTtc(accommodationTotal, isAmicalePricingActive),
      averageNightlyPrice: accommodationPricing.averageNightlyPrice,
      hasPeriodOverride: accommodationPricing.hasPeriodOverride,
      cleaningFee: applyAmicaleTtc(cleaningFee, isAmicalePricingActive),
      serviceFee: applyAmicaleTtc(serviceFee, isAmicalePricingActive),
      extraMattressTotal: applyAmicaleTtc(extraMattressTotal, isAmicalePricingActive),
      paidServicesTotal: applyAmicaleTtc(paidServicesTotal, isAmicalePricingActive),
      fixedSelectedServices,
      variableSelectedServices,
      productsAccueilFee: applyAmicaleTtc(productsAccueilFee, isAmicalePricingActive),
      extrasTotal: applyAmicaleTtc(extrasTotal, isAmicalePricingActive),
      total: applyAmicaleTtc(total, isAmicalePricingActive)
    };
  };

  const effectiveUnavailableDates = liveUnavailableDates
    ?? (Array.isArray(property?.unavailableDates) ? property.unavailableDates : []);

  // Check if selected range includes pending dates and get the payment deadline
  const getPendingDateInfo = () => {
    if (!selectedStart || !selectedEnd || !effectiveUnavailableDates) return null;
    
    const rangeStart = selectedStart < selectedEnd ? selectedStart : selectedEnd;
    const rangeEnd = selectedStart < selectedEnd ? selectedEnd : selectedStart;
    
    const overlappingPending = effectiveUnavailableDates.find((range) => {
      if (range.status !== 'pending') return false;
      const start = parseISO(range.start);
      const end = parseISO(range.end);
      // Check if there's any overlap between selected range and pending range
      return (
        (rangeStart <= end && rangeEnd >= start) ||
        isWithinInterval(rangeStart, { start, end }) ||
        isWithinInterval(rangeEnd, { start, end })
      );
    });
    
    return overlappingPending || null;
  };

  const pricing = calculateTotal();
  const pendingDateInfo = getPendingDateInfo();
  const hasPendingDates = !!pendingDateInfo;
  
  // Get payment deadline from the pending date data (set by admin dashboard)
  const getPaymentDeadline = () => {
    if (!pendingDateInfo?.paymentDeadline) return null;
    return format(parseISO(pendingDateInfo.paymentDeadline), "d MMMM yyyy", { locale: fr });
  };

  // Handle share functionality
  const handleShare = async () => {
    if (property && hasTrackingConsent()) {
      void trackPublicClientInteraction({
        type: 'partage',
        bienId: String(property.id),
        propertyTitle: property.title,
        clientUserId: user?.role === 'user' ? user.id : undefined,
        clientEmail: user?.role === 'user' ? user.email : undefined,
        clientName: user?.role === 'user' ? user.name : undefined,
        sessionId: getOrCreateTrackingSessionId(),
        path: window.location.pathname + window.location.search,
      }).catch(() => {});
    }
    const shareUrl = window.location.href;
    
    // Try Web Share API first (mobile devices)
    if (navigator.share) {
      try {
        await navigator.share({
          title: property?.title || 'Logement',
          text: `Découvrez ce logement: ${property?.title}`,
          url: shareUrl,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fallback to clipboard
      }
    }
    
    // Fallback to clipboard copy
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Lien copié dans le presse-papiers !");
    } catch (err) {
      toast.error("Impossible de copier le lien");
    }
  };

  // Handle save/favorite functionality
  const handleSave = () => {
    if (!property) return;
    
    const savedProperties = JSON.parse(localStorage.getItem('savedProperties') || '[]');
    
    if (isSaved) {
      // Remove from saved
      const updated = savedProperties.filter((id: number) => id !== property.id);
      localStorage.setItem('savedProperties', JSON.stringify(updated));
      setIsSaved(false);
      toast.success("Retiré des favoris");
    } else {
      // Add to saved
      savedProperties.push(property.id);
      localStorage.setItem('savedProperties', JSON.stringify(savedProperties));
      setIsSaved(true);
      if (hasTrackingConsent()) {
        void trackPublicClientInteraction({
          type: 'like',
          bienId: String(property.id),
          propertyTitle: property.title,
          clientUserId: user?.role === 'user' ? user.id : undefined,
          clientEmail: user?.role === 'user' ? user.email : undefined,
          clientName: user?.role === 'user' ? user.name : undefined,
          sessionId: getOrCreateTrackingSessionId(),
          path: window.location.pathname + window.location.search,
        }).catch(() => {});
      }
      toast.success("Ajouté aux favoris");
    }
  };

  const handleReservationRequest = async () => {
    const failRule = (message: string) => {
      setRuleDialogMessage(message);
      setShowRuleDialog(true);
      setSelectedStart(null);
      setSelectedEnd(null);
    };

    if (!property) return;
    if (!selectedStart || !selectedEnd) {
      failRule('Selectionnez une periode valide.');
      return;
    }

    const start = selectedStart < selectedEnd ? selectedStart : selectedEnd;
    const end = selectedStart < selectedEnd ? selectedEnd : selectedStart;
    const startDate = format(start, 'yyyy-MM-dd');
    const endDate = format(end, 'yyyy-MM-dd');
    if (startDate === endDate) {
      failRule('Choisissez au moins une nuit.');
      return;
    }
    const nights = Math.max(0, Math.abs(differenceInDays(end, start)));
    const minStayForSelection = getReservationMinStayRequirement({
      startDate,
      endDate,
      periods: property?.pricingPeriods || [],
      fallbackMinStay: minStay,
      amicaleId: pricingAmicaleId,
    });
    if (!isSaleProperty && nights < minStayForSelection) {
      failRule(`Sejour minimum pour cette periode: ${minStayForSelection} nuit(s).`);
      return;
    }
    if (!isSaleProperty && nights > maxStay) {
      failRule(`Sejour maximum: ${maxStay} nuit(s).`);
      return;
    }
    const weekdayRuleCheck = validateReservationWeekdayRule({
      startDate,
      endDate,
      periods: property?.pricingPeriods || [],
      amicaleId: pricingAmicaleId,
    });
    if (!isSaleProperty && !weekdayRuleCheck.ok) {
      const checkinMessage = weekdayRuleCheck.requiredCheckinDay ? `check-in: ${weekdayRuleCheck.requiredCheckinDay}` : null;
      const checkoutMessage = weekdayRuleCheck.requiredCheckoutDay ? `check-out: ${weekdayRuleCheck.requiredCheckoutDay}` : null;
      const detail = [checkinMessage, checkoutMessage].filter(Boolean).join(' | ');
      failRule(`Regle de periode non respectee (${detail}).`);
      return;
    }

    const draft = {
      propertyId: String(property.id),
      propertySlug: propertyRouteToken,
      requestType: isSaleProperty ? 'visite' : 'reservation',
      startDate,
      endDate,
      guests,
      adultGuests,
      childGuests,
      includeCleaningFee,
      includeServiceFee,
      extraMattresses,
      selectedPaidServiceIds,
      paymentMode,
      pricingAmicaleId: pricingAmicaleId || undefined,
      amicaleSelectionId: paymentMode === "amicale" ? amicaleSelectionId : undefined,
      amicaleSelectionName: paymentMode === "amicale" ? (amicaleOptions.find((item) => item.id === amicaleSelectionId)?.name || "") : undefined,
      amicaleName: paymentMode === "amicale" ? amicaleFullName.trim() : undefined,
      amicaleMatricule: paymentMode === "amicale" ? amicaleMatricule.trim() : undefined,
      amicalePhone: paymentMode === "amicale" ? amicalePhone.trim() : undefined,
      amicaleCode: paymentMode === "amicale" ? amicaleCode.trim() : undefined,
      reservationNote: reservationNote.trim(),
    };

    if (hasTrackingConsent()) {
      void trackPublicClientInteraction({
        type: 'reservation_attempt',
        bienId: String(property.id),
        propertyTitle: property.title,
        clientUserId: user?.role === 'user' ? user.id : undefined,
        clientEmail: user?.role === 'user' ? user.email : undefined,
        clientName: user?.role === 'user' ? user.name : undefined,
        sessionId: getOrCreateTrackingSessionId(),
        path: window.location.pathname + window.location.search,
        metadata: {
          requestType: isSaleProperty ? 'visite' : 'reservation',
          paymentMode,
          propertyCategory: String(property.category || '').trim() || null,
          bedrooms: Number(property.bedrooms || 0),
        },
      }).catch(() => {});
    }

    if (paymentMode === "amicale") {
      const selectedAmicale = amicaleOptions.find((item) => item.id === amicaleSelectionId) || null;
      if (!selectedAmicale) {
        toast.error("Selection amicale invalide.");
        return;
      }
      if (selectedAmicale.code !== amicaleCode.trim()) {
        toast.error("Code amicale incorrect.");
        return;
      }
    }

    if (paymentMode !== "amicale" && (!user || user.role !== 'user' || !user.email)) {
      savePendingReservationDraft(draft);
      setPendingDraft(draft);
      setLoginPromptStep("choices");
      setShowLoginPrompt(true);
      return;
    }

    if (paymentMode !== "amicale" && !user.profileCompleted) {
      savePendingReservationDraft(draft);
      setPendingDraft(draft);
      openProfileSetupStep(user);
      toast.info("Completez votre profil avant de continuer.");
      return;
    }

    navigate(buildReservationConfirmationPath(property), {
      state: {
        draft,
      },
    });
  };

  const handlePromptSocialLogin = (provider: 'google' | 'facebook') => {
    if (provider === 'google' && !providers.google) {
      toast.error('Google login indisponible pour le moment');
      return;
    }
    if (provider === 'facebook' && !providers.facebook) {
      toast.error('Facebook login indisponible pour le moment');
      return;
    }
    if (pendingDraft) {
      savePendingReservationDraft(pendingDraft as PendingReservationDraft);
    }
    if (!property) {
      startSocialLogin(provider);
      return;
    }
    const confirmationPath = buildReservationConfirmationPath(property);
    saveAuthReturnTo(confirmationPath);
    markAuthPendingLogin();
    setIsAwaitingLogin(true);

    const popupUrl = buildApiUrl(`/auth/${provider}/start?return_to=${encodeURIComponent(confirmationPath)}`);
    const popup = window.open(
      popupUrl,
      "dwiraAuthPopup",
      "popup=yes,width=560,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes"
    );
    if (!popup) {
      startSocialLogin(provider, confirmationPath);
      return;
    }
    authPopupRef.current = popup;
    popup.focus();
  };

  const handlePromptPasskeyLogin = async () => {
    if (!providers.passkey) {
      toast.error('Passkey indisponible pour le moment');
      return;
    }
    if (!window.PublicKeyCredential || !navigator.credentials) {
      toast.error('Passkey non supporte sur ce navigateur/appareil');
      return;
    }
    setIsPasskeyPromptLoading(true);
    const navigateToReservationIfDraft = (closePrompt = true) => {
      if (pendingDraft) savePendingReservationDraft(pendingDraft as PendingReservationDraft);
      const draft = (pendingDraft as PendingReservationDraft | null) || readPendingReservationDraft();
      if (property && draft && propertyMatchesRouteToken(property, draft.propertySlug)) {
        if (closePrompt) {
          setShowLoginPrompt(false);
          setLoginPromptStep("choices");
        }
        navigate(buildReservationConfirmationPath(property), { state: { draft } });
        return true;
      }
      return false;
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
        cin: loggedUser.cin || undefined,
        cinImageUrl: loggedUser.cinImageUrl || undefined,
        profileCompleted: loggedUser.profileCompleted,
        role: 'user',
      });
    };
    try {
      const loggedUser = await loginWithPasskey();
      applyLoggedUser(loggedUser);
      if (!loggedUser.profileCompleted) {
        openProfileSetupStep(loggedUser);
        toast.info('Completez votre identite legale pour continuer.');
        return;
      }
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      toast.success('Connexion Passkey reussie');
      void navigateToReservationIfDraft();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connexion Passkey echouee';
      const normalizedMessage = String(message).toLowerCase();
      const noPasskeyDetected = [
        'aucun passkey configure',
        'aucun passkey',
        'no passkey',
        'no credential',
        'credential not found',
        'not found for login options',
        'introuvable',
      ].some((token) => normalizedMessage.includes(token));
      if (noPasskeyDetected) {
        setLoginPromptStep("passkey_setup");
        toast.info('Aucune passkey detectee. Creez-en une pour continuer.');
        return;
      }
      toast.error(message);
    } finally {
      setIsPasskeyPromptLoading(false);
    }
  };

  const handlePromptPasskeyCreate = async () => {
    const email = passkeyPromptEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Entrez un email valide pour creer la passkey.');
      return;
    }
    setIsPasskeyCreateLoading(true);
    try {
      const loggedUser = await registerWithPasskey(email, passkeyPromptName.trim());
      login({
        id: loggedUser.id,
        email: loggedUser.email,
        name: loggedUser.name,
        firstName: loggedUser.firstName || undefined,
        lastName: loggedUser.lastName || undefined,
        avatar: loggedUser.avatar || undefined,
        clientType: loggedUser.clientType || undefined,
        telephone: loggedUser.telephone || undefined,
        cin: loggedUser.cin || undefined,
        cinImageUrl: loggedUser.cinImageUrl || undefined,
        profileCompleted: loggedUser.profileCompleted,
        role: 'user',
      });
      if (pendingDraft) savePendingReservationDraft(pendingDraft as PendingReservationDraft);
      const draft = (pendingDraft as PendingReservationDraft | null) || readPendingReservationDraft();
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      toast.success('Passkey creee et connexion reussie');
      if (!loggedUser.profileCompleted) {
        openProfileSetupStep(loggedUser);
        toast.info('Completez votre identite legale pour continuer.');
        return;
      }
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      if (property && draft && propertyMatchesRouteToken(property, draft.propertySlug)) {
        navigate(buildReservationConfirmationPath(property), { state: { draft } });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Creation Passkey echouee');
    } finally {
      setIsPasskeyCreateLoading(false);
    }
  };

  const handlePromptProfileComplete = async () => {
    if (!user?.id) {
      toast.error("Session utilisateur invalide. Reconnectez-vous.");
      return;
    }
    if (!profilePromptForm.firstName.trim() || !profilePromptForm.lastName.trim() || !profilePromptForm.telephone.trim() || !profilePromptForm.address.trim()) {
      toast.error("Nom, prenom, telephone et adresse sont obligatoires.");
      return;
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
      });
      login({
        id: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
        firstName: savedUser.firstName || undefined,
        lastName: savedUser.lastName || undefined,
        avatar: savedUser.avatar || undefined,
        clientType: savedUser.clientType || undefined,
        telephone: savedUser.telephone || undefined,
        cin: savedUser.cin || undefined,
        cinImageUrl: savedUser.cinImageUrl || undefined,
        profileCompleted: savedUser.profileCompleted,
        role: 'user',
      });
      toast.success("Profil complete. Vous pouvez continuer.");
      if (pendingDraft) savePendingReservationDraft(pendingDraft as PendingReservationDraft);
      const draft = (pendingDraft as PendingReservationDraft | null) || readPendingReservationDraft();
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      if (property && draft && propertyMatchesRouteToken(property, draft.propertySlug)) {
        navigate(buildReservationConfirmationPath(property), { state: { draft } });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de sauvegarder le profil");
    } finally {
      setIsProfilePromptSaving(false);
    }
  };

  const togglePaidServiceSelection = useCallback((service: PaidServiceItem) => {
    setSelectedPaidServiceIds((prev) => {
      const alreadySelected = prev.includes(service.id);
      if (!alreadySelected && service.type_tarification !== "fixe" && !hasSeenVariablePaidServiceNotice) {
        setShowVariablePaidServiceNotice(true);
        setHasSeenVariablePaidServiceNotice(true);
      }
      return alreadySelected ? prev.filter((id) => id !== service.id) : [...prev, service.id];
    });
  }, [hasSeenVariablePaidServiceNotice]);

  const togglePaidServiceCategory = useCallback((categoryId: string) => {
    setSelectedPaidServiceCategoryId((prev) => (prev === categoryId ? "" : categoryId));
    setSelectedPaidServiceTypeFilter("all");
  }, []);

  useEffect(() => {
    if (!property) return;
    if (!isAwaitingLogin && !isAuthPendingLogin()) return;
    if (!user || user.role !== 'user' || !user.email) return;
    const draft = readPendingReservationDraft();
    if (!draft || !propertyMatchesRouteToken(property, draft.propertySlug)) return;
    if (!user.profileCompleted) {
      clearAuthPendingLogin();
      setIsAwaitingLogin(false);
      setPendingDraft(draft);
      openProfileSetupStep(user);
      return;
    }
    clearAuthPendingLogin();
    setIsAwaitingLogin(false);
    setShowLoginPrompt(false);
    try {
      if (authPopupRef.current && !authPopupRef.current.closed) authPopupRef.current.close();
    } catch {}
    navigate(buildReservationConfirmationPath(property), {
      state: { draft },
    });
  }, [isAwaitingLogin, navigate, openProfileSetupStep, property, user]);

  useEffect(() => {
    const onAuthMessage = (event: MessageEvent) => {
      const payload = event?.data;
      if (!payload || typeof payload !== 'object') return;
      const type = String((payload as any).type || '').trim();
      const returnTo = String((payload as any).returnTo || '').trim();
      if (!returnTo || !returnTo.startsWith('/')) return;

      if (type === 'DWIRA_AUTH_SUCCESS') {
        setShowLoginPrompt(false);
        setLoginPromptStep("choices");
        clearAuthPendingLogin();
        setIsAwaitingLogin(false);
        window.location.assign(returnTo);
        return;
      }

      if (type === 'DWIRA_AUTH_PROFILE_REQUIRED') {
        setShowLoginPrompt(false);
        setLoginPromptStep("choices");
        setIsAwaitingLogin(false);
        window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      }
    };

    window.addEventListener('message', onAuthMessage);
    return () => window.removeEventListener('message', onAuthMessage);
  }, [navigate]);

  useEffect(() => {
    setAdultGuests((prev) => Math.min(Math.max(prev, 1), Math.min(maxAdultGuests, maxGuests)));
    setChildGuests((prev) => Math.min(Math.max(prev, 0), Math.min(maxChildGuests, Math.max(0, maxGuests - 1))));
    setExtraMattresses((prev) => Math.min(Math.max(prev, 0), extraMattressMax));
  }, [extraMattressMax, maxAdultGuests, maxChildGuests, maxGuests]);
  useEffect(() => {
    const allowedAdultsByTotal = Math.max(1, Math.min(maxAdultGuests, maxGuests - childGuests));
    if (adultGuests > allowedAdultsByTotal) {
      setAdultGuests(allowedAdultsByTotal);
      return;
    }
    const allowedChildrenByTotal = Math.max(0, Math.min(maxChildGuests, maxGuests - adultGuests));
    if (childGuests > allowedChildrenByTotal) {
      setChildGuests(allowedChildrenByTotal);
    }
  }, [adultGuests, childGuests, maxAdultGuests, maxChildGuests, maxGuests]);

  useEffect(() => {
    if (!hasCleaningFee) setIncludeCleaningFee(false);
    if (!hasServiceFee) setIncludeServiceFee(false);
    setSelectedPaidServiceIds((prev) => {
      const next = prev.filter((id) => activePaidServices.some((service) => service.id === id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev;
      return next;
    });
  }, [activePaidServices, hasCleaningFee, hasServiceFee]);
  useEffect(() => {
    if (paidServiceCategories.length === 0) {
      setSelectedPaidServiceCategoryId("");
      return;
    }
    if (selectedPaidServiceCategoryId !== "all" && !paidServiceCategories.some((category) => category.id === selectedPaidServiceCategoryId)) {
      setSelectedPaidServiceCategoryId("");
    }
  }, [paidServiceCategories, selectedPaidServiceCategoryId]);

  // Auto-play for embla carousel
  useEffect(() => {
    if (emblaApi) {
      const syncSelected = () => setMobileGalleryIndex(emblaApi.selectedScrollSnap());
      syncSelected();
      emblaApi.on('select', syncSelected);
      const autoplay = setInterval(() => {
        emblaApi.scrollNext();
      }, 4000);
      return () => {
        clearInterval(autoplay);
        emblaApi.off('select', syncSelected);
      };
    }
  }, [emblaApi]);

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <h1 className="text-2xl font-bold mb-4">Logement non trouvé</h1>
        <Link to="/logements" className="text-emerald-600 hover:underline">
          Retour aux logements
        </Link>
      </div>
    );
  }
  if (property.detailPath && property.detailPath.startsWith("/vente/")) {
    return <Navigate to={`${property.detailPath}${filterQueryString ? `?${filterQueryString}` : ""}`} replace />;
  }

  const mobileFloatingActions = typeof document !== "undefined" && isMobileViewport && !showPaidServicesDialog && !showBookingCalendarDialog && !lightboxOpen && !showLoginPrompt
    ? createPortal(
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: "max(16px, env(safe-area-inset-bottom))",
            transform: "translateX(-50%)",
            width: "min(calc(100vw - 16px), 28rem)",
            zIndex: 2147483646,
            pointerEvents: "none",
          }}
        >
          <div className="pointer-events-auto grid grid-cols-3 gap-1.5 rounded-[1.2rem] border border-white/70 bg-white/82 p-1.5 shadow-[0_24px_60px_rgba(15,23,42,0.24),0_10px_30px_rgba(15,23,42,0.14)] ring-1 ring-white/60 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/72 sm:gap-2 sm:rounded-[1.4rem] sm:p-2">
            <button
              type="button"
              onClick={handleOpenAndScrollSeasonalDetails}
              className="group flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-emerald-100 bg-[linear-gradient(180deg,#f3fdf8,#e8fbf1)] px-1.5 py-2.5 text-center text-[10px] font-semibold text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_18px_rgba(16,185,129,0.10)] transition-all duration-200 active:scale-[0.98] sm:px-2 sm:py-3 sm:text-[11px]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/90 text-emerald-700 shadow-sm">
                <ListChecks size={13} />
              </span>
              <span className="w-full truncate leading-tight">Caractéristiques</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection(locationSectionRef.current)}
              className="group flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-1.5 py-2.5 text-center text-[10px] font-semibold text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(15,23,42,0.08)] transition-all duration-200 active:scale-[0.98] sm:px-2 sm:py-3 sm:text-[11px]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
                <MapPin size={13} />
              </span>
              <span className="w-full truncate leading-tight">Emplacement</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection(calendarSectionRef.current)}
              className="group flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-amber-100 bg-[linear-gradient(180deg,#fffaf0,#fff2db)] px-1.5 py-2.5 text-center text-[10px] font-semibold text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(245,158,11,0.10)] transition-all duration-200 active:scale-[0.98] sm:px-2 sm:py-3 sm:text-[11px]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/95 text-amber-700 shadow-sm">
                <Calendar size={13} />
              </span>
              <span className="w-full truncate leading-tight">Calendrier</span>
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="bg-white pb-28 md:pb-20 md:pt-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="md:hidden -mx-4 -mt-6 mb-8">
          <div className="sticky top-0 z-0 overflow-hidden bg-slate-950">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-4 pt-8">
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) {
                    navigate(-1);
                    return;
                  }
                  navigate(backToListUrl);
                }}
                className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/35 bg-white/16 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)] backdrop-blur-md transition-all hover:bg-white/24"
                aria-label="Retour"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="pointer-events-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/35 bg-white/16 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)] backdrop-blur-md transition-all hover:bg-white/24"
                  aria-label="Partager"
                >
                  <Share2 size={17} />
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_10px_25px_rgba(15,23,42,0.18)] backdrop-blur-md transition-all ${
                    isSaved
                      ? "border-red-200/70 bg-red-500/85 text-white hover:bg-red-500"
                      : "border-white/35 bg-white/16 text-white hover:bg-white/24"
                  }`}
                  aria-label={isSaved ? "Sauvegarde" : "Sauvegarder"}
                >
                  <Heart size={17} className={isSaved ? "fill-current" : ""} />
                </button>
              </div>
            </div>
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex">
                {galleryImages.map((imageUrl, idx) => (
                  <div
                    className="relative min-w-0 flex-[0_0_100%] h-[360px]"
                    key={`hero-mobile-image-${idx}`}
                    onClick={() => openLightbox(idx)}
                  >
                    {mobileVisibleImageIndexes.has(idx) ? (
                      <SmartImage
                        src={imageUrl}
                        alt={`${property.title} - ${idx + 1}`}
                        className="h-full w-full object-cover"
                        loading={idx === mobileGalleryIndex ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={idx === mobileGalleryIndex ? "high" : "low"}
                        targetWidth={900}
                        quality={62}
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-slate-200 to-slate-300" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent pointer-events-none" />
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/30 px-3 py-2 backdrop-blur-md">
              {galleryImages.slice(0, Math.min(galleryImages.length, 5)).map((_, index) => (
                <span
                  key={`mobile-gallery-dot-${index}`}
                  className={`h-1.5 rounded-full transition-all ${index === (mobileGalleryIndex % Math.min(galleryImages.length || 1, 5)) ? 'w-5 bg-white' : 'w-1.5 bg-white/55'}`}
                />
              ))}
            </div>
          </div>
        </div>
        
        {/* Breadcrumb */}
        <div className="hidden text-sm text-gray-500 mb-6 md:block">
          <Link to="/" className="hover:text-emerald-600">Accueil</Link>
          <span className="mx-2">/</span>
          <Link to="/logements" className="hover:text-emerald-600">Logements</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{property.title}</span>
        </div>

        {/* Header */}
        <div className="hidden md:flex flex-col md:flex-row justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{propertyDisplayTitle}</h1>
            <div className="flex items-center gap-4 text-gray-600 text-sm">
              <div className="flex items-center gap-1">
                <MapPin size={16} />
                <span>{property.location}</span>
              </div>
              <div className="flex items-center gap-1">
                 <Star size={16} className="text-amber-500 fill-current" />
                 <span className="font-medium text-gray-900">{formatRating(property.rating)}</span>
                 <span>({property.reviews} avis)</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4 md:mt-0">
            <button 
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Share2 size={18} />
              <span className="hidden sm:inline">Partager</span>
            </button>
            <button 
              onClick={handleSave}
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                isSaved 
                  ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100' 
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Heart size={18} className={isSaved ? 'fill-current' : ''} />
              <span className="hidden sm:inline">{isSaved ? 'Sauvegardé' : 'Sauvegarder'}</span>
            </button>
          </div>
        </div>

        {/* Images Grid / Slider */}
        <div className="mb-12">
          {/* Desktop Grid */}
          <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 h-[500px] rounded-xl overflow-hidden">
            {galleryImages.slice(0, 5).map((imageUrl, index) => {
              const isPrimary = index === 0;
              const wrapperClass = isPrimary ? "col-span-2 row-span-2" : "col-span-1 row-span-1";
              const fallbackImage = galleryImages[0];
              const openImage = () => {
                if (index >= 0) openLightbox(index);
              };

              return (
                <div key={`gallery-image-${index}`} className={`${wrapperClass} relative`} onClick={openImage}>
                  <SmartImage
                    src={imageUrl || fallbackImage}
                    alt={index === 0 ? property.title : `${property.title} ${index + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index === 0 ? "high" : "low"}
                    targetWidth={index === 0 ? 1200 : 720}
                    quality={68}
                  />
                  {index === 4 && galleryImages.length > 5 && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center hover:bg-black/40 transition-colors cursor-pointer">
                      <span className="text-white font-semibold text-lg">Voir tout</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="dwira-soft-aurora relative z-10 -mx-4 -mt-[4.6rem] rounded-t-[2rem] bg-white px-5 pb-8 pt-4 shadow-[0_-18px_38px_rgba(15,23,42,0.10),0_-2px_0_rgba(255,255,255,0.94),0_24px_60px_rgba(15,23,42,0.12)] md:mx-0 md:mt-0 md:rounded-none md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:shadow-none">
          <div className="dwira-soft-aurora-ribbon" aria-hidden="true" />
          <div className="md:hidden">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.01em] text-gray-500">
              <Link to="/" className="hover:text-emerald-600">Accueil</Link>
              <span>/</span>
              <Link to="/logements" className="hover:text-emerald-600">Logements</Link>
              <span>/</span>
              <span className="truncate text-gray-900">{property.title}</span>
            </div>

            <div className="mt-4">
              <div className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Sejour premium
              </div>
              <h1 className="mt-3 text-[2rem] font-bold leading-[1.02] tracking-[-0.04em] text-slate-950">
                {propertyDisplayTitle}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2.5 text-sm text-gray-600">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-2">
                  <MapPin size={15} />
                  <span className="line-clamp-1">{property.location}</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-amber-900">
                  <Star size={15} className="fill-current text-amber-500" />
                  <span className="font-medium text-slate-900">{formatRating(property.rating)}</span>
                  <span>({property.reviews} avis)</span>
                </div>
              </div>
            </div>

          </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Left Column: Info */}
          <div className="lg:col-span-2">
            {propertyVideos.length > 0 && (
              <div className="dwira-soft-aurora mb-10 mt-7 overflow-hidden rounded-[1.6rem] border border-emerald-100 bg-white shadow-[0_18px_50px_rgba(16,185,129,0.07)]">
                <div className="dwira-soft-aurora-ribbon" aria-hidden="true" />
                <div className="flex flex-col gap-4 border-b border-white/70 px-5 py-5 md:flex-row md:items-end md:justify-between md:px-6">
                  <div>
                    <div className="inline-flex items-center rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                      Visite video
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-5 px-4 py-4 md:px-5 md:py-5 xl:grid-cols-2">
                  {propertyVideos.map((videoUrl, index) => {
  const isShortVideo = isVerticalVideoUrl(videoUrl);
  const isPortraitVideo = isShortVideo || isFacebookReelUrl(videoUrl);
  const embedUrl = toVideoEmbedUrl(videoUrl);
  const externalUrl = toVideoExternalUrl(videoUrl) || String(videoUrl || '').trim();
  const directUrl = facebookDirectVideoUrls[String(videoUrl || '').trim()] || "";
  const canEmbed = Boolean(embedUrl) && canRenderVideoInIframe(videoUrl);
  const shouldUseDirectVideo = isFacebookVideoUrl(videoUrl) && Boolean(directUrl);

  return (
  <div
    key={`${videoUrl}-${index}`}
    className="overflow-hidden rounded-[1.4rem] border border-slate-200/70 bg-white/92 shadow-[0_14px_34px_rgba(15,23,42,0.10)] backdrop-blur-sm xl:max-w-[520px]"
  >
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Video {index + 1}
        </p>
      </div>
      <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
        {isShortVideo ? "Shorts" : "HD"}
      </div>
    </div>
    <div className="bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_45%),linear-gradient(180deg,#0f172a,#111827)] p-3">
      <div className={`mx-auto overflow-hidden rounded-[1.2rem] border border-white/10 bg-black shadow-[0_14px_30px_rgba(0,0,0,0.32)] ${isPortraitVideo ? "max-w-[430px] w-full" : "w-full"}`}>
        <div className={isPortraitVideo ? "aspect-[9/16]" : "aspect-video"}>
          {shouldUseDirectVideo ? (
            <video
              src={directUrl}
              controls
              playsInline
              muted={false}
              defaultMuted={false}
              onLoadedMetadata={(event) => {
                event.currentTarget.muted = false;
                if (event.currentTarget.volume === 0) event.currentTarget.volume = 1;
              }}
              onPlay={(event) => {
                event.currentTarget.muted = false;
                if (event.currentTarget.volume === 0) event.currentTarget.volume = 1;
              }}
              className="h-full w-full bg-black"
              preload="metadata"
            />
          ) : canEmbed ? (
            <iframe
              src={embedUrl || ""}
              title={`${property.title} visite video ${index + 1}`}
              className="h-full w-full bg-black"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : directUrl && !isFacebookVideoUrl(videoUrl) ? (
            <video
              src={directUrl}
              controls
              playsInline
              muted={false}
              defaultMuted={false}
              onLoadedMetadata={(event) => {
                event.currentTarget.muted = false;
                if (event.currentTarget.volume === 0) event.currentTarget.volume = 1;
              }}
              onPlay={(event) => {
                event.currentTarget.muted = false;
                if (event.currentTarget.volume === 0) event.currentTarget.volume = 1;
              }}
              className="h-full w-full bg-black"
              preload="metadata"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-5 text-center text-white">
              <p className="text-sm font-semibold">Lecture integree indisponible</p>
              <p className="text-xs text-slate-200">Cette video Facebook doit etre ouverte directement sur Facebook.</p>
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-slate-900"
              >
                Ouvrir la video
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)})}
                </div>
              </div>
            )}
            <div className="flex items-start justify-between gap-4 py-6 border-b border-gray-100">
               <div className="min-w-0 flex-1">
                 <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
                   <House size={20} className="shrink-0 text-emerald-600" />
                   <span>Logement entier : {property.category}</span>
                 </h2>
                 <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-4">
                   <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                     <Users size={15} className="shrink-0" />
                     <span>{maxGuests} voyageurs max</span>
                   </span>
                   <span className="hidden text-gray-300 sm:inline">|</span>
                   <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                     <BedSingle size={15} className="shrink-0 text-emerald-700" />
                     <span>{property.bedrooms} chambres</span>
                   </span>
                   <span className="hidden text-gray-300 sm:inline">|</span>
                   <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                     <Bath size={15} className="shrink-0 text-emerald-700" />
                     <span>{property.bathrooms} salles de bain</span>
                   </span>
                 </div>
               </div>
               <div className="mt-1 h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-200 p-1.5 ring-1 ring-emerald-200 shadow-sm flex items-center justify-center">
                 <img src={logo} alt="Logo Dwira" className="w-full h-full rounded-full object-cover" />
               </div>
            </div>

            <div className="py-8 border-b border-gray-100">
              <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
                <Info size={18} className="shrink-0 text-gray-700" />
                <span>À propos de ce logement</span>
              </h3>
              <p className="text-gray-600 leading-relaxed whitespace-pre-line">
                {property.description}
              </p>
            </div>

            {!isSaleProperty && hasSeasonalStayInfo && (
              <div ref={stayInfoSectionRef} className="py-8 border-b border-gray-100">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xl font-bold">Informations séjour</h3>
                  <button
                    type="button"
                    onClick={handleOpenAndScrollSeasonalDetails}
                    className="inline-flex items-center gap-2 self-start rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
                  >
                    <ListChecks size={16} />
                    Voir tous les details
                    {showSeasonalDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {seasonalHighlights.map((item) => (
                    <div key={item.key} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{item.icon}{item.label}</span>
                        <span className="text-sm font-semibold text-gray-900 text-right">{item.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {showSeasonalDetails && (
                  <div ref={seasonalDetailsPanelRef} className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 sm:p-4">
                    {visibleDetailTabs.length > 0 ? (
                      <>
                        <div className="mb-3 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => detailTabsNavRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
                            className="h-7 w-7 shrink-0 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-emerald-300"
                            aria-label="Onglets precedents"
                          >
                            <ChevronLeft className="mx-auto h-4 w-4" />
                          </button>
                          <div
                            ref={detailTabsNavRef}
                            className="flex-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                          >
                            <div className="flex w-max min-w-full gap-2 pr-2">
                          {visibleDetailTabs.map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={(event) => {
                                setSeasonalDetailsTabId(tab.id);
                                event.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                              }}
                              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${seasonalDetailsTabId === tab.id ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
                            >
                              {tab.nom}
                            </button>
                          ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => detailTabsNavRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
                            className="h-7 w-7 shrink-0 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-emerald-300"
                            aria-label="Onglets suivants"
                          >
                            <ChevronRight className="mx-auto h-4 w-4" />
                          </button>
                        </div>
                        {(usingConfiguredTabs ? visibleSelectedDetailFeatures.length > 0 : Boolean(selectedFallbackTab?.rows?.length)) ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            {usingConfiguredTabs ? (
                              visibleSelectedDetailFeatures.map((feature) => (
                                <div key={feature.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                                  <span className="text-gray-500">{feature.nom}</span>
                                  <div className="font-semibold text-gray-900">{valuesForFeature(feature).join(', ') || 'Oui'}</div>
                                </div>
                              ))
                            ) : (
                              (selectedFallbackTab?.rows || []).map((row) => (
                                <div key={`${selectedFallbackTab?.id || 'fallback'}-${row.label}`} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                                  <span className="text-gray-500">{row.label}</span>
                                  <div className="font-semibold text-gray-900">{row.value}</div>
                                </div>
                              ))
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-gray-600">Aucun detail visible dans cet onglet.</div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-gray-600">Aucun detail public disponible.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {featureDisplayItems.length > 0 && (
            <div className="py-8 border-b border-gray-100">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h3 className="text-xl font-bold">Ce que propose ce logement</h3>
                {featureDisplayItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAmenitiesDialog(true)}
                    className="hidden rounded-2xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 md:inline-flex"
                  >
                    Afficher les {totalAmenitiesCount} équipements
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {amenityPreviewItems.map((item) => {
                  return (
                    <div key={item.id} className="flex items-start gap-3 text-gray-800">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50">
                        {featureIcon(item.feature.icon_name, item.label, item.sectionName)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium leading-6">{item.label}</div>
                        {item.meta ? <div className="text-sm text-gray-500">{item.meta}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowAmenitiesDialog(true)}
                className="mt-8 inline-flex rounded-2xl border border-gray-900 px-5 py-3 text-base font-semibold text-gray-900 transition-colors hover:bg-gray-50 md:hidden"
              >
                Afficher les {totalAmenitiesCount} équipements
              </button>
            </div>
            )}

            <Dialog open={featureDisplayItems.length > 0 && showAmenitiesDialog} onOpenChange={setShowAmenitiesDialog}>
              <DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden rounded-[2rem] border-0 p-0 shadow-2xl">
                <DialogHeader className="border-b border-gray-100 px-8 pt-8 pb-6">
                  <DialogTitle className="text-3xl font-bold text-gray-900">Ce que propose ce logement</DialogTitle>
                </DialogHeader>
                <div className="max-h-[calc(88vh-110px)] overflow-y-auto px-8 pb-8">
                  <div className="space-y-10 pt-6">
                    {amenitySections.map((section) => (
                      <section key={section.id}>
                        <h4 className="text-2xl font-semibold text-gray-900">{section.nom}</h4>
                        <div className="mt-4 divide-y divide-gray-200">
                          {featureDisplayItems
                            .filter((item) => item.sectionName === section.nom)
                            .map((item) => (
                              <div key={item.id} className="flex items-start gap-4 py-5">
                                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-50">
                                  {featureIcon(item.feature.icon_name, item.label, section.nom)}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xl font-medium text-gray-900">{item.label}</div>
                                  {item.meta ? <p className="mt-1 text-sm text-gray-500">{item.meta}</p> : null}
                                </div>
                              </div>
                            ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showPaidServicesDialog} onOpenChange={setShowPaidServicesDialog}>
              <DialogContent className="max-h-[86vh] w-[min(94vw,920px)] overflow-hidden rounded-[2rem] border-0 p-0 shadow-2xl sm:w-[min(90vw,860px)]">
                <DialogHeader className="border-b border-gray-100 px-5 pt-6 pb-4 sm:px-8 sm:pt-8 sm:pb-6">
                  <DialogTitle className="text-2xl font-bold text-gray-900 sm:text-3xl">Services payants</DialogTitle>
                  <p className="mt-2 text-xs text-gray-600 sm:text-sm">
                    Choisissez d'abord une catégorie, puis faites défiler les types de tarification pour voir rapidement les services utiles.
                  </p>
                </DialogHeader>
                <div className="max-h-[calc(86vh-104px)] overflow-y-auto px-4 pb-[max(3.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-10">
                  <div className="space-y-6 pt-4 sm:space-y-8 sm:pt-6">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3 sm:rounded-3xl sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-900 sm:text-sm">{activePaidServices.length} services disponibles</div>
                          <p className="mt-0.5 text-[11px] text-gray-600 sm:mt-1 sm:text-xs">Navigation par besoin client, avec filtres horizontaux.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaidServiceCategoryId("");
                            setSelectedPaidServiceTypeFilter("all");
                          }}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700 sm:text-xs"
                        >
                          <ListChecks size={14} />
                          Tout afficher
                        </button>
                      </div>
                    </div>
                    <div className="-mx-2 overflow-x-auto px-2 pb-2 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex w-max min-w-full gap-3">
                        {paidServiceCategories.map((category) => {
                          const isActive = selectedPaidServiceCategoryId === category.id;
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => togglePaidServiceCategory(category.id)}
                              className={`flex min-w-[190px] shrink-0 flex-col rounded-[1.6rem] border px-4 py-4 text-left transition ${isActive ? `${category.meta.cardClass} shadow-[0_14px_32px_rgba(15,23,42,0.10)]` : "border-gray-200 bg-white hover:border-emerald-200"}`}
                            >
                              <div className="relative h-24 overflow-hidden rounded-[1.25rem] border border-white/70 bg-slate-100">
                                <img
                                  src={category.meta.imageUrl}
                                  alt={category.label}
                                  className="absolute inset-0 h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.26),rgba(255,255,255,0.06)),linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0.14))]" />
                                <div className={`absolute -right-2 -top-2 ${category.meta.watermarkClass} opacity-70`}>
                                  {cloneElement(category.meta.icon, { size: 54 })}
                                </div>
                                <div className="absolute inset-x-0 bottom-0 p-3">
                                  <span className={`flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm ${category.meta.iconWrapClass}`}>
                                    {category.meta.icon}
                                  </span>
                                </div>
                              </div>
                              <span className="mt-4 text-base font-semibold leading-5 text-gray-900">{category.label}</span>
                              <span className="mt-2 text-sm text-gray-500">{category.services.length} service{category.services.length > 1 ? "s" : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedPaidServiceCategory ? (
                      <div className="-mx-2 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex gap-3 md:flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSelectedPaidServiceTypeFilter("all")}
                            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${selectedPaidServiceTypeFilter === "all" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
                          >
                            <ListChecks size={15} />
                            Tous
                            <span className={`rounded-full px-2 py-0.5 text-xs ${selectedPaidServiceTypeFilter === "all" ? "bg-white/15 text-white" : "bg-gray-100 text-gray-600"}`}>
                              {selectedPaidServiceCategory.services.length}
                            </span>
                          </button>
                          {(["fixe", "a_partir_de", "sur_demande"] as const).map((type) => {
                            const count = visiblePaidServices.filter((service) => service.type_tarification === type).length;
                            if (count === 0) return null;
                            const meta = getPaidServiceTypeMeta(type);
                            const isActive = selectedPaidServiceTypeFilter === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setSelectedPaidServiceTypeFilter(type)}
                                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${isActive ? meta.chipClass : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
                              >
                                {meta.icon}
                                {meta.label}
                                <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? "bg-white/70 text-gray-700" : "bg-gray-100 text-gray-600"}`}>
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {selectedPaidServiceCategory ? (
                      <div className={`rounded-3xl border p-5 ${selectedPaidServiceCategory.meta.cardClass}`}>
                        <div className="flex items-start gap-4">
                          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.4rem] ${selectedPaidServiceCategory.meta.iconWrapClass}`}>
                            {selectedPaidServiceCategory.meta.icon}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xl font-semibold text-gray-900">{selectedPaidServiceCategory.label}</h4>
                            <p className="mt-1 text-sm text-gray-600">
                              {visiblePaidServices.length} service{visiblePaidServices.length > 1 ? "s" : ""} visible{visiblePaidServices.length > 1 ? "s" : ""} pour ce besoin.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-5 py-10 text-center text-sm text-gray-500">
                        Choisissez une catégorie de services pour afficher les options disponibles.
                      </div>
                    )}

                    {selectedPaidServiceCategory ? (
                      <div className="space-y-3">
                        {visiblePaidServices.map((service) => {
                          const checked = selectedPaidServiceIds.includes(service.id);
                          const meta = getPaidServiceTypeMeta(service.type_tarification);
                          const categoryMeta = getPaidServiceCategoryMeta(service.categorie);
                        return (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => togglePaidServiceSelection(service)}
                            className={`w-full rounded-[1.6rem] border px-4 py-4 text-left transition ${checked ? "border-emerald-500 bg-emerald-50 shadow-[0_12px_28px_rgba(16,185,129,0.10)]" : "border-gray-200 bg-white hover:border-gray-300"}`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-base font-semibold text-gray-900">{service.label}</span>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${categoryMeta.badgeClass}`}>
                                    {categoryMeta.icon}
                                    {service.categorie || categoryMeta.label}
                                  </span>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.chipClass}`}>
                                    {meta.icon}
                                    {meta.label}
                                  </span>
                                </div>
                                {service.description_courte ? (
                                  <p className="mt-2 text-sm leading-6 text-gray-600">{service.description_courte}</p>
                                ) : (
                                  <p className="mt-2 text-sm leading-6 text-gray-500">Service additionnel disponible pour ce logement.</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-lg font-bold text-gray-900">{getServiceDisplayPrice(service)}</div>
                                <div className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${checked ? "border-emerald-500 bg-emerald-600 text-white" : "border-gray-300 text-gray-600"}`}>
                                  {checked ? "Sélectionné" : "Sélectionner"}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      </div>
                    ) : null}

                    {selectedPaidServiceCategory && visiblePaidServices.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-5 py-10 text-center text-sm text-gray-500">
                        Aucun service ne correspond à cette combinaison de catégorie et de tarification.
                      </div>
                    ) : null}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div ref={locationSectionRef} className="py-8">
               <h3 className="text-xl font-bold mb-6">Où se situe le logement</h3>
               {displayMapCenter ? (
                 <div className="property-location-map rounded-xl overflow-hidden border border-gray-200 h-[300px] bg-white relative">
                   <MapContainer
                     key={`${displayMapCenter.lat.toFixed(6)}:${displayMapCenter.lng.toFixed(6)}`}
                     center={[displayMapCenter.lat, displayMapCenter.lng]}
                     zoom={16}
                     scrollWheelZoom
                     className="h-full w-full"
                   >
                     <TileLayer
                       attribution={GOOGLE_TILE_ATTRIBUTION}
                       url={GOOGLE_HYBRID_TILE_URL}
                     />
                     <Circle
                       center={[displayMapCenter.lat, displayMapCenter.lng]}
                       radius={animatedOuterRadius}
                       pathOptions={{ color: "#10b981", weight: 2, fillColor: "#34d399", fillOpacity: 0.15 }}
                     />
                     <Circle
                       center={[displayMapCenter.lat, displayMapCenter.lng]}
                       radius={animatedInnerRadius}
                       pathOptions={{ color: "#34d399", weight: 2, fillColor: "#10b981", fillOpacity: 0.34 }}
                     />
                   </MapContainer>
                   <a
                     href={googleEmbedUrl.replace("output=embed&ll=", "q=").replace("&z=14&t=k", "")}
                     target="_blank"
                     rel="noreferrer"
                     className="absolute left-3 top-3 z-[1000] rounded bg-white/95 px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow"
                   >
                     Ouvrir dans Maps
                   </a>
                 </div>
               ) : (
                 <div className="bg-gray-100 rounded-xl h-[300px] flex items-center justify-center relative overflow-hidden">
                   <img
                      src="https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=1600&auto=format&fit=crop"
                      alt="Map"
                      className="w-full h-full object-cover opacity-50 grayscale"
                   />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-white p-4 rounded-full shadow-lg">
                        <MapPin size={32} className="text-emerald-600" />
                      </div>
                   </div>
                 </div>
               )}
               <p className="mt-4 text-gray-600 text-sm">
                 Position approximative affichee. L'adresse exacte sera communiquee le jour d'arrivee.
               </p>
               <div className="mt-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-sky-50/80 p-4">
                 <div className="mb-3 flex items-center justify-between">
                   <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Commodités les plus proches</p>
                   <span className="text-[11px] text-emerald-700/80">Autour du logement</span>
                 </div>
                 {nearbyPlaces.length > 0 ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     {nearbyPlaces.slice(0, 6).map((place) => (
                       <article key={place.id} className="rounded-xl border border-white/70 bg-white/95 shadow-[0_8px_20px_rgba(16,185,129,0.08)] p-3">
                         <div className="flex items-start gap-3">
                           <div className="min-w-0 flex-1">
                             <p className="text-sm font-semibold text-gray-900 truncate">{place.name}</p>
                             <div className="mt-1 flex flex-wrap items-center gap-1.5">
                               <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-medium">{kindLabel(place.kind)}</span>
                               <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 px-2 py-0.5 text-[11px] font-medium">~{place.distanceKm.toFixed(1)} km</span>
                             </div>
                             <p className="text-xs text-gray-600 mt-1 truncate">{place.address}</p>
                             {place.opening ? <p className="text-xs text-emerald-700 mt-1 font-medium">{place.opening}</p> : null}
                           </div>
                           {place.imageUrl ? (
                             <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-emerald-100 bg-gradient-to-br from-emerald-50 to-sky-50">
                               <img src={place.imageUrl} alt={place.name} className="h-full w-full object-cover" loading="lazy" />
                             </div>
                           ) : null}
                         </div>
                       </article>
                     ))}
                   </div>
                 ) : (
                   <span className="text-xs text-gray-500">Cafés, restaurants et magasins proches du quartier.</span>
                 )}
               </div>
            </div>

            {/* Availability Calendar Section */}
            <div ref={calendarSectionRef} className="py-8 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                <Calendar size={24} className="text-emerald-600" />
                <h3 className="text-xl font-bold">Disponibilités</h3>
              </div>
              <p className="text-gray-600 mb-6">
                Sélectionnez vos dates pour voir les disponibilités et réserver votre séjour.
              </p>
              {!isSaleProperty && (
                <p className="text-sm text-emerald-700 mb-2">
                  Duree autorisee: minimum {displayedMinStay} nuit(s), maximum {maxStay} nuit(s).
                </p>
              )}
              {!isSaleProperty && (activeWeekdayRule.requiredCheckinDay || activeWeekdayRule.requiredCheckoutDay) && (
                <p className="text-sm text-emerald-700 mb-4">
                  Regle periode: check-in {activeWeekdayRule.requiredCheckinDay || 'libre'} | check-out {activeWeekdayRule.requiredCheckoutDay || 'libre'}.
                </p>
              )}
              <AvailabilityCalendar
                unavailableDates={effectiveUnavailableDates || []}
                onDateRangeSelect={handleDateRangeSelect}
                selectedStart={selectedStart}
                selectedEnd={selectedEnd}
              />
            </div>
          </div>

          {/* Right Column: Booking Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-white rounded-xl shadow-xl border border-gray-100 p-6">
              <div className="flex justify-between items-baseline mb-6">
                <div>
                  <span className="text-2xl font-bold text-gray-900">{formatTnd(displayedNightlyPrice)} TND{isAmicalePricingActive ? " TTC" : ""}</span>
                  {property.priceContext !== 'sale' ? <span className="text-gray-500"> / nuit</span> : <span className="text-gray-500"> / vente</span>}
                  {property.priceContext !== 'sale' && displayedWeeklyPrice > 0 ? (
                    <p className="mt-1 text-xs text-gray-500">{formatTnd(displayedWeeklyPrice)} TND{isAmicalePricingActive ? " TTC" : ""} / semaine</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Star size={14} className="text-amber-500 fill-current" />
                  <span className="font-medium text-gray-900">{formatRating(property.rating)}</span>
                </div>
              </div>

              <form className="space-y-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{isSaleProperty ? 'Date souhaitee' : 'Arrivee'}</label>
                    <button
                      type="button"
                      onClick={() => setShowBookingCalendarDialog(true)}
                      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-3 text-left text-sm transition-colors hover:border-emerald-300 hover:bg-gray-50"
                    >
                      <span className={`truncate ${selectedStart ? "text-gray-900" : "text-gray-500"}`}>
                        {formatBookingFieldDate(selectedStart)}
                      </span>
                      <Calendar size={16} className="shrink-0 text-gray-500" />
                    </button>
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{isSaleProperty ? 'Date alternative' : 'Depart'}</label>
                    <button
                      type="button"
                      onClick={() => setShowBookingCalendarDialog(true)}
                      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-3 text-left text-sm transition-colors hover:border-emerald-300 hover:bg-gray-50"
                    >
                      <span className={`truncate ${selectedEnd ? "text-gray-900" : "text-gray-500"}`}>
                        {formatBookingFieldDate(selectedEnd)}
                      </span>
                      <Calendar size={16} className="shrink-0 text-gray-500" />
                    </button>
                  </div>
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                     {isSaleProperty ? 'Visiteurs' : 'Voyageurs'} <span className="text-gray-500 font-normal normal-case">(max {maxGuests})</span>
                   </label>
                   <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                     <div className="flex items-center justify-between gap-3">
                       <span className="text-sm font-medium text-gray-700">Adultes (max {maxAdultGuests})</span>
                       <div className="inline-flex items-center rounded-lg border border-gray-200">
                         <button
                           type="button"
                           onClick={() => setAdultGuests((prev) => Math.max(1, prev - 1))}
                           className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                           aria-label="Diminuer adultes"
                         >
                           <Minus size={14} />
                         </button>
                         <span className="min-w-10 px-2 text-center text-sm font-semibold text-gray-900">{adultGuests}</span>
                         <button
                           type="button"
                           onClick={() => setAdultGuests((prev) => Math.min(Math.max(1, Math.min(maxAdultGuests, maxGuests - childGuests)), prev + 1))}
                           className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                           aria-label="Augmenter adultes"
                         >
                           <Plus size={14} />
                         </button>
                       </div>
                     </div>
                     <div className="flex items-center justify-between gap-3">
                       <span className="text-sm font-medium text-gray-700">Enfants (max {maxChildGuests})</span>
                       <div className="inline-flex items-center rounded-lg border border-gray-200">
                         <button
                           type="button"
                           onClick={() => setChildGuests((prev) => Math.max(0, prev - 1))}
                           className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                           aria-label="Diminuer enfants"
                         >
                           <Minus size={14} />
                         </button>
                         <span className="min-w-10 px-2 text-center text-sm font-semibold text-gray-900">{childGuests}</span>
                         <button
                           type="button"
                           onClick={() => setChildGuests((prev) => Math.min(Math.max(0, Math.min(maxChildGuests, maxGuests - adultGuests)), prev + 1))}
                           className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                           aria-label="Augmenter enfants"
                         >
                           <Plus size={14} />
                         </button>
                       </div>
                     </div>
                     <div className="pt-1 text-xs text-gray-600">
                       Total: <span className="font-semibold text-gray-900">{guests}</span> / {maxGuests}
                     </div>
                   </div>
                </div>

                {/* Optional Fees */}
                {hasCleaningFee && (
                  <div 
                    onClick={() => setIncludeCleaningFee(!includeCleaningFee)}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${
                      includeCleaningFee 
                        ? 'border-emerald-500 bg-emerald-50' 
                        : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        includeCleaningFee 
                          ? 'bg-emerald-600 border-emerald-600' 
                          : 'border-gray-300'
                      }`}>
                        {includeCleaningFee && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-gray-700">Frais de ménage</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{property.cleaningFee} TND</span>
                  </div>
                )}

                {hasServiceFee && (
                  <div 
                    onClick={() => setIncludeServiceFee(!includeServiceFee)}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${
                      includeServiceFee 
                        ? 'border-emerald-500 bg-emerald-50' 
                        : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        includeServiceFee 
                          ? 'bg-emerald-600 border-emerald-600' 
                          : 'border-gray-300'
                      }`}>
                        {includeServiceFee && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-gray-700">Frais de service</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{property.serviceFee} TND</span>
                  </div>
                )}

                {hasExtraMattress && (
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <BedSingle size={16} className="text-emerald-600" />
                        Matelas supplementaire
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{extraMattressPrice} TND / unite</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Maximum {extraMattressMax}</span>
                      <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1">
                        <button type="button" onClick={() => setExtraMattresses((prev) => Math.max(0, prev - 1))} className="rounded p-1 hover:bg-gray-100" aria-label="Retirer"><Minus size={14} /></button>
                        <span className="min-w-6 text-center text-sm font-semibold">{extraMattresses}</span>
                        <button type="button" onClick={() => setExtraMattresses((prev) => Math.min(extraMattressMax, prev + 1))} className="rounded p-1 hover:bg-gray-100" aria-label="Ajouter"><Plus size={14} /></button>
                      </div>
                    </div>
                  </div>
                )}

                {hasPaidServices && (
                  <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm space-y-3 sm:p-4 sm:space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Services payants</p>
                        <h4 className="mt-1 text-base font-semibold leading-5 text-gray-900">Services additionnels disponibles</h4>
                        <p className="mt-1 text-xs leading-5 text-gray-500">Choisissez un besoin, puis faites glisser les types de prix.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPaidServicesDialog(true)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700 sm:w-auto sm:justify-start sm:rounded-full sm:px-3 sm:py-1.5"
                      >
                        <ListChecks size={14} />
                        Voir les {activePaidServices.length} services
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => paidServicesCategoriesNavRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
                        className="hidden h-8 w-8 shrink-0 rounded-full border border-gray-200 bg-white text-gray-600 transition hover:border-emerald-300 sm:inline-flex sm:items-center sm:justify-center"
                        aria-label="Categories precedentes"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div
                        ref={paidServicesCategoriesNavRef}
                        className="-mx-1 flex-1 overflow-x-auto pb-1 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0"
                      >
                        <div className="flex w-max min-w-full gap-3 px-1 sm:px-0 sm:pr-1">
                          {paidServiceCategories.map((category) => {
                            const isActive = selectedPaidServiceCategoryId === category.id;
                            return (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => togglePaidServiceCategory(category.id)}
                                className={`w-[180px] shrink-0 rounded-[1.4rem] border px-4 py-4 text-left transition ${isActive ? `${category.meta.cardClass} shadow-[0_14px_32px_rgba(15,23,42,0.10)]` : "border-gray-200 bg-white hover:border-emerald-200"}`}
                              >
                                <div className="relative h-20 overflow-hidden rounded-[1.15rem] border border-white/70 bg-slate-100">
                                  <img
                                    src={category.meta.imageUrl}
                                    alt={category.label}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.26),rgba(255,255,255,0.06)),linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0.14))]" />
                                  <div className={`absolute -right-1 -top-1 ${category.meta.watermarkClass} opacity-70`}>
                                    {cloneElement(category.meta.icon, { size: 44 })}
                                  </div>
                                  <div className="absolute inset-x-0 bottom-0 p-3">
                                    <span className={`flex h-9 w-9 items-center justify-center rounded-2xl shadow-sm ${category.meta.iconWrapClass}`}>
                                      {category.meta.icon}
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-4 text-sm font-semibold leading-5 text-gray-900">{category.label}</div>
                                <div className="mt-1 text-xs text-gray-500">{category.services.length} service{category.services.length > 1 ? "s" : ""}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => paidServicesCategoriesNavRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
                        className="hidden h-8 w-8 shrink-0 rounded-full border border-gray-200 bg-white text-gray-600 transition hover:border-emerald-300 sm:inline-flex sm:items-center sm:justify-center"
                        aria-label="Categories suivantes"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    {selectedPaidServiceCategory ? (
                      <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex gap-2 px-1 md:flex-wrap md:px-0">
                          <button
                            type="button"
                            onClick={() => setSelectedPaidServiceTypeFilter("all")}
                            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${selectedPaidServiceTypeFilter === "all" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
                          >
                            <ListChecks size={14} />
                            Tous
                          </button>
                          {(["fixe", "a_partir_de", "sur_demande"] as const).map((type) => {
                            const count = visiblePaidServices.filter((service) => service.type_tarification === type).length;
                            if (count === 0) return null;
                            const meta = getPaidServiceTypeMeta(type);
                            const isActive = selectedPaidServiceTypeFilter === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setSelectedPaidServiceTypeFilter(type)}
                                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${isActive ? meta.chipClass : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
                              >
                                {meta.icon}
                                {meta.label}
                                <span className={`rounded-full px-2 py-0.5 text-[10px] ${isActive ? "bg-white/70 text-gray-700" : "bg-gray-100 text-gray-600"}`}>
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {selectedPaidServiceCategory ? (
                      <div className="space-y-2">
                        {visiblePaidServicesPreview.map((service) => {
                        const checked = selectedPaidServiceIds.includes(service.id);
                        const meta = getPaidServiceTypeMeta(service.type_tarification);
                        const categoryMeta = getPaidServiceCategoryMeta(service.categorie);
                        return (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => togglePaidServiceSelection(service)}
                            className={`w-full rounded-2xl border px-3 py-3 text-left transition sm:px-4 ${checked ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                  <span className="text-sm font-semibold leading-5 text-gray-900">{service.label}</span>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${categoryMeta.badgeClass}`}>
                                    {categoryMeta.icon}
                                    {service.categorie || categoryMeta.label}
                                  </span>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.chipClass}`}>
                                    {meta.icon}
                                    {meta.label}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs leading-5 text-gray-500">
                                  {service.description_courte || "Service additionnel disponible pour ce besoin."}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-base font-bold leading-5 text-gray-900 sm:text-sm">{getServiceDisplayPrice(service)}</div>
                                <div className={`mt-3 inline-flex h-7 min-w-7 items-center justify-center rounded-full border text-[11px] font-bold ${checked ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-gray-300 text-gray-500'}`}>
                                  {checked ? '✓' : '+'}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500">
                        Cliquez sur une catégorie pour voir les services disponibles.
                      </div>
                    )}

                    {selectedPaidServiceCategory && visiblePaidServices.length > visiblePaidServicesPreview.length && (
                      <button
                        type="button"
                        onClick={() => setShowPaidServicesDialog(true)}
                        className="w-full rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700"
                      >
                        Voir toute la liste des services payants
                      </button>
                    )}

                  </div>
                )}

                {!isSaleProperty && (
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs font-bold uppercase text-gray-600 mb-2">Paiement</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => setPaymentMode('avance')} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${paymentMode === 'avance' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-700'}`}>
                        Avance ({advancePercent}%)
                      </button>
                      <button type="button" onClick={() => setPaymentMode('totalite')} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${paymentMode === 'totalite' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-700'}`}>
                        Totalite
                      </button>
                      <button type="button" onClick={() => setPaymentMode('amicale')} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${paymentMode === 'amicale' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-700'}`}>
                        Amicale
                      </button>
                    </div>
                  </div>
                )}

                {!isSaleProperty && paymentMode === "amicale" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                    <p className="text-xs font-bold uppercase text-emerald-700 mb-2">Formulaire Amicale</p>
                    <div className="grid gap-2">
                      <div>
                        <p className="mb-2 text-xs font-semibold text-emerald-800">Selectionner amicale</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {amicaleOptions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setAmicaleSelectionId(item.id)}
                              className={`relative h-16 overflow-hidden rounded-lg border text-left transition ${amicaleSelectionId === item.id ? 'border-emerald-600 ring-2 ring-emerald-300' : 'border-emerald-200 hover:border-emerald-400'}`}
                            >
                              {item.logoUrl ? (
                                <div
                                  className="absolute inset-0 bg-no-repeat"
                                  style={{ backgroundImage: `url(${item.logoUrl})`, backgroundSize: '100% 100%' }}
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
                        value={amicaleFullName}
                        onChange={(event) => setAmicaleFullName(event.target.value)}
                        placeholder="Nom et prenom"
                        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={amicaleMatricule}
                        onChange={(event) => setAmicaleMatricule(event.target.value)}
                        placeholder="Identifiant interne (Matricule)"
                        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={amicalePhone}
                        onChange={(event) => setAmicalePhone(event.target.value)}
                        placeholder="Num tel"
                        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={amicaleCode}
                        onChange={(event) => setAmicaleCode(event.target.value)}
                        placeholder="Code"
                        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}

                <textarea
                  value={reservationNote}
                  onChange={(e) => setReservationNote(e.target.value)}
                  rows={3}
                  placeholder={isSaleProperty ? "Precisez vos disponibilites ou vos questions" : "Note optionnelle pour l'agence"}
                  className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button 
                  type="button"
                  onClick={() => void handleReservationRequest()}
                  disabled={!reservationValidation.valid}
                  className="mt-4 w-full rounded-lg bg-emerald-600 py-3 font-bold text-white shadow-md transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
                >
                  {isSaleProperty ? 'Demander une visite' : 'Reserver'}
                </button>
                {!isSaleProperty && !reservationValidation.valid && (
                  <p className="mt-2 text-sm font-medium text-red-600">{reservationValidation.message}</p>
                )}
                <p className="text-center text-xs text-gray-500 mt-2">{isSaleProperty ? "Votre demande sera transmise a l'agence pour planification de visite" : "Aucun montant ne vous sera debite pour le moment"}</p>

                {!isSaleProperty && <div className="pt-4 border-t border-gray-100 space-y-2 text-sm text-gray-600">
                   <div className="flex justify-between">
                     <span className="underline">
                       {isAmicalePricingActive
                         ? `${formatTnd(applyAmicaleTtc(pricing.hasPeriodOverride ? pricing.averageNightlyPrice : property.pricePerNight, true))} TND TTC (forfaitaire) x ${pricing.nights} nuits`
                         : (pricing.hasPeriodOverride ? `${formatTnd(pricing.averageNightlyPrice)} TND (moyenne) x ${pricing.nights} nuits` : `${formatTnd(property.pricePerNight)} TND x ${pricing.nights} nuits`)}
                     </span>
                     <span>{formatTnd(pricing.accommodationTotal)} TND{isAmicalePricingActive ? ' (TTC)' : ''}</span>
                   </div>
                   {pricing.cleaningFee > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Frais de ménage</span>
                       <span>{formatTnd(pricing.cleaningFee)} TND{isAmicalePricingActive ? ' (TTC)' : ''}</span>
                     </div>
                   )}
                   {pricing.serviceFee > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Frais de service</span>
                       <span>{formatTnd(pricing.serviceFee)} TND{isAmicalePricingActive ? ' (TTC)' : ''}</span>
                     </div>
                   )}
                   {pricing.extraMattressTotal > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Matelas supplementaires</span>
                       <span>{formatTnd(pricing.extraMattressTotal)} TND{isAmicalePricingActive ? ' (TTC)' : ''}</span>
                     </div>
                   )}
                   {pricing.paidServicesTotal > 0 && (
                     <div className="space-y-2">
                       <div className="flex justify-between">
                         <span className="underline">Services fixes</span>
                         <span>{formatTnd(pricing.paidServicesTotal)} TND{isAmicalePricingActive ? ' (TTC)' : ''}</span>
                       </div>
                       {pricing.fixedSelectedServices?.length > 0 && (
                         <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                           Services fixes sélectionnés: {pricing.fixedSelectedServices.map((service) => `${service.label} (${getServiceDisplayPrice(service)})`).join(', ')}
                         </div>
                       )}
                     </div>
                   )}
                   {pricing.variableSelectedServices?.length > 0 && (
                     <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                       Services à confirmer par l&apos;admin: {pricing.variableSelectedServices.map((service) => `${service.label} (${getServiceDisplayPrice(service)})`).join(', ')}
                     </div>
                   )}
                   {pricing.productsAccueilFee > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Produits d'accueil</span>
                       <span>{formatTnd(pricing.productsAccueilFee)} TND{isAmicalePricingActive ? ' (TTC)' : ''}</span>
                     </div>
                   )}
                   <div className="flex justify-between">
                     <span className="underline">Total frais supplementaires</span>
                     <span>{formatTnd(pricing.extrasTotal)} TND{isAmicalePricingActive ? ' (TTC)' : ''}</span>
                   </div>
                   <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100 mt-2">
                     <span>{isAmicalePricingActive ? 'Montant total (TTC)' : 'Montant total'}</span>
                     <span>{formatTnd(pricing.total)} TND{isAmicalePricingActive ? ' (TTC)' : ''}</span>
                   </div>
                   <div className="flex justify-between text-sm text-gray-600">
                     <span className="inline-flex items-center gap-1"><Wallet size={14} />A payer maintenant</span>
                     <span className="font-semibold text-gray-900">
                       {formatTnd(paymentMode === 'totalite' ? pricing.total : Math.round((pricing.total * advancePercent) / 100))} TND{isAmicalePricingActive ? ' (TTC)' : ''}
                     </span>
                   </div>
                </div>}

                {/* Waiting list message for pending dates */}
                {hasPendingDates && getPaymentDeadline() && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-xs text-orange-800 leading-relaxed">
                      <span className="font-semibold">Liste d'attente :</span> Votre demande sera en liste d'attente car il y a une demande de confirmation en cours. Si l'autre demande est annulée, d'ici vers <span className="font-semibold">{getPaymentDeadline()}</span> nous allons traiter votre demande de confirmation et procéder vers le paiement.
                    </p>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
        </div>
      </div>

      <Dialog open={showBookingCalendarDialog} onOpenChange={setShowBookingCalendarDialog}>
        <DialogContent className="max-h-[86vh] w-[min(94vw,760px)] overflow-hidden rounded-[1.75rem] border-0 p-0 shadow-2xl sm:w-[min(90vw,700px)]">
          <DialogHeader className="border-b border-gray-100 px-5 pb-3 pt-5 sm:px-6 sm:pb-4 sm:pt-6">
            <DialogTitle className="text-xl font-bold text-gray-900 sm:text-2xl">
              {isSaleProperty ? "Choisissez vos dates" : "Choisissez votre sejour"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(86vh-92px)] overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-6 sm:pt-4">
            {!isSaleProperty && (
              <p className="mb-2 text-xs text-emerald-700 sm:mb-3 sm:text-sm">
                Duree autorisee: minimum {displayedMinStay} nuit(s), maximum {maxStay} nuit(s).
              </p>
            )}
            {!isSaleProperty && (activeWeekdayRule.requiredCheckinDay || activeWeekdayRule.requiredCheckoutDay) && (
              <p className="mb-3 text-xs text-emerald-700 sm:mb-4 sm:text-sm">
                Regle periode: check-in {activeWeekdayRule.requiredCheckinDay || 'libre'} | check-out {activeWeekdayRule.requiredCheckoutDay || 'libre'}.
              </p>
            )}
            <AvailabilityCalendar
              unavailableDates={effectiveUnavailableDates || []}
              onDateRangeSelect={handleBookingDateRangeSelect}
              selectedStart={selectedStart}
              selectedEnd={selectedEnd}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showVariablePaidServiceNotice}
        onOpenChange={(open) => {
          setShowVariablePaidServiceNotice(open);
          if (!open) setHasSeenVariablePaidServiceNotice(true);
        }}
      >
        <DialogContent className="max-w-md rounded-[1.75rem] border-0 p-0 shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Information tarifaire</DialogTitle>
            <DialogDescription>
              Details sur les services sur demande et a partir de qui peuvent etre factures separement.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <MessageCircle size={22} />
            </div>
            <h3 className="mt-4 text-xl font-bold text-gray-900">Information tarifaire</h3>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Les services <span className="font-semibold text-gray-900">Sur demande</span> et <span className="font-semibold text-gray-900">A partir de</span> sont confirmés séparément par l&apos;agence et peuvent faire l&apos;objet d&apos;une facture dédiée.
            </p>
            <button
              type="button"
              onClick={() => {
                setHasSeenVariablePaidServiceNotice(true);
                setShowVariablePaidServiceNotice(false);
              }}
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Compris
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent className="max-w-md rounded-2xl border-0 p-0 shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Regle de reservation</DialogTitle>
            <DialogDescription>Information sur les regles de reservation.</DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-900">Regle de reservation</h3>
            <p className="mt-3 text-sm leading-6 text-gray-700">{ruleDialogMessage}</p>
            <button
              type="button"
              onClick={() => setShowRuleDialog(false)}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Compris
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Other Properties Section */}
      <div className="container mx-auto px-4 md:px-6 mt-16 pt-12 border-t border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Autres logements</h2>
          <Link 
            to={backToListUrl}
            className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            Voir tout
            <ArrowRight size={20} />
          </Link>
        </div>
        
        <div className="relative group">
          {/* Previous Button */}
          <button 
            onClick={() => otherPropertiesApi?.scrollPrev()}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-12 h-12 bg-white shadow-lg rounded-full flex items-center justify-center text-gray-600 hover:text-emerald-600 hover:shadow-xl transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
            type="button"
          >
            <ChevronLeft size={24} />
          </button>

          {/* Next Button */}
          <button 
            onClick={() => otherPropertiesApi?.scrollNext()}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-12 h-12 bg-white shadow-lg rounded-full flex items-center justify-center text-gray-600 hover:text-emerald-600 hover:shadow-xl transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
            type="button"
          >
            <ChevronRight size={24} />
          </button>

          {/* Properties Carousel */}
          <div className="overflow-hidden" ref={otherPropertiesRef}>
            <div className="flex gap-6">
              {filteredOtherProperties.map((otherProperty) => (
                  <div 
                    key={otherProperty.id} 
                    className="flex-[0_0_280px] min-w-0 sm:flex-[0_0_320px]"
                  >
                    <Link 
                      to={`${buildPropertyDetailsPath(otherProperty)}${filterQueryString ? `?${filterQueryString}` : ''}`}
                      className="block bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 group/card"
                    >
                      <div className="relative h-48 overflow-hidden">
                        <SmartImage
                          src={otherProperty.images?.[0] || GALLERY_FALLBACK_IMAGE}
                          alt={otherProperty.title}
                          className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500"
                          loading="lazy"
                          decoding="async"
                          fetchPriority="low"
                          targetWidth={640}
                          quality={60}
                        />
                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                          <Star size={12} className="text-amber-500 fill-current" />
                          {formatRating(otherProperty.rating)}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-1 text-gray-500 text-xs mb-2">
                          <MapPin size={12} />
                          {otherProperty.location}
                        </div>
                        <h3 className="font-bold text-gray-900 mb-1 line-clamp-1 group-hover/card:text-emerald-600 transition-colors">
                          {otherProperty.title}
                        </h3>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold text-gray-900">{formatTnd(applyAmicaleTtc(otherProperty.pricePerNight, isAmicalePricingActive))} TND{isAmicalePricingActive ? " TTC" : ""}</span>
                          <span className="text-gray-500 text-sm">{otherProperty.priceContext === 'sale' ? '/ vente' : '/ nuit'}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                          <span>{otherProperty.guests} voyageurs</span>
                          <span>|</span>
                          <span>{otherProperty.category}</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
            </div>
          </div>
        </div>
        {filteredOtherProperties.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-600">
            Aucun autre logement ne correspond a vos filtres actuels.
          </div>
        )}
      </div>

      {mobileFloatingActions}

      {/* Lightbox */}
      {lightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button 
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-50 p-2 text-white/70 hover:text-white transition-colors"
          >
            <X size={32} />
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">
            {currentImageIndex + 1} / {galleryImages.length}
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prevImage(); }}
            className="absolute inset-y-0 left-0 z-40 flex w-[20vw] min-w-[64px] items-center justify-start pl-2 sm:pl-4 md:w-[16vw] md:pl-8"
            aria-label="Image precedente"
          >
            <span className="rounded-full border border-white/20 bg-black/42 p-1.5 text-white/90 shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all duration-300 hover:bg-black/60 hover:text-white">
              <ChevronLeft size={22} strokeWidth={2} />
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); nextImage(); }}
            className="absolute inset-y-0 right-0 z-40 flex w-[20vw] min-w-[64px] items-center justify-end pr-2 sm:pr-4 md:w-[16vw] md:pr-8"
            aria-label="Image suivante"
          >
            <span className="rounded-full border border-white/20 bg-black/42 p-1.5 text-white/90 shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all duration-300 hover:bg-black/60 hover:text-white">
              <ChevronRight size={22} strokeWidth={2} />
            </span>
          </button>

          {/* Main image with smooth transition */}
          <div 
            className="relative w-full h-full flex items-center justify-center p-4 sm:p-8 md:p-16"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={handleLightboxPointerDown}
            onPointerUp={handleLightboxPointerUp}
          >
            <SmartImage
              src={galleryImages[currentImageIndex]}
              alt={`${property.title} - ${currentImageIndex + 1}`}
              className={`max-w-full max-h-full touch-pan-y object-contain rounded-lg shadow-2xl transition-all duration-500 ease-out transform select-none ${lightboxOriginalLoaded ? 'opacity-0' : 'opacity-100'}`}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              targetWidth={lightboxPreviewTargetWidth}
              quality={currentLightboxPreviewQuality}
              onLoad={() => {
                loadedLightboxPreviewSrcsRef.current.add(currentLightboxPreviewSrc);
                setLightboxImageLoading(false);
              }}
              onError={() => {
                setLightboxImageLoading(false);
              }}
              style={{
                animation: 'fadeInScale 0.5s ease-out'
              }}
            />
            {lightboxOriginalIndex === currentImageIndex && (
              <img
                src={currentLightboxOriginalSrc}
                alt={`${property.title} - ${currentImageIndex + 1}`}
                className={`absolute max-w-full max-h-full touch-pan-y object-contain rounded-lg shadow-2xl transition-opacity duration-300 ease-out select-none ${lightboxOriginalLoaded ? 'opacity-100' : 'opacity-0'}`}
                loading="eager"
                decoding="async"
                {...({ fetchpriority: "high" } as Record<string, string>)}
                onLoad={() => {
                  loadedLightboxOriginalSrcsRef.current.add(currentLightboxOriginalSrc);
                  setLightboxOriginalLoaded(true);
                  setLightboxImageLoading(false);
                }}
                onError={() => {
                  markFailedImageSource(currentLightboxOriginalSrc);
                  setLightboxOriginalLoaded(false);
                  setLightboxImageLoading(false);
                }}
              />
            )}
            {lightboxImageLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border-2 border-white/20 border-t-white h-10 w-10 animate-spin" />
              </div>
            )}
          </div>

          {/* Thumbnail navigation */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 px-4 py-2 bg-black/50 rounded-full backdrop-blur-sm overflow-x-auto max-w-[90vw]">
            {visibleLightboxThumbIndexes.map((idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                className={`flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-lg overflow-hidden transition-all duration-300 ${
                  idx === currentImageIndex 
                    ? 'ring-2 ring-white scale-110' 
                    : 'opacity-50 hover:opacity-80'
                }`}
              >
                <SmartImage
                  src={galleryImages[idx]}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  targetWidth={240}
                  quality={58}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {showLoginPrompt && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-4"
          onClick={() => {
            if (loginPromptStep === "profile_setup") return;
            setShowLoginPrompt(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-white/60 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Connexion client</p>
                <h3 className="mt-2 text-2xl font-bold text-gray-900">Connectez-vous pour continuer</h3>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Connectez-vous en tant que client pour {isSaleProperty ? 'envoyer une demande de visite' : 'envoyer une demande de reservation'}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (loginPromptStep === "profile_setup") return;
                  setShowLoginPrompt(false);
                }}
                className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 overflow-hidden">
              {loginPromptStep === "choices" && (
                <div className="space-y-3 animate-[fadeInScale_.2s_ease-out]">
                  {!isPasskeyPromptLoading && (
                    <>
                      <button
                        type="button"
                        disabled={!providers.google}
                        onClick={() => handlePromptSocialLogin('google')}
                        className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Globe className="h-5 w-5 text-emerald-700" />
                        Continuer avec Google
                      </button>
                      <button
                        type="button"
                        disabled={!providers.facebook}
                        onClick={() => handlePromptSocialLogin('facebook')}
                        className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Facebook className="h-5 w-5 text-blue-600" />
                        Continuer avec Facebook
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={isPasskeyPromptLoading || !providers.passkey}
                    onClick={() => void handlePromptPasskeyLogin()}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <KeyRound className="h-5 w-5 text-emerald-700" />
                    {isPasskeyPromptLoading ? 'Verification Passkey...' : 'Continuer avec Passkey'}
                  </button>
                </div>
              )}

              {loginPromptStep === "passkey_setup" && (
                <div className="space-y-3 animate-[fadeInScale_.2s_ease-out]">
                  <button
                    type="button"
                    onClick={() => setLoginPromptStep("choices")}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Retour
                  </button>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-800">Creation Passkey</p>
                    <input
                      type="email"
                      value={passkeyPromptEmail}
                      onChange={(event) => setPasskeyPromptEmail(event.target.value)}
                      placeholder="Email client"
                      className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                    <input
                      type="text"
                      value={passkeyPromptName}
                      onChange={(event) => setPasskeyPromptName(event.target.value)}
                      placeholder="Nom (optionnel)"
                      className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isPasskeyCreateLoading}
                    onClick={() => void handlePromptPasskeyCreate()}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <KeyRound className="h-5 w-5 text-white" />
                    {isPasskeyCreateLoading ? 'Creation Passkey...' : 'Creer et continuer'}
                  </button>
                </div>
              )}

              {loginPromptStep === "profile_setup" && (
                <div className="space-y-3 animate-[fadeInScale_.2s_ease-out]">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Profil obligatoire</p>
                  <p className="text-sm text-gray-600">
                    Completez votre identite pour continuer la reservation.
                  </p>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                    <input
                      type="text"
                      value={profilePromptForm.firstName}
                      onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, firstName: event.target.value }))}
                      placeholder="Prenom *"
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                    <input
                      type="text"
                      value={profilePromptForm.lastName}
                      onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, lastName: event.target.value }))}
                      placeholder="Nom *"
                      className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                    <input
                      type="text"
                      value={profilePromptForm.telephone}
                      onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, telephone: event.target.value }))}
                      placeholder="Telephone *"
                      className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                    <input
                      type="text"
                      value={profilePromptForm.address}
                      onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, address: event.target.value }))}
                      placeholder="Adresse *"
                      className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                    <input
                      type="text"
                      value={profilePromptForm.cin}
                      onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, cin: event.target.value }))}
                      placeholder="CIN (optionnelle)"
                      className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isProfilePromptSaving}
                    onClick={() => void handlePromptProfileComplete()}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isProfilePromptSaving ? "Validation..." : "Valider et continuer"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
