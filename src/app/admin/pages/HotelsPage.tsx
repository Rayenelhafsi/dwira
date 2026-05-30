import { useEffect, useMemo, useState } from "react";
import { Building2, LoaderCircle, RefreshCw, Save, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAdminHotelPricingOverride,
  getAdminHotelPricingRules,
  listHotelCities,
  listHotels,
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
  const [hotels, setHotels] = useState<HotelSummary[]>([]);
  const [globalMarkupPercent, setGlobalMarkupPercent] = useState("0");
  const [rulesByHotelId, setRulesByHotelId] = useState<Record<string, LocalRuleState>>({});
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingHotelId, setSavingHotelId] = useState<string | null>(null);

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
    void loadAll("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredHotels = useMemo(() => {
    if (selectedCityId === "all") return hotels;
    return hotels.filter((hotel) => Number(hotel?.City?.Id || 0) === Number(selectedCityId));
  }, [hotels, selectedCityId]);

  const handleChangeCity = async (next: string) => {
    const nextCityId = next === "all" ? "all" : Number(next);
    setSelectedCityId(nextCityId);
    await loadAll(nextCityId);
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

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr,1fr,auto]">
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
            const apiPrice = resolveHotelApiPrice(hotel);
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
                    {apiPrice == null ? "Non disponible" : formatMoney(apiPrice, hotel.Currency)}
                  </p>
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
