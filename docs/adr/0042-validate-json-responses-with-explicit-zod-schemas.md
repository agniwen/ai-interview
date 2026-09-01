# Validate JSON responses with explicit Zod schemas

Every ordinary JSON endpoint in `apps/backend` will declare an explicit Zod response schema and use Nest 12 Standard Schema serialization to validate and shape successful responses. A global exception filter owns the stable error envelope, while SSE, AI data streams, file and binary responses, redirects, and other raw-response routes bypass schema serialization; parity tests must detect any field removed or changed by the stricter response boundary.
