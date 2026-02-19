import { mockPaiements, mockContrats, mockBiens } from '../data/mockData';
import { CreditCard, TrendingUp, CheckCircle, AlertCircle } from 'lucide-react';

export default function PaiementsPage() {
  const totalReceived = mockPaiements.filter(p => p.statut === 'paye').reduce((acc, p) => acc + p.montant, 0);
  const totalPending = mockPaiements.filter(p => p.statut === 'en_attente').reduce((acc, p) => acc + p.montant, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Suivi des Paiements</h1>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
          <div className="bg-emerald-50 text-emerald-800 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium text-center">
            Reçu: <span className="font-bold">{totalReceived} DT</span>
          </div>
          <div className="bg-amber-50 text-amber-800 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium text-center">
            En attente: <span className="font-bold">{totalPending} DT</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="p-4">Bien</th>
                <th className="p-4">Montant</th>
                <th className="p-4">Date</th>
                <th className="p-4">Méthode</th>
                <th className="p-4">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mockPaiements.map((paiement) => {
                const contrat = mockContrats.find(c => c.id === paiement.contrat_id);
                const bien = mockBiens.find(b => b.id === contrat?.bien_id);
                
                return (
                  <tr key={paiement.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-900">{bien?.titre || 'Bien Inconnu'}</td>
                    <td className="p-4 font-bold text-emerald-600">{paiement.montant} DT</td>
                    <td className="p-4 text-gray-500 text-sm">{new Date(paiement.date_paiement).toLocaleDateString()}</td>
                    <td className="p-4 text-gray-500 text-sm capitalize">{paiement.methode}</td>
                    <td className="p-4">
                      {paiement.statut === 'paye' ? (
                        <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-bold w-fit">
                          <CheckCircle size={12} /> Payé
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold w-fit">
                          <AlertCircle size={12} /> En attente
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
          {mockPaiements.map((paiement) => {
            const contrat = mockContrats.find(c => c.id === paiement.contrat_id);
            const bien = mockBiens.find(b => b.id === contrat?.bien_id);
            
            return (
              <div key={paiement.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{bien?.titre || 'Bien Inconnu'}</div>
                    <div className="text-xs text-gray-500 mt-1">{new Date(paiement.date_paiement).toLocaleDateString()}</div>
                  </div>
                  <div className="font-bold text-emerald-600 ml-2">{paiement.montant} DT</div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 capitalize">{paiement.methode}</span>
                  {paiement.statut === 'paye' ? (
                    <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-bold">
                      <CheckCircle size={12} /> Payé
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold">
                      <AlertCircle size={12} /> En attente
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