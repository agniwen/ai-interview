# Publish OpenAPI before generating a Hey API client

`apps/backend` will emit a deterministic OpenAPI document as a versioned build and CI artifact, with a development-only Swagger UI and no frontend client changes in this migration. Hono RPC inference is not reproduced; a later frontend migration will consume the backend specification with Hey API to generate typed SDK, Zod, and TanStack Query integrations, so the specification must be complete and protected against unintended breaking changes before client generation begins.

Every operation will declare a globally unique, domain-oriented `operationId` and stable tag explicitly. Operation identifiers are part of the public compatibility contract: controller or method refactors must not rename generated SDK operations, and CI rejects missing or duplicate identifiers.
