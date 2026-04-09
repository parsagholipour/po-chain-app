/**
 * Stored image references may be `s3/object/key?width=W&height=H` so the UI can read
 * dimensions without decoding the file. S3 APIs must use {@link s3ObjectKeyFromStoredValue}.
 */
export function parseStoredImageReference(stored: string | null): {
  objectKey: string;
  width: number | null;
  height: number | null;
} {
  if (!stored) {
    return { objectKey: "", width: null, height: null };
  }
  const qIdx = stored.indexOf("?");
  const objectKey = qIdx === -1 ? stored : stored.slice(0, qIdx);
  if (qIdx === -1) {
    return { objectKey, width: null, height: null };
  }
  const rest = stored.slice(qIdx + 1);
  const hashIdx = rest.indexOf("#");
  const qs = hashIdx === -1 ? rest : rest.slice(0, hashIdx);
  const params = new URLSearchParams(qs);
  const w = params.get("width");
  const h = params.get("height");
  const width = w != null ? Number.parseInt(w, 10) : Number.NaN;
  const height = h != null ? Number.parseInt(h, 10) : Number.NaN;
  return {
    objectKey,
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
  };
}

export function s3ObjectKeyFromStoredValue(stored: string): string {
  return parseStoredImageReference(stored).objectKey;
}
