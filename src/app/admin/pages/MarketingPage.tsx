import { Megaphone, Mail, Share2 } from 'lucide-react';

export default function MarketingPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Outils Marketing</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer">
          <div className="bg-blue-100 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center text-blue-600 mb-3 sm:mb-4">
            <Share2 size={20} className="sm:w-6 sm:h-6" />
          </div>
          <h3 className="font-bold text-base sm:text-lg mb-2">Réseaux Sociaux</h3>
          <p className="text-gray-500 text-xs sm:text-sm">Gérez vos publications sur Facebook et Instagram.</p>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer">
          <div className="bg-emerald-100 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center text-emerald-600 mb-3 sm:mb-4">
            <Mail size={20} className="sm:w-6 sm:h-6" />
          </div>
          <h3 className="font-bold text-base sm:text-lg mb-2">Campagnes Email</h3>
          <p className="text-gray-500 text-xs sm:text-sm">Envoyez des newsletters à vos locataires.</p>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer">
          <div className="bg-purple-100 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center text-purple-600 mb-3 sm:mb-4">
            <Megaphone size={20} className="sm:w-6 sm:h-6" />
          </div>
          <h3 className="font-bold text-base sm:text-lg mb-2">Promotions</h3>
          <p className="text-gray-500 text-xs sm:text-sm">Créez des offres spéciales pour vos biens.</p>
        </div>
      </div>
    </div>
  );
}