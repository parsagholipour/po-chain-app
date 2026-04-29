"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { parseStoredImageReference } from "@/lib/storage/storage-key";
import { storageImagePreviewUrl } from "@/lib/upload-client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type StorageObjectImageProps = {
  /** Stored upload reference (may include `?width=&height=` for aspect ratio). */
  reference: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** Shown when there is no reference, or inside the frame if presign fails (loading uses a skeleton). */
  fallback?: ReactNode;
  /** CSS `aspect-ratio` when width/height are missing on the reference (default `1 / 1`). */
  aspectFallback?: string;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  /** Pixel width requested from the optimized preview endpoint. */
  previewWidth?: number;
  previewQuality?: number;
};

const fitClass: Record<NonNullable<StorageObjectImageProps["objectFit"]>, string> = {
  contain: "object-contain",
  cover: "object-cover",
  fill: "object-fill",
  none: "object-none",
  "scale-down": "object-scale-down",
};

/**
 * Resolves a private storage reference to a presigned URL. Aspect ratio comes from the reference
 * string immediately (query params); the shell is rendered on the first paint while the URL loads.
 */
export function StorageObjectImage({
  reference,
  alt = "",
  className,
  imgClassName,
  fallback,
  aspectFallback = "1 / 1",
  objectFit = "contain",
  previewWidth = 384,
  previewQuality = 72,
}: StorageObjectImageProps) {
  const { objectKey, width, height } = parseStoredImageReference(reference);
  const hasDims =
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0;

  const boxStyle: CSSProperties = hasDims
    ? { aspectRatio: `${width} / ${height}` }
    : { aspectRatio: aspectFallback };

  const url = objectKey
    ? storageImagePreviewUrl(reference ?? objectKey, {
        width: previewWidth,
        quality: previewQuality,
      })
    : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = url !== null && failedUrl === url;

  if (!objectKey) {
    if (fallback !== undefined) return <>{fallback}</>;
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-md ring-1 ring-border", className)}
      style={boxStyle}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute inset-0 size-full",
            fitClass[objectFit],
            imgClassName,
          )}
          onError={() => setFailedUrl(url)}
        />
      ) : failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 text-muted-foreground text-xs">
          {fallback !== undefined ? fallback : "—"}
        </div>
      ) : (
        <Skeleton className="absolute inset-0 size-full rounded-none" aria-hidden />
      )}
    </div>
  );
}
