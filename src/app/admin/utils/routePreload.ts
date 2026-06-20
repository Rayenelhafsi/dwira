const adminRoutePreloaders: Record<string, () => Promise<unknown>> = {
  "/admin": () => import("../pages/DashboardHome"),
  "/admin/biens": () => import("../pages/BiensPage"),
  "/admin/packs": () => import("../pages/PropertyPacksAdminPage"),
  "/admin/clienteles": () => import("../pages/LocatairesPage"),
  "/admin/locataires": () => import("../pages/LocatairesPage"),
  "/admin/agences-partenaires": () => import("../pages/PartnerAgenciesPage"),
  "/admin/contrats": () => import("../pages/ContratsPage"),
  "/admin/paiements": () => import("../pages/PaiementsPage"),
  "/admin/amicales": () => import("../pages/AmicalesPage"),
  "/admin/comptabilite": () => import("../pages/ComptabilitePage"),
  "/admin/hotels": () => import("../pages/HotelsPage"),
  "/admin/reservations-hotels": () => import("../pages/HotelReservationsPage"),
  "/admin/maintenance": () => import("../pages/MaintenancePage"),
  "/admin/notifications": () => import("../pages/NotificationsPage"),
  "/admin/statistiques": () => import("../pages/StatistiquesPage"),
  "/admin/marketing": () => import("../pages/MarketingPage"),
  "/admin/utilisateurs": () => import("../pages/UtilisateursPage"),
  "/admin/audit-securite": () => import("../pages/SecurityAuditPage"),
  "/admin/parametres": () => import("../pages/ParametresPage"),
};

const preloadedAdminRoutes = new Set<string>();

export function preloadAdminRoute(path: string) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath || preloadedAdminRoutes.has(normalizedPath)) return;
  const preloader = adminRoutePreloaders[normalizedPath];
  if (!preloader) return;
  preloadedAdminRoutes.add(normalizedPath);
  void preloader().catch(() => {
    preloadedAdminRoutes.delete(normalizedPath);
  });
}

export function preloadImportantAdminRoutes() {
  [
    "/admin",
    "/admin/biens",
    "/admin/packs",
    "/admin/clienteles",
    "/admin/notifications",
    "/admin/contrats",
    "/admin/paiements",
    "/admin/comptabilite",
  ].forEach(preloadAdminRoute);
}
