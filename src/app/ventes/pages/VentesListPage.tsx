import { Link, useNavigate } from 'react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useProperties } from '../../context/PropertiesContext';
import { Bien } from '../../admin/types';
import {
  ArrowUpRight,
  BadgeDollarSign,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Filter,
  Home,
  Landmark,
  MapPin,
  Phone,
  Ruler,
  Search,
  SlidersHorizontal,
  Trees,
  X,
} from 'lucide-react';
import { buildTelLink } from '../../utils/deepLinks';
import { resolveMediaUrl } from '../../utils/media';
import { buildApiUrl } from '../../utils/api';

const typeLabel: Record<string, string> = {
  appartement: 'Appartement',
  villa_maison: 'Villa / Maison',
  studio: 'Studio',
  immeuble: 'Immeuble',
  terrain: 'Terrain',
  lotissement: 'Lotissement',
  local_commercial: 'Local commercial',
};

const typeIconMap: Record<string, typeof Home> = {
  appartement: Home,
  villa_maison: Home,
  studio: Home,
  immeuble: Building2,
  terrain: Trees,
  lotissement: Landmark,
  local_commercial: Building2,
};

type FilterDropdownOption = {
  value: string;
  label: string;
  icon: typeof Home;
};

const DEFAULT_CONTACT_PHONE = '+21652080695';
const HERO_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%230f172a'/%3E%3Cstop offset='1' stop-color='%23134e4a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1600' height='900' fill='url(%23g)'/%3E%3Cpath d='M180 620l250-210 180 155 150-120 270 175H180z' fill='rgba(255,255,255,0.14)'/%3E%3Ccircle cx='1180' cy='220' r='88' fill='rgba(255,255,255,0.08)'/%3E%3C/svg%3E";
const CARD_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23dbe4ea'/%3E%3Cpath d='M220 560l180-180 120 120 110-110 170 150H220z' fill='%23b9c5d1'/%3E%3Ccircle cx='430' cy='260' r='56' fill='%23b9c5d1'/%3E%3C/svg%3E";

const normalizeText = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizePhone = (value?: string | null) => String(value || '').replace(/[^\d+]/g, '');

function getPublicPrice(bien: Bien) {
  if (bien.type === 'terrain') {
    if (bien.terrain_mode_affichage_prix === 'm2_uniquement') {
      return {
        value: Number(bien.terrain_prix_affiche_par_m2 || 0),
        suffix: '/m2',
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

function getSurfaceSummary(bien: Bien) {
  if (bien.type === 'terrain') {
    return bien.terrain_surface_m2 ? `${bien.terrain_surface_m2} m2` : 'Surface sur demande';
  }
  if (bien.type === 'lotissement') {
    return bien.lotissement_nb_terrains ? `${bien.lotissement_nb_terrains} terrains` : 'Lotissement';
  }
  if (bien.type === 'immeuble') {
    return bien.immeuble_surface_batie_m2 ? `${bien.immeuble_surface_batie_m2} m2 batis` : 'Immeuble';
  }
  if (bien.superficie_m2) return `${bien.superficie_m2} m2`;
  return 'Surface sur demande';
}

function getCommercialMeta(bien: Bien) {
  if (bien.type === 'immeuble') {
    return `${bien.immeuble_nb_appartements || 0} appartements`;
  }
  if (bien.type === 'lotissement') {
    return `${bien.lotissement_nb_terrains || 0} lots`;
  }
  if (bien.type === 'terrain') {
    return bien.terrain_facade_m ? `${bien.terrain_facade_m} m facade` : 'Terrain a visiter';
  }
  if (bien.nb_chambres) return `${bien.nb_chambres} chambres`;
  return 'Visite conseillee';
}

function getPaymentLabel(bien: Bien) {
  return bien.modalite_paiement_vente === 'facilite' ? 'Facilite de paiement' : 'Comptant';
}

function getSaleCardImage(bien: Bien) {
  const gallery = (bien.media || []).filter((item) => !String(item.motif_upload || '').startsWith('preuve_type_'));
  return resolveMediaUrl(gallery[0]?.url) || CARD_FALLBACK;
}

function FilterDropdown({
  label,
  value,
  onChange,
  options,
  isOpen,
  onToggle,
  onClose,
  fieldIcon: FieldIcon,
}: {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  options: FilterDropdownOption[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  fieldIcon: typeof Home;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) || options[0];
  const SelectedIcon = selectedOption?.icon || FieldIcon;

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-12 w-full items-center gap-3 rounded-2xl border px-4 text-left text-sm shadow-sm transition ${
          isOpen
            ? 'border-emerald-300 bg-white ring-4 ring-emerald-100'
            : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <SelectedIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{selectedOption?.label || 'Choisir'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-30 overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
          <div className="max-h-72 overflow-y-auto pr-1">
            <div className="space-y-1">
              {options.map((option) => {
                const OptionIcon = option.icon || FieldIcon;
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      onClose();
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                      selected
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    role="option"
                    aria-selected={selected}
                  >
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      selected ? 'bg-white text-emerald-700 shadow-sm' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <OptionIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{option.label}</span>
                    {selected ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function VentesListPage() {
  const navigate = useNavigate();
  const { biens, zones, proprietaires, isLoading } = useProperties();
  const [heroSettings, setHeroSettings] = useState<{ imageUrl: string; title: string; subtitle: string }>({
    imageUrl: '',
    title: '',
    subtitle: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedZone, setSelectedZone] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState('all');
  const [budgetMax, setBudgetMax] = useState('');
  const [surfaceMin, setSurfaceMin] = useState('');
  const [bedroomsMin, setBedroomsMin] = useState('');
  const [facadeMin, setFacadeMin] = useState('');
  const [openDropdown, setOpenDropdown] = useState<'type' | 'zone' | 'payment' | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const venteBiens = useMemo(
    () =>
      biens
        .filter((bien) => bien.mode === 'vente' && bien.visible_sur_site !== false && bien.statut === 'disponible')
        .sort((a, b) => Number(b.date_ajout || 0) - Number(a.date_ajout || 0)),
    [biens]
  );

  const featuredBien = venteBiens[0] || null;
  const heroImage = heroSettings.imageUrl || (featuredBien ? getSaleCardImage(featuredBien) : HERO_FALLBACK);
  const defaultHeroTitle = 'Biens a vendre';
  const defaultHeroSubtitle = 'Parcourez les references disponibles, filtrez rapidement et ouvrez la fiche complete pour engager une visite.';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(buildApiUrl('/sales-hero-settings'), { credentials: 'include' });
        if (!response.ok) throw new Error('sales-hero-settings');
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        setHeroSettings({
          imageUrl: resolveMediaUrl(String(payload?.image_url || '').trim()) || '',
          title: String(payload?.title || '').trim(),
          subtitle: String(payload?.subtitle || '').trim(),
        });
      } catch {
        if (!cancelled) {
          setHeroSettings({ imageUrl: '', title: '', subtitle: '' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const zoneOptions = useMemo(() => {
    const values = new Map<string, string>();
    venteBiens.forEach((bien) => {
      const zoneName = zones.find((zone) => zone.id === bien.zone_id)?.nom;
      if (!zoneName) return;
      const token = normalizeText(zoneName);
      if (token && !values.has(token)) values.set(token, zoneName);
    });
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  }, [venteBiens, zones]);

  const typeDropdownOptions = useMemo<FilterDropdownOption[]>(
    () => [
      { value: 'all', label: 'Tous les types', icon: Home },
      ...Object.entries(typeLabel).map(([value, label]) => ({
        value,
        label,
        icon: typeIconMap[value] || Home,
      })),
    ],
    []
  );

  const zoneDropdownOptions = useMemo<FilterDropdownOption[]>(
    () => [
      { value: 'all', label: 'Toutes les zones', icon: MapPin },
      ...zoneOptions.map((zone) => ({
        value: zone,
        label: zone,
        icon: MapPin,
      })),
    ],
    [zoneOptions]
  );

  const paymentDropdownOptions = useMemo<FilterDropdownOption[]>(
    () => [
      { value: 'all', label: 'Tous les paiements', icon: BadgeDollarSign },
      { value: 'comptant', label: 'Comptant', icon: BadgeDollarSign },
      { value: 'facilite', label: 'Facilite', icon: Landmark },
    ],
    []
  );

  const filteredBiens = useMemo(() => {
    const budgetValue = Number(budgetMax || 0);
    const surfaceMinValue = Number(surfaceMin || 0);
    const bedroomsMinValue = Number(bedroomsMin || 0);
    const facadeMinValue = Number(facadeMin || 0);
    const normalizedSearch = normalizeText(searchTerm);
    return venteBiens.filter((bien) => {
      const zoneName = zones.find((zone) => zone.id === bien.zone_id)?.nom || '';
      const haystack = [
        bien.titre,
        bien.reference,
        zoneName,
        typeLabel[bien.type] || bien.type,
        bien.description,
      ]
        .map((item) => normalizeText(item))
        .join(' ');
      const publicPrice = getPublicPrice(bien);
      if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
      if (selectedType !== 'all' && bien.type !== selectedType) return false;
      if (selectedZone !== 'all' && normalizeText(zoneName) !== normalizeText(selectedZone)) return false;
      if (selectedPayment !== 'all' && (bien.modalite_paiement_vente || 'comptant') !== selectedPayment) return false;
      if (budgetValue > 0 && publicPrice.value > budgetValue) return false;
      if (surfaceMinValue > 0) {
        const bienSurface = Number(bien.terrain_surface_m2 || bien.immeuble_surface_batie_m2 || bien.superficie_m2 || 0);
        if (bienSurface < surfaceMinValue) return false;
      }
      if (bedroomsMinValue > 0 && Number(bien.nb_chambres || 0) < bedroomsMinValue) return false;
      if (facadeMinValue > 0) {
        const bienFacade = Number(bien.terrain_facade_m || bien.facade_m || 0);
        if (bienFacade < facadeMinValue) return false;
      }
      return true;
    });
  }, [bedroomsMin, budgetMax, facadeMin, searchTerm, selectedPayment, selectedType, selectedZone, surfaceMin, venteBiens, zones]);

  const activeFiltersCount = [
    searchTerm.trim(),
    selectedType !== 'all' ? selectedType : '',
    selectedZone !== 'all' ? selectedZone : '',
    selectedPayment !== 'all' ? selectedPayment : '',
    budgetMax.trim(),
    surfaceMin.trim(),
    bedroomsMin.trim(),
    facadeMin.trim(),
  ].filter(Boolean).length;

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedType('all');
    setSelectedZone('all');
    setSelectedPayment('all');
    setBudgetMax('');
    setSurfaceMin('');
    setBedroomsMin('');
    setFacadeMin('');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef3f6] text-slate-950">
      <section className="relative overflow-hidden border-b border-slate-200 text-white">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${heroImage}")` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,12,24,0.90)_0%,rgba(7,12,24,0.75)_38%,rgba(8,47,73,0.52)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_24%),radial-gradient(circle_at_left,rgba(255,255,255,0.10),transparent_30%)]" />

        <div className="relative mx-auto max-w-7xl px-4 pb-7 pt-20 md:px-6 md:pb-12 md:pt-24">
          <button
            type="button"
            onClick={handleGoBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-white/15"
          >
            <ChevronLeft size={16} />
            Retour
          </button>

          <div className="mt-4 max-w-3xl md:mt-8">
            <div className="rounded-[1.75rem] border border-white/12 bg-black/20 px-4 py-4 backdrop-blur-[4px] sm:rounded-[2rem] sm:bg-black/15 sm:p-1 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-0">
              <div className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100">
                Collection ventes
              </div>
              <h1 className="mt-4 max-w-2xl text-[2.6rem] font-bold leading-[0.98] md:text-6xl">
                {heroSettings.title || defaultHeroTitle}
              </h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-200 md:mt-4 md:text-lg">
                {heroSettings.subtitle || defaultHeroSubtitle}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-8 max-w-7xl px-4 md:px-6">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 md:px-6 md:py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <SlidersHorizontal size={18} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Recherche vente</p>
                <h2 className="text-base font-semibold text-slate-950 md:text-lg">Filtres</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                <Filter className="h-4 w-4" />
                {filteredBiens.length} resultat{filteredBiens.length > 1 ? 's' : ''}
              </span>
              {activeFiltersCount > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  Reinitialiser
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 px-4 py-4 md:grid-cols-2 md:gap-4 md:px-6 md:py-5 xl:grid-cols-8">
            <label className="xl:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recherche</span>
              <div className="flex h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Reference, titre, zone..."
                  className="h-full w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </label>

            <FilterDropdown
              label="Type"
              value={selectedType}
              onChange={setSelectedType}
              options={typeDropdownOptions}
              isOpen={openDropdown === 'type'}
              onToggle={() => setOpenDropdown((current) => current === 'type' ? null : 'type')}
              onClose={() => setOpenDropdown((current) => current === 'type' ? null : current)}
              fieldIcon={Home}
            />

            <FilterDropdown
              label="Zone"
              value={selectedZone}
              onChange={setSelectedZone}
              options={zoneDropdownOptions}
              isOpen={openDropdown === 'zone'}
              onToggle={() => setOpenDropdown((current) => current === 'zone' ? null : 'zone')}
              onClose={() => setOpenDropdown((current) => current === 'zone' ? null : current)}
              fieldIcon={MapPin}
            />

            <FilterDropdown
              label="Paiement"
              value={selectedPayment}
              onChange={setSelectedPayment}
              options={paymentDropdownOptions}
              isOpen={openDropdown === 'payment'}
              onToggle={() => setOpenDropdown((current) => current === 'payment' ? null : 'payment')}
              onClose={() => setOpenDropdown((current) => current === 'payment' ? null : current)}
              fieldIcon={BadgeDollarSign}
            />

            <div className="md:hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters((current) => !current)}
                className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-white"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-emerald-700" />
                  Filtres avances
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition ${showAdvancedFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <label className={showAdvancedFilters ? '' : 'hidden md:block'}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Budget max</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={budgetMax}
                onChange={(event) => setBudgetMax(event.target.value)}
                placeholder="Ex: 450000"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
            <label className={showAdvancedFilters ? '' : 'hidden md:block'}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Surface min</span>
              <input
                type="number"
                min="0"
                value={surfaceMin}
                onChange={(event) => setSurfaceMin(event.target.value)}
                placeholder="m2"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
            <label className={showAdvancedFilters ? '' : 'hidden md:block'}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Chambres min</span>
              <input
                type="number"
                min="0"
                value={bedroomsMin}
                onChange={(event) => setBedroomsMin(event.target.value)}
                placeholder="Ex: 3"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
            <label className={showAdvancedFilters ? '' : 'hidden md:block'}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Facade terrain min</span>
              <input
                type="number"
                min="0"
                value={facadeMin}
                onChange={(event) => setFacadeMin(event.target.value)}
                placeholder="Metres"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
        {filteredBiens.length === 0 ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-slate-950">Aucun bien ne correspond aux filtres</h2>
            <p className="mt-2 text-sm text-slate-600">Elargissez la recherche ou reinitialisez les filtres commerciaux.</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {filteredBiens.map((bien) => {
              const zoneName = zones.find((z) => z.id === bien.zone_id)?.nom || 'Zone non definie';
              const imageUrl = getSaleCardImage(bien);
              const publicPrice = getPublicPrice(bien);
              const TypeIcon = typeIconMap[bien.type] || Home;
              const contactPhone = normalizePhone(proprietaires.find((owner) => owner.id === bien.proprietaire_id)?.telephone) || DEFAULT_CONTACT_PHONE;
              const paymentLabel = getPaymentLabel(bien);

              return (
                <article
                  key={bien.id}
                  className="group overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_28px_70px_rgba(15,23,42,0.12)]"
                >
                  <Link to={`/ventes/${bien.type}/${bien.id}`} className="relative block aspect-[16/11] overflow-hidden bg-slate-100">
                    <img
                      src={imageUrl}
                      alt={bien.titre}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.02),rgba(15,23,42,0.55))]" />
                    <div className="absolute left-4 top-4 right-4 flex items-start justify-between gap-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Disponible
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/92 px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm">
                        <TypeIcon className="h-3.5 w-3.5" />
                        {typeLabel[bien.type] || bien.type}
                      </span>
                    </div>
                    <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                      <div className="rounded-[1.2rem] border border-white/15 bg-black/25 px-3 py-2 text-white backdrop-blur-md">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75">Reference</p>
                        <p className="mt-1 text-sm font-bold">{bien.reference || bien.id}</p>
                      </div>
                      <div className="rounded-[1.2rem] border border-white/15 bg-white/92 px-3 py-2 text-right text-slate-950 shadow-sm">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Prix</p>
                        <p className="mt-1 text-lg font-bold">
                          {publicPrice.value.toLocaleString('fr-FR')} DT{publicPrice.suffix}
                        </p>
                      </div>
                    </div>
                  </Link>

                  <div className="flex min-h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                          Vente
                        </p>
                        <h2 className="mt-3 line-clamp-2 text-2xl font-bold leading-tight text-slate-950">{bien.titre}</h2>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                      <MapPin className="h-4 w-4 shrink-0 text-emerald-700" />
                      <span className="truncate">{zoneName}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <Ruler className="h-3.5 w-3.5" />
                          Surface
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">{getSurfaceSummary(bien)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <BadgeDollarSign className="h-3.5 w-3.5" />
                          Paiement
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">{paymentLabel}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <Building2 className="h-3.5 w-3.5" />
                          Type
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">{typeLabel[bien.type] || bien.type}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <Home className="h-3.5 w-3.5" />
                          Infos
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">{getCommercialMeta(bien)}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                        <Landmark className="h-3.5 w-3.5" />
                        Ref {bien.reference || bien.id}
                      </span>
                      {bien.montant_premiere_partie_promesse ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                          <BadgeDollarSign className="h-3.5 w-3.5" />
                          Promesse {Number(bien.montant_premiere_partie_promesse).toLocaleString('fr-FR')} DT
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 flex gap-2">
                      <a
                        href={buildTelLink(contactPhone)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        <Phone className="h-4 w-4" />
                        Appeler
                      </a>
                      <Link
                        to={`/ventes/${bien.type}/${bien.id}`}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Voir la fiche
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
