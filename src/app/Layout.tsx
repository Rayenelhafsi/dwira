import { Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { Header, Footer } from "./components/HeaderFooter";
import { ScrollToTop } from "./components/ScrollToTop";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { SiteMaintenancePage } from "./components/SiteMaintenancePage";
import { getSiteMaintenanceStatus, type SiteMaintenanceStatus } from "./services/siteMaintenance";
import { useAuth } from "./context/AuthContext";
import { MAINTENANCE_ACCESS_PATH } from "./config/maintenance";

export function Layout() {
  const location = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [maintenance, setMaintenance] = useState<SiteMaintenanceStatus | null>(null);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getSiteMaintenanceStatus();
        if (cancelled) return;
        setMaintenance(next);
      } catch {
        if (!cancelled) {
          setMaintenance(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMaintenance(false);
        }
      }
    };

    void load();
    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!maintenance?.isActive || !maintenance.resumeAt) return;
    const target = new Date(maintenance.resumeAt).getTime();
    if (!Number.isFinite(target)) return;
    const timeoutMs = Math.max(1000, target - Date.now() + 1000);
    const timeoutId = window.setTimeout(() => {
      void getSiteMaintenanceStatus()
        .then((next) => setMaintenance(next))
        .catch(() => {});
    }, timeoutMs);
    return () => window.clearTimeout(timeoutId);
  }, [maintenance?.isActive, maintenance?.resumeAt]);

  if (isLoadingMaintenance || authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-gray-500">Chargement...</div>;
  }

  const isMaintenanceBypassPath = location.pathname === MAINTENANCE_ACCESS_PATH;
  const canBypassMaintenance = user?.role === "admin" || isMaintenanceBypassPath;

  if (maintenance?.isActive && !canBypassMaintenance) {
    return <SiteMaintenancePage status={maintenance} />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <ScrollToTop />
      <Header />
      <main className="flex-grow">
        <Outlet />
      </main>
      <Footer />
      <CookieConsentBanner />
    </div>
  );
}
