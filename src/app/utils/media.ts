import { buildApiUrl } from "./api";

type MediaVariantOptions = {
  width?: number;
  quality?: number;
};

const USE_SERVER_MEDIA_TRANSFORM = String(import.meta.env.VITE_USE_MEDIA_TRANSFORM || "").trim().toLowerCase() === "true";
const CLOUDINARY_CLOUD_NAME = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "").trim();
const CLOUDINARY_FETCH_BASE_URL = String(import.meta.env.VITE_CLOUDINARY_FETCH_BASE_URL || "").trim();

function buildCloudinaryFetchUrl(uploadPath: string, options: MediaVariantOptions = {}): string | null {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_FETCH_BASE_URL) return null;
  const width = Math.max(120, Math.round(options.width || 1200));
  const quality = Math.max(35, Math.min(90, Math.round(options.quality || 72)));
  const base = CLOUDINARY_FETCH_BASE_URL.replace(/\/+$/, "");
  const originUrl = `${base}${uploadPath}`;
  const encodedOriginUrl = encodeURIComponent(originUrl);
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/f_auto,q_${quality},w_${width}/${encodedOriginUrl}`;
}

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
  if (value.startsWith("/api/uploads/")) return value.replace(/^\/api\/uploads\//, "/uploads/");

  const parsed = parseUrl(value);
  if (!parsed) return null;

  if (parsed.pathname.startsWith("/uploads/")) return parsed.pathname;
  if (parsed.pathname.startsWith("/api/uploads/")) return parsed.pathname.replace(/^\/api\/uploads\//, "/uploads/");
  return null;
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

  const uploadPath = extractUploadPath(value);
  if (uploadPath) {
    const cloudinaryUrl = buildCloudinaryFetchUrl(uploadPath, { width: 2000, quality: 82 });
    if (cloudinaryUrl) return cloudinaryUrl;
    return uploadPath;
  }

  const parsed = parseUrl(value);
  if (!parsed) return value;

  if (/\/api\/media$/i.test(parsed.pathname)) {
    const source = String(parsed.searchParams.get("src") || "").trim();
    if (source.startsWith("/uploads/")) {
      return source;
    }
    if (source.startsWith("/api/uploads/")) {
      return source.replace(/^\/api\/uploads\//, "/uploads/");
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
    const cloudinaryUrl = buildCloudinaryFetchUrl(uploadPath, { width, quality });
    if (cloudinaryUrl) return cloudinaryUrl;
    if (!USE_SERVER_MEDIA_TRANSFORM) {
      return uploadPath;
    }
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
