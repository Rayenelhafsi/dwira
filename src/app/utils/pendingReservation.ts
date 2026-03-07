const PENDING_RESERVATION_KEY = "dwira_pending_reservation_draft";

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
