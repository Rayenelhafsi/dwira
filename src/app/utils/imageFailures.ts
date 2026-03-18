const failedImageSources = new Set<string>();

function normalizeImageSource(value?: string | null): string {
  return String(value || "").trim();
}

export function hasFailedImageSource(value?: string | null): boolean {
  const normalized = normalizeImageSource(value);
  if (!normalized) return false;
  return failedImageSources.has(normalized);
}

export function markFailedImageSource(value?: string | null): void {
  const normalized = normalizeImageSource(value);
  if (!normalized) return;
  failedImageSources.add(normalized);
}
