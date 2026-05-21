export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startShopifyInventoryScheduler } = await import(
      "@/lib/shopify/scheduler"
    );
    startShopifyInventoryScheduler();
  }
}
