export const AMICALE_TTC_MULTIPLIER = 1.1;

function roundCurrency(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeAmicaleToken(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function applyAmicaleTtc(amount: number, enabled: boolean) {
  const normalizedAmount = Number(amount || 0);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return 0;
  return roundCurrency(enabled ? normalizedAmount * AMICALE_TTC_MULTIPLIER : normalizedAmount);
}

export function isSitepAmicale(params: {
  code?: string | null;
  name?: string | null;
  selectionName?: string | null;
}) {
  const tokens = [
    normalizeAmicaleToken(params.code),
    normalizeAmicaleToken(params.name),
    normalizeAmicaleToken(params.selectionName),
  ].filter(Boolean);
  return tokens.some((token) => token === "sitep" || token.includes("sitep"));
}

export function applySitepWeeklyEquivalentForFiveNights(params: {
  enabled: boolean;
  nights: number;
  weeklyPrice?: number | null;
  fallbackTotal: number;
}) {
  const fallbackTotal = roundCurrency(Number(params.fallbackTotal || 0));
  const weeklyPrice = roundCurrency(Number(params.weeklyPrice || 0));
  if (!params.enabled || Number(params.nights || 0) !== 5 || weeklyPrice <= 0) return fallbackTotal;
  return weeklyPrice;
}

export function formatTnd(amount: number) {
  const normalizedAmount = Number(amount || 0);
  if (!Number.isFinite(normalizedAmount)) return "0";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: Number.isInteger(normalizedAmount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(normalizedAmount);
}
