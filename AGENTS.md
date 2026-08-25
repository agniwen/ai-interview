# AGENTS.md

<!-- intent-skills:start -->

# TanStack Intent - before editing files, run the matching guidance command.

tanstackIntent:

- id: "@tanstack/react-start#lifecycle/migrate-from-nextjs"
  run: "bunx @tanstack/intent@latest load @tanstack/react-start#lifecycle/migrate-from-nextjs"
  for: "Step-by-step migration from Next.js App Router to TanStack Start: route definition conversion, API mapping, server function conversion from Server Actions, middleware conversion, data fetching pattern changes."
- id: "@tanstack/react-start#react-start"
  run: "bunx @tanstack/intent@latest load @tanstack/react-start#react-start"
  for: "React bindings for TanStack Start: createStart, StartClient, StartServer, React-specific imports, re-exports from @tanstack/react-router, full project setup with React, useServerFn hook."
- id: "@tanstack/react-start#react-start/server-components"
  run: "bunx @tanstack/intent@latest load @tanstack/react-start#react-start/server-components"
  for: "Implement, review, debug, and refactor TanStack Start React Server Components in React 19 apps. Use when tasks mention @tanstack/react-start/rsc, renderServerComponent, createCompositeComponent, CompositeComponent, renderToReadableStream, createFromReadableStream, createFromFetch, Composite Components, React Flight streams, loader or query owned RSC caching, router.invalidate, structuralSharing: false, selective SSR, stale names like renderRsc or .validator, or migration from Next App Router RSC patterns. Do not use for generic SSR or non-TanStack RSC frameworks except brief comparison."
- id: "@tanstack/router-core#router-core"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core"
  for: "Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, route sorting, file naming conventions. Entry point for all router skills."
- id: "@tanstack/router-core#router-core/auth-and-guards"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core/auth-and-guards"
  for: "Route protection with beforeLoad, redirect()/throw redirect(), isRedirect helper, authenticated layout routes (\_authenticated), non-redirect auth (inline login), RBAC with roles and permissions, auth provider integration (Auth0, Clerk, Supabase), router context for auth state."
- id: "@tanstack/router-core#router-core/code-splitting"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core/code-splitting"
  for: "Automatic code splitting (autoCodeSplitting), .lazy.tsx convention, createLazyFileRoute, createLazyRoute, lazyRouteComponent, getRouteApi for typed hooks in split files, codeSplitGroupings per-route override, splitBehavior programmatic config, critical vs non-critical properties."
- id: "@tanstack/router-core#router-core/data-loading"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core/data-loading"
  for: "Route loader option, loaderDeps for cache keys, staleTime/gcTime/ defaultPreloadStaleTime SWR caching, pendingComponent/pendingMs/ pendingMinMs, errorComponent/onError/onCatch, beforeLoad, router context and createRootRouteWithContext DI pattern, router.invalidate, Await component, deferred data loading with unawaited promises."
- id: "@tanstack/router-core#router-core/navigation"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core/navigation"
  for: "Link component, useNavigate, Navigate component, router.navigate, ToOptions/NavigateOptions/LinkOptions, from/to relative navigation, activeOptions/activeProps, preloading (intent/viewport/render), preloadDelay, navigation blocking (useBlocker, Block), createLink, linkOptions helper, scroll restoration, MatchRoute."
- id: "@tanstack/router-core#router-core/not-found-and-errors"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core/not-found-and-errors"
  for: "notFound() function, notFoundComponent, defaultNotFoundComponent, notFoundMode (fuzzy/root), errorComponent, CatchBoundary, CatchNotFound, isNotFound, NotFoundRoute (deprecated), route masking (mask option, createRouteMask, unmaskOnReload)."
- id: "@tanstack/router-core#router-core/path-params"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core/path-params"
  for: "Dynamic path segments ($paramName), splat routes ($ / \_splat), optional params ({-$paramName}), prefix/suffix patterns ({$param}.ext), useParams, params.parse/stringify, pathParamsAllowedCharacters, i18n locale patterns."
- id: "@tanstack/router-core#router-core/search-params"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core/search-params"
  for: "validateSearch, search param validation with Zod/Valibot/ArkType adapters, fallback(), search middlewares (retainSearchParams, stripSearchParams), custom serialization (parseSearch, stringifySearch), search param inheritance, loaderDeps for cache keys, reading and writing search params."
- id: "@tanstack/router-core#router-core/ssr"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core/ssr"
  for: "Non-streaming and streaming SSR, RouterClient/RouterServer, renderRouterToString/renderRouterToStream, createRequestHandler, defaultRenderHandler/defaultStreamHandler, HeadContent/Scripts components, head route option (meta/links/styles/scripts), ScriptOnce, automatic loader dehydration/hydration, memory history on server, data serialization, document head management."
- id: "@tanstack/router-core#router-core/type-safety"
  run: "bunx @tanstack/intent@latest load @tanstack/router-core#router-core/type-safety"
  for: "Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-split typed access, addChildren with object syntax for TS perf, LinkProps and ValidateLinkOptions type utilities, as const satisfies pattern."
- id: "@tanstack/router-plugin#router-plugin"
  run: "bunx @tanstack/intent@latest load @tanstack/router-plugin#router-plugin"
  for: "TanStack Router bundler plugin for route generation and automatic code splitting. Supports Vite, Webpack, Rspack, and esbuild. Configures autoCodeSplitting, routesDirectory, target framework, and code split groupings."
- id: "@tanstack/start-client-core#start-core"
  run: "bunx @tanstack/intent@latest load @tanstack/start-client-core#start-core"
  for: "Core overview for TanStack Start: tanstackStart() Vite plugin, getRouter() factory, root route document shell (HeadContent, Scripts, Outlet), client/server entry points, routeTree.gen.ts, tsconfig configuration. Entry point for all Start skills."
- id: "@tanstack/start-client-core#start-core/auth-server-primitives"
  run: "bunx @tanstack/intent@latest load @tanstack/start-client-core#start-core/auth-server-primitives"
  for: "Server-side authentication primitives for TanStack Start: session cookies (HttpOnly, Secure, SameSite, \_\_Host- prefix), session read/issue/destroy via createServerFn and middleware, OAuth authorization-code flow with state and PKCE, password-reset enumeration defense, CSRF for non-GET RPCs, rate limiting auth endpoints, session rotation on privilege change. Pairs with router-core/auth-and-guards for the routing side."
- id: "@tanstack/start-client-core#start-core/deployment"
  run: "bunx @tanstack/intent@latest load @tanstack/start-client-core#start-core/deployment"
  for: "Deploy to Cloudflare Workers, Netlify, Vercel, Node.js/Docker, Bun, Railway. Selective SSR (ssr option per route), SPA mode, static prerendering, ISR with Cache-Control headers, SEO and head management."
- id: "@tanstack/start-client-core#start-core/execution-model"
  run: "bunx @tanstack/intent@latest load @tanstack/start-client-core#start-core/execution-model"
  for: "Isomorphic-by-default principle, environment boundary functions (createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn), ClientOnly component, useHydrated hook, import protection, dead code elimination, environment variable safety (VITE\_ prefix, process.env)."
- id: "@tanstack/start-client-core#start-core/middleware"
  run: "bunx @tanstack/intent@latest load @tanstack/start-client-core#start-core/middleware"
  for: "createMiddleware, request middleware (.server only), server function middleware (.client + .server), context passing via next({ context }), sendContext for client-server transfer, global middleware via createStart in src/start.ts, middleware factories, method order enforcement, fetch override precedence."
- id: "@tanstack/start-client-core#start-core/server-functions"
  run: "bunx @tanstack/intent@latest load @tanstack/start-client-core#start-core/server-functions"
  for: "createServerFn (GET/POST), validator (Zod or function), useServerFn hook, server context utilities (getRequest, getRequestHeader, setResponseHeader, setResponseStatus), error handling (throw errors, redirect, notFound), streaming, FormData handling, file organization (.functions.ts, .server.ts)."
- id: "@tanstack/start-client-core#start-core/server-routes"
  run: "bunx @tanstack/intent@latest load @tanstack/start-client-core#start-core/server-routes"
  for: "Server-side API endpoints using the server property on createFileRoute, HTTP method handlers (GET, POST, PUT, DELETE), createHandlers for per-handler middleware, handler context (request, params, context), request body parsing, response helpers, file naming for API routes."
- id: "@tanstack/start-server-core#start-server-core"
  run: "bunx @tanstack/intent@latest load @tanstack/start-server-core#start-server-core"
  for: "Server-side runtime for TanStack Start: createStartHandler, request/response utilities (getRequest, setResponseHeader, setCookie, getCookie, useSession), three-phase request handling, AsyncLocalStorage context."
- id: "@tanstack/virtual-file-routes#virtual-file-routes"
  run: "bunx @tanstack/intent@latest load @tanstack/virtual-file-routes#virtual-file-routes"
  for: "Programmatic route tree building as an alternative to filesystem conventions: rootRoute, index, route, layout, physical, defineVirtualSubtreeConfig. Use with TanStack Router plugin's virtualRouteConfig option."

<!-- intent-skills:end -->

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `agniwen/ai-interview`; external PRs are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The triage label vocabulary uses the default five labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses the single-context layout: root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Project Overview

AI-powered voice interview/resume screening application. Chinese-first locale — agent instructions and interview prompts are in Simplified Chinese.

## Qualitative Resume Evaluation Configuration Boundary

- Job setup ends with the job description for AI-evaluation inputs. Do not add new recruiter-visible or recruiter-configurable AI evaluation fields after the JD.
- The existing job `prompt` field is the sole canonical JD. Keep its user-facing label as “岗位 JD”; do not merge, copy, or fall back to the legacy `description` field for new snapshots or qualitative evaluation.
- Existing structured-scoring settings (hard gates, dimension weights, deduction rules, priority conditions, and exclusion conditions) remain stored only for historical-result audit and compatibility. Hide them from normal job setup and do not read them when generating a qualitative resume evaluation.
- Do not replace the retired scoring settings with new configuration controls unless an explicit future product decision supersedes `docs/adr/0029-version-qualitative-resume-evaluation.md`.
- Internal persistence needed for immutable JD snapshots, evaluation-contract versions, and versioned results is allowed; those fields are not job settings and must not surface as recruiter configuration.
- Job creation has one Save action and no recruiter-visible draft, scoring-rule preview, or separate publish step. See `docs/adr/0031-save-job-descriptions-without-a-draft-publish-lifecycle.md`.
- A job description must be non-empty, but sparse content only receives a non-blocking notice. Do not add an AI quality gate, mandatory JD template, or preview requirement to job saving.
- In the initial qualitative-evaluation version, factual density and JD alignment are prompt requirements. Do not add structured per-dimension evidence arrays or source-existence validation unless a later explicit product decision requests that hardening.
- Keep qualitative prompt regression as an independent dataset and test script. Real-model regression must not run in the production path, block user actions, or become a product feature.
- Keep the job's Communication Questions and Candidate Forms tabs; they are operational interview configuration, not retired evaluation settings.

## Qualitative Resume Evaluation Output Contract

- New job-bound resume evaluations use exactly four advisory levels: 不推荐, 待定, 推荐, 非常推荐. They never change recruiter decisions or pipeline state automatically.
- 不推荐 requires resume-supported conflict with an explicit core JD responsibility or requirement. Missing or conflicting evidence produces 待定, not 不推荐.
- Each of the six dimensions—技能匹配、经验相关性、项目匹配、教育与背景、潜力、稳定性—returns dense candidate-specific text, not a score or per-dimension level. Prefer explicit JD requirements; when the JD is silent, apply the versioned general professional evidence standard and label the visible basis accordingly.
- The concise overall evaluation is 1–2 sentences (roughly 50–100 Chinese characters). The detailed evaluation covers overall judgment, key matching evidence, and risks or uncertainties without repeating all six dimensions. Each dimension targets 2–4 information-dense sentences.
- New results must not contain numeric scores, weights, gates, deductions, priority conditions, exclusion conditions, radar data, or skill-checklist output. Seniority recommendation and team positioning are optional and must be omitted when unsupported.
- See `docs/adr/0029-version-qualitative-resume-evaluation.md` and `docs/adr/0030-use-guarded-general-professional-evidence.md` for versioning, presentation, fallback, and history rules.

## Architecture

- **Web app** (`apps/ai-recruitment-copilot/`): TanStack Start + React 19, TanStack Router, TanStack Query, Vite/Nitro, shadcn/ui + Tailwind CSS v4. It mounts the Hono backend at `/api` for integrated web runs.
- **Backend app** (`apps/ai-recruitment-copilot-backend/`): Hono API runtime, Drizzle ORM + PostgreSQL, Better Auth. It can be mounted by the web app at `/api` or started as a standalone Bun app.
- **Voice agent** (`apps/livekit-agent/`): Python LiveKit Agents SDK with OpenAI / Google / ElevenLabs / Minimax plugins, Silero VAD, turn-detector
- **Monorepo**: Bun workspace + Turborepo at the root; shared packages in `packages/` (`@arc/shared` — shared types, schemas, and isomorphic utilities; `@arc/db-schema` — Drizzle schema/relations + DB-adjacent shared types). Workspace packages are scoped under `@arc/*`.

Two separate package managers: **Bun 1.4.0** for TypeScript apps, **uv** for Python agent. Do not mix them.

## Commands

### Root (Turborepo)

- `bun run dev` — turbo run dev across apps
- `bun run build` / `bun run typecheck` / `bun run test` — fan-out via turbo
- `bun run check` / `bun run fix` — Ultracite lint/format across the whole repo
- `bun run hooks` — install lefthook git hooks (run once after clone)
- `bun run db:generate` / `bun run db:migrate` / `bun run db:studio` — proxy to the web app's drizzle scripts

### Web (`apps/ai-recruitment-copilot/`)

Either run via turbo from the root, or directly:

- `bun run --filter @arc/ai-recruitment-copilot dev` — TanStack Start dev server
- `bun run --filter @arc/ai-recruitment-copilot build` — production build
- `bun run --filter @arc/ai-recruitment-copilot typecheck`
- `bun run --filter @arc/ai-recruitment-copilot test` / `test:watch` — Vitest
- `bun run --filter @arc/ai-recruitment-copilot db:generate` / `db:migrate` / `db:studio`

### Backend (`apps/ai-recruitment-copilot-backend/`)

- `bun run --filter @arc/ai-recruitment-copilot-backend start` — start the standalone Hono Bun server; defaults to `HOST=0.0.0.0` and `PORT=8787`
- `bun run --filter @arc/ai-recruitment-copilot-backend dev:standalone` — standalone Hono server in watch mode
- `bun run --filter @arc/ai-recruitment-copilot-backend typecheck`
- `bun run --filter @arc/ai-recruitment-copilot-backend test` / `test:watch` — Vitest

### Agent (from `apps/livekit-agent/`)

- `uv sync` — install dependencies
- `uv run -m livekit.agents download-files` — download VAD + turn-detector models (required before first run)
- `uv run src/agent.py dev` — dev mode with hot reload
- `uv run src/agent.py console` — interactive terminal chat
- `uv run pytest` — run tests
- `uv run ruff format` — format Python code
- `uv run ruff check` — lint Python code

### Unified (Makefile)

- `make install` — full setup: web deps + agent + model downloads
- `make dev` — run web + agent in parallel
- `make agent-console` — terminal chat without web

## Frontend Route Layout (`apps/ai-recruitment-copilot/src/routes/`)

Keep `src/routes/` limited to TanStack Router route modules: route declarations, route-level loaders, search validation, and thin page composition. Do not place reusable components, page sections, hooks, state models, dialog groups, list renderers, or other helper modules in `src/routes/`, including files hidden from route generation with a `-` prefix. Put feature-owned UI and client state under `src/components/features/<feature>/`; put reusable client utilities under `src/lib/client/` and TanStack Start server helpers under `src/lib/start/`.

Route modules should import feature components and remain the routing boundary rather than growing into page implementations or state containers.

## Server Route Layout (`apps/ai-recruitment-copilot-backend/src/server/routes/`)

Every route folder is a self-contained unit:

- **Required**: `route.ts` exporting a Hono router. Middleware must be declared **inside** the router via `.use(...)` at the closest common-ancestor route (the GCD of paths it applies to). Do **not** add per-feature `.use(...)` calls in `app.ts` — `app.ts` is mount-only.
- **Optional**: `schema.ts` (Zod schemas), `dao.ts` or `dao/` (database queries), `utils.ts` or `utils/` (feature-internal helpers, services, AI processing).
- **Nested children**: when a route needs to split into multiple sub-routers (e.g. `/studio` → `interviews`, `departments`, …), put each child under a `routes/` subfolder (`routes/studio/routes/interviews/`). The same convention applies recursively.
- **Path-based split rule**: split by URL path depth when the child path represents a real sub-resource or sub-module. Keep collection/item CRUD such as `/interviews` and `/interviews/:id` in `interviews/route.ts`; move child resources such as `/interviews/:id/reports` or `/interviews/:id/recordings/:conversationId` to `interviews/routes/reports/route.ts` or `interviews/routes/recordings/route.ts`, then mount them from the parent with `.route("/:id/reports", reportsRouter)`. Do not create dynamic-segment folders like `routes/:id/route.ts` for Hono routes.

Do **not** create top-level `apps/ai-recruitment-copilot-backend/src/server/queries/` or `apps/ai-recruitment-copilot-backend/src/server/services/` directories — co-locate DAOs/services with the route that owns them. Cross-route consumption is fine; just import from the owning route's `dao`/`utils`.

Exceptions: `apps/ai-recruitment-copilot-backend/src/server/agents/` (shared by frontend + multiple routes) and `apps/ai-recruitment-copilot-backend/src/server/middlewares/` (shared middleware library) intentionally remain at server root.

## Backend / Web Runtime Boundary

The Hono backend must stay loadable outside the TanStack Start web runtime. Files under `apps/ai-recruitment-copilot-backend/src/server/` and `apps/ai-recruitment-copilot-backend/src/lib/server/` must not import web-app-local `@/` modules, browser-only modules, or TanStack Start route/server-function helpers.

The single backend app factory is `createServerApp()` in `apps/ai-recruitment-copilot-backend/src/server/app.ts`. The TanStack Start web app mounts that factory from `apps/ai-recruitment-copilot/src/server.ts`; the standalone Node entrypoint is `apps/ai-recruitment-copilot-backend/src/index.ts`. Do not fork route behavior between those two adapters.

When a backend route needs a web-runtime-only capability, introduce a small port in backend code and inject the implementation from the adapter layer. Current examples:

- Better Auth request-scoped headers go through `auth-request-context`; backend route modules should not read TanStack Start request primitives directly.
- Route/page SSR data belongs in TanStack Start route loaders or `createServerFn` handlers under `apps/ai-recruitment-copilot/src/`, not in backend DAOs.

Backend runtime helpers live under `@arc/ai-recruitment-copilot-backend/lib/server/*`. TanStack Start server-function helpers live under `apps/ai-recruitment-copilot/src/lib/start/*`; they may use `@tanstack/react-start/server` request primitives and should import backend primitives from `@arc/ai-recruitment-copilot-backend/*` rather than duplicating backend logic.

## Frontend HTTP Calls

- **JSON endpoints** → call the typed Hono RPC client at `@/lib/client/rpc` and pipe the result through `rpcFetch` from `@/lib/client/api`:

  ```ts
  import { rpcFetch } from "@/lib/client/api";
  import { rpc } from "@/lib/client/rpc";

  // happy path: returns typed body, throws ApiError on non-2xx
  return rpcFetch<StudioInterview>(
    rpc.api.studio.interviews[":id"].$get({ param: { id } }),
    "加载面试详情失败",
  );

  // idempotent reads/deletes: 404 resolves to null instead of throwing
  return rpcFetch<StudioInterview>(call, fallback, { allow404: true });
  ```

  `rpcFetch` is a thin wrapper around Hono's official `parseResponse` / `DetailedError` (from `hono/client`); on non-OK it re-throws the project's `ApiError` with `status` + `payload` + a Chinese fallback message so existing UI catch-blocks keep working.

- Server handlers must declare explicit status codes (`c.json(data, 200)`) and use `zValidator("json"|"query", schema, jsonValidatorError("..."))` for typed inputs — without those, hc loses type inference.
- **File uploads** (multipart/FormData), **streaming** (NDJSON / SSE / `new Response(stream)`), and **binary** responses (PDF, recordings) cannot use RPC — keep them on plain `fetch` or `apiFetch` from `@/lib/client/api`.
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

`apps/ai-recruitment-copilot/src/lib/` is split by runtime so it's obvious from the import path which side a module is meant to run on.

- **`@arc/ai-recruitment-copilot-backend/lib/server/*`** — Backend runtime utilities. DB client (`db/index.ts`), Better Auth (`auth.ts`), S3, PDF rasterization, Qwen OCR, resume parsing pipeline, server-side hash helpers, anything reading server secrets. These files must avoid app-local `@/` and TanStack Start request primitives so the Hono app can run in a standalone Node process.
- **`@/lib/start/*`** — TanStack Start server-function and route-loader helpers. These may use `createServerFn`, `@tanstack/react-start/server`, and backend primitives.
- **`@/lib/server/*`** — Small web server helpers that belong to the TanStack Start app but are not shared with the standalone Hono runtime.
- **`@/lib/client/*`** — Browser helpers. `rpc.ts`, `auth-client.ts`, `query-client.ts`, `clipboard.ts`, `ndjson-stream.ts`, and the `api/` wrapper layer.
- **`@arc/shared/*`** — Workspace package for pure types, Zod schemas, and isomorphic utilities (no web runtime, no server secrets, no Node-only APIs unless the API is also available in supported browsers/Node runtimes). Examples: `@arc/shared/interview/agent-instructions`, `@arc/shared/utils`, `@arc/shared/data-url`, `@arc/shared/file-hash`, `@arc/shared/departments`, `@arc/shared/studio-resumes`. Do not recreate `src/lib/shared/` inside the app.

**Drizzle schema lives in the `@arc/db-schema` workspace package**, not under `src/lib/`. The package exports `schema`, `relations`, and DB-adjacent shared types (`candidate-forms`, `db-enums`, `interview-question-templates`, `interview-session`, `interview/types`, `job-description-config`, `minimax-voices`, `studio-interviews`, `resume-parser-schema`) — anything imported by `schema.ts`. Import as `@arc/db-schema/schema`, `@arc/db-schema/relations`, `@arc/db-schema/candidate-forms`, etc. The actual DB connection lives in `@arc/ai-recruitment-copilot-backend/lib/server/db` and imports `relations` from the package. `drizzle.config.ts` points at `../../packages/db-schema/src/schema.ts`.

When a module _mostly_ fits `@arc/shared` but has one backend-only function (e.g. `hashTemplateSnapshot` using `node:crypto`), extract that function into a sibling `*-hash.ts` (or similar) under `@arc/ai-recruitment-copilot-backend/lib/server/` and keep the rest in `@arc/shared`. Don't pull `node:*`, TanStack Start request helpers, or app-local `@/` imports into `packages/shared/src`.

## Voice Agent Development (`apps/livekit-agent/`)

### Entrypoint and structure

- All Python agent code lives in `apps/livekit-agent/src/`. **Keep `apps/livekit-agent/src/agent.py` as the entrypoint** — the `Dockerfile` references it directly for production deployment, so do not rename or move it.
- Use `uv` for everything (install, run, test) — never mix in `pip`/`poetry`. See the Commands section above for the canonical `uv run` invocations.
- Format and lint Python with `uv run ruff format` and `uv run ruff check` before committing.

### LiveKit documentation access

LiveKit Agents evolves quickly; prefer the latest docs over training-data recall. Two access paths:

- **LiveKit CLI** (`lk docs`, requires CLI 2.15.0+ — check `lk --version`):
  - macOS: `brew install livekit-cli` (update: `brew update && brew upgrade livekit-cli`)
  - Linux: `curl -sSL https://get.livekit.io/cli | bash`
  - Windows: `winget install LiveKit.LiveKitCLI`
  - Key subcommands: `lk docs overview`, `lk docs search`, `lk docs get-page`, `lk docs code-search`, `lk docs changelog`, `lk docs submit-feedback`. Prefer browsing (`overview`/`get-page`) over `search`, and `search` over `code-search`.
- **LiveKit Docs MCP server**: Streamable HTTP transport at <https://docs.livekit.io/mcp> for IDE integration.

If you spot doc gaps or broken examples while browsing, submit feedback via `lk docs submit-feedback` (or the MCP `submit_docs_feedback` tool).

Beyond docs, `lk` also manages other LiveKit resources (e.g. SIP trunks for telephony). Run `lk --help` to explore.

### Workflows: handoffs and tasks

Voice agents are highly latency-sensitive. Avoid monolithic prompts that try to cover every conversation phase — they bloat each LLM request and hurt reliability. Use LiveKit's **handoffs** (one agent transfers control to another) and **tasks** (tightly-scoped prompts for a single outcome) to keep per-request context small and focused. See <https://docs.livekit.io/agents/build/workflows/>.

### Testing core agent behavior (TDD)

When modifying instructions, tool descriptions, or task / workflow / handoff definitions, **write tests in `agent/tests/` first** and iterate until they pass — don't guess at LLM behavior. Run with `uv run pytest`. See <https://docs.livekit.io/agents/start/testing/>.

## Code Style

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `refactor:`, etc.
- **TypeScript**: Ultracite enforces formatting/linting via oxlint + oxfmt — run `bun run fix` before committing
- **Python**: Ruff — double quotes, 88 char line length
- **Components**: shadcn/ui with new-york style, CSS variables for theming

## Environment Setup

Copy `apps/ai-recruitment-copilot/.env.example` to `apps/ai-recruitment-copilot/.env` for the TanStack Start web app, and `apps/ai-recruitment-copilot-backend/.env.example` to `apps/ai-recruitment-copilot-backend/.env` for standalone backend runs. The voice agent has its own `apps/livekit-agent/.env.example` if it needs separate secrets. See those `.env.example` files for the full list. Key requirements:

- LiveKit Cloud credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
- Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Database (`DATABASE_URL`)
- AI providers (`OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ELEVENLABS_API_KEY`, `MINIMAX_API_KEY`) — see `.env.example` for the authoritative list

### Resend (transactional email)

The round-email feature (`/api/w/:slug/studio/interviews/round-emails/...`) calls Resend with `RESEND_FROM` as the sender. **Use a bare email address** (e.g. `RESEND_FROM=noreply@your-domain.com`) — the From-header display name is built dynamically at runtime as `{globalConfig.companyName} AI HR` (or `AI HR` when no company name is set), via `buildSenderFromAddress` in `@arc/ai-recruitment-copilot-backend/lib/server/resend`. Avoid the `"Name <addr>"` form in env files because the `<>` characters get interpreted as shell redirection in many deploy scripts (Jenkins, CI). **Before sending in any non-local environment**, verify your sender domain in the [Resend dashboard](https://resend.com/domains) — otherwise Resend rejects the send. Local dev can leave `RESEND_API_KEY` unset; the route returns a structured 500 + writes a `studio_round_email_log` row with `status='failed'` when the key is missing.

## Gotchas

- Must run `uv run -m livekit.agents download-files` before first agent run to download Silero VAD and turn-detector models
- Generated/upstream UI is excluded from oxlint: `src/components/agents-ui/`, `src/hooks/agents-ui/`, `src/components/ui/`, `src/components/react-bits/`, `src/components/spell-ui/` — avoid hand-editing these
- Drizzle ORM is on RC (`1.0.0-rc.1`) — pin carefully when upgrading
