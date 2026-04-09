import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getObjectStorageConfig } from "@/lib/storage/config";
import { getPresignedGetUrl } from "@/lib/storage/file-storage";

export const runtime = "nodejs";

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

  let url: string;
  try {
    url = await getPresignedGetUrl(key);
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
