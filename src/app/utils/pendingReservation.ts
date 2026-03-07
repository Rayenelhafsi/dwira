const PENDING_RESERVATION_KEY = "dwira_pending_reservation_draft";
const AUTH_RETURN_TO_KEY = "dwira_auth_return_to";
const AUTH_PENDING_LOGIN_KEY = "dwira_auth_pending_login";

export type PendingReservationDraft = {
  propertyId: string;
  propertySlug: string;
  requestType?: "reservation" | "visite";
  startDate: string;
  endDate: string;
  guests: number;
  includeCleaningFee: boolean;
  includeServiceFee: boolean;
  extraMattresses?: number;
  selectedPaidServiceIds?: string[];
  paymentMode?: "totalite" | "avance";
  reservationNote: string;
};

export function savePendingReservationDraft(draft: PendingReservationDraft) {
  const payload = JSON.stringify(draft);
  try {
    sessionStorage.setItem(PENDING_RESERVATION_KEY, payload);
  } catch {}
  try {
    localStorage.setItem(PENDING_RESERVATION_KEY, payload);
  } catch {}
}

export function readPendingReservationDraft(): PendingReservationDraft | null {
  const tryParse = (raw: string | null): PendingReservationDraft | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.propertySlug !== "string" || typeof parsed.startDate !== "string" || typeof parsed.endDate !== "string") return null;
      return parsed as PendingReservationDraft;
    } catch {
      return null;
    }
  };

  const fromSession = tryParse(sessionStorage.getItem(PENDING_RESERVATION_KEY));
  if (fromSession) return fromSession;
  const fromLocal = tryParse(localStorage.getItem(PENDING_RESERVATION_KEY));
  if (fromLocal) {
    // Rehydrate session storage for current tab continuity.
    try {
      sessionStorage.setItem(PENDING_RESERVATION_KEY, JSON.stringify(fromLocal));
    } catch {}
    return fromLocal;
  }
  return null;
}

export function clearPendingReservationDraft() {
  try {
    sessionStorage.removeItem(PENDING_RESERVATION_KEY);
  } catch {}
  try {
    localStorage.removeItem(PENDING_RESERVATION_KEY);
  } catch {}
}

export function saveAuthReturnTo(path: string) {
  const value = String(path || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return;
  try {
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, value);
  } catch {}
  try {
    localStorage.setItem(AUTH_RETURN_TO_KEY, value);
  } catch {}
}

export function readAuthReturnTo() {
  try {
    const value = String(sessionStorage.getItem(AUTH_RETURN_TO_KEY) || "").trim();
    if (!value.startsWith("/") || value.startsWith("//")) return null;
    return value;
  } catch {
    // continue to local fallback
  }
  try {
    const value = String(localStorage.getItem(AUTH_RETURN_TO_KEY) || "").trim();
    if (!value.startsWith("/") || value.startsWith("//")) return null;
    try { sessionStorage.setItem(AUTH_RETURN_TO_KEY, value); } catch {}
    return value;
  } catch {
    return null;
  }
}

export function clearAuthReturnTo() {
  try {
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  } catch {}
  try {
    localStorage.removeItem(AUTH_RETURN_TO_KEY);
  } catch {}
}

export function markAuthPendingLogin() {
  const payload = String(Date.now());
  try {
    sessionStorage.setItem(AUTH_PENDING_LOGIN_KEY, payload);
  } catch {}
  try {
    localStorage.setItem(AUTH_PENDING_LOGIN_KEY, payload);
  } catch {}
}

export function isAuthPendingLogin() {
  const readValue = (value: string | null) => String(value || "").trim().length > 0;
  try {
    if (readValue(sessionStorage.getItem(AUTH_PENDING_LOGIN_KEY))) return true;
  } catch {}
  try {
    return readValue(localStorage.getItem(AUTH_PENDING_LOGIN_KEY));
  } catch {
    return false;
  }
}

export function clearAuthPendingLogin() {
  try {
    sessionStorage.removeItem(AUTH_PENDING_LOGIN_KEY);
  } catch {}
  try {
    localStorage.removeItem(AUTH_PENDING_LOGIN_KEY);
  } catch {}
}
