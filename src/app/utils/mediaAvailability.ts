const availabilityCache = new Map<string, boolean>();
const pendingChecks = new Map<string, Promise<boolean>>();

function normalizeUrl(value?: string | null): string {
  return String(value || "").trim();
}

function isUploadsUrl(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("/uploads/")) return true;
  try {
    const parsed = new URL(value);
    return parsed.pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}

async function probeUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", credentials: "same-origin" });
    if (response.ok) return true;
    if (response.status !== 405) return false;
  } catch {
    // HEAD may fail on some setups; fallback to GET below.
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Range: "bytes=0-0" },
    });
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}

export async function checkUploadsMediaAvailable(url?: string | null): Promise<boolean> {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  if (!isUploadsUrl(normalized)) return true;

  if (availabilityCache.has(normalized)) {
    return availabilityCache.get(normalized) === true;
  }
  if (pendingChecks.has(normalized)) {
    return pendingChecks.get(normalized);
  }

  const pending = probeUrl(normalized)
    .then((ok) => {
      availabilityCache.set(normalized, ok);
      pendingChecks.delete(normalized);
      return ok;
    })
    .catch(() => {
      availabilityCache.set(normalized, false);
      pendingChecks.delete(normalized);
      return false;
    });

  pendingChecks.set(normalized, pending);
  return pending;
}
