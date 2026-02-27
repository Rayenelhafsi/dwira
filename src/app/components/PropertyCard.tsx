import { Link } from "react-router";
import { Star, MapPin, Users, Bed, Bath, Phone, MessageCircle } from "lucide-react";
import { Property } from "../data/properties";

interface PropertyCardProps {
  property: Property;
  searchParams?: string;
}

const CONTACT_PHONE_RAW = "+21652080695";
const WHATSAPP_LINK = "https://wa.me/21652080695";
const MESSENGER_LINK = "https://m.me/dwiraimmo2";

export function PropertyCard({ property, searchParams }: PropertyCardProps) {
  const baseDetailPath = property.detailPath || `/properties/${property.slug}`;
  const linkTo = searchParams 
    ? `${baseDetailPath}?${searchParams}`
    : baseDetailPath;
  const ratingDisplay = Number.isFinite(property.rating)
    ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(property.rating)
    : "0,0";
    
  return (
    <div className="group bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100">
      <Link to={linkTo} className="block">
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={property.images[0]}
            alt={property.title}
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-sm font-semibold text-gray-900 shadow-sm">
            {property.pricePerNight} TND
            {property.priceContext !== 'sale' ? <span className="text-xs font-normal text-gray-500"> / nuit</span> : null}
          </div>
          <div className="absolute top-3 left-3 bg-emerald-700/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-semibold text-white shadow-sm">
            {property.category}
          </div>
        </div>
        
        <div className="p-5">
          <div className="flex items-center gap-1 text-amber-500 mb-2">
            <Star size={14} fill="currentColor" />
            <span className="text-sm font-medium text-gray-900">{ratingDisplay}</span>
            <span className="text-xs text-gray-500">({property.reviews} avis)</span>
          </div>

          <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-1 group-hover:text-emerald-700 transition-colors">
            {property.title}
          </h3>

          <div className="flex items-center gap-2 text-gray-500 text-sm mb-4">
            <MapPin size={14} />
            <span className="line-clamp-1">{property.location}</span>
          </div>

          <div className="flex items-center justify-between text-gray-500 text-sm border-t border-gray-100 pt-4">
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
          <a href={`tel:${CONTACT_PHONE_RAW}`} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 whitespace-nowrap">
            <Phone size={14} />
            <span>Telephone</span>
          </a>
          <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap">
            <MessageCircle size={14} />
            <span>WhatsApp</span>
          </a>
          <a href={MESSENGER_LINK} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 whitespace-nowrap">
            <MessageCircle size={14} />
            <span>Messenger</span>
          </a>
        </div>
      </div>
    </div>
  );
}
