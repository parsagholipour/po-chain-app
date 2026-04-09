# PO App — project brief for AI-assisted work

Pass this file (plus your feature request) to an AI coding assistant. It summarizes **what the app does**, **where code lives**, and **constraints** so changes stay consistent.

For local setup, scripts, MinIO, and generic Next.js patterns, see the root **[README.md](../README.md)**.

---

## 1. Product intent

Internal **operations app** for a business that:

1. **Records distributor orders** as **Purchase Orders (PO)** — one primary sale channel per PO, line items = product + quantity only (no manufacturer on the line).
2. **Records internal replenishment** as **Stock orders** — same underlying table and line model as POs, distinguished by a **`type`** column (`distributor` vs `stock`); no sale channel; **separate** HTTP routes and App Router pages from POs.
3. **Runs manufacturing** as **Manufacturing Orders (MO)** — links one-or-more **distributor POs and/or stock orders** (same M2M and line-allocation mechanics), tracks manufacturers (pivot: status + optional invoice), allocates order lines to manufacturers with `verified` on the pivot, and attaches **manufacturing shipments** (M2M: MO ↔ `ManufacturingShipping`).

**Rule of thumb:** PO = “what we bought from the channel / logistics state”. Stock order = “internal stock pipeline / same logistics statuses, no channel”. MO = “what we asked factories to do / production + shipment state”.

---

## 2. Tech stack

| Layer | Choice |
|--------|--------|
| Framework | **Next.js 16** App Router (this repo may differ from public Next docs — see **AGENTS.md** / `node_modules/next/dist/docs/` if APIs behave unexpectedly) |
| DB | **PostgreSQL** via **Prisma 7** (client generated to `app/generated/prisma`) |
| UI | **React**, **Tailwind v4**, **shadcn/ui**, **Lucide** |
| Client data | **TanStack Query**, **Axios** (`@/lib/axios`) |
| Forms / API body validation | **Zod** (`lib/validations/*`) |
| Auth | **NextAuth**; API routes use `getSessionUserId()` from `@/lib/session-user` |
| Files | **S3-compatible (MinIO)** — see README |

Dev server is often **port 4000** (`next dev -p 4000`).

---

## 3. Domain model (Prisma)

Source of truth: **`prisma/schema.prisma`**.

### Purchase Order row (`PurchaseOrder`)

Shared table for **distributor PO** and **stock order**:

- **`PurchaseOrder`**: `number` (auto, shared sequence), `name`, **`type`** (**`PurchaseOrderType`**: `distributor` \| `stock`), `status` (**`PurchaseOrderStatus`**: `open` \| `in_transit` \| `closed`), `documentKey?`, **`saleChannelId?`** (required in practice for `distributor`, always `null` for `stock`).
- **`PurchaseOrderLine`**: `productId`, `quantity` — **no** `manufacturerId` on the line.

### Manufacturing Order

- **`ManufacturingOrder`**: `number` (auto), `name`, `status` (**`ManufacturingOrderStatus`**: full workflow e.g. `open` … `closed`), `documentKey?`.
- **`ManufacturingOrderManufacturer`**: composite PK `(manufacturingOrderId, manufacturerId)`, pivot status (`ManufacturingOrderManufacturerStatus`), optional **`invoiceId`** (1:1 with `Invoice`).
- **`ManufacturingOrderPurchaseOrder`**: M2M MO ↔ `PurchaseOrder` (**distributor** or **stock** rows).
- **`ManufacturingOrderPurchaseOrderLine`**: MO ↔ `PurchaseOrderLine` with **`verified`**, **`manufacturerId`** (allocation must use a manufacturer on that MO; line’s PO must be linked to the MO).
- **`ManufacturingShipping`** + **`ManufacturingOrderManufacturingShipping`**: shipment records, M2M with MO.

### Shared master data

- **`Manufacturer`**, **`SaleChannel`** (`SaleChannelType`: distributor \| amazon \| cjdropshipping), **`Product`** (has `defaultManufacturerId`, `verified`).
- **`Invoice`**: attached to **`ManufacturingOrderManufacturer`** only (not PO).

### Users

- **`User`**: Keycloak-backed (`keycloakSub`); owns `createdBy` relations across entities.

---

## 4. HTTP API map (Route Handlers)

Base: `app/api/`. All business routes expect an authenticated user unless noted.

**Purchase orders** (only `type === distributor`)

| Method | Path | Role |
|--------|------|------|
| GET/POST | `/api/purchase-orders` | List (filters: `status`, `q`, `saleChannelId`, `manufacturerId`) / create |
| GET/PATCH/DELETE | `/api/purchase-orders/[id]` | Detail / patch (name, distributor status, document, sale channel) / delete |
| GET/POST | `/api/purchase-orders/[id]/lines` | Lines / add line |
| PATCH/DELETE | `/api/purchase-orders/[id]/lines/[lineId]` | Update / delete line |
| GET | `/api/purchase-orders/open-counts` | `{ bySaleChannel, byManufacturer }` for PO list badges |

**Stock orders** (only `type === stock` — separate paths, same Prisma models)

| Method | Path | Role |
|--------|------|------|
| GET/POST | `/api/stock-orders` | List (filters: `status`, `q`, `manufacturerId`) / create (no sale channel) |
| GET/PATCH/DELETE | `/api/stock-orders/[id]` | Detail / patch (name, status, document) / delete |
| GET/POST | `/api/stock-orders/[id]/lines` | Lines / add line |
| PATCH/DELETE | `/api/stock-orders/[id]/lines/[lineId]` | Update / delete line |
| GET | `/api/stock-orders/open-counts` | `{ byManufacturer }` for list badges |

**Manufacturing orders**

| Method | Path | Role |
|--------|------|------|
| GET/POST | `/api/manufacturing-orders` | List / create (`purchaseOrderIds`, `manufacturers[]`, …) |
| GET/PATCH/DELETE | `/api/manufacturing-orders/[id]` | Detail include: `lib/manufacturing-order-include.ts` / delete |
| PATCH | `/api/manufacturing-orders/[id]/manufacturers/[manufacturerId]` | Pivot status + create/update invoice |
| POST | `/api/manufacturing-orders/[id]/lines` | Add **allocation** (`purchaseOrderLineId`, `manufacturerId`, `verified?`) |
| PATCH/DELETE | `/api/manufacturing-orders/[id]/lines/[purchaseOrderLineId]` | Allocation |
| POST | `/api/manufacturing-orders/[id]/shippings` | Create shipping + link to MO |
| PATCH/DELETE | `/api/manufacturing-orders/[id]/shippings/[shippingId]` | Shipping row (scoped to MO via join) |
| POST | `/api/manufacturing-orders/[id]/purchase-orders` | Body `{ purchaseOrderId }` (distributor PO or stock order) |
| DELETE | `/api/manufacturing-orders/[id]/purchase-orders/[purchaseOrderId]` | Unlink + remove allocations for that PO’s lines |
| GET | `/api/manufacturing-orders/open-counts` | `{ byManufacturer }` for MO list badges |

**Other**

- `/api/manufacturers`, `/api/sale-channels`, `/api/products` — CRUD-style resources.
- `/api/invoices/[id]` — PATCH invoice; GET includes `manufacturingOrderManufacturer` + `manufacturingOrder`.
- `/api/storage/*` — uploads / presign (see README).

**Guards / helpers**

- `lib/mo-line-guard.ts` — `purchaseOrderLineLinkedToMo`, `manufacturerOnManufacturingOrder`.
- `lib/purchase-order-type.ts` — string constants matching `PurchaseOrderType` for route `where` clauses.

---

## 5. Frontend map (App Router)

| URL | File(s) | Purpose |
|-----|---------|---------|
| `/` | `app/page.tsx` | Dashboard cards |
| `/manufacturing-orders` | `app/manufacturing-orders/page.tsx`, `manufacturing-orders-list-view.tsx` | MO list (by manufacturer) |
| `/manufacturing-orders/new` | `app/manufacturing-orders/new/` | MO wizard |
| `/manufacturing-orders/[id]` | `app/manufacturing-orders/[id]/` + `mo-detail-view.tsx` | MO detail |
| `/purchase-orders-overview` | `app/purchase-orders-overview/page.tsx` | PO list |
| `/purchase-orders` | `app/purchase-orders/page.tsx` | **Redirects** to `/manufacturing-orders` |
| `/purchase-orders/new` | `app/purchase-orders/new/` | PO wizard |
| `/purchase-orders/[id]` | `app/purchase-orders/[id]/` + `po-detail-view.tsx` | PO detail |
| `/stock-orders` | `app/stock-orders/page.tsx`, `stock-orders-list-view.tsx` | Stock order list |
| `/stock-orders/new` | `app/stock-orders/new/` | Stock order wizard |
| `/stock-orders/[id]` | `app/stock-orders/[id]/` + `stock-order-detail-view.tsx` | Stock order detail |
| `/manufacturers`, `/sale-channels`, `/products`, `/account` | respective `app/*/page.tsx` | Master data / account |

**Shell navigation:** `components/admin-shell.tsx` — sidebar labels and hrefs.

**Shared PO / stock / MO UI**

- `components/po/purchase-order/` — headers, lines, shipments, manufacturers section (used on **MO** detail for manufacturer pivots), dialogs. `PoDetailHeader` branches on `po.type` (`distributor` vs `stock`).
- `components/po/manufacturing-order/` — MO-specific sections (links, allocations, MO header).
- `components/po/purchase-order-wizard/` — wizard steps (PO wizard uses sale-channel + lines; stock wizard uses lines only).

**Types mirroring JSON:** `lib/types/api.ts`  
**Status labels:** `lib/po/status-labels.ts` — `distributorPoStatuses` vs `moStatuses`.

---

## 6. Typical change locations

| You want to… | Start here |
|--------------|------------|
| Add/rename DB fields or relations | `prisma/schema.prisma` → `npm run db:migrate` (or `db:push` in dev) → `npm run db:generate` |
| Change API shape or rules | `app/api/.../route.ts` + matching Zod in `lib/validations/purchase-order.ts` or `lib/validations/manufacturing-order.ts` |
| Change list/detail UI | `*-list-view.tsx`, `*-detail-view.tsx`, or `components/po/...` |
| New enum value for status | Prisma enum + Zod schema + `lib/po/status-labels.ts` + any `<Select>` options |

---

## 7. Conventions (short)

- **Prisma** only in server code / Route Handlers (`@/lib/prisma`).
- **Client HTTP** uses `api` from `@/lib/axios` with TanStack Query `queryKey`s kept stable (`purchase-orders` vs `stock-orders` are separate trees).
- **Include objects** for heavy reads: `lib/purchase-order-include.ts`, `lib/manufacturing-order-include.ts`.
- Prefer **small, focused diffs**; match existing patterns in adjacent files.
- Do **not** edit `app/generated/prisma` by hand.

---

## 8. How to phrase requests to an AI

Include:

1. This brief (or “read `docs/AI-PROJECT-BRIEF.md`”).
2. **Goal** — user-visible behavior.
3. **Scope** — PO vs stock order vs MO vs both vs master data.
4. **Acceptance** — e.g. “migration ok”, “must not break existing MO allocations”.
5. Optional: **file hints** — e.g. “start from `mo-detail-view.tsx`”.

Example:

> Using `docs/AI-PROJECT-BRIEF.md`: Add a read-only “total allocated qty vs PO line qty” check on the MO detail allocations table. Only touch MO UI and, if needed, a small GET fragment on the MO detail API.

---

## 9. Related repo files

| File | Notes |
|------|--------|
| `AGENTS.md` / `CLAUDE.md` | Agent rules; Next.js version caveat |
| `README.md` | Setup, MinIO, scripts, generic layout |
| `prisma/migrations/` | History including MO/PO split, `PurchaseOrderType`, removal of MO↔sale-channel |

---

*Generated as a stable handoff doc; update this file when the domain or routes change significantly.*
