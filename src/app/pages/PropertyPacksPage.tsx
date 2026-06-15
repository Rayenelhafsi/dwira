import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { motion } from "motion/react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Crown,
  Filter,
  Heart,
  Home,
  MapPinned,
  Search,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { useProperties } from "../context/PropertiesContext";
import type { PropertyPack } from "../admin/types";
import { formatTnd } from "../utils/amicalePricing";
import { buildPropertyPackPath, getPackSearchContextFromParams, resolvePublicPropertyPacks } from "../utils/propertyPacks";
import { SmartImage } from "../components/SmartImage";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const themeIcons = {
  famille: Home,
  romantique: Heart,
  luxe: Crown,
  decouverte: MapPinned,
  affaires: BriefcaseBusiness,
  exclusive: Sparkles,
} as const;

export default function PropertyPacksPage() {
  const { properties, loading } = useProperties();
  const [searchParams] = useSearchParams();
  const [packs, setPacks] = useState<PropertyPack[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [activeTheme, setActiveTheme] = useState("all");
  const [sortBy, setSortBy] = useState<"remise" | "prix_asc" | "prix_desc">("remise");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/property-packs`);
        if (!response.ok) throw new Error("property-packs");
        const rows = await response.json();
        if (!cancelled) setPacks(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setPacks([]);
      } finally {
        if (!cancelled) setPacksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchContext = useMemo(() => getPackSearchContextFromParams(searchParams), [searchParams]);
  const resolvedPacks = useMemo(
    () => resolvePublicPropertyPacks(packs, properties, searchContext),
    [packs, properties, searchContext]
  );
  const persistedQuery = searchParams.toString();
  const hasSearchIntent = Boolean(
    searchContext.checkIn
    || searchContext.checkOut
    || searchContext.guestsMin > 0
    || searchContext.locations.length > 0
    || searchContext.categories.length > 0
    || searchContext.mainTypes.length > 0
  );

  const themeOptions = useMemo(() => {
    const seen = new Set<string>();
    return resolvedPacks
      .map((pack) => pack.theme)
      .filter((theme) => {
        if (seen.has(theme.key)) return false;
        seen.add(theme.key);
        return true;
      });
  }, [resolvedPacks]);

  const filteredPacks = useMemo(() => {
    const visible = resolvedPacks.filter((pack) => activeTheme === "all" || pack.theme.key === activeTheme);
    return [...visible].sort((a, b) => {
      if (sortBy === "prix_asc") return a.totalNightlyPrice - b.totalNightlyPrice;
      if (sortBy === "prix_desc") return b.totalNightlyPrice - a.totalNightlyPrice;
      return b.properties.length - a.properties.length || b.maxGuests - a.maxGuests;
    });
  }, [resolvedPacks, activeTheme, sortBy]);

  const featuredPacks = activeTheme === "all" ? filteredPacks.slice(0, 2) : [];
  const otherPacks = activeTheme === "all" ? filteredPacks.slice(2) : filteredPacks;

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.16),transparent_28%),linear-gradient(135deg,#065f46_0%,#047857_45%,#0f766e_100%)] text-white">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.05),transparent_35%,rgba(255,255,255,0.04)_70%,transparent)]" />
        <div className="container relative mx-auto px-4 py-16 md:px-6 md:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/40 bg-yellow-300/10 px-5 py-2 text-sm font-semibold text-yellow-200 backdrop-blur-sm">
              <Sparkles className="h-4 w-4" />
              Offres groupees exclusives
            </div>
            <h1 className="mt-8 text-5xl font-black tracking-tight md:text-7xl">
              Nos Packs
              <span className="block text-yellow-300">Immobilier</span>
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-base text-emerald-50/85 md:text-2xl">
              Combinez plusieurs logements et presentez a vos clients des selections plus lisibles, plus coherentes et plus vendeuses.
            </p>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-sm">
                <div className="text-4xl font-black">{resolvedPacks.length}</div>
                <p className="mt-2 text-sm text-emerald-50/75">Packs disponibles</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-sm">
                <div className="text-4xl font-black">
                  {resolvedPacks.reduce((sum, pack) => sum + pack.properties.length, 0)}
                </div>
                <p className="mt-2 text-sm text-emerald-50/75">Logements regroupes</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-sm">
                <div className="text-4xl font-black">100%</div>
                <p className="mt-2 text-sm text-emerald-50/75">Presentation personnalisable</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10 md:px-6 md:py-14">
        {(packsLoading || loading) && (
          <div className="rounded-[32px] border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-500">Chargement des packs...</p>
          </div>
        )}

        {!packsLoading && !loading && resolvedPacks.length === 0 && (
          <div className="rounded-[32px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">Aucun pack disponible</h2>
            <p className="mt-3 text-sm text-slate-500">Les packs publics apparaitront ici des qu&apos;ils seront prets.</p>
          </div>
        )}

        {!packsLoading && !loading && resolvedPacks.length > 0 && (
          <div className="space-y-10">
            {hasSearchIntent ? (
              <section className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(135deg,#ffffff_0%,#f6fffb_58%,#eefbf6_100%)] p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  {searchContext.checkIn && searchContext.checkOut ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                      <CalendarDays className="h-4 w-4 text-emerald-600" />
                      {searchContext.checkIn} au {searchContext.checkOut}
                    </span>
                  ) : null}
                  {searchContext.guestsMin > 0 ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                      <Users className="h-4 w-4 text-rose-500" />
                      {searchContext.guestsMin} voyageur{searchContext.guestsMin > 1 ? "s" : ""} min
                    </span>
                  ) : null}
                  {searchContext.mainTypes.map((type) => (
                    <span key={`type-${type}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                      <Home className="h-4 w-4 text-sky-600" />
                      {type}
                    </span>
                  ))}
                  {searchContext.locations.map((location) => (
                    <span key={`location-${location}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                      <MapPinned className="h-4 w-4 text-emerald-700" />
                      {location}
                    </span>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
                    {resolvedPacks.length} pack{resolvedPacks.length > 1 ? "s" : ""} trouves
                  </span>
                </div>
              </section>
            ) : null}

            {featuredPacks.length > 0 ? (
              <section className="space-y-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 fill-current" />
                  <h2 className="text-2xl font-black text-slate-950">Packs vedettes</h2>
                </div>
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  {featuredPacks.map((pack, index) => (
                    <motion.article
                      key={pack.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08 }}
                      className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_54px_rgba(15,23,42,0.10)]"
                    >
                      <PackCard pack={pack} featured persistedQuery={persistedQuery} />
                    </motion.article>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTheme("all")}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    activeTheme === "all"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:text-emerald-700"
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  Tous les packs
                </button>
                {themeOptions.map((theme) => {
                  const ThemeIcon = themeIcons[theme.key];
                  const selected = activeTheme === theme.key;
                  return (
                    <button
                      key={theme.key}
                      type="button"
                      onClick={() => setActiveTheme(theme.key)}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        selected ? `${theme.softClass} shadow-sm` : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <ThemeIcon className="h-4 w-4" />
                      {theme.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 outline-none focus:border-emerald-300"
                >
                  <option value="remise">Mise en avant</option>
                  <option value="prix_asc">Prix croissant</option>
                  <option value="prix_desc">Prix decroissant</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-slate-500">{filteredPacks.length} pack{filteredPacks.length > 1 ? "s" : ""} trouves</p>
              <Link
                to="/logements?mode=location_saisonniere"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-200 hover:text-emerald-700"
              >
                <Search className="h-4 w-4" />
                Voir tous les logements
              </Link>
            </div>

            {otherPacks.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {otherPacks.map((pack, index) => (
                  <motion.article
                    key={pack.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }}
                  className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_54px_rgba(15,23,42,0.10)]"
                  >
                    <PackCard pack={pack} persistedQuery={persistedQuery} />
                  </motion.article>
                ))}
              </div>
            ) : null}

            <div className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_20%_40%,rgba(255,255,255,0.10),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(251,191,36,0.22),transparent_24%),linear-gradient(135deg,#0f766e_0%,#047857_48%,#065f46_100%)] px-8 py-12 text-center text-white shadow-[0_22px_52px_rgba(6,95,70,0.24)]">
              <h3 className="text-3xl font-black">Vous ne trouvez pas le pack ideal ?</h3>
              <p className="mx-auto mt-3 max-w-2xl text-base text-emerald-50/85">
                Contactez-nous pour creer un pack sur-mesure adapte a votre sejour, votre budget ou votre groupe.
              </p>
              <Link
                to="/contact"
                className="mt-7 inline-flex items-center justify-center rounded-2xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
              >
                Demander un pack personnalise
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function PackCard({
  pack,
  featured = false,
  persistedQuery,
}: {
  pack: ReturnType<typeof resolvePublicPropertyPacks>[number];
  featured?: boolean;
  persistedQuery?: string;
}) {
  const packHref = persistedQuery ? `${buildPropertyPackPath(pack)}?${persistedQuery}` : buildPropertyPackPath(pack);

  return (
    <Link to={packHref} className="group flex h-full flex-col">
      <div className={`relative overflow-hidden ${featured ? "h-56 md:h-64" : "h-56"}`}>
        <SmartImage
          src={pack.coverImage}
          alt={pack.name}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          targetWidth={1200}
          quality={60}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
        <div className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${pack.theme.pillClass}`}>
          {pack.theme.label}
        </div>
        <div className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-800 shadow-md">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-500" />
            {featured ? "Bestseller" : "Pack compose"}
          </span>
        </div>
        <div className="absolute bottom-4 right-4 rounded-xl bg-rose-500 px-2.5 py-1 text-xs font-black text-white shadow-lg">
          {pack.properties.length} / {pack.rootPropertyCount} biens
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <h3 className={`${featured ? "text-4xl" : "text-2xl"} font-black leading-tight drop-shadow-md`}>{pack.name}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {pack.locationPills.map((location) => (
              <span key={`${pack.id}-${location}`} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {location}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="mb-4 line-clamp-3 text-sm leading-7 text-slate-600">{pack.shortDescription}</p>

        <div className="mb-4 flex flex-wrap gap-2">
          {pack.featureTags.map((tag) => (
            <span key={`${pack.id}-${tag}`} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {tag}
            </span>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
          <div className="flex items-center gap-1.5">
            <Home size={14} className="text-emerald-600" />
            <span>{pack.properties.length} logement{pack.properties.length > 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-rose-500" />
            <span>jusqu&apos;a {pack.maxGuests} pers.</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock3 size={14} className="text-sky-600" />
            <span>{pack.minStayNights} nuits min</span>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          {pack.galleryImages.slice(0, 3).map((image, index) => (
            <div key={`${pack.id}-thumb-${index}`} className="relative h-14 flex-1 overflow-hidden rounded-xl bg-slate-100">
              <SmartImage
                src={image}
                alt={`${pack.name} ${index + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                targetWidth={220}
                quality={44}
              />
              <div className="absolute inset-0 bg-black/10" />
            </div>
          ))}
        </div>

        <div className="mb-5 space-y-2 rounded-[22px] border border-slate-100 bg-slate-50/80 p-4">
          {pack.propertyLines.map((line) => (
            <div key={`${pack.id}-${line}`} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>{line}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-4 border-t border-slate-100 pt-4">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-950">{formatTnd(pack.totalNightlyPrice)} TND</span>
              <span className="text-xs text-slate-400">/ nuit</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <Star size={11} className="text-amber-500" fill="currentColor" />
              <span className="text-xs font-semibold text-emerald-600">Estimation semaine {formatTnd(pack.totalWeeklyPrice)} TND</span>
            </div>
          </div>
          <div className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold shadow-md transition-shadow group-hover:shadow-lg ${pack.theme.buttonClass}`}>
            Voir le pack
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
