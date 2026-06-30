import "server-only";

const CJ_API_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";
const DEFAULT_REQUEST_INTERVAL_MS = 1100;

export type CjAuthTokenData = {
  openId?: string | number | null;
  accessToken: string;
  accessTokenExpiryDate: string;
  refreshToken: string;
  refreshTokenExpiryDate: string;
  createDate?: string | null;
};

export type CjMyProduct = {
  productId?: string | null;
  sku?: string | null;
  nameEn?: string | null;
  vid?: string | null;
  areaId?: string | number | null;
  areaCountryCode?: string | null;
  defaultArea?: string | null;
};

export type CjMyProductListData = {
  pageSize?: number | string | null;
  pageNumber?: number | string | null;
  totalRecords?: number | string | null;
  totalPages?: number | string | null;
  content?: CjMyProduct[] | null;
};

export type CjInventoryStock = {
  stockId?: string | null;
  inventory?: number | string | null;
  factoryInventory?: number | string | null;
};

export type CjInventoryBySkuRow = {
  areaEn?: string | null;
  areaId?: string | number | null;
  countryCode?: string | null;
  countryNameEn?: string | null;
  totalInventoryNum?: number | string | null;
  cjInventoryNum?: number | string | null;
  factoryInventoryNum?: number | string | null;
  stock?: CjInventoryStock[] | null;
};

type CjApiEnvelope<T> = {
  code?: number;
  result?: boolean;
  success?: boolean;
  message?: string | null;
  data?: T;
  requestId?: string;
};

type RequestOptions = {
  accessToken?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
};

export class CjDropshippingApiError extends Error {
  code: number | null;
  requestId: string | null;
  status: number | null;

  constructor(message: string, input: { code?: number; requestId?: string; status?: number }) {
    super(message);
    this.name = "CjDropshippingApiError";
    this.code = input.code ?? null;
    this.requestId = input.requestId ?? null;
    this.status = input.status ?? null;
  }
}

function configuredRequestIntervalMs() {
  const raw = Number.parseInt(
    process.env.CJDROPSHIPPING_REQUEST_INTERVAL_MS ?? "",
    10,
  );
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_REQUEST_INTERVAL_MS;
  return raw;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function envelopeSucceeded<T>(envelope: CjApiEnvelope<T>) {
  if (envelope.success === false || envelope.result === false) return false;
  if (envelope.code == null) return true;
  return envelope.code === 0 || envelope.code === 200;
}

function requireData<T>(envelope: CjApiEnvelope<T>, endpoint: string): T {
  if (!envelopeSucceeded(envelope)) {
    throw new CjDropshippingApiError(
      envelope.message || `CJdropshipping API request failed: ${endpoint}`,
      {
        code: envelope.code,
        requestId: envelope.requestId,
      },
    );
  }

  return envelope.data as T;
}

function numericParam(value: number) {
  return Number.isFinite(value) ? String(value) : undefined;
}

export class CjDropshippingClient {
  private nextRequestAt = 0;

  constructor(
    private readonly options: {
      baseUrl?: string;
      requestIntervalMs?: number;
    } = {},
  ) {}

  private async throttle() {
    const intervalMs = this.options.requestIntervalMs ?? configuredRequestIntervalMs();
    if (intervalMs <= 0) return;

    const now = Date.now();
    if (this.nextRequestAt > now) {
      await sleep(this.nextRequestAt - now);
    }
    this.nextRequestAt = Date.now() + intervalMs;
  }

  private url(endpoint: string, query?: RequestOptions["query"]) {
    const url = new URL(
      `${this.options.baseUrl ?? CJ_API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`,
    );
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value == null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url;
  }

  private async request<T>(method: "GET" | "POST", endpoint: string, options: RequestOptions = {}) {
    await this.throttle();

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (options.accessToken) headers["CJ-Access-Token"] = options.accessToken;

    const init: RequestInit = {
      method,
      headers,
      cache: "no-store",
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(this.url(endpoint, options.query), init);
    const raw = await response.text();
    const parsed = safeJsonParse(raw);

    if (!response.ok) {
      throw new CjDropshippingApiError(
        `CJdropshipping API HTTP ${response.status} on ${endpoint}`,
        { status: response.status },
      );
    }

    if (!parsed || typeof parsed !== "object") {
      throw new CjDropshippingApiError(
        `CJdropshipping API returned invalid JSON on ${endpoint}`,
        { status: response.status },
      );
    }

    return requireData(parsed as CjApiEnvelope<T>, endpoint);
  }

  authenticateWithApiKey(apiKey: string) {
    return this.request<CjAuthTokenData>("POST", "/authentication/getAccessToken", {
      body: { apiKey },
    });
  }

  refreshAccessToken(refreshToken: string) {
    return this.request<CjAuthTokenData>("POST", "/authentication/refreshAccessToken", {
      body: { refreshToken },
    });
  }

  getMyProducts(input: { accessToken: string; pageNumber: number; pageSize: number }) {
    return this.request<CjMyProductListData>("GET", "/product/myProduct/query", {
      accessToken: input.accessToken,
      query: {
        pageNumber: numericParam(input.pageNumber),
        pageSize: numericParam(input.pageSize),
      },
    });
  }

  queryInventoryBySku(input: { accessToken: string; sku: string }) {
    return this.request<CjInventoryBySkuRow[]>("GET", "/product/stock/queryBySku", {
      accessToken: input.accessToken,
      query: { sku: input.sku },
    });
  }
}

export function parseCjDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toInt(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizeCjSku(value: string | null | undefined) {
  return value?.trim() ?? "";
}
