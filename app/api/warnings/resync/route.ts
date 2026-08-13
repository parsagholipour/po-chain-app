import { NextResponse } from "next/server";
import { jsonError } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { scanStoreWarnings } from "@/lib/operator-warnings/scan";

export const runtime = "nodejs";

export async function POST() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  try {
    const result = await scanStoreWarnings(storeId);
    if (result.skipped) {
      return jsonError(result.reason ?? "A warnings scan is already running", 409);
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[operator-warnings] manual resync failed", { storeId, error });
    return jsonError("Warnings scan failed", 500);
  }
}
