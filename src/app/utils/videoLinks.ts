export type VideoProvider = "youtube" | "facebook" | "cloudflare";

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

function isCloudflareStreamHost(hostname: string): boolean {
  const host = String(hostname || "").trim().toLowerCase();
  return host === "iframe.videodelivery.net" || host.endsWith(".cloudflarestream.com");
}

function extractCloudflareStreamUid(input?: string | null): string | null {
  const parsed = safeParseUrl(input);
  if (!parsed || !isCloudflareStreamHost(parsed.hostname)) return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  return String(segments[0] || "").trim() || null;
}

export function isCloudflareStreamUrl(input?: string | null): boolean {
  return extractCloudflareStreamUid(input) !== null;
}

export function toCloudflareStreamEmbedUrl(input?: string | null): string | null {
  const parsed = safeParseUrl(input);
  if (!parsed || !isCloudflareStreamHost(parsed.hostname)) return null;
  if (parsed.hostname.toLowerCase() === "iframe.videodelivery.net") {
    const uid = extractCloudflareStreamUid(input);
    return uid ? `https://iframe.videodelivery.net/${uid}` : null;
  }
  const uid = extractCloudflareStreamUid(input);
  if (!uid) return null;
  return `${parsed.protocol}//${parsed.hostname}/${uid}/iframe`;
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
  if (path === "/plugins/video.php") {
    const nestedHref = extractNestedFacebookHref(parsed);
    if (!nestedHref) return false;
    return isFacebookVideoUrl(nestedHref);
  }
  if (path.startsWith("/share/")) {
    const nestedHref = extractNestedFacebookHref(parsed);
    if (!nestedHref) return false;
    return isFacebookVideoUrl(nestedHref);
  }
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
  const href = normalizeFacebookHrefForEmbed(rawValue);
  const isReel = isFacebookReelUrl(rawValue);
  const params = new URLSearchParams();
  params.set("href", href);
  params.set("show_text", "false");
  params.set("width", isReel ? "315" : "560");
  params.set("height", isReel ? "560" : "315");
  params.set("autoplay", "false");
  return `https://www.facebook.com/plugins/video.php?${params.toString()}`;
}

function unwrapFacebookPluginHref(input?: string | null): string {
  const rawValue = extractIframeSrc(input);
  const parsed = safeParseUrl(rawValue);
  if (!parsed) return rawValue;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (!(host === "facebook.com" || host.endsWith(".facebook.com"))) return rawValue;
  if (path !== "/plugins/video.php") return rawValue;
  const nestedHref = String(parsed.searchParams.get("href") || "").trim();
  return nestedHref || rawValue;
}

function isLikelyUnsupportedFacebookPath(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (!(host === "facebook.com" || host.endsWith(".facebook.com"))) return false;
  if (path.startsWith("/share/")) return true;
  return false;
}

function extractFacebookVideoId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (host === "fb.watch" || host.endsWith(".fb.watch")) {
    const watchId = segments[0] || "";
    return watchId || null;
  }
  if (!(host === "facebook.com" || host.endsWith(".facebook.com"))) return null;
  if (path === "/watch" || path === "/watch/" || path === "/video.php") {
    const id = String(parsed.searchParams.get("v") || "").trim();
    return id || null;
  }
  if (path.startsWith("/reel/")) {
    const id = String(segments[1] || "").trim();
    return id || null;
  }
  const videosIdx = segments.findIndex((segment) => segment.toLowerCase() === "videos");
  if (videosIdx >= 0) {
    const id = String(segments[videosIdx + 1] || "").trim();
    return id || null;
  }
  return null;
}

function extractNestedFacebookHref(parsed: URL): string {
  const nested = String(parsed.searchParams.get("u") || parsed.searchParams.get("href") || "").trim();
  if (!nested) return "";
  try {
    return decodeURIComponent(nested);
  } catch {
    return nested;
  }
}

function normalizeFacebookHrefForEmbed(input?: string | null): string {
  const rawValue = unwrapFacebookPluginHref(input);
  const parsed = safeParseUrl(rawValue);
  if (!parsed) return rawValue;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if ((host === "facebook.com" || host.endsWith(".facebook.com")) && path.startsWith("/share/")) {
    const nestedHref = extractNestedFacebookHref(parsed);
    if (nestedHref) {
      return normalizeFacebookHrefForEmbed(nestedHref);
    }
  }
  const id = extractFacebookVideoId(parsed);
  if (id) return `https://www.facebook.com/watch/?v=${encodeURIComponent(id)}`;
  return rawValue;
}

export function getVideoProvider(input?: string | null): VideoProvider | null {
  if (isYouTubeUrl(input)) return "youtube";
  if (isFacebookVideoUrl(input)) return "facebook";
  if (isCloudflareStreamUrl(input)) return "cloudflare";
  return null;
}

export function isSupportedVideoUrl(input?: string | null): boolean {
  return getVideoProvider(input) !== null;
}

export function toVideoEmbedUrl(input?: string | null): string | null {
  const provider = getVideoProvider(input);
  if (provider === "youtube") return toYouTubeEmbedUrl(input);
  if (provider === "facebook") return toFacebookEmbedUrl(input);
  if (provider === "cloudflare") return toCloudflareStreamEmbedUrl(input);
  return null;
}

export function isVerticalVideoUrl(input?: string | null): boolean {
  // Keep only YouTube Shorts in vertical mode.
  // Facebook reels are rendered in standard player width to avoid tiny embeds.
  return isYouTubeShortUrl(input);
}

export function isLikelyUnsupportedFacebookEmbed(input?: string | null): boolean {
  const rawValue = unwrapFacebookPluginHref(input);
  const normalized = normalizeFacebookHrefForEmbed(rawValue);
  if (!isFacebookVideoUrl(normalized)) return false;
  const parsed = safeParseUrl(normalized);
  if (!parsed) return false;
  return isLikelyUnsupportedFacebookPath(parsed);
}

export function canRenderVideoInIframe(input?: string | null): boolean {
  const provider = getVideoProvider(input);
  if (!provider) return false;
  return true;
}

export function toVideoExternalUrl(input?: string | null): string | null {
  const provider = getVideoProvider(input);
  if (!provider) return null;
  if (provider === "youtube") {
    const videoId = extractYouTubeVideoId(input);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
  }
  if (provider === "cloudflare") {
    return toCloudflareStreamEmbedUrl(input);
  }
  return normalizeFacebookHrefForEmbed(unwrapFacebookPluginHref(input));
}
