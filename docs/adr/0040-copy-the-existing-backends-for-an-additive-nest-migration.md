# Copy the existing backends for an additive Nest migration

The Nest migration will be additive: implementation needed from `apps/server` and `apps/worker` will be copied into `apps/backend` and adapted there, while files inside the two existing apps remain unchanged. Temporary duplication is accepted so the Hono server and current worker stay deployable and provide an untouched behavioral baseline; the new backend must not import their application source and will be cut over only after independent contract and operational parity checks pass.

The migration may add or change `apps/backend/**`, its own deployment configuration, migration documentation and tests, and the root dependency lockfile. Existing `apps/server/**`, `apps/worker/**`, `apps/web/**`, `apps/desktop/**`, production deployment files, and existing shared-package behavior or exports remain unchanged; `apps/backend` may consume existing `@arc/*` packages read-only and copies any app-owned implementation it still needs.
