import { Link } from "react-router";
import { Star, MapPin, Users, Bed, Bath, Phone, MessageCircle } from "lucide-react";
import { Property } from "../data/properties";
import { buildTelLink, buildWhatsAppPropertyMessage, getPublicContactForMode, openMessengerPropertyConversation, openWhatsAppApp } from "../utils/deepLinks";
import { SmartImage } from "./SmartImage";
import { resolveCurrentPricing } from "../utils/seasonalPricing";

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

const resolveSubTypeLabel = (category: string, mainType: string) => {
  const rawCategory = String(category || "").trim();
  const normalizedCategory = normalizeTypeToken(rawCategory);
  const normalizedMainType = normalizeTypeToken(mainType);
  const sPlusMatch = rawCategory.match(/s\+\d+/i);
  if (sPlusMatch?.[0]) return sPlusMatch[0].toUpperCase();
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
  const baseDetailPath = property.detailPath || `/properties/${property.slug}`;
  const linkTo = searchParams 
    ? `${baseDetailPath}?${searchParams}`
    : baseDetailPath;
  const contactConfig = getPublicContactForMode(property.mode);
  const propertyUrl = typeof window !== 'undefined' ? new URL(linkTo, window.location.origin).toString() : linkTo;
  const ratingDisplay = Number.isFinite(property.rating)
    ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(property.rating)
    : "0,0";
  const currentPricing = resolveCurrentPricing({
    defaultNightlyPrice: Number(property.pricePerNight || 0),
    defaultWeeklyPrice: Number(property.pricePerWeek || 0),
    pricingPeriods: property.pricingPeriods || [],
  });
  const syncedNightlyPrice = property.priceContext === 'sale'
    ? Number(property.pricePerNight || 0)
    : currentPricing.nightlyPrice;
  const syncedWeeklyPrice = property.priceContext === 'sale'
    ? 0
    : currentPricing.weeklyPrice;
  const mainTypeLabel = resolveMainTypeLabel(property.category || "", property.title || "");
  const subTypeLabel = resolveSubTypeLabel(property.category || "", mainTypeLabel);
  const typeWidgetLabel = subTypeLabel ? `${mainTypeLabel} ${subTypeLabel}` : mainTypeLabel;
  const displayTitle = buildDisplayTitle(property.reference, property.title);
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
    <div className={`group overflow-hidden rounded-[28px] border bg-white/95 shadow-[0_20px_48px_rgba(15,23,42,0.10)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_62px_rgba(15,23,42,0.16)] ${property.isFeatured ? 'border-amber-300 shadow-amber-100/80' : 'border-gray-100'}`}>
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
                {syncedNightlyPrice} TND
                {property.priceContext !== 'sale' ? <span className="text-xs font-normal text-gray-500"> / nuit</span> : null}
              </div>
              {property.priceContext !== 'sale' && syncedWeeklyPrice > 0 ? (
                <div className="text-[11px] font-medium text-gray-600">
                  {syncedWeeklyPrice} TND / semaine
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-[2rem] font-extrabold leading-tight text-slate-900 transition-colors group-hover:text-emerald-700 md:text-[2.15rem]">
              {displayTitle}
            </h3>
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
