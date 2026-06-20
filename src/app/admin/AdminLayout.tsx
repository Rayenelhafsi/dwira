import { Outlet, useNavigate, useNavigation } from 'react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AdminSidebar } from './components/AdminSidebar';
import { Menu, X } from 'lucide-react';
import logo from '../../../logo dwira.jpg';
import { preloadImportantAdminRoutes } from './utils/routePreload';

export function AdminLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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


  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-emerald-600 font-medium">
      Chargement de l'administration...
    </div>
  );

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-gray-900">
      {navigation.state !== 'idle' && (
        <div className="pointer-events-none fixed left-0 right-0 top-0 z-[70] h-1 overflow-hidden bg-transparent">
          <div className="h-full w-full origin-left animate-[dwira-admin-progress_1.15s_ease-in-out_infinite] bg-gradient-to-r from-emerald-400 via-emerald-600 to-emerald-400" />
        </div>
      )}
      {/* Mobile header with hamburger */}
      <div className="fixed top-0 left-0 right-0 bg-emerald-950 text-white h-16 px-4 flex items-center justify-between lg:hidden z-50">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Dwira" className="h-6 w-auto" />
          <h1 className="font-bold">Dwira Admin</h1>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-emerald-900 rounded-lg transition-colors"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50
        lg:top-0 lg:h-screen
        transform transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0
      `}>
        <AdminSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main 
        className={`
          flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8 
          pt-20 sm:pt-24 lg:pt-6
          transition-all duration-300 ease-in-out
          lg:ml-64
        `}
      >
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
