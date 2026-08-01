import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/api-tokens";

export const runtime = "nodejs";

/** Cheap credential check: confirms a token is live and shows what it can reach. */
export async function GET(request: Request) {
  const authz = await requireApiToken(request, "products:read");
  if (!authz.ok) return authz.response;
  const { tokenId, storeId, storeName, storeSlug, scopes } = authz.context;

  return NextResponse.json({
    data: {
      tokenId,
      scopes,
      store: { id: storeId, name: storeName, slug: storeSlug },
    },
  });
}
