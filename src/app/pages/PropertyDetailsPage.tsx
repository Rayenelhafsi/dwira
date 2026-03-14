import { useParams, Link, useSearchParams, Navigate, useNavigate, useLocation } from "react-router";
import { useProperties } from "../context/PropertiesContext";
import { MapPin, Check, Star, Share2, Heart, Calendar, X, ChevronLeft, ChevronRight, ArrowRight, Facebook, Globe, MessageCircle, BedSingle, Minus, Plus, Wallet, Building2, Mountain, Route, ShieldCheck, Users, Volume2, Clock3, ListChecks, ChevronDown, ChevronUp, Wifi, Snowflake, UtensilsCrossed, Car, Tv, Waves, Trees, PawPrint, Cigarette, ConciergeBell } from "lucide-react";
import { MapContainer, TileLayer, Circle } from "react-leaflet";
import useEmblaCarousel from 'embla-carousel-react';
import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import "leaflet/dist/leaflet.css";
import AvailabilityCalendar from "../components/AvailabilityCalendar";
import { format, differenceInDays, isWithinInterval, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { trackPublicClientInteraction } from "../utils/clientInteractions";
import { getAuthProviders, startSocialLogin } from "../services/auth";
import { toYouTubeEmbedUrl } from "../utils/videoLinks";
import { buildApiUrl } from "../utils/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { getFeatureIconElement } from "../utils/featureIcons";
import logo from "../../assets/c9952e139aedea0af19c1652a89e92cb4378f1ac.png";
import {
  clearAuthPendingLogin,
  isAuthPendingLogin,
  markAuthPendingLogin,
  saveAuthReturnTo,
  savePendingReservationDraft,
  readPendingReservationDraft,
  type PendingReservationDraft,
} from "../utils/pendingReservation";
const API_URL = import.meta.env.VITE_API_URL || '/api';

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

type SeasonalDetailRow = { label: string; value: string };
type SeasonalFallbackTab = { id: string; nom: string; rows: SeasonalDetailRow[] };
type AmenitySection = { id: string; nom: string; features: FeatureApiRow[] };
type FeatureDisplayItem = { id: string; label: string; meta: string | null; sectionName: string; feature: FeatureApiRow };

const normalizeFeatureName = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const cleanFeatureTabName = (value: string) =>
  String(value || '')
    .replace(/^\s*\d+\s*[\.\-:)]\s*/g, '')
    .trim();

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
  const h = hashString(seed || 'dwira');
  const angle = (h % 360) * (Math.PI / 180);
  // Keep privacy while staying visually close to the real point (80m -> 180m).
  const distanceKm = 0.08 + ((h % 100) / 1000);
  const latOffset = (distanceKm / 111) * Math.cos(angle);
  const lngOffset = (distanceKm / (111 * Math.cos((exact.lat * Math.PI) / 180))) * Math.sin(angle);
  const candidate = { lat: exact.lat + latOffset, lng: exact.lng + lngOffset };
  return isValidLatLng(candidate.lat, candidate.lng) ? candidate : exact;
};

export default function PropertyDetailsPage() {
  // Use shared context for properties
  const { properties, biens, zones } = useProperties();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const property = properties.find((p) => p.slug === slug);
  const propertyVideos = property?.videos || [];
  const galleryItems = useMemo(
    () => [
      ...propertyVideos.map((url, index) => ({ type: "video" as const, url, key: `video-${index}` })),
      ...(property?.images || []).map((url, index) => ({ type: "image" as const, url, key: `image-${index}` })),
    ],
    [property?.images, propertyVideos]
  );
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const lastTrackedVisitKeyRef = useRef<string>('');

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
  const [guests, setGuests] = useState(1);
  const [includeCleaningFee, setIncludeCleaningFee] = useState(false);
  const [includeServiceFee, setIncludeServiceFee] = useState(false);
  const [extraMattresses, setExtraMattresses] = useState(0);
  const [selectedPaidServiceIds, setSelectedPaidServiceIds] = useState<string[]>([]);
  const [paymentMode, setPaymentMode] = useState<'totalite' | 'avance'>('avance');
  const [showSeasonalDetails, setShowSeasonalDetails] = useState(false);
  const [showAmenitiesDialog, setShowAmenitiesDialog] = useState(false);
  const [seasonalDetailsTabId, setSeasonalDetailsTabId] = useState<string>('');
  const [allFeatures, setAllFeatures] = useState<FeatureApiRow[]>([]);
  const [featureTabs, setFeatureTabs] = useState<FeatureTabRow[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [reservationNote, setReservationNote] = useState("");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [providers, setProviders] = useState({ google: false, facebook: false, phoneOtp: false, emailOtp: false });
  const [pendingDraft, setPendingDraft] = useState<Record<string, unknown> | null>(null);
  const [isAwaitingLogin, setIsAwaitingLogin] = useState(false);
  const [pulsePhase, setPulsePhase] = useState(0);
  const authPopupRef = useRef<Window | null>(null);
  const draftHydratedRef = useRef(false);
  const detailTabsNavRef = useRef<HTMLDivElement | null>(null);
  const seasonalDetailsPanelRef = useRef<HTMLDivElement | null>(null);
  const googlePlacesUnsupportedRef = useRef(false);
  const isSaleProperty = property?.priceContext === 'sale';
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
  const animatedCircleRadius = useMemo(
    () => 280 + Math.sin(pulsePhase * 2.4) * 35,
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
      setMapCenter(exact);
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
    let cancelled = false;
    const loadNearby = async () => {
      if (!displayMapCenter) {
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
          if (googleResponse.status === 404) {
            googlePlacesUnsupportedRef.current = true;
          } else if (googleResponse.ok) {
            const googlePayload = await googleResponse.json().catch(() => ({}));
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
              setNearbyPlaces(googleItems);
              return;
            }
          }
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
        setNearbyPlaces(items);
      } catch {
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
  const maxGuests = Math.max(1, seasonalConfig?.limitePersonnesNuit || property?.guests || 1);
  const minStay = Math.max(1, seasonalConfig?.dureeMinSejourNuits || 1);
  const maxStay = Math.max(minStay, seasonalConfig?.dureeMaxSejourNuits || 365);
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
  const animauxLabel = seasonalConfig?.animaux ? ({ autorises: 'Autorises', interdits: 'Interdits', sous_conditions: 'Autorises sous conditions' } as const)[seasonalConfig.animaux] : null;
  const hasCleaningFee = !isSaleProperty
    && (seasonalConfig?.fraisMenageDisponible !== false)
    && Number(property?.cleaningFee || 0) > 0;
  const hasServiceFee = !isSaleProperty
    && (seasonalConfig?.fraisServiceDisponible !== false)
    && Number(property?.serviceFee || 0) > 0;
  const activePaidServices = useMemo(
    () => (seasonalConfig?.servicesPayants || []).filter((service) => service.enabled !== false && Number(service.prix || 0) > 0 && String(service.label || '').trim().length > 0),
    [seasonalConfig?.servicesPayants]
  );
  const hasPaidServices = !isSaleProperty && activePaidServices.length > 0;
  const hasExtraMattress = !isSaleProperty && extraMattressMax > 0 && extraMattressPrice > 0;
  const reglesResume = [
    `Fumeurs: ${fumeursLabel || 'Non precise'}`,
    `Alcool: ${alcoolLabel || 'Non precise'}`,
    `Animaux: ${animauxLabel || 'Non precise'}`,
  ].join(' | ');
  const formatRating = (value: number) =>
    Number.isFinite(value)
      ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
      : "0,0";

  useEffect(() => {
    console.debug('[PropertyDetailsDebug] route', {
      pathname: location.pathname,
      slug,
      propertyId: property?.id,
      sourceBienId: sourceBien?.id,
      sourceBienZoneId: sourceBien?.zone_id,
    });
  }, [location.pathname, slug, property?.id, sourceBien?.id, sourceBien?.zone_id]);

  useEffect(() => {
    console.debug('[PropertyDetailsDebug] zone', {
      selectedZoneId: selectedZone?.id,
      selectedZoneName: selectedZone?.nom,
      selectedBienMapsUrl: selectedBienMapsUrl || null,
      selectedZoneMapsUrl: selectedZoneMapsUrl || null,
      selectedMapsUrl: selectedMapsUrl || null,
      zonesCount: Array.isArray(zones) ? zones.length : 0,
      zoneSample: (Array.isArray(zones) ? zones.slice(0, 3) : []).map((z) => ({
        id: z?.id,
        nom: z?.nom,
        google_maps_url: z?.google_maps_url || null,
      })),
    });
  }, [selectedZone?.id, selectedZone?.nom, selectedBienMapsUrl, selectedZoneMapsUrl, selectedMapsUrl, zones]);

  useEffect(() => {
    console.debug('[PropertyDetailsDebug] localisationSection', {
      usesStaticPlaceholder: false,
      hasGoogleMapsUrl: Boolean(selectedMapsUrl),
      hasMapCenter: Boolean(mapCenter),
      mapCenter,
      displayMapCenter,
      hasGoogleEmbedUrl: Boolean(googleEmbedUrl),
    });
  }, [selectedMapsUrl, mapCenter, displayMapCenter, googleEmbedUrl]);
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
  const amenitySections = useMemo<AmenitySection[]>(() => {
    const orderLookup = new Map(featureTabs.map((tab) => [String(tab.id), Number(tab.ordre || 999)]));
    const nameLookup = new Map(featureTabs.map((tab) => [String(tab.id), cleanFeatureTabName(tab.nom)]));
    const grouped = new Map<string, AmenitySection>();

    selectedVisibleFeatures.forEach((feature) => {
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
  }, [featureTabs, selectedVisibleFeatures]);
  const detailTabs = useMemo(() => {
    const availableTabIds = new Set(selectedVisibleFeatures.map((item) => String(item.onglet_id || '')));
    return featureTabs
      .filter((tab) => availableTabIds.has(String(tab.id || '')))
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
          { label: 'Tarif nuit', value: `${property?.pricePerNight || 0} TND` },
          ...(hasCleaningFee ? [{ label: 'Frais de menage', value: `${property?.cleaningFee || 0} TND` }] : []),
          ...(hasServiceFee ? [{ label: 'Frais de service', value: `${property?.serviceFee || 0} TND` }] : []),
          ...(hasExtraMattress ? [{ label: 'Matelas supplementaire', value: `${extraMattressPrice} TND / unite` }] : []),
          ...activePaidServices.map((service) => ({ label: service.label, value: `${Number(service.prix || 0)} TND` })),
        ];
      }
      return [];
    };
    return sortedTabs
      .map((tab) => ({ id: tab.id, nom: tab.nom, rows: rowsForTab(String(tab.nom || '')) }))
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
    maxGuests,
    maxStay,
    minStay,
    niveauSonoreLabel,
    politiqueAnnulationLabel,
    property?.cleaningFee,
    property?.location,
    property?.pricePerNight,
    property?.serviceFee,
    property?.title,
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
    if (startsWith('frais de menage')) return hasCleaningFee ? `${property?.cleaningFee || 0} TND` : 'Non disponible';
    if (startsWith('frais de service')) return hasServiceFee ? `${property?.serviceFee || 0} TND` : 'Non disponible';
    if (startsWith('matelas supplementaire')) return hasExtraMattress ? `${extraMattressPrice} TND / unite` : 'Non disponible';
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
  const secondaryValueForFeature = useCallback((featureName: string) => {
    const value = valueForFeature(featureName);
    if (!value || value === '-' || value === 'Oui') return null;
    return value;
  }, [valueForFeature]);
  const featureDisplayItems = useMemo<FeatureDisplayItem[]>(() => (
    amenitySections.flatMap((section) => (
      section.features.flatMap((feature) => {
        const values = parseFeatureValueJson(feature.valeur_json);
        if (values.length > 0) {
          return values.map((value, index) => ({
            id: `${feature.id}:${index}:${value}`,
            label: value,
            meta: feature.nom,
            sectionName: section.nom,
            feature,
          }));
        }
        const fallbackValue = valueForFeature(feature.nom);
        const isFallbackUseful = fallbackValue && fallbackValue !== '-' && fallbackValue !== 'Oui';
        return [{
          id: feature.id,
          label: isFallbackUseful ? fallbackValue : feature.nom,
          meta: isFallbackUseful ? feature.nom : null,
          sectionName: section.nom,
          feature,
        }];
      })
    ))
  ), [amenitySections, valueForFeature]);
  const amenityPreviewItems = useMemo(() => featureDisplayItems.slice(0, 6), [featureDisplayItems]);
  const totalAmenitiesCount = featureDisplayItems.length;

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
    void getAuthProviders().then((availableProviders) => {
      if (isMounted) setProviders(availableProviders);
    });
    return () => {
      isMounted = false;
    };
  }, [showLoginPrompt]);

  useEffect(() => {
    if (!property || !user || user.role !== 'user' || !user.email) return;
    const visitKey = `${user.email}:${property.id}`;
    if (lastTrackedVisitKeyRef.current === visitKey) return;
    lastTrackedVisitKeyRef.current = visitKey;
    void trackPublicClientInteraction({
      type: 'visite',
      bienId: String(property.id),
      propertyTitle: property.title,
      clientUserId: user.id,
      clientEmail: user.email,
      clientName: user.name,
    }).catch(() => {});
  }, [property, user]);

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

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    document.body.style.overflow = 'unset';
  };

  const nextImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev + 1) % property!.images.length);
  }, [property]);

  const prevImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev - 1 + property!.images.length) % property!.images.length);
  }, [property]);

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

  const handleDateRangeSelect = (start: Date | null, end: Date | null) => {
    setSelectedStart(start);
    setSelectedEnd(end);
  };

  useEffect(() => {
    if (!property || draftHydratedRef.current) return;
    const stateDraft = (location.state as { draft?: PendingReservationDraft; restoreDraft?: boolean } | null)?.draft || null;
    const storedDraft = readPendingReservationDraft();
    const candidate = stateDraft || storedDraft;
    if (!candidate || candidate.propertySlug !== property.slug) return;
    const parsedStart = candidate.startDate ? new Date(candidate.startDate) : null;
    const parsedEnd = candidate.endDate ? new Date(candidate.endDate) : null;
    if (!parsedStart || !parsedEnd || Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) return;
    draftHydratedRef.current = true;
    setSelectedStart(parsedStart);
    setSelectedEnd(parsedEnd);
    setGuests(Math.max(1, Number(candidate.guests || 1)));
    setIncludeCleaningFee(Boolean(candidate.includeCleaningFee));
    setIncludeServiceFee(Boolean(candidate.includeServiceFee));
    setExtraMattresses(Math.max(0, Number(candidate.extraMattresses || 0)));
    setSelectedPaidServiceIds(Array.isArray(candidate.selectedPaidServiceIds) ? candidate.selectedPaidServiceIds : []);
    setPaymentMode(candidate.paymentMode === 'totalite' ? 'totalite' : 'avance');
    setReservationNote(String(candidate.reservationNote || ""));
    setPendingDraft(candidate);
  }, [location.state, property]);

  // Calculate total price
  const calculateTotal = () => {
    const paidServices = activePaidServices.filter((service) => selectedPaidServiceIds.includes(service.id));
    const paidServicesTotal = paidServices.reduce((sum, service) => sum + Number(service.prix || 0), 0);
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
      productsAccueilFee,
      extrasTotal: paidServicesTotal + productsAccueilFee,
      total: paidServicesTotal + productsAccueilFee
    };
    // Use Math.abs to prevent negative nights when dates are selected in reverse order
    const nights = Math.abs(differenceInDays(selectedEnd, selectedStart));
    const accommodationTotal = property!.pricePerNight * nights;
    const cleaningFee = (hasCleaningFee && includeCleaningFee && property?.cleaningFee) ? property.cleaningFee : 0;
    const serviceFee = (hasServiceFee && includeServiceFee && property?.serviceFee) ? property.serviceFee : 0;
    const extraMattressTotal = extraMattresses * extraMattressPrice;
    const extrasTotal = cleaningFee + serviceFee + extraMattressTotal + paidServicesTotal + productsAccueilFee;
    const total = accommodationTotal + extrasTotal;
    return {
      nights,
      accommodationTotal,
      cleaningFee,
      serviceFee,
      extraMattressTotal,
      paidServicesTotal,
      productsAccueilFee,
      extrasTotal,
      total
    };
  };

  // Check if selected range includes pending dates and get the payment deadline
  const getPendingDateInfo = () => {
    if (!selectedStart || !selectedEnd || !property?.unavailableDates) return null;
    
    const rangeStart = selectedStart < selectedEnd ? selectedStart : selectedEnd;
    const rangeEnd = selectedStart < selectedEnd ? selectedEnd : selectedStart;
    
    const overlappingPending = property.unavailableDates.find((range) => {
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
    if (property && user && user.role === 'user' && user.email) {
      void trackPublicClientInteraction({
        type: 'partage',
        bienId: String(property.id),
        propertyTitle: property.title,
        clientUserId: user.id,
        clientEmail: user.email,
        clientName: user.name,
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
      if (user && user.role === 'user' && user.email) {
        void trackPublicClientInteraction({
          type: 'like',
          bienId: String(property.id),
          propertyTitle: property.title,
          clientUserId: user.id,
          clientEmail: user.email,
          clientName: user.name,
        }).catch(() => {});
      }
      toast.success("Ajouté aux favoris");
    }
  };

  const handleReservationRequest = async () => {
    if (!property) return;
    if (!selectedStart || !selectedEnd) {
      toast.error('Selectionnez une periode');
      return;
    }

    const start = selectedStart < selectedEnd ? selectedStart : selectedEnd;
    const end = selectedStart < selectedEnd ? selectedEnd : selectedStart;
    const startDate = format(start, 'yyyy-MM-dd');
    const endDate = format(end, 'yyyy-MM-dd');
    if (startDate === endDate) {
      toast.error('Choisissez au moins une nuit');
      return;
    }
    const nights = Math.max(0, Math.abs(differenceInDays(end, start)));
    if (!isSaleProperty && nights < minStay) {
      toast.error(`Sejour minimum: ${minStay} nuit(s)`);
      return;
    }
    if (!isSaleProperty && nights > maxStay) {
      toast.error(`Sejour maximum: ${maxStay} nuit(s)`);
      return;
    }

    const draft = {
      propertyId: String(property.id),
      propertySlug: property.slug,
      requestType: isSaleProperty ? 'visite' : 'reservation',
      startDate,
      endDate,
      guests,
      includeCleaningFee,
      includeServiceFee,
      extraMattresses,
      selectedPaidServiceIds,
      paymentMode,
      reservationNote: reservationNote.trim(),
    };

    if (!user || user.role !== 'user' || !user.email) {
      savePendingReservationDraft(draft);
      setPendingDraft(draft);
      setShowLoginPrompt(true);
      return;
    }

    navigate(`/reservation/confirmation/${property.slug}`, {
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
    const confirmationPath = `/reservation/confirmation/${property.slug}`;
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

  useEffect(() => {
    if (!property) return;
    if (!isAwaitingLogin && !isAuthPendingLogin()) return;
    if (!user || user.role !== 'user' || !user.email) return;
    const draft = readPendingReservationDraft();
    if (!draft || draft.propertySlug !== property.slug) return;
    clearAuthPendingLogin();
    setIsAwaitingLogin(false);
    setShowLoginPrompt(false);
    try {
      if (authPopupRef.current && !authPopupRef.current.closed) authPopupRef.current.close();
    } catch {}
    navigate(`/reservation/confirmation/${property.slug}`, {
      state: { draft },
    });
  }, [isAwaitingLogin, navigate, property, user]);

  useEffect(() => {
    setGuests((prev) => Math.min(Math.max(prev, 1), maxGuests));
    setExtraMattresses((prev) => Math.min(Math.max(prev, 0), extraMattressMax));
  }, [maxGuests, extraMattressMax]);

  useEffect(() => {
    if (!hasCleaningFee) setIncludeCleaningFee(false);
    if (!hasServiceFee) setIncludeServiceFee(false);
    setSelectedPaidServiceIds((prev) => {
      const next = prev.filter((id) => activePaidServices.some((service) => service.id === id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev;
      return next;
    });
  }, [activePaidServices, hasCleaningFee, hasServiceFee]);

  // Auto-play for embla carousel
  useEffect(() => {
    if (emblaApi) {
      const autoplay = setInterval(() => {
        emblaApi.scrollNext();
      }, 4000);
      return () => clearInterval(autoplay);
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

  return (
    <div className="bg-white pt-24 pb-20">
      <div className="container mx-auto px-4 md:px-6">
        
        {/* Breadcrumb */}
        <div className="text-sm text-gray-500 mb-6">
          <Link to="/" className="hover:text-emerald-600">Accueil</Link>
          <span className="mx-2">/</span>
          <Link to="/logements" className="hover:text-emerald-600">Logements</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{property.title}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{property.title}</h1>
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
            {galleryItems.slice(0, 5).map((item, index) => {
              const isPrimary = index === 0;
              const wrapperClass = isPrimary ? "col-span-2 row-span-2" : "col-span-1 row-span-1";
              const fallbackImage = property.images[0];
              const imageIndex = property.images.findIndex((img) => img === item.url);
              const openImage = () => {
                if (item.type === "image" && imageIndex >= 0) {
                  openLightbox(imageIndex);
                }
              };

              return (
                <div key={item.key} className={`${wrapperClass} relative`} onClick={openImage}>
                  {item.type === "video" ? (
                    <>
                      <iframe
                        src={toYouTubeEmbedUrl(item.url) || ""}
                        title={`${property.title} video ${index + 1}`}
                        className="w-full h-full bg-black"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                      <div className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
                        Vidéo
                      </div>
                    </>
                  ) : (
                    <img
                      src={item.url || fallbackImage}
                      alt={property.title}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                    />
                  )}
                  {index === 4 && galleryItems.length > 5 && item.type === "image" && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center hover:bg-black/40 transition-colors cursor-pointer">
                      <span className="text-white font-semibold text-lg">Voir tout</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile Slider using Embla Carousel */}
          <div className="md:hidden rounded-xl overflow-hidden shadow-lg relative group">
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex">
                {galleryItems.map((item, idx) => (
                  <div 
                    className="flex-[0_0_100%] min-w-0 relative h-[250px] sm:h-[300px]" 
                    key={item.key}
                    onClick={() => {
                      if (item.type === "image") {
                        const imageIndex = property.images.findIndex((img) => img === item.url);
                        if (imageIndex >= 0) openLightbox(imageIndex);
                      }
                    }}
                  >
                    {item.type === "video" ? (
                      <>
                        <iframe
                          src={toYouTubeEmbedUrl(item.url) || ""}
                          title={`${property.title} video mobile ${idx + 1}`}
                          className="w-full h-full bg-black"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                        <div className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
                          Vidéo
                        </div>
                      </>
                    ) : (
                      <img src={item.url} alt={`${property.title} - ${idx + 1}`} className="w-full h-full object-cover cursor-pointer" />
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* Navigation Buttons for Slider could be added here */}
            <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-xs backdrop-blur-sm">
               {galleryItems.length} média{galleryItems.length > 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {propertyVideos.length > 0 && (
          <div className="mb-12 rounded-3xl border border-emerald-100 bg-emerald-50/40 p-6 md:p-8">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Visite vidéo</h2>
                <p className="text-sm text-gray-600 mt-1">Regardez le bien avant de réserver ou demander une visite.</p>
              </div>
              <div className="text-sm font-medium text-emerald-700">
                {propertyVideos.length} vidéo{propertyVideos.length > 1 ? "s" : ""}
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {propertyVideos.map((videoUrl, index) => (
                <div key={`${videoUrl}-${index}`} className="overflow-hidden rounded-2xl bg-black shadow-lg">
                  <iframe
                    src={toYouTubeEmbedUrl(videoUrl) || ""}
                    title={`${property.title} visite video ${index + 1}`}
                    className="w-full h-[240px] md:h-[360px] bg-black"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Left Column: Info */}
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center py-6 border-b border-gray-100">
               <div>
                 <h2 className="text-xl font-bold mb-1">Logement entier : {property.category}</h2>
                 <div className="flex gap-4 text-gray-600 text-sm">
                   <span className="font-medium text-emerald-700">{maxGuests} voyageurs max</span>
                   <span>Â·</span>
                   <span>{property.bedrooms} chambres</span>
                   <span>Â·</span>
                   <span>{property.bathrooms} salles de bain</span>
                 </div>
               </div>
               <div className="w-12 h-12 rounded-full p-1.5 bg-gradient-to-br from-emerald-50 to-emerald-200 ring-1 ring-emerald-200 shadow-sm flex items-center justify-center">
                 <img src={logo} alt="Logo Dwira" className="w-full h-full rounded-full bg-white object-contain p-1" />
               </div>
            </div>

            <div className="py-8 border-b border-gray-100">
              <h3 className="text-xl font-bold mb-4">À propos de ce logement</h3>
              <p className="text-gray-600 leading-relaxed whitespace-pre-line">
                {property.description}
              </p>
            </div>

            {!isSaleProperty && (
              <div className="py-8 border-b border-gray-100">
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
                        {(usingConfiguredTabs ? selectedDetailFeatures.length > 0 : Boolean(selectedFallbackTab?.rows?.length)) ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            {usingConfiguredTabs ? (
                              selectedDetailFeatures.map((feature) => (
                                <div key={feature.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                                  <span className="text-gray-500">{feature.nom}</span>
                                  <div className="font-semibold text-gray-900">{valueForFeature(feature.nom)}</div>
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

            <div className="py-8 border-b border-gray-100">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h3 className="text-xl font-bold">Ce que propose ce logement</h3>
                {totalAmenitiesCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAmenitiesDialog(true)}
                    className="hidden rounded-2xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 md:inline-flex"
                  >
                    Afficher les {totalAmenitiesCount} équipements
                  </button>
                ) : null}
              </div>

              {amenityPreviewItems.length > 0 ? (
                <>
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
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500">
                  Aucune caractéristique visible pour ce logement.
                </div>
              )}
            </div>

            <Dialog open={showAmenitiesDialog} onOpenChange={setShowAmenitiesDialog}>
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

            <div className="py-8">
               <h3 className="text-xl font-bold mb-6">Où se situe le logement</h3>
               {displayMapCenter ? (
                 <div className="property-location-map rounded-xl overflow-hidden border border-gray-200 h-[300px] bg-white relative">
                   <MapContainer
                     center={[displayMapCenter.lat, displayMapCenter.lng]}
                     zoom={14}
                     scrollWheelZoom
                     className="h-full w-full property-location-map__leaflet"
                   >
                     <TileLayer
                       attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
                       url="https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
                       subdomains={["mt0", "mt1", "mt2", "mt3"]}
                       maxZoom={20}
                     />
                     <Circle
                       center={[displayMapCenter.lat, displayMapCenter.lng]}
                       radius={280}
                       pathOptions={{
                         color: "#10b981",
                         weight: 2,
                         fillColor: "#34d399",
                         fillOpacity: 0.2,
                       }}
                     />
                     <Circle
                       center={[displayMapCenter.lat, displayMapCenter.lng]}
                       radius={animatedCircleRadius}
                       pathOptions={{
                         color: "#10b981",
                         weight: 1.5,
                         fillColor: "#6ee7b7",
                         fillOpacity: 0.08,
                       }}
                     />
                   </MapContainer>
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
            <div className="py-8 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                <Calendar size={24} className="text-emerald-600" />
                <h3 className="text-xl font-bold">Disponibilités</h3>
              </div>
              <p className="text-gray-600 mb-6">
                Sélectionnez vos dates pour voir les disponibilités et réserver votre séjour.
              </p>
              {!isSaleProperty && (
                <p className="text-sm text-emerald-700 mb-4">
                  Duree autorisee: minimum {minStay} nuit(s), maximum {maxStay} nuit(s).
                </p>
              )}
              <AvailabilityCalendar
                unavailableDates={property.unavailableDates || []}
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
                  <span className="text-2xl font-bold text-gray-900">{property.pricePerNight} TND</span>
                  {property.priceContext !== 'sale' ? <span className="text-gray-500"> / nuit</span> : <span className="text-gray-500"> / vente</span>}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Star size={14} className="text-amber-500 fill-current" />
                  <span className="font-medium text-gray-900">{formatRating(property.rating)}</span>
                </div>
              </div>

              <form className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{isSaleProperty ? 'Date souhaitee' : 'Arrivee'}</label>
                    <div className="relative">
                      <input 
                        type="date" 
                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        value={selectedStart ? format(selectedStart, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setSelectedStart(e.target.value ? new Date(e.target.value) : null)}
                      />
                    </div>
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{isSaleProperty ? 'Date alternative' : 'Depart'}</label>
                    <div className="relative">
                       <input 
                        type="date" 
                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        value={selectedEnd ? format(selectedEnd, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setSelectedEnd(e.target.value ? new Date(e.target.value) : null)}
                      />
                    </div>
                  </div>
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                     {isSaleProperty ? 'Visiteurs' : 'Voyageurs'} <span className="text-gray-500 font-normal normal-case">(max {maxGuests})</span>
                   </label>
                   <select 
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                      value={guests}
                      onChange={(e) => setGuests(parseInt(e.target.value))}
                   >
                     {[...Array(maxGuests)].map((_, i) => (
                       <option key={i} value={i + 1}>{i + 1} {isSaleProperty ? `visiteur${i > 0 ? 's' : ''}` : `voyageur${i > 0 ? 's' : ''}`}</option>
                     ))}
                   </select>
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
                  <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <p className="text-xs font-bold uppercase text-gray-600">Services payants</p>
                    {activePaidServices.map((service) => {
                      const checked = selectedPaidServiceIds.includes(service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => setSelectedPaidServiceIds((prev) => checked ? prev.filter((id) => id !== service.id) : [...prev, service.id])}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${checked ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'}`}
                        >
                          <span>{service.label}</span>
                          <span className="font-semibold">{Number(service.prix || 0)} TND</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!isSaleProperty && (
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs font-bold uppercase text-gray-600 mb-2">Paiement</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setPaymentMode('avance')} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${paymentMode === 'avance' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-700'}`}>
                        Avance ({advancePercent}%)
                      </button>
                      <button type="button" onClick={() => setPaymentMode('totalite')} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${paymentMode === 'totalite' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-700'}`}>
                        Totalite
                      </button>
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
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors shadow-md mt-4"
                >
                  {isSaleProperty ? 'Demander une visite' : 'Reserver'}
                </button>
                <p className="text-center text-xs text-gray-500 mt-2">{isSaleProperty ? "Votre demande sera transmise a l'agence pour planification de visite" : "Aucun montant ne vous sera debite pour le moment"}</p>

                {!isSaleProperty && <div className="pt-4 border-t border-gray-100 space-y-2 text-sm text-gray-600">
                   <div className="flex justify-between">
                     <span className="underline">{property.pricePerNight} TND x {pricing.nights} nuits</span>
                     <span>{pricing.accommodationTotal} TND</span>
                   </div>
                   {pricing.cleaningFee > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Frais de ménage</span>
                       <span>{pricing.cleaningFee} TND</span>
                     </div>
                   )}
                   {pricing.serviceFee > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Frais de service</span>
                       <span>{pricing.serviceFee} TND</span>
                     </div>
                   )}
                   {pricing.extraMattressTotal > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Matelas supplementaires</span>
                       <span>{pricing.extraMattressTotal} TND</span>
                     </div>
                   )}
                   {pricing.paidServicesTotal > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Services payants</span>
                       <span>{pricing.paidServicesTotal} TND</span>
                     </div>
                   )}
                   {pricing.productsAccueilFee > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Produits d'accueil</span>
                       <span>{pricing.productsAccueilFee} TND</span>
                     </div>
                   )}
                   <div className="flex justify-between">
                     <span className="underline">Total frais supplementaires</span>
                     <span>{pricing.extrasTotal} TND</span>
                   </div>
                   <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100 mt-2">
                     <span>Montant total</span>
                     <span>{pricing.total} TND</span>
                   </div>
                   <div className="flex justify-between text-sm text-gray-600">
                     <span className="inline-flex items-center gap-1"><Wallet size={14} />A payer maintenant</span>
                     <span className="font-semibold text-gray-900">{paymentMode === 'totalite' ? pricing.total : Math.round((pricing.total * advancePercent) / 100)} TND</span>
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
                      to={`${otherProperty.detailPath || `/properties/${otherProperty.slug}`}${filterQueryString ? `?${filterQueryString}` : ''}`}
                      className="block bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 group/card"
                    >
                      <div className="relative h-48 overflow-hidden">
                        <img 
                          src={otherProperty.images[0]} 
                          alt={otherProperty.title}
                          className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500"
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
                          <span className="text-lg font-bold text-gray-900">{otherProperty.pricePerNight} TND</span>
                          <span className="text-gray-500 text-sm">{otherProperty.priceContext === 'sale' ? '/ vente' : '/ nuit'}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                          <span>{otherProperty.guests} voyageurs</span>
                          <span>Â·</span>
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
            {currentImageIndex + 1} / {property.images.length}
          </div>

          {/* Previous button - almost transparent */}
          <button 
            onClick={(e) => { e.stopPropagation(); prevImage(); }}
            className="absolute left-2 sm:left-4 md:left-8 z-50 p-3 text-white/30 hover:text-white/80 hover:bg-white/10 rounded-full transition-all duration-300"
          >
            <ChevronLeft size={40} strokeWidth={1.5} />
          </button>

          {/* Next button - almost transparent */}
          <button 
            onClick={(e) => { e.stopPropagation(); nextImage(); }}
            className="absolute right-2 sm:right-4 md:right-8 z-50 p-3 text-white/30 hover:text-white/80 hover:bg-white/10 rounded-full transition-all duration-300"
          >
            <ChevronRight size={40} strokeWidth={1.5} />
          </button>

          {/* Main image with smooth transition */}
          <div 
            className="relative w-full h-full flex items-center justify-center p-4 sm:p-8 md:p-16"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={property.images[currentImageIndex]} 
              alt={`${property.title} - ${currentImageIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-all duration-500 ease-out transform"
              style={{
                animation: 'fadeInScale 0.5s ease-out'
              }}
            />
          </div>

          {/* Thumbnail navigation */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 px-4 py-2 bg-black/50 rounded-full backdrop-blur-sm overflow-x-auto max-w-[90vw]">
            {property.images.map((img, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                className={`flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-lg overflow-hidden transition-all duration-300 ${
                  idx === currentImageIndex 
                    ? 'ring-2 ring-white scale-110' 
                    : 'opacity-50 hover:opacity-80'
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {showLoginPrompt && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-4" onClick={() => setShowLoginPrompt(false)}>
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
                onClick={() => setShowLoginPrompt(false)}
                className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                disabled={!providers.google}
                onClick={() => handlePromptSocialLogin('google')}
                className="inline-flex items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Globe className="h-5 w-5 text-emerald-700" />
                Continuer avec Google
              </button>
              <button
                type="button"
                disabled={!providers.facebook}
                onClick={() => handlePromptSocialLogin('facebook')}
                className="inline-flex items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Facebook className="h-5 w-5 text-blue-600" />
                Continuer avec Facebook
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-gray-500">
              La connexion WhatsApp est desactivee pour le moment. Utilisez Google ou Facebook pour continuer.
            </p>
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


