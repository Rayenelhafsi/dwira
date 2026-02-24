import { Navigate, useParams } from "react-router";
import VenteDetailsPage from "./VenteDetailsPage";

export default function VenteDetailsRouter() {
  const { type } = useParams();

  if (!type) return <Navigate to="/ventes" replace />;

  return <VenteDetailsPage />;
}
