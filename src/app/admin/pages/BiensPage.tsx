import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, MapPin, Home, Banknote, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Image as ImageIcon, Bed, Bath, Maximize, Sofa, ArrowLeft, Trash, Save, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { mockZones, mockProprietaires } from '../data/mockData';
import { Bien, BienStatut, Media, DateStatus, BienType, BienMode, Zone, Proprietaire, Caracteristique, TypeRueAppartementVente, TypePapierAppartementVente, TypeTerrainVente, TarificationMethodeVente, ModalitePaiementVente } from '../types';
import * as Dialog from '@radix-ui/react-dialog';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, addMonths, subMonths, startOfWeek, endOfWeek, isWithinInterval, parseISO, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { useProperties } from '../../context/PropertiesContext';

const statusColors: Record<BienStatut, string> = { disponible: "bg-emerald-100 text-emerald-800 border-emerald-200", loue: "bg-blue-100 text-blue-800 border-blue-200", reserve: "bg-amber-100 text-amber-800 border-amber-200", maintenance: "bg-red-100 text-red-800 border-red-200", bloque: "bg-gray-200 text-gray-800 border-gray-300" };
const statusLabels: Record<BienStatut, string> = { disponible: "Disponible", loue: "Loué", reserve: "Réservé", maintenance: "Maintenance", bloque: "Bloqué" };
const modeLabels: Record<BienMode, string> = {
  vente: "Vente",
  location_annuelle: "Location annuelle",
  location_saisonniere: "Location saisonniere",
};
const typeLabels: Record<BienType, string> = {
  appartement: "Appartement",
  villa_maison: "Villa/Maison",
  studio: "Studio",
  immeuble: "Immeuble",
  terrain: "Terrain",
  local_commercial: "Local commercial",
  bungalow: "Bungalow",
  S1: "Appartement",
  S2: "Appartement",
  S3: "Appartement",
  S4: "Appartement",
  villa: "Villa/Maison",
  local: "Local commercial",
};
const BIEN_TYPES_BY_MODE: Record<BienMode, BienType[]> = {
  vente: ['appartement', 'villa_maison', 'studio', 'immeuble', 'terrain', 'local_commercial'],
  location_saisonniere: ['appartement', 'villa_maison', 'bungalow', 'studio'],
  location_annuelle: ['appartement', 'local_commercial', 'villa_maison'],
};
const TYPE_RUE_LABELS: Record<TypeRueAppartementVente, string> = {
  piste: 'Piste',
  route_goudronnee: 'Route goudronnée',
  rue_residentielle: 'Rue résidentielle',
};
const TYPE_PAPIER_LABELS: Record<TypePapierAppartementVente, string> = {
  titre_foncier_individuel: 'Titre foncier individuel',
  titre_foncier_collectif: 'Titre foncier collectif',
  contrat_seulement: 'Contrat seulement',
  sans_papier: 'Sans papier',
};
const TYPE_TERRAIN_LABELS: Record<TypeTerrainVente, string> = {
  agricole: 'Agricole',
  habitation: 'Habitation',
  industrielle: 'Industrielle',
  loisir: 'Loisir',
};
const APPARTEMENT_VENTE_BOOLEAN_FIELDS = [
  'proche_plage', 'chauffage_central', 'climatisation', 'balcon', 'terrasse', 'ascenseur', 'vue_mer',
  'gaz_ville', 'cuisine_equipee', 'place_parking', 'syndic', 'meuble', 'independant', 'eau_puits',
  'eau_sonede', 'electricite_steg'
] as const;
const APPARTEMENT_VENTE_BOOLEAN_LABELS: Record<(typeof APPARTEMENT_VENTE_BOOLEAN_FIELDS)[number], string> = {
  proche_plage: 'Proche de la plage',
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
  meuble: 'Meublé',
  independant: 'Indépendant',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Électricité STEG',
};
const normalizeFeatureName = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const APPARTEMENT_VENTE_DETAIL_FEATURES = new Set(
  Object.values(APPARTEMENT_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
APPARTEMENT_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Parking'));
APPARTEMENT_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Vue sur mer'));
const LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS = [
  'toilette', 'reserve_local', 'vitrine', 'coin_angle', 'electricite_3_phases', 'gaz_ville', 'alarme',
  'eau_puits', 'eau_sonede', 'electricite_steg'
] as const;
const LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS: Record<(typeof LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS)[number], string> = {
  toilette: 'Toilette',
  reserve_local: 'Réserve',
  vitrine: 'Vitrine',
  coin_angle: "Coin d'angle",
  electricite_3_phases: 'Électricité 3 phases',
  gaz_ville: 'Gaz de ville',
  alarme: 'Alarme',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Électricité STEG',
};
const LOCAL_COMMERCIAL_VENTE_DETAIL_FEATURES = new Set(
  Object.values(LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
const TERRAIN_VENTE_BOOLEAN_FIELDS = ['terrain_constructible', 'terrain_angle', 'eau_puits', 'eau_sonede', 'electricite_steg'] as const;
const TERRAIN_VENTE_BOOLEAN_LABELS: Record<(typeof TERRAIN_VENTE_BOOLEAN_FIELDS)[number], string> = {
  terrain_constructible: 'Constructible',
  terrain_angle: "Terrain d'angle",
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Électricité STEG',
};
const TERRAIN_VENTE_DETAIL_FEATURES = new Set(
  Object.values(TERRAIN_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain agricole'));
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain habitation'));
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain industrielle'));
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain loisir'));
const IMMEUBLE_VENTE_BOOLEAN_FIELDS = ['immeuble_proche_plage', 'immeuble_ascenseur', 'immeuble_parking_sous_sol', 'immeuble_parking_exterieur', 'immeuble_syndic', 'immeuble_vue_mer', 'eau_puits', 'eau_sonede', 'electricite_steg'] as const;
const IMMEUBLE_VENTE_BOOLEAN_LABELS: Record<(typeof IMMEUBLE_VENTE_BOOLEAN_FIELDS)[number], string> = {
  immeuble_proche_plage: 'Proche de la plage',
  immeuble_ascenseur: 'Ascenseur',
  immeuble_parking_sous_sol: 'Parking sous-sol',
  immeuble_parking_exterieur: 'Parking extérieur',
  immeuble_syndic: 'Syndic',
  immeuble_vue_mer: 'Vue mer',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Électricité STEG',
};
const IMMEUBLE_VENTE_DETAIL_FEATURES = new Set(
  Object.values(IMMEUBLE_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
const CHARACTERISTICS_MARKER = '[CARACTERISTIQUES_JSON]';
const DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT = 3;
const DEFAULT_COMMISSION_CLIENT_PERCENT = 2;
const DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE = 30;

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeVenteTarification(formData: Partial<Bien>) {
  const prixAfficheClient = Number(formData.prix_affiche_client ?? formData.prix_nuitee ?? 0);
  const tarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
  if (!Number.isFinite(prixAfficheClient) || prixAfficheClient <= 0) {
    return {
      prixAfficheClient: 0,
      prixFixeProprietaire: 0,
      prixFinal: 0,
      revenuAgence: 0,
      prixMinimumAccepte: 0,
      commissionPourcentageProprietaire: Number(formData.commission_pourcentage_proprietaire ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT),
      commissionPourcentageClient: Number(formData.commission_pourcentage_client ?? DEFAULT_COMMISSION_CLIENT_PERCENT),
    };
  }

  if (tarificationMethode === 'avec_commission') {
    const commissionPourcentageProprietaire = Number(formData.commission_pourcentage_proprietaire ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT);
    const commissionPourcentageClient = Number(formData.commission_pourcentage_client ?? DEFAULT_COMMISSION_CLIENT_PERCENT);
    const partProprietaire = toMoney((prixAfficheClient * Math.max(0, commissionPourcentageProprietaire)) / 100);
    const partClient = toMoney((prixAfficheClient * Math.max(0, commissionPourcentageClient)) / 100);
    const prixFixeProprietaire = toMoney(prixAfficheClient - partProprietaire);
    const prixFinal = toMoney(prixAfficheClient + partClient);
    const revenuAgence = toMoney(partProprietaire + partClient);

    return {
      prixAfficheClient: toMoney(prixAfficheClient),
      prixFixeProprietaire,
      prixFinal,
      revenuAgence,
      prixMinimumAccepte: 0,
      commissionPourcentageProprietaire: Math.max(0, commissionPourcentageProprietaire),
      commissionPourcentageClient: Math.max(0, commissionPourcentageClient),
    };
  }

  const prixFixeProprietaire = Math.max(0, Number(formData.prix_fixe_proprietaire ?? 0));
  const revenuAgence = toMoney(Math.max(0, prixAfficheClient - prixFixeProprietaire));
  const montantMaxReduction = Math.max(0, Number(formData.montant_max_reduction_negociation ?? 0));
  const reductionEffective = Math.min(montantMaxReduction, revenuAgence);
  const prixMinimumAccepte = toMoney(prixAfficheClient - reductionEffective);

  return {
    prixAfficheClient: toMoney(prixAfficheClient),
    prixFixeProprietaire: toMoney(prixFixeProprietaire),
    prixFinal: toMoney(prixAfficheClient),
    revenuAgence,
    prixMinimumAccepte,
    commissionPourcentageProprietaire: 0,
    commissionPourcentageClient: 0,
  };
}

function computeVentePaiement(formData: Partial<Bien>, prixTotalClient: number) {
  const total = Number(prixTotalClient || 0);
  const modalite = (formData.modalite_paiement_vente || 'comptant') as ModalitePaiementVente;
  if (!Number.isFinite(total) || total <= 0) {
    return {
      modalite,
      pourcentagePremierePartiePromesse: 0,
      montantPremierePartiePromesse: 0,
      montantDeuxiemePartie: 0,
      nombreTranches: Number(formData.nombre_tranches ?? 0),
      periodeTranchesMois: Number(formData.periode_tranches_mois ?? 0),
      montantParTranche: 0,
    };
  }

  if (modalite === 'comptant') {
    return {
      modalite,
      pourcentagePremierePartiePromesse: 100,
      montantPremierePartiePromesse: toMoney(total),
      montantDeuxiemePartie: 0,
      nombreTranches: 0,
      periodeTranchesMois: 0,
      montantParTranche: 0,
    };
  }

  const pourcentagePremierePartiePromesse = Math.max(0, Number(formData.pourcentage_premiere_partie_promesse ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE));
  const montantPremierePartiePromesse = toMoney((total * pourcentagePremierePartiePromesse) / 100);
  const montantDeuxiemePartie = toMoney(Math.max(0, total - montantPremierePartiePromesse));
  const nombreTranches = Math.max(0, Math.floor(Number(formData.nombre_tranches ?? 0)));
  const periodeTranchesMois = Math.max(0, Math.floor(Number(formData.periode_tranches_mois ?? 0)));
  const montantParTranche = nombreTranches > 0 ? toMoney(montantDeuxiemePartie / nombreTranches) : 0;

  return {
    modalite,
    pourcentagePremierePartiePromesse,
    montantPremierePartiePromesse,
    montantDeuxiemePartie,
    nombreTranches,
    periodeTranchesMois,
    montantParTranche,
  };
}

export default function BiensPage() {
  const { biens, zones, proprietaires, addBien, updateBien, deleteBien, isLoading } = useProperties();
  const zoneOptions = zones.length > 0 ? zones : mockZones;
  const proprietaireOptions = proprietaires.length > 0 ? proprietaires : mockProprietaires;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BienStatut | 'all'>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingBien, setEditingBien] = useState<Bien | null>(null);
  const [viewingBien, setViewingBien] = useState<Bien | null>(null);
  const [saveSuccessDialogOpen, setSaveSuccessDialogOpen] = useState(false);

  const filteredBiens = biens.filter(bien => (bien.titre.toLowerCase().includes(searchTerm.toLowerCase()) || bien.reference.toLowerCase().includes(searchTerm.toLowerCase())) && (statusFilter === 'all' || bien.statut === statusFilter));

  const handleDelete = async (id: string) => { if (window.confirm('Supprimer ce bien ?')) { try { await deleteBien(id); toast.success('Bien supprimé'); } catch { toast.error('Erreur'); } } };
  const syncMediaForBien = async (bienId: string, media: Media[]) => {
    const existingResponse = await fetch(`http://localhost:3001/api/media/${bienId}`);
    const existingMedia = existingResponse.ok ? await existingResponse.json() : [];
    for (const m of existingMedia) {
      await fetch(`http://localhost:3001/api/media/${m.id}`, { method: 'DELETE' });
    }
    const orderedMedia = (Array.isArray(media) ? media : []).map((m, idx) => ({ ...m, position: idx }));
    for (const m of orderedMedia) {
      const createResponse = await fetch('http://localhost:3001/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bien_id: bienId, type: m.type || 'image', url: m.url, motif_upload: m.motif_upload || null, position: m.position ?? 0 }),
      });
      if (!createResponse.ok) throw new Error('Failed to save media');
    }
  };
  const handleSave = async (bien: Bien) => {
    try {
      const { created_at, updated_at, media, unavailableDates, ...bienData } = bien;
      if (editingBien) {
        await updateBien(bien as any);
        await syncMediaForBien(bien.id, media || []);
      } else {
        await addBien(bienData as any);
        await syncMediaForBien(String(bienData.id || bien.id), media || []);
      }
      setIsAddOpen(false);
      setEditingBien(null);
      setSaveSuccessDialogOpen(true);
    } catch {
      toast.error('Erreur sauvegarde');
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div><h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestion des Biens</h1><p className="text-xs sm:text-sm text-gray-500">Gérez votre portefeuille</p></div>
        <button onClick={() => { setEditingBien(null); setIsAddOpen(true); }} className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" /> Nouveau Bien</button>
      </div>
      <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-5 w-5 text-gray-400" /></div><input type="text" className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
        <div className="w-full sm:w-64"><select className="block w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as BienStatut | 'all')}><option value="all">Tous les statuts</option><option value="disponible">Disponible</option><option value="loue">Loué</option><option value="reserve">Réservé</option><option value="maintenance">Maintenance</option><option value="bloque">Bloqué</option></select></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {filteredBiens.map((bien) => <BienCard key={bien.id} bien={bien} zones={zoneOptions} onEdit={() => { setEditingBien(bien); setIsAddOpen(true); }} onDelete={() => handleDelete(bien.id)} onView={() => setViewingBien(bien)} />)}
      </div>
      {filteredBiens.length === 0 && <div className="text-center py-12"><Home className="mx-auto h-10 w-10 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">Aucun bien trouvé</h3></div>}
      <Dialog.Root open={isAddOpen} onOpenChange={setIsAddOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" /><Dialog.Content className="fixed inset-0 z-50 w-full h-full bg-white overflow-hidden flex flex-col">
          <Dialog.Description className="sr-only">Formulaire d'ajout ou de modification de bien</Dialog.Description>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center gap-3"><button onClick={() => setIsAddOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><Dialog.Title className="text-lg font-semibold text-gray-900">{editingBien ? 'Modifier le bien' : 'Nouveau bien'}</Dialog.Title></div>
            <button onClick={() => document.getElementById('bien-editor-form')?.dispatchEvent(new Event('submit', { bubbles: true }))} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Save className="h-4 w-4" /><span>Sauvegarder</span></button>
          </div>
          <div className="flex-1 overflow-y-auto"><BienEditor initialData={editingBien} zones={zoneOptions} proprietaires={proprietaireOptions} onSubmit={handleSave} onCancel={() => setIsAddOpen(false)} /></div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={!!viewingBien} onOpenChange={() => setViewingBien(null)}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" /><Dialog.Content className="fixed inset-0 z-50 w-full h-full bg-white overflow-hidden flex flex-col">
          <Dialog.Description className="sr-only">Aperçu du bien</Dialog.Description>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white shrink-0"><div className="flex items-center gap-3"><button onClick={() => setViewingBien(null)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><Dialog.Title className="text-lg font-semibold text-gray-900">Aperçu</Dialog.Title></div><button onClick={() => { setViewingBien(null); if (viewingBien) { setEditingBien(viewingBien); setIsAddOpen(true); } }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Edit2 className="h-4 w-4" /></button></div>
          <div className="flex-1 overflow-y-auto">{viewingBien && <BienPreview bien={viewingBien} zones={zoneOptions} />}</div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={saveSuccessDialogOpen} onOpenChange={setSaveSuccessDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Dialog.Content className="fixed z-[61] left-1/2 top-1/2 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Sauvegarde</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-600">Sauvegarde avec succès.</Dialog.Description>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setSaveSuccessDialogOpen(false)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">OK</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function BienCard({ bien, zones, onEdit, onDelete, onView }: { bien: Bien; zones: Zone[]; onEdit: () => void; onDelete: () => void; onView: () => void; }) {
  const mainImage = bien.media?.[0]?.url || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800';
  const imageCount = bien.media?.length || 0;
  const displayPrice = bien.mode === 'vente' ? Number(bien.prix_affiche_client ?? bien.prix_nuitee ?? 0) : Number(bien.prix_nuitee || 0);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full group">
      <div className="relative h-44 sm:h-48 bg-gray-100 overflow-hidden">
        <img src={mainImage} alt={bien.titre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute top-3 left-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[bien.statut]}`}>{statusLabels[bien.statut]}</span></div>
        {imageCount > 1 && <div className="absolute top-3 right-3 bg-black/50 text-white px-2 py-1 rounded-lg text-xs"><ImageIcon className="h-3 w-3 inline" /> {imageCount}</div>}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button onClick={onView} className="p-2 bg-white rounded-full hover:bg-gray-100"><Eye className="h-4 w-4 text-gray-700" /></button>
          <button onClick={onEdit} className="p-2 bg-white rounded-full hover:bg-gray-100"><Edit2 className="h-4 w-4 text-emerald-600" /></button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3"><p className="text-white font-bold text-lg">{displayPrice} DT{bien.mode === 'vente' ? '' : <span className="text-xs font-normal text-white/80">/nuit</span>}</p></div>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="mb-3"><h3 className="font-bold text-gray-900 text-base line-clamp-1 mb-1">{bien.titre}</h3><div className="flex items-center gap-1 text-gray-500 text-xs"><MapPin className="h-3 w-3" /><span>{zones.find(z => z.id === bien.zone_id)?.nom || 'Zone Inconnue'}</span></div></div>
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-4"><div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded"><Bed className="h-3 w-3" /><span>{bien.nb_chambres}</span></div><div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded"><Bath className="h-3 w-3" /><span>{bien.nb_salle_bain}</span></div><div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded"><Banknote className="h-3 w-3" /><span>{bien.avance} DT</span></div></div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-4"><span className="px-2 py-1 bg-gray-100 rounded font-medium">{typeLabels[bien.type]}</span><span>Ref: {bien.reference}</span></div>
        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100">
          <button onClick={onView} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium"><Eye className="h-4 w-4" /></button>
          <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium"><Edit2 className="h-4 w-4" /></button>
          <button onClick={onDelete} className="flex-1 flex items-center justify-center p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

function BienEditor({ initialData, zones, proprietaires, onSubmit }: { initialData: Bien | null; zones: Zone[]; proprietaires: Proprietaire[]; onSubmit: (data: Bien) => void; onCancel: () => void; }) {
  const [activeTab, setActiveTab] = useState<'general' | 'images' | 'calendar'>('general');
  const [generalStep, setGeneralStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [formData, setFormData] = useState<Partial<Bien>>(initialData || { reference: '', titre: '', description: '', mode: 'location_saisonniere' as BienMode, type: 'appartement' as BienType, nb_chambres: 0, nb_salle_bain: 0, prix_nuitee: 0, tarification_methode: 'avec_commission' as TarificationMethodeVente, prix_affiche_client: 0, prix_fixe_proprietaire: 0, prix_final: 0, revenu_agence: 0, commission_pourcentage_proprietaire: DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT, commission_pourcentage_client: DEFAULT_COMMISSION_CLIENT_PERCENT, montant_max_reduction_negociation: 0, prix_minimum_accepte: 0, modalite_paiement_vente: 'comptant' as ModalitePaiementVente, pourcentage_premiere_partie_promesse: DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE, montant_premiere_partie_promesse: 0, montant_deuxieme_partie: 0, nombre_tranches: 6, periode_tranches_mois: 6, montant_par_tranche: 0, avance: 0, caution: 0, type_rue: null, type_papier: null, superficie_m2: null, etage: null, configuration: null, annee_construction: null, distance_plage_m: null, proche_plage: false, chauffage_central: false, climatisation: false, balcon: false, terrasse: false, ascenseur: false, vue_mer: false, gaz_ville: false, cuisine_equipee: false, place_parking: false, syndic: false, meuble: false, independant: false, eau_puits: false, eau_sonede: false, electricite_steg: false, surface_local_m2: null, facade_m: null, hauteur_plafond_m: null, activite_recommandee: null, toilette: false, reserve_local: false, vitrine: false, coin_angle: false, electricite_3_phases: false, alarme: false, type_terrain: null, terrain_facade_m: null, terrain_surface_m2: null, terrain_distance_plage_m: null, terrain_zone: null, terrain_constructible: false, terrain_angle: false, immeuble_surface_terrain_m2: null, immeuble_surface_batie_m2: null, immeuble_nb_niveaux: null, immeuble_nb_garages: null, immeuble_nb_appartements: null, immeuble_nb_locaux_commerciaux: null, immeuble_distance_plage_m: null, immeuble_proche_plage: false, immeuble_ascenseur: false, immeuble_parking_sous_sol: false, immeuble_parking_exterieur: false, immeuble_syndic: false, immeuble_vue_mer: false, immeuble_appartements: [], statut: 'disponible' as BienStatut, menage_en_cours: false, zone_id: zones[0]?.id || '', proprietaire_id: proprietaires[0]?.id || '' });
  const [zonesOptions, setZonesOptions] = useState<Zone[]>(zones);
  const [proprietaireOptions, setProprietaireOptions] = useState<Proprietaire[]>(proprietaires);
  const [images, setImages] = useState<Media[]>(initialData?.media || []);
  const [unavailableDates, setUnavailableDates] = useState<DateStatus[]>(initialData?.unavailableDates || []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageMotif, setNewImageMotif] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showFeaturePanel, setShowFeaturePanel] = useState(false);
  const [newFeature, setNewFeature] = useState('');
  const [customFeatures, setCustomFeatures] = useState<string[]>(initialData?.caracteristiques || []);
  const [availableFeatures, setAvailableFeatures] = useState<Caracteristique[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>(initialData?.caracteristique_ids || []);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddProprietaire, setShowAddProprietaire] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneDescription, setNewZoneDescription] = useState('');
  const [newZoneGoogleMapsUrl, setNewZoneGoogleMapsUrl] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerCin, setNewOwnerCin] = useState('');
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [stepInfoDialogOpen, setStepInfoDialogOpen] = useState(false);
  const [validatedSteps, setValidatedSteps] = useState<Set<number>>(new Set(initialData ? [1, 2, 3, 4, 5] : [1]));
  const normalizeLegacyType = (value?: BienType): BienType => {
    if (value === 'S1' || value === 'S2' || value === 'S3' || value === 'S4') return 'appartement';
    if (value === 'villa') return 'villa_maison';
    if (value === 'local') return 'local_commercial';
    return (value || 'appartement') as BienType;
  };
  const generateReference = () => `REF-${Date.now().toString().slice(-6)}`;

  useEffect(() => {
    const rawDescription = initialData?.description || '';
    const markerIndex = rawDescription.indexOf(CHARACTERISTICS_MARKER);
    const normalizedType = normalizeLegacyType((initialData?.type || formData.type) as BienType);
    const resolvedMode = (initialData?.mode || 'location_saisonniere') as BienMode;
    const allowedTypes = BIEN_TYPES_BY_MODE[resolvedMode] || BIEN_TYPES_BY_MODE.location_saisonniere;
    if (markerIndex >= 0) {
      const cleanDescription = rawDescription.slice(0, markerIndex).trim();
      setFormData((prev) => ({
        ...prev,
        description: cleanDescription,
        mode: resolvedMode,
        type: allowedTypes.includes(normalizedType) ? normalizedType : allowedTypes[0],
        reference: prev.reference || generateReference(),
      }));
      try {
        const parsed = JSON.parse(rawDescription.slice(markerIndex + CHARACTERISTICS_MARKER.length).trim());
        if (Array.isArray(parsed)) setCustomFeatures(parsed.filter((x) => typeof x === 'string'));
      } catch {
        setCustomFeatures([]);
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        mode: resolvedMode,
        type: allowedTypes.includes(normalizedType) ? normalizedType : allowedTypes[0],
        reference: prev.reference || generateReference(),
      }));
    }
    setSelectedFeatureIds(initialData?.caracteristique_ids || []);
  }, [initialData]);

  useEffect(() => { setZonesOptions(zones); }, [zones]);
  useEffect(() => { setProprietaireOptions(proprietaires); }, [proprietaires]);
  useEffect(() => {
    const currentMode = (formData.mode || 'location_saisonniere') as BienMode;
    if (currentMode === 'vente' && activeTab === 'calendar') {
      setActiveTab('general');
    }
  }, [formData.mode, activeTab]);
  useEffect(() => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType(formData.type as BienType);
    const isAppartementVente = selectedMode === 'vente' && selectedType === 'appartement';
    const isLocalCommercialVente = selectedMode === 'vente' && selectedType === 'local_commercial';
    const isTerrainVente = selectedMode === 'vente' && selectedType === 'terrain';
    const isImmeubleVente = selectedMode === 'vente' && selectedType === 'immeuble';
    const tarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
    const venteTarification = computeVenteTarification(formData);
    if (!selectedMode || !selectedType) {
      setAvailableFeatures([]);
      return;
    }

    const fetchFeatures = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/caracteristiques?mode_bien=${selectedMode}&type_bien=${selectedType}`);
        if (!response.ok) throw new Error('Failed to fetch features');
        const rows = await response.json();
        const nextFeaturesRaw = Array.isArray(rows) ? rows : [];
        const seenNames = new Set<string>();
        const dedupedFeatures = nextFeaturesRaw.filter((f: Caracteristique) => {
          const normalizedName = normalizeFeatureName(f.nom || '');
          if (seenNames.has(normalizedName)) return false;
          seenNames.add(normalizedName);
          return true;
        });
        const nextFeatures = isAppartementVente
          ? dedupedFeatures.filter((f: Caracteristique) => !APPARTEMENT_VENTE_DETAIL_FEATURES.has(normalizeFeatureName(f.nom || '')))
          : isLocalCommercialVente
            ? dedupedFeatures.filter((f: Caracteristique) => !LOCAL_COMMERCIAL_VENTE_DETAIL_FEATURES.has(normalizeFeatureName(f.nom || '')))
            : isTerrainVente
              ? dedupedFeatures.filter((f: Caracteristique) => !TERRAIN_VENTE_DETAIL_FEATURES.has(normalizeFeatureName(f.nom || '')))
              : isImmeubleVente
                ? dedupedFeatures.filter((f: Caracteristique) => !IMMEUBLE_VENTE_DETAIL_FEATURES.has(normalizeFeatureName(f.nom || '')))
          : dedupedFeatures;
        setAvailableFeatures(nextFeatures);
        const nextFeatureIds = new Set(nextFeatures.map((f: Caracteristique) => f.id));
        setSelectedFeatureIds((prev) => prev.filter((id) => nextFeatureIds.has(id)));
      } catch {
        setAvailableFeatures([]);
      }
    };

    fetchFeatures();
  }, [formData.mode, formData.type]);

  useEffect(() => {
    const targetCount = Math.max(0, Math.floor(Number(formData.immeuble_nb_appartements || 0)));
    const currentRows = Array.isArray(formData.immeuble_appartements) ? formData.immeuble_appartements : [];
    if (currentRows.length === targetCount) return;
    const nextRows = [];
    for (let i = 0; i < targetCount; i += 1) {
      const existing = currentRows[i];
      nextRows.push({
        index: i + 1,
        chambres: Number(existing?.chambres || 0),
        salle_bain: Number(existing?.salle_bain || 0),
        superficie_m2: existing?.superficie_m2 ?? null,
        configuration: existing?.configuration || null,
      });
    }
    setFormData((prev) => ({ ...prev, immeuble_appartements: nextRows }));
  }, [formData.immeuble_nb_appartements]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const isLocalCommercial = selectedType === 'local_commercial';
    if (isLocalCommercial && !newImageMotif.trim()) {
      toast.error("Motif d'upload requis pour le local");
      e.target.value = '';
      return;
    }
    setUploading(true);
    const uploadFormData = new FormData();
    uploadFormData.append('image', file);
    try {
      const response = await fetch('http://localhost:3001/api/upload', { method: 'POST', body: uploadFormData });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      const newMedia: Media = {
        id: Math.random().toString(36).substr(2, 9),
        bien_id: '',
        type: 'image',
        url: data.url,
        motif_upload: isLocalCommercial ? newImageMotif.trim() : null,
      };
      setImages([...images, newMedia]);
      if (isLocalCommercial) setNewImageMotif('');
      toast.success('Image uploadée');
    } catch { toast.error('Erreur upload'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const optionalNumericFields = ['superficie_m2', 'etage', 'annee_construction', 'distance_plage_m', 'surface_local_m2', 'facade_m', 'hauteur_plafond_m', 'terrain_facade_m', 'terrain_surface_m2', 'terrain_distance_plage_m', 'immeuble_surface_terrain_m2', 'immeuble_surface_batie_m2', 'immeuble_nb_niveaux', 'immeuble_nb_garages', 'immeuble_nb_appartements', 'immeuble_nb_locaux_commerciaux', 'immeuble_distance_plage_m', 'prix_affiche_client', 'prix_fixe_proprietaire', 'commission_pourcentage_proprietaire', 'commission_pourcentage_client', 'montant_max_reduction_negociation', 'pourcentage_premiere_partie_promesse', 'nombre_tranches', 'periode_tranches_mois'];
    if (name === 'mode') {
      const nextMode = value as BienMode;
      const allowedTypes = BIEN_TYPES_BY_MODE[nextMode] || BIEN_TYPES_BY_MODE.location_saisonniere;
      setFormData((prev) => {
        const currentType = normalizeLegacyType(prev.type as BienType);
        const nextType = allowedTypes.includes(currentType) ? currentType : allowedTypes[0];
        const keepAppartementVenteDetails = nextMode === 'vente' && nextType === 'appartement';
        const keepLocalCommercialVenteDetails = nextMode === 'vente' && nextType === 'local_commercial';
        const keepTerrainVenteDetails = nextMode === 'vente' && nextType === 'terrain';
        const keepImmeubleVenteDetails = nextMode === 'vente' && nextType === 'immeuble';
        const next = {
          ...prev,
          mode: nextMode,
          type: nextType,
          type_rue: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails) ? prev.type_rue || null : null,
          type_papier: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails) ? prev.type_papier || null : null,
        };
        if (keepAppartementVenteDetails) return resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(next)));
        if (keepLocalCommercialVenteDetails) return resetImmeubleVenteFields(resetTerrainVenteFields(resetAppartementVenteFields(next)));
        if (keepTerrainVenteDetails) return resetImmeubleVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next)));
        if (keepImmeubleVenteDetails) return resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next)));
        return resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
      });
      return;
    }
    if (name === 'type') {
      const nextType = normalizeLegacyType(value as BienType);
      setFormData((prev) => {
        const keepAppartementVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'appartement';
        const keepLocalCommercialVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'local_commercial';
        const keepTerrainVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'terrain';
        const keepImmeubleVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'immeuble';
        const next = {
          ...prev,
          type: nextType,
          type_rue: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails) ? prev.type_rue || null : null,
          type_papier: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails) ? prev.type_papier || null : null,
        };
        if (keepAppartementVenteDetails) return resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(next)));
        if (keepLocalCommercialVenteDetails) return resetImmeubleVenteFields(resetTerrainVenteFields(resetAppartementVenteFields(next)));
        if (keepTerrainVenteDetails) return resetImmeubleVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next)));
        if (keepImmeubleVenteDetails) return resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next)));
        return resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
      });
      return;
    }
    if (optionalNumericFields.includes(name)) {
      setFormData(prev => ({ ...prev, [name]: value === '' ? null : Number(value) }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };
  const resetAppartementVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    superficie_m2: null,
    etage: null,
    configuration: null,
    annee_construction: null,
    distance_plage_m: null,
    proche_plage: false,
    chauffage_central: false,
    climatisation: false,
    balcon: false,
    terrasse: false,
    ascenseur: false,
    vue_mer: false,
    gaz_ville: false,
    cuisine_equipee: false,
    place_parking: false,
    syndic: false,
    meuble: false,
    independant: false,
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const resetLocalCommercialVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    surface_local_m2: null,
    facade_m: null,
    hauteur_plafond_m: null,
    activite_recommandee: null,
    toilette: false,
    reserve_local: false,
    vitrine: false,
    coin_angle: false,
    electricite_3_phases: false,
    gaz_ville: false,
    alarme: false,
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const resetTerrainVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    type_terrain: null,
    terrain_facade_m: null,
    terrain_surface_m2: null,
    terrain_distance_plage_m: null,
    terrain_zone: null,
    terrain_constructible: false,
    terrain_angle: false,
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const resetImmeubleVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    immeuble_surface_terrain_m2: null,
    immeuble_surface_batie_m2: null,
    immeuble_nb_niveaux: null,
    immeuble_nb_garages: null,
    immeuble_nb_appartements: null,
    immeuble_nb_locaux_commerciaux: null,
    immeuble_distance_plage_m: null,
    immeuble_proche_plage: false,
    immeuble_ascenseur: false,
    immeuble_parking_sous_sol: false,
    immeuble_parking_exterieur: false,
    immeuble_syndic: false,
    immeuble_vue_mer: false,
    immeuble_appartements: [],
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }));
  const handleImmeubleAppartementChange = (index: number, field: 'chambres' | 'salle_bain' | 'superficie_m2' | 'configuration', value: string) => {
    const rows = Array.isArray(formData.immeuble_appartements) ? [...formData.immeuble_appartements] : [];
    const current = rows[index] || { index: index + 1, chambres: 0, salle_bain: 0, superficie_m2: null, configuration: null };
    if (field === 'configuration') {
      rows[index] = { ...current, configuration: value || null };
    } else if (field === 'superficie_m2') {
      rows[index] = { ...current, superficie_m2: value === '' ? null : Number(value) };
    } else {
      rows[index] = { ...current, [field]: Math.max(0, Number(value || 0)) } as any;
    }
    setFormData((prev) => ({ ...prev, immeuble_appartements: rows }));
  };

  const handleAddImage = () => {
    if (!newImageUrl.trim()) return;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const isLocalCommercial = selectedType === 'local_commercial';
    if (isLocalCommercial && !newImageMotif.trim()) {
      return toast.error("Motif d'upload requis pour le local");
    }
    const newMedia: Media = {
      id: Math.random().toString(36).substr(2, 9),
      bien_id: formData.id || '',
      type: 'image',
      url: newImageUrl,
      motif_upload: isLocalCommercial ? newImageMotif.trim() : null,
    };
    setImages([...images, newMedia]);
    setNewImageUrl('');
    if (isLocalCommercial) setNewImageMotif('');
    toast.success('Image ajoutée');
  };

  const handleRemoveImage = (id: string) => { setImages(images.filter(img => img.id !== id)); toast.success('Image supprimée'); };

  const reorderImages = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const nextImages = [...images];
    const [movedImage] = nextImages.splice(fromIndex, 1);
    nextImages.splice(toIndex, 0, movedImage);
    setImages(nextImages.map((img, idx) => ({ ...img, position: idx })));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    setDraggedImageIndex(index);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleDrop = (targetIndex: number) => {
    if (draggedImageIndex === null) return;
    reorderImages(draggedImageIndex, targetIndex);
    setDraggedImageIndex(null);
  };
  const handleDragEnd = () => setDraggedImageIndex(null);

  const handleMoveImage = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= images.length) return;
    reorderImages(index, newIndex);
  };

  const handleSetMainImage = (index: number) => {
    if (index === 0) return;
    const newImages = [...images];
    const [movedImage] = newImages.splice(index, 1);
    newImages.unshift(movedImage);
    const updatedImages = newImages.map((img, idx) => ({ ...img, position: idx }));
    setImages(updatedImages);
    toast.success('Image principale définie');
  };

  const handleAddFeature = () => {
    const value = newFeature.trim();
    if (!value) return;
    const normalizedValue = normalizeFeatureName(value);
    if (APPARTEMENT_VENTE_DETAIL_FEATURES.has(normalizedValue)) return;
    if (LOCAL_COMMERCIAL_VENTE_DETAIL_FEATURES.has(normalizedValue)) return;
    if (TERRAIN_VENTE_DETAIL_FEATURES.has(normalizedValue)) return;
    if (IMMEUBLE_VENTE_DETAIL_FEATURES.has(normalizedValue)) return;
    if (availableFeatures.some((feature) => normalizeFeatureName(feature.nom || '') === normalizedValue)) return;
    if (customFeatures.some((item) => normalizeFeatureName(item) === normalizedValue)) return;
    setCustomFeatures([...customFeatures, value]);
    setNewFeature('');
  };

  const handleRemoveFeature = (feature: string) => {
    setCustomFeatures(customFeatures.filter((item) => item !== feature));
  };

  const handleAddZone = async () => {
    if (!newZoneName.trim()) return toast.error('Nom de zone requis');
    try {
      const payload = {
        id: `z${Date.now()}`,
        nom: newZoneName.trim(),
        description: newZoneDescription.trim(),
        google_maps_url: newZoneGoogleMapsUrl.trim() || null
      };
      const response = await fetch('http://localhost:3001/api/zones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('Failed to create zone');
      const createdZone = await response.json();
      setZonesOptions([...zonesOptions, createdZone]);
      setFormData(prev => ({ ...prev, zone_id: createdZone.id }));
      setNewZoneName('');
      setNewZoneDescription('');
      setNewZoneGoogleMapsUrl('');
      setShowAddZone(false);
      toast.success('Zone ajoutée');
    } catch {
      toast.error('Erreur ajout zone');
    }
  };

  const handleAddProprietaire = async () => {
    if (!newOwnerName.trim()) return toast.error('Nom du propriétaire requis');
    try {
      const payload = { nom: newOwnerName.trim(), telephone: newOwnerPhone.trim(), email: newOwnerEmail.trim(), cin: newOwnerCin.trim() };
      const response = await fetch('http://localhost:3001/api/proprietaires', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('Failed to create owner');
      const createdOwner = await response.json();
      setProprietaireOptions([...proprietaireOptions, createdOwner]);
      setFormData(prev => ({ ...prev, proprietaire_id: createdOwner.id }));
      setNewOwnerName('');
      setNewOwnerPhone('');
      setNewOwnerEmail('');
      setNewOwnerCin('');
      setShowAddProprietaire(false);
      toast.success('Propriétaire ajouté');
    } catch {
      toast.error('Erreur ajout propriétaire');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType(formData.type as BienType);
    const allowedTypes = BIEN_TYPES_BY_MODE[selectedMode] || [];
    const isAppartementVente = selectedMode === 'vente' && selectedType === 'appartement';
    const isLocalCommercialVente = selectedMode === 'vente' && selectedType === 'local_commercial';
    const isTerrainVente = selectedMode === 'vente' && selectedType === 'terrain';
    const isImmeubleVente = selectedMode === 'vente' && selectedType === 'immeuble';

    if (!formData.titre?.trim()) {
      setGeneralStep(1);
      return toast.error('Titre obligatoire');
    }
    if (!formData.reference?.trim()) {
      setGeneralStep(1);
      return toast.error('Reference obligatoire');
    }
    if (!selectedMode) {
      setGeneralStep(1);
      return toast.error('Mode obligatoire');
    }
    if (!selectedType || !allowedTypes.includes(selectedType)) {
      setGeneralStep(2);
      return toast.error('Type invalide pour ce mode');
    }
    if (isAppartementVente && !formData.type_rue) {
      setGeneralStep(3);
      return toast.error('Type de rue obligatoire pour Appartement en vente');
    }
    if (isAppartementVente && !formData.type_papier) {
      setGeneralStep(3);
      return toast.error('Type de papier obligatoire pour Appartement en vente');
    }
    if (isAppartementVente && !String(formData.configuration || '').trim()) {
      setGeneralStep(3);
      return toast.error('Configuration obligatoire pour Appartement en vente');
    }
    if (isLocalCommercialVente && !String(formData.activite_recommandee || '').trim()) {
      setGeneralStep(3);
      return toast.error('Activite recommandee obligatoire pour Local commercial en vente');
    }
    if (isLocalCommercialVente && !formData.type_rue) {
      setGeneralStep(3);
      return toast.error('Type de rue obligatoire pour Local commercial en vente');
    }
    if (isLocalCommercialVente && !formData.type_papier) {
      setGeneralStep(3);
      return toast.error('Type de papier obligatoire pour Local commercial en vente');
    }
    if (isTerrainVente && !formData.type_terrain) {
      setGeneralStep(3);
      return toast.error('Type de terrain obligatoire pour Terrain en vente');
    }
    if (isTerrainVente && !formData.type_rue) {
      setGeneralStep(3);
      return toast.error('Type de rue obligatoire pour Terrain en vente');
    }
    if (isTerrainVente && !formData.type_papier) {
      setGeneralStep(3);
      return toast.error('Type de papier obligatoire pour Terrain en vente');
    }
    if (isImmeubleVente && !formData.type_rue) {
      setGeneralStep(3);
      return toast.error('Type de rue obligatoire pour Immeuble en vente');
    }
    if (isImmeubleVente && !formData.type_papier) {
      setGeneralStep(3);
      return toast.error('Type de papier obligatoire pour Immeuble en vente');
    }
    if (selectedMode === 'vente') {
      const prixAfficheClient = Number(formData.prix_affiche_client ?? formData.prix_nuitee ?? 0);
      if (!Number.isFinite(prixAfficheClient) || prixAfficheClient <= 0) {
        setGeneralStep(4);
        return toast.error('Prix affiche client obligatoire et > 0');
      }
      if (tarificationMethode === 'sans_commission') {
        const prixFixeProprietaire = Number(formData.prix_fixe_proprietaire ?? 0);
        const maxReduction = Number(formData.montant_max_reduction_negociation ?? 0);
        if (!Number.isFinite(prixFixeProprietaire) || prixFixeProprietaire <= 0) {
          setGeneralStep(4);
          return toast.error('Prix fixe proprietaire obligatoire et > 0');
        }
        if (prixFixeProprietaire > prixAfficheClient) {
          setGeneralStep(4);
          return toast.error('Prix fixe proprietaire ne peut pas depasser le prix affiche client');
        }
        if (maxReduction < 0 || maxReduction > venteTarification.revenuAgence) {
          setGeneralStep(4);
          return toast.error('Montant max de reduction invalide');
        }
      }
      const modalitePaiementVente = (formData.modalite_paiement_vente || 'comptant') as ModalitePaiementVente;
      if (modalitePaiementVente === 'facilite') {
        const pourcentagePromesse = Number(formData.pourcentage_premiere_partie_promesse ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE);
        const nombreTranches = Math.floor(Number(formData.nombre_tranches ?? 0));
        const periodeMois = Math.floor(Number(formData.periode_tranches_mois ?? 0));
        if (pourcentagePromesse <= 0 || pourcentagePromesse >= 100) {
          setGeneralStep(5);
          return toast.error('Le pourcentage de promesse doit etre > 0 et < 100');
        }
        if (nombreTranches <= 0) {
          setGeneralStep(5);
          return toast.error('Le nombre de tranches doit etre > 0');
        }
        if (periodeMois <= 0) {
          setGeneralStep(5);
          return toast.error('La periode (mois) doit etre > 0');
        }
      }
    }

    const imagesWithPositions = images.map((img, idx) => ({ ...img, position: idx }));
    const descriptionWithFeatures = customFeatures.length > 0 ? `${(formData.description || '').trim()}\n\n${CHARACTERISTICS_MARKER}${JSON.stringify(customFeatures)}` : (formData.description || '');
    const ventePaiement = computeVentePaiement(formData, venteTarification.prixFinal);
    const deriveBedroomsFromConfiguration = (configuration?: string | null): number => {
      if (!configuration) return 0;
      const match = configuration.match(/S\s*\+\s*(\d+)/i);
      if (!match) return 0;
      return Number(match[1]) || 0;
    };
    const resolvedNbChambres = isAppartementVente
      ? deriveBedroomsFromConfiguration(formData.configuration || null)
      : isLocalCommercialVente
        ? 0
        : isTerrainVente
          ? 0
          : isImmeubleVente
            ? 0
        : Number(formData.nb_chambres || 0);
    const resolvedNbSalleBain = (isLocalCommercialVente || isTerrainVente || isImmeubleVente) ? 0 : Number(formData.nb_salle_bain || 0);
    const appartementVenteData = isAppartementVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          superficie_m2: formData.superficie_m2 ?? null,
          etage: formData.etage ?? null,
          configuration: formData.configuration || null,
          annee_construction: formData.annee_construction ?? null,
          distance_plage_m: formData.distance_plage_m ?? null,
          proche_plage: !!formData.proche_plage,
          chauffage_central: !!formData.chauffage_central,
          climatisation: !!formData.climatisation,
          balcon: !!formData.balcon,
          terrasse: !!formData.terrasse,
          ascenseur: !!formData.ascenseur,
          vue_mer: !!formData.vue_mer,
          gaz_ville: !!formData.gaz_ville,
          cuisine_equipee: !!formData.cuisine_equipee,
          place_parking: !!formData.place_parking,
          syndic: !!formData.syndic,
          meuble: !!formData.meuble,
          independant: !!formData.independant,
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          type_rue: null,
          type_papier: null,
          superficie_m2: null,
          etage: null,
          configuration: null,
          annee_construction: null,
          distance_plage_m: null,
          proche_plage: false,
          chauffage_central: false,
          climatisation: false,
          balcon: false,
          terrasse: false,
          ascenseur: false,
          vue_mer: false,
          gaz_ville: false,
          cuisine_equipee: false,
          place_parking: false,
          syndic: false,
          meuble: false,
          independant: false,
          eau_puits: false,
          eau_sonede: false,
          electricite_steg: false,
        };
    const localCommercialVenteData = isLocalCommercialVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          surface_local_m2: formData.surface_local_m2 ?? null,
          facade_m: formData.facade_m ?? null,
          hauteur_plafond_m: formData.hauteur_plafond_m ?? null,
          activite_recommandee: formData.activite_recommandee || null,
          toilette: !!formData.toilette,
          reserve_local: !!formData.reserve_local,
          vitrine: !!formData.vitrine,
          coin_angle: !!formData.coin_angle,
          electricite_3_phases: !!formData.electricite_3_phases,
          gaz_ville: !!formData.gaz_ville,
          alarme: !!formData.alarme,
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          surface_local_m2: null,
          facade_m: null,
          hauteur_plafond_m: null,
          activite_recommandee: null,
          toilette: false,
          reserve_local: false,
          vitrine: false,
          coin_angle: false,
          electricite_3_phases: false,
          alarme: false,
        };
    const terrainVenteData = isTerrainVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          type_terrain: formData.type_terrain || null,
          terrain_facade_m: formData.terrain_facade_m ?? null,
          terrain_surface_m2: formData.terrain_surface_m2 ?? null,
          terrain_distance_plage_m: formData.terrain_distance_plage_m ?? null,
          terrain_zone: formData.terrain_zone || null,
          terrain_constructible: !!formData.terrain_constructible,
          terrain_angle: !!formData.terrain_angle,
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          type_terrain: null,
          terrain_facade_m: null,
          terrain_surface_m2: null,
          terrain_distance_plage_m: null,
          terrain_zone: null,
          terrain_constructible: false,
          terrain_angle: false,
        };
    const immeubleVenteData = isImmeubleVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          immeuble_surface_terrain_m2: formData.immeuble_surface_terrain_m2 ?? null,
          immeuble_surface_batie_m2: formData.immeuble_surface_batie_m2 ?? null,
          immeuble_nb_niveaux: formData.immeuble_nb_niveaux ?? null,
          immeuble_nb_garages: formData.immeuble_nb_garages ?? null,
          immeuble_nb_appartements: formData.immeuble_nb_appartements ?? null,
          immeuble_nb_locaux_commerciaux: formData.immeuble_nb_locaux_commerciaux ?? null,
          immeuble_distance_plage_m: formData.immeuble_distance_plage_m ?? null,
          immeuble_proche_plage: !!formData.immeuble_proche_plage,
          immeuble_ascenseur: !!formData.immeuble_ascenseur,
          immeuble_parking_sous_sol: !!formData.immeuble_parking_sous_sol,
          immeuble_parking_exterieur: !!formData.immeuble_parking_exterieur,
          immeuble_syndic: !!formData.immeuble_syndic,
          immeuble_vue_mer: !!formData.immeuble_vue_mer,
          immeuble_appartements: Array.isArray(formData.immeuble_appartements) ? formData.immeuble_appartements : [],
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          immeuble_surface_terrain_m2: null,
          immeuble_surface_batie_m2: null,
          immeuble_nb_niveaux: null,
          immeuble_nb_garages: null,
          immeuble_nb_appartements: null,
          immeuble_nb_locaux_commerciaux: null,
          immeuble_distance_plage_m: null,
          immeuble_proche_plage: false,
          immeuble_ascenseur: false,
          immeuble_parking_sous_sol: false,
          immeuble_parking_exterieur: false,
          immeuble_syndic: false,
          immeuble_vue_mer: false,
          immeuble_appartements: [],
        };
    const finalData: Bien = {
      ...formData,
      mode: selectedMode,
      type: selectedType,
      nb_chambres: resolvedNbChambres,
      nb_salle_bain: resolvedNbSalleBain,
      prix_nuitee: selectedMode === 'vente' ? venteTarification.prixAfficheClient : Number(formData.prix_nuitee || 0),
      tarification_methode: selectedMode === 'vente' ? tarificationMethode : null,
      prix_affiche_client: selectedMode === 'vente' ? venteTarification.prixAfficheClient : null,
      prix_fixe_proprietaire: selectedMode === 'vente' ? venteTarification.prixFixeProprietaire : null,
      prix_final: selectedMode === 'vente' ? venteTarification.prixFinal : null,
      revenu_agence: selectedMode === 'vente' ? venteTarification.revenuAgence : null,
      commission_pourcentage_proprietaire: selectedMode === 'vente' ? venteTarification.commissionPourcentageProprietaire : null,
      commission_pourcentage_client: selectedMode === 'vente' ? venteTarification.commissionPourcentageClient : null,
      montant_max_reduction_negociation: selectedMode === 'vente' && tarificationMethode === 'sans_commission'
        ? Number(formData.montant_max_reduction_negociation ?? 0)
        : null,
      prix_minimum_accepte: selectedMode === 'vente' && tarificationMethode === 'sans_commission'
        ? venteTarification.prixMinimumAccepte
        : null,
      modalite_paiement_vente: selectedMode === 'vente' ? ventePaiement.modalite : null,
      pourcentage_premiere_partie_promesse: selectedMode === 'vente' ? ventePaiement.pourcentagePremierePartiePromesse : null,
      montant_premiere_partie_promesse: selectedMode === 'vente' ? ventePaiement.montantPremierePartiePromesse : null,
      montant_deuxieme_partie: selectedMode === 'vente' ? ventePaiement.montantDeuxiemePartie : null,
      nombre_tranches: selectedMode === 'vente' && ventePaiement.modalite === 'facilite' ? ventePaiement.nombreTranches : null,
      periode_tranches_mois: selectedMode === 'vente' && ventePaiement.modalite === 'facilite' ? ventePaiement.periodeTranchesMois : null,
      montant_par_tranche: selectedMode === 'vente' && ventePaiement.modalite === 'facilite' ? ventePaiement.montantParTranche : null,
      ...appartementVenteData,
      ...localCommercialVenteData,
      ...terrainVenteData,
      ...immeubleVenteData,
      description: descriptionWithFeatures,
      caracteristiques: customFeatures,
      caracteristique_ids: selectedFeatureIds,
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      media: imagesWithPositions,
      unavailableDates: unavailableDates,
      created_at: initialData?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      date_ajout: initialData?.date_ajout || new Date().toISOString().split('T')[0]
    } as Bien;
    markStepValidated(selectedMode === 'vente' ? 5 : 4);
    onSubmit(finalData);
  };
  const selectedProprietaire = proprietaireOptions.find((p) => p.id === (formData.proprietaire_id || ''));
  const isAppartementVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'appartement';
  const isLocalCommercialVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'local_commercial';
  const isTerrainVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'terrain';
  const isImmeubleVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'immeuble';
  const isModeVente = (formData.mode || 'location_saisonniere') === 'vente';
  const currentTarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
  const venteTarificationPreview = computeVenteTarification(formData);
  const currentModalitePaiementVente = (formData.modalite_paiement_vente || 'comptant') as ModalitePaiementVente;
  const ventePaiementPreview = computeVentePaiement(formData, venteTarificationPreview.prixFinal);
  const requiredPrimaryStep = isModeVente ? 5 : 4;
  const markStepValidated = (step: number) => {
    setValidatedSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  };
  const isStepUnlocked = (targetStep: number) => {
    if (targetStep <= 1) return true;
    for (let step = 1; step < targetStep; step += 1) {
      if (!validatedSteps.has(step)) return false;
    }
    return true;
  };
  const goToStep = (targetStep: 1 | 2 | 3 | 4 | 5) => {
    if (!isStepUnlocked(targetStep)) {
      toast.error("Validez d'abord les etapes precedentes");
      return;
    }
    setGeneralStep(targetStep);
  };
  const canAccessSecondaryTabs = isStepUnlocked(requiredPrimaryStep) && validatedSteps.has(requiredPrimaryStep);

  return (
    <form id="bien-editor-form" onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 bg-gray-50 px-4 shrink-0 overflow-x-auto">
        <button type="button" onClick={() => setActiveTab('general')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'general' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}><Home className="h-4 w-4 inline mr-2" />Informations</button>
        <button type="button" disabled={!canAccessSecondaryTabs} onClick={() => setActiveTab('images')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'images' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'} ${!canAccessSecondaryTabs ? 'opacity-50 cursor-not-allowed' : ''}`}><ImageIcon className="h-4 w-4 inline mr-2" />Images ({images.length})</button>
        {!isModeVente && <button type="button" disabled={!canAccessSecondaryTabs} onClick={() => setActiveTab('calendar')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'calendar' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'} ${!canAccessSecondaryTabs ? 'opacity-50 cursor-not-allowed' : ''}`}><CalendarIcon className="h-4 w-4 inline mr-2" />Calendrier</button>}
      </div>
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {activeTab === 'general' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="grid grid-cols-5 gap-2 text-xs sm:text-sm">
                <button type="button" onClick={() => goToStep(1)} className={`px-3 py-2 rounded-lg border ${generalStep === 1 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`}>Etape 1: Base</button>
                <button type="button" disabled={!isStepUnlocked(2)} onClick={() => goToStep(2)} className={`px-3 py-2 rounded-lg border ${generalStep === 2 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(2) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 2: Type</button>
                <button type="button" disabled={!isStepUnlocked(3)} onClick={() => goToStep(3)} className={`px-3 py-2 rounded-lg border ${generalStep === 3 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(3) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 3: Details</button>
                <button type="button" disabled={!isStepUnlocked(4)} onClick={() => goToStep(4)} className={`px-3 py-2 rounded-lg border ${generalStep === 4 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(4) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 4: Tarification</button>
                <button type="button" disabled={!isModeVente || !isStepUnlocked(5)} onClick={() => goToStep(5)} className={`px-3 py-2 rounded-lg border ${generalStep === 5 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${(!isModeVente || !isStepUnlocked(5)) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 5: Paiement</button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Home className="h-5 w-5 inline text-emerald-600 mr-2" />Etape 1 - Informations de base</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label><input required name="titre" value={formData.titre || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference interne *</label>
                  <div className="flex gap-2">
                    <input required name="reference" value={formData.reference || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, reference: generateReference() }))} className="px-3 py-2 rounded-lg border border-gray-300 text-xs">Auto</button>
                  </div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Mode *</label><select name="mode" value={formData.mode || 'location_saisonniere'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Localisation (Zone)</label>
                  <select name="zone_id" value={formData.zone_id || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{zonesOptions.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}</select>
                  <button type="button" onClick={() => setShowAddZone(!showAddZone)} className="text-xs text-emerald-700 hover:underline">+ Ajouter une zone</button>
                  {showAddZone && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <input type="text" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="Nom de la zone" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newZoneDescription} onChange={(e) => setNewZoneDescription(e.target.value)} placeholder="Description" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="url" value={newZoneGoogleMapsUrl} onChange={(e) => setNewZoneGoogleMapsUrl(e.target.value)} placeholder="Lien Google Maps (optionnel)" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <button type="button" onClick={handleAddZone} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm">Enregistrer zone</button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Propriétaire</label>
                  <select name="proprietaire_id" value={formData.proprietaire_id || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{proprietaireOptions.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select>
                  <button type="button" onClick={() => setShowAddProprietaire(!showAddProprietaire)} className="text-xs text-emerald-700 hover:underline">+ Ajouter un propriétaire</button>
                  {showAddProprietaire && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <input type="text" value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} placeholder="Nom" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newOwnerPhone} onChange={(e) => setNewOwnerPhone(e.target.value)} placeholder="Téléphone" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="email" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} placeholder="Email" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newOwnerCin} onChange={(e) => setNewOwnerCin(e.target.value)} placeholder="CIN" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <button type="button" onClick={handleAddProprietaire} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm">Enregistrer propriétaire</button>
                    </div>
                  )}
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Nom propriétaire</label><input value={selectedProprietaire?.nom || ''} readOnly className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Numéro propriétaire</label><input value={selectedProprietaire?.telephone || ''} readOnly className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea name="description" value={formData.description || ''} onChange={handleChange} rows={4} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
              <div className="flex justify-end"><button type="button" onClick={() => { markStepValidated(1); setStepInfoDialogOpen(true); goToStep(2); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 2</button></div>
            </div>
            {generalStep >= 2 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold"><Maximize className="h-5 w-5 inline text-emerald-600 mr-2" />Etape 2 - Type de bien</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Type *</label><select name="type" value={formData.type || 'appartement'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{(BIEN_TYPES_BY_MODE[(formData.mode || 'location_saisonniere') as BienMode] || []).map((typeValue) => <option key={typeValue} value={typeValue}>{typeLabels[typeValue]}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Statut</label><select name="statut" value={formData.statut || 'disponible'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="disponible">Disponible</option><option value="loue">Loué</option><option value="reserve">Réservé</option><option value="maintenance">Maintenance</option><option value="bloque">Bloqué</option></select></div>
              </div>
              <div className="flex justify-between">
                <button type="button" onClick={() => goToStep(1)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                <button type="button" onClick={() => { markStepValidated(2); goToStep(3); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 3</button>
              </div>
            </div>}
            {generalStep >= 3 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold"><Maximize className="h-5 w-5 inline text-emerald-600 mr-2" />Etape 3 - Caractéristiques</h3>
                <button type="button" onClick={() => setShowFeaturePanel(!showFeaturePanel)} className="px-3 py-1.5 text-xs sm:text-sm rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">Ajouter caractéristiques</button>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Caractéristiques proposées pour {modeLabels[(formData.mode || 'location_saisonniere') as BienMode]} - {typeLabels[(formData.type || 'appartement') as BienType]}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableFeatures.map((feature) => (
                    <label key={feature.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200">
                      <input type="checkbox" checked={selectedFeatureIds.includes(feature.id)} onChange={(e) => setSelectedFeatureIds((prev) => e.target.checked ? [...prev, feature.id] : prev.filter((id) => id !== feature.id))} />
                      <span className="text-sm">{feature.nom}</span>
                    </label>
                  ))}
                  {availableFeatures.length === 0 && <span className="text-xs text-gray-500">Aucune caractéristique liée a ce mode/type</span>}
                </div>
              </div>
              {showFeaturePanel && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
                  <div className="flex gap-2">
                    <input type="text" value={newFeature} onChange={(e) => setNewFeature(e.target.value)} placeholder="Ex: Wifi, Vue mer, Clim centralisee" className="flex-1 rounded-lg border-gray-300 border p-2 text-sm" />
                    <button type="button" onClick={handleAddFeature} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm">Ajouter</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customFeatures.map((feature) => (
                      <span key={feature} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-emerald-200 rounded-full">{feature}<button type="button" onClick={() => handleRemoveFeature(feature)} className="text-red-500">x</button></span>
                    ))}
                    {customFeatures.length === 0 && <span className="text-xs text-gray-500">Aucune caractéristique personnalisée</span>}
                  </div>
                </div>
              )}
              {isAppartementVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Détails Appartement (Vente)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Superficie (m²)</label>
                      <input type="number" min={0} step="0.01" name="superficie_m2" value={formData.superficie_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Étage</label>
                      <input type="number" min={0} name="etage" value={formData.etage ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Configuration</label>
                      <input name="configuration" value={formData.configuration || ''} onChange={handleChange} placeholder="S+2, S+3..." className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de SDB</label>
                      <input type="number" min={0} name="nb_salle_bain" value={formData.nb_salle_bain || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Année construction</label>
                      <input type="number" min={1800} max={3000} name="annee_construction" value={formData.annee_construction ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label>
                      <select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label>
                      <select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Distance plage (m)</label>
                      <input type="number" min={0} name="distance_plage_m" value={formData.distance_plage_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {APPARTEMENT_VENTE_BOOLEAN_FIELDS.slice(0, 13).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{APPARTEMENT_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                  <h5 className="mt-4 text-sm font-semibold text-gray-800">Caractéristiques générales</h5>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {APPARTEMENT_VENTE_BOOLEAN_FIELDS.slice(13).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{APPARTEMENT_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {isLocalCommercialVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Détails Local commercial (Vente)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Surface (m²)</label>
                      <input type="number" min={0} step="0.01" name="surface_local_m2" value={formData.surface_local_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Façade (m)</label>
                      <input type="number" min={0} step="0.01" name="facade_m" value={formData.facade_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hauteur plafond (m)</label>
                      <input type="number" min={0} step="0.01" name="hauteur_plafond_m" value={formData.hauteur_plafond_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Activité recommandée</label>
                      <input name="activite_recommandee" value={formData.activite_recommandee || ''} onChange={handleChange} placeholder="Café, boutique..." className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label>
                      <select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label>
                      <select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS.slice(0, 7).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                  <h5 className="mt-4 text-sm font-semibold text-gray-800">Caractéristiques générales</h5>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS.slice(7).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {isTerrainVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Détails Terrain (Vente)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Façade (m)</label>
                      <input type="number" min={0} step="0.01" name="terrain_facade_m" value={formData.terrain_facade_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Surface (m²)</label>
                      <input type="number" min={0} step="0.01" name="terrain_surface_m2" value={formData.terrain_surface_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de terrain *</label>
                      <select name="type_terrain" value={formData.type_terrain || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_TERRAIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Agricole: culture, Habitation: résidentiel, Industrielle: activité pro, Loisir: usage détente.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
                      <input name="terrain_zone" value={formData.terrain_zone || ''} onChange={handleChange} placeholder="Urbaine / touristique..." className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Distance plage (m)</label>
                      <input type="number" min={0} name="terrain_distance_plage_m" value={formData.terrain_distance_plage_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label>
                      <select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label>
                      <select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {TERRAIN_VENTE_BOOLEAN_FIELDS.slice(0, 2).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{TERRAIN_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                  <h5 className="mt-4 text-sm font-semibold text-gray-800">Caractéristiques générales</h5>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {TERRAIN_VENTE_BOOLEAN_FIELDS.slice(2).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{TERRAIN_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {isImmeubleVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Détails Immeuble (Vente)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Surface terrain (m²)</label><input type="number" min={0} step="0.01" name="immeuble_surface_terrain_m2" value={formData.immeuble_surface_terrain_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Surface bâtie (m²)</label><input type="number" min={0} step="0.01" name="immeuble_surface_batie_m2" value={formData.immeuble_surface_batie_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de niveaux</label><input type="number" min={0} name="immeuble_nb_niveaux" value={formData.immeuble_nb_niveaux ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de garages</label><input type="number" min={0} name="immeuble_nb_garages" value={formData.immeuble_nb_garages ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre d'appartements</label><input type="number" min={0} name="immeuble_nb_appartements" value={formData.immeuble_nb_appartements ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de locaux commerciaux</label><input type="number" min={0} name="immeuble_nb_locaux_commerciaux" value={formData.immeuble_nb_locaux_commerciaux ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label><select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">-- Choisir --</option>{Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label><select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">-- Choisir --</option>{Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Distance plage (m)</label><input type="number" min={0} name="immeuble_distance_plage_m" value={formData.immeuble_distance_plage_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                  </div>
                  <div className="mt-4">
                    <h5 className="text-sm font-semibold text-gray-800 mb-2">Appartements de l'immeuble</h5>
                    <div className="space-y-2">
                      {(formData.immeuble_appartements || []).map((row, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Chambres</label><input type="number" min={0} value={row.chambres || 0} onChange={(e) => handleImmeubleAppartementChange(idx, 'chambres', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - SDB</label><input type="number" min={0} value={row.salle_bain || 0} onChange={(e) => handleImmeubleAppartementChange(idx, 'salle_bain', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Surface (m²)</label><input type="number" min={0} step="0.01" value={row.superficie_m2 ?? ''} onChange={(e) => handleImmeubleAppartementChange(idx, 'superficie_m2', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Configuration</label><input value={row.configuration || ''} onChange={(e) => handleImmeubleAppartementChange(idx, 'configuration', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                        </div>
                      ))}
                      {(formData.immeuble_appartements || []).length === 0 && <span className="text-xs text-gray-500">Le nombre de lignes suit le champ "Nombre d'appartements".</span>}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {IMMEUBLE_VENTE_BOOLEAN_FIELDS.slice(0, 6).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{IMMEUBLE_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                  <h5 className="mt-4 text-sm font-semibold text-gray-800">Caractéristiques générales</h5>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {IMMEUBLE_VENTE_BOOLEAN_FIELDS.slice(6).map((field) => (
                      <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                        <span>{IMMEUBLE_VENTE_BOOLEAN_LABELS[field]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!isAppartementVente && !isLocalCommercialVente && !isTerrainVente && !isImmeubleVente && <div><label className="block text-sm font-medium text-gray-700 mb-1">Chambres</label><input type="number" name="nb_chambres" value={formData.nb_chambres || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>}
                {!isAppartementVente && !isLocalCommercialVente && !isTerrainVente && !isImmeubleVente && <div><label className="block text-sm font-medium text-gray-700 mb-1">Salles de bain</label><input type="number" name="nb_salle_bain" value={formData.nb_salle_bain || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>}
                <label htmlFor="menage_en_cours" className="md:col-span-2 flex items-center justify-between gap-3 p-3 rounded-lg border border-emerald-100 bg-emerald-50/60 cursor-pointer">
                  <div>
                    <span className="block text-sm font-medium text-gray-800">Ménage en cours</span>
                    <span className="block text-xs text-gray-500">Indique si le bien est en préparation</span>
                  </div>
                  <input type="checkbox" id="menage_en_cours" name="menage_en_cours" checked={formData.menage_en_cours || false} onChange={handleCheckboxChange} className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                </label>
              </div>
              <div className="flex justify-between">
                <button type="button" onClick={() => goToStep(2)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                <button type="button" onClick={() => { markStepValidated(3); goToStep(4); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 4</button>
              </div>
            </div>}
            {generalStep >= 4 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Banknote className="h-5 w-5 inline text-emerald-600 mr-2" />Tarification</h3>
              {isModeVente ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Méthode de commission</label>
                      <select name="tarification_methode" value={currentTarificationMethode} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="avec_commission">Avec commission</option>
                        <option value="sans_commission">Sans commission</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix affiché client (DT)</label>
                      <input type="number" min={0} step="0.01" name="prix_affiche_client" value={formData.prix_affiche_client ?? formData.prix_nuitee ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    {currentTarificationMethode === 'avec_commission' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix fixe propriétaire (calculé)</label>
                        <input readOnly value={venteTarificationPreview.prixFixeProprietaire} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix fixe propriétaire (DT)</label>
                        <input type="number" min={0} step="0.01" name="prix_fixe_proprietaire" value={formData.prix_fixe_proprietaire ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                    )}
                  </div>
                  {currentTarificationMethode === 'avec_commission' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Commission part propriétaire (%)</label>
                        <input type="number" min={0} step="0.01" name="commission_pourcentage_proprietaire" value={formData.commission_pourcentage_proprietaire ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Commission part client (%)</label>
                        <input type="number" min={0} step="0.01" name="commission_pourcentage_client" value={formData.commission_pourcentage_client ?? DEFAULT_COMMISSION_CLIENT_PERCENT} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Montant max à diminuer (DT)</label>
                        <input type="number" min={0} step="0.01" name="montant_max_reduction_negociation" value={formData.montant_max_reduction_negociation ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix minimum accepté (calculé)</label>
                        <input readOnly value={venteTarificationPreview.prixMinimumAccepte} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix final (DT)</label><input readOnly value={venteTarificationPreview.prixFinal} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Revenu agence (DT)</label><input readOnly value={venteTarificationPreview.revenuAgence} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix fixe propriétaire (DT)</label><input readOnly value={venteTarificationPreview.prixFixeProprietaire} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix / nuit (DT)</label><input type="number" name="prix_nuitee" value={formData.prix_nuitee || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Avance (DT)</label><input type="number" name="avance" value={formData.avance || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Caution (DT)</label><input type="number" name="caution" value={formData.caution || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                </div>
              )}
              <div className="flex justify-between">
                <button type="button" onClick={() => goToStep(3)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                {isModeVente
                  ? <button type="button" onClick={() => { markStepValidated(4); goToStep(5); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 5</button>
                  : <button type="button" onClick={() => { markStepValidated(4); toast.success('Etape 4 validée'); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Valider etape 4</button>}
              </div>
            </div>}
            {isModeVente && generalStep >= 5 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Banknote className="h-5 w-5 inline text-emerald-600 mr-2" />Modalite de paiement (Vente)</h3>
              {isModeVente ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement</label>
                      <select name="modalite_paiement_vente" value={currentModalitePaiementVente} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="comptant">Comptant</option>
                        <option value="facilite">Facilite de paiement</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix total client (DT)</label>
                      <input readOnly value={venteTarificationPreview.prixFinal} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">1ere partie promesse (DT)</label>
                      <input readOnly value={ventePaiementPreview.montantPremierePartiePromesse} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                    </div>
                  </div>
                  {currentModalitePaiementVente === 'facilite' ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Pourcentage 1ere partie (%)</label>
                          <input type="number" min={0} max={100} step="0.01" name="pourcentage_premiere_partie_promesse" value={formData.pourcentage_premiere_partie_promesse ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de tranches</label>
                          <input type="number" min={1} step="1" name="nombre_tranches" value={formData.nombre_tranches ?? 6} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Periode totale (mois)</label>
                          <input type="number" min={1} step="1" name="periode_tranches_mois" value={formData.periode_tranches_mois ?? 6} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">2eme partie restante (DT)</label><input readOnly value={ventePaiementPreview.montantDeuxiemePartie} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Montant par tranche (DT)</label><input readOnly value={ventePaiementPreview.montantParTranche} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Resume</label><input readOnly value={`${ventePaiementPreview.nombreTranches} tranches / ${ventePaiementPreview.periodeTranchesMois} mois`} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Montant comptant (DT)</label><input readOnly value={ventePaiementPreview.montantPremierePartiePromesse} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Reste (DT)</label><input readOnly value={0} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <button type="button" onClick={() => goToStep(4)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                    <button type="button" onClick={() => { markStepValidated(5); toast.success('Etape 5 validée'); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Valider etape 5</button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">La modalite de paiement est geree uniquement pour le mode vente.</p>
              )}
            </div>}
          </div>
        )}
        {activeTab === 'images' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-semibold mb-4"><ImageIcon className="h-5 w-5 inline text-emerald-600 mr-2" />Gestion des images</h3>
              {normalizeLegacyType((formData.type || 'appartement') as BienType) === 'local_commercial' && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motif d'upload photo du local</label>
                  <input
                    type="text"
                    value={newImageMotif}
                    onChange={(e) => setNewImageMotif(e.target.value)}
                    placeholder="Ex: Facade, Vitrine, Interieur, Reserve..."
                    className="w-full rounded-lg border-gray-300 border p-2"
                  />
                </div>
              )}
              <div className="flex gap-2 mb-4"><input type="text" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="URL de l'image" className="flex-1 rounded-lg border-gray-300 border p-2" /><button type="button" onClick={handleAddImage} disabled={!newImageUrl.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">Ajouter</button></div>
              <div className="mb-6"><label className="block text-sm font-medium text-gray-700 mb-2">Ou upload</label><input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading} className="block w-full text-sm" />{uploading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600 mt-2"></div>}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((img, index) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={`relative group rounded-lg overflow-hidden border border-gray-200 ${draggedImageIndex === index ? 'opacity-60 ring-2 ring-emerald-300' : ''}`}
                  >
                    <img src={img.url} alt="" className="w-full h-32 object-cover" />
                    <div className="absolute top-2 right-2 p-1 bg-black/40 text-white rounded cursor-grab"><GripVertical className="h-3.5 w-3.5" /></div>
                    <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-2">
                      <button type="button" onClick={() => handleMoveImage(index, 'up')} disabled={index === 0} className="p-1.5 bg-white/95 rounded-full disabled:opacity-50 shadow">↑</button>
                      <button type="button" onClick={() => handleMoveImage(index, 'down')} disabled={index === images.length - 1} className="p-1.5 bg-white/95 rounded-full disabled:opacity-50 shadow">↓</button>
                      {index !== 0 && <button type="button" onClick={() => handleSetMainImage(index)} className="p-1.5 bg-emerald-500 text-white rounded-full shadow">★</button>}
                      <button type="button" onClick={() => handleRemoveImage(img.id)} className="p-1.5 bg-red-500 text-white rounded-full shadow">✕</button>
                    </div>
                    {index === 0 && <span className="absolute top-2 left-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded">Principale</span>}
                    {!!img.motif_upload && <span className="absolute top-2 left-20 bg-white/90 text-gray-700 text-xs px-2 py-0.5 rounded border">{img.motif_upload}</span>}
                    <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">{index + 1}/{images.length}</span>
                  </div>
                ))}
                {images.length === 0 && <div className="col-span-full text-center py-8 text-gray-500">Aucune image</div>}
              </div>
            </div>
          </div>
        )}
        {!isModeVente && activeTab === 'calendar' && (
          <div className="max-w-5xl mx-auto">
            <AdminCalendar dates={unavailableDates} onDatesChange={setUnavailableDates} />
          </div>
        )}
      </div>
      <Dialog.Root open={stepInfoDialogOpen} onOpenChange={setStepInfoDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Dialog.Content className="fixed z-[61] left-1/2 top-1/2 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Validation</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-600">Étape Informations validée.</Dialog.Description>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setStepInfoDialogOpen(false)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">OK</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  );
}

function AdminCalendar({ dates, onDatesChange }: { dates: DateStatus[], onDatesChange: (dates: DateStatus[]) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'blocked' | 'booked' | 'pending'>('blocked');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const monthStart = startOfMonth(currentMonth), monthEnd = endOfMonth(currentMonth), calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }), calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 }), days = eachDayOfInterval({ start: calendarStart, end: calendarEnd }), today = startOfDay(new Date());

  const getDateStatus = (date: Date): DateStatus | undefined => dates.find(range => range?.start && range?.end && isWithinInterval(date, { start: parseISO(range.start), end: parseISO(range.end) }));
  const handleDateClick = (date: Date) => { if (isBefore(date, today)) return; if (!selectionStart || (selectionStart && selectionEnd)) { setSelectionStart(date); setSelectionEnd(null); } else { if (date < selectionStart) setSelectionStart(date); else setSelectionEnd(date); } };
  const buildDateStatus = (start: string, end: string): DateStatus => ({ start, end, status: selectedStatus, color: selectedStatus === 'booked' ? '#ef4444' : selectedStatus === 'pending' ? '#f97316' : '#111827' });
  const handleAddPeriod = () => { if (!selectionStart || !selectionEnd) return; const start = format(selectionStart < selectionEnd ? selectionStart : selectionEnd, 'yyyy-MM-dd'); const end = format(selectionStart < selectionEnd ? selectionEnd : selectionStart, 'yyyy-MM-dd'); onDatesChange([...dates, buildDateStatus(start, end)]); setSelectionStart(null); setSelectionEnd(null); toast.success('Période ajoutée'); };
  const handleManualAddPeriod = () => { if (!manualStartDate || !manualEndDate) return toast.error('Choisissez les deux dates'); if (manualEndDate < manualStartDate) return toast.error('La date de fin doit être après la date de début'); onDatesChange([...dates, buildDateStatus(manualStartDate, manualEndDate)]); setManualStartDate(''); setManualEndDate(''); toast.success('Période ajoutée'); };
  const handleRemovePeriod = (index: number) => { onDatesChange(dates.filter((_, i) => i !== index)); toast.success('Période supprimée'); };
  const getDayClassName = (date: Date) => { const status = getDateStatus(date); const isPast = isBefore(date, today); const isSelected = (selectionStart && date.getTime() === selectionStart.getTime()) || (selectionEnd && date.getTime() === selectionEnd.getTime()); const inSelectionRange = selectionStart && selectionEnd && isWithinInterval(date, { start: selectionStart < selectionEnd ? selectionStart : selectionEnd, end: selectionStart < selectionEnd ? selectionEnd : selectionStart }); let base = "w-full h-12 sm:h-14 lg:h-16 flex items-center justify-center text-sm rounded-lg cursor-pointer "; if (isPast) base += "text-gray-300 cursor-not-allowed "; else if (status) base += "text-white font-medium "; else if (isSelected || inSelectionRange) base += "bg-emerald-500 text-white font-bold "; else base += "bg-green-100 text-green-700 hover:bg-green-200 "; return base; };
  const getDayBackground = (date: Date) => { const status = getDateStatus(date); if (status?.color) return status.color; if (status?.status === 'booked') return '#ef4444'; if (status?.status === 'pending') return '#f97316'; if (status?.status === 'blocked') return '#111827'; return ''; };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <h3 className="text-lg font-semibold mb-4"><CalendarIcon className="h-5 w-5 inline text-emerald-600 mr-2" />Calendrier</h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4"><div className="flex-1 min-w-[200px]"><label className="block text-xs font-medium text-gray-500 mb-1">Statut</label><select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as 'blocked' | 'booked' | 'pending')} className="w-full rounded-lg border-gray-300 border p-2"><option value="blocked">Bloqué</option><option value="booked">Réservé</option><option value="pending">En attente</option></select></div></div>
        <div className="flex items-center gap-2"><span className="text-sm text-gray-600">Sélection calendrier: {selectionStart ? format(selectionStart, 'dd/MM/yyyy') : '...'}{selectionEnd ? ` - ${format(selectionEnd, 'dd/MM/yyyy')}` : ''}</span><button type="button" onClick={handleAddPeriod} disabled={!selectionStart || !selectionEnd} className="ml-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">Ajouter sélection</button></div>
        <div className="border-t border-gray-200 pt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Date début</label><input type="date" value={manualStartDate} onChange={(e) => setManualStartDate(e.target.value)} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Date fin</label><input type="date" value={manualEndDate} onChange={(e) => setManualEndDate(e.target.value)} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div>
          <div className="sm:col-span-2 sm:flex sm:justify-end"><button type="button" onClick={handleManualAddPeriod} disabled={!manualStartDate || !manualEndDate} className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">Confirmer saisie manuelle</button></div>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4"><button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="h-5 w-5" /></button><h4 className="text-lg font-semibold capitalize">{format(currentMonth, "MMMM yyyy", { locale: fr })}</h4><button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="h-5 w-5" /></button></div>
      <div className="grid grid-cols-7 gap-1 mb-2">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">{day}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">{days.map((day, idx) => <div key={idx} onClick={() => handleDateClick(day)}><div className={getDayClassName(day)} style={{ backgroundColor: getDayBackground(day) || undefined }}><span>{format(day, "d")}</span></div></div>)}</div>
      {dates.length > 0 && <div className="mt-6 pt-4 border-t"><h5 className="font-semibold mb-3">Périodes</h5><div className="space-y-2">{dates.map((date, index) => <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><div className="flex items-center gap-3"><div className="w-4 h-4 rounded" style={{ backgroundColor: date.color || '#111827' }}></div><span className="text-sm">{format(parseISO(date.start), 'dd/MM/yyyy')} - {format(parseISO(date.end), 'dd/MM/yyyy')}</span></div><button onClick={() => handleRemovePeriod(index)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button></div>)}</div></div>}
    </div>
  );
}

function BienPreview({ bien, zones }: { bien: Bien; zones: Zone[] }) {
  const mainImage = bien.media?.[0]?.url || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800';
  const displayPrice = bien.mode === 'vente' ? Number(bien.prix_affiche_client ?? bien.prix_nuitee ?? 0) : Number(bien.prix_nuitee || 0);
  const rawDescription = bien.description || '';
  const markerIndex = rawDescription.indexOf(CHARACTERISTICS_MARKER);
  const cleanDescription = markerIndex >= 0 ? rawDescription.slice(0, markerIndex).trim() : rawDescription;
  const customFeatures = markerIndex >= 0 ? (() => { try { const parsed = JSON.parse(rawDescription.slice(markerIndex + CHARACTERISTICS_MARKER.length).trim()); return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []; } catch { return []; } })() : [];
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="mb-6"><img src={mainImage} alt={bien.titre} className="w-full h-64 object-cover rounded-xl" /></div>
      <div className="space-y-6">
        <div><div className="flex items-center gap-2 mb-2"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[bien.statut]}`}>{statusLabels[bien.statut]}</span><span className="text-sm text-gray-500">{typeLabels[bien.type]}</span></div><h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{bien.titre}</h1><div className="flex items-center gap-2 text-gray-600 mt-2"><MapPin className="h-4 w-4" /><span>{zones.find(z => z.id === bien.zone_id)?.nom}</span></div></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4"><div className="bg-gray-50 rounded-lg p-4 text-center"><Bed className="h-5 w-5 mx-auto text-gray-400 mb-1" /><span className="font-semibold">{bien.nb_chambres}</span><span className="text-xs text-gray-500 block">Chambres</span></div><div className="bg-gray-50 rounded-lg p-4 text-center"><Bath className="h-5 w-5 mx-auto text-gray-400 mb-1" /><span className="font-semibold">{bien.nb_salle_bain}</span><span className="text-xs text-gray-500 block">Salles de bain</span></div><div className="bg-gray-50 rounded-lg p-4 text-center"><Banknote className="h-5 w-5 mx-auto text-gray-400 mb-1" /><span className="font-semibold">{bien.avance} DT</span><span className="text-xs text-gray-500 block">Avance</span></div><div className="bg-gray-50 rounded-lg p-4 text-center"><Sofa className="h-5 w-5 mx-auto text-gray-400 mb-1" /><span className="font-semibold">{bien.menage_en_cours ? 'Oui' : 'Non'}</span><span className="text-xs text-gray-500 block">Ménage</span></div></div>
        {customFeatures.length > 0 && <div><h3 className="text-lg font-semibold mb-2">Caractéristiques ajoutées</h3><div className="flex flex-wrap gap-2">{customFeatures.map((feature) => <span key={feature} className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-sm text-emerald-700">{feature}</span>)}</div></div>}
        {cleanDescription && <div><h3 className="text-lg font-semibold mb-2">Description</h3><p className="text-gray-600 whitespace-pre-line">{cleanDescription}</p></div>}
        <div className="bg-emerald-50 rounded-xl p-6">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-bold text-emerald-600">{displayPrice} DT</span>
              {bien.mode !== 'vente' && <span className="text-gray-500">/nuit</span>}
            </div>
            {bien.mode === 'vente' ? (
              <div className="text-right text-sm text-gray-500">
                <div>Prix final: {bien.prix_final ?? displayPrice} DT</div>
                <div>Revenu agence: {bien.revenu_agence ?? 0} DT</div>
              </div>
            ) : (
              <div className="text-right text-sm text-gray-500"><div>Avance: {bien.avance} DT</div><div>Caution: {bien.caution} DT</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


