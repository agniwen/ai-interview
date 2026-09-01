# Resolve Nest routes by specificity

`apps/backend` will enable Nest 12's specificity-based route resolution so static routes take precedence over parameterized and wildcard routes without relying on controller registration order. Duplicate routes are startup errors, while potentially shadowed routes produce development and CI diagnostics that must be resolved or explicitly covered by the route inventory. Black-box parity remains authoritative: any existing Hono endpoint whose behavior depends on registration order must be represented explicitly rather than allowed to change silently.
