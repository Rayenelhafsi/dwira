export type VideoProvider = "youtube" | "facebook";

function extractIframeSrc(input?: string | null): string {
  const value = String(input || "").trim();
  if (!value) return "";
  const iframeSrcMatch = value.match(/<iframe[^>]*\s+src=["']([^"']+)["']/i);
  return String(iframeSrcMatch?.[1] || value).trim();
}

function safeParseUrl(input?: string | null): URL | null {
  const value = extractIframeSrc(input);
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function extractYouTubeVideoId(input?: string | null): string | null {
  const value = extractIframeSrc(input);
  if (!value) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&?#/]+)/i,
    /(?:youtu\.be\/)([^&?#/]+)/i,
    /(?:youtube\.com\/embed\/)([^&?#/]+)/i,
    /(?:youtube\.com\/shorts\/)([^&?#/]+)/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  return /^[a-zA-Z0-9_-]{11}$/.test(value) ? value : null;
}

export function isYouTubeUrl(input?: string | null): boolean {
  return extractYouTubeVideoId(input) !== null;
}

export function isYouTubeShortUrl(input?: string | null): boolean {
  return /youtube\.com\/shorts\//i.test(extractIframeSrc(input));
}

export function toYouTubeEmbedUrl(input?: string | null): string | null {
  const videoId = extractYouTubeVideoId(input);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

export function toYouTubeThumbnailUrl(input?: string | null): string | null {
  const videoId = extractYouTubeVideoId(input);
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
}

export function isFacebookVideoUrl(input?: string | null): boolean {
  const rawValue = extractIframeSrc(input);
  if (!rawValue) return false;
  const parsed = safeParseUrl(rawValue);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (host === "fb.watch" || host.endsWith(".fb.watch")) return true;
  if (!(host === "facebook.com" || host.endsWith(".facebook.com"))) return false;
  if (path.startsWith("/share/")) return true;
  if (path.startsWith("/reel/")) return true;
  if (path.includes("/videos/")) return true;
  if (path === "/watch" || path === "/watch/") return Boolean(parsed.searchParams.get("v"));
  if (path === "/video.php") return Boolean(parsed.searchParams.get("v"));
  return false;
}

export function isFacebookReelUrl(input?: string | null): boolean {
  const parsed = safeParseUrl(input);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (!(host === "facebook.com" || host.endsWith(".facebook.com"))) return false;
  return parsed.pathname.toLowerCase().startsWith("/reel/");
}

export function toFacebookEmbedUrl(input?: string | null): string | null {
  const rawValue = extractIframeSrc(input);
  if (!isFacebookVideoUrl(rawValue)) return null;
  let href = rawValue;
  const parsed = safeParseUrl(rawValue);
  if (parsed) {
    const host = parsed.hostname.toLowerCase();
    if (host === "fb.watch" || host.endsWith(".fb.watch")) {
      const watchId = parsed.pathname.split("/").filter(Boolean)[0] || "";
      if (watchId) href = `https://www.facebook.com/watch/?v=${encodeURIComponent(watchId)}`;
    }
  }
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false`;
}

export function getVideoProvider(input?: string | null): VideoProvider | null {
  if (isYouTubeUrl(input)) return "youtube";
  if (isFacebookVideoUrl(input)) return "facebook";
  return null;
}

export function isSupportedVideoUrl(input?: string | null): boolean {
  return getVideoProvider(input) !== null;
}

export function toVideoEmbedUrl(input?: string | null): string | null {
  const provider = getVideoProvider(input);
  if (provider === "youtube") return toYouTubeEmbedUrl(input);
  if (provider === "facebook") return toFacebookEmbedUrl(input);
  return null;
}

export function isVerticalVideoUrl(input?: string | null): boolean {
  return isYouTubeShortUrl(input) || isFacebookReelUrl(input);
}
