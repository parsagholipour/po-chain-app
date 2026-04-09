import { parseStoredImageReference } from "@/lib/storage/storage-key";

export function storageObjectDisplayName(reference: string | null): string | null {
  if (!reference) return null;
  const { objectKey } = parseStoredImageReference(reference);
  const last = objectKey.split("/").filter(Boolean).pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
