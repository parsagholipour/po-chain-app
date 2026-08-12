import "server-only";

import { allCountries } from "country-region-data";
import { moneyToCents } from "@/lib/distributor-orders/money";
import { PaymentProviderError } from "@/lib/payments/types";
import {
  createShopifyDraftOrder,
  deleteShopifyDraftOrder,
  escapeSearchValue,
  productVariantsBySku,
  readShopifyDraftOrder,
  ShopifyApiError,
  type ShopifyDraftOrder,
} from "@/lib/shopify/admin";
import {
  planShopifyDraftOrderLines,
  type CheckoutPlanLineItem,
  type ShopifyLinePlan,
  type ShopifyPlanVariant,
} from "@/lib/shopify/checkout-line-plan";

/**
 * Draft-order custom attributes are the ONLY correlation channel we get back: the REST-shaped
 * `orders/paid` payload carries no draft-order id. Note the key rename on the way back —
 * we send `{ key, value }` and Shopify returns `note_attributes: [{ name, value }]`.
 */
export const SHOPIFY_CHECKOUT_ATTRIBUTES = {
  invoiceId: "po_app_invoice_id",
  invoiceNumber: "po_app_invoice_number",
  paymentAttemptId: "po_app_payment_attempt_id",
  checkoutToken: "po_app_checkout_token",
  storeId: "po_app_store_id",
} as const;

export const SHOPIFY_CHECKOUT_TAG = "po-app-checkout";

export function shopifyInvoiceTag(invoiceNumber: string) {
  return `po-app-invoice-${invoiceNumber}`;
}

const SKU_QUERY_CHUNK_SIZE = 25;
const MAX_NOTE_LENGTH = 4500;
const INVOICE_URL_POLL_DELAYS_MS = [250, 500, 750, 1000, 1500, 2000];

export type ShopifyCheckoutDestination = {
  label: string;
  isBackOrder: boolean;
  recipientName: string | null;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  lines: Array<{ name: string; sku: string | null; quantity: number }>;
};

export type ShopifyCheckoutMetadata = {
  provider: "shopify";
  shopDomain: string;
  draftOrderId: string;
  invoiceUrl: string;
  currency: string;
  amountCents: number;
  lines: ShopifyLinePlan["lines"];
  warnings: ShopifyLinePlan["warnings"];
};

export type ShopifyCheckoutResult = {
  draftOrderId: string;
  checkoutUrl: string;
  metadata: ShopifyCheckoutMetadata;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/**
 * Shopify's `sku:` search is fuzzy (prefix/partial hits come back too), so every node is
 * re-filtered on exact trimmed SKU before it can influence pricing — the same guard
 * `readOnHandInventoryForSku` applies.
 */
export async function resolveShopifyVariantsBySku({
  shopDomain,
  accessToken,
  skus,
}: {
  shopDomain: string;
  accessToken: string;
  skus: string[];
}) {
  const requested = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  const variantsBySku = new Map<string, ShopifyPlanVariant[]>();
  if (requested.length === 0) return variantsBySku;

  for (const group of chunk(requested, SKU_QUERY_CHUNK_SIZE)) {
    const wanted = new Set(group);
    const query = group.map((sku) => `sku:'${escapeSearchValue(sku)}'`).join(" OR ");
    const nodes = await productVariantsBySku({ shopDomain, accessToken, query });

    for (const node of nodes) {
      const sku = node.sku?.trim();
      if (!sku || !wanted.has(sku)) continue;

      const matches = variantsBySku.get(sku) ?? [];
      matches.push({
        id: node.id,
        sku: node.sku,
        inventoryQuantity: node.inventoryQuantity,
        inventoryPolicy: node.inventoryPolicy,
        tracked: node.inventoryItem?.tracked ?? null,
        productStatus: node.product?.status ?? null,
      });
      variantsBySku.set(sku, matches);
    }
  }

  return variantsBySku;
}

function moneyInput(cents: number, currency: string) {
  return { amount: (cents / 100).toFixed(2), currencyCode: currency.trim().toUpperCase() };
}

function splitName(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: null };
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim() || null,
  };
}

/**
 * Ship-to country/province are stored as human names ("United States", "California") by
 * `country-state-select`, but `MailingAddressInput` only accepts ISO codes. Anything that
 * cannot be resolved is omitted rather than guessed — an invalid `CountryCode` enum value
 * would fail the whole mutation, and this address is cosmetic (fulfilment lives in this app).
 */
function resolveCountryAndProvinceCodes(country: string | null, province: string | null) {
  const countryValue = country?.trim();
  if (!countryValue) return { countryCode: null, provinceCode: null };

  const needle = countryValue.toLowerCase();
  const match = allCountries.find(
    ([name, shortCode]) =>
      name.toLowerCase() === needle || shortCode.toLowerCase() === needle,
  );
  if (!match) return { countryCode: null, provinceCode: null };

  const [, countryCode, regions] = match;
  const provinceValue = province?.trim();
  if (!provinceValue) return { countryCode, provinceCode: null };

  const provinceNeedle = provinceValue.toLowerCase();
  const region = regions.find(
    ([name, shortCode]) =>
      name.toLowerCase() === provinceNeedle || shortCode.toLowerCase() === provinceNeedle,
  );
  const provinceCode = region?.[1].trim();
  return { countryCode, provinceCode: provinceCode || null };
}

function buildShippingAddress(destination: ShopifyCheckoutDestination | undefined) {
  if (!destination) return null;
  if (!destination.addressLine1?.trim() && !destination.city?.trim()) return null;

  const { firstName, lastName } = splitName(destination.recipientName);
  const { countryCode, provinceCode } = resolveCountryAndProvinceCodes(
    destination.country,
    destination.stateProvince,
  );

  const address: Record<string, unknown> = {};
  if (destination.addressLine1?.trim()) address.address1 = destination.addressLine1.trim();
  if (destination.addressLine2?.trim()) address.address2 = destination.addressLine2.trim();
  if (destination.city?.trim()) address.city = destination.city.trim();
  if (destination.postalCode?.trim()) address.zip = destination.postalCode.trim();
  if (destination.companyName?.trim()) address.company = destination.companyName.trim();
  if (destination.phone?.trim()) address.phone = destination.phone.trim();
  if (firstName) address.firstName = firstName;
  if (lastName) address.lastName = lastName;
  if (countryCode) address.countryCode = countryCode;
  if (countryCode && provinceCode) address.provinceCode = provinceCode;

  return Object.keys(address).length > 0 ? address : null;
}

function addressSummary(destination: ShopifyCheckoutDestination) {
  return [
    destination.recipientName,
    destination.companyName,
    destination.addressLine1,
    destination.addressLine2,
    [destination.city, destination.stateProvince, destination.postalCode]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", "),
    destination.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");
}

export function buildDraftOrderNote({
  invoiceNumber,
  destinations,
}: {
  invoiceNumber: string;
  destinations: ShopifyCheckoutDestination[];
}) {
  const header = [
    `PO app invoice ${invoiceNumber}`,
    "Payment only — fulfilment, shipping and tax are managed in the PO app.",
    `${destinations.length} ship-to destination(s):`,
  ];

  const blocks = destinations.map((destination, index) => {
    const lines = destination.lines.map(
      (line) => `    ${line.quantity} x ${line.sku ?? "(no SKU)"} — ${line.name}`,
    );
    return [
      `  ${index + 1}. ${destination.label}${destination.isBackOrder ? " (back-order)" : ""}`,
      `     ${addressSummary(destination) || "No shipping address on file"}`,
      ...lines,
    ].join("\n");
  });

  const note = [...header, ...blocks].join("\n");
  return note.length > MAX_NOTE_LENGTH
    ? `${note.slice(0, MAX_NOTE_LENGTH)}\n… truncated; see invoice ${invoiceNumber} in the PO app.`
    : note;
}

export function buildDraftOrderInput({
  invoiceId,
  invoiceNumber,
  storeId,
  paymentAttemptId,
  correlationToken,
  currency,
  customerEmail,
  destinations,
  plan,
  includeShippingAddress = true,
  useDeprecatedShippingPrice = false,
  useDeprecatedLinePrice = false,
}: {
  invoiceId: string;
  invoiceNumber: string;
  storeId: string;
  paymentAttemptId: string;
  correlationToken: string;
  currency: string;
  customerEmail: string | null;
  destinations: ShopifyCheckoutDestination[];
  plan: ShopifyLinePlan;
  includeShippingAddress?: boolean;
  useDeprecatedShippingPrice?: boolean;
  useDeprecatedLinePrice?: boolean;
}) {
  const lineItems = plan.lines.map((line) => {
    const money = moneyInput(line.unitAmountCents, currency);
    if (line.mode === "variant" && line.variantId) {
      // `title`/`sku`/`taxable`/`requiresShipping` are ignored by Shopify when variantId is
      // set — which is exactly why tax exemption has to live at the top level of the input.
      // `priceOverride` replaces the variant's catalog price.
      return { variantId: line.variantId, quantity: line.quantity, priceOverride: money };
    }
    return {
      title: line.name,
      sku: line.sku ?? undefined,
      quantity: line.quantity,
      // A variant-less line has no catalog price to override: `priceOverride` would be
      // ignored and the line would be created at 0.00. Custom lines price here instead.
      ...(useDeprecatedLinePrice
        ? { originalUnitPrice: money.amount }
        : { originalUnitPriceWithCurrency: money }),
      taxable: false,
      requiresShipping: false,
    };
  });

  const shippingLine = useDeprecatedShippingPrice
    ? { title: "Shipping handled outside Shopify", price: "0.00" }
    : {
        title: "Shipping handled outside Shopify",
        priceWithCurrency: moneyInput(0, currency),
      };

  const input: Record<string, unknown> = {
    lineItems,
    // Charge exactly the app invoice total: no Shopify tax, no Shopify shipping charge.
    taxExempt: true,
    shippingLine,
    note: buildDraftOrderNote({ invoiceNumber, destinations }),
    tags: [SHOPIFY_CHECKOUT_TAG, shopifyInvoiceTag(invoiceNumber)],
    customAttributes: [
      { key: SHOPIFY_CHECKOUT_ATTRIBUTES.invoiceId, value: invoiceId },
      { key: SHOPIFY_CHECKOUT_ATTRIBUTES.invoiceNumber, value: invoiceNumber },
      { key: SHOPIFY_CHECKOUT_ATTRIBUTES.paymentAttemptId, value: paymentAttemptId },
      { key: SHOPIFY_CHECKOUT_ATTRIBUTES.checkoutToken, value: correlationToken },
      { key: SHOPIFY_CHECKOUT_ATTRIBUTES.storeId, value: storeId },
    ],
  };

  if (customerEmail?.trim()) input.email = customerEmail.trim();

  if (includeShippingAddress) {
    const shippingAddress = buildShippingAddress(destinations[0]);
    if (shippingAddress) input.shippingAddress = shippingAddress;
  }

  return input;
}

function mentions(message: string, needle: string) {
  return message.toLowerCase().includes(needle.toLowerCase());
}

/**
 * `priceWithCurrency` and `MailingAddressInput` coercion are the two places where a pinned
 * API version or an unmappable address could reject the mutation outright. Neither is worth
 * blocking a payment over, so each gets exactly one targeted retry with that piece removed.
 */
async function createDraftOrderWithFallbacks({
  shopDomain,
  accessToken,
  buildInput,
}: {
  shopDomain: string;
  accessToken: string;
  buildInput: (options: {
    includeShippingAddress: boolean;
    useDeprecatedShippingPrice: boolean;
    useDeprecatedLinePrice: boolean;
  }) => Record<string, unknown>;
}) {
  let includeShippingAddress = true;
  let useDeprecatedShippingPrice = false;
  let useDeprecatedLinePrice = false;
  let triedDeprecatedPrice = false;
  let triedDeprecatedLinePrice = false;
  let triedWithoutAddress = false;

  for (;;) {
    try {
      return await createShopifyDraftOrder({
        shopDomain,
        accessToken,
        input: buildInput({
          includeShippingAddress,
          useDeprecatedShippingPrice,
          useDeprecatedLinePrice,
        }),
      });
    } catch (error) {
      if (!(error instanceof ShopifyApiError)) throw error;
      const message = error.message;

      if (!triedDeprecatedPrice && mentions(message, "priceWithCurrency")) {
        triedDeprecatedPrice = true;
        useDeprecatedShippingPrice = true;
        continue;
      }
      if (!triedDeprecatedLinePrice && mentions(message, "originalUnitPriceWithCurrency")) {
        triedDeprecatedLinePrice = true;
        useDeprecatedLinePrice = true;
        continue;
      }
      if (
        includeShippingAddress &&
        !triedWithoutAddress &&
        (mentions(message, "shippingAddress") ||
          mentions(message, "countryCode") ||
          mentions(message, "provinceCode") ||
          mentions(message, "CountryCode"))
      ) {
        triedWithoutAddress = true;
        includeShippingAddress = false;
        continue;
      }
      throw error;
    }
  }
}

/**
 * Polls only when `draftOrderCreate` returned a draft that is not `ready` yet — Shopify can
 * report `invoiceUrl: null` for a beat after create.
 */
export async function pollShopifyDraftOrderInvoiceUrl({
  shopDomain,
  accessToken,
  draftOrderId,
}: {
  shopDomain: string;
  accessToken: string;
  draftOrderId: string;
}) {
  for (const delay of INVOICE_URL_POLL_DELAYS_MS) {
    await sleep(delay);
    const draftOrder = await readShopifyDraftOrder({
      shopDomain,
      accessToken,
      id: draftOrderId,
    });
    if (!draftOrder) continue;
    const invoiceUrl = draftOrder.invoiceUrl?.trim();
    if (invoiceUrl) return { invoiceUrl, draftOrder };
  }

  throw new PaymentProviderError(
    "Shopify did not return a checkout link for this order. Please try again.",
  );
}

function assertDraftOrderTotal({
  draftOrder,
  amountCents,
  currency,
}: {
  draftOrder: ShopifyDraftOrder;
  amountCents: number;
  currency: string;
}) {
  const shopMoney = draftOrder.totalPriceSet?.shopMoney;
  if (!shopMoney) {
    throw new PaymentProviderError("Shopify did not return a total for this order");
  }

  const shopifyCents = moneyToCents(shopMoney.amount);
  if (shopifyCents !== amountCents) {
    throw new PaymentProviderError(
      `Shopify priced this order at ${shopMoney.amount} ${shopMoney.currencyCode} but the invoice total is ${(
        amountCents / 100
      ).toFixed(2)} ${currency.toUpperCase()}. Checkout was cancelled so you are not overcharged.`,
    );
  }

  const shopifyCurrency = shopMoney.currencyCode?.trim().toLowerCase();
  if (shopifyCurrency && shopifyCurrency !== currency.trim().toLowerCase()) {
    throw new PaymentProviderError(
      `Shopify charges in ${shopMoney.currencyCode} but this order was priced in ${currency.toUpperCase()}.`,
    );
  }
}

export async function createShopifyDraftOrderCheckout({
  shopDomain,
  accessToken,
  invoiceId,
  invoiceNumber,
  storeId,
  paymentAttemptId,
  correlationToken,
  amountCents,
  currency,
  lineItems,
  customerEmail,
  destinations,
}: {
  shopDomain: string;
  accessToken: string;
  invoiceId: string;
  invoiceNumber: string;
  storeId: string;
  paymentAttemptId: string;
  correlationToken: string;
  amountCents: number;
  currency: string;
  lineItems: CheckoutPlanLineItem[];
  customerEmail: string | null;
  destinations: ShopifyCheckoutDestination[];
}): Promise<ShopifyCheckoutResult> {
  const variantsBySku = await resolveShopifyVariantsBySku({
    shopDomain,
    accessToken,
    skus: lineItems.flatMap((item) => (item.sku ? [item.sku] : [])),
  });

  const plan = planShopifyDraftOrderLines({ lineItems, variantsBySku });
  if (plan.lines.length === 0) {
    throw new PaymentProviderError("This invoice has no payable lines");
  }
  if (plan.totalCents !== amountCents) {
    throw new PaymentProviderError(
      `Order lines total ${(plan.totalCents / 100).toFixed(2)} but the invoice total is ${(
        amountCents / 100
      ).toFixed(2)}. Start a new order.`,
    );
  }

  const draftOrder = await createDraftOrderWithFallbacks({
    shopDomain,
    accessToken,
    buildInput: (options) =>
      buildDraftOrderInput({
        invoiceId,
        invoiceNumber,
        storeId,
        paymentAttemptId,
        correlationToken,
        currency,
        customerEmail,
        destinations,
        plan,
        ...options,
      }),
  });

  try {
    assertDraftOrderTotal({ draftOrder, amountCents, currency });

    const invoiceUrl =
      draftOrder.invoiceUrl?.trim() ||
      (
        await pollShopifyDraftOrderInvoiceUrl({
          shopDomain,
          accessToken,
          draftOrderId: draftOrder.id,
        })
      ).invoiceUrl;

    return {
      draftOrderId: draftOrder.id,
      checkoutUrl: invoiceUrl,
      metadata: {
        provider: "shopify",
        shopDomain,
        draftOrderId: draftOrder.id,
        invoiceUrl,
        currency,
        amountCents,
        lines: plan.lines,
        warnings: plan.warnings,
      },
    };
  } catch (error) {
    // Never leave a payable draft order behind that the buyer can no longer reach.
    try {
      await deleteShopifyDraftOrder({ shopDomain, accessToken, id: draftOrder.id });
    } catch (cleanupError) {
      console.error(
        "[shopify-checkout] could not delete draft order after a failed checkout",
        draftOrder.id,
        cleanupError,
      );
    }
    throw error;
  }
}

export type ShopifyCheckoutCorrelation = {
  invoiceId: string | null;
  invoiceNumber: string | null;
  paymentAttemptId: string | null;
  checkoutToken: string | null;
  storeId: string | null;
};

/**
 * Draft-order `customAttributes` arrive on the order webhook as
 * `note_attributes: [{ name, value }]` — `key` becomes `name`.
 */
export function extractShopifyCheckoutCorrelation(payload: {
  note_attributes?: Array<{ name?: unknown; value?: unknown }> | null;
}): ShopifyCheckoutCorrelation {
  const byName = new Map<string, string>();
  for (const attribute of payload.note_attributes ?? []) {
    if (typeof attribute?.name !== "string") continue;
    if (typeof attribute.value !== "string") continue;
    byName.set(attribute.name, attribute.value);
  }

  const read = (key: string) => byName.get(key)?.trim() || null;
  return {
    invoiceId: read(SHOPIFY_CHECKOUT_ATTRIBUTES.invoiceId),
    invoiceNumber: read(SHOPIFY_CHECKOUT_ATTRIBUTES.invoiceNumber),
    paymentAttemptId: read(SHOPIFY_CHECKOUT_ATTRIBUTES.paymentAttemptId),
    checkoutToken: read(SHOPIFY_CHECKOUT_ATTRIBUTES.checkoutToken),
    storeId: read(SHOPIFY_CHECKOUT_ATTRIBUTES.storeId),
  };
}
