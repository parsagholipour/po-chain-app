import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getObjectStorageConfig } from "@/lib/storage/config";
import { getPresignedGetUrl } from "@/lib/storage/file-storage";
import { s3ObjectKeyFromStoredValue } from "@/lib/storage/storage-key";

export const runtime = "nodejs";

function sanitizeDownloadFilename(value: string) {
  const base = value.replace(/^.*[/\\]/, "").replace(/[\0\r\n]/g, "");
  const cleaned = base
    .replace(/[^a-zA-Z0-9._ -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned.length > 0 ? cleaned : "download";
}

function downloadFilenameFromStorageKey(key: string) {
  const objectKey = s3ObjectKeyFromStoredValue(key);
  return objectKey.split("/").filter(Boolean).pop() ?? "download";
}

function attachmentContentDisposition(filename: string) {
  const safe = sanitizeDownloadFilename(filename);
  const quoted = safe.replace(/(["\\])/g, "\\$1");

  return `attachment; filename="${quoted}"`;
}

/** Returns a short-lived read URL, or redirects when `redirect=1`. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    getObjectStorageConfig();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Storage is not configured";
    return NextResponse.json({ message }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key || key.length === 0) {
    return NextResponse.json({ message: "Missing query param: key" }, { status: 400 });
  }

  const responseContentDisposition =
    searchParams.get("download") === "1"
      ? attachmentContentDisposition(
          searchParams.get("filename") ?? downloadFilenameFromStorageKey(key),
        )
      : undefined;

  let url: string;
  try {
    url = await getPresignedGetUrl(key, undefined, {
      responseContentDisposition,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create URL";
    return NextResponse.json({ message }, { status: 502 });
  }

  if (searchParams.get("redirect") === "1") {
    return NextResponse.redirect(url);
  }

  const cfg = getObjectStorageConfig();
  return NextResponse.json({
    url,
    expiresInSeconds: cfg.presignExpiresSeconds,
  });
}
