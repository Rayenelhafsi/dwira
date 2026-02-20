import { Outlet, useNavigate } from 'react-router';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { AdminSidebar } from './components/AdminSidebar';
import { Menu, X } from 'lucide-react';
import logo from '../../assets/c9952e139aedea0af19c1652a89e92cb4378f1ac.png';

export function AdminLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate('/login');
      } else if (user.role !== 'admin') {
        navigate('/');
      }
    }
  }, [user, isLoading, navigate]);

  // Handle navbar visibility on scroll for mobile
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop;
      
      // If scrolling down
      if (currentScrollTop > lastScrollTopRef.current) {
        // Hide navbar after a delay
        if (!scrollTimeoutRef.current) {
          scrollTimeoutRef.current = setTimeout(() => {
            setIsNavbarVisible(false);
          }, 1500); // 1.5 seconds delay before hiding
        }
      } else {
        // If scrolling up - show navbar immediately
        setIsNavbarVisible(true);
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = null;
        }
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Check if screen is in split view (less than half screen width on desktop)
  const [isSplitView, setIsSplitView] = useState(false);

  useEffect(() => {
    const checkSplitView = () => {
      // Consider split view when window width is less than 60% of a standard large screen
      // or when screen width is between 768px and 1200px
      const width = window.innerWidth;
      setIsSplitView(width >= 768 && width <= 1280);
    };

    checkSplitView();
    window.addEventListener('resize', checkSplitView);
    return () => window.removeEventListener('resize', checkSplitView);
  }, []);

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-emerald-600 font-medium">
      Chargement de l'administration...
    </div>
  );

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Mobile header with hamburger - hides on scroll */}
      <div 
        className={`
          fixed top-0 left-0 right-0 bg-emerald-950 text-white p-4 flex items-center justify-between lg:hidden z-50
          transition-transform duration-300 ease-in-out
          ${isNavbarVisible ? 'translate-y-0' : '-translate-y-full'}
        `}
      >
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

      {/* Desktop toggle button - visible on split view or smaller desktop screens */}
      {isSplitView && (
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="fixed top-1/2 -translate-y-1/2 z-50 p-2 bg-emerald-600 text-white rounded-r-lg shadow-lg hover:bg-emerald-700 transition-all duration-300"
          style={{ left: sidebarCollapsed ? 0 : 256 }}
          title={sidebarCollapsed ? 'Afficher le menu' : 'Masquer le menu'}
        >
          {sidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
      )}

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
        transform transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        ${!sidebarOpen && !sidebarCollapsed ? 'lg:translate-x-0' : ''}
        ${sidebarCollapsed ? 'lg:-translate-x-full' : ''}
        ${isSplitView ? 'lg:w-64' : ''}
      `}>
        <AdminSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main 
        className={`
          flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8 
          pt-20 lg:pt-6
          transition-all duration-300 ease-in-out
          ${isSplitView ? (sidebarCollapsed ? 'lg:ml-0' : 'lg:ml-64') : 'lg:ml-64'}
        `}
      >
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
