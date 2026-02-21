import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Phone, Mail, FileText, Archive, CalendarDays, Eye, Download, X } from 'lucide-react';
import { Contrat, Locataire } from '../types';
import { toast } from 'sonner';
import { API_BASE } from '../../config';

const API_URL = API_BASE;

type ContratArchive = Contrat & {
  bien_titre?: string;
  locataire_nom?: string;
  depot_garantie?: number;
};

export default function LocatairesPage() {
  const [locataires, setLocataires] = useState<Locataire[]>([]);
  const [contrats, setContrats] = useState<ContratArchive[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocataire, setSelectedLocataire] = useState<Locataire | null>(null);
  const [previewContrat, setPreviewContrat] = useState<ContratArchive | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      const [locatairesResult, contratsResult] = await Promise.allSettled([
        fetch(`${API_URL}/locataires`),
        fetch(`${API_URL}/contrats`),
      ]);

      let hasAnyData = false;
      const errors: string[] = [];

      if (locatairesResult.status === 'fulfilled' && locatairesResult.value.ok) {
        const locatairesData = await locatairesResult.value.json();
        setLocataires(Array.isArray(locatairesData) ? locatairesData : []);
        hasAnyData = true;
      } else {
        setLocataires([]);
        errors.push('locataires');
      }

      if (contratsResult.status === 'fulfilled' && contratsResult.value.ok) {
        const contratsData = await contratsResult.value.json();
        setContrats(Array.isArray(contratsData) ? contratsData : []);
        hasAnyData = true;
      } else {
        setContrats([]);
        errors.push('contrats');
      }

      if (errors.length > 0) {
        const message = `Chargement partiel: ${errors.join(', ')}`;
        setError(hasAnyData ? message : 'Impossible de charger les données');
        toast.error(message);
      }

      setIsLoading(false);
    };

    fetchData();
  }, []);

  const filtered = locataires.filter(l =>
    l.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const archiveContrats = useMemo(() => {
    if (!selectedLocataire) return [];
    return contrats.filter((contrat) => contrat.locataire_id === selectedLocataire.id);
  }, [selectedLocataire, contrats]);

  const closeArchive = () => {
    setSelectedLocataire(null);
    setPreviewContrat(null);
  };

  const handleDownloadPdf = (contrat: ContratArchive) => {
    if (!contrat.url_pdf) return;
    const normalizedUrl = contrat.url_pdf.startsWith('http')
      ? contrat.url_pdf
      : `${window.location.origin}${contrat.url_pdf}`;
    const link = document.createElement('a');
    link.href = normalizedUrl;
    link.download = `contrat-${contrat.id}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Locataires</h1>
        <button className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 w-full sm:w-auto justify-center">
          <Plus size={18} className="sm:w-5 sm:h-5" /> Nouveau
        </button>
      </div>

      <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="relative mb-4 sm:mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Rechercher un locataire..." 
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm sm:text-base"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-medium text-gray-500 text-sm">Nom</th>
                <th className="p-4 font-medium text-gray-500 text-sm">Contact</th>
                <th className="p-4 font-medium text-gray-500 text-sm">Fiabilité</th>
                <th className="p-4 font-medium text-gray-500 text-sm">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(locataire => (
                <tr key={locataire.id} className="hover:bg-gray-50">
                  <td className="p-4">
                    <div className="font-medium text-gray-900">{locataire.nom}</div>
                    <div className="text-sm text-gray-500">CIN: {locataire.cin}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone size={14} /> {locataire.telephone}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                      <Mail size={14} /> {locataire.email}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <span className={`font-bold ${locataire.score_fiabilite >= 8 ? 'text-green-600' : locataire.score_fiabilite >= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {locataire.score_fiabilite}/10
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <button onClick={() => setSelectedLocataire(locataire)} className="text-emerald-600 hover:text-emerald-800 text-sm font-medium">Voir dossier</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {filtered.map(locataire => (
            <div key={locataire.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-medium text-gray-900">{locataire.nom}</div>
                  <div className="text-xs text-gray-500 mt-0.5">CIN: {locataire.cin}</div>
                </div>
                <span className={`font-bold text-sm ${locataire.score_fiabilite >= 8 ? 'text-green-600' : locataire.score_fiabilite >= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {locataire.score_fiabilite}/10
                </span>
              </div>
              <div className="space-y-2 text-sm text-gray-600 mb-3">
                <div className="flex items-center gap-2">
                  <Phone size={14} className="flex-shrink-0" /> 
                  <span className="truncate">{locataire.telephone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="flex-shrink-0" /> 
                  <span className="truncate">{locataire.email}</span>
                </div>
              </div>
              <button onClick={() => setSelectedLocataire(locataire)} className="text-emerald-600 hover:text-emerald-800 text-sm font-medium w-full text-center py-2 border-t border-gray-100">
                Voir dossier
              </button>
            </div>
          ))}
        </div>
      </div>

      {selectedLocataire && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-xl shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2"><Archive className="h-5 w-5 text-emerald-600" />Archive des relations</h2>
                <p className="text-sm text-gray-500">{selectedLocataire.nom} • {archiveContrats.length} contrat(s)</p>
              </div>
              <button onClick={closeArchive} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto">
              {archiveContrats.length === 0 ? (
                <div className="text-center py-14 text-gray-500">
                  <FileText className="mx-auto h-8 w-8 mb-3 text-gray-400" />
                  Aucun contrat archivé pour ce locataire.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {archiveContrats.map((contrat) => {
                    return (
                      <div key={contrat.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <h3 className="font-semibold text-gray-900 line-clamp-1">{contrat.bien_titre || `Bien #${contrat.bien_id}`}</h3>
                            <p className="text-xs text-gray-500">Contrat #{contrat.id}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${contrat.statut === 'actif' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'}`}>
                            {contrat.statut}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-sm text-gray-600 mb-4">
                          <div className="flex items-center gap-2"><CalendarDays size={14} className="text-gray-400" /><span>Du {new Date(contrat.date_debut).toLocaleDateString()} au {new Date(contrat.date_fin).toLocaleDateString()}</span></div>
                          <div className="flex items-center gap-2"><FileText size={14} className="text-gray-400" /><span>{contrat.url_pdf ? 'PDF disponible' : 'PDF non disponible'}</span></div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setPreviewContrat(contrat)} disabled={!contrat.url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                            <Eye size={16} /> Visualiser
                          </button>
                          <button onClick={() => handleDownloadPdf(contrat)} disabled={!contrat.url_pdf} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50">
                            <Download size={16} /> Télécharger
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewContrat?.url_pdf && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white w-full max-w-6xl h-[92vh] rounded-xl shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Visualisation du contrat #{previewContrat.id}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => handleDownloadPdf(previewContrat)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50"><Download size={16} /> Télécharger</button>
                <button onClick={() => setPreviewContrat(null)} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
              </div>
            </div>
            <iframe
              src={previewContrat.url_pdf.startsWith('http') ? previewContrat.url_pdf : `${window.location.origin}${previewContrat.url_pdf}`}
              title={`Contrat ${previewContrat.id}`}
              className="w-full h-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
