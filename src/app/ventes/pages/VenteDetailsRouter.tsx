import { Navigate, useParams } from "react-router";
import ImmeubleDetailsPage from "./ImmeubleDetailsPage";
import LotissementDetailsPage from "./LotissementDetailsPage";

export default function VenteDetailsRouter() {
  const { type } = useParams();

  if (type === "immeuble") return <ImmeubleDetailsPage />;
  if (type === "lotissement") return <LotissementDetailsPage />;

  return <Navigate to="/ventes" replace />;
}