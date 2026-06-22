import { getCookieConsentStatus, hasTrackingConsent } from './consent';

const GA_MEASUREMENT_ID = String(
  import.meta.env.VITE_GA_MEASUREMENT_ID
  || import.meta.env.VITE_GA4_MEASUREMENT_ID
  || ''
).trim();

let gaScriptPromise: Promise<boolean> | null = null;
let consentInitialized = false;

function ensureDataLayer() {
  const scope = window as typeof window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };
  scope.dataLayer = scope.dataLayer || [];
  if (!scope.gtag) {
    scope.gtag = function gtag(...args: unknown[]) {
      scope.dataLayer?.push(args);
    };
  }
  return scope.gtag;
}

export function isGaTrackingEnabled() {
  return Boolean(GA_MEASUREMENT_ID);
}

function updateGaConsent(status = getCookieConsentStatus()) {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined') return;
  const gtag = ensureDataLayer();
  const granted = status === 'accepted';
  gtag('consent', 'update', {
    ad_storage: granted ? 'granted' : 'denied',
    analytics_storage: granted ? 'granted' : 'denied',
    ad_user_data: granted ? 'granted' : 'denied',
    ad_personalization: granted ? 'granted' : 'denied',
  });
}

function ensureGaConsentMode() {
  if (consentInitialized || !GA_MEASUREMENT_ID || typeof window === 'undefined') return;
  const gtag = ensureDataLayer();
  gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  updateGaConsent();
  window.addEventListener('dwira-consent-updated', () => updateGaConsent());
  consentInitialized = true;
}

export async function ensureGaTrackingReady() {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (gaScriptPromise) return gaScriptPromise;
  gaScriptPromise = new Promise((resolve) => {
    const gtag = ensureDataLayer();
    ensureGaConsentMode();
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true,
    });

    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-ga-id="${GA_MEASUREMENT_ID}"], script[src*="googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}"]`
    );
    if (existing) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    script.dataset.gaId = GA_MEASUREMENT_ID;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return gaScriptPromise;
}

export async function trackGaEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined' || !hasTrackingConsent()) return false;
  const ready = await ensureGaTrackingReady();
  if (!ready) return false;
  const gtag = ensureDataLayer();
  gtag('event', eventName, params);
  return true;
}

export async function trackGaPageView(path: string, title?: string) {
  return trackGaEvent('page_view', {
    page_path: path,
    page_title: title || (typeof document !== 'undefined' ? document.title : undefined),
  });
}
