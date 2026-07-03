import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';
import logo from '../../../logo dwira.jpg';
import { loginAdmin } from '../services/auth';
import { useAuth } from '../context/AuthContext';

export default function InternalAdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user, login, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (user.role === 'admin') {
      navigate('/admin', { replace: true });
      return;
    }
    navigate('/', { replace: true });
  }, [authLoading, navigate, user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const adminUser = await loginAdmin(email, password);
      login({
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        avatar: adminUser.avatar || undefined,
        profileCompleted: true,
        role: 'admin',
        adminType: adminUser.adminType || 'subadmin',
      });
      toast.success('Connexion administrateur reussie');
      navigate('/admin', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Connexion administrateur echouee');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link to="/" className="flex justify-center mb-6">
          <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-emerald-100 bg-white shadow-sm">
            <img src={logo} alt="Dwira Immobilier" className="h-full w-full rounded-full object-cover" />
          </span>
        </Link>
        <h1 className="text-center text-3xl font-extrabold text-gray-900">Acces administrateur</h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Page interne reservee a l'administration.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700">
                Adresse email admin
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                  placeholder="admin@exemple.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700">
                Mot de passe
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                  placeholder="********"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Connexion en cours...' : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
