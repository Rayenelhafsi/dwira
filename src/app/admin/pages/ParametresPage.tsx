import { Settings, Lock, Bell, User, Database } from 'lucide-react';

export default function ParametresPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Paramètres</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer">
          <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="bg-gray-100 p-2 sm:p-3 rounded-full text-gray-600">
              <User size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-base sm:text-lg text-gray-900">Profil</h3>
              <p className="text-xs sm:text-sm text-gray-500 truncate">Gérez vos informations personnelles</p>
            </div>
          </div>
          <button className="text-emerald-600 font-medium text-xs sm:text-sm hover:underline">Modifier</button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer">
          <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="bg-gray-100 p-2 sm:p-3 rounded-full text-gray-600">
              <Lock size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-base sm:text-lg text-gray-900">Sécurité</h3>
              <p className="text-xs sm:text-sm text-gray-500 truncate">Changez votre mot de passe</p>
            </div>
          </div>
          <button className="text-emerald-600 font-medium text-xs sm:text-sm hover:underline">Configurer</button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer">
          <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="bg-gray-100 p-2 sm:p-3 rounded-full text-gray-600">
              <Bell size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-base sm:text-lg text-gray-900">Notifications</h3>
              <p className="text-xs sm:text-sm text-gray-500 truncate">Gérez vos préférences d'alerte</p>
            </div>
          </div>
          <button className="text-emerald-600 font-medium text-xs sm:text-sm hover:underline">Gérer</button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer">
          <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="bg-gray-100 p-2 sm:p-3 rounded-full text-gray-600">
              <Database size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-base sm:text-lg text-gray-900">Données</h3>
              <p className="text-xs sm:text-sm text-gray-500 truncate">Exportez vos données ou sauvegardez</p>
            </div>
          </div>
          <button className="text-emerald-600 font-medium text-xs sm:text-sm hover:underline">Accéder</button>
        </div>
      </div>
    </div>
  );
}