import { NextResponse } from "next/server";
import { jsonError } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { syncShopifyIntegrationForStore } from "@/lib/shopify/sync";

export const runtime = "nodejs";

export async function POST() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const startedAt = Date.now();

  console.info("[shopify-sync] manual sync route invoked", { storeId });

  try {
    const result = await syncShopifyIntegrationForStore(storeId, "manual");
    console.info("[shopify-sync] manual sync route completed", {
      storeId,
      skipped: result.skipped,
      reason: result.reason,
      lockExpiresAt: result.lockExpiresAt,
      syncedProductCount: result.syncedProductCount,
      matchedSkuCount: result.matchedSkuCount,
      unmatchedLocalSkuCount: result.unmatchedLocalSkuCount,
      syncedLocationCount: result.syncedLocationCount,
      syncedInventoryCount: result.syncedInventoryCount,
      movementCount: result.movementCount,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[shopify-sync] manual sync route failed", {
      storeId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(
      error instanceof Error ? error.message : "Shopify sync failed",
      400,
    );
  }
}
