import { useParams, Link, useNavigate } from 'react-router';
import { lotissements } from '../data/mockData';
import { ImageGallery } from '../components/ImageGallery';
import {
  Home,
  MapPin,
  Waves,
  Maximize,
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  Droplets,
  Zap,
  CheckCircle,
  XCircle,
  Map,
  Ruler,
  Landmark,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import { Button } from '../../components/ui/button';

export default function LotissementDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const lotissement = lotissements.find((l) => l.id === id);

  if (!lotissement) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Lotissement non trouvé</h2>
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

  const getTerrainTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      agricole: 'Agricole',
      habitation: 'Habitation',
      industriel: 'Industriel',
      loisir: 'Loisir',
    };
    return types[type] || type;
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
              <h1 className="text-3xl md:text-4xl font-bold mb-2">{lotissement.titre}</h1>
              <p className="text-emerald-100">Réf: {lotissement.reference}</p>
            </div>
            <Badge
              className={`${
                lotissement.statut === 'disponible'
                  ? 'bg-white text-emerald-700'
                  : 'bg-red-600'
              } text-lg px-4 py-2`}
            >
              {lotissement.statut === 'disponible' ? 'Disponible' : 'Indisponible'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8">
        {/* Main Image Gallery */}
        <ImageGallery images={lotissement.images} title={lotissement.titre} />

        {/* Main Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Location & Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-emerald-700">
                  <Home className="w-5 h-5 mr-2" />
                  Informations Générales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center text-gray-700">
                  <MapPin className="w-5 h-5 mr-3 text-emerald-600" />
                  <span className="font-medium">{lotissement.localisation}</span>
                </div>

                {lotissement.description && (
                  <p className="text-gray-600">{lotissement.description}</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <div className="text-center p-4 bg-emerald-50 rounded-lg">
                    <Map className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
                    <p className="text-sm text-gray-500">Nombre de terrains</p>
                    <p className="text-2xl font-bold text-gray-900">{lotissement.nombre_total_terrains}</p>
                  </div>
                  {lotissement.tarification.prix_au_m2 && (
                    <div className="text-center p-4 bg-amber-50 rounded-lg">
                      <Ruler className="w-8 h-8 mx-auto mb-2 text-amber-600" />
                      <p className="text-sm text-gray-500">Prix au m²</p>
                      <p className="text-2xl font-bold text-amber-700">
                        {lotissement.tarification.prix_au_m2} DT
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Caractéristiques Générales */}
            <Card>
              <CardHeader>
                <CardTitle className="text-emerald-700">Caractéristiques Générales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {lotissement.caracteristiques_generales.eau_puits && (
                    <div className="flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-blue-600" />
                      <span className="text-sm">Eau puits</span>
                    </div>
                  )}
                  {lotissement.caracteristiques_generales.eau_sonede && (
                    <div className="flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-blue-600" />
                      <span className="text-sm">Eau SONEDE</span>
                    </div>
                  )}
                  {lotissement.caracteristiques_generales.electricite_steg && (
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm">Électricité STEG</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Terrains */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-emerald-700">
                  <Landmark className="w-5 h-5 mr-2" />
                  Terrains ({lotissement.terrains.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {lotissement.terrains.map((terrain) => (
                    <div
                      key={terrain.id}
                      className="border-2 border-gray-200 rounded-lg p-4 hover:border-emerald-300 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                        <div>
                          <h4 className="font-bold text-lg text-gray-900 mb-1">
                            Terrain {terrain.reference.split('-').pop()}
                          </h4>
                          <p className="text-sm text-gray-500">Réf: {terrain.reference}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 md:mt-0">
                          {getStatutBadge(terrain.statut)}
                          <Badge variant="outline" className="border-emerald-500 text-emerald-700">
                            {getTerrainTypeLabel(terrain.type_terrain)}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div>
                          <p className="text-sm text-gray-500">Façade</p>
                          <p className="font-semibold">{terrain.facade} m</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Surface</p>
                          <p className="font-semibold">{terrain.surface} m²</p>
                        </div>
                        {terrain.zone && (
                          <div>
                            <p className="text-sm text-gray-500">Zone</p>
                            <p className="font-semibold">{terrain.zone}</p>
                          </div>
                        )}
                        {terrain.distance_plage && (
                          <div>
                            <p className="text-sm text-gray-500">Distance plage</p>
                            <p className="font-semibold">{terrain.distance_plage} m</p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 mb-4">
                        {terrain.constructible && (
                          <Badge variant="outline" className="border-green-500 text-green-700">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Constructible
                          </Badge>
                        )}
                        {terrain.terrain_angle && (
                          <Badge variant="outline" className="border-blue-500 text-blue-700">
                            Terrain d'angle
                          </Badge>
                        )}
                      </div>

                      {(terrain.prix || terrain.prix_au_m2) && (
                        <div className="bg-emerald-50 p-4 rounded-lg space-y-2">
                          {terrain.prix && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Prix total:</span>
                              <span className="text-xl font-bold text-emerald-700">
                                {terrain.prix.toLocaleString('fr-FR')} DT
                              </span>
                            </div>
                          )}
                          {terrain.prix_au_m2 && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Prix au m²:</span>
                              <span className="font-semibold text-emerald-600">
                                {terrain.prix_au_m2} DT/m²
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {terrain.images.length > 0 && (
                        <div className="mt-4">
                          <ImageGallery
                            images={terrain.images}
                            title={`Terrain ${terrain.reference.split('-').pop()}`}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Price & Contact */}
          <div className="space-y-6">
            {/* Tarification */}
            <Card className="sticky top-4 border-2 border-emerald-200">
              <CardHeader className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
                <CardTitle>Tarification</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {lotissement.tarification.mode_prix && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Mode de prix</p>
                    <Badge className="bg-emerald-100 text-emerald-800">
                      {lotissement.tarification.mode_prix === 'unique'
                        ? 'Prix unique'
                        : 'Prix par paliers selon surface'}
                    </Badge>
                  </div>
                )}

                {lotissement.tarification.prix_au_m2 && (
                  <div className="bg-amber-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">Prix au m²</p>
                    <p className="text-2xl font-bold text-amber-700">
                      {lotissement.tarification.prix_au_m2} DT
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-500 mb-1">Prix affiché total</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {lotissement.tarification.prix_affiche.toLocaleString('fr-FR')} DT
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">Commission incluse</p>
                  <p className="text-lg font-semibold text-gray-700">
                    {lotissement.tarification.commission.toLocaleString('fr-FR')} DT
                  </p>
                </div>

                <Separator />

                <div className="bg-emerald-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Prix final</p>
                  <p className="text-3xl font-bold text-emerald-700">
                    {lotissement.tarification.prix_final.toLocaleString('fr-FR')} DT
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
                    {lotissement.paiement.mode === 'comptant' ? 'Comptant' : 'Facilité de paiement'}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Montant total</span>
                    <span className="font-semibold">
                      {lotissement.paiement.montant_total.toLocaleString('fr-FR')} DT
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Promesse</span>
                    <span className="font-semibold text-emerald-700">
                      {lotissement.paiement.promesse.toLocaleString('fr-FR')} DT
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Reste</span>
                    <span className="font-semibold">
                      {lotissement.paiement.reste.toLocaleString('fr-FR')} DT
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
