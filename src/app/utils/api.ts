const RAW_API_BASE = import.meta.env.VITE_API_URL || '/api';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

export function getApiBaseCandidates(): string[] {
  const configured = String(RAW_API_BASE || '/api').trim() || '/api';
  const candidates = new Set<string>();

  if (typeof window === 'undefined') {
    candidates.add(trimTrailingSlash(configured));
    return Array.from(candidates);
  }

  if (isAbsoluteUrl(configured)) {
    candidates.add(trimTrailingSlash(configured));
    return Array.from(candidates);
  }

  const relativeBase = configured.startsWith('/') ? configured : `/${configured}`;
  candidates.add(`${window.location.origin}${relativeBase}`.replace(/\/+$/, ''));

  return Array.from(candidates);
}

export function buildApiUrl(path: string, base?: string): string {
  const targetBase = trimTrailingSlash(base || getApiBaseCandidates()[0] || '/api');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${targetBase}${normalizedPath}`;
}

export async function fetchJsonWithApiFallback<T>(path: string, init?: RequestInit): Promise<T> {
  const bases = getApiBaseCandidates();
  let lastError: Error | null = null;

  for (const base of bases) {
    try {
      const response = await fetch(buildApiUrl(path, base), init);
      const raw = await response.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        if (raw.trim().startsWith('<')) {
          throw new Error(`HTML recu depuis ${base}`);
        }
        throw new Error(`Reponse non JSON depuis ${base}`);
      }

      if (!response.ok) {
        throw new Error(data?.error || `Erreur API depuis ${base}`);
      }

      return data as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Erreur API inconnue');
    }
  }

  throw lastError || new Error("Le serveur API n'est pas joignable");
}

export async function fetchWithApiFallback(path: string, init?: RequestInit): Promise<Response> {
  const bases = getApiBaseCandidates();
  let lastError: Error | null = null;

  for (const base of bases) {
    try {
      const response = await fetch(buildApiUrl(path, base), init);
      const cloned = response.clone();
      const contentType = response.headers.get('content-type') || '';
      const raw = await cloned.text();
      const looksLikeHtml = raw.trim().startsWith('<!DOCTYPE') || raw.trim().startsWith('<html') || raw.trim().startsWith('<');

      if (looksLikeHtml && contentType.includes('text/html')) {
        lastError = new Error(`HTML recu depuis ${base}`);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Erreur API inconnue');
    }
  }

  throw lastError || new Error("Le serveur API n'est pas joignable");
}
