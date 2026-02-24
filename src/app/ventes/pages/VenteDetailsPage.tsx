import { Link, Navigate, useParams } from 'react-router';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { useProperties } from '../../context/PropertiesContext';
import { Bien } from '../../admin/types';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ImageGallery } from '../components/ImageGallery';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TYPE_LABELS: Record<string, string> = {
  appartement: 'Appartement',
  villa_maison: 'Villa / Maison',
  studio: 'Studio',
  immeuble: 'Immeuble',
  terrain: 'Terrain',
  lotissement: 'Lotissement',
  local_commercial: 'Local commercial',
};

const STATUS_LABELS: Record<string, string> = {
  disponible: 'Disponible',
  reserve: 'Réservé',
  loue: 'Indisponible',
  maintenance: 'Indisponible',
  bloque: 'Indisponible',
};

const FEATURE_LABELS: Record<string, string> = {
  proche_plage: 'Proche plage',
  chauffage_central: 'Chauffage central',
  climatisation: 'Climatisation',
  balcon: 'Balcon',
  terrasse: 'Terrasse',
  ascenseur: 'Ascenseur',
  vue_mer: 'Vue mer',
  gaz_ville: 'Gaz de ville',
  cuisine_equipee: 'Cuisine équipée',
  place_parking: 'Place parking',
  syndic: 'Syndic',
  meuble: 'Meublé',
  independant: 'Indépendant',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau SONEDE',
  electricite_steg: 'Electricité STEG',
  toilette: 'Toilette',
  reserve_local: 'Réserve',
  vitrine: 'Vitrine',
  coin_angle: "Coin d'angle",
  electricite_3_phases: 'Electricité 3 phases',
  alarme: 'Alarme',
  terrain_constructible: 'Terrain constructible',
  terrain_angle: "Terrain d'angle",
  immeuble_proche_plage: 'Immeuble proche plage',
  immeuble_ascenseur: 'Ascenseur immeuble',
  immeuble_parking_sous_sol: 'Parking sous-sol',
  immeuble_parking_exterieur: 'Parking extérieur',
  immeuble_syndic: 'Syndic immeuble',
  immeuble_vue_mer: 'Vue mer immeuble',
};

const resolveMediaUrl = (url?: string | null) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = /^https?:\/\//i.test(API_URL) ? API_URL : window.location.origin;
  const origin = new URL(base, window.location.origin).origin;
  return value.startsWith('/') ? `${origin}${value}` : value;
};

const formatMoney = (value?: number | null) =>
  Number(value || 0).toLocaleString('fr-FR');

const toGalleryImages = (urls: string[], altPrefix: string) =>
  urls.map((url, index) => ({ url, alt: `${altPrefix} ${index + 1}` }));

function publicMainImages(bien: Bien) {
  return (bien.media || [])
    .filter((m) => !String(m.motif_upload || '').startsWith('preuve_type_') && !String(m.motif_upload || '').startsWith('gallery_unite|'))
    .map((m) => resolveMediaUrl(m.url))
    .filter(Boolean);
}

function unitImages(bien: Bien, unitKey: string) {
  return (bien.media || [])
    .filter((m) => String(m.motif_upload || '') === `gallery_unite|vente|${bien.type}|${unitKey}`)
    .map((m) => resolveMediaUrl(m.url))
    .filter(Boolean);
}

function getPublicPriceRows(bien: Bien) {
  const rows: Array<{ label: string; value: string }> = [];

  if (bien.type === 'terrain') {
    if (bien.terrain_mode_affichage_prix !== 'm2_uniquement' && bien.terrain_prix_affiche_total) {
      rows.push({ label: 'Prix total affiché', value: `${formatMoney(bien.terrain_prix_affiche_total)} DT` });
    }
    if (bien.terrain_mode_affichage_prix !== 'total_uniquement' && bien.terrain_prix_affiche_par_m2) {
      rows.push({ label: 'Prix affiché / m²', value: `${formatMoney(bien.terrain_prix_affiche_par_m2)} DT/m²` });
    }
  } else if (bien.type === 'lotissement') {
    if (bien.lotissement_prix_total) {
      rows.push({ label: 'Prix total affiché', value: `${formatMoney(bien.lotissement_prix_total)} DT` });
    }
    if (bien.lotissement_prix_m2_unique) {
      rows.push({ label: 'Prix / m²', value: `${formatMoney(bien.lotissement_prix_m2_unique)} DT/m²` });
    }
  } else {
    if (bien.prix_affiche_client) {
      rows.push({ label: 'Prix affiché client', value: `${formatMoney(bien.prix_affiche_client)} DT` });
    }
  }

  if (bien.prix_final) {
    rows.push({ label: 'Prix final', value: `${formatMoney(bien.prix_final)} DT` });
  }

  return rows;
}

function getDetailRows(bien: Bien, zoneName: string) {
  const rows: Array<{ label: string; value: string | number }> = [
    { label: 'Référence', value: bien.reference },
    { label: 'Type', value: TYPE_LABELS[bien.type] || bien.type },
    { label: 'Zone', value: zoneName },
    { label: 'Type de rue', value: bien.type_rue || '-' },
    { label: 'Type de papier', value: bien.type_papier || '-' },
    { label: 'Configuration', value: bien.configuration || '-' },
    { label: 'Etage', value: bien.etage ?? '-' },
    { label: 'Superficie', value: bien.superficie_m2 ? `${bien.superficie_m2} m²` : '-' },
    { label: 'Année construction', value: bien.annee_construction ?? '-' },
    { label: 'Distance plage', value: bien.distance_plage_m ? `${bien.distance_plage_m} m` : '-' },
    { label: 'Chambres', value: bien.nb_chambres ?? 0 },
    { label: 'Salles de bain', value: bien.nb_salle_bain ?? 0 },
    { label: 'Surface local', value: bien.surface_local_m2 ? `${bien.surface_local_m2} m²` : '-' },
    { label: 'Façade', value: bien.facade_m ? `${bien.facade_m} m` : '-' },
    { label: 'Hauteur plafond', value: bien.hauteur_plafond_m ? `${bien.hauteur_plafond_m} m` : '-' },
    { label: 'Activité recommandée', value: bien.activite_recommandee || '-' },
    { label: 'Type terrain', value: bien.type_terrain || '-' },
    { label: 'Surface terrain', value: bien.terrain_surface_m2 ? `${bien.terrain_surface_m2} m²` : '-' },
    { label: 'Façade terrain', value: bien.terrain_facade_m ? `${bien.terrain_facade_m} m` : '-' },
    { label: 'Zone terrain', value: bien.terrain_zone || '-' },
    { label: 'Distance plage terrain', value: bien.terrain_distance_plage_m ? `${bien.terrain_distance_plage_m} m` : '-' },
    { label: "Surface terrain immeuble", value: bien.immeuble_surface_terrain_m2 ? `${bien.immeuble_surface_terrain_m2} m²` : '-' },
    { label: 'Surface bâtie immeuble', value: bien.immeuble_surface_batie_m2 ? `${bien.immeuble_surface_batie_m2} m²` : '-' },
    { label: 'Nombre niveaux', value: bien.immeuble_nb_niveaux ?? '-' },
    { label: 'Nb appartements', value: bien.immeuble_nb_appartements ?? '-' },
    { label: 'Nb garages', value: bien.immeuble_nb_garages ?? '-' },
    { label: 'Nb locaux commerciaux', value: bien.immeuble_nb_locaux_commerciaux ?? '-' },
    { label: 'Distance plage immeuble', value: bien.immeuble_distance_plage_m ? `${bien.immeuble_distance_plage_m} m` : '-' },
    { label: 'Nb terrains lotissement', value: bien.lotissement_nb_terrains ?? '-' },
    { label: 'Mode prix lotissement', value: bien.lotissement_mode_prix_m2 || '-' },
  ];

  return rows.filter((row) => row.value !== '-' && row.value !== '' && row.value !== null && row.value !== undefined);
}

export default function VenteDetailsPage() {
  const { id, type } = useParams();
  const { biens, zones, isLoading } = useProperties();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 border-b-2 border-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  const bien = biens.find((item) => item.mode === 'vente' && item.id === id);
  if (!bien) {
    return <div className="min-h-[60vh] flex items-center justify-center text-gray-600">Bien introuvable.</div>;
  }

  if (type && type !== bien.type) {
    return <Navigate to={`/ventes/${bien.type}/${bien.id}`} replace />;
  }

  const zoneName = zones.find((z) => z.id === bien.zone_id)?.nom || 'Zone non définie';
  const headerImages = publicMainImages(bien);
  const featureTags = Object.entries(FEATURE_LABELS)
    .filter(([key]) => (bien as unknown as Record<string, unknown>)[key] === true)
    .map(([, label]) => label);
  const publicPriceRows = getPublicPriceRows(bien);
  const detailRows = getDetailRows(bien, zoneName);

  return (
    <div className="min-h-screen pb-12">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <Link to="/ventes" className="inline-flex items-center text-emerald-100 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à la liste
          </Link>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">{bien.titre}</h1>
              <p className="text-emerald-100">Réf: {bien.reference}</p>
            </div>
            <Badge className={bien.statut === 'disponible' ? 'bg-white text-emerald-700 text-lg px-4 py-2' : 'bg-red-600 text-lg px-4 py-2'}>
              {bien.statut === 'disponible' ? (
                <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{STATUS_LABELS[bien.statut] || 'Disponible'}</span>
              ) : (
                <span className="inline-flex items-center gap-1"><XCircle className="w-4 h-4" />{STATUS_LABELS[bien.statut] || 'Indisponible'}</span>
              )}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {headerImages.length > 0 && <ImageGallery images={toGalleryImages(headerImages, bien.titre)} title={bien.titre} />}

          <Card>
            <CardHeader>
              <CardTitle>Informations générales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600"><span className="font-semibold text-gray-900">Type:</span> {TYPE_LABELS[bien.type] || bien.type}</p>
              <p className="text-sm text-gray-600"><span className="font-semibold text-gray-900">Zone:</span> {zoneName}</p>
              {bien.description && <p className="text-sm text-gray-700 whitespace-pre-line">{bien.description}</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detailRows.map((row) => (
                  <div key={row.label} className="text-sm text-gray-700 border rounded-lg px-3 py-2">
                    <span className="font-semibold text-gray-900">{row.label}:</span> {row.value}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {featureTags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Caractéristiques</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {featureTags.map((feature) => (
                  <span key={feature} className="text-sm bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-emerald-800">
                    {feature}
                  </span>
                ))}
              </CardContent>
            </Card>
          )}

          {(bien.immeuble_appartements || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Appartements</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(bien.immeuble_appartements || []).map((row, index) => {
                  const key = `appartement_${index + 1}`;
                  const images = unitImages(bien, key);
                  return (
                    <div key={key} className="rounded-lg border p-4 space-y-2">
                      <p className="font-semibold text-gray-900">Appartement {index + 1} ({row.reference || `APT-${index + 1}`})</p>
                      <p className="text-sm text-gray-700">
                        Chambres: {row.chambres || 0} | SDB: {row.salle_bain || 0} | Surface: {row.superficie_m2 || 0} m² | Configuration: {row.configuration || '-'}
                      </p>
                      {images.length > 0 && <ImageGallery images={toGalleryImages(images, `Appartement ${index + 1}`)} title={`Appartement ${index + 1}`} />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {(bien.immeuble_garages || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Garages</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(bien.immeuble_garages || []).map((row, index) => {
                  const key = `garage_${index + 1}`;
                  const images = unitImages(bien, key);
                  return (
                    <div key={key} className="rounded-lg border p-4 space-y-2">
                      <p className="font-semibold text-gray-900">Garage {index + 1} ({row.reference || `GAR-${index + 1}`})</p>
                      {images.length > 0 && <ImageGallery images={toGalleryImages(images, `Garage ${index + 1}`)} title={`Garage ${index + 1}`} />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {(bien.immeuble_locaux_commerciaux || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Locaux commerciaux</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(bien.immeuble_locaux_commerciaux || []).map((row, index) => {
                  const key = `local_${index + 1}`;
                  const images = unitImages(bien, key);
                  return (
                    <div key={key} className="rounded-lg border p-4 space-y-2">
                      <p className="font-semibold text-gray-900">Local {index + 1} ({row.reference || `LOC-${index + 1}`})</p>
                      {images.length > 0 && <ImageGallery images={toGalleryImages(images, `Local ${index + 1}`)} title={`Local ${index + 1}`} />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {(bien.lotissement_terrains || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Terrains du lotissement</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(bien.lotissement_terrains || []).map((row, index) => {
                  const key = `terrain_${index + 1}`;
                  const images = unitImages(bien, key);
                  return (
                    <div key={key} className="rounded-lg border p-4 space-y-2">
                      <p className="font-semibold text-gray-900">Terrain {index + 1} ({row.reference || `TRN-${index + 1}`})</p>
                      <p className="text-sm text-gray-700">
                        Type: {row.type_terrain || '-'} | Surface: {row.surface_m2 || 0} m² | Rue: {row.type_rue || '-'} | Papier: {row.type_papier || '-'}
                      </p>
                      <p className="text-sm text-gray-700">
                        Zone: {row.terrain_zone || '-'} | Distance plage: {row.terrain_distance_plage_m || 0} m | Constructible: {row.terrain_constructible ? 'Oui' : 'Non'} | Terrain angle: {row.terrain_angle ? 'Oui' : 'Non'}
                      </p>
                      {images.length > 0 && <ImageGallery images={toGalleryImages(images, `Terrain ${index + 1}`)} title={`Terrain ${index + 1}`} />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-2 border-emerald-200">
            <CardHeader className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
              <CardTitle>Tarification publique</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-3">
              {publicPriceRows.length === 0 && <p className="text-sm text-gray-500">Aucun prix public défini.</p>}
              {publicPriceRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-gray-600">{row.label}</span>
                  <span className="font-semibold text-gray-900">{row.value}</span>
                </div>
              ))}
              {bien.lotissement_paliers_prix_m2 && bien.lotissement_paliers_prix_m2.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Paliers prix / m²</p>
                  <div className="space-y-2">
                    {bien.lotissement_paliers_prix_m2.map((palier, index) => (
                      <div key={`${palier.min_m2}-${index}`} className="text-sm text-gray-700">
                        {palier.min_m2} - {palier.max_m2 || 'et plus'} m²: <span className="font-semibold">{formatMoney(palier.prix_m2)} DT/m²</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 border-amber-200">
            <CardHeader className="bg-gradient-to-r from-amber-500 to-amber-600 text-white">
              <CardTitle>Modalités de paiement</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Mode</span>
                <span className="font-semibold text-gray-900">{bien.modalite_paiement_vente || '-'}</span>
              </div>
              {bien.montant_premiere_partie_promesse !== null && bien.montant_premiere_partie_promesse !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Promesse</span>
                  <span className="font-semibold text-gray-900">{formatMoney(bien.montant_premiere_partie_promesse)} DT</span>
                </div>
              )}
              {bien.montant_deuxieme_partie !== null && bien.montant_deuxieme_partie !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Deuxième partie</span>
                  <span className="font-semibold text-gray-900">{formatMoney(bien.montant_deuxieme_partie)} DT</span>
                </div>
              )}
              {bien.nombre_tranches !== null && bien.nombre_tranches !== undefined && bien.nombre_tranches > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Nombre de tranches</span>
                  <span className="font-semibold text-gray-900">{bien.nombre_tranches}</span>
                </div>
              )}
              {bien.montant_par_tranche !== null && bien.montant_par_tranche !== undefined && bien.montant_par_tranche > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Montant par tranche</span>
                  <span className="font-semibold text-gray-900">{formatMoney(bien.montant_par_tranche)} DT</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
