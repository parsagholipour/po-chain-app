import "server-only";

const CJ_API_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";
const CJ_WEB_API_BASE_URL = "https://cjdropshipping.com";
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
  vid?: string | number | null;
  areaEn?: string | null;
  areaId?: string | number | null;
  countryCode?: string | null;
  countryNameEn?: string | null;
  storageNum?: number | string | null;
  totalInventoryNum?: number | string | null;
  cjInventoryNum?: number | string | null;
  factoryInventoryNum?: number | string | null;
  stock?: CjInventoryStock[] | null;
};

export type CjVariant = {
  vid?: string | number | null;
  pid?: string | number | null;
  variantName?: string | null;
  variantNameEn?: string | null;
  variantImage?: string | null;
  variantSku?: string | null;
  variantKey?: string | null;
  variantStandard?: string | null;
};

export type CjPrivateInventorySkuRow = {
  clientTransitQuantity?: number | string | null;
  clientAvailableQuantity?: number | string | null;
  clientFreezeQuantity?: number | string | null;
  clientLockQuantity?: number | string | null;
  clientUseQuantity?: number | string | null;
  clientDisputeQuantity?: number | string | null;
  clientDisputeCompleteQuantity?: number | string | null;
  productId?: string | number | null;
  variantId?: string | number | null;
  productName?: string | null;
  sku?: string | null;
  variantKey?: string | null;
  variantValue1?: string | null;
  variantValue2?: string | null;
  variantValue3?: string | null;
  storageId?: string | null;
  productType?: string | number | null;
  isPod?: number | boolean | null;
};

export type CjPrivateInventorySkuListData = {
  totalRecords?: number | string | null;
  content?: CjPrivateInventorySkuRow[] | null;
};

export type CjPrivateInventoryOrderRow = {
  unitPrice?: number | string | null;
  orderQuantity?: number | string | null;
  clientTransitQuantity?: number | string | null;
  clientAvailableQuantity?: number | string | null;
  clientFreezeQuantity?: number | string | null;
  clientLockQuantity?: number | string | null;
  clientUseQuantity?: number | string | null;
  clientDisputeQuantity?: number | string | null;
  clientDisputeCompleteQuantity?: number | string | null;
  productId?: string | number | null;
  sku?: string | null;
  storageId?: string | null;
  storage?: string | null;
  orderCode?: string | null;
  merchantId?: string | number | null;
};

export type CjPrivateInventoryStore = {
  areaId?: string | number | null;
  countryCode?: string | null;
  storageId?: string | null;
  storehouseName?: string | null;
  storehouseNameCN?: string | null;
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

type PrivateInventoryFilterInput = {
  keyword?: string | null;
  orderCode?: string | null;
  storageIds?: string[] | null;
  availableStock?: boolean | null;
  pack?: boolean | null;
  pod?: boolean | null;
  serviceProd?: boolean | null;
};

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

  private url(
    endpoint: string,
    query?: RequestOptions["query"],
    baseUrl = this.options.baseUrl ?? CJ_API_BASE_URL,
  ) {
    const url = new URL(
      `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`,
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

  private async privateInventoryRequest<T>(
    endpoint: string,
    input: {
      accessToken: string;
      body?: unknown;
    },
  ) {
    await this.throttle();

    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json;charset=utf-8",
      Origin: CJ_WEB_API_BASE_URL,
      Referer: `${CJ_WEB_API_BASE_URL}/mine/myInventoryNew/inventoryDocuments`,
      platform: "2",
      token: input.accessToken,
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
    };

    const response = await fetch(this.url(endpoint, undefined, CJ_WEB_API_BASE_URL), {
      method: "POST",
      headers,
      body: JSON.stringify(input.body ?? {}),
      cache: "no-store",
    });
    const raw = await response.text();
    const parsed = safeJsonParse(raw);

    if (!response.ok) {
      throw new CjDropshippingApiError(
        `CJdropshipping private inventory HTTP ${response.status} on ${endpoint}`,
        { status: response.status },
      );
    }

    if (!parsed || typeof parsed !== "object") {
      throw new CjDropshippingApiError(
        `CJdropshipping private inventory returned invalid JSON on ${endpoint}`,
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

  queryVariants(input: {
    accessToken: string;
    pid?: string | null;
    productSku?: string | null;
    variantSku?: string | null;
  }) {
    return this.request<CjVariant[]>("GET", "/product/variant/query", {
      accessToken: input.accessToken,
      query: {
        pid: input.pid,
        productSku: input.productSku,
        variantSku: input.variantSku,
      },
    });
  }

  queryInventoryByVid(input: { accessToken: string; vid: string }) {
    return this.request<CjInventoryBySkuRow[]>("GET", "/product/stock/queryByVid", {
      accessToken: input.accessToken,
      query: { vid: input.vid },
    });
  }

  queryInventoryBySku(input: { accessToken: string; sku: string }) {
    return this.request<CjInventoryBySkuRow[]>("GET", "/product/stock/queryBySku", {
      accessToken: input.accessToken,
      query: { sku: input.sku },
    });
  }

  getPrivateInventoryStores(input: { accessToken: string }) {
    return this.privateInventoryRequest<CjPrivateInventoryStore[]>(
      "/api/privateInventory/getStoreList",
      {
        accessToken: input.accessToken,
      },
    );
  }

  getPrivateInventoryDocumentSkus(
    input: PrivateInventoryFilterInput & {
      accessToken: string;
      pageNum: number;
      pageSize: number;
    },
  ) {
    return this.privateInventoryRequest<CjPrivateInventorySkuListData>(
      "/api/privateInventory/querySkuDetailPagePc",
      {
        accessToken: input.accessToken,
        body: {
          keyword: input.keyword?.trim() || undefined,
          orderCode: input.orderCode?.trim() || undefined,
          storageIds: input.storageIds?.length ? input.storageIds : undefined,
          availableStock: Boolean(input.availableStock),
          pack: Boolean(input.pack),
          pod: Boolean(input.pod),
          serviceProd: Boolean(input.serviceProd),
          pageNum: numericParam(input.pageNum),
          pageSize: numericParam(input.pageSize),
        },
      },
    );
  }

  getPrivateInventoryDocumentOrders(
    input: PrivateInventoryFilterInput & {
      accessToken: string;
      sku: string;
    },
  ) {
    return this.privateInventoryRequest<CjPrivateInventoryOrderRow[]>(
      "/api/privateInventory/querySkuDetailListBySkuPc",
      {
        accessToken: input.accessToken,
        body: {
          sku: input.sku.trim(),
          keyword: input.keyword?.trim() || undefined,
          orderCode: input.orderCode?.trim() || undefined,
          storageIds: input.storageIds?.length ? input.storageIds : undefined,
          availableStock: Boolean(input.availableStock),
          pack: Boolean(input.pack),
          pod: Boolean(input.pod),
          serviceProd: Boolean(input.serviceProd),
        },
      },
    );
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
