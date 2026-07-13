import { useLocation, useNavigate } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Home,
  Building2,
  Layers,
  Users,
  Settings,
  LogOut,
  FileText,
  CreditCard,
  Wrench,
  BarChart,
  Calculator,
  Megaphone,
  UserCheck,
  Bell,
  BellRing,
  ShieldCheck,
  Handshake,
  Hotel,
} from 'lucide-react';
import logo from '../../../../logo dwira.jpg';
import { preloadAdminRoute } from '../utils/routePreload';

interface AdminSidebarProps {
  onClose?: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

const openStatuses = new Set([
  'en_attente_reponse_proprietaire',
  'pas_de_reponse_proprietaire',
  'reponse_positive_attente_confirmation_client',
  'client_procede_vers_paiement_en_cours',
  'reponse_negative_autre_proposition_meme_bien',
  'reponse_negative_autre_proposition_bien_similaire',
  'attente_validation_agence_partenaire',
  'attente_validation_amicale',
  'attente_validation_par_agence',
  'voucher_en_cours',
  'rejete_par_agence_partenaire',
  'rejete_par_amicale',
  'rejete_par_agence',
  'demande_recu_paiement',
  'recu_paiement_envoye',
]);

type SidebarNotification = {
  id?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  message?: string;
  lu?: boolean;
};

type SidebarReservationDemand = {
  id?: string;
  status?: string;
  payment_mode?: string | null;
  pricing_amicale_id?: string | null;
};

export function AdminSidebar({ onClose }: AdminSidebarProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [notificationAlertCount, setNotificationAlertCount] = useState(0);
  const [importantAlertCount, setImportantAlertCount] = useState(0);
  const hasLoadedAlertsRef = useRef(false);
  const isFetchingAlertsRef = useRef(false);
  const authExpiredRef = useRef(false);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleNavigate = (path: string) => {
    if (location.pathname !== path) {
      navigate(path);
    }
    handleNavClick();
  };

  const handleNavIntent = (path: string) => {
    preloadAdminRoute(path);
  };

  const openUrgentAlerts = () => {
    navigate(`/admin/notifications?focus=urgent&panel=alerts&t=${Date.now()}`);
    handleNavClick();
  };

  const handleAdminAuthExpired = useCallback(() => {
    if (authExpiredRef.current) return;
    authExpiredRef.current = true;
    setNotificationAlertCount(0);
    setImportantAlertCount(0);
  }, []);

  const fetchNotificationAlerts = useCallback(async () => {
    if (isFetchingAlertsRef.current || authExpiredRef.current) return;
    isFetchingAlertsRef.current = true;
    try {
      const [notificationsResponse, demandsResponse, pendingCalendarRequestsResponse] = await Promise.all([
        fetch(`${API_URL}/notifications`, { credentials: 'include' }),
        fetch(`${API_URL}/reservation-demands`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/calendar-requests?statuses=pending`, { credentials: 'include' }),
      ]);
      if ([notificationsResponse, demandsResponse, pendingCalendarRequestsResponse].some((response) => response.status === 401)) {
        handleAdminAuthExpired();
        return;
      }
      if (!notificationsResponse.ok || !demandsResponse.ok || !pendingCalendarRequestsResponse.ok) {
        return;
      }

      const notifications = await notificationsResponse.json();
      const demands = await demandsResponse.json();
      const pendingCalendarRequests = await pendingCalendarRequestsResponse.json();

      const urgentNotificationsCount = Array.isArray(notifications)
        ? notifications.filter((notification: SidebarNotification) => {
            if (notification?.lu) return false;
            const normalized = String(notification?.message || '').toLowerCase();
            return notification?.type === 'error'
              || normalized.includes('urgent')
              || normalized.includes('echec')
              || normalized.includes('expire')
              || normalized.includes('expir')
              || normalized.includes('rejet')
              || normalized.includes('annule')
              || normalized.includes('impossible');
          }).length
        : 0;

      const unreadNotificationsCount = Array.isArray(notifications)
        ? notifications.filter((notification: SidebarNotification) => !notification?.lu).length
        : 0;

      const pendingDemandsCount = Array.isArray(demands)
        ? demands.filter((demand: SidebarReservationDemand) => {
            const isAmicale = String(demand.payment_mode || '').trim() === 'amicale'
              || Boolean(String(demand.pricing_amicale_id || '').trim());
            return !isAmicale && openStatuses.has(String(demand.status || '').trim());
          }).length
        : 0;

      const pendingCalendarRequestsCount = Array.isArray(pendingCalendarRequests) ? pendingCalendarRequests.length : 0;

      setNotificationAlertCount(unreadNotificationsCount + pendingDemandsCount + pendingCalendarRequestsCount);
      setImportantAlertCount(urgentNotificationsCount + pendingCalendarRequestsCount);
      hasLoadedAlertsRef.current = true;
    } finally {
      isFetchingAlertsRef.current = false;
    }
  }, [handleAdminAuthExpired]);

  useEffect(() => {
    void fetchNotificationAlerts();
  }, [fetchNotificationAlerts]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchNotificationAlerts();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [fetchNotificationAlerts]);

  const navItems = [
    { name: 'Tableau de bord', path: '/admin', icon: LayoutDashboard },
    { name: 'Biens', path: '/admin/biens', icon: Home },
    { name: 'Packs', path: '/admin/packs', icon: Layers },
    { name: 'Clienteles', path: '/admin/clienteles', icon: Users },
    { name: 'Agences partenaires', path: '/admin/agences-partenaires', icon: Building2 },
    { name: 'Contrats', path: '/admin/contrats', icon: FileText },
    { name: 'Paiements', path: '/admin/paiements', icon: CreditCard },
    { name: 'Comptabilite', path: '/admin/comptabilite', icon: Calculator },
    { name: 'Amicales', path: '/admin/amicales', icon: Handshake },
    { name: 'Hotels', path: '/admin/hotels', icon: Hotel },
    { name: 'Reservations hotels', path: '/admin/reservations-hotels', icon: Hotel },
    { name: 'Maintenance', path: '/admin/maintenance', icon: Wrench },
    { name: 'Notifications', path: '/admin/notifications', icon: Bell, badgeCount: notificationAlertCount },
    { name: 'Statistiques', path: '/admin/statistiques', icon: BarChart },
    { name: 'Marketing', path: '/admin/marketing', icon: Megaphone },
    { name: 'Utilisateurs', path: '/admin/utilisateurs', icon: UserCheck },
    ...(user?.adminType === 'superadmin' ? [{ name: 'Sous-admins', path: '/admin/sous-admins', icon: ShieldCheck }] : []),
    { name: 'Audit securite', path: '/admin/audit-securite', icon: ShieldCheck },
    { name: 'Parametres', path: '/admin/parametres', icon: Settings },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col overflow-y-auto bg-emerald-950 text-white">
      <div className="hidden border-b border-emerald-900 p-6 lg:block">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Dwira" className="h-8 w-auto" />
            <div>
              <h2 className="text-lg font-bold leading-tight">Dwira Admin</h2>
              <p className="text-xs text-emerald-400">Gestion immobiliere</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openUrgentAlerts}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-800 bg-emerald-900/70 text-emerald-100 transition-colors hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-100"
            aria-label="Voir les notifications urgentes"
          >
            <BellRing size={18} />
            {hasLoadedAlertsRef.current && importantAlertCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {importantAlertCount > 99 ? '99+' : importantAlertCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {navItems.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => handleNavigate(item.path)}
            onMouseEnter={() => handleNavIntent(item.path)}
            onFocus={() => handleNavIntent(item.path)}
            onTouchStart={() => handleNavIntent(item.path)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive(item.path)
                ? 'bg-emerald-800 text-white shadow-sm'
                : 'text-emerald-100/70 hover:bg-emerald-900 hover:text-white'
            } w-full text-left`}
          >
            <item.icon size={18} />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {item.path === '/admin/notifications' && hasLoadedAlertsRef.current && (item.badgeCount || 0) > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {item.badgeCount! > 99 ? '99+' : item.badgeCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="border-t border-emerald-900 bg-emerald-950 p-4">
        <div className="mb-4 flex items-center gap-3">
          <img
            src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.name || 'Admin'}`}
            alt={user?.name}
            className="h-9 w-9 rounded-full border border-emerald-700 bg-white"
          />
          <div className="overflow-hidden">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs capitalize text-emerald-400">
              {user?.role === 'admin' ? (user?.adminType === 'superadmin' ? 'Superadmin' : 'Sous-admin') : (user?.role || 'Admin')}
            </p>
          </div>
        </div>
        <button
          onClick={async () => {
            await logout();
            window.location.href = '/';
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-600 hover:text-white"
        >
          <LogOut size={16} />
          Deconnexion
        </button>
      </div>
    </aside>
  );
}
