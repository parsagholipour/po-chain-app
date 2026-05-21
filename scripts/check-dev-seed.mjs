import "dotenv/config";
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function redactDatabaseUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port,
      database: parsed.pathname.replace(/^\//, ""),
      schema: parsed.searchParams.get("schema") ?? "public",
      user: parsed.username,
    };
  } catch {
    return { raw: "(unparseable DATABASE_URL)" };
  }
}

// Mirror prisma.config.ts URL mutation for CLI migrations.
function appendInitialMockOptions(databaseUrl) {
  if (!databaseUrl) return databaseUrl;

  const mockPath = new URL("../initial_mock.json", import.meta.url);
  if (!existsSync(mockPath)) return databaseUrl;

  const mock = JSON.parse(readFileSync(mockPath, "utf8"));
  const settings = [
    ["app.shopify_integration_encryption_key", process.env.SHOPIFY_INTEGRATION_ENCRYPTION_KEY],
    ["app.payment_provider_encryption_key", process.env.PAYMENT_PROVIDER_ENCRYPTION_KEY],
    ["app.initial_mock.shopify_webhook_signing_secret", mock.SHOPIFY_WEBHOOK_SIGNING_SECRET],
    ["app.initial_mock.shopify_admin_token", mock.SHOPIFY_ADMIN_TOKEN],
    ["app.initial_mock.shopify_shop_domain", mock.SHOPIFY_SHOP_DOMAIN],
    ["app.initial_mock.stripe_secret_key", mock.STRIPE_SECRET_KEY],
    ["app.initial_mock.stripe_webhook_signing_secret", mock.STRIPE_WEBHOOK_SIGNING_SECRET],
  ];

  if (settings.some(([, value]) => !value?.trim())) return databaseUrl;

  const url = new URL(databaseUrl);
  const existingOptions = url.searchParams.get("options")?.trim();
  const seedOptions = settings.map(([name, value]) => `-c ${name}=${value}`);
  url.searchParams.set(
    "options",
    existingOptions ? [existingOptions, ...seedOptions].join(" ") : seedOptions.join(" "),
  );
  return url.toString();
}

const appUrl = process.env.DATABASE_URL;
const migrateUrl = appendInitialMockOptions(appUrl);

for (const [label, url] of [
  ["app (lib/prisma.ts)", appUrl],
  ["migrate (prisma.config.ts)", migrateUrl],
]) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const manufacturers = await client.query('SELECT COUNT(*)::int AS n FROM "Manufacturer"');
  const products = await client.query('SELECT COUNT(*)::int AS n FROM "Product"');
  const storeRows = await client.query('SELECT id, slug, name FROM "Store"');
  const mom = await client.query(
    'SELECT COUNT(*)::int AS n FROM "ManufacturingOrderManufacturer"',
  );

  console.log(
    JSON.stringify(
      {
        connection: label,
        database: redactDatabaseUrl(url),
        manufacturers: manufacturers.rows[0].n,
        manufacturingOrderManufacturers: mom.rows[0].n,
        products: products.rows[0].n,
        stores: storeRows.rows,
      },
      null,
      2,
    ),
  );

  await client.end();
}
