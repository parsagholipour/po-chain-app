import "server-only";

const SHOPIFY_WEBHOOK_URL_HINT =
  "Set SHOPIFY_WEBHOOK_BASE_URL to a public HTTPS URL. For local development, use an HTTPS tunnel that forwards to this app.";

export function normalizeShopifyDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) throw new Error("Shop domain is required");

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid Shopify shop domain");
  }

  const hostname = url.hostname.replace(/\.$/, "");
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(hostname)) {
    throw new Error("Enter a valid Shopify shop domain");
  }
  return hostname;
}

function configuredAppBaseUrl({ includeWebhookOverride }: { includeWebhookOverride: boolean }) {
  if (includeWebhookOverride && process.env.SHOPIFY_WEBHOOK_BASE_URL?.trim()) {
    return process.env.SHOPIFY_WEBHOOK_BASE_URL;
  }

  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  );
}

function parseAppBaseUrl(value: string, envDescription: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) {
    throw new Error(`${envDescription} must be set`);
  }

  try {
    return new URL(trimmed);
  } catch {
    throw new Error(`${envDescription} must be a valid URL`);
  }
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".");
  if (octets.length !== 4) return false;

  const parts = octets.map((part) => Number.parseInt(part, 10));
  if (
    parts.some(
      (part, index) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255 ||
        String(part) !== octets[index],
    )
  ) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(hostname: string) {
  const compact = hostname.toLowerCase();
  return (
    compact === "::1" ||
    compact.startsWith("fc") ||
    compact.startsWith("fd") ||
    compact.startsWith("fe80:")
  );
}

function isInternalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "host.docker.internal" ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  );
}

function isShopifyHostname(hostname: string) {
  return (
    hostname === "shopify.com" ||
    hostname.endsWith(".shopify.com") ||
    hostname === "myshopify.com" ||
    hostname.endsWith(".myshopify.com")
  );
}

export function getAppBaseUrl() {
  const fromEnv = configuredAppBaseUrl({ includeWebhookOverride: false });
  const url = parseAppBaseUrl(fromEnv, "NEXT_PUBLIC_APP_URL or AUTH_URL");

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Shopify webhooks require an HTTPS app URL in production");
  }

  return url.toString().replace(/\/$/, "");
}

export function getShopifyWebhookBaseUrl() {
  const fromEnv = configuredAppBaseUrl({ includeWebhookOverride: true });
  const url = parseAppBaseUrl(
    fromEnv,
    "SHOPIFY_WEBHOOK_BASE_URL, NEXT_PUBLIC_APP_URL, or AUTH_URL",
  );
  const hostname = normalizeHostname(url.hostname);

  if (url.protocol !== "https:") {
    throw new Error(`Shopify webhook callback URL must use HTTPS. ${SHOPIFY_WEBHOOK_URL_HINT}`);
  }
  if (isInternalHostname(hostname) || isShopifyHostname(hostname)) {
    throw new Error(
      `Shopify webhook callback URL must use a public, non-Shopify domain. ${SHOPIFY_WEBHOOK_URL_HINT}`,
    );
  }

  return url.toString().replace(/\/$/, "");
}

export function buildShopifyInventoryWebhookUrl(integrationId: string) {
  return `${getShopifyWebhookBaseUrl()}/api/webhooks/shopify/${integrationId}/inventory-levels-update`;
}
