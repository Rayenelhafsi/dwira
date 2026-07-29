import { Navigate, useParams } from "react-router";
import { useProperties } from "../context/PropertiesContext";
import { getPropertyRouteToken } from "../utils/propertyRouting";

const slugify = (value: string) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default function ImmeubleVenteDetailsPage() {
  const { slug } = useParams();
  const { biens } = useProperties();
  const bien = biens.find((item) => item.mode === "vente" && item.type === "immeuble" && item.visible_sur_site !== false && slugify(item.titre) === slug);

  if (!bien) {
    return <div className="pt-28 text-center text-gray-700">Immeuble introuvable.</div>;
  }

  return <Navigate to={`/properties/${encodeURIComponent(getPropertyRouteToken(bien))}`} replace />;
}
