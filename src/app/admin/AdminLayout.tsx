import { Outlet, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AdminSidebar } from './components/AdminSidebar';
import { Menu, X } from 'lucide-react';

export function AdminLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate('/login');
      } else if (user.role !== 'admin') {
        navigate('/');
      }
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-emerald-600 font-medium">
      Chargement de l'administration...
    </div>
  );

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Mobile header with hamburger */}
      <div className="fixed top-0 left-0 right-0 bg-emerald-950 text-white p-4 flex items-center justify-between lg:hidden z-50">
        <div className="flex items-center gap-2">
          <img src="../../assets/c9952e139aedea0af19c1652a89e92cb4378f1ac.png" alt="Dwira" className="h-6 w-auto brightness-0 invert" />
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
        fixed lg:static inset-y-0 left-0 z-50
        transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0 transition-transform duration-300 ease-in-out
      `}>
        <AdminSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8 lg:ml-64 pt-20 lg:pt-6">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}