import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  AlertCircle,
  BedDouble,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  X,
  Search,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Star,
  TicketPercent,
  Users,
} from "lucide-react";
import { SmartImage } from "../components/SmartImage";
import { getHotelConfig, listHotelCities, listHotels, searchHotels, type HotelCity, type HotelSummary } from "../services/hotels";
import {
  extractHotelBoardingNames,
  extractHotelMinPrice,
  flattenHotelRoomOffers,
  formatHotelStarLabel,
  getHotelCardDescription,
  getHotelFacilityTitles,
  pickHotelDisplayedPrice,
} from "../utils/hotelHelpers";

const HOTEL_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1280 720'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23dbeafe'/%3E%3Cstop offset='100%25' stop-color='%23fde68a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1280' height='720' fill='url(%23g)'/%3E%3Cpath d='M0 530h1280v190H0z' fill='%230f766e' fill-opacity='0.18'/%3E%3Cpath d='M220 500V280l170-90 170 90v220H220zm410 0V230l120-70 120 70v270H630zm330 0V320l95-50 95 50v180H960z' fill='%23ffffff' fill-opacity='0.72'/%3E%3C/svg%3E";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDefaultSearch() {
  const today = new Date();
  const checkIn = new Date(today);
  checkIn.setDate(checkIn.getDate() + 7);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);
  return {
    checkIn: toDateInputValue(checkIn),
    checkOut: toDateInputValue(checkOut),
    adults: 2,
    childAges: [] as number[],
  };
}

function formatPrice(value: number | null) {
  if (!Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value));
}

function buildMapsLink(hotel: HotelSummary) {
  const latitude = String(hotel?.Localization?.Latitude || "").trim();
  const longitude = String(hotel?.Localization?.Longitude || "").trim();
  if (!latitude || !longitude) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function getClientFacingHotelError(message: string) {
  const normalized = String(message || "").toLowerCase();
  if (!normalized) {
    return "Notre selection d'hotels est temporairement indisponible. Merci de reessayer un peu plus tard.";
  }
  if (
    normalized.includes("not configured")
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

function hasHotelPromotion(hotel: HotelSummary) {
  const promotion = hotel?.Promotion;
  if (!promotion || typeof promotion !== "object") return false;
  return Boolean(
    String(promotion.Title || "").trim()
    || String(promotion.Description || "").trim()
    || Number(promotion.Rate || 0) > 0
  );
}

export default function HotelsPage() {
  const defaults = useMemo(() => buildDefaultSearch(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialHasSearchParams = useMemo(
    () => Boolean(searchParams.get("cityId") && searchParams.get("checkIn") && searchParams.get("checkOut")),
    [searchParams]
  );
  const [configReady, setConfigReady] = useState<boolean | null>(null);
  const [providerError, setProviderError] = useState("");
  const [cities, setCities] = useState<HotelCity[]>([]);
  const [results, setResults] = useState<HotelSummary[]>([]);
  const [searchFallbackNotice, setSearchFallbackNotice] = useState("");
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [hasSearched, setHasSearched] = useState(initialHasSearchParams);
  const [cityId, setCityId] = useState<number>(() => Number(searchParams.get("cityId") || 0) || 0);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [travellersOpen, setTravellersOpen] = useState(false);
  const [cityHotels, setCityHotels] = useState<HotelSummary[]>([]);
  const [loadingCityHotels, setLoadingCityHotels] = useState(false);
  const [checkIn, setCheckIn] = useState(() => searchParams.get("checkIn") || defaults.checkIn);
  const [checkOut, setCheckOut] = useState(() => searchParams.get("checkOut") || defaults.checkOut);
  const [adults, setAdults] = useState(() => Math.max(1, Number(searchParams.get("adults") || defaults.adults)));
  const [childAges, setChildAges] = useState<number[]>(() => {
    const parsed = String(searchParams.get("children") || "")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17);
    return parsed.length > 0 ? parsed : defaults.childAges;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await getHotelConfig();
        if (cancelled) return;
        setConfigReady(config.configured);
      } catch (error) {
        if (!cancelled) {
          setConfigReady(false);
          setProviderError(error instanceof Error ? error.message : "Configuration hoteliere indisponible.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingCities(true);
    void (async () => {
      try {
        const nextCities = await listHotelCities();
        if (cancelled) return;
        setCities(nextCities);
        setProviderError("");
      } catch (error) {
        if (!cancelled) {
          setProviderError(error instanceof Error ? error.message : "Chargement des villes impossible.");
          setCities([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingCities(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = async (options?: { replace?: boolean }) => {
    const nextChildAges = [...childAges];
    const keywords = destinationQuery.trim();
    setHasSearched(true);
    setLoadingResults(true);
    setProviderError("");
    setSearchFallbackNotice("");

    try {
      const hotels = await searchHotels({
        cityId: cityId || undefined,
        checkIn,
        checkOut,
        adults,
        childAges: nextChildAges,
        keywords: keywords || undefined,
        onlyAvailable: true,
      });
      if (hotels.length === 0 && nextChildAges.length > 0 && cityId > 0) {
        const fallbackHotels = await listHotels(cityId);
        const normalizedKeywords = keywords.toLowerCase();
        const filteredFallback = Array.isArray(fallbackHotels)
          ? fallbackHotels.filter((hotel) => {
              const byKeyword = !normalizedKeywords || String(hotel.Name || "").toLowerCase().includes(normalizedKeywords);
              return byKeyword;
            })
          : [];
        setResults(filteredFallback);
        setSearchFallbackNotice(hotelUnavailableMessage);
      } else {
        setResults(hotels);
      }

      const nextParams = new URLSearchParams();
      if (cityId > 0) nextParams.set("cityId", String(cityId));
      nextParams.set("checkIn", checkIn);
      nextParams.set("checkOut", checkOut);
      nextParams.set("adults", String(adults));
      if (nextChildAges.length > 0) nextParams.set("children", nextChildAges.join(","));
      if (keywords) nextParams.set("q", keywords);
      setSearchParams(nextParams, { replace: Boolean(options?.replace) });
    } catch (error) {
      setResults([]);
      setProviderError(error instanceof Error ? error.message : "Recherche hoteliere impossible.");
    } finally {
      setLoadingResults(false);
    }
  };

  useEffect(() => {
    if (!cityId || !checkIn || !checkOut) return;
    if (loadingCities) return;
    void runSearch({ replace: true });
    // Intentionally run once after initial query-state hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCities]);

  useEffect(() => {
    const selected = cities.find((item) => Number(item.Id) === Number(cityId));
    if (selected && !destinationQuery.trim()) {
      setDestinationQuery(selected.Name);
    }
  }, [cities, cityId, destinationQuery]);

  useEffect(() => {
    let cancelled = false;
    if (!cityId) {
      setCityHotels([]);
      setLoadingCityHotels(false);
      return;
    }
    setLoadingCityHotels(true);
    void (async () => {
      try {
        const hotels = await listHotels(cityId);
        if (!cancelled) setCityHotels(Array.isArray(hotels) ? hotels : []);
      } catch {
        if (!cancelled) setCityHotels([]);
      } finally {
        if (!cancelled) setLoadingCityHotels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  const selectedCity = cities.find((item) => Number(item.Id) === Number(cityId)) || null;
  const childrenCount = childAges.length;
  const hotelUnavailableMessage =
    "Cet hotel n'a aucune offre disponible pour votre choix veuillez changer vos filtres ou consultez les alternatives disponibles.";
  const childrenAvailabilityHint = childrenCount > 0
    ? "La disponibilite depend aussi de l'age des enfants renseignes. Si la recherche exacte ne retourne rien, on affiche les hotels de la ville pour que vous puissiez ajuster."
    : "";
  const destinationNeedle = destinationQuery.trim().toLowerCase();
  const matchingCities = useMemo(
    () => cities.filter((city) => !destinationNeedle || String(city.Name || "").toLowerCase().includes(destinationNeedle)).slice(0, 12),
    [cities, destinationNeedle]
  );
  const matchingHotelsInCity = useMemo(
    () => cityHotels.filter((hotel) => !destinationNeedle || String(hotel.Name || "").toLowerCase().includes(destinationNeedle)),
    [cityHotels, destinationNeedle]
  );
  const publicErrorMessage = providerError ? getClientFacingHotelError(providerError) : "";
  const sortedResults = useMemo(
    () => [...results].sort((left, right) => {
      const leftPromotion = hasHotelPromotion(left) ? 1 : 0;
      const rightPromotion = hasHotelPromotion(right) ? 1 : 0;
      if (leftPromotion !== rightPromotion) {
        return rightPromotion - leftPromotion;
      }

      const leftRecommended = Number(left?.Recommended || 0);
      const rightRecommended = Number(right?.Recommended || 0);
      if (leftRecommended !== rightRecommended) {
        return rightRecommended - leftRecommended;
      }

      const leftPrice = extractHotelMinPrice(left) ?? Number.POSITIVE_INFINITY;
      const rightPrice = extractHotelMinPrice(right) ?? Number.POSITIVE_INFINITY;
      if (leftPrice !== rightPrice) {
        return leftPrice - rightPrice;
      }

      return String(left?.Name || "").localeCompare(String(right?.Name || ""), "fr");
    }),
    [results]
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eff6ff_35%,#ffffff_100%)]">
      <section className="relative overflow-hidden border-b border-sky-100 bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_35%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.28),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(12,74,110,0.88))]" />
        <div className="relative container mx-auto px-4 py-20 md:px-6 md:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-sky-100 backdrop-blur">
              <Sparkles size={14} />
              Selection sejours
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Trouvez l'hotel ideal pour votre prochain sejour.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-sky-50/88 md:text-lg">
              Explorez notre selection d'hotels, comparez les disponibilites et consultez les details utiles pour organiser votre voyage en toute simplicite.
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto -mt-12 px-4 pb-12 md:px-6">
        <div className="rounded-[32px] border border-white/70 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur md:p-6">
          <div className="grid gap-4 md:grid-cols-12">
            <button
              type="button"
              onClick={() => setDestinationOpen(true)}
              className="md:col-span-4 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-left text-slate-900 outline-none transition hover:bg-white hover:border-sky-300"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MapPin size={16} className="text-sky-600" />
                {destinationQuery.trim() || selectedCity?.Name || "Ville ou nom hotel"}
              </span>
            </button>

            <label className="md:col-span-2">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Users size={16} className="text-sky-600" />
                Voyageurs
              </span>
              <button
                type="button"
                onClick={() => setTravellersOpen((prev) => !prev)}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-left text-slate-900 outline-none transition hover:bg-white hover:border-sky-300"
              >
                {adults} adultes - {childrenCount} enfants
              </button>
              {childrenAvailabilityHint && (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {childrenAvailabilityHint}
                </p>
              )}
            </label>

            <label className="md:col-span-3">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarDays size={16} className="text-sky-600" />
                Arrivee
              </span>
              <input
                type="date"
                value={checkIn}
                onChange={(event) => setCheckIn(event.target.value)}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white"
              />
            </label>

            <label className="md:col-span-3">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarDays size={16} className="text-sky-600" />
                Depart
              </span>
              <input
                type="date"
                value={checkOut}
                onChange={(event) => setCheckOut(event.target.value)}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white"
              />
            </label>

          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              {selectedCity ? `Destination selectionnee : ${selectedCity.Name}.` : "Selectionnez une destination pour lancer votre recherche."}
            </div>
            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={!cityId || loadingResults}
              className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loadingResults ? <LoaderCircle size={18} className="animate-spin" /> : <Search size={18} />}
              Rechercher
            </button>
          </div>

          {publicErrorMessage && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Offres temporairement indisponibles</p>
                  <p className="mt-1">{publicErrorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {configReady === false && !publicErrorMessage && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Les offres hotelieres seront disponibles tres prochainement.
            </div>
          )}
        </div>
      </section>

      {destinationOpen && (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            <h3 className="text-xl font-semibold text-slate-900">Indiquez la destination</h3>
            <button type="button" onClick={() => setDestinationOpen(false)} className="rounded-full p-2 text-slate-700">
              <X size={22} />
            </button>
          </div>
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-3">
              <Search size={18} className="text-slate-500" />
              <input
                value={destinationQuery}
                onChange={(event) => setDestinationQuery(event.target.value)}
                placeholder="ex. ville, nom hotel"
                className="w-full border-0 bg-transparent text-base outline-none"
              />
            </div>
          </div>
          <div className="max-h-[calc(100vh-140px)] overflow-y-auto">
            {matchingCities.map((city) => (
              <button
                key={`city-${city.Id}`}
                type="button"
                onClick={() => {
                  setCityId(city.Id);
                  setDestinationQuery(city.Name);
                  setDestinationOpen(false);
                }}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-4 text-left"
              >
                <MapPin size={18} className="text-slate-500" />
                <div>
                  <p className="text-base font-semibold text-slate-900">{city.Name}</p>
                  <p className="text-sm text-slate-500">Tunisie</p>
                </div>
              </button>
            ))}
            {cityId > 0 && matchingHotelsInCity.map((hotel) => (
              <button
                key={`hotel-${hotel.Id}`}
                type="button"
                onClick={() => {
                  setDestinationQuery(hotel.Name);
                  setDestinationOpen(false);
                }}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-4 text-left"
              >
                <BedDouble size={18} className="text-slate-500" />
                <div>
                  <p className="text-base font-semibold text-slate-900">{hotel.Name}</p>
                  <p className="text-sm text-slate-500">{hotel.City?.Name || selectedCity?.Name || "Hotel"}</p>
                </div>
              </button>
            ))}
            {loadingCityHotels && (
              <div className="px-4 py-4 text-sm text-slate-500">Chargement des hotels...</div>
            )}
          </div>
        </div>
      )}

      {travellersOpen && (
        <div className="mt-[-28px] container mx-auto px-4 pb-6 md:px-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Adultes</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setAdults((prev) => Math.max(1, prev - 1))} className="rounded-lg border border-slate-300 p-2"><Minus size={16} /></button>
                <span className="w-6 text-center font-semibold">{adults}</span>
                <button type="button" onClick={() => setAdults((prev) => Math.min(8, prev + 1))} className="rounded-lg border border-slate-300 p-2"><Plus size={16} /></button>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Enfants</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setChildAges((prev) => prev.slice(0, Math.max(0, prev.length - 1)))}
                  className="rounded-lg border border-slate-300 p-2"
                ><Minus size={16} /></button>
                <span className="w-6 text-center font-semibold">{childrenCount}</span>
                <button
                  type="button"
                  onClick={() => setChildAges((prev) => [...prev, 0])}
                  className="rounded-lg border border-slate-300 p-2"
                ><Plus size={16} /></button>
              </div>
            </div>
            {childrenCount > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {childAges.map((age, index) => (
                  <label key={`child-age-${index}`} className="text-xs text-slate-600">
                    Age enfant {index + 1}
                    <select
                      value={age}
                      onChange={(event) => setChildAges((prev) => {
                        const next = [...prev];
                        next[index] = Number(event.target.value) || 0;
                        return next;
                      })}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      {Array.from({ length: 18 }).map((_, ageOption) => (
                        <option key={`age-opt-${index}-${ageOption}`} value={ageOption}>{ageOption} ans</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setTravellersOpen(false)}
              className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {hasSearched && (
        <section className="container mx-auto px-4 pb-20 md:px-6">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Resultats hotels</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {loadingResults ? "Recherche en cours..." : `${sortedResults.length} hotel${sortedResults.length > 1 ? "s" : ""} trouve${sortedResults.length > 1 ? "s" : ""}`}
              </h2>
            </div>
            <p className="max-w-xl text-sm text-slate-500">
              Consultez les disponibilites et les informations utiles pour les dates selectionnees.
            </p>
          </div>

          {loadingResults && (
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

          {!loadingResults && results.length === 0 && (
            <div className="rounded-[32px] border border-dashed border-slate-200 bg-white/90 px-6 py-14 text-center shadow-sm">
              <p className="text-lg font-semibold text-slate-900">Aucun hotel disponible pour cette recherche.</p>
              <p className="mt-2 text-sm text-slate-500">
                Essayez une autre destination ou modifiez vos dates pour decouvrir davantage d'offres.
              </p>
              {childrenCount > 0 && !searchFallbackNotice && (
                <p className="mt-3 text-sm text-slate-600">
                  La disponibilite peut aussi varier selon l'age des enfants renseignes.
                </p>
              )}
            </div>
          )}

          {!loadingResults && searchFallbackNotice && results.length > 0 && (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {searchFallbackNotice}
            </div>
          )}

          {!loadingResults && sortedResults.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {sortedResults.map((hotel) => {
                const minPrice = extractHotelMinPrice(hotel);
                const roomOffers = flattenHotelRoomOffers(hotel);
                const leadOffer = roomOffers.find((offer) => pickHotelDisplayedPrice(offer.room) !== null) || roomOffers[0] || null;
                const leadOfferPrice = leadOffer ? pickHotelDisplayedPrice(leadOffer.room) : null;
                const boardings = extractHotelBoardingNames(hotel).slice(0, 2);
                const facilities = getHotelFacilityTitles(hotel.Facilities, 5);
                const hasPromotion = hasHotelPromotion(hotel);
                const hasRefundableOffer = roomOffers.some((offer) => !offer.room?.NotRefundable);
                const totalAvailability = roomOffers.reduce((sum, offer) => sum + Math.max(0, Number(offer.room?.Quantity || 0)), 0);

                const detailParams = new URLSearchParams(searchParams);
                if (!detailParams.get("cityId") && hotel.City?.Id) {
                  detailParams.set("cityId", String(hotel.City.Id));
                }
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
                        <SmartImage
                          src={String(hotel.Image || "").trim() || HOTEL_FALLBACK_IMAGE}
                          alt={hotel.Name}
                          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                          targetWidth={960}
                          quality={70}
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
                            A partir de {formatPrice(leadOfferPrice ?? minPrice)} TND
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

                      {searchFallbackNotice && (
                        <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                          {hotelUnavailableMessage}
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            <TicketPercent size={14} className="text-sky-600" />
                            Tarif client
                          </div>
                          <p className="mt-2 text-lg font-semibold text-slate-900">
                            {leadOfferPrice !== null ? `${formatPrice(leadOfferPrice)} TND` : minPrice !== null ? `${formatPrice(minPrice)} TND` : "Sur demande"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {leadOffer?.boardingName || "Selon les chambres et les dates"}
                          </p>
                        </div>

                        <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            Disponibilite
                          </div>
                          <p className="mt-2 text-lg font-semibold text-slate-900">
                            {totalAvailability > 0 ? `${totalAvailability} option${totalAvailability > 1 ? "s" : ""}` : "Selon confirmation"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {hasPromotion ? "Promotion signalee sur cette offre" : "Capacite retournee pour vos dates"}
                          </p>
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
                        {hasPromotion && (
                          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                            <Sparkles size={13} />
                            Promotion disponible
                          </span>
                        )}
                      </div>

                      {facilities.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {facilities.map((label) => (
                            <span key={`${hotel.Id}-${label}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          {boardings.map((item) => (
                            <span key={`${hotel.Id}-boarding-${item}`} className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 font-medium text-sky-700">
                              {item}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3">
                          {buildMapsLink(hotel) && (
                            <a
                              href={buildMapsLink(hotel)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
                            >
                              Carte <ExternalLink size={14} />
                            </a>
                          )}
                          <Link to={linkTo} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
                            Voir le detail
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
