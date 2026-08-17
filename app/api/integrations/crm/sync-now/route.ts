import { NextResponse } from "next/server";
import { jsonError } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { syncCrmIntegrationForStore } from "@/lib/crm/sync";
import {
  createSyncEventStream,
  wantsSyncEventStream,
} from "@/lib/sync-event-stream";

export const runtime = "nodejs";

async function runManualCrmSync(storeId: string) {
  return syncCrmIntegrationForStore(storeId, "manual", { mode: "full" });
}

export async function POST(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  if (wantsSyncEventStream(request)) {
    return createSyncEventStream({
      startedMessage: "CRM sync started",
      heartbeatMessage: "CRM sync still running",
      errorMessage: "CRM sync failed",
      run: () => runManualCrmSync(storeId),
    });
  }

  try {
    const result = await runManualCrmSync(storeId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "CRM sync failed",
      400,
    );
  }
}
