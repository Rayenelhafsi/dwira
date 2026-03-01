import type { ReservationDemand } from "../admin/types";

const STORAGE_KEY = "dwira_reservations_cache_v1";

function readCache(): ReservationDemand[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(rows: ReservationDemand[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore localStorage failures
  }
}

export function saveReservationToCache(reservation: ReservationDemand) {
  const current = readCache();
  const next = [reservation, ...current.filter((item) => item.id !== reservation.id)];
  writeCache(next);
}

export function getReservationsFromCache(filters?: { clientUserId?: string; clientEmail?: string }) {
  const current = readCache();
  if (!filters?.clientUserId && !filters?.clientEmail) return current;
  return current.filter((item) => (
    (filters.clientUserId && item.client_user_id === filters.clientUserId) ||
    (filters.clientEmail && item.client_email === filters.clientEmail)
  ));
}
