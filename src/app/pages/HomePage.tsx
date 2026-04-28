import { useState, useRef, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Search, MapPin, Calendar, ArrowRight, Star, Key, X, ChevronLeft, ChevronRight, Home, Check, Waves, Wind, SlidersHorizontal } from "lucide-react";
import { useProperties } from "../context/PropertiesContext";
import { PropertyCard } from "../components/PropertyCard";
import { Zone } from "../admin/types";
import { motion } from "framer-motion";
import logo from "../../assets/c9952e139aedea0af19c1652a89e92cb4378f1ac.png";
import ComingSoonState from "../components/ComingSoonState";
import { PUBLIC_COMING_SOON } from "../config/publicAvailability";
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

type ListingMode = "vente" | "location_annuelle" | "location_saisonniere";
type PropertyMainType = "appartement" | "villa_maison" | "studio" | "immeuble" | "autre";
type HomeSeasideOptionKey = "pied_dans_eau" | "vue_sur_mer" | "pres_plage";
type HomeComfortOptionKey =
  | "climatise"
  | "piscine_privee"
  | "piscine_partagee"
  | "rdc"
  | "toutes_pieces_climatisees"
  | "jardin_gazon"
  | "terrasse";
const MODE_TABS: Array<{ value: ListingMode; label: string; comingSoon?: boolean }> = [
  { value: "location_saisonniere", label: "Location saisonniere", comingSoon: false },
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
  toutes_pieces_climatisees: "Toutes les pieces climatisees",
  jardin_gazon: "Jardin / Gazon",
  terrasse: "Terrasse",
};
const SEASIDE_OPTION_KEYS: HomeSeasideOptionKey[] = ["pied_dans_eau", "vue_sur_mer", "pres_plage"];
const COMFORT_OPTION_KEYS: HomeComfortOptionKey[] = [
  "climatise",
  "toutes_pieces_climatisees",
  "rdc",
  "jardin_gazon",
  "terrasse",
  "piscine_privee",
  "piscine_partagee",
];
const POOL_OPTION_KEYS: HomeComfortOptionKey[] = ["piscine_privee", "piscine_partagee"];

const getMainTypeFromCategory = (category: string): PropertyMainType => {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized.includes("appartement")) return "appartement";
  if (normalized.startsWith("s+")) return "appartement";
  if (normalized.includes("villa")) return "villa_maison";
  if (normalized.includes("studio")) return "studio";
  if (normalized.includes("immeuble")) return "immeuble";
  return "autre";
};
const getCanonicalSubTypeKey = (value?: string | null) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const sPlusMatch = raw.match(/s\+\d+/);
  if (sPlusMatch?.[0]) return sPlusMatch[0];
  return raw.replace(/\s+/g, " ");
};

export default function HomePage() {
  // Use shared context for properties
  const { properties, zones, modePriorities, loading } = useProperties();
  
  const navigate = useNavigate();
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
  
  // Filter states
  const [location, setLocation] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedMainType, setSelectedMainType] = useState<PropertyMainType | "">("");
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSeasideDropdown, setShowSeasideDropdown] = useState(false);
  const [showComfortDropdown, setShowComfortDropdown] = useState(false);
  const [typeSelectionStep, setTypeSelectionStep] = useState<"main" | "sub">("main");
  const [draftMainType, setDraftMainType] = useState<PropertyMainType | "">("");
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [typeFilterImageRows, setTypeFilterImageRows] = useState<Array<{ mode_bien: string; main_type: string; sub_type: string | null; image_url: string }>>([]);
  const [homeFilterOptionImageRows, setHomeFilterOptionImageRows] = useState<Array<{ mode_bien: string; filter_group: string; option_key: string; image_url: string }>>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ListingMode>("location_saisonniere");
  const [locationPays, setLocationPays] = useState("Tunisie");
  const [locationGouvernerat, setLocationGouvernerat] = useState("");
  const [locationRegion, setLocationRegion] = useState("");
  const [locationZone, setLocationZone] = useState("");
  const [selectedSeasideOptions, setSelectedSeasideOptions] = useState<HomeSeasideOptionKey[]>([]);
  const [selectedComfortOptions, setSelectedComfortOptions] = useState<HomeComfortOptionKey[]>([]);

  const today = startOfDay(new Date());
  const orderedModeTabs = useMemo(
    () =>
      [...MODE_TABS].sort(
        (a, b) => (modePriorities[a.value] || 99) - (modePriorities[b.value] || 99)
      ),
    [modePriorities]
  );
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
          .filter((zone) => !locationPays || String(zone.pays || "").trim() === locationPays)
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
              (!locationPays || String(zone.pays || "").trim() === locationPays)
              && (!locationGouvernerat || String(zone.gouvernerat || "").trim() === locationGouvernerat)
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
              (!locationPays || String(zone.pays || "").trim() === locationPays)
              && (!locationGouvernerat || String(zone.gouvernerat || "").trim() === locationGouvernerat)
              && (!locationRegion || String(zone.region || "").trim() === locationRegion)
          )
          .map((zone) => String(zone.quartier || zone.nom || "").trim())
          .filter(Boolean)
      ),
    [normalizedZones, locationPays, locationGouvernerat, locationRegion]
  );
  const resolveZoneImageUrl = (url?: string | null) => {
    const value = String(url || '').trim();
    if (!value) return ZONE_FALLBACK_IMAGE;
    if (/^https?:\/\//i.test(value)) return value;
    return value.startsWith('/') ? `${window.location.origin}${value}` : value;
  };
  const resolveTypeImageUrl = (url?: string | null) => {
    const value = String(url || '').trim();
    if (!value) return TYPE_FALLBACK_IMAGE;
    if (/^https?:\/\//i.test(value)) return value;
    return value.startsWith('/') ? `${window.location.origin}${value}` : value;
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
    setLocationPays("");
    setLocationGouvernerat("");
    setLocationRegion("");
    setLocationZone("");
  };
  const confirmLocationSelection = () => {
    const selectedValue =
      String(locationZone || '').trim()
      || String(locationRegion || '').trim()
      || String(locationGouvernerat || '').trim()
      || String(locationPays || '').trim();
    setLocation(selectedValue);
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
  const selectedSeasideSummary = selectedSeasideOptions.length > 0
    ? selectedSeasideOptions.map((key) => SEASIDE_OPTION_LABELS[key]).join(", ")
    : "Bord de mer";
  const selectedComfortSummary = selectedComfortOptions.length > 0
    ? selectedComfortOptions.map((key) => COMFORT_OPTION_LABELS[key]).join(", ")
    : "Confort";
  const selectedSeasideImage = selectedSeasideOptions.length > 0
    ? getHomeFilterOptionImage("seaside", selectedSeasideOptions[0])
    : null;
  const selectedComfortImage = selectedComfortOptions.length > 0
    ? getHomeFilterOptionImage("comfort", selectedComfortOptions[0])
    : null;
  const confirmCalendarSelection = () => {
    setShowLocationDropdown(false);
    setShowCalendar(false);
    openCategoryDropdown();
    setShowSeasideDropdown(false);
    setShowComfortDropdown(false);
  };
  const selectedLocationImages = useMemo(() => {
    const pickImage = (items: Zone[], field: 'pays_image_url' | 'gouvernerat_image_url' | 'region_image_url' | 'quartier_image_url' | 'image_url') =>
      items.find((item) => String(item[field] || '').trim())?.[field] || null;

    const paysImage = locationPays
      ? pickImage(normalizedZones.filter((zone) => String(zone.pays || '').trim() === locationPays), 'pays_image_url')
      : null;
    const gouverneratImage = locationGouvernerat
      ? pickImage(
          normalizedZones.filter(
            (zone) =>
              (!locationPays || String(zone.pays || '').trim() === locationPays)
              && String(zone.gouvernerat || '').trim() === locationGouvernerat
          ),
          'gouvernerat_image_url'
        )
      : null;
    const regionImage = locationRegion
      ? pickImage(
          normalizedZones.filter(
            (zone) =>
              (!locationPays || String(zone.pays || '').trim() === locationPays)
              && (!locationGouvernerat || String(zone.gouvernerat || '').trim() === locationGouvernerat)
              && String(zone.region || '').trim() === locationRegion
          ),
          'region_image_url'
        )
      : null;
    const zoneImage = locationZone
      ? pickImage(
          normalizedZones.filter(
            (zone) =>
              (!locationPays || String(zone.pays || '').trim() === locationPays)
              && (!locationGouvernerat || String(zone.gouvernerat || '').trim() === locationGouvernerat)
              && (!locationRegion || String(zone.region || '').trim() === locationRegion)
              && String(zone.quartier || zone.nom || '').trim() === locationZone
          ),
          'quartier_image_url'
        )
      : null;

    return {
      pays: paysImage,
      gouvernerat: gouverneratImage,
      region: regionImage,
      zone: zoneImage || pickImage(
        normalizedZones.filter(
          (zone) =>
            (!locationPays || String(zone.pays || '').trim() === locationPays)
            && (!locationGouvernerat || String(zone.gouvernerat || '').trim() === locationGouvernerat)
            && (!locationRegion || String(zone.region || '').trim() === locationRegion)
            && (!locationZone || String(zone.quartier || zone.nom || '').trim() === locationZone)
        ),
        'image_url'
      ),
    };
  }, [normalizedZones, locationPays, locationGouvernerat, locationRegion, locationZone]);
  const availableTypeOptions = useMemo(() => {
    const modeProperties = properties.filter((property) => (property.mode || "location_saisonniere") === selectedMode);
    const byCategory = new Map<string, { label: string; imageUrl: string }>();
    for (const property of modeProperties) {
      const category = String(property.category || '').trim();
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
  }, [properties, selectedMode, typeFilterImageRows]);
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

    // 3) Complete with sub-types inferred from published properties (fallback when admin row missing).
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
      .filter((group) => group.subTypes.length > 0 || group.imageUrl !== TYPE_FALLBACK_IMAGE)
      .sort((a, b) => MAIN_TYPE_DISPLAY_ORDER.indexOf(a.mainType) - MAIN_TYPE_DISPLAY_ORDER.indexOf(b.mainType));
  }, [availableTypeOptions, selectedMode, typeFilterImageRows]);
  const secondaryTypeOptions = useMemo(() => {
    if (!selectedMainType) return availableTypeOptions;
    const selectedGroup = groupedTypeOptions.find((group) => group.mainType === selectedMainType);
    return selectedGroup?.subTypes || [];
  }, [availableTypeOptions, groupedTypeOptions, selectedMainType]);
  const draftSecondaryTypeOptions = useMemo(() => {
    if (!draftMainType) return availableTypeOptions;
    const selectedGroup = groupedTypeOptions.find((group) => group.mainType === draftMainType);
    return selectedGroup?.subTypes || [];
  }, [availableTypeOptions, groupedTypeOptions, draftMainType]);
  const selectedMainTypeLabel = selectedMainType ? MAIN_TYPE_LABELS[selectedMainType] : "";
  const selectedTypeSummaryText = selectedMainTypeLabel
    ? (selectedCategories.length > 0 ? `${selectedMainTypeLabel} • ${selectedCategories.join(", ")}` : selectedMainTypeLabel)
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
    if (selectedMainType) {
      const group = groupedTypeOptions.find((item) => item.mainType === selectedMainType);
      return group?.imageUrl || null;
    }
    return null;
  }, [availableTypeOptions, groupedTypeOptions, selectedCategories, selectedMainType, selectedMode, typeFilterImageRows]);

  useEffect(() => {
    if (!locationPays && cascadePaysOptions.some((item) => item.toLowerCase() === 'tunisie')) {
      setLocationPays('Tunisie');
    }
  }, [cascadePaysOptions, locationPays]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/type-filter-images?mode=${encodeURIComponent(selectedMode)}`);
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

  useEffect(() => {
    const allowed = new Set(availableTypeOptions.map((item) => item.label));
    setSelectedCategories((prev) => prev.filter((cat) => allowed.has(cat)));
    const mainTypeAllowed = new Set(groupedTypeOptions.map((item) => item.mainType));
    setSelectedMainType((prev) => {
      return prev && mainTypeAllowed.has(prev) ? prev : "";
    });
  }, [availableTypeOptions, groupedTypeOptions]);

  useEffect(() => {
    if (!selectedMainType) return;
    const allowedSecondary = new Set(secondaryTypeOptions.map((item) => item.label));
    setSelectedCategories((prev) => prev.filter((cat) => allowedSecondary.has(cat)));
  }, [selectedMainType, secondaryTypeOptions]);

  useEffect(() => {
    if (loading) {
      return;
    }
    const requestedMode = searchParams.get("mode");
    if (requestedMode === "vente" || requestedMode === "location_annuelle" || requestedMode === "location_saisonniere") {
      const requestedTab = orderedModeTabs.find((tab) => tab.value === requestedMode);
      if (requestedTab && !requestedTab.comingSoon) {
        setSelectedMode(requestedMode);
        return;
      }
    }
    const defaultMode = orderedModeTabs.find((tab) => !tab.comingSoon)?.value || "location_saisonniere";
    setSelectedMode(defaultMode);
    const next = new URLSearchParams(searchParams);
    if (next.get("mode") !== defaultMode) {
      next.set("mode", defaultMode);
      setSearchParams(next, { replace: true });
    }
  }, [loading, orderedModeTabs, searchParams, setSearchParams]);

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const openCategoryDropdown = () => {
    setDraftMainType(selectedMainType);
    setDraftCategories(selectedCategories);
    setTypeSelectionStep(selectedMainType ? "sub" : "main");
    setShowCategoryDropdown(true);
  };
  const chooseDraftMainType = (mainType: PropertyMainType) => {
    setDraftMainType(mainType);
    setDraftCategories([]);
    setTypeSelectionStep("sub");
  };
  const toggleDraftCategory = (cat: string) => {
    setDraftCategories((prev) => (prev.includes(cat) ? [] : [cat]));
  };
  const confirmTypeSelection = () => {
    setSelectedMainType(draftMainType);
    setSelectedCategories(draftCategories);
    setShowCategoryDropdown(false);
    setShowSeasideDropdown(true);
    setShowComfortDropdown(false);
  };
  const toggleSeasideOption = (key: HomeSeasideOptionKey) => {
    setSelectedSeasideOptions((prev) => (prev.includes(key) ? [] : [key]));
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

  const handleSearch = () => {
    setHasSearched(true);
    
    const params = new URLSearchParams();
    params.set("mode", selectedMode);
    if (location) params.set("location", location);
    if (selectedMainType) params.set("mainType", selectedMainType);
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
    if (checkIn) params.set("checkIn", format(checkIn, 'yyyy-MM-dd'));
    if (checkOut) params.set("checkOut", format(checkOut, 'yyyy-MM-dd'));
    
    navigate(selectedMode === "vente" ? `/ventes` : `/logements?${params.toString()}`);
    
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const filteredProperties = useMemo(() => {
    const modeProperties = properties.filter((property) => (property.mode || "location_saisonniere") === selectedMode);
    const baseProperties = hasSearched
      ? modeProperties.filter((property) => {
          const matchLocation = !location || property.location.toLowerCase().includes(location.toLowerCase());
          const propertyMainType = getMainTypeFromCategory(String(property.category || ""));
          const matchMainType = !selectedMainType || propertyMainType === selectedMainType;
          const matchSubType = selectedCategories.length === 0 || selectedCategories.includes(property.category);
          const textBlob = normalizeSearchToken(
            [
              property.title,
              property.description,
              property.location,
              property.category,
              ...(Array.isArray(property.amenities) ? property.amenities : []),
            ].join(" ")
          );
          const hasAny = (...tokens: string[]) => tokens.some((token) => textBlob.includes(normalizeSearchToken(token)));
          const matchSeaside = selectedSeasideOptions.every((option) => {
            if (option === "pied_dans_eau") return hasAny("pied dans l eau", "front de mer", "bord de mer", "acces direct plage");
            if (option === "vue_sur_mer") return property.seasonalConfig?.vue === "mer" || hasAny("vue sur mer", "vue mer");
            if (option === "pres_plage") return hasAny("proche plage", "pres de la plage", "a quelques pas de la plage", "plage");
            return true;
          });
          const matchComfort = selectedComfortOptions.every((option) => {
            if (option === "climatise") return hasAny("climatise", "climatisation");
            if (option === "toutes_pieces_climatisees") {
              return hasAny(
                "toutes les pieces climatisees",
                "toutes pieces climatisees",
                "climatisation complete",
                "climatisation dans toutes les pieces"
              );
            }
            if (option === "piscine_privee") return hasAny("piscine privee");
            if (option === "piscine_partagee") return hasAny("piscine partagee", "piscine commune", "piscine collective");
            if (option === "rdc") {
              return property.seasonalConfig?.etage === "rdc" || hasAny("rdc", "rez de chaussee", "rez-de-chaussee", "ground floor");
            }
            if (option === "jardin_gazon") return hasAny("jardin", "gazon", "pelouse", "espace vert");
            if (option === "terrasse") return hasAny("terrasse");
            return true;
          });
          return matchLocation && matchMainType && matchSubType && matchSeaside && matchComfort;
        })
      : modeProperties;

    return [...baseProperties].sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return b.rating - a.rating;
    });
  }, [hasSearched, location, selectedMainType, selectedCategories, selectedSeasideOptions, selectedComfortOptions, properties, selectedMode]);

  const dateRangeText = () => {
    if (checkIn && checkOut) {
      return `${format(checkIn, "d MMM", { locale: fr })} - ${format(checkOut, "d MMM yyyy", { locale: fr })}`;
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
  const handleOpenAdvancedFilters = () => {
    const params = new URLSearchParams();
    const logementsMode = selectedMode === "location_annuelle" ? "location_annuelle" : "location_saisonniere";
    params.set("mode", logementsMode);
    if (location) params.set("location", location);
    if (selectedMainType) params.set("mainType", selectedMainType);
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
    if (checkIn) params.set("checkIn", format(checkIn, 'yyyy-MM-dd'));
    if (checkOut) params.set("checkOut", format(checkOut, 'yyyy-MM-dd'));
    navigate(`/logements?${params.toString()}`);
  };
  const selectedLocationWidgetImage =
    selectedLocationImages.zone
    || selectedLocationImages.region
    || selectedLocationImages.gouvernerat
    || selectedLocationImages.pays
    || null;

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
        closeAllFilters();
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
            src="https://images.unsplash.com/photo-1690549392404-de10519e6adb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxUdW5pc2lhJTIwS2VsaWJpYSUyMGJlYWNoJTIwdmlsbGElMjBtZWRpdGVycmFuZWFuJTIwY29hc3R8ZW58MXx8fHwxNzcxNDEyOTU5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Kelibia Beach"
            className="w-full h-full object-cover brightness-75"
          />
          <div className="absolute inset-0 bg-emerald-950/40 mix-blend-multiply pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        </div>

        <div className="relative z-10 container mx-auto px-4 md:px-6 text-center text-white w-full max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-6"
          >
             <div className="mb-5 flex justify-center">
               <div className="h-24 w-24 overflow-hidden rounded-full border border-white/30 bg-white/10 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md md:h-28 md:w-28">
                 <img src={logo} alt="Logo Dwira" className="h-full w-full rounded-full object-cover" />
               </div>
             </div>
             <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 leading-tight drop-shadow-xl">
               Dwira <span className="text-amber-400">Immobilier</span>
             </h1>
             <p className="text-xl md:text-2xl font-light tracking-wide text-emerald-50">
               Votre partenaire de confiance à Kélibia
             </p>
          </motion.div>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg md:text-xl mb-8 max-w-2xl mx-auto drop-shadow-md text-gray-100"
          >
            Achat • Vente • Location • Gestion personnalisée
          </motion.p>

          {/* Filter Bar */}
          <div className="relative z-10 -mb-3 px-4 pb-0 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: loading ? 0 : 1, y: loading ? 8 : 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="grid grid-cols-3 gap-2"
            >
            {orderedModeTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                disabled={Boolean(tab.comingSoon)}
                onClick={() => {
                  if (tab.comingSoon) return;
                  setSelectedMode(tab.value);
                  setHasSearched(false);
                  const next = new URLSearchParams(searchParams);
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
            </motion.div>
          </div>

          <div className="pointer-events-auto overflow-visible rounded-[34px] border border-white/70 bg-white/95 shadow-[0_25px_70px_rgba(15,23,42,0.23)] backdrop-blur-md">
            {/* Filter Controls */}
            <div className="p-4 md:p-6">
              <div ref={filterControlsRef} className="grid grid-cols-1 md:grid-cols-7 gap-4">
                
                {/* Location Dropdown */}
                <div className={`relative pointer-events-auto ${showLocationDropdown ? 'z-[120]' : 'z-10'}`}>
                  <button 
                    type="button"
                    className={`relative w-full flex items-center gap-3 overflow-hidden px-4 py-3 rounded-2xl border cursor-pointer transition-colors h-full text-left pointer-events-auto ${showLocationDropdown ? "border-emerald-500 ring-2 ring-emerald-100 bg-white" : "border-gray-200 bg-gray-50 hover:border-emerald-400"}`}
                    onClick={() => {
                      setShowLocationDropdown(!showLocationDropdown);
                      setShowCategoryDropdown(false);
                      setShowCalendar(false);
                    }}
                  >
                    {selectedLocationWidgetImage && (
                      <img
                        src={resolveZoneImageUrl(selectedLocationWidgetImage)}
                        alt={locationRegion || locationZone || location || "Region selectionnee"}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    {selectedLocationWidgetImage && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                    <MapPin className={`relative z-10 shrink-0 ${selectedLocationWidgetImage ? "text-white" : "text-emerald-600"}`} size={20} />
                    <div className="relative z-10 flex-1 min-w-0">
                      <p className={`text-xs font-medium ${selectedLocationWidgetImage ? "text-white/90" : "text-gray-500"}`}>Où cherchez-vous ?</p>
                      <p className={`truncate text-sm font-semibold ${selectedLocationWidgetImage ? "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]" : "text-gray-800"}`}>
                        {location || "Tous les emplacements"}
                      </p>
                    </div>
                  </button>
                  
                  {showLocationDropdown && (
                    <div ref={locationDesktopPopupRef} className="absolute top-full left-0 mt-2 z-[150] max-h-[75vh] overflow-auto bg-white rounded-2xl shadow-xl border border-gray-100 hidden md:block md:w-[760px]">
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-4 space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Pays</p>
                            <div className="relative overflow-hidden rounded-xl">
                            {selectedLocationImages.pays && (
                              <img
                                src={resolveZoneImageUrl(selectedLocationImages.pays)}
                                alt={locationPays || "Pays"}
                                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                              />
                            )}
                            {selectedLocationImages.pays && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                            <select
                              value={locationPays}
                              onChange={(e) => {
                                setLocationPays(e.target.value);
                                setLocationGouvernerat("");
                                setLocationRegion("");
                                setLocationZone("");
                              }}
                              className={`relative z-10 h-16 w-full rounded-xl border border-gray-200 px-3 text-sm ${selectedLocationImages.pays ? 'bg-transparent text-white border-white/70 font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]' : 'bg-gray-50 text-gray-700'}`}
                            >
                              <option value="">Tous pays</option>
                              {cascadePaysOptions.map((item) => <option key={`home-pays-${item}`} value={item}>{item}</option>)}
                            </select>
                          </div>
                          </div>
                          <div className="col-span-8 grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Gouvernorat</p>
                            <div className="relative overflow-hidden rounded-xl">
                            {selectedLocationImages.gouvernerat && (
                              <img
                                src={resolveZoneImageUrl(selectedLocationImages.gouvernerat)}
                                alt={locationGouvernerat || "Gouvernorat"}
                                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                              />
                            )}
                            {selectedLocationImages.gouvernerat && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                            <select
                              value={locationGouvernerat}
                              onChange={(e) => {
                                setLocationGouvernerat(e.target.value);
                                setLocationRegion("");
                                setLocationZone("");
                              }}
                              className={`relative z-10 h-16 w-full rounded-xl border border-gray-200 px-3 text-sm ${selectedLocationImages.gouvernerat ? 'bg-transparent text-white border-white/70 font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]' : 'bg-gray-50 text-gray-700'}`}
                            >
                              <option value="">Tous gouvernorats</option>
                              {cascadeGouverneratOptions.map((item) => <option key={`home-gouv-${item}`} value={item}>{item}</option>)}
                            </select>
                          </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Region</p>
                            <div className="relative overflow-hidden rounded-xl">
                            {selectedLocationImages.region && (
                              <img
                                src={resolveZoneImageUrl(selectedLocationImages.region)}
                                alt={locationRegion || "Region"}
                                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                              />
                            )}
                            {selectedLocationImages.region && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                            <select
                              value={locationRegion}
                              onChange={(e) => {
                                setLocationRegion(e.target.value);
                                setLocationZone("");
                              }}
                              className={`relative z-10 h-16 w-full rounded-xl border border-gray-200 px-3 text-sm ${selectedLocationImages.region ? 'bg-transparent text-white border-white/70 font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]' : 'bg-gray-50 text-gray-700'}`}
                            >
                              <option value="">Toutes regions</option>
                              {cascadeRegionOptions.map((item) => <option key={`home-region-${item}`} value={item}>{item}</option>)}
                            </select>
                          </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Zone</p>
                            <div className="relative overflow-hidden rounded-xl">
                            {selectedLocationImages.zone && (
                              <img
                                src={resolveZoneImageUrl(selectedLocationImages.zone)}
                                alt={locationZone || "Zone"}
                                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                              />
                            )}
                            {selectedLocationImages.zone && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                            <select
                              value={locationZone}
                              onChange={(e) => setLocationZone(e.target.value)}
                              className={`relative z-10 h-16 w-full rounded-xl border border-gray-200 px-3 text-sm ${selectedLocationImages.zone ? 'bg-transparent text-white border-white/70 font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]' : 'bg-gray-50 text-gray-700'}`}
                            >
                              <option value="">Toutes zones</option>
                              {cascadeZoneOptions.map((item) => <option key={`home-zone-${item}`} value={item}>{item}</option>)}
                            </select>
                          </div>
                          </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${!location ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700 border border-gray-200'}`}
                            onClick={() => { resetLocationFilters(); setShowLocationDropdown(false); }}
                          >
                            Tous les emplacements
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
                <div className={`relative pointer-events-auto ${showCalendar ? 'z-[120]' : 'z-10'}`}>
                  <button 
                    type="button"
                    className={`w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border cursor-pointer transition-colors h-full text-left pointer-events-auto ${showCalendar ? "border-emerald-500 ring-2 ring-emerald-100 bg-white" : "border-gray-200 hover:border-emerald-400"}`}
                    onClick={() => {
                      setShowCalendar(!showCalendar);
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
                        <div className="flex items-center justify-between mb-4">
                          <button 
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <h3 className="font-bold text-gray-900 capitalize">
                            {format(currentMonth, "MMMM yyyy", { locale: fr })}
                          </h3>
                          <button 
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
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

                      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
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
                  )}
                </div>

                {/* Property Type Dropdown */}
                <div className={`relative pointer-events-auto md:col-span-2 ${showCategoryDropdown ? 'z-[120]' : 'z-10'}`}>
                  <button 
                    type="button"
                    className={`relative w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border cursor-pointer transition-colors h-full text-left pointer-events-auto overflow-hidden ${showCategoryDropdown ? "border-emerald-500 ring-2 ring-emerald-100 bg-white" : "border-gray-200 hover:border-emerald-400"}`}
                    onClick={() => {
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
                          className={`w-full text-left px-4 py-5 rounded-xl text-sm transition-colors ${draftCategories.length === 0 && !draftMainType ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                          onClick={() => { setDraftMainType(""); setDraftCategories([]); setTypeSelectionStep("main"); }}
                        >
                          Tous les types
                        </button>
                        <div className="relative mt-3 overflow-hidden min-h-[230px]">
                          <div className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{typeSelectionStep === "main" ? "Type principal" : "Sous-type"}</div>
                          <div className={`mt-3 transition-all duration-300 ${typeSelectionStep === "main" ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0 pointer-events-none absolute inset-0"}`}>
                            <div className="grid grid-cols-1 gap-3">
                            {groupedTypeOptions.map((group) => (
                              <button
                                key={`home-main-${group.mainType}`}
                                type="button"
                                onClick={() => chooseDraftMainType(group.mainType)}
                                className={`relative h-36 overflow-hidden rounded-xl border text-left ${draftMainType === group.mainType ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
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

                {/* Search Button */}
                <div className={`relative pointer-events-auto ${showSeasideDropdown ? 'z-[120]' : 'z-10'}`}>
                  <button
                    type="button"
                    className={`relative w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border cursor-pointer transition-colors h-full text-left pointer-events-auto overflow-hidden ${showSeasideDropdown ? "border-emerald-500 ring-2 ring-emerald-100 bg-white" : "border-gray-200 hover:border-emerald-400"}`}
                    onClick={() => {
                      setShowSeasideDropdown(!showSeasideDropdown);
                      setShowLocationDropdown(false);
                      setShowCalendar(false);
                      setShowCategoryDropdown(false);
                      setShowComfortDropdown(false);
                    }}
                  >
                    {selectedSeasideImage && (
                      <img src={resolveTypeImageUrl(selectedSeasideImage)} alt="Bord de mer" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                    )}
                    {selectedSeasideImage && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                    <Waves className="text-emerald-600 shrink-0" size={20} />
                    <div className={`relative z-10 flex-1 min-w-0 ${selectedSeasideImage ? "text-white" : ""}`}>
                      <p className={`text-xs font-medium ${selectedSeasideImage ? "text-white/85" : "text-gray-500"}`}>Bord de mer</p>
                      <p className={`text-sm font-semibold truncate ${selectedSeasideImage ? "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]" : "text-gray-800"}`}>{selectedSeasideSummary}</p>
                    </div>
                  </button>
                  {showSeasideDropdown && (
                    <div ref={seasideDesktopPopupRef} className="absolute top-full left-0 right-0 mt-2 z-[150] max-h-[70vh] overflow-auto bg-white rounded-2xl shadow-xl border border-gray-100 hidden md:block p-2 space-y-2">
                      {SEASIDE_OPTION_KEYS.map((key) => {
                        const image = getHomeFilterOptionImage("seaside", key);
                        const selected = selectedSeasideOptions.includes(key);
                        return (
                          <button
                            key={`seaside-desktop-${key}`}
                            type="button"
                            onClick={() => toggleSeasideOption(key)}
                            className={`relative w-full h-24 rounded-xl overflow-hidden text-left px-4 flex items-center justify-between ${selected ? "ring-2 ring-emerald-400" : "hover:bg-gray-50"}`}
                          >
                            <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={SEASIDE_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                            <div className="pointer-events-none absolute inset-0 bg-black/40" />
                            <span className="relative z-10 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{SEASIDE_OPTION_LABELS[key]}</span>
                            {selected && <Check size={14} className="relative z-10 text-white" />}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setShowSeasideDropdown(false);
                          setShowComfortDropdown(true);
                        }}
                        className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                      >
                        Confirmer bord de mer
                      </button>
                    </div>
                  )}
                </div>
                <div className={`relative pointer-events-auto ${showComfortDropdown ? 'z-[120]' : 'z-10'}`}>
                  <button
                    type="button"
                    className={`relative w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border cursor-pointer transition-colors h-full text-left pointer-events-auto overflow-hidden ${showComfortDropdown ? "border-emerald-500 ring-2 ring-emerald-100 bg-white" : "border-gray-200 hover:border-emerald-400"}`}
                    onClick={() => {
                      setShowComfortDropdown(!showComfortDropdown);
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
                      {COMFORT_OPTION_KEYS.map((key) => {
                        const image = getHomeFilterOptionImage("comfort", key);
                        const selected = selectedComfortOptions.includes(key);
                        return (
                          <button
                            key={`comfort-desktop-${key}`}
                            type="button"
                            onClick={() => toggleComfortOption(key)}
                            className={`relative w-full h-24 rounded-xl overflow-hidden text-left px-4 flex items-center justify-between ${selected ? "ring-2 ring-emerald-400" : "hover:bg-gray-50"}`}
                          >
                            <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={COMFORT_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                            <div className="pointer-events-none absolute inset-0 bg-black/40" />
                            <span className="relative z-10 text-sm font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{COMFORT_OPTION_LABELS[key]}</span>
                            {selected && <Check size={14} className="relative z-10 text-white" />}
                          </button>
                        );
                      })}
                      <button type="button" onClick={() => setShowComfortDropdown(false)} className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
                        Confirmer confort
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-stretch gap-2">
                  <button
                    onClick={handleSearch}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 duration-200 flex items-center justify-center gap-2"
                  >
                    <Search size={20} />
                    <span>Rechercher</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenAdvancedFilters}
                    aria-label="Ouvrir filtres avances"
                    title="Filtres avances"
                    className="shrink-0 rounded-2xl border border-emerald-200 bg-white px-4 text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    <SlidersHorizontal size={18} />
                  </button>
                </div>
              </div>

              {/* Selected Filters Display - moved under controls */}
              {(location || selectedMainType || selectedCategories.length > 0 || selectedSeasideOptions.length > 0 || selectedComfortOptions.length > 0 || (checkIn && checkOut)) && (
                <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 border border-emerald-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 uppercase">Filtres actifs:</span>
                    {location && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <MapPin size={12} />
                        {location}
                        <button onClick={() => setLocation("")} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    )}
                    {selectedMainType && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Home size={12} />
                        {MAIN_TYPE_LABELS[selectedMainType]}
                        <button onClick={() => { setSelectedMainType(""); setSelectedCategories([]); }} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    )}
                    {selectedCategories.map(cat => (
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
                        <Waves size={12} />
                        {SEASIDE_OPTION_LABELS[key]}
                        <button onClick={() => toggleSeasideOption(key)} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {selectedComfortOptions.map((key) => (
                      <span key={`chip-comfort-${key}`} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Wind size={12} />
                        {COMFORT_OPTION_LABELS[key]}
                        <button onClick={() => toggleComfortOption(key)} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {checkIn && checkOut && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                        <Calendar size={12} />
                        {format(checkIn, "d MMM", { locale: fr })} - {format(checkOut, "d MMM", { locale: fr })}
                        <button onClick={() => { setCheckIn(null); setCheckOut(null); }} className="ml-1 hover:text-emerald-200">
                          <X size={12} />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {showLocationDropdown && (
          <div className="fixed inset-0 z-[220] md:hidden">
            <button type="button" className="absolute inset-0 bg-black/35" onClick={() => setShowLocationDropdown(false)} />
            <div ref={locationMobilePopupRef} className="absolute left-3 right-3 bottom-3 max-h-[72vh] overflow-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-3 space-y-3">
              <div className="grid grid-cols-1 gap-2">
                <div className="relative overflow-hidden rounded-xl">
                  {selectedLocationImages.pays && (
                    <img
                      src={resolveZoneImageUrl(selectedLocationImages.pays)}
                      alt={locationPays || "Pays"}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {selectedLocationImages.pays && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                  <select
                    value={locationPays}
                    onChange={(e) => {
                      setLocationPays(e.target.value);
                      setLocationGouvernerat("");
                      setLocationRegion("");
                      setLocationZone("");
                    }}
                    className={`relative z-10 h-24 w-full rounded-xl border border-gray-200 px-3 text-xs ${selectedLocationImages.pays ? 'bg-transparent text-white border-white/70 font-semibold' : ''}`}
                  >
                    <option value="">Tous pays</option>
                    {cascadePaysOptions.map((item) => <option key={`mobile-pays-${item}`} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="relative overflow-hidden rounded-xl">
                  {selectedLocationImages.gouvernerat && (
                    <img
                      src={resolveZoneImageUrl(selectedLocationImages.gouvernerat)}
                      alt={locationGouvernerat || "Gouvernorat"}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {selectedLocationImages.gouvernerat && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                  <select
                    value={locationGouvernerat}
                    onChange={(e) => {
                      setLocationGouvernerat(e.target.value);
                      setLocationRegion("");
                      setLocationZone("");
                    }}
                    className={`relative z-10 h-24 w-full rounded-xl border border-gray-200 px-3 text-xs ${selectedLocationImages.gouvernerat ? 'bg-transparent text-white border-white/70 font-semibold' : ''}`}
                  >
                    <option value="">Tous gouvernorats</option>
                    {cascadeGouverneratOptions.map((item) => <option key={`mobile-gouv-${item}`} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="relative overflow-hidden rounded-xl">
                  {selectedLocationImages.region && (
                    <img
                      src={resolveZoneImageUrl(selectedLocationImages.region)}
                      alt={locationRegion || "Region"}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {selectedLocationImages.region && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                  <select
                    value={locationRegion}
                    onChange={(e) => {
                      setLocationRegion(e.target.value);
                      setLocationZone("");
                    }}
                    className={`relative z-10 h-24 w-full rounded-xl border border-gray-200 px-3 text-xs ${selectedLocationImages.region ? 'bg-transparent text-white border-white/70 font-semibold' : ''}`}
                  >
                    <option value="">Toutes regions</option>
                    {cascadeRegionOptions.map((item) => <option key={`mobile-region-${item}`} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="relative overflow-hidden rounded-xl">
                  {selectedLocationImages.zone && (
                    <img
                      src={resolveZoneImageUrl(selectedLocationImages.zone)}
                      alt={locationZone || "Zone"}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {selectedLocationImages.zone && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                  <select
                    value={locationZone}
                    onChange={(e) => setLocationZone(e.target.value)}
                    className={`relative z-10 h-24 w-full rounded-xl border border-gray-200 px-3 text-xs ${selectedLocationImages.zone ? 'bg-transparent text-white border-white/70 font-semibold' : ''}`}
                  >
                    <option value="">Toutes zones</option>
                    {cascadeZoneOptions.map((item) => <option key={`mobile-zone-${item}`} value={item}>{item}</option>)}
                  </select>
                </div>
              </div>
              <button
                className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${!location ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                onClick={() => { resetLocationFilters(); setShowLocationDropdown(false); }}
              >
                Tous les emplacements
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
        )}

        {showCalendar && (
          <div className="fixed inset-0 z-[220] md:hidden">
            <button type="button" className="absolute inset-0 bg-black/35" onClick={() => setShowCalendar(false)} />
            <div ref={calendarMobilePopupRef} className="absolute left-3 right-3 bottom-3 max-h-[72vh] overflow-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <h3 className="font-bold text-gray-900 capitalize">{format(currentMonth, "MMMM yyyy", { locale: fr })}</h3>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
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
              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
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
        )}

        {showCategoryDropdown && (
          <div className="fixed inset-0 z-[220] md:hidden">
            <button type="button" className="absolute inset-0 bg-black/35" onClick={() => setShowCategoryDropdown(false)} />
            <div ref={categoryMobilePopupRef} className="absolute left-3 right-3 bottom-3 max-h-[62vh] overflow-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-2">
              <button
                className={`w-full text-left px-4 py-5 rounded-xl text-sm transition-colors ${draftCategories.length === 0 && !draftMainType ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                onClick={() => { setDraftMainType(""); setDraftCategories([]); setTypeSelectionStep("main"); }}
              >
                Tous les types
              </button>
              <div className="relative mt-3 overflow-hidden min-h-[230px]">
                <p className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{typeSelectionStep === "main" ? "Type principal" : "Sous-type"}</p>
                <div className={`mt-3 transition-all duration-300 ${typeSelectionStep === "main" ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0 pointer-events-none absolute inset-0"}`}>
                  <div className="grid grid-cols-1 gap-3">
                  {groupedTypeOptions.map((group) => (
                    <button
                      key={`mobile-main-${group.mainType}`}
                      type="button"
                      onClick={() => chooseDraftMainType(group.mainType)}
                      className={`relative h-36 overflow-hidden rounded-xl border text-left ${draftMainType === group.mainType ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
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
        {showSeasideDropdown && (
          <div className="fixed inset-0 z-[220] md:hidden">
            <button type="button" className="absolute inset-0 bg-black/35" onClick={() => setShowSeasideDropdown(false)} />
            <div ref={seasideMobilePopupRef} className="absolute left-3 right-3 bottom-3 max-h-[62vh] overflow-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-2 space-y-2">
              {SEASIDE_OPTION_KEYS.map((key) => {
                const image = getHomeFilterOptionImage("seaside", key);
                const selected = selectedSeasideOptions.includes(key);
                return (
                  <button
                    key={`seaside-mobile-${key}`}
                    type="button"
                    onClick={() => toggleSeasideOption(key)}
                    className={`relative w-full h-24 rounded-xl overflow-hidden text-left px-4 flex items-center justify-between ${selected ? "ring-2 ring-emerald-400" : ""}`}
                  >
                    <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={SEASIDE_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                    <span className="relative z-10 text-sm font-semibold text-white">{SEASIDE_OPTION_LABELS[key]}</span>
                    {selected && <Check size={14} className="relative z-10 text-white" />}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setShowSeasideDropdown(false);
                  setShowComfortDropdown(true);
                }}
                className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Confirmer bord de mer
              </button>
            </div>
          </div>
        )}
        {showComfortDropdown && (
          <div className="fixed inset-0 z-[220] md:hidden">
            <button type="button" className="absolute inset-0 bg-black/35" onClick={() => setShowComfortDropdown(false)} />
            <div ref={comfortMobilePopupRef} className="absolute left-3 right-3 bottom-3 max-h-[62vh] overflow-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-2 space-y-2">
              {COMFORT_OPTION_KEYS.map((key) => {
                const image = getHomeFilterOptionImage("comfort", key);
                const selected = selectedComfortOptions.includes(key);
                return (
                  <button
                    key={`comfort-mobile-${key}`}
                    type="button"
                    onClick={() => toggleComfortOption(key)}
                    className={`relative w-full h-24 rounded-xl overflow-hidden text-left px-4 flex items-center justify-between ${selected ? "ring-2 ring-emerald-400" : ""}`}
                  >
                    <img src={resolveTypeImageUrl(image || TYPE_FALLBACK_IMAGE)} alt={COMFORT_OPTION_LABELS[key]} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                    <div className="pointer-events-none absolute inset-0 bg-black/40" />
                    <span className="relative z-10 text-sm font-semibold text-white">{COMFORT_OPTION_LABELS[key]}</span>
                    {selected && <Check size={14} className="relative z-10 text-white" />}
                  </button>
                );
              })}
              <button type="button" onClick={() => setShowComfortDropdown(false)} className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
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
                {hasSearched 
                  ? `${filteredProperties.length} bien${filteredProperties.length !== 1 ? 's' : ''} trouvé${filteredProperties.length !== 1 ? 's' : ''} selon vos critères`
                  : `Affichage du mode ${orderedModeTabs.find((tab) => tab.value === selectedMode)?.label.toLowerCase()}. Les biens en vedette apparaissent en premier.`}
              </p>
            </div>
            {!isSelectedModeComingSoon && (
              <Link to={selectedMode === "vente" ? "/ventes" : `/logements?mode=${encodeURIComponent(selectedMode)}`} className="hidden md:flex items-center gap-2 text-emerald-700 font-bold hover:text-emerald-800 transition-colors group">
                Voir tout le catalogue <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </div>

          {isSelectedModeComingSoon && (
            <ComingSoonState
              title={selectedMode === "vente" ? "Mode Vente" : "Mode Location annuelle"}
              description="Ce mode est en stabilisation cote client. Il sera ouvert au public tres bientot."
              backTo="/"
              backLabel="Retour a l'accueil"
            />
          )}

          {!isSelectedModeComingSoon && (<div className="rounded-[30px] border border-gray-100 bg-white px-4 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] md:px-6 md:py-7">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {filteredProperties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  searchParams={(() => {
                    const params = new URLSearchParams();
                    params.set("mode", selectedMode);
                    if (location) params.set("location", location);
                    if (selectedMainType) params.set("mainType", selectedMainType);
                    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
                    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
                    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
                    if (checkIn) params.set("checkIn", format(checkIn, 'yyyy-MM-dd'));
                    if (checkOut) params.set("checkOut", format(checkOut, 'yyyy-MM-dd'));
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
          </div>)}
          
          {filteredProperties.length === 0 && hasSearched && !isSelectedModeComingSoon && (
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
          
          {!isSelectedModeComingSoon && (
            <div className="mt-12 text-center md:hidden">
              <Link to={selectedMode === "vente" ? "/ventes" : `/logements?mode=${encodeURIComponent(selectedMode)}`} className="inline-flex items-center gap-2 text-emerald-700 font-bold hover:text-emerald-800 transition-colors border-2 border-emerald-700 px-6 py-3 rounded-full hover:bg-emerald-50">
                Voir tous les logements <ArrowRight size={20} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-white">
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
      <section className="py-20 bg-emerald-700 text-white text-center relative overflow-hidden">
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
    </div>
  );
}



