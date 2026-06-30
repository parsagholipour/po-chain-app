import { NextResponse } from "next/server";
import { jsonError } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { syncShopifyIntegrationForStore } from "@/lib/shopify/sync";
import {
  createSyncEventStream,
  wantsSyncEventStream,
} from "@/lib/sync-event-stream";

export const runtime = "nodejs";

async function runManualShopifySync(storeId: string, startedAt: number) {
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
    return result;
  } catch (error) {
    console.error("[shopify-sync] manual sync route failed", {
      storeId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function POST(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  if (wantsSyncEventStream(request)) {
    return createSyncEventStream({
      startedMessage: "Shopify sync started",
      heartbeatMessage: "Shopify sync still running",
      errorMessage: "Shopify sync failed",
      run: ({ startedAt }) => runManualShopifySync(storeId, startedAt),
    });
  }

  const startedAt = Date.now();
  try {
    const result = await runManualShopifySync(storeId, startedAt);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Shopify sync failed",
      400,
    );
  }
}
