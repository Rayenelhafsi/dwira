import { useState } from 'react';
import { mockLocataires } from '../data/mockData';
import { Search, Plus, Phone, Mail, FileText } from 'lucide-react';

export default function LocatairesPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = mockLocataires.filter(l => 
    l.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                    <button className="text-emerald-600 hover:text-emerald-800 text-sm font-medium">Voir dossier</button>
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
              <button className="text-emerald-600 hover:text-emerald-800 text-sm font-medium w-full text-center py-2 border-t border-gray-100">
                Voir dossier
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}