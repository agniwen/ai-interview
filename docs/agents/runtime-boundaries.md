# Runtime and Transport Boundaries

Read before changing package exports, HTTP clients, SSR/server functions, shared modules, or database schema ownership. Paths below are relative to the repository root.

## Backend / Web Runtime Boundary

The Hono backend must stay loadable outside the TanStack Start web runtime. Files under `apps/server/src/server/` and `apps/server/src/lib/server/` must not import web-app-local `@/` modules, browser-only modules, or TanStack Start route/server-function helpers.

The single backend app factory is `createServerApp()` in `apps/server/src/server/app.ts`. The TanStack Start web app mounts that factory from `apps/web/src/server.ts`; the standalone Node entrypoint is `apps/server/src/index.ts`. Do not fork route behavior between those two adapters.

When a backend route needs a web-runtime-only capability, introduce a small port in backend code and inject the implementation from the adapter layer. Current examples:

- Better Auth request-scoped headers go through `auth-request-context`; backend route modules should not read TanStack Start request primitives directly.
- Route/page SSR data belongs in TanStack Start route loaders or `createServerFn` handlers under `apps/web/src/`, not in backend DAOs.

Backend runtime helpers live under `apps/server/src/lib/server/` (package-private). TanStack Start server-function helpers live under `apps/web/src/lib/start/*`; they may use `@tanstack/react-start/server` request primitives and must use declared public package exports rather than private source paths or duplicated backend logic.

## Server Package Interface

Treat `apps/server/src/server/` and `apps/server/src/lib/server/` as package-private implementation. External workspace consumers use only the explicit entrypoints currently declared in `apps/server/package.json`. Read that exports map before adding an import; a path prefix is not permission to import private modules. Web and Worker code must not import `@app/server/server/*` or `@app/server/lib/server/*`; Server-internal code uses relative imports rather than `#server/*` or `#lib/server/*` aliases.

Add a consumer-facing capability to the closest existing entrypoint under `apps/server/src/exports/` rather than exporting its source directory. Keep `package.json` exports explicit; never add wildcard exports or expose a route/DAO path to make an import compile. If an entrypoint becomes broad or is consumed independently by multiple applications, extract a focused `@app/*` package instead of widening `@app/server`.

## Frontend HTTP Calls

- **JSON endpoints** → call the typed Hono RPC client at `@/lib/client/rpc` and pipe the result through `rpcFetch` from `@/lib/client/api`:

  ```ts
  import { rpcFetch } from "@/lib/client/api";
  import { rpc } from "@/lib/client/rpc";

  // happy path: returns typed body, throws ApiError on non-2xx
  return rpcFetch(
    rpc.api.w[":slug"].studio.departments.$get({ param: { slug }, query }),
    "加载部门列表失败",
  );

  // idempotent reads/deletes: 404 resolves to null instead of throwing
  return rpcFetch(call, fallback, { allow404: true });
  ```

  `rpcFetch` is a thin wrapper around Hono's official `parseResponse` / `DetailedError` (from `hono/client`); on non-OK it re-throws the project's `ApiError` with `status` + `payload` + a Chinese fallback message so existing UI catch-blocks keep working.

- Server handlers must declare explicit status codes (`c.json(data, 200)`) and use `zValidator("json"|"query", schema, jsonValidatorError("..."))` for typed inputs — without those, hc loses type inference.
- **File uploads** (multipart/FormData), **streaming** (NDJSON / SSE / `new Response(stream)`), and **binary** responses (PDF, recordings) use plain `fetch` or `apiFetch` from `@/lib/client/api` by project convention. Hono itself supports form uploads.
- **TanStack Start server functions / route loaders** that need absolute URLs at SSR time stay on plain `fetch` with `NEXT_PUBLIC_BASE_URL` or `BETTER_AUTH_URL`. The rpc singleton is browser-relative.
- Date fields cross the wire as ISO strings; DAOs should `.toISOString()` Date columns before returning so the response DTO is `string` and the inferred client type matches reality.

## External Documentation

When changes touch Hono or TanStack Start/Router/Query APIs, consult the canonical documentation instead of relying on training-data recall — these projects move quickly:

- **Hono**: <https://hono.dev/llms.txt> (index) / <https://hono.dev/llms-full.txt> (full reference). The RPC guide at <https://hono.dev/docs/guides/rpc> covers `hc`, `parseResponse`, `DetailedError`, `InferResponseType`, `testClient`, etc.
- **TanStack Start**: <https://tanstack.com/start/latest/docs/framework/react/overview>
- **TanStack Router**: <https://tanstack.com/router/latest/docs/framework/react/overview>
- **TanStack Query**: <https://tanstack.com/query/latest/docs/framework/react/overview>

Use the official Hono `parseResponse` / `DetailedError` rather than rolling new helpers — `rpcFetch` already wraps them; extend `rpcFetch` if you need new semantics rather than reimplementing.

## Lib Layout (`src/lib/` and `packages/shared/`)

`apps/web/src/lib/` is split by runtime so it's obvious from the import path which side a module is meant to run on.

- **`apps/server/src/lib/server/`** — Package-private backend runtime utilities. DB client (`db/index.ts`), Better Auth (`auth.ts`), S3, PDF rasterization, Qwen OCR, resume parsing pipeline, server-side hash helpers, anything reading server secrets. These files must avoid app-local `@/` and TanStack Start request primitives so the Hono app can run in a standalone Node process.
- **`@/lib/start/*`** — TanStack Start server-function and route-loader helpers. These may use `createServerFn`, `@tanstack/react-start/server`, and backend primitives.
- **`@/lib/server/*`** — Small web server helpers that belong to the TanStack Start app but are not shared with the standalone Hono runtime.
- **`@/lib/client/*`** — Browser helpers. `rpc.ts`, `auth-client.ts`, `query-client.ts`, `clipboard.ts`, `ndjson-stream.ts`, and the `api/` wrapper layer.
- **`@app/shared/*`** — Workspace package for pure types, Zod schemas, and isomorphic utilities (no web runtime, no server secrets, no Node-only APIs unless the API is also available in supported browsers/Node runtimes). Examples: `@app/shared/interview/agent-instructions`, `@app/shared/utils`, `@app/shared/data-url`, `@app/shared/file-hash`, `@app/shared/departments`, `@app/shared/studio-resumes`. Do not recreate `src/lib/shared/` inside the app.
- **`@app/ai-runtime`**, **`@app/meeting-media`**, and **`@app/object-storage`** — App-owned server/Worker runtime tools extracted into workspace packages. New runtime, infrastructure, and stable-contract packages all use the `@app/*` scope.

**Drizzle schema lives in the `@app/db-schema` workspace package**, not under `src/lib/`. The package exports `schema`, `relations`, and DB-adjacent shared types (`candidate-forms`, `db-enums`, `interview-question-templates`, `interview-session`, `interview/types`, `job-description-config`, `minimax-voices`, `studio-interviews`, `resume-parser-schema`) — anything imported by `schema.ts`. Import as `@app/db-schema/schema`, `@app/db-schema/relations`, `@app/db-schema/candidate-forms`, etc. The actual DB connection lives in `apps/server/src/lib/server/db/` and imports `relations` from the package. `drizzle.config.ts` points at `../../packages/db-schema/src/schema.ts`.

When a module _mostly_ fits `@app/shared` but has one backend-only function (e.g. `hashTemplateSnapshot` using `node:crypto`), extract that function into a sibling `*-hash.ts` (or similar) under `apps/server/src/lib/server/` and keep the rest in `@app/shared`. Don't pull `node:*`, TanStack Start request helpers, or app-local `@/` imports into `packages/shared/src`.
