import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";

const DashboardHomePage = lazy(() => import("../pages/DashboardHome"));
const BiensPage = lazy(() => import("../pages/BiensPage"));
const PropertyPacksAdminPage = lazy(() => import("../pages/PropertyPacksAdminPage"));
const ClientelesPage = lazy(() => import("../pages/LocatairesPage"));
const ContratsPage = lazy(() => import("../pages/ContratsPage"));
const PaiementsPage = lazy(() => import("../pages/PaiementsPage"));
const ComptabilitePage = lazy(() => import("../pages/ComptabilitePage"));
const NotificationsPage = lazy(() => import("../pages/NotificationsPage"));

const KEEP_ALIVE_ROUTES = [
  { path: "/admin", component: DashboardHomePage },
  { path: "/admin/biens", component: BiensPage },
  { path: "/admin/packs", component: PropertyPacksAdminPage },
  { path: "/admin/clienteles", component: ClientelesPage },
  { path: "/admin/locataires", component: ClientelesPage },
  { path: "/admin/contrats", component: ContratsPage },
  { path: "/admin/paiements", component: PaiementsPage },
  { path: "/admin/comptabilite", component: ComptabilitePage },
  { path: "/admin/notifications", component: NotificationsPage },
] as const;

export function getKeepAliveAdminPath(pathname: string) {
  const normalizedPath = String(pathname || "").replace(/\/+$/, "") || "/admin";
  const matched = KEEP_ALIVE_ROUTES.find((route) => route.path === normalizedPath);
  return matched?.path || null;
}

export function AdminKeepAliveViewport() {
  const location = useLocation();
  const activePath = getKeepAliveAdminPath(location.pathname);
  const [mountedPaths, setMountedPaths] = useState<string[]>(() => (activePath ? [activePath] : []));

  useEffect(() => {
    if (!activePath) return;
    setMountedPaths((prev) => (prev.includes(activePath) ? prev : [...prev, activePath]));
  }, [activePath]);

  const mountedRoutes = useMemo(
    () => KEEP_ALIVE_ROUTES.filter((route) => mountedPaths.includes(route.path)),
    [mountedPaths]
  );

  return (
    <div className="min-h-[50vh]">
      {mountedRoutes.map((route) => {
        const PageComponent = route.component;
        const isActive = route.path === activePath;
        return (
          <section key={route.path} className={isActive ? "block" : "hidden"} aria-hidden={!isActive}>
            <Suspense
              fallback={
                <div className="flex h-64 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
                </div>
              }
            >
              <PageComponent />
            </Suspense>
          </section>
        );
      })}
    </div>
  );
}
