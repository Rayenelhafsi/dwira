import { mockMaintenances, mockBiens } from '../data/mockData';
import { Wrench, CheckCircle, AlertTriangle } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Maintenance et Réparations</h1>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="p-4">Bien</th>
                <th className="p-4">Description</th>
                <th className="p-4">Coût</th>
                <th className="p-4">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mockMaintenances.map((maintenance) => {
                const bien = mockBiens.find(b => b.id === maintenance.bien_id);
                
                return (
                  <tr key={maintenance.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-900">{bien?.titre || 'Bien Inconnu'}</td>
                    <td className="p-4 text-gray-600">{maintenance.description}</td>
                    <td className="p-4 font-bold text-red-500">{maintenance.cout} DT</td>
                    <td className="p-4">
                      {maintenance.statut === 'termine' ? (
                        <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-bold w-fit">
                          <CheckCircle size={12} /> Terminé
                        </span>
                      ) : maintenance.statut === 'en_cours' ? (
                        <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs font-bold w-fit">
                          <Wrench size={12} /> En cours
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold w-fit">
                          <AlertTriangle size={12} /> Annulé
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-gray-100">
          {mockMaintenances.map((maintenance) => {
            const bien = mockBiens.find(b => b.id === maintenance.bien_id);
            
            return (
              <div key={maintenance.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-medium text-gray-900 flex-1 min-w-0">
                    <div className="truncate">{bien?.titre || 'Bien Inconnu'}</div>
                  </div>
                  <div className="font-bold text-red-500 ml-2">{maintenance.cout} DT</div>
                </div>
                <p className="text-sm text-gray-600 mb-3">{maintenance.description}</p>
                <div className="flex justify-end">
                  {maintenance.statut === 'termine' ? (
                    <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-bold">
                      <CheckCircle size={12} /> Terminé
                    </span>
                  ) : maintenance.statut === 'en_cours' ? (
                    <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs font-bold">
                      <Wrench size={12} /> En cours
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold">
                      <AlertTriangle size={12} /> Annulé
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}