import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Calendar, AlertCircle, Search, ArrowDownUp, Eye, Download, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '../../config';

const API_URL = API_BASE;

type ContratApi = {
  id: string;
  bien_id: string;
  locataire_id: string;
  date_debut: string;
  date_fin: string;
  montant_recu: number;
  url_pdf?: string;
  statut: 'actif' | 'termine' | 'resilie';
  created_at: string;
  bien_titre?: string;
  locataire_nom?: string;
};

type BienApi = {
  id: string;
  reference?: string;
  proprietaire_nom?: string;
  titre?: string;
};

type LocataireApi = {
  id: string;
  nom: string;
};

type SortOption = 'created_desc' | 'created_asc' | 'start_desc' | 'start_asc';

export default function ContratsPage() {
  const [contrats, setContrats] = useState<ContratApi[]>([]);
  const [biens, setBiens] = useState<BienApi[]>([]);
  const [locataires, setLocataires] = useState<LocataireApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingContratId, setUploadingContratId] = useState<string | null>(null);
  const [creatingContract, setCreatingContract] = useState(false);

  const [searchLocataire, setSearchLocataire] = useState('');
  const [searchProprietaire, setSearchProprietaire] = useState('');
  const [searchReference, setSearchReference] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created_desc');
  const [newContract, setNewContract] = useState({
    bien_id: '',
    locataire_id: '',
    date_debut: '',
    date_fin: '',
    montant_recu: '',
    statut: 'actif' as 'actif' | 'termine' | 'resilie',
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const [contratsResult, biensResult, locatairesResult] = await Promise.allSettled([
      fetch(`${API_URL}/contrats`),
      fetch(`${API_URL}/biens`),
      fetch(`${API_URL}/locataires`),
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
      setBiens(Array.isArray(biensData) ? biensData : []);
      hasAnyData = true;
    } else {
      setBiens([]);
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

  const bienById = useMemo(() => {
    const map = new Map<string, BienApi>();
    for (const bien of biens) map.set(bien.id, bien);
    return map;
  }, [biens]);

  const filteredAndSorted = useMemo(() => {
    const locataireQuery = searchLocataire.trim().toLowerCase();
    const proprietaireQuery = searchProprietaire.trim().toLowerCase();
    const referenceQuery = searchReference.trim().toLowerCase();

    const filtered = contrats.filter((contrat) => {
      const bien = bienById.get(contrat.bien_id);
      const locataireNom = (contrat.locataire_nom || '').toLowerCase();
      const proprietaireNom = (bien?.proprietaire_nom || '').toLowerCase();
      const referenceBien = (bien?.reference || '').toLowerCase();

      const matchesLocataire = !locataireQuery || locataireNom.includes(locataireQuery);
      const matchesProprietaire = !proprietaireQuery || proprietaireNom.includes(proprietaireQuery);
      const matchesReference = !referenceQuery || referenceBien.includes(referenceQuery);

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

      return matchesLocataire && matchesProprietaire && matchesReference && matchesDate;
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
  }, [contrats, bienById, searchLocataire, searchProprietaire, searchReference, filterDate, sortBy]);

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
      if (!updateResponse.ok) throw new Error('Mise a jour contrat impossible');

      await fetchData();
      toast.success('PDF du contrat mis a jour');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erreur upload contrat');
    } finally {
      setUploadingContratId(null);
    }
  };

  const handleCreateContract = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newContract.bien_id || !newContract.locataire_id || !newContract.date_debut || !newContract.date_fin || !newContract.montant_recu) {
      toast.error('Veuillez remplir les champs obligatoires');
      return;
    }
    if (newContract.date_fin < newContract.date_debut) {
      toast.error('La date de fin doit etre apres la date de debut');
      return;
    }

    setCreatingContract(true);
    try {
      const response = await fetch(`${API_URL}/contrats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bien_id: newContract.bien_id,
          locataire_id: newContract.locataire_id,
          date_debut: newContract.date_debut,
          date_fin: newContract.date_fin,
          montant_recu: Number(newContract.montant_recu),
          statut: newContract.statut,
        }),
      });
      if (!response.ok) throw new Error('Creation contrat impossible');
      toast.success('Contrat ajoute');
      setNewContract({ bien_id: '', locataire_id: '', date_debut: '', date_fin: '', montant_recu: '', statut: 'actif' });
      await fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erreur creation contrat');
    } finally {
      setCreatingContract(false);
    }
  };

  const handleDeleteContract = async (contratId: string) => {
    const confirmed = window.confirm('Supprimer ce contrat ?');
    if (!confirmed) return;
    try {
      const response = await fetch(`${API_URL}/contrats/${contratId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Suppression contrat impossible');
      toast.success('Contrat supprime');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erreur suppression contrat');
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
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestion des Contrats</h1>

      <form onSubmit={handleCreateContract} className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Nouveau contrat</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <select
            value={newContract.bien_id}
            onChange={(e) => setNewContract((prev) => ({ ...prev, bien_id: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            required
          >
            <option value="">Selectionner un bien</option>
            {biens.map((bien) => <option key={bien.id} value={bien.id}>{bien.reference || bien.id} - {bien.titre || 'Bien'}</option>)}
          </select>
          <select
            value={newContract.locataire_id}
            onChange={(e) => setNewContract((prev) => ({ ...prev, locataire_id: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            required
          >
            <option value="">Selectionner un locataire</option>
            {locataires.map((locataire) => <option key={locataire.id} value={locataire.id}>{locataire.nom}</option>)}
          </select>
          <input type="date" value={newContract.date_debut} onChange={(e) => setNewContract((prev) => ({ ...prev, date_debut: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" required />
          <input type="date" value={newContract.date_fin} onChange={(e) => setNewContract((prev) => ({ ...prev, date_fin: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" required />
          <input type="number" min="0" step="0.01" placeholder="Montant recu (DT)" value={newContract.montant_recu} onChange={(e) => setNewContract((prev) => ({ ...prev, montant_recu: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" required />
          <div className="flex gap-2">
            <select value={newContract.statut} onChange={(e) => setNewContract((prev) => ({ ...prev, statut: e.target.value as 'actif' | 'termine' | 'resilie' }))} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="actif">actif</option>
              <option value="termine">termine</option>
              <option value="resilie">resilie</option>
            </select>
            <button type="submit" disabled={creatingContract} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">
              {creatingContract ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </div>
      </form>

      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
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
          return (
            <div key={contrat.id} className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3 sm:mb-4">
                <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                  <FileText size={20} className="sm:w-6 sm:h-6" />
                </div>
                <span className={`px-2 py-0.5 sm:py-1 rounded-full text-xs font-bold uppercase ${contrat.statut === 'actif' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {contrat.statut}
                </span>
              </div>

              <h3 className="font-bold text-base sm:text-lg text-gray-900 mb-1 truncate">{contrat.bien_titre || bien?.titre || 'Bien Inconnu'}</h3>
              <p className="text-xs sm:text-sm text-gray-500 mb-1 truncate">Locataire: {contrat.locataire_nom || 'Inconnu'}</p>
              <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 truncate">Proprietaire: {bien?.proprietaire_nom || 'Inconnu'} • Ref: {bien?.reference || '-'}</p>

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
                <button
                  type="button"
                  onClick={() => handlePreviewPdf(contrat.url_pdf)}
                  disabled={!contrat.url_pdf}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Eye size={16} /> Visualiser
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(contrat.id, contrat.url_pdf)}
                  disabled={!contrat.url_pdf}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50"
                >
                  <Download size={16} /> Telecharger
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
                <button
                  type="button"
                  onClick={() => handleDeleteContract(contrat.id)}
                  className="col-span-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50"
                >
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
