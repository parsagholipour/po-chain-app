import { NextResponse } from "next/server";
import { jsonError } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { syncCjDropshippingIntegrationForStore } from "@/lib/cjdropshipping/sync";

export const runtime = "nodejs";

export async function POST() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const startedAt = Date.now();

  console.info("[cjdropshipping-sync] manual sync route invoked", { storeId });

  try {
    const result = await syncCjDropshippingIntegrationForStore(storeId, "manual");
    console.info("[cjdropshipping-sync] manual sync route completed", {
      storeId,
      skipped: result.skipped,
      reason: result.reason,
      lockExpiresAt: result.lockExpiresAt,
      syncedSkuCount: result.syncedSkuCount,
      matchedSkuCount: result.matchedSkuCount,
      unmatchedCjSkuCount: result.unmatchedCjSkuCount,
      unmatchedLocalSkuCount: result.unmatchedLocalSkuCount,
      syncedProductCount: result.syncedProductCount,
      syncedInventoryCount: result.syncedInventoryCount,
      movementCount: result.movementCount,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cjdropshipping-sync] manual sync route failed", {
      storeId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(
      error instanceof Error ? error.message : "CJdropshipping sync failed",
      400,
    );
  }
}
