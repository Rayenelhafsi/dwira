import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, Facebook, Globe, User, FileText, Upload, Phone, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import logo from '../../assets/c9952e139aedea0af19c1652a89e92cb4378f1ac.png';
import { completeSocialProfile, getAuthProviders, getSocialSession, loginAdmin, loginWithPasskey, registerWithPasskey, startSocialLogin, AuthUser } from '../services/auth';
import { fetchWithApiFallback } from '../utils/api';
import { clearAuthReturnTo, readAuthReturnTo, readPendingReservationDraft, saveAuthReturnTo } from '../utils/pendingReservation';

function normalizeReturnToPath(value: string | null | undefined) {
  const next = String(value || '').trim();
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  if (!next.startsWith('/reservation/confirmation/')) return null;
  return next;
}

function splitHumanName(fullName?: string | null) {
  const normalized = String(fullName || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return { firstName: '', lastName: '' };
  const parts = normalized.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1).join(''),
  };
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const [isUploadingCin, setIsUploadingCin] = useState(false);
  const [isProcessingSocialToken, setIsProcessingSocialToken] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isPasskeyRegisterLoading, setIsPasskeyRegisterLoading] = useState(false);
  const [providers, setProviders] = useState({ google: false, facebook: false, phoneOtp: false, emailOtp: false, passkey: true });
  const [passkeyRegisterEmail, setPasskeyRegisterEmail] = useState('');
  const [passkeyRegisterName, setPasskeyRegisterName] = useState('');
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    clientType: '',
    telephone: '',
    cin: '',
    cinImageUrl: '',
  });
  const { user, login, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const loginUser = (authUser: AuthUser) => {
    login({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      firstName: authUser.firstName || undefined,
      lastName: authUser.lastName || undefined,
      avatar: authUser.avatar || undefined,
      clientType: authUser.clientType || undefined,
      telephone: authUser.telephone || undefined,
      cin: authUser.cin || undefined,
      cinImageUrl: authUser.cinImageUrl || undefined,
      profileCompleted: authUser.profileCompleted,
      role: 'user',
    });
  };

  const redirectToPendingReservation = () => {
    const params = new URLSearchParams(window.location.search);
    const returnToFromUrl = normalizeReturnToPath(params.get('returnTo') || params.get('return_to'));
    const returnToFromSession = normalizeReturnToPath(readAuthReturnTo());
    const returnTo = returnToFromUrl || returnToFromSession;
    if (returnTo) {
      clearAuthReturnTo();
      window.location.replace(returnTo);
      return true;
    }
    const pendingDraft = readPendingReservationDraft();
    if (!pendingDraft || typeof pendingDraft.propertySlug !== 'string') return false;
    window.location.replace(`/reservation/confirmation/${encodeURIComponent(pendingDraft.propertySlug)}`);
    return true;
  };

  const redirectToTargetOrClosePopup = (targetPath: string) => {
    const target = normalizeReturnToPath(targetPath);
    if (!target) return false;
    clearAuthReturnTo();
    const hasOpener = typeof window !== 'undefined' && !!window.opener && !window.opener.closed;
    if (hasOpener) {
      try {
        window.opener.postMessage({ type: 'DWIRA_AUTH_SUCCESS', returnTo: target }, '*');
        window.close();
        return true;
      } catch {
        // If opener is in an invalid browser error context, fallback to local navigation.
      }
    }
    window.location.replace(target);
    return true;
  };

  useEffect(() => {
    const loadProviders = async () => {
      const availableProviders = await getAuthProviders();
      setProviders(availableProviders);
    };
    loadProviders();
  }, []);

  useEffect(() => {
    if (authLoading || !user || isProcessingSocialToken) return;
    if (user.role === 'user' && !user.profileCompleted) {
      const fallbackNames = splitHumanName(user.name);
      setProfileForm({
        firstName: user.firstName || fallbackNames.firstName,
        lastName: user.lastName || fallbackNames.lastName,
        email: user.email || '',
        clientType: user.clientType || '',
        telephone: user.telephone || '',
        cin: user.cin || '',
        cinImageUrl: user.cinImageUrl || '',
      });
      return;
    }
    if (user.role === 'user' && redirectToPendingReservation()) return;
    navigate(user.role === 'admin' ? '/admin' : '/', { replace: true });
  }, [user, authLoading, isProcessingSocialToken, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const socialToken = params.get('social_token');
    const oauthError = params.get('oauth_error');
    const returnTo = normalizeReturnToPath(params.get('returnTo') || params.get('return_to'));

    if (oauthError) {
      const messages: Record<string, string> = {
        google_config_missing: 'Google OAuth non configure (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
        facebook_config_missing: 'Facebook OAuth non configure (FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET).',
        google_code_missing: 'Code Google manquant.',
        google_token_exchange_failed: "Echec d'echange du token Google.",
        google_profile_fetch_failed: 'Impossible de recuperer le profil Google.',
        facebook_code_missing: 'Code Facebook manquant.',
        facebook_token_exchange_failed: "Echec d'echange du token Facebook.",
        facebook_profile_fetch_failed: 'Impossible de recuperer le profil Facebook.',
        facebook_access_token_missing: "Token d'acces Facebook manquant.",
        facebook_email_missing: "Facebook n'a pas fourni d'email exploitable.",
        facebook_callback_failed: 'Erreur interne pendant le callback Facebook.',
      };
      toast.error(messages[oauthError] || 'Echec de la connexion sociale. Verifiez la configuration OAuth.');
      navigate('/login', { replace: true });
      return;
    }

    if (!socialToken) return;
    setIsProcessingSocialToken(true);

    if (returnTo) {
      saveAuthReturnTo(returnTo);
    }
    // Remove social_token immediately to avoid duplicate processing, but keep return destination.
    window.history.replaceState({}, document.title, returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login');

    const restoreSocialSession = async () => {
      try {
        const socialUser = await getSocialSession(socialToken);
        const targetFromDraft = (() => {
          const pendingDraft = readPendingReservationDraft();
          if (!pendingDraft || typeof pendingDraft.propertySlug !== 'string') return null;
          return `/reservation/confirmation/${encodeURIComponent(pendingDraft.propertySlug)}`;
        })();
        const finalReturnTo = returnTo || targetFromDraft;
        loginUser(socialUser);
        if (socialUser.profileCompleted) {
          toast.success('Connexion reussie');
          if (finalReturnTo) {
            if (redirectToTargetOrClosePopup(finalReturnTo)) return;
            return;
          }
          navigate('/', { replace: true });
        } else {
          const fallbackNames = splitHumanName(socialUser.name);
          setProfileForm({
            firstName: socialUser.firstName || fallbackNames.firstName,
            lastName: socialUser.lastName || fallbackNames.lastName,
            email: socialUser.email || '',
            clientType: socialUser.clientType || '',
            telephone: socialUser.telephone || '',
            cin: socialUser.cin || '',
            cinImageUrl: socialUser.cinImageUrl || '',
          });
          toast.info('Completez d abord votre profil client');
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Session sociale expiree');
        navigate('/login', { replace: true });
      } finally {
        setIsProcessingSocialToken(false);
      }
    };

    restoreSocialSession();
  }, [login, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      });
      toast.success('Connexion administrateur reussie');
      navigate('/admin', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Connexion administrateur echouee');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = (provider: 'google' | 'facebook') => {
    if (provider === 'google' && !providers.google) {
      toast.error('Google login indisponible: OAuth Google non configure sur le serveur.');
      return;
    }
    if (provider === 'facebook' && !providers.facebook) {
      toast.error('Facebook login indisponible: OAuth Facebook non configure sur le serveur.');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const returnTo = normalizeReturnToPath(params.get('returnTo') || params.get('return_to')) || undefined;
    startSocialLogin(provider, returnTo);
  };

  const handlePasskeyLogin = async () => {
    if (!providers.passkey) {
      toast.error('Passkey indisponible sur ce serveur');
      return;
    }
    if (!window.PublicKeyCredential || !navigator.credentials) {
      toast.error('Passkey non supporte sur ce navigateur/appareil');
      return;
    }
    setIsPasskeyLoading(true);
    try {
      const passkeyUser = await loginWithPasskey();
      loginUser(passkeyUser);
      if (!passkeyUser.profileCompleted) {
        const fallbackNames = splitHumanName(passkeyUser.name);
        setProfileForm((prev) => ({
          ...prev,
          firstName: passkeyUser.firstName || fallbackNames.firstName,
          lastName: passkeyUser.lastName || fallbackNames.lastName,
          email: passkeyUser.email || prev.email,
          clientType: passkeyUser.clientType || prev.clientType || '',
          telephone: passkeyUser.telephone || prev.telephone,
          cin: passkeyUser.cin || prev.cin,
          cinImageUrl: passkeyUser.cinImageUrl || prev.cinImageUrl,
        }));
        toast.info('Completez votre identite legale pour finaliser votre compte.');
        return;
      }
      toast.success('Connexion Passkey reussie');
      if (redirectToPendingReservation()) return;
      navigate(passkeyUser.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Connexion Passkey echouee');
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const handlePasskeyRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!window.PublicKeyCredential || !navigator.credentials) {
      toast.error('Passkey non supporte sur ce navigateur/appareil');
      return;
    }
    if (!passkeyRegisterEmail.trim()) {
      toast.error('Email requis pour creer un compte Passkey');
      return;
    }
    setIsPasskeyRegisterLoading(true);
    try {
      const passkeyUser = await registerWithPasskey(passkeyRegisterEmail.trim(), passkeyRegisterName.trim());
      loginUser(passkeyUser);
      if (!passkeyUser.profileCompleted) {
        const fallbackNames = splitHumanName(passkeyUser.name);
        setProfileForm((prev) => ({
          ...prev,
          firstName: passkeyUser.firstName || fallbackNames.firstName,
          lastName: passkeyUser.lastName || fallbackNames.lastName,
          email: passkeyUser.email || prev.email,
          clientType: passkeyUser.clientType || prev.clientType || '',
          telephone: passkeyUser.telephone || prev.telephone,
          cin: passkeyUser.cin || prev.cin,
          cinImageUrl: passkeyUser.cinImageUrl || prev.cinImageUrl,
        }));
        toast.success('Passkey creee. Completez maintenant votre identite legale.');
        setPasskeyRegisterEmail('');
        setPasskeyRegisterName('');
        return;
      }
      toast.success('Compte Passkey cree et connecte');
      setPasskeyRegisterEmail('');
      setPasskeyRegisterName('');
      if (redirectToPendingReservation()) return;
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Creation Passkey echouee');
    } finally {
      setIsPasskeyRegisterLoading(false);
    }
  };

  const handleCinImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploadingCin(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await fetchWithApiFallback('/upload', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Upload de la carte d'identite echoue");
      }
      const imageUrl = String(data?.url || data?.imageUrl || '');
      setProfileForm((prev) => ({ ...prev, cinImageUrl: imageUrl }));
      toast.success("Image de la carte d'identite ajoutee");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload de la carte d'identite echoue");
    } finally {
      setIsUploadingCin(false);
      event.target.value = '';
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error('Utilisateur introuvable');
      return;
    }
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim() || !profileForm.telephone.trim()) {
      toast.error('Nom, prenom et numero de telephone sont obligatoires');
      return;
    }
    if (!['proprietaire', 'locataire', 'acheteur'].includes(profileForm.clientType)) {
      toast.error('Type client obligatoire');
      return;
    }

    setIsCompletingProfile(true);
    try {
      const savedUser = await completeSocialProfile({
        id: user.id,
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        name: `${profileForm.firstName.trim()} ${profileForm.lastName.trim()}`.trim(),
        email: profileForm.email.trim() || undefined,
        clientType: profileForm.clientType as 'proprietaire' | 'locataire' | 'acheteur',
        telephone: profileForm.telephone.trim(),
        cin: profileForm.cin.trim(),
        cinImageUrl: profileForm.cinImageUrl.trim(),
        avatar: user.avatar || null,
      });
      loginUser(savedUser);
      toast.success('Profil client enregistre');
      const targetFromDraft = (() => {
        const pendingDraft = readPendingReservationDraft();
        if (!pendingDraft || typeof pendingDraft.propertySlug !== 'string') return null;
        return `/reservation/confirmation/${encodeURIComponent(pendingDraft.propertySlug)}`;
      })();
      if (targetFromDraft && redirectToTargetOrClosePopup(targetFromDraft)) return;
      if (!redirectToPendingReservation()) {
        navigate('/', { replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de sauvegarder le profil client');
    } finally {
      setIsCompletingProfile(false);
    }
  };

  if (user && user.role === 'user' && !user.profileCompleted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
          <Link to="/" className="flex justify-center mb-6">
            <img src={logo} alt="Dwira Immobilier" className="h-20 w-auto" />
          </Link>
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
            <h2 className="text-2xl font-extrabold text-gray-900">Completez votre profil client</h2>
            <p className="mt-2 text-sm text-gray-600">
              Confirmez les informations recuperees depuis votre login social et ajoutez les champs manquants avant de continuer.
            </p>

            <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleCompleteProfile}>
              <div>
                <label htmlFor="client-first-name" className="block text-sm font-medium text-gray-700">Prenom *</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="client-first-name"
                    value={profileForm.firstName}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                    placeholder="Prenom"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="client-last-name" className="block text-sm font-medium text-gray-700">Nom *</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="client-last-name"
                    value={profileForm.lastName}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                    placeholder="Nom"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="client-email" className="block text-sm font-medium text-gray-700">Email</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="client-email"
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                    placeholder="Optionnel"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="client-type" className="block text-sm font-medium text-gray-700">Type client *</label>
                <select
                  id="client-type"
                  value={profileForm.clientType}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, clientType: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                  required
                >
                  <option value="">Choisir...</option>
                  <option value="locataire">Locataire</option>
                  <option value="acheteur">Acheteur</option>
                  <option value="proprietaire">Proprietaire</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="client-phone" className="block text-sm font-medium text-gray-700">Numero de telephone *</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="client-phone"
                    value={profileForm.telephone}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, telephone: e.target.value }))}
                    className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                    placeholder="+216 ..."
                  />
                </div>
              </div>

              <div>
                <label htmlFor="client-cin" className="block text-sm font-medium text-gray-700">Carte d'identite</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="client-cin"
                    value={profileForm.cin}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, cin: e.target.value }))}
                    className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                    placeholder="Optionnel"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Image carte d'identite</label>
                <label className="mt-1 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Upload className="h-4 w-4" />
                  {isUploadingCin ? 'Upload en cours...' : "Uploader l'image (optionnel)"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleCinImageUpload} />
                </label>
                {profileForm.cinImageUrl ? (
                  <img src={profileForm.cinImageUrl} alt="Carte d'identite" className="mt-3 h-32 w-full rounded-md border border-gray-200 object-cover" />
                ) : null}
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={isCompletingProfile || isUploadingCin}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCompletingProfile ? 'Enregistrement...' : 'Valider et continuer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link to="/" className="flex justify-center mb-6">
          <img src={logo} alt="Dwira Immobilier" className="h-20 w-auto" />
        </Link>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Connexion administrateur
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Les utilisateurs normaux se connectent avec Google ou Facebook ci-dessous.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Adresse email admin
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  id="email"
                  name="email"
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
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Mot de passe
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  id="password"
                  name="password"
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

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Connexion en cours...' : 'Se connecter (Admin)'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Connexion utilisateur normal</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div>
                <button
                  type="button"
                  disabled={!providers.google}
                  onClick={() => handleSocialLogin('google')}
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Globe className="h-5 w-5 text-blue-500 mr-2" />
                  Google
                </button>
              </div>

              <div>
                <button
                  type="button"
                  disabled={!providers.facebook}
                  onClick={() => handleSocialLogin('facebook')}
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Facebook className="h-5 w-5 text-blue-800 mr-2" />
                  Facebook
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handlePasskeyLogin()}
              disabled={isPasskeyLoading || !providers.passkey}
              className="mt-3 w-full inline-flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <KeyRound className="h-5 w-5 text-emerald-700 mr-2" />
              {isPasskeyLoading ? 'Connexion Passkey...' : 'Continuer avec Passkey'}
            </button>
            <form className="mt-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3" onSubmit={handlePasskeyRegister}>
              <p className="text-xs font-medium text-gray-700">Creer un compte Passkey</p>
              <input
                type="email"
                value={passkeyRegisterEmail}
                onChange={(e) => setPasskeyRegisterEmail(e.target.value)}
                placeholder="Email client"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={passkeyRegisterName}
                onChange={(e) => setPasskeyRegisterName(e.target.value)}
                placeholder="Nom (optionnel)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={isPasskeyRegisterLoading}
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isPasskeyRegisterLoading ? 'Creation...' : 'Creer avec Passkey'}
              </button>
            </form>
            {(!providers.google || !providers.facebook) && (
              <p className="mt-3 text-xs text-amber-700">
                Certains fournisseurs sociaux sont indisponibles car OAuth n'est pas configure sur le serveur.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
