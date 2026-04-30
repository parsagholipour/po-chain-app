# PO App

Next.js (App Router) starter with PostgreSQL via Prisma, shadcn/ui on Tailwind CSS v4, TanStack Query and Table, React Hook Form + Zod validation, Axios, and Lucide icons. The UI uses a **teal** primary palette (CSS variables in `app/globals.css`) with light/dark mode via `next-themes`.

## Prerequisites

- Node.js 20+ (matches Next.js / Prisma expectations)
- npm (or swap commands for pnpm/yarn)
- A PostgreSQL instance and connection string for Prisma

## Setup

1. Copy environment template and fill in values:

   ```bash
   cp .env.example .env
   ```

2. Set `DATABASE_URL` to your Postgres URL (same string Prisma CLI and the app use).

3. Install dependencies (if you have not already):

   ```bash
   npm install
   ```

4. Generate the Prisma client and apply the schema:

   ```bash
   npm run db:generate
   npm run db:push
   ```

   For migration-based workflows, use `npm run db:migrate` instead of `db:push`.

5. Start the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:4000](http://localhost:4000) (this repo runs `next dev -p 4000`).

## Email (SendGrid)

Transactional email is handled by the server-only [`EmailService`](lib/services/email.ts), which calls SendGrid's Mail Send API.

Required environment variables:

| Variable | Purpose |
| -------- | ------- |
| `SENDGRID_API_KEY` | SendGrid API key with Mail Send access. |
| `EMAIL_FROM` | Default verified sender email address. |
| `EMAIL_FROM_NAME` | Optional default sender display name. |
| `EMAIL_REPLY_TO` / `EMAIL_REPLY_TO_NAME` | Optional default reply-to address. |

Example:

```ts
import { EmailService } from "@/lib/services/email";

await EmailService.send({
  to: "customer@example.com",
  subject: "Purchase order update",
  text: "Your purchase order was updated.",
  html: "<p>Your purchase order was updated.</p>",
});
```

## Object storage (MinIO)

The app includes an **S3-compatible** file layer aimed at **MinIO**: server-side uploads, presigned PUT/GET URLs, and deletes. Implementation lives under [`lib/storage/`](lib/storage/); HTTP endpoints are under [`app/api/storage/`](app/api/storage/).

### Prerequisites

- A MinIO deployment (or any S3-compatible API). Typical defaults: **API** `http://localhost:9000`, **console** `http://localhost:9001`.
- Create a **bucket** matching `MINIO_BUCKET`, or let the app create it on first use (requires credentials with permission to create buckets).

### Environment variables

Copy the MinIO-related keys from [`.env.example`](.env.example) into `.env`:

| Variable | Purpose |
| -------- | ------- |
| `MINIO_ENDPOINT` | Base URL the **Next.js server** uses to talk to MinIO (e.g. `http://localhost:9000` or a Docker-internal hostname). |
| `MINIO_PUBLIC_ENDPOINT` | Optional. If browsers must use a **different** host than the server (e.g. public URL vs internal DNS), set this so **presigned URLs** are signed for the correct host. |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO access keys. |
| `MINIO_BUCKET` | Bucket name for uploads. |
| `MINIO_REGION` | Optional (default `us-east-1`); MinIO is usually indifferent. |
| `STORAGE_MAX_UPLOAD_BYTES` | Optional. Max size for **server** multipart uploads (default 10 MiB). |
| `STORAGE_PRESIGN_EXPIRES_SECONDS` | Optional. Lifetime of presigned URLs in seconds (default 900). |

If these are missing or empty, storage APIs respond with **503** and a configuration error.

### Authentication

All routes under `/api/storage/*` require a **signed-in user** (NextAuth session). Unauthenticated requests receive **401**.

### HTTP API

Base path: `/api/storage` (same origin as the app; use cookies/session for auth).

#### Server-side upload (multipart)

`POST /api/storage/upload`

- **Body**: `multipart/form-data` with a field **`file`** (the file). Optional field **`prefix`**: logical folder under the default `uploads/` segment (no `..`, no leading `/`, max 200 chars after trim).
- **Response** (JSON): `bucket`, `key`, `contentType`, `size`, `originalName`. Store **`key`** in your database for CRUD; it is the stable object identifier in MinIO.

Example with `curl` (session cookie omitted; use a browser or attach your session cookie):

```bash
curl -X POST http://localhost:4000/api/storage/upload \
  -F "file=@./photo.png" \
  -F "prefix=invoices"
```

#### Presigned upload (browser → MinIO directly)

`POST /api/storage/presign`

- **Body** (JSON): `{ "filename": "photo.png", "contentType": "image/png", "prefix": "optional/subfolder" }` (`prefix` optional; same rules as multipart).
- **Response** (JSON): `method` (`PUT`), `url`, `key`, `bucket`, `headers` (includes `Content-Type`), `expiresInSeconds`.

Client flow: call this route while logged in, then `PUT` the raw file bytes to `url` with the returned headers (at minimum `Content-Type`). Save **`key`** in your app after a successful PUT.

#### Delete object

`POST /api/storage/delete`

- **Body** (JSON): `{ "key": "uploads/uuid-filename.ext" }`
- **Response** (JSON): `{ "ok": true }`

#### Short-lived read URL

`GET /api/storage/url?key=<object-key>`

- **Response** (JSON): `{ "url": "<presigned-url>", "expiresInSeconds": <number> }` — use `url` in an `<img src>`, download link, etc.
- Add **`&redirect=1`** to receive an HTTP **redirect** to the presigned URL instead of JSON.

### Using storage from server code (CRUD, jobs, Server Actions)

Import from [`@/lib/storage`](lib/storage/index.ts) (Node runtime only):

- `putObject({ key, body, contentType })` — upload from a `Buffer`, `Uint8Array`, or stream-compatible body.
- `deleteObject(key)` — remove an object.
- `buildObjectKey(originalName, prefix?)` — generate a unique key (UUID + sanitized filename) under `uploads/` by default.
- `getPresignedPutUrl(key, contentType)` / `getPresignedGetUrl(key)` — same signing logic as the API routes.
- `ensureBucket()` — called automatically by upload/presign paths; you can call it explicitly if needed.

Example pattern for CRUD:

1. On create/update, upload with `putObject` (or accept `key` from the client after they used `/api/storage/upload` or presign).
2. Persist **`key`** (and optionally `contentType`, `size`) in PostgreSQL via Prisma.
3. On delete, remove the DB row and call `deleteObject(key)` if you no longer need the file.

Avoid storing long-lived public MinIO URLs in the database unless you have a stable public base URL and policy; prefer **`key`** plus presigned GET when serving private objects.

## Scripts

| Script            | Purpose                                      |
| ----------------- | -------------------------------------------- |
| `npm run dev`     | Next.js dev server (Turbopack)               |
| `npm run build`   | Production build                             |
| `npm run start`   | Run production server                        |
| `npm run lint`    | ESLint                                       |
| `npm run db:generate` | `prisma generate` (client into `app/generated/prisma`) |
| `npm run db:push` | Push schema to DB (prototyping)              |
| `npm run db:migrate` | Create/apply migrations                     |
| `npm run db:studio` | Prisma Studio                             |

## Repository layout

| Path | Role |
| ---- | ---- |
| [`app/`](app/) | App Router: `layout.tsx`, `page.tsx`, `globals.css`, API routes under `app/api/` |
| [`app/api/`](app/api/) | Route Handlers (e.g. `health`, `demo/contact`, `storage/*`) |
| [`app/generated/prisma/`](app/generated/prisma/) | Generated Prisma Client (do not edit; gitignored) |
| [`components/`](components/) | App-specific components (demo table, forms, providers) |
| [`components/ui/`](components/ui/) | shadcn/ui primitives (button, card, table, field, …) |
| [`lib/`](lib/) | Shared utilities: `utils.ts` (`cn`), `prisma.ts`, `axios.ts`, `get-query-client.ts`, demo query helpers |
| [`lib/storage/`](lib/storage/) | MinIO/S3: config, S3 clients, `putObject` / presign helpers (see **Object storage**) |
| [`prisma/`](prisma/) | `schema.prisma`, migrations |
| [`public/`](public/) | Static assets |
| [`components.json`](components.json) | shadcn CLI configuration |
| [`prisma.config.ts`](prisma.config.ts) | Prisma 7 config (datasource URL from env) |

## Conventions

### Server vs client

- **Server Components** (default): data fetching with `fetch`, Prisma, or prefetching for TanStack Query. No `useState` / browser APIs.
- **Client Components**: add `"use client"` at the top. Use for interactivity: TanStack Query `useQuery`, TanStack Table, React Hook Form, theme toggle, Axios from the browser.

### Data access

- **Prisma**: import `prisma` from `@/lib/prisma` in Server Components and Route Handlers only. Prisma 7 uses the `@prisma/adapter-pg` driver with `pg` and `DATABASE_URL`.
- **Axios**: import `api` from `@/lib/axios` for HTTP from the **client** (or server if you intentionally reuse the instance). `NEXT_PUBLIC_APP_URL` sets the default `baseURL` (falls back to relative requests in the browser).
- **Plain `fetch`**: fine in Server Components for third-party APIs (see `lib/demo-query.ts`).
- **Object storage**: use `@/lib/storage` in Route Handlers / Server Actions, or call `/api/storage/*` from the client when the user is logged in (see **Object storage (MinIO)**).

### TanStack Query + RSC

- Shared defaults live in [`lib/get-query-client.ts`](lib/get-query-client.ts) (`makeQueryClient`).
- Root [`components/providers.tsx`](components/providers.tsx) wraps the app with `QueryClientProvider`, `ThemeProvider`, and Sonner toasts.
- On a server page, create a client with `makeQueryClient()`, call `prefetchQuery`, then wrap client UI in `HydrationBoundary` with `dehydrate(queryClient)`. Client children use `useQuery` with the **same** `queryKey` (see [`app/page.tsx`](app/page.tsx) and [`components/demo-hydrated-todos.tsx`](components/demo-hydrated-todos.tsx)).

### Theming

- Design tokens are CSS variables in [`app/globals.css`](app/globals.css) (`:root` and `.dark`). Adjust `--primary`, `--ring`, and sidebar tokens to rebrand.
- [`components/theme-provider.tsx`](components/theme-provider.tsx) configures `next-themes`; [`components/mode-toggle.tsx`](components/mode-toggle.tsx) switches appearance.

### shadcn/ui

- Add more primitives with `npx shadcn@latest add <component>`. The `shadcn` npm package is required so `@import "shadcn/tailwind.css"` in `globals.css` resolves.

## AI / contributor handoff

For **domain model (PO vs MO), API routes, and UI map**—so another developer or an AI can implement features safely—see **[docs/AI-PROJECT-BRIEF.md](docs/AI-PROJECT-BRIEF.md)**.

## License

Private project (`private: true` in `package.json`).
