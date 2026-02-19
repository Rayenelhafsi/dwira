import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { properties } from "../data/properties";
import { PropertyCard } from "../components/PropertyCard";
import { Search, SlidersHorizontal, MapPin, Calendar, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const AMENITIES_LIST = ["Piscine", "Garage", "Climatisation", "Vue sur mer", "Jardin", "Wifi"];
const CATEGORIES_LIST = ["S+1", "S+2", "S+3", "S+4", "Villa", "Studio"];

export default function PropertiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [isFilterOpen, setIsFilterOpen] = useState(true);

  // Initialize filter states from URL params
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") || "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") || "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.get("categories")?.split(",").filter(Boolean) || []
  );
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(
    searchParams.get("amenities")?.split(",").filter(Boolean) || []
  );
  const [isFeaturedOnly, setIsFeaturedOnly] = useState(searchParams.get("featured") === "true");
  const [priceRange, setPriceRange] = useState<[number, number]>([
    parseInt(searchParams.get("minPrice") || "0"),
    parseInt(searchParams.get("maxPrice") || "1000")
  ]);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    
    if (location) params.set("location", location);
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (selectedAmenities.length > 0) params.set("amenities", selectedAmenities.join(","));
    if (isFeaturedOnly) params.set("featured", "true");
    if (priceRange[0] > 0) params.set("minPrice", priceRange[0].toString());
    if (priceRange[1] < 1000) params.set("maxPrice", priceRange[1].toString());
    
    setSearchParams(params, { replace: true });
  }, [location, checkIn, checkOut, selectedCategories, selectedAmenities, isFeaturedOnly, priceRange, setSearchParams]);

  // Derived Data
  const uniqueLocations = useMemo(() => {
    return Array.from(new Set(properties.map(p => p.location))).sort();
  }, []);

  // Toggle helpers
  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleAmenity = (am: string) => {
    setSelectedAmenities(prev => 
      prev.includes(am) ? prev.filter(a => a !== am) : [...prev, am]
    );
  };

  const clearFilters = () => {
    setLocation("");
    setCheckIn("");
    setCheckOut("");
    setSelectedCategories([]);
    setSelectedAmenities([]);
    setIsFeaturedOnly(false);
    setPriceRange([0, 1000]);
    setSearchParams(new URLSearchParams());
  };

  // Filtering Logic
  const filteredProperties = properties.filter((property) => {
    // Location
    const matchLocation = !location || property.location.toLowerCase().includes(location.toLowerCase());
    
    // Category (OR logic if multiple selected, if none selected then match all)
    const matchCategory = selectedCategories.length === 0 || selectedCategories.includes(property.category);
    
    // Amenities (AND logic - must have ALL selected)
    const matchAmenities = selectedAmenities.every(am => property.amenities.includes(am));
    
    // Price
    const matchPrice = property.pricePerNight >= priceRange[0] && property.pricePerNight <= priceRange[1];

    // Featured
    const matchFeatured = !isFeaturedOnly || property.isFeatured;

    // Date Availability (Mock logic: In a real app, this would check against booked dates)
    // For now, we just ensure dates are valid if provided, but don't filter out unless we had availability data.
    // We could mock random unavailability if we wanted, but better to show all for this demo.
    
    return matchLocation && matchCategory && matchAmenities && matchPrice && matchFeatured;
  });

  // Sort featured first if not filtering exclusively
  const sortedProperties = [...filteredProperties].sort((a, b) => {
    if (a.isFeatured === b.isFeatured) return 0;
    return a.isFeatured ? -1 : 1;
  });

  return (
    <div className="bg-gray-50 min-h-screen py-12 pt-32">
      <div className="container mx-auto px-4 md:px-6">
        
        <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Nos Biens Immobiliers</h1>
            <p className="text-gray-600">Explorez notre sélection exclusive à Kélibia.</p>
          </div>
          
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all shadow-sm font-medium ${isFilterOpen ? 'bg-emerald-700 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
          >
            <SlidersHorizontal size={18} />
            <span>{isFilterOpen ? "Masquer les filtres" : "Afficher les filtres"}</span>
          </button>
        </div>

        <AnimatePresence>
          {isFilterOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-white p-6 md:p-8 rounded-2xl shadow-lg mb-10 overflow-hidden border border-gray-100"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                
                {/* Location & Dates */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <MapPin size={16} className="text-emerald-600" /> Emplacement
                    </label>
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-gray-50"
                    >
                      <option value="">Tous les emplacements</option>
                      {uniqueLocations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Arrivée</label>
                      <input
                        type="date"
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                        className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Départ</label>
                      <input
                        type="date"
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                        className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-gray-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Type of Property */}
                <div>
                   <label className="block text-sm font-bold text-gray-900 mb-3">Type de bien</label>
                   <div className="flex flex-wrap gap-2">
                     {CATEGORIES_LIST.map(cat => (
                       <button
                         key={cat}
                         onClick={() => toggleCategory(cat)}
                         className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                           selectedCategories.includes(cat)
                             ? "bg-emerald-100 border-emerald-500 text-emerald-800 font-semibold"
                             : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                         }`}
                       >
                         {cat}
                       </button>
                     ))}
                   </div>
                </div>

                {/* Amenities */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-3">Caractéristiques</label>
                  <div className="space-y-2">
                    {AMENITIES_LIST.map(amenity => (
                      <label key={amenity} className="flex items-center gap-2 cursor-pointer group">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          selectedAmenities.includes(amenity) ? "bg-emerald-600 border-emerald-600" : "bg-white border-gray-300 group-hover:border-emerald-400"
                        }`}>
                          {selectedAmenities.includes(amenity) && <Check size={14} className="text-white" />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={selectedAmenities.includes(amenity)}
                          onChange={() => toggleAmenity(amenity)}
                        />
                        <span className={`text-sm ${selectedAmenities.includes(amenity) ? "text-gray-900 font-medium" : "text-gray-600"}`}>{amenity}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Price & Featured */}
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-bold text-gray-900">Prix / nuit</label>
                      <span className="text-sm text-emerald-700 font-semibold">{priceRange[1]} TND</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1000"
                      step="50"
                      value={priceRange[1]}
                      onChange={(e) => setPriceRange([0, parseInt(e.target.value)])}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0 TND</span>
                      <span>1000+ TND</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={isFeaturedOnly}
                        onChange={() => setIsFeaturedOnly(!isFeaturedOnly)}
                        className="w-5 h-5 text-amber-500 rounded focus:ring-amber-500 border-gray-300"
                      />
                      <span className="font-bold text-amber-900">Biens en Vedette ⭐</span>
                    </label>
                  </div>
                  
                   <button 
                      onClick={clearFilters}
                      className="w-full py-2 text-sm text-gray-500 hover:text-red-500 hover:underline transition-colors flex items-center justify-center gap-1"
                    >
                      <X size={14} /> Réinitialiser les filtres
                    </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <span className="text-gray-500 font-medium">
              {sortedProperties.length} résultat{sortedProperties.length !== 1 ? 's' : ''} trouvé{sortedProperties.length !== 1 ? 's' : ''}
            </span>
            {/* Could add a sort dropdown here later */}
          </div>

          {sortedProperties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {sortedProperties.map((property) => (
                <PropertyCard key={property.id} property={property} searchParams={searchParams.toString()} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
                <Search size={40} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Aucun bien trouvé</h3>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                Essayez de modifier vos critères de recherche ou d'élargir votre zone de recherche.
              </p>
              <button 
                onClick={clearFilters}
                className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-lg transition-colors shadow-lg"
              >
                Tout effacer et voir tous les biens
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
