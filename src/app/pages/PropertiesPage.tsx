import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Check, MapPin, Search, SlidersHorizontal, Sparkles, Users, X } from "lucide-react";
import { useProperties } from "../context/PropertiesContext";
import { PropertyCard } from "../components/PropertyCard";

type ListingMode = "vente" | "location_annuelle" | "location_saisonniere";

const MODE_TABS: Array<{ value: ListingMode; label: string }> = [
  { value: "location_saisonniere", label: "Location saisonniere" },
  { value: "location_annuelle", label: "Location annuelle" },
];

const CATEGORY_ORDER = ["Studio", "S+1", "S+2", "S+3", "S+4", "Villa"];
const STANDING_OPTIONS = [
  { value: "", label: "Tous standings" },
  { value: "economique", label: "Economique" },
  { value: "confort", label: "Confort" },
  { value: "premium", label: "Premium" },
  { value: "luxe", label: "Luxe" },
];

export default function PropertiesPage() {
  const { properties, modePriorities, loading } = useProperties();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [selectedMode, setSelectedMode] = useState<ListingMode>("location_saisonniere");

  const orderedModeTabs = useMemo(
    () =>
      [...MODE_TABS].sort(
        (a, b) => (modePriorities[a.value] || 99) - (modePriorities[b.value] || 99)
      ),
    [modePriorities]
  );

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") || "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") || "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.get("categories")?.split(",").filter(Boolean) || []
  );
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(
    searchParams.get("amenities")?.split(",").filter(Boolean) || []
  );
  const [selectedStanding, setSelectedStanding] = useState(searchParams.get("standing") || "");
  const [minGuests, setMinGuests] = useState(parseInt(searchParams.get("guestsMin") || "1", 10));
  const [isFeaturedOnly, setIsFeaturedOnly] = useState(searchParams.get("featured") === "true");
  const [priceMax, setPriceMax] = useState(parseInt(searchParams.get("maxPrice") || "1000", 10));

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

  const modeProperties = useMemo(
    () => properties.filter((p) => (p.mode || "location_saisonniere") === selectedMode),
    [properties, selectedMode]
  );

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

  const amenitiesList = useMemo(
    () =>
      Array.from(new Set(modeProperties.flatMap((p) => p.amenities || [])))
        .sort()
        .slice(0, 24),
    [modeProperties]
  );

  const categoriesList = useMemo(() => {
    const list = Array.from(new Set(modeProperties.map((p) => p.category).filter(Boolean)));
    return list.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [modeProperties]);

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
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (selectedAmenities.length > 0) params.set("amenities", selectedAmenities.join(","));
    if (selectedMode === "location_saisonniere" && selectedStanding) params.set("standing", selectedStanding);
    if (selectedMode === "location_saisonniere" && minGuests > 1) params.set("guestsMin", String(minGuests));
    if (isFeaturedOnly) params.set("featured", "true");
    if (priceMax < priceCeiling) params.set("maxPrice", String(priceMax));
    setSearchParams(params, { replace: true });
  }, [
    selectedMode,
    query,
    location,
    checkIn,
    checkOut,
    selectedCategories,
    selectedAmenities,
    selectedStanding,
    minGuests,
    isFeaturedOnly,
    priceMax,
    priceCeiling,
    setSearchParams,
  ]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const toggleAmenity = (amenity: string) => {
    setSelectedAmenities((prev) => (prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]));
  };

  const clearFilters = () => {
    setQuery("");
    setLocation("");
    setCheckIn("");
    setCheckOut("");
    setSelectedCategories([]);
    setSelectedAmenities([]);
    setSelectedStanding("");
    setMinGuests(1);
    setIsFeaturedOnly(false);
    setPriceMax(priceCeiling);
    setSearchParams(new URLSearchParams(`mode=${selectedMode}`), { replace: true });
  };

  const filteredProperties = useMemo(
    () =>
      properties.filter((property) => {
        const mode = property.mode || "location_saisonniere";
        if (mode !== selectedMode) return false;

        const queryValue = query.trim().toLowerCase();
        const inText =
          !queryValue ||
          property.title.toLowerCase().includes(queryValue) ||
          property.location.toLowerCase().includes(queryValue) ||
          property.category.toLowerCase().includes(queryValue) ||
          String(property.reference || "").toLowerCase().includes(queryValue);
        if (!inText) return false;

        if (location && !property.location.toLowerCase().includes(location.toLowerCase())) return false;
        if (selectedCategories.length > 0 && !selectedCategories.includes(property.category)) return false;
        if (!selectedAmenities.every((am) => property.amenities.includes(am))) return false;
        if (Number(property.pricePerNight || 0) > priceMax) return false;
        if (isFeaturedOnly && !property.isFeatured) return false;

        if (selectedMode === "location_saisonniere") {
          if (selectedStanding && property.seasonalConfig?.categorieStanding !== selectedStanding) return false;
          if (Math.max(1, Number(property.guests || 1)) < minGuests) return false;
        }

        return true;
      }),
    [
      properties,
      selectedMode,
      query,
      location,
      selectedCategories,
      selectedAmenities,
      priceMax,
      isFeaturedOnly,
      selectedStanding,
      minGuests,
    ]
  );

  const sortedProperties = useMemo(
    () =>
      [...filteredProperties].sort((a, b) => {
        if (a.isFeatured === b.isFeatured) return 0;
        return a.isFeatured ? -1 : 1;
      }),
    [filteredProperties]
  );

  const activeFiltersCount =
    Number(Boolean(query.trim())) +
    Number(Boolean(location)) +
    Number(Boolean(checkIn)) +
    Number(Boolean(checkOut)) +
    selectedCategories.length +
    selectedAmenities.length +
    Number(Boolean(selectedStanding)) +
    Number(minGuests > 1) +
    Number(Boolean(isFeaturedOnly)) +
    Number(priceMax < priceCeiling);

  return (
    <div className="min-h-screen bg-gray-50 py-12 pt-32">
      <div className="container mx-auto px-4 md:px-6">
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

        <AnimatePresence initial={false}>
          {isFilterOpen && (
            <motion.div
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

              <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-2 md:p-7 lg:grid-cols-4">
                <div className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
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
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="">Tous les emplacements</option>
                    {uniqueLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>

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
                </div>

                <div className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                  <label className="text-sm font-bold text-gray-900">Type de bien</label>
                  <div className="flex flex-wrap gap-2">
                    {categoriesList.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          selectedCategories.includes(cat)
                            ? "border-emerald-500 bg-emerald-100 font-semibold text-emerald-800"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

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
                    </>
                  )}
                </div>

                <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                  <label className="text-sm font-bold text-gray-900">Caracteristiques</label>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {amenitiesList.map((amenity) => (
                      <label key={amenity} className="group flex cursor-pointer items-center gap-2">
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                            selectedAmenities.includes(amenity)
                              ? "border-emerald-600 bg-emerald-600"
                              : "border-gray-300 bg-white group-hover:border-emerald-400"
                          }`}
                        >
                          {selectedAmenities.includes(amenity) && <Check size={14} className="text-white" />}
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={selectedAmenities.includes(amenity)}
                          onChange={() => toggleAmenity(amenity)}
                        />
                        <span className={`text-sm ${selectedAmenities.includes(amenity) ? "font-medium text-gray-900" : "text-gray-600"}`}>
                          {amenity}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-5 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                  <div>
                    <div className="mb-2 flex justify-between">
                      <label className="text-sm font-bold text-gray-900">
                        Prix max {selectedMode === "location_annuelle" ? "/ mois" : "/ nuit"}
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

        <div>
          <div className="mb-6 flex items-center justify-between">
            <span className="font-medium text-gray-500">
              {sortedProperties.length} resultat{sortedProperties.length !== 1 ? "s" : ""} trouve{sortedProperties.length !== 1 ? "s" : ""}
            </span>
          </div>

          {sortedProperties.length > 0 ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {sortedProperties.map((property) => (
                <PropertyCard key={property.id} property={property} searchParams={searchParams.toString()} />
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
      </div>
    </div>
  );
}
