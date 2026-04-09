import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getObjectStorageConfig } from "@/lib/storage/config";
import { buildObjectKey, getPresignedPutUrl } from "@/lib/storage/file-storage";

export const runtime = "nodejs";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  prefix: z
    .string()
    .min(1)
    .max(200)
    .refine((p) => !p.includes("..") && !p.trim().startsWith("/"), "Invalid prefix")
    .optional(),
});

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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { filename, contentType, prefix: rawPrefix } = parsed.data;
  const prefix =
    rawPrefix !== undefined
      ? rawPrefix.trim().replace(/^\/+|\/+$/g, "") || undefined
      : undefined;
  const key = buildObjectKey(filename, prefix);

  let url: string;
  try {
    url = await getPresignedPutUrl(key, contentType);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create presigned URL";
    return NextResponse.json({ message }, { status: 502 });
  }

  return NextResponse.json({
    method: "PUT" as const,
    url,
    key,
    bucket: cfg.bucket,
    headers: {
      "Content-Type": contentType,
    },
    expiresInSeconds: cfg.presignExpiresSeconds,
  });
}
