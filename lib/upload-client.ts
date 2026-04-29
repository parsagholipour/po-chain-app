export { parseStoredImageReference } from "@/lib/storage/storage-key";

/**
 * Browser upload via multipart API. The API returns `key` with `?width=&height=` for raster images
 * (dimensions detected server-side) — that string is what you should persist.
 */
export async function uploadFileToStorage(file: File, prefix: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("prefix", prefix);

  const res = await fetch("/api/storage/upload", {
    method: "POST",
    body: form,
    credentials: "include",
  });

  const data = (await res.json().catch(() => ({}))) as { message?: string; key?: string };
  if (!res.ok) {
    throw new Error(data.message ?? `Upload failed (${res.status})`);
  }
  if (!data.key) {
    throw new Error("Upload response missing key");
  }
  return data.key;
}

export async function presignedFileUrl(key: string): Promise<string> {
  const res = await fetch(`/api/storage/url?key=${encodeURIComponent(key)}`, {
    credentials: "include",
  });
  const data = (await res.json()) as { message?: string; url?: string };
  if (!res.ok) throw new Error(data.message ?? "Could not get file URL");
  if (!data.url) throw new Error("Missing url");
  return data.url;
}

export function storageImagePreviewUrl(
  key: string,
  options: { width?: number; quality?: number } = {},
): string {
  const params = new URLSearchParams({ key });
  if (typeof options.width === "number" && Number.isFinite(options.width)) {
    params.set("width", String(Math.round(options.width)));
  }
  if (typeof options.quality === "number" && Number.isFinite(options.quality)) {
    params.set("quality", String(Math.round(options.quality)));
  }
  return `/api/storage/image?${params.toString()}`;
}
