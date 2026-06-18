export function applyPartnerAgencyMargin(amount: number, multiplier?: number | null) {
  const normalizedAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const normalizedMultiplier = Number.isFinite(Number(multiplier)) && Number(multiplier) > 0 ? Number(multiplier) : 1;
  return Math.round(normalizedAmount * normalizedMultiplier * 100) / 100;
}
