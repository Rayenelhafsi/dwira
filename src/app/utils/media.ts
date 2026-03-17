import { buildApiUrl } from "./api";

type MediaVariantOptions = {
  width?: number;
  quality?: number;
};

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function extractUploadPath(url: string): string | null {
  const value = String(url || "").trim();
  if (!value) return null;

  if (value.startsWith("/uploads/")) return value;

  const parsed = parseUrl(value);
  if (!parsed) return null;

  return parsed.pathname.startsWith("/uploads/") ? parsed.pathname : null;
}

function optimizeUnsplashUrl(url: string, width: number, quality: number): string {
  const parsed = parseUrl(url);
  if (!parsed) return url;

  parsed.searchParams.set("auto", "format");
  parsed.searchParams.set("fit", "max");
  parsed.searchParams.set("w", String(width));
  parsed.searchParams.set("q", String(quality));
  return parsed.toString();
}

export function getOriginalMediaUrl(url?: string | null): string {
  const value = String(url || "").trim();
  if (!value) return "";

  const parsed = parseUrl(value);
  if (!parsed) return value;

  if (/\/api\/media$/i.test(parsed.pathname)) {
    const source = String(parsed.searchParams.get("src") || "").trim();
    if (source.startsWith("/uploads/")) {
      return buildApiUrl(source);
    }
  }

  if (/images\.unsplash\.com/i.test(parsed.hostname)) {
    // Keep the original asset URL and remove explicit downscaling/compression params.
    parsed.searchParams.delete("w");
    parsed.searchParams.delete("q");
    parsed.searchParams.delete("dpr");
    parsed.searchParams.delete("fit");
    parsed.searchParams.delete("crop");
    return parsed.toString();
  }

  return value;
}

export function getOptimizedMediaUrl(url?: string | null, options: MediaVariantOptions = {}): string {
  const value = String(url || "").trim();
  if (!value) return "";

  const width = Math.max(120, Math.round(options.width || 1200));
  const quality = Math.max(35, Math.min(90, Math.round(options.quality || 72)));
  const uploadPath = extractUploadPath(value);

  if (uploadPath) {
    const query = new URLSearchParams({
      src: uploadPath,
      w: String(width),
      q: String(quality),
    });
    return buildApiUrl(`/media?${query.toString()}`);
  }

  if (/images\.unsplash\.com/i.test(value)) {
    return optimizeUnsplashUrl(value, width, quality);
  }

  return value;
}
