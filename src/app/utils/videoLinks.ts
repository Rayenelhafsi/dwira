export function extractYouTubeVideoId(input?: string | null): string | null {
  const value = String(input || "").trim();
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

export function toYouTubeEmbedUrl(input?: string | null): string | null {
  const videoId = extractYouTubeVideoId(input);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

export function toYouTubeThumbnailUrl(input?: string | null): string | null {
  const videoId = extractYouTubeVideoId(input);
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
}
