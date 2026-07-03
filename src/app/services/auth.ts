import { buildApiUrl, fetchJsonWithApiFallback } from '../utils/api';

export interface AuthUser {
  id?: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  role: 'admin' | 'user';
  adminType?: 'superadmin' | 'subadmin' | null;
  clientType?: 'proprietaire' | 'locataire' | 'acheteur' | 'agent_amicale' | 'agence_partenaire' | null;
  telephone?: string | null;
  address?: string | null;
  cin?: string | null;
  cinImageUrl?: string | null;
  cinImageRectoUrl?: string | null;
  cinImageVersoUrl?: string | null;
  profileCompleted?: boolean;
  authProvider?: 'local' | 'google' | 'facebook' | 'apple' | 'phone' | 'email' | 'passkey' | null;
  providerUserId?: string | null;
}

interface AdminLoginResponse {
  user: AuthUser;
}

interface SocialSessionResponse {
  user: AuthUser;
}

interface AuthSessionResponse {
  authenticated: boolean;
  user?: AuthUser;
}

export interface CompleteSocialProfileInput {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  clientType?: 'proprietaire' | 'locataire' | 'acheteur' | 'agent_amicale' | 'agence_partenaire';
  telephone: string;
  address: string;
  cin?: string;
  cinImageUrl?: string;
  cinImageRectoUrl?: string;
  cinImageVersoUrl?: string;
  avatar?: string | null;
}

interface AuthProvidersResponse {
  google: boolean;
  facebook: boolean;
  apple?: boolean;
  phoneOtp?: boolean;
  emailOtp?: boolean;
  passkey?: boolean;
}

interface PhoneOtpVerifyResponse {
  user: AuthUser;
}

interface PhoneOtpRequestResponse {
  success: boolean;
  expiresInSeconds?: number;
  debugCode?: string;
}

let providersCache: { value: AuthProvidersResponse; at: number } | null = null;
let providersInFlight: Promise<AuthProvidersResponse> | null = null;
let sessionCache: { value: AuthUser; at: number } | null = null;
let sessionInFlight: Promise<AuthUser | null> | null = null;
const PROVIDERS_CACHE_MS = 5 * 60 * 1000;
const SESSION_CACHE_MS = 2000;

function readProvidersCache(): AuthProvidersResponse | null {
  if (!providersCache) return null;
  if ((Date.now() - providersCache.at) > PROVIDERS_CACHE_MS) return null;
  return providersCache.value;
}

function readSessionCache(): AuthUser | undefined {
  if (!sessionCache) return undefined;
  if ((Date.now() - sessionCache.at) > SESSION_CACHE_MS) return undefined;
  return sessionCache.value;
}

async function loadPasskeyBrowser() {
  return import('@simplewebauthn/browser');
}

export function invalidateAuthClientCaches() {
  providersCache = null;
  providersInFlight = null;
  sessionCache = null;
  sessionInFlight = null;
}

export async function loginAdmin(email: string, password: string): Promise<AuthUser> {
  const data = await fetchJsonWithApiFallback<AdminLoginResponse>('/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  return data.user;
}

export async function getAuthProviders(): Promise<AuthProvidersResponse> {
  const cached = readProvidersCache();
  if (cached) return cached;
  if (providersInFlight) return providersInFlight;
  providersInFlight = (async () => {
    try {
      const data = await fetchJsonWithApiFallback<AuthProvidersResponse>('/auth/providers');
      const normalized = {
        google: Boolean(data?.google),
        facebook: Boolean(data?.facebook),
        apple: Boolean(data?.apple),
        phoneOtp: Boolean(data?.phoneOtp),
        emailOtp: Boolean(data?.emailOtp),
        passkey: data?.passkey !== false,
      };
      providersCache = { value: normalized, at: Date.now() };
      return normalized;
    } catch {
      return { google: false, facebook: false, apple: false, phoneOtp: false, emailOtp: false, passkey: true };
    } finally {
      providersInFlight = null;
    }
  })();
  return providersInFlight;
}

type PasskeyOptionsResponse = {
  options: Record<string, unknown>;
  challengeId: string;
  user?: AuthUser;
};

function toFriendlyPasskeyError(error: unknown, action: 'register' | 'login'): Error {
  const message = String((error as any)?.message || error || '').toLowerCase();
  const fallback = action === 'register'
    ? 'Creation Passkey echouee'
    : 'Connexion Passkey echouee';
  if (
    message.includes('timed out')
    || message.includes('not allowed')
    || message.includes('operation either timed out')
  ) {
    return new Error(
      "Operation annulee ou expiree. Validez la demande Passkey (Windows Hello/Face ID/Touch ID) et reessayez."
    );
  }
  if (message.includes('securityerror') || message.includes('insecure')) {
    return new Error("Passkey requiert un contexte securise (HTTPS ou localhost).");
  }
  if (message.includes('not supported') || message.includes('authenticator') || message.includes('platform authenticator')) {
    return new Error("Aucun authentificateur Passkey disponible sur cet appareil.");
  }
  if (message.includes('invalidstateerror')) {
    return new Error("Cette Passkey semble deja enregistree sur cet appareil.");
  }
  if (message.includes('aborted')) {
    return new Error("Operation Passkey annulee.");
  }
  return new Error((error as any)?.message || fallback);
}

export async function registerWithPasskey(email: string, name?: string): Promise<AuthUser> {
  try {
    const { startRegistration } = await loadPasskeyBrowser();
    const bootstrap = await fetchJsonWithApiFallback<PasskeyOptionsResponse>('/auth/passkey/register/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const payload = await startRegistration(bootstrap.options as any);
    const data = await fetchJsonWithApiFallback<SocialSessionResponse>('/auth/passkey/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: bootstrap.challengeId, credential: payload }),
    });
    return data.user;
  } catch (error) {
    throw toFriendlyPasskeyError(error, 'register');
  }
}

export async function loginWithPasskey(email?: string): Promise<AuthUser> {
  try {
    const { startAuthentication } = await loadPasskeyBrowser();
    const bootstrap = await fetchJsonWithApiFallback<PasskeyOptionsResponse>('/auth/passkey/login/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email || '' }),
    });
    const payload = await startAuthentication(bootstrap.options as any);
    const data = await fetchJsonWithApiFallback<SocialSessionResponse>('/auth/passkey/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: bootstrap.challengeId, credential: payload }),
    });
    return data.user;
  } catch (error) {
    throw toFriendlyPasskeyError(error, 'login');
  }
}

export interface AntiBotConfig {
  provider: 'turnstile';
  enabled: boolean;
  siteKey: string | null;
}

export async function getAntiBotConfig(): Promise<AntiBotConfig> {
  try {
    const data = await fetchJsonWithApiFallback<AntiBotConfig>('/anti-bot/config');
    return {
      provider: 'turnstile',
      enabled: Boolean(data?.enabled),
      siteKey: data?.siteKey || null,
    };
  } catch {
    return { provider: 'turnstile', enabled: false, siteKey: null };
  }
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const cached = readSessionCache();
  if (cached) return cached;
  if (sessionInFlight) return sessionInFlight;
  sessionInFlight = (async () => {
    try {
      const data = await fetchJsonWithApiFallback<AuthSessionResponse>('/auth/session');
      const user = data?.user || null;
      if (user) {
        sessionCache = { value: user, at: Date.now() };
      } else {
        sessionCache = null;
      }
      return user;
    } catch {
      sessionCache = null;
      return null;
    } finally {
      sessionInFlight = null;
    }
  })();
  return sessionInFlight;
}

export async function logoutSession(): Promise<void> {
  try {
    await fetchJsonWithApiFallback<{ success: boolean }>('/auth/logout', { method: 'POST' });
  } catch {
    // Ignore network errors and continue with local logout.
  } finally {
    invalidateAuthClientCaches();
  }
}

export async function getSocialSession(token: string): Promise<AuthUser> {
  const data = await fetchJsonWithApiFallback<SocialSessionResponse>(
    `/auth/social/session/${encodeURIComponent(token)}`
  );
  return data.user;
}

export async function completeSocialProfile(input: CompleteSocialProfileInput): Promise<AuthUser> {
  const data = await fetchJsonWithApiFallback<SocialSessionResponse>(
    `/auth/social/profile/${encodeURIComponent(input.id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  return data.user;
}

export async function loginWithPhone(telephone: string): Promise<AuthUser> {
  const data = await fetchJsonWithApiFallback<PhoneOtpVerifyResponse>('/auth/phone/direct-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telephone }),
  });
  return data.user;
}

export async function requestPhoneOtp(telephone: string): Promise<PhoneOtpRequestResponse> {
  return fetchJsonWithApiFallback<PhoneOtpRequestResponse>('/auth/phone/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telephone }),
  });
}

export async function verifyPhoneOtp(telephone: string, code: string): Promise<AuthUser> {
  const data = await fetchJsonWithApiFallback<PhoneOtpVerifyResponse>('/auth/phone/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telephone, code }),
  });
  return data.user;
}

export function startSocialLogin(provider: 'google' | 'facebook' | 'apple', returnTo?: string) {
  const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
  window.location.replace(buildApiUrl(`/auth/${provider}/start${query}`));
}
