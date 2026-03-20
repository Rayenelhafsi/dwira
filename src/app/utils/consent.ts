export type CookieConsentStatus = 'pending' | 'accepted' | 'rejected';

const CONSENT_KEY = 'dwira_cookie_consent_v1';
const TRACKING_SESSION_KEY = 'dwira_tracking_session_id';

type StoredConsent = {
  status: Exclude<CookieConsentStatus, 'pending'>;
  at: string;
};

function safeParseConsent(value: string | null): StoredConsent | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredConsent;
    if (!parsed || (parsed.status !== 'accepted' && parsed.status !== 'rejected')) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getCookieConsentStatus(): CookieConsentStatus {
  if (typeof window === 'undefined') return 'pending';
  const parsed = safeParseConsent(localStorage.getItem(CONSENT_KEY));
  return parsed?.status || 'pending';
}

export function setCookieConsentStatus(status: Exclude<CookieConsentStatus, 'pending'>) {
  if (typeof window === 'undefined') return;
  const payload: StoredConsent = {
    status,
    at: new Date().toISOString(),
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent('dwira-consent-updated', { detail: payload }));
}

export function hasTrackingConsent() {
  return getCookieConsentStatus() === 'accepted';
}

export function getOrCreateTrackingSessionId() {
  if (typeof window === 'undefined') return `sess_${Date.now()}`;
  const existing = sessionStorage.getItem(TRACKING_SESSION_KEY);
  if (existing) return existing;
  const generated = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  sessionStorage.setItem(TRACKING_SESSION_KEY, generated);
  return generated;
}
