const API_URL = import.meta.env.VITE_API_URL || "/api";
const META_PIXEL_ID = String(import.meta.env.VITE_META_PIXEL_ID || "").trim();

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: (...args: any[]) => void;
  }
}

function randomId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${safeName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function initMetaPixel() {
  if (typeof window === "undefined" || !META_PIXEL_ID || window.fbq) return;
  ((f: any, b: Document, e: string, v: string, n?: any, t?: HTMLScriptElement, s?: HTMLElement) => {
    if (f.fbq) return;
    n = f.fbq = function (...args: any[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s?.parentNode?.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  window.fbq?.("init", META_PIXEL_ID);
}

export async function trackMetaEvent({
  eventName,
  eventId,
  customData,
  userData,
}: {
  eventName: "PageView" | "ViewContent" | "Lead" | "InitiateCheckout" | "Purchase" | "Contact";
  eventId?: string;
  customData?: Record<string, unknown>;
  userData?: {
    email?: string;
    phone?: string;
    externalId?: string;
    firstName?: string;
    lastName?: string;
    fbLoginId?: string;
  };
}) {
  const finalEventId = String(eventId || randomId(`meta_${eventName.toLowerCase()}`)).trim();

  if (typeof window !== "undefined" && window.fbq && META_PIXEL_ID) {
    window.fbq("track", eventName, customData || {}, { eventID: finalEventId });
  }

  try {
    await fetch(`${API_URL}/meta/conversions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        event_name: eventName,
        event_id: finalEventId,
        event_source_url: typeof window !== "undefined" ? window.location.href : undefined,
        user_data: {
          email: String(userData?.email || "").trim().toLowerCase() || undefined,
          phone: String(userData?.phone || "").trim() || undefined,
          external_id: String(userData?.externalId || "").trim() || undefined,
          first_name: String(userData?.firstName || "").trim() || undefined,
          last_name: String(userData?.lastName || "").trim() || undefined,
          fb_login_id: String(userData?.fbLoginId || "").trim() || undefined,
          fbp: readCookie("_fbp") || undefined,
          fbc: readCookie("_fbc") || undefined,
        },
        custom_data: customData || undefined,
      }),
    });
  } catch {
    // Silent on purpose to avoid blocking user flow.
  }
  return finalEventId;
}

export function trackMetaPageViewOncePerPath() {
  if (typeof window === "undefined") return;
  let lastTrackedPathname = "";
  let lastTrackedAt = 0;
  const MIN_PAGEVIEW_INTERVAL_MS = 1500;
  const fire = () => {
    const currentPathname = window.location.pathname;
    const now = Date.now();
    if (currentPathname === lastTrackedPathname && now - lastTrackedAt < MIN_PAGEVIEW_INTERVAL_MS) return;
    if (currentPathname === lastTrackedPathname) return;
    lastTrackedPathname = currentPathname;
    lastTrackedAt = now;
    void trackMetaEvent({ eventName: "PageView" });
  };
  fire();
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    fire();
  };
  history.replaceState = function (...args) {
    originalReplaceState(...args);
    fire();
  };
  window.addEventListener("popstate", fire);
}
