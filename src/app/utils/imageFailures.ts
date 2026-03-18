const FAILED_TTL_MS = 60_000;
const MAX_TRACKED_FAILURES = 500;
const failedImageSources = new Map<string, number>();

function normalizeImageSource(value?: string | null): string {
  return String(value || "").trim();
}

export function hasFailedImageSource(value?: string | null): boolean {
  const normalized = normalizeImageSource(value);
  if (!normalized) return false;
  const failedAt = failedImageSources.get(normalized);
  if (!failedAt) return false;
  if (Date.now() - failedAt > FAILED_TTL_MS) {
    failedImageSources.delete(normalized);
    return false;
  }
  return true;
}

export function markFailedImageSource(value?: string | null): void {
  const normalized = normalizeImageSource(value);
  if (!normalized) return;
  failedImageSources.set(normalized, Date.now());
  if (failedImageSources.size <= MAX_TRACKED_FAILURES) return;
  const overflow = failedImageSources.size - MAX_TRACKED_FAILURES;
  let deleted = 0;
  for (const key of failedImageSources.keys()) {
    failedImageSources.delete(key);
    deleted += 1;
    if (deleted >= overflow) break;
  }
}

export function clearFailedImageSource(value?: string | null): void {
  const normalized = normalizeImageSource(value);
  if (!normalized) return;
  failedImageSources.delete(normalized);
}
