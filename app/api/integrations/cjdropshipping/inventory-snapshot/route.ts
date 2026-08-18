import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import {
  buildCjInventorySnapshotCsv,
  InventorySnapshotDateError,
} from "@/lib/cjdropshipping/inventory-snapshot";
import { requireInternalStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const querySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  warehouseId: z.string().trim().max(120).optional(),
});

export async function GET(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const searchParams = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const snapshot = await buildCjInventorySnapshotCsv({
      storeId,
      dateKey: parsed.data.date,
      warehouseId: parsed.data.warehouseId || undefined,
    });

    return new NextResponse(snapshot.body, {
      headers: {
        "Content-Type": snapshot.contentType,
        "Content-Disposition": `attachment; filename="${snapshot.fileName}"`,
        "X-Row-Count": String(snapshot.rowCount),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof InventorySnapshotDateError) {
      return jsonError(error.message, 400);
    }
    throw error;
  }
}
