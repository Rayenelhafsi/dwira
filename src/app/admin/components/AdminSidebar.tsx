import { Link, useLocation } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Home, 
  Users, 
  Settings, 
  LogOut, 
  FileText,
  CreditCard,
  Wrench,
  BarChart,
  Megaphone,
  UserCheck,
  Bell,
  ShieldCheck,
  Handshake,
  Hotel
} from 'lucide-react';
import logo from '../../../assets/c9952e139aedea0af19c1652a89e92cb4378f1ac.png';

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
  'attente_validation_amicale',
  'attente_validation_par_agence',
  'voucher_en_cours',
  'rejete_par_amicale',
  'rejete_par_agence',
  'demande_recu_paiement',
  'recu_paiement_envoye',
]);

type SidebarNotification = {
  id?: string;
  lu?: boolean;
};

type SidebarReservationDemand = {
  id?: string;
  status?: string;
  payment_mode?: string | null;
  pricing_amicale_id?: string | null;
};

export function AdminSidebar({ onClose }: AdminSidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [notificationAlertCount, setNotificationAlertCount] = useState(0);
  const hasLoadedAlertsRef = useRef(false);
  const isFetchingAlertsRef = useRef(false);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const fetchNotificationAlerts = useCallback(async () => {
    if (isFetchingAlertsRef.current) return;
    isFetchingAlertsRef.current = true;
    try {
      const [notificationsResponse, demandsResponse, pendingCalendarRequestsResponse] = await Promise.all([
        fetch(`${API_URL}/notifications`, { credentials: 'include' }),
        fetch(`${API_URL}/reservation-demands`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/calendar-requests?statuses=pending`, { credentials: 'include' }),
      ]);
      if (!notificationsResponse.ok || !demandsResponse.ok || !pendingCalendarRequestsResponse.ok) {
        return;
      }
      const notifications = await notificationsResponse.json();
      const demands = await demandsResponse.json();
      const pendingCalendarRequests = await pendingCalendarRequestsResponse.json();
      const unreadNotificationsCount = Array.isArray(notifications)
        ? notifications.filter((notification: SidebarNotification) => !notification?.lu).length
        : 0;
      const pendingDemandsCount = Array.isArray(demands)
        ? demands.filter((demand: SidebarReservationDemand) => {
            const isAmicale = String(demand.payment_mode || '').trim() === 'amicale' || Boolean(String(demand.pricing_amicale_id || '').trim());
            return !isAmicale && openStatuses.has(String(demand.status || '').trim());
          }).length
        : 0;
      const pendingCalendarRequestsCount = Array.isArray(pendingCalendarRequests) ? pendingCalendarRequests.length : 0;
      setNotificationAlertCount(unreadNotificationsCount + pendingDemandsCount + pendingCalendarRequestsCount);
      hasLoadedAlertsRef.current = true;
    } finally {
      isFetchingAlertsRef.current = false;
    }
  }, []);

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
    { name: 'Clienteles', path: '/admin/clienteles', icon: Users },
    { name: 'Contrats', path: '/admin/contrats', icon: FileText },
    { name: 'Paiements', path: '/admin/paiements', icon: CreditCard },
    { name: 'Amicales', path: '/admin/amicales', icon: Handshake },
    { name: 'Reservations hotels', path: '/admin/reservations-hotels', icon: Hotel },
    { name: 'Maintenance', path: '/admin/maintenance', icon: Wrench },
    { name: 'Notifications', path: '/admin/notifications', icon: Bell, badgeCount: notificationAlertCount },
    { name: 'Statistiques', path: '/admin/statistiques', icon: BarChart },
    { name: 'Marketing', path: '/admin/marketing', icon: Megaphone },
    { name: 'Utilisateurs', path: '/admin/utilisateurs', icon: UserCheck },
    { name: 'Audit securite', path: '/admin/audit-securite', icon: ShieldCheck },
    { name: 'Paramètres', path: '/admin/parametres', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-emerald-950 text-white flex flex-col h-screen overflow-y-auto">
      <div className="p-6 border-b border-emerald-900 flex items-center gap-3 lg:block hidden">
        <img src={logo} alt="Dwira" className="h-8 w-auto" />
        <div>
          <h2 className="font-bold text-lg leading-tight">Dwira Admin</h2>
          <p className="text-emerald-400 text-xs">Gestion immobilière</p>
        </div>
      </div>
      
      <nav className="flex-1 py-6 px-3 space-y-1">
        {navItems.map((item) => (
          <Link 
            key={item.path}
            to={item.path} 
            onClick={handleNavClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.path) 
                ? 'bg-emerald-800 text-white shadow-sm' 
                : 'text-emerald-100/70 hover:bg-emerald-900 hover:text-white'
            }`}
          >
            <item.icon size={18} />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {item.path === '/admin/notifications' && hasLoadedAlertsRef.current && (item.badgeCount || 0) > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {item.badgeCount! > 99 ? '99+' : item.badgeCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
      
      <div className="p-4 border-t border-emerald-900 bg-emerald-950">
        <div className="flex items-center gap-3 mb-4">
          <img 
            src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.name || 'Admin'}`} 
            alt={user?.name} 
            className="w-9 h-9 rounded-full bg-white border border-emerald-700"
          />
          <div className="overflow-hidden">
            <p className="font-medium text-sm truncate">{user?.name}</p>
            <p className="text-xs text-emerald-400 truncate capitalize">{user?.role || 'Admin'}</p>
          </div>
        </div>
        <button 
          onClick={() => {
            logout();
            window.location.href = '/';
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 text-red-300 hover:bg-red-600 hover:text-white rounded-lg transition-colors text-sm font-medium"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}

