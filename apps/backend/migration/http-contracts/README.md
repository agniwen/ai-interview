# Standalone HTTP contract inventory

`index.json` and the four `part-*.json` shards are the machine-readable migration
baseline for `apps/server` and the diagnostics HTTP surface in `apps/worker`.
Consumers should load the shard names from `index.json`, concatenate each
`contracts` array, and key records by `id` (`METHOD /path`).

Method and path come from Hono's assembled runtime route table, not from filename
conventions. Source, schemas, status codes, transport, and permission metadata are
derived from static inspection. `statusEvidence` distinguishes literal statuses
from Hono's inferred 200 default and opaque Better Auth responses. The generator
has explicit reviewed overrides for twelve otherwise ambiguous root routes; the
checked snapshot has no missing or ambiguous source file.

The inventory intentionally does not expand `/api/auth/*` into Better Auth's
internal endpoint set. That handler remains an opaque protocol boundary and must
be verified with Better Auth integration tests. It also does not pretend that a
Zod request schema is a response schema: `schemas` contains only validators that
could be tied to the route source, while response serialization contracts still
need to be authored during the Nest migration.

## Migration hotspots

- Five SSE/AI streaming routes and eleven binary routes require raw-response
  parity, including headers, backpressure, cancellation, redirects, and range or
  object-storage behavior where applicable.
- Eight multipart routes combine files with structured fields and cannot rely on
  JSON-only Standard Schema validation.
- Better Auth owns both methods under `/api/auth/*`; it must stay ahead of the
  Express body parser and retain its native redirects, cookies, and error format.
- Authentication is not uniform: the inventory includes workspace membership and
  fine-grained permissions, platform admin, candidate/public capabilities, agent
  shared secret, LiveKit signature, session, and diagnostics bearer boundaries.
- Worker readiness is dependency-sensitive and diagnostics are bearer-protected.
  The new `/api/health` and `/api/ready` routes are additions from ADR 0051, not
  existing-contract parity entries.
- Explicit success/error statuses are branch-dependent. Inferred 200 entries must
  be confirmed by black-box parity tests before a controller is considered done.

Regenerate for review from the repository root with:

```sh
bun apps/backend/migration/generate-http-contract-inventory.ts
```

The generator imports the existing assembled Hono app and exits immediately. It
uses non-routable inventory-only defaults for required environment variables;
this is source inventory tooling, not an application startup probe.
