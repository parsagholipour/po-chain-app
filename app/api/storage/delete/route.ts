import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getObjectStorageConfig } from "@/lib/storage/config";
import { deleteObject } from "@/lib/storage/file-storage";

export const runtime = "nodejs";

const bodySchema = z.object({
  key: z.string().min(1).max(2048),
});

export async function POST(request: Request) {
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

  try {
    await deleteObject(parsed.data.key);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
