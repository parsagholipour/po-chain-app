import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicApiError, requireApiToken } from "@/lib/api-tokens";
import { publicProductInclude, serializePublicProduct } from "@/lib/public-api/product";

export const runtime = "nodejs";

/** `id` accepts a product UUID or `sku:<sku>` so partners can use their own keys. */
const SKU_LOOKUP_PREFIX = "sku:";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireApiToken(request, "products:read");
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const identifier = decodeURIComponent(id);

  let where;
  if (identifier.toLowerCase().startsWith(SKU_LOOKUP_PREFIX)) {
    const sku = identifier.slice(SKU_LOOKUP_PREFIX.length).trim();
    if (!sku) {
      return publicApiError("invalid_request", "SKU lookup value is empty.", 400);
    }
    where = { storeId, sku };
  } else {
    const parsed = z.uuid().safeParse(identifier);
    if (!parsed.success) {
      return publicApiError(
        "invalid_request",
        'Product identifier must be a UUID or "sku:<sku>".',
        400,
      );
    }
    where = { storeId, id: parsed.data };
  }

  const row = await prisma.product.findFirst({ where, include: publicProductInclude });
  if (!row) return publicApiError("not_found", "Product not found.", 404);

  return NextResponse.json({ data: serializePublicProduct(row) });
}
