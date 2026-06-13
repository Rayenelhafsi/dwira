import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSessionUser, logoutSession } from '../services/auth';
import { trackPublicClientInteraction } from '../utils/clientInteractions';
import { getOrCreateTrackingSessionId, hasTrackingConsent } from '../utils/consent';

interface User {
  id?: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string;
  role: 'admin' | 'user';
  clientType?: 'proprietaire' | 'locataire' | 'acheteur' | null;
  telephone?: string | null;
  address?: string | null;
  cin?: string | null;
  cinImageUrl?: string | null;
  profileCompleted?: boolean;
  authProvider?: 'local' | 'google' | 'facebook' | 'apple' | 'phone' | 'email' | 'passkey' | null;
  providerUserId?: string | null;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('dwira_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as User : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [isLoading, setIsLoading] = useState(true);
  const [consentRevision, setConsentRevision] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const restoreSession = async () => {
      const serverUser = await getSessionUser();
      if (serverUser) {
        const normalizedUser: User = {
          id: serverUser.id,
          email: serverUser.email,
          name: serverUser.name,
          firstName: serverUser.firstName || undefined,
          lastName: serverUser.lastName || undefined,
          role: serverUser.role,
          avatar: serverUser.avatar || undefined,
          clientType: serverUser.clientType || undefined,
          telephone: serverUser.telephone || undefined,
          address: serverUser.address || undefined,
          cin: serverUser.cin || undefined,
          cinImageUrl: serverUser.cinImageUrl || undefined,
          profileCompleted: serverUser.profileCompleted,
          authProvider: serverUser.authProvider || undefined,
          providerUserId: serverUser.providerUserId || undefined,
        };
        if (!isMounted) return;
        setUser(normalizedUser);
        localStorage.setItem('dwira_user', JSON.stringify(normalizedUser));
        setIsLoading(false);
        return;
      }

      // Security/session consistency:
      // if backend session is missing, clear any cached local user to avoid
      // unauthorized API calls with stale identity.
      localStorage.removeItem('dwira_user');
      if (isMounted) {
        setUser(null);
      }
      if (isMounted) {
        setIsLoading(false);
      }
    };

    void restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'dwira_user') return;
      if (!event.newValue) {
        setUser(null);
        return;
      }
      try {
        setUser(JSON.parse(event.newValue));
      } catch (e) {
        console.error('Failed to parse user from storage event', e);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const onConsentUpdated = () => setConsentRevision((prev) => prev + 1);
    window.addEventListener('dwira-consent-updated', onConsentUpdated as EventListener);
    return () => window.removeEventListener('dwira-consent-updated', onConsentUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (!hasTrackingConsent()) return;
    if (!user || user.role !== 'user' || !user.email) return;
    const sessionKey = `dwira_site_open_tracked_${user.id || user.email}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    void trackPublicClientInteraction({
      type: 'site_open',
      clientUserId: user.id,
      clientEmail: user.email,
      clientName: user.name,
      propertyTitle: 'Ouverture site',
      sessionId: getOrCreateTrackingSessionId(),
      path: window.location.pathname + window.location.search,
      metadata: {
        referrer: document.referrer || null,
      },
    }).catch(() => {});
  }, [user, consentRevision]);

  useEffect(() => {
    if (!hasTrackingConsent()) return;
    if (user) return;
    const sessionKey = 'dwira_anonymous_session_start_tracked';
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    const sessionId = getOrCreateTrackingSessionId();
    const path = window.location.pathname + window.location.search;
    void trackPublicClientInteraction({
      type: 'session_start',
      propertyTitle: 'Session anonyme',
      sessionId,
      path,
      metadata: {
        referrer: document.referrer || null,
      },
    }).catch(() => {});
    void trackPublicClientInteraction({
      type: 'site_open',
      propertyTitle: 'Ouverture site anonyme',
      sessionId,
      path,
      metadata: {
        referrer: document.referrer || null,
      },
    }).catch(() => {});
  }, [user, consentRevision]);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('dwira_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('dwira_user');
    void logoutSession();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
