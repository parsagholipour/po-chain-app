import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { resyncOperatorWarningRow } from "@/lib/operator-warnings/scan";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const parsedId = paramsSchema.safeParse({ id });
  if (!parsedId.success) return jsonFromZod(parsedId.error);

  try {
    const result = await resyncOperatorWarningRow(storeId, parsedId.data.id);
    if (!result) return jsonError("Warning not found", 404);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[operator-warnings] row resync failed", {
      storeId,
      warningId: parsedId.data.id,
      error,
    });
    return jsonError("Warning resync failed", 500);
  }
}
