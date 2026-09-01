# Use Express for the standalone Nest HTTP platform

`apps/backend` will use Nest 12 with the Express 5 platform adapter. Preserving the existing standalone HTTP contract—especially multipart uploads, Better Auth cookies and redirects, raw streaming responses, and graceful request draining—takes priority over Fastify benchmark performance; choosing Express avoids introducing a second multipart and middleware migration while the framework boundary is already changing.
