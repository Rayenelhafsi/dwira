import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Calendar, AlertCircle, Search, ArrowDownUp, Eye, Download, Upload, Trash2, Plus, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import AvailabilityCalendar from '../../components/AvailabilityCalendar';
import { calculateAccommodationPricing, type SeasonalPricingPeriod } from '../../utils/seasonalPricing';
import { computeGuestLimits } from '../../utils/guestLimits';
import { getServiceDisplayPrice, splitServicesByTarification } from '../../utils/servicePayants';

const API_URL = import.meta.env.VITE_API_URL || '/api';

async function getApiErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || '').trim();
    if (message) return message;
  } else {
    const text = await response.text().catch(() => '');
    if (text && !text.startsWith('<!DOCTYPE')) return text;
  }
  return fallback;
}

type ContratApi = {
  id: string;
  bien_id: string;
  locataire_id: string;
  date_debut: string;
  date_fin: string;
  montant_recu: number;
  url_pdf?: string;
  owner_url_pdf?: string;
  origine?: 'manuel' | 'automatique' | string;
  statut: 'actif' | 'termine' | 'resilie';
  created_at: string;
  bien_titre?: string;
  locataire_nom?: string;
};

type BienApi = {
  id: string;
  mode?: string;
  type?: string;
  reference?: string;
  proprietaire_nom?: string;
  titre?: string;
  prix_nuitee?: number;
  prix_semaine?: number | null;
  caution?: number | null;
  guests?: number;
  pricing_periods?: Array<{
    id?: string;
    start?: string;
    end?: string;
    start_date?: string;
    end_date?: string;
    prix_nuitee?: number;
    prix_semaine?: number | null;
  }>;
  location_saisonniere_config?: {
    limite_personnes_nuit?: number;
    limitePersonnesNuit?: number;
    limite_personne_nuit?: number;
    max_adultes?: number;
    max_enfants?: number;
    avance_pourcentage?: number;
    avancePourcentage?: number;
    montant_caution?: number;
    montantCaution?: number;
  };
  image_url?: string;
  image?: string;
};

type MediaApi = {
  id: string;
  bien_id: string;
  type?: string;
  url?: string;
  motif_upload?: string | null;
  position?: number | null;
};

type LocataireApi = {
  id: string;
  nom: string;
};

type UnavailableDateApi = {
  id?: string;
  start_date: string;
  end_date: string;
  status: 'blocked' | 'pending' | 'booked';
};

type SortOption = 'created_desc' | 'created_asc' | 'start_desc' | 'start_asc';
type OriginFilter = 'all' | 'manuel' | 'automatique';
type ManualStep = 1 | 2 | 3;

type ManualReservationDraft = {
  client_first_name: string;
  client_last_name: string;
  client_email: string;
  client_telephone: string;
  client_address: string;
  identity_document_type: 'cin_tn' | 'passport_tn' | 'passport_foreign';
  identity_document_number: string;
  representative: 'chayma' | 'ghaith';
  arrival_time: string;
  departure_time: string;
  payment_id: string;
  payment_deadline_date: string;
  payment_deadline_time: string;
  signature_city: string;
  service_1: string;
  prix_service_1: string;
  service_2: string;
  prix_service_2: string;
  service_3: string;
  prix_service_3: string;
  adult_guests: string;
  child_guests: string;
  caution_amount: string;
  total_amount: string;
  amount_due_now: string;
  payment_mode: 'avance' | 'totalite';
  payment_method: 'virement' | 'especes' | 'carte' | 'cheque';
  client_note: string;
};

const MANUAL_DEFAULT: ManualReservationDraft = {
  client_first_name: '',
  client_last_name: '',
  client_email: '',
  client_telephone: '',
  client_address: '',
  identity_document_type: 'cin_tn',
  identity_document_number: '',
  representative: 'ghaith',
  arrival_time: '14:00',
  departure_time: '11:00',
  payment_id: '',
  payment_deadline_date: '',
  payment_deadline_time: '',
  signature_city: '',
  service_1: '',
  prix_service_1: '',
  service_2: '',
  prix_service_2: '',
  service_3: '',
  prix_service_3: '',
  adult_guests: '1',
  child_guests: '0',
  caution_amount: '',
  total_amount: '',
  amount_due_now: '',
  payment_mode: 'avance',
  payment_method: 'virement',
  client_note: '',
};

const BIEN_IMAGE_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23e5e7eb'/%3E%3Cpath d='M150 240l90-88 62 62 52-52 88 78H150z' fill='%23cbd5e1'/%3E%3Ccircle cx='232' cy='124' r='30' fill='%23cbd5e1'/%3E%3C/svg%3E";

function computeNights(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const startUtc = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endUtc = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.max(1, Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000)));
}

function toSqlDate(value: Date | null): string {
  if (!value) return '';
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toAbsoluteAssetUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const apiOrigin = /^https?:\/\//i.test(API_URL)
    ? new URL(API_URL).origin
    : window.location.origin;
  if (raw.startsWith('/')) return `${apiOrigin}${raw}`;
  return `${apiOrigin}/${raw}`;
}

export default function ContratsPage() {
  const [contrats, setContrats] = useState<ContratApi[]>([]);
  const [biens, setBiens] = useState<BienApi[]>([]);
  const [locataires, setLocataires] = useState<LocataireApi[]>([]);
  const [bienImageById, setBienImageById] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingContratId, setUploadingContratId] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');

  const [searchLocataire, setSearchLocataire] = useState('');
  const [searchProprietaire, setSearchProprietaire] = useState('');
  const [searchReference, setSearchReference] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created_desc');

  const [manualOpen, setManualOpen] = useState(false);
  const [manualStep, setManualStep] = useState<ManualStep>(1);
  const [manualDraft, setManualDraft] = useState<ManualReservationDraft>(MANUAL_DEFAULT);
  const [manualBienSearch, setManualBienSearch] = useState('');
  const [selectedBienId, setSelectedBienId] = useState('');
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [selectedBienUnavailableDates, setSelectedBienUnavailableDates] = useState<UnavailableDateApi[]>([]);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [loadingManualCalendar, setLoadingManualCalendar] = useState(false);
  const [selectedManualServiceIds, setSelectedManualServiceIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const [contratsResult, biensResult, locatairesResult] = await Promise.allSettled([
      fetch(`${API_URL}/contrats`, { credentials: 'include' }),
      fetch(`${API_URL}/biens`, { credentials: 'include' }),
      fetch(`${API_URL}/locataires`, { credentials: 'include' }),
    ]);

    let hasAnyData = false;
    const errors: string[] = [];

    if (contratsResult.status === 'fulfilled' && contratsResult.value.ok) {
      const contratsData = await contratsResult.value.json();
      setContrats(Array.isArray(contratsData) ? contratsData : []);
      hasAnyData = true;
    } else {
      setContrats([]);
      errors.push('contrats');
    }

    if (biensResult.status === 'fulfilled' && biensResult.value.ok) {
      const biensData = await biensResult.value.json();
      const normalizedBiens = Array.isArray(biensData) ? biensData : [];
      setBiens(normalizedBiens);
      const bienIds = normalizedBiens.map((row: any) => String(row?.id || '').trim()).filter(Boolean);
      if (bienIds.length > 0) {
        try {
          const mediaResponse = await fetch(`${API_URL}/media-bulk?bien_ids=${encodeURIComponent(bienIds.join(','))}`, { credentials: 'include' });
          if (mediaResponse.ok) {
            const mediaRows = await mediaResponse.json();
            const grouped = new Map<string, MediaApi[]>();
            for (const media of (Array.isArray(mediaRows) ? mediaRows : []) as MediaApi[]) {
              const bienId = String(media?.bien_id || '').trim();
              if (!bienId) continue;
              const list = grouped.get(bienId) || [];
              list.push(media);
              grouped.set(bienId, list);
            }
            const nextImages: Record<string, string> = {};
            for (const bienId of bienIds) {
              const medias = (grouped.get(bienId) || [])
                .filter((m) => String(m?.type || 'image').toLowerCase() !== 'video')
                .filter((m) => {
                  const motif = String(m?.motif_upload || '');
                  const isProof = motif === 'preuve_type_rue'
                    || motif === 'preuve_type_papier'
                    || motif.startsWith('preuve_type_rue|')
                    || motif.startsWith('preuve_type_papier|');
                  return !isProof;
                })
                .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
              const first = String(medias[0]?.url || '').trim();
              if (!first) continue;
              nextImages[bienId] = toAbsoluteAssetUrl(first);
            }
            setBienImageById(nextImages);
          } else {
            setBienImageById({});
          }
        } catch {
          setBienImageById({});
        }
      } else {
        setBienImageById({});
      }
      hasAnyData = true;
    } else {
      setBiens([]);
      setBienImageById({});
      errors.push('biens');
    }

    if (locatairesResult.status === 'fulfilled' && locatairesResult.value.ok) {
      const locatairesData = await locatairesResult.value.json();
      setLocataires(Array.isArray(locatairesData) ? locatairesData : []);
      hasAnyData = true;
    } else {
      setLocataires([]);
      errors.push('locataires');
    }

    if (errors.length > 0) {
      const message = `Chargement partiel: ${errors.join(', ')}`;
      setError(hasAnyData ? message : 'Impossible de charger les donnees');
      toast.error(message);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const bienId = String(selectedBienId || '').trim();
    if (!manualOpen || manualStep !== 3 || !bienId) {
      setSelectedBienUnavailableDates([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingManualCalendar(true);
      try {
        const response = await fetch(`${API_URL}/unavailable-dates/${encodeURIComponent(bienId)}`, { credentials: 'include' });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Impossible de charger le calendrier du bien'));
        const rows = await response.json();
        if (!cancelled) {
          setSelectedBienUnavailableDates(Array.isArray(rows) ? rows : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSelectedBienUnavailableDates([]);
          toast.error(err?.message || 'Impossible de charger le calendrier');
        }
      } finally {
        if (!cancelled) setLoadingManualCalendar(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manualOpen, manualStep, selectedBienId]);

  const bienById = useMemo(() => {
    const map = new Map<string, BienApi>();
    for (const bien of biens) map.set(bien.id, bien);
    return map;
  }, [biens]);

  const selectedBien = useMemo(() => {
    const id = String(selectedBienId || '').trim();
    return id ? (bienById.get(id) || null) : null;
  }, [bienById, selectedBienId]);
  const selectedSeasonalConfig = useMemo(() => {
    const cfg = (selectedBien as any)?.location_saisonniere_config || {};
    return cfg && typeof cfg === 'object' ? cfg : {};
  }, [selectedBien]);
  const guestCaps = useMemo(() => {
    const fallbackGuests = Math.max(1, Number((selectedBien as any)?.guests || 1));
    const limits = computeGuestLimits({
      fallbackGuests,
      maxGuestsCap: Number(selectedSeasonalConfig?.limite_personnes_nuit ?? selectedSeasonalConfig?.limitePersonnesNuit ?? selectedSeasonalConfig?.limite_personne_nuit),
      maxAdultsCap: Number(selectedSeasonalConfig?.max_adultes),
      maxChildrenCap: Number(selectedSeasonalConfig?.max_enfants),
    });
    return {
      maxGuests: limits.maxGuests,
      maxAdults: limits.maxAdultGuests,
      maxChildren: limits.maxChildGuests,
    };
  }, [selectedBien, selectedSeasonalConfig]);

  const filteredAndSorted = useMemo(() => {
    const locataireQuery = searchLocataire.trim().toLowerCase();
    const proprietaireQuery = searchProprietaire.trim().toLowerCase();
    const referenceQuery = searchReference.trim().toLowerCase();

    const filtered = contrats.filter((contrat) => {
      const bien = bienById.get(contrat.bien_id);
      const locataireNom = (contrat.locataire_nom || '').toLowerCase();
      const proprietaireNom = (bien?.proprietaire_nom || '').toLowerCase();
      const referenceBien = (bien?.reference || '').toLowerCase();
      const normalizedOrigin = String(contrat.origine || 'automatique').toLowerCase() === 'manuel' ? 'manuel' : 'automatique';

      const matchesLocataire = !locataireQuery || locataireNom.includes(locataireQuery);
      const matchesProprietaire = !proprietaireQuery || proprietaireNom.includes(proprietaireQuery);
      const matchesReference = !referenceQuery || referenceBien.includes(referenceQuery);
      const matchesOrigin = originFilter === 'all' || normalizedOrigin === originFilter;

      let matchesDate = true;
      if (filterDate) {
        const target = new Date(filterDate);
        const start = new Date(contrat.date_debut);
        const end = new Date(contrat.date_fin);
        const created = new Date(contrat.created_at);
        matchesDate =
          (target >= start && target <= end) ||
          created.toISOString().slice(0, 10) === filterDate;
      }

      return matchesLocataire && matchesProprietaire && matchesReference && matchesOrigin && matchesDate;
    });

    return [...filtered].sort((a, b) => {
      const createdA = new Date(a.created_at).getTime();
      const createdB = new Date(b.created_at).getTime();
      const startA = new Date(a.date_debut).getTime();
      const startB = new Date(b.date_debut).getTime();

      if (sortBy === 'created_asc') return createdA - createdB;
      if (sortBy === 'start_desc') return startB - startA;
      if (sortBy === 'start_asc') return startA - startB;
      return createdB - createdA;
    });
  }, [contrats, bienById, searchLocataire, searchProprietaire, searchReference, filterDate, sortBy, originFilter]);

  const availableBiensForManual = useMemo(() => {
    const query = manualBienSearch.trim().toLowerCase();
    return biens
      .filter((bien) => String(bien.mode || '').toLowerCase() !== 'vente')
      .filter((bien) => {
        if (!query) return true;
        const ref = String(bien.reference || '').toLowerCase();
        const title = String(bien.titre || '').toLowerCase();
        return ref.includes(query) || title.includes(query);
      });
  }, [biens, manualBienSearch]);

  const manualNights = useMemo(() => computeNights(selectedStart, selectedEnd), [selectedStart, selectedEnd]);
  const manualStartDateSql = useMemo(() => toSqlDate(selectedStart), [selectedStart]);
  const manualEndDateSql = useMemo(() => toSqlDate(selectedEnd), [selectedEnd]);
  const manualPeriodReady = !!manualStartDateSql && !!manualEndDateSql && manualEndDateSql >= manualStartDateSql;

  const baseNightly = Math.max(0, Number(selectedBien?.prix_nuitee || 0));
  const baseWeekly = Number(selectedBien?.prix_semaine || 0) > 0 ? Number(selectedBien?.prix_semaine || 0) : null;
  const normalizedPricingPeriods = useMemo<SeasonalPricingPeriod[]>(() => (
    (Array.isArray(selectedBien?.pricing_periods) ? selectedBien?.pricing_periods : [])
      .map((period, index) => {
        const start = String(period?.start || period?.start_date || '').slice(0, 10);
        const end = String(period?.end || period?.end_date || '').slice(0, 10);
        const nightly = Number(period?.prix_nuitee || 0);
        const weekly = period?.prix_semaine === null || period?.prix_semaine === undefined ? null : Number(period?.prix_semaine || 0);
        if (!start || !end || !Number.isFinite(nightly) || nightly <= 0) return null;
        return {
          id: String(period?.id || `manual-${index}`),
          start,
          end,
          prix_nuitee: nightly,
          prix_semaine: Number.isFinite(Number(weekly)) && Number(weekly) > 0 ? Number(weekly) : null,
        } as SeasonalPricingPeriod;
      })
      .filter(Boolean) as SeasonalPricingPeriod[]
  ), [selectedBien?.pricing_periods]);
  const pricingSummary = useMemo(() => {
    if (!manualPeriodReady) {
      return { nights: 0, total: 0, averageNightlyPrice: 0, hasPeriodOverride: false };
    }
    return calculateAccommodationPricing({
      startDate: manualStartDateSql,
      endDate: manualEndDateSql,
      defaultNightlyPrice: baseNightly,
      defaultWeeklyPrice: baseWeekly,
      pricingPeriods: normalizedPricingPeriods,
    });
  }, [manualPeriodReady, manualStartDateSql, manualEndDateSql, baseNightly, baseWeekly, normalizedPricingPeriods]);
  const baseCaution = Math.max(
    0,
    Number((selectedSeasonalConfig?.montant_caution ?? selectedSeasonalConfig?.montantCaution ?? selectedBien?.caution) || 0)
  );
  const advancePercent = Math.min(
    100,
    Math.max(1, Number((selectedSeasonalConfig?.avance_pourcentage ?? selectedSeasonalConfig?.avancePourcentage) || 30))
  );
  const manualAdultGuests = Math.max(1, Number(manualDraft.adult_guests || 1));
  const manualChildGuests = Math.max(0, Number(manualDraft.child_guests || 0));
  const manualGuestsTotal = Math.max(1, manualAdultGuests + manualChildGuests);
  const resolvedManualCaution = baseCaution;
  const resolvedManualTotal = pricingSummary.total;
  const resolvedManualDueNow = manualDraft.payment_mode === 'totalite'
    ? resolvedManualTotal
    : Math.round((resolvedManualTotal * advancePercent) / 100);

  const getPdfUrl = (url?: string) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${window.location.origin}${url}`;
  };

  const handlePreviewPdf = (url?: string) => {
    const pdfUrl = getPdfUrl(url);
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPdf = (contratId: string, url?: string) => {
    const pdfUrl = getPdfUrl(url);
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `contrat-${contratId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUploadContractPdf = async (contrat: ContratApi, file?: File | null) => {
    if (!file) return;
    setUploadingContratId(contrat.id);
    try {
      const formData = new FormData();
      formData.append('contract', file);
      const uploadResponse = await fetch(`${API_URL}/upload-contract`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error('Upload PDF impossible');
      const uploadData = await uploadResponse.json();

      const updateResponse = await fetch(`${API_URL}/contrats/${contrat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_pdf: uploadData.url }),
      });
      if (!updateResponse.ok) throw new Error(await getApiErrorMessage(updateResponse, 'Mise a jour contrat impossible'));

      await fetchData();
      toast.success('PDF du contrat mis a jour');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erreur upload contrat');
    } finally {
      setUploadingContratId(null);
    }
  };

  const handleDeleteContract = async (contratId: string) => {
    const confirmed = window.confirm('Supprimer ce contrat ?');
    if (!confirmed) return;
    try {
      const response = await fetch(`${API_URL}/contrats/${contratId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Suppression contrat impossible'));
      toast.success('Contrat supprime');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erreur suppression contrat');
    }
  };

  const resetManualWizard = () => {
    setManualOpen(false);
    setManualStep(1);
    setManualDraft(MANUAL_DEFAULT);
    setManualBienSearch('');
    setSelectedBienId('');
    setSelectedStart(null);
    setSelectedEnd(null);
    setSelectedBienUnavailableDates([]);
    setSelectedManualServiceIds([]);
  };

  const goToManualStep2 = () => {
    const first = manualDraft.client_first_name.trim();
    const last = manualDraft.client_last_name.trim();
    const email = manualDraft.client_email.trim();
    const doc = manualDraft.identity_document_number.trim();
    if (!first || !last || !email || !doc) {
      toast.error('Remplissez les informations client obligatoires');
      return;
    }
    if (!Number.isFinite(manualAdultGuests) || manualAdultGuests < 1) {
      toast.error('Le nombre d adultes doit etre >= 1');
      return;
    }
    if (!Number.isFinite(manualChildGuests) || manualChildGuests < 0) {
      toast.error('Le nombre d enfants doit etre >= 0');
      return;
    }
    setManualStep(2);
  };

  const goToManualStep3 = () => {
    if (!selectedBienId) {
      toast.error('Selectionnez un bien');
      return;
    }
    setManualDraft((prev) => {
      const adults = Math.min(Math.max(1, Number(prev.adult_guests || 1)), guestCaps.maxAdults, guestCaps.maxGuests);
      const children = Math.min(Math.max(0, Number(prev.child_guests || 0)), guestCaps.maxChildren, Math.max(0, guestCaps.maxGuests - adults));
      return { ...prev, adult_guests: String(adults), child_guests: String(children) };
    });
    setManualStep(3);
  };

  const seasonalServices = useMemo(() => {
    const raw = (selectedSeasonalConfig as any)?.services_payants || (selectedSeasonalConfig as any)?.servicesPayants || [];
    return splitServicesByTarification(Array.isArray(raw) ? raw : []).all;
  }, [selectedSeasonalConfig]);

  const selectedSeasonalServices = useMemo(
    () => seasonalServices.filter((service) => selectedManualServiceIds.includes(String(service.id))),
    [seasonalServices, selectedManualServiceIds]
  );

  const fixedSeasonalServicesTotal = useMemo(
    () => selectedSeasonalServices
      .filter((service) => service.type_tarification === 'fixe')
      .reduce((sum, service) => sum + Number(service.prix || 0), 0),
    [selectedSeasonalServices]
  );

  const handleCreateManualReservation = async () => {
    if (!selectedBienId || !manualStartDateSql || !manualEndDateSql) {
      toast.error('Selectionnez un bien et une periode');
      return;
    }
    if (manualEndDateSql < manualStartDateSql) {
      toast.error('La date de fin doit etre apres la date de debut');
      return;
    }
    if (manualGuestsTotal > guestCaps.maxGuests) {
      toast.error(`Le nombre max de voyageurs pour ce bien est ${guestCaps.maxGuests}`);
      return;
    }
    if (manualAdultGuests > guestCaps.maxAdults) {
      toast.error(`Le nombre max d adultes pour ce bien est ${guestCaps.maxAdults}`);
      return;
    }
    if (manualChildGuests > guestCaps.maxChildren) {
      toast.error(`Le nombre max d enfants pour ce bien est ${guestCaps.maxChildren}`);
      return;
    }

    setManualSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/contrats/manual-reservation`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bien_id: selectedBienId,
          start_date: manualStartDateSql,
          end_date: manualEndDateSql,
          guests: manualGuestsTotal,
          adult_guests: manualAdultGuests,
          child_guests: manualChildGuests,
          caution_amount: resolvedManualCaution,
          payment_mode: manualDraft.payment_mode,
          total_amount: resolvedManualTotal + fixedSeasonalServicesTotal,
          amount_due_now: manualDraft.payment_mode === 'totalite'
            ? (resolvedManualTotal + fixedSeasonalServicesTotal)
            : Math.round(((resolvedManualTotal + fixedSeasonalServicesTotal) * advancePercent) / 100),
          client_note: manualDraft.client_note,
          client_first_name: manualDraft.client_first_name,
          client_last_name: manualDraft.client_last_name,
          client_email: manualDraft.client_email,
          client_telephone: manualDraft.client_telephone,
          client_address: manualDraft.client_address,
          identity_document_type: manualDraft.identity_document_type,
          identity_document_number: manualDraft.identity_document_number,
          representative: manualDraft.representative,
          arrival_time: manualDraft.arrival_time,
          departure_time: manualDraft.departure_time,
          payment_id: manualDraft.payment_id,
          payment_method: manualDraft.payment_method,
          payment_deadline_date: manualDraft.payment_deadline_date,
          payment_deadline_time: manualDraft.payment_deadline_time,
          signature_city: manualDraft.signature_city,
          service_1: selectedSeasonalServices[0]?.label || '',
          prix_service_1: String(selectedSeasonalServices[0]?.prix || ''),
          service_2: selectedSeasonalServices[1]?.label || '',
          prix_service_2: String(selectedSeasonalServices[1]?.prix || ''),
          service_3: selectedSeasonalServices[2]?.label || '',
          prix_service_3: String(selectedSeasonalServices[2]?.prix || ''),
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Creation reservation manuelle impossible'));
      toast.success('Reservation manuelle creee avec contrat');
      await fetchData();
      resetManualWizard();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erreur creation reservation manuelle');
    } finally {
      setManualSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestion des Contrats</h1>
        {!manualOpen ? (
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus size={16} />
            Contrat manuel
          </button>
        ) : (
          <button
            type="button"
            onClick={resetManualWizard}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Fermer
          </button>
        )}
      </div>

      {manualOpen && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={16} />
            Contrat manuel - Etape {manualStep}/3
          </div>

          {manualStep === 1 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Informations client</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Prenom *" value={manualDraft.client_first_name} onChange={(e) => setManualDraft((p) => ({ ...p, client_first_name: e.target.value }))} />
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Nom *" value={manualDraft.client_last_name} onChange={(e) => setManualDraft((p) => ({ ...p, client_last_name: e.target.value }))} />
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Email *" value={manualDraft.client_email} onChange={(e) => setManualDraft((p) => ({ ...p, client_email: e.target.value }))} />
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Telephone" value={manualDraft.client_telephone} onChange={(e) => setManualDraft((p) => ({ ...p, client_telephone: e.target.value }))} />
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Adresse locataire" value={manualDraft.client_address} onChange={(e) => setManualDraft((p) => ({ ...p, client_address: e.target.value }))} />
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={manualDraft.identity_document_type} onChange={(e) => setManualDraft((p) => ({ ...p, identity_document_type: e.target.value as ManualReservationDraft['identity_document_type'] }))}>
                  <option value="cin_tn">CIN tunisienne</option>
                  <option value="passport_tn">Passeport tunisien</option>
                  <option value="passport_foreign">Passeport etranger</option>
                </select>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Numero identite *" value={manualDraft.identity_document_number} onChange={(e) => setManualDraft((p) => ({ ...p, identity_document_number: e.target.value }))} />
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={manualDraft.representative} onChange={(e) => setManualDraft((p) => ({ ...p, representative: e.target.value as ManualReservationDraft['representative'] }))}>
                  <option value="ghaith">Representant: Ghaith</option>
                  <option value="chayma">Representant: Chayma</option>
                </select>
                <input type="time" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Heure arrivee" value={manualDraft.arrival_time} onChange={(e) => setManualDraft((p) => ({ ...p, arrival_time: e.target.value }))} />
                <input type="time" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Heure depart" value={manualDraft.departure_time} onChange={(e) => setManualDraft((p) => ({ ...p, departure_time: e.target.value }))} />
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="ID paiement (VIR-..., CASH-...)" value={manualDraft.payment_id} onChange={(e) => setManualDraft((p) => ({ ...p, payment_id: e.target.value }))} />
                <input type="date" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Date limite paiement" value={manualDraft.payment_deadline_date} onChange={(e) => setManualDraft((p) => ({ ...p, payment_deadline_date: e.target.value }))} />
                <input type="time" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Heure limite paiement" value={manualDraft.payment_deadline_time} onChange={(e) => setManualDraft((p) => ({ ...p, payment_deadline_time: e.target.value }))} />
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Ville signature (optionnel)" value={manualDraft.signature_city} onChange={(e) => setManualDraft((p) => ({ ...p, signature_city: e.target.value }))} />
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={manualDraft.payment_method} onChange={(e) => setManualDraft((p) => ({ ...p, payment_method: e.target.value as ManualReservationDraft['payment_method'] }))}>
                  <option value="virement">Methode paiement: Virement</option>
                  <option value="especes">Methode paiement: Especes</option>
                  <option value="carte">Methode paiement: Carte</option>
                  <option value="cheque">Methode paiement: Cheque</option>
                </select>
              </div>
              <textarea className="w-full rounded-lg border px-3 py-2 text-sm" rows={2} placeholder="Note client (optionnel)" value={manualDraft.client_note} onChange={(e) => setManualDraft((p) => ({ ...p, client_note: e.target.value }))} />
              <div className="flex justify-end">
                <button type="button" onClick={goToManualStep2} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Suivant
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {manualStep === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-900">Selection du bien</h2>
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input value={manualBienSearch} onChange={(e) => setManualBienSearch(e.target.value)} placeholder="Filtrer par reference ou titre" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-auto pr-1">
                {availableBiensForManual.map((bien) => {
                  const isSelected = selectedBienId === bien.id;
                  const imageSrc = bienImageById[bien.id]
                    || toAbsoluteAssetUrl(String(bien.image_url || bien.image || ''))
                    || BIEN_IMAGE_FALLBACK;
                  return (
                    <button
                      key={bien.id}
                      type="button"
                      onClick={() => setSelectedBienId(bien.id)}
                      className={`text-left rounded-lg border p-3 transition ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'}`}
                    >
                      <div className="mb-2 h-24 w-full overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                        <img
                          src={imageSrc}
                          alt={bien.titre || bien.reference || 'Bien'}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(event) => {
                            if (event.currentTarget.src !== BIEN_IMAGE_FALLBACK) {
                              event.currentTarget.src = BIEN_IMAGE_FALLBACK;
                            }
                          }}
                        />
                      </div>
                      <p className="text-xs font-semibold text-gray-500">{bien.reference || bien.id}</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 line-clamp-2">{bien.titre || 'Bien'}</p>
                      <p className="mt-1 text-xs text-gray-600">Prix nuit base: {Number(bien.prix_nuitee || 0)} DT</p>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setManualStep(1)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  <ArrowLeft size={15} />
                  Retour
                </button>
                <button type="button" onClick={goToManualStep3} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Suivant
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {manualStep === 3 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Periode de reservation</h2>
              {selectedBien ? (
                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                  <p><strong>Bien:</strong> {selectedBien.reference || selectedBien.id} - {selectedBien.titre || 'Bien'}</p>
                </div>
              ) : null}
              {loadingManualCalendar ? (
                <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">Chargement du calendrier...</div>
              ) : (
                <AvailabilityCalendar
                  unavailableDates={selectedBienUnavailableDates.map((row) => ({
                    start: String(row.start_date || '').slice(0, 10),
                    end: String(row.end_date || '').slice(0, 10),
                    status: row.status,
                  }))}
                  onDateRangeSelect={(start, end) => {
                    setSelectedStart(start);
                    setSelectedEnd(end);
                  }}
                  selectedStart={selectedStart}
                  selectedEnd={selectedEnd}
                />
              )}
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                <p><strong>Periode:</strong> {manualStartDateSql || '-'} au {manualEndDateSql || '-'}</p>
                <p><strong>Nuits:</strong> {manualNights || 0}</p>
                <p><strong>Tarif applique:</strong> {pricingSummary.hasPeriodOverride ? 'Periode tarifaire' : 'Tarif standard'} ({baseNightly} DT/nuit{baseWeekly ? `, ${baseWeekly} DT/semaine` : ''})</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={1}
                    max={guestCaps.maxAdults}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder={`Adultes (max ${guestCaps.maxAdults})`}
                    value={manualDraft.adult_guests}
                    onChange={(e) => {
                      const nextAdults = Math.min(Math.max(1, Number(e.target.value || 1)), guestCaps.maxAdults, guestCaps.maxGuests);
                      const nextChildren = Math.min(Math.max(0, Number(manualDraft.child_guests || 0)), guestCaps.maxChildren, Math.max(0, guestCaps.maxGuests - nextAdults));
                      setManualDraft((p) => ({ ...p, adult_guests: String(nextAdults), child_guests: String(nextChildren) }));
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={guestCaps.maxChildren}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder={`Enfants (max ${guestCaps.maxChildren})`}
                    value={manualDraft.child_guests}
                    onChange={(e) => {
                      const nextChildren = Math.min(Math.max(0, Number(e.target.value || 0)), guestCaps.maxChildren, Math.max(0, guestCaps.maxGuests - manualAdultGuests));
                      setManualDraft((p) => ({ ...p, child_guests: String(nextChildren) }));
                    }}
                  />
                  <input type="text" readOnly className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm" value={`Voyageurs total: ${manualGuestsTotal} / ${guestCaps.maxGuests}`} />
                </div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={manualDraft.payment_mode}
                    disabled={!manualPeriodReady}
                    onChange={(e) => setManualDraft((p) => ({ ...p, payment_mode: e.target.value as ManualReservationDraft['payment_mode'] }))}
                  >
                    <option value="avance">Avance ({advancePercent}%)</option>
                    <option value="totalite">Totalite</option>
                  </select>
                  <input
                    type="number"
                    readOnly
                    className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm"
                    value={resolvedManualCaution}
                  />
                </div>
                <p><strong>Voyageurs:</strong> {manualGuestsTotal} (Adultes: {manualAdultGuests}, Enfants: {manualChildGuests})</p>
                {seasonalServices.length > 0 && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-bold uppercase text-gray-600">Services supplementaires</p>
                    <div className="space-y-2 max-h-44 overflow-auto pr-1">
                      {seasonalServices.map((service) => {
                        const checked = selectedManualServiceIds.includes(String(service.id));
                        return (
                          <label key={service.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                            <span className="min-w-0 pr-2">
                              <span className="block truncate font-semibold text-gray-900">{service.label}</span>
                              <span className="block truncate text-xs text-gray-500">{service.categorie}</span>
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-gray-700">{getServiceDisplayPrice(service)}</span>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedManualServiceIds((prev) => (
                                    checked
                                      ? prev.filter((id) => id !== String(service.id))
                                      : [...prev, String(service.id)]
                                  ));
                                }}
                              />
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-gray-600">Total services fixes: {fixedSeasonalServicesTotal} DT</p>
                  </div>
                )}
                <p><strong>Total:</strong> {resolvedManualTotal + fixedSeasonalServicesTotal} DT</p>
                <p><strong>A payer maintenant:</strong> {manualDraft.payment_mode === 'totalite' ? (resolvedManualTotal + fixedSeasonalServicesTotal) : Math.round(((resolvedManualTotal + fixedSeasonalServicesTotal) * advancePercent) / 100)} DT ({manualDraft.payment_mode === 'totalite' ? 'Totalite' : `Avance ${advancePercent}%`})</p>
                <p><strong>Caution:</strong> {resolvedManualCaution} DT</p>
              </div>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setManualStep(2)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  <ArrowLeft size={15} />
                  Retour
                </button>
                <button type="button" onClick={handleCreateManualReservation} disabled={manualSubmitting || !manualStartDateSql || !manualEndDateSql} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {manualSubmitting ? 'Confirmation...' : 'Confirmer et reserver'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={searchLocataire} onChange={(e) => setSearchLocataire(e.target.value)} placeholder="Nom locataire" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={searchProprietaire} onChange={(e) => setSearchProprietaire(e.target.value)} placeholder="Nom proprietaire" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={searchReference} onChange={(e) => setSearchReference(e.target.value)} placeholder="Reference bien" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
          </div>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value as OriginFilter)} className="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="all">Toutes origines</option>
            <option value="manuel">Manuel</option>
            <option value="automatique">Automatique</option>
          </select>
          <div className="relative">
            <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm">
              <option value="created_desc">Plus recents</option>
              <option value="created_asc">Plus anciens</option>
              <option value="start_desc">Debut recent vers ancien</option>
              <option value="start_asc">Debut ancien vers recent</option>
            </select>
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500">{filteredAndSorted.length} contrat(s) trouve(s)</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filteredAndSorted.map((contrat) => {
          const bien = bienById.get(contrat.bien_id);
          const origin = String(contrat.origine || 'automatique').toLowerCase() === 'manuel' ? 'manuel' : 'automatique';
          return (
            <div key={contrat.id} className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3 sm:mb-4">
                <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                  <FileText size={20} className="sm:w-6 sm:h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${origin === 'manuel' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'}`}>
                    {origin}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${contrat.statut === 'actif' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {contrat.statut}
                  </span>
                </div>
              </div>

              <h3 className="font-bold text-base sm:text-lg text-gray-900 mb-1 truncate">{contrat.bien_titre || bien?.titre || 'Bien Inconnu'}</h3>
              <p className="text-xs sm:text-sm text-gray-500 mb-1 truncate">Locataire: {contrat.locataire_nom || 'Inconnu'}</p>
              <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 truncate">Proprietaire: {bien?.proprietaire_nom || 'Inconnu'} - Ref: {bien?.reference || '-'}</p>

              <div className="space-y-2 text-xs sm:text-sm text-gray-600 border-t pt-3 sm:pt-4">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-gray-400 flex-shrink-0 sm:w-4 sm:h-4" />
                  <span className="truncate">Du {new Date(contrat.date_debut).toLocaleDateString()} au {new Date(contrat.date_fin).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-gray-400 flex-shrink-0 sm:w-4 sm:h-4" />
                  <span>Montant recu: {Number(contrat.montant_recu || 0)} DT</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button type="button" onClick={() => handlePreviewPdf(contrat.url_pdf)} disabled={!contrat.url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  <Eye size={16} /> Visualiser
                </button>
                <button type="button" onClick={() => handleDownloadPdf(contrat.id, contrat.url_pdf)} disabled={!contrat.url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50">
                  <Download size={16} /> Telecharger
                </button>
                <button type="button" onClick={() => handlePreviewPdf(contrat.owner_url_pdf)} disabled={!contrat.owner_url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                  <Eye size={16} /> Visualiser proprietaire
                </button>
                <button type="button" onClick={() => handleDownloadPdf(`${contrat.id}-owner`, contrat.owner_url_pdf)} disabled={!contrat.owner_url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50">
                  <Download size={16} /> Telecharger proprietaire
                </button>
                <label className="col-span-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                  <Upload size={16} />
                  {uploadingContratId === contrat.id ? 'Upload en cours...' : 'Uploader / Remplacer PDF'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={uploadingContratId === contrat.id}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      handleUploadContractPdf(contrat, file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <button type="button" onClick={() => handleDeleteContract(contrat.id)} className="col-span-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50">
                  <Trash2 size={16} /> Supprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredAndSorted.length === 0 && (
        <div className="text-center py-10 bg-white rounded-lg border border-gray-100 text-gray-500">
          Aucun contrat ne correspond aux filtres.
        </div>
      )}
    </div>
  );
}
