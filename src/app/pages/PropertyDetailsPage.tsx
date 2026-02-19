import { useParams, Link, useSearchParams } from "react-router";
import { properties } from "../data/properties";
import { MapPin, Check, Star, Share2, Heart, Calendar, X, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import useEmblaCarousel from 'embla-carousel-react';
import { useState, useEffect, useCallback, useMemo } from "react";
import AvailabilityCalendar from "../components/AvailabilityCalendar";
import { format, differenceInDays, isWithinInterval, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export default function PropertyDetailsPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const property = properties.find((p) => p.slug === slug);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  // Read filter state from URL
  const filterLocation = searchParams.get("location") || "";
  const filterCategories = searchParams.get("categories")?.split(",").filter(Boolean) || [];
  const filterAmenities = searchParams.get("amenities")?.split(",").filter(Boolean) || [];
  const filterFeatured = searchParams.get("featured") === "true";
  const minPrice = parseInt(searchParams.get("minPrice") || "0");
  const maxPrice = parseInt(searchParams.get("maxPrice") || "1000");

  // Build query string for "Voir tout" link
  const filterQueryString = searchParams.toString();
  const backToListUrl = filterQueryString ? `/logements?${filterQueryString}` : "/logements";

  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [guests, setGuests] = useState(1);
  const [includeCleaningFee, setIncludeCleaningFee] = useState(false);
  const [includeServiceFee, setIncludeServiceFee] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Carousel for other properties
  const [otherPropertiesRef, otherPropertiesApi] = useEmblaCarousel({ 
    loop: false, 
    align: 'start',
    slidesToScroll: 1,
    containScroll: 'trimSnaps'
  });

  // Filter other properties based on URL filter state (same logic as PropertiesPage)
  const filteredOtherProperties = useMemo(() => {
    const filtered = properties.filter((p) => {
      if (p.id === property?.id) return false;
      
      // Location filter (case insensitive includes)
      const matchLocation = !filterLocation || p.location.toLowerCase().includes(filterLocation.toLowerCase());
      
      // Category filter (OR logic - any selected category matches)
      const matchCategory = filterCategories.length === 0 || filterCategories.includes(p.category);
      
      // Amenities filter (AND logic - must have ALL selected amenities)
      const matchAmenities = filterAmenities.every(am => p.amenities.includes(am));
      
      // Price filter
      const matchPrice = p.pricePerNight >= minPrice && p.pricePerNight <= maxPrice;
      
      // Featured filter
      const matchFeatured = !filterFeatured || p.isFeatured;
      
      return matchLocation && matchCategory && matchAmenities && matchPrice && matchFeatured;
    });

    // Sort: featured first (same as PropertiesPage)
    return filtered.sort((a, b) => {
      if (a.isFeatured === b.isFeatured) return 0;
      return a.isFeatured ? -1 : 1;
    });
  }, [property?.id, filterLocation, filterCategories, filterAmenities, filterFeatured, minPrice, maxPrice]);

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    document.body.style.overflow = 'unset';
  };

  const nextImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev + 1) % property!.images.length);
  }, [property]);

  const prevImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev - 1 + property!.images.length) % property!.images.length);
  }, [property]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, nextImage, prevImage]);

  const handleDateRangeSelect = (start: Date | null, end: Date | null) => {
    setSelectedStart(start);
    setSelectedEnd(end);
  };

  // Calculate total price
  const calculateTotal = () => {
    if (!selectedStart || !selectedEnd) return {
      nights: 0,
      accommodationTotal: 0,
      cleaningFee: 0,
      serviceFee: 0,
      total: 0
    };
    // Use Math.abs to prevent negative nights when dates are selected in reverse order
    const nights = Math.abs(differenceInDays(selectedEnd, selectedStart));
    const accommodationTotal = property!.pricePerNight * nights;
    const cleaningFee = (includeCleaningFee && property?.cleaningFee) ? property.cleaningFee : 0;
    const serviceFee = (includeServiceFee && property?.serviceFee) ? property.serviceFee : 0;
    return {
      nights,
      accommodationTotal,
      cleaningFee,
      serviceFee,
      total: accommodationTotal + cleaningFee + serviceFee
    };
  };

  // Check if selected range includes pending dates and get the payment deadline
  const getPendingDateInfo = () => {
    if (!selectedStart || !selectedEnd || !property?.unavailableDates) return null;
    
    const rangeStart = selectedStart < selectedEnd ? selectedStart : selectedEnd;
    const rangeEnd = selectedStart < selectedEnd ? selectedEnd : selectedStart;
    
    const overlappingPending = property.unavailableDates.find((range) => {
      if (range.status !== 'pending') return false;
      const start = parseISO(range.start);
      const end = parseISO(range.end);
      // Check if there's any overlap between selected range and pending range
      return (
        (rangeStart <= end && rangeEnd >= start) ||
        isWithinInterval(rangeStart, { start, end }) ||
        isWithinInterval(rangeEnd, { start, end })
      );
    });
    
    return overlappingPending || null;
  };

  const pricing = calculateTotal();
  const pendingDateInfo = getPendingDateInfo();
  const hasPendingDates = !!pendingDateInfo;
  
  // Get payment deadline from the pending date data (set by admin dashboard)
  const getPaymentDeadline = () => {
    if (!pendingDateInfo?.paymentDeadline) return null;
    return format(parseISO(pendingDateInfo.paymentDeadline), "d MMMM yyyy", { locale: fr });
  };

  // Auto-play for embla carousel
  useEffect(() => {
    if (emblaApi) {
      const autoplay = setInterval(() => {
        emblaApi.scrollNext();
      }, 4000);
      return () => clearInterval(autoplay);
    }
  }, [emblaApi]);

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <h1 className="text-2xl font-bold mb-4">Logement non trouvé</h1>
        <Link to="/logements" className="text-emerald-600 hover:underline">
          Retour aux logements
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white pt-24 pb-20">
      <div className="container mx-auto px-4 md:px-6">
        
        {/* Breadcrumb */}
        <div className="text-sm text-gray-500 mb-6">
          <Link to="/" className="hover:text-emerald-600">Accueil</Link>
          <span className="mx-2">/</span>
          <Link to="/logements" className="hover:text-emerald-600">Logements</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{property.title}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{property.title}</h1>
            <div className="flex items-center gap-4 text-gray-600 text-sm">
              <div className="flex items-center gap-1">
                <MapPin size={16} />
                <span>{property.location}</span>
              </div>
              <div className="flex items-center gap-1">
                 <Star size={16} className="text-amber-500 fill-current" />
                 <span className="font-medium text-gray-900">{property.rating}</span>
                 <span>({property.reviews} avis)</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4 md:mt-0">
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Share2 size={18} />
              <span className="hidden sm:inline">Partager</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Heart size={18} />
              <span className="hidden sm:inline">Sauvegarder</span>
            </button>
          </div>
        </div>

        {/* Images Grid / Slider */}
        <div className="mb-12">
          {/* Desktop Grid */}
          <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 h-[500px] rounded-xl overflow-hidden">
            <div className="col-span-2 row-span-2" onClick={() => openLightbox(0)}>
              <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer" />
            </div>
            <div className="col-span-1 row-span-1" onClick={() => openLightbox(1)}>
              <img src={property.images[1] || property.images[0]} alt={property.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer" />
            </div>
            <div className="col-span-1 row-span-1" onClick={() => openLightbox(2)}>
              <img src={property.images[2] || property.images[0]} alt={property.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer" />
            </div>
             <div className="col-span-1 row-span-1" onClick={() => openLightbox(3)}>
              <img src={property.images[3] || property.images[0]} alt={property.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer" />
            </div>
            <div className="col-span-1 row-span-1 relative" onClick={() => openLightbox(0)}>
              <img src={property.images[4] || property.images[0]} alt={property.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer" />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center hover:bg-black/40 transition-colors cursor-pointer">
                 <span className="text-white font-semibold text-lg">Voir tout</span>
              </div>
            </div>
          </div>

          {/* Mobile Slider using Embla Carousel */}
          <div className="md:hidden rounded-xl overflow-hidden shadow-lg relative group">
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex">
                {property.images.map((img, idx) => (
                  <div 
                    className="flex-[0_0_100%] min-w-0 relative h-[250px] sm:h-[300px]" 
                    key={idx}
                    onClick={() => openLightbox(idx)}
                  >
                    <img src={img} alt={`${property.title} - ${idx + 1}`} className="w-full h-full object-cover cursor-pointer" />
                  </div>
                ))}
              </div>
            </div>
            {/* Navigation Buttons for Slider could be added here */}
            <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-xs backdrop-blur-sm">
               {property.images.length} photos
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Left Column: Info */}
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center py-6 border-b border-gray-100">
               <div>
                 <h2 className="text-xl font-bold mb-1">Logement entier : {property.category}</h2>
                 <div className="flex gap-4 text-gray-600 text-sm">
                   <span className="font-medium text-emerald-700">{property.guests} voyageurs max</span>
                   <span>·</span>
                   <span>{property.bedrooms} chambres</span>
                   <span>·</span>
                   <span>{property.bathrooms} salles de bain</span>
                 </div>
               </div>
               <div className="w-12 h-12 bg-gray-200 rounded-full overflow-hidden">
                 {/* Host avatar placeholder */}
                 <div className="w-full h-full flex items-center justify-center bg-emerald-100 text-emerald-700 font-bold">DI</div>
               </div>
            </div>

            <div className="py-8 border-b border-gray-100">
              <h3 className="text-xl font-bold mb-4">À propos de ce logement</h3>
              <p className="text-gray-600 leading-relaxed whitespace-pre-line">
                {property.description}
              </p>
            </div>

            <div className="py-8 border-b border-gray-100">
              <h3 className="text-xl font-bold mb-6">Ce que propose ce logement</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {property.amenities.map((amenity, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-gray-700">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                       <Check size={16} className="text-emerald-600" />
                    </div>
                    <span>{amenity}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="py-8">
               <h3 className="text-xl font-bold mb-6">Où se situe le logement</h3>
               <div className="bg-gray-100 rounded-xl h-[300px] flex items-center justify-center relative overflow-hidden">
                 {/* Static Map Placeholder */}
                 <img 
                    src="https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=1600&auto=format&fit=crop" 
                    alt="Map" 
                    className="w-full h-full object-cover opacity-50 grayscale"
                 />
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-white p-4 rounded-full shadow-lg">
                      <MapPin size={32} className="text-emerald-600" />
                    </div>
                 </div>
               </div>
               <p className="mt-4 text-gray-600 text-sm">
                 L'emplacement exact sera communiqué après la réservation.
               </p>
            </div>

            {/* Availability Calendar Section */}
            <div className="py-8 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                <Calendar size={24} className="text-emerald-600" />
                <h3 className="text-xl font-bold">Disponibilités</h3>
              </div>
              <p className="text-gray-600 mb-6">
                Sélectionnez vos dates pour voir les disponibilités et réserver votre séjour.
              </p>
              <AvailabilityCalendar
                unavailableDates={property.unavailableDates || []}
                onDateRangeSelect={handleDateRangeSelect}
                selectedStart={selectedStart}
                selectedEnd={selectedEnd}
              />
            </div>
          </div>

          {/* Right Column: Booking Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-white rounded-xl shadow-xl border border-gray-100 p-6">
              <div className="flex justify-between items-baseline mb-6">
                <div>
                  <span className="text-2xl font-bold text-gray-900">{property.pricePerNight} TND</span>
                  <span className="text-gray-500"> / nuit</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Star size={14} className="text-amber-500 fill-current" />
                  <span className="font-medium text-gray-900">{property.rating}</span>
                </div>
              </div>

              <form className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Arrivée</label>
                    <div className="relative">
                      <input 
                        type="date" 
                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        value={selectedStart ? format(selectedStart, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setSelectedStart(e.target.value ? new Date(e.target.value) : null)}
                      />
                    </div>
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Départ</label>
                    <div className="relative">
                       <input 
                        type="date" 
                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        value={selectedEnd ? format(selectedEnd, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setSelectedEnd(e.target.value ? new Date(e.target.value) : null)}
                      />
                    </div>
                  </div>
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                     Voyageurs <span className="text-gray-500 font-normal normal-case">(max {property.guests})</span>
                   </label>
                   <select 
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                      value={guests}
                      onChange={(e) => setGuests(parseInt(e.target.value))}
                   >
                     {[...Array(property.guests)].map((_, i) => (
                       <option key={i} value={i + 1}>{i + 1} voyageur{i > 0 ? 's' : ''}</option>
                     ))}
                   </select>
                </div>

                {/* Optional Fees */}
                {property.cleaningFee !== undefined && property.cleaningFee > 0 && (
                  <div 
                    onClick={() => setIncludeCleaningFee(!includeCleaningFee)}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${
                      includeCleaningFee 
                        ? 'border-emerald-500 bg-emerald-50' 
                        : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        includeCleaningFee 
                          ? 'bg-emerald-600 border-emerald-600' 
                          : 'border-gray-300'
                      }`}>
                        {includeCleaningFee && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-gray-700">Frais de ménage</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{property.cleaningFee} TND</span>
                  </div>
                )}

                {property.serviceFee !== undefined && property.serviceFee > 0 && (
                  <div 
                    onClick={() => setIncludeServiceFee(!includeServiceFee)}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${
                      includeServiceFee 
                        ? 'border-emerald-500 bg-emerald-50' 
                        : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        includeServiceFee 
                          ? 'bg-emerald-600 border-emerald-600' 
                          : 'border-gray-300'
                      }`}>
                        {includeServiceFee && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-gray-700">Frais de service</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{property.serviceFee} TND</span>
                  </div>
                )}

                <button 
                  type="button" 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors shadow-md mt-4"
                >
                  Réserver
                </button>
                
                <p className="text-center text-xs text-gray-500 mt-2">Aucun montant ne vous sera débité pour le moment</p>

                <div className="pt-4 border-t border-gray-100 space-y-2 text-sm text-gray-600">
                   <div className="flex justify-between">
                     <span className="underline">{property.pricePerNight} TND x {pricing.nights} nuits</span>
                     <span>{pricing.accommodationTotal} TND</span>
                   </div>
                   {pricing.cleaningFee > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Frais de ménage</span>
                       <span>{pricing.cleaningFee} TND</span>
                     </div>
                   )}
                   {pricing.serviceFee > 0 && (
                     <div className="flex justify-between">
                       <span className="underline">Frais de service</span>
                       <span>{pricing.serviceFee} TND</span>
                     </div>
                   )}
                   <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100 mt-2">
                     <span>Total</span>
                     <span>{pricing.total} TND</span>
                   </div>
                </div>

                {/* Waiting list message for pending dates */}
                {hasPendingDates && getPaymentDeadline() && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-xs text-orange-800 leading-relaxed">
                      <span className="font-semibold">Liste d'attente :</span> Votre demande sera en liste d'attente car il y a une demande de confirmation en cours. Si l'autre demande est annulée, d'ici vers <span className="font-semibold">{getPaymentDeadline()}</span> nous allons traiter votre demande de confirmation et procéder vers le paiement.
                    </p>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Other Properties Section */}
      <div className="container mx-auto px-4 md:px-6 mt-16 pt-12 border-t border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {filteredOtherProperties.length > 0 ? "Autres logements" : "Tous les logements"}
          </h2>
          <Link 
            to={backToListUrl}
            className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            Voir tout
            <ArrowRight size={20} />
          </Link>
        </div>
        
        <div className="relative group">
          {/* Previous Button */}
          <button 
            onClick={() => otherPropertiesApi?.scrollPrev()}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-12 h-12 bg-white shadow-lg rounded-full flex items-center justify-center text-gray-600 hover:text-emerald-600 hover:shadow-xl transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
            type="button"
          >
            <ChevronLeft size={24} />
          </button>

          {/* Next Button */}
          <button 
            onClick={() => otherPropertiesApi?.scrollNext()}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-12 h-12 bg-white shadow-lg rounded-full flex items-center justify-center text-gray-600 hover:text-emerald-600 hover:shadow-xl transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
            type="button"
          >
            <ChevronRight size={24} />
          </button>

          {/* Properties Carousel */}
          <div className="overflow-hidden" ref={otherPropertiesRef}>
            <div className="flex gap-6">
              {(filteredOtherProperties.length > 0 ? filteredOtherProperties : properties.filter(p => p.id !== property?.id))
                .map((otherProperty) => (
                  <div 
                    key={otherProperty.id} 
                    className="flex-[0_0_280px] min-w-0 sm:flex-[0_0_320px]"
                  >
                    <Link 
                      to={`/properties/${otherProperty.slug}${filterQueryString ? `?${filterQueryString}` : ''}`}
                      className="block bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 group/card"
                    >
                      <div className="relative h-48 overflow-hidden">
                        <img 
                          src={otherProperty.images[0]} 
                          alt={otherProperty.title}
                          className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500"
                        />
                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                          <Star size={12} className="text-amber-500 fill-current" />
                          {otherProperty.rating}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-1 text-gray-500 text-xs mb-2">
                          <MapPin size={12} />
                          {otherProperty.location}
                        </div>
                        <h3 className="font-bold text-gray-900 mb-1 line-clamp-1 group-hover/card:text-emerald-600 transition-colors">
                          {otherProperty.title}
                        </h3>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold text-gray-900">{otherProperty.pricePerNight} TND</span>
                          <span className="text-gray-500 text-sm">/ nuit</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                          <span>{otherProperty.guests} voyageurs</span>
                          <span>·</span>
                          <span>{otherProperty.category}</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button 
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-50 p-2 text-white/70 hover:text-white transition-colors"
          >
            <X size={32} />
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">
            {currentImageIndex + 1} / {property.images.length}
          </div>

          {/* Previous button - almost transparent */}
          <button 
            onClick={(e) => { e.stopPropagation(); prevImage(); }}
            className="absolute left-2 sm:left-4 md:left-8 z-50 p-3 text-white/30 hover:text-white/80 hover:bg-white/10 rounded-full transition-all duration-300"
          >
            <ChevronLeft size={40} strokeWidth={1.5} />
          </button>

          {/* Next button - almost transparent */}
          <button 
            onClick={(e) => { e.stopPropagation(); nextImage(); }}
            className="absolute right-2 sm:right-4 md:right-8 z-50 p-3 text-white/30 hover:text-white/80 hover:bg-white/10 rounded-full transition-all duration-300"
          >
            <ChevronRight size={40} strokeWidth={1.5} />
          </button>

          {/* Main image with smooth transition */}
          <div 
            className="relative w-full h-full flex items-center justify-center p-4 sm:p-8 md:p-16"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={property.images[currentImageIndex]} 
              alt={`${property.title} - ${currentImageIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-all duration-500 ease-out transform"
              style={{
                animation: 'fadeInScale 0.5s ease-out'
              }}
            />
          </div>

          {/* Thumbnail navigation */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 px-4 py-2 bg-black/50 rounded-full backdrop-blur-sm overflow-x-auto max-w-[90vw]">
            {property.images.map((img, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                className={`flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-lg overflow-hidden transition-all duration-300 ${
                  idx === currentImageIndex 
                    ? 'ring-2 ring-white scale-110' 
                    : 'opacity-50 hover:opacity-80'
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
