# ARC Nest backend

Standalone Nest 12 application migrated additively from
`apps/server` and `apps/worker`. The legacy applications are not imported or
modified by this package.

## Commands

```sh
bun run --filter @app/backend dev
bun run --filter @app/backend typecheck
bun run --filter @app/backend test
bun run --filter @app/backend build
bun run --filter @app/backend openapi
bun run --filter @app/backend openapi:parity
```

Copy `.env.example` to `.env` for a fresh installation. This workspace also
keeps a local, ignored `apps/backend/.env` populated from the compatible values
in `apps/web/.env`; review the empty feature-specific entries before enabling
their workloads.

The production bundle is ESM and runs on Bun 1.4.0. The same artifact can be
started with Node 24 through `start:node`. `Dockerfile` defaults to the Bun
runtime; build target `node-runtime` provides the fallback image.

The workspace catalog tracks TypeScript 7.1 next. This package temporarily pins
TypeScript 6.0 because the current Nest 12 CLI/Rspack compiler integration does
not yet expose the TypeScript 7.1 compiler API required by `nest build`.

`openapi.json` is deterministic input for a future HeyAPI client generation
step. Regenerate it whenever public route schemas change. The parity command
compares it with the frozen migration inventory and exits non-zero for a missing
or unexpected operation.
