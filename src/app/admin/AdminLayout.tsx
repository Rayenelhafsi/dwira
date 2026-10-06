import { Outlet, useLocation, useNavigate, useNavigation } from 'react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AdminSidebar, buildAdminNavItems } from './components/AdminSidebar';
import { Menu, X } from 'lucide-react';
import logo from '../../../logo dwira.jpg';
import { preloadImportantAdminRoutes } from './utils/routePreload';

export function AdminLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('dwira-admin-sidebar-collapsed') === '1';
  });

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate('/connexion-admin-interne', { replace: true });
      } else if (user.role !== 'admin') {
        navigate('/', { replace: true });
      }
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (isLoading || !user || user.role !== 'admin') return;
    const idleId = window.requestIdleCallback?.(() => preloadImportantAdminRoutes(), { timeout: 2000 });
    const timeoutId = window.setTimeout(() => preloadImportantAdminRoutes(), 2500);
    return () => {
      if (typeof idleId === 'number') {
        window.cancelIdleCallback?.(idleId);
      }
      window.clearTimeout(timeoutId);
    };
  }, [isLoading, user]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    window.localStorage.setItem('dwira-admin-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);


  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-emerald-600 font-medium">
      Chargement de l'administration...
    </div>
  );

  if (!user) return null;

  const navItems = buildAdminNavItems(user, 0);
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);
  const isWideWorkspace = location.pathname.startsWith('/admin/ventes');

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-gray-50 font-sans text-gray-900">
      {navigation.state !== 'idle' && (
        <div className="pointer-events-none fixed left-0 right-0 top-0 z-[70] h-1 overflow-hidden bg-transparent">
          <div className="h-full w-full origin-left animate-[dwira-admin-progress_1.15s_ease-in-out_infinite] bg-gradient-to-r from-emerald-400 via-emerald-600 to-emerald-400" />
        </div>
      )}
      <div className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between bg-emerald-950 px-4 text-white shadow-lg shadow-emerald-950/10 lg:hidden">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Dwira" className="h-6 w-auto" />
          <h1 className="font-bold">Dwira Admin</h1>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-800 bg-emerald-900/70 transition-colors hover:border-emerald-300 hover:bg-emerald-800"
          aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div className="fixed left-0 right-0 top-16 z-30 border-b border-emerald-100 bg-white/95 backdrop-blur lg:hidden">
        <div className="dwira-admin-mobile-tabs flex gap-2 overflow-x-auto px-4 py-3">
          {navItems.map((item) => (
            <button
              key={`mobile-admin-tab-${item.path}`}
              type="button"
              onClick={() => navigate(item.path)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                isActive(item.path)
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <item.icon size={14} />
              <span className="whitespace-nowrap">{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-[55] bg-slate-950/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {sidebarOpen && (
        <div className="fixed inset-y-0 left-0 z-[60] transform transition-transform duration-300 ease-in-out lg:hidden">
          <AdminSidebar
            onClose={() => setSidebarOpen(false)}
            collapsed={false}
            variant="mobile"
          />
        </div>
      )}

      <div className={`
        fixed inset-y-0 left-0 z-50 hidden
        lg:block lg:translate-x-0
      `}>
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
      </div>

      <main 
        className={`
          dwira-admin-main flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:p-6 md:p-8
          pt-32 sm:pt-24 lg:pt-6
          transition-all duration-300 ease-in-out
          lg:ml-20 ${sidebarCollapsed ? 'xl:ml-20' : 'xl:ml-64'}
        `}
      >
        <div className={`dwira-admin-page mx-auto min-w-0 ${isWideWorkspace ? 'w-full max-w-none' : 'max-w-7xl'}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
