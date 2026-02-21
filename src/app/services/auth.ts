import { API_BASE } from '../config';

export interface AuthUser {
  id?: string;
  email: string;
  name: string;
  avatar?: string | null;
  role: 'admin' | 'user';
}

interface AdminLoginResponse {
  user: AuthUser;
}

interface SocialSessionResponse {
  user: AuthUser;
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

export async function getSocialSession(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/social/session/${encodeURIComponent(token)}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Session sociale invalide');
  }
  return (data as SocialSessionResponse).user;
}

export function startSocialLogin(provider: 'google' | 'facebook') {
  window.location.href = `${API_BASE}/auth/${provider}/start`;
}

