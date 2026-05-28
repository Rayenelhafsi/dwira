import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Menu, X, Phone, Mail, Facebook, Instagram, MapPin, User, LogOut, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import type { ReservationDemand } from "../admin/types";
import logo from '../../../logo dwira.jpg';
import titaTravelLogo from '../../../logo Tita travel.jpg';
import { getReservationsFromCache } from "../utils/reservations";
import { buildTelLink, getPublicContactForMode, openPhoneApp } from "../utils/deepLinks";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { getSessionUser } from "../services/auth";

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

function resolveRouteMode(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  const modeParam = params.get("mode");
  if (pathname.startsWith("/ventes") || pathname.startsWith("/vente/")) {
    return "vente";
  }
  if (pathname.startsWith("/hotels")) {
    return "hotellerie";
  }
  if (pathname.startsWith("/logements") || pathname.startsWith("/properties")) {
    if (modeParam === "location_annuelle" || modeParam === "location_saisonniere") {
      return modeParam;
    }
    return "location_saisonniere";
  }
  if (modeParam === "vente" || modeParam === "location_annuelle" || modeParam === "location_saisonniere" || modeParam === "hotellerie") {
    return modeParam;
  }
  return null;
}

function isPropertyDetailsPath(pathname: string) {
  return pathname.startsWith("/properties/");
}

const ACTIONABLE_STATUS_PRIORITY: Record<string, number> = {
  reponse_positive_attente_confirmation_client: 0,
  client_procede_vers_paiement_en_cours: 1,
  attente_envoi_coordonnees_contrat: 2,
  demande_recu_paiement: 3,
  contrat_realise: 4,
  demande_rejetee_admin: 5,
  succes_paiement: 6,
};

function hasCompletedClientProfile(user: {
  profileCompleted?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  telephone?: string | null;
  cin?: string | null;
}) {
  if (user.profileCompleted === true) return true;
  return Boolean(
    String(user.firstName || "").trim() &&
    String(user.lastName || "").trim() &&
    String(user.telephone || "").trim() &&
    String(user.cin || "").trim()
  );
}

async function getApiErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || "").trim();
    if (message) return message;
  } else {
    const text = await response.text().catch(() => "");
    if (text && !text.startsWith("<!DOCTYPE")) return text;
  }
  return fallback;
}

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAutoHidden, setIsAutoHidden] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [reservationCount, setReservationCount] = useState(0);
  const [actionableDemand, setActionableDemand] = useState<ReservationDemand | null>(null);
  const [showActionableNotice, setShowActionableNotice] = useState(false);
  const [cancellingDemandId, setCancellingDemandId] = useState<string | null>(null);
  const lastScrollYRef = useRef(0);
  const isHomePage = location.pathname === "/";
  const isAgentAmicaleDashboard = location.pathname.startsWith("/agent-amicale/dashboard");
  const isReservationConfirmationPage = location.pathname.startsWith("/reservation/confirmation/");
  const isClientFinalizationFlowPage =
    /^\/mes-reservations\/[^/]+\/(coordonnees|paiement)$/.test(location.pathname);
  const isMyReservationsPage = location.pathname === "/mes-reservations";
  const isPropertyDetailsPage = isPropertyDetailsPath(location.pathname);
  const isPropertyTopHidden = isPropertyDetailsPage && !isOpen && !isScrolled;
  const useLightText = isHomePage && !isScrolled && !isOpen;
  const useSolidHeader = !isHomePage || isScrolled || isOpen;
  const isPublicAmicaleFlow = Boolean(new URLSearchParams(location.search).get("amicale"))
    && !location.pathname.startsWith("/agent-amicale");
  const routeMode = resolveRouteMode(location.pathname, location.search);
  const headerContact = getPublicContactForMode(routeMode);
  const facebookUrl = `https://www.facebook.com/${encodeURIComponent(headerContact.messengerPage)}`;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isNavLinkActive = (path: string) => {
    const [pathname] = String(path || "").split("?");
    return location.pathname === pathname || location.pathname.startsWith(`${pathname}/`);
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsAutoHidden(false);
      lastScrollYRef.current = typeof window !== "undefined" ? window.scrollY : 0;
      return;
    }

    if (isHomePage) {
      setIsAutoHidden(false);
      return;
    }

    if (isPropertyDetailsPage) {
      lastScrollYRef.current = typeof window !== "undefined" ? window.scrollY : 0;
      const handleDirectionalScroll = () => {
        const currentY = Math.max(window.scrollY, 0);
        const previousY = lastScrollYRef.current;
        const delta = currentY - previousY;

        setIsScrolled(currentY > 10);

        if (currentY <= 24) {
          setIsAutoHidden(true);
          lastScrollYRef.current = currentY;
          return;
        }

        if (delta > 8) {
          setIsAutoHidden(true);
        } else if (delta < -4) {
          setIsAutoHidden(false);
        }

        lastScrollYRef.current = currentY;
      };

      window.addEventListener("scroll", handleDirectionalScroll, { passive: true });
      return () => {
        window.removeEventListener("scroll", handleDirectionalScroll);
      };
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleHide = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsAutoHidden(true);
      }, 3000);
    };

    const revealHeader = () => {
      setIsAutoHidden(false);
      scheduleHide();
    };

    scheduleHide();
    window.addEventListener("scroll", revealHeader, { passive: true });
    window.addEventListener("mousemove", revealHeader, { passive: true });
    window.addEventListener("touchstart", revealHeader, { passive: true });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("scroll", revealHeader);
      window.removeEventListener("mousemove", revealHeader);
      window.removeEventListener("touchstart", revealHeader);
    };
  }, [isOpen, isHomePage, isPropertyDetailsPage, location.pathname, location.search]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!user || user.role !== "user" || !user.email) {
      setReservationCount(0);
      setActionableDemand(null);
      setShowActionableNotice(false);
      return;
    }
    let cancelled = false;
    const profileCompleted = hasCompletedClientProfile(user);
    const query = new URLSearchParams();
    if (user.id) query.set("client_user_id", user.id);
    query.set("client_email", user.email);
    void getSessionUser().then((sessionUser) => {
      if (!sessionUser || cancelled) return;
      return fetch(`${import.meta.env.VITE_API_URL || "/api"}/reservation-demands?${query.toString()}`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : [])
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setReservationCount(list.length);
        const nextDemand = list
          .filter((item) =>
            item.status === "reponse_positive_attente_confirmation_client" ||
            item.status === "client_procede_vers_paiement_en_cours" ||
            item.status === "attente_envoi_coordonnees_contrat" ||
            item.status === "demande_recu_paiement" ||
            item.status === "contrat_realise" ||
            item.status === "demande_rejetee_admin" ||
            item.status === "succes_paiement"
          )
          .sort((a, b) => {
            const pa = ACTIONABLE_STATUS_PRIORITY[a.status] ?? 99;
            const pb = ACTIONABLE_STATUS_PRIORITY[b.status] ?? 99;
            if (pa !== pb) return pa - pb;
            const da = new Date(String(a.updated_at || a.created_at || "")).getTime();
            const db = new Date(String(b.updated_at || b.created_at || "")).getTime();
            return db - da;
          })[0] || null;
        if (!nextDemand) return;
        const shouldShowForCurrentUser =
          profileCompleted
          || nextDemand.status === "reponse_positive_attente_confirmation_client"
          || nextDemand.status === "client_procede_vers_paiement_en_cours"
          || nextDemand.status === "succes_paiement";
        if (!shouldShowForCurrentUser) {
          setActionableDemand(null);
          setShowActionableNotice(false);
          return;
        }
        const serviceQuoteKeyPart = nextDemand.variable_services_quote_status === "devis_envoye"
          ? `${nextDemand.variable_services_quote_total || 0}_${nextDemand.updated_at || ""}`
          : "no_quote";
        const demandVersion = String(nextDemand.updated_at || nextDemand.created_at || "");
        const key = `dwira_action_notice_${nextDemand.id}_${nextDemand.status}_${demandVersion}_${serviceQuoteKeyPart}`;
        if (isReservationConfirmationPage || isClientFinalizationFlowPage || isMyReservationsPage) {
          setActionableDemand(null);
          setShowActionableNotice(false);
          return;
        }
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          setActionableDemand(nextDemand);
          setShowActionableNotice(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReservationCount(getReservationsFromCache({ clientUserId: user.id, clientEmail: user.email }).length);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [user, location.pathname, location.search, isReservationConfirmationPage, isClientFinalizationFlowPage, isMyReservationsPage]);

  const proceedToCoordinates = async () => {
    if (!actionableDemand) return;
    try {
      if (actionableDemand.status === "reponse_positive_attente_confirmation_client") {
        const response = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/reservation-demands/${encodeURIComponent(actionableDemand.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status: "client_procede_vers_paiement_en_cours",
            actor_type: "client",
            actor_id: user?.id || user?.email || "client",
            history_note: "Client procede vers le paiement",
          }),
        });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, "Mise a jour du statut impossible"));
        setShowActionableNotice(false);
        navigate(`/mes-reservations/${encodeURIComponent(actionableDemand.id)}/coordonnees`);
        return;
      }
      if (actionableDemand.status === "client_procede_vers_paiement_en_cours") {
        setShowActionableNotice(false);
        navigate(`/mes-reservations/${encodeURIComponent(actionableDemand.id)}/coordonnees`);
        return;
      }
      if (actionableDemand.status === "attente_envoi_coordonnees_contrat") {
        setShowActionableNotice(false);
        navigate(`/mes-reservations/${encodeURIComponent(actionableDemand.id)}/coordonnees`);
        return;
      }
      if (actionableDemand.status === "demande_recu_paiement") {
        setShowActionableNotice(false);
        navigate(`/mes-reservations/${encodeURIComponent(actionableDemand.id)}/paiement`);
        return;
      }
      if (actionableDemand.status === "contrat_realise") {
        setShowActionableNotice(false);
        navigate(`/mes-reservations/${encodeURIComponent(actionableDemand.id)}/paiement`);
        return;
      }
      if (actionableDemand.status === "succes_paiement") {
        setShowActionableNotice(false);
        setActionableDemand(null);
        return;
      }
      setShowActionableNotice(false);
      navigate("/mes-reservations");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Redirection impossible");
    }
  };

  const cancelReservationFromNotice = async () => {
    if (!actionableDemand || actionableDemand.status !== "reponse_positive_attente_confirmation_client") return;
    setCancellingDemandId(actionableDemand.id);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/reservation-demands/${encodeURIComponent(actionableDemand.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: "demande_annulee_client",
          actor_type: "client",
          actor_id: user?.id || user?.email || "client",
          client_note: "Reservation annulee par le client.",
          history_note: "Reservation annulee par le client",
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Annulation impossible"));
      const updated = await response.json().catch(() => null);
      if (String(updated?.status || "") !== "demande_annulee_client") {
        throw new Error("Annulation non appliquee par le serveur. Mise a jour backend requise.");
      }
      setShowActionableNotice(false);
      setActionableDemand(null);
      toast.success("Reservation annulee.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Annulation impossible");
    } finally {
      setCancellingDemandId(null);
    }
  };

  const navLinks = [
    { name: "Accueil", path: "/" },
    { name: "Locations saisonnieres", path: "/logements?mode=location_saisonniere" },
    { name: "Hotellerie", path: "/?mode=hotellerie" },
    { name: "Ventes", path: "/ventes" },
    { name: "Apps", path: "/deploy-mobile" },
    { name: "Contact", path: "/contact" },
  ];

  if (isAgentAmicaleDashboard) return null;

  return (
    <>
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all ${isPropertyDetailsPage ? "duration-200" : "duration-300"} ${
        useSolidHeader
          ? "bg-white/92 backdrop-blur-xl shadow-sm py-2.5 md:py-2"
          : "bg-transparent py-4"
      } ${(isAutoHidden || isPropertyTopHidden) ? "-translate-y-[115%] opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}`}
    >
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 z-50">
           <span className={`flex items-center ${routeMode === "hotellerie" ? "gap-2" : ""}`}>
             <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-emerald-100 bg-white shadow-sm md:h-12 md:w-12">
               <img src={logo} alt="Dwira Immobilier" className="h-full w-full rounded-full object-cover" />
             </span>
             {routeMode === "hotellerie" && (
               <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-sky-100 bg-white shadow-sm md:h-12 md:w-12">
                 <img src={titaTravelLogo} alt="Tita Travel" className="h-full w-full object-contain p-1" />
               </span>
             )}
           </span>
           <div className={`hidden sm:block font-bold leading-tight ${useLightText ? "text-white drop-shadow-md" : "text-emerald-900"}`}>
             <span className="block text-lg">Dwira</span>
             <span className="block text-xs uppercase tracking-widest text-amber-500">
               {routeMode === "hotellerie" ? "Immobilier x Tita Travel" : "Immobilier"}
             </span>
           </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-5">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-sm font-medium transition-colors hover:text-emerald-500 ${
                useLightText ? "text-white/90 drop-shadow-sm" : "text-gray-700"
              } ${isNavLinkActive(link.path) ? "text-emerald-500 font-bold" : ""}`}
            >
              {link.name}
            </Link>
          ))}
          
          {/* Auth Section */}
          {user ? (
            <div className="flex items-center gap-3">
              {user.role === 'user' && (
                <Link
                  to="/mes-reservations"
                  className={`relative flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                    useLightText
                      ? 'border-white/30 text-white hover:bg-white/20'
                      : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  }`}
                  title="Mes demandes"
                >
                  <ShoppingBag size={18} />
                  {reservationCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                      {reservationCount}
                    </span>
                  )}
                </Link>
              )}
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
                    useLightText ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    <User size={16} />
                  </div>
                )}
                <span className={`text-sm font-medium ${useLightText ? 'text-white' : 'text-gray-700'}`}>
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
            <div className="flex items-center gap-2">
              {!isPublicAmicaleFlow ? (
                <>
                  <Link
                    to="/agent-amicale/login"
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      !useLightText
                        ? "text-emerald-700 hover:bg-emerald-50 border border-emerald-200"
                        : "text-white hover:bg-white/20 border border-white/30"
                    }`}
                  >
                    <User size={16} />
                    <span>Login amicale</span>
                  </Link>
                  <Link
                    to="/login"
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      !useLightText
                        ? "text-emerald-700 hover:bg-emerald-50 border border-emerald-200" 
                        : "text-white hover:bg-white/20 border border-white/30"
                    }`}
                  >
                    <User size={16} />
                    <span>Connexion</span>
                  </Link>
                </>
              ) : null}
            </div>
          )}
          
          <button
            type="button"
            onClick={() => openPhoneApp(headerContact.phone)}
            className="min-w-[196px] px-6 py-3 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Phone size={16} />
            <span>{headerContact.phone.replace("+216", "+216 ")}</span>
          </button>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className={`lg:hidden z-[95] inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm transition-colors ${
            useSolidHeader
              ? "border-gray-200 bg-white text-slate-900"
              : "border-white/30 bg-white/12 text-white backdrop-blur-md"
          }`}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {isOpen ? (
            <X className="text-gray-900" />
          ) : (
            <Menu className={useLightText ? "text-white" : "text-gray-900"} />
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
              className="fixed inset-0 left-0 top-0 z-[90] h-dvh w-screen overflow-hidden bg-white lg:hidden"
            >
              <div className="relative z-10 flex h-full flex-col overflow-y-auto px-6 pb-10 pt-28">
                <div className="mb-8 flex flex-col items-center border-b border-gray-100 pb-6">
                  <div className={`mb-4 flex items-center ${routeMode === "hotellerie" ? "gap-3" : ""}`}>
                    <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-emerald-100 bg-white shadow-sm">
                      <img src={logo} alt="Dwira Immobilier" className="h-full w-full rounded-full object-cover" />
                    </span>
                    {routeMode === "hotellerie" && (
                      <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-sky-100 bg-white shadow-sm">
                        <img src={titaTravelLogo} alt="Tita Travel" className="h-full w-full object-contain p-1" />
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-emerald-900">Dwira Immobilier</h2>
                  {routeMode === "hotellerie" && (
                    <p className="mt-2 text-sm font-medium text-sky-700">En partenariat avec Tita Travel</p>
                  )}
                </div>
              
                <div className="flex flex-col gap-5 py-8">
                  {navLinks.map((link) => (
                    <Link
                      key={link.path}
                      to={link.path}
                      className="text-center text-2xl font-semibold text-gray-800 hover:text-emerald-600"
                    >
                      {link.name}
                    </Link>
                  ))}
                </div>
              
              {/* Mobile Auth Section */}
              {user ? (
                <div className="mt-2 flex flex-col items-center gap-4 border-t border-gray-100 pt-6">
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
                    className="text-base font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    Mon espace
                  </Link>
                  {user.role === 'user' && (
                    <Link
                      to="/mes-reservations"
                      className="flex items-center gap-2 text-base font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      <ShoppingBag size={22} />
                      <span>Mes demandes{reservationCount > 0 ? ` (${reservationCount})` : ''}</span>
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 rounded-full bg-red-100 px-6 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-200"
                  >
                    <LogOut size={18} />
                    <span>Déconnexion</span>
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-col items-center gap-3 border-t border-gray-100 pt-6">
                  {!isPublicAmicaleFlow ? (
                    <>
                      <Link
                        to="/agent-amicale/login"
                        className="flex items-center gap-2 text-xl font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        <User size={24} />
                        <span>Login amicale</span>
                      </Link>
                      <Link
                        to="/login"
                        className="flex items-center gap-2 text-xl font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        <User size={24} />
                        <span>Connexion</span>
                      </Link>
                    </>
                  ) : null}
                </div>
              )}
              
                <div className="mt-auto flex justify-center gap-6 pt-10">
                  <a href={facebookUrl} target="_blank" rel="noreferrer" className="text-gray-600 hover:text-blue-600">
                    <Facebook size={28} />
                  </a>
                  <a href="https://www.instagram.com/dwira.immobiliere" target="_blank" rel="noreferrer" className="text-gray-600 hover:text-pink-600">
                    <Instagram size={28} />
                  </a>
                  <a href="https://www.tiktok.com/@Dwira.immobilier" target="_blank" rel="noreferrer" className="text-gray-600 hover:text-black">
                    <TikTokIcon size={28} />
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
    <Dialog
      open={showActionableNotice && !isReservationConfirmationPage && !isClientFinalizationFlowPage && !isMyReservationsPage}
      onOpenChange={(open) => {
        if (!open) return;
        setShowActionableNotice(true);
      }}
    >
      <DialogContent
        className="max-w-xl border-2 border-emerald-200 p-7 [&_[data-slot='dialog-close-button']]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl text-emerald-700">Action requise</DialogTitle>
          <DialogDescription className="text-base text-gray-600">
            {actionableDemand?.status === "succes_paiement"
              ? "Paiement confirme avec succes. Votre demande est finalisee."
              : actionableDemand?.status === "reponse_positive_attente_confirmation_client"
              ? "Le proprietaire a accepte votre demande. Vous pouvez proceder directement au paiement."
              : actionableDemand?.status === "client_procede_vers_paiement_en_cours"
                ? "Vous avez deja lance la finalisation. Continuez pour terminer votre paiement."
              : actionableDemand?.status === "attente_envoi_coordonnees_contrat"
                ? "Votre demande est prete. Vous pouvez proceder directement au paiement."
                : actionableDemand?.status === "contrat_realise"
                  ? "Votre contrat est pret. Passez a l'etape paiement."
                  : actionableDemand?.status === "demande_rejetee_admin"
                    ? "Une mise a jour importante de votre demande est disponible."
              : actionableDemand?.variable_services_quote_status === "devis_envoye" && Number(actionableDemand?.variable_services_quote_total || 0) > 0
                ? `Votre devis separe pour les services additionnels est pret (${Number(actionableDemand?.variable_services_quote_total || 0).toLocaleString("fr-FR")} TND).`
                : "Une action est requise sur votre demande."}
          </DialogDescription>
        </DialogHeader>
        {actionableDemand?.status === "succes_paiement" ? (
          <div className="rounded-2xl border border-emerald-200 bg-[radial-gradient(circle_at_top,#d1fae5_0%,#ecfdf5_45%,#ffffff_100%)] p-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_0_0_10px_rgba(16,185,129,0.14)] animate-pulse">
              <span className="text-4xl leading-none">?</span>
            </div>
            <p className="mt-4 text-2xl font-bold text-emerald-800">Paiement reussi</p>
            <p className="mt-1 text-sm text-emerald-700">Demande {actionableDemand?.id}</p>
          </div>
        ) : actionableDemand?.variable_services_quote_status === "devis_envoye" && Number(actionableDemand?.variable_services_quote_total || 0) > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Vos services payants variables ont un devis séparé. Consultez votre demande pour voir le détail avant de continuer.
          </div>
        ) : null}
        <DialogFooter>
          {actionableDemand?.status === "reponse_positive_attente_confirmation_client" ? (
            <button
              type="button"
              onClick={() => void cancelReservationFromNotice()}
              disabled={cancellingDemandId === actionableDemand.id}
              className="rounded-lg border border-rose-300 px-5 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              {cancellingDemandId === actionableDemand.id ? "Annulation..." : "Annuler la reservation"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (actionableDemand?.status === "succes_paiement") {
                setShowActionableNotice(false);
                setActionableDemand(null);
                return;
              }
              if (actionableDemand?.variable_services_quote_status === "devis_envoye" && Number(actionableDemand?.variable_services_quote_total || 0) > 0) {
                setShowActionableNotice(false);
                navigate("/mes-reservations");
                return;
              }
              void proceedToCoordinates();
            }}
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            {actionableDemand?.status === "succes_paiement"
              ? "Fermer"
              : actionableDemand?.variable_services_quote_status === "devis_envoye" && Number(actionableDemand?.variable_services_quote_total || 0) > 0
              ? "Voir mon devis services"
              : actionableDemand?.status === "demande_rejetee_admin"
                ? "Voir ma demande"
                : "Proceder vers paiement"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export function Footer() {
  const location = useLocation();
  const routeMode = resolveRouteMode(location.pathname, location.search);
  const footerContact = getPublicContactForMode(routeMode);
  const facebookUrl = `https://www.facebook.com/${encodeURIComponent(footerContact.messengerPage)}`;

  return (
    <footer className="bg-emerald-950 text-white pt-16 pb-8 border-t border-emerald-900">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] overflow-hidden">
                <img src={logo} alt="Dwira Logo" className="h-9 w-9 rounded-full object-cover" />
              </span>
              <span className="text-xl font-bold text-white">Dwira Immobilier</span>
            </div>
            <p className="text-emerald-100/70 leading-relaxed mb-6">
              Votre partenaire de confiance à Kélibia pour l'achat, la vente, la location et la gestion personnalisée de vos biens immobiliers.
            </p>
            <div className="flex gap-4">
              <a href={facebookUrl} target="_blank" rel="noreferrer" className="bg-emerald-900 p-2.5 rounded-full hover:bg-blue-600 transition-colors">
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
              <li><a href="/privacy-policy.html" target="_blank" rel="noreferrer" className="text-emerald-100/70 hover:text-white transition-colors">Politique de confidentialite</a></li>
              <li><a href="/terms-of-service.html" target="_blank" rel="noreferrer" className="text-emerald-100/70 hover:text-white transition-colors">Conditions d'utilisation</a></li>
              <li><Link to="/cgv" className="text-emerald-100/70 hover:text-white transition-colors">CGV</Link></li>
              <li><Link to="/mentions-legales" className="text-emerald-100/70 hover:text-white transition-colors">Mentions legales</Link></li>
              <li><a href="/data-deletion.html" target="_blank" rel="noreferrer" className="text-emerald-100/70 hover:text-white transition-colors">Suppression des donnees</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-amber-400">Contact Info</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-emerald-100/70">
                <Phone className="shrink-0 text-amber-400" size={20} />
                <a href={buildTelLink('+21629879227')} className="hover:text-white transition-colors">+216 29 879 227</a>
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

