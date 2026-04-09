import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getObjectStorageConfig } from "@/lib/storage/config";
import { storageReferenceForUploadedObject } from "@/lib/storage/image-upload-reference";
import { buildObjectKey, putObject } from "@/lib/storage/file-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let cfg;
  try {
    cfg = getObjectStorageConfig();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Storage is not configured";
    return NextResponse.json({ message }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ message: "Invalid multipart body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'Expected form field "file" (File)' }, { status: 400 });
  }

  const prefixRaw = form.get("prefix");
  let prefix: string | undefined;
  if (typeof prefixRaw === "string" && prefixRaw.trim().length > 0) {
    const t = prefixRaw.trim().replace(/^\/+|\/+$/g, "");
    if (t.includes("..") || t.length > 200) {
      return NextResponse.json({ message: "Invalid prefix" }, { status: 400 });
    }
    prefix = t;
  }

  if (file.size > cfg.maxUploadBytes) {
    return NextResponse.json(
      { message: `File too large (max ${cfg.maxUploadBytes} bytes)` },
      { status: 413 },
    );
  }

  const contentType = file.type && file.type.length > 0 ? file.type : "application/octet-stream";
  const key = buildObjectKey(file.name, prefix);
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    await putObject({ key, body: buf, contentType });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ message }, { status: 502 });
  }

  const storedReference = storageReferenceForUploadedObject(key, contentType, buf);

  return NextResponse.json({
    bucket: cfg.bucket,
    /** Bare S3 key (for deletes / server tools). */
    objectKey: key,
    /** Value to store in the app (may include `?width=&height=` for images). */
    key: storedReference,
    contentType,
    size: file.size,
    originalName: file.name,
  });
}
