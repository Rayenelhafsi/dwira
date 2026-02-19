import { Link, useLocation } from 'react-router';
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
  UserCheck
} from 'lucide-react';
import logo from '../../../assets/c9952e139aedea0af19c1652a89e92cb4378f1ac.png';

interface AdminSidebarProps {
  onClose?: () => void;
}

export function AdminSidebar({ onClose }: AdminSidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const navItems = [
    { name: 'Tableau de bord', path: '/admin', icon: LayoutDashboard },
    { name: 'Biens', path: '/admin/biens', icon: Home },
    { name: 'Locataires', path: '/admin/locataires', icon: Users },
    { name: 'Contrats', path: '/admin/contrats', icon: FileText },
    { name: 'Paiements', path: '/admin/paiements', icon: CreditCard },
    { name: 'Maintenance', path: '/admin/maintenance', icon: Wrench },
    { name: 'Statistiques', path: '/admin/statistiques', icon: BarChart },
    { name: 'Marketing', path: '/admin/marketing', icon: Megaphone },
    { name: 'Utilisateurs', path: '/admin/utilisateurs', icon: UserCheck },
    { name: 'Paramètres', path: '/admin/parametres', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-emerald-950 text-white flex flex-col h-screen overflow-y-auto">
      <div className="p-6 border-b border-emerald-900 flex items-center gap-3 lg:block hidden">
        <img src={logo} alt="Dwira" className="h-8 w-auto brightness-0 invert" />
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
            {item.name}
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