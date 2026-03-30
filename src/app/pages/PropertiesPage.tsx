import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Check, MapPin, Search, SlidersHorizontal, Sparkles, Users, X, Waves, Wind, Percent, Coins, ListFilter, Layers, ConciergeBell, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useProperties } from "../context/PropertiesContext";
import { PropertyCard } from "../components/PropertyCard";
import { getServiceDisplayPrice, normalizeServicePayant, type NormalizedServicePayant } from "../utils/servicePayants";
import ComingSoonState from "../components/ComingSoonState";
import { PUBLIC_COMING_SOON } from "../config/publicAvailability";

type ListingMode = "vente" | "location_annuelle" | "location_saisonniere";
type PropertyMainType = "appartement" | "villa_maison" | "studio" | "immeuble" | "autre";
type HomeSeasideOptionKey = "pied_dans_eau" | "vue_sur_mer" | "pres_plage";
type HomeComfortOptionKey = "climatise" | "piscine_privee" | "piscine_partagee";

const MODE_TABS: Array<{ value: ListingMode; label: string }> = [
  { value: "location_saisonniere", label: "Location saisonniere" },
  { value: "location_annuelle", label: "Location annuelle" },
];

const STANDING_OPTIONS = [
  { value: "", label: "Tous standings" },
  { value: "economique", label: "Economique" },
  { value: "confort", label: "Confort" },
  { value: "premium", label: "Premium" },
  { value: "luxe", label: "Luxe" },
];
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
};
const SEASIDE_OPTION_KEYS: HomeSeasideOptionKey[] = ["pied_dans_eau", "vue_sur_mer", "pres_plage"];
const COMFORT_OPTION_KEYS: HomeComfortOptionKey[] = ["climatise", "piscine_privee", "piscine_partagee"];
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
const MAIN_TYPE_TO_CATEGORIES: Record<PropertyMainType, string[]> = {
  appartement: ["S+1", "S+2", "S+3", "S+4"],
  villa_maison: ["Villa"],
  studio: ["Studio"],
  immeuble: ["S+4"],
  autre: [],
};

type FeatureApiRow = {
  id: string;
  nom: string;
  onglet_id?: string | null;
  onglet_nom?: string | null;
  visibilite_client?: number | null;
};

const normalizeFeatureName = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

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

const getMainTypeFromCategory = (category: string): PropertyMainType => {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized.startsWith("s+")) return "appartement";
  if (normalized.includes("villa")) return "villa_maison";
  if (normalized.includes("studio")) return "studio";
  if (normalized.includes("immeuble")) return "immeuble";
  return "autre";
};

export default function PropertiesPage() {
  const { properties, biens, zones, modePriorities, loading } = useProperties();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ListingMode>("location_saisonniere");
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);
  const filtersAnchorRef = useRef<HTMLDivElement | null>(null);
  const [modeFeaturesByType, setModeFeaturesByType] = useState<Record<string, FeatureApiRow[]>>({});
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
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") || "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") || "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.get("categories")?.split(",").filter(Boolean) || []
  );
  const [selectedMainType, setSelectedMainType] = useState<PropertyMainType | "">(
    (String(searchParams.get("mainType") || "").trim() as PropertyMainType) || ""
  );
  const [selectedFeatureNames, setSelectedFeatureNames] = useState<string[]>(
    () => searchParams.get("features")?.split(",").map((item) => item.trim()).filter(Boolean) || []
  );
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
  const [priceMax, setPriceMax] = useState(parseInt(searchParams.get("maxPrice") || "1000", 10));
  const [smartTolerance, setSmartTolerance] = useState(parseInt(searchParams.get("tolerance") || "35", 10));
  const [sortMode, setSortMode] = useState<"matching" | "price" | "featured">(
    (String(searchParams.get("sort") || "matching").trim() as "matching" | "price" | "featured")
  );
  const isAnnualComingSoon = PUBLIC_COMING_SOON.locationAnnuelle && selectedMode === "location_annuelle";

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
    const mainType = String(searchParams.get("mainType") || "").trim() as PropertyMainType;
    if (!mainType) return;
    const nextCategories = MAIN_TYPE_TO_CATEGORIES[mainType] || [];
    if (nextCategories.length > 0) {
      setSelectedCategories((prev) => (prev.length > 0 ? prev : nextCategories));
    }
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

        if (!disposed) {
          setModeFeaturesByType(Object.fromEntries(entries));
        }
      } catch {
        if (!disposed) setModeFeaturesByType({});
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

  const uniqueLocations = useMemo(
    () => Array.from(new Set(modeProperties.map((p) => p.location))).sort(),
    [modeProperties]
  );
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
    if (!location) return null;
    return locationImageMap.get(location) || null;
  }, [location, locationImageMap]);
  const availableTypeOptions = useMemo(() => {
    const byCategory = new Map<string, { label: string; imageUrl: string }>();
    for (const property of modeProperties) {
      const category = String(property.category || "").trim();
      if (!category) continue;
      if (!byCategory.has(category)) {
        const firstImage = Array.isArray(property.images) ? String(property.images[0] || "").trim() : "";
        const imageFromAdmin = typeFilterImageRows.find((row) =>
          String(row.mode_bien || "").trim() === selectedMode
          && normalizeFeatureName(row.sub_type || "") === normalizeFeatureName(category)
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
    for (const option of availableTypeOptions) {
      const mainType = getMainTypeFromCategory(option.label);
      const existing = groups.get(mainType);
      const mainImageFromAdmin = typeFilterImageRows.find((row) =>
        String(row.mode_bien || "").trim() === selectedMode
        && normalizeFeatureName(row.main_type || "") === normalizeFeatureName(mainType)
        && !String(row.sub_type || "").trim()
      )?.image_url || "";
      if (!existing) {
        groups.set(mainType, {
          mainType,
          label: MAIN_TYPE_LABELS[mainType],
          imageUrl: mainImageFromAdmin || option.imageUrl,
          subTypes: [{ label: option.label, imageUrl: option.imageUrl }],
        });
        continue;
      }
      existing.subTypes.push({ label: option.label, imageUrl: option.imageUrl });
      if (!existing.imageUrl && (mainImageFromAdmin || option.imageUrl)) existing.imageUrl = mainImageFromAdmin || option.imageUrl;
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [availableTypeOptions, selectedMode, typeFilterImageRows]);
  const secondaryTypeOptions = useMemo(() => {
    if (!selectedMainType) return availableTypeOptions;
    const selectedGroup = groupedTypeOptions.find((group) => group.mainType === selectedMainType);
    return selectedGroup?.subTypes || [];
  }, [availableTypeOptions, groupedTypeOptions, selectedMainType]);

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
  const featureTabsList = useMemo(() => {
    const tabNames = new Set<string>();
    Object.values(modeFeaturesByType).forEach((rows) => {
      (Array.isArray(rows) ? rows : []).forEach((feature) => {
        if (Number(feature?.visibilite_client) === 0) return;
        const tab = cleanFeatureTabName(String(feature?.onglet_nom || "")).trim();
        if (!tab) return;
        tabNames.add(tab);
      });
    });
    return Array.from(tabNames).sort((a, b) => a.localeCompare(b, "fr"));
  }, [modeFeaturesByType]);
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
    const tabMap = new Map<string, Set<string>>();
    Object.values(modeFeaturesByType).forEach((rows) => {
      (Array.isArray(rows) ? rows : []).forEach((feature) => {
        if (Number(feature?.visibilite_client) === 0) return;
        const tab = cleanFeatureTabName(String(feature?.onglet_nom || "")).trim();
        const featureName = String(feature?.nom || "").trim();
        if (!tab || !featureName) return;
        if (!tabMap.has(tab)) tabMap.set(tab, new Set());
        tabMap.get(tab)?.add(featureName);
      });
    });
    return new Map(Array.from(tabMap.entries()).map(([tab, values]) => [tab, Array.from(values).sort((a, b) => a.localeCompare(b, "fr"))]));
  }, [modeFeaturesByType]);

  useEffect(() => {
    const mainTypeAllowed = new Set(groupedTypeOptions.map((item) => item.mainType));
    setSelectedMainType((prev) => (prev && mainTypeAllowed.has(prev) ? prev : ""));
  }, [groupedTypeOptions]);
  useEffect(() => {
    if (!selectedMainType) return;
    const allowedSecondary = new Set(secondaryTypeOptions.map((item) => item.label));
    setSelectedCategories((prev) => prev.filter((cat) => allowedSecondary.has(cat)));
  }, [selectedMainType, secondaryTypeOptions]);

  const maxGuestsAvailable = useMemo(
    () => Math.max(2, ...modeProperties.map((p) => Math.max(1, Number(p.guests || 1)))),
    [modeProperties]
  );

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mode", selectedMode);
    if (query.trim()) params.set("q", query.trim());
    if (location) params.set("location", location);
    if (selectedMode === "location_saisonniere" && checkIn) params.set("checkIn", checkIn);
    if (selectedMode === "location_saisonniere" && checkOut) params.set("checkOut", checkOut);
    if (selectedMainType) params.set("mainType", selectedMainType);
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (selectedFeatureNames.length > 0) params.set("features", selectedFeatureNames.join(","));
    if (selectedPaidServices.length > 0) params.set("paidServices", selectedPaidServices.join(","));
    if (selectedSeasideOptions.length > 0) params.set("seaside", selectedSeasideOptions.join(","));
    if (selectedComfortOptions.length > 0) params.set("comfort", selectedComfortOptions.join(","));
    if (selectedMode === "location_saisonniere" && selectedStanding) params.set("standing", selectedStanding);
    if (selectedMode === "location_saisonniere" && minGuests > 1) params.set("guestsMin", String(minGuests));
    if (isFeaturedOnly) params.set("featured", "true");
    if (priceMax < priceCeiling) params.set("maxPrice", String(priceMax));
    if (smartTolerance !== 35) params.set("tolerance", String(smartTolerance));
    if (sortMode !== "matching") params.set("sort", sortMode);
    setSearchParams(params, { replace: true });
  }, [
    selectedMode,
    query,
    location,
    checkIn,
    checkOut,
    selectedMainType,
    selectedCategories,
    selectedFeatureNames,
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
    setSelectedSeasideOptions((prev) => (prev.includes(key) ? [] : [key]));
  };
  const toggleComfortOption = (key: HomeComfortOptionKey) => {
    setSelectedComfortOptions((prev) => {
      if (key === "climatise") {
        return prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key];
      }
      const withoutPool = prev.filter((item) => !POOL_OPTION_KEYS.includes(item));
      return prev.includes(key) ? withoutPool : [...withoutPool, key];
    });
  };

  const clearFilters = () => {
    setQuery("");
    setLocation("");
    setCheckIn("");
    setCheckOut("");
    setSelectedCategories([]);
    setSelectedMainType("");
    setSelectedFeatureNames([]);
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
    setSearchParams(new URLSearchParams(`mode=${selectedMode}`), { replace: true });
  };

  const scoredResults = useMemo(() => {
    const toDate = (value: string) => {
      const date = new Date(`${value}T00:00:00`);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const dayDiff = (start: Date, end: Date) => Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart <= bEnd && bStart <= aEnd;
    const hasBlockedDates = (property: any, start: Date, end: Date) => {
      const ranges = Array.isArray(property.unavailableDates) ? property.unavailableDates : [];
      return ranges.some((range: any) => {
        const status = String(range?.status || "").toLowerCase();
        if (!["booked", "pending", "blocked"].includes(status)) return false;
        const rangeStart = toDate(String(range?.start || ""));
        const rangeEnd = toDate(String(range?.end || ""));
        if (!rangeStart || !rangeEnd) return false;
        return overlaps(start, end, rangeStart, rangeEnd);
      });
    };
    const findNearbyDateAlternative = (property: any, start: Date, end: Date) => {
      const nights = dayDiff(start, end);
      for (let offset = 1; offset <= 14; offset += 1) {
        for (const sign of [-1, 1]) {
          const delta = offset * sign;
          const nextStart = new Date(start);
          nextStart.setDate(nextStart.getDate() + delta);
          const nextEnd = new Date(nextStart);
          nextEnd.setDate(nextStart.getDate() + nights);
          if (!hasBlockedDates(property, nextStart, nextEnd)) {
            return {
              shift: delta,
              start: nextStart,
              end: nextEnd,
            };
          }
        }
      }
      return null;
    };
    const formatDateLabel = (date: Date) =>
      new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(date);
    const hasCoreFilters =
      Boolean(query.trim()) ||
      Boolean(location) ||
      Boolean(checkIn) ||
      Boolean(checkOut) ||
      selectedCategories.length > 0 ||
      selectedSeasideOptions.length > 0 ||
      selectedComfortOptions.length > 0 ||
      selectedFeatureNames.length > 0 ||
      Boolean(selectedStanding) ||
      minGuests > 1 ||
      isFeaturedOnly ||
      priceMax < priceCeiling;

    const rows = properties
      .filter((property) => {
        const mode = property.mode || "location_saisonniere";
        return mode === selectedMode;
      })
      .map((property) => {
        const propertyAmenities = propertyAmenityMap.get(String(property.id)) || property.amenities || [];
        const propertyFeatureTabs = propertyFeatureTabMap.get(String(property.id)) || [];
        const propertyPaidServices = propertyPaidServicesMap.get(String(property.id)) || [];
        const normalizedAmenities = propertyAmenities.map((item) => normalizeFeatureName(String(item || "")));
        const matchesAmenity = (selectedAmenity: string) => {
          const token = normalizeFeatureName(selectedAmenity);
          if (!token) return true;
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
          if (token.includes("piscine privee")) {
            return normalizedAmenities.some((item) => item.includes("piscine") && item.includes("prive"));
          }
          if (token.includes("piscine partagee")) {
            return normalizedAmenities.some((item) =>
              item.includes("piscine") && (item.includes("partag") || item.includes("commune") || item.includes("collectiv"))
            );
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

        if (location) {
          maxScore += 18;
          const exact = property.location.toLowerCase().includes(location.toLowerCase());
          if (exact) score += 18;
          else if (normalizeFeatureName(property.location).includes(normalizeFeatureName(location).split(" ")[0] || "")) score += 8;
          else missing.push("Emplacement partiellement different");
        }

        if (selectedCategories.length > 0) {
          maxScore += 16;
          if (selectedCategories.includes(property.category)) score += 16;
          else if (selectedCategories.some((item) => String(item || "").charAt(0) === String(property.category || "").charAt(0))) score += 7;
          else missing.push("Type proche mais different");
        }

        const matchSeaside = selectedSeasideOptions.every((option) => {
          if (option === "pied_dans_eau") return hasAny("pied dans l eau", "front de mer", "bord de mer", "acces direct plage");
          if (option === "vue_sur_mer") return property.seasonalConfig?.vue === "mer" || hasAny("vue sur mer", "vue mer");
          if (option === "pres_plage") return hasAny("proche plage", "pres de la plage", "a quelques pas de la plage", "plage");
          return true;
        });
        if (selectedSeasideOptions.length > 0) {
          maxScore += 10;
          if (matchSeaside) score += 10;
          else missing.push("Critere bord de mer incomplet");
        }

        const matchComfort = selectedComfortOptions.every((option) => {
          if (option === "climatise") return hasAny("climatise", "climatisation");
          if (option === "piscine_privee") return hasAny("piscine privee");
          if (option === "piscine_partagee") return hasAny("piscine partagee", "piscine commune", "piscine collective");
          return true;
        });
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

          if (checkIn && checkOut) {
            maxScore += 20;
            const start = toDate(checkIn);
            const end = toDate(checkOut);
            if (start && end && start < end) {
              if (!hasBlockedDates(property, start, end)) {
                score += 20;
              } else {
                const alt = findNearbyDateAlternative(property, start, end);
                if (alt) {
                  score += 10;
                  hints.push(`Alternative dates: ${formatDateLabel(alt.start)} - ${formatDateLabel(alt.end)} (${alt.shift > 0 ? "+" : ""}${alt.shift} j)`);
                } else {
                  missing.push("Dates non disponibles");
                }
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
        return {
          property,
          score: normalizedScore,
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
        };
      });

    const threshold = hasCoreFilters ? smartTolerance : 0;
    let filtered = rows.filter((row) => row.score >= threshold);
    if (filtered.length === 0) {
      filtered = [...rows].sort((a, b) => b.score - a.score).slice(0, 12);
    }
    return filtered.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.property.isFeatured !== b.property.isFeatured) return a.property.isFeatured ? -1 : 1;
      return Number(b.property.rating || 0) - Number(a.property.rating || 0);
    });
  }, [
      properties,
      selectedMode,
      query,
      location,
      selectedCategories,
      selectedFeatureNames,
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
      checkIn,
      checkOut,
      smartTolerance,
      priceCeiling,
    ]);

  const activeFiltersCount =
    Number(Boolean(query.trim())) +
    Number(Boolean(location)) +
    Number(Boolean(checkIn)) +
    Number(Boolean(checkOut)) +
    selectedCategories.length +
    selectedFeatureNames.length +
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
    const categories = (tabFeatureOptionsMap.get("Caracteristiques") || []).filter((name) =>
      tabFeatureOptionsMap.has(name)
    );
    if (categories.length === 0) {
      if (selectedCharacteristicsCategory) setSelectedCharacteristicsCategory("");
      return;
    }
    if (!selectedCharacteristicsCategory || !categories.includes(selectedCharacteristicsCategory)) {
      setSelectedCharacteristicsCategory(categories[0]);
    }
  }, [tabFeatureOptionsMap, selectedCharacteristicsCategory]);
  useEffect(() => {
    if (!activeCharacteristicsCategoryModal) return;
    if (!tabFeatureOptionsMap.has(activeCharacteristicsCategoryModal)) {
      setActiveCharacteristicsCategoryModal("");
    }
  }, [activeCharacteristicsCategoryModal, tabFeatureOptionsMap]);
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
    const list = [...scoredResults];
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
  }, [scoredResults, sortMode]);
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
                        alt={location || "Emplacement"}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    {selectedLocationImage && <div className="pointer-events-none absolute inset-0 bg-black/35" />}
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={`relative z-10 w-full rounded-xl border p-2.5 text-sm outline-none ${
                        selectedLocationImage
                          ? "border-white/70 bg-transparent font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]"
                          : "border-gray-200 bg-white text-gray-700 focus:border-emerald-500"
                      }`}
                    >
                      <option value="">Tous les emplacements</option>
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
                        onClick={() => setLocation("")}
                        className={`relative h-16 overflow-hidden rounded-xl border px-3 text-left ${!location ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
                      >
                        <img src={resolveZoneImageUrl(null)} alt="Tous les emplacements" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-black/30" />
                        <span className="relative z-10 text-xs font-semibold text-white">Tous les emplacements</span>
                      </button>
                      {uniqueLocations.map((loc) => (
                        <button
                          key={`location-card-${loc}`}
                          type="button"
                          onClick={() => setLocation(loc)}
                          className={`relative h-16 overflow-hidden rounded-xl border px-3 text-left ${location === loc ? "ring-2 ring-emerald-400" : "border-gray-200"}`}
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
                        <label className="mb-1 block text-xs font-bold text-gray-700">Arrivee</label>
                        <input
                          type="date"
                          value={checkIn}
                          onChange={(e) => setCheckIn(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-700">Depart</label>
                        <input
                          type="date"
                          value={checkOut}
                          onChange={(e) => setCheckOut(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-emerald-500"
                        />
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
                          setSelectedMainType(group.mainType);
                          setSelectedCategories([]);
                        }}
                        className={`relative h-24 overflow-hidden rounded-xl border text-left ${
                          selectedMainType === group.mainType ? "ring-2 ring-emerald-400" : "border-gray-200"
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
                        {STANDING_OPTIONS.map((opt) => (
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
                          {SEASIDE_OPTION_KEYS.map((key) => (
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
                        </div>
                      </div>
                      <div className="space-y-2 rounded-xl p-1">
                        <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                          <Wind size={14} className="text-emerald-600" />
                          Confort
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                          {COMFORT_OPTION_KEYS.map((key) => (
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
                              {isCharacteristicsTabName(tab) ? (
                                <>
                                  <p className="mb-3 text-xs text-gray-500">Cliquez sur une categorie pour ouvrir ses options dans un popup.</p>
                                  <div className="flex flex-wrap gap-2">
                                    {(tabFeatureOptionsMap.get(tab) || []).map((categoryName) => {
                                      const hasNestedOptions = tabFeatureOptionsMap.has(categoryName);
                                      const categoryOptions = tabFeatureOptionsMap.get(categoryName) || [];
                                      const selectedCount = categoryOptions.filter((opt) => selectedFeatureNames.includes(opt)).length;
                                      return (
                                        <button
                                          key={`char-category-${categoryName}`}
                                          type="button"
                                          onClick={() => {
                                            if (!hasNestedOptions) return;
                                            setSelectedCharacteristicsCategory(categoryName);
                                            setActiveCharacteristicsCategoryModal(categoryName);
                                          }}
                                          className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                                            selectedCharacteristicsCategory === categoryName
                                              ? "border-emerald-500 bg-emerald-100 font-semibold text-emerald-800"
                                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                          } ${hasNestedOptions ? "" : "cursor-not-allowed opacity-60"}`}
                                          disabled={!hasNestedOptions}
                                        >
                                          {categoryName}
                                          {selectedCount > 0 && <span className="ml-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{selectedCount}</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className="mb-2 text-xs text-gray-500">Choisissez des options precises (ex: Lave-linge), pas la categorie complete.</p>
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
                                </>
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
            </div>

            {sortedScoredResults.length > 0 ? (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {sortedScoredResults.map((row) => (
                  <div key={row.property.id} className="space-y-2">
                    <PropertyCard property={row.property} searchParams={searchParams.toString()} />
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900">
                          <Percent size={14} />
                          Matching {row.score}%
                        </span>
                        <span className="text-xs text-emerald-700">{row.score >= 80 ? "Excellent" : row.score >= 60 ? "Bon" : "Alternative"}</span>
                      </div>
                      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
                        <div
                          className={`h-full rounded-full transition-all ${row.score >= 80 ? "bg-emerald-600" : row.score >= 60 ? "bg-emerald-500" : "bg-amber-500"}`}
                          style={{ width: `${row.score}%` }}
                        />
                      </div>
                      <div className="mb-1 grid grid-cols-3 gap-1 text-[11px] text-gray-600">
                        <span className="rounded-md bg-white px-2 py-1 text-center">Carac: {row.details.amenitiesMatched}</span>
                        <span className="rounded-md bg-white px-2 py-1 text-center">Onglets: {row.details.tabsMatched}</span>
                        <span className="rounded-md bg-white px-2 py-1 text-center">Services: {row.details.servicesMatched}</span>
                      </div>
                      {row.hints.length > 0 && (
                        <p className="text-xs text-emerald-800">{row.hints.join(" | ")}</p>
                      )}
                      {row.missing.length > 0 && (
                        <p className="mt-1 text-xs text-gray-600">Points a noter: {row.missing.join(" | ")}</p>
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

