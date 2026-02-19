import { BarChart, PieChart, Activity } from 'lucide-react';

export default function StatistiquesPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Statistiques et Rapports</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs sm:text-sm text-gray-500 font-medium">Revenus Mensuels</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-emerald-600">12,450 DT</h2>
          </div>
          <div className="bg-emerald-100 p-2 sm:p-3 rounded-full text-emerald-600">
            <BarChart size={20} className="sm:w-6 sm:h-6" />
          </div>
        </div>
        
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs sm:text-sm text-gray-500 font-medium">Taux d'Occupation</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-blue-600">85%</h2>
          </div>
          <div className="bg-blue-100 p-2 sm:p-3 rounded-full text-blue-600">
            <PieChart size={20} className="sm:w-6 sm:h-6" />
          </div>
        </div>
        
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs sm:text-sm text-gray-500 font-medium">Croissance Annuelle</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-purple-600">+15%</h2>
          </div>
          <div className="bg-purple-100 p-2 sm:p-3 rounded-full text-purple-600">
            <Activity size={20} className="sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 sm:p-8 rounded-lg shadow-sm border border-gray-100 text-center">
        <p className="text-sm sm:text-base text-gray-500">Les graphiques détaillés seront bientôt disponibles.</p>
      </div>
    </div>
  );
}