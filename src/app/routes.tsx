import { createBrowserRouter } from "react-router";
import { Layout } from "./Layout";
import HomePage from "./pages/HomePage";
import PropertiesPage from "./pages/PropertiesPage";
import PropertyDetailsPage from "./pages/PropertyDetailsPage";
import ContactPage from "./pages/ContactPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: "logements", Component: PropertiesPage },
      { path: "properties/:slug", Component: PropertyDetailsPage },
      { path: "contact", Component: ContactPage },
      { path: "*", Component: () => <div className="p-20 text-center">Page non trouvée</div> },
    ],
  },
]);
