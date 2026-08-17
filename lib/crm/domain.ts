const CRM_WEBHOOK_URL_HINT =
  "Set CRM_WEBHOOK_BASE_URL to a public HTTPS URL. CRM rejects localhost and private addresses; use an HTTPS tunnel for local development.";

export function normalizeCrmBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("CRM host URL is required");

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid CRM host URL");
  }

  const hostname = url.hostname.replace(/\.$/, "");
  if (!hostname) throw new Error("Enter a valid CRM host URL");

  let path = url.pathname.replace(/\/+$/, "");
  if (path === "/api/v1" || path.endsWith("/api/v1")) {
    path = path.slice(0, -"/api/v1".length).replace(/\/+$/, "");
  }

  const origin = `${url.protocol}//${url.host.replace(/\.$/, "")}`;
  return path ? `${origin}${path}` : origin;
}

export function crmApiBaseUrl(baseUrl: string) {
  return `${normalizeCrmBaseUrl(baseUrl)}/api/v1`;
}

export function assertCrmApiToken(value: string) {
  if (!value.startsWith("crm_")) {
    throw new Error("CRM API token must start with crm_");
  }
}

export function assertCrmWebhookSecret(value: string) {
  if (!value.startsWith("whsec_")) {
    throw new Error("CRM webhook signing secret must start with whsec_");
  }
}

function configuredWebhookBaseUrl() {
  return (
    process.env.CRM_WEBHOOK_BASE_URL?.trim() ||
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

export function isInternalHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "host.docker.internal" ||
    isPrivateIpv4(normalized) ||
    isPrivateIpv6(normalized)
  );
}

export function getCrmWebhookBaseUrl() {
  const url = parseAppBaseUrl(
    configuredWebhookBaseUrl(),
    "CRM_WEBHOOK_BASE_URL, NEXT_PUBLIC_APP_URL, or AUTH_URL",
  );
  const hostname = normalizeHostname(url.hostname);

  if (url.protocol !== "https:") {
    throw new Error(`CRM webhook callback URL must use HTTPS. ${CRM_WEBHOOK_URL_HINT}`);
  }
  if (isInternalHostname(hostname)) {
    throw new Error(
      `CRM webhook callback URL must use a public host. ${CRM_WEBHOOK_URL_HINT}`,
    );
  }

  return url.toString().replace(/\/$/, "");
}

export function buildCrmLeadsWebhookUrl(integrationId: string) {
  return `${getCrmWebhookBaseUrl()}/api/webhooks/crm/${integrationId}/leads`;
}

export function crmLeadsWebhookPath(integrationId: string) {
  return `/api/webhooks/crm/${integrationId}/leads`;
}

export function tryBuildCrmLeadsWebhookUrl(integrationId: string) {
  try {
    return buildCrmLeadsWebhookUrl(integrationId);
  } catch {
    return null;
  }
}

export function displayCrmLeadsWebhookUrl(integrationId: string | null) {
  if (!integrationId) return null;
  return tryBuildCrmLeadsWebhookUrl(integrationId) ?? crmLeadsWebhookPath(integrationId);
}

export function buildLeadsQuery(filters: {
  cursor?: string;
  limit?: number;
  updatedSince?: string;
} = {}) {
  const qs = new URLSearchParams();
  qs.set("limit", String(filters.limit ?? 100));
  if (filters.cursor) qs.set("cursor", filters.cursor);
  if (filters.updatedSince) qs.set("updatedSince", filters.updatedSince);
  return qs;
}
