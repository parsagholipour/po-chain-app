import { NextResponse } from "next/server";
import { jsonError } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { checkShopifyIntegrationHealth } from "@/lib/shopify/health";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;

  try {
    return NextResponse.json(await checkShopifyIntegrationHealth(authz.context.storeId));
  } catch (error) {
    console.error("[shopify-health] check failed", error);
    return jsonError(
      error instanceof Error ? error.message : "Could not run the Shopify health checks",
      502,
    );
  }
}
