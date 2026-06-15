import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Edit2, Expand, Image as ImageIcon, MapPin, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProperties } from '../../context/PropertiesContext';
import { SmartImage } from '../../components/SmartImage';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../../components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { resolveMediaUrl } from '../../utils/media';
import type { Bien, BienMode, BienStatut, PropertyPack, Zone } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const ADMIN_IMAGE_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23e5e7eb'/%3E%3Cpath d='M170 240l92-90 64 64 54-54 90 80H170z' fill='%23cbd5e1'/%3E%3Ccircle cx='250' cy='126' r='30' fill='%23cbd5e1'/%3E%3C/svg%3E";

type PropertyPackEditorState = {
  id: string | null;
  name: string;
  description: string;
  bienIds: string[];
  highlightBulletsText: string;
  galleryImages: string[];
};
type LocationLevel = 'gouvernerat' | 'region' | 'zone';

const EMPTY_PROPERTY_PACK: PropertyPackEditorState = {
  id: null,
  name: '',
  description: '',
  bienIds: [],
  highlightBulletsText: '',
  galleryImages: [],
};

const modeLabels: Record<BienMode, string> = {
  vente: 'Vente',
  location_annuelle: 'Location annuelle',
  location_saisonniere: 'Location saisonniere',
};
const statusColors: Record<BienStatut, string> = {
  disponible: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  loue: 'bg-blue-100 text-blue-800 border-blue-200',
  reserve: 'bg-amber-100 text-amber-800 border-amber-200',
  maintenance: 'bg-red-100 text-red-800 border-red-200',
  bloque: 'bg-gray-200 text-gray-800 border-gray-300',
};
const statusLabels: Record<BienStatut, string> = {
  disponible: 'Disponible',
  loue: 'Loue',
  reserve: 'Reserve',
  maintenance: 'Maintenance',
  bloque: 'Bloque',
};
const LOCATION_CARD_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 320'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23d1d5db'/%3E%3Cstop offset='1' stop-color='%239ca3af'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='320' fill='url(%23g)'/%3E%3C/svg%3E";

function normalizeLines(value: string) {
  return Array.from(
    new Set(
      String(value || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function getBienDisplayType(bien: Bien) {
  const rawType = String(bien.nom_application || bien.type || '').trim();
  const rawSubType = String(bien.residence_unit_sub_type || bien.configuration || '').trim();
  if (rawSubType && !rawType.toLowerCase().includes(rawSubType.toLowerCase())) {
    return `${rawType} ${rawSubType}`.trim();
  }
  return rawType || 'Bien';
}

function getBedroomLabel(bien: Bien) {
  const explicit = Number(bien.nb_chambres || 0);
  if (explicit > 0) return `${explicit} chambre${explicit > 1 ? 's' : ''}`;
  const typeValue = String(bien.residence_unit_sub_type || bien.type || '').trim().toUpperCase();
  const match = typeValue.match(/S\+(\d+)/);
  if (match?.[1]) {
    const count = Number(match[1]);
    return `${count} chambre${count > 1 ? 's' : ''}`;
  }
  return 'Configuration libre';
}

function getKeyFeatureLabels(bien: Bien) {
  const labels = new Set<string>();
  const seasonal = bien.location_saisonniere_config || null;
  const amenities = Array.isArray(bien.caracteristiques) ? bien.caracteristiques : [];
  if (bien.proche_plage || seasonal?.proche_plage || amenities.some((item) => /pied|plage|front de mer/i.test(String(item)))) labels.add("Pied dans l'eau");
  if (bien.vue_mer || seasonal?.vue_mer || amenities.some((item) => /vue mer/i.test(String(item)))) labels.add('Vue mer');
  if (seasonal?.distance_plage_m && Number(seasonal.distance_plage_m) <= 120) labels.add('Acces plage rapide');
  if (amenities.some((item) => /piscine/i.test(String(item)))) labels.add('Piscine');
  if (seasonal?.terrasse || bien.terrasse) labels.add('Terrasse');
  if (seasonal?.climatisation || bien.climatisation) labels.add('Climatisation');
  if (seasonal?.ascenseur || bien.ascenseur) labels.add('Ascenseur');
  return Array.from(labels).slice(0, 4);
}

function getBienLocationParts(bien: Bien, zonesById: Map<string, Zone>) {
  const linkedZone = zonesById.get(String(bien.zone_id || '').trim()) || null;
  const primary = String(linkedZone?.nom || bien.ville || bien.adresse || '').trim();
  const secondary = String(linkedZone?.region || linkedZone?.gouvernerat || '').trim();
  return [primary, secondary].filter(Boolean);
}

function PackSelectableBienCard({
  bien,
  selected,
  onToggle,
  featureLabels,
}: {
  bien: Bien;
  selected: boolean;
  onToggle: () => void;
  featureLabels: string[];
}) {
  const firstImageMedia = (bien.media || []).find((media) => media.type !== 'video');
  const mainImage = resolveMediaUrl(firstImageMedia?.url) || ADMIN_IMAGE_FALLBACK;
  const imageCount = bien.media?.length || 0;
  const zoneLabel = String(bien.ville || bien.adresse || '').trim();
  const nightly = Number(bien.prix_nuitee || 0);
  const weekly = Number(bien.prix_semaine || 0);
  const title = String(bien.nom_bien_mobile || bien.titre || 'Bien').trim();
  const reference = String(bien.reference || '').trim();

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`overflow-hidden rounded-[22px] border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        selected ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200 hover:border-amber-200'
      }`}
    >
      <div className="relative h-44 overflow-hidden bg-gray-100">
        <SmartImage
          src={mainImage}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          targetWidth={640}
          quality={60}
        />
        <div className="absolute left-3 top-3">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusColors[bien.statut]}`}>
            {statusLabels[bien.statut]}
          </span>
        </div>
        {imageCount > 1 ? (
          <div className="absolute right-3 top-3 rounded-lg bg-black/55 px-2 py-1 text-xs text-white">
            <ImageIcon className="mr-1 inline h-3 w-3" />
            {imageCount}
          </div>
        ) : null}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent p-3">
          <p className="text-lg font-bold text-white">
            {nightly} DT<span className="ml-0.5 text-xs font-normal text-white/80">/nuit</span>
          </p>
          {weekly > 0 ? <p className="text-xs font-medium text-white/90">{weekly} DT / semaine</p> : null}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="line-clamp-2 text-base font-semibold text-gray-900">{title}</p>
          {zoneLabel ? (
            <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate">{zoneLabel}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
            {reference || 'Sans reference'}
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
            {modeLabels[bien.mode] || 'Mode non precise'}
          </span>
          {selected ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Selectionne
            </span>
          ) : null}
        </div>
        {featureLabels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {featureLabels.map((feature) => (
              <span key={`${bien.id}-${feature}`} className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                {feature}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

export default function PropertyPacksAdminPage() {
  const { biens, zones, isLoading } = useProperties();
  const [propertyPacks, setPropertyPacks] = useState<PropertyPack[]>([]);
  const [propertyPackEditor, setPropertyPackEditor] = useState<PropertyPackEditorState>(EMPTY_PROPERTY_PACK);
  const [propertyPackSearch, setPropertyPackSearch] = useState('');
  const [propertyPackLocationFilter, setPropertyPackLocationFilter] = useState('all');
  const [locationSelectionStep, setLocationSelectionStep] = useState<LocationLevel>('gouvernerat');
  const [selectedGouvernerat, setSelectedGouvernerat] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [isLocationFilterOpen, setIsLocationFilterOpen] = useState(false);
  const [propertyPackActionId, setPropertyPackActionId] = useState<string | null>(null);
  const [galleryPreviewState, setGalleryPreviewState] = useState<{
    open: boolean;
    bienId: string;
    imageIndex: number;
  }>({ open: false, bienId: '', imageIndex: 0 });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/property-packs`, { credentials: 'include' });
        if (!response.ok) throw new Error('property-packs');
        const rows = await response.json();
        if (!cancelled) setPropertyPacks(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setPropertyPacks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const zonesById = useMemo(
    () => new Map((zones || []).map((zone: Zone) => [String(zone.id || '').trim(), zone])),
    [zones]
  );
  const normalizedSeasonalZones = useMemo(
    () =>
      (zones || [])
        .map((zone) => ({
          ...zone,
          gouvernerat: String(zone.gouvernerat || '').trim(),
          region: String(zone.region || '').trim(),
          quartier: String(zone.quartier || zone.nom || '').trim(),
          nom: String(zone.nom || '').trim(),
        }))
        .filter((zone) => zone.gouvernerat || zone.region || zone.quartier || zone.nom),
    [zones]
  );
  const gouverneratOptions = useMemo(
    () => Array.from(new Set(normalizedSeasonalZones.map((zone) => zone.gouvernerat).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr')),
    [normalizedSeasonalZones]
  );
  const regionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          normalizedSeasonalZones
            .filter((zone) => !selectedGouvernerat || zone.gouvernerat === selectedGouvernerat)
            .map((zone) => zone.region)
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, 'fr')),
    [normalizedSeasonalZones, selectedGouvernerat]
  );
  const zoneOptions = useMemo(
    () =>
      Array.from(
        new Map(
          normalizedSeasonalZones
            .filter((zone) => (!selectedGouvernerat || zone.gouvernerat === selectedGouvernerat) && (!selectedRegion || zone.region === selectedRegion))
            .map((zone) => {
              const label = zone.nom || zone.quartier || zone.region || zone.gouvernerat;
              const imageUrl = resolveMediaUrl(
                zone.quartier_image_url || zone.region_image_url || zone.gouvernerat_image_url || zone.image_url || ''
              ) || LOCATION_CARD_FALLBACK;
              return [label.toLowerCase(), { label, imageUrl }];
            })
        ).values()
      ).sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    [normalizedSeasonalZones, selectedGouvernerat, selectedRegion]
  );
  const currentLocationCardOptions = useMemo(() => {
    if (locationSelectionStep === 'gouvernerat') {
      return gouverneratOptions.map((label) => {
        const zone = normalizedSeasonalZones.find((item) => item.gouvernerat === label);
        return {
          value: label,
          label,
          imageUrl: resolveMediaUrl(zone?.gouvernerat_image_url || zone?.image_url || '') || LOCATION_CARD_FALLBACK,
        };
      });
    }
    if (locationSelectionStep === 'region') {
      return regionOptions.map((label) => {
        const zone = normalizedSeasonalZones.find(
          (item) => item.region === label && (!selectedGouvernerat || item.gouvernerat === selectedGouvernerat)
        );
        return {
          value: label,
          label,
          imageUrl: resolveMediaUrl(zone?.region_image_url || zone?.gouvernerat_image_url || zone?.image_url || '') || LOCATION_CARD_FALLBACK,
        };
      });
    }
    return zoneOptions.map((item) => ({ value: item.label, label: item.label, imageUrl: item.imageUrl }));
  }, [gouverneratOptions, regionOptions, zoneOptions, locationSelectionStep, normalizedSeasonalZones, selectedGouvernerat]);
  const locationStepMeta: Record<LocationLevel, { title: string; subtitle: string; stepLabel: string }> = {
    gouvernerat: { title: 'Gouvernorat', subtitle: 'Choisissez un gouvernorat.', stepLabel: '1/3' },
    region: { title: 'Region', subtitle: 'Choisissez une region.', stepLabel: '2/3' },
    zone: { title: 'Zone', subtitle: 'Choisissez une zone precise.', stepLabel: '3/3' },
  };

  const packLocationOptions = useMemo(() => {
    const options = new Map<string, { label: string; imageUrl: string }>();
    biens.forEach((bien) => {
      if (bien.mode !== 'location_saisonniere') return;
      const zone = zonesById.get(String(bien.zone_id || '').trim()) || null;
      const zoneName = String(zone?.nom || '').trim();
      const cityName = String(bien.ville || '').trim();
      const addressName = String(bien.adresse || '').trim();
      const locationLabel = zoneName || cityName || addressName;
      if (!locationLabel) return;
      const key = locationLabel.toLowerCase();
      if (!options.has(key)) {
        const imageUrl = resolveMediaUrl(
          zone?.quartier_image_url
          || zone?.region_image_url
          || zone?.gouvernerat_image_url
          || zone?.image_url
          || ''
        ) || LOCATION_CARD_FALLBACK;
        options.set(key, { label: locationLabel, imageUrl });
      }
    });
    return Array.from(options.entries())
      .map(([value, meta]) => ({ value, label: meta.label, imageUrl: meta.imageUrl }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }, [biens, zonesById]);
  const selectedLocationLabel = selectedZone || selectedRegion || selectedGouvernerat || 'Tous les emplacements';

  const filteredPackBiens = useMemo(() => {
    const query = propertyPackSearch.trim().toLowerCase();
    return biens.filter((bien) => {
      if (bien.mode !== 'location_saisonniere') return false;
      const linkedZone = zonesById.get(String(bien.zone_id || '').trim()) || null;
      const zoneName = String(linkedZone?.nom || '').trim();
      const cityName = String(bien.ville || '').trim();
      const addressName = String(bien.adresse || '').trim();
      const locationLabel = zoneName || cityName || addressName;
      const locationTokens = [
        locationLabel,
        linkedZone?.quartier,
        linkedZone?.region,
        linkedZone?.gouvernerat,
      ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
      if (propertyPackLocationFilter !== 'all' && !locationTokens.includes(propertyPackLocationFilter)) return false;
      if (!query) return true;
      const values = [
        bien.reference,
        bien.titre,
        bien.nom_bien_mobile || '',
        locationLabel,
        linkedZone?.quartier,
        linkedZone?.region,
        linkedZone?.gouvernerat,
        modeLabels[bien.mode] || '',
      ];
      return values.some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [biens, propertyPackSearch, propertyPackLocationFilter, zonesById]);

  const propertyPackBienLookup = useMemo(
    () => new Map(biens.map((bien) => [String(bien.id), bien])),
    [biens]
  );

  const resetPropertyPackEditor = () => setPropertyPackEditor(EMPTY_PROPERTY_PACK);

  const togglePropertyPackBien = (bienId: string) => {
    setPropertyPackEditor((current) => {
      const normalizedId = String(bienId || '').trim();
      if (!normalizedId) return current;
      const nextBienIds = current.bienIds.includes(normalizedId)
        ? current.bienIds.filter((id) => id !== normalizedId)
        : [...current.bienIds, normalizedId];
      return { ...current, bienIds: nextBienIds };
    });
  };
  const handleLocationLevelSelection = (value: string) => {
    if (locationSelectionStep === 'gouvernerat') {
      setSelectedGouvernerat(value);
      setSelectedRegion('');
      setSelectedZone('');
      setPropertyPackLocationFilter(value.toLowerCase());
      return;
    }
    if (locationSelectionStep === 'region') {
      setSelectedRegion(value);
      setSelectedZone('');
      setPropertyPackLocationFilter(value.toLowerCase());
      return;
    }
    setSelectedZone(value);
    setPropertyPackLocationFilter(value.toLowerCase());
  };
  const resetLocationSelection = () => {
    setSelectedGouvernerat('');
    setSelectedRegion('');
    setSelectedZone('');
    setLocationSelectionStep('gouvernerat');
    setPropertyPackLocationFilter('all');
    setIsLocationFilterOpen(false);
  };

  const handleEditPropertyPack = (pack: PropertyPack) => {
    setPropertyPackEditor({
      id: pack.id,
      name: String(pack.name || '').trim(),
      description: String(pack.description || '').trim(),
      bienIds: Array.isArray(pack.bienIds) ? pack.bienIds.map((item) => String(item || '').trim()).filter(Boolean) : [],
      highlightBulletsText: Array.isArray(pack.highlightBullets) ? pack.highlightBullets.join('\n') : '',
      galleryImages: Array.isArray(pack.galleryImages) ? pack.galleryImages.map((item) => String(item || '').trim()).filter(Boolean) : [],
    });
  };

  const handleSavePropertyPack = async () => {
    const name = propertyPackEditor.name.trim();
    const bienIds = Array.from(new Set(propertyPackEditor.bienIds.map((item) => String(item || '').trim()).filter(Boolean)));
    const highlightBullets = normalizeLines(propertyPackEditor.highlightBulletsText);
    const galleryImages = Array.from(new Set(propertyPackEditor.galleryImages.map((item) => String(item || '').trim()).filter(Boolean)));
    if (!name) {
      toast.error('Nom du pack requis');
      return;
    }
    if (bienIds.length === 0) {
      toast.error('Ajoutez au moins une reference au pack');
      return;
    }
    const targetId = propertyPackEditor.id || '__new_pack__';
    setPropertyPackActionId(targetId);
    try {
      const response = await fetch(
        propertyPackEditor.id ? `${API_URL}/property-packs/${encodeURIComponent(propertyPackEditor.id)}` : `${API_URL}/property-packs`,
        {
          method: propertyPackEditor.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name,
            description: propertyPackEditor.description.trim() || null,
            bienIds,
            highlightBullets,
            galleryImages,
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Impossible de sauvegarder le pack'));
      }
      const savedPack = payload as PropertyPack;
      setPropertyPacks((current) => {
        const others = current.filter((item) => item.id !== savedPack.id);
        return [savedPack, ...others];
      });
      resetPropertyPackEditor();
      toast.success(propertyPackEditor.id ? 'Pack mis a jour' : 'Pack cree');
    } catch (error: any) {
      toast.error(String(error?.message || 'Impossible de sauvegarder le pack'));
    } finally {
      setPropertyPackActionId(null);
    }
  };

  const selectedEditorBiens = useMemo(
    () => propertyPackEditor.bienIds.map((id) => propertyPackBienLookup.get(String(id || '').trim())).filter(Boolean) as Bien[],
    [propertyPackBienLookup, propertyPackEditor.bienIds]
  );

  const editorGalleryChoices = useMemo(() => {
    const seen = new Set<string>();
    return selectedEditorBiens.flatMap((bien) =>
      (bien.media || [])
        .filter((media) => media.type !== 'video')
        .map((media) => {
          const url = resolveMediaUrl(media.url) || '';
          if (!url || seen.has(url)) return null;
          seen.add(url);
          return {
            url,
            bienId: bien.id,
            title: String(bien.nom_bien_mobile || bien.titre || 'Bien').trim(),
            reference: String(bien.reference || '').trim(),
          };
        })
        .filter(Boolean) as Array<{ url: string; bienId: string; title: string; reference: string }>
    );
  }, [selectedEditorBiens]);

  const editorGalleryGroups = useMemo(
    () =>
      selectedEditorBiens.map((bien) => {
        const reference = String(bien.reference || '').trim() || 'Sans reference';
        const title = String(bien.nom_bien_mobile || bien.titre || 'Bien').trim();
        const locationParts = getBienLocationParts(bien, zonesById);
        const featureLabels = getKeyFeatureLabels(bien);
        const images = (bien.media || [])
          .filter((media) => media.type !== 'video')
          .map((media) => resolveMediaUrl(media.url) || '')
          .filter(Boolean)
          .map((url) => ({ url }));
        return {
          bienId: bien.id,
          reference,
          title,
          typeLabel: getBienDisplayType(bien),
          bedroomLabel: getBedroomLabel(bien),
          locationParts,
          featureLabels,
          images,
        };
      }).filter((group) => group.images.length > 0),
    [selectedEditorBiens, zonesById]
  );

  const activeGalleryPreviewGroup = useMemo(
    () => editorGalleryGroups.find((group) => group.bienId === galleryPreviewState.bienId) || null,
    [editorGalleryGroups, galleryPreviewState.bienId]
  );

  const activeGalleryPreviewImage = activeGalleryPreviewGroup?.images?.[galleryPreviewState.imageIndex] || null;

  const toggleGalleryImageSelection = (imageUrl: string) => {
    setPropertyPackEditor((current) => {
      const selected = current.galleryImages.includes(imageUrl);
      return {
        ...current,
        galleryImages: selected
          ? current.galleryImages.filter((item) => item !== imageUrl)
          : [...current.galleryImages, imageUrl],
      };
    });
  };

  const editorLocationPreview = useMemo(() => {
    const ordered = Array.from(
      new Set(
        selectedEditorBiens.flatMap((bien) => getBienLocationParts(bien, zonesById))
      )
    );
    return ordered.slice(0, 2);
  }, [selectedEditorBiens, zonesById]);

  const handleDeletePropertyPack = async (pack: PropertyPack) => {
    if (!window.confirm(`Supprimer le pack "${pack.name}" ?`)) return;
    setPropertyPackActionId(pack.id);
    try {
      const response = await fetch(`${API_URL}/property-packs/${encodeURIComponent(pack.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Impossible de supprimer le pack'));
      }
      setPropertyPacks((current) => current.filter((item) => item.id !== pack.id));
      setPropertyPackEditor((current) => current.id === pack.id ? EMPTY_PROPERTY_PACK : current);
      toast.success('Pack supprime');
    } catch (error: any) {
      toast.error(String(error?.message || 'Impossible de supprimer le pack'));
    } finally {
      setPropertyPackActionId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/admin/biens"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour biens
            </Link>
          </div>
          <h1 className="mt-3 text-xl font-bold text-gray-900 sm:text-2xl">Packs de biens</h1>
          <p className="text-xs text-gray-500 sm:text-sm">Page dediee pour combiner plusieurs references visibles sous un meme nom cote client.</p>
        </div>
        <button
          type="button"
          onClick={resetPropertyPackEditor}
          className="inline-flex items-center justify-center rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nouveau pack
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">Nom du pack</span>
              <input
                type="text"
                value={propertyPackEditor.name}
                onChange={(event) => setPropertyPackEditor((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ex: Pack famille Kelibia"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">Description courte</span>
              <textarea
                value={propertyPackEditor.description}
                onChange={(event) => setPropertyPackEditor((current) => ({ ...current, description: event.target.value }))}
                placeholder="Court texte visible dans la page packs."
                rows={3}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">Points visibles sur la card</span>
              <textarea
                value={propertyPackEditor.highlightBulletsText}
                onChange={(event) => setPropertyPackEditor((current) => ({ ...current, highlightBulletsText: event.target.value }))}
                placeholder={"Une ligne = un point visible\nREF-243 - Appartement S+3 - 3 chambres\nVue mer, piscine, acces plage"}
                rows={4}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_52%,#eefbf6_100%)] p-4 shadow-sm">
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Apercu public</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">Le rendu du pack cote client</h3>
            </div>
            <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
              <div className="relative h-52 overflow-hidden bg-slate-100">
                <SmartImage
                  src={propertyPackEditor.galleryImages[0] || editorGalleryChoices[0]?.url || ADMIN_IMAGE_FALLBACK}
                  alt={propertyPackEditor.name || 'Apercu pack'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  targetWidth={900}
                  quality={60}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent" />
                <div className="absolute left-4 top-4 rounded-full bg-emerald-600 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
                  Pack principal
                </div>
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <h3 className="text-3xl font-black leading-tight">{propertyPackEditor.name || 'Nom du pack'}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {editorLocationPreview.map((item) => (
                      <span key={item} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <p className="text-sm leading-7 text-slate-600">
                  {propertyPackEditor.description.trim() || 'Ajoutez une description claire du pack, du style de sejour et du type de combinaison que vous voulez mettre en avant.'}
                </p>
                <div className="space-y-2">
                  {normalizeLines(propertyPackEditor.highlightBulletsText).slice(0, 4).map((line) => (
                    <div key={line} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{line}</span>
                    </div>
                  ))}
                  {normalizeLines(propertyPackEditor.highlightBulletsText).length === 0 && selectedEditorBiens.slice(0, 3).map((bien) => (
                    <div key={bien.id} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{`${String(bien.reference || '').trim()} - ${getBienDisplayType(bien)} - ${getBedroomLabel(bien)}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#fff8e8_0%,#ffffff_55%,#eefbf6_100%)] p-4 shadow-sm">
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Recherche biens</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">Trouvez rapidement les biens a ajouter au pack</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)]">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Recherche reference</span>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={propertyPackSearch}
                    onChange={(event) => setPropertyPackSearch(event.target.value)}
                    placeholder="REF, titre, nom mobile..."
                    className="block w-full bg-transparent py-3 pl-11 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Ou cherchez vous ?</span>
                <Popover open={isLocationFilterOpen} onOpenChange={setIsLocationFilterOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">Emplacement selectionne</p>
                        <p className="truncate text-sm font-semibold text-slate-900">{selectedLocationLabel}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[720px] max-w-[calc(100vw-2rem)] rounded-[28px] border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                    <Command className="rounded-2xl">
                      <div className="mb-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Tunisie</p>
                        <h3 className="mt-2 text-lg font-bold text-slate-900">{locationStepMeta[locationSelectionStep].title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{locationStepMeta[locationSelectionStep].subtitle}</p>
                      </div>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                          Etape {locationStepMeta[locationSelectionStep].stepLabel}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (locationSelectionStep === 'zone') {
                                setLocationSelectionStep('region');
                                setSelectedZone('');
                                setPropertyPackLocationFilter(selectedRegion ? selectedRegion.toLowerCase() : 'all');
                                return;
                              }
                              if (locationSelectionStep === 'region') {
                                setLocationSelectionStep('gouvernerat');
                                setSelectedRegion('');
                                setPropertyPackLocationFilter(selectedGouvernerat ? selectedGouvernerat.toLowerCase() : 'all');
                              }
                            }}
                            disabled={locationSelectionStep === 'gouvernerat'}
                            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Precedent
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (locationSelectionStep === 'gouvernerat' && selectedGouvernerat) {
                                setLocationSelectionStep('region');
                                return;
                              }
                              if (locationSelectionStep === 'region' && selectedRegion) {
                                setLocationSelectionStep('zone');
                                return;
                              }
                              if (locationSelectionStep === 'zone') {
                                setIsLocationFilterOpen(false);
                              }
                            }}
                            disabled={(locationSelectionStep === 'gouvernerat' && !selectedGouvernerat) || (locationSelectionStep === 'region' && !selectedRegion)}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {locationSelectionStep === 'zone' ? 'Confirmer' : 'Suivant'}
                          </button>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-white/80 bg-white shadow-sm">
                        <CommandInput placeholder="Rechercher un emplacement..." />
                      </div>
                      <CommandList className="mt-4 max-h-[420px]">
                        <CommandEmpty>Aucun emplacement trouve.</CommandEmpty>
                        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <button
                            type="button"
                            onClick={resetLocationSelection}
                            className={`rounded-2xl px-4 py-3 text-left text-sm transition-colors ${
                              propertyPackLocationFilter === 'all'
                                ? 'bg-emerald-50 font-semibold text-emerald-700'
                                : 'border border-emerald-200 bg-white text-slate-700 hover:bg-emerald-50'
                            }`}
                          >
                            Tous les emplacements
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          {currentLocationCardOptions.map((option) => {
                            const isSelected =
                              locationSelectionStep === 'gouvernerat'
                                ? selectedGouvernerat === option.value
                                : locationSelectionStep === 'region'
                                  ? selectedRegion === option.value
                                  : selectedZone === option.value;
                            return (
                              <CommandItem
                                key={option.value}
                                value={option.label}
                                onSelect={() => {
                                  handleLocationLevelSelection(option.value);
                                }}
                                className="rounded-none bg-transparent p-0 data-[selected=true]:bg-transparent data-[selected=true]:text-inherit"
                              >
                                <div className={`group relative h-28 w-full overflow-hidden rounded-2xl border text-left transition-all duration-200 ${
                                  isSelected
                                    ? 'border-emerald-300 ring-2 ring-emerald-200'
                                    : 'border-slate-200 hover:border-emerald-200'
                                }`}>
                                  <img src={option.imageUrl} alt={option.label} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                                  <div className={`absolute inset-0 ${isSelected ? 'bg-emerald-950/25' : 'bg-black/35'}`} />
                                  <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl bg-white/92 shadow-sm">
                                    {isSelected ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                                  </div>
                                  <div className="relative z-10 flex h-full items-center p-4">
                                    <span className="inline-flex max-w-[80%] rounded-2xl bg-slate-900/50 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm">
                                      {option.label}
                                    </span>
                                  </div>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </div>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">References du pack</p>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                {propertyPackEditor.bienIds.length} selection{propertyPackEditor.bienIds.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid max-h-[38rem] grid-cols-1 gap-4 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
              {filteredPackBiens.map((bien) => {
                const isSelected = propertyPackEditor.bienIds.includes(String(bien.id));
                return (
                  <PackSelectableBienCard
                    key={`pack-bien-${bien.id}`}
                    bien={bien}
                    selected={isSelected}
                    onToggle={() => togglePropertyPackBien(String(bien.id))}
                    featureLabels={getKeyFeatureLabels(bien)}
                  />
                );
              })}
              {filteredPackBiens.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-sm text-gray-500 md:col-span-2 xl:col-span-3">
                  Aucun bien ne correspond a la recherche.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Galerie du pack</p>
                <p className="text-xs text-gray-500">Selection courte en haut, bibliotheque compacte en bas.</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                {propertyPackEditor.galleryImages.length} image{propertyPackEditor.galleryImages.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-4">
              <div className="rounded-[22px] border border-emerald-100 bg-[linear-gradient(135deg,#f6fffb_0%,#ffffff_100%)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Selection du pack</p>
                    <p className="mt-1 text-xs text-slate-500">La premiere image sera la cover du pack.</p>
                  </div>
                  {propertyPackEditor.galleryImages.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPropertyPackEditor((current) => ({ ...current, galleryImages: [] }))}
                      className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Vider
                    </button>
                  ) : null}
                </div>

                {propertyPackEditor.galleryImages.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {propertyPackEditor.galleryImages.map((imageUrl, index) => {
                      const meta = editorGalleryChoices.find((item) => item.url === imageUrl);
                      return (
                        <div
                          key={`${imageUrl}-${index}`}
                          className="min-w-[148px] max-w-[148px] overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"
                        >
                          <div className="relative h-24 overflow-hidden bg-slate-100">
                            <SmartImage
                              src={imageUrl}
                              alt={meta?.title || `Image ${index + 1}`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              targetWidth={320}
                              quality={54}
                            />
                            <div className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-black text-slate-900 shadow-sm">
                              #{index + 1}
                            </div>
                          </div>
                          <div className="space-y-2 p-2.5">
                            <p className="truncate text-[11px] font-bold text-slate-900">{meta?.reference || 'Sans reference'}</p>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setPropertyPackEditor((current) => {
                                    if (index === 0) return current;
                                    const next = [...current.galleryImages];
                                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                    return { ...current, galleryImages: next };
                                  })
                                }
                                disabled={index === 0}
                                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Monter
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPropertyPackEditor((current) => {
                                    if (index >= current.galleryImages.length - 1) return current;
                                    const next = [...current.galleryImages];
                                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                    return { ...current, galleryImages: next };
                                  })
                                }
                                disabled={index >= propertyPackEditor.galleryImages.length - 1}
                                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Descendre
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPropertyPackEditor((current) => ({
                                    ...current,
                                    galleryImages: current.galleryImages.filter((item) => item !== imageUrl),
                                  }))
                                }
                                className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                              >
                                Retirer
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-4 py-5 text-sm text-slate-500">
                    Aucune image selectionnee. Cliquez sur les miniatures de la bibliotheque pour les ajouter.
                  </div>
                )}
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">Bibliotheque par reference</p>
                    <p className="mt-1 text-xs text-slate-500">Chaque bloc correspond a une reference. Choisissez seulement les photos a montrer pour ce bien dans le pack.</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                    {editorGalleryChoices.length} photo{editorGalleryChoices.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
                  {editorGalleryGroups.map((group) => (
                    <div key={group.bienId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900">{group.reference}</p>
                            <p className="truncate text-sm text-slate-600">{group.title}</p>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                              {[group.typeLabel, group.bedroomLabel, ...group.locationParts].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.featureLabels.map((feature) => (
                              <span key={`${group.bienId}-${feature}`} className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                {feature}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
                        {group.images.map((image, imageIndex) => {
                          const selected = propertyPackEditor.galleryImages.includes(image.url);
                          return (
                            <button
                              key={image.url}
                              type="button"
                              onClick={() => toggleGalleryImageSelection(image.url)}
                              className={`overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                                selected ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="relative h-24 overflow-hidden bg-slate-100">
                                <SmartImage
                                  src={image.url}
                                  alt={`${group.title} ${imageIndex + 1}`}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  fetchPriority="low"
                                  targetWidth={320}
                                  quality={52}
                                />
                                {selected ? (
                                  <div className="absolute right-1.5 top-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                                    {propertyPackEditor.galleryImages.indexOf(image.url) + 1}
                                  </div>
                                ) : null}
                              </div>
                              <div className="p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] font-semibold text-slate-500">
                                    Image {imageIndex + 1} · {selected ? 'selectionnee' : 'non selectionnee'}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setGalleryPreviewState({ open: true, bienId: group.bienId, imageIndex });
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                                  >
                                    <Expand className="h-3 w-3" />
                                    Voir
                                  </button>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {editorGalleryGroups.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                Selectionnez d&apos;abord des biens avec photos pour composer la galerie du pack.
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSavePropertyPack()}
              disabled={propertyPackActionId === (propertyPackEditor.id || '__new_pack__')}
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {propertyPackActionId === (propertyPackEditor.id || '__new_pack__')
                ? 'Enregistrement...'
                : propertyPackEditor.id ? 'Mettre a jour le pack' : 'Creer le pack'}
            </button>
            {propertyPackEditor.id && (
              <button
                type="button"
                onClick={resetPropertyPackEditor}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler edition
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Packs enregistres</h2>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{propertyPacks.length}</span>
          </div>
          {propertyPacks.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
              Aucun pack cree pour le moment.
            </div>
          )}
          <div className="space-y-3">
            {propertyPacks.map((pack) => {
              const linkedBiens = Array.isArray(pack.bienIds)
                ? pack.bienIds.map((id) => propertyPackBienLookup.get(String(id || '').trim())).filter(Boolean)
                : [];
              const coverImage =
                pack.galleryImages?.[0]
                || linkedBiens.flatMap((bien) => (bien?.media || []).filter((media) => media.type !== 'video').map((media) => resolveMediaUrl(media.url) || '')).find(Boolean)
                || ADMIN_IMAGE_FALLBACK;
              const locationPills = Array.from(new Set(linkedBiens.flatMap((bien) => getBienLocationParts(bien as Bien, zonesById)))).slice(0, 2);
              const previewBullets = (Array.isArray(pack.highlightBullets) && pack.highlightBullets.length > 0
                ? pack.highlightBullets
                : linkedBiens.slice(0, 3).map((bien) =>
                    `${String((bien as Bien).reference || '').trim()} - ${getBienDisplayType(bien as Bien)} - ${getBedroomLabel(bien as Bien)}`
                  )
              ).slice(0, 3);
              return (
                <div key={pack.id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  <div className="relative h-36 overflow-hidden bg-slate-100">
                    <SmartImage
                      src={coverImage}
                      alt={pack.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      targetWidth={720}
                      quality={56}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                      <h3 className="text-base font-black">{pack.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {locationPills.map((item) => (
                          <span key={item} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {pack.description ? <p className="text-sm text-gray-500">{pack.description}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditPropertyPack(pack)}
                        className="rounded-md border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-100"
                        title="Modifier le pack"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeletePropertyPack(pack)}
                        disabled={propertyPackActionId === pack.id}
                        className="rounded-md border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                        title="Supprimer le pack"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {previewBullets.map((bullet) => (
                      <div key={`${pack.id}-${bullet}`} className="flex items-start gap-2 text-xs text-slate-700">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {linkedBiens.length > 0 ? linkedBiens.map((bien) => (
                      <span key={`${pack.id}-${bien!.id}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {[String(bien!.reference || '').trim(), getBienDisplayType(bien as Bien)].filter(Boolean).join(' · ')}
                      </span>
                    )) : (
                      <span className="text-xs text-gray-400">Aucune reference resolue</span>
                    )}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog
        open={galleryPreviewState.open}
        onOpenChange={(open) => {
          if (!open) setGalleryPreviewState({ open: false, bienId: '', imageIndex: 0 });
        }}
      >
        <DialogContent className="!left-2 !top-2 !right-2 !bottom-2 !h-auto !w-auto !max-w-none !translate-x-0 !translate-y-0 gap-0 rounded-[24px] border-0 bg-slate-950 p-0 text-white shadow-[0_30px_90px_rgba(0,0,0,0.45)] [&_[data-slot='dialog-close-button']]:right-5 [&_[data-slot='dialog-close-button']]:top-5 [&_[data-slot='dialog-close-button']]:z-20 [&_[data-slot='dialog-close-button']]:text-white [&_[data-slot='dialog-close-button']]:opacity-90">
          <DialogTitle className="sr-only">Visualisation grande image pack</DialogTitle>
          <DialogDescription className="sr-only">Apercu grand format et selection d&apos;image pour le pack.</DialogDescription>

          {activeGalleryPreviewGroup && activeGalleryPreviewImage ? (
            <div className="flex h-full min-h-0 flex-col lg:flex-row">
              <div className="relative flex min-h-[44vh] flex-1 items-center justify-center overflow-hidden bg-black px-10 py-8 sm:px-16 lg:min-h-0 lg:px-20 lg:py-10 xl:px-24">
                <button
                  type="button"
                  onClick={() =>
                    setGalleryPreviewState((current) => ({
                      ...current,
                      imageIndex: Math.max(0, current.imageIndex - 1),
                    }))
                  }
                  disabled={galleryPreviewState.imageIndex === 0}
                  className="absolute left-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-sm hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGalleryPreviewState((current) => ({
                      ...current,
                      imageIndex: Math.min((activeGalleryPreviewGroup.images.length || 1) - 1, current.imageIndex + 1),
                    }))
                  }
                  disabled={galleryPreviewState.imageIndex >= activeGalleryPreviewGroup.images.length - 1}
                  className="absolute right-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-sm hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <SmartImage
                  src={activeGalleryPreviewImage.url}
                  alt={`${activeGalleryPreviewGroup.title} ${galleryPreviewState.imageIndex + 1}`}
                  className="h-auto max-h-[58vh] w-auto max-w-full rounded-[20px] object-contain lg:max-h-[90vh]"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  targetWidth={1400}
                  quality={74}
                />
                <div className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                  {galleryPreviewState.imageIndex + 1} / {activeGalleryPreviewGroup.images.length}
                </div>
              </div>

              <div className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-white/10 bg-slate-950/96 p-5 lg:h-full lg:w-[380px] lg:border-l lg:border-t-0 xl:w-[430px]">
                <div>
                  <p className="text-sm font-black text-white">{activeGalleryPreviewGroup.reference}</p>
                  <p className="mt-1 text-sm text-slate-300">{activeGalleryPreviewGroup.title}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {[activeGalleryPreviewGroup.typeLabel, activeGalleryPreviewGroup.bedroomLabel, ...activeGalleryPreviewGroup.locationParts].filter(Boolean).join(' · ')}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {activeGalleryPreviewGroup.featureLabels.map((feature) => (
                    <span key={`${activeGalleryPreviewGroup.bienId}-${feature}`} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                      {feature}
                    </span>
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => toggleGalleryImageSelection(activeGalleryPreviewImage.url)}
                    className={`inline-flex min-h-16 items-center justify-center rounded-xl px-4 py-3 text-center text-sm font-bold transition sm:flex-1 ${
                      propertyPackEditor.galleryImages.includes(activeGalleryPreviewImage.url)
                        ? 'bg-rose-500 text-white hover:bg-rose-600'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {propertyPackEditor.galleryImages.includes(activeGalleryPreviewImage.url) ? 'Retirer du pack' : 'Selectionner pour le pack'}
                  </button>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-slate-300 sm:min-w-[168px]">
                    Position actuelle:
                    <span className="ml-1 text-white">
                      {propertyPackEditor.galleryImages.includes(activeGalleryPreviewImage.url)
                        ? `#${propertyPackEditor.galleryImages.indexOf(activeGalleryPreviewImage.url) + 1}`
                        : 'non selectionnee'}
                    </span>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Miniatures</p>
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-3">
                    {activeGalleryPreviewGroup.images.map((image, index) => {
                      const selected = propertyPackEditor.galleryImages.includes(image.url);
                      const current = index === galleryPreviewState.imageIndex;
                      return (
                        <button
                          key={`${image.url}-${index}`}
                          type="button"
                          onClick={() => setGalleryPreviewState((prev) => ({ ...prev, imageIndex: index }))}
                          className={`relative overflow-hidden rounded-xl border ${
                            current ? 'border-white ring-2 ring-white/50' : 'border-white/10'
                          }`}
                        >
                          <SmartImage
                            src={image.url}
                            alt={`${activeGalleryPreviewGroup.title} ${index + 1}`}
                            className="h-20 w-full object-cover"
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                            targetWidth={240}
                            quality={46}
                          />
                          {selected ? (
                            <div className="absolute right-1.5 top-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {propertyPackEditor.galleryImages.indexOf(image.url) + 1}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
