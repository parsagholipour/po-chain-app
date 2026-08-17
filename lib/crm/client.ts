import "server-only";

import { buildLeadsQuery, crmApiBaseUrl } from "@/lib/crm/domain";

export class CrmApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "CrmApiError";
    this.status = status;
    this.code = code;
  }
}

export type CrmOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type CrmLeadListPage = {
  items: unknown[];
  total: number;
  nextCursor: string | null;
};

type ListLeadsFilters = {
  cursor?: string;
  limit?: number;
  updatedSince?: string;
};

const MAX_RETRIES = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessageFromBody(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const error = "error" in body ? body.error : null;
  if (!error || typeof error !== "object") return fallback;
  const message = "message" in error && typeof error.message === "string" ? error.message : null;
  const code = "code" in error && typeof error.code === "string" ? error.code : null;
  if (message && code) return `${code}: ${message}`;
  return message ?? code ?? fallback;
}

function errorCodeFromBody(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const error = "error" in body ? body.error : null;
  if (!error || typeof error !== "object") return null;
  return "code" in error && typeof error.code === "string" ? error.code : null;
}

export class CrmClient {
  constructor(
    private readonly apiBase: string,
    private readonly token: string,
  ) {}

  static fromIntegration(baseUrl: string, token: string) {
    return new CrmClient(crmApiBaseUrl(baseUrl), token);
  }

  private async request<T>(path: string, { retryOnServerError = true } = {}): Promise<T> {
    const url = `${this.apiBase}${path}`;
    let attempt = 0;

    for (;;) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
      });

      if (response.status >= 500 && retryOnServerError && attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
        continue;
      }

      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new CrmApiError(
          response.status,
          errorCodeFromBody(body),
          errorMessageFromBody(body, `CRM request failed (${response.status})`),
        );
      }

      if (!body || typeof body !== "object" || !("data" in body)) {
        throw new CrmApiError(response.status, null, "CRM returned an unexpected response");
      }
      return (body as { data: T }).data;
    }
  }

  async me() {
    const data = await this.request<{ organization: CrmOrganization }>("/me");
    if (!data?.organization?.id || !data.organization.name || !data.organization.slug) {
      throw new CrmApiError(200, null, "CRM /me did not return an organization");
    }
    return data.organization;
  }

  async listLeads(filters: ListLeadsFilters = {}) {
    const qs = buildLeadsQuery(filters);
    const data = await this.request<CrmLeadListPage>(`/leads?${qs}`);
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      total: typeof data?.total === "number" ? data.total : 0,
      nextCursor: typeof data?.nextCursor === "string" ? data.nextCursor : null,
    } satisfies CrmLeadListPage;
  }

  async getLead(id: string) {
    return this.request<unknown>(`/leads/${encodeURIComponent(id)}`);
  }

  async *iterateLeads(filters: Omit<ListLeadsFilters, "cursor"> = {}) {
    let cursor: string | undefined;
    for (;;) {
      const page = await this.listLeads({ ...filters, cursor });
      for (const item of page.items) yield item;
      if (!page.nextCursor) return;
      cursor = page.nextCursor;
    }
  }
}
