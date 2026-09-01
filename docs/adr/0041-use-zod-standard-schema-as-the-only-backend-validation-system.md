# Use Zod Standard Schema as the only backend validation system

`apps/backend` will preserve the project's Zod schemas and use Nest 12 route-decorator schema metadata plus the global `StandardSchemaValidationPipe` for body, query, path-parameter, and raw-body validation. It will not introduce parallel `class-validator` or `class-transformer` DTOs; multipart files and other special transports may use local extraction pipes or interceptors, but their structured fields still cross a Zod validation boundary.
