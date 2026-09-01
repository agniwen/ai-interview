# ARC Nest backend

Standalone Nest 12 application and the forward-looking backend for ARC. Its
initial behavior was migrated additively from `apps/server` and `apps/worker`,
but its module and data boundaries are designed independently; the legacy
applications are not imported or modified by this package.

## Commands

```sh
bun run --filter @app/backend dev
bun run --filter @app/backend typecheck
bun run --filter @app/backend test
bun run --filter @app/backend build
bun run --filter @app/backend openapi
bun run --filter @app/backend openapi:parity
bun run --filter @app/backend smoke:runtimes
bun run --filter @app/backend smoke:runtimes:external
```

Copy `.env.example` to `.env` for a fresh installation. This workspace also
keeps a local, ignored `apps/backend/.env` populated from the compatible values
in `apps/web/.env`; review the empty feature-specific entries before enabling
their workloads.

The production bundle is ESM and runs on Bun 1.4.0. The same artifact can be
started with Node 24 through `start:node`. `Dockerfile` defaults to the Bun
runtime; build target `node-runtime` provides the fallback image. The runtime
smoke command builds once, then boots that exact artifact under both runtimes
and verifies `/system/health/backend/live` plus `/system/health/background/live`.
The external variant additionally requires the configured PostgreSQL and Redis
services, starts background consumers, enqueues a uniquely named meeting-answer
job on a per-runtime isolated queue prefix whose missing exchange makes
processing read-only, and waits for BullMQ to mark it completed. Both modes
require SIGTERM to finish within five seconds;
needing SIGKILL is reported as a failed smoke run.

The backend uses TypeScript 6 for type checking, the static architecture tests,
and the Nest/Rspack production build.

`openapi.json` is deterministic input for Hey API client generation. Regenerate
it whenever a public route or schema changes. The parity command compares all
333 operation IDs and HTTP methods with the pre-route-migration baseline and
exits non-zero for a missing, renamed, or unexpected operation. It also updates
the complete old-to-new route table in
[`migration/http-route-migration.md`](./migration/http-route-migration.md).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the Nest module boundaries and the
recommended mapping from current OpenAPI tags to future frontend API domains.
