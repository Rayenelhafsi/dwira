import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Eye, EyeOff, MapPin, Star } from 'lucide-react';
import { Bien, BienUiConfig, Zone } from '../../admin/types';
import { toYouTubeEmbedUrl } from '../../utils/videoLinks';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type FeatureApiRow = {
  id: string;
  nom: string;
  onglet_id?: string | null;
  type_caracteristique?: 'simple' | 'choix_multiple' | 'valeur' | null;
  unite?: string | null;
  visibilite_client?: number | null;
};

type ToggleHandler = (type: 'section', key: string, nextValue: boolean) => void | Promise<void>;
type FeatureToggleHandler = (feature: FeatureApiRow, nextValue: boolean) => FeatureApiRow | null | void | Promise<FeatureApiRow | null | void>;

type Props = {
  bien: Bien;
  zones: Zone[];
  previewMode?: boolean;
  onToggleVisibility?: ToggleHandler;
  onToggleFeatureVisibility?: FeatureToggleHandler;
  togglingKey?: string | null;
  featureReloadKey?: number;
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
  cuisine_equipee: 'Cuisine equipee',
  place_parking: 'Place parking',
  syndic: 'Syndic',
  meuble: 'Meuble',
  independant: 'Independant',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau SONEDE',
  electricite_steg: 'Electricite STEG',
  toilette: 'Toilette',
  reserve_local: 'Reserve',
  vitrine: 'Vitrine',
  coin_angle: "Coin d'angle",
  electricite_3_phases: 'Electricite 3 phases',
  alarme: 'Alarme',
};

const resolveMediaUrl = (url?: string | null) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = /^https?:\/\//i.test(API_URL)
    ? API_URL
    : (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : window.location.origin);
  const origin = new URL(base, window.location.origin).origin;
  return value.startsWith('/') ? `${origin}${value}` : value;
};

const normalizeFeatureName = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const formatMoney = (value?: number | null) => Number(value || 0).toLocaleString('fr-FR');
const isTruthy = (value: unknown) => value === true || value === 1 || value === '1';

export default function LocationPublicBienPageView({
  bien,
  zones,
  previewMode = false,
  onToggleVisibility,
  onToggleFeatureVisibility,
  togglingKey = null,
  featureReloadKey = 0,
}: Props) {
  const [allFeatures, setAllFeatures] = useState<FeatureApiRow[]>([]);
  const uiConfig: BienUiConfig = bien.ui_config || {};

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const base = String(API_URL || '').replace(/\/+$/, '');
        const normalizedBase = base.replace(/\/api$/i, '');
        const currentMode = encodeURIComponent(String(bien.mode || 'location_saisonniere'));
        const currentType = encodeURIComponent(String(bien.type || 'appartement'));
        const currentBienId = encodeURIComponent(String(bien.id || ''));
        const urls = [
          `${base}/caracteristiques?mode_bien=${currentMode}&type_bien=${currentType}&bien_id=${currentBienId}`,
          `${normalizedBase}/api/caracteristiques?mode_bien=${currentMode}&type_bien=${currentType}&bien_id=${currentBienId}`,
        ];
        let response: Response | null = null;
        for (const url of Array.from(new Set(urls))) {
          const next = await fetch(url);
          response = next;
          if (next.ok || next.status !== 404) break;
        }
        const rows = response?.ok ? await response.json() : [];
        if (!disposed) setAllFeatures(Array.isArray(rows) ? rows : []);
      } catch {
        if (!disposed) setAllFeatures([]);
      }
    };
    void load();
    return () => { disposed = true; };
  }, [bien.id, bien.mode, bien.type, featureReloadKey]);

  const images = (bien.media || []).filter((item) => item.type !== 'video').map((item) => resolveMediaUrl(item.url)).filter(Boolean);
  const videos = (bien.media || []).filter((item) => item.type === 'video').map((item) => String(item.url || '').trim()).filter(Boolean);
  const zoneName = zones.find((item) => item.id === bien.zone_id)?.nom || 'Zone non definie';
  const selectedFeatureIds = new Set((Array.isArray(bien.caracteristique_ids) ? bien.caracteristique_ids : []).map((item) => String(item)));
  const selectedFeatureNames = new Set((Array.isArray(bien.caracteristiques) ? bien.caracteristiques : []).map((item) => normalizeFeatureName(String(item))));
  const selectedFeatures = allFeatures.filter((item) => selectedFeatureIds.has(String(item.id || '')) || selectedFeatureNames.has(normalizeFeatureName(String(item.nom || ''))));
  const visibleSelectedFeatures = selectedFeatures.filter((item) => Number(item.visibilite_client) !== 0 && String(item.onglet_id || '').trim().length > 0);
  const booleanFeatureTags = Object.entries(FEATURE_LABELS)
    .filter(([key]) => isTruthy((bien as unknown as Record<string, unknown>)[key]))
    .map(([, label]) => label)
    .filter((label) => !selectedFeatures.some((item) => normalizeFeatureName(String(item.nom || '')) === normalizeFeatureName(label)));

  const isVisible = (key: keyof BienUiConfig | string) => (uiConfig as Record<string, unknown>)[key] !== false;
  const busyToggle = (key: string) => togglingKey === key;

  const sectionToggle = (key: string) => {
    if (!previewMode || !onToggleVisibility) return null;
    const visible = isVisible(key);
    return (
      <button
        type="button"
        disabled={busyToggle(`section:${key}`)}
        onClick={() => void onToggleVisibility('section', key, !visible)}
        className={`inline-flex h-8 shrink-0 self-center items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${visible ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-gray-300 text-gray-600 bg-white'} disabled:opacity-60`}
      >
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {visible ? 'Visible' : 'Masque'}
      </button>
    );
  };

  const featureToggle = (feature: FeatureApiRow) => {
    if (!previewMode || !onToggleFeatureVisibility) return null;
    const visible = Number(feature.visibilite_client) !== 0;
    return (
      <button
        type="button"
        disabled={busyToggle(`feature:${feature.id}`)}
        onClick={() => void onToggleFeatureVisibility(feature, !visible)}
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${visible ? 'border-emerald-300 bg-white text-emerald-700' : 'border-gray-300 bg-gray-100 text-gray-500'} disabled:opacity-60`}
        title={visible ? 'Masquer cette caracteristique' : 'Afficher cette caracteristique'}
      >
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    );
  };

  const amenityRows = previewMode
    ? selectedFeatures.filter((item) => String(item.onglet_id || '').trim().length > 0)
    : visibleSelectedFeatures;
  const showBookingCard = isVisible('show_booking_card') && isVisible('show_tarification_publique');

  const block = (key: string, title: string, content: React.ReactNode, className = '') => {
    const visible = isVisible(key);
    if (!visible && !previewMode) return null;
    if (!visible && previewMode) {
      return (
        <div className={`rounded-2xl border border-dashed border-gray-300 bg-white p-6 ${className}`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-500">{title}</h3>
            {sectionToggle(key)}
          </div>
          <p className="mt-3 text-sm text-gray-500">Bloc masque sur la page client.</p>
        </div>
      );
    }
    return <div className={className}>{content}</div>;
  };

  return (
    <div className="bg-white pt-24 pb-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-sm text-gray-500 mb-6">
          <span>Accueil</span>
          <span className="mx-2">/</span>
          <span>Logements</span>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{bien.titre}</span>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{bien.titre}</h1>
            <div className="flex items-center gap-4 text-gray-600 text-sm">
              <div className="flex items-center gap-1"><MapPin size={16} /><span>{zoneName}</span></div>
              <div className="flex items-center gap-1"><Star size={16} className="text-amber-500 fill-current" /><span className="font-medium text-gray-900">5,0</span><span>(33 avis)</span></div>
            </div>
          </div>
          {previewMode ? sectionToggle('show_booking_card') : null}
        </div>

        {images.length > 0 ? block('show_gallery', 'Galerie', (
          <div className="mb-12">
            <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 h-[500px] rounded-xl overflow-hidden">
              <div className="col-span-2 row-span-2"><img src={images[0] || ''} alt={bien.titre} className="w-full h-full object-cover" /></div>
              {[1, 2, 3].map((index) => <div key={index} className="col-span-1 row-span-1"><img src={images[index] || images[0] || ''} alt={`${bien.titre} ${index + 1}`} className="w-full h-full object-cover" /></div>)}
              <div className="col-span-1 row-span-1 relative"><img src={images[4] || images[0] || ''} alt={`${bien.titre} 5`} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/30 flex items-center justify-center"><span className="text-white font-semibold text-lg">Voir tout</span></div></div>
            </div>
            <div className="md:hidden rounded-xl overflow-hidden shadow-lg relative"><img src={images[0] || ''} alt={bien.titre} className="w-full h-[250px] object-cover" /></div>
            {previewMode ? <div className="mt-4 flex justify-start">{sectionToggle('show_gallery')}</div> : null}
          </div>
        )) : null}

        {videos.length > 0 && (
          <div className="mb-12 rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-xl font-bold text-gray-900">Video</h3>
              {previewMode ? sectionToggle('show_gallery') : null}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {videos.map((videoUrl, index) => (
                <iframe
                  key={`${videoUrl}-${index}`}
                  src={toYouTubeEmbedUrl(videoUrl) || ''}
                  title={`${bien.titre} video ${index + 1}`}
                  className="w-full h-[240px] md:h-[360px] rounded-2xl bg-black"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            {block('show_informations_generales', 'Informations generales', (
              <div className="py-6 border-b border-gray-100">
                <div className="flex justify-between items-center gap-3 mb-6">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Logement entier : {bien.configuration || bien.type}</h2>
                    <div className="flex gap-4 text-gray-600 text-sm">
                      <span className="font-medium text-emerald-700">{Math.max((bien.nb_chambres || 0) + 1, 1)} voyageurs max</span>
                      <span>·</span>
                      <span>{bien.nb_chambres || 0} chambres</span>
                      <span>·</span>
                      <span>{bien.nb_salle_bain || 0} salles de bain</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">DI</div>
                    {sectionToggle('show_informations_generales')}
                  </div>
                </div>
                <div className="pb-8 border-b border-gray-100">
                  <h3 className="text-xl font-bold mb-4">A propos de ce logement</h3>
                  <p className="text-gray-600 leading-relaxed whitespace-pre-line">{bien.description || `Superbe ${bien.type}`}</p>
                </div>
              </div>
            ), 'border-b border-gray-100')}

            {block('show_caracteristiques', 'Caracteristiques', (
              <div className="py-8 border-b border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <h3 className="text-xl font-bold">Ce que propose ce logement</h3>
                  {sectionToggle('show_caracteristiques')}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {amenityRows.map((feature) => (
                    <div key={feature.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${Number(feature.visibilite_client) === 0 ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-transparent text-gray-700'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                          <Check size={16} className="text-emerald-600" />
                        </div>
                        <span>{feature.nom}</span>
                      </div>
                      {featureToggle(feature)}
                    </div>
                  ))}
                  {booleanFeatureTags.map((feature) => (
                    <div key={feature} className="flex items-center gap-3 text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                        <Check size={16} className="text-emerald-600" />
                      </div>
                      <span>{feature}</span>
                    </div>
                  ))}
                  {amenityRows.length === 0 && booleanFeatureTags.length === 0 ? <p className="text-sm text-gray-500">Aucune caracteristique visible.</p> : null}
                </div>
              </div>
            ))}

            {block('show_localisation', 'Localisation', (
              <div className="py-8 border-b border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <h3 className="text-xl font-bold">Ou se situe le logement</h3>
                  {sectionToggle('show_localisation')}
                </div>
                <div className="bg-gray-100 rounded-xl h-[300px] flex items-center justify-center relative overflow-hidden">
                  <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=1600&auto=format&fit=crop" alt="Map" className="w-full h-full object-cover opacity-50 grayscale" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-white p-4 rounded-full shadow-lg"><MapPin size={32} className="text-emerald-600" /></div>
                  </div>
                </div>
                <p className="mt-4 text-gray-600 text-sm">L'emplacement exact sera communique apres la reservation.</p>
              </div>
            ))}

            {block('show_disponibilites', 'Disponibilites', (
              <div className="py-8 border-t border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-2"><Calendar size={24} className="text-emerald-600" /><h3 className="text-xl font-bold">Disponibilites</h3></div>
                  {sectionToggle('show_disponibilites')}
                </div>
                <p className="text-gray-600 mb-6">Selectionnez vos dates pour voir les disponibilites et reserver votre sejour.</p>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">Calendrier client</div>
              </div>
            ))}
          </div>

          {block('show_booking_card', 'Reservation', (
            <div className="lg:col-span-1">
              <div className="sticky top-24 bg-white rounded-xl shadow-xl border border-gray-100 p-6">
                <div className="flex justify-between items-baseline mb-6">
                  <div>
                    <span className="text-2xl font-bold text-gray-900">{formatMoney(bien.prix_nuitee)} TND</span>
                    <span className="text-gray-500"> / nuit</span>
                  </div>
                  <div className="flex items-center gap-2">{sectionToggle('show_booking_card')}</div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Arrivee</label><input type="text" value="jj/mm/aaaa" readOnly className="w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-500" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Depart</label><input type="text" value="jj/mm/aaaa" readOnly className="w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-500" /></div>
                  </div>
                  <div><label className="block text-xs font-bold text-gray-700 uppercase mb-1">Voyageurs</label><div className="w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-700">1 voyageur</div></div>
                  <button type="button" className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-white font-semibold">Reserver</button>
                </div>
              </div>
            </div>
          ), 'lg:col-span-1')}
        </div>
      </div>
    </div>
  );
}
