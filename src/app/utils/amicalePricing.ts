export const AMICALE_TTC_MULTIPLIER = 1.1;

function roundCurrency(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function applyAmicaleTtc(amount: number, enabled: boolean) {
  const normalizedAmount = Number(amount || 0);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return 0;
  return roundCurrency(enabled ? normalizedAmount * AMICALE_TTC_MULTIPLIER : normalizedAmount);
}

export function formatTnd(amount: number) {
  const normalizedAmount = Number(amount || 0);
  if (!Number.isFinite(normalizedAmount)) return "0";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: Number.isInteger(normalizedAmount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(normalizedAmount);
}
