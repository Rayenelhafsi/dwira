import { useParams, Link, useNavigate } from 'react-router';
import { immeubles } from '../data/mockData';
import { ImageGallery } from '../components/ImageGallery';
import {
  Building2,
  MapPin,
  Waves,
  Maximize,
  Layers,
  Home,
  Car,
  Store,
  Bed,
  Bath,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  Droplets,
  Zap,
  Eye,
  ParkingCircle,
  Shield,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import { Button } from '../../components/ui/button';

export default function ImmeubleDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const immeuble = immeubles.find((i) => i.id === id);

  if (!immeuble) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Immeuble non trouvé</h2>
          <Button onClick={() => navigate('/ventes')}>Retour à la liste</Button>
        </div>
      </div>
    );
  }

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'disponible':
        return <Badge className="bg-emerald-600"><CheckCircle className="w-3 h-3 mr-1" />Disponible</Badge>;
      case 'vendu':
        return <Badge className="bg-gray-600"><XCircle className="w-3 h-3 mr-1" />Vendu</Badge>;
      case 'reserve':
        return <Badge className="bg-amber-600"><XCircle className="w-3 h-3 mr-1" />Réservé</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <Link
            to="/ventes"
            className="inline-flex items-center text-emerald-100 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à la liste
          </Link>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">{immeuble.titre}</h1>
              <p className="text-emerald-100">Réf: {immeuble.reference}</p>
            </div>
            <Badge
              className={`${
                immeuble.statut === 'disponible'
                  ? 'bg-white text-emerald-700'
                  : 'bg-red-600'
              } text-lg px-4 py-2`}
            >
              {immeuble.statut === 'disponible' ? 'Disponible' : 'Indisponible'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8">
        {/* Main Image Gallery */}
        <ImageGallery images={immeuble.images} title={immeuble.titre} />

        {/* Main Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Location & Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-emerald-700">
                  <Building2 className="w-5 h-5 mr-2" />
                  Informations Générales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center text-gray-700">
                  <MapPin className="w-5 h-5 mr-3 text-emerald-600" />
                  <span className="font-medium">{immeuble.localisation}</span>
                </div>

                {immeuble.description && (
                  <p className="text-gray-600">{immeuble.description}</p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                  {immeuble.distance_plage && (
                    <div className="text-center p-3 bg-emerald-50 rounded-lg">
                      <Waves className="w-6 h-6 mx-auto mb-2 text-emerald-600" />
                      <p className="text-sm text-gray-500">Distance plage</p>
                      <p className="font-bold text-gray-900">{immeuble.distance_plage}m</p>
                    </div>
                  )}
                  <div className="text-center p-3 bg-emerald-50 rounded-lg">
                    <Maximize className="w-6 h-6 mx-auto mb-2 text-emerald-600" />
                    <p className="text-sm text-gray-500">Surface terrain</p>
                    <p className="font-bold text-gray-900">{immeuble.surface_terrain} m²</p>
                  </div>
                  <div className="text-center p-3 bg-emerald-50 rounded-lg">
                    <Maximize className="w-6 h-6 mx-auto mb-2 text-emerald-600" />
                    <p className="text-sm text-gray-500">Surface bâtie</p>
                    <p className="font-bold text-gray-900">{immeuble.surface_batie} m²</p>
                  </div>
                  <div className="text-center p-3 bg-emerald-50 rounded-lg">
                    <Layers className="w-6 h-6 mx-auto mb-2 text-emerald-600" />
                    <p className="text-sm text-gray-500">Niveaux</p>
                    <p className="font-bold text-gray-900">{immeuble.nombre_niveaux}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Caractéristiques */}
            <Card>
              <CardHeader>
                <CardTitle className="text-emerald-700">Caractéristiques</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {immeuble.caracteristiques.vue_mer && (
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm">Vue mer</span>
                    </div>
                  )}
                  {immeuble.caracteristiques.proche_plage && (
                    <div className="flex items-center gap-2">
                      <Waves className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm">Proche plage</span>
                    </div>
                  )}
                  {immeuble.caracteristiques.ascenseur && (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm">Ascenseur</span>
                    </div>
                  )}
                  {immeuble.caracteristiques.parking_sous_sol && (
                    <div className="flex items-center gap-2">
                      <ParkingCircle className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm">Parking sous-sol</span>
                    </div>
                  )}
                  {immeuble.caracteristiques.parking_exterieur && (
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm">Parking extérieur</span>
                    </div>
                  )}
                  {immeuble.caracteristiques.syndic && (
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm">Syndic</span>
                    </div>
                  )}
                </div>

                <Separator className="my-4" />

                <h4 className="font-semibold mb-3 text-gray-900">Caractéristiques Générales</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {immeuble.caracteristiques_generales.eau_puits && (
                    <div className="flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-blue-600" />
                      <span className="text-sm">Eau puits</span>
                    </div>
                  )}
                  {immeuble.caracteristiques_generales.eau_sonede && (
                    <div className="flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-blue-600" />
                      <span className="text-sm">Eau SONEDE</span>
                    </div>
                  )}
                  {immeuble.caracteristiques_generales.electricite_steg && (
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm">Électricité STEG</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Appartements */}
            {immeuble.appartements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-emerald-700">
                    <Home className="w-5 h-5 mr-2" />
                    Appartements ({immeuble.appartements.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {immeuble.appartements.map((appartement) => (
                      <div
                        key={appartement.id}
                        className="border-2 border-gray-200 rounded-lg p-4 hover:border-emerald-300 transition-colors"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                          <div>
                            <h4 className="font-bold text-lg text-gray-900 mb-1">
                              Appartement {appartement.configuration}
                            </h4>
                            <p className="text-sm text-gray-500">Réf: {appartement.reference}</p>
                          </div>
                          {getStatutBadge(appartement.statut)}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div className="flex items-center gap-2">
                            <Bed className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">{appartement.nombre_chambres} chambres</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Bath className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">{appartement.nombre_salles_bain} SDB</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Maximize className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">{appartement.surface} m²</span>
                          </div>
                          {appartement.etage && (
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-gray-500" />
                              <span className="text-sm">Étage {appartement.etage}</span>
                            </div>
                          )}
                        </div>

                        {appartement.prix && (
                          <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-lg">
                            <span className="text-sm text-gray-600">Prix:</span>
                            <span className="text-lg font-bold text-emerald-700">
                              {appartement.prix.toLocaleString('fr-FR')} DT
                            </span>
                          </div>
                        )}

                        {appartement.images.length > 0 && (
                          <div className="mt-4">
                            <ImageGallery
                              images={appartement.images}
                              title={`Appartement ${appartement.configuration}`}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Garages */}
            {immeuble.garages.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-emerald-700">
                    <Car className="w-5 h-5 mr-2" />
                    Garages ({immeuble.garages.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {immeuble.garages.map((garage) => (
                      <div
                        key={garage.id}
                        className="border-2 border-gray-200 rounded-lg p-4 hover:border-emerald-300 transition-colors"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-3">
                          <div>
                            <h4 className="font-bold text-gray-900">Garage</h4>
                            <p className="text-sm text-gray-500">Réf: {garage.reference}</p>
                          </div>
                          {getStatutBadge(garage.statut)}
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <p className="text-sm text-gray-500">Surface</p>
                            <p className="font-semibold">{garage.surface} m²</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Type</p>
                            <p className="font-semibold capitalize">{garage.type}</p>
                          </div>
                        </div>

                        {garage.prix && (
                          <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-lg">
                            <span className="text-sm text-gray-600">Prix:</span>
                            <span className="text-lg font-bold text-emerald-700">
                              {garage.prix.toLocaleString('fr-FR')} DT
                            </span>
                          </div>
                        )}

                        {garage.images.length > 0 && (
                          <div className="mt-4">
                            <ImageGallery images={garage.images} title="Garage" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Locaux Commerciaux */}
            {immeuble.locaux_commerciaux.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-emerald-700">
                    <Store className="w-5 h-5 mr-2" />
                    Locaux Commerciaux ({immeuble.locaux_commerciaux.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {immeuble.locaux_commerciaux.map((local) => (
                      <div
                        key={local.id}
                        className="border-2 border-gray-200 rounded-lg p-4 hover:border-emerald-300 transition-colors"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-3">
                          <div>
                            <h4 className="font-bold text-gray-900">Local Commercial</h4>
                            <p className="text-sm text-gray-500">Réf: {local.reference}</p>
                          </div>
                          {getStatutBadge(local.statut)}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                          <div>
                            <p className="text-sm text-gray-500">Surface</p>
                            <p className="font-semibold">{local.surface} m²</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Façade</p>
                            <p className="font-semibold">{local.facade} m</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Hauteur plafond</p>
                            <p className="font-semibold">{local.hauteur_plafond} m</p>
                          </div>
                        </div>

                        {local.activite_recommandee && (
                          <div className="mb-3">
                            <p className="text-sm text-gray-500">Activité recommandée</p>
                            <p className="font-semibold">{local.activite_recommandee}</p>
                          </div>
                        )}

                        {local.prix && (
                          <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-lg">
                            <span className="text-sm text-gray-600">Prix:</span>
                            <span className="text-lg font-bold text-emerald-700">
                              {local.prix.toLocaleString('fr-FR')} DT
                            </span>
                          </div>
                        )}

                        {local.images.length > 0 && (
                          <div className="mt-4">
                            <ImageGallery images={local.images} title="Local Commercial" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Price & Contact */}
          <div className="space-y-6">
            {/* Tarification */}
            <Card className="sticky top-4 border-2 border-emerald-200">
              <CardHeader className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
                <CardTitle>Tarification</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Prix affiché</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {immeuble.tarification.prix_affiche.toLocaleString('fr-FR')} DT
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">Commission incluse</p>
                  <p className="text-lg font-semibold text-gray-700">
                    {immeuble.tarification.commission.toLocaleString('fr-FR')} DT
                  </p>
                </div>

                <Separator />

                <div className="bg-emerald-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Prix final</p>
                  <p className="text-3xl font-bold text-emerald-700">
                    {immeuble.tarification.prix_final.toLocaleString('fr-FR')} DT
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Paiement */}
            <Card className="border-2 border-amber-200">
              <CardHeader className="bg-gradient-to-r from-amber-500 to-amber-600 text-white">
                <CardTitle>Modalités de Paiement</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-2">Mode de paiement</p>
                  <Badge className="bg-amber-600 text-white">
                    {immeuble.paiement.mode === 'comptant' ? 'Comptant' : 'Facilité de paiement'}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Montant total</span>
                    <span className="font-semibold">
                      {immeuble.paiement.montant_total.toLocaleString('fr-FR')} DT
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Promesse</span>
                    <span className="font-semibold text-emerald-700">
                      {immeuble.paiement.promesse.toLocaleString('fr-FR')} DT
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Reste</span>
                    <span className="font-semibold">
                      {immeuble.paiement.reste.toLocaleString('fr-FR')} DT
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CTA Buttons */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12">
                  <Phone className="w-4 h-4 mr-2" />
                  Contacter l'agence
                </Button>
                <Button variant="outline" className="w-full border-emerald-600 text-emerald-700 hover:bg-emerald-50 h-12">
                  <Calendar className="w-4 h-4 mr-2" />
                  Demander une visite
                </Button>
                <Button variant="outline" className="w-full border-amber-600 text-amber-700 hover:bg-amber-50 h-12">
                  <Mail className="w-4 h-4 mr-2" />
                  Réserver
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
