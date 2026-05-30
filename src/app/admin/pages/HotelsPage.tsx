import { useEffect, useMemo, useState } from "react";
import { Building2, LoaderCircle, RefreshCw, Save, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAdminHotelPricingOverride,
  getAdminHotelPricingRules,
  listHotelCities,
  listHotels,
  searchHotels,
  saveAdminHotelGlobalMarkup,
  saveAdminHotelPricingOverride,
  type HotelCity,
  type HotelSummary,
} from "../../services/hotels";

type LocalRuleState = {
  displayedPrice: string;
  markupPercent: string;
};

function toNumberOrNull(value: string): number | null {
  const cleaned = String(value || "").replace(",", ".").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function resolveHotelApiPrice(hotel: HotelSummary): number | null {
  const candidates = [
    hotel?.Price?.PriceWithAffiliateMarkup,
    hotel?.Price?.Price,
    hotel?.Price?.BasePrice,
  ];
  for (const value of candidates) {
    if (value == null) continue;
    const parsed = Number(String(value).replace(",", ".").trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function formatMoney(value: number, currency?: string | null) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ${String(currency || "TND").trim() || "TND"}`;
}

export default function HotelsPage() {
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<HotelCity[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<number | "all">("all");
  const [hotelNameQuery, setHotelNameQuery] = useState("");
  const [hotels, setHotels] = useState<HotelSummary[]>([]);
  const [globalMarkupPercent, setGlobalMarkupPercent] = useState("0");
  const [rulesByHotelId, setRulesByHotelId] = useState<Record<string, LocalRuleState>>({});
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingHotelId, setSavingHotelId] = useState<string | null>(null);
  const [loadingApiPrices, setLoadingApiPrices] = useState(false);
  const [apiCheckIn, setApiCheckIn] = useState("");
  const [apiCheckOut, setApiCheckOut] = useState("");
  const [apiAdults, setApiAdults] = useState("2");
  const [apiChildren, setApiChildren] = useState("0");
  const [apiChildAges, setApiChildAges] = useState<string[]>([]);
  const [apiPricesByHotelId, setApiPricesByHotelId] = useState<Record<string, { value: number; currency?: string | null }>>({});

  const loadAll = async (cityId?: number | "all") => {
    setLoading(true);
    try {
      const [citiesList, rules] = await Promise.all([listHotelCities(), getAdminHotelPricingRules()]);
      const targetCityId = cityId === undefined ? selectedCityId : cityId;
      const hotelsList = await listHotels(targetCityId === "all" ? null : Number(targetCityId));

      const nextRulesByHotelId: Record<string, LocalRuleState> = {};
      for (const rule of rules.overrides || []) {
        nextRulesByHotelId[String(rule.hotelId)] = {
          displayedPrice: rule.displayedPrice == null ? "" : String(rule.displayedPrice),
          markupPercent: String(Number(rule.markupPercent || 0)),
        };
      }

      setCities(Array.isArray(citiesList) ? citiesList : []);
      setHotels(Array.isArray(hotelsList) ? hotelsList : []);
      setGlobalMarkupPercent(String(Number(rules.globalMarkupPercent || 0)));
      setRulesByHotelId(nextRulesByHotelId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de charger les hotels admin");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    end.setDate(end.getDate() + 3);
    const toIsoDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    setApiCheckIn(toIsoDate(start));
    setApiCheckOut(toIsoDate(end));
    void loadAll("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredHotels = useMemo(() => {
    const query = String(hotelNameQuery || "").trim().toLowerCase();
    return hotels.filter((hotel) => {
      const byCity = selectedCityId === "all" ? true : Number(hotel?.City?.Id || 0) === Number(selectedCityId);
      const byName = !query || String(hotel?.Name || "").toLowerCase().includes(query);
      return byCity && byName;
    });
  }, [hotels, selectedCityId, hotelNameQuery]);

  const handleChangeCity = async (next: string) => {
    const nextCityId = next === "all" ? "all" : Number(next);
    setSelectedCityId(nextCityId);
    await loadAll(nextCityId);
  };

  const loadApiPrices = async () => {
    if (!apiCheckIn || !apiCheckOut) {
      toast.error("Dates API obligatoires");
      return;
    }
    const adults = Math.max(1, Number(apiAdults || 1));
    const childrenCount = Math.max(0, Number(apiChildren || 0));
    const childAges = apiChildAges
      .slice(0, childrenCount)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 17);
    if (childAges.length !== childrenCount) {
      toast.error("Veuillez renseigner l'age de chaque enfant (0 a 17)");
      return;
    }
    setLoadingApiPrices(true);
    try {
      const payload = await searchHotels({
        cityId: selectedCityId === "all" ? undefined : Number(selectedCityId),
        checkIn: apiCheckIn,
        checkOut: apiCheckOut,
        adults,
        childAges,
        onlyAvailable: false,
      });
      const nextMap: Record<string, { value: number; currency?: string | null }> = {};
      for (const hotel of Array.isArray(payload) ? payload : []) {
        const id = String(hotel?.Id || "").trim();
        if (!id) continue;
        const price = resolveHotelApiPrice(hotel);
        if (price != null) {
          nextMap[id] = { value: price, currency: hotel?.Currency || null };
        }
      }
      setApiPricesByHotelId(nextMap);
      toast.success("Prix API charges");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de charger les prix API");
    } finally {
      setLoadingApiPrices(false);
    }
  };

  const handleChildrenCountChange = (next: string) => {
    const count = Math.max(0, Number(next || 0));
    setApiChildren(String(count));
    setApiChildAges((prev) => {
      if (count <= prev.length) return prev.slice(0, count);
      return [...prev, ...Array.from({ length: count - prev.length }, () => "")];
    });
  };

  const saveGlobal = async () => {
    const value = toNumberOrNull(globalMarkupPercent);
    if (value == null) {
      toast.error("Pourcentage global invalide");
      return;
    }
    setSavingGlobal(true);
    try {
      const rules = await saveAdminHotelGlobalMarkup(value);
      setGlobalMarkupPercent(String(Number(rules.globalMarkupPercent || 0)));
      toast.success("Majoration globale enregistree");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la sauvegarde");
    } finally {
      setSavingGlobal(false);
    }
  };

  const saveHotel = async (hotel: HotelSummary) => {
    const hotelId = String(hotel.Id);
    const localRule = rulesByHotelId[hotelId] || { displayedPrice: "", markupPercent: "0" };
    const displayedPrice = toNumberOrNull(localRule.displayedPrice);
    const markupPercent = toNumberOrNull(localRule.markupPercent);
    if (markupPercent == null) {
      toast.error("Pourcentage hotel invalide");
      return;
    }
    setSavingHotelId(hotelId);
    try {
      const rules = await saveAdminHotelPricingOverride(hotelId, {
        hotelName: hotel.Name || null,
        hotelCityId: hotel.City?.Id == null ? null : String(hotel.City.Id),
        hotelCityName: hotel.City?.Name || null,
        displayedPrice,
        markupPercent,
      });
      const saved = (rules.overrides || []).find((item) => String(item.hotelId) === hotelId);
      if (saved) {
        setRulesByHotelId((prev) => ({
          ...prev,
          [hotelId]: {
            displayedPrice: saved.displayedPrice == null ? "" : String(saved.displayedPrice),
            markupPercent: String(Number(saved.markupPercent || 0)),
          },
        }));
      }
      toast.success("Reglage hotel enregistre");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la sauvegarde");
    } finally {
      setSavingHotelId(null);
    }
  };

  const resetHotel = async (hotelId: string) => {
    setSavingHotelId(hotelId);
    try {
      await deleteAdminHotelPricingOverride(hotelId);
      setRulesByHotelId((prev) => {
        const next = { ...prev };
        delete next[hotelId];
        return next;
      });
      toast.success("Reglage hotel supprime");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de supprimer ce reglage");
    } finally {
      setSavingHotelId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">Admin Hotels</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Tarification hotels</h1>
            <p className="mt-2 text-sm text-gray-500">Cards par hotel avec filtre ville et regles de prix client.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadAll(selectedCityId)}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            <RefreshCw size={16} />
            Actualiser
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr,320px,220px,auto]">
          <label className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Search size={14} />
              Filtre ville
            </span>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={selectedCityId}
              onChange={(event) => void handleChangeCity(event.target.value)}
            >
              <option value="all">Toutes les villes</option>
              {cities.map((city) => (
                <option key={city.Id} value={city.Id}>
                  {city.Name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Search size={14} />
              Recherche hotel
            </span>
            <input
              value={hotelNameQuery}
              onChange={(event) => setHotelNameQuery(event.target.value)}
              placeholder="Nom de l'hotel"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <SlidersHorizontal size={14} />
              Majoration globale (%)
            </span>
            <input
              value={globalMarkupPercent}
              onChange={(event) => setGlobalMarkupPercent(event.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={() => void saveGlobal()}
            disabled={savingGlobal}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingGlobal ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
            Sauver global
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr,1fr,120px,120px,auto]">
          <input
            type="date"
            value={apiCheckIn}
            onChange={(event) => setApiCheckIn(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={apiCheckOut}
            onChange={(event) => setApiCheckOut(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            value={apiAdults}
            onChange={(event) => setApiAdults(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Adultes"
          />
          <input
            type="number"
            min={0}
            value={apiChildren}
            onChange={(event) => handleChildrenCountChange(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Enfants"
          />
          <button
            type="button"
            onClick={() => void loadApiPrices()}
            disabled={loadingApiPrices}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingApiPrices ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Charger prix API
          </button>
        </div>

        {Math.max(0, Number(apiChildren || 0)) > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: Math.max(0, Number(apiChildren || 0)) }).map((_, index) => (
              <input
                key={`child-age-${index}`}
                type="number"
                min={0}
                max={17}
                value={apiChildAges[index] || ""}
                onChange={(event) =>
                  setApiChildAges((prev) => {
                    const next = [...prev];
                    next[index] = event.target.value;
                    return next;
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder={`Age enfant ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-10 shadow-sm">
          <div className="flex items-center justify-center gap-3 text-slate-500">
            <LoaderCircle size={18} className="animate-spin" />
            Chargement des hotels...
          </div>
        </div>
      ) : filteredHotels.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Aucun hotel disponible pour ce filtre.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredHotels.map((hotel) => {
            const hotelId = String(hotel.Id);
            const localRule = rulesByHotelId[hotelId] || { displayedPrice: "", markupPercent: "0" };
            const listPrice = resolveHotelApiPrice(hotel);
            const searchedApiPrice = apiPricesByHotelId[hotelId]?.value;
            const searchedApiCurrency = apiPricesByHotelId[hotelId]?.currency;
            const apiPrice = searchedApiPrice ?? listPrice;
            const apiCurrency = searchedApiCurrency ?? hotel.Currency;
            const globalPct = Number(globalMarkupPercent || 0);
            const hotelPct = Number(localRule.markupPercent || 0);
            const basePrice = apiPrice;
            const fallbackComputedFinal = basePrice == null ? null : Math.round(basePrice * (1 + ((globalPct + hotelPct) / 100)) * 100) / 100;
            const displayedPriceOverride = toNumberOrNull(localRule.displayedPrice);
            const finalPrice = displayedPriceOverride ?? fallbackComputedFinal;
            return (
              <article key={hotelId} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  {hotel.Image ? (
                    <img src={hotel.Image} alt={hotel.Name} className="h-16 w-20 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-20 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <Building2 size={20} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900">{hotel.Name}</p>
                    <p className="mt-1 text-sm text-slate-500">{hotel.City?.Name || "Ville inconnue"}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">Prix API</p>
                  <p className="mt-1 text-sm font-semibold text-sky-900">
                    {apiPrice == null ? "Non disponible" : formatMoney(apiPrice, apiCurrency)}
                  </p>
                </div>

                <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <p><span className="font-semibold">Prix base:</span> {basePrice == null ? "Non disponible" : formatMoney(basePrice, apiCurrency)}</p>
                  <p><span className="font-semibold">Majoration globale:</span> {globalPct}%</p>
                  <p><span className="font-semibold">Majoration hotel:</span> {hotelPct}%</p>
                  <p><span className="font-semibold">Prix final:</span> {finalPrice == null ? "Non disponible" : formatMoney(finalPrice, apiCurrency)}</p>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Prix affiche client (optionnel)</span>
                    <input
                      value={localRule.displayedPrice}
                      onChange={(event) =>
                        setRulesByHotelId((prev) => ({
                          ...prev,
                          [hotelId]: { ...localRule, displayedPrice: event.target.value },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      placeholder={apiPrice == null ? "Ex: 220" : `API: ${apiPrice}`}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Majoration hotel (%)</span>
                    <input
                      value={localRule.markupPercent}
                      onChange={(event) =>
                        setRulesByHotelId((prev) => ({
                          ...prev,
                          [hotelId]: { ...localRule, markupPercent: event.target.value },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Ex: 10"
                    />
                  </label>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void saveHotel(hotel)}
                    disabled={savingHotelId === hotelId}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingHotelId === hotelId ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                    Sauver
                  </button>
                  <button
                    type="button"
                    onClick={() => void resetHotel(hotelId)}
                    disabled={savingHotelId === hotelId}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 size={14} />
                    Reset
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
