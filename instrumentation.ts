export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startShopifyInventoryScheduler } = await import(
      "@/lib/shopify/scheduler"
    );
    const { startCjDropshippingInventoryScheduler } = await import(
      "@/lib/cjdropshipping/scheduler"
    );
    const { startWebhookDeliveryScheduler } = await import("@/lib/webhooks/scheduler");
    const { startOperatorWarningScheduler } = await import(
      "@/lib/operator-warnings/scheduler"
    );
    startShopifyInventoryScheduler();
    startCjDropshippingInventoryScheduler();
    startWebhookDeliveryScheduler();
    startOperatorWarningScheduler();
  }
}
