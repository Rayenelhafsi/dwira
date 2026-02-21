import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, MapPin, Home, Banknote, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Image as ImageIcon, Bed, Bath, Maximize, Sofa, ArrowLeft, Trash, Save, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { mockZones, mockProprietaires } from '../data/mockData';
import { Bien, BienStatut, Media, DateStatus, BienType, Zone, Proprietaire } from '../types';
import * as Dialog from '@radix-ui/react-dialog';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, addMonths, subMonths, startOfWeek, endOfWeek, isWithinInterval, parseISO, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { useProperties } from '../../context/PropertiesContext';

const statusColors: Record<BienStatut, string> = { disponible: "bg-emerald-100 text-emerald-800 border-emerald-200", loue: "bg-blue-100 text-blue-800 border-blue-200", reserve: "bg-amber-100 text-amber-800 border-amber-200", maintenance: "bg-red-100 text-red-800 border-red-200", bloque: "bg-gray-200 text-gray-800 border-gray-300" };
const statusLabels: Record<BienStatut, string> = { disponible: "Disponible", loue: "Loué", reserve: "Réservé", maintenance: "Maintenance", bloque: "Bloqué" };
const typeLabels: Record<BienType, string> = { S1: "S+1", S2: "S+2", S3: "S+3", S4: "S+4", villa: "Villa", studio: "Studio", local: "Local" };
const CHARACTERISTICS_MARKER = '[CARACTERISTIQUES_JSON]';

export default function BiensPage() {
  const { biens, zones, proprietaires, addBien, updateBien, deleteBien, isLoading } = useProperties();
  const zoneOptions = zones.length > 0 ? zones : mockZones;
  const proprietaireOptions = proprietaires.length > 0 ? proprietaires : mockProprietaires;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BienStatut | 'all'>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingBien, setEditingBien] = useState<Bien | null>(null);
  const [viewingBien, setViewingBien] = useState<Bien | null>(null);

  const filteredBiens = biens.filter(bien => (bien.titre.toLowerCase().includes(searchTerm.toLowerCase()) || bien.reference.toLowerCase().includes(searchTerm.toLowerCase())) && (statusFilter === 'all' || bien.statut === statusFilter));

  const handleDelete = async (id: string) => { if (window.confirm('Supprimer ce bien ?')) { try { await deleteBien(id); toast.success('Bien supprimé'); } catch { toast.error('Erreur'); } } };
  const handleSave = async (bien: Bien) => { try { if (editingBien) { await updateBien(bien); toast.success('Bien modifié'); } else { const { created_at, updated_at, media, unavailableDates, ...bienData } = bien; await addBien(bienData as any); toast.success('Bien ajouté'); } setIsAddOpen(false); setEditingBien(null); } catch { toast.error('Erreur sauvegarde'); } };

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
    </div>
  );
}

function BienCard({ bien, zones, onEdit, onDelete, onView }: { bien: Bien; zones: Zone[]; onEdit: () => void; onDelete: () => void; onView: () => void; }) {
  const mainImage = bien.media?.[0]?.url || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800';
  const imageCount = bien.media?.length || 0;
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
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3"><p className="text-white font-bold text-lg">{bien.prix_nuitee} DT<span className="text-xs font-normal text-white/80">/nuit</span></p></div>
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
  const [formData, setFormData] = useState<Partial<Bien>>(initialData || { reference: '', titre: '', description: '', type: 'S1' as BienType, nb_chambres: 0, nb_salle_bain: 0, prix_nuitee: 0, avance: 0, caution: 0, statut: 'disponible' as BienStatut, menage_en_cours: false, zone_id: zones[0]?.id || '', proprietaire_id: proprietaires[0]?.id || '' });
  const [zonesOptions, setZonesOptions] = useState<Zone[]>(zones);
  const [proprietaireOptions, setProprietaireOptions] = useState<Proprietaire[]>(proprietaires);
  const [images, setImages] = useState<Media[]>(initialData?.media || []);
  const [unavailableDates, setUnavailableDates] = useState<DateStatus[]>(initialData?.unavailableDates || []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const initialMediaIds = new Set((initialData?.media || []).map((m) => m.id));
  const [showFeaturePanel, setShowFeaturePanel] = useState(false);
  const [newFeature, setNewFeature] = useState('');
  const [customFeatures, setCustomFeatures] = useState<string[]>(initialData?.caracteristiques || []);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddProprietaire, setShowAddProprietaire] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneDescription, setNewZoneDescription] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerCin, setNewOwnerCin] = useState('');
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);

  useEffect(() => {
    const rawDescription = initialData?.description || '';
    const markerIndex = rawDescription.indexOf(CHARACTERISTICS_MARKER);
    if (markerIndex >= 0) {
      const cleanDescription = rawDescription.slice(0, markerIndex).trim();
      setFormData((prev) => ({ ...prev, description: cleanDescription }));
      try {
        const parsed = JSON.parse(rawDescription.slice(markerIndex + CHARACTERISTICS_MARKER.length).trim());
        if (Array.isArray(parsed)) setCustomFeatures(parsed.filter((x) => typeof x === 'string'));
      } catch {
        setCustomFeatures([]);
      }
    }
  }, [initialData]);

  useEffect(() => { setZonesOptions(zones); }, [zones]);
  useEffect(() => { setProprietaireOptions(proprietaires); }, [proprietaires]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const uploadFormData = new FormData();
    uploadFormData.append('image', file);
    try {
      const response = await fetch('http://localhost:3001/api/upload', { method: 'POST', body: uploadFormData });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      const newMedia: Media = { id: Math.random().toString(36).substr(2, 9), bien_id: '', type: 'image', url: data.url };
      setImages([...images, newMedia]);
      toast.success('Image uploadée');
    } catch { toast.error('Erreur upload'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }));

  const handleAddImage = () => {
    if (!newImageUrl.trim()) return;
    const newMedia: Media = { id: Math.random().toString(36).substr(2, 9), bien_id: formData.id || '', type: 'image', url: newImageUrl };
    setImages([...images, newMedia]);
    setNewImageUrl('');
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
    if (customFeatures.includes(value)) return;
    setCustomFeatures([...customFeatures, value]);
    setNewFeature('');
  };

  const handleRemoveFeature = (feature: string) => {
    setCustomFeatures(customFeatures.filter((item) => item !== feature));
  };

  const handleAddZone = async () => {
    if (!newZoneName.trim()) return toast.error('Nom de zone requis');
    try {
      const payload = { id: `z${Date.now()}`, nom: newZoneName.trim(), description: newZoneDescription.trim() };
      const response = await fetch('http://localhost:3001/api/zones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('Failed to create zone');
      const createdZone = await response.json();
      setZonesOptions([...zonesOptions, createdZone]);
      setFormData(prev => ({ ...prev, zone_id: createdZone.id }));
      setNewZoneName('');
      setNewZoneDescription('');
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
    const imagesWithPositions = images.map((img, idx) => ({ ...img, position: idx }));
    const descriptionWithFeatures = customFeatures.length > 0 ? `${(formData.description || '').trim()}\n\n${CHARACTERISTICS_MARKER}${JSON.stringify(customFeatures)}` : (formData.description || '');
    const finalData: Bien = { ...formData, description: descriptionWithFeatures, caracteristiques: customFeatures, id: initialData?.id || Math.random().toString(36).substr(2, 9), media: imagesWithPositions, unavailableDates: unavailableDates, created_at: initialData?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(), date_ajout: initialData?.date_ajout || new Date().toISOString().split('T')[0] } as Bien;
    
    // Save media positions to database
    if (finalData.id && imagesWithPositions.length > 0) {
      try {
        const existingMedia = imagesWithPositions.filter((media) => initialMediaIds.has(media.id));
        const newMedia = imagesWithPositions.filter((media) => !initialMediaIds.has(media.id));
        const removedMediaIds = Array.from(initialMediaIds).filter((id) => !imagesWithPositions.some((media) => media.id === id));

        let usedFullRebuild = false;

        if (existingMedia.length > 0) {
          const positionPayload = existingMedia.map((media) => ({ id: media.id, position: media.position ?? 0 }));
          const bulkResponse = await fetch('http://localhost:3001/api/media/bulk/positions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media: positionPayload }),
          });

          if (!bulkResponse.ok) {
            let singleUpdateOk = true;
            for (const item of positionPayload) {
              const updateResponse = await fetch(`http://localhost:3001/api/media/${item.id}/position`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ position: item.position }),
              });
              if (!updateResponse.ok) {
                singleUpdateOk = false;
                break;
              }
            }

            if (!singleUpdateOk) {
              for (const mediaId of Array.from(initialMediaIds)) {
                await fetch(`http://localhost:3001/api/media/${mediaId}`, { method: 'DELETE' });
              }
              for (const media of imagesWithPositions) {
                const rebuildResponse = await fetch('http://localhost:3001/api/media', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ bien_id: finalData.id, type: media.type, url: media.url, position: media.position ?? 0 }),
                });
                if (!rebuildResponse.ok) throw new Error('Failed to rebuild media order');
              }
              usedFullRebuild = true;
            }
          }
        }

        if (!usedFullRebuild) {
          for (const mediaId of removedMediaIds) {
            const deleteResponse = await fetch(`http://localhost:3001/api/media/${mediaId}`, { method: 'DELETE' });
            if (!deleteResponse.ok) throw new Error('Failed to delete media');
          }
          for (const media of newMedia) {
            const createResponse = await fetch('http://localhost:3001/api/media', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bien_id: finalData.id, type: media.type, url: media.url, position: media.position ?? 0 }),
            });
            if (!createResponse.ok) throw new Error('Failed to create media');
          }
        }
      } catch (error) { console.error('Error saving media:', error); }
    }
    onSubmit(finalData);
  };

  return (
    <form id="bien-editor-form" onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 bg-gray-50 px-4 shrink-0 overflow-x-auto">
        <button type="button" onClick={() => setActiveTab('general')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'general' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}><Home className="h-4 w-4 inline mr-2" />Informations</button>
        <button type="button" onClick={() => setActiveTab('images')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'images' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}><ImageIcon className="h-4 w-4 inline mr-2" />Images ({images.length})</button>
        <button type="button" onClick={() => setActiveTab('calendar')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'calendar' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}><CalendarIcon className="h-4 w-4 inline mr-2" />Calendrier</button>
      </div>
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {activeTab === 'general' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Home className="h-5 w-5 inline text-emerald-600 mr-2" />Informations de base</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label><input required name="titre" value={formData.titre || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Référence *</label><input required name="reference" value={formData.reference || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea name="description" value={formData.description || ''} onChange={handleChange} rows={4} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold"><Maximize className="h-5 w-5 inline text-emerald-600 mr-2" />Caractéristiques</h3>
                <button type="button" onClick={() => setShowFeaturePanel(!showFeaturePanel)} className="px-3 py-1.5 text-xs sm:text-sm rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">Ajouter caractéristiques</button>
              </div>
              {showFeaturePanel && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
                  <div className="flex gap-2">
                    <input type="text" value={newFeature} onChange={(e) => setNewFeature(e.target.value)} placeholder="Ex: Wifi, Vue mer, Clim centralisée" className="flex-1 rounded-lg border-gray-300 border p-2 text-sm" />
                    <button type="button" onClick={handleAddFeature} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm">Ajouter</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customFeatures.map((feature) => (
                      <span key={feature} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-emerald-200 rounded-full">{feature}<button type="button" onClick={() => handleRemoveFeature(feature)} className="text-red-500">×</button></span>
                    ))}
                    {customFeatures.length === 0 && <span className="text-xs text-gray-500">Aucune caractéristique personnalisée</span>}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label><select name="type" value={formData.type || 'S1'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="S1">S+1</option><option value="S2">S+2</option><option value="S3">S+3</option><option value="S4">S+4</option><option value="villa">Villa</option><option value="studio">Studio</option><option value="local">Local</option></select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Statut</label><select name="statut" value={formData.statut || 'disponible'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="disponible">Disponible</option><option value="loue">Loué</option><option value="reserve">Réservé</option><option value="maintenance">Maintenance</option><option value="bloque">Bloqué</option></select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Chambres</label><input type="number" name="nb_chambres" value={formData.nb_chambres || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Salles de bain</label><input type="number" name="nb_salle_bain" value={formData.nb_salle_bain || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                <label htmlFor="menage_en_cours" className="md:col-span-2 flex items-center justify-between gap-3 p-3 rounded-lg border border-emerald-100 bg-emerald-50/60 cursor-pointer">
                  <div>
                    <span className="block text-sm font-medium text-gray-800">Ménage en cours</span>
                    <span className="block text-xs text-gray-500">Indique si le bien est en préparation</span>
                  </div>
                  <input type="checkbox" id="menage_en_cours" name="menage_en_cours" checked={formData.menage_en_cours || false} onChange={handleCheckboxChange} className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                </label>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Banknote className="h-5 w-5 inline text-emerald-600 mr-2" />Tarification</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix / nuit (DT)</label><input type="number" name="prix_nuitee" value={formData.prix_nuitee || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Avance (DT)</label><input type="number" name="avance" value={formData.avance || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Caution (DT)</label><input type="number" name="caution" value={formData.caution || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><MapPin className="h-5 w-5 inline text-emerald-600 mr-2" />Localisation</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
                  <select name="zone_id" value={formData.zone_id || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{zonesOptions.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}</select>
                  <button type="button" onClick={() => setShowAddZone(!showAddZone)} className="text-xs text-emerald-700 hover:underline">+ Ajouter une zone</button>
                  {showAddZone && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <input type="text" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="Nom de la zone" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newZoneDescription} onChange={(e) => setNewZoneDescription(e.target.value)} placeholder="Description" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
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
              </div>
            </div>
          </div>
        )}
        {activeTab === 'images' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-semibold mb-4"><ImageIcon className="h-5 w-5 inline text-emerald-600 mr-2" />Gestion des images</h3>
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
                    <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">{index + 1}/{images.length}</span>
                  </div>
                ))}
                {images.length === 0 && <div className="col-span-full text-center py-8 text-gray-500">Aucune image</div>}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'calendar' && (
          <div className="max-w-5xl mx-auto">
            <AdminCalendar dates={unavailableDates} onDatesChange={setUnavailableDates} />
          </div>
        )}
      </div>
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
        <div className="bg-emerald-50 rounded-xl p-6"><div className="flex items-baseline justify-between"><div><span className="text-3xl font-bold text-emerald-600">{bien.prix_nuitee} DT</span><span className="text-gray-500">/nuit</span></div><div className="text-right text-sm text-gray-500"><div>Avance: {bien.avance} DT</div><div>Caution: {bien.caution} DT</div></div></div></div>
      </div>
    </div>
  );
}


