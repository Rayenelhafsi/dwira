import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, Facebook, KeyRound, Mail, FileText, Upload, Phone, User } from 'lucide-react';
import { toast } from 'sonner';
import logo from '../../../logo dwira.jpg';
import cinUploadIllustration from '../assets/cin-upload.png';
import { completeSocialProfile, getAuthProviders, getSocialSession, loginWithPasskey, registerWithPasskey, startSocialLogin, AuthUser } from '../services/auth';
import { fetchWithApiFallback } from '../utils/api';
import { clearAuthReturnTo, readAuthReturnTo, readPendingReservationDraft, saveAuthReturnTo } from '../utils/pendingReservation';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.4-.2-2H12Z" />
      <path fill="#34A853" d="M12 22c2.6 0 4.8-.9 6.4-2.5l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-4H3.4v2.5A10 10 0 0 0 12 22Z" />
      <path fill="#4A90E2" d="M6.6 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.5H3.4A10 10 0 0 0 2 12c0 1.6.4 3.1 1.4 4.5L6.6 14Z" />
      <path fill="#FBBC05" d="M12 6c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 3 14.6 2 12 2A10 10 0 0 0 3.4 7.5L6.6 10c.8-2.3 2.9-4 5.4-4Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M16.37 12.09c.03 3.2 2.81 4.27 2.84 4.28-.02.07-.44 1.52-1.45 3-.87 1.28-1.78 2.56-3.2 2.58-1.39.03-1.84-.83-3.43-.83-1.6 0-2.09.8-3.4.85-1.36.05-2.41-1.37-3.29-2.65C2.68 16.82 1.3 12.6 3.15 9.4c.92-1.59 2.57-2.6 4.37-2.62 1.34-.03 2.61.91 3.43.91.81 0 2.35-1.13 3.96-.96.67.03 2.56.27 3.77 2.04-.1.07-2.25 1.31-2.21 3.32ZM14.95 4.92c.73-.88 1.22-2.1 1.09-3.32-1.05.04-2.32.7-3.08 1.58-.68.78-1.28 2.03-1.11 3.22 1.17.09 2.37-.6 3.1-1.48Z" />
    </svg>
  );
}

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
  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const [isUploadingCin, setIsUploadingCin] = useState(false);
  const [isProcessingSocialToken, setIsProcessingSocialToken] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isPasskeyRegisterLoading, setIsPasskeyRegisterLoading] = useState(false);
  const [passkeyMode, setPasskeyMode] = useState<'closed' | 'chooser' | 'login' | 'register'>('closed');
  const [providers, setProviders] = useState({ google: false, facebook: false, apple: false, phoneOtp: false, emailOtp: false, passkey: true });
  const [passkeyRegisterEmail, setPasskeyRegisterEmail] = useState('');
  const [passkeyRegisterName, setPasskeyRegisterName] = useState('');
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    clientType: 'locataire',
    telephone: '',
    address: '',
    cin: '',
    cinImageUrl: '',
  });
  const { user, login, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/', { replace: true });
  };

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
      address: authUser.address || undefined,
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
      navigate(returnTo, { replace: true });
      return true;
    }
    const pendingDraft = readPendingReservationDraft();
    if (!pendingDraft || typeof pendingDraft.propertySlug !== 'string') return false;
    navigate(`/reservation/confirmation/${encodeURIComponent(pendingDraft.propertySlug)}`, { replace: true });
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
    navigate(target, { replace: true });
    return true;
  };

  const notifyOpenerAndClose = (payload: { type: string; returnTo?: string }) => {
    const hasOpener = typeof window !== 'undefined' && !!window.opener && !window.opener.closed;
    if (!hasOpener) return false;
    try {
      window.opener.postMessage(payload, '*');
      window.close();
      return true;
    } catch {
      return false;
    }
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
        clientType: 'locataire',
        telephone: user.telephone || '',
        address: (user as any).address || '',
        cin: user.cin || '',
        cinImageUrl: user.cinImageUrl || '',
      });
      return;
    }
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
        apple_config_missing: 'Apple Sign In non configure (APPLE_CLIENT_ID et secret Apple manquants).',
        apple_access_denied: 'Connexion Apple annulee.',
        apple_code_missing: 'Code Apple manquant.',
        apple_token_exchange_failed: "Echec d'echange du token Apple.",
        apple_id_token_missing: 'Jeton Apple manquant.',
        apple_id_token_invalid: 'Jeton Apple invalide.',
        apple_subject_missing: 'Identifiant Apple introuvable.',
        apple_callback_failed: 'Erreur interne pendant le callback Apple.',
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
        loginUser(socialUser);
        if (socialUser.profileCompleted) {
          toast.success('Connexion reussie');
          navigate('/', { replace: true });
        } else {
          const fallbackNames = splitHumanName(socialUser.name);
          setProfileForm({
            firstName: socialUser.firstName || fallbackNames.firstName,
            lastName: socialUser.lastName || fallbackNames.lastName,
            email: socialUser.email || '',
            clientType: 'locataire',
            telephone: socialUser.telephone || '',
            address: (socialUser as any).address || '',
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

  const handleSocialLogin = (provider: 'google' | 'facebook' | 'apple') => {
    if (provider === 'google' && !providers.google) {
      toast.error('Google login indisponible: OAuth Google non configure sur le serveur.');
      return;
    }
    if (provider === 'facebook' && !providers.facebook) {
      toast.error('Facebook login indisponible: OAuth Facebook non configure sur le serveur.');
      return;
    }
    if (provider === 'apple' && !providers.apple) {
      toast.error('Apple login indisponible: OAuth Apple non configure sur le serveur.');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const returnTo = normalizeReturnToPath(params.get('returnTo') || params.get('return_to')) || undefined;
    startSocialLogin(provider, returnTo);
  };

  const handlePasskeyEntry = () => {
    if (!providers.passkey) {
      toast.error('Passkey indisponible sur ce serveur');
      return;
    }
    if (!window.PublicKeyCredential || !navigator.credentials) {
      toast.error('Passkey non supporte sur ce navigateur/appareil');
      return;
    }
    setPasskeyMode((current) => (current === 'closed' ? 'chooser' : current));
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
      setPasskeyMode('closed');
      if (!passkeyUser.profileCompleted) {
        const fallbackNames = splitHumanName(passkeyUser.name);
        setProfileForm((prev) => ({
          ...prev,
          firstName: passkeyUser.firstName || fallbackNames.firstName,
          lastName: passkeyUser.lastName || fallbackNames.lastName,
          email: passkeyUser.email || prev.email,
          clientType: 'locataire',
          telephone: passkeyUser.telephone || prev.telephone,
          address: (passkeyUser as any).address || prev.address,
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
      setPasskeyMode('closed');
      if (!passkeyUser.profileCompleted) {
        const fallbackNames = splitHumanName(passkeyUser.name);
        setProfileForm((prev) => ({
          ...prev,
          firstName: passkeyUser.firstName || fallbackNames.firstName,
          lastName: passkeyUser.lastName || fallbackNames.lastName,
          email: passkeyUser.email || prev.email,
          clientType: 'locataire',
          telephone: passkeyUser.telephone || prev.telephone,
          address: (passkeyUser as any).address || prev.address,
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
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim() || !profileForm.telephone.trim() || !profileForm.address.trim() || !profileForm.cin.trim()) {
      toast.error('Nom, prenom, numero de telephone, adresse et CIN sont obligatoires');
      return;
    }
    if (!profileForm.cinImageUrl.trim()) {
      toast.error("La photo de la CIN est obligatoire");
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
        clientType: 'locataire',
        telephone: profileForm.telephone.trim(),
        address: profileForm.address.trim(),
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
            <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-emerald-100 bg-white shadow-sm">
              <img src={logo} alt="Dwira Immobilier" className="h-full w-full rounded-full object-cover" />
            </span>
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

              <div className="md:col-span-2">
                <label htmlFor="client-address" className="block text-sm font-medium text-gray-700">Adresse *</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="client-address"
                    value={profileForm.address}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))}
                    className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                    placeholder="Adresse complete"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="client-cin" className="block text-sm font-medium text-gray-700">CIN *</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="client-cin"
                    value={profileForm.cin}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, cin: e.target.value }))}
                    className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                    placeholder="Numero CIN"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Image carte d'identite *</label>
                <div className="mt-1 overflow-hidden rounded-md border border-emerald-100 bg-white">
                  <img
                    src={cinUploadIllustration}
                    alt="Illustration upload CIN"
                    className="h-auto w-full object-cover"
                  />
                  <div className="border-t border-emerald-100 bg-emerald-50/70 px-3 py-2">
                    <p className="text-sm font-semibold text-emerald-900">Telechargez votre CIN</p>
                    <p className="mt-1 text-xs text-emerald-800">
                      Ajoutez une photo ou un scan clair de votre carte d&apos;identite avant de continuer.
                    </p>
                  </div>
                </div>
                <label className="mt-1 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Upload className="h-4 w-4" />
                  {isUploadingCin ? 'Upload en cours...' : "Uploader l'image obligatoire"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleCinImageUpload} />
                </label>
                {profileForm.cinImageUrl ? (
                  <img src={profileForm.cinImageUrl} alt="Carte d'identite" className="mt-3 h-32 w-full rounded-md border border-gray-200 object-cover" />
                ) : (
                  <p className="mt-2 text-xs text-red-600">La validation reste bloquee tant que la photo CIN n'est pas envoyee.</p>
                )}
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
        <button
          type="button"
          onClick={handleGoBack}
          className="mb-6 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour
        </button>
        <Link to="/" className="flex justify-center mb-6">
          <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-emerald-100 bg-white shadow-sm">
            <img src={logo} alt="Dwira Immobilier" className="h-full w-full rounded-full object-cover" />
          </span>
        </Link>
        <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Connexion client
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Connectez-vous pour reserver, payer et suivre vos demandes.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          <div className="space-y-3">
            <button
              type="button"
              disabled={!providers.google}
              onClick={() => handleSocialLogin('google')}
              className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GoogleIcon />
              <span>Se connecter avec Google</span>
            </button>

            <button
              type="button"
              disabled={!providers.apple}
              onClick={() => handleSocialLogin('apple')}
              className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <AppleIcon />
              <span>Se connecter avec Apple</span>
            </button>

            <button
              type="button"
              onClick={handlePasskeyEntry}
              disabled={!providers.passkey}
              className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound className="h-5 w-5" />
              <span>Se connecter avec Passkey</span>
            </button>

            <button
              type="button"
              disabled={!providers.facebook}
              onClick={() => handleSocialLogin('facebook')}
              className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Facebook className="h-5 w-5 text-blue-700" />
              <span>Se connecter avec Facebook</span>
            </button>
          </div>

          {passkeyMode !== 'closed' && (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Passkey</p>
                  <p className="text-xs text-emerald-800">Choisissez votre parcours.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPasskeyMode('closed')}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
                >
                  Fermer
                </button>
              </div>

              {(passkeyMode === 'chooser' || passkeyMode === 'login' || passkeyMode === 'register') && (
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => setPasskeyMode('login')}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                      passkeyMode === 'login'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'
                    }`}
                  >
                    J&apos;ai un compte Passkey
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasskeyMode('register')}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                      passkeyMode === 'register'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'
                    }`}
                  >
                    Creer un compte Passkey
                  </button>
                </div>
              )}

              {passkeyMode === 'login' && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-sm text-gray-700">
                    Utilisez la Passkey deja enregistree sur cet appareil ou dans votre gestionnaire.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handlePasskeyLogin()}
                    disabled={isPasskeyLoading}
                    className="mt-3 inline-flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <KeyRound className="h-5 w-5" />
                    <span>{isPasskeyLoading ? 'Connexion Passkey...' : 'Continuer avec ma Passkey'}</span>
                  </button>
                </div>
              )}

              {passkeyMode === 'register' && (
                <form className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-3" onSubmit={handlePasskeyRegister}>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <button
                      type="button"
                      onClick={() => setPasskeyMode('chooser')}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Retour
                    </button>
                  </div>
                  <input
                    type="email"
                    value={passkeyRegisterEmail}
                    onChange={(e) => setPasskeyRegisterEmail(e.target.value)}
                    placeholder="Email client"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                  />
                  <input
                    type="text"
                    value={passkeyRegisterName}
                    onChange={(e) => setPasskeyRegisterName(e.target.value)}
                    placeholder="Nom (optionnel)"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isPasskeyRegisterLoading}
                    className="w-full rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isPasskeyRegisterLoading ? 'Creation Passkey...' : 'Creer avec Passkey'}
                  </button>
                </form>
              )}
            </div>
          )}

          {(!providers.google || !providers.apple || !providers.passkey) && (
            <p className="mt-4 text-xs text-amber-700">
              Certains moyens de connexion sont indisponibles sur ce serveur.
            </p>
          )}

        </div>
      </div>
    </div>
  );
}
