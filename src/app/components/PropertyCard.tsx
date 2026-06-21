import { Link } from "react-router";
import { Star, MapPin, Users, Bed, Bath, Phone, MessageCircle, Zap, Flame } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Property } from "../data/properties";
import { buildTelLink, buildWhatsAppPropertyMessage, getPublicContactForMode, openMessengerPropertyConversation, openWhatsAppApp } from "../utils/deepLinks";
import { SmartImage } from "./SmartImage";
import { resolveCurrentPricing } from "../utils/seasonalPricing";
import { buildPropertyDetailsPath } from "../utils/propertyRouting";
import { applyAmicaleTtc, formatTnd } from "../utils/amicalePricing";
import { applyPartnerAgencyMargin } from "../utils/partnerAgencyPricing";
import { trackMetaEvent } from "../utils/metaConversions";
import { getFlashBadgeLabel, getFlashNightlyAmount, type PropertyFlashOffer } from "../utils/flashOffers";

interface PropertyCardProps {
  property: Property;
  searchParams?: string;
  cardVariant?: "default" | "flash";
  flashOffer?: PropertyFlashOffer | null;
  pricingAmicaleId?: string | null;
  partnerAgencyMarginMultiplier?: number | null;
  publicPartnerSlug?: string | null;
}

const PROPERTY_CARD_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23e5e7eb'/%3E%3Cpath d='M220 560l180-180 120 120 110-110 170 150H220z' fill='%23cbd5e1'/%3E%3Ccircle cx='430' cy='260' r='56' fill='%23cbd5e1'/%3E%3C/svg%3E";

const normalizeTypeToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resolveMainTypeLabel = (category: string, title: string) => {
  const normalizedCategory = normalizeTypeToken(category);
  const normalizedTitle = normalizeTypeToken(title);
  if (normalizedCategory.includes("residence")) return "Residence";
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
  if (normalizedTitle.includes("residence")) return "Residence";
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

const buildReferenceLabel = (reference?: string) => {
  const safeReference = String(reference || "").trim();
  if (!safeReference) return "";
  return /^ref\b/i.test(safeReference) ? safeReference : `REF-${safeReference}`;
};

const formatFlashDateLabel = (start?: string | null, end?: string | null) => {
  if (!start || !end) return "";
  try {
    return `${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${start}T00:00:00`))} - ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${end}T00:00:00`))}`;
  } catch {
    return `${start} - ${end}`;
  }
};
const formatFlashCountdown = (expiresAt?: string | null, nowMs?: number) => {
  const targetMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(targetMs)) return null;
  const remainingMs = Math.max(0, targetMs - (nowMs || Date.now()));
  if (remainingMs <= 0) return "Expiree";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return days > 0
    ? `${days}j ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
    : `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
};

export function PropertyCard({
  property,
  searchParams,
  cardVariant = "default",
  flashOffer = null,
  pricingAmicaleId: forcedPricingAmicaleId = null,
  partnerAgencyMarginMultiplier: forcedPartnerAgencyMarginMultiplier = null,
  publicPartnerSlug = null,
}: PropertyCardProps) {
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const rawDetailPath = buildPropertyDetailsPath(property);
  const baseDetailPath =
    cardVariant === "flash" && rawDetailPath.startsWith("/properties/")
      ? `/ventes_flash${rawDetailPath}`
      : rawDetailPath;
  const compactSearchParams = useMemo(() => {
    const params = new URLSearchParams(String(searchParams || ""));
    params.delete("amicale");
    params.delete("partner");
    params.delete("partnerMargin");
    return params.toString();
  }, [searchParams]);
  const publicPartnerDetailPath = useMemo(() => {
    const normalizedSlug = String(publicPartnerSlug || "").trim().replace(/^\/+|\/+$/g, "");
    if (!normalizedSlug) return null;
    const propertyToken = rawDetailPath.replace(/^\/ventes_flash\/properties\//, "").replace(/^\/properties\//, "");
    if (!propertyToken) return null;
    return `/${normalizedSlug}/${propertyToken}`;
  }, [publicPartnerSlug, rawDetailPath]);
  const linkBase = publicPartnerDetailPath || baseDetailPath;
  const linkQuery = publicPartnerDetailPath ? compactSearchParams : String(searchParams || "");
  const linkTo = linkQuery ? `${linkBase}?${linkQuery}` : linkBase;
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
    if (forcedPricingAmicaleId) return String(forcedPricingAmicaleId).trim() || null;
    const params = new URLSearchParams(String(searchParams || ""));
    return String(params.get("amicale") || "").trim() || null;
  }, [forcedPricingAmicaleId, searchParams]);
  const partnerAgencyMarginMultiplier = useMemo(() => {
    if (Number.isFinite(Number(forcedPartnerAgencyMarginMultiplier)) && Number(forcedPartnerAgencyMarginMultiplier) > 0) {
      return Number(forcedPartnerAgencyMarginMultiplier);
    }
    const params = new URLSearchParams(String(searchParams || ""));
    const raw = Number(params.get("partnerMargin") || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [forcedPartnerAgencyMarginMultiplier, searchParams]);
  const currentPricing = resolveCurrentPricing({
    today: pricingAnchorDate,
    defaultNightlyPrice: Number(property.pricePerNight || 0),
    defaultWeeklyPrice: Number(property.pricePerWeek || 0),
    pricingPeriods: property.pricingPeriods || [],
    amicaleId: pricingAmicaleId,
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
  const partnerAdjustedNightlyPrice = applyPartnerAgencyMargin(displayedNightlyPrice, partnerAgencyMarginMultiplier);
  const partnerAdjustedWeeklyPrice = applyPartnerAgencyMargin(displayedWeeklyPrice, partnerAgencyMarginMultiplier);
  const isFlashCard = cardVariant === "flash" && Boolean(flashOffer);
  const flashDiscountPercent = Math.max(0, Math.min(95, Number(flashOffer?.discountPercent || 0)));
  const flashNightlyPrice = isFlashCard ? getFlashNightlyAmount(partnerAdjustedNightlyPrice, flashOffer) : partnerAdjustedNightlyPrice;
  const flashWeeklyPrice = isFlashCard
    ? (flashOffer?.mode === "fixed_amount" && Number(flashOffer.fixedNightlyAmount || 0) > 0
        ? Math.round(Number(flashOffer.fixedNightlyAmount || 0) * 7 * 100) / 100
        : getFlashNightlyAmount(partnerAdjustedWeeklyPrice, flashOffer))
    : partnerAdjustedWeeklyPrice;
  const flashDateLabel = isFlashCard ? formatFlashDateLabel(flashOffer?.start, flashOffer?.end) : "";
  const flashBadgeLabel = isFlashCard ? getFlashBadgeLabel(flashOffer) : "";
  const flashCountdownLabel = isFlashCard ? formatFlashCountdown(flashOffer?.expiresAt, countdownNow) : null;
  const mainTypeLabel = resolveMainTypeLabel(property.category || "", property.title || "");
  const subTypeLabel = resolveSubTypeLabel(
    property.category || "",
    mainTypeLabel,
    property.title || "",
    Number(property.bedrooms || 0)
  );
  const typeWidgetLabel = subTypeLabel ? `${mainTypeLabel} ${subTypeLabel}` : mainTypeLabel;
  const titleText = String(property.title || "").trim();
  const referenceLabel = buildReferenceLabel(property.reference);
  const hasInstantReservation = Boolean(property.seasonalConfig?.reservationInstantanee);
  const isGoldInstantCard = hasInstantReservation && !isFlashCard;
  const residenceBadgeLabel = String(property.residenceName || "").trim();
  const residenceBadgeText = /^residence\b/i.test(residenceBadgeLabel)
    ? residenceBadgeLabel
    : (residenceBadgeLabel ? `Residence ${residenceBadgeLabel}` : "");
  const visualNightlyPrice = isFlashCard ? flashNightlyPrice : partnerAdjustedNightlyPrice;
  const visualWeeklyPrice = isFlashCard ? flashWeeklyPrice : partnerAdjustedWeeklyPrice;
  useEffect(() => {
    if (!isFlashCard || !flashOffer?.expiresAt) return;
    const intervalId = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [flashOffer?.expiresAt, isFlashCard]);

  const handleMessengerClick = () => {
    void trackMetaEvent({
      eventName: "Contact",
      customData: {
        contact_channel: "messenger",
        content_name: property.title,
        content_ids: [String(property.id)],
        property_reference: String(property.reference || ""),
      },
    });
    void openMessengerPropertyConversation({
      page: contactConfig.messengerPage,
      pageId: contactConfig.messengerPageId,
      propertyUrl,
      title: property.title,
      imageUrl: property.images?.[0] || null,
      reference: property.reference || null,
    });
  };
  const handlePhoneClick = () => {
    void trackMetaEvent({
      eventName: "Contact",
      customData: {
        contact_channel: "phone",
        content_name: property.title,
        content_ids: [String(property.id)],
        property_reference: String(property.reference || ""),
      },
    });
  };
  const handleWhatsAppClick = () => {
    void trackMetaEvent({
      eventName: "Contact",
      customData: {
        contact_channel: "whatsapp",
        content_name: property.title,
        content_ids: [String(property.id)],
        property_reference: String(property.reference || ""),
      },
    });
    openWhatsAppApp(
      contactConfig.phone,
      buildWhatsAppPropertyMessage(property.title, propertyUrl, property.reference || null)
    );
  };
    
  return (
    <div className={`dwira-property-card group transition-shadow duration-200 ${
      isFlashCard
        ? 'dwira-flash-card rounded-[31px] p-[3px]'
        : isGoldInstantCard
          ? 'rounded-[31px] bg-[linear-gradient(135deg,rgba(120,53,15,0.98)_0%,rgba(180,83,9,0.98)_14%,rgba(255,239,171,1)_48%,rgba(255,248,220,1)_58%,rgba(217,119,6,0.98)_100%)] p-[3px] shadow-[0_0_0_1px_rgba(255,239,171,0.78),0_0_28px_rgba(245,158,11,0.26),0_20px_42px_rgba(120,53,15,0.16)]'
          : `overflow-hidden rounded-[28px] border bg-white/95 shadow-[0_16px_36px_rgba(15,23,42,0.08)] hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)] ${property.isFeatured ? 'border-amber-300 shadow-amber-100/80' : 'border-gray-100'}`
    }`}>
      <div
        className={
          isFlashCard
            ? "dwira-flash-card__inner overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-[0_16px_36px_rgba(15,23,42,0.08)] transition-shadow duration-200 group-hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
            : isGoldInstantCard
              ? "relative overflow-hidden rounded-[28px] border border-[#fff1b8] bg-white/95 shadow-[0_16px_36px_rgba(15,23,42,0.08)] transition-shadow duration-200 group-hover:shadow-[0_24px_48px_rgba(180,83,9,0.18)]"
              : ""
        }
      >
        {isGoldInstantCard ? (
          <>
            <span className="pointer-events-none absolute inset-[1.5px] rounded-[26px] border border-white/55" />
            <span className="pointer-events-none absolute left-0 top-8 h-24 w-12 -rotate-12 bg-white/40 blur-xl" />
          </>
        ) : null}
      <Link to={linkTo} className="block">
        <div className="relative aspect-[4/3] overflow-hidden">
          <SmartImage
            src={property.images?.[0] || PROPERTY_CARD_FALLBACK_IMAGE}
            alt={property.title}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            targetWidth={640}
            quality={56}
            sizes="(max-width: 767px) 92vw, (max-width: 1279px) 44vw, 31vw"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
          <div className="absolute left-3 right-24 top-3 z-[2] flex flex-wrap items-start gap-2 sm:left-4 sm:right-24 sm:top-4">
            <div className="inline-flex max-w-full rounded-full border border-white/25 bg-black/35 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100 backdrop-blur-md sm:text-[11px] sm:tracking-[0.18em]">
              Sejour premium
            </div>
            {residenceBadgeLabel ? (
              <div className="inline-flex max-w-full truncate rounded-full border border-emerald-200/85 bg-white/92 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700 shadow-sm backdrop-blur-md sm:text-[11px] sm:tracking-[0.12em]">
                <span className="truncate">{residenceBadgeText}</span>
              </div>
            ) : null}
            {hasInstantReservation ? (
              <div className="dwira-instant-badge-wrap relative max-w-full">
                <span className="pointer-events-none absolute -left-1.5 -top-1.5 z-[1] rounded-full border border-amber-300/90 bg-[#fff8d9] p-1 shadow-[0_0_18px_rgba(245,158,11,0.45)]">
                  <Zap size={9} className="text-amber-600" fill="currentColor" />
                </span>
                <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-[1] rounded-full border border-amber-300/90 bg-[#fff8d9] p-1 shadow-[0_0_18px_rgba(245,158,11,0.45)]">
                  <Zap size={9} className="text-amber-600" fill="currentColor" />
                </span>
                <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 z-[1] rounded-full border border-amber-300/90 bg-[#fff8d9] p-1 shadow-[0_0_18px_rgba(245,158,11,0.45)]">
                  <Zap size={9} className="text-amber-600" fill="currentColor" />
                </span>
                <span className="pointer-events-none absolute -bottom-1.5 -right-1.5 z-[1] rounded-full border border-amber-300/90 bg-[#fff8d9] p-1 shadow-[0_0_18px_rgba(245,158,11,0.45)]">
                  <Zap size={9} className="text-amber-600" fill="currentColor" />
                </span>
                <div className="dwira-instant-badge relative inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-[#f6d36a] bg-[linear-gradient(135deg,rgba(120,53,15,0.92)_0%,rgba(180,83,9,0.96)_16%,rgba(255,239,171,0.98)_47%,rgba(255,248,220,0.98)_58%,rgba(217,119,6,0.96)_100%)] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-950 shadow-[0_0_0_1px_rgba(255,239,171,0.68),0_0_24px_rgba(245,158,11,0.36),0_10px_24px_rgba(120,53,15,0.22)] backdrop-blur-md sm:text-[11px] sm:tracking-[0.18em]">
                  <span className="pointer-events-none absolute inset-[1.5px] rounded-full border border-white/45" />
                  <span className="pointer-events-none absolute -left-8 top-0 h-full w-10 rotate-[18deg] bg-white/45 blur-md" />
                  <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-200/80 bg-amber-50/90 text-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.42)]">
                    <Zap size={12} className="shrink-0" fill="currentColor" />
                  </span>
                  <span className="relative truncate">Reservation rapide</span>
                </div>
              </div>
            ) : null}
          </div>
          {isFlashCard ? (
            <div className="absolute right-3 top-[3.45rem] z-[2] sm:right-4 sm:top-[3.3rem]">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#dc2626_0%,#ef4444_44%,#fb923c_100%)] px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white shadow-[0_18px_40px_rgba(239,68,68,0.34)] sm:gap-2 sm:px-3.5 sm:py-2 sm:text-xs sm:tracking-[0.18em]">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 sm:h-7 sm:w-7">
                  <Flame size={15} />
                </span>
                <span className="max-sm:hidden">{flashBadgeLabel}</span>
                <span className="sm:hidden">Flash</span>
              </div>
            </div>
          ) : null}
          <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/35 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <Star size={13} fill="currentColor" />
            <span>{ratingDisplay}</span>
            <span className="text-white/80">({property.reviews})</span>
          </div>
          <div className="absolute bottom-4 left-4 right-4 hidden flex-col gap-2 sm:flex sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <div className="min-w-0 rounded-2xl border border-white/15 bg-white/12 px-3 py-2 backdrop-blur-md">
              <p className="truncate text-sm font-semibold text-white">{property.location}</p>
              <p className="truncate text-xs text-white/80">{typeWidgetLabel}</p>
            </div>
            <div className={`shrink-0 self-start rounded-2xl px-3 py-1.5 text-sm font-semibold shadow-md sm:self-auto ${isFlashCard ? 'bg-[linear-gradient(135deg,#fff7ed,#ffffff)] text-red-700 ring-1 ring-red-200' : 'bg-white text-emerald-900'}`}>
              <div>
                {isFlashCard && partnerAdjustedNightlyPrice > visualNightlyPrice ? (
                  <span className="mr-2 text-xs font-semibold text-slate-400 line-through">
                    {formatTnd(partnerAdjustedNightlyPrice)} TND
                  </span>
                ) : null}
                {formatTnd(visualNightlyPrice)} TND{isAmicalePricing ? " TTC" : ""}
                {property.priceContext !== 'sale' ? <span className="text-xs font-normal text-gray-500"> / nuit</span> : null}
              </div>
              {property.priceContext !== 'sale' && visualWeeklyPrice > 0 ? (
                <div className="text-[11px] font-medium text-gray-600">
                  {isFlashCard && partnerAdjustedWeeklyPrice > visualWeeklyPrice ? (
                    <span className="mr-1 text-[10px] text-slate-400 line-through">{formatTnd(partnerAdjustedWeeklyPrice)} TND</span>
                  ) : null}
                  {formatTnd(visualWeeklyPrice)} TND{isAmicalePricing ? " TTC" : ""} / semaine
                </div>
              ) : null}
            </div>
          </div>
          {isFlashCard ? (
            <>
              <div className="absolute inset-x-3 bottom-16 z-[2] hidden rounded-2xl border border-white/30 bg-[linear-gradient(135deg,rgba(127,29,29,0.82),rgba(239,68,68,0.78),rgba(251,146,60,0.72))] px-3 py-2.5 text-white shadow-[0_22px_40px_rgba(127,29,29,0.28)] backdrop-blur-md sm:inset-x-4 sm:bottom-20 sm:block sm:px-4 sm:py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/88">
                    {String(flashOffer?.title || "Vente flash")}
                  </p>
                  <p className="mt-1 text-xs font-semibold sm:text-sm">{flashDateLabel}</p>
                  {flashCountdownLabel ? (
                    <p className="mt-1 text-[11px] font-semibold text-white/80">
                      Expire dans {flashCountdownLabel}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/70">Prix flash</p>
                  <p className="text-sm font-black sm:text-base">{formatTnd(visualNightlyPrice)} TND</p>
                </div>
              </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/90 px-3 py-3 sm:hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{property.location}</p>
                <p className="truncate text-xs text-slate-500">{typeWidgetLabel}</p>
              </div>
              <div className={`shrink-0 rounded-2xl px-3 py-1.5 text-sm font-semibold shadow-sm ${isFlashCard ? 'bg-[linear-gradient(135deg,#fff7ed,#ffffff)] text-red-700 ring-1 ring-red-200' : 'bg-white text-emerald-900 ring-1 ring-slate-200'}`}>
                <div>
                  {isFlashCard && partnerAdjustedNightlyPrice > visualNightlyPrice ? (
                    <span className="mr-2 text-[11px] font-semibold text-slate-400 line-through">
                      {formatTnd(partnerAdjustedNightlyPrice)} TND
                    </span>
                  ) : null}
                  {formatTnd(visualNightlyPrice)} TND{isAmicalePricing ? " TTC" : ""}
                  {property.priceContext !== 'sale' ? <span className="text-[11px] font-normal text-gray-500"> / nuit</span> : null}
                </div>
                {property.priceContext !== 'sale' && visualWeeklyPrice > 0 ? (
                  <div className="text-[10px] font-medium text-gray-500">
                    {isFlashCard && partnerAdjustedWeeklyPrice > visualWeeklyPrice ? (
                      <span className="mr-1 text-[10px] text-slate-400 line-through">{formatTnd(partnerAdjustedWeeklyPrice)} TND</span>
                    ) : null}
                    {formatTnd(visualWeeklyPrice)} TND{isAmicalePricing ? " TTC" : ""} / semaine
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="relative min-w-0 flex-1 overflow-hidden">
              {referenceLabel ? (
                <p className="mb-1 text-[0.95rem] font-semibold uppercase tracking-[0.02em] text-slate-700 sm:text-[1rem]">
                  {referenceLabel} :
                </p>
              ) : null}
              <p
                className="dwira-property-title line-clamp-4 text-[1.42rem] font-semibold leading-[1.12] tracking-[-0.03em] text-slate-900 transition-colors group-hover:text-emerald-700 sm:text-[1.5rem] md:text-[1.56rem] lg:text-[1.62rem]"
              >
                {titleText}
              </p>
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

          {isFlashCard ? (
            <div className="rounded-2xl border border-red-100 bg-[linear-gradient(135deg,#fff1f2,#fff7ed)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-red-600">Sejour flash</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{flashDateLabel}</p>
                  {flashCountdownLabel ? (
                    <p className="mt-1 text-xs font-semibold text-red-600">Expire dans {flashCountdownLabel}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-500 line-through">{formatTnd(partnerAdjustedNightlyPrice)} TND</p>
                  <p className="text-lg font-black text-red-600">{formatTnd(visualNightlyPrice)} TND</p>
                </div>
              </div>
            </div>
          ) : null}

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
          <a href={buildTelLink(contactConfig.phone)} onClick={handlePhoneClick} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 whitespace-nowrap">
            <Phone size={14} />
            <span>Telephone</span>
          </a>
          <button
            type="button"
            onClick={handleWhatsAppClick}
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
    </div>
  );
}
