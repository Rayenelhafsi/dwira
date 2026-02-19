import { mockContrats, mockBiens, mockLocataires } from '../data/mockData';
import { FileText, Calendar, AlertCircle } from 'lucide-react';

export default function ContratsPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestion des Contrats</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {mockContrats.map(contrat => {
          const bien = mockBiens.find(b => b.id === contrat.bien_id);
          const locataire = mockLocataires.find(l => l.id === contrat.locataire_id);
          
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
              
              <h3 className="font-bold text-base sm:text-lg text-gray-900 mb-1 truncate">{bien?.titre || 'Bien Inconnu'}</h3>
              <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 truncate">Locataire: {locataire?.nom || 'Inconnu'}</p>
              
              <div className="space-y-2 text-xs sm:text-sm text-gray-600 border-t pt-3 sm:pt-4">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-gray-400 flex-shrink-0 sm:w-4 sm:h-4" />
                  <span className="truncate">Du {new Date(contrat.date_debut).toLocaleDateString()} au {new Date(contrat.date_fin).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-gray-400 flex-shrink-0 sm:w-4 sm:h-4" />
                  <span>Caution: {contrat.depot_garantie} DT</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}