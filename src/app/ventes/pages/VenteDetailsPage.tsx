import { Navigate, useParams } from 'react-router';
import { useProperties } from '../../context/PropertiesContext';
import PublicBienPageView from '../components/PublicBienPageView';

export default function VenteDetailsPage() {
  const { id, type } = useParams();
  const { biens, zones, isLoading } = useProperties();
  const bien = biens.find((item) => item.mode === 'vente' && item.visible_sur_site !== false && item.id === id);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 border-b-2 border-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!bien) {
    return <div className="min-h-[60vh] flex items-center justify-center text-gray-600">Bien introuvable.</div>;
  }

  if (type && type !== bien.type) {
    return <Navigate to={`/ventes/${bien.type}/${bien.id}`} replace />;
  }

  return <PublicBienPageView bien={bien} zones={zones} backHref="/ventes" backLabel="Retour a la liste" />;
}
