import { useEffect, useMemo, useState } from 'react';
import { Building2, Calendar, Check, Cigarette, Clock3, Eye, EyeOff, Lift, MapPin, Mountain, PawPrint, Route, ShieldCheck, Star, Trees, Users, Volume2, Wine } from 'lucide-react';
import { Bien, BienUiConfig, LocationSaisonniereConfig, Zone } from '../../admin/types';
import { toYouTubeEmbedUrl } from '../../utils/videoLinks';
import { Circle, CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import logo from '../../../assets/c9952e139aedea0af19c1652a89e92cb4378f1ac.png';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type FeatureApiRow = {
  id: string;
  nom: string;
  onglet_id?: string | null;
  type_caracteristique?: 'simple' | 'choix_multiple' | 'valeur' | null;
  unite?: string | null;
  visibilite_client?: number | null;
};

type LatLng = { lat: number; lng: number };
type NearbyPlace = { id: string; lat: number; lng: number; name: string; kind: 'cafe' | 'restaurant'; distanceKm: number };

type ToggleHandler = (type: 'section', key: string, nextValue: boolean) => void | Promise<void>;
type FeatureToggleHandler = (feature: FeatureApiRow, nextValue: boolean) => FeatureApiRow | null | void | Promise<FeatureApiRow | null | void>;

type Props = {
  bien: Bien;
  zones: Zone[];
  previewMode?: boolean;
  onToggleVisibility?: ToggleHandler;
  onToggleFeatureVisibility?: FeatureToggleHandler;
  togglingKey?: string | null;
  featureReloadKey?: number;
};

const FEATURE_LABELS: Record<string, string> = {
  proche_plage: 'Proche plage',
  chauffage_central: 'Chauffage central',
  climatisation: 'Climatisation',
  balcon: 'Balcon',
  terrasse: 'Terrasse',
  ascenseur: 'Ascenseur',
  vue_mer: 'Vue mer',
  gaz_ville: 'Gaz de ville',
  cuisine_equipee: 'Cuisine equipee',
  place_parking: 'Place parking',
  syndic: 'Syndic',
  meuble: 'Meuble',
  independant: 'Independant',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau SONEDE',
  electricite_steg: 'Electricite STEG',
  toilette: 'Toilette',
  reserve_local: 'Reserve',
  vitrine: 'Vitrine',
  coin_angle: "Coin d'angle",
  electricite_3_phases: 'Electricite 3 phases',
  alarme: 'Alarme',
};

const resolveMediaUrl = (url?: string | null) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = /^https?:\/\//i.test(API_URL)
    ? API_URL
    : (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : window.location.origin);
  const origin = new URL(base, window.location.origin).origin;
  return value.startsWith('/') ? `${origin}${value}` : value;
};

const normalizeFeatureName = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const formatMoney = (value?: number | null) => Number(value || 0).toLocaleString('fr-FR');
const isTruthy = (value: unknown) => value === true || value === 1 || value === '1';
const STANDING_LABELS: Record<string, string> = { economique: 'Economique', confort: 'Confort', premium: 'Premium', luxe: 'Luxe' };
const ETAGE_LABELS: Record<string, string> = { rdc: 'RDC', '1': '1', '2': '2', '3': '3', '4': '4', '5_plus': '5+' };
const VUE_LABELS: Record<string, string> = { mer: 'Vue mer', jardin: 'Vue jardin', ville: 'Vue ville', montagne: 'Vue montagne', sans_vue: 'Sans vue particuliere' };
const NIVEAU_SONORE_LABELS: Record<string, string> = { tres_calme: 'Tres calme', calme: 'Calme', moyen: 'Moyen', bruyant: 'Bruyant' };
const ACCES_LABELS: Record<string, string> = { tres_facile: 'Tres facile', facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
const ANNULATION_LABELS: Record<string, string> = { flexible: 'Flexible', moderee: 'Moderee', stricte: 'Stricte', non_remboursable: 'Non remboursable' };
const CAUTION_LABELS: Record<string, string> = { cash: 'Cash', preautorisation: 'Pre-autorisation', virement: 'Virement', aucune: 'Aucune' };
const FUMEURS_LABELS: Record<string, string> = { autorise: 'Autorise', interdit: 'Interdit', balcon_terrasse: 'Autorise sur balcon/terrasse' };
const ALCOOL_LABELS: Record<string, string> = { autorise: 'Autorise', interdit: 'Interdit' };
const ANIMAUX_LABELS: Record<string, string> = { autorises: 'Autorises', interdits: 'Interdits', sous_conditions: 'Autorises sous conditions' };

const isValidLatLng = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const haversineKm = (a: LatLng, b: LatLng) => {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(aa));
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
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }
  return null;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

const obfuscateLocation = (exact: LatLng, seed: string): LatLng => {
  const h = hashString(seed || 'dwira');
  const angle = (h % 360) * (Math.PI / 180);
  const distanceKm = 0.45 + ((h % 250) / 1000); // 450m -> 700m
  const latOffset = (distanceKm / 111) * Math.cos(angle);
  const lngOffset = (distanceKm / (111 * Math.cos(toRad(exact.lat)))) * Math.sin(angle);
  const candidate = { lat: exact.lat + latOffset, lng: exact.lng + lngOffset };
  return isValidLatLng(candidate.lat, candidate.lng) ? candidate : exact;
};

export default function LocationPublicBienPageView({
  bien,
  zones,
  previewMode = false,
  onToggleVisibility,
  onToggleFeatureVisibility,
  togglingKey = null,
  featureReloadKey = 0,
}: Props) {
  const [allFeatures, setAllFeatures] = useState<FeatureApiRow[]>([]);
  const [displayLocation, setDisplayLocation] = useState<LatLng | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const uiConfig: BienUiConfig = bien.ui_config || {};
  const selectedZone = useMemo(() => zones.find((item) => item.id === bien.zone_id), [zones, bien.zone_id]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const base = String(API_URL || '').replace(/\/+$/, '');
        const normalizedBase = base.replace(/\/api$/i, '');
        const currentMode = encodeURIComponent(String(bien.mode || 'location_saisonniere'));
        const currentType = encodeURIComponent(String(bien.type || 'appartement'));
        const currentBienId = encodeURIComponent(String(bien.id || ''));
        const urls = [
          `${base}/caracteristiques?mode_bien=${currentMode}&type_bien=${currentType}&bien_id=${currentBienId}`,
          `${normalizedBase}/api/caracteristiques?mode_bien=${currentMode}&type_bien=${currentType}&bien_id=${currentBienId}`,
        ];
        let response: Response | null = null;
        for (const url of Array.from(new Set(urls))) {
          const next = await fetch(url);
          response = next;
          if (next.ok || next.status !== 404) break;
        }
        const rows = response?.ok ? await response.json() : [];
        if (!disposed) setAllFeatures(Array.isArray(rows) ? rows : []);
      } catch {
        if (!disposed) setAllFeatures([]);
      }
    };
    void load();
    return () => { disposed = true; };
  }, [bien.id, bien.mode, bien.type, featureReloadKey]);

  const images = (bien.media || []).filter((item) => item.type !== 'video').map((item) => resolveMediaUrl(item.url)).filter(Boolean);
  const videos = (bien.media || []).filter((item) => item.type === 'video').map((item) => String(item.url || '').trim()).filter(Boolean);
  const zoneName = selectedZone?.nom || 'Zone non definie';
  const selectedFeatureIds = new Set((Array.isArray(bien.caracteristique_ids) ? bien.caracteristique_ids : []).map((item) => String(item)));
  const selectedFeatureNames = new Set((Array.isArray(bien.caracteristiques) ? bien.caracteristiques : []).map((item) => normalizeFeatureName(String(item))));
  const selectedFeatures = allFeatures.filter((item) => selectedFeatureIds.has(String(item.id || '')) || selectedFeatureNames.has(normalizeFeatureName(String(item.nom || ''))));
  const visibleSelectedFeatures = selectedFeatures.filter((item) => Number(item.visibilite_client) !== 0 && String(item.onglet_id || '').trim().length > 0);
  const booleanFeatureTags = Object.entries(FEATURE_LABELS)
    .filter(([key]) => isTruthy((bien as unknown as Record<string, unknown>)[key]))
    .map(([, label]) => label)
    .filter((label) => !selectedFeatures.some((item) => normalizeFeatureName(String(item.nom || '')) === normalizeFeatureName(label)));

  const isVisible = (key: keyof BienUiConfig | string) => (uiConfig as Record<string, unknown>)[key] !== false;
  const busyToggle = (key: string) => togglingKey === key;

  const sectionToggle = (key: string) => {
    if (!previewMode || !onToggleVisibility) return null;
    const visible = isVisible(key);
    return (
      <button
        type="button"
        disabled={busyToggle(`section:${key}`)}
        onClick={() => void onToggleVisibility('section', key, !visible)}
        className={`inline-flex h-8 shrink-0 self-center items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${visible ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-gray-300 text-gray-600 bg-white'} disabled:opacity-60`}
      >
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {visible ? 'Visible' : 'Masque'}
      </button>
    );
  };

  const featureToggle = (feature: FeatureApiRow) => {
    if (!previewMode || !onToggleFeatureVisibility) return null;
    const visible = Number(feature.visibilite_client) !== 0;
    return (
      <button
        type="button"
        disabled={busyToggle(`feature:${feature.id}`)}
        onClick={() => void onToggleFeatureVisibility(feature, !visible)}
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${visible ? 'border-emerald-300 bg-white text-emerald-700' : 'border-gray-300 bg-gray-100 text-gray-500'} disabled:opacity-60`}
        title={visible ? 'Masquer cette caracteristique' : 'Afficher cette caracteristique'}
      >
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    );
  };

  const amenityRows = previewMode
    ? selectedFeatures.filter((item) => String(item.onglet_id || '').trim().length > 0)
    : visibleSelectedFeatures;
  const showBookingCard = isVisible('show_booking_card') && isVisible('show_tarification_publique');

  useEffect(() => {
    let cancelled = false;

    const geocodeFromZone = async (): Promise<LatLng | null> => {
      const q = [
        selectedZone?.quartier,
        selectedZone?.region,
        selectedZone?.gouvernerat,
        selectedZone?.pays,
        selectedZone?.nom,
      ].map((item) => String(item || '').trim()).filter(Boolean).join(', ');
      if (!q) return null;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        console.debug('[LocationMapDebug] nominatim:response', { zoneId: selectedZone?.id, query: q, ok: response.ok, status: response.status });
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
      const parsed = parseGoogleMapsLatLng(selectedZone?.google_maps_url);
      console.debug('[LocationMapDebug] parseMaps', {
        bienId: bien.id,
        zoneId: selectedZone?.id,
        zoneName: selectedZone?.nom,
        mapsLink: String(selectedZone?.google_maps_url || ''),
        parsed,
      });
      const exact = parsed || await geocodeFromZone();
      if (cancelled) return;
      if (!exact) {
        console.debug('[LocationMapDebug] location:missing', { bienId: bien.id, zoneId: selectedZone?.id });
        setDisplayLocation(null);
        setNearbyPlaces([]);
        return;
      }
      const approx = obfuscateLocation(exact, `${bien.id || ''}-${selectedZone?.id || ''}`);
      console.debug('[LocationMapDebug] location:resolved', { bienId: bien.id, zoneId: selectedZone?.id, exact, approx });
      setDisplayLocation(approx);
    };

    void load();
    return () => { cancelled = true; };
  }, [selectedZone?.google_maps_url, selectedZone?.quartier, selectedZone?.region, selectedZone?.gouvernerat, selectedZone?.pays, selectedZone?.nom, selectedZone?.id, bien.id]);

  useEffect(() => {
    let cancelled = false;
    const loadNearby = async () => {
      if (!effectiveMapCenter) {
        console.debug('[LocationMapDebug] nearby:skip', { reason: 'no_map_center', bienId: bien.id, zoneId: selectedZone?.id });
        setNearbyPlaces([]);
        return;
      }
      const query = `
[out:json][timeout:12];
(
  node["amenity"="cafe"](around:1800,${effectiveMapCenter.lat},${effectiveMapCenter.lng});
  node["amenity"="restaurant"](around:1800,${effectiveMapCenter.lat},${effectiveMapCenter.lng});
);
out body 20;
`;
      try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: query,
        });
        console.debug('[LocationMapDebug] nearby:response', { ok: response.ok, status: response.status, bienId: bien.id, zoneId: selectedZone?.id });
        if (!response.ok) throw new Error('overpass_failed');
        const payload = await response.json();
        if (cancelled) return;
        const items = (Array.isArray(payload?.elements) ? payload.elements : [])
          .map((item: any) => {
            const lat = Number(item?.lat);
            const lng = Number(item?.lon);
            if (!isValidLatLng(lat, lng)) return null;
            const name = String(item?.tags?.name || '').trim();
            if (!name) return null;
            const amenity = String(item?.tags?.amenity || '').trim();
            if (amenity !== 'cafe' && amenity !== 'restaurant') return null;
            return {
              id: String(item?.id || `${lat}-${lng}`),
              lat,
              lng,
              name,
              kind: amenity as 'cafe' | 'restaurant',
              distanceKm: haversineKm(effectiveMapCenter, { lat, lng }),
            } as NearbyPlace;
          })
          .filter(Boolean)
          .sort((a: NearbyPlace, b: NearbyPlace) => a.distanceKm - b.distanceKm)
          .slice(0, 6);
        console.debug('[LocationMapDebug] nearby:loaded', { count: items.length, sample: items.slice(0, 3) });
        setNearbyPlaces(items);
      } catch {
        console.debug('[LocationMapDebug] nearby:error', { bienId: bien.id, zoneId: selectedZone?.id });
        if (!cancelled) setNearbyPlaces([]);
      }
    };

    void loadNearby();
    return () => { cancelled = true; };
  }, [effectiveMapCenter?.lat, effectiveMapCenter?.lng]);

  const fallbackApproxLocation = useMemo<LatLng>(() => {
    const seed = `${selectedZone?.id || ''}-${selectedZone?.nom || ''}-${bien.id || ''}`;
    const h = hashString(seed || 'kelibia');
    const baseLat = 36.847;
    const baseLng = 11.093;
    const latJitter = ((h % 240) - 120) / 1000;
    const lngJitter = ((((h / 7) | 0) % 240) - 120) / 1000;
    return { lat: baseLat + latJitter, lng: baseLng + lngJitter };
  }, [selectedZone?.id, selectedZone?.nom, bien.id]);
  const effectiveMapCenter = displayLocation || (selectedZone ? fallbackApproxLocation : null);

  useEffect(() => {
    console.debug('[LocationMapDebug] renderState', {
      bienId: bien.id,
      zoneId: selectedZone?.id,
      zoneName: selectedZone?.nom,
      hasMapsUrl: Boolean(String(selectedZone?.google_maps_url || '').trim()),
      displayLocation,
      fallbackApproxLocation,
      effectiveMapCenter,
    });
  }, [bien.id, selectedZone?.id, selectedZone?.nom, selectedZone?.google_maps_url, displayLocation, fallbackApproxLocation, effectiveMapCenter]);

  const block = (key: string, title: string, content: React.ReactNode, className = '') => {
    const visible = isVisible(key);
    if (!visible && !previewMode) return null;
    if (!visible && previewMode) {
      return (
        <div className={`rounded-2xl border border-dashed border-gray-300 bg-white p-6 ${className}`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-500">{title}</h3>
            {sectionToggle(key)}
          </div>
          <p className="mt-3 text-sm text-gray-500">Bloc masque sur la page client.</p>
        </div>
      );
    }
    return <div className={className}>{content}</div>;
  };

  return (
    <div className="bg-white pt-24 pb-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-sm text-gray-500 mb-6">
          <span>Accueil</span>
          <span className="mx-2">/</span>
          <span>Logements</span>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{bien.titre}</span>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{bien.titre}</h1>
            <div className="flex items-center gap-4 text-gray-600 text-sm">
              <div className="flex items-center gap-1"><MapPin size={16} /><span>{zoneName}</span></div>
              <div className="flex items-center gap-1"><Star size={16} className="text-amber-500 fill-current" /><span className="font-medium text-gray-900">5,0</span><span>(33 avis)</span></div>
            </div>
          </div>
          {previewMode ? sectionToggle('show_booking_card') : null}
        </div>

        {images.length > 0 ? block('show_gallery', 'Galerie', (
          <div className="mb-12">
            <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 h-[500px] rounded-xl overflow-hidden">
              <div className="col-span-2 row-span-2"><img src={images[0] || ''} alt={bien.titre} className="w-full h-full object-cover" /></div>
              {[1, 2, 3].map((index) => <div key={index} className="col-span-1 row-span-1"><img src={images[index] || images[0] || ''} alt={`${bien.titre} ${index + 1}`} className="w-full h-full object-cover" /></div>)}
              <div className="col-span-1 row-span-1 relative"><img src={images[4] || images[0] || ''} alt={`${bien.titre} 5`} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/30 flex items-center justify-center"><span className="text-white font-semibold text-lg">Voir tout</span></div></div>
            </div>
            <div className="md:hidden rounded-xl overflow-hidden shadow-lg relative"><img src={images[0] || ''} alt={bien.titre} className="w-full h-[250px] object-cover" /></div>
            {previewMode ? <div className="mt-4 flex justify-start">{sectionToggle('show_gallery')}</div> : null}
          </div>
        )) : null}

        {videos.length > 0 && (
          <div className="mb-12 rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-xl font-bold text-gray-900">Video</h3>
              {previewMode ? sectionToggle('show_gallery') : null}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {videos.map((videoUrl, index) => (
                <iframe
                  key={`${videoUrl}-${index}`}
                  src={toYouTubeEmbedUrl(videoUrl) || ''}
                  title={`${bien.titre} video ${index + 1}`}
                  className="w-full h-[240px] md:h-[360px] rounded-2xl bg-black"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            {block('show_informations_generales', 'Informations generales', (
              <div className="py-6 border-b border-gray-100">
                <div className="flex justify-between items-center gap-3 mb-6">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Logement entier : {bien.configuration || bien.type}</h2>
                    <div className="flex gap-4 text-gray-600 text-sm">
                      <span className="font-medium text-emerald-700">{Math.max((bien.nb_chambres || 0) + 1, 1)} voyageurs max</span>
                      <span>·</span>
                      <span>{bien.nb_chambres || 0} chambres</span>
                      <span>·</span>
                      <span>{bien.nb_salle_bain || 0} salles de bain</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full p-1.5 bg-gradient-to-br from-emerald-50 to-emerald-200 ring-1 ring-emerald-200 shadow-sm flex items-center justify-center">
                      <img src={logo} alt="Logo Dwira" className="w-full h-full rounded-full bg-white object-contain p-1" />
                    </div>
                    {sectionToggle('show_informations_generales')}
                  </div>
                </div>
                <div className="pb-8 border-b border-gray-100">
                  <h3 className="text-xl font-bold mb-4">A propos de ce logement</h3>
                  <p className="text-gray-600 leading-relaxed whitespace-pre-line">{bien.description || `Superbe ${bien.type}`}</p>
                </div>
              </div>
            ), 'border-b border-gray-100')}

            {block('show_caracteristiques', 'Caracteristiques', (
              <div className="py-8 border-b border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <h3 className="text-xl font-bold">Ce que propose ce logement</h3>
                  {sectionToggle('show_caracteristiques')}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {amenityRows.map((feature) => (
                    <div key={feature.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${Number(feature.visibilite_client) === 0 ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-transparent text-gray-700'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                          <Check size={16} className="text-emerald-600" />
                        </div>
                        <span>{feature.nom}</span>
                      </div>
                      {featureToggle(feature)}
                    </div>
                  ))}
                  {booleanFeatureTags.map((feature) => (
                    <div key={feature} className="flex items-center gap-3 text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                        <Check size={16} className="text-emerald-600" />
                      </div>
                      <span>{feature}</span>
                    </div>
                  ))}
                  {amenityRows.length === 0 && booleanFeatureTags.length === 0 ? <p className="text-sm text-gray-500">Aucune caracteristique visible.</p> : null}
                </div>
              </div>
            ))}

            {block('show_localisation', 'Localisation', (
              <div className="py-8 border-b border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <h3 className="text-xl font-bold">Ou se situe le logement</h3>
                  {sectionToggle('show_localisation')}
                </div>
                {effectiveMapCenter ? (
                  <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                    <div className="h-[320px] relative">
                      <MapContainer
                        center={[effectiveMapCenter.lat, effectiveMapCenter.lng]}
                        zoom={13}
                        scrollWheelZoom={false}
                        className="h-full w-full"
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Circle
                          center={[effectiveMapCenter.lat, effectiveMapCenter.lng]}
                          radius={700}
                          pathOptions={{ color: '#059669', weight: 1.5, fillColor: '#10b981', fillOpacity: 0.12 }}
                        />
                        <CircleMarker
                          center={[effectiveMapCenter.lat, effectiveMapCenter.lng]}
                          radius={9}
                          pathOptions={{ color: '#065f46', weight: 2, fillColor: '#10b981', fillOpacity: 1 }}
                        />
                        {nearbyPlaces.map((place) => (
                          <CircleMarker
                            key={place.id}
                            center={[place.lat, place.lng]}
                            radius={5}
                            pathOptions={{
                              color: place.kind === 'cafe' ? '#1d4ed8' : '#b45309',
                              weight: 1.5,
                              fillColor: place.kind === 'cafe' ? '#3b82f6' : '#f59e0b',
                              fillOpacity: 0.9,
                            }}
                          />
                        ))}
                      </MapContainer>
                    </div>
                    <div className="border-t border-gray-100 p-4">
                      {!displayLocation ? <p className="mb-2 text-xs text-gray-500">Position approximative de la zone.</p> : null}
                      {nearbyPlaces.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {nearbyPlaces.slice(0, 4).map((place) => (
                            <span
                              key={`nearby-${place.id}`}
                              className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                            >
                              {place.kind === 'cafe' ? 'Cafe' : 'Restaurant'}: {place.name} (~{place.distanceKm.toFixed(1)} km)
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">Commodites proches: cafes et restaurants dans le quartier.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-xl h-[300px] flex items-center justify-center relative overflow-hidden">
                    <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=1600&auto=format&fit=crop" alt="Map" className="w-full h-full object-cover opacity-50 grayscale" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-white p-4 rounded-full shadow-lg"><MapPin size={32} className="text-emerald-600" /></div>
                    </div>
                  </div>
                )}
                <p className="mt-4 text-gray-600 text-sm">L'emplacement exact sera communique apres la reservation.</p>
              </div>
            ))}

            {block('show_disponibilites', 'Disponibilites', (
              <div className="py-8 border-t border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-2"><Calendar size={24} className="text-emerald-600" /><h3 className="text-xl font-bold">Disponibilites</h3></div>
                  {sectionToggle('show_disponibilites')}
                </div>
                <p className="text-gray-600 mb-6">Selectionnez vos dates pour voir les disponibilites et reserver votre sejour.</p>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">Calendrier client</div>
              </div>
            ))}
          </div>

          {block('show_booking_card', 'Reservation', (
            <div className="lg:col-span-1">
              <div className="sticky top-24 bg-white rounded-xl shadow-xl border border-gray-100 p-6">
                <div className="flex justify-between items-baseline mb-6">
                  <div>
                    <span className="text-2xl font-bold text-gray-900">{formatMoney(bien.prix_nuitee)} TND</span>
                    <span className="text-gray-500"> / nuit</span>
                  </div>
                  <div className="flex items-center gap-2">{sectionToggle('show_booking_card')}</div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Arrivee</label><input type="text" value="jj/mm/aaaa" readOnly className="w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-500" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Depart</label><input type="text" value="jj/mm/aaaa" readOnly className="w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-500" /></div>
                  </div>
                  <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Voyageurs</label><div className="w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-700">1 voyageur</div></div>
                  <button type="button" className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-white font-semibold">Reserver</button>
                </div>
              </div>
            </div>
          ), 'lg:col-span-1')}
        </div>
      </div>
    </div>
  );
}
