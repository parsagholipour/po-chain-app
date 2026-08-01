import "server-only";

import { prisma } from "@/lib/prisma";
import { publicProductInclude, serializePublicProduct } from "@/lib/public-api/product";
import { enqueueWebhookEvent } from "@/lib/webhooks/delivery";

/**
 * Emits a product lifecycle event. Never throws: a webhook problem must not
 * turn a successful product write into a failed API response.
 */
export async function emitProductEvent({
  storeId,
  productId,
  event,
}: {
  storeId: string;
  productId: string;
  event: "product.created" | "product.updated";
}) {
  try {
    const row = await prisma.product.findFirst({
      where: { id: productId, storeId },
      include: publicProductInclude,
    });
    if (!row) return;

    await enqueueWebhookEvent({
      storeId,
      event,
      data: serializePublicProduct(row),
    });
  } catch (error) {
    console.error("[webhooks] could not emit product event", { event, productId }, error);
  }
}

/** Deleted products no longer exist, so the payload carries identifiers only. */
export async function emitProductDeletedEvent({
  storeId,
  product,
}: {
  storeId: string;
  product: { id: string; sku: string; name: string };
}) {
  try {
    await enqueueWebhookEvent({
      storeId,
      event: "product.deleted",
      data: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        deletedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[webhooks] could not emit product.deleted", product.id, error);
  }
}
