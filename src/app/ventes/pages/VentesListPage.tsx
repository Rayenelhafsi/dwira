import { Link } from 'react-router';
import { useProperties } from '../../context/PropertiesContext';
import { Bien } from '../../admin/types';
import { Building2, MapPin, Home, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const resolveMediaUrl = (url?: string | null) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = /^https?:\/\//i.test(API_URL) ? API_URL : window.location.origin;
  const origin = new URL(base, window.location.origin).origin;
  return value.startsWith('/') ? `${origin}${value}` : value;
};

const typeLabel: Record<string, string> = {
  appartement: 'Appartement',
  villa_maison: 'Villa / Maison',
  studio: 'Studio',
  immeuble: 'Immeuble',
  terrain: 'Terrain',
  lotissement: 'Lotissement',
  local_commercial: 'Local commercial',
};

const statusLabel: Record<string, string> = {
  disponible: 'Disponible',
  reserve: 'Réservé',
  loue: 'Indisponible',
  maintenance: 'Indisponible',
  bloque: 'Indisponible',
};

function getPublicPrice(bien: Bien) {
  if (bien.type === 'terrain') {
    if (bien.terrain_mode_affichage_prix === 'm2_uniquement') {
      return {
        value: Number(bien.terrain_prix_affiche_par_m2 || 0),
        suffix: '/m²',
      };
    }
    return {
      value: Number(bien.terrain_prix_affiche_total || bien.prix_affiche_client || bien.prix_final || 0),
      suffix: '',
    };
  }

  if (bien.type === 'lotissement') {
    return {
      value: Number(bien.lotissement_prix_total || bien.prix_affiche_client || bien.prix_final || 0),
      suffix: '',
    };
  }

  return {
    value: Number(bien.prix_affiche_client || bien.prix_final || 0),
    suffix: '',
  };
}

export default function VentesListPage() {
  const { biens, zones, isLoading } = useProperties();
  const venteBiens = biens
    .filter((bien) => bien.mode === 'vente')
    .sort((a, b) => Number(b.date_ajout || 0) - Number(a.date_ajout || 0));

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 border-b-2 border-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Biens en Vente</h1>
          <p className="text-xl text-emerald-100">
            Découvrez notre sélection d'immeubles et de lotissements
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {venteBiens.length === 0 ? (
          <div className="text-center bg-white border border-gray-200 rounded-2xl p-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Aucun bien en vente</h2>
            <p className="text-gray-600">Ajoutez des biens en mode vente depuis le tableau de bord admin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {venteBiens.map((bien) => {
              const zoneName = zones.find((z) => z.id === bien.zone_id)?.nom || 'Zone non définie';
              const displayImages = (bien.media || []).filter((m) => !String(m.motif_upload || '').startsWith('preuve_type_'));
              const imageUrl = resolveMediaUrl(displayImages[0]?.url) || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1200&auto=format&fit=crop';
              const publicPrice = getPublicPrice(bien);
              return (
            <Link
              key={bien.id}
              to={`/ventes/${bien.type}/${bien.id}`}
              className="group"
            >
              <Card className="overflow-hidden hover:shadow-2xl transition-all duration-300 border-2 hover:border-emerald-500">
                {/* Image */}
                <div className="relative h-64 overflow-hidden">
                  <img
                    src={imageUrl}
                    alt={bien.titre}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 flex gap-2">
                    <Badge
                      className={`${
                        bien.statut === 'disponible'
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {bien.statut === 'disponible' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Disponible
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 mr-1" />
                          {statusLabel[bien.statut] || 'Indisponible'}
                        </>
                      )}
                    </Badge>
                    <Badge className="bg-amber-600 hover:bg-amber-700">
                      {bien.type === 'immeuble' ? <Building2 className="w-3 h-3 mr-1" /> : <Home className="w-3 h-3 mr-1" />}
                      {typeLabel[bien.type] || bien.type}
                    </Badge>
                  </div>
                </div>

                <CardContent className="p-6">
                  {/* Title */}
                  <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-emerald-600 transition-colors">
                    {bien.titre}
                  </h3>

                  {/* Reference */}
                  <p className="text-sm text-gray-500 mb-3">Réf: {bien.reference}</p>

                  {/* Location */}
                  <div className="flex items-center text-gray-600 mb-4">
                    <MapPin className="w-4 h-4 mr-2 text-emerald-600" />
                    <span className="text-sm">{zoneName}</span>
                  </div>

                  {/* Details */}
                  <div className="border-t pt-4">
                    {bien.type === 'immeuble' ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Niveaux</p>
                          <p className="font-semibold">{bien.immeuble_nb_niveaux || 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Surface bâtie</p>
                          <p className="font-semibold">{bien.immeuble_surface_batie_m2 || 0} m²</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Appartements</p>
                          <p className="font-semibold">{bien.immeuble_nb_appartements || 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Locaux</p>
                          <p className="font-semibold">{bien.immeuble_nb_locaux_commerciaux || 0}</p>
                        </div>
                      </div>
                    ) : bien.type === 'lotissement' ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Terrains</p>
                          <p className="font-semibold">{bien.lotissement_nb_terrains || 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Prix au m²</p>
                          <p className="font-semibold">{bien.lotissement_prix_m2_unique || '-'} DT</p>
                        </div>
                      </div>
                    ) : bien.type === 'terrain' ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Surface</p>
                          <p className="font-semibold">{bien.terrain_surface_m2 || 0} m²</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Façade</p>
                          <p className="font-semibold">{bien.terrain_facade_m || 0} m</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Chambres</p>
                          <p className="font-semibold">{bien.nb_chambres || 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">SDB</p>
                          <p className="font-semibold">{bien.nb_salle_bain || 0}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Prix final</p>
                        <p className="text-2xl font-bold text-emerald-600">
                          {publicPrice.value.toLocaleString('fr-FR')} DT{publicPrice.suffix}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
