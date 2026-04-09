import imageSize from "image-size";

function dimensionsFromBuffer(buf: Buffer): { width: number; height: number } | null {
  try {
    const r = imageSize(new Uint8Array(buf));
    const w = r.width;
    const h = r.height;
    if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
      return { width: w, height: h };
    }
    const first = r.images?.[0];
    if (
      first &&
      typeof first.width === "number" &&
      typeof first.height === "number" &&
      first.width > 0 &&
      first.height > 0
    ) {
      return { width: first.width, height: first.height };
    }
  } catch {
    /* not a supported image or buffer too small */
  }
  return null;
}

/**
 * S3 object key stays bare; the value we persist in the app may append `?width=&height=` so the
 * UI can read pixel size without fetching the object.
 */
export function storageReferenceForUploadedObject(
  objectKey: string,
  contentType: string,
  buffer: Buffer,
): string {
  if (!contentType.startsWith("image/")) return objectKey;
  const dims = dimensionsFromBuffer(buffer);
  if (!dims) return objectKey;
  const params = new URLSearchParams({
    width: String(dims.width),
    height: String(dims.height),
  });
  return `${objectKey}?${params.toString()}`;
}
