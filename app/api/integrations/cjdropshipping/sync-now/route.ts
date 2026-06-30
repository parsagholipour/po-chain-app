import { NextResponse } from "next/server";
import { jsonError } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { syncCjDropshippingIntegrationForStore } from "@/lib/cjdropshipping/sync";
import {
  createSyncEventStream,
  wantsSyncEventStream,
} from "@/lib/sync-event-stream";

export const runtime = "nodejs";

async function runManualCjDropshippingSync(storeId: string, startedAt: number) {
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
    return result;
  } catch (error) {
    console.error("[cjdropshipping-sync] manual sync route failed", {
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
      startedMessage: "CJdropshipping sync started",
      heartbeatMessage: "CJdropshipping sync still running",
      errorMessage: "CJdropshipping sync failed",
      run: ({ startedAt }) => runManualCjDropshippingSync(storeId, startedAt),
    });
  }

  const startedAt = Date.now();
  try {
    const result = await runManualCjDropshippingSync(storeId, startedAt);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "CJdropshipping sync failed",
      400,
    );
  }
}
