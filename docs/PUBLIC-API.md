# PO App — Public API & Webhooks

**Integration guide for external services.** Everything you need to read product data
out of PO App and receive change notifications in real time.

| | |
| --- | --- |
| **API version** | `v1` |
| **Base URL** | `https://<your-po-app-host>/api/v1` |
| **Auth** | `Authorization: Bearer <token>` |
| **Transport** | HTTPS, server-to-server |
| **Format** | JSON (UTF-8) |

---

## Contents

1. [Overview](#1-overview)
2. [Quickstart](#2-quickstart)
3. [Authentication](#3-authentication)
4. [Conventions](#4-conventions)
5. [Errors](#5-errors)
6. [Rate limits](#6-rate-limits)
7. [API reference](#7-api-reference)
8. [The Product object](#8-the-product-object)
9. [Integration recipes](#9-integration-recipes)
10. [Webhooks](#10-webhooks)
11. [Reference receiver](#11-reference-receiver)
12. [Troubleshooting](#12-troubleshooting)
13. [Operations](#13-operations)
14. [Versioning](#14-versioning)

---

## 1. Overview

PO App exposes two integration surfaces:

- **A read API** — pull products and their relations on demand or on a schedule.
- **Webhooks** — receive an HTTP callback the moment a product is created, changed, or
  deleted, so you don't have to poll aggressively.

Both are **scoped to a single store**. A token issued by one store can only ever read
that store's data; there is no cross-store access and no account-wide token.

### What you can do today

| Capability | Status |
| ---------- | ------ |
| Read products (list, filter, paginate, search) | ✅ Available |
| Read a product's manufacturer, category, type, collection | ✅ Embedded in every product |
| Receive `product.created` / `product.updated` / `product.deleted` webhooks | ✅ Available |
| Create, update, or delete products through the API | ❌ Not exposed — the API is read-only |
| Read purchase orders, manufacturing orders, shipments, invoices | ❌ Not exposed |

If you need one of the unavailable capabilities, talk to the PO App team — the surface is
designed to grow without breaking existing consumers.

### What you'll need

1. An **API token** (`poa_…`) — created by a store admin in **Settings → Developers**.
2. For webhooks: a **publicly reachable HTTPS endpoint** that can accept `POST` requests.

---

## 2. Quickstart

**Step 1 — Get a token.** Ask a store admin to open **Settings → Developers → API
tokens → Create token**, give it a name, select the `products:read` scope, and send you
the value. The token is displayed exactly once and cannot be recovered afterwards.

**Step 2 — Verify it works.**

```bash
export PO_TOKEN="poa_xxxxxxxxxxxxxxxxxxxxxxxx"
export PO_BASE="https://po.example.com/api/v1"

curl -s "$PO_BASE/me" -H "Authorization: Bearer $PO_TOKEN"
```

```json
{
  "data": {
    "tokenId": "8131ea34-c7b0-4b92-aa53-ee0db14b3cf8",
    "scopes": ["products:read"],
    "store": {
      "id": "4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13",
      "name": "Arcane Fortress",
      "slug": "arcane-fortress"
    }
  }
}
```

**Step 3 — Read your first page of products.**

```bash
curl -s "$PO_BASE/products?pageSize=2" -H "Authorization: Bearer $PO_TOKEN"
```

That's the whole setup. Continue to [Integration recipes](#9-integration-recipes) for a
full catalogue sync, or [Webhooks](#10-webhooks) to receive live updates.

---

## 3. Authentication

Every request must carry a bearer token:

```http
GET /api/v1/products HTTP/1.1
Host: po.example.com
Authorization: Bearer poa_l0_rwGVqLAFQD9ga7neS9xbzAJcSCUWIEz85bHO37h0
```

### Token format

Tokens look like `poa_` followed by 43 URL-safe base64 characters (256 bits of entropy).
The `poa_` prefix makes them easy to spot in logs and secret scanners.

PO App stores only a SHA-256 hash of the token. Nobody — not even a store admin — can
read the value back after creation. A lost token must be revoked and replaced.

### Scopes

A token grants only the scopes selected when it was created. A request that needs a
scope the token lacks is rejected with `403 insufficient_scope`.

| Scope | Grants |
| ----- | ------ |
| `products:read` | Read access to products and their embedded relations. Required by every endpoint currently published, including `/me`. |

### Expiry and revocation

- Tokens may be created with an expiry (30 days, 90 days, 1 year) or with none.
  An expired token returns `401 token_expired`.
- Revocation is immediate and permanent — a revoked token returns `401 unauthorized` on
  the very next request. There is no un-revoke; issue a new token instead.
- Last-used time and a request counter are recorded per token, so admins can spot
  tokens that are no longer in use before revoking them.

### Security requirements

> **Treat a token like a password.** It grants read access to the store's entire product
> catalogue, including cost prices.

- **Server-side only.** Never ship a token to a browser, mobile app, or any client you
  don't control. The API sends no CORS headers, so browser calls from another origin
  will fail — this is deliberate.
- **Store it in a secret manager or environment variable**, never in source control.
- **Use a separate token per consuming service.** When one service is decommissioned or
  compromised, you revoke one token instead of coordinating a rotation.
- **Rotate on staff changes** or on any suspicion of exposure. Create the new token,
  deploy it, then revoke the old one — both work simultaneously during the overlap.
- **Always use HTTPS.** A token sent over plain HTTP must be considered compromised.

---

## 4. Conventions

| Topic | Rule |
| ----- | ---- |
| **HTTP methods** | All published endpoints are `GET`. Other methods are rejected. |
| **Content type** | Responses are `application/json`, encoded UTF-8. |
| **Success envelope** | Single resource: `{ "data": { … } }`. Collection: `{ "data": [ … ], "pagination": { … } }`. |
| **Error envelope** | `{ "error": { "code": "…", "message": "…" } }` — see [Errors](#5-errors). |
| **Identifiers** | All ids are UUID v4 strings. |
| **Timestamps** | ISO 8601 with milliseconds, always UTC: `2026-07-30T08:09:10.000Z`. |
| **Money** | JSON numbers with two decimal places (`19.99`). Stored as exact decimals server-side, so no floating-point drift. Currency is the store's own; the API does not return a currency code. |
| **Nulls** | `null` means "not set". Fields are never omitted — every documented field is present on every response. |
| **Unknown query params** | Ignored, not rejected. |
| **New fields** | May be added to any response at any time. Parse defensively and ignore what you don't recognise. |

---

## 5. Errors

Every non-2xx response uses the same envelope:

```json
{
  "error": {
    "code": "insufficient_scope",
    "message": "This API token is missing the \"products:read\" scope."
  }
}
```

`code` is stable and safe to branch on. `message` is human-readable and may be reworded
between releases — don't parse it.

| Status | `code` | Meaning | What to do |
| ------ | ------ | ------- | ---------- |
| `400` | `invalid_request` | A query parameter was malformed (bad UUID, bad timestamp, unknown sort field). | Fix the request. Retrying unchanged will fail again. |
| `401` | `unauthorized` | Missing, malformed, unknown, or revoked token. | Check the header format. If the token was revoked, obtain a new one. Do not retry. |
| `401` | `token_expired` | The token passed its expiry date. | Obtain a new token. Do not retry. |
| `403` | `insufficient_scope` | Valid token, but it lacks the required scope. | Ask an admin to issue a token with the right scope. Do not retry. |
| `404` | `not_found` | No such record **in this store**. | Treat as "does not exist". Note that an id belonging to a different store also returns `404`, never `403`. |
| `429` | `rate_limited` | Too many requests. | Back off — see [Rate limits](#6-rate-limits). |
| `5xx` | — | Server-side fault. The body may not be JSON. | Retry with exponential backoff. |

A `401` caused by a missing token also carries a `WWW-Authenticate: Bearer realm="po-app"`
header.

**Rule of thumb:** retry `429` and `5xx`; never retry `400`, `401`, `403`, or `404`.

---

## 6. Rate limits

The default limit is **120 requests per minute per token**, applied as a sliding window.

When you exceed it you get `429` with these headers:

| Header | Meaning |
| ------ | ------- |
| `Retry-After` | Seconds to wait before retrying. |
| `RateLimit-Limit` | The configured ceiling. |
| `RateLimit-Remaining` | Always `0` on a `429`. |

> These headers appear **only on `429` responses**. Successful responses carry no
> rate-limit headers, so you cannot track your remaining budget proactively — handle
> `429` reactively instead.

Handling it correctly:

```js
async function request(url, token) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 5) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      continue;
    }
    return res;
  }
  throw new Error("Gave up after 5 attempts");
}
```

Notes:

- The limit is enforced **per token**, so splitting work across two tokens doubles your
  budget — but coordinate with the store admin first.
- Invalid credentials are rejected before the limiter runs; the budget is consumed only
  by authenticated requests.
- The limiter is per application process. If PO App runs behind multiple instances, the
  effective ceiling is the configured value multiplied by the instance count. Don't rely
  on the extra headroom.
- Prefer **large pages over many requests**: one call at `pageSize=200` costs the same as
  one call at `pageSize=10`.

---

## 7. API reference

### `GET /api/v1/me`

Confirms a token is live and reports what it can reach. Useful as a connectivity check
during setup and as a health probe afterwards. Requires `products:read`.

**Response `200`**

```json
{
  "data": {
    "tokenId": "8131ea34-c7b0-4b92-aa53-ee0db14b3cf8",
    "scopes": ["products:read"],
    "store": {
      "id": "4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13",
      "name": "Arcane Fortress",
      "slug": "arcane-fortress"
    }
  }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `tokenId` | string (uuid) | Identifies the token itself — useful when reporting a problem. Not the token value. |
| `scopes` | string[] | Scopes granted to this token. |
| `store.id` | string (uuid) | The store this token reads. Matches `storeId` in webhook payloads. |
| `store.name` | string | Display name. |
| `store.slug` | string | URL-safe identifier. |

---

### `GET /api/v1/products`

Lists products in the store. Requires `products:read`.

#### Query parameters

All parameters are optional.

| Parameter | Type | Default | Description |
| --------- | ---- | ------- | ----------- |
| `q` | string | — | Case-insensitive substring search across **name, SKU, UPC/GTIN, and description**. Does not search manufacturer or category names. |
| `sku` | string | — | Exact, case-sensitive SKU match. SKUs are unique within a store, so this returns at most one product. |
| `upcGtin` | string | — | Exact UPC/GTIN match. |
| `categoryId` | uuid \| `none` | — | Filter by category. `none` matches products with no category. |
| `typeId` | uuid \| `none` | — | Filter by product type. `none` matches products with no type. |
| `collectionId` | uuid \| `none` | — | Filter by collection. `none` matches products with no collection. |
| `manufacturerId` | uuid | — | Filter by default manufacturer. **Does not accept `none`** — every product has a manufacturer. |
| `verified` | `true` \| `false` | — | Filter by the verification flag. Any other value is ignored rather than rejected. |
| `updatedSince` | ISO 8601 | — | Only products whose `updatedAt` is **at or after** this instant. The comparison is inclusive. |
| `sort` | `name` \| `sku` \| `createdAt` \| `updatedAt` | `name` | Sort field. Any other value returns `400`. |
| `order` | `asc` \| `desc` | `asc` | Sort direction. Any value other than `desc` is treated as `asc`. |
| `page` | integer ≥ 1 | `1` | 1-based page number. Non-numeric or non-positive values fall back to the default. |
| `pageSize` | integer ≥ 1 | `50` | Results per page. Values above `200` are silently capped at `200`. |

Filters combine with AND. Passing several is fine:

```bash
curl -s "$PO_BASE/products?verified=true&categoryId=none&sort=updatedAt&order=desc&pageSize=100" \
  -H "Authorization: Bearer $PO_TOKEN"
```

#### Response `200`

```json
{
  "data": [ { "…": "product object" } ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 141,
    "totalPages": 3,
    "hasMore": true
  }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `data` | Product[] | The page of results. Empty array if nothing matches — never `null`. |
| `pagination.page` | integer | The page returned (echoes the effective value after fallbacks). |
| `pagination.pageSize` | integer | Results per page (echoes the effective value after capping). |
| `pagination.total` | integer | Total products matching the filters, across all pages. |
| `pagination.totalPages` | integer | Total pages. At least `1`, even when `total` is `0`. |
| `pagination.hasMore` | boolean | `true` when another page exists. **Use this to terminate a pagination loop.** |

Requesting a page beyond the end returns `200` with an empty `data` array, not `404`.

---

### `GET /api/v1/products/{id}`

Fetches one product. Requires `products:read`.

The path segment accepts **either** form:

| Form | Example | Notes |
| ---- | ------- | ----- |
| Product UUID | `/api/v1/products/c0000001-0000-4000-8000-00000000001f` | |
| `sku:<sku>` | `/api/v1/products/sku:BF-MS-OB100` | Lets you look up by your own key without storing PO App ids. URL-encode the SKU if it contains `/`, `?`, `#`, or spaces. |

```bash
curl -s "$PO_BASE/products/sku:BF-MS-OB100" -H "Authorization: Bearer $PO_TOKEN"
```

**Response `200`**

```json
{ "data": { "…": "product object" } }
```

**Errors**

| Status | `code` | Cause |
| ------ | ------ | ----- |
| `400` | `invalid_request` | The segment is neither a UUID nor `sku:<value>`, or the SKU part is empty. |
| `404` | `not_found` | No product with that id/SKU in this store. |

---

## 8. The Product object

The same representation is returned by the list endpoint, the single-product endpoint,
and the `product.created` / `product.updated` webhook payloads.

```json
{
  "id": "c0000001-0000-4000-8000-00000000001f",
  "name": "Obsidian Dice Set",
  "sku": "AF-DICE-001",
  "upcGtin": "0123456789012",
  "description": "Seven-piece polished set.",
  "imageLink": "https://cdn.example.com/dice.jpg",
  "cost": 4.25,
  "price": 19.99,
  "map": 17.99,
  "msrp": 24.99,
  "mop": 12,
  "quantityPerCarton": 48,
  "stockCount": 310,
  "orderByDate": "2026-09-01T00:00:00.000Z",
  "editingStatus": "standard",
  "verified": true,
  "defaultManufacturer": {
    "id": "a0000001-0000-4000-8000-000000000001",
    "name": "Ironforge Works",
    "region": "United States",
    "email": "sales@ironforge.example",
    "contactNumber": "+1 555 0100"
  },
  "category": { "id": "d0000001-0000-4000-8000-000000000005", "name": "Accessories" },
  "type": { "id": "e0000001-0000-4000-8000-000000000002", "name": "Dice" },
  "collection": { "id": "f0000001-0000-4000-8000-000000000003", "name": "Core Line" },
  "createdAt": "2026-01-04T10:11:12.000Z",
  "updatedAt": "2026-07-30T08:09:10.000Z"
}
```

### Fields

| Field | Type | Nullable | Description |
| ----- | ---- | :------: | ----------- |
| `id` | string (uuid) | no | Stable primary identifier. Never reused. |
| `name` | string | no | Display name. Not unique. |
| `sku` | string | no | **Unique within the store.** The natural key for matching against your own catalogue. |
| `upcGtin` | string | yes | UPC or GTIN barcode number. Not guaranteed unique. |
| `description` | string | yes | Free text. May contain newlines. |
| `imageLink` | string | **no** | External image URL. Defaults to an **empty string**, not `null`, when unset — check for `""`. |
| `cost` | number | yes | Unit cost to the store. Commercially sensitive. |
| `price` | number | yes | Selling price. |
| `map` | number | yes | Minimum advertised price. |
| `msrp` | number | yes | Manufacturer's suggested retail price. |
| `mop` | integer | yes | Minimum order pieces. |
| `quantityPerCarton` | integer | yes | Units per shipping carton. |
| `stockCount` | integer | yes | Last known stock on hand. See the caveat below. |
| `orderByDate` | string (ISO 8601) | yes | Cut-off date for reordering. Carries a time component but is meaningful only as a calendar date — read the date part and ignore the time. |
| `editingStatus` | enum | no | Lifecycle state — see the table below. |
| `verified` | boolean | no | Whether store staff have confirmed the product's data. |
| `defaultManufacturer` | object | no | Always present — every product has a manufacturer. |
| `defaultManufacturer.id` | string (uuid) | no | |
| `defaultManufacturer.name` | string | no | |
| `defaultManufacturer.region` | string | no | Free-text region, e.g. `"United States"`. Not an ISO country code. |
| `defaultManufacturer.email` | string | yes | |
| `defaultManufacturer.contactNumber` | string | yes | Free-text phone number, format not normalised. |
| `category` | object \| null | yes | `{ id, name }` or `null` when uncategorised. |
| `type` | object \| null | yes | `{ id, name }` or `null`. |
| `collection` | object \| null | yes | `{ id, name }` or `null`. |
| `createdAt` | string (ISO 8601) | no | |
| `updatedAt` | string (ISO 8601) | no | Changes on every write. Use it for incremental sync and for ordering concurrent webhook events. |

> **`stockCount` caveat.** Stock is written by PO App's inventory sync jobs (Shopify,
> CJdropshipping) as well as by staff edits. Those sync jobs do **not** emit
> `product.updated` webhooks — see [Events](#events). If you need current stock, poll
> with `updatedSince` rather than relying on webhooks.

### `editingStatus` values

| Value | Meaning |
| ----- | ------- |
| `standard` | Normal, actively maintained product. |
| `final_stock` | Selling through remaining inventory; will not be reordered. |
| `one_print_only` | Single production run, no reprint planned. |
| `discontinued` | No longer sold. |

New values may be added. Treat an unrecognised value as `standard` rather than failing.

### Fields deliberately not exposed

Internal columns — the owning store id, the creating user, and internal object-storage
keys for images, barcodes, and packaging artwork — are omitted by design. If you need
something that isn't here, ask; adding a field is a backwards-compatible change.

---

## 9. Integration recipes

### Full catalogue sync

Pull everything, one page at a time. Sort by `createdAt asc` — it is the only field that
never changes, so rows cannot shuffle between pages while you're paging through them.

```js
const BASE = "https://po.example.com/api/v1";

async function* allProducts(token, filters = {}) {
  let page = 1;

  for (;;) {
    const qs = new URLSearchParams({
      ...filters,
      sort: "createdAt",
      order: "asc",
      pageSize: "200",
      page: String(page),
    });

    const res = await fetch(`${BASE}/products?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 5) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue; // same page again
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`${res.status} ${body?.error?.code ?? "unknown"}`);
    }

    const { data, pagination } = await res.json();
    yield* data;

    if (!pagination.hasMore) return;
    page += 1;
  }
}

for await (const product of allProducts(process.env.PO_TOKEN)) {
  await upsertIntoMyCatalogue(product);
}
```

> **Pagination is not a snapshot.** Products created while you page through will shift
> results. Sorting by `createdAt asc` means new rows land on the last page, which is
> harmless; sorting by `name` or `updatedAt` can cause a row to be skipped or repeated.
> Always upsert by `id` rather than assuming each row is seen exactly once.

### Incremental sync

Keep a full copy fresh by asking only for what changed. Overlap the window slightly so
nothing slips through between runs.

```js
const OVERLAP_MS = 60_000; // re-fetch the last minute to absorb clock skew

async function incrementalSync(token, lastRunAt) {
  const since = new Date(lastRunAt.getTime() - OVERLAP_MS).toISOString();
  const startedAt = new Date();

  for await (const product of allProducts(token, { updatedSince: since })) {
    await upsertIntoMyCatalogue(product); // idempotent: safe to see a product twice
  }

  return startedAt; // persist as the next run's lastRunAt
}
```

Points that matter:

- `updatedSince` is **inclusive** (`>=`), so a product updated exactly on the boundary is
  returned. Combined with the overlap, expect to re-process a few unchanged products
  each run — make your upsert idempotent.
- Record the timestamp from **before** the run starts, not after, so changes made during
  the run are picked up next time.
- Deletions are invisible to this method — a deleted product simply stops appearing.
  Subscribe to `product.deleted` if you need to remove rows, or periodically reconcile
  with a full sync.

### Look up a single product by your own SKU

```bash
curl -s "$PO_BASE/products/sku:AF-DICE-001" -H "Authorization: Bearer $PO_TOKEN"
```

Returns `404` when the SKU is unknown, so it doubles as an existence check. Prefer this
over `GET /products?sku=…` when you want exactly one result.

### Choosing between polling and webhooks

| Need | Approach |
| ---- | -------- |
| React within seconds to catalogue edits | Webhooks |
| Keep a warehouse/BI copy fresh hourly | Incremental sync (`updatedSince`) |
| Track stock levels | Incremental sync — stock changes don't emit webhooks |
| Guarantee eventual consistency | Webhooks **plus** a nightly incremental sync as a safety net |

The last row is the recommended production setup: webhooks for latency, a periodic sync
to repair anything a webhook failed to deliver.

---

## 10. Webhooks

### How it works

1. A store admin registers your URL in **Settings → Developers → Webhook endpoints** and
   selects the events you want.
2. PO App generates a **signing secret** (`whsec_…`) for that endpoint, displayed once.
3. When a subscribed event occurs, PO App `POST`s a signed JSON body to your URL.
4. Your endpoint verifies the signature and responds `2xx`.
5. If it doesn't, PO App retries with backoff for about nine hours.

Each endpoint gets its own secret, and each event is queued per endpoint — a slow or
broken receiver never delays anyone else's deliveries.

### Endpoint requirements

| Requirement | Detail |
| ----------- | ------ |
| Method | `POST` — your route must accept it. |
| Scheme | **HTTPS in production.** Plain HTTP, `localhost`, and private/loopback IP ranges (`10.x`, `192.168.x`, `172.16–31.x`, `127.x`, `169.254.x`) are rejected at registration time. |
| Response | Any `2xx`. |
| Timeout | **10 seconds.** Slower responses are aborted and treated as failures. |
| Redirects | **Not followed.** A `3xx` counts as a failure — register the final URL. |
| Body | Read the **raw bytes** before parsing; you need them to verify the signature. |

### Request headers

| Header | Example | Purpose |
| ------ | ------- | ------- |
| `Content-Type` | `application/json` | |
| `User-Agent` | `PO-App-Webhooks/1.0` | Identifies the sender. |
| `X-PO-Event` | `product.updated` | Event name. Also present in the body. |
| `X-PO-Delivery` | `fd4cfedc-a53b-…` | **Delivery id — identical across every retry of the same event.** Use it to deduplicate. |
| `X-PO-Webhook-Id` | `1a0d75dd-be0c-…` | Which registered endpoint this was sent to. Useful when one service backs several endpoints. |
| `X-PO-Timestamp` | `1785657600` | Unix seconds when the signature was computed. |
| `X-PO-Signature` | `t=1785657600,v1=9f86d0…` | HMAC signature — see below. |

### Verifying the signature

**This is mandatory.** Without it, anyone who learns your URL can post fake events.

The signed string is `<timestamp>.<raw request body>`, and the signature is its
HMAC-SHA256 keyed with your endpoint secret, hex-encoded.

`X-PO-Signature` is a comma-separated list of `key=value` pairs:

```
t=1785657600,v1=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

- `t` — Unix seconds, identical to `X-PO-Timestamp`.
- `v1` — the hex HMAC. Future schemes would add `v2`, so **match on the key name** rather
  than assuming position.

Verification steps:

1. Parse `t` and `v1`.
2. Reject if `|now − t|` exceeds your tolerance — **300 seconds** is the recommended
   window. This is what stops replay attacks.
3. Compute `HMAC_SHA256(secret, "<t>.<raw body>")` and hex-encode it.
4. Compare with `v1` using a **constant-time** comparison.

> **Verify against the raw body.** Parsing JSON and re-serialising it changes the bytes
> (key order and whitespace are not preserved) and the signature will never match. In
> Express use `express.raw()`; in Next.js use `await request.text()`; in Django use
> `request.body`; in Rails use `request.raw_post`.

#### Node.js / TypeScript

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader) return false;

  const parts = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")] as const;
    }),
  );

  const timestamp = Number(parts.get("t"));
  const provided = parts.get("v1");
  if (!Number.isFinite(timestamp) || !provided) return false;

  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

#### Python

```python
import hashlib
import hmac
import time


def verify_webhook(raw_body: bytes, signature_header: str, secret: str,
                   tolerance_seconds: int = 300) -> bool:
    if not signature_header:
        return False

    parts = {}
    for piece in signature_header.split(","):
        key, _, value = piece.strip().partition("=")
        if value:
            parts[key] = value

    try:
        timestamp = int(parts["t"])
        provided = parts["v1"]
    except (KeyError, ValueError):
        return False

    if abs(time.time() - timestamp) > tolerance_seconds:
        return False

    signed = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()

    return hmac.compare_digest(expected, provided)
```

#### PHP

```php
function verify_webhook(
    string $rawBody,
    ?string $signatureHeader,
    string $secret,
    int $toleranceSeconds = 300
): bool {
    if ($signatureHeader === null) {
        return false;
    }

    $parts = [];
    foreach (explode(',', $signatureHeader) as $piece) {
        $kv = explode('=', trim($piece), 2);
        if (count($kv) === 2) {
            $parts[$kv[0]] = $kv[1];
        }
    }

    if (!isset($parts['t'], $parts['v1'])) {
        return false;
    }

    $timestamp = (int) $parts['t'];
    if (abs(time() - $timestamp) > $toleranceSeconds) {
        return false;
    }

    $expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);

    return hash_equals($expected, $parts['v1']);
}
```

### Payload envelope

Every delivery has the same outer shape:

```json
{
  "id": "fd4cfedc-a53b-491e-9456-9ccdf9c07749",
  "event": "product.updated",
  "createdAt": "2026-08-01T23:07:51.633Z",
  "storeId": "4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13",
  "data": { }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | string (uuid) | Delivery id — same value as `X-PO-Delivery`, stable across retries. |
| `event` | string | Event name — same value as `X-PO-Event`. |
| `createdAt` | string (ISO 8601) | When the event was queued, **not** when this attempt was sent. |
| `storeId` | string (uuid) | The store the event belongs to. Matches `store.id` from `/api/v1/me`. |
| `data` | object | Event-specific body — see below. |

> **JSON key order is not stable.** The payload round-trips through the database, so keys
> may arrive in a different order than shown here. Parse by name; never rely on ordering
> or on byte-for-byte equality between deliveries.

### Events

| Event | `data` |
| ----- | ------ |
| `product.created` | The complete [Product object](#8-the-product-object). |
| `product.updated` | The complete Product object **after** the change. Previous values are not included. |
| `product.deleted` | `{ "id", "sku", "name", "deletedAt" }` — identifiers only, since the product no longer exists. |
| `webhook.test` | `{ "message", "sentAt" }`. Sent only by the **Test** button in Settings; never emitted by real activity. Ignore it in production logic, but do return `2xx` so the test reports success. |

`product.deleted` example:

```json
{
  "id": "c46178d7-dce6-4606-9d91-8279b023cf75",
  "event": "product.deleted",
  "createdAt": "2026-08-01T23:12:04.881Z",
  "storeId": "4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13",
  "data": {
    "id": "c0000001-0000-4000-8000-00000000001f",
    "sku": "BF-MS-OB100",
    "name": "Black",
    "deletedAt": "2026-08-01T23:12:04.879Z"
  }
}
```

#### What does *not* emit an event

Product events fire on writes made through PO App's product endpoints — the UI and the
internal API. Two things are deliberately excluded:

- **Inventory sync jobs.** The Shopify and CJdropshipping integrations rewrite
  `stockCount` on every run whether or not the value changed. Emitting from there would
  produce a continuous stream of no-op events. Poll `updatedSince` for stock freshness.
- **Bulk database maintenance.** Direct data fixes applied by the PO App team bypass the
  application layer.

### Idempotency and ordering

- **Deliveries are at-least-once.** A receiver that times out after doing its work will
  still be retried. Deduplicate on `X-PO-Delivery`, or make your handler naturally
  idempotent (upsert by product `id`).
- **Order is not guaranteed.** Two rapid edits to the same product may arrive in either
  order, and a retry of an older event can land after a newer one. When two events
  concern the same product, **trust the one with the later `data.updatedAt`** and discard
  the older. For `product.deleted`, compare `data.deletedAt` against your stored
  `updatedAt`.
- **Respond fast, work later.** Acknowledge with `2xx` immediately and process
  asynchronously if your handler could exceed the 10-second timeout. A slow `200` is
  treated as a failure and retried, which usually makes the backlog worse.

### Retries and auto-disable

A delivery that fails — non-2xx, redirect, timeout, connection error, or TLS failure — is
retried on this schedule:

| Attempt | Sent after the previous failure |
| :-----: | ------------------------------- |
| 1 | immediately when the event occurs |
| 2 | ~1 minute |
| 3 | ~5 minutes |
| 4 | ~30 minutes |
| 5 | ~2 hours |
| 6 | ~6 hours |

Six attempts spanning roughly **nine hours**. After the last one the delivery is marked
`failed` and stops automatically. A store admin can still replay it by hand from
**Settings → Developers → Recent deliveries**, and every attempt is recorded there with
its HTTP status and error message.

**Auto-disable:** an endpoint that accumulates **20 consecutive failed attempts** — counted
across deliveries, so four events retrying five times each will reach it — is disabled and
stops receiving events entirely. Any successful delivery resets the counter to zero. An admin
re-enables it in Settings, which also clears the counter. If your receiver is going down
for planned maintenance longer than a few hours, ask an admin to disable the endpoint
first and re-enable it afterwards — that avoids the auto-disable and the retry storm.

### Testing your receiver

1. **Use the Test button.** Settings → Developers → the endpoint → **Test** sends a real
   `webhook.test` event through the full signing and delivery path, then reports the HTTP
   status it got back. This is the fastest way to prove signature verification works.
2. **Local development.** Private and loopback addresses are rejected in production, so
   expose your local server through an HTTPS tunnel (ngrok, Cloudflare Tunnel) and
   register the tunnel URL.
3. **Check the delivery log.** Every attempt appears under **Recent deliveries** with
   status, attempt count, HTTP response code, and the first 2000 characters of your
   response body — which makes your own error messages visible to the admin debugging it.

### Rotating a signing secret

Admins can rotate a secret from the endpoint's actions. The new value is shown once and
takes effect immediately: every delivery signed after that moment uses it, **including
pending retries of events queued before the rotation**. Only requests already on the wire
were signed with the old secret.

To rotate without rejecting events, have your receiver accept **either** secret during the
changeover — try the new one, fall back to the old — then remove the old one once the
delivery log shows a clean run.

---

## 11. Reference receiver

A complete, production-shaped Express receiver:

```js
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const app = express();
const SECRET = process.env.PO_WEBHOOK_SECRET;
const TOLERANCE_SECONDS = 300;

// Raw body is required for signature verification.
app.post("/hooks/po-app", express.raw({ type: "application/json" }), (req, res) => {
  const rawBody = req.body.toString("utf8");

  if (!verify(rawBody, req.get("x-po-signature"), SECRET)) {
    return res.status(401).send("invalid signature");
  }

  const event = JSON.parse(rawBody);

  // Acknowledge first — the sender times out after 10 seconds.
  res.status(200).json({ received: true });

  // Then do the work, out of band.
  handle(event).catch((error) => {
    console.error("[po-app-webhook] handler failed", event.id, error);
  });
});

const seen = new Set(); // use Redis or a table in production

async function handle(event) {
  if (seen.has(event.id)) return; // at-least-once delivery
  seen.add(event.id);

  switch (event.event) {
    case "product.created":
    case "product.updated":
      await upsertProduct(event.data); // key on data.id, guard with data.updatedAt
      break;
    case "product.deleted":
      await removeProduct(event.data.id);
      break;
    case "webhook.test":
      console.log("[po-app-webhook] test event received");
      break;
    default:
      console.warn("[po-app-webhook] unknown event", event.event); // forwards-compatible
  }
}

function verify(rawBody, header, secret) {
  if (!header) return false;

  const parts = new Map(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );

  const timestamp = Number(parts.get("t"));
  const provided = parts.get("v1");
  if (!Number.isFinite(timestamp) || !provided) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

app.listen(3000);
```

---

## 12. Troubleshooting

| Symptom | Likely cause |
| ------- | ------------ |
| `401 unauthorized` on every request | Header isn't exactly `Authorization: Bearer <token>`, the token was revoked, or a newline/quote was copied with the value. Confirm with `GET /api/v1/me`. |
| `401 token_expired` | The token hit its expiry date. Ask for a new one. |
| `403 insufficient_scope` | Token was created without `products:read`. Scopes cannot be edited — issue a new token. |
| `404` for a product you can see in the UI | The token belongs to a **different store**. Check `store.id` from `/api/v1/me`. |
| `400 invalid_request` on a filter | A UUID parameter got a non-UUID value, or `manufacturerId=none` was used (only category/type/collection accept `none`). |
| Frequent `429` | Requesting small pages in a tight loop. Raise `pageSize` to `200` and honour `Retry-After`. |
| Browser request fails with a CORS error | Expected — the API is server-to-server only and sends no CORS headers. Proxy it through your own backend; never expose the token to a browser. |
| Signature never verifies | You're hashing a re-serialised body instead of the raw bytes; or hashing the body alone instead of `<timestamp>.<body>`; or comparing against `t` instead of `v1`. |
| Signature verifies locally but fails in production | A body-parser middleware is consuming the stream before your handler. Mount the raw parser on the webhook route specifically. |
| Webhooks stopped arriving | The endpoint was auto-disabled after 20 consecutive failures. Check **Settings → Developers**, fix the receiver, then re-enable. |
| Duplicate events | Normal — delivery is at-least-once. Deduplicate on `X-PO-Delivery`. |
| Events arrive out of order | Normal and not guaranteed. Resolve with `data.updatedAt`. |
| Stock changes never arrive as webhooks | By design — inventory sync writes don't emit events. Poll `updatedSince`. |
| `product.updated` with no visible change | An edit touched a field you don't consume, or a save re-wrote identical values. Compare `updatedAt` and skip if unchanged. |

When reporting a problem to the PO App team, include the **`tokenId`** from
`GET /api/v1/me` and, for webhook issues, the **`X-PO-Delivery`** id. Both are safe to
share — neither reveals a secret.

---

## 13. Operations

*This section is for the team running PO App, not for external consumers.*

### Environment variables

| Variable | Required | Purpose |
| -------- | :------: | ------- |
| `WEBHOOK_SIGNING_ENCRYPTION_KEY` | recommended | pgcrypto passphrase for per-endpoint signing secrets. **Keep stable** — changing it makes existing secrets undecryptable and every delivery will fail until secrets are rotated. Falls back to `PAYMENT_PROVIDER_ENCRYPTION_KEY` when unset. |
| `WEBHOOK_INTERNAL_DISPATCH_ENABLED` | no | Defaults to enabled. Set to `false` to stop the in-process retry sweep — do this if you drive retries from an external scheduler, or when running multiple instances and want only one dispatching. |
| `WEBHOOK_DISPATCH_TOKEN` | no | Bearer token authorising `POST /api/webhook-deliveries/dispatch` without a session. |
| `PUBLIC_API_RATE_LIMIT_MAX` | no | Requests per window per token. Default `120`. |
| `PUBLIC_API_RATE_LIMIT_WINDOW_MS` | no | Window length in ms. Default `60000`. |

### Retry worker

An in-process `node-schedule` job sweeps for due deliveries every minute. Newly queued
events are also dispatched immediately, without waiting for the sweep.

To drive retries externally instead, set `WEBHOOK_INTERNAL_DISPATCH_ENABLED=false` and
call:

```bash
curl -X POST https://po.example.com/api/webhook-deliveries/dispatch \
  -H "Authorization: Bearer $WEBHOOK_DISPATCH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'
```

Responds with `{ "attempted": n, "succeeded": n, "failed": n }`. Deliveries are claimed
with an atomic conditional update, so concurrent callers cannot double-send. A session
with internal store access can also call this endpoint without the token.

### Internal management endpoints

Session-authenticated, used by the Settings UI. Store-scoped and closed to distributor
accounts.

| Endpoint | Purpose |
| -------- | ------- |
| `GET`/`POST` `/api/api-tokens` | List / create tokens. Plaintext returned only on create. |
| `PATCH`/`DELETE` `/api/api-tokens/{id}` | Rename / revoke (soft delete, preserves the audit trail). |
| `GET`/`POST` `/api/webhook-endpoints` | List / create endpoints. Secret returned only on create. |
| `PATCH`/`DELETE` `/api/webhook-endpoints/{id}` | Update / delete. Re-enabling clears `consecutiveFailures`. |
| `POST` `/api/webhook-endpoints/{id}/rotate-secret` | Issue a new signing secret. |
| `POST` `/api/webhook-endpoints/{id}/test` | Send a `webhook.test` event synchronously. |
| `GET` `/api/webhook-deliveries` | Delivery log, filterable by status and endpoint. |
| `POST` `/api/webhook-deliveries/{id}/retry` | Manual replay. |
| `POST` `/api/webhook-deliveries/dispatch` | Worker trigger (see above). |

### Where the code lives

| Path | Responsibility |
| ---- | -------------- |
| `app/api/v1/` | Public API route handlers. |
| `lib/api-tokens.ts` | Token generation, hashing, `requireApiToken`, rate limiting. |
| `lib/public-api/product.ts` | The public product shape — **the contract**. Removing a field here is a breaking change. |
| `lib/developer-api-constants.ts` | Scope and event vocabulary shared by server and UI. |
| `lib/webhooks/delivery.ts` | Outbox: enqueue, claim, send, backoff, auto-disable. |
| `lib/webhooks/signature.ts` | Signing and verification. |
| `lib/webhooks/encryption.ts` | pgcrypto wrapper for endpoint secrets. |
| `lib/webhooks/product-events.ts` | Emitters called from the product routes. |
| `lib/webhooks/scheduler.ts` | The per-minute retry sweep. |
| `app/settings/developers-settings-view.tsx` | The Settings → Developers UI. |
| `prisma/schema.prisma` | `ApiToken`, `WebhookEndpoint`, `WebhookDelivery`. |

### Data retention

`WebhookDelivery` rows accumulate — one per event per subscribed endpoint, retained
indefinitely, each holding the full event payload. On a busy store this table will need a
pruning job. Deleting an endpoint cascades to its deliveries.

---

## 14. Versioning

The version lives in the URL path (`/api/v1`). Within `v1`:

**Backwards-compatible changes may ship at any time — your integration must tolerate them:**

- New fields on existing responses.
- New optional query parameters.
- New endpoints.
- New `editingStatus` values or new event types.
- Reworded `message` text in error responses.

**Breaking changes get a new version path (`/api/v2`), with `v1` supported during a
published deprecation window:**

- Removing or renaming a field.
- Changing a field's type or nullability.
- Changing the meaning of an existing `code`.
- Removing an endpoint or a query parameter.

To stay compatible: ignore unknown fields, don't depend on JSON key order, branch on
`error.code` rather than `message`, and treat unrecognised enum values as a safe default.

### Changelog

| Version | Date | Change |
| ------- | ---- | ------ |
| `v1` | 2026-08-02 | Initial release: read-only products with embedded relations, scoped API tokens, `product.created` / `product.updated` / `product.deleted` webhooks. |
