import { useState } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Eye, 
  X,
  MapPin,
  Home,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Image as ImageIcon,
  Check,
  Bed,
  Bath,
  Maximize,
  Sofa,
  ArrowLeft,
  Upload,
  Palette,
  Trash,
  GripVertical,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import { mockBiens, mockZones, mockProprietaires } from '../data/mockData';
import { Bien, BienStatut, Media, DateStatus } from '../types';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  format, 
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  parseISO,
  isBefore,
  startOfDay
} from "date-fns";
import { fr } from "date-fns/locale";

// Status color mapping
const statusColors = {
  disponible: "bg-emerald-100 text-emerald-800 border-emerald-200",
  loue: "bg-blue-100 text-blue-800 border-blue-200",
  reserve: "bg-amber-100 text-amber-800 border-amber-200",
  maintenance: "bg-red-100 text-red-800 border-red-200",
};

const statusLabels = {
  disponible: "Disponible",
  loue: "Loué",
  reserve: "Réservé",
  maintenance: "Maintenance",
};

const typeLabels: Record<string, string> = {
  S1: "S+1",
  S2: "S+2",
  S3: "S+3",
  villa: "Villa",
  studio: "Studio",
  local: "Local",
};

// Predefined colors for calendar
const calendarColors = [
  { name: 'Rouge', value: '#ef4444', class: 'bg-red-500' },
  { name: 'Orange', value: '#f97316', class: 'bg-orange-500' },
  { name: 'Jaune', value: '#eab308', class: 'bg-yellow-500' },
  { name: 'Vert', value: '#22c55e', class: 'bg-green-500' },
  { name: 'Bleu', value: '#3b82f6', class: 'bg-blue-500' },
  { name: 'Violet', value: '#8b5cf6', class: 'bg-violet-500' },
  { name: 'Rose', value: '#ec4899', class: 'bg-pink-500' },
  { name: 'Noir', value: '#111827', class: 'bg-gray-900' },
];

export default function BiensPage() {
  const [biens, setBiens] = useState<Bien[]>(mockBiens);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BienStatut | 'all'>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingBien, setEditingBien] = useState<Bien | null>(null);
  const [viewingBien, setViewingBien] = useState<Bien | null>(null);

  // Filter logic
  const filteredBiens = biens.filter(bien => {
    const matchesSearch = 
      bien.titre.toLowerCase().includes(searchTerm.toLowerCase()) || 
      bien.reference.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || bien.statut === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce bien ?')) {
      setBiens(biens.filter(b => b.id !== id));
      toast.success('Bien supprimé avec succès');
    }
  };

  const handleSave = (bien: Bien) => {
    if (editingBien) {
      setBiens(biens.map(b => b.id === bien.id ? bien : b));
      toast.success('Bien modifié avec succès');
    } else {
      setBiens([...biens, { ...bien, id: Math.random().toString(36).substr(2, 9), created_at: new Date().toISOString() }]);
      toast.success('Bien ajouté avec succès');
    }
    setIsAddOpen(false);
    setEditingBien(null);
  };

  const openEdit = (bien: Bien) => {
    setEditingBien(bien);
    setIsAddOpen(true);
  };

  const openView = (bien: Bien) => {
    setViewingBien(bien);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestion des Biens</h1>
          <p className="text-xs sm:text-sm text-gray-500">Gérez votre portefeuille immobilier</p>
        </div>
        <button 
          onClick={() => { setEditingBien(null); setIsAddOpen(true); }}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 w-full sm:w-auto transition-colors"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nouveau Bien
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition duration-150 ease-in-out"
            placeholder="Rechercher par titre, référence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-64">
          <select
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm rounded-md border"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">Tous les statuts</option>
            <option value="disponible">Disponible</option>
            <option value="loue">Loué</option>
            <option value="reserve">Réservé</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>

      {/* Grid View - Responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {filteredBiens.map((bien) => (
          <BienCard 
            key={bien.id} 
            bien={bien} 
            onEdit={() => openEdit(bien)} 
            onDelete={() => handleDelete(bien.id)}
            onView={() => openView(bien)}
          />
        ))}
      </div>

      {filteredBiens.length === 0 && (
        <div className="text-center py-12">
          <Home className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun bien trouvé</h3>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">Essayez de modifier vos filtres ou ajoutez un nouveau bien.</p>
        </div>
      )}

      {/* Add/Edit Modal - Full Property Editor */}
      <Dialog.Root open={isAddOpen} onOpenChange={setIsAddOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-0 z-50 w-full h-full bg-white overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsAddOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600" />
                </button>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-gray-900">
                    {editingBien ? 'Modifier le bien' : 'Ajouter un nouveau bien'}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-gray-500">
                    {editingBien ? 'Mettez à jour les informations du bien' : 'Créez une nouvelle fiche bien complète'}
                  </Dialog.Description>
                </div>
              </div>
              <button
                onClick={() => document.getElementById('bien-editor-form')?.dispatchEvent(new Event('submit', { bubbles: true }))}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>Sauvegarder</span>
              </button>
            </div>
            
            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto">
              <BienEditor 
                initialData={editingBien} 
                onSubmit={handleSave} 
                onCancel={() => setIsAddOpen(false)} 
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* View Modal - Property Details Preview */}
      <Dialog.Root open={!!viewingBien} onOpenChange={() => setViewingBien(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-0 z-50 w-full h-full bg-white overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setViewingBien(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600" />
                </button>
                <Dialog.Title className="text-lg font-semibold text-gray-900">
                  Aperçu du bien
                </Dialog.Title>
              </div>
              <button
                onClick={() => {
                  setViewingBien(null);
                  if (viewingBien) openEdit(viewingBien);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Edit2 className="h-4 w-4" />
                <span className="hidden sm:inline">Modifier</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {viewingBien && <BienPreview bien={viewingBien} />}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

// Property Card Component
function BienCard({ bien, onEdit, onDelete, onView }: { 
  bien: Bien; 
  onEdit: () => void; 
  onDelete: () => void;
  onView: () => void;
}) {
  const mainImage = bien.media?.[0]?.url || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop';
  const imageCount = bien.media?.length || 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full group">
      <div className="relative h-44 sm:h-48 bg-gray-100 overflow-hidden">
        <img 
          src={mainImage}
          alt={bien.titre}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3 left-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[bien.statut]}`}>
            {statusLabels[bien.statut]}
          </span>
        </div>
        {imageCount > 1 && (
          <div className="absolute top-3 right-3 bg-black/50 text-white px-2 py-1 rounded-lg text-xs backdrop-blur-sm flex items-center gap-1">
            <ImageIcon className="h-3 w-3" />
            {imageCount}
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button onClick={onView} className="p-2 bg-white rounded-full hover:bg-gray-100" title="Aperçu">
            <Eye className="h-4 w-4 text-gray-700" />
          </button>
          <button onClick={onEdit} className="p-2 bg-white rounded-full hover:bg-gray-100" title="Modifier">
            <Edit2 className="h-4 w-4 text-emerald-600" />
          </button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <p className="text-white font-bold text-lg">{bien.prix_loyer} DT<span className="text-xs font-normal text-white/80">/mois</span></p>
        </div>
      </div>
      
      <div className="p-4 flex-1 flex flex-col">
        <div className="mb-3">
          <h3 className="font-bold text-gray-900 text-base line-clamp-1 mb-1">{bien.titre}</h3>
          <div className="flex items-center gap-1 text-gray-500 text-xs">
            <MapPin className="h-3 w-3" />
            <span>{mockZones.find(z => z.id === bien.zone_id)?.nom || 'Zone Inconnue'}</span>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-4">
          <div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded">
            <Maximize className="h-3 w-3 text-gray-400" />
            <span>{bien.surface} m²</span>
          </div>
          <div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded">
            <Bed className="h-3 w-3 text-gray-400" />
            <span>{bien.nb_chambres} Ch.</span>
          </div>
          <div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded">
            <Bath className="h-3 w-3 text-gray-400" />
            <span>{bien.nb_salle_bain} SdB</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
          <span className="px-2 py-1 bg-gray-100 rounded font-medium">{typeLabels[bien.type]}</span>
          <span>Ref: {bien.reference}</span>
        </div>

        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100">
          <button onClick={onView} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium">
            <Eye className="h-4 w-4" />
          </button>
          <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium">
            <Edit2 className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="flex items-center justify-center p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Full Property Editor Component
function BienEditor({ initialData, onSubmit }: { 
  initialData: Bien | null; 
  onSubmit: (data: Bien) => void; 
  onCancel: () => void; 
}) {
  const [activeTab, setActiveTab] = useState<'general' | 'images' | 'calendar'>('general');
  const [formData, setFormData] = useState<Partial<Bien>>(initialData || {
    reference: '',
    titre: '',
    description: '',
    type: 'S1',
    surface: 0,
    nb_chambres: 0,
    nb_salle_bain: 0,
    meuble: false,
    prix_loyer: 0,
    charges: 0,
    caution: 0,
    mode_location: 'annuelle',
    statut: 'disponible',
    zone_id: mockZones[0]?.id || '',
    proprietaire_id: mockProprietaires[0]?.id || '',
  });

  const [images, setImages] = useState<Media[]>(initialData?.media || []);
  const [unavailableDates, setUnavailableDates] = useState<DateStatus[]>(initialData?.unavailableDates || []);
  const [newImageUrl, setNewImageUrl] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'number' ? Number(value) : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
  };

  const handleAddImage = () => {
    if (!newImageUrl.trim()) return;
    const newMedia: Media = {
      id: Math.random().toString(36).substr(2, 9),
      bien_id: formData.id || '',
      type: 'image',
      url: newImageUrl,
    };
    setImages([...images, newMedia]);
    setNewImageUrl('');
    toast.success('Image ajoutée');
  };

  const handleRemoveImage = (id: string) => {
    setImages(images.filter(img => img.id !== id));
    toast.success('Image supprimée');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData: Bien = {
      ...formData,
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      media: images,
      unavailableDates: unavailableDates,
      created_at: initialData?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      date_ajout: initialData?.date_ajout || new Date().toISOString().split('T')[0],
    } as Bien;
    onSubmit(finalData);
  };

  return (
    <form id="bien-editor-form" onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 bg-gray-50/50 px-4 sm:px-6 shrink-0 overflow-x-auto">
        <button type="button" onClick={() => setActiveTab('general')} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'general' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>
          <Home className="h-4 w-4" /> Informations générales
        </button>
        <button type="button" onClick={() => setActiveTab('images')} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'images' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>
          <ImageIcon className="h-4 w-4" /> Images ({images.length})
        </button>
        <button type="button" onClick={() => setActiveTab('calendar')} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'calendar' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>
          <CalendarIcon className="h-4 w-4" /> Calendrier
        </button>
      </div>

      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {activeTab === 'general' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Home className="h-5 w-5 text-emerald-600" /> Informations de base
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
                  <input required name="titre" value={formData.titre} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" placeholder="Ex: Villa de luxe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Référence *</label>
                  <input required name="reference" value={formData.reference} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" placeholder="Ex: REF-001" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" placeholder="Décrivez le bien..." />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Maximize className="h-5 w-5 text-emerald-600" /> Caractéristiques
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select name="type" value={formData.type} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3">
                    <option value="S1">S+1</option><option value="S2">S+2</option><option value="S3">S+3</option>
                    <option value="villa">Villa</option><option value="studio">Studio</option><option value="local">Local</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                  <select name="statut" value={formData.statut} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3">
                    <option value="disponible">Disponible</option><option value="loue">Loué</option><option value="reserve">Réservé</option><option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mode location</label>
                  <select name="mode_location" value={formData.mode_location} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3">
                    <option value="annuelle">Annuelle</option><option value="saisonniere">Saisonnière</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Surface (m²)</label><input type="number" name="surface" value={formData.surface} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Chambres</label><input type="number" name="nb_chambres" value={formData.nb_chambres} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Salles de bain</label><input type="number" name="nb_salle_bain" value={formData.nb_salle_bain} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" /></div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="meuble" name="meuble" checked={formData.meuble} onChange={handleCheckboxChange} className="rounded border-gray-300 text-emerald-600 h-4 w-4" />
                <label htmlFor="meuble" className="text-sm text-gray-700 flex items-center gap-1"><Sofa className="h-4 w-4" /> Logement meublé</label>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" /> Tarification
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Loyer (DT)</label><input type="number" name="prix_loyer" value={formData.prix_loyer} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Charges (DT)</label><input type="number" name="charges" value={formData.charges} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Caution (DT)</label><input type="number" name="caution" value={formData.caution} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" /></div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-emerald-600" /> Localisation & Propriétaire
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
                  <select name="zone_id" value={formData.zone_id} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3">
                    {mockZones.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Propriétaire</label>
                  <select name="proprietaire_id" value={formData.proprietaire_id} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3">
                    {mockProprietaires.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-emerald-600" /> Gestion des images
              </h3>
              <div className="flex gap-2 mb-6">
                <input type="text" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="URL de l'image" className="flex-1 rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2.5 px-3" />
                <button type="button" onClick={handleAddImage} disabled={!newImageUrl.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">Ajouter</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((img, index) => (
                  <div key={img.id} className="relative group rounded-lg overflow-hidden border border-gray-200">
                    <img src={img.url} alt="" className="w-full h-32 object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button type="button" onClick={() => handleRemoveImage(img.id)} className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"><Trash className="h-4 w-4" /></button>
                    </div>
                    {index === 0 && <span className="absolute top-2 left-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded">Principale</span>}
                  </div>
                ))}
                {images.length === 0 && <div className="col-span-full text-center py-8 text-gray-500">Aucune image ajoutée</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <AdminCalendar dates={unavailableDates} onDatesChange={setUnavailableDates} />
          </div>
        )}
      </div>
    </form>
  );
}

// Admin Calendar Component with Date Selection and Color Modification
function AdminCalendar({ dates, onDatesChange }: { dates: DateStatus[], onDatesChange: (dates: DateStatus[]) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#ef4444');
  const [selectedStatus, setSelectedStatus] = useState<'blocked' | 'booked' | 'pending'>('blocked');

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const today = startOfDay(new Date());

  const getDateStatus = (date: Date): DateStatus | undefined => {
    return dates.find(range => {
      const start = parseISO(range.start);
      const end = parseISO(range.end);
      return isWithinInterval(date, { start, end });
    });
  };

  const handleDateClick = (date: Date) => {
    if (isBefore(date, today)) return;
    
    if (!selectionStart || (selectionStart && selectionEnd)) {
      setSelectionStart(date);
      setSelectionEnd(null);
    } else {
      if (date < selectionStart) {
        setSelectionStart(date);
      } else {
        setSelectionEnd(date);
      }
    }
  };

  const handleAddPeriod = () => {
    if (!selectionStart || !selectionEnd) return;
    
    const newDate: DateStatus = {
      start: format(selectionStart < selectionEnd ? selectionStart : selectionEnd, 'yyyy-MM-dd'),
      end: format(selectionStart < selectionEnd ? selectionEnd : selectionStart, 'yyyy-MM-dd'),
      status: selectedStatus,
      color: selectedColor
    };
    
    onDatesChange([...dates, newDate]);
    setSelectionStart(null);
    setSelectionEnd(null);
    toast.success('Période ajoutée');
  };

  const handleRemovePeriod = (index: number) => {
    const newDates = dates.filter((_, i) => i !== index);
    onDatesChange(newDates);
    toast.success('Période supprimée');
  };

  const getDayClassName = (date: Date) => {
    const status = getDateStatus(date);
    const isPast = isBefore(date, today);
    const isSelected = selectionStart && isSameDay(date, selectionStart) || selectionEnd && isSameDay(date, selectionEnd);
    const inSelectionRange = selectionStart && selectionEnd && isWithinInterval(date, { start: selectionStart < selectionEnd ? selectionStart : selectionEnd, end: selectionStart < selectionEnd ? selectionEnd : selectionStart });
    
    let base = "w-full aspect-square flex items-center justify-center text-sm rounded-lg cursor-pointer transition-all ";
    
    if (isPast) base += "text-gray-300 cursor-not-allowed ";
    else if (status) base += `text-white font-medium `;
    else if (isSelected || inSelectionRange) base += "bg-emerald-500 text-white font-bold ";
    else base += "bg-green-100 text-green-700 hover:bg-green-200 ";
    
    return base;
  };

  const getDayBackground = (date: Date) => {
    const status = getDateStatus(date);
    if (status?.color) return status.color;
    if (status?.status === 'booked') return '#ef4444';
    if (status?.status === 'pending') return '#f97316';
    if (status?.status === 'blocked') return '#111827';
    return '';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <CalendarIcon className="h-5 w-5 text-emerald-600" /> Gestion du calendrier
      </h3>

      {/* Add Period Controls */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as any)} className="w-full rounded-lg border-gray-300 border shadow-sm focus:border-emerald-500 py-2 px-3">
              <option value="blocked">Bloqué</option>
              <option value="booked">Réservé</option>
              <option value="pending">En attente</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Couleur</label>
            <div className="flex gap-2">
              {calendarColors.map(color => (
                <button key={color.value} type="button" onClick={() => setSelectedColor(color.value)} className={`w-8 h-8 rounded-full ${color.class} ${selectedColor === color.value ? 'ring-2 ring-offset-2 ring-emerald-500' : ''}`} title={color.name} />
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Sélection: {selectionStart ? format(selectionStart, 'dd/MM/yyyy') : '...'} 
            {selectionEnd ? ` - ${format(selectionEnd, 'dd/MM/yyyy')}` : ''}
          </span>
          <button onClick={handleAddPeriod} disabled={!selectionStart || !selectionEnd} className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm">
            Ajouter la période
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="h-5 w-5" /></button>
        <h4 className="text-lg font-semibold capitalize">{format(currentMonth, "MMMM yyyy", { locale: fr })}</h4>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="h-5 w-5" /></button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => (
          <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => (
          <div key={idx} onClick={() => handleDateClick(day)}>
            <div className={getDayClassName(day)} style={{ backgroundColor: getDayBackground(day) || undefined }}>
              <span>{format(day, "d")}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-100 rounded"></div><span>Disponible</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-gray-900 rounded"></div><span>Bloqué</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-red-500 rounded"></div><span>Réservé</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-orange-500 rounded"></div><span>En attente</span></div>
      </div>

      {/* Periods List */}
      {dates.length > 0 && (
        <div className="mt-6">
          <h5 className="font-semibold text-gray-900 mb-3">Périodes enregistrées</h5>
          <div className="space-y-2">
            {dates.map((date, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: date.color || (date.status === 'booked' ? '#ef4444' : date.status === 'pending' ? '#f97316' : '#111827') }}></div>
                  <span className="text-sm">{format(parseISO(date.start), 'dd/MM/yyyy')} - {format(parseISO(date.end), 'dd/MM/yyyy')}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-200 rounded">{date.status === 'blocked' ? 'Bloqué' : date.status === 'booked' ? 'Réservé' : 'En attente'}</span>
                </div>
                <button onClick={() => handleRemovePeriod(index)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Property Preview Component
function BienPreview({ bien }: { bien: Bien }) {
  const mainImage = bien.media?.[0]?.url || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop';
  
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      {/* Image Gallery */}
      <div className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 h-[300px] sm:h-[400px] rounded-xl overflow-hidden">
          <div className="sm:col-span-2 h-48 sm:h-64">
            <img src={mainImage} alt={bien.titre} className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* Property Info */}
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[bien.statut]}`}>
              {statusLabels[bien.statut]}
            </span>
            <span className="text-sm text-gray-500">{typeLabels[bien.type]}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{bien.titre}</h1>
          <div className="flex items-center gap-2 text-gray-600 mt-2">
            <MapPin className="h-4 w-4" />
            <span>{mockZones.find(z => z.id === bien.zone_id)?.nom}</span>
            <span className="text-gray-400">|</span>
            <span>Ref: {bien.reference}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <Maximize className="h-5 w-5 mx-auto text-gray-400 mb-1" />
            <span className="font-semibold">{bien.surface}</span>
            <span className="text-xs text-gray-500 block">m²</span>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <Bed className="h-5 w-5 mx-auto text-gray-400 mb-1" />
            <span className="font-semibold">{bien.nb_chambres}</span>
            <span className="text-xs text-gray-500 block">Chambres</span>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <Bath className="h-5 w-5 mx-auto text-gray-400 mb-1" />
            <span className="font-semibold">{bien.nb_salle_bain}</span>
            <span className="text-xs text-gray-500 block">Salles de bain</span>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <Sofa className="h-5 w-5 mx-auto text-gray-400 mb-1" />
            <span className="font-semibold">{bien.meuble ? 'Oui' : 'Non'}</span>
            <span className="text-xs text-gray-500 block">Meublé</span>
          </div>
        </div>

        {bien.description && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
            <p className="text-gray-600 whitespace-pre-line">{bien.description}</p>
          </div>
        )}

        <div className="bg-emerald-50 rounded-xl p-6">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-bold text-emerald-600">{bien.prix_loyer} DT</span>
              <span className="text-gray-500">/mois</span>
            </div>
            <div className="text-right text-sm text-gray-500">
              <div>Charges: {bien.charges} DT</div>
              <div>Caution: {bien.caution} DT</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
