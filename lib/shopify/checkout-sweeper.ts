import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { moneyToCents } from "@/lib/distributor-orders/money";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";
import { SHOPIFY_PROVIDER } from "@/lib/payments/providers";
import { prisma } from "@/lib/prisma";
import {
  deleteShopifyDraftOrder,
  escapeSearchValue,
  findShopifyDraftOrders,
  readShopifyDraftOrder,
  type ShopifyDraftOrder,
} from "@/lib/shopify/admin";
import { shopifyInvoiceTag } from "@/lib/shopify/checkout";
import { applyShopifyOrderPaid } from "@/lib/shopify/checkout-finalize";
import { decryptShopifySecret } from "@/lib/shopify/encryption";

const LOG_PREFIX = "[shopify-checkout-sweep]";
const DEFAULT_TTL_MINUTES = 1440;
const SWEEP_BATCH_SIZE = 200;

/**
 * Statuses a Shopify checkout can be stranded in. `created` and `failed` hold the orphans:
 * `providerSessionId` is written in the same transaction that promotes an attempt to
 * `pending`, so a pending attempt always has one and only these states can carry a draft
 * order this app never recorded.
 */
const SWEEPABLE_STATUSES = ["pending", "created", "failed"] as const;

/**
 * Completing a draft order does NOT mean money moved: bank deposit, cash on delivery and
 * "payment due later" all produce a COMPLETED draft whose order is unpaid. Conversion must
 * gate on the order's own financial status, exactly as the webhook does.
 */
const PAID_ORDER_FINANCIAL_STATUSES = new Set(["PAID", "PARTIALLY_REFUNDED"]);

type SweepCredentials = {
  shopDomain: string;
  accessToken: string;
};

type SweepAttempt = {
  id: string;
  storeId: string;
  invoiceId: string;
  status: string;
  amount: Prisma.Decimal;
  currency: string;
  providerMetadata: Prisma.JsonValue | null;
  providerSessionId: string | null;
  correlationToken: string | null;
  invoice: { invoiceNumber: string };
};

export type ShopifyCheckoutSweepSummary = {
  scanned: number;
  recovered: number;
  expired: number;
  failed: number;
};

export function checkoutTtlMinutes() {
  const configured = Number.parseInt(process.env.SHOPIFY_CHECKOUT_TTL_MINUTES ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_MINUTES;
}

/**
 * Reads the integration row directly instead of `resolveStoreCheckoutProvider`: a tenant that
 * turns checkout off still has live draft orders and unconfirmed payments to clean up.
 */
async function resolveSweepCredentials(storeIds: string[]) {
  const rows = await prisma.shopifyIntegration.findMany({
    where: { storeId: { in: storeIds }, accessTokenEncrypted: { not: null } },
    select: { id: true, storeId: true, shopDomain: true, accessTokenEncrypted: true },
  });

  const byStoreId = new Map<string, SweepCredentials>();
  for (const row of rows) {
    if (!row.accessTokenEncrypted) continue;
    try {
      byStoreId.set(row.storeId, {
        shopDomain: row.shopDomain,
        accessToken: await decryptShopifySecret(row.accessTokenEncrypted),
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} could not decrypt Shopify credentials`, row.id, error);
    }
  }

  for (const storeId of storeIds) {
    if (byStoreId.has(storeId)) continue;
    console.warn(`${LOG_PREFIX} no usable Shopify integration; skipping store`, storeId);
  }

  return byStoreId;
}

async function expireAttempt(attempt: SweepAttempt) {
  await prisma.$transaction(async (tx) => {
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "expired" },
    });

    // A newer attempt may already be driving this invoice; only the last one standing
    // may reset it, or a live checkout would be reported as unpaid.
    const otherLiveAttempts = await tx.paymentAttempt.count({
      where: {
        invoiceId: attempt.invoiceId,
        id: { not: attempt.id },
        status: { in: ["created", "pending"] },
      },
    });
    if (otherLiveAttempts > 0) return;

    await tx.invoice.updateMany({
      where: { id: attempt.invoiceId, paymentStatus: { not: "paid" } },
      data: { paymentStatus: "unpaid" },
    });
  });
}

function paidOrderOf(draftOrder: ShopifyDraftOrder) {
  const order = draftOrder.order;
  if (!order?.id) return null;
  if (order.cancelledAt) return null;
  if (!PAID_ORDER_FINANCIAL_STATUSES.has((order.displayFinancialStatus ?? "").toUpperCase())) {
    return null;
  }
  return order;
}

/**
 * The reason payment confirmation is not solely webhook-dependent: a delivery Shopify never
 * managed to land is replayed here from the order's own paid state.
 */
async function recoverPaidDraftOrder(
  attempt: SweepAttempt,
  draftOrder: ShopifyDraftOrder,
  order: NonNullable<ShopifyDraftOrder["order"]>,
) {
  // The ORDER's total is what was actually charged; the draft's total is the number the
  // create-time assertion already forced to match, so checking it would prove nothing.
  const shopMoney = order.totalPriceSet?.shopMoney ?? draftOrder.totalPriceSet?.shopMoney;
  const result = await prisma.$transaction(
    (tx) =>
      applyShopifyOrderPaid({
        tx,
        paymentAttempt: attempt,
        order: {
          gid: order.id,
          name: order.name ?? null,
          totalCents: moneyToCents(shopMoney?.amount),
          currency: shopMoney?.currencyCode ?? null,
        },
        providerEventId: `sweep:${draftOrder.id}`,
        eventType: "sweep/orders-paid",
      }),
    { maxWait: 2000, timeout: 15000 },
  );

  await dispatchNotificationEmailsSafely(result.notificationIds);
  console.info(`${LOG_PREFIX} recovered a paid Shopify order`, {
    paymentAttemptId: attempt.id,
    draftOrderId: draftOrder.id,
    orderGid: order.id,
    outcome: result.outcome,
  });
  return result.outcome === "converted" ? "recovered" : "skipped";
}

/**
 * The attempt row is written before the draft-order call so an orphan is always recoverable;
 * the invoice tag is the only handle we have on it when that call never came back.
 */
async function sweepOrphanedDraftOrder(
  attempt: SweepAttempt,
  credentials: SweepCredentials,
): Promise<"recovered" | "expired" | "skipped"> {
  const tag = shopifyInvoiceTag(attempt.invoice.invoiceNumber);
  const matches = await findShopifyDraftOrders({
    ...credentials,
    query: `tag:'${escapeSearchValue(tag)}'`,
  });

  for (const match of matches) {
    const paidOrder = paidOrderOf(match);
    if (paidOrder) return recoverPaidDraftOrder(attempt, match, paidOrder);
  }

  // A completed draft whose order is not paid yet may still be settling; leave it alone.
  if (matches.some((match) => match.status === "COMPLETED")) {
    console.warn(`${LOG_PREFIX} orphaned draft order completed but unpaid; leaving it`, {
      paymentAttemptId: attempt.id,
    });
    return "skipped";
  }

  for (const match of matches) {
    if (match.status !== "OPEN") continue;
    await deleteShopifyDraftOrder({ ...credentials, id: match.id });
  }

  await expireAttempt(attempt);
  return "expired";
}

async function sweepAttempt(
  attempt: SweepAttempt,
  credentials: SweepCredentials,
): Promise<"recovered" | "expired" | "skipped"> {
  if (!attempt.providerSessionId) {
    return sweepOrphanedDraftOrder(attempt, credentials);
  }

  const draftOrder = await readShopifyDraftOrder({
    ...credentials,
    id: attempt.providerSessionId,
  });
  if (!draftOrder) {
    await expireAttempt(attempt);
    return "expired";
  }

  const paidOrder = paidOrderOf(draftOrder);
  if (paidOrder) return recoverPaidDraftOrder(attempt, draftOrder, paidOrder);

  // A completed draft cannot be deleted, and its order may still be settling or awaiting a
  // manual payment. Expiring it would report a possibly-paid invoice as unpaid.
  if (draftOrder.status === "COMPLETED") {
    console.warn(`${LOG_PREFIX} completed draft order is not paid; leaving it pending`, {
      paymentAttemptId: attempt.id,
      draftOrderId: draftOrder.id,
      orderGid: draftOrder.order?.id ?? null,
      financialStatus: draftOrder.order?.displayFinancialStatus ?? null,
      cancelledAt: draftOrder.order?.cancelledAt ?? null,
    });
    return "skipped";
  }

  await deleteShopifyDraftOrder({ ...credentials, id: draftOrder.id });
  await expireAttempt(attempt);
  return "expired";
}

/**
 * Without this sweep a lost `orders/paid` delivery silently drops a paid order, and abandoned
 * draft orders accumulate in the merchant's Shopify admin forever.
 */
export async function sweepStaleShopifyCheckouts(): Promise<ShopifyCheckoutSweepSummary> {
  const cutoff = new Date(Date.now() - checkoutTtlMinutes() * 60_000);
  const attempts = await prisma.paymentAttempt.findMany({
    where: {
      provider: SHOPIFY_PROVIDER,
      status: { in: [...SWEEPABLE_STATUSES] },
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      storeId: true,
      invoiceId: true,
      status: true,
      amount: true,
      currency: true,
      providerMetadata: true,
      providerSessionId: true,
      correlationToken: true,
      invoice: { select: { invoiceNumber: true } },
    },
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH_SIZE,
  });

  const summary: ShopifyCheckoutSweepSummary = {
    scanned: attempts.length,
    recovered: 0,
    expired: 0,
    failed: 0,
  };
  if (attempts.length === 0) return summary;

  const credentialsByStoreId = await resolveSweepCredentials([
    ...new Set(attempts.map((attempt) => attempt.storeId)),
  ]);

  for (const attempt of attempts) {
    const credentials = credentialsByStoreId.get(attempt.storeId);
    if (!credentials) {
      summary.failed += 1;
      continue;
    }

    try {
      const outcome = await sweepAttempt(attempt, credentials);
      if (outcome === "recovered") summary.recovered += 1;
      if (outcome === "expired") summary.expired += 1;
    } catch (error) {
      // The webhook landed between our read and our write; its work stands.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      summary.failed += 1;
      console.error(`${LOG_PREFIX} could not sweep payment attempt`, attempt.id, error);
    }
  }

  console.info(`${LOG_PREFIX} sweep finished`, summary);
  return summary;
}
