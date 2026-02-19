import { useState, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { Search, MapPin, Calendar, ArrowRight, Star, Key, X, ChevronLeft, ChevronRight, Home, Check } from "lucide-react";
import { properties } from "../data/properties";
import { PropertyCard } from "../components/PropertyCard";
import { motion, AnimatePresence } from "framer-motion";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  parseISO,
  isBefore,
  startOfDay
} from "date-fns";
import { fr } from "date-fns/locale";

const CATEGORIES_LIST = ["S+1", "S+2", "S+3", "S+4", "Villa", "Studio"];
const LOCATIONS_LIST = ["Kélibia", "Plage El Mansoura", "Petit Paris", "Front de mer"];

export default function HomePage() {
  const navigate = useNavigate();
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Filter states
  const [location, setLocation] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const today = startOfDay(new Date());

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleDateClick = (date: Date) => {
    if (isBefore(date, today)) return;
    
    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(date);
      setCheckOut(null);
    } else {
      if (date < checkIn) {
        setCheckIn(date);
        setCheckOut(checkIn);
      } else {
        setCheckOut(date);
      }
    }
  };

  const isDateInRange = (date: Date) => {
    if (!checkIn || !checkOut) return false;
    return isWithinInterval(date, { 
      start: checkIn < checkOut ? checkIn : checkOut, 
      end: checkIn < checkOut ? checkOut : checkIn 
    });
  };

  const getDayClassName = (date: Date) => {
    const isCurrentMonth = isSameMonth(date, currentMonth);
    const isPast = isBefore(date, today);
    const isStart = checkIn && isSameDay(date, checkIn);
    const isEnd = checkOut && isSameDay(date, checkOut);
    const isInRange = isDateInRange(date);

    let className = "w-10 h-10 flex items-center justify-center text-sm rounded-full cursor-pointer transition-all ";
    
    if (!isCurrentMonth) {
      className += "text-gray-300 ";
    } else if (isPast) {
      className += "text-gray-300 cursor-not-allowed ";
    } else if (isStart || isEnd || isInRange) {
      className += "bg-emerald-600 text-white font-bold shadow-lg ";
    } else {
      className += "text-gray-700 hover:bg-emerald-50 ";
    }

    return className;
  };

  const handleSearch = () => {
    setHasSearched(true);
    
    const params = new URLSearchParams();
    if (location) params.set("location", location);
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (checkIn) params.set("checkIn", format(checkIn, 'yyyy-MM-dd'));
    if (checkOut) params.set("checkOut", format(checkOut, 'yyyy-MM-dd'));
    
    navigate(`/logements?${params.toString()}`);
    
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const filteredProperties = useMemo(() => {
    if (!hasSearched) return properties.filter((p) => p.isFeatured).slice(0, 6);
    
    return properties.filter((property) => {
      const matchLocation = !location || property.location.toLowerCase().includes(location.toLowerCase());
      const matchCategory = selectedCategories.length === 0 || selectedCategories.includes(property.category);
      return matchLocation && matchCategory;
    });
  }, [hasSearched, location, selectedCategories]);

  const dateRangeText = () => {
    if (checkIn && checkOut) {
      return `${format(checkIn, "d MMM", { locale: fr })} - ${format(checkOut, "d MMM yyyy", { locale: fr })}`;
    }
    if (checkIn) {
      return `Du ${format(checkIn, "d MMM", { locale: fr })}...`;
    }
    return "Dates de séjour";
  };

  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center py-20">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1690549392404-de10519e6adb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxUdW5pc2lhJTIwS2VsaWJpYSUyMGJlYWNoJTIwdmlsbGElMjBtZWRpdGVycmFuZWFuJTIwY29hc3R8ZW58MXx8fHwxNzcxNDEyOTU5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Kelibia Beach"
            className="w-full h-full object-cover brightness-75"
          />
          <div className="absolute inset-0 bg-emerald-950/40 mix-blend-multiply pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        </div>

        <div className="relative z-10 container mx-auto px-4 md:px-6 text-center text-white w-full max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-6"
          >
             <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 leading-tight drop-shadow-xl">
               Dwira <span className="text-amber-400">Immobilier</span>
             </h1>
             <p className="text-xl md:text-2xl font-light tracking-wide text-emerald-50">
               Votre partenaire de confiance à Kélibia
             </p>
          </motion.div>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg md:text-xl mb-8 max-w-2xl mx-auto drop-shadow-md text-gray-100"
          >
            Achat • Vente • Location • Gestion personnalisée
          </motion.p>

          {/* Filter Bar */}
          <div className="bg-white rounded-3xl shadow-2xl pointer-events-auto">
            {/* Selected Filters Display - Green Boxes */}
            {(location || selectedCategories.length > 0 || (checkIn && checkOut)) && (
              <div className="bg-emerald-50 px-6 py-3 border-b border-emerald-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-700 uppercase">Filtres actifs:</span>
                  {location && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                      <MapPin size={12} />
                      {location}
                      <button onClick={() => setLocation("")} className="ml-1 hover:text-emerald-200">
                        <X size={12} />
                      </button>
                    </span>
                  )}
                  {selectedCategories.map(cat => (
                    <span key={cat} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                      <Home size={12} />
                      {cat}
                      <button onClick={() => toggleCategory(cat)} className="ml-1 hover:text-emerald-200">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {checkIn && checkOut && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                      <Calendar size={12} />
                      {format(checkIn, "d MMM", { locale: fr })} - {format(checkOut, "d MMM", { locale: fr })}
                      <button onClick={() => { setCheckIn(null); setCheckOut(null); }} className="ml-1 hover:text-emerald-200">
                        <X size={12} />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Filter Controls */}
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* Location Dropdown */}
                <div className="relative z-50 pointer-events-auto">
                  <button 
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 cursor-pointer hover:border-emerald-400 transition-colors h-full text-left pointer-events-auto"
                    onClick={() => {
                      console.log('Location clicked, current:', showLocationDropdown, 'setting to:', !showLocationDropdown);
                      setShowLocationDropdown(!showLocationDropdown);
                      setShowCategoryDropdown(false);
                      setShowCalendar(false);
                    }}
                  >
                    <MapPin className="text-emerald-600 shrink-0" size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 font-medium">Où cherchez-vous ?</p>
                      <p className="text-sm text-gray-800 font-semibold truncate">
                        {location || "Tous les emplacements"}
                      </p>
                    </div>
                  </button>
                  
                  {showLocationDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-[100]">
                      <div className="p-2">
                        <button
                          className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${!location ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                          onClick={() => { setLocation(""); setShowLocationDropdown(false); }}
                        >
                          Tous les emplacements
                        </button>
                        {LOCATIONS_LIST.map((loc) => (
                          <button
                            key={loc}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${location === loc ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                            onClick={() => { setLocation(loc); setShowLocationDropdown(false); }}
                          >
                            {loc}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Date Range Picker */}
                <div className="relative z-50 pointer-events-auto">
                  <button 
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 cursor-pointer hover:border-emerald-400 transition-colors h-full text-left pointer-events-auto"
                    onClick={() => {
                      console.log('Calendar clicked, current:', showCalendar, 'setting to:', !showCalendar);
                      setShowCalendar(!showCalendar);
                      setShowLocationDropdown(false);
                      setShowCategoryDropdown(false);
                    }}
                  >
                    <Calendar className="text-emerald-600 shrink-0" size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 font-medium">Dates de séjour</p>
                      <p className="text-sm text-gray-800 font-semibold truncate">
                        {dateRangeText()}
                      </p>
                    </div>
                  </button>

                  {showCalendar && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-[100] md:w-[400px] md:left-auto md:right-0">
                        <div className="flex items-center justify-between mb-4">
                          <button 
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <h3 className="font-bold text-gray-900 capitalize">
                            {format(currentMonth, "MMMM yyyy", { locale: fr })}
                          </h3>
                          <button 
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-2">
                          {weekDays.map((day) => (
                            <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
                              {day}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {days.map((day, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleDateClick(day)}
                              className={getDayClassName(day)}
                            >
                              {format(day, "d")}
                            </button>
                          ))}
                        </div>

                      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                        <div className="flex items-center gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-emerald-600"></div>
                            <span className="text-gray-600">Sélectionné</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowCalendar(false)}
                          className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          Valider
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Property Type Dropdown */}
                <div className="relative z-50 pointer-events-auto">
                  <button 
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 cursor-pointer hover:border-emerald-400 transition-colors h-full text-left pointer-events-auto"
                    onClick={() => {
                      console.log('Category clicked, current:', showCategoryDropdown, 'setting to:', !showCategoryDropdown);
                      setShowCategoryDropdown(!showCategoryDropdown);
                      setShowLocationDropdown(false);
                      setShowCalendar(false);
                    }}
                  >
                    <Home className="text-emerald-600 shrink-0" size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 font-medium">Type de bien</p>
                      <p className="text-sm text-gray-800 font-semibold truncate">
                        {selectedCategories.length > 0 ? selectedCategories.join(", ") : "Tous les types"}
                      </p>
                    </div>
                  </button>

                  {showCategoryDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-[100]">
                      <div className="p-2">
                        <button
                          className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${selectedCategories.length === 0 ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                          onClick={() => { setSelectedCategories([]); setShowCategoryDropdown(false); }}
                        >
                          Tous les types
                        </button>
                        {CATEGORIES_LIST.map((cat) => (
                          <button
                            key={cat}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors flex items-center justify-between ${selectedCategories.includes(cat) ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                            onClick={() => toggleCategory(cat)}
                          >
                            <span>{cat}</span>
                            {selectedCategories.includes(cat) && (
                              <div className="w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center">
                                <Check size={12} className="text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Search Button */}
                <div className="flex items-stretch">
                  <button
                    onClick={handleSearch}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 duration-200 flex items-center justify-center gap-2"
                  >
                    <Search size={20} />
                    <span>Rechercher</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Search Results / Featured Properties */}
      <section ref={resultsRef} className="py-20 bg-gray-50 scroll-mt-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Star className="text-amber-500 fill-amber-500" size={28} />
                {hasSearched ? "Résultats de la recherche" : "Nos Coups de Cœur"}
              </h2>
              <p className="text-gray-600 max-w-xl">
                {hasSearched 
                  ? `${filteredProperties.length} logement${filteredProperties.length !== 1 ? 's' : ''} trouvé${filteredProperties.length !== 1 ? 's' : ''} selon vos critères`
                  : "Une sélection exclusive de biens pour des vacances inoubliables ou un investissement sûr."}
              </p>
            </div>
            <Link to="/logements" className="hidden md:flex items-center gap-2 text-emerald-700 font-bold hover:text-emerald-800 transition-colors group">
              Voir tout le catalogue <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProperties.map((property) => (
              <PropertyCard 
                key={property.id} 
                property={property} 
                searchParams={(() => {
                  const params = new URLSearchParams();
                  if (location) params.set("location", location);
                  if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
                  if (checkIn) params.set("checkIn", format(checkIn, 'yyyy-MM-dd'));
                  if (checkOut) params.set("checkOut", format(checkOut, 'yyyy-MM-dd'));
                  return params.toString();
                })()}
              />
            ))}
          </div>
          
          {filteredProperties.length === 0 && hasSearched && (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg mb-4">Aucun logement ne correspond à vos critères</p>
              <button 
                onClick={() => {
                  setLocation("");
                  setSelectedCategories([]);
                  setCheckIn(null);
                  setCheckOut(null);
                  setHasSearched(false);
                }}
                className="text-emerald-600 font-semibold hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}
          
          <div className="mt-12 text-center md:hidden">
            <Link to="/logements" className="inline-flex items-center gap-2 text-emerald-700 font-bold hover:text-emerald-800 transition-colors border-2 border-emerald-700 px-6 py-3 rounded-full hover:bg-emerald-50">
              Voir tous les logements <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-6">
           <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Pourquoi Choisir Dwira Immobilier ?</h2>
            <p className="text-gray-600">L'expertise locale au service de votre projet immobilier.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div className="p-8 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-emerald-100 group">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <MapPin size={36} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Expertise Locale</h3>
              <p className="text-gray-600">Basés à Kélibia, nous connaissons chaque quartier et chaque opportunité du marché local.</p>
            </div>
            
            <div className="p-8 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-emerald-100 group">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <Key size={36} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Gestion Personnalisée</h3>
              <p className="text-gray-600">De la remise des clés à l'entretien, nous gérons votre bien comme si c'était le nôtre.</p>
            </div>

            <div className="p-8 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-emerald-100 group">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <Star size={36} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Confiance & Qualité</h3>
              <p className="text-gray-600">Une agence reconnue pour son sérieux, sa transparence et la qualité de ses services.</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Call to Action */}
      <section className="py-20 bg-emerald-700 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pattern-dots"></div>
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Confiez-nous votre projet</h2>
          <p className="text-emerald-100 text-lg mb-10 max-w-2xl mx-auto">
            Que vous cherchiez à acheter, vendre ou louer, Dwira Immobilier est là pour concrétiser vos rêves.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/contact" className="inline-block bg-white text-emerald-800 font-bold py-4 px-10 rounded-full hover:bg-amber-400 hover:text-white transition-all shadow-lg transform hover:-translate-y-1">
              Nous Contacter
            </Link>
            <Link to="/logements" className="inline-block bg-emerald-800 text-white border border-emerald-600 font-bold py-4 px-10 rounded-full hover:bg-emerald-900 transition-all shadow-lg">
              Parcourir les offres
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
