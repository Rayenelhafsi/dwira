import { buildApiUrl } from "./api";
import { getOriginalMediaUrl, resolveMediaUrl } from "./media";

type CreatePropertyShareLinkInput = {
  relativeUrl: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
};

type PropertyShareLinkResponse = {
  shortUrl?: string;
};

function toAbsoluteUrl(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw || typeof window === "undefined") return "";
  try {
    return new URL(raw, window.location.origin).toString();
  } catch {
    return "";
  }
}

export function buildPropertyShareImageUrl(imageUrl?: string | null): string {
  const resolved = getOriginalMediaUrl(resolveMediaUrl(imageUrl));
  return toAbsoluteUrl(resolved);
}

export async function createPropertyShareLink(input: CreatePropertyShareLinkInput): Promise<string> {
  const fallbackUrl = toAbsoluteUrl(input.relativeUrl);
  try {
    const response = await fetch(buildApiUrl("/property-share-links"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        relativeUrl: input.relativeUrl,
        title: input.title,
        description: input.description || "",
        imageUrl: input.imageUrl || "",
      }),
    });
    const payload = (await response.json().catch(() => null)) as PropertyShareLinkResponse | null;
    if (response.ok && payload?.shortUrl) {
      return String(payload.shortUrl).trim();
    }
  } catch {
    // Fall back to the full URL when the short-link service is unavailable.
  }
  return fallbackUrl;
}
