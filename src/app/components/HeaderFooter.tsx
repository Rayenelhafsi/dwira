import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Menu, X, Phone, Mail, Facebook, Instagram, MapPin, User, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../context/AuthContext";
import logo from '../../assets/c9952e139aedea0af19c1652a89e92cb4378f1ac.png';

// Custom TikTok Icon
const TikTokIcon = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  const navLinks = [
    { name: "Accueil", path: "/" },
    { name: "Logements", path: "/logements" },
    { name: "Contact", path: "/contact" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "bg-white/95 backdrop-blur-md shadow-md py-2" : "bg-transparent py-4"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 z-50">
           <img src={logo} alt="Dwira Immobilier" className="h-12 w-auto object-contain" />
           <div className={`hidden sm:block font-bold leading-tight ${isScrolled || isOpen ? "text-emerald-900" : "text-white drop-shadow-md"}`}>
             <span className="block text-lg">Dwira</span>
             <span className="block text-xs uppercase tracking-widest text-amber-500">Immobilier</span>
           </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-sm font-medium transition-colors hover:text-emerald-500 ${
                isScrolled ? "text-gray-700" : "text-white/90 drop-shadow-sm"
              } ${location.pathname === link.path ? "text-emerald-500 font-bold" : ""}`}
            >
              {link.name}
            </Link>
          ))}
          
          {/* Auth Section */}
          {user ? (
            <div className="flex items-center gap-3">
              <Link 
                to={user.role === 'admin' ? '/admin' : '/'}
                className="flex items-center gap-2"
              >
                {user.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt={user.name} 
                    className="w-8 h-8 rounded-full border-2 border-emerald-500"
                  />
                ) : (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isScrolled ? 'bg-emerald-100 text-emerald-700' : 'bg-white/20 text-white'
                  }`}>
                    <User size={16} />
                  </div>
                )}
                <span className={`text-sm font-medium ${isScrolled ? 'text-gray-700' : 'text-white'}`}>
                  {user.name}
                </span>
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 rounded-full hover:bg-red-100 text-red-500 transition-colors"
                title="Déconnexion"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                isScrolled 
                  ? "text-emerald-700 hover:bg-emerald-50 border border-emerald-200" 
                  : "text-white hover:bg-white/20 border border-white/30"
              }`}
            >
              <User size={16} />
              <span>Connexion</span>
            </Link>
          )}
          
          <a
            href="https://wa.me/21652080695"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg flex items-center gap-2"
          >
            <Phone size={16} />
            <span>+216 52 080 695</span>
          </a>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden z-50 p-2"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? (
            <X className={isScrolled || isOpen ? "text-gray-900" : "text-white"} />
          ) : (
            <Menu className={isScrolled ? "text-gray-900" : "text-white"} />
          )}
        </button>

        {/* Mobile Nav Overlay */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, x: "100%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: "100%" }}
              transition={{ type: "tween", duration: 0.3 }}
              className="fixed inset-0 bg-white z-40 flex flex-col items-center justify-center gap-8 md:hidden"
            >
              <div className="flex flex-col items-center mb-8">
                 <img src={logo} alt="Dwira Immobilier" className="h-20 w-auto mb-4" />
                 <h2 className="text-2xl font-bold text-emerald-900">Dwira Immobilier</h2>
              </div>
              
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="text-2xl font-semibold text-gray-800 hover:text-emerald-600"
                >
                  {link.name}
                </Link>
              ))}
              
              {/* Mobile Auth Section */}
              {user ? (
                <div className="flex flex-col items-center gap-4 mt-4">
                  <div className="flex items-center gap-3">
                    {user.avatar ? (
                      <img 
                        src={user.avatar} 
                        alt={user.name} 
                        className="w-10 h-10 rounded-full border-2 border-emerald-500"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                        <User size={20} />
                      </div>
                    )}
                    <span className="text-xl font-semibold text-gray-800">{user.name}</span>
                  </div>
                  <Link 
                    to={user.role === 'admin' ? '/admin' : '/'}
                    className="text-lg text-emerald-600 hover:text-emerald-700"
                  >
                    Mon espace
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-6 py-2 bg-red-100 text-red-600 rounded-full font-medium hover:bg-red-200 transition-colors"
                  >
                    <LogOut size={18} />
                    <span>Déconnexion</span>
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="text-2xl font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-2"
                >
                  <User size={24} />
                  <span>Connexion</span>
                </Link>
              )}
              
              <div className="mt-8 flex gap-6">
                <a href="https://www.facebook.com/dwiraimmo2" target="_blank" rel="noreferrer" className="text-gray-600 hover:text-blue-600">
                  <Facebook size={28} />
                </a>
                <a href="https://www.instagram.com/dwira.immobiliere" target="_blank" rel="noreferrer" className="text-gray-600 hover:text-pink-600">
                  <Instagram size={28} />
                </a>
                <a href="https://www.tiktok.com/@Dwira.immobilier" target="_blank" rel="noreferrer" className="text-gray-600 hover:text-black">
                  <TikTokIcon size={28} />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="bg-emerald-950 text-white pt-16 pb-8 border-t border-emerald-900">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <img src={logo} alt="Dwira Logo" className="h-10 w-auto brightness-0 invert opacity-90" />
              <span className="text-xl font-bold text-white">Dwira Immobilier</span>
            </div>
            <p className="text-emerald-100/70 leading-relaxed mb-6">
              Votre partenaire de confiance à Kélibia pour l'achat, la vente, la location et la gestion personnalisée de vos biens immobiliers.
            </p>
            <div className="flex gap-4">
              <a href="https://www.facebook.com/dwiraimmo2" target="_blank" rel="noreferrer" className="bg-emerald-900 p-2.5 rounded-full hover:bg-blue-600 transition-colors">
                <Facebook size={20} />
              </a>
              <a href="https://www.instagram.com/dwira.immobiliere" target="_blank" rel="noreferrer" className="bg-emerald-900 p-2.5 rounded-full hover:bg-pink-600 transition-colors">
                <Instagram size={20} />
              </a>
              <a href="https://www.tiktok.com/@Dwira.immobilier" target="_blank" rel="noreferrer" className="bg-emerald-900 p-2.5 rounded-full hover:bg-black transition-colors">
                <TikTokIcon size={20} />
              </a>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4 text-amber-400">Liens Rapides</h3>
            <ul className="space-y-3">
              <li><Link to="/" className="text-emerald-100/70 hover:text-white transition-colors">Accueil</Link></li>
              <li><Link to="/logements" className="text-emerald-100/70 hover:text-white transition-colors">Nos Logements</Link></li>
              <li><Link to="/contact" className="text-emerald-100/70 hover:text-white transition-colors">Contactez-nous</Link></li>
              <li><a href="#" className="text-emerald-100/70 hover:text-white transition-colors">Mentions Légales</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-amber-400">Contact Info</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-emerald-100/70">
                <Phone className="shrink-0 text-amber-400" size={20} />
                <a href="tel:+21652080695" className="hover:text-white transition-colors">+216 52 080 695</a>
              </li>
              <li className="flex items-start gap-3 text-emerald-100/70">
                <MapPin className="shrink-0 text-amber-400" size={20} />
                <a href="https://maps.app.goo.gl/1ajusb4v6eQGp6WJ9" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
                  Rue Ibn Khaldoun, Kélibia 8090
                </a>
              </li>
              <li className="flex items-start gap-3 text-emerald-100/70">
                <Mail className="shrink-0 text-amber-400" size={20} />
                <span>contact@dwira-immobilier.com</span>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-emerald-900/50 pt-8 text-center text-emerald-100/40 text-sm">
          <p>&copy; {new Date().getFullYear()} Dwira Immobilier. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}
