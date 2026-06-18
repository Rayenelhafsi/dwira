import { getSessionUser, type AuthUser } from "../services/auth";

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

function normalizeEmail(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || undefined;
}

function normalizePhone(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const hasLeadingPlus = raw.startsWith("+");
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return undefined;
  return hasLeadingPlus ? `+${digits}` : digits;
}

function normalizeName(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function buildSessionUserData(user?: AuthUser | null) {
  if (!user) return null;
  const firstName = normalizeName(user.firstName);
  const lastName = normalizeName(user.lastName);
  const fallbackName = normalizeName(user.name);
  const fallbackParts = fallbackName ? fallbackName.split(/\s+/).filter(Boolean) : [];
  const resolvedFirstName = firstName || fallbackParts.slice(0, -1).join(" ") || fallbackParts[0] || undefined;
  const resolvedLastName = lastName || (fallbackParts.length > 1 ? fallbackParts[fallbackParts.length - 1] : undefined);
  const externalId = normalizeName(user.providerUserId) || normalizeName(user.id);

  return {
    email: normalizeEmail(user.email),
    phone: normalizePhone(user.telephone),
    externalId,
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    fbLoginId: normalizeName(user.providerUserId),
  };
}

function mergeUserData(
  sessionUserData: ReturnType<typeof buildSessionUserData>,
  explicitUserData?: {
    email?: string;
    phone?: string;
    externalId?: string;
    firstName?: string;
    lastName?: string;
    fbLoginId?: string;
  }
) {
  return {
    email: normalizeEmail(explicitUserData?.email) || sessionUserData?.email,
    phone: normalizePhone(explicitUserData?.phone) || sessionUserData?.phone,
    externalId: normalizeName(explicitUserData?.externalId) || sessionUserData?.externalId,
    firstName: normalizeName(explicitUserData?.firstName) || sessionUserData?.firstName,
    lastName: normalizeName(explicitUserData?.lastName) || sessionUserData?.lastName,
    fbLoginId: normalizeName(explicitUserData?.fbLoginId) || sessionUserData?.fbLoginId,
  };
}

async function resolveMetaUserData(
  explicitUserData?: {
    email?: string;
    phone?: string;
    externalId?: string;
    firstName?: string;
    lastName?: string;
    fbLoginId?: string;
  },
  eventName?: "PageView" | "ViewContent" | "Lead" | "InitiateCheckout" | "Purchase" | "Contact"
) {
  const needsSessionFallback = eventName !== "PageView";
  const sessionUser = needsSessionFallback ? await getSessionUser() : null;
  return mergeUserData(buildSessionUserData(sessionUser), explicitUserData);
}

export async function initMetaPixel() {
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
  const resolvedUserData = await resolveMetaUserData(undefined, "PageView");
  const advancedMatchingData = {
    em: resolvedUserData.email,
    ph: resolvedUserData.phone,
    fn: resolvedUserData.firstName,
    ln: resolvedUserData.lastName,
    external_id: resolvedUserData.externalId,
  };
  const hasAdvancedData = Object.values(advancedMatchingData).some(Boolean);
  if (hasAdvancedData) {
    window.fbq?.("init", META_PIXEL_ID, advancedMatchingData);
  } else {
    window.fbq?.("init", META_PIXEL_ID);
  }
}

export function startMetaTracking() {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;

  let started = false;
  const boot = () => {
    if (started) return;
    started = true;
    void initMetaPixel();
    trackMetaPageViewOncePerPath();
    window.removeEventListener("pointerdown", boot);
    window.removeEventListener("keydown", boot);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      boot();
    }
  };

  const idleId = window.requestIdleCallback?.(() => boot(), { timeout: 3500 });
  const timeoutId = window.setTimeout(() => boot(), 4500);

  window.addEventListener("pointerdown", boot, { once: true, passive: true });
  window.addEventListener("keydown", boot, { once: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    if (typeof idleId === "number") {
      window.cancelIdleCallback?.(idleId);
    }
    window.clearTimeout(timeoutId);
    window.removeEventListener("pointerdown", boot);
    window.removeEventListener("keydown", boot);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
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
  const resolvedUserData = await resolveMetaUserData(userData, eventName);

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
          email: resolvedUserData.email,
          phone: resolvedUserData.phone,
          external_id: resolvedUserData.externalId,
          first_name: resolvedUserData.firstName,
          last_name: resolvedUserData.lastName,
          fb_login_id: resolvedUserData.fbLoginId,
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
