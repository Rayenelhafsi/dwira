import { Link } from 'react-router';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Bien, BienUiConfig, Zone } from '../../admin/types';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ImageGallery } from './ImageGallery';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TYPE_LABELS: Record<string, string> = {
  appartement: 'Appartement', villa_maison: 'Villa / Maison', studio: 'Studio', immeuble: 'Immeuble', terrain: 'Terrain', lotissement: 'Lotissement', local_commercial: 'Local commercial',
};
const STATUS_LABELS: Record<string, string> = {
  disponible: 'Disponible', reserve: 'Reserve', loue: 'Indisponible', maintenance: 'Indisponible', bloque: 'Indisponible',
};
const FEATURE_LABELS: Record<string, string> = {
  proche_plage: 'Proche plage', chauffage_central: 'Chauffage central', climatisation: 'Climatisation', balcon: 'Balcon', terrasse: 'Terrasse', ascenseur: 'Ascenseur', vue_mer: 'Vue mer', gaz_ville: 'Gaz de ville', cuisine_equipee: 'Cuisine equipee', place_parking: 'Place parking', syndic: 'Syndic', meuble: 'Meuble', independant: 'Independant', eau_puits: 'Eau puits', eau_sonede: 'Eau SONEDE', electricite_steg: 'Electricite STEG', toilette: 'Toilette', reserve_local: 'Reserve', vitrine: 'Vitrine', coin_angle: "Coin d'angle", electricite_3_phases: 'Electricite 3 phases', alarme: 'Alarme', terrain_constructible: 'Terrain constructible', terrain_angle: "Terrain d'angle", immeuble_proche_plage: 'Immeuble proche plage', immeuble_ascenseur: 'Ascenseur immeuble', immeuble_parking_sous_sol: 'Parking sous-sol', immeuble_parking_exterieur: 'Parking exterieur', immeuble_syndic: 'Syndic immeuble', immeuble_vue_mer: 'Vue mer immeuble',
};
const DEFAULT_TERRAIN_TABS = [
  { id: 'informations_generales', nom: '1. Informations generales', ordre: 1 },
  { id: 'dimensions_forme', nom: '2. Dimensions & forme', ordre: 2 },
  { id: 'situation_juridique', nom: '3. Situation juridique', ordre: 3 },
  { id: 'acces_environnement', nom: '4. Acces & environnement', ordre: 4 },
  { id: 'viabilisation', nom: '5. Viabilisation', ordre: 5 },
  { id: 'environnement_naturel', nom: '6. Environnement naturel', ordre: 6 },
  { id: 'ideal_utilisation', nom: '7. Ideal pour', ordre: 7 },
  { id: 'documents_disponibles', nom: '8. Documents disponibles', ordre: 8 },
];

type FeatureApiRow = {
  id: string;
  nom: string;
  onglet_id?: string | null;
  onglet_nom?: string | null;
  type_caracteristique?: 'simple' | 'choix_multiple' | 'valeur' | null;
  unite?: string | null;
  visibilite_client?: number | null;
};
type FeatureTabRow = { id: string; nom: string; ordre?: number; };
type DetailRow = { label: string; value: string | number; feature?: FeatureApiRow | null; };
type ToggleKey = keyof BienUiConfig;
type ToggleHandler = (type: 'section' | 'terrain_tab', key: string, nextValue: boolean) => void | Promise<void>;
type FeatureToggleHandler = (feature: FeatureApiRow, nextValue: boolean) => FeatureApiRow | null | void | Promise<FeatureApiRow | null | void>;

type PublicBienPageViewProps = {
  bien: Bien;
  zones: Zone[];
  backHref?: string | null;
  backLabel?: string;
  previewMode?: boolean;
  onToggleVisibility?: ToggleHandler;
  onToggleFeatureVisibility?: FeatureToggleHandler;
  togglingKey?: string | null;
  featureReloadKey?: number;
};

const resolveMediaUrl = (url?: string | null) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = /^https?:\/\//i.test(API_URL) ? API_URL : window.location.origin;
  const origin = new URL(base, window.location.origin).origin;
  return value.startsWith('/') ? `${origin}${value}` : value;
};
const formatMoney = (value?: number | null) => Number(value || 0).toLocaleString('fr-FR');
const normalizeFeatureName = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const toGalleryImages = (urls: string[], altPrefix: string) => urls.map((url, index) => ({ url, alt: `${altPrefix} ${index + 1}` }));
const boolText = (value?: boolean | null) => (value ? 'Oui' : 'Non');
const listText = (items?: Array<string | null> | null) => {
  const values = (Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean);
  return values.length > 0 ? values.join(', ') : '-';
};
function publicMainImages(bien: Bien) {
  return (bien.media || []).filter((m) => !String(m.motif_upload || '').startsWith('preuve_type_') && !String(m.motif_upload || '').startsWith('gallery_unite|')).map((m) => resolveMediaUrl(m.url)).filter(Boolean);
}
function unitImages(bien: Bien, unitKey: string) {
  return (bien.media || []).filter((m) => String(m.motif_upload || '') === `gallery_unite|vente|${bien.type}|${unitKey}`).map((m) => resolveMediaUrl(m.url)).filter(Boolean);
}
function getPublicPriceRows(
  bien: Bien,
  isFeaturePublic: (label: string) => boolean,
  findFeatureForLabel: (label: string) => FeatureApiRow | null,
) {
  const rows: Array<{ label: string; value: string; feature?: FeatureApiRow | null }> = [];
  if (bien.type === 'terrain') {
    if (isFeaturePublic('Prix affiche total (DT)') && bien.terrain_mode_affichage_prix !== 'm2_uniquement' && bien.terrain_prix_affiche_total) rows.push({ label: 'Prix total affiche', value: `${formatMoney(bien.terrain_prix_affiche_total)} DT`, feature: findFeatureForLabel('Prix affiche total (DT)') });
    if (isFeaturePublic('Prix affiche / m2 (DT)') && bien.terrain_mode_affichage_prix !== 'total_uniquement' && bien.terrain_prix_affiche_par_m2) rows.push({ label: 'Prix affiche / m2', value: `${formatMoney(bien.terrain_prix_affiche_par_m2)} DT/m2`, feature: findFeatureForLabel('Prix affiche / m2 (DT)') });
  } else if (bien.type === 'lotissement') {
    if (bien.lotissement_prix_total) rows.push({ label: 'Prix total affiche', value: `${formatMoney(bien.lotissement_prix_total)} DT`, feature: findFeatureForLabel('Prix total affiche') });
    if (bien.lotissement_prix_m2_unique) rows.push({ label: 'Prix / m2', value: `${formatMoney(bien.lotissement_prix_m2_unique)} DT/m2`, feature: findFeatureForLabel('Prix / m2') });
  } else if (bien.prix_affiche_client) rows.push({ label: 'Prix affiche client', value: `${formatMoney(bien.prix_affiche_client)} DT`, feature: findFeatureForLabel('Prix affiche client') });
  if (bien.prix_final) rows.push({ label: 'Prix final', value: `${formatMoney(bien.prix_final)} DT` });
  return rows;
}
function getDetailRows(bien: Bien, zoneName: string, findFeatureForLabel: (label: string) => FeatureApiRow | null) {
  const rows: DetailRow[] = [
    { label: 'Reference', value: bien.reference, feature: findFeatureForLabel('Reference') }, { label: 'Type', value: TYPE_LABELS[bien.type] || bien.type, feature: findFeatureForLabel('Type') }, { label: 'Zone', value: zoneName, feature: findFeatureForLabel('Zone') }, { label: 'Type de rue', value: bien.type_rue || '-', feature: findFeatureForLabel('Type de rue') }, { label: 'Type de papier', value: bien.type_papier || '-', feature: findFeatureForLabel('Type de papier') }, { label: 'Configuration', value: bien.configuration || '-', feature: findFeatureForLabel('Configuration') }, { label: 'Etage', value: bien.etage ?? '-', feature: findFeatureForLabel('Etage') }, { label: 'Superficie', value: bien.superficie_m2 ? `${bien.superficie_m2} m2` : '-', feature: findFeatureForLabel('Superficie') }, { label: 'Annee construction', value: bien.annee_construction ?? '-', feature: findFeatureForLabel('Annee construction') }, { label: 'Distance plage', value: bien.distance_plage_m ? `${bien.distance_plage_m} m` : '-', feature: findFeatureForLabel('Distance plage') }, { label: 'Chambres', value: bien.nb_chambres ?? 0, feature: findFeatureForLabel('Chambres') }, { label: 'Salles de bain', value: bien.nb_salle_bain ?? 0, feature: findFeatureForLabel('Salles de bain') }, { label: 'Surface local', value: bien.surface_local_m2 ? `${bien.surface_local_m2} m2` : '-', feature: findFeatureForLabel('Surface local') }, { label: 'Facade', value: bien.facade_m ? `${bien.facade_m} m` : '-', feature: findFeatureForLabel('Facade') }, { label: 'Hauteur plafond', value: bien.hauteur_plafond_m ? `${bien.hauteur_plafond_m} m` : '-', feature: findFeatureForLabel('Hauteur plafond') }, { label: 'Activite recommandee', value: bien.activite_recommandee || '-', feature: findFeatureForLabel('Activite recommandee') }, { label: 'Type terrain', value: bien.type_terrain || '-', feature: findFeatureForLabel('Type terrain') }, { label: 'Surface terrain', value: bien.terrain_surface_m2 ? `${bien.terrain_surface_m2} m2` : '-', feature: findFeatureForLabel('Surface terrain') }, { label: 'Facade terrain', value: bien.terrain_facade_m ? `${bien.terrain_facade_m} m` : '-', feature: findFeatureForLabel('Facade terrain') }, { label: 'Zone terrain', value: bien.terrain_zone || '-', feature: findFeatureForLabel('Zone terrain') }, { label: 'Distance plage terrain', value: bien.terrain_distance_plage_m ? `${bien.terrain_distance_plage_m} m` : '-', feature: findFeatureForLabel('Distance plage terrain') }, { label: 'Surface terrain immeuble', value: bien.immeuble_surface_terrain_m2 ? `${bien.immeuble_surface_terrain_m2} m2` : '-', feature: findFeatureForLabel('Surface terrain immeuble') }, { label: 'Surface batie immeuble', value: bien.immeuble_surface_batie_m2 ? `${bien.immeuble_surface_batie_m2} m2` : '-', feature: findFeatureForLabel('Surface batie immeuble') }, { label: 'Nombre niveaux', value: bien.immeuble_nb_niveaux ?? '-', feature: findFeatureForLabel('Nombre niveaux') }, { label: 'Nb appartements', value: bien.immeuble_nb_appartements ?? '-', feature: findFeatureForLabel('Nb appartements') }, { label: 'Nb garages', value: bien.immeuble_nb_garages ?? '-', feature: findFeatureForLabel('Nb garages') }, { label: 'Nb locaux commerciaux', value: bien.immeuble_nb_locaux_commerciaux ?? '-', feature: findFeatureForLabel('Nb locaux commerciaux') }, { label: 'Distance plage immeuble', value: bien.immeuble_distance_plage_m ? `${bien.immeuble_distance_plage_m} m` : '-', feature: findFeatureForLabel('Distance plage immeuble') }, { label: 'Nb terrains lotissement', value: bien.lotissement_nb_terrains ?? '-', feature: findFeatureForLabel('Nb terrains lotissement') }, { label: 'Mode prix lotissement', value: bien.lotissement_mode_prix_m2 || '-', feature: findFeatureForLabel('Mode prix lotissement') },
  ];
  return rows.filter((row) => row.value !== '-' && row.value !== '' && row.value !== null && row.value !== undefined);
}
const compactNormalizedText = (value: string) => normalizeFeatureName(value).replace(/[()]/g, ' ').replace(/\//g, ' ').replace(/\bdt\b/g, ' ').replace(/\bm2\b/g, ' ').replace(/\bm\b/g, ' ').replace(/\s+/g, ' ').trim();
const featureMatchesLabel = (featureName: string, label: string) => {
  const featureKey = compactNormalizedText(featureName);
  const labelKey = compactNormalizedText(label);
  if (!featureKey || !labelKey) return false;
  if (featureKey === labelKey) return true;
  if (featureKey.includes(labelKey) || labelKey.includes(featureKey)) return true;
  const aliases: Record<string, string[]> = {
    'prix affiche total': ['prix total affiche'],
    'prix affiche': ['prix affiche'],
    'route d acces largeur en': ['route d acces'],
    'eau sources': ['eau'],
    'visualisation limites cadastrales': ['si oui visualiser'],
  };
  return Object.entries(aliases).some(([source, targets]) => (
    (featureKey === source && targets.includes(labelKey)) ||
    (labelKey === source && targets.includes(featureKey))
  ));
};

function terrainRowsForTab(
  bien: Bien,
  zoneName: string,
  tabId: string,
  isFeaturePublic: (label: string) => boolean,
  findFeatureForLabel: (label: string) => FeatureApiRow | null,
) {
  const rows: DetailRow[] = [];
  const push = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== '' && value !== '-') rows.push({ label, value, feature: findFeatureForLabel(label) });
  };
  switch (tabId) {
    case 'informations_generales': push('Type de terrain', bien.type_terrain || null); push('Zone', bien.terrain_zone || zoneName); push('Type de rue', bien.type_rue || null); push('Type de papier', bien.type_papier || null); push('Disponibilite reseaux', listText(bien.terrain_disponibilite_reseaux)); push('Hauteur de construction autorisee', bien.terrain_hauteur_construction_autorisee || null); push('Mode affichage prix', bien.terrain_mode_affichage_prix || null); if (isFeaturePublic('Prix affiche total (DT)') && bien.terrain_mode_affichage_prix !== 'm2_uniquement') push('Prix total affiche', bien.terrain_prix_affiche_total ? `${formatMoney(bien.terrain_prix_affiche_total)} DT` : null); if (isFeaturePublic('Prix affiche / m2 (DT)') && bien.terrain_mode_affichage_prix !== 'total_uniquement') push('Prix affiche / m2', bien.terrain_prix_affiche_par_m2 ? `${formatMoney(bien.terrain_prix_affiche_par_m2)} DT/m2` : null); break;
    case 'dimensions_forme': push('Surface', bien.terrain_surface_m2 ? `${bien.terrain_surface_m2} m2` : null); push('Facade', bien.terrain_facade_m ? `${bien.terrain_facade_m} m` : null); push("Route d'acces", bien.terrain_route_acces_largeur_m ? `${bien.terrain_route_acces_largeur_m} m` : null); push('Forme', bien.terrain_forme || null); push('Topographie', bien.terrain_topographie || null); push('Distance plage', bien.terrain_distance_plage_m ? `${bien.terrain_distance_plage_m} m` : null); break;
    case 'situation_juridique': push('Bornage', boolText(bien.terrain_bornage)); push('Travaux autorises selon municipalite', boolText(bien.terrain_travaux_municipalite_autorises)); push('Limites cadastrales', boolText(bien.terrain_limites_cadastrales)); push('Visualisation limites cadastrales', boolText(bien.terrain_visualisation_limites_cadastrales)); break;
    case 'acces_environnement': push('Voisinage', bien.terrain_voisinage || null); push('Proximite commodites', listText(bien.terrain_proximites_commodites)); push('Autres proximites', bien.terrain_proximites_commodites_autres || null); break;
    case 'viabilisation': push('Eau', listText(bien.terrain_viabilisation_eau_sources)); push('Canalisation ONAS', bien.terrain_viabilisation_onas || null); push('STEG', bien.terrain_viabilisation_steg || null); push('Gaz de ville', boolText(bien.terrain_viabilisation_gaz_ville)); push('Fibre optique / internet', boolText(bien.terrain_viabilisation_fibre_optique)); push('Telephone fixe', boolText(bien.terrain_viabilisation_telephone_fixe)); break;
    case 'environnement_naturel': push('Type du sol', bien.terrain_type_sol || null); push('Vegetation', bien.terrain_vegetation || null); push('Niveau sonore', bien.terrain_niveau_sonore || null); push('Risque inondation', boolText(bien.terrain_risque_inondation)); push('Exposition au vent', bien.terrain_exposition_vent || null); break;
    case 'ideal_utilisation': push('Ideal pour', listText(bien.terrain_ideal_utilisations)); break;
    case 'documents_disponibles': push('Documents disponibles', listText(bien.terrain_documents_disponibles)); break;
  }
  return rows;
}

export default function PublicBienPageView({ bien, zones, backHref = '/ventes', backLabel = 'Retour a la liste', previewMode = false, onToggleVisibility, onToggleFeatureVisibility, togglingKey = null, featureReloadKey = 0 }: PublicBienPageViewProps) {
  const [allFeatures, setAllFeatures] = useState<FeatureApiRow[]>([]);
  const [featureTabs, setFeatureTabs] = useState<FeatureTabRow[]>([]);
  const uiConfig: BienUiConfig = bien.ui_config || {};

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const base = String(API_URL || '').replace(/\/+$/, '');
        const normalizedBase = base.replace(/\/api$/i, '');
        const currentMode = encodeURIComponent(String(bien.mode || 'vente'));
        const currentType = encodeURIComponent(String(bien.type || ''));
        const currentBienId = encodeURIComponent(String(bien.id || ''));
        const featureUrls = [`${base}/caracteristiques?mode_bien=${currentMode}&type_bien=${currentType}&bien_id=${currentBienId}`, `${normalizedBase}/api/caracteristiques?mode_bien=${currentMode}&type_bien=${currentType}&bien_id=${currentBienId}`];
        let featureResponse: Response | null = null;
        for (const url of Array.from(new Set(featureUrls))) { const next = await fetch(url); featureResponse = next; if (next.ok || next.status !== 404) break; }
        const featureRows = featureResponse && featureResponse.ok ? await featureResponse.json() : [];
        if (!disposed) setAllFeatures(Array.isArray(featureRows) ? featureRows : []);
        if (bien.type === 'terrain') {
          const tabUrls = [`${base}/caracteristique-onglets?mode_bien=${currentMode}&type_bien=${currentType}`, `${normalizedBase}/api/caracteristique-onglets?mode_bien=${currentMode}&type_bien=${currentType}`];
          let tabResponse: Response | null = null;
          for (const url of Array.from(new Set(tabUrls))) { const next = await fetch(url); tabResponse = next; if (next.ok || next.status !== 404) break; }
          const tabRows = tabResponse && tabResponse.ok ? await tabResponse.json() : [];
          if (!disposed) setFeatureTabs(Array.isArray(tabRows) && tabRows.length > 0 ? tabRows : DEFAULT_TERRAIN_TABS);
        } else if (!disposed) setFeatureTabs([]);
      } catch {
        if (!disposed) { setAllFeatures([]); setFeatureTabs(bien.type === 'terrain' ? DEFAULT_TERRAIN_TABS : []); }
      }
    };
    void load();
    return () => { disposed = true; };
  }, [bien.id, bien.type, featureReloadKey]);

  const selectedFeatureIds = new Set((Array.isArray(bien.caracteristique_ids) ? bien.caracteristique_ids : []).map((item) => String(item)));
  const selectedFeatureNames = new Set((Array.isArray(bien.caracteristiques) ? bien.caracteristiques : []).map((item) => normalizeFeatureName(String(item))));
  const selectedFeatures = allFeatures.filter((item) => selectedFeatureIds.has(String(item.id || '')) || selectedFeatureNames.has(normalizeFeatureName(String(item.nom || ''))));
  const selectedVisibleFeatures = selectedFeatures.filter((item) => Number(item?.visibilite_client) !== 0);
  const findFeatureForLabel = useMemo(() => (
    (label: string, preferredTabId?: string | null) => {
      const pool = preferredTabId
        ? [...allFeatures.filter((item) => String(item.onglet_id || '') === preferredTabId), ...allFeatures.filter((item) => String(item.onglet_id || '') !== preferredTabId)]
        : allFeatures;
      return pool.find((item) => featureMatchesLabel(String(item.nom || ''), label)) || null;
    }
  ), [allFeatures]);
  const isFeaturePublic = useMemo(() => (
    (featureName: string, preferredTabId?: string | null) => {
      const feature = findFeatureForLabel(featureName, preferredTabId);
      return feature ? Number(feature.visibilite_client) !== 0 : true;
    }
  ), [findFeatureForLabel]);
  const isSectionVisible = (key: ToggleKey) => uiConfig[key] !== false;
  const isTerrainTabVisible = (tabId: string) => uiConfig.terrain_tabs?.[tabId] !== false;
  const zoneName = zones.find((z) => z.id === bien.zone_id)?.nom || 'Zone non definie';
  const headerImages = publicMainImages(bien);
  const publicPriceRows = getPublicPriceRows(bien, (label) => isFeaturePublic(label), (label) => findFeatureForLabel(label));
  const detailRows = getDetailRows(bien, zoneName, (label) => findFeatureForLabel(label));
  const terrainTabsForRender = (featureTabs.length > 0 ? featureTabs : DEFAULT_TERRAIN_TABS).slice().sort((a, b) => Number(a.ordre || 999) - Number(b.ordre || 999));
  const featureTags = Object.entries(FEATURE_LABELS).filter(([key]) => (bien as unknown as Record<string, unknown>)[key] === true).map(([, label]) => label);
  const genericFeatureRows = selectedFeatures.filter((item) => !item.onglet_id || bien.type !== 'terrain');
  const genericFeatureNames = new Set(genericFeatureRows.map((item) => normalizeFeatureName(String(item.nom || ''))));
  const genericBooleanFeatureTags = featureTags.filter((label) => !genericFeatureNames.has(normalizeFeatureName(label)));
  const showRightColumn = isSectionVisible('show_tarification_publique') || isSectionVisible('show_modalites_paiement') || previewMode;

  const featureToggleButton = (feature: FeatureApiRow) => {
    if (!previewMode || !onToggleFeatureVisibility) return null;
    const visible = Number(feature.visibilite_client) !== 0;
    const busy = togglingKey === `feature:${feature.id}`;
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const nextValue = !visible;
          setAllFeatures((prev) => prev.map((item) => item.id === feature.id ? { ...item, visibilite_client: nextValue ? 1 : 0 } : item));
          try {
            const updated = await onToggleFeatureVisibility(feature, nextValue);
            if (updated?.id) {
              setAllFeatures((prev) => prev.map((item) => item.id === feature.id ? { ...item, ...updated } : item));
            }
          } catch {
            setAllFeatures((prev) => prev.map((item) => item.id === feature.id ? { ...item, visibilite_client: visible ? 1 : 0 } : item));
          }
        }}
        className={`inline-flex h-7 w-7 shrink-0 self-center items-center justify-center rounded-full border transition ${visible ? 'border-emerald-300 bg-white text-emerald-700' : 'border-gray-300 bg-gray-100 text-gray-500'} disabled:opacity-60`}
        title={visible ? 'Masquer cette caracteristique' : 'Afficher cette caracteristique'}
      >
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    );
  };

  const toggleButton = (type: 'section' | 'terrain_tab', key: string, visible: boolean) => {
    if (!previewMode || !onToggleVisibility) return null;
    const busy = togglingKey === `${type}:${key}`;
    return (
      <button type="button" disabled={busy} onClick={() => void onToggleVisibility(type, key, !visible)} className={`inline-flex h-8 shrink-0 self-center items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${visible ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-gray-300 text-gray-600 bg-white'} disabled:opacity-60`}>
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {busy ? '...' : (visible ? 'Visible' : 'Masque')}
      </button>
    );
  };

  const sectionCard = (type: 'section' | 'terrain_tab', key: string, title: string, visible: boolean, content: React.ReactNode) => {
    if (!visible && !previewMode) return null;
    if (!visible && previewMode) {
      return <Card key={`${type}-${key}`} className="border-dashed border-gray-300"><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-base text-gray-500">{title}</CardTitle>{toggleButton(type, key, visible)}</CardHeader><CardContent><p className="text-sm text-gray-500">Bloc masque sur la page client.</p></CardContent></Card>;
    }
    return <Card key={`${type}-${key}`}>{content}</Card>;
  };

  const terrainCards = bien.type === 'terrain'
    ? terrainTabsForRender.map((tab) => {
        const tabFeatureDefinitions = allFeatures.filter((item) => String(item.onglet_id || '') === tab.id);
        const tabFeatures = selectedFeatures.filter((item) => String(item.onglet_id || '') === tab.id);
        const visibleTabFeatures = tabFeatures.filter((item) => Number(item.visibilite_client) !== 0);
        const rows = terrainRowsForTab(
          bien,
          zoneName,
          tab.id,
          (label) => isFeaturePublic(label, tab.id),
          (label) => tabFeatureDefinitions.find((item) => featureMatchesLabel(String(item.nom || ''), label)) || findFeatureForLabel(label, tab.id),
        );
        const renderRows = previewMode ? rows : rows.filter((row) => !row.feature || Number(row.feature.visibilite_client) !== 0);
        const hasDescription = tab.id === 'informations_generales' && !!bien.description;
        const content = <><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle>{tab.nom}</CardTitle>{toggleButton('terrain_tab', tab.id, isTerrainTabVisible(tab.id))}</CardHeader><CardContent className="space-y-4">{hasDescription && <p className="text-sm text-gray-700 whitespace-pre-line">{bien.description}</p>}{renderRows.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{renderRows.map((row) => <div key={`${tab.id}-${row.label}`} className={`flex items-center justify-between gap-3 text-sm border rounded-lg px-3 py-2 ${row.feature && Number(row.feature.visibilite_client) === 0 ? 'border-gray-200 bg-gray-50 text-gray-400' : 'text-gray-700'}`}><div className="min-w-0"><span className="font-semibold text-gray-900">{row.label}:</span> {row.value}</div>{row.feature ? featureToggleButton(row.feature) : null}</div>)}</div>}{(previewMode ? tabFeatures.length > 0 : visibleTabFeatures.length > 0) && <div className="flex flex-wrap gap-2">{(previewMode ? tabFeatures : visibleTabFeatures).map((feature) => <span key={`${tab.id}-${feature.id}`} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${Number(feature.visibilite_client) === 0 ? 'border-gray-300 bg-gray-100 text-gray-500' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><span>{feature.nom}</span>{featureToggleButton(feature)}</span>)}</div>}</CardContent></>;
        if (!previewMode && renderRows.length === 0 && visibleTabFeatures.length === 0 && !hasDescription) return null;
        return sectionCard('terrain_tab', tab.id, tab.nom, isTerrainTabVisible(tab.id), content);
      }).filter(Boolean)
    : [];

  return (
    <div className={`min-h-screen pb-12 ${previewMode ? 'bg-white' : ''}`}>
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white py-8 px-4"><div className="max-w-7xl mx-auto">{backHref ? <Link to={backHref} className="inline-flex items-center text-emerald-100 hover:text-white mb-4 transition-colors"><ArrowLeft className="w-4 h-4 mr-2" />{backLabel}</Link> : <div className="mb-4" />}<div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4"><div><h1 className="text-3xl md:text-4xl font-bold mb-2">{bien.titre}</h1><p className="text-emerald-100">Ref: {bien.reference}</p></div><div className="flex flex-col items-end gap-2"><Badge className={bien.statut === 'disponible' ? 'bg-white text-emerald-700 text-lg px-4 py-2' : 'bg-red-600 text-lg px-4 py-2'}>{bien.statut === 'disponible' ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{STATUS_LABELS[bien.statut] || 'Disponible'}</span> : <span className="inline-flex items-center gap-1"><XCircle className="w-4 h-4" />{STATUS_LABELS[bien.statut] || 'Indisponible'}</span>}</Badge>{previewMode && <span className={`rounded-full px-3 py-1 text-xs font-medium ${bien.visible_sur_site === false ? 'bg-white/15 text-white border border-white/30' : 'bg-white text-emerald-700'}`}>{bien.visible_sur_site === false ? 'Masque sur le site' : 'Visible sur le site'}</span>}</div></div></div></div>
      <div className={`max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 ${showRightColumn ? 'lg:grid-cols-3' : ''} gap-8`}>
        <div className={showRightColumn ? 'lg:col-span-2 space-y-6' : 'space-y-6'}>
          {sectionCard('section', 'show_gallery', 'Galerie', isSectionVisible('show_gallery'), <>{headerImages.length > 0 ? <ImageGallery images={toGalleryImages(headerImages, bien.titre)} title={bien.titre} /> : <CardContent><p className="text-sm text-gray-500">Aucune image.</p></CardContent>}{previewMode && headerImages.length > 0 && <div className="px-6 pb-4">{toggleButton('section', 'show_gallery', isSectionVisible('show_gallery'))}</div>}</>)}
          {bien.type !== 'terrain' && sectionCard('section', 'show_informations_generales', 'Informations generales', isSectionVisible('show_informations_generales'), <><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle>Informations generales</CardTitle>{toggleButton('section', 'show_informations_generales', isSectionVisible('show_informations_generales'))}</CardHeader><CardContent className="space-y-4"><p className="text-sm text-gray-600"><span className="font-semibold text-gray-900">Type:</span> {TYPE_LABELS[bien.type] || bien.type}</p><p className="text-sm text-gray-600"><span className="font-semibold text-gray-900">Zone:</span> {zoneName}</p>{bien.description && <p className="text-sm text-gray-700 whitespace-pre-line">{bien.description}</p>}<div className="grid grid-cols-1 md:grid-cols-2 gap-3">{(previewMode ? detailRows : detailRows.filter((row) => !row.feature || Number(row.feature.visibilite_client) !== 0)).map((row) => <div key={row.label} className={`flex items-center justify-between gap-3 text-sm border rounded-lg px-3 py-2 ${row.feature && Number(row.feature.visibilite_client) === 0 ? 'border-gray-200 bg-gray-50 text-gray-400' : 'text-gray-700'}`}><div className="min-w-0"><span className="font-semibold text-gray-900">{row.label}:</span> {row.value}</div>{row.feature ? featureToggleButton(row.feature) : null}</div>)}</div></CardContent></>)}
          {bien.type === 'terrain' && terrainCards}
          {sectionCard('section', 'show_caracteristiques', 'Caracteristiques', isSectionVisible('show_caracteristiques'), <><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle>Caracteristiques</CardTitle>{toggleButton('section', 'show_caracteristiques', isSectionVisible('show_caracteristiques'))}</CardHeader><CardContent className="flex flex-wrap gap-2">{(previewMode ? (genericFeatureRows.length > 0 || genericBooleanFeatureTags.length > 0) : (selectedVisibleFeatures.filter((item) => !item.onglet_id || bien.type !== 'terrain').length > 0 || genericBooleanFeatureTags.length > 0)) ? <>{(previewMode ? genericFeatureRows : selectedVisibleFeatures.filter((item) => !item.onglet_id || bien.type !== 'terrain')).map((feature) => <span key={feature.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${Number(feature.visibilite_client) === 0 ? 'border-gray-300 bg-gray-100 text-gray-500' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><span>{feature.nom}</span>{featureToggleButton(feature)}</span>)}{genericBooleanFeatureTags.map((feature) => <span key={feature} className="text-sm bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-emerald-800">{feature}</span>)}</> : <p className="text-sm text-gray-500">Aucune caracteristique visible.</p>}</CardContent></>)}
          {(bien.immeuble_appartements || []).length > 0 && sectionCard('section', 'show_immeuble_appartements', 'Appartements', isSectionVisible('show_immeuble_appartements'), <><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle>Appartements</CardTitle>{toggleButton('section', 'show_immeuble_appartements', isSectionVisible('show_immeuble_appartements'))}</CardHeader><CardContent className="space-y-4">{(bien.immeuble_appartements || []).map((row, index) => { const key = `appartement_${index + 1}`; const images = unitImages(bien, key); return <div key={key} className="rounded-lg border p-4 space-y-2"><p className="font-semibold text-gray-900">Appartement {index + 1} ({row.reference || `APT-${index + 1}`})</p><p className="text-sm text-gray-700">Chambres: {row.chambres || 0} | SDB: {row.salle_bain || 0} | Surface: {row.superficie_m2 || 0} m2 | Configuration: {row.configuration || '-'}</p>{images.length > 0 && <ImageGallery images={toGalleryImages(images, `Appartement ${index + 1}`)} title={`Appartement ${index + 1}`} />}</div>; })}</CardContent></>)}
          {(bien.immeuble_garages || []).length > 0 && sectionCard('section', 'show_immeuble_garages', 'Garages', isSectionVisible('show_immeuble_garages'), <><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle>Garages</CardTitle>{toggleButton('section', 'show_immeuble_garages', isSectionVisible('show_immeuble_garages'))}</CardHeader><CardContent className="space-y-4">{(bien.immeuble_garages || []).map((row, index) => { const key = `garage_${index + 1}`; const images = unitImages(bien, key); return <div key={key} className="rounded-lg border p-4 space-y-2"><p className="font-semibold text-gray-900">Garage {index + 1} ({row.reference || `GAR-${index + 1}`})</p>{images.length > 0 && <ImageGallery images={toGalleryImages(images, `Garage ${index + 1}`)} title={`Garage ${index + 1}`} />}</div>; })}</CardContent></>)}
          {(bien.immeuble_locaux_commerciaux || []).length > 0 && sectionCard('section', 'show_immeuble_locaux_commerciaux', 'Locaux commerciaux', isSectionVisible('show_immeuble_locaux_commerciaux'), <><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle>Locaux commerciaux</CardTitle>{toggleButton('section', 'show_immeuble_locaux_commerciaux', isSectionVisible('show_immeuble_locaux_commerciaux'))}</CardHeader><CardContent className="space-y-4">{(bien.immeuble_locaux_commerciaux || []).map((row, index) => { const key = `local_${index + 1}`; const images = unitImages(bien, key); return <div key={key} className="rounded-lg border p-4 space-y-2"><p className="font-semibold text-gray-900">Local {index + 1} ({row.reference || `LOC-${index + 1}`})</p>{images.length > 0 && <ImageGallery images={toGalleryImages(images, `Local ${index + 1}`)} title={`Local ${index + 1}`} />}</div>; })}</CardContent></>)}
          {(bien.lotissement_terrains || []).length > 0 && sectionCard('section', 'show_lotissement_terrains', 'Terrains du lotissement', isSectionVisible('show_lotissement_terrains'), <><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle>Terrains du lotissement</CardTitle>{toggleButton('section', 'show_lotissement_terrains', isSectionVisible('show_lotissement_terrains'))}</CardHeader><CardContent className="space-y-4">{(bien.lotissement_terrains || []).map((row, index) => { const key = `terrain_${index + 1}`; const images = unitImages(bien, key); return <div key={key} className="rounded-lg border p-4 space-y-2"><p className="font-semibold text-gray-900">Terrain {index + 1} ({row.reference || `TRN-${index + 1}`})</p><p className="text-sm text-gray-700">Type: {row.type_terrain || '-'} | Surface: {row.surface_m2 || 0} m2 | Rue: {row.type_rue || '-'} | Papier: {row.type_papier || '-'}</p><p className="text-sm text-gray-700">Zone: {row.terrain_zone || '-'} | Distance plage: {row.terrain_distance_plage_m || 0} m | Constructible: {row.terrain_constructible ? 'Oui' : 'Non'} | Terrain angle: {row.terrain_angle ? 'Oui' : 'Non'}</p>{images.length > 0 && <ImageGallery images={toGalleryImages(images, `Terrain ${index + 1}`)} title={`Terrain ${index + 1}`} />}</div>; })}</CardContent></>)}
        </div>
        {showRightColumn && <div className="space-y-6">{sectionCard('section', 'show_tarification_publique', 'Tarification publique', isSectionVisible('show_tarification_publique'), <><CardHeader className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white flex flex-row items-center justify-between space-y-0"><CardTitle>Tarification publique</CardTitle>{toggleButton('section', 'show_tarification_publique', isSectionVisible('show_tarification_publique'))}</CardHeader><CardContent className="pt-6 space-y-3">{(previewMode ? publicPriceRows : publicPriceRows.filter((row) => !row.feature || Number(row.feature.visibilite_client) !== 0)).length === 0 ? <p className="text-sm text-gray-500">Aucun prix public defini.</p> : (previewMode ? publicPriceRows : publicPriceRows.filter((row) => !row.feature || Number(row.feature.visibilite_client) !== 0)).map((row) => <div key={row.label} className={`flex items-center justify-between gap-4 text-sm ${row.feature && Number(row.feature.visibilite_client) === 0 ? 'text-gray-400' : ''}`}><span className="text-gray-600">{row.label}</span><div className="flex items-center gap-2"><span className="font-semibold text-gray-900">{row.value}</span>{row.feature ? featureToggleButton(row.feature) : null}</div></div>)}{bien.lotissement_paliers_prix_m2 && bien.lotissement_paliers_prix_m2.length > 0 && <div className="pt-2 border-t"><p className="text-sm font-semibold text-gray-900 mb-2">Paliers prix / m2</p><div className="space-y-2">{bien.lotissement_paliers_prix_m2.map((palier, index) => <div key={`${palier.min_m2}-${index}`} className="text-sm text-gray-700">{palier.min_m2} - {palier.max_m2 || 'et plus'} m2: <span className="font-semibold">{formatMoney(palier.prix_m2)} DT/m2</span></div>)}</div></div>}</CardContent></>)}{sectionCard('section', 'show_modalites_paiement', 'Modalites de paiement', isSectionVisible('show_modalites_paiement'), <><CardHeader className="bg-gradient-to-r from-amber-500 to-amber-600 text-white flex flex-row items-center justify-between space-y-0"><CardTitle>Modalites de paiement</CardTitle>{toggleButton('section', 'show_modalites_paiement', isSectionVisible('show_modalites_paiement'))}</CardHeader><CardContent className="pt-6 space-y-3"><div className="flex items-center justify-between text-sm"><span className="text-gray-600">Mode</span><span className="font-semibold text-gray-900">{bien.modalite_paiement_vente || '-'}</span></div>{bien.montant_premiere_partie_promesse !== null && bien.montant_premiere_partie_promesse !== undefined && <div className="flex items-center justify-between text-sm"><span className="text-gray-600">Promesse</span><span className="font-semibold text-gray-900">{formatMoney(bien.montant_premiere_partie_promesse)} DT</span></div>}{bien.montant_deuxieme_partie !== null && bien.montant_deuxieme_partie !== undefined && <div className="flex items-center justify-between text-sm"><span className="text-gray-600">Deuxieme partie</span><span className="font-semibold text-gray-900">{formatMoney(bien.montant_deuxieme_partie)} DT</span></div>}{bien.nombre_tranches !== null && bien.nombre_tranches !== undefined && bien.nombre_tranches > 0 && <div className="flex items-center justify-between text-sm"><span className="text-gray-600">Nombre de tranches</span><span className="font-semibold text-gray-900">{bien.nombre_tranches}</span></div>}{bien.montant_par_tranche !== null && bien.montant_par_tranche !== undefined && bien.montant_par_tranche > 0 && <div className="flex items-center justify-between text-sm"><span className="text-gray-600">Montant par tranche</span><span className="font-semibold text-gray-900">{formatMoney(bien.montant_par_tranche)} DT</span></div>}</CardContent></>)}</div>}
      </div>
    </div>
  );
}
