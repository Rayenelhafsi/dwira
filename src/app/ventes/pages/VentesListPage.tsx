import { Link } from 'react-router';
import { allBiens } from '../data/mockData';
import { Building2, MapPin, Home, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';

export default function VentesListPage() {
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allBiens.map((bien) => (
            <Link
              key={bien.id}
              to={`/ventes/${bien.type}/${bien.id}`}
              className="group"
            >
              <Card className="overflow-hidden hover:shadow-2xl transition-all duration-300 border-2 hover:border-emerald-500">
                {/* Image */}
                <div className="relative h-64 overflow-hidden">
                  <img
                    src={bien.images[0].url}
                    alt={bien.images[0].alt}
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
                          {bien.statut === 'vendu' ? 'Vendu' : 'Indisponible'}
                        </>
                      )}
                    </Badge>
                    <Badge className="bg-amber-600 hover:bg-amber-700">
                      {bien.type === 'immeuble' ? (
                        <>
                          <Building2 className="w-3 h-3 mr-1" />
                          Immeuble
                        </>
                      ) : (
                        <>
                          <Home className="w-3 h-3 mr-1" />
                          Lotissement
                        </>
                      )}
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
                    <span className="text-sm">{bien.localisation}</span>
                  </div>

                  {/* Details */}
                  <div className="border-t pt-4">
                    {bien.type === 'immeuble' ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Niveaux</p>
                          <p className="font-semibold">{bien.nombre_niveaux}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Surface bâtie</p>
                          <p className="font-semibold">{bien.surface_batie} m²</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Appartements</p>
                          <p className="font-semibold">{bien.appartements.length}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Locaux</p>
                          <p className="font-semibold">{bien.locaux_commerciaux.length}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Terrains</p>
                          <p className="font-semibold">{bien.nombre_total_terrains}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Prix au m²</p>
                          <p className="font-semibold">{bien.tarification.prix_au_m2} DT</p>
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
                          {bien.tarification.prix_final.toLocaleString('fr-FR')} DT
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="border-amber-500 text-amber-700">
                          {bien.paiement.mode === 'comptant' ? 'Comptant' : 'Facilité'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
