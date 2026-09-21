import { Link, useNavigate } from 'react-router';
import { createPortal } from 'react-dom';
import { LandingSaleFilters } from '../../pages/LandingSaleFilters';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProperties } from '../../context/PropertiesContext';
import { useAuth } from '../../context/AuthContext';
import { Bien } from '../../admin/types';
import {
  ArrowUpRight,
  BadgeDollarSign,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Filter,
  Facebook,
  Globe,
  Home,
  KeyRound,
  Landmark,
  Loader2,
  LogIn,
  MapPin,
  Phone,
  Ruler,
  Search,
  SlidersHorizontal,
  Trees,
  UploadCloud,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildTelLink } from '../../utils/deepLinks';
import { resolveMediaUrl } from '../../utils/media';
import { buildApiUrl, fetchWithApiFallback } from '../../utils/api';
import { getAuthProviders, getSessionUser, loginWithPasskey, startSocialLogin } from '../../services/auth';
import { saveAuthReturnTo } from '../../utils/pendingReservation';

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
const OWNER_SUBMISSION_RETURN_PATH = '/ventes/soumettre-bien?step=2';
const HERO_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%230f172a'/%3E%3Cstop offset='1' stop-color='%23134e4a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1600' height='900' fill='url(%23g)'/%3E%3Cpath d='M180 620l250-210 180 155 150-120 270 175H180z' fill='rgba(255,255,255,0.14)'/%3E%3Ccircle cx='1180' cy='220' r='88' fill='rgba(255,255,255,0.08)'/%3E%3C/svg%3E";
const CARD_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23dbe4ea'/%3E%3Cpath d='M220 560l180-180 120 120 110-110 170 150H220z' fill='%23b9c5d1'/%3E%3Ccircle cx='430' cy='260' r='56' fill='%23b9c5d1'/%3E%3C/svg%3E";
const SALE_TYPE_IMAGES: Record<string, string> = {
  appartement: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23dbeafe'/%3E%3Cpath d='M190 290V115h260v175H190zm44-34h45v-45h-45v45zm0-78h45v-45h-45v45zm70 78h45v-45h-45v45zm0-78h45v-45h-45v45zm70 78h45v-45h-45v45zm0-78h45v-45h-45v45z' fill='%230f172a' fill-opacity='.72'/%3E%3C/svg%3E",
  villa_maison: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23dcfce7'/%3E%3Cpath d='M145 280V170l175-95 175 95v110h-95v-74H240v74h-95z' fill='%23065046' fill-opacity='.78'/%3E%3C/svg%3E",
  studio: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23fef3c7'/%3E%3Crect x='190' y='95' width='260' height='190' rx='24' fill='%2392400e' fill-opacity='.72'/%3E%3C/svg%3E",
  immeuble: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23e0f2fe'/%3E%3Cpath d='M210 295V70h220v225H210zm45-35h45v-35h-45v35zm0-65h45v-35h-45v35zm0-65h45V95h-45v35zm85 130h45v-35h-45v35zm0-65h45v-35h-45v35zm0-65h45V95h-45v35z' fill='%230c4a6e' fill-opacity='.76'/%3E%3C/svg%3E",
  terrain: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23ecfccb'/%3E%3Cpath d='M70 270l170-105 120 55 120-90 90 140H70z' fill='%233f6212' fill-opacity='.7'/%3E%3Cpath d='M105 295h430' stroke='%2365a30d' stroke-width='18' stroke-linecap='round'/%3E%3C/svg%3E",
  lotissement: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23f1f5f9'/%3E%3Cpath d='M120 110h400v170H120z' fill='%23101820' fill-opacity='.1'/%3E%3Cpath d='M120 165h400M250 110v170M390 110v170' stroke='%23101820' stroke-width='12' stroke-opacity='.55'/%3E%3C/svg%3E",
  local_commercial: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23fae8ff'/%3E%3Cpath d='M150 280V135h340v145H150zm0-145l35-58h270l35 58H150zm55 145v-86h100v86H205zm135-86h95v52h-95v-52z' fill='%237014a8' fill-opacity='.72'/%3E%3C/svg%3E",
};

type OwnerSaleRequestDraft = {
  title: string;
  propertyType: string;
  region: string;
  zone: string;
  address: string;
  superficie_m2: string;
  terrain_surface_m2: string;
  terrain_facade_m: string;
  surface_local_m2: string;
  facade_m: string;
  floor: string;
  bathrooms: string;
  constructionYear: string;
  distance_plage_m: string;
  mapsUrl: string;
  visitDays: string[];
  ownerPrice: string;
  prix_affiche_client: string;
  paymentMode: string;
  bedrooms: string;
  type_rue: string;
  type_papier: string;
  terrain_type_sol: string;
  description: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  availability: string;
};

const OWNER_REQUEST_INITIAL: OwnerSaleRequestDraft = {
  title: '',
  propertyType: 'appartement',
  region: '',
  zone: '',
  address: '',
  superficie_m2: '',
  terrain_surface_m2: '',
  terrain_facade_m: '',
  surface_local_m2: '',
  facade_m: '',
  floor: '',
  bathrooms: '',
  constructionYear: '',
  distance_plage_m: '',
  mapsUrl: '',
  visitDays: [],
  ownerPrice: '',
  prix_affiche_client: '',
  paymentMode: 'comptant',
  bedrooms: '',
  type_rue: '',
  type_papier: '',
  terrain_type_sol: '',
  description: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  availability: '',
};

const OWNER_PHOTO_SLOTS = [
  { id: 'plan_2d', label: 'Plan 2D', optional: true },
  { id: 'plan_3d', label: 'Plan 3D', optional: true },
  { id: 'facade', label: 'Facade', optional: false },
  { id: 'interior', label: 'Interieur', optional: false },
  { id: 'exterior', label: 'Exterieur', optional: false },
  { id: 'street_proof', label: 'Preuve type de rue', optional: false },
  { id: 'paper_proof', label: 'Preuve type de papier', optional: false },
] as const;

type OwnerPhotoSlotId = (typeof OWNER_PHOTO_SLOTS)[number]['id'];

type OwnerPhotoUpload = {
  fileName: string;
  previewUrl: string;
  uploadedUrl: string;
  uploadedUrls?: string[];
  status: 'idle' | 'uploading' | 'uploaded' | 'error';
  error?: string;
};

const createEmptyPhotoUploads = (): Record<OwnerPhotoSlotId, OwnerPhotoUpload | null> => ({
  plan_2d: null,
  plan_3d: null,
  facade: null,
  interior: null,
  exterior: null,
  street_proof: null,
  paper_proof: null,
});

const VISIT_DAY_OPTIONS = [
  { value: 'lundi', label: 'Lundi' },
  { value: 'mardi', label: 'Mardi' },
  { value: 'mercredi', label: 'Mercredi' },
  { value: 'jeudi', label: 'Jeudi' },
  { value: 'vendredi', label: 'Vendredi' },
  { value: 'samedi', label: 'Samedi' },
  { value: 'dimanche', label: 'Dimanche' },
];

const TYPE_RUE_OPTIONS = [
  { value: 'goudronnee', label: 'Rue goudronnee' },
  { value: 'piste', label: 'Piste' },
  { value: 'double_voie', label: 'Double voie' },
  { value: 'facade', label: 'Facade' },
];

const TYPE_PAPIER_OPTIONS = [
  { value: 'titre_bleu', label: 'Titre bleu' },
  { value: 'contrat', label: 'Contrat' },
  { value: 'certificat_possession', label: 'Certificat de possession' },
  { value: 'papier_indivision', label: 'Papier indivision' },
  { value: 'autre', label: 'Autre document' },
];

const TERRAIN_SOL_OPTIONS = [
  { value: 'plat', label: 'Plat' },
  { value: 'legerement_pente', label: 'Legerement pente' },
  { value: 'pente', label: 'Pente' },
  { value: 'rocheux', label: 'Rocheux' },
];

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
  const formatSurface = (value?: number | string | null) => {
    const numeric = Number(value || 0);
    return numeric > 0 ? `${numeric.toLocaleString('fr-FR')} m2` : '';
  };
  if (bien.type === 'terrain') {
    return formatSurface(bien.terrain_surface_m2) || 'Surface non renseignee';
  }
  if (bien.type === 'lotissement') {
    return bien.lotissement_nb_terrains ? `${bien.lotissement_nb_terrains} terrains` : 'Lotissement';
  }
  if (bien.type === 'immeuble') {
    return formatSurface(bien.immeuble_surface_batie_m2 || bien.immeuble_surface_terrain_m2) || 'Immeuble';
  }
  return formatSurface(bien.superficie_m2 || bien.surface_local_m2 || bien.terrain_surface_m2 || bien.immeuble_surface_batie_m2) || 'Surface non renseignee';
}

function getComparableSurface(bien: Bien) {
  return Number(
    bien.terrain_surface_m2
    || bien.surface_local_m2
    || bien.immeuble_surface_batie_m2
    || bien.immeuble_surface_terrain_m2
    || bien.superficie_m2
    || 0
  );
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
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6d6a61]">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-11 w-full items-center gap-3 rounded-md border px-4 text-left text-sm transition ${
          isOpen
            ? 'border-emerald-500 bg-white ring-4 ring-emerald-100'
            : 'border-emerald-100 bg-white hover:border-emerald-400'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
          <SelectedIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-[#101820]">{selectedOption?.label || 'Choisir'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-emerald-700 transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-30 overflow-hidden rounded-lg border border-emerald-100 bg-white p-2 shadow-[0_28px_70px_rgba(6,78,59,0.14)]">
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
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm transition ${
                      selected
                        ? 'bg-emerald-50 text-[#101820]'
                        : 'text-[#2d3945] hover:bg-emerald-50/70'
                    }`}
                    role="option"
                    aria-selected={selected}
                  >
                    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                      selected ? 'bg-white text-emerald-700 shadow-sm' : 'bg-[#f2f3f0] text-[#59636d]'
                    }`}>
                      <OptionIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{option.label}</span>
                    {selected ? <Check className="h-4 w-4 shrink-0 text-emerald-700" /> : null}
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

export function OwnerSaleRequestBox({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { user } = useAuth();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OwnerSaleRequestDraft>(OWNER_REQUEST_INITIAL);
  const [photoUploads, setPhotoUploads] = useState<Record<OwnerPhotoSlotId, OwnerPhotoUpload | null>>(() => createEmptyPhotoUploads());
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState({ google: false, facebook: false, apple: false, passkey: true });
  const [authLoading, setAuthLoading] = useState<'passkey' | null>(null);
  const isAuthenticatedOwner = Boolean(user && user.role === 'user');
  const isTerrain = draft.propertyType === 'terrain' || draft.propertyType === 'lotissement';
  const isLocalCommercial = draft.propertyType === 'local_commercial';
  const isBuiltProperty = !isTerrain && draft.propertyType !== 'local_commercial';

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      document.body.classList.remove('dwira-owner-sale-open');
      return;
    }
    document.body.classList.add('dwira-owner-sale-open');
    return () => {
      document.body.classList.remove('dwira-owner-sale-open');
    };
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    setDraft((current) => ({
      ...current,
      contactName: current.contactName || user.name || '',
      contactEmail: current.contactEmail || user.email || '',
      contactPhone: current.contactPhone || user.telephone || '',
    }));
    if (user.role === 'user') {
      setStep((current) => (current === 0 ? 1 : current));
    }
  }, [open, user]);

  useEffect(() => {
    if (!open || user) return;
    let cancelled = false;
    const restoreOwnerSession = async () => {
      const sessionUser = await getSessionUser();
      if (cancelled || !sessionUser || sessionUser.role !== 'user') return;
      login({ ...sessionUser, clientType: sessionUser.clientType || 'proprietaire' });
      setDraft((current) => ({
        ...current,
        contactName: current.contactName || sessionUser.name || '',
        contactEmail: current.contactEmail || sessionUser.email || '',
        contactPhone: current.contactPhone || sessionUser.telephone || '',
      }));
      setStep((current) => (current === 0 ? 1 : current));
    };
    void restoreOwnerSession();
    const handleFocus = () => void restoreOwnerSession();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void restoreOwnerSession();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [login, open, user]);

  useEffect(() => {
    if (!open) return;
    void getAuthProviders().then((availableProviders) => {
      setProviders({
        google: Boolean(availableProviders.google),
        facebook: Boolean(availableProviders.facebook),
        apple: Boolean(availableProviders.apple),
        passkey: availableProviders.passkey !== false,
      });
    });
  }, [open]);

  const updateDraft = (key: keyof OwnerSaleRequestDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const toggleVisitDay = (day: string) => {
    setDraft((current) => {
      const currentDays = Array.isArray(current.visitDays) ? current.visitDays : [];
      const exists = currentDays.includes(day);
      return {
        ...current,
        visitDays: exists ? currentDays.filter((item) => item !== day) : [...currentDays, day],
        availability: exists ? currentDays.filter((item) => item !== day).join(', ') : [...currentDays, day].join(', '),
      };
    });
  };

  const requiredFields: Array<keyof OwnerSaleRequestDraft> = [
    'title',
    'propertyType',
    'description',
    'contactName',
    'contactPhone',
    'superficie_m2',
    'bedrooms',
    'bathrooms',
    'constructionYear',
    'type_rue',
    'type_papier',
    'mapsUrl',
    'ownerPrice',
    'paymentMode',
  ];

  const missingFields = requiredFields.filter((key) => !String(draft[key] || '').trim());
  const uploadedPhotoUrls = OWNER_PHOTO_SLOTS
    .flatMap((slot) => photoUploads[slot.id]?.uploadedUrls || (photoUploads[slot.id]?.uploadedUrl ? [photoUploads[slot.id]?.uploadedUrl || ''] : []))
    .filter(Boolean);
  const uploadedRequiredPhotoUrls = OWNER_PHOTO_SLOTS
    .filter((slot) => !slot.optional)
    .map((slot) => {
      const upload = photoUploads[slot.id];
      return (upload?.uploadedUrls && upload.uploadedUrls.length > 0) || upload?.uploadedUrl ? 'uploaded' : '';
    })
    .filter(Boolean);
  const hasUploadingPhotos = OWNER_PHOTO_SLOTS.some((slot) => photoUploads[slot.id]?.status === 'uploading');
  const canSubmit = isAuthenticatedOwner && missingFields.length === 0 && draft.visitDays.length > 0 && uploadedRequiredPhotoUrls.length === OWNER_PHOTO_SLOTS.filter((slot) => !slot.optional).length && !hasUploadingPhotos && !submitting;

  const isStepComplete = (index: number) => {
    if (index === 0) return isAuthenticatedOwner;
    if (index === 1) {
      return ['title', 'contactName', 'contactPhone', 'description'].every((key) => String(draft[key as keyof OwnerSaleRequestDraft] || '').trim());
    }
    if (index === 2) return Boolean(String(draft.propertyType || '').trim()) && draft.visitDays.length > 0;
    if (index === 3) {
      return [
        'superficie_m2',
        'bedrooms',
        'bathrooms',
        'constructionYear',
        'type_rue',
        'type_papier',
        'mapsUrl',
      ].every((key) => String(draft[key as keyof OwnerSaleRequestDraft] || '').trim());
    }
    if (index === 4) return Boolean(String(draft.ownerPrice || '').trim());
    if (index === 5) {
      return Boolean(String(draft.paymentMode || '').trim())
        && uploadedRequiredPhotoUrls.length === OWNER_PHOTO_SLOTS.filter((slot) => !slot.optional).length
        && !hasUploadingPhotos;
    }
    return false;
  };

  const uploadPhotoSlot = async (slotId: OwnerPhotoSlotId, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const previous = photoUploads[slotId];
    setPhotoUploads((current) => ({
      ...current,
      [slotId]: {
        fileName: previous?.fileName ? `${previous.fileName}, ${file.name}` : file.name,
        previewUrl,
        uploadedUrl: previous?.uploadedUrl || '',
        uploadedUrls: previous?.uploadedUrls || (previous?.uploadedUrl ? [previous.uploadedUrl] : []),
        status: 'uploading',
      },
    }));
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('upload_scope', 'owner_sale_request');
      formData.append('preferred_provider', 'cloudflare');
      const response = await fetchWithApiFallback('/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || 'Upload photo impossible'));
      const uploadedUrl = String(payload?.url || payload?.imageUrl || '').trim();
      if (!uploadedUrl) throw new Error('URL photo indisponible');
      setPhotoUploads((current) => ({
        ...current,
        [slotId]: {
          fileName: current[slotId]?.fileName ? `${current[slotId]?.fileName}, ${file.name}` : file.name,
          previewUrl,
          uploadedUrl,
          uploadedUrls: [...(current[slotId]?.uploadedUrls || (current[slotId]?.uploadedUrl ? [current[slotId]?.uploadedUrl || ''] : [])), uploadedUrl].filter(Boolean),
          status: 'uploaded',
        },
      }));
    } catch (error) {
      setPhotoUploads((current) => ({
        ...current,
        [slotId]: {
          fileName: file.name,
          previewUrl,
          uploadedUrl: previous?.uploadedUrl || '',
          uploadedUrls: previous?.uploadedUrls || (previous?.uploadedUrl ? [previous.uploadedUrl] : []),
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload impossible',
        },
      }));
      toast.error(error instanceof Error ? error.message : 'Upload photo impossible');
    }
  };

  const submitRequest = async () => {
    if (!isAuthenticatedOwner) {
      toast.error('Connectez-vous comme proprietaire avant de soumettre.');
      return;
    }
    if (missingFields.length > 0) {
      toast.error('Completez tous les champs obligatoires.');
      return;
    }
    if (draft.visitDays.length === 0) {
      toast.error('Choisissez au moins un jour de visite.');
      return;
    }
    if (uploadedRequiredPhotoUrls.length < OWNER_PHOTO_SLOTS.filter((slot) => !slot.optional).length) {
      toast.error('Ajoutez les photos et preuves obligatoires.');
      return;
    }
    if (hasUploadingPhotos) {
      toast.error('Patientez jusqu a la fin de l upload des photos.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(buildApiUrl('/owner-sale-listing-requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...draft,
          type: draft.propertyType,
          mode: 'vente',
          prix_affiche_client: draft.ownerPrice,
          prix_proprietaire: draft.ownerPrice,
          paymentMode: draft.paymentMode,
          photos: uploadedPhotoUrls,
          photoSlots: OWNER_PHOTO_SLOTS.map((slot) => ({
            slot,
            urls: photoUploads[slot.id]?.uploadedUrls || (photoUploads[slot.id]?.uploadedUrl ? [photoUploads[slot.id]?.uploadedUrl || ''] : []),
          })).flatMap(({ slot, urls }) => urls.filter(Boolean).map((url, index) => ({
            id: slot.id,
            label: slot.label,
            url,
            optional: slot.optional,
            position: index,
          }))),
          source: 'landing_ventes',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || 'Demande impossible'));
      toast.success('Demande envoyee a l equipe ventes.');
      setDraft(OWNER_REQUEST_INITIAL);
      setPhotoUploads(createEmptyPhotoUploads());
      setStep(0);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Demande impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const redirectToAccountCreation = () => {
    saveAuthReturnTo(OWNER_SUBMISSION_RETURN_PATH);
    navigate(`/login?returnTo=${encodeURIComponent(OWNER_SUBMISSION_RETURN_PATH)}`);
  };

  const handleSocialLogin = (provider: 'google' | 'facebook' | 'apple') => {
    if (!providers[provider]) {
      toast.error('Methode de connexion indisponible pour le moment.');
      return;
    }
    saveAuthReturnTo(OWNER_SUBMISSION_RETURN_PATH);
    startSocialLogin(provider, OWNER_SUBMISSION_RETURN_PATH);
  };

  const handlePasskeyLogin = async () => {
    if (!providers.passkey) {
      toast.error('Passkey indisponible pour le moment.');
      return;
    }
    if (!window.PublicKeyCredential || !navigator.credentials) {
      toast.error('Passkey non supporte sur ce navigateur/appareil.');
      return;
    }
    setAuthLoading('passkey');
    try {
      const nextUser = await loginWithPasskey();
      login({ ...nextUser, clientType: nextUser.clientType || 'proprietaire' });
      setDraft((current) => ({
        ...current,
        contactName: current.contactName || nextUser.name || '',
        contactEmail: current.contactEmail || nextUser.email || '',
        contactPhone: current.contactPhone || nextUser.telephone || '',
      }));
      if (!nextUser.profileCompleted) {
        toast.info('Completez votre profil client pour continuer.');
        redirectToAccountCreation();
        return;
      }
      toast.success('Connexion reussie.');
      setStep(1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentification impossible';
      if (/aucun|passkey|not found|404|introuvable|configure/i.test(message)) {
        toast.info('Compte introuvable. Creez un compte pour continuer.');
        redirectToAccountCreation();
      } else {
        toast.error(message);
      }
    } finally {
      setAuthLoading(null);
    }
  };

  const stepLabels = ['Compte', 'Proprietaire', 'Type & visites', 'Details', 'Prix', 'Paiement & photos'];

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const queryStep = Number(new URLSearchParams(window.location.search).get('step') || 0);
    if (isAuthenticatedOwner && queryStep >= 2) {
      setStep((current) => (current === 0 ? 1 : current));
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [isAuthenticatedOwner, open]);

  if (!open) {
    return (
      <div className="landing-owner-sale-callout">
        <div>
          <p>Vous etes proprietaire ?</p>
          <h3>Ajoutez votre bien a vendre sur Dwira</h3>
          <span>Un parcours clair, photos incluses, puis validation par notre equipe ventes.</span>
        </div>
        <Link to="/ventes/soumettre-bien">
          Ajouter mon bien
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const goNextStep = () => {
    if (step === 0 && !isAuthenticatedOwner) {
      toast.error('Connectez-vous ou creez un compte pour continuer.');
      return;
    }
    setStep((current) => Math.min(stepLabels.length - 1, current + 1));
  };

  return (
    <section className="landing-owner-sale-submission">
      <div className="w-full overflow-hidden rounded-[28px] bg-white shadow-[0_32px_90px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 md:p-6">
          <div>
            <h3 className="text-2xl font-black text-slate-950">Soumettre un bien a vendre</h3>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-5 py-3">
          {stepLabels.map((label, index) => (
            (() => {
              const complete = isStepComplete(index);
              const active = step === index;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(index)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
                    active && complete
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : active
                        ? 'bg-slate-950 text-white shadow-sm'
                      : complete
                        ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  <span>{index + 1}. {label}</span>
                </button>
              );
            })()
          ))}
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-5 md:p-6">
          {step === 0 ? (
            <div className="grid gap-4">
              {isAuthenticatedOwner ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-bold text-slate-950">Compte connecte</p>
                  <p className="mt-1 text-sm text-slate-600">{user?.name} - {user?.email}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <button type="button" onClick={() => handleSocialLogin('google')} disabled={!providers.google} className="inline-flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50">
                      <Globe className="h-5 w-5 text-emerald-700" />
                      Google
                    </button>
                    <button type="button" onClick={() => handleSocialLogin('apple')} disabled={!providers.apple} className="inline-flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50">
                      <UserPlus className="h-5 w-5 text-slate-950" />
                      Apple
                    </button>
                    <button type="button" onClick={() => void handlePasskeyLogin()} disabled={authLoading !== null || !providers.passkey} className="inline-flex items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50">
                      {authLoading === 'passkey' ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
                      Passkey
                    </button>
                    <button type="button" onClick={() => handleSocialLogin('facebook')} disabled={!providers.facebook} className="inline-flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50">
                      <Facebook className="h-5 w-5 text-blue-600" />
                      Facebook
                    </button>
                    <button type="button" onClick={redirectToAccountCreation} className="inline-flex items-center justify-center gap-3 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 md:col-span-2">
                      <LogIn className="h-5 w-5" />
                      Premiere fois ? Creer un compte
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="Titre du bien *" className="rounded-xl border border-slate-200 px-4 py-3 text-sm md:col-span-2" />
              <input value={draft.contactName} onChange={(event) => updateDraft('contactName', event.target.value)} placeholder="Proprietaire *" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              <input value={draft.contactPhone} onChange={(event) => updateDraft('contactPhone', event.target.value)} placeholder="Numero proprietaire *" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              <textarea value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="Description *" rows={5} className="rounded-xl border border-slate-200 px-4 py-3 text-sm md:col-span-2" />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4">
              <select value={draft.propertyType} onChange={(event) => updateDraft('propertyType', event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                {Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-950">Regles de visite *</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {VISIT_DAY_OPTIONS.map((day) => {
                    const selected = draft.visitDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleVisitDay(day.value)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${selected ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <input value={draft.superficie_m2} onChange={(event) => updateDraft('superficie_m2', event.target.value)} placeholder="Superficie (m2) *" type="number" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              <input value={draft.floor} onChange={(event) => updateDraft('floor', event.target.value)} placeholder="Etage" type="number" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              <input value={draft.bedrooms} onChange={(event) => updateDraft('bedrooms', event.target.value)} placeholder="Nombre de chambres *" type="number" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              <input value={draft.bathrooms} onChange={(event) => updateDraft('bathrooms', event.target.value)} placeholder="Nombre de SDB *" type="number" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              <input value={draft.constructionYear} onChange={(event) => updateDraft('constructionYear', event.target.value)} placeholder="Annee de construction *" type="number" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              <input value={draft.distance_plage_m} onChange={(event) => updateDraft('distance_plage_m', event.target.value)} placeholder="Distance plage (m) optionnel" type="number" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              <select value={draft.type_rue} onChange={(event) => updateDraft('type_rue', event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <option value="">Type de rue *</option>
                {TYPE_RUE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={draft.type_papier} onChange={(event) => updateDraft('type_papier', event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <option value="">Type de papier *</option>
                {TYPE_PAPIER_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <input value={draft.mapsUrl} onChange={(event) => updateDraft('mapsUrl', event.target.value)} placeholder="Lien maps du bien *" className="rounded-xl border border-slate-200 px-4 py-3 text-sm md:col-span-2" />
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <input value={draft.ownerPrice} onChange={(event) => updateDraft('ownerPrice', event.target.value)} placeholder="Prix proprietaire en DT *" type="number" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
            </div>
          ) : null}

          {step === 5 ? (
            <div className="grid gap-4">
              <select value={draft.paymentMode} onChange={(event) => updateDraft('paymentMode', event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <option value="comptant">Comptant</option>
                <option value="facilite">Facilite de paiement</option>
              </select>
              <div className="grid gap-3 md:grid-cols-2">
                {OWNER_PHOTO_SLOTS.map((slot) => {
                  const upload = photoUploads[slot.id];
                  const uploaded = upload?.status === 'uploaded';
                  const uploading = upload?.status === 'uploading';
                  return (
                  <label key={slot.id} className={`relative flex min-h-36 cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-dashed px-4 py-4 text-left transition ${
                    uploaded
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                      : upload?.status === 'error'
                        ? 'border-rose-300 bg-rose-50 text-rose-900'
                        : 'border-slate-300 bg-slate-50 text-slate-950 hover:border-emerald-300 hover:bg-emerald-50/40'
                  }`}>
                    {upload?.previewUrl ? (
                      <img src={upload.previewUrl} alt={slot.label} className="absolute inset-0 h-full w-full object-cover opacity-20" />
                    ) : null}
                    <div className="relative z-10 flex items-center justify-between gap-3">
                      <UploadCloud className={`h-7 w-7 ${uploaded ? 'text-emerald-700' : 'text-slate-500'}`} />
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : uploaded ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : null}
                    </div>
                    <div className="relative z-10 mt-8">
                      <span className="text-sm font-bold">{slot.label}</span>
                      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-current/55">{slot.optional ? 'Optionnel' : 'Obligatoire'}</p>
                      {uploaded ? <p className="mt-1 text-xs font-semibold text-emerald-700">Uploaded</p> : null}
                      {upload?.fileName ? <p className="mt-1 truncate text-xs text-current/70">{upload.fileName}</p> : null}
                      {upload?.error ? <p className="mt-1 text-xs font-semibold text-rose-700">{upload.error}</p> : null}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        event.target.value = '';
                        if (files.length > 0) {
                          void Promise.all(files.map((file) => uploadPhotoSlot(slot.id, file)));
                        }
                      }}
                      multiple={slot.id === 'facade' || slot.id === 'interior' || slot.id === 'exterior'}
                    />
                  </label>
                  );
                })}
              </div>
              {uploadedPhotoUrls.length > 0 ? <p className="text-sm font-semibold text-emerald-700">{uploadedPhotoUrls.length} photo(s) uploaded</p> : null}
              {missingFields.length > 0 ? <p className="text-sm text-slate-500">Champs restants: {missingFields.length}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">Precedent</button>
          {step < stepLabels.length - 1 ? (
            <button type="button" onClick={goNextStep} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Suivant</button>
          ) : (
            <button type="button" onClick={() => void submitRequest()} disabled={!canSubmit} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Soumettre
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function VentesListPage({ embedded = false, filterContainer = null }: { embedded?: boolean; filterContainer?: HTMLElement | null } = {}) {
  const { biens, zones, proprietaires, isLoading } = useProperties();
  const saleRailRef = useRef<HTMLDivElement | null>(null);
  const [heroSettings, setHeroSettings] = useState<{ imageUrl: string; title: string; subtitle: string }>({
    imageUrl: '',
    title: '',
    subtitle: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedZone, setSelectedZone] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState('all');
  const [budgetMax, setBudgetMax] = useState('');
  const [surfaceMin, setSurfaceMin] = useState('');
  const [bedroomsMin, setBedroomsMin] = useState('');
  const [facadeMin, setFacadeMin] = useState('');
  const [distanceBeachMax, setDistanceBeachMax] = useState('');
  const [unitsMin, setUnitsMin] = useState('');
  const [constructibleFilter, setConstructibleFilter] = useState('all');
  const [openDropdown, setOpenDropdown] = useState<'type' | 'zone' | 'payment' | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

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
  const defaultHeroSubtitle = 'Une selection immobiliere claire, des references disponibles et un contact direct pour organiser votre visite.';

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

  const availableSaleZones = useMemo(() => {
    const zoneIds = new Set(venteBiens.map((bien) => bien.zone_id).filter(Boolean));
    return zones
      .filter((zone) => zoneIds.has(zone.id))
      .sort((a, b) => String(a.region || a.nom).localeCompare(String(b.region || b.nom), 'fr', { sensitivity: 'base' }));
  }, [venteBiens, zones]);

  const regionOptions = useMemo(() => {
    const values = new Map<string, string>();
    availableSaleZones.forEach((zone) => {
      const regionName = String(zone.region || '').trim();
      if (!regionName) return;
      const token = normalizeText(regionName);
      if (token && !values.has(token)) values.set(token, regionName);
    });
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  }, [availableSaleZones]);

  const zoneOptions = useMemo(() => {
    const values = new Map<string, string>();
    venteBiens.forEach((bien) => {
      const zone = zones.find((candidate) => candidate.id === bien.zone_id);
      if (!zone) return;
      if (selectedRegion !== 'all' && normalizeText(zone.region) !== normalizeText(selectedRegion)) return;
      const zoneName = zone.quartier || zone.nom;
      if (!zoneName) return;
      if (!values.has(zone.id)) values.set(zone.id, zoneName);
    });
    return Array.from(values, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
  }, [selectedRegion, venteBiens, zones]);

  const typeDropdownOptions = useMemo<FilterDropdownOption[]>(
    () => [
      { value: 'all', label: 'Tous les types', icon: Home },
      ...Object.entries(typeLabel).map(([value, label]) => ({
        value,
        label,
        imageUrl: SALE_TYPE_IMAGES[value] || CARD_FALLBACK,
        icon: typeIconMap[value] || Home,
      })),
    ],
    []
  );

  const zoneDropdownOptions = useMemo<FilterDropdownOption[]>(
    () => [
      { value: 'all', label: 'Toutes les zones', icon: MapPin },
      ...zoneOptions.map((zone) => ({
        value: zone.value,
        label: zone.label,
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
    const distanceBeachMaxValue = Number(distanceBeachMax || 0);
    const unitsMinValue = Number(unitsMin || 0);
    const normalizedSearch = normalizeText(searchTerm);
    return venteBiens.filter((bien) => {
      const zone = zones.find((candidate) => candidate.id === bien.zone_id);
      const zoneName = zone?.nom || '';
      const haystack = [
        bien.titre,
        bien.reference,
        zoneName,
        zone?.region,
        zone?.quartier,
        typeLabel[bien.type] || bien.type,
        bien.description,
      ]
        .map((item) => normalizeText(item))
        .join(' ');
      const publicPrice = getPublicPrice(bien);
      if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
      if (selectedType !== 'all' && bien.type !== selectedType) return false;
      if (selectedRegion !== 'all' && normalizeText(zone?.region) !== normalizeText(selectedRegion)) return false;
      if (selectedZone !== 'all' && bien.zone_id !== selectedZone) return false;
      if (selectedPayment !== 'all' && (bien.modalite_paiement_vente || 'comptant') !== selectedPayment) return false;
      if (budgetValue > 0 && publicPrice.value > budgetValue) return false;
      if (surfaceMinValue > 0) {
        const bienSurface = getComparableSurface(bien);
        if (bienSurface < surfaceMinValue) return false;
      }
      if (bedroomsMinValue > 0 && Number(bien.nb_chambres || 0) < bedroomsMinValue) return false;
      if (facadeMinValue > 0) {
        const bienFacade = Number(bien.terrain_facade_m || bien.facade_m || 0);
        if (bienFacade < facadeMinValue) return false;
      }
      if (distanceBeachMaxValue > 0 && Number(bien.terrain_distance_plage_m || 0) > distanceBeachMaxValue) return false;
      if (unitsMinValue > 0) {
        const bienUnits = bien.type === 'lotissement' ? Number(bien.lotissement_nb_terrains || 0) : Number(bien.immeuble_nb_appartements || 0);
        if (bienUnits < unitsMinValue) return false;
      }
      if (constructibleFilter !== 'all' && Boolean(bien.terrain_constructible) !== (constructibleFilter === 'yes')) return false;
      return true;
    });
  }, [bedroomsMin, budgetMax, constructibleFilter, distanceBeachMax, facadeMin, searchTerm, selectedPayment, selectedRegion, selectedType, selectedZone, surfaceMin, unitsMin, venteBiens, zones]);

  const activeFiltersCount = [
    searchTerm.trim(),
    selectedType !== 'all' ? selectedType : '',
    selectedRegion !== 'all' ? selectedRegion : '',
    selectedZone !== 'all' ? selectedZone : '',
    selectedPayment !== 'all' ? selectedPayment : '',
    budgetMax.trim(),
    surfaceMin.trim(),
    bedroomsMin.trim(),
    facadeMin.trim(),
    distanceBeachMax.trim(),
    unitsMin.trim(),
    constructibleFilter !== 'all' ? constructibleFilter : '',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedType('all');
    setSelectedRegion('all');
    setSelectedZone('all');
    setSelectedPayment('all');
    setBudgetMax('');
    setSurfaceMin('');
    setBedroomsMin('');
    setFacadeMin('');
    setDistanceBeachMax('');
    setUnitsMin('');
    setConstructibleFilter('all');
  };

  const scrollSaleRail = useCallback((direction: 1 | -1) => {
    const rail = saleRailRef.current;
    if (!rail) return;
    const cards = Array.from(rail.querySelectorAll<HTMLElement>('article'));
    const firstCard = cards[0];
    const step = firstCard ? firstCard.offsetWidth + 18 : rail.clientWidth * 0.76;
    const maxLeft = rail.scrollWidth - rail.clientWidth;
    const currentIndex = firstCard ? Math.round(rail.scrollLeft / step) : 0;
    const nextIndex = direction > 0
      ? (currentIndex + 1) % Math.max(cards.length, 1)
      : (currentIndex - 1 + Math.max(cards.length, 1)) % Math.max(cards.length, 1);
    const nextLeft = nextIndex * step;
    rail.scrollTo({
      left: nextLeft > maxLeft - 8 ? 0 : Math.max(0, nextLeft),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, []);

  useEffect(() => {
    if (!embedded || filteredBiens.length <= 1) return;
    const rail = saleRailRef.current;
    const centerNearestCard = () => {
      if (!rail) return;
      const firstCard = rail.querySelector<HTMLElement>('article');
      if (!firstCard) return;
      const step = firstCard.offsetWidth + 18;
      const nearestIndex = Math.round(rail.scrollLeft / step);
      rail.scrollTo({ left: nearestIndex * step, behavior: 'smooth' });
    };
    const timer = window.setInterval(() => scrollSaleRail(1), 5200);
    rail?.addEventListener('scrollend', centerNearestCard);
    return () => {
      window.clearInterval(timer);
      rail?.removeEventListener('scrollend', centerNearestCard);
    };
  }, [embedded, filteredBiens.length, scrollSaleRail]);

  const salesFilters = embedded ? (
    <LandingSaleFilters
      regions={[{ value: 'all', label: 'Toutes les régions' }, ...regionOptions.map((region) => {
        const match = availableSaleZones.find((zone) => normalizeText(zone.region) === normalizeText(region));
        return { value: region, label: region, imageUrl: resolveMediaUrl(match?.region_image_url || match?.image_url) || getSaleCardImage(venteBiens.find((bien) => bien.zone_id === match?.id) || venteBiens[0]) };
      })]}
      zones={[{ value: 'all', label: selectedRegion === 'all' ? 'Choisir une région' : 'Toutes les zones' }, ...zoneOptions.map((option) => {
        const zone = zones.find((candidate) => candidate.id === option.value);
        return { ...option, imageUrl: resolveMediaUrl(zone?.quartier_image_url || zone?.region_image_url || zone?.image_url) || getSaleCardImage(venteBiens.find((bien) => bien.zone_id === option.value) || venteBiens[0]) };
      })]}
      types={typeDropdownOptions}
      region={{ value: selectedRegion, onChange: setSelectedRegion }}
      zone={{ value: selectedZone, onChange: setSelectedZone }}
      type={{ value: selectedType, onChange: setSelectedType }}
      payment={{ value: selectedPayment, onChange: setSelectedPayment }}
      budget={{ value: budgetMax, onChange: setBudgetMax }}
      surface={{ value: surfaceMin, onChange: setSurfaceMin }}
      bedrooms={{ value: bedroomsMin, onChange: setBedroomsMin }}
      facade={{ value: facadeMin, onChange: setFacadeMin }}
      distanceBeach={{ value: distanceBeachMax, onChange: setDistanceBeachMax }}
      units={{ value: unitsMin, onChange: setUnitsMin }}
      constructible={{ value: constructibleFilter, onChange: setConstructibleFilter }}
      onReset={resetFilters} activeCount={activeFiltersCount}
    />
  ) : (
      <section id="ventes-recherche" className={embedded ? "landing-sale-filters relative z-10 text-left" : "relative z-10 mx-auto -mt-12 max-w-7xl px-4 md:px-6"}>
        <div className="overflow-visible rounded-lg border border-emerald-100 bg-white shadow-[0_24px_70px_rgba(6,78,59,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 px-4 py-3 md:px-6 md:py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-emerald-950 text-emerald-300">
                <SlidersHorizontal size={18} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Recherche vente</p>
                <h2 className="text-base font-semibold text-[#101820] md:text-lg">Selectionner un bien</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm font-medium text-[#2d3945]">
                <Filter className="h-4 w-4" />
                {filteredBiens.length} resultat{filteredBiens.length > 1 ? 's' : ''}
              </span>
              {activeFiltersCount > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-100 px-3 py-2 text-sm font-medium text-[#2d3945] transition hover:bg-emerald-50"
                >
                  <X className="h-4 w-4" />
                  Reinitialiser
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 px-4 py-4 md:grid-cols-2 md:gap-4 md:px-6 md:py-5 xl:grid-cols-12">
            <label className="xl:col-span-4">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recherche</span>
              <div className="flex h-11 items-center gap-3 rounded-md border border-emerald-100 bg-white px-4">
                <Search className="h-4 w-4 text-emerald-700" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Reference, titre, zone..."
                  className="h-full w-full bg-transparent text-sm text-[#101820] outline-none placeholder:text-[#9b978d]"
                />
              </div>
            </label>

            <div className="md:hidden">
              <button
                type="button"
                onClick={() => setShowMobileFilters((current) => !current)}
                className="flex h-11 w-full items-center justify-between rounded-md border border-emerald-100 bg-white px-4 text-sm font-semibold text-[#101820] transition hover:border-emerald-400"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-emerald-700" />
                  {showMobileFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition ${showMobileFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className={showMobileFilters ? '' : 'hidden md:block xl:col-span-2'}>
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
            </div>

            <div className={showMobileFilters ? '' : 'hidden md:block xl:col-span-2'}>
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
            </div>

            <div className={showMobileFilters ? '' : 'hidden md:block xl:col-span-2'}>
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
            </div>

            <div className={showMobileFilters ? 'md:col-span-2 xl:col-span-2' : 'hidden md:block xl:col-span-2'}>
              <span className="mb-2 hidden text-xs font-semibold uppercase tracking-[0.2em] text-transparent md:block">Options</span>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters((current) => !current)}
                className="flex h-11 w-full items-center justify-between rounded-md border border-emerald-100 bg-white px-4 text-sm font-semibold text-[#101820] transition hover:border-emerald-400"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-emerald-700" />
                  Filtres avances
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition ${showAdvancedFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <label className={showAdvancedFilters ? (showMobileFilters ? '' : 'hidden md:block') : 'hidden'}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#59636d]">Budget max</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={budgetMax}
                onChange={(event) => setBudgetMax(event.target.value)}
                placeholder="Ex: 450000"
                className="h-11 w-full rounded-md border border-emerald-100 bg-white px-4 text-sm text-[#101820] outline-none placeholder:text-[#8da398] focus:border-emerald-400"
              />
            </label>
            <label className={showAdvancedFilters ? (showMobileFilters ? '' : 'hidden md:block') : 'hidden'}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#59636d]">Surface min</span>
              <input
                type="number"
                min="0"
                value={surfaceMin}
                onChange={(event) => setSurfaceMin(event.target.value)}
                placeholder="m2"
                className="h-11 w-full rounded-md border border-emerald-100 bg-white px-4 text-sm text-[#101820] outline-none placeholder:text-[#8da398] focus:border-emerald-400"
              />
            </label>
            <label className={showAdvancedFilters ? (showMobileFilters ? '' : 'hidden md:block') : 'hidden'}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#59636d]">Chambres min</span>
              <input
                type="number"
                min="0"
                value={bedroomsMin}
                onChange={(event) => setBedroomsMin(event.target.value)}
                placeholder="Ex: 3"
                className="h-11 w-full rounded-md border border-emerald-100 bg-white px-4 text-sm text-[#101820] outline-none placeholder:text-[#8da398] focus:border-emerald-400"
              />
            </label>
            <label className={showAdvancedFilters ? (showMobileFilters ? '' : 'hidden md:block') : 'hidden'}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#59636d]">Facade terrain min</span>
              <input
                type="number"
                min="0"
                value={facadeMin}
                onChange={(event) => setFacadeMin(event.target.value)}
                placeholder="Metres"
                className="h-11 w-full rounded-md border border-emerald-100 bg-white px-4 text-sm text-[#101820] outline-none placeholder:text-[#8da398] focus:border-emerald-400"
              />
            </label>
          </div>
        </div>
      </section>
  );

  if (isLoading) {
    return (
      <>
        {embedded && filterContainer ? createPortal(salesFilters, filterContainer) : null}
        <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Chargement des biens à vendre">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      </>
    );
  }

  return (
    <div className={embedded ? "landing-sales text-[#101820]" : "min-h-screen bg-[#f4f8f5] text-[#101820]"}>
      {!embedded && <section className="relative min-h-[560px] overflow-hidden border-b border-white/10 text-white md:min-h-[660px]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${heroImage}")` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,8,12,0.86)_0%,rgba(8,15,20,0.58)_45%,rgba(7,34,32,0.28)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_38%,rgba(255,255,255,0.10),transparent_26%),linear-gradient(180deg,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.40)_100%)]" />

        <div className="relative mx-auto flex min-h-[560px] max-w-7xl flex-col justify-center px-4 pb-24 pt-28 md:min-h-[660px] md:px-6 md:pb-28 md:pt-36">
          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/18 bg-white/10 px-3 py-2 backdrop-blur-xl">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-[0.28em] text-white/86">Dwira Immobilier</span>
              </div>
              <h1 className="mt-6 max-w-3xl text-[clamp(3.25rem,7vw,6.7rem)] font-semibold leading-[0.9] tracking-[-0.035em]">
                {heroSettings.title || defaultHeroTitle}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/82 md:text-xl">
                {heroSettings.subtitle || defaultHeroSubtitle}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#ventes-recherche"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(16,185,129,0.24)] transition hover:bg-emerald-600"
                >
                  Explorer les biens
                  <ArrowUpRight className="h-4 w-4" />
                </a>
                <a
                  href={buildTelLink(DEFAULT_CONTACT_PHONE)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-xl transition hover:bg-white/16"
                >
                  <Phone className="h-4 w-4" />
                  Appeler
                </a>
              </div>
            </div>

            <div className="hidden rounded-lg border border-white/16 bg-white/10 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl lg:block">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-white/12 bg-black/18 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/58">Biens</p>
                  <p className="mt-3 text-3xl font-semibold">{venteBiens.length}</p>
                </div>
                <div className="rounded-md border border-white/12 bg-black/18 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/58">Zones</p>
                  <p className="mt-3 text-3xl font-semibold">{zoneOptions.length}</p>
                </div>
                <div className="rounded-md border border-white/12 bg-black/18 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/58">Contact</p>
                  <p className="mt-3 text-sm font-semibold leading-5">Visite directe</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>}

      {embedded && filterContainer ? createPortal(salesFilters, filterContainer) : salesFilters}

      <section className={embedded ? "landing-sale-results" : "mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14"}>
        {embedded && (
          <div className="landing-sale-carousel-head">
            <h2>Biens à vendre</h2>
            {filteredBiens.length > 1 ? (
              <div className="landing-sale-carousel-controls">
                  <button type="button" onClick={() => scrollSaleRail(-1)} aria-label="Bien precedent">{'<'}</button>
                  <button type="button" onClick={() => scrollSaleRail(1)} aria-label="Bien suivant">{'>'}</button>
              </div>
            ) : null}
          </div>
        )}
        {filteredBiens.length === 0 ? (
          <div className="rounded-lg border border-emerald-100 bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-[#101820]">Aucun bien ne correspond aux filtres</h2>
            <p className="mt-2 text-sm text-[#59636d]">Elargissez la recherche ou reinitialisez les filtres commerciaux.</p>
          </div>
        ) : (
          <div ref={embedded ? saleRailRef : undefined} className={embedded ? "landing-sale-card-rail" : "grid gap-6 md:grid-cols-2 2xl:grid-cols-3"}>
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
                  className="group overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-[0_18px_50px_rgba(6,78,59,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_28px_70px_rgba(6,78,59,0.14)]"
                >
                  <Link to={`/ventes/${bien.type}/${bien.id}`} className="relative block aspect-[16/11] overflow-hidden bg-slate-100">
                    <img
                      src={imageUrl}
                      alt={bien.titre}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.00),rgba(8,10,14,0.68))]" />
                    <div className="absolute left-4 top-4 right-4 flex items-start justify-between gap-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#101820] px-3 py-1 text-xs font-semibold text-white shadow-sm">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Disponible
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/92 px-3 py-1 text-xs font-semibold text-[#101820] shadow-sm">
                        <TypeIcon className="h-3.5 w-3.5" />
                        {typeLabel[bien.type] || bien.type}
                      </span>
                    </div>
                    <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                      <div className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white backdrop-blur-md">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75">Reference</p>
                        <p className="mt-1 text-sm font-bold">{bien.reference || bien.id}</p>
                      </div>
                      <div className="rounded-md border border-white/15 bg-white/95 px-3 py-2 text-right text-[#101820] shadow-sm">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Prix</p>
                        <p className="mt-1 text-lg font-bold">
                          {publicPrice.value.toLocaleString('fr-FR')} DT{publicPrice.suffix}
                        </p>
                      </div>
                    </div>
                  </Link>

                  <div className="flex min-h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="inline-flex items-center rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          Vente privee
                        </p>
                        <h2 className="mt-3 line-clamp-2 text-2xl font-semibold leading-tight tracking-[-0.01em] text-[#101820]">{bien.titre}</h2>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-sm text-[#59636d]">
                      <MapPin className="h-4 w-4 shrink-0 text-emerald-700" />
                      <span className="truncate">{zoneName}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 border-y border-emerald-50 py-4">
                      <div className="px-1">
                        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d6a61]">
                          <Ruler className="h-3.5 w-3.5" />
                          Surface
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[#101820]">{getSurfaceSummary(bien)}</p>
                      </div>
                      <div className="px-1">
                        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d6a61]">
                          <BadgeDollarSign className="h-3.5 w-3.5" />
                          Paiement
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[#101820]">{paymentLabel}</p>
                      </div>
                      <div className="px-1">
                        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d6a61]">
                          <Building2 className="h-3.5 w-3.5" />
                          Type
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[#101820]">{typeLabel[bien.type] || bien.type}</p>
                      </div>
                      <div className="px-1">
                        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d6a61]">
                          <Home className="h-3.5 w-3.5" />
                          Infos
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[#101820]">{getCommercialMeta(bien)}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-[#2d3945]">
                        <Landmark className="h-3.5 w-3.5" />
                        Ref {bien.reference || bien.id}
                      </span>
                      {bien.montant_premiere_partie_promesse ? (
                        <span className="inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-white px-3 py-2 text-xs font-semibold text-[#2d3945]">
                          <BadgeDollarSign className="h-3.5 w-3.5" />
                          Promesse {Number(bien.montant_premiere_partie_promesse).toLocaleString('fr-FR')} DT
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 flex gap-2">
                      <a
                        href={buildTelLink(contactPhone)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold text-[#101820] transition hover:border-emerald-400"
                      >
                        <Phone className="h-4 w-4" />
                        Appeler
                      </a>
                      <Link
                        to={`/ventes/${bien.type}/${bien.id}`}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[#101820] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#26323d]"
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
