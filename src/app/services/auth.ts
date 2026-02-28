const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
  email: string;
  clientType: 'proprietaire' | 'locataire' | 'acheteur';
  telephone: string;
  cin?: string;
  cinImageUrl?: string;
  avatar?: string | null;
}

interface AuthProvidersResponse {
  google: boolean;
  facebook: boolean;
}

export async function loginAdmin(email: string, password: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Connexion administrateur échouée');
  }

  return (data as AdminLoginResponse).user;
}

export async function getAuthProviders(): Promise<AuthProvidersResponse> {
  const response = await fetch(`${API_BASE}/auth/providers`);
  if (!response.ok) {
    return { google: false, facebook: false };
  }
  const data = await response.json();
  return {
    google: Boolean(data?.google),
    facebook: Boolean(data?.facebook),
  };
}

export async function getSocialSession(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/social/session/${encodeURIComponent(token)}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Session sociale invalide');
  }
  return (data as SocialSessionResponse).user;
}

export async function completeSocialProfile(input: CompleteSocialProfileInput): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/social/profile/${encodeURIComponent(input.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error("Le serveur d'authentification ne repond pas en JSON. Verifiez VITE_API_URL, le proxy Vite, ou le serveur API.");
  }
  if (!response.ok) {
    throw new Error(data?.error || 'Enregistrement du profil client echoue');
  }
  return (data as SocialSessionResponse).user;
}

export function startSocialLogin(provider: 'google' | 'facebook') {
  window.location.href = `${API_BASE}/auth/${provider}/start`;
}

