import { Link } from "react-router";
import { Star, MapPin, Users, Bed, Bath, Phone, MessageCircle, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Property } from "../data/properties";
import { buildTelLink, buildWhatsAppPropertyMessage, getPublicContactForMode, openMessengerPropertyConversation, openWhatsAppApp } from "../utils/deepLinks";
import { SmartImage } from "./SmartImage";
import { resolveCurrentPricing } from "../utils/seasonalPricing";
import { buildPropertyDetailsPath } from "../utils/propertyRouting";
import { applyAmicaleTtc, formatTnd } from "../utils/amicalePricing";

interface PropertyCardProps {
  property: Property;
  searchParams?: string;
}

const PROPERTY_CARD_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23e5e7eb'/%3E%3Cpath d='M220 560l180-180 120 120 110-110 170 150H220z' fill='%23cbd5e1'/%3E%3Ccircle cx='430' cy='260' r='56' fill='%23cbd5e1'/%3E%3C/svg%3E";

const normalizeTypeToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resolveMainTypeLabel = (category: string, title: string) => {
  const normalizedCategory = normalizeTypeToken(category);
  const normalizedTitle = normalizeTypeToken(title);
  if (normalizedCategory.includes("appartement")) return "Appartement";
  if (normalizedCategory.includes("villa")) return "Villa";
  if (normalizedCategory.includes("maison")) return "Maison";
  if (normalizedCategory.includes("studio")) return "Studio";
  if (normalizedCategory.includes("bungalow")) return "Bungalow";
  if (normalizedCategory.includes("terrain")) return "Terrain";
  if (normalizedCategory.includes("lotissement")) return "Lotissement";
  if (normalizedCategory.includes("immeuble")) return "Immeuble";
  if (normalizedCategory.includes("local commercial")) return "Local commercial";
  if (normalizedCategory.includes("local")) return "Local";
  if (normalizedCategory.includes("s+")) return "Appartement";
  if (normalizedTitle.includes("appartement")) return "Appartement";
  if (normalizedTitle.includes("villa")) return "Villa";
  if (normalizedTitle.includes("maison")) return "Maison";
  if (normalizedTitle.includes("studio")) return "Studio";
  if (normalizedTitle.includes("local")) return "Local";
  if (normalizedTitle.includes("terrain")) return "Terrain";
  if (normalizedTitle.includes("immeuble")) return "Immeuble";
  return "Bien";
};

const resolveSubTypeLabel = (category: string, mainType: string, title: string, bedrooms?: number) => {
  const rawCategory = String(category || "").trim();
  const rawTitle = String(title || "").trim();
  const normalizedCategory = normalizeTypeToken(rawCategory);
  const normalizedMainType = normalizeTypeToken(mainType);
  const titleSPlusMatch = rawTitle.match(/s\+\d+/i);
  if (titleSPlusMatch?.[0]) return titleSPlusMatch[0].toUpperCase();
  const sPlusMatch = rawCategory.match(/s\+\d+/i);
  if (sPlusMatch?.[0]) return sPlusMatch[0].toUpperCase();
  if (normalizedMainType === "appartement" && Number.isFinite(Number(bedrooms)) && Number(bedrooms) > 0) {
    return `S+${Math.max(1, Math.floor(Number(bedrooms)))}`;
  }
  if (normalizedMainType) {
    const prefixRegex = new RegExp(`^${escapeRegExp(mainType)}\\s*[-:/]?\\s*`, "i");
    const trimmedWithoutType = rawCategory.replace(prefixRegex, "").trim();
    if (trimmedWithoutType) return trimmedWithoutType;
  }
  if (!normalizedCategory || normalizedCategory === normalizedMainType) {
    return normalizedMainType === "studio" ? "S+1" : "";
  }
  if (normalizedCategory === "studio") return "S+1";
  return rawCategory;
};

const buildDisplayTitle = (reference: string | undefined, title: string) => {
  const safeTitle = String(title || "").trim();
  const safeReference = String(reference || "").trim();
  if (!safeReference) return safeTitle;
  return /^ref\b/i.test(safeReference)
    ? `${safeReference} : ${safeTitle}`
    : `REF - ${safeReference} : ${safeTitle}`;
};

export function PropertyCard({ property, searchParams }: PropertyCardProps) {
  const titleViewportRef = useRef<HTMLDivElement | null>(null);
  const titleContentRef = useRef<HTMLSpanElement | null>(null);
  const [titleOverflow, setTitleOverflow] = useState(false);
  const [titleShiftPx, setTitleShiftPx] = useState(0);
  const [titleDurationSec, setTitleDurationSec] = useState(8);
  const baseDetailPath = buildPropertyDetailsPath(property);
  const linkTo = searchParams 
    ? `${baseDetailPath}?${searchParams}`
    : baseDetailPath;
  const contactConfig = getPublicContactForMode(property.mode);
  const propertyUrl = typeof window !== 'undefined' ? new URL(linkTo, window.location.origin).toString() : linkTo;
  const ratingDisplay = Number.isFinite(property.rating)
    ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(property.rating)
    : "0,0";
  const pricingAnchorDate = useMemo(() => {
    const params = new URLSearchParams(String(searchParams || ""));
    const checkInRaw = String(params.get("checkIn") || params.get("checkin") || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkInRaw)) return undefined;
    return `${checkInRaw}T00:00:00`;
  }, [searchParams]);
  const pricingAmicaleId = useMemo(() => {
    const params = new URLSearchParams(String(searchParams || ""));
    return String(params.get("amicale") || "").trim() || null;
  }, [searchParams]);
  const currentPricing = resolveCurrentPricing({
    today: pricingAnchorDate,
    defaultNightlyPrice: Number(property.pricePerNight || 0),
    defaultWeeklyPrice: Number(property.pricePerWeek || 0),
    pricingPeriods: property.pricingPeriods || [],
  });
  const isAmicalePricing = Boolean(pricingAmicaleId) && property.priceContext !== "sale";
  const syncedNightlyPrice = property.priceContext === 'sale'
    ? Number(property.pricePerNight || 0)
    : currentPricing.nightlyPrice;
  const syncedWeeklyPrice = property.priceContext === 'sale'
    ? 0
    : currentPricing.weeklyPrice;
  const displayedNightlyPrice = applyAmicaleTtc(syncedNightlyPrice, isAmicalePricing);
  const displayedWeeklyPrice = applyAmicaleTtc(syncedWeeklyPrice, isAmicalePricing);
  const mainTypeLabel = resolveMainTypeLabel(property.category || "", property.title || "");
  const subTypeLabel = resolveSubTypeLabel(
    property.category || "",
    mainTypeLabel,
    property.title || "",
    Number(property.bedrooms || 0)
  );
  const typeWidgetLabel = subTypeLabel ? `${mainTypeLabel} ${subTypeLabel}` : mainTypeLabel;
  const displayTitle = buildDisplayTitle(property.reference, property.title);
  const hasInstantReservation = Boolean(property.seasonalConfig?.reservationInstantanee);

  useEffect(() => {
    const measureTitle = () => {
      const viewport = titleViewportRef.current;
      const content = titleContentRef.current;
      if (!viewport || !content) return;
      const overflow = Math.ceil(content.scrollHeight - viewport.clientHeight);
      if (overflow > 2) {
        setTitleOverflow(true);
        setTitleShiftPx(overflow);
        setTitleDurationSec(Math.min(14, Math.max(8, Math.round(overflow / 10) + 8)));
      } else {
        setTitleOverflow(false);
        setTitleShiftPx(0);
        setTitleDurationSec(8);
      }
    };

    measureTitle();
    window.addEventListener("resize", measureTitle);
    return () => window.removeEventListener("resize", measureTitle);
  }, [displayTitle]);

  const handleMessengerClick = () => {
    void openMessengerPropertyConversation({
      page: contactConfig.messengerPage,
      pageId: contactConfig.messengerPageId,
      propertyUrl,
      title: property.title,
      imageUrl: property.images?.[0] || null,
      reference: property.reference || null,
    });
  };
    
  return (
    <div className={`group overflow-hidden rounded-[28px] border bg-white/95 shadow-[0_20px_48px_rgba(15,23,42,0.10)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_62px_rgba(15,23,42,0.16)] ${property.isFeatured ? 'border-amber-300 shadow-amber-100/80' : 'border-gray-100'} ${hasInstantReservation ? 'dwira-instant-card' : ''}`}>
      {hasInstantReservation ? (
        <span aria-hidden="true" className="dwira-electric-frame">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <filter id="dwira-electric-jitter" x="-40%" y="-40%" width="180%" height="180%">
                <feTurbulence type="fractalNoise" baseFrequency="0.018 0.35" numOctaves="2" seed="3" result="noise">
                  <animate attributeName="baseFrequency" values="0.018 0.35;0.024 0.42;0.015 0.31;0.018 0.35" dur="0.38s" repeatCount="indefinite" />
                </feTurbulence>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
              </filter>
              <filter id="dwira-electric-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="1.6" result="blur1" />
                <feGaussianBlur stdDeviation="3.4" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect className="dwira-electric-path dwira-electric-path--glow" x="1.8" y="1.8" width="96.4" height="96.4" rx="9.5" ry="9.5" pathLength="1000" />
            <rect className="dwira-electric-path dwira-electric-path--core" x="1.8" y="1.8" width="96.4" height="96.4" rx="9.5" ry="9.5" pathLength="1000" />
          </svg>
        </span>
      ) : null}
      <Link to={linkTo} className="block">
        <div className="relative aspect-[4/3] overflow-hidden">
          <SmartImage
            src={property.images?.[0] || PROPERTY_CARD_FALLBACK_IMAGE}
            alt={property.title}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            targetWidth={720}
            quality={62}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
          <div className="absolute left-4 top-4 inline-flex rounded-full border border-white/25 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 backdrop-blur-md">
            Sejour premium
          </div>
          {hasInstantReservation ? (
            <div className="dwira-instant-badge absolute left-4 top-[3.15rem] inline-flex items-center gap-1.5 rounded-full border border-amber-200/85 bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 shadow-sm backdrop-blur-md">
              <Zap size={12} className="text-amber-500" />
              <span>Reservation instantanee</span>
            </div>
          ) : null}
          <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/35 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <Star size={13} fill="currentColor" />
            <span>{ratingDisplay}</span>
            <span className="text-white/80">({property.reviews})</span>
          </div>
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
            <div className="min-w-0 rounded-2xl border border-white/15 bg-white/12 px-3 py-2 backdrop-blur-md">
              <p className="truncate text-sm font-semibold text-white">{property.location}</p>
              <p className="truncate text-xs text-white/80">{typeWidgetLabel}</p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white px-3 py-1.5 text-sm font-semibold text-emerald-900 shadow-md">
              <div>
                {formatTnd(displayedNightlyPrice)} TND{isAmicalePricing ? " TTC" : ""}
                {property.priceContext !== 'sale' ? <span className="text-xs font-normal text-gray-500"> / nuit</span> : null}
              </div>
              {property.priceContext !== 'sale' && displayedWeeklyPrice > 0 ? (
                <div className="text-[11px] font-medium text-gray-600">
                  {formatTnd(displayedWeeklyPrice)} TND{isAmicalePricing ? " TTC" : ""} / semaine
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div ref={titleViewportRef} className="relative min-w-0 flex-1 overflow-hidden max-h-[3.6em]">
              <span
                ref={titleContentRef}
                className={`block text-[1.45rem] font-semibold leading-[1.2] tracking-[-0.005em] text-slate-900 transition-colors group-hover:text-emerald-700 sm:text-[1.5rem] md:text-[1.55rem] lg:text-[1.65rem] ${titleOverflow ? "dwira-title-scroll" : "line-clamp-3"}`}
                style={titleOverflow ? ({ ["--dwira-title-shift" as string]: `-${titleShiftPx}px`, ["--dwira-title-duration" as string]: `${titleDurationSec}s` } as CSSProperties) : undefined}
              >
                {displayTitle}
              </span>
            </div>
            {property.isFeatured && (
              <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Bien vedette
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm text-gray-600">
            <MapPin size={14} />
            <span className="line-clamp-1">{property.location}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/45 p-3 text-sm text-emerald-900">
            <div className="flex items-center gap-1">
              <Users size={16} />
              <span>{property.guests}</span>
            </div>
            <div className="flex items-center gap-1">
              <Bed size={16} />
              <span>{property.bedrooms}</span>
            </div>
            <div className="flex items-center gap-1">
              <Bath size={16} />
              <span>{property.bathrooms}</span>
            </div>
          </div>
        </div>
      </Link>

      <div className="px-5 pb-5">
        <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
          <a href={buildTelLink(contactConfig.phone)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 whitespace-nowrap">
            <Phone size={14} />
            <span>Telephone</span>
          </a>
          <button
            type="button"
            onClick={() => openWhatsAppApp(
              contactConfig.phone,
              buildWhatsAppPropertyMessage(property.title, propertyUrl, property.reference || null)
            )}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <MessageCircle size={14} />
            <span>WhatsApp</span>
          </button>
          <button
            type="button"
            onClick={handleMessengerClick}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 whitespace-nowrap"
          >
            <MessageCircle size={14} />
            <span>Messenger</span>
          </button>
        </div>
      </div>
    </div>
  );
}
