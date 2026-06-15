import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  Minus,
  Plus,
  Home,
  MapPin,
  Phone,
  Search,
  Star,
  Tag,
  Users,
} from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { PropertyPack } from "../admin/types";
import { SmartImage } from "../components/SmartImage";
import AvailabilityCalendar from "../components/AvailabilityCalendar";
import { useProperties } from "../context/PropertiesContext";
import { formatTnd } from "../utils/amicalePricing";
import { buildPropertyDetailsPath } from "../utils/propertyRouting";
import { buildPropertyPackPath, getPackSearchContextFromParams, resolvePublicPropertyPacks } from "../utils/propertyPacks";

const API_URL = import.meta.env.VITE_API_URL || "/api";

export default function PropertyPackDetailsPage() {
  const { packId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { properties, loading } = useProperties();
  const [packs, setPacks] = useState<PropertyPack[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [adultGuests, setAdultGuests] = useState(1);
  const [childGuests, setChildGuests] = useState(0);

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

  useEffect(() => {
    const nextStart = searchParams.get("checkIn");
    const nextEnd = searchParams.get("checkOut");
    setSelectedStart(nextStart ? parseISO(nextStart) : null);
    setSelectedEnd(nextEnd ? parseISO(nextEnd) : null);
    const adults = Math.max(1, Number(searchParams.get("adultGuests") || 1) || 1);
    const children = Math.max(0, Number(searchParams.get("childGuests") || 0) || 0);
    setAdultGuests(adults);
    setChildGuests(children);
  }, [searchParams]);

  const searchContext = useMemo(() => getPackSearchContextFromParams(searchParams), [searchParams]);
  const baseResolvedPacks = useMemo(() => resolvePublicPropertyPacks(packs, properties), [packs, properties]);
  const searchResolvedPacks = useMemo(
    () => resolvePublicPropertyPacks(packs, properties, searchContext),
    [packs, properties, searchContext]
  );
  const pack = useMemo(
    () =>
      searchResolvedPacks.find((item) => String(item.id || "").trim() === String(packId || "").trim())
      || baseResolvedPacks.find((item) => String(item.id || "").trim() === String(packId || "").trim())
      || null,
    [baseResolvedPacks, searchResolvedPacks, packId]
  );
  const otherPacks = useMemo(
    () => searchResolvedPacks.filter((item) => item.id !== pack?.id).slice(0, 3),
    [searchResolvedPacks, pack]
  );
  const [activeImg, setActiveImg] = useState(0);

  const hasDateSearch = Boolean(searchContext.checkIn && searchContext.checkOut);
  const totalGuests = Math.max(1, adultGuests + childGuests);

  const mergedUnavailableDates = useMemo(() => {
    if (!pack) return [];
    return pack.properties.flatMap((property) =>
      (property.unavailableDates || []).map((item) => ({
        start: item.start,
        end: item.end,
        status: item.status,
      }))
    );
  }, [pack]);

  const stayNights = useMemo(() => {
    if (!selectedStart || !selectedEnd) return 0;
    const start = selectedStart < selectedEnd ? selectedStart : selectedEnd;
    const end = selectedStart < selectedEnd ? selectedEnd : selectedStart;
    return Math.max(0, differenceInCalendarDays(end, start));
  }, [selectedEnd, selectedStart]);

  const selectionSummary = useMemo(() => {
    if (!selectedStart || !selectedEnd) return "Ajoutez vos dates pour recalculer la combinaison du pack.";
    return `${format(selectedStart < selectedEnd ? selectedStart : selectedEnd, "dd/MM/yyyy")} au ${format(
      selectedStart < selectedEnd ? selectedEnd : selectedStart,
      "dd/MM/yyyy"
    )} · ${stayNights} nuit${stayNights > 1 ? "s" : ""} · ${totalGuests} voyageur${totalGuests > 1 ? "s" : ""}`;
  }, [selectedEnd, selectedStart, stayNights, totalGuests]);

  const availabilityTone =
    pack?.availabilityStatus === "exact"
      ? {
          title: "Pack disponible pour la demande actuelle",
          text: pack.searchSummary || "Toutes les references affichees sont disponibles sur la periode selectionnee.",
          className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        }
      : pack?.availabilityStatus === "partial"
        ? {
            title: "Pack partiellement recompose",
            text: "Une partie du pack racine correspond a votre demande. Ajustez vos dates ou vos criteres pour voir plus de variantes.",
            className: "border-amber-200 bg-amber-50 text-amber-800",
          }
        : {
            title: "Pack racine affiche",
            text: "Ce pack sert de base. Ajoutez vos dates pour verifier les variantes reellement disponibles.",
            className: "border-slate-200 bg-slate-50 text-slate-700",
          };

  const syncSearchParams = (next: {
    checkIn?: string;
    checkOut?: string;
    adultGuests?: number;
    childGuests?: number;
  }) => {
    const updated = new URLSearchParams(searchParams);
    const checkIn = next.checkIn ?? searchParams.get("checkIn") ?? "";
    const checkOut = next.checkOut ?? searchParams.get("checkOut") ?? "";
    const nextAdults = Math.max(1, next.adultGuests ?? adultGuests);
    const nextChildren = Math.max(0, next.childGuests ?? childGuests);

    if (checkIn) updated.set("checkIn", checkIn);
    else updated.delete("checkIn");
    if (checkOut) updated.set("checkOut", checkOut);
    else updated.delete("checkOut");

    updated.set("adultGuests", String(nextAdults));
    updated.set("childGuests", String(nextChildren));
    updated.set("guestsMin", String(nextAdults + nextChildren));
    setSearchParams(updated, { replace: true });
  };

  useEffect(() => {
    setActiveImg(0);
  }, [pack?.id]);

  if (!packsLoading && !loading && !pack) {
    return <Navigate to="/packs" replace />;
  }

  if (!pack) {
    return (
      <div className="min-h-screen bg-[#f7f8fb] px-4 py-20 text-center">
        <p className="text-sm font-medium text-slate-500">Chargement du pack...</p>
      </div>
    );
  }

  const persistedQuery = searchParams.toString();
  const allImages = [pack.coverImage, ...pack.galleryImages.filter((image) => image !== pack.coverImage)];
  const activeImage = allImages[activeImg] || pack.coverImage;
  const otherPacksHref = (idPack: { id: string | number }) =>
    persistedQuery ? `${buildPropertyPackPath(idPack)}?${persistedQuery}` : buildPropertyPackPath(idPack);

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <section className="relative min-h-[430px] overflow-hidden bg-slate-950">
        <div className="absolute inset-0">
          <SmartImage
            src={activeImage}
            alt={pack.name}
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            targetWidth={1800}
            quality={66}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/82 via-slate-950/55 to-slate-950/35" />
          <div className={`absolute inset-0 bg-gradient-to-t ${pack.theme.accentClass} opacity-45`} />
        </div>
        <div className="container relative mx-auto px-4 py-10 md:px-6 md:py-16">
          <Link
            to="/packs"
            className="inline-flex items-center gap-2 rounded-xl bg-black/30 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm hover:bg-black/45"
          >
            <ArrowLeft className="h-4 w-4" />
            Tous les packs
          </Link>
          <div className="mt-20 max-w-4xl text-white md:mt-28">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white shadow-sm">
              {pack.theme.label}
              <span className="text-white/70">·</span>
              <span>Pack client</span>
            </div>
            <h1 className="mt-5 text-4xl font-black leading-tight md:text-6xl">{pack.name}</h1>
            <p className="mt-3 text-xl text-white/90">
              {pack.properties.length} logement{pack.properties.length > 1 ? "s" : ""} actif{pack.properties.length > 1 ? "s" : ""} sur
              {" "}
              {pack.rootPropertyCount} reference{pack.rootPropertyCount > 1 ? "s" : ""} du pack racine
            </p>
            <div className="mt-4 flex flex-wrap gap-6 text-sm text-white/85">
              <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> {pack.locationSummary}</span>
              <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> {pack.maxGuests} personnes maximum</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {pack.minStayNights} nuits minimum</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {pack.locationPills.map((item) => (
                <span key={`${pack.id}-${item}`} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {allImages.slice(0, 6).map((image, index) => (
                <button
                  key={`${pack.id}-hero-gallery-${index}`}
                  type="button"
                  onClick={() => setActiveImg(index)}
                  className={`h-14 w-20 overflow-hidden rounded-xl border-2 backdrop-blur-sm transition ${
                    activeImg === index ? "border-amber-400 shadow-lg" : "border-white/35 bg-white/10 opacity-75 hover:opacity-100"
                  }`}
                >
                  <SmartImage
                    src={image}
                    alt={`${pack.name} ${index + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    targetWidth={220}
                    quality={46}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto grid grid-cols-1 gap-8 px-4 py-8 md:px-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-8">
          <section className={`rounded-[28px] border p-6 shadow-sm ${availabilityTone.className}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.26em]">Etat du pack</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">{availabilityTone.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 opacity-90">{availabilityTone.text}</p>
              </div>
              {pack.isSearchVariant ? (
                <div className="rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold shadow-sm">
                  Variante automatique:
                  <span className="ml-1 font-black">{pack.properties.length}</span>
                  {" "}bien{pack.properties.length > 1 ? "s" : ""} retenu{pack.properties.length > 1 ? "s" : ""}
                </div>
              ) : null}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Home className="h-5 w-5" />
              </div>
              <div className="mt-4 text-3xl font-black text-slate-950">{pack.properties.length}</div>
              <p className="mt-1 text-sm text-slate-500">logements inclus</p>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Users className="h-5 w-5" />
              </div>
              <div className="mt-4 text-3xl font-black text-slate-950">{pack.maxGuests}</div>
              <p className="mt-1 text-sm text-slate-500">pers. maximum</p>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="mt-4 text-3xl font-black text-slate-950">{pack.minStayNights}</div>
              <p className="mt-1 text-sm text-slate-500">nuits minimum</p>
            </div>
          </div>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.26em] text-emerald-700">Calendrier du pack</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Disponibilite combinee</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Le calendrier bloque toute date ou l&apos;une des references necessaires du pack n&apos;est pas disponible.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {selectionSummary}
              </div>
            </div>
            <div className="mt-6">
              <AvailabilityCalendar
                unavailableDates={mergedUnavailableDates}
                selectedStart={selectedStart}
                selectedEnd={selectedEnd}
                onDateRangeSelect={(start, end) => {
                  setSelectedStart(start);
                  setSelectedEnd(end);
                  syncSearchParams({
                    checkIn: start ? format(start, "yyyy-MM-dd") : "",
                    checkOut: end ? format(end, "yyyy-MM-dd") : "",
                  });
                }}
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-3xl font-black tracking-tight text-slate-950">A propos de ce pack</h2>
            <p className="mt-5 text-lg leading-9 text-slate-700">{pack.shortDescription}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {pack.featureTags.map((item) => (
                <span key={`${pack.id}-feature-${item}`} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-6 rounded-[24px] border border-slate-100 bg-slate-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Composition du pack</p>
              <div className="mt-4 space-y-3">
                {pack.propertyLines.map((line) => (
                  <div key={`${pack.id}-${line}`} className="flex items-start gap-3 text-sm text-slate-700">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="logements-inclus" className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-slate-950">Logements inclus dans ce pack</h2>
            {pack.properties.map((property, index) => (
              <motion.article
                key={`${pack.id}-${property.id}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-5 p-4 md:flex-row md:items-center md:p-5">
                  <div className="h-32 overflow-hidden rounded-2xl bg-slate-100 md:w-[220px]">
                    <SmartImage
                      src={property.images?.[0] || pack.coverImage}
                      alt={property.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      targetWidth={500}
                      quality={52}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="inline-flex items-center gap-1 text-sm font-semibold text-amber-500">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {Number.isFinite(property.rating) ? `${property.rating.toFixed(1)} (${property.reviews} avis)` : "Logement inclus"}
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{property.title}</h3>
                    <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                      <MapPin className="h-4 w-4" />
                      {property.location}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-600">
                      <span>{property.guests} pers.</span>
                      <span>{property.bedrooms} ch.</span>
                      <span>{property.bathrooms} SdB</span>
                    </div>
                  </div>
                  <div className="md:self-end">
                    <Link
                      to={`${buildPropertyDetailsPath(property)}${persistedQuery ? `?${persistedQuery}` : ""}`}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      Voir
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </motion.article>
            ))}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
            <div className={`bg-gradient-to-r ${pack.theme.accentClass} p-6 text-white`}>
              <div className="text-5xl font-black">{formatTnd(pack.totalNightlyPrice)} TND <span className="text-lg font-medium text-white/80">/ nuit</span></div>
              <div className="mt-2 flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-white/70" />
                <p className="text-sm text-emerald-50/80">Estimation / semaine {formatTnd(pack.totalWeeklyPrice)} TND</p>
              </div>
            </div>
            <div className="space-y-5 p-6 text-sm text-slate-600">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Reservation pack</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Arrivee</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{selectedStart ? format(selectedStart, "dd/MM/yyyy") : "Choisir date"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Depart</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{selectedEnd ? format(selectedEnd, "dd/MM/yyyy") : "Choisir date"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Adultes</p>
                      <div className="mt-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => syncSearchParams({ adultGuests: Math.max(1, adultGuests - 1) })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-base font-black text-slate-950">{adultGuests}</span>
                        <button
                          type="button"
                          onClick={() => syncSearchParams({ adultGuests: adultGuests + 1 })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Enfants</p>
                      <div className="mt-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => syncSearchParams({ childGuests: Math.max(0, childGuests - 1) })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-base font-black text-slate-950">{childGuests}</span>
                        <button
                          type="button"
                          onClick={() => syncSearchParams({ childGuests: childGuests + 1 })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span>Duree minimale</span>
                <strong className="text-slate-950">{pack.minStayNights} nuits</strong>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span>Capacite max.</span>
                <strong className="text-slate-950">{pack.maxGuests} personnes</strong>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span>Logements inclus</span>
                <strong className="text-slate-950">{pack.properties.length}</strong>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span>Pack racine admin</span>
                <strong className="text-slate-950">{pack.rootPropertyCount} refs</strong>
              </div>
              <Link
                to={`/contact?source=pack&packId=${encodeURIComponent(String(pack.id || ""))}&packName=${encodeURIComponent(pack.name)}${searchContext.checkIn ? `&checkIn=${encodeURIComponent(searchContext.checkIn)}` : ""}${searchContext.checkOut ? `&checkOut=${encodeURIComponent(searchContext.checkOut)}` : ""}&guests=${encodeURIComponent(String(totalGuests))}`}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-semibold shadow-md transition ${pack.theme.buttonClass}`}
              >
                <Phone className="h-4 w-4" />
                Reserver ce pack
              </Link>
              <Link
                to={`/packs?${searchParams.toString()}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-base font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                <Search className="h-4 w-4" />
                Voir autres variantes
              </Link>
            </div>
          </section>

          {otherPacks.length > 0 ? (
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">Autres packs</h2>
              <div className="mt-5 space-y-4">
                {otherPacks.map((item) => (
                  <Link key={item.id} to={otherPacksHref(item)} className="group flex items-center gap-4 rounded-2xl">
                    <div className="h-16 w-16 overflow-hidden rounded-2xl bg-slate-100">
                      <SmartImage
                        src={item.coverImage}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                        targetWidth={160}
                        quality={44}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-slate-950 transition-colors group-hover:text-emerald-700">{item.name}</p>
                      <p className="text-sm text-slate-500">{formatTnd(item.totalNightlyPrice)} TND / nuit</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-emerald-600" />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </section>
    </div>
  );
}
