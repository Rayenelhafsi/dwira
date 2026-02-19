import { 
  Home, 
  Users, 
  FileText, 
  CreditCard,
  MessageSquare,
  TrendingUp,
  Activity
} from 'lucide-react';
import { mockBiens, mockLocataires, mockContrats, mockPaiements } from '../data/mockData';

export default function DashboardHome() {
  const activeContracts = mockContrats.filter(c => c.statut === 'actif').length;
  const totalRevenue = mockPaiements.reduce((acc, p) => acc + p.montant, 0);
  const occupiedProperties = mockBiens.filter(b => b.statut === 'loue').length;
  const occupancyRate = Math.round((occupiedProperties / mockBiens.length) * 100);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-xs sm:text-sm text-gray-500">Bienvenue sur votre espace d'administration</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Revenus Totaux" 
          value={`${totalRevenue.toLocaleString()} DT`} 
          trend="+12%" 
          trendUp={true} 
          icon={CreditCard} 
          color="emerald" 
        />
        <StatCard 
          title="Taux d'occupation" 
          value={`${occupancyRate}%`} 
          trend="+5%" 
          trendUp={true} 
          icon={Activity} 
          color="blue" 
        />
        <StatCard 
          title="Contrats Actifs" 
          value={activeContracts.toString()} 
          trend="+2" 
          trendUp={true} 
          icon={FileText} 
          color="purple" 
        />
        <StatCard 
          title="Locataires" 
          value={mockLocataires.length.toString()} 
          trend="+1" 
          trendUp={true} 
          icon={Users} 
          color="amber" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm sm:text-base font-bold text-gray-800">Derniers Paiements</h3>
            <button className="text-xs sm:text-sm text-emerald-600 hover:text-emerald-700 font-medium">Voir tout</button>
          </div>
          <div className="space-y-3 sm:space-y-4">
            {mockPaiements.slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 sm:p-3 hover:bg-gray-50 rounded-lg transition-colors border border-gray-50">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="bg-emerald-100 p-1.5 sm:p-2 rounded-full text-emerald-600 flex-shrink-0">
                    <CreditCard size={14} className="sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-medium text-gray-900 truncate">Paiement reçu</p>
                    <p className="text-xs text-gray-500">{new Date(p.date_paiement).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="text-sm sm:text-base font-bold text-emerald-600 flex-shrink-0 ml-2">+{p.montant} DT</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm sm:text-base font-bold text-gray-800">Statut des Biens</h3>
            <button className="text-xs sm:text-sm text-emerald-600 hover:text-emerald-700 font-medium">Gérer</button>
          </div>
          <div className="space-y-3 sm:space-y-4">
            {mockBiens.slice(0, 3).map((b) => (
              <div key={b.id} className="flex items-center justify-between p-2 sm:p-3 hover:bg-gray-50 rounded-lg transition-colors border border-gray-50">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
                     {b.media?.[0]?.url ? (
                        <img src={b.media[0].url} alt={b.titre} className="h-full w-full object-cover" />
                     ) : (
                        <Home className="h-full w-full p-1.5 sm:p-2 text-gray-400" />
                     )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-base font-medium text-gray-900 truncate">{b.titre}</p>
                    <p className="text-xs text-gray-500 truncate">{b.type} • {b.surface}m²</p>
                  </div>
                </div>
                <StatusBadge status={b.statut} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend, trendUp, icon: Icon, color }: any) {
  const colorClasses = {
    emerald: "bg-emerald-100 text-emerald-600",
    blue: "bg-blue-100 text-blue-600",
    purple: "bg-purple-100 text-purple-600",
    amber: "bg-amber-100 text-amber-600",
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-gray-500 text-xs sm:text-sm font-medium">{title}</h3>
        <span className={`p-1.5 sm:p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Icon size={18} className="sm:w-5 sm:h-5" />
        </span>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-xl sm:text-2xl font-bold text-gray-900">{value}</p>
        <span className={`text-xs sm:text-sm font-medium flex items-center ${trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
          {trendUp ? <TrendingUp size={14} className="mr-0.5 sm:mr-1 sm:w-4 sm:h-4" /> : <TrendingUp size={14} className="mr-0.5 sm:mr-1 rotate-180 sm:w-4 sm:h-4" />}
          {trend}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    disponible: "bg-emerald-100 text-emerald-800",
    loue: "bg-blue-100 text-blue-800",
    reserve: "bg-amber-100 text-amber-800",
    maintenance: "bg-red-100 text-red-800",
  };
  
  const labels = {
    disponible: "Disponible",
    loue: "Loué",
    reserve: "Réservé",
    maintenance: "Maintenance",
  };

  return (
    <span className={`px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]} flex-shrink-0 ml-2`}>
      {labels[status as keyof typeof labels] || status}
    </span>
  );
}