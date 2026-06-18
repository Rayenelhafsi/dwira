import { Outlet, useLocation } from "react-router";
import { Suspense, lazy, useEffect, useState } from "react";
import { Header, Footer } from "./components/HeaderFooter";
import { ScrollToTop } from "./components/ScrollToTop";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { SiteMaintenancePage } from "./components/SiteMaintenancePage";
import { getSiteMaintenanceStatus, readCachedSiteMaintenanceStatus, type SiteMaintenanceStatus } from "./services/siteMaintenance";
import { useAuth } from "./context/AuthContext";
import { MAINTENANCE_ACCESS_PATH } from "./config/maintenance";

const LazyPartnersLogoMarquee = lazy(() =>
  import("./components/PartnersLogoMarquee").then((module) => ({ default: module.PartnersLogoMarquee }))
);

export function Layout() {
  const location = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [maintenance, setMaintenance] = useState<SiteMaintenanceStatus | null>(() => readCachedSiteMaintenanceStatus());
  const [showPartnersLogoMarquee, setShowPartnersLogoMarquee] = useState(false);
  const hidePublicChrome = location.pathname.startsWith("/partner-agency/dashboard");

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
        // no blocking loader for public pages
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

  useEffect(() => {
    let scrollIdleTimer = 0;

    const markScrolling = () => {
      document.body.classList.add("dwira-scroll-active");
      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        document.body.classList.remove("dwira-scroll-active");
      }, 140);
    };

    window.addEventListener("scroll", markScrolling, { passive: true });

    return () => {
      window.removeEventListener("scroll", markScrolling);
      window.clearTimeout(scrollIdleTimer);
      document.body.classList.remove("dwira-scroll-active");
    };
  }, []);

  useEffect(() => {
    if (showPartnersLogoMarquee) return;

    const reveal = () => setShowPartnersLogoMarquee(true);
    const idleId = window.requestIdleCallback?.(reveal, { timeout: 2600 });
    const timeoutId = window.setTimeout(reveal, 3200);
    window.addEventListener("scroll", reveal, { once: true, passive: true });

    return () => {
      if (typeof idleId === "number") {
        window.cancelIdleCallback?.(idleId);
      }
      window.clearTimeout(timeoutId);
      window.removeEventListener("scroll", reveal);
    };
  }, [showPartnersLogoMarquee]);

  const isMaintenanceBypassPath = location.pathname === MAINTENANCE_ACCESS_PATH;
  const canBypassMaintenance = user?.role === "admin" || isMaintenanceBypassPath;

  if (maintenance?.isActive && authLoading && !canBypassMaintenance) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-gray-500">Chargement...</div>;
  }

  if (maintenance?.isActive && !canBypassMaintenance) {
    return <SiteMaintenancePage status={maintenance} />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <ScrollToTop />
      {!hidePublicChrome ? <Header /> : null}
      <main className="flex-grow">
        <Outlet />
      </main>
      {!hidePublicChrome && showPartnersLogoMarquee ? (
        <Suspense fallback={null}>
          <LazyPartnersLogoMarquee />
        </Suspense>
      ) : null}
      {!hidePublicChrome ? <Footer /> : null}
      {!hidePublicChrome ? <CookieConsentBanner /> : null}
    </div>
  );
}
