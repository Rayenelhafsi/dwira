import { createBrowserRouter } from "react-router";
import { Layout } from "./Layout";
import HomePage from "./pages/HomePage";
import PropertiesPage from "./pages/PropertiesPage";
import PropertyDetailsPage from "./pages/PropertyDetailsPage";
import ContactPage from "./pages/ContactPage";
import LoginPage from "./pages/LoginPage";
import { AdminLayout } from "./admin/AdminLayout";
import DashboardHome from "./admin/pages/DashboardHome";
import BiensPage from "./admin/pages/BiensPage";
import LocatairesPage from "./admin/pages/LocatairesPage";
import ContratsPage from "./admin/pages/ContratsPage";
import PaiementsPage from "./admin/pages/PaiementsPage";
import MaintenancePage from "./admin/pages/MaintenancePage";
import StatistiquesPage from "./admin/pages/StatistiquesPage";
import MarketingPage from "./admin/pages/MarketingPage";
import UtilisateursPage from "./admin/pages/UtilisateursPage";
import ParametresPage from "./admin/pages/ParametresPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: "logements", Component: PropertiesPage },
      { path: "properties/:slug", Component: PropertyDetailsPage },
      { path: "contact", Component: ContactPage },
      { path: "login", Component: LoginPage },
      { path: "*", Component: () => <div className="p-20 text-center">Page non trouvée</div> },
    ],
  },
    
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: DashboardHome },
      { path: "biens", Component: BiensPage },
      { path: "locataires", Component: LocatairesPage },
      { path: "contrats", Component: ContratsPage },
      { path: "paiements", Component: PaiementsPage },
      { path: "maintenance", Component: MaintenancePage },
      { path: "statistiques", Component: StatistiquesPage },
      { path: "marketing", Component: MarketingPage },
      { path: "utilisateurs", Component: UtilisateursPage },
      { path: "parametres", Component: ParametresPage },
    ],
  },
]);
