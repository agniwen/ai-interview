# Server Architecture

Read before changing Hono routes, middleware, application verbs, persistence ownership, or Server/Worker integration. Paths below are relative to the repository root. Read [runtime boundaries](runtime-boundaries.md) when imports or transport contracts change.

## Server Route Layout (`apps/server/src/server/routes/`)

### Intent

Organize backend code as route-owned vertical slices, while keeping Hono as the transport boundary and complete business actions reusable outside HTTP. The structure should make a capability easy to find from its URL without coupling business behavior to `Hono.Context`.

Apply these boundaries incrementally to the behavior being added or changed. Preserve external APIs, database behavior, and business semantics; do not perform repository-wide directory moves merely for symmetry. A coherent, reversible extraction of one complete application verb is preferred over a rigid global module migration.

### Composition and middleware

- `apps/server/src/server/app.ts` is the single composition root. It may own global infrastructure concerns such as logging, CORS, Better Auth integration, error handling, and mounting, but it must not contain feature handlers or feature-specific middleware.
- Keep `.route("/api", apiRoutes)`. Do not replace it with `.basePath("/api")`; the `/api` segment must remain present in both the real URL and the inferred `hc<AppType>` client shape (`rpc.api.*`).
- Aggregator routers such as `/w/:slug` and `/studio` only apply middleware shared by all descendants and mount child routers.
- Declare middleware with `.use(...)` at the closest common ancestor of every path it protects. Workspace authentication/scope belongs at `/w/:slug`; a feature permission shared by only that feature belongs in that feature router.
- Register routers through chained `.route(...)` calls so Hono preserves the complete RPC type. Export the final chained router type through `createServerApp()` / `AppType`.

### Route-owned vertical slice

Every routable capability has a folder whose public transport entry is `route.ts`:

```text
<capability>/
├── route.ts                         # required public Hono router/composition entry
├── schema.ts                        # optional HTTP request/response Zod contracts
├── collection-route.ts              # optional same-resource transport fragment
├── detail-route.ts                  # optional same-resource transport fragment
├── application/
│   ├── <verb>.ts                    # framework-independent command/query behavior
│   └── default-<verb>.ts            # optional production dependency composition
├── dao.ts or dao/                   # persistence primitives and projections
├── adapters/                        # optional queue/storage/email/AI implementations
├── utils.ts or utils/               # focused capability-internal helpers
├── routes/                          # real nested URL resources
│   └── <child>/route.ts
└── __tests__/                       # route/application/DAO behavior tests
```

- **`route.ts`** is always the public router for the folder. It owns route declarations, validators, request-scoped context extraction, application invocation, domain-to-HTTP error mapping, explicit status codes, and child-router mounting.
- **`*-route.ts` transport fragments** may split collection, item, or workflow handlers when one resource router becomes hard to navigate. They remain implementation details composed by `route.ts`; they do not create a fake URL hierarchy or become alternate app entrypoints.
- **`schema.ts`** owns transport validation. Use `zValidator("json" | "query", schema, jsonValidatorError("..."))` and explicit `c.json(body, status)` responses so Hono RPC retains precise input/output/status inference.
- **`application/`** owns a complete business verb when the behavior has meaningful invariants, spans multiple persistence/side-effect steps, requires a transaction, is reused by HTTP/Worker/script entrypoints, or benefits from direct behavior testing. Name files after verbs such as `launch-ai-interview-round.ts`, not generic `service.ts` or `manager.ts`.
- **Application core files** receive explicit command/query input and dependencies and return domain results or throw stable application errors. They must not accept `Hono.Context`, construct HTTP responses, read TanStack request primitives, or import browser/web-app modules. Prefer declaring dependency ports beside the verb and wiring real implementations in `default-<verb>.ts` or the owning route's composition boundary.
- **`dao.ts` / `dao/`** owns database reads, writes, row locking, persistence projections, and transaction-aware primitives for this capability. DAO functions must not receive `Hono.Context` or decide HTTP status codes.
- **`adapters/`** implements external ports such as queues, object storage, email, AI providers, or third-party APIs when separating those implementations makes the application verb transport-independent. Do not create an adapter layer for a single trivial call with no boundary value.
- **`utils.ts` / `utils/`** contains focused, named helpers internal to the capability. It is not a dumping ground for orchestration or a disguised global service layer.
- Keep tests beside the layer they prove. Application tests verify business outcomes and failure reasons; route tests verify validation, middleware, HTTP mapping, and RPC contracts; DAO/integration tests verify transactions, scope, locking, and persistence behavior.

### How to choose the split

Use this order before creating or moving files:

1. **Find the URL owner.** Place the change under the nearest existing business capability that owns the route and data behavior.
2. **Identify a real child resource.** If the URL adds a sub-resource or sub-module, create `routes/<child>/route.ts` and mount it from the parent. For example, mount `interviews/routes/reports/route.ts` with `.route("/:id/reports", reportsRouter)`.
3. **Keep ordinary collection/item CRUD together.** Paths such as `/interviews` and `/interviews/:id` normally remain in the same capability. When that transport surface grows, use descriptive `collection-route.ts`, `detail-route.ts`, or similarly scoped fragments rather than inventing `routes/:id/` folders.
4. **Extract behavior, not line count.** Introduce an application verb when there is a complete business action with its own invariants or reuse boundary. Splitting a large handler into arbitrary helper files without changing dependency direction is not an application boundary.
5. **Keep persistence and integrations behind the verb.** Move DB primitives to the owning DAO and external implementations to focused adapters/dependencies only when the verb needs that seam.

Never create dynamic-segment directories such as `routes/:id/route.ts`; URL parameters stay in the parent's `.route(...)`, `.get(...)`, `.post(...)`, and similar path declarations.

### Handler and application responsibilities

A Hono handler should normally perform only the transport sequence:

1. validate path/query/body input;
2. read the authenticated actor, workspace, permission, and request-scoped values;
3. convert them into the application's explicit input;
4. call a route-owned DAO directly for a simple HTTP-only read/trivial CRUD operation, or call an application verb for non-trivial behavior;
5. map the result or stable application error to an explicit HTTP response.

Do not pass `c`, `c.var`, `Request`, or `Response` into application or DAO code. Extract the minimum values first. Request middleware establishes transport access and scope; the application verb still owns business invariants, state-transition checks, transaction boundaries, and side-effect ordering.

For a mutation that changes related records, emits queue/events, invalidates caches, or writes audit history, keep the entire behavior coherent as one verb. The verb should make workspace/actor scope explicit, perform the state transition atomically where required, and coordinate post-commit side effects deliberately. Add idempotency, optimistic concurrency, audit, or replay protection when the business contract requires them, not as generic ceremony.

### Dependency direction and reuse

Preferred dependency direction:

```text
Hono route / Worker / script
            ↓
     application verb
       ↓           ↓
 route-owned DAO   declared ports
                       ↑
              default adapters/composition
```

- Non-HTTP entrypoints call the same application verb; they do not import a Hono router or simulate an HTTP request.
- New cross-capability mutations call the owning capability's application API instead of reaching into its DAO. Shared read projections may be exported deliberately by the owner when that is the smallest useful boundary.
- Existing cross-route DAO imports may remain until the affected behavior is intentionally extracted. Do not turn a local change into a repository-wide dependency rewrite.
- This convention does not impose one-table-one-module ownership. When a business verb legitimately spans several tables or existing capabilities, preserve that complete verb and its transaction rather than splitting it to satisfy directory ownership.
- Do not create top-level `apps/server/src/server/queries/`, `services/`, `controllers/`, or `repositories/` directories. They flatten business ownership into technical layers. Keep code with the capability that owns the behavior.
- `apps/server/src/server/agents/` and `apps/server/src/server/middlewares/` are intentional root-level shared libraries. Provider integrations shared across routes and runtime adapters live under `apps/server/src/server/integrations/`; the interview-notification workflow shared by the API and Worker lives under `apps/server/src/server/interview-notifications/`. Other root-level sharing requires evidence that it serves multiple capabilities without owning one capability's business workflow.

### Runtime and compatibility guardrails

- Backend route/application/DAO code must remain loadable by the standalone server and must not import app-local `@/` modules, TanStack Start server-function helpers, or browser-only code.
- Web-runtime-only behavior is supplied through a small port from the adapter boundary. Backend routes do not read TanStack Start request primitives directly.
- Preserve route paths, methods, status codes, response payloads, Hono RPC inference, authentication behavior, and database semantics during an organization refactor unless the task explicitly changes that contract.
- Keep inline Hono route declarations where they help RPC inference. If handler construction must be shared, use Hono's typed factory patterns rather than Rails-style controllers detached from their route definitions.
- Prefer explicit dependency objects and small factory functions over a global DI container. Production defaults are composed once; tests pass focused fakes.

### Incremental migration and verification

- Migrate one complete application verb at a time. A good candidate is behavior currently triggered by both HTTP and a Worker/script, or a mutation whose transaction/invariants are obscured by a large route.
- Do not move an entire route tree, rename every DAO, or assign rigid global data ownership as a prerequisite for one extraction.
- Before changing an existing route, inspect its current mount path, middleware ancestry, RPC callers, non-HTTP callers, DAO transaction boundary, and focused tests.
- Verification is complete when the affected application behavior and HTTP mapping have focused tests, the server package typechecks, relevant server tests pass, and the standalone `createServerApp()` boundary still imports. If `AppType` changes, also typecheck the web client that consumes `rpc.api.*`.
- When changing Hono APIs or RPC composition, consult current official Hono documentation rather than relying on remembered signatures.
