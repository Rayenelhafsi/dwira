import { useState } from 'react';
import { mockUsers } from '../data/mockData';
import { Search, UserPlus, Mail, Shield, User } from 'lucide-react';

export default function UtilisateursPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = mockUsers.filter(u => 
    u.nom.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Utilisateurs</h1>
        <button className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 w-full sm:w-auto justify-center">
          <UserPlus size={18} className="sm:w-5 sm:h-5" /> Inviter
        </button>
      </div>

      <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="relative mb-4 sm:mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Rechercher un utilisateur..." 
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm sm:text-base"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:gap-4">
          {filtered.map(user => (
            <div key={user.id} className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-sm sm:text-base flex-shrink-0">
                  {user.nom.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate">{user.nom}</h3>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 truncate">
                    <Mail size={12} className="sm:w-3.5 sm:h-3.5 flex-shrink-0" /> 
                    <span className="truncate">{user.email}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 ml-2">
                <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold uppercase ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                  {user.role}
                </span>
                <button className="text-gray-400 hover:text-gray-600 hidden sm:block">
                  <Shield size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}