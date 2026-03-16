import { ImgHTMLAttributes, useEffect, useMemo, useState } from "react";
import { getOptimizedMediaUrl } from "../utils/media";

type SmartImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  quality?: number;
  targetWidth?: number;
  fetchPriority?: "high" | "low" | "auto";
};

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

  const [currentSrc, setCurrentSrc] = useState(optimizedSrc);

  useEffect(() => {
    setCurrentSrc(optimizedSrc);
  }, [optimizedSrc]);

  return (
    <img
      {...rest}
      {...(fetchPriority ? ({ fetchpriority: fetchPriority } as Record<string, string>) : {})}
      src={currentSrc || originalSrc}
      onLoad={(event) => {
        onLoad?.(event);
      }}
      onError={(event) => {
        if (currentSrc && currentSrc !== originalSrc) {
          setCurrentSrc(originalSrc);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
