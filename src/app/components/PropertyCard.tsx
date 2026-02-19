import { Link } from "react-router";
import { Star, MapPin, Users, Bed, Bath } from "lucide-react";
import { Property } from "../data/properties";

interface PropertyCardProps {
  property: Property;
  searchParams?: string;
}

export function PropertyCard({ property, searchParams }: PropertyCardProps) {
  const linkTo = searchParams 
    ? `/properties/${property.slug}?${searchParams}`
    : `/properties/${property.slug}`;
    
  return (
    <Link 
      to={linkTo}
      className="group block bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={property.images[0]}
          alt={property.title}
          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-sm font-semibold text-gray-900 shadow-sm">
          {property.pricePerNight} TND <span className="text-xs font-normal text-gray-500">/ nuit</span>
        </div>
        <div className="absolute top-3 left-3 bg-emerald-700/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-semibold text-white shadow-sm">
          {property.category}
        </div>
      </div>
      
      <div className="p-5">
        <div className="flex items-center gap-1 text-amber-500 mb-2">
          <Star size={14} fill="currentColor" />
          <span className="text-sm font-medium text-gray-900">{property.rating}</span>
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
  );
}
