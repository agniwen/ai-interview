# Isolate the Nest toolchain from the workspace TypeScript next version

The workspace catalog tracks the fixed TypeScript 7.1 next build
`7.1.0-dev.20260831.1`. `apps/backend` temporarily overrides that catalog entry
with TypeScript 6.0.3 because the current Nest 12 CLI/Rspack integration cannot
load the TypeScript 7.1 compiler API. This is a build-tool boundary only: the
backend remains strict ESM TypeScript and consumes the same workspace packages.
Remove the package-local override after a Nest CLI release can build the backend
with TypeScript 7.1, and verify typecheck, Rspack build, OpenAPI generation, and
both Bun and Node 24 smoke tests before doing so.
