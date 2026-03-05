export const DEFAULT_CONTACT_PHONE = '+21652080695';
export const DEFAULT_MESSENGER_PAGE = 'dwiraimmo2';
export const LOCATION_CONTACT_PHONE = '+21629879227';
export const LOCATION_MESSENGER_PAGE = 'Dwiraimmobilier';

export function getPublicContactForMode(mode?: string | null) {
  const normalizedMode = String(mode || '').trim();
  if (normalizedMode === 'location_saisonniere' || normalizedMode === 'location_annuelle') {
    return {
      phone: LOCATION_CONTACT_PHONE,
      messengerPage: LOCATION_MESSENGER_PAGE,
    };
  }
  return {
    phone: DEFAULT_CONTACT_PHONE,
    messengerPage: DEFAULT_MESSENGER_PAGE,
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

export function buildMessengerAppLink(page: string = DEFAULT_MESSENGER_PAGE) {
  return buildMessengerWebLink(page);
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

export function openPhoneApp(phone?: string | null) {
  window.location.href = buildTelLink(phone);
}

export function openWhatsAppApp(phone?: string | null, text?: string) {
  openDeepLink(buildWhatsAppAppLink(phone, text), buildWhatsAppWebLink(phone, text));
}

export function openMessengerApp(page: string = DEFAULT_MESSENGER_PAGE) {
  const threadUrl = buildMessengerWebLink(page);
  window.location.assign(threadUrl);
}

export function buildPropertyShareMessage(title: string, url: string) {
  return `Bonjour, je suis interesse par ce bien : ${title}\n${url}`;
}

type MessengerPropertyPayload = {
  page?: string;
  propertyUrl: string;
  title?: string;
  imageUrl?: string | null;
};

function encodeMessengerRef(payload: { propertyUrl: string; title?: string }) {
  const json = JSON.stringify({
    u: String(payload.propertyUrl || '').trim(),
    t: String(payload.title || '').trim(),
  });
  return `dwira_prop:${btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

export function buildMessengerPropertyLink(payload: MessengerPropertyPayload) {
  const page = payload.page || DEFAULT_MESSENGER_PAGE;
  const propertyUrl = String(payload.propertyUrl || '').trim();
  if (!propertyUrl) return buildMessengerWebLink(page);
  const ref = encodeMessengerRef({ propertyUrl, title: payload.title });
  const params = new URLSearchParams({ ref });
  return `${buildMessengerWebLink(page)}?${params.toString()}`;
}

export async function openMessengerPropertyConversation(payload: MessengerPropertyPayload) {
  const target = buildMessengerPropertyLink(payload);
  if (!target) {
    window.location.assign(buildMessengerWebLink(payload.page || DEFAULT_MESSENGER_PAGE));
    return;
  }
  window.location.assign(target);
}
