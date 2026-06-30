export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startShopifyInventoryScheduler } = await import(
      "@/lib/shopify/scheduler"
    );
    const { startCjDropshippingInventoryScheduler } = await import(
      "@/lib/cjdropshipping/scheduler"
    );
    startShopifyInventoryScheduler();
    startCjDropshippingInventoryScheduler();
  }
}
