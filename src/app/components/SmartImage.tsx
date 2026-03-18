import { ImgHTMLAttributes, useEffect, useMemo, useState } from "react";
import { getOptimizedMediaUrl } from "../utils/media";
import { hasFailedImageSource, markFailedImageSource } from "../utils/imageFailures";

type SmartImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  quality?: number;
  targetWidth?: number;
  fetchPriority?: "high" | "low" | "auto";
};

const FALLBACK_IMAGE_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23e5e7eb'/%3E%3Cpath d='M170 240l92-90 64 64 54-54 90 80H170z' fill='%23cbd5e1'/%3E%3Ccircle cx='250' cy='126' r='30' fill='%23cbd5e1'/%3E%3C/svg%3E";

function getNextImageSource(optimized: string, original: string): string {
  if (optimized && !hasFailedImageSource(optimized)) return optimized;
  if (original && !hasFailedImageSource(original)) return original;
  return FALLBACK_IMAGE_DATA_URI;
}

export function SmartImage({
  src,
  quality = 72,
  targetWidth,
  fetchPriority,
  onError,
  onLoad,
  ...rest
}: SmartImageProps) {
  const originalSrc = String(src || "").trim();
  const optimizedSrc = useMemo(() => {
    if (!originalSrc) return "";
    if (!targetWidth) return originalSrc;
    return getOptimizedMediaUrl(originalSrc, { width: targetWidth, quality });
  }, [originalSrc, quality, targetWidth]);

  const [currentSrc, setCurrentSrc] = useState(() => getNextImageSource(optimizedSrc, originalSrc));

  useEffect(() => {
    setCurrentSrc(getNextImageSource(optimizedSrc, originalSrc));
  }, [optimizedSrc, originalSrc]);

  return (
    <img
      {...rest}
      {...(fetchPriority ? ({ fetchpriority: fetchPriority } as Record<string, string>) : {})}
      src={currentSrc || FALLBACK_IMAGE_DATA_URI}
      onLoad={(event) => {
        onLoad?.(event);
      }}
      onError={(event) => {
        if (currentSrc) {
          markFailedImageSource(currentSrc);
        }
        if (currentSrc && currentSrc !== originalSrc && originalSrc && !hasFailedImageSource(originalSrc)) {
          setCurrentSrc(originalSrc);
          return;
        }
        setCurrentSrc(FALLBACK_IMAGE_DATA_URI);
        onError?.(event);
      }}
    />
  );
}
