export const DEFAULT_CONTACT_PHONE = '+21652080695';
export const DEFAULT_MESSENGER_PAGE = 'dwiraimmo2';
export const DEFAULT_MESSENGER_PAGE_ID = '337429332783552';
export const LOCATION_CONTACT_PHONE = '+21629879227';
export const LOCATION_MESSENGER_PAGE = 'Dwiraimmobilier';
export const LOCATION_MESSENGER_PAGE_ID = '163909273467177';

export function getPublicContactForMode(mode?: string | null) {
  const normalizedMode = String(mode || '').trim();
  if (normalizedMode === 'location_saisonniere' || normalizedMode === 'location_annuelle') {
    return {
      phone: LOCATION_CONTACT_PHONE,
      messengerPage: LOCATION_MESSENGER_PAGE,
      messengerPageId: LOCATION_MESSENGER_PAGE_ID,
    };
  }
  return {
    phone: DEFAULT_CONTACT_PHONE,
    messengerPage: DEFAULT_MESSENGER_PAGE,
    messengerPageId: DEFAULT_MESSENGER_PAGE_ID,
  };
}

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/[^\d+]/g, '');
}

function digitsOnly(value?: string | null) {
  return normalizePhone(value).replace(/\D/g, '');
}

export function buildTelLink(phone?: string | null) {
  return `tel:${normalizePhone(phone) || DEFAULT_CONTACT_PHONE}`;
}

export function buildWhatsAppWebLink(phone?: string | null, text?: string) {
  const digits = digitsOnly(phone) || '21652080695';
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

export function buildWhatsAppAppLink(phone?: string | null, text?: string) {
  const digits = digitsOnly(phone) || '21652080695';
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `whatsapp://send?phone=${digits}${query}`;
}

export function buildMessengerWebLink(page: string = DEFAULT_MESSENGER_PAGE) {
  return `https://m.me/${page}`;
}

export function buildMessengerAppLink(page: string = DEFAULT_MESSENGER_PAGE, pageId?: string | null, ref?: string | null) {
  const normalizedPageId = String(pageId || '').trim();
  const normalizedRef = String(ref || '').trim();
  if (normalizedPageId) {
    const query = normalizedRef ? `?ref=${encodeURIComponent(normalizedRef)}` : '';
    return `fb-messenger://user-thread/${normalizedPageId}${query}`;
  }
  const webUrl = buildMessengerWebLink(page);
  const target = normalizedRef ? `${webUrl}?ref=${encodeURIComponent(normalizedRef)}` : webUrl;
  return `fb-messenger://share?link=${encodeURIComponent(target)}`;
}

export function openDeepLink(appUrl: string, fallbackUrl: string) {
  const startedAt = Date.now();
  const fallback = window.setTimeout(() => {
    if (document.visibilityState === 'visible' && Date.now() - startedAt < 2200) {
      window.location.assign(fallbackUrl);
    }
  }, 900);

  const clear = () => {
    window.clearTimeout(fallback);
    document.removeEventListener('visibilitychange', clear);
    window.removeEventListener('pagehide', clear);
    window.removeEventListener('blur', clear);
  };

  document.addEventListener('visibilitychange', clear);
  window.addEventListener('pagehide', clear);
  window.addEventListener('blur', clear);
  window.location.href = appUrl;
}

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  const mobileHint = Boolean((navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile);
  const platform = String(navigator.platform || '').toLowerCase();
  const isDesktopPlatform = /win32|win64|macintel|linux x86_64|x11/.test(platform);
  if (isDesktopPlatform) return false;
  return mobileHint || /Android|iPhone|iPad|iPod/i.test(ua);
}

function isRestrictedInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter/i.test(ua);
}

export function openPhoneApp(phone?: string | null) {
  window.location.href = buildTelLink(phone);
}

export function openWhatsAppApp(phone?: string | null, text?: string) {
  openDeepLink(buildWhatsAppAppLink(phone, text), buildWhatsAppWebLink(phone, text));
}

export function openMessengerApp(page: string = DEFAULT_MESSENGER_PAGE) {
  const webUrl = buildMessengerWebLink(page);
  if (!isMobileDevice() || isRestrictedInAppBrowser()) {
    window.location.assign(webUrl);
    return;
  }
  openDeepLink(buildMessengerAppLink(page), webUrl);
}

export function buildPropertyShareMessage(title: string, url: string) {
  return `Bonjour, je suis interesse par ce bien : ${title}\n${url}`;
}

type MessengerPropertyPayload = {
  page?: string;
  pageId?: string | null;
  propertyUrl: string;
  title?: string;
  imageUrl?: string | null;
  reference?: string | null;
};

function encodeMessengerRef(payload: { propertyUrl: string; title?: string; imageUrl?: string | null; reference?: string | null }) {
  const rawImage = String(payload.imageUrl || '').trim();
  let compactImage = '';
  if (rawImage) {
    try {
      const parsed = new URL(rawImage);
      compactImage = `${parsed.origin}${parsed.pathname}`;
    } catch {
      compactImage = rawImage.split('?')[0];
    }
  }
  // Keep payload compact: long refs can be truncated by Messenger and break auto-reply context.
  const json = JSON.stringify({
    u: String(payload.propertyUrl || '').trim(),
    i: compactImage,
    r: String(payload.reference || '').trim(),
    c: Date.now(),
  });
  return `dwira_prop:${btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

export function buildMessengerPropertyLink(payload: MessengerPropertyPayload) {
  const page = payload.page || DEFAULT_MESSENGER_PAGE;
  const propertyUrl = String(payload.propertyUrl || '').trim();
  const webThreadBase = buildMessengerWebLink(page);
  if (!propertyUrl) return webThreadBase;
  const ref = encodeMessengerRef({
    propertyUrl,
    title: payload.title,
    imageUrl: payload.imageUrl || null,
    reference: payload.reference || null,
  });
  const webUrl = `${webThreadBase}?${new URLSearchParams({ ref }).toString()}`;
  return webUrl;
}

export async function openMessengerPropertyConversation(payload: MessengerPropertyPayload) {
  const webUrl = buildMessengerPropertyLink(payload);
  if (!webUrl) {
    const page = payload.page || DEFAULT_MESSENGER_PAGE;
    window.location.assign(buildMessengerWebLink(page));
    return;
  }
  if (!isMobileDevice() || isRestrictedInAppBrowser()) {
    window.location.assign(webUrl);
    return;
  }
  const page = payload.page || DEFAULT_MESSENGER_PAGE;
  const pageId = String(payload.pageId || '').trim();
  const propertyUrl = String(payload.propertyUrl || '').trim();
  if (!propertyUrl) {
    openDeepLink(buildMessengerAppLink(page, pageId), webUrl);
    return;
  }
  const ref = webUrl.split('?ref=')[1] || '';
  const appUrl = buildMessengerAppLink(page, pageId, decodeURIComponent(ref));
  openDeepLink(appUrl, webUrl);
}
