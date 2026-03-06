import { buildApiUrl, fetchJsonWithApiFallback } from '../utils/api';
import { openDeepLink } from '../utils/deepLinks';

export interface AuthUser {
  id?: string;
  email: string;
  name: string;
  avatar?: string | null;
  role: 'admin' | 'user';
  clientType?: 'proprietaire' | 'locataire' | 'acheteur' | null;
  telephone?: string | null;
  cin?: string | null;
  cinImageUrl?: string | null;
  profileCompleted?: boolean;
}

interface AdminLoginResponse {
  user: AuthUser;
}

interface SocialSessionResponse {
  user: AuthUser;
}

export interface CompleteSocialProfileInput {
  id: string;
  name: string;
  email?: string;
  clientType: 'proprietaire' | 'locataire' | 'acheteur';
  telephone: string;
  cin?: string;
  cinImageUrl?: string;
  avatar?: string | null;
}

interface AuthProvidersResponse {
  google: boolean;
  facebook: boolean;
  phoneOtp?: boolean;
  emailOtp?: boolean;
}

interface PhoneOtpVerifyResponse {
  user: AuthUser;
}

interface PhoneOtpRequestResponse {
  success: boolean;
  expiresInSeconds?: number;
  debugCode?: string;
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
  try {
    const data = await fetchJsonWithApiFallback<AuthProvidersResponse>('/auth/providers');
    return {
      google: Boolean(data?.google),
      facebook: Boolean(data?.facebook),
      phoneOtp: Boolean(data?.phoneOtp),
      emailOtp: Boolean(data?.emailOtp),
    };
  } catch {
    return { google: false, facebook: false, phoneOtp: false, emailOtp: false };
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

function isMobileBrowserForFacebookAppLogin() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const isInAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter/i.test(ua);
  return isMobile && !isInAppBrowser;
}

export function startSocialLogin(provider: 'google' | 'facebook') {
  if (provider === 'facebook' && isMobileBrowserForFacebookAppLogin()) {
    void (async () => {
      try {
        const response = await fetch(buildApiUrl('/auth/facebook/authorize-url'), { credentials: 'include' });
        if (!response.ok) {
          window.location.replace(buildApiUrl('/auth/facebook/start'));
          return;
        }
        const payload = (await response.json()) as { url?: string };
        const oauthUrl = String(payload?.url || '').trim();
        if (!oauthUrl) {
          window.location.replace(buildApiUrl('/auth/facebook/start'));
          return;
        }
        const appUrl = `fb://facewebmodal/f?href=${encodeURIComponent(oauthUrl)}`;
        openDeepLink(appUrl, oauthUrl);
      } catch {
        window.location.replace(buildApiUrl('/auth/facebook/start'));
      }
    })();
    return;
  }
  window.location.replace(buildApiUrl(`/auth/${provider}/start`));
}
