import { createBrowserRouter } from "react-router";
import { Layout } from "./Layout";
import HomePage from "./pages/HomePage";
import { VentesLayout } from "./ventes/VentesLayout";
import { AdminLayout } from "./admin/AdminLayout";
import { PUBLIC_COMING_SOON } from "./config/publicAvailability";

const lazyPage = (loader: () => Promise<{ default: React.ComponentType<any> }>) => async () => {
  const module = await loader();
  return { Component: module.default };
};

const ventesRoutes = PUBLIC_COMING_SOON.ventes
  ? [
      { path: "vente/immeuble/:slug", lazy: lazyPage(() => import("./pages/VentesComingSoonPage")) },
      { path: "vente/lotissement/:slug", lazy: lazyPage(() => import("./pages/VentesComingSoonPage")) },
      { path: "ventes/*", lazy: lazyPage(() => import("./pages/VentesComingSoonPage")) },
    ]
  : [
      { path: "vente/immeuble/:slug", lazy: lazyPage(() => import("./pages/ImmeubleVenteDetailsPage")) },
      { path: "vente/lotissement/:slug", lazy: lazyPage(() => import("./pages/LotissementVenteDetailsPage")) },
      {
        path: "ventes",
        Component: VentesLayout,
        children: [
          { index: true, lazy: lazyPage(() => import("./ventes/pages/VentesListPage")) },
          { path: ":type/:id", lazy: lazyPage(() => import("./ventes/pages/VenteDetailsRouter")) },
        ],
      },
    ];

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: "logements", lazy: lazyPage(() => import("./pages/PropertiesPage")) },
      { path: "properties/:slug", lazy: lazyPage(() => import("./pages/PropertyDetailsPage")) },
      { path: "reservation/confirmation/:slug", lazy: lazyPage(() => import("./pages/ReservationConfirmationPage")) },
      { path: "mes-reservations", lazy: lazyPage(() => import("./pages/MyReservationsPage")) },
      { path: "mes-reservations/:id/coordonnees", lazy: lazyPage(() => import("./pages/ContractIdentityPage")) },
      { path: "mes-reservations/:id/paiement", lazy: lazyPage(() => import("./pages/ReservationPaymentPage")) },
      ...ventesRoutes,
      { path: "contact", lazy: lazyPage(() => import("./pages/ContactPage")) },
      { path: "deploy-mobile", lazy: lazyPage(() => import("./pages/DeployAppsPage")) },
      { path: "login", lazy: lazyPage(() => import("./pages/LoginPage")) },
      { path: "*", Component: () => <div className="p-20 text-center">Page non trouvee</div> },
    ],
  },

  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, lazy: lazyPage(() => import("./admin/pages/DashboardHome")) },
      { path: "biens", lazy: lazyPage(() => import("./admin/pages/BiensPage")) },
      { path: "clienteles", lazy: lazyPage(() => import("./admin/pages/LocatairesPage")) },
      { path: "locataires", lazy: lazyPage(() => import("./admin/pages/LocatairesPage")) },
      { path: "contrats", lazy: lazyPage(() => import("./admin/pages/ContratsPage")) },
      { path: "paiements", lazy: lazyPage(() => import("./admin/pages/PaiementsPage")) },
      { path: "maintenance", lazy: lazyPage(() => import("./admin/pages/MaintenancePage")) },
      { path: "notifications", lazy: lazyPage(() => import("./admin/pages/NotificationsPage")) },
      { path: "statistiques", lazy: lazyPage(() => import("./admin/pages/StatistiquesPage")) },
      { path: "marketing", lazy: lazyPage(() => import("./admin/pages/MarketingPage")) },
      { path: "utilisateurs", lazy: lazyPage(() => import("./admin/pages/UtilisateursPage")) },
      { path: "audit-securite", lazy: lazyPage(() => import("./admin/pages/SecurityAuditPage")) },
      { path: "parametres", lazy: lazyPage(() => import("./admin/pages/ParametresPage")) },
    ],
  },
]);
